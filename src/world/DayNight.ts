import * as THREE from 'three';

/** One game hour lasts this many real seconds: a whole day in 24 minutes. */
export const SECONDS_PER_HOUR = 60;
/** The hour the island wakes to when the game opens. */
const START_HOUR = 10;

/** The island's clock: hours since midnight, running at a game hour per real minute. */
export class Clock {
  hours = START_HOUR;
  running = true;

  advance(dt: number): void {
    if (this.running) this.hours = (this.hours + dt / SECONDS_PER_HOUR) % 24;
  }

  set(hours: number): void {
    this.hours = ((hours % 24) + 24) % 24;
  }

  /** The time as the player reads it, 24-hour: 7:05, 18:30. */
  label(): string {
    const h = Math.floor(this.hours);
    const m = Math.floor((this.hours - h) * 60);
    return `${h}:${String(m).padStart(2, '0')}`;
  }
}

/** How the island looks at one moment of the day. */
export interface SkyLook {
  /** The sky's colour overhead and at the horizon (also the haze's). */
  top: THREE.Color;
  horizon: THREE.Color;
  /** Laid over everything drawn without the scene's lights: the ground, characters, the pen. */
  ambient: THREE.Color;
  /** The sun's light by day, the moon's by night, and the soft light from sky and ground. */
  light: THREE.Color;
  lightIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  /** Laid over the clouds' colours, and the sea's. */
  cloud: THREE.Color;
  sea: THREE.Color;
  /** 0 by day, 1 at night: stars, the moon and its road on the sea. */
  night: number;
  /** 0 by day, 1 once the festival's lights are lit at dusk. */
  glow: number;
  /** Directions to the sun and the moon, and to whichever of them gives the light. */
  sunDir: THREE.Vector3;
  moonDir: THREE.Vector3;
  lightDir: THREE.Vector3;
}

interface Key {
  top: string;
  horizon: string;
  ambient: [number, number, number];
  light: string;
  lightIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  cloud: [number, number, number];
  sea: [number, number, number];
  night: number;
}

// After the film's palette: bright turquoise-and-green days, a warm golden afternoon, orange and
// pink at sunset, a cool steel-blue dusk, royal-blue moonlit nights, measured on the film's
// moonlit beach (STYLE_GUIDE.md, section 5). By night the moon lights the land from one side, and
// the sky's light, though low, lights what the moon does not enough to show its shapes (in the
// jungle's shade and in the gorge), as the film's night frames do; the colour grade paints it all in
// the night's blue (see Look.ts).
const NIGHT: Key = {
  top: '#1247A4', horizon: '#1653A4', ambient: [0.32, 0.38, 0.64], light: '#B2C6FF', lightIntensity: 1.4,
  hemiSky: '#3A5296', hemiGround: '#141A36', hemiIntensity: 1.0, cloud: [0.03, 0.08, 0.3], sea: [0.14, 0.18, 0.44], night: 1,
};
const BLUE: Key = {
  top: '#38559A', horizon: '#8698C2', ambient: [0.6, 0.64, 0.86], light: '#9FB6EA', lightIntensity: 1.0,
  hemiSky: '#7084BC', hemiGround: '#2F3A5A', hemiIntensity: 0.8, cloud: [0.4, 0.47, 0.72], sea: [0.42, 0.47, 0.72], night: 0.6,
};
const DAWN: Key = {
  top: '#6E8BCB', horizon: '#F7C4A4', ambient: [0.94, 0.84, 0.86], light: '#FFC9A2', lightIntensity: 1.7,
  hemiSky: '#CBD8F0', hemiGround: '#E3B391', hemiIntensity: 1.3, cloud: [1.0, 0.86, 0.86], sea: [0.86, 0.84, 0.92], night: 0.2,
};
const DAY: Key = {
  top: '#3FA9F2', horizon: '#BDE6F8', ambient: [1, 1, 1], light: '#FFF4E2', lightIntensity: 2.4,
  hemiSky: '#DDF3FF', hemiGround: '#EBC48F', hemiIntensity: 1.6, cloud: [1, 1, 1], sea: [1, 1, 1], night: 0,
};
const GOLDEN: Key = {
  top: '#6EAFDC', horizon: '#F7D38A', ambient: [1.0, 0.88, 0.72], light: '#FFC774', lightIntensity: 2.6,
  hemiSky: '#F3E2AE', hemiGround: '#EBC48F', hemiIntensity: 1.5, cloud: [1.0, 0.9, 0.72], sea: [1.0, 0.93, 0.82], night: 0,
};
const DUSK: Key = {
  top: '#6A6EBE', horizon: '#F59C70', ambient: [0.95, 0.76, 0.72], light: '#FF9F6C', lightIntensity: 1.7,
  hemiSky: '#BBA8D8', hemiGround: '#D9906C', hemiIntensity: 1.2, cloud: [1.0, 0.78, 0.74], sea: [0.62, 0.5, 0.62], night: 0.3,
};
const KEYS: [number, Key][] = [
  [0, NIGHT], [4.6, NIGHT], [5.6, DAWN], [7.2, DAY], [15.0, DAY], [16.6, GOLDEN], [18.0, DUSK], [18.75, BLUE],
  [19.6, NIGHT], [24, NIGHT],
];

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

const _a = new THREE.Color();
const _b = new THREE.Color();

function mixColour(out: THREE.Color, a: string, b: string, t: number): void {
  out.copy(_a.set(a)).lerp(_b.set(b), t);
}

function mixTriple(out: THREE.Color, a: [number, number, number], b: [number, number, number], t: number): void {
  out.setRGB(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
}

/** Where a body crossing the sky is at an angle round its path: rising in the east, highest in the
 * south, its height following the angle's sine raised to `climb` (above 1 it climbs slowly at first
 * and quickly toward its highest). */
function across(angle: number, highest: number, out: THREE.Vector3, climb = 1): THREE.Vector3 {
  const s = Math.sin(angle);
  const e = Math.sign(s) * Math.abs(s) ** climb * highest;
  return out.set(Math.cos(angle) * Math.cos(e), Math.sin(e), Math.sin(angle) * Math.cos(e)).normalize();
}

/**
 * The full moon's path: it climbs slowly through the evening, so the early night is lit from as low
 * as it always was (37 degrees up at 21:00), then rides high, 75 degrees up in the south at
 * midnight, across the forbidden cave's skylight: from the lake under it, the skylight's well shows
 * the sky above 55 degrees, so the moon passes over it from about 22:10 to 1:50.
 */
const MOON_HIGHEST = THREE.MathUtils.degToRad(75);
const MOON_CLIMB = 2;
/** How big the full moon is in the sky: its radius, in radians (the film paints it large). */
export const MOON_RADIUS = 0.06;
/** And the sun's. */
export const SUN_RADIUS = 0.045;

export function newSkyLook(): SkyLook {
  return {
    top: new THREE.Color(), horizon: new THREE.Color(), ambient: new THREE.Color(), light: new THREE.Color(),
    lightIntensity: 1, hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), hemiIntensity: 1,
    cloud: new THREE.Color(), sea: new THREE.Color(), night: 0, glow: 0,
    sunDir: new THREE.Vector3(), moonDir: new THREE.Vector3(), lightDir: new THREE.Vector3(),
  };
}

/** How the island looks at `hours` past midnight. */
export function skyAt(hours: number, out: SkyLook): SkyLook {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1][0] <= hours) i++;
  const [h0, a] = KEYS[i];
  const [h1, b] = KEYS[i + 1];
  const t = smoothstep(0, 1, (hours - h0) / (h1 - h0));
  mixColour(out.top, a.top, b.top, t);
  mixColour(out.horizon, a.horizon, b.horizon, t);
  mixTriple(out.ambient, a.ambient, b.ambient, t);
  mixColour(out.light, a.light, b.light, t);
  out.lightIntensity = a.lightIntensity + (b.lightIntensity - a.lightIntensity) * t;
  mixColour(out.hemiSky, a.hemiSky, b.hemiSky, t);
  mixColour(out.hemiGround, a.hemiGround, b.hemiGround, t);
  out.hemiIntensity = a.hemiIntensity + (b.hemiIntensity - a.hemiIntensity) * t;
  mixTriple(out.cloud, a.cloud, b.cloud, t);
  mixTriple(out.sea, a.sea, b.sea, t);
  out.night = a.night + (b.night - a.night) * t;
  // The festival's lights come on through dusk, and go out with the dawn.
  out.glow = Math.max(smoothstep(17.6, 18.8, hours), 1 - smoothstep(5.4, 6.6, hours));
  // The sun rises at six in the east and sets at six in the west; the full moon opposite (see
  // MOON_HIGHEST).
  const sunAngle = (Math.PI * (hours - 6)) / 12;
  across(sunAngle, THREE.MathUtils.degToRad(68), out.sunDir);
  across(sunAngle + Math.PI, MOON_HIGHEST, out.moonDir, MOON_CLIMB);
  // By day the light comes from the sun; as it sets, it passes to the moon.
  out.lightDir.copy(out.moonDir).lerp(out.sunDir, smoothstep(-0.06, 0.12, out.sunDir.y));
  if (out.lightDir.y < 0.15) out.lightDir.y = 0.15;
  out.lightDir.normalize();
  return out;
}
