// Neon Coast HUD: stats cluster, rotating minimap, full map, mission banner, toasts, crosshair, vignette.
import './ui.css';

const SVG_NS = 'http://www.w3.org/2000/svg';
const STAR_PATH = 'M50 4 L62 36 L96 38 L69 59 L79 93 L50 73 L21 93 L31 59 L4 38 L38 36 Z';

const LANDMARKS = {
  safehouse: { c: '#35e0ff', t: 'E', n: 'Güvenli ev' },
  hospital: { c: '#ff5577', t: '+', n: 'Hastane' },
  police: { c: '#4f8bff', t: 'P', n: 'Karakol' },
  gunshop: { c: '#ffb13d', t: 'S', n: 'Silah dükkanı' },
  garage: { c: '#b36bff', t: 'G', n: 'Garaj' },
  pier: { c: '#5dffa0', t: 'R', n: 'İskele' },
  stadium: { c: '#ff3d9a', t: 'A', n: 'Stadyum' },
};
const LM_DEFAULT = { c: '#ffffff', t: '•', n: 'Yer' };

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}
const fmtMoney = (n) => '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const colorStr = (c, def = '#ffd23d') => (typeof c === 'number' ? '#' + (c & 0xffffff).toString(16).padStart(6, '0') : (c || def));
const pad2 = (n) => (n < 10 ? '0' : '') + n;

export function createHud(game) {
  const root = document.getElementById('ui-root') || document.body;
  const hud = el('div', 'nc-hud', root);
  hud.style.display = 'none';

  // ---------- top-right cluster ----------
  const tr = el('div', 'nc-tr', hud);
  const row1 = el('div', 'nc-panel nc-row1 nc-head', tr);
  const clockEl = el('span', 'nc-clock', row1, '09:00');
  const moneyEl = el('span', 'nc-money', row1);
  const moneyTxt = document.createTextNode('$0'); moneyEl.appendChild(moneyTxt);
  const deltaEl = el('span', 'nc-delta nc-head', moneyEl);
  const starsEl = el('div', 'nc-stars', tr);
  const stars = [];
  for (let i = 0; i < 5; i++) {
    const s = document.createElementNS(SVG_NS, 'svg');
    s.setAttribute('viewBox', '0 0 100 100'); s.setAttribute('class', 'nc-star');
    const p = document.createElementNS(SVG_NS, 'path'); p.setAttribute('d', STAR_PATH); s.appendChild(p);
    starsEl.appendChild(s); stars.push(s);
  }
  const weaponEl = el('div', 'nc-panel nc-weapon', tr);
  const wName = el('span', 'nc-wname nc-head', weaponEl);
  const wAmmo = el('span', 'nc-wammo nc-head', weaponEl);
  const bars = el('div', 'nc-panel nc-bars', tr);
  const hpBar = el('div', 'nc-bar hp', bars); const hpFill = el('i', '', hpBar);
  const arBar = el('div', 'nc-bar ar', bars); const arFill = el('i', '', arBar);

  // ---------- minimap ----------
  const miniWrap = el('div', 'nc-minimap', hud);
  const miniCv = el('canvas', '', miniWrap);
  const mctx = miniCv.getContext('2d');

  // ---------- speedometer ----------
  const speedo = el('div', 'nc-panel nc-speedo', hud);
  const speedEl = el('div', 'nc-speed nc-head', speedo);
  const speedNum = document.createTextNode('0'); speedEl.appendChild(speedNum);
  el('small', '', speedEl, 'KM/H');
  const vhBar = el('div', 'nc-bar vh', speedo); const vhFill = el('i', '', vhBar);
  speedo.style.display = 'none';

  // ---------- mission ----------
  const obj = el('div', 'nc-obj', hud);
  const objText = el('div', 'nc-panel nc-objtext', obj);
  const objHead = el('b', '', objText, 'GÖREV');
  const objBody = el('span', '', objText);
  const mTimer = el('div', 'nc-mtimer nc-head', obj);
  obj.style.display = 'none'; mTimer.style.display = 'none';

  // ---------- toasts / big text / prompt ----------
  const toasts = el('div', 'nc-toasts', hud);
  const big = el('div', 'nc-big', hud);
  const bigT = el('div', 'nc-bigt nc-head', big);
  const bigS = el('div', 'nc-bigs', big);
  const promptEl = el('div', 'nc-panel nc-prompt', hud);
  promptEl.style.display = 'none';

  // ---------- crosshair & vignette ----------
  const cross = el('div', 'nc-cross', hud);
  for (let i = 0; i < 4; i++) el('i', '', cross);
  el('b', '', cross);
  cross.style.display = 'none';
  const vig = el('div', 'nc-vig', hud);

  // ---------- full map ----------
  const mapRoot = el('div', 'nc-map', root);
  mapRoot.style.display = 'none';
  const mapWrap = el('div', 'nc-mapwrap', mapRoot);
  const mapCv = el('canvas', '', mapWrap);
  const mapCtx = mapCv.getContext('2d');
  const legend = el('div', 'nc-panel nc-legend', mapRoot);
  el('h2', 'nc-head', legend, 'İSTANBUL');
  const legendRow = (color, letter, text) => {
    const d = el('div', '', legend);
    const dot = el('span', 'dot', d, letter); dot.style.background = color;
    el('span', '', d, text);
  };
  legendRow('#35e0ff', '▲', 'Sen');
  legendRow('#ffd23d', '!', 'Görev');
  legendRow('#ff3b4d', 'x', 'Hedef');
  legendRow('#4f8bff', '', 'Polis');
  for (const k of Object.keys(LANDMARKS)) legendRow(LANDMARKS[k].c, LANDMARKS[k].t, LANDMARKS[k].n);
  el('small', '', legend, 'Kapatmak için M veya dokun');

  // ---------- state caches ----------
  let wasHidden = true, touchMode = null, mapOpen = false, mapTimer = 0;
  let lastClock = '', lastMoney = -1, moneyShown = 0, moneyTarget = 0, lastStars = -1, lastEsc = null;
  let lastWeapon = '', lastAmmo = '', lastHp = -1, lastAr = -1, lastSpeed = -1, lastVh = -1, lastCross = null;
  let lastTimer = '', lastTimerRed = null, lastObj = null, pollObj = undefined, objManual = null;
  let promptText = null, bigTimeout = 0, vigTimeout = 0, lowHp = false;
  let inVeh = null, crossGap = 4, crossKick = 0, frameN = 0;
  let miniR = 70, miniSize = 0, dpr = 1;
  let t = 0;

  // ---------- public API ----------
  function notify(text, ms = 3000) {
    if (!text) return;
    const d = el('div', 'nc-toast', toasts, String(text));
    while (toasts.children.length > 5) toasts.removeChild(toasts.firstChild);
    setTimeout(() => d.classList.add('out'), ms);
    setTimeout(() => d.remove(), ms + 450);
  }
  function showBigText(text, sub, ms = 3000, color = '#ff3d9a') {
    clearTimeout(bigTimeout);
    bigT.textContent = text || '';
    bigS.textContent = sub || '';
    bigS.style.display = sub ? '' : 'none';
    big.style.setProperty('--c', colorStr(color, '#ff3d9a'));
    big.classList.remove('show'); void big.offsetWidth; big.classList.add('show');
    bigTimeout = setTimeout(() => big.classList.remove('show'), ms);
  }
  function setPrompt(text) {
    promptText = text || null;
    if (promptText) promptEl.textContent = promptText;
    promptEl.style.display = promptText ? '' : 'none';
  }
  function setObjective(text) { objManual = text || null; applyObjective(); }
  function applyObjective() {
    if (objManual === lastObj) return;
    lastObj = objManual;
    obj.style.display = objManual ? '' : 'none';
    if (objManual) objBody.textContent = objManual;
  }

  // ---------- events ----------
  const ev = game.events;
  ev.on('money:changed', (d) => {
    const delta = d?.delta || 0;
    if (!delta) return;
    deltaEl.textContent = (delta > 0 ? '+' : '-') + fmtMoney(Math.abs(delta));
    deltaEl.className = 'nc-delta nc-head ' + (delta > 0 ? 'pos' : 'neg');
    void deltaEl.offsetWidth; deltaEl.classList.add('go');
  });
  ev.on('player:damaged', () => {
    vig.classList.remove('low'); vig.classList.add('hit');
    clearTimeout(vigTimeout);
    vigTimeout = setTimeout(() => { vig.classList.remove('hit'); if (lowHp) vig.classList.add('low'); }, 90);
  });
  ev.on('weapon:fired', () => { crossKick = 1; });
  ev.on('mission:objective', (d) => setObjective(d?.text));
  ev.on('mission:started', (d) => {
    const def = d?.def || {};
    showBigText(def.title || 'GÖREV', def.giver ? def.giver : (def.description || ''), 3800, '#ff9a3d');
  });
  ev.on('mission:completed', (d) => {
    showBigText('GÖREV TAMAMLANDI', d?.reward ? '+' + fmtMoney(d.reward) : (d?.def?.title || ''), 4200, '#5dffa0');
    setObjective(null);
  });
  ev.on('mission:failed', (d) => {
    showBigText('GÖREV BAŞARISIZ', d?.reason || '', 4200, '#ff3b4d');
    setObjective(null);
  });
  ev.on('game:started', () => { setPrompt(null); });
  ev.on('player:died', () => { vig.classList.remove('low'); });

  function toggleMap(force) {
    mapOpen = force != null ? force : !mapOpen;
    mapRoot.style.display = mapOpen ? 'flex' : 'none';
    if (mapOpen) { mapTimer = 0; drawFullMap(); }
  }
  mapRoot.addEventListener('pointerdown', (e) => { e.preventDefault(); toggleMap(false); });

  // ---------- minimap drawing ----------
  function sizeCanvas(cv, cssW) {
    dpr = Math.min(window.devicePixelRatio || 1, game.isMobile ? 1.5 : 2);
    const px = Math.max(64, Math.round(cssW * dpr));
    if (cv.width !== px) { cv.width = px; cv.height = px; }
    return px;
  }

  /*
   * Minimap maths.
   * The pre-rendered canvas is a normal (non-mirrored) top-down view: world x -> canvas right, world z -> canvas down.
   * Player heading h has forward f = (sin h, cos h) in (x, z), i.e. on that canvas f = (sin h, cos h) (y down).
   * We want f to point to screen-up (0,-1). A canvas rotation by th maps (a,b) -> (a cos th - b sin th, a sin th + b cos th).
   * Solving gives th = h + PI  (check: h=0 faces +z=down, so we rotate by 180 deg).
   * It is a pure rotation, so no mirroring: what is to the player's right (-x when h=0) ends up on the right.
   * For a world offset (dx, dz) from the player the screen offset is, with cos th = -cos h, sin th = -sin h:
   *   sx = -dx cos h + dz sin h ;  sy = -dx sin h - dz cos h   (times pixels-per-metre k)
   * North is taken as world -z (top of the pre-rendered canvas): its offset (0,-1) maps to (-sin h, cos h).
   */
  function drawMini() {
    const px = sizeCanvas(miniCv, miniCv.clientWidth || 160);
    const c = mctx, S = px, half = S / 2, u = S / 160;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#0d0618'; c.fillRect(0, 0, S, S);
    const p = game.player, w = game.world, mm = w?.minimap;
    if (!p || !mm?.canvas || !p.position) return;
    const wh = w.half ?? 600;
    const ppm = mm.pxPerMeter || mm.canvas.width / (wh * 2);
    const veh = p.inVehicle ? p.vehicle : null;
    const h = veh ? (veh.heading || 0) : (p.aimYaw ?? p.heading ?? 0);
    const speedKmh = veh ? Math.abs(veh.speed || 0) * 3.6 : 0;
    const targetR = 58 + Math.min(1, speedKmh / 120) * 50;
    miniR += (targetR - miniR) * 0.06;
    const k = half / miniR;               // device px per metre
    const ch = Math.cos(h), sh = Math.sin(h);
    const ox = p.position.x, oz = p.position.z;

    c.save();
    c.translate(half, half);
    c.rotate(h + Math.PI);
    c.scale(k / ppm, k / ppm);
    c.drawImage(mm.canvas, -(ox + wh) * ppm, -(oz + wh) * ppm);
    c.restore();

    const edge = half - 6 * u;
    const plot = (x, z, clampRim) => {
      const dx = x - ox, dz = z - oz;
      let sx = (-dx * ch + dz * sh) * k, sy = (-dx * sh - dz * ch) * k;
      const d = Math.hypot(sx, sy);
      let rim = false;
      if (d > edge) {
        if (!clampRim) return null;
        sx *= edge / d; sy *= edge / d; rim = true;
      }
      return { x: half + sx, y: half + sy, rim };
    };

    // landmarks
    const lms = w.landmarks;
    if (lms) {
      c.font = `800 ${7 * u}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (let i = 0; i < lms.length; i++) {
        const l = lms[i], q = plot(l.x, l.z, false);
        if (!q) continue;
        const d = LANDMARKS[l.type] || LM_DEFAULT;
        c.fillStyle = d.c; c.strokeStyle = '#12082a'; c.lineWidth = 1.2 * u;
        c.beginPath(); c.arc(q.x, q.y, 4.6 * u, 0, 6.2832); c.fill(); c.stroke();
        c.fillStyle = '#12082a'; c.fillText(d.t, q.x, q.y + 0.4 * u);
      }
    }
    // police
    const pol = game.police;
    if (pol) {
      const flash = ((t * 6) | 0) & 1;
      const col = flash ? '#ff2a3c' : '#3a7bff';
      const draw = (list, r) => {
        if (!list) return;
        const n = Math.min(list.length, 30);
        for (let i = 0; i < n; i++) {
          const e = list[i];
          if (!e || e.alive === false || !e.position) continue;
          const q = plot(e.position.x, e.position.z, false);
          if (!q) continue;
          c.fillStyle = col; c.strokeStyle = '#fff'; c.lineWidth = 1 * u;
          c.beginPath(); c.arc(q.x, q.y, r * u, 0, 6.2832); c.fill(); c.stroke();
        }
      };
      draw(pol.cars, 3.6); draw(pol.cops, 2.6);
    }
    // mission blips (clamped to the rim)
    const blips = game.missions?.blips;
    if (blips) {
      for (let i = 0; i < blips.length; i++) {
        const b = blips[i]; if (!b) continue;
        const q = plot(b.x, b.z, true);
        const col = colorStr(b.color, b.type === 'target' ? '#ff3b4d' : '#ffd23d');
        const r = (q.rim ? 3.6 : 5) * u;
        c.fillStyle = col; c.strokeStyle = '#12082a'; c.lineWidth = 1.4 * u;
        c.beginPath();
        if (b.type === 'target') { c.moveTo(q.x, q.y - r * 1.2); c.lineTo(q.x + r, q.y); c.lineTo(q.x, q.y + r * 1.2); c.lineTo(q.x - r, q.y); c.closePath(); }
        else c.arc(q.x, q.y, r, 0, 6.2832);
        c.fill(); c.stroke();
        if (b.type === 'mission' && !q.rim) { c.fillStyle = '#12082a'; c.font = `900 ${7 * u}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('!', q.x, q.y + 0.4 * u); }
      }
    }
    // north marker on the rim
    const nx = half + (-sh) * (half - 8 * u), ny = half + ch * (half - 8 * u);
    c.fillStyle = '#ff3d9a'; c.beginPath(); c.arc(nx, ny, 5.5 * u, 0, 6.2832); c.fill();
    c.fillStyle = '#fff'; c.font = `900 ${7.5 * u}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('K', nx, ny + 0.4 * u);
    // player arrow (always points up)
    c.save(); c.translate(half, half);
    c.fillStyle = '#35e0ff'; c.strokeStyle = '#fff'; c.lineWidth = 1.4 * u;
    c.shadowColor = '#35e0ff'; c.shadowBlur = 6 * u;
    c.beginPath(); c.moveTo(0, -7 * u); c.lineTo(5 * u, 5.5 * u); c.lineTo(0, 2.5 * u); c.lineTo(-5 * u, 5.5 * u); c.closePath(); c.fill(); c.stroke();
    c.restore();
  }

  // ---------- full map drawing (north = -z up, x right, same orientation as the pre-rendered canvas) ----------
  function drawFullMap() {
    const w = game.world, mm = w?.minimap;
    const px = sizeCanvas(mapCv, mapCv.clientWidth || 600);
    const c = mapCtx, S = px, wh = w?.half ?? 600, s = S / (wh * 2);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#0d0618'; c.fillRect(0, 0, S, S);
    if (mm?.canvas) c.drawImage(mm.canvas, 0, 0, S, S);
    const X = (x) => (x + wh) * s, Z = (z) => (z + wh) * s;
    const fs = Math.max(10, S / 48);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    // landmarks
    const lms = w?.landmarks || [];
    for (const l of lms) {
      const d = LANDMARKS[l.type] || LM_DEFAULT, r = fs * 0.75;
      c.fillStyle = d.c; c.strokeStyle = '#12082a'; c.lineWidth = fs * 0.15;
      c.beginPath(); c.arc(X(l.x), Z(l.z), r, 0, 6.2832); c.fill(); c.stroke();
      c.fillStyle = '#12082a'; c.font = `900 ${fs}px system-ui`; c.fillText(d.t, X(l.x), Z(l.z) + 1);
      c.font = `700 ${fs * 0.95}px system-ui`; c.lineWidth = fs * 0.3; c.strokeStyle = 'rgba(13,6,24,.95)'; c.fillStyle = '#fff';
      c.strokeText(l.name || d.n, X(l.x), Z(l.z) + r + fs * 0.9); c.fillText(l.name || d.n, X(l.x), Z(l.z) + r + fs * 0.9);
    }
    // mission blips
    for (const b of (game.missions?.blips || [])) {
      if (!b) continue;
      c.fillStyle = colorStr(b.color, b.type === 'target' ? '#ff3b4d' : '#ffd23d'); c.strokeStyle = '#12082a'; c.lineWidth = fs * 0.18;
      c.beginPath(); c.arc(X(b.x), Z(b.z), fs * 0.8, 0, 6.2832); c.fill(); c.stroke();
      if (b.label) {
        c.font = `700 ${fs * 0.9}px system-ui`; c.lineWidth = fs * 0.3; c.strokeStyle = 'rgba(13,6,24,.95)'; c.fillStyle = '#ffe9a8';
        c.strokeText(b.label, X(b.x), Z(b.z) - fs * 1.3); c.fillText(b.label, X(b.x), Z(b.z) - fs * 1.3);
      }
    }
    // police
    const flash = ((t * 6) | 0) & 1;
    for (const e of [...(game.police?.cars || []), ...(game.police?.cops || [])].slice(0, 40)) {
      if (!e?.position) continue;
      c.fillStyle = flash ? '#ff2a3c' : '#3a7bff';
      c.beginPath(); c.arc(X(e.position.x), Z(e.position.z), fs * 0.35, 0, 6.2832); c.fill();
    }
    // player: arrow rotated by phi = PI - h (arrow drawn pointing up = -z; forward is (sin h, cos h) in canvas coords)
    const p = game.player;
    if (p?.position) {
      const h = p.inVehicle && p.vehicle ? p.vehicle.heading : (p.heading ?? 0);
      c.save(); c.translate(X(p.position.x), Z(p.position.z)); c.rotate(Math.PI - h);
      c.fillStyle = '#35e0ff'; c.strokeStyle = '#fff'; c.lineWidth = fs * 0.18; c.shadowColor = '#35e0ff'; c.shadowBlur = fs;
      c.beginPath(); c.moveTo(0, -fs * 1.1); c.lineTo(fs * 0.8, fs * 0.8); c.lineTo(0, fs * 0.35); c.lineTo(-fs * 0.8, fs * 0.8); c.closePath(); c.fill(); c.stroke();
      c.restore();
    }
    // north marker
    c.fillStyle = '#ff3d9a'; c.beginPath(); c.arc(S - fs * 1.4, fs * 1.4, fs * 0.9, 0, 6.2832); c.fill();
    c.fillStyle = '#fff'; c.font = `900 ${fs}px system-ui`; c.fillText('K', S - fs * 1.4, fs * 1.4 + 1);
  }

  // ---------- per-frame ----------
  function update(dt) {
    t += dt; frameN++;
    const g = game, st = g.state;
    const hidden = st.mode === 'menu';
    if (hidden !== wasHidden) { wasHidden = hidden; hud.style.display = hidden ? 'none' : ''; if (hidden && mapOpen) toggleMap(false); }
    if (hidden) return;

    const tm = !!(g.isMobile || g.input?.usingTouch);
    if (tm !== touchMode) { touchMode = tm; hud.classList.toggle('touch', tm); }

    if (st.mode === 'playing' && g.input?.pressed('map')) toggleMap();
    if (st.mode !== 'playing' && mapOpen) toggleMap(false);

    const p = g.player;
    // clock
    const tod = ((st.timeOfDay % 24) + 24) % 24;
    const hh = Math.floor(tod), mi = Math.floor((tod - hh) * 60);
    const cs = pad2(hh) + ':' + pad2(mi);
    if (cs !== lastClock) { lastClock = cs; clockEl.textContent = cs; }

    // money (animated)
    moneyTarget = st.money || 0;
    if (moneyShown !== moneyTarget) {
      const d = moneyTarget - moneyShown;
      moneyShown = Math.abs(d) < 1 ? moneyTarget : moneyShown + d * Math.min(1, dt * 7);
    }
    const mr = Math.round(moneyShown);
    if (mr !== lastMoney) { lastMoney = mr; moneyTxt.nodeValue = fmtMoney(mr); }

    // wanted
    const wl = Math.max(0, Math.min(5, g.police?.wantedLevel | 0));
    const esc = !!g.police?.escaping;
    if (wl !== lastStars) { lastStars = wl; for (let i = 0; i < 5; i++) stars[i].classList.toggle('on', i < wl); }
    if (esc !== lastEsc) { lastEsc = esc; starsEl.classList.toggle('escaping', esc); }

    // weapon
    const cur = g.weapons?.current;
    const def = cur ? g.weapons?.defs?.[cur.id] : null;
    const wn = cur ? (def?.name || cur.id) : 'Yumruk';
    if (wn !== lastWeapon) { lastWeapon = wn; wName.textContent = wn; }
    const melee = !cur || cur.id === 'fist' || cur.id === 'bat' || def?.melee === true || (def && def.range != null && def.range <= 3);
    let ammoStr = '';
    if (!melee) ammoStr = cur.clip != null ? `${cur.clip}|${cur.ammo}` : `${cur.ammo}`;
    if (ammoStr !== lastAmmo) {
      lastAmmo = ammoStr; wAmmo.textContent = '';
      if (ammoStr) {
        const parts = ammoStr.split('|');
        wAmmo.appendChild(document.createTextNode(parts[0]));
        if (parts[1] != null) el('small', '', wAmmo, ' / ' + parts[1]);
      }
    }

    // health / armor
    const hp = Math.max(0, Math.min(100, Math.round(p?.health ?? 100)));
    if (hp !== lastHp) {
      lastHp = hp; hpFill.style.transform = `scaleX(${hp / 100})`;
      const low = hp > 0 && hp < 25;
      hpBar.classList.toggle('low', low);
      if (low !== lowHp) { lowHp = low; if (!vig.classList.contains('hit')) vig.classList.toggle('low', low); }
    }
    const ar = Math.max(0, Math.min(100, Math.round(p?.armor ?? 0)));
    if (ar !== lastAr) { lastAr = ar; arFill.style.transform = `scaleX(${ar / 100})`; arBar.style.display = ar > 0 ? '' : 'none'; }

    // vehicle
    const veh = p?.inVehicle ? p.vehicle : null;
    if ((!!veh) !== inVeh) { inVeh = !!veh; speedo.style.display = inVeh ? '' : 'none'; }
    if (veh) {
      const sp = Math.round(Math.abs(veh.speed || 0) * 3.6);
      if (sp !== lastSpeed) { lastSpeed = sp; speedNum.nodeValue = String(sp); }
      const vh = Math.max(0, Math.min(100, Math.round(veh.health ?? 100)));
      if (vh !== lastVh) { lastVh = vh; vhFill.style.transform = `scaleX(${vh / 100})`; vhBar.classList.toggle('low', vh < 25); }
    }

    // crosshair
    const showCross = !veh && !melee && p && p.alive !== false && st.mode === 'playing';
    if (showCross !== lastCross) { lastCross = showCross; cross.style.display = showCross ? '' : 'none'; }
    if (showCross) {
      crossKick = Math.max(0, crossKick - dt * 5);
      const gap = Math.round((g.input?.aim ? 3 : 5) + crossKick * 9);
      if (gap !== crossGap) { crossGap = gap; cross.style.setProperty('--g', gap + 'px'); }
    }

    // mission objective / timer (poll missions in addition to events)
    const act = g.missions?.active;
    const po = act ? (act.objective ?? null) : null;
    if (po !== pollObj) { pollObj = po; objManual = po; applyObjective(); }
    const tmr = act?.timer;
    if (tmr != null) {
      const sec = Math.max(0, Math.ceil(tmr));
      const ts = pad2(Math.floor(sec / 60)) + ':' + pad2(sec % 60);
      if (ts !== lastTimer) { lastTimer = ts; mTimer.textContent = ts; }
      const red = tmr < 10;
      if (red !== lastTimerRed) { lastTimerRed = red; mTimer.classList.toggle('red', red); }
    } else if (lastTimer !== '') { lastTimer = ''; lastTimerRed = null; mTimer.style.display = 'none'; }
    if (lastTimer !== '' && mTimer.style.display === 'none') mTimer.style.display = '';

    // minimap (every 2nd frame on mobile)
    if (!game.isMobile || (frameN & 1) === 0) drawMini();
    if (mapOpen) { mapTimer -= dt; if (mapTimer <= 0) { mapTimer = 0.2; drawFullMap(); } }
  }

  return { notify, showBigText, setPrompt, setObjective, toggleMap, update, get prompt() { return promptText; }, el: hud };
}
