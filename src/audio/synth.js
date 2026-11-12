// Neon Coast audio - low-level synthesis helpers shared by every audio module.
// A "context" `c` is { ctx, out, t, p (pitch multiplier), noise: {white,pink,brown} }.
// Every helper cleans up its own nodes on `ended`; nothing here allocates per frame.

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const hz = (f) => (f < 16 ? 16 : f > 20000 ? 20000 : f);
export const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
export const pickOne = (arr) => arr[(Math.random() * arr.length) | 0];

/** Seeded RNG (mulberry32) for deterministic song generation. */
export function rng32(seed) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (a2, b) => a2 + f() * (b - a2);
  f.int = (a2, b) => Math.floor(a2 + f() * (b - a2 + 1));
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.chance = (p) => f() < p;
  return f;
}

/** White / pink / brown noise buffers, rendered once per context. */
const XF = 2048;
export function makeNoise(ctx) {
  const sr = ctx.sampleRate, len = Math.floor(sr * 4);
  const mk = () => ctx.createBuffer(1, len, sr);
  const white = mk(), pink = mk(), brown = mk();
  const w = white.getChannelData(0), p = pink.getChannelData(0), b = brown.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const x = Math.random() * 2 - 1;
    w[i] = x;
    b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759;
    b2 = 0.969 * b2 + x * 0.153852; b3 = 0.8665 * b3 + x * 0.3104856;
    b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
    p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11;
    b6 = x * 0.115926;
    last = (last + 0.02 * x) / 1.02;
    b[i] = last * 3.5;
  }
  // seamless loops: blend the head with the region after the loop end (loopEnd = len - XF)
  for (const d of [w, p, b]) {
    for (let i = 0; i < XF; i++) { const k = i / XF; d[i] = d[i] * k + d[len - XF + i] * (1 - k); }
  }
  return { white, pink, brown };
}

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

/** Enveloped oscillator, optional glide f0 -> f1 and filter. o: {atk, filter, wave, detune, curve:'exp'|'lin', hold} */
export function tone(c, type, f0, f1, dur, peak, o = {}) {
  const { ctx, t, p } = c;
  const osc = ctx.createOscillator();
  if (o.wave) osc.setPeriodicWave(o.wave); else osc.type = type;
  osc.frequency.setValueAtTime(hz(f0 * p), t);
  if (f1 != null && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(hz(f1 * p), t + dur);
  if (o.detune) osc.detune.value = o.detune;
  const g = ctx.createGain();
  const atk = o.atk ?? 0.004;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + atk);
  if (o.hold) g.gain.setValueAtTime(Math.max(0.0002, peak), t + atk + o.hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  const nodes = [osc, g, ...route(c, g, o.filter, dur)];
  osc.start(t);
  osc.stop(t + dur + 0.03);
  osc.onended = () => nodes.forEach((n) => n.disconnect());
  return osc;
}

/** Enveloped burst of noise (kind: white|pink|brown) with optional filter sweep. */
export function noiseHit(c, dur, peak, f, atk = 0.002, kind = 'white') {
  const { ctx, t } = c;
  const buf = c.noise[kind] || c.noise.white;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(g);
  const nodes = [src, g, ...route(c, g, f, dur)];
  const off = Math.random() * Math.max(0, buf.duration - dur - 0.1);
  src.start(t, off, dur + 0.02);
  src.onended = () => nodes.forEach((n) => n.disconnect());
  return src;
}

/** Two-operator FM voice (bells, electric piano). */
export function fm(c, fc, ratio, index, dur, peak, o = {}) {
  const { ctx, t, p } = c;
  const car = ctx.createOscillator(), mod = ctx.createOscillator();
  car.frequency.value = hz(fc * p);
  mod.frequency.value = hz(fc * p * ratio);
  const mg = ctx.createGain();
  mg.gain.setValueAtTime(fc * p * index, t);
  mg.gain.exponentialRampToValueAtTime(Math.max(1, fc * p * index * (o.idxEnd ?? 0.05)), t + dur);
  mod.connect(mg); mg.connect(car.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + (o.atk ?? 0.003));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  car.connect(g);
  const nodes = [car, mod, mg, g, ...route(c, g, o.filter, dur)];
  car.start(t); mod.start(t); car.stop(t + dur + 0.03); mod.stop(t + dur + 0.03);
  car.onended = () => nodes.forEach((n) => n.disconnect());
}

// ---- Karplus-Strong plucked strings (saz / bağlama / guitar-like) ---------
const KS_SR = 24000;
const ksCache = new Map();
function ksBuffer(ctx, freq, bright) {
  const P = Math.max(8, Math.round(KS_SR / freq));
  const key = P * 4 + bright;
  let e = ksCache.get(key);
  if (e) return e;
  const N = Math.floor(KS_SR * 1.4);
  const buf = ctx.createBuffer(1, N, KS_SR);
  const d = buf.getChannelData(0);
  // excitation: noise shaped by a pick position comb + one-pole lowpass
  const damp = [0.35, 0.55, 0.8][bright] ?? 0.55;
  let lp = 0;
  for (let i = 0; i < P; i++) { lp += damp * ((Math.random() * 2 - 1) - lp); d[i] = lp * 2.2; }
  const pick = Math.max(1, Math.floor(P * 0.17));
  for (let i = P - 1; i >= pick; i--) d[i] -= d[i - pick] * 0.7;
  const decay = 0.9955 + 0.0035 * (bright === 2 ? 0 : 1);
  for (let i = P; i < N; i++) d[i] = decay * 0.5 * (d[i - P] + d[i - P + 1 < i ? i - P + 1 : i - P]);
  // normalise
  let mx = 0; for (let i = 0; i < N; i++) mx = Math.max(mx, Math.abs(d[i]));
  const k = mx > 0 ? 0.9 / mx : 1;
  for (let i = 0; i < N; i++) d[i] *= k;
  e = { buf, base: KS_SR / P };
  ksCache.set(key, e);
  if (ksCache.size > 72) ksCache.delete(ksCache.keys().next().value);
  return e;
}

/** Plucked string. o: {bright:0..2, dur, strings:1|2 (double course), filter} */
export function pluck(c, freq, peak, o = {}) {
  const { ctx, t, p } = c;
  const f = freq * p;
  const e = ksBuffer(ctx, f, o.bright ?? 1);
  const dur = o.dur ?? 0.9;
  const g = ctx.createGain();
  g.gain.setValueAtTime(peak, t);
  g.gain.setValueAtTime(peak, t + dur * 0.5);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  const nodes = [g];
  const n = o.strings ?? 1;
  let first = null;
  for (let i = 0; i < n; i++) {
    const src = ctx.createBufferSource();
    src.buffer = e.buf;
    src.playbackRate.value = (f / e.base) * (i ? 1.0035 : 1);
    src.connect(g);
    src.start(t);
    src.stop(t + dur + 0.05);
    nodes.push(src);
    if (!first) first = src;
  }
  nodes.push(...route(c, g, o.filter, dur));
  first.onended = () => nodes.forEach((x) => x.disconnect());
}

/** Build a PeriodicWave from a harmonic amplitude function. */
export function harmonicWave(ctx, n, ampFn, phaseFn) {
  const re = new Float32Array(n + 1), im = new Float32Array(n + 1);
  for (let k = 1; k <= n; k++) {
    const a = ampFn(k), ph = phaseFn ? phaseFn(k) : 0;
    re[k] = a * Math.sin(ph); im[k] = a * Math.cos(ph);
  }
  try { return ctx.createPeriodicWave(re, im); } catch { return null; }
}

/** Looping noise source starting at a random offset. */
export function loopNoise(ctx, buf) {
  const s = ctx.createBufferSource();
  s.buffer = buf; s.loop = true;
  s.loopEnd = buf.duration - XF / ctx.sampleRate;
  s.start(0, Math.random() * (s.loopEnd - 0.1));
  return s;
}

/** setTargetAtTime wrapper tolerant of NaN. */
export function setT(param, v, now, tau = 0.05) {
  if (!Number.isFinite(v)) return;
  try { param.setTargetAtTime(v, now, tau); } catch { /* ignore */ }
}
