// Neon Coast audio - on-foot layers: footsteps (rate from real movement), jump/land, heartbeat,
// reload / empty-click / melee detection (polled from weapons + input), low-health layer.
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);

export function createCharacter(game) {
  const st = {
    x: null, z: null, speed: 0, phase: 0, side: 1,
    air: false, airT: 0, lastY: 0,
    reloading: false, firePrev: false, emptyT: 0, meleeT: 0,
    heartT: 0, wasAlive: true,
  };

  return {
    update(F) {
      const { dt, player: pl, pos, playing, play, input } = F;
      if (!pl || !pos || !playing) { st.x = null; return; }
      const alive = pl.alive !== false;
      const onFoot = !F.inVeh && alive;

      // ---- footsteps from actual displacement
      if (st.x != null && onFoot && dt > 0) {
        const sp = Math.min(12, Math.hypot(pos.x - st.x, pos.z - st.z) / dt);
        st.speed += (sp - st.speed) * (1 - Math.exp(-8 * dt));
        const grounded = pos.y < 0.2;
        if (st.speed > 1.0 && grounded) {
          const stride = 0.62 + 0.14 * st.speed;          // longer strides when running
          st.phase += (st.speed * dt) / stride;
          if (st.phase >= 1) {
            st.phase -= 1; st.side = -st.side;
            const run = clamp((st.speed - 2) / 5, 0, 1);
            play('footstep', { volume: 0.32 + 0.4 * run + rnd(0, 0.1), pitch: rnd(0.88, 1.15) * (1 - 0.1 * run), pan: st.side * 0.18 });
          }
        } else st.phase = Math.min(st.phase, 0.5);
      } else { st.speed *= 0.9; st.phase = 0; }

      // ---- jump / land from vertical position
      if (onFoot) {
        const y = pos.y;
        const air = y > 0.25;
        if (air && !st.air) { st.air = true; st.airT = 0; play('jump', { volume: 0.7, pan: rnd(-0.1, 0.1) }); }
        else if (air) st.airT += dt;
        else if (st.air) { st.air = false; play('land', { volume: 0.8, k: clamp(st.airT / 0.8, 0.2, 1), pitch: rnd(0.9, 1.1) }); }
      } else st.air = false;
      st.x = pos.x; st.z = pos.z;

      // ---- weapon state (polled)
      const wp = game.weapons;
      const cur = wp?.current;
      const def = cur && wp?.defs ? wp.defs[cur.id] : null;
      if (wp) {
        const r = !!wp.reloading;
        if (r && !st.reloading && onFoot) play('reload', { volume: 0.9 });
        st.reloading = r;
      }
      const fire = !!input.fire;
      st.emptyT -= dt; st.meleeT -= dt;
      if (onFoot && cur && def && fire) {
        if (def.melee) {
          if (st.meleeT <= 0) {
            st.meleeT = 1 / (def.rate || 2);
            play('whoosh', { volume: 0.8, pitch: cur.id === 'bat' ? 0.8 : 1 });
            // hit if a ped / car is within reach
            const ped = game.peds?.nearest?.(pos.x, pos.z, (def.range || 1.7) + 0.8);
            const near = ped && ped.position ? Math.hypot(ped.position.x - pos.x, ped.position.z - pos.z) < (def.range || 1.7) + 0.9 : false;
            if (near) { F.after(0.09, () => play(cur.id === 'bat' ? 'batHit' : 'punch', { volume: 0.9, pitch: rnd(0.9, 1.1) })); }
          }
        } else if (!st.firePrev && cur.clip <= 0 && cur.ammo <= 0 && !wp.reloading && st.emptyT <= 0) {
          st.emptyT = 0.25;
          play('empty', { volume: 0.8 });
        }
      }
      st.firePrev = fire;

      // ---- low health heartbeat
      const hp = pl.health ?? 100;
      if (alive && hp < 30) {
        st.heartT -= dt;
        if (st.heartT <= 0) {
          const k = clamp(1 - hp / 30, 0, 1);
          st.heartT = 1.05 - 0.5 * k;
          play('heartbeat', { volume: 0.55 + 0.45 * k });
        }
      } else st.heartT = 0;
      st.wasAlive = alive;
    },
    get info() { return { speed: st.speed }; },
  };
}
