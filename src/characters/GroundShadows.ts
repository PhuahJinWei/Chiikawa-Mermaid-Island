import * as THREE from 'three';
import { FOG_FRAGMENT } from './CharacterMaterial';

/** How many shadows of each kind can be drawn at once: everyone on the island and more. */
const MOST = 128;

/** A soft round shadow under someone. */
function blobTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const c = canvas.getContext('2d');
  if (c) {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(60, 40, 30, 0.42)');
    g.addColorStop(0.6, 'rgba(60, 40, 30, 0.26)');
    g.addColorStop(1, 'rgba(60, 40, 30, 0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A shadow cast along the ground: darkest at its foot (the bottom of its picture, toward the
 * character), fading toward its far end and its sides. */
function castTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const c = canvas.getContext('2d');
  if (c) {
    const g = c.createRadialGradient(32, 54, 0, 32, 50, 58);
    g.addColorStop(0, 'rgba(60, 40, 30, 0.55)');
    g.addColorStop(0.5, 'rgba(60, 40, 30, 0.32)');
    g.addColorStop(1, 'rgba(60, 40, 30, 0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    // Soft at its sides.
    const sides = c.createLinearGradient(0, 0, 64, 0);
    sides.addColorStop(0, 'rgba(0, 0, 0, 0)');
    sides.addColorStop(0.3, 'rgba(0, 0, 0, 1)');
    sides.addColorStop(0.7, 'rgba(0, 0, 0, 1)');
    sides.addColorStop(1, 'rgba(0, 0, 0, 0)');
    c.globalCompositeOperation = 'destination-in';
    c.fillStyle = sides;
    c.fillRect(0, 0, 64, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * One kind of shadow, everyone's in one draw: each one's colour (the hour's light where they stand, see
 * Character.updateShadowAndProp) and how dark it is (aShade.x), and how much of the open air's light, the fog,
 * reaches them (aShade.y, their uOpenAir): none in the forbidden cave, which has its own light. (With the island's
 * fog, a shadow far off in the cave glowed faintly with its colour: found by the cave's dark test from the lake,
 * looking at the Siren on the ledge 30 m away, 2026-10-21.)
 */
function batch(map: THREE.Texture): { mesh: THREE.InstancedMesh; shade: THREE.InstancedBufferAttribute } {
  const material = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `attribute vec2 aShade;\nvarying vec2 vShade;\n${shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vShade = aShade;',
    )}`;
    shader.fragmentShader = `varying vec2 vShade;\n${shader.fragmentShader
      .replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\n  diffuseColor.a *= vShade.x;')
      .replace('#include <fog_fragment>', FOG_FRAGMENT.replace('uOpenAir', 'vShade.y'))}`;
  };
  const geometry = new THREE.PlaneGeometry(1, 1);
  const shade = new THREE.InstancedBufferAttribute(new Float32Array(MOST * 2), 2);
  shade.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aShade', shade);
  const mesh = new THREE.InstancedMesh(geometry, material, MOST);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color());
  (mesh.instanceColor as THREE.InstancedBufferAttribute).setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  // (Everyone's, wherever they are: not culled as one thing by where its first one is.)
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  return { mesh, shade };
}

interface Kept {
  /** Where the shadow lies, its colour and how dark it is (its material's), placed by its character. */
  mesh: THREE.Mesh;
  openAir: THREE.IUniform<number>;
}

const _m = new THREE.Matrix4();

/**
 * Everyone's shadows on the ground, drawn in two draws (the round ones under them, and those the firelight casts
 * after dark) instead of two each: some 60 draws fewer a frame at the feast (the user, 2026-10-24: the frame rate
 * dropping on a phone with many about). Each character keeps its shadows as meshes of its own, placed, tinted and
 * faded as before and shown and hidden with them, that are never drawn themselves (see keep); gather() copies them
 * into the two draws before each frame is drawn.
 */
export class GroundShadows {
  readonly group = new THREE.Group();
  private readonly kinds: { mesh: THREE.InstancedMesh; shade: THREE.InstancedBufferAttribute; kept: Kept[] }[];

  constructor() {
    this.kinds = [blobTexture(), castTexture()].map((map) => ({ ...batch(map), kept: [] }));
    for (const k of this.kinds) this.group.add(k.mesh);
  }

  /** A character's round shadow and the one the firelight casts, each a plane lying on the ground; `openAir` is
   * the character's own uOpenAir. Neither is drawn itself any more. */
  keep(blob: THREE.Mesh, cast: THREE.Mesh, openAir: THREE.IUniform<number>): void {
    [blob, cast].forEach((mesh, i) => {
      mesh.layers.disableAll();
      this.kinds[i].kept.push({ mesh, openAir });
    });
  }

  /** Every shadow shown into its kind's draw, as it lies now. */
  gather(): void {
    for (const k of this.kinds) {
      let n = 0;
      for (const { mesh, openAir } of k.kept) {
        if (n >= MOST || !shownInScene(mesh)) continue;
        const material = mesh.material as THREE.MeshBasicMaterial;
        mesh.updateMatrix();
        _m.multiplyMatrices((mesh.parent as THREE.Object3D).matrixWorld, mesh.matrix);
        k.mesh.setMatrixAt(n, _m);
        k.mesh.setColorAt(n, material.color);
        k.shade.setXY(n, material.opacity, openAir.value);
        n++;
      }
      k.mesh.count = n;
      k.mesh.instanceMatrix.needsUpdate = true;
      (k.mesh.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
      k.shade.needsUpdate = true;
    }
  }
}

/** Whether it is shown, and everything it is in, up to the scene. */
function shownInScene(o: THREE.Object3D): boolean {
  let at: THREE.Object3D | null = o;
  for (; at; at = at.parent) {
    if (!at.visible) return false;
    if ((at as THREE.Scene).isScene) return true;
  }
  return false;
}

let everyones: GroundShadows | null = null;

/** Everyone's (see Game: in the scene, gathered before each frame is drawn). */
export function groundShadows(): GroundShadows {
  return (everyones ??= new GroundShadows());
}
