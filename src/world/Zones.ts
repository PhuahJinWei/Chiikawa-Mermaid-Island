import { t, type StringKey } from '../i18n/I18n';

/** The island's named places, from the most particular to the most general. */
export type ZoneId =
  | 'pier'
  | 'waterfall'
  | 'cliffs'
  | 'gorge'
  | 'westBeach'
  | 'fields'
  | 'village'
  | 'festival'
  | 'nightBeach'
  | 'mainBeach'
  | 'beach'
  | 'jungle'
  | 'lagoon'
  | 'reef'
  | 'deep';

/** A place drawn on the layout: a turned box (centre x, z, half sizes, degrees) or a circle (x, z, radius). */
export interface ZoneDef {
  id: ZoneId;
  box?: [number, number, number, number, number];
  circle?: [number, number, number];
}

/** Water deeper than this is past the lagoon, over the reef; deeper still, the deep sea. */
const LAGOON_DEPTH = 4;
const REEF_DEPTH = 10;
/** Dry ground lower than this is sand. */
const SAND_HEIGHT = 0.8;

/**
 * Where on the island a point is. Places drawn on the layout file come first, in its order; then
 * the sea by its depth (lagoon, reef, the deep); then the land: sand by the sea, jungle inland.
 */
export class Zones {
  constructor(
    private readonly defs: ZoneDef[],
    private readonly ground: (x: number, z: number) => number,
    /** The sea's surface. */
    private readonly sea: number,
  ) {}

  at(x: number, z: number): ZoneId {
    for (const d of this.defs) {
      if (d.circle && Math.hypot(x - d.circle[0], z - d.circle[1]) < d.circle[2]) return d.id;
      if (d.box) {
        const [cx, cz, hx, hz, turn] = d.box;
        const a = (turn * Math.PI) / 180;
        const dx = x - cx;
        const dz = z - cz;
        const lx = dx * Math.cos(a) - dz * Math.sin(a);
        const lz = dx * Math.sin(a) + dz * Math.cos(a);
        if (Math.abs(lx) < hx && Math.abs(lz) < hz) return d.id;
      }
    }
    const h = this.ground(x, z);
    const depth = this.sea - h;
    if (depth > 0.05) return depth < LAGOON_DEPTH ? 'lagoon' : depth < REEF_DEPTH ? 'reef' : 'deep';
    return h < SAND_HEIGHT ? 'beach' : 'jungle';
  }
}

/** A place's name, as the player reads it. */
export function zoneName(id: ZoneId): string {
  return t(`zone.${id}` as StringKey);
}
