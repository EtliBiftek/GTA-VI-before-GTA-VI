// Neon Coast - pooled, cheap particle system for vehicle smoke / fire / explosions.
// Two THREE.Points draw calls (smoke = normal blending, fire = additive). No per-frame allocation.
import * as THREE from 'three';

const VERT = `
attribute float psize;
attribute vec4 pcolor;
varying vec4 vColor;
uniform float uScale;
void main() {
  vColor = pcolor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = psize * uScale / max(-mv.z, 0.5);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
varying vec4 vColor;
uniform float uAdditive;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  if (d > 1.0) discard;
  float a = vColor.a * (1.0 - d);
  if (uAdditive > 0.5) gl_FragColor = vec4(vColor.rgb * a, 1.0);
  else gl_FragColor = vec4(vColor.rgb, a);
}`;

function createPool(scene, max, additive) {
  const pos = new Float32Array(max * 3);
  const col = new Float32Array(max * 4);
  const size = new Float32Array(max);
  const vel = new Float32Array(max * 3);
  const life = new Float32Array(max);
  const maxLife = new Float32Array(max);
  const s0 = new Float32Array(max), s1 = new Float32Array(max), a0 = new Float32Array(max);
  const rise = new Float32Array(max), dragA = new Float32Array(max);
  const base = new Float32Array(max * 3); // start colour
  const geo = new THREE.BufferGeometry();
  const pAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const cAttr = new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage);
  const sAttr = new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pAttr);
  geo.setAttribute('pcolor', cAttr);
  geo.setAttribute('psize', sAttr);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: { uScale: { value: 400 }, uAdditive: { value: additive ? 1 : 0 } },
    transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = additive ? 11 : 10;
  scene.add(points);
  let next = 0, active = 0;

  return {
    mat,
    spawn(x, y, z, vx, vy, vz, l, sz0, sz1, r, g, b, a, up = 0, drag = 0.5) {
      const i = next; next = (next + 1) % max;
      if (life[i] <= 0) active++;
      const i3 = i * 3;
      pos[i3] = x; pos[i3 + 1] = y; pos[i3 + 2] = z;
      vel[i3] = vx; vel[i3 + 1] = vy; vel[i3 + 2] = vz;
      base[i3] = r; base[i3 + 1] = g; base[i3 + 2] = b;
      life[i] = l; maxLife[i] = l; s0[i] = sz0; s1[i] = sz1; a0[i] = a; rise[i] = up; dragA[i] = drag;
    },
    update(dt) {
      if (active <= 0) { active = 0; return; }
      let n = 0;
      for (let i = 0; i < max; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        const i3 = i * 3, i4 = i * 4;
        if (life[i] <= 0) { size[i] = 0; col[i4 + 3] = 0; continue; }
        n++;
        const t = 1 - life[i] / maxLife[i];
        const k = Math.exp(-dragA[i] * dt);
        vel[i3] *= k; vel[i3 + 2] *= k;
        vel[i3 + 1] = vel[i3 + 1] * k + rise[i] * dt;
        pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt;
        if (pos[i3 + 1] < 0.1) { pos[i3 + 1] = 0.1; if (vel[i3 + 1] < 0) vel[i3 + 1] = 0; }
        size[i] = s0[i] + (s1[i] - s0[i]) * t;
        const fade = t < 0.1 ? t * 10 : 1 - (t - 0.1) / 0.9;
        if (additive) { // fire: yellow -> red -> dark
          col[i4] = base[i3]; col[i4 + 1] = base[i3 + 1] * (1 - t * 0.8); col[i4 + 2] = base[i3 + 2] * (1 - t);
        } else {
          col[i4] = base[i3]; col[i4 + 1] = base[i3 + 1]; col[i4 + 2] = base[i3 + 2];
        }
        col[i4 + 3] = a0[i] * fade;
      }
      active = n;
      pAttr.needsUpdate = true; cAttr.needsUpdate = true; sAttr.needsUpdate = true;
    },
  };
}

export function createVehicleFx(game) {
  const smoke = createPool(game.scene, 320, false);
  const fire = createPool(game.scene, 220, true);
  const rnd = Math.random;

  return {
    /** Grey/black smoke puff. darkness 0..1 */
    smoke(x, y, z, darkness = 0.3, scale = 1) {
      const c = 0.55 - darkness * 0.45;
      smoke.spawn(x + (rnd() - 0.5) * 0.4, y, z + (rnd() - 0.5) * 0.4,
        (rnd() - 0.5) * 0.8, 1.2 + rnd() * 1.2, (rnd() - 0.5) * 0.8,
        1.6 + rnd() * 1.4, 0.7 * scale, (2.6 + rnd() * 1.5) * scale, c, c, c * 1.03, 0.55, 0.6, 0.6);
    },
    fire(x, y, z, scale = 1) {
      fire.spawn(x + (rnd() - 0.5) * 0.6, y, z + (rnd() - 0.5) * 0.6,
        (rnd() - 0.5) * 0.6, 1.5 + rnd() * 1.5, (rnd() - 0.5) * 0.6,
        0.45 + rnd() * 0.35, 1.0 * scale, 0.3 * scale, 1.6, 0.9, 0.25, 0.9, 1.5, 0.8);
    },
    explosion(x, y, z, radius = 8) {
      const s = radius / 8;
      fire.spawn(x, y + 1, z, 0, 0, 0, 0.25, 6 * s, 16 * s, 2.5, 2.2, 1.6, 1, 0, 0);
      for (let i = 0; i < 46; i++) {
        const a = rnd() * Math.PI * 2, e = rnd() * 1.2, sp = (5 + rnd() * 10) * s;
        fire.spawn(x, y + 0.8, z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 2, Math.sin(a) * Math.cos(e) * sp,
          0.5 + rnd() * 0.6, (2 + rnd() * 2) * s, (3.5 + rnd() * 2) * s, 1.8, 1.1, 0.35, 1, 1, 2.5);
      }
      for (let i = 0; i < 26; i++) {
        const a = rnd() * Math.PI * 2, sp = (2 + rnd() * 5) * s;
        const c = 0.12 + rnd() * 0.12;
        smoke.spawn(x, y + 1, z, Math.cos(a) * sp, 2 + rnd() * 4, Math.sin(a) * sp,
          2.2 + rnd() * 2, 3 * s, (8 + rnd() * 4) * s, c, c, c, 0.75, 0.8, 1.2);
      }
    },
    update(dt) {
      const r = game.renderer, cam = game.camera;
      const h = r?.domElement?.height || 720;
      const sc = h / (2 * Math.tan(((cam?.fov || 65) * Math.PI) / 360));
      smoke.mat.uniforms.uScale.value = sc;
      fire.mat.uniforms.uScale.value = sc;
      smoke.update(dt);
      fire.update(dt);
    },
  };
}
