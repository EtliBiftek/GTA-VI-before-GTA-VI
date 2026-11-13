// Building kit: masonry old-town houses with cumba bays and red tile roofs, mid-rise blocks, glass towers, villas,
// yali (wooden waterfront mansions), warehouses, containers and small decoration helpers. All geometry is routed into
// the spatial chunk (ctx.CB(x, z)) that contains the building centre.
import { C, shade } from './geo.js';
import { FACADE, SHOP, signUV } from './textures.js';
import { clamp } from '../core/utils.js';

export const PASTEL = [0xe3c79a, 0xefe4cc, 0xe6a98c, 0xdba7a0, 0xf0d98a, 0xb8c7d0, 0xc9c3b8, 0xd08a62, 0xb8d6c0, 0xd9b48a, 0xe9d8b4, 0xcf9a88];
export const BLOCKS = [0xe8e0d0, 0xd9cfc0, 0xe7c9a8, 0xcfd6da, 0xe6d2b0, 0xb9c4cc, 0xdcb7a2, 0xc7d4c2, 0xf0e8d8];
export const GLASS = [0x9cc4e4, 0x8aaed6, 0xb4d0e0, 0xc0b0e4, 0x92d8cc, 0x7f96b8, 0xa9b8c8];
export const HOUSE = [0xf5e6d0, 0xf3d0c0, 0xcfe8e0, 0xf6e7a8, 0xd8e0f0, 0xe8c8b0, 0xd0ddc0];
export const YALI = [0xf4efe4, 0xe9d8b8, 0xcfe0e8, 0xe8c6c0, 0xd9e6d0, 0xf0e2a8, 0xb7d3df];
export const ROOFS = [0xb5523b, 0xa8452f, 0xc0694a, 0x9a4a38, 0xb85f40];
export const INDUS = [0xc8ccd0, 0xb0b8c0, 0xd0c8b0, 0x9fb0b8];
export const BOXES = [0xd9482e, 0x2d7fb8, 0xe8b030, 0x3a9a5a, 0x8e5aa8, 0xcfcfcf, 0x1f4e7a];
export const NEON = [C(0x4ff0ff), C(0xff4fd8), C(0xffd27a), C(0xb8ffcf), C(0xffffff)];

export function makeKit(ctx) {
  const { tier, rand, rr, rpick, rv, vpick, vr, CB, addCollider } = ctx;
  const PARA = C(0xc9cacd), GREYS = [C(0xb9bec2), C(0xa9aeb3), C(0xcfd2d4)], DARK = C(0x30333a);

  function facadeBox(B, kind, x0, z0, x1, z1, y0, y1, col, shop = false) {
    const F = FACADE[kind], fb = B.fac(kind), uo = rand();
    const walls = [[[x0, z1], [x1, z1], [0, 0, 1]], [[x1, z0], [x0, z0], [0, 0, -1]], [[x1, z1], [x1, z0], [1, 0, 0]], [[x0, z0], [x0, z1], [-1, 0, 0]]];
    const shopCol = [0.55 + 0.45 * col[0], 0.55 + 0.45 * col[1], 0.55 + 0.45 * col[2]];
    shop = shop && tier > 0;
    for (const [a, b, n] of walls) {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), u0 = uo, u1 = uo + L / F.repW;
      let yb = y0;
      if (shop) {
        yb = Math.min(y1, y0 + SHOP.h);
        B.shop.face([[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], yb, b[1]], [a[0], yb, a[1]]], n, shopCol, [[uo, 0], [uo + L / SHOP.repW, 0], [uo + L / SHOP.repW, 1], [uo, 1]]);
        if (yb >= y1) continue;
      }
      const v0 = yb / F.repH, v1 = y1 / F.repH;
      fb.face([[a[0], yb, a[1]], [b[0], yb, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]], n, col, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
    }
  }
  const roofT = (B) => (tier > 0 ? B.tiles : B.solid);
  const flatT = (B) => (tier > 0 ? B.pav : B.solid);
  function parapet(B, r, H, hgt = 0.55, col = PARA) {
    const t = 0.22, s = B.solid;
    s.box(r.minX, H, r.minZ, r.maxX, H + hgt, r.minZ + t, col); s.box(r.minX, H, r.maxZ - t, r.maxX, H + hgt, r.maxZ, col);
    s.box(r.minX, H, r.minZ + t, r.minX + t, H + hgt, r.maxZ - t, col); s.box(r.maxX - t, H, r.minZ + t, r.maxX, H + hgt, r.maxZ - t, col);
  }
  function roofProps(B, r, H, n = 3, tank = true) {
    const w = r.maxX - r.minX, d = r.maxZ - r.minZ, cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2, s = B.solid;
    if (w < 7 || d < 7) return;
    for (let k = 0; k < n; k++) {
      const x = rv(r.minX + 2.4, r.maxX - 2.4), z = rv(r.minZ + 2.4, r.maxZ - 2.4);
      if (Math.abs(x - cx) < 3.4 && Math.abs(z - cz) < 3.4) continue;
      const hx = rv(0.7, 1.1), hz = rv(0.5, 0.8), hy = rv(0.8, 1.3);
      s.box(x - hx, H, z - hz, x + hx, H + hy, z + hz, vpick(GREYS));
    }
    if (tank && vr() < 0.5) {
      const x = rv(r.minX + 3, r.maxX - 3), z = rv(r.minZ + 3, r.maxZ - 3);
      if (Math.abs(x - cx) > 3.6 || Math.abs(z - cz) > 3.6) { s.box(x - 1, H, z - 1, x + 1, H + 1.0, z + 1, C(0x4a4e55)); s.cyl(x, H + 1.0, z, 1.25, 1.25, 1.9, 8, C(vr() < 0.5 ? 0x7a5a40 : 0x8d98a2)); }
    }
    if (vr() < 0.5) { const x = rv(r.minX + 1.5, r.maxX - 1.5), z = rv(r.minZ + 1.5, r.maxZ - 1.5), hh = rv(2, 4); s.box(x - 0.04, H, z - 0.04, x + 0.04, H + hh, z + 0.04, C(0x555a62)); s.box(x - 0.55, H + hh * 0.8, z - 0.03, x + 0.55, H + hh * 0.8 + 0.05, z + 0.03, C(0x555a62)); }
    if (vr() < 0.4) { const x = rv(r.minX + 1.5, r.maxX - 1.5), z = rv(r.minZ + 1.5, r.maxZ - 1.5); s.cyl(x, H + 0.5, z, 0.45, 0.45, 0.07, 7, C(0xd8dce0)); s.box(x - 0.04, H, z - 0.04, x + 0.04, H + 0.5, z + 0.04, C(0x555a62)); } // satellite dish
  }
  /** hip roof with tile texture */
  function hipRoof(B, r, y, col, ov = 0.45) {
    const x0 = r.minX - ov, x1 = r.maxX + ov, z0 = r.minZ - ov, z1 = r.maxZ + ov, w = x1 - x0, d = z1 - z0, k = 1 / 1.8, T = roofT(B);
    const rise = Math.min(Math.min(w, d) * 0.32, 3.8), zm = (z0 + z1) / 2, xm = (x0 + x1) / 2, cx = xm, cz = zm;
    const A = [x0, y, z0], Bp = [x1, y, z0], Cc = [x1, y, z1], D = [x0, y, z1];
    let R1, R2, fs;
    if (w >= d) { R1 = [x0 + d / 2, y + rise, zm]; R2 = [x1 - d / 2, y + rise, zm]; fs = [[A, Bp, R2, R1], [Bp, Cc, R2], [Cc, D, R1, R2], [D, A, R1]]; }
    else { R1 = [xm, y + rise, z0 + w / 2]; R2 = [xm, y + rise, z1 - w / 2]; fs = [[D, A, R1, R2], [A, Bp, R1], [Bp, Cc, R2, R1], [Cc, D, R2]]; }
    fs.forEach((f, i) => {
      let fx = 0, fz = 0; for (const p of f) { fx += p[0]; fz += p[2]; } fx /= f.length; fz /= f.length;
      T.face(f, [fx - cx, 1.2, fz - cz], i % 2 ? shade(col, 0.88) : col, f.map((p) => [p[0] * k, p[2] * k]));
    });
    return rise;
  }
  function gableRoof(B, x0, z0, x1, z1, y, rise, col, alongX, wall) {
    const xm = (x0 + x1) / 2, zm = (z0 + z1) / 2, k = 1 / 1.8, T = roofT(B), s = B.solid;
    if (alongX) {
      const sl = Math.hypot(zm - z0, rise) * k;
      T.face([[x0, y, z0], [x1, y, z0], [x1, y + rise, zm], [x0, y + rise, zm]], [0, 1, -1], col, [[x0 * k, 0], [x1 * k, 0], [x1 * k, sl], [x0 * k, sl]]);
      T.face([[x1, y, z1], [x0, y, z1], [x0, y + rise, zm], [x1, y + rise, zm]], [0, 1, 1], shade(col, 0.88), [[x1 * k, 0], [x0 * k, 0], [x0 * k, sl], [x1 * k, sl]]);
      s.face([[x0 + 0.4, y, z1 - 0.4], [x0 + 0.4, y, z0 + 0.4], [x0 + 0.4, y + rise * 0.84, zm]], [-1, 0, 0], wall);
      s.face([[x1 - 0.4, y, z0 + 0.4], [x1 - 0.4, y, z1 - 0.4], [x1 - 0.4, y + rise * 0.84, zm]], [1, 0, 0], wall);
    } else {
      const sl = Math.hypot(xm - x0, rise) * k;
      T.face([[x0, y, z0], [x0, y, z1], [xm, y + rise, z1], [xm, y + rise, z0]], [-1, 1, 0], col, [[z0 * k, 0], [z1 * k, 0], [z1 * k, sl], [z0 * k, sl]]);
      T.face([[x1, y, z1], [x1, y, z0], [xm, y + rise, z0], [xm, y + rise, z1]], [1, 1, 0], shade(col, 0.88), [[z1 * k, 0], [z0 * k, 0], [z0 * k, sl], [z1 * k, sl]]);
      s.face([[x1 - 0.4, y, z0 + 0.4], [x0 + 0.4, y, z0 + 0.4], [xm, y + rise * 0.84, z0 + 0.4]], [0, 0, -1], wall);
      s.face([[x0 + 0.4, y, z1 - 0.4], [x1 - 0.4, y, z1 - 0.4], [xm, y + rise * 0.84, z1 - 0.4]], [0, 0, 1], wall);
    }
  }
  /** projecting bay window (cumba) on a wall: base point (x,z), outward normal (nx,nz) */
  function bay(B, x, z, nx, nz, y0, y1, col, w = 2.3, dp = 0.95) {
    const F = FACADE.deco, fb = B.fac('deco'), tx = -nz, tz = nx, uo = rand();
    const p0 = [x - tx * w / 2, z - tz * w / 2], p1 = [x + tx * w / 2, z + tz * w / 2], q0 = [p0[0] + nx * dp, p0[1] + nz * dp], q1 = [p1[0] + nx * dp, p1[1] + nz * dp];
    const c2 = [col[0] * 0.92, col[1] * 0.85, col[2] * 0.78], v0 = y0 / F.repH, v1 = y1 / F.repH;
    const quad = (a, b, n, len) => fb.face([[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]], n, c2, [[uo, v0], [uo + len / F.repW, v0], [uo + len / F.repW, v1], [uo, v1]]);
    quad(q0, q1, [nx, 0, nz], w); quad(p0, q0, [-tx, 0, -tz], dp); quad(q1, p1, [tx, 0, tz], dp);
    const s = B.solid, mn = (a, b) => Math.min(a, b), mx = (a, b) => Math.max(a, b);
    s.box(mn(p0[0], q1[0]) - 0.12, y1, mn(p0[1], q1[1]) - 0.12, mx(p0[0], q1[0]) + 0.12, y1 + 0.16, mx(p0[1], q1[1]) + 0.12, C(0xd8d0c0)); // sill/roof slab
    s.face([[p0[0], y0, p0[1]], [q0[0], y0, q0[1]], [q1[0], y0, q1[1]], [p1[0], y0, p1[1]]], [0, -1, 0], C(0x6b5a48)); // underside
  }
  function cornice(B, r, H, col) {
    const s = B.solid, e = 0.28;
    s.box(r.minX - e, H - 0.45, r.minZ - e, r.maxX + e, H, r.minZ, col); s.box(r.minX - e, H - 0.45, r.maxZ, r.maxX + e, H, r.maxZ + e, col);
    s.box(r.minX - e, H - 0.45, r.minZ, r.minX, H, r.maxZ, col); s.box(r.maxX, H - 0.45, r.minZ, r.maxX + e, H, r.maxZ, col);
  }
  const AWN = [[C(0xd9482e), C(0xf4f0e6)], [C(0x2d7fb8), C(0xf4f0e6)], [C(0x2f8a5a), C(0xf4f0e6)], [C(0xe8b030), C(0xf4f0e6)], [C(0x7a2638), C(0xe8d8c0)]];
  const wallsOf = (r) => [[r.minX, r.maxZ, 1, 0, 0, 1, r.maxX - r.minX], [r.minX, r.minZ, 1, 0, 0, -1, r.maxX - r.minX], [r.maxX, r.minZ, 0, 1, 1, 0, r.maxZ - r.minZ], [r.minX, r.minZ, 0, 1, -1, 0, r.maxZ - r.minZ]];
  const faceKey = (nx, nz) => (nz > 0 ? 'S' : nz < 0 ? 'N' : nx > 0 ? 'E' : 'W'); // S = +z side
  function awnings(B, r, faces) {
    for (const [ax, az, ux, uz, nx, nz, len] of wallsOf(r)) {
      if (len < 8 || (faces && !faces[faceKey(nx, nz)])) continue;
      if (vr() < 0.5) continue;
      const w = rv(3, Math.min(6, len * 0.45)), t0 = rv(1.2, len - w - 1.2), pal = vpick(AWN), proj = 1.2, n = Math.floor(w / 0.6), ya = 3.3, yb = 2.75;
      const base = (t) => [ax + ux * t, az + uz * t];
      for (let k = 0; k < n; k++) {
        const a = base(t0 + k * 0.6), b = base(t0 + (k + 1) * 0.6), col = pal[k % 2];
        B.solid.face([[a[0], ya, a[1]], [b[0], ya, b[1]], [b[0] + nx * proj, yb, b[1] + nz * proj], [a[0] + nx * proj, yb, a[1] + nz * proj]], [nx, 1, nz], col);
      }
    }
  }
  function blades(B, r, H, faces, prob = 0.35) {
    for (const [ax, az, ux, uz, nx, nz, len] of wallsOf(r)) {
      if (len < 9 || vr() > prob || (faces && !faces[faceKey(nx, nz)])) continue;
      const t = rv(2, len - 2), y0 = rv(4.3, Math.max(4.4, Math.min(6.5, H - 2.5)));
      const px = ax + ux * t, pz = az + uz * t, L = 1.4, sh = 1.3, id = Math.floor(rv(0, 31)), [u0, v0, u1, v1] = signUV(id);
      for (const sd of [-1, 1]) {
        const ox = ux * 0.06 * sd, oz = uz * 0.06 * sd;
        B.bill.face([[px + ox, y0, pz + oz], [px + ox + nx * L, y0, pz + oz + nz * L], [px + ox + nx * L, y0 + sh, pz + oz + nz * L], [px + ox, y0 + sh, pz + oz]], [ux * sd, 0, uz * sd], [1, 1, 1], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
      }
      B.solid.box(Math.min(px, px + nx * L) - 0.05, y0 + sh - 0.04, Math.min(pz, pz + nz * L) - 0.05, Math.max(px, px + nx * L) + 0.05, y0 + sh + 0.04, Math.max(pz, pz + nz * L) + 0.05, DARK);
    }
  }
  function board(cx, cy, cz, w, hh, fx, fz, sign, B0) {
    const B = B0 || CB(cx, cz), rx = fz, rz = -fx, [u0, v0, u1, v1] = signUV(sign), px = cx + fx * 0.12, pz = cz + fz * 0.12;
    B.bill.face([[px - rx * w / 2, cy - hh / 2, pz - rz * w / 2], [px + rx * w / 2, cy - hh / 2, pz + rz * w / 2], [px + rx * w / 2, cy + hh / 2, pz + rz * w / 2], [px - rx * w / 2, cy + hh / 2, pz - rz * w / 2]],
      [fx, 0, fz], [1, 1, 1], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
    const hx = Math.abs(rx) * w / 2 + Math.abs(fx) * 0.1, hz = Math.abs(rz) * w / 2 + Math.abs(fz) * 0.1;
    B.solid.box(cx - hx, cy - hh / 2, cz - hz, cx + hx, cy + hh / 2, cz + hz, DARK);
  }
  function signPost(x, z, fx, fz, sign) {
    const B = CB(x, z), rx = fz, rz = -fx;
    for (const s of [-1.6, 1.6]) { const px = x + rx * s, pz = z + rz * s; B.solid.box(px - 0.12, 0, pz - 0.12, px + 0.12, 4.6, pz + 0.12, C(0x3a3d45)); addCollider(px - 0.2, px + 0.2, pz - 0.2, pz + 0.2, 4.6); }
    board(x, 3.5, z, 4.4, 2.2, fx, fz, sign, B);
  }
  /** wall-mounted sign on the street side of a rect (f = outward direction) */
  function wallSign(r, f, H, id, wMax = 10) {
    const along = f[0] !== 0 ? r.maxZ - r.minZ : r.maxX - r.minX;
    const w = Math.min(along * 0.8, wMax), hh = w / 2, cy = clamp(H * 0.72, hh / 2 + 3, Math.max(hh / 2 + 3, H - hh / 2 - 0.5));
    const fx = f[0] < 0 ? r.minX : f[0] > 0 ? r.maxX : (r.minX + r.maxX) / 2, fz = f[1] < 0 ? r.minZ : f[1] > 0 ? r.maxZ : (r.minZ + r.maxZ) / 2;
    board(fx + f[0] * 0.1, cy, fz + f[1] * 0.1, w, hh, f[0], f[1], id);
  }
  const rectC = (r) => [(r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2];

  /** old-town masonry building. o = { faces:{N,S,E,W: street-facing}, roof:'hip'|'flat', bays, shop, cornice } */
  function masonry(r, floors, col, o = {}) {
    const [cx, cz] = rectC(r), B = CB(cx, cz), F = FACADE.deco, H = floors * F.floor, faces = o.faces || { N: true, S: true, E: true, W: true };
    facadeBox(B, 'deco', r.minX, r.minZ, r.maxX, r.maxZ, 0, H, col, o.shop !== false);
    if (o.bays && floors >= 3) {
      for (const [ax, az, ux, uz, nx, nz, len] of wallsOf(r)) {
        if (!faces[faceKey(nx, nz)] || len < 8 || vr() > (tier ? 0.62 : 0.3)) continue;
        const nb = len > 15 ? 2 : 1, f0 = 1 + Math.floor(vr() * 1.4), top = Math.max(f0 + 1, floors - 1 - Math.floor(vr() * 1.5)), yy0 = f0 * F.floor + 0.2, yy1 = Math.min(H - 0.8, (top - (vr() < 0.5 ? 0 : 1)) * F.floor + 2.7);
        if (yy1 - yy0 < 2.4) continue;
        for (let k = 0; k < nb; k++) { const t = len * ((k + 0.5) / nb) + rv(-0.8, 0.8); bay(B, ax + ux * t + nx * 0.02, az + uz * t + nz * 0.02, nx, nz, yy0, yy1, col); }
      }
    }
    let top = H;
    if (tier && o.cornice !== false && floors >= 3) cornice(B, r, H, C(0xded6c6));
    if (o.roof === 'hip') { const rise = hipRoof(B, r, H + 0.1, C(rpick(ROOFS))); top = H + rise; }
    else {
      flatT(B).rect(r.minX, r.minZ, r.maxX, r.maxZ, H, C(0x8d8f96));
      if (tier) { parapet(B, r, H); roofProps(B, r, H, 1 + Math.floor(vr() * 3)); } top = H + 1.6;
    }
    if (o.shop !== false && tier) { awnings(B, r, faces); blades(B, r, H, faces, 0.3); }
    addCollider(r.minX, r.maxX, r.minZ, r.maxZ, top, true);
    return H;
  }
  /** plain mid-rise block (flat roof) in a 'deco' or 'house' facade */
  function block(r, floors, col, kind = 'deco', o = {}) {
    const [cx, cz] = rectC(r), B = CB(cx, cz), F = FACADE[kind], H = floors * F.floor;
    facadeBox(B, kind, r.minX, r.minZ, r.maxX, r.maxZ, 0, H, col, kind === 'deco' && o.shop !== false);
    if (kind === 'deco' && floors >= 4 && o.bays !== false) {
      for (const [ax, az, ux, uz, nx, nz, len] of wallsOf(r)) if (len > 9 && vr() < 0.4 && (!o.faces || o.faces[faceKey(nx, nz)])) bay(B, ax + ux * len * rv(0.3, 0.7), az + uz * len * rv(0.3, 0.7), nx, nz, 2 * F.floor + 0.2, Math.min(H - 1, 4 * F.floor), col);
    }
    flatT(B).rect(r.minX, r.minZ, r.maxX, r.maxZ, H, C(0x8d8f96));
    if (tier) { parapet(B, r, H); roofProps(B, r, H, 2 + Math.floor(vr() * 3)); }
    if (kind === 'deco' && o.shop !== false && tier) { awnings(B, r, o.faces); blades(B, r, H, o.faces, 0.3); }
    if (tier) B.solid.box(r.minX - 0.05, 0, r.minZ - 0.05, r.maxX + 0.05, 0.3, r.maxZ + 0.05, C(0x5d5f66));
    addCollider(r.minX, r.maxX, r.minZ, r.maxZ, H + 1.6, true);
    return H;
  }
  const BUSH = [C(0x2f7a3a), C(0x3f9a4a), C(0x56a850), C(0x2a6a3a)];
  const leafCol = (base) => (x, y, z) => { const j = 0.88 + 0.24 * Math.abs(Math.sin(x * 9.1 + y * 5.3 + z * 7.7)), l = 0.8 + 0.3 * (y * 0.5 + 0.5); return [base[0] * j * l, base[1] * j * l, base[2] * j * l]; };
  function bush(x, z, r) { CB(x, z).furn.blob(x, r * 0.7, z, r, r * 0.8, r, leafCol(vpick(BUSH)), tier > 0 ? 1 : 0); }
  function house(rect, hh, col, roof) {
    const [cx, cz] = rectC(rect), B = CB(cx, cz), x0 = rect.minX, x1 = rect.maxX, z0 = rect.minZ, z1 = rect.maxZ, floors = Math.max(1, Math.round(hh / 3)), H = floors * 3;
    facadeBox(B, 'house', x0, z0, x1, z1, 0, H, col);
    gableRoof(B, x0 - 0.4, z0 - 0.4, x1 + 0.4, z1 + 0.4, H, 2.4, C(roof), (x1 - x0) >= (z1 - z0), col);
    B.solid.box(x0 - 0.06, 0, z0 - 0.06, x1 + 0.06, 0.35, z1 + 0.06, C(0xbdb7ab));
    const cxh = rv(x0 + 1, x1 - 1), czh = rv(z0 + 1, z1 - 1); B.solid.box(cxh - 0.4, H, czh - 0.4, cxh + 0.4, H + 3.0, czh + 0.4, C(0xa86a52));
    for (const [bx, bz] of [[x0 - 0.7, z0 - 0.7], [x1 + 0.7, z0 - 0.7], [x0 - 0.7, z1 + 0.7], [x1 + 0.7, z1 + 0.7]]) if (vr() < 0.35) bush(bx, bz, rv(0.5, 0.85));
    addCollider(x0, x1, z0, z1, H + 2.4, true); return H;
  }
  /** wooden waterfront mansion (yali): long, low, pale boards, wide eaves, boat-house arches, little jetty (jetty side = water side wd) */
  function yali(rect, col, wd) {
    const [cx, cz] = rectC(rect), B = CB(cx, cz), x0 = rect.minX, x1 = rect.maxX, z0 = rect.minZ, z1 = rect.maxZ, H = 3 * 3 + (vr() < 0.5 ? 0 : 0);
    facadeBox(B, 'house', x0, z0, x1, z1, 0.6, H, col);
    B.solid.box(x0 - 0.1, 0, z0 - 0.1, x1 + 0.1, 0.6, z1 + 0.1, C(0x8a8f96));
    const r = { minX: x0 - 0.9, maxX: x1 + 0.9, minZ: z0 - 0.9, maxZ: z1 + 0.9 };
    const rise = hipRoof(B, r, H, C(rpick([0x8f9aa4, 0xa8452f, 0x7d8791])), 0);
    B.solid.box(x0 - 0.9, H - 0.18, z0 - 0.9, x1 + 0.9, H + 0.05, z1 + 0.9, C(0xf0ebe0));
    // water side: arched boat-house openings + jetty
    const alongX = wd[1] !== 0, len = alongX ? x1 - x0 : z1 - z0, n = Math.max(1, Math.floor(len / 6));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, px = alongX ? x0 + len * t : (wd[0] > 0 ? x1 : x0), pz = alongX ? (wd[1] > 0 ? z1 : z0) : z0 + len * t;
      B.solid.box(px - (alongX ? 1.1 : 0.06) , 0.65, pz - (alongX ? 0.06 : 1.1), px + (alongX ? 1.1 : 0.06), 2.5, pz + (alongX ? 0.06 : 1.1), C(0x2b2f36));
    }
    addCollider(x0, x1, z0, z1, H + rise, true); return H;
  }
  function tower(rect, hh, col) {
    const [cx0, cz0] = rectC(rect), B = CB(cx0, cz0), F = FACADE.glass, hp = rr(2, 4) * F.floor, H = Math.round(hh / F.floor) * F.floor, s = B.solid;
    facadeBox(B, 'glass', rect.minX, rect.minZ, rect.maxX, rect.maxZ, 0, hp, shade(col, 1.1), true);
    flatT(B).rect(rect.minX, rect.minZ, rect.maxX, rect.maxZ, hp, C(0x6f7380));
    addCollider(rect.minX, rect.maxX, rect.minZ, rect.maxZ, hp, true);
    const w = rect.maxX - rect.minX, d = rect.maxZ - rect.minZ, ix = w * rr(0.12, 0.2), iz = d * rr(0.12, 0.2);
    const sr = { minX: rect.minX + ix, maxX: rect.maxX - ix, minZ: rect.minZ + iz, maxZ: rect.maxZ - iz };
    facadeBox(B, 'glass', sr.minX, sr.minZ, sr.maxX, sr.maxZ, hp, H, col);
    flatT(B).rect(sr.minX, sr.minZ, sr.maxX, sr.maxZ, H, C(0x5d6170));
    addCollider(sr.minX, sr.maxX, sr.minZ, sr.maxZ, H);
    const cx = (sr.minX + sr.maxX) / 2, cz = (sr.minZ + sr.maxZ) / 2;
    if (rand() < 0.6) { facadeBox(B, 'glass', cx - 4, cz - 4, cx + 4, cz + 4, H, H + 8, col); flatT(B).rect(cx - 4, cz - 4, cx + 4, cz + 4, H + 8, C(0x5d6170)); }
    s.box(cx - 0.3, H + 8, cz - 0.3, cx + 0.3, H + 24, cz + 0.3, C(0xcc2a3a));
    const PC = C(0xcfd3d8);
    s.box(rect.minX - 1.5, 4.2, rect.minZ - 1.5, rect.maxX + 1.5, 4.45, rect.minZ + 0.2, PC); s.box(rect.minX - 1.5, 4.2, rect.maxZ - 0.2, rect.maxX + 1.5, 4.45, rect.maxZ + 1.5, PC);
    s.box(rect.minX - 1.5, 4.2, rect.minZ + 0.2, rect.minX + 0.2, 4.45, rect.maxZ - 0.2, PC); s.box(rect.maxX - 0.2, 4.2, rect.minZ + 0.2, rect.maxX + 1.5, 4.45, rect.maxZ - 0.2, PC);
    s.box(rect.minX - 0.1, 0, rect.minZ - 0.1, rect.maxX + 0.1, 0.45, rect.maxZ + 0.1, C(0x6a6d75));
    parapet(B, rect, hp, 0.5, C(0xaab0b8));
    if (tier) for (const sx of [-1, 1]) for (const sz of [-1, 1]) s.box(sx < 0 ? sr.minX - 0.12 : sr.maxX - 0.6, hp, sz < 0 ? sr.minZ - 0.12 : sr.maxZ - 0.6, sx < 0 ? sr.minX + 0.6 : sr.maxX + 0.12, H, sz < 0 ? sr.minZ + 0.6 : sr.maxZ + 0.12, PC);
    parapet(B, sr, H, 0.7, C(0xb5bbc4));
    const nc = vpick(NEON); B.glow.box(sr.minX - 0.07, H - 1.6, sr.minZ - 0.07, sr.maxX + 0.07, H - 1.25, sr.maxZ + 0.07, nc);
    if (vr() < 0.6) B.glow.box(sr.minX - 0.07, H * 0.55, sr.minZ - 0.07, sr.maxX + 0.07, H * 0.55 + 0.25, sr.maxZ + 0.07, nc);
    s.box(cx - 0.45, H, cz - 0.45, cx + 0.45, H + 2.4, cz + 0.45, C(0x888d96));
    B.glow.box(cx - 0.45, H + 23.4, cz - 0.45, cx + 0.45, H + 24.4, cz + 0.45, C(0xff2a1a));
    return H;
  }
  function warehouse(rect, hh, col) {
    const [cx0, cz0] = rectC(rect), B = CB(cx0, cz0), F = FACADE.industrial, H = Math.max(1, Math.round(hh / F.floor)) * F.floor;
    facadeBox(B, 'industrial', rect.minX, rect.minZ, rect.maxX, rect.maxZ, 0, H, col);
    flatT(B).rect(rect.minX, rect.minZ, rect.maxX, rect.maxZ, H, C(0x80868c));
    parapet(B, rect, H, 0.4, C(0x9aa0a6));
    B.solid.box(rect.minX - 0.05, 0, rect.minZ - 0.05, rect.maxX + 0.05, 0.4, rect.maxZ + 0.05, C(0x6e7279));
    addCollider(rect.minX, rect.maxX, rect.minZ, rect.maxZ, H, true); return H;
  }
  // Containers are collected here and drawn by city.js as instanced meshes (procedural boxes, swapped for the downloaded
  // CC0 container models once loaded). Same random draws as before, so the world layout is unchanged.
  const containerList = [];
  function container(x, z, alongZ, nMax = 3) {
    const hx = alongZ ? 1.3 : 6.1, hz = alongZ ? 6.1 : 1.3, n = 1 + Math.floor(rand() * nMax), col = C(rpick(BOXES));
    for (let k = 0; k < n; k++) containerList.push({ x, y: k * 2.6, z, rot: alongZ ? 0 : Math.PI / 2, col: shade(col, 0.85 + rand() * 0.3) });
    addCollider(x - hx, x + hx, z - hz, z + hz, n * 2.6, true);
  }
  /** Turkish flag on a pole (two-sided, red field + white crescent) facing direction (fx, fz) */
  function flag(x, z, h, fx = 1, fz = 0, s = 1) {
    const B = CB(x, z), RED = C(0xe30a17), WH = C(0xffffff), w = 3 * s, hh = 2 * s, rx = fz, rz = -fx, S = B.solid;
    S.box(x - 0.07, 0, z - 0.07, x + 0.07, h, z + 0.07, C(0xc8ccd0));
    const P = (a, b, o = 0) => [x + rx * a + fx * o, h - hh - 0.2 + b, z + rz * a + fz * o];
    const fq = (pts, c) => { S.face(pts, [fx, 0, fz], c); S.face(pts.slice().reverse(), [-fx, 0, -fz], c); };
    fq([P(0.1, 0), P(w, 0), P(w, hh), P(0.1, hh)], RED);
    const disc = (a, b, r, c, o) => { const pts = []; for (let k = 0; k < 8; k++) { const t = k / 8 * 6.283; pts.push(P(a + Math.cos(t) * r, b + Math.sin(t) * r, o)); } for (let k = 1; k < 7; k++) fq([pts[0], pts[k], pts[k + 1]], c); };
    disc(0.1 + w * 0.36, hh / 2, hh * 0.3, WH, 0.012); disc(0.1 + w * 0.36 + hh * 0.07, hh / 2, hh * 0.24, RED, 0.024);
    S.box(x - 0.1, h, z - 0.1, x + 0.1, h + 0.2, z + 0.1, C(0xffd23a));
  }
  return { facadeBox, parapet, roofProps, hipRoof, gableRoof, bay, cornice, awnings, blades, board, signPost, wallSign, masonry, block, house, yali, tower, containerList, warehouse, container, bush, flag, leafCol, roofT, flatT, rectC };
}
