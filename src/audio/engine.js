// Neon Coast audio - vehicle layers: player engine (gear/RPM model), tyres, wind, skid,
// nearby AI traffic pass-bys (with Doppler), police sirens and burning-car fire bed.
import { harmonicWave, loopNoise, setT, rnd } from './synth.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
const SOUND_C = 343;

// Per vehicle type character.
const CHAR = {
  sedan:  { cyl: 4, idle: 850, max: 6200, wave: 1, diesel: 0, vol: 1, pitch: 1 },
  taxi:   { cyl: 4, idle: 800, max: 5600, wave: 1, diesel: 0.35, vol: 1, pitch: 0.97 },
  police: { cyl: 6, idle: 900, max: 6600, wave: 1, diesel: 0, vol: 1.05, pitch: 1 },
  sports: { cyl: 6, idle: 1000, max: 8200, wave: 2, diesel: 0, vol: 1.1, pitch: 1.02 },
  pickup: { cyl: 6, idle: 700, max: 4800, wave: 0, diesel: 0.75, vol: 1.1, pitch: 0.82 },
  van:    { cyl: 4, idle: 720, max: 4600, wave: 0, diesel: 0.9, vol: 1.1, pitch: 0.85 },
  bus:    { cyl: 6, idle: 600, max: 3800, wave: 0, diesel: 1, vol: 1.2, pitch: 0.62 },
};
const charOf = (v) => CHAR[v?.type] || CHAR.sedan;
const GEAR_TOPS = [0.2, 0.38, 0.58, 0.8, 1.04];

function rpmFor(speed, vmax, ch, gear) {
  const top = GEAR_TOPS[gear] * vmax;
  return ch.idle + (ch.max - ch.idle) * clamp(speed / top, 0, 1.05);
}
function gearFor(speed, vmax) {
  for (let i = 0; i < 4; i++) if (speed < GEAR_TOPS[i] * vmax * 0.95) return i;
  return 4;
}

export function createVehicleAudio(mx, game, noise) {
  const ctx = mx.ctx;
  const G = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const bq = (type, f, q = 1) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };

  // wave tables: 0 diesel/dull, 1 mid, 2 raspy
  const waves = [
    harmonicWave(ctx, 28, (k) => (k % 2 ? 1 : 0.7) / Math.pow(k, 1.7)),
    harmonicWave(ctx, 32, (k) => (k % 2 ? 1 : 0.85) / Math.pow(k, 1.25)),
    harmonicWave(ctx, 40, (k) => (1 + (k % 3 === 0 ? 0.5 : 0)) / Math.pow(k, 0.95)),
  ];

  // ---------------------------------------------------------------- player engine
  const eng = {};
  eng.out = G(0.55);
  eng.out.connect(mx.buses.veh);
  eng.inCar = bq('lowpass', 4200, 0.5); eng.inCar.connect(eng.out);
  eng.oscA = ctx.createOscillator(); eng.oscB = ctx.createOscillator(); eng.sub = ctx.createOscillator();
  eng.oscA.frequency.value = eng.oscB.frequency.value = 30; eng.sub.frequency.value = 15; eng.sub.type = 'sine';
  eng.oscB.detune.value = 7;
  const setWave = (n) => { if (waves[n]) { eng.oscA.setPeriodicWave(waves[n]); eng.oscB.setPeriodicWave(waves[n]); } else { eng.oscA.type = eng.oscB.type = 'sawtooth'; } };
  setWave(1);
  eng.mixA = G(0.5); eng.mixB = G(0.4); eng.mixS = G(0.45);
  eng.shaper = ctx.createWaveShaper();
  const sc = new Float32Array(257);
  for (let i = 0; i < 257; i++) { const x = i / 128 - 1; sc[i] = Math.tanh(x * 2.2) * 0.85; }
  eng.shaper.curve = sc;
  eng.preGain = G(1);
  eng.lpf = bq('lowpass', 1200, 1.2);
  eng.lope = G(1); eng.engGain = G(0);
  eng.oscA.connect(eng.mixA); eng.oscB.connect(eng.mixB); eng.sub.connect(eng.mixS);
  eng.mixA.connect(eng.preGain); eng.mixB.connect(eng.preGain); eng.mixS.connect(eng.preGain);
  eng.preGain.connect(eng.shaper); eng.shaper.connect(eng.lpf); eng.lpf.connect(eng.lope); eng.lope.connect(eng.engGain); eng.engGain.connect(eng.inCar);
  // idle lope (irregular combustion) modulates amplitude
  eng.lfo = ctx.createOscillator(); eng.lfo.frequency.value = 11; eng.lfoG = G(0.1);
  eng.lfo.connect(eng.lfoG); eng.lfoG.connect(eng.lope.gain);
  // intake noise
  eng.intake = loopNoise(ctx, noise.pink); eng.intakeBP = bq('bandpass', 900, 0.8); eng.intakeG = G(0);
  eng.intake.connect(eng.intakeBP); eng.intakeBP.connect(eng.intakeG); eng.intakeG.connect(eng.inCar);
  // diesel clatter: noise gated by the firing frequency
  eng.clat = loopNoise(ctx, noise.white); eng.clatBP = bq('bandpass', 1700, 1.6); eng.clatG = G(0);
  eng.clatLfo = ctx.createOscillator(); eng.clatLfo.type = 'square'; eng.clatLfo.frequency.value = 20; eng.clatDepth = G(0);
  eng.clat.connect(eng.clatBP); eng.clatBP.connect(eng.clatG); eng.clatG.connect(eng.inCar);
  eng.clatLfo.connect(eng.clatDepth); eng.clatDepth.connect(eng.clatG.gain);
  // tyres / wind / skid (outside the in-car filter: they bypass the engine path)
  eng.tyre = loopNoise(ctx, noise.pink); eng.tyreBP = bq('bandpass', 300, 0.8); eng.tyreG = G(0);
  eng.tyre.connect(eng.tyreBP); eng.tyreBP.connect(eng.tyreG); eng.tyreG.connect(eng.out);
  eng.wind = loopNoise(ctx, noise.pink); eng.windBP = bq('bandpass', 900, 0.4); eng.windG = G(0);
  eng.wind.connect(eng.windBP); eng.windBP.connect(eng.windG); eng.windG.connect(eng.out);
  eng.skid = loopNoise(ctx, noise.white); eng.skidBP = bq('bandpass', 1900, 5); eng.skidG = G(0);
  eng.skid.connect(eng.skidBP); eng.skidBP.connect(eng.skidG); eng.skidG.connect(eng.out);
  eng.sq = ctx.createOscillator(); eng.sq.type = 'sawtooth'; eng.sq.frequency.value = 1000; eng.sqBP = bq('bandpass', 1300, 9); eng.sqG = G(0);
  eng.sqLfo = ctx.createOscillator(); eng.sqLfo.frequency.value = 9; eng.sqLfoG = G(40); eng.sqLfo.connect(eng.sqLfoG); eng.sqLfoG.connect(eng.sq.frequency);
  eng.sq.connect(eng.sqBP); eng.sqBP.connect(eng.sqG); eng.sqG.connect(eng.out);
  for (const n of [eng.oscA, eng.oscB, eng.sub, eng.lfo, eng.clatLfo, eng.sq, eng.sqLfo]) n.start();

  const st = { gear: 0, rpm: 850, load: 0, shiftT: 0, charKey: '', burbleT: 0, lastLoad: 0, vol: 0, slip: 0, hadVeh: false };

  function updateEngine(F) {
    const now = F.now, dt = F.dt;
    const veh = F.veh;
    if (!veh) {
      for (const g of [eng.engGain, eng.intakeG, eng.clatG, eng.tyreG, eng.windG, eng.skidG, eng.sqG]) setT(g.gain, 0, now, 0.08);
      setT(eng.clatDepth.gain, 0, now, 0.08);
      st.hadVeh = false;
      return;
    }
    const ch = charOf(veh);
    if (st.charKey !== veh.type) { st.charKey = veh.type; setWave(ch.wave); st.rpm = ch.idle; }
    const vmax = veh.stats?.maxSpeed || 40;
    const sp = Math.abs(veh.speed || 0);
    const reverse = (veh.speed || 0) < -0.6;
    const input = F.input;
    const thr = clamp(input.moveY || 0, -1, 1);
    const gas = thr > 0.05 ? thr : 0;
    st.load += (gas - st.load) * damp(9, dt);

    // gear model with hysteresis; RPM drops on upshift
    let g = st.gear;
    if (reverse) g = 0;
    else {
      if (g < 4 && sp > GEAR_TOPS[g] * vmax * 0.96) { g++; st.shiftT = 0.2; }
      else if (g > 0 && sp < GEAR_TOPS[g - 1] * vmax * 0.8) g--;
    }
    st.gear = g;
    let target = rpmFor(sp, vmax, ch, g);
    if (sp < 3) target = Math.max(target, ch.idle + (ch.max - ch.idle) * 0.42 * gas);   // clutch slip rev
    if (!gas && sp > 3) target -= (ch.max - ch.idle) * 0.04;                            // lift-off dip
    if (st.shiftT > 0) { st.shiftT -= dt; target -= (ch.max - ch.idle) * 0.06; }
    st.rpm += (target - st.rpm) * damp(target > st.rpm ? 9 : 5, dt);
    const rr = clamp((st.rpm - ch.idle) / (ch.max - ch.idle), 0, 1);

    const f = (st.rpm / 60) * (ch.cyl / 2) * ch.pitch;
    setT(eng.oscA.frequency, f, now, 0.025);
    setT(eng.oscB.frequency, f * 1.003, now, 0.025);
    setT(eng.sub.frequency, f * 0.5, now, 0.025);
    const cut = 850 + rr * 2300 + st.load * 2000 + (ch.wave === 2 ? 600 : 0);
    setT(eng.lpf.frequency, cut, now, 0.05);
    setT(eng.lpf.Q, 1 + st.load * 1.5, now, 0.1);
    const idleness = clamp(1 - rr * 2.5, 0, 1);
    setT(eng.lfo.frequency, f * 0.5 + 3, now, 0.1);
    setT(eng.lfoG.gain, 0.08 * idleness + 0.01, now, 0.1);
    const shiftCut = st.shiftT > 0.1 ? 0.45 : 1;
    const vol = (0.11 + 0.13 * st.load + 0.05 * rr) * ch.vol * shiftCut * (st.load < 0.05 && rr > 0.3 ? 0.75 : 1);
    setT(eng.engGain.gain, vol, now, 0.04);
    setT(eng.preGain.gain, 0.8 + st.load * 0.8, now, 0.08);
    setT(eng.mixS.gain, ch.diesel > 0.5 ? 0.7 : 0.4, now, 0.2);
    // intake, diesel clatter
    setT(eng.intakeBP.frequency, 500 + st.rpm * 0.35, now, 0.06);
    setT(eng.intakeG.gain, st.load * (0.03 + 0.1 * rr), now, 0.06);
    setT(eng.clatLfo.frequency, Math.max(8, f * 0.5), now, 0.05);
    const cl = ch.diesel * (0.045 + 0.04 * st.load);
    setT(eng.clatG.gain, cl, now, 0.1);
    setT(eng.clatDepth.gain, cl, now, 0.1);

    // burble on overrun
    st.burbleT -= dt;
    if (gas < 0.05 && st.lastLoad > 0.4 && rr > 0.35) st.burbleT = Math.min(st.burbleT, 0) - 0.01;
    st.lastLoad = st.load;
    if (st.load < 0.12 && rr > 0.32 && sp > 8 && ch.diesel < 0.4 && st.burbleT <= 0 && !F.paused) {
      st.burbleT = rnd(0.09, ch.wave === 2 ? 0.2 : 0.45);
      if (Math.random() < (ch.wave === 2 ? 0.7 : 0.25)) F.play('burble', { volume: 0.4 + rr * 0.4, pitch: rnd(0.8, 1.2) });
    }
    if (st.shiftT > 0.19 && F.shiftSfx) F.play('shift', { volume: 0.5 });

    // tyres + wind
    setT(eng.tyreG.gain, Math.pow(clamp(sp / 40, 0, 1.2), 1.1) * 0.11, now, 0.1);
    setT(eng.tyreBP.frequency, 200 + sp * 16, now, 0.1);
    const w = clamp((sp - 12) / 38, 0, 1);
    setT(eng.windG.gain, w * w * 0.16, now, 0.15);
    setT(eng.windBP.frequency, 600 + sp * 22, now, 0.15);

    // skid: sideways slip, handbrake, hard braking, launch wheelspin
    const h = veh.heading || 0;
    const lat = Math.abs((veh.vx || 0) * Math.cos(h) - (veh.vz || 0) * Math.sin(h));
    let slip = clamp((lat - 2.4) / 6, 0, 1);
    if (input.handbrake && sp > 6) slip = Math.max(slip, 0.85);
    if (thr < -0.6 && sp > 18) slip = Math.max(slip, 0.35);
    if (ch.wave === 2 && gas > 0.9 && sp < 7 && sp > 0.5) slip = Math.max(slip, 0.3);
    st.slip += (slip - st.slip) * damp(slip > st.slip ? 18 : 7, dt);
    const sv = st.slip * clamp(sp / 10, 0.2, 1);
    setT(eng.skidG.gain, sv * 0.14, now, 0.04);
    setT(eng.skidBP.frequency, 1500 + sp * 25, now, 0.1);
    setT(eng.sqG.gain, sv > 0.3 ? (sv - 0.3) * 0.09 : 0, now, 0.05);
    setT(eng.sq.frequency, 850 + sp * 12 + lat * 20, now, 0.1);
    st.hadVeh = true;
  }

  // ---------------------------------------------------------------- AI traffic pass-by voices
  const N_TRAFFIC = 4;
  const traffic = [];
  for (let i = 0; i < N_TRAFFIC; i++) {
    const v = { veh: null, uid: -1 };
    v.osc = ctx.createOscillator(); v.osc.setPeriodicWave(waves[1] || waves[0]); v.osc.frequency.value = 40;
    v.sub = ctx.createOscillator(); v.sub.type = 'triangle'; v.sub.frequency.value = 20;
    v.tyre = loopNoise(ctx, noise.pink); v.tyreBP = bq('bandpass', 400, 0.7); v.tyreG = G(0);
    v.eg = G(0.5); v.sg = G(0.3);
    v.lp = bq('lowpass', 3000, 0.6); v.gain = G(0);
    v.pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    v.send = G(0.2);
    v.osc.connect(v.eg); v.sub.connect(v.sg); v.eg.connect(v.lp); v.sg.connect(v.lp);
    v.tyre.connect(v.tyreBP); v.tyreBP.connect(v.tyreG); v.tyreG.connect(v.lp);
    v.lp.connect(v.gain);
    if (v.pan) { v.gain.connect(v.pan); v.pan.connect(mx.buses.veh); v.pan.connect(v.send); } else { v.gain.connect(mx.buses.veh); v.gain.connect(v.send); }
    v.send.connect(mx.revIn);
    v.osc.start(); v.sub.start();
    traffic.push(v);
  }
  let trafficT = 0;
  const cands = [];
  function assignTraffic(F) {
    const list = game.vehicles?.list;
    cands.length = 0;
    const p = F.pos;
    if (!list || !p) return;
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (!v || v === F.veh || v.destroyed || v.removed || v.alive === false || !v.position) continue;
      const dx = v.position.x - p.x, dz = v.position.z - p.z, d2 = dx * dx + dz * dz;
      if (d2 > 90 * 90) continue;
      if (Math.abs(v.speed || 0) < 1.2 && d2 > 12 * 12) continue;
      cands.push({ v, d2 });
    }
    cands.sort((a, b) => a.d2 - b.d2);
    const keep = cands.slice(0, N_TRAFFIC);
    for (const t of traffic) {
      if (t.veh && !keep.some((k) => k.v === t.veh)) t.veh = null;
    }
    for (const k of keep) {
      if (traffic.some((t) => t.veh === k.v)) continue;
      const free = traffic.find((t) => !t.veh);
      if (free) { free.veh = k.v; free.vol = 0; }
    }
  }
  function updateTraffic(F) {
    const now = F.now;
    trafficT -= F.dt;
    if (trafficT <= 0) { trafficT = 0.25; try { assignTraffic(F); } catch { /* ignore */ } }
    for (const t of traffic) {
      const v = t.veh;
      if (!v || !F.pos || v.destroyed || v.removed) { if (t.vol > 0.0005 || v) { setT(t.gain.gain, 0, now, 0.1); t.vol = 0; } if (v && (v.destroyed || v.removed)) t.veh = null; continue; }
      const s = mx.spatial(v.position.x, v.position.z);
      const d = s.d;
      const ch = charOf(v), vmax = v.stats?.maxSpeed || 40;
      const sp = Math.abs(v.speed || 0);
      const gear = gearFor(sp, vmax);
      const rpm = rpmFor(sp, vmax, ch, gear);
      // Doppler: radial velocity (positive = receding)
      const vrad = d > 1 ? ((v.vx || 0) * s.dx + (v.vz || 0) * s.dz) / d : 0;
      const dop = clamp(SOUND_C / (SOUND_C + vrad * 1.6), 0.86, 1.16);
      const f = (rpm / 60) * (ch.cyl / 2) * ch.pitch * dop;
      setT(t.osc.frequency, f, now, 0.05);
      setT(t.sub.frequency, f * 0.5, now, 0.05);
      const moving = clamp(sp / 8, 0.25, 1);
      const vol = mx.attenuation(d, 90, 6) * 0.55 * moving * ch.vol;
      t.vol = vol;
      setT(t.gain.gain, vol, now, 0.1);
      setT(t.lp.frequency, clamp(700 + 9000 * Math.exp(-d / 45) + rpm * 0.4, 500, 9000), now, 0.1);
      setT(t.tyreG.gain, clamp(sp / 30, 0, 1) * 0.35, now, 0.15);
      setT(t.tyreBP.frequency, (180 + sp * 14) * dop, now, 0.15);
      setT(t.eg.gain, ch.diesel > 0.5 ? 0.35 : 0.5, now, 0.2);
      if (t.pan) setT(t.pan.pan, s.pan, now, 0.08);
      setT(t.send.gain, 0.12 + Math.min(0.4, d / 150), now, 0.2);
    }
  }

  // ---------------------------------------------------------------- police sirens
  const sirens = [];
  const sirenWave = harmonicWave(ctx, 16, (k) => 1 / Math.pow(k, 1.1));
  for (let i = 0; i < 2; i++) {
    const s = { veh: null, off: i * 1.7 };
    s.osc = ctx.createOscillator(); if (sirenWave) s.osc.setPeriodicWave(sirenWave); else s.osc.type = 'sawtooth';
    s.osc.frequency.value = 700;
    s.hp = bq('highpass', 450, 0.7); s.lp = bq('lowpass', 3500, 0.7); s.gain = G(0);
    s.pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    s.send = G(0.3);
    s.osc.connect(s.hp); s.hp.connect(s.lp); s.lp.connect(s.gain);
    if (s.pan) { s.gain.connect(s.pan); s.pan.connect(mx.buses.veh); s.pan.connect(s.send); } else { s.gain.connect(mx.buses.veh); s.gain.connect(s.send); }
    s.send.connect(mx.revIn);
    s.osc.start();
    sirens.push(s);
  }
  let sirenClock = 0, sirenScanT = 0;
  const sirenCands = [];
  function sirenFreq(t) {
    // alternate: wail (slow sweep) -> yelp (fast sweep) every ~9 s
    const phase = t % 18;
    let s;
    if (phase < 9) { const x = (t % 3.4) / 3.4; s = 0.5 - 0.5 * Math.cos(x * Math.PI * 2); }
    else { const x = (t % 0.34) / 0.34; s = x < 0.85 ? x / 0.85 : 1 - (x - 0.85) / 0.15 * 0.6; s = Math.pow(s, 0.9); }
    return 640 * Math.pow(2, s * 1.05);
  }
  function updateSirens(F) {
    const now = F.now;
    sirenClock += F.dt;
    sirenScanT -= F.dt;
    const p = F.pos;
    if (sirenScanT <= 0) {
      sirenScanT = 0.3;
      sirenCands.length = 0;
      const src = game.police?.cars || game.vehicles?.list;
      if (src && p) {
        for (let i = 0; i < src.length; i++) {
          const v = src[i];
          if (!v || !v.siren || v.destroyed || v.removed || v.alive === false || !v.position) continue;
          const dx = v.position.x - p.x, dz = v.position.z - p.z, d2 = dx * dx + dz * dz;
          if (d2 < 240 * 240) sirenCands.push({ v, d2 });
        }
        sirenCands.sort((a, b) => a.d2 - b.d2);
      }
      const keep = sirenCands.slice(0, sirens.length);
      for (const s of sirens) if (s.veh && !keep.some((k) => k.v === s.veh)) s.veh = null;
      for (const k of keep) if (!sirens.some((s) => s.veh === k.v)) { const fr = sirens.find((s) => !s.veh); if (fr) fr.veh = k.v; }
    }
    let nearest = 1e9;
    for (const s of sirens) {
      const v = s.veh;
      if (!v || !p || !v.position || v.siren === false || v.destroyed) { setT(s.gain.gain, 0, now, 0.12); if (v && (!v.siren || v.destroyed)) s.veh = null; continue; }
      const sp = mx.spatial(v.position.x, v.position.z);
      const d = sp.d;
      nearest = Math.min(nearest, d);
      const vrad = d > 1 ? ((v.vx || 0) * sp.dx + (v.vz || 0) * sp.dz) / d : 0;
      const dop = clamp(SOUND_C / (SOUND_C + vrad * 1.8), 0.85, 1.18);
      setT(s.osc.frequency, sirenFreq(sirenClock + s.off) * dop, now, 0.012);
      setT(s.gain.gain, mx.attenuation(d, 240, 12) * 0.34, now, 0.1);
      setT(s.lp.frequency, clamp(500 + 3600 * Math.exp(-d / 110), 500, 3600), now, 0.12);
      if (s.pan) setT(s.pan.pan, sp.pan, now, 0.08);
      setT(s.send.gain, 0.15 + Math.min(0.45, d / 200), now, 0.2);
    }
    if (nearest < 70) mx.duck(0.4 * (1 - nearest / 70), 0.2);
  }

  // ---------------------------------------------------------------- fire bed (burning cars)
  const fire = { src: loopNoise(ctx, noise.brown), lp: bq('lowpass', 900, 0.7), g: G(0), pan: ctx.createStereoPanner ? ctx.createStereoPanner() : null, t: 0, scan: 0, veh: null };
  fire.src.connect(fire.lp); fire.lp.connect(fire.g);
  if (fire.pan) { fire.g.connect(fire.pan); fire.pan.connect(mx.buses.sfx); } else fire.g.connect(mx.buses.sfx);
  function updateFire(F) {
    fire.scan -= F.dt;
    const p = F.pos, list = game.vehicles?.list;
    if (fire.scan <= 0 && list && p) {
      fire.scan = 0.5; fire.veh = null; let best = 70 * 70;
      for (let i = 0; i < list.length; i++) {
        const v = list[i];
        if (!v || !v.onFire || v.removed || !v.position) continue;
        const dx = v.position.x - p.x, dz = v.position.z - p.z, d2 = dx * dx + dz * dz;
        if (d2 < best) { best = d2; fire.veh = v; }
      }
    }
    const v = fire.veh;
    if (!v || !p || v.removed) { setT(fire.g.gain, 0, F.now, 0.2); return; }
    const s = mx.spatial(v.position.x, v.position.z);
    setT(fire.g.gain, mx.attenuation(s.d, 70, 5) * 0.22, F.now, 0.15);
    setT(fire.lp.frequency, 500 + 1400 * Math.random(), F.now, 0.05);
    if (fire.pan) setT(fire.pan.pan, s.pan, F.now, 0.1);
    fire.t -= F.dt;
    if (fire.t <= 0) { fire.t = rnd(0.07, 0.3); F.play('crackle', { x: v.position.x + rnd(-1, 1), z: v.position.z + rnd(-1, 1), volume: rnd(0.6, 1.2), pitch: rnd(0.8, 1.3) }); }
  }

  return {
    update(F) { updateEngine(F); updateTraffic(F); updateSirens(F); updateFire(F); },
    /** Horn character per vehicle: stable pseudo-random pitch from the vehicle uid and type. */
    hornParams(v) {
      const uid = v?._uid || 1;
      const typeBase = { sports: 470, bus: 230, van: 300, pickup: 310, police: 420, taxi: 390 }[v?.type] || 400;
      return { base: typeBase * (0.92 + ((uid * 37) % 17) / 17 * 0.2), len: 0.35 + ((uid * 13) % 5) * 0.06 };
    },
    get info() { return { rpm: st.rpm, gear: st.gear, load: st.load, slip: st.slip, traffic: traffic.filter((t) => t.veh).length, sirens: sirens.filter((s) => s.veh).length }; },
  };
}
