// Road graph on the Istanbul lattice (axis-aligned two-way links, irregular: dropped links, merged blocks, T-junctions,
// shore roads, bridge links) + road/lane queries + asphalt/marking geometry.
import { ROAD_W, ROAD_HALF, LANE, SIDEWALK } from './layout.js';
import { ZONES, NC } from './geography.js';
import { C } from './geo.js';

export const BRIDGES = [
  // axis 'h': link runs along +x at row line j from lattice column i0 to i1; axis 'v': along +z at column line i from row j0 to j1
  { id: 'B2', name: 'Kuzey Boğaz Köprüsü', kind: 'susp', axis: 'h', j: 2, i0: 17, i1: 20 },
  { id: 'B1', name: 'Boğaziçi Köprüsü', kind: 'susp', axis: 'h', j: 7, i0: 16, i1: 19 },
  { id: 'B3', name: 'Galata Köprüsü', kind: 'galata', axis: 'v', i: 13, j0: 12, j1: 14 },
  { id: 'B4', name: 'Haliç Köprüsü', kind: 'halic', axis: 'v', i: 10, j0: 10, j1: 12 },
];
const AV_COLS = new Set([3, 8, 14, 19, 22]), AV_ROWS = new Set([3, 9, 15, 19]);
/** lattice edges turned into pedestrian streets (no asphalt, not in the graph) */
export const PED_V = [[12, 9], [12, 10]]; // Istiklal-like avenue, x = xs[12]

export function buildRoadGraph(G, rnd) {
  const { xs, zs } = G, N1 = NC + 1;
  const land = (i, j) => i >= 0 && j >= 0 && i < NC && j < NC && !G.isWaterCell(i, j);
  const inMap = (i, j) => i >= 0 && j >= 0 && i < NC && j < NC;
  const H = new Map(), V = new Map(); // key = i*N1+j -> {kind}
  const hk = (i, j) => i * N1 + j;
  const zoneInternal = { h: new Set(), v: new Set() };
  for (const name of Object.keys(ZONES)) {
    const [i0, j0, i1, j1] = ZONES[name];
    for (let i = i0 + 1; i <= i1; i++) for (let j = j0; j <= j1; j++) zoneInternal.v.add(hk(i, j));
    for (let i = i0; i <= i1; i++) for (let j = j0 + 1; j <= j1; j++) zoneInternal.h.add(hk(i, j));
  }
  for (const [i, j] of PED_V) zoneInternal.v.add(hk(i, j));
  // candidate edges
  for (let j = 0; j <= NC; j++) for (let i = 0; i < NC; i++) { // H edge (i,j)-(i+1,j): cells above (i,j-1), below (i,j)
    const a = land(i, j - 1), b = land(i, j);
    if (!a && !b) continue;
    const coast = (a && inMap(i, j) && !land(i, j)) || (b && inMap(i, j - 1) && !land(i, j - 1));
    H.set(hk(i, j), { coast, both: a && b });
  }
  for (let i = 0; i <= NC; i++) for (let j = 0; j < NC; j++) { // V edge (i,j)-(i,j+1): left (i-1,j), right (i,j)
    const a = land(i - 1, j), b = land(i, j);
    if (!a && !b) continue;
    const coast = (a && inMap(i, j) && !land(i, j)) || (b && inMap(i - 1, j) && !land(i - 1, j));
    V.set(hk(i, j), { coast, both: a && b });
  }
  const zoneCells = new Set();
  for (const name of Object.keys(ZONES)) { const [i0, j0, i1, j1] = ZONES[name]; for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) zoneCells.add(i * NC + j); }
  for (const k of zoneInternal.h) H.delete(k);
  for (const k of zoneInternal.v) V.delete(k);
  // district drop probabilities
  const pDrop = (c) => ({ F: 0.36, S: 0.32, B: 0.32, G: 0.26, C: 0.3, M: 0.26, T: 0.2, U: 0.34, K: 0.3, E: 0.3, s: 0.3, A: 0.38, R: 0.36, N: 0.34, O: 0.26, Y: 0.3, L: 0.1, D: 0.5 }[c] ?? 0.25);
  const cellsOfH = (i, j) => [[i, j - 1], [i, j]], cellsOfV = (i, j) => [[i - 1, j], [i, j]];
  const deg = (i, j) => (H.has(hk(i, j)) ? 1 : 0) + (H.has(hk(i - 1, j)) ? 1 : 0) + (V.has(hk(i, j)) ? 1 : 0) + (V.has(hk(i, j - 1)) ? 1 : 0);
  const bridgeLinks = BRIDGES;
  const connected = () => {
    const seen = new Set(), st = [], nodesAll = [];
    for (let i = 0; i <= NC; i++) for (let j = 0; j <= NC; j++) if (deg(i, j) > 0) nodesAll.push([i, j]);
    const key = (i, j) => i * N1 + j;
    // bridges join their end nodes
    const extra = new Map(); for (const b of bridgeLinks) { const a = b.axis === 'h' ? [b.i0, b.j] : [b.i, b.j0], c = b.axis === 'h' ? [b.i1, b.j] : [b.i, b.j1]; (extra.get(key(...a)) || extra.set(key(...a), []).get(key(...a))).push(c); (extra.get(key(...c)) || extra.set(key(...c), []).get(key(...c))).push(a); }
    st.push(nodesAll[0]); seen.add(key(...nodesAll[0]));
    while (st.length) {
      const [i, j] = st.pop(), nb = [];
      if (H.has(hk(i, j))) nb.push([i + 1, j]); if (H.has(hk(i - 1, j))) nb.push([i - 1, j]);
      if (V.has(hk(i, j))) nb.push([i, j + 1]); if (V.has(hk(i, j - 1))) nb.push([i, j - 1]);
      for (const e of extra.get(key(i, j)) || []) nb.push(e);
      for (const n of nb) { const k = key(...n); if (!seen.has(k)) { seen.add(k); st.push(n); } }
    }
    return seen.size === nodesAll.length;
  };
  const mc = new Uint8Array(NC * NC);
  const cand = [];
  for (const [k, e] of H) if (e.both && !e.coast) { const i = (k / N1) | 0, j = k % N1; if (!AV_ROWS.has(j) || rnd() < 0.15) cand.push(['h', i, j]); }
  for (const [k, e] of V) if (e.both && !e.coast) { const i = (k / N1) | 0, j = k % N1; if (!AV_COLS.has(i) || rnd() < 0.15) cand.push(['v', i, j]); }
  for (let k = cand.length - 1; k > 0; k--) { const m = Math.floor(rnd() * (k + 1)); [cand[k], cand[m]] = [cand[m], cand[k]]; }
  for (const [t, i, j] of cand) {
    const cells = t === 'h' ? cellsOfH(i, j) : cellsOfV(i, j);
    if (!cells.every(([a, b]) => inMap(a, b))) continue;
    if (cells.some(([a, b]) => zoneCells.has(a * NC + b))) continue;
    const lim = 'FSMUBCGK'.includes(G.ch(cells[0][0], cells[0][1])) ? 2 : 1;
    if (cells.some(([a, b]) => mc[a * NC + b] >= lim)) continue;
    if (rnd() > pDrop(G.ch(cells[0][0], cells[0][1]))) continue;
    const ends = t === 'h' ? [[i, j], [i + 1, j]] : [[i, j], [i, j + 1]];
    if (ends.some(([a, b]) => deg(a, b) < 3)) continue;
    const map = t === 'h' ? H : V, k = hk(i, j), v = map.get(k);
    map.delete(k);
    if (!connected()) { map.set(k, v); continue; }
    for (const [a, b] of cells) mc[a * NC + b]++;
  }
  // prune dangling ends (deg 1) iteratively
  for (let again = true; again;) {
    again = false;
    for (let i = 0; i <= NC; i++) for (let j = 0; j <= NC; j++) {
      if (deg(i, j) !== 1) continue;
      const bridged = bridgeLinks.some((b) => (b.axis === 'h' ? (b.i0 === i || b.i1 === i) && b.j === j : b.i === i && (b.j0 === j || b.j1 === j)));
      if (bridged) continue;
      if (H.delete(hk(i, j)) || H.delete(hk(i - 1, j)) || V.delete(hk(i, j)) || V.delete(hk(i, j - 1))) again = true;
    }
  }
  // build node + link lists
  const id = new Map(), nodes = [], links = [];
  const nodeAt = (i, j) => {
    const key = i * N1 + j; let n = id.get(key);
    if (!n) { n = { id: nodes.length, x: xs[i], z: zs[j], i, j, links: [] }; id.set(key, n); nodes.push(n); }
    return n;
  };
  const addLink = (a, b, o) => { const A = nodeAt(...a), B = nodeAt(...b); A.links.push(B.id); B.links.push(A.id); links.push({ a: A, b: B, horiz: A.z === B.z, ...o }); };
  for (const [k, e] of H) { const i = (k / N1) | 0, j = k % N1; addLink([i, j], [i + 1, j], { av: e.coast || AV_ROWS.has(j), coast: e.coast, kind: 'street' }); }
  for (const [k, e] of V) { const i = (k / N1) | 0, j = k % N1; addLink([i, j], [i, j + 1], { av: e.coast || AV_COLS.has(i), coast: e.coast, kind: 'street' }); }
  for (const b of bridgeLinks) addLink(b.axis === 'h' ? [b.i0, b.j] : [b.i, b.j0], b.axis === 'h' ? [b.i1, b.j] : [b.i, b.j1], { av: true, coast: false, kind: 'bridge', bridge: b });
  for (const n of nodes) n.links.sort((p, q) => p - q);
  // pedestrian street segments (for paving only)
  const ped = PED_V.map(([i, j]) => ({ x: xs[i], z0: zs[j], z1: zs[j + 1] }));
  return { nodes, links, ped, H, V, hk, nodeAt: (i, j) => id.get(i * N1 + j) || null };
}

export function makeRoadsApi(R) {
  const { nodes, links } = R;
  // node hash
  const NH = 100, nh = new Map(), nkey = (a, b) => a * 4096 + b;
  for (const n of nodes) { const k = nkey(Math.floor((n.x + 900) / NH), Math.floor((n.z + 900) / NH)); (nh.get(k) || nh.set(k, []).get(k)).push(n); }
  // link hash for isRoad
  const LH = 32, lh = new Map();
  links.forEach((l, li) => {
    const x0 = Math.min(l.a.x, l.b.x) - ROAD_HALF, x1 = Math.max(l.a.x, l.b.x) + ROAD_HALF, z0 = Math.min(l.a.z, l.b.z) - ROAD_HALF, z1 = Math.max(l.a.z, l.b.z) + ROAD_HALF;
    l.rect = { x0, x1, z0, z1 };
    for (let a = Math.floor((x0 + 900) / LH); a <= Math.floor((x1 + 900) / LH); a++) for (let b = Math.floor((z0 + 900) / LH); b <= Math.floor((z1 + 900) / LH); b++) { const k = nkey(a, b); (lh.get(k) || lh.set(k, []).get(k)).push(li); }
  });
  const res = (n) => (typeof n === 'number' ? nodes[n] : n);
  const roads = {
    nodes, links, roadWidth: ROAD_W, laneOffset: LANE, sidewalkOffset: SIDEWALK,
    nearestNode(x, z) {
      const a0 = Math.floor((x + 900) / NH), b0 = Math.floor((z + 900) / NH);
      let best = null, bd = 1e18;
      for (let r = 0; r < 24; r++) {
        for (let a = a0 - r; a <= a0 + r; a++) for (let b = b0 - r; b <= b0 + r; b++) {
          if (r > 0 && Math.abs(a - a0) !== r && Math.abs(b - b0) !== r) continue;
          const l = nh.get(nkey(a, b)); if (!l) continue;
          for (const n of l) { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = n; } }
        }
        if (best && Math.sqrt(bd) <= r * NH) break;
      }
      return best || nodes[0];
    },
    randomNode() { return nodes[Math.floor(Math.random() * nodes.length)]; },
    /** right-hand traffic: travelling a -> b; returns out {x, z, heading} on the lane centre. */
    lanePoint(a, b, t, out = {}) {
      const A = res(a), B = res(b), dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz) || 1;
      out.heading = Math.atan2(dx, dz);
      out.x = A.x + dx * t + (-dz / L) * LANE;
      out.z = A.z + dz * t + (dx / L) * LANE;
      return out;
    },
    isRoad(x, z) {
      const l = lh.get(nkey(Math.floor((x + 900) / LH), Math.floor((z + 900) / LH)));
      if (!l) return false;
      for (const li of l) { const r = links[li].rect; if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return true; }
      return false;
    },
    /** nearest link rect hit info for lot generation: returns true if (x,z) is within `m` metres of any road rect */
    nearRoad(x, z, m) {
      const a0 = Math.floor((x - m - 16 + 900) / LH), a1 = Math.floor((x + m + 16 + 900) / LH), b0 = Math.floor((z - m - 16 + 900) / LH), b1 = Math.floor((z + m + 16 + 900) / LH);
      for (let a = a0; a <= a1; a++) for (let b = b0; b <= b1; b++) {
        const l = lh.get(nkey(a, b)); if (!l) continue;
        for (const li of l) { const r = links[li].rect; if (x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m) return true; }
      }
      return false;
    },
  };
  return roads;
}

/**
 * Asphalt strips + markings (+ optional wear: wheel tracks and decals). `pick(x, z)` returns the chunk batch set
 * { asphalt, marks, tracks?, decals? } for a world position. `extra` = { rng, decalUV, DECAL } is optional.
 */
export function buildRoadMeshes(links, pick, extra) {
  const AS = C(0xffffff), KERB = C(0xc2beb4), GUT = C(0x1e2024), WHITE = C(0xeeeee6), YEL = C(0xf2c230);
  const YA = 0.02, YM = 0.03, YD = 0.027, YT = 0.024;
  const X = extra, rng = X?.rng;
  for (const lk of links) {
    const ax = lk.a.x, az = lk.a.z, bx = lk.b.x, bz = lk.b.z, avenue = lk.av, bridge = lk.kind === 'bridge';
    const B = pick((ax + bx) / 2, (az + bz) / 2);
    const asphalt = B.asphalt, marks = B.marks;
    const horiz = az === bz;
    const L = horiz ? Math.abs(bx - ax) : Math.abs(bz - az);
    const lo = horiz ? Math.min(ax, bx) : Math.min(az, bz), c = horiz ? az : ax;
    const marks_ = (x0, z0, x1, z1, y, col) => (y === YA ? asphalt : marks).rect(x0, z0, x1, z1, y, col);
    const R = (a0, a1, w0, w1, y, col) => { if (horiz) marks_(lo + a0, c + w0, lo + a1, c + w1, y, col); else marks_(c + w0, lo + a0, c + w1, lo + a1, y, col); };
    const P = (a, w) => (horiz ? [lo + a, c + w] : [c + w, lo + a]);
    R(-ROAD_HALF, L + ROAD_HALF, -ROAD_HALF, ROAD_HALF, YA, AS);
    for (const sg of [-1, 1]) {
      R(ROAD_HALF, L - ROAD_HALF, sg > 0 ? ROAD_HALF - 0.28 : -ROAD_HALF, sg > 0 ? ROAD_HALF : -ROAD_HALF + 0.28, YM, KERB);
      R(ROAD_HALF, L - ROAD_HALF, sg > 0 ? ROAD_HALF - 0.55 : -ROAD_HALF + 0.28, sg > 0 ? ROAD_HALF - 0.28 : -ROAD_HALF + 0.55, YM, GUT);
    }
    const s = ROAD_HALF + 5.5, e = L - ROAD_HALF - 5.5;
    if (bridge) { R(ROAD_HALF, L - ROAD_HALF, -0.12, 0.12, YM, YEL); }
    else if (avenue) { R(s, e, -0.3, -0.15, YM, YEL); R(s, e, 0.15, 0.3, YM, YEL); }
    else for (let a = s; a + 3 < e; a += 8) R(a, a + 3, -0.1, 0.1, YM, WHITE);
    if (!bridge) for (const a of [ROAD_HALF + 1.2, L - ROAD_HALF - 2.4]) for (let w = -5.6; w <= 5.6; w += 1.4) R(a, a + 1.2, w, w + 0.7, YM, WHITE);
    const sA = horiz ? -1 : 1;
    R(ROAD_HALF + 2.9, ROAD_HALF + 3.3, sA > 0 ? 0.3 : -ROAD_HALF + 0.6, sA > 0 ? ROAD_HALF - 0.6 : -0.3, YM, WHITE);
    R(L - ROAD_HALF - 3.3, L - ROAD_HALF - 2.9, sA > 0 ? -ROAD_HALF + 0.6 : 0.3, sA > 0 ? -0.3 : ROAD_HALF - 0.6, YM, WHITE);
    if (!X || !B.tracks) continue;
    const quad = (batch, y, cx, cz, hx, hz, ang, uv) => {
      const ca = Math.cos(ang), sa = Math.sin(ang), pts = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([qx, qz]) => { const [wx, wz] = P(cx + qx * ca - qz * sa, cz + qx * sa + qz * ca); return [wx, y, wz]; });
      batch.face(pts, [0, 1, 0], [1, 1, 1], [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]]);
    };
    const a0 = ROAD_HALF + 4.5, a1 = L - ROAD_HALF - 4.5;
    if (a1 > a0 + 6) for (const sg of [-1, 1]) for (const wo of [-0.85, 0.85]) {
      const w = sg * LANE + wo, v0 = rng() * 4, v1 = v0 + (a1 - a0) / 8;
      const pa = P(a0, w - 0.3), pb = P(a0, w + 0.3), pc = P(a1, w + 0.3), pd = P(a1, w - 0.3);
      B.tracks.face([[pa[0], YT, pa[1]], [pb[0], YT, pb[1]], [pc[0], YT, pc[1]], [pd[0], YT, pd[1]]], [0, 1, 0], [1, 1, 1], [[0, v0], [1, v0], [1, v1], [0, v1]]);
    }
    const { DECAL, decalUV } = X;
    const n = Math.max(1, Math.floor(L / 35));
    for (let k = 0; k < n; k++) {
      const a = 12 + rng() * (L - 24), sg = rng() < 0.5 ? -1 : 1, r = rng();
      if (r < 0.28) quad(B.decals, YD, a, sg * (1.2 + rng() * 2.4), 0.46, 0.46, rng() * 6.3, decalUV(DECAL.manhole));
      else if (r < 0.36) quad(B.decals, YD, a, sg * (ROAD_HALF - 1.6), 0.5, 0.5, 0, decalUV(DECAL.cover));
      else if (r < 0.6) quad(B.decals, YD, a, sg * (LANE + (rng() - 0.5)), 1.3 + rng(), 1.3 + rng(), rng() * 6.3, decalUV(DECAL.oil));
      else if (r < 0.78) quad(B.decals, YD, a, (rng() - 0.5) * 8, 1.8 + rng() * 1.4, 1.2 + rng(), rng() * 6.3, decalUV(DECAL.tar));
      else quad(B.decals, YD, a, (rng() - 0.5) * 8, 2.6 + rng() * 1.6, 2.6 + rng() * 1.6, rng() * 6.3, decalUV(rng() < 0.5 ? DECAL.crackA : DECAL.crackB));
    }
    for (const a of [ROAD_HALF + 9.5, L - ROAD_HALF - 9.5]) for (const sg of [-1, 1]) if (rng() < 0.6) quad(B.decals, YD, a, sg * (ROAD_HALF - 0.95), 0.62, 0.3, 0, decalUV(DECAL.drain));
  }
}
