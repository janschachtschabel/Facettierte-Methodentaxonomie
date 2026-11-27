import type { Qualitaetsfall } from './faelle.js';

/**
 * Second test series (2026-11-26): new, practical requests spread over all subject areas and education levels,
 * phrased the way teachers and trainers write them (casual, with typos, with several wishes at once).
 * Expectations describe what a didactic reviewer expects, not what the planner currently does.
 */
export const REIHE2: Qualitaetsfall[] = [
  // Primarstufe
  { id: 'r2-gs-deutsch-lesen-45', text: 'Klasse 2 Deutsch, Lesen üben mit Silben, 45 min, 22 Kinder', erwartet: { kriterien: { bildungsstufe: 'primar', gruppe: 22, fachbereich: 'sprachen' } } },
  { id: 'r2-gs-mathe-einmaleins-30', text: 'Grundschule 3. Klasse Einmaleins automatisieren, 30 Minuten', erwartet: { modus: 'ablauf', kriterien: { bildungsstufe: 'primar', zielart: 'fakten' } } },
  { id: 'r2-gs-sachunterricht-strom-90', text: 'Sachunterricht Klasse 4: einfacher Stromkreis mit Batterie und Lämpchen ausprobieren, Doppelstunde', erwartet: { kriterien: { bildungsstufe: 'primar', fachbereich: 'nawi-technik', zeitMin: 90 } } },
  { id: 'r2-gs-sport-ballgewoehnung-45', text: 'Sport 1. Klasse Ballgewöhnung, 45 Minuten', erwartet: { praxis: true, kette: 'fertigkeit-bewegung', kriterien: { bildungsstufe: 'primar' } } },
  { id: 'r2-gs-musik-lied-45', text: 'Musik Klasse 2: ein neues Lied singen lernen, 45 Minuten', erwartet: { praxis: true, kriterien: { fachbereich: 'aesthetik', zielart: 'bewegung' } } },
  { id: 'r2-gs-kunst-collage-90', text: 'Kunst 4. Klasse Collage zum Thema Herbst gestalten, 90 Minuten', erwartet: { kette: 'produktion', kriterien: { fachbereich: 'aesthetik' } } },
  { id: 'r2-gs-religion-feste-45', text: 'Religion Klasse 3 Feste der Weltreligionen, 45 Minuten', erwartet: { kriterien: { fachbereich: 'gesellschaft' } } },
  { id: 'r2-gs-englisch-farben-20', text: 'Englisch in der Grundschule, Klasse 1, colours spielerisch einführen, 20 Minuten', erwartet: { modus: 'phase', kriterien: { bildungsstufe: 'primar' } } },

  // Sekundarstufe I
  { id: 'r2-s1-mathe-wahrscheinlichkeit-45', text: 'Mathe 7. Klasse Wahrscheinlichkeit mit Würfelexperimenten, 45 Min', erwartet: { kriterien: { fachbereich: 'mathe-informatik', bildungsstufe: 'sek1' } } },
  { id: 'r2-s1-mathe-terme-lk-45', text: 'Mathematik Klasse 8 Terme vereinfachen, 45 Minuten, am Ende kurze schriftliche Überprüfung', erwartet: { leistungskontrolle: true } },
  { id: 'r2-s1-deutsch-erzaehlung-90', text: 'Deutsch 6 Erzählung schreiben, Spannungsbogen, Doppelstunde', erwartet: { kette: 'produktion', kriterien: { zeitMin: 90 } } },
  { id: 'r2-s1-deutsch-zeitung-60', text: 'Deutsch Klasse 9: Zeitungsartikel analysieren, 60 Minuten, Sachtext', erwartet: { kriterien: { fachbereich: 'sprachen' } } },
  { id: 'r2-s1-englisch-dialog-45', text: 'Englisch Klasse 7 Speaking: Dialoge beim Einkaufen üben, 45 Minuten, 28 Schüler', erwartet: { kriterien: { gruppe: 28 } } },
  { id: 'r2-s1-franz-vokabeln-lk-45', text: 'Französisch Klasse 7, Vokabeltest und danach neue Lektion einführen, 45 Minuten', erwartet: { leistungskontrolle: true, kriterien: { fachbereich: 'sprachen' } } },
  { id: 'r2-s1-bio-mikroskop-90', text: 'Biologie Klasse 6 Mikroskopieren lernen: Zwiebelhaut, 90 Minuten', erwartet: { praxis: true, kriterien: { fachbereich: 'nawi-technik' } } },
  { id: 'r2-s1-chemie-sicherheit-45', text: 'Chemie Anfangsunterricht Klasse 7: Sicherheitsregeln im Labor und Brenner anzünden, 45 Minuten', erwartet: { praxis: true } },
  { id: 'r2-s1-physik-hebel-45', text: 'Physik Klasse 8 Hebelgesetz, Schülerexperiment in Gruppen, 45 Minuten', erwartet: { kriterien: { fachbereich: 'nawi-technik' } } },
  { id: 'r2-s1-geschichte-quellen-45', text: 'Geschichte Klasse 8 Quellenarbeit zum Dreißigjährigen Krieg, 45 Minuten', erwartet: { kriterien: { fachbereich: 'gesellschaft' } } },
  { id: 'r2-s1-erdkunde-karte-45', text: 'Erdkunde Klasse 5 Atlasarbeit: Gradnetz der Erde, 45 Minuten', erwartet: { kriterien: { fachbereich: 'gesellschaft' } } },
  { id: 'r2-s1-politik-klassenrat-45', text: 'Politik/Sozialkunde Klasse 7: Regeln in der Klasse demokratisch aushandeln, 45 Minuten', erwartet: { kriterien: { fachbereich: 'gesellschaft' } } },
  { id: 'r2-s1-wirtschaft-taschengeld-45', text: 'Wirtschaft Klasse 8: Taschengeld und Budget planen, 45 Minuten', erwartet: { kriterien: { fachbereich: 'gesellschaft' } } },
  { id: 'r2-s1-informatik-binaer-45', text: 'Informatik Klasse 7 Binärzahlen ohne Computer (unplugged), 45 Minuten', erwartet: { kriterien: { fachbereich: 'mathe-informatik', maxTechnik: 't-keine' } } },
  { id: 'r2-s1-technik-loeten-90', text: 'Technik Klasse 9: Löten einer einfachen Schaltung im Werkraum, 90 Minuten, 16 Schüler', erwartet: { praxis: true, kriterien: { gruppe: 16 } } },
  { id: 'r2-s1-hauswirtschaft-kochen-90', text: 'Hauswirtschaft Klasse 8: gesundes Frühstück zubereiten in der Schulküche, 90 Minuten', erwartet: { praxis: true } },
  { id: 'r2-s1-sport-handball-lk-45', text: 'Sport Klasse 9 Handball Wurftechnik, Notengebung am Ende der Stunde, 45 min', erwartet: { praxis: true, leistungskontrolle: true } },
  { id: 'r2-s1-sport-tanz-45', text: 'Sport 7: HipHop-Tanz eine kurze Choreo einstudieren, 45 Minuten', erwartet: { praxis: true, kette: 'fertigkeit-bewegung' } },
  { id: 'r2-s1-ethik-gerechtigkeit-45', text: 'Ethik Klasse 9: Was ist gerecht? Gedankenexperimente, 45 Minuten', erwartet: { kriterien: { fachbereich: 'gesellschaft' } } },
  { id: 'r2-s1-darstellendes-spiel-90', text: 'Darstellendes Spiel Klasse 10: Improvisation und Szenenarbeit, 90 Minuten', erwartet: { praxis: true, kriterien: { fachbereich: 'aesthetik' } } },
  { id: 'r2-s1-medien-fakenews-45', text: 'Medienbildung Klasse 8: Fake News erkennen, 45 Minuten, Tablets vorhanden', erwartet: { kriterien: { maxTechnik: 't-einzeln' } } },
  { id: 'r2-s1-klassenleitung-45', text: 'Klassenleiterstunde Klasse 6: Streit in der Klasse besprechen, 45 Minuten', erwartet: {} },

  // Sekundarstufe II
  { id: 'r2-s2-mathe-ableitung-90', text: 'Oberstufe Mathe LK: Einführung Ableitung, Doppelstunde', erwartet: { kriterien: { bildungsstufe: 'sek2', zeitMin: 90 } } },
  { id: 'r2-s2-deutsch-faust-90', text: 'Deutsch Q1 Faust Szenenanalyse Gretchenfrage, 90 Minuten', erwartet: { kriterien: { bildungsstufe: 'sek2', fachbereich: 'sprachen' } } },
  { id: 'r2-s2-englisch-klausur-90', text: 'Englisch Sek II: Klausurvorbereitung Comment schreiben, 90 Minuten', erwartet: { nichtKriterien: { liefert: ['lernstand-diagnostiziert'] }, kriterien: { bildungsstufe: 'sek2' } } },
  { id: 'r2-s2-bio-genetik-60', text: 'Biologie Oberstufe Proteinbiosynthese, 60 Minuten, Lernkontrolle', erwartet: { leistungskontrolle: true, kriterien: { bildungsstufe: 'sek2' } } },
  { id: 'r2-s2-philo-kant-90', text: 'Philosophie Oberstufe: Kants kategorischer Imperativ, Textarbeit und Diskussion, 90 min', erwartet: { kriterien: { fachbereich: 'gesellschaft' } } },
  { id: 'r2-s2-geschichte-kalter-krieg-45', text: 'Geschichte 11: Kalter Krieg, Kubakrise, 45 Minuten, ohne Referate', erwartet: { nicht: ['referat'] } },
  { id: 'r2-s2-kunst-portrait-90', text: 'Kunst Oberstufe Porträt zeichnen nach Vorlage, 90 Minuten', erwartet: { kette: 'produktion' } },
  { id: 'r2-s2-sport-fitness-90', text: 'Sport Oberstufe Fitness und Krafttraining, 90 Minuten, Theorie und Praxis', erwartet: { praxis: true } },

  // Berufsbildung
  { id: 'r2-bb-elektro-schaltplan-90', text: 'Berufsschule Elektroniker 1. Lehrjahr: Schaltpläne lesen, 90 Minuten', erwartet: { kriterien: { bildungsstufe: 'berufsbildung', fachbereich: 'beruf-praxis' } } },
  { id: 'r2-bb-friseur-haare-90', text: 'Friseurausbildung: Haare schneiden Grundtechnik an Übungsköpfen, 90 Minuten, 12 Azubis', erwartet: { praxis: true, kriterien: { gruppe: 12, bildungsstufe: 'berufsbildung' } } },
  { id: 'r2-bb-kaufleute-reklamation-45', text: 'Kaufleute im Einzelhandel: Reklamationsgespräch führen, 45 Minuten, Rollenspiel', erwartet: { enthaelt: 'rollenspiel' } },
  { id: 'r2-bb-pflege-hygiene-lk-60', text: 'Pflegeausbildung: Händedesinfektion korrekt durchführen und praktische Prüfung, 60 Minuten', erwartet: { praxis: true, leistungskontrolle: true } },
  { id: 'r2-bb-gastro-service-90', text: 'Restaurantfachleute: Tisch eindecken und Service üben, 90 Minuten', erwartet: { praxis: true } },
  { id: 'r2-bb-it-netzwerk-90', text: 'Fachinformatiker Lernfeld 3: Netzwerk planen, 90 Minuten, Laptops', erwartet: { kriterien: { maxTechnik: 't-einzeln', bildungsstufe: 'berufsbildung' } } },
  { id: 'r2-bb-ueba-metall-180', text: 'Überbetriebliche Ausbildung Metall: Feilen und Bohren, 180 Minuten', erwartet: { praxis: true, kriterien: { zeitMin: 180 } } },

  // Hochschule
  { id: 'r2-hs-jura-fall-90', text: 'Jura Uni Seminar: Fallbearbeitung Kaufrecht, 90 Minuten, 30 Studierende', erwartet: { kriterien: { bildungsstufe: 'hochschule', gruppe: 30 } } },
  { id: 'r2-hs-medizin-anamnese-90', text: 'Medizinstudium: Anamnesegespräch mit Simulationspatienten üben, 90 Minuten', erwartet: { kriterien: { bildungsstufe: 'hochschule' } } },
  { id: 'r2-hs-ingenieur-vorlesung-90', text: 'Vorlesung Technische Mechanik, 250 Studierende, 90 Minuten, aktivierend', erwartet: { kriterien: { gruppe: 250, bildungsstufe: 'hochschule' } } },
  { id: 'r2-hs-lehramt-mikro-90', text: 'Lehramtsstudium Seminar: Unterrichtseinstiege erproben (Microteaching), 90 Minuten', erwartet: { enthaelt: 'microteaching' } },
  { id: 'r2-hs-bwl-klausur-60', text: 'BWL Tutorium: Klausuraufgaben Kostenrechnung durchrechnen, 60 Minuten', erwartet: { nichtKriterien: { liefert: ['lernstand-diagnostiziert'] } } },
  { id: 'r2-hs-online-statistik-60', text: 'Online-Seminar Statistik mit R, Studierende, 60 Minuten, Zoom', erwartet: { kriterien: { raumzeit: ['distanz'] } } },

  // Erwachsenenbildung / Weiterbildung
  { id: 'r2-eb-vhs-deutschkurs-90', text: 'VHS Integrationskurs Deutsch A2: beim Arzt, 90 Minuten, 15 Teilnehmende', erwartet: { kriterien: { bildungsstufe: 'erwachsenenbildung', gruppe: 15 } } },
  { id: 'r2-eb-erste-hilfe-120', text: 'Erste-Hilfe-Kurs für Erwachsene: stabile Seitenlage und Herzdruckmassage, 120 Minuten', erwartet: { praxis: true } },
  { id: 'r2-eb-lehrerfortbildung-ki-90', text: 'Lehrerfortbildung: KI im Unterricht ausprobieren, 90 Minuten, 20 Lehrkräfte', erwartet: { kriterien: { bildungsstufe: 'erwachsenenbildung' } } },
  { id: 'r2-eb-firma-onboarding-60', text: 'Betriebliche Weiterbildung: Onboarding neuer Mitarbeitender, Datenschutzgrundlagen, 60 Minuten', erwartet: { kriterien: { bildungsstufe: 'erwachsenenbildung' } } },
  { id: 'r2-eb-senioren-smartphone-90', text: 'Seniorenkurs: Smartphone Grundlagen, WhatsApp nutzen, 90 Minuten, 8 Teilnehmende', erwartet: { praxis: true, kriterien: { gruppe: 8 } } },
  { id: 'r2-eb-yoga-60', text: 'Volkshochschule Yoga für Anfänger, 60 Minuten', erwartet: { praxis: true, kriterien: { bildungsstufe: 'erwachsenenbildung' } } },

  // Querschnitt: Mehrfachwünsche, Verneinungen, Teilgruppen
  { id: 'r2-x-ohne-frontal-45', text: 'Bio Klasse 9 Immunsystem, 45 Minuten, bitte kein Frontalunterricht und kein Lehrervortrag', erwartet: { nicht: ['lehrervortrag', 'vorlesung-klassisch'], ohneInteraktion: ['plenum-lehrergeleitet'] } },
  { id: 'r2-x-inklusion-45', text: 'Mathe Klasse 6 Flächeninhalt, 45 Minuten, 24 Schüler, davon 2 mit Förderschwerpunkt Lernen und 1 Rollstuhlfahrer', erwartet: { kriterien: { gruppe: 24 } } },
  { id: 'r2-x-vertretung-45', text: 'Vertretungsstunde Klasse 8 fachfremd, 45 Minuten, ohne Vorbereitung, egal welches Thema', erwartet: { kriterien: { maxVorbereitung: 5 } } },
  { id: 'r2-x-projekttag-300', text: 'Projekttag Nachhaltigkeit Klasse 9, 5 Zeitstunden', erwartet: { kriterien: { zeitMin: 300 } } },
  { id: 'r2-x-draussen-45', text: 'Biologie Klasse 5 Bäume bestimmen auf dem Schulhof, draußen, 45 Minuten', erwartet: { praxis: true } },
  { id: 'r2-x-englisch-sprachig-45', text: 'Year 8 History lesson on the Industrial Revolution, 45 minutes', erwartet: { kriterien: { zeitMin: 45 } } }
];
