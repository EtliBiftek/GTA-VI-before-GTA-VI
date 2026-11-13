// Small procedural shape helpers (domes, minarets, cones, tubes) for the landmark architecture. They add to Batch objects.
import { C, shade } from './geo.js';

/** hemispherical / elliptical dome (profile rings), ribbed colouring. */
export function dome(S, cx, y0, cz, R, h, col, sides = 12, rings = 5) {
  const rs = [];
  for (let k = 0; k <= rings; k++) { const a = k / rings * Math.PI / 2; rs.push({ x: cx, y: y0 + h * Math.sin(a), z: cz, r: Math.max(0.02, R * Math.cos(a)), v: k }); }
  S.sweep(rs, sides, (i, k) => shade(col, (k % 2 ? 0.93 : 1.04) * (0.86 + 0.14 * (i / rings))));
}
export function cone(S, cx, y0, cz, r, h, col, sides = 8) {
  S.sweep([{ x: cx, y: y0, z: cz, r, v: 0 }, { x: cx, y: y0 + h, z: cz, r: 0.03, v: 1 }], sides, col);
}
/** slender minaret: square base, shaft, one or two balconies, lead cone, gold finial. */
export function minaret(S, x, z, h, o = {}) {
  const stone = C(o.stone ?? 0xefe6d2), lead = C(o.lead ?? 0x6c7a8c), r = o.r ?? 1.05;
  S.box(x - 1.7, 0, z - 1.7, x + 1.7, 7, z + 1.7, stone);
  S.box(x - 1.9, 6.6, z - 1.9, x + 1.9, 7.2, z + 1.9, shade(stone, 0.9));
  S.sweep([{ x, y: 7, z, r: r * 1.35, v: 0 }, { x, y: 8.5, z, r, v: 1 }, { x, y: h, z, r: r * 0.92, v: 2 }], 10, stone);
  for (const yb of o.twin ? [h * 0.62, h * 0.86] : [h * 0.82]) {
    S.cyl(x, yb, z, r * 1.7, r * 1.7, 0.35, 10, shade(stone, 0.85));
    S.cyl(x, yb + 0.35, z, r * 1.55, r * 1.55, 0.9, 10, shade(stone, 0.7), false);
  }
  S.cyl(x, h, z, r * 1.45, r * 1.45, 0.35, 10, shade(stone, 0.85));
  S.sweep([{ x, y: h + 0.3, z, r: r * 0.95, v: 0 }, { x, y: h + 7.5, z, r: 0.05, v: 1 }], 10, lead);
  S.box(x - 0.05, h + 7.2, z - 0.05, x + 0.05, h + 8.6, z + 0.05, C(0xe8c060));
}
/** round tube along points [[x,y,z],...] with radius r (parallel-transport-ish frames). */
export function tube(S, pts, r, sides, col) {
  const base = S.n, n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    // right = t x up
    let rx = ty * 0 - tz * 1, ry = tz * 0 - tx * 0, rz = tx * 1 - ty * 0; let rl = Math.hypot(rx, ry, rz);
    if (rl < 1e-4) { rx = 1; ry = 0; rz = 0; rl = 1; }
    rx /= rl; ry /= rl; rz /= rl;
    const ux = ry * tz - rz * ty, uy = rz * tx - rx * tz, uz = rx * ty - ry * tx;
    for (let k = 0; k <= sides; k++) {
      const an = k / sides * Math.PI * 2, c = Math.cos(an), s = Math.sin(an);
      const nx = rx * c + ux * s, ny = ry * c + uy * s, nz = rz * c + uz * s;
      S._v([pts[i][0] + nx * r, pts[i][1] + ny * r, pts[i][2] + nz * r], nx, ny, nz, col, null);
    }
  }
  const rw = sides + 1;
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < sides; k++) { const a = base + i * rw + k, b = a + 1, c = a + rw, d = c + 1; S.idx.push(a, c, b, b, c, d); }
}
/** axis-aligned box from an arbitrary pair of world corners */
export function boxC(S, a, b, y0, y1, col, top = true) { S.box(Math.min(a[0], b[0]), y0, Math.min(a[1], b[1]), Math.max(a[0], b[0]), y1, Math.max(a[1], b[1]), col, top); }
