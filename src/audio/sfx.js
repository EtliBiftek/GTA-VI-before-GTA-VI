// Neon Coast audio - one-shot sound recipes (weapons, impacts, vehicles, UI stingers, character).
import { tone, noiseHit, fm, mtof, rnd, pickOne } from './synth.js';

const later = (c, dt) => ({ ...c, t: c.t + dt });

/** Layered gunshot: transient click + body thump + filtered crack + tail. */
function gun(c, s) {
  noiseHit(c, 0.012, s.click, { type: 'highpass', f: s.clickF ?? 3500, q: 0.7 }, 0.0005);
  tone(c, 'sine', s.thumpF, s.thumpF * 0.3, s.thumpD, s.thump, { atk: 0.001 });
  if (s.thump2) tone(c, 'triangle', s.thumpF * 1.7, s.thumpF * 0.5, s.thumpD * 0.6, s.thump2, { atk: 0.001 });
  noiseHit(c, s.crackD, s.crack, { type: 'bandpass', f: s.crackF, f2: s.crackF * (s.crackSweep ?? 0.6), q: s.crackQ ?? 0.7 }, 0.001);
  noiseHit(c, s.tailD, s.tail, { type: 'lowpass', f: s.tailF, f2: s.tailF * 0.25, q: 0.5 }, 0.006, 'pink');
}

const metalClank = (c, base, n, peak, spread = 0.12) => {
  for (let i = 0; i < n; i++) {
    const cc = later(c, i * rnd(0.01, spread));
    const f = base * rnd(0.6, 2.6);
    tone(cc, 'square', f, f * rnd(0.7, 0.95), rnd(0.05, 0.16), peak * rnd(0.4, 1),
      { filter: { type: 'bandpass', f: f * 1.5, q: 6 }, atk: 0.001 });
  }
};

export const SOUNDS = {
  // ------------------------------------------------------------- weapons
  pistol: { dur: 0.9, gain: 1.35, ref: 25, maxDist: 260, wet: 0.3, sos: 1, build: (c) => gun(c, {
    click: 0.7, thumpF: 190, thumpD: 0.11, thump: 0.55, thump2: 0.2, crackD: 0.07, crack: 0.85, crackF: 2300, tailD: 0.55, tail: 0.18, tailF: 1800 }) },
  smg: { dur: 0.5, gain: 1.1, ref: 25, maxDist: 240, wet: 0.25, sos: 1, build: (c) => gun(c, {
    click: 0.6, thumpF: 230, thumpD: 0.06, thump: 0.4, crackD: 0.045, crack: 0.8, crackF: 3000, crackQ: 0.9, tailD: 0.3, tail: 0.12, tailF: 2200 }) },
  shotgun: { dur: 1.4, gain: 1.3, ref: 30, maxDist: 280, wet: 0.35, sos: 1, build: (c) => {
    gun(c, { click: 0.9, clickF: 2000, thumpF: 110, thumpD: 0.35, thump: 0.95, thump2: 0.3, crackD: 0.2, crack: 1, crackF: 1600, crackSweep: 0.3, crackQ: 0.5, tailD: 1.1, tail: 0.22, tailF: 1200 });
    noiseHit(c, 0.09, 0.4, { type: 'lowpass', f: 900, q: 0.5 }, 0.001, 'brown');
  } },
  rifle: { dur: 1.1, gain: 1.3, ref: 30, maxDist: 320, wet: 0.35, sos: 1, build: (c) => gun(c, {
    click: 0.8, clickF: 2800, thumpF: 150, thumpD: 0.2, thump: 0.7, thump2: 0.3, crackD: 0.1, crack: 0.95, crackF: 1700, crackQ: 0.6, tailD: 0.9, tail: 0.22, tailF: 1400 }) },
  sniper: { dur: 2.2, gain: 1.3, ref: 40, maxDist: 420, wet: 0.45, sos: 1, build: (c) => {
    gun(c, { click: 1, clickF: 2200, thumpF: 95, thumpD: 0.45, thump: 1, thump2: 0.35, crackD: 0.16, crack: 1, crackF: 1300, crackSweep: 0.35, crackQ: 0.5, tailD: 1.9, tail: 0.3, tailF: 1000 });
    noiseHit(later(c, 0.02), 0.25, 0.3, { type: 'bandpass', f: 3500, f2: 900, q: 1.2 }, 0.005);
  } },
  rpg: { dur: 2.2, gain: 1.0, ref: 30, maxDist: 280, wet: 0.35, sos: 1, build: (c) => {
    tone(c, 'sine', 120, 40, 0.3, 0.7, { atk: 0.002 });
    noiseHit(c, 0.12, 0.7, { type: 'bandpass', f: 1500, q: 0.6 }, 0.001);
    noiseHit(later(c, 0.02), 1.7, 0.55, { type: 'bandpass', f: 350, f2: 2600, q: 0.9 }, 0.12, 'pink');
    noiseHit(later(c, 0.05), 1.9, 0.3, { type: 'highpass', f: 1800, q: 0.5 }, 0.2);
    tone(later(c, 0.05), 'sawtooth', 70, 150, 1.6, 0.12, { atk: 0.2, filter: { type: 'lowpass', f: 400, q: 1 } });
  } },
  punch: { dur: 0.3, gain: 0.7, wet: 0.1, build: (c) => {
    noiseHit(c, 0.06, 0.7, { type: 'lowpass', f: 1500, q: 0.7 }, 0.001, 'pink');
    tone(c, 'sine', 170, 55, 0.14, 0.7, { atk: 0.001 });
  } },
  whoosh: { dur: 0.35, gain: 0.7, wet: 0.08, build: (c) => {
    noiseHit(c, 0.3, 0.35, { type: 'bandpass', f: 500, f2: 2200, q: 0.9 }, 0.09, 'pink');
  } },
  batHit: { dur: 0.4, gain: 0.8, wet: 0.12, build: (c) => {
    noiseHit(c, 0.03, 0.8, { type: 'highpass', f: 1800, q: 0.7 }, 0.0005);
    tone(c, 'triangle', 240, 90, 0.18, 0.8, { atk: 0.001 });
    tone(c, 'sine', 520, 480, 0.2, 0.15, { filter: { type: 'bandpass', f: 520, q: 8 } });
  } },
  reload: { dur: 1.2, gain: 0.55, wet: 0.08, build: (c) => {
    noiseHit(c, 0.03, 0.4, { type: 'highpass', f: 2500, q: 0.7 }, 0.001);
    tone(c, 'square', 1200, 700, 0.03, 0.12, { filter: { type: 'bandpass', f: 1400, q: 3 } });
    noiseHit(later(c, 0.45), 0.05, 0.55, { type: 'bandpass', f: 900, q: 1.5 }, 0.001);
    tone(later(c, 0.45), 'sine', 140, 80, 0.08, 0.35);
    noiseHit(later(c, 0.78), 0.03, 0.4, { type: 'highpass', f: 3000, q: 0.7 }, 0.001);
    tone(later(c, 0.78), 'square', 1800, 1100, 0.03, 0.12, { filter: { type: 'bandpass', f: 1800, q: 4 } });
  } },
  pump: { dur: 0.5, gain: 0.6, wet: 0.1, build: (c) => {
    noiseHit(c, 0.05, 0.5, { type: 'bandpass', f: 1100, q: 2 }, 0.001);
    tone(c, 'square', 700, 300, 0.05, 0.15, { filter: { type: 'bandpass', f: 800, q: 3 } });
    noiseHit(later(c, 0.18), 0.06, 0.55, { type: 'bandpass', f: 1500, q: 2 }, 0.001);
    tone(later(c, 0.18), 'sine', 120, 70, 0.08, 0.3);
  } },
  empty: { dur: 0.15, gain: 0.8, wet: 0.05, build: (c) => {
    tone(c, 'square', 1500, 800, 0.02, 0.2, { filter: { type: 'bandpass', f: 1500, q: 3 } });
    noiseHit(c, 0.015, 0.4, { type: 'highpass', f: 3500, q: 0.7 }, 0.0005);
  } },
  weaponSwitch: { dur: 0.4, gain: 0.5, wet: 0.05, build: (c) => {
    noiseHit(c, 0.12, 0.3, { type: 'bandpass', f: 1800, f2: 900, q: 1 }, 0.03, 'pink');
    noiseHit(later(c, 0.1), 0.025, 0.5, { type: 'highpass', f: 2500, q: 0.7 }, 0.0005);
    tone(later(c, 0.1), 'square', 1000, 600, 0.03, 0.1, { filter: { type: 'bandpass', f: 1100, q: 3 } });
  } },
  shell: { dur: 0.8, gain: 0.4, wet: 0.2, maxDist: 40, build: (c) => {
    const f = rnd(3300, 4300);
    for (let i = 0; i < 3; i++) {
      const cc = later(c, i * 0.11 + i * i * 0.02);
      tone(cc, 'sine', f * rnd(0.95, 1.05), null, 0.09, 0.3 / (i + 1), { filter: { type: 'bandpass', f, q: 5 }, atk: 0.0008 });
      tone(cc, 'sine', f * 1.5, null, 0.06, 0.12 / (i + 1), { atk: 0.0008 });
    }
  } },
  impact: { dur: 0.35, gain: 0.7, wet: 0.2, maxDist: 160, build: (c) => {
    noiseHit(c, 0.05, 0.6, { type: 'bandpass', f: rnd(1200, 2400), q: 1.2 }, 0.0008);
    tone(c, 'sine', 160, 70, 0.1, 0.4, { atk: 0.001 });
  } },
  ping: { dur: 0.6, gain: 0.5, wet: 0.35, maxDist: 160, build: (c) => {
    const f = rnd(2000, 3600);
    noiseHit(c, 0.02, 0.5, { type: 'highpass', f: 3000, q: 0.7 }, 0.0005);
    tone(c, 'sine', f, f * 0.5, 0.35, 0.3, { atk: 0.0008 });
    tone(c, 'sine', f * 2.4, f * 1.6, 0.18, 0.12, { atk: 0.0008 });
  } },
  ricochet: { dur: 0.7, gain: 0.5, wet: 0.35, maxDist: 160, build: (c) => {
    noiseHit(c, 0.02, 0.6, { type: 'highpass', f: 3000, q: 0.7 }, 0.0005);
    tone(c, 'sine', rnd(3200, 4200), rnd(900, 1400), 0.4, 0.3, { atk: 0.001, filter: { type: 'bandpass', f: 2500, q: 2 } });
    tone(c, 'triangle', rnd(2600, 3200), rnd(700, 1100), 0.3, 0.15, { atk: 0.001 });
  } },
  whiz: { dur: 0.35, gain: 0.45, wet: 0.1, build: (c) => {
    noiseHit(c, 0.22, 0.5, { type: 'bandpass', f: 1500, f2: 4200, q: 3 }, 0.07);
    tone(c, 'sine', 2800, 1500, 0.2, 0.08, { atk: 0.05 });
  } },
  bodyHit: { dur: 0.3, gain: 0.55, wet: 0.1, maxDist: 90, build: (c) => {
    noiseHit(c, 0.07, 0.6, { type: 'lowpass', f: 700, q: 0.7 }, 0.002, 'pink');
    tone(c, 'sine', 120, 55, 0.14, 0.55);
  } },
  hit: { dur: 0.3, gain: 0.7, wet: 0.08, build: (c) => {
    // player pain: abstract filtered grunt burst
    tone(c, 'sawtooth', 150, 95, 0.16, 0.35, { atk: 0.01, filter: { type: 'lowpass', f: 700, q: 3 } });
    noiseHit(c, 0.15, 0.4, { type: 'bandpass', f: 500, f2: 320, q: 2 }, 0.008, 'pink');
    tone(c, 'sine', 90, 50, 0.1, 0.5);
  } },
  // ------------------------------------------------------------- explosions & crashes
  explosion: { dur: 4.2, gain: 1, ref: 70, maxDist: 520, wet: 0.5, sos: 1, duck: 0.7, build: (c) => {
    noiseHit(c, 0.35, 0.8, { type: 'highpass', f: 2200, q: 0.6 }, 0.001);
    noiseHit(c, 2.2, 1, { type: 'lowpass', f: 2600, f2: 90, q: 0.7 }, 0.01, 'brown');
    noiseHit(c, 3.2, 0.5, { type: 'lowpass', f: 500, f2: 60, q: 0.5 }, 0.15, 'brown');
    tone(c, 'sine', 75, 22, 2.4, 1, { atk: 0.004 });
    tone(c, 'sine', 42, 18, 3, 0.7, { atk: 0.01 });
    for (let i = 0; i < 9; i++) {
      const cc = later(c, 0.25 + i * rnd(0.12, 0.3));
      noiseHit(cc, rnd(0.03, 0.08), rnd(0.1, 0.3), { type: 'bandpass', f: rnd(800, 4000), q: 2 }, 0.001);
      if (i % 3 === 0) metalClank(cc, 500, 2, 0.1);
    }
  } },
  explosionFar: { dur: 4.2, gain: 1, ref: 70, maxDist: 700, wet: 0.55, sos: 1, build: (c) => {
    // distant blast: only the low rumble survives the distance
    noiseHit(c, 2.8, 0.55, { type: 'lowpass', f: 600, f2: 70, q: 0.6 }, 0.06, 'brown');
    tone(c, 'sine', 64, 24, 2.6, 0.7, { atk: 0.012 });
  } },
  crash: { dur: 1.2, gain: 0.8, wet: 0.25, maxDist: 220, build: (c, o) => {
    const k = o.k ?? 0.5;
    noiseHit(c, 0.25 + k * 0.4, 0.7, { type: 'bandpass', f: 700 + k * 300, f2: 200, q: 0.7 }, 0.001, 'pink');
    tone(c, 'sine', 110, 40, 0.25 + k * 0.2, 0.8, { atk: 0.001 });
    metalClank(c, 420, 2 + Math.round(k * 7), 0.2 + k * 0.1, 0.1 + k * 0.1);
    noiseHit(c, 0.08, 0.5, { type: 'highpass', f: 3000, q: 0.7 }, 0.0005);
    if (k > 0.55) {
      for (let i = 0; i < 6; i++) {
        const cc = later(c, 0.03 + i * rnd(0.03, 0.06));
        tone(cc, 'sine', rnd(2800, 6500), null, rnd(0.05, 0.2), 0.1, { filter: { type: 'bandpass', f: 4500, q: 4 }, atk: 0.001 });
      }
      noiseHit(c, 0.5, 0.25, { type: 'highpass', f: 5500, q: 0.7 }, 0.003);
    }
  } },
  scrape: { dur: 0.5, gain: 0.5, wet: 0.1, maxDist: 120, build: (c) => {
    noiseHit(c, 0.4, 0.4, { type: 'bandpass', f: 1800, f2: 900, q: 4 }, 0.04);
  } },
  glass: { dur: 1.0, gain: 0.7, wet: 0.2, build: (c) => {
    noiseHit(c, 0.2, 0.4, { type: 'highpass', f: 5500, q: 0.7 }, 0.001);
    for (let i = 0; i < 7; i++) tone(later(c, i * 0.04 + rnd(0, 0.03)), 'sine', rnd(2400, 6400), null, rnd(0.12, 0.4), 0.1, { atk: 0.001 });
  } },
  door: { dur: 0.45, gain: 0.7, wet: 0.12, maxDist: 100, build: (c) => {
    // close: latch click + body thunk
    noiseHit(c, 0.08, 0.55, { type: 'lowpass', f: 1100, f2: 250, q: 0.7 }, 0.001, 'pink');
    tone(c, 'sine', 130, 55, 0.16, 0.7, { atk: 0.001 });
    noiseHit(later(c, 0.07), 0.02, 0.4, { type: 'bandpass', f: 2600, q: 3 }, 0.0005);
  } },
  doorOpen: { dur: 0.35, gain: 0.55, wet: 0.1, maxDist: 100, build: (c) => {
    noiseHit(c, 0.02, 0.5, { type: 'bandpass', f: 2200, q: 3 }, 0.0005);
    noiseHit(later(c, 0.06), 0.15, 0.2, { type: 'bandpass', f: 700, f2: 400, q: 2 }, 0.03, 'pink');
    tone(later(c, 0.14), 'sine', 100, 60, 0.1, 0.35);
  } },
  horn: { dur: 1.1, gain: 0.55, wet: 0.2, maxDist: 220, build: (c, o) => {
    // two-tone; o.base chooses character per vehicle
    const b = (o.base ?? 400);
    const len = o.len ?? 0.5;
    const flt = { type: 'lowpass', f: 2400, q: 1.2 };
    tone(c, 'sawtooth', b, b * 0.995, len, 0.17, { atk: 0.012, filter: flt, hold: len * 0.7 });
    tone(c, 'sawtooth', b * 1.26, b * 1.255, len, 0.17, { atk: 0.012, filter: flt, hold: len * 0.7 });
    tone(c, 'square', b * 2.01, null, len, 0.04, { atk: 0.02, filter: { type: 'lowpass', f: 3000, q: 1 }, hold: len * 0.6 });
  } },
  burble: { dur: 0.25, gain: 0.7, wet: 0.1, maxDist: 90, bus: 'veh', build: (c) => {
    noiseHit(c, 0.09, 0.7, { type: 'lowpass', f: 380, q: 1.5 }, 0.002, 'brown');
    tone(c, 'sawtooth', rnd(60, 90), 45, 0.08, 0.35, { filter: { type: 'lowpass', f: 300, q: 1 } });
  } },
  shift: { dur: 0.2, gain: 0.6, wet: 0.05, bus: 'veh', build: (c) => {
    noiseHit(c, 0.05, 0.5, { type: 'bandpass', f: 1000, q: 2 }, 0.002);
  } },
  crackle: { dur: 0.2, gain: 0.6, wet: 0.1, maxDist: 70, build: (c) => {
    for (let i = 0; i < 2; i++) noiseHit(later(c, i * rnd(0.01, 0.08)), rnd(0.008, 0.03), rnd(0.3, 0.8), { type: 'bandpass', f: rnd(1500, 5000), q: 2 }, 0.0005);
  } },
  // ------------------------------------------------------------- character
  footstep: { dur: 0.25, gain: 1.2, wet: 0.12, maxDist: 60, build: (c) => {
    noiseHit(c, 0.05, 0.6, { type: 'bandpass', f: rnd(700, 1200), q: rnd(1, 2.5) }, 0.002, 'pink');
    tone(c, 'sine', rnd(85, 120), 55, 0.07, 0.4, { atk: 0.001 });
    noiseHit(c, 0.012, 0.25, { type: 'highpass', f: rnd(2500, 4000), q: 0.7 }, 0.0005);
  } },
  jump: { dur: 0.35, gain: 0.9, wet: 0.08, build: (c) => {
    noiseHit(c, 0.2, 0.25, { type: 'bandpass', f: 700, f2: 1500, q: 0.8 }, 0.05, 'pink');
    tone(c, 'sine', 240, 340, 0.1, 0.1, { filter: { type: 'lowpass', f: 600, q: 1 } });
  } },
  land: { dur: 0.35, gain: 0.55, wet: 0.12, build: (c, o) => {
    const k = o.k ?? 0.5;
    noiseHit(c, 0.08, 0.5 + k * 0.4, { type: 'lowpass', f: 900, q: 0.7 }, 0.001, 'pink');
    tone(c, 'sine', 100, 45, 0.15 + k * 0.1, 0.5 + k * 0.4, { atk: 0.001 });
  } },
  death: { dur: 3, gain: 0.85, wet: 0.5, bus: 'ui', build: (c) => {
    tone(c, 'sine', 160, 30, 2.4, 0.7, { atk: 0.01 });
    tone(c, 'sawtooth', 220, 55, 2.2, 0.16, { atk: 0.02, filter: { type: 'lowpass', f: 900, f2: 120, q: 2 } });
    noiseHit(c, 1.8, 0.3, { type: 'lowpass', f: 700, f2: 100, q: 0.6 }, 0.03, 'brown');
    [311, 392, 466].forEach((f, i) => tone(later(c, 0.1 + i * 0.03), 'triangle', f * 0.5, f * 0.46, 2.2, 0.1, { atk: 0.05 }));
  } },
  heartbeat: { dur: 0.6, gain: 0.55, wet: 0.05, bus: 'ui', build: (c) => {
    tone(c, 'sine', 62, 38, 0.16, 0.9, { atk: 0.006 });
    tone(later(c, 0.19), 'sine', 55, 34, 0.14, 0.65, { atk: 0.006 });
  } },
  // ------------------------------------------------------------- ambience one-shots (positional, spawned by ambience.js)
  gull: { dur: 1.2, gain: 0.5, bus: 'amb', wet: 0.25, maxDist: 220, build: (c, o) => {
    const n = o.calls ?? 3, base = o.base ?? rnd(1500, 1900);
    let t0 = 0;
    for (let i = 0; i < n; i++) {
      const cc = later(c, t0), len = rnd(0.2, 0.34) * (i === n - 1 ? 1.4 : 1);
      // glide up then down through a formant, with fast flutter
      const o2 = cc.ctx.createOscillator(), g = cc.ctx.createGain(), bp = cc.ctx.createBiquadFilter(), lfo = cc.ctx.createOscillator(), lg = cc.ctx.createGain();
      o2.type = 'sawtooth';
      o2.frequency.setValueAtTime(base * 0.9, cc.t);
      o2.frequency.exponentialRampToValueAtTime(base * 1.6, cc.t + len * 0.3);
      o2.frequency.exponentialRampToValueAtTime(base * 1.05, cc.t + len);
      lfo.frequency.value = rnd(28, 45); lg.gain.value = base * 0.04;
      lfo.connect(lg); lg.connect(o2.frequency);
      bp.type = 'bandpass'; bp.Q.value = 2.2; bp.frequency.setValueAtTime(base * 1.4, cc.t); bp.frequency.linearRampToValueAtTime(base * 1.8, cc.t + len * 0.3);
      g.gain.setValueAtTime(0.0001, cc.t); g.gain.linearRampToValueAtTime(0.35, cc.t + 0.03); g.gain.setValueAtTime(0.3, cc.t + len * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, cc.t + len);
      o2.connect(bp); bp.connect(g); g.connect(cc.out);
      o2.start(cc.t); lfo.start(cc.t); o2.stop(cc.t + len + 0.05); lfo.stop(cc.t + len + 0.05);
      o2.onended = () => { [o2, g, bp, lfo, lg].forEach((x) => x.disconnect()); };
      noiseHit(cc, len, 0.05, { type: 'bandpass', f: base * 1.6, q: 3 }, 0.02);
      t0 += len + rnd(0.05, 0.22);
    }
  } },
  lap: { dur: 1.2, gain: 0.35, bus: 'amb', wet: 0.15, build: (c) => {
    noiseHit(c, 0.9, 0.5, { type: 'bandpass', f: 500, f2: 900, q: 0.8 }, 0.25, 'pink');
    noiseHit(later(c, 0.15), 0.4, 0.15, { type: 'highpass', f: 2500, q: 0.7 }, 0.12);
  } },
  ferryHorn: { dur: 5, gain: 0.5, bus: 'amb', wet: 0.7, maxDist: 900, build: (c, o) => {
    const b = o.base ?? 98, len = o.len ?? 2.6;
    const flt = { type: 'lowpass', f: 650, q: 0.9 };
    [1, 1.498, 2.0].forEach((m, i) => tone(c, 'sawtooth', b * m, b * m * 0.992, len, [0.3, 0.22, 0.1][i], { atk: 0.18, filter: flt, hold: len * 0.7 }));
    tone(c, 'sine', b * 0.5, null, len, 0.35, { atk: 0.2, hold: len * 0.7 });
    noiseHit(c, len, 0.05, { type: 'bandpass', f: 400, q: 1 }, 0.2, 'pink');
  } },
  boat: { dur: 9, gain: 0.5, bus: 'amb', wet: 0.4, maxDist: 400, build: (c, o) => {
    const ctx = c.ctx, len = 8;
    const osc = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain(), am = ctx.createOscillator(), ag = ctx.createGain();
    osc.type = 'sawtooth'; osc.frequency.value = 42 * (o.pitch ?? 1);
    lp.type = 'lowpass'; lp.frequency.value = 190; lp.Q.value = 1.5;
    am.frequency.value = 6.5 + rnd(0, 2); am.type = 'sine'; ag.gain.value = 0.45; g.gain.value = 0;
    // the AM sum: base 0.55 + lfo -> output gain
    g.gain.setValueAtTime(0.0001, c.t); g.gain.linearRampToValueAtTime(0.55, c.t + 3); g.gain.linearRampToValueAtTime(0.0001, c.t + len);
    const mod = ctx.createGain(); mod.gain.value = 0.5; am.connect(ag); ag.connect(mod.gain);
    osc.connect(lp); lp.connect(mod); mod.connect(g); g.connect(c.out);
    osc.start(c.t); am.start(c.t); osc.stop(c.t + len + 0.1); am.stop(c.t + len + 0.1);
    osc.onended = () => [osc, lp, g, am, ag, mod].forEach((x) => x.disconnect());
    noiseHit(c, len, 0.12, { type: 'lowpass', f: 400, f2: 250, q: 0.5 }, 3, 'brown');
  } },
  tramBell: { dur: 3, gain: 0.5, bus: 'amb', wet: 0.5, maxDist: 400, build: (c) => {
    const f = rnd(1050, 1250);
    for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) {
      const cc = later(c, r * 1.1 + k * 0.17);
      [1, 2.76, 5.4].forEach((m, i) => tone(cc, 'sine', f * m, null, [0.9, 0.5, 0.25][i], [0.3, 0.14, 0.07][i], { atk: 0.001 }));
    }
  } },
  bark: { dur: 1.2, gain: 0.45, bus: 'amb', wet: 0.4, maxDist: 260, build: (c) => {
    const n = pickOne([2, 3, 3, 4]); let t0 = 0; const f = rnd(300, 520);
    for (let i = 0; i < n; i++) {
      const cc = later(c, t0);
      tone(cc, 'sawtooth', f * 1.1, f * 0.7, 0.13, 0.35, { atk: 0.008, filter: { type: 'bandpass', f: f * 2.2, q: 2.5 } });
      noiseHit(cc, 0.09, 0.2, { type: 'bandpass', f: 1200, q: 2 }, 0.005);
      t0 += rnd(0.2, 0.3);
    }
  } },
  vehicleTick: { dur: 0.2, gain: 0.3, build: (c) => { noiseHit(c, 0.02, 0.5, { type: 'bandpass', f: 1500, q: 2 }, 0.001); } },
  tune: { dur: 0.5, gain: 0.6, bus: 'music', wet: 0.05, build: (c) => {
    noiseHit(c, 0.4, 0.5, { type: 'bandpass', f: 600, f2: 3500, q: 2.5 }, 0.01);
    tone(c, 'sine', 900, 1800, 0.35, 0.05, { atk: 0.01 });
  } },
  // ------------------------------------------------------------- UI / stingers (neon style)
  click: { dur: 0.2, gain: 1.4, bus: 'ui', wet: 0.06, build: (c) => {
    tone(c, 'triangle', 1500, 900, 0.045, 0.3, { atk: 0.001 });
    noiseHit(c, 0.012, 0.25, { type: 'highpass', f: 4000, q: 0.7 }, 0.0005);
  } },
  hover: { dur: 0.15, gain: 1.0, bus: 'ui', wet: 0.04, build: (c) => {
    tone(c, 'sine', 1200, 1500, 0.06, 0.2, { atk: 0.004 });
  } },
  pickup: { dur: 0.9, gain: 0.55, bus: 'ui', wet: 0.2, build: (c) => {
    [76, 83, 88].forEach((m, i) => fm(later(c, i * 0.07), mtof(m), 2, 1.4, 0.45, 0.22, { idxEnd: 0.02 }));
  } },
  money: { dur: 0.9, gain: 0.5, bus: 'ui', wet: 0.2, build: (c) => {
    fm(c, 1975, 3.5, 0.8, 0.12, 0.28, { idxEnd: 0.05 });
    fm(later(c, 0.07), 2637, 3.5, 0.8, 0.5, 0.28, { idxEnd: 0.02 });
    noiseHit(later(c, 0.07), 0.04, 0.12, { type: 'highpass', f: 7000, q: 0.7 }, 0.001);
  } },
  missionStart: { dur: 2.4, gain: 0.55, bus: 'ui', wet: 0.4, build: (c) => {
    const saw = { type: 'lowpass', f: 2800, q: 1 };
    [57, 64, 69, 72, 76, 81].forEach((m, i) => tone(later(c, i * 0.09), 'sawtooth', mtof(m), null, 0.9, 0.12, { atk: 0.01, filter: saw }));
    [45, 57].forEach((m) => tone(c, 'sawtooth', mtof(m), null, 1.8, 0.2, { atk: 0.02, filter: { type: 'lowpass', f: 700, q: 2 } }));
    noiseHit(c, 0.8, 0.2, { type: 'bandpass', f: 400, f2: 6000, q: 1 }, 0.5);
  } },
  missionComplete: { dur: 3.6, gain: 0.6, bus: 'ui', wet: 0.5, build: (c) => {
    [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => fm(later(c, i * 0.1), mtof(m), 2, 0.9, 1.3, 0.16, { idxEnd: 0.03 }));
    [48, 55, 60, 64, 67].forEach((m) => tone(later(c, 0.65), 'sawtooth', mtof(m), null, 2.4, 0.1, { atk: 0.04, filter: { type: 'lowpass', f: 1800, q: 1 } }));
    tone(later(c, 0.65), 'sine', mtof(36), null, 2, 0.4, { atk: 0.01 });
  } },
  missionFail: { dur: 2.8, gain: 0.6, bus: 'ui', wet: 0.45, build: (c) => {
    [69, 65, 62, 57].forEach((m, i) => tone(later(c, i * 0.22), 'sawtooth', mtof(m), mtof(m) * 0.97, 0.9, 0.13, { atk: 0.01, filter: { type: 'lowpass', f: 1400, f2: 300, q: 2 } }));
    tone(later(c, 0.7), 'sine', 90, 35, 1.8, 0.7, { atk: 0.01 });
  } },
  wantedUp: { dur: 1.2, gain: 0.55, bus: 'ui', wet: 0.3, duck: 0.3, build: (c) => {
    for (let i = 0; i < 3; i++) {
      const cc = later(c, i * 0.17);
      tone(cc, 'square', 880, 700, 0.12, 0.16, { atk: 0.003, filter: { type: 'lowpass', f: 3000, q: 2 } });
      tone(cc, 'square', 1175, 940, 0.12, 0.1, { atk: 0.003, filter: { type: 'lowpass', f: 3000, q: 2 } });
    }
    tone(c, 'sine', 80, 40, 0.5, 0.6);
  } },
  wantedClear: { dur: 1.6, gain: 0.5, bus: 'ui', wet: 0.4, build: (c) => {
    [76, 72, 67, 64].forEach((m, i) => fm(later(c, i * 0.14), mtof(m), 1, 1.1, 0.7, 0.18, { idxEnd: 0.03 }));
  } },
};

export const WEAPON_SOUND = { pistol: 'pistol', smg: 'smg', shotgun: 'shotgun', rifle: 'rifle', sniper: 'sniper', rpg: 'rpg', fist: 'punch', bat: 'batHit' };
