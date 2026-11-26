/**
 * Writes the reviewed data of Durchsicht 1 (Tor D1) into data/bausteine/: raumbedarf, fachausstattungArt,
 * schriftbedarf, termineMin, the knowledge types in aufgabe (D1) and the cleaned fachbereichUngeeignet; renames the
 * free text raum to raumhinweis and removes the old field lernort.
 *
 * The column `entscheidung` (format `feld=wert; feld=wert`, lists separated by `|`, empty value = empty list) is the
 * final override after the gate; without it the `_vorschlag` column holds. Running it a second time changes nothing.
 *
 * Usage: npx tsx packages/fmt-core/scripts/uebernehme-durchsicht.ts <durchsicht-1-bedarf-geprueft.csv>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv } from './vorschlag-fmt2-bedarf.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(__dirname, '..', '..', '..', 'data', 'bausteine');

/** Knowledge types of the facet D1 (aufgabe); its other values (AFB, structure, authenticity) stay as they are. */
export const WISSENSARTEN = ['fakten', 'konzepte', 'prozeduren', 'einstellungen', 'psychomotorik', 'metakognitiv'];
/** Need fields, written as one block where lernort stood (or where the block already stands). */
const BEDARF_FELDER = ['raumbedarf', 'fachausstattungArt', 'schriftbedarf', 'termineMin'];
const ENTSCHEIDBAR = new Set(['raumbedarf', 'fachausstattungArt', 'schriftbedarf', 'termineMin', 'wissensart', 'fach_ungeeignet']);

export interface Durchsicht {
  raumbedarf: string[];
  fachausstattungArt?: string;
  schriftbedarf: string[];
  termineMin?: number;
  wissensart: string[];
  fachUngeeignet: string[];
}

const liste = (s: string | undefined) => (s || '').split('|').map((x) => x.trim()).filter(Boolean);

/** Reads `feld=wert; feld=wert`; an unknown field name is an error, not a silent skip. */
export function leseEntscheidung(s: string, kennung = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const teil of (s || '').split(';').map((x) => x.trim()).filter(Boolean)) {
    const i = teil.indexOf('=');
    if (i < 0) throw new Error(`${kennung}: Entscheidung ohne „=“: ${teil}`);
    const feld = teil.slice(0, i).trim();
    if (!ENTSCHEIDBAR.has(feld)) throw new Error(`${kennung}: unbekanntes Feld in der Entscheidung: ${feld}`);
    out.set(feld, teil.slice(i + 1).trim());
  }
  return out;
}

/** Final values of one CSV row: the decision wins over the proposal; an empty knowledge-type proposal keeps the old one. */
export function endwerte(z: Record<string, string>): Durchsicht {
  const e = leseEntscheidung(z.entscheidung, z.kennung);
  const wert = (feld: string, spalte: string) => (e.has(feld) ? e.get(feld)! : z[spalte] || '');
  const termine = wert('termineMin', 'termineMin_vorschlag').trim();
  const art = wert('fachausstattungArt', 'fachausstattungArt').trim();
  const wissensart = e.has('wissensart') ? liste(e.get('wissensart')) : liste(z.wissensart_vorschlag).length ? liste(z.wissensart_vorschlag) : liste(z.wissensart_alt);
  const out: Durchsicht = {
    raumbedarf: liste(wert('raumbedarf', 'raumbedarf_vorschlag')),
    schriftbedarf: liste(wert('schriftbedarf', 'schriftbedarf_vorschlag')),
    wissensart,
    fachUngeeignet: liste(wert('fach_ungeeignet', 'fach_ungeeignet_vorschlag'))
  };
  if (art) out.fachausstattungArt = art;
  if (termine) {
    const n = Number(termine);
    if (!Number.isInteger(n) || n < 1) throw new Error(`${z.kennung}: termineMin ist keine ganze Zahl: ${termine}`);
    out.termineMin = n;
  }
  return out;
}

/**
 * Rebuilds the method with the reviewed fields, keeping the key order: the need block takes the place of lernort
 * (or of the block itself on a repeated run), raumhinweis the place of raum. Empty lists and fields are left out.
 */
export function uebernehme(b: Record<string, unknown>, d: Durchsicht): Record<string, unknown> {
  const bedarf: Record<string, unknown> = {};
  if (d.raumbedarf.length) bedarf.raumbedarf = d.raumbedarf;
  if (d.fachausstattungArt) bedarf.fachausstattungArt = d.fachausstattungArt;
  if (d.schriftbedarf.length) bedarf.schriftbedarf = d.schriftbedarf;
  if (d.termineMin != null) bedarf.termineMin = d.termineMin;
  const hinweis = typeof b.raum === 'string' && b.raum.trim() ? b.raum : b.raumhinweis;

  const aufgabe = [...d.wissensart, ...((b.aufgabe as string[]) || []).filter((x) => !WISSENSARTEN.includes(x))];

  const out: Record<string, unknown> = {};
  let bedarfDone = false;
  let hinweisDone = false;
  let fachDone = false;
  const setzeFach = () => {
    if (d.fachUngeeignet.length) out.fachbereichUngeeignet = d.fachUngeeignet;
    fachDone = true;
  };
  for (const [key, value] of Object.entries(b)) {
    if (key === 'lernort' || BEDARF_FELDER.includes(key)) {
      if (!bedarfDone) Object.assign(out, bedarf);
      bedarfDone = true;
      continue;
    }
    if (key === 'raum' || key === 'raumhinweis') {
      if (!hinweisDone && hinweis) out.raumhinweis = hinweis;
      hinweisDone = true;
      continue;
    }
    if (key === 'aufgabe') {
      out.aufgabe = aufgabe;
      continue;
    }
    if (key === 'fachbereichUngeeignet') {
      setzeFach();
      continue;
    }
    out[key] = value;
    // A method without this field gets it right after its subject areas.
    if (key === 'fachbereich' && !('fachbereichUngeeignet' in b)) setzeFach();
  }
  if (!fachDone) setzeFach();
  if (!bedarfDone) Object.assign(out, bedarf);
  if (!hinweisDone && hinweis) out.raumhinweis = hinweis;
  if (!('aufgabe' in b)) out.aufgabe = aufgabe;
  return out;
}

export function main(csvPfad: string, dir = DIR): { geaendert: number; gesamt: number } {
  const zeilen = parseCsv(fs.readFileSync(csvPfad, 'utf8'));
  const nachKennung = new Map(zeilen.map((z) => [z.kennung, z]));
  let geaendert = 0;
  let gesamt = 0;
  const dateien = fs.readdirSync(dir).filter((x) => x.endsWith('.json'));
  for (const f of dateien) {
    const p = path.join(dir, f);
    const alt = fs.readFileSync(p, 'utf8');
    const b = JSON.parse(alt) as Record<string, unknown>;
    const z = nachKennung.get(String(b.kennung));
    if (!z) throw new Error(`Keine Zeile der Durchsicht für ${String(b.kennung)}.`);
    const neu = JSON.stringify(uebernehme(b, endwerte(z)), null, 2) + '\n';
    if (neu !== alt) {
      fs.writeFileSync(p, neu);
      geaendert++;
    }
    gesamt++;
  }
  if (zeilen.length !== gesamt) throw new Error(`Die Durchsicht hat ${zeilen.length} Zeilen, es gibt ${gesamt} Methoden.`);
  return { geaendert, gesamt };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const file = process.argv[2];
  if (!file) throw new Error('Pfad zur geprüften CSV fehlt.');
  const { geaendert, gesamt } = main(file);
  console.log(`${gesamt} Methoden geprüft, ${geaendert} geändert.`);
}
