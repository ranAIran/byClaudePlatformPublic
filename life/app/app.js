// Life Archipelago v0.1 — the same file runs on the web and inside the Android app's WebView.
import * as THREE from "three";
import { pass } from "three/tsl";
import { bloom } from "../../quest/vendor/BloomNode.js";
import { buildMap, buildHome, fitCamera, projectTo } from "./scenes.js";
import { createStore, localStorageBackend } from "./core/store.js";
import { exportJSON, importJSON, exportDigest } from "./core/exporter.js";
import { shareToNode } from "./core/share.js";
import { isoDate } from "./core/capture.js";
import { initBridge } from "./bridge.js";
import * as media from "./media.js";

export const VERSION = "0.1.0";
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const store = createStore(localStorageBackend());
const ISL_COLOR = { home: "#ffc94d", work: "#b48cff", health: "#4ee08a", family: "#ff8fb1", paperwork: "#7ad1ff" };
const ROOMS = ["living", "kitchen", "bedroom", "office"];
const title = (id) => store.get(id)?.title || id;
const islandOf = (id) => { const p = [id, ...store.path(id)].find((x) => ISL_COLOR[x]); return p || store.path(id)[0] || null; };

// ---------- example content on first run ----------
function seedExamples() {
  try { if (localStorage.getItem("life-seeded")) return; localStorage.setItem("life-seeded", "1"); } catch (e) { return; }
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDate(d); };
  const ex = ["example"];
  const add = (n) => store.add({ ...n, tags: ex });
  add({ type: "task", title: "Pay electricity bill", parent: "paperwork", due: day(14), notes: "NorthGrid Energy · ₪412.30" });
  add({ type: "task", title: "Renew passport", parent: "paperwork", effort: 3, steps: [{ title: "Book an appointment" }, { title: "Photo and forms" }, { title: "Go to the office" }, { title: "Pick up the passport" }] });
  add({ type: "link", title: "gov.il services", url: "https://www.gov.il", parent: "paperwork" });
  add({ type: "task", title: "Gym · legs day", parent: "health", due: day(0) });
  add({ type: "task", title: "Call grandma", parent: "family", due: day(0) });
  add({ type: "task", title: "Prepare the project review", parent: "work", due: day(2) });
  add({ type: "item", title: "TV", parent: "living", notes: "Warranty ends Mar 2027" });
  add({ type: "pet", title: "Luna the cat", parent: "living", notes: "Vet visit Dec 2" });
  add({ type: "task", title: "Fix the floor lamp switch", parent: "living" });
  add({ type: "item", title: "Fridge", parent: "kitchen", notes: "Water filter every 6 months" });
  add({ type: "task", title: "Change the fridge water filter", parent: "kitchen", due: day(10) });
  add({ type: "item", title: "Laptop", parent: "office", notes: "Weekly backup" });
  const b = store.capture("call the plumber tomorrow"); store.update(b, { tags: ex });
}
seedExamples();

// ---------- renderer and the two worlds ----------
const coarse = window.matchMedia?.("(pointer: coarse)").matches;
const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: params.has("webgl") });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = 1.15;
$("stage").append(renderer.domElement);
await renderer.init();
const backendName = renderer.backend?.isWebGPUBackend ? "WebGPU" : "WebGL2";

const map = buildMap(), home = buildHome();
for (const w of [map, home]) {
  fitCamera(w.cam);
  w.base = w.cam.position.clone().sub(w.cam.userData.target);
  w.pan = new THREE.Vector3();
  const p = new THREE.PostProcessing(renderer), sp = pass(w.scene, w.cam), c = sp.getTextureNode("output");
  p.outputNode = c.add(bloom(c, 0.45, 0.35, 0.85)); w.post = p;
}
let view = "map", room = "living";
const world = () => (view === "map" ? map : home);
window.addEventListener("resize", () => { renderer.setSize(innerWidth, innerHeight); fitCamera(map.cam); fitCamera(home.cam); });

// ---------- labels over the 3D world ----------
const labelEls = {};
for (const d of map.isles) {
  const el = document.createElement("button"); el.className = "lbl"; el.style.pointerEvents = "auto"; el.style.background = "none"; el.style.border = "0";
  el.innerHTML = `<b>${d.name}</b><span style="background:${ISL_COLOR[d.id]}"></span>`;
  el.addEventListener("click", () => openIsland(d.id));
  el.userData = new THREE.Vector3(d.pos[0], d.id === "work" ? 5.2 : 3.4, d.pos[1]);
  $("labels").append(el); labelEls[d.id] = el;
}
const roomEls = {};
for (const r of ROOMS) {
  const el = document.createElement("button"); el.className = "rlbl"; el.style.border = "0";
  el.addEventListener("click", () => selectRoom(r)); el.hidden = true; el.userData = home.rooms[r];
  $("labels").append(el); roomEls[r] = el;
}
function placeLabels() {
  const w = world();
  for (const [id, el] of Object.entries(labelEls)) { el.hidden = view !== "map"; if (!el.hidden) { const [x, y] = projectTo(w.cam, el.userData); el.style.left = x + "px"; el.style.top = y + "px"; } }
  for (const [id, el] of Object.entries(roomEls)) { el.hidden = view !== "home"; if (!el.hidden) { const [x, y] = projectTo(w.cam, el.userData); el.style.left = x + "px"; el.style.top = y + "px"; } }
}

// ---------- HUD, quests strip, badges ----------
function hp() {
  const week = Date.now() - 7 * 864e5;
  const done = store.descendants("health").filter((n) => n.type === "task" && n.done && Date.parse(n.updated) > week).length;
  return Math.min(100, 70 + done * 6);
}
function dueText(iso) {
  if (!iso) return "";
  const d = Math.round((Date.parse(iso) - Date.parse(isoDate(new Date()))) / 864e5);
  if (d < 0) return `overdue ${-d}d`; if (d === 0) return "today"; if (d === 1) return "tomorrow"; if (d < 7) return `in ${d} days`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
let lastLevel = store.level().level;
function renderHud() {
  const L = store.level();
  $("lvl").textContent = L.level; $("lvlName").textContent = `Level ${L.level} · Life explorer`;
  $("xpBar").style.width = `${(100 * L.into) / L.need}%`; $("xpTxt").textContent = `${L.into}/${L.need}`;
  const h = hp(); $("hpBar").style.width = h + "%"; $("hpTxt").textContent = `HP ${h}`;
  $("today").textContent = new Date().toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const open = store.all().filter((n) => n.type === "task" && !n.done && n.parent !== "bag").sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999")).slice(0, 4);
  $("quests").innerHTML = open.map((n) => `<button class="pill" data-id="${n.id}" style="border:1px solid var(--line)"><span class="dot" style="background:${ISL_COLOR[islandOf(n.id)] || "#fff"}"></span>${esc(n.title)}${n.due ? ` <span style="color:${dueText(n.due).startsWith("overdue") ? "#ff9b9b" : "#ffd98a"}">${dueText(n.due)}</span>` : ""}</button>`).join("");
  for (const [id, el] of Object.entries(labelEls)) {
    const tasks = store.openTasks(id), soon = tasks.filter((t) => t.due && Date.parse(t.due) - Date.now() < 7 * 864e5).length;
    el.querySelector("span").textContent = tasks.length ? (soon ? `${soon} due soon` : `${tasks.length} open`) : "all clear";
    el.querySelector("span").style.background = soon ? "#ff8b8b" : ISL_COLOR[id];
  }
  for (const r of ROOMS) { const n = store.children(r).length; roomEls[r].textContent = `${title(r)} · ${n}`; roomEls[r].classList.toggle("on", r === room); }
  const bag = store.unplaced().length; $("bagCount").textContent = bag; $("bagCount").hidden = !bag;
  if (L.level > lastLevel) toast(`Level up! You are level ${L.level}`); lastLevel = L.level;
}
$("quests").addEventListener("click", (e) => { const b = e.target.closest("[data-id]"); if (b) openFor(b.dataset.id); });

// ---------- sheets ----------
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const TYPE_ICON = {
  task: "", note: "M5 6h14M5 11h14M5 16h9", link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  photo: "M4 8h3l2-3h6l2 3h3v11H4zM12 10a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7", document: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6",
  item: "M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8", pet: "M7 10a2 2 0 1 0 0-.1M17 10a2 2 0 1 0 0-.1M10 6a2 2 0 1 0 0-.1M14 6a2 2 0 1 0 0-.1M8 17c0-3 2-5 4-5s4 2 4 5c0 2-8 2-8 0z",
  person: "M12 12a4 4 0 1 0 0-8a4 4 0 1 0 0 8M4 21c1-4 4-6 8-6s7 2 8 6",
};
const svgIcon = (t) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-top:3px;color:var(--muted)"><path d="${TYPE_ICON[t] || TYPE_ICON.note}"/></svg>`;
let sheetFor = null;
function itemHtml(n, { bag = false } = {}) {
  const lead = n.type === "task" ? `<button class="check ${n.done ? "on" : ""}" data-act="toggle" data-id="${n.id}" aria-label="Done">${n.done ? "✓" : ""}</button>`
    : n.thumb ? `<img class="thumb" src="${n.thumb}" alt="" data-act="photo" data-id="${n.id}">` : svgIcon(n.type);
  const meta = [n.type !== "task" ? n.type : "", n.due ? `<span style="color:${dueText(n.due).startsWith("overdue") ? "#ff9b9b" : "#ffd98a"}">${dueText(n.due)}</span>` : "", n.effort > 1 ? `effort ${n.effort}` : "", n.tags.includes("example") ? "example" : "", n.notes ? esc(n.notes) : ""].filter(Boolean).join(" · ");
  const steps = n.steps ? `<div class="steps">${n.steps.map((s, i) => `<button class="step ${s.done ? "on" : ""}" data-act="step" data-id="${n.id}" data-i="${i}"><i></i><span>${esc(s.title)}</span></button>`).join("")}</div>` : "";
  const link = n.url ? `<button class="chip" data-act="open" data-url="${esc(n.url)}">Open ${esc(n.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 32))}</button>` : "";
  const sug = bag ? `<div class="row" style="gap:6px;flex-wrap:wrap">${(n.suggest.length ? n.suggest : ["home", "paperwork", "work"]).slice(0, 3).map((p, i) => `<button class="chip ${i === 0 ? "on" : ""}" data-act="place" data-id="${n.id}" data-to="${p}">→ ${esc(title(p))}</button>`).join("")}</div>` : "";
  return `<div class="item ${n.done ? "done" : ""}">${lead}<div class="main"><div class="t">${esc(n.title)}</div>${meta ? `<div class="meta">${meta}</div>` : ""}${steps}${link}${sug}</div><button class="x" data-act="del" data-id="${n.id}" aria-label="Delete">✕</button></div>`;
}
function openSheet(id) {
  sheetFor = id; $("sheet").hidden = false; $("menu").hidden = true;
  const isBag = id === "bag";
  $("sheetTitle").textContent = isBag ? `Your bag · ${store.unplaced().length}` : title(id);
  const tabs = $("sheetTabs"); tabs.hidden = view !== "home" || isBag;
  if (!tabs.hidden) tabs.innerHTML = ROOMS.map((r) => `<button class="chip ${r === id ? "on" : ""}" data-room="${r}">${esc(title(r))} · ${store.children(r).length}</button>`).join("") + `<button class="chip ${id === "home" ? "on" : ""}" data-room="home">Whole home</button>`;
  const list = (id === "home" ? store.children("home").filter((n) => n.type !== "place") : store.children(id)).filter((n) => n.type !== "place");
  list.sort((a, b) => (a.done - b.done) || ((a.type === "task") === (b.type === "task") ? 0 : a.type === "task" ? -1 : 1) || (a.due || "9999").localeCompare(b.due || "9999"));
  const empty = isBag ? "Your bag is empty. Type, speak or snap a photo below; it waits here until you place it." : "Nothing here yet. Add a task, item or note below.";
  $("sheetBody").innerHTML = (list.length ? list.map((n) => itemHtml(n, { bag: isBag })).join("") : `<div class="empty">${empty}</div>`) +
    (isBag ? "" : `<form class="addrow" data-to="${id}"><input placeholder="Add to ${esc(title(id))}… (try “change filter by 20/11”)"><button class="btn primary" style="padding:10px 14px">Add</button></form>`);
}
const refreshSheet = () => { if (sheetFor && !$("sheet").hidden) openSheet(sheetFor); };
function closeSheet() { $("sheet").hidden = true; sheetFor = null; }
$("sheetClose").addEventListener("click", closeSheet);
$("sheetTabs").addEventListener("click", (e) => { const b = e.target.closest("[data-room]"); if (b) { if (b.dataset.room === "home") openSheet("home"); else selectRoom(b.dataset.room); } });
$("sheetBody").addEventListener("submit", (e) => {
  e.preventDefault(); const f = e.target.closest("form"); const inp = f.querySelector("input"); const v = inp.value.trim(); if (!v) return;
  const id = store.capture(v); store.place(id, f.dataset.to); inp.value = ""; toast(`Added to ${title(f.dataset.to)}`);
});
$("sheetBody").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const id = b.dataset.id, n = id ? store.get(id) : null;
  if (b.dataset.act === "toggle") { if (n.done) store.reopen(id); else { const xp = store.complete(id); if (xp) toast(`+${xp} XP · ${n.title}`); } }
  if (b.dataset.act === "step") { const xp = store.completeStep(id, +b.dataset.i); if (xp) toast(`+${xp} XP${store.get(id).done ? " · quest complete!" : ""}`); }
  if (b.dataset.act === "place") { store.place(id, b.dataset.to); toast(`Placed in ${title(b.dataset.to)}`); }
  if (b.dataset.act === "open") bridge.openExternal(b.dataset.url);
  if (b.dataset.act === "photo") { const src = await media.getImage(n.images[0]); if (src) showPhoto(src); }
  if (b.dataset.act === "del") { const copy = { ...n }; store.remove(id); toast("Deleted", () => store.add(copy)); }
});
function showPhoto(src) {
  const o = document.createElement("div"); o.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.88);display:grid;place-items:center;z-index:20";
  o.innerHTML = `<img src="${src}" style="max-width:96%;max-height:90%;border-radius:12px">`; o.addEventListener("click", () => o.remove()); document.body.append(o);
}

// ---------- navigation: map, islands, home rooms ----------
let flying = false;
async function fly(to, then) {
  if (flying) return; flying = true; const t0 = performance.now();
  $("fade").style.opacity = "1"; await wait(180);
  view = to; const w = world(); w.cam.zoom = to === "home" ? 0.72 : 1.35; w.cam.updateProjectionMatrix(); w.zoomGoal = 1;
  $("back").hidden = to !== "home"; renderHud(); placeLabels();
  $("fade").style.opacity = "0"; then?.(); await wait(280); flying = false;
  window.__lastFlyMs = Math.round(performance.now() - t0);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function openIsland(id) { if (id === "home") fly("home", () => selectRoom(room)); else openSheet(id); }
function selectRoom(r) { room = r; renderHud(); openSheet(r); }
function openFor(id) {
  const n = store.get(id); if (!n) return;
  const place = n.type === "place" ? n.id : n.parent;
  if (place === "bag") return openSheet("bag");
  if (ROOMS.includes(place) || place === "home") { if (view !== "home") fly("home", () => (place === "home" ? openSheet("home") : selectRoom(place))); else place === "home" ? openSheet("home") : selectRoom(place); }
  else { if (view !== "map") fly("map", () => openSheet(place)); else openSheet(place); }
}
$("back").addEventListener("click", () => { closeSheet(); fly("map"); });
$("bagBtn").addEventListener("click", () => openSheet("bag"));

// ---------- pan, zoom and tap on the 3D world ----------
const el = renderer.domElement, ptrs = new Map(); let down = null, pinch = 0;
const RIGHT = new THREE.Vector3(1, 0, -1).normalize(), UPG = new THREE.Vector3(-1, 0, -1).normalize();
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
el.addEventListener("pointerdown", (e) => { el.setPointerCapture?.(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptrs.size === 1) down = { x: e.clientX, y: e.clientY, moved: false }; else { down = null; const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } });
el.addEventListener("pointermove", (e) => {
  const prev = ptrs.get(e.pointerId); if (!prev) return; const cur = { x: e.clientX, y: e.clientY }; ptrs.set(e.pointerId, cur);
  const w = world();
  if (ptrs.size >= 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch && d) { w.cam.zoom = Math.min(2.4, Math.max(0.6, w.cam.zoom * (d / pinch))); w.cam.updateProjectionMatrix(); } pinch = d; return; }
  if (!down) return; if (Math.hypot(cur.x - down.x, cur.y - down.y) > 9) down.moved = true;
  if (down.moved) { const upp = (w.cam.top - w.cam.bottom) / w.cam.zoom / innerHeight; w.pan.addScaledVector(RIGHT, -(cur.x - prev.x) * upp).addScaledVector(UPG, ((cur.y - prev.y) * upp) / 0.6); w.pan.clampLength(0, view === "map" ? 14 : 7); }
});
function endPtr(e) { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = 0; const d = down; down = null; return d; }
el.addEventListener("pointercancel", endPtr);
el.addEventListener("pointerup", (e) => {
  const d = endPtr(e); if (!d || d.moved) return;
  const w = world(); ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, w.cam);
  const p = new THREE.Vector3(); if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), view === "map" ? -0.5 : 0), p)) return;
  if (view === "map") { let best = null, bd = 1e9; for (const isl of map.isles) { const dd = Math.hypot(p.x - isl.pos[0], p.z - isl.pos[1]); if (dd < isl.radius * 1.15 && dd < bd) { bd = dd; best = isl.id; } } if (best) openIsland(best); else closeSheet(); }
  else selectRoom(p.x < 0 ? (p.z > 0 ? "living" : "bedroom") : (p.z > 0 ? "kitchen" : "office"));
});
el.addEventListener("wheel", (e) => { e.preventDefault(); const w = world(); w.cam.zoom = Math.min(2.4, Math.max(0.6, w.cam.zoom * (e.deltaY > 0 ? 0.92 : 1.08))); w.cam.updateProjectionMatrix(); }, { passive: false });

// ---------- capture: text, voice, photo, scan, share ----------
$("capForm").addEventListener("submit", (e) => {
  e.preventDefault(); const v = $("capInput").value.trim(); if (!v) return;
  const id = store.capture(v); $("capInput").value = "";
  const n = store.get(id); toast(`In your bag${n.due ? ` · due ${dueText(n.due)}` : ""} · suggests ${title(n.suggest[0])}`);
  bounceBag();
});
const bounceBag = () => $("bagBtn").animate([{ transform: "translateX(-50%) scale(1)" }, { transform: "translateX(-50%) scale(1.18)" }, { transform: "translateX(-50%) scale(1)" }], { duration: 380 });
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const speechLang = () => (/^he|^iw/.test(navigator.language) ? "he-IL" : "en-US");
let rec = null;
$("micBtn").addEventListener("click", () => {
  if (bridge.canNativeVoice) { bridge.voice(speechLang()); return; }
  if (!SR) { toast("Voice input isn't available in this browser"); return; }
  if (rec) { rec.stop(); return; }
  rec = new SR(); rec.lang = speechLang(); rec.interimResults = true;
  $("micBtn").classList.add("live");
  rec.onresult = (ev) => { $("capInput").value = [...ev.results].map((r) => r[0].transcript).join(" "); };
  rec.onend = () => { $("micBtn").classList.remove("live"); rec = null; if ($("capInput").value.trim()) $("capForm").requestSubmit(); };
  rec.start();
});
$("camBtn").addEventListener("click", () => $("photoInput").click());
$("photoInput").addEventListener("change", async () => {
  const f = $("photoInput").files[0]; $("photoInput").value = ""; if (!f) return;
  const { images, thumb } = await media.storeImages([await media.fileToDataURL(f)]);
  store.add({ type: "photo", title: `Photo · ${new Date().toLocaleDateString()}`, images, thumb, parent: "bag", suggest: ["home", "paperwork", "living"] });
  toast("Photo in your bag"); bounceBag();
});
$("scanBtn").addEventListener("click", () => bridge.scan());
async function onScan(res) {
  const pages = res?.pages || []; if (!pages.length) return;
  const { images, thumb } = await media.storeImages(pages);
  store.add({ type: "document", title: `Scanned document · ${pages.length} page${pages.length > 1 ? "s" : ""}`, images, thumb, parent: "bag", suggest: ["paperwork", "home", "work"], notes: "" });
  toast("Scan saved to your bag · suggests Paperwork"); openSheet("bag");
}
async function onShare(p) {
  const n = shareToNode(p || {});
  if (n.images?.length) Object.assign(n, await media.storeImages(n.images));
  store.add(n); toast("Shared into your bag"); openSheet("bag");
}
function onVoice(text) { if (!text) return; $("capInput").value = text; $("capForm").requestSubmit(); }
function onBack() {
  if (!$("menu").hidden) { $("menu").hidden = true; return true; }
  if (!$("searchBox").hidden) { $("searchBox").hidden = true; return true; }
  if (!$("sheet").hidden) { closeSheet(); return true; }
  if (view === "home") { fly("map"); return true; }
  return false;
}
const bridge = initBridge({ onShare, onScan, onVoice, onBack, onError: (m) => toast(m) });
$("scanBtn").hidden = !bridge.canScan;
if (!SR && !bridge.canNativeVoice) $("micBtn").hidden = true;

// ---------- search and menu ----------
$("searchBtn").addEventListener("click", () => { $("searchBox").hidden = false; $("searchInput").focus(); });
$("searchClose").addEventListener("click", () => { $("searchBox").hidden = true; });
$("searchInput").addEventListener("input", () => {
  const res = store.search($("searchInput").value).slice(0, 30);
  $("searchRes").innerHTML = res.map((n) => `<button class="item" data-id="${n.id}" style="text-align:start;width:100%">${svgIcon(n.type)}<div class="main"><div class="t">${esc(n.title)}</div><div class="meta">${esc([...store.path(n.id).map(title)].join(" › ") || "Bag")}</div></div></button>`).join("") || (($("searchInput").value.trim()) ? `<div class="empty">No matches</div>` : "");
});
$("searchRes").addEventListener("click", (e) => { const b = e.target.closest("[data-id]"); if (b) { $("searchBox").hidden = true; openFor(b.dataset.id); } });
$("menuBtn").addEventListener("click", () => { $("menu").hidden = !$("menu").hidden; });
$("menu").addEventListener("click", async (e) => {
  const act = e.target.closest("[data-act]")?.dataset.act; if (!act) return; $("menu").hidden = true;
  const stamp = isoDate(new Date());
  if (act === "share") { const r = await bridge.shareText("Life Archipelago", exportDigest(store)); if (r === "copied") toast("Summary copied to the clipboard"); }
  if (act === "export") { bridge.saveFile(`life-backup-${stamp}.json`, "application/json", exportJSON(store)); toast("Backup exported"); }
  if (act === "exportmd") { bridge.saveFile(`life-summary-${stamp}.md`, "text/markdown", exportDigest(store)); toast("Summary exported"); }
  if (act === "import") $("importInput").click();
  if (act === "examples") { for (const n of store.all().filter((x) => x.tags.includes("example"))) store.remove(n.id); toast("Example items removed"); }
  if (act === "about") toast(`Life Archipelago v${VERSION} · ${backendName}${bridge.android ? ` · Android ${bridge.version || ""}` : ""}`);
});
$("importInput").addEventListener("change", async () => {
  const f = $("importInput").files[0]; $("importInput").value = ""; if (!f) return;
  try { importJSON(store, await f.text()); toast("Backup imported"); } catch (err) { toast("That file isn't a Life Archipelago backup"); }
});

// ---------- toast ----------
let toastT = 0;
function toast(text, undo) {
  const t = $("toast"); t.innerHTML = esc(text) + (undo ? ` <button class="chip" style="margin-inline-start:8px">Undo</button>` : ""); t.hidden = false;
  if (undo) t.querySelector("button").onclick = () => { undo(); t.hidden = true; };
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, undo ? 4500 : 2600);
}

// ---------- loop ----------
store.on(() => { renderHud(); refreshSheet(); });
renderHud();
$("renderer").textContent = `v${VERSION} · ${backendName}`;
let T = 0, last = performance.now(), frames = 0;
renderer.setAnimationLoop(() => {
  const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; T += dt;
  const w = world();
  if (w.zoomGoal) { w.cam.zoom += (w.zoomGoal - w.cam.zoom) * Math.min(1, dt * 6); if (Math.abs(w.cam.zoom - w.zoomGoal) < 0.002) { w.cam.zoom = w.zoomGoal; w.zoomGoal = 0; } w.cam.updateProjectionMatrix(); }
  const tgt = w.cam.userData.target.clone().add(w.pan); w.cam.position.copy(tgt).add(w.base); w.cam.lookAt(tgt);
  w.updaters.forEach((u) => u(T, dt));
  w.post.render();
  placeLabels();
  if (++frames === 20) { window.__life = { ready: true, store, view: () => view, backendName }; }
});
