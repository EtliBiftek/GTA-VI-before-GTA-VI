// Neon Coast - pedestrians (civilians, cops, gang, mission peds). Contract: docs/ARCHITECTURE.md
import * as THREE from 'three';
import { clamp, rand, randInt, pick, wrapAngle, angleDiff, turnToward, headingTo, TAU } from '../core/utils.js';
import { createHumanoid } from './humanoid.js';

const SHIRTS = [0xd9534f, 0x3b82f6, 0xf5c542, 0x2fb67c, 0xffffff, 0x8e44ad, 0xff8a3d, 0x20b2aa, 0xe85d9b, 0x444b55, 0xb7d84b];
const PANTS = [0x2b3a55, 0x1f2430, 0x6b5b45, 0x3d4d3a, 0x9aa3ad, 0x2a2a2a, 0x53406b];
const SKINS = [0xf1c7a1, 0xe0a97c, 0xc68a5c, 0x9a6540, 0x6e4529, 0xfad7bd];
const HAIRS = [0x1a1410, 0x3b2616, 0x6b4423, 0xc9a24b, 0x8a8a8a, 0xb5532b, 0x111111];
const HATS = [0xe8e8e8, 0xc0392b, 0x1e90ff, 0x222222, 0xf1c40f];
const GANG_SHIRTS = [0xff2d95, 0x00e5ff, 0xb6ff00, 0xff7a00, 0xa855f7];

// weapon -> [minRange, maxRange, shot interval, burstMin, burstMax]
const WEAP = {
  pistol: [12, 18, 0.5, 2, 3],
  smg: [10, 16, 0.11, 4, 6],
  shotgun: [5, 9, 1.1, 1, 1],
  rifle: [15, 25, 0.22, 3, 4],
};
const DEF_WEAP = WEAP.pistol;

export function createPeds(game) {
  const list = [];
  const res = { dist: 0, ped: null, x: 0, y: 0, z: 0, headshot: false };
  const cc = { x: 0, z: 0, hit: false, nx: 0, nz: 0 };
  const tmpV = new THREE.Vector3();
  const gunGeo = new THREE.BoxGeometry(0.07, 0.1, 0.34);
  const gunMat = new THREE.MeshLambertMaterial({ color: 0x151515 });
  let nodeMap = null;
  let time = 0;
  let spawnTimer = 0;

  const ev = game.events;
  const peds = { list, spawn, remove, raycast, nearest, scare, startFlee, update, init() {} };

  // ---------- helpers ----------
  function getNode(id) {
    const nodes = game.world?.roads?.nodes;
    if (!nodes) return null;
    const n = nodes[id];
    if (n && n.id === id) return n;
    if (!nodeMap) { nodeMap = new Map(); for (const nn of nodes) nodeMap.set(nn.id, nn); }
    return nodeMap.get(id) || null;
  }

  function ambientCap() {
    const d = game.q?.density ?? 0.8;
    return Math.round(clamp(12 + (d - 0.5) * 36, 8, 30));
  }

  function makeHumanoid(type) {
    const cop = type === 'cop', gang = type === 'gang';
    const cfg = {
      shirt: cop ? 0x1c2a5a : gang ? pick(GANG_SHIRTS) : pick(SHIRTS),
      pants: cop ? 0x131b38 : pick(PANTS),
      skin: pick(SKINS),
      hair: pick(HAIRS),
      hat: cop ? 0x10183a : (Math.random() < (gang ? 0.4 : 0.18) ? pick(HATS) : null),
      shoes: cop ? 0x0a0a0a : 0x222222,
    };
    try { return createHumanoid(cfg); } catch (e) {
      const group = new THREE.Group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.7, 0.3), new THREE.MeshLambertMaterial({ color: cfg.shirt }));
      m.position.y = 0.85; group.add(m);
      return { group, parts: {}, animate() {}, height: 1.8 };
    }
  }

  // ---------- spawn / remove ----------
  function spawn(x, z, opts = {}) {
    const type = opts.type || 'civilian';
    const isCop = type === 'cop';
    const hum = makeHumanoid(type);
    const g = hum.group;
    const sc = rand(0.93, 1.07);
    g.scale.setScalar(sc);
    g.position.set(x, 0, z);
    const hostile = !!opts.hostile;
    const weapon = opts.weapon || ((isCop || type === 'gang' || hostile) ? (type === 'gang' && Math.random() < 0.25 ? 'smg' : 'pistol') : null);
    const p = {
      kind: 'ped', type, mesh: g, position: g.position, heading: rand(0, TAU), radius: 0.4,
      health: 100, alive: true, state: 'idle', isCop, hostile, weapon, target: opts.target || null,
      takeDamage: null,
      hum, scale: sc, chase: !!opts.chase, persistent: !!opts.persistent, onDeath: opts.onDeath || null,
      noCrime: !!opts.noCrime, skill: opts.skill ?? (isCop ? 0.4 : 0.3), aggro: opts.aggro ?? 60, leaving: false,
      noShoot: false, los: false, losT: Math.random() * 0.2, hadLos: false,
      fleeT: 0, fleeH: 0, kx: 0, kz: 0, pause: Math.random() < 0.3 ? rand(0.5, 3) : 0, pauseLook: 0,
      speed: rand(1.15, 1.75), moveSpeed: 0, jumpT: 0, carT: Math.random() * 0.3,
      nodeFrom: null, nodeTo: null, side: Math.random() < 0.5 ? 1 : -1, wx: 0, wz: 0,
      deadT: 0, fireCd: 0, burstLeft: 0, reactT: 0, strafeDir: Math.random() < 0.5 ? 1 : -1, strafeT: rand(1, 3),
      stuckT: 0, sideT: 0, sideDir: 1, fightT: 0, hitCd: 0, gun: null, anim: 'idle', spawnT: time,
    };
    p.takeDamage = (amount, source) => damagePed(p, amount, source);
    g.rotation.y = p.heading;
    if (weapon && hum.parts?.handR) {
      const gm = new THREE.Mesh(gunGeo, gunMat);
      gm.position.set(0, -0.05, 0.15);
      hum.parts.handR.add(gm);
      p.gun = gm;
    }
    game.scene.add(g);
    list.push(p);
    if (opts.flee) startFlee(p, x + rand(-3, 3), z + rand(-3, 3), rand(8, 15), true);
    return p;
  }

  function remove(p) {
    const i = list.indexOf(p);
    if (i >= 0) { list[i] = list[list.length - 1]; list.pop(); }
    game.scene.remove(p.mesh);
  }

  // ---------- damage ----------
  function damagePed(p, amount, source) {
    if (!p.alive) return;
    p.health -= amount;
    const kind = source?.kind;
    const attacker = source?.attacker || null;
    const byPlayer = attacker && attacker === game.player;
    const lethal = p.health <= 0;

    if (kind === 'vehicle') {
      const a = attacker || source;
      let kx = a.vx || 0, kz = a.vz || 0;
      if (!kx && !kz && a.heading !== undefined) { const s = a.speed || 8; kx = Math.sin(a.heading) * s; kz = Math.cos(a.heading) * s; }
      p.kx = clamp(kx * 0.6, -14, 14); p.kz = clamp(kz * 0.6, -14, 14);
    }

    if (byPlayer && kind !== 'vehicle' && !p.noCrime && !(p.type === 'gang' && p.hostile)) {
      const t = lethal ? (p.isCop ? 'killCop' : 'killPed') : (p.isCop ? 'hitCop' : 'hitPed');
      ev.emit('crime', { type: t, x: p.position.x, z: p.position.z });
    }

    if (lethal) { die(p, source); return; }

    if (p.hostile || p.chase) {
      if (attacker && attacker.alive !== false && !p.target) p.target = attacker;
    } else if (p.type !== 'cop') {
      if (kind === 'melee' && byPlayer && p.state !== 'attack' && Math.random() < 0.22) {
        p.fightT = rand(6, 10); p.state = 'attack';
      } else if (p.state !== 'attack') {
        const ap = attacker?.position || p.position;
        startFlee(p, ap.x, ap.z, rand(8, 14), true);
      }
    }
    if (kind === 'vehicle' && p.state !== 'attack' && !p.hostile) startFlee(p, p.position.x - p.kx, p.position.z - p.kz, rand(5, 9), true);
  }

  function die(p, source) {
    p.alive = false; p.health = 0; p.state = 'dead'; p.deadT = 20; p.fightT = 0;
    ev.emit('ped:died', { ped: p, source });
    const x = p.position.x, z = p.position.z;
    if (game.pickups?.spawn) {
      try {
        if (p.type === 'civilian' && Math.random() < 0.35) game.pickups.spawn('money', x, z, { amount: randInt(10, 80) });
        else if ((p.isCop || p.type === 'gang') && p.weapon && Math.random() < 0.4) game.pickups.spawn('weapon', x, z, { weapon: p.weapon, ammo: randInt(12, 40) });
      } catch (e) { /* ignore */ }
    }
    if (p.onDeath) { try { p.onDeath(p, source); } catch (e) { console.error(e); } }
  }

  // ---------- reactions ----------
  function startFlee(p, fx, fz, dur, force) {
    if (!p.alive) return;
    if (!force && (p.hostile || p.chase || p.isCop || p.state === 'attack')) return;
    if (p.hostile || p.chase || p.isCop) return;
    p.state = 'flee'; p.fleeT = dur; p.fleeX = fx; p.fleeZ = fz;
    p.fleeH = headingTo(fx, fz, p.position.x, p.position.z) + rand(-0.5, 0.5);
    p.pause = 0; p.fightT = 0;
  }

  function scare(x, z, radius, dur) {
    const r2 = radius * radius;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p.alive || p.hostile || p.chase || p.isCop) continue;
      const dx = p.position.x - x, dz = p.position.z - z;
      if (dx * dx + dz * dz < r2) startFlee(p, x, z, dur || rand(8, 15));
    }
  }

  ev.on('gunshot', (e) => {
    if (!e) return;
    const r2 = 40 * 40;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p.alive || p === e.shooter || p.hostile || p.chase || p.isCop) continue;
      const dx = p.position.x - e.x, dz = p.position.z - e.z;
      if (dx * dx + dz * dz < r2) startFlee(p, e.x, e.z, rand(8, 15));
    }
  });
  ev.on('explosion', (e) => {
    if (!e) return;
    scare(e.x, e.z, 40 + (e.radius || 0), rand(9, 15));
  });

  // ---------- movement ----------
  function collide(p) {
    const w = game.world;
    if (!w?.collideCircle) return false;
    cc.hit = false;
    w.collideCircle(p.position.x, p.position.z, p.radius, cc);
    if (cc.hit) { p.position.x = cc.x; p.position.z = cc.z; }
    return cc.hit;
  }

  function initWalk(p) {
    const roads = game.world?.roads;
    if (!roads?.nearestNode) { p.nodeTo = null; return false; }
    const n = roads.nearestNode(p.position.x, p.position.z);
    if (!n || !n.links?.length) return false;
    const nb = getNode(pick(n.links));
    if (!nb) return false;
    p.nodeFrom = n; p.nodeTo = nb;
    // pick the side we are physically on
    const dx = nb.x - n.x, dz = nb.z - n.z;
    const l = Math.hypot(dx, dz) || 1;
    const px = -dz / l, pz = dx / l;
    p.side = ((p.position.x - n.x) * px + (p.position.z - n.z) * pz) >= 0 ? 1 : -1;
    setWaypoint(p);
    return true;
  }

  function setWaypoint(p) {
    const a = p.nodeFrom, b = p.nodeTo;
    const dx = b.x - a.x, dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    const off = (game.world.roads.sidewalkOffset || 9) * p.side;
    p.wx = b.x + (-dz / l) * off;
    p.wz = b.z + (dx / l) * off;
  }

  function advanceWalk(p) {
    const from = p.nodeTo;
    const links = from.links;
    let next = null;
    if (links && links.length) {
      for (let tries = 0; tries < 4; tries++) {
        const id = links[(Math.random() * links.length) | 0];
        if (links.length > 1 && p.nodeFrom && id === p.nodeFrom.id) continue;
        next = getNode(id); if (next) break;
      }
      if (!next) next = getNode(links[0]);
    }
    if (!next) { initWalk(p); return; }
    p.nodeFrom = from; p.nodeTo = next;
    setWaypoint(p);
    if (Math.random() < 0.15) { p.pause = rand(1, 4); }
  }

  function walk(p, dt) {
    if (p.pause > 0) {
      p.pause -= dt;
      p.state = 'idle'; p.moveSpeed = 0;
      p.pauseLook -= dt;
      if (p.pauseLook <= 0) { p.pauseLook = rand(0.8, 2); p.lookH = p.heading + rand(-1.6, 1.6); }
      p.heading = turnToward(p.heading, p.lookH ?? p.heading, 2.5 * dt);
      return;
    }
    if (!p.nodeTo) { if (!initWalk(p)) { p.state = 'idle'; p.pause = 1; return; } }
    p.state = 'walk';
    const pos = p.position;
    const dx = p.wx - pos.x, dz = p.wz - pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.4) { advanceWalk(p); return; }
    if (Math.random() < dt * 0.012) { p.pause = rand(1, 3.5); return; }
    const des = Math.atan2(dx, dz);
    p.heading = turnToward(p.heading, des, 5 * dt);
    const al = Math.abs(angleDiff(p.heading, des));
    const sp = p.speed * (al > 1 ? 0.25 : 1);
    p.moveSpeed = sp;
    pos.x += Math.sin(p.heading) * sp * dt;
    pos.z += Math.cos(p.heading) * sp * dt;
    if (p.nearPlayer && collide(p)) {
      p.stuckT += dt;
      if (p.stuckT > 2.5) { p.stuckT = 0; p.nodeTo = null; }
    } else p.stuckT = Math.max(0, p.stuckT - dt);
  }

  function flee(p, dt) {
    p.fleeT -= dt;
    p.jumpT -= dt;
    if (p.fleeT <= 0) { p.state = 'walk'; p.nodeTo = null; p.moveSpeed = 0; return; }
    p.heading = turnToward(p.heading, p.fleeH, 9 * dt);
    const sp = 5.6;
    p.moveSpeed = sp;
    p.position.x += Math.sin(p.heading) * sp * dt;
    p.position.z += Math.cos(p.heading) * sp * dt;
    if (p.nearPlayer && collide(p)) p.fleeH += (Math.random() < 0.5 ? 1 : -1) * rand(1.2, 2.2);
  }

  function checkLOS(p, tx, ty, tz, d) {
    const w = game.world;
    if (!w?.raycast || d > 220) return d <= 220;
    if (d < 1.5) return true;
    const ox = p.position.x, oy = 1.4, oz = p.position.z;
    const dx = tx - ox, dy = ty - oy, dz = tz - oz;
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const h = w.raycast(ox, oy, oz, dx / l, dy / l, dz / l, l);
    return !(h && h.dist < l - 0.9);
  }

  function combat(p, dt, pl, tgt) {
    const pos = p.position;
    const tp = tgt.position;
    const tx = tp.x, tz = tp.z;
    const dx = tx - pos.x, dz = tz - pos.z;
    const d = Math.hypot(dx, dz);
    const aggro = (p.isCop || p.chase) ? 1e9 : p.aggro;
    if (d > aggro) { p.state = 'idle'; p.moveSpeed = 0; p.los = false; p.hadLos = false; return; }
    const tInVeh = tgt === pl && pl.inVehicle;
    const ty = (tp.y || 0) + (tInVeh ? 0.9 : 1.1);
    p.losT -= dt;
    if (p.losT <= 0) { p.losT = 0.2 + Math.random() * 0.1; p.los = checkLOS(p, tx, ty, tz, d); }
    if (p.los && !p.hadLos) p.reactT = rand(0.4, 1.0) * (1.4 - p.skill * 0.6);
    p.hadLos = p.los;

    const wd = WEAP[p.weapon] || DEF_WEAP;
    const faceH = Math.atan2(dx, dz);
    p.state = 'attack';
    let mh = faceH, sp = 0, anim = 'aim';
    const shooter = p.hostile && !p.noShoot && p.weapon;
    p.sideT -= dt;
    if (!shooter) {
      // arrest / chase: run at target
      if (d > 1.1) { sp = 5.6; anim = 'run'; } else { anim = 'idle'; }
    } else if (!p.los || d > wd[1]) {
      sp = 5.4; anim = 'run';
    } else if (d < wd[0]) {
      sp = 2.0; mh = faceH + Math.PI;
    } else {
      p.strafeT -= dt;
      if (p.strafeT <= 0) { p.strafeT = rand(1.2, 3); p.strafeDir = Math.random() < 0.5 ? 1 : -1; if (Math.random() < 0.3) p.strafeDir = 0; }
      if (p.strafeDir) { sp = 1.7; mh = faceH + p.strafeDir * Math.PI * 0.5; }
    }
    if (sp > 0 && p.sideT > 0) mh = faceH + p.sideDir * 1.3;
    p.heading = turnToward(p.heading, (sp > 0 && anim === 'run') ? mh : faceH, 8 * dt);
    p.moveSpeed = sp;
    if (sp > 0) {
      pos.x += Math.sin(mh) * sp * dt;
      pos.z += Math.cos(mh) * sp * dt;
      if (p.nearPlayer && collide(p) && anim === 'run') {
        p.stuckT += dt;
        if (p.stuckT > 0.5) { p.stuckT = 0; p.sideT = 1.3; p.sideDir = Math.random() < 0.5 ? 1 : -1; }
      } else p.stuckT = Math.max(0, p.stuckT - dt);
    }
    p.anim = anim;

    // shooting
    if (shooter && p.los && d < wd[1] + 8) {
      if (p.reactT > 0) { p.reactT -= dt; return; }
      p.fireCd -= dt;
      if (p.fireCd <= 0) {
        const wp = game.weapons;
        if (wp?.fireFrom) {
          if (p.burstLeft <= 0) p.burstLeft = randInt(wd[3], wd[4]);
          p.burstLeft--;
          const interval = wd[2] * (1.2 - p.skill * 0.3);
          p.fireCd = p.burstLeft <= 0 ? rand(0.9, 1.5) * (1.3 - p.skill * 0.5) + interval : interval;
          const oy = 1.4 * p.scale;
          const errR = (0.35 + d * 0.065) * (1.5 - p.skill);
          const ang = Math.random() * TAU;
          const r = Math.sqrt(Math.random()) * errR;
          const il = 1 / (d || 1);
          const px = -dz * il, pz = dx * il;
          const ax = tx + px * Math.cos(ang) * r;
          const az = tz + pz * Math.cos(ang) * r;
          const ay = ty + Math.sin(ang) * r * 0.6;
          let ddx = ax - pos.x, ddy = ay - oy, ddz = az - pos.z;
          const l = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) || 1;
          ddx /= l; ddy /= l; ddz /= l;
          wp.fireFrom(p, pos.x + ddx * 0.4, oy, pos.z + ddz * 0.4, ddx, ddy, ddz, p.weapon || 'pistol');
        } else p.fireCd = 1;
      }
    }
  }

  function fight(p, dt, pl) {
    p.fightT -= dt; p.hitCd -= dt;
    if (!pl || !pl.alive || p.fightT <= 0) {
      p.fightT = 0; p.state = 'walk'; p.nodeTo = null;
      if (pl) startFlee(p, pl.position.x, pl.position.z, rand(6, 10), true);
      return;
    }
    const pos = p.position;
    const dx = pl.position.x - pos.x, dz = pl.position.z - pos.z;
    const d = Math.hypot(dx, dz);
    p.state = 'attack';
    p.heading = turnToward(p.heading, Math.atan2(dx, dz), 8 * dt);
    if (d > 1.3) {
      p.moveSpeed = 5; p.anim = 'run';
      pos.x += Math.sin(p.heading) * 5 * dt; pos.z += Math.cos(p.heading) * 5 * dt;
      if (p.nearPlayer) collide(p);
    } else {
      p.moveSpeed = 0; p.anim = 'punch';
      if (p.hitCd <= 0) { p.hitCd = 0.9; pl.takeDamage?.(6, { kind: 'melee', attacker: p }); }
    }
  }

  function dodgeCars(p, pl) {
    const vs = game.vehicles?.list;
    if (!vs) return;
    const pos = p.position;
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      if (!v.alive) continue;
      const vx = v.vx || 0, vz = v.vz || 0;
      const sp2 = vx * vx + vz * vz;
      if (sp2 < 64) continue; // < 8 m/s
      const rx = pos.x - v.position.x, rz = pos.z - v.position.z;
      const dd = rx * rx + rz * rz;
      if (dd > 22 * 22) continue;
      const sp = Math.sqrt(sp2);
      const fwd = (rx * vx + rz * vz) / sp; // distance ahead along velocity
      if (fwd < 0 || fwd / sp > 1.8) continue;
      const lat = (rx * -vz + rz * vx) / sp;
      if (Math.abs(lat) > 2.6) continue;
      // jump aside perpendicular to the car's path
      const s = lat >= 0 ? 1 : -1;
      const nx = (-vz / sp) * s, nz = (vx / sp) * s;
      p.kx = nx * 5; p.kz = nz * 5;
      p.jumpT = 0.4;
      startFlee(p, v.position.x, v.position.z, rand(2.5, 4), true);
      p.fleeH = Math.atan2(nx, nz);
      return;
    }
  }

  // ---------- main update ----------
  function update(dt) {
    time += dt;
    const w = game.world;
    const pl = game.player;
    if (!pl || !pl.position) return;
    const ppos = pl.position;
    const dd = game.q?.drawDistance || 300;
    const dd2 = dd * dd;
    const ringMax = Math.min(120, dd);
    const despawnR2 = (ringMax + 35) * (ringMax + 35);
    let ambient = 0;

    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      const pos = p.position;
      const dx = pos.x - ppos.x, dz = pos.z - ppos.z;
      const d2 = dx * dx + dz * dz;
      p.nearPlayer = d2 < 3600;

      if (!p.alive) {
        p.deadT -= dt;
        if (p.deadT <= 0) { remove(p); continue; }
        if (p.kx || p.kz) { pos.x += p.kx * dt; pos.z += p.kz * dt; const k = Math.exp(-5 * dt); p.kx *= k; p.kz *= k; if (p.nearPlayer) collide(p); }
        pos.y = p.deadT < 1.5 ? -(1.5 - p.deadT) * 0.4 : 0;
        p.mesh.visible = d2 < dd2;
        if (d2 < 6400) p.hum.animate('dead', time, dt, 0);
        continue;
      }

      // despawn rules
      if (!p.persistent) {
        if (p.type === 'civilian' && !p.hostile && !p.chase) {
          if (d2 > despawnR2) { remove(p); continue; }
        } else if (p.leaving) {
          if (d2 > 3600) { remove(p); continue; }
        } else if (d2 > (p.isCop ? 400 * 400 : 250 * 250)) { remove(p); continue; }
      }
      if (p.type === 'civilian' && !p.persistent) ambient++;

      // knockback
      if (p.kx || p.kz) {
        pos.x += p.kx * dt; pos.z += p.kz * dt;
        const k = Math.exp(-6 * dt); p.kx *= k; p.kz *= k;
        if (Math.abs(p.kx) + Math.abs(p.kz) < 0.05) { p.kx = 0; p.kz = 0; }
        if (p.nearPlayer) collide(p);
      }

      p.moveSpeed = 0;
      p.anim = '';
      const combatant = (p.hostile || p.chase) && pl.alive !== false;
      let tgt = null;
      if (combatant) {
        tgt = p.target || pl;
        if (tgt.alive === false) { if (p.target) p.target = null; tgt = p.target || (pl.alive === false ? null : pl); }
      }

      if (p.state === 'flee') {
        flee(p, dt);
      } else if (p.fightT > 0) {
        fight(p, dt, pl);
      } else if (tgt && (p.hostile || p.chase)) {
        combat(p, dt, pl, tgt);
      } else {
        if (p.state === 'attack') { p.state = 'walk'; p.nodeTo = null; }
        walk(p, dt);
      }

      // civilians: dodge fast cars
      if (p.nearPlayer && p.state !== 'flee' && !p.hostile && !p.chase && !p.isCop) {
        p.carT -= dt;
        if (p.carT <= 0) { p.carT = 0.25; dodgeCars(p, pl); }
      }

      // step aside for the player on foot
      if (!pl.inVehicle && d2 < 0.81) {
        const d = Math.sqrt(d2) || 0.01;
        const push = Math.min(0.9 - d, 3 * dt) + 0.0;
        if (push > 0) { pos.x += (dx / d) * push; pos.z += (dz / d) * push; }
      }

      pos.y = 0;
      p.mesh.rotation.y = p.heading;
      const vis = d2 < dd2;
      p.mesh.visible = vis;
      if (d2 < 6400 && vis) {
        let a = p.anim;
        if (!a) a = p.state === 'flee' ? (p.jumpT > 0 ? 'jump' : 'flee') : p.state === 'walk' ? 'walk' : 'idle';
        p.hum.animate(a, time, dt, p.moveSpeed);
      }
    }

    // ambient spawning
    spawnTimer -= dt;
    if (w?.randomSidewalkPoint && spawnTimer <= 0) {
      const cap = ambientCap();
      if (ambient < cap) {
        spawnTimer = ambient < cap * 0.5 ? 0.03 : 0.25;
        for (let attempt = 0; attempt < 2; attempt++) {
          const pt = w.randomSidewalkPoint(ppos.x, ppos.z, 40, ringMax);
          if (!pt) continue;
          const dx = pt.x - ppos.x, dz = pt.z - ppos.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 40) continue;
          if (game.camera && dist < 100) {
            game.camera.getWorldDirection(tmpV);
            const cx = pt.x - game.camera.position.x, cz = pt.z - game.camera.position.z;
            const cl = Math.hypot(cx, cz) || 1;
            if ((cx * tmpV.x + cz * tmpV.z) / cl > 0.45) continue; // in view
          }
          const p = spawn(pt.x, pt.z, { type: 'civilian' });
          if (w.isWater?.(pt.x, pt.z)) remove(p);
          break;
        }
      } else spawnTimer = 0.5;
    }
  }

  // ---------- queries ----------
  function raycast(ox, oy, oz, dx, dy, dz, max, ignore) {
    let best = max, hit = null;
    const R = 0.45, H = 1.8;
    const a = dx * dx + dz * dz;
    if (a < 1e-8) return null;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p.alive || p === ignore) continue;
      const px = ox - p.position.x, pz = oz - p.position.z;
      const b = px * dx + pz * dz;
      const c = px * px + pz * pz - R * R;
      const disc = b * b - a * c;
      if (disc < 0) continue;
      const sq = Math.sqrt(disc);
      let t = (-b - sq) / a;
      if (t < 0) { if (c > 0) continue; t = 0; }
      if (t >= best) continue;
      const y = oy + dy * t;
      if (y < 0 || y > H) continue;
      best = t; hit = p;
    }
    if (!hit) return null;
    res.dist = best; res.ped = hit;
    res.x = ox + dx * best; res.y = oy + dy * best; res.z = oz + dz * best;
    res.headshot = res.y > 1.5;
    return res;
  }

  function nearest(x, z, maxDist, filter) {
    let best = null, bd = maxDist * maxDist;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p.alive) continue;
      const dx = p.position.x - x, dz = p.position.z - z;
      const d = dx * dx + dz * dz;
      if (d < bd && (!filter || filter(p))) { bd = d; best = p; }
    }
    return best;
  }

  return peds;
}
