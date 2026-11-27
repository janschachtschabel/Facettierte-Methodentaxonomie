import type { DetectedSubject, OehSubjectCrosswalk } from './fach.js';
import type { Situation } from './situation.js';
export type PiktogrammId =
  | 'vortrag'
  | 'dialog'
  | 'gruppen'
  | 'stationen'
  | 'experiment'
  | 'projekt'
  | 'quiz'
  | 'reflexion'
  | 'rolle'
  | 'visualisierung'
  | 'debatte'
  | 'ki'
  | 'uebung'
  | 'spiel'
  | 'forschen'
  | 'digital'
  | 'kreativ'
  | 'diskurs'
  | 'kooperativ'
  | 'offen'
  | 'feedback'
  | 'sprache';

export const PIKTOGRAMME: readonly PiktogrammId[] = [
  'vortrag',
  'dialog',
  'gruppen',
  'stationen',
  'experiment',
  'projekt',
  'quiz',
  'reflexion',
  'rolle',
  'visualisierung',
  'debatte',
  'ki',
  'uebung',
  'spiel',
  'forschen',
  'digital',
  'kreativ',
  'diskurs',
  'kooperativ',
  'offen',
  'feedback',
  'sprache'
] as const;

export type EvidenceGrade = 'A' | 'B' | 'C';
export type InferenceLevel = 'niedrig' | 'mittel' | 'hoch';
export type RuleBasis = 'formal' | 'E' | 'S' | 'A';
export type BlockStatus = 'kuratiert' | 'entwurf';

export interface VocabValue {
  id: string;
  label: string;
  definition?: string;
  alt?: string[];
  rang?: number;
  impliziert?: string[];
  closeMatch?: string | string[];
  relatedMatch?: string | string[];
  broadMatch?: string | string[];
  /** Room type only: room properties it offers (vocab raumbedarf). */
  bietet?: string[];
  /** Room type only: kind of special equipment it offers (vocab fachausstattungart). */
  fachausstattungArt?: string;
  /** Zielart only: knowledge types (D1) it stands for. */
  wissensart?: string[];
  /** Zielart only: forms of proof (vocab nachweisform) that go with it. */
  nachweis?: string[];
  /** Reading of the value per context (text or by key). */
  lesart?: Record<string, string> | string;
}

export interface VocabGroup {
  id: string;
  label: string;
  werte: VocabValue[];
}

export interface Scheme {
  id: string;
  titel: string;
  beschreibung: string;
  werte?: VocabValue[];
  gruppen?: VocabGroup[];
}

/** Effect of a statement on the assignment. */
export type Wirkung = 'schliesst-aus' | 'warnt' | 'ordnet' | 'weist-hin';
/** Basis of a statement: formal (readable), law, or E (evidence), S (inferred), A (set). */
export type Grundlage = 'formal' | 'Recht' | 'E' | 'S' | 'A' | 'U';
/** Direction of a swap (Tausch) for a subgroup characteristic. */
export type Richtung = 'mehr-anleitung' | 'weniger-anleitung' | 'explizit-mit-strategie' | 'ohne-lesen' | 'ohne-schreiben' | 'ohne-bewegung';
/** One row of the table "Tausch oder Hilfe". */
export interface MerkmalAntwort {
  /** Id from the papers, e.g. 'vorwissen-gering'. */
  id: string;
  /** Matrix value ids (Ausprägungen) this row covers. */
  auspraegungen: string[];
  antwort: 'tausch' | 'hilfe';
  richtung?: Richtung;
  wohin: string;
  grundlage: Grundlage;
  quelle?: string;
}
export interface TeilgruppenRegelsatz {
  merkmale: MerkmalAntwort[];
  /** Answer for matrix values no row names. */
  sonst: { antwort: 'hilfe'; grundlage: 'U'; wohin: string };
  /** Matrix value ids that mean no need (average, typical, none); they are ignored like not selected. */
  neutral: string[];
  /** Matrix category ids that never trigger anything. */
  gesperrt: string[];
  gesperrtText: string;
  /** When a support is withdrawn, by measure area id of the matrix plus 'sonst'. */
  abbau: Record<string, string>;
}

/** One of the nine W-fields (what, who, where, ...). */
export interface WFeld {
  id: string;
  name: string;
  frage: string;
  planung: 'gegeben' | 'vorschlag';
}
/** One of the five kinds of statements about a method. */
export interface Aussageart {
  id: 'bauweise' | 'beitrag' | 'bedarf' | 'eignung' | 'einordnung';
  name: string;
  aussage: string;
  wirkung: string;
}
/** One attribute of a method in the W-grid: a field at the method, its W-field, kind and counterpart in the situation. */
export interface Merkmal {
  /** Field name at the method, e.g. 'raumbedarf' or 'dauerMin'. */
  feld: string;
  wfeld: string;
  art: Aussageart['id'];
  /** Request fields that are the counterpart in the situation. */
  situation: string[];
  wirkung: Wirkung;
  grundlage: Grundlage;
  regel?: string;
}

export type ListenVergleich = { enthaelt?: string[]; nur?: string[]; ohne?: string[] };
/** One fit rule (Passungsregel) as data; built-in rules are applied by the matcher and only carry text and basis here. */
export interface Passungsregel {
  id: string;
  name: string;
  wfelder: string[];
  art: 'deklarativ' | 'eingebaut';
  wenn?: { methode?: Record<string, ListenVergleich>; situation?: Record<string, string[]> };
  wirkung: Wirkung;
  /** The rule warns and points to help, but does not move the method back in the ranking ("kein Tausch"). */
  keinTausch?: boolean;
  grundlage: Grundlage;
  quelle?: string;
  /** Plain German sentence shown to the teacher; {methode} is replaced by the method name. */
  text: string;
  ersetzt?: string;
}
/**
 * One message of a fit rule. With `baustein` it speaks about that method; without `baustein` it is the
 * situation-level reading of the rule (the situation part holds, so methods it names are set back), with the
 * rule's own wirkung and grundlage.
 */
export interface Regelmeldung {
  regel: string;
  wirkung: Wirkung;
  grundlage: Grundlage;
  quelle?: string;
  text: string;
  baustein?: string;
}
export interface RegelSituation {
  vorwissen?: string;
  bildungsstufe?: string;
  komplexitaet?: string;
  sprachniveau?: string;
  fachbereich?: string;
}

export interface FacetMeta {
  id: string;
  inferenz: InferenceLevel;
  domaene: 'A' | 'B' | 'C' | 'D';
  schema: string;
  feld: string;
  kurz: string;
  name: string;
  leitfrage: string;
  fundierung: string;
  schliesst: string;
}

export interface KettenSchritt {
  id: string;
  label: string;
  funktion: string[];
  ziel: string;
  /** Didactic weight of the step: rand (opening/closing), haupt (main work), sicherung. */
  rolle?: 'rand' | 'haupt' | 'sicherung';
  /** Relative share of the time budget; the shares of a chain need not add up to 100. */
  zeitanteil?: number;
  /** Knowledge types (D1) the step asks for; without it (edge steps) the step does not bind. */
  wissensart?: string[];
}

export interface Funktionskette {
  id: string;
  label: string;
  /** Goal kinds (vocab zielart) the chain serves. */
  zielart?: string[];
  /** Approaches (vocab ansatz) that pick this chain among those of one goal kind. */
  ansatz?: string[];
  closeMatch?: string | string[];
  relatedMatch?: string | string[];
  broadMatch?: string | string[];
  schritte: KettenSchritt[];
}

export interface Kernkomponente {
  typ?: 'Kernkomponente';
  kennung: string;
  name: string;
}

export interface SlotDef {
  typ?: 'Slot';
  kennung: string;
  name: string;
  lernfunktion: string[];
  reichweite: string;
  pflicht: boolean;
  nachKernphase?: boolean;
}

export interface Evidenzaussage {
  typ?: 'Evidenzaussage';
  grad: EvidenceGrade;
  befund: string;
  quelle: string;
  geltung: string;
  umstritten?: string;
  /** methode: studies on this method itself; prinzip: derived from the underlying principle. */
  evidenzBezug?: 'methode' | 'prinzip';
}

export interface Steuerungsprofil {
  typ?: 'Steuerungsprofil';
  organisation?: string;
  lernweg?: string;
  inhalt?: string;
  sozial?: string;
  bewertung?: string;
  [key: string]: string | undefined;
}

export interface Quelle {
  typ?: 'Quelle';
  titel: string;
  url?: string;
  quelltyp: 'wikipedia' | 'oer' | 'fachliteratur' | 'institution';
  lizenz?: string;
}

export interface Baustein {
  '@context'?: string;
  '@id'?: string;
  typ?: 'Baustein';
  beschreibungsstufe?: string;
  kennung: string;
  name: string;
  kurzbeschreibung: string;
  alternativname: string[];
  status: BlockStatus;
  piktogramm: PiktogrammId;
  ansatz: string[];
  quellen: Quelle[];
  reichweite: string;
  komposit?: boolean;
  ki?: boolean;
  lernfunktion: string[];
  engagement: string[];
  weltbezug: string[];
  anleitung: string[];
  steuerung?: Steuerungsprofil;
  adaptivitaet: string[];
  feedback: string[];
  interaktion: string[];
  repraesentation: string[];
  raumzeit: string[];
  rolle: string[];
  aufgabe: string[];
  sequenz: string[];
  vorbedingung: string[];
  nachbedingung: string[];
  kernkomponente: Kernkomponente[];
  slot?: SlotDef[];
  dauerMin: number;
  dauerMax: number;
  /** Subject areas where the method is at home; 'uebergreifend' = no subject binding. */
  fachbereich?: string[];
  /** Subject areas where the method does not fit. */
  fachbereichUngeeignet?: string[];
  /** BD1: room properties the method needs (vocab raumbedarf); all must be met, empty = no special need. */
  raumbedarf?: string[];
  /** Kind of special equipment the method needs; set only when a core component fixes it (vocab fachausstattungart). */
  fachausstattungArt?: string;
  /** BD6: whether learners read or write text (vocab schriftbedarf). */
  schriftbedarf?: string[];
  /** Number of sessions the method needs at least. */
  termineMin?: number;
  /** Kind of entry: a method carries a phase; a Hilfe supports learners within a method. */
  eintragsart?: 'methode' | 'hilfe';
  /** Reasons for the Eignung statements, per attribute, with their basis. */
  eignungsgrund?: Partial<Record<'stufe' | 'vorwissen' | 'fachbereich', { text: string; grundlage: 'E' | 'S' | 'A'; quelle?: string }>>;
  /** Prior knowledge levels the method does not fit (replaces geeignetBeiVorwissen). */
  ungeeignetBeiVorwissen?: string[];
  geeignetBeiVorwissen?: string[];
  ungeeignetBeiStufe?: string[];
  problem: string;
  durchfuehrung: string[];
  material: string[];
  /** Free-text note on the room (layout, setup); replaces the former field raum. */
  raumhinweis?: string;
  /** Free-text note on supervision (second adult, constant supervision, safety briefing). */
  betreuungshinweis?: string;
  gruppeMin: number;
  gruppeMax: number;
  teamMin?: number;
  teamMax?: number;
  vorbereitungMin: number;
  technik: string;
  internet: boolean;
  variante?: string[];
  kategorie: string[];
  hinweis?: string;
  qualitaetsrisiko?: string[];
  evidenz: Evidenzaussage[];
  plot?: { x: number; y: number };
  [key: string]: unknown;
}

export interface SlotBelegung {
  slotKennung: string;
  inhalt: ArrangementNode;
}

export interface EinsatzNode {
  typ: 'Einsatz';
  baustein: string;
  dauerMin?: number;
  kettenschritt?: string;
  weggelassen?: string[];
  belegung?: SlotBelegung[];
}

export interface SequenzNode {
  typ: 'Sequenz';
  kettenschritt?: string;
  teile: ArrangementNode[];
}

export interface ParallelNode {
  typ: 'Parallel';
  kettenschritt?: string;
  haupt: ArrangementNode;
  begleitend: ArrangementNode[];
}

export interface WiederkehrNode {
  typ: 'Wiederkehr';
  kettenschritt?: string;
  baustein: string;
  anzahl: number;
  abstand?: string;
  dauerMin?: number;
  /** Repetitions take place in later sessions and do not count towards the time budget of this plan. */
  ausserhalbBudget?: boolean;
}

export interface AlternativeNode {
  typ: 'Alternative';
  kettenschritt?: string;
  kriterium?: string;
  optionen: ArrangementNode[];
}

export interface VerweisNode {
  typ: 'Verweis';
  kettenschritt?: string;
  arrangement: string;
}

export type ArrangementNode =
  | EinsatzNode
  | SequenzNode
  | ParallelNode
  | WiederkehrNode
  | AlternativeNode
  | VerweisNode;

export interface ArrangementKontext {
  stufe?: string;
  bildungsstufe?: string;
  fach?: string;
  vorwissen?: string;
  /** Complexity of the content (scheme komplexitaet); read by the fit rules (R-06). */
  komplexitaet?: string;
  /** Language level of the whole group (scheme sprachniveau); read by the fit rules (R-06). */
  sprachniveau?: string;
  /** Subject area (scheme fachbereich); read by the suitability entries (R-06). */
  fachbereich?: string;
  zeitbudgetMin?: number;
  /** Learning states the group brings from earlier lessons (e.g. a test on last week's content at the start). */
  vorhanden?: string[];
}

export interface Arrangement {
  '@context'?: string;
  '@id'?: string;
  typ: 'Arrangement';
  name: string;
  reichweite: string;
  zieltyp?: string;
  kontext?: ArrangementKontext;
  ablauf: ArrangementNode;
}

export interface FmtMeta {
  version: string;
  NS: string;
  creator: string;
  license: string;
  licenseName: string;
  repository: string;
}

export interface FmtData {
  VERSION: string;
  NS: string;
  creator: string;
  license: string;
  licenseName?: string;
  repository?: string;
  schemes: Scheme[];
  facetten: FacetMeta[];
  wfelder: WFeld[];
  arten: Aussageart[];
  merkmale: Merkmal[];
  ketten: Funktionskette[];
  /** Fit rules (Passungsregeln). */
  regeln: Passungsregel[];
  /** Table "Tausch oder Hilfe" for subgroups. */
  teilgruppen: TeilgruppenRegelsatz;
  bausteine: Baustein[];
  beispiele: Arrangement[];
  /** OEH school and university subjects mapped to FMT subject areas (recognition layer, optional). */
  faecher?: OehSubjectCrosswalk;
  /** Former method ids that now point to another method (merged duplicates, renamed ids). */
  weiterleitungen?: Record<string, string>;
}

export interface RuleMeta {
  id: string;
  prueft: string;
  schwere: 'Fehler' | 'Warnung' | 'Warnung / Fehler';
  grundlage: RuleBasis;
  begruendung: string;
}

export interface ValidationMessage {
  regel: string;
  schwere: 'Fehler' | 'Warnung';
  /** Basis of the rule; for R-06 the basis of the fit message itself (E, S, A, Recht, U). */
  grundlage: Grundlage;
  pfad: string;
  meldung: string;
}

export interface ValidationResult {
  gueltig: boolean;
  meldungen: ValidationMessage[];
  endzustand: string[];
  dauerMin: number;
  reichweite: string;
  wiederkehr: Array<{ anzahl: number; baustein: string }>;
  /** Minutes of distributed repetition planned for later sessions (not part of dauerMin). */
  dauerAusserhalbMin?: number;
}

export interface SearchCriteria {
  text?: string;
  reichweite?: string | string[];
  maxDauer?: number | string;
  vorhanden?: string | string[];
  liefert?: string | string[];
  vorwissen?: string;
  bildungsstufe?: string;
  gruppe?: number | string;
  maxVorbereitung?: number | string;
  maxTechnik?: string;
  ohneInternet?: boolean;
  ohneKI?: boolean;
  kategorie?: string;
  minEvidenz?: EvidenceGrade;
  ansatz?: string | string[];
  status?: BlockStatus | BlockStatus[];
  /** Strict: methods assigned to one of these subject areas. */
  fachbereich?: string | string[];
  /** Methods that fit the area: assigned to it or without subject binding, never marked unsuitable for it. */
  fuerFachbereich?: string;
  /** Room type (vocab raumtyp): only methods whose Raumbedarf it meets. */
  raum?: string;
  /** Methods that need at least one of these room properties (vocab raumbedarf). */
  raumbedarf?: string | string[];
  /** Methods that need at least one of these writing/reading abilities (vocab schriftbedarf). */
  schriftbedarf?: string | string[];
  /** Methods that need none of these room properties. */
  ohneRaumbedarf?: string | string[];
  [facet: string]: unknown;
}

export interface ReplacementCandidate {
  baustein: string;
  name: string;
  dauerMin: number;
  warnungen: string[];
}

export interface MatchFieldDef {
  feld: string;
  typ: 'string' | 'code' | 'codes' | 'integer' | 'boolean';
  stufe?: number;
  bedeutung: string;
  werte?: Array<{ code: string; label: string }>;
}

export interface MatchRequest {
  text?: string;
  modus?: 'phase' | 'ablauf';
  zieltyp?: string;
  zielart?: string;
  ansatz?: string | string[];
  lernfunktion?: string | string[];
  anleitung?: string | string[];
  engagement?: string | string[];
  interaktion?: string | string[];
  reichweite?: string | string[];
  liefert?: string | string[];
  zeitMin?: number;
  gruppe?: number;
  /** Index of an equivalent alternative proposal (0 = default). */
  variante?: number;
  maxTechnik?: string;
  ohneInternet?: boolean;
  ohneKI?: boolean;
  maxVorbereitung?: number;
  raumzeit?: string | string[];
  /** Room type of the lesson (scheme raumtyp). */
  raum?: string;
  /** Former name of raum, still accepted. */
  lernort?: string;
  /** Room properties the room offers beyond its type (scheme raumbedarf). */
  raumBietet?: string | string[];
  /** Kind of special equipment the room offers (scheme fachausstattungart). */
  fachausstattungArt?: string;
  /** What the learners cannot do yet: lesen, schreiben. */
  ohneSchrift?: string | string[];
  /** Number of sessions of the unit. */
  termine?: number;
  vorhanden?: string | string[];
  vorwissen?: string;
  bildungsstufe?: string;
  /** Complexity of the content (scheme komplexitaet). */
  komplexitaet?: string;
  /** Language level of the whole group (scheme sprachniveau, A1 to C2). */
  sprachniveau?: string;
  /** Number of teachers or adults leading the lesson. */
  lehrende?: number;
  /** Topic of the lesson in free text. */
  thema?: string;
  /** Name of the unit the lesson belongs to (Lernfeld, Unterrichtsreihe, Modul). */
  einheit?: string;
  /** Whether the lesson is graded. */
  bewertet?: boolean;
  [key: string]: unknown;
}

export interface PhaseProposal {
  baustein: string;
  name: string;
  reichweite: string;
  dauerMin: number;
  dauerMax: number;
  setztVoraus: string[];
  liefert: string[];
  evidenzgrad: EvidenceGrade | null;
  /** Warnings of the method as text (rule message plus source in brackets), filled from regelmeldungen. */
  warnungen: string[];
  /** Fit rules and suitability entries that warn for this method in this situation. */
  regelmeldungen?: Regelmeldung[];
  gruende: string[];
  /** The request names this method. */
  genannt?: boolean;
}

export interface AblaufSchrittResult {
  schritt: string;
  label: string;
  ziel: string;
  baustein: string;
  name: string;
  slots: Array<{ slot: string; baustein: string; name: string }>;
  alternativen: string[];
}

export interface MatchHead {
  kriterien: Record<string, unknown>;
  erkannt: Array<{ feld: string; wert: unknown; beleg: string }>;
  offen: string[];
  dauerMs?: number;
  /** Subject named in the request text, with its OEH URI. */
  fach?: DetectedSubject;
  /** Notes for the teacher as text (rule message plus source in brackets), filled from regelmeldungen. */
  hinweise?: string[];
  /**
   * Rule messages of the answer: warnings of the chosen methods, the safety note, named wishes that stay.
   * Each names rule, effect, basis, source and text, and the method when it concerns one.
   */
  regelmeldungen?: Regelmeldung[];
  /** Which of the six required details the request leaves open, and what was assumed instead (field, value, reason). */
  pflichtangaben?: Situation['pflichtangaben'];
  /** Form of proof the check is ordered by (rule nachweis-passt-zum-ziel): stated in the request or carried by the goal kind. */
  nachweis?: { formen: string[]; quelle: 'anfrage' | 'zielart'; grund: string };
}

export interface PhaseMatchResult extends MatchHead {
  modus: 'phase';
  /** Why a single phase is offered although a sequence was likely meant (e.g. too little time). */
  hinweis?: string;
  vorschlaege: PhaseProposal[];
  ausgeschlossen: {
    funktion: number;
    /** `merkmal`: the method's field whose need the situation does not cover, e.g. 'raumbedarf'. */
    rahmen: Array<{ baustein: string; name: string; grund: string; merkmal?: string }>;
    anschluss: Array<{ baustein: string; name: string; grund: string }>;
  };
  zaehler: {
    katalog: number;
    nachFunktion: number;
    nachRahmen: number;
    nachAnschluss: number;
    mitWarnung: number;
  };
}

export interface AblaufMatchResult extends MatchHead {
  modus: 'ablauf';
  hinweis?: string;
  kette?: { id: string; label: string };
  schritte?: AblaufSchrittResult[];
  offenSchritte?: string[];
  /** Why a chain step stayed open, e.g. no method delivers its learning state for the bound knowledge type. */
  offenGruende?: Array<{ schritt: string; grund: string }>;
  /** Methods named in the request and where they were placed. */
  verankert?: Array<{ baustein: string; schritt: string }>;
  /** Methods named in the request that could not be placed, with the reason. */
  /** `merkmal`: the method's field whose need the situation does not cover (e.g. 'raumbedarf'), when that is the reason. */
  nichtVerankert?: Array<{ baustein: string; grund: string; merkmal?: string }>;
  /** Assumptions the matcher made because the request left something open. */
  annahmen?: string[];
  arrangement?: Arrangement;
  pruefung?: {
    gueltig: boolean;
    dauerMin: number;
    /** Minutes of distributed repetition planned for later sessions (not part of dauerMin). */
    dauerAusserhalbMin?: number;
    endzustand: string[];
    meldungen: ValidationMessage[];
  };
  weitereKetten?: Array<{ id: string; label: string }>;
}

export type MatchResult = PhaseMatchResult | AblaufMatchResult;

export interface CatalogBundle {
  version: string;
  versionHash: string;
  builtAt: string;
  NS: string;
  creator: string;
  license: string;
  licenseName: string;
  repository: string;
  schemes: Scheme[];
  facetten: FacetMeta[];
  wfelder: WFeld[];
  arten: Aussageart[];
  merkmale: Merkmal[];
  ketten: Funktionskette[];
  regeln: Passungsregel[];
  teilgruppen: TeilgruppenRegelsatz;
  bausteine: Baustein[];
  beispiele: Arrangement[];
  oeh: Record<string, string>;
  rules: RuleMeta[];
  faecher?: OehSubjectCrosswalk;
  weiterleitungen?: Record<string, string>;
}
