// Walking in the city (R31): where you can stand, and how a step slides along walls.
// The city is a set of square cells (a block with half a road around it); solids are building
// footprints { x0, x1, z0, z1, h } in world units.
export function makeWalker({ cells, pitch, block, solids = [], edge = 0.42, roadY = 0.12, blockY = 0.26 }) {
  const half = pitch / 2;
  const inCell = (x, z) => cells.some(([cx, cz]) => Math.abs(x - cx) <= half && Math.abs(z - cz) <= half);
  // Inside the city and at least `m` from the outer quay (shared roads between cells are open).
  const inCity = (x, z, m = edge) => inCell(x - m, z - m) && inCell(x + m, z - m) && inCell(x - m, z + m) && inCell(x + m, z + m);
  const blocked = (x, z, r) => solids.some((s) => x > s.x0 - r && x < s.x1 + r && z > s.z0 - r && z < s.z1 + r);
  const walkable = (x, z, r = 0.22) => inCity(x, z) && !blocked(x, z, r);
  const groundY = (x, z) => (cells.some(([cx, cz]) => Math.abs(x - cx) <= block / 2 && Math.abs(z - cz) <= block / 2) ? blockY : roadY);
  // Take a step; if the straight line is blocked, keep the part of it that is free (slide).
  function step(x, z, dx, dz) {
    if (walkable(x + dx, z + dz)) return [x + dx, z + dz, true];
    if (dx && walkable(x + dx, z)) return [x + dx, z, true];
    if (dz && walkable(x, z + dz)) return [x, z + dz, true];
    return [x, z, false];
  }
  // ----- route finding: a grid over the city, shortest path, then straightened -----
  const G = 0.25, xs = cells.map((c) => c[0]), zs = cells.map((c) => c[1]);
  const x0 = Math.min(...xs) - half, z0 = Math.min(...zs) - half, nx = Math.round((Math.max(...xs) + half - x0) / G), nz = Math.round((Math.max(...zs) + half - z0) / G);
  let free = null;
  const cx = (i) => x0 + (i + 0.5) * G, cz = (j) => z0 + (j + 0.5) * G, at = (i, j) => i >= 0 && j >= 0 && i < nx && j < nz && free[j * nx + i];
  const clear = (ax, az, bx, bz) => { const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.1)); for (let k = 0; k <= n; k++) if (!walkable(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n)) return false; return true; };
  // The way from (ax, az) to (bx, bz) as a list of points. If b can't be stood on, it ends as near as possible.
  function route(ax, az, bx, bz) {
    if (!free) { free = new Uint8Array(nx * nz); for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) free[j * nx + i] = walkable(cx(i), cz(j)) ? 1 : 0; }
    if (walkable(bx, bz) && clear(ax, az, bx, bz)) return [[bx, bz]];
    const si = Math.floor((ax - x0) / G), sj = Math.floor((az - z0) / G);
    let start = -1, best = 1e9; // nearest free cell to where you stand
    for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) if (at(si + di, sj + dj)) { const d = Math.hypot(cx(si + di) - ax, cz(sj + dj) - az); if (d < best) { best = d; start = (sj + dj) * nx + si + di; } }
    if (start < 0) return [];
    // Dijkstra over 8 neighbours (no cutting corners), visiting cells in order of distance walked.
    const dist = new Float32Array(nx * nz).fill(1e9), prev = new Int32Array(nx * nz).fill(-1), done = new Uint8Array(nx * nz), heap = [[0, start]]; dist[start] = 0;
    let goal = start, goalD = 1e9;
    while (heap.length) {
      let m = 0; for (let k = 1; k < heap.length; k++) if (heap[k][0] < heap[m][0]) m = k;
      const [d, c] = heap.splice(m, 1)[0]; if (done[c]) continue; done[c] = 1;
      const i = c % nx, j = (c - i) / nx, toB = Math.hypot(cx(i) - bx, cz(j) - bz);
      if (toB < goalD - 1e-6) { goalD = toB; goal = c; } if (toB < G * 0.75) break;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        if (!at(i + di, j + dj) || (di && dj && (!at(i + di, j) || !at(i, j + dj)))) continue;
        const n = (j + dj) * nx + i + di, nd = d + (di && dj ? 1.4142 : 1);
        if (nd < dist[n]) { dist[n] = nd; prev[n] = c; heap.push([nd, n]); }
      }
    }
    const pts = []; for (let c = goal; c >= 0; c = prev[c]) pts.unshift([cx(c % nx), cz((c - (c % nx)) / nx)]);
    if (walkable(bx, bz)) pts.push([bx, bz]);
    // Straighten: from each point go to the farthest later point that is in clear sight.
    const out = []; let px = ax, pz = az, k = 0;
    while (k < pts.length) { let far = k; for (let q = pts.length - 1; q > k; q--) if (clear(px, pz, pts[q][0], pts[q][1])) { far = q; break; } out.push(pts[far]); [px, pz] = pts[far]; k = far + 1; }
    return out;
  }
  // Call after adding a solid (a new decoration) so routes go round it.
  const invalidate = () => { free = null; };
  return { inCity, walkable, groundY, step, route, solids, invalidate };
}
