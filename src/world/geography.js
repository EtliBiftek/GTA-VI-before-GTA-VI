// Geography of the stylised, compressed Istanbul: a 24 x 24 irregular lattice of cells (ASCII map below).
// NORTH = -Z, EAST = +X. Water cells are eroded by the quay width, rasterised at 2 m and blurred, which turns the
// stepped cell outline into smooth, chamfered shorelines. The raster is the single source of truth for isWater,
// collision (signed distance field), distanceToWater, the land mesh (marching squares) and the minimap.
import { clamp } from '../core/utils.js';
import { HALF, QUAY } from './layout.js';

// 24 rows x 24 columns. '~' water. Letters = districts (see DISTRICTS).
const ROWS = [
  'ssssssssLLLLLLNNN~~~RRRR',
  'ssssssssLLLLLLNNN~~~RRRR',
  'ssssssssLLLLLLNNN~~~RRRR',
  'ssssssssLLLLLLNNN~~~RRRR',
  'ssssssssLLLLLLNNN~~~RRRR',
  'ssssssssssssEEEO~~~RRRRR',
  'ssssssssssssEEEO~~~RRRRR',
  'sssss~BBBBBTTEEO~~~RRRRR',
  'sssss~~~BBBTTEEE~~~RRRRR',
  'FFFFF~~~~BBBBEE~~~RRAAAA',
  'FFFFFFF~~~~GGCC~~~RRAAAA',
  'FFFFFFFF~~~~GG~~~UUUAAAA',
  'FFFFFFFFMM~~~~~~~UUUAAAA',
  'FFFFFFFFFMM~~~~~~UUUAAAA',
  'FFFFFFFFFSSSSS~~~UUUAAAA',
  'FFFFFFFFFSSSSS~~~UUUAAAA',
  'FFFFFFFFFSSSSS~~~UUUAAAA',
  'FFFFFFFFFFSSSS~~~DDKKKAA',
  'FFFFFFFFFFFFFF~~~DDKKKAA',
  'FFFFFFFFFFFFFF~~~DDKKKAA',
  'FFFFFFFFFFFFFF~~~DDKKKAA',
  'FFFF~~~~~~~~~~~~~~~KKAAA',
  '~~~~~~~~~~~~~~~~~~~~YYAA',
  '~~~~~~~~~~~~~~~~~~~~~~AA',
];
export const NC = 24;
export const DISTRICTS = {
  s: 'Şişli', L: 'Levent', N: 'Sarıyer', E: 'Beşiktaş', O: 'Ortaköy', T: 'Taksim', B: 'Beyoğlu', G: 'Galata', C: 'Cihangir',
  F: 'Fatih', S: 'Sultanahmet', M: 'Eminönü', U: 'Üsküdar', D: 'Haydarpaşa', K: 'Kadıköy', A: 'Ataşehir', R: 'Beykoz', Y: 'Moda',
};
/** Merged super-blocks (inclusive cell rects) whose internal roads are removed. */
export const ZONES = {
  taksim: [11, 8, 12, 8], blue: [10, 14, 11, 15], basilica: [12, 14, 13, 15], gulhane: [12, 16, 13, 16], bazaar: [8, 14, 9, 14],
  stadium: [13, 8, 14, 9], palace: [15, 7, 15, 8], station: [17, 17, 18, 17], docks: [17, 18, 18, 20],
};
/** Single-cell parks. */
export const PARK_CELLS = [[11, 7], [20, 22], [4, 15], [8, 3]];

const sq2 = Math.SQRT2;
function boxBlur(src, N, r) {
  const tmp = new Float32Array(N * N), out = new Float32Array(N * N), w = 2 * r + 1;
  for (let z = 0; z < N; z++) {
    let s = 0; const o = z * N;
    for (let k = -r; k <= r; k++) s += src[o + clamp(k, 0, N - 1)];
    for (let x = 0; x < N; x++) { tmp[o + x] = s / w; s += src[o + Math.min(N - 1, x + r + 1)] - src[o + Math.max(0, x - r)]; }
  }
  for (let x = 0; x < N; x++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += tmp[clamp(k, 0, N - 1) * N + x];
    for (let z = 0; z < N; z++) { out[z * N + x] = s / w; s += tmp[Math.min(N - 1, z + r + 1) * N + x] - tmp[Math.max(0, z - r) * N + x]; }
  }
  return out;
}
/** chamfer distance (in pixels) to the nearest pixel with mask != 0. */
function edt(mask, N) {
  const INF = 1e6, d = new Float32Array(N * N);
  for (let k = 0; k < N * N; k++) d[k] = mask[k] ? 0 : INF;
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const k = z * N + x; let v = d[k]; if (v === 0) continue;
    if (x > 0) v = Math.min(v, d[k - 1] + 1);
    if (z > 0) { v = Math.min(v, d[k - N] + 1); if (x > 0) v = Math.min(v, d[k - N - 1] + sq2); if (x < N - 1) v = Math.min(v, d[k - N + 1] + sq2); }
    d[k] = v;
  }
  for (let z = N - 1; z >= 0; z--) for (let x = N - 1; x >= 0; x--) {
    const k = z * N + x; let v = d[k]; if (v === 0) continue;
    if (x < N - 1) v = Math.min(v, d[k + 1] + 1);
    if (z < N - 1) { v = Math.min(v, d[k + N] + 1); if (x < N - 1) v = Math.min(v, d[k + N + 1] + sq2); if (x > 0) v = Math.min(v, d[k + N - 1] + sq2); }
    d[k] = v;
  }
  return d;
}

export function buildGeography(rnd) {
  // ---- irregular lattice (xs[12] = zs[12] = 0 is the origin road crossing) ----
  const xs = [-770], zs = [-770];
  const wx = [], wz = [];
  for (let i = 0; i < NC; i++) { wx.push(i < 14 ? 770 / 12 : i < 20 ? 68 : (770 - (128.33 + 408)) / 4); wz.push(770 / 12); }
  for (let i = 0; i < NC; i++) { xs.push(xs[i] + wx[i]); zs.push(zs[i] + wz[i]); }
  for (let i = 1; i < NC; i++) if (i !== 12) { xs[i] += (rnd() - 0.5) * 16; zs[i] += (rnd() - 0.5) * 16; }
  const ch = (i, j) => ROWS[clamp(j, 0, NC - 1)][clamp(i, 0, NC - 1)];
  const isWaterCell = (i, j) => ch(i, j) === '~';
  const idxOf = (arr, v) => { let lo = 0, hi = NC - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (arr[m] <= v) lo = m; else hi = m - 1; } return lo; };
  const cellRect = (i, j) => ({ x0: xs[i], x1: xs[i + 1], z0: zs[j], z1: zs[j + 1] });
  const zoneRect = (z) => { const a = ZONES[z]; return { x0: xs[a[0]], x1: xs[a[2] + 1], z0: zs[a[1]], z1: zs[a[3] + 1] }; };

  // ---- raster (2 m) ----
  const R = 2, N = (HALF * 2) / R, colCell = new Uint8Array(N), rowCell = new Uint8Array(N);
  for (let k = 0; k < N; k++) { const v = -HALF + (k + 0.5) * R; colCell[k] = idxOf(xs, v); rowCell[k] = idxOf(zs, v); }
  const base = new Float32Array(N * N);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) base[z * N + x] = isWaterCell(colCell[x], rowCell[z]) ? 1 : 0;
  const px = (v) => clamp(Math.floor((v + HALF) / R), 0, N - 1);
  for (let j = 0; j < NC; j++) for (let i = 0; i < NC; i++) {
    if (isWaterCell(i, j)) continue;
    const x0 = px(xs[i] - QUAY), x1 = px(xs[i + 1] + QUAY), z0 = px(zs[j] - QUAY), z1 = px(zs[j + 1] + QUAY);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) base[z * N + x] = 0;
  }
  let f = boxBlur(boxBlur(base, N, 9), N, 9);
  const dRender = edt(f.map((v) => (v < 0.5 ? 1 : 0)), N); // for water pixels: px distance to land (render mask)

  const G = {
    xs, zs, NC, N, R, ROWS, ch, isWaterCell, cellRect, zoneRect, fR: f,
    cellAt(x, z) { return { i: idxOf(xs, x), j: idxOf(zs, z) }; },
    waterRender(x, z) { return f[px(z) * N + px(x)] > 0.5; },
    mask: null, S: null,
    /** carve = list of {x0,x1,z0,z1}: land strips (bridge decks, piers) inside the water. Call once. */
    finish(carves) {
      const mask = new Uint8Array(N * N);
      for (let k = 0; k < N * N; k++) mask[k] = f[k] > 0.5 ? 1 : 0;
      for (const c of carves) for (let z = px(c.z0); z <= px(c.z1); z++) for (let x = px(c.x0); x <= px(c.x1); x++) mask[z * N + x] = 0;
      const dW = edt(mask, N), dL = edt(mask.map((v) => 1 - v), N), S = new Float32Array(N * N);
      for (let k = 0; k < N * N; k++) S[k] = mask[k] ? 1 - dL[k] * R : dW[k] * R - 1; // metres to the shore (negative in water)
      G.mask = mask; G.S = S;
      // water-shader distance-to-land texture (4 m, render mask), metres capped at 48 -> 0..255
      const T = N / 2, tex = new Uint8Array(T * T);
      for (let z = 0; z < T; z++) for (let x = 0; x < T; x++) { const k = (z * 2) * N + x * 2; tex[z * T + x] = f[k] > 0.5 ? clamp(Math.round(dRender[k] * R / 48 * 255), 0, 255) : 0; }
      G.shoreTex = { data: tex, size: T };
      return G;
    },
    isWater(x, z) {
      if (!G.mask) return G.waterRender(x, z);
      if (x < -HALF || x > HALF || z < -HALF || z > HALF) return false;
      return G.mask[px(z) * N + px(x)] === 1;
    },
    /** signed distance to the shore in metres (positive on land), nearest pixel. */
    shoreDist(x, z) { return G.S[px(z) * N + px(x)]; },
    /** bilinear signed distance */
    sdf(x, z) {
      const gx = clamp((x + HALF) / R - 0.5, 0, N - 1.001), gz = clamp((z + HALF) / R - 0.5, 0, N - 1.001);
      const ix = gx | 0, iz = gz | 0, fx = gx - ix, fz = gz - iz, S = G.S, k = iz * N + ix;
      return (S[k] * (1 - fx) + S[k + 1] * fx) * (1 - fz) + (S[k + N] * (1 - fx) + S[k + N + 1] * fx) * fz;
    },
    distanceToWater(x, z) { return Math.max(0, G.sdf(x, z)); },
    districtAt(x, z) {
      const i = idxOf(xs, x), j = idxOf(zs, z), c = ch(i, j);
      if (c === '~') return i < 14 && j < 14 && !(j > 13) ? 'Haliç' : j >= 20 || (i < 14 && j > 19) ? 'Marmara Denizi' : 'Boğaziçi';
      if ((i === 12 || i === 13) && j === 11) return 'Karaköy';
      if (i >= 8 && i <= 9 && j === 14) return 'Kapalıçarşı';
      if (c === 'F' && i <= 1) return 'Zeytinburnu';
      if (c === 'E' && i === 15) return 'Dolmabahçe';
      return DISTRICTS[c] || 'İstanbul';
    },
    /** marching squares over the render field on a 4 m grid: calls full(x0,z0,x1,z1) for land quads (row-merged),
     *  poly(points[]) for partial cells, wall(ax,az,bx,bz,nx,nz) for shoreline segments (normal points to water). */
    contour(onFull, onPoly, onWall) {
      const T = N / 2, step = R * 2, v = (a, b) => f[(b * 2) * N + a * 2];
      const wx = (a) => -HALF + (a * 2 + 0.5) * R, wz = (b) => -HALF + (b * 2 + 0.5) * R;
      const clampW = (c) => clamp(c, -HALF, HALF);
      for (let b = 0; b < T - 1; b++) {
        let runA = -1;
        for (let a = 0; a < T; a++) {
          let full = false;
          if (a < T - 1) {
            const f0 = v(a, b), f1 = v(a + 1, b), f2 = v(a + 1, b + 1), f3 = v(a, b + 1);
            full = f0 < 0.5 && f1 < 0.5 && f2 < 0.5 && f3 < 0.5;
            if (!full) {
              const w0 = f0 >= 0.5, w1 = f1 >= 0.5, w2 = f2 >= 0.5, w3 = f3 >= 0.5;
              if (!(w0 && w1 && w2 && w3)) {
                const pts = [[wx(a), wz(b), f0], [wx(a) + step, wz(b), f1], [wx(a) + step, wz(b) + step, f2], [wx(a), wz(b) + step, f3]];
                const poly = [], edges = [];
                for (let k = 0; k < 4; k++) {
                  const p = pts[k], q = pts[(k + 1) % 4];
                  if (p[2] < 0.5) poly.push([p[0], p[1]]);
                  if ((p[2] < 0.5) !== (q[2] < 0.5)) { const t = (0.5 - p[2]) / (q[2] - p[2]); const c = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; poly.push(c); edges.push(c); }
                }
                if (edges.length === 4) { // saddle: two corner triangles
                  onPoly([poly[0], poly[1], poly[poly.length - 1]]); onPoly(poly.slice(2));
                } else if (poly.length >= 3) onPoly(poly);
                if (edges.length >= 2) {
                  for (let k = 0; k + 1 < edges.length; k += 2) {
                    const A = edges[k], B = edges[k + 1], mx = (A[0] + B[0]) / 2, mz = (A[1] + B[1]) / 2;
                    const gx = (G.fAtW(mx + 1.5, mz) - G.fAtW(mx - 1.5, mz)), gz = (G.fAtW(mx, mz + 1.5) - G.fAtW(mx, mz - 1.5)), gl = Math.hypot(gx, gz) || 1;
                    onWall(A[0], A[1], B[0], B[1], gx / gl, gz / gl);
                  }
                }
              }
            }
          }
          if (full && runA < 0) runA = a;
          if (!full && runA >= 0) { onFull(wx(runA), wz(b), wx(a), wz(b) + step, 0); runA = -1; }
        }
      }
      void clampW;
    },
    fAtW(x, z) { return f[px(z) * N + px(x)]; },
  };
  return G;
}
