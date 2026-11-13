// Shared world constants. Units: metres. NORTH = -Z, EAST = +X (the pre-rendered minimap reads like a normal map).
export const HALF = 800;
export const ROAD_W = 14;          // full asphalt width
export const ROAD_HALF = ROAD_W / 2;
export const LANE = 3.5;           // lane centre offset from centre line
export const SIDEWALK = 9;         // sidewalk centre offset from centre line (sidewalk spans 7..11)
export const SW_EDGE = 11;         // outer edge of sidewalk
export const LOT_MARGIN = 12.5;    // buildings start this far from a road centre line
export const QUAY = 24;            // distance from a coast road centre line to the water edge
export const WATER_Y = -1.2;       // water surface height (ground is y = 0, quay walls drop to the water)
export const CHUNK = 320;          // static geometry chunk size (5 x 5 chunks over the map)
