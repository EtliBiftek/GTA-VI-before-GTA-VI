// Soft blob / contact shadows: ONE instanced mesh of dark radial quads under vehicles, pedestrians and the player.
// Big visual win on 'low' (no real shadows); on medium/high it just adds subtle contact darkening and night grounding.
import * as THREE from 'three';

const CAP = 160;

function blobTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grd.addColorStop(0, 'rgba(0,0,0,0.95)'); grd.addColorStop(0.45, 'rgba(0,0,0,0.6)'); grd.addColorStop(0.8, 'rgba(0,0,0,0.12)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createBlobShadows(game) {
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.5,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, CAP);
  mesh.frustumCulled = false; mesh.renderOrder = 1; mesh.count = 0;
  game.scene.add(mesh);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const R2 = 90 * 90;

  return {
    mesh,
    update(night) {
      const low = game.settings.quality === 'low';
      mat.opacity = low ? 0.6 - 0.15 * night : 0.3 + 0.08 * night;
      const cam = game.camera.position;
      let n = 0;
      const vs = game.vehicles?.list;
      if (vs) for (let i = 0; i < vs.length && n < CAP; i++) {
        const v = vs[i];
        if (!v.mesh?.visible) continue;
        const dx = v.position.x - cam.x, dz = v.position.z - cam.z;
        if (dx * dx + dz * dz > 220 * 220) continue;
        q.setFromAxisAngle(up, v.heading);
        p.set(v.position.x, 0.06, v.position.z);
        s.set(v.halfW * 2.5, 1, v.halfL * 2.35);
        m4.compose(p, q, s); mesh.setMatrixAt(n++, m4);
      }
      const ps = game.peds?.list;
      if (ps) for (let i = 0; i < ps.length && n < CAP - 1; i++) {
        const e = ps[i];
        if (e.mesh?.visible === false || e.dead || e.alive === false) continue;
        const dx = e.position.x - cam.x, dz = e.position.z - cam.z;
        if (dx * dx + dz * dz > R2) continue;
        q.identity(); p.set(e.position.x, 0.06, e.position.z); s.set(1.0, 1, 1.0);
        m4.compose(p, q, s); mesh.setMatrixAt(n++, m4);
      }
      const pl = game.player;
      if (pl?.position && !pl.inVehicle && !pl.vehicle && n < CAP) {
        q.identity(); p.set(pl.position.x, 0.06, pl.position.z); s.set(1.05, 1, 1.05);
        m4.compose(p, q, s); mesh.setMatrixAt(n++, m4);
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
