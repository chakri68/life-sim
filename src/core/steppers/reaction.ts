import type { Simulation } from "../sim";

// Gray-Scott reaction-diffusion (continuous engine).
//
// Each cell holds two chemical concentrations, U and V. They diffuse across the
// grid and react: V consumes U (U + 2V -> 3V), U is fed in at rate F, and V
// decays at rate F+k. The update per cell is:
//   U' = U + (Du·∇²U − U·V² + F·(1−U))·dt
//   V' = V + (Dv·∇²V + U·V² − (F+k)·V)·dt
// The Laplacian ∇² uses a 9-point stencil (orthogonal 0.2, diagonal 0.05,
// center −1). Tiny changes to F/k flip between coral, mazes, spots and waves.
//
// Buffers are double-buffered Float32Arrays (sim.u/sim.v and sim.u2/sim.v2).

export function stepReaction(sim: Simulation): void {
  const cfg = sim.cfg;
  const p = cfg.reaction!;
  const w = cfg.width;
  const h = cfg.height;
  const iters = Math.max(1, p.iterations | 0);
  for (let it = 0; it < iters; it++) {
    rd(sim.u, sim.v, sim.u2, sim.v2, w, h, p.du, p.dv, p.feed, p.kill, p.dt);
    let t = sim.u;
    sim.u = sim.u2;
    sim.u2 = t;
    t = sim.v;
    sim.v = sim.v2;
    sim.v2 = t;
  }
  sim.generation++;
}

function rd(
  u: Float32Array,
  v: Float32Array,
  nu: Float32Array,
  nv: Float32Array,
  w: number,
  h: number,
  Du: number,
  Dv: number,
  F: number,
  k: number,
  dt: number,
): void {
  for (let y = 0; y < h; y++) {
    const yN = (y - 1 + h) % h;
    const yS = (y + 1) % h;
    const rowN = yN * w,
      rowS = yS * w,
      row = y * w;
    for (let x = 0; x < w; x++) {
      const xW = (x - 1 + w) % w;
      const xE = (x + 1) % w;
      const i = row + x;
      const u0 = u[i],
        v0 = v[i];

      const lapU =
        (u[row + xW] + u[row + xE] + u[rowN + x] + u[rowS + x]) * 0.2 +
        (u[rowN + xW] + u[rowN + xE] + u[rowS + xW] + u[rowS + xE]) * 0.05 -
        u0;
      const lapV =
        (v[row + xW] + v[row + xE] + v[rowN + x] + v[rowS + x]) * 0.2 +
        (v[rowN + xW] + v[rowN + xE] + v[rowS + xW] + v[rowS + xE]) * 0.05 -
        v0;

      const uvv = u0 * v0 * v0;
      const a = u0 + (Du * lapU - uvv + F * (1 - u0)) * dt;
      const b = v0 + (Dv * lapV + uvv - (F + k) * v0) * dt;
      nu[i] = a < 0 ? 0 : a > 1 ? 1 : a;
      nv[i] = b < 0 ? 0 : b > 1 ? 1 : b;
    }
  }
}

/** Reset to U=1, V=0 and drop a handful of V seeds to kick off pattern growth. */
export function seedReaction(sim: Simulation, rand: () => number): void {
  const w = sim.cfg.width;
  const h = sim.cfg.height;
  const u = sim.u;
  const v = sim.v;
  u.fill(1);
  v.fill(0);
  const blobs = 14;
  for (let b = 0; b < blobs; b++) {
    const cx = (rand() * w) | 0;
    const cy = (rand() * h) | 0;
    const r = 3 + ((rand() * 5) | 0);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = (((cx + dx) % w) + w) % w;
        const y = (((cy + dy) % h) + h) % h;
        const i = y * w + x;
        u[i] = 0.5;
        v[i] = 0.25;
      }
    }
  }
}
