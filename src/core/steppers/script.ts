import type { Simulation } from '../sim';

// Manual engine: the user supplies a JS transition function (compiled in
// Simulation.compileScript). It runs once per cell each generation with a small
// helper API and returns the cell's next state. Double-buffered like the
// totalistic engine. A runtime error aborts the step (returning false so the
// buffers aren't swapped) and is surfaced to the UI via sim.scriptError.
export function stepScript(sim: Simulation): boolean {
  const fn = sim.scriptFn;
  if (!fn) return false;

  const cur = sim.cur;
  const next = sim.next;
  const w = sim.cfg.width;
  const h = sim.cfg.height;
  const nStates = sim.cfg.states.length;
  const offs = sim.offsets;
  const nOff = offs.length >> 1;
  const rand = sim.rand;
  const gen = sim.generation;

  // A mutable cursor the helper closures read. Updated per cell so we build the
  // closures once, not once per cell.
  let px = 0;
  let py = 0;

  const get = (dx: number, dy: number): number => {
    let nx = (px + dx) % w;
    let ny = (py + dy) % h;
    if (nx < 0) nx += w;
    if (ny < 0) ny += h;
    return cur[ny * w + nx];
  };

  const count = (state: number): number => {
    let n = 0;
    for (let k = 0; k < nOff; k++) {
      let nx = px + offs[k * 2];
      let ny = py + offs[k * 2 + 1];
      if (nx < 0) nx += w; else if (nx >= w) nx -= w;
      if (ny < 0) ny += h; else if (ny >= h) ny -= h;
      if (cur[ny * w + nx] === state) n++;
    }
    return n;
  };

  try {
    let i = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++, i++) {
        px = x;
        py = y;
        const self = cur[i];
        const r = fn(self, count, get, x, y, gen, rand);
        // Guard the return: a non-number or out-of-range result leaves the cell.
        next[i] = typeof r === 'number' && r >= 0 && r < nStates ? r | 0 : self;
      }
    }
  } catch (e) {
    sim.scriptError = e instanceof Error ? e.message : String(e);
    return false;
  }
  return true;
}
