import { occursOn, endIso, weekday } from "./recur.js";
import { parseQuick } from "./quick.js";
import { holidaysOn } from "./holidays.js";

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
let state = { items: [], menu: {}, events: [], history: {}, lists: [], feeds: [], ext: [], feedInfo: {}, hidden: { dish: [], event: [] } };
let list = store.get("list") || "butikk";      // valgt liste i Lister-fanen
let hList = store.get("hlist") || "butikk";    // valgt liste på startskjermen (butikk/oda)
let view = "home"; // appen åpner alltid på startskjermen
// Ukemenyen viser inneværende uke mandag–torsdag. Fra fredag kl. 00.00
// (da bestilles Oda) viser den neste uke.
const menuBase = () => (new Date().getDay() + 6) % 7 >= 4 ? 1 : 0;
let weekOffset = menuBase();
let calOffset = 0;
let calMode = store.get("calmode") || "week"; // week | month | list
let monOffset = 0;      // måneder fra denne
let selDay = null;      // valgt dag i månedsvisningen
let agendaDays = 60;    // hvor langt fram «Kommende» viser

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
    ws.send(JSON.stringify({ t: "feedRefresh" }));
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
      if ($("#settings").open) renderFeeds();
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
    }
    if (code) { render(); send({ t: "feedRefresh" }); }
  }
});
window.addEventListener("online", () => { retry = 0; connect(); });

// ---------- Visninger ----------
function showView(v) {
  view = v;
  store.set("view", v);
  $("#view-home").hidden = v !== "home";
  $("#view-list").hidden = v !== "list";
  $("#view-menu").hidden = v !== "menu";
  $("#view-cal").hidden = v !== "cal";
  $("#title").textContent = { list: "Lister", menu: "Ukemeny", cal: "Kalender" }[v] || "";
  $("#title").classList.toggle("clock", v === "home");
  $("#title").style.fontSize = "";
  if (v === "home") tickClock(true);
  window.scrollTo(0, 0);
  document.querySelectorAll(".tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
}

function render() {
  renderHome();
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
  // En lenke i teksten (f.eks. på en ønskeliste) vises som nettstedets navn + egen knapp.
  const url = it.text.match(/https?:\/\/\S+/i)?.[0];
  const txt = btn.querySelector(".txt");
  if (url) {
    const rest = it.text.replace(url, "").trim();
    let host = url;
    try { host = new URL(url).hostname.replace(/^www\./, ""); } catch {}
    txt.textContent = rest || host;
    if (rest) { const h = document.createElement("span"); h.className = "host"; h.textContent = " · " + host; txt.append(h); }
  } else txt.textContent = it.text;
  btn.onclick = () => {
    it.done = !it.done; // umiddelbar respons lokalt
    render();
    send({ t: "toggle", id: it.id, done: it.done });
    if (it.done) toast(`«${it.text}» er ${isShopping(it.list) ? "handlet" : "krysset av"}`, "Angre", () => {
      it.done = false;
      render();
      send({ t: "toggle", id: it.id, done: false });
    });
  };
  const del = document.createElement("button");
  del.className = "del";
  del.setAttribute("aria-label", "Slett " + it.text);
  del.innerHTML = icon("close");
  del.onclick = () => {
    state.items = state.items.filter((i) => i.id !== it.id);
    render();
    send({ t: "del", id: it.id });
    toast(`«${it.text}» er slettet`, "Angre", () => addItem(it.text, it.list));
  };
  if (url) {
    const a = document.createElement("a");
    a.className = "item-link";
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    a.setAttribute("aria-label", "Åpne lenke");
    a.innerHTML = icon("external-link");
    li.append(btn, a, del);
  } else li.append(btn, del);
  return li;
}

const BUILTIN = [{ id: "butikk", name: "I butikk" }, { id: "oda", name: "Oda" }];
const allLists = () => [...BUILTIN, ...(state.lists || [])];
const isShopping = (l) => l === "butikk" || l === "oda";
const listName = (l) => allLists().find((x) => x.id === l)?.name || "Listen";

function renderList() {
  if (!allLists().some((l) => l.id === list)) list = "butikk"; // listen er slettet
  const pills = allLists().map((l) => {
    const b = document.createElement("button");
    b.setAttribute("role", "tab");
    b.className = l.id === list ? "active" : "";
    const n = state.items.filter((i) => i.list === l.id && !i.done).length;
    b.textContent = l.name;
    if (n) { const c = document.createElement("span"); c.className = "count"; c.textContent = ` (${n})`; b.append(c); }
    b.onclick = () => { list = l.id; store.set("list", list); renderList(); };
    return b;
  });
  const add = document.createElement("button");
  add.className = "new-list";
  add.innerHTML = icon("plus") + "Ny liste";
  add.onclick = newList;
  $("#listTabs").replaceChildren(...pills, add);
  $("#listTabs .active")?.scrollIntoView({ block: "nearest", inline: "nearest" });

  const mine = state.items.filter((i) => i.list === list);
  const todo = mine.filter((i) => !i.done);
  const done = mine.filter((i) => i.done).sort((a, b) => b.ts - a.ts);
  $("#todo").replaceChildren(...todo.map(itemEl));
  $("#done").replaceChildren(...done.map(itemEl));
  $("#doneWrap").hidden = !done.length;
  $("#doneTitle").textContent = isShopping(list) ? "Handlet" : "Ferdig";
  $("#clearBtn").textContent = isShopping(list) ? "Fjern handlede" : "Fjern ferdige";
  $("#empty").hidden = mine.length > 0;
  $("#odaLink").hidden = list !== "oda";
  $("#listTools").hidden = isShopping(list);
  $("#addInput").placeholder = list === "butikk" ? "Legg til vare…" : `Legg til på ${listName(list)}…`;
  listAdder.refresh();
}

function newList() {
  const name = prompt("Navn på den nye listen", "Ønskeliste")?.trim();
  if (!name) return;
  const id = "l-" + crypto.randomUUID().slice(0, 13);
  state.lists = [...(state.lists || []), { id, name }];
  send({ t: "listAdd", id, name });
  list = id;
  store.set("list", list);
  renderList();
  $("#addInput").focus();
}

$("#renameList").onclick = () => {
  const l = state.lists.find((x) => x.id === list);
  const name = l && prompt("Nytt navn på listen", l.name)?.trim();
  if (!name) return;
  l.name = name;
  send({ t: "listRename", id: l.id, name });
  renderList();
};
$("#deleteList").onclick = () => {
  const l = state.lists.find((x) => x.id === list);
  if (!l || !confirm(`Slette «${l.name}» og alt som står på den? Dette gjelder for hele familien.`)) return;
  state.lists = state.lists.filter((x) => x.id !== l.id);
  state.items = state.items.filter((i) => i.list !== l.id);
  send({ t: "listDel", id: l.id });
  list = "butikk";
  render();
};

// Legg til vare. Står den allerede på listen, gjøres ingenting;
// er den krysset av, hentes den tilbake i stedet for å lage en kopi.
function addItem(raw, l = list) {
  const text = raw.trim();
  if (!text) return;
  const key = text.toLowerCase();
  const existing = state.items.find((i) => i.list === l && i.text.toLowerCase() === key);
  if (existing && !existing.done) { toast(`«${existing.text}» står allerede på listen`); return; }
  if (existing) {
    existing.done = false;
    render();
    send({ t: "toggle", id: existing.id, done: false });
    return;
  }
  // Bruk skrivemåten fra historikken ("melk" -> "Melk").
  send({ t: "add", list: l, text: state.history?.[key]?.text || text });
}

// ---------- Autoutfylling ----------
function suggestions(q, l) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  const onList = new Set(state.items.filter((i) => i.list === l && !i.done).map((i) => i.text.toLowerCase()));
  const hits = [];
  for (const [key, h] of Object.entries(state.history || {})) {
    if (onList.has(key)) continue;
    let rank;
    if (key.startsWith(q)) rank = 0;
    else if (key.split(/[\s-]+/).some((w) => w.startsWith(q))) rank = 1;
    else if (q.length >= 3 && key.includes(q)) rank = 2;
    else continue;
    hits.push({ ...h, rank, same: h.list === l ? 0 : 1 });
  }
  hits.sort((a, b) => a.rank - b.rank || a.same - b.same || b.n - a.n || b.ts - a.ts);
  return hits.slice(0, 6);
}

// Rangerer forslag: starter med det man skriver > et ord starter med det > inneholder det (fra 3 tegn),
// deretter mest brukt og sist brukt. `entries` er [{ text, n, ts, ... }].
function rank(entries, q, extra = () => 0) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  const hits = [];
  for (const h of entries) {
    const key = h.text.toLowerCase();
    if (key === q) continue;
    let r;
    if (key.startsWith(q)) r = 0;
    else if (key.split(/[\s-]+/).some((w) => w.startsWith(q))) r = 1;
    else if (q.length >= 3 && key.includes(q)) r = 2;
    else continue;
    hits.push({ ...h, r, x: extra(h) });
  }
  hits.sort((a, b) => a.r - b.r || a.x - b.x || b.n - a.n || String(b.ts).localeCompare(String(a.ts)));
  return hits.slice(0, 6);
}

// Tegner forslagsbobler: trykk velger, × glemmer. Tastaturet holdes oppe.
function chips(ul, hits, { pick, forget, sub }) {
  ul.replaceChildren(...hits.map((h) => {
    const li = document.createElement("li");
    const p = document.createElement("button");
    p.type = "button";
    p.className = "pick";
    p.textContent = h.text;
    const extra = sub?.(h);
    if (extra) { const s = document.createElement("span"); s.className = "sub"; s.textContent = extra; p.append(s); }
    p.onclick = () => pick(h);
    const f = document.createElement("button");
    f.type = "button";
    f.className = "forget";
    f.innerHTML = icon("close", "i sm");
    f.setAttribute("aria-label", `Glem «${h.text}»`);
    f.onclick = () => forget(h);
    for (const b of [p, f]) b.onpointerdown = (e) => e.preventDefault();
    li.append(p, f);
    return li;
  }));
}

// Tidligere retter fra ukemenyen (med siste kjente oppskriftslenke).
function dishHistory() {
  const hidden = new Set(state.hidden?.dish || []);
  const h = {};
  for (const [week, days] of Object.entries(state.menu || {})) {
    for (const [d, e] of Object.entries(days)) {
      if (!e?.dish) continue;
      const key = e.dish.toLowerCase();
      if (hidden.has(key)) continue;
      const ts = week + d;
      const x = (h[key] ||= { text: e.dish, n: 0, ts: "", link: "" });
      x.n++;
      if (ts >= x.ts) { x.ts = ts; x.text = e.dish; if (e.link) x.link = e.link; }
      else if (!x.link && e.link) x.link = e.link;
    }
  }
  return Object.values(h);
}

// Tidligere avtaler (med klokkeslett fra siste gang).
function eventHistory() {
  const hidden = new Set(state.hidden?.event || []);
  const h = {};
  for (const e of state.events || []) {
    const key = e.title.toLowerCase();
    if (hidden.has(key)) continue;
    const x = (h[key] ||= { text: e.title, n: 0, ts: 0, time: "", end: "" });
    x.n++;
    if ((e.ts || 0) >= x.ts) Object.assign(x, { ts: e.ts || 0, text: e.title, time: e.time || "", end: e.end || "" });
  }
  return Object.values(h);
}

const timeText = (h) => (h.time ? h.time + (h.end ? "–" + h.end : "") : "");
function hideSuggestion(kind, text) {
  state.hidden ||= { dish: [], event: [] };
  state.hidden[kind] = [...(state.hidden[kind] || []), text.toLowerCase()];
  send({ t: "hide", kind, text });
}

// Kobler et «legg til vare»-felt med forslag. Brukes både i handlelisten og på startskjermen.
function wireAdd(formSel, inputSel, suggestSel, getList = () => list) {
  const input = $(inputSel);
  const reset = () => { input.value = ""; input.focus(); refresh(); };
  function refresh() {
    chips($(suggestSel), suggestions(input.value, getList()), {
      pick: (h) => { addItem(h.text, getList()); reset(); },
      forget: (h) => {
        delete state.history[h.text.toLowerCase()];
        refresh();
        send({ t: "forget", text: h.text });
      },
    });
  }
  input.oninput = refresh;
  $(formSel).onsubmit = (e) => { e.preventDefault(); addItem(input.value, getList()); reset(); };
  return { refresh };
}
const listAdder = wireAdd("#addForm", "#addInput", "#suggest");

$("#clearBtn").onclick = () => {
  state.items = state.items.filter((i) => !(i.list === list && i.done));
  render();
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
      card.className = "mrow";
      card.innerHTML = `
        <div class="mlabel"><b></b><span></span></div>
        <div class="mmain">
          <div class="dinner">
            <input class="dish" placeholder="Rett" maxlength="200" enterkeyhint="done">
            <button type="button" class="rlink">${icon("chef-recipe-book")}</button>
          </div>
          <ul class="day-evs"></ul>
        </div>`;
      card.querySelector(".mlabel b").textContent = name.slice(0, 3);
      card.querySelector(".mlabel span").textContent = fmt(date);
      if (i === 4) card.querySelector(".dish").placeholder = "Taco"; // fredagstaco
      wireDinner(card.querySelector(".dish"), card.querySelector(".rlink"), () => ({ key, day: i }));
      return card;
    });
    $("#days").replaceChildren(...cards);
  }

  $("#days").querySelectorAll(".mrow").forEach((card, i) => {
    const date = new Date(monday); date.setDate(monday.getDate() + i);
    const iso = isoDate(date);
    card.querySelector(".day-evs").replaceChildren(...eventsOn(iso).map((ev) => evLine(ev, iso)));
    card.querySelector(".mlabel b").classList.toggle("red-day", redDay(iso));
    fillDinner(card.querySelector(".dish"), card.querySelector(".rlink"), week[i]);
  });
}

// Kort linje for en avtale (ukemeny og «i morgen» på startskjermen).
function evLine(ev, iso) {
  const li = document.createElement("li");
  if (ev.holiday) li.className = "hol" + (ev.red ? " red" : "");
  if (ev.kind === "bday") li.innerHTML = icon("cake", "i sm") + " ";
  if (ev.time) { const b = document.createElement("b"); b.textContent = ev.time + (ev.end ? "–" + ev.end : ""); li.append(b); }
  li.append(evLabel(ev, iso));
  return li;
}

// Middag for én dag: et felt for retten og en oppskriftsknapp. Brukes av ukemenyen og startskjermen.
//  - Grå knapp (ingen oppskrift): trykk for å lime inn en lenke.
//  - Grønn knapp: trykk for å åpne oppskriften, hold inne for å endre eller fjerne lenken.
//  - Limer man en lenke inn i rettfeltet, flyttes den automatisk til knappen.
const URL_RE = /(?:https?:\/\/|www\.)\S+/i;
const normUrl = (u) => (u && !/^https?:\/\//i.test(u) ? "https://" + u : u);

function wireDinner(dish, btn, where) {
  let timer;
  // Forslag fra tidligere retter, rett under feltet.
  const sug = document.createElement("ul");
  sug.className = "suggest dish-suggest";
  dish.parentElement.after(sug);
  const suggest = () => {
    if (document.activeElement !== dish) return sug.replaceChildren();
    chips(sug, rank(dishHistory(), dish.value), {
      sub: (h) => (h.link ? "oppskrift" : ""),
      pick: (h) => {
        dish.value = h.text;
        save(current().link || h.link || "");
        sug.replaceChildren();
        dish.blur();
      },
      forget: (h) => { hideSuggestion("dish", h.text); suggest(); },
    });
  };
  dish.onfocus = suggest;
  dish.onblur = () => setTimeout(suggest, 150);
  const current = () => { const { key, day } = where(); return state.menu[key]?.[day] || {}; };
  const save = (link = current().link || "") => {
    clearTimeout(timer);
    const { key, day } = where();
    const entry = { dish: dish.value.trim(), link };
    const wk = (state.menu[key] ||= {});
    if (entry.dish || entry.link) wk[day] = entry; else delete wk[day];
    send({ t: "menu", week: key, day, ...entry });
    fillDinner(dish, btn, wk[day]);
  };
  const editLink = () => {
    const now = current().link || "";
    const v = prompt(now ? "Endre lenken til oppskriften (tøm for å fjerne):" : "Lim inn lenke til oppskriften:", now);
    if (v === null) return;
    save(normUrl(v.trim()));
  };
  dish.oninput = () => {
    const m = dish.value.match(URL_RE);
    if (m) {
      dish.value = dish.value.replace(m[0], "").replace(/\s+/g, " ").trim();
      save(normUrl(m[0]));
      toast("Lenken er lagt på oppskriftsknappen");
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => save(), 600);
    suggest();
  };
  dish.onchange = () => save();
  dish.onkeydown = (e) => { if (e.key === "Enter") dish.blur(); };

  // Trykk = åpne (eller legg til), hold inne = endre.
  let pressTimer, longPressed = false;
  btn.onpointerdown = () => {
    longPressed = false;
    pressTimer = setTimeout(() => { longPressed = true; if (current().link) editLink(); }, 550);
  };
  btn.onpointerup = btn.onpointerleave = btn.onpointercancel = () => clearTimeout(pressTimer);
  btn.oncontextmenu = (e) => e.preventDefault();
  btn.onclick = () => {
    if (longPressed) return;
    const link = current().link;
    if (link) window.open(normUrl(link), "_blank", "noopener");
    else editLink();
  };
}

// Viser lagret middag uten å forstyrre den som skriver.
function fillDinner(dish, btn, entry = {}) {
  if (document.activeElement !== dish) dish.value = entry.dish || "";
  const has = !!entry.link;
  btn.classList.toggle("on", has);
  btn.setAttribute("aria-label", has ? "Åpne oppskrift (hold inne for å endre)" : "Legg til lenke til oppskrift");
  btn.title = has ? entry.link : "Legg til oppskrift";
}

$("#prevWeek").onclick = () => { weekOffset--; renderMenu(); };
$("#nextWeek").onclick = () => { weekOffset++; renderMenu(); };
$("#thisWeek").onclick = () => { weekOffset = menuBase(); renderMenu(); };

// ---------- Kalender ----------
// Avtaler (også gjentakende) som skjer på en dato, sortert: heldag først, så etter klokkeslett.
// Helligdager vises med mindre man har slått dem av (gjelder denne enheten).
let showHolidays = store.get("holidays") !== "off";
const holidayEvents = (iso) => (showHolidays ? holidaysOn(iso).map((h) => ({ ...h, time: "", holiday: true })) : []);
const redDay = (iso) => holidaysOn(iso).some((h) => h.red);

const eventsOn = (iso) => [
  ...holidayEvents(iso),
  ...(state.events || []).filter((e) => occursOn(e, iso)),
  ...(state.ext || []).filter((e) => e.date === iso),
].sort((a, b) => !!b.holiday - !!a.holiday || (a.time || "").localeCompare(b.time || "") || (a.ts || 0) - (b.ts || 0));

// Teksten som vises for en avtale på en gitt dato (bursdager får alder).
function evLabel(ev, iso) {
  if (ev.kind !== "bday") return ev.title;
  const age = ev.born ? Number(iso.slice(0, 4)) - ev.born : 0;
  return age > 0 ? `${ev.title} fyller ${age}` : `${ev.title} har bursdag`;
}

const feedName = (id) => (state.feeds || []).find((f) => f.id === id)?.name || "Annen kalender";

const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Én avtale i en liste. Med `nowMin` (minutter siden midnatt) markeres
// det som pågår nå, og det som er ferdig tones ned.
function evItem(ev, nowMin = null, iso = isoDate(new Date())) {
  const li = document.createElement("li");
  const b = document.createElement("button");
  b.className = "ev";
  b.innerHTML = '<span class="ev-time"></span><span class="ev-title"></span>';
  const tm = b.querySelector(".ev-time");
  tm.textContent = ev.time || (ev.holiday ? (ev.red ? "Rød dag" : "Merkedag") : ev.kind === "bday" ? "Bursdag" : "Hele dagen");
  if (ev.end) { const sm = document.createElement("small"); sm.textContent = "–" + ev.end; tm.append(sm); }
  const title = b.querySelector(".ev-title");
  title.textContent = evLabel(ev, iso);
  if (ev.kind === "bday") { b.classList.add("bday"); title.insertAdjacentHTML("afterbegin", icon("cake", "i sm")); }
  else if (ev.repeat) title.insertAdjacentHTML("beforeend", icon("repeat", "i sm"));
  if (ev.holiday) b.classList.add("holiday", ...(ev.red ? ["red"] : []));
  if (ev.feed) {
    const src = document.createElement("span");
    src.className = "src";
    src.textContent = feedName(ev.feed);
    title.append(src);
    b.classList.add("ext");
  }
  if (nowMin !== null && ev.time) {
    const start = toMin(ev.time);
    const end = ev.end ? toMin(ev.end) : start + 60;
    if (nowMin >= end) b.classList.add("past");
    else if (nowMin >= start) title.insertAdjacentHTML("beforeend", '<span class="now">nå</span>');
  }
  b.onclick = (e) => {
    if (ev.holiday) return; // trykk går videre til dagen (ny avtale)
    e.stopPropagation();
    if (ev.feed) toast(`Fra «${feedName(ev.feed)}» – endres der`);
    else openEvent(ev);
  };
  li.append(b);
  return li;
}

const MONTHS_LONG = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];

function renderCal() {
  document.querySelectorAll("#calModes button").forEach((b) => b.classList.toggle("active", b.dataset.mode === calMode));
  $("#calWeek").hidden = calMode !== "week";
  $("#calMonth").hidden = calMode !== "month";
  $("#calList").hidden = calMode !== "list";
  if (calMode === "month") renderMonth();
  else if (calMode === "list") renderAgenda();
  else renderWeekCal();
}

// ---- Måned ----
function monthStart(offset) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return d;
}
const monthOffsetOf = (iso) => {
  const now = new Date();
  return (+iso.slice(0, 4) - now.getFullYear()) * 12 + (+iso.slice(5, 7) - 1 - now.getMonth());
};

function renderMonth() {
  const first = monthStart(monOffset);
  const y = first.getFullYear(), m = first.getMonth();
  const today = isoDate(new Date());
  if (!selDay || monthOffsetOf(selDay) !== monOffset) selDay = monOffset === 0 ? today : isoDate(first);
  $("#monLabel").textContent = `${MONTHS_LONG[m][0].toUpperCase() + MONTHS_LONG[m].slice(1)} ${y}`;
  $("#monThis").hidden = monOffset === 0;

  const lead = (first.getDay() + 6) % 7;
  const daysIn = new Date(y, m + 1, 0).getDate();
  const cells = Math.ceil((lead + daysIn) / 7) * 7;
  const grid = [];
  for (let i = 0; i < cells; i++) {
    const d = new Date(y, m, 1 - lead + i, 12);
    const iso = isoDate(d);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "mcell" + (d.getMonth() !== m ? " other" : "") + (redDay(iso) ? " red" : "") + (d.getDay() === 0 ? " sun" : "") + (iso === selDay ? " sel" : "");
    const evs = eventsOn(iso).filter((e) => !e.holiday);
    const dots = evs.slice(0, 3).map((e) => `<i class="${e.kind === "bday" ? "bday" : e.feed ? "ext" : ""}"></i>`).join("")
      + (evs.length > 3 ? '<i class="more">+</i>' : "");
    b.innerHTML = `<span class="num">${d.getDate()}</span><span class="dots">${dots}</span>`;
    b.setAttribute("aria-label", `${d.getDate()}. ${MONTHS_LONG[d.getMonth()]}, ${evs.length} avtaler`);
    b.onclick = () => {
      selDay = iso;
      monOffset = monthOffsetOf(iso);
      renderMonth();
    };
    grid.push(b);
  }
  $("#monGrid").replaceChildren(...grid);

  // Valgt dag under rutenettet
  const sd = new Date(selDay + "T12:00:00");
  $("#monDayTitle").textContent = `${DAYS[(sd.getDay() + 6) % 7]} ${sd.getDate()}. ${MONTHS_ABBR[sd.getMonth()]}`;
  $("#monDayTitle").classList.toggle("red-day", redDay(selDay));
  const evs = eventsOn(selDay);
  const now = new Date();
  const nowMin = selDay === today ? now.getHours() * 60 + now.getMinutes() : null;
  $("#monEvents").replaceChildren(...evs.map((ev) => evItem(ev, nowMin, selDay)));
  $("#monEmpty").hidden = evs.length > 0;
}

$("#monPrev").onclick = () => { monOffset--; selDay = null; renderMonth(); };
$("#monNext").onclick = () => { monOffset++; selDay = null; renderMonth(); };
$("#monThis").onclick = () => { monOffset = 0; selDay = null; renderMonth(); };
$("#monAdd").onclick = () => openEvent({ date: selDay });

// ---- Kommende ----
function renderAgenda() {
  const now = new Date();
  const today = isoDate(now);
  const groups = [];
  for (let i = 0; i < agendaDays; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, 12);
    const iso = isoDate(d);
    // Merkedager er ikke aktiviteter; røde dager tas med.
    const evs = eventsOn(iso).filter((e) => !e.holiday || e.red);
    if (!evs.length) continue;
    const sec = document.createElement("section");
    sec.className = "aday";
    const h = document.createElement("h3");
    const name = `${DAYS[(d.getDay() + 6) % 7]} ${d.getDate()}. ${MONTHS_ABBR[d.getMonth()]}` + (d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : "");
    h.textContent = i === 0 ? `I dag · ${name}` : i === 1 ? `I morgen · ${name}` : name;
    h.classList.toggle("red-day", redDay(iso));
    const ul = document.createElement("ul");
    ul.className = "evs";
    ul.replaceChildren(...evs.map((ev) => evItem(ev, iso === today ? now.getHours() * 60 + now.getMinutes() : null, iso)));
    sec.append(h, ul);
    groups.push(sec);
  }
  if (!groups.length) {
    const p = document.createElement("p");
    p.className = "agenda-empty";
    p.textContent = `Ingen avtaler de neste ${agendaDays} dagene.`;
    groups.push(p);
  }
  $("#agenda").replaceChildren(...groups);
  $("#agendaMore").hidden = agendaDays >= 400;
  $("#agendaMore").textContent = `Vis flere (neste ${agendaDays + 60} dager)`;
}
$("#agendaMore").onclick = () => { agendaDays += 60; renderAgenda(); };

document.querySelectorAll("#calModes button").forEach((b) => {
  b.onclick = () => { calMode = b.dataset.mode; store.set("calmode", calMode); renderCal(); window.scrollTo(0, 0); };
});

// ---- Uke ----
function renderWeekCal() {
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
    card.onclick = (e) => { const ev = e.target.closest(".ev"); if (!ev || ev.classList.contains("holiday")) openEvent({ date: iso }); };
    card.querySelector(".evs").replaceChildren(...eventsOn(iso).map((ev) => evItem(ev, null, iso)));
    card.querySelector(".day-name").classList.toggle("red-day", redDay(iso));
    return card;
  });
  $("#calDays").replaceChildren(...cards);
}

let editing = null;
let pickedDays = [];

function suggestTitle() {
  const inp = $("#evTitle");
  if (document.activeElement !== inp) return $("#evSuggest").replaceChildren();
  chips($("#evSuggest"), rank(eventHistory(), inp.value), {
    sub: timeText,
    pick: (h) => {
      inp.value = h.text;
      if (!$("#evTime").value && h.time) { $("#evTime").value = h.time; $("#evEnd").value = h.end || ""; syncTimeUi(); }
      $("#evSuggest").replaceChildren();
    },
    forget: (h) => { hideSuggestion("event", h.text); suggestTitle(); },
  });
}
$("#evTitle").oninput = suggestTitle;
$("#evTitle").onfocus = suggestTitle;
$("#evTitle").onblur = () => setTimeout(suggestTitle, 150);

const fmtLong = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}. ${MONTHS[m - 1]} ${y}`;
};

// Viser/skjuler feltene for gjentakelse og skriver en kort forklaring.
function syncRepeatUi() {
  const bday = $("#evBday").checked;
  $("#evTimeRow").hidden = $("#evRepeatRow").hidden = bday;
  $("#evAllDay").hidden = bday || !!$("#evTime").value;
  if (bday) {
    $("#evDaysWrap").hidden = true;
    $("#evDateLabel").textContent = "Fødselsdato (med årstall gir alder)";
    const d = $("#evDate").value;
    const y = +d.slice(0, 4), now = new Date().getFullYear();
    $("#evHint").textContent = d && y < now
      ? `Vises hvert år ${fmtLong(d).replace(/ \d+$/, "")} – fyller ${now - y} i år.`
      : "Vises hvert år. Med fødselsår vises også alderen.";
    $("#evHint").hidden = false;
    return;
  }
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
  editing = ev.id ? (state.events || []).find((e) => e.id === ev.id) || null : null;
  $("#evBday").checked = ev.kind === "bday";
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
  $("#evDelete").lastChild.textContent = editing?.kind === "bday" ? " Slett bursdag" : editing?.repeat ? " Slett alle gjentakelser" : " Slett avtale";
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
$("#evBday").onchange = syncRepeatUi;
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
  const freq = $("#evBday").checked ? "" : $("#evFreq").value;
  if ($("#evBday").checked) {
    const y = +data.date.slice(0, 4);
    Object.assign(data, { time: "", end: "", kind: "bday", repeat: { freq: "yearly", dur: "inf" } });
    if (y < new Date().getFullYear()) data.born = y;
  } else if (freq) {
    data.repeat = { freq, dur: $("#evDur").value };
    if (freq === "weekly" || freq === "biweekly") {
      if (!pickedDays.length) { toast("Velg minst én dag"); return; }
      data.repeat.days = pickedDays;
    }
  }
  if (editing) {
    delete editing.repeat;
    delete editing.kind;
    delete editing.born;
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

function dayLabel(iso) {
  const d = new Date(iso + "T12:00:00");
  const diff = Math.round((d - new Date(isoDate(new Date()) + "T12:00:00")) / 864e5);
  const rel = { 0: "I dag", 1: "I morgen" }[diff];
  const name = SHORT_DAYS[weekday(iso)];
  return (rel ? rel + ", " : name[0].toUpperCase() + name.slice(1) + " ") + fmt(d) + (d.getFullYear() !== new Date().getFullYear() ? " " + d.getFullYear() : "");
}

// Datoen kalenderen skal hoppe til etter innlegging (bursdager: neste gang de er).
function nextDate(ev) {
  if (ev.kind !== "bday") return ev.date;
  const today = isoDate(new Date());
  const y = new Date().getFullYear();
  for (const yy of [y, y + 1]) { const d = `${yy}-${ev.date.slice(5)}`; if (d >= today) return d; }
  return ev.date;
}

// Hvilken uke (relativt til denne) en dato ligger i.
const weekOffsetOf = (iso) => Math.round((new Date(iso + "T12:00:00") - mondayOf(0)) / (7 * 864e5) - 0.49);

// Kobler et hurtigfelt for avtaler: tolker teksten, viser tolkningen og lagrer på Enter.
// `from` gir datoen ukedager regnes fra; `after` kjøres når avtalen er lagt til.
const quickInputs = [];
function wireQuick({ form, input, preview, sum, more, help, from, after }) {
  const inp = $(input);
  quickInputs.push(inp);
  const sug = document.createElement("ul");
  sug.className = "suggest";
  $(form).after(sug);
  const suggest = () => {
    if (document.activeElement !== inp) { sug.replaceChildren(); return 0; }
    const hits = rank(eventHistory(), inp.value);
    chips(sug, hits, {
      sub: timeText,
      pick: (h) => {
        inp.value = h.text + (h.time ? ` ${h.time}${h.end ? "-" + h.end : ""}` : "") + " ";
        refresh();
        inp.focus();
      },
      forget: (h) => { hideSuggestion("event", h.text); refresh(); },
    });
    return hits.length;
  };
  const parse = () => parseQuick(inp.value, { today: new Date(), from: from() });
  function refresh() {
    const nSug = suggest();
    const text = inp.value.trim();
    // Mens man bare har skrevet starten på et ord og har forslag, er forhåndsvisningen bare støy.
    const ev = text && !(nSug && !/\s/.test(text)) ? parse() : null;
    if (help) $(help).hidden = !!text || document.activeElement !== inp;
    $(preview).hidden = !ev;
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
    if (ev.kind === "bday") {
      const [y, m, d] = ev.date.split("-").map(Number);
      add("cake", `Bursdag ${d}. ${MONTHS[m - 1]} hvert år`);
      if (ev.born) {
        // Neste bursdag: i år hvis den ikke har vært, ellers neste år.
        const now = new Date();
        const thisYear = `${now.getFullYear()}-${ev.date.slice(5)}`;
        const next = thisYear >= isoDate(now) ? now.getFullYear() : now.getFullYear() + 1;
        add("calendar", `Fyller ${next - ev.born} ${next === now.getFullYear() ? "i år" : "neste år"}`);
      }
      $(sum).replaceChildren(...parts);
      return;
    }
    const dl = dayLabel(ev.date);
    add("calendar", ev.repeat ? "Fra " + dl[0].toLowerCase() + dl.slice(1) : dl);
    add("clock", ev.time ? ev.time + (ev.end ? "–" + ev.end : "") : "Hele dagen");
    if (ev.repeat) {
      let r = FREQ_TXT[ev.repeat.freq];
      if (ev.repeat.days) r += ": " + ev.repeat.days.map((d) => SHORT_DAYS[d]).join(", ");
      if (DUR_TXT[ev.repeat.dur]) r += " " + DUR_TXT[ev.repeat.dur];
      add("repeat", r);
    }
    $(sum).replaceChildren(...parts);
  }
  inp.oninput = refresh;
  inp.onfocus = refresh;
  inp.onblur = () => setTimeout(refresh, 150);
  $(form).onsubmit = (e) => {
    e.preventDefault();
    const ev = parse();
    if (!ev) { if (inp.value.trim()) toast("Skriv hva avtalen gjelder"); return; }
    send({ t: "evAdd", ...ev });
    toast(ev.kind === "bday" ? `Bursdag lagt til: ${ev.title}` : `Lagt til: ${ev.title}, ${dayLabel(ev.date).toLowerCase()}`);
    inp.value = "";
    refresh();
    after(ev);
  };
  $(more).onclick = () => {
    const ev = parse();
    if (ev) openEvent(ev);
  };
  if (help) document.querySelectorAll(help + " .ex").forEach((ex) => {
    ex.onpointerdown = (e) => e.preventDefault();
    ex.onclick = () => { inp.value = ex.textContent; refresh(); inp.focus(); };
  });
  inp.refreshQuick = refresh;
}

wireQuick({
  form: "#qaForm", input: "#qaInput", preview: "#qaPreview", sum: "#qaSum", more: "#qaMore", help: "#qaHelp",
  from: () => {
    const today = isoDate(new Date());
    if (calMode === "month") return selDay && selDay > today ? selDay : today;
    if (calMode === "week") return calOffset > 0 ? isoDate(mondayOf(calOffset)) : today;
    return today;
  },
  after: (ev) => {
    const d = nextDate(ev);
    calOffset = weekOffsetOf(d);
    monOffset = monthOffsetOf(d);
    selDay = d;
    renderCal();
  },
});

// Lagring fra «Juster» tømmer hurtigfeltet det kom fra.
$("#evForm").addEventListener("submit", () => {
  if (editing) return;
  for (const inp of quickInputs) if (inp.value) { inp.value = ""; inp.refreshQuick(); }
});

$("#calPrev").onclick = () => { calOffset--; renderCal(); };
$("#calNext").onclick = () => { calOffset++; renderCal(); };
$("#calThis").onclick = () => { calOffset = 0; renderCal(); };

// ---------- Startskjerm ----------
// Startskjermens overskrift: «Lørdag 21. nov. kl. 00:10», med klokke som går.
// Norske månedsforkortelser – punktum bare når ordet faktisk er forkortet.
const MONTHS_ABBR = ["jan.", "feb.", "mars", "apr.", "mai", "juni", "juli", "aug.", "sep.", "okt.", "nov.", "des."];

// Krymper overskriften akkurat nok til at den får plass på én linje (maks 28 px).
function fitTitle() {
  const el = $("#title");
  el.style.fontSize = "";
  let size = 28;
  while (el.scrollWidth > el.clientWidth + 1 && size > 16) {
    size -= 1;
    el.style.fontSize = size + "px";
  }
}
window.addEventListener("resize", () => { if (view === "home") fitTitle(); });
let shownClock = "";
function tickClock(force = false) {
  if (view !== "home") return;
  const now = new Date();
  const date = `${DAYS[(now.getDay() + 6) % 7]} ${now.getDate()}. ${MONTHS_ABBR[now.getMonth()]}`;
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (!force && shownClock === date + time) return;
  const firstOfDay = shownClock && !shownClock.startsWith(date);
  shownClock = date + time;
  const t = document.createElement("span");
  t.className = "time";
  t.textContent = time;
  $("#title").replaceChildren(date + " kl. ", t);
  fitTitle();
  if (firstOfDay) renderHome(); // ny dag: oppdater middag, aktiviteter osv.
}
setInterval(tickClock, 1000);

// Dagens middag lagres alltid på dagens dato (uavhengig av hvilken uke ukemenyen viser).
const todaySlot = () => { const d = new Date(); return { key: isoWeek(d).key, day: (d.getDay() + 6) % 7 }; };
wireDinner($("#hDish"), $("#hRecipe"), todaySlot);
const homeAdder = wireAdd("#hAddForm", "#hAddInput", "#hSuggest", () => hList);
wireQuick({
  form: "#hqaForm", input: "#hqaInput", preview: "#hqaPreview", sum: "#hqaSum", more: "#hqaMore",
  from: () => isoDate(new Date()),
  after: (ev) => { const d = nextDate(ev); calOffset = weekOffsetOf(d); monOffset = monthOffsetOf(d); selDay = d; render(); },
});
document.querySelectorAll("[data-hlist]").forEach((b) => {
  b.onclick = () => { hList = b.dataset.hlist; store.set("hlist", hList); renderHome(); };
});
document.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => showView(b.dataset.go)));
$("#hMore").onclick = () => { list = hList; store.set("list", list); renderList(); showView("list"); };

function renderHome() {
  const now = new Date();
  const { key, day } = todaySlot();
  tickClock(true);
  const hol = showHolidays ? holidaysOn(isoDate(now)).map((h) => h.title) : [];
  $("#homeDate").textContent = [`Uke ${isoWeek(now).w}`, ...hol].join(" · ");
  $("#homeDate").classList.toggle("red-day", showHolidays && redDay(isoDate(now)));

  // Middag i dag
  $("#hDish").placeholder = day === 4 ? "Taco" : "Hva blir det til middag?";
  fillDinner($("#hDish"), $("#hRecipe"), state.menu[key]?.[day]);

  // Aktiviteter i dag
  const evs = eventsOn(isoDate(now)).filter((e) => !e.holiday); // helligdager står i datolinjen
  $("#hEvents").replaceChildren(...evs.map((ev) => evItem(ev, now.getHours() * 60 + now.getMinutes(), isoDate(now))));
  $("#hNoEvents").hidden = evs.length > 0;

  // De fem øverste på handlelisten
  document.querySelectorAll("[data-hlist]").forEach((b) => b.classList.toggle("active", b.dataset.hlist === hList));
  for (const l of ["butikk", "oda"]) {
    const n = state.items.filter((i) => i.list === l && !i.done).length;
    $(`[data-hcount="${l}"]`).textContent = n ? n : "";
  }
  const todo = state.items.filter((i) => i.list === hList && !i.done);
  $("#hItems").replaceChildren(...todo.slice(0, 5).map(itemEl));
  $("#hEmpty").hidden = todo.length > 0;
  $("#hEmpty").textContent = hList === "oda" ? "Oda-listen er tom." : "Handlelisten er tom.";
  $("#hMore").hidden = todo.length <= 5;
  $("#hMore").textContent = `Se alle ${todo.length} varer`;
  $("#hAddInput").placeholder = hList === "oda" ? "Legg til på Oda-listen…" : "Legg til vare…";
  homeAdder.refresh();

  // I morgen: middag og avtaler
  const tm = new Date(now); tm.setDate(now.getDate() + 1);
  const tmDinner = state.menu[isoWeek(tm).key]?.[(tm.getDay() + 6) % 7]?.dish;
  const lines = [];
  if (tmDinner) {
    const li = document.createElement("li");
    li.innerHTML = icon("chef-recipe-book", "i sm");
    li.append(" " + tmDinner);
    lines.push(li);
  }
  for (const ev of eventsOn(isoDate(tm))) lines.push(evLine(ev, isoDate(tm)));
  $("#hTomorrow").replaceChildren(...lines);
  $("#hTomorrowCard").hidden = !lines.length;
}

// Hold «nå»-merking og hilsen oppdatert mens startskjermen er åpen.
setInterval(() => { if (view === "home" && code) renderHome(); }, 60000);

// ---------- Navigasjon og innstillinger ----------
document.querySelectorAll(".tabbar button").forEach((b) => (b.onclick = () => showView(b.dataset.view)));

// Kort beskjed nederst. Med `action` får den en knapp, f.eks. «Angre».
function toast(msg, action, onAction) {
  const t = $("#toast");
  $("#toastMsg").textContent = msg;
  const btn = $("#toastAction");
  btn.hidden = !action;
  btn.textContent = action || "";
  btn.onclick = () => { t.hidden = true; onAction?.(); };
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), action ? 4500 : 2200);
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
  renderFeeds();
  $("#showHolidays").checked = showHolidays;
  $("#settings").showModal();
};
// ---------- Andre kalendere ----------
function renderFeeds() {
  $("#feedList").replaceChildren(...(state.feeds || []).map((f) => {
    const info = state.feedInfo?.[f.id] || {};
    const li = document.createElement("li");
    const meta = document.createElement("div");
    meta.className = "meta";
    const name = document.createElement("b");
    name.textContent = f.name;
    const status = document.createElement("span");
    if (info.error) { status.className = "feed-err"; status.textContent = "Kunne ikke hentes: " + info.error; }
    else if (info.fetched) {
      const t = new Date(info.fetched);
      status.textContent = `${info.count} avtaler · hentet ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
    } else status.textContent = "Henter …";
    meta.append(name, status);
    const del = document.createElement("button");
    del.type = "button";
    del.innerHTML = icon("trash");
    del.setAttribute("aria-label", `Fjern ${f.name}`);
    del.onclick = () => {
      if (!confirm(`Fjerne «${f.name}» fra appen? Selve kalenderen påvirkes ikke.`)) return;
      state.feeds = state.feeds.filter((x) => x.id !== f.id);
      state.ext = (state.ext || []).filter((e) => e.feed !== f.id);
      send({ t: "feedDel", id: f.id });
      renderFeeds();
      render();
    };
    li.append(meta, del);
    return li;
  }));
}

$("#showHolidays").onchange = () => {
  showHolidays = $("#showHolidays").checked;
  store.set("holidays", showHolidays ? "on" : "off");
  render();
};

$("#feedAdd").onclick = () => {
  const name = $("#feedName").value.trim();
  const url = $("#feedUrl").value.trim();
  if (!name) { toast("Gi kalenderen et navn"); $("#feedName").focus(); return; }
  if (!/^(webcals?|https?):\/\/\S+$/i.test(url)) { toast("Lim inn en lenke som starter med webcal:// eller https://"); $("#feedUrl").focus(); return; }
  send({ t: "feedAdd", name, url });
  $("#feedName").value = "";
  $("#feedUrl").value = "";
  toast(`Henter «${name}» …`);
};

$("#shareBtn").onclick = async () => {
  const data = { title: "Uka", text: `Bli med i familien vår i Uka (kode: ${prettyCode(code)})`, url: inviteUrl() };
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
