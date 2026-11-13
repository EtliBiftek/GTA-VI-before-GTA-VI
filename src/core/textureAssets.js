// Downloaded CC0 PBR textures (Poly Haven / ambientCG, see CREDITS.md) layered over the procedural canvas textures.
// The game always starts with the canvas textures; the photographic maps are fetched in the background and SWAPPED INTO
// the existing THREE.Texture objects (image replaced, wrap/repeat/colour space set, GPU copy re-uploaded), so no material
// has to be rebuilt. If a file fails to load the canvas texture simply stays. URLs are relative ('./assets/...') so the
// build works from file:// (Electron) and the Capacitor WebView.
//   low    : colour maps only, 512 px
//   medium : colour (1K) + normal (1K) + roughness (512)
//   high   : same files, higher anisotropy
import * as THREE from 'three';

const ROOT = './assets/textures/';
const imgCache = new Map();
let failed = 0;

export function loadImage(rel) {
  let p = imgCache.get(rel);
  if (!p) {
    p = new Promise((res, rej) => {
      const im = new Image(); im.decoding = 'async';
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('texture failed: ' + rel));
      im.src = ROOT + rel;
    });
    imgCache.set(rel, p);
  }
  return p;
}
const OFF = typeof location !== 'undefined' && /[?&]notex\b/.test(location.search); // ?notex = A/B debugging with the canvas textures only
const later = (fn) => { if (OFF) return; if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 1500 }); else setTimeout(fn, 60); };
const warn = (e) => { if (failed++ < 3) console.warn('[textures]', e.message); };

/** Replace the contents of an existing texture with a loaded image. */
export function swapImage(tex, im, { srgb, repeat = [1, 1], aniso = 1 }) {
  tex.dispose();                       // drop the GPU copy of the canvas version (size may differ)
  tex.image = im;
  tex.onUpdate = null;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = aniso;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
}

/** Real-world size (metres) covered by one repeat of each downloaded texture. */
export const REAL = {
  asphalt: 1.8, slab: 2.24, cobble: 2.5, grass: 3.4, roof: 2.6,
  plaster: 2.4, concrete: 2.2, stone: 2.8, wood: 1.6,
};
const HAS = { // which maps exist per material
  asphalt: { n: 1, r: 1 }, slab: { n: 1, r: 1 }, cobble: { n: 1, r: 1 }, grass: { n: 1 }, roof: { n: 1, r: 1 },
  plaster: { n: 1 }, concrete: { n: 1 }, stone: {}, wood: {},
};

/**
 * Upgrade a canvas texture set { map, normalMap?, roughnessMap? } with the downloaded material `id`.
 * `tile` = metres covered by one UV unit of the procedural texture (so the real photo scale is kept).
 */
export function upgradeSet(set, id, tier, aniso, tile) {
  const rep = tile / REAL[id], repeat = [rep, rep], has = HAS[id];
  const job = (key, file, srgb) => {
    const t = set[key]; if (!t) return;
    later(() => loadImage(`${id}/${file}`).then((im) => swapImage(t, im, { srgb, repeat, aniso })).catch(warn));
  };
  job('map', tier === 0 ? 'color_512.jpg' : 'color.jpg', true);
  if (tier >= 1) {
    if (has.n) job('normalMap', 'normal.jpg', false);
    if (has.r) job('roughnessMap', 'rough.jpg', false);
  }
  return set;
}

// ------------------------------------------------------------------------------------------------------------------
// Detail overlays (shader patches): photographic grain multiplied onto the procedural facade wall pixels (windows are
// left alone) and onto the merged "solid" geometry (monuments, bridges, quays, piers) via triplanar world-space mapping.
// ------------------------------------------------------------------------------------------------------------------
const flatCanvas = (r, g, b) => { const c = document.createElement('canvas'); c.width = c.height = 2; const x = c.getContext('2d'); x.fillStyle = `rgb(${r},${g},${b})`; x.fillRect(0, 0, 2, 2); return c; };
const detailCache = new Map();
/** Shared placeholder-then-swap textures for a detail material. */
function detail(id, tier, aniso) {
  const k = id + tier;
  let d = detailCache.get(k);
  if (d) return d;
  const mk = (canvas, srgb) => { const t = new THREE.CanvasTexture(canvas); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
  d = { id, map: mk(flatCanvas(255, 255, 255), true), normal: tier >= 1 && HAS[id].n ? mk(flatCanvas(128, 128, 255), false) : null, ready: { value: 0 } };
  detailCache.set(k, d);
  later(() => {
    loadImage(`${id}/${tier === 0 ? 'color_512.jpg' : 'color.jpg'}`).then((im) => {
      swapImage(d.map, im, { srgb: true, aniso }); d.ready.value = 1;
    }).catch(warn);
    if (d.normal) loadImage(`${id}/normal.jpg`).then((im) => swapImage(d.normal, im, { srgb: false, aniso })).catch(warn);
  });
  return d;
}

const FAC = { // facade kind -> detail material, strength, normal strength
  deco: { id: 'plaster', amt: 0.85, ns: 0.9 },
  house: { id: 'plaster', amt: 0.8, ns: 0.9 },
  industrial: { id: 'concrete', amt: 0.9, ns: 0.8 },
};
/** Blend a photographic wall material under the procedural window layout of a facade material (call after creating it). */
export function patchFacade(mat, kind, tier, aniso, repW, repH) {
  const cfg = FAC[kind]; if (!cfg || !mat) return;
  const d = detail(cfg.id, tier, aniso), real = REAL[cfg.id];
  const u = { uDtA: { value: d.map }, uDtN: { value: d.normal }, uDtRep: { value: new THREE.Vector2(repW / real, repH / real) }, uDtAmt: d.ready, uDtAmtK: { value: cfg.amt * (tier === 0 ? 0.65 : 1) }, uDtNS: { value: cfg.ns } };
  const prev = mat.onBeforeCompile, withN = !!d.normal && !!mat.normalMap;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uDtA; uniform vec2 uDtRep; uniform float uDtAmt; uniform float uDtAmtK;' + (withN ? ' uniform sampler2D uDtN; uniform float uDtNS;' : ''))
      .replace('#include <map_fragment>', `#include <map_fragment>
        float wallM = smoothstep(0.62, 0.86, min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b))) * uDtAmt * uDtAmtK;
        vec2 dUv = vMapUv * uDtRep;
        diffuseColor.rgb *= mix(vec3(1.0), texture2D(uDtA, dUv).rgb * 1.28, wallM);`);
    if (withN) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec3 dn = texture2D(uDtN, dUv).xyz * 2.0 - 1.0; mat3 tbd = getTangentFrame(-vViewPosition, normal, dUv); normal = normalize(normal + (tbd[0] * dn.x + tbd[1] * dn.y) * uDtNS * wallM); }`);
  };
  mat.needsUpdate = true;
}

/** Triplanar stone (everything) + weathered wood (brown vertex colours) detail on the merged solid-geometry material. */
export function patchSolid(mat, tier, aniso) {
  if (!mat || tier === 0) return;
  const stone = detail('stone', tier, aniso), wood = detail('wood', tier, aniso);
  const u = { uStoneT: { value: stone.map }, uWoodT: { value: wood.map }, uStoneK: stone.ready, uWoodK: wood.ready, uStoneS: { value: 1 / REAL.stone }, uWoodS: { value: 1 / REAL.wood } };
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWn;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWn = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWn; uniform sampler2D uStoneT; uniform sampler2D uWoodT; uniform float uStoneK; uniform float uWoodK; uniform float uStoneS; uniform float uWoodS;\nvec3 triW(vec3 n){ vec3 a = pow(abs(n), vec3(4.0)); return a / (a.x + a.y + a.z + 1e-4); }')
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 tw = triW(normalize(vWn));
          float st = texture2D(uStoneT, vWp.zy * uStoneS).r * tw.x + texture2D(uStoneT, vWp.xz * uStoneS).r * tw.y + texture2D(uStoneT, vWp.xy * uStoneS).r * tw.z;
          float wd = texture2D(uWoodT, vWp.zy * uWoodS).r * tw.x + texture2D(uWoodT, vWp.xz * uWoodS).r * tw.y + texture2D(uWoodT, vWp.xy * uWoodS).r * tw.z;
          float mx = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)), mn = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b)), sat = (mx - mn) / (mx + 1e-4);
          float woodM = smoothstep(0.42, 0.55, sat) * smoothstep(0.0, 0.04, diffuseColor.r - diffuseColor.g) * smoothstep(0.0, 0.03, diffuseColor.g - diffuseColor.b) * (1.0 - smoothstep(0.45, 0.58, mx)) * smoothstep(0.12, 0.2, mx);
          float d = mix(mix(1.0, st * 1.28, uStoneK), mix(1.0, wd * 1.28, uWoodK), woodM);
          diffuseColor.rgb *= mix(1.0, d, 0.9);
        }`);
  };
  mat.needsUpdate = true;
}

/** Tileable water normal map: swap into the generated one (data map, repeat 1:1 so the shader's world scale is unchanged). */
export function upgradeWaterNormal(tex, tier, aniso) {
  if (!tex || tier === 0) return;
  later(() => loadImage('water/normal.jpg').then((im) => swapImage(tex, im, { srgb: false, aniso })).catch(() => {}));
}
