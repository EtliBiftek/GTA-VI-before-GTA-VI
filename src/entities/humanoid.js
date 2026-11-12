// Shared blocky articulated humanoid builder (player + peds). ~1.8 m tall, origin at feet, faces +Z.
// Geometries are shared module-wide, materials cached by colour: creating dozens of peds is cheap.
import * as THREE from 'three';
import { clamp, damp } from '../core/utils.js';

const HEIGHT = 1.8;

// Geometries with the pivot baked in (limbs hang from their top).
const G = {
  torso: new THREE.BoxGeometry(0.44, 0.62, 0.24).translate(0, 0, 0),
  head: new THREE.BoxGeometry(0.25, 0.27, 0.25).translate(0, 0.12, 0),
  arm: new THREE.BoxGeometry(0.12, 0.62, 0.13).translate(0, -0.29, 0),
  leg: new THREE.BoxGeometry(0.17, 0.86, 0.19).translate(0, -0.43, 0),
  shoe: new THREE.BoxGeometry(0.18, 0.08, 0.29).translate(0, 0, 0.05),
  hair: new THREE.BoxGeometry(0.27, 0.11, 0.27),
  cap: new THREE.BoxGeometry(0.27, 0.08, 0.27),
  glasses: new THREE.BoxGeometry(0.23, 0.05, 0.04),
};

const matCache = new Map();
function mat(color) {
  let m = matCache.get(color);
  if (!m) { m = new THREE.MeshLambertMaterial({ color }); matCache.set(color, m); }
  return m;
}
const GLASS_MAT = new THREE.MeshBasicMaterial({ color: 0x0a0a12 });

const HIP_Y = 0.88, SHOULDER_Y = 1.5;

export function createHumanoid({
  shirt = 0x3b82c4, pants = 0x2a2f3a, skin = 0xd9a47a, hair = 0x2b1d14, hat = null, shoes = 0x1b1b1f, glasses = false,
} = {}) {
  const group = new THREE.Group();
  const body = new THREE.Group(); // everything lives here so the 'dead' pose can rotate the whole figure
  group.add(body);

  const mk = (geo, color, parent, x, y, z) => {
    const m = new THREE.Mesh(geo, mat(color));
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };

  const torso = mk(G.torso, shirt, body, 0, 1.19, 0);
  const head = mk(G.head, skin, body, 0, 1.52, 0);
  const armL = mk(G.arm, shirt, body, 0.285, SHOULDER_Y, 0);
  const armR = mk(G.arm, shirt, body, -0.285, SHOULDER_Y, 0);
  const legL = mk(G.leg, pants, body, 0.11, HIP_Y, 0);
  const legR = mk(G.leg, pants, body, -0.11, HIP_Y, 0);
  mk(G.shoe, shoes, legL, 0, -0.86, 0);
  mk(G.shoe, shoes, legR, 0, -0.86, 0);
  mk(G.hair, hair, head, 0, 0.2, -0.005);
  if (hat !== null && hat !== undefined && hat !== false) {
    const c = typeof hat === 'number' ? hat : 0xe0463c;
    mk(G.cap, c, head, 0, 0.255, 0.005);
  }
  if (glasses) {
    const g = new THREE.Mesh(G.glasses, GLASS_MAT);
    g.position.set(0, 0.14, 0.13);
    head.add(g);
  }
  const handR = new THREE.Object3D();
  handR.position.set(0, -0.62, 0.04);
  armR.add(handR);

  const parts = { torso, head, armL, armR, legL, legR, handR, body };

  // ---- animation state (closure, no per-frame allocation) ----
  let phase = Math.random() * 6.28;
  let punchT = 0;
  // current smoothed pose
  const P = { lx: 0, rx: 0, alx: 0, arx: 0, alz: 0, arz: 0, tx: 0, by: 0, bz: 0, brx: 0, hx: 0 };

  function animate(state, t, dt, speed = 0) {
    const sp = speed || 0;
    let lx = 0, rx = 0, alx = 0, arx = 0, alz = 0.06, arz = -0.06, tx = 0, by = 0, bz = 0, brx = 0, hx = 0;
    let rate = 18;
    const breathe = Math.sin(t * 1.9 + phase);

    switch (state) {
      case 'walk': case 'run': case 'flee': case 'aim': {
        const moving = sp > 0.15;
        if (moving) phase += dt * (3 + sp * 1.7);
        const amp = state === 'aim' ? clamp(sp * 0.16, 0, 0.6)
          : clamp(sp * 0.16 + 0.1, 0.25, 1.0) * (moving ? 1 : 0);
        const s = Math.sin(phase);
        lx = s * amp; rx = -s * amp;
        by = -Math.abs(Math.cos(phase)) * 0.02 * clamp(sp, 0, 6) * 0.3;
        if (state === 'flee') {
          alx = -2.5 + s * 0.35; arx = -2.5 - s * 0.35; alz = 0.35; arz = -0.35; tx = 0.12;
        } else if (state === 'aim') {
          arx = -1.5; alx = -1.35; arz = -0.04; alz = 0.28;
        } else {
          alx = -s * amp * 0.9; arx = s * amp * 0.9;
          if (state === 'run' || sp > 5) { tx = 0.15; alx -= 0.5; arx -= 0.5; }
        }
        break;
      }
      case 'punch': {
        punchT += dt * 13;
        const k = Math.max(0, Math.sin(punchT));
        arx = -0.5 - k * 1.1; alx = -0.9 + (1 - k) * 0.2; alz = 0.3;
        tx = 0.05 + k * 0.1;
        lx = 0.25; rx = -0.25;
        break;
      }
      case 'jump':
        lx = -0.7; rx = 0.35; alx = -2.6; arx = -2.6; alz = 0.5; arz = -0.5; by = 0.0; rate = 14;
        break;
      case 'sit':
        lx = -1.45; rx = -1.45; alx = -1.1; arx = -1.1; alz = 0.12; arz = -0.12;
        by = -0.42; hx = 0; rate = 12;
        break;
      case 'dead':
        brx = -Math.PI / 2; by = 0.14; lx = 0.1; rx = -0.15; alx = 0.2; arx = -0.1; alz = 0.5; arz = -0.6;
        rate = 9;
        break;
      default: // idle
        alx = breathe * 0.04; arx = -breathe * 0.04; alz = 0.07 + breathe * 0.02; arz = -0.07 - breathe * 0.02;
        by = breathe * 0.006; tx = breathe * 0.01;
        break;
    }
    if (state !== 'punch') punchT = 0;

    const k = damp(rate, dt);
    P.lx += (lx - P.lx) * k; P.rx += (rx - P.rx) * k;
    P.alx += (alx - P.alx) * k; P.arx += (arx - P.arx) * k;
    P.alz += (alz - P.alz) * k; P.arz += (arz - P.arz) * k;
    P.tx += (tx - P.tx) * k; P.by += (by - P.by) * k; P.bz += (bz - P.bz) * k;
    P.brx += (brx - P.brx) * k; P.hx += (hx - P.hx) * k;

    legL.rotation.x = P.lx; legR.rotation.x = P.rx;
    armL.rotation.x = P.alx; armR.rotation.x = P.arx;
    armL.rotation.z = P.alz; armR.rotation.z = P.arz;
    torso.rotation.x = P.tx;
    body.rotation.x = P.brx;
    body.position.y = P.by;
    body.position.z = P.bz;
  }

  return { group, parts, animate, height: HEIGHT };
}

// Geometries/materials are shared module-wide, so there is nothing per-instance to dispose.
export function disposeHumanoid() { /* no-op by design */ }
