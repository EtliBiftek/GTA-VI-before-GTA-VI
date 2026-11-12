// Road graph (grid-ish, variable block sizes, a few missing links) + road/lane queries + asphalt/marking geometry.
import { ROAD_W, ROAD_HALF, LANE, SIDEWALK } from './layout.js';
import { C } from './geo.js';

function axis(rand, a, b) {
  const v = [a]; let p = a;
  for (;;) {
    const rem = b - p;
    if (rem <= 112) { v.push(b); break; }
    const g = Math.min(72 + rand() * 38, rem - 72);
    p += g; v.push(p);
  }
  return v;
}
const closest = (arr, t) => arr.reduce((bi, v, i) => (Math.abs(v - t) < Math.abs(arr[bi] - t) ? i : bi), 0);

export function buildRoadGraph(rand) {
  const xs = axis(rand, -555, 450), zs = axis(rand, -555, 555);
  const NX = xs.length, NZ = zs.length, idx = (i, j) => i * NZ + j;
  const h = new Uint8Array(NX * NZ).fill(1), v = new Uint8Array(NX * NZ).fill(1);
  for (let j = 0; j < NZ; j++) h[idx(NX - 1, j)] = 0;
  for (let i = 0; i < NX; i++) v[idx(i, NZ - 1)] = 0;
  const avX = new Uint8Array(NX), avZ = new Uint8Array(NZ);
  avX[closest(xs, -10)] = 1; avX[closest(xs, -300)] = 1; avX[NX - 1] = 1;
  avZ[closest(zs, -10)] = 1; avZ[closest(zs, 320)] = 1;
  const deg = (i, j) => h[idx(i, j)] + (i > 0 ? h[idx(i - 1, j)] : 0) + v[idx(i, j)] + (j > 0 ? v[idx(i, j - 1)] : 0);
  const mc = new Uint8Array((NX - 1) * (NZ - 1)); const ci = (i, j) => i * (NZ - 1) + j;
  const connected = () => {
    const seen = new Uint8Array(NX * NZ), st = [0]; seen[0] = 1; let n = 1;
    while (st.length) {
      const k = st.pop(), i = Math.floor(k / NZ), j = k % NZ, nb = [];
      if (h[k]) nb.push(idx(i + 1, j)); if (i > 0 && h[idx(i - 1, j)]) nb.push(idx(i - 1, j));
      if (v[k]) nb.push(idx(i, j + 1)); if (j > 0 && v[idx(i, j - 1)]) nb.push(idx(i, j - 1));
      for (const m of nb) if (!seen[m]) { seen[m] = 1; n++; st.push(m); }
    }
    return n === NX * NZ;
  };
  const cand = [];
  for (let i = 0; i < NX - 1; i++) for (let j = 1; j < NZ - 1; j++) if (!avZ[j]) cand.push([0, i, j]);
  for (let i = 1; i < NX - 1; i++) for (let j = 0; j < NZ - 1; j++) if (!avX[i]) cand.push([1, i, j]);
  for (let k = cand.length - 1; k > 0; k--) { const m = Math.floor(rand() * (k + 1)); [cand[k], cand[m]] = [cand[m], cand[k]]; }
  let removed = 0; const maxRemove = Math.floor(cand.length * 0.14);
  for (const [t, i, j] of cand) {
    if (removed >= maxRemove) break;
    const cells = t === 0 ? [[i, j - 1], [i, j]] : [[i - 1, j], [i, j]];
    const ends = t === 0 ? [[i, j], [i + 1, j]] : [[i, j], [i, j + 1]];
    if (cells.some(([a, b]) => mc[ci(a, b)] > 0)) continue;
    if (ends.some(([a, b]) => deg(a, b) < 3)) continue;
    const arr = t === 0 ? h : v;
    arr[idx(i, j)] = 0;
    if (!connected()) { arr[idx(i, j)] = 1; continue; }
    cells.forEach(([a, b]) => { mc[ci(a, b)]++; }); removed++;
  }
  const nodes = [];
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
    const links = [];
    if (h[idx(i, j)]) links.push(idx(i + 1, j));
    if (i > 0 && h[idx(i - 1, j)]) links.push(idx(i - 1, j));
    if (v[idx(i, j)]) links.push(idx(i, j + 1));
    if (j > 0 && v[idx(i, j - 1)]) links.push(idx(i, j - 1));
    nodes.push({ id: idx(i, j), x: xs[i], z: zs[j], i, j, links });
  }
  return { xs, zs, NX, NZ, h, v, avX, avZ, nodes, mc, idx, ci };
}

export function makeRoadsApi(G, rand) {
  const { xs, zs, NX, NZ, h, v, nodes, idx } = G;
  const nearIdx = (arr, t) => { let b = 0, bd = 1e9; for (let i = 0; i < arr.length; i++) { const d = Math.abs(arr[i] - t); if (d < bd) { bd = d; b = i; } } return b; };
  const res = (n) => (typeof n === 'number' ? nodes[n] : n);
  const roads = {
    nodes, roadWidth: ROAD_W, laneOffset: LANE, sidewalkOffset: SIDEWALK,
    nearestNode(x, z) { return nodes[idx(nearIdx(xs, x), nearIdx(zs, z))]; },
    randomNode() { return nodes[Math.floor(Math.random() * nodes.length)]; },
    /**
     * Right-hand driving. Travelling a -> b has heading h = atan2(dx, dz) (forward = (sin h, 0, cos h)).
     * The driver's right-hand side is (-cos h, 0, sin h) (facing +Z, right is -X), so the lane centre is
     * centreline + laneOffset * (-cos h, sin h). Returns out {x, z, heading}.
     */
    lanePoint(a, b, t, out = {}) {
      const A = res(a), B = res(b), dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz) || 1;
      out.heading = Math.atan2(dx, dz);
      out.x = A.x + dx * t + (-dz / L) * LANE;
      out.z = A.z + dz * t + (dx / L) * LANE;
      return out;
    },
  };
  roads.isRoad = (x, z) => {
    let nearV = -1, nearH = -1;
    for (let i = 0; i < NX; i++) if (Math.abs(x - xs[i]) <= ROAD_HALF) { nearV = i; break; }
    for (let j = 0; j < NZ; j++) if (Math.abs(z - zs[j]) <= ROAD_HALF) { nearH = j; break; }
    if (nearV >= 0 && nearH >= 0) return true;
    if (nearV >= 0) {
      if (z < zs[0] || z > zs[NZ - 1]) return false;
      for (let j = 0; j < NZ - 1; j++) if (z <= zs[j + 1]) return v[idx(nearV, j)] === 1;
    } else if (nearH >= 0) {
      if (x < xs[0] || x > xs[NX - 1]) return false;
      for (let i = 0; i < NX - 1; i++) if (x <= xs[i + 1]) return h[idx(i, nearH)] === 1;
    }
    return false;
  };
  return roads;
}

/**
 * Asphalt strips + markings (+ optional wear: wheel tracks and decals like manholes / drains / oil / cracks / parking bays).
 * `extra` = { tracks: Batch, decals: Batch, rng, decalUV, DECAL } is optional (purely visual, uses its own RNG).
 */
export function buildRoadMeshes(G, asphalt, marks, extra) {
  const { xs, zs, NX, NZ, h, v, idx, avX } = G;
  const AS = C(0xffffff), KERB = C(0xc2beb4), GUT = C(0x1e2024), WHITE = C(0xeeeee6), YEL = C(0xf2c230);
  const YA = 0.02, YM = 0.03, YD = 0.027, YT = 0.024;
  const X = extra, rng = X?.rng;
  const link = (ax, az, bx, bz, avenue) => {
    const horiz = az === bz;
    const L = horiz ? Math.abs(bx - ax) : Math.abs(bz - az);
    const lo = horiz ? Math.min(ax, bx) : Math.min(az, bz), c = horiz ? az : ax;
    const marks_ = (x0, z0, x1, z1, y, col) => (y === YA ? asphalt : marks).rect(x0, z0, x1, z1, y, col);
    const R = (a0, a1, w0, w1, y, col) => { // a along link, w across (relative to centreline)
      if (horiz) marks_(lo + a0, c + w0, lo + a1, c + w1, y, col); else marks_(c + w0, lo + a0, c + w1, lo + a1, y, col);
    };
    const P = (a, w) => (horiz ? [lo + a, c + w] : [c + w, lo + a]); // link coords -> world xz
    R(-ROAD_HALF, L + ROAD_HALF, -ROAD_HALF, ROAD_HALF, YA, AS);
    for (const sg of [-1, 1]) { // kerb stone + dark gutter line along both edges
      R(ROAD_HALF, L - ROAD_HALF, sg > 0 ? ROAD_HALF - 0.28 : -ROAD_HALF, sg > 0 ? ROAD_HALF : -ROAD_HALF + 0.28, YM, KERB);
      R(ROAD_HALF, L - ROAD_HALF, sg > 0 ? ROAD_HALF - 0.55 : -ROAD_HALF + 0.28, sg > 0 ? ROAD_HALF - 0.28 : -ROAD_HALF + 0.55, YM, GUT);
    }
    const s = ROAD_HALF + 5.5, e = L - ROAD_HALF - 5.5;
    if (avenue) { R(s, e, -0.3, -0.15, YM, YEL); R(s, e, 0.15, 0.3, YM, YEL); }
    else for (let a = s; a + 3 < e; a += 8) R(a, a + 3, -0.1, 0.1, YM, WHITE);
    // zebra crossings near both ends
    for (const a of [ROAD_HALF + 1.2, L - ROAD_HALF - 2.4]) for (let w = -5.6; w <= 5.6; w += 1.4) R(a, a + 1.2, w, w + 0.7, YM, WHITE);
    // stop lines on the approach lanes (right-hand traffic)
    const sA = horiz ? -1 : 1;
    R(ROAD_HALF + 2.9, ROAD_HALF + 3.3, sA > 0 ? 0.3 : -ROAD_HALF + 0.6, sA > 0 ? ROAD_HALF - 0.6 : -0.3, YM, WHITE);
    R(L - ROAD_HALF - 3.3, L - ROAD_HALF - 2.9, sA > 0 ? -ROAD_HALF + 0.6 : 0.3, sA > 0 ? -0.3 : ROAD_HALF - 0.6, YM, WHITE);
    if (!X) return;
    const quad = (batch, y, cx, cz, hx, hz, ang, uv) => { // rotated rect (link coords) -> world
      const ca = Math.cos(ang), sa = Math.sin(ang), pts = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([qx, qz]) => { const [wx, wz] = P(cx + qx * ca - qz * sa, cz + qx * sa + qz * ca); return [wx, y, wz]; });
      batch.face(pts, [0, 1, 0], [1, 1, 1], [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]]);
    };
    // wheel tracks in both lanes
    const a0 = ROAD_HALF + 4.5, a1 = L - ROAD_HALF - 4.5;
    if (a1 > a0 + 6) for (const sg of [-1, 1]) for (const wo of [-0.85, 0.85]) {
      const w = sg * LANE + wo, v0 = rng() * 4, v1 = v0 + (a1 - a0) / 8;
      const pa = P(a0, w - 0.3), pb = P(a0, w + 0.3), pc = P(a1, w + 0.3), pd = P(a1, w - 0.3);
      X.tracks.face([[pa[0], YT, pa[1]], [pb[0], YT, pb[1]], [pc[0], YT, pc[1]], [pd[0], YT, pd[1]]], [0, 1, 0], [1, 1, 1], [[0, v0], [1, v0], [1, v1], [0, v1]]);
    }
    const { DECAL, decalUV } = X;
    // manholes, covers, oil, tar, cracks along the lanes
    const n = Math.max(1, Math.floor(L / 35));
    for (let k = 0; k < n; k++) {
      const a = 12 + rng() * (L - 24), sg = rng() < 0.5 ? -1 : 1, r = rng();
      if (r < 0.28) quad(X.decals, YD, a, sg * (1.2 + rng() * 2.4), 0.46, 0.46, rng() * 6.3, decalUV(DECAL.manhole));
      else if (r < 0.36) quad(X.decals, YD, a, sg * (ROAD_HALF - 1.6), 0.5, 0.5, 0, decalUV(DECAL.cover));
      else if (r < 0.6) quad(X.decals, YD, a, sg * (LANE + (rng() - 0.5)), 1.3 + rng(), 1.3 + rng(), rng() * 6.3, decalUV(DECAL.oil));
      else if (r < 0.78) quad(X.decals, YD, a, (rng() - 0.5) * 8, 1.8 + rng() * 1.4, 1.2 + rng(), rng() * 6.3, decalUV(DECAL.tar));
      else quad(X.decals, YD, a, (rng() - 0.5) * 8, 2.6 + rng() * 1.6, 2.6 + rng() * 1.6, rng() * 6.3, decalUV(rng() < 0.5 ? DECAL.crackA : DECAL.crackB));
    }
    for (const a of [ROAD_HALF + 9.5, L - ROAD_HALF - 9.5]) for (const sg of [-1, 1]) if (rng() < 0.6) quad(X.decals, YD, a, sg * (ROAD_HALF - 0.95), 0.62, 0.3, 0, decalUV(DECAL.drain));
    // parallel parking bays along one kerb of some long side streets
    if (!avenue && L > 80 && rng() < 0.45) {
      const sg = rng() < 0.5 ? -1 : 1, w0 = sg * (ROAD_HALF - 1.9), w1 = sg * (ROAD_HALF - 0.55), ps = ROAD_HALF + 12, pe = L - ROAD_HALF - 12;
      R(ps, pe, Math.min(w0, w0 + sg * 0.06), Math.max(w0, w0 + sg * 0.06), YM, WHITE);
      for (let a = ps; a <= pe; a += 6) R(a, a + 0.1, Math.min(w0, w1), Math.max(w0, w1), YM, WHITE);
    }
  };
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
    if (h[idx(i, j)]) link(xs[i], zs[j], xs[i + 1], zs[j], !!G.avZ[j]);
    if (v[idx(i, j)]) link(xs[i], zs[j], xs[i], zs[j + 1], !!avX[i]);
  }
}
