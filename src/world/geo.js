// Tiny geometry batcher: flat-shaded faces with vertex colours (+ optional UVs) merged into one BufferGeometry.
import * as THREE from 'three';

const _c = new THREE.Color();
const _cache = new Map();
const BLOB = {};
/** hex -> [r,g,b] in linear working space (what vertex colours expect). */
export function C(hex) {
  let v = _cache.get(hex);
  if (!v) { _c.setHex(hex); v = [_c.r, _c.g, _c.b]; _cache.set(hex, v); }
  return v;
}
export function shade(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }

export class Batch {
  constructor(wuv = 0) { this.pos = []; this.nor = []; this.col = []; this.uv = []; this.idx = []; this.n = 0; this.wuv = wuv; }

  _v(p, nx, ny, nz, c, uv) {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(nx, ny, nz);
    this.col.push(c[0], c[1], c[2]);
    if (uv) this.uv.push(uv[0], uv[1]); else if (this.wuv) this.uv.push(p[0] / this.wuv, p[2] / this.wuv); else this.uv.push(0, 0);
    return this.n++;
  }

  /**
   * Polygon (3 or 4 points, convex) with a flat normal oriented toward `hint`.
   * `c` is [r,g,b] or an array of per-vertex [r,g,b]. `uvs` optional, same length as pts.
   */
  face(pts, hint, c, uvs) {
    let p = pts, uv = uvs, cc = c;
    const perV = Array.isArray(c[0]);
    const ax = p[1][0] - p[0][0], ay = p[1][1] - p[0][1], az = p[1][2] - p[0][2];
    const bx = p[2][0] - p[0][0], by = p[2][1] - p[0][1], bz = p[2][2] - p[0][2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    if (nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) {
      p = p.slice().reverse(); if (uv) uv = uv.slice().reverse(); if (perV) cc = c.slice().reverse();
      nx = -nx; ny = -ny; nz = -nz;
    }
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const base = this.n;
    for (let i = 0; i < p.length; i++) this._v(p[i], nx, ny, nz, perV ? cc[i] : cc, uv ? uv[i] : null);
    for (let i = 1; i < p.length - 1; i++) this.idx.push(base, base + i, base + i + 1);
  }

  /** Up-facing rectangle on the XZ plane. */
  rect(x0, z0, x1, z1, y, c) {
    this.face([[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]], [0, 1, 0], c);
  }

  /** Axis-aligned box: four sides + top (no bottom). */
  box(x0, y0, z0, x1, y1, z1, c, top = true) {
    this.face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], c);
    this.face([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], c);
    this.face([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], c);
    this.face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], c);
    if (top) this.rect(x0, z0, x1, z1, y1, c);
  }

  /** Four-sided pyramid (umbrellas / roofs). */
  pyramid(cx, cz, y, hx, hz, h, c) {
    const A = [cx - hx, y, cz - hz], B = [cx + hx, y, cz - hz], Cc = [cx + hx, y, cz + hz], D = [cx - hx, y, cz + hz], T = [cx, y + h, cz];
    this.face([A, B, T], [0, 1, -1], c); this.face([B, Cc, T], [1, 1, 0], c);
    this.face([Cc, D, T], [0, 1, 1], c); this.face([D, A, T], [-1, 1, 0], c);
  }

  /** Gable roof over rect; ridge along X if alongX else along Z. */
  gable(x0, z0, x1, z1, y, rise, c, alongX) {
    const xm = (x0 + x1) / 2, zm = (z0 + z1) / 2;
    if (alongX) {
      const R1 = [x0, y + rise, zm], R2 = [x1, y + rise, zm];
      this.face([[x0, y, z0], [x1, y, z0], R2, R1], [0, 1, -1], c);
      this.face([[x1, y, z1], [x0, y, z1], R1, R2], [0, 1, 1], shade(c, 0.85));
      this.face([[x0, y, z1], [x0, y, z0], R1], [-1, 0, 0], shade(c, 0.9));
      this.face([[x1, y, z0], [x1, y, z1], R2], [1, 0, 0], shade(c, 0.9));
    } else {
      const R1 = [xm, y + rise, z0], R2 = [xm, y + rise, z1];
      this.face([[x0, y, z0], [x0, y, z1], R2, R1], [-1, 1, 0], c);
      this.face([[x1, y, z1], [x1, y, z0], R1, R2], [1, 1, 0], shade(c, 0.85));
      this.face([[x1, y, z0], [x0, y, z0], R1], [0, 0, -1], shade(c, 0.9));
      this.face([[x0, y, z1], [x1, y, z1], R2], [0, 0, 1], shade(c, 0.9));
    }
  }

  /** Append another BufferGeometry (non-indexed or indexed), transformed by matrix, tinted by colour. */
  addGeometry(g, m, c) {
    const p = g.attributes.position, idx = g.index;
    const v = new THREE.Vector3();
    const tri = (a, b, d) => {
      const pa = v.fromBufferAttribute(p, a).applyMatrix4(m).toArray();
      const pb = v.fromBufferAttribute(p, b).applyMatrix4(m).toArray();
      const pd = v.fromBufferAttribute(p, d).applyMatrix4(m).toArray();
      const cx = (pa[0] + pb[0] + pd[0]) / 3, cy = (pa[1] + pb[1] + pd[1]) / 3, cz = (pa[2] + pb[2] + pd[2]) / 3;
      const m0 = m.elements;
      // outward hint: from the object's origin through the triangle centroid
      this.face([pa, pb, pd], [cx - m0[12], cy - m0[13], cz - m0[14]], c);
    };
    const n = idx ? idx.count : p.count;
    for (let i = 0; i < n; i += 3) idx ? tri(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)) : tri(i, i + 1, i + 2);
  }


  /** Smooth-shaded ellipsoid blob (radial normals); colFn(ux,uy,uz) -> [r,g,b] gets the unit-sphere direction. */
  blob(cx, cy, cz, rx, ry, rz, colFn, detail = 1, rot = 0) {
    const g = BLOB[detail] || (BLOB[detail] = new THREE.IcosahedronGeometry(1, detail));
    const p = g.attributes.position, cs = Math.cos(rot), sn = Math.sin(rot);
    const base = this.n;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const l = Math.hypot(x, y, z); x /= l; y /= l; z /= l;
      const c = typeof colFn === 'function' ? colFn(x, y, z) : colFn;
      const px = x * rx, py = y * ry, pz = z * rz;
      let nx = x / rx, ny = y / ry, nz = z / rz; const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
      this._v([cx + px * cs + pz * sn, cy + py, cz - px * sn + pz * cs], nx * cs + nz * sn, ny, -nx * sn + nz * cs, c, null);
    }
    for (let i = 0; i < p.count; i += 3) this.idx.push(base + i, base + i + 1, base + i + 2);
  }

  /** Smooth open tube along rings [{x,y,z,r}] (horizontal circles). uv: u around (0..uRep), v = ring v. */
  sweep(rings, sides, colFn, uRep = 1) {
    const base = this.n;
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i], nx = i + 1 < rings.length ? rings[i + 1] : r, pv = i > 0 ? rings[i - 1] : r;
      const tx = nx.x - pv.x, ty = nx.y - pv.y, tz = nx.z - pv.z;
      for (let k = 0; k <= sides; k++) {
        const a = k / sides * Math.PI * 2, cx = Math.cos(a), sz = Math.sin(a);
        // normal tilted by taper
        const slope = (pv.r - nx.r) / (Math.hypot(tx, ty, tz) || 1);
        const c = typeof colFn === 'function' ? colFn(i, k) : colFn;
        const nl = Math.hypot(cx, slope, sz);
        this._v([r.x + cx * r.r, r.y, r.z + sz * r.r], cx / nl, slope / nl, sz / nl, c, [k / sides * uRep, r.v ?? i]);
      }
    }
    const rw = sides + 1;
    for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < sides; k++) {
      const a = base + i * rw + k, b = a + 1, c = a + rw, d = c + 1;
      this.idx.push(a, c, b, b, c, d);
    }
  }

  /** Ribbon strip along points [[x,y,z],...] with half-widths w[i]; side vector s=[sx,sy,sz]. Double sided (normal up). */
  strip(pts, ws, side, c, uRange = [0, 1], vs = null, nrm = [0, 1, 0]) {
    const base = this.n;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], w = ws[i], cc = Array.isArray(c[0]) ? c[i] : c;
      const v = vs ? vs[i] : i / (pts.length - 1);
      this._v([p[0] - side[0] * w, p[1] - side[1] * w, p[2] - side[2] * w], nrm[0], nrm[1], nrm[2], cc, [uRange[0], v]);
      this._v([p[0] + side[0] * w, p[1] + side[1] * w, p[2] + side[2] * w], nrm[0], nrm[1], nrm[2], cc, [uRange[1], v]);
    }
    for (let i = 0; i < pts.length - 1; i++) { const a = base + i * 2; this.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }

  /** Vertical cylinder with smooth normals. */
  cyl(cx, y0, cz, r0, r1, h, sides, c, cap = true) {
    const rings = [{ x: cx, y: y0, z: cz, r: r0, v: 0 }, { x: cx, y: y0 + h, z: cz, r: r1, v: 1 }];
    this.sweep(rings, sides, c);
    if (cap) { const pts = []; for (let k = 0; k < sides; k++) { const a = k / sides * Math.PI * 2; pts.push([cx + Math.cos(a) * r1, y0 + h, cz + Math.sin(a) * r1]); } for (let i = 1; i < sides - 1; i++) this.face([pts[0], pts[i], pts[i + 1]], [0, 1, 0], c); }
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.uv), 2));
    g.setIndex(new THREE.BufferAttribute(this.n > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx), 1));
    g.computeBoundingSphere();
    return g;
  }
}
