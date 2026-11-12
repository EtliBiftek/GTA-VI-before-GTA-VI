// Neon Coast world: procedural city "Palmera". Contract: docs/ARCHITECTURE.md (World section).
import * as THREE from 'three';
import { seeded, clamp } from '../core/utils.js';
import { HALF, ROAD_HALF, LANE, SIDEWALK, SW_EDGE, LOT_MARGIN, COAST_X, shoreAt, PIER } from './layout.js';
import { Batch, C, shade } from './geo.js';
import { buildRoadGraph, makeRoadsApi, buildRoadMeshes } from './roads.js';
import { FACADE, makeFacade, makeSignAtlas, signUV, SIGN_ID, makeGlow } from './textures.js';
import { createSky } from './sky.js';
import { renderMinimap } from './minimap.js';

const PASTEL = [0xf7c6d0, 0xbfe6dc, 0xfbe3a8, 0xb8d4f2, 0xf5b895, 0xd8c4f0, 0xf2efe2, 0x9fe0e8];
const GLASS = [0x9cc4e4, 0x8aaed6, 0xb4d0e0, 0xc0b0e4, 0x92d8cc, 0xe0b4d0, 0x7f96b8];
const HOUSE = [0xf5e6d0, 0xf3d0c0, 0xcfe8e0, 0xf6e7a8, 0xd8e0f0, 0xf0c8d8];
const ROOFS = [0xb5523b, 0x8a4a3a, 0x5a6a7a, 0xc0694a];
const INDUS = [0xc8ccd0, 0xb0b8c0, 0xd0c8b0, 0x9fb0b8];
const BOXES = [0xd9482e, 0x2d7fb8, 0xe8b030, 0x3a9a5a, 0x8e5aa8, 0xcfcfcf];

export function createWorld(game) {
  const rand = seeded(20240611);
  const rr = (a, b) => a + rand() * (b - a);
  const rpick = (arr) => arr[Math.floor(rand() * arr.length)];
  const G = buildRoadGraph(rand);
  const { xs, zs, NX, NZ, h: hL, v: vL, idx, nodes } = G;
  { const k = Math.floor(NZ * 0.68); PIER.z = Math.round((zs[k] + zs[k + 1]) / 2); }

  const fills = new Batch(), inner = new Batch(), asphalt = new Batch(), marks = new Batch(), solid = new Batch(), bill = new Batch();
  const fac = { glass: new Batch(), deco: new Batch(), house: new Batch(), industrial: new Batch() };
  const colliders = [], footprints = [], landmarks = [], reserved = [];
  const props = { palms: [], trees: [], benches: [], lamps: [] };

  const addCollider = (minX, maxX, minZ, maxZ, height, fp) => {
    colliders.push({ minX, maxX, minZ, maxZ, height });
    if (fp) footprints.push({ minX, maxX, minZ, maxZ });
  };
  const addLandmark = (id, name, type, x, z) => { landmarks.push({ id, name, type, x, z }); reserved.push({ x, z, r: 4.5 }); };

  // ---------- ground ----------
  fills.rect(-2500, -2500, 2500, 2500, -0.06, C(0x7a9d5a));
  buildRoadMeshes(G, asphalt, marks);
  const CONC = C(0xc4c1b8);
  // outer sidewalks around the grid
  const zA = zs[0] - SW_EDGE, zB = zs[NZ - 1] + SW_EDGE;
  fills.rect(xs[0] - SW_EDGE, zA, xs[0] - ROAD_HALF, zB, 0.01, CONC);
  fills.rect(xs[0] - ROAD_HALF, zA, COAST_X, zs[0] - ROAD_HALF, 0.01, CONC);
  fills.rect(xs[0] - ROAD_HALF, zs[NZ - 1] + ROAD_HALF, COAST_X, zB, 0.01, CONC);
  // promenade + beach + quay
  fills.rect(457, -340, 461, 562, 0.01, CONC);
  fills.rect(457, -600, shoreAt(-400), -340, 0.01, C(0x8a8d92));
  for (let z = -340; z < 600; z += 10) {
    const s0 = shoreAt(z), s1 = shoreAt(z + 10), L = C(0xf0dcab), W = C(0xcdb98e);
    fills.face([[461, 0.01, z], [461, 0.01, z + 10], [s1 - 9, 0.01, z + 10], [s0 - 9, 0.01, z]], [0, 1, 0], L);
    fills.face([[s0 - 9, 0.01, z], [s1 - 9, 0.01, z + 10], [s1, 0.01, z + 10], [s0, 0.01, z]], [0, 1, 0], [L, L, W, W]);
  }
  const foamB = new Batch();
  for (let z = -600; z < 600; z += 10) {
    const s0 = shoreAt(z), s1 = shoreAt(z + 10);
    foamB.face([[s0 - 1.2, 0.025, z], [s1 - 1.2, 0.025, z + 10], [s1 + 1.6, 0.025, z + 10], [s0 + 1.6, 0.025, z]], [0, 1, 0], [1, 1, 1]);
  }

  // ---------- cells ----------
  const cells = [];
  for (let i = 0; i < NX - 1; i++) for (let j = 0; j < NZ - 1; j++) {
    const x0 = xs[i], x1 = xs[i + 1], z0 = zs[j], z1 = zs[j + 1];
    const sides = [vL[idx(i, j)], vL[idx(i + 1, j)], hL[idx(i, j)], hL[idx(i, j + 1)]]; // W E S N(+z)
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, d = Math.hypot(cx, cz);
    const inn = {
      minX: x0 + (sides[0] ? LOT_MARGIN : 3), maxX: x1 - (sides[1] ? LOT_MARGIN : 3),
      minZ: z0 + (sides[2] ? LOT_MARGIN : 3), maxZ: z1 - (sides[3] ? LOT_MARGIN : 3),
    };
    const type = (cz < -300 && cx > 60) ? 'industrial' : i === NX - 2 ? 'resort' : d < 190 ? 'downtown' : d < 330 ? 'commercial' : 'residential';
    cells.push({ i, j, x0, x1, z0, z1, cx, cz, sides, inner: inn, type, placed: [], special: false, full: sides.every(Boolean) });
  }
  const pick = (px, pz, pred) => {
    let b = null, bd = 1e9;
    for (const c of cells) { if (c.special || !pred(c)) continue; const dd = Math.hypot(c.cx - px, c.cz - pz); if (dd < bd) { bd = dd; b = c; } }
    if (b) b.special = true; return b;
  };

  // ---------- helpers ----------
  const overlaps = (cell, r, m = 2) => cell.placed.some((p) => r.minX < p.maxX + m && r.maxX > p.minX - m && r.minZ < p.maxZ + m && r.maxZ > p.minZ - m);
  function facadeBox(kind, x0, z0, x1, z1, y0, y1, col) {
    const F = FACADE[kind], fb = fac[kind], uo = rand();
    const walls = [[[x0, z1], [x1, z1], [0, 0, 1]], [[x1, z0], [x0, z0], [0, 0, -1]], [[x1, z1], [x1, z0], [1, 0, 0]], [[x0, z0], [x0, z1], [-1, 0, 0]]];
    for (const [a, b, n] of walls) {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), u0 = uo, u1 = uo + L / F.repW, v0 = y0 / F.repH, v1 = y1 / F.repH;
      fb.face([[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]], n, col, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
    }
  }
  function board(cx, cy, cz, w, hh, fx, fz, sign) {
    const rx = fz, rz = -fx, [u0, v0, u1, v1] = signUV(sign), px = cx + fx * 0.12, pz = cz + fz * 0.12;
    bill.face([[px - rx * w / 2, cy - hh / 2, pz - rz * w / 2], [px + rx * w / 2, cy - hh / 2, pz + rz * w / 2], [px + rx * w / 2, cy + hh / 2, pz + rz * w / 2], [px - rx * w / 2, cy + hh / 2, pz - rz * w / 2]],
      [fx, 0, fz], [1, 1, 1], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
    const hx = Math.abs(rx) * w / 2 + Math.abs(fx) * 0.1, hz = Math.abs(rz) * w / 2 + Math.abs(fz) * 0.1;
    solid.box(cx - hx, cy - hh / 2, cz - hz, cx + hx, cy + hh / 2, cz + hz, C(0x30333a));
  }
  function signPost(x, z, fx, fz, sign) {
    const rx = fz, rz = -fx;
    for (const s of [-1.6, 1.6]) {
      const px = x + rx * s, pz = z + rz * s;
      solid.box(px - 0.12, 0, pz - 0.12, px + 0.12, 4.6, pz + 0.12, C(0x3a3d45));
      addCollider(px - 0.2, px + 0.2, pz - 0.2, pz + 0.2, 4.6);
    }
    board(x, 3.5, z, 4.4, 2.2, fx, fz, sign);
  }
  function house(rect, hh, col, roof, f) {
    const x0 = rect.minX, x1 = rect.maxX, z0 = rect.minZ, z1 = rect.maxZ, floors = Math.max(1, Math.round(hh / 3));
    const H = floors * 3;
    facadeBox('house', x0, z0, x1, z1, 0, H, col);
    solid.gable(x0 - 0.4, z0 - 0.4, x1 + 0.4, z1 + 0.4, H, 2.4, roof, (x1 - x0) >= (z1 - z0));
    addCollider(x0, x1, z0, z1, H + 2.4, true); return H;
  }
  function mid(rect, hh, col, kind = 'deco') {
    const F = FACADE[kind], H = Math.max(1, Math.round(hh / F.floor)) * F.floor;
    facadeBox(kind, rect.minX, rect.minZ, rect.maxX, rect.maxZ, 0, H, col);
    solid.rect(rect.minX, rect.minZ, rect.maxX, rect.maxZ, H, C(0x8d8f96));
    const cx = (rect.minX + rect.maxX) / 2, cz = (rect.minZ + rect.maxZ) / 2;
    solid.box(cx - 2, H, cz - 2, cx + 2, H + 1.6, cz + 2, C(0x777a82));
    addCollider(rect.minX, rect.maxX, rect.minZ, rect.maxZ, H + 1.6, true); return H;
  }
  function tower(rect, hh, col) {
    const F = FACADE.glass, hp = rr(2, 4) * F.floor, H = Math.round(hh / F.floor) * F.floor;
    facadeBox('glass', rect.minX, rect.minZ, rect.maxX, rect.maxZ, 0, hp, shade(col, 1.1));
    solid.rect(rect.minX, rect.minZ, rect.maxX, rect.maxZ, hp, C(0x6f7380));
    addCollider(rect.minX, rect.maxX, rect.minZ, rect.maxZ, hp, true);
    const w = rect.maxX - rect.minX, d = rect.maxZ - rect.minZ, ix = w * rr(0.12, 0.2), iz = d * rr(0.12, 0.2);
    const s = { minX: rect.minX + ix, maxX: rect.maxX - ix, minZ: rect.minZ + iz, maxZ: rect.maxZ - iz };
    facadeBox('glass', s.minX, s.minZ, s.maxX, s.maxZ, hp, H, col);
    solid.rect(s.minX, s.minZ, s.maxX, s.maxZ, H, C(0x5d6170));
    addCollider(s.minX, s.maxX, s.minZ, s.maxZ, H);
    const cx = (s.minX + s.maxX) / 2, cz = (s.minZ + s.maxZ) / 2;
    if (rand() < 0.6) { facadeBox('glass', cx - 4, cz - 4, cx + 4, cz + 4, H, H + 8, col); solid.rect(cx - 4, cz - 4, cx + 4, cz + 4, H + 8, C(0x5d6170)); }
    solid.box(cx - 0.3, H + 8, cz - 0.3, cx + 0.3, H + 24, cz + 0.3, C(0xcc2a3a));
    return H;
  }
  function warehouse(rect, hh, col) {
    const F = FACADE.industrial, H = Math.max(1, Math.round(hh / F.floor)) * F.floor;
    facadeBox('industrial', rect.minX, rect.minZ, rect.maxX, rect.maxZ, 0, H, col);
    solid.rect(rect.minX, rect.minZ, rect.maxX, rect.maxZ, H, C(0x80868c));
    addCollider(rect.minX, rect.maxX, rect.minZ, rect.maxZ, H, true); return H;
  }
  function container(x, z, alongZ) {
    const hx = alongZ ? 1.3 : 6.1, hz = alongZ ? 6.1 : 1.3, n = 1 + Math.floor(rand() * 3), col = C(rpick(BOXES));
    for (let k = 0; k < n; k++) solid.box(x - hx, k * 2.6, z - hz, x + hx, (k + 1) * 2.6 - 0.05, z + hz, shade(col, 0.85 + rand() * 0.3));
    addCollider(x - hx, x + hx, z - hz, z + hz, n * 2.6, true);
  }
  // special building on a side of a cell; returns { rect, f, lm }
  function placeSpecial(cell, w, d) {
    const xc = (cell.x0 + cell.x1) / 2, zc = (cell.z0 + cell.z1) / 2;
    const order = [0, 1, 2, 3].filter((s) => cell.sides[s]);
    const side = order[Math.floor(rand() * order.length)];
    let rect, f, lm;
    if (side === 0) { rect = { minX: cell.x0 + LOT_MARGIN, maxX: cell.x0 + LOT_MARGIN + d, minZ: zc - w / 2, maxZ: zc + w / 2 }; f = [-1, 0]; lm = { x: cell.x0 + SIDEWALK, z: zc }; }
    else if (side === 1) { rect = { minX: cell.x1 - LOT_MARGIN - d, maxX: cell.x1 - LOT_MARGIN, minZ: zc - w / 2, maxZ: zc + w / 2 }; f = [1, 0]; lm = { x: cell.x1 - SIDEWALK, z: zc }; }
    else if (side === 2) { rect = { minX: xc - w / 2, maxX: xc + w / 2, minZ: cell.z0 + LOT_MARGIN, maxZ: cell.z0 + LOT_MARGIN + d }; f = [0, -1]; lm = { x: xc, z: cell.z0 + SIDEWALK }; }
    else { rect = { minX: xc - w / 2, maxX: xc + w / 2, minZ: cell.z1 - LOT_MARGIN - d, maxZ: cell.z1 - LOT_MARGIN }; f = [0, 1]; lm = { x: xc, z: cell.z1 - SIDEWALK }; }
    cell.placed.push(rect);
    return { rect, f, lm, side };
  }
  function wallSign(sp, H, id, wMax = 10) {
    const { rect, f } = sp, along = f[0] !== 0 ? rect.maxZ - rect.minZ : rect.maxX - rect.minX;
    const w = Math.min(along * 0.8, wMax), hh = w / 2, cy = clamp(H * 0.72, hh / 2 + 3, Math.max(hh / 2 + 3, H - hh / 2 - 0.5));
    const fx = f[0] < 0 ? rect.minX : f[0] > 0 ? rect.maxX : (rect.minX + rect.maxX) / 2;
    const fz = f[1] < 0 ? rect.minZ : f[1] > 0 ? rect.maxZ : (rect.minZ + rect.maxZ) / 2;
    board(fx + f[0] * 0.1, cy, fz + f[1] * 0.1, w, hh, f[0], f[1], id);
  }
  const CITY_FILL = { downtown: 0x9b9a98, commercial: 0xb0ada6, resort: 0xb8b2a8, residential: 0x7fae5c, industrial: 0x75777c, park: 0x6dbb55, plaza: 0xe6c8c0 };

  // ---------- specials ----------
  const spec = {};
  spec.park = pick(-300, 260, (c) => c.full && c.type !== 'industrial');
  const park2 = pick(230, 300, (c) => c.full && c.type !== 'industrial' && c.type !== 'resort');
  const park3 = pick(-280, -260, (c) => c.full && c.type !== 'industrial');
  spec.plaza = pick(80, 60, (c) => c.type === 'downtown' && c.full);
  spec.stadium = pick(250, -170, (c) => c.full && c.type !== 'industrial' && c.type !== 'resort' && c.x1 - c.x0 >= 80 && c.z1 - c.z0 >= 80) ||
    pick(250, -170, (c) => c.full && c.type !== 'industrial' && c.type !== 'resort');
  const parks = [spec.park, park2, park3].filter(Boolean);
  for (const c of parks) c.type = 'park';
  if (spec.plaza) spec.plaza.type = 'plaza';
  if (spec.stadium) spec.stadium.type = 'stadium';
  const spCell = {
    safehouse: pick(-180, 180, (c) => c.type === 'residential' && c.full),
    hospital: pick(-250, -110, (c) => c.type !== 'industrial' && c.type !== 'resort' && c.full),
    police: pick(130, -210, (c) => c.type !== 'industrial' && c.type !== 'resort' && c.full),
    gunshop: pick(-130, -300, (c) => c.type !== 'resort' && c.full),
    garage: pick(160, -400, (c) => c.type === 'industrial' && c.full),
    downtown: pick(-40, -40, (c) => c.type === 'downtown' && c.full),
  };
  const SP = {
    safehouse: { w: 14, d: 11, name: 'Güvenli Ev', type: 'safehouse' },
    hospital: { w: 36, d: 22, name: 'Palmera Devlet Hastanesi', type: 'hospital' },
    police: { w: 30, d: 20, name: 'Merkez Polis Karakolu', type: 'police' },
    gunshop: { w: 18, d: 14, name: 'Kurşun & Barut Silah Dükkânı', type: 'gunshop' },
    garage: { w: 28, d: 18, name: 'Usta Oto Garajı', type: 'garage' },
    downtown: { w: 34, d: 30, name: 'Şehir Merkezi', type: 'downtown' },
  };
  let spawnPoint = { x: 0, z: 0, heading: 0 };
  for (const id of Object.keys(spCell)) {
    const cell = spCell[id], s = SP[id]; if (!cell) continue;
    const sp = placeSpecial(cell, s.w, s.d); let H;
    if (id === 'safehouse') H = house(sp.rect, 7, C(0x3fc1b0), C(0xff7ab8));
    else if (id === 'hospital') H = mid(sp.rect, 27, C(0xf4f7fa));
    else if (id === 'police') H = mid(sp.rect, 17, C(0x5f87c8));
    else if (id === 'gunshop') H = mid(sp.rect, 7, C(0xffb347));
    else if (id === 'garage') H = warehouse(sp.rect, 8, C(0xf08a4b));
    else H = tower(sp.rect, 170, C(0x7aa8d8));
    wallSign(sp, H, SIGN_ID[id], id === 'downtown' ? 16 : 10);
    addLandmark(id, s.name, s.type, sp.lm.x, sp.lm.z);
    if (id === 'safehouse') {
      const alx = sp.f[0] === 0 ? 1 : 0, alz = sp.f[0] === 0 ? 0 : 1;
      spawnPoint = { x: sp.lm.x + alx * 4, z: sp.lm.z + alz * 4, heading: Math.atan2(sp.f[0], sp.f[1]) };
      reserved.push({ x: spawnPoint.x, z: spawnPoint.z, r: 3 });
    }
  }

  // ---------- fill + buildings for every cell ----------
  for (const c of cells) {
    const [W, E, S, N] = c.sides;
    fills.rect(c.x0 + (W ? ROAD_HALF : 0), c.z0 + (S ? ROAD_HALF : 0), c.x1 - (E ? ROAD_HALF : 0), c.z1 - (N ? ROAD_HALF : 0), 0.01, CONC);
    const ix0 = c.x0 + (W ? SW_EDGE : 0.5), ix1 = c.x1 - (E ? SW_EDGE : 0.5), iz0 = c.z0 + (S ? SW_EDGE : 0.5), iz1 = c.z1 - (N ? SW_EDGE : 0.5);
    if (c.type !== 'stadium') inner.rect(ix0, iz0, ix1, iz1, 0.015, C(CITY_FILL[c.type] || 0x9b9a98));
    const I = c.inner, iw = I.maxX - I.minX, id = I.maxZ - I.minZ;
    if (c.type === 'park' || c.type === 'plaza' || c.type === 'stadium') continue;
    const lots = (cols, rows, gap = 2.5) => {
      const out = [], lw = (iw - gap * (cols - 1)) / cols, ld = (id - gap * (rows - 1)) / rows;
      for (let a = 0; a < cols; a++) for (let b = 0; b < rows; b++)
        out.push({ minX: I.minX + a * (lw + gap), maxX: I.minX + a * (lw + gap) + lw, minZ: I.minZ + b * (ld + gap), maxZ: I.minZ + b * (ld + gap) + ld });
      return out;
    };
    const shrink = (r, m) => ({ minX: r.minX + m, maxX: r.maxX - m, minZ: r.minZ + m, maxZ: r.maxZ - m });
    if (c.type === 'downtown') {
      for (const l of lots(iw > 60 ? 2 : 1, id > 60 ? 2 : 1)) {
        const r = shrink(l, 1.5); if (overlaps(c, r, 0)) continue;
        const near = clamp(1 - Math.hypot(c.cx, c.cz) / 200, 0, 1);
        tower(r, 50 + near * 120 + rand() * 30, C(rpick(GLASS)));
      }
    } else if (c.type === 'commercial' || c.type === 'resort') {
      for (const l of lots(Math.max(1, Math.floor(iw / 34)), Math.max(1, Math.floor(id / 34)))) {
        const r = shrink(l, rr(1, 3)); if (overlaps(c, r, 0)) continue;
        const col = C(rpick(PASTEL)), hh = c.type === 'resort' ? rr(20, 55) : rr(14, 42);
        const H = mid(r, hh, col);
        if (rand() < 0.3) { const f = [[0, -1], [0, 1], [-1, 0], [1, 0]][Math.floor(rand() * 4)]; const cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2;
          board(cx, H + 3.5, cz, 9, 4.5, f[0], f[1], Math.floor(rand() * 10)); solid.box(cx - 0.3, H, cz - 0.3, cx + 0.3, H + 1.3, cz + 0.3, C(0x30333a)); }
      }
    } else if (c.type === 'residential') {
      for (const l of lots(Math.max(1, Math.floor(iw / 22)), Math.max(1, Math.floor(id / 22)), 0)) {
        if (rand() < 0.1) continue;
        const lw = l.maxX - l.minX, ld = l.maxZ - l.minZ, w = Math.min(lw - 3, rr(9, 14)), d = Math.min(ld - 3, rr(8, 12));
        if (w < 5 || d < 5) continue;
        const cx = (l.minX + l.maxX) / 2, cz = (l.minZ + l.maxZ) / 2;
        const r = { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 };
        if (overlaps(c, r, 1)) continue;
        c.placed.push(r);
        if (rand() < 0.2) mid(r, rr(10, 14), C(rpick(PASTEL)), 'house'); else house(r, rr(5.5, 9), C(rpick(HOUSE)), C(rpick(ROOFS)));
        if (rand() < 0.6) { const tx = rand() < 0.5 ? l.minX + 1.5 : l.maxX - 1.5, tz = rand() < 0.5 ? l.minZ + 1.5 : l.maxZ - 1.5; props.trees.push({ x: tx, z: tz, s: rr(0.8, 1.2) }); }
      }
    } else if (c.type === 'industrial') {
      for (const l of lots(iw > 70 ? 2 : 1, id > 70 ? 2 : 1)) {
        const r = shrink(l, 2); if (overlaps(c, r, 0)) continue;
        if (rand() < 0.6) warehouse(r, rr(9, 14), C(rpick(INDUS)));
        else for (let x = r.minX + 7; x < r.maxX - 5; x += 6) for (let z = r.minZ + 7; z < r.maxZ - 5; z += 14) if (rand() < 0.75) container(x, z, true);
      }
    }
  }

  // ---------- parks / plaza / stadium ----------
  const sideLm = (cell, pushIn = 0) => {
    const s = [0, 1, 2, 3].find((k) => cell.sides[k]), xc = (cell.x0 + cell.x1) / 2, zc = (cell.z0 + cell.z1) / 2;
    return [{ x: cell.x0 + SIDEWALK, z: zc, f: [-1, 0] }, { x: cell.x1 - SIDEWALK, z: zc, f: [1, 0] }, { x: xc, z: cell.z0 + SIDEWALK, f: [0, -1] }, { x: xc, z: cell.z1 - SIDEWALK, f: [0, 1] }][s];
  };
  parks.forEach((c, k) => {
    const lm = sideLm(c);
    addLandmark(k === 0 ? 'park' : 'park' + (k + 1), ['Dalgakıran Parkı', 'Kumsal Parkı', 'Akasya Parkı'][k], 'park', lm.x, lm.z);
    signPost(lm.x - lm.f[0] * 6, lm.z - lm.f[1] * 6, lm.f[0], lm.f[1], SIGN_ID.park);
    const I = c.inner; let tries = 0, n = 0; const pts = [];
    while (n < 26 && tries++ < 300) {
      const x = rr(I.minX + 2, I.maxX - 2), z = rr(I.minZ + 2, I.maxZ - 2);
      if (pts.some((p) => Math.hypot(p.x - x, p.z - z) < 6) || Math.hypot(x - (lm.x - lm.f[0] * 6), z - (lm.z - lm.f[1] * 6)) < 5 || Math.hypot(x - lm.x, z - lm.z) < 8) continue;
      pts.push({ x, z }); props.trees.push({ x, z, s: rr(1, 1.5) }); n++;
    }
    for (let b = 0; b < 3; b++) props.benches.push({ x: rr(I.minX + 8, I.maxX - 8), z: rr(I.minZ + 8, I.maxZ - 8), h: rand() * 6.28, free: true });
  });
  if (spec.plaza) {
    const c = spec.plaza, cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
    solid.box(cx - 2, 0, cz - 2, cx + 2, 9, cz + 2, C(0xff6ad5)); solid.box(cx - 3.2, 0, cz - 3.2, cx + 3.2, 0.6, cz + 3.2, C(0x8ad8e8));
    addCollider(cx - 3.2, cx + 3.2, cz - 3.2, cz + 3.2, 9);
    addLandmark('plaza', 'Neon Meydanı', 'plaza', cx, cz + 8);
    for (let a = 0; a < 8; a++) { const ang = a * Math.PI / 4; props.palms.push({ x: cx + Math.cos(ang) * 14, z: cz + Math.sin(ang) * 14, s: rr(1, 1.2) }); }
    for (let a = 0; a < 4; a++) { const ang = a * Math.PI / 2 + 0.78; props.benches.push({ x: cx + Math.cos(ang) * 11, z: cz + Math.sin(ang) * 11, h: Math.atan2(-Math.cos(ang), -Math.sin(ang)) + 0, free: true }); }
  }
  if (spec.stadium) {
    const c = spec.stadium, cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
    const ax = Math.min((c.inner.maxX - c.inner.minX) / 2, 31), az = Math.min((c.inner.maxZ - c.inner.minZ) / 2, 38), T = 8, G0 = 10;
    const stands = [
      [cx - ax + G0, cx + ax - G0, cz + az - T, cz + az], [cx - ax + G0, cx + ax - G0, cz - az, cz - az + T],
      [cx + ax - T, cx + ax, cz - az + G0, cz + az - G0], [cx - ax, cx - ax + T, cz - az + G0, cz + az - G0],
    ];
    stands.forEach((s, k) => {
      solid.box(s[0], 0, s[2], s[1], 9, s[3], C(k % 2 ? 0x2a5fa8 : 0xc94a5a)); solid.box(s[0] + (k > 1 ? 0 : 0), 9, s[2], s[1], 14, s[3], C(0x3a3d4a), false);
      addCollider(s[0], s[1], s[2], s[3], 14, true);
    });
    inner.rect(cx - ax + T + 1, cz - az + T + 1, cx + ax - T - 1, cz + az - T - 1, 0.015, C(0x3fae4a));
    const px0 = cx - ax + T + 2, px1 = cx + ax - T - 2, pz0 = cz - az + T + 2, pz1 = cz + az - T - 2, ln = C(0xf2f2f2);
    marks.rect(px0, pz0, px1, pz0 + 0.25, 0.03, ln); marks.rect(px0, pz1 - 0.25, px1, pz1, 0.03, ln);
    marks.rect(px0, pz0, px0 + 0.25, pz1, 0.03, ln); marks.rect(px1 - 0.25, pz0, px1, pz1, 0.03, ln);
    marks.rect(px0, (pz0 + pz1) / 2 - 0.12, px1, (pz0 + pz1) / 2 + 0.12, 0.03, ln);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = cx + sx * (ax + 1.5), z = cz + sz * (az + 1.5);
      solid.box(x - 0.4, 0, z - 0.4, x + 0.4, 26, z + 0.4, C(0x555a66)); solid.box(x - 1.5, 26, z - 1.5, x + 1.5, 27.2, z + 1.5, C(0xfff4c8));
      addCollider(x - 0.5, x + 0.5, z - 0.5, z + 0.5, 26);
    }
    const lm = sideLm(c); addLandmark('stadium', 'Palmera Stadyumu', 'stadium', lm.x, lm.z);
    const fx = lm.f[0] < 0 ? cx - ax : lm.f[0] > 0 ? cx + ax : cx, fz = lm.f[1] < 0 ? cz - az : lm.f[1] > 0 ? cz + az : cz;
    board(fx + lm.f[0] * 0.1, 11.5, fz + lm.f[1] * 0.1, 14, 7, lm.f[0], lm.f[1], SIGN_ID.stadium);
  }

  // ---------- coast: pier, beach, docks ----------
  {
    const pz = PIER.z;
    for (let x = PIER.x0, k = 0; x < PIER.x1; x += 2, k++) solid.box(x, 0, pz - PIER.hw, Math.min(x + 2, PIER.x1), 0.06, pz + PIER.hw, C(k % 2 ? 0xa8825a : 0x9a7650));
    for (const s of [-1, 1]) {
      const z = pz + s * (PIER.hw - 0.12);
      solid.box(PIER.x0, 1.05, z - 0.06, PIER.x1, 1.17, z + 0.06, C(0xe8e2d6));
      for (let x = PIER.x0 + 2; x <= PIER.x1; x += 6) solid.box(x - 0.08, 0, z - 0.08, x + 0.08, 1.1, z + 0.08, C(0xe8e2d6));
      for (let x = PIER.x0 + 16; x < PIER.x1 - 4; x += 22) props.lamps.push({ x, z: pz + s * 3.1, dx: 0, dz: -s });
    }
    for (let x = PIER.x0 + 20; x < PIER.x1 - 6; x += 30) props.benches.push({ x, z: pz + 3.0, h: Math.PI, free: true, noCol: true });
    addLandmark('pier', 'Mercan İskelesi', 'pier', 459, pz - 7);
    signPost(466, pz - 11, -1, 0, SIGN_ID.pier);
    addLandmark('beach', 'Güneş Plajı', 'beach', 487, 330);
    signPost(480, 340, -1, 0, SIGN_ID.beach);
    for (let k = 0; k < 28; k++) {
      const z = rr(-250, 560), x = rr(470, shoreAt(z) - 14);
      if (Math.abs(z - pz) < 9 || Math.hypot(x - 487, z - 330) < 4) continue;
      const col = C(rpick([0xff5a7a, 0xffd23a, 0x2ec4b6, 0xff8a3d, 0xffffff]));
      solid.box(x - 0.04, 0, z - 0.04, x + 0.04, 2.3, z + 0.04, C(0xe8e2d6)); solid.pyramid(x, z, 2.1, 1.7, 1.7, 0.6, col);
      solid.box(x + 2.2, 0, z - 0.5, x + 3.8, 0.35, z + 0.5, C(0xffffff));
    }
    solid.box(488, 0, 60, 491, 3.2, 63, C(0xffffff)); solid.pyramid(489.5, 61.5, 3.2, 2.2, 2.2, 1.2, C(0xd62839)); addCollider(488, 491, 60, 63, 4.4);
    for (let k = 0; k < 40; k++) { const z = rr(-300, 560), x = rr(466, 486); if (Math.abs(z - pz) > 8) props.palms.push({ x, z, s: rr(0.8, 1.2) }); }
    // docks
    addLandmark('docks', 'Liman Rıhtımı', 'docks', 463, -440);
    signPost(468, -436, -1, 0, SIGN_ID.docks);
    for (let z = -560; z < -360; z += 16) for (const x of [476, 492]) if (rand() < 0.7) container(x, z, true);
    for (const [x, z] of [[505, -420], [513, -420], [505, -432], [513, -432]]) { solid.box(x - 0.8, 0, z - 0.8, x + 0.8, 30, z + 0.8, C(0xe8a020)); addCollider(x - 0.9, x + 0.9, z - 0.9, z + 0.9, 30); }
    solid.box(500, 30, -433, 545, 32.5, -419, C(0xe8a020));
    solid.box(535, -4, -520, 553, 9, -380, C(0x9a2b2b)); solid.box(535.5, 9, -400, 552.5, 12, -380, C(0xeeeeee));
    for (let z = -515; z < -405; z += 13) solid.box(537, 9, z, 551, 11.6, z + 12, C(rpick(BOXES)));
  }

  // ---------- props: lamps, palms, benches ----------
  const free = (x, z, r) => {
    if (x > shoreAt(z) - 1 && !(Math.abs(z - PIER.z) < PIER.hw && x < PIER.x1)) return false;
    if (Math.abs(x) > HALF - 3 || Math.abs(z) > HALF - 3) return false;
    for (const q of reserved) if (Math.hypot(q.x - x, q.z - z) < q.r) return false;
    for (const b of colliders) if (x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) return false;
    return true;
  };
  const roadsApi = makeRoadsApi(G, rand);
  for (const n of nodes) {
    const sgn = rand() < 0.5 ? 1 : -1;
    for (const [sx, sz] of [[1, sgn], [-1, -sgn]]) {
      const x = n.x + sx * 8.2, z = n.z + sz * 8.2;
      if (x > shoreAt(z) - 4 || Math.abs(x) > HALF - 3 || Math.abs(z) > HALF - 3) continue;
      props.lamps.push({ x, z, dx: -sx / Math.SQRT2, dz: -sz / Math.SQRT2 });
    }
  }
  const linkList = [];
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
    if (hL[idx(i, j)]) linkList.push({ a: nodes[idx(i, j)], b: nodes[idx(i + 1, j)], av: !!G.avZ[j] });
    if (vL[idx(i, j)]) linkList.push({ a: nodes[idx(i, j)], b: nodes[idx(i, j + 1)], av: !!G.avX[i] });
  }
  for (const { a, b, av } of linkList) {
    const dx = Math.sign(b.x - a.x), dz = Math.sign(b.z - a.z), L = Math.hypot(b.x - a.x, b.z - a.z), px = -dz, pz = dx;
    const step = av ? 16 : 26;
    for (let t = 16; t < L - 16; t += step) for (const s of [-1, 1]) {
      if (!av && rand() > 0.25) continue;
      props.palms.push({ x: a.x + dx * t + px * s * 10.4, z: a.z + dz * t + pz * s * 10.4, s: rr(0.9, 1.25) });
    }
    if (rand() < 0.22) { const s = rand() < 0.5 ? -1 : 1, t = L * rr(0.35, 0.65); props.benches.push({ x: a.x + dx * t + px * s * 10.4, z: a.z + dz * t + pz * s * 10.4, h: Math.atan2(-px * s, -pz * s) }); }
  }
  for (let k = 0; k < 40; k++) { // outer ring trees
    const side = Math.floor(rand() * 3);
    const x = side === 0 ? rr(-596, -568) : rr(-560, 440), z = side === 0 ? rr(-596, 596) : side === 1 ? rr(-596, -568) : rr(568, 596);
    props.palms.push({ x, z, s: rr(0.9, 1.3) });
  }
  const placed = { palms: [], trees: [], benches: [], lamps: props.lamps };
  for (const p of props.palms) if (free(p.x, p.z, 0.8)) { placed.palms.push(p); addCollider(p.x - 0.3, p.x + 0.3, p.z - 0.3, p.z + 0.3, 6); }
  for (const p of props.trees) if (free(p.x, p.z, 0.8)) { placed.trees.push(p); addCollider(p.x - 0.35, p.x + 0.35, p.z - 0.35, p.z + 0.35, 5); }
  for (const p of props.benches) {
    if (!free(p.x, p.z, 1.2)) continue;
    placed.benches.push(p);
    if (!p.noCol) { const along = Math.abs(Math.cos(p.h)) > 0.7; const hx = along ? 0.9 : 0.35, hz = along ? 0.35 : 0.9; addCollider(p.x - hx, p.x + hx, p.z - hz, p.z + hz, 0.9); }
  }

  // landmark sanity: nudge nothing, but drop trees already guarded by `reserved`.

  // ---------- meshes ----------
  const group = new THREE.Group(); group.name = 'world'; game.scene.add(group);
  const mats = [];
  const aniso = Math.min(4, game.renderer?.capabilities?.getMaxAnisotropy?.() ?? 1);
  const mkMat = (opt) => { const m = new THREE.MeshLambertMaterial(opt); mats.push(m); return m; };
  const poly = (m, f, u) => { m.polygonOffset = true; m.polygonOffsetFactor = f; m.polygonOffsetUnits = u; return m; };
  const add = (geo, mat, o = {}) => { const m = new THREE.Mesh(geo, mat); m.receiveShadow = !!o.recv; m.castShadow = !!o.cast; group.add(m); return m; };
  add(fills.build(), poly(mkMat({ vertexColors: true }), 0, 0), { recv: true });
  add(inner.build(), poly(mkMat({ vertexColors: true }), -1, -1), { recv: true });
  add(asphalt.build(), poly(mkMat({ vertexColors: true }), -1, -2), { recv: true });
  add(marks.build(), poly(mkMat({ vertexColors: true }), -1, -4), { recv: true });
  add(solid.build(), mkMat({ vertexColors: true, side: THREE.DoubleSide }), { recv: true, cast: true });
  const winMats = [];
  let seed = 11;
  for (const k of ['glass', 'deco', 'house', 'industrial']) {
    if (!fac[k].n) continue;
    const t = makeFacade(k, seed++, aniso);
    const m = mkMat({ vertexColors: true, map: t.map, emissiveMap: t.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0 });
    winMats.push(m); add(fac[k].build(), m, { recv: true, cast: true });
  }
  const billMat = new THREE.MeshBasicMaterial({ map: makeSignAtlas(), vertexColors: true }); add(bill.build(), billMat);
  const foamMesh = new THREE.Mesh(foamB.build(), null); // material assigned after sky
  group.add(foamMesh);

  // instanced props
  const dummy = new THREE.Object3D();
  const palmB = new Batch();
  {
    const trunk = C(0x8a6a48), ring = [[0, 0], [0.12, 3.2], [0.5, 6.5]], rad = [0.28, 0.22, 0.15];
    for (let s = 0; s < 2; s++) for (let k = 0; k < 6; k++) {
      const a0 = k / 6 * Math.PI * 2, a1 = (k + 1) / 6 * Math.PI * 2;
      const p = (lv, a) => [ring[lv][0] + Math.cos(a) * rad[lv], ring[lv][1], Math.sin(a) * rad[lv]];
      const am = (a0 + a1) / 2;
      palmB.face([p(s, a0), p(s, a1), p(s + 1, a1), p(s + 1, a0)], [Math.cos(am), 0, Math.sin(am)], shade(trunk, 0.9 + 0.2 * s));
    }
    const g1 = C(0x2f8a3a), g2 = C(0x4aa84a);
    for (let f = 0; f < 9; f++) {
      const th = f / 9 * Math.PI * 2 + 0.3, cx = Math.cos(th), cz = Math.sin(th), px = -cz, pz = cx, col = f % 2 ? g1 : g2;
      const pt = (l, y, w) => [[0.5 + cx * l - px * w, 6.5 + y, cz * l - pz * w], [0.5 + cx * l + px * w, 6.5 + y, cz * l + pz * w]];
      const rows = [pt(0.2, 0.1, 0.1), pt(1.6, 0.6, 0.55), pt(3.0, 0.1, 0.7), pt(4.0, -1.2, 0.05)];
      for (let r = 0; r < 3; r++) palmB.face([rows[r][0], rows[r][1], rows[r + 1][1], rows[r + 1][0]], [0, 1, 0], col);
    }
  }
  const treeB = new Batch();
  {
    treeB.box(-0.2, 0, -0.2, 0.2, 2.4, 0.2, C(0x7a5a3a), false);
    const ico = new THREE.IcosahedronGeometry(1, 0);
    treeB.addGeometry(ico, new THREE.Matrix4().compose(new THREE.Vector3(0, 3.5, 0), new THREE.Quaternion(), new THREE.Vector3(1.9, 1.6, 1.9)), C(0x3f9a4a));
    treeB.addGeometry(ico, new THREE.Matrix4().compose(new THREE.Vector3(0.6, 4.7, 0.3), new THREE.Quaternion(), new THREE.Vector3(1.3, 1.1, 1.3)), C(0x56b255));
  }
  const lampB = new Batch();
  lampB.box(-0.07, 0, -0.07, 0.07, 6.2, 0.07, C(0x4a4e58)); lampB.box(0, 6.1, -0.05, 1.6, 6.25, 0.05, C(0x4a4e58));
  const lampHeadB = new Batch(); lampHeadB.box(1.2, 5.95, -0.18, 1.8, 6.1, 0.18, C(0xffffff));
  const benchB = new Batch();
  benchB.box(-0.9, 0.4, -0.25, 0.9, 0.48, 0.25, C(0xa8672f)); benchB.box(-0.9, 0.48, -0.28, 0.9, 0.95, -0.2, C(0xa8672f));
  benchB.box(-0.8, 0, -0.2, -0.7, 0.4, 0.2, C(0x3a3d45)); benchB.box(0.7, 0, -0.2, 0.8, 0.4, 0.2, C(0x3a3d45));
  const inst = (geo, mat, list, place, o = {}) => {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)); m.count = list.length;
    list.forEach((p, k) => { place(p); dummy.updateMatrix(); m.setMatrixAt(k, dummy.matrix); });
    m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; m.castShadow = !!o.cast; group.add(m); return m;
  };
  const resetD = () => { dummy.position.set(0, 0, 0); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); };
  const palmMat = mkMat({ vertexColors: true, side: THREE.DoubleSide });
  inst(palmB.build(), palmMat, placed.palms, (p) => { resetD(); dummy.position.set(p.x, 0, p.z); dummy.rotation.y = (p.x * 7.3 + p.z * 3.1) % 6.28; dummy.scale.setScalar(p.s); });
  inst(treeB.build(), mkMat({ vertexColors: true }), placed.trees, (p) => { resetD(); dummy.position.set(p.x, 0, p.z); dummy.rotation.y = (p.x + p.z) % 6.28; dummy.scale.setScalar(p.s); });
  const lampPlace = (p) => { resetD(); dummy.position.set(p.x, 0, p.z); dummy.rotation.y = Math.atan2(-p.dz, p.dx); };
  inst(lampB.build(), mkMat({ vertexColors: true }), placed.lamps, lampPlace);
  const lampHeadMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xcfd2d8 });
  inst(lampHeadB.build(), lampHeadMat, placed.lamps, lampPlace);
  const glowMat = new THREE.MeshBasicMaterial({ map: makeGlow(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: true });
  const glowGeo = new THREE.PlaneGeometry(13, 13); glowGeo.rotateX(-Math.PI / 2);
  inst(glowGeo, glowMat, placed.lamps, (p) => { resetD(); dummy.position.set(p.x + p.dx * 1.5, 0.05, p.z + p.dz * 1.5); });
  inst(benchB.build(), mkMat({ vertexColors: true }), placed.benches, (p) => { resetD(); dummy.position.set(p.x, 0, p.z); dummy.rotation.y = p.h; });

  // ocean geometry + sky
  const waterGeo = new THREE.PlaneGeometry(2000, 3000); waterGeo.rotateX(-Math.PI / 2); waterGeo.translate(1500, -0.02, 0);
  const base = createSky(game, (e) => {
    for (const m of winMats) m.emissiveIntensity = e.windowI;
    lampHeadMat.color.setRGB(0.8 + e.lampOn * 0.2, 0.82 + e.lampOn * 0.1, 0.85 - e.lampOn * 0.2).multiplyScalar(1 + e.lampOn * 2.5);
    glowMat.opacity = e.lampOn * 0.6;
  }, waterGeo);
  foamMesh.material = base.foam; foamMesh.renderOrder = 1;
  game.events.on('settings:changed', () => { for (const m of mats) m.needsUpdate = true; });

  // ---------- spatial grid ----------
  const GC = 20, GO = -640, GN = 64, NC = colliders.length;
  const cMinX = new Float32Array(NC), cMaxX = new Float32Array(NC), cMinZ = new Float32Array(NC), cMaxZ = new Float32Array(NC), cH = new Float32Array(NC);
  const counts = new Int32Array(GN * GN + 1);
  const gi = (v) => clamp(Math.floor((v - GO) / GC), 0, GN - 1);
  colliders.forEach((c, k) => {
    cMinX[k] = c.minX; cMaxX[k] = c.maxX; cMinZ[k] = c.minZ; cMaxZ[k] = c.maxZ; cH[k] = c.height;
    for (let z = gi(c.minZ); z <= gi(c.maxZ); z++) for (let x = gi(c.minX); x <= gi(c.maxX); x++) counts[z * GN + x + 1]++;
  });
  for (let k = 0; k < GN * GN; k++) counts[k + 1] += counts[k];
  const start = counts.slice(), fillPos = counts.slice(), items = new Int32Array(counts[GN * GN]);
  colliders.forEach((c, k) => { for (let z = gi(c.minZ); z <= gi(c.maxZ); z++) for (let x = gi(c.minX); x <= gi(c.maxX); x++) items[fillPos[z * GN + x]++] = k; });
  const stamp = new Int32Array(NC); let rayId = 0;

  function collideCircle(x, z, r, out) {
    if (!out) out = { x: 0, z: 0, hit: false, nx: 0, nz: 0 };
    let hit = false, nx = 0, nz = 0;
    for (let pass = 0; pass < 2; pass++) {
      let moved = false;
      const lim = HALF - r;
      if (x < -lim) { x = -lim; nx += 1; moved = true; } else if (x > lim) { x = lim; nx -= 1; moved = true; }
      if (z < -lim) { z = -lim; nz += 1; moved = true; } else if (z > lim) { z = lim; nz -= 1; moved = true; }
      const sh = shoreAt(z);
      if (x > sh - r) {
        const dzp = Math.abs(z - PIER.z);
        if (dzp <= PIER.hw - r + 1e-4) { if (x > PIER.x1 - r) { x = PIER.x1 - r; nx -= 1; moved = true; } }
        else if (x > sh + 1 && dzp <= PIER.hw + 2 && x <= PIER.x1) { z = z > PIER.z ? PIER.z + PIER.hw - r : PIER.z - PIER.hw + r; nz += z > PIER.z ? -1 : 1; moved = true; }
        else { x = sh - r; nx -= 1; moved = true; }
      }
      const gx0 = gi(x - r), gx1 = gi(x + r), gz0 = gi(z - r), gz1 = gi(z + r);
      for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
        const cell = gz * GN + gx;
        for (let k = start[cell], e = start[cell + 1]; k < e; k++) {
          const id = items[k];
          const px = x < cMinX[id] ? cMinX[id] : x > cMaxX[id] ? cMaxX[id] : x, pz = z < cMinZ[id] ? cMinZ[id] : z > cMaxZ[id] ? cMaxZ[id] : z;
          const dx = x - px, dz = z - pz, d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          if (d2 > 1e-10) { const d = Math.sqrt(d2), p = (r - d) / d; x += dx * p; z += dz * p; nx += dx / d; nz += dz / d; }
          else {
            const l = x - cMinX[id], rt = cMaxX[id] - x, b = z - cMinZ[id], t = cMaxZ[id] - z, m = Math.min(l, rt, b, t);
            if (m === l) { x = cMinX[id] - r; nx -= 1; } else if (m === rt) { x = cMaxX[id] + r; nx += 1; } else if (m === b) { z = cMinZ[id] - r; nz -= 1; } else { z = cMaxZ[id] + r; nz += 1; }
          }
          moved = true;
        }
      }
      if (moved) hit = true; else break;
    }
    out.x = x; out.z = z; out.hit = hit;
    const l = Math.hypot(nx, nz); out.nx = l > 0 ? nx / l : 0; out.nz = l > 0 ? nz / l : 0;
    return out;
  }

  function raycast(ox, oy, oz, dx, dy, dz, max, out) {
    rayId++;
    let best = max, bnx = 0, bny = 0, bnz = 0, found = false;
    if (dy < -1e-9) { const t = -oy / dy; if (t >= 0 && t < best) { best = t; bnx = 0; bny = 1; bnz = 0; found = true; } }
    // DDA over XZ cells
    let cx = Math.floor((ox - GO) / GC), cz = Math.floor((oz - GO) / GC);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(GC / dx) : Infinity, tdz = dz !== 0 ? Math.abs(GC / dz) : Infinity;
    let tmx = dx !== 0 ? ((dx > 0 ? (cx + 1) * GC + GO - ox : cx * GC + GO - ox) / dx) : Infinity;
    let tmz = dz !== 0 ? ((dz > 0 ? (cz + 1) * GC + GO - oz : cz * GC + GO - oz) / dz) : Infinity;
    for (let guard = 0; guard < 200; guard++) {
      if (cx >= 0 && cx < GN && cz >= 0 && cz < GN) {
        const cell = cz * GN + cx;
        for (let k = start[cell], e = start[cell + 1]; k < e; k++) {
          const id = items[k]; if (stamp[id] === rayId) continue; stamp[id] = rayId;
          let t0 = -Infinity, t1 = best, nxx = 0, nyy = 0, nzz = 0, ok = true;
          // X slab
          if (dx !== 0) {
            let a = (cMinX[id] - ox) / dx, b = (cMaxX[id] - ox) / dx; if (a > b) { const s = a; a = b; b = s; }
            if (a > t0) { t0 = a; nxx = dx > 0 ? -1 : 1; nyy = 0; nzz = 0; } if (b < t1) t1 = b;
          } else if (ox < cMinX[id] || ox > cMaxX[id]) ok = false;
          if (ok) {
            if (dz !== 0) {
              let a = (cMinZ[id] - oz) / dz, b = (cMaxZ[id] - oz) / dz; if (a > b) { const s = a; a = b; b = s; }
              if (a > t0) { t0 = a; nxx = 0; nyy = 0; nzz = dz > 0 ? -1 : 1; } if (b < t1) t1 = b;
            } else if (oz < cMinZ[id] || oz > cMaxZ[id]) ok = false;
          }
          if (ok) {
            if (dy !== 0) {
              let a = (0 - oy) / dy, b = (cH[id] - oy) / dy; if (a > b) { const s = a; a = b; b = s; }
              if (a > t0) { t0 = a; nxx = 0; nzz = 0; nyy = dy > 0 ? -1 : 1; } if (b < t1) t1 = b;
            } else if (oy < 0 || oy > cH[id]) ok = false;
          }
          if (ok && t0 <= t1 && t0 >= 0 && t0 < best) { best = t0; bnx = nxx; bny = nyy; bnz = nzz; found = true; }
        }
      }
      if (Math.min(tmx, tmz) > best) break;
      if (tmx < tmz) { cx += stepX; tmx += tdx; } else { cz += stepZ; tmz += tdz; }
      if (cx < -1 || cx > GN || cz < -1 || cz > GN) break;
    }
    if (!found) return null;
    const r = out || {};
    r.dist = best; r.x = ox + dx * best; r.y = oy + dy * best; r.z = oz + dz * best; r.nx = bnx; r.ny = bny; r.nz = bnz;
    return r;
  }

  // ---------- queries ----------
  const lmMap = new Map(landmarks.map((l) => [l.id, l]));
  const roads = roadsApi;
  const isWater = (x, z) => {
    if (x <= 505 || x <= shoreAt(z)) return false;
    return !(Math.abs(z - PIER.z) <= PIER.hw && x >= PIER.x0 && x <= PIER.x1);
  };
  const lp = { x: 0, z: 0, heading: 0 };
  function randomSidewalkPoint(nx, nz, minD, maxD) {
    for (let k = 0; k < 40; k++) {
      const a = nodes[Math.floor(Math.random() * nodes.length)];
      if (!a.links.length) continue;
      const b = nodes[a.links[Math.floor(Math.random() * a.links.length)]];
      const L = Math.hypot(b.x - a.x, b.z - a.z), dx = (b.x - a.x) / L, dz = (b.z - a.z) / L, t = 14 + Math.random() * (L - 28), s = Math.random() < 0.5 ? -1 : 1;
      const x = a.x + dx * t + -dz * s * SIDEWALK, z = a.z + dz * t + dx * s * SIDEWALK;
      const d = Math.hypot(x - nx, z - nz);
      if (d < minD || d > maxD || x > shoreAt(z) - 2 || Math.abs(x) > HALF - 2 || Math.abs(z) > HALF - 2) continue;
      return { x, z };
    }
    return null;
  }
  function randomRoadPoint(nx, nz, minD, maxD) {
    let fb = null;
    for (let k = 0; k < 40; k++) {
      const ang = Math.random() * Math.PI * 2, rad = minD + Math.random() * (maxD - minD);
      const a = roads.nearestNode(nx + Math.cos(ang) * rad, nz + Math.sin(ang) * rad);
      const b = nodes[a.links[Math.floor(Math.random() * a.links.length)]];
      const L = Math.hypot(b.x - a.x, b.z - a.z), t = clamp(((nx - a.x) * (b.x - a.x) + (nz - a.z) * (b.z - a.z)) / (L * L) + (Math.random() - 0.5) * 0.3, 14 / L, 1 - 14 / L);
      roads.lanePoint(a, b, t, lp);
      const r = { x: lp.x, z: lp.z, heading: lp.heading, node: a, next: b };
      const d = Math.hypot(r.x - nx, r.z - nz);
      if (d >= minD && d <= maxD) return r;
      fb = r;
    }
    return fb;
  }

  const world = {
    half: HALF, spawnPoint, colliders, roads, landmarks, group,
    getLandmark: (id) => lmMap.get(id) || null,
    collideCircle, raycast, isWater, isRoad: roads.isRoad, randomSidewalkPoint, randomRoadPoint,
    minimap: renderMinimap(G, cells, footprints),
    update(dt) { base.update(dt); },
  };
  return world;
}
