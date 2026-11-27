import { einordnungInKetten, istHilfe, lesart, type Baustein, type CatalogBundle } from '@fmt/core';
import { grundlageKlartext } from './regelmeldung.js';

type LabelOf = (scheme: string, code: string) => string;
type RasterBundle = Pick<CatalogBundle, 'wfelder' | 'merkmale' | 'ketten' | 'schemes' | 'oeh'>;

/** One W-field row of a kind (Beitrag, Eignung, Einordnung) with its lines. */
export interface RasterZeile<T = string> {
  wfeld: string;
  name: string;
  frage: string;
  zeilen: T[];
}

/** Rows of one kind in the order of the W-fields; only fields with at least one line. */
function nachWFeld<T>(bundle: RasterBundle, art: string, zeilenFuer: (feld: string) => T[]): RasterZeile<T>[] {
  const merkmale = (bundle.merkmale || []).filter((m) => m.art === art);
  return (bundle.wfelder || [])
    .map((w) => ({
      wfeld: w.id,
      name: w.name,
      frage: w.frage,
      zeilen: merkmale.filter((m) => m.wfeld === w.id).flatMap((m) => zeilenFuer(m.feld))
    }))
    .filter((r) => r.zeilen.length > 0);
}

const liste = (codes: string[] | undefined, scheme: string, labelOf: LabelOf) => (codes || []).map((c) => labelOf(scheme, c)).join(', ');

/** What the method yields (kind "Beitrag"), grouped by W-field. */
export function beitragNachWFeld(b: Baustein, bundle: RasterBundle, labelOf: LabelOf): RasterZeile[] {
  return nachWFeld(bundle, 'beitrag', (feld) => {
    if (feld === 'nachbedingung') return (b.nachbedingung || []).length ? [`Danach erreicht: ${liste(b.nachbedingung, 'lernzustand', labelOf)}`] : [];
    return [];
  });
}

export interface EignungEintrag {
  art: 'stufe' | 'vorwissen' | 'fachbereich';
  /** "Bildungsstufe", "Vorwissen", "Fachbereich". */
  merkmal: string;
  /** "Passt weniger zu: Primarstufe". */
  aussage: string;
  /** Reason of the data (eignungsgrund.text); missing when the data give none. */
  grund?: string;
  /** "belegt (Quelle)", "gefolgert", "Setzung". */
  grundlage: string;
}

const EIGNUNG_FELD: Record<string, { art: EignungEintrag['art']; merkmal: string; scheme: string }> = {
  ungeeignetBeiStufe: { art: 'stufe', merkmal: 'Bildungsstufe', scheme: 'bildungsstufe' },
  ungeeignetBeiVorwissen: { art: 'vorwissen', merkmal: 'Vorwissen', scheme: 'vorwissen' },
  fachbereichUngeeignet: { art: 'fachbereich', merkmal: 'Fachbereich', scheme: 'fachbereich' }
};

/**
 * Suitability of the method (kind "Eignung"): stage, prior knowledge and subject area it fits less, each with the
 * reason and basis of the data (eignungsgrund). Without a reason the statement is a setting of the editors.
 */
export function eignungNachWFeld(b: Baustein, bundle: RasterBundle, labelOf: LabelOf): RasterZeile<EignungEintrag>[] {
  return nachWFeld(bundle, 'eignung', (feld) => {
    const def = EIGNUNG_FELD[feld];
    if (!def) return [];
    const codes = (b[feld as keyof Baustein] as string[] | undefined) || [];
    const g = b.eignungsgrund?.[def.art];
    if (!codes.length && !g) return [];
    return [
      {
        art: def.art,
        merkmal: def.merkmal,
        aussage: codes.length ? `Passt weniger zu: ${liste(codes, def.scheme, labelOf)}` : 'Keine Einschränkung angegeben',
        ...(g ? { grund: g.text } : {}),
        grundlage: grundlageKlartext({ grundlage: g?.grundlage ?? 'A', quelle: g?.quelle })
      }
    ];
  });
}

/** Where the method stands in the catalogue (kind "Einordnung"), grouped by W-field. */
export function einordnungNachWFeld(b: Baustein, bundle: RasterBundle, labelOf: LabelOf): RasterZeile[] {
  return nachWFeld(bundle, 'einordnung', (feld) => {
    switch (feld) {
      case 'fachbereich':
        return (b.fachbereich || []).length ? [`Fachbereich: ${liste(b.fachbereich, 'fachbereich', labelOf)}`] : [];
      case 'ansatz':
        return (b.ansatz || []).length ? [`Didaktischer Ansatz: ${liste(b.ansatz, 'ansatz', labelOf)}`] : [];
      case 'kategorie':
        return (b.kategorie || []).length ? [`OpenEduHub-Kategorien: ${(b.kategorie || []).map((iri) => bundle.oeh?.[iri] || iri).join(', ')}`] : [];
      case 'eintragsart':
        return [istHilfe(b) ? 'Eintragsart: Hilfe (stützt Lernende innerhalb einer Methode, trägt keine Phase)' : 'Eintragsart: Methode (trägt eine Phase)'];
      default:
        return [];
    }
  });
}

export interface KettenPlatz {
  kette: string;
  label: string;
  /** Goal kinds of the chain, as labels. */
  zielart: string;
  schritte: Array<{ id: string; label: string; wissensart: string }>;
  /** The method's learning states before and after, in the reading (Lesart) of the chain's goal kind. */
  vorher: string[];
  nachher: string[];
}

/**
 * Chains and steps the method can fill (core einordnungInKetten: learning function and the bound knowledge type),
 * with the knowledge type each step binds and the method's learning states in the reading of the chain's goal kind.
 */
export function kettenPlaetze(b: Baustein, bundle: RasterBundle, labelOf: LabelOf): KettenPlatz[] {
  const ketten = bundle.ketten || [];
  const treffer = einordnungInKetten(b, ketten);
  const out: KettenPlatz[] = [];
  for (const k of ketten) {
    const hier = treffer.filter((t) => t.kette === k.id);
    if (!hier.length) continue;
    const zielart = k.zielart?.[0];
    out.push({
      kette: k.id,
      label: k.label,
      zielart: liste(k.zielart, 'zielart', labelOf),
      schritte: hier.map((t) => {
        const st = k.schritte.find((s) => s.id === t.schritt);
        const wa = st?.rolle === 'rand' || !st?.wissensart?.length ? 'bindet keine Wissensart' : liste(st.wissensart, 'aufgabenstruktur', labelOf);
        return { id: t.schritt, label: t.schrittLabel, wissensart: wa };
      }),
      vorher: (b.vorbedingung || []).map((z) => lesart(bundle, z, zielart)),
      nachher: (b.nachbedingung || []).map((z) => lesart(bundle, z, zielart))
    });
  }
  return out;
}
