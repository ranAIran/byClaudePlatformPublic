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
  return { inCity, walkable, groundY, step, solids };
}
