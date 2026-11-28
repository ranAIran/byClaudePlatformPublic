// Life Archipelago v0.1 — the same file runs on the web and inside the Android app's WebView.
import * as THREE from "three";
import { pass, renderOutput } from "three/tsl";
import { bloom } from "../../quest/vendor/BloomNode.js";
import { buildMap, buildHome, fitCamera, projectTo } from "./scenes.js";
import { createStore } from "./core/store.js";
import { openSavedBackend, openKeyStore } from "./storage.js";
import { createSync } from "./core/sync.js";
import { createSupabaseRemote } from "./supa.js";
import { backupDue, backupName, exportReminderDue } from "./core/backup.js";
import { exportJSON, importJSON, exportDigest } from "./core/exporter.js";
import { shareToNode } from "./core/share.js";
import { isoDate } from "./core/capture.js";
import { initBridge } from "./bridge.js";
import { buildFeedback } from "./core/feedback.js";
import { districtMood } from "./core/mood.js";
import { applyEdit, placeChoices } from "./core/edit.js";
import { todayList } from "./core/today.js";
import { describeRepeat } from "./core/repeat.js";
import { reminderList } from "./core/reminders.js";
import { CATALOG, SLOTS, buy, decorationsFor } from "./core/shop.js";
import { LANGS, makeT, pickLang, placeTitle } from "./core/i18n.js";
import { pickQuality, canChooseQuality } from "./core/quality.js";
import { categories, addCategory, renameCategory, removeCategory } from "./core/categories.js";
import { parseDeepLink } from "./core/links.js";
import { celebrationFor } from "./core/reward.js";
import { goalBoard, timeLeft, progressView, stuckReason, STUCK_ANSWERS, STUCK_ACTION, STAKES } from "./core/goals.js";
import { goalArt } from "./goalart.js";
import { createFx } from "./fx.js";
import { orbitOffset, panBasis, turn, clamp } from "./core/orbit.js";
import { makeWalker } from "./core/walk.js";
import { createPhysics } from "./core/physics.js";
import * as media from "./media.js";

export const VERSION = "0.11.0";
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const saved = await openSavedBackend(); // R19: IndexedDB, moved over from localStorage on first start
// R51 · one id per device, made on first start and kept; the log records which device did what.
const deviceId = (() => { try { let d = localStorage.getItem("life-device"); if (!d) { d = (/; wv\)|Android.*Version\//.test(navigator.userAgent) ? "phone-" : "web-") + Math.random().toString(36).slice(2, 8); localStorage.setItem("life-device", d); } return d; } catch (e) { return "web-unknown"; } })();
const store = createStore(saved, { device: deviceId });
// R53/R54 · sync: nothing talks to the server until the owner turns sync on in "Sync & devices".
const keyStore = await openKeyStore();
const sync = createSync({ store, remote: createSupabaseRemote({ keys: keyStore }), keys: keyStore });
// R37 · language: follows the device unless chosen in the menu.
let lang = pickLang((() => { try { return localStorage.getItem("life-lang"); } catch (e) { return null; } })(), navigator.language);
let t = makeT(lang);
const ISL_COLOR = { home: "#ffc94d", work: "#b48cff", health: "#4ee08a", family: "#ff8fb1", paperwork: "#7ad1ff", shopping: "#ff9f6b" };
const ROOMS = ["living", "kitchen", "bedroom", "office"];
const title = (id) => { const n = store.get(id); return n ? placeTitle(id, n.title, lang) : id; };
const islandOf = (id) => { const p = [id, ...store.path(id)].find((x) => ISL_COLOR[x]); return p || store.path(id)[0] || null; };

// ---------- example content on first run ----------
function seedExamples() {
  store.as("app"); try { seedExamplesNow(); } finally { store.as("me"); }
}
function seedExamplesNow() {
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
try { await renderer.init(); } catch (e) { $("splashMsg").textContent = t("cantStart3d"); throw e; }
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
// R39 · enhanced graphics on computers; phones stay light. ?quality=light|enhanced overrides (tests).
const quality = params.get("quality") === "light" || params.get("quality") === "enhanced" ? (coarse ? "light" : params.get("quality"))
  : pickQuality({ coarse, width: innerWidth, saved: (() => { try { return localStorage.getItem("life-quality"); } catch (e) { return null; } })() });
// R42 · the first new category gets the park block; it is drawn in teal.
const firstCustom = categories(store).find((c) => c.custom) || null;
if (firstCustom) ISL_COLOR[firstCustom.id] = "#5fd4c4";
const map = buildMap({ quality, custom: firstCustom }), home = buildHome();
for (const w of [map, home]) {
  fitCamera(w.cam);
  // The view: where the camera is on its orbit (R29). Goals are eased to; null means "stay".
  w.v = { yaw: w.cam.userData.yaw, pitch: w.cam.userData.pitch, dist: w.cam.userData.dist, zoom: 1, yawGoal: null, pitchGoal: null };
  w.pan = new THREE.Vector3();
  const sp = pass(w.scene, w.cam), c = sp.getTextureNode("output");
  w.post = screenPass(c.add(bloom(c, quality === "enhanced" && w === map ? 0.6 : 0.45, 0.35, 0.85)));
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
  kitchen: "M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M16 3c-2 2-2 6 0 8v10",
  shopping: "M4 5h2l2 10h10l2-7H7M10 19a1 1 0 1 0 0 .1M17 19a1 1 0 1 0 0 .1", custom: "M12 3l2.600 5.400 5.900.8-4.300 4.100 1 5.800L12 16.300 6.800 19.100l1-5.800L3.500 9.200l5.900-.8z", bedroom: "M3 18V7M3 14h18v4M21 14a3 3 0 0 0-3-3h-7v3", office: "M4 5h16v10H4zM9 19h6M12 15v4",
};
const pIcon = (id) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${PLACE_ICON[id] || (store.get(id)?.custom ? PLACE_ICON.custom : PLACE_ICON.home)}"/></svg>`;
for (const d of map.isles) {
  const el = document.createElement("button"); el.className = "lbl";
  el.innerHTML = `<b><i style="background:${ISL_COLOR[d.id]}">${pIcon(d.id)}</i><span class="nm">${d.name}</span></b><span class="badge"></span>`;
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
const repeatText = (r) => (r.every === 1 ? t("repeatEvery_" + r.unit) : t("repeatEveryN_" + r.unit, { n: r.every }));
const isLate = (iso) => !!iso && iso < isoDate(new Date());
function dueText(iso) {
  if (!iso) return "";
  const d = Math.round((Date.parse(iso) - Date.parse(isoDate(new Date()))) / 864e5);
  if (d < 0) return t("overdueD", { n: -d }); if (d === 0) return t("dueToday"); if (d === 1) return t("tomorrow"); if (d < 7) return t("inDays", { n: d });
  return new Date(iso).toLocaleDateString(lang === "he" ? "he-IL" : undefined, { day: "numeric", month: "short" });
}
function renderHud() {
  const L = store.level();
  $("lvl").textContent = L.level; $("lvlName").textContent = t("level", { n: L.level }); $("lvl").setAttribute("aria-label", t("levelAria", { n: L.level }));
  $("coinTxt").textContent = store.coins();
  $("xpBar").style.width = `${(100 * L.into) / L.need}%`; $("xpTxt").textContent = `${L.into}/${L.need}`;
  const h = hp(); $("hpBar").style.width = h + "%"; $("hpTxt").textContent = h;
  $("today").textContent = new Date().toLocaleDateString(lang === "he" ? "he-IL" : undefined, { weekday: "short", day: "numeric", month: "short" });
  const open = store.all().filter((n) => n.type === "task" && !n.done && n.parent !== "bag").sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999")).slice(0, 4);
  const td = todayList(store), late = td.overdue.length, due = late + td.today.length;
  $("quests").innerHTML = `<button class="pill today ${late ? "late" : ""}" data-today="1"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16v14H4zM4 10h16M9 3v4M15 3v4"/></svg>${t("today")}${due ? ` <b>${due}</b>` : ""}</button>` + open.map((n) => `<button class="pill" data-id="${n.id}"><span class="dot" style="background:${ISL_COLOR[islandOf(n.id)] || "#fff"}"></span>${esc(n.title)}${n.due ? ` <span class="due ${isLate(n.due) ? "late" : ""}">${dueText(n.due)}</span>` : ""}</button>`).join("");
  for (const [id, el] of Object.entries(labelEls)) {
    const md = districtMood(store, id), badge = el.querySelector(".badge");
    badge.textContent = md.overdue ? t("nOverdue", { n: md.overdue }) : md.soon ? t("nDueSoon", { n: md.soon }) : md.open ? t("nOpen", { n: md.open }) : t("allClear");
    el.querySelector(".nm").textContent = title(id);
    el.dataset.state = md.overdue ? "overdue" : md.soon ? "soon" : md.open ? "open" : "clear";
    badge.style.background = el.dataset.state === "open" ? ISL_COLOR[id] : "";
    map.setMood(id, md.state);
  }
  for (const r of ROOMS) { const n = store.children(r).length; roomEls[r].textContent = `${title(r)} · ${n}`; roomEls[r].classList.toggle("on", r === room); }
  const bag = store.unplaced().length; $("bagCount").textContent = bag; $("bagCount").hidden = !bag; $("bagBtn").classList.toggle("has", !!bag); $("bagCount").classList.toggle("old", td.bagDays > 3);
}
$("quests").addEventListener("click", (e) => { if (e.target.closest("[data-today]")) return openToday(); const b = e.target.closest("[data-id]"); if (b) openFor(b.dataset.id); });
$("today").addEventListener("click", () => openToday());

// ---------- R26 · celebrations ----------
let sound = true; try { sound = localStorage.getItem("life-sound") !== "off"; } catch (e) { /* storage unavailable */ }
const fx = createFx({ xpBar: $("xpBar"), levelBadge: $("lvl"), soundOn: () => sound, text: (k, v) => t(k, v) });
let justDone = null; const pendingCoins = {};
// Finish something through `act` (which returns the XP gained) and play the celebration it earned.
function finish(id, from, act, { isStep = false } = {}) {
  const n = store.get(id), levelBefore = store.level().level, wasClear = districtMood(store, islandOf(id)).state === "clear";
  justDone = id; const gained = act(); const after = store.get(id);
  const c = celebrationFor({ gained, isStep, questDone: isStep && !!after?.done, levelBefore, levelAfter: store.level().level });
  fx.play(c, from, { title: n.title });
  if (c && after?.repeat && after.due) setTimeout(() => toast(t("backAgain", { d: dueText(after.due) })), 1300);
  const place = islandOf(id);
  if (c && map.walk.doors[place]) pendingCoins[place] = Math.min(40, (pendingCoins[place] || 0) + (c.levelUp ? 30 : c.kind === "quest" ? 20 : c.kind === "task" ? 9 : 4));
  if (c && !wasClear && place && districtMood(store, place).state === "clear") setTimeout(() => toast(t("districtClear", { place: title(place) })), c.levelUp ? 3400 : 900);
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
function itemHtml(n, { bag = false, where = "" } = {}) {
  const lead = n.type === "task" ? `<button class="check ${n.done ? "on" : ""} ${n.id === justDone ? "pop" : ""}" data-act="toggle" data-id="${n.id}" aria-label="${n.done ? t("doneReopen") : t("markDone")}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.500l4.500 4.500L19 7.500"/></svg></button>`
    : n.thumb ? `<img class="thumb" src="${n.thumb}" alt="" data-act="photo" data-id="${n.id}">` : svgIcon(n.type);
  const meta = [n.type !== "task" ? t("type_" + n.type) : "", n.due ? `<span style="font-weight:700;color:${isLate(n.due) ? "var(--bad)" : "var(--soon)"}">${dueText(n.due)}${n.time ? " " + n.time : ""}${n.time && n.remind === "alarm" ? " ⏰" : ""}</span>` : "", n.repeat ? `↻ ${repeatText(n.repeat)}` : "", n.effort > 1 ? t("effortN", { n: n.effort }) : "", where ? esc(where) : "", n.tags.includes("example") ? t("example") : "", n.notes && !where ? esc(n.notes) : ""].filter(Boolean).join(" · ");
  const steps = n.steps ? `<div class="steps">${n.steps.map((s, i) => `<button class="step ${s.done ? "on" : ""}" data-act="step" data-id="${n.id}" data-i="${i}"><i></i><span>${esc(s.title)}</span></button>`).join("")}</div>` : "";
  const link = n.url ? `<button class="chip" data-act="open" data-url="${esc(n.url)}">${esc(t("openLink", { u: n.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 32) }))}</button>` : "";
  const sug = bag ? `<div class="row" style="gap:6px;flex-wrap:wrap">${(n.suggest.length ? n.suggest : ["home", "paperwork", "work"]).slice(0, 3).map((p, i) => `<button class="chip ${i === 0 ? "on" : ""}" data-act="place" data-id="${n.id}" data-to="${p}">→ ${esc(title(p))}</button>`).join("")}</div>` : "";
  return `<div class="item ${n.done ? "done" : ""}">${lead}<div class="main"><button class="t" data-act="edit" data-id="${n.id}" aria-label="${esc(t("editX", { t: n.title }))}">${esc(n.title)}</button>${meta ? `<div class="meta" data-act="edit" data-id="${n.id}">${meta}</div>` : ""}${steps}${link}${sug}</div><button class="x ghost edit" data-act="edit" data-id="${n.id}" aria-label="${t("edit")}"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/></svg></button></div>`;
}
// R36 · the shop: coins buy decorations that appear in the district.
function openShop(district) {
  sheetFor = "shop:" + district; $("sheet").hidden = false; document.body.classList.add("sheet-open"); $("sheetTabs").hidden = true;
  $("sheetTitle").textContent = t("decorate", { place: title(district) }); $("sheetDot").style.background = ISL_COLOR[district]; $("sheetDot").innerHTML = pIcon(district);
  const used = decorationsFor(store, district).length, coins = store.coins();
  $("sheetSub").textContent = t("coinsSpots", { c: coins, s: SLOTS - used });
  $("sheetBody").innerHTML = (used >= SLOTS ? `<div class="empty">${t("fullyDecorated")}</div>` : "") + CATALOG.map((c) =>
    `<div class="item shopitem"><span class="sec-ic">${SHOP_ICON[c.id] || ""}</span><div class="main"><div class="t" style="cursor:default">${esc(t("item_" + c.id))}</div><div class="meta">${t("nCoins", { n: c.price })}</div></div><button class="btn ${coins >= c.price && used < SLOTS ? "primary" : ""}" data-act="buy" data-item="${c.id}" data-district="${district}" ${coins >= c.price && used < SLOTS ? "" : "disabled"} style="padding:8px 14px">${t("buy")}</button></div>`).join("")
    + `<p class="muted" style="font-size:12.5px;margin:4px 2px">${t("shopHelp")}</p>`;
}
const SHOP_ICON = {
  flowers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="3"/><path d="M12 11v9M8 16c2 0 4 1 4 4M16 16c-2 0-4 1-4 4"/></svg>',
  bench: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 11h16M4 15h16M6 15v4M18 15v4M5 7h14v4"/></svg>',
  tree: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="9" r="5"/><path d="M12 14v7"/></svg>',
  lamp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 21V9M9 5h6l-1 4h-4zM9 21h6"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 21V4M6 4h11l-2 4 2 4H6"/></svg>',
  fountain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 16h16l-2 4H6zM12 16V8M12 8c-2-3-5-3-6 0M12 8c2-3 5-3 6 0"/></svg>',
};
for (const d of store.decorations()) map.placeDecor(d.district, d.slot, d.item);

// R42 · Categories: rename any island or room; add new categories and remove them again.
function openCategories() {
  sheetFor = "categories"; $("sheet").hidden = false; $("menu").hidden = true; document.body.classList.add("sheet-open"); $("sheetTabs").hidden = true;
  $("sheetTitle").textContent = t("catTitle"); $("sheetSub").textContent = t("catSub"); $("sheetDot").style.background = "#ffc94d"; $("sheetDot").innerHTML = pIcon("custom");
  const row = (n) => `<form class="item catrow" data-cat="${n.id}"><span class="sec-ic" style="background:${ISL_COLOR[n.id] || "var(--well-2)"}">${pIcon(n.id)}</span><div class="main"><input value="${esc(title(n.id))}" aria-label="${esc(t("catRename"))}" maxlength="40"><div class="meta">${n.kind === "island" ? (map.walk.doors[n.id] ? t("catOnMap") : t("catListOnly")) + " · " : ""}${t(store.children(n.id).length === 1 ? "nThings" : "nThingsN", { n: store.children(n.id).length })}</div></div>${n.custom ? `<button type="button" class="btn danger" data-act="rmcat" data-id="${n.id}" style="padding:8px 12px">${t("catRemove")}</button>` : ""}</form>`;
  $("sheetBody").innerHTML = categories(store).map(row).join("") + `<div class="sec">${t("catRooms")}</div>` + store.children("home").filter((n) => n.type === "place").map(row).join("")
    + `<form class="addrow" id="catAddForm"><input placeholder="${esc(t("catAddPh"))}" maxlength="40"><button class="btn primary" style="padding:10px 14px">${t("catAdd")}</button></form><p class="muted" style="font-size:12px;margin:2px">${t("catBuiltin")}</p>`;
}
const reopenCity = async () => { await saved.flush(); location.reload(); }; // a new category on the map needs the city built again
$("sheetBody").addEventListener("change", (e) => {
  const f = e.target.closest("form.catrow"); if (!f) return;
  const r = renameCategory(store, f.dataset.cat, e.target.value);
  if (!r.ok) { toast(t(r.error === "taken" ? "catTaken" : "catNeedsName")); e.target.value = title(f.dataset.cat); } else toast(t("catRenamed"));
});
$("sheetBody").addEventListener("submit", (e) => {
  if (e.target.id !== "catAddForm" && !e.target.classList.contains("catrow")) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.target.classList.contains("catrow")) { e.target.querySelector("input").blur(); return; }
  const inp = e.target.querySelector("input"), r = addCategory(store, inp.value);
  if (!r.ok) { toast(t(r.error === "taken" ? "catTaken" : "catNeedsName")); return; }
  toast(t("catAdded", { name: store.get(r.id).title }));
  if (!firstCustom) setTimeout(reopenCity, 900); else openCategories();
}, true);

// R34 · Today: overdue, today and this week in one list.
function openToday() {
  sheetFor = "today"; $("sheet").hidden = false; $("menu").hidden = true; document.body.classList.add("sheet-open");
  const L = todayList(store), n = L.overdue.length + L.today.length + L.week.length;
  $("sheetTitle").textContent = t("today"); $("sheetDot").style.background = "#ffc94d";
  $("sheetDot").innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16v14H4zM4 10h16M9 3v4M15 3v4"/></svg>`;
  $("sheetSub").textContent = n ? [L.overdue.length ? t("nOverdue", { n: L.overdue.length }) : "", L.today.length ? t("nToday", { n: L.today.length }) : "", L.week.length ? t("nThisWeek", { n: L.week.length }) : ""].filter(Boolean).join(" · ") : t("nothingDue");
  $("sheetTabs").hidden = true;
  const sec = (label, list, cls) => list.length ? `<div class="sec ${cls}">${label}</div>` + list.map((x) => { const node = store.get(x.id); return itemHtml(node, { where: x.path.map(title).join(t("sep")) }); }).join("") : "";
  $("sheetBody").innerHTML = (L.empty ? `<div class="empty">${t("nothingDueEvening")}</div>` : sec(t("overdue"), L.overdue, "late") + sec(t("today"), L.today, "") + sec(t("thisWeek"), L.week, ""))
    + (!bridge.canBackup && store.all().filter((x) => !x.system).length > 3 && exportReminderDue(lsGet("life-backup-last")) ? `<button class="item bagline" data-act="backup"><span class="sec-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M8 11l4 4 4-4M5 19h14"/></svg></span><div class="main"><div class="t">${t("backupLine")}</div><div class="meta">${lsGet("life-backup-last") ? t("lastBackup", { d: lsGet("life-backup-last") }) : t("noBackup")} ${t("tapToSave")}</div></div></button>` : "")
    + (L.bag ? `<button class="item bagline" data-act="openbag"><span class="sec-ic">${pIcon("bag")}</span><div class="main"><div class="t">${t(L.bag === 1 ? "bagWaiting" : "bagWaitingN", { n: L.bag })}</div><div class="meta">${L.bagDays > 3 ? `<span style="color:var(--bad);font-weight:700">${t("bagOldest", { n: L.bagDays })}</span> ` : ""}${t(L.bag === 1 ? "tapToFileIt" : "tapToFileThem")}</div></div></button>` : "");
}
// R43 · Goals Board: what will be true, and by when. One card per goal: drawing, countdown, one first step.
const FLAG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4M5 4h12l-2.500 4L17 12H5"/></svg>`;
const leftText = (n) => {
  const L = timeLeft(n);
  const when = `${dueText(n.due)}${n.goal?.time ? " " + n.goal.time : ""}`;
  if (L.late) return { cls: "late", text: `${when} · ${t("goalLate", { t: L.days ? `${L.days}d` : `${L.hours}h` })}` };
  return { cls: L.days < 1 ? "soon" : "", text: `${when} · ${L.days ? t("leftDH", { d: L.days, h: L.hours }) : t("leftHM", { h: L.hours, m: L.minutes })}` };
};
function goalCard(n) {
  const st = n.goal.step, left = leftText(n);
  const step = st ? `<div class="gstep"><div class="gmain"><small>${t("firstStep")}</small><span dir="auto">${esc(st.title)}</span>${st.at ? ` <em>· ${esc(st.at)}</em>` : ""}</div>${n.goal.started ? `<span class="gstarted">✓ ${t("startedOn")}</span>` : `<button class="gb1" data-act="gstart" data-id="${n.id}">${t("started")}</button>`}<button class="gb2" data-act="gdone" data-id="${n.id}">${t("goalDone")}</button></div>`
    : `<form class="gstep gstepform" data-goal="${n.id}"><div class="gmain"><small>${t("firstStep")}</small><input name="t" dir="auto" placeholder="${esc(t("firstStepPh"))}" maxlength="120"></div><input name="at" type="time" aria-label="${esc(t("stepAt"))}"><button class="gb1">${t("setStep")}</button></form>`;
  const stuck = stuckReason(n), pv = progressView(n);
  const banner = stuck ? `<button class="gstuck" data-act="gstuck" data-id="${n.id}">${esc(st ? t("stuckBanner", { s: st.title }) : t("stuckBannerNoStep"))}</button>` : "";
  const more = `<div class="gmore"><button class="chip" data-act="gopen" data-id="${n.id}">${t("planBack")}${n.goal.path.length ? ` · ${n.goal.path.length}` : ""}</button>${pv ? `<span class="gprog">${progText(pv)}</span>` : ""}</div>`;
  return `<div class="gcard" data-goal="${n.id}"><div class="gtop"><div class="gimg">${goalArt(n.goal.object, n.goal.scene)}</div><div><b dir="auto">${esc(n.title)}</b><span class="gdue ${left.cls}">${left.text}</span></div></div>${banner}${step}${more}</div>`;
}
const progText = (pv) => pv.kind === "done" ? t("progDone", { n: pv.done, t: pv.total }) : t("progLeft", { n: pv.left });
// R44 · one goal: the path drawn from the finish (top) back to "you are here" (bottom), the backward
// question, one obstacle with an if–then plan. R45 · the stuck questions open here too.
let stuckFor = null, stuckPick = null;
function openGoal(id, { stuck = false } = {}) {
  const n = store.get(id); if (!n?.goal || n.goal.released) return openGoals();
  if (stuck && stuckFor !== id) { stuckFor = id; stuckPick = null; }
  sheetFor = "goal:" + id; $("sheet").hidden = false; $("menu").hidden = true; document.body.classList.add("sheet-open");
  const g = n.goal, left = leftText(n), pv = progressView(n);
  $("sheetTitle").textContent = n.title; $("sheetTitle").dir = "auto"; $("sheetDot").style.background = "#ffc94d"; $("sheetDot").innerHTML = FLAG;
  $("sheetSub").textContent = left.text + (pv ? " · " + progText(pv) : ""); $("sheetTabs").hidden = true;
  const st = g.step, earliest = g.path[0]?.title || n.title;
  const station = (x, i) => `<div class="gst ${x.done ? "done" : ""}"><div class="gsimg">${goalArt(x.object, x.scene)}</div><div class="gstx"><b dir="auto">${esc(x.title)}</b><input type="date" data-sdate="${i}" value="${esc(x.due || "")}" max="${esc(n.due)}" aria-label="${esc(t("stationDate"))}"></div>`
    + (x.done ? `<span class="gstarted">✓</span>` : `<button class="gtick" data-act="gst" data-i="${i}" aria-label="${esc(t("markDone"))}">✓</button>`) + `<button class="grm" data-act="grm" data-i="${i}" aria-label="${esc(t("removeStep"))}">×</button></div>`;
  const now = `<div class="gst now"><span class="gpin">${t("youAreHere")}</span><div class="gstx">${st ? `<small>${t("firstStep")}</small><b dir="auto">${esc(st.title)}</b>${st.at ? `<em> · ${esc(st.at)}</em>` : ""}` : `<small>${t("firstStep")}</small><em>—</em>`}</div>`
    + (st && !g.started ? `<button class="gb1" data-act="gstart" data-id="${id}">${t("started")}</button>` : st ? `<span class="gstarted">✓ ${t("startedOn")}</span>` : "") + `</div>`;
  let stuckHtml = "";
  if (stuckFor === id) {
    const need = stuckPick && ["missing", "time", "someone"].includes(stuckPick);
    stuckHtml = `<div class="gstuckbox"><div class="q">${t("stuckQ")}</div><div class="gchips">${STUCK_ANSWERS.map((a) => `<button class="chip ${stuckPick === a ? "on" : ""}" data-act="gans" data-a="${a}">${t("ans_" + a)}</button>`).join("")}</div>`
      + (need ? `<form class="addrow" id="gansForm" data-a="${stuckPick}"><input name="v" dir="auto" ${stuckPick === "time" ? 'type="time"' : ""} placeholder="${esc(t(stuckPick === "missing" ? "needWhat" : "whoAsk"))}" aria-label="${esc(t(stuckPick === "time" ? "newTime" : stuckPick === "missing" ? "needWhat" : "whoAsk"))}"><button class="btn primary" style="padding:10px 14px">${t("setStep")}</button></form>` : "")
      + `<div class="q">${t("stakesQ")}</div><div class="gchips">${STAKES.map((k) => `<button class="chip ${g.stakes === k ? "on" : ""}" data-act="gstake" data-k="${k}">${t("stakes_" + k)}</button>`).join("")}</div>`
      + `<button class="chip ghost" data-act="gnotnow">${t("notNow")}</button></div>`;
  }
  $("sheetBody").innerHTML = `<div class="gnav"><button class="chip" data-act="gback">‹ ${t("backToBoard")}</button>${stuckFor === id ? "" : `<button class="chip" data-act="gstuck" data-id="${id}">${t("imStuck")}</button>`}</div>` + stuckHtml
    + `<div class="gpath"><div class="gst goal"><div class="gsimg big">${goalArt(g.object, g.scene)}</div><div class="gstx"><b dir="auto">${esc(n.title)}</b><span class="gdue ${left.cls}">${left.text}</span></div><span class="gflag">${FLAG}</span></div>`
    + g.path.map((x, i) => ({ x, i })).reverse().map(({ x, i }) => station(x, i)).join("") + now + `</div>`
    + `<form class="gplan" id="gPlanForm"><label dir="auto">${esc(t("justBefore", { x: earliest }))}</label><div class="addrow"><input name="v" dir="auto" maxlength="120" placeholder="${esc(t("justBeforePh"))}"><button class="btn primary" style="padding:10px 14px" name="add">${t("addBefore")}</button></div><button class="chip" name="now" value="1">${t("canDoNow")}</button></form>`
    + `<form class="gplan" id="gObstForm"><label>${t("obstacleT")}</label><input name="a" dir="auto" maxlength="120" placeholder="${esc(t("obstacleIf"))}" value="${esc(g.obstacle?.if || "")}"><input name="b" dir="auto" maxlength="120" placeholder="${esc(t("obstacleThen"))}" value="${esc(g.obstacle?.then || "")}"><button class="chip">${t("saveIfThen")}</button></form>`;
  if (stuckFor === id && g.asked !== isoDate(new Date())) store.markAsked(id);
}
// ---------- R52 · my week & memory ----------
const DAYS = [0, 1, 2, 3, 4, 5, 6];
const dayChips = (on, name) => `<span class="pfdays" data-name="${name}">${DAYS.map((d) => `<button type="button" class="chip ${on.includes(d) ? "on" : ""}" data-act="pfday" data-d="${d}">${t("day" + d)}</button>`).join("")}</span>`;
const daysText = (ds) => ds.map((d) => t("day" + d)).join(" ");
const pickedDays = (el) => [...el.querySelectorAll('[data-act="pfday"].on')].map((b) => +b.dataset.d);
const whenSet = (e) => e.source === "default" ? t("pf_default") : t(e.source === "learned" ? "pf_learned" : "pf_byMe", { d: new Date(e.at).toLocaleDateString(lang === "he" ? "he-IL" : undefined) });
function openProfile() {
  sheetFor = "profile"; $("sheet").hidden = false; $("menu").hidden = true; document.body.classList.add("sheet-open");
  $("sheetTitle").textContent = t("pf_title"); $("sheetSub").textContent = t("pf_sub"); $("sheetDot").style.background = "#6aa9ff"; $("sheetDot").innerHTML = pIcon("custom"); $("sheetTabs").hidden = true;
  const P = store.profile(), ww = store.profileEntry("workWeek"), er = store.profileEntry("errands");
  const list = (key, label) => { const e = store.profileEntry(key), v = P[key];
    return `<div class="sec">${t(label)}</div><div class="pfbox">${v.length ? v.map((r, i) => `<div class="pfrow"><b>${esc(daysText(r.days))}</b><span>${r.from}–${r.to}</span>${r.label ? `<em>${esc(r.label)}</em>` : ""}<button class="grm" data-act="pfrm" data-k="${key}" data-i="${i}" aria-label="×">×</button></div>`).join("") : `<div class="muted pfnone">${t("pf_none")}</div>`}`
      + `<form class="pfadd" data-k="${key}">${dayChips([], key)}<span class="pftimes"><input type="time" name="from" required aria-label="${esc(t("pf_from"))}"><span>–</span><input type="time" name="to" required aria-label="${esc(t("pf_to"))}"><button class="chip">${t("pf_add")}</button></span></form>${v.length ? `<small class="pfmeta">${whenSet(e)}</small>` : ""}</div>`; };
  const sugg = store.suggestions();
  $("sheetBody").innerHTML = `<div class="sec">${t("pf_work")}</div><form class="pfbox" id="pfWork">${dayChips(P.workWeek.days, "work")}<span class="pftimes"><input type="time" name="from" value="${P.workWeek.from}" aria-label="${esc(t("pf_from"))}"><span>–</span><input type="time" name="to" value="${P.workWeek.to}" aria-label="${esc(t("pf_to"))}"><button class="chip">${t("saveIfThen")}</button></span><small class="pfmeta">${whenSet(ww)}</small></form>`
    + list("restTimes", "pf_rest") + list("focusTimes", "pf_focus") + list("lowTimes", "pf_low")
    + `<div class="sec">${t("pf_errands")}</div><div class="pfbox pferr"><label><input type="checkbox" data-pf="friday" ${P.errands.friday ? "checked" : ""}> ${t("pf_friday")}</label><label><input type="checkbox" data-pf="saturday" ${P.errands.saturday ? "checked" : ""}> ${t("pf_saturday")}</label><small class="pfmeta">${whenSet(er)}</small></div>`
    + `<div class="sec">${t("pf_suggest")}</div>` + (sugg.length ? sugg.map((x) => `<div class="pfbox"><b>${esc(x.reason)}</b><div class="row"><button class="chip on" data-act="pfok" data-id="${x.id}">${t("pf_accept")}</button><button class="chip" data-act="pfno" data-id="${x.id}">${t("pf_reject")}</button></div></div>`).join("") : `<p class="muted" style="font-size:12.5px;margin:4px 2px">${t("pf_noSuggest")}</p>`);
}
$("sheetBody").addEventListener("submit", (e) => {
  const f = e.target; if (sheetFor !== "profile") return;
  e.preventDefault(); e.stopImmediatePropagation();
  const from = f.elements.from.value, to = f.elements.to.value, days = pickedDays(f);
  let r;
  if (f.id === "pfWork") r = store.setProfile("workWeek", { days, from, to });
  else { const k = f.dataset.k; r = store.setProfile(k, [...store.profile()[k], { days, from, to }]); }
  toast(t(r.ok ? "pf_saved" : "pf_bad"));
}, true);
$("sheetBody").addEventListener("click", (e) => {
  if (sheetFor !== "profile") return;
  const b = e.target.closest("[data-act]"); if (!b) return;
  if (b.dataset.act === "pfday") { e.preventDefault(); b.classList.toggle("on"); return; }
  e.stopImmediatePropagation();
  if (b.dataset.act === "pfrm") { const k = b.dataset.k, v = store.profile()[k]; v.splice(+b.dataset.i, 1); store.setProfile(k, v); }
  if (b.dataset.act === "pfok") store.acceptSuggestion(b.dataset.id);
  if (b.dataset.act === "pfno") { store.rejectSuggestion(b.dataset.id); openProfile(); }
}, true);
$("sheetBody").addEventListener("change", (e) => {
  const k = e.target.dataset?.pf; if (sheetFor !== "profile" || !k) return;
  e.stopImmediatePropagation(); const v = { ...store.profile().errands, [k]: e.target.checked }; store.setProfile("errands", v); toast(t("pf_saved"));
}, true);

// ---------- R51 · the activity log: every action with its time tag, and the raw inputs ----------
const stampText = (iso) => { const d = new Date(iso); return d.toLocaleString(lang === "he" ? "he-IL" : "en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }); };
function openJournal(tab = "actions") {
  sheetFor = "journal:" + tab; $("sheet").hidden = false; $("menu").hidden = true; document.body.classList.add("sheet-open");
  const J = store.journal(), I = store.inputs(), N = 200;
  $("sheetTitle").textContent = t("jr_title"); $("sheetDot").style.background = "#b9a6ff"; $("sheetDot").innerHTML = pIcon("custom");
  $("sheetSub").textContent = t("jr_sub", { n: J.length, i: I.length, d: store.device() });
  const tabs = $("sheetTabs"); tabs.hidden = false;
  tabs.innerHTML = `<button class="chip ${tab === "actions" ? "on" : ""}" data-jtab="actions">${t("jr_actions")} · ${J.length}</button><button class="chip ${tab === "inputs" ? "on" : ""}" data-jtab="inputs">${t("jr_inputs")} · ${I.length}</button>`;
  const PF = { workWeek: "pf_work", restTimes: "pf_rest", focusTimes: "pf_focus", lowTimes: "pf_low", errands: "pf_errands" };
  const nameOf = (e) => e.key ? (PF[e.key] ? t(PF[e.key]) : e.key) : e.after?.title || store.get(e.id)?.title || "";
  const rows = tab === "inputs"
    ? I.slice(-N).reverse().map((x) => `<div class="jrow"><time>${stampText(x.at)}</time><span class="jop">${esc(x.kind)}</span><span class="jt" dir="auto">${esc(x.text)}</span><span class="jby">${t("by_" + x.by) || esc(x.by)} · ${esc(x.device)}</span></div>`)
    : J.slice(-N).reverse().map((x) => `<div class="jrow ${x.op}"><time>${stampText(x.at)}</time><span class="jop">${t("op_" + x.op)}</span><span class="jt" dir="auto">${esc(store.get(x.id)?.type === "place" ? title(x.id) : nameOf(x))}${x.op === "update" || x.op === "state" ? ` <em>${esc((x.fields || []).join(", "))}</em>` : ""}</span><span class="jby">${t("by_" + x.by) || esc(x.by)} · ${esc(x.device)}</span></div>`);
  $("sheetBody").innerHTML = rows.length ? rows.join("") + ((tab === "inputs" ? I : J).length > N ? `<p class="muted" style="font-size:12px">${t("jr_more", { n: N })}</p>` : "") : `<div class="empty">${t("jr_empty")}</div>`;
}
$("sheetTabs").addEventListener("click", (e) => { const b = e.target.closest("[data-jtab]"); if (b) { e.stopImmediatePropagation(); openJournal(b.dataset.jtab); } }, true);

// ---------- R53 · R54 · sync & devices ----------
// A device that joins an existing vault drops its own example items first, so they don't pile on
// top of the examples (or the real life) already in the vault.
const dropExamples = () => { store.as("app"); try { for (const n of store.all().filter((x) => x.tags.includes("example"))) store.remove(n.id); } finally { store.as("me"); } };
let dvView = null, shownCode = null, dvRequests = [], dvBusy = false;
const syncFlag = () => lsGet("life-sync"); // null | "on" | "pending" | "revoked"
const devName = () => (bridge.android ? "Phone" : /Mac/.test(navigator.platform) ? "Mac" : /Win/.test(navigator.platform) ? "Windows computer" : "Computer");
const devKind = () => (bridge.android ? "phone" : "web");
const whenText = (iso) => (iso ? new Date(iso).toLocaleString(lang === "he" ? "he-IL" : "en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
function dvShell(sub) {
  sheetFor = "devices"; $("sheet").hidden = false; $("menu").hidden = true; document.body.classList.add("sheet-open");
  $("sheetTitle").textContent = t("dv_title"); $("sheetSub").textContent = sub; $("sheetDot").style.background = "#3ee88a"; $("sheetTabs").hidden = true;
  $("sheetDot").innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="11" height="8" rx="1.5"/><rect x="15" y="8" width="6" height="12" rx="1.5"/><path d="M6 16h6M9 12v4"/></svg>`;
}
const recoverForm = () => `<details class="dvlost"><summary>${t("dv_lost")}</summary><form class="addrow" id="dvRecover"><input name="c" autocomplete="off" spellcheck="false" placeholder="${esc(t("dv_recoverPh"))}"><button class="btn primary" style="padding:10px 14px">${t("dv_recover")}</button></form></details>`;
async function openDevices() {
  if (shownCode) {
    dvShell(t("dv_onOk"));
    $("sheetBody").innerHTML = `<div class="dvcard"><b>${t("dv_firstTitle")}</b><p>${t("dv_firstSub")}</p><div class="dvcode" dir="ltr">${esc(shownCode)}</div><div class="row" style="flex-wrap:wrap"><button class="chip" data-act="dvcopy">${t("dv_copy")}</button><button class="chip" data-act="dvsave">${t("dv_saveFile")}</button></div><button class="btn primary" data-act="dvwrote">${t("dv_wrote")}</button></div>`;
    return;
  }
  const flag = syncFlag();
  if (!flag && dvView !== "join") {
    dvShell(t("dv_offSub"));
    $("sheetBody").innerHTML = `<div class="dvcard"><p>${t("dv_intro")}</p><button class="btn primary" data-act="dvon">${t("dv_turnOn")}</button></div>` + recoverForm();
    return;
  }
  dvShell(t("dv_starting")); $("sheetBody").innerHTML = `<div class="empty">${t("dv_starting")}</div>`;
  let st;
  try { st = await sync.start(); } catch (e) { $("sheetBody").innerHTML = `<div class="empty">${t("dv_noNet")}</div>`; return; }
  if (sheetFor !== "devices") return;
  if (st === "on" && flag !== "on") lsSet("life-sync", "on");
  if (st === "revoked") { lsSet("life-sync", "revoked"); dvShell(t("dv_revoked")); $("sheetBody").innerHTML = `<div class="dvcard"><p>${t("dv_revokedSub")}</p><button class="btn primary" data-act="dvjoin">${t("dv_join")}</button></div>`; return; }
  if (st === "join") { dvShell(t("dv_joinTitle")); $("sheetBody").innerHTML = `<div class="dvcard"><b>${t("dv_joinTitle")}</b><p>${t("dv_joinSub")}</p><button class="btn primary" data-act="dvjoin">${t("dv_join")}</button></div>` + recoverForm(); return; }
  if (st === "pending") { const code = await sync.myCode(); dvShell(t("dv_waitTitle")); $("sheetBody").innerHTML = `<div class="dvcard"><b>${t("dv_waitTitle")}</b><p>${t("dv_waitSub")}</p><div class="dvcode" dir="ltr">${code}</div></div>` + recoverForm(); return; }
  if (st === "off") { lsSet("life-sync", ""); dvView = null; return openDevices(); }
  const [list, reqs] = await Promise.all([sync.devices(), sync.pending()]); dvRequests = reqs;
  const meId = (await keyStore.get("session"))?.uid;
  const DVI = { phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>', web: '<rect x="3" y="5" width="18" height="11" rx="1.5"/><path d="M8 20h8M12 16v4"/>', agent: '<path d="M12 3l2.200 6.800L21 12l-6.800 2.200L12 21l-2.200-6.800L3 12l6.800-2.200z"/>' };
  dvShell(t("dv_onSub", { n: list.filter((d) => !d.revoked_at).length }));
  const pend = store.syncPending(), at = lsGet("life-sync-at");
  $("sheetBody").innerHTML = `<div class="dvcard dvrow"><div><b>${at ? t("dv_synced", { t: whenText(at) }) : t("dv_never")}</b>${pend ? `<small>${t("dv_pending", { n: pend })}</small>` : ""}</div><button class="btn primary" data-act="dvsync">${t("dv_syncNow")}</button></div>`
    + (reqs.length ? `<div class="sec">${t("dv_requests")}</div>` + reqs.map((r) => `<div class="dvcard"><b>${esc(r.name)} <small>${esc(r.kind)}</small></b><div class="dvcode small" dir="ltr">${r.check}</div><p>${t("dv_checkCode", { c: r.check })}</p><div class="row" style="flex-wrap:wrap"><button class="btn primary" data-act="dvok" data-id="${r.id}">${r.kind === "agent" ? t("dv_approveAgent") : t("dv_approve")}</button><button class="chip" data-act="dvno" data-id="${r.id}">${t("dv_reject")}</button></div></div>`).join("") : "")
    + `<div class="sec">${t("dv_title")}</div>` + list.map((d) => `<div class="dvdev ${d.revoked_at ? "off" : ""}"><span class="dvic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">${DVI[d.kind] || DVI.web}</svg></span><div><b>${esc(d.name)}${d.id === meId ? ` · ${t("dv_thisDevice")}` : ""}</b><small>${t("dv_role_" + d.role)}${d.revoked_at ? " · " + t("dv_revoked") : ""}${d.expires_at && !d.revoked_at ? " · " + t("dv_expires", { d: whenText(d.expires_at) }) : ""}</small></div>${d.id !== meId && !d.revoked_at ? `<button class="chip" data-act="dvrevoke" data-id="${d.id}" data-name="${esc(d.name)}">${t("dv_revoke")}</button>` : ""}</div>`).join("");
}
async function doSync(manual = false) {
  try {
    const r = await sync.syncNow();
    if (r.state === "on") lsSet("life-sync-at", new Date().toISOString());
    if (r.state === "revoked") lsSet("life-sync", "revoked");
    if (manual) toast(t("dv_synced", { t: whenText(new Date().toISOString()) }));
    return r;
  } catch (e) { if (manual) toast(t("dv_noNet")); return null; }
}
$("sheetBody").addEventListener("click", async (e) => {
  if (sheetFor !== "devices") return;
  const b = e.target.closest("[data-act]"); if (!b) return;
  e.stopImmediatePropagation(); if (dvBusy) return; dvBusy = true;
  try {
    const a = b.dataset.act;
    if (a === "dvon") {
      toast(t("dv_starting"));
      const st = await sync.start();
      if (st === "off") { const { recoveryCode } = await sync.enable({ name: devName(), kind: devKind() }); lsSet("life-sync", "on"); lsSet("life-sync-at", new Date().toISOString()); shownCode = recoveryCode; }
      else if (st === "on") lsSet("life-sync", "on");
      else dvView = "join";
    }
    if (a === "dvjoin") { dropExamples(); await sync.requestJoin({ name: devName(), kind: devKind() }); lsSet("life-sync", "pending"); }
    if (a === "dvcopy") { try { await navigator.clipboard.writeText(shownCode); toast(t("dv_copied")); } catch (err) { /* no clipboard */ } dvBusy = false; return; }
    if (a === "dvsave") { bridge.saveFile("life-archipelago-recovery-code.txt", "text/plain", `Life Archipelago recovery code\n${shownCode}\n\nKeep it on paper or in a password manager.\n`); dvBusy = false; return; }
    if (a === "dvwrote") shownCode = null;
    if (a === "dvsync") await doSync(true);
    if (a === "dvok") { const r = dvRequests.find((x) => x.id === b.dataset.id); await sync.approve(r, { agent: r.kind === "agent", hours: 24 }); toast(t("dv_approved", { name: r.name })); }
    if (a === "dvno") { const r = dvRequests.find((x) => x.id === b.dataset.id); await sync.reject(r); toast(t("dv_rejected")); }
    if (a === "dvrevoke") { await sync.revoke(b.dataset.id); toast(t("dv_revokedOk", { name: b.dataset.name })); }
  } catch (err) { toast(err.message === "permission denied" ? t("dv_noNet") : err.message || t("dv_noNet")); }
  dvBusy = false; openDevices();
}, true);
$("sheetBody").addEventListener("submit", async (e) => {
  if (sheetFor !== "devices" || e.target.id !== "dvRecover") return;
  e.preventDefault(); e.stopImmediatePropagation();
  try { dropExamples(); await sync.recover({ code: e.target.elements.c.value, name: devName(), kind: devKind() }); lsSet("life-sync", "on"); lsSet("life-sync-at", new Date().toISOString()); toast(t("dv_onOk")); }
  catch (err) { toast(t("dv_badCode")); }
  openDevices();
}, true);

function openGoals() {
  sheetFor = "goals"; $("sheet").hidden = false; $("menu").hidden = true; document.body.classList.add("sheet-open");
  const B = goalBoard(store);
  $("sheetTitle").textContent = t("goals"); $("sheetDot").style.background = "#ffc94d"; $("sheetDot").innerHTML = FLAG;
  $("sheetSub").textContent = B.open.length ? t("goalsOpen", { n: B.open.length }) : t("goalsSub");
  $("sheetTabs").hidden = true;
  $("sheetBody").innerHTML = `<form class="addrow" id="goalForm"><input placeholder="${esc(t("goalPh"))}" maxlength="200" aria-label="${esc(t("goalsSub"))}"><button class="btn primary" style="padding:10px 14px">${t("goalAdd")}</button></form>`
    + (B.open.length ? B.open.map(goalCard).join("") : `<div class="empty">${t("goalEmpty")}</div>`)
    + (B.open.length && B.suggestMore ? `<div class="gslot">+ ${t("roomForOne")}</div>` : "")
    + (B.done.length ? `<div class="sec">${t("achievedWeek")}</div><div class="gwon">${B.done.map((n) => `<span class="gth" title="${esc(n.title)}">${goalArt(n.goal?.object, n.goal?.scene)}</span>`).join("")}</div>` : "");
}
$("sheetBody").addEventListener("submit", (e) => {
  const f = e.target;
  if (f.id === "goalForm") {
    e.preventDefault(); e.stopImmediatePropagation();
    const inp = f.querySelector("input"), r = store.addGoal(inp.value);
    if (!r.ok) { toast(t(r.error === "when" ? "goalNeedsWhen" : "goalNeedsWhat")); return; }
    toast(t("goalAdded")); setTimeout(() => document.querySelector(`.gstepform[data-goal="${r.id}"] input`)?.focus(), 50);
  } else if (f.id === "gPlanForm") {
    e.preventDefault(); e.stopImmediatePropagation();
    const v = f.elements.v.value.trim(), id = sheetFor.slice(5); if (!v) { f.elements.v.focus(); return; }
    if (e.submitter?.name === "now") { store.nowStep(id, v); toast(t("stepAdded")); } else store.planBefore(id, v);
    setTimeout(() => $("gPlanForm")?.elements.v.focus(), 30);
  } else if (f.id === "gObstForm") {
    e.preventDefault(); e.stopImmediatePropagation();
    store.setObstacle(sheetFor.slice(5), f.elements.a.value, f.elements.b.value); toast(t("ifThenSaved"));
  } else if (f.id === "gansForm") {
    e.preventDefault(); e.stopImmediatePropagation();
    const id = sheetFor.slice(5), a = f.dataset.a, raw = f.elements.v.value.trim(); if (!raw) return;
    const r = store.answerStuck(id, a, a === "someone" ? t("askWho", { who: raw }) : raw);
    stuckFor = null; stuckPick = null; toast(r.action === "reschedule" ? t("rescheduled", { t: raw }) : t("stepAdded")); openGoal(id);
  } else if (f.classList.contains("gstepform")) {
    e.preventDefault(); e.stopImmediatePropagation();
    const v = f.elements.t.value.trim(); if (!v) { f.elements.t.focus(); return; }
    store.setGoalStep(f.dataset.goal, v, f.elements.at.value || null);
  }
}, true);
$("sheetBody").addEventListener("click", (e) => {
  const b = e.target.closest("[data-act=gstart],[data-act=gdone],[data-act=gopen],[data-act=gstuck],[data-act=gback],[data-act=gans],[data-act=gstake],[data-act=gnotnow],[data-act=gst],[data-act=grm]"); if (!b) return;
  e.stopImmediatePropagation();
  const gid = b.dataset.id || String(sheetFor).slice(5), act = b.dataset.act;
  if (act === "gopen") return openGoal(gid);
  if (act === "gstuck") return openGoal(gid, { stuck: true });
  if (act === "gback") { stuckFor = null; return openGoals(); }
  if (act === "gnotnow") { store.markAsked(gid); stuckFor = null; return openGoal(gid); }
  if (act === "gstake") { store.setStakes(gid, b.dataset.k); return; }
  if (act === "gst") return finish(gid, b.getBoundingClientRect(), () => store.completeStation(gid, +b.dataset.i), { isStep: true });
  if (act === "grm") return store.removeStation(gid, +b.dataset.i);
  if (act === "gans") {
    const a = b.dataset.a;
    if (["missing", "time", "someone"].includes(a)) { stuckPick = a; openGoal(gid); setTimeout(() => $("gansForm")?.elements.v.focus(), 30); return; }
    const r = store.answerStuck(gid, a); stuckFor = null; stuckPick = null;
    if (r.action === "release") { toast(t("released")); return openGoals(); }
    toast(t("madeSmaller")); return openGoal(gid);
  }
  if (act === "gstart") store.startGoal(b.dataset.id);
  else { const from = b.closest(".gcard").getBoundingClientRect(); finish(b.dataset.id, from, () => store.complete(b.dataset.id)); toast(t("goalCame")); }
}, true);
$("goalsBtn").addEventListener("click", () => openGoals());
$("sheetBody").addEventListener("change", (e) => { const i = e.target.dataset?.sdate; if (i === undefined || !String(sheetFor).startsWith("goal:")) return; e.stopImmediatePropagation(); store.setStationDue(sheetFor.slice(5), +i, e.target.value || null); }, true);

function openSheet(id) {
  if (id === "today") return openToday();
  if (id === "goals") return openGoals();
  if (id === "profile") return openProfile();
  if (id === "devices") return openDevices();
  if (String(id).startsWith("journal:")) return openJournal(id.slice(8));
  if (String(id).startsWith("goal:")) return openGoal(id.slice(5));
  if (id === "categories") return openCategories();
  if (String(id).startsWith("shop:")) return openShop(id.slice(5));
  sheetFor = id; $("sheet").hidden = false; $("menu").hidden = true;
  const isBag = id === "bag";
  $("sheetTitle").textContent = isBag ? t("yourBag") : title(id);
  $("sheetDot").style.background = isBag ? "#ffc94d" : ISL_COLOR[islandOf(id)] || "#ffc94d"; $("sheetDot").innerHTML = pIcon(isBag ? "bag" : id);
  document.body.classList.add("sheet-open");
  const tabs = $("sheetTabs"); tabs.hidden = view !== "home" || isBag;
  if (!tabs.hidden) tabs.innerHTML = ROOMS.map((r) => `<button class="chip ${r === id ? "on" : ""}" data-room="${r}">${esc(title(r))} · ${store.children(r).length}</button>`).join("") + `<button class="chip ${id === "home" ? "on" : ""}" data-room="home">${t("wholeHome")}</button>`;
  const list = (id === "home" ? store.children("home").filter((n) => n.type !== "place") : store.children(id)).filter((n) => n.type !== "place");
  list.sort((a, b) => (a.done - b.done) || ((a.type === "task") === (b.type === "task") ? 0 : a.type === "task" ? -1 : 1) || (a.due || "9999").localeCompare(b.due || "9999"));
  const md = districtMood(store, id), things = list.filter((n) => n.type !== "task").length, nThings = (k) => t(k === 1 ? "nThings" : "nThingsN", { n: k });
  $("sheetSub").textContent = isBag ? (list.length ? t("bagSub", { n: list.length }) : t("nothingWaiting"))
    : [md.open ? t("nOpen", { n: md.open }) : t("allClearCap"), md.overdue ? t("nOverdue", { n: md.overdue }) : md.soon ? t("nDueSoon", { n: md.soon }) : "", things ? nThings(things) : ""].filter(Boolean).join(" · ");
  const shopFor = map.walk.doors[id] ? id : null;
  const empty = isBag ? t("bagEmpty") : t("placeEmpty");
  $("sheetBody").innerHTML = (list.length ? list.map((n) => itemHtml(n, { bag: isBag })).join("") : `<div class="empty">${empty}</div>`) +
    (shopFor ? `<button class="chip decorate" data-act="shop" data-district="${shopFor}">${esc(t("decorateChip", { place: title(shopFor), n: store.coins() }))}</button>` : "") +
    (isBag ? "" : `<form class="addrow" data-to="${id}"><input placeholder="${esc(t("addTo", { place: title(id) }))}"><button class="btn primary" style="padding:10px 14px">${t("add")}</button></form>`);
}
const refreshSheet = () => { if (sheetFor && !$("sheet").hidden) openSheet(sheetFor); };
function closeSheet() { $("sheet").hidden = true; sheetFor = null; document.body.classList.remove("sheet-open"); releaseCoins(); }
$("sheetClose").addEventListener("click", closeSheet);
$("sheetTabs").addEventListener("click", (e) => { const b = e.target.closest("[data-room]"); if (b) { if (b.dataset.room === "home") openSheet("home"); else selectRoom(b.dataset.room); } });
$("sheetBody").addEventListener("submit", (e) => {
  e.preventDefault(); const f = e.target.closest("form"); const inp = f.querySelector("input"); const v = inp.value.trim(); if (!v) return;
  const id = store.capture(v); store.place(id, f.dataset.to); inp.value = ""; toast(t("addedTo", { place: title(f.dataset.to) }));
});
$("sheetBody").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const id = b.dataset.id, n = id ? store.get(id) : null;
  const from = b.getBoundingClientRect();
  if (b.dataset.act === "toggle") { if (n.done) store.reopen(id); else finish(id, from, () => store.complete(id)); }
  if (b.dataset.act === "step") finish(id, from, () => store.completeStep(id, +b.dataset.i), { isStep: true });
  if (b.dataset.act === "place") { store.place(id, b.dataset.to); toast(t("placedIn", { place: title(b.dataset.to) })); }
  if (b.dataset.act === "open") bridge.openExternal(b.dataset.url);
  if (b.dataset.act === "photo") { const src = await media.getImage(n.images[0]); if (src) showPhoto(src); }
  if (b.dataset.act === "edit") openEditor(id);
  if (b.dataset.act === "openbag") openSheet("bag");
  if (b.dataset.act === "shop") openShop(b.dataset.district);
  if (b.dataset.act === "rmcat") { const name = store.get(b.dataset.id)?.title, wasOnMap = !!map.walk.doors[b.dataset.id]; if (removeCategory(store, b.dataset.id).ok) { toast(t("catRemoved", { name })); if (wasOnMap) setTimeout(reopenCity, 1200); else openCategories(); } }
  if (b.dataset.act === "buy") {
    const r = buy(store, b.dataset.district, b.dataset.item);
    if (!r.ok) { toast(t(r.reason === "coins" ? "notEnoughCoins" : r.reason === "full" ? "noSpot" : "cantBuy")); return; }
    const g = map.placeDecor(b.dataset.district, r.slot, b.dataset.item, true); walker.invalidate(); fx.chime([659.25, 987.77]);
    toast(t("decorPlaced", { item: t("item_" + r.item.id), place: title(b.dataset.district) })); closeSheet();
    if (view === "map" && g) { map.pan.set(0, 0, 0); map.pan.x = g.position.x - map.cam.userData.target.x; map.pan.z = g.position.z - map.cam.userData.target.z; map.v.zoom = Math.max(map.v.zoom, 1.6); }
  }
  if (b.dataset.act === "backup") { const d = isoDate(new Date()); bridge.saveFile(`life-backup-${d}.json`, "application/json", exportJSON(store)); lsSet("life-backup-last", d); toast(t("backupSaved")); refreshSheet(); }
});

// ---------- R38 · gestures: swipe a task right to tick it, left to edit it; long-press the bag to speak ----------
{
  let sw = null;
  $("sheetBody").addEventListener("pointerdown", (e) => { const row = e.target.closest(".item"); const box = row?.querySelector('[data-act="toggle"]'); if (!box || e.target.closest("input,button.step")) return; sw = { row, id: box.dataset.id, x: e.clientX, y: e.clientY, dx: 0, on: false }; });
  $("sheetBody").addEventListener("pointermove", (e) => {
    if (!sw) return; const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
    if (!sw.on && Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { sw = null; return; } // a scroll, not a swipe
    if (!sw.on && Math.abs(dx) > 14) sw.on = true;
    if (sw.on) { sw.dx = dx; sw.row.style.transition = "none"; sw.row.style.transform = `translateX(${dx}px)`; sw.row.classList.toggle("swipe-done", dx > 70); sw.row.classList.toggle("swipe-edit", dx < -70); }
  });
  const endSwipe = () => {
    if (!sw) return; const { row, id, dx, on } = sw; sw = null; row.style.transition = ""; row.style.transform = ""; row.classList.remove("swipe-done", "swipe-edit");
    if (!on) return; swallowClick = true; setTimeout(() => { swallowClick = false; }, 50);
    const rtl = document.documentElement.dir === "rtl", forward = rtl ? -dx : dx;
    if (forward > 70) { const n = store.get(id); if (n && !n.done) finish(id, row.getBoundingClientRect(), () => store.complete(id)); }
    else if (forward < -70) openEditor(id);
  };
  $("sheetBody").addEventListener("pointerup", endSwipe); $("sheetBody").addEventListener("pointercancel", endSwipe);
  $("sheetBody").addEventListener("click", (e) => { if (swallowClick) { e.stopPropagation(); e.preventDefault(); } }, true);
  let press = 0, pressed = false;
  $("bagBtn").addEventListener("pointerdown", () => { pressed = false; press = setTimeout(() => { pressed = true; navigator.vibrate?.(15); $("micBtn").click(); }, 550); });
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) $("bagBtn").addEventListener(ev, () => clearTimeout(press));
  $("bagBtn").addEventListener("click", (e) => { if (pressed) { e.stopImmediatePropagation(); pressed = false; } }, true);
}
let swallowClick = false;

// ---------- R33 · edit an item ----------
let editing = null;
const isoIn = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return isoDate(d); };
function openEditor(id) {
  const n = store.get(id); if (!n) return; editing = id;
  const opts = placeChoices(store).map((p) => `<option value="${p.id}" ${p.id === n.parent ? "selected" : ""}>${p.kind === "room" ? esc(t("homeSep")) : ""}${esc(title(p.id))}</option>`).join("");
  $("edTitle").value = n.title; $("edDue").value = n.due || ""; $("edNotes").value = n.notes || ""; $("edUrl").value = n.url || ""; $("edPlace").innerHTML = opts;
  $("edType").value = ["task", "note", "item", "link", "person", "pet", "document", "photo"].includes(n.type) ? n.type : "note";
  setEffort(n.effort || 1); renderSteps((n.steps || []).map((st, i) => ({ from: i, title: st.title, done: st.done })));
  const rv = n.repeat ? `${n.repeat.every}:${n.repeat.unit}` : "";
  if (rv && ![...$("edRepeat").options].some((o) => o.value === rv)) $("edRepeat").add(new Option(repeatText(n.repeat), rv));
  $("edRepeat").value = rv;
  $("edTime").value = n.time || ""; $("edRemind").value = n.remind || "notify"; $("edAlarmHelp").hidden = $("edRemind").value !== "alarm" || !!bridge.canRemind;
  $("edError").textContent = ""; $("editor").hidden = false; editorTypeChanged();
}
function setEffort(v) { $("edEffort").dataset.v = v; for (const b of $("edEffort").children) b.classList.toggle("on", +b.dataset.v === v); }
function renderSteps(list) {
  $("edSteps").innerHTML = list.map((st, i) => `<div class="edstep" data-from="${st.from ?? ""}"><i class="${st.done ? "on" : ""}"></i><input value="${esc(st.title)}" aria-label="${t("stepN", { n: i + 1 })}"><button type="button" class="x ghost" data-act="rmstep" aria-label="${t("removeStep")}">✕</button></div>`).join("");
}
function readSteps() { return [...$("edSteps").children].map((r) => ({ from: r.dataset.from === "" ? null : +r.dataset.from, title: r.querySelector("input").value, done: r.querySelector("i").classList.contains("on") })); }
function editorTypeChanged() { const task = $("edType").value === "task"; for (const id of ["edDueRow", "edTimeRow", "edEffortRow", "edStepsRow", "edRepeatRow"]) $(id).hidden = !task; $("edUrlRow").hidden = $("edType").value !== "link" && !$("edUrl").value; }
function closeEditor() { $("editor").hidden = true; editing = null; }
$("edType").addEventListener("change", editorTypeChanged);
$("edRemind").addEventListener("change", () => { $("edAlarmHelp").hidden = $("edRemind").value !== "alarm" || !!bridge.canRemind; });
$("edEffort").addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (b) setEffort(+b.dataset.v); });
$("edDueChips").addEventListener("click", (e) => { const b = e.target.closest("[data-days]"); if (b) $("edDue").value = b.dataset.days === "" ? "" : isoIn(+b.dataset.days); });
$("edSteps").addEventListener("click", (e) => { if (e.target.closest('[data-act="rmstep"]')) e.target.closest(".edstep").remove(); });
$("edAddStep").addEventListener("click", () => { renderSteps([...readSteps(), { from: null, title: "" }]); $("edSteps").lastElementChild.querySelector("input").focus(); });
$("edCancel").addEventListener("click", closeEditor);
$("edClose").addEventListener("click", closeEditor);
$("editorForm").addEventListener("submit", (e) => {
  e.preventDefault(); if (!editing) return;
  const task = $("edType").value === "task", rp = $("edRepeat").value;
  const form = { title: $("edTitle").value, notes: $("edNotes").value, type: $("edType").value, parent: $("edPlace").value, url: $("edUrl").value };
  if (task) Object.assign(form, { time: $("edTime").value, remind: $("edRemind").value, due: $("edDue").value || ($("edTime").value ? isoIn(0) : ""), effort: +$("edEffort").dataset.v, steps: readSteps(), repeat: rp ? { every: +rp.split(":")[0], unit: rp.split(":")[1] } : null });
  const r = applyEdit(store, editing, form);
  if (!r.ok) { $("edError").textContent = t(r.field === "due" ? "errDate" : r.field === "parent" ? "errPlace" : "errTitle"); $(r.field === "due" ? "edDue" : r.field === "parent" ? "edPlace" : "edTitle")?.focus(); return; }
  const moved = store.get(editing).parent, saved1 = store.get(editing); closeEditor(); toast(t("saved"));
  if (saved1.time && saved1.remind !== "none" && !bridge.canRemind && "Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
  if (sheetFor && moved !== sheetFor && sheetFor !== "home") toast(t("movedTo", { place: title(moved) }));
});
$("edDelete").addEventListener("click", () => { const n = store.get(editing); if (!n) return; const copy = { ...n }; closeEditor(); store.remove(copy.id); toast(t("deleted"), () => store.add(copy)); });
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
  if (ptrs.size === 1) down = { x: e.clientX, y: e.clientY, moved: false, pan: e.button === 1, turn: e.button !== 1 && (e.button === 2 || e.shiftKey || e.altKey) };
  else { down = null; const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); twist = Math.atan2(b.y - a.y, b.x - a.x); midY = (a.y + b.y) / 2; }
});
el.addEventListener("mousedown", (e) => { if (e.button === 1) e.preventDefault(); }); // no auto-scroll: the middle button pans
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
  if (down.turn || (!down.pan && mode === "walk" && view === "map")) { turnView(w, -dx * 0.006, dy * 0.005); return; }
  const { right, forward } = panBasis(w.v.yaw), upp = (2 * viewDist(w) * Math.tan((w.cam.fov * Math.PI) / 360)) / innerHeight, f = (dy * upp) / Math.max(0.3, Math.sin(w.v.pitch));
  w.pan.x += -dx * upp * right[0] + f * forward[0]; w.pan.z += -dx * upp * right[2] + f * forward[2]; w.pan.clampLength(0, view === "map" ? 17 : 7);
});
function endPtr(e) { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = 0; const d = down; down = null; return d; }
el.addEventListener("pointercancel", endPtr);
el.addEventListener("pointerup", (e) => {
  const d = endPtr(e); if (!d || d.moved || d.pan) return; // a middle click never opens anything
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
let gPending = false;
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { document.activeElement?.blur?.(); onBack(); return; }
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "")) return;
  const k = e.key.toLowerCase();
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  // R38 · desktop keys: / search, n new, t Today, g then a letter opens a district
  if (gPending) { gPending = false; const id = { h: "home", w: "work", p: "paperwork", f: "family", e: "health", b: "bag" }[k]; if (id) { e.preventDefault(); id === "home" ? openIsland("home") : openSheet(id); } return; }
  if (k === "/") { e.preventDefault(); $("searchBtn").click(); return; }
  if (k === "n") { e.preventDefault(); $("capInput").focus(); return; }
  if (k === "t") { e.preventDefault(); openToday(); return; }
  if (k === "g") { gPending = true; setTimeout(() => { gPending = false; }, 1200); return; }
  if (k === "q") turnBy(-Math.PI / 4); if (k === "e") turnBy(Math.PI / 4);
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
  if (on) { W.back = { pitch: v.pitch, yaw: v.yaw }; W.arrived = nearDoor(); v.pitchGoal = 0.36; map.zoomGoal = 1; if (!W.told) { W.told = true; toast(t("walkTip")); } }
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
    // Walking over a reward coin picks it up: +1 coin, at most 5 from each burst.
    for (let i = physics.bodies.length - 1; i >= 0; i--) {
      const b = physics.bodies[i]; if (b.kind !== "coin" || Math.hypot(b.p[0] - me.position.x, b.p[2] - me.position.z) > 0.5 || b.p[1] > me.position.y + 1.2) continue;
      physics.bodies.splice(i, 1); const k = b.data.burst; picked[k] = (picked[k] || 0) + 1;
      if (picked[k] <= 5) { store.earnCoins(1, "picked up"); fx.chime([1046.5]); }
    }
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
let burstN = 0; const picked = {};
function releaseCoins() { burstN++;
  for (const [id, n] of Object.entries(pendingCoins)) {
    delete pendingCoins[id]; const d = map.walk.doors[id]; if (!d || view !== "map") continue;
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, sp = 1.2 + Math.random() * 2.6; physics.add({ p: [d[0], 0.9 + Math.random() * 0.5, d[1]], v: [Math.cos(a) * sp, 6 + Math.random() * 4.5, Math.sin(a) * sp], r: 0.16, bounce: 0.5, drag: 1.4, life: 5.5 + Math.random() * 2, kind: "coin", data: { spin: Math.random() * 6, burst: burstN } }); }
  }
}
function physicsTick(dt) {
  for (const e of physics.step(dt)) if (e.type === "splash") map.splash(e.at[0], e.at[2]);
  for (const t of map.toys) { const b = t.body; t.mesh.position.set(b.p[0], b.p[1], b.p[2]); t.mesh.rotation.x += (b.v[2] * dt) / b.r; t.mesh.rotation.z -= (b.v[0] * dt) / b.r; }
  let n = 0;
  for (const b of physics.bodies) {
    if (b.kind !== "coin" || n >= 48) continue;
    const fade = Math.min(1, (b.life - b.age) * 2.5); coinE.set(b.data.spin + b.age * (b.asleep ? 0 : 6), b.age * 3, 0); coinQ.setFromEuler(coinE); coinS.setScalar(Math.max(0.01, fade)); coinP.set(b.p[0], b.p[1], b.p[2]);
    map.coins.setMatrixAt(n++, coinM.compose(coinP, coinQ, coinS));
  }
  for (let i = n; i < coinsShown; i++) map.coins.setMatrixAt(i, coinNone);
  if (n || coinsShown) map.coins.instanceMatrix.needsUpdate = true; coinsShown = n;
}

// ---------- capture: text, voice, photo, scan, share ----------
$("capForm").addEventListener("submit", (e) => {
  e.preventDefault(); const v = $("capInput").value.trim(); if (!v) return;
  const id = store.capture(v, { source: viaVoice ? "voice" : "text" }); $("capInput").value = ""; viaVoice = false;
  const n = store.get(id); toast(`${n.due ? t("inBagDue", { d: dueText(n.due) }) : t("inBag")} · ${t("suggests", { place: title(n.suggest[0]) })}`);
  bounceBag();
});
const bounceBag = () => $("bagBtn").animate([{ transform: "translateX(-50%) scale(1)" }, { transform: "translateX(-50%) scale(1.18)" }, { transform: "translateX(-50%) scale(1)" }], { duration: 380 });
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const speechLang = () => (/^he|^iw/.test(navigator.language) ? "he-IL" : "en-US");
let rec = null, viaVoice = false;
$("micBtn").addEventListener("click", () => {
  if (bridge.canNativeVoice) { bridge.voice(speechLang()); return; }
  if (!SR) { toast(t("noVoice")); return; }
  if (rec) { rec.stop(); return; }
  rec = new SR(); rec.lang = speechLang(); rec.interimResults = true;
  $("micBtn").classList.add("live");
  rec.onresult = (ev) => { $("capInput").value = [...ev.results].map((r) => r[0].transcript).join(" "); };
  rec.onend = () => { $("micBtn").classList.remove("live"); rec = null; if ($("capInput").value.trim()) { viaVoice = true; $("capForm").requestSubmit(); } };
  rec.start();
});
$("camBtn").addEventListener("click", () => $("photoInput").click());
$("photoInput").addEventListener("change", async () => {
  const f = $("photoInput").files[0]; $("photoInput").value = ""; if (!f) return;
  const { images, thumb } = await media.storeImages([await media.fileToDataURL(f)]);
  const pid = store.add({ type: "photo", title: t("photoOf", { d: new Date().toLocaleDateString(lang === "he" ? "he-IL" : undefined) }), images, thumb, parent: "bag", suggest: ["home", "paperwork", "living"] });
  store.input("photo", f.name || "photo", pid);
  toast(t("photoInBag")); bounceBag();
});
$("scanBtn").addEventListener("click", () => bridge.scan());
async function onScan(res) {
  const pages = res?.pages || []; if (!pages.length) return;
  const { images, thumb } = await media.storeImages(pages);
  const sid = store.add({ type: "document", title: t("scannedDoc", { n: pages.length }), images, thumb, parent: "bag", suggest: ["paperwork", "home", "work"], notes: "" });
  store.input("scan", `${pages.length} pages`, sid);
  toast(t("scanSaved")); openSheet("bag");
}
async function onShare(p) {
  const n = shareToNode(p || {});
  if (n.images?.length) Object.assign(n, await media.storeImages(n.images));
  const shid = store.add(n); store.input("share", [p?.title, p?.text, p?.url].filter(Boolean).join(" · ") || "(file)", shid); toast(t("sharedIn")); openSheet("bag");
}
function onVoice(text) { if (!text) return; viaVoice = true; $("capInput").value = text; $("capForm").requestSubmit(); }
function onBack() {
  if (!$("editor").hidden) { closeEditor(); return true; }
  if (!$("feedback").hidden) { $("feedback").hidden = true; return true; }
  if (!$("menu").hidden) { $("menu").hidden = true; return true; }
  if (!$("searchBox").hidden) { $("searchBox").hidden = true; return true; }
  if (!$("sheet").hidden) { closeSheet(); return true; }
  if (view === "home") { fly("map"); return true; }
  return false;
}
// R21 · deep links from shortcuts, the widget, the tile, reminders, NFC tags and QR codes.
function onLink(url) {
  const a = parseDeepLink(url); if (!a) return;
  closeSheet(); $("searchBox").hidden = true; $("menu").hidden = true;
  if (a.action === "add") { const id = store.capture(a.text, { source: "link" }); const n = store.get(id); toast(n.due ? t("inBagDue", { d: dueText(n.due) }) : t("inBag")); bounceBag(); }
  if (a.action === "capture") setTimeout(() => $("capInput").focus(), 300);
  if (a.action === "goal") { const r = store.addGoal(a.text); openGoals(); toast(r.ok ? t("goalAdded") : t(r.error === "when" ? "goalNeedsWhen" : "goalNeedsWhat")); }
  if (a.action === "goals") openGoals();
  if (a.action === "open") { const n = store.get(a.id); if (n?.type === "goal") openGoal(a.id); else if (n) openFor(a.id); else toast(t("gone")); }
  if (a.action === "place") { if (store.get(a.id)?.type === "place") openFor(a.id); }
  if (a.action === "today") openToday();
  if (a.action === "scan") bridge.scan();
  if (a.action === "voice") $("micBtn").click();
}
// R20 · backups: daily into a folder on the phone; a monthly reminder to export on the web.
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };
function onBackup(ok, name) { if (ok) { lsSet("life-backup-last", isoDate(new Date())); if (backupAsked) toast(t("backedUp", { name })); } else toast(t("backupFailed")); backupAsked = false; }
let backupAsked = false;
const bridge = initBridge({ onShare, onScan, onVoice, onBack, onLink, onBackup, onError: (m) => toast(m) });
function autoBackup() { if (bridge.canBackup && bridge.hasBackupFolder() && backupDue(lsGet("life-backup-last"))) bridge.backup(backupName(), exportJSON(store)); }
// R11 · tell the phone what to remind (a moment after each change, so typing doesn't flood it).
let remindT = 0;
const syncReminders = () => {
  if (!bridge.canRemind) return; clearTimeout(remindT);
  remindT = setTimeout(() => {
    bridge.setReminders(reminderList(store));
    const L = todayList(store); // R38 · the widget's three lines: late first, then today, then this week
    bridge.setToday([...L.overdue.map((x) => ({ ...x, late: true })), ...L.today, ...L.week].slice(0, 3).map((x) => ({ title: x.title, late: !!x.late })));
  }, 1200);
};
syncReminders();
$("scanBtn").hidden = !bridge.canScan;
$("autoBackupItem").hidden = !bridge.canBackup;
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
// A tap anywhere outside the open menu closes it (and does nothing else).
document.addEventListener("pointerdown", (e) => {
  if ($("menu").hidden || e.target.closest("#menu, #menuBtn")) return;
  $("menu").hidden = true; e.preventDefault(); e.stopPropagation(); swallowNextClick = true;
}, true);
let swallowNextClick = false;
document.addEventListener("click", (e) => { if (swallowNextClick) { swallowNextClick = false; e.preventDefault(); e.stopPropagation(); } }, true);
$("menu").addEventListener("click", async (e) => {
  const act = e.target.closest("[data-act]")?.dataset.act; if (!act) return; $("menu").hidden = true;
  const stamp = isoDate(new Date());
  if (act === "feedback") openFeedback();
  if (act === "share") { const r = await bridge.shareText("Life Archipelago", exportDigest(store)); if (r === "copied") toast(t("summaryCopied")); }
  if (act === "export") { bridge.saveFile(`life-backup-${stamp}.json`, "application/json", exportJSON(store)); lsSet("life-backup-last", stamp); toast(t("backupExported")); }
  if (act === "autobackup") { backupAsked = true; bridge.backup(backupName(), exportJSON(store), true); }
  if (act === "exportmd") { bridge.saveFile(`life-summary-${stamp}.md`, "text/markdown", exportDigest(store)); toast(t("summaryExported")); }
  if (act === "import") $("importInput").click();
  if (act === "categories") openCategories();
  if (act === "profile") openProfile();
  if (act === "devices") openDevices();
  if (act === "journal") openJournal("actions");
  if (act === "quality") { lsSet("life-quality", quality === "enhanced" ? "light" : "enhanced"); location.reload(); }
  if (act === "theme") { const next = document.documentElement.dataset.theme === "faded" ? "contrast" : "faded"; document.documentElement.dataset.theme = next; lsSet("life-theme", next); applyLang(); }
  if (act === "lang") { lang = lang === "he" ? "en" : "he"; lsSet("life-lang", lang); t = makeT(lang); applyLang(); }
  if (act === "examples") { for (const n of store.all().filter((x) => x.tags.includes("example"))) store.remove(n.id); toast(t("examplesRemoved")); }
  if (act === "sound") { sound = !sound; try { localStorage.setItem("life-sound", sound ? "on" : "off"); } catch (e) { /* ignore */ } renderSound(); if (sound) fx.chime([523.25, 783.99]); toast(t(sound ? "soundOn" : "soundOff")); }
  if (act === "about") toast(t("about", { v: VERSION, r: backendName }) + (bridge.android ? ` · Android ${bridge.version || ""}` : ""));
});
const renderSound = () => { const b = $("menu").querySelector('[data-act="sound"]'); if (b) b.querySelector("span").textContent = t("soundState", { s: t(sound ? "on" : "off") }); };
renderSound();
// R37 · put the chosen language on the static page: texts, placeholders, labels, direction.
function applyLang() {
  document.documentElement.lang = lang; document.documentElement.dir = lang === "he" ? "rtl" : "ltr";
  for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll("[data-i18n-ph]")) el.placeholder = t(el.dataset.i18nPh);
  for (const el of document.querySelectorAll("[data-i18n-aria]")) el.setAttribute("aria-label", t(el.dataset.i18nAria));
  const lb = $("menu").querySelector('[data-act="lang"] span'); if (lb) lb.textContent = t("language", { l: LANGS[lang] });
  const tb = $("menu").querySelector('[data-act="theme"] span'); if (tb) tb.textContent = t("m_theme", { c: t(document.documentElement.dataset.theme === "faded" ? "th_faded" : "th_contrast") });
  const qb = $("menu").querySelector('[data-act="quality"]'); if (qb) { qb.hidden = !canChooseQuality({ coarse }); qb.querySelector("span").textContent = t("m_quality", { q: t(quality === "enhanced" ? "q_enhanced" : "q_light") }); }
  $("back").querySelector("b").textContent = title("home");
  renderSound(); renderHud(); placeLabels(); refreshSheet();
}
applyLang();
$("importInput").addEventListener("change", async () => {
  const f = $("importInput").files[0]; $("importInput").value = ""; if (!f) return;
  try { importJSON(store, await f.text()); toast(t("imported")); } catch (err) { toast(t("notBackup")); }
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
function renderDiag() { $("fbDiag").textContent = $("fbDetails").checked ? Object.entries(diag()).map(([k, v]) => `${k}: ${v}`).join("\n") : t("noDetails"); }
function openFeedback() {
  $("menu").hidden = true; closeSheet(); $("searchBox").hidden = true;
  $("feedback").hidden = false; renderDiag(); $("fbText").focus();
}
$("fbKinds").addEventListener("click", (e) => { const b = e.target.closest("[data-kind]"); if (!b) return; fbKind = b.dataset.kind; for (const c of $("fbKinds").children) c.classList.toggle("on", c === b); });
$("fbDetails").addEventListener("change", renderDiag);
$("fbClose").addEventListener("click", () => { $("feedback").hidden = true; });
$("fbGitHub").addEventListener("click", () => {
  bridge.openExternal(feedbackNow().url);
  $("feedback").hidden = true; $("fbText").value = ""; toast(t("thanksGitHub"));
});
$("fbShare").addEventListener("click", async () => {
  const f = feedbackNow(); const r = await bridge.shareText(f.title, f.text);
  if (r === "copied") toast(t("feedbackCopied"));
});

// ---------- toast ----------
let toastT = 0;
function toast(text, undo) {
  const el = $("toast"); el.innerHTML = esc(text) + (undo ? ` <button class="chip" style="margin-inline-start:8px">${t("undo")}</button>` : ""); el.hidden = false;
  if (undo) el.querySelector("button").onclick = () => { undo(); el.hidden = true; };
  clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, undo ? 4500 : 2600);
}

// ---------- loop ----------
store.on(() => { renderHud(); refreshSheet(); syncReminders(); });
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
  if (frames === 3) {
    $("splash").classList.add("out"); setTimeout(() => $("splash")?.remove(), 700);
    setTimeout(autoBackup, 4000);
    try { const d = isoDate(new Date()); if (todayList(store).overdue.length && localStorage.getItem("life-today-shown") !== d && !params.has("notoday")) { localStorage.setItem("life-today-shown", d); setTimeout(openToday, 600); } } catch (e) { /* storage unavailable */ }
  }
  if (++frames === 20) { window.__life = { ready: true, store, sync, doSync, openDevices, openProfile, openJournal, goals: () => goalBoard(store), openGoals, openGoal, theme: () => document.documentElement.dataset.theme, view: () => view, backendName,
    quality: () => quality,
    today: () => todayList(store), link: (u) => onLink(u), storage: () => ({ kind: saved.kind, migrated: saved.migrated }), flush: () => saved.flush(),
    ui: { openSheet: (id) => openSheet(id), openEditor: (id) => openEditor(id), closeSheet: () => closeSheet() },
    decor: () => map.decorCount(),
    lastFx: () => fx.last(), confetti: () => fx.confetti(),
    goTo: (id) => walkTo(map.walk.doors[id]), screenOf: (x, y, z) => { const [sx, sy] = projectTo(map.cam, new THREE.Vector3(x, y, z)); return { x: sx, y: sy }; },
    walk: () => ({ mode, x: me.position.x, z: me.position.z, k: W.k, left: W.path?.length || 0, arrived: W.arrived }),
    props: () => ({ coins: physics.bodies.filter((b) => b.kind === "coin").length, toys: map.toys.map((t) => { const [x, y] = projectTo(map.cam, t.mesh.position); return { x, y, p: [...t.body.p], speed: Math.hypot(...t.body.v) }; }) }),
    cam: () => ({ yaw: world().v.yaw, pitch: world().v.pitch, zoom: world().v.zoom, pan: world().pan.length(), perspective: !!world().cam.isPerspectiveCamera }), setCam: (o) => { if (o.pan === 0) world().pan.set(0, 0, 0); const { pan, ...rest } = o; Object.assign(world().v, rest); },
    meshes: () => { let n = 0; map.scene.traverse((o) => { if (o.isMesh && o.visible) n++; }); return n; },
    districts: () => map.isles.map((d) => { const [x, y] = projectTo(map.cam, new THREE.Vector3(d.pos[0], 1.0, d.pos[1])); return { id: d.id, x, y }; }),
    moods: () => Object.fromEntries(map.isles.map((d) => [d.id, { state: districtMood(store, d.id).state, signs: map.moodSigns(d.id) }])),
    terrariums: () => { const out = []; home.scene.traverse((o) => { if (o.name === "terrarium") { const { w, h, d } = o.userData.size; const lz = o.getObjectByName("lizard"); out.push([w, h, d].map((v) => Math.round(v * 80)).concat(lz ? [`lizard ${Math.round(lz.userData.length * 80)}cm`] : [])); } }); return out; } }; }
});

// R54 · keep devices in step: a few seconds after a change, every minute, and when the app comes back.
{
  let soon = 0;
  const active = () => syncFlag() === "on" || syncFlag() === "pending";
  store.on(() => { if (syncFlag() === "on") { clearTimeout(soon); soon = setTimeout(() => doSync(), 4000); } });
  setInterval(() => { if (active() && document.visibilityState === "visible") doSync().then(() => { if (sheetFor === "devices" && syncFlag() === "on") openDevices(); }); }, 60000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && active()) doSync(); });
  if (active()) setTimeout(() => doSync(), 2500);
}


// R59 · on a computer there is no background alarm: while this page is open, reminders sound here at
// their minute (notification with a chime; an alarm keeps chiming until stopped). The phone app rings
// natively instead, even when closed.
{
  const fired = new Set(JSON.parse(lsGet("life-fired") || "[]"));
  let ringing = null;
  const ring = (r) => {
    const key = `${r.id}@${r.due} ${r.time}`; if (fired.has(key)) return; fired.add(key); lsSet("life-fired", JSON.stringify([...fired].slice(-200)));
    const alarm = r.kind === "alarm";
    toast(t(alarm ? "alarmAt" : "remindAt", { t: r.time }) + " · " + r.title);
    fx.chime([659.25, 880, 1046.5]);
    try { if ("Notification" in window && Notification.permission === "granted") new Notification(r.title, { body: r.time, icon: "icons/icon-192.png", requireInteraction: alarm }); } catch (e) { /* not allowed */ }
    if (alarm) {
      clearInterval(ringing);
      let left = 60; ringing = setInterval(() => { fx.chime([880, 1046.5, 880]); if (--left <= 0) clearInterval(ringing); }, 2000);
      const stop = () => { clearInterval(ringing); ringing = null; removeEventListener("pointerdown", stop, true); removeEventListener("keydown", stop, true); };
      addEventListener("pointerdown", stop, true); addEventListener("keydown", stop, true);
    }
  };
  const tick = () => {
    if (bridge.canRemind) return;
    const now = new Date(), hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`, today = isoDate(now);
    const soon = reminderList(store, new Date(now.getTime() - 60000));
    for (const r of soon) if (r.due === today && r.time === hm) ring(r);
  };
  setInterval(tick, 15000);
}
