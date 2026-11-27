import type { Baustein } from './types.js';

/** The entry is a help (eintragsart 'hilfe'): it supports learners inside a method and never carries a phase. */
export const istHilfe = (b: Pick<Baustein, 'eintragsart'>): boolean => b.eintragsart === 'hilfe';

/** The entry is a method (eintragsart 'methode' or none): only methods may fill a chain step, a slot or a phase. */
export const istMethode = (b: Pick<Baustein, 'eintragsart'>): boolean => !istHilfe(b);

/**
 * The methods of a list, without the helps. Every picker that offers entries for a step, a slot, a phase, a
 * replacement or a parallel method starts from this list.
 */
export const nurMethoden = <T extends Pick<Baustein, 'eintragsart'>>(list: readonly T[]): T[] => list.filter(istMethode);
