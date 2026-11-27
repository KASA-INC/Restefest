// Restefest: finn oppskrifter som bruker restene dine – eller søk på vanlig måte etter navn, ingrediens eller type rett.
// Søket skjer i nettleseren mot oppskriftsbasen
// (oppskrifter.json) og familiens egne oppskrifter, så det er raskt og gratis.
//
// Brukes to steder: som fane i Uka og som egen side (/restefest/). Begge kaller mountRestefest(element, valg).
//   valg.familyRecipes()                     → familiens oppskrifter [{ url, title, image, time, keys, host }]
//   valg.menuWeek()                          → { key, label, days: [{ day, label, dish }] } – uken man kan legge i
//   valg.addToMenu(week, day, title, url)    → legger oppskriften i ukemenyen (bare i Uka)
//   valg.importLink(url)                     → leser inn en oppskrift fra en lenke → { ok, recipe, error }
//   valg.toast(tekst)                        → kort beskjed
import { matches, normQuery, isBasic, DEFAULT_BASICS } from "./ingredienser.js";

const PAGE = 40;
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem("restefest:" + k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem("restefest:" + k, JSON.stringify(v)); } catch {} },
};
const CATS = ["Middag", "Kylling", "Fisk", "Kjøttdeig", "Vegetar", "Pasta", "Suppe", "Pizza", "Dessert", "Bakst"];
// Små bokstaver og uten aksenter (men å, æ og ø beholdes).
const fold = (t) => String(t || "").toLowerCase().replace(/[éèêë]/g, "e").replace(/[áàâä]/g, "a").replace(/[óòôö]/g, "o").replace(/[úùûü]/g, "u").replace(/[íìîï]/g, "i").replace(/[«»"“”()]/g, "");
const joinList = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} og ${xs.at(-1)}`);

const TEMPLATE = `
  <div class="rf-seg rf-mode" role="tablist" aria-label="Måte å finne oppskrifter på">
    <button type="button" role="tab" data-mode="rest">Fra rester</button><button type="button" role="tab" data-mode="search">Søk</button>
  </div>

  <section class="rf-card" data-rf="searchBox" hidden>
    <form class="rf-add" data-rf="searchForm" autocomplete="off" role="search">
      <input data-rf="searchInput" type="search" placeholder="Søk etter rett eller ingrediens, f.eks. lasagne" enterkeyhint="search" aria-label="Søk etter oppskrifter">
    </form>
    <ul class="rf-chips rf-cats" data-rf="cats" aria-label="Snarveier"></ul>
  </section>

  <section class="rf-card" data-rf="restBox">
    <form class="rf-add" data-rf="addForm" autocomplete="off">
      <div class="rf-tagbox" data-rf="tagbox">
        <ul class="rf-chips rf-have" data-rf="have" aria-label="Restene dine"></ul>
        <input data-rf="addInput" placeholder="Hva har du rester av? F.eks. kylling, ris …" enterkeyhint="done" aria-label="Legg til en rest – trykk Enter eller komma">
      </div>
      <button class="rf-plus" aria-label="Legg til">+</button>
    </form>
    <ul class="rf-chips rf-suggest" data-rf="suggest" aria-label="Forslag"></ul>
    <p class="rf-muted rf-small" data-rf="haveEmpty">Prøv for eksempel:
      <button type="button" class="rf-ex">kylling</button> <button type="button" class="rf-ex">ris</button>
      <button type="button" class="rf-ex">egg</button> <button type="button" class="rf-ex">potet</button>
      <button type="button" class="rf-ex">pasta</button> <button type="button" class="rf-ex">brokkoli</button></p>
    <div class="rf-opts">
      <label class="rf-check"><input type="checkbox" data-rf="basics" checked> <span>Regn med basisvarene mine</span></label>
      <div class="rf-row">
        <span>Må bruke minst</span>
        <div class="rf-seg" role="group" aria-label="Hvor mange av restene oppskriften minst må bruke">
          <button type="button" data-use="1">1</button><button type="button" data-use="2">2</button><button type="button" data-use="3">3</button><button type="button" data-use="99">Alle</button>
        </div>
      </div>
      <details class="rf-basics" data-rf="basicsBox">
        <summary>Basisvarer <span data-rf="basicsCount" class="rf-muted"></span></summary>
        <p class="rf-muted rf-small">Ting du som regel har i skapet. Oppskrifter regner dem som noe du har, så de ikke står under «Mangler».</p>
        <ul class="rf-chips rf-basic-chips" data-rf="basicsList" aria-label="Basisvarene dine"></ul>
        <form class="rf-add rf-small-add" data-rf="basicsForm" autocomplete="off">
          <input data-rf="basicsInput" placeholder="Legg til basisvare …" enterkeyhint="done" aria-label="Legg til basisvare">
          <button class="rf-plus" aria-label="Legg til basisvare">+</button>
        </form>
        <button type="button" class="rf-link" data-rf="basicsReset">Tilbakestill til standardlisten</button>
      </details>
    </div>
  </section>

  <div class="rf-bar">
    <p class="rf-status rf-muted" data-rf="status"></p>
    <a class="rf-ext" data-rf="matprat" target="_blank" rel="noopener" hidden>Søk på Matprat →</a>
  </div>
  <ul class="rf-results" data-rf="results"></ul>
  <button type="button" class="rf-more" data-rf="more" hidden>Vis flere</button>

  <section class="rf-card rf-mine" data-rf="mineBox" hidden>
    <h2>Deres oppskrifter</h2>
    <p class="rf-muted rf-small">Oppskrifter dere har lenket til i ukemenyen kommer med i søket. Du kan også lime inn en lenke her.</p>
    <form class="rf-add" data-rf="linkForm" autocomplete="off">
      <input data-rf="linkInput" type="url" inputmode="url" placeholder="https://… lenke til en oppskrift" aria-label="Lenke til en oppskrift">
      <button class="rf-plus" aria-label="Legg til oppskrift">+</button>
    </form>
    <p class="rf-muted rf-small" data-rf="mineStatus"></p>
  </section>

  <p class="rf-foot rf-muted rf-small">Oppskriftene er fra <span data-rf="sources">REMA 1000, Coop og KIWI</span>. Restefest viser bare tittel og ingredienser – trykk på en oppskrift for mengder og fremgangsmåte hos originalen. <span data-rf="built"></span></p>
`;

export function mountRestefest(root, opts = {}) {
  root.classList.add("rf");
  root.innerHTML = TEMPLATE;
  const $ = (name) => root.querySelector(`[data-rf="${name}"]`);
  const toast = opts.toast || (() => {});

  let db = null; // { sources, recipes: [[tittel, lenke, kilde, bilde, minutter, kategorier, ingredienser]] }
  let vocab = [];
  let have = store.get("have", []);
  let useBasics = store.get("basics", true);
  let basics = store.get("basicsList", DEFAULT_BASICS);
  let minUse = store.get("use", 1);
  let shown = PAGE;
  let mode = store.get("mode", "rest"); // "rest" = fra rester, "search" = vanlig søk
  let query = store.get("q", "");
  const index = new WeakMap(); // oppskrift → { title, cats, keys } i søkbar form

  // Familiens egne oppskrifter i samme form som basen: [tittel, lenke, -1, bilde, minutter, [], ingredienser, nettsted]
  const mine = () => (opts.familyRecipes?.() || []).map((r) => [r.title, r.url, -1, r.image, r.time, [], r.keys, r.host]);

  async function load() {
    $("status").textContent = "Henter oppskrifter …";
    try {
      db = await (await fetch(opts.dbUrl || "/restefest/oppskrifter.json")).json();
    } catch {
      $("status").textContent = "Kunne ikke hente oppskriftene. Prøv igjen senere.";
      return;
    }
    const count = new Map();
    for (const r of db.recipes) for (const k of r[6]) count.set(k, (count.get(k) || 0) + 1);
    vocab = [...count].filter(([k, n]) => n >= 3 && !isBasic(k, ["salt", "pepper", "vann", "sukker", "hvetemel", "buljong"])).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const s = db.sources;
    $("sources").textContent = s.length > 1 ? `${s.slice(0, -1).join(", ")} og ${s.at(-1)}` : s[0];
    $("built").textContent = `${db.recipes.length.toLocaleString("nb-NO")} oppskrifter, oppdatert ${new Date(db.built).toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric" })}.`;
    $("status").textContent = "";
    render();
  }

  function score(r) {
    const used = [], need = [];
    for (const k of r[6]) {
      if (have.some((q) => matches(q, k))) used.push(k);
      else if (!(useBasics && isBasic(k, basics))) need.push(k);
    }
    return { used, need };
  }

  function search() {
    if (!have.length) return [];
    const out = [];
    const own = mine();
    const seen = new Set(own.map((r) => r[1]));
    for (const r of [...own, ...(db ? db.recipes.filter((x) => !seen.has(x[1])) : [])]) {
      const s = score(r);
      if (!s.used.length) continue;
      const restsUsed = have.filter((q) => r[6].some((k) => matches(q, k))).length;
      if (restsUsed < Math.min(minUse, have.length)) continue;
      out.push({ r, ...s, restsUsed });
    }
    // Først flest av restene dine, så færrest ingredienser som mangler, så familiens egne, så korteste tid.
    out.sort((a, b) => b.restsUsed - a.restsUsed || a.need.length - b.need.length || (b.r[2] < 0) - (a.r[2] < 0) || (a.r[4] || 999) - (b.r[4] || 999));
    return out;
  }

  // Vanlig søk: hvert ord må finnes i tittelen, kategoriene eller ingrediensene. Treff i tittelen teller mest.
  function textSearch() {
    const q = fold(query).trim();
    if (!q) return [];
    const words = q.split(/\s+/).filter(Boolean);
    const own = mine();
    const seen = new Set(own.map((r) => r[1]));
    const out = [];
    for (const r of [...own, ...(db ? db.recipes.filter((x) => !seen.has(x[1])) : [])]) {
      let ix = index.get(r);
      if (!ix) { ix = { title: fold(r[0]), cats: fold((r[5] || []).join(" ")), keys: r[6] || [] }; index.set(r, ix); }
      let sc = 0;
      for (const w of words) {
        const nq = normQuery(w);
        const re = new RegExp(`(^|[^a-zæøå])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
        if (re.test(ix.title)) sc += 4;
        else if (ix.title.includes(w)) sc += 2;
        else if (ix.cats.includes(w)) sc += 1.5;
        else if (ix.keys.some((k) => k.includes(w) || (nq && matches(nq, k)))) sc += 1;
        else { sc = 0; break; }
      }
      if (!sc) continue;
      if (ix.title === q) sc += 10;
      else if (ix.title.startsWith(q)) sc += 3;
      out.push({ r, sc, used: [], need: [] });
    }
    out.sort((a, b) => b.sc - a.sc || (b.r[2] < 0) - (a.r[2] < 0) || (a.r[4] || 999) - (b.r[4] || 999) || a.r[0].localeCompare(b.r[0], "nb"));
    return out;
  }

  // Nedtrekksliste: legg oppskriften i ukemenyen (dagene i uken menuWeek() gir, normalt neste uke).
  function menuPicker(title, url) {
    const wk = opts.addToMenu && opts.menuWeek?.();
    if (!wk) return null;
    const sel = document.createElement("select");
    sel.className = "rf-menu";
    sel.setAttribute("aria-label", `Legg «${title}» i ukemenyen`);
    sel.append(new Option("+ Ukemeny", ""));
    const grp = document.createElement("optgroup");
    grp.label = wk.label;
    for (const d of wk.days) grp.append(new Option(d.dish ? `${d.label} (nå: ${d.dish})` : d.label, String(d.day)));
    sel.append(grp);
    sel.onchange = () => {
      const v = sel.value;
      sel.value = "";
      if (v === "") return;
      const day = Number(v);
      const d = wk.days.find((x) => x.day === day);
      if (d?.dish && !confirm(`${d.label} står det «${d.dish}». Bytte til «${title}»?`)) return;
      opts.addToMenu(wk.key, day, title, url);
      toast(`«${title}» lagt i ukemenyen ${d.label.toLowerCase()}`);
      render();
    };
    return sel;
  }

  function card({ r, used, need }) {
    const [title, url, src, img, min] = r;
    const li = document.createElement("li");
    li.className = "rf-rec";
    const a = document.createElement("a");
    a.className = "rf-rec-link";
    a.href = url; a.target = "_blank"; a.rel = "noopener";
    if (img) {
      const im = document.createElement("img");
      im.src = img; im.alt = ""; im.loading = "lazy"; im.referrerPolicy = "no-referrer";
      im.onerror = () => im.replaceWith(Object.assign(document.createElement("div"), { className: "rf-noimg" }));
      a.append(im);
    } else a.append(Object.assign(document.createElement("div"), { className: "rf-noimg" }));
    const body = document.createElement("div");
    const h = document.createElement("h3"); h.textContent = title;
    const meta = document.createElement("div"); meta.className = "rf-meta";
    meta.textContent = [src < 0 ? r[7] : db?.sources[src], min ? `${min} min` : ""].filter(Boolean).join(" · ");
    if (src < 0) meta.insertAdjacentHTML("beforeend", '<span class="rf-tag">Deres</span>');
    body.append(h, meta);
    if (mode === "search") {
      const keys = r[6] || [];
      const ing = document.createElement("div"); ing.className = "rf-need";
      ing.textContent = keys.length ? joinList(keys.slice(0, 8)) + (keys.length > 8 ? " …" : "") : "";
      body.append(ing);
    } else {
      const use = document.createElement("div"); use.className = "rf-use";
      use.innerHTML = "Bruker <b></b>"; use.querySelector("b").textContent = joinList([...new Set(used)]);
      const n = document.createElement("div");
      if (need.length) { n.className = "rf-need"; n.innerHTML = "Mangler <b></b>"; n.querySelector("b").textContent = joinList(need); }
      else { n.className = "rf-all"; n.textContent = "Du har alt"; }
      body.append(use, n);
    }
    a.append(body);
    li.append(a);
    const pick = menuPicker(title, url);
    if (pick) li.append(pick);
    return li;
  }

  function render() {
    const searching = mode === "search";
    root.querySelectorAll("[data-mode]").forEach((b) => { b.classList.toggle("on", b.dataset.mode === mode); b.setAttribute("aria-selected", String(b.dataset.mode === mode)); });
    $("searchBox").hidden = !searching;
    $("restBox").hidden = searching;
    if ($("searchInput").value !== query && document.activeElement !== $("searchInput")) $("searchInput").value = query;
    $("cats").replaceChildren(...CATS.map((c) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button"; b.textContent = c;
      b.classList.toggle("on", fold(query).trim() === fold(c));
      b.onclick = () => { query = c; store.set("q", query); $("searchInput").value = c; shown = PAGE; render(); };
      li.append(b);
      return li;
    }));
    $("have").replaceChildren(...have.map((q) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button"; b.textContent = q; b.setAttribute("aria-label", `Fjern ${q}`);
      b.onclick = () => { have = have.filter((x) => x !== q); save(); };
      li.append(b);
      return li;
    }));
    $("haveEmpty").hidden = have.length > 0;
    $("basics").checked = useBasics;
    $("basicsCount").textContent = `(${basics.length})`;
    $("basicsList").replaceChildren(...basics.map((b) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button"; btn.textContent = b; btn.setAttribute("aria-label", `Fjern ${b} fra basisvarene`);
      btn.onclick = () => saveBasics(basics.filter((x) => x !== b));
      li.append(btn);
      return li;
    }));
    root.querySelectorAll("[data-use]").forEach((b) => {
      const n = Number(b.dataset.use);
      b.classList.toggle("on", n === minUse);
      b.disabled = n !== 99 && n > Math.max(have.length, 1);
    });
    const m = $("matprat");
    const ext = searching ? query.trim() : have.join(" ");
    m.hidden = !ext;
    m.href = `https://www.matprat.no/sok?category=recipes&page=1&searchFor=${encodeURIComponent(ext)}&sort=relevant`;
    const own = mine();
    $("mineBox").hidden = !opts.importLink;
    if (!$("mineStatus").dataset.msg) $("mineStatus").textContent = own.length ? `${own.length} ${own.length === 1 ? "oppskrift" : "oppskrifter"} fra familien` : "Ingen ennå.";
    if (!db && !own.length) return;
    const hits = searching ? textSearch() : search();
    if (searching) {
      $("status").textContent = !query.trim() ? "" : hits.length
        ? `${hits.length.toLocaleString("nb-NO")} ${hits.length === 1 ? "oppskrift" : "oppskrifter"}`
        : db ? "Fant ingen oppskrifter. Prøv et annet ord." : "Henter oppskrifter …";
    } else if (db || have.length) {
      $("status").textContent = !have.length ? "" : hits.length
        ? `${hits.length.toLocaleString("nb-NO")} ${hits.length === 1 ? "oppskrift" : "oppskrifter"}`
        : minUse > 1 ? "Ingen oppskrifter bruker så mange av restene. Prøv et lavere tall under «Må bruke minst»." : "Ingen oppskrifter bruker dette.";
    }
    $("results").replaceChildren(...hits.slice(0, shown).map(card));
    $("more").hidden = hits.length <= shown;
  }

  function save() { store.set("have", have); shown = PAGE; render(); }
  function saveBasics(list) { basics = list; store.set("basicsList", basics); shown = PAGE; render(); }

  function add(text) {
    for (const part of text.split(/[,;\n]+/)) {
      const q = normQuery(part);
      if (q && !have.includes(q)) have.push(q);
    }
    $("addInput").value = "";
    $("suggest").replaceChildren();
    save();
    $("addInput").focus();
  }

  $("addForm").onsubmit = (e) => { e.preventDefault(); if ($("addInput").value.trim()) add($("addInput").value); };
  $("addInput").oninput = () => {
    const inp = $("addInput");
    if (/^\s+$/.test(inp.value)) inp.value = ""; // mellomrom etter komma
    if (/[,;]/.test(inp.value)) { // tagg-metode: komma gjør det foran til et merke
      const parts = inp.value.split(/[,;]/);
      const rest = parts.pop();
      add(parts.join(","));
      inp.value = rest.trimStart();
    }
    const q = normQuery(inp.value);
    const list = q.length >= 2 ? vocab.filter((k) => k.startsWith(q) && !have.includes(k)).slice(0, 8) : [];
    $("suggest").replaceChildren(...list.map((k) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button"; b.textContent = k;
      b.onclick = () => add(k);
      li.append(b);
      return li;
    }));
  };
  $("addInput").onkeydown = (e) => { if (e.key === "Backspace" && !e.target.value && have.length) { have.pop(); save(); } };
  $("addInput").onpaste = (e) => {
    const t = e.clipboardData?.getData("text") || "";
    if (/[,;\n]/.test(t)) { e.preventDefault(); add(t); }
  };
  $("tagbox").onclick = (e) => { if (e.target === e.currentTarget) $("addInput").focus(); };
  root.querySelectorAll(".rf-ex").forEach((b) => (b.onclick = () => add(b.textContent)));
  $("basics").onchange = (e) => { useBasics = e.target.checked; store.set("basics", useBasics); shown = PAGE; render(); };
  root.querySelectorAll("[data-use]").forEach((b) => (b.onclick = () => { minUse = Number(b.dataset.use); store.set("use", minUse); shown = PAGE; render(); }));
  $("basicsForm").onsubmit = (e) => {
    e.preventDefault();
    const more = $("basicsInput").value.split(/[,;]+/).map((x) => normQuery(x)).filter((x) => x && !basics.includes(x));
    $("basicsInput").value = "";
    if (more.length) saveBasics([...basics, ...more]);
  };
  $("basicsReset").onclick = () => { if (confirm("Tilbakestille basisvarene til standardlisten?")) saveBasics([...DEFAULT_BASICS]); };
  root.querySelectorAll("[data-mode]").forEach((b) => (b.onclick = () => {
    mode = b.dataset.mode; store.set("mode", mode); shown = PAGE; render();
    (mode === "search" ? $("searchInput") : $("addInput")).focus({ preventScroll: true });
  }));
  let typing;
  $("searchInput").oninput = (e) => { clearTimeout(typing); typing = setTimeout(() => { query = e.target.value; store.set("q", query); shown = PAGE; render(); }, 150); };
  $("searchForm").onsubmit = (e) => { e.preventDefault(); clearTimeout(typing); query = $("searchInput").value; store.set("q", query); shown = PAGE; render(); $("searchInput").blur(); };
  $("more").onclick = () => { shown += PAGE; render(); };
  $("linkForm").onsubmit = async (e) => {
    e.preventDefault();
    const url = $("linkInput").value.trim();
    if (!url || !opts.importLink) return;
    const st = $("mineStatus");
    st.dataset.msg = "1";
    st.textContent = "Leser oppskriften …";
    const out = await opts.importLink(url).catch(() => ({ ok: false }));
    st.textContent = out.ok ? `La til «${out.recipe.title}».` : out.error || "Kunne ikke lese oppskriften.";
    if (out.ok) $("linkInput").value = "";
    render();
  };

  render();
  load();
  return { render };
}
