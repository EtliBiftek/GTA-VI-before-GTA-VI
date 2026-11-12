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

/** Asphalt strips + markings. Returns nothing; fills the two batches. */
export function buildRoadMeshes(G, asphalt, marks) {
  const { xs, zs, NX, NZ, h, v, idx, avX, avZ } = G;
  const AS = C(0x3a3d45), KERB = C(0x8d8a82), WHITE = C(0xe9e9e2), YEL = C(0xf2c230);
  const YA = 0.02, YM = 0.03;
  const link = (ax, az, bx, bz, avenue) => {
    const horiz = az === bz;
    const L = horiz ? Math.abs(bx - ax) : Math.abs(bz - az);
    const lo = horiz ? Math.min(ax, bx) : Math.min(az, bz), c = horiz ? az : ax;
    const R = (a0, a1, w0, w1, y, col) => { // a along link, w across (relative to centreline)
      if (horiz) marks_(lo + a0, c + w0, lo + a1, c + w1, y, col); else marks_(c + w0, lo + a0, c + w1, lo + a1, y, col);
    };
    const marks_ = (x0, z0, x1, z1, y, col) => (y === YA ? asphalt : marks).rect(x0, z0, x1, z1, y, col);
    R(-ROAD_HALF, L + ROAD_HALF, -ROAD_HALF, ROAD_HALF, YA, AS);
    R(ROAD_HALF, L - ROAD_HALF, -ROAD_HALF, -ROAD_HALF + 0.3, YM, KERB); R(ROAD_HALF, L - ROAD_HALF, ROAD_HALF - 0.3, ROAD_HALF, YM, KERB);
    const s = ROAD_HALF + 5.5, e = L - ROAD_HALF - 5.5;
    if (avenue) { R(s, e, -0.3, -0.15, YM, YEL); R(s, e, 0.15, 0.3, YM, YEL); }
    else for (let a = s; a + 3 < e; a += 8) R(a, a + 3, -0.1, 0.1, YM, WHITE);
    // zebra crossings near both ends
    for (const a of [ROAD_HALF + 1.2, L - ROAD_HALF - 2.4]) for (let w = -5.6; w <= 5.6; w += 1.4) R(a, a + 1.2, w, w + 0.7, YM, WHITE);
  };
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
    if (h[idx(i, j)]) link(xs[i], zs[j], xs[i + 1], zs[j], !!G.avZ[j]);
    if (v[idx(i, j)]) link(xs[i], zs[j], xs[i], zs[j + 1], !!avX[i]);
  }
}
