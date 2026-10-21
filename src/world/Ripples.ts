import * as THREE from 'three';

/**
 * Rings left in water by whoever wades in it (the island's sea and pool, the forbidden cave's): each
 * stays where it was made, spreading and fading there as a real ring does, while whoever made it walks
 * on and turns. (Rings drawn each frame round where they stood, pushed back along the way they were
 * going, swung round after them as they turned.) The boat keeps its own the same way (Boat.update).
 */

/** A ring left by whoever wades: how long it spreads before it is gone (seconds), how far out it spreads
 * (metres), and how often they leave one, so that three are out round each of them at once. */
const WADE_LIFE = 2.5;
const WADE_SPREAD = 1.1;
const WADE_EVERY = WADE_LIFE / 3;
/** How far a ring's band and the foam round whoever wades reach at most past their lines (metres), for
 * how far round them the shader looks. */
const RING_BAND = 0.06;
const COLLAR_REACH = 0.12;

/** A slot for one who wades: whose it is (null: free), whether they wade this frame, when they next
 * leave a ring and which of their three rings they leave next. */
interface Slot {
  who: object | null;
  wading: boolean;
  next: number;
  ring: number;
}

/** The foam whoever wades in some water makes in it, for its shader (wadeGlsl), room for `count` of them
 * at once. Each frame: begin, wade for each of them, end. */
export class WadeRings {
  /**
   * For the shader: the foam round each of them now (where they stand, x and z, how far round them the
   * water meets them, and how much of it there is, 0 for none); round them and all their rings (where,
   * x and z, how far, squared, below 0 for nothing there; and how far round them their rings start);
   * and each of their rings, three apiece (where it was made, x and z, when, and how much of it there is).
   */
  readonly uniforms: { uWaders: { value: THREE.Vector4[] }; uWaderWays: { value: THREE.Vector4[] }; uWaderRings: { value: THREE.Vector4[] } };
  private readonly slots: Slot[];

  constructor(count: number) {
    this.uniforms = {
      uWaders: { value: Array.from({ length: count }, () => new THREE.Vector4()) },
      uWaderWays: { value: Array.from({ length: count }, () => new THREE.Vector4(0, 0, -1, 0)) },
      uWaderRings: { value: Array.from({ length: count * 3 }, () => new THREE.Vector4(0, 0, -1e9, 0)) },
    };
    this.slots = Array.from({ length: count }, () => ({ who: null, wading: false, next: 0, ring: 0 }));
  }

  begin(): void {
    for (const s of this.slots) s.wading = false;
  }

  /**
   * `who` wades at (x, z) this frame, the water meeting them `radius` round them, `much` of their foam
   * (0 to 1, by how deep in it they are), at `time` by the water's own clock (its shader's uTime). They
   * keep a slot of their own while they wade and while their rings are out; with none free, they leave
   * none. Every so often a ring where they are now, at once if the clock has been put back.
   */
  wade(who: object, x: number, z: number, radius: number, much: number, time: number): void {
    let i = this.slots.findIndex((s) => s.who === who);
    if (i < 0) i = this.slots.findIndex((s) => s.who === null);
    if (i < 0) return;
    const s = this.slots[i];
    s.who = who;
    s.wading = true;
    this.uniforms.uWaders.value[i].set(x, z, radius, much);
    this.uniforms.uWaderWays.value[i].w = radius + 0.08;
    if (time >= s.next || s.next - time > WADE_EVERY) {
      this.uniforms.uWaderRings.value[i * 3 + s.ring].set(x, z, time, much);
      s.ring = (s.ring + 1) % 3;
      s.next = time + WADE_EVERY;
    }
  }

  /** The foam goes from round whoever waded no more, their rings left to spread out; a slot is free again
   * once its rings are gone; and how far round each the shader looks. */
  end(time: number): void {
    const { uWaders, uWaderWays, uWaderRings } = this.uniforms;
    this.slots.forEach((s, i) => {
      const collar = uWaders.value[i];
      const way = uWaderWays.value[i];
      if (!s.wading) collar.w = 0;
      _circles.length = 0;
      if (collar.w > 0) _circles.push(collar.x, collar.y, collar.z + COLLAR_REACH);
      for (let k = 0; k < 3; k++) {
        const r = uWaderRings.value[i * 3 + k];
        const age = (time - r.z) / WADE_LIFE;
        if (age >= 0 && age < 1) _circles.push(r.x, r.y, way.w + age * WADE_SPREAD + RING_BAND);
      }
      if (_circles.length) {
        coverCircles(_circles, way);
      } else {
        way.z = -1;
        if (!s.wading) s.who = null;
      }
    });
  }
}

const _circles: number[] = [];

/** Round circles given as x, z and radius in threes: sets out's x and y to a middle for them and out's z
 * to the square of how far from it they reach (its w is left as it is). */
export function coverCircles(circles: number[], out: THREE.Vector4): void {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (let j = 0; j < circles.length; j += 3) {
    x0 = Math.min(x0, circles[j] - circles[j + 2]);
    x1 = Math.max(x1, circles[j] + circles[j + 2]);
    z0 = Math.min(z0, circles[j + 1] - circles[j + 2]);
    z1 = Math.max(z1, circles[j + 1] + circles[j + 2]);
  }
  const x = (x0 + x1) / 2;
  const z = (z0 + z1) / 2;
  let reach = 0;
  for (let j = 0; j < circles.length; j += 3) reach = Math.max(reach, Math.hypot(circles[j] - x, circles[j + 1] - z) + circles[j + 2]);
  out.x = x;
  out.y = z;
  out.z = reach * reach;
}

/**
 * The foam of a water's shader, for `count` who wade at once (WadeRings): ringOfFoam, one ring spreading;
 * and wadeFoam, all the foam whoever wades makes at p on the water at time t (its uTime), 0 to 1.
 */
export function wadeGlsl(count: number): string {
  return /* glsl */ `
    uniform vec4 uWaders[${count}];
    uniform vec4 uWaderWays[${count}];
    uniform vec4 uWaderRings[${count * 3}];
    // A ring of foam spreading out from at to radius r, broken into arcs as it spreads (k and seed turn
    // the breaks), fading as it ages (age, 0 to 1). Off its band there is nothing to work out.
    float ringOfFoam(vec2 p, vec2 at, float r, float age, float k, float seed) {
      vec2 rel = p - at;
      float off = abs(length(rel) - r);
      float width = 0.025 + 0.03 * age;
      if (off >= width) return 0.0;
      float band = 1.0 - smoothstep(0.0, width, off);
      float around = atan(rel.y, rel.x);
      float broken = smoothstep(-0.3, 0.6, sin(around * 3.0 + k * 2.3 + seed * 6.3) + 0.6 * sin(around * 7.0 - k));
      return band * broken * pow(1.0 - age, 2.5);
    }
    // Round whoever wades: foam hugging them where the water meets them, broken a little, and the rings
    // they have left, each spreading where it was made.
    float wadeFoam(vec2 p, float t) {
      float ring = 0.0;
      for (int i = 0; i < ${count}; i++) {
        vec4 way = uWaderWays[i];
        vec2 off = p - way.xy;
        if (dot(off, off) >= way.z) continue;
        vec4 w = uWaders[i];
        vec2 o = p - w.xy;
        float near = length(o) - w.z;
        if (w.w > 0.0 && near >= -0.05 && near < 0.12) {
          float a = atan(o.y, o.x);
          float collar = 1.0 - smoothstep(0.02, 0.08 + 0.03 * sin(a * 5.0 + t * 3.0 + float(i) * 2.1), near);
          ring = max(ring, collar * 0.9 * w.w);
        }
        for (int k = 0; k < 3; k++) {
          vec4 r = uWaderRings[i * 3 + k];
          float age = (t - r.z) / ${WADE_LIFE.toFixed(1)};
          if (age < 0.0 || age >= 1.0) continue;
          ring = max(ring, ringOfFoam(p, r.xy, way.w + age * ${WADE_SPREAD.toFixed(2)}, age, float(k), fract(r.z * 0.618)) * 0.6 * r.w);
        }
      }
      return ring;
    }`;
}
