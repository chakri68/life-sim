import type { Config, SpeciesParams, StateDef } from "../core/types";

const W = 160;
const H = 120;

function moore(): Config["neighborhood"] {
  return { type: "moore", radius: 1 };
}

/** Classic Conway's Game of Life (B3/S23). */
function conway(): Config {
  return {
    name: "Conway's Life",
    width: W,
    height: H,
    neighborhood: moore(),
    seedMode: "sparse",
    seedDensity: 0.22,
    states: [
      { name: "Dead", color: "#0b0e14" },
      { name: "Alive", color: "#e8e8e8" },
    ],
    rules: [
      // Birth: a dead cell with exactly 3 live neighbors comes alive.
      {
        when: 0,
        conditions: [{ state: 1, op: "=", rhs: { kind: "const", value: 3 } }],
        become: 1,
        prob: 1,
      },
      // Death by underpopulation (<2 neighbors).
      {
        when: 1,
        conditions: [{ state: 1, op: "<=", rhs: { kind: "const", value: 1 } }],
        become: 0,
        prob: 1,
      },
      // Death by overpopulation (>3 neighbors).
      {
        when: 1,
        conditions: [{ state: 1, op: ">=", rhs: { kind: "const", value: 4 } }],
        become: 0,
        prob: 1,
      },
    ],
  };
}

/** Rock-paper-scissors cyclic dominance -> spiral waves. */
function rps(): Config {
  // Cycle: Green beats Red, Blue beats Green, Red beats Blue.
  return {
    name: "Rock-Paper-Scissors",
    width: W,
    height: H,
    neighborhood: moore(),
    seedMode: "uniform",
    seedDensity: 1,
    states: [
      { name: "Red", color: "#e5484d" },
      { name: "Green", color: "#46a758" },
      { name: "Blue", color: "#3b82f6" },
    ],
    rules: [
      {
        when: 0,
        conditions: [{ state: 1, op: ">=", rhs: { kind: "const", value: 3 } }],
        become: 1,
        prob: 1,
      },
      {
        when: 1,
        conditions: [{ state: 2, op: ">=", rhs: { kind: "const", value: 3 } }],
        become: 2,
        prob: 1,
      },
      {
        when: 2,
        conditions: [{ state: 0, op: ">=", rhs: { kind: "const", value: 3 } }],
        become: 0,
        prob: 1,
      },
    ],
  };
}

/** Two species competing for empty territory -> moving borders. */
function competitive(): Config {
  return {
    name: "Competitive Life",
    width: W,
    height: H,
    neighborhood: moore(),
    seedMode: "sparse",
    seedDensity: 0.35,
    states: [
      { name: "Empty", color: "#0b0e14" },
      { name: "Red", color: "#e5484d" },
      { name: "Blue", color: "#3b82f6" },
    ],
    rules: [
      // Empty territory is claimed by whichever side has more neighbors (>=3).
      {
        when: 0,
        conditions: [
          { state: 1, op: ">=", rhs: { kind: "const", value: 3 } },
          { state: 1, op: ">", rhs: { kind: "count", state: 2 } },
        ],
        become: 1,
        prob: 1,
      },
      {
        when: 0,
        conditions: [
          { state: 2, op: ">=", rhs: { kind: "const", value: 3 } },
          { state: 2, op: ">", rhs: { kind: "count", state: 1 } },
        ],
        become: 2,
        prob: 1,
      },
      // Isolation death.
      {
        when: 1,
        conditions: [{ state: 1, op: "<=", rhs: { kind: "const", value: 1 } }],
        become: 0,
        prob: 1,
      },
      {
        when: 2,
        conditions: [{ state: 2, op: "<=", rhs: { kind: "const", value: 1 } }],
        become: 0,
        prob: 1,
      },
      // Overcrowding death.
      {
        when: 1,
        conditions: [{ state: 1, op: ">=", rhs: { kind: "const", value: 6 } }],
        become: 0,
        prob: 1,
      },
      {
        when: 2,
        conditions: [{ state: 2, op: ">=", rhs: { kind: "const", value: 6 } }],
        become: 0,
        prob: 1,
      },
    ],
  };
}

// ---- ecosystem helpers --------------------------------------------------

const EMPTY_SPECIES: SpeciesParams = {
  mobile: false,
  diet: [],
  breedTime: 0,
  metabolism: 0,
  startEnergy: 0,
  gain: 0,
  seedDensity: 0,
};

/** A producer (plant): immobile, never starves, spreads into empty cells. */
function plant(seedDensity: number, breedTime = 3): SpeciesParams {
  return {
    mobile: false,
    diet: [],
    breedTime,
    metabolism: 0,
    startEnergy: 1,
    gain: 0,
    seedDensity,
  };
}

/** A mobile consumer that eats the given species. */
function animal(
  diet: number[],
  o: {
    breedTime: number;
    startEnergy: number;
    gain: number;
    seedDensity: number;
    metabolism?: number;
    moveProb?: number;
    huntSuccess?: number;
    huntThreshold?: number;
    maxAge?: number;
  },
): SpeciesParams {
  return {
    mobile: true,
    moveProb: o.moveProb ?? 1,
    huntSuccess: o.huntSuccess ?? 1,
    huntThreshold: o.huntThreshold,
    maxAge: o.maxAge ?? 0,
    diet,
    breedTime: o.breedTime,
    metabolism: o.metabolism ?? 1,
    startEnergy: o.startEnergy,
    gain: o.gain,
    seedDensity: o.seedDensity,
  };
}

function ecosystem(
  name: string,
  cells: Array<{ state: StateDef; species: SpeciesParams }>,
  neighborhood: Config["neighborhood"] = { type: "moore", radius: 1 },
): Config {
  return {
    name,
    width: W,
    height: H,
    neighborhood,
    engine: "ecosystem",
    seedMode: "sparse",
    seedDensity: 0.5,
    rules: [],
    states: [{ name: "Empty", color: "#0b0e14" }, ...cells.map((c) => c.state)],
    ecosystem: { species: [EMPTY_SPECIES, ...cells.map((c) => c.species)] },
  };
}

// ---- ecosystem presets --------------------------------------------------

/** Classic 2-species WaTor: fish breed freely, sharks eat them or starve. */
function predatorPrey(): Config {
  return ecosystem(
    "Predator-Prey (WaTor)",
    [
      // Fish: mobile but never starves; breeds on a timer (no diet).
      {
        state: { name: "Fish", color: "#3b82f6" },
        species: {
          mobile: true,
          diet: [],
          breedTime: 4,
          metabolism: 0,
          startEnergy: 1,
          gain: 0,
          seedDensity: 0.32,
        },
      },
      // Shark (state 2) eats fish (state 1).
      {
        state: { name: "Shark", color: "#e5484d" },
        species: animal([1], {
          breedTime: 12,
          startEnergy: 12,
          gain: 4,
          seedDensity: 0.06,
        }),
      },
    ],
    { type: "vonneumann", radius: 1 },
  ); // classic WaTor uses 4-neighbor adjacency
}

/** 3-level trophic chain: grass → rabbit → fox. */
function foodChain(): Config {
  return ecosystem("Food Chain · grass→rabbit→fox", [
    { state: { name: "Grass", color: "#3a7d35" }, species: plant(0.4, 3) }, // 1
    {
      state: { name: "Rabbit", color: "#d8c79a" }, // 2
      species: animal([1], {
        breedTime: 6,
        startEnergy: 8,
        gain: 4,
        seedDensity: 0.12,
      }),
    },
    {
      state: { name: "Fox", color: "#e8833a" }, // 3
      species: animal([2], {
        breedTime: 14,
        startEnergy: 16,
        gain: 8,
        seedDensity: 0.04,
      }),
    },
  ]);
}

/** One predator, two prey competing for the same grass. */
function twoPrey(): Config {
  return ecosystem("Two Prey · rabbit & mouse vs fox", [
    { state: { name: "Grass", color: "#3a7d35" }, species: plant(0.42, 3) }, // 1
    {
      state: { name: "Rabbit", color: "#d8c79a" }, // 2
      species: animal([1], {
        breedTime: 6,
        startEnergy: 8,
        gain: 4,
        seedDensity: 0.1,
      }),
    },
    {
      state: { name: "Mouse", color: "#9aa0a6" }, // 3 (breeds faster, weaker)
      species: animal([1], {
        breedTime: 4,
        startEnergy: 6,
        gain: 3,
        seedDensity: 0.1,
      }),
    },
    {
      state: { name: "Fox", color: "#e8833a" }, // 4 eats both
      species: animal([2, 3], {
        breedTime: 14,
        startEnergy: 16,
        gain: 8,
        seedDensity: 0.03,
      }),
    },
  ]);
}

/**
 * A 5-species web on a shared grass base: two herbivores (rabbit, deer) and a
 * predator specialized on each (hawk→rabbit, wolf→deer). They stay coupled
 * through competition for grass — a boom in one herbivore starves the grass and
 * ripples through everyone — so all five coexist.
 */
function foodWeb(): Config {
  return ecosystem("Food Web · grass→rabbit→hawk · grass→deer→wolf", [
    { state: { name: "Grass", color: "#3a7d35" }, species: plant(0.45, 2) }, // 1
    {
      state: { name: "Rabbit", color: "#d8c79a" }, // 2
      species: animal([1], {
        breedTime: 6,
        startEnergy: 8,
        gain: 4,
        seedDensity: 0.1,
      }),
    },
    {
      state: { name: "Deer", color: "#b07a4f" }, // 3
      species: animal([1], {
        breedTime: 8,
        startEnergy: 14,
        gain: 7,
        seedDensity: 0.07,
      }),
    },
    {
      state: { name: "Wolf", color: "#c6cbd4" }, // 4 hunts deer
      species: animal([3], {
        breedTime: 14,
        startEnergy: 18,
        gain: 10,
        seedDensity: 0.03,
      }),
    },
    {
      state: { name: "Hawk", color: "#8b5cf6" }, // 5 hunts rabbit
      species: animal([2], {
        breedTime: 11,
        startEnergy: 16,
        gain: 9,
        seedDensity: 0.04,
      }),
    },
  ]);
}

// ---- reaction-diffusion presets -----------------------------------------

// Gray-Scott runs on a larger square grid so the Turing patterns have room.
const RD = 220;

function reactionPreset(
  name: string,
  feed: number,
  kill: number,
  colors: string[],
): Config {
  return {
    name,
    width: RD,
    height: RD,
    neighborhood: { type: "moore", radius: 1 }, // unused by the reaction engine
    engine: "reaction",
    seedMode: "sparse",
    seedDensity: 0,
    rules: [],
    states: [{ name: "Concentration", color: colors[colors.length - 1] }],
    reaction: { feed, kill, du: 0.16, dv: 0.08, dt: 1, iterations: 10, colors },
  };
}

const RAMP_TEAL = ["#04121d", "#0b3d5c", "#16a3a3", "#f4f1bb"];
const RAMP_VIOLET = ["#0a0514", "#3b1d6b", "#b146d1", "#ffe6f7"];
const RAMP_AMBER = ["#160a05", "#6b3a1b", "#e0902f", "#fff2dc"];
const RAMP_ICE = ["#05070b", "#1c4f8c", "#49c2ff", "#eaf6ff"];
const RAMP_INDIGO = ["#05060d", "#2a2a6b", "#6c6cff", "#e8e8ff"];

// Classic Pearson F/k coordinates for well-known pattern families.
const coral = () =>
  reactionPreset("Coral (Gray-Scott)", 0.0545, 0.062, RAMP_TEAL);
const mitosis = () =>
  reactionPreset("Mitosis · dividing spots", 0.0367, 0.0649, RAMP_VIOLET);
const maze = () => reactionPreset("Maze", 0.029, 0.057, RAMP_ICE);
const worms = () =>
  reactionPreset("Worms / fingerprints", 0.054, 0.063, RAMP_AMBER);
const waves = () => reactionPreset("Waves", 0.014, 0.045, RAMP_INDIGO);

const MANUAL_SCRIPT = `// Conway's Life — edit me, then hit Apply.
const n = count(1);
if (self === 1) return (n === 2 || n === 3) ? 1 : 0;
return n === 3 ? 1 : 0;`;

/** Blank-slate manual engine: write the transition function in raw JS. */
function manual(): Config {
  return {
    name: "Manual (JS)",
    width: W,
    height: H,
    neighborhood: moore(),
    engine: "script",
    seedMode: "sparse",
    seedDensity: 0.22,
    states: [
      { name: "Dead", color: "#0b0e14" },
      { name: "Alive", color: "#e8e8e8" },
    ],
    rules: [],
    script: MANUAL_SCRIPT,
  };
}

export interface Preset {
  id: string;
  label: string;
  build: () => Config;
}

export const PRESETS: Preset[] = [
  { id: "conway", label: "Conway's Life", build: conway },
  { id: "rps", label: "Rock-Paper-Scissors", build: rps },
  { id: "competitive", label: "Competitive Life", build: competitive },
  { id: "predator-prey", label: "Predator-Prey (WaTor)", build: predatorPrey },
  {
    id: "food-chain",
    label: "Food Chain (grass→rabbit→fox)",
    build: foodChain,
  },
  { id: "two-prey", label: "Two Prey vs One Predator", build: twoPrey },
  { id: "food-web", label: "Food Web (5 species)", build: foodWeb },
  { id: "coral", label: "Reaction · Coral", build: coral },
  { id: "mitosis", label: "Reaction · Mitosis (spots)", build: mitosis },
  { id: "maze", label: "Reaction · Maze", build: maze },
  { id: "worms", label: "Reaction · Worms", build: worms },
  { id: "waves", label: "Reaction · Waves", build: waves },
  { id: "manual", label: "Manual (JS)", build: manual },
];

/** Pattern presets selectable from the reaction params panel (sets F/k). */
export const REACTION_PATTERNS: Array<{
  label: string;
  feed: number;
  kill: number;
}> = [
  { label: "Coral", feed: 0.0545, kill: 0.062 },
  { label: "Mitosis", feed: 0.0367, kill: 0.0649 },
  { label: "Maze", feed: 0.029, kill: 0.057 },
  { label: "Worms", feed: 0.054, kill: 0.063 },
  { label: "Waves", feed: 0.014, kill: 0.045 },
  { label: "Holes", feed: 0.039, kill: 0.058 },
  { label: "Chaos", feed: 0.026, kill: 0.051 },
];

export function defaultConfig(): Config {
  return conway();
}
