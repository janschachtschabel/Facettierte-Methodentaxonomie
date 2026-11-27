/**
 * Accompanying goals (FMT 2.0, Paket D, D3): language, social learning, self-regulation. They never choose the chain;
 * this module reads them from a request text. Shared by the matcher and the topic reader, so the phrase neither
 * steers the plan nor enters the topic.
 */

/** Umlaut spellings the reading rules for accompanying goals accept: ä, ae or a (likewise ö, ü, ß). */
const U = { a: '(?:ä|ae|a)', o: '(?:ö|oe|o)', u: '(?:ü|ue|u)', ss: '(?:ß|ss)' };

/**
 * Reading rules for accompanying goals (Paket D, D3), on the original text (case and umlauts kept, so the rest of the
 * text stays as written). Each core phrase may come with a filler before ("zusätzlich", "nebenbei", "mit") and a verb
 * after ("fördern", "stärken"); the whole phrase leaves the text, so it neither sets a goal kind, an approach or a
 * function nor enters the topic. "Zusammenarbeit" counts only with "stärken" or "fördern": a team workshop on
 * collaboration names its topic. The rules stand in the order of the scheme begleitziel.
 */
const BEGLEITZIEL_KERNE: Array<[code: string, kern: string]> = [
  ['sprache', String.raw`sprachsensib\p{L}*|fachsprach\p{L}*|bildungssprach\p{L}*`],
  ['sozial', String.raw`soziale[snm]?\s+lernen|zusammenarbeit\s+(?:st${U.a}rken|f${U.o}rdern)|klassenklimas?`],
  ['selbstregulation', String.raw`selbstregulation\p{L}*|lernen\s+lernen|lernstrategie\p{L}*`]
];
const BEGLEITZIEL_VOR = String.raw`(?:(?:zus${U.a}tzlich|nebenbei|au${U.ss}erdem|dabei|gleichzeitig|auch|und|sowie|mit)\s+)*(?:(?:die|das|den|der|ein|eine|einen)\s+)?(?:f${U.o}rderung\s+(?:der|des|von)\s+)?`;
const BEGLEITZIEL_NACH = String.raw`(?:\s+(?:f${U.o}rdern|st${U.a}rken|unterst${U.u}tzen|trainieren|verbessern|aufbauen|${U.u}ben|entwickeln))?`;
const BEGLEITZIEL_REGELN: Array<[string, RegExp]> = BEGLEITZIEL_KERNE.map(([code, kern]) => [
  code,
  new RegExp(String.raw`(?<!\p{L})${BEGLEITZIEL_VOR}(?:${kern})${BEGLEITZIEL_NACH}(?!\p{L})`, 'giu')
]);

/**
 * Accompanying goals named in a request text, in the order of the scheme, with the phrases as evidence; `rest` is the
 * text without those phrases.
 */
export function liesBegleitziele(text: string): { codes: string[]; belege: string[]; rest: string } {
  const codes: string[] = [];
  const belege: string[] = [];
  let rest = text;
  for (const [code, re] of BEGLEITZIEL_REGELN) {
    re.lastIndex = 0;
    let found = false;
    rest = rest.replace(re, (m) => {
      found = true;
      belege.push(m.trim());
      return ' ';
    });
    if (found) codes.push(code);
  }
  if (!codes.length) return { codes, belege, rest: text };
  // Tidy the separators left behind ("…, 45 Minuten,  " or ",  ,").
  rest = rest.replace(/\s+([,;.])/g, '$1').replace(/([,;])(?:\s*[,;])+/g, '$1').replace(/[\s,;]+$/, '').replace(/^[\s,;]+/, '').replace(/\s{2,}/g, ' ');
  return { codes, belege, rest };
}
