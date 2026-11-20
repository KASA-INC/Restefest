"use strict";

const $ = (s) => document.querySelector(s);
const CODE_RE = /^[a-z0-9-]{6,40}$/;
const DAYS = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag"];
const MONTHS = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

let code = null;
let state = { items: [], menu: {} };
let list = store.get("list") || "butikk";
let view = store.get("view") || "list";
let weekOffset = 0;

// ---------- Familiekode ----------
function newCode() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789"; // uten forvekslbare tegn
  const rnd = crypto.getRandomValues(new Uint8Array(12));
  const s = Array.from(rnd, (b) => chars[b % chars.length]).join("");
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}
const cleanCode = (s) => s.trim().toLowerCase().replace(/\s+/g, "-");

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
  if (document.visibilityState === "visible") { retry = 0; connect(); }
});
window.addEventListener("online", () => { retry = 0; connect(); });

// ---------- Visninger ----------
function showView(v) {
  view = v;
  store.set("view", v);
  $("#view-list").hidden = v !== "list";
  $("#view-menu").hidden = v !== "menu";
  $("#title").textContent = v === "list" ? "Handleliste" : "Ukemeny";
  document.querySelectorAll(".tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
}

function render() {
  renderList();
  renderMenu();
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
  del.textContent = "×";
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
}

$("#addForm").onsubmit = (e) => {
  e.preventDefault();
  const inp = $("#addInput");
  const text = inp.value.trim();
  if (!text) return;
  send({ t: "add", list, text });
  inp.value = "";
  inp.focus();
};
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

function renderMenu() {
  const monday = mondayOf(weekOffset);
  const { w, key } = isoWeek(monday);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  $("#weekLabel").textContent = `Uke ${w}` + (weekOffset === 0 ? " · denne uken" : weekOffset === 1 ? " · neste uke" : "");
  $("#weekDates").textContent = `${fmt(monday)} – ${fmt(sunday)}`;
  $("#thisWeek").hidden = weekOffset === 0;
  const week = state.menu[key] || {};
  const todayKey = new Date().toDateString();

  // Bygg kortene på nytt bare når uken endres, ellers oppdater verdier
  // (slik at ingen mister markøren mens noen andre skriver).
  if (builtWeek !== key) {
    builtWeek = key;
    const cards = DAYS.map((name, i) => {
      const date = new Date(monday); date.setDate(monday.getDate() + i);
      const card = document.createElement("div");
      card.className = "day" + (date.toDateString() === todayKey ? " today" : "");
      card.innerHTML = `
        <div class="day-head"><span class="day-name"></span><span class="muted small"></span></div>
        <input class="dish" placeholder="Rett" maxlength="200" enterkeyhint="next">
        <input class="link" placeholder="Link til oppskrift" type="url" inputmode="url" autocapitalize="off" maxlength="1000" enterkeyhint="done">
        <a class="recipe" target="_blank" rel="noopener" hidden>Åpne oppskrift ↗</a>`;
      card.querySelector(".day-name").textContent = name;
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
$("#thisWeek").onclick = () => { weekOffset = 0; renderMenu(); };

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
const calUrl = () => `${location.host}/cal/${encodeURIComponent(code)}.ics`;

$("#settingsBtn").onclick = () => {
  $("#codeShow").textContent = code;
  $("#webcalLink").href = `webcal://${calUrl()}`;
  $("#settings").showModal();
};
$("#shareBtn").onclick = async () => {
  const data = { title: "Handleliste", text: `Bli med i handlelisten vår (kode: ${code})`, url: inviteUrl() };
  if (navigator.share) { try { await navigator.share(data); } catch {} }
  else copy(inviteUrl(), "Lenke kopiert");
};
$("#copyCal").onclick = () => copy(`${location.protocol}//${calUrl()}`, "Kalenderadresse kopiert");
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
