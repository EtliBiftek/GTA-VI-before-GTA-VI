// What gets converted from which pack (all CC0). size = target length of the `fit` axis (default y) in game metres.
module.exports = () => [
  // --- trees (Kenney Nature Kit)
  // The kit's own palette is teal / orange; it is recoloured to natural greens and barks here (vertex colours are baked anyway).
  { out: 'props/tree_plane.glb', parts: [{ kit: 'nature', file: 'tree_detailed.glb', opt: { recolor: { leafsGreen: 0x6f9a45, woodBark: 0x6f553c, _defaultMat: 0x6f9a45 } } }], size: 7.2 },
  { out: 'props/tree_oak.glb', parts: [{ kit: 'nature', file: 'tree_oak.glb', opt: { recolor: { leafsGreen: 0x5f9440, woodBark: 0x6a5039 } } }], size: 6.4 },
  { out: 'props/tree_cypress.glb', parts: [{ kit: 'nature', file: 'tree_pineTallA_detailed.glb', opt: { recolor: { leafsDark: 0x2d5a36, woodBarkDark: 0x57432f } } }], size: 9.6 },
  { out: 'props/tree_palm.glb', parts: [{ kit: 'nature', file: 'tree_palm.glb', opt: { recolor: { leafsGreen: 0x56a23c, woodBark: 0x9a7b55 } } }], size: 8.5 },
  // --- street furniture (City Kit Roads / Retro Urban Kit)
  { out: 'props/lamp.glb', parts: [{ kit: 'roads', file: 'light-curved.glb', opt: { mul: 0.42 } }], rotY: -Math.PI / 2, size: 6.4, centre: 'origin' },
  { out: 'props/lamp_square.glb', parts: [{ kit: 'roads', file: 'light-square.glb', opt: { mul: 0.42 } }], rotY: -Math.PI / 2, size: 6.4, centre: 'origin' },
  { out: 'props/bench.glb', parts: [{ kit: 'retro', file: 'detail-bench.glb' }], size: 1.9, fit: 'x' },
  { out: 'props/dumpster.glb', parts: [{ kit: 'roads', file: 'dumpster.glb' }], size: 2.2, fit: 'x' },
  { out: 'props/cone.glb', parts: [{ kit: 'roads', file: 'construction-cone.glb' }], size: 0.75 },
  { out: 'props/barrier.glb', parts: [{ kit: 'roads', file: 'construction-barrier.glb' }], size: 1.6, fit: 'x' },
  // --- docks
  { out: 'props/container_a.glb', parts: [{ kit: 'industrial', file: 'shipping-container-a.glb' }], size: 12.2, fit: 'z', sx: 0.46, sy: 0.5 },
  { out: 'props/container_b.glb', parts: [{ kit: 'industrial', file: 'shipping-container-b.glb' }], size: 12.2, fit: 'z', sx: 0.46, sy: 0.5 },
  { out: 'props/container_c.glb', parts: [{ kit: 'industrial', file: 'shipping-container-c.glb' }], size: 12.2, fit: 'z', sx: 0.46, sy: 0.5 },
  // --- boats (bow +X as the world's boat instances expect)
  { out: 'props/boat_small.glb', parts: [{ kit: 'watercraft', file: 'boat-fishing-small.glb' }], rotY: Math.PI / 2, size: 9, fit: 'x' },
  { out: 'props/ferry.glb', parts: [{ kit: 'watercraft', file: 'boat-tug-a.glb' }], rotY: Math.PI / 2, size: 30, fit: 'x', sy: 0.62, sz: 0.55 },
];
