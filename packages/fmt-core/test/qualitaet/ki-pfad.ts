/**
 * AI path without an AI key: the server's /assistant/translate merges the rule reading with the LLM JSON and
 * calls the matcher with the text plus the LLM fields. This script simulates an LLM that adds nothing ("echo LLM"),
 * so differences to the rule path come from the merge alone. Optional JSON file with simulated LLM answers:
 * npx tsx ki-pfad.ts [reihe1|reihe2|reihe3] [--llm antworten.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../../src/load-data.js';
import { createMatcher, createValidator } from '../../src/index.js';
import type { MatchRequest } from '../../src/types.js';
import { QUALITAETSFAELLE } from './faelle.js';
import { REIHE2 } from './faelle-reihe2.js';
import { REIHE3 } from './faelle-reihe3.js';
import { pruefeFall } from './pruefen.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const D = loadFmtData(path.join(ROOT, 'data'));
const M = createMatcher(D, createValidator(D));
const llmIdx = process.argv.indexOf('--llm');
const antworten: Record<string, Record<string, unknown>> = llmIdx > 0 ? JSON.parse(fs.readFileSync(process.argv[llmIdx + 1], 'utf8')) : {};

const reihe = process.argv.includes('reihe1') ? QUALITAETSFAELLE : process.argv.includes('reihe2') ? REIHE2 : process.argv.includes('reihe3') ? REIHE3 : [...QUALITAETSFAELLE, ...REIHE2, ...REIHE3];
const faelle = llmIdx > 0 ? reihe.filter((f) => antworten[f.id]) : reihe;

// Same merge as apps/server/src/routes/assistant.ts (translate): LLM fields plus the text.
const ideal = process.argv.includes('--ideal');
const kiMatcher = (id: string, regel?: ReturnType<typeof M.zuordnen>) => ({
  ...M,
  zuordnen: (req: MatchRequest) => {
    const parsed: Record<string, unknown> = { ...(antworten[id] || {}) };
    // --ideal: the LLM picks exactly the mode and chain the rule path chose, so only the missing text differs.
    if (ideal && regel) Object.assign(parsed, regel.modus === 'ablauf' ? { modus: 'ablauf', zieltyp: regel.kette?.id } : { modus: 'phase' });
    delete parsed.text;
    const merged: Record<string, unknown> = { ...parsed, text: req.text };
    if (!merged.modus && (merged.zieltyp || merged.zielart) && !merged.lernfunktion && !merged.liefert) merged.modus = 'ablauf';
    return M.zuordnen(merged as MatchRequest);
  }
});

let regelFehler = 0, kiFehler = 0, gleich = 0;
const zeilen = ['| Fall | Regeln (Baukasten ohne KI) | KI-Pfad | Befunde nur im KI-Pfad |', '|---|---|---|---|'];
for (const f of faelle) {
  const a = pruefeFall(f, M, D);
  const b = pruefeFall(f, kiMatcher(f.id, a.ergebnis) as typeof M, D);
  const offen = (x: typeof a) => x.befunde.filter((y) => !y.ok && !y.bekannt);
  regelFehler += offen(a).length;
  kiFehler += offen(b).length;
  const s = (x: typeof a) => (x.ergebnis.modus === 'ablauf' ? `${x.ergebnis.kette?.id}: ${x.ablauf.join(' › ')} (${x.ergebnis.pruefung?.dauerMin} min)` : `Einzelphase: ${(x.ergebnis.vorschlaege || []).slice(0, 3).map((v) => v.baustein).join(', ')}`);
  if (s(a) === s(b)) { gleich++; continue; }
  const neu = offen(b).filter((y) => !offen(a).some((z) => z.pruefung === y.pruefung)).map((y) => `${y.pruefung}: ${y.detail}`);
  zeilen.push(`| ${f.id} | ${s(a)} | ${s(b)} | ${neu.join('<br>') || '–'} |`);
}
console.log(`# KI-Pfad gegen Regelpfad (${llmIdx > 0 ? 'simulierte LLM-Antworten' : ideal ? 'ideales LLM: gleicher Modus und gleiche Kette wie die Regeln' : 'Echo-LLM ohne eigene Angaben'})\n`);
console.log(`${faelle.length} Fälle, gleicher Ablauf: ${gleich}. Offene Befunde Regeln: ${regelFehler}, KI-Pfad: ${kiFehler}.\n`);
console.log(zeilen.join('\n'));
