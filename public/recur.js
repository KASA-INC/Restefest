// Felles regler for gjentakende avtaler. Brukes både av appen (nettleseren)
// og av serveren (kalenderfeeden), så de alltid er enige.
//
// En avtale: { date: "YYYY-MM-DD", time, title, repeat? }
// repeat:    { freq: "daily" | "weekly" | "biweekly" | "monthly" | "yearly",
//              days: [0..6]   (bare uke/annenhver uke, 0 = mandag),
//              dur: "1m" | "3m" | "6m" | "inf" }

export const FREQS = ["daily", "weekly", "biweekly", "monthly", "yearly"];
export const DURS = { "1m": 1, "3m": 3, "6m": 6, inf: null };

const DAY = 864e5;
const parse = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
export const toIso = (t) => new Date(t).toISOString().slice(0, 10);
// 0 = mandag … 6 = søndag
export const weekday = (iso) => (new Date(parse(iso)).getUTCDay() + 6) % 7;

// Siste dato gjentakelsen gjelder (eksklusiv), eller null for alltid.
export function endIso(ev) {
  const months = ev.repeat && DURS[ev.repeat.dur];
  if (!months) return null;
  const d = new Date(parse(ev.date));
  d.setUTCMonth(d.getUTCMonth() + months);
  return toIso(d);
}

// Skjer avtalen på denne datoen?
export function occursOn(ev, iso) {
  if (iso < ev.date) return false;
  const r = ev.repeat;
  if (!r) return iso === ev.date;
  const end = endIso(ev);
  if (end && iso >= end) return false;
  const start = parse(ev.date);
  const t = parse(iso);
  switch (r.freq) {
    case "daily":
      return true;
    case "weekly":
    case "biweekly": {
      if (!r.days.includes(weekday(iso))) return false;
      if (r.freq === "weekly") return true;
      // Annenhver uke telles fra uken avtalen skjer første gang.
      let first = start;
      while (!r.days.includes((new Date(first).getUTCDay() + 6) % 7)) first += DAY;
      const mon = (x) => x - ((new Date(x).getUTCDay() + 6) % 7) * DAY;
      return Math.round((mon(t) - mon(first)) / (7 * DAY)) % 2 === 0;
    }
    case "monthly":
      return new Date(t).getUTCDate() === new Date(start).getUTCDate();
    case "yearly": {
      // 29. februar markeres 28. februar i år som ikke er skuddår.
      if (ev.date.slice(5) === "02-29") {
        const y = +iso.slice(0, 4);
        const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
        return iso.slice(5) === (leap ? "02-29" : "02-28");
      }
      return iso.slice(5) === ev.date.slice(5);
    }
  }
  return false;
}

// Første dato avtalen faktisk skjer (for ukentlige kan startdatoen falle utenfor valgte dager).
export function firstIso(ev) {
  for (let i = 0; i < 15; i++) {
    const iso = toIso(parse(ev.date) + i * DAY);
    if (occursOn(ev, iso)) return iso;
  }
  return ev.date;
}

// Vasker en gjentakelse fra klienten. Gir null hvis den ikke gjentas.
export function cleanRepeat(r, date) {
  if (!r || !FREQS.includes(r.freq)) return null;
  const dur = r.dur in DURS ? r.dur : "inf";
  const out = { freq: r.freq, dur };
  if (r.freq === "weekly" || r.freq === "biweekly") {
    const days = [...new Set((Array.isArray(r.days) ? r.days : []).map(Number))]
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      .sort();
    out.days = days.length ? days : [weekday(date)];
  }
  return out;
}

const BYDAY = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

// RRULE for kalenderfeeden. `timed` = avtalen har klokkeslett.
export function rrule(ev, timed) {
  const r = ev.repeat;
  const parts = {
    daily: ["FREQ=DAILY"],
    weekly: ["FREQ=WEEKLY", `BYDAY=${(r.days || []).map((d) => BYDAY[d]).join(",")}`],
    biweekly: ["FREQ=WEEKLY", "INTERVAL=2", `BYDAY=${(r.days || []).map((d) => BYDAY[d]).join(",")}`],
    monthly: ["FREQ=MONTHLY"],
    yearly: ["FREQ=YEARLY"],
  }[r.freq];
  const end = endIso(ev);
  if (end) {
    const last = toIso(parse(end) - DAY).replace(/-/g, "");
    parts.push(`UNTIL=${timed ? last + "T235959Z" : last}`);
  }
  return "RRULE:" + parts.join(";");
}
