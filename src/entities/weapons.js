// Weapons & combat: defs, inventory, player fire/reload/melee, generic hitscan for NPCs, RPG, explosions.
import * as THREE from 'three';
import { clamp, lerp } from '../core/utils.js';
import { createFx } from './fx.js';

// damage = per bullet/pellet vs peds. NPC->player damage is scaled by PLAYER_DMG (pistol ~9).
// Vehicles take damage * VEHICLE_DMG (pistol ~6 -> ~17 shots to kill a 100hp car).
const PLAYER_DMG = 0.25;
const VEHICLE_DMG = 0.17;
const HEAD_MUL = 2.5;

export const WEAPON_DEFS = {
  fist:    { name: 'Yumruk', melee: true, damage: 14, rate: 2.6, range: 1.7, spread: 0, clip: 0, auto: true, pellets: 1, reload: 0, price: 0, pack: 0 },
  bat:     { name: 'Sopa', melee: true, damage: 34, rate: 1.7, range: 2.1, spread: 0, clip: 0, auto: true, pellets: 1, reload: 0, price: 120, pack: 0 },
  pistol:  { name: 'Tabanca', damage: 36, rate: 3.5, range: 70, spread: 0.02, clip: 12, auto: false, pellets: 1, reload: 1.3, price: 250, pack: 24, tracer: [1, 0.85, 0.5] },
  smg:     { name: 'Hafif Makineli', damage: 22, rate: 11, range: 60, spread: 0.045, clip: 30, auto: true, pellets: 1, reload: 1.8, price: 700, pack: 60, tracer: [1, 0.85, 0.45] },
  shotgun: { name: 'Pompalı', damage: 13, rate: 1.1, range: 32, spread: 0.075, clip: 6, auto: false, pellets: 8, reload: 2.2, price: 900, pack: 16, tracer: [1, 0.8, 0.4] },
  rifle:   { name: 'Piyade Tüfeği', damage: 30, rate: 8, range: 110, spread: 0.022, clip: 30, auto: true, pellets: 1, reload: 2.2, price: 1500, pack: 60, tracer: [1, 0.95, 0.6] },
  sniper:  { name: 'Keskin Nişancı', damage: 120, rate: 0.9, range: 220, spread: 0.002, clip: 5, auto: false, pellets: 1, reload: 2.6, price: 2200, pack: 10, tracer: [0.8, 0.95, 1] },
  rpg:     { name: 'Roketatar', damage: 0, rate: 0.5, range: 220, spread: 0.01, clip: 1, auto: false, pellets: 1, reload: 2.8, price: 3000, pack: 3, projectile: true },
};
const ORDER = Object.keys(WEAPON_DEFS);

export function createWeapons(game) {
  const { scene, events } = game;
  const defs = WEAPON_DEFS;
  const fx = createFx(game);

  const inventory = [{ id: 'fist', ammo: 0, clip: 0 }];
  let curId = 'fist';
  let now = 0;
  let cooldown = 0;
  let reloadT = 0;
  let prevFire = false;
  let lastCrime = -10;
  let kick = 0;
  let swing = 0;

  const entry = (id) => inventory.find((e) => e.id === id) || null;
  const toast = (t) => game.hud?.notify?.(t);

  // ---------------------------------------------------------------- held weapon model
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const mats = {};
  const mat = (c) => mats[c] || (mats[c] = new THREE.MeshLambertMaterial({ color: c }));
  function part(g, w, h, l, x, y, z, c) {
    const m = new THREE.Mesh(boxGeo, mat(c));
    m.scale.set(w, h, l); m.position.set(x, y, z);
    g.add(m);
  }
  const models = {};
  const mk = (id, fn) => { const g = new THREE.Group(); fn(g); g.visible = false; models[id] = g; };
  mk('bat', (g) => { part(g, 0.06, 0.06, 0.8, 0, 0, 0.3, 0x9a6b3a); part(g, 0.09, 0.09, 0.3, 0, 0, 0.6, 0x8a5b2a); });
  mk('pistol', (g) => { part(g, 0.06, 0.09, 0.24, 0, 0.02, 0.1, 0x2b2f36); part(g, 0.05, 0.12, 0.06, 0, -0.08, 0.02, 0x1c1f24); });
  mk('smg', (g) => { part(g, 0.07, 0.1, 0.34, 0, 0.02, 0.15, 0x24282e); part(g, 0.04, 0.16, 0.05, 0, -0.12, 0.1, 0x14171b); part(g, 0.035, 0.035, 0.14, 0, 0.03, 0.4, 0x14171b); part(g, 0.05, 0.1, 0.06, 0, -0.07, 0, 0x1c1f24); });
  mk('shotgun', (g) => { part(g, 0.05, 0.05, 0.7, 0, 0.04, 0.38, 0x30343a); part(g, 0.06, 0.07, 0.3, 0, 0.0, 0.3, 0x8a5b2a); part(g, 0.07, 0.11, 0.26, 0, 0, -0.1, 0x6b4423); });
  mk('rifle', (g) => { part(g, 0.07, 0.1, 0.6, 0, 0.03, 0.25, 0x2a3138); part(g, 0.07, 0.12, 0.25, 0, -0.01, -0.15, 0x3a3f33); part(g, 0.04, 0.14, 0.06, 0, -0.12, 0.2, 0x14171b); part(g, 0.04, 0.05, 0.16, 0, 0.11, 0.2, 0x111418); part(g, 0.03, 0.03, 0.2, 0, 0.04, 0.68, 0x14171b); });
  mk('sniper', (g) => { part(g, 0.06, 0.08, 0.9, 0, 0.03, 0.3, 0x2a3138); part(g, 0.07, 0.12, 0.28, 0, -0.01, -0.2, 0x4a3a28); part(g, 0.05, 0.06, 0.28, 0, 0.1, 0.25, 0x111418); });
  mk('rpg', (g) => { part(g, 0.13, 0.13, 0.95, 0, 0.05, 0.3, 0x55603a); part(g, 0.2, 0.2, 0.16, 0, 0.05, 0.85, 0x3d4529); part(g, 0.05, 0.12, 0.06, 0, -0.07, 0.15, 0x1c1f24); });
  const holder = new THREE.Group();
  holder.name = 'heldWeapon';
  for (const id in models) holder.add(models[id]);
  let holderParent = null;

  function ensureAttached(p) {
    const hand = p.humanoid?.parts?.handR || p.parts?.handR || null;
    const parent = hand || p.mesh || null;
    if (!parent) return;
    if (holderParent !== parent) {
      parent.add(holder);
      holderParent = parent;
      if (hand) { holder.position.set(0, -0.12, 0.04); holder.rotation.set(Math.PI / 2, 0, 0); }
      else { holder.position.set(0.3, 1.3, 0.35); holder.rotation.set(0, 0, 0); }
      holder.userData.base = hand ? 'hand' : 'mesh';
    }
  }
  function refreshModel() {
    for (const id in models) models[id].visible = id === curId;
  }

  // ---------------------------------------------------------------- inventory API
  const emitChanged = () => events.emit('weapon:changed', { weapon: api.current });

  function give(id, ammo = 0) {
    const d = defs[id];
    if (!d || id === 'fist') return;
    let e = entry(id);
    const fresh = !e;
    if (fresh) {
      e = { id, ammo: 0, clip: 0 };
      inventory.push(e);
      inventory.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
    }
    if (!d.melee) {
      if (fresh && ammo <= 0) ammo = d.pack || d.clip;
      let add = Math.max(0, Math.round(ammo));
      if (e.clip < d.clip) { const t = Math.min(d.clip - e.clip, add); e.clip += t; add -= t; }
      e.ammo += add;
    }
    toast(fresh ? `${d.name} alındı` : (d.melee ? `${d.name} zaten var` : `${d.name}: +${Math.round(ammo)} mermi`));
    if (curId === 'fist') select(id); else emitChanged();
  }

  function select(id) {
    if (!defs[id] || !entry(id) || id === curId) return;
    curId = id; reloadT = 0; cooldown = Math.max(cooldown, 0.2);
    refreshModel();
    emitChanged();
  }

  function reset() {
    inventory.length = 0;
    inventory.push({ id: 'fist', ammo: 0, clip: 0 });
    curId = 'fist'; reloadT = 0; cooldown = 0;
    refreshModel();
    emitChanged();
  }

  function cycle(dir) {
    const i = inventory.findIndex((e) => e.id === curId);
    const n = inventory.length;
    if (n < 2) return;
    select(inventory[(i + dir + n) % n].id);
  }

  function startReload() {
    const e = entry(curId), d = defs[curId];
    if (!e || d.melee || reloadT > 0 || e.clip >= d.clip || e.ammo <= 0) return;
    reloadT = d.reload;
  }
  function finishReload() {
    const e = entry(curId), d = defs[curId];
    if (!e) return;
    const t = Math.min(d.clip - e.clip, e.ammo);
    e.clip += t; e.ammo -= t;
    emitChanged();
  }

  // ---------------------------------------------------------------- hitscan
  const tmpPerp1 = new THREE.Vector3(), tmpPerp2 = new THREE.Vector3(), tmpDir = new THREE.Vector3();

  function rayCylinder(ox, oy, oz, dx, dy, dz, cx, cz, r, y0, y1, max) {
    const a = dx * dx + dz * dz;
    if (a < 1e-8) return -1;
    const fx = ox - cx, fz = oz - cz;
    const b = fx * dx + fz * dz;
    const c = fx * fx + fz * fz - r * r;
    let t;
    if (c < 0) t = 0;
    else {
      const disc = b * b - a * c;
      if (disc < 0) return -1;
      t = (-b - Math.sqrt(disc)) / a;
    }
    if (t < 0 || t > max) return -1;
    const y = oy + dy * t;
    return y >= y0 && y <= y1 ? t : -1;
  }

  const falloff = (d, range) => (d < range * 0.35 ? 1 : lerp(1, 0.5, clamp((d - range * 0.35) / (range * 0.65), 0, 1)));

  function pelletTrace(shooter, ox, oy, oz, dx, dy, dz, d, drawTracer) {
    const range = d.range;
    const w = game.world, p = game.player;
    let best = range, kind = 0, ped = null, veh = null, head = false;
    let nx = -dx, ny = -dy, nz = -dz;

    const wh = w?.raycast?.(ox, oy, oz, dx, dy, dz, range);
    if (wh && wh.dist < best) { best = wh.dist; kind = 1; nx = wh.nx ?? nx; ny = wh.ny ?? ny; nz = wh.nz ?? nz; }

    const ph = game.peds?.raycast?.(ox, oy, oz, dx, dy, dz, best, shooter);
    if (ph && ph.ped !== shooter && ph.dist < best) { best = ph.dist; kind = 2; ped = ph.ped; head = !!ph.headshot; }

    const ownVeh = shooter?.vehicle || null;
    let vh = game.vehicles?.raycast?.(ox, oy, oz, dx, dy, dz, best);
    if (vh && ownVeh && vh.vehicle === ownVeh) {
      const skip = (ownVeh.halfL || 2.5) * 2 + 0.5;
      const sx = ox + dx * (vh.dist + skip), sy = oy + dy * (vh.dist + skip), sz = oz + dz * (vh.dist + skip);
      const rem = best - vh.dist - skip;
      vh = rem > 0 ? game.vehicles.raycast(sx, sy, sz, dx, dy, dz, rem) : null;
      if (vh) vh.dist = Math.hypot(vh.x - ox, vh.y - oy, vh.z - oz);
    }
    if (vh && vh.dist < best && vh.vehicle !== ownVeh) { best = vh.dist; kind = 3; veh = vh.vehicle; ped = null; }

    let hitPlayer = false;
    if (shooter !== p && p && p.alive && !p.inVehicle) {
      const t = rayCylinder(ox, oy, oz, dx, dy, dz, p.position.x, p.position.z, 0.5, p.position.y, p.position.y + 1.8, best);
      if (t >= 0 && t < best) { best = t; kind = 4; hitPlayer = true; }
    }

    const hx = ox + dx * best, hy = oy + dy * best, hz = oz + dz * best;
    const dmg = d.damage * falloff(best, range);

    if (kind === 1) {
      fx.sparks(hx + nx * 0.03, hy + ny * 0.03, hz + nz * 0.03, nx, ny, nz, 3);
    } else if (kind === 2 && ped) {
      fx.blood(hx, hy, hz, head ? 7 : 4);
      ped.takeDamage?.(dmg * (head ? HEAD_MUL : 1), { kind: 'bullet', attacker: shooter, headshot: head });
    } else if (kind === 3 && veh) {
      fx.sparks(hx, hy, hz, -dx, 0.3, -dz, 4);
      veh.takeDamage?.(dmg * VEHICLE_DMG, { kind: 'bullet', attacker: shooter });
      if (veh === p?.vehicle && shooter !== p && Math.random() < 0.35) {
        p.takeDamage?.(dmg * 0.12, { kind: 'bullet', attacker: shooter });
      }
    } else if (hitPlayer) {
      fx.blood(hx, hy, hz, 3);
      p.takeDamage?.(dmg * PLAYER_DMG, { kind: 'bullet', attacker: shooter });
    }
    if (drawTracer) {
      const tc = d.tracer || [1, 0.85, 0.5];
      const len = Math.min(best, 90);
      fx.tracer(ox, oy, oz, ox + dx * len, oy + dy * len, oz + dz * len, tc[0], tc[1], tc[2]);
    }
  }

  function fireHitscan(shooter, ox, oy, oz, dx, dy, dz, weaponId, spreadMul) {
    const d = defs[weaponId] || defs.pistol;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;
    // perpendicular basis
    if (Math.abs(dy) > 0.99) tmpPerp1.set(1, 0, 0); else tmpPerp1.set(dz, 0, -dx).normalize();
    tmpDir.set(dx, dy, dz);
    tmpPerp2.crossVectors(tmpDir, tmpPerp1);
    const spread = d.spread * spreadMul;
    for (let i = 0; i < d.pellets; i++) {
      let sx = dx, sy = dy, sz = dz;
      if (spread > 0) {
        const r = Math.sqrt(Math.random()) * spread, a = Math.random() * Math.PI * 2;
        const c = Math.cos(a) * r, s = Math.sin(a) * r;
        sx += tmpPerp1.x * c + tmpPerp2.x * s;
        sy += tmpPerp1.y * c + tmpPerp2.y * s;
        sz += tmpPerp1.z * c + tmpPerp2.z * s;
        const l = Math.hypot(sx, sy, sz); sx /= l; sy /= l; sz /= l;
      }
      pelletTrace(shooter, ox, oy, oz, sx, sy, sz, d, i < 4);
    }
    fx.flash(ox + dx * 0.25, oy + dy * 0.25, oz + dz * 0.25, d.pellets > 1 ? 0.9 : 0.6);
    events.emit('gunshot', { x: ox, y: oy, z: oz, shooter, weapon: weaponId });
    if (shooter === game.player) {
      events.emit('weapon:fired', { weapon: weaponId });
      if (now - lastCrime > 0.5) { lastCrime = now; events.emit('crime', { type: 'gunshot', x: ox, z: oz }); }
    }
  }

  // ---------------------------------------------------------------- RPG
  const rockets = [];
  const rocketGeo = new THREE.BoxGeometry(0.14, 0.14, 0.7);
  const rocketMat = new THREE.MeshBasicMaterial({ color: 0xd8d8c8 });
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(rocketGeo, rocketMat);
    m.visible = false; scene.add(m);
    rockets.push({ mesh: m, active: false, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 1, life: 0, travelled: 0, shooter: null });
  }
  function launchRocket(shooter, ox, oy, oz, dx, dy, dz) {
    const len = Math.hypot(dx, dy, dz) || 1;
    const r = rockets.find((q) => !q.active) || rockets[0];
    r.active = true; r.x = ox; r.y = oy; r.z = oz;
    r.dx = dx / len; r.dy = dy / len; r.dz = dz / len;
    r.life = 4; r.travelled = 0; r.shooter = shooter;
    r.mesh.visible = true;
    r.mesh.position.set(ox, oy, oz);
    r.mesh.lookAt(ox + r.dx, oy + r.dy, oz + r.dz);
    fx.flash(ox, oy, oz, 1.1);
    fx.smoke(ox, oy, oz, 4, 0.5);
    events.emit('gunshot', { x: ox, y: oy, z: oz, shooter, weapon: 'rpg' });
    if (shooter === game.player) {
      events.emit('weapon:fired', { weapon: 'rpg' });
      events.emit('crime', { type: 'gunshot', x: ox, z: oz });
    }
  }
  function explodeRocket(r, x, y, z) {
    r.active = false; r.mesh.visible = false;
    events.emit('explosion', { x, y, z, radius: 9, attacker: r.shooter });
    if (r.shooter === game.player) events.emit('crime', { type: 'explosion', x, z });
  }
  function updateRockets(dt) {
    for (const r of rockets) {
      if (!r.active) continue;
      const step = 62 * dt;
      r.life -= dt;
      let hit = null;
      const wh = game.world?.raycast?.(r.x, r.y, r.z, r.dx, r.dy, r.dz, step + 0.3);
      if (wh) hit = wh;
      const ph = game.peds?.raycast?.(r.x, r.y, r.z, r.dx, r.dy, r.dz, step + 0.3, r.shooter);
      if (ph && (!hit || ph.dist < hit.dist)) hit = ph;
      if (r.travelled > 6 || !r.shooter?.vehicle) {
        const vh = game.vehicles?.raycast?.(r.x, r.y, r.z, r.dx, r.dy, r.dz, step + 0.3);
        if (vh && (!hit || vh.dist < hit.dist) && vh.vehicle !== r.shooter?.vehicle) hit = vh;
      }
      const p = game.player;
      if (r.shooter !== p && p?.alive && !p.inVehicle) {
        const t = rayCylinder(r.x, r.y, r.z, r.dx, r.dy, r.dz, p.position.x, p.position.z, 0.6, p.position.y, p.position.y + 1.8, step + 0.3);
        if (t >= 0 && (!hit || t < hit.dist)) hit = { dist: t, x: r.x + r.dx * t, y: r.y + r.dy * t, z: r.z + r.dz * t };
      }
      if (hit) { explodeRocket(r, hit.x, hit.y, hit.z); continue; }
      r.x += r.dx * step; r.y += r.dy * step; r.z += r.dz * step; r.travelled += step;
      if (r.y < 0.1 || r.life <= 0) { explodeRocket(r, r.x, Math.max(r.y, 0.3), r.z); continue; }
      r.mesh.position.set(r.x, r.y, r.z);
      fx.smoke(r.x - r.dx * 0.5, r.y - r.dy * 0.5, r.z - r.dz * 0.5, 1, 0.45);
    }
  }

  // ---------------------------------------------------------------- explosions
  events.on('explosion', (e) => {
    if (!e || e.__wfx) return;
    e.__wfx = true;
    const r = e.radius || 9, y = e.y ?? 0.5;
    fx.explosion(e.x, y, e.z, r);
    const peds = game.peds?.list;
    if (peds) {
      for (let i = 0; i < peds.length; i++) {
        const pd = peds[i];
        if (!pd.alive) continue;
        const d = Math.hypot(pd.position.x - e.x, pd.position.z - e.z);
        if (d < r) pd.takeDamage?.(150 * (1 - d / r) + 15, { kind: 'explosion', attacker: e.attacker });
      }
    }
    const p = game.player;
    if (p && p.alive && !p.inVehicle) {
      const d = Math.hypot(p.position.x - e.x, p.position.z - e.z);
      if (d < r) p.takeDamage?.(80 * (1 - d / r) + 5, { kind: 'explosion', attacker: e.attacker });
    }
  });

  // ---------------------------------------------------------------- player input
  const ray = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 1 };
  const muz = { x: 0, y: 0, z: 0 };

  function aimAssist(o, d, range) {
    const list = game.peds?.list;
    if (!list) return null;
    const cosMax = Math.cos(12 * Math.PI / 180);
    let best = null, bestScore = 0;
    for (let i = 0; i < list.length; i++) {
      const pd = list[i];
      if (!pd.alive) continue;
      const vx = pd.position.x - o.ox, vy = pd.position.y + 1.2 - o.oy, vz = pd.position.z - o.oz;
      const L = Math.hypot(vx, vy, vz);
      if (L < 1.5 || L > range) continue;
      const c = (vx * o.dx + vy * o.dy + vz * o.dz) / L;
      if (c < cosMax) continue;
      const score = c + (pd.hostile || pd.isCop ? 0.02 : 0) - L * 0.0001;
      if (score > bestScore) { bestScore = score; best = pd; }
    }
    return best;
  }

  const aimPt = { x: 0, y: 0, z: 0 };
  function computeAimPoint(p, d, inVehicle) {
    const o = ray;
    // start the ray at the player's depth so things between camera and player don't block
    const t0 = clamp((p.position.x - o.ox) * o.dx + (p.position.y + 1 - o.oy) * o.dy + (p.position.z - o.oz) * o.dz, 0, 12);
    const sx = o.ox + o.dx * t0, sy = o.oy + o.dy * t0, sz = o.oz + o.dz * t0;
    const max = Math.max(d.range, 40);
    if (game.input.usingTouch) {
      const t = aimAssist(o, o, max);
      if (t) { aimPt.x = t.position.x; aimPt.y = t.position.y + 1.2; aimPt.z = t.position.z; return; }
    }
    let best = max;
    const wh = game.world?.raycast?.(sx, sy, sz, o.dx, o.dy, o.dz, best);
    if (wh && wh.dist < best) best = wh.dist;
    const ph = game.peds?.raycast?.(sx, sy, sz, o.dx, o.dy, o.dz, best, p);
    if (ph && ph.dist < best) best = ph.dist;
    if (!inVehicle) {
      const vh = game.vehicles?.raycast?.(sx, sy, sz, o.dx, o.dy, o.dz, best);
      if (vh && vh.dist < best) best = vh.dist;
    }
    aimPt.x = sx + o.dx * best; aimPt.y = sy + o.dy * best; aimPt.z = sz + o.dz * best;
  }

  function playerMelee(p, d) {
    const hx = p.position.x + Math.sin(p.heading) * (d.range * 0.55);
    const hz = p.position.z + Math.cos(p.heading) * (d.range * 0.55);
    const rad = d.range * 0.6;
    p.playAction?.('punch');
    swing = 0.2;
    let best = null, bd = 1e9;
    const list = game.peds?.list;
    if (list) {
      for (let i = 0; i < list.length; i++) {
        const pd = list[i];
        if (!pd.alive) continue;
        const dd = Math.hypot(pd.position.x - hx, pd.position.z - hz);
        if (dd < rad + (pd.radius || 0.4) && dd < bd) { bd = dd; best = pd; }
      }
    }
    if (best) {
      best.takeDamage?.(d.damage, { kind: 'melee', attacker: p });
      fx.blood(best.position.x, best.position.y + 1.3, best.position.z, 3);
      return;
    }
    const vl = game.vehicles?.list;
    if (vl) {
      for (let i = 0; i < vl.length; i++) {
        const v = vl[i];
        if (v === p.vehicle || v.destroyed) continue;
        if (Math.hypot(v.position.x - hx, v.position.z - hz) < rad + (v.radius || 2) * 0.7) {
          v.takeDamage?.(d.damage * 0.08, { kind: 'melee', attacker: p });
          fx.sparks(hx, 1, hz, 0, 0.5, 0, 2);
          break;
        }
      }
    }
  }

  function playerFire(p, e, d) {
    const inVeh = !!p.inVehicle;
    p.getAimRay?.(ray);
    computeAimPoint(p, d, inVeh);
    if (p.getMuzzle) p.getMuzzle(muz); else { muz.x = p.position.x; muz.y = p.position.y + 1.4; muz.z = p.position.z; }
    let dx = aimPt.x - muz.x, dy = aimPt.y - muz.y, dz = aimPt.z - muz.z;
    const L = Math.hypot(dx, dy, dz);
    if (L < 1.2) { dx = ray.dx; dy = ray.dy; dz = ray.dz; }
    const moving = Math.hypot(game.input.moveX, game.input.moveY) > 0.3 && !inVeh;
    let sm = (game.input.aim ? 0.5 : 1) * (moving ? 1.6 : 1) * (inVeh ? 2 : 1) * (game.input.usingTouch ? 0.8 : 1);
    if (d.projectile) launchRocket(p, muz.x, muz.y, muz.z, dx, dy, dz);
    else fireHitscan(p, muz.x, muz.y, muz.z, dx, dy, dz, e.id, sm);
    kick = 0.12;
  }

  function updatePlayer(dt) {
    const p = game.player, input = game.input;
    if (!p) return;
    ensureAttached(p);
    const e = entry(curId) || inventory[0];
    const d = defs[e.id];
    holder.visible = !!(p.alive && !p.inVehicle && e.id !== 'fist');
    // recoil / swing animation on the held model
    if (kick > 0) kick = Math.max(0, kick - dt * 0.8);
    if (swing > 0) swing = Math.max(0, swing - dt);
    if (holder.userData.base === 'hand') holder.rotation.x = Math.PI / 2 - kick * 3 + (d.melee ? -swing * 5 : 0);
    else { holder.rotation.x = -kick * 3 - (d.melee ? swing * 5 : 0); }

    cooldown -= dt;
    if (!p.alive) { reloadT = 0; prevFire = false; return; }

    // switching
    if (input.pressed('nextWeapon')) cycle(1);
    if (input.pressed('prevWeapon')) cycle(-1);
    for (let n = 1; n <= 9; n++) if (input.pressed('weapon' + n) && inventory[n - 1]) select(inventory[n - 1].id);

    const cur = entry(curId) || inventory[0];
    const cd = defs[cur.id];

    // reload
    if (reloadT > 0) {
      reloadT -= dt;
      if (reloadT <= 0) { reloadT = 0; finishReload(); }
    } else if (!cd.melee) {
      if (input.pressed('reload') || (cur.clip <= 0 && cur.ammo > 0)) startReload();
    }

    const held = !!input.fire;
    const edge = held && !prevFire;
    prevFire = held;
    if (!held) return;
    if (p.inVehicle && cur.id !== 'pistol' && cur.id !== 'smg') return;
    if (cooldown > 0 || reloadT > 0) return;
    if (!cd.auto && !edge) return;

    if (cd.melee) {
      cooldown = 1 / cd.rate;
      playerMelee(p, cd);
      return;
    }
    if (cur.clip <= 0) { if (cur.ammo > 0) startReload(); return; }
    cur.clip--;
    cooldown = 1 / cd.rate;
    playerFire(p, cur, cd);
    if (cur.clip <= 0) { if (cur.ammo > 0) startReload(); emitChanged(); }
  }

  // ---------------------------------------------------------------- public API
  const api = {
    defs,
    inventory,
    get current() { return entry(curId) || inventory[0]; },
    get reloading() { return reloadT > 0; },
    get reloadProgress() { const d = defs[curId]; return reloadT > 0 && d.reload ? 1 - reloadT / d.reload : 1; },
    fx,
    give, select, reset,
    nextWeapon: () => cycle(1),
    prevWeapon: () => cycle(-1),
    has: (id) => !!entry(id),
    /** Shared-geometry copy of a held-weapon model (barrel along +Z) for pickups/shop. */
    cloneModel(id) { const m = models[id]; if (!m) return null; const c = m.clone(); c.visible = true; c.position.set(0, 0, 0); c.rotation.set(0, 0, 0); return c; },
    fireFrom(shooter, ox, oy, oz, dx, dy, dz, weaponId) {
      const d = defs[weaponId] || defs.pistol;
      if (d.melee) return;
      if (d.projectile) { launchRocket(shooter, ox, oy, oz, dx, dy, dz); return; }
      fireHitscan(shooter, ox, oy, oz, dx, dy, dz, defs[weaponId] ? weaponId : 'pistol', 1);
    },
    serialize() {
      return { cur: curId, inv: inventory.map((e) => ({ id: e.id, ammo: e.ammo, clip: e.clip })) };
    },
    deserialize(data) {
      if (!data || !Array.isArray(data.inv)) return;
      inventory.length = 0;
      inventory.push({ id: 'fist', ammo: 0, clip: 0 });
      for (const s of data.inv) {
        if (!defs[s.id] || s.id === 'fist') continue;
        inventory.push({ id: s.id, ammo: Math.max(0, s.ammo | 0), clip: clamp(s.clip | 0, 0, defs[s.id].clip) });
      }
      inventory.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
      curId = entry(data.cur) ? data.cur : 'fist';
      reloadT = 0;
      refreshModel();
      emitChanged();
    },
    update(dt) {
      now += dt;
      fx.update(dt);
      updateRockets(dt);
      updatePlayer(dt);
    },
  };
  refreshModel();
  return api;
}
