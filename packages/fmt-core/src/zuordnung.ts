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

const GRADE_ORDER: EvidenceGrade[] = ['A', 'B', 'C'];
const SLOT_CANDIDATES = 8;
const RECURRENCE = { anzahl: 3, abstand: 'P2D' };
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

export interface FmtMatcher {
  zuordnen(anfrage?: MatchRequest): MatchResult;
  lesen(text: string): {
    kriterien: Record<string, unknown>;
    erkannt: Array<{ feld: string; wert: unknown; beleg: string }>;
    offen: string[];
  };
  felder(): MatchFieldDef[];
  schema(): Record<string, unknown>;
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
  const blocks = new Map<string, Baustein>(data.bausteine.map((b) => [b.kennung, b]));
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
      if (!f) throw new Error(`Unbekanntes Feld „${key}“. Erlaubt: ${FIELDS.map((x) => x.feld).join(', ')}.`);
      if (!f.werte) return;
      const allowed = f.werte.map((w) => w.code);
      list(a[key]).forEach((v) => {
        if (!allowed.includes(v)) {
          throw new Error(`Feld „${key}“: unbekannter Wert „${v}“. Erlaubt: ${allowed.join(', ')}.`);
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

  const semantic = createSemanticClassifier(data);
  const stageOfGrade = (n: number) => (n <= 4 ? 'primar' : n <= 10 ? 'sek1' : 'sek2');
  const RULES: Array<[string, RegExp, (m: RegExpExecArray) => unknown]> = [
    // Multiplicative durations first (e.g. "2 x 45 Minuten", "3 × 45 min")
    ['zeitMin', /(\d{1,2})\s*[x×]\s*(\d{1,3})\s*(?:min\b|minuten)/, (m) => Number(m[1]) * Number(m[2])],
    ['zeitMin', /(\d{1,3})\s*(?:min\b|minuten)/, (m) => Number(m[1])],
    ['zeitMin', /(\d{1,2})[.,]5\s*(?:unterrichts|schul)?stunden\b/, (m) => Math.round((Number(m[1]) + 0.5) * 60)],
    ['zeitMin', /(\d{1,2})\s*(?:unterrichts|schul)?stunden\b/, (m) => Number(m[1]) * 45],
    ['zeitMin', /doppelstunde/, () => 90],
    ['zeitMin', /\b(?:eine|einer|einzel|unterrichts|schul)\s?stunde\b/, () => 45],
    ['bildungsstufe', /(?:klasse|klassenstufe|jahrgang|jahrgangsstufe|jg\.?)\s*(\d{1,2})\b/, (m) => stageOfGrade(Number(m[1]))],
    ['bildungsstufe', /\b(\d{1,2})\.\s*(?:klasse|jahrgang)/, (m) => stageOfGrade(Number(m[1]))],
    ['bildungsstufe', /grundschul|primarstufe/, () => 'primar'],
    ['bildungsstufe', /oberstufe|sekundarstufe\s*(?:ii|2)\b|sek\.?\s*(?:ii|2)\b|gymnasiale\s+oberstufe/, () => 'sek2'],
    ['bildungsstufe', /sekundarstufe\s*(?:i|1)\b|sek\.?\s*(?:i|1)\b|mittelstufe|realschule|gesamtschule|hauptschule/, () => 'sek1'],
    ['bildungsstufe', /berufsschul|berufsbildung|auszubildende|azubi/, () => 'berufsbildung'],
    ['bildungsstufe', /hochschul|studierende|universitat|vorlesung|seminar/, () => 'hochschule'],
    ['bildungsstufe', /erwachsenenbildung|volkshochschul|weiterbildung/, () => 'erwachsenenbildung'],
    ['gruppe', /(\d{1,3})\s*(?:schuler\w*|lernende\w*|personen|teilnehme\w*|studierende\w*|kinder|sus)\b/, (m) => Number(m[1])],
    ['vorwissen', /(?:kein|keine|wenig|kaum|gering\w*)\s+(?:vorwissen|vorkenntnis\w*)|ohne\s+(?:vorwissen|vorkenntnis\w*)|anfanger/, () => 'gering'],
    ['vorwissen', /(?:viel|gut\w*|hoh\w*|solide\w*)\s+(?:vorwissen|vorkenntnis\w*)|fortgeschritten/, () => 'hoch'],
    ['vorwissen', /(?:etwas|mittler\w*)\s+(?:vorwissen|vorkenntnis\w*)|grundkenntnis/, () => 'mittel'],
    ['maxTechnik', /ohne\s+(?:gerate|technik|digitale\s+\w+)|nur\s+(?:tafel|papier)|keine\s+(?:gerate|tablets|computer|technik)|analog\b/, () => 't-keine'],
    ['maxTechnik', /tablets?\b|laptops?\b|ipads?\b|computerraum|endgerat/, () => 't-einzeln'],
    ['maxTechnik', /beamer|projektor|smartboard|digitale\s+tafel/, () => 't-projektion'],
    ['ohneInternet', /ohne\s+(?:internet|wlan|netz)|kein\s+(?:internet|wlan)|offline/, () => true],
    ['ohneKI', /ohne\s+ki\b|keine\s+ki\b/, () => true],
    ['maxVorbereitung', /ohne\s+vorbereitung|sofort\s+einsetzbar|spontan/, () => 5],
    ['maxVorbereitung', /wenig\s+vorbereitung|kurz\w*\s+vorbereitung/, () => 15],
    ['raumzeit', /asynchron|selbstlernphase/, () => ['asynchron']],
    ['raumzeit', /online|distanz|videokonferenz|fernunterricht/, () => ['distanz']],
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
    ['zielart', /konzept|begriff\w*\s+verstehen|verstandnis|verstehen|zusammenhang/, () => 'konzepte'],
    ['zielart', /verfahren|rechnen|fertigkeit|prozedur|algorithmus|schrittfolge/, () => 'prozeduren'],
    ['zielart', /fakten|vokabel|auswendig|merkwissen|einpragen|jahreszahlen/, () => 'fakten'],
    ['modus', /reihe|einheit|sequenz|wochen|unterrichtsvorhaben|mehrere\s+stunden|ablauf/, () => 'ablauf']
  ];

  // Multi-value approach rules covering ALL 12 FMT ansatz codes (allows combining e.g. "kooperativ und spielerisch")
  const ANSATZ_RULES: Array<[string, RegExp]> = [
    ['forschend', /problemorientiert\w*|problembasiert\w*|forschend\w*|entdeckend\w*|experiment\w*|hypothese\w*/],
    ['kooperativ', /kooperativ\w*|gruppenarbeit|partnerarbeit|teamarbeit|peer-?learning|jigsaw|gruppenpuzzle/],
    ['instruktion', /direkte?\s+instruktion|lehrervortrag|explizit\w*\s+instruktion|darbietend\w*|vormachen/],
    ['offen', /offene\w*\s+unterricht|freiarbeit|stationen|werkstatt|wochenplan|projektbasiert\w*|projektarbeit/],
    ['spiel-simulation', /spielerisch\w*|gamification|planspiel|rollenspiel|simulation|spiel\b|quizspiel/],
    ['diskurs', /debatt\w*|diskurs\w*|diskussion|pro-?contra|streitgesprach|argumentier\w*/],
    ['kreativ', /kreativ\w*|brainstorming|ideen\s+sammeln|erfinden|design\s+thinking|geschichten\s+schreiben/],
    ['visualisierung', /visualisier\w*|mindmap|mind-?map|concept-?map|plakat|sketchnote\w*|schaubild|diagramm|strukturlegen/],
    ['uebung', /intensiv\w*\s+uben|trainier\w*|automatisier\w*|abrufubung|rechenverfahren\s+uben|festigen/],
    ['diagnose-feedback', /diagnose|lernstand\w*|kurztest|abfrage|peer-?feedback|ruckmeldung\s+einholen/],
    ['reflexion', /reflexion|reflektier\w*|lerntagebuch|portfolio|selbsteinschatzung|lernprozess\s+bilanzier/],
    ['digital-ki', /digital\w*\s+lern\w*|ki-?tutor|ki-?gestutzt|podcast|erklarvideo|stop-?motion|wiki\b|interaktiv\w*\s+whiteboard/]
  ];

  function lesen(text: string) {
    const t = fold(text || '');
    const kriterien: Record<string, unknown> = {};
    const erkannt: Array<{ feld: string; wert: unknown; beleg: string }> = [];
    const take = (feld: string, wert: unknown, beleg: string) => {
      if (!(feld in kriterien)) {
        kriterien[feld] = wert;
        erkannt.push({ feld, wert, beleg });
      }
    };
    RULES.forEach(([feld, re, fn]) => {
      const m = re.exec(t);
      if (m) take(feld, fn(m), m[0].trim());
    });

    // Collect all matched approaches (multi-label!)
    const ansatzHits: Array<{ code: string; beleg: string }> = [];
    for (const [code, re] of ANSATZ_RULES) {
      const m = re.exec(t);
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
      const m = new RegExp('\\b' + word + '\\w*').exec(t);
      if (m && !fns.some((x) => x.code === code)) fns.push({ code, beleg: m[0], at: m.index });
    });
    if (fns.length) {
      fns.sort((x, y) => x.at - y.at);
      take('lernfunktion', fns.map((x) => x.code), fns.map((x) => x.beleg).join(', '));
    }

    // Zero-LLM semantic scale fallback (BM25 + German trigrams) for casual phrasings missed by exact regexes
    if (t.length >= 12) {
      const sem = semantic.classifyScales(text);
      if (!('ansatz' in kriterien) && sem.scales.ansatz[0] && sem.scales.ansatz[0].score >= 0.55) {
        take('ansatz', [sem.scales.ansatz[0].code], `semantisch: ${sem.scales.ansatz[0].label}`);
      }
      if (!('lernfunktion' in kriterien) && !('zieltyp' in kriterien) && sem.scales.lernfunktion[0] && sem.scales.lernfunktion[0].score >= 0.65) {
        take('lernfunktion', [sem.scales.lernfunktion[0].code], `semantisch: ${sem.scales.lernfunktion[0].label}`);
      }
      if (!('anleitung' in kriterien) && sem.scales.anleitung[0] && sem.scales.anleitung[0].score >= 0.72) {
        take('anleitung', [sem.scales.anleitung[0].code], `semantisch: ${sem.scales.anleitung[0].label}`);
      }
    }

    const offen = FIELDS.filter((f) => f.stufe && !(f.feld in kriterien))
      .map((f) => f.feld)
      .filter((f) => !(f === 'zieltyp' && 'zielart' in kriterien) && !(f === 'zielart' && 'zieltyp' in kriterien));
    return { kriterien, erkannt, offen };
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

  function passung(b: Baustein, a: MatchRequest): string[] {
    const w: string[] = [];
    if (a.vorwissen && b.geeignetBeiVorwissen && !b.geeignetBeiVorwissen.includes(a.vorwissen)) {
      w.push(`Für Vorwissen „${label('vorwissen', a.vorwissen)}“ nicht vorgesehen (Expertise-Reversal).`);
    }
    if (a.bildungsstufe && (b.ungeeignetBeiStufe || []).includes(a.bildungsstufe)) {
      w.push(`Für die Bildungsstufe „${label('bildungsstufe', a.bildungsstufe)}“ spricht die Evidenz dagegen.`);
    }
    return w;
  }

  function rankOf(b: Baustein, a: MatchRequest, wantedFunctions: string[], extra = 0): number[] {
    const g = bestGrade(b);
    const wantedAnsatz = list(a.ansatz);
    const ansatzPenalty =
      wantedAnsatz.length === 0 ? 0 : wantedAnsatz.some((code) => (b.ansatz || []).includes(code)) ? 0 : 1;
    const wantedGuidance = list(a.anleitung);
    const guidancePenalty =
      wantedGuidance.length === 0 ? 0 : wantedGuidance.some((code) => (b.anleitung || []).includes(code)) ? 0 : 1;
    const wantedInter = list(a.interaktion);
    const interPenalty =
      wantedInter.length === 0 ? 0 : wantedInter.some((code) => (b.interaktion || []).includes(code)) ? 0 : 1;
    const wantedEng = list(a.engagement);
    const engPenalty =
      wantedEng.length === 0 ? 0 : wantedEng.some((code) => (b.engagement || []).includes(code)) ? 0 : 1;
    const wantedRange = list(a.reichweite);
    const rangePenalty = wantedRange.length === 0 ? 0 : wantedRange.includes(b.reichweite) ? 0 : 1;
    const softFilterPenalty = guidancePenalty + interPenalty + engPenalty + rangePenalty;
    return [
      extra,
      passung(b, a).length ? 1 : 0,
      ansatzPenalty,
      softFilterPenalty,
      g ? GRADE_ORDER.indexOf(g) : GRADE_ORDER.length,
      b.status === 'kuratiert' ? 0 : 1,
      wantedFunctions.length ? wantedFunctions.indexOf(b.lernfunktion[0]) + 1 || wantedFunctions.length + 1 : 0,
      b.vorbereitungMin
    ];
  }

  const byRank = (x: { b: Baustein; rank: number[] }, y: { b: Baustein; rank: number[] }) => {
    for (let i = 0; i < x.rank.length; i++) if (x.rank[i] !== y.rank[i]) return x.rank[i] - y.rank[i];
    return x.b.name.localeCompare(y.b.name, 'de');
  };

  const describe = (b: Baustein, a: MatchRequest, wanted: string[]): PhaseProposal => {
    const g = bestGrade(b);
    const reasons: string[] = [];
    const hit = b.lernfunktion.filter((f) => wanted.includes(f));
    if (hit.length) reasons.push('Lernfunktion: ' + hit.map((f) => label('lernfunktion', f)).join(', '));
    if ((b.nachbedingung || []).length) reasons.push('liefert: ' + states(b.nachbedingung).join(', '));
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
      gruende: reasons
    };
  };

  function phase(a: MatchRequest): Omit<PhaseMatchResult, 'kriterien' | 'erkannt' | 'offen'> {
    const fn = list(a.lernfunktion);
    const want = list(a.liefert);
    const art = list(a.zielart);
    const have = a.vorhanden !== undefined ? closure(list(a.vorhanden)) : null;
    const out = {
      funktion: 0,
      rahmen: [] as Array<{ baustein: string; name: string; grund: string }>,
      anschluss: [] as Array<{ baustein: string; name: string; grund: string }>
    };
    const hits: Array<{ b: Baustein; rank: number[] }> = [];

    data.bausteine.forEach((b) => {
      const gives = closure(b.nachbedingung || []);
      if (
        (fn.length && !fn.some((f) => b.lernfunktion.includes(f))) ||
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
      hits.push({ b, rank: rankOf(b, a, fn) });
    });

    hits.sort(byRank);
    const n = data.bausteine.length;
    return {
      modus: 'phase',
      vorschlaege: hits.map((h) => describe(h.b, a, fn)),
      ausgeschlossen: out,
      zaehler: {
        katalog: n,
        nachFunktion: n - out.funktion,
        nachRahmen: n - out.funktion - out.rahmen.length,
        nachAnschluss: hits.length,
        mitWarnung: hits.filter((h) => h.rank[1]).length
      }
    };
  }

  const midDuration = (b: Baustein) =>
    Math.max(b.dauerMin, Math.min(b.dauerMax, Math.round((b.dauerMin + b.dauerMax) / 2 / 5) * 5));
  const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;
  const slotSum = (n: EinsatzNode) => (n.belegung || []).reduce((s, x) => s + ((x.inhalt as EinsatzNode).dauerMin || 0), 0);

  function candidates(
    functions: string[],
    maxRang: number,
    a: MatchRequest,
    used: Set<string> | null,
    target?: string
  ): Baustein[] {
    return data.bausteine
      .filter((b) => (rang.get(b.reichweite) ?? 0) <= maxRang && b.lernfunktion.some((f) => functions.includes(f)) && !rahmen(b, a))
      .map((b) => {
        const reaches = !target || closure(b.nachbedingung || []).has(target);
        return { b, rank: rankOf(b, a, functions, (reaches ? 0 : 2) + (used && used.has(b.kennung) ? 1 : 0)) };
      })
      .sort(byRank)
      .map((x) => x.b);
  }

  function ablauf(a: MatchRequest, kette: Funktionskette): Omit<AblaufMatchResult, 'kriterien' | 'erkannt' | 'offen'> & { offen: string[] } {
    const kontext: Arrangement['kontext'] = {};
    if (a.bildungsstufe) kontext.bildungsstufe = a.bildungsstufe;
    if (a.vorwissen) kontext.vorwissen = a.vorwissen;
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

    kette.schritte.forEach((step) => {
      const cands = candidates(step.funktion, 3, a, used, step.ziel);
      let chosen: EinsatzNode | null = null;
      for (const b of cands) {
        for (const onlyMandatory of [true, false]) {
          if (!onlyMandatory && !(b.slot || []).some((s) => !s.pflicht)) continue;
          const n = fill(
            { typ: 'Einsatz', baustein: b.kennung, dauerMin: midDuration(b), kettenschritt: step.id },
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
      used.add(chosen.baustein);
      (chosen.belegung || []).forEach((x) => {
        if (x.inhalt.typ === 'Einsatz') used.add(x.inhalt.baustein);
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

    if (kette.schritte.some((s) => s.ziel === 'wissen-konsolidiert')) {
      const rec = candidates(['konsolidierung'], 1, a, null, 'wissen-konsolidiert')[0];
      if (rec) {
        teile.push(Object.assign({ typ: 'Wiederkehr' as const, baustein: rec.kennung, dauerMin: rec.dauerMin }, RECURRENCE));
      }
    }

    const arrangement = wrap(teile);
    if (given(a.zeitMin)) {
      arrangement.kontext!.zeitbudgetMin = Number(a.zeitMin);
      if (validator.validate(arrangement).dauerMin > Number(a.zeitMin)) {
        const shrink = (n: ArrangementNode) => {
          if (n.typ === 'Einsatz') {
            (n.belegung || []).forEach((x) => shrink(x.inhalt));
            n.dauerMin = Math.max(blocks.get(n.baustein)!.dauerMin, slotSum(n));
          }
        };
        if (arrangement.ablauf.typ === 'Sequenz') arrangement.ablauf.teile.forEach(shrink);
      }
    }

    const r = validator.validate(arrangement);
    return {
      modus: 'ablauf',
      kette: { id: kette.id, label: kette.label },
      schritte,
      offen,
      arrangement,
      pruefung: {
        gueltig: r.gueltig,
        dauerMin: r.dauerMin,
        endzustand: states(r.endzustand),
        meldungen: r.meldungen
      }
    };
  }

  function zuordnen(anfrage: MatchRequest = {}): MatchResult {
    check(anfrage);
    const gelesen = given(anfrage.text) ? lesen(String(anfrage.text)) : { kriterien: {}, erkannt: [], offen: [] };
    const a: MatchRequest = { ...gelesen.kriterien };
    Object.keys(anfrage).forEach((k) => {
      if (k !== 'text' && given(anfrage[k])) a[k] = anfrage[k];
    });
    const hasPhase = list(a.lernfunktion).length || list(a.liefert).length;
    const modus = a.modus || (a.zieltyp || (a.zielart && !hasPhase) ? 'ablauf' : 'phase');
    const head = {
      kriterien: a,
      erkannt: gelesen.erkannt,
      offen: FIELDS.filter((f) => f.stufe && !given(a[f.feld])).map((f) => f.feld)
    };
    if (modus === 'phase') return Object.assign(head, phase(a));
    const ketten = a.zieltyp
      ? [chains.get(a.zieltyp)!].filter(Boolean)
      : data.ketten.filter((k) => (k.zielart || []).includes(String(a.zielart)));
    if (!ketten.length) {
      return Object.assign(head, {
        modus: 'ablauf' as const,
        hinweis: 'Kein Zieltyp bestimmbar. Bitte zieltyp angeben: ' + data.ketten.map((k) => k.id).join(', ') + '.'
      });
    }
    const res = ablauf(a, ketten[0]);
    return Object.assign(head, res, {
      weitereKetten: ketten.slice(1).map((k) => ({ id: k.id, label: k.label }))
    });
  }

  return { zuordnen, lesen, felder, schema };
}
