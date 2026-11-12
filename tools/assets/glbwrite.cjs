// Minimal GLB writer: a flat list of named static meshes (position, normal, COLOR_0 vec3 float, uint16/32 indices).
// Optional `extras` is stored on the root scene node. No materials/textures: the game assigns materials by node name.
function writeGLB(meshes, extras) {
  const chunks = []; let off = 0;
  const bufferViews = [], accessors = [], gMeshes = [], nodes = [], children = [];
  const add = (typed, target) => {
    const buf = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    const pad = (4 - (buf.length % 4)) % 4;
    bufferViews.push({ buffer: 0, byteOffset: off, byteLength: buf.length, target });
    chunks.push(buf, Buffer.alloc(pad)); off += buf.length + pad;
    return bufferViews.length - 1;
  };
  for (const m of meshes) {
    const n = m.positions.length / 3;
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], m.positions[i * 3 + k]); mx[k] = Math.max(mx[k], m.positions[i * 3 + k]); }
    const attrs = {};
    const acc = (typed, type, ct, extra = {}) => { accessors.push({ bufferView: add(typed, 34962), componentType: ct, count: typed.length / ({ VEC3: 3, VEC2: 2 }[type]), type, ...extra }); return accessors.length - 1; };
    attrs.POSITION = acc(new Float32Array(m.positions), 'VEC3', 5126, { min: mn, max: mx });
    if (m.normals) attrs.NORMAL = acc(new Float32Array(m.normals), 'VEC3', 5126);
    if (m.colors) attrs.COLOR_0 = acc(new Float32Array(m.colors), 'VEC3', 5126);
    const big = n > 65535;
    const idx = big ? new Uint32Array(m.indices) : new Uint16Array(m.indices);
    accessors.push({ bufferView: add(idx, 34963), componentType: big ? 5125 : 5123, count: idx.length, type: 'SCALAR' });
    gMeshes.push({ name: m.name, primitives: [{ attributes: attrs, indices: accessors.length - 1, mode: 4 }] });
    nodes.push({ name: m.name, mesh: gMeshes.length - 1 });
    children.push(nodes.length - 1);
  }
  const root = { name: 'root', children, ...(extras ? { extras } : {}) };
  nodes.push(root);
  const json = {
    asset: { version: '2.0', generator: 'neon-coast tools/assets' },
    scene: 0, scenes: [{ nodes: [nodes.length - 1] }], nodes, meshes: gMeshes, accessors, bufferViews,
    buffers: [{ byteLength: off }],
  };
  let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const bin = Buffer.concat(chunks);
  const head = Buffer.alloc(12); head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const h1 = Buffer.alloc(8); h1.writeUInt32LE(js.length, 0); h1.write('JSON', 4);
  const h2 = Buffer.alloc(8); h2.writeUInt32LE(bin.length, 0); h2.write('BIN\0', 4);
  return Buffer.concat([head, h1, js, h2, bin]);
}
module.exports = { writeGLB };
