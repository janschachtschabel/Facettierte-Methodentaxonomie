/**
 * Time allocation for a sequence: shares follow the didactic role of each chain step,
 * not an equal split. Pure functions, minutes as whole numbers.
 */

/** Relative weight per learning function; the main work phases get the largest share. */
export const FUNCTION_SHARE: Record<string, number> = {
  orientierung: 12,
  erwerb: 30,
  verstehen: 30,
  problemloesen: 30,
  anwendung: 25,
  konsolidierung: 18,
  metakognition: 8,
  diagnose: 8
};

const MIN_STEP = 5;

/**
 * Budget per chain step. Each step gets at least `minStep` minutes (default 5) and at least its floor (minimum duration of a
 * method anchored there); the rest is split by the weight of the step's primary function.
 * The sum never exceeds `budget` unless the floors alone already do.
 */
export function phaseBudgets(
  steps: Array<{ funktion: string[]; zeitanteil?: number }>,
  budget: number,
  floors: Array<number | undefined> = [],
  minStep = MIN_STEP
): number[] {
  const n = steps.length;
  if (!n) return [];
  const floor = steps.map((_, i) => Math.max(minStep, floors[i] ?? 0));
  // Data first (ketten.json), learning function as fallback for chains without shares.
  const weights = steps.map((s) => (s.zeitanteil && s.zeitanteil > 0 ? s.zeitanteil : (FUNCTION_SHARE[s.funktion[0]] ?? 15)));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const out = [...floor];
  let rest = budget - out.reduce((a, b) => a + b, 0);
  if (rest <= 0) return out;
  // Target = proportional share; hand out the remaining minutes to the steps furthest below their target.
  const target = weights.map((w) => (budget * w) / totalWeight);
  while (rest > 0) {
    let pick = -1;
    let gap = 0;
    for (let i = 0; i < n; i++) {
      if (target[i] - out[i] > gap) {
        gap = target[i] - out[i];
        pick = i;
      }
    }
    if (pick < 0) break;
    out[pick] += 1;
    rest -= 1;
  }
  return out;
}

/**
 * Spreads unused time over the chosen methods in 5-minute steps, never above a method's maximum.
 * The method with the most head-room grows first. Returns the new durations in input order.
 */
export function stretch(durations: Array<{ min: number; max: number; cur: number }>, budget: number): number[] {
  const out = durations.map((d) => d.cur);
  let rest = budget - out.reduce((a, b) => a + b, 0);
  while (rest > 0) {
    let pick = -1;
    let room = 0;
    for (let i = 0; i < out.length; i++) {
      const r = durations[i].max - out[i];
      if (r > room) {
        room = r;
        pick = i;
      }
    }
    if (pick < 0) break;
    const add = Math.min(5, room, rest);
    out[pick] += add;
    rest -= add;
  }
  return out;
}
