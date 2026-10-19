/**
 * Development-only helpers for comparing the game against film frames.
 * Installed on window.__dev by main.ts when running `npm run dev`; never in production builds.
 *
 *   __dev.shot('frame14')      stage the shot that matches reference frame 14
 *   __dev.capture('name')      save the canvas through the local capture receiver
 *   __dev.release()            return to normal play
 */
import type { ActionId } from '../characters/Actions';
import type { CharacterId, ExpressionId } from '../characters/types';

export interface StagedCharacter {
  x: number;
  z: number;
  yaw: number;
  expression?: ExpressionId | null;
  action?: ActionId;
}

export interface StagedShot {
  characters: Partial<Record<CharacterId, StagedCharacter>>;
  /** Background islanders: x, z, facing. */
  crowd?: [number, number, number][];
  camera: { position: [number, number, number]; target: [number, number, number]; fov: number };
  /** The time of day, in hours past midnight; late morning when left out. */
  hour?: number;
}

export interface DevApi {
  stage(shot: StagedShot): void;
  release(): void;
  setOutfit(on: boolean): void;
  renderNow(settle?: number): void;
  canvas(): HTMLCanvasElement;
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
  // The film's frame of the forbidden cave by night (`cave entrance 1`): from down the beach, the sea
  // on the left, the spur running in from it with the cave's mouth at its foot, palms on the right.
  cave: {
    characters: {},
    camera: { position: [-190, 1.6, -70], target: [-183, 2.5, -108], fov: 50 },
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

export function installDevTools(api: DevApi): void {
  const ui = document.getElementById('ui');
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
  };
  (window as unknown as { __dev: typeof tools }).__dev = tools;
}
