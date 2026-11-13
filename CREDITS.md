# Credits

Third-party 3D models shipped in `public/assets/models/`. All are CC0 (public domain); the licence texts are in `public/assets/licenses/`. Originals were converted with `tools/assets/*.cjs` (textures baked to vertex colours, some re-coloured / re-proportioned to fit the game); only the converted GLBs ship.

| File | Title (source model) | Author | Source URL | Licence | Bytes |
|---|---|---|---|---|---|
| models/vehicles/sedan.glb | Car Kit 3.1: sedan.glb (warped, vertex-coloured) | Kenney | https://opengameart.org/content/car-kit | CC0 1.0 (licenses/Kenney-Car-Kit-3.1-CC0.txt) | 84624 |
| models/vehicles/sports.glb | Car Kit 3.1: sedan-sports.glb | Kenney | https://opengameart.org/content/car-kit | CC0 1.0 (licenses/Kenney-Car-Kit-3.1-CC0.txt) | 90956 |
| models/vehicles/pickup.glb | Car Kit 3.1: truck.glb | Kenney | https://opengameart.org/content/car-kit | CC0 1.0 (licenses/Kenney-Car-Kit-3.1-CC0.txt) | 90240 |
| models/vehicles/van.glb | Car Kit 3.1: van.glb | Kenney | https://opengameart.org/content/car-kit | CC0 1.0 (licenses/Kenney-Car-Kit-3.1-CC0.txt) | 90248 |
| models/vehicles/taxi.glb | Car Kit 3.1: taxi.glb | Kenney | https://opengameart.org/content/car-kit | CC0 1.0 (licenses/Kenney-Car-Kit-3.1-CC0.txt) | 89972 |
| models/vehicles/police.glb | Car Kit 3.1: police.glb | Kenney | https://opengameart.org/content/car-kit | CC0 1.0 (licenses/Kenney-Car-Kit-3.1-CC0.txt) | 117180 |
| models/vehicles/wheel.glb | Car Kit 3.1: wheel-default.glb | Kenney | https://opengameart.org/content/car-kit | CC0 1.0 (licenses/Kenney-Car-Kit-3.1-CC0.txt) | 38892 |
| models/vehicles/bus.glb | Public Transport: Bus.obj (re-coloured, warped) | Quaternius | https://opengameart.org/content/lowpoly-public-transport | CC0 1.0 (licenses/Quaternius-LowPoly-Public-Transport-CC0.txt) | 98472 |
| models/props/tree_plane.glb | Nature Kit 2.1: tree_detailed (re-coloured) | Kenney | https://opengameart.org/content/nature-kit | CC0 1.0 (licenses/Kenney-Nature-Kit-2.1-CC0.txt) | 85348 |
| models/props/tree_oak.glb | Nature Kit 2.1: tree_oak (re-coloured, unused spare) | Kenney | https://opengameart.org/content/nature-kit | CC0 1.0 (licenses/Kenney-Nature-Kit-2.1-CC0.txt) | 25584 |
| models/props/tree_cypress.glb | Nature Kit 2.1: tree_pineTallA_detailed (re-coloured) | Kenney | https://opengameart.org/content/nature-kit | CC0 1.0 (licenses/Kenney-Nature-Kit-2.1-CC0.txt) | 17996 |
| models/props/tree_palm.glb | Nature Kit 2.1: tree_palm (re-coloured) | Kenney | https://opengameart.org/content/nature-kit | CC0 1.0 (licenses/Kenney-Nature-Kit-2.1-CC0.txt) | 23492 |
| models/props/lamp.glb | City Kit Roads 2.2: light-curved | Kenney | https://opengameart.org/content/city-kit-roads | CC0 1.0 (licenses/Kenney-City-Kit-Roads-2.2-CC0.txt) | 7228 |
| models/props/lamp_square.glb | City Kit Roads 2.2: light-square (spare) | Kenney | https://opengameart.org/content/city-kit-roads | CC0 1.0 (licenses/Kenney-City-Kit-Roads-2.2-CC0.txt) | 5244 |
| models/props/dumpster.glb | City Kit Roads 2.2: dumpster | Kenney | https://opengameart.org/content/city-kit-roads | CC0 1.0 (licenses/Kenney-City-Kit-Roads-2.2-CC0.txt) | 16560 |
| models/props/cone.glb | City Kit Roads 2.2: construction-cone | Kenney | https://opengameart.org/content/city-kit-roads | CC0 1.0 (licenses/Kenney-City-Kit-Roads-2.2-CC0.txt) | 5196 |
| models/props/barrier.glb | City Kit Roads 2.2: construction-barrier | Kenney | https://opengameart.org/content/city-kit-roads | CC0 1.0 (licenses/Kenney-City-Kit-Roads-2.2-CC0.txt) | 5148 |
| models/props/bench.glb | Retro Urban Kit: detail-bench | Kenney | https://opengameart.org/content/retro-urban-kit | CC0 1.0 (licenses/Kenney-Retro-Urban-Kit-CC0.txt) | 13068 |
| models/props/container_a.glb | City Kit Industrial 2.0: shipping-container-a | Kenney | https://opengameart.org/content/city-kit-industrial | CC0 1.0 (licenses/Kenney-City-Kit-Industrial-2.0-CC0.txt) | 27656 |
| models/props/container_b.glb | City Kit Industrial 2.0: shipping-container-b | Kenney | https://opengameart.org/content/city-kit-industrial | CC0 1.0 (licenses/Kenney-City-Kit-Industrial-2.0-CC0.txt) | 51856 |
| models/props/container_c.glb | City Kit Industrial 2.0: shipping-container-c | Kenney | https://opengameart.org/content/city-kit-industrial | CC0 1.0 (licenses/Kenney-City-Kit-Industrial-2.0-CC0.txt) | 27656 |
| models/props/boat_small.glb | Watercraft Kit: boat-fishing-small | Kenney | https://opengameart.org/content/watercraft-kit | CC0 1.0 (licenses/Kenney-Watercraft-Kit-CC0.txt) | 17268 |
| models/props/ferry.glb | Watercraft Kit: boat-tug-a (squashed) | Kenney | https://opengameart.org/content/watercraft-kit | CC0 1.0 (licenses/Kenney-Watercraft-Kit-CC0.txt) | 31192 |

## Textures & HDRIs

Photographic PBR textures and HDRI skies, all CC0 1.0 (public domain). Colours were re-balanced (brightness / saturation / contrast), some maps converted to grey, normal maps softened and roughness maps downsized to 512 px with `PIL` before shipping; low quality loads the `color_512.jpg` variants only. Loaded at runtime by `src/core/textureAssets.js` (textures) and `src/core/gfx/hdriSky.js` (HDRIs); the procedural canvas textures remain the fallback.

| File | Title | Source URL | Licence | Bytes |
|---|---|---|---|---|
| textures/asphalt/color.jpg | Asphalt 031 (ambientCG, Lennart Demes) - road asphalt | https://ambientcg.com/a/Asphalt031 | CC0 1.0 (ambientCG) | 204410 |
| textures/asphalt/color_512.jpg | Asphalt 031 (ambientCG, Lennart Demes) - road asphalt | https://ambientcg.com/a/Asphalt031 | CC0 1.0 (ambientCG) | 47489 |
| textures/asphalt/normal.jpg | Asphalt 031 (ambientCG, Lennart Demes) - road asphalt | https://ambientcg.com/a/Asphalt031 | CC0 1.0 (ambientCG) | 222035 |
| textures/asphalt/rough.jpg | Asphalt 031 (ambientCG, Lennart Demes) - road asphalt | https://ambientcg.com/a/Asphalt031 | CC0 1.0 (ambientCG) | 77975 |
| textures/slab/color.jpg | Precast Stone Paving (Dimitrios Savva) - sidewalks / ground | https://polyhaven.com/a/precast_stone_paving | CC0 1.0 (Poly Haven) | 192620 |
| textures/slab/color_512.jpg | Precast Stone Paving (Dimitrios Savva) - sidewalks / ground | https://polyhaven.com/a/precast_stone_paving | CC0 1.0 (Poly Haven) | 49819 |
| textures/slab/normal.jpg | Precast Stone Paving (Dimitrios Savva) - sidewalks / ground | https://polyhaven.com/a/precast_stone_paving | CC0 1.0 (Poly Haven) | 84404 |
| textures/slab/rough.jpg | Precast Stone Paving (Dimitrios Savva) - sidewalks / ground | https://polyhaven.com/a/precast_stone_paving | CC0 1.0 (Poly Haven) | 23438 |
| textures/cobble/color.jpg | Patterned Cobblestone (Rob Tuytel) - plazas, pedestrian avenues, piers | https://polyhaven.com/a/patterned_cobblestone | CC0 1.0 (Poly Haven) | 267714 |
| textures/cobble/color_512.jpg | Patterned Cobblestone (Rob Tuytel) - plazas, pedestrian avenues, piers | https://polyhaven.com/a/patterned_cobblestone | CC0 1.0 (Poly Haven) | 63591 |
| textures/cobble/normal.jpg | Patterned Cobblestone (Rob Tuytel) - plazas, pedestrian avenues, piers | https://polyhaven.com/a/patterned_cobblestone | CC0 1.0 (Poly Haven) | 229221 |
| textures/cobble/rough.jpg | Patterned Cobblestone (Rob Tuytel) - plazas, pedestrian avenues, piers | https://polyhaven.com/a/patterned_cobblestone | CC0 1.0 (Poly Haven) | 37070 |
| textures/grass/color.jpg | Grass Ground (Charlotte Baglioni) - parks / lawns | https://polyhaven.com/a/grass_ground | CC0 1.0 (Poly Haven) | 361080 |
| textures/grass/color_512.jpg | Grass Ground (Charlotte Baglioni) - parks / lawns | https://polyhaven.com/a/grass_ground | CC0 1.0 (Poly Haven) | 77904 |
| textures/grass/normal.jpg | Grass Ground (Charlotte Baglioni) - parks / lawns | https://polyhaven.com/a/grass_ground | CC0 1.0 (Poly Haven) | 340410 |
| textures/roof/color.jpg | Clay Roof Tiles 03 (Amal Kumar) - roof tiles | https://polyhaven.com/a/clay_roof_tiles_03 | CC0 1.0 (Poly Haven) | 299933 |
| textures/roof/color_512.jpg | Clay Roof Tiles 03 (Amal Kumar) - roof tiles | https://polyhaven.com/a/clay_roof_tiles_03 | CC0 1.0 (Poly Haven) | 75958 |
| textures/roof/normal.jpg | Clay Roof Tiles 03 (Amal Kumar) - roof tiles | https://polyhaven.com/a/clay_roof_tiles_03 | CC0 1.0 (Poly Haven) | 209350 |
| textures/roof/rough.jpg | Clay Roof Tiles 03 (Amal Kumar) - roof tiles | https://polyhaven.com/a/clay_roof_tiles_03 | CC0 1.0 (Poly Haven) | 24424 |
| textures/plaster/color.jpg | Worn Plaster Wall (Dimitrios Savva) - facade wall detail (grey, normal) | https://polyhaven.com/a/worn_plaster_wall | CC0 1.0 (Poly Haven) | 124181 |
| textures/plaster/color_512.jpg | Worn Plaster Wall (Dimitrios Savva) - facade wall detail (grey, normal) | https://polyhaven.com/a/worn_plaster_wall | CC0 1.0 (Poly Haven) | 30159 |
| textures/plaster/normal.jpg | Worn Plaster Wall (Dimitrios Savva) - facade wall detail (grey, normal) | https://polyhaven.com/a/worn_plaster_wall | CC0 1.0 (Poly Haven) | 65024 |
| textures/concrete/color.jpg | Concrete Wall 007 (Dario Barresi, Rico Cilliers, Charlotte Baglioni) - industrial facade detail | https://polyhaven.com/a/concrete_wall_007 | CC0 1.0 (Poly Haven) | 108228 |
| textures/concrete/color_512.jpg | Concrete Wall 007 (Dario Barresi, Rico Cilliers, Charlotte Baglioni) - industrial facade detail | https://polyhaven.com/a/concrete_wall_007 | CC0 1.0 (Poly Haven) | 24561 |
| textures/concrete/normal.jpg | Concrete Wall 007 (Dario Barresi, Rico Cilliers, Charlotte Baglioni) - industrial facade detail | https://polyhaven.com/a/concrete_wall_007 | CC0 1.0 (Poly Haven) | 54869 |
| textures/stone/color.jpg | Sandstone Blocks 08 (Rob Tuytel) - ashlar detail on monuments / bridges / quays (grey) | https://polyhaven.com/a/sandstone_blocks_08 | CC0 1.0 (Poly Haven) | 46668 |
| textures/stone/color_512.jpg | Sandstone Blocks 08 (Rob Tuytel) - ashlar detail on monuments / bridges / quays (grey) | https://polyhaven.com/a/sandstone_blocks_08 | CC0 1.0 (Poly Haven) | 10541 |
| textures/wood/color.jpg | Weathered Planks (Dario Barresi, Dimitrios Savva) - pier / yali wood detail (grey) | https://polyhaven.com/a/weathered_planks | CC0 1.0 (Poly Haven) | 144374 |
| textures/wood/color_512.jpg | Weathered Planks (Dario Barresi, Dimitrios Savva) - pier / yali wood detail (grey) | https://polyhaven.com/a/weathered_planks | CC0 1.0 (Poly Haven) | 37646 |
| textures/water/normal.jpg | Seamless looping waves heightmaps, waves3 frame 20 (zookeeper) - converted to a tangent-space normal map | https://opengameart.org/content/seamless-looping-waves-heightmaps | CC0 1.0 (OpenGameArt) | 57943 |
| hdri/qwantani_noon_puresky_1k.hdr | Qwantani Noon (Pure Sky) (Greg Zaal, Jarod Guest) | https://polyhaven.com/a/qwantani_noon_puresky | CC0 1.0 (Poly Haven) | 1089069 |
| hdri/qwantani_sunset_puresky_1k.hdr | Qwantani Sunset (Pure Sky) (Greg Zaal, Jarod Guest) | https://polyhaven.com/a/qwantani_sunset_puresky | CC0 1.0 (Poly Haven) | 1061624 |
| hdri/qwantani_dusk_2_puresky_1k.hdr | Qwantani Dusk 2 (Pure Sky) (Greg Zaal, Jarod Guest) | https://polyhaven.com/a/qwantani_dusk_2_puresky | CC0 1.0 (Poly Haven) | 1166018 |
| hdri/qwantani_night_puresky_1k.hdr | Qwantani Night (Pure Sky) (Greg Zaal, Jarod Guest) | https://polyhaven.com/a/qwantani_night_puresky | CC0 1.0 (Poly Haven) | 1389258 |

## Audio

Recorded samples in `public/assets/audio/` (OGG Vorbis, mono, 44.1 kHz; 113 files, 1950371 bytes in total). Every sound keeps its synthesised recipe in `src/audio/`; the samples are fetched lazily after the first user gesture (`src/audio/samples.js`) and take over per sound once decoded. All sources were downloaded from OpenGameArt.org and the licence on each asset page was read at download time. Files were trimmed / loudness-matched / (for loops) cross-faded and converted from the originals with ffmpeg (libvorbis) via a throw-away script; only the converted OGGs ship. Licence texts / attribution notices are in `public/assets/licenses/`.

**Attribution required (CC-BY 3.0):** "Car tire squeal skid loop" by Tom Haigh / audible-edge (https://opengameart.org/content/car-tire-squeal-skid-loop) and "Car Engine Loop 96kHz, 4s" by qubodup / Iwan Gabovitch (https://opengameart.org/content/car-engine-loop-96khz-4s), both licensed CC-BY 3.0 (https://creativecommons.org/licenses/by/3.0/); modified (looped, filtered, loudness-adjusted). Everything else is CC0 1.0.

| File | Title / source file | Author | Source URL | Licence | Bytes |
|---|---|---|---|---|---|
| audio/ambience/boat_1.ogg | Steamboat Engine Sound (steamboat_engine.wav): steamboat_engine.wav, faded | Spring Spring | https://opengameart.org/content/steamboat-engine-sound | CC0 1.0 | 65248 |
| audio/ambience/crickets.ogg | Crickets Ambient Noise - loopable (crickets_1.mp3): high-passed, cross-faded loop | Wolfgang_ (credited by the page: Ted Kerr) | https://opengameart.org/content/crickets-ambient-noise-loopable | CC0 1.0 | 68195 |
| audio/ambience/gull_1.ogg | Solo Seagull Sound Effects: Seagull Ambient 3 | Rango Mango | https://opengameart.org/content/solo-seagull-sound-effects | CC0 1.0 | 13250 |
| audio/ambience/gull_2.ogg | Solo Seagull Sound Effects: Seagull Ambient 4 | Rango Mango | https://opengameart.org/content/solo-seagull-sound-effects | CC0 1.0 | 12988 |
| audio/ambience/gull_3.ogg | Solo Seagull Sound Effects: Seagull Ambient 5 | Rango Mango | https://opengameart.org/content/solo-seagull-sound-effects | CC0 1.0 | 16228 |
| audio/ambience/gull_4.ogg | Solo Seagull Sound Effects: Seagull Ambient 6 | Rango Mango | https://opengameart.org/content/solo-seagull-sound-effects | CC0 1.0 | 12078 |
| audio/ambience/gull_5.ogg | Solo Seagull Sound Effects: Seagull Ambient 7 | Rango Mango | https://opengameart.org/content/solo-seagull-sound-effects | CC0 1.0 | 11679 |
| audio/ambience/gull_6.ogg | Solo Seagull Sound Effects: Seagull Big Ambient 2 | Rango Mango | https://opengameart.org/content/solo-seagull-sound-effects | CC0 1.0 | 28996 |
| audio/ambience/gull_7.ogg | Solo Seagull Sound Effects: Seagull Big Ambient | Rango Mango | https://opengameart.org/content/solo-seagull-sound-effects | CC0 1.0 | 9076 |
| audio/ambience/traffic.ogg | High traffic road sounds (gatve Varniu_2.ogg): 40 s excerpt, cross-faded loop | IgnasD (via Snabisch) | https://opengameart.org/content/high-traffic-road-sounds | CC0 1.0 | 285890 |
| audio/ambience/tram_1.ogg | Bell dings/chimes: bell_ding2.wav | PWL | https://opengameart.org/content/bell-dingschimes | CC0 1.0 | 14248 |
| audio/ambience/tram_2.ogg | Bell dings/chimes: bell_ding3.wav | PWL | https://opengameart.org/content/bell-dingschimes | CC0 1.0 | 16329 |
| audio/ambience/waves.ogg | Beach Ocean Waves (wave_01..04, from freesound.org #18363): 8 wave cuts from this pack and Water Waves, cross-faded into one loop | jasinski (via Four Bidden) | https://opengameart.org/content/beach-ocean-waves | CC0 1.0 | 118753 |
| audio/ambience/wind.ogg | Park ambiences (park_ambience_wind.wav): 26 s excerpt (high-passed, cross-faded loop) | Thimras | https://opengameart.org/content/park-ambiences | CC0 1.0 | 146149 |
| audio/character/bat_1.ogg | Impact: qubodupImpactWood | qubodup (Iwan Gabovitch) | https://opengameart.org/content/impact | CC0 1.0 | 7306 |
| audio/character/bat_2.ogg | 75 CC0 breaking / falling / hit sfx: wood_hit_01 | rubberduck | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | CC0 1.0 | 5291 |
| audio/character/bat_3.ogg | 75 CC0 breaking / falling / hit sfx: wood_hit_02 | rubberduck | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | CC0 1.0 | 5543 |
| audio/character/body_1.ogg | Impact: qubodupImpactMeat01 | qubodup (Iwan Gabovitch) | https://opengameart.org/content/impact | CC0 1.0 | 9622 |
| audio/character/body_2.ogg | Impact: qubodupImpactMeat02 | qubodup (Iwan Gabovitch) | https://opengameart.org/content/impact | CC0 1.0 | 9201 |
| audio/character/body_3.ogg | Thwack Sounds: PCM_thwack-03 | AntumDeluge (Jordan Irwin) | https://opengameart.org/content/thwack-sounds | CC0 1.0 | 5034 |
| audio/character/hurt_1.ogg | Punch: qubodupPunch02 (non-vocal thud) | qubodup (Iwan Gabovitch) | https://opengameart.org/content/punch | CC0 1.0 | 7579 |
| audio/character/hurt_2.ogg | Punch: qubodupPunch03 (non-vocal thud) | qubodup (Iwan Gabovitch) | https://opengameart.org/content/punch | CC0 1.0 | 7623 |
| audio/character/hurt_3.ogg | Impact: qubodupImpactMeat02 (non-vocal thud) | qubodup (Iwan Gabovitch) | https://opengameart.org/content/impact | CC0 1.0 | 9201 |
| audio/character/land_1.ogg | Jump Landing Sound (jumpland.wav): jumpland.wav | MentalSanityOff | https://opengameart.org/content/jump-landing-sound | CC0 1.0 | 7463 |
| audio/character/land_2.ogg | Jump Landing: Jump 3.wav | Dan Knoflicek (OpenGameArt user Macro) | https://opengameart.org/content/jump-landing | CC0 1.0 | 7547 |
| audio/character/land_3.ogg | Jump Landing: Jump 2.wav | Dan Knoflicek (OpenGameArt user Macro) | https://opengameart.org/content/jump-landing | CC0 1.0 | 7691 |
| audio/character/punch_1.ogg | Punch: qubodupPunch01 | qubodup (Iwan Gabovitch) | https://opengameart.org/content/punch | CC0 1.0 | 7747 |
| audio/character/punch_2.ogg | Punch: qubodupPunch02 | qubodup (Iwan Gabovitch) | https://opengameart.org/content/punch | CC0 1.0 | 7623 |
| audio/character/punch_3.ogg | Punch: qubodupPunch03 | qubodup (Iwan Gabovitch) | https://opengameart.org/content/punch | CC0 1.0 | 7689 |
| audio/character/punch_4.ogg | Punch: qubodupPunch04 | qubodup (Iwan Gabovitch) | https://opengameart.org/content/punch | CC0 1.0 | 7615 |
| audio/character/punch_5.ogg | Punch: qubodupPunch05 | qubodup (Iwan Gabovitch) | https://opengameart.org/content/punch | CC0 1.0 | 7611 |
| audio/character/step_1.ogg | Fantozzi's Footsteps (Grass/Sand & Stone): Stone L1 | Fantozzi (via Raassh) | https://opengameart.org/content/fantozzis-footsteps-grasssand-stone | CC0 1.0 | 6763 |
| audio/character/step_2.ogg | Fantozzi's Footsteps (Grass/Sand & Stone): Stone R1 | Fantozzi (via Raassh) | https://opengameart.org/content/fantozzis-footsteps-grasssand-stone | CC0 1.0 | 6667 |
| audio/character/step_3.ogg | Fantozzi's Footsteps (Grass/Sand & Stone): Stone L2 | Fantozzi (via Raassh) | https://opengameart.org/content/fantozzis-footsteps-grasssand-stone | CC0 1.0 | 6561 |
| audio/character/step_4.ogg | Fantozzi's Footsteps (Grass/Sand & Stone): Stone R2 | Fantozzi (via Raassh) | https://opengameart.org/content/fantozzis-footsteps-grasssand-stone | CC0 1.0 | 6475 |
| audio/character/step_5.ogg | Fantozzi's Footsteps (Grass/Sand & Stone): Stone L3 | Fantozzi (via Raassh) | https://opengameart.org/content/fantozzis-footsteps-grasssand-stone | CC0 1.0 | 6246 |
| audio/character/step_6.ogg | Fantozzi's Footsteps (Grass/Sand & Stone): Stone R3 | Fantozzi (via Raassh) | https://opengameart.org/content/fantozzis-footsteps-grasssand-stone | CC0 1.0 | 6629 |
| audio/impacts/crash_1.ogg | Crash Collision: qubodup-crash.ogg | qubodup (Iwan Gabovitch) | https://opengameart.org/content/crash-collision | CC0 1.0 | 8788 |
| audio/impacts/crash_2.ogg | 75 CC0 breaking / falling / hit sfx: metal_falling_02 | rubberduck | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | CC0 1.0 | 9525 |
| audio/impacts/crash_3.ogg | 75 CC0 breaking / falling / hit sfx: metal_falling_01 | rubberduck | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | CC0 1.0 | 11229 |
| audio/impacts/crash_4.ogg | 75 CC0 breaking / falling / hit sfx: metal_hit_02 | rubberduck | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | CC0 1.0 | 7822 |
| audio/impacts/crash_5.ogg | 75 CC0 breaking / falling / hit sfx: metal_falling_04 | rubberduck | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | CC0 1.0 | 6225 |
| audio/impacts/explosion_1.ogg | Chunky Explosion: Chunky Explosion.mp3, trimmed | Joth | https://opengameart.org/content/chunky-explosion | CC0 1.0 | 32979 |
| audio/impacts/explosion_2.ogg | Explosions (explosion1_0.ogg): explosion1_0.ogg | EZduzziteh | https://opengameart.org/content/explosions-4 | CC0 1.0 | 34029 |
| audio/impacts/explosion_3.ogg | 25 CC0 bang / firework SFX: bang_03.ogg | rubberduck | https://opengameart.org/content/25-cc0-bang-firework-sfx | CC0 1.0 | 10215 |
| audio/impacts/explosion_4.ogg | 25 CC0 bang / firework SFX: cannon_02.ogg | rubberduck | https://opengameart.org/content/25-cc0-bang-firework-sfx | CC0 1.0 | 16965 |
| audio/impacts/explosion_far_1.ogg | Explosion somewhere far: explosion_somewhere_far.mp3 | pauliuw | https://opengameart.org/content/explosion-somewhere-far | CC0 1.0 | 24288 |
| audio/impacts/explosion_far_2.ogg | Muffled Distant Explosion: Muffled Distant Explosion.wav, trimmed | NenadSimic | https://opengameart.org/content/muffled-distant-explosion | CC0 1.0 | 27581 |
| audio/impacts/glass_1.ogg | 75 CC0 breaking / falling / hit sfx: glass_breaking_01 | rubberduck | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | CC0 1.0 | 8853 |
| audio/impacts/glass_2.ogg | 75 CC0 breaking / falling / hit sfx: glass_breaking_03 | rubberduck | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | CC0 1.0 | 10348 |
| audio/impacts/glass_3.ogg | 75 CC0 breaking / falling / hit sfx: glass_breaking_06 | rubberduck | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | CC0 1.0 | 10957 |
| audio/impacts/glass_4.ogg | Glass Break (glass_breaking.wav): glass_breaking.wav, trimmed | Till Behrend | https://opengameart.org/content/glass-break | CC0 1.0 | 16797 |
| audio/impacts/impact_1.ogg | Impact: qubodupImpactStone | qubodup (Iwan Gabovitch) | https://opengameart.org/content/impact | CC0 1.0 | 7327 |
| audio/impacts/impact_2.ogg | 75 CC0 breaking / falling / hit sfx: rock_hit_01 | rubberduck | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | CC0 1.0 | 4580 |
| audio/impacts/impact_3.ogg | Thwack Sounds: PCM_thwack-05 | AntumDeluge (Jordan Irwin) | https://opengameart.org/content/thwack-sounds | CC0 1.0 | 6380 |
| audio/impacts/impact_4.ogg | Impact: qubodupImpactWood | qubodup (Iwan Gabovitch) | https://opengameart.org/content/impact | CC0 1.0 | 7306 |
| audio/impacts/ping_1.ogg | Impact: qubodupImpactMetal, high-passed | qubodup (Iwan Gabovitch) | https://opengameart.org/content/impact | CC0 1.0 | 6967 |
| audio/impacts/ping_2.ogg | 75 CC0 breaking / falling / hit sfx: metal_hit_01, high-passed | rubberduck | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | CC0 1.0 | 5434 |
| audio/impacts/ping_3.ogg | 75 CC0 breaking / falling / hit sfx: metal_hit_03, high-passed | rubberduck | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | CC0 1.0 | 6854 |
| audio/ui/click_1.ogg | Interface Sounds 1.0: Audio_click_001.ogg | Kenney (www.kenney.nl) | https://opengameart.org/content/interface-sounds | CC0 1.0 (licenses/Kenney-Interface-Sounds-1.0-CC0.txt) | 4409 |
| audio/ui/click_2.ogg | Interface Sounds 1.0: Audio_tick_004.ogg | Kenney (www.kenney.nl) | https://opengameart.org/content/interface-sounds | CC0 1.0 (licenses/Kenney-Interface-Sounds-1.0-CC0.txt) | 4428 |
| audio/ui/hover_1.ogg | Interface Sounds 1.0: Audio_select_007.ogg | Kenney (www.kenney.nl) | https://opengameart.org/content/interface-sounds | CC0 1.0 (licenses/Kenney-Interface-Sounds-1.0-CC0.txt) | 4427 |
| audio/ui/hover_2.ogg | Interface Sounds 1.0: Audio_tick_002.ogg | Kenney (www.kenney.nl) | https://opengameart.org/content/interface-sounds | CC0 1.0 (licenses/Kenney-Interface-Sounds-1.0-CC0.txt) | 4008 |
| audio/ui/money_1.ogg | 50 RPG sound effects: handleCoins.ogg | Kenney (www.kenney.nl) | https://opengameart.org/content/50-rpg-sound-effects | CC0 1.0 (licenses/Kenney-RPG-Audio-CC0.txt) | 11956 |
| audio/ui/money_2.ogg | 50 RPG sound effects: handleCoins2.ogg | Kenney (www.kenney.nl) | https://opengameart.org/content/50-rpg-sound-effects | CC0 1.0 (licenses/Kenney-RPG-Audio-CC0.txt) | 7740 |
| audio/ui/money_3.ogg | 12 Coin Sound Effects: coin.4.ogg | StarNinjas (via Timattack) | https://opengameart.org/content/12-coin-sound-effects | CC0 1.0 | 7542 |
| audio/ui/money_4.ogg | 12 Coin Sound Effects: coin.8.ogg | StarNinjas (via Timattack) | https://opengameart.org/content/12-coin-sound-effects | CC0 1.0 | 7873 |
| audio/ui/pickup_1.ogg | Interface Sounds 1.0: Audio_confirmation_001.ogg | Kenney (www.kenney.nl) | https://opengameart.org/content/interface-sounds | CC0 1.0 (licenses/Kenney-Interface-Sounds-1.0-CC0.txt) | 4848 |
| audio/ui/pickup_3.ogg | Interface Sounds 1.0: Audio_confirmation_003.ogg | Kenney (www.kenney.nl) | https://opengameart.org/content/interface-sounds | CC0 1.0 (licenses/Kenney-Interface-Sounds-1.0-CC0.txt) | 5401 |
| audio/vehicles/door_close_1.ogg | Car_door_SFX: door_closing.wav | looneybits | https://opengameart.org/content/cardoorsfx | CC0 1.0 | 9321 |
| audio/vehicles/door_close_2.ogg | Car Sound Effects Pack (Low Quality): Car_Door_Close.ogg | GGBotNet | https://opengameart.org/content/car-sound-effects-pack-low-quality | CC0 1.0 | 8372 |
| audio/vehicles/door_open_1.ogg | Car_door_SFX: door_opening.wav | looneybits | https://opengameart.org/content/cardoorsfx | CC0 1.0 | 12075 |
| audio/vehicles/door_open_2.ogg | Car Sound Effects Pack (Low Quality): Car_Door_Open.ogg | GGBotNet | https://opengameart.org/content/car-sound-effects-pack-low-quality | CC0 1.0 | 6865 |
| audio/vehicles/engine_high.ogg | racing car engine sound loops (loop_5_0.wav): looped (cross-faded) | domasx2 (cut from a public-domain pdsounds.org recording) | https://opengameart.org/content/racing-car-engine-sound-loops | CC0 1.0 | 7687 |
| audio/vehicles/engine_low.ogg | Car Engine Loop 96kHz, 4s (engine-loop-1-normalized.wav): looped (cross-faded) | qubodup (Iwan Gabovitch) | https://opengameart.org/content/car-engine-loop-96khz-4s | CC-BY 3.0 (the page also offers GPL; used under CC-BY 3.0; licenses/CC-BY-3.0-audio-attribution.txt); attribution: "qubodup (Iwan Gabovitch)" | 33955 |
| audio/vehicles/horn_1.ogg | Car Sound Effects Pack (Low Quality): Car_Horn.ogg | GGBotNet | https://opengameart.org/content/car-sound-effects-pack-low-quality | CC0 1.0 | 7763 |
| audio/vehicles/horn_2.ogg | Car signal (car2.wav): car2.wav | Yaroslav_Novikov | https://opengameart.org/content/car-signal | CC0 1.0 | 15138 |
| audio/vehicles/siren_wail.ogg | Sirens and Alarm Noise (siren_0.mp3): 26.3-30.3 s, one 4 s sweep as a loop | aquinn (via looneybits) | https://opengameart.org/content/sirens-and-alarm-noise | CC0 1.0 | 24013 |
| audio/vehicles/siren_yelp.ogg | Sirens and Alarm Noise (siren_0.mp3): 0.8-1.5 s, one 0.67 s sweep as a loop | aquinn (via looneybits) | https://opengameart.org/content/sirens-and-alarm-noise | CC0 1.0 | 7013 |
| audio/vehicles/skid_loop.ogg | Car tire squeal skid loop (tires_squal_loop.wav): looped, high-passed | audible-edge (Tom Haigh); uploaded by Vertigon | https://opengameart.org/content/car-tire-squeal-skid-loop | CC-BY 3.0 (licenses/CC-BY-3.0-audio-attribution.txt); attribution: "Tom Haigh / audible-edge" | 26006 |
| audio/weapons/empty_1.ogg | Equipment Click (equipmentclick.wav): first click | LFA | https://opengameart.org/content/equipment-click | CC0 1.0 | 7141 |
| audio/weapons/empty_2.ogg | equipment clicks III (equipment_clicks3.wav): bolt-action click, trimmed | LFA | https://opengameart.org/content/equipment-clicks-iii | CC0 1.0 | 4982 |
| audio/weapons/pistol_1.ogg | The Free Firearm Sound Library, "Prepared SFX Library": 1911/A_34P.wav, first shot | Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney (via OpenGameArt user Ylmir) | https://opengameart.org/content/the-free-firearm-sound-library | CC0 1.0 (licenses/Free-Firearm-Sound-Library-CC0.txt) | 15351 |
| audio/weapons/pistol_2.ogg | The Free Firearm Sound Library, "Prepared SFX Library": Walther PPQ/X_31P.wav, first shot | Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney (via OpenGameArt user Ylmir) | https://opengameart.org/content/the-free-firearm-sound-library | CC0 1.0 (licenses/Free-Firearm-Sound-Library-CC0.txt) | 14165 |
| audio/weapons/pistol_3.ogg | The Free Firearm Sound Library, "Prepared SFX Library": Smith & Wesson 642/V_22P.wav, first shot | Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney (via OpenGameArt user Ylmir) | https://opengameart.org/content/the-free-firearm-sound-library | CC0 1.0 (licenses/Free-Firearm-Sound-Library-CC0.txt) | 15275 |
| audio/weapons/pistol_4.ogg | The Free Firearm Sound Library, "Prepared SFX Library": 1911/A_42P.wav, first shot | Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney (via OpenGameArt user Ylmir) | https://opengameart.org/content/the-free-firearm-sound-library | CC0 1.0 (licenses/Free-Firearm-Sound-Library-CC0.txt) | 13624 |
| audio/weapons/pump_1.ogg | Shotgun Reload Sound effects: ShotgunSounds_Rack.mp3 | zer0_sol | https://opengameart.org/content/shotgun-reload-sound-effects | CC0 1.0 | 13068 |
| audio/weapons/pump_2.ogg | Gun reload sounds: shotguncock_0.wav | SpringySpringo (via Joaken) | https://opengameart.org/content/gun-reload-sounds | CC0 1.0 | 7906 |
| audio/weapons/reload_1.ogg | Handgun Reload Sound Effect (reload.wav): reload.wav, trimmed | zer0_sol | https://opengameart.org/content/handgun-reload-sound-effect | CC0 1.0 | 16705 |
| audio/weapons/reload_2.ogg | Gun reload sounds: gunreload1.wav | SpringySpringo (via Joaken) | https://opengameart.org/content/gun-reload-sounds | CC0 1.0 | 17584 |
| audio/weapons/reload_3.ogg | Gun reload sounds: assaultriflereload1_0.wav | SpringySpringo (via Joaken) | https://opengameart.org/content/gun-reload-sounds | CC0 1.0 | 17205 |
| audio/weapons/rifle_1.ogg | The Free Firearm Sound Library, "Prepared SFX Library": AK-47/C_31P.wav, first shot | Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney (via OpenGameArt user Ylmir) | https://opengameart.org/content/the-free-firearm-sound-library | CC0 1.0 (licenses/Free-Firearm-Sound-Library-CC0.txt) | 17014 |
| audio/weapons/rifle_2.ogg | The Free Firearm Sound Library, "Prepared SFX Library": AR-15/D_32P.wav, first shot | Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney (via OpenGameArt user Ylmir) | https://opengameart.org/content/the-free-firearm-sound-library | CC0 1.0 (licenses/Free-Firearm-Sound-Library-CC0.txt) | 15243 |
| audio/weapons/rifle_3.ogg | The Free Firearm Sound Library, "Prepared SFX Library": SKS/U_19P.wav, first shot | Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney (via OpenGameArt user Ylmir) | https://opengameart.org/content/the-free-firearm-sound-library | CC0 1.0 (licenses/Free-Firearm-Sound-Library-CC0.txt) | 16801 |
| audio/weapons/rifle_4.ogg | The Free Firearm Sound Library, "Prepared SFX Library": AR-15/D_24P.wav, first shot | Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney (via OpenGameArt user Ylmir) | https://opengameart.org/content/the-free-firearm-sound-library | CC0 1.0 (licenses/Free-Firearm-Sound-Library-CC0.txt) | 16891 |
| audio/weapons/rpg_launch.ogg | Rocket launch (launch.wav): rocket motor swell, trimmed | qubodup (Iwan Gabovitch) | https://opengameart.org/content/rocket-launch | CC0 1.0 | 38802 |
| audio/weapons/shell_1.ogg | Hit sounds: Metal Hit 1.wav, high-passed | pauliuw | https://opengameart.org/content/hit-sounds | CC0 1.0 | 6278 |
| audio/weapons/shell_2.ogg | Metal Impact Sounds: clink1_0.wav | BMacZero (Brian MacIntosh) | https://opengameart.org/content/metal-impact-sounds | CC0 1.0 | 6369 |
| audio/weapons/shell_3.ogg | Metal Impact Sounds: clink2.wav | BMacZero (Brian MacIntosh) | https://opengameart.org/content/metal-impact-sounds | CC0 1.0 | 5861 |
| audio/weapons/shell_4.ogg | Metal Impact Sounds: clink3.wav | BMacZero (Brian MacIntosh) | https://opengameart.org/content/metal-impact-sounds | CC0 1.0 | 6406 |
| audio/weapons/shotgun_1.ogg | The Free Firearm Sound Library, "Prepared SFX Library": Mossberg/N_26P.wav, first shot | Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney (via OpenGameArt user Ylmir) | https://opengameart.org/content/the-free-firearm-sound-library | CC0 1.0 (licenses/Free-Firearm-Sound-Library-CC0.txt) | 18350 |
| audio/weapons/shotgun_2.ogg | The Free Firearm Sound Library, "Prepared SFX Library": Model 12/K_17P.wav, first shot | Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney (via OpenGameArt user Ylmir) | https://opengameart.org/content/the-free-firearm-sound-library | CC0 1.0 (licenses/Free-Firearm-Sound-Library-CC0.txt) | 18324 |
| audio/weapons/shotgun_3.ogg | The Free Firearm Sound Library, "Prepared SFX Library": Nova/O_17P.wav, first shot | Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney (via OpenGameArt user Ylmir) | https://opengameart.org/content/the-free-firearm-sound-library | CC0 1.0 (licenses/Free-Firearm-Sound-Library-CC0.txt) | 18970 |
| audio/weapons/smg_1.ogg | The Free Firearm Sound Library, "Prepared SFX Library": PPSh/P_18P.wav, single shot | Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney (via OpenGameArt user Ylmir) | https://opengameart.org/content/the-free-firearm-sound-library | CC0 1.0 (licenses/Free-Firearm-Sound-Library-CC0.txt) | 9245 |
| audio/weapons/smg_2.ogg | The Free Firearm Sound Library, "Prepared SFX Library": PPSh/P_30P.wav, single shot | Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney (via OpenGameArt user Ylmir) | https://opengameart.org/content/the-free-firearm-sound-library | CC0 1.0 (licenses/Free-Firearm-Sound-Library-CC0.txt) | 8281 |
| audio/weapons/smg_3.ogg | The Free Firearm Sound Library, "Prepared SFX Library": Carl Gustav M45/G_24P.wav, single shot | Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney (via OpenGameArt user Ylmir) | https://opengameart.org/content/the-free-firearm-sound-library | CC0 1.0 (licenses/Free-Firearm-Sound-Library-CC0.txt) | 9188 |
| audio/weapons/smg_4.ogg | The Free Firearm Sound Library, "Prepared SFX Library": Carl Gustav M45/G_20P.wav, single shot | Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney (via OpenGameArt user Ylmir) | https://opengameart.org/content/the-free-firearm-sound-library | CC0 1.0 (licenses/Free-Firearm-Sound-Library-CC0.txt) | 8200 |
| audio/weapons/smg_5.ogg | The Free Firearm Sound Library, "Prepared SFX Library": Carl Gustav M45/G_22P.wav, single shot | Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney (via OpenGameArt user Ylmir) | https://opengameart.org/content/the-free-firearm-sound-library | CC0 1.0 (licenses/Free-Firearm-Sound-Library-CC0.txt) | 9288 |
| audio/weapons/sniper_1.ogg | The Free Firearm Sound Library, "Prepared SFX Library": Mosin Nagant/M_26P.wav, first shot | Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney (via OpenGameArt user Ylmir) | https://opengameart.org/content/the-free-firearm-sound-library | CC0 1.0 (licenses/Free-Firearm-Sound-Library-CC0.txt) | 25733 |
| audio/weapons/sniper_2.ogg | The Free Firearm Sound Library, "Prepared SFX Library": Tikka/W_24P.wav, first shot | Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney (via OpenGameArt user Ylmir) | https://opengameart.org/content/the-free-firearm-sound-library | CC0 1.0 (licenses/Free-Firearm-Sound-Library-CC0.txt) | 25032 |
| audio/weapons/sniper_3.ogg | The Free Firearm Sound Library, "Prepared SFX Library": Savage 10 .300 Blackout/T_17P.wav, first shot | Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney (via OpenGameArt user Ylmir) | https://opengameart.org/content/the-free-firearm-sound-library | CC0 1.0 (licenses/Free-Firearm-Sound-Library-CC0.txt) | 24722 |
| audio/weapons/switch_1.ogg | 50 RPG sound effects: metalLatch.ogg | Kenney (www.kenney.nl) | https://opengameart.org/content/50-rpg-sound-effects | CC0 1.0 (licenses/Kenney-RPG-Audio-CC0.txt) | 6117 |
| audio/weapons/switch_2.ogg | 50 RPG sound effects: metalClick.ogg | Kenney (www.kenney.nl) | https://opengameart.org/content/50-rpg-sound-effects | CC0 1.0 (licenses/Kenney-RPG-Audio-CC0.txt) | 8127 |
