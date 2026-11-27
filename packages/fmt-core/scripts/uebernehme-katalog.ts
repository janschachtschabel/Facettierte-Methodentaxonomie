/**
 * Writes the reviewed data of Durchsicht 3 "Katalog" (Tor D3) into data/bausteine/.
 * Sources: the column `final` of durchsicht-3-katalog-geprueft.csv (the column `tor` holds the reason) and the
 * eleven drafts in daten-entwurf/<kennung>.json (Task D6).
 *
 * The `final` texts of this gate are prose, so the script does not parse them. The table ENTSCHEIDUNGEN below holds,
 * for every row of the CSV, the start of its `final` text and the data change it stands for. A row without an
 * entry, an entry without a row, or a `final` text that no longer starts as recorded stops the script: a changed
 * gate result then needs a new look, not a silent guess.
 *
 * Part 1: every draft is copied into data/bausteine/ with status `entwurf` and the changes of the gate applied.
 * Parts 2 and 3: evidence changes on existing entries. Part 4 changes nothing (later review).
 * Running the script a second time changes nothing.
 *
 * Usage: npx tsx packages/fmt-core/scripts/uebernehme-katalog.ts <durchsicht-3-katalog-geprueft.csv> <daten-entwurf-dir> [dataDir]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv } from './vorschlag-fmt2-bedarf.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(__dirname, '..', '..', '..', 'data');

type Eintrag = Record<string, unknown>;
type Befund = Record<string, unknown>;

export interface Entscheidung {
  /** Start of the `final` text this entry was written for. */
  final: string;
  /** The change on the entry; without it the row changes no data (adopted as proposed or part 4). */
  aendere?: (b: Eintrag) => Eintrag;
}

/** Sets keys of one finding; a key the finding lacks goes after the key named in `nach` (default: grad). */
function befund(b: Eintrag, index: number, werte: Befund, nach = 'grad'): Eintrag {
  const ev = [...((b.evidenz as Befund[]) || [])];
  if (!ev[index]) throw new Error(`${String(b.kennung)}: evidenz[${index}] fehlt`);
  let neu: Befund = { ...ev[index] };
  for (const [k, v] of Object.entries(werte)) {
    if (k in neu) neu[k] = v;
    else {
      const out: Befund = {};
      for (const [k2, v2] of Object.entries(neu)) {
        out[k2] = v2;
        if (k2 === nach) out[k] = v;
      }
      if (!(k in out)) out[k] = v;
      neu = out;
    }
  }
  ev[index] = neu;
  return { ...b, evidenz: ev };
}

/** Appends a sentence to a text field unless it already ends with it. */
function anhang(text: unknown, satz: string, trenner = ' '): string {
  const alt = String(text ?? '');
  if (alt.endsWith(satz)) return alt;
  return alt ? `${alt}${trenner}${satz}` : satz;
}

const SPRACHSENSIBEL =
  'Sprachsensible Unterrichtsansätze schneiden nicht schlechter ab als Kontrollunterricht; die Evidenz ist methodisch dünn, eine Meta-Analyse war nicht möglich.';
const HATTIE_HINWEIS =
  'Der Befund stützt sich auf Effektstärken nach Hattie; diese sind methodisch umstritten und dienen nicht als Rangfolge (Wecker et al. 2016)';
const TRANSFER_MUSIK = 'Ein Transfer von Musiktraining auf andere kognitive oder schulische Leistungen ist nicht belegt (Sala & Gobet 2020).';

/** One entry per CSV row (column `eintrag`). */
export const ENTSCHEIDUNGEN: Record<string, Entscheidung> = {
  // Part 1: the eleven drafts. Rows "übernommen" are already in the drafts; the rows the gate changed are applied.
  'T1-darstellungswechsel-eintrag': { final: 'aufnehmen als methode' },
  'T1-darstellungswechsel-1': { final: 'verstehen; konzept-gesichert' },
  'T1-darstellungswechsel-2': { final: 'mathe-informatik|nawi-technik' },
  'T1-darstellungswechsel-3': { final: 'schreibt', aendere: (b) => ({ ...b, schriftbedarf: ['schreibt'] }) },
  'T1-darstellungswechsel-4': {
    final: 'C/methode: Prediger & Wessel 2018, Befund nur im Wortlaut des Regelsatzes',
    aendere: (b) =>
      befund(b, 0, {
        befund: 'Quasi-experimentelle Studie in Mathematik; der Regelsatz der FMT 2.0 nennt keine Richtung des Befunds.',
        geltung: 'Mathematik; Einzelstudie; Wortlaut aus dem Regelsatz der FMT 2.0 („quasi-experimentell, Mathematik“), Original nicht geöffnet'
      })
  },
  'T1-schreiben-mit-schreibrahmen-eintrag': { final: 'aufnehmen als methode' },
  'T1-schreiben-mit-schreibrahmen-1': { final: 'methode' },
  'T1-schreiben-mit-schreibrahmen-2': { final: 'erstwissen-ungesichert; transfer-gezeigt' },
  'T1-schreiben-mit-schreibrahmen-3': { final: 'C/prinzip: Höfler et al. 2024; Einzelbefunde ohne Quelle' },
  'T1-satzmuster-redemittel-eintrag': { final: 'aufnehmen als hilfe' },
  'T1-satzmuster-redemittel-1': { final: 'hilfe; leer' },
  'T1-satzmuster-redemittel-2': { final: 'liest' },
  'T1-satzmuster-redemittel-3': { final: 'C/methode: Prediger & Wessel 2018 (kein Zusatznutzen)' },
  'T1-satzmuster-redemittel-4': { final: '5; 45' },
  'T1-sprachvergleich-eintrag': { final: 'aufnehmen als hilfe' },
  'T1-sprachvergleich-1': { final: 'hilfe; leer' },
  'T1-sprachvergleich-2': { final: 'leer' },
  'T1-sprachvergleich-3': {
    final: 'C/prinzip: Höfler et al. 2024, Befund wie beim Schreibrahmen',
    aendere: (b) =>
      befund(b, 0, {
        grad: 'C',
        evidenzBezug: 'prinzip',
        befund: SPRACHSENSIBEL,
        quelle: 'Höfler et al. 2024',
        geltung:
          'Systematisches Review mit 55 Studien; Effektstärken fehlen, einzelne Werkzeuge sind nicht für sich untersucht. Der Regelsatz der FMT 2.0 nennt den Sprachvergleich „im Mercator-Review mehrfach geprüft“; dass dieser Review Höfler et al. 2024 ist, ist angenommen'
      })
  },
  'T1-strukturierte-gruppenreflexion-eintrag': { final: 'aufnehmen als methode' },
  'T1-strukturierte-gruppenreflexion-1': { final: '5; metakognition; lernen-reflektiert' },
  'T1-strukturierte-gruppenreflexion-2': { final: 'leer' },
  'T1-strukturierte-gruppenreflexion-3': { final: 'C/prinzip: Kyndt et al. 2013' },
  'T1-training-sozialer-fertigkeiten-eintrag': { final: 'aufnehmen als methode' },
  'T1-training-sozialer-fertigkeiten-1': { final: 'r3; 2; 90–360' },
  'T1-training-sozialer-fertigkeiten-2': {
    final: 'einstellungen (ohne prozeduren); prozedur-gelaeufig',
    aendere: (b) => ({ ...b, aufgabe: ((b.aufgabe as string[]) || []).filter((x) => x !== 'prozeduren') })
  },
  'T1-training-sozialer-fertigkeiten-3': { final: 'B/programm: Durlak et al. 2011' },
  'T1-zielsetzung-planungsbogen-eintrag': { final: 'aufnehmen als hilfe' },
  'T1-zielsetzung-planungsbogen-1': { final: 'hilfe; leer' },
  'T1-zielsetzung-planungsbogen-2': { final: 'schreibplatz; schreibt', aendere: (b) => ({ ...b, schriftbedarf: ['schreibt'] }) },
  'T1-zielsetzung-planungsbogen-3': {
    final: 'B/programm: Dignath & Büttner 2008; C/prinzip: Locke & Latham 2002',
    aendere: (b) => befund(b, 1, { grad: 'C' })
  },
  'T1-klassenmusizieren-eintrag': { final: 'aufnehmen als methode' },
  'T1-klassenmusizieren-1': { final: 'fachausstattung; musik' },
  'T1-klassenmusizieren-2': { final: 'gegenstand' },
  'T1-klassenmusizieren-3': {
    final: 'nur C/methode: keine methodenspezifische Quelle; Sala & Gobet 2020 (kein Transfer) als Satz',
    aendere: (b) => ({
      ...b,
      hinweis: anhang(b.hinweis, TRANSFER_MUSIK),
      evidenz: ((b.evidenz as Befund[]) || []).filter((e) => e.quelle !== 'Sala & Gobet 2020')
    })
  },
  'T1-gestaltungsaufgabe-gruppen-eintrag': { final: 'aufnehmen als methode' },
  'T1-gestaltungsaufgabe-gruppen-1': { final: 'problem-erschlossen; transfer-gezeigt' },
  'T1-gestaltungsaufgabe-gruppen-2': { final: 'leer' },
  'T1-gestaltungsaufgabe-gruppen-3': {
    final: 'C/methode: keine methodenspezifische Quelle; C/prinzip: Kyndt et al. 2013',
    aendere: (b) => befund(b, 1, { grad: 'C' })
  },
  'T1-aesthetische-forschung-eintrag': { final: 'aufnehmen als methode' },
  'T1-aesthetische-forschung-1': { final: 'r3; 2; 180–900' },
  'T1-aesthetische-forschung-2': { final: 'leer' },
  'T1-aesthetische-forschung-3': { final: 'frage|forschungsbuch|verfahren|praesentation' },
  'T1-aesthetische-forschung-4': {
    final: 'C/methode: keine methodenspezifische Quelle; FMT 2.0, Regelsatz',
    aendere: (b) =>
      befund(b, 0, {
        quelle: 'keine methodenspezifische Quelle; FMT 2.0, Regelsatz',
        geltung: 'Kunstunterricht; Angabe „keine Wirkungsstudien“ aus dem Regelsatz der FMT 2.0; Kämpf-Jansen 2001 ist nur die Konzeptquelle'
      })
  },
  'T1-methodische-uebungsreihe-eintrag': { final: 'aufnehmen als methode' },
  'T1-methodische-uebungsreihe-1': { final: 'bewegungsflaeche' },
  'T1-methodische-uebungsreihe-2': { final: 'Text im Hinweis' },
  'T1-methodische-uebungsreihe-3': { final: 'C/methode: Größing 2007' },

  // Part 2: evidenzBezug programm.
  'T2-aufwaermen-0': { final: 'evidenzBezug=programm', aendere: (b) => befund(b, 0, { evidenzBezug: 'programm' }) },
  'T2-blitzlicht-0': { final: 'kein programm; bleibt ohne Bezug' },
  'T2-direkte-instruktion-0': {
    final: 'Befund teilen. (1) grad=B, evidenzBezug=methode (bleibt)',
    aendere: (b) => {
      const ev = (b.evidenz as Befund[]) || [];
      if (ev.length === 2 && ev[1].quelle === 'Stockard et al. 2018') return b;
      if (ev.length !== 1) throw new Error('direkte-instruktion: ein Befund erwartet');
      return {
        ...b,
        evidenz: [
          {
            grad: 'B',
            evidenzBezug: 'methode',
            befund: 'Kleinschrittige Instruktion mit geleiteter Übung: gleichgerichtete Befunde der Prozess-Produkt-Forschung',
            quelle: 'Rosenshine 2012',
            geltung: 'Überblick über Prozess-Produkt-Forschung zu lehrergeleitetem Unterricht; gilt dem Muster selbst'
          },
          {
            grad: 'B',
            evidenzBezug: 'programm',
            befund: 'Eine Meta-Analyse liegt nur für die DI-Curricula vor',
            quelle: 'Stockard et al. 2018',
            geltung: ev[0].geltung
          }
        ]
      };
    }
  },
  'T2-freiday-genius-hour-0': { final: 'kein programm; bleibt ohne Bezug' },
  'T2-juniorfirma-schuelerfirma-0': { final: 'kein programm; bleibt ohne Bezug' },
  'T2-klassenrat-0': { final: 'kein programm für den vorhandenen Befund; nichts ergänzen' },
  'T2-lernbuero-0': { final: 'kein programm; bleibt ohne Bezug' },
  'T2-lerntagebuch-0': { final: 'bleibt methode' },
  'T2-pro-contra-debatte-0': { final: 'evidenzBezug=programm', aendere: (b) => befund(b, 0, { evidenzBezug: 'programm' }) },
  'T2-reflexionsprompt-0': { final: 'bleibt methode' },
  'T2-schuelercoaching-0': { final: 'evidenzBezug=programm', aendere: (b) => befund(b, 0, { evidenzBezug: 'programm' }) },
  'T2-service-learning-0': { final: 'bleibt methode' },
  'T2-strukturierte-kontroverse-0': { final: 'bleibt methode' },

  // Part 3: the six findings with Hattie.
  'T3-diktat-klassisch-0': {
    final: 'Quelle ersetzen: quelle=Bredel, Fuhrhop & Noack 2011; grad=C',
    aendere: (b) => befund(b, 0, { grad: 'C', quelle: 'Bredel, Fuhrhop & Noack 2011' })
  },
  'T3-klassenarbeit-summativ-0': {
    final: 'quelle=Black & Wiliam 1998; grad=B bleibt; evidenzBezug=prinzip',
    aendere: (b) => befund(b, 0, { evidenzBezug: 'prinzip', quelle: 'Black & Wiliam 1998' })
  },
  'T3-kompetenzraster-checkliste-0': {
    final: 'quelle=Black & Wiliam 2009; grad=C; evidenzBezug=prinzip bleibt',
    aendere: (b) => befund(b, 0, { grad: 'C', quelle: 'Black & Wiliam 2009' })
  },
  'T3-mastery-learning-bloom-0': {
    final: 'Quelle ersetzen: quelle=Kulik, Kulik & Bangert-Drowns (1990); befund ohne',
    aendere: (b) => {
      const alt = String(((b.evidenz as Befund[]) || [])[0]?.befund ?? '');
      return befund(b, 0, { grad: 'B', befund: alt.replace(' (d ≈ 0,58)', ''), quelle: 'Kulik, Kulik & Bangert-Drowns (1990)' });
    }
  },
  'T3-microteaching-0': {
    final: 'grad=C; umstritten: vorhandenen Text behalten und den Hattie-Hinweis anhängen',
    aendere: (b) => {
      const alt = ((b.evidenz as Befund[]) || [])[0] || {};
      return befund(b, 0, {
        grad: 'C',
        befund: 'Microteaching wird in Hatties Synthese als wirksames Trainingsformat geführt.',
        umstritten: anhang(alt.umstritten, HATTIE_HINWEIS, '. ')
      });
    }
  },
  'T3-votum-ei-0': {
    final: 'kennzeichnen: geltung ergänzen „Hattie & Timperley 2007 ist ein Überblick',
    aendere: (b) => {
      const alt = ((b.evidenz as Befund[]) || [])[0] || {};
      return befund(b, 0, { geltung: anhang(alt.geltung, 'Hattie & Timperley 2007 ist ein Überblick zum Feedback, keine Effektstärken-Rangfolge', '; ') });
    }
  },

  // Part 4: counted only; the gate sets nothing now.
  'T4-gruppe-a': { final: 'später in einem Zug' },
  'T4-gruppe-b': { final: 'später Einzeldurchsicht nach Quelle; in diesem Tor nichts setzen' }
};

export interface Zeile {
  eintrag: string;
  teil: string;
  kennung: string;
  final: string;
}

export interface Bericht {
  neu: string[];
  geaendert: string[];
  ohneAenderung: number;
}

/** Checks the table against the CSV rows; returns the decisions grouped by kennung in row order. */
export function ordne(zeilen: Zeile[], tabelle: Record<string, Entscheidung> = ENTSCHEIDUNGEN): Map<string, Entscheidung[]> {
  const fehler: string[] = [];
  const gesehen = new Set<string>();
  const out = new Map<string, Entscheidung[]>();
  for (const z of zeilen) {
    gesehen.add(z.eintrag);
    const e = tabelle[z.eintrag];
    if (!e) fehler.push(`${z.eintrag}: keine Entscheidung im Skript`);
    else if (!z.final.trim().startsWith(e.final)) fehler.push(`${z.eintrag}: final beginnt nicht mit „${e.final}“`);
    else if (z.teil !== '4') out.set(z.kennung, [...(out.get(z.kennung) || []), e]);
  }
  for (const k of Object.keys(tabelle)) if (!gesehen.has(k)) fehler.push(`${k}: Entscheidung ohne Zeile in der CSV`);
  if (fehler.length) throw new Error(`Tabelle passt nicht zur geprüften CSV:\n${fehler.join('\n')}`);
  return out;
}

/** Applies the decisions to one entry; a new entry (draft) always gets status entwurf. */
export function wendeAn(b: Eintrag, entscheidungen: Entscheidung[], neu: boolean): Eintrag {
  let out: Eintrag = neu ? { ...b, status: 'entwurf' } : b;
  for (const e of entscheidungen) if (e.aendere) out = e.aendere(out);
  return out;
}

const json = (x: unknown) => JSON.stringify(x, null, 2) + '\n';

export function main(csvPfad: string, entwurfDir: string, dataDir = DATA): Bericht {
  const zeilen = parseCsv(fs.readFileSync(csvPfad, 'utf8')) as unknown as Zeile[];
  const gruppen = ordne(zeilen);
  const neue = new Set(zeilen.filter((z) => z.teil === '1' && z.eintrag.endsWith('-eintrag')).map((z) => z.kennung));
  const bericht: Bericht = { neu: [], geaendert: [], ohneAenderung: 0 };
  const dir = path.join(dataDir, 'bausteine');
  for (const [kennung, entscheidungen] of gruppen) {
    const ziel = path.join(dir, `${kennung}.json`);
    const istNeu = neue.has(kennung);
    if (!istNeu && !entscheidungen.some((e) => e.aendere)) {
      bericht.ohneAenderung++;
      continue;
    }
    const quelle = istNeu ? path.join(entwurfDir, `${kennung}.json`) : ziel;
    if (!fs.existsSync(quelle)) throw new Error(`${istNeu ? 'Entwurf' : 'Methode'} fehlt: ${quelle}`);
    const roh = JSON.parse(fs.readFileSync(quelle, 'utf8')) as Eintrag;
    if (roh.kennung !== kennung) throw new Error(`${quelle}: Kennung ${String(roh.kennung)} statt ${kennung}`);
    const text = json(wendeAn(roh, entscheidungen, istNeu));
    const alt = fs.existsSync(ziel) ? fs.readFileSync(ziel, 'utf8') : null;
    if (alt === text) bericht.ohneAenderung++;
    else {
      fs.writeFileSync(ziel, text);
      (alt === null ? bericht.neu : bericht.geaendert).push(`bausteine/${kennung}.json`);
    }
  }
  return bericht;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [csv, entwurf, dataDir] = process.argv.slice(2);
  if (!csv || !entwurf) throw new Error('Pfad zur geprüften CSV und zum Ordner daten-entwurf fehlt.');
  const b = main(csv, entwurf, dataDir ? path.resolve(dataDir) : DATA);
  console.log(`${b.neu.length} neu, ${b.geaendert.length} geändert, ${b.ohneAenderung} ohne Änderung.`);
  for (const p of [...b.neu, ...b.geaendert]) console.log(`  ${p}`);
}
