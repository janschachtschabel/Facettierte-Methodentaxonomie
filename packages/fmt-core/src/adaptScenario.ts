import {
  DEFAULT_CLASSROOM_LEVELS,
  DIFF_MATRIX_MEASURES,
  MEASURE_EFFORT_ORDER,
  MEASURE_LEVEL_ORDER,
  detectMatrixTraitsFromText,
  scoreDifferentiationMatrix,
  scoreMethodAgainstFmtBridges,
  suggestAlternativeMethodsForGroup,
  type MatrixRecommendation,
  type MatrixScoreResult,
  type MeasureEffort,
  type MeasureLevel
} from './differentiationMatrix.js';
import type { Arrangement, Baustein, FmtData } from './types.js';

export interface AdaptGroupInput {
  id: string;
  label: string;
  count?: number;
  personaId?: string;
  selectedValues?: Record<string, string>;
  text?: string;
}

export interface AdaptPhaseInput {
  key?: string;
  phaseLabel: string;
  durationMin?: number;
  baustein?: string;
  lernfunktion?: string;
  beschreibung?: string;
}

export interface AdaptScenarioInput {
  scenarioText?: string;
  /** Optional single FMT method kennung for direct 1-method differentiation in chat/MCP/API */
  baustein?: string;
  arrangement?: Arrangement;
  phasen?: AdaptPhaseInput[];
  lerngruppenText?: string;
  gruppen?: AdaptGroupInput[];
  fach?: string;
  thema?: string;
  bildungsstufe?: string;
  zeitMin?: number;
  maxTechnik?: string;
  ohneInternet?: boolean;
  ohneKI?: boolean;
  maxAufwand?: MeasureEffort;
  ebenen?: MeasureLevel[];
  includeSystemMeasures?: boolean;
}

export interface QuickLearnerGroupProfile {
  id: string;
  label: string;
  chipLabel: string;
  snippet: string;
  profile: string;
  focus: 'basis' | 'regel' | 'vertiefung' | 'sprachsensibel' | 'custom';
  defaultCount: number;
  personaId?: string;
  selectedValues: Record<string, string>;
}

/**
 * Single Source of Truth for quick learner-group presets across Core, Web UI (/differenzierung & Baukasten Step 3),
 * REST API (/api/v1/differentiation/meta), and MCP (list_differentiation_options).
 * Every variable ID and value ID is strictly validated against DIFF_MATRIX_VARIABLES.
 */
export const QUICK_LEARNER_GROUP_PROFILES: QuickLearnerGroupProfile[] = [
  {
    id: 'daz',
    label: 'DaZ & Sprachsensibel',
    chipLabel: 'DaZ / Sprachförderung',
    snippet: 'DaZ-Kinder',
    profile: 'Sprachsensible Unterstützung mit Bildhilfen, Wortbank, Satzstartern und klarer Visualisierung',
    focus: 'sprachsensibel',
    defaultCount: 5,
    selectedValues: {
      sprachkompetenz: 'sprachkompetenz-gering',
      'foerderbedarf-sprache': 'foerderbedarf-sprache-erheblich',
      ausdrucksfaehigkeit: 'ausdrucksfaehigkeit-eingeschraenkt',
      sensorische: 'sensorische-visuell'
    }
  },
  {
    id: 'adhs',
    label: 'ADHS & Fokusstrukturierung',
    chipLabel: 'ADHS / Fokusstruktur',
    snippet: 'ADHS',
    profile: 'Kurze Arbeitsetappen, klare Schrittfolge, reizarme Struktur und aktive Bewegungsimpulse',
    focus: 'basis',
    defaultCount: 3,
    selectedValues: {
      strukturierung: 'strukturierung-stark',
      'foerderbedarf-emotional-sozial': 'foerderbedarf-emotional-sozial-gelegentlich',
      engagement: 'engagement-gering',
      methoden: 'methoden-direkt'
    }
  },
  {
    id: 'lrs',
    label: 'LRS & Lese-/Schreibunterstützung',
    chipLabel: 'LRS / Lesen & Schreiben',
    snippet: 'LRS',
    profile: 'Entlastung bei Textmenge und Rechtschreibung, klares Layout und multimodale/mündliche Zugänge',
    focus: 'basis',
    defaultCount: 3,
    selectedValues: {
      ausdrucksfaehigkeit: 'ausdrucksfaehigkeit-eingeschraenkt',
      'foerderbedarf-sprache': 'foerderbedarf-sprache-gelegentlich',
      sensorische: 'sensorische-multimodal',
      strukturierung: 'strukturierung-stark'
    }
  },
  {
    id: 'foerder-lernen',
    label: 'Förderbedarf Lernen & Kleinschrittigkeit',
    chipLabel: 'Förderbedarf Lernen',
    snippet: 'Förderbedarf Lernen',
    profile: 'Kleinschrittige Aufgaben, anschauliche Modelle, Lösungsbeispiele und enge Begleitung',
    focus: 'basis',
    defaultCount: 4,
    personaId: 'foerderLernen',
    selectedValues: {
      'foerderbedarf-lernen': 'foerderbedarf-lernen-umfassend',
      vorwissen: 'vorwissen-gering',
      leistungsniveau: 'leistungsniveau-gering',
      denkverarbeitung: 'denkverarbeitung-langsam',
      strukturierung: 'strukturierung-stark'
    }
  },
  {
    id: 'vorwissen-gering',
    label: 'Geringes Vorwissen (Basis)',
    chipLabel: 'Geringes Vorwissen',
    snippet: 'geringes Vorwissen',
    profile: 'Aktivierung von Grundlagen, schrittweise Hinführung und anschauliche Beispiele',
    focus: 'basis',
    defaultCount: 6,
    selectedValues: {
      vorwissen: 'vorwissen-gering',
      leistungsniveau: 'leistungsniveau-gering',
      strukturierung: 'strukturierung-stark',
      lernstrategien: 'lernstrategien-kaum'
    }
  },
  {
    id: 'vertiefung',
    label: 'Leistungsstark & Vertiefung',
    chipLabel: 'Leistungsstark / Vertiefung',
    snippet: 'leistungsstarke Lernende',
    profile: 'Transferaufgaben, offene Problemstellungen, Vertiefung oder Tutorenrolle',
    focus: 'vertiefung',
    defaultCount: 5,
    selectedValues: {
      leistungsniveau: 'leistungsniveau-hoch',
      vorwissen: 'vorwissen-hoch',
      denkverarbeitung: 'denkverarbeitung-schnell',
      strukturierung: 'strukturierung-offen',
      metakognitive: 'metakognitive-stark'
    }
  },
  {
    id: 'schuechtern',
    label: 'Schüchtern & geringe Beteiligung',
    chipLabel: 'Schüchtern / geringe Beteiligung',
    snippet: 'schüchterne Lernende',
    profile: 'Geschützte Austauschformate (Einzel-/Partnerarbeit vor Plenum), angstfreie Rückmeldungen',
    focus: 'basis',
    defaultCount: 4,
    selectedValues: {
      'soziale-kompetenzen': 'soziale-kompetenzen-eingeschraenkt',
      werte: 'werte-vermeidung',
      selbstwirksamkeit: 'selbstwirksamkeit-gering',
      arbeitsformen: 'arbeitsformen-partner'
    }
  },
  {
    id: 'barriere',
    label: 'Sehen / Hören / Motorik',
    chipLabel: 'Sehen / Hören / Motorik',
    snippet: 'Seh-, Hör- oder motorische Einschränkung',
    profile: 'Barrierearme Darstellung, multimodale Zugänge, Kontrast/Audio und angepasste Bearbeitungszeit',
    focus: 'basis',
    defaultCount: 2,
    selectedValues: {
      'foerderbedarf-sehen': 'foerderbedarf-sehen-leicht',
      'foerderbedarf-hoeren': 'foerderbedarf-hoeren-beeintraechtigung',
      'foerderbedarf-koerperlich': 'foerderbedarf-koerperlich-leicht',
      sensorische: 'sensorische-multimodal'
    }
  }
];

export interface UdlMeasure {
  id: string;
  name: string;
  kategorieName: string;
  oberKategorieName: string;
  minNormalizedScore: number;
  avgNormalizedScore: number;
  meta: MatrixRecommendation['meta'];
}

export interface GroupConflict {
  measureId: string;
  measureName: string;
  kategorieName: string;
  oberKategorieName: string;
  staerkendFuer: Array<{ groupId: string; label: string; normalizedScore: number }>;
  hemmendFuer: Array<{ groupId: string; label: string; normalizedScore: number }>;
  aufloesungsstrategie: string;
  meta: MatrixRecommendation['meta'];
}

export interface AdaptedSubgroupResult {
  id: string;
  label: string;
  count?: number;
  personaId?: string;
  selectedCount: number;
  erkannteSignale: string[];
  didacticProfile: MatrixScoreResult['didacticProfile'];
  spezifischeMassnahmen: MatrixRecommendation[];
  vermeiden: MatrixRecommendation[];
}

export interface PhaseMethodContext {
  interaktion: string[];
  anleitung: string[];
  kernkomponente: string[];
  durchfuehrungKurz: string[];
  qualitaetsrisiko: string[];
  evidenzKurz: string | null;
  methodenAnpassungshinweis: string;
}

export interface PhaseAdaptationResult {
  key: string;
  orderLabel: string;
  phaseLabel: string;
  durationMin: number | null;
  lernfunktion: string;
  baustein: string | null;
  bausteinName: string | null;
  methodenKontext?: PhaseMethodContext;
  udlImpulse: Array<{ id: string; name: string; umsetzungsimpuls: string; aufwand: MeasureEffort }>;
  teilgruppenImpulse: Array<{
    groupId: string;
    groupLabel: string;
    massnahmen: Array<{ id: string; name: string; normalizedScore: number; umsetzungsimpuls: string }>;
    alternativeMethoden: Array<{ kennung: string; name: string; reichweite: string; dauerMin: number; dauerMax: number; grund: string }>;
  }>;
  passendeFmtMethoden: Array<{
    kennung: string;
    name: string;
    evidenzgrad: string | null;
    dauerMin: number;
    dauerMax: number;
    grund: string;
  }>;
}

export interface MultiGroupSynthesisResult {
  udlBasis: UdlMeasure[];
  konflikte: GroupConflict[];
  teilgruppen: AdaptedSubgroupResult[];
  /** Internal scored results keyed by group id for phase-level reuse */
  scoredByGroupId: Record<string, MatrixScoreResult>;
}

export interface AdaptScenarioResult {
  dauerMs: number;
  kontext: {
    fach: string | null;
    thema: string | null;
    bildungsstufe: string | null;
    zeitMin: number | null;
    maxTechnik: string | null;
    ohneInternet: boolean;
    ohneKI: boolean;
    aktiveEbenen: MeasureLevel[];
    gruppenQuelle: 'explizit' | 'erkannt' | 'erkannt+regelniveau' | 'standard-heterogenitaet';
    anzahlTeilgruppen: number;
  };
  udlBasis: UdlMeasure[];
  konflikte: GroupConflict[];
  teilgruppen: AdaptedSubgroupResult[];
  phasenAnpassungen: PhaseAdaptationResult[];
  epistemischerHinweis: string;
}

export const EPISTEMIC_MATRIX_NOTE =
  'Hinweis zur Einordnung: Die Werte der Binnendifferenzierungsmatrix (-100 bis +100 %) beruhen auf einem heuristischen Expertenmodell (keine empirischen Effektstärken). Empfohlene FMT-Methoden tragen eigene empirische Evidenzgrade (A–C) mit Geltungsbereich.';

interface SubgroupPattern {
  id: string;
  label: string;
  re: RegExp;
  countRe: RegExp;
  selectedValues: Record<string, string>;
  signalLabel: string;
}

/**
 * Extracts distinct learner subgroups from German free text strictly via their own detected traits
 * (intentionally does NOT inherit unrelated clinical/cognitive traits from bundled full personas).
 */
const SUBGROUP_PATTERNS: SubgroupPattern[] = [
  {
    id: 'daz',
    label: 'DaZ & Sprachsensibel',
    re: /\b(?:daz|deutsch als zweitsprache|sprachsensib\w*|sprachf[oö]rder\w*|wenig\s+deutsch|mehrsprachig\w*|nicht-?muttersprach\w*)/i,
    countRe: /(\d{1,2})\s*(?:kinder|sch[uü]ler\w*|lernende\w*|sus)?\s*(?:mit\s+)?(?:daz|deutsch als zweitsprache|sprachf[oö]rder\w*)/i,
    selectedValues: {
      sprachkompetenz: 'sprachkompetenz-gering',
      'foerderbedarf-sprache': 'foerderbedarf-sprache-erheblich',
      ausdrucksfaehigkeit: 'ausdrucksfaehigkeit-eingeschraenkt',
      sensorische: 'sensorische-visuell'
    },
    signalLabel: 'DaZ / Sprachförderbedarf'
  },
  {
    id: 'lrs',
    label: 'LRS & Lese-/Schreibunterstützung',
    re: /\b(?:lrs|legasthen\w*|lese-?rechtschreib\w*|leseschw[aä]ch\w*)/i,
    countRe: /(\d{1,2})\s*(?:kinder|sch[uü]ler\w*|lernende\w*|sus)?\s*(?:mit\s+)?(?:lrs|legasthen\w*|leseschw[aä]ch\w*)/i,
    selectedValues: {
      ausdrucksfaehigkeit: 'ausdrucksfaehigkeit-eingeschraenkt',
      'foerderbedarf-sprache': 'foerderbedarf-sprache-gelegentlich',
      sensorische: 'sensorische-multimodal',
      strukturierung: 'strukturierung-stark'
    },
    signalLabel: 'LRS / Leseschwäche'
  },
  {
    id: 'adhs',
    label: 'ADHS & Fokusstrukturierung',
    re: /\b(?:adhs|ads\b|konzentrations\w*|stark\s+ablenkbar\w*|kurze\s+aufmerksamkeit)/i,
    countRe: /(\d{1,2})\s*(?:kinder|sch[uü]ler\w*|lernende\w*|sus)?\s*(?:mit\s+)?(?:adhs|ads\b|konzentrations\w*)/i,
    selectedValues: {
      strukturierung: 'strukturierung-stark',
      'foerderbedarf-emotional-sozial': 'foerderbedarf-emotional-sozial-gelegentlich',
      engagement: 'engagement-gering',
      methoden: 'methoden-direkt'
    },
    signalLabel: 'ADHS / Konzentrations- & Strukturbedarf'
  },
  {
    id: 'autismus',
    label: 'Autismus-Spektrum & Klarheit',
    re: /\b(?:autismus|autist\w*|ass\b|asperger)/i,
    countRe: /(\d{1,2})\s*(?:kinder|sch[uü]ler\w*|lernende\w*|sus)?\s*(?:mit\s+)?(?:autismus|ass\b|asperger)/i,
    selectedValues: {
      'foerderbedarf-autismus': 'foerderbedarf-autismus-deutlich',
      strukturierung: 'strukturierung-stark',
      arbeitsformen: 'arbeitsformen-einzel'
    },
    signalLabel: 'Autismus-Spektrum'
  },
  {
    id: 'foerder-lernen',
    label: 'Förderbedarf Lernen & Kleinschrittigkeit',
    re: /\b(?:f[oö]rderbedarf\s+lernen|lernschwach\w*|lernschwierig\w*|langsames?\s+(?:lern)?tempo|sonderp[aä]dagog\w*)/i,
    countRe: /(\d{1,2})\s*(?:kinder|sch[uü]ler\w*|lernende\w*|sus)?\s*(?:mit\s+)?(?:f[oö]rderbedarf\s+lernen|lernschwierig\w*)/i,
    selectedValues: {
      'foerderbedarf-lernen': 'foerderbedarf-lernen-umfassend',
      vorwissen: 'vorwissen-gering',
      leistungsniveau: 'leistungsniveau-gering',
      denkverarbeitung: 'denkverarbeitung-langsam',
      strukturierung: 'strukturierung-stark'
    },
    signalLabel: 'Förderbedarf Lernen'
  },
  {
    id: 'vorwissen-gering',
    label: 'Geringes Vorwissen (Basis)',
    re: /\b(?:(?:sehr\s+)?(?:gering\w*|wenig|kaum|fehlend\w*)\s+(?:vorwissen|vorkenntnis\w*|vorerfahrung\w*)|einsteiger\w*|grundlagenbedarf|basisunterst[uü]tz\w*)/i,
    countRe: /(\d{1,2})\s*(?:kinder|sch[uü]ler\w*|lernende\w*|studierende\w*|teilnehmende\w*|sus)?\s*(?:mit\s+)?(?:sehr\s+)?(?:gering\w*|wenig)\s+(?:vorwissen|vorkenntnis\w*)/i,
    selectedValues: {
      vorwissen: 'vorwissen-gering',
      leistungsniveau: 'leistungsniveau-gering',
      strukturierung: 'strukturierung-stark',
      lernstrategien: 'lernstrategien-kaum'
    },
    signalLabel: 'Geringes Vorwissen'
  },
  {
    id: 'schuechtern',
    label: 'Schüchtern & Prüfungsangst',
    re: /\b(?:sch[uü]chtern\w*|zur[uü]ckhaltend\w*|pr[uü]fungsangst|versagensangst|redeangst|geringe\s+beteiligung|trauen\s+sich\s+nicht)/i,
    countRe: /(\d{1,2})\s*(?:kinder|sch[uü]ler\w*|lernende\w*|sus)?\s*(?:sehr\s+)?(?:sch[uü]chtern\w*|zur[uü]ckhaltend\w*)/i,
    selectedValues: {
      'soziale-kompetenzen': 'soziale-kompetenzen-eingeschraenkt',
      werte: 'werte-vermeidung',
      selbstwirksamkeit: 'selbstwirksamkeit-gering',
      arbeitsformen: 'arbeitsformen-partner'
    },
    signalLabel: 'Schüchtern / geringe Beteiligung'
  },
  {
    id: 'motivation-gering',
    label: 'Geringe Motivation & Aktivierung',
    re: /\b(?:geringe\s+motivation|unmotiviert\w*|demotiviert\w*|desinteresse|wenig\s+engagement|lustlos\w*)/i,
    countRe: /(\d{1,2})\s*(?:kinder|sch[uü]ler\w*|lernende\w*|sus)?\s*(?:sehr\s+)?(?:unmotiviert\w*|demotiviert\w*)/i,
    selectedValues: {
      engagement: 'engagement-gering',
      interessen: 'interessen-desinteresse',
      relevanz: 'relevanz-gering',
      methoden: 'methoden-spielerisch'
    },
    signalLabel: 'Geringe Motivation'
  },
  {
    id: 'motorik',
    label: 'Körperlich-motorische Unterstützung',
    re: /\b(?:motorisch\w*|feinmotorik|k[oö]rperlich\w*\s+(?:beeintr[aä]cht\w*|einschr[aä]nk\w*|f[oö]rderbedarf)|rollstuhl|schreibmotorik)/i,
    countRe: /(\d{1,2})\s*(?:kinder|sch[uü]ler\w*|lernende\w*|sus)?\s*(?:mit\s+)?(?:motorisch\w*|k[oö]rperlich\w*)/i,
    selectedValues: {
      'foerderbedarf-koerperlich': 'foerderbedarf-koerperlich-deutlich',
      'zeitliche-verfuegbarkeit': 'zeitliche-verfuegbarkeit-eingeschraenkt',
      sensorische: 'sensorische-multimodal'
    },
    signalLabel: 'Motorische / körperliche Unterstützung'
  },
  {
    id: 'hoeren',
    label: 'Hörbeeinträchtigung (visuelle Sicherung)',
    re: /\b(?:h[oö]rbeeintr[aä]cht\w*|schwerh[oö]rig\w*|geh[oö]rlos\w*|h[oö]rsch[aä]dig\w*)/i,
    countRe: /(\d{1,2})\s*(?:kinder|sch[uü]ler\w*|lernende\w*|sus)?\s*(?:mit\s+)?(?:h[oö]rbeeintr[aä]cht\w*|schwerh[oö]rig\w*)/i,
    selectedValues: {
      'foerderbedarf-hoeren': 'foerderbedarf-hoeren-beeintraechtigung',
      sensorische: 'sensorische-visuell'
    },
    signalLabel: 'Hörbeeinträchtigung'
  },
  {
    id: 'sehen',
    label: 'Sehbeeinträchtigung (Kontrast & Audio)',
    re: /\b(?:sehbeeintr[aä]cht\w*|sehbehindert\w*|blind\w*|sehschw[aä]ch\w*)/i,
    countRe: /(\d{1,2})\s*(?:kinder|sch[uü]ler\w*|lernende\w*|sus)?\s*(?:mit\s+)?(?:sehbeeintr[aä]cht\w*|sehbehindert\w*)/i,
    selectedValues: {
      'foerderbedarf-sehen': 'foerderbedarf-sehen-deutlich',
      sensorische: 'sensorische-auditiv'
    },
    signalLabel: 'Sehbeeinträchtigung'
  },
  {
    id: 'vertiefung',
    label: 'Leistungsstark & Vertiefung',
    re: /\b(?:hochbegabt\w*|leistungsstark\w*|sehr\s+schnell\w*|unterfordert\w*|begabungsf[oö]rder\w*|fortgeschritten\w*)/i,
    countRe: /(\d{1,2})\s*(?:kinder|sch[uü]ler\w*|lernende\w*|sus)?\s*(?:sehr\s+)?(?:hochbegabt\w*|leistungsstark\w*|schnell\w*)/i,
    selectedValues: {
      leistungsniveau: 'leistungsniveau-hoch',
      vorwissen: 'vorwissen-hoch',
      denkverarbeitung: 'denkverarbeitung-schnell',
      strukturierung: 'strukturierung-offen',
      metakognitive: 'metakognitive-stark'
    },
    signalLabel: 'Leistungsstark / Vertiefungsbedarf'
  }
];

export function detectLearnerGroupsFromText(text: string): {
  groups: AdaptGroupInput[];
  signalsByGroupId: Record<string, string[]>;
} {
  const raw = (text || '').trim();
  const groups: AdaptGroupInput[] = [];
  const signalsByGroupId: Record<string, string[]> = {};
  if (!raw) return { groups, signalsByGroupId };

  for (const pat of SUBGROUP_PATTERNS) {
    if (pat.re.test(raw)) {
      const cm = pat.countRe.exec(raw);
      const count = cm ? Number(cm[1]) : undefined;
      groups.push({
        id: pat.id,
        label: pat.label,
        ...(count && count > 0 ? { count } : {}),
        selectedValues: { ...pat.selectedValues }
      });
      signalsByGroupId[pat.id] = [pat.signalLabel];
    }
  }

  return { groups, signalsByGroupId };
}

function conflictResolutionFor(oberKategorieId: string, kategorieId: string): string {
  if (oberKategorieId === 'aufgaben' || kategorieId === 'offenheit' || kategorieId === 'komplexitaet') {
    return 'Parallele Lernwege / gestufte Aufgabenkarten (★ Basis mit Schrittfolge vs. ★★★ offene Transfer-Aufgabe) am selben Kernthema anbieten.';
  }
  if (oberKategorieId === 'lernzeit') {
    return 'Verbindlichen Kernumfang für alle definieren und direkt anschließende Sternchen-/Transfer-Stationen für schnelle Lernende ohne Leerlauf bereithalten.';
  }
  if (oberKategorieId === 'methoden' || kategorieId === 'struktur-lehrersteuerung') {
    return 'Kurzer, klar modellierter Einstieg für alle (5 min), danach Zweiteilung: begleitete Arbeitsphase mit Hilfekarten vs. selbstständige Vertiefung.';
  }
  if (oberKategorieId === 'lernmaterialien') {
    return 'Zweistufiges Material am selben Inhalt: sprachlich entlastete Fassung mit Wortbank/Beispiel für Basisbedarf, ungestütztes Originalmaterial für Vertiefung.';
  }
  if (oberKategorieId === 'sozialformen') {
    return 'Kurze geschützte Einzeldenkzeit (2–3 min) vorschalten, danach wählbare Kooperation (Tandem) oder ruhige Einzelbearbeitung ermöglichen.';
  }
  if (oberKategorieId === 'lernziele' || oberKategorieId === 'inhalte') {
    return 'Gemeinsames verbindliches Fundamentum (Kernziel) für die gesamte Klasse sichern und ein optionales Additum (Vertiefungsziel) klar kennzeichnen.';
  }
  return 'Zweigleisig arbeiten: Basisgruppe mit gezieltem Gerüst/Check-in entlasten, während Fortgeschrittene eigenständige Erweiterungsimpulse erhalten.';
}

/**
 * Computes Universal Design for Learning (UDL) intersection, cross-group conflicts with resolution strategies,
 * and per-subgroup specific recommendations across any set of 1..N learner groups.
 */
export function computeMultiGroupSynthesis(
  groups: AdaptGroupInput[],
  constraints: {
    ebenen?: MeasureLevel[];
    includeSystemMeasures?: boolean;
    maxTechnik?: string;
    ohneInternet?: boolean;
    ohneKI?: boolean;
    maxAufwand?: MeasureEffort;
  } = {},
  signalsByGroupId: Record<string, string[]> = {}
): MultiGroupSynthesisResult {
  const fullScoreMaps = new Map<string, Map<string, MatrixRecommendation>>();
  const scoredByGroupId: Record<string, MatrixScoreResult> = {};

  for (const g of groups) {
    const textDetected = g.text ? detectMatrixTraitsFromText(g.text) : null;
    const mergedSelected = {
      ...(textDetected?.selectedValues || {}),
      ...(g.selectedValues || {})
    };
    // Full scan (all categories, high limit, minScore=-999) so UDL & conflict math sees every allowed measure
    const fullScan = scoreDifferentiationMatrix({
      personaId: g.personaId,
      selectedValues: Object.keys(mergedSelected).length ? mergedSelected : undefined,
      minScore: -999,
      limit: 50,
      onlyBestPerCategory: false,
      ebenen: constraints.ebenen,
      includeSystemMeasures: constraints.includeSystemMeasures,
      maxTechnik: constraints.maxTechnik,
      ohneInternet: constraints.ohneInternet,
      ohneKI: constraints.ohneKI,
      maxAufwand: constraints.maxAufwand
    });
    // Standard ranked result for per-group recommendations & didacticProfile
    const ranked = scoreDifferentiationMatrix({
      personaId: g.personaId,
      selectedValues: Object.keys(mergedSelected).length ? mergedSelected : undefined,
      limit: 12,
      ebenen: constraints.ebenen,
      includeSystemMeasures: constraints.includeSystemMeasures,
      maxTechnik: constraints.maxTechnik,
      ohneInternet: constraints.ohneInternet,
      ohneKI: constraints.ohneKI,
      maxAufwand: constraints.maxAufwand
    });
    scoredByGroupId[g.id] = ranked;
    const byId = new Map<string, MatrixRecommendation>();
    for (const ok of fullScan.byOberKategorie) {
      for (const m of ok.measures) byId.set(m.id, m);
    }
    for (const m of ranked.topRecommendations) byId.set(m.id, m);
    for (const m of ranked.avoidMeasures) byId.set(m.id, m);
    fullScoreMaps.set(g.id, byId);
  }

  // Collect union of all allowed measure IDs observed across groups
  const allMeasureMeta = new Map<string, MatrixRecommendation>();
  for (const map of fullScoreMaps.values()) {
    for (const [id, rec] of map.entries()) {
      if (!allMeasureMeta.has(id)) allMeasureMeta.set(id, rec);
    }
  }

  const udlBasis: UdlMeasure[] = [];
  const konflikte: GroupConflict[] = [];

  for (const [id, sample] of allMeasureMeta.entries()) {
    const groupScores = groups.map((g) => ({
      groupId: g.id,
      label: g.label,
      normalizedScore: fullScoreMaps.get(g.id)?.get(id)?.normalizedScore ?? 0
    }));
    const minScore = Math.min(...groupScores.map((x) => x.normalizedScore));
    const maxScore = Math.max(...groupScores.map((x) => x.normalizedScore));
    const avgScore = Math.round(groupScores.reduce((s, x) => s + x.normalizedScore, 0) / Math.max(1, groupScores.length));

    if (minScore >= 20 && !groupScores.some((x) => x.normalizedScore <= -15)) {
      udlBasis.push({
        id,
        name: sample.name,
        kategorieName: sample.kategorieName,
        oberKategorieName: sample.oberKategorieName,
        minNormalizedScore: minScore,
        avgNormalizedScore: avgScore,
        meta: sample.meta
      });
    } else if (groups.length >= 2 && maxScore >= 30 && minScore <= -20) {
      konflikte.push({
        measureId: id,
        measureName: sample.name,
        kategorieName: sample.kategorieName,
        oberKategorieName: sample.oberKategorieName,
        staerkendFuer: groupScores.filter((x) => x.normalizedScore >= 25),
        hemmendFuer: groupScores.filter((x) => x.normalizedScore <= -15),
        aufloesungsstrategie: conflictResolutionFor(sample.oberKategorieId, sample.kategorieId),
        meta: sample.meta
      });
    }
  }

  udlBasis.sort(
    (a, b) =>
      b.minNormalizedScore - a.minNormalizedScore ||
      MEASURE_LEVEL_ORDER[a.meta.ebene] - MEASURE_LEVEL_ORDER[b.meta.ebene] ||
      MEASURE_EFFORT_ORDER[a.meta.aufwand] - MEASURE_EFFORT_ORDER[b.meta.aufwand] ||
      b.avgNormalizedScore - a.avgNormalizedScore ||
      a.name.localeCompare(b.name, 'de')
  );

  // Deduplicate conflicts by category so we show the sharpest distinct classroom trade-offs
  konflikte.sort((a, b) => {
    const spreadA =
      Math.max(...a.staerkendFuer.map((x) => x.normalizedScore)) - Math.min(...a.hemmendFuer.map((x) => x.normalizedScore));
    const spreadB =
      Math.max(...b.staerkendFuer.map((x) => x.normalizedScore)) - Math.min(...b.hemmendFuer.map((x) => x.normalizedScore));
    return spreadB - spreadA || a.measureName.localeCompare(b.measureName, 'de');
  });
  const topUdl = udlBasis.slice(0, 8);
  const topUdlIds = new Set(topUdl.map((u) => u.id));
  const seenConflictKat = new Set<string>();
  const topKonflikte: GroupConflict[] = [];
  for (const k of konflikte) {
    if (seenConflictKat.has(k.kategorieName)) continue;
    seenConflictKat.add(k.kategorieName);
    topKonflikte.push(k);
    if (topKonflikte.length >= 6) break;
  }

  const teilgruppen: AdaptedSubgroupResult[] = groups.map((g) => {
    const ranked = scoredByGroupId[g.id];
    const nonUdl = ranked.topRecommendations.filter((r) => !topUdlIds.has(r.id));
    const specific = (nonUdl.length >= 3 ? nonUdl : ranked.topRecommendations).slice(0, 5);
    return {
      id: g.id,
      label: g.label,
      ...(g.count ? { count: g.count } : {}),
      ...(g.personaId ? { personaId: g.personaId } : {}),
      selectedCount: ranked.selectedCount,
      erkannteSignale: signalsByGroupId[g.id] || [],
      didacticProfile: ranked.didacticProfile,
      spezifischeMassnahmen: specific,
      vermeiden: ranked.avoidMeasures.slice(0, 4)
    };
  });

  return { udlBasis: topUdl, konflikte: topKonflikte, teilgruppen, scoredByGroupId };
}

function extractPhasesFromArrangement(data: Pick<FmtData, 'bausteine' | 'ketten'>, arrangement: Arrangement): AdaptPhaseInput[] {
  const blocksById = new Map(data.bausteine.map((b) => [b.kennung, b]));
  const chain = arrangement.zieltyp ? data.ketten.find((k) => k.id === arrangement.zieltyp) : undefined;
  const stepLabelById = new Map((chain?.schritte || []).map((s) => [s.id, s.label]));
  const stepFnById = new Map((chain?.schritte || []).map((s) => [s.id, s.funktion[0] || 'verstehen']));
  const out: AdaptPhaseInput[] = [];

  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    if (n.typ === 'Sequenz' && Array.isArray(n.teile)) {
      n.teile.forEach(visit);
      return;
    }
    if (n.typ === 'Einsatz' && typeof n.baustein === 'string') {
      const b = blocksById.get(n.baustein);
      const stepId = typeof n.kettenschritt === 'string' ? n.kettenschritt : undefined;
      out.push({
        key: `step-${out.length}`,
        phaseLabel: (stepId && stepLabelById.get(stepId)) || (typeof n.titel === 'string' && n.titel) || `Phase ${out.length + 1}`,
        durationMin: typeof n.dauerMin === 'number' ? n.dauerMin : (b?.dauerMin ?? 15),
        baustein: n.baustein,
        lernfunktion: (stepId && stepFnById.get(stepId)) || b?.lernfunktion?.[0] || 'verstehen'
      });
      return;
    }
    if (n.typ === 'Wiederkehr' && typeof n.baustein === 'string') {
      const b = blocksById.get(n.baustein);
      const single = typeof n.dauerMin === 'number' ? n.dauerMin : (b?.dauerMin ?? 10);
      const count = typeof n.anzahl === 'number' && n.anzahl > 0 ? n.anzahl : 1;
      out.push({
        key: `step-${out.length}`,
        phaseLabel: `Wiederkehr (${count}× à ${single} min)`,
        durationMin: single * count,
        baustein: n.baustein,
        lernfunktion: 'konsolidierung'
      });
      return;
    }
    if (n.typ === 'Schleife' && Array.isArray(n.teile)) n.teile.forEach(visit);
    else if (n.typ === 'Parallel' && n.haupt) visit(n.haupt);
    else if (n.typ === 'Wahl' && Array.isArray(n.optionen) && n.optionen.length) visit(n.optionen[0]);
  };

  visit(arrangement.ablauf);
  return out;
}

const TECH_RANK_MAP: Record<string, number> = { 't-keine': 0, 't-projektion': 1, 't-einzeln': 2, 't-spezial': 3 };
const AI_ROLES_CHECK = new Set(['tutor', 'dialogpartner', 'simulationsrolle', 'belehrbarer-agent', 'antwortgeber']);

function recommendMethodsForPhase(
  allBlocks: Baustein[],
  lernfunktion: string,
  udlMeasures: MatrixRecommendation[],
  constraints: { maxTechnik?: string; ohneInternet?: boolean; ohneKI?: boolean; bildungsstufe?: string; maxDur?: number },
  limit = 3
): PhaseAdaptationResult['passendeFmtMethoden'] {
  const maxTechRank = constraints.maxTechnik ? (TECH_RANK_MAP[constraints.maxTechnik] ?? 3) : 3;
  const gradeRank = (b: Baustein) => {
    const grades = (b.evidenz || []).map((e) => e.grad);
    return grades.includes('A') ? 0 : grades.includes('B') ? 1 : grades.includes('C') ? 2 : 3;
  };
  const bestGrade = (b: Baustein): string | null => {
    const grades = (b.evidenz || []).map((e) => e.grad);
    return grades.includes('A') ? 'A' : grades.includes('B') ? 'B' : grades.includes('C') ? 'C' : null;
  };

  const candidates = allBlocks
    .filter((b) => {
      if (!b.lernfunktion.includes(lernfunktion)) return false;
      if ((TECH_RANK_MAP[b.technik] ?? 0) > maxTechRank) return false;
      if (constraints.ohneInternet && b.internet) return false;
      if (constraints.ohneKI && (Boolean(b.ki) || (b.rolle || []).some((r) => AI_ROLES_CHECK.has(r)))) return false;
      if (constraints.bildungsstufe && (b.ungeeignetBeiStufe || []).includes(constraints.bildungsstufe)) return false;
      if (constraints.maxDur && b.dauerMin > constraints.maxDur) return false;
      // Exclude negative-evidence contrast methods
      if (
        (b.evidenz || []).some((e) =>
          /bleibt\s+empirisch\s+deutlich\s+hinter|schneide(?:t|n)\b[^.]{0,60}\bschwächer\s+ab/i.test(e.befund || '')
        )
      ) {
        return false;
      }
      return true;
    })
    .map((b) => {
      const bridge = scoreMethodAgainstFmtBridges(b, udlMeasures);
      const udlBonus = (b.adaptivitaet || []).includes('udl') || (b.adaptivitaet || []).includes('diff-prozess') ? 1 : 0;
      return { b, bridge, udlBonus, gRank: gradeRank(b) };
    })
    .sort(
      (a, b) =>
        b.bridge.hits + b.udlBonus - (a.bridge.hits + a.udlBonus) ||
        a.gRank - b.gRank ||
        (a.b.status === 'kuratiert' ? 0 : 1) - (b.b.status === 'kuratiert' ? 0 : 1) ||
        a.b.name.localeCompare(b.b.name, 'de')
    );

  return candidates.slice(0, limit).map(({ b, bridge }) => ({
    kennung: b.kennung,
    name: b.name,
    evidenzgrad: bestGrade(b),
    dauerMin: b.dauerMin,
    dauerMax: b.dauerMax,
    grund: bridge.matchedLabels.length
      ? `Passt zu ${lernfunktion} & Differenzierungs-Facetten (${bridge.matchedLabels.slice(0, 2).join(', ')})`
      : `Bewährte FMT-Methode für ${lernfunktion}`
  }));
}

function buildPhaseMethodContext(
  block: Baustein,
  teilgruppen: AdaptedSubgroupResult[]
): PhaseMethodContext {
  const kernList = (block.kernkomponente || []).map((k) => k.name).filter(Boolean);
  const firstEv = (block.evidenz || [])[0];
  const needsLang = teilgruppen.some((t) => t.didacticProfile.needsLanguageSupport);
  const needsScaffold = teilgruppen.some((t) => t.didacticProfile.needsScaffolding);
  const hasEnrich = teilgruppen.some((t) => t.didacticProfile.benefitsFromEnrichment);

  const hints: string[] = [];
  if (kernList.length) {
    hints.push(`Kernkomponente „${kernList[0]}“ bei jeder Differenzierung erhalten.`);
  }
  const inter = block.interaktion || [];
  if (inter.includes('kleingruppe-kooperativ') || inter.includes('partner')) {
    hints.push('Vor dem Austausch 2–3 Min. geschützte Einzeldenkzeit einplanen und feste Rollen bzw. Gesprächsstarter bereitstellen.');
  } else if (inter.includes('plenum-lehrergeleitet') || inter.includes('plenum-lernendengeleitet')) {
    hints.push('Aufträge sichtbar visualisieren und All-Student-Response oder kurzen Tandem-Abgleich vorschalten, statt nur schnelle Wortmeldungen abzurufen.');
  } else if (inter.includes('einzel')) {
    hints.push('Klare Schrittfolge mit Musterbeispiel und Selbstkontrollmöglichkeit am Platz auslegen.');
  }
  if (needsLang) hints.push('Sprachsensibel: zentrale Fachbegriffe und 2–3 Satzstarter direkt am Arbeitsauftrag sichtbar machen.');
  if (needsScaffold) hints.push('Strukturhilfe: Teilaufträge zeitlich klar takten und nach 2 Min. kurz bei der Basisgruppe einchecken.');
  if (hasEnrich) hints.push('Vertiefung: Erweiterungs- oder Transferfrage am selben Kerninhalt ohne Leerlauf bereithalten.');

  return {
    interaktion: inter,
    anleitung: block.anleitung || [],
    kernkomponente: kernList,
    durchfuehrungKurz: (block.durchfuehrung || []).slice(0, 4),
    qualitaetsrisiko: (block.qualitaetsrisiko || []).slice(0, 3),
    evidenzKurz: firstEv ? `Grad ${firstEv.grad}: ${firstEv.befund}` : null,
    methodenAnpassungshinweis: hints.join(' ')
  };
}

function conflictsWithMethodInteraction(measureId: string, block?: Baustein): boolean {
  if (!block) return false;
  const inter = block.interaktion || [];
  const isSocial = inter.includes('kleingruppe-kooperativ') || inter.includes('partner') || inter.includes('plenum-lehrergeleitet') || inter.includes('plenum-lernendengeleitet');
  const isPureSolo = inter.includes('einzel') && !isSocial;
  if (isSocial && measureId === 'sozialform-einzel') return true;
  if (isPureSolo && (measureId === 'sozialform-gruppe' || measureId === 'sozialform-plenum')) return true;
  if (inter.includes('plenum-lehrergeleitet') && measureId === 'methodik-lernprozess-fachspezifisch') return true;
  return false;
}

function contextualizeMeasureForBlock(
  m: { id: string; name: string; umsetzungsimpuls: string },
  block?: Baustein
): { id: string; name: string; umsetzungsimpuls: string } {
  if (!block) return m;
  const inter = block.interaktion || [];
  const isSocial = inter.includes('kleingruppe-kooperativ') || inter.includes('partner') || inter.includes('plenum-lehrergeleitet') || inter.includes('plenum-lernendengeleitet');
  if (m.id === 'sozialform-einzel' && isSocial) {
    return {
      ...m,
      name: 'Vorgeschaltete Einzeldenkzeit (2–3 Min.)',
      umsetzungsimpuls: `Vor der gemeinsamen Phase („${block.name}“) 2–3 Minuten ruhige Einzeldenkzeit sichern, damit alle eigene Ideen mitbringen.`
    };
  }
  return m;
}

/**
 * Zero-LLM end-to-end scenario differentiation & adaptation engine (< 5 ms).
 * Works seamlessly for BOTH standalone free-text scenarios (chat / MCP / API / /differenzierung),
 * direct single-method adaptation (`baustein`), AND structured FMT arrangements from the Baukasten.
 */
export function adaptScenario(data: Pick<FmtData, 'bausteine' | 'ketten'>, input: AdaptScenarioInput): AdaptScenarioResult {
  const t0 = Date.now();
  const blocksById = new Map(data.bausteine.map((b) => [b.kennung, b]));
  const combinedText = [input.scenarioText || '', input.lerngruppenText || ''].filter(Boolean).join('\n');

  // Auto-detect tech/offline/KI constraints from free text if not explicitly set
  const maxTechnik =
    input.maxTechnik ||
    (/\bohne\s+(?:ger[aä]te|technik|digitale)|analog\b|nur\s+(?:tafel|papier)/i.test(combinedText) ? 't-keine' : undefined);
  const ohneInternet = input.ohneInternet ?? /\bohne\s+(?:internet|wlan|netz)|kein\s+(?:internet|wlan)|offline\b/i.test(combinedText);
  const ohneKI = input.ohneKI ?? /\bohne\s+ki\b|keine\s+ki\b/i.test(combinedText);

  const aktiveEbenen: MeasureLevel[] = input.ebenen?.length
    ? input.ebenen
    : input.includeSystemMeasures
      ? ['unterricht-sofort', 'material-planung', 'organisation-system']
      : [...DEFAULT_CLASSROOM_LEVELS];

  // Resolve learner groups cleanly without attaching unrelated clinical persona traits to detected subgroups
  let resolvedGroups: AdaptGroupInput[] = [];
  let signalsByGroupId: Record<string, string[]> = {};
  let gruppenQuelle: AdaptScenarioResult['kontext']['gruppenQuelle'] = 'standard-heterogenitaet';

  if (input.gruppen && input.gruppen.length > 0) {
    resolvedGroups = input.gruppen;
    gruppenQuelle = 'explizit';
  } else {
    const detected = detectLearnerGroupsFromText(input.lerngruppenText || input.scenarioText || '');
    signalsByGroupId = detected.signalsByGroupId;
    if (detected.groups.length >= 2) {
      resolvedGroups = detected.groups;
      gruppenQuelle = 'erkannt';
    } else if (detected.groups.length === 1) {
      resolvedGroups = [
        detected.groups[0],
        { id: 'regel', label: 'Regelniveau (übrige Klasse)', personaId: 'average' }
      ];
      gruppenQuelle = 'erkannt+regelniveau';
    } else {
      resolvedGroups = [
        {
          id: 'basis',
          label: 'Basisunterstützung & Strukturbedarf',
          selectedValues: {
            vorwissen: 'vorwissen-gering',
            strukturierung: 'strukturierung-stark',
            sprachkompetenz: 'sprachkompetenz-mittel',
            denkverarbeitung: 'denkverarbeitung-langsam'
          }
        },
        { id: 'regel', label: 'Regelniveau', personaId: 'average' },
        { id: 'vertiefung', label: 'Vertiefung & Leistungsstark', personaId: 'highPerforming' }
      ];
      gruppenQuelle = 'standard-heterogenitaet';
    }
  }

  const constraints = {
    ebenen: aktiveEbenen,
    includeSystemMeasures: input.includeSystemMeasures,
    maxTechnik,
    ohneInternet,
    ohneKI,
    maxAufwand: input.maxAufwand
  };

  const synthesis = computeMultiGroupSynthesis(resolvedGroups, constraints, signalsByGroupId);

  // Build phases from explicit phasen, direct single `baustein`, FMT arrangement, or default 3-phase classroom structure
  const singleBlock = input.baustein ? blocksById.get(input.baustein) : undefined;
  const rawPhases: AdaptPhaseInput[] =
    input.phasen && input.phasen.length > 0
      ? input.phasen
      : singleBlock
        ? [
            {
              key: 'phase-1',
              phaseLabel: singleBlock.name,
              durationMin: input.zeitMin ?? singleBlock.dauerMin,
              baustein: singleBlock.kennung,
              lernfunktion: singleBlock.lernfunktion?.[0] || 'verstehen'
            }
          ]
        : input.arrangement
          ? extractPhasesFromArrangement(data, input.arrangement)
          : [
              {
                key: 'phase-1',
                phaseLabel: 'Einstieg & Aktivierung',
                durationMin: input.zeitMin ? Math.max(5, Math.round(input.zeitMin * 0.2)) : 10,
                lernfunktion: 'orientierung'
              },
              {
                key: 'phase-2',
                phaseLabel: 'Erarbeitung & Verstehen',
                durationMin: input.zeitMin ? Math.max(10, Math.round(input.zeitMin * 0.45)) : 20,
                lernfunktion: 'verstehen'
              },
              {
                key: 'phase-3',
                phaseLabel: 'Übung, Transfer & Sicherung',
                durationMin: input.zeitMin ? Math.max(10, Math.round(input.zeitMin * 0.35)) : 15,
                lernfunktion: 'konsolidierung'
              }
            ];

  const udlAsRecs: MatrixRecommendation[] = synthesis.udlBasis.map((u) => ({
    id: u.id,
    name: u.name,
    kategorieId: '',
    kategorieName: u.kategorieName,
    oberKategorieId: '',
    oberKategorieName: u.oberKategorieName,
    score: u.avgNormalizedScore,
    normalizedScore: u.avgNormalizedScore,
    relevanz: 'kern',
    meta: u.meta
  }));

  const phasenAnpassungen: PhaseAdaptationResult[] = rawPhases.map((p, idx) => {
    const block = p.baustein ? blocksById.get(p.baustein) : undefined;
    const fn = p.lernfunktion || block?.lernfunktion?.[0] || (idx === 0 ? 'orientierung' : idx === rawPhases.length - 1 ? 'konsolidierung' : 'verstehen');
    const fitsPhase = (phasen: string[]) => phasen.length === 0 || phasen.includes(fn);

    // Prefer method-coherent UDL measures (demote conflicting social-form measures below content/scaffolding measures)
    const udlFiltered = synthesis.udlBasis.filter((u) => fitsPhase(u.meta.phasen));
    const udlOrdered = [
      ...udlFiltered.filter((u) => !conflictsWithMethodInteraction(u.id, block)),
      ...udlFiltered.filter((u) => conflictsWithMethodInteraction(u.id, block))
    ];
    const udlImpulse = udlOrdered.slice(0, 3).map((u) => {
      const ctxM = contextualizeMeasureForBlock(
        { id: u.id, name: u.name, umsetzungsimpuls: u.meta.umsetzungsimpuls },
        block
      );
      return {
        id: ctxM.id,
        name: ctxM.name,
        umsetzungsimpuls: ctxM.umsetzungsimpuls,
        aufwand: u.meta.aufwand
      };
    });

    const teilgruppenImpulse = synthesis.teilgruppen.map((tg) => {
      const scored = synthesis.scoredByGroupId[tg.id];
      const phaseMeasures = tg.spezifischeMassnahmen.filter((m) => fitsPhase(m.meta.phasen));
      const pool = phaseMeasures.length ? phaseMeasures : tg.spezifischeMassnahmen;
      const ordered = [
        ...pool.filter((m) => !conflictsWithMethodInteraction(m.id, block)),
        ...pool.filter((m) => conflictsWithMethodInteraction(m.id, block))
      ].slice(0, 3);
      const altMethods = block
        ? suggestAlternativeMethodsForGroup(scored, block, data.bausteine, 3, p.durationMin, {
            maxTechnik,
            ohneInternet,
            ohneKI,
            bildungsstufe: input.bildungsstufe
          })
        : [];
      return {
        groupId: tg.id,
        groupLabel: tg.label,
        massnahmen: ordered.map((m) => {
          const ctxM = contextualizeMeasureForBlock(
            { id: m.id, name: m.name, umsetzungsimpuls: m.meta.umsetzungsimpuls },
            block
          );
          return {
            id: ctxM.id,
            name: ctxM.name,
            normalizedScore: m.normalizedScore,
            umsetzungsimpuls: ctxM.umsetzungsimpuls
          };
        }),
        alternativeMethoden: altMethods
      };
    });

    const passendeFmtMethoden = block
      ? []
      : recommendMethodsForPhase(data.bausteine, fn, udlAsRecs, {
          maxTechnik,
          ohneInternet,
          ohneKI,
          bildungsstufe: input.bildungsstufe,
          maxDur: p.durationMin ? Math.max(p.durationMin, 15) : undefined
        });

    return {
      key: p.key || `phase-${idx + 1}`,
      orderLabel: String(idx + 1),
      phaseLabel: p.phaseLabel,
      durationMin: p.durationMin ?? null,
      lernfunktion: fn,
      baustein: block?.kennung || p.baustein || null,
      bausteinName: block?.name || null,
      ...(block ? { methodenKontext: buildPhaseMethodContext(block, synthesis.teilgruppen) } : {}),
      udlImpulse,
      teilgruppenImpulse,
      passendeFmtMethoden
    };
  });

  return {
    dauerMs: Date.now() - t0,
    kontext: {
      fach: input.fach?.trim() || null,
      thema: input.thema?.trim() || null,
      bildungsstufe: input.bildungsstufe || input.arrangement?.kontext?.bildungsstufe || null,
      zeitMin: input.zeitMin ?? input.arrangement?.kontext?.zeitbudgetMin ?? null,
      maxTechnik: maxTechnik || null,
      ohneInternet,
      ohneKI,
      aktiveEbenen,
      gruppenQuelle,
      anzahlTeilgruppen: resolvedGroups.length
    },
    udlBasis: synthesis.udlBasis,
    konflikte: synthesis.konflikte,
    teilgruppen: synthesis.teilgruppen,
    phasenAnpassungen,
    epistemischerHinweis: EPISTEMIC_MATRIX_NOTE
  };
}

export function getDifferentiationMetaSummary() {
  return {
    ebenen: [
      { id: 'unterricht-sofort', label: 'Sofort im Unterricht (0 min Vorbereitung)' },
      { id: 'material-planung', label: 'Material & Stundenplanung' },
      { id: 'organisation-system', label: 'Schulorganisation & Langfristig (optional)' }
    ],
    aufwand: [
      { id: 'sofort', label: 'Sofort umsetzbar' },
      { id: 'kurz', label: 'Kurze Vorbereitung' },
      { id: 'mittel', label: 'Mittlere Vorbereitung' }
    ],
    schnellProfile: QUICK_LEARNER_GROUP_PROFILES,
    anzahlMassnahmen: DIFF_MATRIX_MEASURES.reduce(
      (sum, ok) => sum + ok.kategorien.reduce((ks, k) => ks + k.auspraegungen.length, 0),
      0
    )
  };
}
