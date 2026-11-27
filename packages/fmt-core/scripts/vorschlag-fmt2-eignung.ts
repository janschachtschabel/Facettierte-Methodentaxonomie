/**
 * Builds data proposal 2 for FMT 2.0 (Durchsicht 2, "Eignung", Tor D2): rule-hit report, the 28 entries
 * geeignetBeiVorwissen, the 47 entries ungeeignetBeiStufe, the remaining fachbereichUngeeignet entries, the five
 * candidates for the entry kind "Hilfe", B3 "nur uniform", the table "Tausch oder Hilfe" (data/teilgruppen.json) and the
 * inputs collected in earlier tasks. It writes a readable proposal, one machine-readable entry table for the reviewers
 * and that table split into blocks. Data files stay untouched.
 *
 * Every entry is computed from the data where a rule decides (rule coverage, scope of the evidence); where judgement is
 * needed, the judgement tables below carry the proposal and the evidence from the method's own data or a source.
 * Cautious reading (design §12): no Bedarf and no Eignungswarnung without evidence in Durchführung, Material or a source.
 *
 * Usage: npx tsx packages/fmt-core/scripts/vorschlag-fmt2-eignung.ts [dataDir] [outDir] [regelsatzJson] [eingangFachCsv]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { erstelleRegeln, nurSekundarEvidenz } from '../src/regeln.js';
import { nachweisformen } from '../src/zielart.js';
import { DIFF_MATRIX_DATA } from '../src/differentiationMatrixData.js';
import type { Baustein, FmtData, Passungsregel, RegelSituation } from '../src/types.js';
import { parseCsv } from './vorschlag-fmt2-bedarf.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..');

export const VORWISSEN = ['gering', 'mittel', 'hoch'];
export const BLOCKGROESSE = 60;
const PRIMAR_REGEL = 'problemloesen-vor-instruktion-primar';
const STUETZE_REGEL = 'entdecken-nur-mit-stuetze';

export interface Eintrag {
  eintrag: string;
  teil: string;
  kennung: string;
  feld: string;
  wert_alt: string;
  vorschlag: string;
  beleg: string;
  entscheidung: string;
  pruefnotiz: string;
}
export const SPALTEN: (keyof Eintrag)[] = ['eintrag', 'teil', 'kennung', 'feld', 'wert_alt', 'vorschlag', 'beleg', 'entscheidung', 'pruefnotiz'];

const liste = (xs: readonly string[] | undefined) => (xs && xs.length ? xs.join('|') : '–');
const zitat = (s: string) => `„${s}“`;
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
/** Proposal text for an entry that stays with a reason (eignungsgrund). */
const bleibt = (feld: string, werte: string[], art: string, g: { grundlage: string; text: string; quelle?: string }) =>
  `${feld}=${werte.join('|')}; eignungsgrund.${art}: ${g.grundlage} – ${g.text.replace(/\.$/, '')}${g.quelle ? ` (Quelle: ${g.quelle})` : ''}`;

// ---------------------------------------------------------------------------------------------------------------
// Rule engine helpers: every hit is computed with the rule machine of the core (regeln.ts), not re-implemented.

/** A situation that satisfies the situation part of a declarative rule (first allowed value per field). */
function situationFuer(r: Passungsregel): RegelSituation {
  const s: Record<string, string> = {};
  for (const [feld, werte] of Object.entries(r.wenn?.situation ?? {})) s[feld] = werte[0];
  return s as RegelSituation;
}

/** Methods whose own data fire the rule (the situation part is taken as given). */
export function treffer(r: Passungsregel, bausteine: Baustein[]): Baustein[] {
  const R = erstelleRegeln([r]);
  const s = situationFuer(r);
  return bausteine.filter((b) => R.pruefe(b, s).some((m) => m.regel === r.id));
}

/** The same rule read with "enthaelt" instead of "nur" for B1 Anleitung (the wider reading). */
export function weiteLesart(r: Passungsregel): Passungsregel | null {
  const anl = r.wenn?.methode?.anleitung;
  if (!anl?.nur) return null;
  return { ...r, wenn: { ...r.wenn, methode: { ...r.wenn!.methode, anleitung: { enthaelt: anl.nur } } } };
}

/** Prior-knowledge levels at which a declarative rule about Vorwissen warns for this method, with the rule ids. */
export function regelVorwissen(b: Baustein, regeln: Passungsregel[]): Record<string, string[]> {
  const mitVorwissen = regeln.filter((r) => r.art === 'deklarativ' && r.wenn?.situation?.vorwissen);
  const R = erstelleRegeln(mitVorwissen);
  const aus: Record<string, string[]> = {};
  for (const v of VORWISSEN) {
    const ids = R.pruefe(b, { vorwissen: v }).map((m) => m.regel).filter((id) => !id.startsWith('eignung-'));
    if (ids.length) aus[v] = ids;
  }
  return aus;
}

// ---------------------------------------------------------------------------------------------------------------
// Judgement tables. Each proposal carries its evidence: a quote from Durchführung, Material, Kurzbeschreibung, Hinweis
// or Evidenz of the method, or a source.

interface Grund {
  grundlage: 'E' | 'S' | 'A';
  text: string;
  quelle?: string;
}

/** Part 2: entries geeignetBeiVorwissen that stay as ungeeignetBeiVorwissen (evidence on the method). */
export const VORWISSEN_BLEIBT: Record<string, { werte: string[]; grund: Grund; beleg: string }> = {
  loesungsbeispiele: {
    werte: ['hoch'],
    grund: { grundlage: 'E', text: 'Der Vorteil ausgearbeiteter Lösungsbeispiele kehrt sich mit wachsendem Vorwissen um (Expertise-Reversal).', quelle: 'Kalyuga et al. 2003; Tetzlaff et al. 2025' },
    beleg: 'Evidenz A „Expertise-Reversal: Der Vorteil starker Anleitung kehrt sich mit wachsendem Vorwissen um“ (Kalyuga et al. 2003; Tetzlaff et al. 2025); Qualitätsrisiko „Expertise-Reversal“; Hinweis „kehrt sich bei Expertise um“'
  },
  fehleranalyse: {
    werte: ['gering'],
    grund: { grundlage: 'E', text: 'Aus fehlerhaften Lösungsbeispielen lernen vor allem Lernende mit Grundwissen; Novizen brauchen zuvor korrekte Beispiele.', quelle: 'Große & Renkl 2007; Barbieri et al. 2023' },
    beleg: 'Evidenz B „fördert Fehlererkennung und Konzeptverständnis, v. a. bei Lernenden mit Grundwissen“ (Barbieri et al. 2023; Große & Renkl 2007); Hinweis „Novizen brauchen zuvor korrekte Beispiele“'
  },
  'forschendes-lernen': {
    werte: ['gering'],
    grund: { grundlage: 'E', text: 'Ungeleitetes Entdecken schneidet im Mittel schlechter ab als explizite Instruktion; das Risiko ist bei geringem Vorwissen besonders hoch.', quelle: 'Alfieri et al. 2011; Lazonder & Harmsen 2016' },
    beleg: 'Evidenz A „Ungeleitetes Entdecken schneidet im Mittel schlechter ab als explizite Instruktion (d ≈ −0,38)“, Geltung „Risiko besonders hoch bei geringem Vorwissen“; Qualitätsrisiko „Überforderung bei Novizen“. Die Regel wenig-anleitung-geringes-vorwissen greift nicht, weil sequenz problem-vor-instruktion trägt (Alternative: sequenz prüfen). Für mittel kein Beleg'
  }
};

/** Part 2: extra facts for entries that are dropped although the method data say something about prior knowledge. */
export const VORWISSEN_HINWEIS: Record<string, string> = {
  'direkte-instruktion': 'Hinweis „Stark bei Novizen“ sagt nichts über hohes Vorwissen',
  'gradual-release': 'Evidenz „besonders bei geringem Vorwissen“ sagt nichts über hohes Vorwissen',
  'problemorientiertes-lernen': 'Hinweis „setzt Vorwissen und Tutor-Begleitung voraus“ ohne Quelle; Evidenz (Dochy et al. 2003) nennt kein Vorwissen; Vorbedingung vorwissen-aktiviert trägt das in der Kette',
  'siebensprung-pbl': 'Evidenz „erfordert aber bei Anfängern gezielte Strukturhilfen“ nennt eine Hilfe, keine Uneignung',
  'case-based-learning': 'Vorbedingung vorwissen-aktiviert trägt das in der Kette',
  'lernen-durch-lehren': 'Hinweis „Lehrkraft bleibt fachliche Sicherheitsinstanz“ betrifft die Begleitung, nicht das Vorwissen',
  'team-based-learning': 'Vorbereitung ist Teil der Durchführung („Fokussierte Basislektüre oder Erklärvideo vorab bearbeiten“)',
  'kooperatives-skript': 'Qualitätsrisiko „Over-Scripting kann erfahrene Lernende einengen“ ist kein Befund'
};

/** Part 3: ungeeignetBeiStufe entries that the two rules do not cover, with the proposal. */
export const STUFE_URTEIL: Record<string, { werte: string[]; grund?: Grund; beleg: string }> = {
  'dual-praxismodul': {
    werte: ['primar'],
    grund: { grundlage: 'S', text: 'Die Methode setzt eine längere Praxisphase an einem realen Arbeitsort mit Praktikumsbericht voraus.' },
    beleg: 'Kurzbeschreibung „Längere Praxisphase an einem realen Arbeits- oder Lernort“; Durchführung „Theoriegeleiteter Praktikumsbericht und Abschlusskolloquium“'
  },
  'lernfeld-curriculum': {
    werte: ['primar'],
    grund: { grundlage: 'S', text: 'Die Methode setzt eine berufliche Handlungssituation voraus; Lernfelder gliedern den Unterricht der Berufsschule.', quelle: 'KMK 2021' },
    beleg: 'Kurzbeschreibung „Berufsbildendes Modul, das Fachinhalte entlang realer beruflicher Handlungsfelder … integriert“; Durchführung „Authentische berufliche Lernsituation als Rahmenauftrag einführen“'
  },
  'produktives-lernen': {
    werte: ['primar'],
    grund: { grundlage: 'S', text: 'Die Methode setzt selbst gesuchte Praxisplätze außerhalb der Schule voraus.' },
    beleg: 'Kurzbeschreibung „Individuelles Lernen an realen Praxisplätzen außerhalb der Schule“; Durchführung „Eigenen Praxisplatz suchen und individuelle Lernfragen vereinbaren“'
  },
  'herausforderung-projekt': {
    werte: ['primar'],
    grund: { grundlage: 'S', text: 'Lernende planen Route, Budget und Sicherheit eines mehrtägigen Vorhabens außerhalb der Schule selbst.' },
    beleg: 'Durchführung „Route, Budget, Sicherheit und Begleitung eigenständig planen“ und „Mehrtägige Durchführung außerhalb der Schule“'
  },
  'supervision-gruppe': {
    werte: ['primar'],
    grund: { grundlage: 'S', text: 'Die Methode reflektiert berufliche Praxisphasen.' },
    beleg: 'Durchführung „Konkrete Vorsätze für die nächste Praxisphase festhalten“; Kurzbeschreibung „Moderierte Gruppenreflexion beruflicher oder sozialer Lernsituationen“. sek1: kein Beleg in Durchführung oder Material'
  },
  'freispiel-primar': {
    werte: ['sek2', 'berufsbildung', 'hochschule', 'erwachsenenbildung'],
    grund: { grundlage: 'S', text: 'Freispiel ist für den Elementar- und frühen Primarbereich beschrieben und dort belegt.', quelle: 'Weisberg, Hirsh-Pasek & Golinkoff 2013' },
    beleg: 'Kurzbeschreibung „(v. a. Elementar- und Primarbereich)“; Evidenz B „… im Elementar- und frühen Primarbereich“ (Weisberg, Hirsh-Pasek & Golinkoff 2013); Durchführung „Kinder wählen Spielpartner, Ort und Thema frei“. Das Feld geltung widerspricht dem Befund (siehe T8-freispiel-primar-geltung)'
  },
  'thinking-at-the-edge': {
    werte: [],
    beleg: 'Qualitätsrisiko „Abstrakt für jüngere Lerngruppen“ ist kein Beleg in Durchführung, Material oder Quelle; Evidenz C (Meyer 1987; Mühlhausen 2023) nennt keine Stufe'
  },
  'catwoe-analyse': {
    werte: [],
    beleg: 'Qualitätsrisiko „Hohe Begriffsabstraktion verlangt gute Einführung“ ist kein Beleg in Durchführung, Material oder Quelle; Evidenz C (Meyer 1987; Mühlhausen 2023) nennt keine Stufe'
  }
};

/** Part 4: fachbereichUngeeignet entries that stay, with reason. All others are proposed for deletion. */
export const FACH_BLEIBT: Record<string, { grund: Grund; beleg: string }> = {
  'diktat-klassisch': {
    grund: { grundlage: 'S', text: 'Gegenstand der Methode ist die Rechtschreibung.' },
    beleg: 'Kurzbeschreibung „Lehrkraft diktiert einen … Text satzweise zur summativen Überprüfung der Rechtschreibsicherheit“'
  },
  bestimmungsuebung: {
    grund: { grundlage: 'S', text: 'Gegenstand der Methode sind echte Naturobjekte und ein Bestimmungsschlüssel.' },
    beleg: 'Kurzbeschreibung „Lernende bestimmen echte Objekte (Pflanzen, Tiere, Gesteine) mit einem einfachen Bestimmungsschlüssel“; Material „Bestimmungsschlüssel / Objekte oder Fundstellen / Lupe“'
  }
};

/** Part 5: the five candidates for the entry kind "Hilfe". */
export const HILFE_URTEIL: Record<string, { vorschlag: string; beleg: string }> = {
  'scaffolding-hilfen': {
    vorschlag: 'eintragsart=hilfe; nachbedingung entfällt (eine Hilfe trägt keine Phase)',
    beleg: 'Kurzbeschreibung „Bei anspruchsvollen Aufgaben greifen Lernende bedarfsgerecht auf mehrstufige, verdeckte Impuls- und Lösungshilfen zurück“; Durchführung „ziehen bei Bedarf Karte 1, 2 oder 3“: die Aufgabe stammt aus der umgebenden Methode. Definition Hilfe (vocab eintragsart): „stützt Lernende innerhalb einer Methode; liefert keinen Lernstand“'
  },
  woerterwiese: {
    vorschlag: 'eintragsart bleibt methode',
    beleg: 'Durchführung Schritte 1–3 („notieren oder kleben passende Wörter“, „unbekannte Schlüsselbegriffe ergänzen … gruppieren“) sind eine eigene Einstiegsphase mit nachbedingung vorwissen-aktiviert; nur Schritt 4 „als sichtbare Sprachhilfe hängen lassen“ ist Hilfe. Leitfaden-Beispiel „Wortspeicher: Hilfe“ meint den Speicher, nicht die Sammelphase'
  },
  flipped: {
    vorschlag: 'eintragsart bleibt methode; nachbedingung=konzept-gesichert',
    beleg: 'Durchführung „Präsenzzeit für Anwendung und Klärung nutzen“; Pflicht-Slot praesenz mit lernfunktion anwendung|verstehen|problemloesen; komposit. Mit leerer Nachbedingung steht die Methode in keinem Kettenschritt'
  },
  'freie-internetrecherche': {
    vorschlag: 'eintragsart bleibt methode; nachbedingung bleibt leer (Kontrast-Baustein); keine Hilfe',
    beleg: 'Kurzbeschreibung „typisches Beispiel der FMT-Gefahrenzone (offen & passiv/oberflächlich)“; Durchführung „Unbedingt durch Quellenkritik & geleitete Sicherung ergänzen“. Eine Hilfe stützt Lernende in einer Methode, das tut der Eintrag nicht; eine Nachbedingung brächte ihn in Kettenschritte'
  },
  'ki-chat': {
    vorschlag: 'eintragsart bleibt methode; nachbedingung bleibt leer (Kontrast-Baustein); keine Hilfe',
    beleg: 'Kurzbeschreibung „Kontrast-Baustein … (erzeugt keinen verlässlichen Lernzustand)“; Hinweis „Kein didaktisches Muster“; Durchführung „Aufgabe eingeben / Antwort übernehmen“. Eine Hilfe stützt Lernende, das tut der Eintrag nicht'
  }
};

/** Part 6: methods with B3 only "uniform" whose Durchführung names an adaptation to the learners. */
export const B3_URTEIL: Record<string, { werte: string[]; beleg: string }> = {
  'freinet-druckerei': { werte: ['udl', 'diff-inhalt'], beleg: 'Durchführung „Freies Schreiben zu selbst gewählten Themen oder Anlässen“' },
  'godly-play': { werte: ['udl', 'diff-produkt'], beleg: 'Durchführung „Kreative Antwortphase mit frei gewählten Materialien“' },
  'muendliche-leistungsabfrage': { werte: ['mikro'], beleg: 'Durchführung „Bei Bedarf gestufte Verständnis- und Transferfragen nachlegen“' },
  'produktives-lernen': { werte: ['makro', 'diff-inhalt'], beleg: 'Durchführung „Eigenen Praxisplatz suchen und individuelle Lernfragen vereinbaren“' }
};
/** Word search for Part 6 (candidates; each hit is read, only B3_URTEIL becomes an entry). */
const B3_SUCHE =
  /(differenz|niveau|gestuft|hilfe|wahl|wähl|individuell|tempo|schwierig|anpass|leistungsst|leistungsschw|unterstütz|scaffold|vereinfach|selbst gewählt|frei gewählt|bei bedarf|je nach)/i;

/** Part 7: proposal per row of data/teilgruppen.json (default: bleibt). */
export const TEILGRUPPEN_URTEIL: Record<string, { vorschlag?: string; beleg: string }> = {
  'vorwissen-gering': { beleg: 'Ausprägung leistungsniveau-gering ist in Task C1 ergänzt (Regelsatz nennt nur das Merkmal)' },
  'vorwissen-hoch': { beleg: 'Ausprägung leistungsniveau-hoch ist in Task C1 ergänzt (Regelsatz nennt nur das Merkmal)' },
  lernschwierigkeiten: { beleg: 'Regelsatz „E; Übertragung A“: der Befund (Swanson & Hoskyn 1998) ist E, seine Übertragung auf diese Zuordnung A; Task C1 setzt die vorsichtigere Grundlage A' },
  sprachstand: { beleg: 'Regelsatz „E, ohne Effektstärken“ (Höfler et al. 2024)' },
  'sehen-hoeren': { vorschlag: 'grundlage=Recht', beleg: 'Regelsatz „E (amtlich)“; KMK 2011 ist ein Beschluss der Kultusministerkonferenz (Nachteilsausgleich), kein Forschungsbefund; Grundlage Recht steht im Wortschatz' },
  arbeitsgedaechtnis: { beleg: 'Regelsatz „E/S“: belegt ist „kein Training“ (Melby-Lervåg et al. 2016), „Schritte zerlegen, Last senken“ ist gefolgert; S ist die vorsichtigere Grundlage' },
  'motivation-interesse': { vorschlag: 'quelle ergänzen um „(Wirkung auf die Leistung ungeklärt)“; grundlage bleibt E', beleg: 'Regelsatz „E für Motivation; Leistung U“ (Patall et al. 2008); die vereinfachte Grundlage E verliert den Teil „Leistung U“' },
  'emotional-sozial': { beleg: 'Die vier eigenen Ausprägungen sind die abweichenden Werte aller vier Kategorien der Matrix-Variable „Soziale und emotionale Entwicklung“ (soziale-kompetenzen, resilienz, emotionale-stabilitaet, herausforderungen). Antwort hilfe mit Grundlage U wie sonst: die Auswahl ändert nur den Text „wohin“' },
  'selbstregulation-gering': { beleg: 'Regelsatz: Hilfe, U; methodenkompetenz-gering ist nicht genannt und fällt unter sonst (gleiche Antwort)' },
  'kann-sich-nicht-frei-bewegen': { beleg: 'Regelsatz: Tausch, formal; foerderbedarf-koerperlich-leicht fällt unter sonst (Hilfe)' }
};

/** Part 7: matrix categories whose deviating values no row names (they get the answer of "sonst"). */
export const SONST_KATEGORIEN: Record<string, { werte: string[]; beleg: string }> = {
  'foerderbedarf-geistig': { werte: ['foerderbedarf-geistig-leicht', 'foerderbedarf-geistig-deutlich'], beleg: 'Die Quelle der Zeile lernschwierigkeiten (Swanson & Hoskyn 1998) betrifft Lernbehinderungen, nicht die geistige Entwicklung; kein Beleg für einen Tausch' },
  'foerderbedarf-autismus': { werte: ['foerderbedarf-autismus-leicht', 'foerderbedarf-autismus-deutlich'], beleg: 'Regelsatz nennt Autismus nicht; kein Beleg für einen Tausch' },
  'foerderbedarf-koerperlich': { werte: ['foerderbedarf-koerperlich-leicht'], beleg: 'Tausch nur bei „deutlich“ (Zeile kann-sich-nicht-frei-bewegen, formal); bei leichter Beeinträchtigung ist Bewegung möglich' },
  gesundheitsstatus: { werte: ['gesundheitsstatus-gelegentlich', 'gesundheitsstatus-chronisch'], beleg: 'Regelsatz nennt das Merkmal nicht' },
  'psychische-gesundheit': { werte: ['psychische-gesundheit-gelegentlich', 'psychische-gesundheit-haeufig'], beleg: 'Regelsatz nennt das Merkmal nicht; emotional-sozial hat dieselbe Antwort' },
  methodenkompetenz: { werte: ['methodenkompetenz-gering'], beleg: 'Regelsatz nennt das Merkmal nicht; selbstregulation-gering hat dieselbe Antwort' },
  'tech-kompetenz': { werte: ['tech-kompetenz-gering'], beleg: 'Regelsatz nennt das Merkmal nicht' },
  'zeitliche-verfuegbarkeit': { werte: ['zeitliche-verfuegbarkeit-eingeschraenkt'], beleg: 'Regelsatz nennt das Merkmal nicht' },
  soziooekonomisch: { werte: ['soziooekonomisch-gering'], beleg: 'Regelsatz nennt das Merkmal nicht' },
  lernressourcen: { werte: ['lernressourcen-begrenzt'], beleg: 'Regelsatz nennt das Merkmal nicht' }
};

/** Part 8: inputs collected in earlier tasks (b5-eingaenge.md, items 1 to 6). */
export const EINGAENGE: { id: string; kennung: string; feld: string; wert: (b: Baustein) => string; vorschlag: string; beleg: string; punkt: number }[] = [
  {
    punkt: 1,
    id: 'vier-stufen-methode-fachbereich',
    kennung: 'vier-stufen-methode',
    feld: 'fachbereich',
    wert: (b) => liste(b.fachbereich),
    vorschlag: 'fachbereich + nawi-technik',
    beleg: 'Material „Werkzeug / Laborgerät“; Raumhinweis „Werkstatt, Labor oder Fachraum“; Durchführung „Arbeitsplatz, Ziel und Sicherheitsregeln klären“. Die Brücke „bis Tor D2“ in zuordnung.ts hält fünf nawi-Fälle (Task A10)'
  },
  {
    punkt: 2,
    id: 'vorfuehrung-rueckmeldung-fachbereich',
    kennung: 'vorfuehrung-rueckmeldung',
    feld: 'fachbereich',
    wert: (b) => liste(b.fachbereich),
    vorschlag: 'fachbereich + sport',
    beleg: 'Kurzbeschreibung „führen das Geübte vor (Lied, Szene, Choreografie, Handgriff)“; Raumhinweis „Klassenraum, Halle, Bühne oder Fachraum“; Golden-Fall „Tanz im Sport darf die Vorführung mit Rückmeldung nutzen“ (Task A10, Sonderregel 5)'
  },
  {
    punkt: 3,
    id: 'makerspace-tueftelwerkstatt-raumbedarf',
    kennung: 'makerspace-tueftelwerkstatt',
    feld: 'raumbedarf; fachausstattungArt',
    wert: (b) => `${liste(b.raumbedarf)}; ${b.fachausstattungArt || '–'}`,
    vorschlag: 'raumbedarf=fachausstattung; fachausstattungArt=werkstatt',
    beleg: 'Kurzbeschreibung „Offene Werkstattumgebung“; Durchführung „Materialien/Werkzeuge wählen und ersten Prototyp bauen“; Material „Werkstattmaterial (Karton, Elektronik, Mikrocontroller, Werkzeug)“; Raumhinweis „Makerspace / Werkraum“; Tor D1 nennt die Methode als Kandidaten (Werkstatt). sport in fachbereichUngeeignet: siehe T4'
  },
  {
    punkt: 4,
    id: 'world-cafe-raumbedarf',
    kennung: 'world-cafe',
    feld: 'raumbedarf',
    wert: (b) => liste(b.raumbedarf),
    vorschlag: 'raumbedarf=stellflaeche',
    beleg: 'Durchführung „3 bis 5 Tische mit Papier-Tischdecken … vorbereiten“ und „alle anderen wechseln an neue Tische“; Raumhinweis „Raum mit beweglichen Tischen“. Schreibplatz nicht: geschrieben wird an der Gruppentischdecke, nicht am eigenen Platz'
  },
  {
    punkt: 4,
    id: 'wirbelgruppe-raumbedarf',
    kennung: 'wirbelgruppe',
    feld: 'raumbedarf',
    wert: (b) => liste(b.raumbedarf),
    vorschlag: 'raumbedarf bleibt leer',
    beleg: 'Raumhinweis „Gruppentische oder Stuhlkreise“ nennt zwei Möglichkeiten; Durchführung „Kleingruppen (3–4 Personen) bilden“, „Gruppen werden gezielt neu gemischt“: Dreier- und Vierergruppen bilden sich auch an festen Plätzen'
  },
  {
    punkt: 4,
    id: 'gruppenrallye-raumbedarf',
    kennung: 'gruppenrallye',
    feld: 'raumbedarf',
    wert: (b) => liste(b.raumbedarf),
    vorschlag: 'raumbedarf bleibt leer',
    beleg: 'Kein Raumhinweis; Durchführung „Heterogene Vierergruppen üben gemeinsam“ nennt keine Raumeigenschaft. Schreibplatz für den Kurztest war in Tor D1 strittig und wurde nicht übernommen'
  },
  {
    punkt: 5,
    id: 'erfindungsaufgabe-feedback',
    kennung: 'erfindungsaufgabe',
    feld: 'feedback; adaptivitaet',
    wert: (b) => `${liste(b.feedback)}; ${liste(b.adaptivitaet)}`,
    vorschlag: 'Kodierung bleibt (feedback nur verzoegert, ohne Quelle der Rückmeldung; adaptivitaet uniform); Regel siehe T1-entdecken-nur-mit-stuetze',
    beleg: 'Durchführung „Vorschläge sichern, ohne sie zu bewerten“: in der Methode gibt keine Lehrkraft, kein Peer und kein System Rückmeldung, sie folgt später (verzoegert); Hinweis „braucht anschließende Instruktion“; Material „Vier bis sechs kontrastierende Fälle“ für alle gleich'
  },
  {
    punkt: 6,
    id: 'ki-chat-aufgabe',
    kennung: 'ki-chat',
    feld: 'aufgabe (Wissensart)',
    wert: (b) => liste((b.aufgabe || []).filter((x) => ['fakten', 'konzepte', 'prozeduren', 'psychomotorik', 'einstellungen', 'metakognitiv'].includes(x))),
    vorschlag: 'Wissensart bleibt leer; Eintragsart siehe T5-ki-chat-eintragsart',
    beleg: 'Kurzbeschreibung „erzeugt keinen verlässlichen Lernzustand“; Tor D1 hat die Wissensart bewusst leer gelassen (Test fmt2-daten BEWUSST_LEER)'
  },
  {
    punkt: 0,
    id: 'freispiel-primar-geltung',
    kennung: 'freispiel-primar',
    feld: 'evidenz[0].geltung',
    wert: (b) => b.evidenz[0]?.geltung || '–',
    vorschlag: 'geltung=Elementar- und früher Primarbereich',
    beleg: 'Befund derselben Evidenz „… im Elementar- und frühen Primarbereich“ (Weisberg, Hirsh-Pasek & Golinkoff 2013). Mit der heutigen Angabe zählt die Evidenz als „nur Sekundarstufe oder später“, und die Regel evidenz-geltung warnt bei dieser Methode in der Grundschule'
  }
];

/** Psychomotor methods checked for Part 8 item 1 (Technik, Werkstatt, Experiment in Durchführung or Material). */
const TECHNIK_SUCHE = /(werkstatt|werkzeug|labor|experiment|löten|bauteil|präparat|maschin|prototyp|messgerät)/i;

// ---------------------------------------------------------------------------------------------------------------
// Parts

export interface Teil {
  nr: number;
  titel: string;
  einleitung: string[];
  info: string[];
  eintraege: Eintrag[];
}

const md = (s: string) => s.replace(/\|/g, '\\|');
const nameVon = (D: FmtData) => {
  const m = new Map(D.bausteine.map((b) => [b.kennung, b.name]));
  return (k: string) => (m.has(k) ? `${m.get(k)} (\`${k}\`)` : `\`${k}\``);
};

/** Part 1: rule-hit report (information) and the decisions it yields (entries). */
export function teil1(D: FmtData): Teil {
  const name = nameVon(D);
  const info: string[] = [];
  const eintraege: Eintrag[] = [];
  const dekl = D.regeln.filter((r) => r.art === 'deklarativ');
  const bed = (r: Passungsregel) =>
    Object.entries(r.wenn?.methode ?? {})
      .map(([f, v]) => `${f} ${Object.entries(v).map(([op, w]) => `${op} ${(w as string[]).join('|')}`).join(', ')}`)
      .join('; ');
  const sit = (r: Passungsregel) => Object.entries(r.wenn?.situation ?? {}).map(([f, w]) => `${f} ${w.join('|')}`).join('; ') || '– (immer)';

  info.push('### 1a Treffer je deklarativer Regel', '', 'Gezählt mit der Regelmaschine des Kerns (`regeln.ts`); der Teil der Situation gilt als gegeben.', '');
  info.push('| Regel | Bedingung an der Methode | Situation | Treffer | Methoden |', '|---|---|---|---|---|');
  for (const r of dekl) {
    const t = treffer(r, D.bausteine);
    info.push(`| \`${r.id}\`${r.keinTausch ? ' (keinTausch)' : ''} | ${md(bed(r))} | ${md(sit(r))} | ${t.length} | ${t.map((b) => `\`${b.kennung}\``).join(', ') || '–'} |`);
  }
  info.push('', '### 1b Lesart von „wenig Anleitung“ (B1 nur „offen“ oder auch neben anderen Werten)', '');
  info.push('| Regel | Treffer mit „nur“ | Treffer mit „enthält“ | nur mit „enthält“ getroffen |', '|---|---|---|---|');
  const lesartZeilen: string[] = [];
  for (const r of dekl) {
    const weit = weiteLesart(r);
    if (!weit) continue;
    const eng = new Set(treffer(r, D.bausteine).map((b) => b.kennung));
    const breit = treffer(weit, D.bausteine);
    const extra = breit.filter((b) => !eng.has(b.kennung));
    info.push(`| \`${r.id}\` | ${eng.size} | ${breit.length} | ${md(extra.map((b) => `\`${b.kennung}\` (${b.anleitung.join('|')})`).join(', ') || '–')} |`);
    lesartZeilen.push(`${r.id}: ${eng.size} mit „nur“, ${breit.length} mit „enthält“`);
  }

  // Nachweisformen over the check methods (first learning function diagnose), enaktiv shown separately.
  const pruef = D.bausteine.filter((b) => b.lernfunktion[0] === 'diagnose');
  const FORMEN = ['schriftlich', 'muendlich', 'praktisch', 'produkt'];
  const nachEnaktiv = (b: Baustein) => (b.repraesentation || []).includes('enaktiv');
  info.push('', `### 1c Verteilung von \`nachweisformen\` über die ${pruef.length} Prüfmethoden (erste Lernfunktion „diagnose“)`, '');
  info.push('„praktisch“ setzt `zielart.ts` für jede Methode mit Repräsentation „enaktiv“, ohne Blick auf die Wissensart (Eingang 9). Die Spalte „ohne Psychomotorik oder Verfahren“ zeigt die Prüfmethoden, die nur so als praktisch zählen.', '');
  info.push('| Form | Prüfmethoden | ohne Psychomotorik oder Verfahren | Methoden |', '|---|---|---|---|');
  const praxisWissen = (b: Baustein) => (b.aufgabe || []).some((w) => w === 'psychomotorik' || w === 'prozeduren');
  for (const f of FORMEN) {
    const mit = pruef.filter((b) => nachweisformen(b).includes(f as never));
    const ohneWissen = f === 'praktisch' ? mit.filter((b) => nachEnaktiv(b) && !praxisWissen(b)) : [];
    info.push(`| ${f} | ${mit.length} | ${f === 'praktisch' ? ohneWissen.map((b) => `\`${b.kennung}\``).join(', ') || '0' : '–'} | ${mit.map((b) => `\`${b.kennung}\``).join(', ') || '–'} |`);
  }
  const ohne = pruef.filter((b) => nachweisformen(b).length === 0);
  info.push(`| ohne Form | ${ohne.length} | – | ${ohne.map((b) => `\`${b.kennung}\``).join(', ') || '–'} |`);
  const alleEnaktiv = D.bausteine.filter(nachEnaktiv);
  info.push('', `Über alle ${D.bausteine.length} Methoden zählen ${alleEnaktiv.length} als „praktisch“, weil sie enaktiv sind; davon tragen ${alleEnaktiv.filter((b) => !(b.aufgabe || []).some((w) => w === 'psychomotorik' || w === 'prozeduren')).length} weder Psychomotorik noch Verfahren als Wissensart.`);

  // Primar rule: hits, learning function problemloesen, the three plans of Task B3.
  const primar = D.regeln.find((r) => r.id === PRIMAR_REGEL);
  if (primar) {
    const t = treffer(primar, D.bausteine);
    const ohnePL = t.filter((b) => !b.lernfunktion.includes('problemloesen'));
    info.push('', `### 1d Regel \`${PRIMAR_REGEL}\`: ${t.length} Treffer`, '');
    info.push('Task B3: Die Regel ordnet drei Grundschul-Pläne der Qualitätsfälle um. r2-gs-kunst-collage-90: stummer-impuls → nominal-group-technique (und lernprodukt-galerie → kwl-methode als Folge); r3-ort-gs-wald-90: entdeckendes-lernen → scamper (und sketchnotes → vortrag-prompts als Folge); r3-gs-sachunterricht-verkehr-45: concept-cartoon → ampelspiel.', '');
    info.push('| Methode | Lernfunktion | Problemlösen | ungeeignetBeiStufe heute |', '|---|---|---|---|');
    for (const b of t) info.push(`| ${md(name(b.kennung))} | ${md(b.lernfunktion.join('|'))} | ${b.lernfunktion.includes('problemloesen') ? 'ja' : 'nein'} | ${md(liste(b.ungeeignetBeiStufe))} |`);
    eintraege.push(
      eintrag(
        1,
        `${PRIMAR_REGEL}-bedingung`,
        PRIMAR_REGEL,
        'regeln.json wenn.methode; keinTausch',
        'sequenz enthaelt problem-vor-instruktion; keinTausch nicht gesetzt',
        'keinTausch nicht setzen; wenn.methode um lernfunktion enthaelt problemloesen ergänzen',
        `Quelle Sinha & Kapur 2021 betrifft Problemlösen vor Instruktion; ${ohnePL.length} der ${t.length} Treffer haben keine Lernfunktion problemloesen (${ohnePL.map((b) => b.kennung).join(', ')}). In den drei umgeordneten Grundschul-Plänen (Task B3) sind stummer-impuls und concept-cartoon solche Treffer, entdeckendes-lernen nicht. Alternative: keinTausch (Regel warnt, ordnet nicht)`
      )
    );
  }

  const stuetze = D.regeln.find((r) => r.id === STUETZE_REGEL);
  if (stuetze) {
    const t = treffer(stuetze, D.bausteine);
    eintraege.push(
      eintrag(
        1,
        `${STUETZE_REGEL}-ausnahme`,
        STUETZE_REGEL,
        'regeln.json wenn.methode',
        bed(stuetze),
        'wenn.methode um sequenz ohne problem-vor-instruktion ergänzen (wie wenig-anleitung-geringes-vorwissen)',
        `Die Regel braucht keine Situation und trifft ${t.length} Methode(n): ${t.map((b) => `${b.kennung} (sequenz ${liste(b.sequenz)})`).join(', ')}. Bei Problemlösen vor Instruktion folgt die Stütze als Instruktion (Hinweis der Erfindungsaufgabe „braucht anschließende Instruktion“); Quelle Alfieri et al. 2011 vergleicht unangeleitetes Entdecken mit expliziter Instruktion. Mit der Ausnahme trifft die Regel heute keine Methode`
      )
    );
  }

  eintraege.push(
    eintrag(
      1,
      'anleitung-lesart',
      'wenig-anleitung-geringes-vorwissen',
      'Lesart B1 in drei Regeln',
      'nur offen (bzw. nur explizit)',
      'Lesart „nur“ bleibt',
      `${lesartZeilen.join('; ')}. Mit „enthält“ kämen Methoden hinzu, die Offenheit mit Anleitung verbinden (Tabelle 1b); deren Durchführung nennt Anleitungsschritte`
    )
  );

  const praktischEnaktiv = pruef.filter((b) => nachweisformen(b).includes('praktisch') && nachEnaktiv(b));
  const ohnePraxis = praktischEnaktiv.filter((b) => !(b.aufgabe || []).some((w) => w === 'psychomotorik' || w === 'prozeduren'));
  eintraege.push(
    eintrag(
      1,
      'nachweisformen-enaktiv',
      'nachweis-passt-zum-ziel',
      'Setzung nachweisformen (zielart.ts)',
      'praktisch bei jeder Methode mit Repräsentation enaktiv',
      'praktisch nur bei enaktiv und Wissensart psychomotorik oder prozeduren',
      `Prüfmethoden mit praktisch: ${praktischEnaktiv.map((b) => `${b.kennung} (Wissensart ${liste(b.aufgabe.filter((w) => ['fakten', 'konzepte', 'prozeduren', 'psychomotorik', 'einstellungen', 'metakognitiv'].includes(w)))})`).join(', ')}. ${ohnePraxis.map((b) => `${b.kennung}: Durchführung ${zitat(b.durchfuehrung[1] || b.durchfuehrung[0])}`).join('; ')}: kein praktischer Leistungsnachweis`
    )
  );

  return {
    nr: 1,
    titel: 'Regel-Treffer-Bericht',
    einleitung: [
      'Information für Prüfung und Jan: Trifft die Lesart der Regeln das Gemeinte? Einträge entstehen nur, wo der Bericht eine Entscheidung verlangt (Eingänge 8 und 9).'
    ],
    info,
    eintraege
  };
}

/** Part 2: the entries geeignetBeiVorwissen against the rules about prior knowledge. */
export function teil2(D: FmtData): Teil {
  const eintraege: Eintrag[] = [];
  for (const b of D.bausteine.filter((x) => x.geeignetBeiVorwissen?.length)) {
    const geeignet = b.geeignetBeiVorwissen!;
    const alt = VORWISSEN.filter((v) => !geeignet.includes(v));
    const regel = regelVorwissen(b, D.regeln);
    const regelStufen = Object.keys(regel);
    const regelText = regelStufen.length ? regelStufen.map((v) => `${regel[v].join(', ')} warnt bei ${v}`).join('; ') : 'keine Regel warnt (B1 ' + b.anleitung.join('|') + (b.sequenz.includes('problem-vor-instruktion') ? ', sequenz problem-vor-instruktion' : '') + ')';
    const widerspruch = regelStufen.filter((v) => geeignet.includes(v));
    const teile: string[] = [`Eintrag: ungeeignet bei ${alt.join('|') || '–'}`, `Regeln: ${regelText}`];
    if (widerspruch.length) teile.push(`Widerspruch: Regel warnt bei ${widerspruch.join('|')}, der Eintrag nannte das als geeignet; ein Eintrag hebt keine Regel auf (Kodierung B1 prüfen)`);
    let vorschlag: string;
    const gleich = alt.length === regelStufen.length && alt.every((v) => regelStufen.includes(v));
    const urteil = VORWISSEN_BLEIBT[b.kennung];
    if (gleich) {
      vorschlag = alt.length ? 'entfällt (Regel deckt)' : 'entfällt (Eintrag nennt alle Stufen und schließt nichts aus)';
    } else if (urteil) {
      vorschlag = bleibt('ungeeignetBeiVorwissen', urteil.werte, 'vorwissen', urteil.grund);
      teile.push(urteil.beleg);
    } else {
      vorschlag = 'entfällt';
      teile.push(VORWISSEN_HINWEIS[b.kennung] ? `${VORWISSEN_HINWEIS[b.kennung]}; kein Beleg für Uneignung in Durchführung, Material oder Evidenz` : 'kein Beleg für Uneignung in Durchführung, Material oder Evidenz');
    }
    eintraege.push(eintrag(2, `${b.kennung}-vorwissen`, b.kennung, 'geeignetBeiVorwissen', geeignet.join('|'), vorschlag, teile.join('. ')));
  }
  return {
    nr: 2,
    titel: `${eintraege.length} Einträge \`geeignetBeiVorwissen\``,
    einleitung: [
      'Je Methode: was der Eintrag heute sagt (die nicht genannten Stufen gelten als ungeeignet), wo die Regeln `wenig-anleitung-geringes-vorwissen` und `viel-anleitung-hohes-vorwissen` warnen, und der Vorschlag. Stimmen Regel und Eintrag überein, entfällt der Eintrag. Weichen sie ab, entfällt er, außer die Methode trägt einen Beleg; dann bleibt er als `ungeeignetBeiVorwissen` mit `eignungsgrund.vorwissen`.'
    ],
    info: [],
    eintraege
  };
}

/** Part 3: the entries ungeeignetBeiStufe. */
export function teil3(D: FmtData): Teil {
  const eintraege: Eintrag[] = [];
  const R = erstelleRegeln(D.regeln);
  for (const b of D.bausteine.filter((x) => x.ungeeignetBeiStufe?.length)) {
    const werte = b.ungeeignetBeiStufe!;
    const nurPrimar = werte.length === 1 && werte[0] === 'primar';
    const primarRegel = R.pruefe(b, { bildungsstufe: 'primar' }).some((m) => m.regel === PRIMAR_REGEL);
    const geltung = b.evidenz.map((e) => e.geltung).filter(Boolean);
    const evid = b.evidenz.map((e) => `Evidenz ${e.grad} (${e.quelle}), Geltung ${zitat(e.geltung)}`).join('; ');
    const urteil = STUFE_URTEIL[b.kennung];
    let vorschlag: string;
    let beleg: string;
    if (urteil) {
      vorschlag = urteil.werte.length && urteil.grund ? bleibt('ungeeignetBeiStufe', urteil.werte, 'stufe', urteil.grund) : 'streichen';
      const rest = werte.filter((w) => !urteil.werte.includes(w));
      if (urteil.werte.length && rest.length) vorschlag += `; ${rest.join('|')} streichen`;
      beleg = urteil.beleg;
    } else if (nurPrimar && primarRegel) {
      vorschlag = `entfällt (Regel ${PRIMAR_REGEL} deckt)`;
      beleg = `sequenz ${liste(b.sequenz)}; Lernfunktion ${liste(b.lernfunktion)} (bleibt gedeckt, wenn T1-${PRIMAR_REGEL}-bedingung gilt: ${b.lernfunktion.includes('problemloesen') ? 'ja' : 'nein'}); ${evid}`;
    } else if (werte.includes('primar') && nurSekundarEvidenz(b)) {
      vorschlag = 'entfällt (Regel evidenz-geltung deckt)';
      beleg = `Alle Geltungsangaben nur Sekundarstufe oder später: ${geltung.map(zitat).join('; ')}. evidenz-geltung warnt in der Grundschule (Grundlage A)`;
      if (werte.length > 1) vorschlag += `; ${werte.filter((w) => w !== 'primar').join('|')} streichen`;
    } else {
      vorschlag = 'streichen';
      beleg = `${evid}; Durchführung und Material nennen keine Stufe`;
    }
    eintraege.push(eintrag(3, `${b.kennung}-stufe`, b.kennung, 'ungeeignetBeiStufe', werte.join('|'), vorschlag, beleg));
  }
  return {
    nr: 3,
    titel: `${eintraege.length} Einträge \`ungeeignetBeiStufe\``,
    einleitung: [
      `Gedeckt heißt: eine Regel warnt in derselben Lage schon. \`${PRIMAR_REGEL}\` deckt Methoden mit Sequenz „Problemlösen vor Instruktion“ in der Grundschule; \`evidenz-geltung\` warnt in der Grundschule, wenn alle Geltungsangaben der Evidenz nur Sekundarstufe oder später nennen (\`nurSekundarEvidenz\`). Sonst bleibt ein Eintrag nur mit Grundlage (E belegt, S gefolgert aus Durchführung oder Material); ohne Beleg: streichen.`
    ],
    info: [],
    eintraege
  };
}

/** Part 4: the remaining entries fachbereichUngeeignet, with the objection of Tor D1 as second opinion. */
export function teil4(D: FmtData, einwaende: Record<string, { einwand: string; pruefnotiz: string }>): Teil {
  const eintraege: Eintrag[] = [];
  const WA = ['fakten', 'konzepte', 'prozeduren', 'psychomotorik', 'einstellungen', 'metakognitiv'];
  for (const b of D.bausteine.filter((x) => x.fachbereichUngeeignet?.length)) {
    const werte = b.fachbereichUngeeignet!;
    const urteil = FACH_BLEIBT[b.kennung];
    const lage = `Fachbereich (Verbreitung) ${liste(b.fachbereich)}; Raumbedarf ${liste(b.raumbedarf)}; Wissensart ${liste((b.aufgabe || []).filter((w) => WA.includes(w)))}`;
    const zweite = einwaende[b.kennung] ? `. Zweite Meinung Tor D1: ${einwaende[b.kennung].einwand} – ${einwaende[b.kennung].pruefnotiz}` : '';
    let vorschlag: string;
    let beleg: string;
    if (urteil) {
      vorschlag = bleibt('fachbereichUngeeignet', werte, 'fachbereich', urteil.grund);
      beleg = `${urteil.beleg}; ${lage}`;
    } else {
      vorschlag = 'streichen';
      const sport = werte.includes('sport') ? '; sport: der Raum entscheidet (Leitfaden „Sport eintragen, wenn die Halle gemeint ist“)' : '';
      beleg = `Kein Grund jenseits von Raum, Zielart oder Verbreitung in Durchführung oder Material (Leitfaden: „Verbreitung ist keine Eignung“)${sport}; ${lage}`;
    }
    eintraege.push(eintrag(4, `${b.kennung}-fach`, b.kennung, 'fachbereichUngeeignet', werte.join('|'), vorschlag, beleg + zweite));
  }
  return {
    nr: 4,
    titel: `${eintraege.length} verbleibende Einträge \`fachbereichUngeeignet\``,
    einleitung: [
      'Leitfrage des Leitfadens: Gibt es einen Grund, der nicht Raum oder Zielart ist? Ein Eintrag bleibt nur mit Grund und Grundlage (`eignungsgrund.fachbereich`), sonst wird er gestrichen. Die Einwände der D1-Prüfung (`tor-D2-eingang-fach.csv`, Eingang 7) stehen als zweite Meinung im Beleg.'
    ],
    info: [],
    eintraege
  };
}

/** Part 5: the five candidates for the entry kind "Hilfe". */
export function teil5(D: FmtData): Teil {
  const eintraege: Eintrag[] = [];
  for (const [k, u] of Object.entries(HILFE_URTEIL)) {
    const b = D.bausteine.find((x) => x.kennung === k);
    if (!b) continue;
    eintraege.push(eintrag(5, `${k}-eintragsart`, k, 'eintragsart; nachbedingung', `${b.eintragsart || 'methode (Vorgabe)'}; nachbedingung ${liste(b.nachbedingung)}`, u.vorschlag, u.beleg));
  }
  return {
    nr: 5,
    titel: 'Fünf Kandidaten für die Eintragsart Hilfe',
    einleitung: [
      'Eine Hilfe stützt Lernende innerhalb einer Methode, liefert keinen Lernstand, trägt keine Phase und hat keine Nachbedingung (vocab `eintragsart`, Design 5.2). `flipped`, `freie-internetrecherche` und `ki-chat` haben heute keine Nachbedingung und stehen deshalb in keinem Kettenschritt.'
    ],
    info: [],
    eintraege
  };
}

/** Part 6: B3 "nur uniform", only methods whose Durchführung names an adaptation. */
export function teil6(D: FmtData): Teil {
  const uniform = D.bausteine.filter((b) => b.adaptivitaet.length === 1 && b.adaptivitaet[0] === 'uniform');
  const eintraege: Eintrag[] = [];
  const geprueft: string[] = [];
  for (const b of uniform) {
    const u = B3_URTEIL[b.kennung];
    const hits = [...b.durchfuehrung.map((s) => ['Durchführung', s]), ...(b.variante || []).map((s) => ['Variante', s])].filter(([, s]) => B3_SUCHE.test(s));
    if (u) eintraege.push(eintrag(6, `${b.kennung}-b3`, b.kennung, 'adaptivitaet (B3)', 'uniform', `adaptivitaet=${u.werte.join('|')}`, u.beleg));
    else if (hits.length) geprueft.push(`| \`${b.kennung}\` | ${md(hits.map(([f, s]) => `${f}: ${zitat(s)}`).join('; '))} |`);
  }
  return {
    nr: 6,
    titel: `B3 „nur uniform“ (${uniform.length} Methoden)`,
    einleitung: [
      'Grundform zählt (Leitfaden): Vorschlag nur, wo die Durchführung eine Anpassung an die Lernenden nennt. Die Wortsuche (Differenzierung, Niveau, Hilfe, Wahl, Tempo, bei Bedarf …) über Durchführung und Variante liefert die Kandidaten; jeder Treffer ist gelesen.'
    ],
    info: geprueft.length
      ? ['Gelesene Treffer ohne Anpassung an die Lernenden (kein Eintrag):', '', '| Methode | Treffer |', '|---|---|', ...geprueft]
      : [],
    eintraege
  };
}

/** Part 7: the table "Tausch oder Hilfe" (data/teilgruppen.json, Task C1) against the paper's rule set. */
export function teil7(D: FmtData, regelsatz: { teilgruppen?: { merkmale?: { id: string; antwort: string; wohin: string; grundlage: string; quelle?: string }[] } } | null): Teil {
  const T = D.teilgruppen;
  const papier = new Map((regelsatz?.teilgruppen?.merkmale || []).map((m) => [m.id, m]));
  const eintraege: Eintrag[] = [];
  for (const m of T.merkmale) {
    const p = papier.get(m.id);
    const u = TEILGRUPPEN_URTEIL[m.id];
    const vergleich = p
      ? [
          p.antwort === m.antwort ? 'Antwort = Regelsatz' : `Antwort Regelsatz ${p.antwort}`,
          p.wohin === m.wohin ? 'wohin = Regelsatz' : `wohin Regelsatz ${zitat(p.wohin)}`,
          p.grundlage === m.grundlage ? 'Grundlage = Regelsatz' : `Grundlage Regelsatz ${zitat(p.grundlage)}`
        ].join(', ')
      : 'nicht im Regelsatz';
    eintraege.push(
      eintrag(
        7,
        `${m.id}-zeile`,
        m.id,
        'teilgruppen.json merkmale',
        `${m.antwort}${m.richtung ? ` (${m.richtung})` : ''}, ${m.grundlage}${m.quelle ? `, ${m.quelle}` : ''}; wohin ${zitat(m.wohin)}; Ausprägungen ${m.auspraegungen.join('|')}`,
        u?.vorschlag || 'bleibt',
        `${vergleich}${u ? `. ${u.beleg}` : ''}`
      )
    );
  }
  eintraege.push(
    eintrag(7, 'sonst-zeile', 'sonst', 'teilgruppen.json sonst', `${T.sonst.antwort}, ${T.sonst.grundlage}; wohin ${zitat(T.sonst.wohin)}`, 'bleibt', 'Regelsatz hat keine Zeile „sonst“; Design 6: „Matrix-Merkmale, die die Tabelle nicht nennt, bekommen die Antwort Hilfe mit Grundlage ‚ungeklärt‘“. Text „wohin“ aus Task C1')
  );
  const katName = new Map<string, string>();
  const auspr = new Map<string, string[]>();
  for (const v of DIFF_MATRIX_DATA.anpassungsvariablen)
    for (const k of v.kategorien) {
      katName.set(k.id, k.name);
      auspr.set(k.id, k.auspraegungen.map((a) => a.id));
    }
  eintraege.push(
    eintrag(
      7,
      'gesperrt',
      'gesperrt',
      'teilgruppen.json gesperrt',
      T.gesperrt.join('|'),
      'bleibt',
      `Sperrliste Regelsatz: Lernstil, Lerntyp, sensorische Präferenz, Hirnhälften-Typ, Brain Gym (Pashler et al. 2008; Rogowsky et al. 2015). In der Matrix trifft das nur die Kategorie ${T.gesperrt.map((g) => `${zitat(katName.get(g) || g)} (${(auspr.get(g) || []).join('|')})`).join(', ')}`
    )
  );
  const genannt = new Set(T.merkmale.flatMap((m) => m.auspraegungen));
  for (const [kat, u] of Object.entries(SONST_KATEGORIEN)) {
    const offen = u.werte.filter((w) => !genannt.has(w) && (auspr.get(kat) || []).includes(w));
    if (!offen.length) continue;
    eintraege.push(eintrag(7, `sonst-${kat}`, kat, 'teilgruppen.json (keine Zeile)', `${offen.join('|')} → sonst (Hilfe, U)`, 'bleibt bei sonst', `Matrix-Kategorie ${zitat(katName.get(kat) || kat)}. ${u.beleg}`));
  }
  return {
    nr: 7,
    titel: 'Zuordnung der Matrix-Merkmale zu Tausch oder Hilfe (Task C1)',
    einleitung: [
      'Je Zeile von `data/teilgruppen.json` der Vergleich mit `fmt2-regelsatz.json` (Antwort, Text „wohin“, Grundlage) und der Vorschlag. Dazu die Matrix-Kategorien mit abweichenden Werten, die keine Zeile nennt und die deshalb die Antwort „sonst“ bekommen (Eingang 10).'
    ],
    info: [],
    eintraege
  };
}

/** Part 8: inputs from earlier tasks (items 1 to 6; items 7 to 10 are folded into Parts 4, 1 and 7). */
export function teil8(D: FmtData): Teil {
  const eintraege: Eintrag[] = [];
  for (const e of EINGAENGE) {
    const b = D.bausteine.find((x) => x.kennung === e.kennung);
    if (!b) continue;
    eintraege.push(eintrag(8, e.id, e.kennung, e.feld, e.wert(b), e.vorschlag, `${e.punkt ? `Eingang ${e.punkt}. ` : 'Fund dieser Durchsicht. '}${e.beleg}`));
  }
  const psycho = D.bausteine.filter((b) => (b.aufgabe || []).includes('psychomotorik'));
  const zeilen = psycho.map((b) => {
    const txt = [...b.durchfuehrung, ...b.material];
    const hit = txt.filter((s) => TECHNIK_SUCHE.test(s));
    const ergebnis = EINGAENGE.some((e) => e.kennung === b.kennung && e.feld === 'fachbereich' && e.vorschlag.includes('nawi-technik'))
      ? 'Eintrag'
      : (b.fachbereich || []).includes('nawi-technik')
        ? 'trägt nawi-technik schon'
        : hit.length
          ? hit.every((s) => /ggf\./.test(s))
            ? 'nur „ggf.“ im Material, kein Bedarf'
            : 'Treffer ohne Technik-Bezug'
          : 'kein Treffer';
    return `| \`${b.kennung}\` | ${md(liste(b.fachbereich))} | ${md(hit.map(zitat).join('; ') || '–')} | ${ergebnis} |`;
  });
  return {
    nr: 8,
    titel: 'Eingänge aus früheren Tasks',
    einleitung: [
      'Punkte aus den Paketen A, B und C (`b5-eingaenge.md`). Eingang 7 steht in Teil 4, Eingänge 8 und 9 in Teil 1, Eingang 10 in Teil 7. Dazu ein Fund dieser Durchsicht (Geltung der Evidenz beim Freispiel).'
    ],
    info: [
      `Eingang 1, geprüft je Methode: die ${psycho.length} Methoden mit Wissensart Psychomotorik, Suche nach Werkstatt, Werkzeug, Labor, Experiment, Löten, Bauteil, Präparat, Prototyp, Messgerät in Durchführung und Material.`,
      '',
      '| Methode | Fachbereich | Treffer | Ergebnis |',
      '|---|---|---|---|',
      ...zeilen
    ],
    eintraege
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Blocks, CSV, Markdown

/**
 * Split entries into blocks of about `groesse`, keeping all entries of one method together. Method groups come in
 * alphabetical order; the rule and matrix entries (Parts 1 and 7) close the last block.
 */
export function bloecke(eintraege: Eintrag[], groesse = BLOCKGROESSE): Eintrag[][] {
  const gruppen = new Map<string, Eintrag[]>();
  const schluessel = (e: Eintrag) => (e.teil === '1' || e.teil === '7' ? `~${e.teil}` : e.kennung);
  for (const e of eintraege) {
    const k = schluessel(e);
    if (!gruppen.has(k)) gruppen.set(k, []);
    gruppen.get(k)!.push(e);
  }
  const nachher = (k: string) => (k.startsWith('~') ? 1 : 0);
  const geordnet = [...gruppen.entries()].sort(([a], [b]) => nachher(a) - nachher(b) || a.localeCompare(b)).map(([, g]) => g);
  const anzahl = Math.max(1, Math.round(eintraege.length / groesse));
  const ziel = Math.ceil(eintraege.length / anzahl);
  const aus: Eintrag[][] = [[]];
  for (const g of geordnet) {
    const akt = aus[aus.length - 1];
    if (akt.length && akt.length + g.length > ziel && aus.length < anzahl) aus.push([...g]);
    else akt.push(...g);
  }
  return aus;
}

const csvFeld = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
export const zuCsv = (zeilen: Eintrag[]) => [SPALTEN.join(','), ...zeilen.map((z) => SPALTEN.map((k) => csvFeld(z[k])).join(','))].join('\n') + '\n';

/** Kind of a proposal, for the overview: dropped, stays with a reason, changes, stays as it is. */
export function art(e: Eintrag): 'weg' | 'grund' | 'neu' | 'gleich' {
  if (/^(entfällt|streichen)/.test(e.vorschlag)) return 'weg';
  if (/eignungsgrund\./.test(e.vorschlag)) return 'grund';
  if (/^(bleibt\b|bleibt bei sonst|Lesart „nur“ bleibt|Kodierung bleibt|raumbedarf bleibt leer|Wissensart bleibt leer)/.test(e.vorschlag) || /^eintragsart bleibt methode(; nachbedingung bleibt leer.*)?$/.test(e.vorschlag)) return 'gleich';
  return 'neu';
}

export function bauMarkdown(D: FmtData, teile: Teil[], bl: Eintrag[][]): string {
  const name = nameVon(D);
  const alle = teile.flatMap((t) => t.eintraege);
  const zahl = (t: Teil, f: (e: Eintrag) => boolean) => t.eintraege.filter(f).length;
  const aus: string[] = [
    '# Durchsicht 2: Eignung (Datenvorschlag 2, Tor D2)',
    '',
    `Erzeugt mit \`packages/fmt-core/scripts/vorschlag-fmt2-eignung.ts\` aus \`data/\` (${D.bausteine.length} Methoden, ${D.regeln.length} Regeln). Das Skript ändert keine Datendatei. Dieselben ${alle.length} Einträge stehen maschinenlesbar in \`pruefung/d2/eintraege.csv\` und aufgeteilt in ${bl.length} Blöcke \`pruefung/d2/block-N.csv\`; die Spalten \`entscheidung\` und \`pruefnotiz\` sind leer.`,
    '',
    '**Vorsichtige Lesart** (Design 12): kein Bedarf und keine Eignungswarnung ohne Beleg in Durchführung, Material oder einer Quelle; ein Eintrag bleibt nur mit Beleg. Grundlagen: E belegt, S gefolgert, A Annahme oder Setzung.',
    '',
    '**Format des Vorschlags.** „entfällt“: eine Regel deckt die Lage oder es gibt keinen Beleg. „streichen“: der Eintrag fällt weg. „feld=wert; eignungsgrund.art: Grundlage – Text (Quelle)“: der Eintrag bleibt mit dieser Begründung.',
    '',
    '## Übersicht',
    '',
    '| Teil | Inhalt | Einträge | entfällt oder streichen | bleibt mit Begründung | ändert | bleibt unverändert |',
    '|---|---|---|---|---|---|---|'
  ];
  const summe = { weg: 0, grund: 0, neu: 0, gleich: 0 };
  for (const t of teile) {
    const n = { weg: zahl(t, (e) => art(e) === 'weg'), grund: zahl(t, (e) => art(e) === 'grund'), neu: zahl(t, (e) => art(e) === 'neu'), gleich: zahl(t, (e) => art(e) === 'gleich') };
    for (const k of Object.keys(summe) as (keyof typeof summe)[]) summe[k] += n[k];
    aus.push(`| ${t.nr} | ${md(t.titel.replace(/`/g, ''))} | ${t.eintraege.length} | ${n.weg} | ${n.grund} | ${n.neu} | ${n.gleich} |`);
  }
  aus.push(`| | gesamt | ${alle.length} | ${summe.weg} | ${summe.grund} | ${summe.neu} | ${summe.gleich} |`, '', '| Block | Einträge | Methoden und Gruppen |', '|---|---|---|');
  bl.forEach((b, i) => aus.push(`| block-${i + 1}.csv | ${b.length} | ${new Set(b.map((e) => (e.teil === '1' || e.teil === '7' ? `Teil ${e.teil}` : e.kennung))).size} |`));
  for (const t of teile) {
    aus.push('', `## Teil ${t.nr}: ${t.titel}`, '', ...t.einleitung, '');
    if (t.info.length) aus.push(...t.info, '');
    if (t.eintraege.length) {
      aus.push('| Eintrag | Methode | Feld | heute | Vorschlag | Beleg |', '|---|---|---|---|---|---|');
      for (const e of t.eintraege) aus.push(`| ${e.eintrag} | ${md(name(e.kennung))} | ${md(e.feld)} | ${md(e.wert_alt)} | ${md(e.vorschlag)} | ${md(e.beleg)} |`);
    }
  }
  aus.push('');
  return aus.join('\n');
}

export function alleTeile(D: FmtData, einwaende: Record<string, { einwand: string; pruefnotiz: string }>, regelsatz: Parameters<typeof teil7>[1]): Teil[] {
  return [teil1(D), teil2(D), teil3(D), teil4(D, einwaende), teil5(D), teil6(D), teil7(D, regelsatz), teil8(D)];
}

// ---- main ----

function main() {
  const dataDir = path.resolve(process.argv[2] || path.join(ROOT, 'data'));
  const out = path.resolve(process.argv[3] || '/mnt/project-files/fmt2');
  const regelsatzPfad = process.argv[4] || '/mnt/project-files/fmt2/quellen/fmt2-vorschlag/fmt2-regelsatz.json';
  const eingangPfad = process.argv[5] || '/mnt/project-files/fmt2/pruefung/tor-D2-eingang-fach.csv';

  const D = loadFmtData(dataDir);
  const regelsatz = fs.existsSync(regelsatzPfad) ? JSON.parse(fs.readFileSync(regelsatzPfad, 'utf8')) : null;
  const einwaende = fs.existsSync(eingangPfad)
    ? Object.fromEntries(parseCsv(fs.readFileSync(eingangPfad, 'utf8')).map((r) => [r.kennung, { einwand: r.einwand, pruefnotiz: r.pruefnotiz }]))
    : {};
  if (!regelsatz) console.warn(`Regelsatz fehlt: ${regelsatzPfad} (Teil 7 ohne Vergleich)`);
  if (!Object.keys(einwaende).length) console.warn(`Einwände fehlen: ${eingangPfad} (Teil 4 ohne zweite Meinung)`);

  const teile = alleTeile(D, einwaende, regelsatz);
  const alle = teile.flatMap((t) => t.eintraege);
  const ids = new Set<string>();
  for (const e of alle) {
    if (ids.has(e.eintrag)) throw new Error(`Eintrag doppelt: ${e.eintrag}`);
    ids.add(e.eintrag);
  }
  const bl = bloecke(alle);
  const d2 = path.join(out, 'pruefung', 'd2');
  fs.mkdirSync(d2, { recursive: true });
  fs.writeFileSync(path.join(out, 'durchsicht-2-eignung.md'), bauMarkdown(D, teile, bl));
  fs.writeFileSync(path.join(d2, 'eintraege.csv'), zuCsv(alle));
  bl.forEach((b, i) => fs.writeFileSync(path.join(d2, `block-${i + 1}.csv`), zuCsv(b)));
  console.log(`${alle.length} Einträge (${teile.map((t) => `Teil ${t.nr}: ${t.eintraege.length}`).join(', ')}), ${bl.length} Blöcke (${bl.map((b) => b.length).join(', ')}) nach ${out}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
