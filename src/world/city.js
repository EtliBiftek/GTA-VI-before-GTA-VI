// Neon Coast world: procedural city "Palmera". Contract: docs/ARCHITECTURE.md (World section).
import * as THREE from 'three';
import { seeded, clamp } from '../core/utils.js';
import { HALF, ROAD_HALF, LANE, SIDEWALK, SW_EDGE, LOT_MARGIN, COAST_X, shoreAt, PIER } from './layout.js';
import { Batch, C, shade } from './geo.js';
import { buildRoadGraph, makeRoadsApi, buildRoadMeshes } from './roads.js';
import {
  TIER, FACADE, SHOP, makeFacade, makeShopfront, makeSignAtlas, signUV, SIGN_ID, SIGN_AD, makeGlow, makePool, makeSignalTex,
  makeAsphalt, makePavers, makeGrass, makeSand, makePaintMask, makeTracks, makeDecals, decalUV, DECAL, makeRoofTiles, makeVeg,
} from './textures.js';
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

  const tier = TIER(game.settings.quality);
  const vr = seeded(777), rv = (a, b) => a + vr() * (b - a), vpick = (arr) => arr[Math.floor(vr() * arr.length)]; // decoration RNG (never touches the layout stream)
  const fills = new Batch(4), grassFar = new Batch(8), innerG = new Batch(8), innerP = new Batch(4), sandB = new Batch(6), asphalt = new Batch(16), marks = new Batch(3), solid = new Batch(), bill = new Batch();
  const tracksB = new Batch(), decalsB = new Batch(), roofB = new Batch(4), tilesB = new Batch(), glowB = new Batch(), furn = new Batch(), shopB = new Batch();
  const fac = { glass: new Batch(), deco: new Batch(), house: new Batch(), industrial: new Batch() };
  const colliders = [], footprints = [], landmarks = [], reserved = [];
  const props = { palms: [], trees: [], benches: [], lamps: [] };

  const addCollider = (minX, maxX, minZ, maxZ, height, fp) => {
    colliders.push({ minX, maxX, minZ, maxZ, height });
    if (fp) footprints.push({ minX, maxX, minZ, maxZ });
  };
  const addLandmark = (id, name, type, x, z) => { landmarks.push({ id, name, type, x, z }); reserved.push({ x, z, r: 4.5 }); };

  // ---------- ground ----------
  grassFar.rect(-2500, -2500, 2500, 2500, -0.3, C(0x86a866));
  buildRoadMeshes(G, asphalt, marks, { tracks: tracksB, decals: decalsB, rng: seeded(4242), decalUV, DECAL });
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
    sandB.face([[461, 0.01, z], [461, 0.01, z + 10], [s1 - 9, 0.01, z + 10], [s0 - 9, 0.01, z]], [0, 1, 0], L);
    sandB.face([[s0 - 9, 0.01, z], [s1 - 9, 0.01, z + 10], [s1, 0.01, z + 10], [s0, 0.01, z]], [0, 1, 0], [L, L, W, W]);
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
  function facadeBox(kind, x0, z0, x1, z1, y0, y1, col, shop = false) {
    const F = FACADE[kind], fb = fac[kind], uo = rand();
    const walls = [[[x0, z1], [x1, z1], [0, 0, 1]], [[x1, z0], [x0, z0], [0, 0, -1]], [[x1, z1], [x1, z0], [1, 0, 0]], [[x0, z0], [x0, z1], [-1, 0, 0]]];
    const shopCol = [0.55 + 0.45 * col[0], 0.55 + 0.45 * col[1], 0.55 + 0.45 * col[2]];
    for (const [a, b, n] of walls) {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), u0 = uo, u1 = uo + L / F.repW;
      let yb = y0;
      if (shop) {
        yb = Math.min(y1, y0 + SHOP.h);
        shopB.face([[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], yb, b[1]], [a[0], yb, a[1]]], n, shopCol, [[uo, 0], [uo + L / SHOP.repW, 0], [uo + L / SHOP.repW, 1], [uo, 1]]);
        if (yb >= y1) continue;
      }
      const v0 = yb / F.repH, v1 = y1 / F.repH;
      fb.face([[a[0], yb, a[1]], [b[0], yb, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]], n, col, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
    }
  }
  // ---- purely visual decoration helpers (use `vr`, add no colliders) ----
  const PARA = C(0xc9cacd), GREYS = [C(0xb9bec2), C(0xa9aeb3), C(0xcfd2d4)];
  function parapet(r, H, hgt = 0.55, col = PARA) {
    const t = 0.22;
    solid.box(r.minX, H, r.minZ, r.maxX, H + hgt, r.minZ + t, col); solid.box(r.minX, H, r.maxZ - t, r.maxX, H + hgt, r.maxZ, col);
    solid.box(r.minX, H, r.minZ + t, r.minX + t, H + hgt, r.maxZ - t, col); solid.box(r.maxX - t, H, r.minZ + t, r.maxX, H + hgt, r.maxZ - t, col);
  }
  function roofProps(r, H, n = 3, tank = true) {
    const w = r.maxX - r.minX, d = r.maxZ - r.minZ, cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2;
    if (w < 7 || d < 7) return;
    for (let k = 0; k < n; k++) {
      const x = rv(r.minX + 2.4, r.maxX - 2.4), z = rv(r.minZ + 2.4, r.maxZ - 2.4);
      if (Math.abs(x - cx) < 3.4 && Math.abs(z - cz) < 3.4) continue;
      const hx = rv(0.7, 1.1), hz = rv(0.5, 0.8), hy = rv(0.8, 1.3);
      solid.box(x - hx, H, z - hz, x + hx, H + hy, z + hz, vpick(GREYS)); solid.box(x - hx * 0.55, H + hy, z - hz * 0.7, x + hx * 0.55, H + hy + 0.08, z + hz * 0.7, C(0x34373c));
    }
    if (tank && vr() < 0.45) {
      const x = rv(r.minX + 3, r.maxX - 3), z = rv(r.minZ + 3, r.maxZ - 3);
      if (Math.abs(x - cx) > 3.6 || Math.abs(z - cz) > 3.6) {
        for (const [lx, lz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) solid.box(x + lx - 0.08, H, z + lz - 0.08, x + lx + 0.08, H + 1.1, z + lz + 0.08, C(0x4a4e55));
        solid.cyl(x, H + 1.1, z, 1.25, 1.25, 2.1, 10, C(vr() < 0.5 ? 0x7a5a40 : 0x8d98a2)); solid.cyl(x, H + 3.2, z, 1.3, 0.15, 0.5, 10, C(0x5a4632));
      }
    }
    if (vr() < 0.6) { const x = rv(r.minX + 1.5, r.maxX - 1.5), z = rv(r.minZ + 1.5, r.maxZ - 1.5), hh = rv(2.5, 5.5); solid.box(x - 0.04, H, z - 0.04, x + 0.04, H + hh, z + 0.04, C(0x555a62)); solid.box(x - 0.6, H + hh * 0.8, z - 0.03, x + 0.6, H + hh * 0.8 + 0.05, z + 0.03, C(0x555a62)); }
  }
  const AWN = [[C(0xd9482e), C(0xf4f0e6)], [C(0x2d7fb8), C(0xf4f0e6)], [C(0x2f8a5a), C(0xf4f0e6)], [C(0xe8b030), C(0xf4f0e6)], [C(0x7a2638), C(0xe8d8c0)]];
  const wallsOf = (r) => [[r.minX, r.maxZ, 1, 0, 0, 1, r.maxX - r.minX], [r.minX, r.minZ, 1, 0, 0, -1, r.maxX - r.minX], [r.maxX, r.minZ, 0, 1, 1, 0, r.maxZ - r.minZ], [r.minX, r.minZ, 0, 1, -1, 0, r.maxZ - r.minZ]]; // [ax, az, ux, uz, nx, nz, len]
  function awnings(r) { // striped sloped awnings over shopfronts, on every wall (some skipped)
    for (const [ax, az, ux, uz, nx, nz, len] of wallsOf(r)) {
      if (len < 8) continue;
      for (let seg = 0; seg < 2; seg++) {
        if (vr() < 0.45) continue;
        const w = rv(3, Math.min(6.2, len * 0.4)), t0 = rv(1.5, len - w - 1.5), pal = vpick(AWN), proj = 1.25, n = Math.floor(w / 0.6), ya = 3.35, yb = 2.8;
        const base = (t) => [ax + ux * t, az + uz * t];
        for (let k = 0; k < n; k++) {
          const a = base(t0 + k * 0.6), b = base(t0 + (k + 1) * 0.6), col = pal[k % 2];
          solid.face([[a[0], ya, a[1]], [b[0], ya, b[1]], [b[0] + nx * proj, yb, b[1] + nz * proj], [a[0] + nx * proj, yb, a[1] + nz * proj]], [nx, 1, nz], col);
          solid.face([[a[0] + nx * proj, yb, a[1] + nz * proj], [b[0] + nx * proj, yb, b[1] + nz * proj], [b[0] + nx * proj, yb - 0.28, b[1] + nz * proj], [a[0] + nx * proj, yb - 0.28, a[1] + nz * proj]], [nx, 0, nz], col);
        }
        const a = base(t0), b = base(t0 + n * 0.6);
        solid.face([[a[0], ya, a[1]], [a[0] + nx * proj, yb, a[1] + nz * proj], [a[0], yb, a[1]]], [-ux, 0, -uz], pal[0]);
        solid.face([[b[0], ya, b[1]], [b[0] + nx * proj, yb, b[1] + nz * proj], [b[0], yb, b[1]]], [ux, 0, uz], pal[0]);
      }
    }
  }
  const NEON = [C(0x4ff0ff), C(0xff4fd8), C(0xffd27a), C(0xb8ffcf), C(0xffffff)];
  function blades(r, H, prob = 0.4) { // projecting neon blade signs (two-sided) at street level
    for (const [ax, az, ux, uz, nx, nz, len] of wallsOf(r)) {
      if (len < 9 || vr() > prob) continue;
      const t = rv(2, len - 2), y0 = rv(4.3, Math.max(4.4, Math.min(6.5, H - 2.5)));
      const px = ax + ux * t, pz = az + uz * t, L = 1.4, sh = 1.3, id = Math.floor(rv(0, 31)), [u0, v0, u1, v1] = signUV(id);
      for (const sd of [-1, 1]) {
        const ox = ux * 0.06 * sd, oz = uz * 0.06 * sd;
        bill.face([[px + ox, y0, pz + oz], [px + ox + nx * L, y0, pz + oz + nz * L], [px + ox + nx * L, y0 + sh, pz + oz + nz * L], [px + ox, y0 + sh, pz + oz]], [ux * sd, 0, uz * sd], [1, 1, 1], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
      }
      solid.box(Math.min(px, px + nx * L) - 0.05, y0 + sh - 0.04, Math.min(pz, pz + nz * L) - 0.05, Math.max(px, px + nx * L) + 0.05, y0 + sh + 0.04, Math.max(pz, pz + nz * L) + 0.05, C(0x30333a));
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
  function tileGable(x0, z0, x1, z1, y, rise, col, alongX, wall) { // roof with tile-texture UVs, plaster gable ends
    const xm = (x0 + x1) / 2, zm = (z0 + z1) / 2, k = 1 / 1.8;
    if (alongX) {
      const sl = Math.hypot(zm - z0, rise) * k;
      tilesB.face([[x0, y, z0], [x1, y, z0], [x1, y + rise, zm], [x0, y + rise, zm]], [0, 1, -1], col, [[x0 * k, 0], [x1 * k, 0], [x1 * k, sl], [x0 * k, sl]]);
      tilesB.face([[x1, y, z1], [x0, y, z1], [x0, y + rise, zm], [x1, y + rise, zm]], [0, 1, 1], shade(col, 0.88), [[x1 * k, 0], [x0 * k, 0], [x0 * k, sl], [x1 * k, sl]]);
      solid.face([[x0 + 0.4, y, z1 - 0.4], [x0 + 0.4, y, z0 + 0.4], [x0 + 0.4, y + rise * 0.84, zm]], [-1, 0, 0], wall);
      solid.face([[x1 - 0.4, y, z0 + 0.4], [x1 - 0.4, y, z1 - 0.4], [x1 - 0.4, y + rise * 0.84, zm]], [1, 0, 0], wall);
    } else {
      const sl = Math.hypot(xm - x0, rise) * k;
      tilesB.face([[x0, y, z0], [x0, y, z1], [xm, y + rise, z1], [xm, y + rise, z0]], [-1, 1, 0], col, [[z0 * k, 0], [z1 * k, 0], [z1 * k, sl], [z0 * k, sl]]);
      tilesB.face([[x1, y, z1], [x1, y, z0], [xm, y + rise, z0], [xm, y + rise, z1]], [1, 1, 0], shade(col, 0.88), [[z1 * k, 0], [z0 * k, 0], [z0 * k, sl], [z1 * k, sl]]);
      solid.face([[x1 - 0.4, y, z0 + 0.4], [x0 + 0.4, y, z0 + 0.4], [xm, y + rise * 0.84, z0 + 0.4]], [0, 0, -1], wall);
      solid.face([[x0 + 0.4, y, z1 - 0.4], [x1 - 0.4, y, z1 - 0.4], [xm, y + rise * 0.84, z1 - 0.4]], [0, 0, 1], wall);
    }
  }
  const BUSH = [C(0x2f7a3a), C(0x3f9a4a), C(0x56a850), C(0x2a6a3a)];
  const leafCol = (base) => (x, y, z) => { const j = 0.88 + 0.24 * Math.abs(Math.sin(x * 9.1 + y * 5.3 + z * 7.7)), l = 0.8 + 0.3 * (y * 0.5 + 0.5); return [base[0] * j * l, base[1] * j * l, base[2] * j * l]; };
  function bush(x, z, r) { furn.blob(x, r * 0.7, z, r, r * 0.8, r, leafCol(vpick(BUSH)), tier > 0 ? 1 : 0); }
  function house(rect, hh, col, roof, f) {
    const x0 = rect.minX, x1 = rect.maxX, z0 = rect.minZ, z1 = rect.maxZ, floors = Math.max(1, Math.round(hh / 3));
    const H = floors * 3;
    facadeBox('house', x0, z0, x1, z1, 0, H, col);
    tileGable(x0 - 0.4, z0 - 0.4, x1 + 0.4, z1 + 0.4, H, 2.4, roof, (x1 - x0) >= (z1 - z0), col);
    // plinth, chimney, hedges
    solid.box(x0 - 0.06, 0, z0 - 0.06, x1 + 0.06, 0.35, z1 + 0.06, C(0xbdb7ab));
    const cxh = rv(x0 + 1, x1 - 1), czh = rv(z0 + 1, z1 - 1); solid.box(cxh - 0.4, H, czh - 0.4, cxh + 0.4, H + 3.0, czh + 0.4, C(0xa86a52)); solid.box(cxh - 0.5, H + 3.0, czh - 0.5, cxh + 0.5, H + 3.15, czh + 0.5, C(0x6a6a70));
    for (const [bx, bz] of [[x0 - 0.7, z0 - 0.7], [x1 + 0.7, z0 - 0.7], [x0 - 0.7, z1 + 0.7], [x1 + 0.7, z1 + 0.7]]) if (vr() < 0.45) bush(bx, bz, rv(0.5, 0.85));
    addCollider(x0, x1, z0, z1, H + 2.4, true); return H;
  }
  function mid(rect, hh, col, kind = 'deco') {
    const F = FACADE[kind], H = Math.max(1, Math.round(hh / F.floor)) * F.floor;
    facadeBox(kind, rect.minX, rect.minZ, rect.maxX, rect.maxZ, 0, H, col, kind === 'deco');
    roofB.rect(rect.minX, rect.minZ, rect.maxX, rect.maxZ, H, C(0x8d8f96));
    const cx = (rect.minX + rect.maxX) / 2, cz = (rect.minZ + rect.maxZ) / 2;
    solid.box(cx - 2, H, cz - 2, cx + 2, H + 1.6, cz + 2, C(0x777a82));
    parapet(rect, H); roofProps(rect, H, 2 + Math.floor(vr() * 3));
    if (kind === 'deco') { awnings(rect); blades(rect, H, 0.45); }
    solid.box(rect.minX - 0.05, 0, rect.minZ - 0.05, rect.maxX + 0.05, 0.3, rect.maxZ + 0.05, C(0x5d5f66)); // plinth
    addCollider(rect.minX, rect.maxX, rect.minZ, rect.maxZ, H + 1.6, true); return H;
  }
  function tower(rect, hh, col) {
    const F = FACADE.glass, hp = rr(2, 4) * F.floor, H = Math.round(hh / F.floor) * F.floor;
    facadeBox('glass', rect.minX, rect.minZ, rect.maxX, rect.maxZ, 0, hp, shade(col, 1.1), true);
    roofB.rect(rect.minX, rect.minZ, rect.maxX, rect.maxZ, hp, C(0x6f7380));
    addCollider(rect.minX, rect.maxX, rect.minZ, rect.maxZ, hp, true);
    const w = rect.maxX - rect.minX, d = rect.maxZ - rect.minZ, ix = w * rr(0.12, 0.2), iz = d * rr(0.12, 0.2);
    const s = { minX: rect.minX + ix, maxX: rect.maxX - ix, minZ: rect.minZ + iz, maxZ: rect.maxZ - iz };
    facadeBox('glass', s.minX, s.minZ, s.maxX, s.maxZ, hp, H, col);
    roofB.rect(s.minX, s.minZ, s.maxX, s.maxZ, H, C(0x5d6170));
    addCollider(s.minX, s.maxX, s.minZ, s.maxZ, H);
    const cx = (s.minX + s.maxX) / 2, cz = (s.minZ + s.maxZ) / 2;
    if (rand() < 0.6) { facadeBox('glass', cx - 4, cz - 4, cx + 4, cz + 4, H, H + 8, col); roofB.rect(cx - 4, cz - 4, cx + 4, cz + 4, H + 8, C(0x5d6170)); }
    solid.box(cx - 0.3, H + 8, cz - 0.3, cx + 0.3, H + 24, cz + 0.3, C(0xcc2a3a));
    // visual dressing: podium canopy + plinth, corner piers, parapets, rooftop plant, crown light band, beacon
    const PIER_C = C(0xcfd3d8);
    solid.box(rect.minX - 1.5, 4.2, rect.minZ - 1.5, rect.maxX + 1.5, 4.45, rect.minZ + 0.2, PIER_C); solid.box(rect.minX - 1.5, 4.2, rect.maxZ - 0.2, rect.maxX + 1.5, 4.45, rect.maxZ + 1.5, PIER_C);
    solid.box(rect.minX - 1.5, 4.2, rect.minZ + 0.2, rect.minX + 0.2, 4.45, rect.maxZ - 0.2, PIER_C); solid.box(rect.maxX - 0.2, 4.2, rect.minZ + 0.2, rect.maxX + 1.5, 4.45, rect.maxZ - 0.2, PIER_C);
    const lg = C(0xffe2b0);
    glowB.box(rect.minX - 1.5, 4.18, rect.minZ - 1.5, rect.maxX + 1.5, 4.2, rect.minZ - 1.44, lg); glowB.box(rect.minX - 1.5, 4.18, rect.maxZ + 1.44, rect.maxX + 1.5, 4.2, rect.maxZ + 1.5, lg);
    glowB.box(rect.minX - 1.5, 4.18, rect.minZ - 1.44, rect.minX - 1.44, 4.2, rect.maxZ + 1.44, lg); glowB.box(rect.maxX + 1.44, 4.18, rect.minZ - 1.44, rect.maxX + 1.5, 4.2, rect.maxZ + 1.44, lg);
    solid.box(rect.minX - 0.1, 0, rect.minZ - 0.1, rect.maxX + 0.1, 0.45, rect.maxZ + 0.1, C(0x6a6d75));
    parapet(rect, hp, 0.5, C(0xaab0b8)); roofProps(rect, hp, 3, false);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) solid.box(sx < 0 ? s.minX - 0.12 : s.maxX - 0.6, hp, sz < 0 ? s.minZ - 0.12 : s.maxZ - 0.6, sx < 0 ? s.minX + 0.6 : s.maxX + 0.12, H, sz < 0 ? s.minZ + 0.6 : s.maxZ + 0.12, PIER_C);
    parapet(s, H, 0.7, C(0xb5bbc4));
    const nc = vpick(NEON); glowB.box(s.minX - 0.07, H - 1.6, s.minZ - 0.07, s.maxX + 0.07, H - 1.25, s.maxZ + 0.07, nc);
    if (vr() < 0.6) glowB.box(s.minX - 0.07, H * 0.55, s.minZ - 0.07, s.maxX + 0.07, H * 0.55 + 0.25, s.maxZ + 0.07, nc);
    solid.box(cx - 0.45, H, cz - 0.45, cx + 0.45, H + 2.4, cz + 0.45, C(0x888d96)); roofProps(s, H, 3, false);
    glowB.box(cx - 0.45, H + 23.4, cz - 0.45, cx + 0.45, H + 24.4, cz + 0.45, C(0xff2a1a));
    solid.box(cx - 0.9, H + 20, cz - 0.05, cx + 0.9, H + 20.15, cz + 0.05, C(0x777c84));
    return H;
  }
  function warehouse(rect, hh, col) {
    const F = FACADE.industrial, H = Math.max(1, Math.round(hh / F.floor)) * F.floor;
    facadeBox('industrial', rect.minX, rect.minZ, rect.maxX, rect.maxZ, 0, H, col);
    roofB.rect(rect.minX, rect.minZ, rect.maxX, rect.maxZ, H, C(0x80868c));
    parapet(rect, H, 0.4, C(0x9aa0a6));
    for (let k = 0; k < 4; k++) { const x = rv(rect.minX + 3, rect.maxX - 3), z = rv(rect.minZ + 3, rect.maxZ - 3); if (k < 2) solid.box(x - 1.5, H, z - 1, x + 1.5, H + 0.5, z + 1, C(0x9fc4d8)); else solid.cyl(x, H, z, 0.5, 0.5, 1.4, 8, C(0x9aa0a6)); }
    solid.box(rect.minX - 0.05, 0, rect.minZ - 0.05, rect.maxX + 0.05, 0.4, rect.maxZ + 0.05, C(0x6e7279));
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
    if (c.type !== 'stadium') (c.type === 'park' || c.type === 'residential' ? innerG : innerP).rect(ix0, iz0, ix1, iz1, 0.015, C(CITY_FILL[c.type] || 0x9b9a98));
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
    { // mown pitch: alternating stripes (no overlaps)
      const x0p = cx - ax + T + 1, x1p = cx + ax - T - 1, z0p = cz - az + T + 1, z1p = cz + az - T - 1, ns = 10, dz = (z1p - z0p) / ns;
      for (let k = 0; k < ns; k++) innerG.rect(x0p, z0p + k * dz, x1p, z0p + (k + 1) * dz, 0.015, C(k % 2 ? 0x3fae4a : 0x36a042));
    }
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
  const nodeSgn = new Map();
  for (const n of nodes) {
    const sgn = rand() < 0.5 ? 1 : -1; nodeSgn.set(n.id, sgn);
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

  // ---------- visual-only street furniture, bushes, flower beds, traffic signals (own RNG, no colliders) ----------
  const clearOf = (x, z, r) => {
    for (const q of placed.palms) if (Math.hypot(q.x - x, q.z - z) < r + 0.5) return false;
    for (const q of placed.trees) if (Math.hypot(q.x - x, q.z - z) < r + 0.8) return false;
    for (const q of placed.benches) if (Math.hypot(q.x - x, q.z - z) < r + 1) return false;
    for (const q of placed.lamps) if (Math.hypot(q.x - x, q.z - z) < r + 0.4) return false;
    return true;
  };
  const HYD = C(0xc8321e), BINC = C(0x2f5a46), METERC = C(0x3a4a55), STEEL = C(0x70767e), DARK = C(0x2a2d33), WOOD = C(0xa8672f);
  const hydrant = (x, z) => {
    furn.cyl(x, 0, z, 0.14, 0.11, 0.62, 8, HYD); furn.cyl(x, 0.62, z, 0.15, 0.15, 0.07, 8, HYD); furn.blob(x, 0.76, z, 0.11, 0.09, 0.11, HYD, 0);
    furn.box(x - 0.23, 0.36, z - 0.05, x + 0.23, 0.46, z + 0.05, HYD); furn.box(x - 0.1, 0.0, z - 0.1, x + 0.1, 0.05, z + 0.1, C(0x333));
  };
  const meter = (x, z) => { furn.box(x - 0.03, 0, z - 0.03, x + 0.03, 1.05, z + 0.03, STEEL); furn.box(x - 0.1, 1.05, z - 0.07, x + 0.1, 1.33, z + 0.07, METERC); furn.box(x - 0.07, 1.17, z - 0.073, x + 0.07, 1.27, z + 0.073, C(0x9fd8e8)); };
  const bin = (x, z) => { furn.cyl(x, 0, z, 0.27, 0.3, 0.85, 10, BINC); furn.cyl(x, 0.85, z, 0.33, 0.33, 0.07, 10, C(0x24302a)); furn.box(x - 0.03, 0.4, z - 0.31, x + 0.03, 0.7, z - 0.28, C(0xe8e8e0)); };
  function busStop(x, z, nx, nz) { // (nx,nz) = unit axis normal pointing to the road
    const ax = -nz, az = nx, bx = (a, d) => x + ax * a + nx * d, bz = (a, d) => z + az * a + nz * d;
    const lbox = (a0, a1, d0, d1, y0, y1, col) => { const xa = bx(a0, d0), xb = bx(a1, d1), za = bz(a0, d0), zb = bz(a1, d1); furn.box(Math.min(xa, xb), y0, Math.min(za, zb), Math.max(xa, xb), y1, Math.max(za, zb), col); };
    lbox(-1.7, 1.7, -0.75, 0.75, 2.4, 2.5, C(0x2b3b4c)); lbox(-1.7, 1.7, -0.75, -0.7, 2.5, 2.62, C(0x2b3b4c));
    for (const a of [-1.62, 1.62]) for (const d of [-0.68, 0.68]) lbox(a - 0.04, a + 0.04, d - 0.04, d + 0.04, 0, 2.4, STEEL);
    lbox(-1.6, 1.6, -0.69, -0.65, 0.35, 2.4, C(0x86b4cf)); lbox(-1.0, 1.0, -0.6, -0.15, 0.42, 0.48, WOOD); lbox(-1.0, 1.0, -0.6, -0.55, 0.48, 0.85, WOOD);
    lbox(1.62, 1.74, -0.6, 0.5, 0.25, 2.2, DARK);
    const [u0, v0, u1, v1] = signUV(Math.floor(rv(SIGN_AD.extraFirst, SIGN_AD.extraFirst + SIGN_AD.extraCount)));
    const fx = bx(1.76, 0) , fz = bz(1.76, 0);
    bill.face([[bx(1.76, -0.55), 0.35, bz(1.76, -0.55)], [bx(1.76, 0.45), 0.35, bz(1.76, 0.45)], [bx(1.76, 0.45), 2.1, bz(1.76, 0.45)], [bx(1.76, -0.55), 2.1, bz(1.76, -0.55)]], [ax, 0, az], [1, 1, 1], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
    void fx; void fz;
  }
  const trafficPoles = [];
  for (const { a, b, av } of linkList) {
    const dx = Math.sign(b.x - a.x), dz = Math.sign(b.z - a.z), L = Math.hypot(b.x - a.x, b.z - a.z), px = -dz, pz = dx;
    const at = (t, off, s) => [a.x + dx * t + px * s * off, a.z + dz * t + pz * s * off];
    if (L < 60) continue;
    if (vr() < (av ? 0.5 : 0.3)) { const s = vr() < 0.5 ? -1 : 1, [x, z] = at(rv(20, L - 20), 7.7, s); if (clearOf(x, z, 0.4)) hydrant(x, z); }
    for (let k = Math.floor(vr() * 3); k > 0; k--) { const s = vr() < 0.5 ? -1 : 1, [x, z] = at(rv(18, L - 18), 7.65, s); if (clearOf(x, z, 0.5)) bin(x, z); }
    if (vr() < 0.3) { const s = vr() < 0.5 ? -1 : 1, t0 = rv(20, L - 50); for (let k = 0; k < 4; k++) { const [x, z] = at(t0 + k * 7.6, 7.55, s); if (clearOf(x, z, 0.3)) meter(x, z); } }
    if (vr() < (av ? 0.3 : 0.2)) { const s = vr() < 0.5 ? -1 : 1, [x, z] = at(rv(24, L - 24), 8.95, s); if (clearOf(x, z, 1.9)) busStop(x, z, -px * s, -pz * s); }
  }
  // flower beds + shrubs in the parks and around the plaza
  const FLOWERS = [C(0xff5d8f), C(0xffd23a), C(0xff7a3d), C(0xf8f8f0), C(0xb06af0), C(0xff3a4a)];
  for (const c of parks) {
    const I = c.inner;
    for (let k = 0, n = 0; k < 40 && n < 5; k++) {
      const x = rv(I.minX + 6, I.maxX - 6), z = rv(I.minZ + 6, I.maxZ - 6);
      if (!clearOf(x, z, 3) || reserved.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + 3)) continue;
      n++;
      furn.blob(x, 0.0, z, 1.6, 0.4, 1.3, leafCol(C(0x3f8a45)), 1, vr() * 3);
      const col1 = vpick(FLOWERS), col2 = vpick(FLOWERS);
      for (let f = 0; f < 22; f++) { const ang = vr() * 6.28, rr_ = Math.sqrt(vr()) * 1.2; furn.blob(x + Math.cos(ang) * rr_, 0.34 + (1 - rr_ / 1.5) * 0.15, z + Math.sin(ang) * rr_ * 0.8, 0.15, 0.13, 0.15, f % 3 ? col1 : col2, 0); }
    }
    for (let k = 0; k < 14; k++) { const x = rv(I.minX + 3, I.maxX - 3), z = rv(I.minZ + 3, I.maxZ - 3); if (clearOf(x, z, 1.2) && !reserved.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + 1.5)) bush(x, z, rv(0.6, 1.1)); }
  }
  if (spec.plaza) {
    const c = spec.plaza, cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
    for (let a = 0; a < 12; a++) { const ang = a * Math.PI / 6 + 0.26, x = cx + Math.cos(ang) * 8, z = cz + Math.sin(ang) * 8; furn.box(x - 0.6, 0, z - 0.6, x + 0.6, 0.5, z + 0.6, C(0xd9d4c8)); bush(x, z, 0.5); }
    for (let k = 0; k < 4; k++) { const ang = k * Math.PI / 2, x = cx + Math.cos(ang) * 4.6, z = cz + Math.sin(ang) * 4.6; glowB.box(x - 0.1, 0.01, z - 0.1, x + 0.1, 0.5, z + 0.1, C(k % 2 ? 0xff6ad5 : 0x7ff0ff)); }
    glowB.box(cx - 2.06, 6.8, cz - 2.06, cx + 2.06, 7.1, cz + 2.06, C(0x7ff0ff)); glowB.box(cx - 2.06, 4.2, cz - 2.06, cx + 2.06, 4.5, cz + 2.06, C(0xff6ad5));
  }
  // traffic signal poles on the two free corners of every real junction
  for (const n of nodes) {
    if (n.links.length < 3 || !nodeSgn.has(n.id)) continue;
    const sg = nodeSgn.get(n.id);
    for (const [sx, sz] of [[1, -sg], [-1, sg]]) {
      const x = n.x + sx * 8.6, z = n.z + sz * 8.6;
      if (x > shoreAt(z) - 4 || Math.abs(x) > HALF - 3 || Math.abs(z) > HALF - 3) continue;
      trafficPoles.push({ x, z });
      const id = SIGN_AD.street + Math.floor(vr() * SIGN_AD.streetCount), [u0, v0, u1, v1] = signUV(id);
      for (const [fx, fz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const rx = fz, rz = -fx, y0 = 6.2, w = 0.55, hh = 0.26, ox = fx * 0.12, oz = fz * 0.12;
        bill.face([[x + ox - rx * w, y0, z + oz - rz * w], [x + ox + rx * w, y0, z + oz + rz * w], [x + ox + rx * w, y0 + hh * 2, z + oz + rz * w], [x + ox - rx * w, y0 + hh * 2, z + oz - rz * w]], [fx, 0, fz], [1, 1, 1], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
      }
      furn.box(x - 0.14, 6.15, z - 0.14, x + 0.14, 6.2, z + 0.14, STEEL);
    }
  }

  // ---------- meshes ----------
  const group = new THREE.Group(); group.name = 'world'; game.scene.add(group);
  const mats = [];
  const aniso = tier === 2 ? Math.min(8, game.renderer?.capabilities?.getMaxAnisotropy?.() ?? 1) : tier === 1 ? Math.min(4, game.renderer?.capabilities?.getMaxAnisotropy?.() ?? 1) : 1;
  const swayU = { value: 0 };
  const NZ_GLSL = `float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
    float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h21(i),h21(i+vec2(1.0,0.0)),f.x), mix(h21(i+vec2(0.0,1.0)),h21(i+vec2(1.0,1.0)),f.x), f.y); }`;
  /** world-space value-noise albedo breakup (roofs, concrete props) */
  const noisePatch = (m, amt, freq) => {
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix*vec4(transformed,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vWp;\n${NZ_GLSL}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n{ float nz = vn(vWp.xz*${freq.toFixed(2)}+vWp.y*0.9)*0.6 + vn(vWp.xz*${(freq * 4.3).toFixed(2)}+vWp.y*3.1)*0.4; diffuseColor.rgb *= 1.0 + (nz-0.5)*${amt.toFixed(2)}; }`);
    };
  };
  const mkMat = (opt, kind = 'std') => {
    let m;
    if (tier === 0 || kind === 'lambert') {
      const o = { ...opt }; for (const k of ['roughness', 'metalness', 'normalMap', 'normalScale', 'roughnessMap', 'metalnessMap', 'envMapIntensity']) delete o[k];
      m = new THREE.MeshLambertMaterial(o);
    } else m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...opt });
    mats.push(m); return m;
  };
  const poly = (m, f, u) => { m.polygonOffset = true; m.polygonOffsetFactor = f; m.polygonOffsetUnits = u; return m; };
  const add = (geo, mat, o = {}) => { const m = new THREE.Mesh(geo, mat); m.receiveShadow = !!o.recv; m.castShadow = !!o.cast; group.add(m); return m; };
  /** ground-type material from a texture set */
  const groundMat = (set, o = {}) => {
    const opt = { vertexColors: true, map: set.map, ...o };
    if (set.normalMap) { opt.normalMap = set.normalMap; opt.normalScale = new THREE.Vector2(o.ns ?? 1, o.ns ?? 1); }
    if (set.roughnessMap) { opt.roughnessMap = set.roughnessMap; opt.roughness = 1; }
    delete opt.ns; return mkMat(opt);
  };
  const asph = makeAsphalt(tier, aniso), pav = makePavers(tier, aniso), grs = makeGrass(tier, aniso), snd = makeSand(tier, aniso);
  const bump = tier >= 1;
  add(grassFar.build(), poly(groundMat(grs, { roughness: 0.95, ns: 0.8 }), 0, 0), { recv: true });
  add(fills.build(), poly(groundMat(pav, { ns: 1.0 }), 0, 0), { recv: true });
  add(sandB.build(), poly(groundMat(snd, { roughness: 0.95, ns: 0.9 }), 0, 0), { recv: true });
  add(innerG.build(), poly(groundMat(grs, { roughness: 0.95, ns: 1.0 }), -1, -1), { recv: true });
  add(innerP.build(), poly(groundMat(pav, { ns: 1.0 }), -1, -1), { recv: true });
  add(asphalt.build(), poly(groundMat(asph, { ns: 1.0 }), -1, -2), { recv: true });
  const maskTex = makePaintMask(tier);
  add(marks.build(), poly(mkMat({ vertexColors: true, map: maskTex, alphaTest: 0.5, roughness: 0.7 }), -1, -4), { recv: true });
  const trackMat = poly(mkMat({ vertexColors: true, map: makeTracks(tier), transparent: true, depthWrite: false, roughness: 0.6 }), -1, -3);
  add(tracksB.build(), trackMat, { recv: true }).renderOrder = 1;
  add(decalsB.build(), poly(mkMat({ vertexColors: true, map: makeDecals(tier, aniso), transparent: true, depthWrite: false, roughness: 0.5, metalness: tier ? 0.25 : 0 }), -1, -5), { recv: true }).renderOrder = 2;
  add(roofB.build(), groundMat(pav, { ns: 0.6 }), { recv: true });
  const rt = makeRoofTiles(tier, aniso); // terracotta tiles
  add(tilesB.build(), groundMat(rt, { ns: 1.0, side: THREE.DoubleSide }), { recv: true, cast: true });
  const solidMat = mkMat({ vertexColors: true, side: THREE.DoubleSide }); if (bump) noisePatch(solidMat, 0.28, 0.8);
  add(solid.build(), solidMat, { recv: true, cast: true });
  const winMats = [];
  let seed = 11;
  const facMat = (set) => {
    if (tier === 0) return mkMat({ vertexColors: true, map: set.map, emissiveMap: set.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0 });
    return mkMat({ vertexColors: true, map: set.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap, metalnessMap: set.roughnessMap, roughness: 1, metalness: 1, emissiveMap: set.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0, envMapIntensity: 1.1 });
  };
  for (const k of ['glass', 'deco', 'house', 'industrial']) {
    if (!fac[k].n) continue;
    const m = facMat(makeFacade(k, seed++, tier, aniso));
    winMats.push(m); add(fac[k].build(), m, { recv: true, cast: true });
  }
  { const m = facMat(makeShopfront(tier, aniso)); winMats.push(m); add(shopB.build(), m, { recv: true, cast: true }); }
  const billMat = new THREE.MeshBasicMaterial({ map: makeSignAtlas(tier, aniso), vertexColors: true }); add(bill.build(), billMat);
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffffff, fog: true }); add(glowB.build(), glowMat);
  add(furn.build(), mkMat({ vertexColors: true, side: THREE.DoubleSide }), { recv: true, cast: true });

  // instanced props
  const dummy = new THREE.Object3D(), tint = new THREE.Color();
  const veg = makeVeg(tier, aniso);
  // ---- palms: curved segmented trunk with bark rings, drooping fronds (alpha-cut feather texture) ----
  const palmB = new Batch();
  {
    const nR = tier === 0 ? 4 : tier === 1 ? 6 : 9, sides = tier === 0 ? 5 : 6, Ht = 7.2, bark = C(0xa88a64), rings = [];
    for (let i = 0; i < nR; i++) { const f = i / (nR - 1); rings.push({ x: 1.1 * f * f, y: f * Ht, z: 0.2 * f, r: 0.145 + 0.17 * Math.pow(1 - f, 3), v: 0.02 + 0.94 * f }); }
    palmB.sweep(rings, sides, (i) => shade(bark, i % 2 ? 1 : 0.86), 0.5);
    const top = rings[nR - 1], nF = tier === 0 ? 7 : 9, segs = tier === 0 ? 3 : 5, FR = seeded(31337);
    for (let f = 0; f < nF; f++) {
      const th = f / nF * Math.PI * 2 + FR() * 0.5, cx = Math.cos(th), cz = Math.sin(th), px = -cz, pz = cx;
      const len = 3.3 + FR() * 1.1, rise = f % 3 === 0 ? 2.6 : 1.4 + FR() * 0.6, droop = f % 3 === 0 ? 2.8 : 3.2 + FR() * 1.2, tone = 0.78 + FR() * 0.35;
      const base = palmB.n;
      for (let j = 0; j <= segs; j++) {
        const s = j / segs, d = len * s * 0.95, y = top.y + 0.1 + rise * s - droop * s * s, w = 0.1 + 0.85 * Math.pow(Math.sin(Math.min(1, s * 1.12) * Math.PI), 0.7) * (1 - 0.15 * s);
        const cc = [0.1 + 0.2 * tone * (0.55 + 0.6 * s), 0.38 * tone * (0.6 + 0.5 * s), 0.07 * tone], vv = 0.02 + 0.95 * s, ctr = [top.x + cx * d, y, top.z + cz * d];
        const drop = 0.3 * w, nl = 0.6;
        palmB._v([ctr[0] - px * w, ctr[1] - drop, ctr[2] - pz * w], -px * nl, 1, -pz * nl, cc, [0.5, vv]);
        palmB._v(ctr, 0, 1, 0, cc, [0.75, vv]);
        palmB._v([ctr[0] + px * w, ctr[1] - drop, ctr[2] + pz * w], px * nl, 1, pz * nl, cc, [1.0, vv]);
      }
      for (let j = 0; j < segs; j++) { const a = base + j * 3; palmB.idx.push(a, a + 1, a + 4, a, a + 4, a + 3, a + 1, a + 2, a + 5, a + 1, a + 5, a + 4); }
    }
    if (tier > 0) for (let k = 0; k < 3; k++) palmB.blob(top.x + Math.cos(k * 2.1) * 0.2, top.y - 0.12, top.z + Math.sin(k * 2.1) * 0.2, 0.17, 0.2, 0.17, C(0x6a4a2a), 0);
  }
  const palmMat = mkMat({ vertexColors: true, map: veg, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.8 });
  palmMat.onBeforeCompile = (sh) => {
    sh.uniforms.uSway = swayU;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uSway;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x*0.37 + instanceMatrix[3].z*0.21;
        #else
        float ph = 0.0;
        #endif
        float sw = smoothstep(2.0, 7.5, position.y);
        transformed.x += sin(uSway*1.1 + ph)*0.07*sw*sw;
        float fl = smoothstep(6.8, 9.0, position.y);
        transformed.y += sin(uSway*2.2 + ph + position.x*2.0 + position.z*2.0)*0.14*fl;
        transformed.x += sin(uSway*1.7 + ph*1.3 + position.z*1.5)*0.1*fl;`);
  };
  const resetD = () => { dummy.position.set(0, 0, 0); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); };
  const inst = (geo, mat, list, place, o = {}) => {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)); m.count = list.length;
    list.forEach((p, k) => { place(p); dummy.updateMatrix(); m.setMatrixAt(k, dummy.matrix); if (o.color) { o.color(p, tint); m.setColorAt(k, tint); } });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.frustumCulled = false; m.castShadow = !!o.cast; m.receiveShadow = !!o.recv; group.add(m); return m;
  };
  /** Distance-cull an InstancedMesh (list items have x,z): re-packs the visible instances when the camera moved. */
  const culled = [];
  const makeCullable = (m, list, getX = (p) => p.x, getZ = (p) => p.z) => {
    const all = m.instanceMatrix.array.slice(), allC = m.instanceColor ? m.instanceColor.array.slice() : null, N = list.length, px = new Float32Array(N), pz = new Float32Array(N);
    list.forEach((p, i) => { px[i] = getX(p); pz[i] = getZ(p); });
    culled.push({ m, all, allC, px, pz, N });
  };
  let cullX = 1e9, cullZ = 1e9;
  const refreshCull = (force) => {
    const c = game.camera.position;
    if (!force && Math.hypot(c.x - cullX, c.z - cullZ) < 25) return;
    cullX = c.x; cullZ = c.z;
    const R = Math.min(game.q.drawDistance * 1.2, 520), R2 = R * R;
    for (const it of culled) {
      let k = 0; const ma = it.m.instanceMatrix.array, ca = it.m.instanceColor?.array;
      for (let i = 0; i < it.N; i++) {
        const dx = it.px[i] - c.x, dz = it.pz[i] - c.z; if (dx * dx + dz * dz > R2) continue;
        ma.set(it.all.subarray(i * 16, i * 16 + 16), k * 16); if (ca) ca.set(it.allC.subarray(i * 3, i * 3 + 3), k * 3); k++;
      }
      it.m.count = k; it.m.instanceMatrix.needsUpdate = true; if (it.m.instanceColor) it.m.instanceColor.needsUpdate = true;
    }
  };
  const hv = (p, k) => { const t = Math.sin(p.x * 12.9898 + p.z * 78.233 + k * 3.7) * 43758.5453; return t - Math.floor(t); };
  makeCullable(inst(palmB.build(), palmMat, placed.palms, (p) => { resetD(); dummy.position.set(p.x, 0, p.z); dummy.rotation.y = (p.x * 7.3 + p.z * 3.1) % 6.28; dummy.rotation.z = (hv(p, 1) - 0.5) * 0.06; dummy.scale.setScalar(p.s); },
    { cast: true, color: (p, c) => c.setRGB(0.85 + hv(p, 2) * 0.3, 0.9 + hv(p, 3) * 0.2, 0.8 + hv(p, 4) * 0.25) }), placed.palms);
  // ---- broadleaf trees: tapered trunk + clustered smooth-shaded foliage blobs with colour variation ----
  const treeB = new Batch();
  {
    treeB.sweep([{ x: 0, y: 0, z: 0, r: 0.24, v: 0 }, { x: 0.05, y: 1.2, z: 0.02, r: 0.17, v: 1 }, { x: 0.1, y: 2.7, z: 0.05, r: 0.13, v: 2 }, { x: 0.05, y: 3.9, z: 0, r: 0.09, v: 3 }], 6, C(0x6b4f36));
    treeB.box(0.05, 2.2, 0, 0.7, 2.3, 0.08, C(0x6b4f36), false); treeB.box(-0.5, 2.5, -0.06, 0.05, 2.6, 0.02, C(0x6b4f36), false);
    const dk = C(0x2a6a34), lt = C(0x7ec45c), TR = seeded(888);
    const blobs = [[0, 4.3, 0, 1.7, 1.4], [0.95, 3.9, 0.3, 1.15, 1.0], [-0.9, 4.0, -0.4, 1.25, 1.05], [0.2, 5.4, 0.2, 1.25, 1.0], [0.3, 4.2, -1.05, 1.05, 0.95], [-0.55, 4.5, 1.0, 1.05, 0.95], [0.1, 3.4, 0.15, 1.3, 0.8]];
    blobs.slice(0, tier === 0 ? 5 : 7).forEach(([x, y, z, r, ry], i) => {
      const jit = TR() * 6.28;
      treeB.blob(x, y, z, r, ry, r, (ux, uy, uz) => { const t = Math.min(1, Math.max(0, uy * 0.5 + 0.5 + 0.12 * Math.sin(ux * 7 + jit) + 0.1 * Math.sin(uz * 9 + jit * 2))), l = 0.55 + 0.45 * Math.min(1, (y + uy * ry - 2.6) / 3.2); return [(dk[0] + (lt[0] - dk[0]) * t) * l, (dk[1] + (lt[1] - dk[1]) * t) * l, (dk[2] + (lt[2] - dk[2]) * t) * l]; }, tier === 2 && i < 4 ? 1 : 0, jit);
    });
  }
  const treeMat = mkMat({ vertexColors: true, roughness: 0.82 });
  if (bump) treeMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLp = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vLp;\n${NZ_GLSL}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\n{ float nz = vn(vLp.xy*5.0+vLp.z*3.0)*0.55 + vn(vLp.xz*13.0+vLp.y*7.0)*0.45; diffuseColor.rgb *= 0.78 + nz*0.46; }');
  };
  makeCullable(inst(treeB.build(), treeMat, placed.trees, (p) => { resetD(); dummy.position.set(p.x, 0, p.z); dummy.rotation.y = (p.x + p.z) % 6.28; dummy.scale.set(p.s, p.s * (0.9 + hv(p, 5) * 0.25), p.s); },
    { cast: true, color: (p, c) => c.setRGB(0.85 + hv(p, 6) * 0.35, 0.9 + hv(p, 7) * 0.2, 0.8 + hv(p, 8) * 0.3) }), placed.trees);
  // ---- street lamps (curved arm, cobra head) with glowing lens, ground light pools and halo points ----
  const lampB = new Batch(), lampHeadB = new Batch(), LG = C(0x4a4e58), LH = C(0x5d626c);
  lampB.sweep([{ x: 0, y: 0, z: 0, r: 0.2, v: 0 }, { x: 0, y: 0.45, z: 0, r: 0.16, v: 1 }, { x: 0, y: 0.55, z: 0, r: 0.09, v: 2 }, { x: 0, y: 6.1, z: 0, r: 0.06, v: 3 }], 8, LG);
  lampB.box(0, 6.05, -0.035, 0.7, 6.16, 0.035, LG); lampB.face([[0.65, 6.1, -0.03], [1.25, 6.28, -0.03], [1.25, 6.34, 0.03], [0.65, 6.17, 0.03]], [0, 1, 0], LG);
  lampB.box(0.95, 6.14, -0.17, 1.9, 6.34, 0.17, LH); lampB.box(1.0, 6.0, -0.14, 1.85, 6.14, 0.14, C(0x30343a), false);
  lampHeadB.face([[1.05, 5.995, -0.12], [1.8, 5.995, -0.12], [1.8, 5.995, 0.12], [1.05, 5.995, 0.12]], [0, -1, 0], [1, 1, 1]);
  const lampPlace = (p) => { resetD(); dummy.position.set(p.x, 0, p.z); dummy.rotation.y = Math.atan2(-p.dz, p.dx); };
  makeCullable(inst(lampB.build(), mkMat({ vertexColors: true, roughness: 0.6, metalness: tier ? 0.4 : 0 }), placed.lamps, lampPlace, { cast: true }), placed.lamps);
  const lampHeadMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xcfd2d8, side: THREE.DoubleSide });
  makeCullable(inst(lampHeadB.build(), lampHeadMat, placed.lamps, lampPlace), placed.lamps);
  const poolMat = new THREE.MeshBasicMaterial({ map: makePool(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: true });
  poolMat.polygonOffset = true; poolMat.polygonOffsetFactor = -2; poolMat.polygonOffsetUnits = -6;
  const poolGeo = new THREE.PlaneGeometry(15, 15); poolGeo.rotateX(-Math.PI / 2);
  { const pm = inst(poolGeo, poolMat, placed.lamps, (p) => { resetD(); dummy.position.set(p.x + p.dx * 1.6, 0.05, p.z + p.dz * 1.6); }); pm.renderOrder = 3; makeCullable(pm, placed.lamps); }
  const haloMat = new THREE.PointsMaterial({ map: makeGlow(), size: 4.2, sizeAttenuation: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  { const hp = new Float32Array(placed.lamps.length * 3); placed.lamps.forEach((p, k) => { hp[k * 3] = p.x + p.dx * 1.45; hp[k * 3 + 1] = 5.95; hp[k * 3 + 2] = p.z + p.dz * 1.45; });
    const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.BufferAttribute(hp, 3)); const pts = new THREE.Points(hg, haloMat); pts.frustumCulled = false; pts.renderOrder = 4; group.add(pts); }
  // ---- benches ----
  const benchB = new Batch();
  for (let k = 0; k < 4; k++) benchB.box(-0.92, 0.42, -0.26 + k * 0.13, 0.92, 0.47, -0.16 + k * 0.13, C(0xa8672f));
  benchB.box(-0.92, 0.62, -0.3, 0.92, 0.7, -0.26, C(0xa8672f)); benchB.box(-0.92, 0.78, -0.3, 0.92, 0.86, -0.26, C(0xa8672f)); benchB.box(-0.92, 0.94, -0.3, 0.92, 1.0, -0.26, C(0xa8672f));
  for (const sx of [-0.8, 0.8]) { benchB.box(sx - 0.04, 0, -0.26, sx + 0.04, 0.42, 0.26, C(0x2a2d33)); benchB.box(sx - 0.04, 0.42, -0.31, sx + 0.04, 1.0, -0.26, C(0x2a2d33)); }
  inst(benchB.build(), mkMat({ vertexColors: true, roughness: 0.7 }), placed.benches, (p) => { resetD(); dummy.position.set(p.x, 0, p.z); dummy.rotation.y = p.h; }, { cast: true });
  // ---- traffic signals: shared-material emissive lamp textures cycle red / amber / green ----
  const sigTex = makeSignalTex();
  const sigBody = new Batch();
  sigBody.sweep([{ x: 0, y: 0, z: 0, r: 0.16, v: 0 }, { x: 0, y: 0.3, z: 0, r: 0.09, v: 1 }, { x: 0, y: 6.1, z: 0, r: 0.07, v: 2 }], 8, STEEL);
  for (const [fx, fz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const rx = fz, rz = -fx, hx = Math.abs(rx) * 0.17 + Math.abs(fx) * 0.14, hz = Math.abs(rz) * 0.17 + Math.abs(fz) * 0.14;
    sigBody.box(fx * 0.27 - hx, 4.45, fz * 0.27 - hz, fx * 0.27 + hx, 5.6, fz * 0.27 + hz, C(0x1b1c20));
    sigBody.box(fx * 0.27 + fx * 0.14 - Math.abs(rx) * 0.2, 5.58, fz * 0.27 + fz * 0.14 - Math.abs(rz) * 0.2, fx * 0.27 + fx * 0.14 + Math.abs(rx) * 0.2, 5.62, fz * 0.27 + fz * 0.14 + Math.abs(rz) * 0.2, C(0x1b1c20)); // visor
  }
  const sigPlace = (p) => { resetD(); dummy.position.set(p.x, 0, p.z); };
  inst(sigBody.build(), mkMat({ vertexColors: true, roughness: 0.5, metalness: tier ? 0.4 : 0 }), trafficPoles, sigPlace, { cast: true });
  const lampQuad = (fx, fz) => { const rx = fz, rz = -fx, b = new Batch(), o = 0.27 + 0.14 + 0.012; b.face([[fx * o - rx * 0.13, 4.5, fz * o - rz * 0.13], [fx * o + rx * 0.13, 4.5, fz * o + rz * 0.13], [fx * o + rx * 0.13, 5.55, fz * o + rz * 0.13], [fx * o - rx * 0.13, 5.55, fz * o - rz * 0.13]], [fx, 0, fz], [1, 1, 1], [[0, 0], [1, 0], [1, 1], [0, 1]]); return b; };
  const sigGeo = (dirs) => { const b = new Batch(); for (const [fx, fz] of dirs) { const q = lampQuad(fx, fz), base = b.n; b.pos.push(...q.pos); b.nor.push(...q.nor); b.col.push(...q.col); b.uv.push(...q.uv); b.idx.push(...q.idx.map((i) => i + base)); b.n += q.n; } return b.build(); };
  const sigMat = () => { const t = sigTex.clone(); t.needsUpdate = true; t.repeat.set(1, 1 / 3); const m = new THREE.MeshBasicMaterial({ map: t, color: 0xffffff }); return m; };
  const sigNS = sigMat(), sigEW = sigMat();
  inst(sigGeo([[0, 1], [0, -1]]), sigNS, trafficPoles, sigPlace);
  inst(sigGeo([[1, 0], [-1, 0]]), sigEW, trafficPoles, sigPlace);
  const setSig = (m, state) => { m.map.offset.y = 1 - (state + 1) / 3; }; // state 0 red, 1 amber, 2 green
  let tl = 0;
  const cycleSignals = () => { const ph = tl % 24; setSig(sigNS, ph < 9 ? 2 : ph < 11 ? 1 : 0); setSig(sigEW, ph < 12 ? 0 : ph < 21 ? 2 : ph < 23 ? 1 : 0); };
  cycleSignals();

  // ocean geometry + sky
  const waterGeo = new THREE.PlaneGeometry(2000, 3000, tier ? 1 : 1, 1); waterGeo.rotateX(-Math.PI / 2); waterGeo.translate(1500, -0.02, 0);
  const base = createSky(game, (e) => {
    for (const m of winMats) m.emissiveIntensity = e.windowI;
    lampHeadMat.color.setRGB(0.8 + e.lampOn * 0.2, 0.82 + e.lampOn * 0.1, 0.85 - e.lampOn * 0.2).multiplyScalar(1 + e.lampOn * 3.2);
    poolMat.opacity = e.lampOn * 0.62; haloMat.opacity = e.lampOn * 0.9;
    glowMat.color.setScalar(0.5 + e.nightF * 2.8); billMat.color.setScalar(1 + e.nightF * 0.9);
    sigNS.color.setScalar(1 + e.nightF * 0.8); sigEW.color.setScalar(1 + e.nightF * 0.8);
  }, waterGeo);
  game.events.on('settings:changed', () => { for (const m of mats) m.needsUpdate = true; refreshCull(true); });
  refreshCull(true);

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
    update(dt) { base.update(dt); tl += dt; swayU.value += dt; cycleSignals(); refreshCull(false); },
    // lighting handles for the renderer pipeline (environment intensity, bloom, ...)
    sunLight: base.sun, hemiLight: base.hemi, sky: base,
    get nightFactor() { return base.state.nightFactor; },
  };
  return world;
}
