// Neon Coast audio - mixer: buses, shared procedural reverb, master compressor/limiter,
// camera-relative spatialisation (pan + distance + air absorption), ducking and voice cap.
import { setT } from './synth.js';

const MAX_VOICES = 24;
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

/** Procedural impulse response: early-reflection taps + exponentially decaying, progressively darker noise. */
function makeIR(ctx, seconds, rt60, preDelay, taps, darken) {
  const sr = ctx.sampleRate, len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    const pd = Math.floor(preDelay * sr);
    for (let i = pd; i < len; i++) {
      const t = (i - pd) / sr;
      const env = Math.pow(10, (-3 * t) / rt60);
      const a = Math.min(1, 0.9 - darken * t * 0.28 + 0.1); // lowpass coefficient shrinks with time
      lp += Math.max(0.04, a) * ((Math.random() * 2 - 1) - lp);
      d[i] = lp * env * (1 - Math.exp(-t * 90));
    }
    for (const [tm, g] of taps) {
      const i = Math.floor((tm + (ch ? 0.0023 : 0)) * sr);
      if (i < len) d[i] += g * (ch ? -1 : 1) * (Math.random() < 0.5 ? 1 : 0.8);
    }
  }
  return buf;
}

export function createMixer(ctx, game) {
  const G = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };

  // ---- master chain: buses -> pre -> compressor -> limiter -> soft clip -> master(volume) -> out
  const pre = G(1);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.25;
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.09;
  const clip = ctx.createWaveShaper();
  const curve = new Float32Array(2049);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / 1024) - 1, a = Math.abs(x), K = 0.75;
    const y = a < K ? a : K + (0.97 - K) * Math.tanh((a - K) / (0.97 - K));
    curve[i] = Math.sign(x) * y;
  }
  clip.curve = curve;
  const master = G(0);
  pre.connect(comp); comp.connect(lim); lim.connect(clip); clip.connect(master); master.connect(ctx.destination);

  // ---- reverb (shared): street slap + long tail
  const revIn = G(1);
  const revHP = ctx.createBiquadFilter(); revHP.type = 'highpass'; revHP.frequency.value = 180;
  revIn.connect(revHP);
  const street = ctx.createConvolver();
  street.buffer = makeIR(ctx, 0.7, 0.42, 0.004, [[0.011, 0.5], [0.019, 0.38], [0.031, 0.3], [0.047, 0.22], [0.068, 0.15]], 1.2);
  const tail = ctx.createConvolver();
  tail.buffer = makeIR(ctx, 3.2, 2.6, 0.03, [[0.05, 0.1]], 1.6);
  const streetRet = G(0.7), tailRet = G(0.55);
  revHP.connect(street); street.connect(streetRet); streetRet.connect(pre);
  revHP.connect(tail); tail.connect(tailRet); tailRet.connect(pre);

  // ---- buses
  const mkBus = (level, wet = 0) => {
    const g = G(level);
    if (wet > 0) { const s = G(wet); g.connect(s); s.connect(revIn); }
    return g;
  };
  const buses = {
    sfx: mkBus(0.9), veh: mkBus(0.8), ui: mkBus(0.8, 0.08),
    amb: G(0.8), music: G(0.7),
  };
  const ambDuck = G(1), musicDuck = G(1);
  buses.amb.connect(ambDuck); ambDuck.connect(pre);
  const ambSend = G(0.14); ambDuck.connect(ambSend); ambSend.connect(revIn);
  buses.music.connect(musicDuck); musicDuck.connect(pre);
  const musSend = G(0.1); musicDuck.connect(musSend); musSend.connect(revIn);
  buses.sfx.connect(pre); buses.veh.connect(pre); buses.ui.connect(pre);
  const vehSend = G(0.1); buses.veh.connect(vehSend); vehSend.connect(revIn);

  // ---- ducking
  let duckVal = 1, duckHold = 0;
  function duck(amount, hold = 0.25) {
    duckVal = Math.min(duckVal, 1 - Math.max(0, Math.min(0.95, amount)));
    duckHold = Math.max(duckHold, hold);
  }

  // ---- listener (camera orientation, player position)
  const L = { x: 0, z: 0, rx: 1, rz: 0, fx: 0, fz: 1 };
  function updateListener() {
    const cam = game.camera, p = game.player?.position;
    if (p) { L.x = p.x; L.z = p.z; } else if (cam?.position) { L.x = cam.position.x; L.z = cam.position.z; }
    const e = cam?.matrixWorld?.elements;
    if (e) {
      let rx = e[0], rz = e[2], fx = -e[8], fz = -e[10];
      const rl = Math.hypot(rx, rz), fl = Math.hypot(fx, fz);
      if (rl > 1e-3) { L.rx = rx / rl; L.rz = rz / rl; }
      if (fl > 1e-3) { L.fx = fx / fl; L.fz = fz / fl; }
      else { L.fx = -L.rz; L.fz = L.rx; }
    }
  }
  const S = { d: 0, pan: 0, front: 1, dx: 0, dz: 0 };
  /** Spatial parameters of a world point relative to the listener. Returns the shared object S. */
  function spatial(x, z) {
    const dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz);
    S.d = d; S.dx = dx; S.dz = dz;
    if (d < 0.5) { S.pan = 0; S.front = 1; return S; }
    S.pan = Math.max(-1, Math.min(1, (dx * L.rx + dz * L.rz) / d)) * 0.9;
    S.front = (dx * L.fx + dz * L.fz) / d;
    return S;
  }
  function attenuation(d, maxD, ref = 8) {
    if (d >= maxD) return 0;
    const f = 1 - d / maxD;
    return Math.min(1, (ref / (ref + d)) * f * f * 1.3);
  }

  // ---- voices (one-shot chains with a hard cap)
  const voices = [];
  function disposeVoice(v) {
    for (const n of v.nodes) { try { n.disconnect(); } catch { /* ignore */ } }
  }
  /**
   * Create a one-shot output chain. opts {x,z,vol,wet,bus,maxDist,pan,dur,tOffset}.
   * Returns { input, t, level, dist, pan, track(node) } or null when inaudible / voice cap rejects it.
   */
  function voice(opts) {
    const now = ctx.currentTime;
    let vol = opts.vol ?? 1, pan = opts.pan ?? 0, d = 0, front = 1;
    const positional = opts.x != null && opts.z != null;
    if (positional) {
      const s = spatial(opts.x, opts.z);
      d = s.d; pan = s.pan; front = s.front;
      vol *= attenuation(d, opts.maxDist ?? 140, opts.ref ?? 8);
    }
    if (vol < 0.003) return null;
    // voice stealing
    if (voices.length >= MAX_VOICES) {
      let idx = 0;
      for (let i = 1; i < voices.length; i++) if (voices[i].level < voices[idx].level) idx = i;
      if (voices[idx].level >= vol) return null;
      const old = voices.splice(idx, 1)[0];
      old.input.gain.cancelScheduledValues(now);
      old.input.gain.setTargetAtTime(0, now, 0.01);
      old.end = now + 0.08;
      dying.push(old);
    }
    const input = G(vol);
    const nodes = [input];
    let last = input;
    if (positional) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.Q.value = 0.5;
      lp.frequency.value = Math.max(550, 19000 * Math.exp(-d / 75)) * (front < -0.2 ? 0.7 : 1);
      last.connect(lp); last = lp; nodes.push(lp);
    }
    if (Math.abs(pan) > 0.01 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = pan;
      last.connect(p); last = p; nodes.push(p);
    }
    const bus = buses[opts.bus || 'sfx'] || buses.sfx;
    last.connect(bus);
    // reverb send: more tail the further away the source is
    const wet = (opts.wet ?? 0.18) + Math.min(0.5, d / 160);
    if (wet > 0.01) { const s = G(wet); last.connect(s); s.connect(revIn); nodes.push(s); }
    const delay = positional && opts.speedOfSound ? Math.min(0.6, d / 343) : 0;
    const v = { input, nodes, level: vol, end: now + (opts.dur ?? 1) + delay + 0.15 };
    voices.push(v);
    return { input, t: now + 0.006 + delay, level: vol, dist: d, pan, track: (n) => { nodes.push(n); return n; } };
  }
  const dying = [];

  // ---- master volume / mute
  let hiddenMute = false;
  function setHidden(h) {
    hiddenMute = h;
    try {
      if (h) { setTimeout(() => { if (hiddenMute && ctx.state === 'running') ctx.suspend().catch(() => {}); }, 250); }
      else if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch { /* ignore */ }
  }

  function update(dt) {
    const now = ctx.currentTime;
    updateListener();
    const mode = game.state?.mode;
    const target = (mode === 'paused' || hiddenMute) ? 0 : Math.max(0, Math.min(1, game.settings?.volume ?? 0.8));
    setT(master.gain, target, now, mode === 'paused' ? 0.06 : 0.12);
    if (duckHold > 0) duckHold -= dt; else duckVal += (1 - duckVal) * damp(2.2, dt);
    setT(musicDuck.gain, duckVal, now, 0.04);
    setT(ambDuck.gain, 0.35 + 0.65 * duckVal, now, 0.05);
    for (let i = voices.length - 1; i >= 0; i--) {
      if (now > voices[i].end) { disposeVoice(voices[i]); voices.splice(i, 1); }
    }
    for (let i = dying.length - 1; i >= 0; i--) {
      if (now > dying[i].end) { disposeVoice(dying[i]); dying.splice(i, 1); }
    }
  }

  return {
    ctx, master, buses, revIn, voice, spatial, attenuation, duck, update, setHidden, listener: L,
    get voiceCount() { return voices.length + dying.length; },
    maxVoices: MAX_VOICES,
  };
}
