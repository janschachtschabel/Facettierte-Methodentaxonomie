/**
 * Builds data proposal 3 for FMT 2.0 (Durchsicht 3, "Katalog", Tor D3): the eleven missing entries of the rule set
 * (fehlendeMethoden) as drafts, the proposal for the evidence reference "programm", the six findings that lean on
 * Hattie, and the count of findings without an evidence reference. It writes a readable proposal, one machine-readable
 * entry table for the reviewers and that table split into blocks. Data files stay untouched; the drafts are read from
 * their own folder (written beforehand, not by this script).
 *
 * Counts and candidate lists are computed from the data (patterns over source, finding and scope of each evidence
 * statement); where judgement is needed, the tables below carry the proposal and its reason. A candidate without a
 * judgement, or a judgement without its candidate, stops the script, so the proposal cannot drift from the data.
 *
 * Usage: npx tsx packages/fmt-core/scripts/vorschlag-fmt2-katalog.ts [dataDir] [outDir] [entwurfDir] [regelsatzJson]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import type { Baustein, Evidenzaussage, FmtData } from '../src/types.js';
import { WISSENSARTEN } from './uebernehme-durchsicht.js';
import { zuCsv, type Eintrag } from './vorschlag-fmt2-eignung.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..');

const md = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const liste = (xs: readonly string[] | undefined) => (xs && xs.length ? xs.join('|') : '–');
const eintrag = (teil: number, id: string, kennung: string, feld: string, wert_alt: string, vorschlag: string, beleg: string): Eintrag => ({
  eintrag: `T${teil}-${id}`,
  teil: String(teil),
  kennung,
  feld,
  wert_alt,
  vorschlag,
  beleg,
  entscheidung: '',
  pruefnotiz: ''
});
const befundKurz = (e: Evidenzaussage) => `${e.grad}${e.evidenzBezug ? `/${e.evidenzBezug}` : ''}: ${e.befund} (${e.quelle})`;

interface Teil {
  nr: number;
  titel: string;
  einleitung: string[];
  info: string[];
  eintraege: Eintrag[];
}

// ---- Part 1: the eleven drafts ----

/** Missing entry of the rule set as written there. */
export interface FehlendeMethode {
  name: string;
  art: 'methode' | 'hilfe';
  zielbezug: string;
  evidenz: string;
}

/** Kennung of each draft, by the name the rule set gives. */
export const KENNUNG_JE_NAME: Record<string, string> = {
  Darstellungswechsel: 'darstellungswechsel',
  'Schreiben mit Schreibrahmen': 'schreiben-mit-schreibrahmen',
  'Satzmuster und Redemittel': 'satzmuster-redemittel',
  Sprachvergleich: 'sprachvergleich',
  'Strukturierte Gruppenreflexion': 'strukturierte-gruppenreflexion',
  'Training sozialer Fertigkeiten': 'training-sozialer-fertigkeiten',
  'Zielsetzung mit Planungsbogen': 'zielsetzung-planungsbogen',
  Klassenmusizieren: 'klassenmusizieren',
  'Gestaltungsaufgabe in Gruppen': 'gestaltungsaufgabe-gruppen',
  'Ästhetische Forschung': 'aesthetische-forschung',
  'Methodische Übungsreihe': 'methodische-uebungsreihe'
};

/** Judgement per draft: verdict of the duplicate check and the coding decisions that are not obvious. */
interface Entscheidung {
  feld: string;
  vorschlag: string;
  beleg: string;
  /** Open point: a source or a reading still to be checked before the entry may leave the status entwurf. */
  offen?: boolean;
}
interface EntwurfUrteil {
  doublette: string;
  entscheidungen: Entscheidung[];
}

const QUELLE_NUR_REGELSATZ =
  'Die Quelle steht nur als Kurzangabe im Regelsatz der FMT 2.0 (fehlendeMethoden), nicht im Literaturverzeichnis der Papiere; Titel und Richtung des Befunds sind am Original zu prüfen';

export const URTEIL: Record<string, EntwurfUrteil> = {
  darstellungswechsel: {
    doublette: 'Kein Eintrag führt den Wechsel oder das Vernetzen von Darstellungen, weder als Name noch als Alternativname oder im Text.',
    entscheidungen: [
      { feld: 'lernfunktion; nachbedingung', vorschlag: 'verstehen; konzept-gesichert', beleg: 'Die letzte Stufe sichert die Erklärung der Entsprechungen im Plenum in Fachsprache (Durchführung, Schritt 4); der Entwurf trägt damit den Kettenschritt „Konzept generieren oder darbieten und sichern“' },
      { feld: 'fachbereich', vorschlag: 'mathe-informatik|nawi-technik', beleg: 'Verbreitung, keine Eignung: die Studie stammt aus der Mathematik; der Ansatz ist in MINT üblich. Alternative: uebergreifend' },
      { feld: 'schriftbedarf', vorschlag: 'liest|schreibt', beleg: 'Durchführung, Schritt 3 „Paare schreiben auf …“; Material: Aufgabenkarte' },
      { feld: 'evidenz', vorschlag: 'C/methode: Prediger & Wessel 2018; C/prinzip: Höfler et al. 2024', beleg: `${QUELLE_NUR_REGELSATZ}. Grad C, weil eine Einzelstudie`, offen: true }
    ]
  },
  'schreiben-mit-schreibrahmen': {
    doublette: 'Kein Eintrag führt Schreibrahmen oder Schreibgerüste; die Wortsuche traf quellenkritik-faktencheck nur über den Wortteil „genre“ in „Gegenrecherche“.',
    entscheidungen: [
      { feld: 'eintragsart', vorschlag: 'methode', beleg: 'Regelsatz: art methode. Die Phase liefert einen Text; der Rahmen selbst ist Kernkomponente und wird abgebaut' },
      { feld: 'vorbedingung; nachbedingung', vorschlag: 'erstwissen-ungesichert; transfer-gezeigt', beleg: 'Problem: Lernende kennen den Inhalt schon; Ergebnis ist ein eigener Text (Lernstand „Produkt erstellt“, Kette Produktion, Schritt pd3)' },
      { feld: 'evidenz', vorschlag: 'C/prinzip: Höfler et al. 2024; Einzelbefunde ohne Quelle', beleg: 'Der Regelsatz nennt „Einzelbefunde“ ohne Quelle; in den Papieren und im Katalog steht keine methodenspezifische Quelle. Die Lücke steht im Hinweis des Entwurfs', offen: true }
    ]
  },
  'satzmuster-redemittel': {
    doublette: 'Verwandt, kein Duplikat: klassen-glossar führt „Wortspeicher“ als Alternativname und nennt Satzstarter, ist aber eine Methode für Fachbegriffe über eine Einheit (Lernstand wissen-konsolidiert); scaffolding-hilfen nennt „Sprachsensible Formulierungshilfen“ als Variante gestufter Aufgabenhilfen. Vorschlag: eigener Eintrag als Hilfe. Alternative: die Variante bei scaffolding-hilfen ausbauen und keinen neuen Eintrag anlegen.',
    entscheidungen: [
      { feld: 'eintragsart; nachbedingung', vorschlag: 'hilfe; leer', beleg: 'Regelsatz: art hilfe; FMT-Papier: Satzmuster tragen keine Phase und liefern keinen Lernstand' },
      { feld: 'schriftbedarf', vorschlag: 'liest', beleg: 'Lernende lesen die Redemittel (Material: Karte oder Tafelanschrieb). Folge: die Regel schrift-niedriges-sprachniveau gilt dem Wortlaut nach auch hier, obwohl die Hilfe gerade für niedrige Sprachstände gedacht ist. Alternative: leer lassen', offen: true },
      { feld: 'evidenz', vorschlag: 'C/methode: Prediger & Wessel 2018 (kein Zusatznutzen); C/prinzip: Höfler et al. 2024', beleg: `${QUELLE_NUR_REGELSATZ}. Höfler et al.: als einzelne Werkzeuge nicht untersucht (FMT-Papier, Abschnitt „Methode und Hilfe“)`, offen: true },
      { feld: 'dauerMin; dauerMax', vorschlag: '5; 45', beleg: 'Eine Hilfe läuft innerhalb der Phase; die Spanne folgt der Phase und hat keine eigene Bedeutung' }
    ]
  },
  sprachvergleich: {
    doublette: 'Verwandt, kein Duplikat: tandem-lernen paart Lernende mit verschiedenen Erstsprachen als eigene Methode; woerterwiese sammelt Begriffe zur Vorentlastung. Keiner vergleicht Sprachen als Stütze innerhalb einer Phase.',
    entscheidungen: [
      { feld: 'eintragsart; nachbedingung', vorschlag: 'hilfe; leer', beleg: 'Regelsatz: art hilfe' },
      { feld: 'schriftbedarf', vorschlag: 'leer', beleg: 'Durchführung, Schritt 2: Lernende nennen die Entsprechung; Schreiben ist nicht nötig' },
      { feld: 'evidenz', vorschlag: 'C/methode: Höfler et al. 2024', beleg: 'Regelsatz: „im Mercator-Review mehrfach geprüft“. Dass damit Höfler et al. 2024 gemeint ist, ist eine Annahme (A); Effektstärken fehlen laut Taxonomie', offen: true }
    ]
  },
  'strukturierte-gruppenreflexion': {
    doublette: 'Verwandt, kein Duplikat: supervision-gruppe reflektiert berufliche Fälle; blitzlicht ist eine Runde im Plenum; cool-down-auswertung wertet Belastung im Sport aus. Keiner wertet die Zusammenarbeit einer Gruppe aus.',
    entscheidungen: [
      { feld: 'dauerMin; lernfunktion; nachbedingung', vorschlag: '5; metakognition; lernen-reflektiert', beleg: 'Damit kommt der Entwurf als Begleitstrang für das Begleitziel soziales Lernen in Frage (zuordnung.ts: höchstens 5 Minuten, metakognition, lernen-reflektiert, trägt das Begleitziel über kleingruppe-kooperativ). So vorgesehen in der Taxonomie („Gruppenreflexion“ als Begleitstrang)' },
      { feld: 'schriftbedarf', vorschlag: 'leer', beleg: 'Durchführung, Schritt 4: das Vorhaben wird genannt; die schriftliche Fassung ist Variante' },
      { feld: 'evidenz.grad', vorschlag: 'C/prinzip: Kyndt et al. 2013', beleg: 'Kyndt et al. ist eine Meta-Analyse (Grad B für kooperatives Lernen), die einzelne Komponente ist aber nicht geprüft. Mit Grad B verdrängte der Entwurf im Probelauf das Cool-down aus dem Auswertungsschritt einer Sportstunde (golden.test.ts, S-Fälle). „Basiselement“ stammt aus dem Regelsatz; ob Kyndt et al. die Gruppenreflexion so nennt, ist am Original zu prüfen', offen: true }
    ]
  },
  'training-sozialer-fertigkeiten': {
    doublette: 'Kein Eintrag führt ein Training sozialer Fertigkeiten; simulation-globale nennt soziale Fertigkeiten nur nebenbei.',
    entscheidungen: [
      { feld: 'reichweite; termineMin; dauerMin–dauerMax', vorschlag: 'r3; 2; 90–360 (alle Einheiten zusammen)', beleg: 'Kernkomponente „Anwendung im Unterricht und Auswertung über mehrere Wochen“; Durchführung, Schritt 5 (folgende Einheit)' },
      { feld: 'aufgabe (Wissensart); nachbedingung', vorschlag: 'prozeduren|einstellungen; prozedur-gelaeufig', beleg: 'Soziale Fertigkeiten werden wie Verfahren eingeübt. Risiko: eine Verfahrenskette könnte den Entwurf wählen; r3 und termineMin 2 halten ihn aus einzelnen Stunden heraus' },
      { feld: 'evidenz', vorschlag: 'B/programm: Durlak et al. 2011', beleg: 'Durlak et al. 2011 ist eine Meta-Analyse schulischer Programme (Papiere, Literaturverzeichnis); der Befund gilt dem Programm. Hinweis: rankingGrade senkt nur Grad A mit Bezug programm, Grad B zählt als B' }
    ]
  },
  'zielsetzung-planungsbogen': {
    doublette: 'Verwandt, kein Duplikat: lernvertrag (Zielvereinbarung mit der Lehrkraft über eine Reihe, Methode mit Lernstand), lernentwicklungsgespraech und wochenplanarbeit. Vorschlag: eigener Eintrag als Hilfe für eine Arbeitsphase. Alternative: als Variante „Planungsbogen für eine Arbeitsphase“ beim Lernvertrag führen und keinen neuen Eintrag anlegen.',
    entscheidungen: [
      { feld: 'eintragsart; nachbedingung', vorschlag: 'hilfe; leer', beleg: 'Regelsatz: art hilfe' },
      { feld: 'raumbedarf; schriftbedarf', vorschlag: 'schreibplatz; liest|schreibt', beleg: 'Durchführung, Schritte 2 und 4: Lernende füllen den Bogen aus und notieren einen Satz' },
      { feld: 'evidenz', vorschlag: 'B/programm: Dignath & Büttner 2008; B/prinzip: Locke & Latham 2002', beleg: 'Dignath & Büttner (Papiere, Literaturverzeichnis) ist eine Meta-Analyse zu Trainings; „als Komponente belegt“ stammt aus dem Regelsatz und ist am Original zu prüfen. Locke & Latham 2002 steht im Katalog (lernvertrag)', offen: true }
    ]
  },
  klassenmusizieren: {
    doublette: 'Verwandt, kein Duplikat: gebundene-musik-rhythmus (Bodypercussion, kurze Rhythmusbausteine), chorsprechen (Sprechen im Chor), teil-ganz-ueben (abschnittsweises Einüben). Keiner führt das gemeinsame Spiel eines Stücks durch die ganze Klasse.',
    entscheidungen: [
      { feld: 'raumbedarf; fachausstattungArt', vorschlag: 'fachausstattung; musik', beleg: 'Beispiel des Kodierleitfadens („Klassenmusizieren: Musik“); Grundform mit Klasseninstrumenten, das Spiel nur mit Stimme ist Variante. Folge: nur der Musikraum deckt den Bedarf' },
      { feld: 'weltbezug', vorschlag: 'gegenstand', beleg: 'Nicht „andere“: der Entwurf soll das Begleitziel soziales Lernen nicht schon durch das Ensemble tragen. Alternative: gegenstand|andere' },
      { feld: 'evidenz', vorschlag: 'C/methode: keine methodenspezifische Quelle; B/programm: Sala & Gobet 2020 (kein Transfer)', beleg: 'Taxonomie: fachinterne Wirkungsnachweise fehlen fast ganz, Transfer nicht belegt. Der zweite Befund ist negativ, hebt aber den Grad für die Rangfolge auf B. Alternative: nur der erste Befund; die Oberfläche zeigt den Satz zum Eigenwert bei Ästhetik ohnehin (Task D4)', offen: true }
    ]
  },
  'gestaltungsaufgabe-gruppen': {
    doublette: 'Verwandt, kein Duplikat: galeriemethode (Skizzen einzeln, Galerie, Überarbeitung), lernplakat. Keiner führt die gestalterische Gruppenaufgabe mit verteilten Aufgaben.',
    entscheidungen: [
      { feld: 'vorbedingung; nachbedingung', vorschlag: 'problem-erschlossen; transfer-gezeigt', beleg: 'Kette Produktion: pd1 klärt Auftrag und Kriterien, der Entwurf trägt pd3 „Entwerfen und ausarbeiten“' },
      { feld: 'raumbedarf', vorschlag: 'leer', beleg: 'Der Bedarf hängt vom Material ab (Raumhinweis); kein Bedarf gilt ohne Ausnahme' },
      { feld: 'evidenz', vorschlag: 'C/methode: keine methodenspezifische Quelle; A/prinzip: Kyndt et al. 2013; Johnson, Johnson & Stanne 2000', beleg: 'Regelsatz: „keine methodenspezifische“. Der Prinzip-Befund steht wortgleich so im Katalog (gruppenpuzzle, placemat); für gestalterische Ziele nicht geprüft' }
    ]
  },
  'aesthetische-forschung': {
    doublette: 'Kein Eintrag führt die Ästhetische Forschung; forschendes-lernen ist empirisch angelegt (Forschungsfrage, Untersuchungsdesign, Daten), lernportfolio sammelt Arbeiten ohne eigene Frage.',
    entscheidungen: [
      { feld: 'reichweite; termineMin; dauerMin–dauerMax', vorschlag: 'r3; 2; 180–900 (alle Termine zusammen)', beleg: 'Durchführung, Schritt 2: Sammeln über mehrere Wochen; wie lernportfolio' },
      { feld: 'schriftbedarf', vorschlag: 'leer', beleg: 'Das Forschungsbuch nimmt Fundstücke, Skizzen und Fotos auf; Schreiben gilt nicht ohne Ausnahme. Alternative: schreibt' },
      { feld: 'kernkomponente', vorschlag: 'frage|forschungsbuch|verfahren|praesentation', beleg: 'Nach dem Konzept von Kämpf-Jansen (2001; Literaturverzeichnis von `fmt-paper-begruendung-aufbau-verwendung.md`, dort „Verlag nicht geprüft“); das Buch ist nicht geöffnet', offen: true },
      { feld: 'evidenz', vorschlag: 'C/methode: Kämpf-Jansen 2001 (Konzept, keine Wirkungsstudien)', beleg: 'Regelsatz: „keine Wirkungsstudien“' }
    ]
  },
  'methodische-uebungsreihe': {
    doublette: 'Verwandt, kein Duplikat: teil-ganz-ueben zerlegt einen Ablauf in Abschnitte, die Übungsreihe baut die Zielbewegung über vorbereitende Übungen auf; stationstraining-bewegung und demonstration-nachmachen sind andere Formen. Das abgelöste Protokoll nennt die Übungsreihe für Version 0.9.0, der Katalog führt sie nicht.',
    entscheidungen: [
      { feld: 'raumbedarf', vorschlag: 'bewegungsflaeche', beleg: 'Halle oder Platz; nicht fachausstattung, weil Geräte von der Zielbewegung abhängen und die Übungsreihe auch draußen läuft. Alternative: bewegungsflaeche|fachausstattung mit Art sport (dann nur die Halle)' },
      { feld: 'betreuungshinweis', vorschlag: 'Text im Hinweis', beleg: 'Das Feld steht in types.ts, fehlt aber im JSON-Schema (additionalProperties false); der Probelauf schlug damit fehl. Der Satz zur Hilfe- und Sicherheitsstellung steht deshalb im Hinweis' },
      { feld: 'evidenz', vorschlag: 'C/methode: Größing 2007 (fachdidaktische Tradition)', beleg: 'Größing 2007 steht im Katalog; die Fundstelle ist nicht geprüft. Wickens et al. 2013 (im Katalog bei teil-ganz-ueben) untersucht Training mit steigender Schwierigkeit; die Richtung des Befunds ist nicht geöffnet und deshalb nicht übernommen', offen: true }
    ]
  }
};

/** Words that say nothing about a method's identity in the duplicate check. */
const STOPP = new Set(['methode', 'lernen', 'unterricht', 'gruppen', 'gruppe', 'klasse', 'nutzen', 'schreiben', 'training', 'aufgabe', 'strukturierte', 'strukturiert', 'nach']);
const stamm = (w: string) => w.slice(0, 7);
const woerter = (s: string) =>
  s
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((w) => w.length >= 5 && !STOPP.has(w))
    .map(stamm);

/** Catalog entries whose kennung, name or alternative names share a word stem with the draft's name or alternatives. */
export function doublettenTreffer(D: FmtData, entwurf: Baustein): string[] {
  const eigen = new Set([entwurf.name, ...entwurf.alternativname, entwurf.kennung.replace(/-/g, ' ')].flatMap(woerter));
  const treffer: string[] = [];
  for (const b of D.bausteine) {
    const fremd = [b.name, ...b.alternativname, b.kennung.replace(/-/g, ' ')].flatMap(woerter);
    const gemeinsam = [...new Set(fremd.filter((w) => eigen.has(w)))];
    if (gemeinsam.length) treffer.push(`${b.kennung} (${gemeinsam.join(', ')})`);
  }
  for (const [alt, ziel] of Object.entries(D.weiterleitungen || {})) {
    if (woerter(alt.replace(/-/g, ' ')).some((w) => eigen.has(w))) treffer.push(`Weiterleitung ${alt} → ${ziel}`);
  }
  if (D.bausteine.some((b) => b.kennung === entwurf.kennung) || (D.weiterleitungen || {})[entwurf.kennung]) {
    throw new Error(`Kennung schon vergeben: ${entwurf.kennung}`);
  }
  return treffer;
}

const wissensart = (b: Baustein) => (b.aufgabe || []).filter((x) => WISSENSARTEN.includes(x));

export function teil1(D: FmtData, fehlend: FehlendeMethode[], entwuerfe: Baustein[], probelauf: string[]): Teil {
  const je = new Map(entwuerfe.map((b) => [b.kennung, b]));
  if (fehlend.length !== 11) throw new Error(`Regelsatz nennt ${fehlend.length} fehlende Einträge, erwartet 11`);
  const zeilen: string[] = [
    '| Name | Kennung | Art | Zielbezug (Regelsatz) | Reichweite | Lernfunktion → Lernstand | Wissensart | Bedarf | Evidenz (Grad/Bezug: Quelle) | Doublettenprüfung |',
    '|---|---|---|---|---|---|---|---|---|---|'
  ];
  const eintraege: Eintrag[] = [];
  const treffer: string[] = ['| Entwurf | Wortstamm-Treffer in Name, Alternativname, Kennung, Weiterleitung | Urteil |', '|---|---|---|'];
  const begruendung: string[] = [];
  const offen: string[] = [];
  for (const f of fehlend) {
    const k = KENNUNG_JE_NAME[f.name];
    const b = k ? je.get(k) : undefined;
    if (!k || !b) throw new Error(`Kein Entwurf für „${f.name}“`);
    const u = URTEIL[k];
    if (!u) throw new Error(`Kein Urteil für ${k}`);
    const art = b.eintragsart || 'methode';
    if (art !== f.art) throw new Error(`${k}: Eintragsart ${art}, Regelsatz ${f.art}`);
    if (b.status !== 'entwurf') throw new Error(`${k}: Status ${b.status}`);
    const bedarf = [
      b.raumbedarf?.length ? `Raum ${liste(b.raumbedarf)}${b.fachausstattungArt ? ` (${b.fachausstattungArt})` : ''}` : 'Raum –',
      b.schriftbedarf?.length ? `Schrift ${liste(b.schriftbedarf)}` : 'Schrift –',
      b.termineMin ? `Termine ≥ ${b.termineMin}` : ''
    ].filter(Boolean).join('; ');
    const evidenz = b.evidenz.map((e) => `${e.grad}/${e.evidenzBezug || '–'}: ${e.quelle}`).join('; ');
    const doublette = /^Kein Eintrag/.test(u.doublette) ? 'keine' : 'verwandt, kein Duplikat';
    zeilen.push(
      `| ${md(b.name)} | \`${k}\` | ${art} | ${md(f.zielbezug)} | ${b.reichweite} | ${md(`${liste(b.lernfunktion)} → ${liste(b.nachbedingung)}`)} | ${md(liste(wissensart(b)))} | ${md(bedarf)} | ${md(evidenz)} | ${doublette} |`
    );
    const hits = doublettenTreffer(D, b);
    treffer.push(`| \`${k}\` | ${md(hits.join('; ') || '–')} | ${md(u.doublette)} |`);
    begruendung.push(`**${b.name}** (\`${k}\`)`, '', ...u.entscheidungen.map((e) => `- ${e.feld}: ${e.vorschlag}. ${e.beleg}.${e.offen ? ' **Offen.**' : ''}`), '');
    for (const e of u.entscheidungen.filter((x) => x.offen)) offen.push(`- \`${k}\`, ${e.feld}: ${e.beleg}.`);
    eintraege.push(
      eintrag(1, `${k}-eintrag`, k, 'neuer Eintrag', '–', `aufnehmen als ${art}, Status entwurf (daten-entwurf/${k}.json)`, `Regelsatz: ${f.zielbezug}; Evidenz laut Regelsatz „${f.evidenz}“. Doublettenprüfung: ${u.doublette}`)
    );
    u.entscheidungen.forEach((e, i) =>
      eintraege.push(eintrag(1, `${k}-${i + 1}`, k, e.feld, '–', e.vorschlag, e.beleg + (e.offen ? ' (offen)' : '')))
    );
  }
  return {
    nr: 1,
    titel: 'Elf neue Einträge als Entwürfe',
    einleitung: [
      'Die elf Einträge aus `fmt2-regelsatz.json` → `fehlendeMethoden` (acht Methoden, drei Hilfen) liegen als vollständige Bausteine im Format des Repositorys unter `daten-entwurf/<kennung>.json`, alle im Status `entwurf`. Sie tragen alle 13 Facetten, Bedarf (Raum, Schrift, Termine), Eintragsart, Beitrag, Quellen und Evidenz mit Bezug. Keine Datei unter `data/bausteine/` ist geändert; neue Methoden bleiben im Status `entwurf`, bis Jan sie gelesen hat.',
      '',
      '**Quellen.** Jede Quelle steht in den Papieren unter `quellen/` (Literaturverzeichnis oder Regelsatz) oder schon im Katalog. Wo das nur als Kurzangabe im Regelsatz gilt oder eine Zuordnung angenommen ist, steht der Punkt unter „Offen“. Wo keine methodenspezifische Quelle existiert, sagt der Befund das (Grad C, „keine methodenspezifische Quelle“). Die OEH-Kategorie (`kategorie`) ist bei keinem Entwurf gesetzt; `plot` ist aus Anleitung und Engagement gemittelt wie in der Katalogansicht.',
      '',
      '**Probelauf.**',
      '',
      ...probelauf
    ],
    info: [
      '### 1a Die elf Entwürfe',
      '',
      ...zeilen,
      '',
      '### 1b Doublettenprüfung',
      '',
      'Vor jedem Entwurf geprüft: gleicher oder ähnlicher Name, Alternativname, Kennung und Weiterleitung (`data/weiterleitungen.json`). Die Tabelle zeigt die Treffer über gemeinsame Wortstämme (mindestens fünf Buchstaben, ohne Allerweltswörter); dazu kam eine Wortsuche in Kurzbeschreibung, Durchführung, Material und Varianten. Kein Entwurf doppelt einen Eintrag; bei zwei Hilfen steht eine Alternative ohne neuen Eintrag zur Wahl.',
      '',
      ...treffer,
      '',
      '### 1c Begründung der nicht offensichtlichen Kodierungen',
      '',
      ...begruendung,
      '### 1d Offen vor der Freigabe',
      '',
      ...offen
    ],
    eintraege
  };
}

// ---- Part 2: evidence reference "programm" ----

/** Patterns that point to a finding about a whole programme (or to a research programme, which is not the same). */
const PROGRAMM_MUSTER = /programm(?!ier|ing)|durlak|dignath|stockard|fifa|jugend debattiert|curricul|schulentwicklung|schule im aufbruch|netzwerk/i;
/** Methods the taxonomy names: programme findings do not pass to them (fmt2-taxonomie-w-fragen.md, „Evidenz ehrlich ausweisen“). */
const GENANNT = ['klassenrat', 'blitzlicht'];

interface ProgrammUrteil {
  vorschlag: string;
  beleg: string;
}
/** Judgement per candidate finding (kennung#index). */
export const PROGRAMM_URTEIL: Record<string, ProgrammUrteil> = {
  'aufwaermen#0': { vorschlag: 'evidenzBezug=programm', beleg: 'Der Befund gilt strukturierten Aufwärmprogrammen (FIFA 11+), die über eine Saison regelmäßig laufen; eine einzelne Aufwärmphase erbt die Verletzungsvorbeugung nicht' },
  'direkte-instruktion#0': { vorschlag: 'evidenzBezug=programm', beleg: 'Die einzige Meta-Analyse (Stockard et al. 2018) gilt Engelmanns ausgearbeiteten Programmen, nicht jedem lehrergeleiteten Unterricht (FMT-Papier `fmt-paper-begruendung-aufbau-verwendung.md`, erster Abschnitt; die Geltung des Befunds sagt dasselbe). Alternative: den Befund teilen, Rosenshine 2012 mit Bezug prinzip, Stockard et al. 2018 mit Bezug programm. Eintrag ist kuratiert' },
  'schuelercoaching#0': { vorschlag: 'evidenzBezug=programm', beleg: 'Dignath & Büttner 2008 wertet Trainings zum selbstregulierten Lernen über mehrere Sitzungen aus, nicht Einzelberatung; Hardeland 2015 ist Praxisliteratur. Heute prinzip' },
  'pro-contra-debatte#0': { vorschlag: 'evidenzBezug=programm', beleg: 'Die Evaluationen gelten dem Programm „Jugend debattiert“ (Training und Wettbewerb über Wochen), nicht der einzelnen Pro-Contra-Debatte' },
  'service-learning#0': { vorschlag: 'bleibt methode', beleg: 'Celio, Durlak & Dymnicki 2011 untersucht Service-Learning-Programme; der Eintrag ist selbst ein solches Format über Wochen (Reichweite r3), der Befund gilt also der Methode' },
  'lerntagebuch#0': { vorschlag: 'bleibt methode', beleg: '„Forschungsprogramm“ heißt hier eine Reihe von Experimenten zur Methode selbst (Nückles et al. 2020), kein Unterrichtsprogramm' },
  'reflexionsprompt#0': { vorschlag: 'bleibt methode', beleg: 'Wie lerntagebuch: Forschungsprogramm zur Methode, kein Unterrichtsprogramm' },
  'strukturierte-kontroverse#0': { vorschlag: 'bleibt methode', beleg: 'Meta-Analyse eines Forschungsprogramms zur Methode selbst (Johnson & Johnson 2009), kein Unterrichtsprogramm' },
  'lernbuero#0': { vorschlag: 'kein programm; bleibt ohne Bezug (Teil 4)', beleg: 'Schulentwicklungskonzept ohne Wirkungsbefund („kontrollierte Wirksamkeitsstudien rar“); es gibt keinen Programmbefund, der zu kennzeichnen wäre' },
  'freiday-genius-hour#0': { vorschlag: 'kein programm; bleibt ohne Bezug (Teil 4)', beleg: 'Quelle ist eine Schulinitiative (Schule im Aufbruch) und ein Überblick zu Projektlernen (Thomas 2000); keine Programmevaluation. Der Eintrag ist selbst das wöchentliche Format' },
  'juniorfirma-schuelerfirma#0': { vorschlag: 'kein programm; bleibt ohne Bezug (Teil 4)', beleg: 'Quelle ist ein Netzwerk und eine KMK-Vorgabe, keine Studie; der Befund ist eine Zielangabe' },
  'klassenrat#0': { vorschlag: 'kein programm für diesen Befund; ergänzen: zweiter Befund B/programm „Schulische Programme zum sozial-emotionalen Lernen verbessern soziale und emotionale Fertigkeiten, Verhalten und Schulleistung; für den Klassenrat als einzelnes Format liegt kein eigener Befund vor“ (Durlak et al. 2011)', beleg: 'Der vorhandene Befund ist ein Praxisbefund (Meyer 1987; Mühlhausen 2023), kein Programmbefund. Taxonomie und Leitfaden nennen den Klassenrat als Fall, an dem Programmbefunde sozialen Lernens nur mit Bezug programm stehen dürfen; so stünde der Befund ehrlich daneben. Alternative: nichts ergänzen' },
  'blitzlicht#0': { vorschlag: 'kein programm; bleibt ohne Bezug (Teil 4); nichts ergänzen', beleg: 'Der Befund ist ein Praxisbefund (bpb; Meyer 1987). Blitzlicht ist kein Teil eines Programms sozialen Lernens; ein Programmbefund wäre hier ein Beleg am falschen Gegenstand (Taxonomie: vererbt sich nicht)' }
};

export function programmKandidaten(D: FmtData): Array<{ id: string; b: Baustein; e: Evidenzaussage }> {
  const aus: Array<{ id: string; b: Baustein; e: Evidenzaussage }> = [];
  for (const b of D.bausteine) {
    b.evidenz.forEach((e, i) => {
      const text = [e.quelle, e.befund, e.geltung || ''].join(' ');
      if (PROGRAMM_MUSTER.test(text) || GENANNT.includes(b.kennung)) aus.push({ id: `${b.kennung}#${i}`, b, e });
    });
  }
  return aus;
}

export function teil2(D: FmtData): Teil {
  const kand = programmKandidaten(D);
  const ids = new Set(kand.map((k) => k.id));
  const ohneUrteil = kand.filter((k) => !PROGRAMM_URTEIL[k.id]).map((k) => k.id);
  const ohneKandidat = Object.keys(PROGRAMM_URTEIL).filter((id) => !ids.has(id));
  if (ohneUrteil.length || ohneKandidat.length) throw new Error(`Teil 2: ohne Urteil ${ohneUrteil.join(', ')}; ohne Kandidat ${ohneKandidat.join(', ')}`);
  const eintraege = kand.map(({ id, b, e }) =>
    eintrag(2, id.replace('#', '-'), b.kennung, `evidenz[${id.split('#')[1]}].evidenzBezug`, e.evidenzBezug || '–', PROGRAMM_URTEIL[id].vorschlag, `${PROGRAMM_URTEIL[id].beleg}. Befund: ${befundKurz(e)}`)
  );
  const neu = eintraege.filter((x) => /^evidenzBezug=programm/.test(x.vorschlag)).length;
  return {
    nr: 2,
    titel: 'Evidenzbezug „programm“',
    einleitung: [
      'Leitfrage des Leitfadens: Wem gilt der Befund? „programm“ heißt: der Befund gilt ganzen Programmen über Wochen und vererbt sich nicht auf eine einzelne Stundenphase (Durlak et al. 2011). Heute trägt kein Befund den Wert (Task D4 hat ihn eingeführt).',
      '',
      `Kandidaten aus den Daten: jeder Befund, dessen Quelle, Befund oder Geltung auf ein Programm deutet (Muster \`${PROGRAMM_MUSTER.source}\`), dazu die Befunde von Klassenrat und Blitzlicht, die die Taxonomie nennt. ${kand.length} Kandidaten; Vorschlag „programm“ bei ${neu}. „Forschungsprogramm“ (eine Studienreihe zur Methode) ist kein Programm in diesem Sinn.`,
      '',
      '**Wirkung auf die Rangfolge.** `rankingGrade` zählt Grad A mit Bezug programm wie B; Grad B bleibt B. Der Bezug ändert die Rangfolge also nur bei Grad A; keiner der Vorschläge betrifft Grad A.'
    ],
    info: [],
    eintraege
  };
}

// ---- Part 3: the six findings that lean on Hattie ----

const HATTIE = /hattie/i;
const WECKER = 'Stützt sich auf Effektstärken nach Hattie; diese sind methodisch umstritten und dienen nicht als Rangfolge (Wecker et al. 2016)';
export const HATTIE_URTEIL: Record<string, ProgrammUrteil> = {
  'diktat-klassisch#0': { vorschlag: 'Quelle ersetzen: quelle=Bredel, Fuhrhop & Noack 2011; grad=C', beleg: 'Der Befund (Kontrolldiktat gegen strategieorientiertes Training) braucht Hattie 2009 nicht; Bredel et al. trägt ihn allein. Ob Bredel et al. eine Synthese ist, ist nicht geprüft; ohne Synthese gilt Grad C' },
  'klassenarbeit-summativ#0': { vorschlag: 'Quelle ersetzen: quelle=Black & Wiliam 1998', beleg: 'Die Aussage „lernförderlich erst mit formativer Rückmeldung“ ist der Kern von Black & Wiliam 1998 (Überblick); Hattie 2009 fügt nichts hinzu. Grad B bleibt' },
  'kompetenzraster-checkliste#0': { vorschlag: 'Quelle ersetzen: quelle=Black & Wiliam 2009', beleg: 'Transparente Kriterien und Selbsteinschätzung stehen bei Black & Wiliam 2009 (Theorie formativer Beurteilung); Bezug prinzip und Grad B bleiben' },
  'mastery-learning-bloom#0': { vorschlag: 'Quelle ersetzen: quelle=Kulik, Kulik & Bangert-Drowns (1990); befund ohne „(d ≈ 0,58)“; grad=B', beleg: 'Ohne Hattie bleibt eine Meta-Analyse; Grad A verlangt zwei Synthesen (artefacts.test.ts), deshalb B. Die Angabe d ≈ 0,58 ist nicht Kulik et al. zuzuordnen, ohne das Original zu öffnen; sie entfällt. Alternative: kennzeichnen und Grad A behalten' },
  'microteaching#0': { vorschlag: `kennzeichnen: grad=C; umstritten=„${WECKER}“`, beleg: '„Zählt zu den gut belegten Trainingsformaten“ ruht allein auf Hatties Rangfolge; Allen & Ryan 1969 beschreibt das Verfahren. Eine Ersatzquelle steht weder in den Papieren noch im Katalog' },
  'votum-ei#0': { vorschlag: 'kennzeichnen: geltung ergänzen „Hattie & Timperley 2007 ist ein Überblick zum Feedback, keine Effektstärken-Rangfolge“', beleg: 'Der Befund nutzt das Feedbackmodell, keine Effektstärke; Quelle und Grad können bleiben. Die Prüfung im Datenvorschlag zählt den Eintrag nur wegen des Namens' }
};

export function teil3(D: FmtData): Teil {
  const kand: Array<{ id: string; b: Baustein; e: Evidenzaussage }> = [];
  for (const b of D.bausteine) b.evidenz.forEach((e, i) => HATTIE.test(e.quelle + ' ' + e.befund) && kand.push({ id: `${b.kennung}#${i}`, b, e }));
  const ids = new Set(kand.map((k) => k.id));
  const fehlt = [...kand.filter((k) => !HATTIE_URTEIL[k.id]).map((k) => k.id), ...Object.keys(HATTIE_URTEIL).filter((k) => !ids.has(k))];
  if (fehlt.length) throw new Error(`Teil 3 passt nicht zu den Daten: ${fehlt.join(', ')}`);
  return {
    nr: 3,
    titel: 'Die sechs Befunde mit Hattie',
    einleitung: [
      `Gezählt wie im Datenvorschlag (\`build.py\`: „Hattie“ in Quelle oder Befund): ${kand.length} Befunde. Effektstärken nach Hattie dienen nicht als Rangfolge (Wecker et al. 2016). „Quelle ersetzen“: eine zweite Quelle des Befunds trägt ihn allein, Hattie entfällt. „kennzeichnen“: es gibt keinen Ersatz in den Papieren oder im Katalog; der Befund sagt, worauf er ruht.`
    ],
    info: [],
    eintraege: kand.map(({ id, b, e }) =>
      eintrag(3, id.replace('#', '-'), b.kennung, `evidenz[${id.split('#')[1]}]`, `${e.grad}/${e.evidenzBezug || '–'}: ${e.quelle}`, HATTIE_URTEIL[id].vorschlag, `${HATTIE_URTEIL[id].beleg}. Befund heute: ${e.befund}`)
    )
  };
}

// ---- Part 4: findings without an evidence reference ----

/** Placeholder findings: a practice statement that no method-specific synthesis exists. */
const PLATZHALTER = /^(Praxisbewährtes Verfahren; spezifische Meta-Analysen|Didaktisch breit etablierte Praxisform; spezifische Meta-Analysen|Etablierte Praxisform zur Schließung unterrepräsentierter FMT-Dimensionen)/;

export function teil4(D: FmtData): Teil {
  const ohne = D.bausteine.flatMap((b) => b.evidenz.map((e, i) => ({ id: `${b.kennung}#${i}`, b, e })).filter((x) => !x.e.evidenzBezug));
  const inTeil2 = new Set(Object.keys(PROGRAMM_URTEIL));
  const platz = ohne.filter((x) => PLATZHALTER.test(x.e.befund));
  const einzeln = ohne.filter((x) => !PLATZHALTER.test(x.e.befund));
  const grade = (xs: typeof ohne) => ['A', 'B', 'C'].map((g) => `${g}: ${xs.filter((x) => x.e.grad === g).length}`).join(', ');
  const alle = D.bausteine.reduce((n, b) => n + b.evidenz.length, 0);
  const mit = (w: string) => D.bausteine.reduce((n, b) => n + b.evidenz.filter((e) => e.evidenzBezug === w).length, 0);
  const quellen = new Map<string, number>();
  for (const x of einzeln) quellen.set(x.e.quelle, (quellen.get(x.e.quelle) || 0) + 1);
  return {
    nr: 4,
    titel: 'Befunde ohne Evidenzbezug',
    einleitung: [
      `Gezählt an \`data/\`: ${alle} Befunde, davon ${mit('methode')} mit Bezug methode, ${mit('prinzip')} mit Bezug prinzip, ${mit('programm')} mit Bezug programm und **${ohne.length} ohne Bezug** (der Kodierleitfaden nennt 185). Alle ${ohne.length} haben Grad C (${grade(ohne)}).`,
      '',
      `- **Gruppe A, ${platz.length} Platzhalter.** Der Befund sagt nur, dass es eine Praxisform ohne methodenspezifische Meta-Analyse ist (drei gleichlautende Formeln, meist „Meyer 1987; Mühlhausen 2023“). Vorschlag für später: in einem Zug \`evidenzBezug=methode\` setzen und den Wortlaut auf „Keine methodenspezifische Evidenz“ vereinheitlichen; keine Einzelprüfung nötig.`,
      `- **Gruppe B, ${einzeln.length} Einzelbefunde.** Eigene Quellen und eigener Wortlaut (${quellen.size} verschiedene Quellenangaben). Vorschlag für später: Einzeldurchsicht mit der Leitfrage des Leitfadens, nach Quelle sortiert; ${einzeln.filter((x) => inTeil2.has(x.id)).length} davon sind in Teil 2 schon beurteilt (${einzeln.filter((x) => inTeil2.has(x.id)).map((x) => `\`${x.b.kennung}\``).join(', ')}).`,
      '',
      'Kein Bezug wird in diesem Tor gesetzt. Die Liste der Gruppe B steht unten, damit die spätere Durchsicht sie übernehmen kann.'
    ],
    info: [
      '| Methode | Quelle | Befund (Anfang) |',
      '|---|---|---|',
      ...einzeln.map((x) => `| \`${x.b.kennung}\` | ${md(x.e.quelle)} | ${md(x.e.befund.slice(0, 90))}${x.e.befund.length > 90 ? ' …' : ''} |`)
    ],
    eintraege: [
      eintrag(4, 'gruppe-a', '–', 'evidenzBezug (Gruppe A)', `${platz.length} Befunde ohne Bezug`, 'später in einem Zug: evidenzBezug=methode; Wortlaut „Keine methodenspezifische Evidenz“', `Platzhalter-Formeln: ${platz.length} Befunde in ${new Set(platz.map((x) => x.b.kennung)).size} Methoden; alle Grad C`),
      eintrag(4, 'gruppe-b', '–', 'evidenzBezug (Gruppe B)', `${einzeln.length} Befunde ohne Bezug`, 'später Einzeldurchsicht nach Quelle; in diesem Tor nichts setzen', `${quellen.size} verschiedene Quellenangaben; Liste im Dokument, Teil 4`)
    ]
  };
}

// ---- document ----

export function bauMarkdown(D: FmtData, teile: Teil[], bl: Eintrag[][]): string {
  const name = (k: string) => D.bausteine.find((b) => b.kennung === k)?.name || k;
  const alle = teile.flatMap((t) => t.eintraege);
  const aus: string[] = [
    '# Durchsicht 3: Katalog (Datenvorschlag 3, Tor D3)',
    '',
    `Erzeugt mit \`packages/fmt-core/scripts/vorschlag-fmt2-katalog.ts\` aus \`data/\` (${D.bausteine.length} Methoden) und den Entwürfen in \`daten-entwurf/\`. Das Skript ändert keine Datendatei. Dieselben ${alle.length} Einträge stehen maschinenlesbar in \`pruefung/d3/eintraege.csv\` und aufgeteilt in ${bl.length} Blöcke \`pruefung/d3/block-N.csv\`; die Spalten \`entscheidung\` und \`pruefnotiz\` sind leer.`,
    '',
    '**Vorsichtige Lesart** (Design 12): kein Bedarf ohne Beleg in Durchführung oder Material, kein Befund ohne Quelle aus den Papieren oder dem Katalog. Erfundene Quellen, Jahre oder Effektstärken gibt es nicht; wo eine Quelle fehlt, steht das im Befund und unter „Offen“.',
    '',
    '## Übersicht',
    '',
    '| Teil | Inhalt | Einträge |',
    '|---|---|---|',
    ...teile.map((t) => `| ${t.nr} | ${md(t.titel)} | ${t.eintraege.length} |`),
    `| | gesamt | ${alle.length} |`,
    '',
    '| Block | Einträge | Teile |',
    '|---|---|---|',
    ...bl.map((b, i) => `| block-${i + 1}.csv | ${b.length} | ${[...new Set(b.map((e) => e.teil))].join(', ')} |`)
  ];
  for (const t of teile) {
    aus.push('', `## Teil ${t.nr}: ${t.titel}`, '', ...t.einleitung, '');
    if (t.info.length) aus.push(...t.info, '');
    if (t.eintraege.length) {
      aus.push('### Einträge zur Prüfung', '', '| Eintrag | Methode | Feld | heute | Vorschlag | Beleg |', '|---|---|---|---|---|---|');
      for (const e of t.eintraege) aus.push(`| ${e.eintrag} | ${md(e.kennung === '–' ? '–' : name(e.kennung))} | ${md(e.feld)} | ${md(e.wert_alt)} | ${md(e.vorschlag)} | ${md(e.beleg)} |`);
    }
  }
  aus.push('');
  return aus.join('\n');
}

/** Result of the dry run (Tor D3, step 1), stated in the document; the run itself is not repeated by this script. */
const PROBELAUF = [
  'Die elf Entwürfe wurden in eine Kopie des Repositorys unter `data/bausteine/` gelegt; dort liefen `npm run build:data` und die Tests des Kerns (`vitest run` in `packages/fmt-core`), dazu je Entwurf die Schemaprüfung des exportierten Bausteins (`fmt.schema.json`) und `validate` mit dem Entwurf als Phase eines Plans. Danach wurde die Kopie entfernt.',
  '',
  '- Schema: alle elf gültig. `validate`: die acht Methoden gültig (Schreibrahmen hinter einem Lehrervortrag, Gestaltungsaufgabe hinter einem Ankerfall, wegen ihrer Vorbedingung); die drei Hilfen melden wie vorgesehen R-00 („ist eine Hilfe und keine Phase“).',
  '- Kern-Tests: 577 von 580 bestanden (ohne Entwürfe 580 von 580). Zwei Tests schreiben den Bestand fest und schlagen mit jedem neuen Eintrag fehl: `fmt2-daten.test.ts` „jede Methode trägt mindestens eine Wissensart in D1“ (Vergleich mit der Aufnahme vor Durchsicht 1, die die neuen Kennungen nicht kennt) und „jede eintragsart hilfe hat keine Nachbedingung“ (erwartet nur `scaffolding-hilfen` als Hilfe). Beide sind bei der Übernahme anzupassen.',
  '- Ein Test ändert sein Ergebnis: `core.test.ts` „Schrift bei niedrigem Sprachniveau warnt ohne Tausch“ (VHS Integrationskurs Deutsch A2) erwartet `sq3r-lesemethode` im Plan. Mit den Entwürfen wählt der Plan andere Methoden; allein `sprachvergleich` verschiebt die Schritte k2 bis k4, die Ursache ist nicht gefunden (nicht Eintragsart, Fachbereich, Name oder Text). Die Qualitätsfälle (`ausgang.test.ts`) bestehen alle.',
  '- Zwei Korrekturen aus dem Probelauf stehen schon in den Entwürfen: `betreuungshinweis` fehlt im JSON-Schema (Text steht im Hinweis der Übungsreihe), und die Gruppenreflexion trägt Grad C statt B (sonst verdrängte sie das Cool-down im Sportfall von `golden.test.ts`).'
];

function main() {
  const dataDir = path.resolve(process.argv[2] || path.join(ROOT, 'data'));
  const out = path.resolve(process.argv[3] || '/mnt/project-files/fmt2');
  const entwurfDir = path.resolve(process.argv[4] || path.join(out, 'daten-entwurf'));
  const regelsatzPfad = process.argv[5] || path.join(out, 'quellen', 'fmt2-vorschlag', 'fmt2-regelsatz.json');

  const D = loadFmtData(dataDir);
  const regelsatz = JSON.parse(fs.readFileSync(regelsatzPfad, 'utf8')) as { fehlendeMethoden: FehlendeMethode[] };
  const entwuerfe = fs
    .readdirSync(entwurfDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(entwurfDir, f), 'utf8')) as Baustein);

  const teile = [teil1(D, regelsatz.fehlendeMethoden, entwuerfe, PROBELAUF), teil2(D), teil3(D), teil4(D)];
  const alle = teile.flatMap((t) => t.eintraege);
  const ids = new Set<string>();
  for (const e of alle) {
    if (ids.has(e.eintrag)) throw new Error(`Eintrag doppelt: ${e.eintrag}`);
    ids.add(e.eintrag);
  }
  // Two blocks by subject: the new entries, and the evidence references (Parts 2 to 4).
  const bl = [alle.filter((e) => e.teil === '1'), alle.filter((e) => e.teil !== '1')];
  const d3 = path.join(out, 'pruefung', 'd3');
  fs.mkdirSync(d3, { recursive: true });
  fs.writeFileSync(path.join(out, 'durchsicht-3-katalog.md'), bauMarkdown(D, teile, bl));
  fs.writeFileSync(path.join(d3, 'eintraege.csv'), zuCsv(alle));
  bl.forEach((b, i) => fs.writeFileSync(path.join(d3, `block-${i + 1}.csv`), zuCsv(b)));
  console.log(`${alle.length} Einträge (${teile.map((t) => `Teil ${t.nr}: ${t.eintraege.length}`).join(', ')}), ${bl.length} Blöcke (${bl.map((b) => b.length).join(', ')}) nach ${out}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
