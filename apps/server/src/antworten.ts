import { FMT_GUARDRAILS, PFLICHTANGABEN_NAMEN, einordnungInKetten, type Arrangement, type Baustein, type MatchRequest } from '@fmt/core';
import type { CatalogStore } from './catalog-store.js';
import { ersatzHinweis, mitFachAufgeloest } from './kandidaten.js';
import { extractSubjectAndTopicFromText } from './routes/assistant.js';

/**
 * Answer builders REST and MCP share, so both give the same answer: search hits, the full entry, the classification,
 * the match and the replacements. The routes and tools only read input and send.
 */

/** Basis of an entry's evidence (methode, prinzip, programm), sorted, as compare_methods compares it. */
export const evidenzBezugVon = (b: Baustein): string[] => [...new Set((b.evidenz || []).map((e) => e.evidenzBezug || 'methode'))].sort();

/**
 * One search hit (REST /methods, MCP search_methods): profile, needs, fit with its reasons, evidence and a short
 * placing in the chains (chain and step ids; get_method gives the labels).
 */
export function methodenTreffer(store: CatalogStore, b: Baustein) {
  return {
    kennung: b.kennung,
    name: b.name,
    kurzbeschreibung: b.kurzbeschreibung,
    reichweite: b.reichweite,
    status: b.status,
    eintragsart: b.eintragsart || 'methode',
    ansatz: b.ansatz,
    dauerMin: b.dauerMin,
    dauerMax: b.dauerMax,
    gruppeMin: b.gruppeMin,
    gruppeMax: b.gruppeMax,
    technik: b.technik,
    lernfunktion: b.lernfunktion,
    anleitung: b.anleitung,
    engagement: b.engagement,
    vorbedingung: b.vorbedingung,
    nachbedingung: b.nachbedingung,
    fachbereich: b.fachbereich || [],
    fachbereichUngeeignet: b.fachbereichUngeeignet || [],
    ungeeignetBeiStufe: b.ungeeignetBeiStufe || [],
    ungeeignetBeiVorwissen: b.ungeeignetBeiVorwissen || [],
    ...(b.eignungsgrund ? { eignungsgrund: b.eignungsgrund } : {}),
    raumbedarf: b.raumbedarf || [],
    ...(b.fachausstattungArt ? { fachausstattungArt: b.fachausstattungArt } : {}),
    schriftbedarf: b.schriftbedarf || [],
    ...(b.termineMin != null ? { termineMin: b.termineMin } : {}),
    evidenzgrad: store.search.bestGrade(b),
    evidenzBezug: evidenzBezugVon(b),
    einordnung: einordnungInKetten(b, store.bundle.ketten).map(({ kette, schritt }) => ({ kette, schritt }))
  };
}

/** The full entry (REST /methods/:kennung, MCP get_method): entry kind, best evidence grade and the chain steps it can fill. */
export function methodenDetail(store: CatalogStore, b: Baustein) {
  return {
    ...b,
    eintragsart: b.eintragsart || 'methode',
    evidenzgrad: store.search.bestGrade(b),
    einordnung: einordnungInKetten(b, store.bundle.ketten),
    creator: store.bundle.creator,
    license: store.bundle.license,
    leitplankenHinweis: 'Hoch-inferente Facetten (A1, D1) sind Experteneinschätzungen; Evidenz gilt stets nur im angegebenen Geltungsbereich.'
  };
}

/**
 * Classification of a free text (REST /classify, MCP classify_scenario_text): scales, subject and topic, the required
 * details the text leaves open (with their readable names in the next step) and the guardrails.
 */
export function klassifikationsAntwort(store: CatalogStore, text: string) {
  const extracted = extractSubjectAndTopicFromText(text);
  const cls = store.classifyText(text);
  // Required details the text leaves open (ask back) and the ones assumed (state them), as the matcher reads them.
  const pflichtangaben = store.matcher.zuordnen({ text }).pflichtangaben;
  const weiter =
    cls.kriterien.modus === 'phase'
      ? 'match_scenario (modus: "phase") oder search_methods aufrufen'
      : 'build_scenario_plan mit den vorab erkannten Kriterien aufrufen';
  const fehlt = (pflichtangaben?.fehlt || []).map((f) => PFLICHTANGABEN_NAMEN[f]);
  return {
    ...cls,
    erkanntesFach: extracted.fach,
    erkanntesThema: extracted.thema,
    pflichtangaben,
    empfohlenerNaechsterSchritt: fehlt.length
      ? `Frage zuerst in einer kurzen Frage nach: ${fehlt.join(', ')}. Danach ${weiter}; nenne pflichtangaben.angenommen als Annahmen.`
      : `${weiter}; nenne pflichtangaben.angenommen als Annahmen.`,
    leitplanken: FMT_GUARDRAILS
  };
}

/**
 * Match of a request (REST /match, MCP match_scenario). In mode phase `limit` caps the proposals and
 * `vorschlaegeGesamt` counts all; without limit every proposal stays. With a text the answer names the subject and
 * topic read from it (erkanntesFach, erkanntesThema, as /classify) and the traits of the differentiation matrix.
 * Throws on a request the matcher rejects.
 */
export function zuordnungsAntwort(store: CatalogStore, anfrage: MatchRequest, limit?: number) {
  const t0 = process.hrtime.bigint();
  const full = store.matcher.zuordnen(mitFachAufgeloest(store, anfrage));
  const res =
    full.modus === 'phase'
      ? {
          ...full,
          vorschlaege: limit != null ? full.vorschlaege.slice(0, limit) : full.vorschlaege,
          vorschlaegeGesamt: full.vorschlaege.length,
          ...(limit != null ? { limit } : {})
        }
      : full;
  const text = typeof anfrage.text === 'string' ? anfrage.text.trim() : '';
  const gelesen = text ? extractSubjectAndTopicFromText(text) : undefined;
  const extra = gelesen
    ? {
        erkanntesFach: gelesen.fach,
        erkanntesThema: gelesen.thema,
        // Former MCP field, kept for old clients (the match result has no topic of its own).
        thema: gelesen.thema,
        erkannteMatrixMerkmale: store.classifyText(text).matrixMerkmale
      }
    : {};
  const dauerMs = Math.round(Number(process.hrtime.bigint() - t0) / 1e4) / 100;
  return { ...res, dauerMs, ...extra, leitplanken: FMT_GUARDRAILS };
}

/**
 * Replacements at a path (REST /replacements, MCP suggest_replacements): candidates with their needs and the methods
 * left out with the reason of the core check. Throws on a path that names no method.
 */
export function ersatzAntwort(store: CatalogStore, arrangement: Arrangement, pfad: string, situation?: MatchRequest) {
  const { kandidaten, ausgeschlossen } = store.search.ersatzPruefung(arrangement, pfad, store.exampleRegistry, situation);
  return { pfad, hinweis: ersatzHinweis(situation), ...(situation ? { situation } : {}), kandidaten, ausgeschlossen };
}
