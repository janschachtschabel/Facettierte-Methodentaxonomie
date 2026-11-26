import type { Baustein, FmtData, VocabValue } from './types.js';

const valuesOf = (data: FmtData, scheme: string): VocabValue[] => {
  const s = data.schemes.find((x) => x.id === scheme);
  return s ? s.werte || (s.gruppen || []).flatMap((g) => g.werte) : [];
};

/** Room properties a room type offers (vocab raumtyp, field bietet). Unknown type: empty set. */
export function raumBietet(data: FmtData, raumtyp: string): Set<string> {
  return new Set(valuesOf(data, 'raumtyp').find((w) => w.id === raumtyp)?.bietet || []);
}

/** Labels of the needs the room type does not meet, in vocab order; [] when the method fits or needs nothing. */
export function raumFehlt(data: FmtData, b: Pick<Baustein, 'raumbedarf'>, raumtyp: string): string[] {
  const braucht = new Set(b.raumbedarf || []);
  if (!braucht.size) return [];
  const bietet = raumBietet(data, raumtyp);
  return valuesOf(data, 'raumbedarf')
    .filter((w) => braucht.has(w.id) && !bietet.has(w.id))
    .map((w) => w.label);
}

/** Whether the method needs one of the properties that set this room apart from a classroom. */
export function nutztRaum(data: FmtData, b: Pick<Baustein, 'raumbedarf'>, raumtyp: string): boolean {
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
