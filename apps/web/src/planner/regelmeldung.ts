import type { Passungsregel, Regelmeldung } from '@fmt/core';

/** Suitability entries of a method come from the rule machine, not from data/regeln.json; they carry their own name. */
const EIGNUNG_NAMEN: Record<string, string> = {
  'eignung-stufe': 'Eignung für die Bildungsstufe',
  'eignung-vorwissen': 'Eignung für das Vorwissen',
  'eignung-fach': 'Eignung für den Fachbereich'
};

/** Basis in plain German: evidence is "belegt", a setting by the editors is "Setzung". */
const GRUNDLAGE_KLARTEXT: Record<string, string> = {
  E: 'belegt',
  S: 'gefolgert',
  A: 'Setzung',
  Recht: 'Recht',
  U: 'ungeklärt',
  formal: 'formal'
};

export function regelName(id: string, regeln: Passungsregel[] = []): string {
  return regeln.find((r) => r.id === id)?.name || EIGNUNG_NAMEN[id] || id;
}

export function grundlageKlartext(m: Pick<Regelmeldung, 'grundlage' | 'quelle'>): string {
  const g = GRUNDLAGE_KLARTEXT[m.grundlage] || m.grundlage;
  return m.quelle ? `${g} (${m.quelle})` : g;
}

/** Small line under a rule message: "Regel: … · Grundlage: belegt (Quelle)" or "… · Grundlage: Setzung". */
export function regelZeile(m: Regelmeldung, regeln: Passungsregel[] = []): string {
  return `Regel: ${regelName(m.regel, regeln)} · Grundlage: ${grundlageKlartext(m)}`;
}
