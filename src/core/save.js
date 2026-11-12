// Neon Coast - localStorage save/load. Everything wrapped in try/catch (private mode, quota, corrupt data).
const KEY = 'neoncoast.save';
const VERSION = 1;

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && typeof d === 'object' && d.version >= 1 ? d : null;
  } catch { return null; }
}

export function hasSave() { return !!read(); }

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function saveGame(game) {
  try {
    const m = game.missions;
    const p = game.player;
    const inMission = !!(m && m.active);
    let pos = null;
    const sp = game.world?.getLandmark?.('safehouse') || game.world?.spawnPoint;
    if (!inMission && p && p.position && p.alive !== false) {
      pos = { x: p.position.x, z: p.position.z, heading: p.heading || 0 };
    } else if (game.world?.spawnPoint) {
      const s = game.world.spawnPoint;
      pos = { x: s.x, z: s.z, heading: s.heading || 0 };
    } else if (sp) {
      pos = { x: sp.x, z: sp.z, heading: 0 };
    }
    const data = {
      version: VERSION,
      savedAt: Date.now(),
      money: game.state?.money ?? 0,
      completed: m?.completed ? Array.from(m.completed) : [],
      weapons: game.weapons?.serialize?.() ?? null,
      pos,
      timeOfDay: game.state?.timeOfDay ?? 9,
      stats: m?.stats ? { ...m.stats } : {},
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch { return false; }
}

/** Applies a stored save to the live game. Returns true on success. Sets game._loadedPos for re-teleport on start. */
export function loadGame(game) {
  try {
    const d = read();
    if (!d) return false;
    if (game.state) {
      const money = Number.isFinite(d.money) ? d.money : 250;
      game.addMoney(money - game.state.money);
      if (Number.isFinite(d.timeOfDay)) game.state.timeOfDay = d.timeOfDay;
    }
    const m = game.missions;
    if (m?.completed) {
      m.completed.clear();
      if (Array.isArray(d.completed)) for (const id of d.completed) m.completed.add(id);
    }
    if (m?.stats && d.stats && typeof d.stats === 'object') Object.assign(m.stats, d.stats);
    try { if (d.weapons) game.weapons?.deserialize?.(d.weapons); } catch { /* ignore */ }
    if (d.pos && Number.isFinite(d.pos.x) && Number.isFinite(d.pos.z)) {
      game._loadedPos = { x: d.pos.x, z: d.pos.z, heading: d.pos.heading || 0 };
      game.player?.teleport?.(d.pos.x, d.pos.z, d.pos.heading || 0);
    }
    return true;
  } catch { return false; }
}
