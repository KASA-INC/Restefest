// Hvilke varsler skal sendes når? Rene funksjoner (lett å teste), all tid regnes i norsk tid.
import { occursOn } from "../public/recur.js";

const TZ = "Europe/Oslo";
const DAY = 864e5;
const fmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const parts = (ms) => Object.fromEntries(fmt.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));

// Norsk dato og klokkeslett for et tidspunkt.
export function osloNow(ms) {
  const p = parts(ms);
  return { iso: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}` };
}
// Tidspunktet (ms) for en norsk dato + klokkeslett (håndterer sommertid).
export function osloToUtc(iso, hm = "00:00") {
  const [y, m, d] = iso.split("-").map(Number);
  const [h, mi] = hm.split(":").map(Number);
  const local = Date.UTC(y, m - 1, d, h, mi);
  let t = local - 3600e3;
  for (let i = 0; i < 2; i++) {
    const p = parts(t);
    const asLocal = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    t += local - asLocal;
  }
  return t;
}
export const addDays = (iso, n) => new Date(Date.UTC(...iso.split("-").map((v, i) => (i === 1 ? v - 1 : +v))) + n * DAY).toISOString().slice(0, 10);

function weekSlot(iso) {
  const t = new Date(iso + "T00:00:00Z");
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() + 3 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / DAY + 1) / 7);
  return { key: `${y}-W${String(w).padStart(2, "0")}`, day };
}
export const dinnerOn = (state, iso) => {
  const { key, day } = weekSlot(iso);
  return state.menu?.[key]?.[day]?.dish || "";
};

// Avtaler en dag: egne (med gjentakelser) og fra andre kalendere. Heldagsavtaler først.
export function eventsOn(state, ext, iso) {
  const own = (state.events || []).filter((e) => occursOn(e, iso))
    .map((e) => ({ key: e.id, title: e.title, time: e.time || "", end: e.end || "", bday: e.kind === "bday", born: e.born }));
  const other = (ext || []).filter((e) => e.date === iso)
    .map((e) => ({ key: `x:${e.feed}:${e.title}`, title: e.title, time: e.time || "", end: e.end || "" }));
  return [...own, ...other].sort((a, b) => (a.time || "").localeCompare(b.time || ""));
}

const DAYS = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
const MONTHS = ["jan.", "feb.", "mars", "april", "mai", "juni", "juli", "aug.", "sep.", "okt.", "nov.", "des."];
export const dayName = (iso) => DAYS[new Date(iso + "T12:00:00Z").getUTCDay()];
const dateText = (iso) => `${dayName(iso)} ${+iso.slice(8)}. ${MONTHS[+iso.slice(5, 7) - 1]}`;
const evLine = (e, iso) => {
  if (e.bday) {
    const age = e.born ? +iso.slice(0, 4) - e.born : 0;
    return `${e.title} har bursdag${age > 0 ? ` (${age} år)` : ""}`;
  }
  return e.time ? `${e.time} ${e.title}` : e.title;
};
const inText = (min) => (min >= 60 ? (min === 60 ? "Om 1 time" : `Om ${min / 60} timer`) : `Om ${min} minutter`);

export const DEFAULT_PREFS = { remind: true, remindMin: 30, morning: true, morningAt: "07:00", dinner: true, dinnerAt: "15:00", changes: true };
const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export function cleanPrefs(p = {}) {
  const out = { ...DEFAULT_PREFS };
  for (const k of ["remind", "morning", "dinner", "changes"]) if (typeof p[k] === "boolean") out[k] = p[k];
  if ([10, 15, 30, 60, 120].includes(Number(p.remindMin))) out.remindMin = Number(p.remindMin);
  if (HM_RE.test(p.morningAt)) out.morningAt = p.morningAt;
  if (HM_RE.test(p.dinnerAt)) out.dinnerAt = p.dinnerAt;
  return out;
}

// Alle planlagte varsler med tidspunkt i (fromMs, toMs]: [{ at, subId, key, payload, opts }]
export function dueBetween(state, ext, subs, fromMs, toMs) {
  const out = [];
  const first = addDays(osloNow(fromMs).iso, -1);
  const last = osloNow(toMs + 3 * 3600e3).iso; // påminnelser kan gjelde avtaler litt etter toMs
  const cache = {};
  const dayEvents = (iso) => (cache[iso] ||= eventsOn(state, ext, iso));
  for (let iso = first; iso <= last; iso = addDays(iso, 1)) {
    for (const s of subs) {
      const p = s.prefs;
      const add = (at, key, payload, opts = {}) => { if (at > fromMs && at <= toMs) out.push({ at, subId: s.id, key, payload, opts }); };
      if (p.morning) {
        const evs = dayEvents(iso);
        const dish = dinnerOn(state, iso);
        const lines = evs.map((e) => evLine(e, iso));
        if (dish) lines.push(`Middag: ${dish}`);
        if (lines.length) {
          const t = dateText(iso);
          add(osloToUtc(iso, p.morningAt), `m:${iso}`, {
            title: `I dag, ${t}`,
            body: lines.join("\n"),
            tag: `morning-${iso}`, url: "/?vis=home",
          }, { topic: "morning" });
        }
      }
      if (p.dinner) {
        const dish = dinnerOn(state, iso);
        const open = (state.items || []).filter((i) => !i.done && i.list === "butikk").length;
        add(osloToUtc(iso, p.dinnerAt), `d:${iso}`, dish
          ? { title: `Middag i dag: ${dish}`, body: open ? `${open} ${open === 1 ? "vare" : "varer"} på handlelisten.` : "Handlelisten er tom.", tag: `dinner-${iso}`, url: "/?vis=menu" }
          : { title: "Hva blir det til middag?", body: "Det står ingen middag i ukemenyen i dag.", tag: `dinner-${iso}`, url: "/?vis=menu" },
        { topic: "dinner" });
      }
      if (p.remind) {
        for (const e of dayEvents(iso)) {
          if (!e.time || e.bday) continue;
          add(osloToUtc(iso, e.time) - p.remindMin * 60e3, `r:${e.key}:${iso}:${e.time}`, {
            title: `${e.title} kl. ${e.time}`,
            body: `${inText(p.remindMin)}${e.end ? ` · til ${e.end}` : ""}`,
            tag: `remind-${e.key}-${iso}`, url: "/?vis=cal",
          }, { urgency: "high", ttl: p.remindMin * 60 });
        }
      }
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

const listName = (state, id) => (id === "butikk" ? "handlelisten" : id === "oda" ? "Oda-listen" : `«${(state.lists || []).find((l) => l.id === id)?.name || "listen"}»`);
const join = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} og ${xs[xs.length - 1]}`);

// Samlet varsel om endringer andre i familien har gjort (ikke egne).
export function changesPayload(state, changes) {
  const lines = [];
  const byList = {};
  for (const c of changes.filter((c) => c.kind === "item")) (byList[(c.who || "") + "|" + c.list] ||= []).push(c.text);
  for (const [k, texts] of Object.entries(byList)) {
    const [who, list] = [k.slice(0, k.indexOf("|")), k.slice(k.indexOf("|") + 1)];
    const shown = texts.slice(0, 5);
    const more = texts.length - shown.length;
    lines.push(`${who ? `${who} la til` : "Lagt til"} på ${listName(state, list)}: ${join(more ? [...shown, `${more} til`] : shown)}`);
  }
  const evs = changes.filter((c) => c.kind === "event");
  for (const e of evs.slice(0, 3)) lines.push(`Ny avtale${e.who ? ` fra ${e.who}` : ""}: ${e.title}, ${dateText(e.date)}${e.time ? ` kl. ${e.time}` : ""}`);
  if (evs.length > 3) lines.push(`… og ${evs.length - 3} avtaler til`);
  if (!lines.length) return null;
  const onlyItems = !evs.length;
  return { title: onlyItems ? "Nytt på listene" : "Nytt fra familien", body: lines.join("\n"), tag: "changes", url: onlyItems ? "/?vis=list" : "/?vis=cal" };
}
