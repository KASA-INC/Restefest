// Legger til antall porsjoner (recipeYield) i mellomlageret fra tools/hent-oppskrifter.mjs, for oppskrifter som
// mangler det. Brukes når mellomlageret er laget før porsjoner ble lagret. Like høflig som hent-oppskrifter.mjs:
// én forespørsel om gangen per nettsted, pause mellom hver.
//
//   node tools/hent-porsjoner.mjs <mellomlager-mappe> [kilde ...]
import fs from "node:fs";
import path from "node:path";
import { recipeFrom } from "../public/restefest/les-oppskrift.js";

const UA = "Mozilla/5.0 (compatible; Uka-oppskrifter/1.0; +https://uka-app.no/restefest)";
const CACHE = process.argv[2] || "./.oppskrift-cache";
const ONLY = process.argv.slice(3);
const PAUSE = 800;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow" });
      if (res.status === 404 || res.status === 410) return null;
      if (!res.ok) throw new Error("status " + res.status);
      return await res.text();
    } catch {
      await sleep(5000 * (i + 1));
    }
  }
  return null;
}

async function run(id) {
  const dir = path.join(CACHE, id);
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  let n = 0, got = 0;
  for (const f of files) {
    const file = path.join(dir, f);
    const r = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!r || "yield" in r) continue;
    const html = await get(r.url);
    const fresh = html && recipeFrom(html, r.url);
    r.yield = fresh?.yield || 0;
    if (fresh?.ingredients?.length) r.ingredients = fresh.ingredients; // nyeste mengder
    fs.writeFileSync(file, JSON.stringify(r));
    n++;
    if (r.yield) got++;
    if (n % 100 === 0) console.log(`${id}: ${n} sider (${got} med porsjoner)`);
    await sleep(PAUSE);
  }
  console.log(`${id}: ferdig, ${n} sider, ${got} med porsjoner`);
}

await Promise.all((ONLY.length ? ONLY : ["rema", "kiwi"]).map(run));
