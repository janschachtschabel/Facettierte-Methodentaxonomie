import { istHilfe } from './eintragsart.js';
import type { FmtData } from './types.js';
import { foldDe } from './semantic.js';

export interface MethodMention {
  kennung: string;
  /** Folded alias that matched, e.g. "experiment". */
  alias: string;
  /** The match is the method's own main name, not a synonym. */
  main: boolean;
  /** The entry is a help (eintragsart 'hilfe'): it supports learners inside a method and is never a phase. */
  hilfe?: true;
}

export interface FmtMentionDetector {
  detect(text: string): MethodMention[];
}

interface AliasEntry {
  kennung: string;
  words: string[];
  /** The alias is the method's own main name (wins over a synonym of another method). */
  main: boolean;
}

const MIN_SINGLE = 6; // single-word aliases shorter than this are everyday words ("Quiz", "Test")
const MIN_COMPOUND_TAIL = 9; // "experiment" may end a compound ("Schülerexperimente"); short aliases may not
const GENERIC_TAIL = new Set(['methode', 'diskussion', 'technik', 'runde', 'verfahren', 'activity', 'modell', 'prinzip']);
// Everyday words that are a synonym of one specific method in the catalogue but usually mean something broader.
const AMBIGUOUS = new Set(['vortrag', 'diskussion', 'ubung', 'projekt', 'prasentation', 'feedback', 'gesprach', 'vorlesen', 'spielform']);
const INFLECTION = /^(?:e|en|er|es|s|n|ern|ens)?$/;

const tokens = (s: string) =>
  foldDe(s)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

/** Detects catalogue methods a teacher names in free text, by main name or synonym. */
export function createMentionDetector(data: FmtData): FmtMentionDetector {
  const byAlias = new Map<string, AliasEntry[]>();
  const hilfen = new Set(data.bausteine.filter(istHilfe).map((b) => b.kennung));
  const add = (kennung: string, raw: string, main: boolean) => {
    const words = tokens(raw);
    if (!words.length) return;
    if (words.length === 1 && words[0].length < MIN_SINGLE) return;
    if (words.length === 1 && !main && AMBIGUOUS.has(words[0])) return;
    const key = words.join(' ');
    const list = byAlias.get(key) || [];
    if (!list.some((e) => e.kennung === kennung)) list.push({ kennung, words, main });
    byAlias.set(key, list);
    // "Fishbowl-Diskussion" and "Placemat-Methode" are usually just called "Fishbowl" and "Placemat".
    if (words.length > 1 && GENERIC_TAIL.has(words[words.length - 1])) add(kennung, words.slice(0, -1).join(' '), main);
  };
  for (const b of data.bausteine) {
    const paren = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(b.name);
    const main = paren ? paren[1] : b.name;
    add(b.kennung, main, true);
    // "Vokabeltest / Schriftliche Kurzkontrolle" is called by either part (as a synonym: a part may be an everyday word).
    if (main.includes(' / ')) main.split(' / ').forEach((part) => add(b.kennung, part, false));
    if (paren) add(b.kennung, paren[2], false);
    for (const alt of b.alternativname || []) add(b.kennung, alt, false);
  }
  // An alias shared by several methods is only usable when exactly one of them carries it as main name.
  const aliases: AliasEntry[] = [];
  for (const list of byAlias.values()) {
    const mains = list.filter((e) => e.main);
    if (list.length === 1) aliases.push(list[0]);
    else if (mains.length === 1) aliases.push(mains[0]);
  }
  // Longer aliases first, so "Demonstrationsexperiment" is consumed before "Experiment" can match its tail.
  aliases.sort((a, b) => b.words.join(' ').length - a.words.join(' ').length);

  const matchesWord = (token: string, alias: string, allowTail: boolean): boolean => {
    if (token.startsWith(alias) && INFLECTION.test(token.slice(alias.length))) return true;
    if (!allowTail || alias.length < MIN_COMPOUND_TAIL) return false;
    const at = token.lastIndexOf(alias);
    return at > 0 && INFLECTION.test(token.slice(at + alias.length));
  };

  return {
    detect(text: string): MethodMention[] {
      const toks = tokens(text || '');
      const taken = new Array<boolean>(toks.length).fill(false);
      const found: Array<{ at: number; mention: MethodMention }> = [];
      for (const entry of aliases) {
        const n = entry.words.length;
        for (let i = 0; i + n <= toks.length; i++) {
          if (taken.slice(i, i + n).some(Boolean)) continue;
          const hit = entry.words.every((w, j) =>
            j === n - 1 ? matchesWord(toks[i + j], w, n === 1) : toks[i + j] === w
          );
          if (!hit) continue;
          for (let j = 0; j < n; j++) taken[i + j] = true;
          if (!found.some((f) => f.mention.kennung === entry.kennung)) {
            const mention: MethodMention = { kennung: entry.kennung, alias: entry.words.join(' '), main: entry.main };
            if (hilfen.has(entry.kennung)) mention.hilfe = true;
            found.push({ at: i, mention });
          }
        }
      }
      return found.sort((a, b) => a.at - b.at).map((f) => f.mention);
    }
  };
}
