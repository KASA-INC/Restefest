// Restefest: finn oppskrifter som bruker restene dine. Søket skjer her i nettleseren mot oppskriftsbasen
// (oppskrifter.json), så det er raskt og gratis, og ingen data sendes noe sted.
import { matches, normQuery, isBasic } from "./ingredienser.js";

const $ = (s) => document.querySelector(s);
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem("restefest:" + k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem("restefest:" + k, JSON.stringify(v)); } catch {} },
};
const PAGE = 40;

let db = null; // { sources, recipes: [[tittel, lenke, kilde, bilde, minutter, kategorier, ingredienser]] }
let vocab = []; // ingredienser etter hvor ofte de brukes, til forslag
let have = store.get("have", []);
let useBasics = store.get("basics", true);
let maxMiss = store.get("miss", 99);
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
  vocab = [...count].filter(([k, n]) => n >= 3 && !isBasic(k)).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const s = db.sources;
  $("#sources").textContent = s.length > 1 ? `${s.slice(0, -1).join(", ")} og ${s.at(-1)}` : s[0];
  $("#built").textContent = `${db.recipes.length.toLocaleString("nb-NO")} oppskrifter, oppdatert ${new Date(db.built).toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric" })}`;
  render();
}

// Hvor godt passer en oppskrift? Ingredienser du har, og de som mangler (basisvarer regnes som «har» hvis valgt).
function score(r) {
  const used = [], need = [];
  for (const k of r[6]) {
    const hit = have.find((q) => matches(q, k));
    if (hit) used.push(k);
    else if (!(useBasics && isBasic(k))) need.push(k);
  }
  return { used, need };
}

function search() {
  if (!db || !have.length) return [];
  const out = [];
  for (const r of db.recipes) {
    const s = score(r);
    if (!s.used.length || s.need.length > maxMiss) continue;
    // Hvor mange av restene dine oppskriften bruker (ikke hvor mange linjer som treffer)
    const restsUsed = have.filter((q) => r[6].some((k) => matches(q, k))).length;
    out.push({ r, ...s, restsUsed });
  }
  out.sort((a, b) => a.need.length - b.need.length || b.restsUsed - a.restsUsed || (a.r[4] || 999) - (b.r[4] || 999));
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
  meta.textContent = [db.sources[src], min ? `${min} min` : ""].filter(Boolean).join(" · ");
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
  document.querySelectorAll("[data-miss]").forEach((b) => b.classList.toggle("on", Number(b.dataset.miss) === maxMiss));
  if (!db) return;
  const hits = search();
  $("#status").textContent = !have.length ? "" : hits.length
    ? `${hits.length.toLocaleString("nb-NO")} ${hits.length === 1 ? "oppskrift" : "oppskrifter"}`
    : maxMiss < 99 ? "Ingen oppskrifter passer. Prøv å tillate flere manglende ingredienser." : "Ingen oppskrifter bruker dette.";
  $("#results").replaceChildren(...hits.slice(0, shown).map(card));
  $("#more").hidden = hits.length <= shown;
}

function save() {
  store.set("have", have);
  shown = PAGE;
  render();
}

function add(text) {
  for (const part of text.split(/[,;]+/)) {
    const q = normQuery(part);
    if (q && !have.includes(q)) have.push(q);
  }
  $("#addInput").value = "";
  $("#suggest").replaceChildren();
  save();
}

$("#addForm").onsubmit = (e) => { e.preventDefault(); if ($("#addInput").value.trim()) add($("#addInput").value); };
$("#addInput").oninput = () => {
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
document.querySelectorAll(".ex").forEach((b) => (b.onclick = () => add(b.textContent)));
$("#basics").onchange = (e) => { useBasics = e.target.checked; store.set("basics", useBasics); shown = PAGE; render(); };
document.querySelectorAll("[data-miss]").forEach((b) => (b.onclick = () => { maxMiss = Number(b.dataset.miss); store.set("miss", maxMiss); shown = PAGE; render(); }));
$("#more").onclick = () => { shown += PAGE; render(); };

render();
load();
