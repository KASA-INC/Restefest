// Bygger public/restefest/mengder/NN.json: ingredienslinjer med mengder og antall porsjoner per oppskrift, så
// Restefest kan regne om mengdene når ingredienser legges på handlelisten. Delt i 32 filer (etter lenken), så
// appen bare henter én liten fil når en oppskrift åpnes.
//
//   node tools/bygg-mengder.mjs <mellomlager-mappe>
//
// Kilder: REMA 1000 og KIWI fra mellomlageret (Coop oppgir ikke mengder), og de oversatte rettene fra
// TheMealDB og Wikibooks. Hver oppføring: { "<lenke>": [porsjoner, ["500 g kjøttdeig", …]] } (porsjoner 0 = ukjent).
import fs from "node:fs";
import path from "node:path";
import { shardOf, SHARDS } from "../public/restefest/mengde.js";

const CACHE = process.argv[2] || "./.oppskrift-cache";
const OUT = new URL("../public/restefest/mengder/", import.meta.url);
const base = JSON.parse(fs.readFileSync(new URL("../public/restefest/oppskrifter.json", import.meta.url), "utf8"));
const inBase = new Set(base.recipes.map((r) => r[1]));

const all = {};
let n = 0;
for (const src of ["rema", "kiwi"]) {
  const dir = path.join(CACHE, src);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    const r = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    if (!r || !inBase.has(r.url) || !r.ingredients?.some((l) => /^\d|^[½¼¾]/.test(l))) continue;
    all[r.url] = [r.yield || 0, r.ingredients];
    n++;
  }
}
for (const file of ["themealdb-no.json", "wikibooks-no.json"]) {
  const p = new URL("../public/restefest/" + file, import.meta.url);
  if (!fs.existsSync(p)) continue;
  for (const m of Object.values(JSON.parse(fs.readFileSync(p, "utf8")).meals)) {
    const url = `https://uka-app.no/restefest/oppskrift.html?id=${m.id}`;
    if (!inBase.has(url)) continue;
    all[url] = [m.servings || 0, m.ingredients.map((i) => [i.amount, i.item].filter(Boolean).join(" "))];
    n++;
  }
}
if (!n) { console.log("Fant ingen oppskrifter med mengder – lar mengder/ være som den er"); process.exit(0); }
const shards = Array.from({ length: SHARDS }, () => ({}));
for (const [url, v] of Object.entries(all)) shards[shardOf(url)][url] = v;
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
let bytes = 0;
shards.forEach((s, i) => { const t = JSON.stringify(s); bytes += t.length; fs.writeFileSync(new URL(`${String(i).padStart(2, "0")}.json`, OUT), t); });
const withYield = Object.values(all).filter((v) => v[0]).length;
console.log(`${n} oppskrifter med mengder (${withYield} med porsjoner) → ${SHARDS} filer, ${Math.round(bytes / 1024)} KB i alt`);
