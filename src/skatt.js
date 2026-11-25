// Frister fra Skatteetaten. Skatteetaten har ingen kalenderfil, men publiserer «skattekalenderen» som RSS.
// Adressen /skatt.ics?k=person,enk,mva gjør dem om til en vanlig kalender. En familie legger den inn
// under «Andre kalendere» – da hentes fristene direkte herfra (uten omvei via egen adresse).
//
// Utvalg (k):
//   person – skattemelding, skatteoppgjør, forskuddsskatt for privatpersoner, skattekort
//   enk    – skattemelding og forskuddsskatt for enkeltpersonforetak
//   mva    – mva-melding (levering og betaling)

const FEEDS = {
  person: "https://www.skatteetaten.no/rss/skattekalender-for-person/",
  bedrift: "https://www.skatteetaten.no/rss/skattekalender-for-bedrift/",
};
export const SKATT_KINDS = ["person", "enk", "mva"];
export const isSkattUrl = (url) => /^https?:\/\/[^/]+\/skatt\.ics(\?|$)/i.test(url);
export const skattKinds = (url) => {
  const k = new URL(url, "https://x").searchParams.get("k") || SKATT_KINDS.join(",");
  return SKATT_KINDS.filter((x) => k.split(",").includes(x));
};

const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
// Ordinære mva-frister (dag i måneden) før de flyttes fra helg: 10. feb, apr, jun, okt, des og 31. aug.
const MVA_DAY = { 2: 10, 4: 10, 6: 10, 8: 31, 10: 10, 12: 10 };
const decode = (s) => s.replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

function parseRss(xml) {
  const out = [];
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/g)) {
    const tag = (n) => { const x = m[0].match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`)); return x ? decode(x[1]) : ""; };
    const d = tag("description").match(/(\d{1,2}) ([A-Za-z]+) (\d{4})/); // «Kalenderhendelse: Thursday, 30 April 2026»
    if (!d || !MONTHS[d[2].toLowerCase()]) continue;
    out.push({ title: tag("title"), link: tag("link"), date: `${d[3]}-${String(MONTHS[d[2].toLowerCase()]).padStart(2, "0")}-${d[1].padStart(2, "0")}` });
  }
  return out;
}

// Hvilke frister hører til hvilket utvalg, og kortere titler til kalenderen.
function pick(item, feed, kinds) {
  const t = item.title.replace(/\s+-\s+/g, " – ");
  const has = (k) => kinds.includes(k);
  if (feed === "person") {
    if (/personlig næringsdrivende/i.test(t)) return has("enk") ? "Skattemelding for ENK – frist for å levere" : null;
    if (/^forskudds?skatt/i.test(t)) return has("person") || has("enk") ? "Forskuddsskatt – frist for betaling" : null;
    if (/aksjeoppgaven|skattelistene/i.test(t)) return null;
    if (!has("person")) return null;
    if (/^skattemelding – frist for å endre og levere/i.test(t)) return "Skattemelding – frist for å levere";
    return t.replace(/^Skattekort – Skattekort – /, "Skattekort – ");
  }
  // bedriftslisten: bare vanlig mva-melding (ikke VOEC, omvendt avgiftsplikt eller kompensasjon).
  // Forskuddsskatt for ENK står allerede i personlisten.
  if (has("mva") && /^mva-melding – frist for levering og betaling/i.test(t)) return "Mva-melding – frist for levering og betaling";
  return null;
}

// Fristene som avtaler i samme form som parseIcs gir: { title, date, time: "", end: "", icon, link }
export async function skattEvents(kinds, fromMs = Date.now() - 31 * 864e5, toMs = Date.now() + 400 * 864e5) {
  const want = kinds.length ? kinds : SKATT_KINDS;
  const feeds = want.includes("mva") ? ["person", "bedrift"] : ["person"];
  const seen = new Set();
  const all = [];
  for (const feed of feeds) {
    const res = await fetch(FEEDS[feed], { headers: { "User-Agent": "Uka-kalender/1.0", Accept: "application/rss+xml,text/xml,*/*" } });
    if (!res.ok) throw new Error(`Skatteetaten svarte ${res.status}`);
    for (const it of parseRss(await res.text())) {
      const title = pick(it, feed, want);
      const key = it.date + "|" + title;
      if (!title || seen.has(key)) continue;
      seen.add(key);
      all.push({ title, date: it.date, time: "", end: "", icon: "briefcase", link: it.link });
    }
  }
  // Skatteetaten legger bare ut inneværende års datoer. Faste frister fra siste år føres derfor ett år
  // fram som «(forventet)» til de offisielle datoene er publisert (samme frist i samme måned erstatter dem).
  const now = Date.now();
  const has = new Set(all.map((e) => e.title + "|" + e.date.slice(0, 7)));
  for (const e of [...all]) {
    const t = Date.parse(e.date + "T12:00:00Z");
    if (!/frist/i.test(e.title) || t > now || t < now - 400 * 864e5) continue;
    let d = new Date(Date.UTC(+e.date.slice(0, 4) + 1, +e.date.slice(5, 7) - 1, /^Mva/.test(e.title) ? MVA_DAY[+e.date.slice(5, 7)] || +e.date.slice(8) : +e.date.slice(8)));
    if (/^Mva/.test(e.title)) while ([0, 6].includes(d.getUTCDay())) d = new Date(d.getTime() + 864e5); // helg → mandag
    const iso = d.toISOString().slice(0, 10);
    if (has.has(e.title + "|" + iso.slice(0, 7))) continue;
    has.add(e.title + "|" + iso.slice(0, 7));
    all.push({ ...e, title: e.title + " (forventet)", date: iso });
  }
  // Skattemeldingen for ENK har lovfestet frist 31. mai; legg den inn hvis Skatteetaten ikke har neste ennå.
  if (want.includes("enk")) {
    const y = new Date().getUTCFullYear();
    const iso = Date.parse(`${y}-05-31T23:59:59Z`) >= now ? `${y}-05-31` : `${y + 1}-05-31`;
    const t = "Skattemelding for ENK – frist for å levere";
    if (!all.some((e) => e.title.startsWith(t) && e.date.slice(0, 4) === iso.slice(0, 4)))
      all.push({ title: t + " (forventet)", date: iso, time: "", end: "", icon: "briefcase", link: "https://www.skatteetaten.no/bedrift-og-organisasjon/skatt/skattemelding-naringsdrivende/enk/" });
  }
  return all.filter((e) => { const t = Date.parse(e.date + "T12:00:00Z"); return t >= fromMs && t <= toMs; })
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Som abonnerbar kalender (.ics), f.eks. i Kalender på iPhone.
export function skattIcs(events, host) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const esc = (s) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,");
  const ymd = (iso) => iso.replace(/-/g, "");
  const next = (iso) => new Date(Date.parse(iso + "T00:00:00Z") + 864e5).toISOString().slice(0, 10);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Uka//Skatteetaten-frister//NO", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:Skatteetaten – frister", "X-WR-TIMEZONE:Europe/Oslo", "REFRESH-INTERVAL;VALUE=DURATION:P1D", "X-PUBLISHED-TTL:P1D"];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:skatt-${ymd(e.date)}-${e.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}@${host}`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(e.date)}`, `DTEND;VALUE=DATE:${ymd(next(e.date))}`, `SUMMARY:${esc(e.title)}`,
      ...(e.link ? [`URL:${e.link}`, `DESCRIPTION:${esc("Les mer: " + e.link)}`] : []), "TRANSP:TRANSPARENT", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
