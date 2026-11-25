/**
 * Reads subject and topic from a free-text request. Shared by server and web so both
 * show the same topic. The topic is what remains after all frame information
 * (grade, time, group size, learner groups, technology, approach) is removed.
 */
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
  [/\bkunst\b/i, 'Kunst'],
  [/\bmusik\b/i, 'Musik'],
  [/\bsport\b/i, 'Sport'],
  [/\bhauswirtschaft\b|\bernährung\b|\blebensmittel|\bverbraucherbildung/i, 'Ernährung & Verbraucherbildung'],
  [/\bnachhaltigkeit\b|\bbne\b/i, 'Nachhaltigkeit (BNE)'],
  [/\bsachunterricht\b/i, 'Sachunterricht']
];

const PEOPLE = '(?:schüler(?:innen|n)?|schülerinnen und schüler|lernende[nr]?|kinder[n]?|sus|studierende[nr]?|teilnehmende[nr]?|teilnehmer(?:innen)?|azubis|auszubildende[nr]?|personen)';
const DEVICES = '(?:geräte[n]?|tablets?|ipads?|laptops?|computer[n]?|handys?|smartphones?|beamer|internet|wlan|ki|strom|technik|digitale[nr]?\\s+(?:geräte[n]?|medien))';
const LEARNER_TRAIT =
  '(?:daz(?:-\\w+)?|deutsch als zweitsprache|lrs|legasthen\\w*|adhs|ads|autis\\w*|förderbedarf(?:\\s+\\w+)?|lernschw\\w*|leistungsstark\\w*|leistungsschwach\\w*|hochbegabt\\w*|schüchtern\\w*|unmotiviert\\w*|sprachförder\\w*|hörbeeinträcht\\w*|sehbeeinträcht\\w*)';

// Each entry removes one kind of frame information. Order matters: longer phrases first.
const FRAME_PATTERNS: RegExp[] = [
  /\b(?:ich\s+(?:möchte|will|plane|brauche|suche)|wir\s+(?:möchten|wollen|planen)|bitte|plane\s+mir|erstelle\s+mir|gesucht\s+(?:ist|wird))\b/gi,
  /\b(?:lassen|durchführen|machen|unterrichten|behandeln|einführen)\s*(?=[,.;]|$)/gi,
  /\b(?:problemorientiertes?|problembasiertes?|forschendes?|entdeckendes?|kooperatives?|projektbasiertes?|handlungsorientiertes?|offenes?)\s+lernen\b/gi,
  /\b(?:direkte\s+instruktion|unterrichtsreihe|unterrichtseinheit|unterrichtsstunde|einzelstunde|doppelstunde|stunde|sequenz|modul)\b/gi,
  /\b(?:mit\s+)?\d+\s*[x×]\s*\d+\s*(?:minuten|min\b\.?)/gi,
  /\b\d+(?:[.,]\d)?\s*(?:minuten|min\b\.?|stunden|unterrichtsstunden|doppelstunden|wochen|tage)/gi,
  new RegExp(`\\b(?:davon\\s+)?\\d+\\s*(?:${PEOPLE}\\s+)?(?:mit\\s+)?(?:sehr\\s+)?${LEARNER_TRAIT}(?:[-\\s]*${PEOPLE})?`, 'gi'),
  new RegExp(`\\b(?:mit\\s+)?(?:einigen|mehreren|vielen|wenigen)?\\s*${LEARNER_TRAIT}(?:[-\\s]*${PEOPLE})\\b`, 'gi'),
  new RegExp(`\\b(?:für|mit|bei)?\\s*\\d+\\s*${PEOPLE}\\b`, 'gi'),
  /\b(?:für\s+|in\s+(?:der\s+|einer\s+)?|im\s+)?(?:klasse|klassenstufe|jahrgang(?:sstufe)?|jg\.?|stufe)\s*\d+(?:\s*[-–/]\s*\d+)?\.?/gi,
  /\b(?:für\s+|in\s+(?:der\s+)?)?\d+\.\s*klasse\b/gi,
  /\b(?:für\s+(?:die\s+)?|in\s+der\s+|an\s+der\s+)?(?:sekundarstufe\s*(?:i{1,2}|1|2)|grundschule|oberstufe|mittelstufe|unterstufe|berufsschule|hochschule|universität|erwachsenenbildung|vhs)\b/gi,
  /\b(?:sehr\s+)?(?:geringes?|wenig|kaum|kein|mittleres?|hohes?|viel)\s+vorwissen\b/gi,
  new RegExp(`\\b(?:ohne|keine?|nur\\s+(?:ein|eine|einen)|mit)\\s+${DEVICES}(?:\\s+(?:und|oder)\\s+${DEVICES})?`, 'gi'),
  /\b(?:mathematik|mathe|physik|biologie|chemie|deutsch|englisch|französisch|spanisch|geschichte|politik|geografie|geographie|erdkunde|informatik|ethik|religion|kunst|musik|sport|wirtschaft|sachunterricht)(?:unterricht)?\b/gi,
  /^\s*(?:das\s+)?thema\b:?/gi
];

const DANGLING = /^(?:(?:in|im|für|mit|und|oder|zu|zur|zum|bei|davon|sowie|an|am|der|die|das|den|dem|des)\b[\s:]*)+$/i;
const LEADING = /^(?:(?:in|im|für|mit|und|oder|davon|sowie|bei)\b\s*)+/i;
const TRAILING = /(?:\s*\b(?:in|im|für|mit|und|oder|zu|zur|zum|bei|davon|sowie|an|am|der|die|das|den|dem))+\s*$/i;

export function extractSubjectAndTopic(raw: string): { fach: string | null; thema: string | null } {
  const firstLine = (raw || '').split(/\n\s*Zusatzangaben:/i)[0].trim();
  if (!firstLine) return { fach: null, thema: null };

  let fach: string | null = null;
  for (const [re, label] of SUBJECT_PATTERNS) {
    if (re.test(firstLine)) {
      fach = label;
      break;
    }
  }

  let text = firstLine;
  for (const re of FRAME_PATTERNS) text = text.replace(re, ' ');

  const cleanPart = (p: string) =>
    p
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s.:;–-]+|[\s.:;–-]+$/g, '')
      .replace(LEADING, '')
      .replace(TRAILING, '')
      .trim();

  const parts = text
    .split(/[,;]/)
    .map(cleanPart)
    .filter((p) => p.length >= 2 && !DANGLING.test(p) && /[a-zäöüß]{2}/i.test(p));

  const thema = parts.join(', ').slice(0, 110).trim();
  return { fach, thema: thema.length >= 3 ? thema : null };
}
