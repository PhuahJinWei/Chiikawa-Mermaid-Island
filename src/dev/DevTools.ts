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
