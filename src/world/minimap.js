// Pre-rendered 1024x1024 top-down map. world (x,z) -> pixel ((x+half)*ppm, (z+half)*ppm). North (-z) is up.
import { HALF, ROAD_W } from './layout.js';

export function renderMinimap(G, links, footprints, greens, peds) {
  const S = 1024, ppm = S / (HALF * 2);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = S;
  const g = canvas.getContext('2d');
  const P = (v) => (v + HALF) * ppm;
  // land / water from the smoothed raster field (smooth shorelines)
  const img = g.createImageData(S, S), d = img.data, N = G.N, f = G.fR, R = G.R;
  const LAND = [60, 66, 82], WATER = [26, 70, 106], SHORE = [96, 112, 130];
  for (let py = 0; py < S; py++) {
    const rz = Math.min(N - 1, Math.floor(((py + 0.5) / ppm) / R));
    for (let px = 0; px < S; px++) {
      const rx = Math.min(N - 1, Math.floor(((px + 0.5) / ppm) / R)), v = f[rz * N + rx];
      const t = Math.min(1, Math.max(0, (v - 0.35) / 0.3)), k = (py * S + px) * 4, edge = 1 - Math.abs(t - 0.5) * 2;
      for (let c = 0; c < 3; c++) d[k + c] = (LAND[c] + (WATER[c] - LAND[c]) * t) * (1 - edge * 0.0) + (SHORE[c] - 60) * edge * 0.22;
      d[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = '#3d6b4a';
  for (const r of greens) g.fillRect(P(r.minX), P(r.minZ), (r.maxX - r.minX) * ppm, (r.maxZ - r.minZ) * ppm);
  const rw = Math.max(2, ROAD_W * ppm * 0.9);
  for (const l of links) {
    g.fillStyle = l.kind === 'bridge' ? '#f0d890' : l.coast ? '#b8c0d0' : l.av ? '#aab0c0' : '#8a90a0';
    const x0 = Math.min(l.a.x, l.b.x), z0 = Math.min(l.a.z, l.b.z), x1 = Math.max(l.a.x, l.b.x), z1 = Math.max(l.a.z, l.b.z);
    if (l.horiz) g.fillRect(P(x0) - rw / 2, P(z0) - rw / 2, (x1 - x0) * ppm + rw, rw); else g.fillRect(P(x0) - rw / 2, P(z0) - rw / 2, rw, (z1 - z0) * ppm + rw);
  }
  g.fillStyle = '#c9c0ae';
  for (const p of peds || []) g.fillRect(P(p.x) - rw * 0.35, P(p.z0), rw * 0.7, (p.z1 - p.z0) * ppm);
  for (const b of footprints) { g.fillStyle = b.c || '#262b36'; g.fillRect(P(b.minX), P(b.minZ), Math.max(1, (b.maxX - b.minX) * ppm), Math.max(1, (b.maxZ - b.minZ) * ppm)); }
  return { canvas, pxPerMeter: ppm };
}
