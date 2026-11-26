/**
 * Builds the data proposal for the Einsatzprofil (Bedarf): raumbedarf, schriftbedarf, raumhinweis,
 * betreuungshinweis for every method, derived from today's fields. The result goes to review first;
 * uebernehme-einsatzprofil.ts writes an approved proposal into data/bausteine/.
 *
 * Usage: npx tsx packages/fmt-core/scripts/vorschlag-einsatzprofil.ts [outDir]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import type { Baustein, FmtData } from '../src/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = path.resolve(process.argv[2] || '/mnt/project-files/einsatzprofil');

export interface BedarfVorschlag {
  raumbedarf: string[];
  schriftbedarf: string[];
  raumhinweis: string | null;
  betreuungshinweis: string | null;
  kernkomponenteOrt: string | null;
  grund: string;
}

const RAUM_ORDER = ['schreibplatz', 'stellflaeche', 'bewegungsflaeche', 'wandflaeche', 'fachausstattung', 'aussenort'];

// The plan's rule, widened by writing on cards, in logs and maps (the plan's list alone found only 85 of an expected 120–200).
const SCHREIBT =
  /schreib|notier|schriftlich|protokoll|ausfüll|verfass|formulier\w* schriftlich|arbeitsblatt|lerntagebuch|mitschrift|moderationskarte|karteikarte|klebezettel|festhalt|beschrift|tagebuch|portfolio|mind-?map|glossar|laufzettel/;
const LIEST = /\blesen\b|\bliest\b|lektüre|\btext\w*|quelle\w*|arbeitsblatt|infokarte|rollenkarte|aufgabenkarte/;
const HALLE = /halle|sportplatz|spielfläche/;
const STELL = /stuhlkreis|kreise|freie|stehfläche|bewegungsfläche|laufweg|ecken|spielfläche im raum/;
const WAND = /wand|tafel|stellwand|pinnwand|plakat/;
const FACH = /fachraum|labor|werkstatt|küche|musikraum|computerraum/;
const AUSSEN = /außerschul|wald|park|natur|einsatzort/;
const PLAIN_ROOM = /^(?:regulärer\s+)?klassenraum$/i;

const BEGLEITUNG = 'Begleitpersonen und Aufsicht nach den Vorgaben des Landes und der Schule klären.';
const UNTERWEISUNG = 'Sicherheitsunterweisung vor Beginn; Aufsicht während der praktischen Arbeit.';
const BETREUUNG: Record<string, string> = {
  exkursion: BEGLEITUNG,
  'exkursionsfuehrung-rezeptiv': BEGLEITUNG,
  waldpaedagogik: BEGLEITUNG,
  'service-learning': BEGLEITUNG,
  experiment: UNTERWEISUNG,
  demonstrationsexperiment: UNTERWEISUNG,
  'praxisauftrag-arbeitsplatz': UNTERWEISUNG,
  'vier-stufen-methode': UNTERWEISUNG
};

/** Hand-checked corrections: the listed fields replace what the rules derived. */
const AUSNAHMEN: Record<string, Partial<Pick<BedarfVorschlag, 'raumbedarf' | 'schriftbedarf'>>> = {
  kugellager: { raumbedarf: ['stellflaeche'] },
  fishbowl: { raumbedarf: ['stellflaeche'] },
  aufwaermen: { raumbedarf: ['bewegungsflaeche'] },
  'spielform-zielspiel': { raumbedarf: ['bewegungsflaeche'] },
  exkursion: { raumbedarf: ['aussenort'] },
  abrufquiz: { raumbedarf: ['schreibplatz'], schriftbedarf: ['schreibt'] },
  tps: { raumbedarf: [], schriftbedarf: [] },
  murmelgruppe: { raumbedarf: [], schriftbedarf: [] },
  museumsgang: { raumbedarf: ['wandflaeche'] }
};

/** What every room type offers (vocab raumtyp, field bietet). */
let BIETET: Record<string, string[]> = {};

export interface VorschlagOptionen {
  /** Needs the room cap (a method cannot need what one of its rooms lacks) does not apply to. */
  deckelAusnehmen?: string[];
}

export function vorschlag(b: Baustein, opts: VorschlagOptionen = {}): BedarfVorschlag {
  const text = [b.kurzbeschreibung, ...(b.durchfuehrung || []), ...(b.material || [])].join(' ').toLowerCase();
  const raum = (b.raum || '').toLowerCase();
  const material = (b.material || []).join(' ').toLowerCase();
  const lernort = b.lernort || [];
  const gruende: string[] = [];
  const schrift = new Set<string>();
  const braucht = new Set<string>();

  if (SCHREIBT.test(text)) {
    schrift.add('schreibt');
    gruende.push('schreibt: Text nennt Schreiben');
  }
  if (LIEST.test(text)) {
    schrift.add('liest');
    gruende.push('liest: Text nennt Lesen');
  }
  const nurPlenum = (b.interaktion || []).length > 0 && (b.interaktion || []).every((x) => x === 'plenum-lehrergeleitet');
  if (schrift.has('schreibt') && !nurPlenum) {
    braucht.add('schreibplatz');
    gruende.push('schreibplatz: schreibt, nicht nur Plenum');
  }
  if ((lernort.includes('bewegungsraum') && !lernort.includes('klassenraum')) || HALLE.test(raum)) {
    braucht.add('bewegungsflaeche');
    gruende.push('bewegungsflaeche: Halle oder Spielfläche');
  }
  if (WAND.test(raum) || WAND.test(material)) {
    braucht.add('wandflaeche');
    gruende.push('wandflaeche: Wand, Tafel oder Plakat');
  }
  if ((lernort.length === 1 && lernort[0] === 'fachraum') || (FACH.test(raum) && !raum.includes('klassenraum'))) {
    braucht.add('fachausstattung');
    gruende.push('fachausstattung: Fachraum');
  }
  if (AUSSEN.test(raum) && !raum.startsWith('klassenraum')) {
    braucht.add('aussenort');
    gruende.push('aussenort: Ort außerhalb der Schule');
  }

  // Cap: a method cannot need what one of its own listed rooms lacks (today's lernort already says where it works).
  // The outside place is exempt: it is constitutive even when preparation happens in the classroom.
  if (lernort.length && Object.keys(BIETET).length) {
    const ueberall = RAUM_ORDER.filter((x) => lernort.every((r) => (BIETET[r] || []).includes(x)));
    for (const x of [...braucht]) {
      if (x !== 'aussenort' && !(opts.deckelAusnehmen || []).includes(x) && !ueberall.includes(x)) {
        braucht.delete(x);
        gruende.push(`${x} entfällt: Raumtyp ${lernort.find((r) => !(BIETET[r] || []).includes(x))} bietet es nicht`);
      }
    }
  }
  // After the cap, so a play area the cap removed as Bewegungsfläche still counts as Stellfläche.
  if (STELL.test(raum) && !braucht.has('bewegungsflaeche')) {
    braucht.add('stellflaeche');
    gruende.push('stellflaeche: Raumtext nennt freie Fläche');
  }
  let raumbedarf = RAUM_ORDER.filter((x) => braucht.has(x));
  let schriftbedarf = ['liest', 'schreibt'].filter((x) => schrift.has(x));
  const ausnahme = AUSNAHMEN[b.kennung];
  if (ausnahme) {
    if (ausnahme.raumbedarf) raumbedarf = ausnahme.raumbedarf;
    if (ausnahme.schriftbedarf) schriftbedarf = ausnahme.schriftbedarf;
    gruende.push('von Hand korrigiert');
  }
  const raumhinweis = b.raum && !PLAIN_ROOM.test(b.raum.trim()) ? b.raum : null;
  return {
    raumbedarf,
    schriftbedarf,
    raumhinweis,
    betreuungshinweis: BETREUUNG[b.kennung] || null,
    kernkomponenteOrt: raumbedarf.includes('aussenort') ? 'Lernort außerhalb der Schule' : null,
    grund: gruende.join('; ') || 'keine Regel'
  };
}

/** Proposal for every method of the catalogue. */
export function vorschlagAlle(D: FmtData, opts: VorschlagOptionen = {}): Record<string, BedarfVorschlag> {
  BIETET = Object.fromEntries((D.schemes.find((x) => x.id === 'raumtyp')?.werte || []).map((w) => [w.id, w.bietet || []]));
  const out: Record<string, BedarfVorschlag> = {};
  for (const b of D.bausteine) out[b.kennung] = vorschlag(b, opts);
  return out;
}

function main() {
  const D = loadFmtData(path.join(ROOT, 'data'));
  const out = vorschlagAlle(D);

  const zaehl = (feld: 'raumbedarf' | 'schriftbedarf', wert: string) => Object.values(out).filter((v) => v[feld].includes(wert)).length;
  const label = (scheme: string, id: string) =>
    D.schemes.find((s) => s.id === scheme)?.werte?.find((w) => w.id === id)?.label || id;
  const esc = (s: string | null) => (s || '').replace(/\|/g, '\\|');
  const rows = D.bausteine
    .map((b) => ({ b, v: out[b.kennung] }))
    .sort((x, y) => x.v.raumbedarf.join(',').localeCompare(y.v.raumbedarf.join(',')) || x.b.kennung.localeCompare(y.b.kennung));

  const md = [
    '# Datenvorschlag Einsatzprofil: Raumbedarf und Schriftbedarf',
    '',
    `Erzeugt mit \`packages/fmt-core/scripts/vorschlag-einsatzprofil.ts\` aus den heutigen Feldern (${D.bausteine.length} Methoden). Bitte durchsehen; Korrekturen gehen in die Ausnahmeliste des Skripts.`,
    '',
    '## Zählung',
    '',
    '| Wert | Methoden |',
    '|---|---|',
    ...RAUM_ORDER.map((w) => `| Raumbedarf: ${label('raumbedarf', w)} | ${zaehl('raumbedarf', w)} |`),
    `| Raumbedarf: leer | ${Object.values(out).filter((v) => !v.raumbedarf.length).length} |`,
    ...['liest', 'schreibt'].map((w) => `| Schriftbedarf: ${label('schriftbedarf', w)} | ${zaehl('schriftbedarf', w)} |`),
    `| Raumhinweis gesetzt | ${Object.values(out).filter((v) => v.raumhinweis).length} |`,
    `| Betreuungshinweis gesetzt | ${Object.values(out).filter((v) => v.betreuungshinweis).length} |`,
    '',
    '## Methoden',
    '',
    '| Methode | Raumbedarf | Schriftbedarf | Raumhinweis | Grund |',
    '|---|---|---|---|---|',
    ...rows.map(
      ({ b, v }) =>
        `| ${esc(b.name)} (\`${b.kennung}\`) | ${v.raumbedarf.map((x) => label('raumbedarf', x)).join(', ') || '–'} | ${
          v.schriftbedarf.map((x) => label('schriftbedarf', x)).join(', ') || '–'
        } | ${esc(v.raumhinweis) || '–'} | ${esc(v.grund)} |`
    ),
    ''
  ].join('\n');

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'vorschlag-bedarf.json'), JSON.stringify(out, null, 2) + '\n');
  fs.writeFileSync(path.join(OUT, 'vorschlag-bedarf.md'), md);
  console.log(`Vorschlag für ${D.bausteine.length} Methoden nach ${OUT}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
