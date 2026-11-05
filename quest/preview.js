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

// ---------- Scene build per style ----------
let scene, updaters = [], post;
function build() {
  scene = new THREE.Scene(); updaters = [];
  const isNew = style === "new";
  const cfg = { ...CONFIG, world: { ...CONFIG.world, style: isNew ? "lush" : "classic" } };
  if (!isNew) Object.assign(cfg.world, { sky: "#9fc7e8", water: { ...CONFIG.world.water, color: "#2b8fb3", waveHeight: 0.14 }, sun: { color: "#fff1d6", intensity: 2.6, offset: [14, 26, 8] }, hemi: { sky: "#cfe6ff", ground: "#6b5a3e", intensity: 1.3 }, fog: { color: "#bcd7ee", near: 75, far: 140 } });
  scene.background = new THREE.Color(cfg.world.sky);
  scene.fog = new THREE.Fog(cfg.world.fog.color, cfg.world.fog.near, cfg.world.fog.far);
  if (isNew) { const sky = W.makeSky(cfg); sky.position.copy(center); scene.add(sky); }
  const hemi = new THREE.HemisphereLight(cfg.world.hemi.sky, cfg.world.hemi.ground, cfg.world.hemi.intensity);
  const sun = new THREE.DirectionalLight(cfg.world.sun.color, cfg.world.sun.intensity);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 80 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  sun.position.copy(center).add(new THREE.Vector3(...cfg.world.sun.offset)); sun.target.position.copy(center);
  scene.add(hemi, sun, sun.target);
  const water = W.makeWater(cfg); water.position.set(center.x, 0, center.z); scene.add(water); updaters.push((t) => water.userData.update(t));
  const g = W.makeIsland(which, cfg); scene.add(g); updaters.push((t, dt) => g.userData.update(t, dt, true));
  const hy = (x, z) => g.userData.heightAt(x, z);
  const npc = W.makeCharacter(which.keeper.colors, { hat: which.keeper.hat, hair: which.keeper.hair });
  npc.position.set(center.x - 0.6, hy(-0.6, 1.6), center.z + 1.6); npc.rotation.y = Math.PI / 4; scene.add(npc);
  const look = CONFIG.playerLook;
  const pl = W.makeCharacter(look.colors, { hat: look.hat, hair: look.hair, lanternColor: "#ffe08a" });
  pl.position.set(center.x + 1.0, hy(1.0, 2.6), center.z + 2.6); pl.rotation.y = Math.PI / 4 + 0.5; scene.add(pl);
  updaters.push((t, dt) => { npc.userData.animate(t, dt, { wave: true }); pl.userData.animate(t, dt, { walking: params.has("walk") }); });
  const marker = W.makeMarker(which.theme.accent); marker.position.set(npc.position.x, TOP + 2, npc.position.z); scene.add(marker);
  updaters.push((t) => { marker.rotation.y = t * 1.5; marker.position.y = TOP + 2 + Math.sin(t * 2) * 0.12; });
  cam.position.copy(center).add(ISO); cam.lookAt(center);
  if (params.has("close")) { cam.zoom = 2.6; cam.position.add(new THREE.Vector3(0.3, 0, 2.2)); cam.lookAt(center.clone().add(new THREE.Vector3(0.3, 0, 2.2))); cam.updateProjectionMatrix(); }
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
