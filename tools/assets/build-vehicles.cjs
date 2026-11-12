// Offline asset conversion: Kenney Car Kit 3.1 (CC0) + Quaternius LowPoly Public Transport (CC0) -> game-ready GLBs.
//   node tools/assets/build-vehicles.cjs <carkit GLB dir> <colormap.png> <quaternius Bus.obj> <out dir>
// Each output GLB holds named flat meshes (vertex colours baked from the colour atlas, one material-free primitive each):
//   paint (tintable body panels, grey shading only), trim, glass, light_head, light_tail, light_sign, light_bar_r, light_bar_b.
// The model is warped (piecewise-linear along Z with rigid wheel-arch zones) so it fills the type's collision box exactly.
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const { readGLB } = require('./glbread.cjs');
const { readOBJ } = require('./objread.cjs');
const { writeGLB } = require('./glbwrite.cjs');
const [,, carDir, cmapPng, busObj, outDir] = process.argv;

// ---- tiny PNG decoder (8-bit RGB/RGBA, non-interlaced)
function decodePNG(file) {
  const b = fs.readFileSync(file); let p = 8, W, H, ct; const idat = [];
  while (p < b.length) { const len = b.readUInt32BE(p), type = b.toString('latin1', p + 4, p + 8); const d = b.slice(p + 8, p + 8 + len);
    if (type === 'IHDR') { W = d.readUInt32BE(0); H = d.readUInt32BE(4); ct = d[9]; } else if (type === 'IDAT') idat.push(d); p += 12 + len; }
  const bpp = ct === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(idat)), out = Buffer.alloc(W * H * 4), stride = W * bpp;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < H; y++) { const f = raw[y * (stride + 1)], line = Buffer.from(raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) { const a = i >= bpp ? line[i - bpp] : 0, u = prev[i], c = i >= bpp ? prev[i - bpp] : 0; let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += u; else if (f === 3) v += (a + u) >> 1; else if (f === 4) { const pp = a + u - c, pa = Math.abs(pp - a), pb = Math.abs(pp - u), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? u : c; }
      line[i] = v & 255; }
    for (let x = 0; x < W; x++) { out[(y * W + x) * 4] = line[x * bpp]; out[(y * W + x) * 4 + 1] = line[x * bpp + 1]; out[(y * W + x) * 4 + 2] = line[x * bpp + 2]; out[(y * W + x) * 4 + 3] = bpp === 4 ? line[x * bpp + 3] : 255; }
    prev = line; }
  return { W, H, data: out };
}
const cm = decodePNG(cmapPng);
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const texel = (u, v) => { const x = Math.min(cm.W - 1, Math.max(0, Math.floor(u * cm.W))), y = Math.min(cm.H - 1, Math.max(0, Math.floor(v * cm.H))); const o = (y * cm.W + x) * 4; return [lin(cm.data[o]), lin(cm.data[o + 1]), lin(cm.data[o + 2])]; };
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const swatchMean = (col, row) => { let s = 0, n = 0; const y0 = Math.floor(row / 2) * 128, x0 = col * 32; for (let y = y0; y < y0 + 128; y += 4) for (let x = x0; x < x0 + 32; x += 4) { s += lum(texel((x + 0.5) / cm.W, (y + 0.5) / cm.H)); n++; } return s / n; };

// ---- target collision boxes (src/entities/vehicleModels.js TYPES)
const T = {
  sedan: { halfW: 0.92, halfL: 2.25, height: 1.42, wheelBase: 2.7 },
  sports: { halfW: 0.98, halfL: 2.2, height: 1.16, wheelBase: 2.6 },
  pickup: { halfW: 1.02, halfL: 2.65, height: 1.8, wheelBase: 3.2 },
  van: { halfW: 1.05, halfL: 2.6, height: 2.25, wheelBase: 3.0 },
  taxi: { halfW: 0.92, halfL: 2.3, height: 1.42, wheelBase: 2.75 },
  police: { halfW: 0.95, halfL: 2.35, height: 1.45, wheelBase: 2.8 },
  bus: { halfW: 1.3, halfL: 5.6, height: 3.1, wheelBase: 7.0 },
};
const CARS = {
  sedan: { src: 'sedan.glb', paint: ['13,2', '13,3'] },
  sports: { src: 'sedan-sports.glb', paint: ['13,2', '13,3'] },
  pickup: { src: 'truck.glb', paint: ['7,2', '7,3'] },
  van: { src: 'van.glb', paint: ['15,2', '15,3'] },
  taxi: { src: 'taxi.glb', paint: ['9,2', '9,3'], sign: true },
  police: { src: 'police.glb', paint: ['13,5', '13,4'], bar: true },
};

const meshesOut = () => ({ paint: [], trim: [], glass: [], light_head: [], light_tail: [], light_sign: [], light_bar_r: [], light_bar_b: [] });
// triangle record: 3 x {p:[x,y,z], n:[x,y,z], c:[r,g,b]}
function buildOne(id, tris, info) {
  const Tt = T[id];
  let top = 0; for (const t of tris) if (t.group !== 'light_sign') for (const v of t.v) top = Math.max(top, v.p[1]);
  const sx = Tt.halfW / info.halfW, sy = Tt.height / top;
  const ah = info.ah, wb2 = Tt.wheelBase / 2;
  const kin = [info.zr, info.zra - ah, info.zra + ah, info.zfa - ah, info.zfa + ah, info.zf];
  const kout = [-Tt.halfL, -wb2 - ah * sy, -wb2 + ah * sy, wb2 - ah * sy, wb2 + ah * sy, Tt.halfL];
  for (let i = 1; i < 6; i++) if (!(kout[i] > kout[i - 1] && kin[i] > kin[i - 1])) throw new Error(id + ': bad warp knots ' + kin + ' -> ' + kout);
  const slopes = []; for (let i = 0; i < 5; i++) slopes.push((kout[i + 1] - kout[i]) / (kin[i + 1] - kin[i]));
  const fz = (z) => { let i = 0; while (i < 4 && z > kin[i + 1]) i++; return [kout[i] + (z - kin[i]) * slopes[i], slopes[i]]; };
  const out = meshesOut();
  for (const t of tris) {
    const g = out[t.group]; if (!g) throw new Error('group ' + t.group);
    for (const v of t.v) {
      const [z2, sz] = fz(v.p[2]);
      g.push([v.p[0] * sx, v.p[1] * sy, z2, v.n[0] / sx, v.n[1] / sy, v.n[2] / sz, v.c[0], v.c[1], v.c[2]]);
    }
  }
  const meshes = [];
  for (const [name, verts] of Object.entries(out)) {
    if (!verts.length) continue;
    const pos = [], nor = [], col = [], idx = [];
    verts.forEach((v, i) => { pos.push(v[0], v[1], v[2]); const l = Math.hypot(v[3], v[4], v[5]) || 1; nor.push(v[3] / l, v[4] / l, v[5] / l); col.push(v[6], v[7], v[8]); idx.push(i); });
    meshes.push({ name, positions: pos, normals: nor, colors: col, indices: idx });
  }
  const wx = info.wheelX * sx;
  const extras = { id, sx, sy, visR: info.wheelR * sy, visW: info.wheelW * sx, wheels: [[wx, wb2], [-wx, wb2], [wx, -wb2], [-wx, -wb2]] };
  return { glb: writeGLB(meshes, extras), tris: tris.length, extras };
}
const GLASS = [0.07, 0.11, 0.16];

function kenney(id) {
  const cfg = CARS[id];
  const { prims } = readGLB(path.join(carDir, cfg.src));
  const body = prims.filter((p) => !/wheel/.test(p.name)), wheels = prims.filter((p) => /wheel/.test(p.name));
  const info = { halfW: 0, top: 0, zr: 1e9, zf: -1e9, ah: 0.42 };
  for (const p of body) for (let i = 0; i < p.pos.length; i += 3) { info.halfW = Math.max(info.halfW, Math.abs(p.pos[i])); info.top = Math.max(info.top, p.pos[i + 1]); info.zr = Math.min(info.zr, p.pos[i + 2]); info.zf = Math.max(info.zf, p.pos[i + 2]); }
  const wc = wheels.map((p) => { const c = [0, 0, 0], n = p.pos.length / 3; for (let i = 0; i < p.pos.length; i += 3) for (let k = 0; k < 3; k++) c[k] += p.pos[i + k] / n; return c; });
  info.zfa = Math.max(...wc.map((c) => c[2])); info.zra = Math.min(...wc.map((c) => c[2]));
  info.wheelX = Math.max(...wc.map((c) => Math.abs(c[0]))); info.wheelR = 0.3; info.wheelW = 0.4;
  const paintCells = new Map(cfg.paint.map((k) => [k, swatchMean(...k.split(',').map(Number))]));
  const tris = [];
  for (const p of body) for (let t = 0; t < p.idx.length; t += 3) {
    const ids = [p.idx[t], p.idx[t + 1], p.idx[t + 2]];
    const u = (p.uv[ids[0] * 2] + p.uv[ids[1] * 2] + p.uv[ids[2] * 2]) / 3, v = (p.uv[ids[0] * 2 + 1] + p.uv[ids[1] * 2 + 1] + p.uv[ids[2] * 2 + 1]) / 3;
    const col = Math.floor(u * 16), row = Math.floor(v * 8), key = col + ',' + row;
    const cy = (p.pos[ids[0] * 3 + 1] + p.pos[ids[1] * 3 + 1] + p.pos[ids[2] * 3 + 1]) / 3, cz = (p.pos[ids[0] * 3 + 2] + p.pos[ids[1] * 3 + 2] + p.pos[ids[2] * 3 + 2]) / 3;
    let group = 'trim';
    if (paintCells.has(key)) group = 'paint';
    else if (col <= 1 && row >= 6) group = 'glass';
    else if ((col === 3) && row >= 6 && cz > 0) group = 'light_head';
    else if (col === 5 && row >= 6 && cy < 1.1) group = 'light_tail';
    else if (cfg.bar && cy > 1.1 && col === 5 && row >= 6) group = 'light_bar_r';
    else if (cfg.bar && cy > 1.1 && col === 7 && row >= 6) group = 'light_bar_b';
    else if (cfg.sign && key === '13,4' && cy > 1.3) group = 'light_sign';
    if (cfg.bar && cy > 1.1 && col === 5 && row >= 6) group = 'light_bar_r';
    const vs = ids.map((i) => {
      const uu = p.uv[i * 2], vv = p.uv[i * 2 + 1]; let c = texel(uu, vv);
      if (group === 'paint') { const s = Math.min(1.25, Math.max(0.45, lum(c) / paintCells.get(key))); c = [s, s, s]; }
      else if (group === 'glass') { const s = lum(c); c = [GLASS[0] * (0.6 + s), GLASS[1] * (0.6 + s), GLASS[2] * (0.6 + s)]; }
      else if (group.startsWith('light')) c = [1, 1, 1];
      return { p: [p.pos[i * 3], p.pos[i * 3 + 1], p.pos[i * 3 + 2]], n: [p.nor[i * 3], p.nor[i * 3 + 1], p.nor[i * 3 + 2]], c };
    });
    tris.push({ group, v: vs });
  }
  return buildOne(id, tris, info);
}

function bus() {
  const { V, N, groups } = readOBJ(busObj);
  // OBJ space: long axis +X (front = FRONT sign), up +Y, width Z.  -> game: long axis +Z, width X (left = +X).
  const F = +process.env.BUS_FRONT || 1; // F=1: nose at model min-X, F=-1: nose at max-X (rotation about Y, keeps winding)
  const map = (p) => [F * p[2], p[1] + 1.12, -F * (p[0] - 1.8)];
  const mapN = (n) => [F * n[2], n[1], -F * n[0]];
  const info = { halfW: 0, top: 0, zr: 1e9, zf: -1e9, ah: 0.3, wheelR: 0.3, wheelW: 0.2 };
  const tris = [];
  const gm = { Top: 'paint', Bottom: 'paint', Windows: 'glass', Details: 'trim', Bumper: 'trim', Lights: 'light', Material: 'wheel', Wheel: 'wheel' };
  const COL = { Details: [0.02, 0.02, 0.025], Bumper: [0.09, 0.09, 0.1] };
  const wheelPts = [];
  for (const g of groups) {
    const kind = gm[g.mat];
    for (const tri of g.tris) {
      const vs = tri.map((q) => ({ p: map(V[q.v]), n: q.n >= 0 ? mapN(N[q.n]) : [0, 1, 0] }));
      if (kind === 'wheel') { for (const v of vs) wheelPts.push(v.p); continue; }
      let group = kind;
      const cz = (vs[0].p[2] + vs[1].p[2] + vs[2].p[2]) / 3;
      if (kind === 'light') group = cz > 1.8 ? 'light_head' : 'light_tail';
      if (kind === 'light') { /* split by end */ }
      const shadeCol = kind === 'paint' ? [1, 1, 1] : kind === 'glass' ? GLASS : COL[g.mat] || [1, 1, 1];
      vs.forEach((v) => { v.c = shadeCol; });
      tris.push({ group, v: vs });
      for (const v of vs) { info.halfW = Math.max(info.halfW, Math.abs(v.p[0])); info.top = Math.max(info.top, v.p[1]); info.zr = Math.min(info.zr, v.p[2]); info.zf = Math.max(info.zf, v.p[2]); }
    }
  }
  // wheel axle positions from wheel meshes (front = larger z)
  const zs = wheelPts.map((p) => p[2]); const mid = (Math.min(...zs) + Math.max(...zs)) / 2;
  const front = wheelPts.filter((p) => p[2] > mid), rear = wheelPts.filter((p) => p[2] <= mid);
  const avg = (a, k) => a.reduce((s, p) => s + p[k], 0) / a.length;
  info.zfa = avg(front, 2); info.zra = avg(rear, 2); info.wheelX = Math.max(...wheelPts.map((p) => Math.abs(p[0]))) - 0.04;
  info.wheelR = 0.24; // the toy-sized source wheels would vanish under the skirt: use a bigger tyre (rim centre kept on the axle)
  // lights: re-split using the real centre of the body
  const centre = (info.zr + info.zf) / 2;
  for (const t of tris) if (t.group.startsWith('light')) { const cz = (t.v[0].p[2] + t.v[1].p[2] + t.v[2].p[2]) / 3; t.group = cz > centre ? 'light_head' : 'light_tail'; }
  return buildOne('bus', tris, info);
}

function wheel() {
  const { prims } = readGLB(path.join(carDir, 'wheel-default.glb')); const p = prims[0];
  const pos = [], nor = [], col = [], idx = [];
  for (let i = 0; i < p.idx.length; i++) { const k = p.idx[i];
    pos.push(p.pos[k * 3] / 0.4, p.pos[k * 3 + 1] / 0.3, p.pos[k * 3 + 2] / 0.3); nor.push(p.nor[k * 3], p.nor[k * 3 + 1], p.nor[k * 3 + 2]);
    const c = texel(p.uv[k * 2], p.uv[k * 2 + 1]); col.push(c[0], c[1], c[2]); idx.push(i); }
  return writeGLB([{ name: 'wheel', positions: pos, normals: nor, colors: col, indices: idx }], { id: 'wheel' });
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'wheel.glb'), wheel());
const results = {};
for (const id of Object.keys(CARS)) results[id] = kenney(id);
results.bus = bus();
for (const [id, r] of Object.entries(results)) { fs.writeFileSync(path.join(outDir, id + '.glb'), r.glb); console.log(id, r.glb.length, 'bytes', r.tris, 'tris', JSON.stringify(r.extras)); }
