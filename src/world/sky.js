// Sky dome, stars, moon, sun/moon/hemisphere lights, fog, day/night cycle, animated ocean.
import * as THREE from 'three';
import { clamp } from '../core/utils.js';
import { makeMoon, makeWater } from './textures.js';
import { seeded } from '../core/utils.js';

const K = (t, top, hor, sun, sunI, hemiS, hemiG, hemiI, moonI, night, water) => ({ t, top, hor, sun, sunI, hemiS, hemiG, hemiI, moonI, night, water });
const KEYS = [
  K(0, 0x050a24, 0x16204a, 0x7080ff, 0, 0x3a4a8a, 0x141626, 0.6, 0.45, 1, 0x0b1f45),
  K(4.5, 0x070c2a, 0x1b2552, 0x7080ff, 0, 0x3a4a8a, 0x141626, 0.6, 0.45, 1, 0x0b1f45),
  K(5.75, 0x23336e, 0xe07a8a, 0xff9a80, 0, 0x6a6aa0, 0x2a2438, 0.6, 0.3, 0.7, 0x2a3a6a),
  K(6.75, 0x4a78c8, 0xffb98a, 0xffc890, 1.2, 0x9db4e0, 0x6a5a50, 0.8, 0, 0.1, 0x2f8ab0),
  K(9, 0x3a82e0, 0xb4d8f0, 0xfff2dc, 2.6, 0xbcd8ff, 0x8a8272, 1.0, 0, 0, 0x1aa6c0),
  K(13, 0x2d78dc, 0xa8d4f4, 0xfffbf0, 2.9, 0xbcd8ff, 0x8a8272, 1.0, 0, 0, 0x16a2c4),
  K(16.5, 0x3a7fd6, 0xb8d6ee, 0xfff0d0, 2.6, 0xbcd8ff, 0x8a8272, 1.0, 0, 0, 0x1a9ec0),
  K(17.75, 0x5068c8, 0xffc08a, 0xffa860, 1.9, 0xd8b8c0, 0x7a5a58, 0.85, 0, 0.05, 0x2a86b0),
  K(18.6, 0x3a3a9a, 0xff6a9e, 0xff6a50, 1.0, 0xc67aaa, 0x4a3050, 0.7, 0.1, 0.6, 0x6a4a9a),
  K(19.5, 0x1c1a5c, 0xb0489a, 0xd0407a, 0.2, 0x7a5aa0, 0x2a2040, 0.6, 0.3, 0.95, 0x3a2a6a),
  K(21, 0x080c34, 0x2a2260, 0x7080ff, 0, 0x3a4a8a, 0x141626, 0.6, 0.45, 1, 0x0f1f50),
  K(24, 0x050a24, 0x16204a, 0x7080ff, 0, 0x3a4a8a, 0x141626, 0.6, 0.45, 1, 0x0b1f45),
].map((k) => { for (const f of ['top', 'hor', 'sun', 'hemiS', 'hemiG', 'water']) k[f] = new THREE.Color(k[f]); return k; });

const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function createSky(game, onEnv, waterGeo) {
  const scene = game.scene;
  const cur = { top: new THREE.Color(), hor: new THREE.Color(), sun: new THREE.Color(), hemiS: new THREE.Color(), hemiG: new THREE.Color(), water: new THREE.Color(), sunI: 0, hemiI: 0, moonI: 0, night: 0 };
  const sunDir = new THREE.Vector3(), tmp = new THREE.Vector3(), target = new THREE.Vector3();

  // dome
  const domeMat = new THREE.ShaderMaterial({
    uniforms: { top: { value: cur.top }, hor: { value: cur.hor }, sunDir: { value: sunDir }, sunCol: { value: cur.sun }, glow: { value: 1 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; uniform float glow; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); float h = clamp(d.y,0.0,1.0);
        vec3 col = mix(hor, top, pow(h,0.55));
        float s = max(dot(d, normalize(sunDir)),0.0);
        col += sunCol*(pow(s,8.0)*0.35 + pow(s,500.0)*2.0)*glow;
        if (d.y < 0.0) col = hor;
        gl_FragColor = vec4(col,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 24, 12), domeMat);
  dome.frustumCulled = false; dome.renderOrder = -10; scene.add(dome);

  // stars
  const R = seeded(99), sp = new Float32Array(500 * 3);
  for (let i = 0; i < 500; i++) {
    const th = R() * Math.PI * 2, y = 0.05 + R() * 0.95, r = Math.sqrt(1 - y * y);
    sp[i * 3] = Math.cos(th) * r * 950; sp[i * 3 + 1] = y * 950; sp[i * 3 + 2] = Math.sin(th) * r * 950;
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const starMat = new THREE.PointsMaterial({ size: 1.8, sizeAttenuation: false, color: 0xffffff, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const stars = new THREE.Points(sg, starMat); stars.frustumCulled = false; stars.renderOrder = -9; scene.add(stars);
  const moonMat = new THREE.SpriteMaterial({ map: makeMoon(), transparent: true, opacity: 0, fog: false, depthWrite: false });
  const moon = new THREE.Sprite(moonMat); moon.scale.set(120, 120, 1); moon.renderOrder = -8; scene.add(moon);

  // lights
  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  const moonLight = new THREE.DirectionalLight(0x8fa8ff, 0.3);
  const hemi = new THREE.HemisphereLight(0xbcd8ff, 0x8a8272, 1);
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 1; sc.far = 600;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.5;
  scene.add(sun, sun.target, moonLight, moonLight.target, hemi);
  scene.fog = new THREE.Fog(0xa8d4f4, 100, 300);

  // ocean
  const waterTex = makeWater(); waterTex.repeat.set(40, 80);
  const water = new THREE.Mesh(waterGeo, new THREE.MeshPhongMaterial({ map: waterTex, color: 0x1aa6c0, shininess: 90, specular: 0x667788 }));
  scene.add(water);
  const foam = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });

  let q = game.q, mode = 'menu';
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

  let clock = 0;
  function update(dt) {
    clock += dt;
    const st = game.state;
    st.timeOfDay = (st.timeOfDay + dt * (24 / 1200)) % 24;
    const t = st.timeOfDay;
    sample(t);
    const a = ((t - 6.5) / 12.5) * Math.PI;
    sunDir.set(-Math.cos(a), Math.sin(a), 0.3).normalize();
    const cam = game.camera.position;
    dome.position.copy(cam); stars.position.copy(cam);
    moon.position.copy(cam).addScaledVector(tmp.copy(sunDir).multiplyScalar(-1), 900);
    const nightF = sm(0.3, 0.9, cur.night);
    starMat.opacity = nightF; moonMat.opacity = sunDir.y < 0.05 ? nightF : 0;
    // lights
    const follow = game.player?.position || cam;
    const T = 220 / 2048; // shadow texel size
    target.set(Math.round(follow.x / T) * T, 0, Math.round(follow.z / T) * T);
    tmp.copy(sunDir); tmp.y = Math.max(tmp.y, 0.05); tmp.normalize();
    sun.color.copy(cur.sun); sun.intensity = cur.sunI * (sunDir.y > -0.1 ? 1 : 0);
    sun.target.position.copy(target); sun.position.copy(target).addScaledVector(tmp, 300);
    moonLight.intensity = cur.moonI; tmp.copy(sunDir).multiplyScalar(-1); tmp.y = Math.max(tmp.y, 0.15); tmp.normalize();
    moonLight.target.position.copy(target); moonLight.position.copy(target).addScaledVector(tmp, 200);
    hemi.color.copy(cur.hemiS); hemi.groundColor.copy(cur.hemiG); hemi.intensity = cur.hemiI;
    // fog
    mode = st.mode;
    const dd = q.drawDistance * (mode === 'menu' ? 1.8 : 1);
    scene.fog.color.copy(cur.hor); scene.fog.near = dd * 0.4; scene.fog.far = dd * 1.25;
    // water
    water.material.color.copy(cur.water); water.material.specular.copy(cur.sun).multiplyScalar(0.35);
    waterTex.offset.set(clock * 0.004, clock * 0.0025);
    foam.opacity = 0.35 + 0.25 * Math.sin(clock * 1.3);
    onEnv({ night: cur.night, windowI: sm(0.15, 0.7, cur.night) * 1.4, lampOn: sm(0.3, 0.6, cur.night) });
  }
  update(0);
  return { update, foam, sun, dome, water };
}
