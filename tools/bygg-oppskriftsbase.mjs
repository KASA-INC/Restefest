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
recipes.sort((a, b) => a[0].localeCompare(b[0], "nb"));
const data = { v: 1, built: new Date().toISOString().slice(0, 10), sources: Object.values(SOURCES), recipes };
fs.writeFileSync(OUT, JSON.stringify(data));
console.log(`${recipes.length} oppskrifter → ${OUT.pathname} (${Math.round(fs.statSync(OUT).size / 1024)} KB)`);
