/**
 * Former method ids keep working: links, saved scenarios and API calls with an old id
 * are led to the method the id was merged into or renamed to (data/weiterleitungen.json).
 */
export function resolveKennung(kennung: string, weiterleitungen?: Record<string, string>): string {
  let current = kennung;
  // Follows chains (a → b → c) and stops on a loop.
  for (let i = 0; i < 5; i++) {
    const next = weiterleitungen && Object.hasOwn(weiterleitungen, current) ? weiterleitungen[current] : undefined;
    if (!next || next === current) break;
    current = next;
  }
  return current;
}

/** Lookup by method id that also answers former ids. Iteration only yields the current methods. */
export class KennungIndex<T> extends Map<string, T> {
  constructor(
    entries: Iterable<readonly [string, T]>,
    private readonly weiterleitungen?: Record<string, string>
  ) {
    super(entries);
  }
  override get(kennung: string): T | undefined {
    return super.get(kennung) ?? super.get(resolveKennung(kennung, this.weiterleitungen));
  }
  override has(kennung: string): boolean {
    return super.has(kennung) || super.has(resolveKennung(kennung, this.weiterleitungen));
  }
}

/**
 * Rewrites former method ids in a stored plan (every `baustein` field of an arrangement, at any depth).
 * Returns the same object when nothing had to change.
 */
export function migrateKennungen<T>(value: T, weiterleitungen?: Record<string, string>): T {
  if (!weiterleitungen || !Object.keys(weiterleitungen).length) return value;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) {
      let changed = false;
      const out = v.map((x) => {
        const y = walk(x);
        if (y !== x) changed = true;
        return y;
      });
      return changed ? out : v;
    }
    if (v && typeof v === 'object') {
      let changed = false;
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        const y = k === 'baustein' && typeof x === 'string' ? resolveKennung(x, weiterleitungen) : walk(x);
        if (y !== x) changed = true;
        out[k] = y;
      }
      return changed ? out : v;
    }
    return v;
  };
  return walk(value) as T;
}
