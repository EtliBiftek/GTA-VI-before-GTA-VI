// Pooled combat FX: tracers, muzzle flashes, sparks, blood puffs, smoke and explosions.
// Zero allocations per shot; everything lives in fixed-size pools.
import * as THREE from 'three';

function radialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.65)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.18)');
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

  // ---- tracers: one mesh, stretched camera-facing glowing quads that travel from the muzzle ----
  const MAXT = 24, TSPEED = 380;
  const tPos = new Float32Array(MAXT * 12), tCol = new Float32Array(MAXT * 12);
  const tS = new Float32Array(MAXT * 6), tAge = new Float32Array(MAXT), tLife = new Float32Array(MAXT), tLen = new Float32Array(MAXT), tTail = new Float32Array(MAXT);
  const tBase = new Float32Array(MAXT * 3), tDir = new Float32Array(MAXT * 3);
  const tIdx = new Uint16Array(MAXT * 6);
  for (let i = 0; i < MAXT; i++) tIdx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2], i * 6);
  let tNext = 0, tAlive = 0;
  const tGeo = new THREE.BufferGeometry();
  const tPosAttr = new THREE.BufferAttribute(tPos, 3).setUsage(THREE.DynamicDrawUsage);
  const tColAttr = new THREE.BufferAttribute(tCol, 3).setUsage(THREE.DynamicDrawUsage);
  tGeo.setAttribute('position', tPosAttr); tGeo.setAttribute('color', tColAttr); tGeo.setIndex(new THREE.BufferAttribute(tIdx, 1));
  const tracers = new THREE.Mesh(tGeo, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  }));
  tracers.frustumCulled = false; tracers.renderOrder = 13;
  scene.add(tracers);

  // ---- shell casings (instanced) + decals (bullet holes, scorch) ----
  const SHELLS = 24;
  const shells = new THREE.InstancedMesh(new THREE.BoxGeometry(0.014, 0.014, 0.045), new THREE.MeshBasicMaterial({ color: 0xc9a24a }), SHELLS);
  shells.frustumCulled = false; shells.count = 0; scene.add(shells);
  const shP = new Float32Array(SHELLS * 3), shV = new Float32Array(SHELLS * 3), shL = new Float32Array(SHELLS), shR = new Float32Array(SHELLS);
  let shNext = 0;
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1), _n = new THREE.Vector3();
  const _q2 = new THREE.Quaternion();

  function decalMesh(cap, map, polyF) {
    const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: polyF, polygonOffsetUnits: polyF,
    }), cap);
    m.frustumCulled = false; m.count = 0; m.renderOrder = 2; scene.add(m);
    return { m, cap, next: 0, n: 0, born: new Float32Array(cap).fill(-1e9) };
  }
  function holeTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d'), grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(8,8,8,1)'); grd.addColorStop(0.3, 'rgba(10,10,10,0.95)'); grd.addColorStop(0.55, 'rgba(60,58,55,0.45)'); grd.addColorStop(1, 'rgba(60,58,55,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function scorchTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(6,5,4,0.92)'); grd.addColorStop(0.45, 'rgba(10,8,7,0.7)'); grd.addColorStop(0.8, 'rgba(14,12,10,0.22)'); grd.addColorStop(1, 'rgba(14,12,10,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.1})`; g.beginPath(); g.arc(32 + (Math.random() - 0.5) * 50, 32 + (Math.random() - 0.5) * 50, 1 + Math.random() * 5, 0, 6.3); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const holes = decalMesh(96, holeTexture(), -3);
  const scorches = decalMesh(12, scorchTexture(), -2);
  let fxClock = 0;
  function placeDecal(d, x, y, z, nx, ny, nz, size, rot) {
    const i = d.next; d.next = (d.next + 1) % d.cap; if (d.n < d.cap) d.n++;
    _n.set(nx, ny, nz).normalize();
    _q.setFromUnitVectors(_z, _n);
    _e.set(0, 0, rot); const qz = _q2.setFromEuler(_e);
    _q.multiply(qz);
    _p.set(x + _n.x * 0.02, y + _n.y * 0.02, z + _n.z * 0.02); _s.set(size, size, size);
    _m.compose(_p, _q, _s); d.m.setMatrixAt(i, _m);
    d.born[i] = fxClock; d.m.count = d.n; d.m.instanceMatrix.needsUpdate = true;
  }
  function ageDecals(d, life) {
    let dirty = false;
    for (let i = 0; i < d.n; i++) {
      if (d.born[i] > -1e8 && fxClock - d.born[i] > life) { d.born[i] = -1e9; _m.makeScale(0, 0, 0); d.m.setMatrixAt(i, _m); dirty = true; }
    }
    if (dirty) d.m.instanceMatrix.needsUpdate = true;
  }

  // ---- muzzle flashes ----
  const flashes = [];
  const flashMat = new THREE.SpriteMaterial({ map: tex, color: 0xffcc66, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  flashMat.color.setRGB(2.4, 1.5, 0.55);
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Sprite(flashMat);
    s.visible = false; s.userData.life = 0;
    scene.add(s); flashes.push(s);
  }
  let flashNext = 0;
  let light = null, lightT = 0, lightPeak = 0, lightDur = 0.1;
  const pq = () => game.settings?.quality || 'medium';

  // ---- particles ----
  const pk = () => game.q?.particles ?? 1;
  const small = new Particles(scene, 200, 0.22, tex, 9, 1.5);
  const big = new Particles(scene, 120, 2.2, tex, -1.2, 1.2);

  // ---- explosions: flash, fireball sprites, shockwave ring, debris chunks, smoke column, scorch ----
  const ringGeo = new THREE.RingGeometry(0.85, 1, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const booms = [];
  const FB = 6;
  for (let i = 0; i < 3; i++) {
    const balls = [];
    for (let k = 0; k < FB; k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      sp.visible = false; scene.add(sp); balls.push({ sp, ox: 0, oy: 0, oz: 0, sz: 1, d: 0 });
    }
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    flash.visible = false; scene.add(flash);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    ring.visible = false; ring.frustumCulled = false; scene.add(ring);
    booms.push({ balls, flash, ring, t: 0, dur: 1.1, r: 8, x: 0, y: 0, z: 0, on: false });
  }
  let boomNext = 0;
  const DEBRIS = 24;
  const debris = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 0.12, 0.3), new THREE.MeshBasicMaterial({ color: 0x1b1a19 }), DEBRIS);
  debris.frustumCulled = false; debris.count = 0; scene.add(debris);
  const dP = new Float32Array(DEBRIS * 3), dV = new Float32Array(DEBRIS * 3), dL = new Float32Array(DEBRIS), dR = new Float32Array(DEBRIS * 3), dS = new Float32Array(DEBRIS);
  let dNext = 0, dAlive = 0;
  const cols = [{ t: 0, x: 0, z: 0, acc: 0, k: 1 }, { t: 0, x: 0, z: 0, acc: 0, k: 1 }, { t: 0, x: 0, z: 0, acc: 0, k: 1 }];
  let colNext = 0;

  function ensureLight() {
    if (light || game.settings?.quality === 'low') return light;
    light = new THREE.PointLight(0xffaa55, 0, 22, 2);
    scene.add(light);
    return light;
  }
  ensureLight(); // created up-front so the first shot does not trigger a shader recompile
  function pulseLight(x, y, z, intensity, dur, dist) {
    if (game.settings?.quality === 'low') return;
    const l = ensureLight();
    if (!l) return;
    l.position.set(x, y, z); l.distance = dist || 22;
    l.intensity = intensity; lightPeak = intensity; lightT = dur; lightDur = dur;
  }

  function impactDust(x, y, z, nx, ny, nz, up) {
    const g = up ? 0.55 : 0.4;
    big.spawn(x, y, z, nx * 0.8 + (Math.random() - 0.5) * 0.4, 0.4 + Math.random() * 0.6, nz * 0.8 + (Math.random() - 0.5) * 0.4, g * 0.22, g * 0.2, g * 0.17, 0.35 + Math.random() * 0.25);
  }
  const waterAt = (x, z) => { const w = game.world; if (!w?.isWater) return false; try { return !!w.isWater(x, z); } catch { return false; } };

  return {
    tracer(x1, y1, z1, x2, y2, z2, r = 1, g = 0.85, b = 0.5) {
      const i = tNext; tNext = (tNext + 1) % MAXT;
      const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1, L = Math.hypot(dx, dy, dz) || 1;
      tS[i * 6] = x1; tS[i * 6 + 1] = y1; tS[i * 6 + 2] = z1; tS[i * 6 + 3] = x2; tS[i * 6 + 4] = y2; tS[i * 6 + 5] = z2;
      tDir[i * 3] = dx / L; tDir[i * 3 + 1] = dy / L; tDir[i * 3 + 2] = dz / L;
      tBase[i * 3] = r; tBase[i * 3 + 1] = g; tBase[i * 3 + 2] = b;
      tLen[i] = L; tTail[i] = Math.min(L, 7 + L * 0.04); tAge[i] = 0; tLife[i] = (L + tTail[i]) / TSPEED + 0.01;
      tAlive++;
    },
    /** Muzzle flash sprite (+ brief light on medium/high). Optional direction -> ejects a shell casing. */
    flash(x, y, z, size = 0.6, dx = 0, dy = 0, dz = 0) {
      const s = flashes[flashNext]; flashNext = (flashNext + 1) % flashes.length;
      s.position.set(x, y, z);
      s.scale.setScalar(size * (0.7 + Math.random() * 0.5));
      s.material.rotation = Math.random() * 6;
      s.visible = true; s.userData.life = 0.05;
      pulseLight(x, y, z, 14 * Math.min(1.4, size + 0.4), 0.07, 20);
      if ((dx || dz) && size < 1.05 && pk() > 0.6) {
        const cam = game.camera.position;
        if ((x - cam.x) ** 2 + (z - cam.z) ** 2 < 35 * 35) {
          const i = shNext; shNext = (shNext + 1) % SHELLS;
          const l = Math.hypot(dx, dz) || 1, rx = dz / l, rz = -dx / l, sp = 1.6 + Math.random() * 1.6;
          shP[i * 3] = x; shP[i * 3 + 1] = y - 0.05; shP[i * 3 + 2] = z;
          shV[i * 3] = rx * sp - dx * 0.4; shV[i * 3 + 1] = 1.8 + Math.random() * 1.4; shV[i * 3 + 2] = rz * sp - dz * 0.4;
          shL[i] = 1.4; shR[i] = Math.random() * 6;
          if (shells.count < SHELLS) shells.count = Math.min(SHELLS, Math.max(shells.count, i + 1));
        }
      }
    },
    sparks(x, y, z, nx, ny, nz, n = 4) {
      n = Math.max(1, Math.round(n * pk()));
      for (let i = 0; i < n; i++) {
        const sp = 2 + Math.random() * 4;
        small.spawn(x, y, z,
          (nx + (Math.random() - 0.5) * 1.2) * sp, (ny + Math.random() * 0.8) * sp, (nz + (Math.random() - 0.5) * 1.2) * sp,
          1.6, 1.15, 0.45, 0.18 + Math.random() * 0.15);
      }
    },
    /** World bullet hit: sparks + dust/chips, bullet hole decal, or a water splash. */
    impact(x, y, z, nx, ny, nz) {
      if (waterAt(x, z) && y < 1.2) {
        for (let i = 0; i < Math.max(2, Math.round(6 * pk())); i++) {
          small.spawn(x, 0.1, z, (Math.random() - 0.5) * 1.6, 2.5 + Math.random() * 3, (Math.random() - 0.5) * 1.6, 0.7, 0.85, 0.95, 0.35 + Math.random() * 0.3);
        }
        big.spawn(x, 0.2, z, 0, 0.8, 0, 0.14, 0.16, 0.18, 0.5);
        return;
      }
      const up = ny > 0.7;
      this.sparks(x, y, z, nx, ny, nz, up ? 2 : 3);
      impactDust(x, y, z, nx, ny, nz, up);
      if (pk() > 0.4) placeDecal(holes, x, y, z, nx, ny, nz, 0.13 + Math.random() * 0.05, Math.random() * 6.28);
      // chips
      if (pk() > 0.6) for (let i = 0; i < 3; i++) small.spawn(x, y, z, (nx + (Math.random() - 0.5)) * 3, (ny + Math.random()) * 3, (nz + (Math.random() - 0.5)) * 3, 0.5, 0.46, 0.4, 0.3 + Math.random() * 0.2);
    },
    blood(x, y, z, n = 5) {
      n = Math.max(1, Math.round(n * 0.7 * pk()));
      for (let i = 0; i < n; i++) {
        small.spawn(x, y, z,
          (Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3,
          0.7, 0.04, 0.04, 0.3 + Math.random() * 0.25);
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
      b.t = 0; b.r = radius; b.dur = 1.1; b.on = true; b.x = x; b.y = Math.max(y, 0.5); b.z = z;
      const k = radius / 9;
      for (let i = 0; i < FB; i++) {
        const ball = b.balls[i], a = Math.random() * 6.283, rr = (i === 0 ? 0 : 0.35 + Math.random() * 0.5) * radius * 0.35;
        ball.ox = Math.cos(a) * rr; ball.oz = Math.sin(a) * rr; ball.oy = (i === 0 ? 0 : Math.random() * 0.9) * radius * 0.25;
        ball.sz = (0.9 + Math.random() * 0.7) * radius * (i === 0 ? 1.15 : 0.8); ball.d = Math.random() * 0.15;
        ball.sp.material.rotation = Math.random() * 6; ball.sp.visible = true;
      }
      b.flash.visible = true; b.ring.visible = true;
      b.ring.position.set(x, 0.15, z);
      for (let i = 0; i < Math.round(14 * pk()); i++) {
        const a = Math.random() * 6.283, sp = 2 + Math.random() * radius * 0.5;
        big.spawn(x, y + 0.5, z, Math.cos(a) * sp, 1 + Math.random() * 5, Math.sin(a) * sp, 0.3, 0.27, 0.25, 1.4 + Math.random() * 1.2);
      }
      for (let i = 0; i < Math.round(30 * pk()); i++) {
        const a = Math.random() * 6.283, sp = 3 + Math.random() * radius;
        small.spawn(x, y + 0.5, z, Math.cos(a) * sp, 2 + Math.random() * 9, Math.sin(a) * sp, 2.2, 1.2 + Math.random() * 0.5, 0.3, 0.4 + Math.random() * 0.6);
      }
      // debris chunks
      if (pk() > 0.4) for (let n = 0; n < 8; n++) {
        const i = dNext; dNext = (dNext + 1) % DEBRIS;
        const a = Math.random() * 6.283, sp = 3 + Math.random() * 7 * k;
        dP[i * 3] = x; dP[i * 3 + 1] = y + 0.6; dP[i * 3 + 2] = z;
        dV[i * 3] = Math.cos(a) * sp; dV[i * 3 + 1] = 5 + Math.random() * 9 * k; dV[i * 3 + 2] = Math.sin(a) * sp;
        dR[i * 3] = Math.random() * 6; dR[i * 3 + 1] = Math.random() * 6; dR[i * 3 + 2] = Math.random() * 6;
        dL[i] = 2.2 + Math.random() * 1.5; dS[i] = 0.7 + Math.random() * 1.1;
        debris.count = DEBRIS;
      }
      // smoke column + scorch
      const c = cols[colNext]; colNext = (colNext + 1) % cols.length;
      c.t = 5.5; c.x = x; c.z = z; c.acc = 0; c.k = k;
      if (y < 3) placeDecal(scorches, x, 0, z, 0, 1, 0, radius * 0.9, Math.random() * 6.28);
      const d = Math.hypot(game.camera.position.x - x, game.camera.position.z - z);
      if (d < 80) pulseLight(x, y + 2, z, 120, 0.5, 60);
    },
    update(dt) {
      fxClock += dt;
      if (tAlive > 0) {
        const cam = game.camera.position;
        let alive = 0;
        for (let i = 0; i < MAXT; i++) {
          const k = i * 12;
          if (tLife[i] <= 0) continue;
          tAge[i] += dt;
          if (tAge[i] >= tLife[i]) {
            tLife[i] = 0;
            for (let j = 0; j < 12; j++) { tPos[k + j] = 0; tCol[k + j] = 0; }
            continue;
          }
          alive++;
          const head = Math.min(tLen[i], tAge[i] * TSPEED), tail = Math.max(0, head - tTail[i]);
          const dx = tDir[i * 3], dy = tDir[i * 3 + 1], dz = tDir[i * 3 + 2];
          const sx = tS[i * 6], sy = tS[i * 6 + 1], sz = tS[i * 6 + 2];
          const hx = sx + dx * head, hy = sy + dy * head, hz = sz + dz * head, tx = sx + dx * tail, ty = sy + dy * tail, tz = sz + dz * tail;
          // camera-facing width
          const mx = (hx + tx) * 0.5 - cam.x, my = (hy + ty) * 0.5 - cam.y, mz = (hz + tz) * 0.5 - cam.z;
          let px = dy * mz - dz * my, py = dz * mx - dx * mz, pz = dx * my - dy * mx;
          const pl = Math.hypot(px, py, pz) || 1, dist = Math.hypot(mx, my, mz);
          const w = (0.025 + dist * 0.0035) / pl; px *= w; py *= w; pz *= w;
          tPos[k] = tx - px; tPos[k + 1] = ty - py; tPos[k + 2] = tz - pz;
          tPos[k + 3] = tx + px; tPos[k + 4] = ty + py; tPos[k + 5] = tz + pz;
          tPos[k + 6] = hx - px; tPos[k + 7] = hy - py; tPos[k + 8] = hz - pz;
          tPos[k + 9] = hx + px; tPos[k + 10] = hy + py; tPos[k + 11] = hz + pz;
          const fade = Math.min(1, (tLife[i] - tAge[i]) / 0.05);
          const r = tBase[i * 3] * 3 * fade, g = tBase[i * 3 + 1] * 3 * fade, b = tBase[i * 3 + 2] * 3 * fade;
          for (let j = 0; j < 2; j++) { tCol[k + j * 3] = r * 0.05; tCol[k + j * 3 + 1] = g * 0.05; tCol[k + j * 3 + 2] = b * 0.05; }
          for (let j = 2; j < 4; j++) { tCol[k + j * 3] = r; tCol[k + j * 3 + 1] = g; tCol[k + j * 3 + 2] = b; }
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
        light.intensity = lightT > 0 ? lightPeak * Math.min(1, lightT / (lightDur * 0.6)) : 0;
      }
      // shells
      if (shells.count > 0) {
        let any = false;
        for (let i = 0; i < SHELLS; i++) {
          if (shL[i] <= 0) { if (shL[i] > -1) { shL[i] = -2; _m.makeScale(0, 0, 0); shells.setMatrixAt(i, _m); any = true; } continue; }
          shL[i] -= dt; any = true;
          shV[i * 3 + 1] -= 9.8 * dt;
          shP[i * 3] += shV[i * 3] * dt; shP[i * 3 + 1] += shV[i * 3 + 1] * dt; shP[i * 3 + 2] += shV[i * 3 + 2] * dt;
          if (shP[i * 3 + 1] < 0.02) { shP[i * 3 + 1] = 0.02; shV[i * 3] *= 0.4; shV[i * 3 + 2] *= 0.4; shV[i * 3 + 1] = Math.abs(shV[i * 3 + 1]) * 0.3; if (shV[i * 3 + 1] < 0.4) shV[i * 3 + 1] = 0; }
          shR[i] += dt * 18;
          _e.set(shR[i], shR[i] * 0.7, 0); _q.setFromEuler(_e); _p.set(shP[i * 3], shP[i * 3 + 1], shP[i * 3 + 2]); _s.set(1, 1, 1);
          _m.compose(_p, _q, _s); shells.setMatrixAt(i, _m);
        }
        if (any) shells.instanceMatrix.needsUpdate = true;
      }
      small.update(dt);
      big.update(dt);
      // debris
      if (debris.count > 0) {
        dAlive = 0;
        for (let i = 0; i < DEBRIS; i++) {
          if (dL[i] <= 0) { if (dL[i] > -1) { dL[i] = -2; _m.makeScale(0, 0, 0); debris.setMatrixAt(i, _m); } continue; }
          dL[i] -= dt; dAlive++;
          dV[i * 3 + 1] -= 16 * dt;
          dP[i * 3] += dV[i * 3] * dt; dP[i * 3 + 1] += dV[i * 3 + 1] * dt; dP[i * 3 + 2] += dV[i * 3 + 2] * dt;
          if (dP[i * 3 + 1] < 0.1) { dP[i * 3 + 1] = 0.1; dV[i * 3 + 1] = Math.abs(dV[i * 3 + 1]) * 0.35; dV[i * 3] *= 0.6; dV[i * 3 + 2] *= 0.6; if (dV[i * 3 + 1] < 1) { dV[i * 3 + 1] = 0; dV[i * 3] *= 0.8; dV[i * 3 + 2] *= 0.8; } }
          const spin = dV[i * 3 + 1] !== 0 || Math.abs(dV[i * 3]) > 0.3 ? 9 : 0;
          dR[i * 3] += dt * spin; dR[i * 3 + 1] += dt * spin * 0.7;
          _e.set(dR[i * 3], dR[i * 3 + 1], dR[i * 3 + 2]); _q.setFromEuler(_e); _p.set(dP[i * 3], dP[i * 3 + 1], dP[i * 3 + 2]);
          const sc = dS[i] * Math.min(1, dL[i] * 2); _s.set(sc, sc, sc);
          _m.compose(_p, _q, _s); debris.setMatrixAt(i, _m);
        }
        debris.instanceMatrix.needsUpdate = true;
        if (dAlive === 0) debris.count = 0;
      }
      // smoke columns
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        if (c.t <= 0) continue;
        c.t -= dt; c.acc += dt * 7 * pk();
        while (c.acc >= 1) {
          c.acc -= 1;
          const g = 0.09 + Math.random() * 0.06;
          big.spawn(c.x + (Math.random() - 0.5) * 1.5, 1.5, c.z + (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 0.8, 3 + Math.random() * 2, (Math.random() - 0.5) * 0.8, g, g, g, 2.2 + Math.random() * 1.5);
        }
      }
      if (holes.n || scorches.n) { ageDecals(holes, 150); ageDecals(scorches, 120); }
      // explosions
      for (let i = 0; i < booms.length; i++) {
        const b = booms[i];
        if (!b.on) continue;
        b.t += dt;
        const f = b.t / b.dur;
        if (f >= 1) { b.on = false; b.flash.visible = b.ring.visible = false; for (const ball of b.balls) ball.sp.visible = false; continue; }
        const e = 1 - (1 - f) * (1 - f);
        // white-hot flash, first ~0.15 s
        const ff = Math.max(0, 1 - b.t / 0.18);
        b.flash.visible = ff > 0;
        if (ff > 0) { b.flash.position.set(b.x, b.y + 1, b.z); b.flash.scale.setScalar(b.r * (2.2 + e * 3)); b.flash.material.color.setRGB(5 * ff, 4.2 * ff, 3 * ff); }
        for (const ball of b.balls) {
          const t = Math.max(0, b.t - ball.d), fl = Math.min(1, t / (b.dur * 0.9)), ee = 1 - (1 - fl) * (1 - fl);
          ball.sp.position.set(b.x + ball.ox * (0.4 + ee), b.y + ball.oy + ee * b.r * 0.35, b.z + ball.oz * (0.4 + ee));
          ball.sp.scale.setScalar(Math.max(0.01, ball.sz * (0.35 + 0.75 * ee)));
          const a = Math.max(0, 1 - fl) * 1.4;
          // white-yellow -> orange -> dark red
          ball.sp.material.color.setRGB(2.6 * a, (0.5 + 1.5 * (1 - fl)) * a * (1 - fl * 0.5), 0.25 * (1 - fl) * a);
        }
        b.ring.scale.setScalar(Math.max(0.01, b.r * 1.6 * e));
        b.ring.material.opacity = (1 - f) * (1 - f) * 0.55;
      }
    },
  };
}
