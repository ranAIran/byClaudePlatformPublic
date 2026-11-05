// World building: islands, water, bridges, characters and per-island props.
// Every mesh is low-poly and built in code, so there are no asset files to load.
import * as THREE from "three";

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function hashStr(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0.0, ...opts }));
  return matCache.get(key);
}
export function glow(color, intensity = 2.2) {
  return mat(color, { emissive: new THREE.Color(color), emissiveIntensity: intensity, roughness: 0.4 });
}
function mesh(geo, material, { cast = true, receive = false } = {}) {
  const m = new THREE.Mesh(geo, material); m.castShadow = cast; m.receiveShadow = receive; return m;
}
function jitter(geo, amount, r, yAmount = amount * 0.5) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) + (r() - 0.5) * amount, p.getY(i) + (r() - 0.5) * yAmount, p.getZ(i) + (r() - 0.5) * amount);
  }
  geo.computeVertexNormals();
  return geo;
}

// ---------- Water ----------
export function makeWater(cfg) {
  const { size, segments, color } = cfg.world.water;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const base = Float32Array.from(geo.attributes.position.array);
  const water = mesh(geo, mat(color, { roughness: 0.25, metalness: 0.15 }), { cast: false, receive: true });
  const h = cfg.world.water.waveHeight;
  water.userData.update = (t) => {
    const p = geo.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      const x = base[i], z = base[i + 2];
      p[i + 1] = Math.sin(x * 0.28 + t * 1.1) * h + Math.cos(z * 0.23 + t * 1.4) * h * 0.8 + Math.sin((x + z) * 0.5 + t * 2.0) * h * 0.3;
    }
    geo.attributes.position.needsUpdate = true;
  };
  return water;
}

// ---------- Islands ----------
// Two looks, picked with CONFIG.world.style: "lush" (default: organic coast, hills, grass,
// shallow water and foam) or "classic" (the original faceted cylinders).
// Every island exposes userData.heightAt(localX, localZ) and userData.coast(angle) so the
// game can keep characters on the ground and know where the shore is.
export function makeIsland(isl, cfg) {
  const g = cfg.world.style === "classic" ? makeIslandClassic(isl, cfg) : makeIslandLush(isl, cfg);
  const builder = PROPS[isl.props];
  const anim = builder ? builder(g, isl, cfg, rng(hashStr(isl.id) + 1)) : null;
  const own = g.userData.update;
  g.userData.update = (t, dt, near) => { own?.(t, dt, near); anim?.(t, dt); };
  return g;
}

function makeIslandClassic(isl, cfg) {
  const top = cfg.world.islandTop;
  const r = rng(hashStr(isl.id));
  const g = new THREE.Group();
  g.position.set(isl.pos[0], 0, isl.pos[1]);
  const R = isl.radius;
  const sand = mesh(jitter(new THREE.CylinderGeometry(R + 0.9, R + 1.4, 0.7, 14, 1), 0.35, r), mat(isl.theme.sand), { receive: true });
  sand.position.y = top - 0.55;
  const grass = mesh(jitter(new THREE.CylinderGeometry(R, R + 0.3, 0.5, 14, 1), 0.25, r, 0), mat(isl.theme.grass), { receive: true });
  grass.position.y = top - 0.25;
  const rock = mesh(jitter(new THREE.CylinderGeometry(R + 1.2, R * 0.6, 3, 12, 2), 0.6, r), mat("#7d7468"), { cast: false });
  rock.position.y = -1.6;
  g.add(rock, sand, grass);
  scatterRocks(g, isl, top, r, () => top);
  g.userData.heightAt = () => top;
  g.userData.coast = () => 1;
  return g;
}

function scatterRocks(g, isl, top, r, heightAt, count = 9) {
  const R = isl.radius;
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, d = R * (0.66 + r() * 0.16);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (r() < 0.55) {
      const s = 0.2 + r() * 0.3;
      const st = mesh(jitter(new THREE.DodecahedronGeometry(s, 1), 0.08, r), mat("#a39a8c", { flatShading: false }));
      st.scale.y = 0.7; st.position.set(x, heightAt(x, z) + s * 0.25, z); g.add(st);
    } else {
      const s = 0.3 + r() * 0.25;
      const b = mesh(new THREE.IcosahedronGeometry(s, 1), mat(shade(isl.theme.grass, -0.16), { flatShading: false }));
      b.scale.y = 0.75; b.position.set(x, heightAt(x, z) + s * 0.45, z); g.add(b);
    }
  }
}

export function coastNoise(seed) {
  const r = rng(seed); const a1 = r() * 6, a2 = r() * 6, a3 = r() * 6;
  return (ang) => 1 + 0.07 * Math.sin(3 * ang + a1) + 0.045 * Math.sin(5 * ang + a2) + 0.025 * Math.sin(11 * ang + a3);
}
const lerpC = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, t)));
const smooth = (x, a, b) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function makeIslandLush(isl, cfg) {
  const TOP = cfg.world.islandTop, R = isl.radius, seed = hashStr(isl.id);
  const g = new THREE.Group(); g.position.set(isl.pos[0], 0, isl.pos[1]);
  const coast = coastNoise(seed), r = rng(seed);
  const p1 = r() * 6, p2 = r() * 6;
  // Gentle hills, flattened in the middle so props and keepers stand level.
  const hill = (x, z) => {
    const d = Math.hypot(x, z) / R;
    return (0.12 * Math.sin(x * 0.65 + p1) * Math.cos(z * 0.55 + p2) + 0.05 * Math.sin(x * 1.6 + z * 1.2 + p1)) * smooth(d, 0.3, 0.6);
  };
  const heightAt = (x, z) => {
    const ang = Math.atan2(z, x), k = Math.hypot(x, z) / (R * coast(ang));
    const beach = smooth(k, 0.8, 1.0);
    return TOP + hill(x, z) * (1 - beach) - beach * 0.42;
  };
  // Top surface: a dense disk with vertex-colour gradients from grass to wet sand.
  const rings = 16, segs = 72, pos = [], col = [], idx = [];
  const grassLo = new THREE.Color(isl.theme.grass).offsetHSL(0, 0.05, -0.08), grassHi = new THREE.Color(isl.theme.grass).offsetHSL(-0.02, 0.08, 0.07);
  const sand = new THREE.Color(isl.theme.sand), wet = new THREE.Color(isl.theme.sand).offsetHSL(0, -0.05, -0.12);
  pos.push(0, heightAt(0, 0), 0); col.push(...lerpC(grassLo, grassHi, 0.5).toArray());
  for (let i = 1; i <= rings; i++) for (let j = 0; j < segs; j++) {
    const ang = (j / segs) * Math.PI * 2, k = i / rings, rr = R * k * coast(ang);
    const x = Math.cos(ang) * rr, z = Math.sin(ang) * rr;
    pos.push(x, heightAt(x, z), z);
    const c = lerpC(grassLo, grassHi, hill(x, z) / 0.17 * 0.5 + 0.5).lerp(sand, smooth(k, 0.8, 0.9)).lerp(wet, smooth(k, 0.95, 1.0));
    col.push(c.r, c.g, c.b);
  }
  for (let j = 0; j < segs; j++) idx.push(0, 1 + ((j + 1) % segs), 1 + j);
  for (let i = 1; i < rings; i++) for (let j = 0; j < segs; j++) {
    const a = 1 + (i - 1) * segs + j, b = 1 + (i - 1) * segs + ((j + 1) % segs);
    idx.push(a, b, b + segs, a, b + segs, a + segs);
  }
  const topGeo = new THREE.BufferGeometry();
  topGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  topGeo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  topGeo.setIndex(idx); topGeo.computeVertexNormals();
  const topMesh = new THREE.Mesh(topGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  topMesh.receiveShadow = true; g.add(topMesh);
  // Cliff: a lathe profile bent to the same coastline, with layered rock colours.
  const prof = [[1.0, TOP - 0.42], [1.02, TOP - 0.7], [0.97, -0.3], [0.9, -1.2], [0.7, -2.6]].map(([k, y]) => new THREE.Vector2(R * k, y));
  const cliffGeo = new THREE.LatheGeometry(prof, segs);
  const cp = cliffGeo.attributes.position, cc = [];
  const strata = ["#c9b48a", "#a88f6c", "#8c7a63", "#76685a", "#5f5850"];
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i), z = cp.getZ(i), y = cp.getY(i), ang = Math.atan2(z, x), sc = coast(ang);
    cp.setX(i, x * sc); cp.setZ(i, z * sc);
    const t = Math.max(0, Math.min(strata.length - 1.001, ((TOP - 0.4 - y) / 3.2) * strata.length + Math.sin(ang * 9) * 0.3));
    const c = lerpC(strata[Math.floor(t)], strata[Math.floor(t) + 1], t % 1);
    cc.push(c.r, c.g, c.b);
  }
  cliffGeo.setAttribute("color", new THREE.Float32BufferAttribute(cc, 3)); cliffGeo.computeVertexNormals();
  const cliff = new THREE.Mesh(cliffGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  cliff.castShadow = true; g.add(cliff);
  // Shallow water and a breathing foam line that follow the coastline.
  const ringMesh = (inner, outer, color, opacity, y) => {
    const geo = new THREE.RingGeometry(inner, outer, segs, 1); geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), sc = coast(Math.atan2(z, x)); p.setX(i, x * sc); p.setZ(i, z * sc); }
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    m.position.y = y; m.renderOrder = 2; return m;
  };
  const sh = cfg.world.shallow || { opacity: 0.13, inner: 0.24 };
  const foam = ringMesh(R * 0.97, R * 1.06, "#ffffff", 0.7, 0.18);
  g.add(ringMesh(R * 0.98, R * 1.6, "#7fe3df", sh.opacity, 0.16), ringMesh(R * 0.98, R * 1.25, "#a8f0e6", sh.inner, 0.17), foam);
  // Grass tufts: instanced, with colour variation and a gentle sway near the camera.
  const N = cfg.world.grassPerIsland ?? 600;
  const tuft = new THREE.InstancedMesh(new THREE.ConeGeometry(0.045, 0.3, 3), new THREE.MeshStandardMaterial({ roughness: 1 }), N);
  const dummy = new THREE.Object3D(), base = [];
  for (let i = 0; i < N; i++) {
    const ang = r() * Math.PI * 2, k = Math.sqrt(r()) * 0.78, rr = R * k * coast(ang);
    const x = Math.cos(ang) * rr, z = Math.sin(ang) * rr;
    base.push([x, heightAt(x, z) + 0.12, z, r() * 6, 0.7 + r() * 0.7]);
    tuft.setColorAt(i, new THREE.Color(isl.theme.grass).offsetHSL((r() - 0.5) * 0.05, 0.1, -0.12 + r() * 0.14));
  }
  const place = (t) => {
    for (let i = 0; i < N; i++) {
      const [x, y, z, o, sc] = base[i];
      dummy.position.set(x, y, z); dummy.rotation.set(Math.sin(t * 1.8 + o + x) * 0.18, o, Math.cos(t * 1.5 + o + z) * 0.18);
      dummy.scale.setScalar(sc); dummy.updateMatrix(); tuft.setMatrixAt(i, dummy.matrix);
    }
    tuft.instanceMatrix.needsUpdate = true;
  };
  place(0);
  tuft.receiveShadow = true; g.add(tuft);
  scatterRocks(g, isl, TOP, r, heightAt, 7);
  g.userData.heightAt = heightAt;
  g.userData.coast = coast;
  g.userData.update = (t, dt, near) => {
    foam.material.opacity = 0.45 + Math.sin(t * 1.6) * 0.25;
    foam.scale.setScalar(1 + Math.sin(t * 1.6) * 0.012);
    if (near) place(t);
  };
  return g;
}

export function makeSky(cfg) {
  const s = cfg.world.skyGradient || { top: "#5b9fd6", mid: "#a9d4f2", horizon: "#ffe6c7" };
  const geo = new THREE.SphereGeometry(180, 32, 16), p = geo.attributes.position, c = [];
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 180;
    const col = y > 0.15 ? lerpC(s.mid, s.top, (y - 0.15) / 0.85) : lerpC(s.horizon, s.mid, (y + 0.2) / 0.35);
    c.push(col.r, col.g, col.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
}

function shade(hex, amt) { const c = new THREE.Color(hex); const hsl = {}; c.getHSL(hsl); c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt))); return "#" + c.getHexString(); }

// Round two-tone tree.
function tree(r, scale = 1, leaf = "#5aa252") {
  const t = new THREE.Group();
  const trunk = mesh(new THREE.CylinderGeometry(0.1 * scale, 0.16 * scale, 1.0 * scale, 6), mat("#7a5232"));
  trunk.position.y = 0.5 * scale; t.add(trunk);
  const c1 = mesh(new THREE.IcosahedronGeometry(0.75 * scale, 1), mat(leaf)); c1.position.y = 1.35 * scale;
  const c2 = mesh(new THREE.IcosahedronGeometry(0.5 * scale, 1), mat(shade(leaf, 0.08))); c2.position.set(0.25 * scale, 1.75 * scale, 0.15 * scale);
  c1.rotation.y = r() * 3; t.add(c1, c2);
  return t;
}
function lantern(color = "#ffcf6b") {
  const l = new THREE.Group();
  const post = mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.3, 5), mat("#4b3a2a")); post.position.y = 0.65;
  const lamp = mesh(new THREE.OctahedronGeometry(0.16, 0), glow(color, 3)); lamp.position.y = 1.4;
  l.add(post, lamp); return l;
}

// Prop builders: (group, island, config, rng) => optional per-frame update(t, dt)
export const PROPS = {
  docks(g, isl, cfg, r) {
    const top = cfg.world.islandTop;
    const wood = mat("#9b6b43"), dark = mat("#6e4a2c");
    const pier = new THREE.Group();
    for (let i = 0; i < 12; i++) {
      const p = mesh(new THREE.BoxGeometry(1.8, 0.14, 0.42), i % 2 ? wood : mat("#a8774c"), { receive: true });
      p.position.set(0, top - 0.12, -isl.radius + 1.6 - i * 0.48); pier.add(p);
    }
    for (const sx of [-0.85, 0.85]) for (let i = 0; i < 3; i++) {
      const post = mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.4, 5), dark);
      post.position.set(sx, top - 0.4, -isl.radius - i * 1.6); pier.add(post);
    }
    pier.rotation.y = -0.6; g.add(pier);
    // Crates stacked with glowing token labels.
    const cols = ["#ffb347", "#7ad1ff", "#ff7eb6", "#b48cff"];
    for (let i = 0; i < 6; i++) {
      const s = 0.55;
      const c = mesh(new THREE.BoxGeometry(s, s, s), mat("#b78a5a"));
      c.position.set(1.8 + (i % 3) * 0.6, top + s / 2 + Math.floor(i / 3) * s, -1.2 + (i % 2) * 0.1);
      c.rotation.y = (r() - 0.5) * 0.3; g.add(c);
      const band = mesh(new THREE.BoxGeometry(s * 1.02, 0.08, s * 1.02), glow(cols[i % 4], 1.6));
      band.position.copy(c.position); band.rotation.y = c.rotation.y; g.add(band);
    }
    const boat = new THREE.Group();
    const hull = mesh(new THREE.BoxGeometry(1.0, 0.4, 2.2), mat("#c0573e")); hull.position.y = 0.1; boat.add(hull);
    const deck = mesh(new THREE.BoxGeometry(0.8, 0.06, 1.9), mat("#d9b98a")); deck.position.y = 0.32; boat.add(deck);
    const mast = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 5), dark); mast.position.y = 1.1; boat.add(mast);
    const sail = mesh(new THREE.ConeGeometry(0.6, 1.2, 3), mat("#f3ead8")); sail.position.set(0, 1.15, 0.25); sail.scale.z = 0.15; boat.add(sail);
    boat.position.set(-3.6, 0.05, -isl.radius - 1.6); g.add(boat);
    const l1 = lantern(); l1.position.set(-1.6, top, -isl.radius + 1.2); g.add(l1);
    const l2 = lantern(); l2.position.set(2.8, top, 1.8); g.add(l2);
    const t1 = tree(r, 1.1); t1.position.set(-3, top, 2.6); g.add(t1);
    return (t) => { boat.position.y = 0.05 + Math.sin(t * 1.3) * 0.1; boat.rotation.z = Math.sin(t * 1.1) * 0.08; };
  },
  garden(g, isl, cfg, r) {
    const top = cfg.world.islandTop;
    const petals = ["#ff7eb6", "#ffd166", "#b48cff", "#ff8f6b", "#7ad1ff", "#ffffff"];
    const flowers = [];
    for (let i = 0; i < 46; i++) {
      const a = r() * Math.PI * 2, d = 1.2 + r() * (isl.radius - 2);
      const f = new THREE.Group();
      const stem = mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.45, 4), mat("#3f8a3a"), { cast: false }); stem.position.y = 0.22;
      const head = mesh(new THREE.IcosahedronGeometry(0.13, 0), glow(petals[i % petals.length], 0.6)); head.position.y = 0.5;
      f.add(stem, head); f.position.set(Math.cos(a) * d, top, Math.sin(a) * d); g.add(f); flowers.push(f);
    }
    for (let i = 0; i < 4; i++) { const t = tree(r, 0.9 + r() * 0.4, "#5fae52"); const a = i * 1.7 + 0.4; t.position.set(Math.cos(a) * 4.3, top, Math.sin(a) * 4.3); g.add(t); }
    const arch = new THREE.Group();
    const ring = mesh(new THREE.TorusGeometry(1, 0.1, 6, 14, Math.PI), mat("#f3ead8")); ring.position.y = 1.2; arch.add(ring);
    for (const s of [-1, 1]) { const p = mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.2, 6), mat("#f3ead8")); p.position.set(s, 0.6, 0); arch.add(p); }
    arch.position.set(0, top, -2.6); g.add(arch);
    return (t) => { flowers.forEach((f, i) => { f.rotation.z = Math.sin(t * 1.5 + i) * 0.12; }); };
  },
  lighthouse(g, isl, cfg) {
    const top = cfg.world.islandTop;
    const tower = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const seg = mesh(new THREE.CylinderGeometry(0.95 - i * 0.08, 1.0 - i * 0.08, 0.9, 10), mat(i % 2 ? "#f5f1ea" : "#d94f45"));
      seg.position.y = 0.45 + i * 0.9; tower.add(seg);
    }
    const deck = mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.12, 10), mat("#333")); deck.position.y = 5.45; tower.add(deck);
    const lamp = mesh(new THREE.IcosahedronGeometry(0.42, 1), glow("#ffe066", 4)); lamp.position.y = 5.95; tower.add(lamp);
    const roof = mesh(new THREE.ConeGeometry(0.75, 0.8, 10), mat("#d94f45")); roof.position.y = 6.65; tower.add(roof);
    const beamGeo = new THREE.ConeGeometry(1.8, 12, 16, 1, true); beamGeo.translate(0, -6, 0); beamGeo.rotateZ(Math.PI / 2);
    const beamMat = new THREE.MeshBasicMaterial({ color: "#fff3b0", transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const beam = new THREE.Mesh(beamGeo, beamMat); beam.position.y = 5.95; tower.add(beam);
    tower.position.set(1.8, top, -1.2); g.add(tower);
    const house = mesh(new THREE.BoxGeometry(1.6, 1.1, 1.3), mat("#f0e6d2")); house.position.set(-2.2, top + 0.55, 1.6);
    const roof2 = mesh(new THREE.ConeGeometry(1.25, 0.8, 4), mat("#5a6f8c")); roof2.position.set(-2.2, top + 1.5, 1.6); roof2.rotation.y = Math.PI / 4;
    g.add(house, roof2);
    return (t) => { beam.rotation.y = t * 0.8; };
  },
  forge(g, isl, cfg, r) {
    const top = cfg.world.islandTop;
    const stone = mat("#8a8177");
    const furnace = mesh(new THREE.BoxGeometry(2.2, 1.8, 1.8), stone); furnace.position.set(1.6, top + 0.9, -1.4); g.add(furnace);
    const mouth = mesh(new THREE.BoxGeometry(0.9, 0.7, 0.1), glow("#ff6a2b", 4)); mouth.position.set(1.6, top + 0.7, -0.48); g.add(mouth);
    const chimney = mesh(new THREE.CylinderGeometry(0.3, 0.38, 2.2, 6), stone); chimney.position.set(2.2, top + 2.6, -1.8); g.add(chimney);
    const anvil = new THREE.Group();
    const b1 = mesh(new THREE.BoxGeometry(0.5, 0.5, 0.4), mat("#3b3b3f")); b1.position.y = 0.25;
    const b2 = mesh(new THREE.BoxGeometry(1.1, 0.25, 0.45), mat("#4a4a50")); b2.position.y = 0.62;
    anvil.add(b1, b2); anvil.position.set(-0.8, top, -0.6); g.add(anvil);
    const valley = new THREE.Group(); // a little "loss valley" sculpture
    const curve = mesh(new THREE.TorusGeometry(1.0, 0.08, 6, 16, Math.PI), glow("#ff6a2b", 1.2)); curve.rotation.z = Math.PI; curve.position.y = 1.3;
    const ball = mesh(new THREE.SphereGeometry(0.14, 10, 8), glow("#ffd166", 2.5)); valley.add(curve, ball);
    valley.position.set(-2.6, top, 2.0); g.add(valley);
    const embers = [];
    for (let i = 0; i < 14; i++) { const e = mesh(new THREE.OctahedronGeometry(0.06, 0), glow("#ffae42", 3), { cast: false }); e.userData.o = r() * 10; g.add(e); embers.push(e); }
    const tr = tree(r, 1, "#6a8f45"); tr.position.set(-3.6, top, -2.4); g.add(tr);
    return (t) => {
      const a = Math.sin(t * 1.2) * 1.2; ball.position.set(Math.sin(a) * 1.0, 1.3 - Math.cos(a) * 1.0, 0);
      embers.forEach((e) => { const k = (t * 0.6 + e.userData.o) % 3; e.position.set(2.2 + Math.sin(e.userData.o * 5 + k) * 0.4, top + 3.7 + k * 1.2, -1.8 + Math.cos(e.userData.o * 3) * 0.3); e.scale.setScalar(1 - k / 3); });
    };
  },
  library(g, isl, cfg, r) {
    const top = cfg.world.islandTop;
    const marble = mat("#efe8da");
    const base = mesh(new THREE.BoxGeometry(4.2, 0.3, 3), marble, { receive: true }); base.position.set(0.4, top + 0.15, -1.2); g.add(base);
    const hall = mesh(new THREE.BoxGeometry(3.4, 2.0, 2.0), mat("#e3d8c4")); hall.position.set(0.4, top + 1.3, -1.6); g.add(hall);
    for (let i = 0; i < 5; i++) { const c = mesh(new THREE.CylinderGeometry(0.13, 0.15, 2.0, 8), marble); c.position.set(-1.2 + i * 0.8, top + 1.3, -0.35); g.add(c); }
    const tri = new THREE.Shape([new THREE.Vector2(-2.0, 0), new THREE.Vector2(2.0, 0), new THREE.Vector2(0, 1.0)]);
    const roofGeo = new THREE.ExtrudeGeometry(tri, { depth: 2.7, bevelEnabled: false }); roofGeo.translate(0, 0, -1.35);
    const roof = mesh(roofGeo, mat("#3f6e8c")); roof.position.set(0.4, top + 2.3, -1.25); g.add(roof);
    const books = [];
    const bc = ["#7ad1ff", "#ffd166", "#ff7eb6", "#b48cff", "#8fe388"];
    for (let i = 0; i < 7; i++) { const b = mesh(new THREE.BoxGeometry(0.4, 0.08, 0.3), glow(bc[i % 5], 1.4)); b.userData.o = (i / 7) * Math.PI * 2; g.add(b); books.push(b); }
    const t1 = tree(r, 1, "#4f9a6a"); t1.position.set(-3.4, top, 1.8); g.add(t1);
    const l1 = lantern("#7ad1ff"); l1.position.set(2.8, top, 1.4); g.add(l1);
    return (t) => { books.forEach((b) => { const a = b.userData.o + t * 0.5; b.position.set(-1.6 + Math.cos(a) * 1.2, top + 2.0 + Math.sin(t * 1.3 + b.userData.o) * 0.25, 2.2 + Math.sin(a) * 1.2); b.rotation.y = -a; }); };
  },
  workshop(g, isl, cfg, r) {
    const top = cfg.world.islandTop;
    const shed = mesh(new THREE.BoxGeometry(2.6, 1.6, 2.0), mat("#8c6a4a")); shed.position.set(1.4, top + 0.8, -1.6); g.add(shed);
    const roof = mesh(new THREE.ConeGeometry(2.0, 0.9, 4), mat("#5c4a7a")); roof.position.set(1.4, top + 2.05, -1.6); roof.rotation.y = Math.PI / 4; g.add(roof);
    function gear(R, teeth, color) {
      const gg = new THREE.Group();
      gg.add(mesh(new THREE.CylinderGeometry(R, R, 0.2, 16), mat(color, { metalness: 0.5, roughness: 0.4 })));
      for (let i = 0; i < teeth; i++) { const tth = mesh(new THREE.BoxGeometry(0.22, 0.2, 0.3), mat(color, { metalness: 0.5, roughness: 0.4 })); const a = (i / teeth) * Math.PI * 2; tth.position.set(Math.cos(a) * R, 0, Math.sin(a) * R); tth.rotation.y = -a; gg.add(tth); }
      gg.add(mesh(new THREE.CylinderGeometry(R * 0.3, R * 0.3, 0.24, 8), glow("#b48cff", 2)));
      gg.rotation.x = Math.PI / 2; return gg;
    }
    const g1 = gear(0.9, 10, "#c9a227"); g1.position.set(-1.4, top + 1.5, -1.0);
    const g2 = gear(0.55, 7, "#b0b6c2"); g2.position.set(-0.05, top + 1.95, -1.0);
    g.add(g1, g2);
    const stand = mesh(new THREE.BoxGeometry(0.2, 1.6, 0.2), mat("#5b4636")); stand.position.set(-1.4, top + 0.75, -1.0); g.add(stand);
    // A tiny robot assistant made of boxes.
    const bot = new THREE.Group();
    const body = mesh(new THREE.BoxGeometry(0.5, 0.5, 0.4), mat("#d9dde6")); body.position.y = 0.55;
    const head = mesh(new THREE.BoxGeometry(0.4, 0.3, 0.35), mat("#d9dde6")); head.position.y = 0.98;
    const eye = mesh(new THREE.BoxGeometry(0.28, 0.07, 0.02), glow("#7ad1ff", 3)); eye.position.set(0, 1.0, 0.18);
    const legs = mesh(new THREE.BoxGeometry(0.4, 0.3, 0.3), mat("#6b6f7a")); legs.position.y = 0.15;
    bot.add(body, head, eye, legs); bot.position.set(2.6, top, 1.6); g.add(bot);
    const t1 = tree(r, 1, "#5a9a58"); t1.position.set(-3.2, top, 2.2); g.add(t1);
    return (t) => { g1.rotation.y = t * 0.8; g2.rotation.y = -t * 0.8 * (10 / 7); bot.rotation.y = Math.sin(t * 0.7) * 1.2; bot.position.y = top + Math.abs(Math.sin(t * 3)) * 0.06; };
  },
  gate(g, isl, cfg) {
    const top = cfg.world.islandTop;
    const stone = mat("#e9e4d8");
    for (const s of [-1, 1]) {
      const p = mesh(new THREE.BoxGeometry(0.8, 4.2, 0.8), stone); p.position.set(s * 2.2, top + 2.1, -1.2); g.add(p);
      const cap = mesh(new THREE.BoxGeometry(1.1, 0.3, 1.1), mat("#c9a227", { metalness: 0.6, roughness: 0.35 })); cap.position.set(s * 2.2, top + 4.35, -1.2); g.add(cap);
    }
    const lintel = mesh(new THREE.BoxGeometry(5.4, 0.5, 0.9), stone); lintel.position.set(0, top + 4.6, -1.2); g.add(lintel);
    const ring = mesh(new THREE.TorusGeometry(1.5, 0.12, 8, 32), mat("#c9a227", { metalness: 0.6, roughness: 0.35 })); ring.position.set(0, top + 2.2, -1.2); g.add(ring);
    const portalMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false });
    const portal = new THREE.Mesh(new THREE.CircleGeometry(1.4, 32), portalMat); portal.position.copy(ring.position); g.add(portal);
    const sockets = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 2;
      const s = mesh(new THREE.OctahedronGeometry(0.2, 0), mat("#555a66")); s.position.set(Math.cos(a) * 1.5, top + 2.2 + Math.sin(a) * 1.5, -1.05); g.add(s); sockets.push(s);
    }
    g.userData.sockets = sockets; g.userData.portal = portal; g.userData.ring = ring;
    return (t) => { ring.rotation.z = t * 0.2; sockets.forEach((s, i) => { s.rotation.y = t + i; }); };
  },
};

// ---------- Characters ----------
// Chibi-style characters: big head with eyes and cheeks, bell-shaped robe, arms and boots,
// and a hat per keeper. userData.animate(t, dt, state) drives walking, idling and waving.
// state: { walking: bool, wave: bool }
const soft = (color, o = {}) => mat(color, { flatShading: false, roughness: 0.75, ...o });
const HATS = {
  wizard(c, d) { const g = new THREE.Group(); const brim = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 20), soft(d)); const cone = mesh(new THREE.ConeGeometry(0.25, 0.5, 16), soft(d)); cone.position.y = 0.26; cone.rotation.z = 0.12; g.add(brim, cone); return g; },
  straw(c, d) { const g = new THREE.Group(); const brim = mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.035, 22), soft("#e4c06a")); const crown = mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.2, 18), soft("#e4c06a")); crown.position.y = 0.11; const band = mesh(new THREE.CylinderGeometry(0.265, 0.265, 0.06, 18), soft(d)); band.position.y = 0.05; g.add(brim, crown, band); return g; },
  cap(c, d) { const g = new THREE.Group(); const dome = mesh(new THREE.SphereGeometry(0.285, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), soft(d)); const visor = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 16, 1, false, -Math.PI / 2, Math.PI), soft(d)); visor.position.set(0, 0.01, 0.16); visor.scale.set(1.1, 1, 1.4); g.add(dome, visor); return g; },
  hood(c) { const g = new THREE.Group(); const hood = mesh(new THREE.SphereGeometry(0.33, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), soft(c)); hood.position.y = -0.1; hood.rotation.x = -0.35; g.add(hood); return g; },
  goggles(c, d) { const g = new THREE.Group(); const band = mesh(new THREE.TorusGeometry(0.28, 0.035, 8, 24), soft("#3a3a3a")); band.rotation.x = Math.PI / 2; band.position.y = -0.04;
    for (const sx of [-0.1, 0.1]) { const lens = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 14), soft("#c9a227", { metalness: 0.6, roughness: 0.3 })); lens.rotation.x = Math.PI / 2; lens.position.set(sx, 0.02, 0.25); const glass = mesh(new THREE.CircleGeometry(0.055, 14), glow("#7ad1ff", 1.2)); glass.position.set(sx, 0.02, 0.281); g.add(lens, glass); }
    g.add(band); return g; },
  crown(c, d) { const g = new THREE.Group(); const ring = mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.12, 16, 1, true), soft("#e0b83a", { metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide })); ring.position.y = 0.04; g.add(ring);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const sp = mesh(new THREE.ConeGeometry(0.035, 0.1, 6), soft("#e0b83a", { metalness: 0.7, roughness: 0.3 })); sp.position.set(Math.cos(a) * 0.2, 0.15, Math.sin(a) * 0.2); g.add(sp); }
    const gem = mesh(new THREE.OctahedronGeometry(0.04, 0), glow("#ffffff", 2)); gem.position.set(0, 0.06, 0.215); g.add(gem); return g; },
  none() { return new THREE.Group(); },
};

export function makeCharacter(colors, { hat = "wizard", hair = "#3b2a20", lanternColor = null, scale = 1.15 } = {}) {
  const [cloak, skin, detail] = colors;
  const c = new THREE.Group();
  const rig = new THREE.Group(); c.add(rig);
  // Robe: smooth bell shape.
  const robeProf = [[0.0, 0.08], [0.36, 0.1], [0.34, 0.3], [0.27, 0.55], [0.2, 0.74], [0.0, 0.78]].map(([x, y]) => new THREE.Vector2(x, y));
  const robe = mesh(new THREE.LatheGeometry(robeProf, 20), soft(cloak)); rig.add(robe);
  const hem = mesh(new THREE.TorusGeometry(0.35, 0.03, 6, 24), soft(detail)); hem.rotation.x = Math.PI / 2; hem.position.y = 0.11; rig.add(hem);
  const belt = mesh(new THREE.TorusGeometry(0.255, 0.035, 6, 20), soft(detail)); belt.rotation.x = Math.PI / 2; belt.position.y = 0.5; rig.add(belt);
  const buckle = mesh(new THREE.BoxGeometry(0.08, 0.07, 0.03), soft("#e0b83a", { metalness: 0.6, roughness: 0.3 })); buckle.position.set(0, 0.5, 0.265); rig.add(buckle);
  // Boots peeking out under the robe.
  const legs = [];
  for (const sx of [-0.12, 0.12]) {
    const leg = new THREE.Group(); leg.position.set(sx, 0.12, 0);
    const boot = mesh(new THREE.SphereGeometry(0.085, 12, 8), soft("#4a3324")); boot.scale.set(1, 0.7, 1.4); boot.position.set(0, -0.06, 0.04); leg.add(boot);
    c.add(leg); legs.push(leg);
  }
  // Arms: sleeves with round hands, pivoting at the shoulder.
  const arms = [];
  for (const sx of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(sx * 0.24, 0.68, 0);
    const sleeve = mesh(new THREE.CapsuleGeometry(0.065, 0.24, 4, 10), soft(cloak)); sleeve.position.y = -0.17; arm.add(sleeve);
    const cuff = mesh(new THREE.TorusGeometry(0.065, 0.02, 6, 14), soft(detail)); cuff.rotation.x = Math.PI / 2; cuff.position.y = -0.3; arm.add(cuff);
    const hand = mesh(new THREE.SphereGeometry(0.065, 12, 10), soft(skin)); hand.position.y = -0.36; arm.add(hand);
    arm.rotation.z = sx * 0.18; rig.add(arm); arms.push(arm);
  }
  // Head: large and smooth, with eyes, highlights, cheeks and hair.
  const head = new THREE.Group(); head.position.y = 1.03; rig.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.28, 24, 18), soft(skin)); head.add(skull);
  const hairCap = mesh(new THREE.SphereGeometry(0.292, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), soft(hair)); hairCap.rotation.x = -0.35; head.add(hairCap);
  const eyes = [];
  for (const sx of [-0.095, 0.095]) {
    const eye = mesh(new THREE.SphereGeometry(0.05, 12, 10), soft("#1c1c24", { roughness: 0.3 }), { cast: false }); eye.position.set(sx, -0.01, 0.245); eye.scale.z = 0.6; head.add(eye); eyes.push(eye);
    const hl = mesh(new THREE.SphereGeometry(0.013, 8, 6), mat("#ffffff", { flatShading: false, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.6 }), { cast: false }); hl.position.set(sx + 0.014, 0.008, 0.272); head.add(hl);
    const cheek = mesh(new THREE.SphereGeometry(0.045, 10, 8), soft("#f28b8b", { transparent: true, opacity: 0.55 }), { cast: false }); cheek.position.set(sx * 1.55, -0.085, 0.215); cheek.scale.set(1, 0.6, 0.4); head.add(cheek);
  }
  const mouth = mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 10, Math.PI), soft("#7a3b3b"), { cast: false }); mouth.position.set(0, -0.085, 0.262); mouth.rotation.z = Math.PI; head.add(mouth);
  const hatObj = (HATS[hat === true ? "wizard" : hat] || HATS.none)(cloak, detail); hatObj.position.set(0, 0.2, -0.04); hatObj.rotation.x = hat === "hood" || hat === "goggles" ? 0 : -0.3; head.add(hatObj);
  // Explorer extras: a backpack and a lantern carried in the right hand.
  if (lanternColor) {
    const pack = mesh(new THREE.BoxGeometry(0.34, 0.38, 0.18), soft("#8a5a3a")); pack.position.set(0, 0.58, -0.3); rig.add(pack);
    const flap = mesh(new THREE.BoxGeometry(0.36, 0.1, 0.2), soft("#6e4529")); flap.position.set(0, 0.76, -0.3); rig.add(flap);
    const lan = new THREE.Group(); lan.position.set(0, -0.42, 0.02); arms[1].add(lan);
    const frame = mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.12, 6), soft("#3b2a20")); lan.add(frame);
    const flame = mesh(new THREE.OctahedronGeometry(0.06, 0), glow(lanternColor, 3)); flame.position.y = -0.02; lan.add(flame);
    c.userData.lantern = flame;
  }
  c.scale.setScalar(scale);
  let walkT = 0, wave = 0, blinkT = 2 + Math.random() * 3;
  c.userData.animate = (t, dt, { walking = false, wave: waving = false } = {}) => {
    walkT = walking ? walkT + dt * 9 : walkT * Math.exp(-dt * 10);
    const sw = walking ? Math.sin(walkT) : 0;
    wave += ((waving ? 1 : 0) - wave) * Math.min(1, dt * 6);
    rig.position.y = walking ? Math.abs(Math.sin(walkT)) * 0.06 : Math.sin(t * 2) * 0.012;
    rig.rotation.z = sw * 0.04;
    legs[0].position.z = sw * 0.09; legs[1].position.z = -sw * 0.09;
    arms[0].rotation.x = -sw * 0.6; arms[1].rotation.x = sw * 0.6;
    // Wave with the left arm while a player stands nearby.
    arms[0].rotation.z = -0.18 - wave * 2.3 + wave * Math.sin(t * 9) * 0.25;
    arms[1].rotation.z = 0.18 + Math.sin(t * 1.6) * 0.03;
    head.rotation.x = -0.14; // lift the face toward the isometric camera
    head.rotation.y = waving ? Math.sin(t * 1.2) * 0.15 : 0;
    head.rotation.z = walking ? sw * 0.05 : Math.sin(t * 0.9) * 0.03;
    blinkT -= dt;
    const blink = blinkT < 0.12 && blinkT > 0 ? 0.1 : 1;
    if (blinkT < 0) blinkT = 2.5 + Math.random() * 3;
    eyes.forEach((e) => { e.scale.y = blink; });
  };
  c.userData.animate(0, 0);
  return c;
}

export function makeMarker(color) {
  const m = mesh(new THREE.OctahedronGeometry(0.22, 0), glow(color, 2.6), { cast: false });
  m.scale.y = 1.5; return m;
}

// ---------- Bridges ----------
export function makeBridge(a, b, cfg) {
  const top = cfg.world.islandTop;
  const A = new THREE.Vector2(a.pos[0], a.pos[1]), B = new THREE.Vector2(b.pos[0], b.pos[1]);
  const dir = B.clone().sub(A).normalize();
  const start = A.clone().add(dir.clone().multiplyScalar(a.radius - 0.6));
  const end = B.clone().sub(dir.clone().multiplyScalar(b.radius - 0.6));
  const len = start.distanceTo(end);
  const n = Math.max(2, Math.ceil(len / 0.5));
  const g = new THREE.Group();
  const angle = Math.atan2(dir.x, dir.y);
  const planks = [];
  for (let i = 0; i < n; i++) {
    const p = start.clone().lerp(end, (i + 0.5) / n);
    const k = (i + 0.5) / n;
    const sag = Math.sin(k * Math.PI) * 0.18;
    const plank = mesh(new THREE.BoxGeometry(1.7, 0.12, 0.42), mat(i % 2 ? "#a8774c" : "#9b6b43"), { receive: true });
    plank.position.set(p.x, top - 0.02 - sag, p.y); plank.rotation.y = angle;
    plank.userData.y = plank.position.y; plank.scale.setScalar(0.001);
    g.add(plank); planks.push(plank);
    if (i % 3 === 0) for (const s of [-1, 1]) {
      const post = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 5), mat("#6e4a2c"));
      const off = new THREE.Vector2(dir.y, -dir.x).multiplyScalar(0.85 * s);
      post.position.set(p.x + off.x, top + 0.3 - sag, p.y + off.y); post.scale.setScalar(0.001); post.userData.y = post.position.y;
      g.add(post); planks.push(post);
    }
  }
  g.userData = { start, end, planks, built: 0 };
  return g;
}
