// Neon Coast - bootstrap and main loop. Module contract: docs/ARCHITECTURE.md
import * as THREE from 'three';
import { EventBus } from './core/events.js';
import { Input } from './core/input.js';
import { createGraphics } from './core/graphics.js';
import { createWorld } from './world/city.js';
import { createVehicles } from './entities/vehicles.js';
import { setVehicleQuality } from './entities/vehicleModels.js';
import { createPeds } from './entities/peds.js';
import { createPolice } from './entities/police.js';
import { createWeapons } from './entities/weapons.js';
import { createPickups } from './entities/pickups.js';
import { createPlayer } from './entities/player.js';
import { createMissions } from './missions/missions.js';
import { createHud } from './ui/hud.js';
import { createMenu } from './ui/menu.js';
import { createTouch } from './ui/touch.js';
import { createAudio } from './audio/audio.js';

const canvas = document.getElementById('game-canvas');
const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && matchMedia('(pointer: coarse)').matches);

const QUALITY = {
  low: { pixelRatio: 1.25, shadows: false, drawDistance: 260, density: 0.5 },
  medium: { pixelRatio: 1.5, shadows: true, drawDistance: 420, density: 0.8 },
  high: { pixelRatio: 2, shadows: true, drawDistance: 650, density: 1 },
};

const saved = (() => { try { return JSON.parse(localStorage.getItem('neoncoast.settings') || '{}'); } catch { return {}; } })();

const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.3, 1500);
camera.position.set(0, 60, -120);

const game = {
  THREE, renderer, scene, camera, canvas, isMobile,
  events: new EventBus(),
  input: new Input(canvas),
  settings: {
    quality: saved.quality || (isMobile ? 'low' : 'high'),
    sensitivity: saved.sensitivity ?? 1,
    volume: saved.volume ?? 0.8,
    music: saved.music ?? true,
  },
  /** Resolved quality profile for the current settings.quality. */
  get q() { return QUALITY[this.settings.quality] || QUALITY.medium; },
  state: {
    mode: 'menu',       // 'menu' | 'playing' | 'paused'
    time: 0,            // seconds of gameplay elapsed
    timeOfDay: 9,       // 0..24 hours, advanced by world
    money: 0,
  },
  systems: [],

  addMoney(amount) {
    this.state.money = Math.max(0, Math.round(this.state.money + amount));
    this.events.emit('money:changed', { money: this.state.money, delta: amount });
  },
  start() {
    if (this.state.mode === 'playing') return;
    const first = this.state.mode === 'menu';
    this.state.mode = 'playing';
    this.input.enabled = true;
    this.input.requestPointerLock();
    this.events.emit(first ? 'game:started' : 'game:resumed');
  },
  pause() {
    if (this.state.mode !== 'playing') return;
    this.state.mode = 'paused';
    this.input.enabled = false;
    this.input.exitPointerLock();
    this.events.emit('game:paused');
  },
  resume() { if (this.state.mode === 'paused') this.start(); },
  applySettings() {
    const q = this.q;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.pixelRatio));
    renderer.shadowMap.enabled = q.shadows;
    this.input.sensitivity = this.settings.sensitivity;
    if (setVehicleQuality(this.settings.quality) && this.vehicles?.list) {
      for (const v of this.vehicles.list) if (!v.destroyed) this.vehicles.paint?.(v, v.color);
    }
    try { localStorage.setItem('neoncoast.settings', JSON.stringify(this.settings)); } catch { /* ignore */ }
    this.events.emit('settings:changed', this.settings);
  },
};
window.game = game; // for debugging / automated tests

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 200));

// ---- systems (creation order matters; update order is the array order below) ----
const safe = (name, fn) => {
  try { return fn(game); } catch (e) { console.error(`[init ${name}]`, e); return { update() {} }; }
};
setVehicleQuality(game.settings.quality);
game.world = safe('world', createWorld);
game.vehicles = safe('vehicles', createVehicles);
game.peds = safe('peds', createPeds);
game.police = safe('police', createPolice);
game.weapons = safe('weapons', createWeapons);
game.pickups = safe('pickups', createPickups);
game.player = safe('player', createPlayer);
game.missions = safe('missions', createMissions);
game.hud = safe('hud', createHud);
game.menu = safe('menu', createMenu);
game.touch = safe('touch', createTouch);
game.audio = safe('audio', createAudio);

const sim = ['player', 'vehicles', 'peds', 'police', 'weapons', 'pickups', 'missions', 'world'];
const always = ['hud', 'menu', 'touch', 'audio'];
game.systems = [...sim, ...always];

game.input.enabled = false;
game.applySettings();
resize();
for (const n of game.systems) { try { game[n].init?.(); } catch (e) { console.error(`[init2 ${n}]`, e); } }

game.events.on('visibility:hidden', () => game.pause());
document.addEventListener('visibilitychange', () => { if (document.hidden) game.pause(); });
document.addEventListener('pointerlockchange', () => {
  // Leaving pointer lock with Esc on desktop pauses the game.
  if (!document.pointerLockElement && game.state.mode === 'playing' && !game.input.usingTouch && game.input.pointerLocked === false && game._hadLock) game.pause();
  game._hadLock = !!document.pointerLockElement;
});

game.graphics = createGraphics(game);

const errCount = {};
function run(name, dt) {
  try { game[name].update?.(dt); } catch (e) {
    errCount[name] = (errCount[name] || 0) + 1;
    if (errCount[name] <= 5) console.error(`[update ${name}]`, e);
  }
}

let last = performance.now();
let menuAngle = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  game.input.update();

  if (game.state.mode === 'playing') {
    if (game.input.pressed('pause')) game.pause();
    else {
      game.state.time += dt;
      for (const n of sim) run(n, dt);
    }
  } else if (game.state.mode === 'menu') {
    // Slow fly-around behind the title screen.
    menuAngle += dt * 0.05;
    camera.position.set(Math.sin(menuAngle) * 220, 90, Math.cos(menuAngle) * 220);
    camera.lookAt(0, 10, 0);
    run('world', dt);
  } else if (game.input.pressed('pause')) {
    game.resume();
  }
  for (const n of always) run(n, dt);

  game.graphics.render();
  game.input.endFrame();
}
requestAnimationFrame(frame);
