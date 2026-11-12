// Rendering pipeline: sky-driven image-based lighting + post-processing chain chosen by quality.
//   low    : direct render (cheapest, for phones) + blob shadows, headlight pools and glow sprites
//   medium : MSAA + bloom + one merged grade pass (tone map, grade, vignette, grain)
//   high   : MSAA + ambient occlusion + bloom + grade pass with CA, sharpen and sun god-rays
// Also: auto exposure, dynamic resolution (game.graphics.stats), camera shake (game.graphics.shake).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { createSkyEnv } from './gfx/skyEnv.js';
import { GradePass } from './gfx/grade.js';
import { createBlobShadows } from './gfx/blobs.js';
import { createVehicleLights } from './gfx/vehicleLights.js';

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createGraphics(game) {
  const { renderer, scene, camera } = game;
  let composer = null, bloom = null, grade = null, builtFor = '', bw = 0, bh = 0;
  const size = new THREE.Vector2();
  const skyEnv = createSkyEnv(game);
  const blobs = safe(() => createBlobShadows(game));
  const lights = safe(() => createVehicleLights(game));
  function safe(fn) { try { return fn(); } catch (e) { console.warn('[graphics] module failed', e); return null; } }

  const stats = { scale: 1, fps: 60, ms: 16, auto: true };
  let ema = 16, slowT = 0, fastT = 0, warm = 3, lastNow = performance.now(), exposure = 1;
  const sunV = new THREE.Vector3(), tmpV = new THREE.Vector3();
  let trauma = 0, shakeT = 0;
  const camPos = new THREE.Vector3(), camQuat = new THREE.Quaternion(), shakeQ = new THREE.Quaternion(), shakeE = new THREE.Euler();

  const basePR = () => Math.min(devicePixelRatio || 1, game.q.pixelRatio);
  function applyScale() { renderer.setPixelRatio(basePR() * stats.scale); }

  function build() {
    const quality = game.settings.quality;
    renderer.getDrawingBufferSize(size);
    const key = quality;
    if (key !== builtFor) {
      builtFor = key; bw = bh = 0;
      composer?.dispose?.(); composer = null; bloom = null; grade = null;
      if (quality === 'low' || size.x < 2 || size.y < 2) return;
      try {
        const high = quality === 'high';
        const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: high ? 4 : 2 });
        composer = new EffectComposer(renderer, target);
        composer.setPixelRatio(1);
        composer.setSize(size.x, size.y);
        composer.addPass(new RenderPass(scene, camera));
        if (high) {
          const ao = new GTAOPass(scene, camera, size.x, size.y);
          ao.blendIntensity = 0.8;
          ao.updateGtaoMaterial?.({ radius: 0.7, distanceExponent: 1.6, thickness: 1.0, scale: 1.0, samples: 12, distanceFallOff: 1.0, screenSpaceRadius: false });
          ao.updatePdMaterial?.({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, radiusExponent: 1, rings: 2, samples: 12 });
          composer.addPass(ao);
        }
        bloom = new UnrealBloomPass(new THREE.Vector2(size.x >> 1, size.y >> 1), 0.15, 0.5, 3);
        composer.addPass(bloom);
        grade = new GradePass(renderer, high);
        composer.addPass(grade);
        grade.setSize(size.x, size.y);
        bw = size.x; bh = size.y;
      } catch (e) {
        console.warn('[graphics] post-processing disabled', e);
        composer = null; grade = null; bloom = null;
      }
      return;
    }
    if (composer && (size.x !== bw || size.y !== bh) && size.x > 1 && size.y > 1) {
      bw = size.x; bh = size.y;
      composer.setSize(size.x, size.y);
      grade?.setSize(size.x, size.y);
    }
  }

  game.events.on('settings:changed', () => { builtFor = ''; stats.scale = 1; slowT = fastT = 0; warm = 3; skyEnv.invalidate(); });
  // camera shake
  const addTrauma = (t) => { if (game.settings.shake === false) return; trauma = Math.min(1, trauma + t); };
  game.events.on('explosion', (e) => {
    if (!e) return;
    const d = Math.hypot(camera.position.x - e.x, camera.position.z - e.z);
    addTrauma(Math.min(0.9, 22 / (d + 8) * ((e.radius || 8) / 8) * 0.55));
  });
  game.events.on('vehicle:crash', (e) => {
    if (!e?.vehicle || e.vehicle.driver !== 'player') return;
    addTrauma(Math.min(0.7, (e.impact || 4) / 28));
  });
  game.events.on('weapon:fired', () => { if (game.player?.inVehicle) return; addTrauma(0.05); });

  function nightFactor() {
    const n = game.world?.nightFactor;
    if (typeof n === 'number' && Number.isFinite(n)) return n;
    const h = game.state.timeOfDay; return h < 5.5 || h > 20 ? 1 : h < 7 ? (7 - h) / 1.5 : h > 18.5 ? (h - 18.5) / 1.5 : 0;
  }

  function dynamicRes(now) {
    const raw = now - lastNow; lastNow = now;
    if (raw > 250 || raw <= 0) return;   // stalls (tab switch, shader compile): ignore
    ema += (raw - ema) * 0.08;
    stats.ms = ema; stats.fps = 1000 / ema;
    if (!stats.auto || game.settings.quality === 'low') return;
    if (warm > 0) { warm -= raw / 1000; return; }
    const dt = raw / 1000;
    if (ema > 24) { slowT += dt; fastT = 0; } else if (ema < 14) { fastT += dt; slowT = 0; } else { slowT = Math.max(0, slowT - dt); fastT = 0; }
    if (slowT > 3 && stats.scale > 0.6) { stats.scale = Math.max(0.6, +(stats.scale - 0.1).toFixed(2)); slowT = 0; warm = 1.5; applyScale(); }
    else if (fastT > 6 && stats.scale < 1) { stats.scale = Math.min(1, +(stats.scale + 0.05).toFixed(2)); fastT = 0; warm = 1.5; applyScale(); }
  }

  function updateSunUV(night) {
    const u = grade.u, sky = game.world?.sky;
    const sd = sky?.sunDir;
    let rays = 0;
    if (sd && game.settings.quality === 'high') {
      sunV.copy(camera.position).addScaledVector(sd, 1000);
      tmpV.copy(sunV).applyMatrix4(camera.matrixWorldInverse);
      if (tmpV.z < 0) {
        sunV.project(camera);
        u.uSunUV.value.set(sunV.x * 0.5 + 0.5, sunV.y * 0.5 + 0.5);
        const low = 0.25 + 0.75 * sstep(0.6, 0.08, sd.y);
        rays = 0.5 * low * sstep(-0.05, 0.1, sd.y) * (1 - night);
      }
    }
    u.uRays.value = rays;
  }

  return {
    get composer() { return composer; },
    stats, skyEnv, blobs, lights,
    /** Add camera shake trauma (0..1). Respects game.settings.shake === false. */
    shake: addTrauma,
    /** Called once per sim step (after the world) for gameplay-driven effects. */
    update(dt) {
      try { lights?.update(dt); } catch (e) { if (!this._le) { this._le = 1; console.error('[gfx lights]', e); } }
    },
    render() {
      const now = performance.now();
      const dtR = Math.min(0.1, Math.max(0.001, (now - (this._t || now)) / 1000)); this._t = now;
      dynamicRes(now);
      build();
      const night = nightFactor();
      skyEnv.update(dtR);
      // reflections follow the time of day (the captured sky already dims, this trims the rest)
      scene.environmentIntensity = 0.95 - 0.5 * night;
      // mild auto exposure
      const tgt = 1.0 + 0.22 * night;
      exposure += (tgt - exposure) * Math.min(1, dtR * 1.5);
      renderer.toneMappingExposure = exposure;
      try { blobs?.update(night); lights?.frame(dtR, night); } catch (e) { if (!this._fe) { this._fe = 1; console.error('[gfx frame]', e); } }
      if (bloom) { bloom.strength = 0.1 + 0.34 * night; bloom.threshold = 3.0 - 2.0 * night; bloom.radius = 0.55; }
      if (grade) {
        const u = grade.u;
        u.toneMappingExposure.value = exposure;
        u.uTime.value = (now * 0.001) % 100;
        u.uVignette.value = 0.2 + 0.12 * night;
        u.uSat.value = 1.06 - 0.04 * night;
        u.uCool.value.setRGB(0.97 - 0.02 * night, 1.0, 1.04 + 0.04 * night);
        u.uWarm.value.setRGB(1.04, 1.0, 0.95 + 0.03 * night);
        updateSunUV(night);
      }
      // shake: offset the camera only for this frame's render
      let shaking = false;
      if (trauma > 0.001) {
        shaking = true; shakeT += dtR * 28;
        camPos.copy(camera.position); camQuat.copy(camera.quaternion);
        const a = trauma * trauma;
        shakeE.set(Math.sin(shakeT * 1.31) * 0.012 * a * 4, Math.sin(shakeT * 0.97 + 2) * 0.012 * a * 4, Math.sin(shakeT * 1.71 + 4) * 0.01 * a * 4);
        shakeQ.setFromEuler(shakeE);
        camera.quaternion.multiply(shakeQ);
        camera.position.x += Math.sin(shakeT * 1.13) * 0.08 * a; camera.position.y += Math.sin(shakeT * 1.57 + 1) * 0.08 * a;
        camera.updateMatrixWorld(true);
        trauma = Math.max(0, trauma - dtR * 1.6);
      }
      if (composer && grade) composer.render(); else renderer.render(scene, camera);
      if (shaking) { camera.position.copy(camPos); camera.quaternion.copy(camQuat); camera.updateMatrixWorld(true); }
    },
  };
}
