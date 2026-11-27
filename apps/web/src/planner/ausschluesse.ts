import type { Baustein, CatalogBundle, MatchResult } from '@fmt/core';

/** A method's field in plain German, as the exclusions of the matcher name it (merkmal). */
export const MERKMAL_KLARTEXT: Record<string, string> = {
  raumbedarf: 'Raumbedarf',
  fachausstattungArt: 'Fachausstattung',
  schriftbedarf: 'Lesen und Schreiben',
  termineMin: 'Anzahl der Termine',
  dauerMin: 'Dauer',
  gruppeMin: 'Gruppengröße',
  gruppeMax: 'Gruppengröße',
  technik: 'Technik',
  internet: 'Internet',
  ki: 'KI',
  vorbereitungMin: 'Vorbereitung',
  raumzeit: 'Raum und Zeit',
  eintragsart: 'Hilfe statt Methode',
  wissensart: 'Wissensart des Schritts'
};

export interface AusschlussZeile {
  baustein: string;
  name: string;
  /** Reason of the core, e.g. "braucht: Stellfläche". */
  grund: string;
  /** The field in plain German ("Raumbedarf"), when the core names one. */
  merkmal?: string;
  /** W-field of that field ("Lernumgebung (Wo wird gelernt?)"), when the W-Raster has it. */
  wfeld?: string;
}

/**
 * What the core left out of the answer and why: in a flow the named methods it could not place (nichtVerankert), for
 * a single phase the methods whose needs the situation does not cover (ausgeschlossen.rahmen). Each line names the
 * method's field (Merkmal) in plain German and its W-field.
 */
export function ausschlussZeilen(
  r: MatchResult | null | undefined,
  blocksById: Map<string, Baustein>,
  bundle: Pick<CatalogBundle, 'merkmale' | 'wfelder'>
): AusschlussZeile[] {
  if (!r) return [];
  const roh: Array<{ baustein: string; name?: string; grund: string; merkmal?: string }> =
    r.modus === 'ablauf' ? r.nichtVerankert || [] : r.modus === 'phase' ? r.ausgeschlossen?.rahmen || [] : [];
  return roh.map((x) => {
    const m = x.merkmal ? (bundle.merkmale || []).find((y) => y.feld === x.merkmal) : undefined;
    const w = m ? (bundle.wfelder || []).find((y) => y.id === m.wfeld) : undefined;
    return {
      baustein: x.baustein,
      name: x.name || blocksById.get(x.baustein)?.name || x.baustein,
      grund: x.grund,
      ...(x.merkmal ? { merkmal: MERKMAL_KLARTEXT[x.merkmal] || x.merkmal } : {}),
      ...(w ? { wfeld: `${w.name} (${w.frage})` } : {})
    };
  });
}

/** Names of the helps the request named (genannteHilfen): they are no phase; step 3 assigns them to phases. */
export function genannteHilfenNamen(r: MatchResult | null | undefined, blocksById: Map<string, Baustein>): string[] {
  return (r?.genannteHilfen || []).map((id) => blocksById.get(id)?.name || id);
}
