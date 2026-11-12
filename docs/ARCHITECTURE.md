# Neon Coast — Architecture & Module Contract

Original open-world action sandbox (third person, on foot + driving, traffic, pedestrians,
police/wanted system, weapons, missions) set in the fictional sunny coastal city **Palmera**.
Everything is original: no names, characters, logos, map layouts or art from any existing game.

- Tech: **Three.js** (ES modules) + **Vite**. No physics engine, no external assets — all geometry,
  textures (canvas) and sounds (WebAudio) are procedural.
- Targets: browser, Android (Capacitor WebView, landscape), Windows (Electron).
- **Mobile performance is a hard requirement**: use `InstancedMesh`/merged geometry, share materials
  and geometries, never allocate per frame in hot paths (reuse temp vectors), pool objects, cull by
  distance from the player. Budget: < 300 draw calls, 60 fps on a mid-range phone at `low` quality.
- All player-facing text is **Turkish**.

## Conventions

- Units are metres, Y is up, ground is y = 0. The city lies on the XZ plane.
- **Heading** `h` (radians, = `mesh.rotation.y`): forward = `(sin h, 0, cos h)`. Heading 0 faces +Z.
  Models are built facing +Z.
- `src/core/utils.js` has `clamp, lerp, rand, randInt, pick, dist, dist2, wrapAngle, angleDiff,
  turnToward, headingTo, damp, seeded`. Use them.
- `import * as THREE from 'three'`.
- Each module exports one factory `createX(game)` that returns the system object. The factory may
  use `game.scene`, `game.camera`, `game.events`, `game.input`, `game.settings`, `game.q`,
  `game.world` (world is created first), but must **not** touch other systems until `init()` /
  `update(dt)` / event handlers run. Optional `init()` is called once after all systems exist.
- `update(dt)` — `dt` in seconds, clamped to ≤ 0.05. Simulation systems only update while
  `game.state.mode === 'playing'`; `hud`, `menu`, `touch`, `audio` update always.
- Update order: `player, vehicles, peds, police, weapons, pickups, missions, world`, then
  `hud, menu, touch, audio`, then render.
- Be defensive at system boundaries (`game.hud?.notify?.(...)`), another module may have failed to load.
- Only edit the files you own. Do not edit `src/main.js`, `src/core/*`, `package.json`, `index.html`.
  Do not run `npm install`, `git commit` or start long-running servers. You may run
  `npx vite build` to check that the project compiles (other modules may still be missing — only
  care about errors in your own files) and `node --check <file>`.

## `game` object (src/main.js)

```js
game.THREE, game.renderer, game.scene, game.camera, game.canvas
game.isMobile                    // boolean
game.events                      // EventBus: on(name, fn) -> unsubscribe, off, emit(name, data)
game.input                       // see Input below
game.settings                    // { quality:'low'|'medium'|'high', sensitivity, volume (0..1), music }
game.q                           // { pixelRatio, shadows, drawDistance (m), density (0..1) } for current quality
game.state                       // { mode:'menu'|'playing'|'paused', time, timeOfDay (0..24), money }
game.addMoney(n)                 // +/-; emits 'money:changed'
game.start() / pause() / resume() / applySettings()
game.world, vehicles, peds, police, weapons, pickups, player, missions, hud, menu, touch, audio
```

## Input (`game.input`, src/core/input.js — already written)

Gameplay reads only this; never add DOM key/mouse listeners in gameplay modules.

- `moveX, moveY` (−1..1). On foot: strafe right+/forward+. In a vehicle: steer right+ / throttle (+ gas, − brake/reverse).
- `lookDX, lookDY` — look delta this frame (pixels; multiply by ~0.0025 rad).
- held: `sprint, jump, fire, aim, handbrake`.
- `pressed(action)` one-shot: `interact` (enter/exit vehicle, F), `nextWeapon`, `prevWeapon`, `reload`,
  `pause`, `horn`, `camera`, `map`, `radio`, `weapon1`..`weapon9`.
- `usingTouch` — true once a touch happened (enable aim assist etc.).
- For `ui/touch.js`: `setTouchMove(x, y)`, `addLook(dx, dy)`, `setButton(name, down)` with
  `sprint|jump|fire|aim|handbrake|gas|brake`, `trigger(action)`.

## Entity shape (player, peds, vehicles)

```js
{ kind: 'player'|'ped'|'vehicle', mesh, position /* === mesh.position */, heading, radius,
  health, alive, takeDamage(amount, source /* {kind:'bullet'|'vehicle'|'explosion'|'melee'|'fall', attacker?: entity} */) }
```

## World — `src/world/*` (`createWorld` in `src/world/city.js`)

Procedural city ~1200 × 1200 m (`world.half = 600`): grid-ish road network with a few avenues,
downtown high-rises, residential/low-rise, a beach strip + ocean on one side, parks, palm trees,
street lights, props. Owns sky, fog, sun/ambient lights and the day/night cycle
(advances `game.state.timeOfDay`; one full day ≈ 20 real minutes; windows/lamps glow at night).

```js
world.half                                   // 600
world.spawnPoint                             // { x, z, heading } player start (on a sidewalk near the safehouse)
world.colliders                              // static AABBs [{ minX, maxX, minZ, maxZ, height }] (buildings, big props)
world.collideCircle(x, z, r, out?)           // -> out {x, z, hit, nx, nz}: position pushed out of static colliders
                                             //    and clamped to world bounds/shoreline. Must be FAST (spatial grid).
world.raycast(ox, oy, oz, dx, dy, dz, max)   // dir normalised -> { dist, x, y, z, nx, ny, nz } | null. Tests colliders + ground (y=0).
world.isWater(x, z)                          // boolean
world.isRoad(x, z)                           // boolean (asphalt)
world.roads = {
  nodes,                                     // [{ id, x, z, links: [nodeId, ...] }] intersections; every link is a straight, axis-aligned two-way road
  roadWidth,                                 // full asphalt width (m), e.g. 14
  laneOffset,                                // distance from centre line to the driving lane centre (drive on the RIGHT), e.g. 3.5
  sidewalkOffset,                            // distance from centre line to the sidewalk centre, e.g. 9
  nearestNode(x, z),                         // -> node
  randomNode(),                              // -> node
}
world.landmarks                              // [{ id, name /* Turkish */, type, x, z }] types: 'safehouse','hospital','police','gunshop','garage','pier','stadium', ...
world.getLandmark(id)
world.randomSidewalkPoint(nearX, nearZ, minDist, maxDist)   // -> { x, z } | null
world.randomRoadPoint(nearX, nearZ, minDist, maxDist)       // -> { x, z, heading, node, next } on a driving lane, heading along the lane
world.minimap = { canvas, pxPerMeter }       // pre-rendered top-down map of the whole city (≈1024²): world (x,z) -> pixel ((x+half)*ppm, (z+half)*ppm)
world.update(dt)
```

## Vehicles — `src/entities/vehicles.js` (`createVehicles`)

Arcade car physics (accel, braking, speed-dependent steering, grip/drift with handbrake, body roll/pitch
visual), collisions vs world / other vehicles / peds / player on foot, damage, smoke, fire and explosion,
ambient traffic that follows `world.roads` (spawn/despawn around the player, stops for cars ahead),
parked cars, chase AI used by police.

```js
vehicles.list                                // all live vehicles
vehicles.types                               // { sedan, sports, pickup, van, taxi, police, bike?... } stats
vehicles.spawn(type, x, z, heading, opts?)   // opts: { ai:'traffic'|'chase'|'parked'|'none', color } -> vehicle
vehicles.remove(vehicle)
vehicles.nearest(x, z, maxDist, filter?)     // -> vehicle | null
vehicles.collideCircle(x, z, r, out?, ignore?) // push a circle (a pedestrian) out of vehicle bodies -> out {x, z, hit}
vehicles.raycast(ox, oy, oz, dx, dy, dz, max)  // -> { dist, vehicle, x, y, z } | null (for bullets)
vehicles.update(dt)

vehicle = { kind:'vehicle', type, mesh, position, heading, radius, halfW, halfL, height,
  speed /* signed m/s along heading */, vx, vz, health /* 0..100 */, alive, destroyed,
  driver /* null | 'player' | 'ai' | 'cop' */, ai /* { mode, target } */, isPolice, siren,
  seatOffset, doorOffset /* local-space offsets */, getExitPoint() /* -> {x, z} free spot next to the driver door */,
  takeDamage(amount, source) }
```

- When `vehicle.driver === 'player'` the vehicles module reads `game.input` and drives it.
- AI/cop drivers that get hijacked: the module ejects the old driver (spawn a fleeing ped via `game.peds.spawn`).
- Emits `vehicle:crash {vehicle, impact}`, `vehicle:destroyed {vehicle}`, `explosion {x, y, z, radius, attacker}`,
  `crime {type:'hitPed'|'killPed'|'hitCop'|'killCop'|'hitVehicle'|'hitPoliceCar', x, z}` when the player's car does it.
- `ai.mode = 'chase'` with `ai.target = entity` → drive toward / ram target (cheap steering toward target with
  obstacle avoidance using `world.collideCircle` probes; unstick by reversing).

## Player — `src/entities/player.js` (`createPlayer`)

Third-person character controller + camera (on foot and in vehicle) + enter/exit vehicles + death/respawn.

```js
player = { kind:'player', mesh, position, heading, radius: 0.45, health /* 0..100 */, armor /* 0..100 */, alive,
  vehicle /* null | vehicle */, inVehicle, velocity,
  aimYaw, aimPitch,                 // camera orientation (radians)
  getAimRay(out?)                   // -> { ox, oy, oz, dx, dy, dz } from the camera through the crosshair
  getMuzzle(out?)                   // -> { x, y, z } approx weapon muzzle (chest/hand height)
  enterVehicle(v), exitVehicle(), teleport(x, z, heading?), heal(n), addArmor(n),
  takeDamage(amount, source), update(dt) }
```

- Blocky articulated humanoid (shared builder `src/entities/humanoid.js`, owned by the player agent, also used
  by peds): `createHumanoid({ shirt, pants, skin, hair, hat? }) -> { group, parts, animate(state, t, dt, speed) }`
  with states `idle|walk|run|aim|punch|dead|sit|flee|jump`.
- Camera collision via `world.raycast` so it never clips into buildings. Shoulder zoom when `input.aim`.
- `interact`: if in vehicle → exit (only when slow), else enter `vehicles.nearest(...)` within ~4 m. Stealing an
  occupied car emits `crime {type:'carjack'}`.
- Death: emits `player:died`, shows "MAHVOLDUN" via `hud.showBigText`, after ~4 s respawns at the hospital landmark,
  loses 10% money, clears wanted level (`police.clear()`). When busted (`player:busted` event from police) →
  "TUTUKLANDIN", respawn at police landmark, loses weapons ammo (`weapons.reset()`).
- Emits `player:enteredVehicle {vehicle}`, `player:exitedVehicle {vehicle}`, `player:died`, `player:respawned`, `player:damaged {amount}`.

## Peds — `src/entities/peds.js` (`createPeds`) and Police — `src/entities/police.js` (`createPolice`)

```js
peds.list
peds.spawn(x, z, opts?)        // opts: { type:'civilian'|'cop'|'gang', hostile, weapon, flee } -> ped
peds.remove(ped)
peds.raycast(ox, oy, oz, dx, dy, dz, max, ignore?)  // -> { dist, ped, x, y, z, headshot } | null (for bullets)
peds.nearest(x, z, maxDist, filter?)
ped = { kind:'ped', type, mesh, position, heading, radius: 0.4, health, alive, state /* 'walk'|'idle'|'flee'|'attack'|'dead' */,
  isCop, hostile, weapon, target, takeDamage(amount, source) }
```

- Ambient civilians walk along sidewalks (`world.roads` + `sidewalkOffset`), avoid walls, flee from
  `gunshot`/`explosion` events and from speeding cars, varied colours; count scales with `game.q.density`
  (≈ 12 low … 30 high), spawn/despawn ring around the player. Dead bodies fade after a while and may drop
  money (`pickups.spawn('money', x, z, { amount })`).
- Hostile peds (cops, gang, mission targets) shoot at their target using `weapons.fireFrom(...)`, keeping distance.
- Emits `ped:died {ped, source}` and `crime {...}` when the attacker is the player.

```js
police.wantedLevel               // 0..5
police.addCrime(type, x, z)      // also driven by 'crime' events
police.setWanted(level), police.clear()
police.cops, police.cars         // active units (for minimap blips)
```

- Crime types & heat: `gunshot` small, `hitPed`, `carjack`, `hitVehicle` small, `killPed`, `hitCop`,
  `killCop`, `hitPoliceCar`, `explosion`. Stars 1..5 from accumulated heat.
- Spawns police cars (`vehicles.spawn('police', ..., { ai:'chase' })`, `ai.target = player`) out of sight on
  roads and foot cops; more/more aggressive units per star. When the car is near and the player is on foot
  cops get out and shoot (stars ≥ 2) or try to arrest (star 1: standing next to a slow/on-foot player for 2 s → emit `player:busted`).
- Wanted level decays when no cop has line of sight (`world.raycast`) for a while (stars flash while escaping).
- Emits `wanted:changed {level, prev}`.

## Weapons — `src/entities/weapons.js` (`createWeapons`) and Pickups — `src/entities/pickups.js` (`createPickups`)

```js
weapons.defs                     // { fist, bat?, pistol, smg, shotgun, rifle, rpg? }: { name /* TR */, damage, rate, range, spread, clip, auto, pellets }
weapons.inventory                // [{ id, ammo, clip }] player's weapons
weapons.current                  // inventory entry
weapons.give(id, ammo), weapons.select(id), weapons.reset()
weapons.fireFrom(shooter, ox, oy, oz, dx, dy, dz, weaponId)   // hitscan for anyone (player, cops, gangs): damage, tracer, impact fx, emits 'gunshot'
weapons.update(dt)               // handles player fire/reload/switch input, drive-by from vehicles, melee, fx pools
```

- Hitscan picks the nearest of `world.raycast`, `peds.raycast`, `vehicles.raycast` and the player (sphere/capsule test
  when the shooter is not the player). Touch aim assist: snap toward the nearest hostile/ped in a small cone.
- Simple held weapon mesh attached to the player's hand, muzzle flash, tracers, sparks/blood puffs (pooled).
- Emits `gunshot {x, y, z, shooter, weapon}`, `weapon:changed {weapon}`, `weapon:fired`, `crime {type:'gunshot'}` for the player.

```js
pickups.spawn(type, x, z, opts?) // types: 'money' {amount}, 'health', 'armor', 'weapon' {weapon, ammo}; rotating glowing items
pickups.list
```
- Static pickups placed around the map (deterministic), respawn after a few minutes; gun shop landmark sells
  ammo by walking into markers. Emits `pickup {type, ...}`.

## Missions — `src/missions/*` (`createMissions`) + `src/core/save.js`

```js
missions.list                    // defs [{ id, title, giver, description, reward }]
missions.active                  // null | { def, objective /* TR text */, timer? }
missions.completed               // Set of ids
missions.blips                   // [{ x, z, color, type:'mission'|'objective'|'target', label }] for the minimap (updated live)
missions.start(id), missions.fail(reason), missions.update(dt)
```

- Mission start markers (glowing cylinders) in the world; at least 8 varied missions (delivery with timer, steal a
  specific car and bring it to the garage, checkpoint street race, taxi fares, take out a gang, escape a 3-star
  wanted level, ambulance run, rampage/destroy vehicles…) with Turkish briefing texts and an ongoing story thread.
  Plus free-roam side activities.
- Emits `mission:started {def}`, `mission:objective {text}`, `mission:completed {def, reward}`, `mission:failed {def, reason}`.
- `src/core/save.js`: `save(game)` / `load(game)` to `localStorage` (money, completed missions, weapons, position); autosave on mission complete.

## UI — `src/ui/*` (`createHud`, `createMenu`, `createTouch`), DOM overlay inside `#ui-root`

`#ui-root` has `pointer-events: none`; interactive children set `pointer-events: auto`.

```js
hud.notify(text, ms?)            // toast (top-left stack)
hud.showBigText(text, sub?, ms?, color?)   // centre screen e.g. "MAHVOLDUN", "GÖREV TAMAMLANDI"
hud.setPrompt(text | null)       // context prompt e.g. "F — Araca bin"
hud.setObjective(text | null)    // also updated automatically from mission events
```

- HUD (reads state every frame / on events): health + armor bars, money (animated counter), wanted stars,
  weapon name + ammo, clock (timeOfDay), speedometer in vehicles, vehicle health, mission objective + timer, crosshair
  on foot, damage vignette, rotating circular minimap (`world.minimap.canvas`) with blips: player arrow,
  `missions.blips`, `police.cars/cops`, landmarks, north marker; `map` action toggles a full-screen map.
- Menu: stylish title screen ("NEON COAST"), Başla / Devam, pause menu, controls help, settings (quality,
  sensitivity, volume) → mutate `game.settings` then `game.applySettings()`. Calls `game.start()`, `game.resume()`.
  Shown when `state.mode` is `menu`/`paused`.
- Touch (only when `game.isMobile || input.usingTouch`): left floating joystick, right-side look drag area, buttons:
  fire, aim, jump, sprint, interact, weapon switch, pause; in vehicle: gas, brake, handbrake, horn, exit, camera.
  Layout swaps on `player:enteredVehicle/exitedVehicle`. Multi-touch safe (track by `pointerId`), safe-area aware.

## Audio — `src/audio/audio.js` (`createAudio`)

WebAudio only, fully procedural; `AudioContext` created/resumed on first user gesture.

```js
audio.play(name, opts?)          // opts { x, z, volume, pitch }; distance attenuation relative to the player
audio.update(dt)
```
- Listens to events: `gunshot`, `explosion`, `vehicle:crash`, `pickup`, `mission:*`, `wanted:changed`, `player:died`,
  `money:changed`, `ui:click`. Engine loop following the player's vehicle speed, tyre screech, police sirens,
  footsteps, ambient city/ocean bed, and a simple generative synthwave "radio" in vehicles (toggle with `radio`
  action, respects `settings.music`). Master volume = `settings.volume`.

## Event catalogue

`game:started`, `game:paused`, `game:resumed`, `settings:changed`, `money:changed {money, delta}`,
`player:died`, `player:respawned`, `player:damaged {amount}`, `player:busted`, `player:enteredVehicle {vehicle}`,
`player:exitedVehicle {vehicle}`, `vehicle:crash {vehicle, impact}`, `vehicle:destroyed {vehicle}`,
`explosion {x, y, z, radius, attacker}`, `ped:died {ped, source}`, `crime {type, x, z}`, `wanted:changed {level, prev}`,
`gunshot {x, y, z, shooter, weapon}`, `weapon:changed {weapon}`, `weapon:fired`, `pickup {type}`,
`mission:started`, `mission:objective {text}`, `mission:completed`, `mission:failed`, `ui:click`.
