// Unified input state: keyboard + mouse (pointer lock) + gamepad + touch (fed by ui/touch.js).
// Gameplay code reads ONLY this object; it never listens to DOM events itself.
import { clamp } from './utils.js';

const KEY_ACTIONS = {
  KeyF: 'interact', Enter: 'interact', KeyE: 'nextWeapon', KeyQ: 'prevWeapon', KeyR: 'reload',
  Escape: 'pause', KeyP: 'pause', KeyH: 'horn', KeyC: 'camera', KeyM: 'map', KeyT: 'radio',
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    // Analog axes, -1..1. On foot: moveX = strafe (right +), moveY = forward (+). In vehicle: moveX = steer (right +), moveY = throttle (+ forward, - reverse).
    this.moveX = 0; this.moveY = 0;
    // Look delta accumulated this frame, in "pixels" (already sensitivity-scaled). Camera consumes these.
    this.lookDX = 0; this.lookDY = 0;
    // Held buttons.
    this.sprint = false; this.jump = false; this.fire = false; this.aim = false; this.handbrake = false;
    this.sensitivity = 1;
    this.usingTouch = false;
    this.pointerLocked = false;
    this.enabled = true; // false while menus are open: axes/buttons read as neutral

    this._keys = new Set();
    this._pressed = new Set();     // one-shot actions this frame
    this._touch = { x: 0, y: 0, buttons: {} };
    this._mouse = { fire: false, aim: false };
    this._pad = { fire: false, prev: {} };

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this._keys.add(e.code);
      const a = KEY_ACTIONS[e.code];
      if (a) this._pressed.add(a);
      if (/^Digit[1-9]$/.test(e.code)) this._pressed.add('weapon' + e.code.slice(5));
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this._keys.delete(e.code));
    window.addEventListener('blur', () => { this._keys.clear(); this._mouse.fire = this._mouse.aim = false; });

    canvas.addEventListener('mousedown', (e) => {
      if (this.usingTouch) return;
      if (!this.pointerLocked) { this.requestPointerLock(); return; }
      if (e.button === 0) this._mouse.fire = true;
      if (e.button === 2) this._mouse.aim = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this._mouse.fire = false;
      if (e.button === 2) this._mouse.aim = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.lookDX += e.movementX * this.sensitivity;
      this.lookDY += e.movementY * this.sensitivity;
    });
    window.addEventListener('wheel', (e) => {
      if (!this.pointerLocked) return;
      this._pressed.add(e.deltaY > 0 ? 'nextWeapon' : 'prevWeapon');
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
      if (!this.pointerLocked) this._mouse.fire = this._mouse.aim = false;
    });
    window.addEventListener('touchstart', () => { this.usingTouch = true; }, { passive: true, capture: true });
  }

  requestPointerLock() {
    if (this.usingTouch || !this.enabled) return;
    try { const p = this.canvas.requestPointerLock?.(); p?.catch?.(() => {}); } catch { /* ignore */ }
  }
  exitPointerLock() { if (document.pointerLockElement) document.exitPointerLock?.(); }

  /** One-shot action check, true only during the frame it was pressed. Actions:
   *  interact, nextWeapon, prevWeapon, reload, pause, horn, camera, map, radio, weapon1..weapon9 */
  pressed(action) { return this._pressed.has(action); }

  // ---- API for ui/touch.js -------------------------------------------------
  /** Virtual joystick, x right+, y forward+ (both -1..1). */
  setTouchMove(x, y) { this._touch.x = clamp(x, -1, 1); this._touch.y = clamp(y, -1, 1); }
  /** Look drag delta in CSS pixels. */
  addLook(dx, dy) { this.lookDX += dx * this.sensitivity * 1.6; this.lookDY += dy * this.sensitivity * 1.6; }
  /** Held virtual button: 'sprint' | 'jump' | 'fire' | 'aim' | 'handbrake' | 'gas' | 'brake'. */
  setButton(name, down) { this._touch.buttons[name] = !!down; }
  /** Fire a one-shot action (same names as pressed()). */
  trigger(action) { this._pressed.add(action); }

  /** Called by main loop at the START of each frame. */
  update() {
    const k = this._keys, t = this._touch, tb = t.buttons;
    let mx = 0, my = 0;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyW') || k.has('ArrowUp')) my += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) my -= 1;
    mx += t.x; my += t.y;
    if (tb.gas) my += 1;
    if (tb.brake) my -= 1;

    let sprint = k.has('ShiftLeft') || k.has('ShiftRight') || !!tb.sprint;
    let jump = k.has('Space') || !!tb.jump;
    let fire = this._mouse.fire || k.has('ControlLeft') || !!tb.fire;
    let aim = this._mouse.aim || !!tb.aim;
    let handbrake = k.has('Space') || !!tb.handbrake;

    // Gamepad (standard mapping)
    const pad = navigator.getGamepads?.()[0];
    if (pad && pad.connected) {
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
      const b = (i) => !!pad.buttons[i]?.pressed;
      mx += dz(pad.axes[0] || 0);
      my += -dz(pad.axes[1] || 0);
      my += (pad.buttons[7]?.value || 0) - (pad.buttons[6]?.value || 0);
      this.lookDX += dz(pad.axes[2] || 0) * 14 * this.sensitivity;
      this.lookDY += dz(pad.axes[3] || 0) * 10 * this.sensitivity;
      sprint ||= b(10) || b(0); jump ||= b(2); fire ||= b(5); aim ||= b(4); handbrake ||= b(1);
      const once = { 3: 'interact', 9: 'pause', 15: 'nextWeapon', 14: 'prevWeapon', 12: 'radio', 13: 'camera', 11: 'horn' };
      for (const [i, a] of Object.entries(once)) {
        const down = b(+i);
        if (down && !this._pad.prev[i]) this._pressed.add(a);
        this._pad.prev[i] = down;
      }
    }

    if (!this.enabled) {
      this.moveX = this.moveY = 0; this.lookDX = this.lookDY = 0;
      this.sprint = this.jump = this.fire = this.aim = this.handbrake = false;
      return;
    }
    this.moveX = clamp(mx, -1, 1); this.moveY = clamp(my, -1, 1);
    this.sprint = sprint; this.jump = jump; this.fire = fire; this.aim = aim; this.handbrake = handbrake;
  }

  /** Called by main loop at the END of each frame. */
  endFrame() { this._pressed.clear(); this.lookDX = 0; this.lookDY = 0; }
}
