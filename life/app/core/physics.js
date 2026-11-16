// A tiny physics world for toys and rewards (R32): balls and coins that fall, bounce, roll, hit
// buildings and come to rest. No library: spheres against the ground, building boxes and the water.
export function createPhysics({ gravity = -20, groundY = () => 0, inCity = () => true, solids = [], waterY = 0 } = {}) {
  const bodies = [], events = [];
  const clampTo = (v, a, b) => Math.min(b, Math.max(a, v));
  function add(b) {
    const body = { p: [...b.p], v: [...(b.v || [0, 0, 0])], r: b.r ?? 0.15, bounce: b.bounce ?? 0.55, drag: b.drag ?? 1.0, life: b.life ?? Infinity, age: 0, asleep: false, kind: b.kind || "ball", home: b.home ? [...b.home] : null, data: b.data };
    bodies.push(body); return body;
  }
  function kick(b, vx, vy, vz) { b.v = [vx, vy, vz]; b.asleep = false; }
  // The floor under a point: the street or block, or a roof when the body is above a building.
  function floorAt(b) {
    let y = groundY(b.p[0], b.p[2]);
    for (const s of solids) if (b.p[0] > s.x0 && b.p[0] < s.x1 && b.p[2] > s.z0 && b.p[2] < s.z1 && b.p[1] >= s.h) y = Math.max(y, s.h);
    return y;
  }
  function hitWalls(b) {
    for (const s of solids) {
      if (b.p[1] >= s.h) continue; // above the roof line
      const cx = clampTo(b.p[0], s.x0, s.x1), cz = clampTo(b.p[2], s.z0, s.z1);
      let dx = b.p[0] - cx, dz = b.p[2] - cz, d = Math.hypot(dx, dz);
      if (d >= b.r) continue;
      if (d < 1e-6) { // centre is inside the box: leave by the nearest wall
        const outs = [[b.p[0] - s.x0, -1, 0], [s.x1 - b.p[0], 1, 0], [b.p[2] - s.z0, 0, -1], [s.z1 - b.p[2], 0, 1]].sort((a, c) => a[0] - c[0])[0];
        dx = outs[1]; dz = outs[2]; d = -outs[0];
      } else { dx /= d; dz /= d; }
      b.p[0] += dx * (b.r - d); b.p[2] += dz * (b.r - d);
      const vn = b.v[0] * dx + b.v[2] * dz;
      if (vn < 0) { b.v[0] -= (1 + b.bounce) * vn * dx; b.v[2] -= (1 + b.bounce) * vn * dz; }
    }
  }
  function step(dt) {
    for (let i = bodies.length - 1; i >= 0; i--) {
      const b = bodies[i]; b.age += dt;
      if (b.age > b.life) { bodies.splice(i, 1); events.push({ type: "gone", body: b }); continue; }
      if (b.asleep) continue;
      b.v[1] += gravity * dt;
      const n = Math.max(1, Math.ceil((Math.hypot(b.v[0], b.v[1], b.v[2]) * dt) / (b.r * 0.6))), h = dt / n; // small steps: no tunnelling
      let grounded = false, lost = false;
      for (let k = 0; k < n && !lost; k++) {
        b.p[0] += b.v[0] * h; b.p[1] += b.v[1] * h; b.p[2] += b.v[2] * h;
        hitWalls(b);
        if (inCity(b.p[0], b.p[2])) {
          const gy = floorAt(b);
          if (b.p[1] - b.r <= gy) {
            b.p[1] = gy + b.r; grounded = true;
            if (b.v[1] < 0) { b.v[1] *= -b.bounce; if (b.v[1] < 0.9) b.v[1] = 0; }
            const f = Math.max(0, 1 - b.drag * h * 2.2); b.v[0] *= f; b.v[2] *= f; // rolling friction
          }
        } else if (b.p[1] - b.r < waterY) {
          events.push({ type: "splash", body: b, at: [b.p[0], waterY, b.p[2]] });
          if (b.home) { b.p = [...b.home]; b.v = [0, 0, 0]; } else { bodies.splice(i, 1); }
          lost = true;
        }
      }
      if (!lost && grounded && b.v[1] === 0 && Math.hypot(b.v[0], b.v[2]) < 0.06) { b.v = [0, 0, 0]; b.asleep = true; }
    }
    return events.splice(0);
  }
  return { bodies, add, kick, step };
}
