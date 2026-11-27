// Mengder i ingredienslinjer: les «500 g kjøttdeig», regn om til et annet antall porsjoner og lag en
// handlelistevare som «Kjøttdeig (800 g)». Brukes av Restefest (i nettleseren) og tools/bygg-mengder.mjs.

export const SHARDS = 32;
// Hvilken mengder/NN.json en oppskrift ligger i (FNV-1a av lenken).
export function shardOf(url) {
  let h = 2166136261;
  for (let i = 0; i < url.length; i++) h = Math.imul(h ^ url.charCodeAt(i), 16777619);
  return (h >>> 0) % SHARDS;
}
export const shardFile = (url) => `${String(shardOf(url)).padStart(2, "0")}.json`;

const FRAC = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3 };
const NUM = String.raw`(?:\d+\s*[½¼¾⅓⅔]|\d+[.,]\d+|\d+\s*\/\s*\d+|\d+|[½¼¾⅓⅔])`;
const num = (t) => {
  t = t.replace(/\s+/g, "");
  const mixed = /^(\d+)([½¼¾⅓⅔])$/.exec(t);
  if (mixed) return +mixed[1] + FRAC[mixed[2]];
  if (FRAC[t]) return FRAC[t];
  const f = /^(\d+)\/(\d+)$/.exec(t);
  if (f) return +f[1] / +f[2];
  return parseFloat(t.replace(",", "."));
};

// Enheter, med hvordan de rundes av på handlelisten
const WEIGHT = ["g", "gram", "ml", "milliliter"];
const BIG = ["kg", "kilo", "l", "liter", "hg"];
const SPOON = ["dl", "cl", "ss", "ts", "krm", "spiseskje", "spiseskjeer", "teskje", "teskjeer", "kopp", "kopper", "cup", "cups"];
const COUNT = ["stk", "stk.", "stykk", "stykker", "fedd", "skive", "skiver", "bit", "biter", "filet", "fileter", "plate", "plater", "ark", "blad", "kvast", "kvister", "kvist", "stilk", "stilker", "neve", "never", "klype", "klyper", "dråpe", "dråper", "porsjon", "porsjoner"];
const PACK = ["pakke", "pakker", "pk", "pk.", "boks", "bokser", "glass", "pose", "poser", "bunt", "bunter", "beger", "flaske", "flasker", "tube", "nett", "kurv", "brett", "dåse", "potte", "potter", "pakning", "brikke", "rull", "eske"];
const UNITS = new Set([...WEIGHT, ...BIG, ...SPOON, ...COUNT, ...PACK]);
const SHOW_UNIT = { gram: "g", milliliter: "ml", kilo: "kg", liter: "l", stykk: "", stykker: "", stk: "", "stk.": "", "pk.": "pk", spiseskje: "ss", spiseskjeer: "ss", teskje: "ts", teskjeer: "ts" };

// «500 g kjøttdeig» → { qty: 500, qty2: null, unit: "g", name: "kjøttdeig" }. Uten mengde: qty = null.
export function parseLine(line) {
  const s = String(line || "").replace(/\s+/g, " ").trim();
  const m = new RegExp(String.raw`^(${NUM})(?:\s*[-–]\s*(${NUM}))?\s*(.*)$`).exec(s);
  if (!m) return { qty: null, qty2: null, unit: "", name: s };
  let rest = m[3];
  let unit = "";
  const w = /^([^\s]+)\s+(.*)$/.exec(rest);
  if (w) {
    const first = w[1].toLowerCase();
    const parts = first.split("/");
    if (UNITS.has(first) || parts.every((p) => UNITS.has(p))) { unit = first; rest = w[2]; }
  } else if (UNITS.has(rest.toLowerCase())) { unit = rest.toLowerCase(); rest = ""; }
  return { qty: num(m[1]), qty2: m[2] ? num(m[2]) : null, unit, name: rest.replace(/^(av|med)\s+/i, "") };
}

const kind = (unit) => {
  const u = unit.split("/")[0];
  if (WEIGHT.includes(u)) return "weight";
  if (BIG.includes(u)) return "big";
  if (SPOON.includes(u)) return "spoon";
  if (PACK.includes(u)) return "pack";
  return "count"; // stk, fedd … og tall uten enhet («3 egg»)
};
const fmt = (n) => (Math.round(n * 100) / 100).toLocaleString("nb-NO", { maximumFractionDigits: 2 });
// Rund av slik man handler: hele pakker og stykk, gram til nærmeste 5/10, skjeer til nærmeste halve.
function roundFor(q, unit) {
  switch (kind(unit)) {
    case "weight": return q >= 100 ? Math.round(q / 10) * 10 : q >= 10 ? Math.round(q / 5) * 5 : Math.max(1, Math.round(q));
    case "big": return Math.max(0.1, Math.round(q * 10) / 10);
    case "spoon": return q < 0.5 ? Math.round(q * 4) / 4 || 0.25 : Math.round(q * 2) / 2;
    default: return Math.max(1, Math.ceil(q - 0.01));
  }
}

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
// Navnet på varen: det før komma («Vesterhavsost, finrevet» → «Vesterhavsost»)
export const itemName = (p) => cap(p.name.split(/,|\(/)[0].trim() || p.name.trim());

// Vare til handlelisten, regnet om med faktor (porsjoner man vil lage / porsjoner i oppskriften).
export function shoppingText(line, factor = 1) {
  const p = parseLine(line);
  const name = itemName(p);
  if (p.qty == null || !name) return name || String(line);
  let u = p.unit.split("/")[0]; // «pose/bunt» → «pose»
  let f = factor;
  // 1000 g eller mer skrives i kg
  if ((u === "g" || u === "gram") && Math.max(p.qty, p.qty2 || 0) * f >= 1000) { u = "kg"; f /= 1000; }
  const unit = SHOW_UNIT[u] ?? u;
  let q = roundFor(p.qty * f, u);
  let q2 = p.qty2 != null ? roundFor(p.qty2 * f, u) : null;
  if (q2 != null && q2 <= q) q2 = null;
  const amount = `${fmt(q)}${q2 != null ? "–" + fmt(q2) : ""}${unit ? " " + unit : ""}`;
  return `${name} (${amount})`;
}

// Navnet uten mengde, for å se om en vare allerede står på listen: «Kjøttdeig (800 g)» → «kjøttdeig»
export const bareName = (text) => String(text).replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase();
