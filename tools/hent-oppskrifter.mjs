// Bygger Restefest sin oppskriftsbase fra norske oppskriftssider som tillater det.
// Leser bare oppskriftenes strukturerte data (schema.org/Recipe): tittel, ingredienser, bilde, tid, kategori og
// lenke. Fremgangsmåten lagres ikke – Restefest lenker til originalen.
//
// Kilder: REMA 1000, Coop og KIWI. Sjekket nov. 2026: robots.txt tillater oppskriftene, og ingen av dem har
// vilkår mot gjenbruk av innhold. IKKE med: Matprat, TINE og MENY (vilkårene forbyr det), Trines matblogg
// (tekst/bilder beskyttet, mye for medlemmer), Godt.no (blokkerer roboter) og Oda (robots.txt).
// Sjekk vilkårene på nytt før en ny kilde legges til.
//
// Høflig: én forespørsel om gangen per nettsted, pause mellom hver, tydelig User-Agent. Mellomlagrer per side,
// så en ny kjøring bare henter det som mangler.
//
//   node tools/hent-oppskrifter.mjs <mellomlager-mappe> [maks per kilde]
import fs from "node:fs";
import path from "node:path";
import { recipeFrom } from "../public/restefest/les-oppskrift.js";

const UA = "Mozilla/5.0 (compatible; Uka-oppskrifter/1.0; +https://uka-app.no/restefest)";
const CACHE = process.argv[2] || "./.oppskrift-cache";
const MAX = Number(process.argv[3] || 1e9);
const PAUSE = 800;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(CACHE, { recursive: true });

export const SOURCES = {
  rema: { name: "REMA 1000", sitemaps: ["https://www.rema.no/sitemap.xml"], match: /^https:\/\/www\.rema\.no\/oppskrifter\/[^/]+\/[^/]+\/$/ },
  coop: { name: "Coop", sitemaps: ["https://www.coop.no/api/sitemap/nb-NO/0/sitemap.xml"], match: /^https:\/\/www\.coop\.no\/oppskrifter\/.+\/[^/]+$/ },
  kiwi: { name: "KIWI", sitemaps: ["https://kiwi.no/sitemap/recipes.xml"], match: /^https:\/\/kiwi\.no\/oppskrifter\/[^/]+\/[^/]+$/ },
};

async function get(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xml" }, redirect: "follow" });
      if (res.status === 404 || res.status === 410) return null;
      if (!res.ok) throw new Error("status " + res.status);
      return await res.text();
    } catch {
      await sleep(5000 * (i + 1));
    }
  }
  return null;
}

async function crawl(id) {
  const src = SOURCES[id];
  const dir = path.join(CACHE, id);
  fs.mkdirSync(dir, { recursive: true });
  const urls = [];
  for (const sm of src.sitemaps) {
    const xml = (await get(sm)) || "";
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) if (src.match.test(m[1].trim())) urls.push(m[1].trim());
  }
  const list = [...new Set(urls)].slice(0, MAX);
  console.log(`${id}: ${list.length} oppskrifter`);
  let n = 0, ok = 0;
  for (const url of list) {
    n++;
    const file = path.join(dir, encodeURIComponent(url).slice(0, 200) + ".json");
    if (fs.existsSync(file)) continue;
    const html = await get(url);
    const r = html && recipeFrom(html, url);
    fs.writeFileSync(file, JSON.stringify(r));
    if (r) ok++;
    if (n % 100 === 0) console.log(`${id}: ${n}/${list.length} (${ok} nye med oppskriftsdata)`);
    await sleep(PAUSE);
  }
  console.log(`${id}: ferdig, ${n} sider`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await Promise.all(Object.keys(SOURCES).map(crawl)); // ett nettsted per «tråd», aldri flere samtidig mot samme side
}
