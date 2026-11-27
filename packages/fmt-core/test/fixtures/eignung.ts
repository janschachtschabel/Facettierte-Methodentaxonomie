import type { Baustein, FmtData } from '../../src/types.js';

/**
 * Tor D2 left no Eignung entry without a reason, and dropped most entries the older tests used as examples. These
 * fixtures put such entries back (as they stood before the gate, without eignungsgrund) so that the mechanism – a
 * warning marked "Setzung der Redaktion", the filter for named methods – stays tested. The real data are not changed.
 */
export const VOR_TOR_D2: Record<string, Partial<Baustein>> = {
  laufdiktat: { fachbereichUngeeignet: ['mathe-informatik', 'nawi-technik', 'gesellschaft', 'aesthetik'] },
  'sportmotorischer-test': { fachbereichUngeeignet: ['mathe-informatik', 'sprachen', 'gesellschaft', 'nawi-technik', 'beruf-praxis', 'aesthetik'] },
  'makerspace-tueftelwerkstatt': { fachbereichUngeeignet: ['sprachen', 'gesellschaft', 'sport'] },
  erfindungsaufgabe: { ungeeignetBeiStufe: ['primar'] }
};

/** The data with the given fields replaced for the named methods. */
export function mitEintraegen(D: FmtData, eintraege: Record<string, Partial<Baustein>> = VOR_TOR_D2): FmtData {
  return { ...D, bausteine: D.bausteine.map((b) => (eintraege[b.kennung] ? { ...b, ...eintraege[b.kennung] } : b)) };
}
