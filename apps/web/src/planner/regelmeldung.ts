import type { Baustein, Passungsregel, Regelmeldung } from '@fmt/core';

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

/**
 * Rule messages for the methods in the arrangement (in arrangement order).
 * A message about one method stays while that method is in the arrangement. A message about several methods
 * (bausteine, e.g. the safety note) stays while any of them is there: it moves to the first one present and its text
 * is built anew from the rule with up to three of those methods, so it never names a method that is not in the plan
 * (and never reads "Unter den Vorschlägen …").
 */
export function meldungenImAblauf(meldungen: Regelmeldung[], imAblauf: Baustein[], regeln: Passungsregel[] = []): Regelmeldung[] {
  const da = new Set(imAblauf.map((b) => b.kennung));
  return meldungen.flatMap((m) => {
    if (m.bausteine?.length) {
      const vorhanden = imAblauf.filter((b) => m.bausteine!.includes(b.kennung));
      if (!vorhanden.length) return [];
      const vorlage = regeln.find((r) => r.id === m.regel)?.text;
      const namen = vorhanden.slice(0, 3).map((b) => b.name);
      const aufzaehlung = namen.length > 1 ? `${namen.slice(0, -1).join(', ')} und ${namen[namen.length - 1]}` : namen[0];
      const text = vorlage && vorlage.includes('{methode}') ? vorlage.replace(/\{methode\}/g, aufzaehlung) : m.text;
      return [{ ...m, baustein: vorhanden[0].kennung, bausteine: vorhanden.map((b) => b.kennung), text }];
    }
    return !m.baustein || da.has(m.baustein) ? [m] : [];
  });
}
