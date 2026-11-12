// Neon Coast - procedural WebAudio engine. Contract: docs/ARCHITECTURE.md (Audio section).
// createAudio(game) -> { init, update(dt), play(name, opts) }. No audio files, no network.
//   synth.js     low-level synthesis helpers (noise, tone, FM, Karplus-Strong)
//   mixer.js     buses, reverb, compressor/limiter, spatial voices, ducking
//   sfx.js       one-shot recipes (weapons, impacts, vehicles, character, UI stingers)
//   engine.js    player engine + tyres/wind/skid, AI traffic pass-bys, sirens, fire
//   ambience.js  Istanbul ambience (traffic, water, gulls, ferries, tram bell, crowd, night)
//   music.js     generative radio stations + menu theme
//   character.js footsteps, jump/land, heartbeat, reload/empty/melee detection
import { makeNoise, rnd } from './synth.js';
import { createMixer } from './mixer.js';
import { SOUNDS, WEAPON_SOUND } from './sfx.js';
import { createVehicleAudio } from './engine.js';
import { createAmbience } from './ambience.js';
import { createMusic } from './music.js';
import { createCharacter } from './character.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const warn = (() => { let n = 0; return (e) => { if (n++ < 5) console.warn('[audio]', e); }; })();

export function createAudio(game, opts = {}) {
  let ctx = null, mixer = null, noise = null, dead = false;
  let veh = null, amb = null, music = null, chr = null;
  const st = { radio: 0, inVehPrev: false };
  const pending = [];                  // delayed actions [{t, fn}] advanced in update()
  const gate = new Map();
  const ok = (key, ms) => {            // simple per-key rate limiter
    const now = performance.now();
    if (now - (gate.get(key) || -1e9) < ms) return false;
    gate.set(key, now); return true;
  };
  const after = (sec, fn) => { if (pending.length < 48) pending.push({ t: sec, fn }); };

  // ------------------------------------------------------------------ context
  function ensureCtx() {
    if (ctx || dead) return;
    try {
      if (opts.ctx) ctx = opts.ctx;                      // test hook: inject an (Offline)AudioContext
      else {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { dead = true; return; }
        ctx = new AC({ latencyHint: 'interactive' });
      }
      noise = makeNoise(ctx);
      mixer = createMixer(ctx, game);
      const tryMake = (fn) => { try { return fn(); } catch (e) { warn(e); return null; } };
      veh = tryMake(() => createVehicleAudio(mixer, game, noise));
      amb = tryMake(() => createAmbience(mixer, game, noise));
      music = tryMake(() => createMusic(mixer, game, noise));
      chr = tryMake(() => createCharacter(game));
    } catch (e) { warn(e); dead = true; ctx = null; }
  }
  const onGesture = () => {
    try {
      ensureCtx();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch (e) { warn(e); }
  };

  // ------------------------------------------------------------------ one-shots
  /**
   * Play a named one-shot. opts { x, z, volume=1, pitch=1, pan }; positional when x and z are given
   * (distance attenuation + air absorption relative to the player, pan relative to the camera).
   * Extra opts are forwarded to the recipe (e.g. k, base, len, calls). Safe no-op before the first gesture.
   */
  function play(name, opts = {}) {
    try {
      if (!ctx || !mixer || dead || (ctx.state !== 'running' && !ctx.startRendering)) return;
      const def = SOUNDS[name];
      if (!def) return;
      if ((opts.x != null && !Number.isFinite(opts.x)) || (opts.z != null && !Number.isFinite(opts.z))) return;
      const v = mixer.voice({
        x: opts.x, z: opts.z, pan: opts.pan, vol: (opts.volume ?? 1) * (def.gain ?? 0.7), wet: def.wet,
        bus: opts.bus || def.bus, maxDist: def.maxDist, ref: def.ref, dur: def.dur, speedOfSound: def.sos,
      });
      if (!v) return;
      def.build({ ctx, out: v.input, t: v.t, p: opts.pitch ?? 1, noise }, opts);
      if (def.duck) mixer.duck(def.duck * (opts.x != null ? clamp(1 - v.dist / 200, 0.2, 1) : 1), 0.6);
    } catch (e) { warn(e); }
  }

  // ------------------------------------------------------------------ frame
  const F = { dt: 0, now: 0, mode: 'menu', playing: false, paused: false, player: null, pos: null, inVeh: false, veh: null, input: {}, hour: 12, speed: 0, play, after };
  function toggleRadio() {
    const n = (music?.stations?.length || 4) + 1;
    st.radio = (st.radio + 1) % n;
    const label = st.radio ? `Radyo: ${music.stationName(st.radio)}` : 'Radyo: Kapalı';
    game.hud?.notify?.(label, 1800);
    if (st.radio) play('tune', { volume: 0.8 });
  }

  function tick(dt) {
    const mode = game.state?.mode;
    F.dt = dt; F.now = ctx.currentTime; F.mode = mode; F.playing = mode === 'playing'; F.paused = mode === 'paused';
    const player = game.player;
    F.player = player; F.pos = player?.position || null;
    F.inVeh = !!(player?.inVehicle && player.vehicle);
    F.veh = F.inVeh ? player.vehicle : null;
    F.input = game.input || {};
    F.hour = game.state?.timeOfDay ?? 12;
    F.speed = Math.abs(F.veh?.speed || 0);
    mixer.update(dt);
    if (F.playing && F.inVeh && F.input.pressed?.('radio')) toggleRadio();
    veh?.update(F);
    if (veh && !F.playing) { /* engine etc. mute themselves via F.veh below */ }
    amb?.update(F);
    music?.update(F, st.radio);
    if (F.playing) chr?.update(F);
    for (let i = pending.length - 1; i >= 0; i--) {
      pending[i].t -= dt;
      if (pending[i].t <= 0) { const p = pending.splice(i, 1)[0]; try { p.fn(); } catch (e) { warn(e); } }
    }
  }

  // ------------------------------------------------------------------ events
  const camDir = { x: 0, y: 0, z: 1 };
  function impactFromShot(d) {
    // approximate the player's bullet impact point: raycast along the camera view from the muzzle
    const e = game.camera?.matrixWorld?.elements;
    const w = game.world;
    if (!e || !w?.raycast) return;
    camDir.x = -e[8]; camDir.y = -e[9]; camDir.z = -e[10];
    const hit = w.raycast(d.x, d.y ?? 1.4, d.z, camDir.x, camDir.y, camDir.z, 120);
    if (!hit || !Number.isFinite(hit.x)) return;
    const dist = hit.dist ?? 30;
    after(clamp(dist / 450, 0.02, 0.4), () => {
      const r = Math.random();
      play(r < 0.35 ? 'ping' : r < 0.55 ? 'ricochet' : 'impact', { x: hit.x, z: hit.z, volume: rnd(0.7, 1), pitch: rnd(0.9, 1.15) });
    });
  }

  function wire() {
    const ev = game.events;
    if (!ev?.on) return;
    const on = (name, fn) => ev.on(name, (d) => { try { if (ctx && !dead) fn(d || {}); } catch (e) { warn(e); } });
    const xz = (ent) => ({ x: ent?.position?.x, z: ent?.position?.z });
    const dToPlayer = (x, z) => { const p = game.player?.position; return p ? Math.hypot(x - p.x, z - p.z) : 0; };

    on('gunshot', (d) => {
      const w = typeof d.weapon === 'string' ? d.weapon : d.weapon?.id;
      const name = WEAPON_SOUND[w] || 'pistol';
      const mine = d.shooter === game.player;
      const dist = dToPlayer(d.x, d.z);
      play(name, { x: d.x, z: d.z, pitch: rnd(0.96, 1.05) });
      mixer.duck(clamp(0.45 - dist / 300, 0.08, 0.45) * (name === 'rpg' || name === 'sniper' ? 1.3 : 1), name === 'smg' || name === 'rifle' ? 0.18 : 0.4);
      if (mine) {
        if (name === 'shotgun') after(0.55, () => play('pump', { volume: 0.9 }));
        else if (name !== 'rpg' && name !== 'punch' && name !== 'batHit') after(0.22, () => play('shell', { x: d.x + rnd(-0.6, 0.6), z: d.z + rnd(-0.6, 0.6), volume: rnd(0.5, 0.9), pitch: rnd(0.85, 1.2) }));
        if (name !== 'rpg' && (name !== 'smg' && name !== 'rifle' || ok('shotImpact', 110))) impactFromShot(d);
      } else if (dist < 70 && dist > 3 && ok('whiz', 350) && Math.random() < 0.35) {
        play('whiz', { pan: rnd(-0.8, 0.8), volume: clamp(1 - dist / 80, 0.3, 1), pitch: rnd(0.9, 1.2) });
      }
    });
    on('explosion', (d) => {
      play('explosion', { x: d.x, z: d.z, pitch: rnd(0.9, 1.08) });
      mixer.duck(0.8, 1.2);
    });
    on('vehicle:crash', (d) => {
      const impact = d.impact ?? 8;
      if (impact < 1.5 || !ok('crash' + (d.vehicle?._uid || ''), 220)) return;
      const k = clamp(impact / 26, 0, 1);
      const p = xz(d.vehicle);
      if (impact < 5) play('scrape', { ...p, volume: 0.5 + k });
      else play('crash', { ...p, volume: 0.45 + 0.55 * k, k, pitch: rnd(0.88, 1.12) });
      if (impact > 14) after(0.03, () => play('glass', { ...p, volume: 0.6 + 0.4 * k, pitch: rnd(0.9, 1.1) }));
      if (impact > 10) mixer.duck(0.3 * k, 0.3);
    });
    on('vehicle:horn', (d) => {
      if (!ok('horn' + (d.vehicle?._uid || ''), 250)) return;
      const hp = veh?.hornParams?.(d.vehicle) || {};
      play('horn', { ...xz(d.vehicle), ...hp, volume: d.vehicle === game.player?.vehicle ? 1 : 0.85 });
    });
    on('vehicle:destroyed', (d) => { play('glass', { ...xz(d.vehicle), volume: 0.8 }); });
    on('pickup', (d) => play(d.type === 'money' || d.type === 'cash' ? 'money' : 'pickup'));
    on('mission:started', () => { play('missionStart'); mixer.duck(0.4, 1.8); });
    on('mission:completed', () => { play('missionComplete'); mixer.duck(0.5, 2.5); });
    on('mission:failed', () => { play('missionFail'); mixer.duck(0.5, 2); });
    on('wanted:changed', (d) => {
      const lv = d.level | 0, prev = d.prev | 0;
      if (lv > prev) play('wantedUp'); else if (lv === 0 && prev > 0) play('wantedClear');
    });
    on('player:died', () => { play('death'); mixer.duck(0.7, 3); });
    on('player:damaged', (d) => {
      if (!ok('hit', 160)) return;
      play('hit', { volume: clamp(0.5 + (d.amount || 10) / 40, 0.5, 1), pitch: rnd(0.9, 1.1) });
      mixer.duck(0.2, 0.25);
    });
    on('ped:died', (d) => {
      const p = d.ped?.position;
      if (p && ok('pedDie', 120)) play('bodyHit', { x: p.x, z: p.z, pitch: rnd(0.85, 1.15) });
    });
    on('weapon:changed', () => { if (game.state?.mode === 'playing' && ok('wsw', 120)) play('weaponSwitch', { volume: 0.8 }); });
    on('player:enteredVehicle', () => { play('doorOpen'); after(0.45, () => play('door')); });
    on('player:exitedVehicle', () => { play('doorOpen'); after(0.35, () => play('door', { pitch: 0.9 })); });
    on('ui:click', () => play('click'));
    on('ui:hover', () => { if (ok('hover', 60)) play('hover'); });
    on('money:changed', (d) => { if ((d.delta ?? 0) > 0 && ok('money', 150)) play('money', { volume: 0.4 }); });
    on('game:paused', () => play('click', { volume: 0.5, pitch: 0.8 }));
  }

  return {
    /** Called once after all systems exist. Installs the user-gesture listeners and event handlers. */
    init() {
      try {
        for (const type of ['pointerdown', 'keydown', 'touchstart', 'mousedown', 'click']) {
          window.addEventListener(type, onGesture, { capture: true, passive: true });
        }
        document.addEventListener('visibilitychange', () => { try { mixer?.setHidden(document.hidden); } catch (e) { warn(e); } });
      } catch (e) { warn(e); }
      wire();
    },

    /** Continuous layers (engine, tyres, sirens, ambience, footsteps, music). dt in seconds. */
    update(dt) {
      if (!ctx || dead || !mixer) return;
      try { tick(dt); } catch (e) { warn(e); }
    },

    /**
     * One-shot sound. opts { x, z, volume=1, pitch=1, pan }; omit x/z for non-positional sounds.
     * Names: see SOUNDS in sfx.js (pistol smg shotgun rifle sniper rpg punch batHit whoosh reload pump empty
     * weaponSwitch shell impact ping ricochet whiz bodyHit hit explosion crash scrape glass door doorOpen horn
     * burble shift crackle footstep jump land death heartbeat gull lap ferryHorn boat tramBell bark tune click hover
     * pickup money missionStart missionComplete missionFail wantedUp wantedClear).
     */
    play,

    /** Debug/test hook (not used by the game). */
    _debug() { return { ensure: ensureCtx, ctx, mixer, veh, amb, music, chr, noise, st, SOUNDS }; },
  };
}
