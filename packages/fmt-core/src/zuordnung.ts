import type {
  AblaufMatchResult,
  AblaufSchrittResult,
  Arrangement,
  ArrangementNode,
  Baustein,
  EinsatzNode,
  EvidenceGrade,
  FmtData,
  Funktionskette,
  MatchFieldDef,
  MatchRequest,
  MatchResult,
  PhaseMatchResult,
  PhaseProposal,
  Scheme,
  VocabValue
} from './types.js';
import type { FmtValidator } from './validate.js';
import { createSemanticClassifier } from './semantic.js';
import { detectMatrixTraitsFromText } from './differentiationMatrix.js';
import { createMentionDetector } from './mentions.js';
import { createSubjectDetector, type DetectedSubject } from './fach.js';
import { pickOrder, rankingGrade, softScore } from './ranking.js';
import { KennungIndex } from './kennung.js';
import { phaseBudgets, stretch } from './zeitverteilung.js';

const GRADE_ORDER: EvidenceGrade[] = ['A', 'B', 'C'];
const FRAME_WORDS = new Set(
  'klasse klassenstufe jahrgang minuten min stunde stunden doppelstunde einzelstunde schuler schulerinnen lernende kinder studierende teilnehmende personen sus und oder mit ohne der die das ein eine einer zum zur fur thema'.split(
    ' '
  )
);
const SLOT_CANDIDATES = 8;
const RECURRENCE = { anzahl: 3, abstand: 'P2D' };
/** Up to this budget a plan is one session (a double period plus breaks at most). */
const SINGLE_SESSION_MAX_MIN = 180;
/** Upper bound for a time budget (about a school year of one subject); keeps the allocation loops bounded. */
const MAX_BUDGET_MIN = 20000;
const AI_ROLES = new Set([
  'tutor',
  'dialogpartner',
  'simulationsrolle',
  'belehrbarer-agent',
  'antwortgeber'
]);

const list = (x: unknown): string[] =>
  x == null || x === '' ? [] : Array.isArray(x) ? x.map(String) : [String(x)];
const given = (v: unknown) => v != null && v !== '';
const fold = (s: string) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss');

/**
 * Performance or learning check within the lesson (folded text). Preparing for a later test is no check:
 * "Klassenarbeit vorbereiten" or "Vorbereitung auf den Test" do not match.
 */
export const LEISTUNGSKONTROLLE =
  /\bleistungs(?:kontroll|uberprufung|nachweis|messung|test|feststellung|bewertung|abfrage)\w*|\blern(?:ziel|erfolgs|stands)?(?:kontroll|uberprufung)\w*|\blernstandserhebung\w*|(?<!\b(?:vorbereitung|vorbereiten|nachbesprechung|besprechung|ruckgabe|berichtigung|korrektur|nach)\s+(?:(?:auf|fur|der|des|die|den|das|dem|einer|einen|eine|zur|zum)\s+){0,2})\b(?:test|tests|kurztest|vokabeltest|sporttest|abschlusstest|cooper-?test|klassenarbeit|klausur)\b(?!\s+(?:vor|nach)bereit\w*|\s+(?:nach)?besprechen)|\bbenot(?:ung\w*|et\w*|en)\b|\bnoten(?:gebung|vergabe)\b|(?<!\b(?:vorbereitung|vorbereiten|nachbesprechung|besprechung|ruckgabe|berichtigung|korrektur|nach|tipps|angst|ablauf|simulation|ubung|uben)\s+(?:(?:auf|fur|vor|der|die|den|das|dem|eine|einer|zur|zum)\s+){0,2}(?:\w+e[nrs]?\s+)?)\b(?:schriftlich|mundlich|praktisch)\w*\s+(?:uberprufung|prufung|abfrage|lernkontrolle)(?:en)?\b(?!\s+(?:(?:vor|nach)bereit\w*|(?:nach)?besprechen|uben|simulieren|erklaren))/;

/**
 * Removes negated phrases ("keine Gruppenarbeit", "ohne Experimente", "bitte keine Diskussion im Plenum")
 * from folded text, so that rules looking for what the request wants do not fire on what it rules out.
 */
export const NEGATED_PHRASE =
  /\b(?:ohne|kein|keine|keinen|keiner|keinem|keines|nicht|statt|anstatt|anstelle\s+von)\s+(?:(?:so|zu|der|die|das|den|dem|ein|eine|einen|viel|viele|grosse|grossen|lange|langen|offene|offenen|klassische|klassischen|in|im|auf|am)\s+)*[a-z][\w-]*(?:\s+oder\s+(?!kein|ohne|nicht)[a-z][\w-]*)?(?:\s+im\s+plenum)?/g;
export const withoutNegated = (folded: string) => folded.replace(NEGATED_PHRASE, ' ');

/** Interaction forms a negated phrase rules out, e.g. "keine Gruppenarbeit" → kleingruppe-kooperativ. */
export function negatedInteractions(folded: string): Set<string> {
  const out = new Set<string>();
  for (const m of folded.match(NEGATED_PHRASE) || []) {
    if (/gruppenarbeit|kleingruppe|teamarbeit|tischgruppe|gruppenpuzzle/.test(m)) out.add('kleingruppe-kooperativ');
    if (/partnerarbeit|tandem|zu\s+zweit/.test(m)) out.add('partner');
    if (/einzelarbeit|stillarbeit/.test(m)) out.add('einzel');
    if (/plenum|unterrichtsgesprach|klassengesprach|frontal/.test(m)) out.add('plenum-lehrergeleitet');
  }
  return out;
}

/**
 * Kinds of method a request can rule out by name ("kein Lehrervortrag", "ohne Referate"), with the methods each one covers.
 * Only whole words count, and a phrase that limits rather than bans ("nicht zu lange Vorträge") rules out nothing.
 */
const NEGATABLE_METHODS: Array<[RegExp, string[]]> = [
  [/^(?:lehrer)?vortrag\w*$|^frontal\w*$|^lehrerdarbietung\w*$/, ['lehrervortrag', 'vortrag-prompts', 'vorlesung-klassisch', 'impulsreferat']],
  [/^vorlesung\w*$/, ['vorlesung-klassisch', 'lehrervortrag']],
  [/^(?:schuler)?referat\w*$/, ['referat', 'impulsreferat']],
  [/^(?:schuler)?experiment\w*$|^versuch\w*$/, ['experiment']],
  [/^demonstrationsexperiment\w*$/, ['demonstrationsexperiment']],
  [/^rollenspiel\w*$/, ['rollenspiel']],
  [/^gruppenpuzzle\w*$/, ['gruppenpuzzle']],
  [/^quiz\w*$/, ['abrufquiz']],
  [/^(?:lehr)?film\w*$|^video\w*$/, ['lehrfilm-rezeption', 'erklaervideo', 'stop-motion-erklaerfilm']]
];
const LIMITING = /^(?:zu|lange|langen|langer|viel|viele|vielen|grosse|grossen|ausufernde\w*|reine\w*)$/;

/** Methods a negated phrase rules out by name: "statt Lehrervortrag" → lehrervortrag, vortrag-prompts, … */
export function negatedMethods(folded: string): Set<string> {
  const out = new Set<string>();
  for (const m of folded.match(NEGATED_PHRASE) || []) {
    const words = m.split(/\s+/).slice(1);
    if (words.some((w) => LIMITING.test(w))) continue;
    for (const w of words) for (const [re, ids] of NEGATABLE_METHODS) if (re.test(w)) ids.forEach((id) => out.add(id));
  }
  return out;
}

export interface FmtMatcher {
  zuordnen(anfrage?: MatchRequest): MatchResult;
  /** `stufe`: bildungsstufe the caller already knows; decides whether university subjects are read. */
  lesen(text: string, stufe?: string): {
    kriterien: Record<string, unknown>;
    erkannt: Array<{ feld: string; wert: unknown; beleg: string }>;
    offen: string[];
    /** Subject named in the text, with its OEH URI (school subject or Destatis university subject). */
    fach?: DetectedSubject;
  };
  felder(): MatchFieldDef[];
  schema(): Record<string, unknown>;
}

/** A request the caller can fix: unknown field or value outside the vocabulary. */
export class FmtRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FmtRequestError';
  }
}

export function createMatcher(data: FmtData, validator: FmtValidator): FmtMatcher {
  const scheme = (id: string): Scheme => data.schemes.find((s) => s.id === id)!;
  const values = (s: Scheme): VocabValue[] => s.werte || (s.gruppen || []).flatMap((g) => g.werte);
  const group = (id: string, groupId: string): VocabValue[] =>
    (scheme(id).gruppen || []).find((g) => g.id === groupId)!.werte;
  const label = (id: string, code: string) => {
    const w = values(scheme(id)).find((x) => x.id === code);
    return w ? w.label : code;
  };
  const rang = new Map((scheme('reichweite').werte || []).map((w) => [w.id, w.rang ?? 0]));
  const techRank = new Map((scheme('technikbedarf').werte || []).map((w) => [w.id, w.rang ?? 0]));
  const implies = new Map((scheme('lernzustand').werte || []).map((w) => [w.id, w.impliziert || []]));
  const blocks: Map<string, Baustein> = new KennungIndex(data.bausteine.map((b) => [b.kennung, b] as const), data.weiterleitungen);
  const chains = new Map<string, Funktionskette>(data.ketten.map((k) => [k.id, k]));

  const closure = (states: string[]): Set<string> => {
    const set = new Set<string>();
    const stack = [...states];
    while (stack.length) {
      const s = stack.pop()!;
      if (!set.has(s)) {
        set.add(s);
        (implies.get(s) || []).forEach((x) => stack.push(x));
      }
    }
    return set;
  };
  const bestGrade = (b: Baustein): EvidenceGrade | null =>
    GRADE_ORDER.find((g) => (b.evidenz || []).some((e) => e.grad === g)) || null;
  const hasNegativeEvidence = (b: Baustein): boolean =>
    (b.evidenz || []).some((e) =>
      /bleibt\s+empirisch\s+deutlich\s+hinter|schneide(?:t|n)\b[^.]{0,60}\bschwächer\s+ab|g\s*≈\s*[−-]\s*0\./i.test(
        e.befund || ''
      )
    );
  const states = (codes?: string[]) => (codes || []).map((z) => label('lernzustand', z));
  const usesAi = (b: Baustein) => Boolean(b.ki) || (b.rolle || []).some((r) => AI_ROLES.has(r));

  const opts = (vals: VocabValue[]) => vals.map((w) => ({ code: w.id, label: w.label }));
  const FIELDS: MatchFieldDef[] = [
    { feld: 'text', typ: 'string', bedeutung: 'Anfrage in freiem Text; ausdrücklich gesetzte Felder haben Vorrang' },
    {
      feld: 'modus',
      typ: 'code',
      bedeutung: 'phase: Bausteine für eine Phase; ablauf: geprüfter Ablauf für einen Zieltyp',
      werte: [
        { code: 'phase', label: 'einzelne Phase' },
        { code: 'ablauf', label: 'Ablauf' }
      ]
    },
    {
      feld: 'zieltyp',
      typ: 'code',
      stufe: 1,
      bedeutung: 'Zieltyp des Ablaufs; legt die Funktionskette fest',
      werte: data.ketten.map((k) => ({ code: k.id, label: k.label }))
    },
    {
      feld: 'zielart',
      typ: 'code',
      stufe: 1,
      bedeutung: 'Art des Lernziels; daraus folgt der Zieltyp',
      werte: opts(group('aufgabenstruktur', 'wissensart'))
    },
    {
      feld: 'ansatz',
      typ: 'codes',
      stufe: 1,
      bedeutung: 'Bevorzugter didaktischer Ansatz / Lernform (z. B. problemorientiert, kooperativ, forschend)',
      werte: opts(values(scheme('ansatz')))
    },
    {
      feld: 'lernfunktion',
      typ: 'codes',
      stufe: 1,
      bedeutung: 'Was die Phase leisten soll',
      werte: opts(values(scheme('lernfunktion')))
    },
    {
      feld: 'anleitung',
      typ: 'codes',
      stufe: 2,
      bedeutung: 'Gewünschter Anleitungsgrad (explizit, geleitet, offen)',
      werte: opts(values(scheme('anleitung')))
    },
    {
      feld: 'engagement',
      typ: 'codes',
      stufe: 2,
      bedeutung: 'Gewünschter Engagementmodus (passiv, aktiv, konstruktiv, interaktiv)',
      werte: opts(values(scheme('engagement')))
    },
    {
      feld: 'interaktion',
      typ: 'codes',
      stufe: 2,
      bedeutung: 'Gewünschte Sozialform / Interaktion (Einzel, Partner, Kleingruppe, Plenum)',
      werte: opts(values(scheme('interaktion')))
    },
    {
      feld: 'reichweite',
      typ: 'codes',
      stufe: 2,
      bedeutung: 'Gewünschte Granularität / Reichweite (R1 Interaktion bis R4 Kurs)',
      werte: opts(values(scheme('reichweite')))
    },
    {
      feld: 'liefert',
      typ: 'codes',
      stufe: 1,
      bedeutung: 'Lernzustand, den der Baustein liefern soll',
      werte: opts(values(scheme('lernzustand')))
    },
    { feld: 'zeitMin', typ: 'integer', stufe: 2, bedeutung: 'Verfügbare Minuten: für die Phase oder als Zeitbudget des Ablaufs' },
    { feld: 'gruppe', typ: 'integer', stufe: 2, bedeutung: 'Größe der Lerngruppe' },
    {
      feld: 'variante',
      typ: 'integer',
      bedeutung: 'Nummer eines gleichwertigen alternativen Vorschlags (0 = Standard, 1 = nächster Vorschlag usw.)'
    },
    {
      feld: 'maxTechnik',
      typ: 'code',
      stufe: 2,
      bedeutung: 'Geräte, die höchstens verfügbar sind',
      werte: opts(values(scheme('technikbedarf')))
    },
    { feld: 'ohneInternet', typ: 'boolean', stufe: 2, bedeutung: 'Keine Internetverbindung' },
    { feld: 'ohneKI', typ: 'boolean', stufe: 2, bedeutung: 'Keine Bausteine mit KI' },
    { feld: 'maxVorbereitung', typ: 'integer', stufe: 2, bedeutung: 'Minuten für die erstmalige Vorbereitung' },
    {
      feld: 'raumzeit',
      typ: 'codes',
      stufe: 2,
      bedeutung: 'Ort und Zeit, die der Baustein erlauben muss',
      werte: opts(values(scheme('raumzeit')))
    },
    {
      feld: 'lernort',
      typ: 'code',
      stufe: 2,
      bedeutung: 'Raum der Stunde (Klassenraum, Sporthalle, Fachraum, draußen, Hörsaal); Methoden, die dort gut funktionieren, werden bevorzugt',
      werte: opts(values(scheme('lernort')))
    },
    {
      feld: 'vorhanden',
      typ: 'codes',
      stufe: 3,
      bedeutung: 'Lernzustände, die die Lerngruppe schon erreicht hat',
      werte: opts(values(scheme('lernzustand')))
    },
    {
      feld: 'vorwissen',
      typ: 'code',
      stufe: 4,
      bedeutung: 'Vorwissen zum Zielgegenstand',
      werte: opts(values(scheme('vorwissen')))
    },
    {
      feld: 'bildungsstufe',
      typ: 'code',
      stufe: 4,
      bedeutung: 'Bildungsstufe',
      werte: opts(values(scheme('bildungsstufe')))
    },
    {
      feld: 'fachbereich',
      typ: 'code',
      stufe: 4,
      bedeutung: 'Fächergruppe des Unterrichts; fachtypische Methoden werden bevorzugt, ungeeignete zurückgestellt',
      werte: opts(values(scheme('fachbereich')).filter((w) => w.id !== 'uebergreifend'))
    }
  ];

  const felder = () => FIELDS.map((f) => ({ ...f }));

  function schema() {
    const prop = (f: MatchFieldDef) => {
      const codes = f.werte ? f.werte.map((w) => w.code) : null;
      const base =
        f.typ === 'codes'
          ? { type: 'array', items: { enum: codes }, uniqueItems: true }
          : f.typ === 'code'
            ? { enum: codes }
            : f.typ === 'integer'
              ? { type: 'integer', minimum: 0 }
              : { type: f.typ };
      return Object.assign({ description: f.bedeutung }, base);
    };
    return {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: data.NS + 'anfrage.schema.json',
      title: 'FMT-Anfrage',
      type: 'object',
      additionalProperties: false,
      properties: Object.fromEntries(FIELDS.map((f) => [f.feld, prop(f)]))
    };
  }

  function check(a: MatchRequest) {
    Object.keys(a).forEach((key) => {
      const f = FIELDS.find((x) => x.feld === key);
      if (!f) throw new FmtRequestError(`Unbekanntes Feld „${key}“. Erlaubt: ${FIELDS.map((x) => x.feld).join(', ')}.`);
      if (f.typ === 'integer' && given(a[key]) && !(Number.isInteger(Number(a[key])) && Number(a[key]) >= 0)) {
        throw new FmtRequestError(`Feld „${key}“: erwartet wird eine ganze Zahl ab 0.`);
      }
      if (key === 'zeitMin' && given(a[key]) && Number(a[key]) > MAX_BUDGET_MIN) {
        throw new FmtRequestError(`Feld „zeitMin“: höchstens ${MAX_BUDGET_MIN} Minuten.`);
      }
      if (!f.werte) return;
      const allowed = f.werte.map((w) => w.code);
      list(a[key]).forEach((v) => {
        if (!allowed.includes(v)) {
          throw new FmtRequestError(`Feld „${key}“: unbekannter Wert „${v}“. Erlaubt: ${allowed.join(', ')}.`);
        }
      });
    });
  }

  const functionWords: Array<[string, string]> = values(scheme('lernfunktion'))
    .flatMap((w) => (w.alt || []).map((a): [string, string] => [fold(a), w.id]))
    .concat([
      ['wiederholen', 'konsolidierung'],
      ['uben', 'konsolidierung'],
      ['festigen', 'konsolidierung'],
      ['sichern', 'konsolidierung'],
      ['reflektieren', 'metakognition'],
      ['vorwissen aktivieren', 'orientierung'],
      ['motivieren', 'orientierung'],
      ['diagnose', 'diagnose'],
      ['lernstand', 'diagnose']
    ]);

  /** The action verb names the kind of lesson when no learning goal type is stated ("aushandeln" → judgement). */
  const VERB_CHAINS: Array<[RegExp, string]> = [
    [/\b(?:diskutier|debattier|beurteil|bewert|erorter|aushandel|abwag)\w*|\bstellung\s+(?:nehmen|beziehen)|\bstreit\w*\s+(?:in\s+der\s+klasse\s+)?(?:besprechen|klaren|schlichten)|\b(?:fake\s*news|falschmeldung\w*)\s+erkennen/, 'urteilsbildung'],
    [/\bfall(?:bearbeitung|arbeit|studie|analyse)\w*|\bfalle?\s+(?:losen|bearbeiten)/, 'problemloesen'],
    [/\bprojekt(?:tag|woche|arbeit|unterricht)\w*|\b(?:netzwerk|event|fest|ausflug|budget)\w*\s+planen\b/, 'projektlernen'],
    [/\b(?:ausprobier|erkund|untersuch|experimentier)\w*|\b(?:pflanzen|baume|tiere|vogel|gesteine|stoffe)\w*\s+(?:\w+\s+){0,3}bestimmen\b/, 'fuenf-e']
  ];
  /** Activity verbs that describe a whole lesson as well as a phase. */
  const ACTIVITY_WORD = /^(?:uben|ubt|wiederhol|festig|trainier|automatisier)/;
  /** Course stages that end in "-phase" but name no phase of a lesson. */
  const STAGE_PHASE = /\be-?phase\b|einfuhrungsphase|qualifikationsphase/g;
  /** Words that ask for one phase of a lesson. */
  const PHASE_WORD =
    /\b(?:einstieg\w*|eroffnung|sicherung\w*|abschluss\w*|ausstieg|warm-?up|aufwarm\w*|stundenbeginn|stundenende|\w*phase|zum\s+(?:beginn|ende|schluss)|am\s+(?:anfang|ende|schluss)|zu\s+beginn)\b/;

  const semantic = createSemanticClassifier(data);
  /** Fields whose rules read negations themselves ("ohne Tablets", "ohne Vorbereitung"); all others read the text without negated phrases. */
  const NEGATION_AWARE = new Set(['maxTechnik', 'ohneInternet', 'ohneKI', 'vorwissen', 'maxVorbereitung', 'anleitung', 'zeitMin', 'gruppe']);
  const stageOfGrade = (n: number) => (n <= 4 ? 'primar' : n <= 10 ? 'sek1' : 'sek2');
  const RULES: Array<[string, RegExp, (m: RegExpExecArray) => unknown]> = [
    // Multiplicative durations first (e.g. "2 x 45 Minuten", "3 × 45 min")
    ['zeitMin', /(\d{1,2})\s*[x×]\s*(\d{1,3})\s*(?:min\b|minuten)/, (m) => Number(m[1]) * Number(m[2])],
    ['zeitMin', /(\d{1,3})\s*(?:min\b|minuten)/, (m) => Number(m[1])],
    // Clock hours ("5 Zeitstunden") and English ("45 minutes") before school periods.
    ['zeitMin', /(\d{1,2})\s*(?:zeitstunden?|zeitstd\.?)(?=\W|$)/, (m) => Number(m[1]) * 60],
    ['zeitMin', /(\d{1,3})\s*minutes?\b/, (m) => Number(m[1])],
    ['zeitMin', /(\d{1,2})[.,]5\s*(?:unterrichts|schul)?stunden\b/, (m) => Math.round((Number(m[1]) + 0.5) * 60)],
    ['zeitMin', /(\d{1,2})\s*(?:unterrichts|schul)?stunden\b/, (m) => Number(m[1]) * 45],
    ['zeitMin', /doppelstunde/, () => 90],
    ['zeitMin', /\b(?:eine|einer|einzel|unterrichts|schul)\s?stunde\b/, () => 45],
    ['bildungsstufe', /(?:klasse|klassenstufe|jahrgang|jahrgangsstufe|jg\.?)\s*(\d{1,2})\b/, (m) => stageOfGrade(Number(m[1]))],
    ['bildungsstufe', /\b(\d{1,2})\.\s*(?:klasse|jahrgang)/, (m) => stageOfGrade(Number(m[1]))],
    ['bildungsstufe', /grundschul|primarstufe/, () => 'primar'],
    ['bildungsstufe', /sekundarstufe\s*(?:i|1)\b|sek\.?\s*(?:i|1)\b|mittelstufe|realschule|gesamtschule|hauptschule/, () => 'sek1'],
    [
      'bildungsstufe',
      /oberstufe|sekundarstufe\s*(?:ii|2)\b|sek\.?\s*(?:ii|2)\b|gymnasiale\s+oberstufe|\bq[12]\b|\be-?phase\b|einfuhrungsphase|qualifikationsphase|leistungskurs|grundkurs|\b(?:lk|gk)\b|\babitur\w*/,
      () => 'sek2'
    ],
    [
      'bildungsstufe',
      /berufsschul|berufsbildung|auszubildende|azubi|\blehrjahr\b|\w+ausbildung\b|\bausbildung\b|\blernfeld\b|fachinformatiker|kaufleute|kaufmann|kauffrau|mechatroniker|elektroniker|\w+fachleute\b|uberbetrieblich\w*/,
      () => 'berufsbildung'
    ],
    ['bildungsstufe', /\w*studium\b|\buni\b|\btutorium\b|studiengang|\bsemester\b/, () => 'hochschule'],
    // "Deutsch 6", "Sport 7:", "Year 8": a subject or "year" followed by a grade.
    [
      'bildungsstufe',
      /\b(?:mathe|mathematik|deutsch|englisch|franzosisch|spanisch|latein|bio|biologie|chemie|physik|geschichte|erdkunde|geografie|geographie|politik|sozialkunde|ethik|religion|informatik|wirtschaft|sport|kunst|musik|technik)\s+(\d{1,2})\b(?!\s*(?:[.,]\d|min\b|minute|stunde|std\b|schuler|kinder|lernende|sus\b|personen|teilnehm|studierende|azubi|auszubildende|students|pupils|aufgabe|monat|woche|tag|jahr|seite|punkt|euro|x\b|%))/,
      (m) => stageOfGrade(Number(m[1]))
    ],
    ['bildungsstufe', /\byear\s+(\d{1,2})\b(?!\s*(?:min|minute|stunde|students|pupils))/, (m) => stageOfGrade(Math.max(1, Number(m[1]) - 1))],
    [
      'bildungsstufe',
      /erwachsenenbildung|volkshochschul|\bvhs\b|weiterbildung|fortbildung|integrationskurs|\bsenior\w*|\b(?:fur|mit)\s+erwachsenen?\b|\berwachsene\s+(?:lernende|teilnehm\w*)|berufstatig\w*|mitarbeitend\w*|\blehrkrafte\b/,
      () => 'erwachsenenbildung'
    ],
    ['bildungsstufe', /hochschul|studierende|universitat|vorlesung|seminar/, () => 'hochschule'],
    // "3 Schüler mit Förderbedarf" or "davon 4 mit DaZ" names a subgroup, not the size of the group.
    [
      'gruppe',
      /(?<![\d])(?<!\b(?:davon|darunter)\s)(\d{1,3})\s*(?:schuler\w*|lernende\w*|personen|teilnehme\w*|studierende\w*|kinder|sus|azubis?|auszubildende\w*|lehrkrafte|mitarbeitende\w*|students|pupils)\b(?!\s+(?:mit|haben|brauchen|benotigen|sind)\s+(?:\w+\s+)?(?:forder\w*|sonderpad\w*|daz|lrs|adhs|ads|autis\w*|asthma|behinder\w*|beeintracht\w*|einschrank\w*|lernschwier\w*|sprachforder\w*|migrations\w*|fluchterfahrung|inklusion\w*|forderschwerpunkt\w*|unterstutzung|hilfe\w*|forderung))(?!\s+(?:hochbegabt|leistungsstark|leistungsschwach|langsam|schnell)\w*)/,
      (m) => Number(m[1])
    ],
    ['vorwissen', /(?:kein|keine|wenig|kaum|gering\w*)\s+(?:vorwissen|vorkenntnis\w*)|ohne\s+(?:vorwissen|vorkenntnis\w*)|anfanger/, () => 'gering'],
    ['vorwissen', /(?:viel|gut\w*|hoh\w*|solide\w*)\s+(?:vorwissen|vorkenntnis\w*)|fortgeschritten/, () => 'hoch'],
    ['vorwissen', /(?:etwas|mittler\w*)\s+(?:vorwissen|vorkenntnis\w*)|grundkenntnis/, () => 'mittel'],
    [
      'maxTechnik',
      /(?:ohne|keine?)\s+(?:digitale\s+)?(?:gerate|endgerate|technik|tablets?|ipads?|laptops?|computer|medien)\b|ohne\s+digitale\s+\w+|nur\s+(?:tafel|papier)|\banalog\b/,
      () => 't-keine'
    ],
    ['maxTechnik', /tablets?\b|laptops?\b|ipads?\b|computerraum|endgerat/, () => 't-einzeln'],
    ['maxTechnik', /beamer|projektor|smartboard|digitale\s+tafel/, () => 't-projektion'],
    ['ohneInternet', /ohne\s+(?:internet|wlan|netz)|kein\s+(?:internet|wlan)|offline/, () => true],
    ['ohneKI', /ohne\s+ki\b|keine\s+ki\b/, () => true],
    // A check in this lesson; preparing for a test later ("Klassenarbeit vorbereiten") is none.
    ['liefert', LEISTUNGSKONTROLLE, () => ['lernstand-diagnostiziert']],
    // Subject area from the subject named in the text. Order matters: the first rule that matches wins.
    // Subject nouns only: adjectives ("französische Revolution") and everyday words ("Pflege von …") are no subject.
    ['fachbereich', /\bberufsschul\w*|\bberufskolleg\b|\bausbildung\b|\bauszubildende\w*|\bazubis?\b|\blernfeld\w*|\bpflege(?:schule|ausbildung|fachkr\w*|kurs)\b|\bpraxisanleit\w*|\bunterweisung\b|\blehrjahr\b|\w+ausbildung\b|kaufleute|kaufmann|kauffrau|restaurantfach\w*|fachinformatiker|mechatroniker|elektroniker|friseur\w*|\berste[-\s]hilfe\w*|uberbetrieblich\w*/, () => 'beruf-praxis'],
    ['fachbereich', /\bsport(?:unterricht|stunde)?\b|\bschwimmunterricht\b|\byoga\b|\bpilates\b|\bfitnesskurs\b/, () => 'sport'],
    ['fachbereich', /\bkunst(?:unterricht)?\b|\bmusik(?:unterricht)?\b|\bdarstellendes\s+spiel\b|\btheater(?:unterricht|-ag)\b|\bwerkunterricht\b|\btextiles\s+gestalten\b/, () => 'aesthetik'],
    ['fachbereich', /\b(?:deutsch|englisch|franzosisch|spanisch|latein|italienisch|russisch)(?:unterricht|stunde)?\b(?!-)|(?<!\b(?:mit|haben|hat|und|oder|viele|einige|mehrere|wenige|\d+)\s)(?<!,\s)\bda[zf]\b(?!-?\s?(?:kind|schuler|lernend|sus\b|anteil|hintergrund))(?!\s+(?:und|oder)\s)|\bfremdsprach\w*/, () => 'sprachen'],
    ['fachbereich', /\bmathe(?:matik)?(?:unterricht|stunde)?\b|\binformatik(?:unterricht)?\b|\bgeometrie\b|\balgebra\b|\beinmaleins\b|\banalysis\b|\blineare\s+algebra\b|\bstatistik\b|\bmaths?\b/, () => 'mathe-informatik'],
    ['fachbereich', /\b(?:physik|chemie|biologie|bio)(?:unterricht|stunde)?\b|\bnaturwissenschaft\w*|\bnawi\b|\bsachunterricht\b|\bastronomie\b|\btechnik\s+klasse\b|\btechnikunterricht\b|\bmedizin(?!ethik)\w*|\btechnische\s+mechanik\b|\bingenieur\w*|\b(?:biology|chemistry|physics|science)\b/, () => 'nawi-technik'],
    ['fachbereich', /\bgeschichte\b(?!\s+(?:schreiben|erzahlen|lesen))|\bgeschichtsunterricht\b|\bpolitik(?:unterricht)?\b|\bsozialkunde\b|\bgemeinschaftskunde\b|\bgesellschaftslehre\b|\berdkunde\b|\bgeogra(?:f|ph)ie\b|\bwirtschaft(?:slehre|skunde)?\b|\bethik(?:unterricht)?\b|\breligion(?:sunterricht|slehre)?\b|\bphilosophie(?:unterricht)?\b|\bsowi\b|\bjura\b|\brechtswissenschaft\w*|\bbwl\b|\bvwl\b|\bhistory\b/, () => 'gesellschaft'],
    ['maxVorbereitung', /ohne\s+vorbereitung|sofort\s+einsetzbar|spontan/, () => 5],
    ['maxVorbereitung', /wenig\s+vorbereitung|kurz\w*\s+vorbereitung/, () => 15],
    ['raumzeit', /asynchron|selbstlernphase/, () => ['asynchron']],
    ['raumzeit', /online|distanz|videokonferenz|fernunterricht/, () => ['distanz']],
    // The room must be named as a place ("im Labor", "auf dem Schulhof"); "Wortschatz in der Küche" or "Tiere im Wald" is a topic.
    ['lernort', /\bim\s+klassen(?:raum|zimmer)\b|\bsporttheorie\b|\btheoriestunde\b/, () => 'klassenraum'],
    ['lernort', /\bhorsaal\w*|(?<!\bzur\s)\bvorlesung\b(?!\s+(?:vor|nach)\w*)/, () => 'hoersaal'],
    ['lernort', /\b(?:turn|sport|gymnastik)halle\b|\bin\s+der\s+halle\b|\bsportplatz\b|\bgymnastikraum\b/, () => 'bewegungsraum'],
    [
      'lernort',
      /\bim\s+(?:chemie|physik|bio(?:logie)?|fach)?(?:labor|fachraum|werkraum|ubungsraum|praxisraum|musikraum|makerspace)\b|\bin\s+der\s+(?:lehr|schul)?(?:werkstatt|ubungswerkstatt)\b|\blehrwerkstatt\b|\b(?:lehr|schul)kuche\b|\bskills?\s*-?lab\b|\blaborpraktikum\b|\ban\s+ubungskopf\w*|\ban\s+der\s+puppe\b/,
      () => 'fachraum'
    ],
    [
      'lernort',
      /\bdraussen\b(?!\s+und\s+drinnen)|\bauf\s+dem\s+schulhof\b|\bim\s+freien\b|\bim\s+schulgarten\b|\bunterrichtsgang\b|\bausserschulisch\w*\s+lernort\w*|\b(?:auf|bei)\s+(?:der|einer)\s+exkursion\b/,
      () => 'draussen'
    ],
    ['anleitung', /\b(?:offen-?entdeckend\w*|offen\w*\s+entdeck\w*|frei\s+erkund\w*|ohne\s+vorgaben)\b/, () => ['offen']],
    ['anleitung', /\b(?:explizit\w*|kleinschrittig\w*|stark\s+gefuhrt\w*|direkt\s+angeleitet\w*)\b/, () => ['explizit']],
    ['anleitung', /\b(?:geleitet\w*|mit\s+hilfekarten|scaffolding|mit\s+leitfragen)\b/, () => ['geleitet']],
    ['interaktion', /\b(?:einzelarbeit|stillarbeit|allein\w*\s+arbeiten)\b/, () => ['einzel']],
    ['interaktion', /\b(?:partnerarbeit|zu\s+zweit|tandem|paarweise)\b/, () => ['partner']],
    ['interaktion', /\b(?:kleingruppe\w*|gruppenarbeit|teamarbeit|tischgruppe\w*)\b/, () => ['kleingruppe-kooperativ']],
    ['interaktion', /\b(?:plenum|unterrichtsgesprach|ganze\s+klasse)\b/, () => ['plenum-lehrergeleitet']],
    ['engagement', /\b(?:interaktiv\w*|miteinander\s+diskutier\w*|gegenseitig\s+erklar\w*)\b/, () => ['interaktiv']],
    ['engagement', /\b(?:konstruktiv\w*|selbst\s+erstell\w*|eigen\w*\s+produkt)\b/, () => ['konstruktiv']],
    ['reichweite', /\b(?:warm-?up|kurzer?\s+einstieg|kurze\s+aktivierung|blitzlicht|5-?10\s*min)\b/, () => ['r1']],
    ['reichweite', /\b(?:ganzer?\s+kurs|halbjahr|schuljahr|lehrgang)\b/, () => ['r4']],
    ['zieltyp', /\bpbl\b|siebensprung|problemorientiert\w*\s+lernen|problembasiert\w*\s+lernen/, () => 'pbl-siebensprung'],
    ['zieltyp', /projektbasiert\w*|projektlernen|projektarbeit|handlungsorientiert\w*\s+projekt/, () => 'projektlernen'],
    ['zieltyp', /direkte?\s+instruktion|explicit\s+teaching|rosenshine/, () => 'direkte-instruktion'],
    ['zieltyp', /kooperatives?\s+lernen\s+(?:reihe|einheit|stunde|doppelstunde|ablauf)/, () => 'kooperatives-lernen'],
    ['zieltyp', /problemlos|probleme?\s+losen|offene\s+aufgabe|transferaufgabe/, () => 'problemloesen'],
    ['zieltyp', /\b5\s?e\b|forschend/, () => 'fuenf-e'],
    ['zieltyp', /\bfaktenwissen\b/, () => 'faktenwissen'],
    // Debate words only: plain "diskutieren" or "Diskussion" describe a moment in any lesson, not its goal.
    [
      'zieltyp',
      /urteilsbildung|\bdebatt\w*|streitfrage|\bpro\W+(?:und\W+)?contra\b|\bkontrovers\w*|podiumsdiskussion|fishbowl/,
      () => 'urteilsbildung'
    ],
    // Endurance, strength or fitness training follows the training chain, not "demonstrate – practise – apply".
    [
      'zieltyp',
      /\b(?:ausdauer|kondition|kraft|fitness|intervall|zirkel)\w*training\b|\bausdauer(?:lauf|leistung|fahigkeit)?\b|\bdauerlauf\w*|\bkondition(?:straining|sschulung)?\b|\bcooper-?test\b|\bfitnesskurs\b/,
      () => 'kondition-training'
    ],
    // A product must be named: "schreiben", "zeichnen" or "gestalten" alone are everyday verbs.
    [
      'zieltyp',
      /\b(?:erorterung|aufsatz|aufsatze|essay|kurzgeschichte|gedicht|bericht|brief|text|sachtext|geschichte|zusammenfassung|inhaltsangabe|rezension|kommentar|reportage|leserbrief|bewerbung)\w*\s+(?:schreiben|verfassen)\b|programmier\w*|\b(?:perspektive|portrat|stillleben|bild|comic|skizze|landschaft)\w*\s+(?:zeichnen|malen)\b|\bkomponieren\b|\b(?:plakat|poster|podcast|film|video|collage|website|erklarvideo|flyer|logo|buhnenbild)\w*\s+(?:erstellen|produzieren|drehen|bauen|gestalten|entwerfen)\b|\b(?:collage|erzahlung|fantasiegeschichte|bildergeschichte|portrat|skulptur|plastik|modell|werkstuck|vogelhaus|comment|essay|kommentar)\w*(?:\s+[\w-]+){0,4}?\s+(?:schreiben|verfassen|gestalten|bauen|basteln|formen|malen|zeichnen|entwerfen)\b/,
      () => 'produktion'
    ],
    [
      'zielart',
      /\b(?:volleyball|basketball|handball|fussball|badminton|tischtennis|turnen|schwimmen|leichtathletik|weitsprung|hochsprung|kugelstossen|sprint|zuspiel|aufschlag|wurftechnik|bewegungsablauf|bewegungsfolge|tanz(?:en|choreografie)?)\b|\b(?:ausdauer|kondition|kraft|fitness|zirkel|lauf|intervall|koordinations|zirkel)training\b|\bausdauer(?:lauf|leistung|fahigkeit)?\b|\bdauerlauf\w*|\bkoordination\w*|\baufwarm\w*|\bkleine\s+spiele\b|\bstaffel(?:lauf|spiele?)?\b|\bzirkeltraining\b|\b(?:klatsch|trommel|musizier)\w*|\bbodypercussion\b|\bsingen\b|\b(?:instrument|gitarre|klavier|flote|blockflote|keyboard)\w*\s+spielen\b|\bhandgriff\w*|\b(?:in\s+der\s+werkstatt|praktisch)\s+uben\b|\bmontier\w*|\bvier-?stufen-?methode\b|\bpflegehandlung\w*|\bblutdruck\s+messen\b|\berste[-\s]hilfe\w*|\breanimation\b|\bhaare\s+schneiden\b|\b(?:zubereiten|backen|loten|feilen|bohren|mikroskopier\w*|servieren|eindecken|einstudieren)\b|\b(?:holz|metall|brett|leiste)\w*\s+(?:\w+\s+)?sagen\b|\bnahmaschine\w*|\b(?:gericht|suppe|rezept|menu)\w*\s+(?:\w+\s+)?kochen\b|\bkoch(?:praxis|kurs|unterricht)\b|\b(?:seitenlage|herzdruckmassage|handedesinfektion|ballgewohnung|yoga|pilates)\b|\b(?:an\s+ubungskopfen|am\s+modell\s+uben|an\s+der\s+puppe)\b|\blied\w*\s+singen\b/,
      () => 'psychomotorik'
    ],
    ['zielart', /verfahren|rechnen|fertigkeit|prozedur|algorithmus|schrittfolge|kommasetzung|rechtschreib|\b(?:addier|subtrahier|multiplizier|dividier|vereinfach|umform)en\b|\b(?:bruch\w*|terme?)\s+(?:\w+\s+)?kurzen\b|schaltplan\w*\s+lesen/, () => 'prozeduren'],
    ['zielart', /fakten|vokabel|auswendig|merkwissen|einpragen|jahreszahlen|einmaleins|automatisier/, () => 'fakten'],
    ['zielart', /konzept|begriff\w*\s+verstehen|verstandnis|verstehen|zusammenhang/, () => 'konzepte'],
    [
      'modus',
      /\b(?:unterrichts)?reihe\b|\b(?:unterrichts|lern)?einheit\b|\bsequenz\b|\bwochen\b|unterrichtsvorhaben|mehrere\s+stunden|doppelstunde|einzelstunde|unterrichtsstunde|schulstunde|\b(?:lern)?modul\b|\b(?:stunden|unterrichts)?ablauf\b|seminar\b|vorlesung\b|workshop\b|online-?kurs\b|sitzung\b/,
      () => 'ablauf'
    ]
  ];

  // Multi-value approach rules covering ALL 12 FMT ansatz codes + all 22 common "… Lernen" approaches (incl. Lernen durch Lehren)
  const ANSATZ_RULES: Array<[string, RegExp]> = [
    [
      'forschend',
      /problemorientiert\w*|problembasiert\w*|forschend\w*|entdeckend\w*|experiment\w*|\bhypothesen?\b|situationsorientiert\w*|kompetenzorientiert\w*|konstruktivistisch\w*|handlungsorientiert\w*/
    ],
    [
      'kooperativ',
      /kooperativ\w*|kollaborativ\w*|lernen\s+durch\s+lehren|\bldl\b|gruppenarbeit|partnerarbeit|teamarbeit|peer-?learning|jigsaw|gruppenpuzzle|dialogisch\w*/
    ],
    [
      'instruktion',
      /instruktionsorientiert\w*|direkte?\s+instruktion|lehrervortrag|explizit\w*\s+instruktion|darbietend\w*|vormachen/
    ],
    [
      'offen',
      /offene\w*\s+unterricht|freiarbeit|stationen|werkstatt|wochenplan|projektbasiert\w*|projektorientiert\w*|projektarbeit|selbstgesteuert\w*|individualisiert\w*|lernen\s+durch\s+lehren|\bldl\b/
    ],
    [
      'spiel-simulation',
      /spielerisch\w*|simulationsbasiert\w*|erfahrungsbasiert\w*|handlungsorientiert\w*|situationsorientiert\w*|gamification|planspiel|rollenspiel|simulation|\b(?:lern)?spiele?\b|quizspiel/
    ],
    ['diskurs', /debatt\w*|diskurs\w*|dialogisch\w*|diskussion|pro-?contra|streitgesprach|argumentier\w*/],
    ['kreativ', /kreativ\w*|brainstorming|ideen\s+sammeln|erfinden|design\s+thinking|geschichten\s+schreiben/],
    ['visualisierung', /visualisier\w*|mindmap|mind-?map|concept-?map|plakat|sketchnote\w*|schaubild|diagramm|strukturlegen/],
    ['uebung', /intensiv\w*\s+uben|trainier\w*|automatisier\w*|abrufubung|rechenverfahren\s+uben|festigen/],
    ['diagnose-feedback', /diagnose|lernstand\w*|kurztest|abfrage|peer-?feedback|ruckmeldung\s+einholen|kompetenzorientiert\w*|individualisiert\w*/],
    ['reflexion', /reflexion|reflexiv\w*|reflektier\w*|selbstreguliert\w*|selbstgesteuert\w*|erfahrungsbasiert\w*|lerntagebuch|portfolio|selbsteinschatzung|lernprozess\s+bilanzier/],
    ['digital-ki', /digital\w*\s+lern\w*|ki-?tutor|ki-?gestutzt|podcast|erklarvideo|stop-?motion|wiki\b|interaktiv\w*\s+whiteboard/]
  ];

  const subjects = createSubjectDetector(data.faecher);

  function lesen(text: string, stufe?: string) {
    const t = fold(text || '');
    const kriterien: Record<string, unknown> = {};
    const erkannt: Array<{ feld: string; wert: unknown; beleg: string }> = [];
    const take = (feld: string, wert: unknown, beleg: string) => {
      if (!(feld in kriterien)) {
        kriterien[feld] = wert;
        erkannt.push({ feld, wert, beleg });
      }
    };
    // "keine Gruppenarbeit" or "ohne Experimente" rules something out: such a phrase must not select it.
    const tPos = withoutNegated(t);
    RULES.forEach(([feld, re, fn]) => {
      const m = re.exec(NEGATION_AWARE.has(feld) ? t : tPos);
      if (m) take(feld, fn(m), m[0].trim());
    });

    // Collect all matched approaches (multi-label!)
    const ansatzHits: Array<{ code: string; beleg: string }> = [];
    for (const [code, re] of ANSATZ_RULES) {
      const m = re.exec(tPos);
      if (m && !ansatzHits.some((x) => x.code === code)) {
        ansatzHits.push({ code, beleg: m[0].trim() });
      }
    }
    if (ansatzHits.length) {
      take(
        'ansatz',
        ansatzHits.map((x) => x.code),
        ansatzHits.map((x) => x.beleg).join(', ')
      );
    }

    const fns: Array<{ code: string; beleg: string; at: number }> = [];
    functionWords.forEach(([word, code]) => {
      const m = new RegExp('\\b' + word + '\\w*').exec(tPos);
      if (m && !fns.some((x) => x.code === code)) fns.push({ code, beleg: m[0], at: m.index });
    });
    if (fns.length) {
      fns.sort((x, y) => x.at - y.at);
      take('lernfunktion', fns.map((x) => x.code), fns.map((x) => x.beleg).join(', '));
    }

    // Zero-LLM semantic scale fallback (BM25 + German trigrams) for casual phrasings missed by exact regexes
    if (t.length >= 12) {
      const sem = semantic.classifyScales(tPos);
      const topAnsatz = sem.scales.ansatz[0];
      const forbidDigitalKi =
        Boolean(kriterien.ohneInternet) || Boolean(kriterien.ohneKI) || kriterien.maxTechnik === 't-keine';
      const forbidKooperativ =
        kriterien.gruppe === 1 || list(kriterien.interaktion).includes('einzel');
      if (
        !('ansatz' in kriterien) &&
        topAnsatz &&
        topAnsatz.score >= 0.55 &&
        !(forbidDigitalKi && topAnsatz.code === 'digital-ki') &&
        !(forbidKooperativ && topAnsatz.code === 'kooperativ')
      ) {
        take('ansatz', [topAnsatz.code], `semantisch: ${topAnsatz.label}`);
      }
      if (
        !('lernfunktion' in kriterien) &&
        !('zieltyp' in kriterien) &&
        !('zielart' in kriterien) &&
        !('modus' in kriterien) &&
        sem.scales.lernfunktion[0] &&
        sem.scales.lernfunktion[0].score >= 0.65
      ) {
        take('lernfunktion', [sem.scales.lernfunktion[0].code], `semantisch: ${sem.scales.lernfunktion[0].label}`);
      }
      if (!('anleitung' in kriterien) && sem.scales.anleitung[0] && sem.scales.anleitung[0].score >= 0.72) {
        take('anleitung', [sem.scales.anleitung[0].code], `semantisch: ${sem.scales.anleitung[0].label}`);
      }
      // Generic matrix-to-guidance feedback: strong structural support needs (e.g. ADHS, LRS, Förderbedarf) imply explicit guidance
      if (!('anleitung' in kriterien)) {
        const matrixTraits = detectMatrixTraitsFromText(text);
        if (
          matrixTraits.selectedValues.strukturierung === 'strukturierung-stark' ||
          matrixTraits.matrixScore?.didacticProfile.preferredGuidance === 'explizit'
        ) {
          const triggers = matrixTraits.signals.map((s) => s.trigger).slice(0, 2).join(', ');
          take('anleitung', ['explizit'], `Matrix-Signal (${triggers || 'stark strukturiert'})`);
        }
      }
    }

    // The OEH vocabularies name the subject itself (for the WLO search) and cover subjects the rules above do not know.
    const fach = subjects.erkenne(text || '', stufe || (kriterien.bildungsstufe as string | undefined)) || undefined;
    if (fach && fach.fachbereich !== 'uebergreifend') {
      // The detector only reports a subject the text frames as such ("Biologie Klasse 8"), so it beats a rule
      // that fired on a subject word inside the topic ("Sport und Ernährung").
      delete kriterien.fachbereich;
      const stale = erkannt.findIndex((e) => e.feld === 'fachbereich');
      if (stale >= 0) erkannt.splice(stale, 1);
      take('fachbereich', fach.fachbereich, fach.beleg);
    }

    const offen = FIELDS.filter((f) => f.stufe && !(f.feld in kriterien))
      .map((f) => f.feld)
      .filter((f) => !(f === 'zieltyp' && 'zielart' in kriterien) && !(f === 'zielart' && 'zieltyp' in kriterien));
    return fach ? { kriterien, erkannt, offen, fach } : { kriterien, erkannt, offen };
  }

  function rahmen(b: Baustein, a: MatchRequest): string | null {
    if (given(a.zeitMin) && b.dauerMin > Number(a.zeitMin)) return `braucht mindestens ${b.dauerMin} min`;
    if (given(a.gruppe) && Number(a.gruppe) < b.gruppeMin) return `erst ab ${b.gruppeMin} Personen`;
    if (given(a.gruppe) && Number(a.gruppe) > b.gruppeMax) return `höchstens ${b.gruppeMax} Personen`;
    if (given(a.maxTechnik) && (techRank.get(b.technik) ?? 0) > (techRank.get(String(a.maxTechnik)) ?? 0)) {
      return `braucht: ${label('technikbedarf', b.technik)}`;
    }
    if (a.ohneInternet && b.internet) return 'braucht Internet';
    if (a.ohneKI && usesAi(b)) return 'setzt KI ein';
    if (given(a.maxVorbereitung) && b.vorbereitungMin > Number(a.maxVorbereitung)) {
      return `Vorbereitung etwa ${b.vorbereitungMin} min`;
    }
    const missing = list(a.raumzeit).filter((v) => !(b.raumzeit || []).includes(v));
    if (missing.length) return `nicht vorgesehen für: ${missing.map((v) => label('raumzeit', v)).join(', ')}`;
    return null;
  }

  const hasSekHochschuleOnlyEvidence = (b: Baustein): boolean => {
    const scopes = (b.evidenz || []).map((e) => fold(e.geltung || '')).filter(Boolean);
    if (!scopes.length) return false;
    return scopes.every(
      (s) =>
        /(?:sekundarstufe|oberstufe|hochschule|universitat|berufsbildung|erwachsenenbildung|ab\s+sek)/.test(s) &&
        !/(?:\bschule\b|primar|grundschul|alle\s+stufen|facherubergreifend|klasse\s*[1-4])/.test(s)
    );
  };

  function passung(b: Baustein, a: MatchRequest): string[] {
    const w: string[] = [];
    if (a.vorwissen && b.geeignetBeiVorwissen && !b.geeignetBeiVorwissen.includes(a.vorwissen)) {
      w.push(`Für Vorwissen „${label('vorwissen', a.vorwissen)}“ nicht vorgesehen (Expertise-Reversal).`);
    }
    if (a.bildungsstufe && (b.ungeeignetBeiStufe || []).includes(a.bildungsstufe)) {
      w.push(`Für die Bildungsstufe „${label('bildungsstufe', a.bildungsstufe)}“ spricht die Evidenz dagegen.`);
    } else if (a.bildungsstufe === 'primar' && hasSekHochschuleOnlyEvidence(b)) {
      w.push('Evidenz-Geltungsbereich beschränkt sich auf Sekundarstufe/Hochschule (für Primarstufe prüfen).');
    }
    return w;
  }

  // Fully generic, metadata-driven domain inference (derived from each method's own catalog text – zero hardcoded ID lists)
  type InferredDomain = 'language-text' | 'media-sources' | 'drama-stage' | 'icebreaker' | null;
  const methodDomain = new Map<string, InferredDomain>();
  for (const b of data.bausteine) {
    const blob = fold([b.name, ...(b.alternativname || []), b.kurzbeschreibung, b.problem || '', ...(b.durchfuehrung || [])].join(' '));
    let dom: InferredDomain = null;
    if (
      /\b(?:diktat|rechtschreibkontrolle|laufdiktat|lautlese\w*|tandemlesen|chorlesen|lesetagebuch|lekturebegleitend|schreibkonferenz|chorsprechen|nachsprechubung|worterwiese|sq3r|exzerpier\w*|fachtext\s+in\s+kurze\s+abschnitte)\b/.test(
        blob
      )
    ) {
      dom = 'language-text';
    } else if (/\b(?:quellenkritik|faktencheck|lateral\s+reading|quellen-?\s*(?:und|&)\s*informationsprufung)\b/.test(blob)) {
      dom = 'media-sources';
    } else if (/\b(?:stegreiftheater|forumtheater|improvisationstheater|standbild\w*)\b/.test(blob)) {
      dom = 'drama-stage';
    } else if (/\b(?:marshmallow|autogrammjagd|kennenlernspiel|icebreaker)\b/.test(blob)) {
      dom = 'icebreaker';
    }
    methodDomain.set(b.kennung, dom);
  }

  let currentRawText = '';
  let currentSemanticScores = new Map<string, number>();
  let currentMentions = new Set<string>();
  let currentAnchorStep = new Map<string, number>();
  let currentStepIndex = -1;
  let currentSeed = '';
  let currentVariante = 0;
  let currentTechAsked = false;
  let currentArea = '';
  /** Interaction forms the request rules out ("keine Gruppenarbeit"). */
  let currentNegatedInteractions = new Set<string>();
  /** Methods the request rules out by name ("kein Lehrervortrag"). */
  let currentNegatedMethods = new Set<string>();
  /** The chain trains a movement or hands-on skill: classroom methods do not fit its main phases. */
  let currentPraxis = false;
  /** The approach was only guessed from loose wording: a method without it loses less. */
  let currentGuessedAnsatz = false;
  /** Room of the lesson: stated, or derived from the subject (sport → movement space). */
  let currentLernort = '';
  /** Didactic role of the chain step being filled; a check step ('pruefung') may stay seated. */
  let currentStepRole: 'haupt' | 'rand' | 'sicherung' | 'pruefung' | '' = '';
  const mentionDetector = createMentionDetector(data);
  type Ranked = { b: Baustein; hard: number[]; soft: number };
  const order = (items: Ranked[], tolerance?: number): Baustein[] =>
    pickOrder(
      items.map((x) => ({ item: x.b, id: x.b.kennung, hard: x.hard, soft: x.soft })),
      currentSeed,
      currentVariante,
      tolerance
    );
  const needsUnaskedTech = (b: Baustein) =>
    !currentTechAsked && (Boolean(b.internet) || usesAi(b) || (techRank.get(b.technik) ?? 0) >= (techRank.get('t-geteilt') ?? 2));

  function domainPenalty(b: Baustein): number {
    const raw = currentRawText;
    if (!raw) return 0;
    const dom = methodDomain.get(b.kennung);
    if (!dom) return 0;
    if (dom === 'language-text') {
      const isLanguageOrText =
        /\b(?:deutsch|lesen|lese\w*|fachtext|sachtext|schreib\w*|aufsatz|diktat|rechtschreib\w*|vokabel\w*|sprach\w*|englisch|franzosisch|spanisch|latein|daz|lekture|buch|gedicht|geschichte\s+schreiben|dialog\w*)\b/.test(
          raw
        );
      return isLanguageOrText ? 0 : 1;
    }
    if (dom === 'media-sources') {
      const isMediaOrHumanities =
        /\b(?:quelle\w*|medien\w*|fake|faktencheck|geschichte|politik|gesellschaft|sozialkunde|ethik|debatt\w*|argument\w*|journalis\w*|nachricht\w*|ki-?kompetenz|recherche|demokratie|gewaltenteilung|weimar)\b/.test(
          raw
        );
      return isMediaOrHumanities ? 0 : 1;
    }
    if (dom === 'drama-stage') {
      const isDramaRelevant =
        /\b(?:theater|darstell\w*|szene\w*|rolle\w*|rollenspiel|kommunikation|angehorig\w*|ethik|deutsch|englisch|politik|geschichte|sozial\w*|konflikt|demokratie|pflege)\b/.test(
          raw
        );
      return isDramaRelevant ? 0 : 1;
    }
    if (dom === 'icebreaker') {
      const isIcebreakerRelevant = /\b(?:kennenlern\w*|teambuild\w*|icebreaker|warm-?up|design\s+thinking|prototyp\w*)\b/.test(raw);
      return isIcebreakerRelevant ? 0 : 1;
    }
    return 0;
  }

  /** Movement, hands-on or practice method: fits a gym, a workshop or a practice room. */
  const isPraxisMethod = (b: Baustein) =>
    (b.aufgabe || []).includes('psychomotorik') ||
    (b.repraesentation || []).includes('enaktiv') ||
    (b.fachbereich || []).some((f) => f === 'sport' || f === 'beruf-praxis');

  /** Whether a method works in the lesson's room: stated in the data, otherwise derived from its other facets. */
  const MOVES_AROUND = /bewegung|freie\s+flache|\blaufweg\w*|freie\s+linie|\bvier\s+ecken\b|aussengelande|spielflache|zwei\s+(?:stuhl)?kreise/;
  const OUTSIDE = /aussen|natur|gelande|ausserschulisch|schulhof|draussen|freien|betrieb|museum/;
  function fitsRoom(b: Baustein, ort: string): boolean {
    if (b.lernort?.length) return b.lernort.includes(ort);
    const raum = fold(String(b.raum || ''));
    switch (ort) {
      case 'bewegungsraum':
      case 'fachraum':
        return isPraxisMethod(b);
      case 'draussen':
        return isPraxisMethod(b) || OUTSIDE.test(raum) || (b.ansatz || []).includes('forschend');
      case 'hoersaal':
        return !(b.aufgabe || []).includes('psychomotorik') && !MOVES_AROUND.test(raum);
      default:
        return true;
    }
  }

  function rankOf(
    b: Baustein,
    a: MatchRequest,
    wantedFunctions: string[],
    extra = 0,
    maxStepMin?: number,
    varietyPenalty = 0,
    hardCapMin?: number
  ): Ranked {
    const misses = (wanted: string[], has: string[] | undefined) =>
      wanted.length === 0 || wanted.some((code) => (has || []).includes(code)) ? 0 : 1;
    const wantedGuidance = list(a.anleitung);
    const wantedRange = list(a.reichweite);
    const softFilterMisses =
      misses(wantedGuidance, b.anleitung) +
      (wantedGuidance.includes('explizit') && (b.interaktion || []).includes('kleingruppe-unstrukturiert') ? 1 : 0) +
      misses(list(a.interaktion), b.interaktion) +
      misses(list(a.engagement), b.engagement) +
      (wantedRange.length === 0 || wantedRange.includes(b.reichweite) ? 0 : 1);
    return {
      b,
      // Hard tiers: reaching the step target / reuse, fit warnings, negative evidence, domain mismatch.
      // Last tier: the method's minimum duration does not fit into what is left of the lesson.
      hard: [
        extra,
        // The request rules out the only interaction form the method has ("keine Gruppenarbeit").
        ((b.interaktion || []).length && (b.interaktion || []).every((x) => currentNegatedInteractions.has(x))) ||
        currentNegatedMethods.has(b.kennung)
          ? 1
          : 0,
        passung(b, a).length ? 1 : 0,
        hasNegativeEvidence(b) ? 1 : 0,
        domainPenalty(b) ||
          (currentArea && (b.fachbereichUngeeignet || []).includes(currentArea) ? 1 : 0) ||
          // Without another room the lesson is in a classroom: a method that needs a gym or the outdoors does not fit.
          ((!currentLernort || currentLernort === 'klassenraum' || currentLernort === 'hoersaal') &&
          (b.lernort || []).length &&
          !b.lernort!.includes('klassenraum') &&
          !b.lernort!.includes(currentLernort || 'klassenraum')
            ? 1
            : 0),
        // Graded: when nothing fits the rest of the lesson, the method that overshoots least comes first.
        hardCapMin != null && b.dauerMin > hardCapMin ? Math.ceil((b.dauerMin - hardCapMin) / 5) : 0
      ],
      soft: softScore({
        ansatzMiss: !currentGuessedAnsatz && misses(list(a.ansatz), b.ansatz) === 1,
        softFilterMisses: softFilterMisses + (currentGuessedAnsatz ? misses(list(a.ansatz), b.ansatz) * 0.5 : 0),
        variety: varietyPenalty,
        overBudgetMin: maxStepMin != null ? b.dauerMin - maxStepMin : 0,
        underBudgetMin: maxStepMin != null ? maxStepMin - b.dauerMax : 0,
        techUnasked: needsUnaskedTech(b),
        fachbereich: !currentArea
          ? 'neutral'
          : (b.fachbereich || []).includes(currentArea)
            ? 'passt'
            : !b.fachbereich || b.fachbereich.includes('uebergreifend')
              ? 'neutral'
              : 'fremd',
        textRelevance: currentSemanticScores.get(b.kennung) ?? 0,
        evidence: rankingGrade(b.evidenz),
        draft: b.status !== 'kuratiert',
        functionPosition: wantedFunctions.length
          ? wantedFunctions.indexOf(b.lernfunktion[0]) + 1 || wantedFunctions.length + 1
          : 0,
        vorbereitungMin: b.vorbereitungMin,
        praxisFremd:
          // A seated check in a practice lesson counts like a seated main phase: a movement test beats a self-assessment.
          (currentPraxis || currentLernort === 'hoersaal') &&
          !(currentLernort && currentLernort !== 'klassenraum' ? fitsRoom(b, currentLernort) : isPraxisMethod(b))
            ? currentStepRole === 'haupt' || currentStepRole === 'pruefung'
              ? 'haupt'
              : 'rand'
            : undefined,
        // A named method gets its bonus at the step reserved for it, not at an earlier step it could also serve.
        mentioned:
          currentMentions.has(b.kennung) &&
          (!currentAnchorStep.has(b.kennung) || currentAnchorStep.get(b.kennung) === currentStepIndex)
      })
    };
  }

  const describe = (b: Baustein, a: MatchRequest, wanted: string[]): PhaseProposal => {
    const g = bestGrade(b);
    const reasons: string[] = [];
    const hit = b.lernfunktion.filter((f) => wanted.includes(f));
    if (hit.length) reasons.push('Lernfunktion: ' + hit.map((f) => label('lernfunktion', f)).join(', '));
    if ((b.nachbedingung || []).length) reasons.push('liefert: ' + states(b.nachbedingung).join(', '));
    if (currentMentions.has(b.kennung)) reasons.unshift('im Text genannt');
    reasons.push(g ? `Evidenzgrad ${g}` : 'ohne Wirksamkeitsbeleg');
    return {
      baustein: b.kennung,
      name: b.name,
      reichweite: b.reichweite,
      dauerMin: b.dauerMin,
      dauerMax: b.dauerMax,
      setztVoraus: states(b.vorbedingung),
      liefert: states(b.nachbedingung),
      evidenzgrad: g,
      warnungen: passung(b, a),
      gruende: reasons,
      ...(currentMentions.has(b.kennung) ? { genannt: true } : {})
    };
  };

  /**
   * `soft` names criteria that were only inferred from free text (topic words, semantic guess).
   * They still order the proposals but must not remove candidates.
   */
  function phase(
    a: MatchRequest,
    soft: { zielart?: boolean; lernfunktion?: boolean } = {}
  ): Omit<PhaseMatchResult, 'kriterien' | 'erkannt' | 'offen'> {
    const fn = list(a.lernfunktion);
    const filterFn = soft.lernfunktion ? [] : fn;
    const want = list(a.liefert);
    const art = soft.zielart ? [] : list(a.zielart);
    const have = a.vorhanden !== undefined ? closure(list(a.vorhanden)) : null;
    const out = {
      funktion: 0,
      rahmen: [] as Array<{ baustein: string; name: string; grund: string }>,
      anschluss: [] as Array<{ baustein: string; name: string; grund: string }>
    };
    const hits: Ranked[] = [];

    data.bausteine.forEach((b) => {
      const gives = closure(b.nachbedingung || []);
      if (
        (filterFn.length && !filterFn.some((f) => b.lernfunktion.includes(f))) ||
        (want.length && !want.every((z) => gives.has(z))) ||
        (art.length && !art.some((z) => (b.aufgabe || []).includes(z)))
      ) {
        out.funktion++;
        return;
      }
      const reason = rahmen(b, a);
      if (reason) {
        out.rahmen.push({ baustein: b.kennung, name: b.name, grund: reason });
        return;
      }
      if (have) {
        const miss = (b.vorbedingung || []).filter((z) => !have.has(z));
        if (miss.length) {
          out.anschluss.push({ baustein: b.kennung, name: b.name, grund: 'setzt voraus: ' + states(miss).join(', ') });
          return;
        }
      }
      hits.push(rankOf(b, a, fn));
    });

    const ordered = order(hits, 0);
    const n = data.bausteine.length;
    return {
      modus: 'phase',
      vorschlaege: ordered.map((b) => describe(b, a, fn)),
      ausgeschlossen: out,
      zaehler: {
        katalog: n,
        nachFunktion: n - out.funktion,
        nachRahmen: n - out.funktion - out.rahmen.length,
        nachAnschluss: hits.length,
        mitWarnung: hits.filter((h) => h.hard[2]).length
      }
    };
  }

  const OPENING_TOLERANCE = 1.5;
  const midDuration = (b: Baustein) =>
    Math.max(b.dauerMin, Math.min(b.dauerMax, Math.round((b.dauerMin + b.dauerMax) / 2 / 5) * 5));
  const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;
  const slotSum = (n: EinsatzNode) => (n.belegung || []).reduce((s, x) => s + ((x.inhalt as EinsatzNode).dauerMin || 0), 0);

  function candidates(
    functions: string[],
    maxRang: number,
    a: MatchRequest,
    used: Set<string> | null,
    target?: string,
    maxStepMin?: number,
    varietyPenaltyFn?: (b: Baustein) => number,
    hardCapMin?: number
  ): Baustein[] {
    const opening = currentStepRole === 'rand' && currentStepIndex === 0;
    const ranked = data.bausteine
        .filter((b) => (rang.get(b.reichweite) ?? 0) <= maxRang && b.lernfunktion.some((f) => functions.includes(f)) && !rahmen(b, a))
        .map((b) => {
          const reaches = !target || closure(b.nachbedingung || []).has(target);
          return rankOf(
            b,
            a,
            functions,
            (reaches ? 0 : 2) + (used && used.has(b.kennung) ? 1 : 0),
            maxStepMin,
            varietyPenaltyFn ? varietyPenaltyFn(b) : 0,
            hardCapMin
          );
        });
    // Openings are interchangeable within a wider margin: the topic decides among those that fit the opening's time,
    // so the same few do not open every lesson and a long opener does not take time from the main phases.
    // A check that opens the lesson is no exit ticket.
    if (currentStepRole === 'pruefung' && currentStepIndex === 0) {
      return order(ranked.map((x) => ({ ...x, hard: [...x.hard, /^exit-|ausstieg/.test(x.b.kennung) ? 1 : 0] })));
    }
    if (!opening) return order(ranked);
    const fitsTime = (b: Baustein) => maxStepMin == null || b.dauerMin <= maxStepMin;
    // The wider margin must not let a seated or another subject's opener into a practice lesson.
    const offPractice = (x: Ranked) =>
      currentPraxis && (x.b.fachbereich || []).length > 0 && !x.b.fachbereich!.includes('uebergreifend') && currentArea && !x.b.fachbereich!.includes(currentArea)
        ? 1
        : currentPraxis && !(currentLernort && currentLernort !== 'klassenraum' ? fitsRoom(x.b, currentLernort) : isPraxisMethod(x.b))
          ? 1
          : 0;
    return order(
      ranked.map((x) => ({ ...x, hard: [...x.hard, fitsTime(x.b) ? 0 : 1, offPractice(x)] })),
      OPENING_TOLERANCE
    );
  }

  type PlanStep = Funktionskette['schritte'][number] & { pruefung?: boolean; zusatz?: boolean };

  /**
   * Chain steps for this request. A requested check (liefert: lernstand-diagnostiziert) uses the chain's own
   * check step or gets an added step before the closing reflection.
   */
  /** The text puts the check before the rest of the lesson. */
  const checkFirst = (folded: string) => {
    const text = withoutNegated(folded);
    const m = LEISTUNGSKONTROLLE.exec(text);
    if (!m) return false;
    const before = text.slice(Math.max(0, m.index - 40), m.index);
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 40);
    // "am Ende ein Test, danach Hausaufgaben" or "Test zu Beginn der nächsten Stunde ankündigen" keep the check at the end.
    if (/\b(?:am\s+ende|zum\s+(?:schluss|abschluss)|am\s+schluss|abschliessend|schliesslich)\b/.test(before + ' ' + after)) return false;
    if (/\b(?:nachste\w*|kommende\w*)\s+(?:stunde|woche)|\bankundig/.test(after)) return false;
    const opener = /\b(?:zu\s+beginn|am\s+anfang|zum\s+(?:einstieg|start|stundenbeginn)|zuerst)\s+(?:(?:ein|eine|einen|einer|kurz\w*|schriftlich\w*|mundlich\w*)\s+){0,2}$/;
    const thenRest = /^\s*,?\s*(?:und\s+)?(?:danach|anschliessend|im\s+anschluss|dann)\b/;
    return opener.test(before) || thenRest.test(after);
  };

  /** A check that opens a movement lesson still comes after the warm-up. */
  const firstAfterWarmUp = (kette: Funktionskette, steps: PlanStep[]) =>
    (kette.zielart || []).includes('psychomotorik') && steps[0]?.rolle === 'rand' && steps[0].funktion.includes('orientierung') ? 1 : 0;

  function planSteps(kette: Funktionskette, a: MatchRequest): PlanStep[] {
    let steps: PlanStep[] = kette.schritte.map((st) => ({ ...st }));
    if (list(a.liefert).includes('lernstand-diagnostiziert')) {
      const own = steps.find((st) => st.ziel === 'lernstand-diagnostiziert');
      if (own) {
        own.pruefung = true;
        if (checkFirst(currentRawText)) {
          const rest = steps.filter((st) => st !== own);
          const at = firstAfterWarmUp(kette, rest);
          steps = [...rest.slice(0, at), own, ...rest.slice(at)];
        }
      } else {
        const check: PlanStep = {
          id: 'leistungskontrolle',
          label: 'Leistung oder Lernstand überprüfen',
          funktion: ['diagnose'],
          ziel: 'lernstand-diagnostiziert',
          rolle: 'haupt',
          zeitanteil: 20,
          pruefung: true,
          zusatz: true
        };
        const last = steps[steps.length - 1];
        const atEnd = last && last.rolle === 'rand' && last.funktion.includes('metakognition') ? steps.length - 1 : steps.length;
        // "Vokabeltest und danach neue Lektion" or "zu Beginn ein Test": the check opens the lesson.
        const at = checkFirst(currentRawText) ? firstAfterWarmUp(kette, steps) : atEnd;
        steps.splice(at, 0, check);
      }
    }
    return steps;
  }

  function ablauf(a: MatchRequest, kette: Funktionskette): Omit<AblaufMatchResult, 'kriterien' | 'erkannt' | 'offen'> & { offen: string[] } {
    const kontext: Arrangement['kontext'] = {};
    if (a.bildungsstufe) kontext.bildungsstufe = a.bildungsstufe;
    if (a.vorwissen) kontext.vorwissen = a.vorwissen;
    // A check at the start tests what earlier lessons taught: the group brings first knowledge with it.
    if (list(a.liefert).includes('lernstand-diagnostiziert') && checkFirst(currentRawText)) kontext.vorhanden = ['erstwissen-ungesichert'];
    const wrap = (teile: ArrangementNode[]): Arrangement => ({
      '@context': data.NS + 'context.jsonld',
      '@id': data.NS + 'plan/vorschlag',
      typ: 'Arrangement',
      name: `Vorschlag (${kette.label})`,
      reichweite: 'r3',
      zieltyp: kette.id,
      kontext,
      ablauf: { typ: 'Sequenz', teile }
    });

    const judge = (teile: ArrangementNode[]) => {
      const r = validator.validate(wrap(teile));
      const rel = r.meldungen.filter(
        (m) =>
          !(m.regel === 'R-04' && m.pfad === '/ablauf') &&
          m.regel !== 'R-05' &&
          m.regel !== 'R-07' &&
          !(m.regel === 'R-09' && m.pfad === '/kontext')
      );
      return { fehler: rel.filter((m) => m.schwere === 'Fehler').length, warnungen: rel.length, zustand: new Set(r.endzustand) };
    };

    const teile: ArrangementNode[] = [];
    const used = new Set<string>();
    const usedPictograms = new Map<string, number>();
    const usedClusters = new Map<string, number>();
    const clusterOf = (b: Baustein) => `${b.piktogramm || 'none'}:${(b.ansatz || [])[0] || 'any'}`;
    const varietyPenaltyOf = (b: Baustein): number => {
      const picCount = b.piktogramm ? usedPictograms.get(b.piktogramm) || 0 : 0;
      const clCount = usedClusters.get(clusterOf(b)) || 0;
      // Penalize repeating identical method cluster (e.g. 2 digital simulations) or 3+ identical pictograms
      return (clCount > 0 ? 1 : 0) + (picCount >= 2 ? 1 : 0);
    };
    const recordUsed = (id: string) => {
      used.add(id);
      const b = blocks.get(id);
      if (b) {
        if (b.piktogramm) usedPictograms.set(b.piktogramm, (usedPictograms.get(b.piktogramm) || 0) + 1);
        const cl = clusterOf(b);
        usedClusters.set(cl, (usedClusters.get(cl) || 0) + 1);
      }
    };
    const schritte: AblaufSchrittResult[] = [];
    const offen: string[] = [];

    const fill = (n: EinsatzNode, b: Baustein, onlyMandatory: boolean): EinsatzNode => {
      (b.slot || [])
        .filter((s) => !onlyMandatory || s.pflicht)
        .forEach((s) => {
          const cands = candidates(
            s.lernfunktion,
            Math.min(rang.get(s.reichweite) ?? 0, (rang.get(b.reichweite) ?? 0) - 1),
            a,
            used
          )
            .filter((c) => c.kennung !== b.kennung && !(c.slot || []).some((x) => x.pflicht))
            .slice(0, SLOT_CANDIDATES);
          let best: { score: number; trial: EinsatzNode } | null = null;
          cands.forEach((c) => {
            const trial = clone(n);
            trial.belegung = (trial.belegung || []).concat({
              slotKennung: s.kennung,
              inhalt: { typ: 'Einsatz', baustein: c.kennung, dauerMin: midDuration(c) }
            });
            const j = judge(teile.concat(trial));
            const score = j.fehler * 100 + j.warnungen;
            if (!best || score < best.score) best = { score, trial };
          });
          if (best) n.belegung = (best as { trial: EinsatzNode }).trial.belegung;
        });
      n.dauerMin = Math.max(n.dauerMin || 0, slotSum(n));
      return n;
    };

    const totalBudget = given(a.zeitMin) ? Number(a.zeitMin) : null;
    const steps = planSteps(kette, a);
    // A short budget (e.g. 20 minutes for five phases) lets phases shrink below five minutes, so the plan fits.
    const minStep = totalBudget != null && steps.length * 5 > totalBudget ? 3 : 5;
    const checkStepId = steps.find((st) => st.pruefung)?.id;
    const wantsRecurrence = steps.some((s) => s.ziel === 'wissen-konsolidiert');
    const usedDurationSoFar = () =>
      teile.reduce((sum, node) => sum + (node.typ === 'Einsatz' ? node.dauerMin || 0 : 0), 0);

    // Methods named in the request: reserve their minimum duration at the first chain step they can serve.
    const mentioned = [...currentMentions].map((id) => blocks.get(id)).filter((b): b is Baustein => Boolean(b));
    // Anchors belong to this chain's steps; a second planning pass with another chain starts afresh.
    currentAnchorStep = new Map();
    const floors: Array<number | undefined> = steps.map(() => undefined);
    for (const b of mentioned) {
      if (rahmen(b, a)) continue;
      // Prefer the step whose target the method delivers directly, main phases first; otherwise the first step it can serve.
      const fits = steps
        .map((st, i) => ({ st, i }))
        .filter(
          ({ st, i }) =>
            floors[i] == null && b.lernfunktion.some((f) => st.funktion.includes(f)) && closure(b.nachbedingung || []).has(st.ziel)
        );
      const direct = fits.filter(({ st }) => (b.nachbedingung || []).includes(st.ziel));
      // A named check ("Vokabeltest") belongs to the check step, wherever the request puts it.
      const checkFit = b.lernfunktion[0] === 'diagnose' ? fits.find(({ st }) => st.id === checkStepId) : undefined;
      const at = (checkFit || direct.find(({ st }) => st.rolle === 'haupt') || direct[0] || fits[0])?.i ?? -1;
      if (at >= 0) {
        floors[at] = b.dauerMin;
        currentAnchorStep.set(b.kennung, at);
      }
    }
    // A single session cannot hold repetitions that are days apart: they are planned for later sessions.
    const recurrenceOutside = totalBudget != null && totalBudget <= SINGLE_SESSION_MAX_MIN;
    const reserveRec = wantsRecurrence && !recurrenceOutside && totalBudget != null && totalBudget >= 75 ? 15 : 0;
    // A requested check in a practice lesson needs the time of a practical test, not of a seated self-assessment.
    const checkAt = steps.findIndex((st) => st.id === checkStepId);
    if (checkAt >= 0 && floors[checkAt] == null && currentPraxis && totalBudget != null) {
      const practical = data.bausteine.filter(
        (b) =>
          b.lernfunktion[0] === 'diagnose' &&
          (b.nachbedingung || []).includes(steps[checkAt].ziel) &&
          !rahmen(b, a) &&
          !passung(b, a).length &&
          (!currentArea || (b.fachbereich || []).includes(currentArea)) &&
          (currentLernort && currentLernort !== 'klassenraum' ? fitsRoom(b, currentLernort) : isPraxisMethod(b))
      );
      const need = practical.length ? Math.min(...practical.map((b) => b.dauerMin)) : 0;
      const others = steps.reduce((x, _st, i) => x + (i === checkAt ? 0 : Math.max(minStep, floors[i] ?? 0)), 0);
      if (need && need + others <= totalBudget - reserveRec) floors[checkAt] = need;
    }
    const budgets = totalBudget != null ? phaseBudgets(steps, totalBudget - reserveRec, floors, minStep) : null;
    const anchoredAt = new Map<string, string>();

    steps.forEach((step, idx) => {
      currentStepIndex = idx;
      currentStepRole = step.id === checkStepId ? 'pruefung' : step.rolle || '';
      // Share of this step plus whatever earlier steps left unused.
      const plannedBefore = budgets ? budgets.slice(0, idx).reduce((x, y) => x + y, 0) : 0;
      const stepCap = budgets ? Math.max(minStep, budgets[idx] + Math.max(0, plannedBefore - usedDurationSoFar())) : undefined;
      const reservedAfter = steps.slice(idx + 1).reduce((x, _st, k) => x + Math.max(minStep, floors[idx + 1 + k] ?? 0), 0);
      const hardCap =
        totalBudget != null ? Math.max(minStep, totalBudget - reserveRec - usedDurationSoFar() - reservedAfter) : undefined;
      const primaryCands = candidates(step.funktion, 3, a, used, step.ziel, stepCap, varietyPenaltyOf, hardCap);
      // Fallback: if strict setting constraints (e.g. gruppe=180, distanz, asynchron) leave no primary-function method
      // reaching step.ziel, include any valid method that delivers step.ziel directly.
      const fallbackCands = order(
        data.bausteine
          .filter(
            (b) =>
              (rang.get(b.reichweite) ?? 0) <= 3 &&
              !rahmen(b, a) &&
              closure(b.nachbedingung || []).has(step.ziel) &&
              !primaryCands.some((p) => p.kennung === b.kennung)
          )
          .map((b) => rankOf(b, a, step.funktion, 1 + (used.has(b.kennung) ? 1 : 0), stepCap, varietyPenaltyOf(b), hardCap))
      );
      const isCheck = (b: Baustein) => b.lernfunktion[0] === 'diagnose';
      const cands =
        step.id === checkStepId
          ? [...primaryCands.filter(isCheck), ...primaryCands.filter((b) => !isCheck(b)), ...fallbackCands]
          : primaryCands.concat(fallbackCands);
      let chosen: EinsatzNode | null = null;
      for (const b of cands) {
        for (const onlyMandatory of [true, false]) {
          if (!onlyMandatory && !(b.slot || []).some((s) => !s.pflicht)) continue;
          const initialDur =
            stepCap != null && hardCap != null
              ? Math.max(b.dauerMin, Math.min(b.dauerMax, stepCap, hardCap))
              : midDuration(b);
          const n = fill(
            // An added step (a check the chain does not have) carries no chain step id.
            { typ: 'Einsatz', baustein: b.kennung, dauerMin: initialDur, ...(step.zusatz ? {} : { kettenschritt: step.id }) },
            b,
            onlyMandatory
          );
          const j = judge(teile.concat(n));
          if (j.fehler) continue;
          if (j.zustand.has(step.ziel)) {
            chosen = n;
            break;
          }
        }
        if (chosen) break;
      }
      if (!chosen) {
        offen.push(step.label);
        return;
      }
      teile.push(chosen);
      if (currentMentions.has(chosen.baustein)) anchoredAt.set(chosen.baustein, step.label);
      recordUsed(chosen.baustein);
      (chosen.belegung || []).forEach((x) => {
        if (x.inhalt.typ === 'Einsatz') recordUsed(x.inhalt.baustein);
      });
      schritte.push({
        schritt: step.id,
        label: step.label,
        ziel: label('lernzustand', step.ziel),
        baustein: chosen.baustein,
        name: blocks.get(chosen.baustein)!.name,
        slots: (chosen.belegung || [])
          .filter((x) => x.inhalt.typ === 'Einsatz')
          .map((x) => {
            const inner = x.inhalt as EinsatzNode;
            return { slot: x.slotKennung, baustein: inner.baustein, name: blocks.get(inner.baustein)!.name };
          }),
        alternativen: cands
          .filter((b) => b.kennung !== chosen!.baustein)
          .slice(0, 3)
          .map((b) => b.name)
      });
    });

    currentStepIndex = -1;
    currentStepRole = '';
    if (wantsRecurrence) {
      const recCands = candidates(['konsolidierung'], 1, a, null, 'wissen-konsolidiert');
      const rec =
        totalBudget == null || recurrenceOutside
          ? recCands[0]
          : recCands.find((c) => usedDurationSoFar() + c.dauerMin * RECURRENCE.anzahl <= totalBudget);
      if (rec) {
        teile.push(
          Object.assign(
            { typ: 'Wiederkehr' as const, baustein: rec.kennung, dauerMin: rec.dauerMin },
            RECURRENCE,
            recurrenceOutside ? { ausserhalbBudget: true } : {}
          )
        );
      }
    }

    // Named methods that no chain step could take: add them as an extra phase where the validator allows it.
    const verankert: Array<{ baustein: string; schritt: string }> = [];
    const nichtVerankert: Array<{ baustein: string; grund: string }> = [];
    const minTotal = (nodes: ArrangementNode[]) =>
      nodes.reduce((sum, n) => {
        if (n.typ === 'Einsatz') return sum + Math.max(blocks.get(n.baustein)!.dauerMin, slotSum(n));
        if (n.typ === 'Wiederkehr') return sum + (n.ausserhalbBudget ? 0 : (n.dauerMin || 0) * (n.anzahl || 1));
        return sum;
      }, 0);
    for (const b of mentioned) {
      if (used.has(b.kennung)) {
        verankert.push({ baustein: b.kennung, schritt: anchoredAt.get(b.kennung) || 'Teil einer Phase' });
        continue;
      }
      const frame = rahmen(b, a);
      if (frame) {
        nichtVerankert.push({ baustein: b.kennung, grund: frame });
        continue;
      }
      if ((rang.get(b.reichweite) ?? 0) > 3) {
        nichtVerankert.push({ baustein: b.kennung, grund: 'Reichweite größer als ein einzelner Ablauf' });
        continue;
      }
      const node = fill({ typ: 'Einsatz', baustein: b.kennung, dauerMin: b.dauerMin }, b, true);
      if (totalBudget != null && minTotal(teile) + (node.dauerMin || 0) > totalBudget) {
        nichtVerankert.push({ baustein: b.kennung, grund: `Zeitbudget reicht nicht (braucht mindestens ${b.dauerMin} min zusätzlich)` });
        continue;
      }
      let placed = false;
      for (let pos = 1; pos <= teile.length && !placed; pos++) {
        if (teile[pos - 1].typ === 'Wiederkehr') continue;
        const trial = [...teile.slice(0, pos), node, ...teile.slice(pos)];
        if (judge(trial).fehler === 0) {
          const before = teile[pos - 1];
          teile.splice(pos, 0, node);
          recordUsed(b.kennung);
          const prev = before.typ === 'Einsatz' ? blocks.get(before.baustein)?.name : undefined;
          verankert.push({ baustein: b.kennung, schritt: prev ? `Zusatzphase nach „${prev}“` : 'Zusatzphase' });
          schritte.splice(Math.min(pos, schritte.length), 0, {
            schritt: 'zusatz',
            label: 'Zusatzphase (im Text genannt)',
            ziel: states(b.nachbedingung).join(', '),
            baustein: b.kennung,
            name: b.name,
            slots: [],
            alternativen: []
          });
          placed = true;
        }
      }
      if (!placed) nichtVerankert.push({ baustein: b.kennung, grund: 'Voraussetzungen der Methode sind an keiner Stelle des Ablaufs erfüllt' });
    }

    const arrangement = wrap(teile);
    if (given(a.zeitMin)) {
      const budget = Number(a.zeitMin);
      arrangement.kontext!.zeitbudgetMin = budget;
      if (validator.validate(arrangement).dauerMin > budget) {
        const shrink = (n: ArrangementNode) => {
          if (n.typ === 'Einsatz') {
            (n.belegung || []).forEach((x) => shrink(x.inhalt));
            n.dauerMin = Math.max(blocks.get(n.baustein)!.dauerMin, slotSum(n));
          }
        };
        if (arrangement.ablauf.typ === 'Sequenz') arrangement.ablauf.teile.forEach(shrink);
      }
      // Use the lesson time: spread what is left over the chosen methods, up to each method's maximum.
      const total = validator.validate(arrangement).dauerMin;
      const plain = teile.filter((n): n is EinsatzNode => n.typ === 'Einsatz' && !(n.belegung || []).length);
      if (total < budget && plain.length) {
        const cur = plain.map((n) => n.dauerMin || blocks.get(n.baustein)!.dauerMin);
        const grown = stretch(
          plain.map((n, i) => ({ min: blocks.get(n.baustein)!.dauerMin, max: blocks.get(n.baustein)!.dauerMax, cur: cur[i] })),
          cur.reduce((x, y) => x + y, 0) + (budget - total)
        );
        plain.forEach((n, i) => (n.dauerMin = grown[i]));
      }
    }
    const annahmen = currentTechAsked
      ? []
      : ['Keine Angabe zur Ausstattung: Methoden ohne Internet, KI und Einzelgeräte werden bevorzugt.'];

    const r = validator.validate(arrangement);
    return {
      modus: 'ablauf',
      kette: { id: kette.id, label: kette.label },
      schritte,
      offen,
      verankert,
      nichtVerankert,
      annahmen,
      arrangement,
      pruefung: {
        gueltig: r.gueltig,
        dauerMin: r.dauerMin,
        ...(r.dauerAusserhalbMin ? { dauerAusserhalbMin: r.dauerAusserhalbMin } : {}),
        endzustand: states(r.endzustand),
        meldungen: r.meldungen
      }
    };
  }

  // Topic part of the request: numbers and framing words removed, so "45 Minuten" vs "90 Minuten" keeps the seed.
  const topicSeed = (folded: string) =>
    folded
      .replace(/[^a-z]+/g, ' ')
      .split(' ')
      .filter((w) => w.length > 2 && !FRAME_WORDS.has(w))
      .join(' ');

  /** Wishes that narrow the choice without changing the setting; relaxed in this order when no valid plan is possible. */
  const RELAXABLE: Array<[string, string]> = [
    ['maxVorbereitung', 'wenig Vorbereitung'],
    ['anleitung', 'Anleitungsgrad'],
    ['engagement', 'Aktivitätsform'],
    ['interaktion', 'Sozialform'],
    ['reichweite', 'Reichweite'],
    ['ansatz', 'didaktischer Ansatz']
  ];

  /** Room of the lesson and whether its main phases should be practical. A stated classroom turns the practice preference off. */
  function setRoom(a: MatchRequest, psychomotor: boolean) {
    currentLernort = given(a.lernort)
      ? String(a.lernort)
      : a.fachbereich === 'sport'
        ? 'bewegungsraum'
        : psychomotor && (a.fachbereich === 'beruf-praxis' || a.fachbereich === 'nawi-technik')
          ? 'fachraum'
          : '';
    currentPraxis = currentLernort !== 'klassenraum' && (psychomotor || ['bewegungsraum', 'fachraum', 'draussen'].includes(currentLernort));
  }

  function zuordnen(anfrage: MatchRequest = {}): MatchResult {
    check(anfrage);
    currentRawText = given(anfrage.text) ? fold(String(anfrage.text)) : '';
    currentSemanticScores = new Map(
      // Text relevance is measured on the topic words only: "Klasse 8" or "45 Minuten" must not favour a method.
      given(anfrage.text)
        ? semantic
            .rankMethods(
              String(anfrage.text)
                .split(/[^\p{L}]+/u)
                .filter((w) => w.length > 2 && !FRAME_WORDS.has(fold(w)))
                .join(' '),
              35
            )
            .map((h) => [h.kennung, h.score])
        : []
    );
    try {
      const gelesen: ReturnType<typeof lesen> = given(anfrage.text)
        ? lesen(String(anfrage.text), given(anfrage.bildungsstufe) ? String(anfrage.bildungsstufe) : undefined)
        : { kriterien: {}, erkannt: [], offen: [] };
      const a: MatchRequest = { ...gelesen.kriterien };
      Object.keys(anfrage).forEach((k) => {
        if (k !== 'text' && given(anfrage[k])) a[k] = anfrage[k];
      });
      // What the caller states beats what the text suggests: an explicit zielart drops a zieltyp read from the text.
      const zieltypFromText = !given(anfrage.zieltyp) && given(a.zieltyp);
      if (zieltypFromText && given(anfrage.zielart)) delete a.zieltyp;
      currentVariante = given(a.variante) ? Number(a.variante) : 0;
      delete a.variante;
      // Methods named in a negated phrase ("keine Gruppenarbeit") are no wish for them.
      currentMentions = new Set(given(anfrage.text) ? mentionDetector.detect(withoutNegated(currentRawText)).map((m) => m.kennung) : []);
      currentSeed = topicSeed(currentRawText);
      // Conditioning is a sports goal: without a stated subject, the plan is a sports lesson;
      // read from the text in another subject ("Konditionstraining in Biologie"), it is the topic, not the chain.
      if (a.zieltyp === 'kondition-training' && !given(a.fachbereich)) a.fachbereich = 'sport';
      else if (a.zieltyp === 'kondition-training' && zieltypFromText && a.fachbereich !== 'sport') {
        delete a.zieltyp;
        if (a.zielart === 'psychomotorik' && !given(anfrage.zielart)) delete a.zielart;
      }
      currentArea = given(a.fachbereich) ? String(a.fachbereich) : '';
      currentNegatedInteractions = negatedInteractions(currentRawText);
      currentNegatedMethods = negatedMethods(currentRawText);
      // A method named only to rule it out ("kein Lehrervortrag") is no wish for it.
      currentMentions = new Set([...currentMentions].filter((id) => !currentNegatedMethods.has(id)));
      // A name that also has an everyday meaning ("Leistungsmessung" in maths) is no wish for a method that does not fit the subject or room.
      currentMentions = new Set(
        [...currentMentions].filter((id) => {
          const b = blocks.get(id);
          if (!b) return false;
          if (currentArea && (b.fachbereichUngeeignet || []).includes(currentArea)) return false;
          const roomOnly = (b.lernort || []).length > 0 && !b.lernort!.includes('klassenraum');
          return !roomOnly || given(a.lernort) || currentArea === 'sport' || a.zielart === 'psychomotorik';
        })
      );
      // Equipment counts as "asked for" when the request states it, wants digital methods or runs online.
      currentTechAsked =
        given(a.maxTechnik) ||
        Boolean(a.ohneInternet) ||
        Boolean(a.ohneKI) ||
        list(a.ansatz).includes('digital-ki') ||
        list(a.raumzeit).some((r) => r === 'distanz' || r === 'asynchron') ||
        /\b(?:digital\w*|online|ki|internet|app|apps)\b/.test(currentRawText);
      const fromText = (feld: string) => (given(anfrage[feld]) ? undefined : gelesen.erkannt.find((e) => e.feld === feld));
      const guessedFn = Boolean(fromText('lernfunktion')?.beleg.startsWith('semantisch'));
      currentGuessedAnsatz = Boolean(fromText('ansatz')?.beleg.startsWith('semantisch'));
      // "… mit anschließender Leistungskontrolle, 45 Minuten" plans a lesson that ends with a check, not the check alone.
      const checkInLesson = Boolean(fromText('liefert')) && given(a.zeitMin) && Number(a.zeitMin) >= 30;
      // "Lesen üben, 45 min" names an activity for the whole lesson; only a phase word ("Einstieg", "Sicherung") asks for one phase.
      const fnBeleg = fromText('lernfunktion')?.beleg || '';
      const activityOnly =
        Boolean(fnBeleg) && fnBeleg.split(', ').every((w) => ACTIVITY_WORD.test(w)) && !PHASE_WORD.test(currentRawText.replace(STAGE_PHASE, ' '));
      const hasPhase =
        (list(a.lernfunktion).length && !guessedFn && !activityOnly) || (list(a.liefert).length && !checkInLesson);
      const isFullLessonBudget = given(a.zeitMin) && Number(a.zeitMin) >= 45;
      // A stated lesson length without an explicit phase word ("Einstieg", "Sicherung") means a whole lesson.
      const isLessonWithoutPhaseWord = given(anfrage.text) && given(a.zeitMin) && Number(a.zeitMin) >= 40 && !hasPhase;
      const modus =
        a.modus ||
        ((given(a.zieltyp) && !zieltypFromText) ||
        ((a.zielart || a.zieltyp) && (!hasPhase || isFullLessonBudget)) ||
        isLessonWithoutPhaseWord ||
        checkInLesson
          ? 'ablauf'
          : 'phase');
      const head = {
        kriterien: a,
        erkannt: gelesen.erkannt,
        offen: FIELDS.filter((f) => f.stufe && !given(a[f.feld])).map((f) => f.feld),
        ...(gelesen.fach ? { fach: gelesen.fach } : {})
      };
      if (modus === 'phase') {
        setRoom(a, a.zielart === 'psychomotorik');
        return Object.assign(head, phase(a, { zielart: Boolean(fromText('zielart')), lernfunktion: guessedFn }));
      }
      let chainGuessed = false;
      let chainInferred = false;
      let ketten = a.zieltyp
        ? [chains.get(a.zieltyp)!].filter(Boolean)
        : data.ketten.filter((k) => (k.zielart || []).includes(String(a.zielart)));
      if (!ketten.length && given(anfrage.text)) {
        chainInferred = true;
        const ansatzList = list(a.ansatz);
        const byAnsatz: Array<[string, string]> = [
          ['forschend', 'fuenf-e'],
          ['uebung', 'prozedur'],
          ['instruktion', 'direkte-instruktion'],
          ['kooperativ', 'kooperatives-lernen'],
          ['offen', 'projektlernen'],
          ['diskurs', 'urteilsbildung']
        ];
        const practising = !guessedFn && list(a.lernfunktion)[0] === 'konsolidierung' ? 'prozedur' : '';
        const byVerb = VERB_CHAINS.find(([re]) => re.test(withoutNegated(currentRawText)))?.[1] || '';
        const inferredId =
          a.fachbereich === 'sport' && a.lernort !== 'klassenraum'
            ? 'fertigkeit-bewegung'
            : practising || byVerb || byAnsatz.find(([code]) => ansatzList.includes(code))?.[1] || 'konzeptaufbau';
        const fallbackChain = chains.get(inferredId) || chains.get('konzeptaufbau');
        if (fallbackChain) ketten = [fallbackChain];
        chainGuessed = Boolean(fallbackChain && byVerb && fallbackChain.id === byVerb);
      }
      if (!ketten.length) {
        return Object.assign(head, {
          modus: 'ablauf' as const,
          hinweis: 'Kein Zieltyp bestimmbar. Bitte zieltyp angeben: ' + data.ketten.map((k) => k.id).join(', ') + '.'
        });
      }
      setRoom(a, (ketten[0].zielart || []).includes('psychomotorik'));
      // Too little time for the chain's phases (at least five minutes each): offer methods for one phase instead.
      const phasen = planSteps(ketten[0], a).length;
      if (!given(a.modus) && given(a.zeitMin) && phasen * 5 > Number(a.zeitMin)) {
        return Object.assign(head, phase(a, { zielart: Boolean(fromText('zielart')), lernfunktion: guessedFn }), {
          hinweis: `${Number(a.zeitMin)} Minuten reichen nicht für einen Ablauf „${ketten[0].label}“ mit ${phasen} Phasen. Vorschläge für eine einzelne Phase; für einen verkürzten Ablauf modus „ablauf“ angeben.`
        });
      }
      let res = ablauf(a, ketten[0]);
      // A chain guessed from a verb that the frame cannot fill (e.g. too few people) gives way to the general concept chain.
      const general = chains.get('konzeptaufbau');
      if (chainGuessed && general && !res.pruefung?.gueltig) {
        const tried = ketten[0].label;
        currentPraxis = ['bewegungsraum', 'fachraum', 'draussen'].includes(currentLernort);
        const retry = ablauf(a, general);
        if (retry.pruefung?.gueltig) {
          res = Object.assign(retry, {
            annahmen: [...(retry.annahmen || []), `Ablauf „${tried}“ war mit diesem Rahmen nicht vollständig planbar; stattdessen „${general.label}“.`]
          });
          ketten = [general];
        }
      }
      // A method the text names but the inferred chain has no time for: try a chain with a step it can fill.
      const crowdedOut = chainInferred
        ? (res.nichtVerankert || []).filter((n) => n.grund.startsWith('Zeitbudget')).map((n) => blocks.get(n.baustein)!)
        : [];
      const triedChains = new Set<string>();
      const placedBefore = (res.verankert || []).map((v) => v.baustein);
      for (const b of crowdedOut) {
        const tried = ketten[0];
        triedChains.add(tried.id);
        // Only chains of the same kind of goal: a movement chain for a movement lesson, a classroom chain otherwise.
        const psychomotorTried = (tried.zielart || []).includes('psychomotorik');
        const fitsChain = (k: Funktionskette) =>
          !triedChains.has(k.id) &&
          (k.zielart || []).includes('psychomotorik') === psychomotorTried &&
          k.schritte.some((st) => b.lernfunktion.some((f) => st.funktion.includes(f)) && closure(b.nachbedingung || []).has(st.ziel));
        // The general concept chain first, then the others in catalogue order.
        const retryOrder = [...data.ketten].sort((x, y) => Number(y.id === 'konzeptaufbau') - Number(x.id === 'konzeptaufbau'));
        for (const k of retryOrder.filter(fitsChain)) {
          triedChains.add(k.id);
          setRoom(a, (k.zielart || []).includes('psychomotorik'));
          const retry = ablauf(a, k);
          const inTime = !given(a.zeitMin) || (retry.pruefung?.dauerMin ?? 0) <= Number(a.zeitMin);
          const placed = new Set((retry.verankert || []).map((v) => v.baustein));
          if (retry.pruefung?.gueltig && inTime && placed.has(b.kennung) && placedBefore.every((id) => placed.has(id))) {
            res = Object.assign(retry, {
              annahmen: [
                ...(retry.annahmen || []),
                `„${b.name}“ passte zeitlich nicht in den Ablauf „${tried.label}“; stattdessen „${k.label}“.`
              ]
            });
            ketten = [k];
            break;
          }
        }
        if (ketten[0] !== tried) break;
      }
      setRoom(a, (ketten[0].zielart || []).includes('psychomotorik'));
      // Still no valid plan: relax one wish at a time that only narrows the choice, and say which one.
      // Only an uncovered function (R-04) can be helped this way; wishes the caller stated as fields stay.
      const uncovered = (res.pruefung?.meldungen || []).some((x) => x.regel === 'R-04' && x.schwere === 'Fehler');
      if (!res.pruefung?.gueltig && uncovered) {
        const placedBefore = (res.verankert || []).map((v) => v.baustein);
        for (const [feld, label] of RELAXABLE) {
          if (!given(a[feld]) || given(anfrage[feld])) continue;
          const relaxed: MatchRequest = { ...a };
          delete relaxed[feld];
          setRoom(relaxed, (ketten[0].zielart || []).includes('psychomotorik'));
          const retry = ablauf(relaxed, ketten[0]);
          const inTime = !given(a.zeitMin) || (retry.pruefung?.dauerMin ?? 0) <= Number(a.zeitMin);
          const placed = new Set((retry.verankert || []).map((v) => v.baustein));
          if (retry.pruefung?.gueltig && inTime && placedBefore.every((id) => placed.has(id))) {
            setRoom(a, (ketten[0].zielart || []).includes('psychomotorik'));
            res = Object.assign(retry, {
              annahmen: [
                ...(retry.annahmen || []),
                `Mit der Vorgabe „${label}“ (${feld}) war kein vollständiger Ablauf möglich; der Vorschlag hält sie nicht ein.`
              ]
            });
            break;
          }
        }
      }
      return Object.assign(head, res, {
        weitereKetten: ketten.slice(1).map((k) => ({ id: k.id, label: k.label }))
      });
    } finally {
      currentRawText = '';
      currentSemanticScores = new Map();
      currentMentions = new Set();
      currentAnchorStep = new Map();
      currentStepIndex = -1;
      currentSeed = '';
      currentVariante = 0;
      currentTechAsked = false;
      currentArea = '';
      currentNegatedInteractions = new Set();
      currentNegatedMethods = new Set();
      currentPraxis = false;
      currentGuessedAnsatz = false;
      currentLernort = '';
      currentStepRole = '';
    }
  }

  return { zuordnen, lesen, felder, schema };
}
