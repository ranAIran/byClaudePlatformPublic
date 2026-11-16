// The camera sits on a sphere around the point you look at (R29). Yaw turns it around the vertical
// axis, pitch tilts it between the ground and straight overhead.
export const ISO = { yaw: Math.PI / 4, pitch: Math.atan(1.05 / Math.SQRT2) }; // the classic corner view
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Offset from the target to the camera.
export function orbitOffset(yaw, pitch, dist) {
  const c = Math.cos(pitch) * dist;
  return [Math.sin(yaw) * c, Math.sin(pitch) * dist, Math.cos(yaw) * c];
}
// Ground directions for dragging: `right` is across the screen, `forward` is away from the camera.
export function panBasis(yaw) {
  return { right: [Math.cos(yaw), 0, -Math.sin(yaw)], forward: [-Math.sin(yaw), 0, -Math.cos(yaw)] };
}
// The short way round from angle a to angle b, in (-π, π].
export function turn(a, b) {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI; else if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}
