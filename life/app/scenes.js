// 3D scenes for the app: the life map and the inside of Home. Built on the quest engine.
// Shared by the web app and the Android app (which loads these same files in its WebView).
import * as THREE from "three";
import { CONFIG } from "../../quest/content.js";
import * as W from "../../quest/world.js";

const VW = () => window.innerWidth, VH = () => window.innerHeight;
let scene = null, cam = null, updaters = [];

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


function buildMapInto() {
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
  cam.userData.V = 32; cam.userData.target = target.clone();
  updaters.push((t, dt) => { me.userData.animate(t, dt, {}); p1.userData.animate(t, dt, { wave: true }); p2.userData.animate(t, dt, {}); });
  return { isles, G, target };
}

function buildHomeInto() {
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
  cam.userData.V = 28.5; cam.userData.target = target.clone();
  const rooms = {
    living: new THREE.Vector3(-3, 1.4, 2.25), kitchen: new THREE.Vector3(3, 1.4, 2.25),
    bedroom: new THREE.Vector3(-3, 2.2, -2.25), office: new THREE.Vector3(3, 2.2, -2.25),
  };
  return { rooms, target };
}

function wrap(build) {
  scene = new THREE.Scene(); cam = null; updaters = [];
  const info = build();
  const out = { scene, cam, updaters, ...info };
  scene = null; cam = null;
  return out;
}
export const buildMap = () => wrap(buildMapInto);
export const buildHome = () => wrap(buildHomeInto);
export function fitCamera(c) {
  const a = VW() / VH(), V = c.userData.V;
  c.left = -V * a / 2; c.right = V * a / 2; c.top = V / 2; c.bottom = -V / 2; c.updateProjectionMatrix();
}
export function projectTo(c, v) { const p = v.clone().project(c); return [(p.x * 0.5 + 0.5) * VW(), (-p.y * 0.5 + 0.5) * VH(), p.z]; }
