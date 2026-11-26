import type { Qualitaetsfall } from './faelle.js';

/**
 * Third test series (2026-11-26, after round 4): fresh requests that no earlier round was tuned on.
 * Focus: places of learning (outdoors, lecture hall, lab, workshop), topics that name a subject only indirectly,
 * several wishes at once, adult and vocational settings, and short inputs. Expectations were written before the run.
 */
export const REIHE3: Qualitaetsfall[] = [
  // Lernorte
  { id: 'r3-ort-erdkunde-bach-90', text: 'Erdkunde Klasse 7 Exkursion an den Bach: Gewässergüte bestimmen, 90 Minuten, draußen', erwartet: { kriterien: { raum: 'draussen', zeitMin: 90, bildungsstufe: 'sek1' }, nichtKriterien: { ansatz: ['spiel-simulation'] } } },
  { id: 'r3-ort-bio-schulgarten-45', text: 'Bio Klasse 5 im Schulgarten: Pflanzen bestimmen, 45 Minuten', erwartet: { kriterien: { raum: 'draussen', fachbereich: 'nawi-technik' } } },
  { id: 'r3-ort-gs-wald-90', text: 'Waldtag mit der 2. Klasse, Tiere im Wald entdecken, 90 Minuten', erwartet: { kriterien: { raum: 'draussen', bildungsstufe: 'primar' } } },
  { id: 'r3-ort-museum-60', text: 'Geschichte 9. Klasse Museumsbesuch zur Industrialisierung vorbereiten und durchführen, 60 Minuten im Museum', erwartet: { kriterien: { raum: 'draussen', fachbereich: 'gesellschaft' } } },
  { id: 'r3-ort-hoersaal-bwl-90', text: 'Vorlesung BWL im Hörsaal, 180 Studierende, Kostenrechnung, 90 Minuten, trotzdem etwas Aktivierung', erwartet: { kriterien: { raum: 'hoersaal', bildungsstufe: 'hochschule', gruppe: 180 } } },
  { id: 'r3-ort-chemie-labor-90', text: 'Chemie Q1 Titration im Labor, Schülerversuch, Doppelstunde', erwartet: { praxis: true, kriterien: { raum: 'fachraum', bildungsstufe: 'sek2', zeitMin: 90 } } },
  { id: 'r3-ort-technik-werkstatt-90', text: 'Technik Klasse 8 in der Werkstatt: Vogelhaus sägen und bohren, 90 Minuten', erwartet: { praxis: true, kriterien: { raum: 'fachraum', fachbereich: 'nawi-technik' } } },
  { id: 'r3-ort-hauswirtschaft-kueche-90', text: 'Hauswirtschaft Klasse 9 in der Lehrküche: Pizza backen und Hygiene beachten, 90 Minuten', erwartet: { praxis: true, kriterien: { raum: 'fachraum' } } },
  { id: 'r3-ort-sport-draussen-45', text: 'Sport Klasse 6 auf dem Sportplatz: Sprint und Staffellauf, 45 Minuten', erwartet: { praxis: true, kriterien: { fachbereich: 'sport', raum: 'draussen' } } },

  // Primarstufe
  { id: 'r3-gs-mathe-geld-45', text: 'Mathe 2. Klasse Rechnen mit Geld, Kaufladen, 45 min', erwartet: { kriterien: { bildungsstufe: 'primar', fachbereich: 'mathe-informatik', zeitMin: 45 } } },
  { id: 'r3-gs-deutsch-diktat-45', text: 'Deutsch Klasse 3, Rechtschreibung: am Ende ein kurzes Diktat, 45 Minuten', erwartet: { leistungskontrolle: true, kriterien: { bildungsstufe: 'primar', fachbereich: 'sprachen' } } },
  { id: 'r3-gs-sachunterricht-verkehr-45', text: 'Sachunterricht 4. Klasse Fahrradprüfung vorbereiten, Verkehrsregeln, 45 Minuten', erwartet: { kriterien: { bildungsstufe: 'primar' } } },
  { id: 'r3-gs-sport-turnen-45', text: 'Turnen in der 3. Klasse: Rolle vorwärts lernen, 45 Minuten', erwartet: { praxis: true, kriterien: { bildungsstufe: 'primar', fachbereich: 'sport' } } },
  { id: 'r3-gs-morgenkreis-15', text: 'Morgenkreis in der 1. Klasse, 15 Minuten', erwartet: { modus: 'phase', kriterien: { bildungsstufe: 'primar' } } },

  // Sekundarstufe I
  { id: 'r3-s1-mathe-pythagoras-45', text: 'Satz des Pythagoras einführen, Klasse 9, 45 Minuten, ohne Gruppenarbeit', erwartet: { ohneInteraktion: ['kleingruppe-unstrukturiert', 'kleingruppe-kooperativ'], kriterien: { fachbereich: 'mathe-informatik', bildungsstufe: 'sek1' } } },
  { id: 'r3-s1-mathe-funktionen-test-90', text: 'Lineare Funktionen wiederholen und am Ende Test schreiben, 8. Klasse, 90 Minuten', erwartet: { leistungskontrolle: true, kriterien: { zeitMin: 90 } } },
  { id: 'r3-s1-deutsch-gedicht-45', text: 'Gedichtanalyse Expressionismus, Klasse 10, 45 Minuten', erwartet: { kriterien: { fachbereich: 'sprachen' } } },
  { id: 'r3-s1-englisch-film-90', text: 'English year 8: watch a short film and discuss it, 90 minutes', erwartet: { kriterien: { zeitMin: 90, fachbereich: 'sprachen' } } },
  { id: 'r3-s1-latein-uebersetzen-45', text: 'Latein 7: Übersetzen üben, ablativus absolutus, 45 Minuten', erwartet: { kriterien: { fachbereich: 'sprachen' } } },
  { id: 'r3-s1-politik-wahl-90', text: 'Politik Klasse 10 Juniorwahl: Parteiprogramme vergleichen und eine Wahlentscheidung begründen, 90 Minuten', erwartet: { kette: 'urteilsbildung', kriterien: { fachbereich: 'gesellschaft' } } },
  { id: 'r3-s1-ethik-dilemma-45', text: 'Ethik 8. Klasse Dilemma diskutieren: darf man lügen?, 45 Minuten', erwartet: { kriterien: { fachbereich: 'gesellschaft' } } },
  { id: 'r3-s1-informatik-scratch-90', text: 'Informatik Klasse 6: erstes Spiel in Scratch programmieren, 90 Minuten', erwartet: { praxis: true, kriterien: { fachbereich: 'mathe-informatik' } } },
  { id: 'r3-s1-musik-trommeln-45', text: 'Musik Klasse 5 Rhythmus: gemeinsam trommeln, 45 Minuten', erwartet: { praxis: true, kriterien: { fachbereich: 'aesthetik' } } },
  { id: 'r3-s1-kunst-perspektive-90', text: 'Kunst Klasse 7: Zentralperspektive zeichnen, 90 Minuten', erwartet: { praxis: true, kriterien: { fachbereich: 'aesthetik' } } },
  { id: 'r3-s1-physik-strom-inklusion-45', text: 'Physik Klasse 8 Reihenschaltung, 45 Minuten, zwei Schüler mit Förderbedarf Lernen und ein Kind im Rollstuhl', erwartet: { kriterien: { fachbereich: 'nawi-technik' } } },
  { id: 'r3-s1-vertretung-30', text: 'Vertretungsstunde Klasse 7, keine Vorbereitung möglich, 30 Minuten Beschäftigung', erwartet: { kriterien: { zeitMin: 30 } } },
  { id: 'r3-s1-klassenrat-45', text: 'Klassenrat in der 6: Streit in der Pause klären, 45 Minuten', erwartet: { kriterien: { bildungsstufe: 'sek1' } } },

  // Sekundarstufe II
  { id: 'r3-s2-geschichte-klausur-90', text: 'Geschichte Oberstufe Klausurvorbereitung Weimarer Republik, Doppelstunde', erwartet: { kriterien: { bildungsstufe: 'sek2', zeitMin: 90 } } },
  { id: 'r3-s2-philo-kant-90', text: 'Philosophie LK 12 Kategorischer Imperativ, Textarbeit und Diskussion, 90 Min', erwartet: { kriterien: { bildungsstufe: 'sek2', fachbereich: 'gesellschaft' } } },
  { id: 'r3-s2-bio-genetik-flipped-45', text: 'Bio Q2 Genetik, Flipped Classroom, die Schüler haben das Video zu Hause gesehen, 45 Minuten', erwartet: { kriterien: { bildungsstufe: 'sek2' } } },
  { id: 'r3-s2-sport-volleyball-90', text: 'Sport Oberstufe Volleyball: Pritschen und Baggern verbessern, Doppelstunde, 24 Schüler', erwartet: { praxis: true, kette: 'fertigkeit-bewegung', kriterien: { gruppe: 24, zeitMin: 90 } } },
  { id: 'r3-s2-deutsch-erorterung-90', text: 'Deutsch EF Erörterung schreiben, Argumente sammeln und gliedern, 90 Minuten', erwartet: { kette: 'produktion', kriterien: { fachbereich: 'sprachen' } } },

  // Berufliche Bildung
  { id: 'r3-bs-kfz-reifen-90', text: 'Kfz-Mechatroniker 1. Lehrjahr: Reifenwechsel in der Werkstatt, 90 Minuten, 14 Azubis', erwartet: { praxis: true, kriterien: { fachbereich: 'beruf-praxis', gruppe: 14 } } },
  { id: 'r3-bs-einzelhandel-kunden-90', text: 'Kaufleute im Einzelhandel: Verkaufsgespräch und Reklamation üben, 90 Minuten', erwartet: { kriterien: { fachbereich: 'beruf-praxis' } } },
  { id: 'r3-bs-pflege-blutdruck-60', text: 'Pflegeschule 1. Ausbildungsjahr: Blutdruck messen im Skills Lab, 60 Minuten, 18 Auszubildende', erwartet: { praxis: true, kriterien: { raum: 'fachraum', gruppe: 18 } } },
  { id: 'r3-bs-elektro-pruefung-45', text: 'Elektroniker Lernfeld 3, Fehlersuche an Schaltungen, 45 Minuten, am Ende praktische Prüfung', erwartet: { leistungskontrolle: true, kriterien: { fachbereich: 'beruf-praxis' } } },
  { id: 'r3-bs-erzieher-portfolio-90', text: 'Fachschule Sozialpädagogik: Beobachtungsbögen auswerten und Portfolio führen, 90 Minuten', erwartet: { kriterien: { bildungsstufe: 'berufsbildung' } } },

  // Hochschule
  { id: 'r3-hs-seminar-referat-90', text: 'Masterseminar Soziologie, 20 Studierende, Referat mit anschließender Diskussion, 90 Minuten', erwartet: { kriterien: { bildungsstufe: 'hochschule', gruppe: 20 } } },
  { id: 'r3-hs-mathe-uebung-90', text: 'Übung zur Analysis I, 35 Studierende, Aufgaben vorrechnen, 90 Minuten', erwartet: { kriterien: { bildungsstufe: 'hochschule', fachbereich: 'mathe-informatik' } } },
  { id: 'r3-hs-online-60', text: 'Online-Seminar per Zoom zur Statistik, 40 Teilnehmende, 60 Minuten', erwartet: { kriterien: { bildungsstufe: 'hochschule', zeitMin: 60, raumzeit: ['distanz'] } } },

  // Erwachsenenbildung
  { id: 'r3-eb-vhs-spanisch-90', text: 'VHS Spanisch A1 für Senioren, 12 Teilnehmende, Zahlen und Einkaufen, 90 Minuten', erwartet: { kriterien: { bildungsstufe: 'erwachsenenbildung', gruppe: 12 } } },
  { id: 'r3-eb-erstehilfe-120', text: 'Erste-Hilfe-Kurs für Erwachsene: stabile Seitenlage und Herzdruckmassage üben, 2 Stunden', erwartet: { praxis: true, kriterien: { zeitMin: 120 } } },
  { id: 'r3-eb-workshop-team-180', text: 'Teamworkshop in einer Firma, 15 Mitarbeitende, Zusammenarbeit verbessern, halber Tag', erwartet: { kriterien: { bildungsstufe: 'erwachsenenbildung', gruppe: 15 } } },

  // Kurze oder unscharfe Eingaben
  { id: 'r3-kurz-bruchrechnung', text: 'Bruchrechnung Klasse 6', erwartet: { kriterien: { fachbereich: 'mathe-informatik', bildungsstufe: 'sek1' } } },
  { id: 'r3-kurz-einstieg-photosynthese', text: 'Einstieg Photosynthese', erwartet: { modus: 'phase', kriterien: { fachbereich: 'nawi-technik' } } },
  { id: 'r3-kurz-abschluss-reflexion-10', text: 'Abschlussreflexion für eine Projektwoche, 10 Minuten', erwartet: { modus: 'phase', kriterien: { zeitMin: 10 } } }
];
