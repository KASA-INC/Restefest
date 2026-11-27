// Restefest: finn oppskrifter som bruker restene dine. Søket skjer her i nettleseren mot oppskriftsbasen
// (oppskrifter.json), så det er raskt og gratis, og ingen data sendes noe sted.
import { matches, normQuery, isBasic, DEFAULT_BASICS } from "./ingredienser.js";

const $ = (s) => document.querySelector(s);
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem("restefest:" + k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem("restefest:" + k, JSON.stringify(v)); } catch {} },
};
const PAGE = 40;

// Familiekoden fra Uka (samme nettsted), så familiens egne oppskrifter kommer med i søket.
const code = (() => { try { return localStorage.getItem("code"); } catch { return null; } })();
let mine = []; // [tittel, lenke, -1, bilde, minutter, [], ingredienser, nettsted]
let db = null; // { sources, recipes: [[tittel, lenke, kilde, bilde, minutter, kategorier, ingredienser]] }
let vocab = []; // ingredienser etter hvor ofte de brukes, til forslag
let have = store.get("have", []);
let useBasics = store.get("basics", true);
let basics = store.get("basicsList", DEFAULT_BASICS);
let minUse = store.get("use", 1); // hvor mange av restene en oppskrift minst må bruke (99 = alle)
let shown = PAGE;

async function load() {
  $("#status").textContent = "Henter oppskrifter …";
  try {
    const res = await fetch("oppskrifter.json");
    db = await res.json();
  } catch {
    $("#status").textContent = "Kunne ikke hente oppskriftene. Prøv igjen senere.";
    return;
  }
  const count = new Map();
  for (const r of db.recipes) for (const k of r[6]) count.set(k, (count.get(k) || 0) + 1);
  vocab = [...count].filter(([k, n]) => n >= 3 && !isBasic(k, ["salt", "pepper", "vann", "sukker", "hvetemel", "buljong"])).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const s = db.sources;
  $("#sources").textContent = s.length > 1 ? `${s.slice(0, -1).join(", ")} og ${s.at(-1)}` : s[0];
  $("#built").textContent = `${db.recipes.length.toLocaleString("nb-NO")} oppskrifter, oppdatert ${new Date(db.built).toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric" })}`;
  render();
}

async function loadMine() {
  if (!code) { $("#noFamily").hidden = false; return; }
  $("#mineBox").hidden = false;
  try {
    const res = await fetch(`/api/recipes/${encodeURIComponent(code)}`);
    const { recipes } = await res.json();
    mine = recipes.map((r) => [r.title, r.url, -1, r.image, r.time, [], r.keys, r.host]);
    $("#mineStatus").textContent = mine.length ? `${mine.length} ${mine.length === 1 ? "oppskrift" : "oppskrifter"} fra familien` : "Ingen ennå.";
    render();
  } catch {}
}

// Hvor godt passer en oppskrift? Ingredienser du har, og de som mangler (basisvarer regnes som «har» hvis valgt).
function score(r) {
  const used = [], need = [];
  for (const k of r[6]) {
    const hit = have.find((q) => matches(q, k));
    if (hit) used.push(k);
    else if (!(useBasics && isBasic(k, basics))) need.push(k);
  }
  return { used, need };
}

function search() {
  if (!have.length) return [];
  const out = [];
  const seen = new Set(mine.map((r) => r[1]));
  for (const r of [...mine, ...(db ? db.recipes.filter((x) => !seen.has(x[1])) : [])]) {
    const s = score(r);
    if (!s.used.length) continue;
    // Hvor mange av restene dine oppskriften bruker (ikke hvor mange linjer som treffer)
    const restsUsed = have.filter((q) => r[6].some((k) => matches(q, k))).length;
    if (restsUsed < Math.min(minUse, have.length)) continue;
    out.push({ r, ...s, restsUsed });
  }
  // Først flest av restene dine, så færrest ingredienser som mangler, så familiens egne, så korteste tid.
  out.sort((a, b) => b.restsUsed - a.restsUsed || a.need.length - b.need.length || (b.r[2] < 0) - (a.r[2] < 0) || (a.r[4] || 999) - (b.r[4] || 999));
  return out;
}

const joinList = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} og ${xs.at(-1)}`);

function card({ r, used, need }) {
  const [title, url, src, img, min] = r;
  const li = document.createElement("li");
  const a = document.createElement("a");
  a.className = "rec";
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  if (img) {
    const im = document.createElement("img");
    im.src = img; im.alt = ""; im.loading = "lazy"; im.referrerPolicy = "no-referrer";
    im.onerror = () => im.replaceWith(Object.assign(document.createElement("div"), { className: "noimg" }));
    a.append(im);
  } else a.append(Object.assign(document.createElement("div"), { className: "noimg" }));
  const body = document.createElement("div");
  const h = document.createElement("h2"); h.textContent = title;
  const meta = document.createElement("div"); meta.className = "meta";
  meta.textContent = [src < 0 ? r[7] : db.sources[src], min ? `${min} min` : ""].filter(Boolean).join(" · ");
  if (src < 0) meta.insertAdjacentHTML("beforeend", '<span class="tag">Deres</span>');
  const use = document.createElement("div"); use.className = "use";
  use.innerHTML = "Bruker <b></b>"; use.querySelector("b").textContent = joinList([...new Set(used)]);
  body.append(h, meta, use);
  if (need.length) {
    const n = document.createElement("div"); n.className = "need";
    n.innerHTML = "Mangler <b></b>"; n.querySelector("b").textContent = joinList(need);
    body.append(n);
  } else {
    const n = document.createElement("div"); n.className = "all"; n.textContent = "Du har alt";
    body.append(n);
  }
  a.append(body);
  li.append(a);
  return li;
}

function render() {
  $("#have").replaceChildren(...have.map((q) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button"; b.textContent = q; b.setAttribute("aria-label", `Fjern ${q}`);
    b.onclick = () => { have = have.filter((x) => x !== q); save(); };
    li.append(b);
    return li;
  }));
  $("#haveEmpty").hidden = have.length > 0;
  $("#basics").checked = useBasics;
  $("#basicsCount").textContent = `(${basics.length})`;
  $("#basicsList").replaceChildren(...basics.map((b) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button"; btn.textContent = b; btn.setAttribute("aria-label", `Fjern ${b} fra basisvarene`);
    btn.onclick = () => saveBasics(basics.filter((x) => x !== b));
    li.append(btn);
    return li;
  }));
  document.querySelectorAll("[data-use]").forEach((b) => {
    const n = Number(b.dataset.use);
    b.classList.toggle("on", n === minUse);
    b.disabled = n !== 99 && n > Math.max(have.length, 1); // «minst 3» gir ingen mening med to rester
  });
  const m = $("#matprat");
  m.hidden = !have.length;
  m.href = `https://www.matprat.no/sok?category=recipes&page=1&searchFor=${encodeURIComponent(have.join(" "))}&sort=relevant`;
  if (!db && !mine.length) return;
  const hits = search();
  $("#status").textContent = !have.length ? "" : hits.length
    ? `${hits.length.toLocaleString("nb-NO")} ${hits.length === 1 ? "oppskrift" : "oppskrifter"}`
    : minUse > 1 ? "Ingen oppskrifter bruker så mange av restene. Prøv et lavere tall under «Må bruke minst»." : "Ingen oppskrifter bruker dette.";
  $("#results").replaceChildren(...hits.slice(0, shown).map(card));
  $("#more").hidden = hits.length <= shown;
}

function save() {
  store.set("have", have);
  shown = PAGE;
  render();
}

// Legger til én eller flere rester (skilt med komma, semikolon eller linjeskift).
function add(text, keepFocus = true) {
  for (const part of text.split(/[,;\n]+/)) {
    const q = normQuery(part);
    if (q && !have.includes(q)) have.push(q);
  }
  $("#addInput").value = "";
  $("#suggest").replaceChildren();
  save();
  if (keepFocus) $("#addInput").focus();
}

$("#addForm").onsubmit = (e) => { e.preventDefault(); if ($("#addInput").value.trim()) add($("#addInput").value); };
$("#addInput").oninput = () => {
  // Tagg-metode: komma (eller semikolon) gjør det som står foran til et merke med en gang
  if (/^\s+$/.test($("#addInput").value)) $("#addInput").value = ""; // mellomrom etter komma
  const v = $("#addInput").value;
  if (/[,;]/.test(v)) {
    const parts = v.split(/[,;]/);
    const rest = parts.pop();
    add(parts.join(","));
    $("#addInput").value = rest.trimStart();
  }
  const q = normQuery($("#addInput").value);
  const list = q.length >= 2 ? vocab.filter((k) => k.startsWith(q) && !have.includes(k)).slice(0, 8) : [];
  $("#suggest").replaceChildren(...list.map((k) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button"; b.textContent = k;
    b.onclick = () => { add(k); $("#addInput").focus(); };
    li.append(b);
    return li;
  }));
};
function saveBasics(list) {
  basics = list;
  store.set("basicsList", basics);
  shown = PAGE;
  render();
}
$("#basicsForm").onsubmit = (e) => {
  e.preventDefault();
  const add = $("#basicsInput").value.split(/[,;]+/).map((x) => normQuery(x)).filter((x) => x && !basics.includes(x));
  $("#basicsInput").value = "";
  if (add.length) saveBasics([...basics, ...add]);
};
$("#basicsReset").onclick = () => { if (confirm("Tilbakestille basisvarene til standardlisten?")) saveBasics([...DEFAULT_BASICS]); };
$("#addInput").onkeydown = (e) => {
  // Backspace i tomt felt fjerner det siste merket
  if (e.key === "Backspace" && !e.target.value && have.length) { have.pop(); save(); }
};
$("#addInput").onpaste = (e) => {
  const t = e.clipboardData?.getData("text") || "";
  if (/[,;\n]/.test(t)) { e.preventDefault(); add(t); }
};
$("#tagbox").onclick = (e) => { if (e.target === e.currentTarget) $("#addInput").focus(); };
document.querySelectorAll(".ex").forEach((b) => (b.onclick = () => add(b.textContent)));
$("#basics").onchange = (e) => { useBasics = e.target.checked; store.set("basics", useBasics); shown = PAGE; render(); };
document.querySelectorAll("[data-use]").forEach((b) => (b.onclick = () => { minUse = Number(b.dataset.use); store.set("use", minUse); shown = PAGE; render(); }));
$("#more").onclick = () => { shown += PAGE; render(); };

$("#linkForm").onsubmit = async (e) => {
  e.preventDefault();
  const url = $("#linkInput").value.trim();
  if (!url) return;
  $("#mineStatus").textContent = "Leser oppskriften …";
  try {
    const res = await fetch(`/api/recipes/${encodeURIComponent(code)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
    const out = await res.json();
    if (!out.ok) { $("#mineStatus").textContent = out.error || "Kunne ikke lese oppskriften."; return; }
    $("#linkInput").value = "";
    await loadMine();
    $("#mineStatus").textContent = `La til «${out.recipe.title}».`;
  } catch {
    $("#mineStatus").textContent = "Kunne ikke lese oppskriften.";
  }
};

render();
load();
loadMine();
