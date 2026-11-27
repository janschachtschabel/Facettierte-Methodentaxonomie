// Condition check B1–B14 over the 56 scenarios (Task P0.1, spec E12).
// Usage (repository root, after npm run build:data):
//   npm run szenariotest:bedingungen -- [output folder] [--aus rohergebnisse.json] [--paket N]
// Without --aus the scenarios run through the server in-process (run.mts, unchanged, writes rohergebnisse.json into
// the output folder). Writes bedingungen.json and bedingungen.md to the output folder and prints the 56 × 14 matrix.
// --paket N: exit code 1 if a condition of packages 1…N is „verletzt“ in any scenario.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../../packages/fmt-core/src/load-data.js';
import { SZ } from './szenarien.mts';
import { SOLL, SOLL_PRUEFSTAND, sollFuer } from './soll.mts';
import { BEDINGUNGEN, PAKET, berichtMarkdown, katalogAus, pruefeAlle, zaehle, type Bedingung, type Eintrag } from './bedingungen.mts';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HIER, '..', '..');
const args = process.argv.slice(2);
const wert = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const aus = wert('--aus');
const paket = wert('--paket') ? Number(wert('--paket')) : undefined;
const frei = args.filter((a, i) => !a.startsWith('--') && !['--aus', '--paket'].includes(args[i - 1]));
const OUT = path.resolve(frei[0] || 'szenariotest-ergebnis');
fs.mkdirSync(OUT, { recursive: true });
if (paket !== undefined && !(paket >= 1 && paket <= 4)) {
  console.error('--paket erwartet 1, 2, 3 oder 4');
  process.exit(2);
}

let roh = aus ? path.resolve(aus) : path.join(OUT, 'rohergebnisse.json');
if (!aus) {
  const lauf = spawnSync(process.execPath, ['--import', 'tsx', path.join(HIER, 'run.mts'), OUT], { cwd: ROOT, stdio: 'inherit' });
  if (lauf.status !== 0) {
    console.error('Lauf der Szenarien fehlgeschlagen');
    process.exit(2);
  }
  roh = path.join(OUT, 'rohergebnisse.json');
}
const daten: Record<string, Eintrag> = JSON.parse(fs.readFileSync(roh, 'utf8'));
const eintraege = SZ.map((s) => daten[s.id]).filter((e): e is Eintrag => Boolean(e));
const fehlend = SZ.filter((s) => !daten[s.id]).map((s) => s.id);
if (fehlend.length) console.warn(`Nicht in ${roh}: ${fehlend.join(', ')}`);
if (SOLL.length !== SZ.length || SZ.some((s, i) => SOLL[i]?.id !== s.id)) {
  console.error('soll.mts und szenarien.mts stimmen in Zahl oder Reihenfolge nicht überein');
  process.exit(2);
}

const katalog = katalogAus(loadFmtData(path.join(ROOT, 'data')));
const matrix = pruefeAlle(eintraege, sollFuer, katalog);
const zahlen = zaehle(matrix);
const nummer = (id: string) => SZ.findIndex((s) => s.id === id) + 1;
const git = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
const stand = `${new Date().toISOString().slice(0, 10)}, Commit ${git.stdout?.trim() || 'unbekannt'}${aus ? `, aus ${path.basename(roh)}` : ''}`;

fs.writeFileSync(path.join(OUT, 'bedingungen.json'), JSON.stringify({ stand, sollPruefstand: SOLL_PRUEFSTAND, zahlen, matrix }, null, 1));
fs.writeFileSync(path.join(OUT, 'bedingungen.md'), berichtMarkdown(matrix, { titel: 'Bedingungen B1–B14 über die Szenarien', stand, sollPruefstand: SOLL_PRUEFSTAND, nummer }) + '\n');

const Z = { erfuellt: '✓', verletzt: '✗', entfaellt: '–' } as const;
console.log(`Nr. ${BEDINGUNGEN.map((b) => b.padStart(3)).join(' ')}  Szenario`);
for (const e of eintraege) console.log(`${String(nummer(e.id)).padStart(3)} ${BEDINGUNGEN.map((b) => Z[matrix[e.id][b].status].padStart(3)).join(' ')}  ${e.id}`);
console.log(BEDINGUNGEN.map((b) => `${b} ${zahlen[b].erfuellt}/${zahlen[b].verletzt}/${zahlen[b].entfaellt}`).join(' · '), '(erfüllt/verletzt/entfällt)');
console.log(`Maßstab soll.mts: ${SOLL_PRUEFSTAND}. Ausgabe: ${OUT}`);

if (paket !== undefined) {
  const pflicht = ([1, 2, 3, 4] as const).filter((n) => n <= paket).flatMap((n) => PAKET[n]) as Bedingung[];
  const verletzt = pflicht.filter((b) => zahlen[b].verletzt > 0);
  if (verletzt.length) {
    console.error(`Paket ${paket}: verletzt in mindestens einem Szenario: ${verletzt.map((b) => `${b} (${zahlen[b].verletzt})`).join(', ')}`);
    process.exit(1);
  }
  console.log(`Paket ${paket}: ${pflicht.join(', ')} in allen Szenarien erfüllt oder entfallen.`);
}
