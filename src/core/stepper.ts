import type { Config, Rule } from "./types";

/**
 * Advance the grid one generation (Tier-1 totalistic engine).
 *
 * For every cell we tally how many neighbors are in each state, then walk the
 * rule list top-to-bottom and apply the first one that matches. No match =>
 * the cell keeps its state. Boundaries wrap (toroidal).
 *
 * `counts` is passed in so we reuse one scratch buffer across all cells.
 */
export function step(
  cur: Uint8Array,
  next: Uint8Array,
  cfg: Config,
  offsets: Int32Array,
  counts: Int32Array,
  rand: () => number,
): void {
  const { width: w, height: h, rules } = cfg;
  const numStates = counts.length;
  const nOff = offsets.length >> 1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const self = cur[idx];

      counts.fill(0);
      for (let k = 0; k < nOff; k++) {
        let nx = x + offsets[k * 2];
        let ny = y + offsets[k * 2 + 1];
        // Toroidal wrap.
        if (nx < 0) nx += w;
        else if (nx >= w) nx -= w;
        if (ny < 0) ny += h;
        else if (ny >= h) ny -= h;
        counts[cur[ny * w + nx]]++;
      }

      let result = self;
      for (let r = 0; r < rules.length; r++) {
        const rule = rules[r];
        if (rule.when >= 0 && rule.when !== self) continue;
        if (rule.become >= numStates) continue;
        if (!matches(rule, counts)) continue;
        if (rule.prob < 1 && rand() > rule.prob) continue;
        result = rule.become;
        break;
      }
      next[idx] = result;
    }
  }
}

function matches(rule: Rule, counts: Int32Array): boolean {
  const conds = rule.conditions;
  for (let i = 0; i < conds.length; i++) {
    const c = conds[i];
    const left = counts[c.state] ?? 0;
    const right =
      c.rhs.kind === "const" ? c.rhs.value : (counts[c.rhs.state] ?? 0);
    if (!compare(left, c.op, right)) return false;
  }
  return true;
}

function compare(a: number, op: string, b: number): boolean {
  switch (op) {
    case "=":
      return a === b;
    case "!=":
      return a !== b;
    case ">":
      return a > b;
    case ">=":
      return a >= b;
    case "<":
      return a < b;
    case "<=":
      return a <= b;
    default:
      return false;
  }
}
