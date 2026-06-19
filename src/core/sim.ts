import type { Config } from './types';
import { buildOffsets } from './neighborhood';
import { step } from './stepper';
import { mulberry32 } from './rng';

/**
 * Owns the grid state and ties together config + neighborhood + stepper.
 * Uses double-buffered flat Uint8Arrays (one byte per cell = state id).
 */
export class Simulation {
  cfg: Config;
  cur: Uint8Array;
  next: Uint8Array;
  generation = 0;

  private offsets: Int32Array;
  private counts: Int32Array;
  private rand: () => number;

  constructor(cfg: Config) {
    this.cfg = cfg;
    const size = cfg.width * cfg.height;
    this.cur = new Uint8Array(size);
    this.next = new Uint8Array(size);
    this.offsets = buildOffsets(cfg.neighborhood);
    this.counts = new Int32Array(cfg.states.length);
    this.rand = Math.random;
  }

  get width() { return this.cfg.width; }
  get height() { return this.cfg.height; }

  /** Rebuild derived buffers after the config's shape/palette changes. */
  refresh(): void {
    this.offsets = buildOffsets(this.cfg.neighborhood);
    if (this.counts.length !== this.cfg.states.length) {
      this.counts = new Int32Array(this.cfg.states.length);
    }
  }

  step(): void {
    step(this.cur, this.next, this.cfg, this.offsets, this.counts, this.rand);
    const tmp = this.cur;
    this.cur = this.next;
    this.next = tmp;
    this.generation++;
  }

  clear(): void {
    this.cur.fill(0);
    this.generation = 0;
  }

  /** Random fill according to the config's seed mode. */
  seed(seedValue = (Math.random() * 1e9) | 0): void {
    const rand = mulberry32(seedValue);
    const { seedMode, seedDensity, states } = this.cfg;
    const n = states.length;
    const a = this.cur;
    for (let i = 0; i < a.length; i++) {
      if (seedMode === 'uniform') {
        a[i] = (rand() * n) | 0;
      } else {
        a[i] = rand() < seedDensity ? 1 + ((rand() * (n - 1)) | 0) : 0;
      }
    }
    this.generation = 0;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.cfg.width && y < this.cfg.height;
  }

  /** Paint a filled square of the given radius centered on a cell. */
  paint(cx: number, cy: number, state: number, radius = 0): void {
    const { width: w, height: h } = this.cfg;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x >= 0 && y >= 0 && x < w && y < h) this.cur[y * w + x] = state;
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
}
