// Bygger public/restefest/oppskrifter.json fra det tools/hent-oppskrifter.mjs har hentet.
// Lagrer bare det Restefest trenger for å søke og lenke videre: tittel, lenke, kilde, bilde, tid,
// kategori og ingrediensene i grunnform. Mengder og fremgangsmåte står hos originalen.
//
//   node tools/bygg-oppskriftsbase.mjs <mellomlager-mappe>
import fs from "node:fs";
import path from "node:path";
import { keysFromLine } from "../public/restefest/ingredienser.js";
import { minutes } from "../public/restefest/les-oppskrift.js";

const CACHE = process.argv[2] || "./.oppskrift-cache";
const OUT = new URL("../public/restefest/oppskrifter.json", import.meta.url);
const SOURCES = { rema: "REMA 1000", coop: "Coop", kiwi: "KIWI" };

const recipes = [];
const seen = new Set();
for (const [i, src] of Object.keys(SOURCES).entries()) {
  const dir = path.join(CACHE, src);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    const r = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    if (!r || !r.title || !r.ingredients?.length) continue;
    const keys = [...new Set(r.ingredients.flatMap(keysFromLine))];
    if (keys.length < 2) continue; // f.eks. «hjemmelaget mandelmelk» – for lite å søke på
    const id = r.title.toLowerCase() + "|" + keys.slice().sort().join(",");
    if (seen.has(id)) continue; // samme oppskrift publisert flere steder
    seen.add(id);
    // [tittel, lenke, kilde, bilde, minutter, kategorier, ingredienser]
    recipes.push([r.title, r.url, i, r.image || "", minutes(r.time), r.category.slice(0, 3), keys]);
  }
}
// Uten mellomlager (f.eks. i en ny økt): behold oppskriftene fra butikkene som ligger i basen fra før.
if (!recipes.length && fs.existsSync(OUT)) {
  const old = JSON.parse(fs.readFileSync(OUT, "utf8"));
  for (const r of old.recipes) {
    const name = old.sources[r[2]];
    const i = Object.values(SOURCES).indexOf(name);
    if (i >= 0) recipes.push([r[0], r[1], i, ...r.slice(3)]);
  }
  console.log(`Fant ikke mellomlager – beholder ${recipes.length} oppskrifter fra eksisterende base`);
}

// Oversatte retter fra TheMealDB (tools/oversett-themealdb.mjs). Vises på vår egen side, med kreditering.
const MEALDB = new URL("../public/restefest/themealdb-no.json", import.meta.url);
const sources = Object.values(SOURCES);
if (fs.existsSync(MEALDB)) {
  const idx = sources.push("TheMealDB") - 1;
  let n = 0;
  for (const m of Object.values(JSON.parse(fs.readFileSync(MEALDB, "utf8")).meals)) {
    const keys = [...new Set(m.ingredients.flatMap((i) => keysFromLine(i.item)))];
    if (keys.length < 2) continue;
    recipes.push([m.title, `https://uka-app.no/restefest/oppskrift.html?id=${m.id}`, idx, m.image, m.minutes || 0, [m.category], keys]);
    n++;
  }
  console.log(`+ ${n} retter fra TheMealDB`);
}
recipes.sort((a, b) => a[0].localeCompare(b[0], "nb"));
const data = { v: 1, built: new Date().toISOString().slice(0, 10), sources, recipes };
fs.writeFileSync(OUT, JSON.stringify(data));
console.log(`${recipes.length} oppskrifter → ${OUT.pathname} (${Math.round(fs.statSync(OUT).size / 1024)} KB)`);
