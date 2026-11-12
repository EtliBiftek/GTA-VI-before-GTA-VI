// Neon Coast touch controls: floating joystick (left), look-drag (right), context-sensitive buttons.
import './ui.css';

const ICONS = {
  fire: '<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="1.5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  aim: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/>',
  jump: '<path d="M12 20V5M5 11l7-7 7 7"/>',
  sprint: '<path d="M5 6l6 6-6 6M12 6l6 6-6 6"/>',
  car: '<path d="M3 15l2-6h14l2 6v4H3zM7 19v2M17 19v2M3 15h18"/>',
  gun: '<path d="M3 9h15l3 2v3h-9l-1 4H8l1-4H3z"/>',
  reload: '<path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5"/>',
  gas: '<path d="M8 20h8M9 16l3-12 3 12z"/>',
  brake: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  hand: '<circle cx="12" cy="12" r="8"/><path d="M12 7v6M12 16.5v.5"/>',
  horn: '<path d="M4 9v6h4l5 4V5L8 9zM16.5 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11"/>',
  cam: '<path d="M3 8h4l2-2h6l2 2h4v11H3z"/><circle cx="12" cy="13" r="3.5"/>',
  radio: '<path d="M3 10h18v10H3zM7 4l11 6"/><circle cx="15" cy="15" r="2.5"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14"/>',
};

const PINK = '#ff3d9a', ORANGE = '#ff9a3d', CYAN = '#35e0ff', GREEN = '#5dffa0', RED = '#ff3b4d', YELLOW = '#ffd23d';

// Layout: (x, y) = button centre measured from the bottom-right corner in vmin; size in vmin.
// kind: hold -> input.setButton while pressed, toggle -> setButton on/off per tap, tap -> input.trigger(name) on press.
const BUTTONS = [
  // ---- on foot ----
  { l: 'foot', id: 'fire', label: 'ATEŞ', icon: 'fire', c: PINK, s: 19, x: 15, y: 17, kind: 'hold', name: 'fire', look: true, big: true },
  { l: 'foot', id: 'aim', label: 'NİŞAN', icon: 'aim', c: CYAN, s: 12.5, x: 38, y: 15, kind: 'toggle', name: 'aim' },
  { l: 'foot', id: 'sprint', label: 'KOŞ', icon: 'sprint', c: ORANGE, s: 12, x: 32, y: 33, kind: 'toggle', name: 'sprint' },
  { l: 'foot', id: 'jump', label: 'ZIPLA', icon: 'jump', c: GREEN, s: 12.5, x: 14, y: 40, kind: 'hold', name: 'jump' },
  { l: 'foot', id: 'interact', label: 'BİN', icon: 'car', c: YELLOW, s: 12, x: 51, y: 31, kind: 'tap', name: 'interact', prompt: true },
  { l: 'foot', id: 'weapon', label: 'SİLAH', icon: 'gun', c: PINK, s: 10.5, x: 31, y: 52, kind: 'tap', name: 'nextWeapon' },
  { l: 'foot', id: 'reload', label: 'ŞARJÖR', icon: 'reload', c: CYAN, s: 10.5, x: 12, y: 59, kind: 'tap', name: 'reload' },
  // ---- in vehicle ----
  { l: 'veh', id: 'gas', label: 'GAZ', icon: 'gas', c: GREEN, s: 19, x: 15, y: 17, kind: 'hold', name: 'gas', big: true },
  { l: 'veh', id: 'brake', label: 'FREN', icon: 'brake', c: RED, s: 15, x: 39, y: 14, kind: 'hold', name: 'brake' },
  { l: 'veh', id: 'hbrake', label: 'EL FRENİ', icon: 'hand', c: ORANGE, s: 12, x: 14, y: 40, kind: 'hold', name: 'handbrake' },
  { l: 'veh', id: 'horn', label: 'KORNA', icon: 'horn', c: CYAN, s: 10.5, x: 33, y: 32, kind: 'tap', name: 'horn' },
  { l: 'veh', id: 'exit', label: 'İN', icon: 'car', c: YELLOW, s: 12, x: 53, y: 30, kind: 'tap', name: 'interact', prompt: true },
  { l: 'veh', id: 'dfire', label: 'ATEŞ', icon: 'fire', c: PINK, s: 11, x: 33, y: 52, kind: 'hold', name: 'fire', look: true },
  { l: 'veh', id: 'cam', label: 'KAMERA', icon: 'cam', c: CYAN, s: 10, x: 12, y: 60, kind: 'tap', name: 'camera' },
  { l: 'veh', id: 'radio', label: 'RADYO', icon: 'radio', c: ORANGE, s: 10, x: 52, y: 50, kind: 'tap', name: 'radio' },
];
const TOP_BUTTONS = [
  { id: 'pause', label: '', icon: 'pause', c: PINK, s: 9, kind: 'tap', name: 'pause', left: 2 },
  { id: 'map', label: '', icon: 'map', c: CYAN, s: 9, kind: 'tap', name: 'map', left: 12.5 },
];

const buzz = () => { try { navigator.vibrate?.(10); } catch { /* ignore */ } };

export function createTouch(game) {
  let built = false, root = null, shown = null, layout = null;
  let promptOn = null;
  const held = [];      // hold/toggle controls, for release on layout swap
  const interacts = [];
  let stick = null, knob = null;
  let stickId = null, sx = 0, sy = 0, lookId = null, lx = 0, ly = 0;

  const input = () => game.input;
  const svg = (name) => `<svg viewBox="0 0 24 24">${ICONS[name]}</svg>`;

  function makeButton(def, parent) {
    const b = document.createElement('div');
    b.className = 'nc-tb' + (def.big ? ' big' : '') + (def.l === 'foot' ? ' foot' : def.l === 'veh' ? ' veh' : '');
    b.style.setProperty('--c', def.c);
    b.style.width = b.style.height = def.s + 'vmin';
    if (def.l) {
      b.style.right = `calc(env(safe-area-inset-right, 0px) + ${def.x - def.s / 2 + 1}vmin)`;
      b.style.bottom = `calc(env(safe-area-inset-bottom, 0px) + ${def.y - def.s / 2 + 0.5}vmin)`;
    } else {
      b.style.left = `calc(env(safe-area-inset-left, 0px) + ${def.left}vmin)`;
      b.style.top = `calc(env(safe-area-inset-top, 0px) + 2vmin)`;
    }
    b.innerHTML = svg(def.icon) + (def.label ? `<em>${def.label}</em>` : '');
    parent.appendChild(b);

    const ctl = { def, el: b, pid: null, on: false };
    const setDown = (v) => b.classList.toggle('down', v);
    const release = () => {
      if (def.kind === 'hold' && ctl.pid != null) { input().setButton(def.name, false); }
      ctl.pid = null; setDown(false);
      if (def.kind === 'toggle') { ctl.on = false; input().setButton(def.name, false); b.classList.remove('on'); }
    };
    ctl.release = release;

    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (ctl.pid != null) return;
      try { b.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      buzz();
      if (def.kind === 'hold') {
        ctl.pid = e.pointerId; ctl.lx = e.clientX; ctl.ly = e.clientY;
        input().setButton(def.name, true); setDown(true);
      } else if (def.kind === 'toggle') {
        ctl.on = !ctl.on; input().setButton(def.name, ctl.on); b.classList.toggle('on', ctl.on);
      } else {
        ctl.pid = e.pointerId; input().trigger(def.name); setDown(true);
      }
    });
    b.addEventListener('pointermove', (e) => {
      if (def.look && ctl.pid === e.pointerId) {
        input().addLook(e.clientX - ctl.lx, e.clientY - ctl.ly);
        ctl.lx = e.clientX; ctl.ly = e.clientY;
      }
    });
    const up = (e) => {
      if (def.kind === 'toggle') { setDown(false); return; }
      if (ctl.pid === e.pointerId) release();
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    if (def.kind !== 'tap') held.push(ctl);
    if (def.prompt) interacts.push(b);
    return ctl;
  }

  function resetStick() {
    stickId = null; stick.classList.remove('on');
    knob.style.transform = '';
    input().setTouchMove(0, 0);
  }

  function build() {
    if (built) return;
    built = true;
    const ui = document.getElementById('ui-root') || document.body;
    root = document.createElement('div');
    root.className = 'nc-touch foot';
    root.style.display = 'none';
    ui.appendChild(root);
    root.addEventListener('contextmenu', (e) => e.preventDefault());

    // ---- zones ----
    const zl = document.createElement('div'); zl.className = 'nc-zone l'; root.appendChild(zl);
    const zr = document.createElement('div'); zr.className = 'nc-zone r'; root.appendChild(zr);
    stick = document.createElement('div'); stick.className = 'nc-stick'; root.appendChild(stick);
    knob = document.createElement('div'); knob.className = 'nc-knob'; stick.appendChild(knob);

    const radius = () => Math.min(innerWidth, innerHeight) * 0.09;
    const DEAD = 0.14;
    zl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (stickId != null) return;
      try { zl.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      stickId = e.pointerId; sx = e.clientX; sy = e.clientY;
      stick.style.left = sx + 'px'; stick.style.top = sy + 'px';
      stick.classList.add('on');
    });
    zl.addEventListener('pointermove', (e) => {
      if (e.pointerId !== stickId) return;
      const R = radius();
      let dx = e.clientX - sx, dy = e.clientY - sy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      const m = Math.min(1, d / R);
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      if (m < DEAD) { input().setTouchMove(0, 0); return; }
      const k = (m - DEAD) / (1 - DEAD);
      input().setTouchMove((dx / (d > R ? R : d || 1)) * k, (-dy / (d > R ? R : d || 1)) * k);
    });
    const stickUp = (e) => { if (e.pointerId === stickId) resetStick(); };
    zl.addEventListener('pointerup', stickUp);
    zl.addEventListener('pointercancel', stickUp);
    zl.addEventListener('lostpointercapture', stickUp);

    zr.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (lookId != null) return;
      try { zr.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      lookId = e.pointerId; lx = e.clientX; ly = e.clientY;
    });
    zr.addEventListener('pointermove', (e) => {
      if (e.pointerId !== lookId) return;
      input().addLook(e.clientX - lx, e.clientY - ly);
      lx = e.clientX; ly = e.clientY;
    });
    const lookUp = (e) => { if (e.pointerId === lookId) lookId = null; };
    zr.addEventListener('pointerup', lookUp);
    zr.addEventListener('pointercancel', lookUp);
    zr.addEventListener('lostpointercapture', lookUp);

    for (const d of BUTTONS) makeButton(d, root);
    for (const d of TOP_BUTTONS) makeButton(d, root);

    const ev = game.events;
    ev.on('player:enteredVehicle', () => applyLayout(true));
    ev.on('player:exitedVehicle', () => applyLayout(false));
    ev.on('player:respawned', () => { releaseAll(); applyLayout(!!game.player?.inVehicle); });
    applyLayout(!!game.player?.inVehicle);
  }

  function releaseAll() {
    for (const c of held) c.release();
    if (stick && stickId != null) resetStick();
    lookId = null;
    input()?.setTouchMove?.(0, 0);
  }

  function applyLayout(inVeh) {
    const name = inVeh ? 'vehicle' : 'foot';
    if (name === layout) return;
    layout = name;
    releaseAll();
    root.classList.toggle('vehicle', inVeh);
    root.classList.toggle('foot', !inVeh);
  }

  return {
    init() { if (game.isMobile) build(); },
    update() {
      if (!built) {
        if (game.input?.usingTouch) build(); else return;
      }
      const playing = game.state.mode === 'playing';
      if (playing !== shown) {
        shown = playing;
        root.style.display = playing ? '' : 'none';
        if (!playing) releaseAll();
      }
      if (!playing) return;
      // poll as a fallback to the vehicle events
      const iv = !!game.player?.inVehicle;
      if ((iv ? 'vehicle' : 'foot') !== layout) applyLayout(iv);
      const po = !!game.hud?.prompt;
      if (po !== promptOn) { promptOn = po; for (const b of interacts) b.classList.toggle('glow', po); }
    },
  };
}
