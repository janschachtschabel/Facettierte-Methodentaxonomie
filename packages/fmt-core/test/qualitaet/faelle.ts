/**
 * Quality test set: realistic teacher requests with the checks a didactic reviewer would apply.
 * Each case names only what must hold; the shared checks (valid plan, time logic, subject fit) run for every case.
 *
 * `bekannt` marks a weakness that depends on catalogue data (missing methods or chains). Such a check is reported
 * by the quality report but does not fail the test; the reason says which data proposal would fix it.
 */
export interface Qualitaetsfall {
  id: string;
  text: string;
  erwartet: {
    /** Expected mode; default 'ablauf'. */
    modus?: 'ablauf' | 'phase';
    /** Expected chain id. */
    kette?: string;
    /** Plan must end with a performance or learning check (lernstand-diagnostiziert in the last two phases). */
    leistungskontrolle?: boolean;
    /** Main phases must be movement or practice methods (sport, practical subjects). */
    praxis?: boolean;
    /** Named method that must be in the plan. */
    enthaelt?: string;
    /** Methods that must not be in the plan. */
    nicht?: string[];
    /** Interaction forms the request rules out ("keine Gruppenarbeit"): no method may rely on them alone. */
    ohneInteraktion?: string[];
    /** Approaches the request rules out ("ohne Experimente"): must not be read from the text. */
    ohneAnsatz?: string[];
    /** Values the reader must take from the text. */
    kriterien?: Record<string, unknown>;
    /** Values the reader must not take from the text. */
    nichtKriterien?: Record<string, unknown>;
    /** No method in the plan needs one of these room properties. */
    ohneRaumbedarf?: string[];
    /** No method in the plan needs learners to read or write ('liest' | 'schreibt'). */
    ohneSchriftbedarf?: string[];
    /** Every method in a main or securing step carries one of these knowledge types. */
    wissensartHaupt?: string[];
    /** Mandatory details the answer must report as missing. */
    pflichtFehlt?: string[];
    /** Fields the answer must report as assumed. */
    angenommen?: string[];
    /** Rule ids that must appear in regelmeldungen. */
    regeln?: string[];
    /** The check step uses a method of this form. */
    nachweisform?: string;
    /** Planning profile of the answer. */
    planungsprofil?: string;
    /** A companion strand for this companion goal is proposed. */
    begleitstrang?: string;
    /** Subgroup expectations, evaluated through adaptScenario. */
    teilgruppe?: { antwort: 'passt' | 'hilfe' | 'tausch'; gesperrt?: boolean; abbau?: boolean };
  };
  bekannt?: Partial<Record<Pruefung, string>>;
}

export type Pruefung =
  | 'gueltig'
  | 'modus'
  | 'kette'
  | 'zeit'
  | 'methodendauer'
  | 'fachpassung'
  | 'praxis'
  | 'leistungskontrolle'
  | 'enthaelt'
  | 'nicht'
  | 'verneinung'
  | 'kriterien'
  | 'bedarf'
  | 'bindung'
  | 'pflichtangaben'
  | 'regel'
  | 'nachweis'
  | 'profil'
  | 'begleitziel'
  | 'teilgruppe';

/** Data gap found by this test (see docs/qualitaet/2026-11-26-qualitaetsbericht.md, proposal S1). */
const LUECKE_ANWENDUNG =
  'Katalog hat keine kurze Spiel- oder Anwendungsform für Sport und Praxis (unter 15 min, liefert transfer-gezeigt); Datenvorschlag S1';

export const QUALITAETSFAELLE: Qualitaetsfall[] = [
  // Sport: the use case from the project thread and its variants.
  {
    id: 'sport-ausdauer-lk-45',
    text: 'Ich will ein Szenario unterstellen für den Sportunterricht 45 minuten - ausdauertraining mit anschließender leistungskontrolle',
    erwartet: { kette: 'kondition-training', leistungskontrolle: true, praxis: true, enthaelt: 'sportmotorischer-test', kriterien: { zielart: 'kondition' } } },
  { id: 'sport-ausdauer-45', text: 'Sport Klasse 6, 45 Minuten Ausdauertraining', erwartet: { kette: 'kondition-training', praxis: true } },
  {
    id: 'sport-basketball-lk-45',
    text: 'Sport Klasse 10: Leistungskontrolle Basketball Korbleger, 45 Minuten',
    erwartet: { kette: 'fertigkeit-bewegung', leistungskontrolle: true, praxis: true }, bekannt: { praxis: LUECKE_ANWENDUNG } },
  { id: 'sport-turnen-90', text: 'Sport Klasse 5 Turnen am Boden, Rolle vorwärts, 90 Minuten', erwartet: { kette: 'fertigkeit-bewegung', praxis: true } },
  // Five phases do not fit into 20 minutes: methods for one phase, movement methods first.
  { id: 'sport-fussball-20', text: 'Sport Klasse 8 Fußball Passspiel, 20 Minuten', erwartet: { modus: 'phase', praxis: true } },
  { id: 'sport-schwimmen-45', text: 'Sport Klasse 7, Schwimmen Kraulbeine, 45 Minuten', erwartet: { kette: 'fertigkeit-bewegung', praxis: true } },
  { id: 'sport-volleyball-45', text: 'Sport Klasse 9 Volleyball: oberes Zuspiel, 45 Minuten', erwartet: { kette: 'fertigkeit-bewegung', praxis: true } },
  { id: 'sport-tanz-90', text: 'Sport Klasse 9 Tanz: Choreografie entwickeln, 90 Minuten', erwartet: { kette: 'fertigkeit-bewegung', praxis: true } },
  {
    id: 'sport-zirkel-60-gs',
    text: 'Grundschule Klasse 3 Sport: Zirkeltraining Kraft und Koordination, 60 Minuten, 26 Kinder',
    erwartet: { kette: 'kondition-training', praxis: true, kriterien: { gruppe: 26, bildungsstufe: 'primar' } } },
  {
    id: 'sport-weitsprung-lk-90',
    text: 'Sport Klasse 8 Weitsprung mit Leistungsmessung am Ende, Doppelstunde',
    erwartet: { kette: 'fertigkeit-bewegung', leistungskontrolle: true, praxis: true, kriterien: { zeitMin: 90 } }
  },
  {
    id: 'sport-ausdauer-foerder-45',
    text: 'Sport Klasse 7 Ausdauerlauf, 45 Minuten, 24 Schüler, 2 Schüler mit Asthma',
    erwartet: { kette: 'kondition-training', praxis: true, kriterien: { gruppe: 24 } } },

  // Practical and arts subjects.
  { id: 'musik-rhythmus-45', text: 'Musik Klasse 5 Rhythmus klatschen und trommeln, 45 Minuten', erwartet: { praxis: true, kette: 'fertigkeit-bewegung' }, bekannt: { praxis: LUECKE_ANWENDUNG } },
  { id: 'kunst-malen-90', text: 'Kunst Klasse 7 Farbenlehre, Bild malen, 90 Minuten', erwartet: { kette: 'produktion' } },
  {
    id: 'berufsschule-reifen-90',
    text: 'Berufsschule Kfz-Mechatroniker: Reifenwechsel in der Werkstatt üben, 90 Minuten',
    erwartet: { praxis: true } },
  {
    id: 'pflege-unterweisung-60',
    text: 'Pflegeschule: Blutdruck messen nach der Vier-Stufen-Methode, 60 Minuten, 16 Auszubildende',
    erwartet: { enthaelt: 'vier-stufen-methode', praxis: true },
    bekannt: {
      praxis: LUECKE_ANWENDUNG,
      enthaelt: 'Vier-Stufen-Methode erlaubt höchstens 12 Personen; bei 16 Auszubildenden fehlt das Ausweichen in Teilgruppen'
    } },

  // Performance and learning checks in other subjects.
  {
    id: 'deutsch-lernkontrolle-45',
    text: 'Deutsch Klasse 6: Kurzgeschichten, 45 Minuten, mit abschließender Lernkontrolle',
    erwartet: { leistungskontrolle: true }
  },
  {
    id: 'physik-lernzielkontrolle-45',
    text: 'Physik Klasse 9 Ohmsches Gesetz, 45 Minuten, Lernzielkontrolle am Ende',
    erwartet: { leistungskontrolle: true }
  },
  { id: 'mathe-test-45', text: 'Mathe Klasse 9 Test zu quadratischen Funktionen, 45 Minuten', erwartet: { leistungskontrolle: true } },
  {
    id: 'englisch-vokabeltest-30',
    text: 'Englisch Klasse 6: Vokabeln Unit 3 wiederholen und am Ende kurzer Vokabeltest, 30 Minuten',
    erwartet: { modus: 'ablauf', leistungskontrolle: true }
  },

  // Typical lessons of various lengths and levels.
  { id: 'bio-fotosynthese-45', text: 'Biologie Klasse 8 Fotosynthese erarbeiten, 45 Minuten', erwartet: {} },
  { id: 'geschichte-weimar-90', text: 'Geschichte Klasse 10 Weimarer Republik, 90 Minuten', erwartet: {} },
  { id: 'politik-wahlrecht-90', text: 'Politik Klasse 11 Wahlrecht diskutieren, 90 Minuten', erwartet: { kette: 'urteilsbildung' } },
  { id: 'sachunterricht-wasser-45', text: 'Grundschule Klasse 2 Sachunterricht Wasser, 45 Minuten', erwartet: { kriterien: { bildungsstufe: 'primar' } } },
  { id: 'mathe-brueche-60', text: 'Mathe Klasse 6 Brüche addieren, 60 Minuten, 28 Schüler', erwartet: { kriterien: { gruppe: 28 } } },
  {
    id: 'informatik-scratch-45',
    text: 'Informatik Klasse 8 Programmieren mit Scratch, 45 Minuten, Computerraum',
    erwartet: { kette: 'produktion', kriterien: { maxTechnik: 't-einzeln' } }
  },
  { id: 'hochschule-statistik-90', text: 'Hochschule Vorlesung Statistik: Hypothesentests, 180 Studierende, 90 Minuten', erwartet: {} },
  {
    id: 'evb-zeitmanagement-60',
    text: 'Volkshochschule Kurs Zeitmanagement für Berufstätige, 60 Minuten, 12 Teilnehmende',
    erwartet: { kriterien: { bildungsstufe: 'erwachsenenbildung', gruppe: 12 } }
  },
  { id: 'chemie-saeuren-20', text: 'Chemie Klasse 9 Säuren und Basen wiederholen, 20 Minuten', erwartet: { modus: 'phase' } },
  { id: 'erdkunde-klima-30', text: 'Erdkunde Klasse 7 Klimazonen, 30 Minuten', erwartet: { modus: 'phase' } },

  // Negations.
  {
    id: 'neg-gruppenarbeit-60',
    text: 'Geschichte Klasse 10 Weimarer Republik, 60 Minuten, keine Gruppenarbeit',
    erwartet: { ohneInteraktion: ['kleingruppe-kooperativ'], ohneAnsatz: ['kooperativ'], nichtKriterien: { interaktion: ['kleingruppe-kooperativ'] } }
  },
  {
    id: 'neg-partner-gruppe-45',
    text: 'Deutsch Klasse 8 Gedichte, 45 Minuten, keine Partnerarbeit und keine Gruppenarbeit',
    erwartet: { ohneInteraktion: ['partner', 'kleingruppe-kooperativ'], ohneAnsatz: ['kooperativ'] }
  },
  {
    id: 'neg-experimente-90',
    text: 'Chemie Klasse 9 Säuren und Basen, 90 Minuten, ohne Experimente',
    erwartet: { ohneAnsatz: ['forschend'], nicht: ['experiment', 'demonstrationsexperiment'] }
  },
  {
    id: 'neg-tablets-45',
    text: 'Mathe Klasse 6 Bruchrechnen ohne Tablets, 45 Minuten',
    erwartet: { kriterien: { maxTechnik: 't-keine' } }
  },
  {
    id: 'neg-diskussion-45',
    text: 'Ethik Klasse 9 Freundschaft, 45 Minuten, bitte keine Diskussion im Plenum',
    erwartet: { ohneAnsatz: ['diskurs'] }
  },

  // Subgroups: counts of learners with a need are no group size.
  {
    id: 'teilgruppe-foerder-45',
    text: 'Mathe Klasse 5 Brüche einführen, 45 Minuten, 3 Schüler mit Förderbedarf',
    erwartet: { nichtKriterien: { gruppe: 3 } }
  },
  {
    id: 'teilgruppe-daz-90',
    text: 'Deutsch Klasse 7 Märchen, 90 Minuten, 25 Schüler, davon 4 mit DaZ',
    erwartet: { kriterien: { gruppe: 25 } }
  },

  // Regressions found in review: no check where none is asked, subjects survive negations, two-digit subgroup counts.
  {
    id: 'kein-check-benoetigen-45',
    text: 'Mathe Klasse 7 Prozentrechnung, 45 Minuten, 3 Schüler benötigen Unterstützung',
    erwartet: { nichtKriterien: { liefert: ['lernstand-diagnostiziert'] } }
  },
  { id: 'kein-check-ohne-benotung-45', text: 'Mathe Klasse 7 Prozentrechnung, 45 Minuten, ohne Benotung', erwartet: { nichtKriterien: { liefert: ['lernstand-diagnostiziert'] } } },
  { id: 'kein-check-verneint-45', text: 'Mathe Klasse 7 Prozentrechnung, 45 Minuten, keine Leistungskontrolle', erwartet: { nichtKriterien: { liefert: ['lernstand-diagnostiziert'] } } },
  { id: 'kein-check-vorbereitung-45', text: 'Deutsch Klasse 8, 45 Minuten, zur Vorbereitung der Klassenarbeit', erwartet: { nichtKriterien: { liefert: ['lernstand-diagnostiziert'] } } },
  { id: 'kein-check-nachbesprechung-45', text: 'Deutsch Klasse 8 Erörterung, 45 Minuten, Nachbesprechung der Klassenarbeit', erwartet: { nichtKriterien: { liefert: ['lernstand-diagnostiziert'] } } },
  { id: 'fach-nach-verneinung-45', text: 'Klasse 9, keine Vorkenntnisse in Chemie, Redoxreaktionen, 45 Minuten', erwartet: { kriterien: { fachbereich: 'nawi-technik' } } },
  {
    id: 'teilgruppe-zweistellig-45',
    text: 'Klasse 5 Bruchrechnung, davon 12 Kinder nichtdeutscher Herkunft, 45 Minuten',
    erwartet: { nichtKriterien: { gruppe: 2 } }
  },
  {
    id: 'wunsch-nach-verneinung-45',
    text: 'Klasse 7 Deutsch, 45 Minuten, keine Tablets und Gruppenarbeit bitte',
    erwartet: { kriterien: { interaktion: ['kleingruppe-kooperativ'], maxTechnik: 't-keine' } }
  },

  {
    id: 'kleingruppe-3-45',
    text: 'Mathe Klasse 7 Prozentrechnung, 45 Minuten, 3 Schüler',
    erwartet: { kriterien: { gruppe: 3 } }
  },

  // Named methods.
  {
    id: 'nennung-gruppenpuzzle-90',
    text: 'Geschichte Klasse 9: Industrialisierung als Gruppenpuzzle, 90 Minuten, 24 Schüler',
    erwartet: { enthaelt: 'gruppenpuzzle' }
  },
  { id: 'nennung-tps-45', text: 'Biologie Klasse 7: Fotosynthese mit Think Pair Share, 45 Minuten, 26 Schüler', erwartet: { enthaelt: 'tps' } },
  {
    id: 'nennung-stationen-sport-45',
    text: 'Sport Klasse 6: Koordination im Zirkeltraining, 45 Minuten',
    erwartet: { enthaelt: 'stationstraining-bewegung', praxis: true } }
];
