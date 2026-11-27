import { DurableObject } from "cloudflare:workers";
import { cleanRepeat, endIso, firstIso, rrule } from "../public/recur.js";
import { parseIcs } from "./ics.js";
import { EVENT_ICON_IDS } from "../public/eventicons.js";
import { makeVapid, sendPush } from "./push.js";
import { changesPayload, cleanPrefs, dueBetween } from "./notify.js";
import { isSkattUrl, skattEvents, skattIcs, skattKinds } from "./skatt.js";
import { forecast, nearestPlace, roundCoord, searchPlace } from "./weather.js";
import { minutes, recipeFrom } from "../public/restefest/les-oppskrift.js";
import { keysFromLine } from "../public/restefest/ingredienser.js";

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
const PROFILE_RE = /^p-[a-z0-9-]{4,40}$/;
const SEED_RE = /^[a-z0-9]{4,24}$/;
const MAX_PROFILES = 12;
const MAX_RECIPES = 400; // familiens egne oppskrifter (fra lenker i ukemenyen og Restefest)
// Profilbilder: DiceBear «Lorelei» av Lisa Wischofsky (CC0) på lyse, varme bakgrunner fra appens palett.
// Frøet er tilfeldig – navn sendes aldri til DiceBear.
const AVATAR_STYLE = "lorelei";
const AVATAR_COLORS = "f6e2d3,efd9bf,e9d2bd,dde3cf,f3dcae,ecd0c4";

const normCode = (s) => decodeURIComponent(s).normalize("NFC").trim().toLowerCase();

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    let m;

    // Vær: /api/weather?lat=..&lon=..  (dagsoversikt fra MET, mellomlagret)
    if (url.pathname === "/api/weather") {
      const lat = roundCoord(url.searchParams.get("lat")), lon = roundCoord(url.searchParams.get("lon"));
      if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) return new Response("Ugyldig posisjon", { status: 400 });
      try {
        return await forecast(lat, lon, ctx);
      } catch {
        return new Response(JSON.stringify({ days: [] }), { status: 502, headers: { "Content-Type": "application/json" } });
      }
    }
    // Familiens oppskrifter: GET /api/recipes/<kode> (liste), POST {url} (les inn én oppskrift fra lenken)
    if ((m = url.pathname.match(/^\/api\/recipes\/([^/]+)$/))) {
      const code = normCode(m[1]);
      if (!CODE_RE.test(code)) return new Response("Ugyldig familiekode", { status: 400 });
      const fam = env.FAMILY.get(env.FAMILY.idFromName(code));
      const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
      if (req.method === "POST") {
        let body;
        try { body = await req.json(); } catch { return json({ ok: false, error: "Ugyldig forespørsel" }, 400); }
        return json(await fam.recipeImport(String(body.url || "")));
      }
      return json({ recipes: await fam.recipesList() });
    }
    // Profilbilde: /api/avatar/<stil>/<frø>.svg (mellomlagret, endres aldri – ny stil = ny adresse)
    if ((m = url.pathname.match(/^\/api\/avatar\/lorelei\/([a-z0-9]{4,24})\.svg$/))) {
      const cache = caches.default;
      const key = new Request(url.origin + url.pathname);
      let res = await cache.match(key);
      if (!res) {
        const r = await fetch(`https://api.dicebear.com/11.x/${AVATAR_STYLE}/svg?seed=${m[1]}&backgroundColor=${AVATAR_COLORS}`);
        if (!r.ok) return new Response("Fant ikke bildet", { status: 502 });
        res = new Response(await r.text(), { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=31536000, immutable" } });
        ctx.waitUntil(cache.put(key, res.clone()));
      }
      return res;
    }
    // Stedssøk: /api/place?q=Bryne  eller  /api/place?lat=..&lon=.. (nærmeste sted)
    if (url.pathname === "/api/place") {
      const json = (v) => new Response(JSON.stringify(v), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=86400" } });
      const q = (url.searchParams.get("q") || "").trim().slice(0, 60);
      if (q) return json(await searchPlace(q).catch(() => []));
      const lat = roundCoord(url.searchParams.get("lat")), lon = roundCoord(url.searchParams.get("lon"));
      if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) return json({ name: "" });
      return json({ name: await nearestPlace(lat, lon), lat, lon });
    }

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

    // Frister fra Skatteetaten som kalender: /skatt.ics?k=person,enk,mva
    if (url.pathname === "/skatt.ics") {
      try {
        const ics = skattIcs(await skattEvents(skattKinds(url.href)), url.host);
        return new Response(ics.split("\r\n").map(fold).join("\r\n"), {
          headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "public, max-age=21600" },
        });
      } catch (e) {
        return new Response("Kunne ikke hente fristene fra Skatteetaten", { status: 502 });
      }
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
      this.state.profiles ||= [];
      this.state.recipes ||= []; // oppskrifter familien har lenket til: { url, title, image, time, keys, host, ts } // profiler i familien (uten innlogging – man velger selv hvem man er)
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
          // Skatteetaten-frister hentes direkte (ikke via vår egen /skatt.ics-adresse).
          if (isSkattUrl(f.url)) {
            this.ext[f.id] = { fetched: now, events: await skattEvents(skattKinds(f.url), now - 31 * 864e5, now + 366 * 864e5) };
            return;
          }
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
      ws.serializeAttachment({ device: DEVICE_RE.test(msg.device) ? msg.device : "", profile: PROFILE_RE.test(msg.profile) ? msg.profile : "" });
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
    if (msg.t === "menu" && msg.link) this.recipeImport(String(msg.link)); // les inn oppskriften i bakgrunnen
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
      // Ingredienser fra en oppskrift: legges samlet, merket med retten de hører til (vises gruppert i listen).
      case "addMany": {
        const okList = LISTS.includes(msg.list) || st.lists.some((l) => l.id === msg.list);
        const title = str(msg.group?.title, 80);
        const url = /^https?:\/\//.test(msg.group?.url || "") ? str(msg.group.url, 500) : "";
        const texts = Array.isArray(msg.texts) ? msg.texts.map((t) => str(t, 200)).filter(Boolean).slice(0, 60) : [];
        if (!okList || !title || !texts.length) return false;
        let n = 0;
        for (const text of texts) {
          if (st.items.length >= MAX_ITEMS) break;
          const key = text.toLowerCase();
          const ex = st.items.find((i) => i.list === msg.list && i.text.toLowerCase() === key);
          if (ex && !ex.done) continue; // står allerede på listen
          if (ex) { ex.done = false; ex.ts = Date.now(); ex.for = { title, url }; n++; continue; }
          st.items.push({ id: crypto.randomUUID(), text, list: msg.list, done: false, ts: Date.now(), for: { title, url } });
          this.remember(text, msg.list);
          n++;
        }
        msg.added = n;
        return n > 0;
      }
      // Fjern alle varene som hører til en rett (som ikke er handlet ennå).
      case "delGroup": {
        const title = str(msg.title, 80);
        const n = st.items.length;
        st.items = st.items.filter((i) => !(i.list === msg.list && !i.done && i.for?.title === title));
        return st.items.length !== n;
      }
      // Løsne en vare fra retten den hørte til.
      case "ungroup": {
        const it = find(msg.id);
        if (!it?.for) return false;
        delete it.for;
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
      // Egne lister (ønskelister o.l.). Med `owner` er listen privat for en profil.
      case "listAdd": {
        const name = str(msg.name, 40);
        if (!name || !LIST_ID_RE.test(msg.id) || st.lists.some((l) => l.id === msg.id) || st.lists.length >= MAX_LISTS) return false;
        const l = { id: msg.id, name };
        if (st.profiles.some((p) => p.id === msg.owner)) l.owner = msg.owner;
        st.lists.push(l);
        return true;
      }
      case "listOwner": {
        const l = st.lists.find((x) => x.id === msg.id);
        if (!l) return false;
        if (msg.owner && st.profiles.some((p) => p.id === msg.owner)) l.owner = msg.owner;
        else delete l.owner;
        return true;
      }

      // Profiler
      case "profileAdd": {
        const name = str(msg.name, 30);
        if (!name || !PROFILE_RE.test(msg.id) || !SEED_RE.test(msg.seed) || st.profiles.some((p) => p.id === msg.id) || st.profiles.length >= MAX_PROFILES) return false;
        st.profiles.push({ id: msg.id, name, seed: msg.seed });
        return true;
      }
      case "profileEdit": {
        const p = st.profiles.find((x) => x.id === msg.id);
        const name = str(msg.name, 30);
        if (!p || !name) return false;
        p.name = name;
        if (SEED_RE.test(msg.seed)) p.seed = msg.seed;
        return true;
      }
      case "profileDel": {
        if (!st.profiles.some((p) => p.id === msg.id)) return false;
        st.profiles = st.profiles.filter((p) => p.id !== msg.id);
        for (const l of st.lists) if (l.owner === msg.id) delete l.owner; // private lister blir felles, ingenting slettes
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
      // Sted for værvarselet (felles for familien)
      case "place": {
        if (msg.place === null) { const had = !!st.place; delete st.place; return had; }
        const name = str(msg.place?.name, 60);
        const lat = Math.round(Number(msg.place?.lat) * 100) / 100, lon = Math.round(Number(msg.place?.lon) * 100) / 100;
        if (!name || !(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) return false;
        st.place = { name, lat, lon };
        return true;
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

  // ---------- Familiens oppskrifter ----------
  // Leser én oppskriftsside (som en nettleser) og tar vare på tittel, bilde, tid og ingredienser i grunnform,
  // så Restefest kan søke i oppskriftene familien faktisk bruker. Fremgangsmåten lagres ikke.
  async recipeImport(link) {
    let url;
    try {
      url = new URL(/^https?:\/\//i.test(link) ? link : "https://" + link);
      if (!/^https?:$/.test(url.protocol)) throw 0;
    } catch {
      return { ok: false, error: "Ugyldig lenke" };
    }
    url.hash = "";
    if (/(^|\.)uka-app\.no$/.test(url.hostname)) return { ok: false, error: "Oppskriften ligger allerede i Restefest" }; // våre egne (TheMealDB)
    const href = url.href;
    const have = this.state.recipes.find((r) => r.url === href);
    if (have) return { ok: true, recipe: have };
    this.recipeTried ||= new Map();
    if (Date.now() - (this.recipeTried.get(href) || 0) < 6 * 3600e3) return { ok: false, error: "Fant ingen oppskrift på siden" };
    this.recipeTried.set(href, Date.now());
    try {
      const res = await fetch(href, { headers: { "User-Agent": "Mozilla/5.0 (compatible; Uka/1.0; +https://uka-app.no)", Accept: "text/html" }, redirect: "follow" });
      if (!res.ok) return { ok: false, error: `Siden svarte ${res.status}` };
      const html = (await res.text()).slice(0, 3_000_000);
      const r = recipeFrom(html, href);
      if (!r) return { ok: false, error: "Fant ingen oppskrift på siden" };
      const keys = [...new Set(r.ingredients.flatMap(keysFromLine))];
      const recipe = { url: href, title: r.title.slice(0, 200), image: String(r.image || "").slice(0, 500), time: minutes(r.time), keys: keys.slice(0, 60), host: url.hostname.replace(/^www\./, ""), ts: Date.now() };
      if (this.state.recipes.some((x) => x.url === href)) return { ok: true, recipe };
      this.state.recipes.push(recipe);
      if (this.state.recipes.length > MAX_RECIPES) this.state.recipes.splice(0, this.state.recipes.length - MAX_RECIPES);
      await this.ctx.storage.put("state", this.state);
      this.broadcast();
      return { ok: true, recipe };
    } catch {
      return { ok: false, error: "Kunne ikke hente siden" };
    }
  }

  // Liste til Restefest. Lenker i ukemenyen som ikke er lest inn ennå, leses inn i bakgrunnen (noen om gangen).
  recipesList() {
    const known = new Set(this.state.recipes.map((r) => r.url));
    const links = [];
    for (const days of Object.values(this.state.menu)) for (const d of Object.values(days)) if (d.link && !known.has(d.link)) links.push(d.link);
    (async () => { for (const l of links.slice(0, 5)) await this.recipeImport(l); })();
    return this.state.recipes;
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
    const att = (() => { try { return ws.deserializeAttachment() || {}; } catch { return {}; } })();
    const device = att.device || "";
    const who = this.state.profiles.find((p) => p.id === att.profile)?.name || "";
    let change = null;
    if (msg.t === "add") {
      const it = this.state.items[this.state.items.length - 1];
      const priv = this.state.lists.find((l) => l.id === it?.list)?.owner;
      if (it && !priv) change = { kind: "item", text: it.text, list: it.list, device, who }; // private lister varsles ikke
    } else if (msg.t === "addMany") {
      const priv = this.state.lists.find((l) => l.id === msg.list)?.owner;
      const title = String(msg.group?.title || "").slice(0, 80);
      if (!priv && msg.added) change = { kind: "item", text: `${msg.added} ${msg.added === 1 ? "vare" : "varer"} til «${title}»`, list: msg.list, device, who };
    } else if (msg.t === "evAdd") {
      const ev = this.state.events[this.state.events.length - 1];
      if (ev && ev.kind !== "bday") change = { kind: "event", title: ev.title, date: ev.date, time: ev.time, device, who };
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
