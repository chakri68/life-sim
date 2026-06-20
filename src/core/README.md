# `core/` — the simulation engine

The headless half of the playground. No DOM, no canvas, no opinions about how
you draw things — just grids, rules, and a `step()` that advances time. The UI
in `../ui` is one consumer of this; you could write another (CLI, tests,
worker) and the engine wouldn't notice.

## The one idea

Everything is a **`Config`** (`types.ts`) — a plain, serializable object that
fully describes a universe: its size, its states/colors, its neighborhood, and
which engine drives it. Hand a `Config` to a `Simulation` and you get a running
world. Serialize it and you've got a shareable link. There is no hidden state
the `Config` doesn't capture.

```ts
import { Simulation } from "./sim";

const sim = new Simulation(cfg); // cfg: Config
sim.seed(); // random starting grid
sim.step(); // advance one generation
sim.cur; // Uint8Array of state ids, one byte per cell
sim.population(); // count per state
```

The grid is a **double-buffered flat `Uint8Array`** (`cur` / `next`, one byte =
one state id). Discrete engines compute into `next` and swap; the agent engine
mutates `cur` in place. Either way you read `sim.cur`.

## Four engines, one `step()`

`Simulation.step()` dispatches on `cfg.engine`. Each engine is a self-contained
stepper that only touches the buffers it needs:

| `engine`     | stepper                 | what it does                                                                                                                                                                                     |
| ------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `totalistic` | `stepper.ts`            | Classic cellular-automaton rewrite. Ordered rules of the shape `WHEN current AND count(state) <op> rhs → become R [prob]`, first match wins. This is Conway, RPS, etc.                           |
| `ecosystem`  | `steppers/ecosystem.ts` | Agent-based, a generalization of WaTor predator-prey. Each non-empty state is a species with a diet, energy, breeding, lifespan, mobility… Food chains/webs _emerge_ from who-eats-whom.         |
| `reaction`   | `steppers/reaction.ts`  | Continuous Gray-Scott reaction-diffusion. Cells hold two `Float32` concentrations (U/V) instead of a discrete state; a 9-point Laplacian + N sub-steps per frame → coral / maze / spots / waves. |
| `script`     | `steppers/script.ts`    | You write the per-cell transition in raw JS. Compiled once via `compileScript()`; runtime errors are caught, not thrown.                                                                         |

Add an engine by writing a stepper and adding one branch to `step()`. The buffers
are already there.

## Buffers (all flat typed arrays)

The `Simulation` owns every buffer up front and reuses them — no per-step
allocation in the hot loops.

- **Discrete:** `cur`, `next` (`Uint8Array`)
- **Agents (ecosystem):** `energy`, `age`, `life` (`Int16Array`), `moved`
  (`Uint8Array` — the "already processed this step" stamp), `order` (`Int32Array`
  — Fisher-Yates shuffled each step so processing order is unbiased)
- **Continuous (reaction):** `u`, `v`, `u2`, `v2` (`Float32Array`, ping-ponged)
- `offsets` — flat `(dx,dy)` pairs for the neighborhood

## Files

```
types.ts            Config + every shape the engine speaks. Read this first.
sim.ts              Simulation: owns buffers, dispatches step/seed/clear/paint.
stepper.ts          totalistic engine + rule matching.
neighborhood.ts     buildOffsets() → Moore (8) or Von Neumann (4) offset table.
rng.ts              mulberry32(): tiny seedable PRNG.
steppers/
  ecosystem.ts      agent engine (+ its seeding).
  reaction.ts       Gray-Scott (+ its seeding).
  script.ts         user-JS engine.
```

## Notes / things worth knowing

- **Boundaries wrap** (toroidal) everywhere — the grid is a donut.
- **RNG is swappable.** The steppers pull randomness from `sim.rand` (defaults
  to `Math.random`); `seed()` fills the grid with a seeded `mulberry32`. Point
  `sim.rand` at your own seeded generator and a run becomes byte-identical —
  that's how the engine gets tested without a screen (Conway blinkers, WaTor
  cell-conservation, reaction patterns forming, etc.).
- **Optional `Config` fields default to off.** New species knobs (`maxAge`,
  `huntThreshold`, …) are optional and treated as no-ops when absent, so older
  serialized universes keep replaying the same.
- **The engine never imports from `../ui` or `../render`.** Keep it that way —
  it's the whole point of the split.
