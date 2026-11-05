// Graphics preview: one island in the current style ("before") vs a proposed style ("after").
// Nothing here changes the game; it only renders a comparison scene.
import * as THREE from "three";
import { pass } from "three/tsl";
import { bloom } from "./vendor/BloomNode.js";
import { CONFIG, ISLANDS } from "./content.js";
import * as W from "./world.js";

const params = new URLSearchParams(location.search);
let style = params.get("style") === "old" ? "old" : "new";
const which = ISLANDS.find((i) => i.id === (params.get("island") || "tokens")) || ISLANDS[0];
const TOP = CONFIG.world.islandTop;

const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.AgXToneMapping;
document.getElementById("stage").append(renderer.domElement);
await renderer.init();

const cam = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 400);
const ISO = new THREE.Vector3(1, 1.05, 1).normalize().multiplyScalar(60);
const center = new THREE.Vector3(which.pos[0], 0, which.pos[1]);
function frustum() {
  const a = window.innerWidth / window.innerHeight, v = Math.max(17, 15 / a);
  cam.left = -v * a / 2; cam.right = v * a / 2; cam.top = v / 2; cam.bottom = -v / 2; cam.updateProjectionMatrix();
}
frustum();
window.addEventListener("resize", () => { renderer.setSize(window.innerWidth, window.innerHeight); frustum(); });

// ---------- Proposed style ----------
function coastNoise(seed) {
  const r = W.rng(seed); const a1 = r() * 6, a2 = r() * 6, a3 = r() * 6;
  return (ang) => 1 + 0.07 * Math.sin(3 * ang + a1) + 0.045 * Math.sin(5 * ang + a2) + 0.025 * Math.sin(11 * ang + a3);
}
function lerpColor(a, b, t) { return new THREE.Color(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, t))); }

function newIsland(isl) {
  const R = isl.radius, g = new THREE.Group(), coast = coastNoise(7);
  const hill = (x, z) => 0.11 * Math.sin(x * 0.65 + 1.3) * Math.cos(z * 0.55 + 0.4) + 0.05 * Math.sin(x * 1.6 + z * 1.2);
  // Top surface: a dense disk with gentle hills, a sloping beach and vertex-colour gradients.
  const rings = 16, segs = 72, pos = [], col = [], idx = [];
  const grassLo = new THREE.Color(isl.theme.grass).offsetHSL(0, 0.05, -0.08), grassHi = new THREE.Color(isl.theme.grass).offsetHSL(-0.02, 0.08, 0.07);
  const sand = new THREE.Color(isl.theme.sand), wet = new THREE.Color(isl.theme.sand).offsetHSL(0, -0.05, -0.12);
  pos.push(0, TOP + hill(0, 0), 0); col.push(...grassHi.toArray());
  for (let i = 1; i <= rings; i++) {
    for (let j = 0; j < segs; j++) {
      const ang = (j / segs) * Math.PI * 2, k = i / rings, rr = R * k * coast(ang);
      const x = Math.cos(ang) * rr, z = Math.sin(ang) * rr;
      const beach = THREE.MathUtils.smoothstep(k, 0.8, 1.0);
      const y = TOP + hill(x, z) * (1 - beach) - beach * 0.42;
      pos.push(x, y, z);
      const h = hill(x, z) / 0.16 * 0.5 + 0.5;
      const c = lerpColor(grassLo, grassHi, h).lerp(sand, THREE.MathUtils.smoothstep(k, 0.8, 0.9)).lerp(wet, THREE.MathUtils.smoothstep(k, 0.95, 1.0));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < segs; j++) idx.push(0, 1 + ((j + 1) % segs), 1 + j);
  for (let i = 1; i < rings; i++) for (let j = 0; j < segs; j++) {
    const a = 1 + (i - 1) * segs + j, b = 1 + (i - 1) * segs + ((j + 1) % segs), c = a + segs, d = b + segs;
    idx.push(a, b, d, a, d, c);
  }
  const topGeo = new THREE.BufferGeometry();
  topGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  topGeo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  topGeo.setIndex(idx); topGeo.computeVertexNormals();
  const top = new THREE.Mesh(topGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  top.receiveShadow = true; g.add(top);
  // Cliff: a lathe profile that follows the same coastline, with layered rock colours.
  const prof = [[1.0, TOP - 0.42], [1.02, TOP - 0.7], [0.97, -0.3], [0.9, -1.2], [0.7, -2.6]].map(([k, y]) => new THREE.Vector2(R * k, y));
  const cliffGeo = new THREE.LatheGeometry(prof, segs);
  const cp = cliffGeo.attributes.position, cc = [];
  const strata = ["#c9b48a", "#a88f6c", "#8c7a63", "#76685a", "#5f5850"];
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i), z = cp.getZ(i), y = cp.getY(i), ang = Math.atan2(z, x), s = coast(-ang + Math.PI / 2);
    cp.setX(i, x * s); cp.setZ(i, z * s);
    const t = Math.max(0, Math.min(strata.length - 1, ((TOP - 0.4 - y) / 3.2) * strata.length + Math.sin(ang * 9) * 0.3));
    const c = lerpColor(strata[Math.floor(t)], strata[Math.min(strata.length - 1, Math.floor(t) + 1)], t % 1);
    cc.push(c.r, c.g, c.b);
  }
  cliffGeo.setAttribute("color", new THREE.Float32BufferAttribute(cc, 3)); cliffGeo.computeVertexNormals();
  const cliff = new THREE.Mesh(cliffGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  cliff.castShadow = true; g.add(cliff);
  // Shallow water and foam rings that follow the coastline.
  const ringMesh = (inner, outer, color, opacity, y) => {
    const geo = new THREE.RingGeometry(inner, outer, segs, 1);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), yy = p.getY(i), ang = Math.atan2(yy, x), s = coast(ang); p.setXY(i, x * s, yy * s); }
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    m.position.y = y; m.renderOrder = 2; return m;
  };
  const shallow1 = ringMesh(R * 0.98, R * 1.6, "#7fe3df", 0.13, 0.16);
  const shallow2 = ringMesh(R * 0.98, R * 1.25, "#a8f0e6", 0.24, 0.17);
  const foam = ringMesh(R * 0.97, R * 1.06, "#ffffff", 0.7, 0.18);
  g.add(shallow1, shallow2, foam);
  // Grass tufts: instanced, with colour variation and a gentle sway.
  const N = 650, tuft = new THREE.InstancedMesh(new THREE.ConeGeometry(0.045, 0.3, 3), new THREE.MeshStandardMaterial({ roughness: 1 }), N);
  const r = W.rng(11), dummy = new THREE.Object3D(), base = [];
  for (let i = 0; i < N; i++) {
    const ang = r() * Math.PI * 2, k = Math.sqrt(r()) * 0.78, rr = R * k * coast(ang);
    const x = Math.cos(ang) * rr, z = Math.sin(ang) * rr;
    base.push([x, TOP + hill(x, z) + 0.12, z, r() * 6, 0.7 + r() * 0.7]);
    tuft.setColorAt(i, new THREE.Color(isl.theme.grass).offsetHSL((r() - 0.5) * 0.05, 0.1, -0.12 + r() * 0.14));
  }
  tuft.castShadow = false; tuft.receiveShadow = true; g.add(tuft);
  // Rounder two-tone trees.
  const leaf = new THREE.MeshStandardMaterial({ color: "#5aa252", roughness: 0.9, flatShading: true });
  const leaf2 = new THREE.MeshStandardMaterial({ color: "#78bd5e", roughness: 0.9, flatShading: true });
  for (const [x, z, s] of [[-3, 2.6, 1.1], [-2.2, -3.4, 0.9], [3.6, 2.8, 0.8]]) {
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * s, 0.16 * s, 1.0 * s, 6), new THREE.MeshStandardMaterial({ color: "#7a5232" }));
    trunk.position.y = 0.5 * s; trunk.castShadow = true; t.add(trunk);
    const c1 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75 * s, 1), leaf); c1.position.y = 1.35 * s; c1.castShadow = true;
    const c2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 * s, 1), leaf2); c2.position.set(0.25 * s, 1.75 * s, 0.15 * s); c2.castShadow = true;
    t.add(c1, c2); t.position.set(x, TOP + hill(x, z) - 0.05, z); g.add(t);
  }
  g.userData.update = (t) => {
    foam.material.opacity = 0.45 + Math.sin(t * 1.6) * 0.25;
    foam.scale.setScalar(1 + Math.sin(t * 1.6) * 0.012);
    for (let i = 0; i < N; i++) {
      const [x, y, z, o, sc] = base[i];
      dummy.position.set(x, y, z); dummy.rotation.set(Math.sin(t * 1.8 + o + x) * 0.18, o, Math.cos(t * 1.5 + o + z) * 0.18);
      dummy.scale.setScalar(sc); dummy.updateMatrix(); tuft.setMatrixAt(i, dummy.matrix);
    }
    tuft.instanceMatrix.needsUpdate = true;
  };
  return g;
}

function skyDome() {
  const geo = new THREE.SphereGeometry(180, 32, 16), p = geo.attributes.position, c = [];
  const topC = new THREE.Color("#5b9fd6"), mid = new THREE.Color("#a9d4f2"), hor = new THREE.Color("#ffe6c7");
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 180;
    const col = y > 0.15 ? mid.clone().lerp(topC, (y - 0.15) / 0.85) : hor.clone().lerp(mid, Math.max(0, (y + 0.2) / 0.35));
    c.push(col.r, col.g, col.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
}

// ---------- Scene build per style ----------
let scene, updaters = [], post;
function build() {
  scene = new THREE.Scene(); updaters = [];
  const isNew = style === "new";
  const cfg = isNew ? { ...CONFIG, world: { ...CONFIG.world, water: { ...CONFIG.world.water, color: "#2e9ec0", waveHeight: 0.08 } } } : CONFIG;
  if (isNew) { scene.background = new THREE.Color("#a9d4f2"); const sky = skyDome(); sky.position.copy(center); scene.add(sky); scene.fog = new THREE.Fog("#cfe4f3", 85, 160); }
  else { scene.background = new THREE.Color(CONFIG.world.sky); scene.fog = new THREE.Fog(CONFIG.world.fog.color, CONFIG.world.fog.near, CONFIG.world.fog.far); }
  const hemi = isNew ? new THREE.HemisphereLight("#cfe8ff", "#8a6d4a", 1.15) : new THREE.HemisphereLight(CONFIG.world.hemi.sky, CONFIG.world.hemi.ground, CONFIG.world.hemi.intensity);
  const sun = new THREE.DirectionalLight(isNew ? "#ffe0b0" : CONFIG.world.sun.color, isNew ? 3.2 : CONFIG.world.sun.intensity);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 80 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  sun.position.copy(center).add(isNew ? new THREE.Vector3(-10, 18, 14) : new THREE.Vector3(14, 26, 8)); sun.target.position.copy(center);
  scene.add(hemi, sun, sun.target);
  const water = W.makeWater(cfg); water.position.set(center.x, 0, center.z); scene.add(water); updaters.push((t) => water.userData.update(t));
  if (isNew) {
    const g = newIsland(which); g.position.copy(center); scene.add(g); updaters.push(g.userData.update);
    const props = new THREE.Group(); props.position.copy(center); scene.add(props);
    const anim = W.PROPS[which.props]?.(props, which, CONFIG, W.rng(3)); if (anim) updaters.push(anim);
  } else {
    const g = W.makeIsland(which, CONFIG); scene.add(g); if (g.userData.update) updaters.push(g.userData.update);
  }
  const npc = W.makeCharacter(which.keeper.colors); npc.position.set(center.x - 0.6, TOP, center.z + 1.6); npc.rotation.y = Math.PI / 4; scene.add(npc);
  const pl = W.makeCharacter(["#2f6f8f", "#f1cfae", "#c9a227"], { lanternColor: "#ffe08a" }); pl.position.set(center.x + 1.2, TOP, center.z + 2.8); pl.rotation.y = Math.PI / 4; scene.add(pl);
  const marker = W.makeMarker(which.theme.accent); marker.position.set(npc.position.x, TOP + 2, npc.position.z); scene.add(marker);
  updaters.push((t) => { marker.rotation.y = t * 1.5; marker.position.y = TOP + 2 + Math.sin(t * 2) * 0.12; });
  cam.position.copy(center).add(ISO); cam.lookAt(center);
  post = new THREE.PostProcessing(renderer);
  const sp = pass(scene, cam), c = sp.getTextureNode("output");
  post.outputNode = c.add(bloom(c, CONFIG.bloom.strength, CONFIG.bloom.radius, CONFIG.bloom.threshold));
  document.querySelectorAll("[data-style]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.style === style)));
}
build();
document.querySelectorAll("[data-style]").forEach((b) => b.addEventListener("click", () => { style = b.dataset.style; build(); }));

let T = 0, last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; T += dt;
  updaters.forEach((u) => u(T, dt));
  post.render();
});
window.__preview = { ready: true };
