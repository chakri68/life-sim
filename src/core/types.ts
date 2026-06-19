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
}
