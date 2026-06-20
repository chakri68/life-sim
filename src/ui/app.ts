import type { Config } from "../core/types";
import { Simulation } from "../core/sim";
import { Renderer } from "../render/renderer";
import { PRESETS, defaultConfig } from "../rules/presets";
import { writeUrl, readUrl, encodeConfig } from "../rules/serialize";
import { el, option, clear } from "./dom";
import { renderRules } from "./ruleEditor";
import { renderPalette } from "./palette";
import { renderEcosystem } from "./params";
import { renderReaction } from "./reaction";
import { renderScript } from "./script";
import { PopulationChart } from "./chart";
import { panelHeader, helpButton } from "./help";

const V_DISPLAY_HI = 0.4; // map V in [0, 0.4] across the colormap

// Inline copy/clipboard icon (Feather "copy"), inherits the button's color.
const COPY_ICON =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>' +
  '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

const NEW_STATE_COLORS = [
  "#f5a623",
  "#9b59b6",
  "#1abc9c",
  "#e91e63",
  "#00bcd4",
  "#cddc39",
  "#ff5722",
];

export class App {
  private cfg: Config;
  private sim: Simulation;
  private renderer: Renderer;

  private running = false;
  private speed = 20; // steps per second
  private brush = 1; // current paint state
  private brushRadius = 0;

  // loop bookkeeping
  private acc = 0;
  private last = 0;

  // input state
  private painting = false;
  private panning = false;
  private panLast = { x: 0, y: 0 };

  // population chart sampling
  private chart!: PopulationChart;
  private lastSampleGen = -1;

  // DOM refs
  private canvas!: HTMLCanvasElement;
  private configPanel!: HTMLElement;
  private statesSection!: HTMLElement;
  private paletteBody!: HTMLElement;
  private statsEl!: HTMLElement;
  private playBtn!: HTMLButtonElement;
  private presetSel!: HTMLSelectElement;
  private shareNote!: HTMLElement;
  private scriptErrorEl?: HTMLElement;
  private scriptPending = false; // a URL-loaded script awaiting an explicit Apply

  constructor(root: HTMLElement) {
    const fromUrl = readUrl();
    this.cfg = fromUrl ?? defaultConfig();
    this.sim = new Simulation(this.cfg);
    // Never auto-run a script that came from a shared link — it waits for Apply.
    // Locally-built configs (presets) are trusted and compile immediately.
    if (this.cfg.engine === "script") {
      if (fromUrl) this.scriptPending = true;
      else this.sim.compileScript();
    }
    this.sim.seed();

    this.buildLayout(root);
    this.renderer = new Renderer(this.canvas);
    this.renderer.fit(this.cfg);
    this.chart.resize();
    this.syncEngineView();

    this.bindCanvas();
    this.rebuildPanels();
    window.addEventListener("resize", () => {
      this.renderer.resize();
      this.chart.resize();
    });

    this.tick = this.tick.bind(this);
    requestAnimationFrame(this.tick);
  }

  // ---- layout -------------------------------------------------------------

  private buildLayout(root: HTMLElement): void {
    clear(root);

    this.playBtn = el(
      "button",
      { class: "btn primary", onclick: () => this.toggleRun() },
      "▶ Play",
    );
    const speed = el("input", {
      type: "range",
      min: "1",
      max: "120",
      value: String(this.speed),
      class: "slider",
      oninput: (e: Event) => {
        this.speed = Number((e.target as HTMLInputElement).value);
      },
    });
    const brush = el("input", {
      type: "range",
      min: "0",
      max: "6",
      value: String(this.brushRadius),
      class: "slider",
      oninput: (e: Event) => {
        this.brushRadius = Number((e.target as HTMLInputElement).value);
      },
    });

    const controlbar = el("div", { class: "controlbar" }, [
      this.playBtn,
      el("button", { class: "btn", onclick: () => this.stepOnce() }, "⏭ Step"),
      el(
        "button",
        {
          class: "btn",
          onclick: () => this.resetHistory(() => this.sim.clear()),
        },
        "Clear",
      ),
      el(
        "button",
        {
          class: "btn",
          onclick: () => this.resetHistory(() => this.sim.seed()),
        },
        "Randomize",
      ),
      el(
        "button",
        {
          class: "btn",
          onclick: () => {
            this.renderer.center();
          },
        },
        "Reset view",
      ),
      el("div", { class: "ctl" }, [el("label", {}, "Speed"), speed]),
      el("div", { class: "ctl" }, [el("label", {}, "Brush"), brush]),
      (this.statsEl = el("div", { class: "stats" })),
    ]);

    this.canvas = el("canvas", { class: "grid-canvas" });
    const canvasWrap = el("div", { class: "canvas-wrap" }, [this.canvas]);

    // sidebar
    this.presetSel = el("select", {
      class: "preset-select",
      onchange: (e: Event) =>
        this.loadPreset((e.target as HTMLSelectElement).value),
    });
    this.presetSel.append(option("", "Load preset…", true));
    PRESETS.forEach((p) => this.presetSel.append(option(p.id, p.label, false)));

    this.shareNote = el("span", { class: "muted share-note" });
    this.paletteBody = el("div", { class: "palette-body" });
    this.configPanel = el("section", { class: "panel" });

    const chartCanvas = el("canvas", { class: "pop-chart" });
    this.chart = new PopulationChart(chartCanvas);

    const sidebar = el("div", { class: "sidebar" }, [
      el("h1", {}, "life_playground"),
      el(
        "p",
        { class: "muted" },
        "// a configurable multi-state cellular automaton. paint cells, tweak rules, watch what emerges.",
      ),
      el("div", { class: "row" }, [
        this.presetSel,
        el("button", {
          class: "btn btn-icon",
          title: "Copy share link",
          "aria-label": "Copy share link",
          innerHTML: COPY_ICON,
          onclick: () => this.share(),
        }),
        helpButton("preset"),
      ]),
      this.shareNote,
      section("Population", chartCanvas, "population"),
      (this.statesSection = section("States", this.paletteBody, "states")),
      this.configPanel,
      el("div", { class: "help muted" }, [
        el("p", {}, [
          el(
            "span",
            {},
            "Left-drag: paint · Right/Middle-drag: pan · Wheel: zoom  ",
          ),
          helpButton("controls"),
        ]),
        el(
          "p",
          {},
          "A rule reads: WHEN current state, IF neighbor counts match, → become a new state.",
        ),
      ]),
    ]);

    const main = el("div", { class: "main" }, [canvasWrap, controlbar]);
    const resizer = el("div", {
      class: "resizer",
      title: "Drag to resize the panel",
    });
    this.bindResizer(resizer, sidebar);
    root.append(main, resizer, sidebar);
  }

  /** Drag the divider to widen/narrow the sidebar; width persists across reloads. */
  private bindResizer(handle: HTMLElement, sidebar: HTMLElement): void {
    const MIN = 320,
      MAX = 900;
    try {
      const saved = Number(localStorage.getItem("sidebarW"));
      if (saved >= MIN && saved <= MAX) sidebar.style.width = saved + "px";
    } catch {
      /* localStorage may be unavailable */
    }

    let startX = 0,
      startW = 0,
      dragging = false;
    handle.addEventListener("mousedown", (e) => {
      dragging = true;
      startX = e.clientX;
      startW = sidebar.offsetWidth;
      document.body.classList.add("resizing");
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      // Dragging left (toward the canvas) widens the sidebar.
      const w = Math.max(MIN, Math.min(MAX, startW + (startX - e.clientX)));
      sidebar.style.width = w + "px";
      this.renderer.resize();
      this.chart.resize();
    });
    window.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove("resizing");
      try {
        localStorage.setItem("sidebarW", String(sidebar.offsetWidth));
      } catch {
        /* ignore */
      }
    });
  }

  // ---- panels -------------------------------------------------------------

  private rebuildPanels(): void {
    // The States/palette section only applies to the discrete engines.
    this.statesSection.style.display =
      this.cfg.engine === "reaction" ? "none" : "";
    this.renderConfigPanel();
    if (this.cfg.engine !== "reaction") this.renderPalettePanel();
  }

  /** Render the engine-appropriate editor: rules, species, or reaction params. */
  private renderConfigPanel(): void {
    clear(this.configPanel);
    if (this.cfg.engine === "ecosystem") {
      this.configPanel.append(panelHeader("Species  // food web", "ecosystem"));
      const body = el("div", { class: "params-body" });
      this.configPanel.append(body);
      renderEcosystem(body, this.cfg, () => this.commit());
    } else if (this.cfg.engine === "reaction") {
      this.configPanel.append(
        panelHeader("Reaction-Diffusion  // Gray-Scott", "reaction"),
      );
      const body = el("div", { class: "params-body" });
      this.configPanel.append(body);
      renderReaction(body, this.cfg, {
        commit: () => this.commit(),
        applyColormap: () => {
          this.renderer.setColormap(this.cfg.reaction!.colors);
          this.draw();
        },
        reseed: () => {
          this.sim.seed();
          this.chartReset();
          this.draw();
        },
      });
    } else if (this.cfg.engine === "script") {
      this.configPanel.append(panelHeader("Manual rule  // raw JS", "script"));
      const body = el("div", { class: "params-body" });
      this.configPanel.append(body);
      renderScript(
        body,
        this.cfg,
        {
          apply: (src) => this.applyScript(src),
          commit: () => this.commit(),
          register: (errEl) => {
            this.scriptErrorEl = errEl;
          },
        },
        this.scriptPending,
      );
    } else {
      this.configPanel.append(
        panelHeader("Rules  (top-to-bottom, first match wins)", "rules"),
      );
      const body = el("div", { class: "rules-body" });
      this.configPanel.append(body);
      renderRules(
        body,
        this.cfg,
        () => this.commit(),
        () => {
          this.renderConfigPanel();
          this.commit();
        },
      );
    }
  }

  private renderPalettePanel(): void {
    renderPalette(this.paletteBody, this.cfg, {
      brush: this.brush,
      setBrush: (i) => {
        this.brush = i;
        this.renderPalettePanel();
      },
      commit: () => {
        this.renderer.setPalette(this.cfg);
        this.chart.setColors(this.cfg);
        this.renderPalettePanel();
        this.commit();
        this.draw();
      },
      addState: () => this.addState(),
      removeState: (i) => this.removeState(i),
    });
  }

  // ---- config mutation ----------------------------------------------------

  private commit(): void {
    writeUrl(this.cfg);
  }

  /** Compile a manual-rule edit. Returns a compile-error message, or null. */
  private applyScript(src: string): string | null {
    this.cfg.script = src;
    const err = this.sim.compileScript();
    if (!err) {
      this.scriptPending = false;
      this.commit();
      this.draw();
    }
    return err;
  }

  /** Pause and show a manual-rule runtime error once it occurs mid-run. */
  private surfaceScriptError(): void {
    if (!this.sim.scriptError) return;
    if (this.running) this.toggleRun();
    if (this.scriptErrorEl) {
      this.scriptErrorEl.textContent = "runtime error: " + this.sim.scriptError;
      this.scriptErrorEl.classList.add("show");
    }
    this.sim.scriptError = null; // consumed — don't re-fire every frame
  }

  private addState(): void {
    const color =
      NEW_STATE_COLORS[(this.cfg.states.length - 1) % NEW_STATE_COLORS.length];
    this.cfg.states.push({ name: `State ${this.cfg.states.length}`, color });
    // Keep the ecosystem species array parallel to states.
    if (this.cfg.engine === "ecosystem" && this.cfg.ecosystem) {
      this.cfg.ecosystem.species.push({
        mobile: true,
        moveProb: 1,
        huntSuccess: 1,
        diet: [],
        breedTime: 8,
        maxAge: 0,
        metabolism: 1,
        startEnergy: 8,
        gain: 4,
        seedDensity: 0.04,
      });
    }
    this.sim.refresh();
    this.renderer.setPalette(this.cfg);
    this.chart.setColors(this.cfg);
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
        if (c.rhs.kind === "count") c.rhs.state = remap(c.rhs.state);
      }
    }

    // Remap ecosystem species + their diets, then drop the removed species.
    if (this.cfg.engine === "ecosystem" && this.cfg.ecosystem) {
      const species = this.cfg.ecosystem.species;
      for (const sp of species) {
        sp.diet = sp.diet
          .filter((d) => d !== idx)
          .map((d) => (d > idx ? d - 1 : d));
      }
      species.splice(idx, 1);
    }

    this.cfg.states.splice(idx, 1);
    this.brush = Math.min(remap(this.brush), this.cfg.states.length - 1);
    this.sim.refresh();
    this.renderer.setPalette(this.cfg);
    this.chartReset();
    this.rebuildPanels();
    this.commit();
    this.draw();
  }

  private loadPreset(id: string): void {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    this.loadConfig(preset.build());
    this.presetSel.value = "";
  }

  private loadConfig(cfg: Config): void {
    this.cfg = cfg;
    this.sim = new Simulation(cfg);
    this.scriptPending = false; // presets are trusted — no Apply gate
    if (cfg.engine === "script") this.sim.compileScript();
    this.sim.seed();
    this.brush = Math.min(1, cfg.states.length - 1);
    this.renderer.fit(cfg);
    this.syncEngineView();
    this.rebuildPanels();
    this.commit();
    this.draw();
  }

  /** Set up renderer colormap + chart series for the current engine. */
  private syncEngineView(): void {
    if (this.cfg.engine === "reaction" && this.cfg.reaction) {
      this.renderer.setColormap(this.cfg.reaction.colors);
    }
    this.chartReset();
  }

  private highColor(): string {
    const c = this.cfg.reaction?.colors;
    return c && c.length ? c[c.length - 1] : "#ffb000";
  }

  /** Reset the chart series for the current engine and resync sampling. */
  private chartReset(): void {
    if (this.cfg.engine === "reaction") this.chart.resetField(this.highColor());
    else this.chart.reset(this.cfg);
    this.lastSampleGen = -1;
  }

  /** Render the grid (discrete) or the V field (continuous) for this engine. */
  private present(): void {
    if (this.cfg.engine === "reaction")
      this.renderer.drawField(this.sim.v, 0, V_DISPLAY_HI);
    else this.renderer.draw(this.sim.cur);
  }

  // ---- run loop -----------------------------------------------------------

  private toggleRun(): void {
    this.running = !this.running;
    this.playBtn.textContent = this.running ? "⏸ Pause" : "▶ Play";
    this.playBtn.classList.toggle("primary", !this.running);
  }

  private stepOnce(): void {
    this.sim.step();
    this.draw();
  }

  /** Run a grid-resetting action and wipe the chart history. */
  private resetHistory(action: () => void): void {
    action();
    this.chartReset();
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

    this.present();
    this.updateStats();
    this.surfaceScriptError();
    requestAnimationFrame(this.tick);
  }

  private draw(): void {
    this.present();
    this.updateStats();
  }

  private updateStats(): void {
    const sampleNow = this.sim.generation !== this.lastSampleGen;

    if (this.cfg.engine === "reaction") {
      const mv = this.sim.meanV();
      if (sampleNow) {
        this.chart.push([mv]);
        this.lastSampleGen = this.sim.generation;
      }
      this.chart.draw();
      clear(this.statsEl);
      this.statsEl.append(
        el("span", { class: "gen" }, `Step ${this.sim.generation}`),
      );
      this.statsEl.append(
        el("span", { class: "pop" }, [
          el("span", {
            class: "brush-dot",
            style: `background:${this.highColor()}`,
          }),
          `mean V ${mv.toFixed(3)}`,
        ]),
      );
      return;
    }

    const pop = this.sim.population();
    if (sampleNow) {
      this.chart.push(pop);
      this.lastSampleGen = this.sim.generation;
    }
    this.chart.draw();

    const skipEmpty =
      this.cfg.seedMode === "sparse" || this.cfg.engine === "ecosystem";
    clear(this.statsEl);
    this.statsEl.append(
      el("span", { class: "gen" }, `Gen ${this.sim.generation}`),
    );
    this.cfg.states.forEach((s, i) => {
      if (i === 0 && skipEmpty) return; // skip "empty/dead"
      this.statsEl.append(
        el("span", { class: "pop" }, [
          el("span", { class: "brush-dot", style: `background:${s.color}` }),
          String(pop[i]),
        ]),
      );
    });
  }

  // ---- canvas input -------------------------------------------------------

  private bindCanvas(): void {
    const c = this.canvas;
    c.addEventListener("contextmenu", (e) => e.preventDefault());

    c.addEventListener("mousedown", (e) => {
      if (e.button === 0) {
        this.painting = true;
        this.paintAt(e);
      } else {
        this.panning = true;
        this.panLast = { x: e.clientX, y: e.clientY };
      }
    });

    window.addEventListener("mousemove", (e) => {
      if (this.painting) {
        this.paintAt(e);
      } else if (this.panning) {
        this.renderer.pan(
          e.clientX - this.panLast.x,
          e.clientY - this.panLast.y,
        );
        this.panLast = { x: e.clientX, y: e.clientY };
      }
    });

    window.addEventListener("mouseup", () => {
      this.painting = false;
      this.panning = false;
    });

    c.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.renderer.zoomAt(
          e.clientX,
          e.clientY,
          e.deltaY < 0 ? 1.1 : 1 / 1.1,
        );
      },
      { passive: false },
    );
  }

  private paintAt(e: MouseEvent): void {
    const cell = this.renderer.cellAt(e);
    if (!cell) return;
    this.sim.paint(cell.x, cell.y, this.brush, this.brushRadius);
    if (!this.running) this.draw();
  }

  // ---- share --------------------------------------------------------------

  private share(): void {
    const url =
      location.origin + location.pathname + "#c=" + encodeConfig(this.cfg);
    navigator.clipboard?.writeText(url).then(
      () => this.flashShare("Link copied to clipboard ✓"),
      () => this.flashShare("Copy failed — URL is in the address bar"),
    );
    writeUrl(this.cfg);
  }

  private flashShare(msg: string): void {
    this.shareNote.textContent = msg;
    window.setTimeout(() => {
      this.shareNote.textContent = "";
    }, 2500);
  }
}

function section(
  title: string,
  body: HTMLElement,
  helpId?: string,
): HTMLElement {
  return el("section", { class: "panel" }, [panelHeader(title, helpId), body]);
}
