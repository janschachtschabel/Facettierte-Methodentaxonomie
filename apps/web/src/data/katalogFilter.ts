import type { SearchCriteria } from '@fmt/core';

/** Filters of the catalogue that live in the URL, with how they are read back. */
const ZAHLEN = ['maxDauer', 'gruppe', 'termine'] as const;
const SCHALTER = ['ohneKI'] as const;
const LISTEN = ['ohneSchrift'] as const;
const TEXTE = [
  'text',
  'ansatz',
  'lernfunktion',
  'reichweite',
  'liefert',
  'minEvidenz',
  'status',
  'bildungsstufe',
  'fuerFachbereich',
  'eintragsart',
  'anleitung',
  'engagement',
  'interaktion',
  'raumzeit',
  'maxTechnik',
  'raum',
  'raumbedarf',
  'ohneRaumbedarf'
] as const;

export const KATALOG_FILTER_SCHLUESSEL: readonly string[] = [...TEXTE, ...ZAHLEN, ...SCHALTER, ...LISTEN];

/** The filters of a catalogue link (core search criteria); unknown keys are ignored. */
export function filterAusUrl(params: URLSearchParams): SearchCriteria {
  const out: Record<string, unknown> = {};
  for (const k of TEXTE) {
    const v = params.get(k);
    if (v) out[k] = v;
  }
  for (const k of ZAHLEN) {
    const v = Number(params.get(k));
    if (params.get(k) && Number.isFinite(v)) out[k] = v;
  }
  for (const k of SCHALTER) if (params.get(k) === 'true') out[k] = true;
  for (const k of LISTEN) {
    const v = (params.get(k) || '').split(',').map((x) => x.trim()).filter(Boolean);
    if (v.length) out[k] = v;
  }
  return out as SearchCriteria;
}

/** The URL parameters of the filters, in a fixed order so that the same filters give the same link. */
export function filterInUrl(filters: SearchCriteria): URLSearchParams {
  const p = new URLSearchParams();
  for (const k of KATALOG_FILTER_SCHLUESSEL) {
    const v = filters[k];
    if (v == null || v === '' || v === false) continue;
    if (Array.isArray(v)) {
      if (v.length) p.set(k, v.join(','));
    } else p.set(k, String(v));
  }
  return p;
}
