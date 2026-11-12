// Neon Coast audio - Istanbul ambience: traffic bed by time of day, waves + gulls + ferries near water,
// tram bells in Beyoğlu, pedestrian babble, wind, night crickets and distant dogs. Synthesised; recorded loops (street traffic,
// waves, wind, crickets) are layered in once decoded and the synth beds duck to a supporting level (samples.js). Crowd babble and
// dogs stay synthesised (no safe recordings: speech must not be intelligible).
import { loopNoise, setT, rnd } from './synth.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const TAU = Math.PI * 2;

export function createAmbience(mx, game, noise, samples = null) {
  const ctx = mx.ctx;
  const G = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const bq = (type, f, q = 1) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const out = mx.buses.amb;

  // ---- city bed
  const rumble = loopNoise(ctx, noise.brown), rumbleLP = bq('lowpass', 320, 0.6), rumbleG = G(0);
  rumble.connect(rumbleLP); rumbleLP.connect(rumbleG); rumbleG.connect(out);
  const hiss = loopNoise(ctx, noise.pink), hissBP = bq('bandpass', 850, 0.35), hissG = G(0);
  hiss.connect(hissBP); hissBP.connect(hissG); hissG.connect(out);
  const hissLfo = ctx.createOscillator(); hissLfo.frequency.value = 0.07; const hissLfoG = G(0.03);
  hissLfo.connect(hissLfoG); hissLfoG.connect(hissG.gain); hissLfo.start();

  // ---- water bed (waves) with slow swell, panned toward the water
  const wave = loopNoise(ctx, noise.pink), waveLP = bq('lowpass', 900, 0.5), swell = G(0), waveG = G(0);
  const wavePan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  wave.connect(waveLP); waveLP.connect(swell); swell.connect(waveG);
  if (wavePan) { waveG.connect(wavePan); wavePan.connect(out); } else waveG.connect(out);
  const swellLfo = ctx.createOscillator(); swellLfo.frequency.value = 0.11; const swellLfoG = G(0.35);
  swell.gain.value = 0.55; swellLfo.connect(swellLfoG); swellLfoG.connect(swell.gain); swellLfo.start();
  const swell2 = ctx.createOscillator(); swell2.frequency.value = 0.27; const swell2G = G(0.12); swell2.connect(swell2G); swell2G.connect(swell.gain); swell2.start();

  // ---- wind
  const wind = loopNoise(ctx, noise.pink), windBP = bq('bandpass', 420, 0.5), windG = G(0);
  wind.connect(windBP); windBP.connect(windG); windG.connect(out);
  const gustLfo = ctx.createOscillator(); gustLfo.frequency.value = 0.09; const gustG = G(0.012); gustLfo.connect(gustG); gustG.connect(windG.gain); gustLfo.start();

  // ---- crowd babble: two voices, 3 formant bands each, retargeted syllable-like
  const babble = [];
  for (let v = 0; v < 2; v++) {
    const src = loopNoise(ctx, noise.pink), g = G(0), env = G(0.4);
    const bands = [0, 1, 2].map((i) => { const b = bq('bandpass', [500, 1500, 2600][i], 5); const bg = G([1, 0.6, 0.3][i]); src.connect(b); b.connect(bg); bg.connect(env); return b; });
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) { pan.pan.value = v ? 0.5 : -0.5; env.connect(g); g.connect(pan); pan.connect(out); } else { env.connect(g); g.connect(out); }
    babble.push({ bands, g, env, t: rnd(0, 0.2) });
  }

  // ---- crickets (carrier chirp gated by two LFOs)
  const cric = ctx.createOscillator(); cric.frequency.value = 4300;
  const cricA = G(0.5), cricB = G(0.5), cricOut = G(0);
  const l1 = ctx.createOscillator(); l1.frequency.value = 22; const l1g = G(0.5); l1.connect(l1g); l1g.connect(cricA.gain);
  const l2 = ctx.createOscillator(); l2.frequency.value = 2.4; l2.type = 'square'; const l2g = G(0.5); l2.connect(l2g); l2g.connect(cricB.gain);
  cric.connect(cricA); cricA.connect(cricB); cricB.connect(cricOut); cricOut.connect(out);
  cric.start(); l1.start(); l2.start();

  // ---- recorded beds (optional). Levels follow exactly the same envelopes as the synth beds.
  const wavePanDest = wavePan || out;
  const SL = samples ? {
    traffic: samples.loop('ambience/traffic', out), waves: samples.loop('ambience/waves', wavePanDest),
    wind: samples.loop('ambience/wind', out), crickets: samples.loop('ambience/crickets', out),
  } : null;
  const K = { traffic: 0.6, waves: 0.6, wind: 0.6, crickets: 0.6, synthKeep: 0.3 };   // sample level multipliers / synth level when a sample is live

  const S = { water: 0, dist: 400, dx: 0, dz: 0, hasDir: false, scanT: 0, peds: 0, pedT: 0, level: 0,
    tGull: 6, tFerry: 25, tBoat: 40, tTram: 20, tBark: 40, tHorn: 12, tLap: 1, district: '', distT: 0, amb: 0 };
  const DIRS = [];
  for (let i = 0; i < 8; i++) DIRS.push([Math.cos((i * TAU) / 8), Math.sin((i * TAU) / 8)]);
  const RINGS = [25, 60, 120, 220];

  function scanWater(p) {
    const w = game.world;
    let d = 400, dx = 0, dz = 0, has = false;
    if (!w) { S.dist = 400; S.water = 0; return; }
    if (w.isWater) {
      let wx = 0, wz = 0;
      let best = 400;
      for (const r of RINGS) {
        let hit = false;
        for (const [ux, uz] of DIRS) {
          if (w.isWater(p.x + ux * r, p.z + uz * r)) { wx += ux / r; wz += uz / r; hit = true; }
        }
        if (hit && best === 400) best = r;
      }
      if (best < 400) { d = best; has = true; dx = wx; dz = wz; }
      if (w.isWater(p.x, p.z)) { d = 0; }
    }
    if (typeof w.distanceToWater === 'function') {
      const dd = w.distanceToWater(p.x, p.z);
      if (Number.isFinite(dd)) d = dd;
    }
    const l = Math.hypot(dx, dz);
    S.dist = d; S.hasDir = has && l > 1e-6; S.dx = l ? dx / l : 0; S.dz = l ? dz / l : 0;
    S.water = Math.pow(clamp(1 - d / 220, 0, 1), 1.3);
  }

  const pos = { x: 0, z: 0 };
  function spawnPos(p, rMin, rMax, towardWater) {
    let a = Math.random() * TAU;
    if (towardWater && S.hasDir) a = Math.atan2(S.dz, S.dx) + rnd(-0.9, 0.9);
    const r = rnd(rMin, rMax);
    pos.x = p.x + Math.cos(a) * r; pos.z = p.z + Math.sin(a) * r;
    return pos;
  }

  function update(F) {
    const now = F.now, dt = F.dt, p = F.pos;
    const menu = F.mode === 'menu';
    if (!p || menu) {
      for (const g of [rumbleG, hissG, waveG, windG, cricOut]) setT(g.gain, 0, now, 0.3);
      if (SL) for (const l of Object.values(SL)) l.setGain(0, now, 0.3);
      for (const b of babble) setT(b.g.gain, 0, now, 0.3);
      return;
    }
    S.scanT -= dt;
    if (S.scanT <= 0) { S.scanT = 0.5; try { scanWater(p); } catch { S.water = 0; } }
    S.pedT -= dt;
    if (S.pedT <= 0) {
      S.pedT = 0.5;
      const list = game.peds?.list; let n = 0;
      if (list) for (let i = 0; i < list.length; i++) {
        const q = list[i]; if (!q || q.alive === false || !q.position) continue;
        const dx = q.position.x - p.x, dz = q.position.z - p.z;
        if (dx * dx + dz * dz < 24 * 24) n++;
      }
      S.peds = n;
    }
    S.distT -= dt;
    if (S.distT <= 0) {
      S.distT = 1.5;
      const r = game.world?.districtAt?.(p.x, p.z);
      S.district = (r && typeof r === 'object' ? (r.name || r.id || '') : String(r ?? '')).toLowerCase();
    }
    const hour = F.hour;
    const day = hour > 6.5 && hour < 19.5 ? 1 : hour > 5 && hour < 21.5 ? 0.7 : 0.4;       // traffic activity
    const night = hour >= 20 || hour < 5.5;
    const cabin = F.inVeh ? 0.45 : 1;
    const w = S.water;

    // beds
    const kT = SL && SL.traffic.ready ? K.synthKeep : 1, kW = SL && SL.waves.ready ? K.synthKeep : 1;
    const kD = SL && SL.wind.ready ? K.synthKeep : 1, kC = SL && SL.crickets.ready ? K.synthKeep : 1;
    setT(rumbleG.gain, 0.2 * (0.4 + 0.6 * day) * (1 - 0.5 * w) * cabin * kT, now, 0.6);
    setT(hissG.gain, 0.09 * day * (1 - 0.6 * w) * cabin * kT, now, 0.6);
    if (SL) SL.traffic.setGain(K.traffic * (0.4 + 0.6 * day) * (1 - 0.5 * w) * cabin, now, 0.6);
    setT(hissBP.frequency, 700 + 400 * day, now, 1);
    const near = clamp(1 - S.dist / 90, 0, 1);
    setT(waveG.gain, (0.03 + 0.34 * w) * (0.6 + 0.4 * near) * cabin * kW, now, 0.5);
    if (SL) {
      SL.waves.setGain(K.waves * (0.03 + 0.34 * w) * (0.6 + 0.4 * near) * cabin, now, 0.5);
      SL.waves.setRate(1 + 0.04 * near, now, 1);
    }
    setT(waveLP.frequency, 500 + 900 * near, now, 0.5);
    if (wavePan) setT(wavePan.pan, S.hasDir ? clamp((S.dx * mx.listener.rx + S.dz * mx.listener.rz) * 0.8, -0.8, 0.8) : 0, now, 0.4);
    const windLvl = (0.04 + 0.05 * w + 0.03 * (night ? 0 : 0.5)) * cabin * (F.speed > 20 ? 0.5 : 1);
    setT(windG.gain, windLvl * kD, now, 0.8);
    if (SL) SL.wind.setGain(K.wind * windLvl, now, 0.8);
    setT(windBP.frequency, 350 + 250 * w, now, 1);
    // crowd
    const crowd = Math.pow(clamp(S.peds / 9, 0, 1), 0.7) * 0.075 * cabin * (0.5 + 0.5 * day);
    for (const b of babble) {
      b.t -= dt;
      if (b.t <= 0) {
        b.t = rnd(0.09, 0.3);
        setT(b.bands[0].frequency, rnd(350, 750), now, 0.04);
        setT(b.bands[1].frequency, rnd(1000, 2000), now, 0.04);
        setT(b.bands[2].frequency, rnd(2100, 3200), now, 0.04);
        setT(b.env.gain, rnd(0.15, 1), now, 0.05);
      }
      setT(b.g.gain, crowd, now, 0.4);
    }
    // crickets
    const cricLvl = night ? 0.018 * (1 - w * 0.8) * (1 - clamp(F.speed / 10, 0, 1) * 0.8) * cabin : 0;
    setT(cricOut.gain, cricLvl * kC, now, 1.2);
    if (SL) SL.crickets.setGain(K.crickets * cricLvl, now, 1.2);

    // ---- scheduled one-shots
    if (!F.playing) return;
    const play = F.play;
    S.tGull -= dt;
    if (S.tGull <= 0) {
      S.tGull = rnd(4, 13) / (0.3 + w * 1.4);
      if (w > 0.12 && (!night || Math.random() < 0.2)) {
        const n = 1 + Math.floor(Math.random() * (w > 0.5 ? 4 : 2));
        const base = rnd(1450, 1900);
        for (let i = 0; i < n; i++) {
          const q = spawnPos(p, 18 + (1 - w) * 40, 70 + (1 - w) * 90, true);
          // one-shot has no delay param: stagger by scheduling via a timer list
          pending.push({ t: i * rnd(0.12, 0.7), name: 'gull', opts: { x: q.x, z: q.z, volume: rnd(0.5, 1) * (0.5 + w * 0.5), pitch: rnd(0.92, 1.1), base, calls: 1 + Math.floor(Math.random() * 3) } });
        }
      }
    }
    S.tLap -= dt;
    if (S.tLap <= 0) {
      S.tLap = rnd(0.9, 2.6);
      if (S.dist < 45) { pending.push({ t: 0, name: 'lap', opts: { volume: 0.5 + 0.5 * near } }); }
    }
    S.tFerry -= dt;
    if (S.tFerry <= 0) {
      S.tFerry = rnd(55, 120);
      if (w > 0.1) {
        const q = spawnPos(p, 250, 520, true);
        play('ferryHorn', { x: q.x, z: q.z, volume: 0.9, base: rnd(80, 115), len: rnd(1.8, 3) });
        if (Math.random() < 0.5) pending.push({ t: 3.4, name: 'ferryHorn', opts: { x: q.x, z: q.z, volume: 0.7, base: rnd(80, 115), len: 0.9 } });
      }
    }
    S.tBoat -= dt;
    if (S.tBoat <= 0) {
      S.tBoat = rnd(45, 100);
      if (w > 0.25) { const q = spawnPos(p, 90, 220, true); play('boat', { x: q.x, z: q.z, volume: 0.9 }); }
    }
    S.tTram -= dt;
    if (S.tTram <= 0) {
      S.tTram = rnd(16, 38);
      if (/beyo|taksim|galata|istiklal/.test(S.district)) { const q = spawnPos(p, 70, 160, false); play('tramBell', { x: q.x, z: q.z, volume: 0.8 }); }
    }
    S.tBark -= dt;
    if (S.tBark <= 0) {
      S.tBark = rnd(25, 70);
      if (night && w < 0.7) { const q = spawnPos(p, 60, 170, false); play('bark', { x: q.x, z: q.z, volume: rnd(0.5, 1), pitch: rnd(0.8, 1.2) }); }
    }
    S.tHorn -= dt;
    if (S.tHorn <= 0) {
      S.tHorn = rnd(9, 24) / (0.3 + day);
      if (w < 0.85 && day > 0.5) { const q = spawnPos(p, 90, 200, false); play('horn', { x: q.x, z: q.z, volume: 0.9, base: rnd(330, 470), len: rnd(0.25, 0.7) }); }
    }
    // pending (staggered) events
    for (let i = pending.length - 1; i >= 0; i--) {
      pending[i].t -= dt;
      if (pending[i].t <= 0) { const e = pending.splice(i, 1)[0]; play(e.name, e.opts); }
    }
  }
  const pending = [];

  return { update, get info() { return { water: S.water, dist: S.dist, peds: S.peds, district: S.district, hasDir: S.hasDir }; } };
}
