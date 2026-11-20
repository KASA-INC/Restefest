// Tolker korte norske beskrivelser av avtaler, f.eks.
//   "Fotball tir og tor 17:30-19 hver uke i 3 mnd"
//   "Tannlege 24.11 kl 8.15"
//   "Middag hos Tor i morgen 18-21"
//   "Søppeltømming annenhver mandag"
//   "Ida 14.03.2015" / "Kristian 090484" / "Bursdag Ida 3. jan"   -> bursdag (hvert år, med alder når året er kjent)
// Gir { title, date, time, end, repeat, kind?, born? } eller null hvis det ikke er noen tittel.

import { toIso, weekday } from "./recur.js";

const B = "(?<![\\p{L}\\d])"; // ordgrense som forstår æøå
const E = "(?![\\p{L}\\d])";
const MARK = "\u0000";

const DAY_FULL = ["mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag", "søndag"];
const DAY_SHORT = ["man", "tir", "ons", "tor", "fre", "lør", "søn"];
const MONTHS = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];
const MONTH_RE = "(jan(?:uar)?|feb(?:ruar)?|mars?|apr(?:il)?|mai|juni?|juli?|aug(?:ust)?|sep(?:t(?:ember)?)?|okt(?:ober)?|nov(?:ember)?|des(?:ember)?)\\.?";
const NUMS = { en: 1, ett: 1, én: 1, to: 2, tre: 3, seks: 6 };

const pad = (n) => String(n).padStart(2, "0");
const hm = (h, m) => (h >= 0 && h <= 23 && m >= 0 && m <= 59 ? `${pad(h)}:${pad(m || 0)}` : null);
const localIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (iso, n) => toIso(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) + n * 864e5);

/**
 * @param {string} text  det brukeren skrev
 * @param {object} ctx   { today: Date, from: "YYYY-MM-DD" } – `from` er første dato
 *                       som skal brukes for ukedager uten dato (i dag, eller mandag i uken man ser på)
 */
export function parseQuick(text, ctx = {}) {
  const today = localIso(ctx.today || new Date());
  const from = ctx.from || today;
  let rest = " " + text.normalize("NFC") + " ";
  const take = (re, fn) => {
    let hit = false;
    rest = rest.replace(new RegExp(re, "giu"), (...m) => {
      if (hit && !fn.all) return m[0];
      const r = fn(...m);
      if (r === false) return m[0];
      hit = true;
      return " " + MARK + " ";
    });
    return hit;
  };

  let date = null;
  let time = "";
  let end = "";
  let freq = "";
  let bdayWord = false;
  let yearGiven = false;
  let dur = "";
  const days = [];

  // Bursdag
  take(`${B}(?:bursdag(?:en)?|fødselsdag(?:en)?|født|f\\.)(?=\\s|$)`, () => { bdayWord = true; });

  // Varighet
  take(`${B}i\\s+(\\d|en|ett|én|to|tre|seks)\\s*(?:mnd|md|måned(?:er)?)\\.?${E}`, (_, n) => {
    const v = NUMS[n.toLowerCase()] ?? Number(n);
    dur = v <= 1 ? "1m" : v <= 3 ? "3m" : "6m";
  });
  take(`${B}(?:for\\s+)?alltid${E}`, () => { dur = "inf"; });

  // Gjentakelse
  take(`${B}(?:annenhver|annen\\s*hver|hver\\s+annen|hver\\s+2\\.?)\\s+uke${E}`, () => { freq = "biweekly"; });
  take(`${B}(?:hver\\s+dag|daglig)${E}`, () => { freq = "daily"; });
  take(`${B}(?:hver\\s+uke|ukentlig)${E}`, () => { freq ||= "weekly"; });
  take(`${B}(?:hver\\s+måned|månedlig)${E}`, () => { freq = "monthly"; });
  take(`${B}(?:hvert\\s+år|årlig)${E}`, () => { freq = "yearly"; });
  take(`${B}(?:alle\\s+|hver\\s+)?hverdag(?:er)?${E}`, () => { freq ||= "weekly"; days.push(0, 1, 2, 3, 4); });
  take(`${B}(?:alle\\s+|hver\\s+)?helg(?:er)?${E}`, () => { freq ||= "weekly"; days.push(5, 6); });
  // "annenhver mandag", "hver tirsdag"
  const prefix = rest.match(new RegExp(`${B}(annenhver|hver)(?=\\s+(?:${DAY_SHORT.join("|")}))`, "iu"));
  if (prefix) {
    freq ||= prefix[1].toLowerCase() === "annenhver" ? "biweekly" : "weekly";
    rest = rest.replace(prefix[0], " " + MARK + " ");
  }

  // Relative dager
  take(`${B}i\\s+overmorgen${E}`, () => { date = addDays(today, 2); });
  take(`${B}i\\s+morgen${E}`, () => { date = addDays(today, 1); });
  take(`${B}i\\s+dag${E}`, () => { date = today; });
  take(`${B}(?:i|til|denne)\\s+helgen${E}`, () => {
    // Lørdag denne uken (eller i dag hvis det allerede er helg).
    const w = weekday(today);
    date = w >= 5 ? today : addDays(today, 5 - w);
  });

  // Ukedager: fulle navn i alle varianter, korte bare med små bokstaver ("Tor" kan være et navn).
  const dayFn = (m) => {
    const w = m.toLowerCase();
    const i = DAY_SHORT.findIndex((d) => w.startsWith(d));
    if (i < 0) return false;
    if (!days.includes(i)) days.push(i);
    if (/dager$/.test(w)) freq ||= "weekly";
  };
  dayFn.all = true;
  take(`${B}(?:${DAY_FULL.map((d) => d.slice(0, -3)).join("|")})dag(?:er|en)?${E}`, dayFn);
  rest = rest.replace(new RegExp(`${B}(${DAY_SHORT.join("|")})\\.?${E}`, "gu"), (m) => {
    dayFn(m);
    return " " + MARK + " ";
  });

  // "den 25." = neste gang det er den 25. i en måned
  take(`${B}den\\s+(\\d{1,2})\\.(?![\\d])`, (_, d) => {
    if (+d < 1 || +d > 31) return false;
    for (let i = 0; i < 62; i++) {
      const iso = addDays(today, i);
      if (+iso.slice(8) === +d) { date = iso; break; }
    }
  });

  // Klokkeslett: "17:30-19", "17-19", "kl 17", "17.30", "8:15"
  const T = "(\\d{1,2})(?:[:.](\\d{2}))?";
  take(`${B}(?:kl\\.?\\s*|fra\\s+)?${T}\\s*(?:-|–|til)\\s*(?:kl\\.?\\s*)?${T}${E}`, (_, h1, m1, h2, m2) => {
    const a = hm(+h1, +(m1 || 0));
    const b = hm(+h2, +(m2 || 0));
    if (!a || !b) return false;
    time = a;
    if (b > a) end = b;
  });
  if (!time) {
    take(`${B}kl\\.?\\s*${T}${E}`, (_, h, m) => { time = hm(+h, +(m || 0)) || ""; if (!time) return false; });
  }
  // Rett etter en dag ("onsdag 19", "i morgen 18") er et tall et klokkeslett.
  if (!time) {
    rest = rest.replace(new RegExp(`${MARK}\\s+(\\d{1,2})(?![\\d.:/])${E}`, "u"), (m, h) => {
      const v = hm(+h, 0);
      if (!v) return m;
      time = v;
      return MARK + " " + MARK;
    });
  }
  if (!time) {
    take(`${B}(\\d{1,2})[:](\\d{2})${E}`, (_, h, m) => { time = hm(+h, +m) || ""; if (!time) return false; });
  }

  // Datoer: "24.12", "24/12", "24.12.2027", "24. des", "24 desember"
  const fixYear = (y, m, d) => {
    const thisYear = Number(today.slice(0, 4));
    // To sifre: "15" = 2015, men "98" = 1998 (ingen datoer langt fram i tid).
    let year = y ? (String(y).length === 2 ? (2000 + Number(y) > thisYear + 1 ? 1900 : 2000) + Number(y) : Number(y)) : thisYear;
    if (y) yearGiven = true;
    let iso = `${year}-${pad(m)}-${pad(d)}`;
    if (!y && iso < today) iso = `${year + 1}-${pad(m)}-${pad(d)}`;
    const t = new Date(iso + "T12:00:00Z");
    return t.getUTCMonth() + 1 === m ? iso : null;
  };
  // Sammenhengende: "090484" (ddmmåå) og "09041984" (ddmmåååå) – som starten på et personnummer.
  take(`${B}(\\d{2})(\\d{2})(\\d{2}|\\d{4})${E}`, (_, d, m, y) => {
    if (+m < 1 || +m > 12 || +d < 1) return false;
    date = fixYear(y, +m, +d);
    if (!date) return false;
  });
  if (!date) take(`${B}(\\d{1,2})\\.?\\s*${MONTH_RE}(?:\\s+(\\d{4}))?${E}`, (_, d, mon, y) => {
    const m = MONTHS.findIndex((x) => mon.toLowerCase().startsWith(x)) + 1;
    date = fixYear(y, m, +d);
    if (!date) return false;
  });
  if (!date) {
    take(`${B}(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2}|\\d{4}))?\\.?${E}`, (_, d, m, y) => {
      if (+m < 1 || +m > 12) return false;
      date = fixYear(y, +m, +d);
      if (!date) return false;
    });
  }

  // Tittel: det som er igjen, uten småord som hang sammen med det vi tolket.
  const glue = "kl\\.?|fra|på|den|og|hver|til|i|har|,|\\+|&";
  let t = rest;
  for (let k = 0; k < 4; k++) {
    t = t
      .replace(new RegExp(`(^|\\s)(?:${glue})\\s*(?=${MARK})`, "giu"), "$1")
      .replace(new RegExp(`${MARK}\\s*(?:${glue})(?=\\s|${MARK}|$)`, "giu"), MARK);
  }
  const title = t.split(MARK).join(" ").replace(/\s+/g, " ").replace(/^[\s,.\-–:]+|[\s,\-–:]+$/g, "").trim();
  if (!title) return null;

  // Sett sammen dato og gjentakelse
  if (days.length && (freq === "weekly" || freq === "biweekly")) {
    days.sort();
  } else if (days.length && !freq) {
    // Én bestemt ukedag: neste gang den kommer (fra `from`).
    for (let i = 0; i < 7; i++) {
      const iso = addDays(from, i);
      if (weekday(iso) === days[0]) { date ||= iso; break; }
    }
  }
  if (!date && days.length) {
    for (let i = 0; i < 7; i++) {
      const iso = addDays(from, i);
      if (days.includes(weekday(iso))) { date = iso; break; }
    }
  }
  date ||= from;
  const Title = title[0].toUpperCase() + title.slice(1);

  // Bursdag: ordet «bursdag», eller en dato med årstall som har vært (og uten klokkeslett).
  if (bdayWord || (yearGiven && date < today && !time && !freq)) {
    const born = yearGiven && +date.slice(0, 4) < +today.slice(0, 4) ? +date.slice(0, 4) : null;
    const out = { title: Title, date, time: "", end: "", kind: "bday", repeat: { freq: "yearly", dur: "inf" } };
    if (born) out.born = born;
    return out;
  }

  const out = { title: Title, date, time, end };
  if (freq) {
    out.repeat = { freq, dur: dur || "inf" };
    if (freq === "weekly" || freq === "biweekly") out.repeat.days = days.length ? days : [weekday(date)];
  }
  return out;
}
