/**
 * Writes the reviewed data of Durchsicht 2 "Eignung" (Tor D2) into data/bausteine/ and data/teilgruppen.json.
 * Source: the column `final` of durchsicht-2-eignung-geprueft.csv (the column `tor` holds the reason).
 *
 * Only forms of `final` that map mechanically are applied; every other text is reported as open and its data stays
 * as it is. Part 1 (rule changes in regeln.json and zielart.ts) is reported, not applied: those changes are code and
 * rule edits with their own tests. Running the script a second time changes nothing.
 *
 * Usage: npx tsx packages/fmt-core/scripts/uebernehme-eignung.ts <durchsicht-2-eignung-geprueft.csv> [dataDir]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv } from './vorschlag-fmt2-bedarf.js';
import { art } from './vorschlag-fmt2-eignung.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(__dirname, '..', '..', '..', 'data');

export interface Zeile {
  eintrag: string;
  teil: string;
  kennung: string;
  feld: string;
  wert_alt: string;
  final: string;
}

type Grundart = 'stufe' | 'vorwissen' | 'fachbereich';
export interface Grund {
  text: string;
  grundlage: 'E' | 'S' | 'A';
  quelle?: string;
}

export type Op =
  /** Set a field of the method; without `wert` the field is removed. */
  | { typ: 'feld'; feld: string; wert?: unknown }
  /** Set the reason of one Eignung statement. */
  | { typ: 'grund'; art: Grundart; grund: Grund }
  /** Add one value to a list field. */
  | { typ: 'dazu'; feld: string; wert: string }
  /** Set the scope of one evidence statement. */
  | { typ: 'geltung'; index: number; wert: string }
  /** data/teilgruppen.json: remove a value from a row, set a field, append text to a field. */
  | { typ: 'tg-ohne'; merkmal: string; wert: string }
  | { typ: 'tg-feld'; merkmal: string; feld: string; wert: string }
  | { typ: 'tg-anhang'; merkmal: string; feld: string; wert: string };

export type Deutung = { ops: Op[] } | { regel: true } | { offen: string };

/** Eignung lists and the reason that belongs to each. */
const LISTE_ZU_GRUND: Record<string, Grundart> = {
  ungeeignetBeiStufe: 'stufe',
  ungeeignetBeiVorwissen: 'vorwissen',
  fachbereichUngeeignet: 'fachbereich'
};
/** Fields an entry of Durchsicht 2 may drop. */
const LOESCHBAR = new Set(['ungeeignetBeiStufe', 'geeignetBeiVorwissen', 'fachbereichUngeeignet']);
/** Fields a `feld=wert` part may set; lists are split at `|`. */
const SETZBAR: Record<string, 'liste' | 'wert'> = {
  adaptivitaet: 'liste',
  raumbedarf: 'liste',
  fachausstattungArt: 'wert',
  nachbedingung: 'liste',
  eintragsart: 'wert'
};

const liste = (s: string) => s.split('|').map((x) => x.trim()).filter(Boolean);
const mitPunkt = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

/** `feld=werte; eignungsgrund.art: G – Text (Quelle: …)`, optionally followed by `; <werte> streichen`. */
function deuteGrund(z: Zeile): Deutung {
  const m = /^(\w+)=([^;]*); eignungsgrund\.(stufe|vorwissen|fachbereich): ([ESA]) – (.+)$/.exec(z.final);
  if (!m) return { offen: 'Form mit eignungsgrund nicht lesbar' };
  const [, feld, wertText, grundart, grundlage, rest] = m;
  if (LISTE_ZU_GRUND[feld] !== grundart) return { offen: `Feld ${feld} passt nicht zu eignungsgrund.${grundart}` };
  const werte = liste(wertText);
  let text = rest;
  // A trailing "; sek1 streichen" only repeats what the new list already says (values of the old entry left out).
  const nachsatz = /; ([a-z0-9|-]+) streichen$/.exec(text);
  if (nachsatz) {
    const weg = liste(nachsatz[1]);
    const alt = liste(z.wert_alt);
    if (!weg.every((w) => alt.includes(w) && !werte.includes(w))) return { offen: `Nachsatz „${nachsatz[0].slice(2)}“ passt nicht zur Liste` };
    text = text.slice(0, nachsatz.index);
  }
  const q = /^(.*?)(?: \(Quelle: ([^()]*)\))?$/.exec(text)!;
  const grund: Grund = { text: mitPunkt(q[1].trim()), grundlage: grundlage as Grund['grundlage'] };
  if (q[2]) grund.quelle = q[2].trim();
  const ops: Op[] = [{ typ: 'feld', feld, wert: werte }];
  // Part 2 renames: the new list takes the place of geeignetBeiVorwissen, which goes.
  if (z.feld !== feld) {
    if (!LOESCHBAR.has(z.feld)) return { offen: `Feld ${z.feld} der Zeile ist nicht löschbar` };
    ops.push({ typ: 'feld', feld: z.feld });
  }
  ops.push({ typ: 'grund', art: grundart as Grundart, grund });
  return { ops };
}

/** One part of a changing `final` (parts separated by `; `). */
function deuteTeil(z: Zeile, teil: string): Op[] | null {
  const tg = z.teil === '7';
  if (/^(eintragsart bleibt methode|grundlage bleibt [A-Za-z]+|Rest bleibt)$/.test(teil)) return [];
  if (/^nachbedingung entfällt\b/.test(teil)) return [{ typ: 'feld', feld: 'nachbedingung', wert: [] }];
  let m = /^fachbereich \+ ([a-z-]+)$/.exec(teil);
  if (m) return [{ typ: 'dazu', feld: 'fachbereich', wert: m[1] }];
  m = /^geltung=(.+)$/.exec(teil);
  if (m) {
    const i = /^evidenz\[(\d+)\]\.geltung$/.exec(z.feld);
    return i ? [{ typ: 'geltung', index: Number(i[1]), wert: m[1].trim() }] : null;
  }
  if (tg) {
    m = /^Ausprägung ([a-z0-9-]+) aus der Zeile nehmen\b/.exec(teil);
    if (m) return [{ typ: 'tg-ohne', merkmal: z.kennung, wert: m[1] }];
    m = /^(grundlage|quelle|wohin)=(.+)$/.exec(teil);
    if (m) return [{ typ: 'tg-feld', merkmal: z.kennung, feld: m[1], wert: m[2].trim() }];
    m = /^(quelle|wohin) ergänzen um „(.+)“$/.exec(teil);
    if (m) return [{ typ: 'tg-anhang', merkmal: z.kennung, feld: m[1], wert: m[2] }];
    return null;
  }
  m = /^(\w+)=(.*)$/.exec(teil);
  if (m && SETZBAR[m[1]]) return [{ typ: 'feld', feld: m[1], wert: SETZBAR[m[1]] === 'liste' ? liste(m[2]) : m[2].trim() }];
  return null;
}

/** What one reviewed entry asks for: data operations, a rule change (part 1) or an open text. */
export function deute(z: Zeile): Deutung {
  if (z.teil === '1') return { regel: true };
  const f = z.final.trim();
  const a = art({ vorschlag: f } as Parameters<typeof art>[0]);
  if (a === 'gleich') return { ops: [] };
  if (a === 'weg') {
    if (!LOESCHBAR.has(z.feld)) return { offen: `Feld ${z.feld} ist nicht löschbar` };
    return { ops: [{ typ: 'feld', feld: z.feld }] };
  }
  if (a === 'grund') return deuteGrund({ ...z, final: f });
  const ops: Op[] = [];
  for (const teil of f.split('; ').map((x) => x.trim()).filter(Boolean)) {
    const o = deuteTeil(z, teil);
    if (!o) return { offen: `Teil „${teil}“ nicht lesbar` };
    ops.push(...o);
  }
  return { ops };
}

/** Where a field that is new to a method goes: after the first of these keys the method has. */
const ANKER: Record<string, string[]> = {
  eintragsart: ['name'],
  raumbedarf: ['fachbereichUngeeignet', 'fachbereich'],
  fachausstattungArt: ['raumbedarf', 'fachbereichUngeeignet', 'fachbereich'],
  ungeeignetBeiVorwissen: ['geeignetBeiVorwissen', 'dauerMax'],
  ungeeignetBeiStufe: ['ungeeignetBeiVorwissen', 'geeignetBeiVorwissen', 'dauerMax'],
  fachbereichUngeeignet: ['fachbereich'],
  nachbedingung: ['vorbedingung']
};
const GRUND_LISTE: Record<Grundart, string> = { stufe: 'ungeeignetBeiStufe', vorwissen: 'ungeeignetBeiVorwissen', fachbereich: 'fachbereichUngeeignet' };

function setze(b: Record<string, unknown>, feld: string, wert: unknown, anker: string[]): Record<string, unknown> {
  if (feld in b) return { ...b, [feld]: wert };
  const nach = anker.find((k) => k in b);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(b)) {
    out[k] = v;
    if (k === nach) out[feld] = wert;
  }
  if (!nach) out[feld] = wert;
  return out;
}

function ohne(b: Record<string, unknown>, feld: string): Record<string, unknown> {
  const { [feld]: _weg, ...rest } = b;
  return rest;
}

/** Applies the method operations; keeps the key order, drops empty Eignung lists and their reasons. */
export function wendeAn(b: Record<string, unknown>, ops: Op[]): Record<string, unknown> {
  let out = b;
  for (const op of ops) {
    if (op.typ === 'feld') {
      const leer = Array.isArray(op.wert) && !op.wert.length && op.feld in LISTE_ZU_GRUND;
      if (op.wert === undefined || leer) {
        out = ohne(out, op.feld);
        const g = LISTE_ZU_GRUND[op.feld];
        if (g && out.eignungsgrund) {
          const rest = ohne(out.eignungsgrund as Record<string, unknown>, g);
          out = Object.keys(rest).length ? { ...out, eignungsgrund: rest } : ohne(out, 'eignungsgrund');
        }
      } else out = setze(out, op.feld, op.wert, ANKER[op.feld] || []);
    } else if (op.typ === 'grund') {
      const alt = (out.eignungsgrund as Record<string, unknown>) || {};
      out = setze(out, 'eignungsgrund', { ...alt, [op.art]: op.grund }, [GRUND_LISTE[op.art]]);
    } else if (op.typ === 'dazu') {
      const l = (out[op.feld] as string[]) || [];
      if (!l.includes(op.wert)) out = setze(out, op.feld, [...l, op.wert], ANKER[op.feld] || []);
    } else if (op.typ === 'geltung') {
      const ev = [...((out.evidenz as Record<string, unknown>[]) || [])];
      if (!ev[op.index]) throw new Error(`${String(b.kennung)}: evidenz[${op.index}] fehlt`);
      ev[op.index] = { ...ev[op.index], geltung: op.wert };
      out = { ...out, evidenz: ev };
    } else throw new Error(`Operation ${op.typ} gilt nicht für Methoden`);
  }
  return out;
}

interface TgMerkmal {
  id: string;
  auspraegungen: string[];
  [k: string]: unknown;
}

/** Applies the operations on data/teilgruppen.json. */
export function wendeAnTeilgruppen(t: { merkmale: TgMerkmal[] }, ops: Op[]): { merkmale: TgMerkmal[] } {
  const merkmale = t.merkmale.map((m) => ({ ...m }));
  for (const op of ops) {
    if (op.typ !== 'tg-ohne' && op.typ !== 'tg-feld' && op.typ !== 'tg-anhang') throw new Error(`Operation ${op.typ} gilt nicht für Teilgruppen`);
    const m = merkmale.find((x) => x.id === op.merkmal);
    if (!m) throw new Error(`Teilgruppen: Zeile ${op.merkmal} fehlt`);
    if (op.typ === 'tg-ohne') m.auspraegungen = m.auspraegungen.filter((x) => x !== op.wert);
    else if (op.typ === 'tg-feld') m[op.feld] = op.wert;
    else {
      const alt = String(m[op.feld] ?? '');
      if (!alt.endsWith(op.wert)) m[op.feld] = alt ? `${alt} ${op.wert}` : op.wert;
    }
  }
  return { ...t, merkmale };
}

/** JSON with two-space indent; a list of strings stands on one line when that line stays within 100 characters. */
export function formatiereTeilgruppen(t: unknown): string {
  const roh = JSON.stringify(t, null, 2);
  const out = roh.replace(/^( *)("[^"\n]+": )\[\n((?: *"(?:[^"\\\n]|\\.)*",?\n)+) *\]/gm, (ganz, einzug: string, schluessel: string, inhalt: string) => {
    const werte = inhalt.split('\n').map((x) => x.trim().replace(/,$/, '')).filter(Boolean);
    const zeile = `${einzug}${schluessel}[${werte.join(', ')}]`;
    return zeile.length + 1 <= 100 ? zeile : ganz;
  });
  return out + '\n';
}

export interface Bericht {
  teile: Record<string, { angewendet: number; unveraendert: number; offen: number; regel: number }>;
  offen: Array<{ eintrag: string; final: string; grund: string }>;
  regel: string[];
  geaendert: string[];
}

export function main(csvPfad: string, dataDir = DATA): Bericht {
  const zeilen = parseCsv(fs.readFileSync(csvPfad, 'utf8')) as unknown as Zeile[];
  const bericht: Bericht = { teile: {}, offen: [], regel: [], geaendert: [] };
  const methodenOps = new Map<string, Op[]>();
  const tgOps: Op[] = [];
  for (const z of zeilen) {
    const t = (bericht.teile[z.teil] ??= { angewendet: 0, unveraendert: 0, offen: 0, regel: 0 });
    const d = deute(z);
    if ('regel' in d) {
      t.regel++;
      bericht.regel.push(z.eintrag);
    } else if ('offen' in d) {
      t.offen++;
      bericht.offen.push({ eintrag: z.eintrag, final: z.final, grund: d.offen });
    } else if (!d.ops.length) t.unveraendert++;
    else {
      t.angewendet++;
      if (z.teil === '7') tgOps.push(...d.ops);
      else methodenOps.set(z.kennung, [...(methodenOps.get(z.kennung) || []), ...d.ops]);
    }
  }
  const dir = path.join(dataDir, 'bausteine');
  for (const [kennung, ops] of methodenOps) {
    const p = path.join(dir, `${kennung}.json`);
    if (!fs.existsSync(p)) throw new Error(`Methode fehlt: ${kennung}`);
    const alt = fs.readFileSync(p, 'utf8');
    const neu = JSON.stringify(wendeAn(JSON.parse(alt), ops), null, 2) + '\n';
    if (neu !== alt) {
      fs.writeFileSync(p, neu);
      bericht.geaendert.push(`bausteine/${kennung}.json`);
    }
  }
  if (tgOps.length) {
    const p = path.join(dataDir, 'teilgruppen.json');
    const alt = fs.readFileSync(p, 'utf8');
    const neu = formatiereTeilgruppen(wendeAnTeilgruppen(JSON.parse(alt), tgOps));
    if (neu !== alt) {
      fs.writeFileSync(p, neu);
      bericht.geaendert.push('teilgruppen.json');
    }
  }
  return bericht;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const file = process.argv[2];
  if (!file) throw new Error('Pfad zur geprüften CSV fehlt.');
  const b = main(file, process.argv[3] ? path.resolve(process.argv[3]) : DATA);
  for (const [teil, n] of Object.entries(b.teile).sort())
    console.log(`Teil ${teil}: ${n.angewendet} angewendet, ${n.unveraendert} ohne Datenänderung, ${n.regel} Regeländerung (eigener Commit), ${n.offen} offen`);
  for (const o of b.offen) console.log(`OFFEN ${o.eintrag}: ${o.grund} – ${o.final}`);
  console.log(`${b.geaendert.length} Dateien geändert.`);
}
