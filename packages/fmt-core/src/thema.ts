/**
 * Reads subject and topic from a free-text request. Shared by server and web so both
 * show the same topic. The topic is what remains after all frame information
 * (grade, time, group size, learner groups, technology, approach) is removed.
 */
import { liesBegleitziele } from './begleitziel.js';

const SUBJECT_PATTERNS: Array<[RegExp, string]> = [
  [/\bmathematik\b|\bmathe\b|\bbruchrechn|\bgleichung|\bgeometrie|\balgebra/i, 'Mathematik'],
  [/\bphysik\b|\bdichte\b|\belektrizit|\bmechanik|\boptik/i, 'Physik'],
  [/\bbiologie\b|\bbio\b|\bökosystem|\boekosystem|\bfotosynthese|\bzelle\b|\bgenetik/i, 'Biologie'],
  [/\bchemie\b|\bsäure|\blauge|\batom|\bmolekül|\breaktion/i, 'Chemie'],
  [/\bdeutsch\b(?!\s+als\s+zweitsprache)|\bargumentier|\bgedicht|\brechtschreib|\baufsatz|\blerntext/i, 'Deutsch'],
  [/\benglisch\b|\benglish\b/i, 'Englisch'],
  [/\bfranzösisch\b|\bfranzoesisch\b/i, 'Französisch'],
  [/\bspanisch\b/i, 'Spanisch'],
  [/\bgeschichte\b|\bweimar|\bantike|\bmittelalter|\bindustrialisierung/i, 'Geschichte'],
  [/\bpolitik\b|\bgemeinschaftskunde\b|\bsozialkunde\b|\bdemokratie|\bgewaltenteilung/i, 'Politik'],
  [/\bgeografie\b|\bgeographie\b|\berdkunde\b|\bklimawandel/i, 'Geografie'],
  [/\binformatik\b|\bprogrammieren|\balgorithm/i, 'Informatik'],
  [/\bwirtschaft\b|\bökonomie\b/i, 'Wirtschaft'],
  [/\bethik\b|\bphilosophie\b/i, 'Ethik / Philosophie'],
  [/\breligion\b/i, 'Religion'],
  [/\bkunst(?:unterricht|stunde)?\b/i, 'Kunst'],
  [/\bmusik(?:unterricht|stunde)?\b/i, 'Musik'],
  [/\bsport(?:unterricht|stunde)?\b/i, 'Sport'],
  [/\bhauswirtschaft\b|\bernährung\b|\blebensmittel|\bverbraucherbildung/i, 'Ernährung & Verbraucherbildung'],
  [/\bnachhaltigkeit\b|\bbne\b/i, 'Nachhaltigkeit (BNE)'],
  [/\bsachunterricht\b/i, 'Sachunterricht'],
  // Last, so that DaZ as a learner trait in another subject's lesson does not win
  [/\bdeutsch als zweitsprache\b|\bdaz\b/i, 'Deutsch als Zweitsprache']
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
  // A subject name is frame information unless it is part of the topic ("Geschichte des Internets", "Religion und Staat")
  new RegExp(`\\b${SUBJECT_WORDS}(?:unterricht)?\\b(?!\\s+(?:des|der|und|als|im|in\\s+der)\\b)(?!-)`, 'gi'),
  /^\s*(?:das\s+)?thema\b:?/gi
];

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

export function extractSubjectAndTopic(raw: string): { fach: string | null; thema: string | null } {
  // An accompanying goal ("soziales Lernen stärken") is no topic (D3).
  const firstLine = liesBegleitziele((raw || '').split(/\n\s*Zusatzangaben:/i)[0]).rest.trim();
  if (!firstLine) return { fach: null, thema: null };

  let fach: string | null = null;
  for (const [re, label] of SUBJECT_PATTERNS) {
    if (re.test(firstLine)) {
      fach = label;
      break;
    }
  }

  let text = firstLine;
  for (const re of INLINE_FRAME) text = text.replace(re, ' ');

  const trim = (p: string) => p.replace(/\s{2,}/g, ' ').replace(/\s+([:?!])/g, '$1').replace(/^[\s.:;–-]+|[\s.:;–-]+$/g, '').trim();
  const cleanPart = (p: string) => {
    let out = trim(p);
    if (WHOLE_PART_FRAME.some((re) => re.test(out))) return '';
    out = trim(out.replace(TRAILING_FRAME, ''));
    if (WHOLE_PART_FRAME.some((re) => re.test(out))) return '';
    // "Leben ohne Strom" keeps its preposition; only a part that starts with one loses it.
    return trim(out.replace(LEADING, '').replace(LEADING_ABOUT, '').replace(TRAILING, ''));
  };

  const parts = text
    .split(/[,;]|\.\s|\s[-–]\s/)
    .map(cleanPart)
    .filter((p) => p.length >= 2 && !DANGLING.test(p) && /[a-zäöüß]{2}/i.test(p));

  const thema = parts.join(', ').slice(0, 110).trim();
  return { fach, thema: thema.length >= 3 ? thema : null };
}
