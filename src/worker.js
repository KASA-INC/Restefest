import { DurableObject } from "cloudflare:workers";
import { cleanRepeat, endIso, firstIso, rrule } from "../public/recur.js";
import { parseIcs } from "./ics.js";
import { EVENT_ICON_IDS } from "../public/eventicons.js";
import { makeVapid, sendPush } from "./push.js";
import { changesPayload, cleanPrefs, dueBetween } from "./notify.js";

// Familiekoden er både "rom-navn" og eneste nøkkel – den bør være vanskelig å gjette.
const CODE_RE = /^[a-z0-9æøå-]{6,40}$/;
const LISTS = ["butikk", "oda"]; // faste lister; egne lister ligger i state.lists
const LIST_ID_RE = /^l-[a-z0-9-]{4,40}$/;
const MAX_LISTS = 30;
const MAX_FEEDS = 6;
const FEED_TTL = 10 * 60 * 1000; // hent andre kalendere på nytt etter 10 min
const MAX_ICS_BYTES = 3 * 1024 * 1024;
const WEEK_RE = /^\d{4}-W\d{2}$/;
const MAX_ITEMS = 500;
const MAX_WEEKS = 60;
const MAX_HISTORY = 400;
const MAX_EVENTS = 2000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_SUBS = 40;              // enheter med varsler per familie
const CHANGE_DELAY = 90 * 1000;   // endringer samles i halvannet minutt før de varsles
const LOOKAHEAD = 36 * 3600e3;    // hvor langt fram neste «vekking» planlegges
const DEVICE_RE = /^[a-z0-9-]{8,40}$/;

const normCode = (s) => decodeURIComponent(s).normalize("NFC").trim().toLowerCase();

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    let m;

    // Sanntidssynk: /api/ws/<kode>
    if ((m = url.pathname.match(/^\/api\/ws\/([^/]+)$/))) {
      const code = normCode(m[1]);
      if (!CODE_RE.test(code)) return new Response("Ugyldig familiekode", { status: 400 });
      if (req.headers.get("Upgrade") !== "websocket") {
        return new Response("Forventet WebSocket", { status: 426 });
      }
      return env.FAMILY.get(env.FAMILY.idFromName(code)).fetch(req);
    }

    // Varsler: /api/push/<kode>/(key|sub|unsub|test)
    if ((m = url.pathname.match(/^\/api\/push\/([^/]+)\/(key|sub|unsub|test)$/))) {
      const code = normCode(m[1]);
      if (!CODE_RE.test(code)) return new Response("Ugyldig familiekode", { status: 400 });
      const fam = env.FAMILY.get(env.FAMILY.idFromName(code));
      const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
      if (m[2] === "key") return json({ key: await fam.pushKey() });
      if (req.method !== "POST") return new Response("Bruk POST", { status: 405 });
      let body;
      try { body = await req.json(); } catch { return json({ ok: false }, 400); }
      if (m[2] === "sub") return json(await fam.pushSub(body));
      if (m[2] === "unsub") return json(await fam.pushUnsub(String(body.endpoint || "")));
      return json(await fam.pushTest(String(body.endpoint || "")));
    }

    // Kalenderabonnement: /cal/<kode>.ics (ukemeny) og /cal/<kode>/kalender.ics (avtaler)
    if ((m = url.pathname.match(/^\/cal\/([^/]+?)(\/kalender)?(?:\.ics)?$/))) {
      const code = normCode(m[1]);
      if (!CODE_RE.test(code)) return new Response("Ugyldig familiekode", { status: 400 });
      const kind = m[2] ? "events" : "menu";
      const ics = await env.FAMILY.get(env.FAMILY.idFromName(code)).ics(url.host, kind);
      return new Response(ics, {
        headers: {
          "Content-Type": "text/calendar; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    }

    // Forsiden: gjør OpenGraph-adressene absolutte (delingstjenester krever det).
    // Familiekoden i ?kode=… tas bevisst ikke med i og:url.
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const res = await env.ASSETS.fetch(req);
      if (!res.headers.get("Content-Type")?.includes("text/html")) return res;
      const abs = (attr) => ({
        element(el) {
          const v = el.getAttribute(attr);
          if (v && v.startsWith("/")) el.setAttribute(attr, url.origin + v);
        },
      });
      return new HTMLRewriter()
        .on('meta[property="og:image"]', abs("content"))
        .on('meta[name="twitter:image"]', abs("content"))
        .on('meta[property="og:url"]', abs("content"))
        .transform(res);
    }

    return env.ASSETS.fetch(req);
  },
};

export class Family extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // Svarer på klientens keepalive uten å vekke objektet.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      this.state = (await ctx.storage.get("state")) || { items: [], menu: {} };
      this.state.events ||= [];
      this.state.lists ||= [];
      this.state.feeds ||= [];
      // Forslag (retter/avtaler) som er «glemt» med ×. Selve forslagene lages i appen fra lagrede data.
      this.state.hidden ||= { dish: [], event: [] };
      // Avtaler hentet fra andre kalendere (lagres for seg, sendes med til appen).
      this.ext = (await ctx.storage.get("ext")) || {};
      // Varsler: enheter som har slått på varsler, og endringer som venter på å bli varslet.
      this.subs = (await ctx.storage.get("subs")) || [];
      this.pending = (await ctx.storage.get("pending")) || null;
      if (!this.state.history) {
        // Første gang: bygg historikk fra varene som allerede ligger inne.
        this.state.history = {};
        for (const it of this.state.items) this.remember(it.text, it.list, it.ts);
      }
    });
  }

  async fetch() {
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.send(this.payload());
    this.refreshFeeds();
    return new Response(null, { status: 101, webSocket: client });
  }

  // Det appen får: lagret tilstand + avtaler fra andre kalendere.
  payload() {
    const ext = [];
    const feedInfo = {};
    for (const f of this.state.feeds) {
      const x = this.ext[f.id];
      feedInfo[f.id] = x ? { fetched: x.fetched, error: x.error || "", count: x.events?.length || 0 } : { fetched: 0, error: "", count: 0 };
      for (const e of x?.events || []) ext.push({ ...e, feed: f.id });
    }
    return JSON.stringify({ t: "state", state: { ...this.state, ext, feedInfo } });
  }

  broadcast() {
    const out = this.payload();
    for (const s of this.ctx.getWebSockets()) {
      try { s.send(out); } catch {}
    }
  }

  // Henter andre kalendere som er eldre enn FEED_TTL (eller alle med force).
  async refreshFeeds(force = false) {
    const due = this.state.feeds.filter((f) => force || !this.ext[f.id] || Date.now() - this.ext[f.id].fetched > FEED_TTL);
    if (!due.length || this.fetching) return;
    this.fetching = true;
    try {
      const now = Date.now();
      await Promise.all(due.map(async (f) => {
        const prev = this.ext[f.id];
        try {
          const res = await fetch(f.url, { headers: { "User-Agent": "Uka-kalender/1.0", Accept: "text/calendar,*/*" } });
          if (!res.ok) throw new Error(`Svarte ${res.status}`);
          const text = await res.text();
          if (text.length > MAX_ICS_BYTES) throw new Error("Kalenderen er for stor");
          if (!text.includes("BEGIN:VCALENDAR")) throw new Error("Lenken er ikke en kalender (.ics)");
          const events = parseIcs(text, now - 31 * 864e5, now + 366 * 864e5);
          this.ext[f.id] = { fetched: now, events };
        } catch (e) {
          // Behold forrige vellykkede henting, men vis feilen.
          this.ext[f.id] = { fetched: now, events: prev?.events || [], error: String(e.message || e).slice(0, 120) };
        }
      }));
      for (const id of Object.keys(this.ext)) if (!this.state.feeds.some((f) => f.id === id)) delete this.ext[id];
      await this.ctx.storage.put("ext", this.ext);
      this.broadcast();
      await this.schedule();
    } finally {
      this.fetching = false;
    }
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.t === "feedRefresh") return void this.refreshFeeds(!!msg.force);
    if (msg.t === "hello") {
      if (DEVICE_RE.test(msg.device)) ws.serializeAttachment({ device: msg.device });
      return;
    }
    if (!this.apply(msg)) return;
    await this.ctx.storage.put("state", this.state);
    this.broadcast();
    if (this.subs.length) {
      await this.noteChange(msg, ws);
      await this.schedule(); // avtaler/ukemeny kan ha endret seg
    }
    if (msg.t === "feedAdd") this.refreshFeeds();
  }

  webSocketClose(ws, code) {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code);
    } catch {}
  }

  webSocketError(ws) {
    try {
      ws.close(1011);
    } catch {}
  }

  apply(msg) {
    const st = this.state;
    const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
    const find = (id) => st.items.find((i) => i.id === id);

    switch (msg.t) {
      case "add": {
        const text = str(msg.text, 200);
        const okList = LISTS.includes(msg.list) || st.lists.some((l) => l.id === msg.list);
        if (!text || !okList || st.items.length >= MAX_ITEMS) return false;
        st.items.push({ id: crypto.randomUUID(), text, list: msg.list, done: false, ts: Date.now() });
        this.remember(text, msg.list);
        return true;
      }
      case "hide": {
        const kind = msg.kind === "dish" ? "dish" : msg.kind === "event" ? "event" : null;
        const key = str(msg.text, 200).toLowerCase();
        if (!kind || !key || st.hidden[kind].includes(key)) return false;
        st.hidden[kind] = [...st.hidden[kind], key].slice(-300);
        return true;
      }
      case "forget": {
        const key = str(msg.text, 200).toLowerCase();
        if (!st.history[key]) return false;
        delete st.history[key];
        return true;
      }
      case "toggle": {
        const it = find(msg.id);
        if (!it) return false;
        it.done = !!msg.done;
        it.ts = Date.now();
        return true;
      }
      case "edit": {
        const it = find(msg.id);
        const text = str(msg.text, 200);
        if (!it || !text) return false;
        it.text = text;
        return true;
      }
      case "del": {
        const n = st.items.length;
        st.items = st.items.filter((i) => i.id !== msg.id);
        return st.items.length !== n;
      }
      case "clear": {
        const n = st.items.length;
        st.items = st.items.filter((i) => !(i.list === msg.list && i.done));
        return st.items.length !== n;
      }
      // Egne lister (ønskelister o.l.)
      case "listAdd": {
        const name = str(msg.name, 40);
        if (!name || !LIST_ID_RE.test(msg.id) || st.lists.some((l) => l.id === msg.id) || st.lists.length >= MAX_LISTS) return false;
        st.lists.push({ id: msg.id, name });
        return true;
      }
      case "listRename": {
        const l = st.lists.find((x) => x.id === msg.id);
        const name = str(msg.name, 40);
        if (!l || !name) return false;
        l.name = name;
        return true;
      }
      case "listDel": {
        if (!st.lists.some((l) => l.id === msg.id)) return false;
        st.lists = st.lists.filter((l) => l.id !== msg.id);
        st.items = st.items.filter((i) => i.list !== msg.id);
        return true;
      }

      // Andre kalendere (iCloud, Google, Spond via iCloud/Google, skole …)
      case "feedAdd": {
        const name = str(msg.name, 40);
        let url = str(msg.url, 2000).replace(/^webcals?:\/\//i, "https://");
        if (!name || st.feeds.length >= MAX_FEEDS) return false;
        try {
          const u = new URL(url);
          if (!/^https?:$/.test(u.protocol)) return false;
          url = u.href;
        } catch {
          return false;
        }
        st.feeds.push({ id: crypto.randomUUID(), name, url });
        return true;
      }
      case "feedDel": {
        const n = st.feeds.length;
        st.feeds = st.feeds.filter((f) => f.id !== msg.id);
        delete this.ext[msg.id];
        return st.feeds.length !== n;
      }

      case "evAdd":
      case "evEdit": {
        const title = str(msg.title, 200);
        const date = str(msg.date, 10);
        const time = str(msg.time, 5);
        if (!title || !DATE_RE.test(date) || (time && !TIME_RE.test(time))) return false;
        // Sluttid bare hvis det er en starttid og den er senere enn den.
        let end = str(msg.end, 5);
        if (!time || !TIME_RE.test(end) || end <= time) end = "";
        // Bursdag: heldag, hvert år, med fødselsår hvis det er kjent.
        const bday = msg.kind === "bday";
        const bornYear = Number(msg.born);
        st.hidden.event = st.hidden.event.filter((k) => k !== title.toLowerCase()); // brukt igjen = vis igjen
        const repeat = bday ? { freq: "yearly", dur: "inf" } : cleanRepeat(msg.repeat, date);
        const data = bday ? { title, date, time: "", end: "", ts: Date.now(), kind: "bday" } : { title, date, time, end, ts: Date.now() };
        if (bday && Number.isInteger(bornYear) && bornYear >= 1900 && bornYear <= new Date().getFullYear()) data.born = bornYear;
        if (repeat) data.repeat = repeat;
        if (!bday && EVENT_ICON_IDS.has(msg.icon)) data.icon = msg.icon;
        if (msg.t === "evEdit") {
          const ev = st.events.find((e) => e.id === msg.id);
          if (!ev) return false;
          delete ev.repeat;
          delete ev.kind;
          delete ev.born;
          delete ev.icon;
          Object.assign(ev, data);
        } else {
          // Rydd bort avtaler som var ferdige for over ett år siden.
          const cutoff = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
          st.events = st.events.filter((e) => {
            if (!e.repeat) return e.date >= cutoff;
            const end = endIso(e);
            return !end || end >= cutoff;
          });
          if (st.events.length >= MAX_EVENTS) return false;
          st.events.push({ id: crypto.randomUUID(), ...data });
        }
        return true;
      }
      case "evDel": {
        const n = st.events.length;
        st.events = st.events.filter((e) => e.id !== msg.id);
        return st.events.length !== n;
      }
      case "menu": {
        const day = Number(msg.day);
        if (!WEEK_RE.test(msg.week) || !Number.isInteger(day) || day < 0 || day > 6) return false;
        const dish = str(msg.dish, 200);
        let link = str(msg.link, 1000);
        if (link && !/^https?:\/\//i.test(link)) link = "https://" + link;
        if (dish) st.hidden.dish = st.hidden.dish.filter((k) => k !== dish.toLowerCase()); // brukt igjen = vis igjen
        const week = (st.menu[msg.week] ||= {});
        if (dish || link) week[day] = { dish, link };
        else delete week[day];
        if (!Object.keys(week).length) delete st.menu[msg.week];
        const keys = Object.keys(st.menu).sort();
        while (keys.length > MAX_WEEKS) delete st.menu[keys.shift()];
        return true;
      }
    }
    return false;
  }

  // Husker tidligere varer for autoutfylling: antall ganger brukt, sist brukt og liste.
  remember(text, list, ts = Date.now()) {
    const h = this.state.history;
    const key = text.toLowerCase();
    const prev = h[key];
    h[key] = { text, list, n: (prev?.n || 0) + 1, ts };
    const keys = Object.keys(h);
    if (keys.length > MAX_HISTORY) {
      keys.sort((a, b) => h[a].n - h[b].n || h[a].ts - h[b].ts);
      for (const k of keys.slice(0, keys.length - MAX_HISTORY)) delete h[k];
    }
  }

  // ---------- Varsler ----------
  async vapid() {
    if (!this.vapidKeys) this.vapidKeys = (await this.ctx.storage.get("vapid")) || null;
    if (!this.vapidKeys) {
      this.vapidKeys = await makeVapid();
      await this.ctx.storage.put("vapid", this.vapidKeys);
    }
    return this.vapidKeys;
  }

  async pushKey() {
    return (await this.vapid()).pub;
  }

  // Lagrer (eller oppdaterer) en enhets abonnement og valg.
  async pushSub({ sub, prefs, device } = {}) {
    const endpoint = String(sub?.endpoint || "");
    const p256dh = String(sub?.keys?.p256dh || "");
    const auth = String(sub?.keys?.auth || "");
    try {
      if (new URL(endpoint).protocol !== "https:" || endpoint.length > 1000) return { ok: false };
    } catch {
      return { ok: false };
    }
    if (!/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,30}$/.test(auth)) return { ok: false };
    let s = this.subs.find((x) => x.endpoint === endpoint);
    if (!s) {
      if (this.subs.length >= MAX_SUBS) this.subs.sort((a, b) => a.seen - b.seen).shift();
      s = { id: crypto.randomUUID(), endpoint, sent: {}, created: Date.now() };
      this.subs.push(s);
    }
    Object.assign(s, { keys: { p256dh, auth }, prefs: cleanPrefs(prefs), device: DEVICE_RE.test(device) ? device : "", seen: Date.now() });
    await this.saveSubs();
    await this.schedule();
    return { ok: true, prefs: s.prefs };
  }

  async pushUnsub(endpoint) {
    const n = this.subs.length;
    this.subs = this.subs.filter((s) => s.endpoint !== endpoint);
    if (this.subs.length !== n) { await this.saveSubs(); await this.schedule(); }
    return { ok: true };
  }

  async pushTest(endpoint) {
    const s = this.subs.find((x) => x.endpoint === endpoint);
    if (!s) return { ok: false, status: 404 };
    const status = await this.push(s, { title: "Varsler er på", body: "Slik ser varslene fra Uka ut.", tag: "test", url: "/" }, { ttl: 600, urgency: "high" });
    return { ok: status >= 200 && status < 300, status };
  }

  async saveSubs() {
    await this.ctx.storage.put("subs", this.subs);
  }

  // Sender til én enhet og rydder bort abonnementer nettleseren har avsluttet.
  async push(s, payload, opts) {
    const status = await sendPush(s, payload, await this.vapid(), opts);
    if (status === 404 || status === 410) {
      this.subs = this.subs.filter((x) => x !== s);
      await this.saveSubs();
    }
    return status;
  }

  // Noen la til en vare eller en avtale: samles opp og varsles til de andre etter en liten stund.
  async noteChange(msg, ws) {
    const device = (() => { try { return ws.deserializeAttachment()?.device || ""; } catch { return ""; } })();
    let change = null;
    if (msg.t === "add") {
      const it = this.state.items[this.state.items.length - 1];
      if (it) change = { kind: "item", text: it.text, list: it.list, device };
    } else if (msg.t === "evAdd") {
      const ev = this.state.events[this.state.events.length - 1];
      if (ev && ev.kind !== "bday") change = { kind: "event", title: ev.title, date: ev.date, time: ev.time, device };
    }
    if (!change || !this.subs.some((s) => s.prefs.changes)) return;
    this.pending ||= { at: Date.now() + CHANGE_DELAY, changes: [] };
    if (this.pending.changes.length < 60) this.pending.changes.push(change);
    await this.ctx.storage.put("pending", this.pending);
  }

  extEvents() {
    const out = [];
    for (const f of this.state.feeds) for (const e of this.ext[f.id]?.events || []) out.push({ ...e, feed: f.id });
    return out;
  }

  // Setter «vekkerklokka» til neste varsel (eller fjerner den når ingen har varsler).
  async schedule() {
    if (!this.subs.length) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    const now = Date.now();
    const next = dueBetween(this.state, this.extEvents(), this.subs, now, now + LOOKAHEAD)[0]?.at;
    let at = Math.min(next ?? Infinity, this.pending?.at ?? Infinity, now + LOOKAHEAD);
    at = Math.max(at, now + 1000);
    const cur = await this.ctx.storage.getAlarm();
    if (cur !== at) await this.ctx.storage.setAlarm(at);
  }

  async alarm() {
    const now = Date.now();
    // Sjekk fra forrige gang, men aldri mer enn 15 min bakover (ingen gamle varsler etter en pause).
    const from = Math.max((await this.ctx.storage.get("lastCheck")) || now - 60e3, now - 15 * 60e3);
    const due = dueBetween(this.state, this.extEvents(), this.subs, from, now + 500);
    const sends = [];
    for (const d of due) {
      const s = this.subs.find((x) => x.id === d.subId);
      if (!s || s.sent[d.key]) continue;
      s.sent[d.key] = now;
      sends.push(this.push(s, d.payload, d.opts));
    }
    if (this.pending && this.pending.at <= now + 500) {
      for (const s of this.subs) {
        if (!s.prefs.changes) continue;
        const mine = this.pending.changes.filter((c) => !s.device || c.device !== s.device);
        const payload = changesPayload(this.state, mine);
        if (payload) sends.push(this.push(s, payload, { ttl: 6 * 3600 }));
      }
      this.pending = null;
      await this.ctx.storage.delete("pending");
    }
    await Promise.all(sends);
    // Glem «sendt»-merker eldre enn tre døgn.
    for (const s of this.subs) for (const [k, t] of Object.entries(s.sent)) if (now - t > 3 * 864e5) delete s.sent[k];
    await this.saveSubs();
    await this.ctx.storage.put("lastCheck", now);
    await this.schedule();
  }

  // RPC fra worker: lager iCalendar-feed av ukemenyen eller avtalene.
  ics(host, kind = "menu") {
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Uka//Familie//NO",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${kind === "menu" ? "Uka – middag" : "Uka – kalender"}`,
      "X-WR-TIMEZONE:Europe/Oslo",
      "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
      "X-PUBLISHED-TTL:PT1H",
    ];
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const allDay = (uid, date, summary, extra = []) => {
      const end = new Date(date.getTime() + 864e5);
      lines.push("BEGIN:VEVENT", `UID:${uid}@${host}`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${ymd(date)}`, `DTEND;VALUE=DATE:${ymd(end)}`,
        `SUMMARY:${esc(summary)}`, "TRANSP:TRANSPARENT", ...extra, "END:VEVENT");
    };

    if (kind === "menu") {
      for (const [week, days] of Object.entries(this.state.menu)) {
        const monday = isoWeekMonday(week);
        for (const [d, { dish, link }] of Object.entries(days)) {
          if (!dish) continue;
          const extra = link ? [`URL:${esc(link)}`, `DESCRIPTION:${esc("Oppskrift: " + link)}`] : [];
          allDay(`${week}-${d}`, new Date(monday.getTime() + Number(d) * 864e5), "🍽 " + dish, extra);
        }
      }
    } else {
      lines.push(...OSLO_TZ);
      for (const ev of this.state.events) {
        // Gjentakende avtaler starter på første dato de faktisk skjer.
        const date = ev.repeat ? firstIso(ev) : ev.date;
        const rule = ev.repeat ? [rrule(ev, !!ev.time)] : [];
        if (!ev.time) {
          const title = ev.kind === "bday" ? `🎂 ${ev.title} har bursdag${ev.born ? ` (f. ${ev.born})` : ""}` : ev.title;
          allDay(ev.id, new Date(date + "T00:00:00Z"), title, rule);
          continue;
        }
        // Uten sluttid varer avtalen én time.
        const [h, mi] = ev.time.split(":").map(Number);
        const d = date.replace(/-/g, "");
        const pad = (n) => String(n).padStart(2, "0");
        let endDate = d;
        let endHm;
        if (ev.end) endHm = ev.end.replace(":", "");
        else if (h === 23) {
          endDate = ymd(new Date(new Date(date + "T00:00:00Z").getTime() + 864e5));
          endHm = `00${pad(mi)}`;
        } else endHm = `${pad(h + 1)}${pad(mi)}`;
        lines.push("BEGIN:VEVENT", `UID:${ev.id}@${host}`, `DTSTAMP:${stamp}`,
          `DTSTART;TZID=Europe/Oslo:${d}T${pad(h)}${pad(mi)}00`,
          `DTEND;TZID=Europe/Oslo:${endDate}T${endHm}00`,
          ...rule, `SUMMARY:${esc(ev.title)}`, "END:VEVENT");
      }
    }
    lines.push("END:VCALENDAR");
    return lines.map(fold).join("\r\n") + "\r\n";
  }
}

const OSLO_TZ = [
  "BEGIN:VTIMEZONE", "TZID:Europe/Oslo",
  "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST",
  "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
  "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET",
  "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
  "END:VTIMEZONE",
];

function isoWeekMonday(key) {
  const [y, w] = key.split("-W").map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const dow = jan4.getUTCDay() || 7;
  return new Date(Date.UTC(y, 0, 4 - dow + 1 + (w - 1) * 7));
}

const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
const esc = (s) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// RFC 5545: linjer maks 75 oktetter, fortsettelse starter med mellomrom.
function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    const limit = parts.length ? 74 : 75;
    if (bytes + b > limit) {
      parts.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}
