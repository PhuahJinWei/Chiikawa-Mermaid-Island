import * as THREE from 'three';

export interface JoystickView {
  show(x: number, y: number): void;
  move(dx: number, dy: number): void;
  hide(): void;
  /** Shows whether the stick sprints now (see Input.sprint). */
  sprint(on: boolean): void;
}

const RADIUS = 56;
const DEAD_ZONE = 0.12;
/** The stick held out at its edge (this share of its reach or more) this long (seconds) breaks into a sprint, kept
 * till it is eased back in past SPRINT_KEEP (the user, 2026-10-23). */
const SPRINT_EDGE = 0.97;
const SPRINT_HOLD = 0.8;
const SPRINT_KEEP = 0.85;

/**
 * Touch: a joystick appears wherever the left half is touched (held at its edge a moment, it sprints); dragging
 * the right half turns the camera, two fingers there pinch to zoom.
 * Desktop: WASD or arrows run, with Shift sprint, Space jumps, drag and wheel for the camera; E acts, F uses
 * what you hold, Tab and 1 to 6 the pouch, R the きもち panel (1 to 9 then pick from it).
 */
export class Input {
  readonly move = new THREE.Vector2();
  /** Whether you sprint: Shift held as you go, or the stick held at its edge a moment (see SPRINT_HOLD). */
  sprint = false;
  onFirstMove: (() => void) | null = null;

  private moveEnabled = true;
  private readonly look = new THREE.Vector2();
  private zoom = 0;
  private jumpQueued = false;
  /** Whether the jump button is held down (see holdJump). */
  private jumpButton = false;
  private actionQueued = false;
  private useQueued = false;
  /** A pouch slot asked for from the keyboard (1 to 6), or with the きもち panel open what to do (1 to 9);
   * or -1. */
  private slotQueued = -1;
  private pouchQueued = false;
  private emotesQueued = false;
  private joyId: number | null = null;
  private readonly joyOrigin = new THREE.Vector2();
  private readonly joyVec = new THREE.Vector2();
  /** How long the stick has been held at its edge (seconds; see SPRINT_HOLD). */
  private edgeFor = 0;
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
      this.jumpButton = false;
    });
  }

  update(dt: number): void {
    let kx = 0;
    let ky = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) kx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) kx += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) ky += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) ky -= 1;
    let sprint = false;
    if (kx || ky) {
      this.move.set(kx, ky).normalize();
      sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      this.edgeFor = 0;
    } else {
      const len = this.joyVec.length();
      if (len < DEAD_ZONE) this.move.set(0, 0);
      else this.move.copy(this.joyVec).multiplyScalar(Math.min(1, (len - DEAD_ZONE) / (1 - DEAD_ZONE)) / len);
      if (len >= SPRINT_EDGE) this.edgeFor += dt;
      else if (!(this.sprint && len >= SPRINT_KEEP)) this.edgeFor = 0;
      sprint = this.edgeFor >= SPRINT_HOLD;
    }
    if (!this.moveEnabled) {
      this.move.set(0, 0);
      sprint = false;
      this.edgeFor = 0;
    }
    if (sprint !== this.sprint) {
      this.sprint = sprint;
      this.joystick.sprint(sprint);
    }
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

  /** The jump button pressed (it jumps, see queueJump) or let go of. */
  holdJump(on: boolean): void {
    this.jumpButton = on;
  }

  /** Whether the jump is held down, Space or the jump button: held as you rise, you jump higher (see
   * Character.jumpHeld). */
  get jumpHeld(): boolean {
    return this.jumpButton || this.keys.has('Space');
  }

  consumeJump(): boolean {
    const j = this.jumpQueued;
    this.jumpQueued = false;
    return j;
  }

  /** The action button (or E, or Enter): get into the boat, get out of it. */
  queueAction(): void {
    this.actionQueued = true;
  }

  consumeAction(): boolean {
    const a = this.actionQueued;
    this.actionQueued = false;
    return a;
  }

  /** The use button (or F): eat, drink or play what you hold. */
  queueUse(): void {
    this.useQueued = true;
  }

  consumeUse(): boolean {
    const u = this.useQueued;
    this.useQueued = false;
    return u;
  }

  /** A number from the keyboard's 1 to 9 (0 to 8): a pouch slot, or what to do from the きもち panel; or -1. */
  consumeSlot(): number {
    const s = this.slotQueued;
    this.slotQueued = -1;
    return s;
  }

  /** The pouch opened or shut from the keyboard (Tab). */
  consumePouch(): boolean {
    const p = this.pouchQueued;
    this.pouchQueued = false;
    return p;
  }

  /** The きもち panel opened or shut from the keyboard (R). */
  consumeEmotes(): boolean {
    const e = this.emotesQueued;
    this.emotesQueued = false;
    return e;
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
    if ((e.code === 'KeyE' || e.code === 'Enter') && !e.repeat) this.actionQueued = true;
    if (e.code === 'KeyF' && !e.repeat) this.useQueued = true;
    if (/^Digit[1-9]$/.test(e.code) && !e.repeat) this.slotQueued = Number(e.code.slice(5)) - 1;
    if (e.code === 'KeyR' && !e.repeat) this.emotesQueued = true;
    if (e.code === 'Tab') {
      e.preventDefault();
      if (!e.repeat) this.pouchQueued = true;
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
