import type { Config } from '../core/types';
import { Simulation } from '../core/sim';
import { Renderer } from '../render/renderer';
import { PRESETS, defaultConfig } from '../rules/presets';
import { writeUrl, readUrl, encodeConfig } from '../rules/serialize';
import { el, option, clear } from './dom';
import { renderRules } from './ruleEditor';
import { renderPalette } from './palette';

const NEW_STATE_COLORS = ['#f5a623', '#9b59b6', '#1abc9c', '#e91e63', '#00bcd4', '#cddc39', '#ff5722'];

export class App {
  private cfg: Config;
  private sim: Simulation;
  private renderer: Renderer;

  private running = false;
  private speed = 20;       // steps per second
  private brush = 1;        // current paint state
  private brushRadius = 0;

  // loop bookkeeping
  private acc = 0;
  private last = 0;

  // input state
  private painting = false;
  private panning = false;
  private panLast = { x: 0, y: 0 };

  // DOM refs
  private canvas!: HTMLCanvasElement;
  private rulesBody!: HTMLElement;
  private paletteBody!: HTMLElement;
  private statsEl!: HTMLElement;
  private playBtn!: HTMLButtonElement;
  private presetSel!: HTMLSelectElement;
  private shareNote!: HTMLElement;

  constructor(root: HTMLElement) {
    this.cfg = readUrl() ?? defaultConfig();
    this.sim = new Simulation(this.cfg);
    this.sim.seed();

    this.buildLayout(root);
    this.renderer = new Renderer(this.canvas);
    this.renderer.fit(this.cfg);

    this.bindCanvas();
    this.rebuildPanels();
    window.addEventListener('resize', () => { this.renderer.resize(); });

    this.tick = this.tick.bind(this);
    requestAnimationFrame(this.tick);
  }

  // ---- layout -------------------------------------------------------------

  private buildLayout(root: HTMLElement): void {
    clear(root);

    this.playBtn = el('button', { class: 'btn primary', onclick: () => this.toggleRun() }, '▶ Play');
    const speed = el('input', {
      type: 'range', min: '1', max: '120', value: String(this.speed), class: 'slider',
      oninput: (e: Event) => { this.speed = Number((e.target as HTMLInputElement).value); },
    });
    const brush = el('input', {
      type: 'range', min: '0', max: '6', value: String(this.brushRadius), class: 'slider',
      oninput: (e: Event) => { this.brushRadius = Number((e.target as HTMLInputElement).value); },
    });

    const topbar = el('div', { class: 'topbar' }, [
      this.playBtn,
      el('button', { class: 'btn', onclick: () => this.stepOnce() }, '⏭ Step'),
      el('button', { class: 'btn', onclick: () => { this.sim.clear(); this.draw(); } }, 'Clear'),
      el('button', { class: 'btn', onclick: () => { this.sim.seed(); this.draw(); } }, 'Randomize'),
      el('button', { class: 'btn', onclick: () => { this.renderer.center(); } }, 'Reset view'),
      el('div', { class: 'ctl' }, [el('label', {}, 'Speed'), speed]),
      el('div', { class: 'ctl' }, [el('label', {}, 'Brush'), brush]),
      this.statsEl = el('div', { class: 'stats' }),
    ]);

    this.canvas = el('canvas', { class: 'grid-canvas' });
    const canvasWrap = el('div', { class: 'canvas-wrap' }, [this.canvas]);

    // sidebar
    this.presetSel = el('select', {
      class: 'preset-select',
      onchange: (e: Event) => this.loadPreset((e.target as HTMLSelectElement).value),
    });
    this.presetSel.append(option('', 'Load preset…', true));
    PRESETS.forEach((p) => this.presetSel.append(option(p.id, p.label, false)));

    this.shareNote = el('span', { class: 'muted share-note' });
    this.paletteBody = el('div', { class: 'palette-body' });
    this.rulesBody = el('div', { class: 'rules-body' });

    const sidebar = el('div', { class: 'sidebar' }, [
      el('h1', {}, 'life_playground'),
      el('p', { class: 'muted' }, '// a configurable multi-state cellular automaton. paint cells, tweak rules, watch what emerges.'),
      el('div', { class: 'row' }, [
        this.presetSel,
        el('button', { class: 'btn', onclick: () => this.share() }, 'Copy link'),
      ]),
      this.shareNote,
      section('States', this.paletteBody),
      section('Rules  (top-to-bottom, first match wins)', this.rulesBody),
      el('div', { class: 'help muted' }, [
        el('p', {}, 'Left-drag: paint · Right/Middle-drag: pan · Wheel: zoom'),
        el('p', {}, 'A rule reads: WHEN current state, IF neighbor counts match, → become a new state.'),
      ]),
    ]);

    root.append(el('div', { class: 'main' }, [topbar, canvasWrap]), sidebar);
  }

  // ---- panels -------------------------------------------------------------

  private rebuildPanels(): void {
    this.renderRulesPanel();
    this.renderPalettePanel();
  }

  private renderRulesPanel(): void {
    renderRules(
      this.rulesBody,
      this.cfg,
      () => this.commit(),
      () => { this.renderRulesPanel(); this.commit(); },
    );
  }

  private renderPalettePanel(): void {
    renderPalette(this.paletteBody, this.cfg, {
      brush: this.brush,
      setBrush: (i) => { this.brush = i; this.renderPalettePanel(); },
      commit: () => { this.renderer.setPalette(this.cfg); this.renderPalettePanel(); this.commit(); this.draw(); },
      addState: () => this.addState(),
      removeState: (i) => this.removeState(i),
    });
  }

  // ---- config mutation ----------------------------------------------------

  private commit(): void {
    writeUrl(this.cfg);
  }

  private addState(): void {
    const color = NEW_STATE_COLORS[(this.cfg.states.length - 1) % NEW_STATE_COLORS.length];
    this.cfg.states.push({ name: `State ${this.cfg.states.length}`, color });
    this.sim.refresh();
    this.renderer.setPalette(this.cfg);
    this.rebuildPanels();
    this.commit();
  }

  private removeState(idx: number): void {
    if (this.cfg.states.length <= 1) return;
    const remap = (v: number) => (v === idx ? 0 : v > idx ? v - 1 : v);

    // Remap the grid in place.
    const g = this.sim.cur;
    for (let i = 0; i < g.length; i++) g[i] = remap(g[i]);

    // Remap rule references (keep -1 "Any" as-is).
    for (const rule of this.cfg.rules) {
      if (rule.when >= 0) rule.when = remap(rule.when);
      rule.become = remap(rule.become);
      for (const c of rule.conditions) {
        c.state = remap(c.state);
        if (c.rhs.kind === 'count') c.rhs.state = remap(c.rhs.state);
      }
    }

    this.cfg.states.splice(idx, 1);
    this.brush = Math.min(remap(this.brush), this.cfg.states.length - 1);
    this.sim.refresh();
    this.renderer.setPalette(this.cfg);
    this.rebuildPanels();
    this.commit();
    this.draw();
  }

  private loadPreset(id: string): void {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    this.loadConfig(preset.build());
    this.presetSel.value = '';
  }

  private loadConfig(cfg: Config): void {
    this.cfg = cfg;
    this.sim = new Simulation(cfg);
    this.sim.seed();
    this.brush = Math.min(1, cfg.states.length - 1);
    this.renderer.fit(cfg);
    this.rebuildPanels();
    this.commit();
    this.draw();
  }

  // ---- run loop -----------------------------------------------------------

  private toggleRun(): void {
    this.running = !this.running;
    this.playBtn.textContent = this.running ? '⏸ Pause' : '▶ Play';
    this.playBtn.classList.toggle('primary', !this.running);
  }

  private stepOnce(): void {
    this.sim.step();
    this.draw();
  }

  private tick(now: number): void {
    if (!this.last) this.last = now;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;

    if (this.running) {
      this.acc += dt * this.speed;
      let budget = 8; // cap steps/frame to avoid a death spiral
      while (this.acc >= 1 && budget-- > 0) {
        this.sim.step();
        this.acc -= 1;
      }
      if (this.acc > this.speed) this.acc = this.speed;
    }

    this.renderer.draw(this.sim.cur);
    this.updateStats();
    requestAnimationFrame(this.tick);
  }

  private draw(): void {
    this.renderer.draw(this.sim.cur);
    this.updateStats();
  }

  private updateStats(): void {
    const pop = this.sim.population();
    clear(this.statsEl);
    this.statsEl.append(el('span', { class: 'gen' }, `Gen ${this.sim.generation}`));
    this.cfg.states.forEach((s, i) => {
      if (i === 0 && this.cfg.seedMode === 'sparse') return; // skip "empty/dead"
      this.statsEl.append(
        el('span', { class: 'pop' }, [
          el('span', { class: 'brush-dot', style: `background:${s.color}` }),
          String(pop[i]),
        ]),
      );
    });
  }

  // ---- canvas input -------------------------------------------------------

  private bindCanvas(): void {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    c.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.painting = true;
        this.paintAt(e);
      } else {
        this.panning = true;
        this.panLast = { x: e.clientX, y: e.clientY };
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.painting) {
        this.paintAt(e);
      } else if (this.panning) {
        this.renderer.pan(e.clientX - this.panLast.x, e.clientY - this.panLast.y);
        this.panLast = { x: e.clientX, y: e.clientY };
      }
    });

    window.addEventListener('mouseup', () => { this.painting = false; this.panning = false; });

    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.renderer.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 1 / 1.1);
    }, { passive: false });
  }

  private paintAt(e: MouseEvent): void {
    const cell = this.renderer.cellAt(e);
    if (!cell) return;
    this.sim.paint(cell.x, cell.y, this.brush, this.brushRadius);
    if (!this.running) this.draw();
  }

  // ---- share --------------------------------------------------------------

  private share(): void {
    const url = location.origin + location.pathname + '#c=' + encodeConfig(this.cfg);
    navigator.clipboard?.writeText(url).then(
      () => this.flashShare('Link copied to clipboard ✓'),
      () => this.flashShare('Copy failed — URL is in the address bar'),
    );
    writeUrl(this.cfg);
  }

  private flashShare(msg: string): void {
    this.shareNote.textContent = msg;
    window.setTimeout(() => { this.shareNote.textContent = ''; }, 2500);
  }
}

function section(title: string, body: HTMLElement): HTMLElement {
  return el('section', { class: 'panel' }, [el('h2', {}, title), body]);
}
