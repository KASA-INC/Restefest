import { DurableObject } from "cloudflare:workers";
import { cleanRepeat, endIso, firstIso, rrule } from "../public/recur.js";
import { parseIcs } from "./ics.js";

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
          const res = await fetch(f.url, { headers: { "User-Agent": "Handleliste-kalender/1.0", Accept: "text/calendar,*/*" } });
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
    if (!this.apply(msg)) return;
    await this.ctx.storage.put("state", this.state);
    this.broadcast();
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
        st.hidden.event = st.hidden.event.filter((k) => k !== title.toLowerCase()); // brukt igjen = vis igjen
        const repeat = cleanRepeat(msg.repeat, date);
        const data = { title, date, time, end, ts: Date.now() };
        if (repeat) data.repeat = repeat;
        if (msg.t === "evEdit") {
          const ev = st.events.find((e) => e.id === msg.id);
          if (!ev) return false;
          delete ev.repeat;
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

  // RPC fra worker: lager iCalendar-feed av ukemenyen eller avtalene.
  ics(host, kind = "menu") {
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Handleliste//Familie//NO",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${kind === "menu" ? "Middag" : "Familiekalender"}`,
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
          allDay(ev.id, new Date(date + "T00:00:00Z"), ev.title, rule);
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
