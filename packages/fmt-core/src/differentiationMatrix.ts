import { istMethode } from './eintragsart.js';
import { DIFF_MATRIX_DATA } from './differentiationMatrixData.js';
import {
  getMeasureEnrichment,
  MEASURE_EFFORT_ORDER,
  MEASURE_LEVEL_ORDER,
  type MeasureEffort,
  type MeasureEnrichment,
  type MeasureLevel,
  type MeasureTech
} from './differentiationMetadata.js';
import type { Baustein } from './types.js';
import { TECH_RANK, techLimitRank } from './technik.js';

export type { MeasureEffort, MeasureEnrichment, MeasureLevel, MeasureTech };
export { getMeasureEnrichment, MEASURE_EFFORT_ORDER, MEASURE_LEVEL_ORDER };

export type MeasureRelevance = 'kern' | 'ergaenzend' | 'neutral' | 'vermeiden';

export interface MatrixAuspraegung {
  id: string;
  name: string;
}

export interface MatrixKategorie {
  id: string;
  name: string;
  auspraegungen: MatrixAuspraegung[];
}

export interface MatrixOberkategorie {
  id: string;
  name: string;
  kategorien: MatrixKategorie[];
}

export interface MatrixPersona {
  id: string;
  name: string;
  description: string;
  values: Record<string, string>;
}

export interface MatrixRecommendation {
  id: string;
  name: string;
  kategorieId: string;
  kategorieName: string;
  oberKategorieId: string;
  oberKategorieName: string;
  score: number;
  normalizedScore: number;
  relevanz: MeasureRelevance;
  meta: MeasureEnrichment;
}

export interface MatrixScoreResult {
  selectedCount: number;
  topRecommendations: MatrixRecommendation[];
  byOberKategorie: Array<{
    oberKategorieId: string;
    oberKategorieName: string;
    measures: MatrixRecommendation[];
  }>;
  avoidMeasures: MatrixRecommendation[];
  didacticProfile: {
    preferredGuidance: 'explizit' | 'geleitet' | 'offen';
    needsScaffolding: boolean;
    needsLanguageSupport: boolean;
    benefitsFromEnrichment: boolean;
    summary: string;
  };
}

interface MeasureIndexEntry {
  idx: number;
  id: string;
  name: string;
  kategorieId: string;
  kategorieName: string;
  oberKategorieId: string;
  oberKategorieName: string;
}

export const DIFF_MATRIX_VARIABLES: readonly MatrixOberkategorie[] = DIFF_MATRIX_DATA.anpassungsvariablen as unknown as MatrixOberkategorie[];
export const DIFF_MATRIX_MEASURES: readonly MatrixOberkategorie[] = DIFF_MATRIX_DATA.massnahmen as unknown as MatrixOberkategorie[];

// Curated personas from binnendifferenzierungsmatrix + two additional frequent classroom profiles
export const DIFF_MATRIX_PERSONAS: readonly MatrixPersona[] = [
  {
    id: 'languageAndCulture',
    name: DIFF_MATRIX_DATA.personas.languageAndCulture.name,
    description: DIFF_MATRIX_DATA.personas.languageAndCulture.description,
    values: { ...DIFF_MATRIX_DATA.personas.languageAndCulture.values }
  },
  {
    id: 'average',
    name: DIFF_MATRIX_DATA.personas.average.name,
    description: DIFF_MATRIX_DATA.personas.average.description,
    values: { ...DIFF_MATRIX_DATA.personas.average.values }
  },
  {
    id: 'highPerforming',
    name: DIFF_MATRIX_DATA.personas.highPerforming.name,
    description: DIFF_MATRIX_DATA.personas.highPerforming.description,
    values: { ...DIFF_MATRIX_DATA.personas.highPerforming.values }
  },
  {
    id: 'foerderLernen',
    name: 'Förderbedarf Lernen & Strukturbedarf',
    description: 'Geringes Vorwissen, langsameres Arbeitstempo, hoher Bedarf an klaren Schrittfolgen und Hilfekarten',
    values: {
      vorwissen: 'vorwissen-gering',
      leistungsniveau: 'leistungsniveau-gering',
      metakognitive: 'metakognitive-gering',
      lernstrategien: 'lernstrategien-kaum',
      denkverarbeitung: 'denkverarbeitung-langsam',
      strukturierung: 'strukturierung-stark',
      methoden: 'methoden-direkt',
      engagement: 'engagement-mittel',
      selbstwirksamkeit: 'selbstwirksamkeit-gering',
      'zeitliche-verfuegbarkeit': 'zeitliche-verfuegbarkeit-eingeschraenkt',
      'foerderbedarf-lernen': 'foerderbedarf-lernen-umfassend'
    }
  },
  {
    id: 'foerderEmSoz',
    name: 'Emotionale/soziale Unterstützung & Fokus',
    description: 'Schwankende Konzentration, Bedarf an kurzen Takten, klaren Regeln und positivem Feedback',
    values: {
      vorwissen: 'vorwissen-mittel',
      strukturierung: 'strukturierung-stark',
      engagement: 'engagement-gering',
      resilienz: 'resilienz-gering',
      'emotionale-stabilitaet': 'emotionale-stabilitaet-schwankend',
      'soziale-kompetenzen': 'soziale-kompetenzen-eingeschraenkt',
      herausforderungen: 'herausforderungen-vermeidend',
      'foerderbedarf-emotional-sozial': 'foerderbedarf-emotional-sozial-deutlich'
    }
  }
];

const MEASURE_INDEX: MeasureIndexEntry[] = (() => {
  const list: MeasureIndexEntry[] = [];
  let idx = 0;
  for (const ok of DIFF_MATRIX_MEASURES) {
    for (const kat of ok.kategorien) {
      for (const a of kat.auspraegungen) {
        list.push({
          idx,
          id: a.id,
          name: a.name,
          kategorieId: kat.id,
          kategorieName: kat.name,
          oberKategorieId: ok.id,
          oberKategorieName: ok.name
        });
        idx++;
      }
    }
  }
  return list;
})();

const MATRIX_LOOKUP: Record<string, string> = DIFF_MATRIX_DATA.matrix as unknown as Record<string, string>;

const MEASURE_ENRICHMENT_BY_ID = new Map<string, MeasureEnrichment>(
  MEASURE_INDEX.map((m) => [m.id, getMeasureEnrichment(m.id, m.kategorieId)])
);

export const DEFAULT_CLASSROOM_LEVELS: readonly MeasureLevel[] = ['unterricht-sofort', 'material-planung'];

export function classifyRelevance(normalizedScore: number): MeasureRelevance {
  if (normalizedScore >= 45) return 'kern';
  if (normalizedScore >= 15) return 'ergaenzend';
  if (normalizedScore <= -15) return 'vermeiden';
  return 'neutral';
}

export function isMeasureAllowedByConstraints(
  meta: MeasureEnrichment,
  constraints: {
    ebenen?: readonly MeasureLevel[];
    includeSystemMeasures?: boolean;
    maxTechnik?: string;
    ohneInternet?: boolean;
    ohneKI?: boolean;
    maxAufwand?: MeasureEffort;
  }
): boolean {
  const allowedLevels: readonly MeasureLevel[] = constraints.ebenen?.length
    ? constraints.ebenen
    : constraints.includeSystemMeasures
      ? ['unterricht-sofort', 'material-planung', 'organisation-system']
      : DEFAULT_CLASSROOM_LEVELS;
  if (!allowedLevels.includes(meta.ebene)) return false;

  if (constraints.maxTechnik === 't-keine' && meta.technik !== 'analog') return false;
  if (constraints.maxTechnik === 't-projektion' && meta.technik !== 'analog' && meta.technik !== 'projektion') {
    return false;
  }
  if (constraints.ohneInternet && meta.technik === 'online') return false;
  if (constraints.maxAufwand && MEASURE_EFFORT_ORDER[meta.aufwand] > MEASURE_EFFORT_ORDER[constraints.maxAufwand]) {
    return false;
  }
  return true;
}

const compareRecommendations = (a: MatrixRecommendation, b: MatrixRecommendation): number =>
  b.normalizedScore - a.normalizedScore ||
  MEASURE_LEVEL_ORDER[a.meta.ebene] - MEASURE_LEVEL_ORDER[b.meta.ebene] ||
  MEASURE_EFFORT_ORDER[a.meta.aufwand] - MEASURE_EFFORT_ORDER[b.meta.aufwand] ||
  b.score - a.score ||
  a.name.localeCompare(b.name, 'de');

export function getPersonaValues(personaId: string): Record<string, string> {
  const found = DIFF_MATRIX_PERSONAS.find((p) => p.id === personaId);
  return found ? { ...found.values } : {};
}

/**
 * A learner who uses a wheelchair ("im Rollstuhl", "Rollstuhlfahrer", "Kind mit Rollstuhl"); the wheelchair as an object
 * ("Transfer in den Rollstuhl") or in a topic ("Transfer eines Kindes mit Rollstuhl") names no learner. Source string of a
 * case-insensitive pattern, shared by the matrix traits and the learner groups of adaptScenario.
 */
export const ROLLSTUHL_LERNENDE =
  String.raw`\brollstuhl(?:fahr|nutz)\w*|\bim\s+rollstuhl\b|\b(?:kind(?:er)?|sch[uü]ler(?:in(?:nen)?)?|lernende[rn]?|person(?:en)?|teilnehm(?:er(?:in(?:nen)?)?|ende[rn]?)|jugendliche[rn]?|studierende[rn]?|auszubildende[rn]?|azubis?)\s+mit\s+(?:einem\s+)?rollstuhl\b`;

/**
 * Matrix categories that are never evaluated (Lerntypen/Lernstile, Pashler et al. 2008). Mirrors `gesperrt` in
 * data/teilgruppen.json (a test keeps both in step); callers with the data pass its list as `gesperrt`.
 */
export const GESPERRTE_MATRIX_KATEGORIEN: readonly string[] = ['sensorische'];

export interface ScoreMatrixInput {
  personaId?: string;
  selectedValues?: Record<string, string>;
  /** Categories that are ignored (default GESPERRTE_MATRIX_KATEGORIEN). */
  gesperrt?: readonly string[];
  minScore?: number;
  limit?: number;
  onlyBestPerCategory?: boolean;
  ebenen?: MeasureLevel[];
  includeSystemMeasures?: boolean;
  maxTechnik?: string;
  ohneInternet?: boolean;
  ohneKI?: boolean;
  maxAufwand?: MeasureEffort;
}

/**
 * Deterministic scoring engine ported from https://github.com/janschachtschabel/binnendifferenzierungsmatrix.
 * Sums the curated -2..+2 suitability scores across all selected Anpassungsvariablen for each of the 172 Maßnahmen,
 * normalizes to -100..+100, enriches with classroom metadata (ebene, aufwand, technik, phasen, fmtBruecke, umsetzungsimpuls),
 * and filters out school/system-level or tech-incompatible measures by default.
 */
export function scoreDifferentiationMatrix(input: ScoreMatrixInput = {}): MatrixScoreResult {
  const gesperrt = new Set(input.gesperrt ?? GESPERRTE_MATRIX_KATEGORIEN);
  const merged: Record<string, string> = Object.fromEntries(
    Object.entries({
      ...(input.personaId ? getPersonaValues(input.personaId) : {}),
      ...(input.selectedValues || {})
    }).filter(([kategorie]) => !gesperrt.has(kategorie))
  );
  const activeAuspraegungen = Object.values(merged).filter((v) => typeof v === 'string' && Boolean(MATRIX_LOOKUP[v]));
  const selectedCount = activeAuspraegungen.length;

  const scores = new Int32Array(MEASURE_INDEX.length);
  for (const auspId of activeAuspraegungen) {
    const row = MATRIX_LOOKUP[auspId];
    if (!row) continue;
    const len = Math.min(row.length, scores.length);
    for (let i = 0; i < len; i++) {
      scores[i] += row.charCodeAt(i) - 50; // '0' (48) -> -2, '2' (50) -> 0, '4' (52) -> +2
    }
  }

  const maxPossible = Math.max(1, selectedCount * 2);
  const onlyBestPerCategory = input.onlyBestPerCategory ?? true;
  const limit = Math.max(1, Math.min(50, input.limit ?? 12));
  const useRawMinScore = input.minScore != null;
  const rawMinScore = input.minScore ?? 1;

  const allScored: MatrixRecommendation[] = MEASURE_INDEX.filter((m) =>
    isMeasureAllowedByConstraints(MEASURE_ENRICHMENT_BY_ID.get(m.id)!, input)
  ).map((m) => {
    const raw = scores[m.idx];
    const normalizedScore = selectedCount > 0 ? Math.round((raw / maxPossible) * 100) : 0;
    return {
      id: m.id,
      name: m.name,
      kategorieId: m.kategorieId,
      kategorieName: m.kategorieName,
      oberKategorieId: m.oberKategorieId,
      oberKategorieName: m.oberKategorieName,
      score: raw,
      normalizedScore,
      relevanz: classifyRelevance(normalizedScore),
      meta: MEASURE_ENRICHMENT_BY_ID.get(m.id)!
    };
  });

  // Group by oberKategorie -> kategorie, selecting top measures per subcategory
  const selectedRecs: MatrixRecommendation[] = [];
  const byOkMap = new Map<string, { oberKategorieId: string; oberKategorieName: string; measures: MatrixRecommendation[] }>();

  for (const ok of DIFF_MATRIX_MEASURES) {
    const okMeasures: MatrixRecommendation[] = [];
    for (const kat of ok.kategorien) {
      const katItems = allScored.filter((x) => x.oberKategorieId === ok.id && x.kategorieId === kat.id);
      if (!katItems.length) continue;
      katItems.sort(compareRecommendations);
      const top = katItems[0];
      const passes = useRawMinScore ? top.score >= rawMinScore : top.normalizedScore >= 15;
      if (!passes) continue;
      const picked = onlyBestPerCategory
        ? katItems.filter((x) => x.normalizedScore === top.normalizedScore).slice(0, 2)
        : katItems.filter((x) => (useRawMinScore ? x.score >= rawMinScore : x.normalizedScore >= 15)).slice(0, 3);
      okMeasures.push(...picked);
      selectedRecs.push(...picked);
    }
    okMeasures.sort(compareRecommendations);
    if (okMeasures.length) {
      byOkMap.set(ok.id, {
        oberKategorieId: ok.id,
        oberKategorieName: ok.name,
        measures: okMeasures
      });
    }
  }

  selectedRecs.sort(compareRecommendations);
  const topRecommendations = selectedRecs.slice(0, limit);

  const avoidMeasures = allScored
    .filter((x) => x.normalizedScore <= -15)
    .sort((a, b) => a.normalizedScore - b.normalizedScore || a.score - b.score || a.name.localeCompare(b.name, 'de'))
    .slice(0, 6);

  // Derive didactic alignment signals for bridging to FMT methods
  const scoreOf = (id: string) => {
    const found = MEASURE_INDEX.find((m) => m.id === id);
    return found ? scores[found.idx] : 0;
  };
  const strongStructScore = scoreOf('struktur-lehrersteuerung-stark') + scoreOf('offenheit-detailliert');
  const openScore = scoreOf('struktur-lehrersteuerung-offen') + scoreOf('offenheit-offen') + scoreOf('methodische-varianten-entdeckend');
  const preferredGuidance: 'explizit' | 'geleitet' | 'offen' =
    strongStructScore >= openScore + 3 ? 'explizit' : openScore >= strongStructScore + 3 ? 'offen' : 'geleitet';
  const needsScaffolding =
    scoreOf('modifikation-hilfe') > 0 ||
    scoreOf('komplexitaet-struktur-schritt') > 0 ||
    merged.vorwissen === 'vorwissen-gering' ||
    merged.strukturierung === 'strukturierung-stark';
  const needsLanguageSupport =
    scoreOf('sprachliche-unterstuetzung-wortschatz') > 0 ||
    scoreOf('sprachliche-unterstuetzung-fachunterricht') > 0 ||
    merged.sprachkompetenz === 'sprachkompetenz-gering' ||
    merged['foerderbedarf-sprache'] === 'foerderbedarf-sprache-erheblich';
  const benefitsFromEnrichment =
    scoreOf('zieltypen-erweitert') > 0 ||
    scoreOf('aufgabentypen-transfer') > 0 ||
    merged.vorwissen === 'vorwissen-hoch' ||
    merged.leistungsniveau === 'leistungsniveau-hoch';

  const summaryParts: string[] = [];
  if (topRecommendations.length) {
    summaryParts.push(
      `Top-Maßnahmen: ${topRecommendations
        .slice(0, 3)
        .map((r) => `${r.name} (+${r.score})`)
        .join('; ')}.`
    );
  }
  summaryParts.push(
    preferredGuidance === 'explizit'
      ? 'Empfohlene Lenkung: stark strukturiert / explizit-angeleitet.'
      : preferredGuidance === 'offen'
        ? 'Empfohlene Lenkung: offen / selbstgesteuert mit Transfer.'
        : 'Empfohlene Lenkung: moderat geleitet mit Wahlmöglichkeiten.'
  );

  return {
    selectedCount,
    topRecommendations,
    byOberKategorie: [...byOkMap.values()],
    avoidMeasures,
    didacticProfile: {
      preferredGuidance,
      needsScaffolding,
      needsLanguageSupport,
      benefitsFromEnrichment,
      summary: summaryParts.join(' ')
    }
  };
}

const RANGE_ORDER: Record<string, number> = { r1: 1, r2: 2, r3: 3, r4: 4, r5: 5 };

const AI_ROLES_SET = new Set(['tutor', 'dialogpartner', 'simulationsrolle', 'belehrbarer-agent', 'antwortgeber']);

/**
 * Counts how many FMT-facet bridge tokens from top matrix measures match a given FMT Baustein.
 */
export function scoreMethodAgainstFmtBridges(b: Baustein, measures: readonly MatrixRecommendation[]): { hits: number; matchedLabels: string[] } {
  const facetValues: Record<string, string[]> = {
    anleitung: b.anleitung || [],
    adaptivitaet: b.adaptivitaet || [],
    engagement: b.engagement || [],
    interaktion: b.interaktion || [],
    repraesentation: b.repraesentation || [],
    feedback: b.feedback || []
  };
  const wantedTokens = new Set<string>();
  for (const m of measures.slice(0, 8)) {
    for (const tok of m.meta?.fmtBruecke || []) wantedTokens.add(tok);
  }
  const matchedLabels: string[] = [];
  for (const tok of wantedTokens) {
    const [scheme, code] = tok.split(':');
    if (scheme && code && (facetValues[scheme] || []).includes(code)) {
      matchedLabels.push(tok);
    }
  }
  return { hits: matchedLabels.length, matchedLabels };
}

/**
 * How well a method meets a learner group's needs from the matrix (guidance, facet bridges, scaffolding, enrichment).
 * Only group-related signals count here, so two methods can be compared for the same group.
 */
export function scoreMethodForGroup(b: Baustein, matrixResult: MatrixScoreResult): { fit: number; reasons: string[] } {
  let fit = 0;
  const reasons: string[] = [];
  const wantGuidance = matrixResult.didacticProfile.preferredGuidance;
  if (b.anleitung.includes(wantGuidance)) {
    fit += 4;
    reasons.push(`passt zum Lenkungsbedarf (${wantGuidance})`);
  }
  const bridge = scoreMethodAgainstFmtBridges(b, matrixResult.topRecommendations);
  if (bridge.hits > 0) {
    fit += Math.min(4, bridge.hits);
    reasons.push(`FMT-Facetten-Brücke (${bridge.matchedLabels.slice(0, 2).join(', ')})`);
  }
  if (matrixResult.didacticProfile.needsScaffolding && (b.adaptivitaet.includes('diff-prozess') || b.adaptivitaet.includes('diff-tempo'))) {
    fit += 2;
    reasons.push('bietet Hilfestufen / Tempoanpassung');
  }
  if (matrixResult.didacticProfile.benefitsFromEnrichment && (b.engagement.includes('konstruktiv') || b.engagement.includes('interaktiv'))) {
    fit += 2;
    reasons.push('ermöglicht vertiefende Konstruktion/Transfer');
  }
  return { fit, reasons };
}

/**
 * Recommends concrete alternative FMT catalog methods for a subgroup in a given phase,
 * strictly enforcing matching Lernfunktion (purpose), compatible granularity (rang <= current),
 * tech/offline/KI/stage constraints, generic FMT-facet domain coherence (no psychomotor/play-simulation swaps
 * for cognitive/STEM/text blocks), and realistic duration while fitting the subgroup's matrix-computed
 * guidance, scaffolding, and fmtBruecke needs.
 */
export function suggestAlternativeMethodsForGroup(
  matrixResult: MatrixScoreResult,
  currentBlock: Baustein | undefined,
  allBlocks: Baustein[],
  limit = 5,
  phaseDurationMin?: number,
  constraints?: { maxTechnik?: string; ohneInternet?: boolean; ohneKI?: boolean; bildungsstufe?: string; fachbereich?: string }
): Array<{ kennung: string; name: string; reichweite: string; dauerMin: number; dauerMax: number; grund: string }> {
  if (!currentBlock) return [];
  const fns = new Set(currentBlock.lernfunktion || []);
  const curAnsatz = new Set(currentBlock.ansatz || []);
  const curAufgabe = new Set(currentBlock.aufgabe || []);
  const curKat = new Set(currentBlock.kategorie || []);
  const curIsPsychomotor = curAufgabe.has('psychomotorik');
  const curIsPlaySim = curAnsatz.has('spiel-simulation');
  const curRank = RANGE_ORDER[currentBlock.reichweite] ?? 2;
  const maxDur = Math.max(phaseDurationMin ?? currentBlock.dauerMax, currentBlock.dauerMax) * 1.5;
  const maxTechRank = techLimitRank(constraints?.maxTechnik);

  const scored = allBlocks
    .filter((b) => {
      if (b.kennung === currentBlock.kennung) return false;
      // A help supports learners inside a method; it is never a parallel method.
      if (!istMethode(b)) return false;
      if (!b.lernfunktion.some((f) => fns.has(f))) return false;
      const bRank = RANGE_ORDER[b.reichweite] ?? 2;
      if (bRank > curRank) return false;
      if (b.dauerMin > maxDur) return false;
      if ((TECH_RANK[b.technik] ?? 0) > maxTechRank) return false;
      if (constraints?.fachbereich && (b.fachbereichUngeeignet || []).includes(constraints.fachbereich)) return false;
      if (constraints?.ohneInternet && b.internet) return false;
      if (constraints?.ohneKI && (Boolean(b.ki) || (b.rolle || []).some((r) => AI_ROLES_SET.has(r)))) return false;
      if (constraints?.bildungsstufe && (b.ungeeignetBeiStufe || []).includes(constraints.bildungsstufe)) return false;
      // Exclude negative-evidence contrast methods
      if (
        (b.evidenz || []).some((e) =>
          /bleibt\s+empirisch\s+deutlich\s+hinter|schneide(?:t|n)\b[^.]{0,60}\bschwächer\s+ab/i.test(e.befund || '')
        )
      ) {
        return false;
      }
      // Generic FMT-facet domain-coherence guard (zero hardcoded method names):
      // never propose psychomotor/sports or drama/play-simulation alternatives for cognitive/STEM/text blocks
      if (!curIsPsychomotor && (b.aufgabe || []).includes('psychomotorik')) return false;
      if (!curIsPlaySim && (b.ansatz || []).includes('spiel-simulation')) return false;
      return true;
    })
    .map((b) => {
      const groupFit = scoreMethodForGroup(b, matrixResult);
      let fit = groupFit.fit;
      const reasons = [...groupFit.reasons];
      // Domain/approach coherence bonus with the replaced method
      if ((b.aufgabe || []).some((a) => curAufgabe.has(a))) fit += 2;
      if ((b.ansatz || []).some((a) => curAnsatz.has(a))) fit += 1;
      if ((b.kategorie || []).some((k) => curKat.has(k))) fit += 1;
      if (b.status === 'kuratiert') fit += 1;
      if (b.reichweite === currentBlock.reichweite) fit += 2;
      return {
        b,
        fit,
        grund: reasons.length ? reasons.join(', ') : `gleiche Lernfunktion (${b.lernfunktion.join(', ')})`
      };
    })
    .filter((x) => x.fit >= 4)
    .sort((a, b) => b.fit - a.fit || a.b.name.localeCompare(b.b.name, 'de'));

  return scored.slice(0, limit).map((x) => ({
    kennung: x.b.kennung,
    name: x.b.name,
    reichweite: x.b.reichweite,
    dauerMin: x.b.dauerMin,
    dauerMax: x.b.dauerMax,
    grund: x.grund
  }));
}

export interface DetectedMatrixTrait {
  categoryId: string;
  valueId: string;
  label: string;
  trigger: string;
}

export interface MatrixTraitDetectionResult {
  selectedValues: Record<string, string>;
  signals: DetectedMatrixTrait[];
  /** Traits of blocked categories the text names (e.g. Lerntypen); they are not in selectedValues and never score. */
  gesperrt: DetectedMatrixTrait[];
  suggestedPersonaId: string | null;
  matrixScore: MatrixScoreResult | null;
}

const MATRIX_TRAIT_RULES: Array<{
  re: RegExp;
  traits: Array<{ categoryId: string; valueId: string; label: string }>;
  personaHint?: string;
}> = [
  {
    re: /\b(?:daz|deutsch als zweitsprache|sprachsensib\w*|sprachfoerder\w*|sprachförder\w*|geringe\s+sprach\w*|wenig\s+deutsch|mehrsprachig\w*|nicht-?muttersprach\w*)/i,
    personaHint: 'languageAndCulture',
    traits: [
      // DaZ is second-language acquisition, not a special need (no foerderbedarf-sprache).
      { categoryId: 'sprachkompetenz', valueId: 'sprachkompetenz-gering', label: 'Geringe Sprachkompetenz (DaZ / Sprachförderung)' },
      { categoryId: 'ausdrucksfaehigkeit', valueId: 'ausdrucksfaehigkeit-eingeschraenkt', label: 'Eingeschränkte Fachsprache' }
    ]
  },
  {
    re: /\b(?:lrs|legasthen\w*|lese-?rechtschreib\w*|leseschw[aä]ch\w*)/i,
    personaHint: 'foerderLernen',
    traits: [
      { categoryId: 'ausdrucksfaehigkeit', valueId: 'ausdrucksfaehigkeit-eingeschraenkt', label: 'LRS / Lese-Rechtschreib-Unterstützung' },
      { categoryId: 'foerderbedarf-sprache', valueId: 'foerderbedarf-sprache-gelegentlich', label: 'Sprach-/Leseunterstützung' }
    ]
  },
  {
    re: /\b(?:adhs|ads\b|konzentrations\w*|unruhig\w*|ablenkbar\w*|kurze\s+aufmerksamkeit)/i,
    personaHint: 'foerderEmSoz',
    traits: [
      { categoryId: 'strukturierung', valueId: 'strukturierung-stark', label: 'Hoher Strukturierungsbedarf (ADHS / Fokus)' },
      { categoryId: 'foerderbedarf-emotional-sozial', valueId: 'foerderbedarf-emotional-sozial-gelegentlich', label: 'Fokus- & Selbstregulationshilfe' },
      { categoryId: 'engagement', valueId: 'engagement-gering', label: 'Kurze, aktivierende Takte nötig' }
    ]
  },
  {
    re: /\b(?:autismus|autist\w*|ass\b|asperger)/i,
    personaHint: 'foerderEmSoz',
    traits: [
      { categoryId: 'foerderbedarf-autismus', valueId: 'foerderbedarf-autismus-deutlich', label: 'Förderbedarf Autismus-Spektrum' },
      { categoryId: 'strukturierung', valueId: 'strukturierung-stark', label: 'Klare, vorhersehbare Strukturierung' }
    ]
  },
  {
    re: /\b(?:f[oö]rderbedarf\s+lernen|lernschwach\w*|lernschwierig\w*|inklusion|inklusiv\w*|langsames?\s+(?:lern)?tempo)/i,
    personaHint: 'foerderLernen',
    traits: [
      { categoryId: 'foerderbedarf-lernen', valueId: 'foerderbedarf-lernen-umfassend', label: 'Förderbedarf Lernen' },
      { categoryId: 'denkverarbeitung', valueId: 'denkverarbeitung-langsam', label: 'Mehr Bearbeitungszeit / Kleinschrittigkeit' },
      { categoryId: 'strukturierung', valueId: 'strukturierung-stark', label: 'Starke Strukturierung & Hilfekarten' }
    ]
  },
  {
    re: /\b(?:emotional-?sozial|verhaltensauff[aä]llig\w*|konfliktreich\w*|sozial\w*\s+schwierig\w*)/i,
    personaHint: 'foerderEmSoz',
    traits: [
      { categoryId: 'foerderbedarf-emotional-sozial', valueId: 'foerderbedarf-emotional-sozial-deutlich', label: 'Emotional-soziale Unterstützung' },
      { categoryId: 'soziale-kompetenzen', valueId: 'soziale-kompetenzen-eingeschraenkt', label: 'Klare Rollen & Gesprächsregeln' }
    ]
  },
  {
    re: /\b(?:h[oö]rbeeintr[aä]cht\w*|schwerh[oö]rig\w*|geh[oö]rlos\w*)/i,
    traits: [
      { categoryId: 'foerderbedarf-hoeren', valueId: 'foerderbedarf-hoeren-beeintraechtigung', label: 'Hörbeeinträchtigung (visuelle Sicherung)' }
    ]
  },
  {
    re: /\b(?:sehbeeintr[aä]cht\w*|sehbehindert\w*|blind\w*)/i,
    traits: [
      { categoryId: 'foerderbedarf-sehen', valueId: 'foerderbedarf-sehen-deutlich', label: 'Sehbeeinträchtigung (Kontrast / Audio)' }
    ]
  },
  {
    re: new RegExp(String.raw`\b(?:k[oö]rperlich\w*\s+beeintr|motorisch\w*\s+einschr)|${ROLLSTUHL_LERNENDE}`, 'i'),
    traits: [
      { categoryId: 'foerderbedarf-koerperlich', valueId: 'foerderbedarf-koerperlich-deutlich', label: 'Barrierefreie Bewegungs- & Raumgestaltung' }
    ]
  },
  {
    re: /\b(?:hochbegabt\w*|leistungsstark\w*|sehr\s+schnell\w*|unterfordert\w*|begabungsf[oö]rder\w*)/i,
    personaHint: 'highPerforming',
    traits: [
      { categoryId: 'leistungsniveau', valueId: 'leistungsniveau-hoch', label: 'Hohes Leistungsniveau' },
      { categoryId: 'denkverarbeitung', valueId: 'denkverarbeitung-schnell', label: 'Hohes Arbeitstempo (Transfer/Enrichment)' },
      { categoryId: 'vorwissen', valueId: 'vorwissen-hoch', label: 'Hohes Vorwissen' }
    ]
  },
  {
    re: /\b(?:unmotiviert\w*|wenig\s+motivation|geringe\s+motivation|desinteress\w*|m[uü]de\s+klasse)/i,
    traits: [
      { categoryId: 'engagement', valueId: 'engagement-gering', label: 'Geringe Ausgangsmotivation (Lebensweltbezug stärken)' },
      { categoryId: 'interessen', valueId: 'interessen-desinteresse', label: 'Interesse aktivierend wecken' }
    ]
  },
  // Learning styles: recognised so the answer can say why they are not evaluated (blocked category); negated mentions
  // („keine Lerntypen“, „nicht nach Lerntypen“) are skipped.
  {
    re: /(?<!\b(?:kein\w*|ohne|nicht)\s+(?:nach\s+|in\s+)?(?:\w+\s+)?)\bvisuell\w*\s+(?:lerntyp\w*|lernstil\w*|lerner\w*|lernende\w*)/i,
    traits: [{ categoryId: 'sensorische', valueId: 'sensorische-visuell', label: 'Visueller Lerntyp' }]
  },
  {
    re: /(?<!\b(?:kein\w*|ohne|nicht)\s+(?:nach\s+|in\s+)?(?:\w+\s+)?)\bauditiv\w*\s+(?:lerntyp\w*|lernstil\w*|lerner\w*|lernende\w*)/i,
    traits: [{ categoryId: 'sensorische', valueId: 'sensorische-auditiv', label: 'Auditiver Lerntyp' }]
  },
  {
    re: /(?<!\b(?:kein\w*|ohne|nicht)\s+(?:nach\s+|in\s+)?(?:\w+\s+)?)\b(?:haptisch\w*|kin[aä]sthetisch\w*)\s+(?:lerntyp\w*|lernstil\w*|lerner\w*|lernende\w*)/i,
    traits: [{ categoryId: 'sensorische', valueId: 'sensorische-kinaesthetisch', label: 'Kinästhetischer Lerntyp' }]
  },
  {
    re: /(?<!\b(?:kein\w*|ohne|nicht)\s+(?:nach\s+|in\s+)?(?:\w+\s+)?)\b(?:lerntyp\w*|lernstil\w*)/i,
    traits: [{ categoryId: 'sensorische', valueId: 'sensorische-multimodal', label: 'Lerntyp / Lernstil' }]
  },
  {
    re: /\b(?:kein\w*|wenig|kaum|gering\w*)\s+(?:vorwissen|vorkenntnis\w*)/i,
    traits: [
      { categoryId: 'vorwissen', valueId: 'vorwissen-gering', label: 'Geringes Vorwissen' }
    ]
  }
];

/**
 * Deterministically maps heterogeneity, language, motivation, and inclusion cues from free text
 * onto the 115 exact traits of the Binnendifferenzierungsmatrix (zero LLM required).
 */
export function detectMatrixTraitsFromText(text: string, opts: { gesperrt?: readonly string[] } = {}): MatrixTraitDetectionResult {
  const raw = (text || '').trim();
  const selectedValues: Record<string, string> = {};
  const signals: DetectedMatrixTrait[] = [];
  const gesperrt: DetectedMatrixTrait[] = [];
  const blockiert = new Set(opts.gesperrt ?? GESPERRTE_MATRIX_KATEGORIEN);
  let suggestedPersonaId: string | null = null;

  if (!raw) {
    return { selectedValues, signals, gesperrt, suggestedPersonaId, matrixScore: null };
  }

  for (const rule of MATRIX_TRAIT_RULES) {
    const m = rule.re.exec(raw);
    if (!m) continue;
    if (!suggestedPersonaId && rule.personaHint) suggestedPersonaId = rule.personaHint;
    for (const t of rule.traits) {
      if (blockiert.has(t.categoryId)) {
        if (!gesperrt.some((g) => g.categoryId === t.categoryId)) gesperrt.push({ ...t, trigger: m[0].trim() });
      } else if (!(t.categoryId in selectedValues)) {
        selectedValues[t.categoryId] = t.valueId;
        signals.push({ ...t, trigger: m[0].trim() });
      }
    }
  }

  const matrixScore =
    Object.keys(selectedValues).length > 0 ? scoreDifferentiationMatrix({ selectedValues, limit: 6, gesperrt: [...blockiert] }) : null;

  return { selectedValues, signals, gesperrt, suggestedPersonaId, matrixScore };
}
