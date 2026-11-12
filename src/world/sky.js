// Sky dome (gradient, sun disc + halo, procedural moving clouds, stars, moon), sun/moon/hemisphere lights with a tight
// player-following shadow frustum, fog matched to the horizon, day/night cycle and the animated ocean.
import * as THREE from 'three';
import { clamp } from '../core/utils.js';
import { makeWaterNormal, TIER } from './textures.js';

const K = (t, top, hor, sun, sunI, hemiS, hemiG, hemiI, moonI, night, water) => ({ t, top, hor, sun, sunI, hemiS, hemiG, hemiI, moonI, night, water });
const KEYS = [
  K(0, 0x050a24, 0x16204a, 0x7080ff, 0, 0x404a6c, 0x141626, 0.6, 0.45, 1, 0x0b1f45),
  K(4.5, 0x070c2a, 0x1b2552, 0x7080ff, 0, 0x404a6c, 0x141626, 0.6, 0.45, 1, 0x0b1f45),
  K(5.75, 0x2b3b78, 0xe0907c, 0xffa88a, 0, 0x7a78a8, 0x2a2838, 0.6, 0.3, 0.7, 0x2a3a6a),
  K(6.75, 0x4a78c8, 0xffb98a, 0xffc890, 1.2, 0x9db4e0, 0x6a5a50, 0.8, 0, 0.1, 0x2f8ab0),
  K(9, 0x3a82e0, 0xb4d8f0, 0xfff2dc, 2.6, 0xbcd8ff, 0x8a8272, 1.0, 0, 0, 0x1b739c),
  K(13, 0x2d78dc, 0xa8d4f4, 0xfffbf0, 2.9, 0xbcd8ff, 0x8a8272, 1.0, 0, 0, 0x18709d),
  K(16.5, 0x3a7fd6, 0xb8d6ee, 0xfff0d0, 2.6, 0xbcd8ff, 0x8a8272, 1.0, 0, 0, 0x1b739c),
  K(17.75, 0x4a68b8, 0xffc088, 0xffa860, 1.9, 0xe2c4a2, 0x7a5a50, 0.85, 0, 0.05, 0x2a86b0),
  K(18.6, 0x3d4a96, 0xff9858, 0xffa064, 1.1, 0xd8b090, 0x4a3e40, 0.8, 0.1, 0.6, 0x5a5a8a),
  K(19.5, 0x1e2260, 0xc4685c, 0xd45e48, 0.2, 0x7a6a98, 0x2a2838, 0.6, 0.3, 0.95, 0x35406a),
  K(21, 0x0a1032, 0x252a58, 0x7080ff, 0, 0x404a6c, 0x141626, 0.6, 0.45, 1, 0x0f1f50),
  K(24, 0x050a24, 0x16204a, 0x7080ff, 0, 0x404a6c, 0x141626, 0.6, 0.45, 1, 0x0b1f45),
].map((k) => { for (const f of ['top', 'hor', 'sun', 'hemiS', 'hemiG', 'water']) k[f] = new THREE.Color(k[f]); return k; });

const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

const NOISE_GLSL = `
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1.0,0.0)),f.x), mix(h21(i+vec2(0.0,1.0)),h21(i+vec2(1.0,1.0)),f.x), f.y); }
`;

export function createSky(game, onEnv, waterGeo, shore) {
  const scene = game.scene, tier = TIER(game.settings.quality);
  const cur = { top: new THREE.Color(), hor: new THREE.Color(), sun: new THREE.Color(), hemiS: new THREE.Color(), hemiG: new THREE.Color(), water: new THREE.Color(), sunI: 0, hemiI: 0, moonI: 0, night: 0 };
  const sunDir = new THREE.Vector3(0, 1, 0.3).normalize(), moonDir = new THREE.Vector3(), tmp = new THREE.Vector3(), target = new THREE.Vector3(), fwd = new THREE.Vector3(), fogC = new THREE.Color();
  const U = {
    top: { value: cur.top }, hor: { value: cur.hor }, sunDir: { value: sunDir }, moonDir: { value: moonDir }, sunCol: { value: cur.sun },
    time: { value: 0 }, night: { value: 0 }, sunVis: { value: 1 }, light: { value: 1 }, cover: { value: 0.5 },
  };

  // ---- dome ----
  const domeMat = new THREE.ShaderMaterial({
    uniforms: U, defines: { OCT: tier === 0 ? 3 : tier === 1 ? 4 : 5 },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 moonDir; uniform vec3 sunCol;
      uniform float time; uniform float night; uniform float sunVis; uniform float light; uniform float cover; varying vec3 vDir;
      ${NOISE_GLSL}
      float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<OCT;i++){ s+=a*vn(p); p=p*2.03+vec2(17.1,9.2); a*=0.5; } return s; }
      float hash3(vec3 p){ p = fract(p*0.3183099+vec3(0.1,0.2,0.3)); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      void main(){
        vec3 d = normalize(vDir); float y = d.y; float h = clamp(y,0.0,1.0);
        float s = max(dot(d, sunDir),0.0);
        float mie = (pow(s,6.0)*0.45 + pow(s,2.0)*0.08)*sunVis;
        vec3 hz = hor + sunCol*mie;
        vec3 col = mix(hz, top + sunCol*mie*0.25, pow(h,0.5));
        col = mix(col, top*0.92, smoothstep(0.5,1.0,h)*0.4);
        // sun disc + halo
        float sd = smoothstep(0.99996, 0.99999, dot(d,sunDir));
        col += sunCol*(pow(s,90.0)*0.7 + pow(s,400.0)*1.6)*sunVis;
        // clouds
        float dens = 0.0, shade = 1.0;
        if (y > 0.0) {
          vec2 p = d.xz/(y+0.14)*0.55 + vec2(time*0.010, time*0.004);
          float f = fbm(p*1.3);
          dens = smoothstep(cover, cover+0.26, f) * smoothstep(0.0,0.16,y);
          float f2 = fbm(p*1.3 + sunDir.xz*0.10);
          shade = clamp(0.55 + (f - f2)*5.5, 0.0, 1.0);
          vec3 lit = mix(vec3(1.0), sunCol, 0.45)*(0.5+0.75*light)*mix(0.14,1.0,smoothstep(0.0,0.5,light)) + top*0.15;
          vec3 dark = top*0.65 + hor*0.35 + vec3(0.05);
          vec3 cc = mix(dark, lit, shade);
          cc += sunCol*pow(s,10.0)*0.6*sunVis*(1.0-dens*0.4);
          cc = mix(cc, hz*0.9, (1.0-smoothstep(0.0,0.45,y))*0.55);
          col = mix(col, cc, dens*0.93);
        }
        col += sunCol*sd*14.0*sunVis*(1.0-dens);
        // moon + stars
        float stars = 0.0;
        if (night > 0.02 && y > -0.02) {
          vec3 sp = d*160.0; vec3 id = floor(sp); float r = hash3(id); vec3 f = fract(sp)-0.5;
          float tw = 0.6 + 0.4*sin(time*2.0 + r*60.0);
          stars = step(0.987, r) * smoothstep(0.35, 0.0, length(f)) * tw * (0.5 + r);
          stars += step(0.9985, hash3(floor(d*60.0)+7.0)) * smoothstep(0.4,0.0,length(fract(d*60.0)-0.5))*1.4;
          col += vec3(0.85,0.9,1.0)*stars*night*smoothstep(0.0,0.2,y)*(1.0-dens)*2.0;
          float md = dot(d, moonDir);
          float disc = smoothstep(0.99955, 0.99965, md);
          vec2 mp = vec2(dot(d, normalize(cross(moonDir, vec3(0,1,0)))), dot(d, normalize(cross(moonDir, normalize(cross(moonDir, vec3(0,1,0)))))))*34.0;
          float maria = fbm(mp*2.2+3.0);
          vec3 mc = mix(vec3(0.62,0.66,0.74), vec3(0.97,0.97,1.0), smoothstep(0.35,0.7,maria));
          col += (mc*disc*2.2 + vec3(0.55,0.65,1.0)*(pow(max(md,0.0),300.0)*0.5 + pow(max(md,0.0),30.0)*0.05))*night*(1.0-dens*0.85)*step(0.0,moonDir.y+0.03);
        }
        if (y < 0.0) col = hz;
        gl_FragColor = vec4(col,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), domeMat);
  dome.frustumCulled = false; dome.renderOrder = -10; scene.add(dome);

  // ---- lights ----
  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  const moonLight = new THREE.DirectionalLight(0xa8b4d8, 0.3);
  const hemi = new THREE.HemisphereLight(0xbcd8ff, 0x8a8272, 1);
  const SHADOW_R = 70, SHADOW_MAP = 2048;
  sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  const sc = sun.shadow.camera; sc.left = -SHADOW_R; sc.right = SHADOW_R; sc.top = SHADOW_R; sc.bottom = -SHADOW_R; sc.near = 20; sc.far = 640; sc.updateProjectionMatrix();
  sun.shadow.bias = -0.00015; sun.shadow.normalBias = 0.045; sun.shadow.radius = 1.5;
  scene.add(sun, sun.target, moonLight, moonLight.target, hemi);
  scene.fog = new THREE.Fog(0xa8d4f4, 100, 300);

  // ---- ocean ----
  const waterUni = { uTime: { value: 0 }, uWaveN: { value: makeWaterNormal(tier) }, uShallow: { value: new THREE.Color(0x4fe0d0) }, uAmp: { value: 0.55 }, uShore: { value: shore?.tex || null }, uHalf: { value: shore?.half || 800 } };
  waterUni.uWaveN.value.anisotropy = tier > 0 ? 4 : 1;
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x1aa6c0, roughness: 0.1, metalness: 0.05, envMapIntensity: 1.6 });
  waterMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, waterUni);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix*vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos; uniform float uTime; uniform sampler2D uWaveN; uniform vec3 uShallow; uniform float uAmp; uniform sampler2D uShore; uniform float uHalf;\n${NOISE_GLSL}\nfloat foamMask = 0.0;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float sdist = texture2D(uShore, clamp((vWPos.xz + uHalf)/(2.0*uHalf), 0.0, 1.0)).r*48.0;
        float shallow = 1.0 - smoothstep(0.0, 26.0, sdist);
        diffuseColor.rgb = mix(diffuseColor.rgb, uShallow*(diffuseColor.rgb*1.4+0.1), shallow*0.5);
        float fn = vn(vWPos.xz*0.45 + uTime*0.08);
        float wv = sin(sdist*0.8 - uTime*1.5 + fn*4.0)*0.5+0.5;
        foamMask = smoothstep(3.4, 0.0, sdist)*(0.35+0.65*wv)*smoothstep(0.25,0.6,fn+0.25) + smoothstep(0.9,0.0,sdist);
        foamMask = clamp(foamMask,0.0,1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95,0.98,1.0), foamMask*0.92);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.85, foamMask);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec2 wp = vWPos.xz;
          float amp = uAmp*mix(1.0,0.3,smoothstep(40.0,420.0,length(vViewPosition)))*(1.0-foamMask*0.7);
          vec3 nA = texture2D(uWaveN, wp*0.045 + uTime*vec2(0.021,0.013)).xyz*2.0-1.0;
          vec3 nB = texture2D(uWaveN, wp*0.12 - uTime*vec2(0.017,0.029) + 0.37).xyz*2.0-1.0;
          vec3 nC = texture2D(uWaveN, wp*0.33 + uTime*vec2(-0.04,0.03)).xyz*2.0-1.0;
          vec3 wn = normalize(vec3((nA.x+nB.x*0.7+nC.x*0.4)*amp, 1.0, (nA.y+nB.y*0.7+nC.y*0.4)*amp));
          normal = normalize((viewMatrix*vec4(wn,0.0)).xyz);
        }`);
  };
  const water = new THREE.Mesh(waterGeo, waterMat);
  scene.add(water);

  let q = game.q;
  const applyQ = () => { q = game.q; sun.castShadow = !!q.shadows; };
  applyQ();
  game.events.on('settings:changed', applyQ);

  function sample(t) {
    let a = KEYS[0], b = KEYS[1];
    for (let i = 0; i < KEYS.length - 1; i++) if (t >= KEYS[i].t && t <= KEYS[i + 1].t) { a = KEYS[i]; b = KEYS[i + 1]; break; }
    const k = (t - a.t) / (b.t - a.t || 1);
    for (const f of ['top', 'hor', 'sun', 'hemiS', 'hemiG', 'water']) cur[f].lerpColors(a[f], b[f], k);
    for (const f of ['sunI', 'hemiI', 'moonI', 'night']) cur[f] = a[f] + (b[f] - a[f]) * k;
  }

  const state = { nightFactor: 0 };
  let clock = 0;
  function update(dt) {
    clock += dt;
    const st = game.state;
    st.timeOfDay = (st.timeOfDay + dt * (24 / 1200)) % 24;
    const t = st.timeOfDay;
    sample(t);
    const a = ((t - 6.5) / 12.5) * Math.PI;
    sunDir.set(-Math.cos(a), Math.sin(a), 0.3).normalize();
    moonDir.copy(sunDir).multiplyScalar(-1);
    const cam = game.camera.position;
    dome.position.copy(cam);
    const nightF = sm(0.3, 0.9, cur.night);
    state.nightFactor = nightF;
    U.time.value = clock; U.night.value = nightF; U.sunVis.value = sm(-0.12, 0.08, sunDir.y); U.light.value = clamp(cur.sunI / 2.6, 0, 1);
    U.cover.value = 0.5 + 0.06 * Math.sin(clock * 0.003 + t);
    // lights: tight shadow frustum that follows the player, snapped to shadow texels
    const follow = game.player?.position || cam;
    const T = (SHADOW_R * 2) / SHADOW_MAP;
    target.set(Math.round(follow.x / T) * T, 0, Math.round(follow.z / T) * T);
    tmp.copy(sunDir); tmp.y = Math.max(tmp.y, 0.08); tmp.normalize();
    sun.color.copy(cur.sun); sun.intensity = cur.sunI * (sunDir.y > -0.1 ? 1 : 0);
    sun.target.position.copy(target); sun.position.copy(target).addScaledVector(tmp, 320);
    moonLight.intensity = cur.moonI + cur.night * 1.2; tmp.copy(moonDir); tmp.y = Math.max(tmp.y, 0.15); tmp.normalize();
    moonLight.target.position.copy(target); moonLight.position.copy(target).addScaledVector(tmp, 200);
    hemi.color.copy(cur.hemiS); hemi.groundColor.copy(cur.hemiG); hemi.intensity = cur.hemiI + cur.night * 2.2;
    // fog matches the dome's horizon colour (incl. the sun-side haze in the view direction)
    const menu = st.mode === 'menu', dd = q.drawDistance * (menu ? 2.1 : 1); // menu fly-around: push the haze out so the city stays crisp
    game.camera.getWorldDirection(fwd); fwd.y = 0; if (fwd.lengthSq() > 1e-6) fwd.normalize();
    const s = Math.max(fwd.dot(sunDir), 0), mie = (Math.pow(s, 6) * 0.45 + s * s * 0.08) * U.sunVis.value;
    fogC.setRGB(cur.hor.r + cur.sun.r * mie, cur.hor.g + cur.sun.g * mie, cur.hor.b + cur.sun.b * mie);
    scene.fog.color.copy(fogC); scene.fog.near = dd * (menu ? 0.62 : 0.4); scene.fog.far = dd * 1.25;
    // water
    waterMat.color.copy(cur.water); waterUni.uTime.value = clock;
    waterUni.uShallow.value.setRGB(0.32, 0.9, 0.8).multiplyScalar(0.35 + 0.65 * (1 - nightF)).lerp(cur.water, nightF * 0.6);
    onEnv({ night: cur.night, windowI: sm(0.15, 0.7, cur.night) * 1.4, lampOn: sm(0.3, 0.6, cur.night), nightF, sunDir, sunI: cur.sunI });
  }
  update(0);
  return { update, sun, hemi, dome, water, state, sunDir };
}
