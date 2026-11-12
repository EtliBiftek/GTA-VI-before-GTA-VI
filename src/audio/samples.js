// Neon Coast audio - recorded-sample layer (CC0 / CC-BY, see CREDITS.md "Audio").
//
// Contract: the game ALWAYS keeps its synthesised recipes. Every sound asks `samples.pick(name)`; until (or unless) that sound's
// OGG has been fetched + decoded this returns null and the caller uses the synth recipe, so a missing / broken / slow file never
// silences or breaks anything and nothing here ever throws into the game loop.
//
//   createSamples(ctx, { base, enabled })                 -> samples
//   samples.preload()                                     -> Promise (tier 0 core SFX first, then vehicles/ambience loops, then rare)
//   samples.pick(name)                                    -> { buf, entry, file, rate } | null   (random loaded variation, no immediate repeat)
//   samples.playOn(pick, out, t, { pitch, gain })         -> AudioBufferSourceNode | null        (one-shot through the caller's chain)
//   samples.loop(file, dest, { gain })                    -> handle { gain:GainNode, ready, setRate(v,now,tau), setGain(v,now,tau) }
//   samples.has(name) / samples.stats
//
// Files live in public/assets/audio/ and are requested with RELATIVE urls (./assets/audio/...) because the production build runs
// from file:// (Electron) and from the Capacitor WebView: fetch() cannot read file:// in Chromium, so XHR is used there.
import { rnd } from './synth.js';

const BASE = './assets/audio/';

const f = (cat, name, n) => Array.from({ length: n }, (_, i) => `${cat}/${name}_${i + 1}`);

/**
 * name -> { files, gain, pitch:[lo,hi], synth, tier }
 *   gain   linear level of the sample (normalised files peak around -1 dBFS; tuned with the offline harness against the synth levels)
 *   pitch  random playback-rate range (multiplied by the caller's opts.pitch)
 *   synth  how much of the synthesised recipe stays layered under the sample (0 = sample only)
 *   tier   preload order: 0 core one-shots, 1 vehicle + ambience loops, 2 rarely heard
 * LOOPS (looped by loop(), not listed here): vehicles/engine_low, engine_high, siren_wail, siren_yelp, skid_loop; ambience/traffic, waves, wind, crickets.
 */
export const MANIFEST = {
  pistol: { files: f('weapons', 'pistol', 4), gain: 0.5, pitch: [0.97, 1.04], synth: 0.12, tier: 0 },
  smg: { files: f('weapons', 'smg', 5), gain: 0.5, pitch: [0.97, 1.05], synth: 0.1, tier: 0 },
  shotgun: { files: f('weapons', 'shotgun', 3), gain: 0.5, pitch: [0.97, 1.03], synth: 0.12, tier: 0 },
  rifle: { files: f('weapons', 'rifle', 4), gain: 0.5, pitch: [0.97, 1.04], synth: 0.1, tier: 0 },
  sniper: { files: f('weapons', 'sniper', 3), gain: 0.5, pitch: [0.97, 1.03], synth: 0.12, tier: 0 },
  rpg: { files: ['weapons/rpg_launch'], gain: 0.5, pitch: [0.96, 1.04], synth: 0.7, tier: 0 },
  reload: { files: f('weapons', 'reload', 3), gain: 0.5, pitch: [0.97, 1.03], synth: 0, tier: 0 },
  pump: { files: f('weapons', 'pump', 2), gain: 0.5, pitch: [0.97, 1.03], synth: 0, tier: 0 },
  empty: { files: f('weapons', 'empty', 2), gain: 0.5, pitch: [0.95, 1.05], synth: 0, tier: 0 },
  weaponSwitch: { files: f('weapons', 'switch', 2), gain: 0.5, pitch: [0.95, 1.05], synth: 0.2, tier: 0 },
  shell: { files: f('weapons', 'shell', 4), gain: 0.5, pitch: [1.0, 1.35], synth: 0, tier: 0 },
  impact: { files: f('impacts', 'impact', 4), gain: 0.5, pitch: [0.9, 1.1], synth: 0.25, tier: 0 },
  ping: { files: f('impacts', 'ping', 3), gain: 0.5, pitch: [0.95, 1.2], synth: 0.3, tier: 0 },
  explosion: { files: f('impacts', 'explosion', 4), gain: 0.5, pitch: [0.92, 1.05], synth: 0.35, tier: 0 },
  explosionFar: { files: f('impacts', 'explosion_far', 2), gain: 0.5, pitch: [0.92, 1.05], synth: 0.15, tier: 0 },
  crash: { files: f('impacts', 'crash', 5), gain: 0.5, pitch: [0.9, 1.1], synth: 0.45, tier: 0 },
  glass: { files: f('impacts', 'glass', 4), gain: 0.5, pitch: [0.92, 1.08], synth: 0.3, tier: 0 },
  punch: { files: f('character', 'punch', 5), gain: 0.5, pitch: [0.92, 1.08], synth: 0.2, tier: 0 },
  batHit: { files: f('character', 'bat', 3), gain: 0.5, pitch: [0.92, 1.08], synth: 0.2, tier: 0 },
  bodyHit: { files: f('character', 'body', 3), gain: 0.5, pitch: [0.9, 1.1], synth: 0.2, tier: 0 },
  hit: { files: f('character', 'hurt', 3), gain: 0.5, pitch: [0.88, 1.05], synth: 0.25, tier: 0 },
  footstep: { files: f('character', 'step', 6), gain: 0.5, pitch: [0.92, 1.1], synth: 0, tier: 0 },
  land: { files: f('character', 'land', 3), gain: 0.5, pitch: [0.92, 1.08], synth: 0.35, tier: 0 },
  door: { files: f('vehicles', 'door_close', 2), gain: 0.5, pitch: [0.92, 1.05], synth: 0.15, tier: 0 },
  doorOpen: { files: f('vehicles', 'door_open', 2), gain: 0.5, pitch: [0.92, 1.05], synth: 0.15, tier: 0 },
  horn: { files: f('vehicles', 'horn', 2), gain: 0.5, pitch: [0.85, 1.2], synth: 0.5, tier: 0 },
  click: { files: f('ui', 'click', 2), gain: 0.5, pitch: [0.95, 1.05], synth: 0.3, tier: 0 },
  hover: { files: f('ui', 'hover', 2), gain: 0.5, pitch: [0.95, 1.05], synth: 0.3, tier: 0 },
  pickup: { files: ['ui/pickup_1', 'ui/pickup_3'], gain: 0.5, pitch: [0.97, 1.03], synth: 0.35, tier: 0 },
  money: { files: f('ui', 'money', 4), gain: 0.5, pitch: [0.97, 1.04], synth: 0.3, tier: 0 },
  gull: { files: f('ambience', 'gull', 7), gain: 0.5, pitch: [0.9, 1.12], synth: 0, tier: 1 },
  tramBell: { files: f('ambience', 'tram', 2), gain: 0.5, pitch: [0.95, 1.08], synth: 0.3, tier: 1 },
  boat: { files: ['ambience/boat_1'], gain: 0.5, pitch: [0.9, 1.05], synth: 0.35, tier: 1 },
};

/** Loop files with their tier (preloaded after the core one-shots). */
export const LOOPS = {
  'vehicles/engine_low': 1, 'vehicles/engine_high': 1, 'vehicles/skid_loop': 1, 'vehicles/siren_wail': 1, 'vehicles/siren_yelp': 1,
  'ambience/traffic': 1, 'ambience/waves': 1, 'ambience/wind': 1, 'ambience/crickets': 2,
};

function readBytes(url) {
  return new Promise((resolve, reject) => {
    const viaXhr = () => {
      try {
        const x = new XMLHttpRequest();
        x.open('GET', url);
        x.responseType = 'arraybuffer';
        x.onload = () => ((x.status === 200 || (x.status === 0 && x.response && x.response.byteLength)) ? resolve(x.response) : reject(new Error('HTTP ' + x.status)));
        x.onerror = () => reject(new Error('network error'));
        x.send();
      } catch (e) { reject(e); }
    };
    if (typeof fetch !== 'function' || (typeof location !== 'undefined' && location.protocol === 'file:')) { viaXhr(); return; }
    fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('HTTP ' + r.status)))).then(resolve, viaXhr);
  });
}

function decode(ctx, ab) {
  return new Promise((resolve, reject) => {
    try {
      const p = ctx.decodeAudioData(ab, resolve, reject);          // callback form works on old WebViews, the promise form on new ones
      if (p && typeof p.then === 'function') p.then(resolve, reject);
    } catch (e) { reject(e); }
  });
}

export function createSamples(ctx, o = {}) {
  const base = o.base ?? BASE;
  const enabled = o.enabled !== false;
  const bufs = new Map();         // file -> AudioBuffer
  const failed = new Set();
  const pending = new Map();      // file -> Promise<AudioBuffer|null>
  const last = new Map();         // name -> last file index (avoid immediate repeats)
  const waiters = new Map();      // file -> [fn]
  const stats = { requested: 0, decoded: 0, failed: 0, bytes: 0, decodedSeconds: 0 };
  const pick_ = { buf: null, entry: null, file: '', rate: 1 };

  function load(file) {
    if (!enabled) return Promise.resolve(null);
    if (bufs.has(file)) return Promise.resolve(bufs.get(file));
    if (failed.has(file)) return Promise.resolve(null);
    let p = pending.get(file);
    if (p) return p;
    stats.requested++;
    p = readBytes(base + file + '.ogg')
      .then((ab) => { stats.bytes += ab.byteLength; return decode(ctx, ab); })
      .then((buf) => {
        if (!buf || !(buf.duration > 0)) throw new Error('empty buffer');
        bufs.set(file, buf); stats.decoded++; stats.decodedSeconds += buf.duration;
        const w = waiters.get(file);
        if (w) { waiters.delete(file); for (const fn of w) { try { fn(buf); } catch (e) { /* ignore */ } } }
        return buf;
      })
      .catch((e) => { failed.add(file); stats.failed++; if (stats.failed <= 3) console.warn('[audio] sample unavailable, keeping synth fallback:', file, e?.message || e); return null; })
      .finally(() => pending.delete(file));
    pending.set(file, p);
    return p;
  }

  async function runQueue(files, conc = 4) {
    let i = 0;
    const worker = async () => { while (i < files.length) { const fl = files[i++]; await load(fl); } };
    await Promise.all(Array.from({ length: Math.min(conc, files.length) }, worker));
  }

  let preloadP = null;
  /** Priority preload: tier 0 (core one-shots) -> tier 1 (vehicle/ambience loops + their one-shots) -> tier 2. Idempotent. */
  function preload() {
    if (preloadP || !enabled) return preloadP || Promise.resolve();
    const tiers = [[], [], []];
    for (const e of Object.values(MANIFEST)) for (const fl of e.files) tiers[e.tier ?? 0].push(fl);
    for (const [fl, t] of Object.entries(LOOPS)) tiers[t].push(fl);
    preloadP = (async () => { for (const t of tiers) await runQueue([...new Set(t)]); })().catch(() => {});
    return preloadP;
  }

  /** Random loaded variation of a named one-shot, or null (-> caller keeps the synth recipe). Returns a shared object: read it at once. */
  function pick(name) {
    if (!enabled) return null;
    const e = MANIFEST[name];
    if (!e) return null;
    const n = e.files.length;
    let start = (Math.random() * n) | 0;
    if (n > 1 && start === last.get(name)) start = (start + 1) % n;
    for (let k = 0; k < n; k++) {
      const idx = (start + k) % n;
      const buf = bufs.get(e.files[idx]);
      if (buf) {
        last.set(name, idx);
        pick_.buf = buf; pick_.entry = e; pick_.file = e.files[idx];
        pick_.rate = rnd(e.pitch?.[0] ?? 1, e.pitch?.[1] ?? 1);
        return pick_;
      }
    }
    return null;
  }

  /** Start a picked one-shot into `out` at time t. opts { pitch (extra rate), gain (extra level) }. */
  function playOn(p, out, t, opts = {}) {
    if (!p || !p.buf) return null;
    const src = ctx.createBufferSource();
    src.buffer = p.buf;
    const rate = p.rate * (opts.pitch ?? 1);
    src.playbackRate.value = rate > 0.2 && rate < 5 ? rate : 1;
    const g = ctx.createGain();
    g.gain.value = (p.entry.gain ?? 0.5) * (opts.gain ?? 1);
    src.connect(g); g.connect(out);
    src.onended = () => { try { src.disconnect(); g.disconnect(); } catch { /* ignore */ } };
    src.start(t);
    return src;
  }

  /**
   * Seamless loop player attached to `dest` through its own gain node. The source starts as soon as the file is decoded
   * (random offset); until then `ready` is false and callers keep their synth layer at full level.
   */
  function loop(file, dest, lo = {}) {
    const h = { file, gain: ctx.createGain(), src: null, ready: false, onReady: null, setRate() {}, setGain() {} };
    h.gain.gain.value = lo.gain ?? 0;
    try { h.gain.connect(dest); } catch { /* ignore */ }
    const start = (buf) => {
      try {
        const src = ctx.createBufferSource();
        src.buffer = buf; src.loop = true; src.loopStart = 0; src.loopEnd = buf.duration;
        src.connect(h.gain);
        src.start(0, Math.random() * buf.duration);
        h.src = src; h.ready = true;
        h.setRate = (v, now, tau = 0.05) => { if (Number.isFinite(v)) { try { src.playbackRate.setTargetAtTime(v, now, tau); } catch { /* ignore */ } } };
        if (h.onReady) h.onReady(h);
      } catch { /* keep synth */ }
    };
    h.setGain = (v, now, tau = 0.1) => { if (Number.isFinite(v)) { try { h.gain.gain.setTargetAtTime(v, now, tau); } catch { /* ignore */ } } };
    if (bufs.has(file)) start(bufs.get(file));
    else if (enabled) {
      const w = waiters.get(file) || [];
      w.push(start); waiters.set(file, w);
      load(file);
    }
    return h;
  }

  return {
    preload, load, pick, playOn, loop, MANIFEST,
    has: (name) => { const e = MANIFEST[name]; return !!e && e.files.some((fl) => bufs.has(fl)); },
    isLoaded: (file) => bufs.has(file),
    get enabled() { return enabled; },
    get stats() { return { ...stats, loaded: bufs.size, failedFiles: [...failed] }; },
    get preloadDone() { return preloadP; },
  };
}
