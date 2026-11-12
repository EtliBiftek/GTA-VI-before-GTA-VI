// tiny PNG decoder (8-bit grey/RGB/RGBA/palette, non-interlaced) -> {W,H,data RGBA}
const fs = require('fs'), zlib = require('zlib');
function decodePNG(src) {
  const b = Buffer.isBuffer(src) ? src : fs.readFileSync(src); let p = 8, W, H, ct, bd; const idat = []; let plte = null, trns = null;
  while (p < b.length) { const len = b.readUInt32BE(p), type = b.toString('latin1', p + 4, p + 8); const d = b.slice(p + 8, p + 8 + len);
    if (type === 'IHDR') { W = d.readUInt32BE(0); H = d.readUInt32BE(4); bd = d[8]; ct = d[9]; if (d[12]) throw new Error('interlaced png'); } else if (type === 'IDAT') idat.push(d); else if (type === 'PLTE') plte = d; else if (type === 'tRNS') trns = d; p += 12 + len; }
  if (bd !== 8) throw new Error('png bit depth ' + bd);
  const bpp = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct], raw = zlib.inflateSync(Buffer.concat(idat)), out = Buffer.alloc(W * H * 4), stride = W * bpp;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < H; y++) { const f = raw[y * (stride + 1)], line = Buffer.from(raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) { const a = i >= bpp ? line[i - bpp] : 0, u = prev[i], c = i >= bpp ? prev[i - bpp] : 0; let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += u; else if (f === 3) v += (a + u) >> 1; else if (f === 4) { const pp = a + u - c, pa = Math.abs(pp - a), pb = Math.abs(pp - u), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? u : c; }
      line[i] = v & 255; }
    for (let x = 0; x < W; x++) { const o = (y * W + x) * 4; let r, g, bl, a = 255;
      if (ct === 6) { r = line[x * 4]; g = line[x * 4 + 1]; bl = line[x * 4 + 2]; a = line[x * 4 + 3]; }
      else if (ct === 2) { r = line[x * 3]; g = line[x * 3 + 1]; bl = line[x * 3 + 2]; }
      else if (ct === 0) { r = g = bl = line[x]; }
      else if (ct === 4) { r = g = bl = line[x * 2]; a = line[x * 2 + 1]; }
      else { const k = line[x]; r = plte[k * 3]; g = plte[k * 3 + 1]; bl = plte[k * 3 + 2]; if (trns && k < trns.length) a = trns[k]; }
      out[o] = r; out[o + 1] = g; out[o + 2] = bl; out[o + 3] = a; }
    prev = line; }
  return { W, H, data: out };
}
module.exports = { decodePNG };
