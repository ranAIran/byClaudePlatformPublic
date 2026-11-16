// Life Archipelago v0.1 — the same file runs on the web and inside the Android app's WebView.
import * as THREE from "three";
import { pass, renderOutput } from "three/tsl";
import { bloom } from "../../quest/vendor/BloomNode.js";
import { buildMap, buildHome, fitCamera, projectTo } from "./scenes.js";
import { createStore, localStorageBackend } from "./core/store.js";
import { exportJSON, importJSON, exportDigest } from "./core/exporter.js";
import { shareToNode } from "./core/share.js";
import { isoDate } from "./core/capture.js";
import { initBridge } from "./bridge.js";
import { buildFeedback } from "./core/feedback.js";
import { districtMood } from "./core/mood.js";
import { celebrationFor } from "./core/reward.js";
import { createFx } from "./fx.js";
import { orbitOffset, panBasis, turn, clamp } from "./core/orbit.js";
import { makeWalker } from "./core/walk.js";
import { createPhysics } from "./core/physics.js";
import * as media from "./media.js";

export const VERSION = "0.3.1";
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
const renderer = new THREE.WebGPURenderer({ antialias: true, powerPreference: "high-performance", forceWebGL: params.has("webgl") });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = 1.15;
$("stage").append(renderer.domElement);
try { await renderer.init(); } catch (e) { $("splashMsg").textContent = "This device couldn't start the 3D view. Try updating your browser."; throw e; }
const backendName = renderer.backend?.isWebGPUBackend ? "WebGPU" : "WebGL2";

// Post-processing with its own screen quad per world. THREE.PostProcessing (r170) shares one quad and
// material between all instances, so the second world overwrote the first: going back to the map kept
// showing the house. A private quad per world also avoids recompiling the shader on every switch.
function screenPass(node) {
  const q = new THREE.QuadMesh(new THREE.NodeMaterial());
  q.material.fragmentNode = renderOutput(node, renderer.toneMapping, renderer.outputColorSpace);
  return { render() {
    const tm = renderer.toneMapping, cs = renderer.outputColorSpace;
    renderer.toneMapping = THREE.NoToneMapping; renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    q.render(renderer); renderer.toneMapping = tm; renderer.outputColorSpace = cs;
  } };
}
const map = buildMap(), home = buildHome();
for (const w of [map, home]) {
  fitCamera(w.cam);
  // The view: where the camera is on its orbit (R29). Goals are eased to; null means "stay".
  w.v = { yaw: w.cam.userData.yaw, pitch: w.cam.userData.pitch, dist: w.cam.userData.dist, zoom: 1, yawGoal: null, pitchGoal: null };
  w.pan = new THREE.Vector3();
  const sp = pass(w.scene, w.cam), c = sp.getTextureNode("output");
  w.post = screenPass(c.add(bloom(c, 0.45, 0.35, 0.85)));
}
let view = "map", room = "living";
const world = () => (view === "map" ? map : home);
window.addEventListener("resize", () => { renderer.setSize(innerWidth, innerHeight); fitCamera(map.cam); fitCamera(home.cam); });

// ---------- labels over the 3D world ----------
const labelEls = {};
const PLACE_ICON = {
  home: "M4 11l8-7 8 7M6 10v9h12v-9M10 19v-5h4v5", work: "M4 8h16v11H4zM9 8V5h6v3M4 13h16", health: "M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.400-7 10-7 10z",
  family: "M9 11a3 3 0 1 0 0-6a3 3 0 0 0 0 6M3 20c.6-3.4 2.9-5 6-5s5.400 1.600 6 5M16.500 11a2.500 2.500 0 1 0 0-5M17 15c2.200.4 3.600 1.900 4 5", paperwork: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6",
  bag: "M6 8h12l-1 12H7L6 8zM9 8V6a3 3 0 0 1 6 0v2", living: "M5 12V9a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3zM6 18v2M18 18v2",
  kitchen: "M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M16 3c-2 2-2 6 0 8v10", bedroom: "M3 18V7M3 14h18v4M21 14a3 3 0 0 0-3-3h-7v3", office: "M4 5h16v10H4zM9 19h6M12 15v4",
};
const pIcon = (id) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${PLACE_ICON[id] || PLACE_ICON.home}"/></svg>`;
for (const d of map.isles) {
  const el = document.createElement("button"); el.className = "lbl";
  el.innerHTML = `<b><i style="background:${ISL_COLOR[d.id]}">${pIcon(d.id)}</i>${d.name}</b><span class="badge"></span>`;
  el.addEventListener("click", () => (mode === "walk" && view === "map" && W.arrived !== d.id ? walkTo(map.walk.doors[d.id]) : openIsland(d.id)));
  el.userData = new THREE.Vector3(d.pos[0], d.labelY, d.pos[1]);
  $("labels").append(el); labelEls[d.id] = el;
}
const roomEls = {};
for (const r of ROOMS) {
  const el = document.createElement("button"); el.className = "rlbl";
  el.addEventListener("click", () => selectRoom(r)); el.hidden = true; el.userData = home.rooms[r];
  $("labels").append(el); roomEls[r] = el;
}
function placeLabels() {
  const w = world();
  const place = (el) => { const [x, y, z] = projectTo(w.cam, el.userData); el.style.left = x + "px"; el.style.top = y + "px"; el.style.visibility = z > 1 || y < 150 ? "hidden" : ""; }; // behind the camera, or under the HUD
  for (const el of Object.values(labelEls)) { el.hidden = view !== "map"; if (!el.hidden) place(el); }
  for (const el of Object.values(roomEls)) { el.hidden = view !== "home"; if (!el.hidden) place(el); }
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
function renderHud() {
  const L = store.level();
  $("lvl").textContent = L.level; $("lvlName").textContent = `Level ${L.level} · Life explorer`; $("lvl").setAttribute("aria-label", `Level ${L.level}`);
  $("xpBar").style.width = `${(100 * L.into) / L.need}%`; $("xpTxt").textContent = `${L.into}/${L.need}`;
  const h = hp(); $("hpBar").style.width = h + "%"; $("hpTxt").textContent = h;
  $("today").textContent = new Date().toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const open = store.all().filter((n) => n.type === "task" && !n.done && n.parent !== "bag").sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999")).slice(0, 4);
  $("quests").innerHTML = open.map((n) => `<button class="pill" data-id="${n.id}"><span class="dot" style="background:${ISL_COLOR[islandOf(n.id)] || "#fff"}"></span>${esc(n.title)}${n.due ? ` <span class="due ${dueText(n.due).startsWith("overdue") ? "late" : ""}">${dueText(n.due)}</span>` : ""}</button>`).join("");
  for (const [id, el] of Object.entries(labelEls)) {
    const md = districtMood(store, id), badge = el.querySelector(".badge");
    badge.textContent = md.overdue ? `${md.overdue} overdue` : md.soon ? `${md.soon} due soon` : md.open ? `${md.open} open` : "all clear";
    el.dataset.state = md.overdue ? "overdue" : md.soon ? "soon" : md.open ? "open" : "clear";
    badge.style.background = el.dataset.state === "open" ? ISL_COLOR[id] : "";
    map.setMood(id, md.state);
  }
  for (const r of ROOMS) { const n = store.children(r).length; roomEls[r].textContent = `${title(r)} · ${n}`; roomEls[r].classList.toggle("on", r === room); }
  const bag = store.unplaced().length; $("bagCount").textContent = bag; $("bagCount").hidden = !bag; $("bagBtn").classList.toggle("has", !!bag);
}
$("quests").addEventListener("click", (e) => { const b = e.target.closest("[data-id]"); if (b) openFor(b.dataset.id); });

// ---------- R26 · celebrations ----------
let sound = true; try { sound = localStorage.getItem("life-sound") !== "off"; } catch (e) { /* storage unavailable */ }
const fx = createFx({ xpBar: $("xpBar"), levelBadge: $("lvl"), soundOn: () => sound });
let justDone = null; const pendingCoins = {};
// Finish something through `act` (which returns the XP gained) and play the celebration it earned.
function finish(id, from, act, { isStep = false } = {}) {
  const n = store.get(id), levelBefore = store.level().level, wasClear = districtMood(store, islandOf(id)).state === "clear";
  justDone = id; const gained = act(); const after = store.get(id);
  const c = celebrationFor({ gained, isStep, questDone: isStep && !!after?.done, levelBefore, levelAfter: store.level().level });
  fx.play(c, from, { title: n.title });
  const place = islandOf(id);
  if (c && map.walk.doors[place]) pendingCoins[place] = Math.min(40, (pendingCoins[place] || 0) + (c.levelUp ? 30 : c.kind === "quest" ? 20 : c.kind === "task" ? 9 : 4));
  if (c && !wasClear && place && districtMood(store, place).state === "clear") setTimeout(() => toast(`${title(place)} is all clear. The lights are up!`), c.levelUp ? 3400 : 900);
  setTimeout(() => { if (justDone === id) justDone = null; }, 700);
}

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
  const lead = n.type === "task" ? `<button class="check ${n.done ? "on" : ""} ${n.id === justDone ? "pop" : ""}" data-act="toggle" data-id="${n.id}" aria-label="${n.done ? "Done. Tap to reopen" : "Mark as done"}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.500l4.500 4.500L19 7.500"/></svg></button>`
    : n.thumb ? `<img class="thumb" src="${n.thumb}" alt="" data-act="photo" data-id="${n.id}">` : svgIcon(n.type);
  const meta = [n.type !== "task" ? n.type : "", n.due ? `<span style="font-weight:700;color:${dueText(n.due).startsWith("overdue") ? "var(--bad)" : "var(--soon)"}">${dueText(n.due)}</span>` : "", n.effort > 1 ? `effort ${n.effort}` : "", n.tags.includes("example") ? "example" : "", n.notes ? esc(n.notes) : ""].filter(Boolean).join(" · ");
  const steps = n.steps ? `<div class="steps">${n.steps.map((s, i) => `<button class="step ${s.done ? "on" : ""}" data-act="step" data-id="${n.id}" data-i="${i}"><i></i><span>${esc(s.title)}</span></button>`).join("")}</div>` : "";
  const link = n.url ? `<button class="chip" data-act="open" data-url="${esc(n.url)}">Open ${esc(n.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 32))}</button>` : "";
  const sug = bag ? `<div class="row" style="gap:6px;flex-wrap:wrap">${(n.suggest.length ? n.suggest : ["home", "paperwork", "work"]).slice(0, 3).map((p, i) => `<button class="chip ${i === 0 ? "on" : ""}" data-act="place" data-id="${n.id}" data-to="${p}">→ ${esc(title(p))}</button>`).join("")}</div>` : "";
  return `<div class="item ${n.done ? "done" : ""}">${lead}<div class="main"><div class="t">${esc(n.title)}</div>${meta ? `<div class="meta">${meta}</div>` : ""}${steps}${link}${sug}</div><button class="x ghost" data-act="del" data-id="${n.id}" aria-label="Delete">✕</button></div>`;
}
function openSheet(id) {
  sheetFor = id; $("sheet").hidden = false; $("menu").hidden = true;
  const isBag = id === "bag";
  $("sheetTitle").textContent = isBag ? "Your bag" : title(id);
  $("sheetDot").style.background = isBag ? "#ffc94d" : ISL_COLOR[islandOf(id)] || "#ffc94d"; $("sheetDot").innerHTML = pIcon(isBag ? "bag" : id);
  document.body.classList.add("sheet-open");
  const tabs = $("sheetTabs"); tabs.hidden = view !== "home" || isBag;
  if (!tabs.hidden) tabs.innerHTML = ROOMS.map((r) => `<button class="chip ${r === id ? "on" : ""}" data-room="${r}">${esc(title(r))} · ${store.children(r).length}</button>`).join("") + `<button class="chip ${id === "home" ? "on" : ""}" data-room="home">Whole home</button>`;
  const list = (id === "home" ? store.children("home").filter((n) => n.type !== "place") : store.children(id)).filter((n) => n.type !== "place");
  list.sort((a, b) => (a.done - b.done) || ((a.type === "task") === (b.type === "task") ? 0 : a.type === "task" ? -1 : 1) || (a.due || "9999").localeCompare(b.due || "9999"));
  const md = districtMood(store, id), things = list.filter((n) => n.type !== "task").length, plural = (k, w) => `${k} ${w}${k === 1 ? "" : "s"}`;
  $("sheetSub").textContent = isBag ? (list.length ? `${plural(list.length, "thing")} waiting. Tap a suggestion to file it.` : "Nothing waiting")
    : [md.open ? `${md.open} open` : "All clear", md.overdue ? `${md.overdue} overdue` : md.soon ? `${md.soon} due soon` : "", things ? plural(things, "thing") : ""].filter(Boolean).join(" · ");
  const empty = isBag ? "Your bag is empty. Type, speak or snap a photo below; it waits here until you place it." : "Nothing here yet. Add a task, item or note below.";
  $("sheetBody").innerHTML = (list.length ? list.map((n) => itemHtml(n, { bag: isBag })).join("") : `<div class="empty">${empty}</div>`) +
    (isBag ? "" : `<form class="addrow" data-to="${id}"><input placeholder="Add to ${esc(title(id))}… (try “change filter by 20/11”)"><button class="btn primary" style="padding:10px 14px">Add</button></form>`);
}
const refreshSheet = () => { if (sheetFor && !$("sheet").hidden) openSheet(sheetFor); };
function closeSheet() { $("sheet").hidden = true; sheetFor = null; document.body.classList.remove("sheet-open"); releaseCoins(); }
$("sheetClose").addEventListener("click", closeSheet);
$("sheetTabs").addEventListener("click", (e) => { const b = e.target.closest("[data-room]"); if (b) { if (b.dataset.room === "home") openSheet("home"); else selectRoom(b.dataset.room); } });
$("sheetBody").addEventListener("submit", (e) => {
  e.preventDefault(); const f = e.target.closest("form"); const inp = f.querySelector("input"); const v = inp.value.trim(); if (!v) return;
  const id = store.capture(v); store.place(id, f.dataset.to); inp.value = ""; toast(`Added to ${title(f.dataset.to)}`);
});
$("sheetBody").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const id = b.dataset.id, n = id ? store.get(id) : null;
  const from = b.getBoundingClientRect();
  if (b.dataset.act === "toggle") { if (n.done) store.reopen(id); else finish(id, from, () => store.complete(id)); }
  if (b.dataset.act === "step") finish(id, from, () => store.completeStep(id, +b.dataset.i), { isStep: true });
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
  view = to; const w = world(); w.v.zoom = to === "home" ? 0.72 : 1.35; w.zoomGoal = 1;
  $("back").hidden = to !== "home"; renderHud(); placeLabels();
  $("fade").style.opacity = "0"; then?.(); await wait(280); flying = false;
  window.__lastFlyMs = Math.round(performance.now() - t0);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let hinted = true; try { hinted = !!localStorage.getItem("life-hinted"); } catch (e) { /* storage unavailable */ }
function hideHint() { if (hinted) return; hinted = true; try { localStorage.setItem("life-hinted", "1"); } catch (e) { /* ignore */ } $("hint").classList.add("out"); setTimeout(() => { $("hint").hidden = true; }, 450); }
if (!hinted) { $("hint").hidden = false; setTimeout(hideHint, 16000); }
function openIsland(id) { hideHint(); if (id === "home") fly("home", () => selectRoom(room)); else openSheet(id); }
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

// ---------- look around (R29): drag to move, twist or right-drag to turn and tilt, pinch or wheel to zoom ----------
const el = renderer.domElement, ptrs = new Map(); let down = null, pinch = 0, twist = 0, midY = 0;
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const viewDist = (w) => (w.v.dist * w.cam.userData.fit) / w.v.zoom;
function turnView(w, dYaw, dPitch) {
  const v = w.v, L = w.cam.userData.limits; v.yawGoal = v.pitchGoal = null; W.turned = performance.now();
  v.yaw += dYaw; if (L.yaw) v.yaw = clamp(v.yaw, L.yaw[0], L.yaw[1]);
  v.pitch = clamp(v.pitch + dPitch, L.pitch[0], L.pitch[1]);
}
function turnBy(step) { const v = world().v, L = world().cam.userData.limits; let g = (v.yawGoal ?? v.yaw) + step; if (L.yaw) g = clamp(g, L.yaw[0], L.yaw[1]); v.yawGoal = g; hideHint(); }
function zoomView(w, k) { const L = w.cam.userData.limits; w.v.zoom = clamp(w.v.zoom * k, L.zoom[0], L.zoom[1]); w.zoomGoal = 0; }
el.addEventListener("contextmenu", (e) => e.preventDefault());
el.addEventListener("pointerdown", (e) => {
  el.setPointerCapture?.(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) down = { x: e.clientX, y: e.clientY, moved: false, turn: e.button === 2 || e.shiftKey || e.altKey };
  else { down = null; const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); twist = Math.atan2(b.y - a.y, b.x - a.x); midY = (a.y + b.y) / 2; }
});
el.addEventListener("pointermove", (e) => {
  const prev = ptrs.get(e.pointerId); if (!prev) return; const cur = { x: e.clientX, y: e.clientY }; ptrs.set(e.pointerId, cur);
  const w = world();
  if (ptrs.size >= 2) { // two fingers: pinch zooms, twisting turns, sliding both up or down tilts
    const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x), my = (a.y + b.y) / 2;
    if (pinch && d) zoomView(w, d / pinch);
    turnView(w, turn(twist, ang), (my - midY) * 0.006); hideHint();
    pinch = d; twist = ang; midY = my; return;
  }
  if (!down) return; if (Math.hypot(cur.x - down.x, cur.y - down.y) > 9) down.moved = true;
  if (!down.moved) return; hideHint();
  const dx = cur.x - prev.x, dy = cur.y - prev.y;
  if (down.turn || (mode === "walk" && view === "map")) { turnView(w, -dx * 0.006, dy * 0.005); return; }
  const { right, forward } = panBasis(w.v.yaw), upp = (2 * viewDist(w) * Math.tan((w.cam.fov * Math.PI) / 360)) / innerHeight, f = (dy * upp) / Math.max(0.3, Math.sin(w.v.pitch));
  w.pan.x += -dx * upp * right[0] + f * forward[0]; w.pan.z += -dx * upp * right[2] + f * forward[2]; w.pan.clampLength(0, view === "map" ? 14 : 7);
});
function endPtr(e) { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = 0; const d = down; down = null; return d; }
el.addEventListener("pointercancel", endPtr);
el.addEventListener("pointerup", (e) => {
  const d = endPtr(e); if (!d || d.moved) return;
  const w = world(); ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, w.cam);
  if (view === "map") { // things that react when touched (R32): the balloon bobs, a ball gets a kick
    const poked = ray.intersectObjects([map.balloon, ...map.toys.map((t) => t.mesh)], true)[0];
    if (poked) { let o = poked.object; while (o.parent && o !== map.balloon && !o.userData.toy) o = o.parent; poke(o); return; }
  }
  const p = new THREE.Vector3(); if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), view === "map" ? -0.26 : 0), p)) return;
  if (view === "map") {
    // Tall buildings hide the ground behind them, so hit the buildings themselves first.
    let best = null, hit = null;
    for (const h of ray.intersectObjects(Object.values(map.G), true)) { let o = h.object; while (o && !o.userData.district) o = o.parent; if (o) { best = o.userData.district; hit = h.point; break; } }
    if (mode === "walk") { // a tap on a building walks to its door; a tap on the ground walks to that spot
      hideHint(); const ground = !hit || hit.y < 0.75, spot = hit && ground ? [hit.x, hit.z] : [p.x, p.z];
      if (best && !ground && W.arrived === best) openIsland(best); else walkTo(best && !ground ? map.walk.doors[best] : spot);
      return;
    }
    if (!best) { let bd = 1e9; for (const isl of map.isles) { const dd = Math.hypot(p.x - isl.pos[0], p.z - isl.pos[1]); if (dd < isl.radius && dd < bd) { bd = dd; best = isl.id; } } }
    if (best) openIsland(best); else closeSheet();
  }
  else selectRoom(p.x < 0 ? (p.z > 0 ? "living" : "bedroom") : (p.z > 0 ? "kitchen" : "office"));
});
el.addEventListener("wheel", (e) => { e.preventDefault(); zoomView(world(), e.deltaY > 0 ? 0.92 : 1.08); }, { passive: false });
$("rotL").addEventListener("click", () => turnBy(-Math.PI / 4));
$("rotR").addEventListener("click", () => turnBy(Math.PI / 4));
window.addEventListener("keydown", (e) => {
  if (/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || "")) return;
  const k = e.key.toLowerCase(); if (k === "q") turnBy(-Math.PI / 4); if (k === "e") turnBy(Math.PI / 4);
  if (WALK_KEYS[k] && mode === "walk") { W.keys.add(k); W.path = null; e.preventDefault(); }
});
window.addEventListener("keyup", (e) => W.keys.delete(e.key.toLowerCase()));

// ---------- R31 · walk in the city: tap where to go, the camera follows behind you ----------
const walker = makeWalker(map.walk), me = map.player;
const WALK_KEYS = { w: [0, 1], arrowup: [0, 1], s: [0, -1], arrowdown: [0, -1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0] };
const W = { path: null, keys: new Set(), arrived: null, k: 0, dist: 8.5, told: false, turned: 0, arm: 99, armNow: 8.5 };
const arm = new THREE.Raycaster();
let mode = "overview";
const nearDoor = () => Object.entries(map.walk.doors).find(([, d]) => Math.hypot(me.position.x - d[0], me.position.z - d[1]) < 1.2)?.[0] || null;
function setWalk(on) {
  mode = on ? "walk" : "overview"; const v = map.v;
  $("walkBtn").classList.toggle("on", on); $("walkBtn").setAttribute("aria-pressed", on); map.doorMarks.visible = on; document.body.classList.toggle("walking", on);
  W.path = null; W.keys.clear(); closeSheet(); hideHint();
  if (on) { W.back = { pitch: v.pitch, yaw: v.yaw }; W.arrived = nearDoor(); v.pitchGoal = 0.36; map.zoomGoal = 1; if (!W.told) { W.told = true; toast("Tap where you want to go, or tap a building to walk to its door"); } }
  else { v.pitchGoal = W.back?.pitch ?? v.pitch; if (W.back) v.yawGoal = v.yaw + turn(v.yaw, W.back.yaw); map.zoomGoal = 1; me.userData.state = null; }
}
function walkTo(pt) { if (pt) W.path = walker.route(me.position.x, me.position.z, pt[0], pt[1]); }
$("walkBtn").addEventListener("click", () => { if (view === "map") setWalk(mode !== "walk"); });
function walkTick(real) {
  let dx = 0, dz = 0;
  if (W.keys.size) { const { right, forward } = panBasis(map.v.yaw); let sx = 0, sy = 0; for (const k of W.keys) { sx += WALK_KEYS[k][0]; sy += WALK_KEYS[k][1]; } dx = right[0] * sx + forward[0] * sy; dz = right[2] * sx + forward[2] * sy; }
  else { // follow the route, one waypoint at a time
    while (W.path?.length && Math.hypot(W.path[0][0] - me.position.x, W.path[0][1] - me.position.z) < 0.12) W.path.shift();
    if (W.path?.length) { dx = W.path[0][0] - me.position.x; dz = W.path[0][1] - me.position.z; }
  }
  const len = Math.hypot(dx, dz), moving = len > 0;
  if (moving) {
    dx /= len; dz /= len;
    let left = Math.min(3.4 * Math.min(0.12, real), W.keys.size ? 9 : len), ok = true;
    while (left > 1e-4 && ok) { const st = Math.min(0.09, left); left -= st; [me.position.x, me.position.z, ok] = walker.step(me.position.x, me.position.z, dx * st, dz * st); }
    if (!ok) W.path = null; // blocked (only happens with the keys: routes are clear)
    me.rotation.y += turn(me.rotation.y, Math.atan2(dx, dz)) * Math.min(1, real * 10);
    // Chase camera: drift round behind you as you walk, unless you turned the view yourself a moment ago.
    if (performance.now() - (W.turned || 0) > 2500 && map.v.yawGoal == null) map.v.yaw += turn(map.v.yaw, Math.atan2(-dx, -dz)) * (1 - Math.exp(-1.1 * Math.min(0.12, real)));
    // Walking into a ball kicks it.
    for (const t of map.toys) { const b = t.body; if (Math.hypot(b.p[0] - me.position.x, b.p[2] - me.position.z) < b.r + 0.34 && b.p[1] < me.position.y + 0.8) physics.kick(b, dx * 6.5, 3.4, dz * 6.5); }
  }
  me.position.y += (walker.groundY(me.position.x, me.position.z) - me.position.y) * Math.min(1, real * 12);
  me.userData.state = moving ? { walking: true } : {};
  // Reaching a door opens that place; you have to step away before it opens again.
  for (const [id, d] of Object.entries(map.walk.doors)) {
    const dd = Math.hypot(me.position.x - d[0], me.position.z - d[1]);
    if (dd < 0.3 && W.arrived !== id) { W.arrived = id; W.path = null; openIsland(id); } else if (W.arrived === id && dd > 2.2) W.arrived = null;
  }
}

// ---------- R32 · things react physically: balls, the balloon, reward coins ----------
const physics = createPhysics({ groundY: walker.groundY, inCity: (x, z) => walker.inCity(x, z, 0.1), solids: map.walk.solids });
for (const t of map.toys) t.body = physics.add({ p: [t.mesh.position.x, t.mesh.position.y, t.mesh.position.z], r: t.r, bounce: 0.62, drag: 0.7, home: t.home, kind: "toy" });
const coinNone = new THREE.Matrix4().makeScale(0, 0, 0); let coinsShown = 0;
const coinM = new THREE.Matrix4(), coinQ = new THREE.Quaternion(), coinE = new THREE.Euler(), coinS = new THREE.Vector3(1, 1, 1), coinP = new THREE.Vector3();
function poke(o) {
  if (o === map.balloon) { map.balloon.userData.vy = (map.balloon.userData.vy || 0) + 4.5; fx.chime([659.25]); return; }
  const t = map.toys.find((q) => q.mesh === o); if (!t) return;
  const { forward } = panBasis(map.v.yaw), sp = 5 + Math.random() * 2.5, a = (Math.random() - 0.5) * 1.2;
  physics.kick(t.body, (forward[0] * Math.cos(a) - forward[2] * Math.sin(a)) * sp, 5.5, (forward[0] * Math.sin(a) + forward[2] * Math.cos(a)) * sp);
}
// Coins earned while a sheet covered the city burst out of that place's door once you can see it.
function releaseCoins() {
  for (const [id, n] of Object.entries(pendingCoins)) {
    delete pendingCoins[id]; const d = map.walk.doors[id]; if (!d || view !== "map") continue;
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, sp = 1.2 + Math.random() * 2.6; physics.add({ p: [d[0], 0.9 + Math.random() * 0.5, d[1]], v: [Math.cos(a) * sp, 6 + Math.random() * 4.5, Math.sin(a) * sp], r: 0.16, bounce: 0.5, drag: 1.4, life: 5.5 + Math.random() * 2, kind: "coin", data: Math.random() * 6 }); }
  }
}
function physicsTick(dt) {
  for (const e of physics.step(dt)) if (e.type === "splash") map.splash(e.at[0], e.at[2]);
  for (const t of map.toys) { const b = t.body; t.mesh.position.set(b.p[0], b.p[1], b.p[2]); t.mesh.rotation.x += (b.v[2] * dt) / b.r; t.mesh.rotation.z -= (b.v[0] * dt) / b.r; }
  let n = 0;
  for (const b of physics.bodies) {
    if (b.kind !== "coin" || n >= 48) continue;
    const fade = Math.min(1, (b.life - b.age) * 2.5); coinE.set(b.data + b.age * (b.asleep ? 0 : 6), b.age * 3, 0); coinQ.setFromEuler(coinE); coinS.setScalar(Math.max(0.01, fade)); coinP.set(b.p[0], b.p[1], b.p[2]);
    map.coins.setMatrixAt(n++, coinM.compose(coinP, coinQ, coinS));
  }
  for (let i = n; i < coinsShown; i++) map.coins.setMatrixAt(i, coinNone);
  if (n || coinsShown) map.coins.instanceMatrix.needsUpdate = true; coinsShown = n;
}

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
  if (!$("feedback").hidden) { $("feedback").hidden = true; return true; }
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
  if (act === "feedback") openFeedback();
  if (act === "share") { const r = await bridge.shareText("Life Archipelago", exportDigest(store)); if (r === "copied") toast("Summary copied to the clipboard"); }
  if (act === "export") { bridge.saveFile(`life-backup-${stamp}.json`, "application/json", exportJSON(store)); toast("Backup exported"); }
  if (act === "exportmd") { bridge.saveFile(`life-summary-${stamp}.md`, "text/markdown", exportDigest(store)); toast("Summary exported"); }
  if (act === "import") $("importInput").click();
  if (act === "examples") { for (const n of store.all().filter((x) => x.tags.includes("example"))) store.remove(n.id); toast("Example items removed"); }
  if (act === "sound") { sound = !sound; try { localStorage.setItem("life-sound", sound ? "on" : "off"); } catch (e) { /* ignore */ } renderSound(); if (sound) fx.chime([523.25, 783.99]); toast(sound ? "Sound is on" : "Sound is off"); }
  if (act === "about") toast(`Life Archipelago v${VERSION} · ${backendName}${bridge.android ? ` · Android ${bridge.version || ""}` : ""}`);
});
const renderSound = () => { const b = $("menu").querySelector('[data-act="sound"]'); if (b) b.querySelector("span").textContent = `Sound: ${sound ? "on" : "off"}`; };
renderSound();
$("importInput").addEventListener("change", async () => {
  const f = $("importInput").files[0]; $("importInput").value = ""; if (!f) return;
  try { importJSON(store, await f.text()); toast("Backup imported"); } catch (err) { toast("That file isn't a Life Archipelago backup"); }
});

// ---------- R16 · feedback ----------
let fbKind = "idea";
function diag() {
  return {
    version: VERSION,
    platform: bridge.android ? `Android app ${bridge.version || ""}`.trim() : "web",
    renderer: backendName,
    screen: `${innerWidth}×${innerHeight} @${Math.round((window.devicePixelRatio || 1) * 10) / 10}`,
    view: view === "home" ? `home › ${room}` : "map",
    open: sheetFor ? title(sheetFor) : "",
    items: store.all().filter((n) => !n.system).length,
    browser: navigator.userAgent.replace(/\s+/g, " ").slice(0, 160),
    time: new Date().toISOString(),
  };
}
function feedbackNow() { return buildFeedback({ kind: fbKind, text: $("fbText").value, diag: diag(), includeDetails: $("fbDetails").checked }); }
function renderDiag() { $("fbDiag").textContent = $("fbDetails").checked ? Object.entries(diag()).map(([k, v]) => `${k}: ${v}`).join("\n") : "Device details will not be included."; }
function openFeedback() {
  $("menu").hidden = true; closeSheet(); $("searchBox").hidden = true;
  $("feedback").hidden = false; renderDiag(); $("fbText").focus();
}
$("fbKinds").addEventListener("click", (e) => { const b = e.target.closest("[data-kind]"); if (!b) return; fbKind = b.dataset.kind; for (const c of $("fbKinds").children) c.classList.toggle("on", c === b); });
$("fbDetails").addEventListener("change", renderDiag);
$("fbClose").addEventListener("click", () => { $("feedback").hidden = true; });
$("fbGitHub").addEventListener("click", () => {
  bridge.openExternal(feedbackNow().url);
  $("feedback").hidden = true; $("fbText").value = ""; toast("Thank you! Press Submit on GitHub to send it");
});
$("fbShare").addEventListener("click", async () => {
  const f = feedbackNow(); const r = await bridge.shareText(f.title, f.text);
  if (r === "copied") toast("Feedback copied: paste it in an email or chat");
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
  const now = performance.now(), real = (now - last) / 1000, dt = Math.min(0.05, real); last = now; T += dt;
  const w = world(), v = w.v, ease = (k) => 1 - Math.exp(-k * Math.min(0.3, real)); // camera moves keep real time, even at low frame rates
  if (w.zoomGoal) { v.zoom += (w.zoomGoal - v.zoom) * ease(6); if (Math.abs(v.zoom - w.zoomGoal) < 0.002) { v.zoom = w.zoomGoal; w.zoomGoal = 0; } }
  if (v.yawGoal != null) { const d = v.yawGoal - v.yaw; v.yaw += d * ease(9); if (Math.abs(d) < 0.004) { v.yaw = v.yawGoal; v.yawGoal = null; } }
  if (v.pitchGoal != null) { const d = v.pitchGoal - v.pitch; v.pitch += d * ease(7); if (Math.abs(d) < 0.004) { v.pitch = v.pitchGoal; v.pitchGoal = null; } }
  const tgt = w.cam.userData.target.clone().add(w.pan); let d = viewDist(w);
  if (w === map) {
    if (mode === "walk") walkTick(real);
    physicsTick(dt);
    // W.k glides 0 → 1 when you start walking: the camera leaves the overview and settles behind you.
    W.k += ((mode === "walk" ? 1 : 0) - W.k) * ease(4); if (Math.abs(W.k - (mode === "walk" ? 1 : 0)) < 0.002) W.k = mode === "walk" ? 1 : 0;
    if (W.k > 0) {
      const head = new THREE.Vector3(me.position.x, me.position.y + 0.95, me.position.z);
      tgt.lerp(head, W.k); d += (W.dist / v.zoom - d) * W.k;
      // Spring arm: if a building or a tree stands between you and the camera, the camera moves in front of it.
      if (W.k > 0.6) {
        if (frames % 3 === 0) {
          const o = orbitOffset(v.yaw, v.pitch, 1); arm.set(head, new THREE.Vector3(o[0], o[1], o[2])); arm.far = d;
          const h = arm.intersectObjects(Object.values(map.G), true).find((q) => { for (let n = q.object; n; n = n.parent) if (!n.visible) return false; return true; });
          W.arm = h ? Math.max(1.6, h.distance - 0.4) : 99;
        }
        W.armNow += (Math.min(d, W.arm) - W.armNow) * ease(W.arm < W.armNow ? 14 : 3); d = Math.min(d, W.armNow);
      } else W.armNow = d;
      const fov = 30 + 18 * W.k; if (Math.abs(w.cam.fov - fov) > 0.05) { w.cam.fov = fov; w.cam.updateProjectionMatrix(); }
    } else if (w.cam.fov !== 30) { w.cam.fov = 30; w.cam.updateProjectionMatrix(); }
  }
  const off = orbitOffset(v.yaw, v.pitch, d);
  w.cam.position.set(tgt.x + off[0], tgt.y + off[1], tgt.z + off[2]); w.cam.lookAt(tgt);
  w.updaters.forEach((u) => u(T, dt));
  // Warm up the other world's shaders once, after the first frames, so the first flight does not stall.
  // (Not before the first frame: compiling early left the quest blank once.) The map is drawn over it.
  if (frames === 10) (w === map ? home : map).post.render();
  w.post.render();
  placeLabels();
  if (frames === 3) { $("splash").classList.add("out"); setTimeout(() => $("splash")?.remove(), 700); }
  if (++frames === 20) { window.__life = { ready: true, store, view: () => view, backendName,
    lastFx: () => fx.last(), confetti: () => fx.confetti(),
    goTo: (id) => walkTo(map.walk.doors[id]), screenOf: (x, y, z) => { const [sx, sy] = projectTo(map.cam, new THREE.Vector3(x, y, z)); return { x: sx, y: sy }; },
    walk: () => ({ mode, x: me.position.x, z: me.position.z, k: W.k, left: W.path?.length || 0, arrived: W.arrived }),
    props: () => ({ coins: physics.bodies.filter((b) => b.kind === "coin").length, toys: map.toys.map((t) => { const [x, y] = projectTo(map.cam, t.mesh.position); return { x, y, p: [...t.body.p], speed: Math.hypot(...t.body.v) }; }) }),
    cam: () => ({ yaw: world().v.yaw, pitch: world().v.pitch, zoom: world().v.zoom, perspective: !!world().cam.isPerspectiveCamera }), setCam: (o) => { Object.assign(world().v, o); },
    meshes: () => { let n = 0; map.scene.traverse((o) => { if (o.isMesh && o.visible) n++; }); return n; },
    districts: () => map.isles.map((d) => { const [x, y] = projectTo(map.cam, new THREE.Vector3(d.pos[0], 1.0, d.pos[1])); return { id: d.id, x, y }; }),
    moods: () => Object.fromEntries(map.isles.map((d) => [d.id, { state: districtMood(store, d.id).state, signs: map.moodSigns(d.id) }])),
    terrariums: () => { const out = []; home.scene.traverse((o) => { if (o.name === "terrarium") { const { w, h, d } = o.userData.size; const lz = o.getObjectByName("lizard"); out.push([w, h, d].map((v) => Math.round(v * 80)).concat(lz ? [`lizard ${Math.round(lz.userData.length * 80)}cm`] : [])); } }); return out; } }; }
});
