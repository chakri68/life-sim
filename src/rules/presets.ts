import type { Config } from '../core/types';

const W = 160;
const H = 120;

function moore(): Config['neighborhood'] {
  return { type: 'moore', radius: 1 };
}

/** Classic Conway's Game of Life (B3/S23). */
function conway(): Config {
  return {
    name: "Conway's Life",
    width: W,
    height: H,
    neighborhood: moore(),
    seedMode: 'sparse',
    seedDensity: 0.22,
    states: [
      { name: 'Dead', color: '#0b0e14' },
      { name: 'Alive', color: '#e8e8e8' },
    ],
    rules: [
      // Birth: a dead cell with exactly 3 live neighbors comes alive.
      { when: 0, conditions: [{ state: 1, op: '=', rhs: { kind: 'const', value: 3 } }], become: 1, prob: 1 },
      // Death by underpopulation (<2 neighbors).
      { when: 1, conditions: [{ state: 1, op: '<=', rhs: { kind: 'const', value: 1 } }], become: 0, prob: 1 },
      // Death by overpopulation (>3 neighbors).
      { when: 1, conditions: [{ state: 1, op: '>=', rhs: { kind: 'const', value: 4 } }], become: 0, prob: 1 },
    ],
  };
}

/** Rock-paper-scissors cyclic dominance -> spiral waves. */
function rps(): Config {
  // Cycle: Green beats Red, Blue beats Green, Red beats Blue.
  return {
    name: 'Rock-Paper-Scissors',
    width: W,
    height: H,
    neighborhood: moore(),
    seedMode: 'uniform',
    seedDensity: 1,
    states: [
      { name: 'Red', color: '#e5484d' },
      { name: 'Green', color: '#46a758' },
      { name: 'Blue', color: '#3b82f6' },
    ],
    rules: [
      { when: 0, conditions: [{ state: 1, op: '>=', rhs: { kind: 'const', value: 3 } }], become: 1, prob: 1 },
      { when: 1, conditions: [{ state: 2, op: '>=', rhs: { kind: 'const', value: 3 } }], become: 2, prob: 1 },
      { when: 2, conditions: [{ state: 0, op: '>=', rhs: { kind: 'const', value: 3 } }], become: 0, prob: 1 },
    ],
  };
}

/** Two species competing for empty territory -> moving borders. */
function competitive(): Config {
  return {
    name: 'Competitive Life',
    width: W,
    height: H,
    neighborhood: moore(),
    seedMode: 'sparse',
    seedDensity: 0.35,
    states: [
      { name: 'Empty', color: '#0b0e14' },
      { name: 'Red', color: '#e5484d' },
      { name: 'Blue', color: '#3b82f6' },
    ],
    rules: [
      // Empty territory is claimed by whichever side has more neighbors (>=3).
      {
        when: 0,
        conditions: [
          { state: 1, op: '>=', rhs: { kind: 'const', value: 3 } },
          { state: 1, op: '>', rhs: { kind: 'count', state: 2 } },
        ],
        become: 1,
        prob: 1,
      },
      {
        when: 0,
        conditions: [
          { state: 2, op: '>=', rhs: { kind: 'const', value: 3 } },
          { state: 2, op: '>', rhs: { kind: 'count', state: 1 } },
        ],
        become: 2,
        prob: 1,
      },
      // Isolation death.
      { when: 1, conditions: [{ state: 1, op: '<=', rhs: { kind: 'const', value: 1 } }], become: 0, prob: 1 },
      { when: 2, conditions: [{ state: 2, op: '<=', rhs: { kind: 'const', value: 1 } }], become: 0, prob: 1 },
      // Overcrowding death.
      { when: 1, conditions: [{ state: 1, op: '>=', rhs: { kind: 'const', value: 6 } }], become: 0, prob: 1 },
      { when: 2, conditions: [{ state: 2, op: '>=', rhs: { kind: 'const', value: 6 } }], become: 0, prob: 1 },
    ],
  };
}

export interface Preset {
  id: string;
  label: string;
  build: () => Config;
}

export const PRESETS: Preset[] = [
  { id: 'conway', label: "Conway's Life", build: conway },
  { id: 'rps', label: 'Rock-Paper-Scissors', build: rps },
  { id: 'competitive', label: 'Competitive Life', build: competitive },
];

export function defaultConfig(): Config {
  return conway();
}
