import type { Simulation } from '../sim';

// Multi-species agent engine — a generalization of WaTor predator-prey.
//
// Every non-empty state is a species with its own diet, mobility, breed timer,
// metabolism and energy. Food chains and webs emerge entirely from who eats
// whom: a predator with diet [rabbit, mouse] is an omnivore; a rabbit listed in
// both fox's and hawk's diets is shared prey. Plants are immobile producers
// that spread into empty cells without needing food.
//
// Like WaTor this is agent-based: it mutates ONE grid in place, processing
// cells in a fresh random order each step, using a `moved` stamp so an agent
// (or an eaten prey) is never processed twice.

const EMPTY = 0;

export function stepEcosystem(sim: Simulation): void {
  const cfg = sim.cfg;
  const species = cfg.ecosystem!.species;
  const n = species.length;
  const w = cfg.width;
  const h = cfg.height;
  const state = sim.cur;
  const energy = sim.energy;
  const age = sim.age;
  const life = sim.life;
  const moved = sim.moved;
  const order = sim.order;
  const offs = sim.offsets;
  const nOff = offs.length >> 1;
  const rand = sim.rand;

  // Flatten diets into an n*n lookup so the hot loop avoids array scans.
  const eats = new Uint8Array(n * n);
  for (let s = 1; s < n; s++) {
    for (const t of species[s].diet) {
      if (t > 0 && t < n) eats[s * n + t] = 1;
    }
  }

  moved.fill(0);

  // Fisher-Yates shuffle for an unbiased processing order each step.
  for (let i = order.length - 1; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    const t = order[i];
    order[i] = order[j];
    order[j] = t;
  }

  const empties = new Int32Array(nOff);
  const foods = new Int32Array(nOff);

  for (let oi = 0; oi < order.length; oi++) {
    const i = order[oi];
    if (moved[i]) continue;
    const s = state[i];
    if (s === EMPTY) continue;
    const sp = species[s];

    age[i]++;
    life[i]++;

    // Old age: die once absolute life exceeds the species' lifespan.
    if (sp.maxAge !== undefined && sp.maxAge > 0 && life[i] >= sp.maxAge) {
      state[i] = EMPTY;
      moved[i] = 1;
      continue;
    }

    if (sp.metabolism > 0) {
      energy[i] -= sp.metabolism;
      if (energy[i] <= 0) {
        state[i] = EMPTY;
        moved[i] = 1;
        continue;
      }
    }

    // Mobility: a mobile unit may rest this step (no hunt/move/breed). It still
    // aged and paid metabolism above. Immobile producers ignore this.
    if (sp.mobile && sp.moveProb !== undefined && sp.moveProb < 1 && rand() >= sp.moveProb) {
      moved[i] = 1;
      continue;
    }

    const x = i % w;
    const y = (i / w) | 0;
    let ne = 0;
    let nf = 0;
    for (let k = 0; k < nOff; k++) {
      let nx = x + offs[k * 2];
      let ny = y + offs[k * 2 + 1];
      if (nx < 0) nx += w; else if (nx >= w) nx -= w;
      if (ny < 0) ny += h; else if (ny >= h) ny -= h;
      const ni = ny * w + nx;
      if (moved[ni]) continue;
      const ns = state[ni];
      if (ns === EMPTY) empties[ne++] = ni;
      else if (eats[s * n + ns]) foods[nf++] = ni;
    }

    // Immobile producer (plant): spread into an empty neighbor on the timer.
    if (!sp.mobile) {
      if (sp.breedTime > 0 && age[i] >= sp.breedTime && ne > 0) {
        const t = empties[(rand() * ne) | 0];
        state[t] = s;
        energy[t] = sp.startEnergy;
        age[t] = 0;
        life[t] = 0;
        moved[t] = 1;
        age[i] = 0;
      }
      moved[i] = 1;
      continue;
    }

    // Mobile consumer: pounce on prey if the hunt lands, else wander into empty
    // space. huntSuccess >= 1 (the default) short-circuits before any extra roll,
    // so default behavior is unchanged. On a miss the prey escapes.
    let target = -1;
    let ate = false;
    const hunt = sp.huntSuccess ?? 1;
    // Hunger gating: a sated predator (energy at/above its threshold) ignores
    // prey. undefined threshold = always hungry, so default behavior is unchanged.
    const hungry = sp.huntThreshold === undefined || energy[i] < sp.huntThreshold;
    if (nf > 0 && hungry && (hunt >= 1 || rand() < hunt)) {
      target = foods[(rand() * nf) | 0];
      ate = true;
    } else if (ne > 0) {
      target = empties[(rand() * ne) | 0];
    }
    if (target < 0) {
      moved[i] = 1; // boxed in (energy already spent this step)
      continue;
    }

    const en = energy[i] + (ate ? sp.gain : 0);
    const breed = sp.breedTime > 0 && age[i] >= sp.breedTime;
    if (breed) {
      // Parent stays put and resets; child takes the target cell.
      const child = sp.metabolism > 0 ? en >> 1 : sp.startEnergy;
      const parentEnergy = sp.metabolism > 0 ? en - (en >> 1) : en;
      state[i] = s;
      energy[i] = parentEnergy;
      age[i] = 0;       // parent's breed timer resets, but its life keeps running
      moved[i] = 1;
      state[target] = s;
      energy[target] = child;
      age[target] = 0;
      life[target] = 0; // newborn
      moved[target] = 1;
    } else {
      // Move onto the target (consuming prey if it was food): same individual
      // relocating, so it carries its age and life with it.
      state[target] = s;
      energy[target] = en;
      age[target] = age[i];
      life[target] = life[i];
      moved[target] = 1;
      state[i] = EMPTY;
    }
  }

  sim.generation++;
}

/** Random initial placement weighted by each species' seedDensity. */
export function seedEcosystem(sim: Simulation, rand: () => number): void {
  const cfg = sim.cfg;
  const species = cfg.ecosystem!.species;
  const n = species.length;
  const state = sim.cur;
  const energy = sim.energy;
  const age = sim.age;
  const life = sim.life;
  for (let i = 0; i < state.length; i++) {
    const r = rand();
    let acc = 0;
    let assigned = EMPTY;
    for (let s = 1; s < n; s++) {
      acc += species[s].seedDensity;
      if (r < acc) { assigned = s; break; }
    }
    state[i] = assigned;
    if (assigned === EMPTY) {
      energy[i] = 0;
      age[i] = 0;
      life[i] = 0;
    } else {
      const sp = species[assigned];
      energy[i] = sp.startEnergy;
      age[i] = sp.breedTime > 0 ? (rand() * sp.breedTime) | 0 : 0;
      // Stagger starting ages across the lifespan so they don't all die at once.
      // Only consumes RNG when maxAge is set, so default seeding is unchanged.
      life[i] = sp.maxAge && sp.maxAge > 0 ? (rand() * sp.maxAge) | 0 : 0;
    }
  }
}
