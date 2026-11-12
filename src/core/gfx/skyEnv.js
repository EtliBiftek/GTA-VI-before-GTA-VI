// Image-based lighting captured from the live sky dome: a tiny private scene reuses the dome's shader material
// (shared uniforms) plus a ground disc, is rendered into a cube map and prefiltered by PMREM. Refreshed when the
// time of day has moved noticeably (never per frame). Falls back to RoomEnvironment if anything fails.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function createSkyEnv(game) {
  const { renderer, scene } = game;
  let pmrem = null, envScene = null, cubeRT = null, cubeCam = null, ground = null, out = null, failed = false, fallback = false;
  let lastTod = -1, cooldown = 0, ready = false;
  const gc = new THREE.Color(), tmp = new THREE.Color();

  function setupFallback() {
    if (fallback) return;
    fallback = true;
    try {
      pmrem ??= new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    } catch (e) { console.warn('[graphics] environment map unavailable', e); }
  }

  function setup(sky) {
    pmrem = new THREE.PMREMGenerator(renderer);
    envScene = new THREE.Scene();
    const size = game.settings.quality === 'low' ? 64 : 128;
    cubeRT = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false });
    cubeCam = new THREE.CubeCamera(0.5, 3000, cubeRT);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 24, 12), sky.dome.material);
    dome.frustumCulled = false; dome.renderOrder = -10;
    ground = new THREE.Mesh(new THREE.CircleGeometry(900, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x555555, fog: false, toneMapped: false }));
    ground.position.y = -2; ground.renderOrder = -9;
    envScene.add(dome, ground);
  }

  function capture(sky) {
    if (!envScene) setup(sky);
    const u = sky.dome.material.uniforms;
    // ground colour: dark asphalt / city tinted by the ambient ground + horizon light
    const hemi = game.world?.hemiLight;
    if (hemi) gc.copy(hemi.groundColor); else gc.setRGB(0.12, 0.12, 0.12);
    tmp.copy(u.hor.value);
    gc.lerp(tmp, 0.22).multiplyScalar(0.9 + 0.5 * (hemi ? Math.min(1, hemi.intensity / 1.2) : 0.5));
    ground.material.color.copy(gc);
    cubeCam.update(renderer, envScene);
    const next = pmrem.fromCubemap(cubeRT.texture);
    const prev = out;
    out = next;
    scene.environment = next.texture;
    prev?.dispose();
    ready = true;
  }

  return {
    get ready() { return ready; },
    /** force a refresh on the next update */
    invalidate() { lastTod = -1; cooldown = 0; },
    update(dt) {
      if (failed) return;
      const sky = game.world?.sky;
      if (!sky?.dome?.material?.uniforms) { if (!ready && !fallback) setupFallback(); return; }
      cooldown -= dt;
      const tod = game.state.timeOfDay ?? 12;
      let d = 99;
      if (lastTod >= 0) { d = Math.abs(tod - lastTod); if (d > 12) d = 24 - d; }
      const night = game.world?.nightFactor ?? 0;
      // sunrise/sunset moves colours fast, deep night barely changes
      const thr = night > 0.95 ? 1.0 : 0.12;
      if (!ready ? cooldown > 0 : (d < thr || cooldown > 0)) return;
      try {
        capture(sky);
        lastTod = tod;
        cooldown = game.settings.quality === 'low' ? 6 : 2.5;
        fallback = false;
      } catch (e) {
        console.warn('[graphics] sky environment capture failed, using fallback', e);
        failed = true; setupFallback();
      }
    },
  };
}
