import * as THREE from 'three';

let ramp: THREE.DataTexture | null = null;

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
