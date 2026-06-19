import type { Config } from '../core/types';

interface RGB { r: number; g: number; b: number; }

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * Renders the grid to a canvas with pan/zoom. The grid is drawn 1px-per-cell
 * into an offscreen buffer, then blitted (nearest-neighbor) through a camera
 * transform — fast and crisp at any zoom.
 */
export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private buffer: HTMLCanvasElement;
  private bctx: CanvasRenderingContext2D;
  private img: ImageData;
  private palette: RGB[] = [];
  private gw = 0;
  private gh = 0;
  private dpr = 1;

  /** Camera: pixels-per-cell (scale) and pan offset in device pixels. */
  camera = { scale: 5, x: 0, y: 0 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.buffer = document.createElement('canvas');
    this.bctx = this.buffer.getContext('2d')!;
    this.img = this.bctx.createImageData(1, 1);
  }

  /** Reconfigure for a new universe and fit it to the viewport. */
  fit(cfg: Config): void {
    this.gw = cfg.width;
    this.gh = cfg.height;
    this.buffer.width = cfg.width;
    this.buffer.height = cfg.height;
    this.img = this.bctx.createImageData(cfg.width, cfg.height);
    this.palette = cfg.states.map((s) => hexToRgb(s.color));
    this.resize();
    this.center();
  }

  setPalette(cfg: Config): void {
    this.palette = cfg.states.map((s) => hexToRgb(s.color));
  }

  /** Match the backing store to the element's CSS size (handles HiDPI). */
  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
  }

  /** Center the grid and choose a scale that fits the viewport. */
  center(): void {
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const scale = Math.max(1, Math.floor(Math.min(cw / this.gw, ch / this.gh)));
    this.camera.scale = scale;
    this.camera.x = (cw - this.gw * scale) / 2;
    this.camera.y = (ch - this.gh * scale) / 2;
  }

  draw(grid: Uint8Array): void {
    const data = this.img.data;
    const pal = this.palette;
    for (let i = 0; i < grid.length; i++) {
      const c = pal[grid[i]] ?? { r: 255, g: 0, b: 255 };
      const o = i * 4;
      data[o] = c.r;
      data[o + 1] = c.g;
      data[o + 2] = c.b;
      data[o + 3] = 255;
    }
    this.bctx.putImageData(this.img, 0, 0);

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05070b';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.imageSmoothingEnabled = false;
    const s = this.camera.scale;
    ctx.setTransform(s, 0, 0, s, this.camera.x, this.camera.y);
    ctx.drawImage(this.buffer, 0, 0);
  }

  /** Convert a mouse event to integer cell coordinates (or null if outside). */
  cellAt(ev: MouseEvent): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const px = (ev.clientX - rect.left) * this.dpr;
    const py = (ev.clientY - rect.top) * this.dpr;
    const x = Math.floor((px - this.camera.x) / this.camera.scale);
    const y = Math.floor((py - this.camera.y) / this.camera.scale);
    if (x < 0 || y < 0 || x >= this.gw || y >= this.gh) return null;
    return { x, y };
  }

  /** Zoom toward a screen point (in CSS pixels). */
  zoomAt(clientX: number, clientY: number, factor: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const mx = (clientX - rect.left) * this.dpr;
    const my = (clientY - rect.top) * this.dpr;
    const old = this.camera.scale;
    const next = Math.min(40, Math.max(1, old * factor));
    if (next === old) return;
    this.camera.x = mx - ((mx - this.camera.x) * next) / old;
    this.camera.y = my - ((my - this.camera.y) * next) / old;
    this.camera.scale = next;
  }

  pan(dxCss: number, dyCss: number): void {
    this.camera.x += dxCss * this.dpr;
    this.camera.y += dyCss * this.dpr;
  }
}
