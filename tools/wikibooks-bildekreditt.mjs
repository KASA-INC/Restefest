// Henter fotograf og lisens for bildene i public/restefest/wikibooks-no.json fra Wikimedia,
// slik at oppskriftssiden kan kreditere dem. Bilder uten kjent fri lisens fjernes.
//
//   node tools/wikibooks-bildekreditt.mjs
import fs from "node:fs";

const FILE = new URL("../public/restefest/wikibooks-no.json", import.meta.url);
const HEADERS = { "User-Agent": "UkaRestefest/1.0 (oppskriftsimport; engangsjobb)" };
const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileOf = (u) => { const url = u.split("?")[0]; return decodeURIComponent((url.match(/\/thumb\/[0-9a-f]\/[0-9a-f]{2}\/([^/]+)\//) || url.match(/\/[0-9a-f]\/[0-9a-f]{2}\/([^/]+)$/) || [])[1] || ""); };
const text = (html = "") => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

const meals = Object.values(data.meals).filter((m) => m.image);
const byFile = new Map();
for (const m of meals) { const f = fileOf(m.image); if (f) (byFile.get(f) || byFile.set(f, []).get(f)).push(m); }
const files = [...byFile.keys()];
let ok = 0, removed = 0;
for (let i = 0; i < files.length; i += 50) {
  const titles = files.slice(i, i + 50).map((f) => `File:${f}`).join("|");
  const params = new URLSearchParams({ action: "query", format: "json", formatversion: "2", prop: "imageinfo", iiprop: "extmetadata|url", titles });
  const res = await (await fetch(`https://en.wikibooks.org/w/api.php?${params}`, { headers: HEADERS })).json();
  const norm = new Map((res.query.normalized || []).map((n) => [n.to, n.from]));
  for (const p of res.query.pages) {
    const info = p.imageinfo?.[0];
    const meta = info?.extmetadata || {};
    const license = text(meta.LicenseShortName?.value);
    const free = /CC|Public domain|GFDL|PD/i.test(license);
    const file = (norm.get(p.title) || p.title).replace(/^File:/, "");
    for (const m of byFile.get(file) || byFile.get(file.replace(/ /g, "_")) || []) {
      if (free) { m.imageCredit = { artist: text(meta.Artist?.value).slice(0, 80), license, page: info.descriptionurl }; ok++; }
      else { m.image = ""; delete m.imageCredit; removed++; }
    }
  }
  await sleep(1000);
}
for (const m of meals) if (m.image && !m.imageCredit) { m.image = ""; removed++; }
fs.writeFileSync(FILE, JSON.stringify(data));
console.log(`${ok} bilder kreditert, ${removed} fjernet (ukjent lisens)`);
