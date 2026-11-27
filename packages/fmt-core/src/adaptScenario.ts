import { nurMethoden } from './eintragsart.js';
import {
  DEFAULT_CLASSROOM_LEVELS,
  DIFF_MATRIX_MEASURES,
  MEASURE_EFFORT_ORDER,
  MEASURE_LEVEL_ORDER,
  ROLLSTUHL_LERNENDE,
  detectMatrixTraitsFromText,
  scoreDifferentiationMatrix,
  scoreMethodAgainstFmtBridges,
  type MatrixRecommendation,
  type MatrixScoreResult,
  type MeasureEffort,
  type MeasureLevel
} from './differentiationMatrix.js';
import type { Arrangement, Baustein, FmtData, Grundlage, MatchRequest, Regelmeldung, WiederkehrNode } from './types.js';
import { KennungIndex } from './kennung.js';
import { TECH_RANK, techLimitRank } from './technik.js';
import {
  conflictsWithMethodInteraction,
  hasAdjustmentProfile,
  hilfenFuer,
  matrixFuer,
  proposeAdditionalPhases,
  proposeMethodAdjustments,
  proposeSupports,
  teilgruppenHinweise,
  teilgruppenAntworten,
  type AdditionalPhaseProposal,
  type Hilfe,
  type MethodAdjustment,
  type MethodAdjustmentGroup,
  type MethodAdjustmentPhase,
  type SupportProposal,
  type TeilgruppenRegelwerk
} from './methodAdjustments.js';
import { bereinigeProfil, type TeilgruppenEntscheidung } from './teilgruppen.js';
import { wiederkehrZeile } from './wiederkehr.js';

export interface AdaptGroupInput {
  id: string;
  label: string;
  count?: number;
  personaId?: string;
  selectedValues?: Record<string, string>;
  text?: string;
  /** The group cannot read or write (statement of the group, not a matrix trait). */
  ohneSchrift?: Array<'lesen' | 'schreiben'>;
  /** The group cannot move freely (statement of the group, not a matrix trait). */
  ohneBewegung?: boolean;
  /**
   * Values of selectedValues the teacher named (core values of a preset or of a group read from the text); only these
   * decide the table rows, the others only order the matrix. Undefined: every value of selectedValues counts.
   */
  genannt?: string[];
}

export interface AdaptPhaseInput {
  key?: string;
  phaseLabel: string;
  durationMin?: number;
  baustein?: string;
  lernfunktion?: string;
  beschreibung?: string;
  /** Container methods with filled slots and repetitions keep their method for every group. */
  locked?: boolean;
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
  /** FMT subject area; methods marked unsuitable for it are never proposed. */
  fachbereich?: string;
  zeitMin?: number;
  maxTechnik?: string;
  ohneInternet?: boolean;
  ohneKI?: boolean;
  maxAufwand?: MeasureEffort;
  ebenen?: MeasureLevel[];
  includeSystemMeasures?: boolean;
  /** Number of teachers in the room; with two, a parallel method may bind a teacher as well. */
  lehrende?: number;
  /**
   * Request of the plan (room, time, group size …, as the matcher read it); a parallel method has to cover its needs
   * in the same frame. Without it no room counts as named.
   */
  anfrage?: MatchRequest;
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
  /**
   * Core values of the preset: what the chip names. Only these decide the table rows of the subgroup decision; the
   * other values (and the persona) only order the matrix measures.
   */
  kern: string[];
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
      ausdrucksfaehigkeit: 'ausdrucksfaehigkeit-eingeschraenkt'
    },
    kern: ['sprachkompetenz-gering', 'ausdrucksfaehigkeit-eingeschraenkt']
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
    },
    kern: ['strukturierung-stark', 'foerderbedarf-emotional-sozial-gelegentlich']
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
      strukturierung: 'strukturierung-stark'
    },
    kern: ['ausdrucksfaehigkeit-eingeschraenkt', 'foerderbedarf-sprache-gelegentlich']
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
    },
    kern: ['foerderbedarf-lernen-umfassend']
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
    },
    kern: ['vorwissen-gering', 'leistungsniveau-gering']
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
    },
    kern: ['vorwissen-hoch', 'leistungsniveau-hoch']
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
    },
    kern: ['soziale-kompetenzen-eingeschraenkt', 'selbstwirksamkeit-gering']
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
      'foerderbedarf-koerperlich': 'foerderbedarf-koerperlich-leicht'
    },
    kern: ['foerderbedarf-sehen-leicht', 'foerderbedarf-hoeren-beeintraechtigung', 'foerderbedarf-koerperlich-leicht']
  }
];

/** A subgroup from a preset: its values, its persona, and only its core values as the named ones. */
export function schnellprofilGruppe(p: QuickLearnerGroupProfile): AdaptGroupInput & { selectedValues: Record<string, string>; genannt: string[] } {
  return {
    id: p.id,
    label: p.label,
    ...(p.personaId ? { personaId: p.personaId } : {}),
    selectedValues: { ...p.selectedValues },
    genannt: [...p.kern]
  };
}

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
    /** Parallel methods; only when the answer is 'tausch', and only equivalent ones that fulfil the direction. */
    alternativeMethoden: Array<{ kennung: string; name: string; reichweite: string; dauerMin: number; dauerMax: number; grund: string }>;
    /** The method fits, gets a help inside it, or a parallel method replaces it (teilgruppen.json). */
    antwort: TeilgruppenEntscheidung['antwort'];
    /** Why: the row of the table, its basis and source. */
    beleg: { grund: string; merkmal?: string; grundlage?: Grundlage; quelle?: string };
    /** Helps inside the method (answer 'hilfe'), each with the sentence on when it is no longer needed. */
    hilfen: Hilfe[];
    /** No method is planned in this phase: the answer is no fit check, the helps are the group's matrix helps. */
    ohneMethode?: true;
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
    fachbereich: string | null;
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
  /** Parallel methods for subgroups where the planned method fits them poorly (the regular group keeps the plan). */
  teilgruppenMethoden: MethodAdjustment[];
  /** Helps inside the planned method for subgroups whose answer is 'hilfe'. */
  teilgruppenHilfen: SupportProposal[];
  /** Short extra phases for the whole class that the subgroups depend on (proposal, not applied). */
  zusatzphasen: AdditionalPhaseProposal[];
  /** Blocked traits a group named (e.g. Lerntypen) with the reason they are not evaluated. */
  gesperrt: Array<{ gruppe: string; text: string }>;
  /** Hints on grouping (gruppierung-nur-mit-anpassung, leistungsschwache-nicht-unter-sich). */
  regelmeldungen: Regelmeldung[];
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
  /** Values the text names with this pattern; only these decide the table rows (see QuickLearnerGroupProfile.kern). */
  kern: string[];
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
      ausdrucksfaehigkeit: 'ausdrucksfaehigkeit-eingeschraenkt'
    },
    kern: ['sprachkompetenz-gering', 'ausdrucksfaehigkeit-eingeschraenkt'],
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
      strukturierung: 'strukturierung-stark'
    },
    kern: ['ausdrucksfaehigkeit-eingeschraenkt', 'foerderbedarf-sprache-gelegentlich'],
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
    kern: ['strukturierung-stark', 'foerderbedarf-emotional-sozial-gelegentlich'],
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
    kern: ['foerderbedarf-autismus-deutlich'],
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
    kern: ['foerderbedarf-lernen-umfassend'],
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
    kern: ['vorwissen-gering', 'leistungsniveau-gering'],
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
    kern: ['soziale-kompetenzen-eingeschraenkt', 'selbstwirksamkeit-gering'],
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
    kern: ['engagement-gering', 'interessen-desinteresse'],
    signalLabel: 'Geringe Motivation'
  },
  {
    id: 'motorik',
    label: 'Körperlich-motorische Unterstützung',
    re: new RegExp(String.raw`\b(?:motorisch\w*|feinmotorik|k[oö]rperlich\w*\s+(?:beeintr[aä]cht\w*|einschr[aä]nk\w*|f[oö]rderbedarf)|schreibmotorik)|${ROLLSTUHL_LERNENDE}`, 'i'),
    countRe: /(\d{1,2})\s*(?:kinder|sch[uü]ler\w*|lernende\w*|sus)?\s*(?:mit\s+)?(?:motorisch\w*|k[oö]rperlich\w*)/i,
    selectedValues: {
      'foerderbedarf-koerperlich': 'foerderbedarf-koerperlich-deutlich',
      'zeitliche-verfuegbarkeit': 'zeitliche-verfuegbarkeit-eingeschraenkt'
    },
    kern: ['foerderbedarf-koerperlich-deutlich'],
    signalLabel: 'Motorische / körperliche Unterstützung'
  },
  {
    id: 'hoeren',
    label: 'Hörbeeinträchtigung (visuelle Sicherung)',
    re: /\b(?:h[oö]rbeeintr[aä]cht\w*|schwerh[oö]rig\w*|geh[oö]rlos\w*|h[oö]rsch[aä]dig\w*)/i,
    countRe: /(\d{1,2})\s*(?:kinder|sch[uü]ler\w*|lernende\w*|sus)?\s*(?:mit\s+)?(?:h[oö]rbeeintr[aä]cht\w*|schwerh[oö]rig\w*)/i,
    selectedValues: {
      'foerderbedarf-hoeren': 'foerderbedarf-hoeren-beeintraechtigung'
    },
    kern: ['foerderbedarf-hoeren-beeintraechtigung'],
    signalLabel: 'Hörbeeinträchtigung'
  },
  {
    id: 'sehen',
    label: 'Sehbeeinträchtigung (Kontrast & Audio)',
    re: /\b(?:sehbeeintr[aä]cht\w*|sehbehindert\w*|blind\w*|sehschw[aä]ch\w*)/i,
    countRe: /(\d{1,2})\s*(?:kinder|sch[uü]ler\w*|lernende\w*|sus)?\s*(?:mit\s+)?(?:sehbeeintr[aä]cht\w*|sehbehindert\w*)/i,
    selectedValues: {
      'foerderbedarf-sehen': 'foerderbedarf-sehen-deutlich'
    },
    kern: ['foerderbedarf-sehen-deutlich'],
    signalLabel: 'Sehbeeinträchtigung'
  },
  {
    // Learning styles are recognised only to say why they are not evaluated (blocked category, Pashler et al. 2008).
    id: 'lerntypen',
    label: 'Lerntypen',
    re: /(?<!\b(?:kein\w*|ohne|nicht)\s+(?:nach\s+|in\s+)?(?:\w+\s+)?)\b(?:(?:visuell|auditiv|haptisch|kin[aä]sthetisch)\w*\s+(?:lerntyp|lernstil|lerner|lernende)\w*|lerntyp\w*|lernstil\w*)/i,
    countRe: /(\d{1,2})\s*(?:kinder|sch[uü]ler\w*|lernende\w*|sus)?\s*(?:visuell\w*|auditiv\w*|haptisch\w*)\s+(?:lerntyp|lerner|lernende)/i,
    selectedValues: { sensorische: 'sensorische-multimodal' },
    kern: ['sensorische-multimodal'],
    signalLabel: 'Lerntypen (nicht ausgewertet)'
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
    kern: ['vorwissen-hoch', 'leistungsniveau-hoch'],
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
        selectedValues: { ...pat.selectedValues },
        genannt: [...pat.kern]
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

function extractPhasesFromArrangement(data: Pick<FmtData, 'bausteine' | 'ketten' | 'weiterleitungen'>, arrangement: Arrangement): AdaptPhaseInput[] {
  const blocksById: Map<string, Baustein> = new KennungIndex(data.bausteine.map((b) => [b.kennung, b] as const), data.weiterleitungen);
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
        lernfunktion: (stepId && stepFnById.get(stepId)) || b?.lernfunktion?.[0] || 'verstehen',
        ...(Array.isArray(n.belegung) && n.belegung.length ? { locked: true } : {})
      });
      return;
    }
    if (n.typ === 'Wiederkehr' && typeof n.baustein === 'string') {
      const zeile = wiederkehrZeile(n as unknown as WiederkehrNode, blocksById.get(n.baustein));
      out.push({
        key: `step-${out.length}`,
        phaseLabel: zeile.phaseLabel,
        durationMin: zeile.durationMin,
        baustein: n.baustein,
        lernfunktion: 'konsolidierung',
        locked: true
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

/**
 * Phases of an arrangement as step 3 of the Baukasten checks them. Keys (step-0, step-1 …) follow the
 * order of the thematic table, so proposals can be matched to its rows.
 */
export function phasesForAdjustment(
  data: Pick<FmtData, 'bausteine' | 'ketten' | 'weiterleitungen'>,
  arrangement: Arrangement
): MethodAdjustmentPhase[] {
  const blocksById: Map<string, Baustein> = new KennungIndex(data.bausteine.map((b) => [b.kennung, b] as const), data.weiterleitungen);
  return extractPhasesFromArrangement(data, arrangement).map((p, i) => ({
    key: p.key || `step-${i}`,
    label: p.phaseLabel,
    block: p.baustein ? blocksById.get(p.baustein) : undefined,
    durationMin: p.durationMin,
    locked: p.locked
  }));
}

/** The regular group keeps the plan; every other group with a profile can get parallel methods. */
export const isRegularGroupId = (id: string) => id === 'regel';

const AI_ROLES_CHECK = new Set(['tutor', 'dialogpartner', 'simulationsrolle', 'belehrbarer-agent', 'antwortgeber']);

function recommendMethodsForPhase(
  allBlocks: Baustein[],
  lernfunktion: string,
  udlMeasures: MatrixRecommendation[],
  constraints: { maxTechnik?: string; ohneInternet?: boolean; ohneKI?: boolean; bildungsstufe?: string; fachbereich?: string; maxDur?: number },
  limit = 3
): PhaseAdaptationResult['passendeFmtMethoden'] {
  const maxTechRank = techLimitRank(constraints.maxTechnik);
  const gradeRank = (b: Baustein) => {
    const grades = (b.evidenz || []).map((e) => e.grad);
    return grades.includes('A') ? 0 : grades.includes('B') ? 1 : grades.includes('C') ? 2 : 3;
  };
  const bestGrade = (b: Baustein): string | null => {
    const grades = (b.evidenz || []).map((e) => e.grad);
    return grades.includes('A') ? 'A' : grades.includes('B') ? 'B' : grades.includes('C') ? 'C' : null;
  };

  // A help supports learners inside a method; it is never recommended for a phase.
  const candidates = nurMethoden(allBlocks)
    .filter((b) => {
      if (!b.lernfunktion.includes(lernfunktion)) return false;
      if ((TECH_RANK[b.technik] ?? 0) > maxTechRank) return false;
      if (constraints.ohneInternet && b.internet) return false;
      if (constraints.ohneKI && (Boolean(b.ki) || (b.rolle || []).some((r) => AI_ROLES_CHECK.has(r)))) return false;
      if (constraints.bildungsstufe && (b.ungeeignetBeiStufe || []).includes(constraints.bildungsstufe)) return false;
      if (constraints.fachbereich && (b.fachbereichUngeeignet || []).includes(constraints.fachbereich)) return false;
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
export function adaptScenario(
  data: Pick<FmtData, 'bausteine' | 'ketten' | 'weiterleitungen' | 'teilgruppen' | 'regeln' | 'schemes'>,
  input: AdaptScenarioInput
): AdaptScenarioResult {
  const t0 = Date.now();
  // Former ids of merged or renamed methods answer with the current method.
  const blocksById: Map<string, Baustein> = new KennungIndex(data.bausteine.map((b) => [b.kennung, b] as const), data.weiterleitungen);
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
        { id: 'regel', label: 'Regelgruppe (übrige Klasse)', personaId: 'average' }
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
        { id: 'regel', label: 'Regelgruppe', personaId: 'average' },
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

  // Subgroup decision (teilgruppen.json): profile per group from its values and the traits read from its text.
  const regelsatz: TeilgruppenRegelwerk = { teilgruppen: data.teilgruppen, regeln: data.regeln, schemes: data.schemes };
  const gesperrt: AdaptScenarioResult['gesperrt'] = [];
  const adjustmentGroups: MethodAdjustmentGroup[] = resolvedGroups.map((g) => {
    const det = g.text ? detectMatrixTraitsFromText(g.text, { gesperrt: data.teilgruppen.gesperrt }) : null;
    const selectedValues = { ...(det?.selectedValues || {}), ...(g.selectedValues || {}) };
    const isMain = isRegularGroupId(g.id);
    const gesperrtGenannt = bereinigeProfil({ id: g.id, label: g.label, selectedValues }, data.teilgruppen).gesperrt;
    if (!isMain && (gesperrtGenannt.length || det?.gesperrt.length)) gesperrt.push({ gruppe: g.label, text: data.teilgruppen.gesperrtText });
    // Traits read from the group's text are named; with a core list, they join it.
    const genannt = g.genannt ? [...g.genannt, ...Object.values(det?.selectedValues || {})] : undefined;
    return {
      id: g.id,
      label: g.label,
      isMain,
      personaId: g.personaId,
      ...(Object.keys(selectedValues).length ? { selectedValues } : {}),
      ...(genannt ? { genannt } : {}),
      ...(g.ohneSchrift?.length ? { ohneSchrift: g.ohneSchrift } : {}),
      ...(g.ohneBewegung ? { ohneBewegung: true } : {})
    };
  });
  const adjustmentConstraints = {
    maxTechnik,
    ohneInternet,
    ohneKI,
    bildungsstufe: input.bildungsstufe || input.arrangement?.kontext?.bildungsstufe || undefined,
    fachbereich: input.fachbereich,
    ...(input.lehrende ? { lehrende: input.lehrende } : {}),
    ...(input.anfrage ? { anfrage: input.anfrage } : {})
  };
  const groupById = new Map(adjustmentGroups.map((g) => [g.id, g]));
  // Full list of measures per group for the helps (the ranked synthesis result keeps only twelve).
  const hilfsMatrix = new Map(adjustmentGroups.map((g) => [g.id, matrixFuer(g, data.teilgruppen, adjustmentConstraints, 50)]));
  const PASST_REGEL = 'Die Regelgruppe behält den Ablauf.';

  /** Answer, evidence, helps and equivalent alternatives of one group for one phase. */
  const adjustmentPhases: MethodAdjustmentPhase[] = rawPhases.map((p, idx) => ({
    key: p.key || `phase-${idx + 1}`,
    label: p.phaseLabel,
    block: p.baustein ? blocksById.get(p.baustein) : undefined,
    durationMin: p.durationMin,
    locked: p.locked
  }));
  const withMethods = adjustmentPhases.some((p) => p.block);
  // One decision path for the table, the proposals and the hints (teilgruppenAntworten).
  const antworten = withMethods ? teilgruppenAntworten(data.bausteine, adjustmentPhases, adjustmentGroups, adjustmentConstraints, regelsatz) : [];
  const antwortByKey = new Map(antworten.map((a) => [`${a.groupId}|${a.stepKey}`, a]));

  /** Answer, evidence, helps and equivalent alternatives of one group for one phase. */
  const entscheide = (groupId: string, stepKey: string, block: Baustein | undefined) => {
    const g = groupById.get(groupId);
    // Without a planned method in the phase no fit is checked; the flag keeps callers from reading the answer as one.
    const ohne = block ? {} : { ohneMethode: true as const };
    if (!g || g.isMain || !hasAdjustmentProfile(g)) {
      return { antwort: 'passt' as const, beleg: { grund: g?.isMain ? PASST_REGEL : 'Für die Gruppe ist kein Bedarf angegeben.' }, hilfen: [], alternativeMethoden: [], ...ohne };
    }
    const a = block ? antwortByKey.get(`${groupId}|${stepKey}`) : undefined;
    if (!a) {
      // No planned method: nothing to swap; the matrix helps for the group stand in for the method's help.
      const hilfen = hilfenFuer(undefined, hilfsMatrix.get(groupId)!, data.teilgruppen);
      return hilfen.length
        ? { antwort: 'hilfe' as const, beleg: { grund: 'Ohne geplante Methode: Hilfen der Matrix für die Teilgruppe.' }, hilfen, alternativeMethoden: [], ...ohne }
        : { antwort: 'passt' as const, beleg: { grund: 'Ohne geplante Methode und ohne Bedarf, der eine Hilfe braucht.' }, hilfen: [], alternativeMethoden: [], ...ohne };
    }
    const beleg = {
      grund: a.grund,
      ...(a.merkmal ? { merkmal: a.merkmal } : {}),
      ...(a.grundlage ? { grundlage: a.grundlage } : {}),
      ...(a.quelle ? { quelle: a.quelle } : {})
    };
    return { antwort: a.antwort, beleg, hilfen: a.hilfen, alternativeMethoden: a.alternativen };
  };

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
      const phaseMeasures = tg.spezifischeMassnahmen.filter((m) => fitsPhase(m.meta.phasen));
      const pool = phaseMeasures.length ? phaseMeasures : tg.spezifischeMassnahmen;
      const ordered = [
        ...pool.filter((m) => !conflictsWithMethodInteraction(m.id, block)),
        ...pool.filter((m) => conflictsWithMethodInteraction(m.id, block))
      ].slice(0, 3);
      const antwort = entscheide(tg.id, p.key || `phase-${idx + 1}`, block);
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
        alternativeMethoden: antwort.alternativeMethoden,
        antwort: antwort.antwort,
        beleg: antwort.beleg,
        hilfen: antwort.hilfen,
        ...('ohneMethode' in antwort && antwort.ohneMethode ? { ohneMethode: true as const } : {})
      };
    });

    const passendeFmtMethoden = block
      ? []
      : recommendMethodsForPhase(data.bausteine, fn, udlAsRecs, {
          maxTechnik,
          ohneInternet,
          ohneKI,
          bildungsstufe: input.bildungsstufe,
          fachbereich: input.fachbereich,
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

  const teilgruppenMethoden = withMethods
    ? proposeMethodAdjustments(data.bausteine, adjustmentPhases, adjustmentGroups, adjustmentConstraints, regelsatz, antworten)
    : [];
  const teilgruppenHilfen = withMethods ? proposeSupports(adjustmentPhases, adjustmentGroups, regelsatz, { antworten }) : [];
  const regelmeldungen = withMethods
    ? teilgruppenHinweise(adjustmentPhases, adjustmentGroups, teilgruppenMethoden, teilgruppenHilfen, regelsatz)
    : [];
  const zusatzphasen = withMethods
    ? proposeAdditionalPhases(data.bausteine, adjustmentPhases, adjustmentGroups, adjustmentConstraints)
    : [];

  return {
    dauerMs: Date.now() - t0,
    kontext: {
      fach: input.fach?.trim() || null,
      thema: input.thema?.trim() || null,
      bildungsstufe: input.bildungsstufe || input.arrangement?.kontext?.bildungsstufe || null,
      fachbereich: input.fachbereich || null,
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
    teilgruppenMethoden,
    teilgruppenHilfen,
    zusatzphasen,
    gesperrt,
    regelmeldungen,
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
