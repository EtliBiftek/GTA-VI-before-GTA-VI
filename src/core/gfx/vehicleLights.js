// Vehicle lighting & surface FX that live outside the vehicle models:
//  - night headlight pools on the road (additive projected quads), lamp / tail-light / siren glow sprites (one Points draw)
//  - a real SpotLight on the player's car (medium / high only)
//  - police light-bar flashes lighting the road (pulsing coloured ground decals) and fire heat glow on burning wrecks
//  - tyre skid marks (ring-buffered ribbon, fades), tyre smoke, dust off-road, exhaust puffs, crash sparks
// Everything is pooled / pre-allocated. frame() runs every rendered frame, update() once per sim step.
import * as THREE from 'three';

const MAX_GLOW = 320, MAX_BEAM = 64, MAX_POOL = 28, SKID_CAP = 1800, SKID_FADE = 55;

function beamTexture() {
  const W = 64, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const t = 1 - y / (H - 1); // 0 near the car (bottom row) .. 1 far
    const hw = 0.2 + 0.8 * t;
    const along = Math.pow(1 - t, 1.35) * Math.min(1, t / 0.07 + 0.25);
    for (let x = 0; x < W; x++) {
      const u = Math.abs(x / (W - 1) - 0.5) * 2 / hw;
      const e = u >= 1 ? 0 : (1 - u * u) * (1 - u * u);
      const v = Math.round(255 * e * along), k = (y * W + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = v; img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.NoColorSpace; return tx;
}
function radialTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, '#fff'); grd.addColorStop(0.3, '#bbb'); grd.addColorStop(0.7, '#333'); grd.addColorStop(1, '#000');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.NoColorSpace; return tx;
}

export function createVehicleLights(game) {
  const scene = game.scene;
  const nightOf = () => game.world?.nightFactor ?? 0;
  let clock = 0, simClock = 0;

  // ---- glow sprites (Points) ----
  const gPos = new Float32Array(MAX_GLOW * 3), gCol = new Float32Array(MAX_GLOW * 3), gSize = new Float32Array(MAX_GLOW);
  const gGeo = new THREE.BufferGeometry();
  const gPosA = new THREE.BufferAttribute(gPos, 3).setUsage(THREE.DynamicDrawUsage);
  const gColA = new THREE.BufferAttribute(gCol, 3).setUsage(THREE.DynamicDrawUsage);
  const gSizeA = new THREE.BufferAttribute(gSize, 1).setUsage(THREE.DynamicDrawUsage);
  gGeo.setAttribute('position', gPosA); gGeo.setAttribute('gcolor', gColA); gGeo.setAttribute('gsize', gSizeA);
  gGeo.setDrawRange(0, 0);
  const gMat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 500 } },
    vertexShader: `attribute vec3 gcolor; attribute float gsize; varying vec3 vC; uniform float uScale;
      void main(){ vC = gcolor; vec4 mv = modelViewMatrix*vec4(position,1.0);
        gl_PointSize = clamp(gsize*uScale/max(-mv.z,0.5), 2.5, 150.0); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; void main(){ vec2 c = gl_PointCoord-0.5; float d = clamp(length(c)*2.0,0.0,1.0);
      float a = pow(1.0-d,2.2) + 0.9*pow(1.0-d,9.0); gl_FragColor = vec4(vC*a, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const glow = new THREE.Points(gGeo, gMat); glow.frustumCulled = false; glow.renderOrder = 12; scene.add(glow);
  let gN = 0;
  const addGlow = (x, y, z, r, g, b, s) => {
    if (gN >= MAX_GLOW) return;
    const k = gN * 3; gPos[k] = x; gPos[k + 1] = y; gPos[k + 2] = z; gCol[k] = r; gCol[k + 1] = g; gCol[k + 2] = b; gSize[gN] = s; gN++;
  };

  // ---- ground pools: headlight beams + radial coloured pools ----
  const mk = (geo, map, cap) => {
    const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({
      map, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
    }), cap);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false; m.count = 0; m.renderOrder = 3; scene.add(m); return m;
  };
  const beamGeo = new THREE.BufferGeometry();
  beamGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, -0.5, 0, 1, 0.5, 0, 1]), 3));
  beamGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2));
  beamGeo.setIndex([0, 2, 1, 1, 2, 3]);
  beamGeo.computeVertexNormals();
  const beams = mk(beamGeo, beamTexture(), MAX_BEAM);
  const pools = mk(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), radialTex(), MAX_POOL);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  let nB = 0, nP = 0;
  const addBeam = (x, z, h, w, l, r, g, b) => {
    if (nB >= MAX_BEAM) return;
    q.setFromAxisAngle(UP, h); P.set(x, 0.07, z); S.set(w, 1, l); m4.compose(P, q, S);
    beams.setMatrixAt(nB, m4); beams.instanceColor.setXYZ(nB, r, g, b); nB++;
  };
  const addPool = (x, z, rad, r, g, b) => {
    if (nP >= MAX_POOL) return;
    q.identity(); P.set(x, 0.08, z); S.set(rad * 2, 1, rad * 2); m4.compose(P, q, S);
    pools.setMatrixAt(nP, m4); pools.instanceColor.setXYZ(nP, r, g, b); nP++;
  };

  // ---- player spot light ----
  let spot = null;
  try {
    spot = new THREE.SpotLight(0xfff0d8, 0, 75, 0.5, 0.75, 1.6);
    spot.castShadow = false; spot.visible = game.settings.quality !== 'low';
    scene.add(spot, spot.target);
  } catch { spot = null; }
  game.events.on('settings:changed', () => { if (spot) spot.visible = game.settings.quality !== 'low'; });

  // ---- skid marks ----
  const sPos = new Float32Array(SKID_CAP * 12), sBirth = new Float32Array(SKID_CAP * 4).fill(-1e6), sEdge = new Float32Array(SKID_CAP * 4), sStr = new Float32Array(SKID_CAP * 4);
  const sIdx = new Uint32Array(SKID_CAP * 6);
  for (let i = 0; i < SKID_CAP; i++) {
    const a = i * 4; sIdx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6);
    sEdge[a] = 0; sEdge[a + 1] = 1; sEdge[a + 2] = 0; sEdge[a + 3] = 1;
  }
  const sGeo = new THREE.BufferGeometry();
  const sPosA = new THREE.BufferAttribute(sPos, 3).setUsage(THREE.DynamicDrawUsage);
  const sBirthA = new THREE.BufferAttribute(sBirth, 1).setUsage(THREE.DynamicDrawUsage);
  const sStrA = new THREE.BufferAttribute(sStr, 1).setUsage(THREE.DynamicDrawUsage);
  sGeo.setAttribute('position', sPosA); sGeo.setAttribute('birth', sBirthA); sGeo.setAttribute('edge', new THREE.BufferAttribute(sEdge, 1)); sGeo.setAttribute('str', sStrA);
  sGeo.setIndex(new THREE.BufferAttribute(sIdx, 1));
  const sMat = new THREE.ShaderMaterial({
    uniforms: { uNow: { value: 0 } },
    vertexShader: `attribute float birth; attribute float edge; attribute float str; varying float vA; uniform float uNow;
      void main(){ float age = uNow - birth; float fade = clamp(1.0 - age/${SKID_FADE.toFixed(1)}, 0.0, 1.0);
        float e = smoothstep(0.0,0.3,edge)*smoothstep(1.0,0.7,edge);
        vA = fade*fade*(0.2+0.5*e)*str*(birth>-1e5?1.0:0.0); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying float vA; void main(){ if (vA < 0.004) discard; gl_FragColor = vec4(0.015,0.015,0.017, vA); }`,
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5,
  });
  const skid = new THREE.Mesh(sGeo, sMat); skid.frustumCulled = false; skid.renderOrder = 2; skid.visible = false; scene.add(skid);
  let sNext = 0, sDirty = false;
  function skidSeg(ax, az, bx, bz, hw, str) {
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz);
    if (l < 0.05) return false;
    const nx = -dz / l * hw, nz = dx / l * hw, i = sNext; sNext = (sNext + 1) % SKID_CAP;
    const k = i * 12, y = 0.045;
    sPos[k] = ax - nx; sPos[k + 1] = y; sPos[k + 2] = az - nz; sPos[k + 3] = ax + nx; sPos[k + 4] = y; sPos[k + 5] = az + nz;
    sPos[k + 6] = bx - nx; sPos[k + 7] = y; sPos[k + 8] = bz - nz; sPos[k + 9] = bx + nx; sPos[k + 10] = y; sPos[k + 11] = bz + nz;
    for (let j = 0; j < 4; j++) { sBirth[i * 4 + j] = simClock; sStr[i * 4 + j] = str; }
    sDirty = true; skid.visible = true; return true;
  }

  const isRoad = (x, z) => { const w = game.world; if (!w?.isRoad) return true; try { return !!w.isRoad(x, z); } catch { return true; } };
  const isWater = (x, z) => { const w = game.world; if (!w?.isWater) return false; try { return !!w.isWater(x, z); } catch { return false; } };

  // events
  game.events.on('vehicle:crash', (e) => {
    const v = e?.vehicle, fx = game.vehicles?.fx;
    if (!v || !fx?.sparks) return;
    const cam = game.camera.position;
    if ((v.position.x - cam.x) ** 2 + (v.position.z - cam.z) ** 2 > 90 * 90) return;
    const n = Math.min(26, 4 + Math.floor((e.impact || 4) * 1.6));
    fx.sparks(v.position.x, Math.max(0.4, v.height * 0.4), v.position.z, Math.sin(v.heading), Math.cos(v.heading), n);
  });

  // scratch
  const wp = { x: 0, z: 0 };
  function wheelWorld(v, wh) {
    const c = Math.cos(v.heading), s = Math.sin(v.heading);
    wp.x = v.position.x + wh.x * c + wh.z * s; wp.z = v.position.z - wh.x * s + wh.z * c;
  }
  const gf = (v) => v._gfx || (v._gfx = { sx: new Float32Array(8), sz: new Float32Array(8), on: new Uint8Array(8), prevSp: 0, smk: 0, exh: 0, dust: 0 });

  return {
    skid, beams, pools, glow, spot,
    /** per sim step: skid marks, tyre smoke, dust, exhaust */
    update(dt) {
      simClock += dt; sMat.uniforms.uNow.value = simClock;
      const vs = game.vehicles?.list, fx = game.vehicles?.fx;
      if (!vs || !fx) return;
      const cam = game.camera.position, input = game.input;
      for (let i = 0; i < vs.length; i++) {
        const v = vs[i], g = gf(v);
        if (v.destroyed || !v.mesh?.visible) { g.on.fill(0); g.prevSp = v.speed || 0; continue; }
        const dx = v.position.x - cam.x, dz = v.position.z - cam.z, d2 = dx * dx + dz * dz;
        if (d2 > 130 * 130 || !v._awake) { g.on.fill(0); g.prevSp = v.speed; continue; }
        const T = v.stats, c = Math.cos(v.heading), s = Math.sin(v.heading);
        const sp = v.speed, asp = Math.abs(sp), lat = v.vx * c - v.vz * s;
        const player = v.driver === 'player';
        const hb = player && !!input?.handbrake;
        const decel = (g.prevSp - sp) / Math.max(dt, 1e-3); g.prevSp = sp;
        const slide = asp > 3 && (Math.abs(lat) > 3.4 || (hb && asp > 6));
        const lock = asp > 9 && v.braking && Math.abs(decel) > 17;
        const burn = player && v.throttle > 0.6 && ((hb && asp < 9) || (asp < 3.5 && v.throttle > 0.9 && Math.abs(v.angVel) > 0.35));
        const skidding = slide || lock || burn;
        const road = skidding || asp > 6 ? isRoad(v.position.x, v.position.z) : true;
        const near = d2 < 70 * 70;
        if (skidding && road) {
          const k = Math.min(1, 0.45 + (Math.abs(lat) + asp * 0.25) * 0.05);
          for (let w = 0; w < T.wheels.length && w < 4; w++) {
            const wh = T.wheels[w];
            if (wh.front && !lock && !slide) continue;
            wheelWorld(v, wh);
            if (g.on[w]) skidSeg(g.sx[w], g.sz[w], wp.x, wp.z, T.wheelW * 0.55, k);
            g.sx[w] = wp.x; g.sz[w] = wp.z; g.on[w] = 1;
          }
          if (near) {
            g.smk += dt * (14 + asp * 0.6);
            while (g.smk >= 1) {
              g.smk -= 1;
              const wh = T.wheels[(Math.random() * T.wheels.length) | 0];
              wheelWorld(v, wh);
              fx.tyreSmoke(wp.x, 0.15, wp.z, v.vx * 0.5, v.vz * 0.5, Math.min(1.4, 0.7 + asp * 0.03));
            }
          }
        } else g.on.fill(0);
        // dust off-road
        if (near && asp > 5 && (v.driver) && !skidding && !isRoad(v.position.x, v.position.z) && !isWater(v.position.x, v.position.z)) {
          g.dust += dt * (4 + asp * 0.8);
          while (g.dust >= 1) {
            g.dust -= 1;
            const wh = T.wheels[(Math.random() * T.wheels.length) | 0];
            if (wh.front) continue;
            wheelWorld(v, wh);
            fx.dust(wp.x, 0.2, wp.z, v.vx * 0.3, v.vz * 0.3, Math.min(1.5, 0.6 + asp * 0.04));
          }
        }
        // exhaust on throttle
        if (d2 < 45 * 45 && v.driver && v.throttle > 0.55 && !v.stats.noExhaust) {
          g.exh += dt * (v.throttle > 0.9 ? 9 : 4);
          while (g.exh >= 1) {
            g.exh -= 1;
            const ex = v.position.x - s * (v.halfL + 0.05) + c * v.halfW * 0.45, ez = v.position.z - c * (v.halfL + 0.05) - s * v.halfW * 0.45;
            fx.exhaust(ex, 0.35, ez, -s * 1.2, -c * 1.2);
          }
        }
      }
      if (sDirty) { sPosA.needsUpdate = true; sBirthA.needsUpdate = true; sStrA.needsUpdate = true; sDirty = false; }
    },
    /** per rendered frame: glow sprites, headlight pools, police flashes, fire glow, spot light */
    frame(dt, night) {
      clock += dt;
      const cam = game.camera.position, vs = game.vehicles?.list;
      gN = 0; nB = 0; nP = 0;
      const lowQ = game.settings.quality === 'low';
      const h = game.renderer.domElement.height || 720;
      gMat.uniforms.uScale.value = h / (2 * Math.tan((game.camera.fov * Math.PI) / 360));
      const dark = night > 0.25;
      const ph = Math.floor(clock * 4) & 1, env = 1 - ((clock * 4) % 1) * 0.55;
      let playerVeh = null;
      if (vs) for (let i = 0; i < vs.length; i++) {
        const v = vs[i];
        if (!v.mesh?.visible) continue;
        const dx = v.position.x - cam.x, dz = v.position.z - cam.z, d2 = dx * dx + dz * dz;
        if (d2 > 170 * 170) continue;
        const T = v.stats, c = Math.cos(v.heading), s = Math.sin(v.heading), hw = v.halfW, hl = v.halfL;
        const px = v.position.x, pz = v.position.z;
        const lit = !v.destroyed && v.driver;
        if (v.driver === 'player') playerVeh = v;
        // headlights
        if (lit && dark && !v.destroyed) {
          const k = night, ly = Math.min(0.85, Math.max(0.5, v.height * 0.4)), lx = hw * 0.62, lz = hl - 0.1;
          for (let sgn = -1; sgn <= 1; sgn += 2) {
            const wx = px + sgn * lx * c + lz * s + s * 0.25, wz = pz - sgn * lx * s + lz * c + c * 0.25;
            addGlow(wx, ly, wz, 2.4 * k, 2.25 * k, 1.8 * k, 0.9);
            if (d2 < 150 * 150) addBeam(px + sgn * lx * c + (lz - 0.4) * s, pz - sgn * lx * s + (lz - 0.4) * c, v.heading, 4.2, 15 + Math.min(10, Math.abs(v.speed) * 0.35), 0.38 * k, 0.35 * k, 0.26 * k);
          }
        }
        // tail / brake lights
        if (lit) {
          const ty = Math.min(1.0, Math.max(0.6, v.height * 0.45)), tx = hw * 0.66, tz = -hl - 0.12;
          let r = 0, g = 0, b = 0, sz = 0;
          if (v.braking) { r = dark ? 4.2 : 2.6; g = 0.18; b = 0.1; sz = dark ? 1.15 : 0.75; } else if (dark) { r = 1.3; g = 0.06; b = 0.05; sz = 0.55; }
          if (sz > 0) for (let sgn = -1; sgn <= 1; sgn += 2) addGlow(px + sgn * tx * c + tz * s, ty, pz - sgn * tx * s + tz * c, r, g, b, sz);
          if (v.braking && dark && d2 < 80 * 80) addPool(px - s * (hl + 2.2), pz - c * (hl + 2.2), 3.2, 0.35, 0.02, 0.02);
        }
        // police light bar
        if (v.isPolice && v.siren && !v.destroyed) {
          const by = v.height + 0.12;
          const red = ph === 1, e = env * (dark ? 1 : 0.55);
          addGlow(px + 0.4 * c, by, pz - 0.4 * s, red ? 5 * e : 0.2, red ? 0.25 * e : 0.2, red ? 0.2 * e : 0.2, red ? 1.9 : 0.6);
          addGlow(px - 0.4 * c, by, pz + 0.4 * s, red ? 0.2 : 0.3 * e, red ? 0.2 : 0.7 * e, red ? 0.2 : 6 * e, red ? 0.6 : 1.9);
          if (d2 < 110 * 110) {
            const k = (dark ? 0.9 : 0.35) * e;
            addPool(px, pz, 11, red ? k : 0.02, red ? 0.06 * k : 0.2 * k, red ? 0.05 * k : k);
          }
        }
        // fire heat glow
        if (v.onFire || (v.destroyed && v._burn > 0)) {
          const f = 0.75 + 0.25 * Math.sin(clock * 19 + v._uid) * Math.sin(clock * 7.3 + v._uid * 2);
          addGlow(px, v.height * 0.75, pz, 3.4 * f, 1.3 * f, 0.3 * f, 4.5);
          if (d2 < 120 * 120) addPool(px, pz, 7.5, 0.7 * f * (dark ? 1 : 0.5), 0.26 * f * (dark ? 1 : 0.5), 0.05 * f);
        }
      }
      gGeo.setDrawRange(0, gN);
      gPosA.needsUpdate = gColA.needsUpdate = gSizeA.needsUpdate = true;
      beams.count = nB; pools.count = nP;
      beams.instanceMatrix.needsUpdate = pools.instanceMatrix.needsUpdate = true;
      beams.instanceColor.needsUpdate = pools.instanceColor.needsUpdate = true;
      beams.visible = nB > 0; pools.visible = nP > 0; glow.visible = gN > 0;
      // spot light on the player's car
      if (spot) {
        if (playerVeh && !lowQ && dark && !playerVeh.destroyed) {
          const v = playerVeh, s = Math.sin(v.heading), c = Math.cos(v.heading);
          spot.position.set(v.position.x + s * (v.halfL - 0.3), 0.75, v.position.z + c * (v.halfL - 0.3));
          spot.target.position.set(v.position.x + s * 24, 0.0, v.position.z + c * 24);
          spot.intensity = 650 * night;
        } else spot.intensity = 0;
      }
    },
  };
}
