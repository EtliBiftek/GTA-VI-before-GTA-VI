// Offline conversion of CC0 prop models (Kenney Nature Kit / City Kit Roads / City Kit Industrial / Watercraft Kit / Retro Urban Kit)
// into single-mesh vertex-coloured GLBs: origin on the ground at the footprint centre, scaled to game metres, textures baked away.
//   node tools/assets/build-props.cjs <staging dir with the unzipped kits> <out dir>
const fs = require('fs'), path = require('path');
const { readGLB } = require('./glbread.cjs');
const { decodePNG } = require('./pngdec.cjs');
const { writeGLB } = require('./glbwrite.cjs');
const [,, stage, outDir] = process.argv;
const KIT = {
  nature: stage + '/nature/x/Models/GLTF format/', roads: stage + '/roads/x/Models/GLB format/', industrial: stage + '/industrial/x/Models/GLB format/',
  watercraft: stage + '/watercraft/x/Models/GLB format/', retro: stage + '/retro/x/Models/GLB format/', carkit: stage + '/carkit/x/Models/GLB format/',
};
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const texCache = new Map();
function tex(prim, kitDir) {
  const im = prim.image; if (!im) return null;
  const key = im.uri ? kitDir + im.uri : prim.path + prim.name + im.name;
  if (!texCache.has(key)) {
    let t = null; try { t = decodePNG(im.bytes || path.join(kitDir, im.uri)); } catch (e) { try { t = decodePNG(path.join(kitDir, 'Textures', path.basename(im.uri || '') )); } catch (e2) { console.warn('  texture fail', key, e2.message); } }
    texCache.set(key, t);
  }
  return texCache.get(key);
}
function sample(t, u, v) { const x = ((Math.floor(u * t.W) % t.W) + t.W) % t.W, y = ((Math.floor(v * t.H) % t.H) + t.H) % t.H, o = (y * t.W + x) * 4; return [lin(t.data[o]), lin(t.data[o + 1]), lin(t.data[o + 2])]; }
// pick the texture that holds the shared colour atlas when the glb only references it by uri
function load(kit, file, opt = {}) {
  const dir = KIT[kit], { prims } = readGLB(dir + file);
  const P = [], N = [], C = [], I = []; let base = 0;
  for (const pr of prims) {
    if (opt.skip && opt.skip(pr)) continue;
    const bc = pr.material?.pbrMetallicRoughness?.baseColorFactor || [1, 1, 1, 1];
    let t = tex(pr, dir);
    if (!t && pr.image) { // external atlas shipped next to the glb (Kenney colormap)
      const f = path.join(dir, 'Textures', 'colormap.png'); if (fs.existsSync(f)) { if (!texCache.has(f)) texCache.set(f, decodePNG(f)); t = texCache.get(f); }
    }
    const n = pr.pos.length / 3;
    for (let i = 0; i < n; i++) {
      P.push(pr.pos[i * 3], pr.pos[i * 3 + 1], pr.pos[i * 3 + 2]);
      if (pr.nor) N.push(pr.nor[i * 3], pr.nor[i * 3 + 1], pr.nor[i * 3 + 2]); else N.push(0, 1, 0);
      let c = [bc[0], bc[1], bc[2]];
      if (t && pr.uv) { const s = sample(t, pr.uv[i * 2], pr.uv[i * 2 + 1]); c = [c[0] * s[0], c[1] * s[1], c[2] * s[2]]; }
      if (opt.recolor && opt.recolor[pr.material?.name]) { const h = opt.recolor[pr.material.name]; c = [lin((h >> 16) & 255), lin((h >> 8) & 255), lin(h & 255)]; }
      if (opt.mul) c = [c[0] * opt.mul, c[1] * opt.mul, c[2] * opt.mul];
      C.push(c[0], c[1], c[2]);
    }
    for (const k of pr.idx) I.push(k + base);
    base += n;
  }
  return { P, N, C, I };
}
function bbox(P) { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], P[i + k]); mx[k] = Math.max(mx[k], P[i + k]); } return { mn, mx }; }
/** parts: [{kit,file,opt, at:[x,y,z], rotY}] merged, then rotY, scaled so the `fit` dimension hits `size`, grounded. */
function build(def) {
  let P = [], N = [], C = [], I = [];
  for (const part of def.parts) {
    const m = load(part.kit, part.file, part.opt || {});
    const rot = part.rotY || 0, c = Math.cos(rot), s = Math.sin(rot), at = part.at || [0, 0, 0], sc = part.scale || 1;
    const base = P.length / 3;
    for (let i = 0; i < m.P.length; i += 3) {
      const x = m.P[i] * sc, y = m.P[i + 1] * sc, z = m.P[i + 2] * sc;
      P.push(x * c + z * s + at[0], y + at[1], -x * s + z * c + at[2]);
      const nx = m.N[i], ny = m.N[i + 1], nz = m.N[i + 2]; N.push(nx * c + nz * s, ny, -nx * s + nz * c);
    }
    C.push(...m.C); for (const k of m.I) I.push(k + base);
  }
  // global rotation + scale + grounding
  const rot = def.rotY || 0, c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i < P.length; i += 3) { const x = P[i], z = P[i + 2]; P[i] = x * c + z * s; P[i + 2] = -x * s + z * c; const nx = N[i], nz = N[i + 2]; N[i] = nx * c + nz * s; N[i + 2] = -nx * s + nz * c; }
  let bb = bbox(P);
  const dim = { x: bb.mx[0] - bb.mn[0], y: bb.mx[1] - bb.mn[1], z: bb.mx[2] - bb.mn[2] };
  const k = def.size / dim[def.fit || 'y'];
  const sx = def.sx || 1, sy = def.sy || 1, sz = def.sz || 1;
  const cx = def.centre === 'origin' ? 0 : (bb.mn[0] + bb.mx[0]) / 2, cz = def.centre === 'origin' ? 0 : (bb.mn[2] + bb.mx[2]) / 2;
  for (let i = 0; i < P.length; i += 3) { P[i] = (P[i] - cx) * k * sx; P[i + 1] = (P[i + 1] - bb.mn[1]) * k * sy; P[i + 2] = (P[i + 2] - cz) * k * sz; }
  if (def.tintOut) { for (let i = 0; i < C.length; i += 3) { const r = def.tintOut([C[i], C[i + 1], C[i + 2]], [P[i], P[i + 1], P[i + 2]]); C[i] = r[0]; C[i + 1] = r[1]; C[i + 2] = r[2]; } }
  bb = bbox(P);
  const glb = writeGLB([{ name: 'mesh', positions: P, normals: N, colors: C, indices: I }], { id: def.out, bbox: [...bb.mn, ...bb.mx].map((x) => +x.toFixed(3)) });
  const o = path.join(outDir, def.out); fs.mkdirSync(path.dirname(o), { recursive: true }); fs.writeFileSync(o, glb);
  console.log(def.out.padEnd(26), String(glb.length).padStart(7), 'B', String(I.length / 3).padStart(5), 'tris  bbox', bb.mn.map((x) => x.toFixed(2)).join(','), '->', bb.mx.map((x) => x.toFixed(2)).join(','));
}
const grey = (c, g) => c;
const DEFS = require('./props-defs.cjs')({ grey });
for (const d of DEFS) { try { build(d); } catch (e) { console.warn('FAILED', d.out, e.message); } }
