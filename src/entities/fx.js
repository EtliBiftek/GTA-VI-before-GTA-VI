// Pooled combat FX: tracers, muzzle flashes, sparks, blood puffs, smoke and explosions.
// Zero allocations per shot; everything lives in fixed-size pools.
import * as THREE from 'three';

function radialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.7)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class Particles {
  constructor(scene, count, size, tex, gravity, drag) {
    this.n = count; this.gravity = gravity; this.drag = drag; this.next = 0; this.alive = 0;
    this.pos = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.base = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.max = new Float32Array(count);
    for (let i = 0; i < count; i++) this.pos[i * 3 + 1] = -1000;
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3);
    this.colAttr = new THREE.BufferAttribute(this.col, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.colAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('color', this.colAttr);
    const mat = new THREE.PointsMaterial({
      size, map: tex, vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  spawn(x, y, z, vx, vy, vz, r, g, b, life) {
    const i = this.next; this.next = (this.next + 1) % this.n;
    const k = i * 3;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
    this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
    this.base[k] = r; this.base[k + 1] = g; this.base[k + 2] = b;
    this.col[k] = r; this.col[k + 1] = g; this.col[k + 2] = b;
    if (this.life[i] <= 0) this.alive++;
    this.life[i] = this.max[i] = life;
  }

  update(dt) {
    if (this.alive <= 0) return;
    let alive = 0;
    const damp = Math.max(0, 1 - this.drag * dt);
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      const k = i * 3;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.pos[k + 1] = -1000; this.col[k] = this.col[k + 1] = this.col[k + 2] = 0;
        continue;
      }
      alive++;
      this.vel[k + 1] -= this.gravity * dt;
      this.vel[k] *= damp; this.vel[k + 1] *= damp; this.vel[k + 2] *= damp;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.pos[k + 1] < 0.02) { this.pos[k + 1] = 0.02; this.vel[k + 1] = 0; }
      const f = this.life[i] / this.max[i];
      this.col[k] = this.base[k] * f; this.col[k + 1] = this.base[k + 1] * f; this.col[k + 2] = this.base[k + 2] * f;
    }
    this.alive = alive;
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
  }
}

export function createFx(game) {
  const scene = game.scene;
  const tex = radialTexture();

  // ---- tracers: one LineSegments draw call ----
  const MAXT = 24;
  const tPos = new Float32Array(MAXT * 6);
  const tCol = new Float32Array(MAXT * 6);
  const tLife = new Float32Array(MAXT);
  const tBase = new Float32Array(MAXT * 3);
  let tNext = 0, tAlive = 0;
  const tGeo = new THREE.BufferGeometry();
  const tPosAttr = new THREE.BufferAttribute(tPos, 3);
  const tColAttr = new THREE.BufferAttribute(tCol, 3);
  tPosAttr.setUsage(THREE.DynamicDrawUsage); tColAttr.setUsage(THREE.DynamicDrawUsage);
  tGeo.setAttribute('position', tPosAttr);
  tGeo.setAttribute('color', tColAttr);
  const tracers = new THREE.LineSegments(tGeo, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  tracers.frustumCulled = false;
  scene.add(tracers);
  const TRACE_LIFE = 0.07;

  // ---- muzzle flashes ----
  const flashes = [];
  const flashMat = new THREE.SpriteMaterial({ map: tex, color: 0xffcc66, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Sprite(flashMat);
    s.visible = false; s.userData.life = 0;
    scene.add(s); flashes.push(s);
  }
  let flashNext = 0;
  let light = null, lightT = 0, lightPeak = 0;

  // ---- particles ----
  const small = new Particles(scene, 160, 0.22, tex, 9, 1.5);
  const big = new Particles(scene, 90, 2.2, tex, -1.2, 1.2);

  // ---- explosions ----
  const fireGeo = new THREE.SphereGeometry(1, 10, 8);
  const ringGeo = new THREE.RingGeometry(0.85, 1, 24);
  ringGeo.rotateX(-Math.PI / 2);
  const booms = [];
  for (let i = 0; i < 3; i++) {
    const fire = new THREE.Mesh(fireGeo, new THREE.MeshBasicMaterial({ color: 0xff8a22, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    fire.visible = ring.visible = false; fire.frustumCulled = ring.frustumCulled = false;
    scene.add(fire, ring);
    booms.push({ fire, ring, t: 0, dur: 0.8, r: 8 });
  }
  let boomNext = 0;

  function ensureLight() {
    if (light || game.settings?.quality === 'low') return light;
    light = new THREE.PointLight(0xffaa55, 0, 18, 2);
    scene.add(light);
    return light;
  }
  function pulseLight(x, y, z, intensity, dur) {
    if (game.settings?.quality === 'low') return;
    const l = ensureLight();
    if (!l) return;
    l.position.set(x, y, z);
    l.intensity = intensity; lightPeak = intensity; lightT = dur;
  }

  return {
    tracer(x1, y1, z1, x2, y2, z2, r = 1, g = 0.85, b = 0.5) {
      const i = tNext; tNext = (tNext + 1) % MAXT;
      const k = i * 6;
      tPos[k] = x1; tPos[k + 1] = y1; tPos[k + 2] = z1;
      tPos[k + 3] = x2; tPos[k + 4] = y2; tPos[k + 5] = z2;
      tBase[i * 3] = r; tBase[i * 3 + 1] = g; tBase[i * 3 + 2] = b;
      if (tLife[i] <= 0) tAlive++;
      tLife[i] = TRACE_LIFE;
      tCol[k] = r * 0.15; tCol[k + 1] = g * 0.15; tCol[k + 2] = b * 0.15;
      tCol[k + 3] = r; tCol[k + 4] = g; tCol[k + 5] = b;
      tPosAttr.needsUpdate = true; tColAttr.needsUpdate = true;
    },
    flash(x, y, z, size = 0.6) {
      const s = flashes[flashNext]; flashNext = (flashNext + 1) % flashes.length;
      s.position.set(x, y, z);
      s.scale.setScalar(size * (0.8 + Math.random() * 0.5));
      s.material.rotation = Math.random() * 6;
      s.visible = true; s.userData.life = 0.05;
      pulseLight(x, y, z, 2.2, 0.06);
    },
    sparks(x, y, z, nx, ny, nz, n = 4) {
      for (let i = 0; i < n; i++) {
        const sp = 2 + Math.random() * 4;
        small.spawn(x, y, z,
          (nx + (Math.random() - 0.5) * 1.2) * sp, (ny + Math.random() * 0.8) * sp, (nz + (Math.random() - 0.5) * 1.2) * sp,
          1, 0.8, 0.35, 0.18 + Math.random() * 0.15);
      }
    },
    blood(x, y, z, n = 5) {
      for (let i = 0; i < n; i++) {
        small.spawn(x, y, z,
          (Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3,
          0.8, 0.05, 0.05, 0.3 + Math.random() * 0.25);
      }
    },
    smoke(x, y, z, n = 3, shade = 0.35) {
      for (let i = 0; i < n; i++) {
        big.spawn(x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 0.6,
          (Math.random() - 0.5) * 1.2, 0.8 + Math.random() * 1.2, (Math.random() - 0.5) * 1.2,
          shade, shade, shade, 0.8 + Math.random() * 0.8);
      }
    },
    explosion(x, y, z, radius = 9) {
      const b = booms[boomNext]; boomNext = (boomNext + 1) % booms.length;
      b.t = 0; b.r = radius;
      b.fire.position.set(x, Math.max(y, 0.5), z); b.ring.position.set(x, 0.15, z);
      b.fire.visible = b.ring.visible = true;
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * 6.283, sp = 2 + Math.random() * radius * 0.5;
        big.spawn(x, y + 0.5, z, Math.cos(a) * sp, 1 + Math.random() * 5, Math.sin(a) * sp, 0.55, 0.5, 0.45, 1.4 + Math.random() * 1.2);
      }
      for (let i = 0; i < 24; i++) {
        const a = Math.random() * 6.283, sp = 3 + Math.random() * radius;
        small.spawn(x, y + 0.5, z, Math.cos(a) * sp, 2 + Math.random() * 9, Math.sin(a) * sp, 1, 0.55 + Math.random() * 0.3, 0.15, 0.4 + Math.random() * 0.5);
      }
      pulseLight(x, y + 2, z, 8, 0.35);
    },
    update(dt) {
      if (tAlive > 0) {
        let alive = 0;
        for (let i = 0; i < MAXT; i++) {
          if (tLife[i] <= 0) continue;
          tLife[i] -= dt;
          const k = i * 6;
          if (tLife[i] <= 0) {
            tPos[k] = tPos[k + 1] = tPos[k + 2] = tPos[k + 3] = tPos[k + 4] = tPos[k + 5] = 0;
          } else {
            alive++;
            const f = tLife[i] / TRACE_LIFE;
            const r = tBase[i * 3] * f, g = tBase[i * 3 + 1] * f, b = tBase[i * 3 + 2] * f;
            tCol[k] = r * 0.15; tCol[k + 1] = g * 0.15; tCol[k + 2] = b * 0.15;
            tCol[k + 3] = r; tCol[k + 4] = g; tCol[k + 5] = b;
          }
        }
        tAlive = alive;
        tPosAttr.needsUpdate = true; tColAttr.needsUpdate = true;
      }
      for (let i = 0; i < flashes.length; i++) {
        const s = flashes[i];
        if (!s.visible) continue;
        s.userData.life -= dt;
        if (s.userData.life <= 0) s.visible = false;
      }
      if (light && lightT > 0) {
        lightT -= dt;
        light.intensity = lightT > 0 ? lightPeak * Math.min(1, lightT / 0.1) : 0;
      }
      small.update(dt);
      big.update(dt);
      for (let i = 0; i < booms.length; i++) {
        const b = booms[i];
        if (!b.fire.visible) continue;
        b.t += dt;
        const f = b.t / b.dur;
        if (f >= 1) { b.fire.visible = b.ring.visible = false; continue; }
        const e = 1 - (1 - f) * (1 - f);
        b.fire.scale.setScalar(Math.max(0.01, b.r * 0.5 * e));
        b.fire.material.opacity = (1 - f) * 0.9;
        b.ring.scale.setScalar(Math.max(0.01, b.r * e));
        b.ring.material.opacity = (1 - f) * 0.7;
      }
    },
  };
}
