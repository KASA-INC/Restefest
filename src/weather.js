// Værvarsel fra Meteorologisk institutt (api.met.no, samme data som Yr) og stedsoppslag fra Kartverket.
// MET krever at klienter identifiserer seg og mellomlagrer svarene, så appen henter alt via workeren.

const UA = "Uka/1.0 https://uka-app.no";
const PLACE_TYPES = ["By", "Tettsted", "Bydel", "Tettstedsdel", "Grend", "Bygd", "Kommune", "Øy", "Fjellområde"];
const TZ = "Europe/Oslo";
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const hourFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" });

// Koordinater med maks 2 desimaler (≈ 1 km) – nok for et værvarsel og bedre for mellomlagringen.
export const roundCoord = (v) => Math.round(Number(v) * 100) / 100;

// Dagsoversikt per norsk dato: { date, sym, min, max, rain }
export function summarize(met) {
  const days = {};
  for (const ts of met?.properties?.timeseries || []) {
    const t = new Date(ts.time);
    const date = dayFmt.format(t);
    const hour = +hourFmt.format(t);
    const d = (days[date] ||= { date, min: Infinity, max: -Infinity, rain: 0, best: null });
    const temp = ts.data?.instant?.details?.air_temperature;
    if (typeof temp === "number") { d.min = Math.min(d.min, temp); d.max = Math.max(d.max, temp); }
    const n1 = ts.data?.next_1_hours, n6 = ts.data?.next_6_hours;
    d.rain += n1 ? n1.details?.precipitation_amount || 0 : n6 ? n6.details?.precipitation_amount || 0 : 0;
    // Dagens symbol: perioden nærmest midt på dagen (helst 6-timersperioden fra kl. 12).
    const sym = n6?.summary?.symbol_code || n1?.summary?.symbol_code;
    const score = Math.abs(hour - 12) + (n6 ? 0 : 0.5);
    if (sym && (!d.best || score < d.best.score)) d.best = { score, sym };
  }
  return Object.values(days)
    .filter((d) => d.best && d.min !== Infinity)
    .map((d) => ({ date: d.date, sym: d.best.sym.replace(/_(day|night|polartwilight)$/, ""), min: Math.round(d.min) || 0, max: Math.round(d.max) || 0, rain: Math.round(d.rain * 10) / 10 }));
}

// Henter varselet (mellomlagret i Cloudflare så lenge MET sier det er gyldig, maks 1 time).
export async function forecast(lat, lon, ctx) {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`;
  const cache = caches.default;
  const key = new Request(url);
  let res = await cache.match(key);
  if (!res) {
    const met = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!met.ok) throw new Error(`MET svarte ${met.status}`);
    const days = summarize(await met.json());
    const exp = Date.parse(met.headers.get("Expires") || "") || Date.now() + 1800e3;
    const ttl = Math.max(300, Math.min(3600, Math.round((exp - Date.now()) / 1000)));
    res = new Response(JSON.stringify({ days, updated: Date.now() }), {
      headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${ttl}` },
    });
    ctx?.waitUntil(cache.put(key, res.clone()));
  }
  return res;
}

// Stedssøk: «Bryne» → [{ name, sub, lat, lon }]
export async function searchPlace(q) {
  const url = `https://ws.geonorge.no/stedsnavn/v1/navn?sok=${encodeURIComponent(q)}&fuzzy=true&treffPerSide=30&utkoordsys=4258`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return [];
  const data = await res.json();
  const seen = new Set();
  const rank = (t) => { const i = PLACE_TYPES.indexOf(t); return i < 0 ? 99 : i; };
  return (data.navn || [])
    .map((n) => ({ name: n.skrivemåte, type: n.navneobjekttype, sub: (n.kommuner || []).map((k) => k.kommunenavn).join(", "), lat: n.representasjonspunkt?.nord, lon: n.representasjonspunkt?.øst }))
    .filter((p) => p.name && typeof p.lat === "number" && typeof p.lon === "number")
    .sort((a, b) => rank(a.type) - rank(b.type))
    .filter((p) => { const k = p.name + "|" + p.sub; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 8)
    .map((p) => ({ name: p.name, sub: [p.type, p.sub].filter(Boolean).join(" i "), lat: roundCoord(p.lat), lon: roundCoord(p.lon) }));
}

// Posisjon → nærmeste by/tettsted, ellers kommunen.
export async function nearestPlace(lat, lon) {
  try {
    const res = await fetch(`https://ws.geonorge.no/stedsnavn/v1/punkt?nord=${lat}&ost=${lon}&koordsys=4258&radius=4000&treffPerSide=200&utkoordsys=4258`, { headers: { "User-Agent": UA } });
    if (res.ok) {
      const hit = ((await res.json()).navn || [])
        .filter((n) => ["By", "Tettsted", "Bydel", "Tettstedsdel"].includes(n.navneobjekttype))
        .sort((a, b) => a.meterFraPunkt - b.meterFraPunkt)[0];
      if (hit) return hit.stedsnavn?.[0]?.skrivemåte || "";
    }
  } catch {}
  try {
    const res = await fetch(`https://ws.geonorge.no/kommuneinfo/v1/punkt?nord=${lat}&ost=${lon}&koordsys=4258`, { headers: { "User-Agent": UA } });
    if (res.ok) return (await res.json()).kommunenavn || "";
  } catch {}
  return "";
}
