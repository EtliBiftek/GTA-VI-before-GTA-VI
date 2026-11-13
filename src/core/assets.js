// Neon Coast - tiny async asset manager for downloaded (CC0 / CC-BY) glTF models. See CREDITS.md.
//
// Contract: the game always boots with its procedural models; callers ask `assets.load(name)` (or `preload`) and SWAP IN the
// result when the promise resolves. A missing / broken file resolves to `null` and is remembered in `assets.failed`;
// nothing is ever thrown into the game loop.
//
//   assets.load('vehicles/sedan.glb')  -> Promise<gltf | null>     (cached; concurrent calls share one request)
//   assets.preload(['a.glb', ...])     -> Promise<void>
//   assets.get(name)                   -> gltf | null              (sync, only if already loaded)
//   assets.clone(name)                 -> Object3D | null          (SkeletonUtils.clone: safe for skinned meshes)
//   assets.node(name, nodeName)        -> Object3D | null          (first node with that name in the shared scene)
//   assets.geometry(name, nodeName)    -> BufferGeometry | null    (shared, do not mutate)
//   assets.bake(name, opts)            -> [{ geometry, material }] scene meshes baked into root space, merged per material
//   assets.onLoad(fn)                  -> unsubscribe              fn(name, gltf) after every successful load
//
// Files live in public/assets/models/ and are requested with RELATIVE urls (./assets/models/...) because the production build
// runs from file:// (Electron) and from the Capacitor WebView. fetch() cannot read file:// in Chromium, so we fall back to XHR.
// Every glb is self-contained (embedded buffers / textures) so no secondary request is ever needed.
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const BASE = './assets/models/';

function readBytes(url) {
  return new Promise((resolve, reject) => {
    const viaXhr = () => {
      const x = new XMLHttpRequest();
      x.open('GET', url);
      x.responseType = 'arraybuffer';
      x.onload = () => ((x.status === 200 || (x.status === 0 && x.response && x.response.byteLength)) ? resolve(x.response) : reject(new Error('HTTP ' + x.status)));
      x.onerror = () => reject(new Error('network error'));
      x.send();
    };
    if (typeof fetch !== 'function' || (typeof location !== 'undefined' && location.protocol === 'file:')) { viaXhr(); return; }
    fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('HTTP ' + r.status)))).then(resolve, viaXhr);
  });
}

export function createAssets() {
  const loader = new GLTFLoader();
  const cache = new Map();      // name -> gltf
  const pending = new Map();    // name -> Promise
  const failed = new Set();
  const listeners = new Set();

  function load(name) {
    if (cache.has(name)) return Promise.resolve(cache.get(name));
    if (failed.has(name)) return Promise.resolve(null);
    let p = pending.get(name);
    if (p) return p;
    p = readBytes(BASE + name)
      .then((buf) => new Promise((resolve, reject) => loader.parse(buf, BASE, resolve, reject)))
      .then((gltf) => {
        cache.set(name, gltf);
        for (const fn of listeners) { try { fn(name, gltf); } catch (e) { console.warn('[assets] listener failed', e); } }
        return gltf;
      })
      .catch((e) => { failed.add(name); console.warn('[assets] could not load', name, '- keeping procedural fallback.', e?.message || e); return null; })
      .finally(() => pending.delete(name));
    pending.set(name, p);
    return p;
  }

  const api = {
    load,
    preload: (names) => Promise.all(names.map(load)).then(() => undefined),
    get: (name) => cache.get(name) || null,
    has: (name) => cache.has(name),
    failed,
    onLoad(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    clone(name) {
      const g = cache.get(name);
      return g ? SkeletonUtils.clone(g.scene) : null;
    },
    node(name, nodeName) {
      const g = cache.get(name);
      return g ? g.scene.getObjectByName(nodeName) || null : null;
    },
    geometry(name, nodeName) {
      const n = api.node(name, nodeName);
      return n && n.isMesh ? n.geometry : null;
    },
    /** Bake every mesh of a loaded scene into one shared geometry per material (positions in the scene's root space, with
     *  `scale`/`translate` applied). opts: { scale, offset:[x,y,z], filter(mesh), attributes:['position','normal','color','uv'] }. */
    bake(name, opts = {}) {
      const g = cache.get(name);
      if (!g) return null;
      const attrs = opts.attributes || ['position', 'normal', 'color', 'uv'];
      g.scene.updateMatrixWorld(true);
      const groups = new Map();
      g.scene.traverse((o) => {
        if (!o.isMesh || (opts.filter && !opts.filter(o))) return;
        const geo = o.geometry.clone();
        for (const k of Object.keys(geo.attributes)) if (!attrs.includes(k)) geo.deleteAttribute(k);
        geo.applyMatrix4(o.matrixWorld);
        const key = o.material.uuid;
        if (!groups.has(key)) groups.set(key, { material: o.material, list: [] });
        groups.get(key).list.push(geo);
      });
      const out = [];
      for (const { material, list } of groups.values()) {
        // attribute sets must agree to merge: drop attributes that are not present on every piece
        const common = Object.keys(list[0].attributes).filter((k) => list.every((x) => x.attributes[k]));
        for (const x of list) for (const k of Object.keys(x.attributes)) if (!common.includes(k)) x.deleteAttribute(k);
        const idx = list.filter((x) => x.index).length;
        if (idx && idx !== list.length) for (const x of list) if (!x.index) { const n = x.attributes.position.count; x.setIndex(Array.from({ length: n }, (_, i) => i)); }
        const geometry = list.length === 1 ? list[0] : mergeGeometries(list, false);
        if (!geometry) continue;
        if (opts.scale) geometry.scale(opts.scale, opts.scale, opts.scale);
        if (opts.offset) geometry.translate(opts.offset[0], opts.offset[1], opts.offset[2]);
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        out.push({ geometry, material });
      }
      return out;
    },
  };
  return api;
}

/** Shared singleton used by the game. */
export const assets = createAssets();
if (typeof window !== 'undefined') window.neonAssets = assets; // debugging / tests
