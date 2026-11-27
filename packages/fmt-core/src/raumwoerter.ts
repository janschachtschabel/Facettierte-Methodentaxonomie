import { foldDe } from './semantic.js';

/**
 * Room words of a free-text request (folded text: lower case, no diacritics, ß as ss). Shared by the reading of the
 * request (zuordnung.ts, field raum) and by the topic (thema.ts), which drops a comma part that only names the room.
 * Order matters: the first rule that matches gives the room.
 */
export const RAUM_REGELN: ReadonlyArray<readonly [string, RegExp]> = [
  // The room must be named as a place ("im Labor", "auf dem Schulhof"); "Wortschatz in der Küche" or "Tiere im Wald" is a topic.
  // "im Klassenraum", "in einem Seminarraum" or a bare list item ("…, Klassenraum, 45 Minuten"); "Klassenraumgestaltung" is a topic.
  [
    'klassenraum',
    /\b(?:im|in\s+einem|in\s+dem)\s+(?:klassen(?:raum|zimmer)|seminarraum)\b(?!-)|(?:^|[,;:]\s*)(?:klassen(?:raum|zimmer)|seminarraum)\s*(?:[,;.]|$)|\bsporttheorie\b|\btheoriestunde\b/
  ],
  ['hoersaal', /\bhorsaal\w*|(?<!\bzur\s)\bvorlesung\b(?!\s+(?:vor|nach)\w*)/],
  ['bewegungsraum', /\b(?:turn|sport|gymnastik)halle\b|\bin\s+der\s+halle\b|\bsportplatz\b|\bgymnastikraum\b/],
  // Named special rooms first, also hyphenated ("Biologie-Fachraum", "Physik-Raum"); a bare room word counts only as its
  // own list item ("…, Werkstatt, 180 Minuten").
  [
    'fachraum-nawi',
    /\b(?:im|ins)\s+(?:chemie|physik|bio(?:logie)?|schul|fach)?labor\b|\blaborpraktikum\b|\bschulerlabor\b|\b(?:chemie|physik|bio(?:logie)?|nawi)-?(?:raum|saal|fachraum)\b|(?:^|[,;:]\s*)labor\s*(?:[,;.]|$)/
  ],
  ['musikraum', /\bmusik(?:raum|saal)\b/],
  [
    'werkraum',
    /\b(?:werk|kunst|technik)-?raum\b|\bin\s+der\s+(?:lehr|schul|ubungs)?werkstatt\b|\b(?:lehr|ubungs)werkstatt\b|(?:^|[,;:]\s*)werkstatt\s*(?:[,;.]|$)/
  ],
  ['lehrkueche', /\b(?:lehr|schul)kuche\b/],
  ['computerraum', /\b(?:computer|pc|rechner|edv)-?raum\b/],
  [
    'fachraum',
    /\bim\s+(?:fachraum|ubungsraum|praxisraum|makerspace)\b|(?:^|[,;:]\s*)fachraum\s*(?:[,;.]|$)|\bskills?\s*-?lab\b|\ban\s+ubungskopf\w*|\ban\s+der\s+puppe\b/
  ],
  [
    'draussen',
    /\bdraussen\b(?!\s+und\s+drinnen)|\bauf\s+dem\s+schulhof\b|\bim\s+freien\b|\bim\s+schulgarten\b|\bunterrichtsgang\b|\b(?:auf|bei)\s+(?:der|einer)\s+exkursion\b/
  ],
  [
    'ausserschulisch',
    /\b(?:am|an\s+einem|im)\s+ausserschulisch\w*\s+lernort\w*|\bausserschulisch\w*\s+lernort\w*|\bim\s+(?:ausbildungs)?betrieb\b|\bam\s+arbeitsplatz\b|\bim\s+museum\b/
  ],
  // Only when no other room is named (the first raum rule that matches wins); a theatre's seating is a topic.
  ['hoersaal', /\bfester?\s+bestuhlung\b(?!\s+(?:im|in\s+der|des|der)\s+(?:theater|oper|kino|kirche|konzert)\w*)/],
  ['digital', /\bonline\b|\bvideokonferenz\w*/]
];

/** Whether a part of the text names only the room ("Hörsaal", "Biologie-Fachraum", "draußen", "Skills Lab"). */
export function nurRaumangabe(teil: string): boolean {
  const t = foldDe(teil).trim();
  if (!t) return false;
  return RAUM_REGELN.some(([, re]) => {
    const m = re.exec(t);
    return Boolean(m) && m![0].replace(/^[\s,;:]+|[\s,;.]+$/g, '') === t.replace(/[\s,;.]+$/g, '');
  });
}
