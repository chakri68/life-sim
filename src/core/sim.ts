import type { Config, ScriptFn } from "./types";
import { buildOffsets } from "./neighborhood";
import { step } from "./stepper";
import { stepEcosystem, seedEcosystem } from "./steppers/ecosystem";
import { stepReaction, seedReaction } from "./steppers/reaction";
import { stepScript } from "./steppers/script";
import { mulberry32 } from "./rng";

/**
 * Owns the grid state and ties together config + neighborhood + stepper.
 *
 * The state grid is a double-buffered flat Uint8Array (one byte per cell =
 * state id). The WaTor engine additionally uses per-cell `energy`/`age`
 * attribute buffers and a `moved` stamp; these sit unused for the totalistic
 * engine. Fields the steppers touch are public so the stepper modules can read
 * them without ceremony.
 */
export class Simulation {
  cfg: Config;
  cur: Uint8Array;
  next: Uint8Array;
  generation = 0;

  // Attribute buffers (used by the ecosystem engine).
  energy: Int16Array;
  age: Int16Array; // steps since birth/last breed — drives the breed timer
  life: Int16Array; // absolute age — drives lifespan (not reset on breeding)
  moved: Uint8Array;
  order: Int32Array;

  // Continuous concentration buffers (used by the reaction engine).
  u: Float32Array;
  v: Float32Array;
  u2: Float32Array;
  v2: Float32Array;

  offsets: Int32Array;
  rand: () => number;

  // Manual ('script') engine: the compiled transition + the last runtime error.
  scriptFn: ScriptFn | null = null;
  scriptError: string | null = null;

  private counts: Int32Array;

  constructor(cfg: Config) {
    this.cfg = cfg;
    const size = cfg.width * cfg.height;
    this.cur = new Uint8Array(size);
    this.next = new Uint8Array(size);
    this.energy = new Int16Array(size);
    this.age = new Int16Array(size);
    this.life = new Int16Array(size);
    this.moved = new Uint8Array(size);
    this.order = new Int32Array(size);
    for (let i = 0; i < size; i++) this.order[i] = i;
    this.u = new Float32Array(size);
    this.v = new Float32Array(size);
    this.u2 = new Float32Array(size);
    this.v2 = new Float32Array(size);
    this.offsets = buildOffsets(cfg.neighborhood);
    this.counts = new Int32Array(cfg.states.length);
    this.rand = Math.random;
  }

  get width() {
    return this.cfg.width;
  }
  get height() {
    return this.cfg.height;
  }

  /** Rebuild derived buffers after the config's shape/palette changes. */
  refresh(): void {
    this.offsets = buildOffsets(this.cfg.neighborhood);
    if (this.counts.length !== this.cfg.states.length) {
      this.counts = new Int32Array(this.cfg.states.length);
    }
  }

  /**
   * Compile cfg.script into the per-cell transition. This runs the user's own
   * code locally via `new Function`. Returns a syntax-error message, or null on
   * success. Runtime errors surface later through `scriptError`.
   */
  compileScript(): string | null {
    const src = this.cfg.script ?? "";
    try {
      const fn = new Function(
        "self",
        "count",
        "get",
        "x",
        "y",
        "gen",
        "rand",
        src,
      );
      this.scriptFn = fn as unknown as ScriptFn;
      this.scriptError = null;
      return null;
    } catch (e) {
      this.scriptFn = null;
      return e instanceof Error ? e.message : String(e);
    }
  }

  step(): void {
    if (this.cfg.engine === "ecosystem") {
      stepEcosystem(this); // advances generation internally
      return;
    }
    if (this.cfg.engine === "reaction") {
      stepReaction(this); // advances generation internally
      return;
    }
    if (this.cfg.engine === "script") {
      // Only swap (and count the generation) if the user's function ran clean.
      if (stepScript(this)) {
        const tmp = this.cur;
        this.cur = this.next;
        this.next = tmp;
        this.generation++;
      }
      return;
    }
    step(this.cur, this.next, this.cfg, this.offsets, this.counts, this.rand);
    const tmp = this.cur;
    this.cur = this.next;
    this.next = tmp;
    this.generation++;
  }

  clear(): void {
    if (this.cfg.engine === "reaction") {
      this.u.fill(1); // U=1, V=0 is the trivial steady state
      this.v.fill(0);
      this.generation = 0;
      return;
    }
    this.cur.fill(0);
    this.energy.fill(0);
    this.age.fill(0);
    this.life.fill(0);
    this.generation = 0;
  }

  /** Random fill according to the config's engine / seed mode. */
  seed(seedValue = (Math.random() * 1e9) | 0): void {
    const rand = mulberry32(seedValue);
    if (this.cfg.engine === "ecosystem") {
      seedEcosystem(this, rand);
      this.generation = 0;
      return;
    }
    if (this.cfg.engine === "reaction") {
      seedReaction(this, rand);
      this.generation = 0;
      return;
    }
    const { seedMode, seedDensity, states } = this.cfg;
    const n = states.length;
    const a = this.cur;
    for (let i = 0; i < a.length; i++) {
      if (seedMode === "uniform") {
        a[i] = (rand() * n) | 0;
      } else {
        a[i] = rand() < seedDensity ? 1 + ((rand() * (n - 1)) | 0) : 0;
      }
    }
    this.generation = 0;
  }

  /** Paint a filled square of the given radius centered on a cell. */
  paint(cx: number, cy: number, state: number, radius = 0): void {
    const { width: w, height: h } = this.cfg;
    const eco = this.cfg.engine === "ecosystem";
    const reaction = this.cfg.engine === "reaction";
    const startEnergy = eco
      ? (this.cfg.ecosystem?.species[state]?.startEnergy ?? 0)
      : 0;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = cx + dx,
          y = cy + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = y * w + x;
        if (reaction) {
          // "Draw" disturbances of chemical V that grow into patterns.
          this.u[i] = 0.25;
          this.v[i] = 0.5;
          continue;
        }
        this.cur[i] = state;
        if (eco) {
          // Seed painted agents with their species' starting energy.
          this.energy[i] = startEnergy;
          this.age[i] = 0;
          this.life[i] = 0;
        }
      }
    }
  }

  /** Population count per state id. */
  population(): number[] {
    const out = new Array(this.cfg.states.length).fill(0);
    const a = this.cur;
    for (let i = 0; i < a.length; i++) out[a[i]]++;
    return out;
  }

  /** Mean concentration of chemical V (for the reaction engine's readout). */
  meanV(): number {
    const v = this.v;
    let s = 0;
    for (let i = 0; i < v.length; i++) s += v[i];
    return s / v.length;
  }
}
