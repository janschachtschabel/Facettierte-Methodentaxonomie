/**
 * Builds data proposal 1 for FMT 2.0 (Durchsicht 1): raumbedarf, fachausstattungArt, schriftbedarf, termineMin,
 * Wissensart (facet D1 "aufgabe") and the Sport entries in "ungeeignet im Fach" for all methods. It compares the
 * repository script (vorschlag-einsatzprofil.ts, computed fresh and without the room cap for fachausstattung) with the
 * paper proposal (fmt2-datenvorschlag.csv) and writes a review table plus a short summary. Data files stay untouched.
 * It reads the room fields lernort and raum, which left the data with Durchsicht 1; it reproduces the proposal only
 * from data of that time (test fixture test/fixtures/vor-durchsicht-1.json).
 *
 * Usage: npx tsx packages/fmt-core/scripts/vorschlag-fmt2-bedarf.ts [dataDir] [oldVorschlagJson] [datenvorschlagCsv] [outDir]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import type { Baustein } from '../src/types.js';
import { vorschlagAlle, type AltBaustein, type BedarfVorschlag } from './vorschlag-einsatzprofil.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..');

export const RAUM_ORDER = ['schreibplatz', 'stellflaeche', 'bewegungsflaeche', 'wandflaeche', 'fachausstattung', 'aussenort'];
export const WISSENSARTEN = ['fakten', 'konzepte', 'prozeduren', 'psychomotorik', 'einstellungen', 'metakognitiv'];
/** What a gym (room type bewegungsraum) offers; read from the vocabulary when the script runs. */
export const SPORTHALLE_BIETET = ['stellflaeche', 'bewegungsflaeche', 'fachausstattung'];

/** One row of fmt2-datenvorschlag.csv (the paper proposal). */
export interface PapierZeile {
  kennung: string;
  raumbedarf_vorschlag: string;
  fachausstattung_art: string;
  schriftbedarf_vorschlag: string;
  termineMin_vorschlag: string;
  hinweis: string;
}

export interface BedarfZeile {
  kennung: string;
  name: string;
  status: string;
  gruppe: string;
  lernort_alt: string;
  raum_alt: string;
  raumbedarf_repo: string;
  raumbedarf_papier: string;
  raumbedarf_vorschlag: string;
  abweichung: 'ja' | 'nein';
  fachausstattungArt: string;
  schriftbedarf_repo: string;
  schriftbedarf_papier: string;
  schriftbedarf_vorschlag: string;
  termineMin_vorschlag: string;
  wissensart_alt: string;
  wissensart_vorschlag: string;
  fach_ungeeignet_alt: string;
  fach_ungeeignet_vorschlag: string;
  hinweis: string;
  entscheidung: string;
  pruefnotiz: string;
}

export const SPALTEN: (keyof BedarfZeile)[] = [
  'kennung', 'name', 'status', 'gruppe', 'lernort_alt', 'raum_alt', 'raumbedarf_repo', 'raumbedarf_papier', 'raumbedarf_vorschlag',
  'abweichung', 'fachausstattungArt', 'schriftbedarf_repo', 'schriftbedarf_papier', 'schriftbedarf_vorschlag', 'termineMin_vorschlag',
  'wissensart_alt', 'wissensart_vorschlag', 'fach_ungeeignet_alt', 'fach_ungeeignet_vorschlag', 'hinweis', 'entscheidung', 'pruefnotiz'
];

/** Known errors of both sources, handled explicitly: the listed values are added to raumbedarf. */
export const BEKANNTE_FEHLER: Record<string, { wert: string; grund: string }> = {
  exkursion: { wert: 'aussenort', grund: 'Datenfehler: lernort nennt klassenraum, die Methode findet außerhalb der Schule statt' },
  gruppenpuzzle: { wert: 'stellflaeche', grund: 'Platz für Gruppentische (Stamm- und Expertengruppen) braucht Stellfläche' },
  experiment: { wert: 'fachausstattung', grund: 'Versuchsmaterial je Gruppe; Fachraum oder geeignete Arbeitsplätze' }
};

/**
 * Judgement on schriftbedarf where the word search of the sources over- or under-shoots, read from durchfuehrung and
 * material. pruefen = the evidence is too thin for a firm value: the value stays, the note says "Schrift prüfen".
 */
interface SchriftUrteil {
  wert: string[];
  grund: string;
  pruefen?: boolean;
}
const S = ['schreibt'];
const L = ['liest'];
const LS = ['liest', 'schreibt'];
const leer = (grund: string, pruefen = false): SchriftUrteil => ({ wert: [], grund, pruefen });
export const SCHRIFT_URTEIL: Record<string, SchriftUrteil> = {
  barcamp: leer('Pad oder Protokoll ist gemeinsam, wer schreibt, bleibt offen', true),
  'blended-learning': leer('keine Schreibaufgabe der Lernenden genannt'),
  'computerunterstuetztes-lernen': leer('Übung am System, kein Schreiben genannt'),
  'cooperatives-offenes-lernen': leer('Assignment offen, Schreiben der Lernenden nicht belegt', true),
  'dauer-intervallmethode': leer('Notieren des Belastungsempfindens ist freigestellt'),
  'diktat-klassisch': { wert: S, grund: 'Lernende schreiben, die Lehrkraft liest vor' },
  'einzelarbeit-uebung': { wert: L, grund: 'Lesen belegt (Textlektüre), Schreiben nicht', pruefen: true },
  'entdeckendes-lernen': leer('Erkenntnis „festhalten“, offen von wem', true),
  erotematik: leer('Lehrergespräch, nur die Lehrkraft hält fest'),
  'eselsbruecken-mnemonik': leer('Eselsbrücke wird erfunden und geprüft, Schreiben nicht belegt'),
  'fall-simulation-osce': leer('Beobachtende protokollieren, ob es Lernende sind, bleibt offen', true),
  fantasiereise: leer('Notieren oder Austauschen ist freigestellt'),
  'feynman-methode': leer('Erklären „schriftlich oder mündlich“, also nicht ohne Ausnahme'),
  'flashcard-spaced-repetition': { wert: L, grund: 'Lernende lesen die Karten; Erstellen der Karten ist freigestellt (ggf.)' },
  gamification: leer('Quests und Rückmeldung, kein Schreiben der Lernenden genannt'),
  'gruppen-karussell': { wert: S, grund: 'Kleingruppen erstellen ein Plakat' },
  'gruppenarbeit-klassisch': leer('Protokoll ist nur eine von mehreren Rollen', true),
  'interaktives-whiteboard': leer('Bearbeitung am Board, Tastatur oder Stift nicht belegt', true),
  'karikatur-bildanalyse': { wert: L, grund: 'Bild und Textanteile lesen; „formulieren“ kann mündlich sein', pruefen: true },
  klassenrat: leer('Protokoll führt eine rotierende Rolle, nicht alle'),
  'kreatives-schreiben': { wert: S, grund: 'stille Schreibphase; Lesen ist nur Impuls der Lehrkraft' },
  'kriteriales-rubric': { wert: L, grund: 'Lernende lesen das Raster und verorten sich darin' },
  lehrgespraech: leer('nur die Lehrkraft hält am Tafelbild fest'),
  lernplakat: { wert: S, grund: 'Team gestaltet ein Plakat mit Markern' },
  'lernpodcast-hoeren': leer('Sichern „schriftlich oder im Tandem“, also nicht ohne Ausnahme'),
  'lernprodukt-galerie': { wert: S, grund: 'Lernende hinterlassen Feedback-Karten' },
  'loci-methode': leer('Gedächtnisroute im Kopf, nichts Schriftliches'),
  'markt-der-moeglichkeiten': leer('Plakate und Feedback-Karten, Schreiben nicht ohne Ausnahme belegt', true),
  'methode-66': leer('Karteikarte pro Gruppe, wer schreibt, bleibt offen', true),
  'microlearning-spaced': { wert: L, grund: 'Text, Video oder Grafik; Abruffragen im System' },
  provokationstechnik: leer('Gedankenspiel, Schreiben nicht belegt', true),
  scamper: leer('Impulse anwenden, Schreiben nicht belegt', true),
  schuelercoaching: leer('Vereinbarung wird kurz festgehalten, offen von wem', true),
  'sokratisches-gespraech': leer('Zwischenkonsens hält die Lehrkraft fest'),
  'sportmotorischer-test': leer('Ergebnisse festhalten, wer es tut, bleibt offen', true),
  standbild: leer('Textvorlage ist nur eine Möglichkeit, Szene oder Situation genügt', true),
  stegreiftheater: leer('Spiel und Auswertung im Gespräch'),
  storytelling: leer('Lehrkraft erzählt, Sichern im Gespräch'),
  'supervision-gruppe': leer('Gruppengespräch, Vorsätze werden nicht als schriftlich vorgegeben genannt', true),
  'survey-feedback': leer('Fragen werden „erhoben“, ob schriftlich, bleibt offen', true),
  'szenario-technik': { wert: S, grund: 'Szenarien werden ausformuliert, Faktenkarten und Plakate' },
  'thinking-at-the-edge': leer('Formulierung wird „entwickelt“, ob schriftlich, bleibt offen', true),
  'uebung-variation': leer('Aufgaben variieren und berechnen, Schreiben nicht ohne Ausnahme belegt', true),
  'unangeleitete-gruppenarbeit': leer('Plakat oder Arbeitsblatt, nichts Festes über Lesen und Schreiben', true),
  'vergleichende-instruktion': leer('Merkmale festhalten, offen von wem', true),
  'vortrag-prompts': leer('Antworten „schriftlich oder im Tandem“, also nicht ohne Ausnahme'),
  'walt-disney-methode': leer('Rollenkarten und Plakate, Schreiben nicht belegt', true),
  wandzeitung: { wert: LS, grund: 'Teams erstellen Texte und nutzen Quellenausschnitte' },
  zukunftswerkstatt: { wert: S, grund: 'Karten, Plakate und Projektpläne' },
  'zwei-sterne-ein-wunsch': leer('Partner „benennt“ und „formuliert“, mündlich möglich', true)
};

/** Judgement on Wissensart for the methods the brief names (no value, "D1 prüfen", practice methods with only Konzepte). */
export const WISSENSART_URTEIL: Record<string, { wert: string[]; grund: string }> = {
  // eleven methods without a Wissensart
  ankerfall: { wert: ['konzepte'], grund: 'Problemaufriss zum Gegenstand, Arbeitsfragen für Begriffe und Zusammenhänge' },
  'brainwriting-635': { wert: ['konzepte'], grund: 'Ideen zum Gegenstand sammeln, kein eigenes Verfahren geübt' },
  'design-thinking': { wert: ['konzepte', 'prozeduren'], grund: 'Prozess aus Beobachten, Prototyp und Testen wird durchlaufen und geübt' },
  eduscrum: { wert: ['prozeduren', 'metakognitiv'], grund: 'Sprints, Stand-up und Retrospektive: Verfahren der Selbstorganisation und Rückblick auf die Zusammenarbeit' },
  flipped: { wert: ['fakten', 'konzepte'], grund: 'Ersterwerb vorab, Abruf und Anwendung in der Präsenz' },
  'juniorfirma-schuelerfirma': { wert: ['konzepte', 'prozeduren'], grund: 'Kalkulieren, Buchen und Produzieren als Handlungsverfahren im Fachgebiet' },
  'ki-chat': { wert: [], grund: 'Kontrast-Baustein ohne verlässlichen Lernzustand; bewusst leer, Eintragsart prüfen' },
  projektmethode: { wert: ['prozeduren', 'metakognitiv'], grund: 'Planen, Fixpunkte und Metainteraktion tragen das Lernen, nicht ein Stoff' },
  'quellenkritik-faktencheck': { wert: ['prozeduren'], grund: 'Lateral Reading ist ein Prüfverfahren, das eingeübt wird' },
  'swot-analyse': { wert: ['konzepte'], grund: 'Fall in vier Feldern ordnen und beurteilen, Begriffe und Zusammenhänge' },
  'walt-disney-methode': { wert: ['metakognitiv'], grund: 'Perspektivwechsel auf die eigene Idee in drei Rollen' },
  // six with "D1 prüfen: liefert Gelaeufigkeit, traegt nur Konzepte"
  'computerunterstuetztes-lernen': { wert: ['konzepte', 'prozeduren'], grund: 'adaptives Üben liefert Geläufigkeit (D1 prüfen)' },
  'einzelarbeit-uebung': { wert: ['konzepte', 'prozeduren'], grund: 'Einzelübung mit Lösungskontrolle liefert Geläufigkeit (D1 prüfen)' },
  lehrgang: { wert: ['fakten', 'konzepte', 'prozeduren'], grund: 'systematischer Aufbau mit geleiteter Übung (D1 prüfen)' },
  microteaching: { wert: ['prozeduren'], grund: 'Lehrhandlung wird wiederholt und verbessert (D1 prüfen)' },
  'pomodoro-lernzyklus': { wert: ['metakognitiv'], grund: 'Selbstregulation durch Teilziel und Pause, kein Stoff (D1 prüfen)' },
  'tandem-lernen': { wert: ['prozeduren'], grund: 'authentisches Sprechen mit wechselseitiger Korrektur liefert Sprechgeläufigkeit (D1 prüfen)' },
  // practice methods that carry only Konzepte and where a second type is evident from durchfuehrung
  'godly-play': { wert: ['konzepte', 'einstellungen'], grund: 'ruhige Erzählung und Ergründungsgespräch zielen auf Haltung und Deutung' },
  'handlungsorientiertes-projekt': { wert: ['konzepte', 'prozeduren'], grund: 'Handlungsprodukt wird hergestellt und getestet' },
  'herausforderung-projekt': { wert: ['einstellungen', 'metakognitiv'], grund: 'Selbstwirksamkeit und Rückschau stehen im Zentrum' },
  'jeux-dramatiques': { wert: ['einstellungen'], grund: 'wertfreies Ausdrucksspiel, Fokus auf eigenem Erleben' },
  'marshmallow-challenge': { wert: ['prozeduren', 'metakognitiv'], grund: 'Vorgehen (frühes oder spätes Testen) wird ausgewertet' },
  'morphologischer-kasten': { wert: ['konzepte', 'prozeduren'], grund: 'Kombinationspfade nach festem Verfahren durchlaufen' },
  'netzplantechnik-projekt': { wert: ['konzepte', 'prozeduren'], grund: 'kritischer Pfad wird nach Regeln bestimmt' },
  papiercomputer: { wert: ['konzepte', 'prozeduren'], grund: 'Matrix wird nach festem Rechenverfahren ausgewertet' },
  parlamentssimulation: { wert: ['konzepte', 'einstellungen'], grund: 'Rollenübernahme und Ausstieg aus der Rolle' },
  'produktives-lernen': { wert: ['konzepte', 'prozeduren'], grund: 'Mitarbeit am Praxisplatz mit fachlicher Auswertung' },
  schnitzeljagd: { wert: ['fakten', 'konzepte'], grund: 'Rätsel prüfen Abruf und Anwendung fachlicher Aussagen' },
  'simulation-globale': { wert: ['konzepte', 'prozeduren'], grund: 'kommunikative und fachliche Aufgaben im Rollenspiel' },
  stegreiftheater: { wert: ['prozeduren', 'einstellungen'], grund: 'Sprachfluss und Empathie, Ziel der Methode laut Kurzbeschreibung' },
  'stop-motion-erklaerfilm': { wert: ['konzepte', 'prozeduren'], grund: 'Produktionsverfahren (Storyboard, Aufnahme) neben dem Fachkonzept' },
  'supervision-gruppe': { wert: ['einstellungen', 'metakognitiv'], grund: 'Rollen und professionelles Handeln reflektieren' },
  'switch-rollentausch': { wert: ['konzepte', 'einstellungen'], grund: 'Perspektivwechsel ist das Ziel' },
  waldpaedagogik: { wert: ['konzepte', 'prozeduren'], grund: 'Bestimmen und Beobachten vor Ort als Verfahren' }
};

/**
 * Art of the Fachausstattung where a core component or the named material fixes it. Used only when fachausstattung is
 * among the proposed needs; methods whose Art depends on the subject stay empty.
 */
export const FACHAUSSTATTUNG_ART: Record<string, { wert: string; grund: string }> = {
  'stationstraining-bewegung': { wert: 'sport', grund: 'Sport- und Übungsgeräte sind Kernbestandteil' },
  'schuelerlabor-frei': { wert: 'labor', grund: 'Laborausstattung und Forschungsprotokoll im Material' },
  'makerspace-tueftelwerkstatt': { wert: 'werkstatt', grund: 'Werkstattmaterial und Werkzeugeinweisung vor freier Nutzung' }
};

// Only an explicit gap counts; "several sessions" or "next lesson" alone does not (the teacher may just review answers then).
const DURCHFUEHRUNG_ABSTAND =
  /nach\s+(?:einigen|\d+(?:\s*(?:und|bis|–|-)\s*\d+)?)\s*(?:tagen|wochen)|(?:tage?|wochen?)\s+später|zwischen\s+den\s+(?:terminen|sitzungen|stunden)|abstand\s+zwischen|wiederholungs?-?abstände/i;

export function teile(s: string | undefined): string[] {
  return (s || '').split('|').map((x) => x.trim()).filter(Boolean);
}
const gleich = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
const geordnet = (liste: string[], order: string[]) => [...new Set(liste)].sort((x, y) => order.indexOf(x) - order.indexOf(y));

export function istPraxismethode(b: Baustein): boolean {
  return (
    (b.aufgabe || []).includes('psychomotorik') ||
    (b.repraesentation || []).includes('enaktiv') ||
    (b.fachbereich || []).some((f) => f === 'sport' || f === 'beruf-praxis')
  );
}

/** Rule of the brief: the room properties that follow from lernort when it holds neither klassenraum nor hoersaal. */
export function raumAusLernort(lernort: string[]): { wert: string; grund: string }[] {
  if (!lernort.length || lernort.includes('klassenraum') || lernort.includes('hoersaal')) return [];
  const aus: { wert: string; grund: string }[] = [];
  if (lernort.every((r) => r === 'bewegungsraum' || r === 'draussen')) aus.push({ wert: 'bewegungsflaeche', grund: 'lernort nur Bewegungsraum oder draußen' });
  if (lernort.includes('fachraum')) aus.push({ wert: 'fachausstattung', grund: 'lernort nennt Fachraum ohne Klassenraum' });
  if (lernort.every((r) => r === 'draussen')) aus.push({ wert: 'aussenort', grund: 'lernort nur draußen' });
  return aus;
}

/** termineMin rule: 2 only for sequenz "verteilt" or when durchfuehrung names a gap between sessions. */
export function termineMinVorschlag(b: Baustein): { wert: string; grund: string } {
  if ((b.sequenz || []).includes('verteilt')) return { wert: '2', grund: 'sequenz verteilt: Abstand zwischen Terminen' };
  const treffer = (b.durchfuehrung || []).join(' ').match(DURCHFUEHRUNG_ABSTAND);
  if (treffer) return { wert: '2', grund: `Durchführung nennt Abstand („${treffer[0]}“)` };
  return { wert: '', grund: '' };
}

export interface ZeilenKontext {
  sporthalleBietet?: string[];
}

/** Row logic for one method. repo and papier are the two sources; the rest follows the rules of the brief. */
export function bauZeile(b: AltBaustein, repo: BedarfVorschlag, papier: PapierZeile | undefined, ctx: ZeilenKontext = {}): BedarfZeile {
  const hinweise: string[] = [];
  const bietet = ctx.sporthalleBietet || SPORTHALLE_BIETET;

  // Raumbedarf: agreement gives the value, disagreement gives the repository value
  const raumRepo = geordnet(repo.raumbedarf, RAUM_ORDER);
  const raumPapier = geordnet(teile(papier?.raumbedarf_vorschlag), RAUM_ORDER);
  const raumGleich = gleich(raumRepo, raumPapier);
  let raum = [...raumRepo];
  if (!raumGleich) hinweise.push('Abweichung Raumbedarf: Wert des Repository-Skripts');
  for (const r of raumAusLernort(b.lernort || [])) {
    if (!raum.includes(r.wert)) {
      raum.push(r.wert);
      hinweise.push(`${r.wert} ergänzt: ${r.grund}`);
    }
  }
  const fehler = BEKANNTE_FEHLER[b.kennung];
  if (fehler && !raum.includes(fehler.wert)) {
    raum.push(fehler.wert);
    hinweise.push(`${fehler.wert} ergänzt (bekannter Fehler): ${fehler.grund}`);
  } else if (fehler) hinweise.push(`bekannter Fehler geprüft: ${fehler.wert} steht schon im Repository-Wert`);
  raum = geordnet(raum, RAUM_ORDER);

  // fachausstattungArt: only where the Fachausstattung is a need and a component binds the kind
  let art = '';
  const artUrteil = FACHAUSSTATTUNG_ART[b.kennung];
  if (artUrteil) {
    if (raum.includes('fachausstattung')) {
      art = artUrteil.wert;
      hinweise.push(`Art ${art}: ${artUrteil.grund}`);
    } else hinweise.push(`Art ${artUrteil.wert} wäre möglich (${artUrteil.grund}), aber Fachausstattung ist kein Bedarf`);
  }
  if (papier?.fachausstattung_art && papier.fachausstattung_art !== art) hinweise.push(`Vorlage nennt Art ${papier.fachausstattung_art}, nicht übernommen`);

  // Schriftbedarf
  const schriftRepo = repo.schriftbedarf;
  const schriftPapier = teile(papier?.schriftbedarf_vorschlag);
  const schriftGleich = gleich(schriftRepo, schriftPapier);
  let schrift = [...schriftRepo];
  if (!schriftGleich) hinweise.push('Abweichung Schriftbedarf: Wert des Repository-Skripts');
  const urteil = SCHRIFT_URTEIL[b.kennung];
  if (urteil) {
    schrift = urteil.wert;
    hinweise.push(`${urteil.pruefen ? 'Schrift prüfen: ' : 'Schrift: '}${urteil.grund}`);
  }

  // termineMin
  const termine = termineMinVorschlag(b);
  if (termine.wert) hinweise.push(`termineMin 2: ${termine.grund}`);

  // Wissensart
  const alt = (b.aufgabe || []).filter((x) => WISSENSARTEN.includes(x));
  let neu = alt;
  const w = WISSENSART_URTEIL[b.kennung];
  if (w) {
    neu = geordnet(w.wert, WISSENSARTEN);
    hinweise.push(`Wissensart: ${w.grund}`);
  }

  // Sport in "ungeeignet im Fach"
  const fachAlt = b.fachbereichUngeeignet || [];
  let fachNeu = fachAlt;
  if (fachAlt.includes('sport')) {
    const nichtGeboten = raum.filter((r) => !bietet.includes(r));
    if (nichtGeboten.length) {
      fachNeu = fachAlt.filter((x) => x !== 'sport');
      hinweise.push(`sport entfällt: Raumbedarf ${nichtGeboten.join(', ')} bietet die Sporthalle nicht`);
    } else if (!neu.includes('psychomotorik')) {
      fachNeu = fachAlt.filter((x) => x !== 'sport');
      hinweise.push('sport entfällt: Methode trägt keine Psychomotorik');
    } else hinweise.push('sport bleibt für Durchsicht 2');
  }

  return {
    kennung: b.kennung,
    name: b.name,
    status: b.status,
    gruppe: b.status === 'kuratiert' ? '1 kuratiert' : istPraxismethode(b) ? '2 praxis' : '3 uebrige',
    lernort_alt: (b.lernort || []).join('|'),
    raum_alt: b.raum || '',
    raumbedarf_repo: raumRepo.join('|'),
    raumbedarf_papier: raumPapier.join('|'),
    raumbedarf_vorschlag: raum.join('|'),
    abweichung: !raumGleich || !schriftGleich ? 'ja' : 'nein',
    fachausstattungArt: art,
    schriftbedarf_repo: schriftRepo.join('|'),
    schriftbedarf_papier: schriftPapier.join('|'),
    schriftbedarf_vorschlag: schrift.join('|'),
    termineMin_vorschlag: termine.wert,
    wissensart_alt: alt.join('|'),
    wissensart_vorschlag: neu.join('|'),
    fach_ungeeignet_alt: fachAlt.join('|'),
    fach_ungeeignet_vorschlag: fachNeu.join('|'),
    hinweis: hinweise.join('; '),
    entscheidung: '',
    pruefnotiz: ''
  };
}

// ---- CSV and Markdown ----

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let feld = '', zeile: string[] = [], quote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '"' && text[i + 1] === '"') { feld += '"'; i++; }
      else if (c === '"') quote = false;
      else feld += c;
    } else if (c === '"') quote = true;
    else if (c === ',') { zeile.push(feld); feld = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      zeile.push(feld); feld = '';
      if (zeile.some((x) => x !== '')) rows.push(zeile);
      zeile = [];
    } else feld += c;
  }
  if (feld !== '' || zeile.length) { zeile.push(feld); rows.push(zeile); }
  const [kopf, ...rest] = rows;
  return rest.map((r) => Object.fromEntries(kopf.map((k, i) => [k, r[i] ?? ''])));
}

const csvFeld = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
export const zuCsv = (zeilen: BedarfZeile[]) =>
  [SPALTEN.join(','), ...zeilen.map((z) => SPALTEN.map((k) => csvFeld(z[k])).join(','))].join('\n') + '\n';

const zaehle = (zeilen: BedarfZeile[], f: (z: BedarfZeile) => boolean) => zeilen.filter(f).length;
const md = (s: string) => s.replace(/\|/g, '\\|');

export function bauMarkdown(zeilen: BedarfZeile[], extra: { alteDeckelung?: number; altDatei?: string } = {}): string {
  const mit = (feld: keyof BedarfZeile, wert: string) => zaehle(zeilen, (z) => teile(z[feld] as string).includes(wert));
  const leer = (feld: keyof BedarfZeile) => zaehle(zeilen, (z) => !z[feld]);
  const abw = zeilen.filter((z) => z.abweichung === 'ja');
  const wiss = zeilen.filter((z) => z.wissensart_alt !== z.wissensart_vorschlag);
  const pruefen = zeilen.filter((z) => z.hinweis.includes('Schrift prüfen'));
  const sportVorher = zaehle(zeilen, (z) => teile(z.fach_ungeeignet_alt).includes('sport'));
  const sportNachher = zaehle(zeilen, (z) => teile(z.fach_ungeeignet_vorschlag).includes('sport'));
  const ohneUrteil = (z: BedarfZeile) => z.hinweis.split('; ').filter((h) => /^Abweichung/.test(h)).map((h) => h.replace('Abweichung ', '').replace(': Wert des Repository-Skripts', '')).join(', ');
  return [
    '# Durchsicht 1: Raumbedarf, Schriftbedarf, Wissensart (Datenvorschlag 1)',
    '',
    `Erzeugt mit \`packages/fmt-core/scripts/vorschlag-fmt2-bedarf.ts\` für ${zeilen.length} Methoden. Die Tabelle steht in \`durchsicht-1-bedarf.csv\`. Das Skript ändert keine Datendatei. Die Spalten \`entscheidung\` und \`pruefnotiz\` sind leer; wer vom Vorschlag abweicht, trägt es dort im Format \`feld=wert; feld=wert\` ein und begründet es.`,
    '',
    '## So ist der Vorschlag entstanden',
    '',
    '- Zwei Quellen werden verglichen: das Repository-Skript (`_repo`) und die Vorlage aus dem Papier (`_papier`). Stimmen beide überein, gilt der Wert. Weichen sie ab, gilt der Wert des Repository-Skripts, und `abweichung` steht auf `ja`.',
    '- Das Repository-Skript wird neu gerechnet. Für `fachausstattung` gilt die alte Deckelung („keine Methode braucht, was einer ihrer Räume nicht bietet“) nicht mehr. Die Räume stehen im aktuellen Wortschatz: der Bewegungsraum bietet jetzt Fachausstattung, es gibt zwölf Raumtypen. Die alte Datei `vorschlag-bedarf.json` stammt noch aus dem Stand mit fünf Raumtypen.',
    extra.alteDeckelung != null
      ? `- Wirkung: ${extra.alteDeckelung} Methoden haben jetzt Fachausstattung, die die alte Datei nicht hatte.`
      : '- Ein Vergleich mit der alten Datei war nicht möglich.',
    '- Aus `lernort` folgt Raumbedarf nur, wenn weder Klassenraum noch Hörsaal genannt ist: Bewegungsfläche, wenn nur Bewegungsraum und draußen; Fachausstattung bei Fachraum; Außenort, wenn nur draußen.',
    '- Drei bekannte Fehler sind ausdrücklich behandelt: Exkursion (Außenort), Gruppenpuzzle (Stellfläche) und das Geleitete Experiment in Kleingruppen, also das Schülerexperiment (Fachausstattung).',
    '- `termineMin` ist 2 nur bei Sequenz „verteilt“ oder wenn die Durchführung einen Abstand zwischen Terminen nennt. Die 64 Vorschläge der Vorlage sind nicht übernommen.',
    '- Schriftbedarf „schreibt“ gilt nur, wenn Lernende schreiben. Wo die Wortsuche der Quellen danebenliegt, steht die Begründung im Hinweis. Wo die Lage unklar ist, bleibt das Feld leer, und der Hinweis beginnt mit „Schrift prüfen“.',
    '',
    '## Zählung',
    '',
    '| Feld | Wert | Methoden |',
    '|---|---|---|',
    ...RAUM_ORDER.map((w) => `| Raumbedarf | ${w} | ${mit('raumbedarf_vorschlag', w)} |`),
    `| Raumbedarf | leer | ${leer('raumbedarf_vorschlag')} |`,
    ...['liest', 'schreibt'].map((w) => `| Schriftbedarf | ${w} | ${mit('schriftbedarf_vorschlag', w)} |`),
    `| Schriftbedarf | leer | ${leer('schriftbedarf_vorschlag')} |`,
    `| Schriftbedarf | davon „Schrift prüfen“ | ${pruefen.length} |`,
    `| termineMin | 2 | ${zaehle(zeilen, (z) => z.termineMin_vorschlag === '2')} |`,
    ...['sport', 'musik', 'labor', 'werkstatt', 'kueche', 'rechner'].map((w) => `| fachausstattungArt | ${w} | ${zaehle(zeilen, (z) => z.fachausstattungArt === w)} |`),
    ...WISSENSARTEN.map((w) => `| Wissensart (Vorschlag) | ${w} | ${mit('wissensart_vorschlag', w)} |`),
    `| Wissensart | leer | ${leer('wissensart_vorschlag')} |`,
    `| Wissensart | geändert gegenüber heute | ${wiss.length} |`,
    `| Sport bei „ungeeignet im Fach“ | heute | ${sportVorher} |`,
    `| Sport bei „ungeeignet im Fach“ | bleibt für Durchsicht 2 | ${sportNachher} |`,
    `| Gruppen | 1 kuratiert / 2 praxis / 3 uebrige | ${zaehle(zeilen, (z) => z.gruppe.startsWith('1'))} / ${zaehle(zeilen, (z) => z.gruppe.startsWith('2'))} / ${zaehle(zeilen, (z) => z.gruppe.startsWith('3'))} |`,
    `| Zeilen mit Abweichung | ja | ${abw.length} |`,
    '',
    `## Zeilen mit Abweichung (${abw.length})`,
    '',
    'Im Feld „Abweichung“ steht, wo sich Repository-Skript und Vorlage unterscheiden. Raumbedarf und Schriftbedarf gelten als ein Befund.',
    '',
    '| Methode | Abweichung | Raum (Repo / Papier / Vorschlag) | Schrift (Repo / Papier / Vorschlag) |',
    '|---|---|---|---|',
    ...abw.map(
      (z) =>
        `| ${md(z.name)} (\`${z.kennung}\`) | ${ohneUrteil(z)} | ${md(z.raumbedarf_repo || '–')} / ${md(z.raumbedarf_papier || '–')} / ${md(z.raumbedarf_vorschlag || '–')} | ${md(z.schriftbedarf_repo || '–')} / ${md(z.schriftbedarf_papier || '–')} / ${md(z.schriftbedarf_vorschlag || '–')} |`
    ),
    '',
    `## Methoden mit geänderter Wissensart (${wiss.length})`,
    '',
    '| Methode | heute | Vorschlag | Grund |',
    '|---|---|---|---|',
    ...wiss.map((z) => `| ${md(z.name)} (\`${z.kennung}\`) | ${md(z.wissensart_alt || '–')} | ${md(z.wissensart_vorschlag || '–')} | ${md(WISSENSART_URTEIL[z.kennung]?.grund || '')} |`),
    '',
    `## Schrift prüfen (${pruefen.length})`,
    '',
    pruefen.map((z) => `- ${z.name} (\`${z.kennung}\`)`).join('\n'),
    ''
  ].join('\n');
}

// ---- main ----

function main() {
  const dataDir = path.resolve(process.argv[2] || path.join(ROOT, 'data'));
  const altJson = process.argv[3] || '/mnt/project-files/einsatzprofil/vorschlag-bedarf.json';
  const csvPfad = process.argv[4] || '/mnt/project-files/fmt2/quellen/fmt2-vorschlag/fmt2-datenvorschlag.csv';
  const out = path.resolve(process.argv[5] || '/mnt/project-files/fmt2');

  const D = loadFmtData(dataDir);
  const repo = vorschlagAlle(D, { deckelAusnehmen: ['fachausstattung'] });
  const papier = Object.fromEntries(parseCsv(fs.readFileSync(csvPfad, 'utf8')).map((r) => [r.kennung, r as unknown as PapierZeile]));
  const halle = D.schemes.find((s) => s.id === 'raumtyp')?.werte?.find((w) => w.id === 'bewegungsraum')?.bietet || SPORTHALLE_BIETET;

  const zeilen = D.bausteine
    .map((b) => bauZeile(b, repo[b.kennung], papier[b.kennung], { sporthalleBietet: halle }))
    .sort((a, b) => a.gruppe.localeCompare(b.gruppe) || a.kennung.localeCompare(b.kennung));

  let alteDeckelung: number | undefined;
  if (fs.existsSync(altJson)) {
    const alt = JSON.parse(fs.readFileSync(altJson, 'utf8')) as Record<string, BedarfVorschlag>;
    alteDeckelung = Object.keys(repo).filter((k) => repo[k].raumbedarf.includes('fachausstattung') && !(alt[k]?.raumbedarf || []).includes('fachausstattung')).length;
  }

  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'durchsicht-1-bedarf.csv'), zuCsv(zeilen));
  fs.writeFileSync(path.join(out, 'durchsicht-1-bedarf.md'), bauMarkdown(zeilen, { alteDeckelung }));
  console.log(`${zeilen.length} Zeilen nach ${out}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
