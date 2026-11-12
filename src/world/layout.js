// Shared world constants and shoreline / pier shape. Units: metres.
import { clamp } from '../core/utils.js';

export const HALF = 600;
export const ROAD_W = 14;          // full asphalt width
export const ROAD_HALF = ROAD_W / 2;
export const LANE = 3.5;           // lane centre offset from centre line
export const SIDEWALK = 9;         // sidewalk centre offset from centre line (sidewalk spans 7..11)
export const SW_EDGE = 11;         // outer edge of sidewalk
export const LOT_MARGIN = 12.5;    // buildings start this far from a road centre line
export const COAST_X = 450;        // x of the coastal road (east edge of the grid)

/** x of the shoreline (water begins east of it). Flat in the port area (z < -300). */
export function shoreAt(z) {
  const k = clamp((z + 300) / 60, 0, 1);
  return 520 + k * (5.5 * Math.sin(z * 0.011) + 2.5 * Math.sin(z * 0.037 + 1));
}

/** Pier running east into the sea. z is assigned when the road grid is known. */
export const PIER = { z: 200, x0: 461, x1: 586, hw: 3.5 };
