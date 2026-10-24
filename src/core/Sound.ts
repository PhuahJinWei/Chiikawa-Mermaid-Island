/**
 * The island's sound (the user, 2026-10-22), all of it made as it plays (Web Audio), nothing recorded: the
 * sea's waves as near as the shore is, the wind in the leaves and the birds by day, the crickets at night,
 * the waterfall, the festival's murmur, the feast's fire crackling; your footsteps on sand, wood, grass or
 * in the water; Rakko's ukulele at the feast (a tune of the game's own) and yours when you play it; a hum
 * from the sea at night where the Siren lurks; and the little sounds of what you do with your paws. It
 * starts with your first touch or key (browsers let a page sound only after one), and can be turned off
 * (the speaker button by the きもち button), which is kept.
 */

/** What the island sounds like where you are this frame (see Sound.update). */
export interface Hearing {
  /** Seconds since the last frame, and the island's hour. */
  dt: number;
  hours: number;
  /** How near the sea is (0 far inland, 1 on the shore), the waterfall, the feast's fire (lit), the
   * festival's street (its stalls open), and how deep in the jungle you are, each 0 to 1. */
  shore: number;
  fall: number;
  fire: number;
  festival: number;
  jungle: number;
  /** In the forbidden cave. */
  cave: boolean;
  /** How near Rakko is, playing at the feast (0 not playing or far), and whether you are playing. */
  ukulele: number;
  strumming: boolean;
  /** How near the Siren lurking at sea (0 not lurking, or far, or sunk). */
  siren: number;
  /** A step you took this frame, on what (null: none). */
  step: 'sand' | 'grass' | 'wood' | 'water' | null;
}

const KEY = 'mermaid-island:sound';
/** How loud everything is together. */
const MASTER = 0.55;
/** Rakko's tune at the feast (MIDI note numbers, 0 a rest), a beat each, and how fast (beats a minute). */
const TUNE = [67, 69, 72, 69, 67, 64, 62, 0, 64, 67, 69, 72, 74, 72, 69, 0, 72, 74, 76, 74, 72, 69, 67, 0, 69, 67, 64, 62, 60, 0, 60, 0];
const TEMPO = 96;
/** The chords you strum, in turn, each a strum (MIDI notes, a ukulele's four strings low to high). */
const CHORDS = [
  [67, 60, 64, 72],
  [67, 62, 67, 71],
  [69, 64, 69, 72],
  [65, 60, 65, 69],
];
const STRUM = 0.9;

const hz = (note: number) => 440 * 2 ** ((note - 69) / 12);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A looping noise through filters into a gain we turn up and down: one of the beds of sound. */
interface Bed {
  gain: GainNode;
  level: number;
}

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly beds = new Map<string, Bed>();
  private readonly plucks = new Map<number, AudioBuffer>();
  private on: boolean;
  private time = 0;
  private nextBird = 2;
  private nextChirp = 0;
  private nextCrackle = 0;
  private beat = 0;
  private strumAt = 0;
  private chord = 0;
  private sirenVoice: { gain: GainNode; osc: OscillatorNode[] } | null = null;

  constructor() {
    let on = true;
    try {
      on = localStorage.getItem(KEY) !== 'off';
    } catch {
      // No storage: on.
    }
    this.on = on;
    const start = () => {
      this.start();
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
    };
    window.addEventListener('pointerdown', start);
    window.addEventListener('keydown', start);
  }

  get enabled(): boolean {
    return this.on;
  }

  setOn(on: boolean): void {
    this.on = on;
    try {
      localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch {
      // Not kept.
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? MASTER : 0, this.ctx.currentTime, 0.2);
  }

  /** Lets the page sound (after a touch or key) and lays out its beds of sound. */
  private start(): void {
    if (this.ctx) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.on ? MASTER : 0;
    this.master.connect(ctx.destination);
    // Two seconds of noise, looped by every bed.
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < data.length; i++) {
      // Between white and brown: soft, as the sea and the wind are.
      brown = (brown + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = brown * 3.5 + (Math.random() * 2 - 1) * 0.15;
    }
    this.noise = noise;
    this.bed('waves', [{ type: 'lowpass', frequency: 520, Q: 0.4 }]);
    this.bed('wind', [{ type: 'bandpass', frequency: 1900, Q: 0.35 }]);
    this.bed('fall', [{ type: 'highpass', frequency: 180, Q: 0.5 }, { type: 'lowpass', frequency: 2400, Q: 0.3 }]);
    this.bed('crowd', [{ type: 'bandpass', frequency: 620, Q: 1.3 }]);
    this.bed('fire', [{ type: 'bandpass', frequency: 420, Q: 0.6 }]);
    this.bed('cave', [{ type: 'lowpass', frequency: 260, Q: 0.6 }]);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void ctx.suspend();
      else void ctx.resume();
    });
  }

  private bed(name: string, filters: { type: BiquadFilterType; frequency: number; Q: number }[]): void {
    const ctx = this.ctx as AudioContext;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    // Each starts somewhere else in the noise, so no two beds sound alike.
    source.start(0, Math.random() * 2);
    let node: AudioNode = source;
    for (const f of filters) {
      const filter = ctx.createBiquadFilter();
      filter.type = f.type;
      filter.frequency.value = f.frequency;
      filter.Q.value = f.Q;
      node.connect(filter);
      node = filter;
    }
    const gain = ctx.createGain();
    gain.gain.value = 0;
    node.connect(gain);
    gain.connect(this.master as GainNode);
    this.beds.set(name, { gain, level: 0 });
  }

  private setBed(name: string, level: number): void {
    const bed = this.beds.get(name);
    const ctx = this.ctx;
    if (!bed || !ctx) return;
    if (Math.abs(level - bed.level) < 0.002) return;
    bed.level = level;
    bed.gain.gain.setTargetAtTime(level, ctx.currentTime, 0.25);
  }

  /** One frame of the island's sound as it is where you are. */
  update(h: Hearing): void {
    const ctx = this.ctx;
    if (!ctx || !this.on) return;
    this.time += h.dt;
    const t = this.time;
    const night = Math.max(smooth(18.6, 20.2, h.hours), 1 - smooth(4.8, 6.4, h.hours));
    const out = h.cave ? 0.25 : 1;
    // The waves come and go.
    const swell = 0.62 + 0.25 * Math.sin(t * 0.42) + 0.13 * Math.sin(t * 0.93 + 1.7);
    this.setBed('waves', (0.05 + 0.5 * h.shore) * swell * (h.cave ? 0.6 : 1));
    this.setBed('wind', (0.035 + 0.06 * h.jungle) * (1 - 0.5 * night) * out * (0.75 + 0.25 * Math.sin(t * 0.21)));
    this.setBed('fall', 0.55 * h.fall * out);
    this.setBed('crowd', 0.16 * h.festival * out * (0.8 + 0.2 * Math.sin(t * 0.7) * Math.sin(t * 1.3)));
    this.setBed('fire', 0.22 * h.fire * out);
    this.setBed('cave', h.cave ? 0.18 : 0);
    // Birds by day, crickets by night, the fire's crackle.
    if (t > this.nextBird) {
      this.nextBird = t + 1.2 + Math.random() * (5 - 3.5 * h.jungle);
      if (night < 0.5 && !h.cave) this.bird(0.05 + 0.08 * h.jungle);
    }
    if (t > this.nextChirp) {
      this.nextChirp = t + 0.55 + Math.random() * 0.9;
      if (night > 0.4 && !h.cave) this.cricket(0.02 * night * (1 - 0.6 * h.shore));
    }
    if (h.fire > 0.05 && t > this.nextCrackle) {
      this.nextCrackle = t + 0.08 + Math.random() * 0.45;
      this.crackle(0.25 * h.fire);
    }
    // Rakko's tune, a beat at a time, as near as he is.
    const beatLength = 60 / TEMPO;
    if (h.ukulele > 0.02) {
      while (this.beat < t) {
        const note = TUNE[Math.floor(this.beat / beatLength) % TUNE.length];
        if (note) this.pluck(hz(note), 0.32 * h.ukulele, ctx.currentTime + Math.max(0, this.beat - t));
        this.beat += beatLength;
      }
    } else {
      this.beat = t;
    }
    // Yours, a chord a strum.
    if (h.strumming && t > this.strumAt) {
      this.strumAt = t + STRUM;
      const chord = CHORDS[this.chord++ % CHORDS.length];
      chord.forEach((note, i) => this.pluck(hz(note), 0.22, ctx.currentTime + i * 0.022));
    }
    this.hum(h.siren * night);
    if (h.step) this.footstep(h.step);
  }

  // ---------------------------------------------------------------- what makes the sounds
  private envelope(gain: GainNode, at: number, peak: number, attack: number, decay: number): void {
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(peak, at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  }

  /** A short burst of the noise through a filter. */
  private burst(type: BiquadFilterType, frequency: number, q: number, peak: number, decay: number, at = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise) return;
    const when = ctx.currentTime + at;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = ctx.createGain();
    this.envelope(gain, when, peak, 0.004, decay);
    source.connect(filter).connect(gain).connect(this.master as GainNode);
    source.start(when, Math.random() * 1.5, decay + 0.05);
  }

  /** A sine, sliding from one pitch to another. */
  private tone(from: number, to: number, peak: number, decay: number, at = 0, type: OscillatorType = 'sine'): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const when = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, when);
    osc.frequency.exponentialRampToValueAtTime(to, when + decay);
    const gain = ctx.createGain();
    this.envelope(gain, when, peak, 0.01, decay);
    osc.connect(gain).connect(this.master as GainNode);
    osc.start(when);
    osc.stop(when + decay + 0.05);
  }

  private bird(peak: number): void {
    const base = 2400 + Math.random() * 1600;
    const notes = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < notes; i++) this.tone(base * (1 + 0.15 * Math.random()), base * 1.25, peak, 0.09, i * 0.13);
  }

  private cricket(peak: number): void {
    for (let i = 0; i < 3; i++) this.tone(4400, 4300, peak, 0.03, i * 0.045);
  }

  private crackle(peak: number): void {
    this.burst('highpass', 2500 + Math.random() * 2500, 0.8, peak * (0.4 + Math.random()), 0.02 + Math.random() * 0.03);
  }

  private footstep(on: 'sand' | 'grass' | 'wood' | 'water'): void {
    if (on === 'sand') this.burst('lowpass', 900, 0.7, 0.16, 0.09);
    else if (on === 'grass') this.burst('bandpass', 2600, 0.6, 0.1, 0.07);
    else if (on === 'water') this.burst('bandpass', 1300, 0.5, 0.22, 0.16);
    else {
      this.tone(170, 120, 0.2, 0.09);
      this.burst('bandpass', 1500, 1.2, 0.05, 0.03);
    }
  }

  /** A plucked string (Karplus-Strong, made once a pitch), at `when` on the audio clock. */
  private pluck(frequency: number, peak: number, when: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const key = Math.round(frequency);
    let buffer = this.plucks.get(key);
    if (!buffer) {
      const rate = ctx.sampleRate;
      const length = Math.floor(rate * 1.4);
      buffer = ctx.createBuffer(1, length, rate);
      const data = buffer.getChannelData(0);
      const period = Math.max(2, Math.round(rate / frequency));
      const line = new Float32Array(period);
      for (let i = 0; i < period; i++) line[i] = Math.random() * 2 - 1;
      for (let i = 0; i < length; i++) {
        const j = i % period;
        const next = line[(j + 1) % period];
        const value = line[j];
        data[i] = value;
        line[j] = 0.497 * (value + next);
      }
      this.plucks.set(key, buffer);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = peak;
    source.connect(gain).connect(this.master as GainNode);
    source.start(when);
  }

  /** The Siren's hum from the sea at night: two low voices, slowly wavering, as near as she lurks. */
  private hum(level: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.sirenVoice) {
      if (level < 0.01) return;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      filter.connect(gain);
      gain.connect(this.master as GainNode);
      const osc = [196, 293.7].map((f, i) => {
        const o = ctx.createOscillator();
        o.type = i ? 'sine' : 'triangle';
        o.frequency.value = f;
        const vibrato = ctx.createOscillator();
        vibrato.frequency.value = 4.6 + i * 0.7;
        const depth = ctx.createGain();
        depth.gain.value = f * 0.012;
        vibrato.connect(depth).connect(o.frequency);
        vibrato.start();
        o.connect(filter);
        o.start();
        return o;
      });
      this.sirenVoice = { gain, osc };
    }
    const voice = this.sirenVoice;
    // Rising and falling, as a song heard over the water.
    const phrase = 0.55 + 0.45 * Math.sin(this.time * 0.35);
    voice.gain.gain.setTargetAtTime(0.07 * level * phrase, ctx.currentTime, 0.6);
  }

  // ---------------------------------------------------------------- what you do
  pickUp(): void {
    this.tone(620, 940, 0.16, 0.12);
  }

  putDown(): void {
    this.tone(220, 150, 0.2, 0.14);
    this.burst('lowpass', 700, 0.7, 0.08, 0.06);
  }

  give(): void {
    this.tone(880, 880, 0.12, 0.25);
    this.tone(1320, 1320, 0.1, 0.35, 0.09);
  }

  bite(): void {
    this.burst('bandpass', 2200, 0.9, 0.14, 0.05);
    this.burst('bandpass', 1800, 0.9, 0.1, 0.05, 0.08);
  }

  sip(): void {
    this.burst('bandpass', 700, 2.5, 0.1, 0.18);
  }

  shutter(): void {
    this.burst('highpass', 3000, 0.7, 0.25, 0.04);
    this.burst('bandpass', 1200, 1.5, 0.18, 0.06, 0.07);
  }

  pouch(): void {
    this.burst('bandpass', 3200, 0.5, 0.08, 0.12);
  }

  /** Something you do yourself (the きもち button): a soft little chirp up. */
  emote(): void {
    this.tone(740, 1110, 0.06, 0.16);
    this.tone(1110, 1480, 0.045, 0.18, 0.07);
  }

  morning(): void {
    [72, 76, 79, 84].forEach((n, i) => this.tone(hz(n), hz(n), 0.08, 0.9, i * 0.18));
  }
}
