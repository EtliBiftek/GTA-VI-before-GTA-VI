// Procedural canvas textures (facades + emissive night windows, sign atlas, glow, water, moon).
import * as THREE from 'three';
import { seeded } from '../core/utils.js';

const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const tex = (canvas, srgb = true) => {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

// metres covered by one texture repeat (4x4 window cells) and floor height per kind
export const FACADE = {
  glass: { repW: 12.8, repH: 14.4, floor: 3.6 },
  deco: { repW: 16.8, repH: 13.6, floor: 3.4 },
  house: { repW: 14.4, repH: 12, floor: 3.0 },
  industrial: { repW: 24, repH: 20, floor: 5 },
};

export function makeFacade(kind, seed, maxAniso = 4) {
  const R = seeded(seed), S = 256, c = 64;
  const map = mk(S, S), em = mk(S, S), g = map.getContext('2d'), e = em.getContext('2d');
  e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
  const chance = { glass: 0.5, deco: 0.42, house: 0.33, industrial: 0.18 }[kind];
  const lit = ['#ffe3ae', '#ffd48f', '#fff0cf', '#bfe9ff', '#ffc0ef'];
  g.fillStyle = '#fff'; g.fillRect(0, 0, S, S);
  for (let ry = 0; ry < 4; ry++) for (let rx = 0; rx < 4; rx++) {
    const x = rx * c, y = ry * c;
    let pane = null;
    if (kind === 'glass') {
      g.fillStyle = '#d6e0ea'; g.fillRect(x, y, c, c);
      const gr = g.createLinearGradient(x, y, x + c, y + c); gr.addColorStop(0, '#4f7aa6'); gr.addColorStop(1, '#9cbfdc');
      g.fillStyle = gr; g.fillRect(x + 4, y + 4, c - 8, c - 8);
      g.fillStyle = '#e4edf5'; g.fillRect(x + c / 2 - 1, y + 4, 2, c - 8);
      pane = [x + 4, y + 4, c - 8, c - 8];
    } else if (kind === 'deco') {
      g.fillStyle = '#fff'; g.fillRect(x, y, c, c);
      g.fillStyle = '#ece6da'; g.fillRect(x, y, 4, c); g.fillRect(x + c - 4, y, 4, c); g.fillRect(x, y + c - 3, c, 3);
      g.fillStyle = '#41566e'; g.fillRect(x + 14, y + 10, c - 28, c - 26);
      g.fillStyle = '#7e98b4'; g.fillRect(x + 14, y + 10, c - 28, 8);
      g.fillStyle = '#e9dfcb'; g.fillRect(x + 11, y + c - 16, c - 22, 4);
      pane = [x + 14, y + 10, c - 28, c - 26];
    } else if (kind === 'house') {
      g.fillStyle = '#fffdf8'; g.fillRect(x, y, c, c);
      g.fillStyle = '#a6b4bc'; g.fillRect(x + 10, y + 14, 8, c - 28); g.fillRect(x + c - 18, y + 14, 8, c - 28);
      g.fillStyle = '#46617a'; g.fillRect(x + 20, y + 14, c - 40, c - 28);
      pane = [x + 20, y + 14, c - 40, c - 28];
    } else {
      g.fillStyle = '#dfe3e6'; g.fillRect(x, y, c, c);
      g.fillStyle = '#cdd2d6'; for (let k = 0; k < c; k += 4) g.fillRect(x + k, y, 1, c);
      if (ry === 0) { g.fillStyle = '#3d4f60'; g.fillRect(x + 6, y + 8, c - 12, 18); pane = [x + 6, y + 8, c - 12, 18]; }
    }
    if (pane && R() < chance) { e.fillStyle = lit[R() < 0.06 ? 4 : Math.floor(R() * 4)]; e.fillRect(pane[0], pane[1], pane[2], pane[3]); }
  }
  const map_ = tex(map), em_ = tex(em);
  map_.anisotropy = em_.anisotropy = maxAniso;
  return { map: map_, emissiveMap: em_ };
}

// ---- sign atlas: 4 cols x 8 rows of 256x128 ----
export const SIGNS = [
  ['PALMERA COLA', '#d9202e', '#fff', '#ffe27a'], ['NEONBURGER', '#ffd23a', '#c2185b', '#fff'],
  ['KARTAL BANK', '#12305e', '#f2c14e', '#fff'], ['MAVİ TELEKOM', '#1b6fd0', '#fff', '#7ff0ff'],
  ['SURF & SİMİT', '#14b8a6', '#fff', '#ff9f43'], ['SOLARA GÜNEŞ', '#ff7a3d', '#fff', '#ffe27a'],
  ['DALGA FM 98.7', '#6a1bb8', '#7ff0ff', '#fff'], ['VELOCE MOTORS', '#15151c', '#ff2d4a', '#fff'],
  ['TURKUAZ KAHVE', '#0e8a8a', '#fff', '#ffd9a0'], ['TURBO LASTİK', '#222', '#ffd23a', '#fff'],
  ['GÜVENLİ EV', '#0f8f8f', '#fff', '#ff7ab8'], ['HASTANE', '#f4f7fa', '#d62839', '#d62839'],
  ['POLİS', '#1d3f8f', '#fff', '#ffd23a'], ['SİLAH & MÜHİMMAT', '#2a2118', '#ffb000', '#fff'],
  ['OTO TAMİR', '#e8590c', '#fff', '#222'], ['STADYUM', '#1b7a3a', '#fff', '#ffd23a'],
  ['İSKELE', '#7a5230', '#fff', '#ffd9a0'], ['LİMAN', '#254a73', '#fff', '#ffb000'],
  ['PLAJ', '#26c6da', '#fff', '#ff9f43'], ['PARK', '#2e8b57', '#fff', '#fff3a0'],
  ['ŞEHİR MERKEZİ', '#2b1b5e', '#ff6ad5', '#7ff0ff'],
];
export const SIGN_ID = { ads: 10, safehouse: 10, hospital: 11, police: 12, gunshop: 13, garage: 14, stadium: 15, pier: 16, docks: 17, beach: 18, park: 19, downtown: 20 };

export function makeSignAtlas() {
  const cv = mk(1024, 1024), g = cv.getContext('2d');
  g.fillStyle = '#222'; g.fillRect(0, 0, 1024, 1024);
  SIGNS.forEach(([text, bg, fg, ac], i) => {
    const x = (i % 4) * 256, y = Math.floor(i / 4) * 128;
    g.fillStyle = bg; g.fillRect(x, y, 256, 128);
    g.fillStyle = ac; g.fillRect(x + 6, y + 6, 244, 5); g.fillRect(x + 6, y + 117, 244, 5);
    let size = 48; g.font = `bold ${size}px Arial, sans-serif`;
    while (g.measureText(text).width > 224 && size > 14) { size -= 2; g.font = `bold ${size}px Arial, sans-serif`; }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = fg;
    g.fillText(text, x + 128, y + 66);
    if (text === 'HASTANE') { g.fillStyle = '#d62839'; g.fillRect(x + 14, y + 44, 30, 10); g.fillRect(x + 24, y + 34, 10, 30); }
  });
  const t = tex(cv); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
/** [u0, v0, u1, v1] of atlas cell i. */
export function signUV(i) {
  const col = i % 4, row = Math.floor(i / 4);
  return [col / 4 + 0.002, 1 - (row + 1) / 8 + 0.002, (col + 1) / 4 - 0.002, 1 - row / 8 - 0.002];
}

export function makeGlow() {
  const cv = mk(128, 128), g = cv.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,225,160,1)'); gr.addColorStop(0.35, 'rgba(255,200,120,0.45)'); gr.addColorStop(1, 'rgba(255,180,90,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function makeMoon() {
  const cv = mk(128, 128), g = cv.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 10, 64, 64, 64);
  gr.addColorStop(0, 'rgba(240,244,255,1)'); gr.addColorStop(0.45, 'rgba(220,230,255,0.9)'); gr.addColorStop(0.5, 'rgba(180,200,255,0.25)'); gr.addColorStop(1, 'rgba(150,170,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function makeWater() {
  const S = 256, cv = mk(S, S), g = cv.getContext('2d'), R = seeded(77);
  g.fillStyle = '#b9d6e0'; g.fillRect(0, 0, S, S);
  g.lineCap = 'round';
  for (let i = 0; i < 90; i++) {
    const x = R() * S, y = R() * S, w = 14 + R() * 30;
    g.strokeStyle = R() < 0.5 ? 'rgba(255,255,255,0.5)' : 'rgba(120,170,200,0.45)'; g.lineWidth = 1 + R() * 2;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      g.beginPath(); g.moveTo(x + ox - w / 2, y + oy); g.quadraticCurveTo(x + ox, y + oy - 4, x + ox + w / 2, y + oy); g.stroke();
    }
  }
  const t = tex(cv); t.anisotropy = 4; return t;
}
