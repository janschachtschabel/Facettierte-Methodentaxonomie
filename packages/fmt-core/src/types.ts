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
  | 'ki';

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
  'ki'
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
}

export interface Funktionskette {
  id: string;
  label: string;
  zielart?: string[];
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
  geeignetBeiVorwissen?: string[];
  ungeeignetBeiStufe?: string[];
  problem: string;
  durchfuehrung: string[];
  material: string[];
  raum?: string;
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
  zeitbudgetMin?: number;
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
  ketten: Funktionskette[];
  bausteine: Baustein[];
  beispiele: Arrangement[];
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
  grundlage: RuleBasis;
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
  vorhanden?: string | string[];
  vorwissen?: string;
  bildungsstufe?: string;
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
  warnungen: string[];
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
}

export interface PhaseMatchResult extends MatchHead {
  modus: 'phase';
  vorschlaege: PhaseProposal[];
  ausgeschlossen: {
    funktion: number;
    rahmen: Array<{ baustein: string; name: string; grund: string }>;
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
  /** Methods named in the request and where they were placed. */
  verankert?: Array<{ baustein: string; schritt: string }>;
  /** Methods named in the request that could not be placed, with the reason. */
  nichtVerankert?: Array<{ baustein: string; grund: string }>;
  /** Assumptions the matcher made because the request left something open. */
  annahmen?: string[];
  arrangement?: Arrangement;
  pruefung?: {
    gueltig: boolean;
    dauerMin: number;
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
  ketten: Funktionskette[];
  bausteine: Baustein[];
  beispiele: Arrangement[];
  oeh: Record<string, string>;
  rules: RuleMeta[];
}
