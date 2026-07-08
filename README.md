<p align="center">
  <img src="src/assets/hero.png" alt="life_playground" width="200" />
</p>

# life_playground

A configurable, multi-state cellular-automaton playground. Conway's Game of Life
is the 2-state special case — this lets you define your own states, rules, and
even the _kind_ of universe: count-based automata, agent-based ecosystems,
continuous reaction-diffusion, or a transition function you write in raw JS.

Paint some cells, tweak the rules, hit play, watch what emerges. Then copy a link
and the whole universe rides along in it.

> No framework. Vanilla TypeScript + Vite, Canvas2D, ~17 KB of app JS (gzipped).
> The one heavyweight (CodeMirror) is lazy-loaded and only shows up if you open
> the JS editor.

## Quick start

```bash
npm install
npm run dev      # vite dev server
npm run build    # tsc + vite build → dist/
npm run preview  # serve the production build
```

Open the dev URL, pick something from **Load preset…**, hit play.

## Four kinds of universe

Loading a preset picks the engine; each one drives the grid differently. The
engine internals live in [`src/core`](src/core/README.md) — that README is the
deep-dive.

- **Totalistic** — classic cellular automata. Ordered rules like _"WHEN alive AND
  live-neighbours ≤ 1 → die"_, first match wins. Ships with Conway, Rock-Paper-
  Scissors (cyclic spirals), and Competitive Life.
- **Ecosystem** — agent-based, a generalization of WaTor predator-prey. Each
  state is a species with a diet, energy, breeding, lifespan, mobility, and hunt
  behaviour. Food chains and webs _emerge_ from who-eats-whom — presets cover a
  3-level chain, shared-prey competition, and a 5-species web.
- **Reaction-diffusion** — continuous Gray-Scott. Cells hold two chemical
  concentrations instead of a discrete state; tiny feed/kill tweaks flip between
  coral, mazes, spots, and travelling waves.
- **Manual (JS)** — write the per-cell transition yourself with a small API
  (`self`, `count(s)`, `get(dx,dy)`, `rand()`, …). Syntax-highlighted editor with
  autocomplete. See the safety note below.

## Things you can do

- **Paint** with a state brush (left-drag), **pan** (right/middle-drag), **zoom**
  (wheel) — HiDPI-aware camera. The grid wraps toroidally (it's a donut).
- **Edit rules visually** for totalistic worlds, tune per-species sliders for
  ecosystems, or drag feed/kill for reaction-diffusion.
- **Watch the population chart** — one line per state (or mean concentration for
  reaction).
- **Share** — the entire config is base64'd into the URL hash, so a link _is_ the
  universe. No backend, nothing to save.

## Heads-up: shared links + Manual mode

A Manual-mode universe carries its JS in the link, and that code runs in your
browser. So a shared Manual link **won't auto-run** — it drops the code into the
editor and waits for you to read it and hit **Apply**. Presets you load yourself
are trusted and run immediately.

## Project layout

```
src/
  core/      the engine — grids, steppers, RNG. No DOM. (has its own README)
  render/    Canvas2D renderer with a pan/zoom/HiDPI camera + colormap LUT
  rules/     presets (the built-in universes) + URL serialize/deserialize
  ui/        the DOM app: panels, editors, chart, the lazy CodeMirror editor
  style.css  the whole theme (pure-black amber-phosphor terminal)
  main.ts    entry point — `new App(#app)`
```

## Stack

- **TypeScript** + **Vite** — no UI framework, the DOM is built with a tiny
  `el()` helper.
- **Canvas2D** for the grid (the simulation is plain typed-array loops, not WebGL
  — yet).
- **CodeMirror 6** for the Manual-mode editor, code-split so it only loads when
  you actually open it.

## Status

A weekend-shaped project that kept growing. Built in phases — base automata →
attribute-cell ecosystems → reaction-diffusion → user-scripted rules. A WebGL
stepper (for much bigger grids) is the obvious next thing, and isn't done yet.
