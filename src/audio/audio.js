// Neon Coast - fully procedural WebAudio engine. Contract: docs/ARCHITECTURE.md (Audio section).
// No audio files: oscillators, a shared noise buffer, biquad filters and envelopes only.
import { clamp, lerp, damp } from '../core/utils.js';

const MAX_DIST = 120;      // one-shots are inaudible beyond this (m)
const MAX_VOICES = 16;     // polyphony limit for one-shots
const SIREN_DIST = 150;    // police sirens audible within this range (m)
const TWO_PI = Math.PI * 2;

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const hz = (f) => Math.max(20, f);

// ---------------------------------------------------------------------------
// Low-level synthesis helpers. `c` = { ctx, out, t, p (pitch), noise (shared buffer) }
// ---------------------------------------------------------------------------

/** Insert an optional biquad between `input` and `c.out`. Returns the nodes to disconnect later. */
function route(c, input, f, dur) {
  if (!f) { input.connect(c.out); return []; }
  const bq = c.ctx.createBiquadFilter();
  bq.type = f.type;
  bq.Q.value = f.q ?? 1;
  bq.frequency.setValueAtTime(hz(f.f), c.t);
  if (f.f2) bq.frequency.exponentialRampToValueAtTime(hz(f.f2), c.t + dur);
  input.connect(bq);
  bq.connect(c.out);
  return [bq];
}

/** Enveloped oscillator, optional pitch glide (f0 -> f1) and filter. */
function tone(c, type, f0, f1, dur, peak, o = {}) {
  const { ctx, t, p } = c;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(hz(f0 * p), t);
  if (f1 != null && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(hz(f1 * p), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + (o.atk ?? 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  const nodes = [osc, g, ...route(c, g, o.filter, dur)];
  osc.start(t);
  osc.stop(t + dur + 0.03);
  osc.onended = () => nodes.forEach((n) => n.disconnect());
}

/** Enveloped burst of the shared noise buffer, optional filter (with optional sweep f -> f2). */
function noiseHit(c, dur, peak, f, atk = 0.002) {
  const { ctx, t, noise } = c;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(g);
  const nodes = [src, g, ...route(c, g, f, dur)];
  const off = Math.random() * Math.max(0, noise.duration - dur - 0.05);
  src.start(t, off, dur + 0.02);
  src.onended = () => nodes.forEach((n) => n.disconnect());
}

const later = (c, dt) => ({ ...c, t: c.t + dt });

// ---------------------------------------------------------------------------
// One-shot sound recipes. gain = base level multiplied by the play() volume.
// ---------------------------------------------------------------------------
const SOUNDS = {
  pistol: { dur: 0.32, gain: 0.8, build(c) {
    noiseHit(c, 0.04, 0.9, { type: 'bandpass', f: 2200, q: 0.7 });
    tone(c, 'sine', 220, 60, 0.12, 0.5);
    noiseHit(c, 0.22, 0.22, { type: 'lowpass', f: 1200, f2: 300, q: 0.5 }, 0.01);
  } },
  smg: { dur: 0.12, gain: 0.6, build(c) {
    noiseHit(c, 0.025, 0.7, { type: 'bandpass', f: 2600, q: 1 });
    tone(c, 'square', 330, 120, 0.04, 0.12, { filter: { type: 'lowpass', f: 1200, q: 1 } });
  } },
  shotgun: { dur: 0.6, gain: 0.9, build(c) {
    noiseHit(c, 0.12, 1, { type: 'lowpass', f: 2400, f2: 700, q: 0.6 });
    tone(c, 'sine', 140, 40, 0.25, 0.8);
    noiseHit(c, 0.5, 0.25, { type: 'lowpass', f: 600, f2: 200, q: 0.5 }, 0.02);
  } },
  rifle: { dur: 0.45, gain: 0.85, build(c) {
    noiseHit(c, 0.03, 1, { type: 'bandpass', f: 1400, q: 0.6 });
    tone(c, 'triangle', 260, 90, 0.18, 0.45);
    noiseHit(c, 0.35, 0.2, { type: 'bandpass', f: 500, q: 0.5 }, 0.01);
  } },
  rpg: { dur: 1.1, gain: 0.7, build(c) {
    noiseHit(c, 0.8, 0.5, { type: 'bandpass', f: 300, f2: 1600, q: 1.2 }, 0.05);
    tone(c, 'sine', 90, 40, 0.5, 0.4);
    noiseHit(later(c, 0.6), 0.5, 0.7, { type: 'lowpass', f: 500, f2: 80, q: 0.6 }, 0.005);
  } },
  punch: { dur: 0.12, gain: 0.7, build(c) {
    noiseHit(c, 0.05, 0.6, { type: 'lowpass', f: 1200, q: 0.7 });
    tone(c, 'sine', 160, 70, 0.1, 0.5);
  } },
  explosion: { dur: 1.6, gain: 0.9, build(c) {
    noiseHit(c, 0.3, 0.6, { type: 'highpass', f: 2000, q: 0.7 });
    noiseHit(c, 1.6, 1, { type: 'lowpass', f: 1400, f2: 120, q: 0.7 }, 0.01);
    tone(c, 'sine', 70, 28, 1.4, 0.9);
  } },
  crash: { dur: 0.4, gain: 0.8, build(c) {
    noiseHit(c, 0.35, 0.8, { type: 'bandpass', f: 500, f2: 200, q: 0.8 });
    tone(c, 'sine', 110, 45, 0.3, 0.7);
    noiseHit(c, 0.08, 0.5, { type: 'highpass', f: 3000, q: 0.7 });
  } },
  glass: { dur: 0.6, gain: 0.8, build(c) {
    noiseHit(c, 0.15, 0.35, { type: 'highpass', f: 6000, q: 0.7 });
    [2400, 3100, 3900, 5200, 6100].forEach((f, i) => tone(
      later(c, i * 0.035 + Math.random() * 0.02), 'sine',
      f * (0.97 + Math.random() * 0.06), null, 0.25 + Math.random() * 0.25, 0.12));
  } },
  pickup: { dur: 0.3, gain: 0.6, build(c) {
    tone(c, 'sine', 660, null, 0.12, 0.4);
    tone(later(c, 0.07), 'sine', 990, null, 0.18, 0.4);
  } },
  money: { dur: 0.35, gain: 0.6, build(c) {
    tone(c, 'sine', 1320, null, 0.1, 0.35);
    tone(later(c, 0.06), 'sine', 1760, null, 0.25, 0.35);
  } },
  click: { dur: 0.05, gain: 0.6, build(c) {
    tone(c, 'square', 1800, null, 0.02, 0.2, { filter: { type: 'lowpass', f: 4000, q: 1 } });
    noiseHit(c, 0.01, 0.2, { type: 'highpass', f: 3000, q: 0.7 });
  } },
  missionStart: { dur: 0.7, gain: 0.7, build(c) {
    [523, 659, 784, 1047].forEach((f, i) => tone(later(c, i * 0.12), 'triangle', f, null, 0.3, 0.3));
  } },
  missionComplete: { dur: 1.5, gain: 0.7, build(c) {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(later(c, i * 0.09), 'triangle', f, null, 0.25, 0.3));
    [1047, 1319, 1568].forEach((f) => tone(later(c, 0.5), 'sine', f, null, 0.9, 0.18));
  } },
  missionFail: { dur: 0.9, gain: 0.7, build(c) {
    [440, 370, 311, 262].forEach((f, i) => tone(later(c, i * 0.18), 'sawtooth', f, null, 0.22, 0.22,
      { filter: { type: 'lowpass', f: 1200, q: 1 } }));
  } },
  wantedUp: { dur: 0.45, gain: 0.7, build(c) {
    tone(c, 'square', 520, 1040, 0.22, 0.18, { filter: { type: 'lowpass', f: 2200, q: 1 } });
    tone(later(c, 0.2), 'square', 780, 1560, 0.22, 0.14, { filter: { type: 'lowpass', f: 2200, q: 1 } });
  } },
  wantedClear: { dur: 0.5, gain: 0.7, build(c) {
    tone(c, 'triangle', 880, 440, 0.25, 0.3);
    tone(later(c, 0.22), 'triangle', 660, 330, 0.25, 0.25);
  } },
  horn: { dur: 0.6, gain: 0.6, build(c) {
    const filter = { type: 'lowpass', f: 1800, q: 1 };
    tone(c, 'sawtooth', 370, null, 0.55, 0.18, { filter });
    tone(c, 'sawtooth', 466, null, 0.55, 0.18, { filter });
  } },
  death: { dur: 1.7, gain: 0.8, build(c) {
    tone(c, 'sine', 220, 35, 1.6, 0.6);
    noiseHit(c, 1.2, 0.3, { type: 'lowpass', f: 600, f2: 150, q: 0.6 }, 0.02);
  } },
  reload: { dur: 0.5, gain: 0.6, build(c) {
    tone(c, 'square', 1600, null, 0.015, 0.15);
    noiseHit(c, 0.02, 0.4, { type: 'highpass', f: 2500, q: 0.7 });
    tone(later(c, 0.35), 'square', 1100, null, 0.02, 0.2);
    noiseHit(later(c, 0.35), 0.04, 0.35, { type: 'bandpass', f: 1200, q: 1 });
  } },
  hit: { dur: 0.15, gain: 0.7, build(c) {
    tone(c, 'sine', 200, 90, 0.12, 0.5);
    noiseHit(c, 0.06, 0.5, { type: 'bandpass', f: 900, q: 1 });
  } },
  jump: { dur: 0.3, gain: 0.5, build(c) {
    noiseHit(c, 0.25, 0.25, { type: 'bandpass', f: 800, f2: 1800, q: 0.8 });
    tone(c, 'sine', 260, 420, 0.12, 0.12);
  } },
  door: { dur: 0.25, gain: 0.7, build(c) {
    noiseHit(c, 0.12, 0.5, { type: 'lowpass', f: 900, f2: 300, q: 0.7 });
    tone(c, 'sine', 110, 60, 0.18, 0.5);
  } },
  empty: { dur: 0.06, gain: 0.6, build(c) {
    tone(c, 'square', 900, null, 0.02, 0.25, { filter: { type: 'lowpass', f: 1600, q: 1 } });
    noiseHit(c, 0.02, 0.3, { type: 'highpass', f: 4000, q: 0.7 });
  } },
  footstep: { dur: 0.05, gain: 0.5, build(c) {
    noiseHit(c, 0.035, 0.5, { type: 'bandpass', f: 900, q: 1.5 });
  } },
  gull: { dur: 0.3, gain: 0.7, build(c) {
    tone(c, 'sine', 1900, 2500, 0.12, 0.12);
    tone(later(c, 0.12), 'sine', 2500, 2000, 0.14, 0.12);
  } },
};

const WEAPON_SOUND = { pistol: 'pistol', smg: 'smg', shotgun: 'shotgun', rifle: 'rifle', rpg: 'rpg', fist: 'punch', bat: 'punch' };

// Generative radio stations. Chords are MIDI notes, bass = root MIDI per bar.
const STATIONS = [
  {
    name: 'Palmera FM', bpm: 108,
    chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], // Am F C G
    bass: [45, 41, 36, 43], bassType: 'sawtooth', padType: 'sawtooth', arpType: 'triangle', arp: true,
    kick: [0, 4, 8, 12], snare: true, hats: [0, 2, 4, 6, 8, 10, 12, 14], hatVol: 0.035,
  },
  {
    name: 'Gece Dalgası', bpm: 100,
    chords: [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]], // Dm Bb F C
    bass: [38, 34, 41, 36], bassType: 'square', padType: 'triangle', arpType: 'sawtooth', arp: true,
    kick: [0, 8, 10], snare: true, hats: [2, 6, 10, 14], hatVol: 0.05,
  },
];

export function createAudio(game) {
  let ctx = null;
  let dead = false;
  let noiseBuf = null;
  let master, comp, sfxBus;
  let engSaw, engSq, engFilter, engGain;
  let scrGain, scrFilter, sirenOsc, sirenFilter, sirenGain, sirenPan;
  let cityFilter, cityGain, oceanFilter, oceanGain;
  let radioBus, radioLP;
  let tmpDir = null;

  const memo = new Map();          // param key -> last target (skip redundant automation)
  const voices = [];               // live one-shots { name, level, end, vg, pan }
  const dying = [];                // faded-out voice nodes waiting to be disconnected
  const lastFired = Object.create(null);
  let warned = false;

  const st = {
    night: 1,
    gull: 6,
    foot: { x: null, z: null, speed: 0, phase: 0 },
    radio: { station: 0, running: false, next: 0, step: 0, offT: 0 },
  };

  const warn = (e) => { if (!warned) { warned = true; console.warn('[audio]', e); } };
  const ok = (key, ms) => {
    const now = performance.now();
    if (lastFired[key] !== undefined && now - lastFired[key] < ms) return false;
    lastFired[key] = now;
    return true;
  };

  // ---- graph ----------------------------------------------------------------
  const mkGain = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const mkFilter = (type, f, q = 1) => {
    const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b;
  };
  const loopNoise = () => {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf; s.loop = true;
    s.start(0, Math.random() * noiseBuf.duration * 0.9);
    return s;
  };

  function buildGraph() {
    const sr = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, sr * 2, sr);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    master = mkGain(0);
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 18; comp.ratio.value = 5;
    comp.attack.value = 0.005; comp.release.value = 0.2;
    master.connect(comp);
    comp.connect(ctx.destination);

    sfxBus = mkGain(1);
    sfxBus.connect(master);

    // Engine: sawtooth + sub square through a lowpass.
    engFilter = mkFilter('lowpass', 350, 0.8);
    engGain = mkGain(0);
    engFilter.connect(engGain); engGain.connect(master);
    const sawG = mkGain(0.35), sqG = mkGain(0.2);
    engSaw = ctx.createOscillator(); engSaw.type = 'sawtooth';
    engSq = ctx.createOscillator(); engSq.type = 'square';
    engSaw.connect(sawG); sawG.connect(engFilter);
    engSq.connect(sqG); sqG.connect(engFilter);
    engSaw.frequency.value = 55; engSq.frequency.value = 27;
    engSaw.start(); engSq.start();

    // Tyre screech.
    scrFilter = mkFilter('bandpass', 1700, 2.5);
    scrGain = mkGain(0);
    loopNoise().connect(scrFilter); scrFilter.connect(scrGain); scrGain.connect(master);

    // Police siren: wailing sawtooth, mono-ish with a stereo panner.
    sirenOsc = ctx.createOscillator(); sirenOsc.type = 'sawtooth'; sirenOsc.frequency.value = 780;
    sirenFilter = mkFilter('lowpass', 1500, 0.7);
    sirenGain = mkGain(0);
    sirenPan = ctx.createStereoPanner ? ctx.createStereoPanner() : mkGain(1);
    sirenOsc.connect(sirenFilter); sirenFilter.connect(sirenGain);
    sirenGain.connect(sirenPan); sirenPan.connect(master);
    sirenOsc.start();

    // Ambient bed: city hum and ocean (ocean fades in toward the east coast).
    cityFilter = mkFilter('lowpass', 420, 0.7);
    cityGain = mkGain(0);
    loopNoise().connect(cityFilter); cityFilter.connect(cityGain); cityGain.connect(master);
    oceanFilter = mkFilter('bandpass', 650, 0.5);
    oceanGain = mkGain(0);
    loopNoise().connect(oceanFilter); oceanFilter.connect(oceanGain); oceanGain.connect(master);

    // Radio: "inside the car" low-passed bus.
    radioBus = mkGain(0);
    radioLP = mkFilter('lowpass', 2200, 0.7);
    radioBus.connect(radioLP); radioLP.connect(master);
  }

  /** Create the AudioContext (only ever from a user gesture). Failures disable audio silently. */
  function ensureCtx() {
    if (ctx || dead) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { dead = true; return null; }
      ctx = new AC();
      buildGraph();
    } catch (e) {
      dead = true; ctx = null; warn(e);
    }
    return ctx;
  }

  const onGesture = () => {
    try {
      if (!ctx) ensureCtx();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch (e) { warn(e); }
  };

  /** Smoothed AudioParam write; skips redundant targets. */
  function setP(param, key, target, tau) {
    const prev = memo.get(key);
    if (prev !== undefined && Math.abs(prev - target) < 1e-4) return;
    memo.set(key, target);
    param.setTargetAtTime(target, ctx.currentTime, tau);
  }

  // ---- spatialisation -------------------------------------------------------
  /** Stereo pan (-1..1) of a point relative to the player, using the camera's right vector. */
  function panFor(dx, dz) {
    const cam = game.camera, THREE = game.THREE;
    if (!cam || !THREE) return 0;
    if (!tmpDir) tmpDir = new THREE.Vector3();
    cam.getWorldDirection(tmpDir);
    const fl = Math.hypot(tmpDir.x, tmpDir.z) || 1;
    const fx = tmpDir.x / fl, fz = tmpDir.z / fl;
    const rx = -fz, rz = fx;           // right = forward x up
    const len = Math.hypot(dx, dz) || 1;
    return clamp((dx * rx + dz * rz) / len, -1, 1) * 0.85;
  }

  function spatial(x, z) {
    const p = game.player?.position;
    if (!p) return { atten: 1, pan: 0 };
    const dx = x - p.x, dz = z - p.z;
    const d = Math.hypot(dx, dz);
    if (d >= MAX_DIST) return null;
    const a = 1 - d / MAX_DIST;
    return { atten: a * a, pan: panFor(dx, dz) };
  }

  // ---- voices ---------------------------------------------------------------
  function fadeOutVoice(v, now) {
    v.vg.gain.setTargetAtTime(0, now, 0.01);
    dying.push({ vg: v.vg, pan: v.pan, end: now + 0.1 });
  }

  /** Make room for a new voice of `level`. Drops the new sound if it is the quietest. */
  function reserve(level, now) {
    if (voices.length < MAX_VOICES) return true;
    let idx = 0;
    for (let i = 1; i < voices.length; i++) if (voices[i].level < voices[idx].level) idx = i;
    if (voices[idx].level >= level) return false;
    fadeOutVoice(voices.splice(idx, 1)[0], now);
    return true;
  }

  /**
   * Play a named one-shot. opts: { x, z, volume=1, pitch=1 }.
   * Positional when x and z are given (attenuated to 0 at 120 m, panned relative to the camera);
   * otherwise a non-positional UI sound. Safe no-op before the first user gesture.
   */
  function play(name, opts = {}) {
    try {
      if (!ctx || dead) return;
      const def = SOUNDS[name];
      if (!def) return;
      let atten = 1, pan = 0;
      if (opts.x != null && opts.z != null) {
        const s = spatial(opts.x, opts.z);
        if (!s) return;
        atten = s.atten; pan = s.pan;
      }
      const level = (opts.volume ?? 1) * atten * (def.gain ?? 0.7);
      if (level < 0.002) return;
      if (ctx.state !== 'running') return;
      const now = ctx.currentTime;
      if (!reserve(level, now)) return;

      const vg = ctx.createGain();
      vg.gain.value = level;
      let pannerNode = null;
      if (pan !== 0 && ctx.createStereoPanner) {
        pannerNode = ctx.createStereoPanner();
        pannerNode.pan.value = pan;
        vg.connect(pannerNode); pannerNode.connect(sfxBus);
      } else {
        vg.connect(sfxBus);
      }
      def.build({ ctx, out: vg, t: now + 0.005, p: opts.pitch ?? 1, noise: noiseBuf });
      voices.push({ name, level, end: now + def.dur + 0.1, vg, pan: pannerNode });
    } catch (e) { warn(e); }
  }

  // ---- radio ----------------------------------------------------------------
  function scheduleStep(s, step, t, stepDur) {
    const c = { ctx, out: radioBus, t, p: 1, noise: noiseBuf };
    const s16 = step & 15, bar = (step >> 4) & 3;
    const chord = s.chords[bar];
    if (s.kick.includes(s16)) tone(c, 'sine', 150, 42, 0.2, 0.55, { atk: 0.001 });
    if (s.snare && (s16 === 4 || s16 === 12)) {
      noiseHit(c, 0.14, 0.26, { type: 'bandpass', f: 1700, q: 0.9 });
      tone(c, 'triangle', 190, 160, 0.09, 0.2);
    }
    if (s.hats.includes(s16)) noiseHit(c, 0.03, s.hatVol, { type: 'highpass', f: 7000, q: 0.7 });
    if ((s16 & 1) === 0) {
      const off = [0, 0, 12, 0][(s16 >> 1) & 3];
      tone(c, s.bassType, mtof(s.bass[bar] + off), null, stepDur * 1.8, 0.14,
        { filter: { type: 'lowpass', f: 480, q: 4 } });
    }
    if (s16 === 0) {
      for (const n of chord) tone(c, s.padType, mtof(n), null, stepDur * 16, 0.03,
        { atk: 0.35, filter: { type: 'lowpass', f: 900, q: 0.7 } });
    }
    if (s.arp) {
      tone(c, s.arpType, mtof(chord[(s16 + bar) % 3] + 12), null, stepDur * 0.9, 0.05,
        { filter: { type: 'lowpass', f: 2600, q: 0.7 } });
    }
  }

  function toggleRadio() {
    st.radio.station = (st.radio.station + 1) % (STATIONS.length + 1);
    const label = st.radio.station
      ? `Radyo: Açık — ${STATIONS[st.radio.station - 1].name}`
      : 'Radyo: Kapalı';
    game.hud?.notify?.(label, 1800);
  }

  // ---- per-frame --------------------------------------------------------------
  function tick(dt) {
    const now = ctx.currentTime;
    const mode = game.state?.mode;
    const playing = mode === 'playing';
    const hidden = typeof document !== 'undefined' && document.hidden;
    const player = game.player;
    const pos = player?.position;
    const inVeh = !!(player?.inVehicle && player.vehicle);
    const veh = inVeh ? player.vehicle : null;
    const input = game.input || {};
    const throttle = Math.abs(input.moveY || 0);
    const steer = Math.abs(input.moveX || 0);
    const speed = Math.abs(veh?.speed || 0);

    // Master: settings volume, muted while paused or hidden.
    const mTarget = (mode !== 'paused' && !hidden) ? (game.settings?.volume ?? 0.8) : 0;
    setP(master.gain, 'master', mTarget, 0.12);

    // Engine: fake gears - each gear sweeps the sawtooth up, the drop at the boundary reads as a shift.
    const gear = Math.min(4, Math.floor(speed / 9));
    const frac = clamp((speed - gear * 9) / 9, 0, 1);
    const eF = inVeh ? 55 + 165 * frac + 20 * throttle : 55;
    setP(engSaw.frequency, 'engF', eF, 0.06);
    setP(engSq.frequency, 'engSqF', eF * 0.5, 0.06);
    setP(engFilter.frequency, 'engLP', 350 + 900 * throttle + 200 * frac, 0.1);
    setP(engGain.gain, 'engVol',
      inVeh ? 0.05 + 0.09 * throttle + 0.03 * Math.min(1, speed / 40) : 0,
      inVeh ? 0.08 : 0.2);

    // Tyre screech: handbrake at speed, or hard steering at high speed.
    const screech = inVeh && speed > 8 && (input.handbrake || (steer > 0.85 && speed > 20));
    setP(scrGain.gain, 'scr', screech ? 0.1 + 0.04 * Math.min(1, speed / 30) : 0, screech ? 0.04 : 0.15);
    setP(scrFilter.frequency, 'scrF', 1400 + 600 * Math.min(1, speed / 30), 0.1);

    // Sirens: nearest siren car within range drives a single wailing voice.
    let nearest = Infinity, sirenCar = null;
    const cars = game.police?.cars;
    if (pos && cars) {
      for (const car of cars) {
        if (!car?.siren || car.alive === false || !car.position) continue;
        const d = Math.hypot(car.position.x - pos.x, car.position.z - pos.z);
        if (d < nearest) { nearest = d; sirenCar = car; }
      }
    }
    const sirenOn = nearest <= SIREN_DIST;
    setP(sirenGain.gain, 'siren', sirenOn ? 0.09 * Math.pow(1 - nearest / SIREN_DIST, 1.2) : 0, 0.15);
    if (sirenOn) {
      setP(sirenOsc.frequency, 'sirenF', 780 + 230 * Math.sin(now * TWO_PI * 0.5), 0.02);
      if (sirenPan.pan) sirenPan.pan.setTargetAtTime(panFor(sirenCar.position.x - pos.x, sirenCar.position.z - pos.z), now, 0.1);
    }

    // Ambient bed: quieter at night, ocean grows toward the east coast (x > 400).
    const hour = game.state?.timeOfDay ?? 12;
    const nightT = (hour < 5.5 || hour > 20) ? 0.55 : 1;
    st.night = lerp(st.night, nightT, damp(0.5, dt));
    const x = pos?.x ?? 0;
    const oceanLevel = clamp((x - 350) / 120, 0, 1);
    setP(cityGain.gain, 'city', 0.05 * st.night * (inVeh ? 0.5 : 1), 0.5);
    const waves = 0.55 + 0.45 * Math.sin(now * 0.8);
    setP(oceanGain.gain, 'ocean', 0.12 * oceanLevel * st.night * waves, 0.3);
    setP(oceanFilter.frequency, 'oceanF', 500 + 300 * waves, 0.5);

    // Seagull chirps near the sea.
    st.gull -= dt;
    if (st.gull <= 0) {
      st.gull = 4 + Math.random() * 7;
      if (playing && oceanLevel > 0.4) play('gull', { volume: 0.5 * oceanLevel * st.night });
    }

    // Footsteps on foot, rate from horizontal speed.
    const f = st.foot;
    if (pos) {
      if (f.x != null && playing && !inVeh && player.alive !== false && dt > 0) {
        const sp = Math.min(10, Math.hypot(pos.x - f.x, pos.z - f.z) / dt);
        f.speed = lerp(f.speed, sp, damp(6, dt));
        if (f.speed > 1.2) {
          f.phase += (f.speed * dt) / 0.75;
          if (f.phase >= 1) {
            f.phase -= 1;
            play('footstep', { volume: 0.35 + 0.1 * Math.random(), pitch: 0.9 + 0.2 * Math.random() });
          }
        } else f.phase = 0;
      } else {
        f.speed = lerp(f.speed, 0, damp(6, dt));
        f.phase = 0;
      }
      f.x = pos.x; f.z = pos.z;
    } else f.x = null;

    // Radio: toggle (cycles station1 -> station2 -> off), generative synthwave while driving.
    if (input.pressed?.('radio') && playing) toggleRadio();
    const rad = st.radio;
    const wantRadio = playing && inVeh && rad.station > 0 && game.settings?.music !== false;
    if (wantRadio) {
      rad.offT = 0;
      if (!rad.running) { rad.running = true; rad.next = now + 0.05; rad.step = 0; }
    } else if (rad.running) {
      rad.offT += dt;
      if (rad.offT > 1.2) rad.running = false;
    }
    setP(radioBus.gain, 'radio', wantRadio ? 0.2 : 0, 0.25);
    if (rad.running) {
      const s = STATIONS[Math.max(0, rad.station - 1)];
      const stepDur = 60 / s.bpm / 4;
      if (rad.next < now) rad.next = now + 0.05;
      while (rad.next < now + 0.15) {
        scheduleStep(s, rad.step, rad.next, stepDur);
        rad.next += stepDur;
        rad.step = (rad.step + 1) & 63;
      }
    }

    // Recycle finished voices.
    for (let i = voices.length - 1; i >= 0; i--) {
      const v = voices[i];
      if (now > v.end) { v.vg.disconnect(); v.pan?.disconnect(); voices.splice(i, 1); }
    }
    for (let i = dying.length - 1; i >= 0; i--) {
      const v = dying[i];
      if (now > v.end) { v.vg.disconnect(); v.pan?.disconnect(); dying.splice(i, 1); }
    }
  }

  // ---- event wiring -----------------------------------------------------------
  function wire() {
    const ev = game.events;
    if (!ev?.on) return;
    const on = (name, fn) => ev.on(name, (d) => { try { fn(d || {}); } catch (e) { warn(e); } });
    const xz = (ent) => ({ x: ent?.position?.x, z: ent?.position?.z });

    on('gunshot', (d) => {
      const w = typeof d.weapon === 'string' ? d.weapon : d.weapon?.id;
      play(WEAPON_SOUND[w] || 'pistol', { x: d.x, z: d.z });
    });
    on('explosion', (d) => play('explosion', { x: d.x, z: d.z }));
    on('vehicle:crash', (d) => {
      const impact = d.impact ?? 8;
      if (impact < 2 || !ok('crash', 250)) return;
      play('crash', { ...xz(d.vehicle), volume: clamp(impact / 15, 0.1, 1), pitch: 0.9 + Math.random() * 0.2 });
    });
    on('pickup', (d) => play(d.type === 'money' ? 'money' : 'pickup'));
    on('mission:started', () => play('missionStart'));
    on('mission:completed', () => play('missionComplete'));
    on('mission:failed', () => play('missionFail'));
    on('wanted:changed', (d) => {
      const lv = d.level | 0, prev = d.prev | 0;
      if (lv > prev) play('wantedUp');
      else if (lv === 0 && prev > 0) play('wantedClear');
    });
    on('player:died', () => play('death'));
    on('player:damaged', () => { if (ok('hit', 180)) play('hit', { volume: 0.7 }); });
    on('player:enteredVehicle', () => play('door'));
    on('player:exitedVehicle', () => play('door', { pitch: 0.85 }));
    on('vehicle:horn', (d) => { if (ok('horn', 300)) play('horn', xz(d.vehicle)); });
    on('ui:click', () => play('click', { volume: 0.6 }));
    on('money:changed', (d) => { if ((d.delta ?? 0) > 0 && ok('money', 120)) play('money', { volume: 0.3 }); });
    on('settings:changed', () => memo.delete('master'));
  }

  return {
    /** Called once after all systems exist. Installs the user-gesture listener and event handlers. */
    init() {
      try {
        for (const type of ['pointerdown', 'keydown', 'touchstart']) {
          window.addEventListener(type, onGesture, { capture: true, passive: true });
        }
      } catch (e) { warn(e); }
      wire();
    },

    /** Smooth continuous layers (engine, screech, siren, ambient, footsteps, radio). dt in seconds. */
    update(dt) {
      if (!ctx || dead) return;
      try { tick(dt); } catch (e) { warn(e); }
    },

    /**
     * One-shot sound. opts { x, z, volume=1, pitch=1 }; omit x/z for UI sounds.
     * Names: pistol smg shotgun rifle rpg punch explosion crash glass pickup money click
     * missionStart missionComplete missionFail wantedUp wantedClear horn death reload hit
     * jump door empty footstep gull
     */
    play,
  };
}
