// Neon Coast - wanted level + police dispatch. Contract: docs/ARCHITECTURE.md
import { clamp, rand, randInt, headingTo } from '../core/utils.js';

const HEAT = {
  gunshot: 4, hitVehicle: 3, hitPed: 12, carjack: 15, killPed: 30,
  hitPoliceCar: 15, hitCop: 40, killCop: 70, explosion: 40,
};
const THRESH = [20, 60, 130, 220, 340];
const CARS_BY_LEVEL = [0, 1, 2, 3, 4, 5];
const COPS_BY_LEVEL = [0, 2, 4, 6, 8, 10];
const sq = (v) => v * v;

export function createPolice(game) {
  const ev = game.events;
  const cops = [];
  const cars = [];
  const pos = { x: 0, z: 0 };

  const police = {
    wantedLevel: 0, heat: 0, cops, cars,
    escaping: false, escapeProgress: 0,
    addCrime, setWanted, clear, update, init() {},
  };

  let time = 0;
  let lastShot = -99;
  let escapeT = 0;
  let lastCrimeT = -99;
  let bustT = 0;
  let dispatchT = 0;
  let scanT = 0;
  let losT = 0;
  let sweepT = 0;
  let patrolT = 20;
  let seenByCar = false;
  let lastPx = 0, lastPz = 0, travX = 0, travZ = 0;

  const isCivilianOrCop = (p) => p.alive && p.type !== 'gang';

  function levelFromHeat(h) {
    let l = 0;
    for (let i = 0; i < THRESH.length; i++) if (h >= THRESH[i]) l = i + 1;
    return l;
  }

  function changeLevel(l) {
    l = clamp(l | 0, 0, 5);
    const prev = police.wantedLevel;
    if (l === prev) return;
    police.wantedLevel = l;
    escapeT = 0; police.escaping = false; police.escapeProgress = 0;
    ev.emit('wanted:changed', { level: l, prev });
    if (l > prev && prev === 0) game.hud?.notify?.('Polis seni arıyor!', 3000);
  }

  function addCrime(type, x, z) {
    let h = HEAT[type];
    if (!h) return;
    if (type === 'gunshot') {
      if (police.wantedLevel === 0) {
        const near = game.peds?.nearest?.(x, z, 50, isCivilianOrCop);
        if (!near) return;
      }
    }
    lastCrimeT = time;
    police.heat += h;
    const l = levelFromHeat(police.heat);
    if (l > police.wantedLevel) changeLevel(l);
    else { escapeT = 0; police.escapeProgress = 0; }
  }

  function setWanted(level) {
    level = clamp(level | 0, 0, 5);
    if (level === 0) { clear(); return; }
    police.heat = THRESH[level - 1];
    lastCrimeT = time;
    changeLevel(level);
  }

  function clear() {
    const had = police.wantedLevel > 0;
    police.heat = 0; escapeT = 0; bustT = 0;
    police.escaping = false; police.escapeProgress = 0;
    const list = game.peds?.list;
    if (list) {
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (!p.isCop || !p.alive || p.persistent) continue;
        if (!p._police) continue;
        p.hostile = false; p.chase = false; p.target = null; p.leaving = true; p.noShoot = false;
        p.state = 'walk'; p.nodeTo = null; p.fightT = 0;
      }
    }
    const vs = game.vehicles?.list;
    if (vs) {
      for (let i = 0; i < vs.length; i++) {
        const v = vs[i];
        if (!v._mine || v.driver === 'player') continue;
        v.siren = false;
        if (v._emptied) { v.driver = null; if (v.ai) { v.ai.mode = 'parked'; v.ai.target = null; } }
        else { v.driver = 'cop'; if (v.ai) { v.ai.mode = 'traffic'; v.ai.target = null; } }
        v._leave = true; v._mine = false; v._patrol = !v._emptied;
      }
    }
    if (had) {
      const prev = police.wantedLevel;
      police.wantedLevel = 0;
      ev.emit('wanted:changed', { level: 0, prev });
    }
  }

  // ---------- events ----------
  ev.on('crime', (e) => { if (e) addCrime(e.type, e.x, e.z); });
  ev.on('gunshot', (e) => {
    if (!e || e.shooter !== game.player) return;
    lastShot = time;
    if (police.wantedLevel === 1) {
      const l = game.peds?.list;
      const pp = game.player.position;
      if (l) for (let i = 0; i < cops.length; i++) {
        const c = cops[i];
        if (sq(c.position.x - pp.x) + sq(c.position.z - pp.z) < 3600) { setWanted(2); break; }
      }
    }
  });
  ev.on('player:died', () => clear());
  ev.on('player:respawned', () => {
    clear();
    const pp = game.player?.position;
    if (!pp) return;
    const l = game.peds?.list;
    if (l) for (let i = l.length - 1; i >= 0; i--) {
      const p = l[i];
      if (p.isCop && !p.persistent && sq(p.position.x - pp.x) + sq(p.position.z - pp.z) < 10000) game.peds.remove(p);
    }
    const vs = game.vehicles?.list;
    if (vs) for (let i = vs.length - 1; i >= 0; i--) {
      const v = vs[i];
      if (v.isPolice && v.driver !== 'player' && sq(v.position.x - pp.x) + sq(v.position.z - pp.z) < 10000) game.vehicles.remove(v);
    }
  });

  // ---------- helpers ----------
  function refreshLists() {
    cops.length = 0; cars.length = 0;
    const pl = game.peds?.list;
    if (pl) for (let i = 0; i < pl.length; i++) { const p = pl[i]; if (p.isCop && p.alive) cops.push(p); }
    const vs = game.vehicles?.list;
    if (vs) for (let i = 0; i < vs.length; i++) { const v = vs[i]; if (v.isPolice && v.alive !== false && !v.destroyed) cars.push(v); }
  }

  function hasLOS(x, y, z, tx, ty, tz) {
    const w = game.world;
    if (!w?.raycast) return true;
    const dx = tx - x, dy = ty - y, dz = tz - z;
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const h = w.raycast(x, y, z, dx / l, dy / l, dz / l, l);
    return !(h && h.dist < l - 1);
  }

  function spawnCar(pl, level) {
    const vh = game.vehicles, w = game.world;
    if (!vh?.spawn || !w?.randomRoadPoint) return;
    let p = null;
    if (level >= 4 && Math.random() < 0.5 && (travX || travZ)) {
      const l = Math.hypot(travX, travZ);
      const ax = pl.position.x + (travX / l) * 120, az = pl.position.z + (travZ / l) * 120;
      p = w.randomRoadPoint(ax, az, 0, 40);
      if (p && Math.hypot(p.x - pl.position.x, p.z - pl.position.z) < 70) p = null;
      if (p) {
        // face the player
        const th = headingTo(p.x, p.z, pl.position.x, pl.position.z);
        const d = Math.sin(p.heading) * Math.sin(th) + Math.cos(p.heading) * Math.cos(th);
        if (d < 0) p.heading += Math.PI;
      }
    }
    if (!p) p = w.randomRoadPoint(pl.position.x, pl.position.z, 90, 160);
    if (!p) return;
    const car = vh.spawn('police', p.x, p.z, p.heading || 0, { ai: 'chase' });
    if (!car) return;
    if (car.ai) { car.ai.mode = 'chase'; car.ai.target = pl; }
    car.siren = true; car.driver = 'cop'; car.isPolice = true;
    car._mine = true; car._emptied = false; car._leave = false;
    car._cops = level >= 3 ? 2 : randInt(1, 2);
    car._stuckT = 0;
  }

  function dismount(car, level) {
    const n = car._cops || 1;
    const h = car.heading || 0;
    const rx = Math.cos(h), rz = -Math.sin(h);
    const off = (car.halfW || 1) + 0.9;
    for (let i = 0; i < n; i++) {
      const s = i === 0 ? -1 : 1;
      const x = car.position.x + rx * off * s;
      const z = car.position.z + rz * off * s;
      const c = game.peds.spawn(x, z, {
        type: 'cop', hostile: level >= 2, chase: true, weapon: level >= 4 ? 'smg' : 'pistol', target: game.player,
      });
      c._police = true; c.skill = 0.3 + level * 0.1;
    }
    car._emptied = true; car._cops = 0;
    car.driver = null;
    if (car.ai) { car.ai.mode = 'none'; car.ai.target = null; }
    car.siren = true;
  }

  // ---------- main update ----------
  function update(dt) {
    time += dt;
    const pl = game.player;
    if (!pl?.position) return;
    const pp = pl.position;
    // travel direction (smoothed)
    const k = Math.min(1, dt * 1.5);
    travX += ((pp.x - lastPx) / Math.max(dt, 1e-3) - travX) * k;
    travZ += ((pp.z - lastPz) / Math.max(dt, 1e-3) - travZ) * k;
    lastPx = pp.x; lastPz = pp.z;

    scanT -= dt;
    if (scanT <= 0) { scanT = 0.25; refreshLists(); }

    const level = police.wantedLevel;
    if (level === 0) {
      bustT = 0;
      patrolUpdate(dt, pl);
      sweep(dt, pl, 0);
      return;
    }
    if (pl.alive === false) return;

    const pSpeed = pl.inVehicle && pl.vehicle ? Math.abs(pl.vehicle.speed || 0) : 0;
    const pSlow = !pl.inVehicle || pSpeed < 5;

    // ---- cop behaviour ----
    let seen = false;
    for (let i = 0; i < cops.length; i++) {
      const c = cops[i];
      if (c.persistent && !c._police) continue;
      if (!c._police) c._police = true;
      c.target = pl; c.chase = true; c.leaving = false;
      c.hostile = level >= 2;
      c.noShoot = level < 2;
      c.skill = Math.min(1, 0.25 + level * 0.12);
      if (level >= 4 && c.weapon === 'pistol') c.weapon = 'smg';
      const dx = c.position.x - pp.x, dz = c.position.z - pp.z;
      const d2 = dx * dx + dz * dz;
      if (c.los && d2 < 14400) seen = true;
      // far-away foot cops are removed when the player has driven off
      if (d2 > 3600 && pl.inVehicle && pSpeed > 8) {
        c._farT = (c._farT || 0) + dt;
        if (c._farT > 5) { game.peds.remove(c); }
      } else c._farT = 0;
    }

    // ---- cars ----
    losT -= dt;
    if (losT <= 0) {
      losT = 0.4;
      seenByCar = false;
      for (let i = 0; i < cars.length && !seenByCar; i++) {
        const v = cars[i];
        if (v.driver === 'player') continue;
        const dx = v.position.x - pp.x, dz = v.position.z - pp.z;
        if (dx * dx + dz * dz > 14400) continue;
        if (hasLOS(v.position.x, 1.3, v.position.z, pp.x, (pp.y || 0) + 1.0, pp.z)) seenByCar = true;
      }
    }
    if (seenByCar) seen = true;

    let chasing = 0;
    for (let i = 0; i < cars.length; i++) {
      const v = cars[i];
      if (v.driver === 'player') continue;
      if (v._patrol && !v._mine) {
        // convert ambient patrol cars when a wanted level begins nearby
        if (sq(v.position.x - pp.x) + sq(v.position.z - pp.z) < 40000 && !v._emptied) {
          v._patrol = false; v._leave = false; v._mine = true; v._cops = v._cops || 1;
          if (v.ai) { v.ai.mode = 'chase'; v.ai.target = pl; }
          v.siren = true; v.driver = 'cop';
        }
      }
      if (!v._mine || v._emptied) continue;
      chasing++;
      if (v.ai) { v.ai.mode = 'chase'; if (!v.ai.target) v.ai.target = pl; }
      v.siren = true;
      const dx = v.position.x - pp.x, dz = v.position.z - pp.z;
      const d2 = dx * dx + dz * dz;
      const slow = Math.abs(v.speed || 0) < 3;
      if (slow && d2 < 196 && pSlow) { dismount(v, level); chasing--; continue; }
      if (slow && d2 < 1600) { v._stuckT = (v._stuckT || 0) + dt; if (v._stuckT > 4) { dismount(v, level); chasing--; } } else v._stuckT = 0;
    }

    // ---- dispatch ----
    dispatchT -= dt;
    if (dispatchT <= 0) {
      dispatchT = 2.5;
      if (chasing < CARS_BY_LEVEL[level] && cops.length < COPS_BY_LEVEL[level] + 2 && cars.length < 9) spawnCar(pl, level);
    }

    // ---- arrest (1 star) ----
    if (level === 1) {
      let adj = false;
      for (let i = 0; i < cops.length; i++) {
        const c = cops[i];
        if (sq(c.position.x - pp.x) + sq(c.position.z - pp.z) < 3.24) { adj = true; break; }
      }
      const arrestable = !pl.inVehicle || pSpeed < 2;
      if (adj && arrestable) {
        bustT += dt;
        if (bustT >= (pl.inVehicle ? 2 : 0.6)) { bustT = 0; ev.emit('player:busted'); clear(); return; }
      } else bustT = Math.max(0, bustT - dt);
    } else bustT = 0;

    // ---- escape ----
    if (seen || time - lastCrimeT < 2) {
      escapeT = 0; police.escaping = false; police.escapeProgress = 0;
    } else {
      escapeT += dt;
      const cooldown = 12 + (level - 1) * 4.5;
      police.escaping = escapeT > 1;
      police.escapeProgress = clamp(escapeT / cooldown, 0, 1);
      if (escapeT >= cooldown) {
        game.hud?.notify?.('Polisten kurtuldun!', 3000);
        clear();
        return;
      }
    }
    sweep(dt, pl, level);
  }

  function sweep(dt, pl, level) {
    sweepT -= dt;
    if (sweepT > 0) return;
    sweepT = 1;
    const vs = game.vehicles?.list;
    if (!vs) return;
    const pp = pl.position;
    for (let i = vs.length - 1; i >= 0; i--) {
      const v = vs[i];
      if (!v.isPolice || v.driver === 'player') continue;
      const d2 = sq(v.position.x - pp.x) + sq(v.position.z - pp.z);
      if (v._leave && v._emptied && d2 > 14400) game.vehicles.remove(v);
      else if (v._mine && v._emptied && d2 > 12100 && !cops.length) game.vehicles.remove(v);
      else if (v._mine && !v._emptied && d2 > 90000) game.vehicles.remove(v); // stuck far away, will be replaced
      else if (v._patrol && d2 > 160000) game.vehicles.remove(v);
    }
  }

  function patrolUpdate(dt, pl) {
    patrolT -= dt;
    if (patrolT > 0) return;
    patrolT = rand(40, 80);
    const vh = game.vehicles, w = game.world;
    if (!vh?.spawn || !w?.randomRoadPoint) return;
    let n = 0;
    for (let i = 0; i < cars.length; i++) if (cars[i]._patrol) n++;
    if (n >= 2) return;
    const p = w.randomRoadPoint(pl.position.x, pl.position.z, 100, 190);
    if (!p) return;
    const car = vh.spawn('police', p.x, p.z, p.heading || 0, { ai: 'traffic' });
    if (!car) return;
    car.siren = false; car.driver = 'cop'; car.isPolice = true;
    car._patrol = true; car._mine = false; car._cops = 1;
  }

  return police;
}
