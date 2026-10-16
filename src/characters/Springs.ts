/** Damped spring for squishy follow-through. Frequency in Hz, damping ratio 0..1. */
export class Spring {
  value: number;
  velocity = 0;

  constructor(
    public frequency: number,
    public damping: number,
    initial = 0,
  ) {
    this.value = initial;
  }

  update(target: number, dt: number): number {
    const w = 2 * Math.PI * this.frequency;
    const k = w * w;
    const c = 2 * this.damping * w;
    const steps = Math.max(1, Math.ceil(dt * 240));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = -k * (this.value - target) - c * this.velocity;
      this.velocity += a * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }
}
