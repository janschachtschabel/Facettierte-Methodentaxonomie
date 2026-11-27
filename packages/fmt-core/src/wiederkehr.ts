import type { Baustein, WiederkehrNode } from './types.js';

/** Row of a plan table for a distributed repetition (Wiederkehr node), as every table of the plan shows it. */
export interface WiederkehrZeile {
  phaseLabel: string;
  /** Minutes inside the plan: 0 when the repetitions take place in later sessions. */
  durationMin: number;
  /** Minutes of all repetitions in later sessions (node with ausserhalbBudget); absent otherwise. */
  dauerAusserhalbMin?: number;
  wiederkehr: true;
}

/**
 * Label and minutes of a Wiederkehr node: repetitions in later sessions (ausserhalbBudget, every plan up to 180 min)
 * count 0 minutes in this plan and carry their minutes in dauerAusserhalbMin; inside a longer plan they count.
 * The single duration falls back to the method's minimum duration, then to 10 minutes.
 */
export function wiederkehrZeile(node: Pick<WiederkehrNode, 'dauerMin' | 'anzahl' | 'ausserhalbBudget'>, baustein?: Pick<Baustein, 'dauerMin'>): WiederkehrZeile {
  const einzeln = typeof node.dauerMin === 'number' && Number.isFinite(node.dauerMin) ? node.dauerMin : (baustein?.dauerMin ?? 10);
  const anzahl = typeof node.anzahl === 'number' && node.anzahl > 0 ? node.anzahl : 1;
  const takt = `${anzahl}× à ${einzeln} min`;
  return node.ausserhalbBudget
    ? { phaseLabel: `Wiederkehr in Folgestunden (${takt})`, durationMin: 0, dauerAusserhalbMin: einzeln * anzahl, wiederkehr: true }
    : { phaseLabel: `Wiederkehr (${takt})`, durationMin: einzeln * anzahl, wiederkehr: true };
}
