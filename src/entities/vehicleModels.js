// Neon Coast - procedural low-poly vehicle models, type stats and shared geometry/material caches.
// Models face +Z, y up, ground at y = 0. Local +X is the LEFT side (driver side) of the car.
import * as THREE from 'three';

/** Vehicle type stats. accel/brake m/s^2, speeds m/s, grip = lateral friction rate (1/s),
 *  steer = max steering angle (rad) at standstill, damageMul = damage multiplier (lower = tougher). */
export const TYPES = {
  sedan: {
    id: 'sedan', name: 'Sedan', halfW: 0.92, halfL: 2.25, height: 1.42, accel: 8.5, maxSpeed: 40, reverse: 9,
    brake: 20, grip: 9, steer: 0.6, wheelBase: 2.7, mass: 1300, damageMul: 1, wheelR: 0.35, wheelW: 0.26,
    colors: ['#c8333a', '#24364a', '#e9edf0', '#1c8f83', '#7d4fa0', '#9aa3ab', '#1b1b1f', '#3d6fb6', '#e58a2f'],
  },
  sports: {
    id: 'sports', name: 'Spor', halfW: 0.98, halfL: 2.2, height: 1.16, accel: 13, maxSpeed: 56, reverse: 10,
    brake: 26, grip: 10.5, steer: 0.62, wheelBase: 2.6, mass: 1200, damageMul: 1.1, wheelR: 0.35, wheelW: 0.3,
    colors: ['#ff2e88', '#f5d000', '#ff5a1f', '#16e0c4', '#e9edf0', '#111114', '#7a2cff'],
  },
  pickup: {
    id: 'pickup', name: 'Kamyonet', halfW: 1.02, halfL: 2.65, height: 1.8, accel: 7.5, maxSpeed: 37, reverse: 8,
    brake: 18, grip: 8, steer: 0.55, wheelBase: 3.2, mass: 1800, damageMul: 0.8, wheelR: 0.43, wheelW: 0.3,
    colors: ['#8a2b22', '#2f4a2c', '#c9c2b0', '#3b3f47', '#2a5b8c', '#d9d4c7'],
  },
  van: {
    id: 'van', name: 'Minibüs', halfW: 1.05, halfL: 2.6, height: 2.25, accel: 6.2, maxSpeed: 33, reverse: 7,
    brake: 16, grip: 7.5, steer: 0.55, wheelBase: 3.0, mass: 2000, damageMul: 0.8, wheelR: 0.37, wheelW: 0.28,
    colors: ['#f2f2ee', '#c7d6df', '#e0b84a', '#4b6b8a', '#9c3f3f'],
  },
  taxi: {
    id: 'taxi', name: 'Taksi', halfW: 0.92, halfL: 2.3, height: 1.42, accel: 8.8, maxSpeed: 41, reverse: 9,
    brake: 20, grip: 9, steer: 0.6, wheelBase: 2.75, mass: 1300, damageMul: 1, wheelR: 0.35, wheelW: 0.26,
    colors: ['#f6c21a'],
  },
  police: {
    id: 'police', name: 'Polis', halfW: 0.95, halfL: 2.35, height: 1.45, accel: 12, maxSpeed: 52, reverse: 10,
    brake: 26, grip: 10, steer: 0.6, wheelBase: 2.8, mass: 1500, damageMul: 0.6, wheelR: 0.36, wheelW: 0.28,
    colors: ['#f1f3f5'],
  },
  bus: {
    id: 'bus', name: 'Otobüs', halfW: 1.3, halfL: 5.6, height: 3.1, accel: 3.8, maxSpeed: 26, reverse: 5,
    brake: 12, grip: 7, steer: 0.52, wheelBase: 7.0, mass: 9000, damageMul: 0.45, wheelR: 0.5, wheelW: 0.36,
    colors: ['#2e86c1', '#e67e22', '#27ae60', '#d7dbdd'],
  },
};

// Precompute derived values: collision circles along the body, bounding radius, wheel layout.
for (const T of Object.values(TYPES)) {
  T.radius = Math.hypot(T.halfW, T.halfL);
  const span = Math.max(0, T.halfL - T.halfW);
  const n = Math.max(2, Math.ceil((2 * span) / (1.4 * T.halfW)) + 1);
  T.circles = [];
  for (let i = 0; i < n; i++) T.circles.push(-span + (2 * span * i) / (n - 1));
  const wx = T.halfW - T.wheelW * 0.5 + 0.03;
  const wz = T.wheelBase / 2;
  T.wheels = [
    { x: wx, z: wz, front: true }, { x: -wx, z: wz, front: true },
    { x: wx, z: -wz, front: false }, { x: -wx, z: -wz, front: false },
  ];
  T.invMass = 1 / T.mass;
  T.invInertia = 3 / (T.mass * (T.halfW * T.halfW + T.halfL * T.halfL));
}

// ---------------------------------------------------------------------------------------------
// Tiny box merger: non-indexed geometry with optional vertex colours and per-vertex roles.
const FACES = [[1, 3, 7, 5], [0, 4, 6, 2], [2, 6, 7, 3], [0, 1, 5, 4], [4, 5, 7, 6], [0, 2, 3, 1]];

class Builder {
  constructor() { this.pos = []; this.col = []; this.role = []; }
  /** Box centred at (cx,cy,cz) with size (sx,sy,sz). o: { tx, tz (top scale), shiftZ (top shift), c:[r,g,b], role } */
  box(cx, cy, cz, sx, sy, sz, o = {}) {
    const tx = o.tx ?? 1, tz = o.tz ?? 1, shz = o.shiftZ ?? 0;
    const c = o.c || [1, 1, 1];
    const role = o.role ?? 0;
    const corners = [];
    for (let i = 0; i < 8; i++) {
      const px = i & 1 ? 0.5 : -0.5, py = i & 2 ? 0.5 : -0.5, pz = i & 4 ? 0.5 : -0.5;
      const top = py > 0;
      corners.push([
        cx + px * sx * (top ? tx : 1),
        cy + py * sy,
        cz + pz * sz * (top ? tz : 1) + (top ? shz : 0),
      ]);
    }
    for (const [a, b, cc, d] of FACES) {
      for (const k of [a, b, cc, a, cc, d]) {
        this.pos.push(corners[k][0], corners[k][1], corners[k][2]);
        this.col.push(c[0], c[1], c[2]);
        this.role.push(role);
      }
    }
    return this;
  }
  addGeometry(geo, c = [1, 1, 1]) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      this.pos.push(p[i], p[i + 1], p[i + 2]);
      this.col.push(c[0], c[1], c[2]);
      this.role.push(0);
    }
    return this;
  }
  build(withColor = true) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    if (withColor) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

// ---------------------------------------------------------------------------------------------
// Shared materials
const matCache = new Map();
/** Cached car paint material per colour. */
export function bodyMaterial(color) {
  const key = typeof color === 'number' ? color : new THREE.Color(color).getHex();
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: key, roughness: 0.42, metalness: 0.35 });
    matCache.set(key, m);
  }
  return m;
}
export const trimMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 });
export const charredMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 0.95, metalness: 0.1 });
export const lightsMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
export const wheelMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.1 });

// Unit wheel: axis along X (width 1, radius 1) with a light "plus" hub so spinning is visible.
export const wheelGeometry = (() => {
  const b = new Builder();
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 12, 1);
  cyl.rotateZ(Math.PI / 2);
  b.addGeometry(cyl, [0.07, 0.07, 0.08]);
  b.box(0, 0, 0, 1.04, 1.25, 0.22, { c: [0.62, 0.64, 0.68] });
  b.box(0, 0, 0, 1.04, 0.22, 1.25, { c: [0.62, 0.64, 0.68] });
  return b.build(true);
})();

// Colours used for the trim mesh
const GLASS = [0.06, 0.08, 0.11];
const DARK = [0.09, 0.09, 0.1];
const PLATE = [0.85, 0.85, 0.8];
const NAVY = [0.05, 0.08, 0.2];
const CHROME = [0.55, 0.57, 0.6];

// Light roles
const R_HEAD = 1, R_TAIL = 2, R_SIGN = 3, R_BAR_R = 4, R_BAR_B = 5;

function sedanLike(T, body, trim, lights, o) {
  const hw = T.halfW, hl = T.halfL;
  const clear = o.clear, bodyH = o.bodyH;
  const top = clear + bodyH;
  body.box(0, clear + bodyH / 2, 0, hw * 2, bodyH, hl * 2);
  // hood bevel / trunk bevel (slightly narrower slabs to break the box look)
  body.box(0, top + 0.03, hl * 0.62, hw * 1.9, 0.06, hl * 0.62, { tx: 0.96 });
  // cabin (glass) + roof
  const cabLen = o.cabF - o.cabR, cabZ = (o.cabF + o.cabR) / 2;
  trim.box(0, top + o.cabH / 2, cabZ, hw * 1.84, o.cabH, cabLen, { tx: 0.8, tz: 0.66, shiftZ: -cabLen * 0.05, c: GLASS });
  body.box(0, top + o.cabH + 0.03, cabZ - cabLen * 0.05, hw * 1.84 * 0.8 + 0.04, 0.07, cabLen * 0.66 + 0.04);
  // bumpers, grille, plate, side skirts
  trim.box(0, clear + 0.1, hl - 0.06, hw * 1.98, 0.2, 0.2, { c: DARK });
  trim.box(0, clear + 0.1, -hl + 0.06, hw * 1.98, 0.2, 0.2, { c: DARK });
  trim.box(0, clear + bodyH * 0.55, hl + 0.005, hw * 0.8, bodyH * 0.35, 0.04, { c: DARK });
  trim.box(0, clear + 0.32, -hl - 0.005, 0.5, 0.14, 0.03, { c: PLATE });
  trim.box(hw + 0.005, clear + 0.06, 0, 0.03, 0.12, hl * 1.1, { c: DARK });
  trim.box(-hw - 0.005, clear + 0.06, 0, 0.03, 0.12, hl * 1.1, { c: DARK });
  // mirrors
  body.box(hw + 0.08, top + 0.12, o.cabF - 0.15, 0.16, 0.1, 0.12);
  body.box(-hw - 0.08, top + 0.12, o.cabF - 0.15, 0.16, 0.1, 0.12);
  // lights
  const ly = clear + bodyH * 0.62;
  lights.box(hw - 0.28, ly, hl + 0.01, 0.4, 0.13, 0.05, { role: R_HEAD });
  lights.box(-hw + 0.28, ly, hl + 0.01, 0.4, 0.13, 0.05, { role: R_HEAD });
  lights.box(hw - 0.24, ly, -hl - 0.01, 0.36, 0.13, 0.05, { role: R_TAIL });
  lights.box(-hw + 0.24, ly, -hl - 0.01, 0.36, 0.13, 0.05, { role: R_TAIL });
  return top + o.cabH + 0.07;
}

function buildParts(T) {
  const body = new Builder(), trim = new Builder(), lights = new Builder();
  const hw = T.halfW, hl = T.halfL;
  switch (T.id) {
    case 'sports': {
      sedanLike(T, body, trim, lights, { clear: 0.18, bodyH: 0.5, cabF: 0.55, cabR: -1.05, cabH: 0.46 });
      // spoiler
      body.box(0.55, 0.85, -hl + 0.2, 0.08, 0.2, 0.12);
      body.box(-0.55, 0.85, -hl + 0.2, 0.08, 0.2, 0.12);
      body.box(0, 0.97, -hl + 0.18, hw * 1.9, 0.05, 0.36);
      // side intakes
      trim.box(hw + 0.005, 0.45, -0.6, 0.03, 0.18, 0.6, { c: DARK });
      trim.box(-hw - 0.005, 0.45, -0.6, 0.03, 0.18, 0.6, { c: DARK });
      break;
    }
    case 'taxi': {
      const roof = sedanLike(T, body, trim, lights, { clear: 0.3, bodyH: 0.56, cabF: 0.85, cabR: -1.2, cabH: 0.52 });
      trim.box(0, roof + 0.01, -0.25, 0.7, 0.04, 0.3, { c: DARK });
      lights.box(0, roof + 0.13, -0.25, 0.62, 0.2, 0.26, { role: R_SIGN, tx: 0.85 });
      // checker stripe
      trim.box(hw + 0.006, 0.62, 0, 0.02, 0.1, hl * 1.4, { c: DARK });
      trim.box(-hw - 0.006, 0.62, 0, 0.02, 0.1, hl * 1.4, { c: DARK });
      break;
    }
    case 'police': {
      const roof = sedanLike(T, body, trim, lights, { clear: 0.3, bodyH: 0.58, cabF: 0.85, cabR: -1.2, cabH: 0.52 });
      // dark door panels
      trim.box(hw + 0.006, 0.6, -0.1, 0.02, 0.42, 2.2, { c: NAVY });
      trim.box(-hw - 0.006, 0.6, -0.1, 0.02, 0.42, 2.2, { c: NAVY });
      trim.box(0, 0.62, hl + 0.02, hw * 1.6, 0.28, 0.05, { c: NAVY }); // push bar
      // light bar
      trim.box(0, roof + 0.03, -0.15, 1.3, 0.06, 0.3, { c: DARK });
      lights.box(0.33, roof + 0.12, -0.15, 0.6, 0.13, 0.26, { role: R_BAR_R });
      lights.box(-0.33, roof + 0.12, -0.15, 0.6, 0.13, 0.26, { role: R_BAR_B });
      break;
    }
    case 'pickup': {
      const clear = 0.42, bodyH = 0.62, top = clear + bodyH;
      body.box(0, clear + bodyH / 2, 0, hw * 2, bodyH, hl * 2);
      const cabF = 0.95, cabR = -0.45, cabH = 0.62, cabLen = cabF - cabR;
      trim.box(0, top + cabH / 2, (cabF + cabR) / 2, hw * 1.86, cabH, cabLen, { tx: 0.86, tz: 0.8, shiftZ: -0.08, c: GLASS });
      body.box(0, top + cabH + 0.03, (cabF + cabR) / 2 - 0.08, hw * 1.86 * 0.86 + 0.04, 0.07, cabLen * 0.8 + 0.04);
      // bed
      body.box(hw - 0.06, top + 0.2, (cabR - hl) / 2, 0.12, 0.4, -cabR + hl - 0.1);
      body.box(-hw + 0.06, top + 0.2, (cabR - hl) / 2, 0.12, 0.4, -cabR + hl - 0.1);
      body.box(0, top + 0.2, -hl + 0.06, hw * 2, 0.4, 0.12);
      trim.box(0, top + 0.01, (cabR - hl) / 2, hw * 1.76, 0.03, -cabR + hl - 0.2, { c: DARK });
      trim.box(0, clear + 0.1, hl - 0.05, hw * 2.02, 0.24, 0.22, { c: CHROME });
      trim.box(0, clear + 0.1, -hl + 0.05, hw * 2.02, 0.22, 0.2, { c: DARK });
      trim.box(0, clear + bodyH * 0.55, hl + 0.005, hw * 1.0, bodyH * 0.4, 0.04, { c: CHROME });
      trim.box(0, clear + 0.32, -hl - 0.005, 0.5, 0.14, 0.03, { c: PLATE });
      const ly = clear + bodyH * 0.62;
      lights.box(hw - 0.25, ly, hl + 0.01, 0.38, 0.16, 0.05, { role: R_HEAD });
      lights.box(-hw + 0.25, ly, hl + 0.01, 0.38, 0.16, 0.05, { role: R_HEAD });
      lights.box(hw - 0.1, top + 0.12, -hl - 0.01, 0.16, 0.3, 0.05, { role: R_TAIL });
      lights.box(-hw + 0.1, top + 0.12, -hl - 0.01, 0.16, 0.3, 0.05, { role: R_TAIL });
      break;
    }
    case 'van':
    case 'bus': {
      const bus = T.id === 'bus';
      const clear = bus ? 0.45 : 0.32, H = T.height - clear;
      body.box(0, clear + H / 2, 0, hw * 2, H, hl * 2);
      // windscreen + side windows
      const wy = clear + H * (bus ? 0.68 : 0.72), wh = H * (bus ? 0.4 : 0.34);
      trim.box(0, wy, hl + 0.01, hw * 1.84, wh, 0.04, { c: GLASS });
      const winLen = bus ? hl * 1.8 : hl * 1.3;
      const winZ = bus ? -0.1 : hl - winLen / 2 - 0.25;
      trim.box(hw + 0.01, wy, winZ, 0.03, wh * 0.85, winLen, { c: GLASS });
      trim.box(-hw - 0.01, wy, winZ, 0.03, wh * 0.85, winLen, { c: GLASS });
      trim.box(0, wy, -hl - 0.01, hw * 1.5, wh * 0.8, 0.03, { c: GLASS });
      trim.box(0, clear + 0.12, hl - 0.04, hw * 2.02, 0.24, 0.12, { c: DARK });
      trim.box(0, clear + 0.12, -hl + 0.04, hw * 2.02, 0.24, 0.12, { c: DARK });
      trim.box(0, clear + 0.4, -hl - 0.01, 0.5, 0.14, 0.03, { c: PLATE });
      if (bus) {
        trim.box(hw + 0.008, clear + 0.35, 0, 0.02, 0.18, hl * 1.9, { c: [0.9, 0.9, 0.9] });
        trim.box(-hw - 0.008, clear + 0.35, 0, 0.02, 0.18, hl * 1.9, { c: [0.9, 0.9, 0.9] });
        lights.box(0, T.height - 0.18, hl + 0.02, hw * 1.4, 0.22, 0.04, { role: R_SIGN });
      } else {
        trim.box(hw + 0.008, clear + 0.55, 0, 0.02, 0.1, hl * 1.9, { c: DARK });
        trim.box(-hw - 0.008, clear + 0.55, 0, 0.02, 0.1, hl * 1.9, { c: DARK });
      }
      const ly = clear + 0.48;
      lights.box(hw - 0.28, ly, hl + 0.015, 0.36, 0.18, 0.05, { role: R_HEAD });
      lights.box(-hw + 0.28, ly, hl + 0.015, 0.36, 0.18, 0.05, { role: R_HEAD });
      lights.box(hw - 0.12, ly + 0.2, -hl - 0.015, 0.18, 0.4, 0.05, { role: R_TAIL });
      lights.box(-hw + 0.12, ly + 0.2, -hl - 0.015, 0.18, 0.4, 0.05, { role: R_TAIL });
      break;
    }
    default: // sedan
      sedanLike(T, body, trim, lights, { clear: 0.3, bodyH: 0.56, cabF: 0.8, cabR: -1.25, cabH: 0.52 });
  }
  return { body, trim, lights };
}

// Per-type geometry cache: { body, trim, lightsPos, lightsRoles, lightVariants: Map }
const typeGeo = new Map();
function geoFor(T) {
  let g = typeGeo.get(T.id);
  if (g) return g;
  const parts = buildParts(T);
  const lightsBase = parts.lights.build(false);
  g = {
    body: parts.body.build(false),
    trim: parts.trim.build(true),
    lightsBase,
    roles: parts.lights.role,
    variants: new Map(),
  };
  typeGeo.set(T.id, g);
  return g;
}

/** Lights geometry variant: night (bool), brake (bool), bar (0 off, 1 red phase, 2 blue phase), dead (bool). */
export function lightsGeometry(T, night, brake, bar, dead = false) {
  const g = geoFor(T);
  const key = dead ? 99 : (night ? 1 : 0) + (brake ? 2 : 0) + bar * 4;
  let geo = g.variants.get(key);
  if (geo) return geo;
  geo = new THREE.BufferGeometry();
  geo.setAttribute('position', g.lightsBase.attributes.position);
  geo.setAttribute('normal', g.lightsBase.attributes.normal);
  const n = g.roles.length, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    let r = 0.1, gg = 0.1, b = 0.1;
    const role = g.roles[i];
    if (dead) { r = gg = b = 0.05; } else if (role === R_HEAD) {
      if (night) { r = 3.2; gg = 3.1; b = 2.6; } else { r = 0.95; gg = 0.95; b = 0.88; }
    } else if (role === R_TAIL) {
      if (brake) { r = 4; gg = 0.15; b = 0.1; } else if (night) { r = 1.4; gg = 0.06; b = 0.05; } else { r = 0.5; gg = 0.04; b = 0.04; }
    } else if (role === R_SIGN) {
      if (night) { r = 2.4; gg = 1.8; b = 0.5; } else { r = 1; gg = 0.8; b = 0.25; }
    } else if (role === R_BAR_R) {
      if (bar === 1) { r = 5; gg = 0.25; b = 0.2; } else { r = 0.35; gg = 0.03; b = 0.03; }
    } else if (role === R_BAR_B) {
      if (bar === 2) { r = 0.3; gg = 0.6; b = 5.5; } else { r = 0.03; gg = 0.05; b = 0.4; }
    }
    col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.boundingSphere = g.lightsBase.boundingSphere;
  g.variants.set(key, geo);
  return geo;
}

/** Build a vehicle model. Returns { group, body, bodyMesh, trimMesh, lightsMesh }.
 *  group = root (position + heading), body = child group used for roll/pitch. Wheels are drawn by a
 *  shared InstancedMesh owned by vehicles.js. */
export function buildVehicleModel(T, color) {
  const g = geoFor(T);
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const bodyMesh = new THREE.Mesh(g.body, bodyMaterial(color));
  const trimMesh = new THREE.Mesh(g.trim, trimMaterial);
  const lightsMesh = new THREE.Mesh(lightsGeometry(T, false, false, 0), lightsMaterial);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = false;
  body.add(bodyMesh, trimMesh, lightsMesh);
  group.name = 'vehicle:' + T.id;
  return { group, body, bodyMesh, trimMesh, lightsMesh };
}
