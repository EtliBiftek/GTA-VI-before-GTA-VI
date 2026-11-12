// Shared math helpers. Convention: heading h (radians) => forward = (sin h, 0, cos h).
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
export const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
/** Wrap angle to (-PI, PI]. */
export const wrapAngle = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
/** Shortest signed difference from a to b. */
export const angleDiff = (a, b) => wrapAngle(b - a);
/** Move angle a toward b by at most maxStep. */
export const turnToward = (a, b, maxStep) => { const d = angleDiff(a, b); return a + clamp(d, -maxStep, maxStep); };
/** Heading that faces from (ax,az) to (bx,bz). */
export const headingTo = (ax, az, bx, bz) => Math.atan2(bx - ax, bz - az);
/** Frame-rate independent damping factor. */
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
/** Deterministic PRNG (mulberry32) for procedural generation. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
