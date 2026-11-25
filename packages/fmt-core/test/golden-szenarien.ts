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
