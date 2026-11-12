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
