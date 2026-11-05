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
export function makeIsland(isl, cfg) {
  const top = cfg.world.islandTop;
  const r = rng(hashStr(isl.id));
  const g = new THREE.Group();
  g.position.set(isl.pos[0], 0, isl.pos[1]);
  const R = isl.radius;
  // Sand rim, grass top and a rocky base that sinks under the water.
  const sand = mesh(jitter(new THREE.CylinderGeometry(R + 0.9, R + 1.4, 0.7, 14, 1), 0.35, r), mat(isl.theme.sand), { receive: true });
  sand.position.y = top - 0.55;
  const grass = mesh(jitter(new THREE.CylinderGeometry(R, R + 0.3, 0.5, 14, 1), 0.25, r, 0), mat(isl.theme.grass), { receive: true });
  grass.position.y = top - 0.25;
  const rock = mesh(jitter(new THREE.CylinderGeometry(R + 1.2, R * 0.6, 3, 12, 2), 0.6, r), mat("#7d7468"), { cast: false });
  rock.position.y = -1.6;
  g.add(rock, sand, grass);
  // Scattered rocks and bushes near the rim, kept clear of the middle where props stand.
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2, d = R * (0.7 + r() * 0.25);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (r() < 0.5) {
      const s = 0.25 + r() * 0.35;
      const st = mesh(jitter(new THREE.DodecahedronGeometry(s, 0), 0.1, r), mat("#9a9184"));
      st.position.set(x, top + s * 0.4, z); g.add(st);
    } else {
      const s = 0.35 + r() * 0.3;
      const b = mesh(jitter(new THREE.IcosahedronGeometry(s, 0), 0.12, r), mat(shade(isl.theme.grass, -0.18)));
      b.position.set(x, top + s * 0.6, z); g.add(b);
    }
  }
  const builder = PROPS[isl.props];
  const anim = builder ? builder(g, isl, cfg, r) : null;
  g.userData.update = anim || null;
  return g;
}

function shade(hex, amt) { const c = new THREE.Color(hex); const hsl = {}; c.getHSL(hsl); c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt))); return "#" + c.getHexString(); }

function tree(r, scale = 1, leaf = "#4f9a4a") {
  const t = new THREE.Group();
  const trunk = mesh(new THREE.CylinderGeometry(0.09 * scale, 0.14 * scale, 0.8 * scale, 5), mat("#7a5232"));
  trunk.position.y = 0.4 * scale; t.add(trunk);
  for (let i = 0; i < 3; i++) {
    const c = mesh(new THREE.ConeGeometry((0.75 - i * 0.18) * scale, 0.8 * scale, 7), mat(shade(leaf, i * 0.04)));
    c.position.y = (0.95 + i * 0.42) * scale; c.rotation.y = r() * 3; t.add(c);
  }
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
    for (let i = 0; i < 9; i++) {
      const p = mesh(new THREE.BoxGeometry(1.8, 0.14, 0.42), i % 2 ? wood : mat("#a8774c"), { receive: true });
      p.position.set(0, top - 0.05, -isl.radius + 0.2 - i * 0.48); pier.add(p);
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
export function makeCharacter(colors, { hat = true, lanternColor = null } = {}) {
  const [cloak, skin, detail] = colors;
  const c = new THREE.Group();
  const body = mesh(new THREE.CylinderGeometry(0.22, 0.36, 0.8, 7), mat(cloak)); body.position.y = 0.45;
  const head = mesh(new THREE.IcosahedronGeometry(0.24, 1), mat(skin)); head.position.y = 1.07;
  const belt = mesh(new THREE.CylinderGeometry(0.29, 0.3, 0.08, 7), mat(detail)); belt.position.y = 0.42;
  c.add(body, head, belt);
  if (hat) {
    const brim = mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.04, 10), mat(detail)); brim.position.y = 1.24;
    const crown = mesh(new THREE.ConeGeometry(0.22, 0.38, 8), mat(detail)); crown.position.y = 1.44;
    c.add(brim, crown);
  }
  const eyes = mesh(new THREE.BoxGeometry(0.2, 0.05, 0.02), mat("#1c1c24")); eyes.position.set(0, 1.1, 0.22); c.add(eyes);
  if (lanternColor) {
    const l = mesh(new THREE.OctahedronGeometry(0.1, 0), glow(lanternColor, 3)); l.position.set(0.34, 0.6, 0.12); c.add(l); c.userData.lantern = l;
    const pack = mesh(new THREE.BoxGeometry(0.36, 0.42, 0.2), mat("#8a5a3a")); pack.position.set(0, 0.62, -0.3); c.add(pack);
  }
  c.userData.body = body;
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
