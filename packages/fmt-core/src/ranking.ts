/**
 * Candidate ranking for the matcher: hard tiers first, then a weighted soft score,
 * then a topic-seeded order among candidates that are practically equivalent.
 * Everything here is pure and deterministic.
 */

export interface SoftScoreParts {
  /** Requested ansatz is not among the method's approaches. */
  ansatzMiss: boolean;
  /** Number of requested soft facets (anleitung, interaktion, engagement, reichweite …) the method misses. */
  softFilterMisses: number;
  /** How often the same kind of method is already in the sequence. */
  variety: number;
  /** Minutes by which the method's minimum duration exceeds the phase budget (0 when it fits). */
  overBudgetMin: number;
  /** Method needs internet, AI or one device per learner although the request says nothing about equipment. */
  techUnasked: boolean;
  /** Text relevance 0..1 (1 = method text matches the request well). */
  textRelevance: number;
  evidence: 'A' | 'B' | 'C' | null;
  draft: boolean;
  /** Position of the method's primary function among the wanted functions (0 = first / not applicable). */
  functionPosition: number;
  vorbereitungMin: number;
  /** The request names this method. */
  mentioned: boolean;
}

export const SOFT_WEIGHTS = {
  ansatzMiss: 3,
  softFilterMiss: 2,
  variety: 2,
  overBudgetPer5Min: 1,
  overBudgetMax: 4,
  techUnasked: 3,
  textDistance: 2,
  evidence: { A: 0, B: 0.5, C: 1, none: 1.5 },
  draft: 0.5,
  functionPosition: 0.3,
  vorbereitungPerMin: 0.005,
  mentioned: -10
} as const;

/** Candidates within this distance of the best soft score count as equivalent. */
export const EQUIVALENCE_TOLERANCE = 0.75;

/** Lower is better. */
export function softScore(p: SoftScoreParts): number {
  const w = SOFT_WEIGHTS;
  return (
    (p.ansatzMiss ? w.ansatzMiss : 0) +
    p.softFilterMisses * w.softFilterMiss +
    p.variety * w.variety +
    Math.min(w.overBudgetMax, Math.ceil(Math.max(0, p.overBudgetMin) / 5) * w.overBudgetPer5Min) +
    (p.techUnasked ? w.techUnasked : 0) +
    (1 - Math.max(0, Math.min(1, p.textRelevance))) * w.textDistance +
    w.evidence[p.evidence ?? 'none'] +
    (p.draft ? w.draft : 0) +
    p.functionPosition * w.functionPosition +
    Math.min(60, Math.max(0, p.vorbereitungMin)) * w.vorbereitungPerMin +
    (p.mentioned ? w.mentioned : 0)
  );
}

/** 32-bit FNV-1a mapped to [0, 1). Stable across platforms and runs. */
export function stableHash(seed: string, id: string): number {
  let h = 0x811c9dc5;
  const s = `${seed}\u0000${id}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Final avalanche so that similar ids do not end up next to each other.
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 0x100000000;
}

export interface Rankable<T> {
  item: T;
  id: string;
  hard: number[];
  soft: number;
}

const compareHard = (a: number[], b: number[]) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
};

/**
 * Orders candidates: hard tiers ascending; inside the best hard tier, all candidates whose soft score is
 * within `tolerance` of the best are ordered by a hash of (seed, variante, id) – so a different topic or a
 * different `variante` yields a different but equally suitable pick. Everything else follows by soft score.
 * `tolerance: 0` gives a plain best-first list (used for single-phase proposals).
 */
export function pickOrder<T>(items: Array<Rankable<T>>, seed: string, variante = 0, tolerance = EQUIVALENCE_TOLERANCE): T[] {
  const key = `${seed}#${variante}`;
  const plain = (a: Rankable<T>, b: Rankable<T>) =>
    compareHard(a.hard, b.hard) || a.soft - b.soft || stableHash(key, a.id) - stableHash(key, b.id) || a.id.localeCompare(b.id);
  const sorted = [...items].sort(plain);
  if (!sorted.length || tolerance <= 0) return sorted.map((x) => x.item);
  const best = sorted[0];
  const equivalent = sorted.filter((x) => compareHard(x.hard, best.hard) === 0 && x.soft <= best.soft + tolerance);
  const rest = sorted.filter((x) => !equivalent.includes(x));
  equivalent.sort((a, b) => stableHash(key, a.id) - stableHash(key, b.id) || a.id.localeCompare(b.id));
  return [...equivalent, ...rest].map((x) => x.item);
}
