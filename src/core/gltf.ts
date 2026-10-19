import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Loads a model. The Blender build scripts compress every model with Draco (DRACO in
 * art/blender/charlib.py), which three.js's decoder in public/draco/ (copied from
 * three/examples/jsm/libs/draco/gltf/) unpacks in workers. The workers hold memory a phone needs,
 * so they are let go once nothing has loaded for a few seconds, and start again for the next model.
 */
const loader = new GLTFLoader();
let draco: DRACOLoader | null = null;
let loading = 0;
let idle = 0;

export async function loadGltf(url: string): Promise<GLTF> {
  if (!draco) {
    draco = new DRACOLoader().setDecoderPath('draco/');
    loader.setDRACOLoader(draco);
  }
  loading++;
  clearTimeout(idle);
  try {
    return await loader.loadAsync(url);
  } finally {
    loading--;
    if (loading === 0) {
      idle = window.setTimeout(() => {
        draco?.dispose();
        draco = null;
      }, 3000);
    }
  }
}
