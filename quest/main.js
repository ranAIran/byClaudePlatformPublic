import * as THREE from "three";
import { pass } from "three/tsl";
import { bloom } from "./vendor/BloomNode.js";
import { CONFIG, UI, ISLANDS } from "./content.js";
import { PUZZLES, h } from "./puzzles.js";
import * as W from "./world.js";
import { speech } from "./speech.js";

const $ = (id) => document.getElementById(id);
// Phones and tablets get lighter render settings (see CONFIG.mobileQuality).
const MOBILE = window.matchMedia?.("(pointer: coarse)").matches;
if (MOBILE && CONFIG.mobileQuality) {
  CONFIG.world.grassPerIsland = CONFIG.mobileQuality.grassPerIsland;
  CONFIG.fireflies = CONFIG.mobileQuality.fireflies;
}
let ready = false;
performance.mark("q:modules");
const TOP = CONFIG.world.islandTop;
const SHOT = new URLSearchParams(location.search).has("shot");

// ---------- Persistent state ----------
const S = { lang: CONFIG.defaultLang, solved: new Set(), elapsed: 0, mode: "title", dialog: null, puzzle: null, autoRead: !!CONFIG.narration?.autoReadDefault };
function load() {
  try { const d = JSON.parse(localStorage.getItem(CONFIG.saveKey) || "null"); if (d) { S.solved = new Set(d.solved || []); S.elapsed = d.elapsed || 0; if (d.lang) S.lang = d.lang; if (typeof d.autoRead === "boolean") S.autoRead = d.autoRead; } } catch (e) { /* storage unavailable */ }
}
function save() { try { localStorage.setItem(CONFIG.saveKey, JSON.stringify({ solved: [...S.solved], elapsed: S.elapsed, lang: S.lang, autoRead: S.autoRead })); } catch (e) { /* ignore */ } }
load();
const ui = () => UI[S.lang] || UI.en;
const tr = (x) => (x == null ? "" : typeof x === "string" ? x : (x[S.lang] ?? x.en ?? ""));

// ---------- Renderer ----------
let renderer;
try {
  // ?webgl forces the WebGL2 backend, a fallback if a device has WebGPU trouble.
  renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: new URLSearchParams(location.search).has("webgl") });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MOBILE ? CONFIG.mobileQuality?.pixelRatio || 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.15;
  $("stage").append(renderer.domElement);
  await renderer.init();
  performance.mark("q:gpu");
} catch (e) {
  console.error(e);
  $("title").hidden = true; $("fatal").hidden = false; $("fatalMsg").textContent = ui().noGpu;
  throw e;
}
const backendName = renderer.backend && renderer.backend.isWebGPUBackend ? "WebGPU" : "WebGL2";

const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.world.sky);
scene.fog = new THREE.Fog(CONFIG.world.fog.color, CONFIG.world.fog.near, CONFIG.world.fog.far);
const hemi = new THREE.HemisphereLight(CONFIG.world.hemi.sky, CONFIG.world.hemi.ground, CONFIG.world.hemi.intensity);
const sun = new THREE.DirectionalLight(CONFIG.world.sun.color, CONFIG.world.sun.intensity);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(MOBILE ? CONFIG.mobileQuality?.shadowMap || 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 70 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.03;
scene.add(hemi, sun, sun.target);
const SUN_OFF = new THREE.Vector3(...(CONFIG.world.sun.offset || [14, 26, 8]));
const sky = CONFIG.world.style === "classic" ? null : W.makeSky(CONFIG);
if (sky) scene.add(sky);

// ---------- Camera ----------
const cam = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
const ISO = new THREE.Vector3(1, 1.05, 1).normalize().multiplyScalar(60);
let zoom = CONFIG.camera.zoom;
const camTarget = new THREE.Vector3();
function frustum() {
  const a = window.innerWidth / window.innerHeight;
  const v = Math.max(zoom, CONFIG.camera.minWidth / a);
  cam.left = -v * a / 2; cam.right = v * a / 2; cam.top = v / 2; cam.bottom = -v / 2; cam.updateProjectionMatrix();
}
frustum();

// ---------- Post-processing (bloom) ----------
let post = null;
if (CONFIG.bloom.enabled) {
  try {
    post = new THREE.PostProcessing(renderer);
    const sp = pass(scene, cam);
    const col = sp.getTextureNode("output");
    post.outputNode = col.add(bloom(col, CONFIG.bloom.strength, CONFIG.bloom.radius, CONFIG.bloom.threshold));
  } catch (e) { console.warn("Bloom disabled:", e); post = null; }
}

// ---------- World ----------
performance.mark("q:scene-start");
const water = W.makeWater(CONFIG);
scene.add(water);
const isl = ISLANDS.map((data, i) => {
  const group = W.makeIsland(data, CONFIG);
  scene.add(group);
  const npc = W.makeCharacter(data.keeper.colors, { hat: data.keeper.hat || "wizard", hair: data.keeper.hair });
  const off = data.props === "gate" ? [0, 1.4] : [-0.6, 1.6];
  npc.position.set(data.pos[0] + off[0], group.userData.heightAt(off[0], off[1]), data.pos[1] + off[1]);
  npc.rotation.y = Math.PI / 4;
  scene.add(npc);
  const marker = W.makeMarker(data.theme.accent === "#ffffff" ? "#fff6c8" : data.theme.accent);
  marker.position.set(npc.position.x, TOP + 2.0, npc.position.z);
  scene.add(marker);
  const label = h("div", { class: "isl-label" }, h("b", {}, data.name), h("small", {}, data.concept));
  $("labels").append(label);
  return { data, group, npc, marker, label, index: i };
});
const gate = isl.find((x) => x.data.props === "gate");
const bridges = [];
for (let i = 0; i < ISLANDS.length - 1; i++) {
  const b = W.makeBridge(ISLANDS[i], ISLANDS[i + 1], CONFIG);
  scene.add(b);
  bridges.push({ mesh: b, from: i, open: false, t: 0 });
}

// Fireflies drifting over the archipelago.
const FF = CONFIG.fireflies;
const ffMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.06, 0), W.glow("#fff3a8", 4), FF);
ffMesh.castShadow = false;
const ffSeed = [];
{
  const r = W.rng(99);
  const xs = ISLANDS.map((d) => d.pos[0]), zs = ISLANDS.map((d) => d.pos[1]);
  const minX = Math.min(...xs) - 8, maxX = Math.max(...xs) + 8, minZ = Math.min(...zs) - 8, maxZ = Math.max(...zs) + 8;
  for (let i = 0; i < FF; i++) ffSeed.push([minX + r() * (maxX - minX), 1 + r() * 4, minZ + r() * (maxZ - minZ), r() * 10]);
}
scene.add(ffMesh);
const dummy = new THREE.Object3D();

// Player.
const look = CONFIG.playerLook || { colors: ["#2f6f8f", "#f1cfae", "#c9a227"], hat: "straw" };
const player = W.makeCharacter(look.colors, { hat: look.hat, hair: look.hair, lanternColor: "#ffe08a" });
const start = ISLANDS[0];
player.position.set(start.pos[0] + 1.2, TOP, start.pos[1] + 2.8);
scene.add(player);
const P = { target: null, talkTo: null, keys: new Set(), walkT: 0 };
camTarget.copy(player.position);

// Tap marker ring.
const ring = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.36, 24), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false }));
ring.rotation.x = -Math.PI / 2; scene.add(ring);

// ---------- Walkable area ----------
// Inside an island's coastline, scaled by k (1 = shoreline).
function onIsland(o, x, z, k) {
  const dx = x - o.data.pos[0], dz = z - o.data.pos[1];
  const lim = o.data.radius * o.group.userData.coast(Math.atan2(dz, dx)) * k;
  return dx * dx + dz * dz < lim * lim;
}
function groundY(x, z) {
  for (const o of isl) if (onIsland(o, x, z, 0.92)) return o.group.userData.heightAt(x - o.data.pos[0], z - o.data.pos[1]);
  return TOP;
}
function walkable(x, z) {
  for (const o of isl) { if (onIsland(o, x, z, 0.84)) return true; }
  for (const b of bridges) {
    if (!b.open) continue;
    const { start: a, end: e } = b.mesh.userData;
    const vx = e.x - a.x, vz = e.y - a.y, L2 = vx * vx + vz * vz;
    const t = ((x - a.x) * vx + (z - a.y) * vz) / L2;
    if (t < -0.15 || t > 1.15) continue;
    const px = a.x + vx * t, pz = a.y + vz * t;
    if ((x - px) ** 2 + (z - pz) ** 2 < 0.7 ** 2) return true;
  }
  return false;
}
function islandAt(x, z) { return isl.find((o) => { const dx = x - o.data.pos[0], dz = z - o.data.pos[1]; return dx * dx + dz * dz < o.data.radius ** 2; }); }

// ---------- Progress & gate ----------
function puzzleIslands() { return isl.filter((o) => o.data.requires !== "all"); }
function applyProgress(animate) {
  isl.forEach((o) => {
    const solved = S.solved.has(o.data.id);
    o.marker.material = solved ? W.glow("#ffd166", 1.2) : W.glow(o.data.theme.accent === "#ffffff" ? "#fff6c8" : o.data.theme.accent, 2.6);
    o.marker.scale.set(solved ? 0.6 : 1, solved ? 0.9 : 1.5, solved ? 0.6 : 1);
    o.label.classList.toggle("done", solved);
  });
  bridges.forEach((b) => { const open = S.solved.has(ISLANDS[b.from].id); if (open && !b.open) { b.open = true; b.t = animate ? 0 : 1; } });
  if (gate) {
    const ps = puzzleIslands();
    gate.group.userData.sockets?.forEach((s, i) => {
      const o = ps[i];
      s.material = o && S.solved.has(o.data.id) ? W.glow(o.data.theme.accent, 3) : W.mat("#555a66");
    });
  }
  renderShards();
}

// ---------- Narration ----------
// Every written instruction can be read aloud in the current language (see speech.js).
let warnedVoice = {};
function say(text) {
  if (!speech.supported) { toast(ui().noSpeech); return; }
  if (!speech.hasVoice(S.lang) && !warnedVoice[S.lang]) { warnedVoice[S.lang] = true; toast(ui().noVoice); }
  speech.speak(text, S.lang);
}
function sayBtn(getText) {
  const u = ui();
  return h("button", { type: "button", class: "say", "aria-label": u.listen, title: u.listen, onclick: (e) => {
    e.stopPropagation();
    if (speech.speaking) speech.stop(); else say(typeof getText === "function" ? getText() : getText);
  } }, h("span", { "aria-hidden": "true" }, "🔊"));
}
function autoSay(text) { if (S.autoRead && speech.supported) say(text); }
speech.onchange = (on) => { document.body.classList.toggle("speaking", on); };
function renderAudioBtn() {
  const u = ui(), b = $("audioBtn");
  b.textContent = S.autoRead ? "🔊" : "🔈";
  b.setAttribute("aria-pressed", String(S.autoRead));
  b.title = S.autoRead ? u.autoReadOn : u.autoReadOff; b.setAttribute("aria-label", b.title);
}
$("audioBtn").addEventListener("click", () => {
  S.autoRead = !S.autoRead; save(); renderAudioBtn();
  toast(S.autoRead ? ui().autoReadOn : ui().autoReadOff);
  if (!S.autoRead) speech.stop();
  else if (S.dialog) autoSay($("dialog").querySelector(".line")?.textContent);
});

// ---------- HUD ----------
function renderShards() {
  $("shards").replaceChildren(...isl.map((o) => h("span", { class: "shard" + (S.solved.has(o.data.id) ? " got" : ""), style: { "--c": o.data.theme.accent }, title: o.data.concept })));
}
function applyLang() {
  const u = ui();
  document.documentElement.lang = S.lang;
  document.documentElement.dir = S.lang === "he" ? "rtl" : "ltr";
  $("tagline").textContent = u.tagline;
  $("intro").textContent = u.intro;
  $("startBtn").textContent = ready ? (S.solved.size ? u.continue : u.start) : u.loading;
  $("resetBtn").textContent = u.reset;
  $("resetBtn").hidden = !S.solved.size;
  $("hint").textContent = u.hint;
  $("codexBtn").textContent = u.codex;
  $("langBtn").textContent = u.langBtn;
  $("langBtn2").textContent = u.langBtn;
  $("talkBtn").textContent = u.talk;
  $("backend").textContent = `${u.renderer}: ${backendName}`;
  $("version").textContent = `v${CONFIG.version}`;
  $("titleVersion").textContent = `v${CONFIG.version}`;
  $("recenterBtn").title = u.recenter; $("recenterBtn").setAttribute("aria-label", u.recenter);
  $("introSay").replaceChildren(sayBtn(() => u.intro));
  renderAudioBtn();
  speech.stop();
  if (typeof renderInstall === "function") renderInstall();
  if (S.dialog) renderDialog();
  if (S.puzzle) openPuzzle(S.puzzle.o);
  if (!$("codex").hidden) renderCodex();
  if (!$("end").hidden) renderEnd();
}
// ---------- Admin shortcut (demos and testing) ----------
// Tap the version number CONFIG.admin.taps times within 3 seconds, enter the PIN, then skip islands.
let adminTaps = [];
function adminTap() {
  const now = Date.now(); adminTaps = adminTaps.filter((t) => now - t < 3000); adminTaps.push(now);
  if (adminTaps.length >= (CONFIG.admin?.taps || 5)) { adminTaps = []; openAdminPin(); }
}
function adminCard(...kids) {
  const card = h("div", { class: "card puzzle", role: "dialog", "aria-label": "Admin" },
    h("header", {}, h("div", {}, h("small", { dir: "ltr" }, "Admin"), h("h2", { dir: "ltr" }, "Skip islands")), h("button", { type: "button", class: "x", "aria-label": "Close", onclick: () => { $("modal").hidden = true; } }, "✕")), ...kids);
  $("modal").replaceChildren(card); $("modal").hidden = false;
}
function openAdminPin() {
  if (!CONFIG.admin?.pin) return;
  const input = h("input", { class: "pin", type: "password", inputmode: "numeric", autocomplete: "off", maxlength: "12", "aria-label": "PIN", dir: "ltr" });
  const msg = h("p", { class: "feedback" });
  const go = () => { if (input.value === String(CONFIG.admin.pin)) openAdminPanel(); else { msg.textContent = "✗"; msg.className = "feedback bad"; input.value = ""; input.focus(); } };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  adminCard(h("p", { class: "explain", dir: "ltr" }, "Enter the admin PIN"), input, msg, h("div", { class: "actions" }, h("button", { type: "button", class: "btn primary", onclick: go }, "Unlock")));
  setTimeout(() => input.focus(), 50);
}
function adminSkip(ids) {
  for (const id of ids) S.solved.add(id);
  save(); applyProgress(true); openAdminPanel();
}
function openAdminPanel() {
  const rows = isl.map((o) => h("div", { class: "admin-row", dir: "ltr" }, h("span", {}, h("b", {}, o.data.name), " · ", o.data.concept),
    S.solved.has(o.data.id) ? h("span", { class: "muted" }, "✓ solved") : h("button", { type: "button", class: "btn", onclick: () => adminSkip([o.data.id]) }, "Skip")));
  const puzzles = isl.filter((o) => o.data.requires !== "all").map((o) => o.data.id);
  const gateId = isl.find((o) => o.data.requires === "all")?.data.id;
  adminCard(h("div", { class: "admin-list" }, rows),
    h("div", { class: "actions" },
      h("button", { type: "button", class: "btn", onclick: () => { S.solved.clear(); S.elapsed = 0; save(); location.reload(); } }, "Reset progress"),
      h("button", { type: "button", class: "btn", onclick: () => adminSkip(puzzles) }, "Skip to the gate"),
      h("button", { type: "button", class: "btn primary", onclick: () => { adminSkip(gateId ? [...puzzles, gateId] : puzzles); $("modal").hidden = true; if (gateId) finale(); } }, "Finish the quest")));
}
for (const id of ["version", "titleVersion"]) document.getElementById(id)?.addEventListener("click", adminTap);

function toggleLang() { S.lang = S.lang === "he" ? "en" : "he"; save(); applyLang(); }
$("langBtn").addEventListener("click", toggleLang);
$("langBtn2").addEventListener("click", toggleLang);

let toastTimer = 0;
function toast(text) { const t = $("toast"); if (!t) return; t.textContent = text; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600); }

// ---------- Dialog ----------
function openDialog(o) {
  S.dialog = { o, line: 0 }; S.mode = "dialog"; P.target = null; renderDialog();
}
function closeDialog() { speech.stop(); S.dialog = null; $("dialog").hidden = true; if (S.mode === "dialog") S.mode = "play"; }
function renderDialog() {
  const { o, line } = S.dialog, u = ui(), d = o.data;
  const lines = tr(d.dialogue);
  const last = line >= lines.length - 1;
  const solved = S.solved.has(d.id);
  const locked = d.requires === "all" && puzzleIslands().some((x) => !S.solved.has(x.data.id));
  let text = lines[Math.min(line, lines.length - 1)];
  const actions = [];
  if (!last) actions.push(h("button", { type: "button", class: "btn primary", onclick: () => { S.dialog.line++; renderDialog(); } }, u.next));
  else if (solved) { text = u.solved; actions.push(h("button", { type: "button", class: "btn", onclick: closeDialog }, u.close)); }
  else if (locked) { text = u.gateLocked; actions.push(h("button", { type: "button", class: "btn", onclick: closeDialog }, u.close)); }
  else actions.push(h("button", { type: "button", class: "btn", onclick: closeDialog }, u.later), h("button", { type: "button", class: "btn primary", onclick: () => { closeDialog(); openPuzzle(o); } }, u.challenge));
  $("dialog").replaceChildren(
    h("div", { class: "who", style: { "--c": d.theme.accent } }, h("b", { dir: "ltr" }, d.keeper.name), h("span", {}, tr(d.keeper.role)), h("i", { dir: "ltr" }, d.name)),
    h("div", { class: "line-wrap" }, h("p", { class: "line" }, text), sayBtn(() => text)),
    h("div", { class: "actions" }, actions));
  $("dialog").hidden = false;
  speech.stop(); autoSay(text);
  $("dialog").querySelector(".btn.primary, .btn")?.focus({ preventScroll: true });
}

// ---------- Puzzle ----------
function openPuzzle(o) {
  const d = o.data, u = ui(), type = PUZZLES[d.puzzle.type];
  S.puzzle = { o }; S.mode = "puzzle"; P.target = null;
  let extra = "";
  const fb = h("p", { class: "feedback", "aria-live": "polite" });
  const body = h("div", { class: "pz-body" });
  const card = h("div", { class: "card puzzle", role: "dialog", "aria-modal": "true", "aria-label": d.concept },
    h("header", {}, h("div", {}, h("small", { dir: "ltr" }, d.name), h("h2", { dir: "ltr" }, d.concept)), h("button", { type: "button", class: "x", "aria-label": u.close, onclick: closePuzzle }, "✕")),
    h("div", { class: "line-wrap" }, h("p", { class: "explain" }, tr(d.puzzle.explain)), sayBtn(() => [tr(d.puzzle.explain), extra].filter(Boolean).join(" "))), body, fb);
  $("modal").replaceChildren(card); $("modal").hidden = false;
  const feedback = (text, kind) => { fb.textContent = text; fb.className = "feedback " + (kind || ""); };
  if (!type) { feedback(`Unknown puzzle type: ${d.puzzle.type}`, "bad"); return; }
  let finished = false;
  const setSpeech = (text) => { extra = text || ""; };
  type({ root: body, p: d.puzzle, tr, ui: u, feedback, setSpeech, done: () => { if (finished) return; finished = true; setTimeout(() => solve(o, card), 500); } });
  speech.stop(); autoSay([tr(d.puzzle.explain), extra].filter(Boolean).join(" "));
}
function closePuzzle() { speech.stop(); S.puzzle = null; $("modal").hidden = true; $("modal").replaceChildren(); if (S.mode === "puzzle") S.mode = "play"; }
function solve(o, card) {
  const d = o.data, u = ui(), first = !S.solved.has(d.id);
  S.solved.add(d.id); save(); applyProgress(true);
  const next = ISLANDS[o.index + 1];
  card.replaceChildren(
    h("div", { class: "reward" }, h("span", { class: "big-shard", style: { "--c": d.theme.accent } }), h("h2", {}, u.shardGot), h("p", { dir: "ltr", class: "concept" }, d.concept)),
    codexEntry(d),
    h("div", { class: "actions" }, h("button", { type: "button", class: "btn primary", onclick: () => {
      closePuzzle();
      if (d.requires === "all") finale();
      else if (first && next) toast(`${u.bridgeTo} ${next.name}`);
    } }, u.next)));
  S.puzzle = null;
  card.querySelector(".btn.primary").focus({ preventScroll: true });
}

// ---------- Codex ----------
function codexEntry(d) {
  const u = ui(), c = d.codex;
  return h("article", { class: "codex-entry", style: { "--c": d.theme.accent } },
    h("div", { class: "line-wrap" }, h("h3", { dir: "ltr" }, d.concept, h("small", {}, " · " + d.name)), sayBtn(() => `${tr(c.allegory)} ${tr(c.text)}`)),
    h("p", {}, h("b", {}, u.allegory + ": "), tr(c.allegory)),
    h("p", {}, h("b", {}, u.realWorld + ": "), tr(c.text)),
    h("ul", { class: "links" }, c.links.map((l) => h("li", {}, h("a", { href: l.url, target: "_blank", rel: "noopener", dir: "ltr" }, l.label + " ↗")))));
}
function renderCodex() {
  const u = ui();
  const entries = isl.filter((o) => S.solved.has(o.data.id)).map((o) => codexEntry(o.data));
  $("codex").replaceChildren(h("div", { class: "card codex" },
    h("header", {}, h("h2", { dir: "ltr" }, "Codex"), h("button", { type: "button", class: "x", "aria-label": u.close, onclick: () => { $("codex").hidden = true; } }, "✕")),
    entries.length ? h("div", { class: "codex-list" }, entries) : h("p", { class: "muted" }, u.codexEmpty)));
}
$("codexBtn").addEventListener("click", () => { renderCodex(); $("codex").hidden = false; });

// ---------- Finale ----------
let finaleT = -1;
function finale() { finaleT = 0; S.mode = "end"; setTimeout(() => { renderEnd(); $("end").hidden = false; autoSay(ui().finishText); }, 2200); }
function renderEnd() {
  const u = ui(), s = Math.round(S.elapsed);
  $("end").replaceChildren(h("div", { class: "card end" },
    h("h2", {}, u.finishTitle), h("div", { class: "line-wrap center" }, h("p", {}, u.finishText), sayBtn(() => u.finishText)),
    h("p", { class: "time" }, `${u.time}: ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`),
    h("div", { class: "actions" },
      h("button", { type: "button", class: "btn", onclick: toggleLang }, u.langBtn),
      h("button", { type: "button", class: "btn", onclick: () => { renderCodex(); $("codex").hidden = false; } }, u.openCodex),
      h("button", { type: "button", class: "btn primary", onclick: () => { S.solved.clear(); S.elapsed = 0; save(); location.reload(); } }, u.playAgain))));
}

// ---------- Title ----------
$("startBtn").addEventListener("click", () => { $("title").hidden = true; $("hud").hidden = false; $("hint").hidden = false; S.mode = "play"; setTimeout(() => { $("hint").hidden = true; }, 9000); });
$("resetBtn").addEventListener("click", () => { S.solved.clear(); S.elapsed = 0; save(); location.reload(); });

// ---------- Input ----------
const ray = new THREE.Raycaster();
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TOP);
const ndc = new THREE.Vector2();
// One pointer: tap walks, drag pans the camera. Two pointers: pinch to zoom.
const pointers = new Map();
let down = null, pinch = 0;
const pan = new THREE.Vector3(); let recentering = false;
const SIN_E = ISO.y / ISO.length();
const RIGHT = new THREE.Vector3(1, 0, -1).normalize(), UPG = new THREE.Vector3(-1, 0, -1).normalize();
const xs = ISLANDS.map((d) => d.pos[0]), zs = ISLANDS.map((d) => d.pos[1]);
const BOUNDS = { minX: Math.min(...xs) - CONFIG.camera.panMargin, maxX: Math.max(...xs) + CONFIG.camera.panMargin, minZ: Math.min(...zs) - CONFIG.camera.panMargin, maxZ: Math.max(...zs) + CONFIG.camera.panMargin };
function setZoom(z) { zoom = Math.min(CONFIG.camera.maxZoom, Math.max(CONFIG.camera.minZoom, z)); frustum(); }
function panBy(dx, dy) {
  const upp = (cam.top - cam.bottom) / window.innerHeight;
  pan.addScaledVector(RIGHT, -dx * upp).addScaledVector(UPG, (dy * upp) / SIN_E);
  recentering = false;
}
const el = renderer.domElement;
el.addEventListener("pointerdown", (e) => {
  el.setPointerCapture?.(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) down = { x: e.clientX, y: e.clientY, panning: false };
  else { down = null; const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
});
el.addEventListener("pointermove", (e) => {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  const cur = { x: e.clientX, y: e.clientY };
  pointers.set(e.pointerId, cur);
  if (pointers.size >= 2) {
    const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch > 0 && d > 0) setZoom(zoom * (pinch / d));
    pinch = d; return;
  }
  if (!down) return;
  if (!down.panning && Math.hypot(cur.x - down.x, cur.y - down.y) > 8) { down.panning = true; el.classList.add("grabbing"); }
  if (down.panning) panBy(cur.x - prev.x, cur.y - prev.y);
});
function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = 0;
  el.classList.remove("grabbing");
  const d = down; down = null;
  return d;
}
el.addEventListener("pointercancel", endPointer);
el.addEventListener("pointerup", (e) => {
  const d = endPointer(e);
  if (!d || d.panning) return;
  if (S.mode !== "play") return;
  const r = el.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, cam);
  const hit = ray.intersectObjects(isl.flatMap((o) => [o.npc, o.marker]), true)[0];
  if (hit) {
    const o = isl.find((x) => x.npc === hit.object || x.marker === hit.object || x.npc.getObjectById(hit.object.id));
    if (o) { P.talkTo = o; P.target = o.npc.position.clone(); return; }
  }
  const p = new THREE.Vector3();
  if (ray.ray.intersectPlane(ground, p)) { P.target = p; P.talkTo = null; ring.position.set(p.x, TOP + 0.03, p.z); ring.material.opacity = 0.9; ring.scale.setScalar(1); }
});
$("recenterBtn").addEventListener("click", () => { recentering = true; });
el.addEventListener("wheel", (e) => { e.preventDefault(); setZoom(zoom * (e.deltaY > 0 ? 1.08 : 0.93)); }, { passive: false });
const KEYMAP = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyC" && S.mode === "play") { recentering = true; return; }
  if (e.code === "Escape") { speech.stop(); if (S.puzzle) closePuzzle(); else if (S.dialog) closeDialog(); else $("codex").hidden = true; return; }
  if (S.mode !== "play") return;
  if (KEYMAP[e.code]) { P.keys.add(e.code); P.target = null; e.preventDefault(); }
  if ((e.code === "KeyE" || e.code === "Enter") && nearNpc) openDialog(nearNpc);
});
window.addEventListener("keyup", (e) => P.keys.delete(e.code));
$("talkBtn").addEventListener("click", () => { if (nearNpc) openDialog(nearNpc); });
window.addEventListener("resize", () => { renderer.setSize(window.innerWidth, window.innerHeight); frustum(); });

// ---------- Loop ----------
let nearNpc = null, last = performance.now(), T = 0;
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
function movePlayer(dt) {
  let mx = 0, mz = 0;
  if (P.keys.size) {
    [mx, mz] = keyDir(P.keys);
  } else if (P.target) {
    tmp.subVectors(P.target, player.position); tmp.y = 0;
    const d = tmp.length();
    const stopAt = P.talkTo ? 1.3 : 0.08;
    if (d <= stopAt) { P.target = null; if (P.talkTo) { openDialog(P.talkTo); P.talkTo = null; } }
    else { mx = tmp.x / d; mz = tmp.z / d; }
  }
  const len = Math.hypot(mx, mz);
  if (!len) { P.walkT = 0; return false; }
  mx /= len; mz /= len;
  const step = CONFIG.player.speed * dt;
  const nx = player.position.x + mx * step, nz = player.position.z + mz * step;
  let moved = true;
  if (walkable(nx, nz)) player.position.set(nx, TOP, nz);
  else if (walkable(nx, player.position.z)) player.position.x = nx;
  else if (walkable(player.position.x, nz)) player.position.z = nz;
  else { moved = false; P.target = null; }
  const want = Math.atan2(mx, mz);
  let diff = want - player.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  player.rotation.y += diff * Math.min(1, dt * 12);
  if (moved) P.walkT += dt;
  return moved;
}
// Map held keys to world-space movement for the isometric view (screen up = world -x -z).
function keyDir(keys) {
  let sx = 0, sy = 0;
  for (const k of keys) { const v = KEYMAP[k]; if (v) { sx += v[0]; sy += v[1]; } }
  return [(sx + sy) * Math.SQRT1_2, (sy - sx) * Math.SQRT1_2];
}

let firstFrame = true;
function tick() {
  const now = performance.now();
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (SHOT && T > 3) dt = 0;
  T += dt;
  if (S.mode === "play" || S.mode === "dialog" || S.mode === "puzzle") S.elapsed += dt;

  const walking = S.mode === "play" ? movePlayer(dt) : false;
  player.position.y += (groundY(player.position.x, player.position.z) - player.position.y) * Math.min(1, dt * 12);
  player.userData.animate(T, dt, { walking });

  // Camera follows the player.
  camTarget.lerp(player.position, 1 - Math.exp(-dt * CONFIG.camera.follow));
  // Pan offset: eases back while the player walks, or quickly after "recenter".
  if (recentering) { pan.multiplyScalar(Math.exp(-dt * 6)); if (pan.lengthSq() < 0.0004) { pan.set(0, 0, 0); recentering = false; } }
  else if (walking) pan.multiplyScalar(Math.exp(-dt * CONFIG.camera.panReturn));
  const view = tmp2.copy(camTarget).add(pan);
  view.x = Math.min(BOUNDS.maxX, Math.max(BOUNDS.minX, view.x)); view.z = Math.min(BOUNDS.maxZ, Math.max(BOUNDS.minZ, view.z));
  pan.copy(view).sub(camTarget);
  $("recenterBtn").classList.toggle("active", pan.lengthSq() > 4);
  cam.position.copy(view).add(ISO); cam.lookAt(view);
  sun.position.copy(view).add(SUN_OFF); sun.target.position.copy(view);
  if (sky) sky.position.copy(view);

  water.userData.update(T);
  isl.forEach((o) => {
    const near = Math.hypot(o.data.pos[0] - view.x, o.data.pos[1] - view.z) < o.data.radius + zoom * 0.9;
    o.group.userData.update?.(T, dt, near);
    o.npc.userData.animate(T, dt, { wave: nearNpc === o && S.mode === "play" });
    o.marker.position.y = TOP + 2.0 + Math.sin(T * 2 + o.index) * 0.12;
    o.marker.rotation.y = T * 1.5;
  });
  bridges.forEach((b) => {
    if (!b.open || b.t >= 1.0001) return;
    b.t = Math.min(1.0001, b.t + dt * 0.8);
    const planks = b.mesh.userData.planks;
    // Planks rise out of the water one after another.
    planks.forEach((p, i) => {
      const s = Math.min(1, Math.max(0.001, (b.t - (i / planks.length) * 0.7) / 0.3));
      p.scale.setScalar(s); p.position.y = p.userData.y - (1 - s) * 0.8;
    });
  });
  for (let i = 0; i < FF; i++) {
    const [x, y, z, o] = ffSeed[i];
    dummy.position.set(x + Math.sin(T * 0.4 + o) * 1.5, y + Math.sin(T * 0.9 + o * 2) * 0.5, z + Math.cos(T * 0.35 + o) * 1.5);
    dummy.scale.setScalar(0.6 + 0.4 * Math.sin(T * 3 + o * 5)); dummy.updateMatrix(); ffMesh.setMatrixAt(i, dummy.matrix);
  }
  ffMesh.instanceMatrix.needsUpdate = true;
  if (ring.material.opacity > 0) { ring.material.opacity = Math.max(0, ring.material.opacity - dt * 1.6); ring.scale.multiplyScalar(1 + dt * 0.8); }

  // Finale: light the portal.
  if (finaleT >= 0 && gate) {
    finaleT += dt;
    gate.group.userData.portal.material.opacity = Math.min(0.85, finaleT * 0.5);
    gate.group.userData.ring.scale.setScalar(1 + Math.sin(finaleT * 4) * 0.03);
  }

  // Nearby keeper + labels.
  nearNpc = null;
  if (S.mode === "play") {
    for (const o of isl) if (o.npc.position.distanceTo(player.position) < 2.4) { nearNpc = o; break; }
  }
  const tb = $("talkBtn");
  if (nearNpc) {
    tmp.copy(nearNpc.npc.position); tmp.y += 2.6; tmp.project(cam);
    tb.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * window.innerWidth}px, ${(-tmp.y * 0.5 + 0.5) * window.innerHeight}px) translate(-50%, -100%)`;
    tb.hidden = false;
  } else tb.hidden = true;
  for (const o of isl) {
    tmp.set(o.data.pos[0], TOP + 4.6, o.data.pos[1]).project(cam);
    const vis = Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
    o.label.style.display = vis ? "" : "none";
    if (vis) o.label.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * window.innerWidth}px, ${(-tmp.y * 0.5 + 0.5) * window.innerHeight}px) translate(-50%, -50%)`;
  }

  if (post) post.render(); else renderer.render(scene, cam);
  if (firstFrame) {
    firstFrame = false; performance.mark("q:first-frame");
    ready = true; $("startBtn").disabled = false; $("startBtn").classList.remove("loading"); applyLang();
    window.__registerSW?.();
  }
}

// ---------- PWA: install + offline ----------
let installEvt = null;
const standalone = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
function renderInstall() {
  const u = ui();
  $("installBtn").textContent = u.install;
  $("installBtn").hidden = standalone || !installEvt;
  $("installHint").textContent = u.installIos;
  $("installHint").hidden = standalone || !isIos || !!installEvt;
}
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; renderInstall(); });
window.addEventListener("appinstalled", () => { installEvt = null; renderInstall(); toast(ui().installed); });
$("installBtn").addEventListener("click", async () => {
  if (!installEvt) return;
  installEvt.prompt();
  try { await installEvt.userChoice; } catch (e) { /* dismissed */ }
  installEvt = null; renderInstall();
});
// Inside the Android app the files are bundled, so no service worker is needed there.
if ("serviceWorker" in navigator && location.protocol !== "file:" && location.host !== "appassets.androidplatform.net") {
  const hadController = !!navigator.serviceWorker.controller;
  // No version in the URL: the browser re-checks sw.js itself on every visit (updateViaCache "none"
  // skips the HTTP cache for that check), and sw.js serves game files network-first.
  const registerSW = () => navigator.serviceWorker.register("./sw.js", { scope: "./", updateViaCache: "none" }).then((r) => r.update?.()).catch((e) => console.warn("Service worker:", e));
  // Wait until the first frame is on screen, then until the browser is idle.
  window.__registerSW = () => (window.requestIdleCallback || ((f) => setTimeout(f, 1500)))(registerSW, { timeout: 4000 });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) return;
    if (S.mode === "title") location.reload(); else toast(ui().updated);
  });
}

performance.mark("q:world");
applyProgress(false);
applyLang();
if (SHOT) { $("title").hidden = true; $("labels").hidden = false; }
// (compileAsync before the first frame left the scene blank under the post-processing pass, so shaders compile on first render.)
renderer.setAnimationLoop(tick);
window.__quest = { S, isl, player, walkable, openPuzzle, openDialog, backendName };
