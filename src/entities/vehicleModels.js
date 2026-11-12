// Neon Coast - procedural low-poly vehicle models, type stats and shared geometry/material caches.
// Models face +Z, y up, ground at y = 0. Local +X is the LEFT side (driver side) of the car.
import * as THREE from 'three';

/** Vehicle type stats. accel/brake m/s^2, speeds m/s, grip = lateral friction rate (1/s),
 *  steer = max steering angle (rad) at standstill, damageMul = damage multiplier (lower = tougher). */
export const TYPES = {
  sedan: {
    id: 'sedan', name: 'Sedan', halfW: 0.92, halfL: 2.25, height: 1.42, accel: 8.5, maxSpeed: 40, reverse: 9,
    brake: 20, grip: 9, steer: 0.6, wheelBase: 2.7, mass: 1300, damageMul: 1, wheelR: 0.35, wheelW: 0.26,
    colors: ['#c8333a', '#24364a', '#e9edf0', '#1c8f83', '#7d4fa0', '#9aa3ab', '#1b1b1f', '#3d6fb6', '#e58a2f'],
  },
  sports: {
    id: 'sports', name: 'Spor', halfW: 0.98, halfL: 2.2, height: 1.16, accel: 13, maxSpeed: 56, reverse: 10,
    brake: 26, grip: 10.5, steer: 0.62, wheelBase: 2.6, mass: 1200, damageMul: 1.1, wheelR: 0.35, wheelW: 0.3,
    colors: ['#ff2e88', '#f5d000', '#ff5a1f', '#16e0c4', '#e9edf0', '#111114', '#7a2cff'],
  },
  pickup: {
    id: 'pickup', name: 'Kamyonet', halfW: 1.02, halfL: 2.65, height: 1.8, accel: 7.5, maxSpeed: 37, reverse: 8,
    brake: 18, grip: 8, steer: 0.55, wheelBase: 3.2, mass: 1800, damageMul: 0.8, wheelR: 0.43, wheelW: 0.3,
    colors: ['#8a2b22', '#2f4a2c', '#c9c2b0', '#3b3f47', '#2a5b8c', '#d9d4c7'],
  },
  van: {
    id: 'van', name: 'Minibüs', halfW: 1.05, halfL: 2.6, height: 2.25, accel: 6.2, maxSpeed: 33, reverse: 7,
    brake: 16, grip: 7.5, steer: 0.55, wheelBase: 3.0, mass: 2000, damageMul: 0.8, wheelR: 0.37, wheelW: 0.28,
    colors: ['#f2f2ee', '#c7d6df', '#e0b84a', '#4b6b8a', '#9c3f3f'],
  },
  taxi: {
    id: 'taxi', name: 'Taksi', halfW: 0.92, halfL: 2.3, height: 1.42, accel: 8.8, maxSpeed: 41, reverse: 9,
    brake: 20, grip: 9, steer: 0.6, wheelBase: 2.75, mass: 1300, damageMul: 1, wheelR: 0.35, wheelW: 0.26,
    colors: ['#f6c21a'],
  },
  police: {
    id: 'police', name: 'Polis', halfW: 0.95, halfL: 2.35, height: 1.45, accel: 12, maxSpeed: 52, reverse: 10,
    brake: 26, grip: 10, steer: 0.6, wheelBase: 2.8, mass: 1500, damageMul: 0.6, wheelR: 0.36, wheelW: 0.28,
    colors: ['#f1f3f5'],
  },
  bus: {
    id: 'bus', name: 'Otobüs', halfW: 1.3, halfL: 5.6, height: 3.1, accel: 3.8, maxSpeed: 26, reverse: 5,
    brake: 12, grip: 7, steer: 0.52, wheelBase: 7.0, mass: 9000, damageMul: 0.45, wheelR: 0.5, wheelW: 0.36,
    colors: ['#2e86c1', '#e67e22', '#27ae60', '#d7dbdd'],
  },
};

// Precompute derived values: collision circles along the body, bounding radius, wheel layout.
for (const T of Object.values(TYPES)) {
  T.radius = Math.hypot(T.halfW, T.halfL);
  const span = Math.max(0, T.halfL - T.halfW);
  const n = Math.max(2, Math.ceil((2 * span) / (1.4 * T.halfW)) + 1);
  T.circles = [];
  for (let i = 0; i < n; i++) T.circles.push(-span + (2 * span * i) / (n - 1));
  const wx = T.halfW - T.wheelW * 0.5 + 0.03;
  const wz = T.wheelBase / 2;
  T.wheels = [
    { x: wx, z: wz, front: true }, { x: -wx, z: wz, front: true },
    { x: wx, z: -wz, front: false }, { x: -wx, z: -wz, front: false },
  ];
  T.invMass = 1 / T.mass;
  T.invInertia = 3 / (T.mass * (T.halfW * T.halfW + T.halfL * T.halfL));
}

// ---------------------------------------------------------------------------------------------
// Indexed mesh builder with vertex colours and per-vertex light roles. Smooth normals come from
// computeVertexNormals() over shared (indexed) vertices; hard creases come from separate parts.
const WHITE = [1, 1, 1];
const COS = new Float32Array(64), SIN = new Float32Array(64);

class Mesh {
  constructor() { this.pos = []; this.col = []; this.role = []; this.idx = []; }
  get n() { return this.pos.length / 3; }
  v(x, y, z, c = WHITE, role = 0) {
    this.pos.push(x, y, z); this.col.push(c[0], c[1], c[2]); this.role.push(role);
    return this.n - 1;
  }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
  tri(a, b, c) { this.idx.push(a, b, c); }
  /** Flip triangles idx[from..to) so they face away from the point (cx,cy,cz). */
  orient(from, to, cx, cy, cz) {
    const p = this.pos, I = this.idx;
    let s = 0;
    for (let i = from; i < to; i += 3) {
      const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      s += nx * ((p[a] + p[b] + p[c]) / 3 - cx) + ny * ((p[a + 1] + p[b + 1] + p[c + 1]) / 3 - cy) + nz * ((p[a + 2] + p[b + 2] + p[c + 2]) / 3 - cz);
    }
    if (s < 0) for (let i = from; i < to; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; }
  }
  /** Flip triangles so their summed normal points along (dx,dy,dz). */
  orientDir(from, dx, dy, dz) {
    const p = this.pos, I = this.idx;
    let s = 0;
    for (let i = from; i < I.length; i += 3) {
      const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      s += (uy * vz - uz * vy) * dx + (uz * vx - ux * vz) * dy + (ux * vy - uy * vx) * dz;
    }
    if (s < 0) for (let i = from; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; }
  }
  build(withColor = true) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    if (withColor) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

/** Loft closed rings (arrays of [x,y,z,c?]) into a smooth tube; flat caps are separate vertices. */
function loft(M, rings, capA = true, capB = true, role = 0) {
  const K = rings[0].length, R = rings.length, base = M.n, from = M.idx.length;
  let sx = 0, sy = 0, sz = 0, cnt = 0;
  for (const ring of rings) for (const p of ring) { M.v(p[0], p[1], p[2], p[3] || WHITE, role); sx += p[0]; sy += p[1]; sz += p[2]; cnt++; }
  for (let i = 0; i < R - 1; i++) {
    for (let k = 0; k < K; k++) {
      const k1 = (k + 1) % K;
      M.quad(base + i * K + k, base + i * K + k1, base + (i + 1) * K + k1, base + (i + 1) * K + k);
    }
  }
  const cx = sx / cnt, cy = sy / cnt, cz = sz / cnt;
  M.orient(from, M.idx.length, cx, cy, cz);
  const cap = (ring, outDir) => {
    const f = M.idx.length;
    let mx = 0, my = 0, mz = 0;
    const ids = ring.map((p) => { mx += p[0]; my += p[1]; mz += p[2]; return M.v(p[0], p[1], p[2], p[3] || WHITE, role); });
    const c = M.v(mx / K, my / K, mz / K, ring[0][3] || WHITE, role);
    for (let k = 0; k < K; k++) M.tri(c, ids[k], ids[(k + 1) % K]);
    M.orientDir(f, 0, 0, outDir);
  };
  if (capA) cap(rings[0], -1);
  if (capB) cap(rings[R - 1], 1);
}

function arcPts(out, cx, cy, r, a0, a1, m, z, c) {
  for (let j = 0; j <= m; j++) {
    const a = a0 + ((a1 - a0) * j) / m;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a), z, c]);
  }
}
const PI2 = Math.PI / 2;
/** Rounded-rectangle ring in XY at depth z. tv = tumblehome (top is narrower by tv). */
function roundRing(z, w, yb, yt, rt, rb, tv = 0, m = 3, cTop = WHITE, cBot = WHITE) {
  const h = Math.max(0.02, yt - yb);
  w = Math.max(0.02, w);
  rt = Math.max(0.005, Math.min(rt, h * 0.5, w - tv));
  rb = Math.max(0.005, Math.min(rb, h - rt, w));
  const xt = Math.max(0, w - tv - rt), yc = yt - rt, xb = Math.max(0, w - rb), yd = yb + rb;
  const out = [];
  arcPts(out, xt, yc, rt, 0, PI2, m, z, cTop);
  arcPts(out, -xt, yc, rt, PI2, Math.PI, m, z, cTop);
  arcPts(out, -xb, yd, rb, Math.PI, Math.PI + PI2, m, z, cBot);
  arcPts(out, xb, yd, rb, Math.PI + PI2, Math.PI * 2, m, z, cBot);
  return out;
}

/** Cardinal spline through table rows [z, a, b, ...] -> [a, b, ...]. */
function spline(tab, z) {
  const n = tab.length;
  if (z <= tab[0][0]) return tab[0].slice(1);
  if (z >= tab[n - 1][0]) return tab[n - 1].slice(1);
  let i = 0;
  while (z > tab[i + 1][0]) i++;
  const a = tab[i], b = tab[i + 1], h = b[0] - a[0], t = (z - a[0]) / h;
  const p = tab[Math.max(i - 1, 0)], q = tab[Math.min(i + 2, n - 1)];
  const t2 = t * t, t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
  const out = [];
  for (let k = 1; k < a.length; k++) {
    const m0 = ((b[k] - p[k]) / (b[0] - p[0])) * h, m1 = ((q[k] - a[k]) / (q[0] - a[0])) * h;
    out.push(h00 * a[k] + h10 * m0 + h01 * b[k] + h11 * m1);
  }
  return out;
}

const TAPER_D = [0, 0.35, 0.6, 0.78, 0.9, 0.96, 0.99];
const taperF = (d, p) => Math.pow(Math.max(0, 1 - Math.pow(Math.min(d, 0.9999), p)), 1 / p);

const DARKP = [0.05, 0.05, 0.055];

/** Painted body shell: lofted rounded sections with plan-view taper at the ends.
 *  S: hw, hl, Lf, Lr, pf, tab[[z,yb,yt,rt,rb]], zMin, zMax, noFront, noRear, step. Returns outline info. */
function bodyLoft(M, S) {
  const { hw, hl, Lf, Lr, pf, tab } = S;
  const zMin = S.zMin ?? -hl, zMax = S.zMax ?? hl, step = S.step ?? 0.45;
  const zf0 = zMax - Lf, zr0 = zMin + Lr;
  const zs = [];
  if (!S.noRear) for (let k = TAPER_D.length - 1; k >= 1; k--) zs.push(zr0 - Lr * TAPER_D[k]);
  const a = S.noRear ? zMin : zr0, b = S.noFront ? zMax : zf0;
  const nMid = Math.max(1, Math.round((b - a) / step));
  for (let k = 0; k <= nMid; k++) zs.push(a + ((b - a) * k) / nMid);
  if (!S.noFront) for (let k = 1; k < TAPER_D.length; k++) zs.push(zf0 + Lf * TAPER_D[k]);
  const wAt = (z) => {
    let w = hw;
    if (!S.noFront && z > zf0) w *= taperF((z - zf0) / Lf, pf);
    if (!S.noRear && z < zr0) w *= taperF((zr0 - z) / Lr, pf);
    return w;
  };
  const rings = zs.map((z) => {
    const [yb, yt, rt, rb] = spline(tab, Math.min(zMax, Math.max(zMin, z)));
    return roundRing(z, wAt(z), yb, yt, rt, rb, S.tv ?? 0, 3, WHITE, DARKP);
  });
  loft(M, rings);
  const mk = (z0, L, sign) => ({
    pts: TAPER_D.map((d) => [hw * taperF(d, pf), z0 + sign * L * d]), hw, z0, L, sign, pf,
    capW: hw * taperF(TAPER_D[TAPER_D.length - 1], pf), zEnd: z0 + sign * L * TAPER_D[TAPER_D.length - 1],
  });
  return { wAt, front: S.noFront ? null : mk(zf0, Lf, 1), rear: S.noRear ? null : mk(zr0, Lr, -1), spl: (z) => spline(tab, z) };
}

/** z (in end coordinates, positive = outwards) of the plan outline at half width x, plus normal. */
function outlineAt(ol, x) {
  const P = ol.pts;
  const flat = Math.abs(ol.zEnd - ol.z0);
  if (x <= ol.capW) return { d: flat, nx: 0, nz: 1 };
  for (let i = 0; i < P.length - 1; i++) {
    if (x <= P[i][0] && x >= P[i + 1][0]) {
      const t = (P[i][0] - x) / (P[i][0] - P[i + 1][0] || 1);
      const dx = P[i + 1][0] - P[i][0], dz = Math.abs(P[i + 1][1] - P[i][1]);
      const l = Math.hypot(dx, dz) || 1;
      return { d: Math.abs(P[i][1] - ol.z0) * (1 - t) + Math.abs(P[i + 1][1] - ol.z0) * t, nx: dz / l, nz: -dx / l };
    }
  }
  return { d: 0, nx: 1, nz: 0 };
}

/** A strip hugging the end (nose/tail) of the body, between ylo(x) and yhi(x). */
function wrapStrip(M, ol, xlo, xhi, ylo, yhi, off, c, role = 0, sides = [1, -1]) {
  xhi = Math.min(xhi, ol.hw - 0.001);
  const xs = [xhi];
  for (const p of ol.pts) if (p[0] < xhi - 0.02 && p[0] > xlo + 0.02) xs.push(p[0]);
  xs.push(xlo);
  const f = (typeof ylo === 'function') ? ylo : () => ylo;
  const g = (typeof yhi === 'function') ? yhi : () => yhi;
  for (const sx of sides) {
    const from = M.idx.length;
    let prev = null;
    for (const x of xs) {
      const o = outlineAt(ol, x);
      const px = sx * (x + off * o.nx), pz = ol.z0 + ol.sign * (o.d + off * o.nz);
      const lo = M.v(px, f(x), pz, c, role), hi = M.v(px, g(x), pz, c, role);
      if (prev) M.quad(prev[0], lo, hi, prev[1]);
      prev = [lo, hi];
    }
    M.orientDir(from, 0, 0, ol.sign);
  }
}

/** Flat convex polygon on a side plane (x = sx*x), points (z,y). */
function sidePoly(M, sx, x, pts, c, role = 0) {
  const from = M.idx.length, ids = pts.map((p) => M.v(sx * x, p[1], p[0], c, role));
  for (let i = 1; i < ids.length - 1; i++) M.tri(ids[0], ids[i], ids[i + 1]);
  M.orientDir(from, sx, 0, 0);
}
/** Flat convex polygon on a z plane facing dir (+1/-1), points (x,y). */
function facePoly(M, z, dir, pts, c, role = 0) {
  const from = M.idx.length, ids = pts.map((p) => M.v(p[0], p[1], z, c, role));
  for (let i = 1; i < ids.length - 1; i++) M.tri(ids[0], ids[i], ids[i + 1]);
  M.orientDir(from, 0, 0, dir);
}
/** Thin ribbon along a polyline (z,y) on a side plane. */
function sideRibbon(M, sx, x, pts, hw, c, both = true) {
  const sides = both ? [1, -1] : [sx];
  for (const s of sides) {
    const from = M.idx.length;
    let prev = null;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let tz = b[0] - a[0], ty = b[1] - a[1];
      const l = Math.hypot(tz, ty) || 1; tz /= l; ty /= l;
      const v1 = M.v(s * x, pts[i][1] - tz * hw, pts[i][0] + ty * hw, c), v2 = M.v(s * x, pts[i][1] + tz * hw, pts[i][0] - ty * hw, c);
      if (prev) M.quad(prev[0], prev[1], v2, v1);
      prev = [v1, v2];
    }
    M.orientDir(from, s, 0, 0);
  }
}
function rectPts(z0, z1, y0, y1, r = 0) {
  if (r <= 0) return [[z0, y0], [z1, y0], [z1, y1], [z0, y1]];
  return [[z0 + r, y0], [z1 - r, y0], [z1, y0 + r], [z1, y1 - r], [z1 - r, y1], [z0 + r, y1], [z0, y1 - r], [z0, y0 + r]];
}
/** Rounded box (rounded in XY, sharp in plan). Optional top inset tx. */
function rbox(M, cx, cy, cz, sx, sy, sz, r, c, role = 0, o = {}) {
  const tv = o.tv ?? 0;
  const rings = [
    roundRing(cz - sz / 2, sx / 2, cy - sy / 2, cy + sy / 2, r, r, tv, 2, c, c),
    roundRing(cz + sz / 2, sx / 2, cy - sy / 2, cy + sy / 2, r, r, tv, 2, c, c),
  ];
  for (const ring of rings) for (const p of ring) p[0] += cx;
  if (o.shiftTop) for (const p of rings[0]) if (p[1] > cy) p[2] += o.shiftTop;
  loft(M, rings, true, true, role);
}
function ellipsoid(M, cx, cy, cz, rx, ry, rz, c, seg = 8, rows = 5, role = 0) {
  const rings = [];
  for (let j = 1; j < rows; j++) {
    const a = (Math.PI * j) / rows, ring = [];
    for (let i = 0; i < seg; i++) {
      const b = (Math.PI * 2 * i) / seg;
      ring.push([cx + rx * Math.sin(a) * Math.cos(b), cy + ry * Math.cos(a), cz + rz * Math.sin(a) * Math.sin(b), c]);
    }
    rings.push(ring);
  }
  loft(M, rings, true, true, role);
}
/** Wheel arch: dark inverted-U on the body side. */
function archU(M, sx, x, zc, yc, R, ybot, c) {
  const pts = [[zc - R, ybot]];
  for (let j = 0; j <= 8; j++) { const a = Math.PI - (Math.PI * j) / 8; pts.push([zc + R * Math.cos(a), yc + R * Math.sin(a)]); }
  pts.push([zc + R, ybot]);
  sidePoly(M, sx, x, pts, c);
}

// ---------------------------------------------------------------------------------------------
// Shared materials
let quality = 'medium';
let matCache = new Map();
/** Set once at startup (and on settings change). Returns true if the paint model changed; in that case
 *  re-apply paint to existing cars: `for (const v of game.vehicles.list) game.vehicles.paint(v, v.color)`. */
export function setVehicleQuality(q) {
  const hi = q === 'high';
  if (hi === (quality === 'high')) { quality = q; return false; }
  quality = q;
  matCache = new Map();
  return true;
}
/** Cached car paint material per colour (clearcoat physical material on high quality). */
export function bodyMaterial(color) {
  const key = typeof color === 'number' ? color : new THREE.Color(color).getHex();
  let m = matCache.get(key);
  if (!m) {
    m = quality === 'high'
      ? new THREE.MeshPhysicalMaterial({ color: key, vertexColors: true, roughness: 0.35, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.08 })
      : new THREE.MeshStandardMaterial({ color: key, vertexColors: true, roughness: 0.38, metalness: 0.4 });
    matCache.set(key, m);
  }
  return m;
}
export const trimMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.34, metalness: 0.45 });
export const charredMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 0.95, metalness: 0.1 });
export const lightsMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
export const wheelMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.4 });

// Unit wheel: axis along X (width 1, radius 1). Tyre with rounded shoulders, dished alloy rim with five
// spokes on both faces (mirror symmetric so one instanced geometry serves both sides). ~280 tris.
export const wheelGeometry = (() => {
  const M = new Mesh();
  const SEG = 16, TIRE = [0.07, 0.07, 0.075], SILVER = [0.78, 0.8, 0.83], DISH = [0.16, 0.16, 0.18], HUB = [0.55, 0.57, 0.6];
  const circ = (x, r, c, rot = 0) => {
    const ring = [];
    for (let i = 0; i < SEG; i++) { const a = rot + (Math.PI * 2 * i) / SEG; ring.push([x, r * Math.cos(a), r * Math.sin(a), c]); }
    return ring;
  };
  const prof = [[-0.47, 0.67], [-0.5, 0.88], [-0.36, 1.0], [0.36, 1.0], [0.5, 0.88], [0.47, 0.67]];
  loft(M, prof.map((p) => circ(p[0], p[1], TIRE)), false, false);
  for (const s of [1, -1]) {
    // silver rim lip then dark dish cone down to the hub
    const from = M.idx.length, lip0 = circ(s * 0.47, 0.67, SILVER), lip1 = circ(s * 0.42, 0.6, SILVER);
    const ids0 = lip0.map((p) => M.v(...p)), ids1 = lip1.map((p) => M.v(...p));
    for (let i = 0; i < SEG; i++) M.quad(ids0[i], ids0[(i + 1) % SEG], ids1[(i + 1) % SEG], ids1[i]);
    const dish = circ(s * 0.42, 0.6, DISH).map((p) => M.v(...p));
    const apex = M.v(s * 0.35, 0, 0, HUB);
    for (let i = 0; i < SEG; i++) M.tri(dish[i], dish[(i + 1) % SEG], apex);
    M.orientDir(from, s, 0, 0);
    // spokes
    for (let k = 0; k < 5; k++) {
      const a = (Math.PI * 2 * k) / 5 + 0.3, ca = Math.cos(a), sa = Math.sin(a);
      const xr = (r) => s * (0.35 + 0.07 * (r / 0.6) + 0.02);
      const f = M.idx.length;
      const pt = (r, wd) => M.v(xr(r), r * ca - wd * sa, r * sa + wd * ca, SILVER);
      const q = [pt(0.06, -0.07), pt(0.06, 0.07), pt(0.6, 0.09), pt(0.6, -0.09)];
      M.quad(q[0], q[1], q[2], q[3]);
      M.orientDir(f, s, 0, 0);
    }
  }
  return M.build(true);
})();

// Colours used for the trim mesh
const GLASS = [0.035, 0.05, 0.075];
const PILLAR = [0.02, 0.02, 0.025];
const DARK = [0.04, 0.04, 0.045];
const PLATE = [0.85, 0.85, 0.8];
const NAVY = [0.04, 0.07, 0.2];
const CHROME = [0.62, 0.64, 0.68];
const RUBBER = [0.03, 0.03, 0.03];
const GREY = [0.18, 0.19, 0.21];

// Light roles
const R_HEAD = 1, R_TAIL = 2, R_SIGN = 3, R_BAR_R = 4, R_BAR_B = 5;
const LIGHT_WHITE = [1, 1, 1];

/** Glass/greenhouse ring: 12 points, indices 0-1 right side window, 2-5 right rail arc, 6-9 left, 10-11 left window. */
function glassRing(z, w, yb, yt, rt, tv, p) {
  const col = (isRail) => (p === 1 ? PILLAR : isRail ? PILLAR : GLASS);
  const side = p === 1 || p === 2 ? PILLAR : GLASS;
  rt = Math.min(rt, (yt - yb) * 0.6, w - tv);
  const yc = yt - rt, xc = Math.max(0, w - tv - rt);
  const y1 = Math.max(yb + 0.01, Math.min(yc - 0.06, (yb + yc) / 2 + 0.02)), k = (y1 - yb) / Math.max(0.01, yc - yb);
  const x1 = w - tv * k;
  const out = [[w, yb, z, side], [x1, y1, z, side]];
  const arc = (cx, a0, a1) => {
    for (let j = 0; j <= 3; j++) {
      const a = a0 + ((a1 - a0) * j) / 3;
      out.push([cx + rt * Math.cos(a), yc + rt * Math.sin(a), z, col((j < 2) === (cx > 0))]);
    }
  };
  arc(xc, 0, PI2);
  arc(-xc, PI2, Math.PI);
  out.push([-x1, y1, z, side], [-w, yb, z, side]);
  return out;
}

/** Greenhouse (glass + pillars, one trim loft) and the painted roof cap (body loft). */
function greenhouse(B, T, S) {
  const rows = S.gtab, n = rows.length;
  const sp = rows.map((r) => [r[0], r[1], r[2], r[3]]);
  const stations = [];
  for (let i = 0; i < n; i++) {
    stations.push({ z: rows[i][0], v: rows[i].slice(1, 4), p: rows[i][4] });
    if (i < n - 1 && rows[i + 1][0] - rows[i][0] > 0.2 && rows[i][4] === rows[i + 1][4]) {
      const z = (rows[i][0] + rows[i + 1][0]) / 2;
      stations.push({ z, v: spline(sp, z), p: rows[i][4] });
    }
  }
  loft(T, stations.map((s) => glassRing(s.z, s.v[0], S.gyb, s.v[1], S.grt, s.v[2], s.p)), true, true);
  // roof cap
  const [z0, z1] = S.roof, eps = 0.014, zs = [z0];
  for (const r of rows) if (r[0] > z0 + 0.05 && r[0] < z1 - 0.05) zs.push(r[0]);
  zs.push(z1);
  const rings = zs.map((z) => {
    const [w, yt, tv] = spline(sp, z);
    const rt = Math.min(S.grt, (yt - S.gyb) * 0.6, w - tv), yc = yt - rt, xc = Math.max(0, w - tv - rt), R = rt + eps;
    const out = [];
    arcPts(out, xc, yc, R, 0.45, PI2, 3, z, WHITE);
    arcPts(out, -xc, yc, R, PI2, Math.PI - 0.45, 3, z, WHITE);
    return out;
  });
  loft(B, rings);
}

// ---------------------------------------------------------------------------------------------
// Vehicle builders
function headTail(B, T, L, ctx, o) {
  const { front, rear } = ctx, hw = ctx.hw;
  // headlight clusters (wrapping the nose corners): dark housing + lens wedge
  const hy0 = o.hy0, hy1 = o.hy1, hx0 = hw * 0.36, hx1 = hw - 0.01;
  const tt = (x) => (x - hx0) / (hx1 - hx0);
  wrapStrip(T, front, hx0 - 0.03, hx1, (x) => hy0 - 0.025 + tt(x) * (hy1 - hy0 - 0.03), hy1 + 0.025, 0.008, DARK);
  wrapStrip(L, front, hx0, hx1, (x) => hy0 + tt(x) * (hy1 - hy0 - 0.05), hy1, 0.014, LIGHT_WHITE, R_HEAD);
  const tx0 = hw * 0.42, tty = (x) => (x - tx0) / (hw - 0.01 - tx0);
  wrapStrip(T, rear, tx0 - 0.03, hw - 0.01, (x) => o.ty0 - 0.02 + tty(x) * 0.02, o.ty1 + 0.02, 0.008, DARK);
  wrapStrip(L, rear, tx0, hw - 0.01, (x) => o.ty0 + tty(x) * 0.02, (x) => o.ty1 - tty(x) * 0.03, 0.014, LIGHT_WHITE, R_TAIL);
  // dark grille + lower intake + bumper band on the nose
  wrapStrip(T, front, 0, hw * 0.34, o.gy0, o.gy1, 0.008, DARK);
  wrapStrip(T, front, 0, hw - 0.01, o.by0, o.by0 + (o.bh ?? 0.1), 0.006, o.bumper ?? DARK);
  wrapStrip(T, rear, 0, hw - 0.01, o.rby0, o.rby0 + (o.bh ?? 0.1), 0.006, o.bumper ?? DARK);
  if (o.chromeLine) wrapStrip(T, front, 0, hw * 0.34, o.gy1 + 0.01, o.gy1 + 0.03, 0.009, CHROME);
  // plates
  const pz = rear.zEnd - 0.003;
  facePoly(T, pz, -1, rectPts(-0.26, 0.26, o.py, o.py + 0.12, 0.015).map((p) => [p[0], p[1]]), PLATE);
  facePoly(T, front.zEnd + 0.003, 1, rectPts(-0.26, 0.26, o.fpy ?? o.py, (o.fpy ?? o.py) + 0.12, 0.015).map((p) => [p[0], p[1]]), PLATE);
}

function sideDetails(B, T, ctx, o) {
  const hw = ctx.hw, x = hw + 0.003;
  // wheel arches
  for (const s of [1, -1]) for (const wz of o.wheelZ) archU(T, s, x, wz, o.wheelR, o.wheelR * 1.13, o.sill, DARK);
  // door seams, sill, handles
  for (const z of o.seams) sideRibbon(T, 1, x + 0.001, [[z, o.sill + 0.02], [z + (o.seamLean ?? 0), o.belt - 0.04]], 0.006, DARK);
  sideRibbon(T, 1, x + 0.001, [[o.seams[0], o.sill + 0.02], [o.seams[o.seams.length - 1], o.sill + 0.02]], 0.008, DARK);
  for (const z of o.handles) sideRibbon(T, 1, x + 0.002, [[z, o.belt - 0.1], [z - 0.14, o.belt - 0.1]], 0.014, GREY);
  sideRibbon(T, 1, x + 0.002, [[o.beltZ0 ?? -1.5, o.belt - 0.015], [o.beltZ1 ?? 0.95, o.belt - 0.015]], 0.012, CHROME);
  // sill / rocker
  sideRibbon(T, 1, x + 0.002, [[o.wheelZ[1] + o.wheelR * 1.2, o.sill + 0.05], [o.wheelZ[0] - o.wheelR * 1.2, o.sill + 0.05]], 0.04, DARK);
  // mirrors
  for (const s of [1, -1]) {
    rbox(T, s * (hw - 0.06), o.belt + 0.02, o.mirrorZ, 0.2, 0.05, 0.05, 0.012, DARK);
    ellipsoid(B, s * (hw + 0.05), o.belt + 0.07, o.mirrorZ, 0.07, 0.055, 0.075, WHITE, 8, 5);
  }
}

function sedanLike(T, B, Tr, L, o) {
  const hw = T.halfW, hl = T.halfL;
  const ctx = bodyLoft(B, { hw, hl, Lf: o.Lf ?? 0.85, Lr: o.Lr ?? 0.8, pf: o.pf ?? 3.5, tab: o.tab });
  ctx.hw = hw;
  greenhouse(B, Tr, o);
  const belt = o.belt;
  headTail(B, Tr, L, ctx, o.ht);
  sideDetails(B, Tr, ctx, {
    wheelZ: [T.wheelBase / 2, -T.wheelBase / 2], wheelR: T.wheelR, sill: o.sill ?? 0.36, belt,
    seams: o.seams, handles: o.handles, mirrorZ: o.mirrorZ, seamLean: o.seamLean,
  });
  // underbody
  rbox(Tr, 0, 0.3, 0, hw * 1.5, 0.06, hl * 1.4, 0.02, DARK);
  return ctx;
}

function buildParts(T) {
  const B = new Mesh(), Tr = new Mesh(), L = new Mesh();
  const hw = T.halfW, hl = T.halfL;
  switch (T.id) {
    case 'sports': {
      const ctx = sedanLike(T, B, Tr, L, {
        Lf: 1.0, Lr: 0.8, pf: 3.2, belt: 0.82, sill: 0.3, mirrorZ: 0.55, seams: [0.7, -0.2], handles: [0.05], gyb: 0.6, grt: 0.14,
        tab: [[-hl, 0.3, 0.78, 0.1, 0.06], [-1.9, 0.22, 0.9, 0.14, 0.07], [-1.0, 0.2, 0.86, 0.16, 0.08], [0, 0.2, 0.82, 0.16, 0.08],
          [0.9, 0.2, 0.8, 0.16, 0.08], [1.5, 0.2, 0.7, 0.14, 0.07], [1.95, 0.2, 0.6, 0.1, 0.06], [hl, 0.2, 0.55, 0.07, 0.05]],
        gtab: [[-1.6, 0.82, 0.86, 0.08, 2], [-1.35, 0.8, 0.95, 0.12, 2], [-1.0, 0.77, 1.04, 0.14, 2], [-0.6, 0.75, 1.1, 0.14, 2],
          [-0.55, 0.75, 1.1, 0.14, 0], [0.2, 0.76, 1.12, 0.14, 0], [0.55, 0.79, 1.0, 0.12, 0], [0.85, 0.86, 0.86, 0.08, 0], [1.0, 0.9, 0.8, 0.06, 0]],
        roof: [-1.2, 0.4],
        ht: { hy0: 0.31, hy1: 0.44, hSweep: 0.1, gy0: 0.27, gy1: 0.4, by0: 0.22, rby0: 0.24, bh: 0.1, ty0: 0.5, ty1: 0.62, py: 0.4, fpy: 0.26 },
      });
      // wing
      for (const s of [1, -1]) {
        rbox(B, s * 0.55, 0.96, -hl + 0.42, 0.06, 0.2, 0.14, 0.02, WHITE);
      }
      rbox(B, 0, 1.08, -hl + 0.3, hw * 1.9, 0.04, 0.4, 0.015, WHITE, 0, { shiftTop: -0.1 });
      // splitter, diffuser, side intakes, exhausts
      rbox(Tr, 0, 0.17, hl - 0.28, hw * 1.9, 0.05, 0.6, 0.02, DARK);
      rbox(Tr, 0, 0.2, -hl + 0.2, hw * 1.5, 0.12, 0.3, 0.03, DARK);
      for (const s of [1, -1]) {
        sidePoly(Tr, s, hw + 0.004, [[-0.75, 0.5], [-0.2, 0.46], [-0.2, 0.62], [-0.75, 0.7]], DARK);
        rbox(Tr, s * 0.5, 0.26, -hl - 0.03, 0.14, 0.14, 0.12, 0.05, CHROME);
      }
      break;
    }
    case 'taxi':
    case 'police': {
      const police = T.id === 'police';
      const ctx = sedanLike(T, B, Tr, L, {
        belt: 0.99, sill: 0.34, mirrorZ: 0.82, seams: [0.82, -0.12, -1.0], handles: [0.5, -0.4], gyb: 0.82, grt: 0.16,
        Lf: 0.85, Lr: 0.8,
        tab: [[-hl, 0.4, 0.86, 0.1, 0.06], [-1.9, 0.3, 1.0, 0.14, 0.07], [-1.2, 0.27, 1.01, 0.16, 0.08], [-0.2, 0.27, 0.99, 0.16, 0.08],
          [0.95, 0.27, 1.0, 0.16, 0.08], [1.5, 0.27, 0.92, 0.14, 0.08], [2.0, 0.28, 0.82, 0.1, 0.07], [hl, 0.3, 0.75, 0.08, 0.06]],
        gtab: [[-1.72, 0.82, 1.0, 0.06, 2], [-1.55, 0.8, 1.08, 0.09, 2], [-1.28, 0.76, 1.26, 0.11, 2], [-1.0, 0.73, 1.37, 0.12, 2],
          [-0.95, 0.73, 1.38, 0.12, 0], [-0.22, 0.71, 1.4, 0.12, 0], [-0.19, 0.71, 1.4, 0.12, 1], [-0.06, 0.71, 1.4, 0.12, 1],
          [-0.03, 0.71, 1.4, 0.12, 0], [0.2, 0.72, 1.38, 0.12, 0], [0.45, 0.75, 1.3, 0.11, 0], [0.75, 0.79, 1.14, 0.09, 0], [0.97, 0.82, 1.01, 0.06, 0]],
        roof: [-1.2, 0.38],
        ht: { hy0: 0.45, hy1: 0.6, gy0: 0.4, gy1: 0.54, by0: 0.32, rby0: 0.4, bh: 0.1, ty0: 0.6, ty1: 0.74, py: 0.5, fpy: 0.36, chromeLine: true },
      });
      const roofY = 1.4 + 0.014;
      if (police) {
        for (const s of [1, -1]) sidePoly(Tr, s, hw + 0.004, [[-1.55, 0.4], [1.2, 0.4], [1.2, 0.86], [-1.55, 0.86]], NAVY);
        wrapStrip(Tr, ctx.front, 0.0, hw * 0.55, 0.34, 0.58, 0.015, NAVY);
        rbox(Tr, 0, roofY + 0.03, -0.15, 1.3, 0.05, 0.32, 0.02, DARK);
        rbox(L, 0.33, roofY + 0.1, -0.15, 0.6, 0.12, 0.28, 0.05, WHITE, R_BAR_R);
        rbox(L, -0.33, roofY + 0.1, -0.15, 0.6, 0.12, 0.28, 0.05, WHITE, R_BAR_B);
      } else {
        for (const s of [1, -1]) sideRibbon(Tr, s, hw + 0.004, [[-1.5, 0.66], [1.15, 0.66]], 0.035, DARK, false);
        rbox(Tr, 0, roofY + 0.02, -0.25, 0.64, 0.04, 0.3, 0.015, DARK);
        rbox(L, 0, roofY + 0.12, -0.25, 0.58, 0.16, 0.24, 0.06, WHITE, R_SIGN);
      }
      break;
    }
    case 'pickup': {
      const ctx = bodyLoft(B, {
        hw, hl, Lf: 0.8, Lr: 0.5, pf: 3.5, step: 0.5,
        tab: [[-hl, 0.5, 1.2, 0.08, 0.06], [-2.4, 0.45, 1.24, 0.1, 0.08], [-0.75, 0.42, 1.24, 0.1, 0.08], [-0.55, 0.42, 1.1, 0.12, 0.08],
          [0.95, 0.42, 1.1, 0.14, 0.08], [1.6, 0.42, 1.06, 0.14, 0.08], [2.1, 0.42, 1.0, 0.12, 0.08], [hl, 0.4, 0.94, 0.08, 0.06]],
      });
      ctx.hw = hw;
      greenhouse(B, Tr, {
        gyb: 0.9, grt: 0.14, roof: [-0.3, 0.55],
        gtab: [[-0.55, 0.9, 1.12, 0.06, 2], [-0.5, 0.9, 1.5, 0.08, 2], [-0.4, 0.88, 1.7, 0.09, 2], [-0.28, 0.86, 1.77, 0.1, 2],
          [-0.22, 0.86, 1.78, 0.1, 0], [0.35, 0.86, 1.78, 0.1, 0], [0.55, 0.88, 1.7, 0.09, 0], [0.8, 0.92, 1.4, 0.07, 0], [1.0, 0.95, 1.12, 0.05, 0]],
      });
      headTail(B, Tr, L, ctx, { hy0: 0.62, hy1: 0.78, gy0: 0.5, gy1: 0.74, by0: 0.42, rby0: 0.5, bh: 0.12, ty0: 0.8, ty1: 1.0, py: 0.62, fpy: 0.46, bumper: CHROME, chromeLine: true });
      sideDetails(B, Tr, ctx, { wheelZ: [1.6, -1.6], wheelR: T.wheelR, sill: 0.46, belt: 1.1, seams: [0.85, 0.0, -0.45], handles: [0.45, -0.1], mirrorZ: 0.9 });
      // bed liner + tailgate
      const bedTop = 1.243;
      {
        const f = Tr.idx.length, vs = [[-0.8, -2.4], [0.8, -2.4], [0.8, -0.78], [-0.8, -0.78]].map((p) => Tr.v(p[0], bedTop, p[1], [0.05, 0.05, 0.055]));
        Tr.quad(vs[0], vs[1], vs[2], vs[3]); Tr.orientDir(f, 0, 1, 0);
      }
      sideRibbon(Tr, 1, hw + 0.004, [[-2.4, 0.5], [-2.4, 1.15]], 0.006, DARK);
      facePoly(Tr, ctx.rear.zEnd - 0.004, -1, rectPts(-0.9, 0.9, 0.92, 0.95), DARK);
      rbox(Tr, 0, 0.58, -hl - 0.02, hw * 2.02, 0.14, 0.18, 0.05, CHROME);
      rbox(Tr, 0, 0.5, hl - 0.05, hw * 2.04, 0.14, 0.2, 0.05, CHROME);
      rbox(Tr, 0, 0.3, 0, hw * 1.5, 0.06, hl * 1.4, 0.02, DARK);
      break;
    }
    case 'van': {
      const tabL = [[-0.9, 0.32, 1.2, 0.14, 0.08], [1.2, 0.32, 1.16, 0.14, 0.08], [1.8, 0.32, 1.04, 0.14, 0.08], [2.2, 0.33, 0.96, 0.12, 0.07], [hl, 0.36, 0.88, 0.08, 0.06]];
      const ctx = bodyLoft(B, { hw, hl, Lf: 0.8, Lr: 0.5, pf: 3.5, tab: tabL, zMin: -0.9, noRear: true });
      const ctxB = bodyLoft(B, { hw, hl, Lf: 0.5, Lr: 0.5, pf: 4, tab: [[-hl, 0.38, 2.2, 0.16, 0.08], [-2.2, 0.32, 2.24, 0.16, 0.08], [-0.9, 0.32, 2.24, 0.16, 0.08]], zMax: -0.9, noFront: true, step: 0.7 });
      ctx.hw = hw; ctx.rear = ctxB.rear;
      const g = [[-0.85, 0.96, 2.2, 0.06, 1], [-0.8, 0.96, 2.2, 0.06, 0], [-0.34, 0.96, 2.2, 0.06, 0], [-0.3, 0.96, 2.2, 0.06, 1], [-0.2, 0.96, 2.2, 0.06, 1],
        [-0.16, 0.96, 2.2, 0.06, 0], [0.35, 0.96, 2.2, 0.06, 0], [0.4, 0.96, 2.2, 0.06, 1], [0.5, 0.96, 2.2, 0.06, 1], [0.54, 0.96, 2.2, 0.06, 0],
        [0.95, 0.97, 2.18, 0.06, 0], [1.15, 0.98, 2.0, 0.06, 0], [1.35, 0.99, 1.66, 0.06, 0], [1.55, 1.0, 1.32, 0.05, 0], [1.7, 1.0, 1.22, 0.04, 0]];
      greenhouse(B, Tr, { gyb: 1.0, grt: 0.14, roof: [-0.9, 1.0], gtab: g });
      headTail(B, Tr, L, ctx, { hy0: 0.5, hy1: 0.68, gy0: 0.42, gy1: 0.62, by0: 0.4, rby0: 0.4, bh: 0.12, ty0: 0.6, ty1: 1.0, py: 0.5, fpy: 0.36 });
      // rear tail lights taller; plate on rear wall; rear window
      facePoly(Tr, -hl - 0.004, -1, rectPts(-0.7, 0.7, 1.15, 1.95, 0.1), GLASS);
      facePoly(Tr, -hl - 0.003, -1, rectPts(-0.01, 0.01, 0.4, 2.1), DARK);
      sideDetails(B, Tr, ctx, { wheelZ: [1.5, -1.5], wheelR: T.wheelR, sill: 0.38, belt: 1.18, seams: [1.3, 0.5, -0.3, -1.6], handles: [1.0, 0.2], mirrorZ: 1.4 });
      sideRibbon(Tr, 1, hw + 0.003, [[-2.5, 0.9], [1.1, 0.9]], 0.03, DARK);
      rbox(Tr, 0, 0.3, 0, hw * 1.5, 0.06, hl * 1.4, 0.02, DARK);
      break;
    }
    case 'bus': {
      const ctx = bodyLoft(B, {
        hw, hl, Lf: 0.45, Lr: 0.4, pf: 7, step: 1.0,
        tab: [[-hl, 0.5, 3.0, 0.3, 0.1], [-5.2, 0.45, 3.1, 0.35, 0.12], [5.2, 0.45, 3.1, 0.35, 0.12], [hl, 0.5, 3.0, 0.3, 0.1]],
      });
      ctx.hw = hw;
      const cw = Math.min(ctx.front.capW - 0.15, 1.0);
      facePoly(Tr, hl + 0.004, 1, rectPts(-cw, cw, 1.45, 2.75, 0.2).map((p) => p), GLASS);
      facePoly(Tr, -hl - 0.004, -1, rectPts(-cw, cw, 1.7, 2.6, 0.2).map((p) => p), GLASS);
      facePoly(Tr, hl + 0.003, 1, rectPts(-0.01, 0.01, 1.45, 2.75), PILLAR);
      for (const s of [1, -1]) {
        const x = hw + 0.004;
        const doorSide = s < 0;
        for (let k = 0; k < 7; k++) {
          const z0 = -4.7 + k * 1.2;
          if (doorSide && k >= 5) continue;
          sidePoly(Tr, s, x, rectPts(z0, z0 + 1.0, 1.4, 2.5, 0.12).map((p) => p), GLASS);
        }
        if (doorSide) {
          sidePoly(Tr, s, x, rectPts(3.5, 4.1, 0.75, 2.5, 0.1), GLASS);
          sidePoly(Tr, s, x, rectPts(4.2, 4.8, 0.75, 2.5, 0.1), GLASS);
          sideRibbon(Tr, s, x + 0.001, [[4.15, 0.6], [4.15, 2.6]], 0.01, DARK, false);
        }
        sideRibbon(Tr, s, x + 0.001, [[-5.2, 0.62], [5.2, 0.62]], 0.1, [0.9, 0.9, 0.9], false);
        for (const wz of [3.5, -3.5]) archU(Tr, s, x, wz, T.wheelR, T.wheelR * 1.15, 0.58, DARK);
      }
      rbox(B, 0, 3.2, -0.5, 1.5, 0.22, 2.2, 0.08, WHITE);
      rbox(L, 0, 2.9, hl, hw * 1.0, 0.18, 0.04, 0.05, WHITE, R_SIGN);
      // bumpers, lights, plates
      rbox(Tr, 0, 0.42, hl - 0.02, hw * 2.0, 0.22, 0.2, 0.08, DARK);
      rbox(Tr, 0, 0.42, -hl + 0.02, hw * 2.0, 0.22, 0.2, 0.08, DARK);
      rbox(L, hw - 0.3, 0.72, hl + 0.01, 0.34, 0.2, 0.04, 0.06, WHITE, R_HEAD);
      rbox(L, -hw + 0.3, 0.72, hl + 0.01, 0.34, 0.2, 0.04, 0.06, WHITE, R_HEAD);
      rbox(L, hw - 0.2, 0.95, -hl - 0.01, 0.2, 0.5, 0.04, 0.06, WHITE, R_TAIL);
      rbox(L, -hw + 0.2, 0.95, -hl - 0.01, 0.2, 0.5, 0.04, 0.06, WHITE, R_TAIL);
      facePoly(Tr, -hl - 0.006, -1, rectPts(-0.26, 0.26, 0.7, 0.82, 0.015), PLATE);
      for (const s of [1, -1]) ellipsoid(B, s * (hw + 0.14), 2.0, hl - 0.5, 0.1, 0.2, 0.08, WHITE, 8, 5);
      rbox(Tr, 0, 0.35, 0, hw * 1.5, 0.06, hl * 1.7, 0.02, DARK);
      break;
    }
    default: { // sedan
      sedanLike(T, B, Tr, L, {
        belt: 0.99, sill: 0.34, mirrorZ: 0.82, seams: [0.82, -0.12, -1.0], handles: [0.5, -0.4], gyb: 0.82, grt: 0.16,
        Lf: 0.85, Lr: 0.8,
        tab: [[-hl, 0.4, 0.86, 0.1, 0.06], [-1.9, 0.3, 1.0, 0.14, 0.07], [-1.2, 0.27, 1.01, 0.16, 0.08], [-0.2, 0.27, 0.99, 0.16, 0.08],
          [0.95, 0.27, 1.0, 0.16, 0.08], [1.5, 0.27, 0.92, 0.14, 0.08], [2.0, 0.28, 0.82, 0.1, 0.07], [hl, 0.3, 0.75, 0.08, 0.06]],
        gtab: [[-1.72, 0.82, 1.0, 0.06, 2], [-1.55, 0.8, 1.08, 0.09, 2], [-1.28, 0.76, 1.26, 0.11, 2], [-1.0, 0.73, 1.37, 0.12, 2],
          [-0.95, 0.73, 1.38, 0.12, 0], [-0.22, 0.71, 1.4, 0.12, 0], [-0.19, 0.71, 1.4, 0.12, 1], [-0.06, 0.71, 1.4, 0.12, 1],
          [-0.03, 0.71, 1.4, 0.12, 0], [0.2, 0.72, 1.38, 0.12, 0], [0.45, 0.75, 1.3, 0.11, 0], [0.75, 0.79, 1.14, 0.09, 0], [0.97, 0.82, 1.01, 0.06, 0]],
        roof: [-1.2, 0.38],
        ht: { hy0: 0.45, hy1: 0.6, gy0: 0.4, gy1: 0.54, by0: 0.32, rby0: 0.4, bh: 0.1, ty0: 0.6, ty1: 0.74, py: 0.5, fpy: 0.36, chromeLine: true },
      });
    }
  }
  return { body: B, trim: Tr, lights: L };
}

// Per-type geometry cache: { body, trim, lightsPos, lightsRoles, lightVariants: Map }
const typeGeo = new Map();
function geoFor(T) {
  let g = typeGeo.get(T.id);
  if (g) return g;
  const parts = buildParts(T);
  const lightsBase = parts.lights.build(false);
  g = {
    body: parts.body.build(true),
    trim: parts.trim.build(true),
    lightsBase,
    roles: parts.lights.role,
    variants: new Map(),
  };
  typeGeo.set(T.id, g);
  return g;
}
/** Triangle counts per part (debug). */
export function vehicleTriCounts(T) {
  const g = geoFor(T);
  return { body: g.body.index.count / 3, trim: g.trim.index.count / 3, lights: g.lightsBase.index.count / 3, wheel: wheelGeometry.index.count / 3 };
}

/** Lights geometry variant: night (bool), brake (bool), bar (0 off, 1 red phase, 2 blue phase), dead (bool). */
export function lightsGeometry(T, night, brake, bar, dead = false) {
  const g = geoFor(T);
  const key = dead ? 99 : (night ? 1 : 0) + (brake ? 2 : 0) + bar * 4;
  let geo = g.variants.get(key);
  if (geo) return geo;
  geo = new THREE.BufferGeometry();
  geo.setAttribute('position', g.lightsBase.attributes.position);
  geo.setAttribute('normal', g.lightsBase.attributes.normal);
  geo.setIndex(g.lightsBase.index);
  const n = g.roles.length, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    let r = 0.1, gg = 0.1, b = 0.1;
    const role = g.roles[i];
    if (dead) { r = gg = b = 0.05; } else if (role === R_HEAD) {
      if (night) { r = 3.2; gg = 3.1; b = 2.6; } else { r = 0.62; gg = 0.65; b = 0.7; }
    } else if (role === R_TAIL) {
      if (brake) { r = 4; gg = 0.15; b = 0.1; } else if (night) { r = 1.4; gg = 0.06; b = 0.05; } else { r = 0.5; gg = 0.04; b = 0.04; }
    } else if (role === R_SIGN) {
      if (night) { r = 2.4; gg = 1.8; b = 0.5; } else { r = 1; gg = 0.8; b = 0.25; }
    } else if (role === R_BAR_R) {
      if (bar === 1) { r = 5; gg = 0.25; b = 0.2; } else { r = 0.35; gg = 0.03; b = 0.03; }
    } else if (role === R_BAR_B) {
      if (bar === 2) { r = 0.3; gg = 0.6; b = 5.5; } else { r = 0.03; gg = 0.05; b = 0.4; }
    }
    col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.boundingSphere = g.lightsBase.boundingSphere;
  g.variants.set(key, geo);
  return geo;
}

/** Build a vehicle model. Returns { group, body, bodyMesh, trimMesh, lightsMesh }.
 *  group = root (position + heading), body = child group used for roll/pitch. Wheels are drawn by a
 *  shared InstancedMesh owned by vehicles.js. */
export function buildVehicleModel(T, color) {
  const g = geoFor(T);
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const bodyMesh = new THREE.Mesh(g.body, bodyMaterial(color));
  const trimMesh = new THREE.Mesh(g.trim, trimMaterial);
  const lightsMesh = new THREE.Mesh(lightsGeometry(T, false, false, 0), lightsMaterial);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = false;
  body.add(bodyMesh, trimMesh, lightsMesh);
  group.name = 'vehicle:' + T.id;
  return { group, body, bodyMesh, trimMesh, lightsMesh };
}
