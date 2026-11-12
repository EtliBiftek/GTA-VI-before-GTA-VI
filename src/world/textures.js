// Procedural canvas textures: ground (asphalt / pavers / grass / sand), facades with normal + roughness/metal + emissive
// maps, storefronts, roof tiles, vegetation atlas, decals, sign atlas, water normals, glow.
// Quality tier t: 0 = low (small, no normal/rough maps), 1 = medium, 2 = high.
import * as THREE from 'three';
import { seeded } from '../core/utils.js';

export const TIER = (q) => (q === 'low' ? 0 : q === 'medium' ? 1 : 2);
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const release = (t) => { // free the 2D canvas backing store once the GPU has its copy (big memory saver)
  t.onUpdate = () => { const c = t.image; if (c && c.width > 1 && c.getContext) { c.width = 1; c.height = 1; } t.onUpdate = null; };
};
function tex(canvas, { srgb = false, aniso = 1, wrap = true, keep = false } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (!keep) release(t);
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping; else t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

// ---- periodic value noise ----
function makeNoise(seed) {
  const R = seeded(seed), L = {};
  const lat = (n) => L[n] || (L[n] = Float32Array.from({ length: n * n }, () => R()));
  const s = (n, u, v) => {
    const a = lat(n); u = (u - Math.floor(u)) * n; v = (v - Math.floor(v)) * n;
    const xi = Math.floor(u), yi = Math.floor(v), fx = u - xi, fy = v - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const x0 = xi % n, x1 = (xi + 1) % n, y0 = yi % n, y1 = (yi + 1) % n;
    return lerp(lerp(a[y0 * n + x0], a[y0 * n + x1], sx), lerp(a[y1 * n + x0], a[y1 * n + x1], sx), sy);
  };
  const fbm = (u, v, base = 4, oct = 4) => { let a = 0, amp = 0.5, tot = 0, f = base; for (let o = 0; o < oct; o++) { a += amp * s(f, u, v); tot += amp; f *= 2; amp *= 0.5; } return a / tot; };
  return { s, fbm };
}

/** height canvas (grey) -> tangent-space normal map canvas (wraps). */
function normalFrom(hc, strength) {
  const W = hc.width, H = hc.height, src = hc.getContext('2d').getImageData(0, 0, W, H).data;
  const out = mk(W, H), og = out.getContext('2d'), o = og.createImageData(W, H), d = o.data;
  for (let y = 0; y < H; y++) {
    const yu = ((y - 1 + H) % H) * W, yd = ((y + 1) % H) * W, yc = y * W;
    for (let x = 0; x < W; x++) {
      const xl = (x - 1 + W) % W, xr = (x + 1) % W;
      const dx = (src[(yc + xl) * 4] - src[(yc + xr) * 4]) / 255 * strength, dy = (src[(yd + x) * 4] - src[(yu + x) * 4]) / 255 * strength;
      const l = 1 / Math.sqrt(dx * dx + dy * dy + 1), k = (yc + x) * 4;
      d[k] = (dx * l * 0.5 + 0.5) * 255; d[k + 1] = (dy * l * 0.5 + 0.5) * 255; d[k + 2] = (l * 0.5 + 0.5) * 255; d[k + 3] = 255;
    }
  }
  og.putImageData(o, 0, 0);
  return out;
}

// ---- layered painter: colour + height + (rough,metal) + emissive canvases painted together ----
class Layers {
  constructor(w, h, t, baseRough = 0.85) {
    this.w = w; this.h = h; this.t = t;
    this.c = mk(w, h); this.cg = this.c.getContext('2d');
    this.e = mk(w, h); this.eg = this.e.getContext('2d'); this.eg.fillStyle = '#000'; this.eg.fillRect(0, 0, w, h);
    if (t >= 1) {
      this.h_ = mk(w, h); this.hg = this.h_.getContext('2d'); this.hg.fillStyle = '#808080'; this.hg.fillRect(0, 0, w, h);
      this.r = mk(w, h); this.rg = this.r.getContext('2d'); this.rg.fillStyle = `rgb(255,${Math.round(baseRough * 255)},0)`; this.rg.fillRect(0, 0, w, h);
    }
  }
  p(x, y, w, h, o) {
    if (o.c !== undefined) { this.cg.fillStyle = o.c; this.cg.fillRect(x, y, w, h); }
    if (this.hg && o.h !== undefined) { const g = Math.round(o.h * 255); this.hg.fillStyle = `rgb(${g},${g},${g})`; this.hg.fillRect(x, y, w, h); }
    if (this.rg && (o.r !== undefined || o.m !== undefined)) { this.rg.fillStyle = `rgb(255,${Math.round((o.r ?? 0.85) * 255)},${Math.round((o.m ?? 0) * 255)})`; this.rg.fillRect(x, y, w, h); }
    if (o.e !== undefined) { this.eg.fillStyle = o.e; this.eg.fillRect(x, y, w, h); }
  }
  grad(x, y, w, h, x2, y2, stops, alpha = 1) { // colour-only gradient overlay
    const g = this.cg.createLinearGradient(x, y, x2, y2); for (const [t, c] of stops) g.addColorStop(t, c);
    this.cg.globalAlpha = alpha; this.cg.fillStyle = g; this.cg.fillRect(x, y, w, h); this.cg.globalAlpha = 1;
  }
  /** noise grain over colour + height */
  grain(a = 0.07, seed = 5) {
    const S = 128, g = mk(S, S), gc = g.getContext('2d'), im = gc.createImageData(S, S), R = seeded(seed);
    for (let i = 0; i < S * S; i++) { const v = R() * 255; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
    gc.putImageData(im, 0, 0);
    this.cg.save(); this.cg.globalAlpha = a; this.cg.globalCompositeOperation = 'overlay'; this.cg.fillStyle = this.cg.createPattern(g, 'repeat'); this.cg.fillRect(0, 0, this.w, this.h); this.cg.restore();
    if (this.hg) { this.hg.save(); this.hg.globalAlpha = a * 0.3; this.hg.globalCompositeOperation = 'overlay'; this.hg.fillStyle = this.hg.createPattern(g, 'repeat'); this.hg.fillRect(0, 0, this.w, this.h); this.hg.restore(); }
  }
  maps({ aniso = 1, normal = 2 } = {}) {
    const r = { map: tex(this.c, { srgb: true, aniso }), emissiveMap: tex(this.e, { srgb: true, aniso }) };
    if (this.t >= 1) { r.normalMap = tex(normalFrom(this.h_, normal), { aniso }); r.roughnessMap = tex(this.r, { aniso }); }
    return r;
  }
}

// =====================================================================================================
// GROUND
// =====================================================================================================
/** Asphalt, 16 m per tile. */
export function makeAsphalt(t, aniso) {
  const S = [256, 512, 1024][t], R = seeded(401), N = makeNoise(401), k = S / 1024;
  const cc = mk(S, S), cg = cc.getContext('2d'), hc = mk(S, S), hg = hc.getContext('2d'), rc = mk(S, S), rg = rc.getContext('2d');
  const ci = cg.createImageData(S, S), hi = hg.createImageData(S, S), ri = rg.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, g = R(), low = N.fbm(u, v, 3, 4), mid = N.fbm(u, v, 24, 2), stone = R() < 0.035 ? 1 : 0, i = (y * S + x) * 4;
    const lum = 50 + (low - 0.5) * 34 + (g - 0.5) * 36 + (mid - 0.5) * 16 + stone * 30;
    ci.data[i] = lum * 0.99; ci.data[i + 1] = lum; ci.data[i + 2] = lum * 1.05; ci.data[i + 3] = 255;
    const h = 128 + (g - 0.5) * 70 + (mid - 0.5) * 24 + stone * 40;
    hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = h; hi.data[i + 3] = 255;
    ri.data[i] = 255; ri.data[i + 1] = (0.9 - (g - 0.5) * 0.12 - stone * 0.1) * 255; ri.data[i + 2] = 0; ri.data[i + 3] = 255;
  }
  cg.putImageData(ci, 0, 0); hg.putImageData(hi, 0, 0); rg.putImageData(ri, 0, 0);
  const wrap = (fn) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { for (const c of [cg, hg, rg]) { c.save(); c.translate(ox, oy); } fn(); for (const c of [cg, hg, rg]) c.restore(); } };
  const poly = (pts) => (c) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill(); };
  // tar / repair patches
  for (let i = 0; i < 7; i++) {
    const cx = R() * S, cy = R() * S, w = (0.06 + R() * 0.16) * S, h = (0.03 + R() * 0.1) * S, a = R() * Math.PI, n = 7, pts = [];
    for (let j = 0; j < n; j++) { const q = j / n * Math.PI * 2, rx = Math.cos(q) * w * (0.9 + R() * 0.2), ry = Math.sin(q) * h * (0.9 + R() * 0.2); pts.push([cx + rx * Math.cos(a) - ry * Math.sin(a), cy + rx * Math.sin(a) + ry * Math.cos(a)]); }
    const f = poly(pts);
    wrap(() => { cg.fillStyle = 'rgba(20,21,25,0.55)'; f(cg); hg.fillStyle = 'rgba(150,150,150,0.6)'; f(hg); rg.fillStyle = 'rgba(255,165,0,0.6)'; f(rg); });
  }
  // cracks
  const crack = (x, y, a, steps, w) => {
    const pts = [[x, y]];
    for (let s = 0; s < steps; s++) { a += (R() - 0.5) * 0.9; x += Math.cos(a) * (0.008 + R() * 0.014) * S; y += Math.sin(a) * (0.008 + R() * 0.014) * S; pts.push([x, y]); if (R() < 0.12 && w > 0.6 * k) crack(x, y, a + (R() < 0.5 ? 1 : -1) * (0.6 + R() * 0.6), Math.floor(steps * 0.4), w * 0.6); }
    wrap(() => {
      for (const [c, col, lw] of [[cg, 'rgba(6,6,8,0.85)', w], [hg, 'rgba(30,30,30,0.9)', w * 1.8], [rg, 'rgba(255,240,0,0.9)', w * 1.5]]) {
        c.strokeStyle = col; c.lineWidth = lw; c.lineJoin = 'round'; c.beginPath(); pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py))); c.stroke();
      }
    });
  };
  for (let i = 0; i < 9; i++) crack(R() * S, R() * S, R() * 6.28, 18 + Math.floor(R() * 24), (1 + R() * 0.8) * Math.max(0.6, k));
  const out = { map: tex(cc, { srgb: true, aniso }) };
  if (t >= 1) { out.normalMap = tex(normalFrom(hc, 3.2), { aniso }); out.roughnessMap = tex(rc, { aniso }); }
  return out;
}

/** Paving slabs: 4 x 4 slabs of 1 m per 4 m tile. */
export function makePavers(t, aniso) {
  const S = [128, 256, 512][t], R = seeded(411), N = makeNoise(411), n = 4, sl = S / n;
  const cc = mk(S, S), cg = cc.getContext('2d'), hc = mk(S, S), hg = hc.getContext('2d'), rc = mk(S, S), rg = rc.getContext('2d');
  const ci = cg.createImageData(S, S), hi = hg.createImageData(S, S), ri = rg.createImageData(S, S);
  const sr = Array.from({ length: n * n }, () => R());
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const sx = Math.floor(x / sl), sy = Math.floor(y / sl), lx = (x % sl) / sl, ly = (y % sl) / sl, e = Math.min(lx, 1 - lx, ly, 1 - ly);
    const joint = e < 0.014 ? 1 : 0, bev = sstep(0.014, 0.05, e), g = R(), m = N.fbm(x / S, y / S, 8, 3), i = (y * S + x) * 4;
    let lum = 205 + (sr[sy * n + sx] - 0.5) * 26 + (m - 0.5) * 28 + (g - 0.5) * 18;
    if (joint) lum = 120 + g * 20; else lum -= (1 - bev) * 14;
    ci.data[i] = lum; ci.data[i + 1] = lum * 0.995; ci.data[i + 2] = lum * 0.97; ci.data[i + 3] = 255;
    const h = joint ? 40 : 150 + bev * 40 + (g - 0.5) * 20 + (sr[sy * n + sx] - 0.5) * 12;
    hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = h; hi.data[i + 3] = 255;
    ri.data[i] = 255; ri.data[i + 1] = (joint ? 1 : 0.82 + (g - 0.5) * 0.1 - sr[sy * n + sx] * 0.08) * 255; ri.data[i + 2] = 0; ri.data[i + 3] = 255;
  }
  cg.putImageData(ci, 0, 0); hg.putImageData(hi, 0, 0); rg.putImageData(ri, 0, 0);
  for (let i = 0; i < 14; i++) { // stains + gum
    const x = R() * S, y = R() * S, r = (0.02 + R() * 0.06) * S;
    const g = cg.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(60,58,52,0.18)'); g.addColorStop(1, 'rgba(60,58,52,0)'); cg.fillStyle = g; cg.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 24; i++) { cg.fillStyle = 'rgba(70,66,62,0.55)'; cg.beginPath(); cg.arc(R() * S, R() * S, Math.max(0.6, S / 500), 0, 6.3); cg.fill(); }
  const out = { map: tex(cc, { srgb: true, aniso }) };
  if (t >= 1) { out.normalMap = tex(normalFrom(hc, 3.5), { aniso }); out.roughnessMap = tex(rc, { aniso }); }
  return out;
}

/** Grass / dirt, 8 m per tile. Near-white luminance texture to be tinted with vertex colours. */
export function makeGrass(t, aniso) {
  const S = [128, 256, 512][t], R = seeded(421), N = makeNoise(421);
  const cc = mk(S, S), cg = cc.getContext('2d'), hc = mk(S, S), hg = hc.getContext('2d');
  const ci = cg.createImageData(S, S), hi = hg.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, g = R(), low = N.fbm(u, v, 3, 3), mid = N.fbm(u, v, 14, 3), dry = sstep(0.62, 0.9, N.fbm(u + 0.3, v + 0.7, 4, 3)) * 0.6, i = (y * S + x) * 4;
    const lum = 196 + (low - 0.5) * 60 + (mid - 0.5) * 50 + (g - 0.5) * 36;
    ci.data[i] = lum * (0.97 + dry * 0.17); ci.data[i + 1] = lum; ci.data[i + 2] = lum * (0.93 - dry * 0.22); ci.data[i + 3] = 255;
    const h = 128 + (mid - 0.5) * 90 + (g - 0.5) * 70; hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = h; hi.data[i + 3] = 255;
  }
  cg.putImageData(ci, 0, 0); hg.putImageData(hi, 0, 0);
  const wrapStroke = (fn) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { cg.save(); cg.translate(ox, oy); fn(); cg.restore(); } };
  for (let i = 0; i < S * 3; i++) { // blades
    const x = R() * S, y = R() * S, a = -Math.PI / 2 + (R() - 0.5) * 1.4, l = (0.01 + R() * 0.02) * S;
    cg.strokeStyle = R() < 0.5 ? 'rgba(255,255,230,0.22)' : 'rgba(40,60,20,0.22)'; cg.lineWidth = Math.max(0.7, S / 400);
    cg.beginPath(); cg.moveTo(x, y); cg.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); cg.stroke();
  }
  wrapStroke(() => { for (let i = 0; i < 5; i++) { cg.fillStyle = 'rgba(120,90,60,0.1)'; const x = R() * S, y = R() * S; cg.beginPath(); cg.ellipse(x, y, (0.03 + R() * 0.05) * S, (0.02 + R() * 0.03) * S, R() * 3, 0, 6.3); cg.fill(); } });
  for (let i = 0; i < 40; i++) { cg.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.55)' : 'rgba(255,230,120,0.5)'; cg.fillRect(R() * S, R() * S, Math.max(1, S / 256), Math.max(1, S / 256)); } // clover / daisies
  const out = { map: tex(cc, { srgb: true, aniso }) };
  if (t >= 1) out.normalMap = tex(normalFrom(hc, 2.0), { aniso });
  return out;
}

/** Sand with wind ripples, 6 m per tile. */
export function makeSand(t, aniso) {
  const S = [128, 256, 512][t], R = seeded(431), N = makeNoise(431);
  const cc = mk(S, S), cg = cc.getContext('2d'), hc = mk(S, S), hg = hc.getContext('2d');
  const ci = cg.createImageData(S, S), hi = hg.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, g = R(), w = N.fbm(u, v, 3, 3), rip = Math.sin((v + (w - 0.5) * 0.35) * Math.PI * 2 * 14) * 0.5 + 0.5, rip2 = Math.sin((u * 0.6 + v + (w - 0.5) * 0.5) * Math.PI * 2 * 5) * 0.5 + 0.5, i = (y * S + x) * 4;
    const lum = 222 + (rip - 0.5) * 22 + (rip2 - 0.5) * 12 + (g - 0.5) * 26 + (N.fbm(u, v, 12, 2) - 0.5) * 20;
    ci.data[i] = lum; ci.data[i + 1] = lum * 0.97; ci.data[i + 2] = lum * 0.9; ci.data[i + 3] = 255;
    const h = 128 + (rip - 0.5) * 90 + (rip2 - 0.5) * 40 + (g - 0.5) * 30; hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = h; hi.data[i + 3] = 255;
  }
  cg.putImageData(ci, 0, 0); hg.putImageData(hi, 0, 0);
  for (let i = 0; i < 30; i++) { cg.fillStyle = R() < 0.5 ? 'rgba(120,100,80,0.5)' : 'rgba(255,250,235,0.6)'; cg.fillRect(R() * S, R() * S, Math.max(1, S / 200), Math.max(1, S / 200)); } // shell bits / pebbles
  const out = { map: tex(cc, { srgb: true, aniso }) };
  if (t >= 1) out.normalMap = tex(normalFrom(hc, 2.6), { aniso });
  return out;
}

/** Worn paint mask: white with alpha holes (used with alphaTest on lane markings / kerbs). */
export function makePaintMask(t) {
  const S = [128, 256, 512][t], R = seeded(441), N = makeNoise(441), cc = mk(S, S), cg = cc.getContext('2d'), im = cg.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const g = R(), n = N.fbm(x / S, y / S, 10, 3), i = (y * S + x) * 4, wear = n > 0.62 ? (n - 0.62) * 5 : 0, v = 255 - g * 36 - wear * 90;
    im.data[i] = v; im.data[i + 1] = v; im.data[i + 2] = v * 0.98; im.data[i + 3] = (g * 0.5 + wear > 0.78 ? 0 : 255);
  }
  cg.putImageData(im, 0, 0);
  const T = tex(cc, { srgb: true }); return T;
}

/** Soft dark wheel-track streak (alpha). u across, v along (repeat). */
export function makeTracks(t) {
  const W = [32, 64, 64][t], H = [256, 512, 512][t], R = seeded(451), N = makeNoise(451), cc = mk(W, H), cg = cc.getContext('2d'), im = cg.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / (W - 1), band = Math.sin(u * Math.PI) ** 1.5, n = N.fbm(x / W * 0.5, y / H, 6, 3), i = (y * W + x) * 4;
    im.data[i] = im.data[i + 1] = im.data[i + 2] = 8; im.data[i + 3] = Math.min(255, band * (0.35 + n * 0.8) * 120 * (0.8 + R() * 0.3));
  }
  cg.putImageData(im, 0, 0); return tex(cc, { srgb: true });
}

/** Decal atlas 4x4: 0 manhole, 1 drain, 2 oil stain, 3 tar patch, 4/5 cracks, 6 square cover, 7 puddle-dry stain. */
export const DECAL = { manhole: 0, drain: 1, oil: 2, tar: 3, crackA: 4, crackB: 5, cover: 6, stain: 7 };
export function makeDecals(t, aniso) {
  const S = [512, 1024, 1024][t], c = S / 4, R = seeded(461), cc = mk(S, S), g = cc.getContext('2d');
  const cell = (i) => [(i % 4) * c, Math.floor(i / 4) * c];
  { // manhole
    const [x, y] = cell(0), cx = x + c / 2, cy = y + c / 2, r = c * 0.42;
    g.fillStyle = '#16171a'; g.beginPath(); g.arc(cx, cy, r, 0, 6.3); g.fill();
    g.strokeStyle = '#4a4c52'; g.lineWidth = c * 0.025; g.beginPath(); g.arc(cx, cy, r * 0.93, 0, 6.3); g.stroke();
    g.fillStyle = '#26282d'; g.beginPath(); g.arc(cx, cy, r * 0.82, 0, 6.3); g.fill();
    g.strokeStyle = '#3c3e44'; g.lineWidth = c * 0.018;
    for (let k = -4; k <= 4; k++) { g.beginPath(); g.moveTo(cx + k * r * 0.19, cy - r * 0.78); g.lineTo(cx + k * r * 0.19, cy + r * 0.78); g.stroke(); }
    for (let k = -4; k <= 4; k++) { g.beginPath(); g.moveTo(cx - r * 0.78, cy + k * r * 0.19); g.lineTo(cx + r * 0.78, cy + k * r * 0.19); g.stroke(); }
    g.fillStyle = '#16171a'; g.beginPath(); g.arc(cx, cy, r * 0.32, 0, 6.3); g.fill(); g.strokeStyle = '#555860'; g.lineWidth = c * 0.02; g.stroke();
    g.fillStyle = '#9a9ca3'; g.font = `bold ${c * 0.1}px Arial`; g.textAlign = 'center'; g.fillText('PALMERA', cx, cy + c * 0.035);
  }
  { // drain grate (long)
    const [x, y] = cell(1), w = c * 0.9, h = c * 0.42, x0 = x + (c - w) / 2, y0 = y + (c - h) / 2;
    g.fillStyle = '#101113'; g.fillRect(x0 - 6, y0 - 6, w + 12, h + 12); g.fillStyle = '#35373d'; g.fillRect(x0, y0, w, h);
    g.fillStyle = '#08090a'; for (let k = 0; k < 11; k++) g.fillRect(x0 + 10 + k * (w - 24) / 10, y0 + 8, w * 0.04, h - 16);
  }
  { // oil stain
    const [x, y] = cell(2);
    for (let k = 0; k < 7; k++) { const px = x + c * (0.3 + R() * 0.4), py = y + c * (0.3 + R() * 0.4), r = c * (0.1 + R() * 0.2), gr = g.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, 'rgba(8,8,10,0.55)'); gr.addColorStop(0.6, 'rgba(8,8,10,0.25)'); gr.addColorStop(1, 'rgba(8,8,10,0)'); g.fillStyle = gr; g.fillRect(px - r, py - r, r * 2, r * 2); }
  }
  { // tar patch
    const [x, y] = cell(3), pts = []; for (let k = 0; k < 9; k++) { const a = k / 9 * 6.28, rr = c * (0.34 + R() * 0.12); pts.push([x + c / 2 + Math.cos(a) * rr * 1.15, y + c / 2 + Math.sin(a) * rr * 0.8]); }
    g.fillStyle = 'rgba(18,19,22,0.78)'; g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(70,72,78,0.6)'; g.lineWidth = c * 0.012; g.stroke();
    for (let k = 0; k < 300; k++) { g.fillStyle = `rgba(${40 + R() * 40},${40 + R() * 40},${44 + R() * 40},0.35)`; const a = R() * 6.28, rr = R() * c * 0.3; g.fillRect(x + c / 2 + Math.cos(a) * rr * 1.1, y + c / 2 + Math.sin(a) * rr * 0.75, 2, 2); }
  }
  for (const idx of [4, 5]) { // cracks
    const [x, y] = cell(idx); g.strokeStyle = 'rgba(8,8,10,0.85)'; g.lineJoin = 'round';
    const walk = (px, py, a, n, w) => { g.lineWidth = w; g.beginPath(); g.moveTo(px, py); for (let s = 0; s < n; s++) { a += (R() - 0.5) * 0.9; px += Math.cos(a) * c * 0.03; py += Math.sin(a) * c * 0.03; g.lineTo(px, py); if (R() < 0.12 && w > 1.2) { g.stroke(); walk(px, py, a + (R() < 0.5 ? 1 : -1) * 0.8, n >> 1, w * 0.6); g.beginPath(); g.moveTo(px, py); g.lineWidth = w; } } g.stroke(); };
    walk(x + c * 0.08, y + c * (0.3 + R() * 0.4), (R() - 0.5) * 0.5, 28, Math.max(1.5, c / 140));
  }
  { // square utility cover
    const [x, y] = cell(6), w = c * 0.62, x0 = x + (c - w) / 2, y0 = y + (c - w) / 2;
    g.fillStyle = '#1a1b1e'; g.fillRect(x0 - 5, y0 - 5, w + 10, w + 10); g.fillStyle = '#4a4d54'; g.fillRect(x0, y0, w, w);
    g.fillStyle = '#34363b'; for (let k = 0; k < 8; k++) g.fillRect(x0 + 6, y0 + 8 + k * (w - 16) / 8, w - 12, w * 0.05);
  }
  { // dark smear
    const [x, y] = cell(7);
    for (let k = 0; k < 4; k++) { const px = x + c * (0.25 + R() * 0.5), py = y + c * (0.35 + R() * 0.3); const gr = g.createRadialGradient(px, py, 0, px, py, c * 0.35); gr.addColorStop(0, 'rgba(15,15,18,0.28)'); gr.addColorStop(1, 'rgba(15,15,18,0)'); g.fillStyle = gr; g.fillRect(x, y, c, c); }
  }
  const T = tex(cc, { srgb: true, aniso, wrap: false }); return T;
}
/** [u0,v0,u1,v1] for a decal cell (inset to avoid bleeding). */
export function decalUV(i) { const col = i % 4, row = Math.floor(i / 4), e = 0.004; return [col / 4 + e, 1 - (row + 1) / 4 + e, (col + 1) / 4 - e, 1 - row / 4 - e]; }

// =====================================================================================================
// FACADES (8 x 8 cells per tile). repW = 8 cells wide, repH = 8 floors.
// =====================================================================================================
const CELLS = 8;
export const FACADE = {
  glass: { cellW: 3.2, floor: 3.6, repW: 3.2 * CELLS, repH: 3.6 * CELLS },
  deco: { cellW: 3.4, floor: 3.4, repW: 3.4 * CELLS, repH: 3.4 * CELLS },
  house: { cellW: 3.2, floor: 3.0, repW: 3.2 * CELLS, repH: 3.0 * CELLS },
  industrial: { cellW: 5, floor: 5, repW: 5 * CELLS, repH: 5 * CELLS },
};
export const SHOP = { repW: 25.6, h: 3.5 };
const LIT = ['#e9c890', '#e8b878', '#f0dcb4', '#e6b66f', '#a9d4ec', '#bcd8ea', '#e6a8d8', '#e09a5c'];
const litCol = (R) => (R() < 0.06 ? '#ff9ad8' : R() < 0.16 ? '#9fdcff' : LIT[Math.floor(R() * 4)]);

function facadeTiles(kind, seed, t, aniso) {
  const R = seeded(seed), S = [256, 512, kind === 'industrial' ? 512 : 1024][t], cs = S / CELLS, L = new Layers(S, S, t, 0.9);
  const chance = { glass: 0.5, deco: 0.42, house: 0.33, industrial: 0.18 }[kind];
  L.p(0, 0, S, S, { c: '#fff', h: 0.5, r: 0.9, m: 0 });
  const u = cs / 64; // scale unit (cell px / 64)
  for (let ry = 0; ry < CELLS; ry++) for (let rx = 0; rx < CELLS; rx++) {
    const x = rx * cs, y = ry * cs, lit = R() < chance;
    if (kind === 'glass') {
      const sp = Math.round(cs * 0.24), m = Math.max(2, Math.round(cs * 0.035));
      L.p(x, y, cs, cs, { c: '#a9b2bb', h: 0.72, r: 0.32, m: 0.85 });
      L.p(x, y + cs - sp, cs, sp, { c: '#8c9aa9', h: 0.6, r: 0.55, m: 0.3 });
      L.grad(x, y + cs - sp, cs, sp, x, y + cs, [[0, 'rgba(255,255,255,0.18)'], [1, 'rgba(0,0,0,0.25)']]);
      const pw = (cs - 3 * m) / 2, ph = cs - sp - 2 * m, litI = lit ? Math.floor(R() * 3) : -1; // 0 left,1 right,2 both
      const tone = R();
      for (let i = 0; i < 2; i++) {
        const px = x + m + i * (pw + m), py = y + m;
        L.p(px, py, pw, ph, { c: '#5d88ae', h: 0.42, r: 0.07, m: 0.4 });
        L.grad(px, py, pw, ph, px + pw, py + ph, [[0, `rgba(215,236,252,${0.55 + tone * 0.3})`], [0.45, 'rgba(150,185,215,0.2)'], [1, 'rgba(20,40,70,0.35)']]);
        const blind = R() < 0.3 ? 0.25 + R() * 0.65 : 0;
        if (blind) {
          const bh = ph * blind; L.p(px, py, pw, bh, { c: '#d6cebd', h: 0.5, r: 0.75, m: 0 });
          for (let sy = py + 2; sy < py + bh; sy += Math.max(2, 3 * u)) L.p(px, sy, pw, Math.max(1, u), { c: '#b8ae9a', h: 0.46 });
        }
        if (litI === 2 || litI === i) {
          const e0 = py + (blind ? ph * blind * 0.5 : 0);
          L.p(px, e0, pw, py + ph - e0, { e: litCol(R) });
          L.eg.globalAlpha = 0.35; L.eg.fillStyle = '#000'; L.eg.fillRect(px, e0, pw, (py + ph - e0) * 0.25); L.eg.globalAlpha = 1;
        }
      }
    } else if (kind === 'deco') {
      const wall = 238 + Math.floor(R() * 17);
      L.p(x, y, cs, cs, { c: `rgb(${wall},${wall},${wall - 4})`, h: 0.5, r: 0.92, m: 0 });
      L.p(x, y + cs * 0.94, cs, cs * 0.06, { c: '#fff', h: 0.7, r: 0.85 }); // string course
      const balcony = ry > 0 && R() < 0.2, shut = !balcony && R() < 0.22, ow = cs * (balcony ? 0.5 : 0.4), oh = cs * (balcony ? 0.62 : 0.5), ox = x + (cs - ow) / 2, oy = y + cs * 0.12;
      L.p(ox - 3 * u, oy - 3 * u, ow + 6 * u, oh + 6 * u, { c: '#efe9dc', h: 0.64, r: 0.8 }); // frame/lintel
      L.p(ox, oy, ow, oh, { c: '#41597a', h: 0.3, r: 0.07, m: 0.4 });
      L.grad(ox, oy, ow, oh, ox + ow, oy + oh, [[0, 'rgba(190,220,245,0.6)'], [0.5, 'rgba(110,150,190,0.15)'], [1, 'rgba(10,25,45,0.35)']]);
      L.p(ox + ow / 2 - u, oy, 2 * u, oh, { c: '#efe9dc', h: 0.62, r: 0.8 }); // mullion
      const bl = R() < 0.3 ? 0.2 + R() * 0.6 : 0;
      if (bl) { L.p(ox, oy, ow, oh * bl, { c: R() < 0.5 ? '#e8dcc4' : '#cfd6dd', h: 0.5, r: 0.8 }); }
      if (lit) { const col = litCol(R); L.p(ox, oy + (bl ? oh * bl * 0.4 : 0), ow, oh - (bl ? oh * bl * 0.4 : 0), { e: col }); L.eg.fillStyle = '#000'; L.eg.fillRect(ox + ow / 2 - u, oy, 2 * u, oh); }
      if (shut) for (const sx of [ox - ow * 0.38, ox + ow + 1]) L.p(sx, oy, ow * 0.37, oh, { c: ['#6f8f7a', '#8a6f58', '#5e7894', '#b0b6ba'][Math.floor(R() * 4)], h: 0.6, r: 0.6 });
      if (balcony) {
        const bw = ow * 1.55, bx = x + (cs - bw) / 2, by = oy + oh;
        L.p(bx, by, bw, cs * 0.06, { c: '#d9d3c6', h: 0.8, r: 0.85 }); L.grad(bx, by + cs * 0.06, bw, cs * 0.12, bx, by + cs * 0.18, [[0, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,0)']]);
        L.p(bx, by - cs * 0.2, bw, Math.max(1, u), { c: '#33363c', h: 0.75, r: 0.4, m: 0.7 });
        for (let bxx = bx + 2; bxx < bx + bw; bxx += Math.max(3, 4 * u)) L.p(bxx, by - cs * 0.2, Math.max(1, 0.8 * u), cs * 0.2, { c: '#33363c', h: 0.72, r: 0.4, m: 0.7 });
      } else {
        L.p(ox - 5 * u, oy + oh + 3 * u, ow + 10 * u, 4 * u, { c: '#f4f0e6', h: 0.78, r: 0.8 }); // sill
        L.grad(ox, oy + oh + 7 * u, ow, cs * 0.3, ox, oy + oh + cs * 0.4, [[0, 'rgba(60,50,40,0.28)'], [1, 'rgba(60,50,40,0)']]); // stain under sill
      }
      if (R() < 0.11) { const ax = x + cs * 0.78, ay = y + cs * 0.55; L.p(ax, ay, cs * 0.17, cs * 0.12, { c: '#d3d7da', h: 0.75, r: 0.45, m: 0.5 }); for (let g = 1; g < 4; g++) L.p(ax + 1, ay + g * cs * 0.03, cs * 0.17 - 2, 1, { c: '#7a7f85', h: 0.55 }); }
    } else if (kind === 'house') {
      L.p(x, y, cs, cs, { c: '#fffdf8', h: 0.5, r: 0.93, m: 0 });
      const ground = ry === 0;
      if (ground && R() < 0.42) { // door with step / porch
        const dw = cs * 0.26, dx = x + cs * (0.2 + R() * 0.3), dc = ['#6b4a35', '#2f5d7c', '#8a2f2f', '#f2f0ea', '#355c45'][Math.floor(R() * 5)];
        L.p(dx - 3 * u, y + cs * 0.22, dw + 6 * u, cs * 0.78, { c: '#f6f3ec', h: 0.66 });
        L.p(dx, y + cs * 0.26, dw, cs * 0.74, { c: dc, h: 0.45, r: 0.5 }); L.p(dx + dw * 0.18, y + cs * 0.34, dw * 0.64, cs * 0.18, { c: '#2a3c4c', h: 0.4, r: 0.1, m: 0.5 });
        L.p(dx + dw * 0.8, y + cs * 0.62, 2 * u, 3 * u, { c: '#d8b45a', r: 0.3, m: 0.9 });
        L.p(dx - 5 * u, y + cs * 0.94, dw + 10 * u, cs * 0.06, { c: '#cfcac0', h: 0.78 });
        L.p(dx + dw + 6 * u, y + cs * 0.3, 3 * u, 4 * u, { c: '#fff', e: '#ffd9a0' });
        if (R() < 0.5) { const wx = dx > x + cs * 0.4 ? x + cs * 0.04 : x + cs * 0.7; L.p(wx, y + cs * 0.3, cs * 0.24, cs * 0.34, { c: '#2c3c50', h: 0.3, r: 0.07, m: 0.5 }); if (lit) L.p(wx, y + cs * 0.3, cs * 0.24, cs * 0.34, { e: litCol(R) }); }
      } else {
        const ww = cs * 0.5, wh = cs * 0.5, wx = x + (cs - ww) / 2, wy = y + cs * 0.2, sc = ['#5f8c78', '#8a6a4f', '#4f7390', '#f4f4f0', '#b45a4a'][Math.floor(R() * 5)];
        L.p(wx - 3 * u, wy - 3 * u, ww + 6 * u, wh + 6 * u, { c: '#f6f2e8', h: 0.65 });
        L.p(wx, wy, ww, wh, { c: '#2c3c50', h: 0.3, r: 0.07, m: 0.5 });
        L.grad(wx, wy, ww, wh, wx + ww, wy + wh, [[0, 'rgba(170,205,235,0.5)'], [0.5, 'rgba(90,130,170,0.1)'], [1, 'rgba(5,15,30,0.45)']]);
        L.p(wx + ww / 2 - u, wy, 2 * u, wh, { c: '#f6f2e8', h: 0.62 }); L.p(wx, wy + wh * 0.45, ww, 2 * u, { c: '#f6f2e8', h: 0.62 });
        if (R() < 0.55) for (const sx of [wx - ww * 0.36, wx + ww + 1]) { L.p(sx, wy, ww * 0.35, wh, { c: sc, h: 0.62, r: 0.6 }); for (let sy = wy + 2; sy < wy + wh; sy += 3 * u) L.p(sx, sy, ww * 0.35, Math.max(1, 0.6 * u), { c: 'rgba(0,0,0,0.25)', h: 0.5 }); }
        if (R() < 0.3) { const bl = 0.25 + R() * 0.5; L.p(wx, wy, ww, wh * bl, { c: '#e6d8c0', h: 0.5, r: 0.8 }); }
        if (lit) { L.p(wx, wy, ww, wh, { e: litCol(R) }); L.eg.fillStyle = '#000'; L.eg.fillRect(wx + ww / 2 - u, wy, 2 * u, wh); L.eg.fillRect(wx, wy + wh * 0.45, ww, 2 * u); }
        L.p(wx - 2 * u, wy + wh + 3 * u, ww + 4 * u, 3 * u, { c: '#efe9dc', h: 0.78 });
        if (R() < 0.35) { L.p(wx - 2 * u, wy + wh + 6 * u, ww + 4 * u, 6 * u, { c: '#6a4b32', h: 0.7 }); for (let f = 0; f < 6; f++) L.p(wx + f * (ww / 6), wy + wh + 3 * u, 3 * u, 4 * u, { c: ['#e8486a', '#ffcf3a', '#ff8fb0', '#8ad05a'][Math.floor(R() * 4)], h: 0.8 }); }
        L.grad(wx, wy + wh + 8 * u, ww, cs * 0.3, wx, wy + wh + cs * 0.45, [[0, 'rgba(60,50,40,0.25)'], [1, 'rgba(60,50,40,0)']]);
      }
      L.p(x, y + cs * 0.97, cs, cs * 0.03, { c: '#e9e3d6', h: 0.7 });
    } else { // industrial
      const rib = Math.max(2, Math.round(3 * u));
      L.p(x, y, cs, cs, { c: '#e4e8eb', h: 0.5, r: 0.55, m: 0.5 });
      for (let k = 0; k < cs; k += rib * 2) L.p(x + k, y, rib, cs, { c: '#cfd5da', h: 0.62, r: 0.5, m: 0.55 });
      L.p(x, y, 2, cs, { c: '#9aa1a8', h: 0.75, r: 0.5, m: 0.6 });
      if (ry === 0) {
        if (R() < 0.34) { // roller door
          const dx = x + cs * 0.1, dw = cs * 0.8;
          L.p(dx - 3, y + cs * 0.28, dw + 6, cs * 0.72, { c: '#4a5058', h: 0.7, r: 0.5, m: 0.6 }); L.p(dx, y + cs * 0.3, dw, cs * 0.7, { c: '#b8c0c8', h: 0.45, r: 0.5, m: 0.7 });
          for (let sy = y + cs * 0.3; sy < y + cs; sy += Math.max(2, 3 * u)) L.p(dx, sy, dw, 1, { c: '#7e868e', h: 0.35 });
          L.p(dx, y + cs * 0.2, dw, 2 * u, { c: '#ffd23a', h: 0.8 }); if (R() < 0.7) L.p(dx + dw / 2 - 3 * u, y + cs * 0.1, 6 * u, 3 * u, { c: '#fff', e: '#fff2d0' });
        } else {
          L.p(x + 6 * u, y + cs * 0.12, cs - 12 * u, cs * 0.28, { c: '#46586a', h: 0.35, r: 0.1, m: 0.5 });
          for (let k = 1; k < 4; k++) L.p(x + 6 * u + k * (cs - 12 * u) / 4, y + cs * 0.12, 2, cs * 0.28, { c: '#9aa1a8', h: 0.6, r: 0.4, m: 0.6 });
          if (lit) L.p(x + 6 * u, y + cs * 0.12, cs - 12 * u, cs * 0.28, { e: litCol(R) });
        }
      } else if (R() < 0.2) { L.p(x + cs * 0.2, y + cs * 0.3, cs * 0.3, cs * 0.3, { c: '#5a6068', h: 0.35, r: 0.5, m: 0.7 }); for (let k = 1; k < 6; k++) L.p(x + cs * 0.2, y + cs * (0.3 + k * 0.05), cs * 0.3, 1, { c: '#2a2d32', h: 0.2 }); }
      L.grad(x, y + cs * 0.6, cs, cs * 0.4, x, y + cs, [[0, 'rgba(130,70,30,0)'], [1, `rgba(130,70,30,${0.08 + R() * 0.14})`]]);
    }
  }
  // weathering: per-cell soot at the bottom, drip streaks, and overall grain
  for (let ry = 0; ry < CELLS; ry++) { L.grad(0, ry * cs + cs * 0.55, S, cs * 0.45, 0, (ry + 1) * cs, [[0, 'rgba(40,36,30,0)'], [1, 'rgba(40,36,30,0.07)']]); }
  for (let i = 0; i < 40; i++) { const x = R() * S, y = R() * S, l = cs * (0.5 + R() * 2); L.grad(x, y, Math.max(2, 2 * u), l, x, y + l, [[0, 'rgba(50,45,38,0.16)'], [1, 'rgba(50,45,38,0)']]); }
  L.grain(kind === 'glass' ? 0.04 : 0.1, seed);
  return L.maps({ aniso, normal: kind === 'glass' ? 2.5 : 3.2 });
}
export function makeFacade(kind, seed, t = 2, aniso = 4) { return facadeTiles(kind, seed, t, aniso); }

const SHOP_NAMES = ['KAHVE', 'BAKKAL', 'ECZANE', 'FIRIN', 'KİTAP', 'OPTİK', 'ÇİÇEK', 'BERBER', 'PİZZA', 'TELEFON', 'KUAFÖR', 'MARKET', 'DÖNER', 'SPOR', 'KIRTASİYE', 'ÇAY EVİ'];
const FASCIA = ['#1f4e5f', '#7a2638', '#2b3a67', '#1d6b4f', '#5b3a82', '#a8431f', '#2a2a30', '#8a6a1f'];
/** Ground-floor shopfront strip: 4 bays across (25.6 m) x 3.5 m. */
export function makeShopfront(t, aniso) {
  const bw = [64, 128, 256][t], bh = [48, 96, 192][t], W = bw * 4, R = seeded(77), L = new Layers(W, bh, t, 0.8);
  const u = bw / 64;
  L.p(0, 0, W, bh, { c: '#f2efe8', h: 0.5, r: 0.9, m: 0 });
  for (let b = 0; b < 4; b++) {
    const x = b * bw, fas = FASCIA[Math.floor(R() * FASCIA.length)], name = SHOP_NAMES[Math.floor(R() * SHOP_NAMES.length)], closed = R() < 0.14, door = R() < 0.6, dx = x + bw * (R() < 0.5 ? 0.08 : 0.62);
    L.p(x, 0, bw, bh * 0.2, { c: fas, h: 0.7, r: 0.5 }); // fascia sign
    L.cg.fillStyle = '#fff'; L.cg.font = `bold ${Math.round(bh * 0.14)}px Arial, sans-serif`; L.cg.textAlign = 'center'; L.cg.textBaseline = 'middle'; L.cg.fillText(name, x + bw / 2, bh * 0.1);
    L.eg.fillStyle = '#ffe9b8'; L.eg.font = L.cg.font; L.eg.textAlign = 'center'; L.eg.textBaseline = 'middle'; L.eg.fillText(name, x + bw / 2, bh * 0.1);
    L.p(x, bh * 0.2, 2 * u, bh * 0.8, { c: '#d3cdc0', h: 0.75 }); L.p(x + bw - 2 * u, bh * 0.2, 2 * u, bh * 0.8, { c: '#d3cdc0', h: 0.75 }); // pilasters
    L.p(x, bh * 0.9, bw, bh * 0.1, { c: '#46464c', h: 0.62, r: 0.7 }); // plinth
    const wx = x + 5 * u, ww = bw - 10 * u, wy = bh * 0.26, wh = bh * 0.62;
    if (closed) {
      L.p(wx, wy, ww, wh, { c: '#98a0a8', h: 0.5, r: 0.5, m: 0.6 }); for (let sy = wy; sy < wy + wh; sy += Math.max(2, 3 * u)) L.p(wx, sy, ww, 1, { c: '#6e767e', h: 0.35 });
      L.p(wx, wy + wh - 4 * u, ww, 4 * u, { c: '#5a6068', h: 0.6, r: 0.5, m: 0.6 });
      for (let k = 0; k < 6; k++) L.p(wx + R() * ww, wy + R() * wh, 4 * u + R() * 10 * u, 2 * u, { c: ['#e8486a', '#2d9cdb', '#f2c94c', '#6fcf97'][k % 4] }); // graffiti tag
      continue;
    }
    L.p(wx - 2 * u, wy - 2 * u, ww + 4 * u, wh + 4 * u, { c: '#2a2c30', h: 0.65, r: 0.4, m: 0.7 });
    L.p(wx, wy, ww, wh, { c: '#22303f', h: 0.35, r: 0.05, m: 0.55 });
    L.grad(wx, wy, ww, wh, wx + ww, wy + wh, [[0, 'rgba(190,220,245,0.55)'], [0.5, 'rgba(90,130,170,0.1)'], [1, 'rgba(5,15,30,0.4)']]);
    const warm = ['#d9b27a', '#e6cba2', '#bcd2e6', '#dca66e'][Math.floor(R() * 4)];
    L.eg.fillStyle = warm; L.eg.fillRect(wx, wy, ww, wh); // interior light
    const gg = L.eg.createLinearGradient(0, wy, 0, wy + wh); gg.addColorStop(0, 'rgba(0,0,0,0.5)'); gg.addColorStop(0.3, 'rgba(0,0,0,0)'); L.eg.fillStyle = gg; L.eg.fillRect(wx, wy, ww, wh);
    for (let s = 0; s < 3; s++) { const sy = wy + wh * (0.35 + s * 0.2); L.p(wx + 3 * u, sy, ww - 6 * u, 2 * u, { c: '#5a5148', h: 0.6, r: 0.6 }); L.eg.fillStyle = 'rgba(0,0,0,0.28)'; for (let k = 0; k < 6; k++) L.eg.fillRect(wx + 5 * u + R() * (ww - 14 * u), sy - (3 + R() * 4) * u, (2 + R() * 3) * u, (3 + R() * 4) * u); } // shelves + goods
    if (door) { // glass door
      const dw = bw * 0.24;
      L.p(dx, wy, dw, wh + bh * 0.04, { c: '#34363b', h: 0.62, r: 0.4, m: 0.7 }); L.p(dx + 2 * u, wy + 3 * u, dw - 4 * u, wh - 6 * u, { c: '#1d2a38', h: 0.35, r: 0.05, m: 0.5 }); L.eg.fillStyle = warm; L.eg.fillRect(dx + 2 * u, wy + 3 * u, dw - 4 * u, wh - 6 * u);
      L.p(dx + dw * 0.8, wy + wh * 0.45, 2 * u, 8 * u, { c: '#c8ccd0', r: 0.25, m: 0.9, h: 0.8 });
    }
    L.p(x + bw * 0.5 - 3 * u, wy + wh * 0.5, 6 * u, 1, { c: '#fff' }); // reflection
  }
  L.grad(0, bh * 0.55, W, bh * 0.45, 0, bh, [[0, 'rgba(40,36,30,0)'], [1, 'rgba(40,36,30,0.18)']]);
  L.grain(0.08, 3);
  return L.maps({ aniso, normal: 3 });
}

// =====================================================================================================
// ROOF TILES, VEGETATION
// =====================================================================================================
/** Roof tile / membrane texture, 2 m tile. Near-white luminance (tinted by vertex colour). */
export function makeRoofTiles(t, aniso) {
  const S = [128, 256, 512][t], R = seeded(481), L = new Layers(S, S, t, 0.7), cols = 8, rows = 8, cw = S / cols, rh = S / rows;
  L.p(0, 0, S, S, { c: '#cfcfcf', h: 0.5, r: 0.7 });
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = c * cw, y = r * rh, v = 215 + Math.floor((R() - 0.5) * 34);
    const g = L.cg.createLinearGradient(x, 0, x + cw, 0); g.addColorStop(0, `rgb(${v - 40},${v - 40},${v - 40})`); g.addColorStop(0.5, `rgb(${v + 14},${v + 14},${v + 14})`); g.addColorStop(1, `rgb(${v - 50},${v - 50},${v - 50})`);
    L.cg.fillStyle = g; L.cg.fillRect(x, y, cw, rh);
    if (L.hg) { const hgd = L.hg.createLinearGradient(x, 0, x + cw, 0); hgd.addColorStop(0, '#303030'); hgd.addColorStop(0.5, '#f0f0f0'); hgd.addColorStop(1, '#303030'); L.hg.fillStyle = hgd; L.hg.fillRect(x, y, cw, rh); }
    L.p(x, y + rh - Math.max(1, rh * 0.12), cw, Math.max(1, rh * 0.12), { c: 'rgba(0,0,0,0.5)', h: 0.15 }); // overlap shadow
  }
  L.grain(0.12, 9);
  const m = L.maps({ aniso, normal: 3 }); delete m.emissiveMap; return m;
}

/** Vegetation atlas: left half = palm bark (u 0..0.5), right half = frond with leaflets (u 0.5..1). Alpha. */
export function makeVeg(t, aniso) {
  const W = [128, 256, 512][t] * 2, H = W, R = seeded(491), cc = mk(W, H), g = cc.getContext('2d');
  { // bark
    const w = W / 2; g.fillStyle = '#b9b09f'; g.fillRect(0, 0, w, H);
    for (let y = 0; y < H; y += H / 16) { g.fillStyle = 'rgba(50,40,30,0.5)'; g.fillRect(0, y, w, Math.max(1, H / 128)); g.fillStyle = 'rgba(255,245,225,0.25)'; g.fillRect(0, y + H / 64, w, Math.max(1, H / 128)); }
    for (let i = 0; i < w * 3; i++) { g.fillStyle = R() < 0.5 ? 'rgba(40,30,20,0.18)' : 'rgba(255,240,215,0.14)'; g.fillRect(R() * w, R() * H, Math.max(1, w / 128), 3 + R() * H / 20); }
  }
  { // frond: rachis along the vertical centre; leaflets angle toward the tip, tapering
    const x0 = W / 2, w = W / 2, cx = x0 + w / 2;
    g.lineCap = 'round';
    const n = 34;
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1), y = H * (0.96 - f * 0.92), len = w * 0.47 * (0.3 + Math.sin(Math.min(1, f * 1.05 + 0.1) * Math.PI) * 0.72) * (1 - f * 0.3), droop = 0.25 + f * 0.2;
      for (const s of [-1, 1]) {
        const v = 160 + Math.floor(R() * 60), col = `rgb(${v - 40},${v + 20},${v - 60})`;
        g.strokeStyle = col; g.lineWidth = Math.max(1.5, H / 90 * (1 - f * 0.5));
        g.beginPath(); g.moveTo(cx, y); g.quadraticCurveTo(cx + s * len * 0.6, y - H * 0.025 + len * droop * 0.1, cx + s * len, y - H * 0.045 * (1 - f * 0.3) + len * droop * 0.35); g.stroke();
      }
    }
    g.strokeStyle = '#7d8f5e'; g.lineWidth = Math.max(2, H / 70); g.beginPath(); g.moveTo(cx, H * 0.99); g.lineTo(cx, H * 0.03); g.stroke();
  }
  return tex(cc, { srgb: true, aniso, wrap: false });
}

// =====================================================================================================
// SIGNS, GLOW, WATER
// =====================================================================================================
export const SIGNS = [
  ['MARTI ÇAY EVİ', '#d9202e', '#fff', '#ffe27a'], ['LODOS KAHVE', '#ffd23a', '#7a2638', '#fff'],
  ['KARAYEL BANKASI', '#12305e', '#f2c14e', '#fff'], ['MERMER TELEKOM', '#1b6fd0', '#fff', '#7ff0ff'],
  ['SİMİT SARAYI', '#c8741a', '#fff', '#ffe9b8'], ['POYRAZ SİGORTA', '#1d6b4f', '#fff', '#ffe27a'],
  ['BOĞAZ FM 94.2', '#6a1bb8', '#7ff0ff', '#fff'], ['KOZA OTOMOTİV', '#15151c', '#ff2d4a', '#fff'],
  ['BOĞAZ BAKLAVA', '#0e8a8a', '#fff', '#ffd9a0'], ['KIYI LASTİK', '#222', '#ffd23a', '#fff'],
  ['GÜVENLİ EV', '#0f8f8f', '#fff', '#ff7ab8'], ['HASTANE', '#f4f7fa', '#d62839', '#d62839'],
  ['EMNİYET', '#1d3f8f', '#fff', '#ffd23a'], ['AVCI MALZEME', '#2a2118', '#ffb000', '#fff'],
  ['OTO SANAYİ', '#e8590c', '#fff', '#222'], ['STADYUM', '#1b7a3a', '#fff', '#ffd23a'],
  ['İSKELE', '#7a5230', '#fff', '#ffd9a0'], ['LİMAN', '#254a73', '#fff', '#ffb000'],
  ['ÇAY BAHÇESİ', '#26c6da', '#fff', '#ff9f43'], ['PARK', '#2e8b57', '#fff', '#fff3a0'],
  ['İŞ MERKEZİ', '#2b1b5e', '#ff6ad5', '#7ff0ff'],
  // 21..31 extra advertising
  ['KULE LOKANTASI', '#2a1458', '#ffd23a', '#7ff0ff'], ['ŞİŞLİ PİDE', '#b3141f', '#fff3a0', '#ffd23a'],
  ['AKINTI KARGO', '#0f3d3e', '#ffb000', '#fff'], ['LİMON ŞERBET', '#e8d712', '#1b7a3a', '#fff'],
  ['HALİÇ SİNEMA', '#150d2e', '#7ff0ff', '#ff6ad5'], ['MERKEZ OTEL', '#173a63', '#fff', '#ffd9a0'],
  ['HIZLI KURYE', '#e8590c', '#fff', '#222'], ['ADA SPOR SALONU', '#111', '#8aff4a', '#fff'],
  ['İSKELE BALIK EKMEK', '#6a1f1f', '#ffd23a', '#fff'], ['SERVİ ECZANESİ', '#f4f7fa', '#1b8f4a', '#1b8f4a'],
  ['TURNA KLİMA', '#1b6fd0', '#fff', '#7ff0ff'],
  // 32..39 street name blades
  ['LALE SK.', '#155c3a', '#fff', '#fff'], ['MARTI SK.', '#155c3a', '#fff', '#fff'], ['BOĞAZ CD.', '#155c3a', '#fff', '#fff'], ['KUMRU SK.', '#155c3a', '#fff', '#fff'],
  ['SAHİL YOLU', '#155c3a', '#fff', '#fff'], ['ÇINAR SK.', '#155c3a', '#fff', '#fff'], ['SERVİ SK.', '#155c3a', '#fff', '#fff'], ['KÖPRÜ CD.', '#155c3a', '#fff', '#fff'],
];
export const SIGN_ROWS = 10;
export const SIGN_ID = { ads: 10, safehouse: 10, hospital: 11, police: 12, gunshop: 13, garage: 14, stadium: 15, pier: 16, docks: 17, beach: 18, park: 19, downtown: 20 };
export const SIGN_AD = { first: 0, count: 10, extraFirst: 21, extraCount: 11, street: 32, streetCount: 8 };

export function makeSignAtlas(t = 2, aniso = 4) {
  const cw = [256, 256, 512][t], ch = cw / 2, cv = mk(cw * 4, ch * SIGN_ROWS), g = cv.getContext('2d'), k = cw / 256;
  g.fillStyle = '#222'; g.fillRect(0, 0, cv.width, cv.height);
  SIGNS.forEach(([text, bg, fg, ac], i) => {
    const x = (i % 4) * cw, y = Math.floor(i / 4) * ch, street = i >= 32;
    const gr = g.createLinearGradient(0, y, 0, y + ch); gr.addColorStop(0, bg); gr.addColorStop(1, street ? bg : 'rgba(0,0,0,0.35)');
    g.fillStyle = bg; g.fillRect(x, y, cw, ch); g.fillStyle = gr; g.fillRect(x, y, cw, ch);
    g.fillStyle = ac; g.fillRect(x + 6 * k, y + 6 * k, cw - 12 * k, 5 * k); g.fillRect(x + 6 * k, y + ch - 11 * k, cw - 12 * k, 5 * k);
    if (!street) { g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2 * k; g.strokeRect(x + 3 * k, y + 3 * k, cw - 6 * k, ch - 6 * k); }
    let size = 48 * k; g.font = `bold ${size}px Arial, sans-serif`;
    while (g.measureText(text).width > 224 * k && size > 14 * k) { size -= 2 * k; g.font = `bold ${size}px Arial, sans-serif`; }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (!street) { g.shadowColor = ac; g.shadowBlur = 10 * k; }
    g.fillStyle = fg; g.fillText(text, x + cw / 2, y + ch * 0.52); g.shadowBlur = 0;
    if (text === 'HASTANE') { g.fillStyle = '#d62839'; g.fillRect(x + 14 * k, y + 44 * k, 30 * k, 10 * k); g.fillRect(x + 24 * k, y + 34 * k, 10 * k, 30 * k); }
  });
  return tex(cv, { srgb: true, aniso, wrap: false });
}
/** [u0, v0, u1, v1] of atlas cell i. */
export function signUV(i) {
  const col = i % 4, row = Math.floor(i / 4);
  return [col / 4 + 0.002, 1 - (row + 1) / SIGN_ROWS + 0.002, (col + 1) / 4 - 0.002, 1 - row / SIGN_ROWS - 0.002];
}

/** Traffic signal head: 3 rows (red lit, amber lit, green lit), each showing the 3 lamps stacked. */
export function makeSignalTex() {
  const W = 32, H = 96 * 3, cv = mk(W, H), g = cv.getContext('2d');
  const lamps = [['#ff2a1a', '#3a0d0a'], ['#ffb11a', '#3a2a0a'], ['#27ff6a', '#0a3a18']];
  for (let row = 0; row < 3; row++) for (let l = 0; l < 3; l++) {
    const cy = row * 96 + l * 32 + 16, on = row === l;
    g.fillStyle = '#0c0c0e'; g.fillRect(0, row * 96 + l * 32, 32, 32);
    if (on) { const gr = g.createRadialGradient(16, cy, 1, 16, cy, 15); gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, lamps[l][0]); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, cy - 16, 32, 32); }
    else { g.fillStyle = lamps[l][1]; g.beginPath(); g.arc(16, cy, 11, 0, 6.3); g.fill(); }
  }
  return tex(cv, { srgb: true, wrap: false, keep: true });
}

export function makeGlow() {
  const cv = mk(128, 128), g = cv.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,235,190,1)'); gr.addColorStop(0.12, 'rgba(255,215,150,0.75)'); gr.addColorStop(0.4, 'rgba(255,190,110,0.22)'); gr.addColorStop(1, 'rgba(255,170,80,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** Wide soft light pool on the ground. */
export function makePool() {
  const cv = mk(128, 128), g = cv.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,205,140,0.85)'); gr.addColorStop(0.3, 'rgba(255,190,110,0.42)'); gr.addColorStop(0.65, 'rgba(255,170,90,0.12)'); gr.addColorStop(1, 'rgba(255,160,80,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Tileable water normal map (alpha = 1). */
export function makeWaterNormal(t) {
  const S = [128, 256, 512][t], N = makeNoise(501), hc = mk(S, S), hg = hc.getContext('2d'), im = hg.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    let h = 0, a = 0.5, f = 4;
    for (let o = 0; o < 5; o++) { const n = N.s(f, u + o * 0.13, v - o * 0.21); h += (1 - Math.abs(n * 2 - 1)) * a; a *= 0.55; f *= 2; }
    const g = Math.min(255, h * 180), i = (y * S + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = g; im.data[i + 3] = 255;
  }
  hg.putImageData(im, 0, 0);
  return tex(normalFrom(hc, 6), {});
}
