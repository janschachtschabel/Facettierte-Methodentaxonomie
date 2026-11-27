/**
 * Reads subject and topic from a free-text request. Shared by server and web so both
 * show the same topic. The topic is what remains after all frame information
 * (grade, time, group size, learner groups, technology, approach) is removed.
 */
import { liesBegleitziele } from './begleitziel.js';
import { nurRaumangabe } from './raumwoerter.js';

/**
 * Subject label from a subject name in the text, or else from a topic word that belongs to one subject ("Klimawandel" →
 * Geografie). Entries: [subject name, topic words or null, label]; names are checked for all subjects before topic words.
 */
const SUBJECT_PATTERNS: Array<[RegExp, RegExp | null, string]> = [
  [/\bmathematik\b|\bmathe\b/i, /\bbruchrechn|\bgleichung|\bgeometrie|\balgebra/i, 'Mathematik'],
  [/\bphysik\b/i, /\bdichte\b|\belektrizit|\bmechanik|\boptik/i, 'Physik'],
  [/\bbiologie\b|\bbio\b/i, /\bökosystem|\boekosystem|\bfotosynthese|\bzelle\b|\bgenetik/i, 'Biologie'],
  [/\bchemie\b/i, /\bsäure|\blauge|\batom|\bmolekül|\breaktion/i, 'Chemie'],
  [/\bdeutsch\b(?!\s+als\s+zweitsprache)/i, /\bargumentier|\bgedicht|\brechtschreib|\baufsatz|\blerntext/i, 'Deutsch'],
  [/\benglisch\b|\benglish\b/i, null, 'Englisch'],
  [/\bfranzösisch\b|\bfranzoesisch\b/i, null, 'Französisch'],
  [/\bspanisch\b/i, null, 'Spanisch'],
  // "die Geschichte vom barmherzigen Samariter" is a story, not the subject.
  [/\bgeschichte\b(?!\s+(?:vom|von|über|zu[mr]?)\b)/i, /\bweimar|\bantike|\bmittelalter|\bindustrialisierung/i, 'Geschichte'],
  [/\bpolitik\b|\bgemeinschaftskunde\b|\bsozialkunde\b/i, /\bdemokratie|\bgewaltenteilung/i, 'Politik'],
  [/\bgeografie\b|\bgeographie\b|\berdkunde\b/i, /\bklimawandel/i, 'Geografie'],
  [/\binformatik\b/i, /\bprogrammieren|\balgorithm/i, 'Informatik'],
  [/\bwirtschaft\b|\bökonomie\b/i, null, 'Wirtschaft'],
  [/\bethik\b|\bphilosophie\b/i, null, 'Ethik / Philosophie'],
  [/\breligion\b/i, null, 'Religion'],
  [/\bkunst(?:unterricht|stunde)?\b/i, null, 'Kunst'],
  [/\bmusik(?:unterricht|stunde)?\b/i, null, 'Musik'],
  [/\bsport(?:unterricht|stunde)?\b/i, null, 'Sport'],
  [/\bhauswirtschaft\b|\bernährung\b/i, /\blebensmittel|\bverbraucherbildung/i, 'Ernährung & Verbraucherbildung'],
  [/\bbne\b/i, /\bnachhaltigkeit\b/i, 'Nachhaltigkeit (BNE)'],
  [/\bsachunterricht\b/i, null, 'Sachunterricht'],
  // Last, so that DaZ as a learner trait in another subject's lesson does not win
  [/\bdeutsch als zweitsprache\b|\bdaz\b/i, null, 'Deutsch als Zweitsprache']
];

const PEOPLE =
  '(?:schülerinnen und schüler[n]?|schüler(?:innen|n)?|lernende[nr]?|kinder[n]?|sus|studierende[nr]?|teilnehmende[nr]?|teilnehmer(?:innen)?|azubis|auszubildende[nr]?|personen)';
const DEVICES = '(?:geräte[n]?|tablets?|ipads?|laptops?|computer[n]?|handys?|smartphones?|beamer|internet|wlan|ki|strom|technik|digitale[nr]?\\s+(?:geräte[n]?|medien))';
const LEARNER_TRAIT =
  '(?:daz|deutsch als zweitsprache|lrs|legasthen\\w*|adhs|ads|autis\\w*|förderbedarf(?:\\s+\\w+)?|lernschw\\w*|leistungsstark\\w*|leistungsschwach\\w*|hochbegabt\\w*|schüchtern\\w*|unmotiviert\\w*|sprachförder\\w*|hörbeeinträcht\\w*|sehbeeinträcht\\w*)';
const SUBJECT_WORDS =
  '(?:mathematik|mathe|physik|biologie|chemie|deutsch|englisch|französisch|spanisch|geschichte|politik|geografie|geographie|erdkunde|informatik|ethik|religion|kunst|musik|sport|wirtschaft|sachunterricht)';

// Frame information that is safe to remove anywhere in the text. Order matters: longer phrases first.
const INLINE_FRAME: RegExp[] = [
  /\b(?:ich\s+(?:möchte|will|plane|brauche|suche)|wir\s+(?:möchten|wollen|planen)|bitte|plane\s+mir|erstelle\s+mir|gesucht\s+(?:ist|wird))\b/gi,
  /\b(?:lassen|durchführen|machen|unterrichten|behandeln|einführen)\s*(?=[,.;]|$)/gi,
  // The request itself: "ein Szenario unterstellen für den …", "einen Stundenablauf planen zu …"
  /\b(?:eine?[nm]?\s+)?(?:unterrichts)?(?:szenario|stundenablauf|ablauf|unterrichtsentwurf|stundenentwurf|verlaufsplan)\s+(?:(?:unterstellen|erstellen|planen|entwerfen|bauen|machen)\b(?:\s+(?:für|zu[mr]?)(?:\s+(?:den|die|das|eine[nr]?))?\b)?|(?:für|zu[mr]?)\b(?:\s+(?:den|die|das|eine[nr]?)\b)?)/gi,
  // A check at the end is frame information, not the topic: "mit anschließender Leistungskontrolle"
  /\b(?:mit\s+)?(?:(?:an|ab)schließende[rmn]?\s+|kurze[rmn]?\s+|einer?\s+)?(?:leistungs(?:kontrolle|überprüfung|messung|nachweis)|lern(?:ziel|erfolgs|stands)?kontrolle|lernstandserhebung|abschlusstest|kurztest)(?:\s+am\s+ende)?(?:\s+am\s+schluss)?\b/gi,
  /\b(?:problemorientiertes?|problembasiertes?|forschendes?|entdeckendes?|kooperatives?|projektbasiertes?|handlungsorientiertes?|offenes?)\s+lernen\b/gi,
  /\b(?:eine[rn]?\s+)?(?:direkte\s+instruktion|unterrichtsreihe|unterrichtseinheit|unterrichtsstunde|einzelstunde|doppelstunde|stunde|sequenz|modul)\b(?!\s+null)(?!-)/gi,
  /\b(?:mit\s+)?\d+\s*[x×]\s*\d+\s*(?:minuten|min\b\.?)/gi,
  /\b\d+(?:[.,]\d)?\s*(?:minuten|min\b\.?|stunden|unterrichtsstunden|doppelstunden|wochen|tage)\b/gi,
  // Counted learner groups: "davon 5 mit DaZ", "4 sehr leistungsstarke Kinder"
  new RegExp(`\\b(?:davon\\s+)?\\d+\\s*(?:${PEOPLE}\\s+)?(?:mit\\s+)?(?:sehr\\s+)?${LEARNER_TRAIT}(?:[-\\s]*${PEOPLE})?`, 'gi'),
  /\b(?:für\s+|in\s+(?:der\s+|einer\s+)?|im\s+)?(?:klasse|klassenstufe|jahrgang(?:sstufe)?|jg\.?|stufe)\s*\d+(?:\s*[-–/]\s*\d+)?\.?/gi,
  /\b(?:für\s+|in\s+(?:der\s+)?)?\d+\.\s*klasse\b/gi,
  /\b(?:für\s+(?:die\s+)?|in\s+der\s+)?(?:sekundarstufe\s*(?:i{1,2}|1|2)|grundschule|oberstufe|mittelstufe|berufsschule)\b/gi,
  /\b(?:sehr\s+)?(?:geringes?|wenig|kaum|kein|mittleres?|hohes?|viel)\s+vorwissen\b/gi,
  /\bdeutsch als zweitsprache\b(?=\s*:)/gi,
  /^\s*(?:das\s+)?thema\b:?/gi
];

// The subject read as the subject: at the start of the text or as its own comma part. Elsewhere a subject word belongs to the
// topic ("funktionelle Gruppen der organischen Chemie"); so does one followed by its object ("Geschichte des Internets",
// "Religion und Staat", "die Geschichte vom barmherzigen Samariter").
const SUBJECT_NAME = `${SUBJECT_WORDS}(?:unterricht)?\\b(?!\\s+(?:des|der|und|als|im|in\\s+der|vom|von|über|zu[mr]?)\\b)(?!-)`;
const SUBJECT_AT_START = new RegExp(`^[\\s.:;,–-]*(?:(?:in|im)\\s+)?${SUBJECT_NAME}`, 'i');
const SUBJECT_PART = new RegExp(`^${SUBJECT_NAME}$`, 'i');
// A comma part that only names a phase of the lesson ("20 Minuten Wiederholung") says what the lesson does, not its topic.
const PHASE_PART = /^(?:wiederholung|einstieg|sicherung|übung|übungsstunde|erarbeitung|abschluss)$/i;

// Frame information that also occurs as a topic ("Leben ohne Strom", "Die 3 Kinder aus …").
// It is only dropped when it fills a whole comma-separated part.
const WHOLE_PART_FRAME: RegExp[] = [
  new RegExp(`^(?:ohne|keine?|nur\\s+(?:ein|eine|einen)|mit)\\s+${DEVICES}(?:\\s+(?:und|oder)\\s+${DEVICES})*$`, 'i'),
  new RegExp(`^(?:(?:für|mit|bei)\\s+)?\\d+\\s*${PEOPLE}$`, 'i'),
  new RegExp(`^(?:(?:mit|und)\\s+)?(?:einigen|mehreren|vielen|wenigen|einige|viele)?\\s*${LEARNER_TRAIT}(?:[-\\s]*${PEOPLE})?(?:\\s+(?:und|oder)\\s+${LEARNER_TRAIT})*$`, 'i'),
  /^(?:für\s+(?:die\s+)?|in\s+der\s+|an\s+der\s+)?(?:unterstufe|hochschule|universität|erwachsenenbildung|vhs|fortbildung)$/i
];
// The same information at the end of a part, where a preposition marks it as frame: "Bruchrechnen für 26 Schüler".
const TRAILING_FRAME = new RegExp(`\\s+(?:für|bei)\\s+\\d+\\s*${PEOPLE}$`, 'i');

const DANGLING = /^(?:(?:in|im|für|mit|und|oder|zu|zur|zum|bei|davon|sowie|an|am|der|die|das|den|dem|des|eine[rn]?)\b[\s:]*)+$/i;
const LEADING = /^(?:(?:in|im|für|mit|und|oder|davon|sowie|bei)\b\s*)+/i;
const LEADING_ABOUT = /^(?:eine[rn]?\s+)?(?:zu[mr]?|über)\s+/i;
const TRAILING = /(?:\s*\b(?:in|im|für|mit|und|oder|zu|zur|zum|bei|davon|sowie|an|am|der|die|das|den|dem))+\s*$/i;

export interface SubjectAndTopic {
  fach: string | null;
  thema: string | null;
  /** true: the text names no subject; the subject is guessed from a topic word ("Klimawandel" → Geografie). */
  fachAusThema?: boolean;
}

export function extractSubjectAndTopic(raw: string): SubjectAndTopic {
  // An accompanying goal ("soziales Lernen stärken") is no topic (D3).
  const firstLine = liesBegleitziele((raw || '').split(/\n\s*Zusatzangaben:/i)[0]).rest.trim();
  if (!firstLine) return { fach: null, thema: null };

  const named = SUBJECT_PATTERNS.find(([name]) => name.test(firstLine));
  const guessed = named ? undefined : SUBJECT_PATTERNS.find(([, topic]) => topic?.test(firstLine));
  const fach = named?.[2] ?? guessed?.[2] ?? null;

  let text = firstLine;
  for (const re of INLINE_FRAME) text = text.replace(re, ' ');
  text = text.replace(SUBJECT_AT_START, ' ');

  const trim = (p: string) => p.replace(/\s{2,}/g, ' ').replace(/\s+([:?!])/g, '$1').replace(/^[\s.:;–-]+|[\s.:;–-]+$/g, '').trim();
  const cleanPart = (p: string) => {
    let out = trim(p);
    if (WHOLE_PART_FRAME.some((re) => re.test(out)) || SUBJECT_PART.test(out) || PHASE_PART.test(out) || nurRaumangabe(out)) return '';
    out = trim(out.replace(TRAILING_FRAME, ''));
    if (WHOLE_PART_FRAME.some((re) => re.test(out))) return '';
    // "Leben ohne Strom" keeps its preposition; only a part that starts with one loses it.
    return trim(out.replace(LEADING, '').replace(LEADING_ABOUT, '').replace(TRAILING, ''));
  };

  const parts = text
    // "2. Lehrjahr", "1. Semester": a full stop after an ordinal number ends no sentence.
    .split(/[,;]|(?<!(?:^|\s)\d{1,2})\.\s|\s[-–]\s/)
    .map(cleanPart)
    .filter((p) => p.length >= 2 && !DANGLING.test(p) && /[a-zäöüß]{2}/i.test(p));

  const thema = parts.join(', ').slice(0, 110).trim();
  return { fach, thema: thema.length >= 3 ? thema : null, ...(guessed ? { fachAusThema: true } : {}) };
}
