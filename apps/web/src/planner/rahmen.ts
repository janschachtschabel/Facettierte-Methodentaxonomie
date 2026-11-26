/** Room properties (vocab raumbedarf) in plain words for the teacher, in the order of the planner's checklist. */
export const RAUM_EIGENSCHAFT_KLARTEXT: Record<string, string> = {
  schreibplatz: 'Schreibplätze',
  stellflaeche: 'freie Fläche zum Stehen und Gehen',
  bewegungsflaeche: 'große Fläche zum Laufen und Spielen',
  wandflaeche: 'Wand oder Tafel',
  aussenort: 'draußen',
  fachausstattung: 'Fachausstattung'
};

/** Order in which "cannot read" and "cannot write" are sent (request field ohneSchrift). */
export const SCHRIFT_ORDER = ['lesen', 'schreiben'] as const;

export function raumEigenschaftLabel(code: string, labelOf: (scheme: string, code: string) => string): string {
  return RAUM_EIGENSCHAFT_KLARTEXT[code] || labelOf('raumbedarf', code);
}

/**
 * Toggles one property against the current set: the explicit list if the teacher already changed one,
 * otherwise what the room type offers. Returns null when the result equals the room type again.
 */
export function toggleRaumEigenschaft(current: string[] | null, offered: string[], code: string, on: boolean): string[] | null {
  const base = new Set(current ?? offered);
  if (on) base.add(code);
  else base.delete(code);
  const order = Object.keys(RAUM_EIGENSCHAFT_KLARTEXT);
  const next = [...base].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const same = next.length === offered.length && offered.every((x) => base.has(x));
  return same ? null : next;
}
