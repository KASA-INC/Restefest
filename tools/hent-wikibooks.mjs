// Henter alle oppskrifter i Category:Recipes fra den engelske Wikibooks-kokeboka (wikitekst + hovedbilde).
// Innholdet er lisensiert under CC BY-SA 4.0: oversettelser må krediteres og deles under samme lisens.
//
//   node tools/hent-wikibooks.mjs <ut-fil.json>
import fs from "node:fs";

const out = process.argv[2] || "wikibooks-raw.json";
const API = "https://en.wikibooks.org/w/api.php";
const HEADERS = { "User-Agent": "UkaRestefest/1.0 (oppskriftsimport; engangsjobb)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pages = [];
let cont = {};
for (;;) {
  const params = new URLSearchParams({
    action: "query", format: "json", formatversion: "2", maxlag: "5",
    generator: "categorymembers", gcmtitle: "Category:Recipes", gcmnamespace: "102", gcmlimit: "50",
    prop: "revisions|pageimages", rvprop: "content", rvslots: "main", piprop: "thumbnail", pithumbsize: "800",
    ...cont,
  });
  const res = await fetch(`${API}?${params}`, { headers: HEADERS });
  if (res.status === 429 || res.headers.get("retry-after")) { await sleep(10000); continue; }
  const data = await res.json();
  if (data.error?.code === "maxlag") { await sleep(5000); continue; }
  for (const p of data.query?.pages || []) {
    const text = p.revisions?.[0]?.slots?.main?.content;
    if (text) pages.push({ id: p.pageid, title: p.title.replace(/^Cookbook:/, ""), text, image: p.thumbnail?.source || "" });
  }
  process.stdout.write(`\r${pages.length} sider`);
  if (!data.continue) break;
  cont = data.continue;
  await sleep(1000);
}
fs.writeFileSync(out, JSON.stringify(pages));
console.log(`\n${pages.length} oppskrifter → ${out}`);
