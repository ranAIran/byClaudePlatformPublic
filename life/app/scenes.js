// 3D scenes for the app: the life map and the inside of Home. Built on the quest engine.
// Shared by the web app and the Android app (which loads these same files in its WebView).
import * as THREE from "three";
import { CONFIG } from "../../quest/content.js";
import * as W from "../../quest/world.js";
import { ISO, orbitOffset } from "./core/orbit.js";

const VW = () => window.innerWidth, VH = () => window.innerHeight;
let scene = null, cam = null, updaters = [];
// R39 · graphics quality for the city: "enhanced" on computers (drawn surfaces with relief, lamps that
// light the street, sharper shadows, glossier water), "light" everywhere else.
let QUALITY = "light";
const HQ = () => QUALITY === "enhanced";
// A surface drawn on a canvas: grey-ish colour (tinted by the material colour) and a relief map.
const surfCache = new Map();
function surface(kind, tint, repeat = [1, 1], { rough = 0.9, bump = 2 } = {}) {
  if (!surfCache.has(kind)) {
    const rr = W.rng(kind.length * 7 + 3), draw = (relief) => canvasTex(256, 256, (x) => SURF_DRAW[kind](x, relief, rr));
    const map = draw(false), bm = draw(true); bm.colorSpace = THREE.NoColorSpace;
    surfCache.set(kind, { map, bm });
  }
  const { map, bm } = surfCache.get(kind), mapR = map.clone(), bmR = bm.clone();
  for (const t of [mapR, bmR]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); t.needsUpdate = true; }
  return new THREE.MeshStandardMaterial({ color: tint, map: mapR, bumpMap: bmR, bumpScale: bump, roughness: rough });
}
const speck = (x, n, a, rr, light = true) => { for (let i = 0; i < n; i++) { const v = light && rr() < 0.5 ? 255 : 0; x.fillStyle = `rgba(${v},${v},${v},${a * rr()})`; x.fillRect(rr() * 256, rr() * 256, 1 + rr() * 2.5, 1 + rr() * 2.5); } };
const SURF_DRAW = {
  asphalt: (x, relief, rr) => { x.fillStyle = relief ? "#777" : "#c8c8c8"; x.fillRect(0, 0, 256, 256); speck(x, 3200, relief ? 0.55 : 0.25, rr); for (let i = 0; i < 5; i++) { x.strokeStyle = relief ? "#333" : "rgba(60,60,60,.35)"; x.lineWidth = 1.2; x.beginPath(); let px = rr() * 256, py = rr() * 256; x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += (rr() - 0.5) * 40; py += (rr() - 0.5) * 40; x.lineTo(px, py); } x.stroke(); } },
  paving: (x, relief, rr) => { x.fillStyle = relief ? "#222" : "#a8a8a8"; x.fillRect(0, 0, 256, 256); for (let j = 0; j < 8; j++) for (let i = -1; i < 5; i++) { const v = rr(), bx0 = i * 64 + (j % 2) * 32; x.fillStyle = relief ? `rgb(${200 + v * 50},${200 + v * 50},${200 + v * 50})` : `rgb(${226 + v * 24},${222 + v * 24},${214 + v * 24})`; x.fillRect(bx0 + 2, j * 32 + 2, 60, 28); } speck(x, 600, relief ? 0.25 : 0.1, rr); },
  grass: (x, relief, rr) => { x.fillStyle = relief ? "#777" : "#d8d8d8"; x.fillRect(0, 0, 256, 256); for (let i = 0; i < 2800; i++) { const v = rr(); x.fillStyle = relief ? `rgba(255,255,255,${v * 0.55})` : `rgba(${150 + v * 105},${170 + v * 85},${130 + v * 80},.85)`; x.fillRect(rr() * 256, rr() * 256, 1.5, 3 + v * 5); } },
  stone: (x, relief, rr) => { x.fillStyle = relief ? "#111" : "#9a9a9a"; x.fillRect(0, 0, 256, 256); for (let j = 0; j < 6; j++) { let px = -(rr() * 40); while (px < 256) { const w = 34 + rr() * 44, v = rr(); x.fillStyle = relief ? `rgb(${190 + v * 60},${190 + v * 60},${190 + v * 60})` : `rgb(${215 + v * 40},${212 + v * 40},${205 + v * 40})`; x.fillRect(px + 2, j * 42.6 + 2, w - 4, 38.6); px += w; } } speck(x, 900, relief ? 0.3 : 0.12, rr); },
};

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
// A perspective camera that orbits the point it looks at (R29, R30). The app turns, tilts and
// zooms it; `limits` says how far (the house has only two walls, so it turns less than the city).
function viewCam(target, { dist, fov = 30, yaw = ISO.yaw, pitch = ISO.pitch, limits = {} }) {
  const c = new THREE.PerspectiveCamera(fov, VW() / VH(), 0.3, 1200);
  c.userData = { target: target.clone(), dist, yaw, pitch, fov, fit: 1, limits: { pitch: [0.1, 1.4], zoom: [0.6, 3], ...limits } };
  const o = orbitOffset(yaw, pitch, dist); c.position.set(target.x + o[0], target.y + o[1], target.z + o[2]); c.lookAt(target);
  return c;
}
// Sky all around, from the horizon colour (the same as the fog, so the far sea melts into it) up to dusk blue.
function skyDome(top, horizon, at) {
  const s = W.makeSky({ world: { skyGradient: { top, mid: horizon, horizon } } }); s.scale.setScalar(2.4); s.position.copy(at); scene.add(s);
}
function lights({ hemiSky = "#cfe8ff", hemiGround = "#8a6d4a", hemi = 1.1, sunColor = "#ffe0b0", sun = 3, sunOff = [-10, 18, 14], target = new THREE.Vector3(), size = 16 } = {}) {
  scene.add(new THREE.HemisphereLight(hemiSky, hemiGround, hemi));
  const s = new THREE.DirectionalLight(sunColor, sun);
  s.position.copy(target).add(new THREE.Vector3(...sunOff)); s.target.position.copy(target);
  s.castShadow = true; s.shadow.mapSize.setScalar(HQ() ? 4096 : 2048);
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
function person(colors, opts) { const p = W.makeCharacter(colors, { scale: 1.15, ...opts }); p.userData.live = true; return p; }
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
// Real-world size to scene units (the bed scale: 1 unit ≈ 80 cm).
export const cm = (v) => v / 80;
// A glass terrarium of outer size w×h×d (scene units) standing at floor height y, front facing +z.
function terrarium(g, x, y, z, w, h, d, o = {}) {
  const t = new THREE.Group(); t.position.set(x, y, z); g.add(t); t.userData.size = { w, h, d }; t.name = "terrarium";
  const frame = "#16181d", f = 0.025;
  put(bx(w, f, d, frame), 0, f / 2, 0, t); put(bx(w, f * 1.6, d, frame), 0, h - f * 0.8, 0, t);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(bx(f, h, f, frame), sx * (w - f) / 2, h / 2, sz * (d - f) / 2, t);
  const glass = new THREE.MeshStandardMaterial({ color: "#d8f1ff", transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.1, depthWrite: false });
  const panes = [[w, h, 0.01, 0, (d - 0.01) / 2], [0.01, h, d, (w - 0.01) / 2, 0], [0.01, h, d, -(w - 0.01) / 2, 0]];
  for (const [pw, ph, pd, px, pz] of panes) { const p = bx(pw, ph - 0.02, pd, glass); p.position.set(px, h / 2, pz); p.renderOrder = 2; t.add(p); }
  put(bx(w - 0.04, 0.003, d - 0.04, frame), 0, h * 0.995, 0, t);
  put(bx(w - 0.05, h * 0.18, d - 0.05, o.sub || "#8a6440"), 0, f + h * 0.09, 0, t);
  put(bx(w - 0.05, h * 0.75, 0.01, m("#7fb77e", { emissive: "#2f5a33", emissiveIntensity: 0.6 })), 0, h * 0.45, -(d - 0.06) / 2, t);
  const top = f + h * 0.18;
  if (o.rock) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.11, 0), m("#8b8f96", { flatShading: true })); r.scale.set(1.4, 0.7, 1); put(r, w * 0.2, top + 0.05, 0.02, t); }
  if (o.cactus) { put(cy(0.05, 0.06, h * 0.45, o.plant), -w * 0.18, top + h * 0.22, -0.04, t); put(cy(0.03, 0.03, h * 0.18, o.plant), -w * 0.18 + 0.07, top + h * 0.28, -0.04, t); put(sp(0.06, "#d8c08f", 8), w * 0.22, top + 0.03, 0.06, t); }
  else for (let i = 0; i < 5; i++) { const l = sp(0.09, o.plant || "#4fa35a", 10); l.scale.set(0.6, 1.6, 0.6); l.rotation.z = Math.cos(i * 1.7) * 0.6; put(l, -w * 0.2 + Math.cos(i) * 0.06, top + 0.13, -0.05 + Math.sin(i) * 0.06, t); }
  if (o.lizard) { const lz = lizard(); lz.position.set(-0.04, top, 0.08); lz.rotation.y = -0.5; t.add(lz); }
  put(bx(w * 0.7, 0.03, 0.07, glow("#fff1c4", 1.6)), 0, h + 0.01, -d * 0.15, t);
  return t;
}
// A small spotted gecko, about 22 cm nose to tail, facing +x. Its head looks around and its tail sways.
function lizard(skin = "#e8c25a", spot = "#5a4632") {
  const L = cm(22), g = new THREE.Group(); g.name = "lizard"; g.userData.length = L;
  const body = sp(L * 0.16, skin, 14); body.scale.set(2.0, 0.7, 1.0); put(body, 0, L * 0.12, 0, g);
  const head = new THREE.Group(); head.position.set(L * 0.36, L * 0.14, 0); g.add(head);
  const skull = sp(L * 0.11, skin, 12); skull.scale.set(1.5, 0.8, 1.05); put(skull, L * 0.05, 0, 0, head);
  for (const s of [-1, 1]) put(sp(L * 0.03, "#15161a", 8), L * 0.08, L * 0.035, s * L * 0.09, head);
  const tail = new THREE.Group(); tail.position.set(-L * 0.3, L * 0.1, 0); g.add(tail);
  const tc = new THREE.Mesh(new THREE.ConeGeometry(L * 0.09, L * 0.55, 10), m(skin)); tc.rotation.z = Math.PI / 2; put(tc, -L * 0.27, 0, 0, tail);
  for (const [lx, lz] of [[0.2, 1], [0.2, -1], [-0.18, 1], [-0.18, -1]]) { const leg = cy(L * 0.025, L * 0.025, L * 0.16, skin, 6); leg.rotation.x = lz * 1.0; put(leg, lx * L, L * 0.06, lz * L * 0.15, g); }
  for (const [sx, sz] of [[0.1, 0.05], [-0.05, -0.06], [-0.18, 0.04], [0.22, -0.03]]) put(sp(L * 0.035, spot, 6), sx * L, L * 0.21, sz * L, g);
  updaters.push((t) => { head.rotation.y = Math.sin(t * 0.6) * 0.45 * (Math.sin(t * 0.17) > 0 ? 1 : 0.2); tail.rotation.y = Math.sin(t * 1.3) * 0.25; });
  return g;
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


// ---------- the life map: a small city at golden hour (R18, R27, R28) ----------
const WARM = "#ffd08a";
const tint = (hex, amt) => { const c = new THREE.Color(hex), h = {}; c.getHSL(h); c.setHSL(h.h, h.s, Math.max(0, Math.min(1, h.l + amt))); return "#" + c.getHexString(); };

// Merge the plain static meshes under g into a few big ones: one per material kind, with the colours
// kept per vertex. A district is a few hundred small boxes, and drawing each one separately (twice,
// with shadows) is slow on phones. Anything under a group marked userData.live is left alone.
const bakedMats = new Map();
function bake(g) {
  g.updateMatrixWorld(true);
  const inv = g.matrixWorld.clone().invert(), buckets = new Map(), used = [];
  const live = (o) => { for (let p = o; p && p !== g; p = p.parent) if (p.userData.live) return true; return false; };
  g.traverse((o) => {
    const mt = o.material;
    if (!o.isMesh || o.children.length || live(o) || !mt.isMeshStandardMaterial || mt.map || mt.transparent || mt.side !== THREE.FrontSide) return;
    const lit = mt.emissiveIntensity > 0 && mt.emissive.getHex() !== 0;
    const key = lit ? mt.uuid : `${mt.flatShading}|${mt.roughness}|${mt.metalness}`;
    if (!buckets.has(key)) buckets.set(key, { key, mt, lit, pos: [], nor: [], col: [] });
    const b = buckets.get(key), geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    b.pos.push(geo.attributes.position.array); b.nor.push(geo.attributes.normal.array);
    const c = mt.color, n = geo.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    b.col.push(arr); geo.dispose(); used.push(o);
  });
  for (const o of used) { o.parent.remove(o); o.geometry.dispose(); }
  const cat = (list) => { const out = new Float32Array(list.reduce((s, a) => s + a.length, 0)); let k = 0; for (const a of list) { out.set(a, k); k += a.length; } return out; };
  for (const b of buckets.values()) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(cat(b.pos), 3)); geo.setAttribute("normal", new THREE.BufferAttribute(cat(b.nor), 3));
    let mat = b.mt;
    if (!b.lit) {
      geo.setAttribute("color", new THREE.BufferAttribute(cat(b.col), 3));
      if (!bakedMats.has(b.key)) bakedMats.set(b.key, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: b.mt.flatShading, roughness: b.mt.roughness, metalness: b.mt.metalness }));
      mat = bakedMats.get(b.key);
    }
    const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = !b.lit; mesh.receiveShadow = true; g.add(mesh);
  }
}

// A tower face: a grid of windows, some lit. One texture for colour and one for the glow.
function facade(cols, rows, base, seed, share = 0.45) {
  const r = W.rng(seed), cw = 16, ch = 20, w = cols * cw, h = rows * ch, lit = [];
  for (let i = 0; i < cols * rows; i++) lit.push(r() < share);
  const draw = (glowMap) => canvasTex(w, h, (x) => {
    x.fillStyle = glowMap ? "#000" : base; x.fillRect(0, 0, w, h);
    if (!glowMap) { x.fillStyle = "rgba(255,255,255,.10)"; for (let j = 0; j < rows; j++) x.fillRect(0, j * ch, w, 2); }
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const on = lit[j * cols + i];
      x.fillStyle = glowMap ? (on ? "#fff" : "#000") : (on ? "#ffe2ad" : "rgba(20,28,52,.55)");
      x.fillRect(i * cw + 3, j * ch + 5, cw - 6, ch - 9);
    }
  });
  return new THREE.MeshStandardMaterial({ map: draw(false), emissiveMap: draw(true), emissive: new THREE.Color("#ffc170"), emissiveIntensity: 1.5, roughness: 0.45, metalness: 0.2 });
}

function buildMapInto() {
  const cfg = { ...CONFIG, world: { ...CONFIG.world, water: { ...CONFIG.world.water, color: "#46a9b8" } } };
  const target = new THREE.Vector3(-3.2, 0.6, -3.2);
  const HAZE = "#f9c9a0";
  scene.background = new THREE.Color(HAZE); scene.fog = new THREE.Fog(HAZE, 80, 240);
  // Low warm sun from the left, cool sky fill: long shadows to the right, sunlit left faces.
  lights({ target, size: 21, sunOff: [-32, 17, 12], sunColor: "#ffb066", sun: 4.0, hemiSky: "#c6ceff", hemiGround: "#e6a878", hemi: 1.2 });
  const water = W.makeWater(cfg); scene.add(water); updaters.push((t) => water.userData.update(t));
  if (HQ()) water.material = new THREE.MeshStandardMaterial({ color: cfg.world.water.color, roughness: 0.32, metalness: 0.18, flatShading: false });
  // The world out to the horizon (R30): sky, a low sun, open sea, and hills that fade into the haze.
  skyDome("#6f80c8", HAZE, new THREE.Vector3());
  const farSea = cy(460, 460, 0.02, m(cfg.world.water.color, { roughness: 0.3, metalness: 0.15 }), 48); farSea.position.y = -0.14; scene.add(farSea);
  const sunBall = sp(22, new THREE.MeshStandardMaterial({ color: "#000000", emissive: new THREE.Color("#ffd88a"), emissiveIntensity: 5, fog: false }), 24);
  sunBall.position.copy(new THREE.Vector3(-32, 17, 12).normalize().multiplyScalar(340)); scene.add(sunBall);
  {
    const hills = new THREE.Group(), hr = W.rng(7);
    for (let k = 0; k < 12; k++) { const a = (k / 12) * 6.283 + hr() * 0.3, d = 118 + hr() * 34, r = 16 + hr() * 18, h = 5 + hr() * 11; put(new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), W.mat(k % 2 ? "#8f86b8" : "#a58fb4")), Math.cos(a) * d, h / 2 - 0.3, Math.sin(a) * d, hills); }
    scene.add(hills); bake(hills); hills.children.forEach((o) => { o.castShadow = false; });
  }

  // ----- ground: blocks on a street grid, roads between them, a quay around the outside -----
  const P = 7.5, B = 4.6, Y = 0.26, SW = B + 1.2; // street grid pitch, block, sidewalk (wider streets since 0.3.2)
  const CELLS = [[2, 2, "home"], [0, 1, "family"], [1, 1, "paperwork"], [0, 0, "work"], [1, 0, "health"], [2, 1, "shops"], [1, 2, "park"]];
  const has = (i, j) => CELLS.some((c) => c[0] === i && c[1] === j);
  const at = (i, j) => [(i - 1) * P, (j - 1) * P];
  const ground = new THREE.Group(); scene.add(ground);
  const G = {};
  for (const [i, j, id] of CELLS) {
    const [cx, cz] = at(i, j);
    put(bx(P, 1.5, P, "#b0926f"), cx, -0.75, cz, ground);
    put(bx(P, 0.12, P, HQ() ? surface("asphalt", "#5c5e6e", [3, 3], { rough: 0.85, bump: 1.2 }) : "#5c5e6e"), cx, 0.06, cz, ground);
    put(bx(SW + 0.12, 0.1, SW + 0.12, "#a9a296"), cx, 0.15, cz, ground);
    put(bx(SW, 0.12, SW, HQ() ? surface("paving", "#e6cfae", [4, 4], { bump: 2.4 }) : "#dcc5a6"), cx, 0.17, cz, ground);
    put(bx(B, 0.14, B, "#e4d9c8"), cx, 0.19, cz, ground);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ex = cx + (di * P) / 2, ez = cz + (dj * P) / 2;
      if (!has(i + di, j + dj)) { put(bx(di ? 0.24 : P, 0.36, di ? P : 0.24, "#cfc4b2"), cx + di * (P / 2 - 0.12), 0.18, cz + dj * (P / 2 - 0.12), ground); continue; }
      if (di < 0 || dj < 0) continue; // each shared road is drawn once
      for (const k of [-2.8, -2.0, 2.0, 2.8]) put(bx(di ? 0.07 : 0.45, 0.02, di ? 0.45 : 0.07, "#f2e8d2"), ex + (di ? 0 : k), 0.125, ez + (di ? k : 0), ground);
      for (let s = -2; s <= 2; s++) put(bx(di ? 0.16 : 1.4, 0.02, di ? 1.4 : 0.16, "#f2e8d2"), ex + (di ? s * 0.28 : 0), 0.125, ez + (di ? 0 : s * 0.28), ground);
    }
    const g = new THREE.Group(); g.position.set(cx, Y, cz); scene.add(g); G[id] = g; g.userData.district = id;
  }

  // ----- reusable pieces -----
  // On grass-coloured lawns the enhanced look draws grass; on light ones (plazas) it draws stone.
  const lawn = (g, c, w = B - 0.3, d = B - 0.3, x = 0, z = 0) => {
    if (!HQ()) return put(bx(w, 0.06, d, c), x, 0.03, z, g);
    const green = new THREE.Color(c).getHSL({}).h > 0.18 && new THREE.Color(c).getHSL({}).h < 0.45;
    return put(bx(w, 0.06, d, green ? surface("grass", c, [3, 3], { rough: 1, bump: 1.6 }) : surface("stone", c, [3, 3], { bump: 2 })), x, 0.03, z, g);
  };
  const add = (g, o, x, z, ry = 0, y = 0.06) => { o.position.set(x, y, z); o.rotation.y = ry; g.add(o); return o; };
  const LEAVES = ["#5aa252", "#6fae4e", "#e2a03a", "#d9772b", "#4f9a6a"];
  const pine = (s = 1, c = "#3f7d5a") => { const t = new THREE.Group(); put(cy(0.07 * s, 0.1 * s, 0.4 * s, "#6b4a2e", 6), 0, 0.2 * s, 0, t); for (let k = 0; k < 3; k++) put(new THREE.Mesh(new THREE.ConeGeometry((0.5 - k * 0.12) * s, 0.7 * s, 7), W.mat(tint(c, k * 0.04))), 0, (0.65 + k * 0.42) * s, 0, t); return t; };
  const bench = () => { const b = new THREE.Group(); put(bx(0.8, 0.06, 0.26, "#9b6b43"), 0, 0.3, 0, b); put(bx(0.8, 0.3, 0.05, "#9b6b43"), 0, 0.5, -0.12, b); for (const x of [-0.32, 0.32]) put(bx(0.06, 0.3, 0.22, "#3b4250"), x, 0.15, 0, b); return b; };
  const lampPost = (bulb) => { const l = new THREE.Group(); put(cy(0.035, 0.05, 1.5, "#3b4250", 8), 0, 0.75, 0, l); put(bx(0.36, 0.04, 0.04, "#3b4250"), 0.16, 1.5, 0, l); put(sp(0.11, bulb, 10), 0.32, 1.43, 0, l); return l; };
  const flowerBed = (g, x, z, r = 0.4, seed = 1) => {
    const rr = W.rng(seed), cols = ["#ff8fb1", "#ffd166", "#ff9f6b", "#fff3e0", "#c8a2ff"];
    const mound = sp(r, "#5f9f52", 10); mound.scale.y = 0.3; put(mound, x, 0.06, z, g);
    for (let k = 0; k < Math.round(r * 16); k++) { const a = rr() * 6.28, d = rr() * r * 0.8; put(sp(0.07, cols[k % cols.length], 8), x + Math.cos(a) * d, 0.15 + (1 - d / r) * r * 0.2, z + Math.sin(a) * d, g); }
  };
  const hedge = (g, x, z, w, d = 0.25) => put(bx(w, 0.3, d, "#4f8f4a"), x, 0.21, z, g);
  // A house: gable to the front (+z, the sunlit side), door and warm windows, chimney.
  const house = (wall, roof, s = 1, { porch = false } = {}) => {
    const h = new THREE.Group(), trim = tint(wall, -0.14);
    put(bx(2.26 * s, 0.14 * s, 1.86 * s, trim), 0, 0.07 * s, 0, h);
    put(bx(2.2 * s, 1.3 * s, 1.8 * s, wall), 0, 0.65 * s, 0, h);
    put(prism(2.2 * s, 0.86 * s, 1.8 * s, wall), 0, 1.3 * s, 0, h);
    for (const sx of [-1, 1]) { const sl = bx(1.52 * s, 0.07 * s, 2.1 * s, roof); sl.rotation.z = -sx * 0.664; put(sl, sx * 0.58 * s, 1.75 * s, 0, h); }
    put(bx(0.12 * s, 0.1 * s, 2.14 * s, tint(roof, -0.08)), 0, 2.2 * s, 0, h);
    put(bx(0.42 * s, 0.74 * s, 0.06, "#7a4a2a"), 0.5 * s, 0.37 * s, 0.9 * s, h); put(sp(0.03 * s, "#ffd166", 6), 0.38 * s, 0.37 * s, 0.94 * s, h);
    put(bx(0.56 * s, 0.5 * s, 0.03, "#fff6e6"), -0.5 * s, 0.8 * s, 0.9 * s, h); put(bx(0.46 * s, 0.4 * s, 0.05, glow(WARM, 1.5)), -0.5 * s, 0.8 * s, 0.9 * s, h);
    put(bx(0.3 * s, 0.3 * s, 0.05, glow(WARM, 1.2)), 0, 1.62 * s, 0.9 * s, h);
    put(bx(0.03, 0.5 * s, 0.56 * s, "#fff6e6"), 1.1 * s, 0.8 * s, 0.25 * s, h); put(bx(0.05, 0.4 * s, 0.46 * s, glow(WARM, 1.5)), 1.1 * s, 0.8 * s, 0.25 * s, h);
    put(bx(0.5 * s, 0.4 * s, 0.05, glow(WARM, 1.3)), 0.4 * s, 0.8 * s, -0.9 * s, h); put(bx(0.05, 0.4 * s, 0.46 * s, glow(WARM, 1.3)), -1.1 * s, 0.8 * s, -0.2 * s, h);
    put(bx(0.26 * s, 0.7 * s, 0.26 * s, "#9a6b55"), -0.62 * s, 2.0 * s, -0.45 * s, h); put(bx(0.32 * s, 0.08 * s, 0.32 * s, "#7a5142"), -0.62 * s, 2.36 * s, -0.45 * s, h);
    if (porch) { put(bx(0.9 * s, 0.1 * s, 0.5 * s, "#d9c7a8"), 0.5 * s, 0.05 * s, 1.12 * s, h); put(bx(1.0 * s, 0.06 * s, 0.6 * s, roof), 0.5 * s, 0.95 * s, 1.15 * s, h); for (const dx of [-0.42, 0.42]) put(bx(0.06 * s, 0.9 * s, 0.06 * s, "#fff6e6"), (0.5 + dx) * s, 0.5 * s, 1.38 * s, h); }
    return h;
  };
  const car = (c) => {
    const k = new THREE.Group(); put(bx(0.95, 0.26, 0.48, c), 0, 0.27, 0, k); put(bx(0.5, 0.22, 0.42, m("#dfe9f5", { roughness: 0.2, metalness: 0.3 })), -0.05, 0.5, 0, k);
    for (const [x, z] of [[-0.3, -0.24], [0.3, -0.24], [-0.3, 0.24], [0.3, 0.24]]) { const w = cy(0.12, 0.12, 0.08, "#1f1f26", 12); w.rotation.x = Math.PI / 2; put(w, x, 0.12, z, k); }
    for (const z of [-0.16, 0.16]) { put(bx(0.03, 0.07, 0.1, glow("#fff1c4", 2)), 0.48, 0.3, z, k); put(bx(0.03, 0.06, 0.1, glow("#ff5a4a", 1.4)), -0.48, 0.3, z, k); }
    return k;
  };
  // Signs of state. Overdue: scaffolding, cones, a barrier. All clear: bunting.
  const scaffold = (w, h) => {
    const s = new THREE.Group(), pole = "#8a94a6", nx = Math.max(2, Math.round(w / 0.8) + 1);
    for (let i = 0; i < nx; i++) for (const z of [0, 0.36]) put(cy(0.025, 0.025, h, pole, 6), -w / 2 + (i * w) / (nx - 1), h / 2, z, s);
    for (let y = 0.7; y < h; y += 0.7) { put(bx(w + 0.1, 0.045, 0.42, "#c79a5e"), 0, y, 0.18, s); put(bx(w + 0.1, 0.03, 0.03, pole), 0, y + 0.3, 0.37, s); }
    put(bx(w * 0.45, h * 0.5, 0.02, "#f0863a"), -w * 0.22, h * 0.62, 0.39, s);
    return s;
  };
  const cone = () => { const c = new THREE.Group(); put(bx(0.2, 0.03, 0.2, "#e8622c"), 0, 0.015, 0, c); put(new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.26, 10), W.mat("#f0762c")), 0, 0.16, 0, c); put(cy(0.048, 0.064, 0.05, "#fff4e0", 10), 0, 0.13, 0, c); return c; };
  const barrier = () => { const b = new THREE.Group(); for (let k = 0; k < 6; k++) put(bx(0.15, 0.14, 0.04, k % 2 ? "#fff4e0" : "#e04a3a"), -0.375 + k * 0.15, 0.42, 0, b); for (const x of [-0.36, 0.36]) put(bx(0.04, 0.5, 0.22, "#6b7280"), x, 0.25, 0, b); return b; };
  const bunting = (len) => {
    const s = new THREE.Group(), cols = ["#ff6b6b", "#ffd166", "#5fd4a0", "#6aa9ff", "#ff9fd0"], n = Math.round(len / 0.34);
    for (const x of [-len / 2, len / 2]) { put(cy(0.035, 0.035, 1.7, "#fff6e6", 6), x, 0.85, 0, s); put(sp(0.07, "#ffd166", 8), x, 1.73, 0, s); }
    put(bx(len, 0.02, 0.02, "#fff6e6"), 0, 1.6, 0, s);
    for (let k = 0; k < n; k++) {
      const x = -len / 2 + ((k + 0.5) / n) * len;
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 3), W.mat(cols[k % 5])); f.rotation.x = Math.PI; f.scale.z = 0.25; put(f, x, 1.44, 0, s);
      put(sp(0.05, glow("#ffe2a0", 2.6), 6), x + len / n / 2, 1.56, 0, s);
    }
    return s;
  };
  // You: the character who can walk the streets (R31). The app moves it; idle, it waves.
  const me = person(CONFIG.playerLook.colors, { hat: "straw", hair: "#5a3a22", lanternColor: "#ffe08a" }); me.scale.setScalar(0.85);
  // What blocks walking and bouncing: building footprints in world units, with their height.
  const solids = [], doors = {};
  const solid = (id, x, z, w, d, h) => { const g = G[id]; solids.push({ x0: g.position.x + x - w / 2, x1: g.position.x + x + w / 2, z0: g.position.z + z - d / 2, z1: g.position.z + z + d / 2, h: Y + h }); };
  const door = (id, x, z) => { doors[id] = [G[id].position.x + x, G[id].position.z + z]; };
  // Street trees on the sidewalks of every block, so the wider streets feel like boulevards.
  const avenue = new THREE.Group(); scene.add(avenue);
  for (const [i, j, id] of CELLS) {
    const [cx, cz] = at(i, j), e = B / 2 + 0.32;
    [[-1.5, e], [1.5, e], [e, -1.5], [e, 1.5], [-1.5, -e], [1.5, -e], [-e, -1.5], [-e, 1.5]].forEach(([dx, dz], k) => {
      const t = (i + j + k) % 2 ? tree(0.5, LEAVES[(i * 3 + j + k) % 4]) : pine(0.52);
      t.position.set(cx + dx, 0.23, cz + dz); avenue.add(t);
      solids.push({ x0: cx + dx - 0.18, x1: cx + dx + 0.18, z0: cz + dz - 0.18, z1: cz + dz + 0.18, h: 1.6 });
    });
  }
  const signs = {};
  const dress = (id, { scaf, cones = [], bar, lamp = [2.2, 2.2], extra }) => {
    const g = G[id], od = new THREE.Group(), cl = new THREE.Group(); od.userData.live = cl.userData.live = true; g.add(od, cl);
    const sc = scaffold(scaf.w, scaf.h); sc.position.set(scaf.x, 0.06, scaf.z); sc.rotation.y = scaf.ry || 0; od.add(sc);
    for (const [x, z] of cones) add(od, cone(), x, z);
    if (bar) add(od, barrier(), bar[0], bar[1], bar[2] || 0);
    extra?.(od);
    // All clear: a festoon of flags and string lights along the two front edges of the block.
    const e = 2.14, bn = bunting(3.7); bn.position.set(0.25, 0, e); cl.add(bn);
    const bn2 = bunting(3.7); bn2.position.set(e, 0, 0.25); bn2.rotation.y = Math.PI / 2; cl.add(bn2);
    const bulb = new THREE.MeshStandardMaterial({ color: "#ffe6a8", emissive: new THREE.Color("#ffcf78"), emissiveIntensity: 2.4, roughness: 0.4 });
    add(g, lampPost(bulb), lamp[0], lamp[1], -Math.PI * 0.75, 0);
    if (HQ()) { const l = new THREE.PointLight("#ffb866", 7, 6.5, 1.8); l.position.set(g.position.x + lamp[0] - 0.22, Y + 1.45, g.position.z + lamp[1] - 0.22); scene.add(l); }
    bake(od); bake(cl); od.visible = cl.visible = false;
    signs[id] = { overdue: od, clear: cl, bulb, state: "open" };
  };

  // ----- Work: downtown towers with lit windows -----
  {
    const g = G.work; lawn(g, "#d6cdbf");
    const towers = [[-1.0, -1.0, 1.6, 6.0, "#55698f", 5, 15], [1.05, -1.0, 1.4, 4.4, "#7187ab", 4, 11], [-1.05, 1.05, 1.4, 3.2, "#8478a8", 4, 8], [1.1, 1.15, 1.2, 2.2, "#93a3c2", 3, 5]];
    towers.forEach(([x, z, w, h, c, cols, rows], k) => {
      put(bx(w, h, w, facade(cols, rows, c, 11 + k * 7)), x, h / 2 + 0.06, z, g);
      put(bx(w + 0.08, 0.1, w + 0.08, tint(c, -0.16)), x, h + 0.11, z, g);
      put(bx(w + 0.04, 0.3, w + 0.04, tint(c, -0.2)), x, 0.21, z, g);
      put(bx(w * 0.5, 0.2, 0.03, glow(WARM, 1.6)), x, 0.2, z + w / 2 + 0.03, g); put(bx(0.03, 0.2, w * 0.5, glow(WARM, 1.6)), x + w / 2 + 0.03, 0.2, z, g);
      put(bx(w * 0.35, 0.22, w * 0.3, "#c9ced8"), x - w * 0.15, h + 0.27, z + w * 0.1, g); put(bx(w * 0.2, 0.14, w * 0.2, "#9aa3b2"), x + w * 0.22, h + 0.23, z - w * 0.2, g);
    });
    put(cy(0.03, 0.03, 0.9, "#cfd6e6", 6), -1.0, 6.6, -1.0, g);
    const beacon = new THREE.MeshStandardMaterial({ color: "#ff6b6b", emissive: new THREE.Color("#ff4a3a"), emissiveIntensity: 2.6 });
    put(sp(0.08, beacon, 8), -1.0, 7.08, -1.0, g); updaters.push((t) => { beacon.emissiveIntensity = Math.sin(t * 2.2) > 0 ? 3 : 0.3; });
    put(bx(0.7, 0.4, 0.4, "#8a5a3a"), -0.1, 0.26, 2.05, g); const aw = bx(0.8, 0.05, 0.5, "#e0504b"); aw.rotation.x = 0.25; put(aw, -0.1, 0.72, 2.1, g); for (const dx of [-0.32, 0.32]) put(bx(0.04, 0.5, 0.04, "#5a3a24"), -0.1 + dx, 0.5, 2.25, g);
    add(g, bench(), 1.3, 2.1, Math.PI);
    const worker = person(["#3d4a6b", "#e8c39e", "#1f2d4a"], { hat: "none", hair: "#2b2b2b" }); worker.scale.setScalar(0.72); add(g, worker, 0.55, 2.05, 0.6);
    updaters.push((t, dt) => worker.userData.animate(t, dt, {}));
    towers.forEach(([x, z, w, h]) => solid("work", x, z, w, w, h + 0.2)); solid("work", -0.1, 2.05, 0.8, 0.5, 0.8); door("work", -1.05, 2.12);
    dress("work", { scaf: { x: 1.1, z: 1.78, w: 1.2, h: 2.2 }, cones: [[0.3, 2.15], [1.95, 1.3]], bar: [-0.9, 2.12], extra: (od) => {
      // A tower crane says "work in progress" from far away.
      const y = "#f2b632"; put(bx(0.16, 7.6, 0.16, y), 0.05, 3.8, 0.05, od); put(bx(3.4, 0.12, 0.12, y), 0.9, 7.5, 0.05, od); put(bx(0.5, 0.3, 0.3, "#5a5f6b"), -0.75, 7.4, 0.05, od);
      put(bx(0.26, 0.26, 0.26, y), 0.05, 7.7, 0.05, od); put(cy(0.012, 0.012, 1.6, "#3b4250", 4), 2.2, 6.7, 0.05, od); put(bx(0.3, 0.2, 0.3, "#c79a5e"), 2.2, 5.85, 0.05, od);
    } });
  }

  // ----- Paperwork: city hall with columns, a dome and a flag; a fountain on the plaza -----
  {
    const g = G.paperwork; lawn(g, "#e9dfcf");
    const hall = new THREE.Group(), stone = "#f3ecdf";
    [[3.2, 2.4], [3.0, 2.2], [2.8, 2.0]].forEach(([w, d], k) => put(bx(w, 0.1, d, tint(stone, -0.06 + k * 0.02)), 0, 0.05 + k * 0.1, 0.05, hall));
    put(bx(2.5, 1.25, 1.3, stone), 0, 0.925, -0.25, hall);
    for (let k = 0; k < 6; k++) { put(cy(0.085, 0.085, 1.2, "#fffaf0", 12), -1.05 + k * 0.42, 0.9, 0.64, hall); put(bx(0.24, 0.06, 0.24, "#fffaf0"), -1.05 + k * 0.42, 1.5, 0.64, hall); }
    put(bx(2.74, 0.16, 1.9, tint(stone, -0.05)), 0, 1.61, 0, hall);
    put(prism(2.74, 0.52, 0.5, stone), 0, 1.69, 0.7, hall);
    const clock = cy(0.15, 0.15, 0.04, "#fffaf0", 16); clock.rotation.x = Math.PI / 2; put(clock, 0, 1.88, 0.96, hall); put(bx(0.02, 0.1, 0.02, "#3b4250"), 0, 1.92, 0.99, hall); put(bx(0.08, 0.02, 0.02, "#3b4250"), 0.03, 1.88, 0.99, hall);
    put(bx(0.44, 0.74, 0.05, "#6b4a2e"), 0, 0.67, 0.41, hall);
    for (const x of [-0.9, -0.5, 0.5, 0.9]) put(bx(0.2, 0.5, 0.05, glow(WARM, 1.5)), x, 0.95, 0.41, hall);
    for (const z of [-0.55, 0.0]) { put(bx(0.05, 0.5, 0.26, glow(WARM, 1.5)), 1.26, 0.95, z - 0.2, hall); put(bx(0.05, 0.5, 0.26, glow(WARM, 1.5)), -1.26, 0.95, z - 0.2, hall); }
    for (const x of [-0.8, 0, 0.8]) put(bx(0.26, 0.5, 0.05, glow(WARM, 1.3)), x, 0.95, -0.91, hall);
    put(cy(0.62, 0.66, 0.34, tint(stone, -0.04), 24), 0, 1.86, -0.3, hall);
    put(new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m("#62bfd0", { metalness: 0.35, roughness: 0.35 })), 0, 2.03, -0.3, hall);
    put(cy(0.1, 0.12, 0.16, "#ffd166", 10), 0, 2.7, -0.3, hall); put(cy(0.02, 0.02, 0.9, "#cfd6e6", 6), 0, 3.2, -0.3, hall);
    const flag = bx(0.44, 0.26, 0.02, "#ffc94d"); flag.userData.live = true; flag.castShadow = true; hall.add(flag); flag.position.set(0.23, 3.48, -0.3);
    updaters.push((t) => { flag.rotation.y = Math.sin(t * 2.4) * 0.25; });
    add(g, hall, 0, -0.75, 0);
    put(cy(0.52, 0.58, 0.22, "#d9d2c2", 24), -1.5, 0.17, 1.5, g); put(cy(0.44, 0.44, 0.03, glow("#aee6ff", 0.7), 24), -1.5, 0.29, 1.5, g); put(cy(0.06, 0.09, 0.44, "#d9d2c2", 10), -1.5, 0.46, 1.5, g); put(sp(0.09, glow("#d8f4ff", 0.9), 8), -1.5, 0.72, 1.5, g);
    put(bx(0.24, 0.42, 0.2, "#e0504b"), 1.7, 0.27, 1.75, g); put(bx(0.28, 0.06, 0.24, "#c2423d"), 1.7, 0.5, 1.75, g);
    add(g, bench(), 0.35, 1.95, Math.PI); add(g, pine(0.8), -1.95, -0.4); add(g, pine(0.8), 1.95, 0.75);
    flowerBed(g, 0.9, 1.2, 0.32, 3); flowerBed(g, -0.6, 1.2, 0.32, 4);
    solid("paperwork", 0, -0.7, 3.0, 2.2, 2.0); solid("paperwork", -1.5, 1.5, 1.1, 1.1, 0.5); door("paperwork", 0, 0.98);
    dress("paperwork", { scaf: { x: 1.55, z: -0.9, w: 1.4, h: 1.9, ry: Math.PI / 2 }, cones: [[1.2, 0.75], [1.95, -0.1]], bar: [-0.2, 1.5] });
  }

  // ----- Health: a gym, a running track, a pond -----
  {
    const g = G.health; lawn(g, "#86c773");
    const gym = new THREE.Group();
    put(bx(1.9, 1.0, 1.4, "#f1ede4"), 0, 0.5, 0, gym); put(bx(2.06, 0.14, 1.56, "#e0504b"), 0, 1.07, 0, gym);
    put(bx(1.3, 0.55, 0.05, glow("#ffe2ad", 1.3)), -0.15, 0.5, 0.7, gym); put(bx(0.34, 0.7, 0.06, "#3b4250"), 0.72, 0.35, 0.7, gym);
    const barM = cy(0.04, 0.04, 0.9, "#3a3a3a", 10); barM.rotation.z = Math.PI / 2; put(barM, 0, 1.42, 0.2, gym);
    for (const dx of [-0.4, 0.4]) { const pl = cy(0.2, 0.2, 0.1, "#2b2b2b", 18); pl.rotation.z = Math.PI / 2; put(pl, dx, 1.42, 0.2, gym); }
    for (const dx of [-0.2, 0.2]) put(bx(0.04, 0.3, 0.04, "#3a3a3a"), dx, 1.28, 0.2, gym);
    add(g, gym, -1.05, -1.2);
    const ring = (r0, r1, c, y) => { const geo = new THREE.RingGeometry(r0, r1, 40); geo.rotateX(-Math.PI / 2); put(new THREE.Mesh(geo, m(c)), 1.0, y, -0.85, g); };
    ring(0.62, 1.02, "#d9654b", 0.07); ring(0.81, 0.83, "#fff4e0", 0.075); ring(0, 0.62, "#79bd69", 0.068);
    put(cy(0.92, 0.92, 0.05, m("#7fbfd9", { roughness: 0.15, metalness: 0.25 }), 28), -0.95, 0.07, 1.05, g);
    for (let k = 0; k < 9; k++) { const a = k * 0.7; put(sp(0.1, k % 2 ? "#b9b2a6" : "#9a938a", 6), -0.95 + Math.cos(a) * 0.95, 0.1, 1.05 + Math.sin(a) * 0.95, g); }
    add(g, tree(0.8, LEAVES[0]), 1.5, 1.4); add(g, tree(0.65, LEAVES[2]), 0.45, 1.7); add(g, pine(0.75), 1.9, 0.5); add(g, bench(), 0.25, 0.55, 2.4);
    const runner = person(["#4ee08a", "#e9c9a8", "#1f2d4a"], { hat: "cap", hair: "#3b2a20" }); runner.scale.setScalar(0.7); g.add(runner);
    updaters.push((t, dt) => { const a = -t * 0.7; runner.position.set(1.0 + Math.cos(a) * 0.82, 0.07, -0.85 + Math.sin(a) * 0.82); runner.rotation.y = -a + Math.PI; runner.userData.animate(t, dt, { walking: true }); });
    solid("health", -1.05, -1.2, 1.9, 1.4, 1.2); solid("health", -0.95, 1.05, 1.6, 1.6, 0.25); door("health", -0.33, -0.05);
    dress("health", { scaf: { x: -1.05, z: -0.47, w: 1.7, h: 1.2 }, cones: [[0.05, -0.35], [-0.2, 0.2]], bar: [1.0, 0.45] });
  }

  // ----- Family: the grandparents' street -----
  {
    const g = G.family; lawn(g, "#9ccf78");
    add(g, house("#ffe2d1", "#7d5fd3", 0.62), -1.2, -1.2); add(g, house("#e2f0ff", "#3e8fb0", 0.58), 1.0, -1.3, -0.12); add(g, house("#fff3c4", "#e0884b", 0.54), -1.35, 0.95, 0.12);
    put(bx(1.0, 0.06, 0.55, "#a8774c"), 0.95, 0.59, 1.1, g); for (const dz of [-0.42, 0.42]) put(bx(1.0, 0.05, 0.2, "#8a5a3a"), 0.95, 0.36, 1.1 + dz, g); for (const dx of [-0.4, 0.4]) put(bx(0.06, 0.55, 0.9, "#8a5a3a"), 0.95 + dx, 0.3, 1.1, g);
    put(bx(0.3, 0.02, 0.3, "#e56b6f"), 0.95, 0.63, 1.1, g); put(cy(0.07, 0.05, 0.1, "#fff6e6", 10), 1.2, 0.67, 1.05, g);
    const p1 = person(["#e56b8a", "#f1cfae", "#7a3b3b"], { hat: "none", hair: "#d9d2c8" }); p1.scale.setScalar(0.8); add(g, p1, 0.2, 1.6, 0.9);
    const p2 = person(["#3e8fb0", "#e8c39e", "#1f2d4a"], { hat: "cap", hair: "#2b2b2b" }); p2.scale.setScalar(0.62); add(g, p2, 1.85, 0.5, -0.5);
    updaters.push((t, dt) => { p1.userData.animate(t, dt, { wave: true }); p2.userData.animate(t, dt, {}); });
    for (const x of [-0.25, 0.35]) { const a = bx(0.05, 1.0, 0.05, "#c9ced8"); a.rotation.z = x < 0 ? 0.2 : -0.2; put(a, 0.05 + x, 0.55, -0.15, g); } put(bx(0.8, 0.05, 0.05, "#c9ced8"), 0.05, 1.04, -0.15, g);
    for (const x of [-0.1, 0.2]) put(bx(0.012, 0.6, 0.012, "#3b4250"), 0.05 + x - 0.05, 0.74, -0.15, g); put(bx(0.34, 0.04, 0.14, "#e0504b"), 0.05, 0.44, -0.15, g);
    add(g, tree(0.75, LEAVES[3]), 2.0, -0.25); hedge(g, -0.2, 2.1, 2.2); flowerBed(g, -0.3, 0.75, 0.3, 7);
    solid("family", -1.2, -1.2, 1.36, 1.12, 1.4); solid("family", 1.0, -1.3, 1.28, 1.05, 1.3); solid("family", -1.35, 0.95, 1.19, 0.97, 1.2); solid("family", 0.95, 1.1, 1.0, 1.05, 0.6); door("family", -0.89, -0.2);
    dress("family", { scaf: { x: -1.2, z: -0.62, w: 1.3, h: 1.05 }, cones: [[-0.3, -0.5], [0.3, 0.45]], bar: [-0.55, 1.75] });
  }

  // ----- Home: your house, garden, car, cat, and you -----
  {
    const g = G.home; lawn(g, "#8cc873");
    add(g, house("#f6ead4", "#d0573f", 1.0, { porch: true }), -0.75, -0.8);
    add(g, tree(0.95, LEAVES[1]), -1.75, 1.3); add(g, tree(0.6, LEAVES[2]), 1.9, -1.7);
    flowerBed(g, 0.55, 1.35, 0.36, 11); flowerBed(g, -0.6, 1.55, 0.3, 12);
    for (let k = 0; k < 8; k++) put(bx(0.07, 0.36, 0.07, "#fff6e6"), -2.1 + k * 0.4, 0.24, 2.1, g); put(bx(2.9, 0.05, 0.04, "#fff6e6"), -0.7, 0.3, 2.1, g); put(bx(2.9, 0.05, 0.04, "#fff6e6"), -0.7, 0.16, 2.1, g);
    put(bx(1.05, 0.03, 2.9, "#c4bcae"), 1.5, 0.075, 0.75, g);
    add(g, car("#e56b6f"), 1.5, 0.9, Math.PI / 2);
    put(bx(0.05, 0.5, 0.05, "#6b4a2e"), 0.85, 0.3, 2.12, g); put(bx(0.26, 0.16, 0.16, "#6aa9ff"), 0.85, 0.6, 2.12, g);
    me.position.set(g.position.x + 0.2, Y + 0.06, g.position.z + 1.05); me.rotation.y = 0.8; scene.add(me);
    const luna = cat(); luna.scale.setScalar(0.6); add(g, luna, -0.95, 0.75, 0.6);
    updaters.push((t, dt) => me.userData.animate(t, dt, me.userData.state || { wave: true }));
    solid("home", -0.75, -0.8, 2.2, 1.8, 2.3); solid("home", -0.25, 0.35, 1.0, 0.5, 1.0); solid("home", 1.5, 0.9, 0.5, 1.0, 0.6); solid("home", -0.7, 2.1, 2.9, 0.1, 0.4); door("home", -0.25, 1.0);
    dress("home", { scaf: { x: 0.38, z: -0.8, w: 1.7, h: 1.3, ry: Math.PI / 2 }, cones: [[1.0, -0.2], [0.95, 2.0]], bar: [1.5, 2.15] });
  }

  // ----- Shops and the park: the two spare blocks, ready for new life areas -----
  {
    const g = G.shops; delete g.userData.district; lawn(g, "#dcd2c2");
    [["#ffd9a0", "#e0504b"], ["#cfe3f5", "#3e8fb0"], ["#ffd0e0", "#6f9f52"]].forEach(([wall, aw], k) => {
      const x = -1.45 + k * 1.45; put(bx(1.36, 1.25, 1.3, wall), x, 0.68, -1.2, g); put(bx(1.42, 0.1, 1.36, tint(wall, -0.18)), x, 1.36, -1.2, g);
      put(bx(1.22, 0.03, 1.16, tint(wall, -0.3)), x, 1.42, -1.2, g); put(bx(0.3, 0.2, 0.3, "#c9ced8"), x + 0.3, 1.52, -1.4, g); put(cy(0.07, 0.07, 0.3, "#9aa3b2", 8), x - 0.35, 1.57, -1.5, g);
      const a = bx(1.36, 0.05, 0.55, aw); a.rotation.x = 0.3; put(a, x, 1.0, -0.35, g);
      put(bx(0.8, 0.5, 0.05, glow(WARM, 1.4)), x - 0.15, 0.5, -0.54, g); put(bx(0.26, 0.62, 0.06, "#6b4a2e"), x + 0.45, 0.37, -0.54, g);
      put(bx(0.9, 0.2, 0.05, tint(aw, 0.25)), x, 1.25, -0.53, g); put(bx(0.3, 0.6, 0.05, "#6b4a2e"), x + 0.3, 0.36, -1.86, g); put(bx(0.3, 0.26, 0.05, glow(WARM, 1.1)), x - 0.3, 0.8, -1.86, g);
    });
    solids.push({ x0: g.position.x - 2.13, x1: g.position.x + 2.13, z0: g.position.z - 1.85, z1: g.position.z - 0.55, h: Y + 1.4 });
    for (const [x, z, c] of [[-1.2, 0.9, "#ff9f6b"], [0.5, 1.2, "#ffd166"]]) { put(cy(0.26, 0.26, 0.04, "#fff6e6", 14), x, 0.42, z, g); put(cy(0.03, 0.03, 0.42, "#6b7280", 6), x, 0.21, z, g); put(cy(0.02, 0.02, 0.6, "#6b7280", 6), x, 0.72, z, g); put(new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.22, 8), W.mat(c)), x, 1.1, z, g); }
    add(g, tree(0.6, LEAVES[3]), 1.8, 1.6, 0, 0); add(g, tree(0.55, LEAVES[0]), -1.95, 1.9, 0, 0);
    const bulb = glow("#ffd27a", 2.4); add(g, lampPost(bulb), 2.2, 2.2, -Math.PI * 0.75, 0);
  }
  {
    const g = G.park; delete g.userData.district; lawn(g, "#8fcf72");
    const path = bx(0.5, 0.02, 5.6, "#e4d9c8"); path.rotation.y = Math.PI / 4; put(path, 0, 0.07, 0, g);
    put(cy(0.8, 0.85, 0.12, "#e4d9c8", 8), -0.1, 0.12, -0.2, g); for (let k = 0; k < 6; k++) { const a = (k / 6) * 6.283; put(cy(0.035, 0.035, 0.8, "#fff6e6", 6), -0.1 + Math.cos(a) * 0.68, 0.58, -0.2 + Math.sin(a) * 0.68, g); }
    put(new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.5, 8), W.mat("#d0573f")), -0.1, 1.23, -0.2, g); put(sp(0.07, "#ffd166", 8), -0.1, 1.52, -0.2, g);
    [[-1.6, -1.5, 0.95, 0], [1.5, -1.6, 0.75, 2], [-1.7, 1.4, 0.8, 3], [1.75, 0.6, 0.65, 1], [0.6, 1.8, 0.7, 4]].forEach(([x, z, s, c]) => add(g, tree(s, LEAVES[c]), x, z));
    add(g, bench(), 1.2, -0.4, -0.8); add(g, pine(0.7), -1.9, 0.1);
    const sl = bx(0.3, 0.04, 1.1, "#ffd166"); sl.rotation.x = 0.5; put(sl, 1.35, 0.42, 1.5, g); put(bx(0.34, 0.66, 0.3, "#e0504b"), 1.35, 0.39, 0.95, g);
    const bulb = glow("#ffd27a", 2.4); add(g, lampPost(bulb), 2.2, 2.2, -Math.PI * 0.75, 0);
  }

  // ----- street life: parked cars, sailing boats, a balloon, evening clouds -----
  for (const [x, z, ry, c] of [[4.08, -1.6, Math.PI / 2, "#5fb7e6"], [3.42, 5.2, -Math.PI / 2, "#ffd166"], [-1.5, 3.42, 0, "#8fe388"], [-5.4, -3.42, Math.PI, "#b48cff"], [1.1, -4.08, 0, "#ff9f6b"]]) {
    const k = car(c); k.position.set(x, 0.12, z); k.rotation.y = ry; ground.add(k);
    const lx = Math.abs(Math.sin(ry)) > 0.5 ? 0.26 : 0.5, lz = Math.abs(Math.sin(ry)) > 0.5 ? 0.5 : 0.26; solids.push({ x0: x - lx, x1: x + lx, z0: z - lz, z1: z + lz, h: 0.75 });
  }
  const boat = (c) => { const b = new THREE.Group(); b.userData.live = true; put(bx(1.0, 0.2, 0.38, "#fff6e6"), 0, 0.1, 0, b); put(bx(0.7, 0.06, 0.3, c), 0, 0.22, 0, b); put(cy(0.02, 0.02, 1.3, "#6b4a2e", 5), 0.05, 0.8, 0, b); const sail = prism(0.7, 1.1, 0.02, "#fff1dc"); put(sail, -0.28, 0.3, 0, b); bake(b); return b; };
  const boats = [[12.6, 5.5, 0.5, "#e0504b"], [5.2, 13.1, 2.2, "#3e8fb0"]].map(([x, z, ry, c]) => { const b = boat(c); b.position.set(x, 0, z); b.rotation.y = ry; scene.add(b); return b; });
  const balloon = new THREE.Group(); balloon.userData.live = true;
  { const env = sp(0.9, "#ff9f6b", 16); env.scale.y = 1.15; put(env, 0, 1.6, 0, balloon); for (let k = 0; k < 6; k++) { const st = sp(0.905, k % 2 ? "#ffd166" : "#e0504b", 12); st.scale.set(0.34, 1.15, 1); st.rotation.y = (k / 6) * Math.PI; put(st, 0, 1.6, 0, balloon); }
    put(cy(0.3, 0.2, 0.3, "#e0504b", 10), 0, 0.62, 0, balloon); put(bx(0.3, 0.26, 0.3, "#8a5a3a"), 0, 0.13, 0, balloon); for (const [dx, dz] of [[-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13], [0.13, 0.13]]) put(bx(0.012, 0.36, 0.012, "#3b2a20"), dx, 0.42, dz, balloon); }
  scene.add(balloon); bake(balloon);
  const clouds = [[-13, -2, 1.2], [9, -13, 1.0]].map(([x, z, s]) => {
    const c = new THREE.Group();
    for (let i = 0; i < 5; i++) { const puff = sp(0.9 * s * (1 - i * 0.08), m("#fff3e6", { roughness: 1, transparent: true, opacity: 0.7 }), 14); puff.scale.y = 0.55; const u = (i * 0.8 * s - 1.6 * s) * Math.SQRT1_2; put(puff, u, Math.sin(i) * 0.15, -u, c); }
    c.position.set(x, 9, z); c.traverse((o) => { o.castShadow = false; }); scene.add(c); return c;
  });
  updaters.push((t) => {
    boats.forEach((b, i) => { b.position.y = 0.02 + Math.sin(t * 1.3 + i * 2) * 0.04; b.rotation.z = Math.sin(t * 0.9 + i) * 0.05; });
    const bu = balloon.userData; bu.vy = (bu.vy || 0) + (-(bu.off || 0) * 9 - (bu.vy || 0) * 1.4) * 0.016; bu.off = (bu.off || 0) + bu.vy * 0.016; // a tap sets vy; the spring settles it
    balloon.position.set(4.5 + Math.sin(t * 0.11) * 0.9, 5.6 + Math.sin(t * 0.5) * 0.18 + bu.off, -7.8 + Math.cos(t * 0.09) * 0.7); balloon.rotation.z = bu.vy * 0.04;
    clouds.forEach((c, i) => { c.position.x += 0.004 * (i + 1); if (c.position.x > 16) c.position.x = -16; });
    // An overdue district's street lamp flickers; the others burn steady.
    for (const s of Object.values(signs)) s.bulb.emissiveIntensity = s.state === "overdue" ? (Math.sin(t * 23) + Math.sin(t * 7.3) > 0.5 ? 2.6 : 0.12) : 2.4;
  });

  // Sun glitter on the water: flat warm flecks around the city, in three groups that twinkle in turn.
  const glitter = [0, 1, 2].map((k) => {
    const grp = new THREE.Group(), mt = new THREE.MeshStandardMaterial({ color: "#ffe9b8", emissive: new THREE.Color("#ffd27a"), emissiveIntensity: 1 }), rr = W.rng(40 + k);
    for (let i = 0; i < 34; i++) {
      const a = rr() * 6.283, d = 11 + rr() * 13, x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.abs(x) < 11.8 && Math.abs(z) < 11.8 && !(x > 3.8 && z < -3.8) && !(x < -3.8 && z > 3.8)) continue; // keep off the blocks
      const f = bx(0.14 + rr() * 0.22, 0.01, 0.04, mt); f.rotation.y = Math.PI / 4; f.position.set(x, 0.13, z); grp.add(f);
    }
    scene.add(grp); bake(grp); grp.children.forEach((o) => { o.receiveShadow = false; });
    return mt;
  });
  updaters.push((t) => glitter.forEach((mt, k) => { mt.emissiveIntensity = 0.2 + 2.6 * Math.max(0, Math.sin(t * 1.1 + k * 2.1)) ** 2; }));

  // The two open corners: a lighthouse on a rock, and a small marina.
  {
    const lh = new THREE.Group(); lh.position.set(7.6, 0, -7.6);
    const rock = sp(1.9, "#8d8a92", 9); rock.scale.y = 0.42; put(rock, 0, 0.1, 0, lh); const rock2 = sp(1.0, "#7d7a84", 7); rock2.scale.y = 0.5; put(rock2, 1.3, 0.1, 0.9, lh);
    put(cy(0.4, 0.55, 2.9, "#fff6e6", 14), 0, 2.2, 0, lh); for (const y of [1.4, 2.5]) put(cy(0.47 - (y - 1.4) * 0.045, 0.5 - (y - 1.4) * 0.045, 0.5, "#e0504b", 14), 0, y, 0, lh);
    put(cy(0.55, 0.55, 0.1, "#3b4250", 14), 0, 3.7, 0, lh); put(cy(0.05, 0.05, 0.5, "#3b4250", 6), 0.4, 3.95, 0, lh); put(cy(0.05, 0.05, 0.5, "#3b4250", 6), -0.4, 3.95, 0, lh);
    const lampMat = new THREE.MeshStandardMaterial({ color: "#fff1c4", emissive: new THREE.Color("#ffd27a"), emissiveIntensity: 3 });
    put(cy(0.3, 0.3, 0.45, lampMat, 12), 0, 3.98, 0, lh); put(new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.5, 12), W.mat("#e0504b")), 0, 4.47, 0, lh);
    updaters.push((t) => { lampMat.emissiveIntensity = 1.6 + 2.4 * Math.max(0, Math.sin(t * 1.6)) ** 3; });
    scene.add(lh); bake(lh);
    const mar = new THREE.Group(); mar.position.set(-3.8, 0, 7.5);
    put(bx(3.6, 0.1, 0.8, "#b98a5a"), -1.9, 0.22, 0, mar); put(bx(0.8, 0.1, 2.2, "#b98a5a"), -3.3, 0.22, 1.2, mar);
    for (const [x, z] of [[-0.6, 0.35], [-0.6, -0.35], [-2.0, 0.35], [-2.0, -0.35], [-3.6, 0.3], [-3.6, 2.2], [-3.0, 2.2]]) put(cy(0.07, 0.07, 0.9, "#6b4a2e", 6), x, -0.05, z, mar);
    for (const [x, z, c] of [[-1.6, -0.95, "#ffd166"], [-2.5, 1.2, "#5fb7e6"]]) { put(bx(0.9, 0.2, 0.4, "#fff6e6"), x, 0.08, z, mar); put(bx(0.6, 0.06, 0.32, c), x, 0.2, z, mar); }
    put(bx(0.3, 0.3, 0.3, "#c79a5e"), -3.3, 0.42, 0.3, mar); put(cy(0.14, 0.14, 0.3, "#e0504b", 10), -3.1, 0.42, 1.9, mar);
    scene.add(mar); bake(mar);
  }

  for (const g of Object.values(G)) bake(g);
  bake(ground); bake(avenue);

  cam = viewCam(target, { dist: 76 });
  const labelY = { home: 3.0, family: 2.3, paperwork: 4.1, work: 7.7, health: 2.5 };
  const isles = ["home", "family", "paperwork", "work", "health"].map((id) => ({ id, name: id[0].toUpperCase() + id.slice(1), pos: [G[id].position.x, G[id].position.z], radius: 3.1, labelY: labelY[id] }));
  // ----- things that react physically (R32): two balls to kick, reward coins, splashes -----
  const toys = [[G.home.position.x + 1.0, G.home.position.z + 1.55, 0.2, "#ff6b6b", "#fff6e6"], [G.park.position.x - 0.9, G.park.position.z + 1.0, 0.18, "#fff6e6", "#3b4250"]].map(([x, z, r, c1, c2]) => {
    const ball = new THREE.Group(); put(sp(r, c1, 14), 0, 0, 0, ball); const band = sp(r * 1.01, c2, 14); band.scale.set(1, 0.34, 1); put(band, 0, 0, 0, ball); const band2 = sp(r * 1.01, c2, 14); band2.scale.set(0.34, 1, 1); put(band2, 0, 0, 0, ball);
    ball.position.set(x, Y + 0.06 + r, z); ball.userData.toy = true; scene.add(ball);
    return { mesh: ball, r, home: [x, Y + 0.06 + r + 0.6, z] };
  });
  const coinMat = new THREE.MeshStandardMaterial({ color: "#ffc21a", emissive: new THREE.Color("#ff9f1c"), emissiveIntensity: 0.55, metalness: 0.5, roughness: 0.35 });
  const coins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 12), coinMat, 48); coins.castShadow = true; coins.frustumCulled = false; scene.add(coins);
  { const none = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < 48; i++) coins.setMatrixAt(i, none); } // a fixed pool: unused coins are scaled to nothing (the count must not change after the first frame)
  const rings = [0, 1, 2].map(() => { const geo = new THREE.RingGeometry(0.25, 0.34, 20); geo.rotateX(-Math.PI / 2); const r = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: "#eafcff", transparent: true, opacity: 0, depthWrite: false })); r.visible = false; scene.add(r); return r; });
  const splash = (x, z) => { const r = rings.find((q) => !q.visible) || rings[0]; r.position.set(x, 0.14, z); r.scale.setScalar(1); r.material.opacity = 0.9; r.visible = true; };
  updaters.push((t, dt) => { for (const r of rings) if (r.visible) { r.scale.multiplyScalar(1 + dt * 3.2); r.material.opacity -= dt * 1.3; if (r.material.opacity <= 0) r.visible = false; } });
  // Door marks: a glowing ring on the ground at each entrance, shown while walking.
  const doorMarks = new THREE.Group(); doorMarks.visible = false; scene.add(doorMarks);
  const markMat = new THREE.MeshStandardMaterial({ color: "#ffd166", emissive: new THREE.Color("#ffc94d"), emissiveIntensity: 2 });
  for (const [x, z] of Object.values(doors)) { const geo = new THREE.RingGeometry(0.3, 0.42, 24); geo.rotateX(-Math.PI / 2); const r = new THREE.Mesh(geo, markMat); r.position.set(x, Y + 0.085, z); doorMarks.add(r); }
  updaters.push((t) => { markMat.emissiveIntensity = 1.4 + Math.sin(t * 3) * 0.8; });
  // R36 · decorations bought with coins: three spots per district, on the sidewalk corners.
  const SPOTS = [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6]];
  const decor = new THREE.Group(); scene.add(decor);
  const makeDecor = (item) => {
    const g = new THREE.Group();
    if (item === "bench") g.add(bench());
    if (item === "tree") g.add(tree(0.62, LEAVES[(Math.random() * 4) | 0]));
    if (item === "flowers") { const box = put(bx(0.9, 0.22, 0.5, "#9b6b43"), 0, 0.11, 0, g); box.castShadow = true; const cols = ["#ff8fb1", "#ffd166", "#ff9f6b", "#fff3e0", "#c8a2ff"]; for (let k = 0; k < 9; k++) put(sp(0.08, cols[k % 5], 8), -0.34 + (k % 5) * 0.17, 0.27, (k < 5 ? -0.09 : 0.09), g); }
    if (item === "lamp") { const bulb = glow("#ffd27a", 2.4); g.add(lampPost(bulb)); }
    if (item === "flag") { put(cy(0.03, 0.035, 2.0, "#e9e4d8", 6), 0, 1.0, 0, g); const f = bx(0.6, 0.36, 0.02, ["#ff6b6b", "#5fb7e6", "#ffd166"][(Math.random() * 3) | 0]); f.castShadow = true; f.position.set(0.31, 1.78, 0); g.add(f); updaters.push((t) => { f.rotation.y = Math.sin(t * 2.6 + g.id) * 0.3; }); }
    if (item === "fountain") { put(cy(0.5, 0.55, 0.24, "#d9d2c2", 20), 0, 0.12, 0, g); put(cy(0.42, 0.42, 0.03, glow("#aee6ff", 0.7), 20), 0, 0.25, 0, g); put(cy(0.06, 0.09, 0.5, "#d9d2c2", 10), 0, 0.42, 0, g); put(sp(0.1, glow("#d8f4ff", 1), 8), 0, 0.72, 0, g); }
    return g;
  };
  function placeDecor(district, slot, item, pop = false) {
    const c = G[district]?.position, at2 = SPOTS[slot]; if (!c || !at2) return null;
    const g = makeDecor(item); g.position.set(c.x + at2[0], 0.23, c.z + at2[1]); g.rotation.y = Math.PI / 4 + slot * 0.7; decor.add(g);
    solids.push({ x0: g.position.x - 0.3, x1: g.position.x + 0.3, z0: g.position.z - 0.3, z1: g.position.z + 0.3, h: 1.2 });
    if (pop) { g.scale.setScalar(0.01); const t0 = performance.now(); updaters.push(() => { const k = Math.min(1, (performance.now() - t0) / 600); g.scale.setScalar(k < 1 ? 1 + Math.sin(k * Math.PI) * 0.35 - (1 - k) * 0.99 * (1 - k) : 1); }); }
    return g;
  }
  const walk = { cells: CELLS.map(([i, j]) => at(i, j)), pitch: P, block: B, solids, doors, roadY: 0.12, blockY: Y + 0.06 };
  const setMood = (id, state) => { const s = signs[id]; if (!s || s.state === state) return false; s.state = state; s.overdue.visible = state === "overdue"; s.clear.visible = state === "clear"; return true; };
  const moodSigns = (id) => (signs[id]?.overdue.visible ? "overdue" : signs[id]?.clear.visible ? "clear" : null);
  return { isles, G, target, setMood, moodSigns, placeDecor, decorCount: () => decor.children.length, walk, player: me, toys, coins, splash, balloon, doorMarks };
}

function buildHomeInto() {
  const target = new THREE.Vector3(0, 0.6, 0);
  lights({ target, size: 12, sunOff: [13, 8, 9], sunColor: "#ffb573", sun: 3.0, hemiSky: "#ffe3c8", hemiGround: "#b08a6a", hemi: 0.95 });
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
  // Bedroom (back left): bed, computer table, two terrariums on a stand. Scale: 1 unit ≈ 80 cm.
  bed(g, -4.55, -2.6, "#7b93d8");
  nightstand(g, -5.5, -1.05, true);
  put(cy(1.0, 1.0, 0.03, "#f2e9ff"), -2.8, 0.06, -1.9, g);
  // Terrarium stand along the back wall, then 60×60×45 and 60×45×45 cm tanks (W×H×D).
  const standH = 0.62, standZ = -4.45 + 0.32;
  put(bx(1.9, standH, 0.62, "#3a3f4a"), -4.75, standH / 2, standZ, g);
  put(bx(1.92, 0.04, 0.64, "#2a2e36"), -4.75, standH + 0.02, standZ, g);
  terrarium(g, -5.23, standH + 0.04, standZ, cm(60), cm(60), cm(45), { plant: "#4fa35a", sub: "#8a6440", rock: true, lizard: true });
  terrarium(g, -4.27, standH + 0.04, standZ, cm(60), cm(45), cm(45), { plant: "#7cc46a", sub: "#c9a46a", cactus: true });
  // Computer table with monitor, keyboard, tower and chair; the window sits above it.
  const dX = -1.55, dZ = -4.07;
  put(bx(1.7, 0.07, 0.72, "#e9e4dc"), dX, 0.76, dZ, g);
  for (const [ax, az] of [[-0.8, -0.3], [0.8, -0.3], [-0.8, 0.3], [0.8, 0.3]]) put(bx(0.05, 0.73, 0.05, "#2b2b33"), dX + ax, 0.36, dZ + az, g);
  put(bx(0.26, 0.03, 0.18, "#2b2b33"), dX - 0.1, 0.81, dZ - 0.15, g); put(bx(0.05, 0.28, 0.04, "#2b2b33"), dX - 0.1, 0.95, dZ - 0.2, g);
  put(bx(0.95, 0.55, 0.04, "#1f1f26"), dX - 0.1, 1.28, dZ - 0.2, g);
  put(bx(0.88, 0.48, 0.01, glow("#8fd3ff", 1.3)), dX - 0.1, 1.28, dZ - 0.177, g);
  put(bx(0.6, 0.02, 0.18, "#3a3a46"), dX - 0.1, 0.805, dZ + 0.15, g);
  put(bx(0.08, 0.02, 0.12, "#3a3a46"), dX + 0.35, 0.805, dZ + 0.16, g);
  put(bx(0.22, 0.5, 0.48, "#262a33"), dX + 0.6, 0.25, dZ, g); put(bx(0.01, 0.06, 0.06, glow("#7affc1", 1.6)), dX + 0.6, 0.42, dZ + 0.245, g);
  put(cy(0.28, 0.28, 0.08, "#3a3a46"), dX - 0.1, 0.5, dZ + 0.75, g); put(bx(0.55, 0.6, 0.08, "#3a3a46"), dX - 0.1, 0.85, dZ + 1.03, g); put(cy(0.04, 0.04, 0.46, "#6b6f7a", 8), dX - 0.1, 0.23, dZ + 0.75, g);
  put(bx(1.3, 0.8, 0.05, glow("#ffd9a8", 1.3)), dX, 1.95, -4.43, g);
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
  const DUSK = "#f4bf9c";
  scene.background = new THREE.Color(DUSK); scene.fog = new THREE.Fog(DUSK, 60, 190);
  skyDome("#6a72b8", DUSK, new THREE.Vector3());
  const garden = cy(240, 240, 0.02, m("#a9cc78", { roughness: 1 }), 40); garden.position.y = -0.5; garden.receiveShadow = true; scene.add(garden);
  { // A garden around the house, so the world goes on past the walls.
    const gd = new THREE.Group(); gd.position.y = -0.5; scene.add(gd);
    const leaves = ["#5aa252", "#6fae4e", "#e2a03a", "#d9772b", "#4f9a6a"];
    [[-10, -8, 1.6, 0], [-13, 2, 1.3, 2], [-9.5, 8.5, 1.5, 1], [10.5, -9, 1.7, 4], [14, -1, 1.2, 3], [11, 9.5, 1.4, 0], [1, -11, 1.5, 2], [-3, 12.5, 1.2, 1], [19, 7, 1.8, 4], [-19, -6, 1.9, 0], [6, 15, 1.3, 3], [-16, 12, 1.6, 2]].forEach(([x, z, sc, c]) => { const t = tree(sc, leaves[c]); t.position.set(x, 0, z); gd.add(t); });
    for (let k = 0; k < 7; k++) put(cy(0.5, 0.5, 0.04, "#d9cdb8", 8), 7.6 + k * 1.15, 0.02, 2.3 + Math.sin(k * 1.3) * 0.25, gd);
    for (const [x, z, w] of [[-9, 6.2, 5], [9.5, -6.5, 6]]) put(bx(w, 0.7, 0.6, "#4f8f4a"), x, 0.35, z, gd);
    const cols = ["#ff8fb1", "#ffd166", "#ff9f6b", "#fff3e0", "#c8a2ff"], fr = W.rng(21);
    for (let k = 0; k < 40; k++) { const a = fr() * 6.283, d = 9 + fr() * 9; put(sp(0.13, cols[k % 5], 6), Math.cos(a) * d, 0.12, Math.sin(a) * d, gd); }
    bake(gd);
  }
  cam = viewCam(target, { dist: 50, limits: { yaw: [ISO.yaw - 0.8, ISO.yaw + 0.8], pitch: [0.32, 1.3], zoom: [0.6, 2.6] } });
  const rooms = {
    living: new THREE.Vector3(-3, 1.4, 2.25), kitchen: new THREE.Vector3(3, 1.4, 2.25),
    bedroom: new THREE.Vector3(-2.4, 1.2, -1.1), office: new THREE.Vector3(3, 2.2, -2.25),
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
export const buildMap = ({ quality = "light" } = {}) => { QUALITY = quality; try { return wrap(buildMapInto); } finally { QUALITY = "light"; } };
export const buildHome = () => wrap(buildHomeInto);
// Keep the whole scene in view on narrow (portrait) screens by standing further back.
export function fitCamera(c) {
  c.aspect = VW() / VH(); c.userData.fit = Math.max(1, 0.56 / c.aspect); c.updateProjectionMatrix();
}
export function projectTo(c, v) { const p = v.clone().project(c); return [(p.x * 0.5 + 0.5) * VW(), (-p.y * 0.5 + 0.5) * VH(), p.z]; }
