// Life Archipelago prototypes: five rendered moments, built on the quest engine (quest/world.js).
// Open with ?shot=map | home | scan | identify | alarm   (add &webgl to force WebGL2).
// These are visual prototypes: data on screen is example data, camera views are 3D stand-ins.
import * as THREE from "three";
import { pass } from "three/tsl";
import { bloom } from "../../quest/vendor/BloomNode.js";
import { CONFIG } from "../../quest/content.js";
import * as W from "../../quest/world.js";

const params = new URLSearchParams(location.search);
const shot = params.get("shot") || "map";
const ui = document.getElementById("ui");
const VW = () => window.innerWidth, VH = () => window.innerHeight;

const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: params.has("webgl") });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(VW(), VH());
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.15;
document.getElementById("stage").append(renderer.domElement);
await renderer.init();

const scene = new THREE.Scene();
let cam = null;
const updaters = [];

// ---------- helpers ----------
const m = (c, o = {}) => W.mat(c, { flatShading: false, roughness: 0.8, ...o });
const glow = (c, i = 1.6) => W.glow(c, i);
function put(mesh, x, y, z, parent) { mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; (parent || scene).add(mesh); return mesh; }
const bx = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof mat === "string" ? m(mat) : mat);
const cy = (rt, rb, h, mat, seg = 24) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof mat === "string" ? m(mat) : mat);
const sp = (r, mat, seg = 20) => new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg / 2)), typeof mat === "string" ? m(mat) : mat);
function prism(w, h, d, mat) {
  const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2);
  return new THREE.Mesh(g, typeof mat === "string" ? m(mat, { flatShading: true }) : mat);
}
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
const texMat = (tex, o = {}) => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, ...o });
function isoCam(target, V) {
  const a = VW() / VH();
  const c = new THREE.OrthographicCamera(-V * a / 2, V * a / 2, V / 2, -V / 2, 0.1, 400);
  c.position.copy(target).add(new THREE.Vector3(1, 1.05, 1).normalize().multiplyScalar(80)); c.lookAt(target);
  return c;
}
function toScreen(v) { const p = v.clone().project(cam); return [(p.x * 0.5 + 0.5) * VW(), (-p.y * 0.5 + 0.5) * VH()]; }
function lights({ hemiSky = "#cfe8ff", hemiGround = "#8a6d4a", hemi = 1.1, sunColor = "#ffe0b0", sun = 3, sunOff = [-10, 18, 14], target = new THREE.Vector3(), size = 16 } = {}) {
  scene.add(new THREE.HemisphereLight(hemiSky, hemiGround, hemi));
  const s = new THREE.DirectionalLight(sunColor, sun);
  s.position.copy(target).add(new THREE.Vector3(...sunOff)); s.target.position.copy(target);
  s.castShadow = true; s.shadow.mapSize.setScalar(2048);
  Object.assign(s.shadow.camera, { left: -size, right: size, top: size, bottom: -size, near: 0.5, far: 120 });
  s.shadow.bias = -0.0004; s.shadow.normalBias = 0.03;
  scene.add(s, s.target);
  return s;
}
function tree(s = 1, leaf = "#5aa252") {
  const t = new THREE.Group();
  put(cy(0.1 * s, 0.16 * s, 1.0 * s, "#7a5232", 8), 0, 0.5 * s, 0, t);
  put(new THREE.Mesh(new THREE.IcosahedronGeometry(0.75 * s, 1), W.mat(leaf)), 0, 1.35 * s, 0, t);
  put(new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 * s, 1), W.mat(new THREE.Color(leaf).offsetHSL(0, 0, 0.07).getStyle())), 0.25 * s, 1.75 * s, 0.15 * s, t);
  return t;
}
function plant(s = 1) {
  const p = new THREE.Group();
  put(cy(0.22 * s, 0.17 * s, 0.4 * s, "#c8734f"), 0, 0.2 * s, 0, p);
  for (let i = 0; i < 6; i++) { const l = sp(0.2 * s, "#4f9a4a", 10); l.scale.set(0.6, 1.4, 0.6); l.rotation.z = Math.cos(i) * 0.5; l.rotation.x = Math.sin(i * 2) * 0.5; put(l, Math.cos(i) * 0.12 * s, 0.6 * s, Math.sin(i) * 0.12 * s, p); }
  return p;
}
function cat(color = "#f0a24a") {
  const c = new THREE.Group();
  const body = sp(0.26, color, 18); body.scale.set(1.5, 0.85, 0.9); put(body, 0, 0.24, 0, c);
  put(sp(0.17, color, 16), 0.36, 0.42, 0, c);
  for (const z of [-0.08, 0.08]) { const e = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.12, 4), m(color)); put(e, 0.38, 0.6, z, c); }
  for (const z of [-0.06, 0.06]) put(sp(0.025, "#1c1c24", 8), 0.5, 0.45, z, c);
  const tail = cy(0.035, 0.035, 0.5, color, 8); tail.rotation.z = 1.1; put(tail, -0.45, 0.35, 0, c);
  return c;
}
function person(colors, opts) { return W.makeCharacter(colors, { scale: 1.15, ...opts }); }
function sky(cfg, at) { const s = W.makeSky(cfg); s.position.copy(at); scene.add(s); }
// A screen-filling gradient quad behind an orthographic scene (a texture background is not drawn here).
function backdrop(top, bottom) {
  const tex = canvasTex(4, 256, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, top); g.addColorStop(1, bottom); x.fillStyle = g; x.fillRect(0, 0, w, h); });
  const w = (cam.right - cam.left) * 1.1, h = (cam.top - cam.bottom) * 1.1;
  const q = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, fog: false, depthWrite: false }));
  const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
  q.position.copy(cam.position).addScaledVector(dir, 380); q.quaternion.copy(cam.quaternion); q.renderOrder = -1;
  scene.add(q); cam.far = 420; cam.updateProjectionMatrix();
}
const icon = {
  bag: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>`,
  mic: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>`,
  cam: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>`,
  back: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg>`,
  heart: `<svg class="icon" viewBox="0 0 24 24" fill="#4ee08a"><path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/></svg>`,
  star: `<svg class="icon" viewBox="0 0 24 24" fill="#ffc94d"><path d="M12 2l3 7 7 .6-5.3 4.6 1.6 7L12 17.6 5.7 21.2l1.6-7L2 9.6 9 9z"/></svg>`,
  brain: `<svg class="icon" viewBox="0 0 24 24" fill="#a98bff"><circle cx="9" cy="10" r="5"/><circle cx="15" cy="10" r="5"/><circle cx="12" cy="15" r="5"/></svg>`,
  bolt: `<svg class="icon" viewBox="0 0 24 24" fill="#ffc94d"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>`,
};
function bar(pct, color) { return `<div class="bar"><i style="width:${pct}%;background:${color}"></i></div>`; }

// ---------- furniture used by the home and alarm scenes ----------
function bed(g, x, z, blanket = "#6c8cd5") {
  put(bx(2.5, 0.35, 1.9, "#8a5a3a"), x, 0.25, z, g);
  put(bx(0.16, 1.15, 1.9, "#7a4a2e"), x - 1.25, 0.6, z, g);
  put(bx(2.35, 0.24, 1.8, "#f7f3ea"), x + 0.02, 0.54, z, g);
  put(bx(1.55, 0.12, 1.84, blanket), x + 0.42, 0.7, z, g);
  for (const dz of [-0.45, 0.45]) { const p = bx(0.55, 0.16, 0.7, "#ffffff"); put(p, x - 0.85, 0.74, z + dz, g); }
}
function nightstand(g, x, z, lampOn = true) {
  put(bx(0.6, 0.6, 0.55, "#a8774c"), x, 0.3, z, g);
  put(cy(0.05, 0.08, 0.32, "#3b2a20", 10), x, 0.76, z, g);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.26, 18, 1, true), lampOn ? glow("#ffd9a0", 1.4) : m("#efe3cc", { side: THREE.DoubleSide }));
  shade.material.side = THREE.DoubleSide; put(shade, x, 1.02, z, g);
  if (lampOn) { const l = new THREE.PointLight("#ffcf8a", 6, 6, 2); l.position.set(x, 1.05, z); g.add(l); }
}
function roomShell(g, { w = 12, d = 9, wallH = 2.6, walls = [] } = {}) {
  put(bx(w + 0.6, 0.5, d + 0.6, "#efe6d6"), 0, -0.25, 0, g);
  const base = bx(w + 1.0, 1.2, d + 1.0, "#7d8b5a"); put(base, 0, -1.1, 0, g);
  for (const wl of walls) put(bx(wl.w, wl.h ?? wallH, wl.d, wl.c), wl.x, (wl.h ?? wallH) / 2, wl.z, g);
}
function floorPatch(g, x, z, w, d, mat) { const f = bx(w, 0.04, d, mat); put(f, x, 0.02, z, g); f.castShadow = false; return f; }
const woodTex = (base, line) => canvasTex(256, 256, (x, w, h) => { x.fillStyle = base; x.fillRect(0, 0, w, h); for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? "rgba(0,0,0,.06)" : "rgba(255,255,255,.05)"; x.fillRect(0, i * 32, w, 32); x.fillStyle = line; x.fillRect(0, i * 32, w, 2); x.fillRect(((i * 97) % 200) + 20, i * 32, 2, 32); } }, [3, 3]);
const tileTex = (base, line, n = 8) => canvasTex(256, 256, (x, w, h) => { x.fillStyle = base; x.fillRect(0, 0, w, h); x.strokeStyle = line; x.lineWidth = 3; for (let i = 0; i <= n; i++) { x.beginPath(); x.moveTo(i * w / n, 0); x.lineTo(i * w / n, h); x.stroke(); x.beginPath(); x.moveTo(0, i * h / n); x.lineTo(w, i * h / n); x.stroke(); } }, [2, 2]);

// =====================================================================
// SHOT 1: the life map in the morning
// =====================================================================
async function shotMap() {
  const cfg = { ...CONFIG, world: { ...CONFIG.world } };
  const S2 = Math.SQRT1_2, at = (s, u) => [(s - u) * S2, (-s - u) * S2];
  const target = new THREE.Vector3(...[at(0, 3)[0], 0, at(0, 3)[1]]);
  scene.background = new THREE.Color(cfg.world.sky); scene.fog = new THREE.Fog(cfg.world.fog.color, 90, 200);
  sky(cfg, target); lights({ target, size: 22 });
  const water = W.makeWater(cfg); water.position.set(target.x, 0, target.z); scene.add(water); updaters.push((t) => water.userData.update(t));
  const isles = [
    { id: "home", name: "Home", pos: at(0, -9), radius: 4.0, theme: { grass: "#86c46e", sand: "#ead6a0", accent: "#ffc94d" } },
    { id: "family", name: "Family", pos: at(-4.2, 0), radius: 3.6, theme: { grass: "#9ccf72", sand: "#ecd9a8", accent: "#ff8fb1" } },
    { id: "paperwork", name: "Paperwork", pos: at(4.2, 1), radius: 3.9, props: "library", theme: { grass: "#8fbf7e", sand: "#e3d1a0", accent: "#7ad1ff" } },
    { id: "work", name: "Work", pos: at(-4, 10), radius: 3.6, theme: { grass: "#93b884", sand: "#e0cfa2", accent: "#b48cff" } },
    { id: "health", name: "Health", pos: at(4, 11), radius: 3.8, theme: { grass: "#7fcf7a", sand: "#e8d6a4", accent: "#4ee08a" } },
  ];
  const G = {};
  for (const d of isles) { const g = W.makeIsland(d, cfg); scene.add(g); G[d.id] = g; updaters.push((t, dt) => g.userData.update(t, dt, true)); }
  const hy = (id, x, z) => G[id].userData.heightAt(x, z);
  // Home: a cosy house, fence, tree, the explorer at the door.
  const house = (wall, roof, s = 1) => {
    const h = new THREE.Group();
    put(bx(2.2 * s, 1.4 * s, 1.8 * s, wall), 0, 0.7 * s, 0, h);
    const r = prism(2.6 * s, 1.0 * s, 2.1 * s, roof); put(r, 0, 1.4 * s, 0, h);
    put(bx(0.42 * s, 0.76 * s, 0.05, "#7a4a2a"), 0.5 * s, 0.38 * s, 0.92 * s, h);
    put(bx(0.44 * s, 0.38 * s, 0.05, glow("#ffd58a", 1.3)), -0.5 * s, 0.86 * s, 0.92 * s, h);
    put(bx(0.05, 0.38 * s, 0.44 * s, glow("#ffd58a", 1.3)), 1.12 * s, 0.86 * s, 0.3 * s, h);
    put(bx(0.26 * s, 0.6 * s, 0.26 * s, "#9a6b55"), -0.62 * s, 2.0 * s, -0.4 * s, h);
    return h;
  };
  const hm = house("#f6ead4", "#d0573f", 1.25); hm.position.set(-0.6, hy("home", -0.6, -0.8), -0.8); hm.rotation.y = 0.15; G.home.add(hm);
  const t1 = tree(1.1); t1.position.set(-2.4, hy("home", -2.4, 1.2), 1.2); G.home.add(t1);
  for (let i = 0; i < 7; i++) put(bx(0.08, 0.42, 0.08, "#f3ead8"), 1.0 + i * 0.32, hy("home", 1.0 + i * 0.32, 1.9) + 0.2, 1.9, G.home);
  put(bx(2.0, 0.06, 0.05, "#f3ead8"), 1.96, hy("home", 1.9, 1.9) + 0.32, 1.9, G.home);
  const me = person(CONFIG.playerLook.colors, { hat: "straw", hair: "#5a3a22", lanternColor: "#ffe08a" }); me.position.set(1.1, hy("home", 1.1, 0.7), 0.7); me.rotation.y = 0.8; G.home.add(me);
  // Family: two small houses, a picnic table and two people.
  const f1 = house("#ffe2d1", "#7d5fd3", 0.75); f1.position.set(-1.1, hy("family", -1.1, -0.9), -0.9); G.family.add(f1);
  const f2 = house("#e2f0ff", "#3e8fb0", 0.65); f2.position.set(1.2, hy("family", 1.2, -1.4), -1.4); f2.rotation.y = -0.4; G.family.add(f2);
  put(bx(1.1, 0.07, 0.6, "#a8774c"), 0.6, hy("family", 0.6, 1.2) + 0.55, 1.2, G.family);
  for (const dz of [-0.5, 0.5]) put(bx(1.1, 0.06, 0.22, "#8a5a3a"), 0.6, hy("family", 0.6, 1.2) + 0.32, 1.2 + dz, G.family);
  const p1 = person(["#e56b8a", "#f1cfae", "#7a3b3b"], { hat: "none", hair: "#c9c2b8" }); p1.position.set(-0.4, hy("family", -0.4, 1.3), 1.3); p1.rotation.y = 0.9; G.family.add(p1);
  const p2 = person(["#3e8fb0", "#e8c39e", "#1f2d4a"], { hat: "cap", hair: "#2b2b2b" }); p2.position.set(1.7, hy("family", 1.7, 0.9), 0.9); p2.rotation.y = -0.2; p2.scale.setScalar(0.85); G.family.add(p2);
  // Work: an office tower with lit floors.
  const tw = new THREE.Group();
  put(bx(1.7, 3.6, 1.7, m("#5d6f8f", { metalness: 0.3, roughness: 0.35 })), 0, 1.8, 0, tw);
  for (let i = 0; i < 6; i++) put(bx(1.72, 0.17, 1.72, glow("#bfe3ff", 0.8)), 0, 0.55 + i * 0.52, 0, tw);
  put(bx(1.5, 1.2, 1.3, "#8090b2"), 1.5, 0.6, 0.6, tw);
  put(cy(0.03, 0.03, 0.8, "#cfd6e6", 6), 0, 4.0, 0, tw);
  put(sp(0.07, glow("#ff6b6b", 2.5), 8), 0, 4.42, 0, tw);
  tw.position.set(-0.4, hy("work", -0.4, -0.6), -0.6); G.work.add(tw);
  const t2 = tree(0.9, "#4f9a6a"); t2.position.set(1.8, hy("work", 1.8, -1.6), -1.6); G.work.add(t2);
  // Health: a gym, a running track and a runner.
  const gym = new THREE.Group();
  put(bx(2.1, 1.1, 1.5, "#eef2f6"), 0, 0.55, 0, gym);
  put(bx(2.3, 0.14, 1.7, "#e0504b"), 0, 1.17, 0, gym);
  const barM = cy(0.05, 0.05, 1.1, "#3a3a3a", 10); barM.rotation.z = Math.PI / 2; put(barM, 0, 1.55, 0, gym);
  for (const dx of [-0.5, 0.5]) { const pl = cy(0.24, 0.24, 0.12, "#2b2b2b", 20); pl.rotation.z = Math.PI / 2; put(pl, dx, 1.55, 0, gym); }
  gym.position.set(-1.0, hy("health", -1.0, -1.2), -1.2); G.health.add(gym);
  const trackGeo = new THREE.RingGeometry(1.0, 1.4, 48); trackGeo.rotateX(-Math.PI / 2);
  const track = new THREE.Mesh(trackGeo, m("#d9654b")); track.receiveShadow = true; track.position.set(1.0, hy("health", 1.0, 1.1) + 0.03, 1.1); G.health.add(track);
  const laneGeo = new THREE.RingGeometry(1.19, 1.22, 48); laneGeo.rotateX(-Math.PI / 2);
  const lane = new THREE.Mesh(laneGeo, m("#ffffff")); lane.position.set(1.0, hy("health", 1.0, 1.1) + 0.04, 1.1); G.health.add(lane);
  const runner = person(["#4ee08a", "#e9c9a8", "#1f2d4a"], { hat: "cap", hair: "#3b2a20" }); runner.position.set(2.2, hy("health", 2.2, 1.1), 1.1); runner.rotation.y = Math.PI; G.health.add(runner);
  updaters.push((t, dt) => runner.userData.animate(t, dt, { walking: true }));
  // Bridges between islands, fully built.
  for (const [a, b] of [["home", "family"], ["home", "paperwork"], ["family", "work"], ["paperwork", "health"]]) {
    const A = isles.find((i) => i.id === a), B = isles.find((i) => i.id === b);
    const br = W.makeBridge(A, B, cfg); br.userData.planks.forEach((p) => { p.scale.setScalar(1); p.position.y = p.userData.y; }); scene.add(br);
  }
  // A couple of soft clouds.
  for (const [x, z, s] of [[-9, 3, 1.3], [7, -6, 1], [-2, -16, 1.1]]) {
    const c = new THREE.Group();
    for (let i = 0; i < 5; i++) put(sp(0.9 * s * (1 - i * 0.08), m("#ffffff", { roughness: 1, transparent: true, opacity: 0.85 }), 16), i * 0.8 * s - 1.6 * s, Math.sin(i) * 0.25, Math.cos(i * 2) * 0.4, c);
    c.position.set(target.x + x, 7, target.z + z); c.traverse((o) => { o.castShadow = false; }); scene.add(c);
  }
  cam = isoCam(target, 32);
  updaters.push((t, dt) => { me.userData.animate(t, dt, {}); p1.userData.animate(t, dt, { wave: true }); p2.userData.animate(t, dt, {}); });
  // ---- overlay ----
  const lbl = (id, name, badge, color) => { const d = isles.find((i) => i.id === id); return { v: new THREE.Vector3(d.pos[0], id === "work" ? 5.2 : 3.4, d.pos[1]), name, badge, color }; };
  const labels = [lbl("home", "Home", "5 tasks", "#ffc94d"), lbl("family", "Family", "call grandma", "#ff8fb1"), lbl("paperwork", "Paperwork", "2 due this week", "#ff6b6b"), lbl("work", "Work", "3 meetings", "#b48cff"), lbl("health", "Health", "gym 18:30", "#4ee08a")];
  return mapHud(labels);
}

function mapHud(labels) {
  return () => {
    ui.innerHTML = `
    <div class="panel" style="position:absolute;top:12px;left:12px;right:12px;padding:12px 14px">
      <div class="row" style="gap:12px">
        <div style="width:50px;height:50px;border-radius:16px;background:linear-gradient(160deg,#ffd76a,#ff9f1c);display:grid;place-items:center;color:#2a1a00;font-weight:800;font-size:20px;box-shadow:0 3px 0 #c27a00">7</div>
        <div style="flex:1;display:grid;gap:5px">
          <div class="row" style="justify-content:space-between"><b style="font-size:15px">Level 7 · Life explorer</b><span class="muted" style="font-size:12px">Thu, 6 Nov</span></div>
          <div class="row" style="gap:6px">${icon.star}<div style="flex:1">${bar(71, "linear-gradient(90deg,#ffd76a,#ff9f1c)")}</div><span class="mono" style="font-size:11px">640/900</span></div>
          <div class="row" style="gap:6px">${icon.heart}<div style="flex:1">${bar(82, "linear-gradient(90deg,#7ff0b0,#2fbf6f)")}</div><span class="mono" style="font-size:11px">HP 82</span>
            ${icon.brain}<div style="width:54px">${bar(55, "linear-gradient(90deg,#c7b6ff,#8a6bff)")}</div></div>
        </div>
      </div>
    </div>
    <div class="row" style="position:absolute;top:108px;left:12px;right:12px;gap:6px">
      <span class="pill" style="flex:1.3"><span class="dot" style="background:#ff6b6b"></span>Pay bill <span style="color:#ffb3b3">Nov 20</span></span>
      <span class="pill" style="flex:1"><span class="dot" style="background:#4ee08a"></span>Gym 18:30</span>
      <span class="pill" style="flex:1.1"><span class="dot" style="background:#ff8fb1"></span>Call grandma</span>
    </div>
    ${labels.map((l) => { const [x, y] = toScreen(l.v); return `<div class="label" style="left:${x}px;top:${y}px"><div class="isl">${l.name}</div><span class="badge" style="background:${l.color};color:#1b2240">${l.badge}</span></div>`; }).join("")}
    <div style="position:absolute;left:12px;right:12px;bottom:16px">
      <div style="display:grid;place-items:center;margin-bottom:-26px;position:relative;z-index:2">
        <div style="width:74px;height:74px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#ffe9a8,#ffb02e 60%,#d27f00);display:grid;place-items:center;color:#2a1a00;box-shadow:0 6px 0 #a86400,0 12px 30px rgba(255,170,40,.45);border:3px solid #fff3cf">
          <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#2a1a00" stroke-width="2" stroke-linejoin="round"><path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>
        </div>
        <span style="position:absolute;top:0;margin-left:52px;background:#ff6b6b;color:#fff;font-weight:800;font-size:11px;border-radius:99px;padding:2px 7px;border:2px solid #fff">4</span>
      </div>
      <div class="panel" style="padding:34px 12px 12px;border-radius:22px">
        <div class="row" style="background:rgba(255,255,255,.08);border:1px solid var(--line);border-radius:14px;padding:11px 12px">
          <span class="muted" style="flex:1;font-size:13.5px">Drop anything into your bag…</span>${icon.mic}${icon.cam}
        </div>
      </div>
    </div>`;
  };
}

// =====================================================================
// SHOT 2: inside Home, a cutaway house with rooms
// =====================================================================
async function shotHome() {
  const target = new THREE.Vector3(0, 0.6, 0);
  lights({ target, size: 12, sunOff: [-6, 14, 9], sun: 2.6, hemi: 1.0 });
  const g = new THREE.Group(); scene.add(g);
  const H = 2.6;
  roomShell(g, { walls: [
    { x: -6.05, z: 2.25, w: 0.2, d: 4.5, c: "#f3e3c9" }, { x: -6.05, z: -2.25, w: 0.2, d: 4.5, c: "#d6e2f5" },
    { x: -3, z: -4.55, w: 6, d: 0.2, c: "#d6e2f5" }, { x: 3, z: -4.55, w: 6, d: 0.2, c: "#d9ead8" },
    { x: 0, z: -3.0, w: 0.16, d: 3.0, c: "#efe6d6", h: 0.55 }, { x: 0, z: 2.6, w: 0.16, d: 3.8, c: "#efe6d6", h: 0.55 },
    { x: -4.0, z: 0, w: 4.0, d: 0.16, c: "#efe6d6", h: 0.55 }, { x: 4.2, z: 0, w: 3.6, d: 0.16, c: "#efe6d6", h: 0.55 },
  ] });
  floorPatch(g, -3, 2.25, 5.9, 4.4, texMat(woodTex("#c89b6d", "rgba(90,55,25,.35)")));
  floorPatch(g, 3, 2.25, 5.9, 4.4, texMat(tileTex("#efe7da", "#d6cbb8")));
  floorPatch(g, -3, -2.25, 5.9, 4.4, m("#d9cbe9", { roughness: 1 }));
  floorPatch(g, 3, -2.25, 5.9, 4.4, texMat(woodTex("#a77b52", "rgba(60,35,15,.35)")));
  // Bedroom (back left)
  bed(g, -4.55, -2.6, "#7b93d8");
  nightstand(g, -5.5, -1.05, true);
  put(bx(1.3, 2.2, 0.6, "#b98f67"), -1.4, 1.1, -4.15, g);
  put(bx(0.02, 2.0, 0.02, "#7a5232"), -1.4, 1.1, -3.84, g);
  put(bx(1.4, 1.0, 0.05, glow("#e9f6ff", 0.9)), -3.6, 1.6, -4.43, g);
  put(cy(1.0, 1.0, 0.03, "#f2e9ff"), -2.8, 0.06, -1.9, g);
  // Office (back right)
  put(bx(2.0, 0.08, 0.9, "#8a5a3a"), 2.6, 0.78, -3.9, g);
  for (const [dx, dz] of [[-0.9, -0.38], [0.9, -0.38], [-0.9, 0.38], [0.9, 0.38]]) put(bx(0.07, 0.76, 0.07, "#5a3a24"), 2.6 + dx, 0.38, -3.9 + dz, g);
  put(bx(0.7, 0.03, 0.48, "#c9ced8"), 2.5, 0.84, -3.8, g);
  const screen = bx(0.7, 0.46, 0.03, glow("#7ad1ff", 1.4)); screen.rotation.x = -0.25; put(screen, 2.5, 1.08, -4.04, g);
  put(cy(0.28, 0.28, 0.08, "#3a3a46"), 2.6, 0.5, -3.1, g); put(bx(0.55, 0.6, 0.08, "#3a3a46"), 2.6, 0.85, -2.82, g); put(cy(0.04, 0.04, 0.46, "#6b6f7a", 8), 2.6, 0.23, -3.1, g);
  put(bx(1.3, 2.1, 0.45, "#c9a77a"), 4.9, 1.05, -4.2, g);
  const bookCols = ["#e56b6f", "#7ad1ff", "#ffd166", "#8fe388", "#b48cff", "#ff9f6b"];
  for (let r = 0; r < 4; r++) for (let i = 0; i < 6; i++) put(bx(0.14, 0.36, 0.32, bookCols[(i + r) % 6]), 4.38 + i * 0.2, 0.32 + r * 0.5, -4.08, g);
  const pl1 = plant(1.1); pl1.position.set(0.9, 0, -3.9); g.add(pl1);
  // Living room (front left)
  put(cy(1.5, 1.5, 0.03, "#e4c8a8"), -3.4, 0.06, 2.3, g);
  put(bx(0.25, 0.9, 1.9, "#2b2b33"), -5.85, 1.35, 2.3, g);
  put(bx(0.04, 0.8, 1.8, glow("#4f8fe0", 1.2)), -5.71, 1.35, 2.3, g);
  put(bx(0.45, 0.42, 1.9, "#7a5232"), -5.7, 0.21, 2.3, g);
  put(bx(1.0, 0.45, 2.7, "#5a8fb8"), -2.0, 0.32, 2.3, g);
  put(bx(0.3, 0.75, 2.7, "#4c7ea6"), -1.55, 0.7, 2.3, g);
  for (const dz of [-1.35, 1.35]) put(bx(1.0, 0.6, 0.25, "#4c7ea6"), -2.0, 0.42, 2.3 + dz, g);
  for (const dz of [-0.6, 0.6]) { const c = bx(0.18, 0.4, 0.5, "#ffd166"); c.rotation.z = 0.2; put(c, -1.75, 0.72, 2.3 + dz, g); }
  put(bx(0.8, 0.08, 1.2, "#a8774c"), -3.6, 0.42, 2.3, g); put(bx(0.7, 0.36, 1.0, "#8a5a3a"), -3.6, 0.2, 2.3, g);
  put(cy(0.12, 0.1, 0.18, "#ffffff"), -3.5, 0.55, 2.0, g);
  const kitty = cat(); kitty.position.set(-3.0, 0.05, 3.6); kitty.rotation.y = -0.7; g.add(kitty);
  const pl2 = plant(1.3); pl2.position.set(-5.4, 0, 4.0); g.add(pl2);
  put(cy(0.03, 0.03, 1.6, "#3b2a20", 8), -5.4, 0.8, 0.7, g);
  const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 0.3, 18, 1, true), glow("#ffe2b0", 1.3)); fl.material.side = THREE.DoubleSide; put(fl, -5.4, 1.65, 0.7, g);
  const flL = new THREE.PointLight("#ffcf8a", 5, 6, 2); flL.position.set(-5.4, 1.6, 0.7); g.add(flL);
  put(bx(0.04, 0.9, 1.3, m("#ffffff")), -5.93, 1.9, 0.9, g); put(bx(0.05, 0.78, 1.18, texMat(canvasTex(128, 96, (x, w, h) => { const gr = x.createLinearGradient(0, 0, w, h); gr.addColorStop(0, "#ffb37a"); gr.addColorStop(1, "#7ad1ff"); x.fillStyle = gr; x.fillRect(0, 0, w, h); x.fillStyle = "#3e8f6a"; x.beginPath(); x.moveTo(0, h); x.lineTo(w * 0.4, h * 0.45); x.lineTo(w, h); x.fill(); }))), -5.9, 1.9, 0.9, g);
  // Kitchen (front right)
  put(bx(3.8, 0.9, 0.75, "#f2f2ee"), 2.4, 0.45, 0.55, g);
  put(bx(3.85, 0.07, 0.8, "#4b4b55"), 2.4, 0.93, 0.55, g);
  put(bx(0.8, 0.02, 0.5, "#1f1f26"), 1.4, 0.97, 0.55, g);
  for (const dx of [-0.2, 0.2]) put(cy(0.12, 0.12, 0.02, glow("#ff6a2b", 0.8)), 1.4 + dx, 0.99, 0.55, g);
  put(bx(0.7, 0.04, 0.45, "#c9d3de"), 3.2, 0.97, 0.55, g);
  put(bx(1.0, 2.1, 0.85, m("#e8edf2", { metalness: 0.4, roughness: 0.3 })), 5.3, 1.05, 0.6, g);
  put(bx(0.04, 0.7, 0.05, "#9aa3ad"), 4.85, 1.3, 1.04, g);
  put(cy(0.75, 0.75, 0.07, "#a8774c", 28), 3.3, 0.78, 3.0, g); put(cy(0.08, 0.12, 0.74, "#7a5232", 10), 3.3, 0.38, 3.0, g);
  for (const a of [0.3, 2.4, 4.3]) { const cx = 3.3 + Math.cos(a) * 1.05, cz = 3.0 + Math.sin(a) * 1.05; put(cy(0.22, 0.22, 0.06, "#e56b6f", 16), cx, 0.48, cz, g); put(cy(0.03, 0.03, 0.46, "#5a3a24", 6), cx, 0.23, cz, g); }
  put(cy(0.2, 0.14, 0.1, "#ffffff", 16), 3.2, 0.86, 2.9, g);
  for (const [dx, c] of [[-0.06, "#ff6b6b"], [0.07, "#ffd166"], [0, "#8fe388"]]) put(sp(0.07, c, 10), 3.2 + dx, 0.95, 2.9 + dx, g);
  const pend = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.25, 20, 1, true), glow("#ffe2b0", 1.2)); pend.material.side = THREE.DoubleSide; put(pend, 3.3, 2.3, 3.0, g);
  const pL = new THREE.PointLight("#ffcf8a", 6, 7, 2); pL.position.set(3.3, 2.1, 3.0); g.add(pL);
  // People: you in the living room, a partner in the kitchen.
  const me = person(CONFIG.playerLook.colors, { hat: "none", hair: "#5a3a22" }); me.position.set(-2.9, 0.05, 1.0); me.rotation.y = 0.6; g.add(me);
  const pa = person(["#e56b8a", "#f1cfae", "#7a3b3b"], { hat: "none", hair: "#3b2a20" }); pa.position.set(2.0, 0.05, 1.6); pa.rotation.y = 0.9; g.add(pa);
  updaters.push((t, dt) => { me.userData.animate(t, dt, { wave: true }); pa.userData.animate(t, dt, {}); });
  cam = isoCam(target, 28.5); backdrop("#9fcff0", "#f6e7d3");
  const tags = [
    { v: new THREE.Vector3(-5.7, 1.85, 2.3), dx: -10, dy: -150, t: "TV", s: "warranty ends Mar 2027" },
    { v: new THREE.Vector3(-3.0, 0.5, 3.6), dx: -30, dy: 64, t: "Luna the cat", s: "vet visit Dec 2" },
    { v: new THREE.Vector3(5.3, 2.1, 0.6), dx: -40, dy: 70, t: "Fridge", s: "water filter due" },
    { v: new THREE.Vector3(2.5, 1.3, -4.0), dx: -150, dy: -112, t: "Laptop", s: "backup quest · weekly" },
    { v: new THREE.Vector3(-4.2, 0.8, -2.6), dx: -40, dy: -150, t: "Bed", s: "sleep 7 h 18 m" },
  ];
  return () => {
    const pts = tags.map((tg) => { const [x, y] = toScreen(tg.v); return { ...tg, x, y }; });
    ui.innerHTML = `
    <div class="row" style="position:absolute;top:14px;left:12px;right:12px;justify-content:space-between">
      <span class="pill">${icon.back} Map · <b>Home</b></span>
      <span class="pill">${icon.star}<span class="xp">Lv 7</span></span>
    </div>
    <div class="panel" style="position:absolute;top:60px;left:12px;padding:10px 14px">
      <b style="font-size:20px">Home</b>
      <div class="muted" style="font-size:12px;margin-top:2px">4 rooms · 26 items · 5 tasks</div>
    </div>
    <svg class="lines">${pts.map((p) => `<line x1="${p.x}" y1="${p.y}" x2="${p.x + p.dx + 10}" y2="${p.y + p.dy + 18}" stroke="#ffffff" stroke-width="2" stroke-dasharray="3 3"/><circle cx="${p.x}" cy="${p.y}" r="5" fill="#ffc94d" stroke="#fff" stroke-width="2"/>`).join("")}</svg>
    ${pts.map((p) => `<div class="tag" style="left:${p.x + p.dx}px;top:${p.y + p.dy}px"><b>${p.t}</b><small>${p.s}</small></div>`).join("")}
    <div class="sheet panel">
      <div class="row" style="gap:6px;overflow:hidden;margin-bottom:12px">
        <span class="chip" style="background:#ffc94d;color:#2a1a00;border-color:#ffe39a">Living room · 9</span><span class="chip">Kitchen · 6</span><span class="chip">Bedroom · 4</span><span class="chip">Office · 7</span>
      </div>
      <div class="row" style="justify-content:space-between;margin-bottom:6px"><b style="font-size:15px">Living room</b><span class="muted" style="font-size:12px">2 open tasks</span></div>
      <div class="field"><span>Fix the floor lamp switch</span><span class="xp">+20 XP</span></div>
      <div class="field"><span>Water the plants</span><span class="muted">every Sun</span></div>
      <div class="row" style="gap:8px;margin-top:10px"><span class="btn primary" style="flex:1">${icon.cam} Scan an item</span><span class="btn" style="flex:1">+ Add task</span></div>
    </div>`;
  };
}

// =====================================================================
// SHOT 3: scanning a bill with the camera
// =====================================================================
async function drawBill(x, w, h) {
  x.fillStyle = "#fbfbf7"; x.fillRect(0, 0, w, h);
  x.fillStyle = "#0f766e"; x.fillRect(0, 0, w, 170);
  x.fillStyle = "#ffffff"; x.beginPath(); x.arc(110, 85, 52, 0, Math.PI * 2); x.fill();
  x.fillStyle = "#0f766e"; x.beginPath(); x.moveTo(118, 45); x.lineTo(88, 92); x.lineTo(110, 92); x.lineTo(100, 128); x.lineTo(134, 76); x.lineTo(112, 76); x.closePath(); x.fill();
  x.fillStyle = "#ffffff"; x.font = "700 56px Rubik"; x.fillText("NorthGrid Energy", 190, 92);
  x.font = "500 30px Rubik"; x.fillText("Electricity bill", 192, 136);
  x.fillStyle = "#1b2240"; x.font = "500 34px Rubik"; x.textAlign = "right"; x.fillText("חשבון חשמל", w - 60, 232); x.textAlign = "left";
  x.font = "500 28px Rubik"; x.fillStyle = "#444b63";
  x.fillText("Account no. 4471-882", 70, 232); x.fillText("Billing period 01.10.2026 – 31.10.2026", 70, 276); x.fillText("Meter 0029-4471", 70, 320);
  x.fillStyle = "#e7ecef"; x.fillRect(60, 370, w - 120, 56);
  x.fillStyle = "#1b2240"; x.font = "700 26px Rubik"; x.fillText("Item", 80, 407); x.fillText("Usage", 520, 407); x.fillText("Amount", 790, 407);
  const rows = [["Peak hours", "212 kWh", "₪148.20"], ["Off-peak hours", "318 kWh", "₪176.70"], ["Fixed charges", "", "₪27.40"], ["VAT 17%", "", "₪60.00"]];
  x.font = "500 27px Rubik"; x.fillStyle = "#333a52";
  rows.forEach((r, i) => { const y = 470 + i * 58; x.fillText(r[0], 80, y); x.fillText(r[1], 520, y); x.fillText(r[2], 790, y); x.fillStyle = "#dfe3e8"; x.fillRect(70, y + 18, w - 140, 2); x.fillStyle = "#333a52"; });
  x.strokeStyle = "#f2b705"; x.lineWidth = 6; x.fillStyle = "#fff7d6"; x.beginPath(); x.roundRect(70, 740, w - 140, 210, 22); x.fill(); x.stroke();
  x.fillStyle = "#1b2240"; x.font = "600 32px Rubik"; x.fillText("Amount due", 110, 806);
  x.font = "800 86px Rubik"; x.fillText("₪412.30", 110, 902);
  x.font = "600 32px Rubik"; x.textAlign = "right"; x.fillText("Pay by", w - 110, 806); x.font = "800 52px Rubik"; x.fillText("20.11.2026", w - 110, 880); x.textAlign = "left";
  x.fillStyle = "#1b2240"; x.font = "700 26px Rubik"; x.fillText("Monthly usage (kWh)", 70, 1030);
  [410, 380, 450, 520, 560, 530].forEach((v, i) => { const bh = v / 3.2; x.fillStyle = i === 5 ? "#0f766e" : "#9fc9c4"; x.fillRect(80 + i * 140, 1230 - bh, 90, bh); });
  for (let i = 0; i < 70; i++) { x.fillStyle = "#1b2240"; const bw = (i * 7) % 3 + 2; x.fillRect(70 + i * 13, 1300, bw * 2, 110); }
}
async function shotScan() {
  await document.fonts.load("800 86px Rubik", "₪412.30"); await document.fonts.load("500 34px Rubik", "חשבון חשמל");
  scene.background = new THREE.Color("#2a2420");
  const target = new THREE.Vector3(0, 0, 0);
  lights({ target, size: 6, sunOff: [-4, 9, 3], sun: 3.2, hemi: 0.9, hemiSky: "#fff4e0", hemiGround: "#6b4a2e" });
  const desk = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), texMat(woodTex("#9c6a43", "rgba(50,25,10,.4)"))); desk.material.map.repeat.set(4, 4); desk.rotation.x = -Math.PI / 2; desk.receiveShadow = true; scene.add(desk);
  const holder = new THREE.Group(); holder.position.set(0.05, 0.012, -0.55); holder.rotation.y = 0.12; scene.add(holder);
  const billTex = canvasTex(1050, 1485, (x, w, h) => drawBill(x, w, h));
  await drawBill(billTex.image.getContext("2d"), 1050, 1485); billTex.needsUpdate = true;
  const doc = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.97), texMat(billTex, { roughness: 0.95 })); doc.rotation.x = -Math.PI / 2; doc.receiveShadow = true; holder.add(doc);
  const mug = new THREE.Group(); put(cy(0.36, 0.32, 0.8, "#e9eef3", 28), 0, 0.4, 0, mug); put(cy(0.31, 0.31, 0.02, "#5a3520", 24), 0, 0.79, 0, mug);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.045, 10, 20), m("#e9eef3")); handle.rotation.y = Math.PI / 2; put(handle, 0, 0.42, 0.38, mug); mug.position.set(1.85, 0, -1.9); scene.add(mug);
  const pen = cy(0.04, 0.04, 1.4, "#1f4fbf", 12); pen.rotation.set(Math.PI / 2, 0, 0.9); put(pen, -1.55, 0.05, 1.05, scene);
  const pl = plant(1.4); pl.position.set(-1.9, 0, -2.4); scene.add(pl);
  put(bx(0.9, 0.06, 0.6, "#d9d9d9"), 1.7, 0.03, 0.9, scene);
  cam = new THREE.PerspectiveCamera(46, VW() / VH(), 0.1, 100); cam.position.set(0.1, 6.3, 1.6); cam.lookAt(0, 0, 0.45);
  const corner = (u, v) => { holder.updateMatrixWorld(true); return doc.localToWorld(new THREE.Vector3((u - 0.5) * 2.1, (0.5 - v) * 2.97, 0)); };
  return () => {
    const q = [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)].map(toScreen);
    const a = [corner(70 / 1050, 740 / 1485), corner(980 / 1050, 740 / 1485), corner(980 / 1050, 950 / 1485), corner(70 / 1050, 950 / 1485)].map(toScreen);
    const br = (p, i) => { const nx = q.at((i + 1) % 4), pv = q.at((i + 3) % 4); const d = (o) => { const L = Math.hypot(o[0] - p[0], o[1] - p[1]); return [(o[0] - p[0]) / L * 22, (o[1] - p[1]) / L * 22]; }; const A = d(nx), B = d(pv); return `M${p[0] + A[0]} ${p[1] + A[1]}L${p[0]} ${p[1]}L${p[0] + B[0]} ${p[1] + B[1]}`; };
    ui.innerHTML = `
    <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 35%,transparent 55%,rgba(0,0,0,.45))"></div>
    <div class="row" style="position:absolute;top:14px;left:12px;right:12px;justify-content:space-between">
      <span class="pill">${icon.back} Scan to <b>Paperwork</b></span><span class="pill" style="color:#5fd4ff">● AUTO</span>
    </div>
    <svg class="lines">
      <polygon points="${q.map((p) => p.join(",")).join(" ")}" fill="rgba(95,212,255,.10)" stroke="#5fd4ff" stroke-width="2"/>
      ${q.map((p, i) => `<path d="${br(p, i)}" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/>`).join("")}
      <polygon points="${a.map((p) => p.join(",")).join(" ")}" fill="rgba(255,201,77,.18)" stroke="#ffc94d" stroke-width="3"/>
    </svg>
    <span class="pill" style="position:absolute;left:${q[3][0]}px;top:${q[3][1] + 10}px;background:#5fd4ff;color:#06263a;border-color:#bdefff">Bill detected · 4 fields read</span>
    <span class="pill" style="position:absolute;left:${a[3][0]}px;top:${a[3][1] + 8}px;white-space:nowrap;background:#ffc94d;color:#2a1a00;border-color:#ffe39a">₪412.30 · due 20 Nov</span>
    <div class="sheet panel">
      <div class="row" style="justify-content:space-between;margin-bottom:4px"><b style="font-size:16px">Electricity bill</b><span class="chip">NorthGrid Energy</span></div>
      <div class="field"><span class="muted">Amount due</span><span>₪412.30</span></div>
      <div class="field"><span class="muted">Pay by</span><span>20 Nov 2026 · in 14 days</span></div>
      <div class="field"><span class="muted">Account</span><span class="mono">4471-882</span></div>
      <div class="field"><span class="muted">Usage vs last month</span><span style="color:#ffb3b3">+6%</span></div>
      <div class="row" style="gap:8px;margin-top:12px"><span class="btn primary" style="flex:1.4">Create quest</span><span class="btn" style="flex:1">File only</span></div>
      <div class="muted" style="font-size:11.5px;margin-top:8px;text-align:center">PDF saved to Paperwork › Bills · <span class="xp">+40 XP</span> when paid</div>
    </div>`;
  };
}

// =====================================================================
// SHOT 4: identifying an item in front of you
// =====================================================================
async function shotIdentify() {
  scene.background = new THREE.Color("#d7dde3");
  const target = new THREE.Vector3(0, 0.8, 0);
  lights({ target, size: 6, sunOff: [5, 7, 6], sun: 2.6, hemi: 1.1, hemiSky: "#f4f7ff", hemiGround: "#9a8f80" });
  const wallTex = tileTex("#f4f1ea", "#d9d3c7", 10); wallTex.repeat.set(3, 2);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(8, 5), texMat(wallTex)); back.position.set(0, 2.5, -0.75); back.receiveShadow = true; scene.add(back);
  const side = new THREE.Mesh(new THREE.PlaneGeometry(6, 5), texMat(wallTex)); side.rotation.y = Math.PI / 2; side.position.set(-1.9, 2.5, 2.2); side.receiveShadow = true; scene.add(side);
  const floorT = tileTex("#a7adb5", "#8d939b", 6); floorT.repeat.set(3, 3);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), texMat(floorT)); floor.rotation.x = -Math.PI / 2; floor.position.z = 2; floor.receiveShadow = true; scene.add(floor);
  // Washing machine.
  const wm = new THREE.Group(); scene.add(wm);
  put(bx(1.2, 1.6, 1.2, m("#f7f8fa", { roughness: 0.35 })), 0, 0.8, 0, wm);
  put(bx(1.2, 0.28, 0.04, "#e6e9ee"), 0, 1.45, 0.61, wm);
  put(bx(0.34, 0.12, 0.02, "#d0d5dc"), -0.36, 1.45, 0.64, wm);
  put(bx(0.26, 0.12, 0.02, glow("#4ce0c8", 1.8)), 0.12, 1.45, 0.64, wm);
  const dial = cy(0.09, 0.09, 0.06, "#c7ccd3", 24); dial.rotation.x = Math.PI / 2; put(dial, 0.42, 1.45, 0.65, wm);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.06, 16, 48), m("#c9ced6", { metalness: 0.8, roughness: 0.25 })); put(ring, 0, 0.72, 0.62, wm);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.36, 48), m("#33495c", { metalness: 0.2, roughness: 0.1, transparent: true, opacity: 0.85 })); put(glass, 0, 0.72, 0.63, wm);
  const drum = new THREE.Mesh(new THREE.CircleGeometry(0.28, 40), m("#6d8296", { roughness: 0.4 })); put(drum, 0, 0.72, 0.615, wm);
  put(bx(0.9, 0.12, 0.7, "#ff9f6b"), 0.05, 1.66, 0, wm); put(bx(0.85, 0.1, 0.65, "#7ad1ff"), 0.0, 1.77, 0.02, wm);
  // Shelf with bottles, a laundry basket.
  put(bx(1.8, 0.06, 0.4, "#b98f67"), 0.2, 2.45, -0.55, scene);
  for (const [x, c, h] of [[-0.4, "#4f8fe0", 0.5], [0.0, "#ff6b8a", 0.4], [0.35, "#8fe388", 0.46], [0.75, "#ffd166", 0.34]]) put(cy(0.12, 0.13, h, c, 16), x, 2.48 + h / 2, -0.55, scene);
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.6, 24, 1, true), m("#d9b98a", { side: THREE.DoubleSide })); put(basket, 1.25, 0.3, 0.7, scene);
  put(sp(0.32, "#ffffff", 14), 1.25, 0.58, 0.7, scene);
  const pl = plant(1.2); pl.position.set(-1.4, 0, 0.6); scene.add(pl);
  cam = new THREE.PerspectiveCamera(46, VW() / VH(), 0.1, 100); cam.position.set(1.1, 1.35, 6.6); cam.lookAt(0.15, 0.35, 0);
  const corners = []; for (const x of [-0.6, 0.6]) for (const y of [0, 1.85]) for (const z of [-0.6, 0.65]) corners.push(new THREE.Vector3(x, y, z));
  return () => {
    const s = corners.map(toScreen), xs = s.map((p) => p[0]), ys = s.map((p) => p[1]);
    const L = Math.min(...xs) - 6, T = Math.min(...ys) - 6, R = Math.max(...xs) + 6, B = Math.max(...ys) + 6;
    const cornerPath = `M${L} ${T + 26}V${T}H${L + 26}M${R - 26} ${T}H${R}V${T + 26}M${R} ${B - 26}V${B}H${R - 26}M${L + 26} ${B}H${L}V${B - 26}`;
    const [bxS, byS] = toScreen(new THREE.Vector3(1.1, 2.7, -0.55));
    const [kx, ky] = toScreen(new THREE.Vector3(1.25, 0.9, 0.7));
    ui.innerHTML = `
    <div class="row" style="position:absolute;top:14px;left:12px;right:12px;justify-content:space-between">
      <span class="pill">${icon.back} Identify · <b>Home › Laundry</b></span><span class="pill">${icon.cam}</span>
    </div>
    <svg class="lines"><rect x="${L}" y="${T}" width="${R - L}" height="${B - T}" rx="14" fill="rgba(255,201,77,.08)" stroke="#ffc94d" stroke-width="2" stroke-dasharray="6 6"/><path d="${cornerPath}" fill="none" stroke="#ffc94d" stroke-width="5" stroke-linecap="round"/></svg>
    <span class="pill" style="position:absolute;left:${L}px;top:${T - 38}px;background:#ffc94d;color:#2a1a00;border-color:#ffe39a">Washing machine · 94%</span>
    <span class="pill" style="position:absolute;left:${Math.min(bxS - 40, VW() - 130)}px;top:${byS + 4}px">Detergent · 3</span>
    <span class="pill" style="position:absolute;left:${kx - 120}px;top:${ky - 70}px">Laundry basket</span>
    <div class="sheet panel">
      <div class="row" style="justify-content:space-between;margin-bottom:4px"><b style="font-size:16px">Washing machine</b><span class="chip">new item</span></div>
      <div class="field"><span class="muted">Place</span><span>Home › Laundry</span></div>
      <div class="field"><span class="muted">Warranty</span><span style="color:#5fd4ff">scan the receipt →</span></div>
      <div class="row" style="gap:6px;flex-wrap:wrap;margin:10px 0 2px"><span class="chip">Yearly service reminder</span><span class="chip">Find the manual</span><span class="chip">Add a note</span></div>
      <div class="row" style="gap:8px;margin-top:10px"><span class="btn primary" style="flex:1.4">Add to Home <span style="opacity:.75">+10 XP</span></span><span class="btn" style="flex:1">Not this</span></div>
    </div>`;
  };
}

// =====================================================================
// SHOT 5: the smart alarm at dawn
// =====================================================================
async function shotAlarm() {
  const target = new THREE.Vector3(-0.2, 0.7, 0);
  scene.add(new THREE.HemisphereLight("#8fa6e8", "#3a2a40", 0.9));
  const dawn = new THREE.DirectionalLight("#ffb98a", 2.4); dawn.position.set(-6, 5, -2); dawn.target.position.copy(target); dawn.castShadow = true; dawn.shadow.mapSize.setScalar(2048);
  Object.assign(dawn.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 0.5, far: 40 }); dawn.shadow.normalBias = 0.03; scene.add(dawn, dawn.target);
  const g = new THREE.Group(); scene.add(g);
  put(bx(6.6, 0.5, 5.1, "#e9dfcf"), 0, -0.25, 0, g);
  floorPatch(g, 0, 0, 6.3, 4.8, m("#cdbbe0", { roughness: 1 }));
  put(bx(0.2, 2.6, 5.1, "#cfd8ef"), -3.3, 1.3, 0, g);
  put(bx(6.6, 2.6, 0.2, "#cfd8ef"), 0, 1.3, -2.55, g);
  const winTex = canvasTex(4, 128, (x, w, h) => { const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#5b6fd6"); gr.addColorStop(0.55, "#ff9fb0"); gr.addColorStop(1, "#ffd28a"); x.fillStyle = gr; x.fillRect(0, 0, w, h); });
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), new THREE.MeshBasicMaterial({ map: winTex })); win.position.set(-3.19, 1.6, 0.1); win.rotation.y = Math.PI / 2; g.add(win);
  put(bx(0.06, 1.3, 0.06, "#ffffff"), -3.17, 1.6, 0.1, g); put(bx(0.06, 0.06, 1.7, "#ffffff"), -3.17, 1.6, 0.1, g);
  bed(g, -1.75, 0.3, "#5b6fd6");
  nightstand(g, -2.7, -1.6, false);
  const phone = bx(0.22, 0.02, 0.4, glow("#ffc94d", 2.2)); put(phone, -2.6, 0.62, -1.55, g);
  const sleeper = person(CONFIG.playerLook.colors, { hat: "none", hair: "#5a3a22" }); sleeper.rotation.set(0, 0, Math.PI / 2); sleeper.position.set(-1.75, 0.72, 0.3); g.add(sleeper);
  put(bx(1.6, 0.16, 1.86, "#5b6fd6"), -1.1, 0.76, 0.3, g);
  put(bx(1.2, 2.0, 0.6, "#b98f67"), 1.6, 1.0, -2.2, g);
  const pl = plant(1.2); pl.position.set(2.6, 0, 1.6); g.add(pl);
  const kitty = cat("#3b3b46"); kitty.position.set(-0.1, 0.72, 1.0); kitty.rotation.y = 2.4; kitty.scale.setScalar(0.9); g.add(kitty);
  cam = isoCam(target, 15); backdrop("#141a3d", "#c97a7a");
  const night = [[0, 0], [12, 2], [30, 3], [80, 2], [105, 1], [125, 2], [150, 3], [195, 2], [225, 1], [250, 2], [280, 3], [300, 2], [335, 1], [360, 2], [395, 1], [425, 2], [450, 1], [463, 0]];
  return () => {
    const W0 = 330, Hc = 92, total = 463, X = (mn) => 12 + (mn / total) * (W0 - 24), Y = (s) => 12 + s * 22;
    const colors = ["#ffc94d", "#ff8fb1", "#7ad1ff", "#5b6fd6"];
    const segs = night.slice(0, -1).map((p, i) => `<rect x="${X(p[0])}" y="${Y(p[1])}" width="${X(night.at(i + 1)[0]) - X(p[0]) + 0.5}" height="14" rx="3" fill="${colors.at(p[1])}"/>`).join("");
    ui.innerHTML = `
    <div style="position:absolute;top:30px;left:0;right:0;text-align:center">
      <div class="muted" style="font-size:13px;letter-spacing:.12em;text-transform:uppercase">Smart alarm · good morning</div>
      <div style="font-size:76px;font-weight:800;line-height:1;margin-top:6px;text-shadow:0 6px 30px rgba(0,0,0,.35)">06:41</div>
      <div style="font-size:13.5px;margin-top:8px">Woke you in light sleep · window 06:30–07:00</div>
    </div>
    <div class="sheet panel">
      <div class="row" style="justify-content:space-between;margin-bottom:8px"><b style="font-size:15px">Last night</b><span class="muted" style="font-size:12px">example night</span></div>
      <svg viewBox="0 0 ${W0} ${Hc + 18}" width="100%" style="display:block">
        <rect x="${X(452)}" y="4" width="${X(463) - X(452) + 6}" height="${Hc - 4}" rx="4" fill="rgba(255,201,77,.18)"/>
        ${segs}
        <text x="12" y="${Hc + 14}" font-size="10.5" fill="#aab3d1">23:00</text><text x="${X(180)}" y="${Hc + 14}" font-size="10.5" fill="#aab3d1">02:00</text><text x="${X(360)}" y="${Hc + 14}" font-size="10.5" fill="#aab3d1">05:00</text><text x="${W0 - 12}" y="${Hc + 14}" font-size="10.5" fill="#ffc94d" text-anchor="end">06:41</text>
      </svg>
      <div class="row" style="gap:10px;font-size:11px;margin:6px 0 10px" ><span class="row" style="gap:4px"><i class="dot" style="background:#ffc94d"></i>Awake</span><span class="row" style="gap:4px"><i class="dot" style="background:#ff8fb1"></i>REM</span><span class="row" style="gap:4px"><i class="dot" style="background:#7ad1ff"></i>Light</span><span class="row" style="gap:4px"><i class="dot" style="background:#5b6fd6"></i>Deep</span></div>
      <div class="row" style="gap:8px">
        <div class="panel" style="flex:1;padding:9px;border-radius:14px;text-align:center"><b style="font-size:17px">7 h 18 m</b><div class="muted" style="font-size:11px">asleep</div></div>
        <div class="panel" style="flex:1;padding:9px;border-radius:14px;text-align:center"><b style="font-size:17px">1 h 32 m</b><div class="muted" style="font-size:11px">deep sleep</div></div>
        <div class="panel" style="flex:1;padding:9px;border-radius:14px;text-align:center"><b style="font-size:17px;color:#4ee08a">+12 HP</b><div class="muted" style="font-size:11px">health</div></div>
      </div>
      <div class="row" style="gap:8px;margin-top:12px"><span class="btn primary" style="flex:1.4">I'm up · <span style="opacity:.8">+5 XP</span></span><span class="btn" style="flex:1">Snooze 9 min</span></div>
    </div>`;
  };
}


// =====================================================================
// SHOT: the life map as a small city (SimCity-style districts on a street grid)
// =====================================================================
async function shotCity() {
  const cfg = { ...CONFIG, world: { ...CONFIG.world } };
  scene.background = new THREE.Color(cfg.world.sky); scene.fog = new THREE.Fog(cfg.world.fog.color, 90, 200);
  const target = new THREE.Vector3(-1.6, 0, -1.6);
  sky(cfg, target); lights({ target, size: 20, sunOff: [-12, 20, 10] });
  const water = W.makeWater(cfg); water.position.set(0, 0, 0); scene.add(water); updaters.push((t) => water.userData.update(t));
  const P = 6, B = 4.5, Y = 0.26; // block pitch, block size, top of the sidewalk
  const cells = [[0, 0, "work"], [1, 0, "health"], [0, 1, "family"], [1, 1, "paperwork"], [2, 1, "shops"], [1, 2, "park"], [2, 2, "home"]];
  const at = (i, j) => [(i - 1) * P, (j - 1) * P];
  const D = {};
  for (const [i, j, id] of cells) {
    const [cx, cz] = at(i, j);
    put(bx(P, 1.6, P, "#c9b48a"), cx, -0.8, cz);                       // earth
    const road = put(bx(P, 0.12, P, "#5f6673"), cx, 0.06, cz); road.castShadow = false;
    put(bx(B, 0.14, B, "#d8d3c6"), cx, 0.19, cz);                     // sidewalk / curb
    for (const [ex, ez, rot] of [[P / 2, 0, 0], [-P / 2, 0, 0], [0, P / 2, 1], [0, -P / 2, 1]])
      for (let k = -2; k <= 2; k++) { const d = bx(rot ? 0.5 : 0.08, 0.02, rot ? 0.08 : 0.5, "#f4f1e6"); d.castShadow = false; put(d, cx + ex + (rot ? k * 1.1 : 0), 0.13, cz + ez + (rot ? 0 : k * 1.1)); }
    const g = new THREE.Group(); g.position.set(cx, Y, cz); scene.add(g); D[id] = g;
  }
  const lawn = (g, c, w = B - 0.3, d = B - 0.3) => { const l = put(bx(w, 0.06, d, c), 0, 0.03, 0, g); l.castShadow = false; return l; };
  const house = (wall, roof, s = 1) => {
    const h = new THREE.Group();
    put(bx(2.2 * s, 1.4 * s, 1.8 * s, wall), 0, 0.7 * s, 0, h);
    put(prism(2.6 * s, 1.0 * s, 2.1 * s, roof), 0, 1.4 * s, 0, h);
    put(bx(0.42 * s, 0.76 * s, 0.05, "#7a4a2a"), 0.5 * s, 0.38 * s, 0.92 * s, h);
    put(bx(0.44 * s, 0.38 * s, 0.05, glow("#ffd58a", 1.3)), -0.5 * s, 0.86 * s, 0.92 * s, h);
    put(bx(0.05, 0.38 * s, 0.44 * s, glow("#ffd58a", 1.3)), 1.12 * s, 0.86 * s, 0.3 * s, h);
    return h;
  };
  const add = (g, o, x, z, ry = 0) => { o.position.set(x, 0.06, z); o.rotation.y = ry; g.add(o); return o; };
  const car = (c) => { const k = new THREE.Group(); put(bx(0.95, 0.28, 0.48, c), 0, 0.26, 0, k); put(bx(0.5, 0.24, 0.42, m("#dfe9f5", { roughness: 0.2, metalness: 0.3 })), -0.05, 0.52, 0, k);
    for (const [x, z] of [[-0.3, -0.24], [0.3, -0.24], [-0.3, 0.24], [0.3, 0.24]]) { const w = cy(0.12, 0.12, 0.08, "#1f1f26", 12); w.rotation.x = Math.PI / 2; put(w, x, 0.12, z, k); } return k; };
  const lamp = (x, z) => { put(cy(0.04, 0.05, 1.5, "#3b4250", 8), x, 0.85, z); put(sp(0.12, glow("#ffe6a8", 2.2), 10), x, 1.65, z); };

  // Work: downtown towers with lit floors.
  const work = D.work; lawn(work, "#c9ccd3");
  for (const [x, z, w, h, c] of [[-0.95, -0.95, 1.6, 6.2, "#5d6f8f"], [1.05, -0.9, 1.4, 4.6, "#6f8fa8"], [-0.95, 1.1, 1.4, 3.4, "#7d8db0"], [1.1, 1.15, 1.2, 2.4, "#8a9bc0"]]) {
    put(bx(w, h, w, m(c, { metalness: 0.35, roughness: 0.3 })), x, h / 2, z, work);
    for (let y = 0.5; y < h - 0.2; y += 0.55) { const b = bx(w + 0.02, 0.14, w + 0.02, glow("#bfe3ff", 0.75)); b.castShadow = false; put(b, x, y, z, work); }
  }
  put(cy(0.03, 0.03, 0.9, "#cfd6e6", 6), -0.95, 6.65, -0.95, work); put(sp(0.08, glow("#ff6b6b", 2.6), 8), -0.95, 7.12, -0.95, work);

  // Health: a park with a gym, a running track and a pond.
  const hl = D.health; lawn(hl, "#7fcf7a");
  const gym = new THREE.Group(); put(bx(1.8, 0.95, 1.3, "#eef2f6"), 0, 0.48, 0, gym); put(bx(2.0, 0.14, 1.5, "#e0504b"), 0, 1.02, 0, gym);
  const barM = cy(0.04, 0.04, 0.9, "#3a3a3a", 10); barM.rotation.z = Math.PI / 2; put(barM, 0, 1.35, 0, gym);
  for (const dx of [-0.4, 0.4]) { const pl = cy(0.2, 0.2, 0.1, "#2b2b2b", 18); pl.rotation.z = Math.PI / 2; put(pl, dx, 1.35, 0, gym); }
  add(hl, gym, -0.95, -1.1);
  const tg = new THREE.RingGeometry(0.7, 1.0, 40); tg.rotateX(-Math.PI / 2); const track = new THREE.Mesh(tg, m("#d9654b")); track.position.set(0.95, 0.07, -0.9); hl.add(track);
  const pond = put(cy(0.95, 0.95, 0.04, m("#5fb7e6", { roughness: 0.15, metalness: 0.2 }), 28), -0.9, 0.08, 1.0, hl); pond.castShadow = false;
  for (const [x, z, s] of [[1.4, 1.3, 0.8], [0.4, 1.6, 0.65], [1.6, 0.3, 0.6]]) add(hl, tree(s), x, z);
  const runner = person(["#4ee08a", "#e9c9a8", "#1f2d4a"], { hat: "cap", hair: "#3b2a20" }); runner.scale.setScalar(0.8); add(hl, runner, 1.9, -0.9, Math.PI);
  updaters.push((t, dt) => runner.userData.animate(t, dt, { walking: true }));

  // Family: the parents' street with a picnic table.
  const fm = D.family; lawn(fm, "#9ccf72");
  add(fm, house("#ffe2d1", "#7d5fd3", 0.62), -1.1, -1.1); add(fm, house("#e2f0ff", "#3e8fb0", 0.58), 1.05, -1.2, -0.2); add(fm, house("#fff3c4", "#e0884b", 0.55), -1.15, 1.05, 0.2);
  put(bx(1.0, 0.06, 0.55, "#a8774c"), 0.95, 0.55, 1.0, fm); for (const dz of [-0.45, 0.45]) put(bx(1.0, 0.05, 0.2, "#8a5a3a"), 0.95, 0.32, 1.0 + dz, fm);
  const p1 = person(["#e56b8a", "#f1cfae", "#7a3b3b"], { hat: "none", hair: "#c9c2b8" }); p1.scale.setScalar(0.85); add(fm, p1, 0.2, 1.4, 0.9);
  const p2 = person(["#3e8fb0", "#e8c39e", "#1f2d4a"], { hat: "cap", hair: "#2b2b2b" }); p2.scale.setScalar(0.75); add(fm, p2, 1.8, 0.6, -0.4);

  // Paperwork: city hall with columns, a dome and a flag, a fountain on the plaza.
  const pw = D.paperwork; lawn(pw, "#e6dfcf");
  const hall = new THREE.Group();
  put(bx(3.0, 0.22, 2.1, "#d9d2c2"), 0, 0.11, 0, hall); put(bx(2.7, 0.14, 1.8, "#e4ddce"), 0, 0.29, 0, hall);
  put(bx(2.5, 1.3, 1.3, "#f2ede2"), 0, 1.0, -0.15, hall);
  for (let k = 0; k < 6; k++) put(cy(0.09, 0.09, 1.25, "#fbf8f1", 12), -1.05 + k * 0.42, 0.98, 0.68, hall);
  put(bx(2.7, 0.16, 1.75, "#e9e3d6"), 0, 1.68, 0, hall);
  put(prism(2.7, 0.5, 0.3, "#f2ede2"), 0, 1.76, 0.72, hall);
  put(cy(0.6, 0.6, 0.35, "#e9e3d6", 24), 0, 1.93, -0.2, hall);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m("#7ad1ff", { metalness: 0.4, roughness: 0.35 })); put(dome, 0, 2.1, -0.2, hall);
  put(cy(0.025, 0.025, 1.1, "#cfd6e6", 6), 0, 3.15, -0.2, hall); put(bx(0.4, 0.24, 0.02, "#ffc94d"), 0.2, 3.55, -0.2, hall);
  add(pw, hall, 0, -0.6);
  put(cy(0.5, 0.55, 0.22, "#d9d2c2", 24), -1.3, 0.11, 1.45, pw); put(cy(0.42, 0.42, 0.03, glow("#9fe3ff", 0.6), 24), -1.3, 0.23, 1.45, pw); put(cy(0.06, 0.08, 0.4, "#d9d2c2", 10), -1.3, 0.4, 1.45, pw);
  put(bx(0.25, 0.45, 0.22, "#e0504b"), 1.6, 0.25, 1.6, pw);

  // Shops: a row with coloured awnings.
  const sh = D.shops; lawn(sh, "#d8d3c6");
  [["#ffd166", "#e0504b"], ["#bfe3ff", "#3e8fb0"], ["#ffd0e0", "#8fbf5a"]].forEach(([wall, aw], k) => {
    const z = -1.4 + k * 1.4; put(bx(1.8, 1.2, 1.2, wall), -0.6, 0.6, z, sh);
    const a = bx(0.5, 0.06, 1.2, aw); a.rotation.z = -0.35; put(a, 0.45, 0.95, z, sh);
    put(bx(0.04, 0.5, 0.8, glow("#fff1c4", 0.9)), 0.31, 0.45, z, sh);
  });
  add(sh, tree(0.6), 1.6, -1.5); add(sh, tree(0.55), 1.6, 1.4);

  // Green: a small park with a playground.
  const pk = D.park; lawn(pk, "#8ccf6e");
  for (const [x, z, s] of [[-1.3, -1.2, 1.0], [1.2, -1.4, 0.8], [-1.4, 1.3, 0.85], [0.3, 0.2, 0.7]]) add(pk, tree(s), x, z);
  put(bx(0.9, 0.06, 0.45, "#e0504b"), 1.2, 0.55, 1.0, pk); put(bx(0.06, 0.6, 0.06, "#3b4250"), 0.8, 0.3, 1.0, pk); put(bx(0.06, 0.6, 0.06, "#3b4250"), 1.6, 0.3, 1.0, pk);

  // Home: your house, garden, fence, a car in the driveway, and you.
  const hm = D.home; lawn(hm, "#86c46e");
  add(hm, house("#f6ead4", "#d0573f", 0.95), -0.7, -0.6, 0.0);
  add(hm, tree(0.9), -1.6, 1.4); for (const [x, z, c] of [[0.2, 1.2, "#ff8fb1"], [0.5, 1.4, "#ffd166"], [0.8, 1.2, "#b48cff"]]) put(sp(0.12, c, 10), x, 0.14, z, hm);
  for (let k = 0; k < 9; k++) put(bx(0.07, 0.36, 0.07, "#f3ead8"), -2.0 + k * 0.5, 0.2, 2.05, hm);
  const drive = put(bx(1.1, 0.03, 2.0, "#b9b3a6"), 1.45, 0.07, 0.6, hm); drive.castShadow = false;
  add(hm, car("#e56b6f"), 1.45, 0.4, Math.PI / 2);
  const me = person(CONFIG.playerLook.colors, { hat: "straw", hair: "#5a3a22", lanternColor: "#ffe08a" }); me.scale.setScalar(0.9); add(hm, me, 0.4, 0.5, 0.8);
  updaters.push((t, dt) => { me.userData.animate(t, dt, { wave: true }); p1.userData.animate(t, dt, { wave: true }); p2.userData.animate(t, dt, {}); });

  // Street life: cars on the roads, street lamps at the corners.
  for (const [x, z, ry, c] of [[3.35, -1.0, Math.PI / 2, "#5fb7e6"], [2.65, 4.4, -Math.PI / 2, "#ffd166"], [-1.0, 2.65, 0, "#8fe388"], [-4.2, -2.65, Math.PI, "#b48cff"], [0.6, -3.35, 0, "#ff9f6b"]]) { const k = car(c); k.position.set(x, 0.12, z); k.rotation.y = ry; scene.add(k); }
  for (const [x, z] of [[2.4, -2.4], [-2.4, 2.4], [2.4, 3.6], [3.6, 2.4], [-3.6, -2.4], [8.4, 3.6]]) lamp(x, z);
  for (const [x, z, s] of [[-9, 3, 1.3], [8, -8, 1], [-3, -15, 1.1]]) {
    const c = new THREE.Group();
    for (let i = 0; i < 5; i++) put(sp(0.9 * s * (1 - i * 0.08), m("#ffffff", { roughness: 1, transparent: true, opacity: 0.85 }), 16), i * 0.8 * s - 1.6 * s, Math.sin(i) * 0.25, Math.cos(i * 2) * 0.4, c);
    c.position.set(x, 9, z); c.traverse((o) => { o.castShadow = false; }); scene.add(c);
  }
  cam = isoCam(target, +(params.get("v") || 35));
  const lbl = (id, name, badge, color, y = 2.6) => { const p = D[id].position; return { v: new THREE.Vector3(p.x, y, p.z), name, badge, color }; };
  return mapHud([lbl("work", "Work", "3 meetings", "#b48cff", 7.6), lbl("health", "Health", "gym 18:30", "#4ee08a", 2.6), lbl("family", "Family", "call grandma", "#ff8fb1", 2.4), lbl("paperwork", "Paperwork", "2 due this week", "#ff6b6b", 3.6), lbl("home", "Home", "5 tasks", "#ffc94d", 2.6)]);
}

// ---------- run ----------
const build = { map: shotMap, city: shotCity, home: shotHome, scan: shotScan, identify: shotIdentify, alarm: shotAlarm }[shot] || shotMap;
const drawUI = await build();
const post = new THREE.PostProcessing(renderer);
const sp0 = pass(scene, cam), col = sp0.getTextureNode("output");
post.outputNode = col.add(bloom(col, 0.45, 0.35, 0.85));
let T = 0, last = performance.now(), frames = 0;
renderer.setAnimationLoop(() => {
  const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; T += dt;
  updaters.forEach((u) => u(T, dt));
  post.render();
  if (++frames === 3) drawUI();
  if (frames === 30) window.__ready = true;
});
window.addEventListener("resize", () => location.reload());
