// Neon Coast - pooled 3D mission markers (translucent beam + ground ring + bobbing arrow).
// Shared geometries; materials cached per colour. Zero per-frame allocation.
export function createMarkers(THREE, scene, max = 6) {
  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
  cylGeo.translate(0, 0.5, 0);
  const ringGeo = new THREE.RingGeometry(0.8, 1, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const arrowGeo = new THREE.ConeGeometry(0.55, 1.4, 4);
  arrowGeo.rotateX(Math.PI); // tip points down

  const cache = new Map();
  function mats(color) {
    let m = cache.get(color);
    if (!m) {
      const base = { color, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false };
      m = {
        cyl: new THREE.MeshBasicMaterial({ ...base, opacity: 0.07, side: THREE.FrontSide }),
        ring: new THREE.MeshBasicMaterial({ ...base, opacity: 0.85 }),
        arrow: new THREE.MeshBasicMaterial({ ...base, opacity: 0.95 }),
      };
      cache.set(color, m);
    }
    return m;
  }

  const pool = [];
  for (let i = 0; i < max; i++) {
    const group = new THREE.Group();
    const m = mats('#ffd23f');
    const cyl = new THREE.Mesh(cylGeo, m.cyl);
    const ring = new THREE.Mesh(ringGeo, m.ring);
    const arrow = new THREE.Mesh(arrowGeo, m.arrow);
    ring.position.y = 0.12;
    cyl.frustumCulled = false;
    group.add(cyl, ring, arrow);
    group.visible = false;
    scene.add(group);
    pool.push({ group, cyl, ring, arrow, color: '#ffd23f', shown: false, rad: 0 });
  }
  let n = 0;

  return {
    begin() { n = 0; },
    /** Returns false when the pool is full. */
    add(x, z, r, color) {
      if (n >= max) return false;
      const it = pool[n++];
      const vr = r < 1.6 ? 1.6 : r > 12 ? 12 : r;
      it.group.position.set(x, 0, z);
      if (it.rad !== vr) {
        it.rad = vr;
        it.cyl.scale.set(vr, 14, vr);
        it.ring.scale.set(vr, 1, vr);
        it.arrow.scale.setScalar(vr > 4 ? 2 : 1.2);
      }
      if (it.color !== color) {
        const m = mats(color);
        it.cyl.material = m.cyl; it.ring.material = m.ring; it.arrow.material = m.arrow;
        it.color = color;
      }
      return true;
    },
    end(time) {
      for (let i = 0; i < max; i++) {
        const it = pool[i];
        if (i < n) {
          it.arrow.position.y = 5 + Math.sin(time * 3 + i) * 0.5;
          it.arrow.rotation.y = time * 2;
          if (!it.shown) { it.group.visible = true; it.shown = true; }
        } else if (it.shown) { it.group.visible = false; it.shown = false; }
      }
    },
    hideAll() { n = 0; this.end(0); },
  };
}
