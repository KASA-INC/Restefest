// Leser iCalendar-feeder (.ics) fra andre kalendere – f.eks. en iCloud- eller
// Google-kalender som Spond synkroniserer til – og gjør dem om til enkle
// avtaler i norsk tid: { title, date: "YYYY-MM-DD", time: "HH:MM" | "", end: "HH:MM" | "" }.
//
// Støtter tidssoner (TZID / UTC / flytende), heldagsavtaler over flere dager,
// enkle gjentakelser (RRULE: DAILY/WEEKLY/MONTHLY/YEARLY med INTERVAL, BYDAY,
// UNTIL, COUNT), EXDATE, endrede enkeltforekomster (RECURRENCE-ID) og avlyste avtaler.

const OSLO = "Europe/Oslo";
const DAY = 864e5;
const MAX_OUT = 1500;

// ---------- Tidssoner ----------
const fmtCache = {};
function parts(ms, tz) {
  const f = (fmtCache[tz] ||= new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }));
  const o = {};
  for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour, mi: +o.minute, s: +o.second };
}
const validTz = (tz) => { try { parts(0, tz); return true; } catch { return false; } };

// Veggklokketid i en tidssone -> UTC-millisekunder.
function zonedToUtc({ y, m, d, h = 0, mi = 0, s = 0 }, tz) {
  const want = Date.UTC(y, m - 1, d, h, mi, s);
  let guess = want;
  for (let i = 0; i < 3; i++) {
    const p = parts(guess, tz);
    const diff = want - Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
    if (!diff) break;
    guess += diff;
  }
  return guess;
}

const pad = (n) => String(n).padStart(2, "0");
const isoOf = (p) => `${p.y}-${pad(p.m)}-${pad(p.d)}`;
const hmOf = (p) => `${pad(p.h)}:${pad(p.mi)}`;

// ---------- Lesing ----------
function unfold(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function prop(line) {
  const i = line.indexOf(":");
  if (i < 0) return null;
  const [name, ...ps] = line.slice(0, i).split(";");
  const params = {};
  for (const p of ps) {
    const [k, v = ""] = p.split("=");
    params[k.toUpperCase()] = v.replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value: line.slice(i + 1) };
}

const unescape = (s) => s.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").replace(/\s+/g, " ").trim();

// Et tidspunkt fra DTSTART/DTEND/EXDATE/RECURRENCE-ID.
function parseTime(p) {
  const v = p.value.trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const f = { y: +m[1], m: +m[2], d: +m[3] };
  if (p.params.VALUE === "DATE" || m[4] === undefined) return { allDay: true, f };
  Object.assign(f, { h: +m[4], mi: +m[5], s: +(m[6] || 0) });
  // UTC, en kjent tidssone, eller "flytende" (tolkes som norsk tid).
  const tz = m[7] ? "UTC" : p.params.TZID && validTz(p.params.TZID) ? p.params.TZID : OSLO;
  return { allDay: false, f, tz };
}

function parseDuration(v) {
  const m = (v || "").match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const ms = ((+m[2] || 0) * 7 * DAY) + ((+m[3] || 0) * DAY) + ((+m[4] || 0) * 36e5) + ((+m[5] || 0) * 6e4) + ((+m[6] || 0) * 1e3);
  return m[1] === "-" ? -ms : ms;
}

function parseRule(v) {
  const r = {};
  for (const kv of v.split(";")) {
    const [k, val] = kv.split("=");
    r[k.toUpperCase()] = val;
  }
  return r;
}

const BYDAY = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const wd = (y, m, d) => (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
const addDaysF = (f, n) => {
  const t = new Date(Date.UTC(f.y, f.m - 1, f.d) + n * DAY);
  return { ...f, y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
};

// Genererer datoene (veggklokke) for en gjentakelse, innenfor [.., toMs].
function* expand(start, rule, toMs) {
  const freq = rule.FREQ;
  const interval = Math.max(1, +rule.INTERVAL || 1);
  const count = rule.COUNT ? +rule.COUNT : Infinity;
  let until = Infinity;
  if (rule.UNTIL) {
    const u = parseTime({ value: rule.UNTIL, params: {} });
    if (u) until = u.allDay ? Date.UTC(u.f.y, u.f.m - 1, u.f.d) + DAY - 1 : zonedToUtc(u.f, u.tz);
  }
  const toUtc = (f) => (start.allDay ? Date.UTC(f.y, f.m - 1, f.d) : zonedToUtc(f, start.tz));
  let n = 0;
  const emit = function* (f) {
    const ms = toUtc(f);
    if (ms < toUtc(start.f)) return;
    if (ms > until || n >= count) return "stop";
    n++;
    yield f;
  };
  for (let i = 0; i < 3000; i++) {
    let batch;
    if (freq === "DAILY") batch = [addDaysF(start.f, i * interval)];
    else if (freq === "WEEKLY") {
      const days = rule.BYDAY ? rule.BYDAY.split(",").map((x) => BYDAY.indexOf(x.slice(-2))).filter((x) => x >= 0) : [wd(start.f.y, start.f.m, start.f.d)];
      const monday = addDaysF(start.f, -wd(start.f.y, start.f.m, start.f.d) + i * 7 * interval);
      batch = days.sort().map((d) => addDaysF(monday, d));
    } else if (freq === "MONTHLY" || freq === "YEARLY") {
      const months = freq === "MONTHLY" ? i * interval : i * 12 * interval;
      const t = new Date(Date.UTC(start.f.y, start.f.m - 1 + months, 1));
      const f = { ...start.f, y: t.getUTCFullYear(), m: t.getUTCMonth() + 1 };
      // Hopp over måneder uten denne datoen (f.eks. 31.).
      batch = new Date(Date.UTC(f.y, f.m - 1, f.d)).getUTCMonth() === f.m - 1 ? [f] : [];
    } else {
      yield start.f;
      return;
    }
    for (const f of batch) {
      const r = yield* emit(f);
      if (r === "stop") return;
    }
    if (batch.length && toUtc(batch[batch.length - 1]) > toMs) return;
  }
}

/**
 * @param {string} text  innholdet i .ics-filen
 * @param {number} fromMs  ta med avtaler fra og med (UTC-ms)
 * @param {number} toMs    … og til og med
 */
export function parseIcs(text, fromMs, toMs) {
  const events = [];
  let cur = null;
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") { cur = { exdates: new Set() }; continue; }
    if (line === "END:VEVENT") { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const p = prop(line);
    if (!p) continue;
    switch (p.name) {
      case "UID": cur.uid = p.value; break;
      case "SUMMARY": cur.title = unescape(p.value); break;
      case "DTSTART": cur.start = parseTime(p); break;
      case "DTEND": cur.end = parseTime(p); break;
      case "DURATION": cur.duration = parseDuration(p.value); break;
      case "RRULE": cur.rule = parseRule(p.value); break;
      case "STATUS": cur.status = p.value.toUpperCase(); break;
      case "RECURRENCE-ID": cur.recurrenceId = parseTime(p); break;
      case "EXDATE":
        for (const v of p.value.split(",")) {
          const t = parseTime({ value: v, params: p.params });
          if (t) cur.exdates.add(isoOf(t.f) + (t.allDay ? "" : "T" + hmOf(t.f)));
        }
        break;
    }
  }

  // Endrede enkeltforekomster erstatter forekomsten i serien.
  const overridden = new Set();
  for (const e of events) {
    if (e.recurrenceId && e.uid) overridden.add(e.uid + "|" + isoOf(e.recurrenceId.f));
  }

  const out = [];
  const push = (title, startMs, endMs, allDay, f) => {
    if (out.length >= MAX_OUT) return;
    if (allDay) {
      // Heldag: én oppføring per dag (maks 31), datoene som de står.
      const days = Math.max(1, Math.min(31, Math.round((endMs - startMs) / DAY)));
      for (let i = 0; i < days; i++) {
        const t = startMs + i * DAY;
        if (t + DAY <= fromMs || t > toMs) continue;
        out.push({ title, date: new Date(t).toISOString().slice(0, 10), time: "", end: "" });
      }
      return;
    }
    if (endMs < fromMs || startMs > toMs) return;
    const s = parts(startMs, OSLO);
    const e = parts(endMs, OSLO);
    const sameDay = isoOf(s) === isoOf(e);
    out.push({ title, date: isoOf(s), time: hmOf(s), end: sameDay && endMs > startMs ? hmOf(e) : "" });
  };

  for (const e of events) {
    if (!e.start || e.status === "CANCELLED") continue;
    const title = e.title || "(uten tittel)";
    const st = e.start;
    const toUtc = (f) => (st.allDay ? Date.UTC(f.y, f.m - 1, f.d) : zonedToUtc(f, st.tz));
    const s0 = toUtc(st.f);
    let len;
    if (e.end) len = (e.end.allDay ? Date.UTC(e.end.f.y, e.end.f.m - 1, e.end.f.d) : zonedToUtc(e.end.f, e.end.tz)) - s0;
    else if (e.duration != null) len = e.duration;
    else len = st.allDay ? DAY : 0;

    if (!e.rule || e.recurrenceId) {
      push(title, s0, s0 + len, st.allDay, st.f);
      continue;
    }
    for (const f of expand(st, e.rule, toMs)) {
      const key = isoOf(f) + (st.allDay ? "" : "T" + hmOf(f));
      if (e.exdates.has(key) || e.exdates.has(isoOf(f))) continue;
      if (e.uid && overridden.has(e.uid + "|" + isoOf(f))) continue;
      const ms = toUtc(f);
      push(title, ms, ms + len, st.allDay, f);
    }
  }
  out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return out;
}
