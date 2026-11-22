import { DIFF_MATRIX_DATA } from './differentiationMatrixData.js';
import type { Baustein } from './types.js';

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

export function getPersonaValues(personaId: string): Record<string, string> {
  const found = DIFF_MATRIX_PERSONAS.find((p) => p.id === personaId);
  return found ? { ...found.values } : {};
}

/**
 * Deterministic scoring engine ported from https://github.com/janschachtschabel/binnendifferenzierungsmatrix.
 * Sums the curated -2..+2 suitability scores across all selected Anpassungsvariablen for each of the 172 Maßnahmen.
 */
export function scoreDifferentiationMatrix(
  input: {
    personaId?: string;
    selectedValues?: Record<string, string>;
    minScore?: number;
    limit?: number;
    onlyBestPerCategory?: boolean;
  } = {}
): MatrixScoreResult {
  const merged: Record<string, string> = {
    ...(input.personaId ? getPersonaValues(input.personaId) : {}),
    ...(input.selectedValues || {})
  };
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

  const minScore = input.minScore ?? (selectedCount >= 10 ? 4 : selectedCount >= 3 ? 2 : 1);
  const onlyBestPerCategory = input.onlyBestPerCategory ?? true;
  const limit = Math.max(1, Math.min(50, input.limit ?? 12));

  const allScored: MatrixRecommendation[] = MEASURE_INDEX.map((m) => ({
    id: m.id,
    name: m.name,
    kategorieId: m.kategorieId,
    kategorieName: m.kategorieName,
    oberKategorieId: m.oberKategorieId,
    oberKategorieName: m.oberKategorieName,
    score: scores[m.idx]
  }));

  // Group by oberKategorie -> kategorie, selecting top measures per subcategory (matching RecommendationsPage.tsx)
  const selectedRecs: MatrixRecommendation[] = [];
  const byOkMap = new Map<string, { oberKategorieId: string; oberKategorieName: string; measures: MatrixRecommendation[] }>();

  for (const ok of DIFF_MATRIX_MEASURES) {
    const okMeasures: MatrixRecommendation[] = [];
    for (const kat of ok.kategorien) {
      const katItems = allScored.filter((x) => x.oberKategorieId === ok.id && x.kategorieId === kat.id);
      if (!katItems.length) continue;
      const maxS = Math.max(...katItems.map((x) => x.score));
      if (maxS < minScore) continue;
      const picked = onlyBestPerCategory
        ? katItems.filter((x) => x.score === maxS).slice(0, 2)
        : katItems.filter((x) => x.score >= minScore).sort((a, b) => b.score - a.score).slice(0, 3);
      okMeasures.push(...picked);
      selectedRecs.push(...picked);
    }
    okMeasures.sort((a, b) => b.score - a.score);
    if (okMeasures.length) {
      byOkMap.set(ok.id, {
        oberKategorieId: ok.id,
        oberKategorieName: ok.name,
        measures: okMeasures
      });
    }
  }

  selectedRecs.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'de'));
  const topRecommendations = selectedRecs.slice(0, limit);

  const avoidThreshold = selectedCount >= 10 ? -6 : selectedCount >= 3 ? -2 : -1;
  const avoidMeasures = allScored
    .filter((x) => x.score <= avoidThreshold)
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name, 'de'))
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

/**
 * Recommends concrete alternative FMT catalog methods for a subgroup in a given phase,
 * strictly enforcing matching Lernfunktion (purpose), compatible granularity (rang <= current),
 * and realistic duration while fitting the subgroup's matrix-computed guidance & scaffolding needs.
 */
export function suggestAlternativeMethodsForGroup(
  matrixResult: MatrixScoreResult,
  currentBlock: Baustein | undefined,
  allBlocks: Baustein[],
  limit = 5,
  phaseDurationMin?: number
): Array<{ kennung: string; name: string; reichweite: string; dauerMin: number; dauerMax: number; grund: string }> {
  if (!currentBlock) return [];
  const fns = new Set(currentBlock.lernfunktion || []);
  const wantGuidance = matrixResult.didacticProfile.preferredGuidance;
  const curRank = RANGE_ORDER[currentBlock.reichweite] ?? 2;
  const maxDur = Math.max(phaseDurationMin ?? currentBlock.dauerMax, currentBlock.dauerMax) * 1.5;

  const scored = allBlocks
    .filter((b) => {
      if (b.kennung === currentBlock.kennung) return false;
      if (!b.lernfunktion.some((f) => fns.has(f))) return false;
      const bRank = RANGE_ORDER[b.reichweite] ?? 2;
      if (bRank > curRank) return false;
      if (b.dauerMin > maxDur) return false;
      return true;
    })
    .map((b) => {
      let fit = 0;
      const reasons: string[] = [];
      if (b.anleitung.includes(wantGuidance)) {
        fit += 4;
        reasons.push(`passt zum Lenkungsbedarf (${wantGuidance})`);
      }
      if (matrixResult.didacticProfile.needsScaffolding && (b.adaptivitaet.includes('diff-prozess') || b.adaptivitaet.includes('diff-tempo'))) {
        fit += 2;
        reasons.push('bietet Hilfestufen / Tempoanpassung');
      }
      if (matrixResult.didacticProfile.benefitsFromEnrichment && (b.engagement.includes('konstruktiv') || b.engagement.includes('interaktiv'))) {
        fit += 2;
        reasons.push('ermöglicht vertiefende Konstruktion/Transfer');
      }
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
