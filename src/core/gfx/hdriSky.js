// Poly Haven "pure sky" HDRIs (CC0, 1K .hdr, see CREDITS.md) used for image-based lighting on medium/high.
// Four skies are blended by the sun's elevation (night / dusk / sunset / noon) and rotated about Y so the sun of the
// HDRI sits at the azimuth of the game's sun. The visible sky stays procedural (moving clouds, stars, moon);
// the HDRIs only feed reflections / ambient. Loaded lazily; until they are ready the procedural capture is used.
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

// sun elevation (sin) at which each sky is shown at full weight
const SKIES = [
  { id: 'night', file: 'qwantani_night_puresky', s: -0.32, moon: true },
  { id: 'dusk', file: 'qwantani_dusk_2_puresky', s: -0.07 },
  { id: 'sunset', file: 'qwantani_sunset_puresky', s: 0.06 },
  { id: 'noon', file: 'qwantani_noon_puresky', s: 0.55 },
];

/** azimuth (atan2(z, x) convention of the sampling shader) of the brightest texel */
function sunAzimuth(tex) {
  const { data, width: w, height: h } = tex.image;
  let best = 0, bi = 0;
  // half-float bit patterns of positive numbers sort like the numbers themselves; look at G only
  for (let i = 0, n = w * h; i < n; i++) { const g = data[i * 4 + 1]; if (g > best) { best = g; bi = i; } }
  let sx = 0, sy = 0, cnt = 0; // centroid of the top 1% brightest ring around the max texel (handles a wide sun disc)
  const bx = bi % w, by = Math.floor(bi / w);
  for (let dy = -6; dy <= 6; dy++) for (let dx = -10; dx <= 10; dx++) {
    const x = (bx + dx + w) % w, y = Math.min(h - 1, Math.max(0, by + dy)), g = data[(y * w + x) * 4 + 1];
    if (g >= best - 0x0200) { sx += dx; sy += dy; cnt++; }
  }
  const u = ((bx + (cnt ? sx / cnt : 0) + 0.5) / w + 1) % 1;
  return (u - 0.5) * Math.PI * 2;
}

const VERT = 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }';
const FRAG = `uniform sampler2D tA; uniform sampler2D tB; uniform float uMix; uniform vec2 uRotA; uniform vec2 uRotB;
uniform float uSat; uniform float uGain; uniform float uClamp; uniform vec3 uTint; varying vec3 vDir;
vec3 smp(sampler2D t, vec3 d, vec2 cs){
  vec3 r = vec3(d.x*cs.x - d.z*cs.y, d.y, d.x*cs.y + d.z*cs.x);
  vec2 uv = vec2(atan(r.z, r.x)*0.15915494 + 0.5, asin(clamp(r.y,-1.0,1.0))*0.31830989 + 0.5);
  return texture2D(t, uv).rgb;
}
void main(){
  vec3 d = normalize(vDir);
  vec3 c = mix(smp(tA, d, uRotA), smp(tB, d, uRotB), uMix);
  float m = max(c.r, max(c.g, c.b)); if (m > uClamp) c *= uClamp / m;   // keep the sun disc out of the ambient/specular probe
  float l = dot(c, vec3(0.2126,0.7152,0.0722));
  c = mix(vec3(l), c, uSat) * uTint * uGain;
  gl_FragColor = vec4(c, 1.0);
}`;

export function createHdriSky() {
  const skies = [];
  let loaded = 0, started = false, failed = false;
  const U = {
    tA: { value: null }, tB: { value: null }, uMix: { value: 0 }, uRotA: { value: new THREE.Vector2(1, 0) }, uRotB: { value: new THREE.Vector2(1, 0) },
    uSat: { value: 1 }, uGain: { value: 1 }, uClamp: { value: 6 }, uTint: { value: new THREE.Color(1, 1, 1) },
  };
  const material = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 24, 12), material);
  mesh.frustumCulled = false; mesh.renderOrder = -10; mesh.visible = false;

  function load() {
    if (started) return; started = true;
    const loader = new HDRLoader();
    for (const def of SKIES) {
      loader.loadAsync(`./assets/hdri/${def.file}_1k.hdr`).then((tex) => {
        tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
        skies.push({ ...def, tex, az: sunAzimuth(tex) });
        skies.sort((a, b) => a.s - b.s);
        loaded++;
      }).catch((e) => { failed = true; console.warn('[hdri]', def.file, e.message); });
    }
  }

  /** Configure the blend for the game's sun direction. Returns false if the HDRIs are not (all) available. */
  function setup(sunDir, night) {
    if (failed || loaded < SKIES.length) return false;
    const s = sunDir.y;
    let i = 0; while (i < skies.length - 2 && s > skies[i + 1].s) i++;
    const a = skies[i], b = skies[i + 1];
    const k = Math.min(1, Math.max(0, (s - a.s) / (b.s - a.s))), m = k * k * (3 - 2 * k);
    const azG = Math.atan2(sunDir.z, sunDir.x), azM = Math.atan2(-sunDir.z, -sunDir.x);
    const rot = (sky, v) => { const d = sky.az - (sky.moon ? azM : azG); v.set(Math.cos(d), Math.sin(d)); };
    U.tA.value = a.tex; U.tB.value = b.tex; U.uMix.value = m; rot(a, U.uRotA.value); rot(b, U.uRotB.value);
    // neutral night reflections (the night sky is deep blue; the city lighting adds its own colour), restrained sunset
    U.uSat.value = 0.62 + 0.38 * (1 - night);
    U.uTint.value.setRGB(1 + 0.04 * night, 1, 1 - 0.05 * night);
    U.uGain.value = 1 - 0.2 * night;
    return true;
  }
  return { load, mesh, setup, get ready() { return !failed && loaded >= SKIES.length; } };
}
