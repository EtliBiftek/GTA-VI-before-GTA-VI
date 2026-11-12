// Neon Coast audio - generative radio & menu theme. A look-ahead sequencer on the audio clock drives
// four original stations plus a menu theme. Each song is generated from scale + motif rules with
// sections (intro / verse / chorus / break / outro), so nothing is a fixed 4-bar loop.
// All melodies are generated; nothing reproduces an existing song.
import { tone, noiseHit, fm, pluck, mtof, rng32 } from './synth.js';

const LOOKAHEAD = 0.45;
const later = (c, dt) => ({ ...c, t: c.t + dt });

// ---------------------------------------------------------------- scales & chords
const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  hicaz: [0, 1, 4, 5, 7, 8, 10],       // 12-TET approximation of Hicaz
  huseyni: [0, 2, 3, 5, 7, 9, 10],     // approximation of Hüseyni (A-B-C-D-E-F#-G flavour)
  pent: [0, 3, 5, 7, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
};
const QUAL = {
  M: [0, 4, 7], m: [0, 3, 7], m7: [0, 3, 7, 10], M7: [0, 4, 7, 11], d7: [0, 4, 7, 10], m9: [0, 3, 7, 10, 14],
  dim: [0, 3, 6], p5: [0, 7, 12], sus: [0, 5, 7], M6: [0, 4, 7, 9],
};
const chordMidi = (key, ch, oct = 0) => QUAL[ch.q].map((i) => key + ch.r + i + oct * 12);
const degMidi = (key, scale, deg) => {
  const n = scale.length, o = Math.floor(deg / n), i = ((deg % n) + n) % n;
  return key + scale[i] + 12 * o;
};

/** Motif generator: scale-degree random walk with metric weighting, resolving to a chord tone. */
function makePhrase(rng, scale, steps, spb, density, startDeg, endDeg, lo = -2, hi = 9) {
  const notes = [];
  let deg = startDeg;
  const onsets = [];
  for (let s = 0; s < steps; s++) {
    const m = s % spb, beat = spb === 18 ? [0, 4, 8, 12] : [0, 4, 8, 12];
    const w = m === 0 ? 1 : beat.includes(m) ? 0.7 : (m % 2 === 0 ? 0.4 : 0.18);
    if (s === 0 || rng() < w * density) onsets.push(s);
  }
  // leave the end of the phrase to breathe
  while (onsets.length > 1 && onsets[onsets.length - 1] > steps - 2) onsets.pop();
  const moves = [-2, -1, -1, -1, 0, 1, 1, 1, 2, 3, -3];
  for (let i = 0; i < onsets.length; i++) {
    if (i > 0) { deg += rng.pick(moves); if (deg < lo) deg += 3; if (deg > hi) deg -= 3; }
    if (i === onsets.length - 1) deg = endDeg;
    const next = i + 1 < onsets.length ? onsets[i + 1] : steps;
    notes.push({ s: onsets[i], deg, len: Math.max(1, Math.min(next - onsets[i], i === onsets.length - 1 ? 8 : 6)) });
  }
  return notes;
}
const vary = (rng, phrase, scale, steps, spb, endDeg) => {
  const keep = Math.max(1, Math.floor(phrase.length * 0.55));
  const out = phrase.slice(0, keep).map((n) => ({ ...n }));
  const last = out[keep - 1];
  let deg = last.deg;
  const spots = [];
  for (let s = last.s + last.len; s < steps - 2; s += rng.pick([2, 2, 3, 4])) spots.push(s);
  spots.forEach((s, i) => {
    deg += rng.pick([-2, -1, 1, 1, 2]);
    if (i === spots.length - 1) deg = endDeg;
    out.push({ s, deg, len: 2 });
  });
  return out;
};
const indexPhrase = (ph) => { const m = new Map(); for (const n of ph) m.set(n.s, n); return m; };

// ---------------------------------------------------------------- instruments
const C = (run, t, out) => ({ ctx: run.ctx, out: out || run.mix, t, p: 1, noise: run.noise });
const kick = (c, v, kind) => {
  if (kind === 'house') { tone(c, 'sine', 150, 42, 0.28, 0.95 * v, { atk: 0.001 }); noiseHit(c, 0.01, 0.4 * v, { type: 'highpass', f: 3000, q: 0.7 }, 0.0005); }
  else if (kind === 'lofi') { tone(c, 'sine', 120, 48, 0.3, 0.8 * v, { atk: 0.002 }); noiseHit(c, 0.04, 0.2 * v, { type: 'lowpass', f: 600, q: 0.7 }, 0.001, 'brown'); }
  else { tone(c, 'sine', 160, 45, 0.24, 0.9 * v, { atk: 0.001 }); noiseHit(c, 0.012, 0.35 * v, { type: 'highpass', f: 2500, q: 0.7 }, 0.0005); }
};
const snare = (c, v, kind) => {
  if (kind === 'lofi') { noiseHit(c, 0.2, 0.5 * v, { type: 'bandpass', f: 1700, q: 0.6 }, 0.001, 'pink'); tone(c, 'triangle', 190, 140, 0.1, 0.35 * v, { atk: 0.001 }); }
  else { noiseHit(c, 0.18, 0.6 * v, { type: 'bandpass', f: 2100, q: 0.7 }, 0.001); tone(c, 'triangle', 210, 150, 0.1, 0.4 * v, { atk: 0.001 }); noiseHit(c, 0.35, 0.12 * v, { type: 'highpass', f: 1500, q: 0.6 }, 0.01); }
};
const clap = (c, v) => {
  for (let i = 0; i < 3; i++) noiseHit(later(c, i * 0.011), 0.025, 0.5 * v, { type: 'bandpass', f: 1500, q: 1.1 }, 0.0005);
  noiseHit(later(c, 0.033), 0.16, 0.4 * v, { type: 'bandpass', f: 1300, q: 1 }, 0.001);
};
const hat = (c, v, open) => noiseHit(c, open ? 0.22 : 0.035, (open ? 0.2 : 0.16) * v, { type: 'highpass', f: open ? 6500 : 7500, q: 0.7 }, 0.0008);
const shaker = (c, v) => noiseHit(c, 0.07, 0.12 * v, { type: 'bandpass', f: 6500, q: 1.2 }, 0.02);
const dum = (c, v) => { tone(c, 'sine', 175, 90, 0.2, 0.85 * v, { atk: 0.001 }); noiseHit(c, 0.05, 0.25 * v, { type: 'lowpass', f: 700, q: 0.7 }, 0.001, 'pink'); };
const tek = (c, v) => { noiseHit(c, 0.05, 0.4 * v, { type: 'bandpass', f: 3300, q: 2.5 }, 0.001); tone(c, 'sine', 430, 400, 0.09, 0.14 * v, { atk: 0.001, filter: { type: 'bandpass', f: 430, q: 8 } }); };
const ka = (c, v) => { noiseHit(c, 0.03, 0.26 * v, { type: 'bandpass', f: 4600, q: 2 }, 0.001); };
const tom = (c, v, f) => tone(c, 'sine', f, f * 0.55, 0.22, 0.6 * v, { atk: 0.001 });

const bass = (c, m, dur, v, kind) => {
  const f = mtof(m);
  if (kind === 'sub') { tone(c, 'sine', f, null, dur, 0.55 * v, { atk: 0.01 }); tone(c, 'triangle', f * 2, null, dur * 0.6, 0.1 * v, { atk: 0.01 }); }
  else if (kind === 'acid') { tone(c, 'sawtooth', f, null, dur, 0.28 * v, { atk: 0.002, filter: { type: 'lowpass', f: 2600, f2: 260, q: 11 } }); tone(c, 'sine', f, null, dur, 0.3 * v); }
  else if (kind === 'pulse') { tone(c, 'square', f, null, dur, 0.22 * v, { atk: 0.003, filter: { type: 'lowpass', f: 1100, f2: 300, q: 3 } }); tone(c, 'sine', f, null, dur, 0.38 * v); }
  else { tone(c, 'sawtooth', f, null, dur, 0.26 * v, { atk: 0.004, filter: { type: 'lowpass', f: 1500, f2: 240, q: 4 } }); tone(c, 'sine', f, null, dur, 0.38 * v); }
};
const pad = (c, notes, dur, v, cut = 1200) => {
  notes.forEach((m, i) => {
    const f = mtof(m);
    tone(c, 'sawtooth', f, null, dur, 0.05 * v, { atk: dur * 0.3, hold: dur * 0.35, detune: -7 - i, filter: { type: 'lowpass', f: cut, q: 0.6 } });
    tone(c, 'sawtooth', f, null, dur, 0.05 * v, { atk: dur * 0.3, hold: dur * 0.35, detune: 7 + i, filter: { type: 'lowpass', f: cut, q: 0.6 } });
  });
};
const stab = (c, notes, dur, v, cut) => notes.forEach((m) => tone(c, 'sawtooth', mtof(m), null, dur, 0.09 * v, { atk: 0.004, filter: { type: 'lowpass', f: cut, f2: cut * 0.18, q: 3 }, detune: (Math.random() - 0.5) * 12 }));
const ep = (c, m, dur, v) => { const f = mtof(m); fm(c, f, 1, 1.2, dur, 0.3 * v, { idxEnd: 0.03 }); fm(c, f, 14, 0.25, 0.09, 0.12 * v, { idxEnd: 0.02 }); };
const bell = (c, m, dur, v) => { const f = mtof(m); fm(c, f, 3.5, 0.9, dur, 0.2 * v, { idxEnd: 0.02 }); };
const lead = (c, m, dur, v, cut = 3400) => {
  const f = mtof(m);
  tone(c, 'sawtooth', f, null, dur, 0.1 * v, { atk: 0.012, detune: -9, filter: { type: 'lowpass', f: cut, f2: cut * 0.5, q: 1.4 } });
  tone(c, 'sawtooth', f, null, dur, 0.1 * v, { atk: 0.012, detune: 9, filter: { type: 'lowpass', f: cut, f2: cut * 0.5, q: 1.4 } });
  tone(c, 'square', f * 2, null, dur * 0.6, 0.02 * v, { atk: 0.01 });
};
const pulseLead = (c, m, dur, v, glideFrom) => {
  const f = mtof(m);
  tone(c, 'square', glideFrom ? mtof(glideFrom) : f, f, dur, 0.1 * v, { atk: 0.01, filter: { type: 'lowpass', f: 2600, f2: 1200, q: 3 } });
  tone(c, 'sawtooth', f * 1.003, null, dur, 0.05 * v, { atk: 0.01, filter: { type: 'lowpass', f: 2200, q: 2 } });
};
const saz = (c, m, dur, v) => pluck(c, mtof(m), 0.55 * v, { strings: 2, bright: 2, dur, filter: { type: 'peaking', f: 1200, q: 0.8 } });
const riser = (c, dur, v) => { noiseHit(c, dur, 0.4 * v, { type: 'bandpass', f: 300, f2: 7000, q: 1.5 }, dur * 0.9); };

// ---------------------------------------------------------------- stations
const KEYS_MIN = [45, 47, 48, 50, 52, 43]; // A B C D E G (midi, bass register)
const sections = (rng, list) => list.map(([name, bars]) => ({ name, bars }));

/** Synthwave: gated snare, pulsing bass, supersaw lead, 16th arps. */
const synthwave = {
  name: 'Boğaz FM', bpm: [100, 112], spb: 16, swing: 0, mix: 0.85,
  newSong(rng) {
    const key = rng.pick(KEYS_MIN) + 12;
    const scale = SCALES.minor;
    const qual = { 0: 'm', 2: 'dim', 3: 'M', 5: 'm', 7: 'm', 8: 'M', 10: 'M' };
    const mk = (roots) => roots.map((r) => ({ r, q: qual[r] }));
    const progV = rng.pick([[0, 8, 3, 10], [0, 10, 8, 10], [0, 5, 8, 3], [0, 3, 8, 10]]);
    const progC = rng.pick([[8, 10, 0, 0], [8, 3, 10, 0], [5, 8, 10, 0], [0, 8, 3, 10]]);
    const A = makePhrase(rng, scale, 32, 16, 0.5, 2, rng.pick([0, 2, 4]));
    const B = vary(rng, A, scale, 32, 16, 0);
    const Cc = makePhrase(rng, scale, 32, 16, 0.62, 4, 0, 0, 11);
    return {
      key, scale, A: indexPhrase(A), B: indexPhrase(B), C: indexPhrase(Cc), C2: indexPhrase(vary(rng, Cc, scale, 32, 16, 0)),
      bassPat: rng.pick([[0, 0, 12, 0, 0, 0, 12, 7], [0, 12, 0, 12, 0, 7, 0, 5], [0, 0, 0, 12, 0, 0, 7, 12]]),
      arpPat: rng.pick([[0, 1, 2, 1], [0, 2, 1, 2], [0, 1, 2, 3]]),
      sec: [
        { name: 'intro', bars: 4, prog: mk(progV.slice(0, 2).concat(progV.slice(0, 2))), L: 'hat pad arp' },
        { name: 'verse', bars: 8, prog: mk(progV.concat(progV)), L: 'kick snare hat bass pad arp lead:A' },
        { name: 'chorus', bars: 8, prog: mk(progC.concat(progC)), L: 'kick snare hat bass pad arp lead:C stab' },
        { name: 'verse', bars: 8, prog: mk(progV.concat(progV)), L: 'kick snare hat bass pad arp lead:B' },
        { name: 'break', bars: 4, prog: mk(progV), L: 'pad arp' },
        { name: 'chorus', bars: 8, prog: mk(progC.concat(progC)), L: 'kick snare hat bass pad arp lead:C2 stab' },
        { name: 'outro', bars: 4, prog: mk(progV), L: 'hat pad arp' },
      ],
    };
  },
  step(run, song, sec, bar, s, t, sd) {
    const L = sec.L, has = (k) => L.includes(k);
    const ch = sec.prog[bar % sec.prog.length];
    const notes = chordMidi(song.key, ch, 1);
    const last = bar === sec.bars - 1;
    if (has('kick') && (s === 0 || s === 8 || (s === 14 && bar % 2 === 1 && sec.name === 'chorus'))) kick(C(run, t), 0.95, 'syn');
    if (has('snare') && (s === 4 || s === 12)) { const c = C(run, t, run.gate); snare(c, 0.9, 'syn'); }
    if (last && has('snare') && s >= 12 && s % 1 === 0 && s > 12) snare(C(run, t, run.gate), 0.4 + 0.1 * (s - 12), 'syn');
    if (has('hat') && s % 2 === 0) hat(C(run, t), (s % 4 === 2 ? 0.9 : 0.6) * (sec.name === 'intro' ? 0.7 : 1), false);
    if (has('hat') && s === 14 && has('kick')) hat(C(run, t), 0.8, true);
    if (has('bass') && s % 2 === 0) {
      const off = song.bassPat[(s >> 1) & 7];
      bass(C(run, t, run.low), song.key - 12 + ch.r + off, sd * 1.8, 0.8, 'pulse');
    }
    if (s === 0 && has('pad')) pad(C(run, t, run.padG), notes, sd * 16, 1, 1100);
    if (has('arp')) {
      const idx = song.arpPat[(s >> 1) % song.arpPat.length] + ((s >> 3) & 1);
      const nn = notes[idx % notes.length] + 12 * ((idx / notes.length) | 0) + 12;
      if (s % 2 === 0) tone(C(run, t, run.fx), 'triangle', mtof(nn), null, sd * 1.7, 0.09, { atk: 0.003, filter: { type: 'lowpass', f: 2800, q: 0.7 } });
    }
    if (has('stab') && (s === 0 || s === 6 || s === 10)) stab(C(run, t, run.fx), chordMidi(song.key, ch, 2), sd * 2, 0.8, 2800);
    const lm = /lead:(\w+)/.exec(L);
    if (lm) {
      const ph = song[lm[1]], n = ph.get((bar % 2) * 16 + s);
      if (n) lead(C(run, t, run.fx), degMidi(song.key + 12, song.scale, n.deg), n.len * sd * 0.95, 0.9);
    }
  },
};

/** Anatolian electronic / psychedelic funk: Hicaz or Hüseyni approximations, saz (Karplus-Strong), darbuka. */
const anadolu = {
  name: 'Anadolu Elektro', bpm: [112, 124], spb: 16, swing: 0.1, mix: 0.9,
  newSong(rng) {
    const huseyni = rng.chance(0.4);
    const scale = huseyni ? SCALES.huseyni : SCALES.hicaz;
    const key = rng.pick([50, 52, 45, 47, 43]) + 12;
    const nineEight = rng.chance(0.5);
    const spb = nineEight ? 18 : 16;
    const ton = huseyni ? { r: 0, q: 'm' } : { r: 0, q: 'M' };
    const flat2 = huseyni ? { r: 10, q: 'M' } : { r: 1, q: 'M' };
    const dom = { r: 7, q: 'p5' };
    const drone = { r: 0, q: 'p5' };
    const progA = [ton, ton, flat2, ton];
    const progB = [ton, flat2, ton, dom];
    const A = makePhrase(rng, scale, spb * 2, spb, 0.55, 0, rng.pick([0, 4, 0]), -1, 8);
    const B = vary(rng, A, scale, spb * 2, spb, 0);
    const Cc = makePhrase(rng, scale, spb * 2, spb, 0.7, 4, 0, 0, 10);
    // darbuka patterns
    let pat;
    if (nineEight) pat = { dum: [0, 8], tek: [4, 12], ka: [2, 6, 10, 14, 16], ghost: [15] };
    else pat = rng.pick([
      { dum: [0, 6, 10], tek: [4, 12], ka: [2, 8, 14], ghost: [15] },
      { dum: [0, 3, 10], tek: [4, 8, 12], ka: [6, 14], ghost: [7, 15] },
      { dum: [0, 8, 11], tek: [4, 12], ka: [2, 6, 10, 14], ghost: [] },
    ]);
    const bpat = nineEight ? [[0, 12], [4, 7], [8, 0], [12, 0], [14, 1]] : [[0, 0], [3, 0], [6, 12], [8, 0], [10, 1], [14, 0]];
    return {
      key, scale, spb, A: indexPhrase(A), B: indexPhrase(B), C: indexPhrase(Cc), C2: indexPhrase(vary(rng, Cc, scale, spb * 2, spb, 0)),
      pat, bpat, nineEight, groove: nineEight ? 'karsilama' : 'funk',
      sec: [
        { name: 'intro', bars: 4, prog: [drone], L: 'darbuka drone saz:A' },
        { name: 'verse', bars: 8, prog: progA.concat(progA), L: 'darbuka kick bass drone hat saz:A' },
        { name: 'chorus', bars: 8, prog: progB.concat(progB), L: 'darbuka kick snare bass drone hat saz:B pulse:C' },
        { name: 'break', bars: 4, prog: [flat2, ton], L: 'darbuka drone saz:B' },
        { name: 'verse', bars: 8, prog: progA.concat(progA), L: 'darbuka kick bass drone hat pulse:A saz:B' },
        { name: 'chorus', bars: 8, prog: progB.concat(progB), L: 'darbuka kick snare bass drone hat saz:C pulse:C2' },
        { name: 'outro', bars: 4, prog: [ton], L: 'darbuka drone saz:A' },
      ],
    };
  },
  step(run, song, sec, bar, s, t, sd) {
    const L = sec.L, has = (k) => L.includes(k), spb = song.spb;
    const ch = sec.prog[bar % sec.prog.length];
    const P = song.pat;
    const last = bar === sec.bars - 1;
    if (has('darbuka')) {
      const c = C(run, t, run.perc);
      if (P.dum.includes(s)) dum(c, 0.9);
      else if (P.tek.includes(s)) tek(c, 0.8);
      else if (P.ka.includes(s)) ka(c, 0.65 + 0.2 * Math.random());
      else if (P.ghost.includes(s)) ka(c, 0.35);
      if (last && s >= spb - 4 && s % 2 === 0) tek(c, 0.7);   // fill
    }
    if (has('kick') && !song.nineEight && (s === 0 || s === 10)) kick(C(run, t), 0.8, 'syn');
    if (has('kick') && song.nineEight && (s === 0 || s === 8)) kick(C(run, t), 0.7, 'syn');
    if (has('snare') && !song.nineEight && (s === 4 || s === 12)) clap(C(run, t), 0.6);
    if (has('hat') && s % 2 === 0 && s % 4 !== 0) hat(C(run, t), 0.5, false);
    if (has('bass')) for (const [bs, off] of song.bpat) if (bs === s) bass(C(run, t, run.low), song.key - 24 + ch.r + (off === 1 ? 1 : off), sd * 2.4, 0.9, 'acid');
    if (s === 0 && has('drone')) pad(C(run, t, run.padG), chordMidi(song.key - 12, ch, 1).concat([song.key + ch.r + 12]), sd * spb, 0.9, 1400);
    const sm = /saz:(\w+)/.exec(L);
    if (sm) {
      const n = song[sm[1]].get((bar % 2) * spb + s);
      if (n) {
        const m = degMidi(song.key, song.scale, n.deg);
        saz(C(run, t, run.fx), m, 0.9, 0.9);
        if (n.len > 3 && song.sectionOrnament) saz(C(run, t + sd * 0.5, run.fx), m + 1, 0.4, 0.5);
        if (n.s % 4 === 0 && n.len >= 2) saz(C(run, t + sd * 0.5 + (run.swingT || 0), run.fx), m, 0.5, 0.45); // tremolo-like re-pick
      }
    }
    const pm = /pulse:(\w+)/.exec(L);
    if (pm) {
      const n = song[pm[1]].get((bar % 2) * spb + s);
      if (n) pulseLead(C(run, t, run.fx), degMidi(song.key + 12, song.scale, n.deg), n.len * sd * 0.95, 0.9, degMidi(song.key + 12, song.scale, n.deg - 1));
    }
  },
};

/** Lo-fi chill hop: swung boom-bap, jazzy 7ths on electric piano, vinyl crackle, tape wobble. */
const lofi = {
  name: 'Gece Dalgası', bpm: [74, 86], spb: 16, swing: 0.2, mix: 1.0, lofi: true,
  newSong(rng) {
    const key = rng.pick([48, 50, 53, 55, 45]) + 12;
    const scale = SCALES.dorian;
    const prog1 = rng.pick([
      [{ r: 2, q: 'm7' }, { r: 7, q: 'd7' }, { r: 0, q: 'M7' }, { r: 9, q: 'm7' }],
      [{ r: 0, q: 'm7' }, { r: 5, q: 'd7' }, { r: 3, q: 'M7' }, { r: 7, q: 'm7' }],
      [{ r: 0, q: 'M7' }, { r: 4, q: 'm7' }, { r: 9, q: 'm7' }, { r: 2, q: 'm7' }],
    ]);
    const prog2 = rng.pick([
      [{ r: 5, q: 'M7' }, { r: 4, q: 'm7' }, { r: 2, q: 'm7' }, { r: 7, q: 'd7' }],
      [{ r: 9, q: 'm7' }, { r: 2, q: 'm9' }, { r: 7, q: 'd7' }, { r: 0, q: 'M7' }],
    ]);
    const pent = SCALES.pent;
    const A = makePhrase(rng, pent, 32, 16, 0.3, 3, 2, 0, 8);
    const B = vary(rng, A, pent, 32, 16, 0);
    return {
      key, scale, pent, A: indexPhrase(A), B: indexPhrase(B),
      kickPat: rng.pick([[0, 7, 10], [0, 6, 10], [0, 7, 11]]),
      sec: [
        { name: 'intro', bars: 4, prog: prog1, L: 'chord crackle hat' },
        { name: 'verse', bars: 8, prog: prog1.concat(prog1), L: 'chord kick snare hat bass crackle mel:A' },
        { name: 'chorus', bars: 8, prog: prog2.concat(prog1), L: 'chord kick snare hat bass crackle mel:B pad' },
        { name: 'break', bars: 4, prog: prog2, L: 'chord crackle pad' },
        { name: 'verse', bars: 8, prog: prog1.concat(prog2), L: 'chord kick snare hat bass crackle mel:B' },
        { name: 'outro', bars: 4, prog: prog1, L: 'chord crackle hat' },
      ],
    };
  },
  step(run, song, sec, bar, s, t, sd) {
    const L = sec.L, has = (k) => L.includes(k);
    const ch = sec.prog[bar % sec.prog.length];
    const hum = () => 0.75 + Math.random() * 0.25;
    if (has('kick') && song.kickPat.includes(s)) kick(C(run, t), 0.85 * hum(), 'lofi');
    if (has('snare') && (s === 4 || s === 12)) snare(C(run, t), 0.8 * hum(), 'lofi');
    if (has('hat') && s % 2 === 0) hat(C(run, t), (s % 4 === 0 ? 0.55 : 0.35) * hum(), false);
    if (has('bass') && (s === 0 || s === 6 || s === 10)) bass(C(run, t, run.low), song.key - 12 + ch.r, sd * 3.5, 0.9, 'sub');
    if (has('chord') && (s === 0 || s === 7 || s === 10 || (s === 14 && bar % 2))) {
      const nn = chordMidi(song.key, ch, 0);
      nn.forEach((m, i) => ep(later(C(run, t, run.fx), i * 0.012 + Math.random() * 0.01), m, sd * (s === 0 ? 5 : 3), 0.7 - i * 0.04));
    }
    if (s === 0 && has('pad')) pad(C(run, t, run.padG), chordMidi(song.key, ch, 0), sd * 16, 0.7, 700);
    if (has('crackle') && s % 2 === 0) for (let i = 0; i < 2; i++) if (Math.random() < 0.5) noiseHit(C(run, t + Math.random() * sd * 2, run.crk), 0.004, 0.02 + Math.random() * 0.05, { type: 'highpass', f: 2000, q: 0.5 }, 0.0005);
    const mm = /mel:(\w+)/.exec(L);
    if (mm) {
      const n = song[mm[1]].get((bar % 2) * 16 + s);
      if (n) bell(C(run, t, run.fx), degMidi(song.key + 12, song.pent, n.deg), n.len * sd * 1.4, 0.8);
    }
  },
};

/** House / techno: four-on-the-floor, offbeat bass, sidechained pads, filtered stabs, builds and drops. */
const house = {
  name: 'Radyo Yedi Tepe', bpm: [122, 130], spb: 16, swing: 0.05, mix: 0.9,
  newSong(rng) {
    const key = rng.pick([45, 47, 48, 50, 43, 41]) + 12;
    const techno = rng.chance(0.35);
    const scale = SCALES.minor;
    const progA = techno ? [{ r: 0, q: 'm' }] : rng.pick([[{ r: 0, q: 'm7' }, { r: 0, q: 'm7' }, { r: 8, q: 'M7' }, { r: 10, q: 'd7' }], [{ r: 0, q: 'm7' }, { r: 5, q: 'm7' }, { r: 8, q: 'M7' }, { r: 7, q: 'm7' }]]);
    const L1 = makePhrase(rng, SCALES.pent, 32, 16, 0.45, 3, 0, 0, 8);
    return {
      key, scale, techno, L1: indexPhrase(L1), L2: indexPhrase(vary(rng, L1, SCALES.pent, 32, 16, 2)),
      bassPat: techno ? [2, 6, 10, 14] : rng.pick([[2, 6, 10, 14], [2, 3, 6, 10, 14], [2, 6, 7, 10, 14]]),
      stabPat: rng.pick([[0, 3, 6, 10], [3, 6, 10, 13], [0, 6, 9, 12]]),
      sec: [
        { name: 'intro', bars: 8, prog: progA, L: 'kick hat' },
        { name: 'build', bars: 8, prog: progA, L: 'kick hat ohat bass riser' },
        { name: 'drop', bars: 16, prog: progA, L: 'kick clap hat ohat bass pad stab lead:L1' },
        { name: 'break', bars: 8, prog: progA, L: 'pad lead:L2 riser' },
        { name: 'drop', bars: 16, prog: progA, L: 'kick clap hat ohat bass pad stab lead:L1 perc' },
        { name: 'outro', bars: 8, prog: progA, L: 'kick hat' },
      ],
    };
  },
  step(run, song, sec, bar, s, t, sd, gStep, bg) {
    const L = sec.L, has = (k) => L.includes(k);
    const ch = sec.prog[bar % sec.prog.length];
    if (has('kick') && s % 4 === 0) {
      kick(C(run, t), 0.95, 'house');
      const g = run.pump.gain; g.setValueAtTime(0.25, t); g.linearRampToValueAtTime(1, t + sd * 3.2);
    }
    if (has('clap') && (s === 4 || s === 12)) clap(C(run, t), 0.75);
    if (has('hat') && s % 2 === 0 && s % 4 !== 2) hat(C(run, t), s % 4 === 0 ? 0.5 : 0.8, false);
    if (has('hat') && s % 2 === 1) hat(C(run, t), 0.35, false);
    if (has('ohat') && s % 4 === 2) hat(C(run, t), 0.8, true);
    if (has('perc') && (s === 3 || s === 11 || s === 14)) shaker(C(run, t), 0.8);
    if (has('bass') && song.bassPat.includes(s)) bass(C(run, t, run.pumped), song.key - 12 + ch.r, sd * 1.7, 0.85, song.techno ? 'acid' : 'saw');
    if (s === 0 && has('pad')) pad(C(run, t, run.pumpedPad), chordMidi(song.key, ch, 0), sd * 16, 0.8, 1000);
    if (has('stab') && song.stabPat.includes(s)) stab(C(run, t, run.fx), chordMidi(song.key, ch, 1), sd * 1.5, 0.75, 1800 + 1400 * Math.sin(bg * 0.05 + 1));
    if (has('riser') && s === 0) riser(C(run, t, run.fx), sd * 16 * Math.min(sec.bars, 4), 0.5);
    if (has('riser') && sec.name === 'build' && bar >= sec.bars - 1 && s % 2 === 0) snare(C(run, t), 0.25 + s * 0.04, 'syn');
    const lm = /lead:(\w+)/.exec(L);
    if (lm) {
      const n = song[lm[1]].get((bar % 2) * 16 + s);
      if (n) tone(C(run, t, run.fx), 'square', mtof(degMidi(song.key + 24, SCALES.pent, n.deg)), null, sd * Math.min(n.len, 3), 0.1, { atk: 0.003, filter: { type: 'lowpass', f: 3400, f2: 800, q: 4 } });
    }
  },
};

/** Mellow menu theme: soft pads, bell arpeggios, warm sub, no drums beyond a gentle kick/shaker. */
const menuTheme = {
  name: 'Menü', bpm: [70, 72], spb: 16, swing: 0.1, mix: 0.95, menu: true,
  newSong(rng) {
    const key = rng.pick([45, 48, 50]) + 12;
    const prog = [{ r: 0, q: 'm9' }, { r: 8, q: 'M7' }, { r: 3, q: 'M7' }, { r: 10, q: 'M6' }];
    const prog2 = [{ r: 0, q: 'm7' }, { r: 5, q: 'm7' }, { r: 8, q: 'M7' }, { r: 7, q: 'm7' }];
    const A = makePhrase(rng, SCALES.pent, 32, 16, 0.22, 3, 0, 0, 8);
    return {
      key, A: indexPhrase(A), B: indexPhrase(vary(rng, A, SCALES.pent, 32, 16, 2)),
      sec: [
        { name: 'a', bars: 8, prog: prog.concat(prog), L: 'pad arp sub shaker' },
        { name: 'b', bars: 8, prog: prog2.concat(prog), L: 'pad arp sub kick shaker mel:A' },
        { name: 'c', bars: 8, prog: prog.concat(prog2), L: 'pad arp sub shaker mel:B' },
      ],
    };
  },
  step(run, song, sec, bar, s, t, sd) {
    const L = sec.L, has = (k) => L.includes(k);
    const ch = sec.prog[bar % sec.prog.length];
    const nn = chordMidi(song.key, ch, 0);
    if (s === 0 && has('pad')) pad(C(run, t, run.padG), nn, sd * 16, 1.1, 900);
    if (has('arp') && s % 2 === 0) {
      const idx = [0, 2, 1, 3, 2, 4, 1, 3][(s >> 1) & 7] % nn.length;
      bell(C(run, t, run.fx), nn[idx] + 12, sd * 4, 0.55);
    }
    if (has('sub') && s === 0) bass(C(run, t, run.low), song.key - 12 + ch.r, sd * 14, 0.8, 'sub');
    if (has('kick') && (s === 0 || s === 10)) kick(C(run, t), 0.55, 'lofi');
    if (has('shaker') && s % 4 === 2) shaker(C(run, t), 0.6);
    const mm = /mel:(\w+)/.exec(L);
    if (mm) { const n = song[mm[1]].get((bar % 2) * 16 + s); if (n) ep(C(run, t, run.fx), degMidi(song.key + 12, SCALES.pent, n.deg), n.len * sd * 1.5, 0.9); }
  },
};

export const STATIONS = [synthwave, anadolu, lofi, house];

// ---------------------------------------------------------------- engine
export function createMusic(mx, game, noise) {
  const ctx = mx.ctx;
  const G = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const carLP = ctx.createBiquadFilter(); carLP.type = 'lowpass'; carLP.frequency.value = 5200; carLP.Q.value = 0.5;
  const carHP = ctx.createBiquadFilter(); carHP.type = 'highpass'; carHP.frequency.value = 60;
  carLP.connect(carHP);
  // stereo widener
  const dry = G(1); carHP.connect(dry); dry.connect(mx.buses.music);
  for (const [dt, pan] of [[0.017, -0.85], [0.026, 0.85]]) {
    const d = ctx.createDelay(0.1); d.delayTime.value = dt; const g = G(0.22);
    carHP.connect(d); d.connect(g);
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(mx.buses.music); } else g.connect(mx.buses.music);
  }

  let run = null, wanted = null, cur = null;
  let seedCounter = (Math.random() * 1e9) | 0;

  function buildRun(station) {
    const r = { ctx, noise, station, mix: G(0), next: 0, step: 0, bar: 0, song: null, rng: null, stopping: false };
    const now = ctx.currentTime;
    r.mix.gain.setValueAtTime(0, now);
    r.mix.gain.linearRampToValueAtTime(station.mix * 0.8, now + 0.5);
    if (station.lofi) {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3400; lp.Q.value = 0.5;
      const wob = ctx.createOscillator(); wob.frequency.value = 0.35; const wg = G(220); wob.connect(wg); wg.connect(lp.frequency); wob.start();
      r.mix.connect(lp); lp.connect(carLP); r.extra = [lp, wob, wg];
    } else r.mix.connect(carLP);
    // sub-buses
    r.low = G(1); r.low.connect(r.mix);
    r.padG = G(0.75); r.padG.connect(r.mix);
    r.perc = G(0.9); r.perc.connect(r.mix);
    r.crk = G(0.8); r.crk.connect(r.mix);
    r.pump = null;
    if (station === house) {
      const pg = G(1); r.pumpNode = pg; r.pump = pg; // pump.gain is the param used by the sequencer
      r.pumped = G(1); r.pumpedPad = G(0.75);
      r.pumped.connect(pg); r.pumpedPad.connect(pg); pg.connect(r.mix);
    }
    // gated-snare reverb send (synthwave) and general effect bus with dotted-eighth delay
    r.gate = G(1); r.gate.connect(r.mix); r.gate.connect(mx.revIn);
    r.fx = G(0.9); r.fx.connect(r.mix);
    r.delay = ctx.createDelay(2); r.dfb = G(0.38); r.dlp = ctx.createBiquadFilter(); r.dlp.type = 'lowpass'; r.dlp.frequency.value = 2600; r.dsend = G(station === anadolu ? 0.45 : station === menuTheme ? 0.3 : 0.28);
    r.fx.connect(r.dsend); r.dsend.connect(r.delay); r.delay.connect(r.dlp); r.dlp.connect(r.dfb); r.dfb.connect(r.delay); r.dlp.connect(r.mix);
    r.fx.connect(mx.revIn);
    return r;
  }

  const dying = [];
  function killRun(r) {
    try {
      for (const n of [r.mix, r.low, r.padG, r.perc, r.crk, r.gate, r.fx, r.delay, r.dfb, r.dlp, r.dsend, r.pumpNode, r.pumped, r.pumpedPad, ...(r.extra || [])]) {
        if (!n) continue;
        if (n.stop) { try { n.stop(); } catch { /* ignore */ } }
        n.disconnect();
      }
    } catch { /* ignore */ }
  }

  function stopRun(r, fade = 0.35) {
    if (!r || r.stopping) return;
    r.stopping = true;
    const now = ctx.currentTime;
    r.mix.gain.cancelScheduledValues(now);
    r.mix.gain.setTargetAtTime(0, now, fade / 3);
    r.killAt = now + 4.5;
    dying.push(r);
  }

  function newSong(r) {
    const st = r.station;
    r.rng = rng32(seedCounter = (seedCounter + 7919 + ((Math.random() * 1e6) | 0)) | 0);
    r.song = st.newSong(r.rng);
    r.song.total = r.song.sec.reduce((a, s) => a + s.bars, 0);
    r.bar = 0; r.stepInBar = 0;
    const bpm = st.bpm[0] + r.rng() * (st.bpm[1] - st.bpm[0]);
    r.spb = r.song.spb || st.spb;
    r.sd = 60 / (Math.round(bpm)) / 4;
    r.dfbTime = r.sd * 3;
    r.delay.delayTime.value = Math.min(1.9, r.sd * 3);
  }
  const secAt = (song, bar) => { let b = bar; for (const s of song.sec) { if (b < s.bars) return [s, b]; b -= s.bars; } return null; };

  function pump(r, now) {
    if (!r.song) { newSong(r); r.next = now + 0.06; r.step = 0; }
    const lim = now + LOOKAHEAD;
    if (r.next < now - 0.25) r.next = now + 0.05; // recover after a stall
    let guard = 0;
    while (r.next < lim && guard++ < 64) {
      const song = r.song, s = r.stepInBar;
      const sa = secAt(song, r.bar);
      if (!sa) { newSong(r); continue; }
      const [sec, b] = sa;
      const sw = (s & 1) ? r.station.swing * r.sd : 0;
      try { r.station.step(r, song, sec, b, s, r.next + sw, r.sd, r.step, r.bar); } catch (e) { if (!r.warned) { r.warned = true; console.warn('[audio] music step', e); } }
      r.next += r.sd; r.step++;
      if (++r.stepInBar >= r.spb) { r.stepInBar = 0; r.bar++; if (r.bar >= song.total) { r.song = null; newSong(r); } }
    }
  }

  return {
    stations: STATIONS,
    /** F: frame info; radio: station index (0 = off). */
    update(F, radio) {
      const now = F.now;
      for (let i = dying.length - 1; i >= 0; i--) if (now > dying[i].killAt) { killRun(dying[i]); dying.splice(i, 1); }
      const musicOn = game.settings?.music !== false;
      let want = null;
      if (musicOn) {
        if (F.mode === 'menu') want = menuTheme;
        else if (F.mode !== 'menu' && F.inVeh && radio > 0 && (F.playing || F.mode === 'paused')) want = STATIONS[(radio - 1) % STATIONS.length];
      }
      if (want !== cur) {
        if (run) { stopRun(run); run = null; }
        cur = want;
        if (want) run = buildRun(want);
      }
      if (run && !run.stopping) {
        pump(run, now);
        setTargetSafe(carLP.frequency, F.mode === 'menu' ? 12000 : 5200, now);
      }
    },
    get info() { return { station: cur?.name || null, bar: run?.bar ?? -1, section: run?.song ? (secAt(run.song, run.bar)?.[0].name ?? null) : null, step: run?.step ?? 0 }; },
    stationName: (i) => STATIONS[(i - 1 + STATIONS.length) % STATIONS.length].name,
    menuTheme,
  };
}
function setTargetSafe(p, v, now) { try { p.setTargetAtTime(v, now, 0.3); } catch { /* ignore */ } }
