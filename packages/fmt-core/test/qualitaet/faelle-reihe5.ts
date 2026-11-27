import type { Qualitaetsfall } from './faelle.js';

/**
 * Fifth test series: the 56 scenarios of the scenario test of 2026-11-27 (docs/qualitaet/2026-11-27-szenariotest.md),
 * ids and texts verbatim from scripts/szenariotest/szenarien.mts. Structured scenarios carry their fields in `anfrage`
 * (the scenario's `fach` as `fachbereich`; subgroups are a server matter and are tested in
 * apps/server/test/szenariotest.test.ts).
 * Expectations come from the report and from the acceptance of the plan docs/superpowers/plans/2026-11-27-szenariotest-befunde.md.
 * A check that a later task fixes carries `bekannt` naming that task ("wartet auf Q3", "wartet auf QD2"); the task
 * removes it. Not part of the baseline file (ausgang.json).
 */
const Q2 = 'wartet auf Q2';
const Q3 = 'wartet auf Q3';
const Q4 = 'wartet auf Q4';
const Q6 = 'wartet auf Q6';
const QD2 = 'wartet auf QD2';

export const REIHE5: Qualitaetsfall[] = [
  // Grundschule
  {
    id: 'gs1-mathe-zerlegen-20',
    text: 'Klasse 1 Mathe, Zahlen bis 10 zerlegen mit Plättchen, 20 Minuten, 22 Kinder, Klassenraum',
    // Q3 asks for the plan (modus ablauf); that /match plans on its own is Q6 (server test).
    anfrage: { modus: 'ablauf' },
    erwartet: { ketteNicht: 'kooperatives-lernen', angenommen: ['zielart'], themaNicht: ['Klassenraum'] },
    bekannt: { ketteNicht: Q3, pflichtangaben: Q3, thema: Q2 }
  },
  {
    id: 'gs1-deutsch-anlaute-ohneschrift',
    text: 'Anlaute hören und unterscheiden',
    anfrage: { fachbereich: 'sprachen', bildungsstufe: 'primar', zeitMin: 45, gruppe: 24, raum: 'klassenraum', ohneSchrift: ['lesen', 'schreiben'], zielart: 'prozeduren' },
    erwartet: { kette: 'prozedur', ohneSchriftbedarf: ['liest', 'schreibt'] }
  },
  {
    id: 'gs3-sachunterricht-draussen',
    text: 'Sachunterricht Klasse 3, Bäume auf dem Schulhof an Blättern bestimmen, draußen, 45 Minuten, 25 Kinder',
    erwartet: { kriterien: { raum: 'draussen', zielart: 'prozeduren' } },
    bekannt: { kriterien: Q2 }
  },
  {
    id: 'gs4-englisch-wortschatz-10',
    text: 'Englisch Klasse 4, Wortschatz Tiere wiederholen, 10 Minuten, 26 Kinder',
    erwartet: { modus: 'phase' }
  },
  {
    id: 'gs2-sport-werfen',
    text: 'Sport Klasse 2, Werfen und Fangen mit dem Ball, Turnhalle, 45 Minuten, 24 Kinder',
    erwartet: {
      kette: 'fertigkeit-bewegung',
      praxis: true,
      regeln: ['sicherheitshinweis'],
      regelnNicht: ['problemloesen-vor-instruktion-primar'],
      hinweisNicht: ['RiSU']
    },
    bekannt: { regelNicht: Q4, hinweis: Q4 }
  },
  {
    id: 'gs4-musik-bodypercussion',
    text: 'Musik Klasse 4: Rhythmus mit Bodypercussion einüben, 45 Minuten, Musikraum, 25 Kinder',
    erwartet: { kette: 'fertigkeit-bewegung', regelnNicht: ['sicherheitshinweis', 'problemloesen-vor-instruktion-primar'] },
    bekannt: { regelNicht: Q4 }
  },
  {
    id: 'gs3-kunst-drucken-90',
    text: 'Kartoffeldruck: Muster gestalten',
    anfrage: { fachbereich: 'aesthetik', bildungsstufe: 'primar', zeitMin: 90, gruppe: 23, raum: 'werkraum', zielart: 'gestalten', nachweis: 'produkt' },
    erwartet: { kette: 'produktion', nachweisform: 'produkt', regeln: ['sicherheitshinweis'], regelnNicht: ['problemloesen-vor-instruktion-primar'] },
    bekannt: { regelNicht: Q4 }
  },
  {
    id: 'gs2-religion-samariter',
    text: 'Religion Klasse 2, die Geschichte vom barmherzigen Samariter im Erzählkreis, 45 Minuten, 21 Kinder',
    erwartet: { kriterien: { fachbereich: 'gesellschaft' }, thema: 'Geschichte vom barmherzigen Samariter' },
    bekannt: { thema: Q2 }
  },
  {
    id: 'gs4-mathe-teilgruppen',
    text: 'Schriftliche Multiplikation üben',
    anfrage: { fachbereich: 'mathe-informatik', bildungsstufe: 'primar', zeitMin: 45, gruppe: 26, raum: 'klassenraum', zielart: 'prozeduren' },
    erwartet: { kette: 'prozedur' }
  },
  // Sek I
  {
    id: 's1-mathe-linfkt-einstieg',
    text: 'Einstieg in lineare Funktionen, Klasse 8, 45 Minuten, 28 Schüler, Klassenraum, nur Tafel vorhanden',
    erwartet: {},
    bekannt: { modus: Q6 }
  },
  {
    id: 's1-deutsch-sachtext-gruppen',
    text: 'Sachtexte erschließen: Schlüsselwörter markieren und zusammenfassen',
    anfrage: { fachbereich: 'sprachen', bildungsstufe: 'sek1', zeitMin: 45, gruppe: 27, raum: 'klassenraum', zielart: 'prozeduren' },
    erwartet: { kette: 'prozedur' }
  },
  {
    id: 's1-englisch-rollenspiel',
    text: 'Englisch Klasse 7, Sprechen üben: At the restaurant, Rollenspiel, 45 Minuten, 30 Schüler',
    erwartet: { kette: 'produktion', enthaelt: 'rollenspiel' }
  },
  {
    id: 's1-bio-mikroskop-90',
    text: 'Biologie Klasse 6, Mikroskopieren von Zwiebelzellen, Biologie-Fachraum, 90 Minuten, 28 Schüler',
    erwartet: { kriterien: { raum: 'fachraum-nawi' }, pflichtNichtFehlt: ['raum'], regeln: ['sicherheitshinweis'] },
    bekannt: { kriterien: Q2, pflichtangaben: Q2 }
  },
  {
    id: 's1-chemie-verbrennung',
    text: 'Verbrennung von Metallen: Schülerversuch mit Eisenwolle',
    anfrage: { fachbereich: 'nawi-technik', bildungsstufe: 'sek1', zeitMin: 45, gruppe: 24, raum: 'fachraum-nawi', zielart: 'konzepte' },
    erwartet: { kriterien: { ansatz: ['forschend'] }, enthaelt: 'experiment' },
    bekannt: { kriterien: Q2, enthaelt: QD2 }
  },
  {
    id: 's1-physik-stromkreis-problem',
    text: 'Physik Klasse 7 Stromkreise: Warum leuchtet die Lampe nicht? Fehlersuche als Problemlöseaufgabe, 45 Minuten, 26 Schüler, Physikraum',
    erwartet: { kette: 'problemloesen', regeln: ['sicherheitshinweis'] }
  },
  {
    id: 's1-geschichte-karikatur',
    text: 'Geschichte Klasse 9, Weimarer Republik, Quellenarbeit mit Karikaturen, 45 Minuten, 25 Schüler',
    erwartet: { ketteNicht: 'kooperatives-lernen', angenommen: ['zielart'], enthaelt: 'karikatur-bildanalyse' },
    bekannt: { ketteNicht: Q3, pflichtangaben: Q3, enthaelt: QD2 }
  },
  {
    id: 's1-politik-wahlalter-urteil',
    text: 'Soll das Wahlalter auf 16 gesenkt werden?',
    anfrage: { fachbereich: 'gesellschaft', bildungsstufe: 'sek1', zeitMin: 90, gruppe: 28, raum: 'klassenraum', zielart: 'urteilen', nachweis: 'muendlich' },
    // Q3: the stated proof „mündlich“ is checked also without a check step (unless a method of the plan yields it).
    erwartet: { kette: 'urteilsbildung', regeln: ['nachweis-passt-zum-ziel'] },
    bekannt: { regel: Q3 }
  },
  {
    id: 's1-ethik-luegen-diskussion',
    text: 'Ethik Klasse 8, Diskussion: Darf man lügen? 45 Minuten, 22 Schüler, Klassenraum',
    erwartet: { kette: 'urteilsbildung', kriterien: { ansatz: ['diskurs'] }, regelnNicht: ['sicherheitshinweis'] }
  },
  {
    id: 's1-kunst-linolschnitt',
    text: 'Kunst Klasse 7 Linolschnitt: eigenes Motiv schneiden und drucken, Doppelstunde 90 Minuten, Kunstraum, 26 Schüler',
    erwartet: {
      kette: 'produktion',
      regeln: ['sicherheitshinweis'],
      hinweisNicht: ['Positionslinie', 'Klassenspaziergang'],
      nicht: ['differenzielles-lernen']
    },
    bekannt: { hinweis: Q4, nicht: QD2 }
  },
  {
    id: 's1-musik-songwriting-tablets',
    text: 'Musik Klasse 9, Songwriting mit Tablets (GarageBand), 90 Minuten, 24 Schüler',
    // Q2 reads „Songwriting“ as goal kind gestalten, which leads to produktion and away from the guessed chain (Q3).
    erwartet: { kette: 'produktion', ketteNicht: 'kooperatives-lernen' },
    bekannt: { kette: Q2, ketteNicht: Q2 }
  },
  {
    id: 's1-sport-ausdauer-draussen',
    text: 'Ausdauerlauf: 20 Minuten durchlaufen lernen',
    anfrage: { fachbereich: 'sport', bildungsstufe: 'sek1', zeitMin: 45, gruppe: 28, raum: 'draussen', zielart: 'kondition' },
    erwartet: { kette: 'kondition-training', praxis: true, regeln: ['sicherheitshinweis'], hinweisNicht: ['RiSU'] },
    bekannt: { hinweis: Q4 }
  },
  {
    id: 's1-sport-bodenturnen-90',
    text: 'Sport Klasse 7 Bodenturnen: Rolle vorwärts und Handstand, Turnhalle, 90 Minuten, 26 Schüler',
    erwartet: { kette: 'fertigkeit-bewegung', praxis: true, regeln: ['sicherheitshinweis'], hinweisNicht: ['RiSU'] },
    bekannt: { hinweis: Q4 }
  },
  {
    id: 's1-informatik-scratch',
    text: 'Informatik Klasse 8, Schleifen in Scratch programmieren, Computerraum, 45 Minuten, 24 Schüler',
    erwartet: { kette: 'produktion' }
  },
  {
    id: 's1-informatik-unplugged',
    text: 'Sortieralgorithmen verstehen (Bubblesort) ohne Computer',
    anfrage: { fachbereich: 'mathe-informatik', bildungsstufe: 'sek1', zeitMin: 45, gruppe: 25, raum: 'klassenraum', ohneInternet: true, maxTechnik: 't-keine', zielart: 'konzepte' },
    erwartet: { kette: 'konzeptaufbau' }
  },
  {
    id: 's1-wirtschaft-budget',
    text: 'Wirtschaft Klasse 9: Taschengeld und Budgetplanung, 45 Minuten',
    erwartet: { pflichtFehlt: ['anzahl', 'raum'] }
  },
  {
    id: 's1-mathe-bruch-test',
    text: 'Mathe Klasse 6 Bruchrechnen, schriftlicher Test mit Note, 45 Minuten, 27 Schüler',
    // Q2 also wants the check step to hold at least half of the time with a written check.
    erwartet: { kriterien: { nachweis: 'schriftlich', bewertet: true }, leistungskontrolle: true },
    bekannt: { kriterien: Q2 }
  },
  {
    id: 's1-mathe-pythagoras-gruppen',
    text: 'Satz des Pythagoras: Übungsstunde mit Anwendungsaufgaben',
    anfrage: { fachbereich: 'mathe-informatik', bildungsstufe: 'sek1', zeitMin: 45, gruppe: 29, raum: 'klassenraum', zielart: 'prozeduren' },
    erwartet: { kette: 'prozedur' }
  },
  {
    id: 's1-franz-vokabeln-10',
    text: '10 Minuten Wiederholung der Französisch-Vokabeln der letzten Lektion, Klasse 8, 27 Schüler',
    erwartet: { modus: 'phase' }
  },
  {
    id: 's1-erdkunde-distanz',
    text: 'Erdkunde Klasse 7 Plattentektonik im Distanzunterricht per Videokonferenz, 45 Minuten, 26 Schüler',
    erwartet: { kriterien: { raum: 'digital' } }
  },
  // Sek II
  {
    id: 's2-deutsch-gedicht-90',
    text: 'Deutsch Q1 Gedichtinterpretation Expressionismus (Heym, Der Gott der Stadt), 90 Minuten, 20 Schüler',
    erwartet: { nicht: ['lautleseverfahren'] }
  },
  {
    id: 's2-mathe-kurvendiskussion',
    text: 'Kurvendiskussion ganzrationaler Funktionen üben',
    anfrage: { fachbereich: 'mathe-informatik', bildungsstufe: 'sek2', zeitMin: 90, gruppe: 18, raum: 'klassenraum', zielart: 'prozeduren', vorwissen: 'mittel' },
    erwartet: { kette: 'prozedur', nichtKriterien: { ansatz: ['diskurs'] } },
    bekannt: { kriterien: Q2 }
  },
  {
    id: 's2-bio-genetik-digital',
    text: 'Proteinbiosynthese: Transkription und Translation',
    anfrage: { fachbereich: 'nawi-technik', bildungsstufe: 'sek2', zeitMin: 45, gruppe: 22, raum: 'digital', raumzeit: ['distanz', 'synchron'], zielart: 'konzepte' },
    erwartet: { kette: 'konzeptaufbau' }
  },
  {
    id: 's2-geschichte-projekttag',
    text: 'Projekttag Geschichte Oberstufe: Alltag in der DDR, Zeitzeugeninterviews vorbereiten und auswerten, 20 Schüler',
    erwartet: { pflichtFehlt: ['zeit'], angenommenWert: { zeit: 270 } },
    bekannt: { pflichtangaben: Q2 }
  },
  {
    id: 's2-philo-kant-urteil',
    text: 'Kants kategorischer Imperativ an einem Dilemma prüfen',
    anfrage: { fachbereich: 'gesellschaft', bildungsstufe: 'sek2', zeitMin: 45, gruppe: 16, raum: 'klassenraum', zielart: 'urteilen' },
    // No learning function may be read from „prüfen“ (undefined: the field stays empty).
    erwartet: { kette: 'urteilsbildung', kriterien: { lernfunktion: undefined } },
    bekannt: { kriterien: Q2 }
  },
  {
    id: 's2-chemie-fakten-20',
    text: 'Chemie Oberstufe: funktionelle Gruppen der organischen Chemie auswendig können, 20 Minuten Wiederholung, 19 Schüler',
    erwartet: { thema: /^funktionelle Gruppen der organischen Chemie auswendig können$/ },
    bekannt: { thema: Q2 }
  },
  // Berufsschule und Betrieb
  {
    id: 'bs-pflege-transfer',
    text: 'Pflegeausbildung 2. Lehrjahr, Lernfeld Mobilisation: Transfer vom Bett in den Rollstuhl üben, Skills Lab, 90 Minuten, 16 Auszubildende',
    erwartet: { kette: 'vollstaendige-handlung', thema: '2. Lehrjahr' },
    bekannt: { thema: Q2 }
  },
  {
    id: 'bs-kfz-bremsen',
    text: 'Berufsschule Kfz-Mechatroniker: Bremsbeläge an der Scheibenbremse wechseln, Werkstatt, 90 Minuten, 12 Azubis',
    erwartet: { kette: 'vollstaendige-handlung', angenommen: ['zielart'], regeln: ['sicherheitshinweis'] },
    bekannt: { kette: Q2, pflichtangaben: Q2 }
  },
  {
    id: 'bs-einzelhandel-reklamation',
    text: 'Berufsschule Einzelhandel: Reklamationsgespräch führen, Rollenspiel, 45 Minuten, 24 Azubis',
    erwartet: { enthaelt: 'rollenspiel', angenommenWert: { zielart: 'gestalten' }, regelnNicht: ['sicherheitshinweis'] },
    bekannt: { pflichtangaben: Q3, regelNicht: Q4 }
  },
  {
    id: 'bs-gastro-saucen',
    text: 'Köche 1. Lehrjahr: Grundsaucen herstellen (Lernfeld 2)',
    anfrage: { bildungsstufe: 'berufsbildung', zeitMin: 180, gruppe: 14, raum: 'lehrkueche', zielart: 'handlung', nachweis: 'praktisch', einheit: 'Lernfeld 2' },
    erwartet: {
      kette: 'vollstaendige-handlung',
      planungsprofil: 'berufsschule',
      regeln: ['sicherheitshinweis'],
      hinweisNicht: ['Positionslinie', 'Klassenspaziergang'],
      thema: '1. Lehrjahr'
    },
    bekannt: { hinweis: Q4, thema: Q2 }
  },
  {
    id: 'bs-it-netzwerk-ohneinternet',
    text: 'Fachinformatiker Berufsschule: Netzwerk-Fehlersuche und Subnetting, Computerraum ohne Internet, 90 Minuten, 20 Azubis',
    erwartet: { kriterien: { ohneInternet: true }, regelnNicht: ['sicherheitshinweis'] },
    bekannt: { regelNicht: Q4 }
  },
  {
    id: 'betrieb-kasse-unterweisung',
    text: 'Unterweisung im Betrieb: Auszubildende lernen die Kassenabrechnung am Tagesende, 20 Minuten, 4 Azubis',
    // Q3 asks for the plan (modus ablauf); that /match plans on its own is Q6 (server test).
    anfrage: { modus: 'ablauf' },
    erwartet: { planungsprofil: 'betrieb', nicht: ['gebundene-musik-rhythmus'], pflichtFehlt: ['ziel'], enthaelt: 'vier-stufen-methode' },
    bekannt: { fachpassung: Q3, nicht: Q3, pflichtangaben: Q2, enthaelt: QD2 }
  },
  {
    id: 'bs-wirtschaft-pruefungsvorb',
    text: 'Berufsschule Industriekaufleute: Deckungsbeitragsrechnung, Prüfungsvorbereitung für die Abschlussprüfung, 90 Minuten, 22 Azubis',
    erwartet: { kette: 'prozedur', regelnNicht: ['sicherheitshinweis'] },
    bekannt: { kette: Q2, regelNicht: Q4 }
  },
  // Hochschule
  {
    id: 'hs-vorlesung-statistik-250',
    text: 'Vorlesung Statistik I, Hörsaal, 250 Studierende, 90 Minuten, Hypothesentests einführen',
    erwartet: { kriterien: { raum: 'hoersaal' }, hinweis: [/Mehr als 20 Minuten am Stück im passiven Modus.*Phase/], themaNicht: ['Hörsaal'] },
    bekannt: { thema: Q2 }
  },
  {
    id: 'hs-seminar-soziologie-12',
    text: 'Seminar Soziologie im Master, 12 Studierende, Textdiskussion zu Bourdieus Habitusbegriff, 90 Minuten',
    erwartet: { pflichtNichtFehlt: ['fach-und-thema'] },
    bekannt: { pflichtangaben: Q2 }
  },
  {
    id: 'hs-bwl-fallstudie-online',
    text: 'Marketing-Fallstudie: Markteintritt eines Start-ups',
    anfrage: { fachbereich: 'gesellschaft', bildungsstufe: 'hochschule', zeitMin: 90, gruppe: 40, raum: 'digital', raumzeit: ['distanz', 'synchron'], zielart: 'problemloesen' },
    erwartet: {
      kette: 'problemloesen',
      hinweis: [{ muster: /unvollständig.*„Lösungsversuche“.*höchstens 35 Personen/s, erster: true }],
      hinweisNicht: ['loesungsversuche']
    },
    bekannt: { gueltig: QD2 }
  },
  {
    id: 'hs-labor-titration',
    text: 'Laborpraktikum Chemie im 1. Semester: Säure-Base-Titration, 180 Minuten, 16 Studierende, Labor',
    erwartet: { regeln: ['sicherheitshinweis'], hinweisNicht: ['Positionslinie', 'Klassenspaziergang'], nicht: ['jenaplan-kreis'], thema: '1. Semester' },
    bekannt: { hinweis: Q4, nicht: QD2, thema: Q2 }
  },
  // Erwachsenenbildung
  {
    id: 'vhs-alpha-einkaufen',
    text: 'Alphabetisierungskurs: Einkaufen, Preise verstehen und vergleichen',
    anfrage: { bildungsstufe: 'erwachsenenbildung', zeitMin: 90, gruppe: 8, raum: 'klassenraum', ohneSchrift: ['lesen', 'schreiben'] },
    erwartet: { ohneSchriftbedarf: ['liest', 'schreibt'], pflichtFehlt: ['fach-und-thema'] }
  },
  {
    id: 'vhs-spanisch-a1',
    text: 'VHS Spanisch A1 Abendkurs, sich vorstellen und begrüßen, 90 Minuten, 10 Teilnehmende',
    erwartet: {}
  },
  {
    id: 'vhs-excel-4',
    text: 'VHS-Kurs Excel Grundlagen: Formeln und Funktionen, Computerraum, 4 Teilnehmer, 90 Minuten',
    erwartet: { kriterien: { fachbereich: 'mathe-informatik' }, kette: 'prozedur' },
    bekannt: { kette: Q2, kriterien: Q2 }
  },
  {
    id: 'verein-rueckenfit-60',
    text: 'Rückenfit-Kurs für Erwachsene im Sportverein, Kräftigung der Rumpfmuskulatur, 60 Minuten, Turnhalle, 15 Teilnehmende',
    erwartet: { kriterien: { fachbereich: 'sport' }, kette: 'kondition-training' },
    bekannt: { kette: Q2, kriterien: Q2 }
  },
  {
    id: 'integrationskurs-a2-arzt',
    text: 'Integrationskurs: einen Arzttermin telefonisch vereinbaren',
    anfrage: { fachbereich: 'sprachen', bildungsstufe: 'erwachsenenbildung', zeitMin: 90, gruppe: 18, raum: 'klassenraum', sprachniveau: 'a2', zielart: 'prozeduren', nachweis: 'muendlich' },
    // The language-level warning stands once in the notes (rule message), not again as a check message.
    erwartet: { kette: 'prozedur', hinweis: [{ muster: 'das Sprachniveau ist aber niedrig', anzahl: 1 }] }
  },
  // Vage und lückenhaft
  {
    id: 'vage-morgen',
    text: 'Ich brauche was für morgen',
    // The core offers one phase without any frame (/plan still plans and says so, Q6). No learning function may be read
    // from the sentence (undefined: the field stays empty).
    erwartet: { modus: 'phase', kriterien: { lernfunktion: undefined }, pflichtFehlt: ['ziel', 'fach-und-thema', 'bildungsstufe', 'anzahl', 'raum', 'zeit'] },
    bekannt: { kriterien: Q2, pflichtangaben: Q2 }
  },
  {
    id: 'vage-klimawandel',
    text: 'Irgendwas Aktivierendes zum Thema Klimawandel',
    // The core offers one phase without any frame (/plan still plans and says so, Q6).
    erwartet: { modus: 'phase', pflichtFehlt: ['ziel'], angenommen: ['fach'] },
    bekannt: { pflichtangaben: Q2 }
  },
  {
    id: 'luecke-mathe-45',
    text: 'Mathe 45 Minuten',
    erwartet: { pflichtFehlt: ['ziel', 'fach-und-thema', 'bildungsstufe', 'anzahl', 'raum'] }
  },
  {
    id: 'luecke-nur-zielart',
    text: 'Bruchrechnung',
    anfrage: { zielart: 'prozeduren' },
    erwartet: { kette: 'prozedur', pflichtFehlt: ['bildungsstufe', 'anzahl', 'raum', 'zeit'] }
  },
  {
    id: 'luecke-sport-ohne-raum',
    text: 'Sport Klasse 5 Basketball Korbleger lernen, 45 Minuten',
    erwartet: {
      kette: 'fertigkeit-bewegung',
      praxis: true,
      pflichtFehlt: ['anzahl', 'raum'],
      angenommen: ['raum'],
      regeln: ['sicherheitshinweis'],
      hinweisNicht: ['RiSU']
    },
    bekannt: { hinweis: Q4 }
  }
];
