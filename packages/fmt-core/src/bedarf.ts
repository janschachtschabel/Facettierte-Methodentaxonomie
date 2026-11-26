import type { Baustein, FmtData, MatchRequest, VocabValue } from './types.js';
import type { Situation } from './situation.js';

const valuesOf = (data: Pick<FmtData, 'schemes'>, scheme: string): VocabValue[] => {
  const s = data.schemes.find((x) => x.id === scheme);
  return s ? s.werte || (s.gruppen || []).flatMap((g) => g.werte) : [];
};
const labelOf = (data: Pick<FmtData, 'schemes'>, scheme: string, id: string) =>
  valuesOf(data, scheme).find((w) => w.id === id)?.label ?? id;
const list = (x: unknown): string[] => (x == null || x === '' ? [] : Array.isArray(x) ? x.map(String) : [String(x)]);
const given = (v: unknown) => v != null && v !== '';

/** Room properties a room type offers (vocab raumtyp, field bietet). Unknown type: empty set. */
export function raumBietet(data: Pick<FmtData, 'schemes'>, raumtyp: string): Set<string> {
  return new Set(valuesOf(data, 'raumtyp').find((w) => w.id === raumtyp)?.bietet || []);
}

/** Room needs (ids, in method order) the situation's room does not offer; also when the room is only assumed. */
export function raumFehlt(b: Pick<Baustein, 'raumbedarf'>, s: Situation): string[] {
  return (b.raumbedarf || []).filter((x) => !s.bietet.has(x));
}

const AI_ROLES = new Set(['tutor', 'dialogpartner', 'simulationsrolle', 'belehrbarer-agent', 'antwortgeber']);

/** Whether the method uses AI: flagged as such, or one of its roles is played by an AI. */
export function setztKiEin(b: Pick<Baustein, 'ki' | 'rolle'>): boolean {
  return Boolean(b.ki) || (b.rolle || []).some((r) => AI_ROLES.has(r));
}

/** Whether the method needs one of the properties that set this room apart from a classroom. */
export function nutztRaum(data: Pick<FmtData, 'schemes'>, b: Pick<Baustein, 'raumbedarf'>, raumtyp: string): boolean {
  const klassenraum = raumBietet(data, 'klassenraum');
  const besonders = [...raumBietet(data, raumtyp)].filter((x) => !klassenraum.has(x));
  return (b.raumbedarf || []).some((x) => besonders.includes(x));
}

const SCHRIFT: Array<[need: string, ohne: string, label: string]> = [
  ['liest', 'lesen', 'Lesen'],
  ['schreibt', 'schreiben', 'Schreiben']
];

/** Labels of the literacy needs the learners lack; ohne holds 'lesen' and/or 'schreiben'. */
export function schriftFehlt(b: Pick<Baustein, 'schriftbedarf'>, ohne: string[]): string[] {
  const braucht = new Set(b.schriftbedarf || []);
  return SCHRIFT.filter(([need, o]) => braucht.has(need) && ohne.includes(o)).map(([, , label]) => label);
}

export interface BedarfLuecke {
  merkmal: string;
  grund: string;
}

/** First need of the method the situation does not cover; null when all are covered or not checkable. */
export function ungedeckterBedarf(
  b: Baustein,
  a: MatchRequest,
  s: Situation,
  data: Pick<FmtData, 'schemes'>
): BedarfLuecke | null {
  const rank = new Map(valuesOf(data, 'technikbedarf').map((w) => [w.id, w.rang ?? 0]));
  if (given(a.zeitMin) && b.dauerMin > Number(a.zeitMin)) return { merkmal: 'dauerMin', grund: `braucht mindestens ${b.dauerMin} min` };
  if (given(a.gruppe) && Number(a.gruppe) < b.gruppeMin) return { merkmal: 'gruppeMin', grund: `erst ab ${b.gruppeMin} Personen` };
  if (given(a.gruppe) && Number(a.gruppe) > b.gruppeMax) return { merkmal: 'gruppeMax', grund: `höchstens ${b.gruppeMax} Personen` };
  if (given(a.maxTechnik) && (rank.get(b.technik) ?? 0) > (rank.get(String(a.maxTechnik)) ?? 0)) {
    return { merkmal: 'technik', grund: `braucht: ${labelOf(data, 'technikbedarf', b.technik)}` };
  }
  if (a.ohneInternet && b.internet) return { merkmal: 'internet', grund: 'braucht Internet' };
  if (a.ohneKI && setztKiEin(b)) return { merkmal: 'ki', grund: 'setzt KI ein' };
  if (given(a.maxVorbereitung) && b.vorbereitungMin > Number(a.maxVorbereitung)) {
    return { merkmal: 'vorbereitungMin', grund: `Vorbereitung etwa ${b.vorbereitungMin} min` };
  }
  const missing = list(a.raumzeit).filter((v) => !(b.raumzeit || []).includes(v));
  if (missing.length) {
    return { merkmal: 'raumzeit', grund: `nicht vorgesehen für: ${missing.map((v) => labelOf(data, 'raumzeit', v)).join(', ')}` };
  }
  if (s.raumGenannt) {
    const fehlend = raumFehlt(b, s)[0];
    if (fehlend) return { merkmal: 'raumbedarf', grund: `braucht: ${labelOf(data, 'raumbedarf', fehlend)}` };
    if (b.fachausstattungArt && s.fachausstattungArt && b.fachausstattungArt !== s.fachausstattungArt) {
      return {
        merkmal: 'fachausstattungArt',
        grund: `braucht Fachausstattung: ${labelOf(data, 'fachausstattungart', b.fachausstattungArt)}`
      };
    }
  }
  const schrift = schriftFehlt(b, s.ohneSchrift);
  if (schrift.length) return { merkmal: 'schriftbedarf', grund: `verlangt: ${schrift.join(', ')}` };
  if (s.termine != null && b.termineMin != null && s.termine < b.termineMin) {
    return { merkmal: 'termineMin', grund: `braucht mindestens ${b.termineMin} Termine` };
  }
  return null;
}
