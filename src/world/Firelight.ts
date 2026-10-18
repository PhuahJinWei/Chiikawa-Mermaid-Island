import * as THREE from 'three';

/** How many real lights follow the firelight nearest the camera. */
const LIGHTS = 6;
/** No firelight further than this from the camera gets a real light, in metres. */
const REACH = 70;
/** Each kind of source: its colour, how bright, and how far its light reaches, in metres. */
const KINDS = {
  flame: { colour: new THREE.Color('#FF8A30'), intensity: 24, reach: 15, warmth: 1 },
  glow: { colour: new THREE.Color('#FFBE72'), intensity: 2.6, reach: 6.5, warmth: 0.45 },
} as const;
export type FireKind = keyof typeof KINDS;
/** How the firelight tints a character's colours at full strength: against the night's blue, a
 * warm cream on the side toward the fire, as the film's firelit faces. */
const WARM = new THREE.Color(2.9, 2.05, 1.1);

interface Source {
  position: THREE.Vector3;
  kind: FireKind;
  phase: number;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/**
 * Firelight after dark, in the film look: the torches' flames and the lit windows and lanterns
 * light what stands round them warm against the blue night, flickering, as the film's torches light
 * its village. The few sources nearest the camera each get a real light, which lights the ground,
 * plants, rocks and houses round them; characters are warmed by every source near them.
 */
export class Firelight {
  private readonly sources: Source[] = [];
  private readonly lights: THREE.PointLight[] = [];
  private readonly ranked: { source: Source; distance: number }[] = [];
  private glow = 0;
  private time = 0;

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < LIGHTS; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 1, 2);
      scene.add(light);
      this.lights.push(light);
    }
  }

  /** A flame or a glowing window or lantern at `position`. */
  add(position: THREE.Vector3, kind: FireKind): void {
    this.sources.push({ position: position.clone(), kind, phase: this.sources.length * 1.7 });
  }

  /** How bright a source burns this moment: a flame wavers, a lantern barely. */
  private flicker(s: Source): number {
    if (s.kind === 'glow') return 0.95 + 0.05 * Math.sin(this.time * 2.5 + s.phase);
    const t = this.time * 9 + s.phase;
    return 0.82 + 0.1 * Math.sin(t) + 0.08 * Math.sin(t * 2.7 + 1.3);
  }

  /** Moves the lights onto the sources nearest the camera; `glow` is how lit the island's lights
   * are (0 by day, 1 at night). */
  update(camera: THREE.Camera, glow: number, time: number): void {
    this.glow = glow;
    this.time = time;
    const ranked = this.ranked;
    ranked.length = 0;
    for (const source of this.sources) {
      const distance = source.position.distanceTo(camera.position);
      if (distance < REACH) ranked.push({ source, distance });
    }
    ranked.sort((a, b) => a.distance - b.distance);
    // A light fades out as its source nears the next one in line (or the reach), so moving the
    // lights from source to source never shows.
    const cut = ranked.length > LIGHTS ? ranked[LIGHTS].distance : REACH;
    this.lights.forEach((light, i) => {
      const entry = ranked[i];
      if (!entry || glow <= 0) {
        light.intensity = 0;
        return;
      }
      const kind = KINDS[entry.source.kind];
      light.position.copy(entry.source.position);
      light.color.copy(kind.colour);
      light.distance = kind.reach;
      const fade = smoothstep(0, 4, cut - entry.distance);
      light.intensity = kind.intensity * glow * this.flicker(entry.source) * fade;
    });
  }

  /** The firelight's warmth on a character at (x, y, z), as a tint to multiply their colours by:
   * white where none reaches. */
  warmth(x: number, y: number, z: number, out: THREE.Color): THREE.Color {
    out.setRGB(1, 1, 1);
    if (this.glow <= 0) return out;
    let w = 0;
    for (const s of this.sources) {
      const kind = KINDS[s.kind];
      const d = Math.hypot(s.position.x - x, s.position.y - y, s.position.z - z);
      if (d < kind.reach) w += (1 - d / kind.reach) ** 2 * kind.warmth * this.flicker(s);
    }
    w = Math.min(w, 1) * this.glow;
    return out.setRGB(1 + (WARM.r - 1) * w, 1 + (WARM.g - 1) * w, 1 + (WARM.b - 1) * w);
  }
}
