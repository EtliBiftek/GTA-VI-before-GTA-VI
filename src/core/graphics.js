// Rendering pipeline: image-based lighting (reflections) + post-processing chain chosen by quality.
//   low    : direct render (cheapest, for phones)
//   medium : MSAA + bloom
//   high   : MSAA + ambient occlusion + bloom
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function createGraphics(game) {
  const { renderer, scene, camera } = game;
  let composer = null, bloom = null, builtFor = '';
  const size = new THREE.Vector2();

  // Environment map so glossy paint, glass and water have something to reflect.
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  } catch (e) { console.warn('[graphics] environment map unavailable', e); }

  function build() {
    const quality = game.settings.quality;
    renderer.getDrawingBufferSize(size);
    const key = `${quality}:${size.x}x${size.y}`;
    if (key === builtFor) return;
    builtFor = key;
    composer?.dispose?.(); composer = null; bloom = null;
    if (quality === 'low' || size.x < 2 || size.y < 2) return;
    try {
      const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: quality === 'high' ? 4 : 2 });
      composer = new EffectComposer(renderer, target);
      composer.setPixelRatio(1);
      composer.setSize(size.x, size.y);
      composer.addPass(new RenderPass(scene, camera));
      if (quality === 'high') {
        const ao = new GTAOPass(scene, camera, size.x >> 1, size.y >> 1);
        ao.blendIntensity = 0.85;
        ao.updateGtaoMaterial?.({ radius: 0.9, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 8 });
        composer.addPass(ao);
      }
      bloom = new UnrealBloomPass(new THREE.Vector2(size.x >> 1, size.y >> 1), 0.15, 0.5, 3);
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
    } catch (e) {
      console.warn('[graphics] post-processing disabled', e);
      composer = null;
    }
  }

  game.events.on('settings:changed', () => { builtFor = ''; });

  return {
    get composer() { return composer; },
    render() {
      build();
      // Reflections and bloom follow the time of day: dim reflections and stronger glow at night.
      const night = game.world?.nightFactor ?? (() => { const h = game.state.timeOfDay; return h < 5.5 || h > 20 ? 1 : h < 7 ? (7 - h) / 1.5 : h > 18.5 ? (h - 18.5) / 1.5 : 0; })();
      scene.environmentIntensity = 0.4 - 0.25 * night;
      if (bloom) { bloom.strength = 0.12 + 0.3 * night; bloom.threshold = 3.2 - 2.2 * night; }
      if (composer) composer.render(); else renderer.render(scene, camera);
    },
  };
}
