// Core data model for the cellular-automaton playground.
//
// A "universe" is fully described by a Config: its palette of states, the
// neighborhood shape, and an ordered list of transition rules. Everything in
// the app (engine, renderer, UI, sharing) is driven off this one object.

/** A single state in the palette. Its id is its index in Config.states. */
export interface StateDef {
  name: string;
  /** Hex color, e.g. "#e5484d". */
  color: string;
}

export type CompareOp = '=' | '!=' | '>' | '>=' | '<' | '<=';

/** Right-hand side of a condition: either a constant or another state's count. */
export type ConditionRhs =
  | { kind: 'const'; value: number }
  | { kind: 'count'; state: number };

/**
 * One AND-clause of a rule. Reads as:
 *   count(state) <op> rhs
 * e.g. count(Alive) >= 4, or count(Red) > count(Blue).
 */
export interface Condition {
  state: number;
  op: CompareOp;
  rhs: ConditionRhs;
}

/**
 * A transition rule. Rules are evaluated top-to-bottom, first match wins.
 * If no rule matches, the cell keeps its current state.
 *
 *   WHEN current = `when`  AND  all `conditions`  ->  become `become`   [prob]
 *
 * `when = -1` matches any current state.
 */
export interface Rule {
  when: number;
  conditions: Condition[];
  become: number;
  /** Probability 0..1 the rule fires when matched (1 = always). */
  prob: number;
}

export type NeighborhoodType = 'moore' | 'vonneumann';

export interface Neighborhood {
  type: NeighborhoodType;
  radius: number;
}

export type SeedMode = 'sparse' | 'uniform';

/**
 * Which stepping engine drives the universe.
 *  - 'totalistic': the count-based rewrite engine (uses `rules`).
 *  - 'ecosystem':  agent-based multi-species engine with per-cell energy
 *                  (uses `ecosystem`). Generalizes WaTor predator-prey into
 *                  arbitrary food chains and webs.
 *  - 'reaction':   continuous Gray-Scott reaction-diffusion (uses `reaction`).
 *                  Cells hold two float concentrations instead of a discrete
 *                  state, producing coral / maze / spot / wave patterns.
 *  - 'script':     discrete like 'totalistic', but the per-cell transition is a
 *                  user-supplied JS function (`script`) instead of rule rows.
 */
export type EngineKind = 'totalistic' | 'ecosystem' | 'reaction' | 'script';

/**
 * A compiled manual-rule transition. Runs once per cell each generation and
 * returns the cell's next state.
 *  - self:  the cell's current state id
 *  - count: neighbors in a given state (uses the universe's neighborhood)
 *  - get:   a neighbor's state at an (dx, dy) offset, wrapping toroidally
 *  - x, y:  cell coordinates; gen: current generation; rand: () => [0,1)
 */
export type ScriptFn = (
  self: number,
  count: (state: number) => number,
  get: (dx: number, dy: number) => number,
  x: number,
  y: number,
  gen: number,
  rand: () => number,
) => number;

/**
 * Gray-Scott reaction-diffusion parameters. Two chemicals U and V diffuse and
 * react; `feed` adds U, `kill` removes V. Small changes in feed/kill produce
 * wildly different Turing patterns.
 */
export interface ReactionParams {
  feed: number;       // F: feed rate of U
  kill: number;       // k: kill rate of V
  du: number;         // diffusion rate of U
  dv: number;         // diffusion rate of V
  dt: number;         // integration timestep
  iterations: number; // simulation sub-steps per displayed step
  /** Colormap stops (hex), low → high concentration of V. */
  colors: string[];
}

/**
 * Behavior of one species in the ecosystem engine. There is one entry per
 * state id (index matches Config.states); index 0 is the Empty placeholder and
 * is ignored. Food chains/webs emerge purely from each species' `diet`.
 */
export interface SpeciesParams {
  /** Can it move into empty neighbors? Plants/producers are immobile. */
  mobile: boolean;
  /** Chance (0–1) a mobile unit acts (hunts/moves/breeds) on a given step;
   *  the rest of the time it rests in place. Defaults to 1. Ignored if immobile. */
  moveProb?: number;
  /** Chance (0–1) a pounce on adjacent prey actually catches it. On a miss the
   *  prey escapes and the predator wanders instead. Defaults to 1. Needs a diet. */
  huntSuccess?: number;
  /** Only hunt when energy is below this. undefined = always hunt (the default).
   *  A sated predator above the threshold spares nearby prey and just wanders. */
  huntThreshold?: number;
  /** State ids this species eats (moving onto and consuming the prey). */
  diet: number[];
  /** Steps before it reproduces. 0 = never breeds. */
  breedTime: number;
  /** Steps before it dies of old age (absolute lifespan). 0 = immortal. */
  maxAge?: number;
  /** Energy lost per step. 0 = never starves (e.g. plants, WaTor fish). */
  metabolism: number;
  /** Energy a newborn / freshly seeded individual starts with. */
  startEnergy: number;
  /** Energy gained per prey eaten. */
  gain: number;
  /** Fraction of the grid seeded with this species on Randomize. */
  seedDensity: number;
}

export interface EcosystemParams {
  /** Parallel to Config.states; species[0] is the (ignored) Empty slot. */
  species: SpeciesParams[];
}

/** A complete, serializable description of a universe. */
export interface Config {
  name: string;
  width: number;
  height: number;
  states: StateDef[];
  neighborhood: Neighborhood;
  rules: Rule[];
  /** How "Randomize" fills the grid. */
  seedMode: SeedMode;
  /** Fraction of cells seeded non-empty when seedMode = 'sparse'. */
  seedDensity: number;
  /** Stepping engine; absent/legacy configs default to 'totalistic'. */
  engine?: EngineKind;
  /** Required when engine = 'ecosystem'. */
  ecosystem?: EcosystemParams;
  /** Required when engine = 'reaction'. */
  reaction?: ReactionParams;
  /** Source of the transition function when engine = 'script'. */
  script?: string;
}
