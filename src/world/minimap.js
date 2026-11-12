// Pre-rendered 1024x1024 top-down map. world (x,z) -> pixel ((x+half)*ppm, (z+half)*ppm).
import { HALF, ROAD_W, shoreAt, PIER } from './layout.js';

export function renderMinimap(G, cells, footprints) {
  const S = 1024, ppm = S / (HALF * 2);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = S;
  const g = canvas.getContext('2d');
  const P = (v) => (v + HALF) * ppm;
  g.fillStyle = '#1b3550'; g.fillRect(0, 0, S, S);
  // land + sand
  g.fillStyle = '#3b4150'; g.beginPath(); g.moveTo(0, 0);
  for (let z = -HALF; z <= HALF; z += 10) g.lineTo(P(shoreAt(z)), P(z));
  g.lineTo(0, S); g.closePath(); g.fill();
  g.fillStyle = '#6b6250'; g.beginPath(); g.moveTo(P(457), 0);
  for (let z = -HALF; z <= HALF; z += 10) g.lineTo(P(shoreAt(z)), P(z));
  g.lineTo(P(457), S); g.closePath(); g.fill();
  const col = { park: '#3d6b4a', residential: '#44566a', plaza: '#6a5a78', stadium: '#3f5648' };
  for (const c of cells) {
    const k = c.type === 'park' || c.type === 'stadium' || c.type === 'plaza' ? c.type : null;
    g.fillStyle = k ? col[k] : c.type === 'industrial' ? '#4a4d55' : '#454c5c';
    g.fillRect(P(c.x0), P(c.z0), (c.x1 - c.x0) * ppm, (c.z1 - c.z0) * ppm);
  }
  // roads
  const { xs, zs, NX, NZ, h, v, idx, avX, avZ } = G;
  const rw = ROAD_W * ppm;
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
    if (h[idx(i, j)]) { g.fillStyle = avZ[j] ? '#aab0c0' : '#8a90a0'; g.fillRect(P(xs[i]) - rw / 2, P(zs[j]) - rw / 2, (xs[i + 1] - xs[i]) * ppm + rw, rw); }
    if (v[idx(i, j)]) { g.fillStyle = avX[i] ? '#aab0c0' : '#8a90a0'; g.fillRect(P(xs[i]) - rw / 2, P(zs[j]) - rw / 2, rw, (zs[j + 1] - zs[j]) * ppm + rw); }
  }
  // buildings
  g.fillStyle = '#262b36';
  for (const b of footprints) g.fillRect(P(b.minX), P(b.minZ), Math.max(1, (b.maxX - b.minX) * ppm), Math.max(1, (b.maxZ - b.minZ) * ppm));
  // pier
  g.fillStyle = '#a8825a'; g.fillRect(P(PIER.x0), P(PIER.z - PIER.hw), (PIER.x1 - PIER.x0) * ppm, PIER.hw * 2 * ppm);
  return { canvas, pxPerMeter: ppm };
}
