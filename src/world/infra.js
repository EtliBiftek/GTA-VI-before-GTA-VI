// Bridges (suspension, Galata-style low bridge, Golden-Horn beam bridge), ferry pier, stadium, container docks,
// plus the animated ferries / boats and the nostalgic tram.
import * as THREE from 'three';
import { Batch, C, shade } from './geo.js';
import { QUAY, SW_EDGE, ROAD_HALF, WATER_Y, HALF } from './layout.js';
import { tube, boxC, cone } from './shapes.js';

export function makeInfra(ctx, kit) {
  const { CB, addCollider, rv, vr, vpick, rand, rpick, props, tier } = ctx;
  const HW = SW_EDGE + 0.4;
  const carves = [];

  // ---------------------------------------------------------------- bridges
  function railings(link, s0, s1, c, horiz, step = 3) {
    const pt = (s, w) => (horiz ? [s, c + w] : [c + w, s]);
    for (const w of [-HW + 0.3, HW - 0.3]) {
      for (let s = s0; s <= s1 + 0.01; s += step) {
        const [x, z] = pt(s, w), S = CB(x, z).solid;
        S.box(x - 0.06, 0, z - 0.06, x + 0.06, 1.08, z + 0.06, C(0x3a3f47));
      }
      for (let s = s0; s < s1; s += 40) {
        const e = Math.min(s1, s + 40), [xa, za] = pt(s, w), [xb, zb] = pt(e, w), S = CB((xa + xb) / 2, (za + zb) / 2).solid;
        for (const y of [1.05, 0.55]) S.box(Math.min(xa, xb) - 0.05, y, Math.min(za, zb) - 0.05, Math.max(xa, xb) + 0.05, y + 0.08, Math.max(za, zb) + 0.05, C(0xcfd3d8));
      }
    }
    for (let s = s0 + 20; s < s1 - 10; s += 38) for (const sg of [-1, 1]) {
      const [x, z] = pt(s, sg * (HW - 0.9));
      props.lamps.push(horiz ? { x, z, dx: 0, dz: -sg } : { x, z, dx: -sg, dz: 0 });
    }
  }
  function deck(link, depth = 1.4, s0o = 2, topMat = true) {
    const { a, b, horiz } = link, c = horiz ? a.z : a.x, sa = horiz ? Math.min(a.x, b.x) : Math.min(a.z, b.z), sb = horiz ? Math.max(a.x, b.x) : Math.max(a.z, b.z);
    const s0 = sa + QUAY - s0o, s1 = sb - QUAY + s0o;
    carves.push(horiz ? { x0: sa, x1: sb, z0: c - HW, z1: c + HW } : { x0: c - HW, x1: c + HW, z0: sa, z1: sb });
    for (let s = s0; s < s1; s += 40) {
      const e = Math.min(s1, s + 40), mx = horiz ? (s + e) / 2 : c, mz = horiz ? c : (s + e) / 2, B = CB(mx, mz);
      const bx0 = horiz ? s : c - HW, bx1 = horiz ? e : c + HW, bz0 = horiz ? c - HW : s, bz1 = horiz ? c + HW : e;
      B.solid.box(bx0, -depth, bz0, bx1, -0.04, bz1, C(0x9ea3aa), false);
      B.solid.box(bx0, -depth - 0.4, bz0 + (horiz ? 0.4 : 0), bx1, -depth, bz1 - (horiz ? 0.4 : 0), C(0x6f747b), false);
      if (topMat) B.pav.rect(bx0, bz0, bx1, bz1, 0.012, C(0xcfc9bd));
      // side fascia (kerb beam)
      for (const sg of [-1, 1]) {
        if (horiz) B.solid.box(bx0, -0.04, c + sg * HW - (sg > 0 ? 0.35 : -0.0), bx1, 0.22, c + sg * HW + (sg > 0 ? 0 : 0.35), C(0xb8bcc2), false);
        else B.solid.box(c + sg * HW - (sg > 0 ? 0.35 : -0.0), -0.04, bz0, c + sg * HW + (sg > 0 ? 0 : 0.35), 0.22, bz1, C(0xb8bcc2), false);
      }
    }
    railings(link, s0, s1, c, horiz);
    return { c, s0, s1, sa, sb, horiz };
  }
  const pt3 = (horiz, s, y, c) => (horiz ? [s, y, c] : [c, y, s]);
  function leg(S, sc, cc, horiz, h, col) {
    // tapered tower leg: base 4.4 x 4.0, top 3.0 x 2.8
    const P = (ds, dc, y, k) => { const a = k; return horiz ? [sc + ds * a, y, cc + dc * a] : [cc + dc * a, y, sc + ds * a]; };
    const b = [[-2.2, -2.0], [2.2, -2.0], [2.2, 2.0], [-2.2, 2.0]], t = [[-1.5, -1.4], [1.5, -1.4], [1.5, 1.4], [-1.5, 1.4]];
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      const q = [P(b[k][0], b[k][1], -2, 1), P(b[k2][0], b[k2][1], -2, 1), P(t[k2][0], t[k2][1], h, 1), P(t[k][0], t[k][1], h, 1)];
      const mx = (b[k][0] + b[k2][0]) / 2, mc = (b[k][1] + b[k2][1]) / 2;
      S.face(q, horiz ? [mx, 0, mc] : [mc, 0, mx], k % 2 ? shade(col, 0.9) : col);
    }
    const tp = [P(-1.5, -1.4, h, 1), P(1.5, -1.4, h, 1), P(1.5, 1.4, h, 1), P(-1.5, 1.4, h, 1)];
    S.face(tp, [0, 1, 0], shade(col, 1.05));
  }
  function suspension(link) {
    const d = deck(link, 1.6), { c, horiz } = d, H = 80, off = 14.2;
    const sT0 = d.sa + QUAY - 6, sT1 = d.sb - QUAY + 6, col = C(0xd6dadf);
    for (const sT of [sT0, sT1]) {
      const mid = horiz ? [sT, c] : [c, sT], B = CB(mid[0], mid[1]), S = B.solid;
      for (const sg of [-1, 1]) {
        leg(S, sT, c + sg * off, horiz, H, col);
        const lx = horiz ? sT : c + sg * off, lz = horiz ? c + sg * off : sT;
        addCollider(lx - 2.3, lx + 2.3, lz - 2.1, lz + 2.1, H);
        if (!horiz) { /* collider footprint already symmetric enough */ }
      }
      for (const yb of [44, 66, H - 3]) { // cross beams
        const y1 = yb + (yb > 70 ? 3.4 : 2.6), a = pt3(horiz, sT - 1.5, yb, c - off + 1.2), bq = pt3(horiz, sT + 1.5, y1, c + off - 1.2);
        S.box(Math.min(a[0], bq[0]), yb, Math.min(a[2], bq[2]), Math.max(a[0], bq[0]), y1, Math.max(a[2], bq[2]), col);
      }
      S.box(...(horiz ? [sT - 1.9, H, c - off - 1.9] : [c - off - 1.9, H, sT - 1.9]), ...(horiz ? [sT + 1.9, H + 1.2, c + off + 1.9] : [c + off + 1.9, H + 1.2, sT + 1.9]), shade(col, 0.9));
      S.box(...(horiz ? [sT - 0.1, H + 1.2, c - 0.1] : [c - 0.1, H + 1.2, sT - 0.1]), ...(horiz ? [sT + 0.1, H + 6, c + 0.1] : [c + 0.1, H + 6, sT + 0.1]), C(0xcc2a3a));
      CB(mid[0], mid[1]).glow.box(...(horiz ? [sT - 0.3, H + 6, c - 0.3] : [c - 0.3, H + 6, sT - 0.3]), ...(horiz ? [sT + 0.3, H + 7.2, c + 0.3] : [c + 0.3, H + 7.2, sT + 0.3]), C(0xff2a1a));
    }
    const cab = C(0xe4e7ea), cabY = H - 1.2, yMid = 7.5, n = 28;
    for (const sg of [-1, 1]) {
      const cc = c + sg * off, pts = [];
      for (let k = 0; k <= n; k++) { const t = k / n, s = sT0 + (sT1 - sT0) * t, y = cabY - (cabY - yMid) * (1 - (2 * t - 1) ** 2); pts.push(pt3(horiz, s, y, cc)); }
      for (let k = 0; k < n; k += 7) { const mid = pts[k + 3]; tube(CB(mid[0], mid[2]).solid, pts.slice(k, k + 8), 0.5, tier ? 6 : 5, cab); }
      // hangers
      for (let s = sT0 + 12; s < sT1 - 6; s += 12) {
        const t = (s - sT0) / (sT1 - sT0), y = cabY - (cabY - yMid) * (1 - (2 * t - 1) ** 2), p = pt3(horiz, s, 0, cc - sg * 1.6);
        CB(p[0], p[2]).solid.box(p[0] - 0.09, 1.0, p[2] - 0.09, p[0] + 0.09, y, p[2] + 0.09, C(0xcfd3d8));
      }
      // back stays toward land
      for (const [sT, dirS] of [[sT0, -1], [sT1, 1]]) {
        const top = pt3(horiz, sT, cabY, cc), end = pt3(horiz, sT + dirS * 170, 22, cc), seg = [];
        for (let k = 0; k <= 8; k++) seg.push([top[0] + (end[0] - top[0]) * k / 8, top[1] + (end[1] - top[1]) * k / 8 - 3 * Math.sin(k / 8 * Math.PI), top[2] + (end[2] - top[2]) * k / 8]);
        tube(CB(seg[4][0], seg[4][2]).solid, seg, 0.45, 5, cab);
        const e = pt3(horiz, sT + dirS * 170, 0, cc); CB(e[0], e[2]).solid.box(e[0] - 2, 0, e[2] - 2, e[0] + 2, 22, e[2] + 2, C(0xb8bcc2)); // anchor pylon
        addCollider(e[0] - 2, e[0] + 2, e[2] - 2, e[2] + 2, 22);
      }
    }
    kit.flag(...(horiz ? [d.sa + QUAY + 4, c - HW - 3] : [c - HW - 3, d.sa + QUAY + 4]), 12, horiz ? 0 : 1, horiz ? 1 : 0, 1.2);
  }
  function lowBridge(link) { // Galata-like: pontoons, wide deck, fishermen
    const d = deck(link, 2.0), { c, horiz, s0, s1 } = d;
    for (let s = s0 + 14; s < s1 - 10; s += 24) {
      const p = pt3(horiz, s, 0, c), B = CB(p[0], p[2]);
      B.solid.box(...(horiz ? [s - 3, -3.2, c - 10.5] : [c - 10.5, -3.2, s - 3]), ...(horiz ? [s + 3, -0.4, c + 10.5] : [c + 10.5, -0.4, s + 3]), C(0x7d858f));
      B.solid.box(...(horiz ? [s - 3.3, -2, c - 10.8] : [c - 10.8, -2, s - 3.3]), ...(horiz ? [s + 3.3, -1.5, c + 10.8] : [c + 10.8, -1.5, s + 3.3]), C(0x2f3a45));
    }
    // fishermen along both rails
    for (const sg of [-1, 1]) for (let s = s0 + 6; s < s1 - 4; s += rv(3.2, 5.2)) {
      const p = pt3(horiz, s, 0, c + sg * (HW - 1.2)), S = CB(p[0], p[2]).solid, shirt = C(vpick([0x3a5a8a, 0xa8432f, 0x4a6a4a, 0x8a7a5a, 0xd8d2c4]));
      S.box(p[0] - 0.2, 0.0, p[2] - 0.16, p[0] + 0.2, 0.85, p[2] + 0.16, C(0x2a2d33)); S.box(p[0] - 0.22, 0.85, p[2] - 0.17, p[0] + 0.22, 1.45, p[2] + 0.17, shirt); S.blob(p[0], 1.62, p[2], 0.14, 0.16, 0.14, C(0xd9a47a), 0);
      const o = horiz ? [0, sg] : [sg, 0], rod = [[p[0] + o[0] * 0.3, 1.3, p[2] + o[1] * 0.3], [p[0] + o[0] * 1.8, 2.4, p[2] + o[1] * 1.8], [p[0] + o[0] * 3.6, 3.3, p[2] + o[1] * 3.6]];
      tube(S, rod, 0.03, 3, C(0x30241a));
    }
  }
  function beamBridge(link) { // Golden-Horn beam bridge with piers and two light masts
    const d = deck(link, 1.5), { c, horiz, s0, s1 } = d;
    for (let s = s0 + 20; s < s1 - 8; s += 30) { const p = pt3(horiz, s, 0, c), B = CB(p[0], p[2]); B.solid.box(...(horiz ? [s - 2, -4, c - 6] : [c - 6, -4, s - 2]), ...(horiz ? [s + 2, -1, c + 6] : [c + 6, -4 + 3, s + 2]), C(0x8a9098)); }
    const mid = (s0 + s1) / 2;
    for (const sg of [-1, 1]) { const p = pt3(horiz, mid, 0, c + sg * (HW - 0.6)), B = CB(p[0], p[2]); B.solid.box(p[0] - 0.35, 0, p[2] - 0.35, p[0] + 0.35, 24, p[2] + 0.35, C(0xcfd3d8)); B.glow.box(p[0] - 0.5, 24, p[2] - 0.5, p[0] + 0.5, 24.8, p[2] + 0.5, C(0xffe2a0)); }
  }
  function bridge(link) {
    const k = link.bridge.kind;
    if (k === 'susp') suspension(link); else if (k === 'galata') lowBridge(link); else beamBridge(link);
  }

  // ---------------------------------------------------------------- ferry pier
  /** pier from a start point on land running along (dx,dz) for len metres; returns the land end. */
  function pier(x, z, dx, dz, len, sign) {
    const hw = 3.6, px = -dz, pz = dx;
    carves.push({ x0: Math.min(x, x + dx * len) - hw * Math.abs(pz) - 0.01, x1: Math.max(x, x + dx * len) + hw * Math.abs(pz), z0: Math.min(z, z + dz * len) - hw * Math.abs(px), z1: Math.max(z, z + dz * len) + hw * Math.abs(px) });
    for (let s = 0; s < len; s += 8) {
      const a = [x + dx * s, z + dz * s], b = [x + dx * Math.min(len, s + 8), z + dz * Math.min(len, s + 8)], B = CB(a[0], a[1]);
      boxC(B.solid, [a[0] + px * hw, a[1] + pz * hw], [b[0] - px * hw, b[1] - pz * hw], -0.3, 0.1, C(s % 16 ? 0xa8825a : 0x9a7650));
      if (s % 16 === 0) for (const sg of [-1, 1]) { const q = [a[0] + px * (hw - 0.3) * sg, a[1] + pz * (hw - 0.3) * sg]; B.solid.box(q[0] - 0.12, -1.6, q[1] - 0.12, q[0] + 0.12, 1.1, q[1] + 0.12, C(0xe8e2d6)); }
    }
    for (const sg of [-1, 1]) { const a = [x + px * (hw - 0.3) * sg, z + pz * (hw - 0.3) * sg], b = [x + dx * len + px * (hw - 0.3) * sg, z + dz * len + pz * (hw - 0.3) * sg]; boxC(CB(x + dx * len / 2, z + dz * len / 2).solid, a, b, 1.0, 1.1, C(0xe8e2d6)); }
    for (let s = 14; s < len - 4; s += 24) props.lamps.push({ x: x + dx * s + px * 3.1, z: z + dz * s + pz * 3.1, dx: -px, dz: -pz });
    // ticket / waiting shed at the land end, bollards at the tip
    const sx = x + dx * 7, sz = z + dz * 7, B = CB(sx, sz), S = B.solid;
    const shed = { minX: sx - 5 - 3 * Math.abs(dx), maxX: sx + 5 + 3 * Math.abs(dx), minZ: sz - 5 - 3 * Math.abs(dz), maxZ: sz + 5 + 3 * Math.abs(dz) };
    void shed; void sign;
    const tip = [x + dx * len, z + dz * len]; for (const sg of [-1, 1]) S.cyl(tip[0] + px * sg * 2.5 - dx * 2, 0.1, tip[1] + pz * sg * 2.5 - dz * 2, 0.22, 0.22, 0.5, 6, C(0x2a2d33));
    return [x, z];
  }

  // ---------------------------------------------------------------- stadium
  function stadium(rect, face) {
    const cx = (rect.minX + rect.maxX) / 2, cz = (rect.minZ + rect.maxZ) / 2, ax = Math.min((rect.maxX - rect.minX) / 2, 52), az = Math.min((rect.maxZ - rect.minZ) / 2, 52), T = 15;
    const B = CB(cx, cz), S = B.solid, K = C(0x2f3238), W = C(0xdcdde0), conc = C(0x9fa3a8);
    // outer ring of stands with inner sloped seating
    const ring = [[cx - ax, cz - az, cx + ax, cz - az + T], [cx - ax, cz + az - T, cx + ax, cz + az], [cx - ax, cz - az + T, cx - ax + T, cz + az - T], [cx + ax - T, cz - az + T, cx + ax, cz + az - T]];
    ring.forEach((q, k) => {
      S.box(q[0], 0, q[1], q[2], 17, q[3], k % 2 ? conc : shade(conc, 1.08), false);
      addCollider(q[0], q[2], q[1], q[3], 17, true);
      // sloped seating toward the pitch (alternating dark / light bands)
      const inX = k < 2 ? 0 : (k === 2 ? 1 : -1), inZ = k >= 2 ? 0 : (k === 0 ? 1 : -1);
      for (let r = 0; r < 6; r++) {
        const t0 = r / 6, t1 = (r + 1) / 6, col = r % 2 ? K : W;
        if (k < 2) { const z0 = k === 0 ? q[3] - t0 * T : q[1] + t0 * T, z1 = k === 0 ? q[3] - t1 * T : q[1] + t1 * T, y0 = 3 + t0 * 13, y1 = 3 + t1 * 13; S.face([[q[0], y0, z0], [q[2], y0, z0], [q[2], y1, z1], [q[0], y1, z1]], [0, 1, inZ], col); }
        else { const x0 = k === 2 ? q[2] - t0 * T : q[0] + t0 * T, x1 = k === 2 ? q[2] - t1 * T : q[0] + t1 * T, y0 = 3 + t0 * 13, y1 = 3 + t1 * 13; S.face([[x0, y0, q[1]], [x0, y0, q[3]], [x1, y1, q[3]], [x1, y1, q[1]]], [inX, 1, 0], col); }
      }
    });
    { const rib = C(0x6a7078); // pilasters + dark band on the outer wall
      for (let x = cx - ax + 4; x < cx + ax - 2; x += 8) { S.box(x - 0.5, 0, cz - az - 0.5, x + 0.5, 17, cz - az, rib); S.box(x - 0.5, 0, cz + az, x + 0.5, 17, cz + az + 0.5, rib); }
      for (let z = cz - az + 4; z < cz + az - 2; z += 8) { S.box(cx - ax - 0.5, 0, z - 0.5, cx - ax, 17, z + 0.5, rib); S.box(cx + ax, 0, z - 0.5, cx + ax + 0.5, 17, z + 0.5, rib); }
      S.box(cx - ax - 0.3, 12.5, cz - az - 0.3, cx + ax + 0.3, 14, cz - az, C(0x3a3f47)); S.box(cx - ax - 0.3, 12.5, cz + az, cx + ax + 0.3, 14, cz + az + 0.3, C(0x3a3f47)); }
    S.box(cx - ax - 0.5, 17, cz - az - 0.5, cx + ax + 0.5, 18.2, cz - az + 3, C(0xc5c8cc)); S.box(cx - ax - 0.5, 17, cz + az - 3, cx + ax + 0.5, 18.2, cz + az + 0.5, C(0xc5c8cc));
    S.box(cx - ax - 0.5, 17, cz - az + 3, cx - ax + 3, 18.2, cz + az - 3, C(0xc5c8cc)); S.box(cx + ax - 3, 17, cz - az + 3, cx + ax + 0.5, 18.2, cz + az - 3, C(0xc5c8cc));
    // pitch with mown stripes and lines
    const x0 = cx - ax + T + 1, x1 = cx + ax - T - 1, z0 = cz - az + T + 1, z1 = cz + az - T - 1, ns = 10, dz = (z1 - z0) / ns;
    for (let k = 0; k < ns; k++) B.grass.rect(x0, z0 + k * dz, x1, z0 + (k + 1) * dz, 0.02, C(k % 2 ? 0x3fae4a : 0x36a042));
    const ln = C(0xf2f2f2), p0 = x0 + 2, p1 = x1 - 2, q0 = z0 + 2, q1 = z1 - 2;
    B.marks.rect(p0, q0, p1, q0 + 0.25, 0.03, ln); B.marks.rect(p0, q1 - 0.25, p1, q1, 0.03, ln); B.marks.rect(p0, q0, p0 + 0.25, q1, 0.03, ln); B.marks.rect(p1 - 0.25, q0, p1, q1, 0.03, ln);
    B.marks.rect(p0, (q0 + q1) / 2 - 0.12, p1, (q0 + q1) / 2 + 0.12, 0.03, ln);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = cx + sx * (ax + 2), z = cz + sz * (az + 2);
      S.box(x - 0.5, 0, z - 0.5, x + 0.5, 34, z + 0.5, C(0x555a66)); S.box(x - 2.4, 34, z - 2.4, x + 2.4, 35.4, z + 2.4, C(0xfff4c8)); B.glow.box(x - 2.2, 33.6, z - 2.2, x + 2.2, 34, z + 2.2, C(0xffeeb8));
      addCollider(x - 0.6, x + 0.6, z - 0.6, z + 0.6, 34);
    }
    kit.board(face[0] ? (face[0] > 0 ? cx + ax : cx - ax) + face[0] * 0.2 : cx, 15, face[1] ? (face[1] > 0 ? cz + az : cz - az) + face[1] * 0.2 : cz, 26, 9, face[0], face[1], 15, B);
    return { cx, cz, ax, az };
  }

  // ---------------------------------------------------------------- container docks
  function docks(rect) {
    const w = rect.maxX - rect.minX, d = rect.maxZ - rect.minZ, cx = (rect.minX + rect.maxX) / 2, cz = (rect.minZ + rect.maxZ) / 2, B = CB(cx, cz);
    B.pav.rect(rect.minX - 8, rect.minZ - 8, rect.maxX + 8, rect.maxZ + 8, 0.012, C(0x8a8d92));
    for (let x = rect.minX + 14; x < rect.maxX - 6; x += 22) B.marks.rect(x, rect.minZ + 4, x + 0.3, rect.maxZ - 4, 0.03, C(0xe8c840));
    // container yards north and south, open yard in the middle for missions
    for (const [zA, zB] of [[rect.minZ + 6, rect.minZ + 46], [rect.maxZ - 48, rect.maxZ - 6]]) for (let z = zA + 7; z < zB; z += 16) for (let x = rect.minX + 30; x < rect.maxX - 8; x += 8) if (rand() < 0.78) kit.container(x, z, false, 3);
    // warehouses on the landward edge
    for (let z = rect.minZ + 20; z < rect.maxZ - 40; z += 66) kit.warehouse({ minX: rect.maxX - 30, maxX: rect.maxX - 4, minZ: z, maxZ: z + 46 }, 12, C(rpick([0xc8ccd0, 0xb0b8c0, 0xd0c8b0])));
    // ship-to-shore gantry cranes along the quay (west edge)
    for (const z of [cz - 48, cz + 8, cz + 56]) {
      const x = rect.minX + 4, S = CB(x, z).solid, red = C(0xd8452a), wh = C(0xe8e6e0);
      for (const dz of [-8, 8]) for (const dx of [-1.8, 5]) S.box(x + dx - 0.7, 0, z + dz - 0.7, x + dx + 0.7, 34, z + dz + 0.7, red);
      S.box(x - 3, 34, z - 9.5, x + 7, 36.5, z + 9.5, wh);
      S.box(x - 28, 36, z - 1.4, x + 40, 38, z + 1.4, red); // boom over the water + back reach
      S.box(x - 28, 38, z - 0.3, x - 6, 44, z + 0.3, wh); S.box(x - 6, 36, z - 0.5, x + 0.5, 46, z + 0.5, wh);
      for (const dz of [-8, 8]) { addCollider(x - 2.6, x + 5.8, z + dz - 0.9, z + dz + 0.9, 34); }
      CB(x, z).glow.box(x - 28.5, 37, z - 0.4, x - 28, 38.5, z + 0.4, C(0xff3a2a));
    }
    // bollards + quay-edge fenders
    for (let z = rect.minZ + 4; z < rect.maxZ - 2; z += 14) B.solid.cyl(rect.minX - 6, 0, z, 0.4, 0.4, 0.6, 6, C(0x2a2d33));
    return { cx, cz, w, d };
  }

  // ---------------------------------------------------------------- boats (instanced, slow fixed routes)
  function makeBoats(G, group, mats) {
    const hull = new Batch(), boat = new Batch();
    { // ferry (vapur): 30 m
      const wh = C(0xf2efe6), dk = C(0x20262e), red = C(0xc8301e), pts = [[-15, 3.2], [-15, -3.2], [6, -3.6], [15, 0], [6, 3.6]];
      for (let k = 0; k < pts.length; k++) { const a = pts[k], b = pts[(k + 1) % pts.length]; hull.face([[a[0], -0.9, a[1]], [b[0], -0.9, b[1]], [b[0], 1.7, b[1]], [a[0], 1.7, a[1]]], [(a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2], k === 3 || k === 4 ? dk : dk); }
      hull.face(pts.map((p) => [p[0], 1.7, p[1]]), [0, 1, 0], C(0x8a6f4a));
      for (const [x0, x1, y0, y1, hw] of [[-13, 8, 1.7, 4.2, 3.0], [-10, 5, 4.2, 6.4, 2.6], [-4, 2, 6.4, 8.2, 2.0]]) { hull.box(x0, y0, -hw, x1, y1, hw, wh); hull.box(x0 + 0.2, y0 + 0.9, -hw - 0.05, x1 - 0.2, y0 + 1.7, hw + 0.05, dk, false); }
      hull.cyl(-9, 6.4, 0, 1.1, 0.9, 5.2, 8, red); hull.cyl(-9, 11.3, 0, 1.0, 1.0, 0.8, 8, dk);
      hull.box(8.5, 1.7, -0.1, 9.4, 4.5, 0.1, C(0xd8d2c4));
    }
    { // small boat 9 m
      const wh = C(0xf6f4ee), bl = C(0x2a6fb0), pts = [[-4, 1.5], [-4, -1.5], [2, -1.6], [4.6, 0], [2, 1.6]];
      for (let k = 0; k < pts.length; k++) { const a = pts[k], b = pts[(k + 1) % pts.length]; boat.face([[a[0], -0.5, a[1]], [b[0], -0.5, b[1]], [b[0], 0.9, b[1]], [a[0], 0.9, a[1]]], [(a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2], k % 2 ? wh : bl); }
      boat.face(pts.map((p) => [p[0], 0.9, p[1]]), [0, 1, 0], C(0xc9b690)); boat.box(-2.6, 0.9, -1.0, 0.6, 2.2, 1.0, wh); boat.box(-2.5, 1.4, -1.05, 0.5, 1.9, 1.05, C(0x2b3440), false);
      boat.box(-0.05, 2.2, -0.05, 0.05, 5.5, 0.05, C(0xcfd3d8)); boat.face([[0.1, 2.5, 0], [0.1, 5.3, 0], [3.2, 2.7, 0]], [0, 0, 1], C(0xf2ecdc)); boat.face([[0.1, 2.5, 0], [3.2, 2.7, 0], [0.1, 5.3, 0]], [0, 0, -1], C(0xf2ecdc));
    }
    const defs = [ // [kind, ax, az, bx, bz, speed]
      ['f', 168, 70, 276, 175, 3.6], ['f', 276, 300, 170, 380, 3.4], ['f', 170, 470, 276, 520, 3.8], ['f', 270, 20, 200, 560, 4.2],
      ['b', 225, 90, 235, 480, 6.5], ['b', 190, 560, 90, 760, 7], ['b', 300, 640, 60, 700, 6], ['b', -60, 640, 120, 745, 5.5], ['b', 160, 20, 280, 40, 5], ['b', 210, -120, 270, -320, 6],
    ];
    const routes = defs.map((d) => ({ kind: d[0], a: [d[1], d[2]], b: [d[3], d[4]], speed: d[5], t: rand(), wait: 0 })).filter((r) => {
      const L = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]); r.L = L;
      for (let s = 0; s <= L; s += 6) { const t = s / L, x = r.a[0] + (r.b[0] - r.a[0]) * t, z = r.a[1] + (r.b[1] - r.a[1]) * t; if (!G.waterRender(x, z) || G.fAtW(x, z) < 0.99) return false; }
      return true;
    });
    const nF = routes.filter((r) => r.kind === 'f').length, nB = routes.filter((r) => r.kind === 'b').length;
    const mf = new THREE.InstancedMesh(hull.build(), mats.boat, Math.max(1, nF)), mb = new THREE.InstancedMesh(boat.build(), mats.boat, Math.max(1, nB));
    mf.count = nF; mb.count = nB; mf.frustumCulled = false; mb.frustumCulled = false; group.add(mf, mb);
    const dummy = new THREE.Object3D(); let clock = 0;
    const update = (dt) => {
      clock += dt; let fi = 0, bi = 0;
      for (const r of routes) {
        if (r.wait > 0) r.wait -= dt; else { r.t += dt * r.speed / r.L * (r.dir || 1); if (r.t > 1) { r.t = 1; r.dir = -1; r.wait = 6; } else if (r.t < 0) { r.t = 0; r.dir = 1; r.wait = 6; } }
        const x = r.a[0] + (r.b[0] - r.a[0]) * r.t, z = r.a[1] + (r.b[1] - r.a[1]) * r.t, h = Math.atan2(r.b[0] - r.a[0], r.b[1] - r.a[1]) + ((r.dir || 1) < 0 ? Math.PI : 0);
        dummy.position.set(x, WATER_Y + 0.05 + Math.sin(clock * 0.9 + r.L) * 0.06, z); dummy.rotation.set(Math.sin(clock * 0.7 + r.L) * 0.012, h - Math.PI / 2, Math.sin(clock * 0.8 + r.a[0]) * 0.015); dummy.updateMatrix();
        if (r.kind === 'f') mf.setMatrixAt(fi++, dummy.matrix); else mb.setMatrixAt(bi++, dummy.matrix);
      }
      mf.instanceMatrix.needsUpdate = true; mb.instanceMatrix.needsUpdate = true;
    };
    update(0);
    return { update, routes };
  }

  // ---------------------------------------------------------------- nostalgic tram on the pedestrian avenue
  function makeTram(x, z0, z1, group, mat) {
    const b = new Batch(), red = C(0xc42a1e), cream = C(0xeee4cc), dk = C(0x22262c), roof = C(0x6a6f76);
    const car = (zc, len) => {
      b.box(-1.25, 0.5, zc - len / 2, 1.25, 1.9, zc + len / 2, red); b.box(-1.25, 1.9, zc - len / 2, 1.25, 3.2, zc + len / 2, cream); b.box(-1.3, 3.2, zc - len / 2, 1.3, 3.45, zc + len / 2, roof);
      for (let k = 0; k < Math.floor(len / 1.9); k++) { const zz = zc - len / 2 + 1 + k * 1.9; b.box(-1.28, 2.1, zz, -1.22 + 0.06, 3.0, zz + 1.2, dk, false); b.box(1.22, 2.1, zz, 1.28, 3.0, zz + 1.2, dk, false); }
      b.box(-1.25, 0.5, zc - len / 2 - 0.02, 1.25, 3.2, zc - len / 2 + 0.02, red, false); b.box(-1.25, 0.5, zc + len / 2 - 0.02, 1.25, 3.2, zc + len / 2 + 0.02, red, false);
      b.box(-0.45, 1.2, zc - len / 2 - 0.1, 0.45, 1.6, zc - len / 2 + 0.05, C(0xfff2b0)); b.box(-0.45, 1.2, zc + len / 2 - 0.05, 0.45, 1.6, zc + len / 2 + 0.1, C(0xfff2b0));
      b.box(-0.8, 0.1, zc - len / 2 + 1, 0.8, 0.5, zc - len / 2 + 2.6, dk); b.box(-0.8, 0.1, zc + len / 2 - 2.6, 0.8, 0.5, zc + len / 2 - 1, dk);
      b.box(-0.05, 3.45, zc - 0.5, 0.05, 5.2, zc - 0.4, dk);
    };
    car(0, 11); car(-12, 8.5);
    const mesh = new THREE.Mesh(b.build(), mat); mesh.frustumCulled = false; group.add(mesh);
    const lo = z0 + 22, hi = z1 - 8; let zz = lo, dir = 1, wait = 0;
    return { mesh, update(dt) {
      if (wait > 0) wait -= dt; else { zz += dir * 4.2 * dt; if (zz > hi) { zz = hi; dir = -1; wait = 4; } else if (zz < lo) { zz = lo; dir = 1; wait = 4; } }
      mesh.position.set(x, 0.0, zz); mesh.rotation.y = dir > 0 ? 0 : Math.PI; if (dir < 0) mesh.position.z = zz - 0;
    } };
  }
  function tramLine(x, z0, z1) {
    const B = CB(x, (z0 + z1) / 2), S = B.solid;
    B.pav.rect(x - 12, z0, x + 12, z1, 0.012, C(0xd2c9b8));
    for (let k = -1; k <= 1; k += 2) B.pav.rect(x + k * 11.4, z0, x + k * 11.9, z1, 0.014, C(0xb7ad9a));
    for (const o of [-0.72, 0.72]) S.box(x + o - 0.045, 0.012, z0, x + o + 0.045, 0.1, z1, C(0x55595f));
    for (let z = z0; z < z1; z += 22) { S.box(x - 8, 0, z - 0.1, x - 7.8, 5.6, z + 0.1, C(0x3a3f47)); }
    S.box(x - 0.03, 5.5, z0, x + 0.03, 5.6, z1, C(0x2a2d33));
    S.box(x - 7.9, 5.4, z0, x - 0.05, 5.5, z1, C(0x2a2d33), false);
    void ROAD_HALF; void HALF;
  }

  return { bridge, pier, stadium, docks, makeBoats, makeTram, tramLine, carves };
}
