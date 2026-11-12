// Neon Coast world: stylised, compressed ISTANBUL. Contract: docs/ARCHITECTURE.md (World section).
// NORTH = -Z, EAST = +X. Bosphorus (N-S), Golden Horn (NW inlet), Marmara (south edge). See geography.js for the layout.
import * as THREE from 'three';
import { seeded, clamp } from '../core/utils.js';
import { HALF, ROAD_HALF, LANE, SIDEWALK, SW_EDGE, LOT_MARGIN, QUAY, WATER_Y, CHUNK } from './layout.js';
import { Batch, C, shade } from './geo.js';
import { buildGeography, ZONES, PARK_CELLS, NC } from './geography.js';
import { buildRoadGraph, makeRoadsApi, buildRoadMeshes, PED_V } from './roads.js';
import {
  TIER, FACADE, SHOP, makeFacade, makeShopfront, makeSignAtlas, signUV, SIGN_ID, SIGN_AD, makeGlow, makePool, makeSignalTex,
  makeAsphalt, makePavers, makeGrass, makePaintMask, makeTracks, makeDecals, decalUV, DECAL, makeRoofTiles, makeVeg,
} from './textures.js';
import { createSky } from './sky.js';
import { renderMinimap } from './minimap.js';
import { makeKit, PASTEL, BLOCKS, GLASS, HOUSE, YALI, ROOFS } from './buildings.js';
import { makeMonuments } from './monuments.js';
import { makeInfra } from './infra.js';

export function createWorld(game) {
  const rand = seeded(1453);
  const rr = (a, b) => a + rand() * (b - a), rpick = (arr) => arr[Math.floor(rand() * arr.length)];
  const tier = TIER(game.settings.quality);
  const vr = seeded(777), rv = (a, b) => a + vr() * (b - a), vpick = (arr) => arr[Math.floor(vr() * arr.length)]; // decoration RNG
  const G = buildGeography(seeded(5));
  const RG = buildRoadGraph(G, seeded(77));
  const { xs, zs, H: HM, V: VM, hk } = Object.assign({}, G, RG);
  const HWk = SW_EDGE + 0.4;

  // ---------- land carve-outs inside the water (bridge decks, ferry pier) so collision lets entities use them ----------
  const PIER = { x0: xs[14] + 10, z: (zs[11] + zs[12]) / 2, len: 72 };
  const carves = [];
  for (const l of RG.links) if (l.kind === 'bridge') {
    const x0 = Math.min(l.a.x, l.b.x), x1 = Math.max(l.a.x, l.b.x), z0 = Math.min(l.a.z, l.b.z), z1 = Math.max(l.a.z, l.b.z);
    carves.push(l.horiz ? { x0, x1, z0: z0 - HWk, z1: z1 + HWk } : { x0: x0 - HWk, x1: x1 + HWk, z0, z1 });
  }
  carves.push({ x0: PIER.x0 - 1, x1: PIER.x0 + PIER.len, z0: PIER.z - 3.6, z1: PIER.z + 3.6 });
  G.finish(carves);
  const roadsApi = makeRoadsApi(RG);
  const { nodes, links } = RG;

  // ---------- spatial chunks of static geometry ----------
  const NCH = Math.ceil((HALF * 2) / CHUNK), chunks = new Map();
  const newChunk = () => { const solid = new Batch(); return {
    land: new Batch(4), wall: new Batch(), grass: new Batch(8), asphalt: new Batch(16), marks: new Batch(3), tracks: tier > 1 ? new Batch() : null, decals: tier ? new Batch() : null,
    pav: new Batch(4), roof: null, tiles: new Batch(), solid, glow: new Batch(), furn: solid, bill: new Batch(), shop: new Batch(),
    glass: new Batch(), deco: new Batch(), house: new Batch(), industrial: new Batch(), fac(k) { return this[k]; },
  }; };
  function CB(x, z) {
    const cx = clamp(Math.floor((x + HALF) / CHUNK), 0, NCH - 1), cz = clamp(Math.floor((z + HALF) / CHUNK), 0, NCH - 1), key = cx * 16 + cz;
    let c = chunks.get(key); if (!c) { c = newChunk(); c.cx = cx; c.cz = cz; chunks.set(key, c); } return c;
  }
  const colliders = [], footprints = [], landmarks = [], reserved = [], greens = [];
  const props = { palms: [], trees: [], cyp: [], benches: [], lamps: [] };
  const GH = new Map(), ghk = (a, b) => (a + 200) * 512 + (b + 200);
  const addCollider = (minX, maxX, minZ, maxZ, height, fp) => {
    const c = { minX, maxX, minZ, maxZ, height }; colliders.push(c);
    if (fp) footprints.push({ minX, maxX, minZ, maxZ });
    for (let a = Math.floor(minX / 20); a <= Math.floor(maxX / 20); a++) for (let b = Math.floor(minZ / 20); b <= Math.floor(maxZ / 20); b++) { const k = ghk(a, b); (GH.get(k) || GH.set(k, []).get(k)).push(c); }
  };
  const addLandmark = (id, name, type, x, z) => { landmarks.push({ id, name, type, x, z }); reserved.push({ x, z, r: 4.5 }); };
  const kit = makeKit({ tier, rand, rr, rpick, rv, vpick, vr, CB, addCollider });
  const ctxM = { CB, addCollider, rv, vr, vpick, rand, rpick, props, tier };
  const monu = makeMonuments(ctxM, kit);
  const infra = makeInfra(ctxM, kit);
  const CONC = C(0xc4c1b8);

  // ---------- ground: land mesh from the shoreline raster (marching squares), quay walls ----------
  {
    const WL = C(0x9a9488), WD = C(0x3f5a52);
    G.contour((x0, z0, x1, z1) => {
      let x = x0;
      while (x < x1 - 1e-6) { const k = Math.floor((x + 0.01 + HALF) / CHUNK), nx = Math.min(x1, -HALF + (k + 1) * CHUNK); CB(x + 0.01, (z0 + z1) / 2).land.rect(x, z0, nx, z1, 0, CONC); x = nx; }
    }, (pts) => { CB(pts[0][0], pts[0][1]).land.face(pts.map((p) => [p[0], 0, p[1]]), [0, 1, 0], CONC); },
    (ax, az, bx, bz, nx, nz) => { CB(ax, az).wall.face([[ax, 0.02, az], [bx, 0.02, bz], [bx, WATER_Y - 0.5, bz], [ax, WATER_Y - 0.5, az]], [nx, 0, nz], [WL, WL, WD, WD]); });
  }
  const far = new Batch(8); // distant land beyond the map border (beyond the fog, mostly)
  {
    let xa = null, xb = null, zw = HALF, ze = HALF;
    for (let x = -HALF; x <= HALF; x += 2) if (G.waterRender(x, -HALF + 1)) { if (xa === null) xa = x; xb = x; }
    for (let z = -HALF; z <= HALF; z += 2) { if (G.waterRender(-HALF + 1, z)) { zw = z; break; } }
    for (let z = -HALF; z <= HALF; z += 2) { if (G.waterRender(HALF - 1, z)) { ze = z; break; } }
    const g = C(0x7fa05e), y = -0.04, B = HALF - 10;
    if (xa !== null) { far.rect(-2600, -2600, xa, -B, y, g); far.rect(xb, -2600, 2600, -B, y, g); } else far.rect(-2600, -2600, 2600, -B, y, g);
    far.rect(-2600, -B, -B, zw + 4, y, g); far.rect(B, -B, 2600, ze + 4, y, g);
  }

  // ---------- roads ----------
  buildRoadMeshes(links, CB, { rng: seeded(4242), decalUV, DECAL });

  // ---------- lattice cells ----------
  const cells = [], grid = [];
  const zoneOf = {}; for (const name of Object.keys(ZONES)) { const [i0, j0, i1, j1] = ZONES[name]; for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) zoneOf[i + ',' + j] = name; }
  const parkKey = new Set(PARK_CELLS.map(([i, j]) => i + ',' + j));
  const pedW = new Set(PED_V.map(([i, j]) => i + ',' + j)), pedE = new Set(PED_V.map(([i, j]) => (i - 1) + ',' + j));
  for (let j = 0; j < NC; j++) { grid.push([]); for (let i = 0; i < NC; i++) {
    const ch = G.ch(i, j); if (ch === '~') { grid[j].push(null); continue; }
    const x0 = xs[i], x1 = xs[i + 1], z0 = zs[j], z1 = zs[j + 1], key = i + ',' + j;
    const c = { i, j, ch, x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, W: VM.has(hk(i, j)), E: VM.has(hk(i + 1, j)), N: HM.has(hk(i, j)), S: HM.has(hk(i, j + 1)), zone: zoneOf[key] || null, park: parkKey.has(key), special: false, taken: false };
    if (pedW.has(key)) c.W = true; if (pedE.has(key)) c.E = true;
    c.inner = { minX: x0 + (c.W ? LOT_MARGIN : 0.5), maxX: x1 - (c.E ? LOT_MARGIN : 0.5), minZ: z0 + (c.N ? LOT_MARGIN : 0.5), maxZ: z1 - (c.S ? LOT_MARGIN : 0.5) };
    c.full = c.W && c.E && c.N && c.S && !c.zone && !c.park; cells.push(c); grid[j].push(c);
  } }
  const pickCell = (tx, tz, pred) => {
    let b = null, bd = 1e12;
    for (const c of cells) { if (c.taken || c.special || c.zone || c.park || !pred(c)) continue; const d = Math.hypot(c.cx - tx, c.cz - tz); if (d < bd) { bd = d; b = c; } }
    if (b) b.taken = true; return b;
  };
  const shrink = (r, m) => ({ minX: r.minX + m, maxX: r.maxX - m, minZ: r.minZ + m, maxZ: r.maxZ - m });
  /** carve a slab of the given depth off one road side of a cell for a special building; returns { rect, f, lm } */
  function placeSpecial(cell, w, d, prefer) {
    const xc = cell.cx, zc = cell.cz, order = prefer || [0, 1, 2, 3].filter((s) => [cell.W, cell.E, cell.N, cell.S][s]);
    const side = order[0]; let rect, f, lm;
    if (side === 0) { rect = { minX: cell.x0 + LOT_MARGIN, maxX: cell.x0 + LOT_MARGIN + d, minZ: zc - w / 2, maxZ: zc + w / 2 }; f = [-1, 0]; lm = { x: cell.x0 + SIDEWALK, z: zc }; cell.inner.minX = rect.maxX + 2; }
    else if (side === 1) { rect = { minX: cell.x1 - LOT_MARGIN - d, maxX: cell.x1 - LOT_MARGIN, minZ: zc - w / 2, maxZ: zc + w / 2 }; f = [1, 0]; lm = { x: cell.x1 - SIDEWALK, z: zc }; cell.inner.maxX = rect.minX - 2; }
    else if (side === 2) { rect = { minX: xc - w / 2, maxX: xc + w / 2, minZ: cell.z0 + LOT_MARGIN, maxZ: cell.z0 + LOT_MARGIN + d }; f = [0, -1]; lm = { x: xc, z: cell.z0 + SIDEWALK }; cell.inner.minZ = rect.maxZ + 2; }
    else { rect = { minX: xc - w / 2, maxX: xc + w / 2, minZ: cell.z1 - LOT_MARGIN - d, maxZ: cell.z1 - LOT_MARGIN }; f = [0, 1]; lm = { x: xc, z: cell.z1 - SIDEWALK }; cell.inner.maxZ = rect.minZ - 2; }
    return { rect, f, lm, side };
  }
  const greenRect = (c) => ({ minX: c.x0 + (c.W ? SW_EDGE : 0.5), maxX: c.x1 - (c.E ? SW_EDGE : 0.5), minZ: c.z0 + (c.N ? SW_EDGE : 0.5), maxZ: c.z1 - (c.S ? SW_EDGE : 0.5) });
  const grass = (r, col = C(0x7fae5c), y = 0.015) => { CB((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2).grass.rect(r.minX, r.minZ, r.maxX, r.maxZ, y, col); };
  const tree = (x, z, s = 1) => props.trees.push({ x, z, s: s * rr(0.9, 1.25) });
  const cyp = (x, z, s = 1) => props.cyp.push({ x, z, s: s * rr(0.85, 1.2) });

  // ---------- special buildings ----------
  let spawnPoint = { x: 0, z: 0, heading: 0 };
  const SPECIALS = {
    safehouse: { at: [150, -95], pred: (c) => c.full && 'CGBE'.includes(c.ch), w: 14, d: 11, name: 'Güvenli Ev', type: 'safehouse' },
    hospital: { at: [-330, -330], pred: (c) => c.full && 's'.includes(c.ch), w: 36, d: 22, name: 'Şişli Devlet Hastanesi', type: 'hospital' },
    police: { at: [-250, 215], pred: (c) => c.full && 'FSM'.includes(c.ch), w: 30, d: 20, name: 'Fatih Emniyet Müdürlüğü', type: 'police' },
    gunshop: { at: [-190, -150], pred: (c) => c.full && 'BGTs'.includes(c.ch), w: 18, d: 14, name: 'Avcı Malzeme', type: 'gunshop' },
    garage: { at: [610, 110], pred: (c) => c.full && 'A'.includes(c.ch), w: 28, d: 18, name: 'Anadolu Oto Sanayi', type: 'garage' },
    downtown: { at: [-90, -560], pred: (c) => c.full && c.ch === 'L', w: 34, d: 30, name: 'Levent İş Merkezi', type: 'downtown' },
  };
  for (const id of Object.keys(SPECIALS)) {
    const s = SPECIALS[id], cell = pickCell(s.at[0], s.at[1], s.pred); if (!cell) continue;
    const sp = placeSpecial(cell, s.w, s.d); let H;
    if (id === 'safehouse') H = kit.masonry(sp.rect, 5, C(0x3fc1b0), { faces: { N: true, S: true, E: true, W: true }, roof: 'hip', bays: true });
    else if (id === 'hospital') H = kit.block(sp.rect, 7, C(0xf4f7fa), 'deco', { shop: false });
    else if (id === 'police') { H = kit.block(sp.rect, 5, C(0x7f9bc8), 'deco', { shop: false }); kit.flag(sp.lm.x - sp.f[0] * 3 + (sp.f[1] ? 6 : 0), sp.lm.z - sp.f[1] * 3 + (sp.f[0] ? 6 : 0), 10, sp.f[0], sp.f[1], 1.2); }
    else if (id === 'gunshop') H = kit.masonry(sp.rect, 3, C(0xffb347), { faces: { N: true, S: true, E: true, W: true }, roof: 'flat', bays: false });
    else if (id === 'garage') H = kit.warehouse(sp.rect, 8, C(0xf08a4b));
    else H = kit.tower(sp.rect, 190, C(0x7aa8d8));
    kit.wallSign(sp.rect, sp.f, H, SIGN_ID[id], id === 'downtown' ? 16 : 10);
    addLandmark(id, s.name, s.type, sp.lm.x, sp.lm.z);
    if (id === 'safehouse') {
      const alx = sp.f[0] === 0 ? 1 : 0, alz = sp.f[0] === 0 ? 0 : 1;
      spawnPoint = { x: sp.lm.x + alx * 4, z: sp.lm.z + alz * 4, heading: Math.atan2(sp.f[0], sp.f[1]) };
      reserved.push({ x: spawnPoint.x, z: spawnPoint.z, r: 3 });
    }
  }

  // ---------- zones: monuments, stadium, palace, docks, station, bazaar, parks ----------
  const zrect = (name) => { const r = G.zoneRect(name); return { x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, minX: r.x0 + LOT_MARGIN, maxX: r.x1 - LOT_MARGIN, minZ: r.z0 + LOT_MARGIN, maxZ: r.z1 - LOT_MARGIN }; };
  const sideSpot = (z, side) => { // landmark on the sidewalk of a zone side (0 W, 1 E, 2 N, 3 S)
    const xc = (z.x0 + z.x1) / 2, zc = (z.z0 + z.z1) / 2;
    return [{ x: z.x0 + SIDEWALK, z: zc, f: [-1, 0] }, { x: z.x1 - SIDEWALK, z: zc, f: [1, 0] }, { x: xc, z: z.z0 + SIDEWALK, f: [0, -1] }, { x: xc, z: z.z1 - SIDEWALK, f: [0, 1] }][side];
  };
  const footColor = (r, c) => footprints.push({ minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ, c });
  const Z = {}; for (const n of Object.keys(ZONES)) Z[n] = zrect(n);
  // Sultanahmet: six-minaret mosque + domed basilica, with plazas, trees and flags
  { const z = Z.blue; monu.mosque(shrink(z, 2), [0, -1], { minarets: 6, stone: 0xe6e2da, mh: 44 }); footColor(shrink(z, 6), '#8793a8'); grass(shrink(z, 0), C(0xb8b2a6), 0.012);
    const lm = sideSpot(z, 2); addLandmark('mosque6', 'Sultanahmet Camii (Altı Minareli)', 'landmark', lm.x, lm.z); for (const dx of [-30, 30]) { cyp(z.x0 + SW_EDGE + 2 + (dx > 0 ? 80 : 0), z.z0 + SW_EDGE + 2, 1.1); } }
  { const z = Z.basilica; monu.basilica(shrink(z, 2), [0, -1]); footColor(shrink(z, 6), '#a58a78'); grass(shrink(z, 0), C(0xb8b2a6), 0.012);
    const lm = sideSpot(z, 2); addLandmark('basilica', 'Ayasofya', 'landmark', lm.x, lm.z); }
  { const z = Z.gulhane, g = { minX: z.x0 + SW_EDGE, maxX: z.x1 - SW_EDGE, minZ: z.z0 + SW_EDGE, maxZ: z.z1 - SW_EDGE }; grass(g); greens.push(g);
    const B = CB((g.minX + g.maxX) / 2, (g.minZ + g.maxZ) / 2);
    B.pav.rect(g.minX, (g.minZ + g.maxZ) / 2 - 1.6, g.maxX, (g.minZ + g.maxZ) / 2 + 1.6, 0.018, C(0xcfc6b4)); B.pav.rect((g.minX + g.maxX) / 2 - 1.6, g.minZ, (g.minX + g.maxX) / 2 + 1.6, g.maxZ, 0.018, C(0xcfc6b4));
    const pts = []; for (let k = 0; k < 90 && pts.length < 44; k++) { const x = rr(g.minX + 2, g.maxX - 2), z2 = rr(g.minZ + 2, g.maxZ - 2); if (Math.abs(x - (g.minX + g.maxX) / 2) < 4 || Math.abs(z2 - (g.minZ + g.maxZ) / 2) < 4 || pts.some((p) => Math.hypot(p.x - x, p.z - z2) < 6)) continue; pts.push({ x, z: z2 }); if (rand() < 0.4) cyp(x, z2, 1.2); else tree(x, z2, 1.2); }
    for (let b = 0; b < 4; b++) props.benches.push({ x: rr(g.minX + 8, g.maxX - 8), z: (g.minZ + g.maxZ) / 2 + (b % 2 ? 4 : -4), h: b % 2 ? 0 : Math.PI, free: true });
    const lm = sideSpot(z, 3); addLandmark('park', 'Sarayburnu Parkı', 'park', lm.x, lm.z); kit.signPost(lm.x, lm.z - 6, 0, 1, SIGN_ID.park); }
  { const z = Z.bazaar; monu.bazaar(shrink(z, 0)); footColor(shrink(z, 4), '#8793a8'); const lm = sideSpot(z, 3); addLandmark('bazaar', 'Kapalıçarşı', 'landmark', lm.x, lm.z); }
  { const z = Z.stadium; const st = infra.stadium(shrink(z, 0), [-1, 0]); footColor({ minX: st.cx - st.ax, maxX: st.cx + st.ax, minZ: st.cz - st.az, maxZ: st.cz + st.az }, '#3f5648');
    const lm = sideSpot(z, 0); addLandmark('stadium', 'Boğaz Stadyumu', 'stadium', lm.x, lm.z); }
  { const z = Z.palace; const pr = shrink(z, 0); const pal = monu.palace(pr, [1, 0]); footColor({ minX: z.x1 - LOT_MARGIN - 24, maxX: z.x1 - LOT_MARGIN, minZ: z.z0 + 20, maxZ: z.z1 - 14 }, '#cfc6b0');
    const g = { minX: z.x0 + SW_EDGE, maxX: z.x1 - LOT_MARGIN - 24, minZ: z.z0 + SW_EDGE, maxZ: z.z1 - SW_EDGE }; grass(g); greens.push(g);
    for (let k = 0; k < 10; k++) cyp(rr(g.minX + 3, g.maxX - 3), rr(g.minZ + 3, g.maxZ - 3), 1.1);
    for (let k = 0; k < 8; k++) tree(rr(g.minX + 3, g.maxX - 3), rr(g.minZ + 3, g.maxZ - 3), 1);
    const lm = sideSpot(z, 1); addLandmark('palace', 'Boğaz Sarayı', 'landmark', lm.x, lm.z); void pal; }
  { const z = Z.station; monu.station(shrink(z, 2), [-1, 0]); footColor(shrink(z, 6), '#8a8478'); const lm = sideSpot(z, 0); addLandmark('station', 'Haydarpaşa Garı', 'landmark', lm.x, lm.z); }
  { const z = Z.docks; infra.docks(shrink(z, 6)); footColor(shrink(z, 14), '#55585f'); const lm = sideSpot(z, 0); addLandmark('docks', 'Haydarpaşa Limanı', 'docks', lm.x, lm.z + 30); kit.signPost(lm.x + 6, lm.z + 34, -1, 0, SIGN_ID.docks); }
  { // Taksim square: plaza + monument + fountains + flags, tree-lined
    const z = Z.taksim, pr = { minX: z.minX, maxX: z.maxX, minZ: z.minZ, maxZ: z.maxZ };
    monu.taksim(pr); footColor(pr, '#6a5a78');
    const cx = (z.x0 + z.x1) / 2;
    addLandmark('plaza', 'Taksim Meydanı', 'plaza', cx + 22, z.z1 - SIDEWALK);
    for (let k = 0; k < 14; k++) { const x = z.minX + 8 + k * (z.maxX - z.minX - 16) / 13; tree(x, pr.maxZ - 2.5, 0.9); tree(x, pr.minZ + 2.5, 0.9); }
  }
  // Galata tower on its plaza + tram avenue
  { const c = grid[10][12]; c.special = true; monu.galataTower(c.cx + 0, c.cz); footColor({ minX: c.cx - 6, maxX: c.cx + 6, minZ: c.cz - 6, maxZ: c.cz + 6 }, '#8793a8'); addLandmark('galata', 'Galata Kulesi', 'landmark', c.x0 + SIDEWALK, c.cz + 14);
    const left = { minX: c.x0 + LOT_MARGIN, maxX: c.x1 - LOT_MARGIN, minZ: c.z0 + LOT_MARGIN, maxZ: c.z1 - LOT_MARGIN };
    for (const [px, pz] of [[-14, -14], [14, -14], [-14, 14], [14, 14]]) { const x = c.cx + px, z = c.cz + pz; if (x > left.minX && x < left.maxX && z > left.minZ && z < left.maxZ) tree(x, z, 0.9); } }
  const tramX = xs[12], tramZ0 = zs[9], tramZ1 = zs[11];
  infra.tramLine(tramX, tramZ0, tramZ1);
  // Kiz Kulesi on its islet near Uskudar
  const KIZ = { x: xs[17] - QUAY - 42, z: (zs[14] + zs[15]) / 2 + 6 };
  monu.kizKulesi(KIZ.x, KIZ.z);
  { const x = xs[17] - SIDEWALK, z = KIZ.z; addLandmark('kiz', 'Kız Kulesi Seyir Noktası', 'landmark', x, z); }
  // ferry pier (Karakoy)
  infra.pier(PIER.x0, PIER.z, 1, 0, PIER.len);
  { const x = xs[14] - SIDEWALK, z = PIER.z; addLandmark('pier', 'Karaköy İskelesi', 'pier', x, z); kit.signPost(x + 7, z - 11, 1, 0, SIGN_ID.pier); }
  { // ferry terminal shed
    const x = PIER.x0 + 1, z = PIER.z, B = CB(x, z), S = B.solid;
    S.box(x, 0, z - 6.5, x + 9, 3.6, z - 3.9, C(0xd8cdb6)); S.box(x - 0.6, 3.6, z - 7.1, x + 9.6, 4.1, z - 3.3, C(0x8a5a4a)); addCollider(x, x + 9, z - 6.5, z - 3.9, 4.1, true);
    S.box(x, 0, z + 3.9, x + 9, 3.6, z + 6.5, C(0xd8cdb6)); S.box(x - 0.6, 3.6, z + 3.3, x + 9.6, 4.1, z + 7.1, C(0x8a5a4a)); addCollider(x, x + 9, z + 3.9, z + 6.5, 4.1, true);
  }
  // bridges
  for (const l of links) if (l.kind === 'bridge') {
    infra.bridge(l);
    const b = l.bridge, horiz = l.horiz, s0 = horiz ? Math.min(l.a.x, l.b.x) : Math.min(l.a.z, l.b.z), c = horiz ? l.a.z : l.a.x, s = s0 + QUAY + 34;
    addLandmark(b.id, b.name, 'landmark', horiz ? s : c + 9, horiz ? c + 9 : s);
  }

  // ---------- park cells ----------
  const PARK_NAMES = ['Çınar Parkı', 'Moda Parkı', 'Lale Parkı', 'Sahil Parkı'];
  PARK_CELLS.forEach(([i, j], k) => {
    const c = grid[j][i]; if (!c) return; c.special = true;
    const g = greenRect(c); grass(g); greens.push(g);
    const B = CB(c.cx, c.cz), mx = (g.minX + g.maxX) / 2, mz = (g.minZ + g.maxZ) / 2;
    B.pav.rect(g.minX, mz - 1.4, g.maxX, mz + 1.4, 0.018, C(0xcfc6b4)); B.pav.rect(mx - 1.4, g.minZ, mx + 1.4, g.maxZ, 0.018, C(0xcfc6b4));
    B.pav.rect(mx - 7, mz - 7, mx + 7, mz + 7, 0.019, C(0xd8cfbe));
    const pts = []; for (let t = 0; t < 120 && pts.length < 24; t++) { const x = rr(g.minX + 2, g.maxX - 2), z = rr(g.minZ + 2, g.maxZ - 2); if (Math.abs(x - mx) < 3.2 || Math.abs(z - mz) < 3.2 || (Math.abs(x - mx) < 9 && Math.abs(z - mz) < 9) || pts.some((p) => Math.hypot(p.x - x, p.z - z) < 6)) continue; pts.push({ x, z }); if (rand() < 0.3) cyp(x, z, 1.1); else tree(x, z, 1.15); }
    B.furn.cyl(mx, 0.02, mz, 3, 3, 0.7, 12, C(0xd8d3c8)); B.furn.cyl(mx, 0.7, mz, 2.4, 2.4, 0.12, 12, C(0x6fb4c8)); B.furn.cyl(mx, 0.7, mz, 0.35, 0.35, 2, 6, C(0xd8d3c8));
    for (let b = 0; b < 4; b++) props.benches.push({ x: mx + (b % 2 ? 5.5 : -5.5), z: mz + (b < 2 ? -3 : 3), h: b % 2 ? Math.PI / 2 : -Math.PI / 2, free: true });
    // tea tables under the trees
    for (let t = 0; t < 3; t++) teaTable(mx + rr(-12, 12), mz + rr(8, 14));
    const lm = { x: c.x0 + SIDEWALK, z: c.cz, f: [-1, 0] }; if (!c.W) { lm.x = c.x1 - SIDEWALK; lm.f = [1, 0]; }
    addLandmark(k === 0 ? 'park2' : k === 1 ? 'park3' : 'park' + (k + 2), PARK_NAMES[k] || 'Park', 'park', lm.x, lm.z);
  });
  function teaTable(x, z) {
    const B = CB(x, z), F = B.furn, col = vpick([0xc62828, 0x2a6a8a, 0x2f7d4a, 0xe8b030]);
    F.cyl(x, 0, z, 0.06, 0.06, 0.72, 5, C(0x2a2d33)); F.cyl(x, 0.72, z, 0.48, 0.48, 0.05, 8, C(col));
    for (const [dx, dz] of [[0.75, 0], [-0.75, 0], [0, 0.75], [0, -0.75]]) { F.box(x + dx - 0.2, 0.42, z + dz - 0.2, x + dx + 0.2, 0.47, z + dz + 0.2, C(0x2a2d33)); F.box(x + dx - 0.2, 0, z + dz - 0.2, x + dx - 0.16, 0.42, z + dz - 0.16, C(0x2a2d33)); F.box(x + dx + 0.16, 0, z + dz + 0.16, x + dx + 0.2, 0.42, z + dz + 0.2, C(0x2a2d33)); }
  }
  function simitCart(x, z, h) {
    const B = CB(x, z), F = B.furn, c = Math.cos(h), s = Math.sin(h), R = (u, v) => [x + u * c + v * s, z - u * s + v * c];
    const bx = (u0, v0, u1, v1, y0, y1, col) => { const a = R(u0, v0), b = R(u1, v1); F.box(Math.min(a[0], b[0]), y0, Math.min(a[1], b[1]), Math.max(a[0], b[0]), y1, Math.max(a[1], b[1]), col); };
    bx(-0.6, -0.9, 0.6, 0.9, 0.55, 1.0, C(0xc03a2b)); bx(-0.62, -0.92, 0.62, 0.92, 1.0, 1.06, C(0xe8c060)); bx(-0.55, -0.85, 0.55, 0.85, 1.06, 1.7, C(0xaed6e8));
    bx(-0.65, -0.95, 0.65, 0.95, 1.7, 1.78, C(0xc03a2b)); for (const u of [-0.55, 0.55]) for (const v of [-0.6, 0.6]) { const p = R(u, v); F.cyl(p[0], 0.0, p[1], 0.28, 0.28, 0.08, 8, C(0x222222)); }
  }
  // grouped decor helpers need to exist before the street furniture pass below

  // ---------- generic helpers: free test, lot splitting ----------
  const free = (x, z, r) => {
    if (Math.abs(x) > HALF - 3 || Math.abs(z) > HALF - 3) return false;
    if (G.sdf(x, z) < 1.8 + r) return false;
    if (roadsApi.isRoad(x, z)) return false;
    for (const q of reserved) if (Math.hypot(q.x - x, q.z - z) < q.r) return false;
    for (let a = Math.floor((x - r) / 20); a <= Math.floor((x + r) / 20); a++) for (let b = Math.floor((z - r) / 20); b <= Math.floor((z + r) / 20); b++) {
      const l = GH.get(ghk(a, b)); if (!l) continue;
      for (const c of l) if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return false;
    }
    return true;
  };
  function bsp(r, maxS, minS, out) {
    const w = r.maxX - r.minX, d = r.maxZ - r.minZ;
    if ((w <= maxS && d <= maxS) || (w < minS * 2 && d < minS * 2)) { out.push(r); return; }
    const alongX = w >= d, L = alongX ? w : d;
    if (L < minS * 2) { out.push(r); return; }
    const t = clamp(0.34 + 0.32 * rand(), minS / L, 1 - minS / L);
    if (alongX) { const x = r.minX + L * t; bsp({ ...r, maxX: x }, maxS, minS, out); bsp({ ...r, minX: x }, maxS, minS, out); }
    else { const z = r.minZ + L * t; bsp({ ...r, maxZ: z }, maxS, minS, out); bsp({ ...r, minZ: z }, maxS, minS, out); }
  }
  const ST = {
    F: { k: 'old', fl: [3, 5], hip: 0.7, mx: 17 }, S: { k: 'old', fl: [3, 5], hip: 0.7, mx: 17 }, M: { k: 'old', fl: [3, 5], hip: 0.55, mx: 18 }, U: { k: 'old', fl: [3, 5], hip: 0.6, mx: 18 },
    B: { k: 'old', fl: [4, 7], hip: 0.35, mx: 19 }, G: { k: 'old', fl: [4, 6], hip: 0.4, mx: 18 }, C: { k: 'old', fl: [4, 6], hip: 0.45, mx: 17 }, T: { k: 'old', fl: [5, 8], hip: 0.15, mx: 21 },
    E: { k: 'old', fl: [4, 7], hip: 0.3, mx: 20 }, K: { k: 'old', fl: [5, 8], hip: 0.15, mx: 21 }, Y: { k: 'old', fl: [4, 6], hip: 0.5, mx: 18 },
    s: { k: 'block', fl: [6, 10], mx: 26 }, A: { k: 'mixA' }, N: { k: 'villa' }, R: { k: 'villa' }, O: { k: 'villa' }, L: { k: 'towers' }, D: { k: 'block', fl: [2, 3], mx: 30 },
  };
  // Ortakoy: small baroque-style mosque on the shore, tea garden and the 'beach' (waterfront promenade) landmark
  { const oc = grid[6][15];
    if (oc && !oc.zone && !oc.park && !oc.taken) {
      oc.special = true; oc.taken = true;
      const r = shrink(oc.inner, 1); monu.mosque(r, [1, 0], { minarets: 2, mh: 27, courtyard: false, stone: 0xefe6d4 }); footColor(shrink(r, 6), '#8793a8');
      CB(oc.cx, oc.cz).pav.rect(r.minX, r.minZ, r.maxX, r.maxZ, 0.012, C(0xd5cdbb));
      const wx = oc.x1 + 9, wz = oc.cz;
      addLandmark('beach', 'Ortaköy Çay Bahçesi', 'beach', wx, wz); kit.signPost(wx + 5, wz - 12, 1, 0, SIGN_ID.beach);
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) teaTable(oc.x1 + 14.5 + a * 3.2, wz + (b - 1) * 6.5);
      simitCart(oc.x1 + 12.4, wz + 14, Math.PI / 2); simitCart(oc.x1 + 12.4, wz - 16, Math.PI / 2);
    } }
  // neighbourhood mosques
  { const cand = cells.filter((c) => c.full && !c.special && !c.taken && 'FBUKECGMsAOY'.includes(c.ch)); for (let k = cand.length - 1; k > 0; k--) { const m = Math.floor(rand() * (k + 1)); [cand[k], cand[m]] = [cand[m], cand[k]]; }
    const chosen = [];
    for (const c of cand) {
      if (chosen.length >= 14) break; if (chosen.some((o) => Math.hypot(o.cx - c.cx, o.cz - c.cz) < 190)) continue; chosen.push(c); c.special = true;
      const sides = [[c.W, [-1, 0]], [c.E, [1, 0]], [c.N, [0, -1]], [c.S, [0, 1]]].filter((s) => s[0]), face = sides[Math.floor(rand() * sides.length)][1];
      const r = shrink(c.inner, 1); monu.mosque(r, face, { minarets: rand() < 0.45 ? 2 : 1, mh: 24 + rand() * 6 }); footColor(shrink(r, 4), '#8793a8');
      CB(c.cx, c.cz).pav.rect(r.minX, r.minZ, r.maxX, r.maxZ, 0.012, C(0xd5cdbb));
    } }

  function fillCell(c) {
    const st = ST[c.ch]; if (!st || c.zone || c.park || c.special) return;
    const I = c.inner, iw = I.maxX - I.minX, id = I.maxZ - I.minZ; if (iw < 14 || id < 14) return;
    if (st.k === 'old' || st.k === 'block') {
      const lots = []; bsp(I, st.mx, 8.5, lots);
      for (const l of lots) {
        const r = shrink(l, 0.12), w = r.maxX - r.minX, d = r.maxZ - r.minZ; if (w < 6 || d < 6 || rand() < 0.03) continue;
        const e = 0.7, faces = { W: c.W && l.minX - I.minX < e, E: c.E && I.maxX - l.maxX < e, N: c.N && l.minZ - I.minZ < e, S: c.S && I.maxZ - l.maxZ < e };
        const any = faces.W || faces.E || faces.N || faces.S, floors = st.fl[0] + Math.floor(rand() * (st.fl[1] - st.fl[0] + 1));
        if (st.k === 'old') kit.masonry(r, floors, C(rpick(PASTEL)), { faces, roof: rand() < st.hip ? 'hip' : 'flat', bays: true, shop: any });
        else kit.block(r, floors, C(rpick(BLOCKS)), 'deco', { faces, shop: any && c.ch === 's' });
      }
    } else if (st.k === 'villa' || st.k === 'mixA') {
      grass(greenRect(c));
      const cols = Math.max(1, Math.floor(iw / 22)), rows = Math.max(1, Math.floor(id / 22)), lw = iw / cols, ld = id / rows;
      for (let a = 0; a < cols; a++) for (let b = 0; b < rows; b++) {
        if (rand() < 0.1) continue;
        const l = { minX: I.minX + a * lw, maxX: I.minX + (a + 1) * lw, minZ: I.minZ + b * ld, maxZ: I.minZ + (b + 1) * ld }, cx = (l.minX + l.maxX) / 2, cz = (l.minZ + l.maxZ) / 2;
        if (st.k === 'mixA' && rand() < 0.55) { const w = Math.min(lw - 4, rr(14, 19)), d = Math.min(ld - 4, rr(11, 15)); if (w < 8 || d < 8) continue; kit.block({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 }, 5 + Math.floor(rand() * 4), C(rpick(BLOCKS)), 'deco', { shop: false, bays: false }); }
        else { const w = Math.min(lw - 3, rr(9, 14)), d = Math.min(ld - 3, rr(8, 12)); if (w < 5 || d < 5) continue; kit.house({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 }, rr(5.5, 9), C(rpick(HOUSE)), rpick(ROOFS)); }
        if (rand() < 0.7) { const tx = rand() < 0.5 ? l.minX + 1.5 : l.maxX - 1.5, tz = rand() < 0.5 ? l.minZ + 1.5 : l.maxZ - 1.5; if (rand() < 0.35) cyp(tx, tz, 0.9); else tree(tx, tz, 0.9); }
      }
    } else if (st.k === 'towers') {
      const near = clamp(1 - Math.hypot(c.cx + 90, c.cz + 560) / 330, 0, 1), rect = shrink(I, 4);
      if (rand() < 0.3 && iw > 36) { const m = (rect.minX + rect.maxX) / 2; kit.tower({ ...rect, maxX: m - 3 }, 55 + near * 80 + rand() * 30, C(rpick(GLASS))); kit.tower({ ...rect, minX: m + 3 }, 45 + near * 70 + rand() * 30, C(rpick(GLASS))); }
      else kit.tower(rect, 65 + near * 125 + rand() * 30, C(rpick(GLASS)));
    }
  }
  for (const c of cells) fillCell(c);
  // fill specials' leftover (cells that lost a slab to a special building)

  // ---------- coast roads: yali mansions, promenades, tea gardens, benches ----------
  const YALI_D = new Set(['N', 'R', 'O']);
  for (const l of links) {
    if (!l.coast) continue;
    const horiz = l.horiz, ax = l.a.x, az = l.a.z, bx = l.b.x, bz = l.b.z, lo = horiz ? Math.min(ax, bx) : Math.min(az, bz), hi = horiz ? Math.max(ax, bx) : Math.max(az, bz), cc = horiz ? az : ax;
    const i = Math.min(l.a.i, l.b.i), j = Math.min(l.a.j, l.b.j), ws = G.isWaterCell(i, j) ? 1 : -1;
    const lc = horiz ? (ws > 0 ? G.ch(i, j - 1) : G.ch(i, j)) : (ws > 0 ? G.ch(i - 1, j) : G.ch(i, j));
    const P = (s, off) => (horiz ? [s, cc + ws * off] : [cc + ws * off, s]), wdir = horiz ? [0, ws] : [ws, 0];
    const bench = (s, off) => { const p = P(s, off); props.benches.push({ x: p[0], z: p[1], h: Math.atan2(wdir[0], wdir[1]), free: true }); };
    if (YALI_D.has(lc)) {
      for (let s = lo + 18; s < hi - 18;) {
        const len = rv(11, 21), a = P(s, 12.9), b = P(s + len, 21.2), r = { minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]), minZ: Math.min(a[1], b[1]), maxZ: Math.max(a[1], b[1]) };
        const mx = (r.minX + r.maxX) / 2, mz = (r.minZ + r.maxZ) / 2;
        if (free(mx, mz, 3) && G.sdf(r.minX, r.minZ) > 1.5 && G.sdf(r.maxX, r.maxZ) > 1.5 && G.sdf(r.minX, r.maxZ) > 1.5 && G.sdf(r.maxX, r.minZ) > 1.5) kit.yali(r, C(vpick(YALI)), wdir);
        s += len + rv(2.5, 7);
      }
      for (let s = lo + 30; s < hi - 24; s += 70) { const p = P(s, 11.6); props.lamps.push({ x: p[0], z: p[1], dx: -wdir[0], dz: -wdir[1] }); }
    } else {
      for (let s = lo + 22; s < hi - 14; s += rv(22, 30)) { const p = P(s, 14.6); if (rand() < 0.5 && 'KY'.includes(lc)) props.palms.push({ x: p[0], z: p[1], s: rr(0.9, 1.2) }); else tree(p[0], p[1], 1.1); }
      for (let s = lo + 30; s < hi - 24; s += 42) { const p = P(s, 19.5); props.lamps.push({ x: p[0], z: p[1], dx: -wdir[0], dz: -wdir[1] }); }
      for (let s = lo + 40; s < hi - 30; s += 55) bench(s, 17.4);
      if (rand() < 0.45 && hi - lo > 70) { const s0 = lo + rv(30, hi - lo - 40); for (let t = 0; t < 4; t++) { const p = P(s0 + (t % 2) * 4.2, 15.5 + (t >> 1) * 4.2); if (free(p[0], p[1], 1)) teaTable(p[0], p[1]); } }
      if (rand() < 0.45) { const p = P(rv(lo + 20, hi - 20), 12.5); simitCart(p[0], p[1], Math.atan2(wdir[0], wdir[1])); }
      if (rand() < 0.2) { const p = P(rv(lo + 20, hi - 20), 12.2); kit.flag(p[0], p[1], 9, wdir[0], wdir[1], 1.1); }
    }
  }
  // ---------- street trees, lamps, junction signals ----------
  for (const l of links) {
    if (l.kind === 'bridge') continue;
    const ax = l.a.x, az = l.a.z, bx = l.b.x, bz = l.b.z, L = Math.hypot(bx - ax, bz - az), dx = Math.sign(bx - ax), dz = Math.sign(bz - az), px = -dz, pz = dx;
    const step = l.av ? 17 : 27, pr = l.av ? 0.85 : 0.5;
    for (let t = 16; t < L - 16; t += step) for (const s of [-1, 1]) {
      if (rand() > pr) continue;
      const x = ax + dx * t + px * s * 10.4, z = az + dz * t + pz * s * 10.4;
      if (rand() < 0.16) cyp(x, z, 0.9); else tree(x, z, 1);
    }
    if (rand() < 0.2) { const s = rand() < 0.5 ? -1 : 1, t = L * rr(0.35, 0.65); props.benches.push({ x: ax + dx * t + px * s * 10.4, z: az + dz * t + pz * s * 10.4, h: Math.atan2(-px * s, -pz * s) }); }
    if (rand() < 0.14 && L > 60) { const s = rand() < 0.5 ? -1 : 1, t = rr(20, L - 20); simitCart(ax + dx * t + px * s * 9.4, az + dz * t + pz * s * 9.4, Math.atan2(-px * s, -pz * s)); }
  }
  const trafficPoles = [], nodeSgn = new Map();
  for (const n of nodes) {
    const sgn = rand() < 0.5 ? 1 : -1; nodeSgn.set(n.id, sgn);
    for (const [sx, sz] of [[1, sgn], [-1, -sgn]]) { const x = n.x + sx * 8.2, z = n.z + sz * 8.2; if (G.sdf(x, z) < 3 || Math.abs(x) > HALF - 3 || Math.abs(z) > HALF - 3) continue; props.lamps.push({ x, z, dx: -sx / Math.SQRT2, dz: -sz / Math.SQRT2 }); }
  }
  for (const n of nodes) {
    if (n.links.length < 3) continue;
    const sg = nodeSgn.get(n.id);
    for (const [sx, sz] of [[1, -sg], [-1, sg]]) {
      const x = n.x + sx * 8.6, z = n.z + sz * 8.6;
      if (G.sdf(x, z) < 3 || Math.abs(x) > HALF - 3 || Math.abs(z) > HALF - 3) continue;
      trafficPoles.push({ x, z });
      const B = CB(x, z), id = SIGN_AD.street + Math.floor(vr() * SIGN_AD.streetCount), [u0, v0, u1, v1] = signUV(id);
      for (const [fx, fz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const rx = fz, rz = -fx, y0 = 6.2, w = 0.55, hh = 0.26, ox = fx * 0.12, oz = fz * 0.12;
        B.bill.face([[x + ox - rx * w, y0, z + oz - rz * w], [x + ox + rx * w, y0, z + oz + rz * w], [x + ox + rx * w, y0 + hh * 2, z + oz + rz * w], [x + ox - rx * w, y0 + hh * 2, z + oz - rz * w]], [fx, 0, fz], [1, 1, 1], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
      }
      B.furn.box(x - 0.14, 6.15, z - 0.14, x + 0.14, 6.2, z + 0.14, C(0x70767e));
    }
  }
  // Kadikoy seaside palms + a few extra plane trees near the Taksim avenue
  for (let k = 0; k < 26; k++) { const z = rr(zs[17] + 20, zs[21] - 20), x = rr(xs[19] + 10, xs[19] + 22); props.palms.push({ x, z, s: rr(0.9, 1.2) }); }
  for (const z of [zs[9] + 20, zs[10] + 30, zs[10] + 6]) for (const sg of [-1, 1]) { tree(tramX + sg * 13.5, z, 1); }

  const placed = { palms: [], trees: [], cyp: [], benches: [], lamps: [] };
  for (const p of props.palms) if (free(p.x, p.z, 0.8)) { placed.palms.push(p); addCollider(p.x - 0.3, p.x + 0.3, p.z - 0.3, p.z + 0.3, 6); }
  for (const p of props.trees) if (free(p.x, p.z, 0.8)) { placed.trees.push(p); addCollider(p.x - 0.35, p.x + 0.35, p.z - 0.35, p.z + 0.35, 5); }
  for (const p of props.cyp) if (free(p.x, p.z, 0.8)) { placed.cyp.push(p); addCollider(p.x - 0.4, p.x + 0.4, p.z - 0.4, p.z + 0.4, 6); }
  for (const p of props.benches) { if (!free(p.x, p.z, 1.2)) continue; placed.benches.push(p); if (!p.noCol) { const along = Math.abs(Math.cos(p.h)) > 0.7, hx = along ? 0.9 : 0.35, hz = along ? 0.35 : 0.9; addCollider(p.x - hx, p.x + hx, p.z - hz, p.z + hz, 0.9); } }
  for (const p of props.lamps) if (G.sdf(p.x, p.z) > 1.2 && !roadsApi.isRoad(p.x, p.z)) placed.lamps.push(p);

  // ---------- landmark sanity: nudge to a free sidewalk spot ----------
  const inCol = (x, z, r) => { for (let a = Math.floor((x - r) / 20); a <= Math.floor((x + r) / 20); a++) for (let b = Math.floor((z - r) / 20); b <= Math.floor((z + r) / 20); b++) { const l = GH.get(ghk(a, b)); if (!l) continue; for (const c of l) if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return true; } return false; };
  const okSpot = (x, z) => G.sdf(x, z) > 2.5 && !inCol(x, z, 1.2) && !roadsApi.isRoad(x, z) && roadsApi.nearRoad(x, z, 12);
  const nudge = (p) => {
    if (okSpot(p.x, p.z)) return;
    for (let d = 2; d <= 60; d += 2) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const x = p.x + dx * d, z = p.z + dz * d; if (okSpot(x, z)) { p.x = x; p.z = z; return; } }
  };
  for (const l of landmarks) nudge(l);
  nudge(spawnPoint);

  // ---------- meshes ----------
  const group = new THREE.Group(); group.name = 'world'; game.scene.add(group);
  const mats = [];
  const aniso = tier === 2 ? Math.min(8, game.renderer?.capabilities?.getMaxAnisotropy?.() ?? 1) : tier === 1 ? Math.min(4, game.renderer?.capabilities?.getMaxAnisotropy?.() ?? 1) : 1;
  const swayU = { value: 0 };
  const NZ_GLSL = `float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
    float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h21(i),h21(i+vec2(1.0,0.0)),f.x), mix(h21(i+vec2(0.0,1.0)),h21(i+vec2(1.0,1.0)),f.x), f.y); }`;
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
  const groundMat = (set, o = {}) => {
    const opt = { vertexColors: true, map: set.map, ...o };
    if (set.normalMap) { opt.normalMap = set.normalMap; opt.normalScale = new THREE.Vector2(o.ns ?? 1, o.ns ?? 1); }
    if (set.roughnessMap) { opt.roughnessMap = set.roughnessMap; opt.roughness = 1; }
    delete opt.ns; return mkMat(opt);
  };
  const bump = tier >= 1, STEEL = C(0x70767e);
  const asph = makeAsphalt(tier, aniso), pav = makePavers(tier, aniso), grs = makeGrass(tier, aniso);
  const winMats = [];
  let seed = 11;
  const facMat = (set) => {
    if (tier === 0) return mkMat({ vertexColors: true, map: set.map, emissiveMap: set.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0 });
    return mkMat({ vertexColors: true, map: set.map, normalMap: set.normalMap, roughnessMap: set.roughnessMap, metalnessMap: set.roughnessMap, roughness: 1, metalness: 1, emissiveMap: set.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0, envMapIntensity: 1.1 });
  };
  const solidMat = mkMat({ vertexColors: true, side: THREE.DoubleSide }); if (bump) noisePatch(solidMat, 0.28, 0.8);
  const MAT = {
    land: poly(groundMat(pav, { ns: 1.0 }), 0, 0), wall: mkMat({ vertexColors: true, roughness: 0.9 }), grass: poly(groundMat(grs, { roughness: 0.95, ns: 1.0 }), -1, -1),
    pav: poly(groundMat(pav, { ns: 1.0 }), -1, -1), asphalt: poly(groundMat(asph, { ns: 1.0 }), -1, -2),
    marks: poly(mkMat({ vertexColors: true, map: makePaintMask(tier), alphaTest: 0.5, roughness: 0.7 }), -1, -4),
    tiles: groundMat(makeRoofTiles(tier, aniso), { ns: 1.0, side: THREE.DoubleSide }), solid: solidMat,
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffffff, fog: true }),
    bill: new THREE.MeshBasicMaterial({ map: makeSignAtlas(tier, aniso), vertexColors: true }),
  };
  if (tier > 1) MAT.tracks = poly(mkMat({ vertexColors: true, map: makeTracks(tier), transparent: true, depthWrite: false, roughness: 0.6 }), -1, -3);
  if (tier) {
    MAT.decals = poly(mkMat({ vertexColors: true, map: makeDecals(tier, aniso), transparent: true, depthWrite: false, roughness: 0.5, metalness: 0.25 }), -1, -5);
    MAT.shop = facMat(makeShopfront(tier, aniso)); winMats.push(MAT.shop);
  }
  for (const k of ['glass', 'deco', 'house', 'industrial']) { MAT[k] = facMat(makeFacade(k, seed++, tier, aniso)); winMats.push(MAT[k]); }
  const RO = { tracks: 1, decals: 2 }, CAST = new Set(['solid', 'tiles', 'glass', 'deco', 'house', 'industrial', 'shop', 'furn']);
  const statics = []; // { m, minX, maxX, minZ, maxZ }
  const cullScale = { k: 1 };
  const addStatic = (geo, mat, o = {}) => {
    const m = new THREE.Mesh(geo, mat); m.receiveShadow = !!o.recv; m.castShadow = !!o.cast; if (o.ro) m.renderOrder = o.ro; m.userData.kind = o.kind; group.add(m);
    geo.computeBoundingBox(); const b = geo.boundingBox; statics.push({ m, minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z }); return m;
  };
  for (const ch of chunks.values()) for (const k of Object.keys(MAT)) { const bt = ch[k]; if (!bt || !bt.n) continue; addStatic(bt.build(), MAT[k], { recv: k !== 'glow' && k !== 'bill', cast: CAST.has(k), ro: RO[k], kind: k }); }
  { const m = new THREE.Mesh(far.build(), poly(groundMat(grs, { roughness: 0.95, ns: 0.8 }), 1, 1)); m.receiveShadow = false; group.add(m); }
  let sLastX = 1e9, sLastZ = 1e9, sMode = '';
  const cullStatic = (force) => {
    const c = game.camera.position, mode = game.state.mode === 'menu' ? 'm' : 'p';
    if (!force && mode === sMode && Math.hypot(c.x - sLastX, c.z - sLastZ) < 6) return;
    sLastX = c.x; sLastZ = c.z; sMode = mode;
    const R = game.q.drawDistance * 1.3 * (mode === 'm' ? 1.8 : 1) * cullScale.k, R2 = R * R;
    for (const s of statics) { const dx = Math.max(s.minX - c.x, 0, c.x - s.maxX), dz = Math.max(s.minZ - c.z, 0, c.z - s.maxZ); s.m.visible = dx * dx + dz * dz < R2; }
  };
  cullStatic(true);
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
  let cullX = 1e9, cullZ = 1e9, cullYaw = 9;
  const _fw = new THREE.Vector3();
  const refreshCull = (force) => {
    const c = game.camera.position; game.camera.getWorldDirection(_fw);
    const fl = Math.hypot(_fw.x, _fw.z), fx = fl > 0.35 ? _fw.x / fl : 0, fz = fl > 0.35 ? _fw.z / fl : 0, yaw = Math.atan2(_fw.x, _fw.z);
    let dy = Math.abs(yaw - cullYaw); if (dy > Math.PI) dy = 2 * Math.PI - dy;
    if (!force && Math.hypot(c.x - cullX, c.z - cullZ) < 25 && dy < 0.35) return;
    cullX = c.x; cullZ = c.z; cullYaw = yaw;
    const R = Math.min(game.q.drawDistance * 1.2 * (game.state.mode === 'menu' ? 1.8 : 1) * cullScale.k, 760 * cullScale.k), R2 = R * R, dirOn = fl > 0.35 && cullScale.k <= 1.5;
    for (const it of culled) {
      let k = 0; const ma = it.m.instanceMatrix.array, ca = it.m.instanceColor?.array;
      for (let i = 0; i < it.N; i++) {
        const dx = it.px[i] - c.x, dz = it.pz[i] - c.z, d2 = dx * dx + dz * dz; if (d2 > R2) continue;
        if (dirOn && d2 > 1600 && dx * fx + dz * fz < 0.17 * Math.sqrt(d2)) continue; // behind / far to the side (80 deg half-angle)
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
    blobs.slice(0, tier === 0 ? 3 : 7).forEach(([x, y, z, r, ry], i) => {
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
  // ---- cypress (tall, narrow, dark) ----
  const cypB = new Batch();
  {
    const CR = seeded(4242), dkc = C(0x244d2e), ltc = C(0x3d7a45);
    cypB.sweep([{ x: 0, y: 0, z: 0, r: 0.2, v: 0 }, { x: 0, y: 1.3, z: 0, r: 0.15, v: 1 }], 5, C(0x5a4630));
    const bl = [[0, 2.4, 0, 0.95, 2.1], [0.05, 4.3, 0, 0.9, 2.0], [0, 6.2, 0.04, 0.72, 1.8], [0, 7.9, 0, 0.5, 1.5], [0, 9.2, 0, 0.28, 1.0]];
    bl.slice(0, tier === 0 ? 4 : 5).forEach(([x, y, z, rx, ry], i) => { const jit = CR() * 6; cypB.blob(x, y, z, rx, ry, rx, (ux, uy, uz) => { const t = Math.min(1, Math.max(0, uy * 0.5 + 0.5 + 0.12 * Math.sin(ux * 7 + jit))); return [dkc[0] + (ltc[0] - dkc[0]) * t, dkc[1] + (ltc[1] - dkc[1]) * t, dkc[2] + (ltc[2] - dkc[2]) * t]; }, tier === 2 && i < 3 ? 1 : 0, jit); });
  }
  makeCullable(inst(cypB.build(), mkMat({ vertexColors: true, roughness: 0.85 }), placed.cyp, (p) => { resetD(); dummy.position.set(p.x, 0, p.z); dummy.rotation.y = (p.x * 3.7 + p.z) % 6.28; dummy.scale.set(p.s, p.s * (0.85 + hv(p, 9) * 0.35), p.s); },
    { cast: true, color: (p, c) => c.setRGB(0.85 + hv(p, 10) * 0.3, 0.9 + hv(p, 11) * 0.2, 0.85 + hv(p, 12) * 0.2) }), placed.cyp);
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
  for (let k = 0; k < 4; k++) benchB.box(-0.92, 0.42, -0.26 + k * 0.13, 0.92, 0.47, -0.16 + k * 0.13, C(0xb3302a));
  benchB.box(-0.92, 0.62, -0.3, 0.92, 0.7, -0.26, C(0xb3302a)); benchB.box(-0.92, 0.78, -0.3, 0.92, 0.86, -0.26, C(0xb3302a)); benchB.box(-0.92, 0.94, -0.3, 0.92, 1.0, -0.26, C(0xb3302a));
  for (const sx of [-0.8, 0.8]) { benchB.box(sx - 0.04, 0, -0.26, sx + 0.04, 0.42, 0.26, C(0x2a2d33)); benchB.box(sx - 0.04, 0.42, -0.31, sx + 0.04, 1.0, -0.26, C(0x2a2d33)); }
  makeCullable(inst(benchB.build(), mkMat({ vertexColors: true, roughness: 0.7 }), placed.benches, (p) => { resetD(); dummy.position.set(p.x, 0, p.z); dummy.rotation.y = p.h; }, { cast: true }), placed.benches);
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
  makeCullable(inst(sigBody.build(), mkMat({ vertexColors: true, roughness: 0.5, metalness: tier ? 0.4 : 0 }), trafficPoles, sigPlace, { cast: true }), trafficPoles);
  const lampQuad = (fx, fz) => { const rx = fz, rz = -fx, b = new Batch(), o = 0.27 + 0.14 + 0.012; b.face([[fx * o - rx * 0.13, 4.5, fz * o - rz * 0.13], [fx * o + rx * 0.13, 4.5, fz * o + rz * 0.13], [fx * o + rx * 0.13, 5.55, fz * o + rz * 0.13], [fx * o - rx * 0.13, 5.55, fz * o - rz * 0.13]], [fx, 0, fz], [1, 1, 1], [[0, 0], [1, 0], [1, 1], [0, 1]]); return b; };
  const sigGeo = (dirs) => { const b = new Batch(); for (const [fx, fz] of dirs) { const q = lampQuad(fx, fz), base = b.n; b.pos.push(...q.pos); b.nor.push(...q.nor); b.col.push(...q.col); b.uv.push(...q.uv); b.idx.push(...q.idx.map((i) => i + base)); b.n += q.n; } return b.build(); };
  const sigMat = () => { const t = sigTex.clone(); t.needsUpdate = true; t.repeat.set(1, 1 / 3); const m = new THREE.MeshBasicMaterial({ map: t, color: 0xffffff }); return m; };
  const sigNS = sigMat(), sigEW = sigMat();
  makeCullable(inst(sigGeo([[0, 1], [0, -1]]), sigNS, trafficPoles, sigPlace), trafficPoles);
  makeCullable(inst(sigGeo([[1, 0], [-1, 0]]), sigEW, trafficPoles, sigPlace), trafficPoles);
  const setSig = (m, state) => { m.map.offset.y = 1 - (state + 1) / 3; }; // state 0 red, 1 amber, 2 green
  let tl = 0;
  const cycleSignals = () => { const ph = tl % 24; setSig(sigNS, ph < 9 ? 2 : ph < 11 ? 1 : 0); setSig(sigEW, ph < 12 ? 0 : ph < 21 ? 2 : ph < 23 ? 1 : 0); };
  cycleSignals();

  // ---------- water + sky ----------
  const waterGeo = new THREE.PlaneGeometry(6000, 6000, 1, 1); waterGeo.rotateX(-Math.PI / 2); waterGeo.translate(0, WATER_Y, 0);
  const shoreTex = new THREE.DataTexture(G.shoreTex.data, G.shoreTex.size, G.shoreTex.size, THREE.RedFormat, THREE.UnsignedByteType);
  shoreTex.minFilter = THREE.LinearFilter; shoreTex.magFilter = THREE.LinearFilter; shoreTex.wrapS = shoreTex.wrapT = THREE.ClampToEdgeWrapping; shoreTex.needsUpdate = true;
  const base = createSky(game, (e) => {
    for (const m of winMats) m.emissiveIntensity = e.windowI;
    lampHeadMat.color.setRGB(0.8 + e.lampOn * 0.2, 0.82 + e.lampOn * 0.1, 0.85 - e.lampOn * 0.2).multiplyScalar(1 + e.lampOn * 3.2);
    poolMat.opacity = e.lampOn * 0.62; haloMat.opacity = e.lampOn * 0.9;
    MAT.glow.color.setScalar(0.5 + e.nightF * 2.8); MAT.bill.color.setScalar(1 + e.nightF * 0.9);
    sigNS.color.setScalar(1 + e.nightF * 0.8); sigEW.color.setScalar(1 + e.nightF * 0.8);
  }, waterGeo, { tex: shoreTex, half: HALF });
  game.events.on('settings:changed', () => { for (const m of mats) m.needsUpdate = true; refreshCull(true); cullStatic(true); });
  refreshCull(true);

  // ferries, boats and the tram (cheap animated visuals)
  const boatMat = mkMat({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide });
  const boats = infra.makeBoats(G, group, { boat: boatMat });
  const tram = infra.makeTram(tramX, tramZ0, tramZ1, group, mkMat({ vertexColors: true, roughness: 0.5 }));

  // ---------- spatial grid ----------
  const GC = 20, GO = -840, GN = 84, NCo = colliders.length;
  const cMinX = new Float32Array(NCo), cMaxX = new Float32Array(NCo), cMinZ = new Float32Array(NCo), cMaxZ = new Float32Array(NCo), cH = new Float32Array(NCo);
  const counts = new Int32Array(GN * GN + 1);
  const gi = (v) => clamp(Math.floor((v - GO) / GC), 0, GN - 1);
  colliders.forEach((c, k) => {
    cMinX[k] = c.minX; cMaxX[k] = c.maxX; cMinZ[k] = c.minZ; cMaxZ[k] = c.maxZ; cH[k] = c.height;
    for (let z = gi(c.minZ); z <= gi(c.maxZ); z++) for (let x = gi(c.minX); x <= gi(c.maxX); x++) counts[z * GN + x + 1]++;
  });
  for (let k = 0; k < GN * GN; k++) counts[k + 1] += counts[k];
  const start = counts.slice(), fillPos = counts.slice(), items = new Int32Array(counts[GN * GN]);
  colliders.forEach((c, k) => { for (let z = gi(c.minZ); z <= gi(c.maxZ); z++) for (let x = gi(c.minX); x <= gi(c.maxX); x++) items[fillPos[z * GN + x]++] = k; });
  const stamp = new Int32Array(NCo); let rayId = 0;

  function collideCircle(x, z, r, out) {
    if (!out) out = { x: 0, z: 0, hit: false, nx: 0, nz: 0 };
    let hit = false, nx = 0, nz = 0;
    for (let pass = 0; pass < 2; pass++) {
      let moved = false;
      const lim = HALF - r;
      if (x < -lim) { x = -lim; nx += 1; moved = true; } else if (x > lim) { x = lim; nx -= 1; moved = true; }
      if (z < -lim) { z = -lim; nz += 1; moved = true; } else if (z > lim) { z = lim; nz -= 1; moved = true; }
      // water: keep the circle at least r metres on the land side of the shore (signed distance field)
      if (G.shoreDist(x, z) < r + 4) {
        const s = G.sdf(x, z);
        if (s < r) {
          const e = 2.5; let gx = G.sdf(x + e, z) - G.sdf(x - e, z), gz = G.sdf(x, z + e) - G.sdf(x, z - e); const gl = Math.hypot(gx, gz);
          if (gl < 1e-3) { gx = -x; gz = -z; const q = Math.hypot(gx, gz) || 1; gx /= q; gz /= q; } else { gx /= gl; gz /= gl; }
          const push = r - s; x += gx * push; z += gz * push; nx += gx; nz += gz; moved = true;
        }
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
  const roads = roadsApi, tmpC = { x: 0, z: 0, hit: false, nx: 0, nz: 0 };
  const lp = { x: 0, z: 0, heading: 0 };
  function randomSidewalkPoint(nx, nz, minD, maxD) {
    for (let k = 0; k < 60; k++) {
      const l = links[Math.floor(Math.random() * links.length)], a = l.a, b = l.b;
      const L = Math.hypot(b.x - a.x, b.z - a.z), dx = (b.x - a.x) / L, dz = (b.z - a.z) / L, t = 14 + Math.random() * (L - 28), s = Math.random() < 0.5 ? -1 : 1;
      const x = a.x + dx * t + -dz * s * SIDEWALK, z = a.z + dz * t + dx * s * SIDEWALK;
      const d = Math.hypot(x - nx, z - nz);
      if (d < minD || d > maxD || Math.abs(x) > HALF - 2 || Math.abs(z) > HALF - 2 || G.sdf(x, z) < 1.5) continue;
      collideCircle(x, z, 0.6, tmpC); if (tmpC.hit) continue;
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
  const isWater = (x, z) => G.isWater(x, z);

  const world = {
    half: HALF, spawnPoint, colliders, roads, landmarks, group,
    getLandmark: (id) => lmMap.get(id) || null,
    collideCircle, raycast, isWater, isRoad: roads.isRoad, randomSidewalkPoint, randomRoadPoint,
    distanceToWater: (x, z) => G.distanceToWater(x, z),
    districtAt: (x, z) => G.districtAt(x, z),
    minimap: renderMinimap(G, links, footprints, greens, RG.ped),
    geography: G, bridges: links.filter((l) => l.kind === 'bridge'),
    ferries: boats.routes, cullScale,
    update(dt) { base.update(dt); tl += dt; swayU.value += dt; cycleSignals(); refreshCull(false); cullStatic(false); boats.update(dt); tram.update(dt); },
    sunLight: base.sun, hemiLight: base.hemi, sky: base,
    get nightFactor() { return base.state.nightFactor; },
  };
  return world;
}
