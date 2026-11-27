import type { Baustein, Funktionskette, KettenSchritt } from './types.js';

/** Old knowledge-type codes accepted in the request field zielart. */
export const ZIELART_ALIAS: Record<string, string> = { psychomotorik: 'bewegung', einstellungen: 'urteilen' };

/** Knowledge types as they stand in facet D1 (aufgabe). */
const WISSENSARTEN = ['fakten', 'konzepte', 'prozeduren', 'einstellungen', 'psychomotorik', 'metakognitiv'];

export function normZielart(code: string | undefined): string | undefined {
  if (code === undefined || code === null || code === '') return undefined;
  return ZIELART_ALIAS[code] ?? code;
}

export interface Kettenwahl {
  kette: Funktionskette;
  grund: 'zieltyp' | 'zielart' | 'ansatz' | 'angenommen';
}

/** Chain choice by goal type, goal kind and wished approach; null when none fits (caller assumes konzepte). */
export function waehleKette(
  ketten: Funktionskette[],
  a: { zieltyp?: string; zielart?: string; ansatz?: string[] }
): Kettenwahl | null {
  if (a.zieltyp) {
    const k = ketten.find((x) => x.id === a.zieltyp);
    if (k) return { kette: k, grund: 'zieltyp' };
  }
  const ansatz = a.ansatz || [];
  const art = normZielart(a.zielart);
  if (art) {
    const passend = ketten.filter((k) => (k.zielart || []).includes(art));
    if (passend.length) {
      const mitAnsatz = passend.find((k) => (k.ansatz || []).some((x) => ansatz.includes(x)));
      if (mitAnsatz) return { kette: mitAnsatz, grund: 'ansatz' };
      return { kette: passend.find((k) => !(k.ansatz || []).length) || passend[0], grund: 'zielart' };
    }
    return null;
  }
  const mitAnsatz = ketten.find((k) => (k.ansatz || []).some((x) => ansatz.includes(x)));
  return mitAnsatz ? { kette: mitAnsatz, grund: 'ansatz' } : null;
}

/** The knowledge types (D1) a method carries. */
export function wissensartenVon(b: Pick<Baustein, 'aufgabe'>): string[] {
  return (b.aufgabe || []).filter((x) => WISSENSARTEN.includes(x));
}

/** Whether the method delivers its learning state for a knowledge type the chain step asks for. */
export function traegtWissensart(b: Pick<Baustein, 'aufgabe'>, schritt: Pick<KettenSchritt, 'rolle' | 'wissensart'>): boolean {
  if (schritt.rolle === 'rand' || !schritt.wissensart?.length) return true;
  const eigene = wissensartenVon(b);
  return schritt.wissensart.some((w) => eigene.includes(w));
}

export type Nachweisform = 'schriftlich' | 'muendlich' | 'praktisch' | 'produkt';

/** Forms of proof a method yields (a setting, reported in the rule-hit report). */
export function nachweisformen(b: Baustein): Nachweisform[] {
  const out: Nachweisform[] = [];
  // Enactive counts as practical only when the method trains movement or procedures (Tor D2): voting cards are no practice.
  if ((b.repraesentation || []).includes('enaktiv') && wissensartenVon(b).some((x) => x === 'psychomotorik' || x === 'prozeduren')) out.push('praktisch');
  if ((b.schriftbedarf || []).includes('schreibt')) out.push('schriftlich');
  const reichweite = Number(/\d+/.exec(b.reichweite || '')?.[0] || 0);
  if ((b.engagement || []).includes('konstruktiv') && reichweite >= 2) out.push('produkt');
  if (!out.includes('praktisch') && !out.includes('schriftlich') && !out.includes('produkt')) {
    const inter = b.interaktion || [];
    if (inter.length && !(inter.length === 1 && inter[0] === 'einzel')) out.push('muendlich');
  }
  return out;
}

/** Movement and training chains (a goal kind of the psychomotor knowledge type). */
export function bewegungsKette(k: Pick<Funktionskette, 'zielart'>): boolean {
  return (k.zielart || []).some((z) => z === 'bewegung' || z === 'kondition');
}

