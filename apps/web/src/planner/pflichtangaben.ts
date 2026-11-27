import { PFLICHTANGABEN_NAMEN, type MatchResult, type Pflichtangabe } from '@fmt/core';

/** Order of the six required details in the line "Verstanden" and "Fehlt noch". */
export const PFLICHT_ORDNUNG: Pflichtangabe[] = ['fach-und-thema', 'bildungsstufe', 'anzahl', 'raum', 'zeit', 'ziel'];

export interface Verstanden {
  /** What the request states, one entry per known detail ("Ethik", "Klasse 10", "30 Lernende", "Hörsaal"). */
  verstanden: string[];
  /** Missing details in display order; fach-und-thema is split when only one half is missing. */
  fehlt: Array<{ feld: Pflichtangabe; label: string; teil?: 'fach' | 'thema' | 'beide' }>;
  /** The goal is only guessed from the text: it can be corrected like a missing one (W13). */
  zielVermutet: boolean;
}

const gross = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The line read back after a proposal: the known details of the six required ones and the missing ones.
 * Reads only the matcher answer (kriterien, erkannt, fach, pflichtangaben); nothing is assumed here.
 */
export function verstandenAus(
  r: MatchResult,
  labelOf: (scheme: string, code: string) => string,
  thema?: string
): Verstanden | null {
  const p = r.pflichtangaben;
  if (!p) return null;
  const fehlt = new Set(p.fehlt);
  const k = r.kriterien as Record<string, unknown>;
  const beleg = (feld: string) => r.erkannt.find((e) => e.feld === feld)?.beleg;
  const verstanden: string[] = [];
  const out: Verstanden['fehlt'] = [];
  let zielVermutet = false;
  const fachName = r.fach?.label || (typeof k.fachbereich === 'string' ? labelOf('fachbereich', k.fachbereich) : '');
  for (const feld of PFLICHT_ORDNUNG) {
    if (fehlt.has(feld)) {
      if (feld === 'fach-und-thema') {
        const teil = fachName && !thema ? 'thema' : !fachName && thema ? 'fach' : 'beide';
        out.push({ feld, teil, label: teil === 'thema' ? 'Thema' : teil === 'fach' ? 'Fach' : PFLICHTANGABEN_NAMEN[feld] });
      } else out.push({ feld, label: PFLICHTANGABEN_NAMEN[feld] });
      continue;
    }
    if (feld === 'fach-und-thema' && fachName) verstanden.push(fachName);
    if (feld === 'bildungsstufe' && typeof k.bildungsstufe === 'string') {
      const b = beleg('bildungsstufe');
      verstanden.push(b && /^(klasse|jahrgang|stufe)\s*\d/i.test(b) ? gross(b) : labelOf('bildungsstufe', k.bildungsstufe));
    }
    if (feld === 'anzahl' && k.gruppe) verstanden.push(`${k.gruppe} Lernende`);
    if (feld === 'raum' && typeof k.raum === 'string') verstanden.push(labelOf('raumtyp', k.raum));
    if (feld === 'zeit' && k.zeitMin) verstanden.push(`${k.zeitMin} Minuten`);
    if (feld === 'ziel') {
      // A goal the text only suggests (semantic reading, beleg "semantisch: …") is shown as a guess.
      const vermutet = (f: string) => /^semantisch/i.test(beleg(f) || '');
      let ziel = '';
      let geraten = false;
      // A goal kind the plan assumed (e.g. Ethik → Urteilen) is the plan's goal; it beats a guessed function.
      const angenommeneZielart = p.angenommen.find((x) => x.feld === 'zielart' && typeof x.wert === 'string');
      if (typeof k.zielart !== 'string' && angenommeneZielart) {
        verstanden.push(`Ziel (angenommen): ${labelOf('zielart', angenommeneZielart.wert as string)}`);
        zielVermutet = true;
        continue;
      }
      if (typeof k.zielart === 'string') {
        ziel = labelOf('zielart', k.zielart);
        geraten = vermutet('zielart');
      } else if (r.modus === 'ablauf' && typeof k.zieltyp === 'string' && r.kette?.label) {
        ziel = r.kette.label;
        geraten = vermutet('zieltyp');
      } else if (Array.isArray(k.lernfunktion)) {
        ziel = (k.lernfunktion as string[]).map((f) => labelOf('lernfunktion', f)).join(', ');
        geraten = vermutet('lernfunktion');
      }
      if (ziel) verstanden.push(geraten ? `Ziel (vermutet): ${ziel}` : `Ziel: ${ziel}`);
      zielVermutet = Boolean(ziel) && geraten;
    }
  }
  return { verstanden, fehlt: out, zielVermutet };
}
