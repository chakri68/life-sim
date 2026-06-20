import type { Config } from '../core/types';

interface RGB { r: number; g: number; b: number; }

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * Scrolling line chart of population per state over the last N samples.
 * One series per state; state 0 is hidden when it's the "empty/dead" state.
 */
export class PopulationChart {
  private ctx: CanvasRenderingContext2D;
  private series: number[][] = [];
  private colors: string[] = [];
  private skipFirst = false;
  private dpr = 1;
  private readonly cap = 240;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  /** Reset series + colors for a new universe (wipes history). */
  reset(cfg: Config): void {
    this.series = cfg.states.map(() => []);
    this.setColors(cfg);
  }

  /** Reset to a single series (e.g. mean concentration) with one color. */
  resetField(color: string): void {
    this.series = [[]];
    this.colors = [color];
    this.skipFirst = false;
  }

  /** Update colors / visibility without wiping history. */
  setColors(cfg: Config): void {
    this.colors = cfg.states.map((s) => s.color);
    this.skipFirst = cfg.seedMode === 'sparse' || cfg.engine === 'ecosystem';
    while (this.series.length < cfg.states.length) this.series.push([]);
    this.series.length = cfg.states.length;
  }

  push(pop: number[]): void {
    for (let i = 0; i < this.series.length; i++) {
      const a = this.series[i];
      a.push(pop[i] ?? 0);
      if (a.length > this.cap) a.shift();
    }
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
  }

  draw(): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, w, h);

    // baseline
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h - 0.5);
    ctx.lineTo(w, h - 0.5);
    ctx.stroke();

    let max = 1;
    for (let i = 0; i < this.series.length; i++) {
      if (this.skipFirst && i === 0) continue;
      const a = this.series[i];
      for (let j = 0; j < a.length; j++) if (a[j] > max) max = a[j];
    }

    const pad = 2 * this.dpr;
    for (let i = 0; i < this.series.length; i++) {
      if (this.skipFirst && i === 0) continue;
      const a = this.series[i];
      if (a.length < 2) continue;
      const c = hexToRgb(this.colors[i] ?? '#888');
      ctx.strokeStyle = `rgb(${c.r},${c.g},${c.b})`;
      ctx.lineWidth = 1.5 * this.dpr;
      ctx.beginPath();
      for (let j = 0; j < a.length; j++) {
        const x = (j / (this.cap - 1)) * w;
        const y = h - pad - (a[j] / max) * (h - pad * 2);
        if (j === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
}
