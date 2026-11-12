// Pickups (money / health / armor / weapon), static world placement and the gun shop markers.
import * as THREE from 'three';
import { seeded } from '../core/utils.js';

const ACTIVE_DIST2 = 80 * 80;
const COLORS = { money: 0x3be07a, health: 0xffffff, armor: 0x4aa8ff, weapon: 0xffc04a, shop: 0xffc04a, healthshop: 0xff5a5a };

export function createPickups(game) {
  const scene = game.scene;
  const list = [];
  const pool = {};
  let t = 0;
  let shopCooldown = 0;
  let placed = false;

  // ---- shared geometry / materials ----
  const box = new THREE.BoxGeometry(1, 1, 1);
  const ringGeo = new THREE.RingGeometry(0.55, 0.8, 24);
  ringGeo.rotateX(-Math.PI / 2);
  const basic = {};
  const bm = (c) => basic[c] || (basic[c] = new THREE.MeshBasicMaterial({ color: c }));
  const ringMats = {};
  const ringMat = (c) => ringMats[c] || (ringMats[c] = new THREE.MeshBasicMaterial({
    color: c, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  const add = (g, w, h, l, x, y, z, c) => {
    const m = new THREE.Mesh(box, bm(c));
    m.scale.set(w, h, l); m.position.set(x, y, z); g.add(m); return m;
  };

  function buildItem(type, weaponId) {
    const g = new THREE.Group();
    if (type === 'money') {
      add(g, 0.5, 0.1, 0.28, 0, -0.05, 0, 0x2fbf5a);
      const m2 = add(g, 0.5, 0.1, 0.28, 0, 0.06, 0, 0x37d066); m2.rotation.y = 0.25;
      add(g, 0.14, 0.24, 0.3, 0, 0.0, 0, 0xe8f5d0);
    } else if (type === 'health') {
      add(g, 0.46, 0.46, 0.4, 0, 0, 0, 0xf2f2f2);
      add(g, 0.1, 0.32, 0.44, 0, 0, 0, 0xe02a2a);
      add(g, 0.32, 0.1, 0.44, 0, 0, 0, 0xe02a2a);
    } else if (type === 'armor') {
      add(g, 0.5, 0.5, 0.14, 0, 0, 0, 0x2f7fe0);
      add(g, 0.36, 0.14, 0.16, 0, 0.28, 0, 0x5aa8ff);
      add(g, 0.26, 0.2, 0.16, 0, -0.3, 0, 0x2f7fe0);
      add(g, 0.12, 0.3, 0.18, 0, 0, 0, 0xcfe6ff);
    } else {
      const m = game.weapons?.cloneModel?.(weaponId);
      if (m) { m.scale.setScalar(1.5); g.add(m); }
      else add(g, 0.12, 0.14, 0.6, 0, 0, 0, 0x30343a);
    }
    return g;
  }

  function acquire(type, weaponId) {
    const key = type === 'weapon' ? 'weapon:' + weaponId : type;
    const free = pool[key];
    if (free && free.length) return free.pop();
    const root = new THREE.Group();
    const ring = new THREE.Mesh(ringGeo, ringMat(COLORS[type] || 0xffffff));
    ring.position.y = 0.06;
    const item = buildItem(type === 'healthshop' ? 'health' : type, weaponId);
    root.add(ring, item);
    root.userData = { key, ring, item };
    scene.add(root);
    return root;
  }
  function release(root) {
    root.visible = false;
    (pool[root.userData.key] || (pool[root.userData.key] = [])).push(root);
  }

  // ---- shop labels ----
  function labelSprite(text, sub) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 72;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(8,10,20,0.72)';
    g.fillRect(0, 0, 256, 72);
    g.strokeStyle = '#ffc04a'; g.lineWidth = 3; g.strokeRect(2, 2, 252, 68);
    g.textAlign = 'center';
    g.fillStyle = '#ffffff'; g.font = 'bold 26px sans-serif'; g.fillText(text, 128, 31);
    g.fillStyle = '#7dff9a'; g.font = 'bold 26px sans-serif'; g.fillText(sub, 128, 61);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    s.scale.set(2.2, 0.62, 1);
    s.position.y = 1.75;
    return s;
  }

  // ---- core API ----
  function spawn(type, x, z, opts = {}) {
    const e = {
      type, x, z, amount: opts.amount || 0, weapon: opts.weapon || null, ammo: opts.ammo || 0,
      ttl: opts.ttl || 0, respawn: opts.respawn || 0, price: opts.price || 0,
      active: true, wait: 0, phase: Math.random() * 6.28, root: null, shop: !!opts.shop,
    };
    if (type === 'money' && !e.amount) e.amount = 100;
    if (type === 'weapon' && !e.ammo) e.ammo = game.weapons?.defs?.[e.weapon]?.pack || 24;
    const root = acquire(opts.shop === 'health' ? 'healthshop' : type, e.weapon);
    root.position.set(x, 0, z);
    root.visible = true;
    root.userData.item.position.y = 0.9;
    if (opts.label) {
      const s = labelSprite(opts.label, opts.sub || '');
      root.add(s);
      e.label = s;
    }
    e.root = root;
    list.push(e);
    return e;
  }

  function remove(e) {
    const i = list.indexOf(e);
    if (i >= 0) { list[i] = list[list.length - 1]; list.pop(); }
    if (e.root) {
      if (e.label) { e.root.remove(e.label); e.label.material.map.dispose(); e.label.material.dispose(); e.label = null; }
      release(e.root); e.root = null;
    }
  }

  function collect(e) {
    const p = game.player, w = game.weapons;
    switch (e.type) {
      case 'money': game.addMoney(e.amount); break;
      case 'health': p.heal?.(50); break;
      case 'armor': p.addArmor?.(100); break;
      case 'weapon': w?.give?.(e.weapon, e.ammo); break;
    }
    game.events.emit('pickup', { type: e.type, weapon: e.weapon || undefined, amount: e.amount || e.ammo || undefined });
    if (e.respawn > 0) {
      e.active = false; e.wait = e.respawn; e.root.visible = false;
    } else remove(e);
  }

  function useShop(e) {
    const p = game.player, w = game.weapons;
    shopCooldown = 2;
    if (game.state.money < e.price) { game.hud?.notify?.('Yetersiz para'); return; }
    if (e.shop === 'health') {
      if (p.health >= 100) { shopCooldown = 0.5; return; }
      game.addMoney(-e.price);
      p.heal?.(100);
      game.hud?.notify?.('Can yenilendi');
    } else {
      game.addMoney(-e.price);
      w?.give?.(e.weapon, e.ammo);
    }
    game.events.emit('pickup', { type: 'shop', weapon: e.weapon || undefined, amount: e.price });
  }

  function update(dt) {
    t += dt;
    shopCooldown -= dt;
    const p = game.player;
    if (!p) return;
    const px = p.position.x, pz = p.position.z;
    const onFoot = p.alive && !p.inVehicle;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (!e.active) {
        e.wait -= dt;
        if (e.wait <= 0) { e.active = true; }
        continue;
      }
      if (e.ttl > 0) {
        e.ttl -= dt;
        if (e.ttl <= 0) { remove(e); continue; }
      }
      const dx = e.x - px, dz = e.z - pz;
      const d2 = dx * dx + dz * dz;
      const root = e.root;
      if (d2 > ACTIVE_DIST2) { root.visible = false; continue; }
      root.visible = e.ttl > 0 && e.ttl < 5 ? Math.sin(t * 14) > -0.3 : true;
      const u = root.userData;
      u.item.rotation.y = t * 2 + e.phase;
      u.item.position.y = 0.9 + Math.sin(t * 2.2 + e.phase) * 0.1;
      const s = 1 + Math.sin(t * 3 + e.phase) * 0.08;
      u.ring.scale.set(s, 1, s);
      if (!p.alive) continue;
      if (e.shop) {
        if (onFoot && shopCooldown <= 0 && d2 < 1.6 * 1.6) useShop(e);
        continue;
      }
      const r = e.type === 'money' && !onFoot ? 2.4 : 1.3;
      if (d2 < r * r) {
        if (e.type !== 'money' && !onFoot) continue;
        if (e.type === 'health' && p.health >= 100) continue;
        if (e.type === 'armor' && (p.armor ?? 0) >= 100) continue;
        collect(e);
      }
    }
  }

  // ---- static placement ----
  const tmp = { x: 0, z: 0, hit: false };
  function validSpot(x, z) {
    const w = game.world;
    if (!w) return false;
    if (Math.abs(x) > w.half - 15 || Math.abs(z) > w.half - 15) return false;
    if (w.isWater?.(x, z)) return false;
    if (w.isRoad?.(x, z)) return false;
    if (w.collideCircle) {
      tmp.hit = false;
      const o = w.collideCircle(x, z, 1.2, tmp);
      if (o?.hit) return false;
    }
    return true;
  }

  function placeStatic() {
    if (placed) return;
    const w = game.world;
    if (!w) return;
    placed = true;
    const rng = seeded(90210);
    const sp = w.spawnPoint || { x: 0, z: 0 };
    const respawnT = () => 180 + rng() * 120;
    const near = (cx, cz, minR, maxR) => {
      for (let k = 0; k < 24; k++) {
        const a = rng() * Math.PI * 2, r = minR + rng() * (maxR - minR);
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (validSpot(x, z)) return { x, z };
      }
      return null;
    };
    const far = (minD, maxD) => {
      for (let k = 0; k < 80; k++) {
        const x = (rng() * 2 - 1) * (w.half - 30), z = (rng() * 2 - 1) * (w.half - 30);
        const d = Math.hypot(x - sp.x, z - sp.z);
        if (d >= minD && d <= maxD && validSpot(x, z)) return { x, z };
      }
      return null;
    };
    const put = (pt, type, o) => { if (pt) spawn(type, pt.x, pt.z, { respawn: respawnT(), ...o }); };
    const lm = (id) => w.getLandmark?.(id) || w.landmarks?.find?.((l) => l.id === id || l.type === id) || null;

    // near spawn / safehouse
    put(near(sp.x, sp.z, 4, 12), 'weapon', { weapon: 'pistol', ammo: 36 });
    put(near(sp.x, sp.z, 6, 18), 'weapon', { weapon: 'bat' });
    put(near(sp.x, sp.z, 8, 20), 'money', { amount: 200 });
    // hospital / police
    const hos = lm('hospital'), pol = lm('police');
    if (hos) { put(near(hos.x, hos.z, 6, 16), 'health', {}); put(near(hos.x, hos.z, 6, 16), 'health', {}); }
    if (pol) { put(near(pol.x, pol.z, 6, 16), 'armor', {}); put(near(pol.x, pol.z, 6, 16), 'armor', {}); put(near(pol.x, pol.z, 8, 20), 'weapon', { weapon: 'pistol', ammo: 24 }); }
    // landmarks with rewards
    const pier = lm('pier'), stadium = lm('stadium'), garage = lm('garage');
    if (pier) put(near(pier.x, pier.z, 4, 14), 'weapon', { weapon: 'shotgun', ammo: 16 });
    if (stadium) put(near(stadium.x, stadium.z, 6, 20), 'weapon', { weapon: 'rifle', ammo: 60 });
    if (garage) put(near(garage.x, garage.z, 6, 16), 'weapon', { weapon: 'smg', ammo: 60 });
    // scattered, better and farther from spawn
    put(far(120, 320), 'weapon', { weapon: 'pistol', ammo: 24 });
    put(far(120, 320), 'weapon', { weapon: 'bat' });
    put(far(180, 420), 'weapon', { weapon: 'smg', ammo: 60 });
    put(far(250, 520), 'weapon', { weapon: 'smg', ammo: 60 });
    put(far(260, 520), 'weapon', { weapon: 'shotgun', ammo: 16 });
    put(far(350, 700), 'weapon', { weapon: 'rifle', ammo: 60 });
    put(far(420, 800), 'weapon', { weapon: 'sniper', ammo: 10 });
    put(far(450, 800), 'weapon', { weapon: 'rpg', ammo: 3 });
    for (let i = 0; i < 4; i++) put(far(80, 700), 'health', {});
    for (let i = 0; i < 3; i++) put(far(150, 700), 'armor', {});
    for (let i = 0; i < 5; i++) put(far(60, 700), 'money', { amount: 150 + Math.floor(rng() * 8) * 100 });

    // gun shop markers
    const shop = lm('gunshop');
    const defs = game.weapons?.defs;
    if (shop && defs) {
      const items = ['pistol', 'smg', 'shotgun', 'rifle', 'rpg'].filter((id) => defs[id]);
      const side = { x: 1, z: 0 };
      const base = { x: shop.x, z: shop.z + 4 };
      items.forEach((id, i) => {
        let x = base.x + (i - (items.length - 1) / 2) * 2.6 * side.x, z = base.z;
        if (game.world.collideCircle) {
          tmp.hit = false;
          const o = game.world.collideCircle(x, z, 0.9, tmp);
          if (o?.hit) { x = o.x; z = o.z; }
        }
        spawn('weapon', x, z, {
          shop: true, weapon: id, ammo: defs[id].pack, price: defs[id].price,
          label: defs[id].name, sub: '$' + defs[id].price,
        });
      });
    }
    const hos2 = hos;
    if (hos2) {
      const pt = near(hos2.x, hos2.z, 3, 7);
      if (pt) spawn('health', pt.x, pt.z, { shop: 'health', price: 100, label: 'Can Yenile', sub: '$100' });
    }
  }

  return {
    list,
    spawn,
    remove,
    init() { placeStatic(); },
    update(dt) {
      if (!placed && game.world) placeStatic();
      update(dt);
    },
  };
}
