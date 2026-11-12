// Shared stylised-realistic articulated humanoid builder (player + peds). ~1.8 m tall (7.5 heads), origin at feet, faces +Z.
// Geometries are shared module-wide (lathe/ellipsoid based, smooth shaded), materials cached by colour, two shared
// canvas face textures. A figure is ~15-19 meshes / ~2.5k tris, no skinning.
//
// Rig (all pivots are Object3D/Mesh children, hanging limbs point down -Y, +Z is forward, character's right is -X):
//   group > body > pelvis(mesh) , legL/legR (hip pivots) > shin pivot (knee) > shoe
//                > torso(mesh, waist pivot) > head (neck pivot), armL/armR (shoulder pivots) > forearm pivot (elbow) > handR
// Optional options: build 'm'|'f'|0..1 (femaleness), hairStyle, sleeves 'short'|'long', legs 'long'|'shorts', heft (width scale).
// Defaults for the optional ones are derived from a hash of the colours, so existing callers get variety for free.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp, damp } from '../core/utils.js';

const HEIGHT = 1.8;
const HIP_Y = 0.93, WAIST_Y = 1.02;
const THIGH = 0.43, SHIN = 0.42, UPPER = 0.29, FORE = 0.26;

// ------------------------------------------------------------------ geometry helpers
const V2 = THREE.Vector2;
function lathe(pts, seg = 9) {
  const p = pts.map((q) => new V2(q[0], q[1]));
  if (p[0].y > p[p.length - 1].y) p.reverse(); // must ascend in y to face outwards
  return new THREE.LatheGeometry(p, seg);
}
function ell(rx, ry, rz, cx = 0, cy = 0, cz = 0, w = 10, h = 7) {
  return new THREE.SphereGeometry(1, w, h).scale(rx, ry, rz).translate(cx, cy, cz);
}
function merge(list) {
  for (const g of list) { if (g.attributes.uv) g.deleteAttribute('uv'); }
  const m = mergeGeometries(list, false);
  list.forEach((g) => g.dispose());
  return m;
}
function tiltAbout(g, cy, cz, ang) { return g.translate(0, -cy, -cz).rotateX(ang).translate(0, cy, cz); }

// ---- head: ellipsoid skull with jaw taper + nose + ears + neck (origin at neck base)
const HC = 0.17; // head centre height above neck base
const HRX = 0.078, HRY = 0.113, HRZ = 0.095;
const jawX = (t) => 1 - 0.3 * Math.pow(t, 1.25);
const jawZ = (t) => 1 - 0.14 * t;
function buildHead() {
  const s = new THREE.SphereGeometry(1, 14, 10);
  s.deleteAttribute('uv'); s.deleteAttribute('normal');
  const pos = s.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = y < 0 ? -y : 0;
    x *= HRX * jawX(t); z *= HRZ * jawZ(t); y *= HRY;
    if (t > 0.5 && z > 0) z *= 1 + 0.06 * (t - 0.5); // chin juts a little
    pos.setXYZ(i, x, y + HC, z);
  }
  let skull = mergeVertices(s, 1e-4);
  skull.computeVertexNormals();
  const neck = new THREE.CylinderGeometry(0.046, 0.052, 0.15, 8, 1, true).translate(0, 0.035, -0.004);
  const nose = ell(0.0105, 0.021, 0.017, 0, 0.14, 0.094, 6, 5);
  const tip = ell(0.012, 0.009, 0.011, 0, 0.126, 0.106, 6, 4);
  const earL = ell(0.0075, 0.025, 0.017, 0.077, HC - 0.005, -0.004, 5, 4);
  const earR = ell(0.0075, 0.025, 0.017, -0.077, HC - 0.005, -0.004, 5, 4);
  return merge([skull, neck, nose, tip, earL, earR]);
}

// decal that hugs the front of the face (eyes / brows / mouth texture)
const FACE_W = 0.132, FACE_Y0 = 0.08, FACE_Y1 = 0.25;
function buildFaceDecal() {
  const g = new THREE.PlaneGeometry(FACE_W, FACE_Y1 - FACE_Y0, 6, 8);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = (FACE_Y0 + FACE_Y1) / 2 + pos.getY(i);
    const uy = (y - HC) / HRY, t = uy < 0 ? -uy : 0;
    const ux = x / (HRX * jawX(t));
    const q = 1 - ux * ux - uy * uy;
    let z = q > 0 ? HRZ * jawZ(t) * Math.sqrt(q) : 0;
    z += 0.0018;
    pos.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

// ---- torso (origin at waist, +Y up to the neck base at 0.48), male / female silhouettes
const TORSO_M = [[0, -0.05], [0.163, -0.05], [0.163, 0.0], [0.157, 0.08], [0.165, 0.17], [0.182, 0.27], [0.196, 0.35], [0.2, 0.41],
  [0.184, 0.455], [0.13, 0.485], [0.085, 0.497], [0.078, 0.512], [0.064, 0.51], [0.05, 0.495], [0, 0.49]];
const TORSO_F = [[0, -0.05], [0.172, -0.05], [0.168, 0.0], [0.14, 0.08], [0.139, 0.17], [0.158, 0.26], [0.17, 0.33], [0.176, 0.385],
  [0.172, 0.42], [0.158, 0.455], [0.115, 0.485], [0.078, 0.497], [0.071, 0.512], [0.059, 0.51], [0.05, 0.495], [0, 0.49]];
const PELVIS_M = [[0, -0.055], [0.085, -0.055], [0.128, -0.02], [0.144, 0.04], [0.142, 0.09], [0.138, 0.14], [0, 0.14]];
const PELVIS_F = [[0, -0.055], [0.09, -0.055], [0.138, -0.02], [0.154, 0.04], [0.146, 0.09], [0.132, 0.14], [0, 0.14]];

// ---- limbs (hang down from the pivot)
const UPPER_ARM = (r) => [[0, 0.05], [0.034, 0.045], [0.048, 0.02], [r, 0], [0.047, -0.12], [0.041, -0.24], [0.038, -0.28], [0.03, -0.30], [0, -0.307]];
const SLEEVE = [[0, 0.054], [0.038, 0.049], [0.052, 0.022], [0.054, 0], [0.052, -0.1], [0.052, -0.18], [0.046, -0.176]];
const FORE_SKIN = [[0, 0.03], [0.03, 0.026], [0.041, 0.008], [0.042, -0.02], [0.039, -0.07], [0.034, -0.16], [0.028, -0.23], [0.026, -0.27], [0, -0.275]];
const FORE_LONG = [[0, 0.03], [0.032, 0.026], [0.044, 0.008], [0.045, -0.02], [0.043, -0.07], [0.038, -0.16], [0.035, -0.23], [0.036, -0.262], [0.03, -0.262], [0, -0.26]];
const THIGH_P = [[0, 0.07], [0.06, 0.06], [0.088, 0.015], [0.088, -0.06], [0.078, -0.2], [0.064, -0.34], [0.058, -0.41], [0.054, -0.435], [0, -0.445]];
const SHIN_P = [[0, 0.03], [0.05, 0.02], [0.056, -0.03], [0.056, -0.12], [0.049, -0.27], [0.043, -0.37], [0.047, -0.42], [0, -0.425]];
const SHIN_S = [[0, 0.03], [0.047, 0.02], [0.053, -0.03], [0.054, -0.12], [0.044, -0.27], [0.033, -0.37], [0.03, -0.42], [0, -0.425]];

function buildHand() {
  return merge([ell(0.021, 0.068, 0.037, 0, -0.325, 0.002, 7, 5), ell(0.013, 0.034, 0.012, 0.004, -0.305, 0.04, 5, 4)]);
}
function buildShoe() {
  const g = ell(0.049, 0.05, 0.125, 0, -0.03, 0.05, 8, 6);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    let y = pos.getY(i);
    if (y < -0.074) { y = -0.08; pos.setY(i, y); }
    const sole = y < -0.05 ? 0.35 : 1;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = sole;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// ---- hair (parented to head, origin = neck base)
// Skull-hugging shell: a scaled sphere whose rim is clamped to a cone of half-angle `theta` around an axis tilted
// backwards by `tilt` (so the hairline sits high on the forehead and low at the nape). Concentric with the head.
function cap(k, theta, tilt, cy = HC + 0.003, cz = -0.005, seg = 12) {
  const g = new THREE.SphereGeometry(1, seg, 9);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  const pos = g.attributes.position;
  const ay = Math.cos(tilt), az = Math.sin(tilt); // axis (0, ay, az) (tilt<0 => leans back)
  const ct = Math.cos(theta), st = Math.sin(theta);
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const d = y * ay + z * az;
    if (d < ct) { // outside the cone: slide onto the rim
      const px = x, py = y - d * ay, pz = z - d * az;
      const l = Math.hypot(px, py, pz) || 1;
      x = px / l * st; y = ay * ct + py / l * st; z = az * ct + pz / l * st;
    }
    pos.setXYZ(i, x * HRX * k, cy + y * HRY * k * 1.03, cz + z * HRZ * k);
  }
  const w = mergeVertices(g, 1e-5);
  const idx = w.index.array, keep = [];
  for (let i = 0; i < idx.length; i += 3) {
    if (idx[i] !== idx[i + 1] && idx[i + 1] !== idx[i + 2] && idx[i] !== idx[i + 2]) keep.push(idx[i], idx[i + 1], idx[i + 2]);
  }
  w.setIndex(keep); w.computeVertexNormals();
  return w;
}
const HAIR = {
  short: () => cap(1.08, 1.78, -0.6),
  buzz: () => cap(1.035, 1.62, -0.55),
  afro: () => merge([cap(1.26, 1.95, -0.5, HC + 0.03, -0.01, 12)]),
  long: () => merge([cap(1.09, 1.85, -0.58), ell(0.082, 0.16, 0.05, 0, 0.075, -0.074, 8, 5)]),
  bob: () => merge([cap(1.1, 1.85, -0.58), ell(0.092, 0.075, 0.075, 0, 0.14, -0.03, 8, 5)]),
  bun: () => merge([cap(1.08, 1.78, -0.6), ell(0.04, 0.04, 0.04, 0, 0.275, -0.085, 7, 5)]),
  bald: null,
};
const HAIR_GEO = {};
for (const k in HAIR) HAIR_GEO[k] = HAIR[k] ? HAIR[k]() : null;

function buildHat() {
  const crown = cap(1.2, 1.62, -0.12, HC + 0.014, -0.004, 12);
  crown.scale(1, 0.92, 1.0);
  const brim = ell(0.075, 0.008, 0.095, 0, 0.222, 0.104, 10, 4);
  return merge([crown, brim]);
}
function buildGlasses() {
  const y = 0.173, z = 0.096;
  const parts = [];
  for (const sx of [-1, 1]) {
    parts.push(new THREE.BoxGeometry(0.047, 0.03, 0.006).translate(sx * 0.031, y, z));
    parts.push(new THREE.BoxGeometry(0.004, 0.004, 0.1).translate(sx * 0.0565, y, z - 0.05));
  }
  parts.push(new THREE.BoxGeometry(0.016, 0.005, 0.005).translate(0, y + 0.006, z));
  return merge(parts);
}

const G = {
  head: buildHead(), face: buildFaceDecal(),
  torsoM: lathe(TORSO_M, 12).scale(1, 1, 0.68), torsoF: lathe(TORSO_F, 12).scale(1, 1, 0.72),
  pelvisM: lathe(PELVIS_M, 12).scale(1, 1, 0.72), pelvisF: lathe(PELVIS_F, 12).scale(1, 1, 0.74),
  upper: lathe(UPPER_ARM(0.048), 8), sleeve: lathe(SLEEVE, 8),
  foreSkin: merge([lathe(FORE_SKIN, 8), buildHand()]), foreLong: lathe(FORE_LONG, 8), hand: buildHand(),
  thigh: lathe(THIGH_P, 8), shinP: lathe(SHIN_P, 8), shinS: lathe(SHIN_S, 8),
  shoe: buildShoe(), hat: buildHat(), glasses: buildGlasses(),
};

// ------------------------------------------------------------------ materials
const matCache = new Map();
function mat(color) {
  let m = matCache.get(color);
  if (!m) { m = new THREE.MeshLambertMaterial({ color }); matCache.set(color, m); }
  return m;
}
const shoeMatCache = new Map();
function shoeMat(color) {
  let m = shoeMatCache.get(color);
  if (!m) { m = new THREE.MeshLambertMaterial({ color, vertexColors: true }); shoeMatCache.set(color, m); }
  return m;
}
const GLASS_MAT = new THREE.MeshBasicMaterial({ color: 0x0a0a12 });

let faceMats = null;
function getFaceMat(female) {
  if (!faceMats) {
    faceMats = [null, null];
    if (typeof document === 'undefined') return null;
    for (let f = 0; f < 2; f++) {
      const W = 128, H = 164;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d');
      const X = (v) => (v + FACE_W / 2) / FACE_W * W, Y = (v) => (FACE_Y1 - v) / (FACE_Y1 - FACE_Y0) * H;
      const eyeY = Y(0.172), ex = X(0.03) - X(0);
      for (const s of [-1, 1]) {
        const cx = X(0) + s * ex;
        x.fillStyle = '#e9e3dc'; x.beginPath(); x.ellipse(cx, eyeY, 10.5, 5.8, 0, 0, 7); x.fill();
        x.fillStyle = f ? '#3a5a52' : '#4a3322'; x.beginPath(); x.arc(cx, eyeY, 4.8, 0, 7); x.fill();
        x.fillStyle = '#0a0806'; x.beginPath(); x.arc(cx, eyeY, 2.3, 0, 7); x.fill();
        x.fillStyle = 'rgba(255,255,255,0.8)'; x.fillRect(cx + 1, eyeY - 3, 1.6, 1.6);
        x.strokeStyle = f ? 'rgba(15,10,8,0.95)' : 'rgba(20,12,8,0.7)'; x.lineWidth = f ? 2.6 : 1.8;
        x.beginPath(); x.ellipse(cx, eyeY + 0.4, 11, 6.2, 0, Math.PI * 1.05, Math.PI * 1.95); x.stroke();
        x.strokeStyle = 'rgba(80,40,30,0.35)'; x.lineWidth = 1.2;
        x.beginPath(); x.ellipse(cx, eyeY, 10.5, 6.2, 0, 0.15, Math.PI - 0.15); x.stroke();
        // brow
        x.strokeStyle = f ? 'rgba(35,22,16,0.9)' : 'rgba(30,19,13,0.95)'; x.lineWidth = f ? 2.8 : 4.4; x.lineCap = 'round';
        const by = Y(f ? 0.199 : 0.196);
        x.beginPath(); x.moveTo(cx - s * 11, by + 1.5); x.quadraticCurveTo(cx, by - 3, cx + s * 11, by + 1.2); x.stroke();
      }
      // mouth
      const my = Y(0.093);
      if (f) {
        x.fillStyle = 'rgba(170,62,76,0.9)'; x.beginPath(); x.ellipse(X(0), my, 9.5, 3.6, 0, 0, 7); x.fill();
        x.strokeStyle = 'rgba(80,20,28,0.9)'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(X(0) - 9, my); x.lineTo(X(0) + 9, my); x.stroke();
      } else {
        x.strokeStyle = 'rgba(85,38,34,0.85)'; x.lineWidth = 2; x.lineCap = 'round';
        x.beginPath(); x.moveTo(X(0) - 9, my); x.quadraticCurveTo(X(0), my + 1.5, X(0) + 9, my); x.stroke();
        x.fillStyle = 'rgba(120,55,50,0.35)'; x.beginPath(); x.ellipse(X(0), my + 3.2, 6.5, 1.8, 0, 0, 7); x.fill();
      }
      // nostril hints
      x.fillStyle = 'rgba(70,30,25,0.4)';
      for (const s of [-1, 1]) { x.beginPath(); x.ellipse(X(0) + s * 4.2, Y(0.121), 1.6, 1.1, 0, 0, 7); x.fill(); }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      faceMats[f] = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    }
  }
  return faceMats[female ? 1 : 0];
}

// ------------------------------------------------------------------ variety
function hashOf(...vals) {
  let h = 2166136261;
  for (const v of vals) { h = Math.imul(h ^ ((v | 0) + 0x9e3779b9), 16777619); h ^= h >>> 13; }
  h = Math.imul(h, 0x85ebca6b); h ^= h >>> 16;
  return h >>> 0;
}

const KEYS = ['hl', 'hr', 'kl', 'kr', 'sl', 'sr', 'zl', 'zr', 'el', 'er', 'tx', 'ty', 'tz', 'py', 'pz', 'bx', 'by', 'bz', 'brx', 'hx', 'hy', 'gw', 'br'];

export function createHumanoid({
  shirt = 0x3b82c4, pants = 0x2a2f3a, skin = 0xd9a47a, hair = 0x2b1d14, hat = null, shoes = 0x1b1b1f, glasses = false,
  build, hairStyle, sleeves, legs, heft,
} = {}) {
  const h = hashOf(shirt, pants, skin, hair, shoes);
  const r1 = (h & 255) / 255, r2 = ((h >>> 8) & 255) / 255, r3 = ((h >>> 16) & 255) / 255, r4 = ((h >>> 24) & 255) / 255;
  let fem = typeof build === 'number' ? build : build === 'f' ? 1 : build === 'm' ? 0 : (r1 < 0.45 ? 1 : 0);
  const isF = fem >= 0.5;
  if (!hairStyle) {
    if (isF) hairStyle = r2 < 0.4 ? 'long' : r2 < 0.6 ? 'bun' : r2 < 0.82 ? 'bob' : 'short';
    else hairStyle = r2 < 0.38 ? 'short' : r2 < 0.62 ? 'buzz' : r2 < 0.74 ? 'afro' : r2 < 0.84 ? 'bald' : r2 < 0.9 ? 'long' : 'short';
  }
  const longSleeves = sleeves ? sleeves === 'long' : r3 < 0.27;
  const shorts = legs ? legs === 'shorts' : r4 < 0.13;
  const hf = heft ?? (0.93 + r4 * 0.0 + ((h >>> 5) & 15) / 15 * 0.16);
  const wTorso = hf * (1 - fem * 0.0), wLimb = hf * (1 - fem * 0.1);

  const group = new THREE.Group();
  const body = new THREE.Group(); // dead pose rotates the whole figure
  group.add(body);
  if (isF) body.scale.setScalar(0.965);

  const mk = (geo, material, parent, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z); parent.add(m); return m;
  };
  const piv = (parent, x, y, z) => { const o = new THREE.Group(); o.position.set(x, y, z); parent.add(o); return o; };

  const skinM = mat(skin), shirtM = mat(shirt), pantsM = mat(pants);

  // pelvis + torso
  const pelvis = mk(isF ? G.pelvisF : G.pelvisM, pantsM, body, 0, HIP_Y, 0);
  pelvis.scale.set(wTorso, 1, wTorso); pelvis.rotation.order = 'YXZ';
  const torso = mk(isF ? G.torsoF : G.torsoM, shirtM, body, 0, WAIST_Y, 0);
  torso.scale.set(wTorso, 1, wTorso); torso.rotation.order = 'YXZ';
  // children of a scaled mesh inherit the scale: counter it with holders
  const upperHolder = piv(torso, 0, 0, 0);
  upperHolder.scale.set(1 / wTorso, 1, 1 / wTorso); // undo the torso heft scale for attached parts

  // head
  const head = piv(upperHolder, 0, 0.48, 0); head.rotation.order = 'YXZ';
  const headMesh = mk(G.head, skinM, head);
  const hs = isF ? 0.95 : 1; head.scale.set(hs, hs, hs);
  const fm = getFaceMat(isF);
  if (fm) mk(G.face, fm, head);
  if (HAIR_GEO[hairStyle]) mk(HAIR_GEO[hairStyle], mat(hair), head);
  if (hat !== null && hat !== undefined && hat !== false) {
    mk(G.hat, mat(typeof hat === 'number' ? hat : 0xe0463c), head);
  }
  if (glasses) mk(G.glasses, GLASS_MAT, head);

  // arms
  const sx = isF ? 0.168 : 0.184;
  function makeArm(side) {
    const arm = piv(upperHolder, side * sx, 0.425, 0);
    arm.rotation.order = 'XZY';
    const aw = wLimb * (isF ? 0.92 : 1);
    arm.scale.set(aw, 1, aw);
    mk(G.upper, longSleeves ? shirtM : skinM, arm);
    if (!longSleeves) mk(G.sleeve, shirtM, arm);
    const elbow = piv(arm, 0, -UPPER, 0);
    elbow.rotation.order = 'XZY';
    if (longSleeves) { mk(G.foreLong, shirtM, elbow); mk(G.hand, skinM, elbow); } else mk(G.foreSkin, skinM, elbow);
    return { arm, elbow };
  }
  const aL = makeArm(1), aR = makeArm(-1);
  const armL = aL.arm, armR = aR.arm;
  const handR = new THREE.Object3D();
  handR.position.set(0, -0.205, 0); // grip point at the palm; held weapons point along the forearm
  aR.elbow.add(handR);

  // legs
  const hx = isF ? 0.097 : 0.09;
  function makeLeg(side) {
    const leg = piv(body, side * hx, HIP_Y, 0);
    const lw = wLimb * (isF ? 0.95 : 1);
    leg.scale.set(lw, 1, lw);
    mk(G.thigh, pantsM, leg);
    const knee = piv(leg, 0, -THIGH, 0);
    mk(shorts ? G.shinS : G.shinP, shorts ? skinM : pantsM, knee);
    const shoe = mk(G.shoe, shoeMat(shoes), knee, 0, -SHIN, 0);
    return { leg, knee, shoe };
  }
  const lL = makeLeg(1), lR = makeLeg(-1);
  const legL = lL.leg, legR = lR.leg;

  const parts = { torso, head, armL, armR, legL, legR, handR, body };

  // ---------------------------------------------------------------- animation (closure, no per-frame allocation)
  let phase = Math.random() * 6.28;
  const idlePh = Math.random() * 6.28;
  let punchT = 0;
  const P = {}, T = {};
  for (const k of KEYS) { P[k] = 0; T[k] = 0; }
  P.zl = 0.08; P.zr = -0.08;

  function animate(state, t, dt, speed = 0) {
    const sp = speed || 0;
    for (const k of KEYS) T[k] = 0;
    T.zl = 0.06; T.zr = -0.06; T.gw = 1;
    let rate = 16;
    const breathe = Math.sin(t * 1.9 + idlePh);
    T.br = breathe;

    switch (state) {
      case 'walk': case 'run': case 'flee': case 'aim': {
        const mv = clamp((sp - 0.1) / 0.5, 0, 1);
        if (sp > 0.15) phase += dt * (3 + sp * 1.7);
        const aiming = state === 'aim';
        const amp = (aiming ? clamp(0.12 + sp * 0.11, 0, 0.62) : clamp(0.2 + sp * 0.14, 0.2, 0.92)) * mv;
        const runK = (aiming ? 0 : clamp((sp - 2.4) / 3, 0, 1)) * mv;
        const sL = Math.sin(phase), sR = -sL, cL = Math.cos(phase), cR = -cL;
        T.hl = -sL * amp + 0.02; T.hr = -sR * amp + 0.02;
        const kA = (0.12 + amp * 1.3) * mv;
        T.kl = kA * Math.max(0, cL) + 0.1 * mv + (cL < 0 ? 0.08 * Math.max(0, -cL) * mv * (sL > 0 ? 1 : 0) : 0);
        T.kr = kA * Math.max(0, cR) + 0.1 * mv + (cR < 0 ? 0.08 * Math.max(0, -cR) * mv * (sR > 0 ? 1 : 0) : 0);
        T.ty = sL * (0.05 + amp * 0.14); T.py = -T.ty * 0.7;
        T.tz = cL * 0.015 * mv; T.pz = -T.tz * 2;
        T.tx = 0.03 + runK * 0.2 + (aiming ? 0.02 : 0);
        T.hx = -T.tx * 0.7; T.hy = -T.ty * 0.8;
        if (state === 'flee') {
          const a = 0.35 * mv;
          T.sl = -2.55 + sL * a; T.sr = -2.55 - sL * a; T.zl = 0.4; T.zr = -0.4; T.el = -0.5 - cL * 0.3; T.er = -0.5 + cL * 0.3;
          T.tx = 0.1 + runK * 0.1; T.hx = -0.12; T.hy = Math.sin(phase * 0.5) * 0.25;
        } else if (aiming) {
          // right hand forward holding the weapon (points along the forearm = +Z), left hand supports from below
          // forearm horizontal (sr + er = -pi/2) so the weapon points straight along +Z at chest height
          T.sr = -0.55; T.er = -1.02; T.zr = 0.05;
          T.sl = -1.2; T.el = -0.15; T.zl = -0.42;
          T.ty = -0.05; T.py = 0; T.tx = 0.03; T.hx = -0.02; T.hy = 0;
        } else {
          const armA = amp * (0.85 - runK * 0.3) + 0.05, swL = sL * armA, swR = -sL * armA; // + = forward ... we use x<0 forward
          T.sl = swL - runK * 0.35; T.sr = swR - runK * 0.35;
          T.el = -(0.14 + 1.15 * runK + 0.4 * Math.max(0, -swL) * (0.5 + runK)) * (0.3 + 0.7 * mv) - 0.05;
          T.er = -(0.14 + 1.15 * runK + 0.4 * Math.max(0, -swR) * (0.5 + runK)) * (0.3 + 0.7 * mv) - 0.05;
          T.zl = 0.07 + runK * 0.05; T.zr = -0.07 - runK * 0.05;
          if (mv < 0.5) { // standing still while in a walk state: relax like idle
            T.sl += breathe * 0.03; T.sr -= breathe * 0.03;
          }
        }
        break;
      }
      case 'punch': {
        punchT += dt * 13;
        const k = Math.max(0, Math.sin(punchT));
        T.sr = -0.9 - k * 0.75; T.er = -1.9 + k * 1.75; T.zr = 0.12;
        T.sl = -0.75; T.el = -1.9; T.zl = 0.25 - 0.25 * k;
        T.ty = 0.1 + k * 0.45; T.py = -0.1 - k * 0.15; T.tx = 0.08 + k * 0.06;
        T.hl = -0.45; T.hr = 0.4; T.kl = 0.35; T.kr = 0.25;
        T.hy = -T.ty * 0.8; T.hx = -0.05;
        break;
      }
      case 'jump':
        T.hl = -0.75; T.kl = 1.1; T.hr = 0.25; T.kr = 0.75;
        T.sl = -2.1; T.sr = -2.0; T.el = -0.35; T.er = -0.4; T.zl = 0.55; T.zr = -0.55;
        T.tx = 0.05; T.hx = -0.1; T.gw = 0; rate = 12;
        break;
      case 'sit':
        T.hl = -1.5; T.hr = -1.5; T.kl = 1.5; T.kr = 1.5;
        T.sl = -0.95; T.sr = -0.95; T.el = -0.85; T.er = -0.85; T.zl = 0.12; T.zr = -0.12;
        T.by = -0.42; T.tx = -0.04; T.hx = 0.04; T.gw = 0; rate = 12;
        break;
      case 'dead':
        T.brx = -Math.PI / 2; T.by = 0.125; T.gw = 0;
        T.hl = -0.06; T.hr = 0.1; T.kl = 0.12; T.kr = 0.25;
        T.sl = 0.15; T.sr = -0.1; T.zl = 0.55; T.zr = -0.7; T.el = -0.25; T.er = -0.4;
        T.hy = 0.4; T.hx = 0.05; T.tz = 0.05; T.br = 0; rate = 9;
        break;
      default: { // idle: breathing + weight shift + glances
        const w = t * 0.45 + idlePh, shift = Math.sin(w);
        T.hl = 0.03 + shift * 0.03; T.hr = 0.03 - shift * 0.03;
        T.kl = 0.05 + Math.max(0, shift) * 0.1; T.kr = 0.05 + Math.max(0, -shift) * 0.1;
        T.bx = -shift * 0.014; T.pz = shift * 0.035; T.tz = -shift * 0.03;
        T.sl = -0.04 + breathe * 0.025; T.sr = -0.04 - breathe * 0.025;
        T.zl = 0.05 + breathe * 0.012; T.zr = -0.05 - breathe * 0.012;
        T.el = -0.2; T.er = -0.2;
        T.tx = 0.02 + breathe * 0.012; T.ty = Math.sin(t * 0.3 + idlePh) * 0.05;
        T.hy = Math.sin(t * 0.37 + idlePh * 2) * 0.35; T.hx = Math.sin(t * 0.23 + idlePh) * 0.05;
        break;
      }
    }
    if (state !== 'punch') punchT = 0;

    const k = damp(rate, dt);
    for (let i = 0; i < KEYS.length; i++) { const n = KEYS[i]; P[n] += (T[n] - P[n]) * k; }

    // ---- apply
    legL.rotation.x = P.hl; legR.rotation.x = P.hr;
    lL.knee.rotation.x = P.kl; lR.knee.rotation.x = P.kr;
    lL.shoe.rotation.x = clamp(-(P.hl + P.kl) * 0.9, -0.9, 0.9);
    lR.shoe.rotation.x = clamp(-(P.hr + P.kr) * 0.9, -0.9, 0.9);
    armL.rotation.x = P.sl; armR.rotation.x = P.sr;
    armL.rotation.z = P.zl; armR.rotation.z = P.zr;
    aL.elbow.rotation.x = P.el; aR.elbow.rotation.x = P.er;
    torso.rotation.set(P.tx, P.ty, P.tz);
    pelvis.rotation.set(0, P.py, P.pz);
    head.rotation.set(P.hx, P.hy, 0);
    torso.scale.y = 1 + P.br * 0.006;
    // keep the lower-most foot on the ground (leg reach shortens when swung / bent)
    const reachL = THIGH * Math.cos(P.hl) + SHIN * Math.cos(P.hl + P.kl);
    const reachR = THIGH * Math.cos(P.hr) + SHIN * Math.cos(P.hr + P.kr);
    const ground = Math.max(reachL, reachR) - (THIGH + SHIN);
    body.rotation.x = P.brx;
    body.position.set(P.bx, P.by + ground * P.gw, P.bz);
  }

  return { group, parts, animate, height: HEIGHT };
}

// Geometries/materials are shared module-wide, so there is nothing per-instance to dispose.
export function disposeHumanoid() { /* no-op by design */ }
