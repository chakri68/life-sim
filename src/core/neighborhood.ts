import type { Neighborhood } from "./types";

/**
 * Precompute neighbor (dx, dy) offsets as a flat [dx0, dy0, dx1, dy1, ...]
 * array. Flat typed arrays keep the hot stepper loop allocation-free.
 */
export function buildOffsets(n: Neighborhood): Int32Array {
  const offs: number[] = [];
  const r = Math.max(1, n.radius | 0);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (n.type === "vonneumann" && Math.abs(dx) + Math.abs(dy) > r) continue;
      offs.push(dx, dy);
    }
  }
  return Int32Array.from(offs);
}
