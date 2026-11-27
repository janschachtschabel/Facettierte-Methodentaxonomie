import { istHilfe, type Baustein } from '@fmt/core';

/** Counts of the catalogue by entry type (eintragsart): helps support a method and are not counted as methods. */
export function katalogZahlen(bausteine: ReadonlyArray<Pick<Baustein, 'eintragsart'>>): { methoden: number; hilfen: number; gesamt: number } {
  const hilfen = bausteine.filter(istHilfe).length;
  return { methoden: bausteine.length - hilfen, hilfen, gesamt: bausteine.length };
}

/** "310 Methoden und 4 Hilfen" (without helps: "310 Methoden"). */
export function katalogZahlenText(bausteine: ReadonlyArray<Pick<Baustein, 'eintragsart'>>): string {
  const z = katalogZahlen(bausteine);
  return z.hilfen ? `${z.methoden} Methoden und ${z.hilfen} ${z.hilfen === 1 ? 'Hilfe' : 'Hilfen'}` : `${z.methoden} Methoden`;
}
