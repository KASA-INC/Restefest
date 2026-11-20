import { occursOn, endIso, weekday } from "./recur.js";
import { parseQuick } from "./quick.js";

const $ = (s) => document.querySelector(s);
const CODE_RE = /^[a-z0-9æøå-]{6,40}$/;
const DAYS = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag"];
const icon = (name, cls = "i") => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const MONTHS = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

let code = null;
let state = { items: [], menu: {}, events: [], history: {} };
let list = store.get("list") || "butikk";
let view = store.get("view") || "list";
// Ukemenyen viser inneværende uke mandag–torsdag. Fra fredag kl. 00.00
// (da bestilles Oda) viser den neste uke.
const menuBase = () => (new Date().getDay() + 6) % 7 >= 4 ? 1 : 0;
let weekOffset = menuBase();
let calOffset = 0;

// ---------- Familiekode ----------
const ADJ = [
  "svett", "heit", "kald", "vegansk", "økologisk", "sprø", "saftig", "kortreist", "glutenfri", "laktosefri",
  "rykende", "sterk", "mild", "frossen", "fersk", "gyllen", "seig", "luftig", "kremet", "røkt", "grillet",
  "stekt", "kokt", "rå", "sur", "søt", "salt", "glad", "sulten", "mett", "eksotisk", "hjemmelaget",
  "fargerik", "lunken", "snerten", "fyrig", "smørstekt", "blid", "lat", "gammel", "sprek", "rask", "treg",
  "sint", "sjenert", "modig", "frekk", "høflig", "rolig", "vill", "tam", "stolt", "fornøyd", "trøtt",
  "våken", "sliten", "kjekk", "søvnig", "nysgjerrig", "heldig", "klumpete", "fjonete", "pussig", "rar",
  "morsom", "tullete", "sprudlende", "munter", "lykkelig", "tøff", "myk", "hard", "stiv", "slapp", "tykk",
  "tynn", "feit", "mager", "rund", "flat", "lilla", "rosa", "grønn", "gul", "blå", "rød", "oransje", "brun",
  "svart", "hvit", "liten", "stor", "diger", "bitteliten", "enorm", "høy", "lav", "kort", "lang", "bred",
  "dansende", "syngende", "flygende", "hoppende", "løpende", "sovende", "fnisende", "humrende", "smilende",
  "vinkende", "kjempegod", "nydelig", "deilig", "digg", "fantastisk", "magisk", "mystisk", "hemmelig",
  "berømt", "kongelig", "festlig", "fredelig", "hyggelig", "koselig", "lun", "varm", "glovarm", "iskald",
  "frisk", "ny", "fin", "pen", "stilig", "elegant", "sjarmerende", "spenstig", "smidig", "kvikk",
  "livlig", "kraftig", "rustikk", "enkel", "fancy", "uformell", "tradisjonell", "moderne", "klassisk",
  "retro", "funky", "hissig", "sprudlete", "knasende", "boblende", "frasende", "glinsende", "skinnende",
  "krydret", "pepret",
];
const DISH = [
  "taco", "lasagne", "bolognese", "pizza", "fiskesuppe", "kjøttkaker", "pinnekjøtt", "lapskaus", "fårikål",
  "raspeball", "pølse", "hamburger", "sushi", "risgrøt", "pannekake", "vaffel", "laks", "torsk", "kylling",
  "karbonade", "gryte", "wok", "burrito", "nachos", "carbonara", "risotto", "curry", "dal", "falafel",
  "kebab", "ramen", "suppe", "omelett", "toast", "salat", "biff", "fiskegrateng", "fiskepinne",
  "tikkamasala", "quesadilla", "enchilada", "fajita", "chili", "gulasj", "stroganoff", "moussaka", "paella",
  "tapas", "gazpacho", "tortilla", "gnocchi", "ravioli", "tortellini", "penne", "spagetti", "makaroni",
  "pesto", "pastasalat", "focaccia", "ciabatta", "calzone", "kebabpizza", "lefse", "lompe", "potetlompe",
  "flatbrød", "knekkebrød", "rundstykke", "baguette", "bagel", "sandwich", "wrap", "pita", "panini",
  "krokett", "vårrull", "dumpling", "gyoza", "dimsum", "bao", "pokebowl", "teriyaki", "tempura", "yakitori",
  "udon", "sashimi", "nigiri", "makirull", "misosuppe", "kimchi", "bibimbap", "padthai", "satay", "laksa",
  "tomyum", "pho", "bulgogi", "biryani", "korma", "samosa", "naan", "chapati", "hummus", "tabbouleh",
  "shakshuka", "couscous", "tagine", "kofta", "souvlaki", "gyros", "tzatziki", "halloumi", "feta",
  "mozzarella", "brie", "raclette", "fondue", "schnitzel", "bratwurst", "kjøttpudding",
  "medisterkake", "fiskekake", "fiskebolle", "plukkfisk", "bacalao", "lutefisk", "rakfisk", "sursild",
  "gravlaks", "reker", "krabbe", "hummer", "blåskjell", "kamskjell", "blekksprut", "sild", "makrell", "sei",
  "kveite", "ribbe", "svinestek", "lammelår", "elgstek", "reinsdyrgryte", "viltgryte", "kjøttboller",
  "hakkebiff", "kyllinglår", "kyllingvinge", "brownie", "muffins", "kanelbolle", "skolebolle", "bolle",
  "kringle", "krumkake", "sjokoladekake", "gulrotkake", "ostekake", "iskrem", "sorbet", "pavlova",
  "tiramisu", "pudding", "karamellpudding", "riskrem", "trollkrem", "fruktsalat", "smoothie", "grandiosa",
  "kebabrull", "pommesfrites", "potetmos", "potetsalat", "ovnspoteter",
];
function newCode() {
  const r = crypto.getRandomValues(new Uint32Array(2));
  return `${ADJ[r[0] % ADJ.length]}-${DISH[r[1] % DISH.length]}`;
}
// Vis koden pent: "svett-taco" -> "Svett-Taco"
const prettyCode = (c) => c.replace(/(^|-)(\p{L})/gu, (_, d, l) => d + l.toUpperCase());
const cleanCode = (s) => s.normalize("NFC").trim().toLowerCase().replace(/\s+/g, "-");

function start(c) {
  code = c;
  store.set("code", c);
  const cached = store.get("state:" + c);
  if (cached) try { state = JSON.parse(cached); } catch {}
  $("#join").hidden = true;
  $("#app").hidden = false;
  showView(view);
  render();
  connect();
}

// ---------- Synk (WebSocket) ----------
let ws = null;
let queue = [];
let retry = 0;
let pingTimer = null;

function connect() {
  if (!code || (ws && ws.readyState <= 1)) return;
  setConn("wait");
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/api/ws/${encodeURIComponent(code)}`);
  ws.onopen = () => {
    retry = 0;
    setConn("on");
    for (const m of queue) ws.send(JSON.stringify(m));
    queue = [];
    clearInterval(pingTimer);
    pingTimer = setInterval(() => ws && ws.readyState === 1 && ws.send("ping"), 25000);
  };
  ws.onmessage = (e) => {
    if (e.data === "pong") return;
    const msg = JSON.parse(e.data);
    if (msg.t === "state") {
      state = msg.state;
      store.set("state:" + code, JSON.stringify(state));
      render();
    }
  };
  ws.onclose = () => {
    clearInterval(pingTimer);
    ws = null;
    setConn("off");
    if (!code) return;
    const delay = Math.min(10000, 500 * 2 ** retry++);
    setTimeout(connect, delay);
  };
}

function send(msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  else { queue.push(msg); connect(); }
}

function setConn(s) {
  const el = $("#conn");
  el.className = "conn " + (s === "on" ? "on" : s === "off" ? "off" : "");
  el.title = s === "on" ? "Synkronisert" : s === "off" ? "Frakoblet – prøver igjen" : "Kobler til…";
}

// iOS kobler fra når appen er i bakgrunnen – koble til igjen straks den vises.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    retry = 0;
    connect();
    // Har det blitt fredag (eller ny uke) mens appen lå i bakgrunnen? Hopp til riktig uke.
    if (weekOffset === shownBase && menuBase() !== shownBase) {
      weekOffset = shownBase = menuBase();
      renderMenu();
    }
  }
});
window.addEventListener("online", () => { retry = 0; connect(); });

// ---------- Visninger ----------
function showView(v) {
  view = v;
  store.set("view", v);
  $("#view-list").hidden = v !== "list";
  $("#view-menu").hidden = v !== "menu";
  $("#view-cal").hidden = v !== "cal";
  $("#title").textContent = { list: "Handleliste", menu: "Ukemeny", cal: "Kalender" }[v];
  document.querySelectorAll(".tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
}

function render() {
  renderList();
  renderMenu();
  renderCal();
}

// ---------- Handleliste ----------
function itemEl(it) {
  const li = document.createElement("li");
  if (it.done) li.className = "done";
  const btn = document.createElement("button");
  btn.className = "check";
  btn.innerHTML = '<span class="box"></span><span class="txt"></span>';
  btn.querySelector(".txt").textContent = it.text;
  btn.onclick = () => {
    it.done = !it.done; // umiddelbar respons lokalt
    renderList();
    send({ t: "toggle", id: it.id, done: it.done });
  };
  const del = document.createElement("button");
  del.className = "del";
  del.setAttribute("aria-label", "Slett " + it.text);
  del.innerHTML = icon("close");
  del.onclick = () => {
    state.items = state.items.filter((i) => i.id !== it.id);
    renderList();
    send({ t: "del", id: it.id });
  };
  li.append(btn, del);
  return li;
}

function renderList() {
  document.querySelectorAll(".seg button").forEach((b) => b.classList.toggle("active", b.dataset.list === list));
  for (const l of ["butikk", "oda"]) {
    const n = state.items.filter((i) => i.list === l && !i.done).length;
    $(`[data-count="${l}"]`).textContent = n ? `(${n})` : "";
  }
  const mine = state.items.filter((i) => i.list === list);
  const todo = mine.filter((i) => !i.done);
  const done = mine.filter((i) => i.done).sort((a, b) => b.ts - a.ts);
  $("#todo").replaceChildren(...todo.map(itemEl));
  $("#done").replaceChildren(...done.map(itemEl));
  $("#doneWrap").hidden = !done.length;
  $("#empty").hidden = mine.length > 0;
  $("#odaLink").hidden = list !== "oda";
  $("#addInput").placeholder = list === "oda" ? "Legg til på Oda-listen…" : "Legg til vare…";
  renderSuggest();
}

// Legg til vare. Står den allerede på listen, gjøres ingenting;
// er den krysset av, hentes den tilbake i stedet for å lage en kopi.
function addItem(raw) {
  const text = raw.trim();
  if (!text) return;
  const key = text.toLowerCase();
  const existing = state.items.find((i) => i.list === list && i.text.toLowerCase() === key);
  if (existing && !existing.done) { toast(`«${existing.text}» står allerede på listen`); return; }
  if (existing) {
    existing.done = false;
    renderList();
    send({ t: "toggle", id: existing.id, done: false });
    return;
  }
  // Bruk skrivemåten fra historikken ("melk" -> "Melk").
  send({ t: "add", list, text: state.history?.[key]?.text || text });
}

function resetInput() {
  const inp = $("#addInput");
  inp.value = "";
  inp.focus();
  renderSuggest();
}

$("#addForm").onsubmit = (e) => {
  e.preventDefault();
  addItem($("#addInput").value);
  resetInput();
};

// ---------- Autoutfylling ----------
function suggestions(q) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  const onList = new Set(state.items.filter((i) => i.list === list && !i.done).map((i) => i.text.toLowerCase()));
  const hits = [];
  for (const [key, h] of Object.entries(state.history || {})) {
    if (onList.has(key)) continue;
    let rank;
    if (key.startsWith(q)) rank = 0;
    else if (key.split(/[\s-]+/).some((w) => w.startsWith(q))) rank = 1;
    else if (q.length >= 3 && key.includes(q)) rank = 2;
    else continue;
    hits.push({ ...h, rank, same: h.list === list ? 0 : 1 });
  }
  hits.sort((a, b) => a.rank - b.rank || a.same - b.same || b.n - a.n || b.ts - a.ts);
  return hits.slice(0, 6);
}

function renderSuggest() {
  const hits = suggestions($("#addInput").value);
  $("#suggest").replaceChildren(...hits.map((h) => {
    const li = document.createElement("li");
    const pick = document.createElement("button");
    pick.type = "button";
    pick.className = "pick";
    pick.textContent = h.text;
    pick.onclick = () => { addItem(h.text); resetInput(); };
    const forget = document.createElement("button");
    forget.type = "button";
    forget.className = "forget";
    forget.innerHTML = icon("close", "i sm");
    forget.setAttribute("aria-label", `Glem «${h.text}»`);
    forget.onclick = () => {
      delete state.history[h.text.toLowerCase()];
      renderSuggest();
      send({ t: "forget", text: h.text });
    };
    // Hindre at tastaturet lukkes når man trykker på et forslag.
    for (const b of [pick, forget]) b.onpointerdown = (e) => e.preventDefault();
    li.append(pick, forget);
    return li;
  }));
}
$("#addInput").oninput = renderSuggest;
document.querySelectorAll(".seg button").forEach((b) => {
  b.onclick = () => { list = b.dataset.list; store.set("list", list); renderList(); };
});
$("#clearBtn").onclick = () => {
  state.items = state.items.filter((i) => !(i.list === list && i.done));
  renderList();
  send({ t: "clear", list });
};

// ---------- Ukemeny ----------
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return { y, w, key: `${y}-W${String(w).padStart(2, "0")}` };
}

function mondayOf(offset) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
  return d;
}

const fmt = (d) => `${d.getDate()}. ${MONTHS[d.getMonth()]}`;

let builtWeek = null;

let shownBase = weekOffset;

// Skriver ukenummer og datoer i ukehodet og gir tilbake mandagen og ukenøkkelen.
function weekHeader(offset, label, dates, thisBtn) {
  const monday = mondayOf(offset);
  const { w, key } = isoWeek(monday);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  $(label).textContent = `Uke ${w}` + (offset === 0 ? " · denne uken" : offset === 1 ? " · neste uke" : "");
  $(dates).textContent = `${fmt(monday)} – ${fmt(sunday)}`;
  $(thisBtn).hidden = offset === 0;
  return { monday, key };
}

function renderMenu() {
  const { monday, key } = weekHeader(weekOffset, "#weekLabel", "#weekDates", "#thisWeek");
  const base = menuBase();
  $("#thisWeek").hidden = weekOffset === base;
  $("#thisWeek").textContent = base === 1 ? "Gå til neste uke" : "Gå til denne uken";
  const week = state.menu[key] || {};

  // Bygg kortene på nytt bare når uken endres, ellers oppdater verdier
  // (slik at ingen mister markøren mens noen andre skriver).
  if (builtWeek !== key) {
    builtWeek = key;
    const cards = DAYS.map((name, i) => {
      const date = new Date(monday); date.setDate(monday.getDate() + i);
      const card = document.createElement("div");
      card.className = "day";
      card.innerHTML = `
        <div class="day-head"><span class="day-name"></span><span class="muted small"></span></div>
        <ul class="day-evs"></ul>
        <input class="dish" placeholder="Rett" maxlength="200" enterkeyhint="next">
        <input class="link" placeholder="Link til oppskrift" type="url" inputmode="url" autocapitalize="off" maxlength="1000" enterkeyhint="done">
        <a class="recipe" target="_blank" rel="noopener" hidden>Åpne oppskrift ${icon("external-link", "i sm")}</a>`;
      card.querySelector(".day-name").textContent = name;
      if (i === 4) card.querySelector(".dish").placeholder = "Taco"; // fredagstaco
      card.querySelector(".muted").textContent = fmt(date);
      const dish = card.querySelector(".dish");
      const link = card.querySelector(".link");
      let timer;
      const save = () => {
        clearTimeout(timer);
        const entry = { dish: dish.value.trim(), link: link.value.trim() };
        const wk = (state.menu[key] ||= {});
        if (entry.dish || entry.link) wk[i] = entry; else delete wk[i];
        send({ t: "menu", week: key, day: i, ...entry });
      };
      const later = () => { clearTimeout(timer); timer = setTimeout(save, 600); };
      dish.oninput = later; link.oninput = later;
      dish.onchange = save; link.onchange = save;
      dish.onkeydown = (e) => { if (e.key === "Enter") link.focus(); };
      link.onkeydown = (e) => { if (e.key === "Enter") link.blur(); };
      return card;
    });
    $("#days").replaceChildren(...cards);
  }

  $("#days").querySelectorAll(".day").forEach((card, i) => {
    const date = new Date(monday); date.setDate(monday.getDate() + i);
    card.querySelector(".day-evs").replaceChildren(...eventsOn(isoDate(date)).map((ev) => {
      const li = document.createElement("li");
      if (ev.time) { const b = document.createElement("b"); b.textContent = ev.time + (ev.end ? "–" + ev.end : ""); li.append(b); }
      li.append(ev.title);
      return li;
    }));
    const entry = week[i] || { dish: "", link: "" };
    const dish = card.querySelector(".dish");
    const link = card.querySelector(".link");
    if (document.activeElement !== dish) dish.value = entry.dish || "";
    if (document.activeElement !== link) link.value = entry.link || "";
    const a = card.querySelector(".recipe");
    const href = entry.link ? (/^https?:\/\//i.test(entry.link) ? entry.link : "https://" + entry.link) : "";
    a.hidden = !href;
    if (href) a.href = href;
  });
}

$("#prevWeek").onclick = () => { weekOffset--; renderMenu(); };
$("#nextWeek").onclick = () => { weekOffset++; renderMenu(); };
$("#thisWeek").onclick = () => { weekOffset = menuBase(); renderMenu(); };

// ---------- Kalender ----------
// Avtaler (også gjentakende) som skjer på en dato, sortert: heldag først, så etter klokkeslett.
const eventsOn = (iso) => (state.events || []).filter((e) => occursOn(e, iso))
  .sort((a, b) => (a.time || "").localeCompare(b.time || "") || a.ts - b.ts);

const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function renderCal() {
  const { monday } = weekHeader(calOffset, "#calLabel", "#calDates", "#calThis");
  const cards = DAYS.map((name, i) => {
    const date = new Date(monday); date.setDate(monday.getDate() + i);
    const iso = isoDate(date);
    const card = document.createElement("div");
    card.className = "day";
    card.innerHTML = `
      <div class="day-head"><span class="day-name"></span><span class="muted small"></span>
        <button class="add-ev" aria-label="Ny avtale ${name.toLowerCase()}">${icon("plus")}</button></div>
      <ul class="evs"></ul>`;
    card.querySelector(".day-name").textContent = name;
    card.querySelector(".muted").textContent = fmt(date);
    card.onclick = (e) => { if (!e.target.closest(".ev")) openEvent({ date: iso }); };
    card.querySelector(".evs").replaceChildren(...eventsOn(iso).map((ev) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.className = "ev";
      b.innerHTML = '<span class="ev-time"></span><span class="ev-title"></span>';
      const tm = b.querySelector(".ev-time");
      tm.textContent = ev.time || "Hele dagen";
      if (ev.end) { const sm = document.createElement("small"); sm.textContent = "–" + ev.end; tm.append(sm); }
      b.querySelector(".ev-title").textContent = ev.title;
      if (ev.repeat) b.querySelector(".ev-title").insertAdjacentHTML("beforeend", icon("repeat", "i sm"));
      b.onclick = () => openEvent(ev);
      li.append(b);
      return li;
    }));
    return card;
  });
  $("#calDays").replaceChildren(...cards);
}

let editing = null;
let pickedDays = [];

const fmtLong = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}. ${MONTHS[m - 1]} ${y}`;
};

// Viser/skjuler feltene for gjentakelse og skriver en kort forklaring.
function syncRepeatUi() {
  const freq = $("#evFreq").value;
  const date = $("#evDate").value;
  const weekly = freq === "weekly" || freq === "biweekly";
  $("#evDurWrap").hidden = !freq;
  $("#evDaysWrap").hidden = !weekly;
  $("#evDateLabel").textContent = freq ? "Fra dato" : "Dato";
  if (weekly && !pickedDays.length && date) pickedDays = [weekday(date)];
  document.querySelectorAll("#evDays button").forEach((b) =>
    b.setAttribute("aria-pressed", pickedDays.includes(Number(b.dataset.d))));

  const hint = [];
  if (freq === "monthly" && date) hint.push(`Den ${Number(date.slice(8))}. hver måned.`);
  if (freq === "yearly" && date) hint.push(`Hvert år ${fmtLong(date).replace(/ \d+$/, "")}.`);
  if (freq && date) {
    const end = endIso({ date, repeat: { dur: $("#evDur").value } });
    if (end) {
      const last = new Date(end + "T12:00:00"); last.setDate(last.getDate() - 1);
      hint.push(`Siste gang senest ${fmtLong(isoDate(last))}.`);
    }
  }
  if (editing?.repeat) hint.push("Endringer gjelder alle gjentakelsene.");
  $("#evHint").textContent = hint.join(" ");
  $("#evHint").hidden = !hint.length;
}

function openEvent(ev) {
  editing = ev.id ? ev : null;
  $("#evHead").textContent = editing ? "Endre avtale" : "Ny avtale";
  $("#evTitle").value = ev.title || "";
  $("#evDate").value = ev.date;
  $("#evTime").value = ev.time || "";
  $("#evEnd").value = ev.end || "";
  syncTimeUi();
  $("#evFreq").value = ev.repeat?.freq || "";
  $("#evDur").value = ev.repeat?.dur || "inf";
  pickedDays = [...(ev.repeat?.days || [])];
  $("#evDelete").hidden = !editing;
  $("#evDelete").lastChild.textContent = editing?.repeat ? " Slett alle gjentakelser" : " Slett avtale";
  syncRepeatUi();
  $("#evDialog").showModal();
  if (!editing) $("#evTitle").focus();
}

// Sluttid: bare mulig med starttid. Flyttes starttiden, følger sluttiden med (samme varighet).
const toMin = (t) => (t ? +t.slice(0, 2) * 60 + +t.slice(3, 5) : null);
const fromMin = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
let lastStart = "";
function syncTimeUi() {
  const start = $("#evTime").value;
  $("#evEnd").disabled = !start;
  if (!start) $("#evEnd").value = "";
  $("#evAllDay").hidden = !!start;
  lastStart = start;
}
$("#evTime").onchange = () => {
  const start = $("#evTime").value, end = $("#evEnd").value;
  if (start && end && lastStart) {
    const moved = toMin(end) + toMin(start) - toMin(lastStart);
    $("#evEnd").value = moved > toMin(start) && moved < 24 * 60 ? fromMin(moved) : "";
  }
  syncTimeUi();
};
$("#evEnd").onchange = () => {
  if ($("#evEnd").value && $("#evEnd").value <= $("#evTime").value) {
    toast("Sluttid må være etter starttid");
    $("#evEnd").value = "";
  }
};

$("#evFreq").onchange = syncRepeatUi;
$("#evDur").onchange = syncRepeatUi;
$("#evDate").onchange = () => {
  // Ny startdato: la ukedagsvalget følge med hvis bare én dag var valgt automatisk.
  if (pickedDays.length <= 1) pickedDays = [];
  syncRepeatUi();
};
document.querySelectorAll("#evDays button").forEach((b) => {
  b.onclick = () => {
    const d = Number(b.dataset.d);
    pickedDays = pickedDays.includes(d) ? pickedDays.filter((x) => x !== d) : [...pickedDays, d].sort();
    syncRepeatUi();
  };
});

$("#evForm").onsubmit = (e) => {
  e.preventDefault();
  const data = { title: $("#evTitle").value.trim(), date: $("#evDate").value, time: $("#evTime").value, end: $("#evEnd").value };
  if (!data.title || !data.date) return;
  const freq = $("#evFreq").value;
  if (freq) {
    data.repeat = { freq, dur: $("#evDur").value };
    if (freq === "weekly" || freq === "biweekly") {
      if (!pickedDays.length) { toast("Velg minst én dag"); return; }
      data.repeat.days = pickedDays;
    }
  }
  if (editing) {
    delete editing.repeat;
    Object.assign(editing, data);
    send({ t: "evEdit", id: editing.id, ...data });
  } else {
    send({ t: "evAdd", ...data });
  }
  $("#evDialog").close();
  render();
};
$("#evCancel").onclick = () => $("#evDialog").close();
$("#evDelete").onclick = () => {
  if (!editing || !confirm(`Slette «${editing.title}»?`)) return;
  state.events = state.events.filter((x) => x.id !== editing.id);
  send({ t: "evDel", id: editing.id });
  $("#evDialog").close();
  render();
};

// ---------- Hurtig-innlegging ----------
const SHORT_DAYS = ["man", "tir", "ons", "tor", "fre", "lør", "søn"];
const FREQ_TXT = { daily: "Hver dag", weekly: "Hver uke", biweekly: "Annenhver uke", monthly: "Hver måned", yearly: "Hvert år" };
const DUR_TXT = { "1m": "i 1 mnd", "3m": "i 3 mnd", "6m": "i 6 mnd" };

function quickParse() {
  const today = new Date();
  const from = calOffset > 0 ? isoDate(mondayOf(calOffset)) : isoDate(today);
  return parseQuick($("#qaInput").value, { today, from });
}

function dayLabel(iso) {
  const d = new Date(iso + "T12:00:00");
  const diff = Math.round((d - new Date(isoDate(new Date()) + "T12:00:00")) / 864e5);
  const rel = { 0: "I dag", 1: "I morgen" }[diff];
  const name = SHORT_DAYS[weekday(iso)];
  return (rel ? rel + ", " : name[0].toUpperCase() + name.slice(1) + " ") + fmt(d) + (d.getFullYear() !== new Date().getFullYear() ? " " + d.getFullYear() : "");
}

// Viser hvordan teksten blir tolket – før man trykker Enter.
function renderQuick() {
  const text = $("#qaInput").value.trim();
  const ev = text ? quickParse() : null;
  $("#qaHelp").hidden = !!text || document.activeElement !== $("#qaInput");
  $("#qaPreview").hidden = !ev;
  if (!ev) return;
  const parts = [];
  const add = (ic, txt) => {
    const span = document.createElement("span");
    span.innerHTML = icon(ic, "i sm");
    span.append(txt);
    parts.push(span);
  };
  const b = document.createElement("b");
  b.textContent = ev.title;
  parts.push(b);
  const dl = dayLabel(ev.date);
  add("calendar", ev.repeat ? "Fra " + dl[0].toLowerCase() + dl.slice(1) : dl);
  add("clock", ev.time ? ev.time + (ev.end ? "–" + ev.end : "") : "Hele dagen");
  if (ev.repeat) {
    let r = FREQ_TXT[ev.repeat.freq];
    if (ev.repeat.days) r += ": " + ev.repeat.days.map((d) => SHORT_DAYS[d]).join(", ");
    if (DUR_TXT[ev.repeat.dur]) r += " " + DUR_TXT[ev.repeat.dur];
    add("repeat", r);
  }
  $("#qaSum").replaceChildren(...parts);
}

// Hvilken uke (relativt til denne) en dato ligger i.
const weekOffsetOf = (iso) => Math.round((new Date(iso + "T12:00:00") - mondayOf(0)) / (7 * 864e5) - 0.49);

$("#qaInput").oninput = renderQuick;
$("#qaInput").onfocus = renderQuick;
$("#qaInput").onblur = () => setTimeout(renderQuick, 150);
$("#qaForm").onsubmit = (e) => {
  e.preventDefault();
  const ev = quickParse();
  if (!ev) { if ($("#qaInput").value.trim()) toast("Skriv hva avtalen gjelder"); return; }
  send({ t: "evAdd", ...ev });
  calOffset = weekOffsetOf(ev.date);
  renderCal();
  toast(`Lagt til: ${ev.title}, ${dayLabel(ev.date).toLowerCase()}`);
  $("#qaInput").value = "";
  renderQuick();
};
$("#qaMore").onclick = () => {
  const ev = quickParse();
  if (ev) openEvent(ev);
};
document.querySelectorAll("#qaHelp .ex").forEach((ex) => {
  ex.onpointerdown = (e) => e.preventDefault();
  ex.onclick = () => { $("#qaInput").value = ex.textContent; renderQuick(); $("#qaInput").focus(); };
});
// Lagring fra «Juster» tømmer hurtigfeltet.
$("#evForm").addEventListener("submit", () => {
  if (!editing && $("#qaInput").value) { $("#qaInput").value = ""; renderQuick(); }
});

$("#calPrev").onclick = () => { calOffset--; renderCal(); };
$("#calNext").onclick = () => { calOffset++; renderCal(); };
$("#calThis").onclick = () => { calOffset = 0; renderCal(); };

// ---------- Navigasjon og innstillinger ----------
document.querySelectorAll(".tabbar button").forEach((b) => (b.onclick = () => showView(b.dataset.view)));

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 2200);
}

async function copy(text, msg) {
  try { await navigator.clipboard.writeText(text); toast(msg); }
  catch { prompt("Kopier:", text); }
}

const inviteUrl = () => `${location.origin}/?kode=${encodeURIComponent(code)}`;
const calUrl = (feed = "") => `webcal://${location.host}/cal/${encodeURIComponent(code)}${feed}.ics`;

$("#settingsBtn").onclick = () => {
  $("#codeShow").textContent = prettyCode(code);
  $("#webcalMenu").href = calUrl();
  $("#webcalEvents").href = calUrl("/kalender");
  $("#settings").showModal();
};
$("#shareBtn").onclick = async () => {
  const data = { title: "Handleliste", text: `Bli med i handlelisten vår (kode: ${prettyCode(code)})`, url: inviteUrl() };
  if (navigator.share) { try { await navigator.share(data); } catch {} }
  else copy(inviteUrl(), "Lenke kopiert");
};
$("#leaveBtn").onclick = () => {
  if (!confirm("Forlate familien på denne enheten? Listene blir liggende for de andre.")) return;
  store.del("code");
  store.del("state:" + code);
  code = null;
  if (ws) ws.close();
  location.href = "/";
};

$("#createBtn").onclick = () => start(newCode());
$("#joinForm").onsubmit = (e) => {
  e.preventDefault();
  const c = cleanCode($("#joinCode").value);
  if (!CODE_RE.test(c)) { $("#joinErr").hidden = false; return; }
  start(c);
};

// ---------- Oppstart ----------
const params = new URLSearchParams(location.search);
const fromLink = params.get("kode");
if (fromLink && CODE_RE.test(cleanCode(fromLink))) {
  history.replaceState(null, "", "/");
  start(cleanCode(fromLink));
} else if (store.get("code")) {
  start(store.get("code"));
} else {
  $("#join").hidden = false;
}
