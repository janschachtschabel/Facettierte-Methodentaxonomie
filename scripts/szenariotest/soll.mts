// Yardstick of the condition checker (Task P0.1, spec E12): what each of the 56 requests of szenarien.mts really says.
// Written from the request text (szenarien.mts, field `p`) and the report docs/qualitaet/2026-11-27-szenariotest.md,
// never from an engine answer. Status per value as in spec E3: „genannt“ = the request states it (a field, or words of
// the text; sorting a stated value into its vocabulary class, e.g. Klasse 8 → sek1 or Fach Religion → gesellschaft by
// data/crosswalk/oeh-faecher.json, counts as stated), „abgeleitet“ = a rule gains it from another stated value
// (Sporthalle from Fach Sport, no writing from Klasse 1–2, subject area from a topic word).
//
// PRÜFSTAND: ungeprüft. Ruling 17 of docs/superpowers/plans/2026-11-27-fmt21.md: the independent gate reviewer signs
// this file off once; until then every result that rests on it is preliminary. Later changes only with a reason
// written next to the changed entry.
export const SOLL_PRUEFSTAND = 'ungeprüft' as const;

export type Status = 'genannt' | 'abgeleitet';
export interface Angabe<T> {
  wert: T;
  status: Status;
  /** Other vocabulary ids the yardstick accepts for the same words (e.g. „Werkstatt“ is werkraum or fachraum). */
  auch?: T[];
}
/** Anlass as named in spec E1. */
export type Anlass = 'einfuehrung' | 'uebung' | 'wiederholung' | 'pruefung' | 'pruefungsvorbereitung' | 'projekt' | 'training' | 'unterweisung' | 'erkundung';
export interface Kernhandlung {
  /** Words of the request; a free phase passes B3 when its title contains them. */
  wortlaut: string;
  /** Accepted method ids; 'frei' = the catalogue holds no fitting method, only a free phase passes. */
  methoden: string[] | 'frei';
  status: Status;
}
export interface SollTeilgruppe {
  id: string;
  merkmal: string;
  /** A rule of the table „Tausch oder Hilfe“ applies to this group in this lesson (spec E10). */
  regelGreift: boolean;
}
export interface Soll {
  nr: number;
  id: string;
  zeitMin: Angabe<number> | null;
  gruppe: Angabe<number> | null;
  raumtyp: Angabe<string> | null;
  klassenstufe: number | null;
  bildungsstufe: Angabe<string> | null;
  fachbereich: Angabe<string> | null;
  anlass: { wert: Anlass; beleg: string } | null;
  kernhandlung: Kernhandlung | null;
  /** Writing the class does without: stated, or derived from Klasse 1–2 without a writing goal (spec E6). */
  ohneSchrift: { werte: Array<'lesen' | 'schreiben'>; status: Status } | null;
  /** The goal is reading or writing itself (then Klasse 1–2 derives no ohneSchrift). */
  zielSchrift: boolean;
  /** Named subgroups (request field `gruppen`, or a group the text states); ids as in the request. */
  teilgruppen: SollTeilgruppe[];
  /** Room type with danger after spec E9 and ruling 10. */
  gefahrRaum: boolean;
  /** 'rueckfrage': spec E3 „Kein Plan“ (goal or three required details missing) – questions instead of a standard plan. */
  erwarteterModus: 'ablauf' | 'phase' | 'rueckfrage';
  notiz?: string;
}

const g = <T,>(wert: T, auch?: T[]): Angabe<T> => (auch ? { wert, status: 'genannt', auch } : { wert, status: 'genannt' });
const a = <T,>(wert: T, auch?: T[]): Angabe<T> => (auch ? { wert, status: 'abgeleitet', auch } : { wert, status: 'abgeleitet' });
const KEINE: SollTeilgruppe[] = [];
const KLASSE = (id = 'regel'): SollTeilgruppe => ({ id, merkmal: 'Rest der Klasse, kein Merkmal', regelGreift: false });
const DAZ: SollTeilgruppe = { id: 'daz', merkmal: 'Sprachkompetenz gering (DaZ)', regelGreift: true };
const FOERDER: SollTeilgruppe = { id: 'foerder', merkmal: 'Förderbedarf Lernen (Persona)', regelGreift: true };
const STARK: SollTeilgruppe = { id: 'stark', merkmal: 'leistungsstark (Persona)', regelGreift: true };
const LESEN: SollTeilgruppe = { id: 'lesen', merkmal: 'ohne Lesen (Förderbedarf Lesen)', regelGreift: true };
const OHNE_SCHRIFT_KL12 = { werte: ['lesen', 'schreiben'] as Array<'lesen' | 'schreiben'>, status: 'abgeleitet' as const };
const OHNE_SCHRIFT_GENANNT = { werte: ['lesen', 'schreiben'] as Array<'lesen' | 'schreiben'>, status: 'genannt' as const };
const DISKUSSION = ['fishbowl', 'dilemmadiskussion', 'sokratisches-gespraech', 'podiumsdiskussion', 'lehrgespraech'];

export const SOLL: Soll[] = [
  // Grundschule
  { nr: 1, id: 'gs1-mathe-zerlegen-20', zeitMin: g(20), gruppe: g(22), raumtyp: g('klassenraum'), klassenstufe: 1, bildungsstufe: g('primar'), fachbereich: g('mathe-informatik'), anlass: null, kernhandlung: null, ohneSchrift: OHNE_SCHRIFT_KL12, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'ablauf', notiz: '„mit Plättchen“ nennt Material, keine Arbeitsform; daher keine Kernhandlung.' },
  { nr: 2, id: 'gs1-deutsch-anlaute-ohneschrift', zeitMin: g(45), gruppe: g(24), raumtyp: g('klassenraum'), klassenstufe: null, bildungsstufe: g('primar'), fachbereich: g('sprachen'), anlass: null, kernhandlung: null, ohneSchrift: OHNE_SCHRIFT_GENANNT, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'ablauf', notiz: 'Klasse 1 steht nur in der Kurzbeschreibung, nicht in der Anfrage. Anlaute hören ist Vorläufer der Schrift, kein Lese- oder Schreibziel.' },
  { nr: 3, id: 'gs3-sachunterricht-draussen', zeitMin: g(45), gruppe: g(25), raumtyp: g('draussen'), klassenstufe: 3, bildungsstufe: g('primar'), fachbereich: g('nawi-technik'), anlass: { wert: 'erkundung', beleg: 'auf dem Schulhof … bestimmen, draußen' }, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: true, erwarteterModus: 'ablauf', notiz: 'Außengelände einer Schule: Hinweis zur Aufsicht (E9, ruling 10c).' },
  { nr: 4, id: 'gs4-englisch-wortschatz-10', zeitMin: g(10), gruppe: g(26), raumtyp: null, klassenstufe: 4, bildungsstufe: g('primar'), fachbereich: g('sprachen'), anlass: { wert: 'wiederholung', beleg: 'wiederholen' }, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'phase', notiz: '10 Minuten: einzelne Phase (Bericht Nr. 4).' },
  { nr: 5, id: 'gs2-sport-werfen', zeitMin: g(45), gruppe: g(24), raumtyp: g('bewegungsraum'), klassenstufe: 2, bildungsstufe: g('primar'), fachbereich: g('sport'), anlass: null, kernhandlung: null, ohneSchrift: OHNE_SCHRIFT_KL12, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: true, erwarteterModus: 'ablauf' },
  { nr: 6, id: 'gs4-musik-bodypercussion', zeitMin: g(45), gruppe: g(25), raumtyp: g('musikraum'), klassenstufe: 4, bildungsstufe: g('primar'), fachbereich: g('aesthetik'), anlass: { wert: 'uebung', beleg: 'einüben' }, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'ablauf', notiz: 'Musikraum steht nicht in der Tabelle E9 (ruling 10a).' },
  { nr: 7, id: 'gs3-kunst-drucken-90', zeitMin: g(90), gruppe: g(23), raumtyp: g('werkraum'), klassenstufe: null, bildungsstufe: g('primar'), fachbereich: g('aesthetik'), anlass: null, kernhandlung: { wortlaut: 'Kartoffeldruck', methoden: ['gestaltungsaufgabe-gruppen'], status: 'genannt' }, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: true, erwarteterModus: 'ablauf', notiz: 'Werkraum mit Kernhandlung, die Werkzeug verlangt (Messer zum Schneiden der Druckstöcke): Hinweis (ruling 10b). Klasse 3 steht nur in der Kurzbeschreibung.' },
  { nr: 8, id: 'gs2-religion-samariter', zeitMin: g(45), gruppe: g(21), raumtyp: null, klassenstufe: 2, bildungsstufe: g('primar'), fachbereich: g('gesellschaft'), anlass: null, kernhandlung: { wortlaut: 'Erzählkreis', methoden: 'frei', status: 'genannt' }, ohneSchrift: OHNE_SCHRIFT_KL12, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'ablauf', notiz: 'Fach Religion (nicht Geschichte). Erzählkreis fehlt dem Katalog (Spec „Fehlende Einträge“); bis er kommt, besteht nur eine freie Phase.' },
  { nr: 9, id: 'gs4-mathe-teilgruppen', zeitMin: g(45), gruppe: g(26), raumtyp: g('klassenraum'), klassenstufe: null, bildungsstufe: g('primar'), fachbereich: g('mathe-informatik'), anlass: { wert: 'uebung', beleg: 'üben' }, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: [KLASSE(), DAZ, FOERDER], gefahrRaum: false, erwarteterModus: 'ablauf' },
  // Sek I
  { nr: 10, id: 's1-mathe-linfkt-einstieg', zeitMin: g(45), gruppe: g(28), raumtyp: g('klassenraum'), klassenstufe: 8, bildungsstufe: g('sek1'), fachbereich: a('mathe-informatik'), anlass: { wert: 'einfuehrung', beleg: 'Einstieg in' }, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'ablauf', notiz: 'Kein Fach genannt; Mathematik folgt aus dem Thema „lineare Funktionen“.' },
  { nr: 11, id: 's1-deutsch-sachtext-gruppen', zeitMin: g(45), gruppe: g(27), raumtyp: g('klassenraum'), klassenstufe: null, bildungsstufe: g('sek1'), fachbereich: g('sprachen'), anlass: null, kernhandlung: null, ohneSchrift: null, zielSchrift: true, teilgruppen: [KLASSE(), LESEN, DAZ], gefahrRaum: false, erwarteterModus: 'ablauf', notiz: 'Sachtexte erschließen ist ein Leseziel; die Gruppe „lesen“ braucht Leseentlastung oder Tausch.' },
  { nr: 12, id: 's1-englisch-rollenspiel', zeitMin: g(45), gruppe: g(30), raumtyp: null, klassenstufe: 7, bildungsstufe: g('sek1'), fachbereich: g('sprachen'), anlass: { wert: 'uebung', beleg: 'Sprechen üben' }, kernhandlung: { wortlaut: 'Rollenspiel', methoden: ['rollenspiel'], status: 'genannt' }, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'ablauf' },
  { nr: 13, id: 's1-bio-mikroskop-90', zeitMin: g(90), gruppe: g(28), raumtyp: g('fachraum-nawi'), klassenstufe: 6, bildungsstufe: g('sek1'), fachbereich: g('nawi-technik'), anlass: null, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: true, erwarteterModus: 'ablauf', notiz: 'Mikroskopieren ist der Lerngegenstand (Handgriff, E8), keine eigens genannte Arbeitsform.' },
  { nr: 14, id: 's1-chemie-verbrennung', zeitMin: g(45), gruppe: g(24), raumtyp: g('fachraum-nawi'), klassenstufe: null, bildungsstufe: g('sek1'), fachbereich: g('nawi-technik'), anlass: null, kernhandlung: { wortlaut: 'Schülerversuch', methoden: ['experiment'], status: 'genannt' }, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: true, erwarteterModus: 'ablauf' },
  { nr: 15, id: 's1-physik-stromkreis-problem', zeitMin: g(45), gruppe: g(26), raumtyp: g('fachraum-nawi'), klassenstufe: 7, bildungsstufe: g('sek1'), fachbereich: g('nawi-technik'), anlass: null, kernhandlung: { wortlaut: 'Fehlersuche', methoden: ['fehleranalyse'], status: 'genannt' }, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: true, erwarteterModus: 'ablauf', notiz: 'Physikraum = Fachraum Naturwissenschaften.' },
  { nr: 16, id: 's1-geschichte-karikatur', zeitMin: g(45), gruppe: g(25), raumtyp: null, klassenstufe: 9, bildungsstufe: g('sek1'), fachbereich: g('gesellschaft'), anlass: null, kernhandlung: { wortlaut: 'Karikaturen', methoden: ['karikatur-bildanalyse', 'quellenkritik-check'], status: 'genannt' }, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'ablauf', notiz: 'Wortlaut der Anfrage: „Quellenarbeit mit Karikaturen“.' },
  { nr: 17, id: 's1-politik-wahlalter-urteil', zeitMin: g(90), gruppe: g(28), raumtyp: g('klassenraum'), klassenstufe: null, bildungsstufe: g('sek1'), fachbereich: g('gesellschaft'), anlass: null, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'ablauf' },
  { nr: 18, id: 's1-ethik-luegen-diskussion', zeitMin: g(45), gruppe: g(22), raumtyp: g('klassenraum'), klassenstufe: 8, bildungsstufe: g('sek1'), fachbereich: g('gesellschaft'), anlass: null, kernhandlung: { wortlaut: 'Diskussion', methoden: DISKUSSION, status: 'genannt' }, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'ablauf' },
  { nr: 19, id: 's1-kunst-linolschnitt', zeitMin: g(90), gruppe: g(26), raumtyp: g('werkraum'), klassenstufe: 7, bildungsstufe: g('sek1'), fachbereich: g('aesthetik'), anlass: null, kernhandlung: { wortlaut: 'Linolschnitt', methoden: ['gestaltungsaufgabe-gruppen'], status: 'genannt' }, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: true, erwarteterModus: 'ablauf', notiz: 'Kunstraum mit Schneidwerkzeug (Linolmesser): Hinweis (ruling 10b).' },
  { nr: 20, id: 's1-musik-songwriting-tablets', zeitMin: g(90), gruppe: g(24), raumtyp: null, klassenstufe: 9, bildungsstufe: g('sek1'), fachbereich: g('aesthetik'), anlass: null, kernhandlung: { wortlaut: 'Songwriting', methoden: 'frei', status: 'genannt' }, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'ablauf', notiz: 'Keine Songwriting-Methode im Katalog; nur eine freie Phase besteht.' },
  { nr: 21, id: 's1-sport-ausdauer-draussen', zeitMin: g(45), gruppe: g(28), raumtyp: g('draussen'), klassenstufe: null, bildungsstufe: g('sek1'), fachbereich: g('sport'), anlass: { wert: 'training', beleg: 'Ausdauerlauf … durchlaufen lernen (Zielart Kondition)' }, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: true, erwarteterModus: 'ablauf', notiz: '„20 Minuten“ im Thema ist die Laufdauer, nicht die Zeitvorgabe (Feld zeitMin 45).' },
  { nr: 22, id: 's1-sport-bodenturnen-90', zeitMin: g(90), gruppe: g(26), raumtyp: g('bewegungsraum'), klassenstufe: 7, bildungsstufe: g('sek1'), fachbereich: g('sport'), anlass: null, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: true, erwarteterModus: 'ablauf' },
  { nr: 23, id: 's1-informatik-scratch', zeitMin: g(45), gruppe: g(24), raumtyp: g('computerraum'), klassenstufe: 8, bildungsstufe: g('sek1'), fachbereich: g('mathe-informatik'), anlass: null, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'ablauf', notiz: 'Programmieren in Scratch ist der Lerngegenstand, keine eigens genannte Arbeitsform.' },
  { nr: 24, id: 's1-informatik-unplugged', zeitMin: g(45), gruppe: g(25), raumtyp: g('klassenraum'), klassenstufe: null, bildungsstufe: g('sek1'), fachbereich: g('mathe-informatik'), anlass: null, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'ablauf' },
  { nr: 25, id: 's1-wirtschaft-budget', zeitMin: g(45), gruppe: null, raumtyp: null, klassenstufe: 9, bildungsstufe: g('sek1'), fachbereich: g('gesellschaft', ['beruf-praxis']), anlass: null, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'ablauf', notiz: 'Wirtschaft(skunde) ist im Crosswalk Gesellschaft; „Wirtschaft und Verwaltung“ wäre Beruf und Praxis.' },
  { nr: 26, id: 's1-mathe-bruch-test', zeitMin: g(45), gruppe: g(27), raumtyp: null, klassenstufe: 6, bildungsstufe: g('sek1'), fachbereich: g('mathe-informatik'), anlass: { wert: 'pruefung', beleg: 'schriftlicher Test mit Note' }, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'ablauf' },
  { nr: 27, id: 's1-mathe-pythagoras-gruppen', zeitMin: g(45), gruppe: g(29), raumtyp: g('klassenraum'), klassenstufe: null, bildungsstufe: g('sek1'), fachbereich: g('mathe-informatik'), anlass: { wert: 'uebung', beleg: 'Übungsstunde' }, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: [KLASSE(), STARK, FOERDER], gefahrRaum: false, erwarteterModus: 'ablauf' },
  { nr: 28, id: 's1-franz-vokabeln-10', zeitMin: g(10), gruppe: g(27), raumtyp: null, klassenstufe: 8, bildungsstufe: g('sek1'), fachbereich: g('sprachen'), anlass: { wert: 'wiederholung', beleg: 'Wiederholung' }, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'phase' },
  { nr: 29, id: 's1-erdkunde-distanz', zeitMin: g(45), gruppe: g(26), raumtyp: g('digital'), klassenstufe: 7, bildungsstufe: g('sek1'), fachbereich: g('gesellschaft'), anlass: null, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'ablauf', notiz: 'Erdkunde/Geografie ist im Crosswalk Gesellschaft.' },
  // Sek II
  { nr: 30, id: 's2-deutsch-gedicht-90', zeitMin: g(90), gruppe: g(20), raumtyp: null, klassenstufe: null, bildungsstufe: g('sek2'), fachbereich: g('sprachen'), anlass: null, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'ablauf', notiz: 'Q1 = Qualifikationsphase der Oberstufe.' },
  { nr: 31, id: 's2-mathe-kurvendiskussion', zeitMin: g(90), gruppe: g(18), raumtyp: g('klassenraum'), klassenstufe: null, bildungsstufe: g('sek2'), fachbereich: g('mathe-informatik'), anlass: { wert: 'uebung', beleg: 'üben' }, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'ablauf' },
  { nr: 32, id: 's2-bio-genetik-digital', zeitMin: g(45), gruppe: g(22), raumtyp: g('digital'), klassenstufe: null, bildungsstufe: g('sek2'), fachbereich: g('nawi-technik'), anlass: null, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'ablauf' },
  { nr: 33, id: 's2-geschichte-projekttag', zeitMin: null, gruppe: g(20), raumtyp: null, klassenstufe: null, bildungsstufe: g('sek2'), fachbereich: g('gesellschaft'), anlass: { wert: 'projekt', beleg: 'Projekttag' }, kernhandlung: { wortlaut: 'Zeitzeugeninterview', methoden: 'frei', status: 'genannt' }, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'ablauf', notiz: 'Keine Minuten genannt; „Projekttag“ ergibt 270 Minuten als Annahme (ruling 7). Keine Interviewmethode für Zeitzeugen im Katalog.' },
  { nr: 34, id: 's2-philo-kant-urteil', zeitMin: g(45), gruppe: g(16), raumtyp: g('klassenraum'), klassenstufe: null, bildungsstufe: g('sek2'), fachbereich: g('gesellschaft'), anlass: null, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'ablauf' },
  { nr: 35, id: 's2-chemie-fakten-20', zeitMin: g(20), gruppe: g(19), raumtyp: null, klassenstufe: null, bildungsstufe: g('sek2'), fachbereich: g('nawi-technik'), anlass: { wert: 'wiederholung', beleg: 'Wiederholung' }, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'ablauf' },
  // Berufsschule und Betrieb
  { nr: 36, id: 'bs-pflege-transfer', zeitMin: g(90), gruppe: g(16), raumtyp: g('fachraum'), klassenstufe: null, bildungsstufe: g('berufsbildung'), fachbereich: g('beruf-praxis'), anlass: { wert: 'uebung', beleg: 'üben' }, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: true, erwarteterModus: 'ablauf', notiz: 'Skills Lab = Fachraum. „Rollstuhl“ ist Thema, keine Teilgruppe (E3).' },
  { nr: 37, id: 'bs-kfz-bremsen', zeitMin: g(90), gruppe: g(12), raumtyp: g('fachraum', ['werkraum']), klassenstufe: null, bildungsstufe: g('berufsbildung'), fachbereich: g('beruf-praxis'), anlass: null, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: true, erwarteterModus: 'ablauf', notiz: 'Werkstatt: E9 „ja“; das Vokabular führt das Wort unter fachraum und werkraum.' },
  { nr: 38, id: 'bs-einzelhandel-reklamation', zeitMin: g(45), gruppe: g(24), raumtyp: null, klassenstufe: null, bildungsstufe: g('berufsbildung'), fachbereich: g('beruf-praxis'), anlass: null, kernhandlung: { wortlaut: 'Rollenspiel', methoden: ['rollenspiel'], status: 'genannt' }, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'ablauf' },
  { nr: 39, id: 'bs-gastro-saucen', zeitMin: g(180), gruppe: g(14), raumtyp: g('lehrkueche'), klassenstufe: null, bildungsstufe: g('berufsbildung'), fachbereich: g('beruf-praxis'), anlass: null, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: true, erwarteterModus: 'ablauf', notiz: 'Kein Fach-Feld; „Köche … Lehrjahr“ nennt den Ausbildungsberuf.' },
  { nr: 40, id: 'bs-it-netzwerk-ohneinternet', zeitMin: g(90), gruppe: g(20), raumtyp: g('computerraum'), klassenstufe: null, bildungsstufe: g('berufsbildung'), fachbereich: g('mathe-informatik', ['beruf-praxis']), anlass: null, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'ablauf' },
  { nr: 41, id: 'betrieb-kasse-unterweisung', zeitMin: g(20), gruppe: g(4), raumtyp: g('ausserschulisch'), klassenstufe: null, bildungsstufe: g('berufsbildung'), fachbereich: g('beruf-praxis'), anlass: { wert: 'unterweisung', beleg: 'Unterweisung im Betrieb' }, kernhandlung: { wortlaut: 'Unterweisung', methoden: ['vier-stufen-methode'], status: 'abgeleitet' }, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'ablauf', notiz: 'Anlass Unterweisung → Kernhandlung Vier-Stufen-Methode (E1). Arbeitsplatz im Betrieb: kein Hinweis (ruling 10c, Nr. 41).' },
  { nr: 42, id: 'bs-wirtschaft-pruefungsvorb', zeitMin: g(90), gruppe: g(22), raumtyp: null, klassenstufe: null, bildungsstufe: g('berufsbildung'), fachbereich: g('beruf-praxis', ['gesellschaft']), anlass: { wert: 'pruefungsvorbereitung', beleg: 'Prüfungsvorbereitung' }, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'ablauf' },
  // Hochschule
  { nr: 43, id: 'hs-vorlesung-statistik-250', zeitMin: g(90), gruppe: g(250), raumtyp: g('hoersaal'), klassenstufe: null, bildungsstufe: g('hochschule'), fachbereich: g('mathe-informatik'), anlass: { wert: 'einfuehrung', beleg: 'einführen' }, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'ablauf', notiz: '„Vorlesung“ nennt die Veranstaltungsform (Rahmen), keine Kernhandlung.' },
  { nr: 44, id: 'hs-seminar-soziologie-12', zeitMin: g(90), gruppe: g(12), raumtyp: null, klassenstufe: null, bildungsstufe: g('hochschule'), fachbereich: g('gesellschaft'), anlass: null, kernhandlung: { wortlaut: 'Textdiskussion', methoden: 'frei', status: 'genannt' }, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'ablauf', notiz: 'Textgespräch fehlt dem Katalog (Spec „Fehlende Einträge“).' },
  { nr: 45, id: 'hs-bwl-fallstudie-online', zeitMin: g(90), gruppe: g(40), raumtyp: g('digital'), klassenstufe: null, bildungsstufe: g('hochschule'), fachbereich: g('gesellschaft'), anlass: null, kernhandlung: { wortlaut: 'Fallstudie', methoden: ['case-based-learning'], status: 'genannt' }, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'ablauf', notiz: 'fallstudie selbst hat Reichweite r3 (Rahmen); als Phase passt case-based-learning.' },
  { nr: 46, id: 'hs-labor-titration', zeitMin: g(180), gruppe: g(16), raumtyp: g('fachraum-nawi'), klassenstufe: null, bildungsstufe: g('hochschule'), fachbereich: g('nawi-technik'), anlass: null, kernhandlung: { wortlaut: 'Titration', methoden: ['experiment', 'praxisauftrag-arbeitsplatz'], status: 'genannt' }, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: true, erwarteterModus: 'ablauf', notiz: 'Laborpraktikum: Studierende titrieren selbst.' },
  // Erwachsenenbildung
  { nr: 47, id: 'vhs-alpha-einkaufen', zeitMin: g(90), gruppe: g(8), raumtyp: g('klassenraum'), klassenstufe: null, bildungsstufe: g('erwachsenenbildung'), fachbereich: g('sprachen'), anlass: null, kernhandlung: null, ohneSchrift: OHNE_SCHRIFT_GENANNT, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'ablauf', notiz: 'Alphabetisierungskurs (Sprachen); Ziel der Stunde ist Einkaufen und Preise, nicht Lesen oder Schreiben.' },
  { nr: 48, id: 'vhs-spanisch-a1', zeitMin: g(90), gruppe: g(10), raumtyp: null, klassenstufe: null, bildungsstufe: g('erwachsenenbildung'), fachbereich: g('sprachen'), anlass: null, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'ablauf' },
  { nr: 49, id: 'vhs-excel-4', zeitMin: g(90), gruppe: g(4), raumtyp: g('computerraum'), klassenstufe: null, bildungsstufe: g('erwachsenenbildung'), fachbereich: g('mathe-informatik'), anlass: null, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'ablauf' },
  { nr: 50, id: 'verein-rueckenfit-60', zeitMin: g(60), gruppe: g(15), raumtyp: g('bewegungsraum'), klassenstufe: null, bildungsstufe: g('erwachsenenbildung'), fachbereich: g('sport'), anlass: { wert: 'training', beleg: 'Rückenfit-Kurs …, Kräftigung der Rumpfmuskulatur' }, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: true, erwarteterModus: 'ablauf' },
  { nr: 51, id: 'integrationskurs-a2-arzt', zeitMin: g(90), gruppe: g(18), raumtyp: g('klassenraum'), klassenstufe: null, bildungsstufe: g('erwachsenenbildung'), fachbereich: g('sprachen'), anlass: null, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'ablauf' },
  // Vage und lückenhaft
  { nr: 52, id: 'vage-morgen', zeitMin: null, gruppe: null, raumtyp: null, klassenstufe: null, bildungsstufe: null, fachbereich: null, anlass: null, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'rueckfrage' },
  { nr: 53, id: 'vage-klimawandel', zeitMin: null, gruppe: null, raumtyp: null, klassenstufe: null, bildungsstufe: null, fachbereich: null, anlass: null, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'rueckfrage', notiz: 'Kein Fach genannt; „Klimawandel“ ist nur Thema (Fach Geografie wäre geraten).' },
  { nr: 54, id: 'luecke-mathe-45', zeitMin: g(45), gruppe: null, raumtyp: null, klassenstufe: null, bildungsstufe: null, fachbereich: g('mathe-informatik'), anlass: null, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'rueckfrage' },
  { nr: 55, id: 'luecke-nur-zielart', zeitMin: null, gruppe: null, raumtyp: null, klassenstufe: null, bildungsstufe: null, fachbereich: a('mathe-informatik'), anlass: null, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: false, erwarteterModus: 'rueckfrage', notiz: 'Vier Pflichtangaben fehlen (Stufe, Anzahl, Raum, Zeit).' },
  { nr: 56, id: 'luecke-sport-ohne-raum', zeitMin: g(45), gruppe: null, raumtyp: a('bewegungsraum'), klassenstufe: 5, bildungsstufe: g('sek1'), fachbereich: g('sport'), anlass: null, kernhandlung: null, ohneSchrift: null, zielSchrift: false, teilgruppen: KEINE, gefahrRaum: true, erwarteterModus: 'ablauf', notiz: 'Sporthalle folgt aus dem Fach Sport (abgeleitet, schließt nach E3 aus und zählt für E9).' }
];

export const sollFuer = (id: string): Soll => {
  const s = SOLL.find((x) => x.id === id);
  if (!s) throw new Error(`Kein Soll für Szenario ${id}`);
  return s;
};
