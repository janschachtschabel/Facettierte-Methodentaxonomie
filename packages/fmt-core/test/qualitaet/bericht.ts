/**
 * Quality report: runs every quality case and prints a Markdown table with plan and findings.
 * Usage: npm run qualitaet (from the repository root). Prints, never fails; the test suite holds the gate.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../../src/load-data.js';
import { createMatcher, createValidator } from '../../src/index.js';
import { QUALITAETSFAELLE } from './faelle.js';
import { REIHE2 } from './faelle-reihe2.js';
import { REIHE3 } from './faelle-reihe3.js';
import { pruefeFall, variabilitaet } from './pruefen.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const D = loadFmtData(path.join(ROOT, 'data'));
const M = createMatcher(D, createValidator(D));
// `npm run qualitaet -- reihe2` (or `reihe3`) reports the second (third) test series.
const faelle = process.argv.includes('reihe3') ? REIHE3 : process.argv.includes('reihe2') ? REIHE2 : QUALITAETSFAELLE;
const ergebnisse = faelle.map((f) => pruefeFall(f, M, D));

const zeilen = ['| Fall | Kette | Ablauf | Befund |', '|---|---|---|---|'];
let fehler = 0;
let bekannt = 0;
for (const e of ergebnisse) {
  const schlecht = e.befunde.filter((b) => !b.ok);
  fehler += schlecht.filter((b) => !b.bekannt).length;
  bekannt += schlecht.filter((b) => b.bekannt).length;
  const kette = e.ergebnis.modus === 'ablauf' ? e.ergebnis.kette?.id || '' : 'Einzelphase';
  const ablauf =
    e.ergebnis.modus === 'ablauf'
      ? `${e.ablauf.join(' › ')} (${e.ergebnis.pruefung?.dauerMin ?? '?'} min)`
      : (e.ergebnis.vorschlaege || []).slice(0, 4).map((v) => v.baustein).join(', ');
  const befund = schlecht.length
    ? schlecht.map((b) => `${b.bekannt ? '◐' : '✗'} ${b.pruefung}: ${b.detail}${b.bekannt ? ` (bekannt: ${b.bekannt})` : ''}`).join('<br>')
    : '✓';
  zeilen.push(`| ${e.fall.id} | ${kette} | ${ablauf} | ${befund} |`);
}
const v = variabilitaet(ergebnisse.filter((e) => e.ergebnis.modus === 'ablauf').map((e) => e.ablauf));
const sport = variabilitaet(ergebnisse.filter((e) => e.fall.id.startsWith('sport-')).map((e) => e.ablauf));
console.log(`# Qualitätsbericht Szenariovorschläge\n`);
console.log(`${ergebnisse.length} Fälle, ${fehler} offene Befunde, ${bekannt} bekannte Datenlücken.`);
console.log(`Variabilität: ${v.verschieden} verschiedene Abläufe, häufigster ${Math.round(v.haeufigsterAnteil * 100)} %; Sport: ${sport.verschieden} verschiedene, häufigster ${Math.round(sport.haeufigsterAnteil * 100)} %.\n`);
console.log(zeilen.join('\n'));
