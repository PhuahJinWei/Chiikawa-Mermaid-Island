import * as THREE from 'three';

export interface JoystickView {
  show(x: number, y: number): void;
  move(dx: number, dy: number): void;
  hide(): void;
}

const RADIUS = 56;
const DEAD_ZONE = 0.12;

/**
 * Touch: a joystick appears wherever the left half is touched; dragging the right
 * half turns the camera, two fingers there pinch to zoom.
 * Desktop: WASD or arrows (Shift walks), Space jumps, drag and wheel for the camera.
 */
export class Input {
  readonly move = new THREE.Vector2();
  onFirstMove: (() => void) | null = null;

  private moveEnabled = true;
  private readonly look = new THREE.Vector2();
  private zoom = 0;
  private jumpQueued = false;
  private joyId: number | null = null;
  private readonly joyOrigin = new THREE.Vector2();
  private readonly joyVec = new THREE.Vector2();
  private readonly lookPointers = new Map<number, THREE.Vector2>();
  private pinchDistance = 0;
  private readonly keys = new Set<string>();

  constructor(
    private readonly el: HTMLElement,
    private readonly joystick: JoystickView,
  ) {
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.lookPointers.clear();
      this.releaseJoystick();
    });
  }

  update(): void {
    let kx = 0;
    let ky = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) kx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) kx += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) ky += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) ky -= 1;
    if (kx || ky) {
      const slow = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      this.move.set(kx, ky).normalize().multiplyScalar(slow ? 0.5 : 1);
    } else {
      const len = this.joyVec.length();
      if (len < DEAD_ZONE) this.move.set(0, 0);
      else this.move.copy(this.joyVec).multiplyScalar(Math.min(1, (len - DEAD_ZONE) / (1 - DEAD_ZONE)) / len);
    }
    if (!this.moveEnabled) this.move.set(0, 0);
    if (this.onFirstMove && this.move.lengthSq() > 0) {
      this.onFirstMove();
      this.onFirstMove = null;
    }
  }

  setMoveEnabled(on: boolean): void {
    this.moveEnabled = on;
    if (!on) this.releaseJoystick();
  }

  /** Whether a key is held down, by its code ('KeyE', 'ShiftLeft'...). */
  held(code: string): boolean {
    return this.keys.has(code);
  }

  consumeLook(out: THREE.Vector2): THREE.Vector2 {
    out.copy(this.look);
    this.look.set(0, 0);
    return out;
  }

  consumeZoom(): number {
    const z = this.zoom;
    this.zoom = 0;
    return z;
  }

  queueJump(): void {
    this.jumpQueued = true;
  }

  consumeJump(): boolean {
    const j = this.jumpQueued;
    this.jumpQueued = false;
    return j;
  }

  private onDown = (e: PointerEvent) => {
    e.preventDefault();
    const rect = this.el.getBoundingClientRect();
    const leftHalf = e.clientX - rect.left < rect.width * 0.5;
    if (leftHalf && this.moveEnabled && this.joyId === null) {
      this.joyId = e.pointerId;
      this.joyOrigin.set(e.clientX, e.clientY);
      this.joyVec.set(0, 0);
      this.joystick.show(e.clientX, e.clientY);
    } else if (this.lookPointers.size < 2) {
      this.lookPointers.set(e.pointerId, new THREE.Vector2(e.clientX, e.clientY));
      if (this.lookPointers.size === 2) this.pinchDistance = this.pointerSpread();
    } else {
      return;
    }
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      // Capture is best-effort; synthetic events cannot be captured.
    }
  };

  private onMove = (e: PointerEvent) => {
    if (e.pointerId === this.joyId) {
      let dx = e.clientX - this.joyOrigin.x;
      let dy = e.clientY - this.joyOrigin.y;
      const len = Math.hypot(dx, dy);
      if (len > RADIUS) {
        dx *= RADIUS / len;
        dy *= RADIUS / len;
      }
      this.joyVec.set(dx / RADIUS, -dy / RADIUS);
      this.joystick.move(dx, dy);
      return;
    }
    const p = this.lookPointers.get(e.pointerId);
    if (!p) return;
    if (this.lookPointers.size === 1) {
      this.look.x += e.clientX - p.x;
      this.look.y += e.clientY - p.y;
    }
    p.set(e.clientX, e.clientY);
    if (this.lookPointers.size === 2) {
      const d = this.pointerSpread();
      this.zoom += (this.pinchDistance - d) * 2.5;
      this.pinchDistance = d;
    }
  };

  private onUp = (e: PointerEvent) => {
    if (e.pointerId === this.joyId) this.releaseJoystick();
    this.lookPointers.delete(e.pointerId);
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoom += e.deltaY;
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    this.keys.add(e.code);
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) this.jumpQueued = true;
    }
  };

  private releaseJoystick(): void {
    if (this.joyId === null) return;
    this.joyId = null;
    this.joyVec.set(0, 0);
    this.joystick.hide();
  }

  private pointerSpread(): number {
    const [a, b] = [...this.lookPointers.values()];
    return a && b ? a.distanceTo(b) : 0;
  }
}
