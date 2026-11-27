import type { Baustein, FmtData } from '../../src/types.js';

/** Kennung of the fixture help added by mitHilfe. */
export const FIXTURE_HILFE = 'wortspeicher-fixture';

/**
 * The data plus one help named "Wortspeicher". It is a copy of the Placemat (a method the planner places readily) with
 * eintragsart 'hilfe', and it keeps the Placemat's learning states on purpose: a help must stay out of every phase
 * because of its kind, not because it happens to deliver nothing. Tests do not depend on which real entries are helps.
 */
export function mitHilfe(D: FmtData): FmtData {
  const vorlage = D.bausteine.find((b) => b.kennung === 'placemat')!;
  const hilfe: Baustein = { ...vorlage, kennung: FIXTURE_HILFE, name: 'Wortspeicher', alternativname: [], eintragsart: 'hilfe' };
  return { ...D, bausteine: [...D.bausteine, hilfe] };
}

/** The data with the named entries marked as helps. */
export function alsHilfe(D: FmtData, kennungen: Iterable<string>): FmtData {
  const ids = new Set(kennungen);
  return { ...D, bausteine: D.bausteine.map((b) => (ids.has(b.kennung) ? { ...b, eintragsart: 'hilfe' as const } : b)) };
}
