// Rigged (skinned + animated) upgrade for the procedural humanoid (humanoid.js). Models: Quaternius "Ultimate Animated Character Pack"
// (CC0) converted by tools/assets/build-characters.cjs to public/assets/models/characters/*.glb (one skinned mesh per character, a
// palette texture row per material, shared skeleton) + anim.glb (shared clips). See CREDITS.md.
//
// Contract: a humanoid is ALWAYS created procedural; `attachRig(hum, opts, extras)` upgrades it in place when the glTF files are loaded,
// the quality tier allows it and the active-rig cap has room. The humanoid object keeps its identity (`group`, `parts`, `parts.handR`);
// the procedural body is hidden, `handR` is re-parented to the right-hand bone, and `animate()` drives an AnimationMixer + a few
// procedural bone overrides (aim / flee / jump / run lean). Failed loads simply leave the procedural figure.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { assets } from '../core/assets.js';
import { clamp } from '../core/utils.js';

const DIR = 'characters/';
const ANIM_FILE = DIR + 'anim.glb';
const HEIGHT = 1.8;
const FADE = 0.2;

// model id -> { file, f: female, role: which opts.role it serves }
export const RIG_MODELS = {
  casual2_male: { m: 1 }, casual_bald: { m: 1 }, worker_male: { m: 1 }, casual3_male: { m: 1 },
  casual_female: { f: 1 }, casual2_female: { f: 1 },
  casual_male: { player: 1 }, bluesoldier_male: { cop: 1 }, ninja_male: { gang: 1 },
};
const CIVIL_M = ['casual2_male', 'casual_bald', 'worker_male', 'casual3_male'];
const CIVIL_F = ['casual_female', 'casual2_female'];

// palette material name -> colour role
const ROLE = {
  Skin: 'skin', Face: 'eyes', Hair: 'hair', Shirt: 'shirt', Main: 'shirt', Clothes: 'shirt', Jacket: 'shirt',
  Pants: 'pants', Belt: 'belt', Hat: 'hat', Helmet: 'hat',
};

// ------------------------------------------------------------------ configuration (quality tiers)
const cfg = { maxRigged: 0, playerRig: true, quality: 'low' };
export function configureHumanoids(quality = 'medium', isMobile = false) {
  cfg.quality = quality;
  cfg.maxRigged = quality === 'low' ? 0 : quality === 'medium' ? (isMobile ? 8 : 12) : (isMobile ? 12 : 20);
  cfg.playerRig = true;
  rebalance();
}

// ------------------------------------------------------------------ loading
let wanted = null;
function requestAssets() {
  if (wanted) return;
  wanted = true;
  assets.load(ANIM_FILE);
  const ids = cfg.maxRigged > 0 ? Object.keys(RIG_MODELS) : ['casual_male'];
  for (const id of ids) assets.load(DIR + id + '.glb');
}
let loadedHook = false;
function hookLoads() {
  if (loadedHook) return;
  loadedHook = true;
  assets.onLoad((name) => { if (name.startsWith(DIR)) rebalance(); });
}

// ------------------------------------------------------------------ per-model cached data
const modelInfo = new Map();
function infoOf(id) {
  let inf = modelInfo.get(id);
  if (inf) return inf;
  const gltf = assets.get(DIR + id + '.glb');
  if (!gltf) return null;
  const root = SkeletonUtils.clone(gltf.scene);
  const mesh = root.getObjectByName('BodyMesh');
  if (!mesh) { modelInfo.set(id, false); return null; }
  const holder = new THREE.Group(); holder.add(root); holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mesh, true);
  const palette = (mesh.userData.palette || []).map((p) => ({ name: p.name, hex: parseInt(p.color, 16) }));
  inf = { gltf, minY: box.min.y, height: box.max.y - box.min.y, palette };
  inf.s = HEIGHT / inf.height;
  mesh.geometry.userData.noDispose = true;
  modelInfo.set(id, inf);
  return inf;
}

// ------------------------------------------------------------------ palette materials (ref-counted, one draw call per character)
const matCache = new Map();
const _c = new THREE.Color();
function paletteMaterial(inf, colors) {
  const cols = inf.palette.map((p) => {
    const r = ROLE[p.name];
    const v = r && colors[r] !== undefined && colors[r] !== null ? colors[r] : p.hex;
    return v;
  });
  const key = inf.gltf.uuid + ':' + cols.join(',');
  let e = matCache.get(key);
  if (!e) {
    const data = new Uint8Array(8 * 4).fill(255);
    cols.forEach((hex, i) => { _c.setHex(hex, THREE.SRGBColorSpace); data[i * 4] = (hex >> 16) & 255; data[i * 4 + 1] = (hex >> 8) & 255; data[i * 4 + 2] = hex & 255; });
    const tex = new THREE.DataTexture(data, 8, 1, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
    const material = new THREE.MeshLambertMaterial({ map: tex, flatShading: true });
    e = { key, tex, material, refs: 0 };
    matCache.set(key, e);
  }
  e.refs++;
  return e;
}
function releaseMaterial(e) {
  if (!e || --e.refs > 0) return;
  matCache.delete(e.key); e.tex.dispose(); e.material.dispose();
}

// ------------------------------------------------------------------ registry (cap management)
const active = new Set();   // Rig-bearing entries
const pending = new Set();  // entries that want a rig but have none yet
let rebalancing = false;
const focus = { x: 0, z: 0 };
let tickT = 0;

const d2f = (e) => { const p = e.group.position; const dx = p.x - focus.x, dz = p.z - focus.z; return dx * dx + dz * dz; };
export function rebalance() {
  if (rebalancing) return;
  rebalancing = true;
  try {
    // priority entries (the player) always get a rig as soon as the files are there
    for (const e of pending) if (e.priority && !e.disposed && e.group.parent && cfg.playerRig) upgrade(e);
    const N = cfg.maxRigged;
    const cand = [];
    for (const e of active) if (!e.priority) cand.push(e);
    for (const e of pending) if (!e.priority && !e.disposed && !e.failed && e.group.parent) cand.push(e);
    for (const e of cand) e.d2 = d2f(e);
    cand.sort((a, b) => a.d2 - b.d2);
    const keep = new Set();
    for (let i = 0; i < cand.length && keep.size < N; i++) { if (i < N - 2 || cand[i].rig) keep.add(cand[i]); }
    for (const e of cand) if (e.rig && !keep.has(e)) downgrade(e);
    let n = [...active].filter((e) => !e.priority).length;
    for (const e of cand) { if (n >= N) break; if (!e.rig && keep.has(e) && upgrade(e)) n++; }
  } finally { rebalancing = false; }
}
/** call once per frame from the player: focus point for nearest-first selection + a cheap periodic rebalance */
export function tickRigs(x, z, dt) {
  focus.x = x; focus.z = z;
  tickT -= dt;
  if (tickT <= 0 && (pending.size || active.size)) { tickT = 0.8; rebalance(); }
}

// ------------------------------------------------------------------ rig construction
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const FWD = new THREE.Vector3(0, 0, 1);

// quaternion of `o` relative to `stop` (exclusive) accumulated from local rotations
function quatIn(o, stop, out) {
  out.identity();
  for (let n = o; n && n !== stop; n = n.parent) out.premultiply(n.quaternion);
  return out;
}

class Rig {
  constructor(entry, id, inf, colors) {
    this.entry = entry; this.id = id; this.inf = inf;
    const gltf = inf.gltf, animGltf = assets.get(ANIM_FILE);
    this.node = new THREE.Group(); this.node.name = 'rig';            // character space (metres, +Z forward, feet at y=0)
    this.clone = SkeletonUtils.clone(gltf.scene);
    this.holder = new THREE.Group();                                   // uniform scale + feet offset
    this.holder.scale.setScalar(inf.s);
    this.holder.position.y = -inf.minY * inf.s;
    this.holder.add(this.clone);
    this.node.add(this.holder);
    this.mesh = this.clone.getObjectByName('BodyMesh');
    this.mat = paletteMaterial(inf, colors);
    this.mesh.material = this.mat.material;
    this.mesh.frustumCulled = false;
    this.bones = {};
    for (const n of ['Hips', 'Abdomen', 'Torso', 'Neck', 'Head', 'UpperArmL', 'LowerArmL', 'FistL', 'UpperArmR', 'LowerArmR', 'FistR',
      'UpperLegL', 'LowerLegL', 'FootL', 'UpperLegR', 'LowerLegR', 'FootR']) this.bones[n] = this.clone.getObjectByName(n);
    this.mixer = new THREE.AnimationMixer(this.clone);
    this.actions = {};
    for (const clip of animGltf.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
    this.cur = null; this.curName = '';
    this.leftK = 1; this.wave = 0; this.dirty = false;
    this.base = OVERRIDE_BONES.map((n) => this.bones[n].quaternion.clone());
    this.dead = false; this.lean = 0; this.aimK = 0; this.fleeK = 0; this.jumpK = 0; this.deadK = 0; this.fall = 0;
    this.play('Idle', 0);
    this.mixer.update(0);
    this.clone.updateMatrixWorld(true);
    this.setupHand();
  }

  // handR: -Y axis = along the forearm towards the fingers, +Z = up when the arm points forward (same convention as the procedural arm)
  setupHand() {
    const lower = this.bones.LowerArmR, fist = this.bones.FistR;
    // pose the arm forward once to learn the bone's roll, then derive the fixed local offset
    const b = this.bones, saved = ARM_BONES.map((n) => b[n].quaternion.clone());
    this.poseArms(1, 0, 0, 0);
    quatIn(lower, this.holder, _q);                                      // forearm orientation in character space (scaled holder has no rotation)
    const want = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0));
    const wantQ = new THREE.Quaternion().setFromRotationMatrix(want);
    this.handQ = _q.clone().invert().multiply(wantQ);
    this.handPos = fist.position.clone();
    ARM_BONES.forEach((n, i) => b[n].quaternion.copy(saved[i]));
    this.clone.updateMatrixWorld(true);
  }

  play(name, fade = FADE, timeScale = 1, once = false) {
    const next = this.actions[name];
    if (!next) return;
    if (this.curName !== name) {
      if (this.cur) this.cur.fadeOut(fade);
      next.reset();
      next.enabled = true;
      next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = once;
      next.setEffectiveWeight(1);
      if (fade > 0) next.fadeIn(fade);
      next.play();
      this.cur = next; this.curName = name;
    }
    next.setEffectiveTimeScale(timeScale);
  }

  // point `bone` so that its direction towards its child bone equals character-space `dir`
  aimBone(bone, child, dir, k) {
    _v.copy(child.position).normalize();                               // rest direction in the bone's own frame
    quatIn(bone.parent, this.holder, _q);                              // parent's character-space rotation
    _v2.copy(dir).applyQuaternion(_q3.copy(_q).invert());              // wanted direction in the parent frame
    _q2.setFromUnitVectors(_v, _v2);
    if (k >= 1) bone.quaternion.copy(_q2); else bone.quaternion.slerp(_q2, k);
  }

  poseArms(aim, flee, jump, dead) {
    const b = this.bones, d = _dirs;
    if (aim > 0.001) {
      d.u.set(0.04, -0.52, 0.85).normalize(); d.f.set(0.02, -0.02, 1).normalize();
      this.aimBone(b.UpperArmR, b.LowerArmR, d.u, aim); this.aimBone(b.LowerArmR, b.FistR, d.f, aim);
      d.u.set(-0.18, -0.55, 0.8).normalize(); d.f.set(-0.52, -0.05, 0.85).normalize();
      this.aimBone(b.UpperArmL, b.LowerArmL, d.u, aim * this.leftK); this.aimBone(b.LowerArmL, b.FistL, d.f, aim * this.leftK);
    }
    if (flee > 0.001) {
      const w = this.wave;
      d.u.set(0.5, 0.75 + w * 0.2, 0.3).normalize(); d.f.set(0.35, 0.9, 0.35 + w * 0.3).normalize();
      this.aimBone(b.UpperArmL, b.LowerArmL, d.u, flee); this.aimBone(b.LowerArmL, b.FistL, d.f, flee);
      d.u.set(-0.5, 0.75 - w * 0.2, 0.3).normalize(); d.f.set(-0.35, 0.9, 0.35 - w * 0.3).normalize();
      this.aimBone(b.UpperArmR, b.LowerArmR, d.u, flee); this.aimBone(b.LowerArmR, b.FistR, d.f, flee);
    }
    if (dead > 0.001) {
      d.u.set(0.8, -0.35, 0.15).normalize(); d.f.set(0.85, -0.2, 0.3).normalize();
      this.aimBone(b.UpperArmL, b.LowerArmL, d.u, dead); this.aimBone(b.LowerArmL, b.FistL, d.f, dead);
      d.u.set(-0.7, -0.4, 0.1).normalize(); d.f.set(-0.6, -0.3, 0.5).normalize();
      this.aimBone(b.UpperArmR, b.LowerArmR, d.u, dead); this.aimBone(b.LowerArmR, b.FistR, d.f, dead);
    }
    if (jump > 0.001) {
      d.u.set(0.75, 0.55, 0.25).normalize(); d.f.set(0.6, 0.8, 0.2).normalize();
      this.aimBone(b.UpperArmL, b.LowerArmL, d.u, jump); this.aimBone(b.LowerArmL, b.FistL, d.f, jump);
      d.u.set(-0.75, 0.55, 0.25).normalize(); d.f.set(-0.6, 0.8, 0.2).normalize();
      this.aimBone(b.UpperArmR, b.LowerArmR, d.u, jump); this.aimBone(b.LowerArmR, b.FistR, d.f, jump);
    }
  }

  leanBy(bone, ang) {
    if (Math.abs(ang) < 1e-4) return;
    quatIn(bone.parent, this.holder, _q);
    _q2.setFromAxisAngle(_xAxis, ang);                                 // rotation in character space
    bone.quaternion.premultiply(_q3.copy(_q).invert().multiply(_q2).multiply(_q));
  }

  animate(state, t, dt, speed) {
    const sp = speed || 0;
    let clip = 'Idle', ts = 1, once = false, aim = 0, flee = 0, jump = 0, dead = 0;
    const moving = sp > 0.12;
    const lean = state === 'dead' || state === 'sit' || state === 'jump' || state === 'punch' ? 0 : clamp((sp - 2.2) * 0.055, 0, 0.3);
    switch (state) {
      case 'walk': if (moving) { clip = 'Walk'; ts = clamp(sp / WALK_SPEED, 0.5, 2.4); } break;
      case 'run': clip = 'Walk'; ts = clamp(sp / WALK_SPEED * 0.7, 1.4, 2.6); break;
      case 'flee': clip = 'Walk'; ts = clamp(sp / WALK_SPEED * 0.7, 1.4, 2.6); flee = 1; break;
      case 'aim': aim = 1; if (sp > 0.3) { clip = 'Walk'; ts = clamp(sp / WALK_SPEED, 0.5, 1.8); } break;
      case 'punch': clip = 'Punch'; ts = 1.25; break;
      case 'jump': clip = 'Walk'; ts = 0; jump = 1; break;
      case 'sit': clip = 'SitDown'; once = true; break;
      case 'dead': clip = 'RecieveHit'; once = true; dead = 1; break;
      default: break;
    }
    // the mixer only writes a bone when its interpolated value CHANGED, so undo last frame's procedural overrides first
    if (this.dirty) { OVERRIDE_BONES.forEach((n, i) => this.bones[n].quaternion.copy(this.base[i])); this.dirty = false; }
    this.play(clip, state === 'jump' ? 0.12 : FADE, ts, once);
    if (state === 'jump' && this.cur) { this.cur.time = 0.28; }
    this.mixer.update(dt);
    // smooth blend weights for the procedural overrides
    const k = Math.min(1, dt * 14);
    this.aimK += (aim - this.aimK) * k; this.fleeK += (flee - this.fleeK) * k; this.jumpK += (jump - this.jumpK) * k; this.deadK += (dead - this.deadK) * k;
    this.lean += (lean - this.lean) * Math.min(1, dt * 6);
    this.wave = Math.sin(t * 9);
    // falling over: rotate the whole figure onto its back about the feet (same convention as the procedural dead pose)
    this.fall += ((dead ? 1 : 0) - this.fall) * Math.min(1, dt * (dead ? 5 : 8));
    if (this.fall > 0.002 || this.node.rotation.x !== 0) {
      const f = this.fall < 0.002 ? 0 : this.fall, e = f * f * (3 - 2 * f);
      this.node.rotation.x = -Math.PI / 2 * e; this.node.position.y = 0.125 * e;
    }
    if (this.aimK > 0.001 || this.fleeK > 0.001 || this.jumpK > 0.001 || this.deadK > 0.001 || this.lean > 0.001) {
      OVERRIDE_BONES.forEach((n, i) => this.base[i].copy(this.bones[n].quaternion));
      this.dirty = true;
      this.poseArms(this.aimK, this.fleeK, this.jumpK, this.deadK);
      if (this.lean > 0.001) { this.leanBy(this.bones.Abdomen, this.lean * 0.6); this.leanBy(this.bones.Torso, this.lean * 0.5); }
    }
  }

  dispose() {
    this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.clone);
    releaseMaterial(this.mat);
  }
}
const ARM_BONES = ['UpperArmL', 'LowerArmL', 'UpperArmR', 'LowerArmR'];
const OVERRIDE_BONES = ['UpperArmL', 'LowerArmL', 'UpperArmR', 'LowerArmR', 'Abdomen', 'Torso'];
const _dirs = { u: new THREE.Vector3(), f: new THREE.Vector3() };
const _xAxis = new THREE.Vector3(1, 0, 0);
const WALK_SPEED = 1.38; // m/s: foot stance speed of the Walk clip at timeScale 1 (measured from the LowerLeg_end bones)

// ------------------------------------------------------------------ upgrade / downgrade
function upgrade(e) {
  if (e.rig || e.disposed) return false;
  const inf = infoOf(e.modelId);
  if (!inf || !assets.has(ANIM_FILE)) return false;
  let rig;
  try { rig = new Rig(e, e.modelId, inf, e.colors); } catch (err) { console.warn('[rig] build failed', e.modelId, err); e.failed = true; pending.delete(e); return false; }
  const { hum } = e;
  e.rig = rig;
  const cast = !!(hum.parts.torso && hum.parts.torso.castShadow);
  rig.mesh.castShadow = cast;
  hum.group.add(rig.node);
  e.saved = { ...hum.parts };
  e.procBody = hum.parts.body; e.procBody.visible = false;
  // parts -> bones (handR keeps its identity, moved to the hand)
  const b = rig.bones;
  hum.parts.torso = b.Torso; hum.parts.head = b.Head; hum.parts.armL = b.UpperArmL; hum.parts.armR = b.UpperArmR;
  hum.parts.legL = b.UpperLegL; hum.parts.legR = b.UpperLegR; hum.parts.body = rig.node;
  e.handParent = hum.parts.handR.parent; e.handPos = hum.parts.handR.position.clone(); e.handQuat = hum.parts.handR.quaternion.clone(); e.handScale = hum.parts.handR.scale.clone();
  b.LowerArmR.add(hum.parts.handR);
  hum.parts.handR.position.copy(rig.handPos).multiplyScalar(1);
  hum.parts.handR.quaternion.copy(rig.handQ);
  hum.parts.handR.scale.setScalar(1 / rig.inf.s / modelWorldScale(rig));
  // accessories
  if (e.extras.hat && !e.hasOwnHat) {
    const hm = new THREE.Mesh(e.extras.hatGeo, e.extras.hatMat);
    const head = b.Head, wsc = HAT_SCALE / rig.inf.s / modelWorldScale(rig);
    quatIn(head, rig.holder, _q); hm.quaternion.copy(_q).invert();      // keep the cap upright in character space
    hm.scale.set(wsc, wsc * HAT_SQUASH, wsc);
    _v.set(0, HAT_Y, HAT_Z).multiplyScalar(1 / rig.inf.s / modelWorldScale(rig)).applyQuaternion(hm.quaternion);
    hm.position.copy(_v);
    hm.castShadow = cast;
    head.add(hm); rig.hat = hm;
  }
  pending.delete(e); active.add(e);
  return true;
}
const HAT_SCALE = 2.6, HAT_SQUASH = 0.9, HAT_Y = 0.2, HAT_Z = 0.0; // procedural cap geometry is ~0.28 m tall; the rigged heads are ~0.58 m
function modelWorldScale(rig) {
  // scale accumulated from the clone root down to the bone (armature nodes in the glb may carry 0.01/100 style scales)
  let s = 1; for (let n = rig.bones.LowerArmR; n && n !== rig.holder; n = n.parent) s *= n.scale.x;
  return s;
}

function downgrade(e) {
  const rig = e.rig;
  if (!rig) return;
  const { hum } = e;
  e.handParent.add(hum.parts.handR);
  hum.parts.handR.position.copy(e.handPos); hum.parts.handR.quaternion.copy(e.handQuat); hum.parts.handR.scale.copy(e.handScale);
  Object.assign(hum.parts, e.saved);
  e.procBody.visible = true;
  hum.group.remove(rig.node);
  if (rig.hat) rig.hat.removeFromParent();
  rig.dispose();
  e.rig = null; active.delete(e);
  if (!e.disposed) pending.add(e);
}

// ------------------------------------------------------------------ public: wrap a procedural humanoid
function hashStr(...vals) {
  let h = 2166136261;
  for (const v of vals) { h = Math.imul(h ^ ((v | 0) + 0x9e3779b9), 16777619); h ^= h >>> 13; }
  return Math.imul(h, 0x85ebca6b) >>> 0;
}

export function attachRig(hum, opts, extras) {
  const role = opts.role || null;
  let modelId;
  if (role === 'player') modelId = 'casual_male';
  else if (role === 'cop') modelId = 'bluesoldier_male';
  else if (role === 'gang') modelId = 'ninja_male';
  else {
    const pool = extras.isF ? CIVIL_F : CIVIL_M;
    modelId = pool[(extras.hash >>> 6) % pool.length];
  }
  const own = modelId === 'worker_male' || modelId === 'bluesoldier_male';
  const dark = (c, f) => { _c.setHex(c, THREE.SRGBColorSpace); _c.multiplyScalar(f); return _c.getHex(THREE.SRGBColorSpace); };
  const hatNum = typeof opts.hat === 'number' ? opts.hat : (opts.hat ? 0xe0463c : null);
  const colors = {
    skin: opts.skin, hair: opts.hair, shirt: opts.shirt, pants: opts.pants, eyes: 0x1a1410, belt: dark(opts.pants ?? 0x2a2f3a, 0.55),
    hat: role === 'cop' ? opts.hat : (modelId === 'worker_male' && hatNum !== null ? hatNum : undefined),
  };
  if (role === 'cop') { delete colors.hair; delete colors.skin; colors.skin = opts.skin; }
  const entry = {
    hum, group: hum.group, modelId, colors, priority: role === 'player', extras: { hatGeo: extras.hatGeo, hatMat: hatNum !== null ? extras.mat(hatNum) : null, hat: hatNum !== null },
    hasOwnHat: own, rig: null, disposed: false, twoHand: true,
  };
  const procAnimate = hum.animate;
  hum.animate = (state, t, dt, speed) => {
    if (entry.rig) entry.rig.animate(state, t, dt, speed);
    else procAnimate(state, t, dt, speed);
  };
  hum.dispose = () => {
    entry.disposed = true;
    pending.delete(entry);
    if (entry.rig) { downgrade(entry); pending.delete(entry); }
    active.delete(entry);
    rebalance();
  };
  hum.isRigged = () => !!entry.rig;
  hum.rigEntry = entry;
  if (cfg.maxRigged > 0 || entry.priority) {
    requestAssets(); hookLoads();
    pending.add(entry);
    // `group.parent` is not set yet (caller adds the group to the scene afterwards): upgrade lazily on first animate / next rebalance
    const first = hum.animate;
    hum.animate = (state, t, dt, speed) => {
      if (!entry.rig && !entry.failed && !entry.disposed && entry.group.parent) { rebalance(); }
      hum.animate = first;
      first(state, t, dt, speed);
    };
  }
  return hum;
}

export const _debug = { active, pending, cfg, matCache };
