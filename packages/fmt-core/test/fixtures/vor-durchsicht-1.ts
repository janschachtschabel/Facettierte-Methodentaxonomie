import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FmtData } from '../../src/types.js';
import type { AltBaustein } from '../../scripts/vorschlag-einsatzprofil.js';

/** Fields of every method before Durchsicht 1 that the takeover changed or removed. */
export interface AltFelder {
  lernort: string[];
  raum?: string;
  aufgabe: string[];
  fachbereichUngeeignet?: string[];
}

export const VOR_DURCHSICHT_1 = JSON.parse(
  fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'vor-durchsicht-1.json'), 'utf8')
) as Record<string, AltFelder>;

/** The catalogue as it was before Durchsicht 1, for the proposal scripts that read the old room fields. */
export function vorDurchsicht1(D: FmtData): FmtData & { bausteine: AltBaustein[] } {
  return {
    ...D,
    bausteine: D.bausteine.map((b) => {
      const rest: Record<string, unknown> = { ...b };
      for (const k of ['raumbedarf', 'fachausstattungArt', 'schriftbedarf', 'termineMin', 'raumhinweis', 'fachbereichUngeeignet']) delete rest[k];
      return { ...rest, ...VOR_DURCHSICHT_1[b.kennung] } as AltBaustein;
    })
  };
}
