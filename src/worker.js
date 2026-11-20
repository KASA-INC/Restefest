import { DurableObject } from "cloudflare:workers";

// Familiekoden er både "rom-navn" og eneste nøkkel – den bør være vanskelig å gjette.
const CODE_RE = /^[a-z0-9æøå-]{6,40}$/;
const LISTS = ["butikk", "oda"];
const WEEK_RE = /^\d{4}-W\d{2}$/;
const MAX_ITEMS = 500;
const MAX_WEEKS = 60;
const MAX_HISTORY = 400;

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

    // Kalenderabonnement: /cal/<kode>.ics
    if ((m = url.pathname.match(/^\/cal\/([^/]+?)(?:\.ics)?$/))) {
      const code = normCode(m[1]);
      if (!CODE_RE.test(code)) return new Response("Ugyldig familiekode", { status: 400 });
      const ics = await env.FAMILY.get(env.FAMILY.idFromName(code)).ics(url.host);
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
    server.send(JSON.stringify({ t: "state", state: this.state }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!this.apply(msg)) return;
    await this.ctx.storage.put("state", this.state);
    const out = JSON.stringify({ t: "state", state: this.state });
    for (const s of this.ctx.getWebSockets()) {
      try {
        s.send(out);
      } catch {}
    }
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
        if (!text || !LISTS.includes(msg.list) || st.items.length >= MAX_ITEMS) return false;
        st.items.push({ id: crypto.randomUUID(), text, list: msg.list, done: false, ts: Date.now() });
        this.remember(text, msg.list);
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
      case "menu": {
        const day = Number(msg.day);
        if (!WEEK_RE.test(msg.week) || !Number.isInteger(day) || day < 0 || day > 6) return false;
        const dish = str(msg.dish, 200);
        let link = str(msg.link, 1000);
        if (link && !/^https?:\/\//i.test(link)) link = "https://" + link;
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

  // RPC fra worker: lager iCalendar-feed av ukemenyen.
  ics(host) {
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Handleliste//Ukemeny//NO",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Middag",
      "X-WR-TIMEZONE:Europe/Oslo",
      "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
      "X-PUBLISHED-TTL:PT1H",
    ];
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    for (const [week, days] of Object.entries(this.state.menu)) {
      const monday = isoWeekMonday(week);
      for (const [d, { dish, link }] of Object.entries(days)) {
        if (!dish) continue;
        const start = new Date(monday.getTime() + Number(d) * 864e5);
        const end = new Date(start.getTime() + 864e5);
        lines.push(
          "BEGIN:VEVENT",
          `UID:${week}-${d}@${host}`,
          `DTSTAMP:${stamp}`,
          `DTSTART;VALUE=DATE:${ymd(start)}`,
          `DTEND;VALUE=DATE:${ymd(end)}`,
          `SUMMARY:${esc("🍽 " + dish)}`,
          "TRANSP:TRANSPARENT"
        );
        if (link) lines.push(`URL:${esc(link)}`, `DESCRIPTION:${esc("Oppskrift: " + link)}`);
        lines.push("END:VEVENT");
      }
    }
    lines.push("END:VCALENDAR");
    return lines.map(fold).join("\r\n") + "\r\n";
  }
}

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
