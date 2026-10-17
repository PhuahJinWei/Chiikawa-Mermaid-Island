import * as THREE from 'three';
import { FILM, paintedRamp } from '../world/Look';

let ramp: THREE.DataTexture | null = null;

/** The light ramp for scenery: the toon's three steps, or the film look's soft ramp. */
export function sceneryRamp(): THREE.DataTexture {
  return FILM ? paintedRamp() : toonRamp();
}

/** Three-step light ramp shared by every toon-shaded environment material. */
export function toonRamp(): THREE.DataTexture {
  if (!ramp) {
    const data = new Uint8Array([150, 210, 255]);
    ramp = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
    ramp.minFilter = THREE.NearestFilter;
    ramp.magFilter = THREE.NearestFilter;
    ramp.generateMipmaps = false;
    ramp.needsUpdate = true;
  }
  return ramp;
}
