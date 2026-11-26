import type { Baustein, CatalogBundle } from '@fmt/core';
import { raumEigenschaftLabel } from './rahmen.js';

type LabelOf = (scheme: string, code: string) => string;

const spanne = (min: number | undefined, max: number | undefined, einheit: string) =>
  min == null && max == null ? null : min === max || max == null ? `${min} ${einheit}` : min == null ? `bis ${max} ${einheit}` : `${min} bis ${max} ${einheit}`;

/** Plain-language line for one need field of a method; null when the field says nothing (or is shown with its pair). */
function zeile(feld: string, b: Baustein, labelOf: LabelOf): string | null {
  switch (feld) {
    case 'gruppeMin':
      return `Gruppengröße: ${spanne(b.gruppeMin, b.gruppeMax, 'Personen')}`;
    case 'teamMin':
      return b.teamMin != null || b.teamMax != null ? `Teams: ${spanne(b.teamMin, b.teamMax, 'Personen')}` : null;
    case 'vorbedingung':
      return (b.vorbedingung || []).length ? `Vorher erreicht: ${b.vorbedingung.map((z) => labelOf('lernzustand', z)).join(', ')}` : null;
    case 'schriftbedarf': {
      const s = b.schriftbedarf || [];
      if (!s.length) return 'Lesen und Schreiben: kein Bedarf angegeben';
      const was = s.map((x) => (x === 'liest' ? 'lesen' : x === 'schreibt' ? 'schreiben' : labelOf('schriftbedarf', x)));
      return `Die Lernenden ${was.join(' und ')}.`;
    }
    case 'vorbereitungMin':
      return b.vorbereitungMin > 0 ? `Vorbereitung: etwa ${b.vorbereitungMin} Minuten` : 'Keine besondere Vorbereitung';
    case 'betreuungshinweis':
      return b.betreuungshinweis ? `Begleitung: ${b.betreuungshinweis}` : null;
    case 'raumbedarf': {
      const r = b.raumbedarf || [];
      if (!r.length) return 'Raum: kein besonderer Bedarf';
      return `Raum: ${r.map((x) => raumEigenschaftLabel(x, labelOf)).join(', ')}`;
    }
    case 'fachausstattungArt':
      return b.fachausstattungArt ? `Art der Fachausstattung: ${labelOf('fachausstattungart', b.fachausstattungArt)}` : null;
    case 'dauerMin':
      return `Dauer: ${spanne(b.dauerMin, b.dauerMax, 'Minuten')}`;
    case 'termineMin':
      return b.termineMin != null ? `mindestens ${b.termineMin} Termine` : null;
    case 'technik':
      return `Technik: ${labelOf('technikbedarf', b.technik)}`;
    case 'internet':
      return b.internet ? 'Internet nötig' : null;
    case 'ki':
      return b.ki ? 'KI-System nötig' : null;
    case 'material':
      return (b.material || []).length ? `Material: ${b.material.join(', ')}` : null;
    default:
      return null;
  }
}

export interface BedarfZeile {
  wfeld: string;
  name: string;
  frage: string;
  zeilen: string[];
}

/** The method's needs (kind "Bedarf" in the W-Raster), grouped by W-field in the order of the data. */
export function bedarfNachWFeld(b: Baustein, bundle: Pick<CatalogBundle, 'wfelder' | 'merkmale'>, labelOf: LabelOf): BedarfZeile[] {
  const bedarf = (bundle.merkmale || []).filter((m) => m.art === 'bedarf');
  return (bundle.wfelder || [])
    .map((w) => {
      const zeilen = bedarf
        .filter((m) => m.wfeld === w.id)
        .map((m) => zeile(m.feld, b, labelOf))
        .filter((z): z is string => Boolean(z));
      if (w.id === 'lernumgebung' && b.raumhinweis) zeilen.push(`Hinweis zum Raum: ${b.raumhinweis}`);
      return { wfeld: w.id, name: w.name, frage: w.frage, zeilen };
    })
    .filter((r) => r.zeilen.length > 0);
}
