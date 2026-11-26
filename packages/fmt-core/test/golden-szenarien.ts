// Reference scenarios from the functional audit (2026-11-25). Each entry is a typical teacher request.
export const THEMEN: Array<[string, string]> = [
  ['Mathematik', 'Prozentrechnung'],
  ['Mathematik', 'Satz des Pythagoras'],
  ['Mathematik', 'lineare Funktionen'],
  ['Deutsch', 'Kurzgeschichten analysieren'],
  ['Deutsch', 'Kommasetzung'],
  ['Deutsch', 'Gedichtinterpretation'],
  ['Englisch', 'Simple Past'],
  ['Englisch', 'Landeskunde London'],
  ['Biologie', 'Zellaufbau'],
  ['Biologie', 'Ökosystem Wald'],
  ['Chemie', 'Säuren und Basen'],
  ['Chemie', 'Periodensystem'],
  ['Physik', 'Stromkreis'],
  ['Physik', 'Newtonsche Gesetze'],
  ['Geschichte', 'Französische Revolution'],
  ['Geschichte', 'Weimarer Republik'],
  ['Politik', 'Bundestagswahl'],
  ['Erdkunde', 'Plattentektonik'],
  ['Erdkunde', 'Klimawandel'],
  ['Religion', 'Weltreligionen'],
  ['Ethik', 'Sterbehilfe'],
  ['Kunst', 'Perspektive zeichnen'],
  ['Musik', 'Dur und Moll'],
  ['Sport', 'Weitsprung'],
  ['Informatik', 'Algorithmen'],
  ['Wirtschaft', 'Angebot und Nachfrage'],
  ['Französisch', 'passé composé'],
  ['Latein', 'Ablativus absolutus'],
  ['Sachunterricht', 'Magnetismus'],
  ['Technik', 'Brückenbau']
];

export const szenarioText = (fach: string, thema: string, min: number) => `${fach} Klasse 8: ${thema}, ${min} Minuten`;

/** Free-text cases the audit found misread. `erwartet` is compared field by field against lesen().kriterien. */
export const LESEFAELLE: Array<{ text: string; erwartet: Record<string, unknown>; nicht?: Record<string, unknown> }> = [
  { text: 'Mathe Klasse 6 Bruchrechnen ohne Tablets', erwartet: { maxTechnik: 't-keine' } },
  { text: 'Mathe Klasse 6 Bruchrechnen, keine Laptops vorhanden', erwartet: { maxTechnik: 't-keine' } },
  { text: 'Informatik Klasse 10 im Computerraum, 90 Minuten', erwartet: { maxTechnik: 't-einzeln' } },
  { text: 'Sport Klasse 9 Volleyball: oberes Zuspiel, 45 Minuten', erwartet: { zielart: 'psychomotorik' }, nicht: { ansatz: ['spiel-simulation'] } },
  { text: 'Hochschule Vorlesung Statistik: Hypothesentests, 180 Studierende, 90 Minuten', erwartet: { bildungsstufe: 'hochschule' }, nicht: { ansatz: ['forschend'], zieltyp: 'fuenf-e' } },
  { text: 'Hypothesen aufstellen und im Versuch prüfen, Biologie Klasse 8', erwartet: { ansatz: ['forschend'] } },
  { text: 'Ich möchte die Reihenfolge der Planeten wiederholen lassen', erwartet: { lernfunktion: ['konsolidierung'] }, nicht: { modus: 'ablauf' } },
  { text: 'Wochenplanarbeit Mathe Grundschule', erwartet: { bildungsstufe: 'primar' }, nicht: { modus: 'ablauf' } },
  { text: 'Unterrichtsreihe über 3 Wochen zum Thema Wald', erwartet: { modus: 'ablauf' } },
  { text: 'Chemie Klasse 9: Maßeinheiten und Stoffmenge einführen', erwartet: {}, nicht: { modus: 'ablauf' } },
  { text: 'Online-Seminar Erwachsenenbildung Zeitmanagement, 12 Teilnehmende, 60 Minuten', erwartet: { bildungsstufe: 'erwachsenenbildung', gruppe: 12 } },
  { text: 'Volkshochschule Kurs Spanisch für Anfänger', erwartet: { bildungsstufe: 'erwachsenenbildung' } },
  // Frame words beyond "Klasse N": course stages, vocational training, clock hours, English requests.
  { text: 'Deutsch Q1 Faust Szenenanalyse, 90 Minuten', erwartet: { bildungsstufe: 'sek2', fachbereich: 'sprachen' } },
  { text: 'Berufsschule Elektroniker 1. Lehrjahr: Schaltpläne lesen, 90 Minuten', erwartet: { bildungsstufe: 'berufsbildung', fachbereich: 'beruf-praxis', zielart: 'prozeduren' } },
  { text: 'Projekttag Nachhaltigkeit Klasse 9, 5 Zeitstunden', erwartet: { zeitMin: 300 } },
  { text: 'Year 8 History lesson on the Industrial Revolution, 45 minutes', erwartet: { bildungsstufe: 'sek1', fachbereich: 'gesellschaft', zeitMin: 45 } },
  { text: 'Jura Uni Seminar: Fallbearbeitung Kaufrecht, 90 Minuten, 30 Studierende', erwartet: { bildungsstufe: 'hochschule', fachbereich: 'gesellschaft', gruppe: 30 } },
  { text: 'Fachinformatiker Lernfeld 3, 90 Minuten, 18 Azubis', erwartet: { bildungsstufe: 'berufsbildung', gruppe: 18 } },
  { text: 'Grundschule 3. Klasse Einmaleins automatisieren, 30 Minuten', erwartet: { bildungsstufe: 'primar', fachbereich: 'mathe-informatik', zielart: 'fakten' } },
  // Review regressions: numbers after a subject, everyday words that look like skills.
  { text: 'Grundschule Mathe 20 Aufgaben zum Einmaleins, 45 Minuten', erwartet: { bildungsstufe: 'primar' } },
  { text: 'Englisch 18 Azubis, Bewerbungsgespräch', erwartet: { bildungsstufe: 'berufsbildung', gruppe: 18 } },
  { text: 'Sport 45 minutes Year 3', erwartet: { bildungsstufe: 'primar', zeitMin: 45 } },
  { text: 'Mathe 1 Zeitstunde Klasse 9', erwartet: { zeitMin: 60 } },
  { text: 'Deutsch Klasse 7: Was uns Bilder sagen, 45 Minuten', erwartet: {}, nicht: { zielart: 'psychomotorik' } },
  { text: 'Deutsch Klasse 8 einen kurzen Text lesen, 45 Minuten', erwartet: {}, nicht: { zielart: 'prozeduren' } },
  { text: 'Mathe Klasse 6 Brüche kürzen, 45 Minuten', erwartet: { zielart: 'prozeduren' } },
  { text: 'Klasse 7 Religion: Medizinethik Organspende diskutieren, 45 Minuten', erwartet: { fachbereich: 'gesellschaft' } },
  { text: 'Biologie: Vom Kind zum Erwachsenen, Pubertät', erwartet: {}, nicht: { bildungsstufe: 'erwachsenenbildung' } },
  // Lernort: the room of the lesson.
  { text: 'Biologie Klasse 5 Bäume bestimmen auf dem Schulhof, 45 Minuten', erwartet: { lernort: 'draussen' } },
  { text: 'Chemie Klasse 7: Sicherheitsregeln im Labor, 45 Minuten', erwartet: { lernort: 'fachraum' } },
  { text: 'Vorlesung Technische Mechanik, 250 Studierende, 90 Minuten', erwartet: { lernort: 'hoersaal' } },
  { text: 'Klasse 6 in der Turnhalle: Bewegungspause, 20 Minuten', erwartet: { lernort: 'bewegungsraum' } },
  { text: 'Deutsch Klasse 8 Gedichte, 45 Minuten', erwartet: {}, nicht: { lernort: 'fachraum' } },
  { text: 'Erdkunde Klasse 7, 45 Minuten, nicht draußen', erwartet: {}, nicht: { lernort: 'draussen' } },
  { text: 'Englisch Klasse 6 Wortschatz in der Küche, 45 Minuten', erwartet: {}, nicht: { lernort: 'fachraum' } },
  { text: 'Sachunterricht Klasse 3 Tiere im Wald, 45 Minuten', erwartet: {}, nicht: { lernort: 'draussen' } },
  { text: 'Mathe Klasse 8, 45 Minuten, nicht in der Sporthalle', erwartet: {}, nicht: { lernort: 'bewegungsraum' } },
  { text: 'Übung zur Vorlesung Analysis, 90 Minuten', erwartet: { fachbereich: 'mathe-informatik' }, nicht: { lernort: 'hoersaal' } },
  { text: 'Sport Klasse 9 Theorie: Doping im Klassenraum, 45 Minuten', erwartet: { lernort: 'klassenraum' } },
  { text: 'Deutsch Klasse 8 Erörterung schreiben, 2 x 45 Minuten', erwartet: { zieltyp: 'produktion', zeitMin: 90 } },
  { text: 'Informatik Klasse 10: Schleifen in Python programmieren, 90 Minuten', erwartet: { zieltyp: 'produktion' } }
];

/** Requests that name a method; the plan must contain it. */
export const NENNUNGEN: Array<{ text: string; baustein: string }> = [
  { text: 'Berufsschule Pflege: Kommunikation mit Angehörigen, Rollenspiel, 90 Minuten, 18 Auszubildende', baustein: 'rollenspiel' },
  { text: 'Physik Klasse 8: Dichte forschend-entdeckend mit Schülerexperimenten, Doppelstunde, 24 Schüler', baustein: 'experiment' },
  { text: 'Geschichte Klasse 9: Industrialisierung als Gruppenpuzzle, 90 Minuten, 24 Schüler', baustein: 'gruppenpuzzle' },
  { text: 'Politik Klasse 10: Tempolimit, Pro-Contra-Debatte, 90 Minuten, 24 Schüler', baustein: 'pro-contra-debatte' },
  { text: 'Ethik Klasse 10: Sterbehilfe als Fishbowl diskutieren, 90 Minuten, 24 Schüler', baustein: 'fishbowl' },
  { text: 'Biologie Klasse 7: Fotosynthese mit Think Pair Share, 45 Minuten, 26 Schüler', baustein: 'tps' }
];
