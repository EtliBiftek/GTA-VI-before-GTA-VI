// Offline asset conversion: Quaternius "Ultimate Animated Character Pack" (CC0, FBX) -> game-ready GLBs.
//   node tools/assets/build-characters.cjs <pack FBX dir> <out dir> [Model1 Model2 ...]
// Runs the conversion inside headless Chromium (Playwright) with three's FBXLoader + GLTFExporter, served from a tiny local http server.
// Output per character: <out>/<name>.glb  = ONE skinned mesh + skeleton, no animations, flat-shaded (no normals), the pack's per-material
//   groups folded into a single primitive whose UV.x selects a palette row (extras.palette = [{name,color}]) so the game can recolour
//   shirt / pants / skin / hair per instance with a tiny DataTexture and still draw each character with ONE draw call.
// Output once:   <out>/anim.glb   = skeleton + the clips the game uses (shared by every character: identical rig).
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const [,, fbxDir, outDir, ...only] = process.argv;
if (!fbxDir || !outDir) { console.error('usage: node build-characters.cjs <fbxDir> <outDir> [models...]'); process.exit(1); }
const THREE_DIR = path.resolve(__dirname, '../../node_modules/three');
const MODELS = only.length ? only : ['Casual2_Male', 'Casual_Bald', 'Casual_Female', 'Casual2_Female', 'Casual_Male', 'Casual3_Male', 'Worker_Male', 'BlueSoldier_Male', 'Ninja_Male'];
const KEEP_CLIPS = ['Idle', 'Walk', 'Punch', 'Shoot_OneHanded', 'Defeat', 'SitDown', 'RecieveHit', 'StandUp'];
const ANIM_SOURCE = 'Casual2_Male';

const HTML = `<!doctype html><script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
const b64 = (buf) => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const exportGLB = (root, animations) => new Promise((res, rej) => new GLTFExporter().parse(root, (b) => res(b64(b)), rej, { binary: true, animations: animations || [], onlyVisible: false }));
const load = (url) => new Promise((res, rej) => new FBXLoader().load(url, res, undefined, rej));
window.convert = async (url, name, keep, animOnly) => {
  const o = await load(url);
  const mesh = o.getObjectByProperty('isSkinnedMesh', true);
  const g = mesh.geometry, mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const idx = g.index ? g.index.array : null, n = idx ? idx.length : g.attributes.position.count;
  const uv = new Float32Array(g.attributes.position.count * 2); // non-indexed? then per vertex; indexed: per vertex too (groups give role)
  const role = new Int32Array(g.attributes.position.count).fill(0);
  for (const gr of g.groups) for (let i = gr.start; i < gr.start + gr.count; i++) role[idx ? idx[i] : i] = gr.materialIndex;
  for (let i = 0; i < role.length; i++) { uv[i * 2] = (role[i] + 0.5) / 8; uv[i * 2 + 1] = 0.5; }
  let ng = new THREE.BufferGeometry();
  ng.setAttribute('position', g.attributes.position); ng.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  ng.setAttribute('skinIndex', g.attributes.skinIndex); ng.setAttribute('skinWeight', g.attributes.skinWeight);
  if (idx) ng.setIndex(g.index);
  ng = mergeVertices(ng, 1e-4);
  const clips = o.animations.filter((a) => keep.some((k) => a.name.endsWith('|' + k))).map((a) => {
    const c = a.clone(); c.name = a.name.split('|').pop();
    c.tracks = c.tracks.filter((t) => !t.name.endsWith('.scale') && (!t.name.endsWith('.position') || t.name.startsWith('Hips.')));
    return c;
  });
  const info = { tris: ng.index.count / 3, verts: ng.attributes.position.count, bones: mesh.skeleton.bones.length };
  if (animOnly) { mesh.removeFromParent(); return { info, glb: await exportGLB(o, clips), clips: clips.map((c) => c.name + ':' + c.duration.toFixed(2) + ':' + c.tracks.length) }; }
  mesh.geometry = ng; mesh.name = 'BodyMesh';
  mesh.material = new THREE.MeshBasicMaterial({ name: 'Palette' });
  mesh.userData.palette = mats.map((m) => ({ name: m.name, color: m.color.getHexString() }));
  o.animations = [];
  return { info, glb: await exportGLB(o, []) };
};
window.ready = true;
</script>`;

const mime = { '.js': 'text/javascript', '.html': 'text/html' };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/') { r.writeHead(200, { 'content-type': 'text/html' }); return r.end(HTML); }
  const f = u.startsWith('/three/') ? path.join(THREE_DIR, u.slice(7)) : u.startsWith('/fbx/') ? path.join(fbxDir, u.slice(5)) : null;
  if (!f || !(f.startsWith(THREE_DIR) || f.startsWith(path.resolve(fbxDir)))) { r.writeHead(403); return r.end(); }
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
});
(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error', e.message));
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction('window.ready');
  const run = async (name, animOnly) => {
    const r = await page.evaluate(([u, n, k, a]) => window.convert(u, n, k, a), [`/fbx/${name}.fbx`, name, KEEP_CLIPS, animOnly]);
    const file = path.join(outDir, (animOnly ? 'anim' : name.toLowerCase()) + '.glb');
    fs.writeFileSync(file, Buffer.from(r.glb, 'base64'));
    console.log(path.basename(file), fs.statSync(file).size, 'B', JSON.stringify(r.info), r.clips ? r.clips.join(' ') : '');
  };
  await run(ANIM_SOURCE, true);
  for (const m of MODELS) await run(m, false);
  await browser.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
