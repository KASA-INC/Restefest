// Velger ut de beste oppskriftene fra Wikibooks (fra tools/hent-wikibooks.mjs) for oversettelse.
// Krav: egen ingrediensliste der (nesten) alle linjer har mengde, minst 3 steg i fremgangsmåten,
// ingen «stub»/opprydningsmaler, ikke drikke, og ikke samme rett som i TheMealDB.
// Skriver en renset utgave (ren tekst i stedet for wikitekst) av de beste.
//
//   node tools/velg-wikibooks.mjs <wikibooks-raw.json> <ut-fil.json> [antall=700]
import fs from "node:fs";

const [RAW = "wikibooks-raw.json", OUT = "wikibooks-utvalg.json", N = "700"] = process.argv.slice(2);
const raw = JSON.parse(fs.readFileSync(RAW, "utf8"));
const mealdbFile = new URL("../public/restefest/themealdb-no.json", import.meta.url);
const norm = (s) => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z]/g, "");
const mealdb = new Set(fs.existsSync(mealdbFile) ? Object.values(JSON.parse(fs.readFileSync(mealdbFile, "utf8")).meals).map((m) => norm(m.original)) : []);

// Wikitekst → ren tekst
function clean(s) {
  let prev;
  do { // {{convert|8|oz|g|...}} → «8 oz», nøstede maler innenfra og ut
    prev = s;
    s = s.replace(/\{\{\s*convert\s*\|([^|{}]+)\|([^|{}]+)(?:\|([^|{}]+))?(?:\|[^{}]*)?\}\}/gi, (_, a, b, c) =>
      /^(to|-|–|and|or|by|x)$/i.test(b.trim()) && c ? `${a.trim()}–${c.trim()}` : `${a.trim()} ${b.trim()}`);
    s = s.replace(/\{\{\s*(frac|fraction)\s*\|([^{}]*)\}\}/gi, (_, __, a) => a.split("|").join("/"));
    s = s.replace(/\{\{[^{}]*\}\}/g, "");
  } while (s !== prev);
  return s
    .replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\[\[(?:File|Image|Fil|Category):[^\]]*(\[\[[^\]]*\]\][^\]]*)*\]\]/gi, "")
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1")
    .replace(/\[\[([^\]]*)\]\]/g, (_, a) => a.replace(/^Cookbook:\s*/, ""))
    .replace(/\[https?:\S+\s([^\]]*)\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function sections(text) {
  const out = [];
  let cur = { head: "", lines: [] };
  for (const line of text.split("\n")) {
    const h = line.match(/^(=+)\s*(.+?)\s*=+\s*$/);
    if (h) { out.push(cur); cur = { head: h[2].toLowerCase(), level: h[1].length, lines: [] }; } else cur.lines.push(line);
  }
  out.push(cur);
  return out;
}

const QTY = /\d|[¼½¾⅓⅔⅛]|\b(one|two|three|four|five|six|eight|ten|twelve|a|an|half|dozen|pinch|dash|handful|few|some|several)\b/i;
const TO_TASTE = /to taste|as needed|for (garnish|serving|frying|greasing|dusting)|optional/i;
const BAD = /\{\{\s*(stub|cleanup|incomplete|rfd|delete|split|merge|copyvio|unreferenced recipe|attention|wikify|expand)/i;
const DRINK = /beverage|cocktail|drink|tea recipes|coffee|smoothie|punch|liqueur|wine recipes|beer/i;

const picked = [];
let reasons = {};
const no = (r) => { reasons[r] = (reasons[r] || 0) + 1; };
for (const p of raw) {
  if (BAD.test(p.text)) { no("mal"); continue; }
  const sum = p.text.match(/\{\{\s*recipe ?summary([\s\S]*?)\}\}/i)?.[1] || "";
  const field = (k) => sum.match(new RegExp(`\\|\\s*${k}\\s*=\\s*([^|\\n}]*)`, "i"))?.[1].trim() || "";
  const category = field("category");
  if (DRINK.test(category) || DRINK.test(p.title)) { no("drikke"); continue; }
  if (mealdb.has(norm(p.title))) { no("finnes i TheMealDB"); continue; }

  const secs = sections(p.text);
  const ingredients = [], steps = [], notes = [];
  let mode = null;
  for (const s of secs) {
    if (/ingredient/.test(s.head)) mode = "ing";
    else if (/procedure|directions|method|instructions|preparation|steps/.test(s.head)) mode = "proc";
    else if (/notes|tips|variation|warning|serving/.test(s.head)) mode = "notes";
    else if (/equipment|reference|see also|external|nutrition|conversion|gallery/.test(s.head)) mode = null;
    else if (s.level > 2 && mode) { /* underseksjon (f.eks. «Filling») hører til forrige hoveddel */ }
    else if (mode === "ing" || mode === "proc") { /* deloverskrift som «Dough» – behold modus */ }
    else mode = null;
    const sub = s.level > 2 && /ingredient|procedure/.test(s.head) ? "" : s.head;
    for (const line of s.lines) {
      const m = line.match(/^([*#]+)\s*(.*)$/);
      if (!m) continue;
      const t = clean(m[2]);
      if (!t) continue;
      if (mode === "ing") ingredients.push(sub && !/ingredient/.test(sub) ? `[${sub}] ${t}` : t);
      else if (mode === "proc") steps.push(t);
      else if (mode === "notes") notes.push(t);
    }
  }
  if (ingredients.length < 4) { no("for få ingredienser"); continue; }
  const counted = ingredients.filter((l) => !TO_TASTE.test(l));
  const withQty = counted.filter((l) => QTY.test(l.replace(/^\[[^\]]*\]\s*/, "")));
  const ratio = counted.length ? withQty.length / counted.length : 0;
  if (ratio < 0.9) { no("mangler mengder"); continue; }
  const stepText = steps.join(" ");
  if (steps.length < 3 || stepText.length < 250) { no("for kort fremgangsmåte"); continue; }
  const size = ingredients.join("\n").length + stepText.length + notes.join(" ").length;
  if (size > 9000) { no("for lang"); continue; }

  const score = ratio * 4
    + Math.min(ingredients.length, 15) / 5
    + Math.min(steps.length, 10) / 4
    + (p.image ? 2 : 0)
    + (field("servings") ? 1 : 0)
    + (field("time") ? 1 : 0)
    + (/\d/.test(stepText) ? 0.5 : 0) // tider/temperaturer i stegene
    - (ingredients.length > 25 ? 1 : 0);
  picked.push({ id: p.id, title: p.title, url: `https://en.wikibooks.org/wiki/Cookbook:${encodeURIComponent(p.title.replace(/ /g, "_"))}`,
    image: p.image, category, servings: field("servings"), time: field("time"), ingredients, steps, notes: notes.slice(0, 6), score });
}
picked.sort((a, b) => b.score - a.score);
const chosen = picked.slice(0, Number(N));
fs.writeFileSync(OUT, JSON.stringify(chosen));
console.log(`${raw.length} sider, ${picked.length} godkjent, valgte ${chosen.length} (${chosen.filter((c) => c.image).length} med bilde)`);
console.log("forkastet:", reasons);
