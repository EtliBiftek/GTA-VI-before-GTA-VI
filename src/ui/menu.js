// Neon Coast menus: title screen, pause menu, settings, controls, rotate-device overlay, loading fade.
import './ui.css';

const SAVE_KEY = 'neoncoast.save';

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}
const fmtMoney = (n) => '$' + Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const hasSave = () => { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } };

const LOGO_SVG = `
<svg viewBox="0 0 220 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="ncSun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd23d"/><stop offset=".5" stop-color="#ff9a3d"/><stop offset="1" stop-color="#ff3d9a"/></linearGradient>
    <mask id="ncSunMask"><rect width="220" height="120" fill="#fff"/>
      <rect y="62" width="220" height="2.5" fill="#000"/><rect y="72" width="220" height="3.5" fill="#000"/>
      <rect y="82" width="220" height="4.5" fill="#000"/><rect y="92" width="220" height="5.5" fill="#000"/></mask>
  </defs>
  <g mask="url(#ncSunMask)"><circle cx="110" cy="58" r="50" fill="url(#ncSun)"/></g>
  <rect x="10" y="104" width="200" height="3" rx="1.5" fill="#35e0ff"/>
  <rect x="40" y="111" width="140" height="2" rx="1" fill="#35e0ff" opacity=".55"/>
  <g fill="#1a0b2e" stroke="#ff3d9a" stroke-width="1.2" stroke-linejoin="round">
    <path d="M160 104 C161 84 164 70 170 52 L173 53 C169 70 166 84 166 104 Z"/>
    <path d="M171 52 C160 40 146 42 138 50 C150 45 160 47 170 55 Z"/>
    <path d="M171 52 C176 38 190 34 200 40 C190 39 182 44 174 55 Z"/>
    <path d="M171 53 C158 52 150 60 148 70 C154 60 162 57 172 58 Z"/>
    <path d="M172 53 C182 52 192 58 194 68 C188 61 180 58 172 58 Z"/>
    <path d="M171 51 C170 40 172 32 178 28 C176 36 175 44 173 52 Z"/>
  </g>
</svg>`;

const KEYS = [
  ['W A S D', 'Hareket'], ['Fare', 'Bakış'], ['Sol tık', 'Ateş'], ['Sağ tık', 'Nişan'],
  ['Shift', 'Koş'], ['Space', 'Zıpla / El freni'], ['F', 'Araca bin / in'], ['Q / E', 'Silah değiştir'],
  ['R', 'Şarjör'], ['H', 'Korna'], ['C', 'Kamera'], ['M', 'Harita'], ['T', 'Radyo'], ['Esc', 'Duraklat'],
];

export function createMenu(game) {
  const root = document.getElementById('ui-root') || document.body;
  const menu = el('div', 'nc-menu', root);
  menu.style.display = 'none';

  // rotate-device overlay (CSS shows it for portrait + coarse pointer)
  const rot = el('div', 'nc-rotate nc-head', root);
  rot.innerHTML = '<svg viewBox="0 0 64 64" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="20" y="6" width="24" height="44" rx="4"/><path d="M30 44h4"/><path d="M8 54c8 6 20 8 30 4M44 60l-6-2 3-6" stroke="#35e0ff"/></svg>';
  el('div', '', rot, 'Lütfen cihazını yan çevir');

  // loading fade
  const loading = el('div', 'nc-loading', root);
  loading.style.display = 'none';

  let page = 'main';       // main | settings | controls | confirm
  let shownMode = null;
  let fsTried = false;

  const emitClick = () => game.events?.emit('ui:click');

  function tryFullscreen() {
    if (fsTried) return; fsTried = true;
    try { const p = document.documentElement.requestFullscreen?.(); p?.catch?.(() => {}); } catch { /* ignore */ }
    try { const p = screen.orientation?.lock?.('landscape'); p?.catch?.(() => {}); } catch { /* ignore */ }
  }

  function loadingFade() {
    loading.style.display = '';
    loading.classList.remove('out'); void loading.offsetWidth;
    requestAnimationFrame(() => loading.classList.add('out'));
    setTimeout(() => { loading.style.display = 'none'; }, 1100);
  }

  function begin(mode) {
    tryFullscreen();
    if (mode === 'load') { try { game.missions?.loadGame?.(); } catch (e) { console.error(e); } }
    else if (mode === 'new') { try { game.missions?.newGame?.(); } catch (e) { console.error(e); } }
    loadingFade();
    game.start();
  }

  function btn(parent, label, fn, opts = {}) {
    const b = el('button', 'nc-btn' + (opts.danger ? ' danger' : ''), parent);
    b.type = 'button';
    el('span', '', b, label);
    if (opts.sub) el('small', '', b, opts.sub);
    b.addEventListener('click', (e) => { e.stopPropagation(); emitClick(); fn(); });
    return b;
  }

  function go(p) { page = p; render(); }

  // ---------- pages ----------
  function renderMain(paused) {
    const shell = el('div', 'nc-shell', menu);
    const logo = el('div', 'nc-logo', shell);
    logo.insertAdjacentHTML('beforeend', LOGO_SVG);
    const w = el('h1', 'nc-word nc-head', logo);
    w.appendChild(document.createTextNode('NEON')); el('span', '', w, 'COAST');
    if (paused) el('div', 'nc-tag', logo, 'Duraklatıldı');
    else el('div', 'nc-tag', logo, "İstanbul'a hoş geldin");

    const col = el('div', '', shell);
    const btns = el('div', 'nc-btns', col);
    if (paused) {
      btn(btns, 'DEVAM ET', () => game.resume());
      btn(btns, 'AYARLAR', () => go('settings'));
      btn(btns, 'KONTROLLER', () => go('controls'));
      btn(btns, 'KAYDET', () => {
        if (game.missions?.saveGame) { try { game.missions.saveGame(); game.hud?.notify?.('Oyun kaydedildi'); } catch { game.hud?.notify?.('Kaydedilemedi'); } }
        else game.hud?.notify?.('Kaydetme şu an kullanılamıyor');
      });
      const info = el('div', 'nc-panel nc-info', col);
      const act = game.missions?.active;
      const line = (k, v) => { const d = el('div', '', info); el('b', '', d, k + ': '); d.appendChild(document.createTextNode(v)); };
      line('Görev', act ? (act.def?.title || 'Aktif görev') : 'Aktif görev yok');
      if (act?.objective) el('div', '', info, act.objective);
      line('Para', fmtMoney(game.state.money));
      const done = game.missions?.completed?.size;
      if (done != null) line('Tamamlanan görev', String(done));
      const secs = Math.floor(game.state.time || 0);
      line('Oyun süresi', `${Math.floor(secs / 60)} dk ${secs % 60} sn`);
    } else {
      const save = hasSave();
      if (save) btn(btns, 'DEVAM ET', () => begin('load'));
      btn(btns, save ? 'YENİ OYUN' : 'OYUNA BAŞLA', () => (save ? go('confirm') : begin('new')));
      btn(btns, 'AYARLAR', () => go('settings'));
      btn(btns, 'KONTROLLER', () => go('controls'));
      if (window.neonDesktop?.quit) btn(btns, 'ÇIKIŞ', () => window.neonDesktop.quit(), { danger: true });
    }
    focusFirst();
  }

  function renderConfirm() {
    const p = el('div', 'nc-panel nc-page', menu);
    p.style.width = 'min(100%, calc(var(--u) * 46))';
    el('h2', 'nc-head', p, 'YENİ OYUN?');
    el('p', '', p, 'Kayıtlı bir oyun var. Yeni oyun başlatırsan mevcut ilerlemen silinir.');
    const row = el('div', 'nc-confirm', p);
    btn(row, 'VAZGEÇ', () => go('main'));
    btn(row, 'YENİ OYUN', () => begin('new'), { danger: true });
    focusFirst();
  }

  function seg(parent, options, getter, setter) {
    const wrap = el('div', 'nc-seg', parent);
    const bs = options.map(([val, label]) => {
      const b = el('button', '', wrap, label); b.type = 'button';
      b.addEventListener('click', () => { emitClick(); setter(val); refresh(); });
      return [val, b];
    });
    const refresh = () => bs.forEach(([v, b]) => b.classList.toggle('on', v === getter()));
    refresh();
  }

  function slider(parent, min, max, step, getter, setter, fmt) {
    const inp = el('input', '', parent); inp.type = 'range';
    inp.min = min; inp.max = max; inp.step = step; inp.value = getter();
    const val = el('span', 'nc-val', parent, fmt(getter()));
    inp.addEventListener('input', () => { const v = parseFloat(inp.value); setter(v); val.textContent = fmt(v); });
    inp.addEventListener('change', emitClick);
  }

  function renderSettings() {
    const S = game.settings;
    const apply = () => game.applySettings?.();
    const p = el('div', 'nc-panel nc-page', menu);
    el('h2', 'nc-head', p, 'AYARLAR');
    let r = el('div', 'nc-set', p); el('label', '', r, 'Grafik kalitesi');
    seg(r, [['low', 'Düşük'], ['medium', 'Orta'], ['high', 'Yüksek']], () => S.quality, (v) => { S.quality = v; apply(); });
    r = el('div', 'nc-set', p); el('label', '', r, 'Bakış hassasiyeti');
    slider(r, 0.3, 2.5, 0.05, () => S.sensitivity, (v) => { S.sensitivity = v; apply(); }, (v) => v.toFixed(2) + 'x');
    r = el('div', 'nc-set', p); el('label', '', r, 'Ses');
    slider(r, 0, 1, 0.05, () => S.volume, (v) => { S.volume = v; apply(); }, (v) => Math.round(v * 100) + '%');
    r = el('div', 'nc-set', p); el('label', '', r, 'Müzik');
    seg(r, [[true, 'Açık'], [false, 'Kapalı']], () => !!S.music, (v) => { S.music = v; apply(); });
    el('div', 'nc-note', p, 'Bazı değişiklikler yeniden başlatınca uygulanır');
    const b = btn(p, 'GERİ', () => go('main')); b.style.width = 'calc(var(--u) * 16)';
    focusFirst();
  }

  function renderControls() {
    const p = el('div', 'nc-panel nc-page', menu);
    el('h2', 'nc-head', p, 'KONTROLLER');
    const grid = el('div', 'nc-keys', p);
    for (const [k, d] of KEYS) { const row = el('div', '', grid); el('kbd', '', row, k); el('span', '', row, d); }
    el('h3', 'nc-head', p, 'Dokunmatik');
    el('p', '', p, 'Sol yarıya dokunup sürükle: hareket (sanal joystick). Sağ yarıyı sürükle: kamera. Sağ alttaki düğmeler: ateş, nişan, zıpla, koş, araca bin, silah değiştir, şarjör. Araçta: gaz, fren, el freni, korna, kamera ve radyo. Üstteki düğmeler: duraklat ve harita.');
    el('h3', 'nc-head', p, 'Oyun kolu');
    el('p', '', p, 'Standart oyun kolları desteklenir: sol analog hareket, sağ analog bakış, RT ateş, LB nişan, Y araca bin / in.');
    const b = btn(p, 'GERİ', () => go('main')); b.style.width = 'calc(var(--u) * 16)';
    focusFirst();
  }

  function render() {
    menu.textContent = '';
    const paused = game.state.mode === 'paused';
    menu.classList.toggle('pause', paused);
    if (page === 'settings') renderSettings();
    else if (page === 'controls') renderControls();
    else if (page === 'confirm') renderConfirm();
    else renderMain(paused);
    if (!paused) el('div', 'nc-version', menu, 'Neon Coast');
  }

  function focusables() { return [...menu.querySelectorAll('button, input')]; }
  function focusFirst() {
    // Defer so the element is attached; skip when the pointer is being used (touch) to avoid focus rings.
    const f = focusables()[0];
    if (f && !game.input?.usingTouch) f.focus({ preventScroll: true });
  }

  // keyboard navigation (capture so Esc inside sub-pages goes back instead of pausing/resuming)
  window.addEventListener('keydown', (e) => {
    if (menu.style.display === 'none') return;
    if (e.code === 'Escape' || e.code === 'Backspace') {
      if (page !== 'main') { e.stopImmediatePropagation(); e.preventDefault(); go('main'); }
      return;
    }
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      const list = focusables();
      if (!list.length) return;
      e.preventDefault(); e.stopImmediatePropagation();
      let i = list.indexOf(document.activeElement);
      i = i < 0 ? 0 : (i + (e.code === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
      list[i].focus({ preventScroll: true });
    } else if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && document.activeElement?.parentElement?.classList.contains('nc-seg')) {
      const sibs = [...document.activeElement.parentElement.children];
      const i = sibs.indexOf(document.activeElement) + (e.code === 'ArrowRight' ? 1 : -1);
      if (sibs[i]) { e.preventDefault(); e.stopImmediatePropagation(); sibs[i].focus(); sibs[i].click(); }
    } else if (e.code === 'Enter' || e.code === 'Space') {
      if (document.activeElement?.tagName === 'BUTTON') e.stopImmediatePropagation(); // native click handles it
    }
  }, true);

  // ---------- visibility by game mode ----------
  function sync() {
    const m = game.state.mode;
    if (m === shownMode) return;
    shownMode = m;
    if (m === 'menu' || m === 'paused') { page = 'main'; menu.style.display = ''; render(); }
    else menu.style.display = 'none';
  }

  return {
    update() { sync(); },
    init() { sync(); },
    show(p = 'main') { page = p; menu.style.display = ''; render(); },
    el: menu,
  };
}
