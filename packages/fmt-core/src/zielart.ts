import type { Baustein, FmtData, Funktionskette, KettenSchritt } from './types.js';
import { istMethode } from './eintragsart.js';

/** Old knowledge-type codes accepted in the request field zielart. */
export const ZIELART_ALIAS: Record<string, string> = { psychomotorik: 'bewegung', einstellungen: 'urteilen' };

/** Knowledge types as they stand in facet D1 (aufgabe). */
const WISSENSARTEN = ['fakten', 'konzepte', 'prozeduren', 'einstellungen', 'psychomotorik', 'metakognitiv'];

export function normZielart(code: string | undefined): string | undefined {
  if (code === undefined || code === null || code === '') return undefined;
  return ZIELART_ALIAS[code] ?? code;
}

/** Reading (Lesart) of the learning states per goal kind (FMT 2.0, table "Lesarten"); the vocab carries it as zielart[].lesart. */
export const LESART_JE_ZIELART: Record<string, 'wissen' | 'bewegung' | 'urteilen' | 'gestalten' | 'handlung'> = {
  fakten: 'wissen',
  konzepte: 'wissen',
  prozeduren: 'wissen',
  problemloesen: 'wissen',
  bewegung: 'bewegung',
  kondition: 'bewegung',
  handlung: 'handlung',
  urteilen: 'urteilen',
  gestalten: 'gestalten'
};

/**
 * A learning state in the words of the goal kind (vocab lernzustand[].lesart). Without a goal kind, or where the
 * table has a dash, the state's label applies; an unknown state stays its code. Old knowledge-type codes go via the alias.
 */
export function lesart(data: Pick<FmtData, 'schemes'>, zustand: string, zielart?: string): string {
  const werte = data.schemes.find((s) => s.id === 'lernzustand')?.werte || [];
  const w = werte.find((x) => x.id === zustand);
  if (!w) return zustand;
  const art = normZielart(zielart);
  if (!art) return w.label;
  const ziel = data.schemes.find((s) => s.id === 'zielart')?.werte?.find((x) => x.id === art);
  const schluessel = (typeof ziel?.lesart === 'string' ? ziel.lesart : undefined) ?? LESART_JE_ZIELART[art];
  const texte = typeof w.lesart === 'object' && w.lesart ? w.lesart : {};
  return (schluessel && texte[schluessel]) || w.label;
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

export interface KettenEinordnung {
  kette: string;
  label: string;
  schritt: string;
  schrittLabel: string;
}

/**
 * Chain steps a method can fill: the step asks for one of its learning functions and the method carries the knowledge
 * type the step binds (edge steps do not bind). A help fills no step.
 */
export function einordnungInKetten(
  b: Pick<Baustein, 'aufgabe' | 'lernfunktion' | 'eintragsart'>,
  ketten: Funktionskette[]
): KettenEinordnung[] {
  if (!istMethode(b)) return [];
  return ketten.flatMap((k) =>
    k.schritte
      .filter((st) => st.funktion.some((f) => (b.lernfunktion || []).includes(f)) && traegtWissensart(b, st))
      .map((st) => ({ kette: k.id, label: k.label, schritt: st.id, schrittLabel: st.label }))
  );
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


/** Interaction forms in which learners use language with others (signal of the accompanying goal sprache). */
const SPRACHHANDLUNG = ['partner', 'kleingruppe-kooperativ', 'plenum-lernendengeleitet'];

/**
 * Whether the method carries an accompanying goal (FMT 2.0, Paket D): sozial by cooperative small groups (C1) or a
 * focus on others (A3), selbstregulation by the metacognitive knowledge type (D1) or function (A1), sprache by reading
 * or writing, or by talking with others (C1). An unknown goal is never carried.
 */
export function traegtBegleitziel(
  b: Pick<Baustein, 'interaktion' | 'weltbezug' | 'aufgabe' | 'lernfunktion' | 'schriftbedarf'>,
  ziel: string
): boolean {
  const inter = b.interaktion || [];
  if (ziel === 'sozial') return inter.includes('kleingruppe-kooperativ') || (b.weltbezug || []).includes('andere');
  if (ziel === 'selbstregulation') return (b.aufgabe || []).includes('metakognitiv') || (b.lernfunktion || []).includes('metakognition');
  if (ziel === 'sprache') return (b.schriftbedarf || []).length > 0 || inter.some((x) => SPRACHHANDLUNG.includes(x));
  return false;
}
