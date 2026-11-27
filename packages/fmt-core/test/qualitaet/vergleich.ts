/**
 * Baseline of the quality cases: which check passed for which case before FMT 2.0.
 * `ausgang.json` maps case id -> check -> passed. A check that was already failing (known gap) is stored as false;
 * only true -> false transitions count as regressions.
 * Usage: npm run qualitaet:ausgang -- --schreiben   (rewrites ausgang.json; only when cases got better, never to hide a regression)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FmtData, FmtMatcher } from '../../src/index.js';
import { QUALITAETSFAELLE, type Pruefung } from './faelle.js';
import { REIHE2 } from './faelle-reihe2.js';
import { REIHE3 } from './faelle-reihe3.js';
import { pruefeFall, type Fallergebnis } from './pruefen.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const AUSGANG = path.join(HIER, 'ausgang.json');

export type Ausgang = Record<string, Record<string, boolean>>;

export function alleFallergebnisse(M: FmtMatcher, D: FmtData): Fallergebnis[] {
  return [...QUALITAETSFAELLE, ...REIHE2, ...REIHE3].map((f) => pruefeFall(f, M, D));
}

/** Case id -> check -> passed (a check passes when every finding of that check is ok). */
export function alsAusgang(ergebnisse: Fallergebnis[]): Ausgang {
  const out: Ausgang = {};
  for (const e of ergebnisse) {
    const pro: Record<string, boolean> = {};
    for (const b of e.befunde) pro[b.pruefung] = (pro[b.pruefung] ?? true) && b.ok;
    out[e.fall.id] = pro;
  }
  return out;
}

export function ladeAusgang(): Record<string, Record<Pruefung, boolean>> {
  return JSON.parse(fs.readFileSync(AUSGANG, 'utf8'));
}

/** Only worsenings: checks that passed in the baseline and fail now (or cases that vanished). */
export function vergleicheMitAusgang(aktuell: Fallergebnis[]): Array<{ fall: string; pruefung: Pruefung; detail: string }> {
  const basis = ladeAusgang();
  const jetzt = new Map(aktuell.map((e) => [e.fall.id, e]));
  const out: Array<{ fall: string; pruefung: Pruefung; detail: string }> = [];
  for (const [fall, pruefungen] of Object.entries(basis)) {
    const e = jetzt.get(fall);
    for (const [p, warOk] of Object.entries(pruefungen) as Array<[Pruefung, boolean]>) {
      if (!warOk) continue;
      if (!e) {
        out.push({ fall, pruefung: p, detail: 'Fall fehlt' });
        continue;
      }
      const schlecht = e.befunde.filter((b) => b.pruefung === p && !b.ok);
      if (schlecht.length) out.push({ fall, pruefung: p, detail: schlecht.map((b) => b.detail).join('; ') });
    }
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { loadFmtData } = await import('../../src/load-data.js');
  const { createMatcher, createValidator } = await import('../../src/index.js');
  const D = loadFmtData(path.join(HIER, '..', '..', '..', '..', 'data'));
  const M = createMatcher(D, createValidator(D));
  const ergebnisse = alleFallergebnisse(M, D);
  if (process.argv.includes('--schreiben')) {
    fs.writeFileSync(AUSGANG, JSON.stringify(alsAusgang(ergebnisse), null, 2) + '\n');
    console.log(`ausgang.json geschrieben: ${ergebnisse.length} Fälle`);
  } else {
    const r = vergleicheMitAusgang(ergebnisse);
    console.log(r.length ? r.map((x) => `${x.fall} ${x.pruefung}: ${x.detail}`).join('\n') : 'keine Verschlechterung');
    process.exitCode = r.length ? 1 : 0;
  }
}
