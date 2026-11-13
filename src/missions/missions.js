// Neon Coast - missions: data-driven defs + small step state machines, markers, blips, save hooks.
import { clamp, dist, rand, pick } from '../core/utils.js';
import { createMarkers } from './markers.js';
import { saveGame as diskSave, loadGame as diskLoad, clearSave } from '../core/save.js';

const COL = { mission: '#ffd23f', objective: '#35e6ff', target: '#ff4057' };
const START_MONEY = 250;
const MAX_T = 14;
const MAX_BLIPS = 48;
const LM_IDS = ['safehouse', 'hospital', 'police', 'gunshop', 'garage', 'pier', 'stadium', 'docks', 'beach', 'downtown', 'park'];

const vDead = (v) => !v || v.destroyed || v.alive === false || v.health <= 0;

export function createMissions(game) {
  const events = game.events;
  const markers = createMarkers(game.THREE, game.scene, 6);

  const completed = new Set();
  const stats = { distance: 0, kills: 0, missionsFailed: 0, courierJobs: 0, moneyEarned: 0, playTime: 0 };
  const blips = [];
  const blipPool = [];
  for (let i = 0; i < MAX_BLIPS; i++) blipPool.push({ x: 0, z: 0, color: COL.mission, type: 'mission', label: '' });
  let blipN = 0;

  // reusable objective targets (current step), refilled every frame by the step
  const T = [];
  for (let i = 0; i < MAX_T; i++) T.push({ x: 0, z: 0, r: 2, type: 'objective', label: '', marker: true });
  let tn = 0;
  const addT = (x, z, r, type, label, marker = true) => {
    if (tn >= MAX_T) return;
    const t = T[tn++];
    t.x = x; t.z = z; t.r = r; t.type = type; t.label = label || ''; t.marker = marker;
  };

  let run = null;
  let time = 0;
  let placesReady = false;
  let hold = 0, lastNear = -1, warnedWanted = false;
  let autoT = 0;
  let loadedFlag = false;
  let pendingPos = null;
  let lastPx = 0, lastPz = 0, havePos = false;
  const out = { x: 0, z: 0, hit: false };

  // delayed toast queue (fixed size, no allocation while running)
  const QN = 10;
  const qT = new Array(QN).fill(-1);
  const qS = new Array(QN).fill('');
  const say = (text, delay = 0) => {
    for (let i = 0; i < QN; i++) if (qT[i] < 0) { qT[i] = delay; qS[i] = text; return; }
  };
  const notify = (t, ms) => game.hud?.notify?.(t, ms);
  const big = (t, s, ms, c) => game.hud?.showBigText?.(t, s, ms, c);
  const touch = () => !!(game.input?.usingTouch || game.isMobile);
  const wanted = () => game.police?.wantedLevel | 0;

  // ---------- world helpers (defensive) ----------
  const fbCache = {};
  function landmark(id) {
    let l = null;
    try { l = game.world?.getLandmark?.(id); } catch { /* ignore */ }
    if (l && Number.isFinite(l.x) && Number.isFinite(l.z)) return l;
    if (fbCache[id]) return fbCache[id];
    const sp = game.world?.spawnPoint || { x: 0, z: 0 };
    const idx = Math.max(0, LM_IDS.indexOf(id));
    const a = idx * 0.9 + 0.5, d = 90 + idx * 30;
    return (fbCache[id] = { id, x: sp.x + Math.cos(a) * d, z: sp.z + Math.sin(a) * d });
  }
  function roadNear(x, z) {
    const n = game.world?.roads?.nearestNode?.(x, z);
    return n ? { x: n.x, z: n.z } : { x, z };
  }
  const wet = (x, z) => { try { return !!game.world?.isWater?.(x, z); } catch { return false; } };
  // water-safe pickers: retry a few times, never accept a point in the sea / Bosphorus
  function roadPt(nx, nz, mn, mx) {
    for (let k = 0; k < 10; k++) {
      const r = game.world?.randomRoadPoint?.(nx, nz, mn, mx);
      if (r && Number.isFinite(r.x) && !wet(r.x, r.z)) return r;
    }
    let q = null;
    for (let k = 0; k < 12; k++) {
      const a = rand(0, 6.283), d = rand(mn, mx);
      q = { x: nx + Math.cos(a) * d, z: nz + Math.sin(a) * d, heading: a };
      if (!wet(q.x, q.z)) return q;
    }
    return q;
  }
  function walkPt(nx, nz, mn, mx) {
    for (let k = 0; k < 10; k++) {
      const r = game.world?.randomSidewalkPoint?.(nx, nz, mn, mx);
      if (r && Number.isFinite(r.x) && !wet(r.x, r.z)) return r;
    }
    let q = null;
    for (let k = 0; k < 12; k++) {
      const a = rand(0, 6.283), d = rand(mn, mx);
      q = { x: nx + Math.cos(a) * d, z: nz + Math.sin(a) * d };
      if (!wet(q.x, q.z)) return q;
    }
    return q;
  }
  let nodeMap = null;
  function nodeById(id) {
    const nodes = game.world?.roads?.nodes;
    if (!nodes) return null;
    if (!nodeMap) { nodeMap = new Map(); for (const n of nodes) nodeMap.set(n.id, n); }
    return nodeMap.get(id) || null;
  }

  // ---------- entity helpers (tracked for cleanup) ----------
  function spawnVeh(r, type, x, z, h, opts) {
    let v = null;
    try { v = game.vehicles?.spawn?.(type, x, z, h || 0, opts); } catch { v = null; }
    if (v) r.vehs.push(v); else r.broken = true;
    return v;
  }
  function spawnPed(r, x, z, opts) {
    let p = null;
    try { p = game.peds?.spawn?.(x, z, { persistent: true, ...opts }); } catch { p = null; }
    if (p) r.peds.push(p); else r.broken = true;
    return p;
  }
  function dropPed(r, p) {
    if (!p) return;
    const i = r.peds.indexOf(p);
    if (i >= 0) r.peds.splice(i, 1);
    try { game.peds?.remove?.(p); } catch { /* ignore */ }
  }
  function cleanup(r) {
    const pv = game.player?.vehicle;
    for (const p of r.peds) { try { game.peds?.remove?.(p); } catch { /* ignore */ } }
    r.peds.length = 0;
    for (const v of r.vehs) {
      if (v === pv) continue;
      try { game.vehicles?.remove?.(v); } catch { /* ignore */ }
    }
    r.vehs.length = 0;
  }
  function carNear(r, type, x, z, mn, mx, opts) {
    const p = roadPt(x, z, mn, mx);
    return spawnVeh(r, type, p.x, p.z, p.heading || 0, opts);
  }

  function setObj(r, text) {
    const a = missions.active;
    if (!a || a.objective === text) return;
    a.objective = text;
    events.emit('mission:objective', { text });
  }
  function setTimer(r, sec) {
    r.timer = sec;
    if (missions.active) missions.active.timer = sec;
  }

  // ---------- step builders ----------
  const keepIn = (r, dt, key, grace = 25) => {
    const p = game.player, v = r.data[key];
    if (p.inVehicle && p.vehicle === v) { r.off = 0; r.warned = false; return true; }
    r.off += dt;
    if (r.off > 8 && !r.warned) { r.warned = true; notify('Araca geri dön!', 2500); }
    if (r.off > grace) fail('Aracı terk ettin.');
    return false;
  };

  const action = (text, fn) => ({ text, enter: (r) => fn(r), update: () => true });
  const wait = (text, sec) => ({ text, enter: (r) => { r.t = 0; }, update: (r, dt) => (r.t += dt) >= sec });

  const enterVeh = (text, key, o = {}) => ({
    text,
    enter(r) { o.onEnter?.(r); },
    update(r) {
      const v = r.data[key];
      if (!v) return false;
      const p = game.player;
      addT(v.position.x, v.position.z, 2.5, 'target', o.label || 'Araç');
      if (p.inVehicle && p.vehicle === v) { o.onDone?.(r); return true; }
      return false;
    },
  });

  const goTo = (text, ptFn, rad, o = {}) => ({
    text,
    enter(r) {
      r.cur = ptFn(r); r.off = 0; r.warned = false;
      if (o.timer) setTimer(r, o.timer(r));
      o.onEnter?.(r);
    },
    update(r, dt) {
      const c = r.cur, p = game.player;
      addT(c.x, c.z, rad, 'objective', o.label || 'Hedef');
      let ok = true;
      if (o.veh) {
        const v = r.data[o.veh];
        if (!keepIn(r, dt, o.veh, o.grace)) {
          if (v) addT(v.position.x, v.position.z, 2.5, 'target', 'Araç');
          ok = false;
        }
        if (ok && o.maxSpeed != null && Math.abs(v.speed) > o.maxSpeed) ok = false;
      }
      if (o.onFoot && p.inVehicle) ok = false;
      if (o.inVehicle && !p.inVehicle) ok = false;
      if (ok && dist(p.position.x, p.position.z, c.x, c.z) < rad) { o.onDone?.(r); return true; }
      return false;
    },
  });

  // ---------- mission definitions ----------
  const DEFS = [];
  const def = (d) => { DEFS.push(d); return d; };

  def({
    id: 'first', title: 'İlk İş', giver: 'Cemile Abla', landmark: 'safehouse', after: [], reward: 200,
    description: 'İstanbul\'a cebin boş geldin. Cemile Abla\'nın Boğaz kıyısındaki çay bahçesine sür.',
    brief: ['Cemile Abla: Sen Deniz\'sin, değil mi? Cebinin boş olduğu yüzünden okunuyor.', 'Sokaktaki arabayı al, Boğaz kenarındaki çay bahçeme gel. Sana bir işim var.'],
    watch: 'car',
    build(r) {
      const sp = game.world?.spawnPoint || { x: 0, z: 0 };
      const car = carNear(r, 'sedan', sp.x, sp.z, 22, 55, { ai: 'parked', color: 0x2c6fd6 });
      r.data.car = car;
      const beach = landmark('beach');
      const dest = roadNear(beach.x, beach.z);
      return [
        enterVeh(touch() ? 'Mavi arabaya yaklaş ve araca bin düğmesine dokun.' : 'Mavi arabaya yaklaş ve F tuşuyla bin.', 'car', {
          label: 'Araba',
          onEnter: () => say(touch() ? 'Sol joystick ile yürü, sağ tarafı sürükleyerek etrafa bak.' : 'WASD ile yürü, fareyle etrafa bak, Shift ile koş.', 0.5),
        }),
        action('Tamam! Şimdi Boğaz kıyısındaki çay bahçesine sür.', () => say(touch() ? 'Gaz ve fren düğmelerini, joystick ile direksiyonu kullan.' : 'W gaz, S fren/geri, A-D direksiyon, Boşluk el freni.', 0.5)),
        goTo('Çay bahçesine sür.', () => dest, 14, { veh: 'car', label: 'Çay Bahçesi' }),
      ];
    },
  });

  def({
    id: 'cargo', title: 'Sıcak Simit', giver: 'Cemile Abla', landmark: 'beach', after: ['first'], reward: 400,
    description: 'Simit ve çay malzemesini Levent-Taksim hattına süre dolmadan, ezmeden ulaştır.',
    brief: ['Cemile Abla: Simit ve çay kolileri Levent\'teki ofislere yetişecek, müşteri sabırsız.', 'Süre kısıtlı, koliler kırılgan. Minibüsü bir yere vurma!'],
    watch: 'van', minHealth: 40, healthMsg: 'Koliler ezildi!',
    build(r) {
      const s = r.def.pos;
      const van = carNear(r, 'van', s.x, s.z, 15, 45, { ai: 'parked', color: 0xf0f0f0 });
      r.data.van = van;
      const dt = landmark('downtown');
      let dest = roadNear(dt.x, dt.z);
      if (dist(dest.x, dest.z, s.x, s.z) < 200) { const p = roadPt(s.x, s.z, 300, 480); dest = { x: p.x, z: p.z }; }
      // road distance is longer than the crow-flies one (bridges, detours): pad the estimate
      const d = dist(dest.x, dest.z, s.x, s.z);
      return [
        enterVeh('Beyaz minibüse bin ve koliler yüklensin.', 'van', { label: 'Minibüs' }),
        goTo('Kolileri Levent\'e ulaştır. Araca çarpma!', () => dest, 13, { veh: 'van', label: 'Teslimat', timer: () => Math.max(80, d / 5 + 45) }),
      ];
    },
  });

  def({
    id: 'steal', title: 'Borçlunun Arabası', giver: 'Usta Rıfat', landmark: 'garage', after: ['cargo'], reward: 700,
    description: 'Borcunu ödemeyen adamın spor arabasını sanayiye, Rıfat Usta\'nın atölyesine getir.',
    brief: ['Usta Rıfat: Şu kırmızı spor var ya, sahibi iki aydır borcunu ödemiyor.', 'Al, atölyeye getir. Polis koklarsa atlat, ama sakın çizdirme.'],
    watch: 'car', minHealth: 45, healthMsg: 'Araba fazla hasar aldı!',
    build(r) {
      const g = landmark('garage');
      const car = carNear(r, 'sports', g.x, g.z, 150, 260, { ai: 'parked', color: 0xe02030 });
      r.data.car = car;
      const dest = roadNear(g.x, g.z);
      return [
        enterVeh('Kırmızı spor arabayı bul ve al (haritada kırmızı işaret).', 'car', {
          label: 'Spor Araba',
          onDone: () => { game.police?.setWanted?.(2); notify('Alarm çaldı! Emniyet peşinde.', 3000); },
        }),
        goTo('Arabayı sanayiye götür. Polisi atlat, çizdirme!', () => dest, 13, { veh: 'car', label: 'Atölye', grace: 20 }),
      ];
    },
  });

  def({
    id: 'taxi', title: 'Sarı Taksi Vardiyası', giver: 'Telsizci Necla', landmark: 'downtown', after: ['cargo'], reward: 1000,
    description: 'Durak taksisiyle 4 yolcuyu al ve bırak. Hızlı olursan bahşiş artar.',
    brief: ['Telsizci Necla: Durakta bir şoför eksik, sarı taksi hazır.', 'Dört yolcu al, bırak. Ne kadar hızlı olursan bahşiş o kadar tatlı.'],
    watch: 'taxi',
    build(r) {
      const s = r.def.pos;
      r.data.taxi = carNear(r, 'taxi', s.x, s.z, 15, 45, { ai: 'parked' });
      r.data.last = { x: s.x, z: s.z };
      const steps = [enterVeh('Sarı taksiye bin.', 'taxi', { label: 'Taksi' })];
      for (let i = 0; i < 4; i++) {
        steps.push({
          text: `Yolcu ${i + 1}/4: Yolcuyu durakta al.`,
          enter(rr) {
            const b = rr.data.last;
            rr.cur = walkPt(b.x, b.z, 110, 230);
            rr.data.fare = spawnPed(rr, rr.cur.x, rr.cur.z, { type: 'civilian' });
            setTimer(rr, Math.max(80, dist(rr.data.taxi.position.x, rr.data.taxi.position.z, rr.cur.x, rr.cur.z) / 5 + 40)); rr.off = 0; rr.warned = false;
          },
          update(rr, dt) {
            const p = game.player, f = rr.data.fare, v = rr.data.taxi;
            if (f && f.alive === false) { fail('Yolcu öldü.'); return false; }
            const fx = f ? f.position.x : rr.cur.x, fz = f ? f.position.z : rr.cur.z;
            addT(fx, fz, 6, 'objective', 'Yolcu');
            if (!keepIn(rr, dt, 'taxi', 30)) return false;
            if (dist(v.position.x, v.position.z, fx, fz) < 8 && Math.abs(v.speed) < 7) {
              dropPed(rr, f); rr.data.fare = null;
              notify('Yolcu bindi. Kemer takıldı!', 1800);
              return true;
            }
            return false;
          },
        });
        steps.push({
          text: `Yolcu ${i + 1}/4: Yolcuyu bırak.`,
          enter(rr) {
            const v = rr.data.taxi;
            rr.cur = walkPt(v.position.x, v.position.z, 150, 320);
            const d = dist(v.position.x, v.position.z, rr.cur.x, rr.cur.z);
            setTimer(rr, d / 5 + 30); rr.off = 0; rr.warned = false;
          },
          update(rr, dt) {
            const v = rr.data.taxi;
            addT(rr.cur.x, rr.cur.z, 9, 'objective', 'Varış');
            if (!keepIn(rr, dt, 'taxi', 30)) return false;
            if (dist(v.position.x, v.position.z, rr.cur.x, rr.cur.z) < 10 && Math.abs(v.speed) < 8) {
              const tip = Math.round(clamp((rr.timer || 0) * 1.2, 0, 60));
              game.addMoney(60 + tip);
              notify(`Yolcu indi: $${60 + tip} (bahşiş $${tip})`, 2500);
              rr.data.last = { x: rr.cur.x, z: rr.cur.z };
              return true;
            }
            return false;
          },
        });
      }
      return steps;
    },
  });

  def({
    id: 'race', title: 'Gece Yarışı', giver: 'Usta Rıfat', landmark: 'stadium', after: ['steal'], reward: 1400,
    description: 'Beşiktaş\'ta, stadyum çevresindeki gece yarışında tüm kontrol noktalarını geç.',
    brief: ['Usta Rıfat: Beşiktaş\'ta gece yarışı var, bahse girdim. Direksiyondaki sensin.', 'Tüm kontrol noktalarını süre dolmadan geç. Sakın kaybetme!'],
    watch: 'car',
    build(r) {
      const s = r.def.pos;
      const car = carNear(r, 'sports', s.x, s.z, 15, 45, { ai: 'parked', color: 0xffb000 });
      r.data.car = car;
      if (car) {
        for (let i = 0; i < 2; i++) carNear(r, 'sports', car.position.x, car.position.z, 8, 30, { ai: 'traffic', color: pick([0x2255ff, 0x22cc66, 0xcc22aa]) });
      }
      const N = 11;
      return [
        enterVeh('Sarı yarış arabasına bin.', 'car', { label: 'Yarış Arabası' }),
        {
          text: `Kontrol noktası 1/${N}`,
          enter(rr) {
            const w = game.world?.roads;
            const pts = [];
            let cur = w?.nearestNode?.(car.position.x, car.position.z) || null, prev = -1;
            let px = car.position.x, pz = car.position.z, total = 0;
            for (let k = 0; k < N; k++) {
              let nx, nz;
              if (cur && cur.links && cur.links.length) {
                let cand = cur.links.filter((id) => id !== prev);
                if (!cand.length) cand = cur.links;
                const nn = nodeById(pick(cand));
                if (nn) { prev = cur.id; cur = nn; nx = nn.x; nz = nn.z; }
              }
              if (nx === undefined) { const q = roadPt(px, pz, 70, 130); nx = q.x; nz = q.z; }
              pts.push({ x: nx, z: nz });
              total += dist(px, pz, nx, nz); px = nx; pz = nz;
            }
            rr.data.cps = pts; rr.data.ci = 0; rr.off = 0; rr.warned = false;
            setTimer(rr, total / 11 + 25);
            say('Yarış başladı! Süreye yetiş.', 0);
          },
          update(rr, dt) {
            const cps = rr.data.cps, i = rr.data.ci, p = game.player;
            const c = cps[i];
            addT(c.x, c.z, 12, 'objective', `KN ${i + 1}`);
            if (i + 1 < cps.length) addT(cps[i + 1].x, cps[i + 1].z, 6, 'objective', '', false);
            if (!keepIn(rr, dt, 'car', 20)) return false;
            if (dist(p.position.x, p.position.z, c.x, c.z) < 12) {
              rr.data.ci++;
              if (rr.data.ci >= cps.length) return true;
              setTimer(rr, rr.timer + 4);
              setObj(rr, `Kontrol noktası ${rr.data.ci + 1}/${N}`);
            }
            return false;
          },
        },
      ];
    },
  });

  def({
    id: 'ambulance', title: 'Acil Sevk', giver: 'Paramedik Sedat', landmark: 'hospital', after: ['taxi'], reward: 1800,
    description: 'Üç yaralıyı süre dolmadan hastaneye yetiştir.',
    brief: ['Sedat: Trafik felç, kazalarda yaralılar var; ambulanslar sıkıştı.', 'Minibüsle yaralıları al, hastaneye getir. Her saniye değerli, dikkatli sür!'],
    watch: 'van', minHealth: 30, healthMsg: 'Araç yaralıyı taşıyamayacak kadar hasar gördü!',
    build(r) {
      const h = landmark('hospital');
      const hn = roadNear(h.x, h.z);
      r.data.van = carNear(r, 'van', h.x, h.z, 15, 45, { ai: 'parked', color: 0xffffff });
      const steps = [enterVeh('Sedat\'ın ambulans minibüsüne bin.', 'van', { label: 'Ambulans' })];
      for (let i = 0; i < 3; i++) {
        steps.push({
          text: `Yaralı ${i + 1}/3: Yaralıyı al.`,
          enter(rr) {
            rr.cur = walkPt(h.x, h.z, 130, 280);
            rr.data.pt = spawnPed(rr, rr.cur.x, rr.cur.z, { type: 'civilian' });
            const v = rr.data.van;
            setTimer(rr, dist(v.position.x, v.position.z, rr.cur.x, rr.cur.z) / 6 + 35);
            rr.off = 0; rr.warned = false;
          },
          update(rr, dt) {
            const f = rr.data.pt, v = rr.data.van;
            if (f && f.alive === false) { fail('Yaralı hayatını kaybetti.'); return false; }
            const fx = f ? f.position.x : rr.cur.x, fz = f ? f.position.z : rr.cur.z;
            addT(fx, fz, 6, 'objective', 'Yaralı');
            if (!keepIn(rr, dt, 'van', 30)) return false;
            if (dist(v.position.x, v.position.z, fx, fz) < 8 && Math.abs(v.speed) < 7) {
              dropPed(rr, f); rr.data.pt = null; notify('Yaralı yüklendi. Hastaneye!', 2000);
              return true;
            }
            return false;
          },
        });
        steps.push(goTo(`Yaralı ${i + 1}/3: Hastaneye götür.`, () => hn, 14, {
          veh: 'van', label: 'Hastane', grace: 30, maxSpeed: 12,
          timer: (rr) => dist(rr.data.van.position.x, rr.data.van.position.z, hn.x, hn.z) / 6 + 25,
          onDone: () => notify('Yaralı teslim edildi.', 2000),
        }));
      }
      return steps;
    },
  });

  def({
    id: 'gangs', title: 'Haydarpaşa Baskını', giver: 'Silahçı Memo', landmark: 'gunshop', after: ['race', 'ambulance'], reward: 2200,
    description: 'Haydarpaşa limanındaki Kızıl Yılanlar çetesinden 6 kişiyi etkisiz hale getir.',
    brief: ['Memo: Kızıl Yılanlar Haydarpaşa\'da esnafa haraç kesiyor. Sana tabanca ve SMG veriyorum.', 'Altı adamlarını temizle. Silahlıdırlar, konteynerlerin arkasına siper al!'],
    build(r) {
      const d = landmark('docks');
      const dn = { x: d.x, z: d.z };
      return [
        action('Silahlar verildi.', () => {
          game.weapons?.give?.('pistol', 90); game.weapons?.give?.('smg', 160);
          notify('Tabanca ve SMG alındı.', 2500);
        }),
        goTo('Haydarpaşa limanına git (yaya veya araçla).', () => dn, 85, {
          label: 'Haydarpaşa',
          onDone: (rr) => {
            const list = [];
            for (let i = 0; i < 6; i++) {
              const q = walkPt(d.x, d.z, 4, 34);
              const p = spawnPed(rr, q.x, q.z, { type: 'gang', hostile: true, weapon: i % 2 ? 'smg' : 'pistol' });
              if (p) list.push(p);
            }
            rr.data.gang = list;
            if (!list.length) rr.broken = true;
          },
        }),
        {
          text: 'Çete üyelerini temizle (0/6)',
          enter(rr) { rr.data.n = 0; rr.data.dead = new Array(rr.data.gang.length).fill(false); },
          update(rr) {
            const g = rr.data.gang; let alive = 0;
            for (let i = 0; i < g.length; i++) {
              const p = g[i];
              if (p.alive === false || p.health <= 0) {
                if (!rr.data.dead[i]) { rr.data.dead[i] = true; rr.data.n++; stats.kills++; }
              } else { alive++; addT(p.position.x, p.position.z, 1, 'target', 'Çete', false); }
            }
            setObj(rr, `Çete üyelerini temizle (${rr.data.n}/${g.length})`);
            return alive === 0;
          },
        },
      ];
    },
  });

  def({
    id: 'heat', title: 'Ara Sokaklar', giver: 'Cemile Abla', landmark: 'park', after: ['gangs'], reward: 3000,
    description: 'Üç yıldızlı kovalamacadan sağ çık: polis seni kaybedene kadar hayatta kal.',
    brief: ['Cemile Abla: Yılanlar seni tanıdı, polisi de peşine taktılar.', 'Üç yıldız! Arka sokaklara dal, kalabalığa karış. Yıldızlar sönene kadar dayan.'],
    build() {
      const sh = landmark('safehouse');
      return [{
        text: 'Polisten kaç! Yıldızlar sönene kadar dayan.',
        enter(r) { r.t = 0; game.police?.setWanted?.(3); },
        update(r, dt) {
          r.t += dt;
          if (r.t < 2.5 && wanted() < 3) game.police?.setWanted?.(3);
          addT(sh.x, sh.z, 0, 'objective', 'Daire', false);
          return r.t > 4 && wanted() === 0;
        },
      }];
    },
  });

  def({
    id: 'finale', title: 'Yılanların Sonu', giver: 'Cemile Abla', landmark: 'pier', after: ['heat'], reward: 5000,
    description: 'Haydarpaşa\'daki 3 çete aracını roketatarla yok et, sonra 4 yıldızlı kovalamacadan Beyoğlu\'ndaki daireye kaç.',
    brief: ['Cemile Abla: Yılanların sevkiyat araçları Haydarpaşa\'da. Al şu roketatarı.', 'Üç minibüsü havaya uçur. Sonra kaç; bütün polis arkanda olacak.'],
    build(r) {
      const d = landmark('docks');
      const sh = landmark('safehouse');
      const shn = roadNear(sh.x, sh.z);
      return [
        action('Roketatar ve tüfek verildi.', () => {
          game.weapons?.give?.('rpg', 6); game.weapons?.give?.('rifle', 90); game.weapons?.give?.('smg', 120);
          notify('Roketatar, tüfek ve SMG alındı.', 2500);
        }),
        goTo('Haydarpaşa\'ya git. Gizlice yaklaş.', () => ({ x: d.x, z: d.z }), 110, {
          label: 'Haydarpaşa',
          onDone: (rr) => {
            const vans = [], guards = [];
            for (let i = 0; i < 3; i++) {
              let q = null;
              for (let k = 0; k < 6; k++) {
                q = roadPt(d.x, d.z, 6, 55);
                let ok = true;
                for (const o of vans) if (dist(o.position.x, o.position.z, q.x, q.z) < 14) ok = false;
                if (ok) break;
              }
              const v = spawnVeh(rr, 'van', q.x, q.z, q.heading || 0, { ai: 'parked', color: 0x8b0f1c });
              if (!v) continue;
              vans.push(v);
              for (let j = 0; j < 2; j++) {
                const w = walkPt(q.x, q.z, 3, 12);
                const p = spawnPed(rr, w.x, w.z, { type: 'gang', hostile: true, weapon: j ? 'smg' : 'pistol' });
                if (p) guards.push(p);
              }
            }
            rr.data.vans = vans; rr.data.guards = guards;
          },
        }),
        {
          text: 'Çete araçlarını yok et (0/3)',
          enter() {},
          update(rr) {
            const vans = rr.data.vans; let left = 0;
            for (const v of vans) {
              if (vDead(v)) continue;
              left++; addT(v.position.x, v.position.z, 3, 'target', 'Çete Aracı');
            }
            for (const g of rr.data.guards) if (g.alive !== false && g.health > 0) addT(g.position.x, g.position.z, 1, 'target', '', false);
            setObj(rr, `Çete araçlarını yok et (${vans.length - left}/${vans.length})`);
            return left === 0;
          },
        },
        action('4 yıldız! Daireye kaç!', () => { game.police?.setWanted?.(4); big('POLİS GELİYOR', 'Beyoğlu\'ndaki daireye kaç!', 3000, '#ff4057'); }),
        goTo('Beyoğlu\'ndaki daireye kaç!', () => shn, 16, { label: 'Daire' }),
        {
          text: 'Polisi atlat: yıldızlar sönsün.',
          enter() {},
          update(rr) { addT(sh.x, sh.z, 0, 'objective', 'Daire', false); return wanted() === 0; },
        },
      ];
    },
  });

  def({
    id: 'courier', title: 'Moto Kurye İşi', giver: 'Hızlı Kurye', landmark: 'downtown', after: [], reward: 150, repeatable: true, unlockCount: 3,
    description: 'Serbest iş: paketi al, adrese zamanında teslim et. Küçük iş, küçük para.',
    brief: ['Hızlı Kurye: Bir paket var, adrese soğumadan yetişmeli.', 'Yayan ya da araçla, sen bilirsin. Trafik ağır, kısa yolları bil.'],
    build(r) {
      const p = game.player.position;
      const a = walkPt(p.x, p.z, 70, 150);
      const b = walkPt(a.x, a.z, 150, 300);
      const d = dist(a.x, a.z, b.x, b.z);
      r.reward = 120 + Math.round(d * 0.35);
      say(`Ödül: $${r.reward}`, 1);
      return [
        goTo('Paketi al.', () => a, 4, { label: 'Paket', onDone: () => notify('Paket alındı!', 1500) }),
        goTo('Paketi adrese teslim et.', () => b, 5, { label: 'Adres', timer: () => d / 4 + 35 }),
      ];
    },
  });

  const byId = {};
  for (const d of DEFS) { byId[d.id] = d; d.pos = { x: 0, z: 0 }; }

  const isAvailable = (d) => {
    if (d.repeatable) return completed.size >= d.unlockCount;
    if (completed.has(d.id)) return false;
    for (let i = 0; i < d.after.length; i++) if (!completed.has(d.after[i])) return false;
    return true;
  };

  function computePlaces() {
    const w = game.world;
    const sp = w?.spawnPoint || { x: 0, z: 0, heading: 0 };
    const placed = [];
    for (const d of DEFS) {
      let x, z;
      if (d.id === 'first') {
        const h = sp.heading || 0;
        x = sp.x + Math.sin(h) * 7; z = sp.z + Math.cos(h) * 7;
      } else {
        const l = landmark(d.landmark);
        let q = { x: l.x + 10, z: l.z + 10 };
        for (let k = 0; k < 5; k++) {
          q = walkPt(l.x, l.z, 6, 30);
          let ok = true;
          for (const o of placed) if (dist(o.x, o.z, q.x, q.z) < 10) ok = false;
          if (ok) break;
        }
        x = q.x; z = q.z;
      }
      try {
        if (w?.collideCircle) { w.collideCircle(x, z, 2, out); if (out.hit) { x = out.x; z = out.z; } }
      } catch { /* ignore */ }
      d.pos.x = x; d.pos.z = z;
      placed.push(d.pos);
    }
    placesReady = true;
  }

  // ---------- lifecycle ----------
  function enterStep() {
    const r = run;
    r.step = r.steps[r.idx];
    tn = 0; r.off = 0;
    const t = r.step.text;
    setObj(r, typeof t === 'function' ? t(r) : t);
    r.step.enter?.(r);
  }
  function advance() {
    const r = run;
    r.step?.exit?.(r);
    r.idx++;
    if (r.idx >= r.steps.length) complete();
    else enterStep();
  }

  function endRun(r) {
    cleanup(r);
    run = null; tn = 0;
    missions.active = null;
    events.emit('mission:objective', { text: null });
  }

  function complete() {
    const r = run;
    if (!r) return;
    const d = r.def, reward = r.reward;
    game.addMoney(reward);
    stats.moneyEarned += reward;
    if (d.repeatable) stats.courierJobs++; else completed.add(d.id);
    endRun(r);
    big('GÖREV TAMAMLANDI', `${d.title} · +$${reward}`, 4000, '#35e6ff');
    events.emit('mission:completed', { def: d, reward });
    diskSave(game);
    say('Oyun kaydedildi.', 2);
    if (!d.repeatable) {
      for (const o of DEFS) if (!o.repeatable && !completed.has(o.id) && isAvailable(o)) { say(`Yeni görev: ${o.title} (sarı sütun).`, 4.5); break; }
      if (completed.size === 3) say('Moto kurye işleri Levent-Taksim hattında açıldı.', 7);
    }
  }

  function fail(reason, quiet) {
    const r = run;
    if (!r) return false;
    const d = r.def;
    stats.missionsFailed++;
    endRun(r);
    if (quiet) notify(`Görev başarısız: ${reason}`, 3500);
    else big('GÖREV BAŞARISIZ', reason, 3500, '#ff4057');
    events.emit('mission:failed', { def: d, reason });
    return true;
  }

  function start(id) {
    if (run) return false;
    const d = byId[id];
    if (!d) return false;
    if (!placesReady) computePlaces();
    const r = { def: d, idx: 0, step: null, steps: null, data: {}, vehs: [], peds: [], timer: null, cur: null, off: 0, warned: false, warnedH: false, t: 0, reward: d.reward, broken: false };
    run = r; tn = 0;
    missions.active = { def: d, objective: '', timer: null };
    let steps = null;
    try { steps = d.build(r); } catch (e) { console.error('[mission build]', e); r.broken = true; }
    if (r.broken || !steps || !steps.length) {
      cleanup(r); run = null; missions.active = null;
      notify('Bu görev şu an başlatılamıyor.', 3000);
      return false;
    }
    r.steps = steps;
    events.emit('mission:started', { def: d });
    big(d.title, d.giver, 3500, '#ffd23f');
    for (let i = 0; i < d.brief.length; i++) say(d.brief[i], 1 + i * 3.2);
    enterStep();
    return true;
  }

  function updateRun(dt) {
    const r = run, p = game.player;
    tn = 0;
    if (r.timer !== null) {
      r.timer -= dt;
      if (r.timer <= 0) { missions.active.timer = 0; fail('Süre doldu!'); return; }
      missions.active.timer = r.timer;
    }
    const d = r.def;
    if (d.watch) {
      const v = r.data[d.watch];
      if (v) {
        if (vDead(v)) { fail('Araç yok edildi.'); return; }
        if (d.minHealth != null) {
          if (v.health < d.minHealth) { fail(d.healthMsg || 'Araç çok hasar aldı.'); return; }
          if (!r.warnedH && v.health < d.minHealth + 20) { r.warnedH = true; notify('Dikkat! Araç hasar alıyor.', 2500); }
        }
      }
    }
    if (p.alive === false) return;
    const s = r.step;
    if (s && s.update && s.update(r, dt)) { if (run === r) advance(); }
  }

  // ---------- idle: start markers ----------
  function updateIdle(dt) {
    const p = game.player;
    let found = -1;
    if (p.alive !== false && !p.inVehicle) {
      const px = p.position.x, pz = p.position.z;
      for (let i = 0; i < DEFS.length; i++) {
        const d = DEFS[i];
        if (!isAvailable(d)) continue;
        const dx = px - d.pos.x, dz = pz - d.pos.z;
        if (dx * dx + dz * dz < 2.7 * 2.7) { found = i; break; }
      }
    }
    if (found !== lastNear) {
      lastNear = found; hold = 0; warnedWanted = false;
      if (found >= 0) {
        const d = DEFS[found];
        notify(`${d.title} — ${d.giver} (ödül $${d.reward}). Kısa süre bekle.`, 2500);
      }
    }
    if (found >= 0) {
      if (wanted() > 0) {
        if (!warnedWanted) { warnedWanted = true; notify('Önce polisten kurtul!', 2000); }
        hold = 0;
      } else {
        hold += dt;
        if (hold >= 0.8) { hold = 0; start(DEFS[found].id); lastNear = -1; }
      }
    }
    // autosave
    autoT += dt;
    if (autoT >= 60) {
      autoT = 0;
      if (wanted() === 0 && p.alive !== false) diskSave(game);
    }
  }

  function addBlip(x, z, color, type, label) {
    if (blipN >= MAX_BLIPS) return;
    const b = blipPool[blipN];
    b.x = x; b.z = z; b.color = color; b.type = type; b.label = label;
    blips[blipN++] = b;
  }

  function render() {
    markers.begin();
    blipN = 0;
    if (run) {
      for (let i = 0; i < tn; i++) {
        const t = T[i];
        if (t.marker) markers.add(t.x, t.z, t.r, t.type === 'target' ? COL.target : COL.objective);
        addBlip(t.x, t.z, t.type === 'target' ? COL.target : COL.objective, t.type, t.label);
      }
    } else {
      for (let i = 0; i < DEFS.length; i++) {
        const d = DEFS[i];
        if (!isAvailable(d)) continue;
        markers.add(d.pos.x, d.pos.z, 2.2, COL.mission);
        addBlip(d.pos.x, d.pos.z, COL.mission, 'mission', d.title);
      }
    }
    markers.end(time);
    blips.length = blipN;
  }

  function trackStats(dt) {
    const p = game.player;
    if (!p?.position) return;
    const x = p.position.x, z = p.position.z;
    if (havePos && p.inVehicle) {
      const d = Math.hypot(x - lastPx, z - lastPz);
      if (d < 30) stats.distance += d;
    }
    lastPx = x; lastPz = z; havePos = true;
  }

  // ---------- public object ----------
  const missions = {
    list: DEFS,
    active: null,
    completed,
    blips,
    stats,
    start,
    fail: (reason) => fail(reason || 'Görev başarısız.'),
    saveGame() { return diskSave(game); },
    loadGame() {
      const ok = diskLoad(game);
      loadedFlag = ok;
      pendingPos = ok ? game._loadedPos || null : null;
      return ok;
    },
    newGame() {
      if (run) endRun(run);
      clearSave();
      completed.clear();
      for (const k in stats) stats[k] = 0;
      if (game.state) game.addMoney(START_MONEY - game.state.money);
      try { game.weapons?.reset?.(); } catch { /* ignore */ }
      try { game.police?.clear?.(); } catch { /* ignore */ }
      const sp = game.world?.spawnPoint;
      if (sp) game.player?.teleport?.(sp.x, sp.z, sp.heading || 0);
      loadedFlag = false; pendingPos = null;
      return true;
    },
    init() {
      if (!placesReady) computePlaces();
    },
    update(dt) {
      if (game.state.mode !== 'playing') return;
      const p = game.player;
      if (!p || !p.position) return;
      time += dt; stats.playTime += dt;
      if (!placesReady) computePlaces();
      for (let i = 0; i < QN; i++) {
        if (qT[i] >= 0) { qT[i] -= dt; if (qT[i] < 0) { notify(qS[i], 3500); qT[i] = -1; qS[i] = ''; } }
      }
      trackStats(dt);
      if (run) updateRun(dt); else updateIdle(dt);
      render();
    },
  };

  events.on('player:died', () => { if (run) fail('Öldün.', true); });
  events.on('player:busted', () => { if (run) fail('Tutuklandın.', true); });
  events.on('ped:died', (e) => {
    const a = e?.source?.attacker;
    if (a && a.kind === 'player') stats.kills++;
  });
  events.on('game:started', () => {
    if (loadedFlag) {
      if (pendingPos) game.player?.teleport?.(pendingPos.x, pendingPos.z, pendingPos.heading);
      pendingPos = null; loadedFlag = false;
      big('İSTANBUL', 'Tekrar hoş geldin, Deniz.', 3000);
      say('Sarı sütunlar yeni görevleri gösterir.', 3.5);
      return;
    }
    if (game.state.money === 0 && completed.size === 0) game.addMoney(START_MONEY);
    big('İSTANBUL', 'Hoş geldin, Deniz Kara.', 3500);
    say('Cebinde sadece $' + game.state.money + ' var. Boğaz\'ın iki yakasında iş bulmalısın.', 3.5);
    say('Sarı sütunun içinde durarak ilk görevi başlat. Haritada sarı nokta.', 7);
    say(touch() ? 'Sol joystick ile yürü.' : 'WASD ile yürü, Shift ile koş.', 10.5);
  });

  return missions;
}
