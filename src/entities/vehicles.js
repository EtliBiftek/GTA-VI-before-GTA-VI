// Neon Coast - vehicles: arcade physics, collisions, damage/fire/explosions, ambient traffic,
// parked cars and chase AI. Contract: docs/ARCHITECTURE.md ("Vehicles").
//
// Conventions: heading h -> forward (sin h, 0, cos h); right = (-cos h, 0, sin h); local +X = LEFT side.
// world -> local: lx = dx*c - dz*s, lz = dx*s + dz*c   (c = cos h, s = sin h)
// local -> world: wx = lx*c + lz*s, wz = -lx*s + lz*c
import * as THREE from 'three';
import { clamp, rand, pick, angleDiff, headingTo, damp, wrapAngle } from '../core/utils.js';
import {
  TYPES, buildVehicleModel, lightsGeometry, wheelGeometry, wheelMaterial, bodyMaterial, charredMaterial, trimMaterial,
} from './vehicleModels.js';
import { createVehicleFx } from './vehicleFx.js';

const MAX_VEHICLES = 30;
const WHEEL_CAPACITY = 64 * 4;
const TRAFFIC_TYPES = ['sedan', 'sedan', 'sedan', 'sedan', 'taxi', 'taxi', 'pickup', 'pickup', 'van', 'van', 'sports', 'bus'];
const PARKED_TYPES = ['sedan', 'sedan', 'sedan', 'sports', 'sports', 'pickup', 'van', 'taxi'];
const EXPLOSION_RADIUS = 8;
const DAMAGE_KIND_MUL = { bullet: 0.5, explosion: 1, vehicle: 1, melee: 0.15, fall: 0.5 };

export function createVehicles(game) {
  const { scene, events } = game;
  const list = [];
  const fx = createVehicleFx(game);

  // Shared wheel instances for every vehicle (one draw call).
  const wheels = new THREE.InstancedMesh(wheelGeometry, wheelMaterial, WHEEL_CAPACITY);
  wheels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  wheels.frustumCulled = false;
  wheels.castShadow = true;
  wheels.count = 0;
  wheels.name = 'vehicleWheels';
  scene.add(wheels);

  // ---- temps (no per-frame allocation) ----
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
  const _p3 = new THREE.Vector3(), _s3 = new THREE.Vector3();
  const _w = { x: 0, z: 0, hit: false, nx: 0, nz: 0 };      // scratch for world.collideCircle
  const _cc = { x: 0, z: 0, hit: false, nx: 0, nz: 0, vehicle: null }; // default out of vehicles.collideCircle
  const _cc2 = { x: 0, z: 0, hit: false, nx: 0, nz: 0, vehicle: null };
  const ctl = { thr: 0, steer: 0, hb: false, parked: false, brakeLights: false };
  const hitCd = new WeakMap();       // victim -> game time until next damage/crime from vehicles
  let emittingOwn = false;
  let sirenClock = 0;
  let popTimer = 0;
  let nodeMap = null;
  let uidCounter = 0;

  // ------------------------------------------------------------------------------------------
  // Roads helpers
  const roads = () => game.world?.roads;
  function nodeOf(ref) {
    if (ref == null) return null;
    if (typeof ref === 'object') return ref;
    const r = roads();
    if (!r?.nodes) return null;
    if (!nodeMap) {
      nodeMap = new Map();
      for (const n of r.nodes) nodeMap.set(n.id, n);
    }
    return nodeMap.get(ref) || (r.nodes[ref]?.id === ref ? r.nodes[ref] : null);
  }
  function laneOffset() { return roads()?.laneOffset ?? 3.5; }
  function roadWidth() { return roads()?.roadWidth ?? 14; }
  /** Random next node after arriving at `node` coming from `prev` (no U-turn unless dead end). */
  function chooseNext(node, prev) {
    const links = node?.links;
    if (!links || links.length === 0) return prev;
    let n = 0;
    for (let i = 0; i < links.length; i++) if (nodeOf(links[i]) !== prev) n++;
    if (n === 0) return prev;
    let k = Math.floor(Math.random() * n);
    for (let i = 0; i < links.length; i++) {
      const L = nodeOf(links[i]);
      if (L !== prev) { if (k === 0) return L; k--; }
    }
    return prev;
  }
  /** Assign the closest lane segment (aligned with current heading) to a traffic vehicle. */
  function assignLane(v) {
    const r = roads();
    const ai = v.ai;
    ai.from = ai.to = ai.next = null;
    if (!r?.nearestNode) return false;
    const N = nodeOf(r.nearestNode(v.position.x, v.position.z));
    if (!N?.links?.length) return false;
    const px = v.position.x, pz = v.position.z, fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    let best = Infinity, bA = null, bB = null;
    for (const id of N.links) {
      const M = nodeOf(id);
      if (!M) continue;
      const dx = M.x - N.x, dz = M.z - N.z, len = Math.hypot(dx, dz) || 1;
      const ux = dx / len, uz = dz / len;
      const t = clamp((px - N.x) * ux + (pz - N.z) * uz, 0, len);
      const ex = N.x + ux * t - px, ez = N.z + uz * t - pz;
      const al = ux * fx + uz * fz;
      const score = Math.hypot(ex, ez) + (1 - Math.abs(al)) * 6;
      if (score < best) { best = score; if (al >= 0) { bA = N; bB = M; } else { bA = M; bB = N; } }
    }
    if (!bA) return false;
    ai.from = bA; ai.to = bB; ai.next = chooseNext(bB, bA);
    return true;
  }

  // ------------------------------------------------------------------------------------------
  // Vehicle construction
  function spawn(type, x, z, heading = 0, opts = {}) {
    if (list.length >= MAX_VEHICLES) evictOne();
    const T = TYPES[type] || TYPES.sedan;
    const color = opts.color ?? pick(T.colors);
    const model = buildVehicleModel(T, color);
    const mode = opts.ai || 'parked';
    const isPolice = T.id === 'police';
    let driver = opts.driver !== undefined ? opts.driver
      : mode === 'traffic' ? 'ai' : mode === 'chase' ? (isPolice ? 'cop' : 'ai') : null;
    model.group.position.set(x, 0, z);
    model.group.rotation.y = heading;
    const v = {
      kind: 'vehicle', type: T.id, stats: T, mesh: model.group, position: model.group.position, heading,
      radius: T.radius, halfW: T.halfW, halfL: T.halfL, height: T.height,
      speed: 0, vx: 0, vz: 0, angVel: 0, steer: 0, throttle: 0, braking: false,
      health: 100, alive: true, destroyed: false, onFire: false, removed: false,
      driver, isPolice, siren: isPolice && mode === 'chase', color,
      ai: {
        mode, target: opts.target || null, from: null, to: null, next: null,
        cruise: rand(10, 14), wait: 0, ignoreT: 0, panic: 0, stuckT: 0, revT: 0, revSteer: 0,
        navNode: null, navPrev: null, _prevMode: mode, los: false, losT: 0, honkT: 0, blockT: 0, laneT: 0, idleT: 0,
      },
      seatOffset: new THREE.Vector3(T.halfW * 0.42, 0.45, T.id === 'bus' ? T.halfL - 1.2 : 0.15),
      doorOffset: new THREE.Vector3(T.halfW + 0.6, 0, T.id === 'bus' ? T.halfL - 1.2 : 0.15),
      lastAttacker: null, ambient: !!opts.ambient,
      _model: model, _lightKey: -1, _spin: 0, _roll: 0, _pitch: 0, _prevVf: 0, _gripK: 1,
      _crashCd: 0, _emitS: 0, _emitF: 0, _burn: 0, _wreckT: 0, _lastDriver: driver,
      _uid: ++uidCounter, _awake: true, _exit: { x: 0, z: 0 }, _vis: true,
      getExitPoint() { return exitPoint(v); },
      takeDamage(amount, source) { damageVehicle(v, amount, source); },
      repair() {
        if (v.destroyed) return;
        v.health = 100; v.onFire = false; v._burn = 0;
      },
    };
    if (opts.from && opts.to) { v.ai.from = nodeOf(opts.from); v.ai.to = nodeOf(opts.to); v.ai.next = chooseNext(v.ai.to, v.ai.from); }
    scene.add(model.group);
    list.push(v);
    return v;
  }

  function remove(v) {
    if (!v || v.removed) return;
    const i = list.indexOf(v);
    if (i >= 0) list.splice(i, 1);
    scene.remove(v.mesh);
    v.removed = true; v.alive = false;
  }

  function playerPos() { return game.player?.position || null; }

  /** Remove the farthest ambient vehicle nobody uses (to respect the cap). */
  function evictOne() {
    const pp = playerPos();
    let best = null, bd = -1;
    for (const v of list) {
      if (!v.ambient || v.driver === 'player' || v.ai.mode === 'chase') continue;
      const d = pp ? (v.position.x - pp.x) ** 2 + (v.position.z - pp.z) ** 2 : 0;
      if (d > bd) { bd = d; best = v; }
    }
    if (best) remove(best);
  }

  // ------------------------------------------------------------------------------------------
  // Queries
  function nearest(x, z, maxDist = Infinity, filter) {
    let best = null, bd = maxDist * maxDist;
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      const dx = v.position.x - x, dz = v.position.z - z, d = dx * dx + dz * dz;
      if (d < bd && (!filter || filter(v))) { bd = d; best = v; }
    }
    return best;
  }

  /** Push a circle out of all vehicle bodies (OBB). out gets {x, z, hit, nx, nz, vehicle}. */
  function collideCircle(x, z, r, out, ignore) {
    out = out || _cc;
    out.hit = false; out.vehicle = null; out.nx = 0; out.nz = 0;
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (v === ignore) continue;
      const dx = x - v.position.x, dz = z - v.position.z;
      const rr = v.radius + r;
      if (dx * dx + dz * dz > rr * rr) continue;
      const c = Math.cos(v.heading), s = Math.sin(v.heading);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      const hw = v.halfW, hl = v.halfL;
      const qx = clamp(lx, -hw, hw), qz = clamp(lz, -hl, hl);
      const ex = lx - qx, ez = lz - qz, d2 = ex * ex + ez * ez;
      if (d2 >= r * r) continue;
      let nlx, nlz, pen;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        nlx = ex / d; nlz = ez / d; pen = r - d;
      } else {
        const px = hw - Math.abs(lx), pz = hl - Math.abs(lz);
        if (px < pz) { nlx = lx >= 0 ? 1 : -1; nlz = 0; pen = px + r; } else { nlx = 0; nlz = lz >= 0 ? 1 : -1; pen = pz + r; }
      }
      const nx = nlx * c + nlz * s, nz = -nlx * s + nlz * c;
      x += nx * pen; z += nz * pen;
      out.hit = true; out.vehicle = v; out.nx = nx; out.nz = nz;
    }
    out.x = x; out.z = z;
    return out;
  }

  /** Ray vs oriented boxes. Vehicles whose box contains the origin are ignored (shooting from inside). */
  function raycast(ox, oy, oz, dx, dy, dz, max = 1000, ignore = null, out = null) {
    let best = null, bestT = max;
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (v === ignore) continue;
      const cx = v.position.x - ox, cy = v.height * 0.5 - oy, cz = v.position.z - oz;
      const t0 = cx * dx + cy * dy + cz * dz;
      const br = v.radius + 1;
      if (t0 < -br || t0 > bestT + br) continue;
      const perp2 = cx * cx + cy * cy + cz * cz - t0 * t0;
      if (perp2 > br * br) continue;
      const c = Math.cos(v.heading), s = Math.sin(v.heading);
      const rx = -cx, rz = -cz; // origin relative to vehicle
      const lox = rx * c - rz * s, loz = rx * s + rz * c, loy = oy;
      const ldx = dx * c - dz * s, ldz = dx * s + dz * c, ldy = dy;
      if (Math.abs(lox) <= v.halfW && Math.abs(loz) <= v.halfL && loy >= 0 && loy <= v.height) continue;
      let tmin = 0, tmax = bestT;
      // X slab
      if (Math.abs(ldx) < 1e-9) { if (lox < -v.halfW || lox > v.halfW) continue; } else {
        let a = (-v.halfW - lox) / ldx, b = (v.halfW - lox) / ldx;
        if (a > b) { const t = a; a = b; b = t; }
        if (a > tmin) tmin = a; if (b < tmax) tmax = b; if (tmin > tmax) continue;
      }
      if (Math.abs(ldy) < 1e-9) { if (loy < 0 || loy > v.height) continue; } else {
        let a = (0 - loy) / ldy, b = (v.height - loy) / ldy;
        if (a > b) { const t = a; a = b; b = t; }
        if (a > tmin) tmin = a; if (b < tmax) tmax = b; if (tmin > tmax) continue;
      }
      if (Math.abs(ldz) < 1e-9) { if (loz < -v.halfL || loz > v.halfL) continue; } else {
        let a = (-v.halfL - loz) / ldz, b = (v.halfL - loz) / ldz;
        if (a > b) { const t = a; a = b; b = t; }
        if (a > tmin) tmin = a; if (b < tmax) tmax = b; if (tmin > tmax) continue;
      }
      if (tmin < bestT) { bestT = tmin; best = v; }
    }
    if (!best) return null;
    out = out || {};
    out.dist = bestT; out.vehicle = best;
    out.x = ox + dx * bestT; out.y = oy + dy * bestT; out.z = oz + dz * bestT;
    return out;
  }

  function spotFree(x, z, r, self) {
    const w = game.world;
    if (w?.collideCircle) { const o = w.collideCircle(x, z, r, _w); if (o?.hit) return false; }
    collideCircle(x, z, r, _cc2, self);
    return !_cc2.hit;
  }

  function exitPoint(v) {
    const c = Math.cos(v.heading), s = Math.sin(v.heading);
    const px = v.position.x, pz = v.position.z, out = v._exit;
    const lz0 = v.doorOffset.z;
    // left (driver) door, right door, behind, front
    for (let k = 0; k < 4; k++) {
      let lx, lz;
      if (k === 0) { lx = v.halfW + 0.85; lz = lz0; } else if (k === 1) { lx = -(v.halfW + 0.85); lz = lz0; } else if (k === 2) { lx = 0; lz = -(v.halfL + 1); } else { lx = 0; lz = v.halfL + 1; }
      out.x = px + lx * c + lz * s; out.z = pz - lx * s + lz * c;
      if (spotFree(out.x, out.z, 0.45, v)) return out;
    }
    out.x = px + (v.halfW + 0.85) * c + lz0 * s; out.z = pz - (v.halfW + 0.85) * s + lz0 * c;
    return out;
  }

  // ------------------------------------------------------------------------------------------
  // Damage / explosions
  function driverEntity(v) { return v.driver === 'player' ? game.player : v; }
  function isPlayerEntity(e) { return e && (e === game.player || e.kind === 'player' || (e.kind === 'vehicle' && e.driver === 'player')); }

  function damageVehicle(v, amount, source) {
    if (v.destroyed || v.removed || !(amount > 0)) return;
    const mul = DAMAGE_KIND_MUL[source?.kind] ?? 1;
    v.health = Math.max(0, v.health - amount * mul * v.stats.damageMul);
    if (source?.attacker) v.lastAttacker = source.attacker;
    if (v.health < 15 && !v.onFire) { v.onFire = true; v._burn = rand(4, 6); }
    if (v.health <= 0) { v.onFire = true; v._burn = Math.min(v._burn || 1, rand(0.35, 0.8)); }
    if ((v.driver === 'ai') && v.ai.mode === 'traffic' && isPlayerEntity(source?.attacker)) v.ai.panic = rand(6, 10);
  }

  function explode(v) {
    if (v.destroyed) return;
    const pl = game.player;
    const attacker = v.lastAttacker || (v.driver === 'player' ? pl : null);
    const wasPlayer = v.driver === 'player';
    v.destroyed = true; v.alive = false; v.health = 0; v.onFire = false; v.siren = false;
    v._wreckT = 30; v._burn = 6;
    v.vx *= 0.3; v.vz *= 0.3; v.angVel += rand(-1.5, 1.5);
    v._model.bodyMesh.material = charredMaterial;
    v._model.trimMesh.material = charredMaterial;
    v._model.lightsMesh.geometry = lightsGeometry(v.stats, false, false, 0, true);
    v._lightKey = 99;
    if (v.driver === 'ai' || v.driver === 'cop') { v.driver = null; v._lastDriver = null; }
    if (v.ai.mode !== 'none' || v.driver !== 'player') v.ai.mode = 'none';
    const x = v.position.x, z = v.position.z, y = 0.8;
    // Explosion FX + ped / on-foot player damage are done by weapons.js for every 'explosion' event.
    applyBlast(x, z, EXPLOSION_RADIUS, attacker, v, true);
    // player inside
    if (wasPlayer && pl && pl.alive !== false) {
      pl.takeDamage?.(90, { kind: 'explosion', attacker });
      if (pl.alive !== false && pl.vehicle === v) { try { pl.exitVehicle?.(); } catch (e) { console.error(e); } }
    }
    emittingOwn = true;
    try {
      events.emit('vehicle:destroyed', { vehicle: v });
      events.emit('explosion', { x, y, z, radius: EXPLOSION_RADIUS, attacker, vehicle: v });
    } finally { emittingOwn = false; }
  }

  /** Damage + impulse around a blast. full=true also hurts peds/player (our own explosions). */
  function applyBlast(x, z, R, attacker, self, full) {
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o === self) continue;
      const dx = o.position.x - x, dz = o.position.z - z, d = Math.hypot(dx, dz);
      const reach = R + o.radius * 0.5;
      if (d >= reach) continue;
      const f = 1 - d / reach;
      if (!o.destroyed) damageVehicle(o, 25 + 95 * f, { kind: 'explosion', attacker });
      const inv = d > 0.01 ? 1 / d : 0;
      o.vx += dx * inv * 9 * f; o.vz += dz * inv * 9 * f;
      o.angVel += rand(-1.5, 1.5) * f;
      o._awake = true;
    }
    if (!full) return;
    const pl = game.player;
    if (pl && pl.alive !== false && pl.position && !(self && pl.vehicle === self && self.driver === 'player')) {
      const d = Math.hypot(pl.position.x - x, pl.position.z - z);
      if (d < R) {
        const f = 1 - d / R;
        // on foot is handled by weapons.js; protect against blasts hitting the player's car
        if (pl.inVehicle || pl.vehicle) pl.takeDamage?.(35 * f, { kind: 'explosion', attacker });
      }
    }
  }

  events.on('explosion', (e) => {
    if (emittingOwn || !e || !Number.isFinite(e.x) || !Number.isFinite(e.z)) return;
    const R = e.radius || 6;
    applyBlast(e.x, e.z, R, e.attacker || null, e.vehicle || null, false);
  });

  // ------------------------------------------------------------------------------------------
  // Driver transitions (hijack / exit)
  function ejectDriver(v, prev) {
    const e = exitPoint(v);
    const c = Math.cos(v.heading), s = Math.sin(v.heading);
    const x = e.x - s * 0.8, z = e.z - c * 0.8;
    try {
      if (prev === 'cop') game.peds?.spawn?.(x, z, { type: 'cop' });
      else game.peds?.spawn?.(x, z, { flee: true });
    } catch (err) { console.error('[vehicles] eject', err); }
  }
  function onPlayerEnter(v) {
    if (!v || v.removed) return;
    const prev = v._lastDriver !== 'player' ? v._lastDriver : null;
    if (prev === 'ai' || prev === 'cop') ejectDriver(v, prev);
    v.driver = 'player'; v._lastDriver = 'player';
    v.ai.mode = 'none'; v.ai.target = null; v.ai.panic = 0;
    v.siren = false;
    v._awake = true;
  }
  function onPlayerExit(v) {
    if (!v || v.removed) return;
    if (v.driver === 'player') v.driver = null;
    v._lastDriver = v.driver;
    v.ai.mode = 'parked'; v.ai.target = null;
    v.ambient = true; // may be cleaned up when far away
  }

  // ------------------------------------------------------------------------------------------
  // Physics
  function integrate(v, dt) {
    const T = v.stats;
    const thr = ctl.thr, hb = ctl.hb, parked = ctl.parked;
    const steerIn = ctl.steer;
    const back = Math.abs(steerIn) < Math.abs(v.steer) || steerIn * v.steer < 0;
    v.steer += (steerIn - v.steer) * damp(back ? 10 : 5.5, dt);
    v.throttle = thr;
    const h = v.heading, s = Math.sin(h), c = Math.cos(h);
    let vf = v.vx * s + v.vz * c;
    let vl = -v.vx * c + v.vz * s;
    let braking = false;

    if (parked) {
      vf = toward(vf, 9 * dt); vl = toward(vl, 9 * dt);
    } else {
      if (thr > 0.05) {
        if (vf < -0.5) { vf = toward(vf, T.brake * thr * dt); braking = true; } else {
          const k = vf / T.maxSpeed;
          vf += T.accel * thr * Math.max(0, 1 - k * k) * dt;
        }
      } else if (thr < -0.05) {
        if (vf > 0.5) { vf = toward(vf, T.brake * -thr * dt); braking = true; } else {
          const k = vf / -T.reverse;
          vf += T.accel * 0.7 * thr * Math.max(0, 1 - k * k) * dt;
        }
      } else {
        vf = toward(vf, (1.2 + 0.0006 * vf * vf) * dt);
      }
      if (hb) { vf = toward(vf, 6.5 * dt); if (Math.abs(vf) > 1) braking = true; }
      // lateral grip (low with handbrake -> drift; recovers gradually)
      v._gripK = hb ? Math.max(0, v._gripK - dt * 6) : Math.min(1, v._gripK + dt * 1.4);
      let grip = 1.1 + (T.grip - 1.1) * v._gripK;
      if (Math.abs(vl) > 7) grip *= 0.7;
      const keep = Math.exp(-grip * dt);
      const lost = Math.abs(vl) * (1 - keep);
      vl *= keep;
      vf = toward(vf, lost * 0.25); // scrub
    }

    // yaw
    const avf = Math.abs(vf);
    const steerAngle = v.steer * T.steer / (1 + avf / 20);
    let yawT = -(vf * Math.tan(steerAngle)) / T.wheelBase;
    if (hb && avf > 4) {
      yawT *= 1.7; yawT = clamp(yawT, -2.6, 2.6);
    } else {
      const cap = Math.min(2.2, (T.grip * 2.2) / Math.max(avf, 1));
      yawT = clamp(yawT, -cap, cap);
    }
    if (parked) yawT = 0;
    v.angVel += (yawT - v.angVel) * damp(parked ? 4 : hb ? 5 : 11, dt);
    v.angVel = clamp(v.angVel, -4, 4);

    v.vx = vf * s - vl * c;
    v.vz = vf * c + vl * s;
    v.heading = wrapAngle(h + v.angVel * dt);
    v.position.x += v.vx * dt;
    v.position.z += v.vz * dt;

    // visual body motion
    const acc = clamp((vf - v._prevVf) / Math.max(dt, 1e-3), -30, 30);
    v._prevVf = vf;
    v._pitch += (clamp(-acc * 0.0045, -0.06, 0.06) - v._pitch) * damp(6, dt);
    v._roll += (clamp(vf * v.angVel * 0.0042, -0.075, 0.075) - v._roll) * damp(6, dt);
    v._spin = (v._spin + (vf / T.wheelR) * dt) % (Math.PI * 2);
    v.braking = braking || ctl.brakeLights;
    v.speed = vf;
  }
  function toward(x, amt) { return x > 0 ? Math.max(0, x - amt) : Math.min(0, x + amt); }

  // ------------------------------------------------------------------------------------------
  // AI
  function setCtl(thr, steer, hb, parked, brakeLights) {
    ctl.thr = thr; ctl.steer = steer; ctl.hb = hb; ctl.parked = parked; ctl.brakeLights = brakeLights;
  }
  function speedCtl(v, vd) {
    const vf = v.speed;
    if (vd < 0.3) {
      if (vf > 0.4) { ctl.thr = -1; ctl.brakeLights = true; } else { ctl.thr = 0; ctl.hb = true; ctl.brakeLights = true; }
    } else {
      ctl.thr = clamp((vd - vf) * 0.45, -1, 1);
      if (vf > vd + 1) ctl.brakeLights = true;
    }
  }

  /** Distance (gap) to the nearest obstacle in the forward probe. Sets probe.byVehicle / .byPlayer. */
  const probe = { gap: Infinity, byVehicle: false, byPlayer: false, blocker: null };
  function forwardProbe(v, len, skipVehicles) {
    probe.gap = Infinity; probe.byVehicle = false; probe.byPlayer = false; probe.blocker = null;
    const px = v.position.x, pz = v.position.z, fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    const reach = len + v.halfL;
    if (!skipVehicles) {
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        if (o === v) continue;
        const dx = o.position.x - px, dz = o.position.z - pz;
        const lim = reach + o.radius;
        if (dx > lim || dx < -lim || dz > lim || dz < -lim) continue;
        const fwd = dx * fx + dz * fz;
        if (fwd <= 0 || fwd > lim) continue;
        const lat = -dx * fz + dz * fx;
        if (Math.abs(lat) > v.halfW + o.halfW * 0.8 + 0.3) continue;
        const rcs = Math.cos(o.heading - v.heading), rc = Math.abs(rcs);
        const ext = o.halfL * rc + o.halfW * (1 - rc);
        const gap = fwd - v.halfL - ext;
        // right of way between crossing / turning AI cars (deterministic -> no mutual deadlock)
        if (rcs < 0.7 && gap > 1.5 && o.driver && o.driver !== 'player' && !o.destroyed && v._uid < o._uid) continue;
        if (gap < probe.gap) { probe.gap = gap; probe.byVehicle = true; probe.blocker = o; probe.byPlayer = o.driver === 'player'; }
      }
    }
    const peds = game.peds?.list;
    if (peds) {
      for (let i = 0; i < peds.length; i++) {
        const p = peds[i];
        if (!p || p.alive === false || !p.position) continue;
        const dx = p.position.x - px, dz = p.position.z - pz;
        if (dx > reach || dx < -reach || dz > reach || dz < -reach) continue;
        const fwd = dx * fx + dz * fz;
        if (fwd <= 0 || fwd > reach) continue;
        const lat = -dx * fz + dz * fx;
        if (Math.abs(lat) > v.halfW + 0.7) continue;
        const gap = fwd - v.halfL - 0.4;
        if (gap < probe.gap) { probe.gap = gap; probe.byVehicle = false; probe.byPlayer = false; probe.blocker = p; }
      }
    }
    const pl = game.player;
    if (pl && pl.position && pl.alive !== false && !pl.inVehicle && !pl.vehicle) {
      const dx = pl.position.x - px, dz = pl.position.z - pz;
      const fwd = dx * fx + dz * fz;
      if (fwd > 0 && fwd < reach) {
        const lat = -dx * fz + dz * fx;
        if (Math.abs(lat) < v.halfW + 0.8) {
          const gap = fwd - v.halfL - 0.45;
          if (gap < probe.gap) { probe.gap = gap; probe.byVehicle = false; probe.byPlayer = true; probe.blocker = pl; }
        }
      }
    }
    return probe.gap;
  }

  function aiTraffic(v, dt) {
    const ai = v.ai;
    setCtl(0, 0, false, false, false);
    if (!ai.from || !ai.to) {
      ai.laneT -= dt;
      if (ai.laneT > 0 || !assignLane(v)) { ai.laneT = 2; speedCtl(v, 0); return; }
    }
    const lo = laneOffset();
    const px = v.position.x, pz = v.position.z;
    let A = ai.from, B = ai.to;
    let dx = B.x - A.x, dz = B.z - A.z, len = Math.hypot(dx, dz) || 1;
    let ux = dx / len, uz = dz / len;
    let along = (px - A.x) * ux + (pz - A.z) * uz;
    if (along > len - lo - 0.5) {
      const C = ai.next || chooseNext(B, A);
      ai.from = B; ai.to = C; ai.next = chooseNext(C, B);
      A = ai.from; B = ai.to;
      dx = B.x - A.x; dz = B.z - A.z; len = Math.hypot(dx, dz) || 1;
      ux = dx / len; uz = dz / len;
      along = (px - A.x) * ux + (pz - A.z) * uz;
    }
    const rx = -uz, rz = ux; // right of lane direction
    const lat = (px - A.x) * rx + (pz - A.z) * rz;
    if (Math.abs(lat - lo) > 14 || along < -20) { // knocked far off the lane -> re-evaluate
      ai.laneT -= dt;
      if (ai.laneT <= 0) { ai.laneT = 1.5; assignLane(v); }
    }
    const vf = v.speed;
    const L = 5 + Math.max(0, vf) * 0.55;
    const ta = along + L;
    let tx, tz;
    const C = ai.next || B;
    let cx = C.x - B.x, cz = C.z - B.z, clen = Math.hypot(cx, cz);
    if (clen < 0.01) { cx = -ux; cz = -uz; clen = 1; }
    const u2x = cx / clen, u2z = cz / clen;
    if (ta <= len) { tx = A.x + ux * ta + rx * lo; tz = A.z + uz * ta + rz * lo; } else {
      const ov = Math.max(ta - len, lo);
      tx = B.x + u2x * ov + (-u2z) * lo; tz = B.z + u2z * ov + u2x * lo;
    }
    const desired = headingTo(px, pz, tx, tz);
    const diff = angleDiff(v.heading, desired);

    let vd = ai.cruise;
    if (ai.panic > 0) { ai.panic -= dt; vd = Math.min(v.stats.maxSpeed * 0.85, ai.cruise * 1.8); }
    const turnCos = ux * u2x + uz * u2z;
    const distEnd = len - along;
    if (turnCos < 0.7 && distEnd < 28) vd = Math.min(vd, (turnCos < -0.5 ? 3.5 : 5.5) + Math.max(0, distEnd - 4) * 0.4);
    if (Math.abs(diff) > 0.6) vd = Math.min(vd, 6);

    if (ai.ignoreT > 0) ai.ignoreT -= dt;
    const gap = forwardProbe(v, 6 + Math.max(0, vf) * 1.15, ai.ignoreT > 0 || ai.panic > 0);
    if (gap < Infinity) {
      const lim = Math.max(0, gap - 2.2) * 0.9;
      if (lim < vd) {
        vd = lim;
        if (vd < 0.5) {
          ai.wait += dt;
          if (probe.byVehicle && ai.wait > 5 && !probe.byPlayer) { ai.ignoreT = 2.5; ai.wait = 0; }
          if (probe.byPlayer) {
            ai.blockT += dt; ai.honkT -= dt;
            if (ai.blockT > 2 && ai.honkT <= 0) { ai.honkT = rand(3, 6); events.emit('vehicle:horn', { vehicle: v }); }
          }
        }
      }
    }
    if (vd >= 0.5) { ai.wait = Math.max(0, ai.wait - dt); ai.blockT = 0; }

    // unstick (e.g. pushed against a wall)
    if (ai.revT > 0) {
      ai.revT -= dt;
      setCtl(-0.7, ai.revSteer, false, false, false);
      return;
    }
    if (vd > 2 && Math.abs(vf) < 0.8) {
      ai.stuckT += dt;
      if (ai.stuckT > 3) { ai.stuckT = 0; ai.revT = 1.5; ai.revSteer = diff > 0 ? 1 : -1; }
    } else ai.stuckT = Math.max(0, ai.stuckT - dt);

    ctl.steer = clamp(-diff * 2.4, -1, 1);
    speedCtl(v, vd);
  }

  function losClear(x0, z0, x1, z1, d) {
    const w = game.world;
    if (!w?.raycast || d < 0.5) return true;
    const h = w.raycast(x0, 1.2, z0, (x1 - x0) / d, 0, (z1 - z0) / d, d);
    return !h || h.dist >= d - 1.5;
  }

  function aiChase(v, dt) {
    const ai = v.ai, t = ai.target;
    setCtl(0, 0, false, false, false);
    if (!t || t.alive === false || t.removed || !t.position) { speedCtl(v, 0); return; }
    let tv = null;
    if (t.kind === 'vehicle') tv = t;
    else if (t.inVehicle && t.vehicle) tv = t.vehicle;
    const tp = tv ? tv.position : t.position;
    const px = v.position.x, pz = v.position.z;
    const dx = tp.x - px, dz = tp.z - pz, d = Math.hypot(dx, dz);
    const onFoot = !tv;
    const vf = v.speed;

    ai.losT -= dt;
    if (ai.losT <= 0) { ai.losT = 0.3 + Math.random() * 0.15; ai.los = d < 28 || (d < 200 && losClear(px, pz, tp.x, tp.z, d)); }

    let ax = tp.x, az = tp.z;
    const r = roads();
    if (ai.los || !r?.nearestNode) {
      ai.navNode = null;
      if (tv) { const lead = Math.min(d / 25, 1.2); ax += tv.vx * lead; az += tv.vz * lead; }
    } else {
      if (ai.navNode && (ai.navNode.x - px) ** 2 + (ai.navNode.z - pz) ** 2 > 250 * 250) ai.navNode = null;
      if (!ai.navNode) { ai.navNode = nodeOf(r.nearestNode(px, pz)); ai.navPrev = null; }
      const N = ai.navNode;
      if (N && (N.x - px) ** 2 + (N.z - pz) ** 2 < 12 * 12) {
        let best = null, bd = Infinity;
        for (const id of N.links || []) {
          const M = nodeOf(id);
          if (!M || (M === ai.navPrev && N.links.length > 1)) continue;
          const dd = (M.x - tp.x) ** 2 + (M.z - tp.z) ** 2;
          if (dd < bd) { bd = dd; best = M; }
        }
        if (best) { ai.navPrev = N; ai.navNode = best; }
      }
      if (ai.navNode) { ax = ai.navNode.x; az = ai.navNode.z; }
    }
    let desired = headingTo(px, pz, ax, az);

    // obstacle avoidance probes against static world
    const w = game.world;
    if (w?.collideCircle && vf > 3) {
      const L = 5 + vf * 0.45;
      if (probeHit(w, px, pz, desired, L)) {
        if (!probeHit(w, px, pz, desired + 0.55, L)) desired += 0.55;
        else if (!probeHit(w, px, pz, desired - 0.55, L)) desired -= 0.55;
        else if (!probeHit(w, px, pz, desired + 1.1, L * 0.7)) desired += 1.1;
        else if (!probeHit(w, px, pz, desired - 1.1, L * 0.7)) desired -= 1.1;
      }
    }
    const diff = angleDiff(v.heading, desired);

    if (ai.revT > 0) {
      ai.revT -= dt;
      setCtl(-1, ai.revSteer, false, false, false);
      return;
    }

    let vd = v.stats.maxSpeed * 0.9;
    if (onFoot) vd = clamp((d - 8) * 0.8, 0, vd);
    else if (d < 15 && Math.abs(diff) < 0.5) vd = Math.max(vd, (tv.speed || 0) + 8); // ram
    if (Math.abs(diff) > 0.9 && vf > 12) vd = Math.min(vd, 9);
    if (Math.abs(diff) > 2.1 && d < 22 && Math.abs(vf) < 5 && !onFoot) { ai.revT = 1.1; ai.revSteer = diff > 0 ? 1 : -1; }

    if (vd > 2 && Math.abs(vf) < 1) {
      ai.stuckT += dt;
      if (ai.stuckT > 1.5) { ai.stuckT = 0; ai.revT = 1.5; ai.revSteer = diff > 0 ? 1 : -1; }
    } else ai.stuckT = Math.max(0, ai.stuckT - dt * 2);

    ctl.steer = clamp(-diff * 2.6, -1, 1);
    speedCtl(v, vd);
  }
  function probeHit(w, px, pz, h, L) {
    const o = w.collideCircle(px + Math.sin(h) * L, pz + Math.cos(h) * L, 1.3, _w);
    return !!o?.hit;
  }

  // ------------------------------------------------------------------------------------------
  // Collisions
  function collideStatic(v) {
    const w = game.world;
    if (!w?.collideCircle) return;
    const T = v.stats, r = T.halfW;
    let ax = 0, az = 0, hit = false;
    for (let k = 0; k < T.circles.length; k++) {
      const s = Math.sin(v.heading), c = Math.cos(v.heading);
      const off = T.circles[k];
      const cx = v.position.x + s * off, cz = v.position.z + c * off;
      const o = w.collideCircle(cx, cz, r, _w);
      if (!o || !o.hit) continue;
      const dx = o.x - cx, dz = o.z - cz;
      if (!Number.isFinite(dx) || !Number.isFinite(dz)) continue;
      v.position.x += dx; v.position.z += dz;
      const l = Math.hypot(dx, dz);
      if (l > 1e-6) { ax += dx; az += dz; } else if (o.nx || o.nz) { ax += o.nx * 0.01; az += o.nz * 0.01; }
      hit = true;
    }
    if (!hit) return;
    const l = Math.hypot(ax, az);
    if (l < 1e-6) return;
    const nx = ax / l, nz = az / l;
    const vn = v.vx * nx + v.vz * nz;
    if (vn < 0) {
      v.vx -= 1.3 * vn * nx; v.vz -= 1.3 * vn * nz;
      // tangential scrub
      const tx = -nz, tz = nx, vt = v.vx * tx + v.vz * tz;
      v.vx -= vt * tx * 0.12; v.vz -= vt * tz * 0.12;
      v.angVel *= 0.6;
      onImpact(v, -vn, null);
    }
  }

  function onImpact(v, impact, other) {
    if (impact > 5) damageVehicle(v, (impact - 5) * 2, { kind: 'vehicle', attacker: other ? driverEntity(other) : null });
    if (impact >= 4 && v._crashCd <= 0) {
      v._crashCd = 0.3;
      events.emit('vehicle:crash', { vehicle: v, impact, other: other || null });
    }
  }

  function collidePair(a, b) {
    const dx = b.position.x - a.position.x, dz = b.position.z - a.position.z;
    const rr = a.radius + b.radius;
    if (dx * dx + dz * dz > rr * rr) return;
    const sa = Math.sin(a.heading), ca = Math.cos(a.heading), sb = Math.sin(b.heading), cb = Math.cos(b.heading);
    // axes: forward (s,c) and side (c,-s) of each box
    let minO = Infinity, nx = 0, nz = 0;
    for (let k = 0; k < 4; k++) {
      let axx, axz;
      if (k === 0) { axx = sa; axz = ca; } else if (k === 1) { axx = ca; axz = -sa; } else if (k === 2) { axx = sb; axz = cb; } else { axx = cb; axz = -sb; }
      const ra = a.halfL * Math.abs(sa * axx + ca * axz) + a.halfW * Math.abs(ca * axx - sa * axz);
      const rb = b.halfL * Math.abs(sb * axx + cb * axz) + b.halfW * Math.abs(cb * axx - sb * axz);
      const d = dx * axx + dz * axz;
      const o = ra + rb - Math.abs(d);
      if (o <= 0) return;
      if (o < minO) { minO = o; if (d >= 0) { nx = axx; nz = axz; } else { nx = -axx; nz = -axz; } }
    }
    const ia = a.stats.invMass * (a.driver ? 1 : 0.8), ib = b.stats.invMass * (b.driver ? 1 : 0.8);
    const sum = ia + ib;
    const corr = Math.max(0, minO - 0.01) * 0.8 / sum;
    a.position.x -= nx * corr * ia; a.position.z -= nz * corr * ia;
    b.position.x += nx * corr * ib; b.position.z += nz * corr * ib;
    a._awake = b._awake = true;
    const rvx = b.vx - a.vx, rvz = b.vz - a.vz;
    const vn = rvx * nx + rvz * nz;
    if (vn >= 0) return;
    const j = (-(1 + 0.25) * vn) / sum;
    a.vx -= nx * j * ia; a.vz -= nz * j * ia;
    b.vx += nx * j * ib; b.vz += nz * j * ib;
    // friction
    const tx = -nz, tz = nx, vt = rvx * tx + rvz * tz;
    const jt = clamp(-vt / sum, -0.3 * j, 0.3 * j);
    a.vx -= tx * jt * ia; a.vz -= tz * jt * ia;
    b.vx += tx * jt * ib; b.vz += tz * jt * ib;
    // spin from off-centre contact (contact ~ midpoint)
    const rax = dx * 0.5, raz = dz * 0.5;
    const Jx = nx * j + tx * jt, Jz = nz * j + tz * jt;
    const tauA = (raz * -Jx - rax * -Jz); // r x (-J)
    const tauB = (-raz * Jx + rax * Jz);  // (-r) x J
    a.angVel = clamp(a.angVel + tauA * a.stats.invInertia * 0.5, -4, 4);
    b.angVel = clamp(b.angVel + tauB * b.stats.invInertia * 0.5, -4, 4);

    const impact = -vn;
    onImpact(a, impact, b); onImpact(b, impact, a);
    // crimes / panic
    if (impact > 3) {
      if (a.driver === 'player') playerHitVehicle(b, impact);
      else if (b.driver === 'player') playerHitVehicle(a, impact);
    }
  }

  function playerHitVehicle(victim, impact) {
    const now = game.state.time || 0;
    if (victim.driver === 'ai' && victim.ai.mode === 'traffic' && impact > 6) victim.ai.panic = rand(5, 9);
    const until = hitCd.get(victim) || 0;
    if (now < until) return;
    hitCd.set(victim, now + 1);
    events.emit('crime', { type: victim.isPolice ? 'hitPoliceCar' : 'hitVehicle', x: victim.position.x, z: victim.position.z });
  }

  /** Vehicle vs peds / player on foot. */
  function collidePeople(v) {
    const sp = Math.hypot(v.vx, v.vz);
    if (sp < 0.8) return;
    const c = Math.cos(v.heading), s = Math.sin(v.heading);
    const peds = game.peds?.list;
    if (peds) for (let i = 0; i < peds.length; i++) {
      const p = peds[i];
      if (!p || p.alive === false || !p.position) continue;
      hitPerson(v, p, c, s, false);
    }
    const pl = game.player;
    if (pl && pl.alive !== false && pl.position && !pl.inVehicle && !pl.vehicle) hitPerson(v, pl, c, s, true);
  }
  function hitPerson(v, p, c, s, isPlayer) {
    const pr = p.radius || 0.45;
    const dx = p.position.x - v.position.x, dz = p.position.z - v.position.z;
    const rr = v.radius + pr;
    if (dx * dx + dz * dz > rr * rr) return;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    const qx = clamp(lx, -v.halfW, v.halfW), qz = clamp(lz, -v.halfL, v.halfL);
    let ex = lx - qx, ez = lz - qz;
    const d2 = ex * ex + ez * ez;
    if (d2 >= pr * pr) return;
    let pen;
    if (d2 > 1e-8) { const d = Math.sqrt(d2); ex /= d; ez /= d; pen = pr - d; } else {
      const px = v.halfW - Math.abs(lx), pz = v.halfL - Math.abs(lz);
      if (px < pz) { ex = lx >= 0 ? 1 : -1; ez = 0; pen = px + pr; } else { ex = 0; ez = lz >= 0 ? 1 : -1; pen = pz + pr; }
    }
    const nx = ex * c + ez * s, nz = -ex * s + ez * c;
    const rv = v.vx * nx + v.vz * nz; // car velocity toward the person
    const knock = rv > 2.5 ? Math.min(1.5, rv * 0.08) : 0;
    p.position.x += nx * (pen + knock); p.position.z += nz * (pen + knock);
    if (rv <= 2.5) return;
    const now = game.state.time || 0;
    if (now < (hitCd.get(p) || 0)) return;
    hitCd.set(p, now + 0.6);
    const byPlayer = v.driver === 'player';
    const dmg = isPlayer ? 0.4 * rv * rv : 0.45 * rv * rv + 4;
    const wasAlive = p.alive !== false;
    try { p.takeDamage?.(dmg, { kind: 'vehicle', attacker: byPlayer ? game.player : v }); } catch (e) { console.error(e); }
    v.vx *= 0.96; v.vz *= 0.96;
    if (byPlayer && !isPlayer && wasAlive) {
      const killed = p.alive === false;
      const type = p.isCop ? (killed ? 'killCop' : 'hitCop') : (killed ? 'killPed' : 'hitPed');
      events.emit('crime', { type, x: p.position.x, z: p.position.z });
    }
  }

  // ------------------------------------------------------------------------------------------
  // Ambient population
  function isClear(x, z, r) {
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      const rr = r + o.radius;
      if ((o.position.x - x) ** 2 + (o.position.z - z) ** 2 < rr * rr) return false;
    }
    return true;
  }
  function resolveLane(rp) {
    let A = nodeOf(rp.node), B = nodeOf(rp.next);
    if (A && B && A !== B) {
      const fx = Math.sin(rp.heading), fz = Math.cos(rp.heading);
      if ((B.x - A.x) * fx + (B.z - A.z) * fz < 0) { const t = A; A = B; B = t; }
      return [A, B];
    }
    return null;
  }
  function spawnTraffic(px, pz) {
    const w = game.world;
    if (!w?.randomRoadPoint) return null;
    const maxD = Math.min(game.q?.drawDistance ?? 300, 220);
    const rp = w.randomRoadPoint(px, pz, 90, Math.max(110, maxD));
    if (!rp || !Number.isFinite(rp.x) || !isClear(rp.x, rp.z, 6)) return null;
    const v = spawn(pick(TRAFFIC_TYPES), rp.x, rp.z, rp.heading || 0, { ai: 'traffic', ambient: true });
    const lane = resolveLane(rp);
    if (lane) { v.ai.from = lane[0]; v.ai.to = lane[1]; v.ai.next = chooseNext(lane[1], lane[0]); }
    v.speed = v.ai.cruise * 0.8;
    v.vx = Math.sin(v.heading) * v.speed; v.vz = Math.cos(v.heading) * v.speed; v._prevVf = v.speed;
    return v;
  }
  function parkAt(rp, type) {
    const T = TYPES[type] || TYPES.sedan;
    const lo = laneOffset();
    const off = Math.max(lo, Math.min(roadWidth() / 2 - T.halfW - 0.2, lo + T.halfW + 1.25));
    const h = rp.heading || 0;
    const x = rp.x + -Math.cos(h) * (off - lo), z = rp.z + Math.sin(h) * (off - lo);
    if (!isClear(x, z, T.radius + 1.5)) return null;
    const w = game.world;
    if (w?.collideCircle) { const o = w.collideCircle(x, z, T.halfW, _w); if (o?.hit) return null; }
    return spawn(type, x, z, h, { ai: 'parked', ambient: true });
  }
  function spawnParked(px, pz, minD, maxD, type) {
    const w = game.world;
    if (!w?.randomRoadPoint) return null;
    const rp = w.randomRoadPoint(px, pz, minD, maxD);
    if (!rp || !Number.isFinite(rp.x)) return null;
    return parkAt(rp, type || pick(PARKED_TYPES));
  }

  function population(px, pz) {
    const dens = game.q?.density ?? 0.8;
    const draw = game.q?.drawDistance ?? 300;
    const trafficTarget = clamp(Math.round(6 + (dens - 0.5) * 20), 4, 16);
    const parkedTarget = 3 + Math.round(dens * 3);
    const despawnR = Math.max(draw, 200) + 60;
    let nTraffic = 0, nParked = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const v = list[i];
      if (!v.ambient || v.driver === 'player') continue;
      const d2 = (v.position.x - px) ** 2 + (v.position.z - pz) ** 2;
      const far = v.ai.mode === 'parked' ? 280 : despawnR;
      const stuck = v.ai.mode === 'traffic' && v.ai.idleT > 40 && d2 > 60 * 60;
      if (d2 > far * far || stuck) { remove(v); continue; }
      if (v.destroyed) continue;
      if (v.ai.mode === 'traffic') nTraffic++;
      else if (v.ai.mode === 'parked' && !v.driver) nParked++;
    }
    for (let k = 0; k < 3 && nTraffic < trafficTarget && list.length < MAX_VEHICLES; k++) if (spawnTraffic(px, pz)) nTraffic++;
    if (nParked < parkedTarget && list.length < MAX_VEHICLES - 2) spawnParked(px, pz, 60, 170);
  }

  // ------------------------------------------------------------------------------------------
  // Visuals
  function updateVisual(v, night, barPhase, wi) {
    const m = v._model;
    v.mesh.rotation.y = v.heading;
    m.body.rotation.x = v._pitch;
    m.body.rotation.z = v._roll;
    m.body.position.y = v.destroyed ? -0.12 : 0;
    if (!v.destroyed) {
      const bar = v.isPolice && v.siren ? barPhase : 0;
      const key = (night ? 1 : 0) + (v.braking ? 2 : 0) + bar * 4;
      if (key !== v._lightKey) { v._lightKey = key; m.lightsMesh.geometry = lightsGeometry(v.stats, night, v.braking, bar); }
    }
    // wheels
    const T = v.stats;
    const c = Math.cos(v.heading), s = Math.sin(v.heading);
    const steerA = v.steer * T.steer / (1 + Math.abs(v.speed) / 20);
    for (let k = 0; k < T.wheels.length && wi < WHEEL_CAPACITY; k++) {
      const wh = T.wheels[k];
      _p3.set(v.position.x + wh.x * c + wh.z * s, T.wheelR - (v.destroyed ? 0.08 : 0), v.position.z - wh.x * s + wh.z * c);
      _e.set(v._spin, v.heading + (wh.front ? steerA : 0), 0, 'YXZ');
      _q.setFromEuler(_e);
      _s3.set(T.wheelW, T.wheelR, T.wheelR);
      _m4.compose(_p3, _q, _s3);
      wheels.setMatrixAt(wi++, _m4);
    }
    return wi;
  }

  function emitFx(v, dt) {
    const s = Math.sin(v.heading), c = Math.cos(v.heading);
    const ez = v.halfL * 0.55;
    const x = v.position.x + s * ez, z = v.position.z + c * ez, y = v.height * 0.8;
    if (v.destroyed) {
      v._emitS += dt * (v._wreckT > 15 ? 5 : 2);
      while (v._emitS >= 1) { v._emitS -= 1; fx.smoke(v.position.x, v.height, v.position.z, 0.85, 1.3); }
      if (v._burn > 0) {
        v._emitF += dt * 22;
        while (v._emitF >= 1) { v._emitF -= 1; fx.fire(v.position.x + (Math.random() - 0.5) * v.halfW, v.height * 0.7, v.position.z + (Math.random() - 0.5) * v.halfL, 1.4); }
      }
      return;
    }
    if (v.health < 40) {
      v._emitS += dt * (3 + (40 - v.health) * 0.3);
      const dark = clamp((40 - v.health) / 40, 0, 1);
      while (v._emitS >= 1) { v._emitS -= 1; fx.smoke(x, y, z, dark, 0.8 + dark * 0.6); }
    }
    if (v.onFire) {
      v._emitF += dt * 26;
      while (v._emitF >= 1) { v._emitF -= 1; fx.fire(x, y, z, 1); }
    }
  }

  // ------------------------------------------------------------------------------------------
  function update(dt) {
    const pl = game.player;
    const pp = pl?.position;
    const px = pp ? pp.x : 0, pz = pp ? pp.z : 0;
    const tod = game.state.timeOfDay ?? 12;
    const night = tod < 6 || tod > 19;
    sirenClock += dt;
    const barPhase = (Math.floor(sirenClock * 4) & 1) ? 1 : 2;
    const input = game.input;

    // 1) controls + integration
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (v.driver !== v._lastDriver) {
        if (v.driver === 'player') onPlayerEnter(v);
        else if (v._lastDriver === 'player') onPlayerExit(v);
        else v._lastDriver = v.driver;
      }
      if (v._crashCd > 0) v._crashCd -= dt;
      const ai = v.ai;
      if (ai.mode !== ai._prevMode) { // mode switched externally (police/missions): reset AI state
        ai._prevMode = ai.mode; ai.from = ai.to = ai.next = null; ai.navNode = ai.navPrev = null;
        ai.revT = 0; ai.stuckT = 0; ai.laneT = 0;
      }
      if (v.destroyed) setCtl(0, 0, false, true, false);
      else if (v.driver === 'player') {
        if (pl && pl.alive === false) setCtl(0, 0, true, false, true);
        else {
          setCtl(input?.moveY || 0, input?.moveX || 0, !!input?.handbrake, false, false);
          if (input?.pressed?.('horn')) events.emit('vehicle:horn', { vehicle: v });
        }
      } else if (v.driver && ai.mode === 'traffic') aiTraffic(v, dt);
      else if (v.driver && ai.mode === 'chase') aiChase(v, dt);
      else if (v.driver) { setCtl(0, 0, false, false, false); speedCtl(v, 0); }
      else setCtl(0, 0, false, true, false);

      // sleeping: parked & still -> skip integration
      const moving = Math.abs(v.vx) + Math.abs(v.vz) + Math.abs(v.angVel) > 0.02;
      if (ctl.parked && !moving) { v.vx = v.vz = 0; v.angVel = 0; v.speed = 0; v._awake = false; v.braking = false; }
      else { v._awake = true; integrate(v, dt); }
      if (ai.mode === 'traffic') ai.idleT = Math.abs(v.speed) < 0.5 ? ai.idleT + dt : 0;
    }

    // 2) vehicle vs vehicle
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!a._awake && !b._awake) continue;
        collidePair(a, b);
      }
    }

    // 3) static world + people + fx + state
    const draw = game.q?.drawDistance ?? 300;
    const cam = game.camera?.position;
    const cx = cam ? cam.x : px, cz = cam ? cam.z : pz;
    let wi = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const v = list[i];
      if (v._awake) collideStatic(v);
      if (!Number.isFinite(v.position.x) || !Number.isFinite(v.position.z) || !Number.isFinite(v.vx) || !Number.isFinite(v.vz)) {
        // safety net: never let NaN leak out
        if (!Number.isFinite(v.position.x) || !Number.isFinite(v.position.z)) { remove(v); continue; }
        v.vx = v.vz = 0; v.angVel = 0;
      }
      v.speed = v.vx * Math.sin(v.heading) + v.vz * Math.cos(v.heading);
      const d2p = (v.position.x - px) ** 2 + (v.position.z - pz) ** 2;
      if (d2p < 160 * 160) collidePeople(v);

      if (!v.destroyed && v.onFire) { v._burn -= dt; if (v._burn <= 0) explode(v); }
      else if (v.destroyed) {
        if (v._burn > 0) v._burn -= dt;
        v._wreckT -= dt;
        if (v._wreckT <= 0 && v.driver !== 'player') { remove(v); continue; }
      }

      const d2c = (v.position.x - cx) ** 2 + (v.position.z - cz) ** 2;
      const vis = d2c < draw * draw;
      if (vis !== v._vis) { v._vis = vis; v.mesh.visible = vis; }
      if (vis) {
        wi = updateVisual(v, night, barPhase, wi);
        if (d2c < 160 * 160 && (v.health < 40 || v.destroyed || v.onFire)) emitFx(v, dt);
      }
    }
    wheels.count = wi;
    wheels.instanceMatrix.needsUpdate = true;

    // 4) ambient population
    popTimer -= dt;
    if (popTimer <= 0 && pp) { popTimer = 0.5; population(px, pz); }

    fx.update(dt);
  }

  function init() {
    const w = game.world;
    const sp = w?.spawnPoint;
    if (!sp) return;
    let car = null;
    for (let k = 0; k < 12 && !car; k++) {
      const rp = w.randomRoadPoint?.(sp.x, sp.z, 0, 18 + k * 6);
      if (rp && Number.isFinite(rp.x)) car = parkAt(rp, k < 6 ? 'sports' : 'sedan');
    }
    if (!car) {
      // fallback: next to the spawn point, facing the same way
      const h = sp.heading || 0;
      for (let k = 0; k < 8 && !car; k++) {
        const a = h + Math.PI / 2 + k * (Math.PI / 4);
        const x = sp.x + Math.sin(a) * 5, z = sp.z + Math.cos(a) * 5;
        if (spotFree(x, z, 2.5, null)) car = spawn('sports', x, z, h, { ai: 'parked' });
      }
      if (!car) car = spawn('sports', sp.x + 4, sp.z, sp.heading || 0, { ai: 'parked' });
    }
    if (car) car.ambient = false; // the starter car stays until the player uses it
    // a few more parked cars around the start
    for (let k = 0; k < 3; k++) spawnParked(sp.x, sp.z, 15, 80);
  }

  return {
    list, types: TYPES,
    spawn, remove, nearest, collideCircle, raycast, update, init,
    onPlayerEnter, onPlayerExit,
    /** Body colour material helper (e.g. a garage respray mission). */
    paint(v, color) { if (v && !v.destroyed) { v.color = color; v._model.bodyMesh.material = bodyMaterial(color); } },
    get playerVehicle() { for (const v of list) if (v.driver === 'player') return v; return null; },
    fx,
    _trimMaterial: trimMaterial,
  };
}
