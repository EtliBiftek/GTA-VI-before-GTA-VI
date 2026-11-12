// Player: third-person controller, orbit camera, vehicle enter/exit, health/armor, death & busted flows.
// Contract: docs/ARCHITECTURE.md ("Player"). aimPitch > 0 means the camera looks DOWN (camera above the player).
import * as THREE from 'three';
import { clamp, lerp, damp, wrapAngle, angleDiff, turnToward } from '../core/utils.js';
import { createHumanoid } from './humanoid.js';

const WALK = 2.2, JOG = 4.5, SPRINT = 7.5;
const CAM_FOOT = [5, 7.5, 12];
const CAM_VEH = [8.5, 11.5, 16];
const CAM_PITCH_BIAS = [0, 0, 0.55];
const BASE_FOV = 65, AIM_FOV = 48;
const PITCH_MIN = -0.4, PITCH_MAX = 1.3;

export function createPlayer(game) {
  const { scene, camera, events, input } = game;

  const hum = createHumanoid({
    shirt: 0x12b5a6, pants: 0xf1f1ea, skin: 0xd6a074, hair: 0x2a1a12, hat: 0xff6a5c, shoes: 0xf5f5f5, glasses: true,
  });
  const mesh = hum.group;
  scene.add(mesh);

  const player = {
    kind: 'player', mesh, position: mesh.position, heading: 0, radius: 0.45,
    health: 100, armor: 0, alive: true, busted: false,
    vehicle: null, inVehicle: false, velocity: new THREE.Vector3(),
    aimYaw: 0, aimPitch: 0.25,
    humanoid: hum, parts: hum.parts, camMode: 0,
    getAimRay, getMuzzle, enterVehicle, exitVehicle, teleport, heal, addArmor, takeDamage, update, init,
  };

  // ---- temps (no per-frame allocation) ----
  const _c = { x: 0, z: 0, hit: false, nx: 0, nz: 0 };
  const _c2 = { x: 0, z: 0, hit: false };
  const _ray = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 1 };
  const _muz = { x: 0, y: 0, z: 0 };
  const _look = new THREE.Vector3();
  const camDir = new THREE.Vector3(0, 0, 1);

  let vy = 0, grounded = true, jumpPrev = false;
  let sinceDamage = 99, invuln = 0;
  let deadTimer = 0, deathKind = null; // 'died' | 'busted'
  let lookIdle = 0, camSnap = true;
  let camDist = 5, camFov = BASE_FOV, camCol = 5, shoulder = 0, camPitchBias = 0;
  let lastPrompt = null, anim = 'idle', animT = 0;

  function applyShadows() {
    const s = !!game.q?.shadows;
    mesh.traverse((o) => { if (o.isMesh) o.castShadow = s; });
  }

  function placeAt(x, z, heading) {
    mesh.position.set(x, 0, z);
    if (heading !== undefined) { player.heading = heading; mesh.rotation.y = heading; }
    resolveStatic();
  }

  function resolveStatic() {
    const p = mesh.position;
    const r = player.radius;
    let o = game.world?.collideCircle?.(p.x, p.z, r, _c);
    if (o && typeof o.x === 'number') { p.x = o.x; p.z = o.z; }
    o = game.vehicles?.collideCircle?.(p.x, p.z, r, _c2);
    if (o && typeof o.x === 'number') { p.x = o.x; p.z = o.z; }
  }

  function teleport(x, z, heading) {
    exitSilently();
    placeAt(x, z, heading);
    player.velocity.set(0, 0, 0);
    vy = 0; grounded = true;
    if (heading !== undefined) player.aimYaw = heading;
    camSnap = true;
  }

  function init() {
    const sp = game.world?.spawnPoint;
    if (sp) teleport(sp.x, sp.z, sp.heading || 0);
    applyShadows();
    events.on('settings:changed', applyShadows);
    events.on('game:started', () => { camSnap = true; sinceDamage = 99; });
    events.on('player:busted', () => bust());
  }

  // ------------------------------------------------------------------ health
  function heal(n) { player.health = Math.min(100, player.health + n); }
  function addArmor(n) { player.armor = Math.min(100, player.armor + n); }

  function takeDamage(amount, source) {
    if (!player.alive || invuln > 0 || !(amount > 0)) return;
    const kind = source && source.kind;
    let a = amount;
    if (player.inVehicle && kind === 'bullet') a *= 0.25;
    if (kind !== 'fall' && kind !== 'vehicle' && player.armor > 0) {
      const ab = Math.min(player.armor, a);
      player.armor -= ab; a -= ab;
    }
    player.health -= a;
    sinceDamage = 0;
    events.emit('player:damaged', { amount, source });
    if (player.health <= 0) { player.health = 0; die(); }
  }

  function startRespawnFlow(kind) {
    if (player.inVehicle) exitSilently();
    player.alive = false;
    player.busted = kind === 'busted';
    deathKind = kind;
    deadTimer = 4;
    player.velocity.set(0, 0, 0);
    vy = 0;
  }

  function die() {
    startRespawnFlow('died');
    events.emit('player:died');
    game.hud?.showBigText?.('MAHVOLDUN', '', 4000, '#ff3b4e');
  }

  function bust() {
    if (!player.alive) return;
    startRespawnFlow('busted');
    game.weapons?.reset?.();
    game.hud?.showBigText?.('TUTUKLANDIN', '', 4000, '#4aa3ff');
  }

  function respawn() {
    const w = game.world;
    const lm = w?.getLandmark?.(deathKind === 'busted' ? 'police' : 'hospital') || w?.spawnPoint;
    if (deathKind === 'died') {
      const loss = Math.round((game.state?.money || 0) * 0.1);
      if (loss > 0) game.addMoney?.(-loss);
    }
    game.police?.clear?.();
    player.alive = true; player.busted = false;
    player.health = 100; player.armor = 0;
    sinceDamage = 99; invuln = 2;
    if (lm) teleport(lm.x, lm.z, lm.heading ?? player.heading);
    else teleport(mesh.position.x, mesh.position.z);
    events.emit('player:respawned');
  }

  // ---------------------------------------------------------------- vehicles
  function enterVehicle(v) {
    if (!v || player.inVehicle || !player.alive) return;
    if (v.driver === 'ai' || v.driver === 'cop') events.emit('crime', { type: 'carjack', x: v.position.x, z: v.position.z });
    v.driver = 'player';
    game.vehicles?.onPlayerEnter?.(v);
    player.vehicle = v; player.inVehicle = true;
    mesh.visible = false;
    lookIdle = 2;
    player.velocity.set(0, 0, 0);
    vy = 0; grounded = true;
    events.emit('player:enteredVehicle', { vehicle: v });
  }

  function exitSilently() { // leave a vehicle without events/placement beyond the exit point
    if (player.inVehicle) exitVehicle();
  }

  function exitVehicle() {
    const v = player.vehicle;
    if (!v) return;
    let ex = null;
    if (v.getExitPoint) ex = v.getExitPoint();
    let x, z;
    if (ex && typeof ex.x === 'number') { x = ex.x; z = ex.z; } else {
      const h = v.heading || 0, off = (v.halfW || 1) + 1.2;
      x = v.position.x + Math.cos(h) * off; z = v.position.z - Math.sin(h) * off; // left of the car
    }
    if (v.driver === 'player') v.driver = null;
    player.vehicle = null; player.inVehicle = false;
    player.heading = v.heading || player.heading;
    mesh.rotation.y = player.heading;
    mesh.visible = true;
    placeAt(x, z);
    player.velocity.set(0, 0, 0);
    game.vehicles?.onPlayerExit?.(v);
    events.emit('player:exitedVehicle', { vehicle: v });
  }

  function setPrompt(text) {
    if (text === lastPrompt) return;
    if (text === null && lastPrompt === null) return;
    lastPrompt = text;
    game.hud?.setPrompt?.(text);
  }
  const vFilter = (v) => v.alive !== false && !v.destroyed;
  function touchUi() { return game.isMobile || input.usingTouch; }

  // ------------------------------------------------------------------ aiming
  function getAimRay(out) {
    out = out || _ray;
    const p = mesh.position, cp = camera.position;
    const d = camDir;
    // distance from camera to the player's chest projected on the view direction
    const t = Math.max(0, (p.x - cp.x) * d.x + (p.y + 1.4 - cp.y) * d.y + (p.z - cp.z) * d.z);
    out.ox = cp.x + d.x * t; out.oy = cp.y + d.y * t; out.oz = cp.z + d.z * t;
    out.dx = d.x; out.dy = d.y; out.dz = d.z;
    return out;
  }

  function getMuzzle(out) {
    out = out || _muz;
    const p = mesh.position;
    if (player.inVehicle && player.vehicle) {
      const v = player.vehicle.position;
      out.x = v.x; out.y = v.y + 1.2; out.z = v.z;
      return out;
    }
    const h = player.heading, s = Math.sin(h), c = Math.cos(h);
    out.x = p.x + s * 0.55 - c * 0.25;
    out.y = p.y + 1.4;
    out.z = p.z + c * 0.55 + s * 0.25;
    return out;
  }

  // ------------------------------------------------------------------ update
  function update(dt) {
    sinceDamage += dt;
    if (invuln > 0) invuln -= dt;
    animT += dt;

    if (player.alive) {
      if (player.health < 50 && sinceDamage > 8) player.health = Math.min(50, player.health + 4 * dt);
      handleLook(dt);
      if (input.pressed('camera')) player.camMode = (player.camMode + 1) % 3;
      if (player.inVehicle) updateInVehicle(dt); else updateOnFoot(dt);
    } else {
      updateDead(dt);
    }
    updateCamera(dt);
  }

  function handleLook(dt) {
    const dx = input.lookDX, dy = input.lookDY;
    const sens = (input.aim && !player.inVehicle) ? 0.0019 : 0.0025;
    if (dx || dy) {
      player.aimYaw = wrapAngle(player.aimYaw - dx * sens);
      player.aimPitch = clamp(player.aimPitch + dy * sens, PITCH_MIN, PITCH_MAX);
      lookIdle = 0;
    } else lookIdle += dt;
  }

  function updateOnFoot(dt) {
    const p = mesh.position;
    const vel = player.velocity;
    const aimHeld = input.aim, fireHeld = input.fire;
    const wp = game.weapons?.current;
    const wid = wp && wp.id;
    const armed = !!wid && wid !== 'fist' && wid !== 'bat';
    const facingCam = aimHeld || fireHeld;

    // interact: enter nearest vehicle
    const near = game.vehicles?.nearest?.(p.x, p.z, 4.5, vFilter) || null;
    if (input.pressed('interact') && near) { enterVehicle(near); return; }
    setPrompt(near ? (touchUi() ? 'Araca bin' : 'F — Araca bin') : null);

    // desired velocity (camera-relative)
    const mx = input.moveX, my = input.moveY;
    const mag = Math.min(1, Math.hypot(mx, my));
    let tx = 0, tz = 0, target = 0;
    if (mag > 0.08) {
      const sy = Math.sin(player.aimYaw), cy = Math.cos(player.aimYaw);
      // forward = (sy, cy), right = (-cy, sy)
      let dx = sy * my - cy * mx, dz = cy * my + sy * mx;
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      if (mag < 0.5) target = WALK * Math.max(0.5, mag / 0.5);
      else if (mag < 0.75) target = lerp(WALK, JOG, (mag - 0.5) / 0.25);
      else target = JOG;
      if (input.sprint && mag > 0.3 && !facingCam) target = SPRINT;
      if (facingCam) target = Math.min(target, 3.6);
      tx = dx * target; tz = dz * target;
    }
    const k = damp(target > 0 ? 11 : 14, dt);
    vel.x += (tx - vel.x) * k;
    vel.z += (tz - vel.z) * k;
    const spd = Math.hypot(vel.x, vel.z);

    // facing
    if (facingCam) {
      player.heading = turnToward(player.heading, player.aimYaw, 16 * dt);
    } else if (spd > 0.4) {
      player.heading = turnToward(player.heading, Math.atan2(vel.x, vel.z), 13 * dt);
    }
    player.heading = wrapAngle(player.heading);
    mesh.rotation.y = player.heading;

    // jump
    if (input.jump && !jumpPrev && grounded) { vy = 6.6; grounded = false; }
    jumpPrev = input.jump;
    if (!grounded) {
      vy -= 22 * dt;
      p.y += vy * dt;
      if (p.y <= 0) { p.y = 0; vy = 0; grounded = true; }
    }

    // move + collide
    p.x += vel.x * dt;
    p.z += vel.z * dt;
    const ox = p.x, oz = p.z;
    resolveStatic();
    // kill velocity into obstacles so we don't keep pressing against walls
    if (p.x !== ox || p.z !== oz) {
      const px = p.x - ox, pz = p.z - oz, pl = Math.hypot(px, pz);
      if (pl > 1e-5) {
        const nx = px / pl, nz = pz / pl, vn = vel.x * nx + vel.z * nz;
        if (vn < 0) { vel.x -= vn * nx; vel.z -= vn * nz; }
      }
    }

    // animation
    const sp2 = Math.hypot(vel.x, vel.z);
    if (!grounded) anim = 'jump';
    else if (armed && facingCam) anim = 'aim';
    else if (!armed && fireHeld) anim = 'punch';
    else if (sp2 > 5.2) anim = 'run';
    else if (sp2 > 0.4) anim = 'walk';
    else anim = 'idle';
    hum.animate(anim, animT, dt, sp2);
  }

  function updateInVehicle(dt) {
    const v = player.vehicle;
    if (!v || v.destroyed || v.alive === false) {
      const had = v;
      exitVehicle();
      if (had) takeDamage(70, { kind: 'explosion' });
      return;
    }
    const p = mesh.position;
    p.set(v.position.x, v.position.y || 0, v.position.z);
    player.heading = v.heading || 0;
    mesh.rotation.y = player.heading;
    player.velocity.set(v.vx || 0, 0, v.vz || 0);

    if (input.pressed('interact') && Math.abs(v.speed || 0) < 6) { exitVehicle(); return; }
    setPrompt(Math.abs(v.speed || 0) < 6 ? (touchUi() ? 'Araçtan in' : 'F — Araçtan in') : null);

    // auto recentre behind the vehicle
    if (lookIdle > 1.5 && Math.abs(v.speed || 0) > 1.5) {
      const k = damp(2.4, dt);
      player.aimYaw = wrapAngle(player.aimYaw + angleDiff(player.aimYaw, player.heading) * k);
      player.aimPitch += (0.22 + CAM_PITCH_BIAS[player.camMode] * 0.5 - player.aimPitch) * damp(2, dt);
    }
    hum.animate('sit', animT, dt, 0);
  }

  function updateDead(dt) {
    setPrompt(null);
    player.aimYaw = wrapAngle(player.aimYaw + dt * 0.35);
    player.aimPitch += (0.6 - player.aimPitch) * damp(1.2, dt);
    player.velocity.set(0, 0, 0);
    hum.animate(player.busted ? 'idle' : 'dead', animT, dt, 0);
    deadTimer -= dt;
    if (deadTimer <= 0) respawn();
  }

  // ------------------------------------------------------------------ camera
  function updateCamera(dt) {
    const veh = player.inVehicle ? player.vehicle : null;
    const aiming = !veh && player.alive && input.aim;
    const p = mesh.position;
    const mode = player.camMode;

    let dist, fov = BASE_FOV, sh = 0;
    if (veh) {
      const sp = Math.abs(veh.speed || 0);
      dist = CAM_VEH[mode] * (1 + 0.012 * Math.min(sp, 40)) * 0.9 + (veh.length ? 0 : 0);
      fov = BASE_FOV + clamp((sp - 18) / 30, 0, 1) * 12;
    } else if (!player.alive) {
      dist = 7;
    } else if (aiming) {
      dist = 2.4; fov = AIM_FOV; sh = 0.65;
    } else {
      dist = CAM_FOOT[mode]; sh = 0.55;
    }
    const bias = veh || aiming ? 0 : CAM_PITCH_BIAS[mode];

    if (camSnap) { camDist = dist; camFov = fov; shoulder = sh; camPitchBias = bias; camCol = dist; }
    else {
      camDist += (dist - camDist) * damp(aiming ? 12 : 5, dt);
      camFov += (fov - camFov) * damp(7, dt);
      shoulder += (sh - shoulder) * damp(10, dt);
      camPitchBias += (bias - camPitchBias) * damp(4, dt);
    }

    const pitch = clamp(player.aimPitch + camPitchBias, -0.5, 1.45);
    const yaw = player.aimYaw;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    // view direction (pitch > 0 looks down)
    camDir.set(sy * cp, -sp, cy * cp);

    // pivot: chest/head height (+ shoulder shift to the right)
    const pivH = veh ? 1.5 + (veh.height || 1.4) * 0.35 : 1.7;
    const px = p.x - cy * shoulder;
    const py = p.y + pivH;
    const pz = p.z + sy * shoulder;

    // desired camera offset = -dir * dist
    let ex = -camDir.x, ey = -camDir.y, ez = -camDir.z;
    let want = camDist;
    const w = game.world;
    if (w?.raycast) {
      const hit = w.raycast(px, py, pz, ex, ey, ez, want + 0.4);
      if (hit && hit.dist < want + 0.4) want = Math.max(0.7, hit.dist - 0.35);
    }
    // ground clamp: keep camera above y = 0.4
    if (ey < 0) {
      const maxLen = (py - 0.4) / -ey;
      if (maxLen < want) want = Math.max(0.7, maxLen);
    }
    if (camSnap || want < camCol) camCol = want;
    else camCol += (want - camCol) * damp(4, dt);

    camera.position.set(px + ex * camCol, py + ey * camCol, pz + ez * camCol);
    if (camera.position.y < 0.4) camera.position.y = 0.4;
    _look.set(camera.position.x + camDir.x * 10, camera.position.y + camDir.y * 10, camera.position.z + camDir.z * 10);
    camera.lookAt(_look);
    if (Math.abs(camera.fov - camFov) > 0.01) { camera.fov = camFov; camera.updateProjectionMatrix(); }
    camSnap = false;
  }

  return player;
}
