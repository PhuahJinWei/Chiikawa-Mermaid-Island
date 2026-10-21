/**
 * Development-only helpers for comparing the game against film frames.
 * Installed on window.__dev by main.ts when running `npm run dev`; never in production builds.
 *
 *   __dev.shot('frame14')      stage the shot that matches reference frame 14
 *   __dev.capture('name')      save the canvas through the local capture receiver
 *   __dev.release()            return to normal play
 *   __dev.caveDark()           the forbidden cave's dark test: nothing in it lit with its lights out
 *   __dev.islandDark()         the island's dark test: nothing on it lit with all its lights out
 *   __dev.seeThrough()         the see-through test: nothing drawn only near missing from an opening into it
 */
import type { ActionId } from '../characters/Actions';
import type { CharacterId, ExpressionId } from '../characters/types';
import type { CaveInfo } from '../world/Cave';

export interface StagedCharacter {
  x: number;
  z: number;
  yaw: number;
  /** Their feet's height, for standing on the forbidden cave's floor under the island's ground. */
  y?: number;
  expression?: ExpressionId | null;
  action?: ActionId;
  /** Holding the cave's torch up (one of them). */
  torch?: boolean;
  /** Sitting in the cave's boat (see StagedShot.boat), at this seat: 0 the stern, 1 the middle, 2 the bow. */
  seat?: number;
}

export interface StagedShot {
  characters: Partial<Record<CharacterId, StagedCharacter>>;
  /** Background islanders: x, z, facing. */
  crowd?: [number, number, number][];
  camera: { position: [number, number, number]; target: [number, number, number]; fov: number };
  /** The time of day, in hours past midnight; late morning when left out. */
  hour?: number;
  /** The forbidden cave's boat afloat here (x, z, its bow's heading), manned, the torch at its bow
   * unless a character holds it. */
  boat?: { x: number; z: number; heading: number };
}

export interface DevApi {
  stage(shot: StagedShot): void;
  release(): void;
  setOutfit(on: boolean): void;
  renderNow(settle?: number): void;
  canvas(): HTMLCanvasElement;
  /** The forbidden cave's dark test (see Cave.darkTest): every light in the cave put out (on), or lit
   * again (off). */
  caveDark(on: boolean): void;
  /** The island's dark test (see Stage.darkTest): every source of the island's light put out, and the
   * cave's (on), or lit again (off). */
  islandDark(on: boolean): void;
  /** For the see-through test (see seeThrough): what is drawn only near (the forbidden cave's inside, the
   * houses' rooms) drawn however far off it is (on), or as its distance says again (off). */
  drawAll(on: boolean): void;
  /** The houses' doorways and windows: each one's middle on the wall's outer face, the way out of it,
   * and its half width and half height. */
  houseOpenings(): { centre: [number, number, number]; out: [number, number, number]; half: [number, number] }[];
  /** The scene drawn again as it stands and read back, before the finishing passes: each pixel's light
   * and where in the world its surface is; and which pixels look out of the forbidden cave. */
  readScene(): SceneRead;
  /** The forbidden cave, for staging shots in it: its layout and its floor's height at (x, z) (NaN off
   * its floor); null if there is none. */
  cave(): { info: CaveInfo; floorAt(x: number, z: number): number } | null;
}

/** A picture read back (DevApi.readScene), bottom row first. */
export interface SceneRead {
  width: number;
  height: number;
  /** Each pixel's light, linear rgba. */
  colour: Float32Array;
  /** Where in the world each pixel's surface is (xyz; w 0 where nothing was drawn). */
  where: Float32Array;
  /** 1 where the pixel looks out of the forbidden cave, by its mouth or up its skylight: the outside's. */
  out: Uint8Array;
}

/** Shots that reproduce reference frames, measured from the frames themselves. */
export const SHOTS: Record<string, StagedShot> = {
  // Film frame 14: Chiikawa and Hachiware eating side by side on the beach, eye-level camera.
  frame14: {
    characters: {
      chiikawa: { x: -0.47, z: 0, yaw: 0.12, expression: 'happy', action: 'eat' },
      hachiware: { x: 0.47, z: 0, yaw: -0.08, expression: 'happy', action: 'eat' },
    },
    crowd: [
      [-1.8, -2.5, 2.2],
      [0.05, -2.6, 3.14],
      [2.05, -2.4, -2.3],
    ],
    // Narrow lens and eye-level height put the horizon where the frame has it.
    camera: { position: [0, 0.62, 5.2], target: [0, 0.42, 0], fov: 16 },
  },
  // Film frame 9: close-up of Hachiware (left) and Chiikawa (right) eating, faces turned to each other.
  frame9: {
    characters: {
      hachiware: { x: -0.46, z: 0, yaw: 0.32, expression: 'neutral', action: 'eat' },
      chiikawa: { x: 0.47, z: 0, yaw: -0.3, expression: 'neutral', action: 'eat' },
    },
    crowd: [
      [-1.6, -2.6, 2.9],
      [0.4, -3.0, 3.0],
      [2.1, -2.4, -2.6],
    ],
    camera: { position: [0, 0.6, 3.7], target: [0, 0.53, 0], fov: 16 },
  },
  // The film's aerial shot of the island (`mermaid island 1`), from high over the bay to the
  // south-south-west, through the camera the island was first laid out with. The island has grown
  // since (its third shape): aimed at the same place on it from as far off, the lens widened to take
  // it all in, so the frame is matched only roughly now.
  aerial: {
    characters: {},
    camera: { position: [-97.5, 395.19, 399.9], target: [-18.4, 0, -99.7], fov: 24.7 },
  },
  // The film's jungle-waterfall frame: low on the pool's bank behind Chiikawa and Hachiware, a 35
  // degree lens, 3 pm (the film look is judged against it).
  waterfall: {
    characters: {
      chiikawa: { x: -8.9, z: -194.46, yaw: 2.006 },
      hachiware: { x: -8.48, z: -193.55, yaw: 2.006 },
    },
    camera: { position: [-12.04, 3.0, -192.44], target: [14.7, 4.4, -204.9], fov: 35 },
    hour: 15,
  },
  // The film's sea-cliffs frame: on the headland's grassy top at the mouth of the cove, looking
  // east-south-east across it at the cliffs, the sea stack on the left, the cast in a row ahead.
  cliffs: {
    characters: {
      chiikawa: { x: 30.06, z: -266.54, yaw: 1.047 },
      hachiware: { x: 30.76, z: -267.75, yaw: 1.047 },
      usagi: { x: 31.46, z: -268.96, yaw: 1.047 },
    },
    camera: { position: [26, 8.69, -270.5], target: [51.98, 5.89, -255.5], fov: 45 },
    hour: 11,
  },
  // The film's frame of the bay from the water (`bay 3`): the quay's timber wall end on across the
  // frame, the pier in its middle, the jungle above.
  bay: {
    characters: {},
    camera: { position: [-12, 2.0, 62], target: [-4, 3, -10], fov: 30 },
    hour: 11,
  },
  // The film's frame of the forbidden cave by night (`cave entrance 1`): from the beach by the water,
  // the sea on the left, the terraced outcrop rising from it to the right with the cave's mouth at its
  // foot, palms on the right.
  cave: {
    characters: {},
    camera: { position: [-189, 1.6, -84], target: [-195, 3.2, -112], fov: 55 },
    hour: 21,
  },
  // The film's frame of the stepping stones from the rim (`parkour stone landmark 3`): the cast on
  // the north rim's grass from behind, the grass-topped stones stepping across the gorge before them.
  stones: {
    characters: {
      chiikawa: { x: -102.6, z: -211.4, yaw: 0.2 },
      hachiware: { x: -101.4, z: -211.6, yaw: 0.2 },
      usagi: { x: -103.8, z: -211.2, yaw: 0.2 },
    },
    camera: { position: [-103.8, 12.8, -214.8], target: [-97.4, 9.4, -183.6], fov: 55 },
    hour: 11,
  },
  // The film's frame of the riverside path below the stones (`river below parkour stone landmark
  // 1`): Chiikawa on its pebbles at night, the gorge's wall beside her.
  riverside: {
    characters: { chiikawa: { x: -125.0, z: -178.4, yaw: -1.2 } },
    camera: { position: [-120.8, 1.6, -180.4], target: [-128, 1.1, -177.0], fov: 45 },
    hour: 21.5,
  },
  // The film's frame of the way to 島二郎 (`river below parkour stone landmark 2`): its sign hung over
  // the path at night, Chiikawa under it, the restaurant's lantern beyond.
  shimajiro: {
    characters: { chiikawa: { x: -157.3, z: -168.4, yaw: -2.0 } },
    camera: { position: [-153.5, 1.35, -170.6], target: [-159.0, 2.0, -166.7], fov: 50 },
    hour: 21.5,
  },
  // The film's frame of the village's plaza (`village 3`): the islanders lined up across the sand,
  // the watchtower stage at its corner behind them among the jungle's flowers.
  village: {
    characters: {
      chiikawa: { x: -1.2, z: -79.0, yaw: 2.4 },
      hachiware: { x: 0.2, z: -80.2, yaw: 2.4 },
      usagi: { x: 1.6, z: -81.4, yaw: 2.4 },
    },
    crowd: [
      [-4.0, -76.6, 2.4],
      [-2.6, -77.8, 2.4],
      [3.0, -82.6, 2.4],
      [4.4, -83.8, 2.4],
      [5.8, -85.0, 2.4],
    ],
    camera: { position: [-9.5, 2.5, -64.5], target: [7.0, 3.6, -86.5], fov: 45 },
    hour: 11,
  },
  // The film's frames of the local houses' lane (`village 1`, `5`, `7`): two stilt huts facing each
  // other across the sand, the cast between them.
  lane: {
    characters: {
      usagi: { x: -23.6, z: -64.8, yaw: -2.1 },
      hachiware: { x: -22.4, z: -66.0, yaw: -2.1 },
      chiikawa: { x: -22.9, z: -63.4, yaw: -2.1 },
    },
    camera: { position: [-15.5, 2.6, -68.5], target: [-26.5, 2.4, -62.0], fov: 55 },
    hour: 11,
  },
  // The film's frame of a guest house (`guesthouse exterior 1`): from its path, in its greenery.
  guesthouse: {
    characters: {},
    camera: { position: [13.6, 2.7, -101.5], target: [12.0, 3.6, -110.5], fov: 55 },
    hour: 11,
  },
  // Lineup of the main cast at eye level, for checking proportions side by side.
  cast: {
    characters: {
      chiikawa: { x: -2.5, z: 0, yaw: 0 },
      hachiware: { x: -1.5, z: 0, yaw: 0 },
      usagi: { x: -0.5, z: 0, yaw: 0 },
      momonga: { x: 0.55, z: 0, yaw: 0 },
      hitoha: { x: 1.6, z: 0, yaw: 0 },
      futaba: { x: 2.6, z: 0, yaw: 0 },
    },
    camera: { position: [0, 0.6, 9.5], target: [0, 0.55, 0], fov: 27 },
  },
};

/**
 * Views over the whole of the forbidden cave, for its dark test (see caveDark): its passage on foot with
 * the torch held up, looking in and looking back out of its mouth; its cavern's beach; the channel and
 * the lake under the skylight from the boat, one of the cast eating (the rice ball in hand), and the
 * boat on the far side of the lake, well off; the skylight's well from below; and the chamber past it,
 * its ledge, crystals and fire.
 */
export function caveViews({ info, floorAt }: NonNullable<ReturnType<DevApi['cave']>>): Record<string, StagedShot> {
  const stand = (x: number, z: number, yaw: number, more: Partial<StagedCharacter> = {}): StagedCharacter => ({
    x,
    z,
    yaw,
    y: floorAt(x, z),
    ...more,
  });
  const seat = (n: number, more: Partial<StagedCharacter> = {}): StagedCharacter => ({ x: 0, z: 0, yaw: Math.PI / 2, seat: n, ...more });
  const eye = (x: number, z: number, up: number): [number, number, number] => [x, floorAt(x, z) + up, z];
  const [mx, mz] = info.mouth.centre;
  const [dx, dz] = info.dome.centre;
  const w = info.water;
  const views: Record<string, StagedShot> = {
    passage: {
      characters: { usagi: stand(-191.0, -119.6, 2.05, { torch: true }) },
      camera: { position: eye(-192.8, -116.5, 1.5), target: eye(-187.5, -121.4, 0.5), fov: 50 },
    },
    mouth: {
      characters: { usagi: stand(-192.8, -116.5, Math.PI, { torch: true }) },
      camera: { position: eye(-190.6, -120.2, 1.4), target: eye(mx, mz, 1.0), fov: 55 },
    },
    cavern: {
      characters: { usagi: stand(-180.6, -123.0, 1.6, { torch: true }) },
      camera: { position: [-185.5, 1.7, -122.0], target: [-168.0, -0.6, -125.5], fov: 55 },
    },
    channel: {
      boat: { x: -168.2, z: -125.2, heading: 1.185 },
      characters: { usagi: seat(2), hachiware: seat(1), chiikawa: seat(0) },
      camera: { position: [-166.9, 0.55, -128.4], target: [-168.2, 0.35, -125.2], fov: 45 },
    },
    lake: {
      boat: { x: -142.0, z: -142.6, heading: 3.51 },
      characters: { usagi: seat(2), hachiware: seat(1, { action: 'eat' }), chiikawa: seat(0) },
      camera: { position: [-151.9, 0.9, -138.8], target: [-138.0, 0.6, -144.0], fov: 46 },
    },
    far: {
      boat: { x: dx + 9, z: dz - 3, heading: 1.6 },
      characters: { usagi: seat(2), hachiware: seat(1), chiikawa: seat(0, { action: 'eat' }) },
      camera: { position: [dx - 12, w + 1.2, dz + 3], target: [dx + 9, w + 0.6, dz - 3], fov: 40 },
    },
    well: {
      characters: {},
      camera: { position: [dx - 6, w + 1.2, dz + 2], target: [dx, info.dome.top, dz], fov: 60 },
    },
  };
  if (info.chamber) {
    const [cx, cz] = info.chamber.centre;
    const [fx, , fz] = info.fire;
    views.chamber = {
      characters: {
        usagi: stand(fx - 1.2, fz + 1.4, -1.9, { torch: true }),
        chiikawa: stand(fx - 1.0, fz - 1.4, -1.2, { action: 'eat' }),
      },
      camera: { position: [cx - 3.0, w + 1.4, cz + 0.5], target: [fx, w + 0.4, fz], fov: 55 },
    };
  }
  return views;
}

/**
 * Views over the island, for its dark test by night and by day (see islandDark): the festival's plaza on
 * the beach, its stalls and arch, and its street of stalls; the village's plaza with its stage and
 * torches; the local houses' lane, the plank huts and a guest house in its greenery, each lit inside;
 * the beach, the moon's road on the sea and the ferry; the quay, and the bay seen from the water; the
 * night beach under its rocks; the jungle's waterfall and its pool, the sea cliffs, the stepping stones
 * over the gorge, its riverside path and the way to 島二郎; the fields; the forbidden cave's mouth from
 * the beach; and the whole island from high over the bay. The cast stand in them, one eating (the rice
 * ball in hand), islanders about the festival.
 */
export const ISLAND_VIEWS: Record<string, StagedShot> = {
  festival: {
    characters: {
      chiikawa: { x: -2.6, z: -8.6, yaw: 0.35 },
      hachiware: { x: -1.0, z: -9.2, yaw: -0.15, action: 'eat' },
      usagi: { x: 1.6, z: -10.4, yaw: -0.5 },
    },
    crowd: [
      [-9.0, -11.0, 0.3],
      [4.2, -11.2, -0.4],
      [9.0, -11.0, 0.2],
      [-6.0, -6.2, 2.8],
      [6.4, -7.0, -2.6],
    ],
    camera: { position: [-7.0, 1.7, -1.5], target: [1.0, 2.2, -14.0], fov: 50 },
  },
  street: {
    characters: { momonga: { x: 0.9, z: -22.5, yaw: 0.2 }, futaba: { x: -1.2, z: -27.0, yaw: -0.3 } },
    crowd: [
      [-2.2, -19.0, 1.4],
      [2.4, -30.0, -1.6],
      [-1.6, -33.5, 0.4],
    ],
    camera: { position: [0.6, 1.6, -12.0], target: [0.0, 2.0, -36.0], fov: 50 },
  },
  village: SHOTS.village,
  lane: SHOTS.lane,
  guesthouse: { ...SHOTS.guesthouse, characters: { hitoha: { x: 13.2, z: -104.5, yaw: 0.2 } } },
  planks: {
    characters: { futaba: { x: -13.5, z: -96.5, yaw: 1.0 } },
    camera: { position: [-8.5, 2.3, -92.0], target: [-19.0, 2.2, -99.5], fov: 50 },
  },
  beach: {
    characters: { chiikawa: { x: -12.5, z: -0.5, yaw: 2.6 }, hachiware: { x: -11.4, z: -1.2, yaw: 2.6, action: 'eat' } },
    camera: { position: [-16.0, 1.5, -6.0], target: [-4.0, 0.3, 18.0], fov: 50 },
  },
  quay: {
    characters: { usagi: { x: 9.0, z: 0.6, yaw: -2.0 } },
    camera: { position: [-1.5, 2.0, 7.0], target: [18.0, 1.0, 1.0], fov: 50 },
  },
  bay: SHOTS.bay,
  nightBeach: {
    characters: { momonga: { x: 70.0, z: -20.0, yaw: 0.5 } },
    camera: { position: [64.0, 1.6, -12.0], target: [80.0, 2.5, -30.0], fov: 50 },
  },
  waterfall: SHOTS.waterfall,
  cliffs: SHOTS.cliffs,
  stones: SHOTS.stones,
  riverside: SHOTS.riverside,
  shimajiro: SHOTS.shimajiro,
  cave: { ...SHOTS.cave, characters: { usagi: { x: -191.5, z: -96.0, yaw: 3.0 } } },
  fields: {
    characters: { hachiware: { x: -40.0, z: -33.0, yaw: -2.4 } },
    camera: { position: [-35.0, 2.0, -27.0], target: [-47.0, 1.0, -40.0], fov: 50 },
  },
  aerial: SHOTS.aerial,
};

/** More light than this (linear, before the finishing passes) is lit. */
const GLIMMER = 0.0005;

/** What shows lit in a picture read back (more than a glimmer), of the pixels `counted` keeps: how many
 * it kept, how many of them are lit, and where (the metre-cells with the most, x y z, how many, the
 * brightest rgb, and where on screen from the top left). */
function litPixels({ width, height, colour, where }: SceneRead, counted: (i: number) => boolean) {
  const cells = new Map<string, { at: number[]; pixels: number; brightest: number[]; screen: number[] }>();
  let seen = 0;
  let lit = 0;
  for (let i = 0; i < width * height; i++) {
    if (!counted(i)) continue;
    seen++;
    const r = colour[i * 4];
    const g = colour[i * 4 + 1];
    const b = colour[i * 4 + 2];
    const top = Math.max(r, g, b);
    if (!(top > GLIMMER)) continue;
    lit++;
    const at = [where[i * 4], where[i * 4 + 1], where[i * 4 + 2]].map(Math.round);
    const key = at.join(',');
    const cell = cells.get(key) ?? { at, pixels: 0, brightest: [0, 0, 0], screen: [i % width, height - 1 - Math.floor(i / width)] };
    cell.pixels++;
    if (top > Math.max(...cell.brightest)) cell.brightest = [r, g, b].map((v) => +v.toFixed(4));
    cells.set(key, cell);
  }
  const spots = [...cells.values()].sort((a, b) => b.pixels - a.pixels).slice(0, 6);
  return { seen, lit, spots };
}

type Lit = ReturnType<typeof litPixels>;

/** What of the forbidden cave shows lit (not what is seen out of its mouth or up its skylight). */
const litInCave = (read: SceneRead): Lit => litPixels(read, (i) => read.out[i] === 0);
/** What of the island shows lit: whatever is drawn (the sky is drawn only where nothing else is). */
const litOnIsland = (read: SceneRead): Lit => litPixels(read, (i) => read.where[i * 4 + 3] > 0);

/** How far off the see-through test looks at each opening: beyond where the houses' rooms are drawn (32 m,
 * see Props) and beyond where their full models give way to their light ones (75 m); beyond where the
 * forbidden cave's inside once stopped being drawn (45 m), and well beyond. And how much further than
 * with everything drawn a pixel has to look to be a hole: further than across any room. */
const SEE_THROUGH = { houses: [50, 90], cave: [50, 90, 140], hole: 6 };

/**
 * Views of every opening into something drawn only near, from beyond where it is (see seeThrough): the
 * forbidden cave's mouth from out on the beach, square on and from either side; its skylight from high
 * over it and from low on either side; and each house's doorways and windows from straight out of them.
 */
export function seeThroughViews(
  cave: ReturnType<DevApi['cave']>,
  houses: ReturnType<DevApi['houseOpenings']>,
): Record<string, StagedShot> {
  const views: Record<string, StagedShot> = {};
  const look = (position: [number, number, number], target: [number, number, number]): StagedShot => ({
    characters: {},
    camera: { position, target, fov: 30 },
    hour: 11,
  });
  const arch = cave?.info.arch;
  if (arch) {
    const [fx, fy, fz] = arch.foot;
    const target: [number, number, number] = [fx, fy + arch.height / 2, fz];
    const facing = Math.atan2(arch.facing[1], arch.facing[0]);
    for (const d of SEE_THROUGH.cave) {
      for (const side of [-35, 0, 35]) {
        const a = facing + (side * Math.PI) / 180;
        views[`mouth ${d}m ${side}deg`] = look([fx + Math.cos(a) * d, target[1] + 2 + d * 0.12, fz + Math.sin(a) * d], target);
      }
    }
  }
  const well = cave?.info.well;
  if (well) {
    const [x, y, z] = well.top;
    for (const d of SEE_THROUGH.cave) {
      for (const [up, around] of [[80, 0], [45, 0], [45, 180]]) {
        const e = (up * Math.PI) / 180;
        const a = (around * Math.PI) / 180;
        views[`skylight ${d}m ${up}deg up ${around}deg round`] = look(
          [x + Math.cos(e) * Math.cos(a) * d, y + Math.sin(e) * d, z + Math.cos(e) * Math.sin(a) * d],
          [x, y, z],
        );
      }
    }
  }
  houses.forEach((h, i) => {
    const [cx, cy, cz] = h.centre;
    const [ox, , oz] = h.out;
    for (const d of SEE_THROUGH.houses) views[`house opening ${i} ${d}m`] = look([cx + ox * d, cy + 1.5 + d * 0.08, cz + oz * d], [cx, cy, cz]);
  });
  return views;
}

export function installDevTools(api: DevApi): void {
  const ui = document.getElementById('ui');
  /** A dark test: each of `views` at each of `hours`, drawn with `dark` on and read back, and what
   * `lit` finds lit in it. Passes when it finds nothing lit in any. */
  const darkTest = (views: Record<string, StagedShot>, hours: number[], dark: (on: boolean) => void, lit: (read: SceneRead) => Lit) => {
    const found: Record<string, Lit> = {};
    for (const [name, view] of Object.entries(views)) {
      for (const hour of hours) {
        api.stage({ ...view, hour });
        dark(true);
        try {
          api.renderNow(0.6);
          found[`${name} ${hour}h`] = lit(api.readScene());
        } finally {
          dark(false);
        }
      }
    }
    api.release();
    if (ui) ui.style.display = '';
    const failed = Object.entries(found)
      .filter(([, v]) => v.lit > 0)
      .map(([k]) => k);
    return { pass: failed.length === 0, failed, views: found };
  };
  const tools = {
    /**
     * One character framed like the official character cards; yaw turns them (0 = facing the
     * camera) and a smaller fov zooms in.
     */
    portrait(id: string, yaw = 0, fov = 11) {
      api.stage({
        characters: { [id]: { x: 0, z: 0, yaw } },
        camera: { position: [0, 0.55, 7.5], target: [0, 0.5, 0], fov },
      });
      if (ui) ui.style.display = 'none';
      return `portrait ${id}`;
    },
    outfit(on: boolean) {
      api.setOutfit(on);
      return on ? 'outfit on' : 'outfit off';
    },
    shot(name: keyof typeof SHOTS | string) {
      const shot = SHOTS[name];
      if (!shot) throw new Error(`Unknown shot ${name}`);
      api.stage(shot);
      if (ui) ui.style.display = 'none';
      return `staged ${name}`;
    },
    release() {
      api.release();
      if (ui) ui.style.display = '';
      return 'released';
    },
    /**
     * Renders a frame and posts it to the capture receiver on port 5199. Rendering and
     * reading happen together, so the capture works even while the page is in the background.
     */
    async capture(name: string, settle = 0.6): Promise<string> {
      api.renderNow(settle);
      const url = api.canvas().toDataURL('image/png');
      try {
        const r = await fetch(`http://127.0.0.1:5199/save?name=${encodeURIComponent(name)}`, {
          method: 'POST',
          body: url,
        });
        return await r.text();
      } catch (e) {
        return `error: ${String(e)}`;
      }
    },
    /**
     * The forbidden cave's dark test: whether anything in the cave gives light of its own. Each of its
     * views (caveViews), at each of `hours` (by day and by night), is drawn with every light in the cave
     * put out (Cave.darkTest) and read back before the finishing passes. Whatever of the cave still
     * shows lit (not what is seen out of its mouth or up its skylight, which is the outside's) is light
     * from nowhere: `lit` counts its pixels and `spots` says where they are. Passes when every view has
     * lit 0. Run it after any change to how anything in the cave is drawn or lit.
     */
    caveDark(hours = [11, 23]) {
      const cave = api.cave();
      if (!cave) throw new Error('No forbidden cave on this island');
      return darkTest(caveViews(cave), hours, api.caveDark, litInCave);
    },
    /**
     * The island's dark test: whether anything on the island gives light of its own. Each of its views
     * (ISLAND_VIEWS), at each of `hours` (deep in the night, when its lights burn, and by day), is drawn
     * with every source of its light put out (Stage.darkTest: the sun and the moon, the sky's light, in
     * the air and on the sea, the hour's light on the cast, the island's lights, the cave's) and read
     * back before the finishing passes. Whatever is drawn and still shows lit is light from nowhere:
     * `lit` counts its pixels and `spots` says where they are (the sky, drawn only where nothing else is,
     * is not counted). Passes when every view has lit 0. Run it after any change to how anything on the
     * island is drawn or lit.
     */
    islandDark(hours = [22.5, 11]) {
      return darkTest(ISLAND_VIEWS, hours, api.islandDark, litOnIsland);
    },
    /**
     * The see-through test: whether anything drawn only near leaves a hole where it should show, as the
     * forbidden cave's mouth and skylight once showed the sky through the island from afar. Each opening
     * into something drawn only near (seeThroughViews; `only` keeps the views whose names start with it)
     * is looked at from beyond that distance and drawn twice, as the game draws it and with everything
     * drawn (DevApi.drawAll), and read back. A pixel that looks more than SEE_THROUGH.hole further as the
     * game draws it is a hole, onto what lies beyond (`holes`, and where: `box`, in the picture's pixels
     * from its top left); one that only differs is something left out in front of what is still there
     * behind it, such as a room's things beyond its doorway (`missing`). Passes when no view has a
     * hole. Run it after any change to what is drawn only near, or how near.
     */
    seeThrough(only = '') {
      const found: Record<string, { holes: number; missing: number; box: [number, number, number, number] | null }> = {};
      const views = Object.entries(seeThroughViews(api.cave(), api.houseOpenings())).filter(([name]) => name.startsWith(only));
      for (const [name, view] of views) {
        api.stage(view);
        api.renderNow(0.6);
        // A step with the camera where the view puts it decides what is drawn, as in play.
        api.renderNow(1 / 60);
        const shown = api.readScene();
        api.drawAll(true);
        let all: SceneRead;
        try {
          all = api.readScene();
        } finally {
          api.drawAll(false);
        }
        const [cx, cy, cz] = view.camera.position;
        const far = (where: Float32Array, i: number) =>
          where[i + 3] === 0 ? Infinity : Math.hypot(where[i] - cx, where[i + 1] - cy, where[i + 2] - cz);
        const { width, height } = shown;
        let holes = 0;
        let missing = 0;
        let box: [number, number, number, number] | null = null;
        for (let i = 0; i < shown.colour.length; i += 4) {
          const beyond = far(shown.where, i) - far(all.where, i);
          if (beyond > SEE_THROUGH.hole) {
            holes++;
            const x = (i / 4) % width;
            const y = height - 1 - Math.floor(i / 4 / width);
            box = box ? [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)] : [x, y, x, y];
          } else if (
            Math.abs(shown.colour[i] - all.colour[i]) + Math.abs(shown.colour[i + 1] - all.colour[i + 1]) +
              Math.abs(shown.colour[i + 2] - all.colour[i + 2]) > 0.02
          ) {
            missing++;
          }
        }
        found[name] = { holes, missing, box };
      }
      api.release();
      if (ui) ui.style.display = '';
      const failed = Object.entries(found)
        .filter(([, v]) => v.holes > 0)
        .map(([k]) => k);
      return { pass: failed.length === 0, failed, views: found };
    },
  };
  (window as unknown as { __dev: typeof tools }).__dev = tools;
}
