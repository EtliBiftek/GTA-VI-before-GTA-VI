// Landmark architecture: Ottoman mosques (central dome, semi-domes, minarets), basilica-style domed church-mosque,
// Galata-style stone tower, waterfront palace with clock tower, covered bazaar, Taksim monument, railway terminal,
// Maiden's-Tower-style islet tower.
import { C, shade } from './geo.js';
import { dome, cone, minaret, boxC } from './shapes.js';
import { FACADE } from './textures.js';

export function makeMonuments(ctx, kit) {
  const { CB, addCollider, rv, vr, vpick, props } = ctx;
  const STONE = 0xe9dfc8, TRIM = 0xcfc3a8, LEAD = 0x7b8898, LEAD2 = 0x6c7a8c;
  const dim = (r) => ({ cx: (r.minX + r.maxX) / 2, cz: (r.minZ + r.maxZ) / 2, w: r.maxX - r.minX, d: r.maxZ - r.minZ });

  /** Ottoman mosque. rect = free area, face = unit vector toward the street (entrance side). opts: minarets (2|4|6), stone */
  function mosque(rect, face, o = {}) {
    const { cx, cz, w, d } = dim(rect), [fx, fz] = face, ux = Math.abs(fz), uz = Math.abs(fx);
    const Wd = fz !== 0 ? w : d, D = fz !== 0 ? d : w;
    const M = (u, v) => [cx + u * ux + v * fx, cz + u * uz + v * fz];
    const B = CB(cx, cz), S = B.solid, stone = C(o.stone ?? STONE), trim = C(TRIM), lead = C(o.lead ?? LEAD);
    const s = Math.min(Wd * (o.courtyard === false ? 0.8 : 0.64), D * (o.courtyard === false ? 0.8 : 0.6));
    const v0 = -D / 2 + 1.5, v1 = v0 + s, H = Math.max(5, s * 0.26), R = s * 0.3;
    const bx = (u0, v0_, u1, v1_, y0, y1, col, top = true) => boxC(S, M(u0, v0_), M(u1, v1_), y0, y1, col, top);
    bx(-s / 2, v0, s / 2, v1, 0, H, stone);
    bx(-s / 2 - 0.4, v0 - 0.4, s / 2 + 0.4, v1 + 0.4, 0, 0.8, trim);
    bx(-s / 2 - 0.5, v0 - 0.5, s / 2 + 0.5, v1 + 0.5, H - 0.5, H + 0.2, trim);
    addCollider(Math.min(...[M(-s / 2, v0)[0], M(s / 2, v1)[0]]), Math.max(M(-s / 2, v0)[0], M(s / 2, v1)[0]), Math.min(M(-s / 2, v0)[1], M(s / 2, v1)[1]), Math.max(M(-s / 2, v0)[1], M(s / 2, v1)[1]), H + R * 1.4, true);
    // windows (dark panes) on the four walls
    const dark = C(0x2b3440), nW = Math.max(2, Math.floor(s / 6));
    for (let k = 0; k < nW; k++) {
      const t = -s / 2 + s * (k + 0.5) / nW;
      for (const yy of [H * 0.2, H * 0.58]) {
        bx(t - 0.8, v1 + 0.0, t + 0.8, v1 + 0.12, yy, yy + H * 0.26, dark); bx(t - 0.8, v0 - 0.12, t + 0.8, v0, yy, yy + H * 0.26, dark);
        const tv = v0 + s * (k + 0.5) / nW;
        bx(-s / 2 - 0.12, tv - 0.8, -s / 2, tv + 0.8, yy, yy + H * 0.26, dark); bx(s / 2, tv - 0.8, s / 2 + 0.12, tv + 0.8, yy, yy + H * 0.26, dark);
      }
    }
    // dome group
    const mc = M(0, (v0 + v1) / 2), dh = R * 0.22;
    S.cyl(mc[0], H, mc[1], R * 1.04, R * 1.04, dh, 14, shade(stone, 0.96));
    dome(S, mc[0], H + dh, mc[1], R, R * 0.95, lead, 14, 6);
    S.box(mc[0] - 0.12, H + dh + R * 0.95 - 0.2, mc[1] - 0.12, mc[0] + 0.12, H + dh + R * 0.95 + 2.2, mc[1] + 0.12, C(0xe8c060));
    const sd = R * 0.66, so = R * 0.98;
    for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const p = M(du * so, (v0 + v1) / 2 + dv * so); dome(S, p[0], H - 0.2, p[1], sd, sd * 0.85, lead, 12, 4);
    }
    for (const [du, dv] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const p = M(du * s * 0.36, (v0 + v1) / 2 + dv * s * 0.36); dome(S, p[0], H, p[1], R * 0.34, R * 0.3, lead, 10, 3);
    }
    // courtyard with arcade + small domes + fountain
    if (o.courtyard !== false && D - s > 12) {
      const cv0 = v1 + 1.5, cv1 = D / 2 - 1, cw = Math.min(Wd - 4, s * 1.05) / 2, ah = 4.2;
      const sides = [[-cw, cv0, -cw + 3, cv1], [cw - 3, cv0, cw, cv1], [-cw, cv1 - 3, cw, cv1]];
      for (const q of sides) {
        bx(q[0], q[1], q[2], q[3], 0, ah, stone);
        const a = M(q[0], q[1]), b = M(q[2], q[3]);
        addCollider(Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1]), ah, false);
      }
      const nd = Math.max(2, Math.floor((cv1 - cv0) / 6));
      for (let k = 0; k < nd; k++) { const t = cv0 + (cv1 - cv0) * (k + 0.5) / nd; for (const u of [-cw + 1.5, cw - 1.5]) { const p = M(u, t); dome(S, p[0], ah, p[1], 2.1, 1.7, lead, 8, 3); } }
      const nu = Math.max(2, Math.floor(cw * 2 / 6));
      for (let k = 0; k < nu; k++) { const p = M(-cw + 2 * cw * (k + 0.5) / nu, cv1 - 1.5); dome(S, p[0], ah, p[1], 2.1, 1.7, lead, 8, 3); }
      const f = M(0, (cv0 + cv1) / 2 - 1); S.cyl(f[0], 0, f[1], 3.2, 3.2, 1.3, 8, C(0xd8d3c8)); S.cyl(f[0], 1.3, f[1], 2.6, 2.6, 0.2, 8, C(0x6fb4c8)); S.cyl(f[0], 1.3, f[1], 0.4, 0.4, 3, 6, C(0xd8d3c8));
    }
    // minarets
    const nm = o.minarets ?? 2, mh = o.mh ?? Math.max(26, s * 0.62), mpos = [];
    const mu = s / 2 + 2.4;
    if (nm >= 2) mpos.push(M(-mu, v1 + 1.5), M(mu, v1 + 1.5));
    if (nm >= 4) mpos.push(M(-mu, v0 - 1.5), M(mu, v0 - 1.5));
    if (nm >= 6 && o.courtyard !== false) { const cv1 = D / 2 - 3, cw = Math.min(Wd - 4, s * 1.05) / 2; mpos.push(M(-cw - 1.5, cv1), M(cw + 1.5, cv1)); }
    for (const p of mpos) { minaret(S, p[0], p[1], mh, { twin: nm >= 6, lead: LEAD2, stone: o.stone ?? 0xf0e8d8 }); addCollider(p[0] - 1.9, p[0] + 1.9, p[1] - 1.9, p[1] + 1.9, mh); }
    return { cx, cz, s };
  }

  /** big ancient-basilica-style domed building with buttresses and 4 slim minarets (ochre / terracotta) */
  function basilica(rect, face) {
    const { cx, cz, w, d } = dim(rect), [fx, fz] = face, ux = Math.abs(fz), uz = Math.abs(fx);
    const Wd = fz !== 0 ? w : d, D = fz !== 0 ? d : w;
    const M = (u, v) => [cx + u * ux + v * fx, cz + u * uz + v * fz];
    const B = CB(cx, cz), S = B.solid, wall = C(0xcf9f7a), wall2 = C(0xb98a68), lead = C(0x8d8f94);
    const bw = Math.min(Wd * 0.64, 60), bl = Math.min(D * 0.7, 70), H = 20, R = bw * 0.3;
    const bx = (u0, v0, u1, v1, y0, y1, col, top = true) => boxC(S, M(u0, v0), M(u1, v1), y0, y1, col, top);
    bx(-bw / 2, -bl / 2, bw / 2, bl / 2, 0, H, wall);
    // buttress piers
    for (const u of [-bw / 2 - 2.5, bw / 2]) for (let k = 0; k < 4; k++) { const v = -bl / 2 + 3 + k * (bl - 8) / 3; bx(u, v - 1.4, u + 2.5, v + 1.4, 0, H * 0.78, wall2); }
    for (const v of [-bl / 2 - 2.5, bl / 2]) for (let k = 0; k < 3; k++) { const u = -bw / 2 + 5 + k * (bw - 10) / 2; bx(u - 1.4, v, u + 1.4, v + 2.5, 0, H * 0.7, wall2); }
    // lower roofs and apses
    bx(-bw / 2 - 0.3, -bl / 2 - 0.3, bw / 2 + 0.3, bl / 2 + 0.3, H, H + 0.6, shade(wall, 0.9));
    const ctr = M(0, 0);
    S.cyl(ctr[0], H + 0.6, ctr[1], R * 1.05, R * 1.05, 5, 16, wall2);
    for (let k = 0; k < 16; k++) { const a = k / 16 * 6.283, px = ctr[0] + Math.cos(a) * R * 1.06, pz = ctr[1] + Math.sin(a) * R * 1.06; S.box(px - 0.5, H + 2, pz - 0.5, px + 0.5, H + 4.2, pz + 0.5, C(0x2b3440)); }
    dome(S, ctr[0], H + 5.6, ctr[1], R * 1.05, R * 0.8, lead, 16, 6);
    for (const dv of [-1, 1]) { const p = M(0, dv * bl * 0.34); dome(S, p[0], H + 0.4, p[1], R * 0.78, R * 0.62, lead, 12, 4); }
    for (const [du, dv] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { const p = M(du * bw * 0.36, dv * bl * 0.32); dome(S, p[0], H + 0.2, p[1], R * 0.4, R * 0.3, lead, 8, 3); }
    const a = M(-bw / 2 - 2.5, -bl / 2 - 2.5), b = M(bw / 2 + 2.5, bl / 2 + 2.5);
    addCollider(Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1]), H + 8, true);
    for (const [du, dv] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const p = M(du * (bw / 2 + 5), dv * (bl / 2 + 4)); minaret(S, p[0], p[1], 46, { r: 0.95, stone: 0xe6c9a8, lead: 0x77828f }); addCollider(p[0] - 1.9, p[0] + 1.9, p[1] - 1.9, p[1] + 1.9, 46);
    }
    // arched windows on the front
    for (let k = 0; k < 7; k++) { const u = -bw / 2 + 4 + k * (bw - 8) / 6; bx(u - 0.9, bl / 2, u + 0.9, bl / 2 + 0.12, 4, 9, C(0x2b3440)); bx(u - 0.9, bl / 2, u + 0.9, bl / 2 + 0.12, 12, 17, C(0x2b3440)); }
  }

  /** Galata-style cylindrical stone tower with a conical roof, on a small paved plaza. */
  function galataTower(cx, cz) {
    const B = CB(cx, cz), S = B.solid, stone = C(0xcbb998), dark = C(0x3a3a40), r = 4.8;
    B.pav.rect(cx - 17, cz - 17, cx + 17, cz + 17, 0.02, C(0xd8cfc0));
    S.cyl(cx, 0, cz, r + 1.6, r + 1.2, 3, 16, shade(stone, 0.9));
    S.sweep([{ x: cx, y: 3, z: cz, r: r + 0.6, v: 0 }, { x: cx, y: 29, z: cz, r: r, v: 1 }, { x: cx, y: 36, z: cz, r: r, v: 2 }], 20, (i, k) => shade(stone, k % 2 ? 0.95 : 1.02));
    for (let k = 0; k < 4; k++) { const y = 8 + k * 6.5; S.sweep([{ x: cx, y, z: cz, r: r + 0.18, v: 0 }, { x: cx, y: y + 0.4, z: cz, r: r + 0.18, v: 1 }], 20, shade(stone, 0.75)); }
    for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283, c = Math.cos(a), s = Math.sin(a); S.box(cx + c * (r + 0.05) - 0.3, 14 + (k % 3) * 5, cz + s * (r + 0.05) - 0.3, cx + c * (r + 0.05) + 0.3, 16.2 + (k % 3) * 5, cz + s * (r + 0.05) + 0.3, dark); }
    S.cyl(cx, 36, cz, r + 1.7, r + 1.9, 0.9, 20, shade(stone, 0.8));
    S.sweep([{ x: cx, y: 36.9, z: cz, r: r + 1.1, v: 0 }, { x: cx, y: 41.5, z: cz, r: r + 1.1, v: 1 }], 20, stone);
    for (let k = 0; k < 16; k++) { const a = k / 16 * 6.283, c = Math.cos(a), s = Math.sin(a); S.box(cx + c * (r + 1.12) - 0.35, 38, cz + s * (r + 1.12) - 0.35, cx + c * (r + 1.12) + 0.35, 40.6, cz + s * (r + 1.12) + 0.35, dark); }
    S.cyl(cx, 41.5, cz, r + 2.1, r + 2.1, 0.5, 20, shade(stone, 0.8));
    S.sweep([{ x: cx, y: 42, z: cz, r: r + 1.9, v: 0 }, { x: cx, y: 46, z: cz, r: r + 0.6, v: 1 }, { x: cx, y: 54, z: cz, r: 0.12, v: 2 }], 20, C(0x7c8794));
    S.box(cx - 0.06, 54, cz - 0.06, cx + 0.06, 57, cz + 0.06, C(0xe8c060));
    addCollider(cx - r - 1.6, cx + r + 1.6, cz - r - 1.6, cz + r + 1.6, 40, true);
    for (const [dx, dz] of [[-10, -10], [10, -10], [-10, 10], [10, 10]]) props.benches.push({ x: cx + dx * 1.2, z: cz + dz * 1.2, h: Math.atan2(-dx, -dz), free: true });
  }

  /** waterfront palace (Dolmabahce-like): long cream facade facing `face`, central portico, clock tower in the garden. */
  function palace(rect, face) {
    const { cx, cz, w, d } = dim(rect), [fx, fz] = face, ux = Math.abs(fz), uz = Math.abs(fx);
    const Wd = fz !== 0 ? w : d, D = fz !== 0 ? d : w; // u = along facade, v = toward the water
    const M = (u, v) => [cx + u * ux + v * fx, cz + u * uz + v * fz];
    const B = CB(cx, cz), S = B.solid, depth = Math.min(D * 0.5, 22), len = Math.min(Wd, 104), H = 17, col = [0.96, 0.93, 0.86];
    const vb = D / 2 - 1.5, va = vb - depth; // building spans v in [va, vb]
    const Bd = B.fac('deco'), F = FACADE.deco;
    // main body in facade texture (4 walls), cornice and low roof
    const walls = [[M(-len / 2, vb), M(len / 2, vb)], [M(len / 2, va), M(-len / 2, va)], [M(len / 2, vb), M(len / 2, va)], [M(-len / 2, va), M(-len / 2, vb)]];
    const nrm = [[fx, fz], [-fx, -fz], [ux, uz], [-ux, -uz]];
    walls.forEach(([a, b], i) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); Bd.face([[a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], H, b[1]], [a[0], H, a[1]]], [nrm[i][0], 0, nrm[i][1]], col, [[0, 0], [L / F.repW, 0], [L / F.repW, H / F.repH], [0, H / F.repH]]); });
    boxC(S, M(-len / 2 - 0.5, va - 0.5), M(len / 2 + 0.5, vb + 0.5), H, H + 0.7, C(0xe6dccb));
    boxC(S, M(-len / 2 + 1, va + 1), M(len / 2 - 1, vb - 1), H + 0.7, H + 1.6, C(0x8a5a4a));
    const a = M(-len / 2, va), b = M(len / 2, vb); addCollider(Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1]), H + 1.6, true);
    // central portico with columns + pediment block, two wing pavilions
    boxC(S, M(-9, vb), M(9, vb + 4), 0, 0.6, C(0xd9d0be));
    for (let k = 0; k < 6; k++) { const u = -7.5 + k * 3; boxC(S, M(u - 0.4, vb + 3), M(u + 0.4, vb + 3.8), 0, H - 2, C(0xf2ede2)); }
    boxC(S, M(-9, vb + 2.6), M(9, vb + 4.2), H - 2, H, C(0xeee6d4));
    boxC(S, M(-9.5, vb - 0.5), M(9.5, vb + 4.4), H, H + 2.6, C(0xe6dccb));
    for (const sgn of [-1, 1]) { const u = sgn * (len / 2 - 8); boxC(S, M(u - 7, vb - 0.4), M(u + 7, vb + 1.2), 0, H + 1.4, C(0xf0e8d8)); boxC(S, M(u - 7.4, vb - 0.6), M(u + 7.4, vb + 1.4), H + 1.4, H + 2.2, C(0xe0d6c4)); }
    // sea wall steps and gates
    boxC(S, M(-12, vb + 4), M(12, vb + 6), 0, 0.3, C(0xcdc5b4));
    // garden: lawn is added by the caller; fountain + cypress hints
    const fp = M(0, va - 8); S.cyl(fp[0], 0, fp[1], 4, 4, 0.8, 12, C(0xd0cbbe)); S.cyl(fp[0], 0.8, fp[1], 3.3, 3.3, 0.15, 12, C(0x6fb4c8));
    // clock tower in the garden (north-west corner of the rect)
    const tp = M(-len / 2 + 5, va - 11), tw = 3.2, th = 26, tc = C(0xd9cdb4);
    boxC(S, [tp[0] - tw, tp[1] - tw], [tp[0] + tw, tp[1] + tw], 0, 6, shade(tc, 0.9));
    boxC(S, [tp[0] - tw + 0.5, tp[1] - tw + 0.5], [tp[0] + tw - 0.5, tp[1] + tw - 0.5], 6, th, tc);
    boxC(S, [tp[0] - tw - 0.3, tp[1] - tw - 0.3], [tp[0] + tw + 0.3, tp[1] + tw + 0.3], th - 5, th - 4.6, shade(tc, 0.8));
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { // clock faces
      const cxp = tp[0] + dx * (tw - 0.4), czp = tp[1] + dz * (tw - 0.4), rx = dz, rz = -dx;
      B.solid.face([[cxp - rx * 1.5 + dx * 0.2, th - 4, czp - rz * 1.5 + dz * 0.2], [cxp + rx * 1.5 + dx * 0.2, th - 4, czp + rz * 1.5 + dz * 0.2], [cxp + rx * 1.5 + dx * 0.2, th - 1, czp + rz * 1.5 + dz * 0.2], [cxp - rx * 1.5 + dx * 0.2, th - 1, czp - rz * 1.5 + dz * 0.2]], [dx, 0, dz], C(0xf6f2e8));
      B.solid.face([[cxp - rx * 0.1 + dx * 0.25, th - 2.5, czp - rz * 0.1 + dz * 0.25], [cxp + rx * 0.1 + dx * 0.25, th - 2.5, czp + rz * 0.1 + dz * 0.25], [cxp + rx * 0.1 + dx * 0.25, th - 1.3, czp + rz * 0.1 + dz * 0.25], [cxp - rx * 0.1 + dx * 0.25, th - 1.3, czp - rz * 0.1 + dz * 0.25]], [dx, 0, dz], C(0x222222));
    }
    cone(S, tp[0], th, tp[1], tw + 0.6, 7, C(0x6c7a8c), 4); S.box(tp[0] - 0.05, th + 7, tp[1] - 0.05, tp[0] + 0.05, th + 9, tp[1] + 0.05, C(0xe8c060));
    addCollider(tp[0] - tw, tp[0] + tw, tp[1] - tw, tp[1] + tw, th, true);
    return { M, va, vb };
  }

  /** covered bazaar: long cream block with many small lead domes and arched gates */
  function bazaar(rect) {
    const { cx, cz, w, d } = dim(rect), B = CB(cx, cz), S = B.solid, F = FACADE.deco, H = 9, r = { minX: rect.minX + 2, maxX: rect.maxX - 2, minZ: rect.minZ + 2, maxZ: rect.maxZ - 2 };
    kit.facadeBox(B, 'deco', r.minX, r.minZ, r.maxX, r.maxZ, 0, H, [0.95, 0.86, 0.7], false);
    kit.flatT(B).rect(r.minX, r.minZ, r.maxX, r.maxZ, H, C(0x8d8f96)); kit.parapet(B, r, H, 0.6, C(0xd9cdb0));
    const nx = Math.floor((r.maxX - r.minX) / 7), nz = Math.max(2, Math.floor((r.maxZ - r.minZ) / 8));
    for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
      const x = r.minX + (a + 0.5) * (r.maxX - r.minX) / nx, z = r.minZ + (b + 0.5) * (r.maxZ - r.minZ) / nz;
      dome(S, x, H, z, 2.7, 1.9, C(LEAD), 8, 3); S.box(x - 0.08, H + 1.8, z - 0.08, x + 0.08, H + 2.5, z + 0.08, C(0xe8c060));
    }
    S.box(r.minX - 0.2, H - 0.45, r.minZ - 0.2, r.maxX + 0.2, H, r.maxZ + 0.2, C(0xd8cdb4), false);
    for (const x of [r.minX + (r.maxX - r.minX) * 0.25, r.minX + (r.maxX - r.minX) * 0.75]) for (const [z, s] of [[r.maxZ, 1], [r.minZ, -1]]) {
      S.box(x - 3.2, 0, z + (s > 0 ? 0 : -0.5), x + 3.2, 7, z + (s > 0 ? 0.5 : 0), C(0xd9cdb0)); S.box(x - 2, 0, z + (s > 0 ? 0.5 : -0.6), x + 2, 5.4, z + (s > 0 ? 0.6 : -0.5), C(0x2a1e18));
      dome(S, x, 7, z + s * 0.3, 3.3, 1.8, C(LEAD2), 8, 3);
    }
    addCollider(r.minX, r.maxX, r.minZ, r.maxZ, H + 2.5, true);
    // bazaar roof signage
    const [u0, v0, u1, v1] = [0, 0, 1, 1]; void u0; void v0; void u1; void v1; void F; void d; void w;
  }

  /** Taksim-style square: monument with stone blocks, fountains, flag poles. rect = whole square. */
  function taksim(rect) {
    const { cx, cz, w, d } = dim(rect), B = CB(cx, cz), S = B.solid, st = C(0xd6cdb8), dk = C(0x9a917f);
    B.pav.rect(rect.minX, rect.minZ, rect.maxX, rect.maxZ, 0.014, C(0xd9d0c0));
    for (let k = 0; k < 8; k++) B.pav.rect(cx - 30 + k * 7.5 - 0.15, rect.minZ + 2, cx - 30 + k * 7.5 + 0.15, rect.maxZ - 2, 0.016, C(0xbdb4a2)); // paving bands
    S.box(cx - 9, 0, cz - 6, cx + 9, 1.0, cz + 6, dk); S.box(cx - 7.5, 1, cz - 4.8, cx + 7.5, 2.0, cz + 4.8, st);
    for (const sx of [-1, 1]) { S.box(cx + sx * 4.5 - 2, 2, cz - 1.6, cx + sx * 4.5 + 2, 8.5, cz + 1.6, st); S.box(cx + sx * 4.5 - 1.6, 8.5, cz - 1.3, cx + sx * 4.5 + 1.6, 9, cz + 1.3, dk); }
    S.box(cx - 1.3, 2, cz - 1.0, cx + 1.3, 15, cz + 1.0, st); S.box(cx - 1.6, 15, cz - 1.2, cx + 1.6, 15.5, cz + 1.2, dk);
    for (const [dx, dz, hh] of [[-6.5, 3.4, 4], [6.5, 3.4, 4], [-6.5, -3.4, 4], [6.5, -3.4, 4], [0, 3.4, 5]]) { S.box(cx + dx - 0.5, 2, cz + dz - 0.5, cx + dx + 0.5, 2 + hh * 0.55, cz + dz + 0.5, dk); S.blob(cx + dx, 2 + hh * 0.55 + 0.5, cz + dz, 0.45, 0.6, 0.35, C(0x7a705f), 0); }
    addCollider(cx - 9, cx + 9, cz - 6, cz + 6, 15.5, true);
    for (const sx of [-1, 1]) { const fxp = cx + sx * 34; S.cyl(fxp, 0, cz - 20, 5, 5, 0.7, 14, st); S.cyl(fxp, 0.7, cz - 20, 4.4, 4.4, 0.15, 14, C(0x6fb4c8)); S.cyl(fxp, 0.7, cz - 20, 0.4, 0.4, 2.4, 6, st); addCollider(fxp - 5, fxp + 5, cz - 25, cz - 15, 0.9);
      S.cyl(fxp, 0, cz + 20, 5, 5, 0.7, 14, st); S.cyl(fxp, 0.7, cz + 20, 4.4, 4.4, 0.15, 14, C(0x6fb4c8)); S.cyl(fxp, 0.7, cz + 20, 0.4, 0.4, 2.4, 6, st); addCollider(fxp - 5, fxp + 5, cz + 15, cz + 25, 0.9); }
    for (const [dx, dz] of [[-22, 0], [22, 0], [0, -20], [0, 20]]) kit.flag(cx + dx, cz + dz, 11, 0, 1, 1.4), addCollider(cx + dx - 0.2, cx + dx + 0.2, cz + dz - 0.2, cz + dz + 0.2, 11);
    void w; void d;
  }

  /** railway terminal (Haydarpasa-like): U-shaped stone building with corner towers, facing the water (face). */
  function station(rect, face) {
    const { cx, cz, w, d } = dim(rect), [fx, fz] = face, ux = Math.abs(fz), uz = Math.abs(fx);
    const Wd = fz !== 0 ? w : d, D = fz !== 0 ? d : w;
    const M = (u, v) => [cx + u * ux + v * fx, cz + u * uz + v * fz];
    const B = CB(cx, cz), S = B.solid, Bd = B.fac('deco'), F = FACADE.deco, H = 17, col = [0.86, 0.8, 0.68], roofC = C(0x56606b);
    const len = Math.min(Wd - 2, 96), wing = Math.min(D - 14, 26), main = 18;
    const wall = (a, b, n, hh) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); Bd.face([[a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], hh, b[1]], [a[0], hh, a[1]]], [n[0], 0, n[1]], col, [[0, 0], [L / F.repW, 0], [L / F.repW, hh / F.repH], [0, hh / F.repH]]); };
    const block = (u0, v0, u1, v1, hh, rise) => {
      const a = M(u0, v0), b = M(u1, v0), c2 = M(u1, v1), e = M(u0, v1);
      wall(e, c2, [fx, fz], hh); wall(b, a, [-fx, -fz], hh); wall(c2, b, [ux, uz], hh); wall(a, e, [-ux, -uz], hh);
      const r = { minX: Math.min(a[0], c2[0]), maxX: Math.max(a[0], c2[0]), minZ: Math.min(a[1], c2[1]), maxZ: Math.max(a[1], c2[1]) };
      kit.hipRoof(B, r, hh, roofC, 0.5); kit.hipRoof; void rise;
      addCollider(r.minX, r.maxX, r.minZ, r.maxZ, hh + 4, true);
    };
    // main block at the back (v from -D/2+2 .. -D/2+2+main), wings toward the water (+v)
    const vb0 = -D / 2 + 3, vb1 = vb0 + main;
    block(-len / 2, vb0, len / 2, vb1, H, 4);
    block(-len / 2, vb1, -len / 2 + 20, Math.min(D / 2 - 2, vb0 + wing), H - 1, 4);
    block(len / 2 - 20, vb1, len / 2, Math.min(D / 2 - 2, vb0 + wing), H - 1, 4);
    // corner towers with conical roofs + centre clock gable
    for (const [u, v] of [[-len / 2 + 4, Math.min(D / 2 - 2, vb0 + wing)], [len / 2 - 4, Math.min(D / 2 - 2, vb0 + wing)], [-len / 2 + 2, vb0 + 2], [len / 2 - 2, vb0 + 2]]) {
      const p = M(u, v); S.cyl(p[0], H - 1, p[1], 4.2, 4.2, 7, 12, C(0xd4c8b0)); cone(S, p[0], H + 6, p[1], 5.2, 11, C(0x4f5964), 12);
    }
    const p = M(0, vb1 - 1); boxC(S, [p[0] - 5, p[1] - 5], [p[0] + 5, p[1] + 5], H, H + 8, C(0xd4c8b0)); cone(S, p[0], H + 8, p[1], 6.5, 7, C(0x4f5964), 4);
    // tracks behind the building
    const tp = M(0, -D / 2 + 1.2);
    void tp;
  }

  /** Maiden's-Tower-style islet: stone base disc + whitewashed round tower with a dome, flag. */
  function kizKulesi(cx, cz) {
    const B = CB(cx, cz), S = B.solid, st = C(0xb9ae98), wh = C(0xece3cf);
    S.cyl(cx, -1.4, cz, 11, 10.4, 1.7, 14, st); S.cyl(cx, 0.28, cz, 10.4, 10.2, 0.2, 14, C(0xc9c0ac));
    S.cyl(cx, 0.4, cz, 6.4, 6.0, 4.2, 14, wh);
    for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283; S.box(cx + Math.cos(a) * 6.25 - 0.3, 2, cz + Math.sin(a) * 6.25 - 0.3, cx + Math.cos(a) * 6.25 + 0.3, 3.6, cz + Math.sin(a) * 6.25 + 0.3, C(0x2b3440)); }
    S.cyl(cx, 4.6, cz, 6.8, 6.8, 0.5, 14, st);
    S.cyl(cx, 5.1, cz, 4.6, 4.2, 7, 14, wh);
    for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283 + 0.3; S.box(cx + Math.cos(a) * 4.5 - 0.3, 8, cz + Math.sin(a) * 4.5 - 0.3, cx + Math.cos(a) * 4.5 + 0.3, 10.2, cz + Math.sin(a) * 4.5 + 0.3, C(0x2b3440)); }
    S.cyl(cx, 12.1, cz, 5.3, 5.3, 0.45, 14, st);
    dome(S, cx, 12.5, cz, 5.0, 3.4, C(0x7b8898), 14, 5);
    S.cyl(cx, 15.7, cz, 1.2, 1.1, 1.7, 10, wh); cone(S, cx, 17.4, cz, 1.5, 2.6, C(0x7b8898), 10);
    S.box(cx - 0.05, 20, cz - 0.05, cx + 0.05, 21.2, cz + 0.05, C(0xe8c060));
    addCollider(cx - 10, cx + 10, cz - 10, cz + 10, 20, false);
    kit.flag(cx + 6.4, cz, 14, 1, 0, 0.9);
  }

  return { mosque, basilica, galataTower, palace, bazaar, taksim, station, kizKulesi };
}
