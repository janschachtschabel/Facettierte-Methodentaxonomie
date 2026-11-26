# Qualitätstest nach Umsetzung von A–C und S1–S9 (2026-11-26)

Umgesetzt in PR 12 (A: Anfragen lesen), PR 13 (B: Lernort und Thema), PR 14 (C: Mehrfachwünsche und Ausweichen) und PR 15 (Daten S1–S9, Lernort je Methode).

## Use Case: „Sportunterricht 45 Minuten, Ausdauertraining mit anschließender Leistungskontrolle“

| Stand | Vorschlag |
|---|---|
| vor PR 10 | Think-Pair-Share › Partnerpuzzle › Stillarbeit › Kurztransfer › Two Stars and a Wish |
| nach PR 10 | Klassenspaziergang › Bewegungsdemonstration › Bodypercussion › Kurztransfer › Two Stars and a Wish › Reflexionsprompt |
| jetzt | **Aufwärmen › Dauer- und Intervallmethode › Spielform/Zielspiel › Beobachtungsbogen (Leistungskontrolle) › Cool-down und Auswertung**, Kette „Kondition und Training“, 45 min, gültig |

Mit „Leistungsmessung“ oder „Cooper-Test“ im Text wird der sportmotorische Test gewählt (z. B. Weitsprung, Basketball). Ohne diesen Hinweis ist ein Beobachtungsbogen die Prüfphase.

## Kennzahlen

| | vor PR A | jetzt |
|---|---|---|
| Reihe 1 (48 Fälle, Gate): offene Befunde | 0 | 0 |
| Reihe 1: bekannte Datenlücken | 12 | 4 |
| Reihe 2 (63 Fälle): offene Befunde | 41 | 12 |
| Abläufe mit Kette Konzeptaufbau | 55 von 107 | 35 von 107 |
| häufigste erste Methode | Ampelspiel 45 von 107 | Ampelspiel 17 von 107 |
| Methoden im Katalog | 289 | 298 |

## Was noch offen ist

1. **Transferphase in Praxisstunden außerhalb des Sports** (Musik, Pflege, Darstellendes Spiel, Chemie, Senioren-Smartphone): Es fehlt eine kurze praktische Anwendungsform für diese Fächer. Darum steht dort oft die sitzende Kurztransfer-Aufgabe (6 von 12 Befunden).
2. **Dauer- und Intervallmethode als Übungsphase** in Ballspiel und Tanz: Sie liefert „Prozedur geläufig“ und passt damit formal in jede Übungsphase. Fachlich gehört sie zum Konditionstraining.
3. **Vokabeltest Französisch:** Die Leistungskontrolle wird gelesen, aber im Ablauf von Lesemethoden verdrängt.
4. **Vorlesung Ingenieurwesen, 250 Studierende:** bleibt ungültig (älterer Befund, Peer Instruction fällt im späteren Schritt heraus).
5. **„Draußen“ in Biologie:** Nur wenige Methoden sind für draußen markiert; die Hauptphasen bleiben überwiegend Klassenraummethoden.

## Wiederholen

`npm run qualitaet` (Reihe 1) und `npx tsx packages/fmt-core/test/qualitaet/bericht.ts reihe2` (Reihe 2).

## Bericht Reihe 1

48 Fälle, 0 offene Befunde, 4 bekannte Datenlücken.
Variabilität: 43 verschiedene Abläufe, häufigster 4 %; Sport: 10 verschiedene, häufigster 18 %.

| Fall | Kette | Ablauf | Befund |
|---|---|---|---|
| sport-ausdauer-lk-45 | kondition-training | aufwaermen › dauer-intervallmethode › spielform-zielspiel › beobachtungsbogen › cool-down-auswertung (45 min) | ✓ |
| sport-ausdauer-45 | kondition-training | aufwaermen › dauer-intervallmethode › spielform-zielspiel › cool-down-auswertung (45 min) | ✓ |
| sport-basketball-lk-45 | fertigkeit-bewegung | aufwaermen › demonstration-nachmachen › dauer-intervallmethode › blitz-anwendung › sportmotorischer-test › cool-down-auswertung (45 min) | ◐ praxis: Hauptphasen ohne Praxis: blitz-anwendung; Praxisanteil 83 % (bekannt: Katalog hat keine kurze Spiel- oder Anwendungsform für Sport und Praxis (unter 15 min, liefert transfer-gezeigt); Datenvorschlag S1) |
| sport-turnen-90 | fertigkeit-bewegung | aufwaermen › demonstration-nachmachen › stationstraining-bewegung › spielform-zielspiel › cool-down-auswertung (90 min) | ✓ |
| sport-fussball-20 | Einzelphase | sportmotorischer-test, demonstration-nachmachen, aufwaermen, dauer-intervallmethode | ✓ |
| sport-schwimmen-45 | fertigkeit-bewegung | aufwaermen › demonstration-nachmachen › dauer-intervallmethode › spielform-zielspiel › cool-down-auswertung (45 min) | ✓ |
| sport-volleyball-45 | fertigkeit-bewegung | aufwaermen › demonstration-nachmachen › dauer-intervallmethode › spielform-zielspiel › cool-down-auswertung (45 min) | ✓ |
| sport-tanz-90 | fertigkeit-bewegung | klassenspaziergang › demonstration-nachmachen › dauer-intervallmethode › differenzielles-lernen › cool-down-auswertung (90 min) | ✓ |
| sport-zirkel-60-gs | kondition-training | aufwaermen › stationstraining-bewegung › spielform-zielspiel › cool-down-auswertung (60 min) | ✓ |
| sport-weitsprung-lk-90 | fertigkeit-bewegung | kugellager › demonstration-nachmachen › stationstraining-bewegung › spielform-zielspiel › sportmotorischer-test › cool-down-auswertung (90 min) | ✓ |
| sport-ausdauer-foerder-45 | kondition-training | gebundene-musik-rhythmus › dauer-intervallmethode › spielform-zielspiel › cool-down-auswertung (45 min) | ✓ |
| musik-rhythmus-45 | fertigkeit-bewegung | gebundene-musik-rhythmus › demonstration-nachmachen › vier-stufen-methode › blitz-anwendung › votum-ei (45 min) | ◐ praxis: Hauptphasen ohne Praxis: blitz-anwendung; Praxisanteil 60 % (bekannt: Katalog hat keine kurze Spiel- oder Anwendungsform für Sport und Praxis (unter 15 min, liefert transfer-gezeigt); Datenvorschlag S1) |
| kunst-malen-90 | produktion | positionslinie › demonstration-nachmachen › markt-der-moeglichkeiten › reflexionsprompt (90 min) | ✓ |
| berufsschule-reifen-90 | fertigkeit-bewegung | stummer-impuls › vier-stufen-methode › praxisauftrag-arbeitsplatz › fall-simulation-osce › votum-ei (90 min) | ✓ |
| pflege-unterweisung-60 | fertigkeit-bewegung | erotematik › demonstration-nachmachen › praxisauftrag-arbeitsplatz › blitz-anwendung › blitzlicht (60 min) | ◐ praxis: Hauptphasen ohne Praxis: blitz-anwendung; Praxisanteil 40 % (bekannt: Katalog hat keine kurze Spiel- oder Anwendungsform für Sport und Praxis (unter 15 min, liefert transfer-gezeigt); Datenvorschlag S1)<br>◐ enthaelt: vier-stufen-methode fehlt (bekannt: Vier-Stufen-Methode erlaubt höchstens 12 Personen; bei 16 Auszubildenden fehlt das Ausweichen in Teilgruppen) |
| deutsch-lernkontrolle-45 | kooperatives-lernen | gruppenbildung-zufall › kooperatives-skript › zickzack-dialog › zwei-sterne-ein-wunsch (45 min) | ✓ |
| physik-lernzielkontrolle-45 | konzeptaufbau | vorhersage-aufgabe › vortrag-prompts › karteikarten-leitner › blitz-anwendung › multiple-choice-test › selbstevaluation-bogen (45 min) | ✓ |
| mathe-test-45 | konzeptaufbau | ampelspiel › vortrag-prompts › multiple-choice-test › blitz-anwendung › one-minute-paper › selbstevaluation-bogen (45 min) | ✓ |
| englisch-vokabeltest-30 | faktenwissen | abc-liste › chorsprechen › abrufquiz › vokabeltest-kurzkontrolle (30 min) | ✓ |
| bio-fotosynthese-45 | kooperatives-lernen | murmelgruppe › kooperatives-skript › klassen-glossar › zwei-sterne-ein-wunsch (45 min) | ✓ |
| geschichte-weimar-90 | konzeptaufbau | ampelspiel › entdeckendes-lernen › abrufquiz › lernprodukt-galerie › reflexionsprompt (90 min) | ✓ |
| politik-wahlrecht-90 | urteilsbildung | positionslinie › lehrgespraech › dynamische-urteilsbildung › switch-rollentausch (90 min) | ✓ |
| sachunterricht-wasser-45 | konzeptaufbau | ampelspiel › vortrag-prompts › brain-dump › blitz-anwendung › reflexionsprompt (45 min) | ✓ |
| mathe-brueche-60 | prozedur | stummer-impuls › vortrag-prompts › loesungsbeispiele › karteikarten-leitner (60 min) | ✓ |
| informatik-scratch-45 | produktion | stummer-impuls › aktives-zuhoeren › pair-programming › zwei-sterne-ein-wunsch (45 min) | ✓ |
| hochschule-statistik-90 | konzeptaufbau | vorhersage-aufgabe › vorlesung-klassisch › vortrag-prompts › karteikarten-leitner › blitz-anwendung › reflexionsprompt (90 min) | ✓ |
| evb-zeitmanagement-60 | konzeptaufbau | ampelspiel › kooperatives-skript › abrufquiz › scamper › votum-ei (60 min) | ✓ |
| chemie-saeuren-20 | Einzelphase | abrufquiz, kooperatives-skript, verschachteltes-ueben, kofferpacken | ✓ |
| erdkunde-klima-30 | Einzelphase | abrufquiz, vortrag-prompts, brain-dump, reflexionsprompt | ✓ |
| neg-gruppenarbeit-60 | konzeptaufbau | concept-cartoon › kooperatives-skript › abrufquiz › stegreiftheater › reflexionsprompt (60 min) | ✓ |
| neg-partner-gruppe-45 | konzeptaufbau | ampelspiel › induktives-entdecken › abrufquiz › blitz-anwendung › reflexionsprompt (45 min) | ✓ |
| neg-experimente-90 | konzeptaufbau | vier-ecken-methode › wirbelgruppe › karteikarten-leitner › pecha-kucha › votum-ei (90 min) | ✓ |
| neg-tablets-45 | prozedur | impulsreferat › tafelbild-entwicklung › loesungsbeispiele › abrufquiz (45 min) | ✓ |
| neg-diskussion-45 | konzeptaufbau | concept-cartoon › vortrag-prompts › abrufquiz › switch-rollentausch › votum-ei (45 min) | ✓ |
| teilgruppe-foerder-45 | direkte-instruktion | erotematik › lehrervortrag › blitz-anwendung › rosenshine-daily-review › karteikarten-leitner (45 min) | ✓ |
| teilgruppe-daz-90 | kooperatives-lernen | gruppenbildung-zufall › kooperatives-skript › lautleseverfahren › multiple-choice-test (90 min) | ✓ |
| kein-check-benoetigen-45 | konzeptaufbau | ampelspiel › ki-tutor › flashcard-spaced-repetition › blitz-anwendung › votum-ei (45 min) | ✓ |
| kein-check-ohne-benotung-45 | konzeptaufbau | ampelspiel › vortrag-prompts › karteikarten-leitner › blitz-anwendung › votum-ei (45 min) | ✓ |
| kein-check-verneint-45 | konzeptaufbau | ampelspiel › wirbelgruppe › brain-dump › blitz-anwendung › reflexionsprompt (45 min) | ✓ |
| kein-check-vorbereitung-45 | konzeptaufbau | ampelspiel › vortrag-prompts › brain-dump › switch-rollentausch › reflexionsprompt (45 min) | ✓ |
| kein-check-nachbesprechung-45 | urteilsbildung | stummer-impuls › text-exzerpieren › museumsgang › reflexionsprompt (45 min) | ✓ |
| fach-nach-verneinung-45 | konzeptaufbau | concept-cartoon › vortrag-prompts › karteikarten-leitner › blitz-anwendung › votum-ei (45 min) | ✓ |
| teilgruppe-zweistellig-45 | konzeptaufbau | concept-cartoon › wirbelgruppe › karteikarten-leitner › blitz-anwendung › reflexionsprompt (45 min) | ✓ |
| wunsch-nach-verneinung-45 | kooperatives-lernen | gruppenbildung-zufall › gruppenarbeit-klassisch › numbered-heads-together › zwei-sterne-ein-wunsch (45 min) | ✓ |
| kleingruppe-3-45 | konzeptaufbau | vorhersage-aufgabe › kooperatives-skript › abrufquiz › blitz-anwendung › reflexionsprompt (45 min) | ✓ |
| nennung-gruppenpuzzle-90 | kooperatives-lernen | murmelgruppe › gruppenpuzzle › partnerarbeit › beobachtungsbogen (90 min) | ✓ |
| nennung-tps-45 | kooperatives-lernen | tps › partnerpuzzle › klassen-glossar › zwei-sterne-ein-wunsch (45 min) | ✓ |
| nennung-stationen-sport-45 | kondition-training | aufwaermen › stationstraining-bewegung › spielform-zielspiel › cool-down-auswertung (45 min) | ✓ |

## Bericht Reihe 2

63 Fälle, 12 offene Befunde, 0 bekannte Datenlücken.
Variabilität: 61 verschiedene Abläufe, häufigster 3 %; Sport: 0 verschiedene, häufigster 0 %.

| Fall | Kette | Ablauf | Befund |
|---|---|---|---|
| r2-gs-deutsch-lesen-45 | prozedur | rosenshine-daily-review › chorsprechen › einzelarbeit-uebung › abrufquiz (45 min) | ✓ |
| r2-gs-mathe-einmaleins-30 | faktenwissen | abc-liste › vortrag-prompts › karteikarten-leitner › spiral-wiederholung (30 min) | ✓ |
| r2-gs-sachunterricht-strom-90 | fuenf-e | tps › experiment › wirbelgruppe › museumsgang › zwei-sterne-ein-wunsch (90 min) | ✓ |
| r2-gs-sport-ballgewoehnung-45 | fertigkeit-bewegung | aufwaermen › demonstration-nachmachen › dauer-intervallmethode › spielform-zielspiel › cool-down-auswertung (45 min) | ✓ |
| r2-gs-musik-lied-45 | fertigkeit-bewegung | gebundene-musik-rhythmus › demonstration-nachmachen › blitz-anwendung › verschachteltes-ueben › zwei-sterne-ein-wunsch (45 min) | ✗ praxis: Hauptphasen ohne Praxis: blitz-anwendung, verschachteltes-ueben; Praxisanteil 40 % |
| r2-gs-kunst-collage-90 | produktion | stummer-impuls › demonstration-nachmachen › galeriemethode › lerntagebuch (90 min) | ✓ |
| r2-gs-religion-feste-45 | konzeptaufbau | ampelspiel › wirbelgruppe › abrufquiz › blitz-anwendung › votum-ei (45 min) | ✓ |
| r2-gs-englisch-farben-20 | Einzelphase | lern-bingo, switch-rollentausch, kofferpacken, stegreiftheater | ✓ |
| r2-s1-mathe-wahrscheinlichkeit-45 | fuenf-e | vorhersage-aufgabe › kopfstandmethode › vortrag-prompts › blitz-anwendung › exit-ticket (45 min) | ✓ |
| r2-s1-mathe-terme-lk-45 | prozedur | vorhersage-aufgabe › vortrag-prompts › blitz-anwendung › vokabeltest-kurzkontrolle › one-minute-paper (45 min) | ✓ |
| r2-s1-deutsch-erzaehlung-90 | produktion | stummer-impuls › storytelling › kreatives-schreiben › lerntagebuch (90 min) | ✓ |
| r2-s1-deutsch-zeitung-60 | konzeptaufbau | ampelspiel › text-exzerpieren › brain-dump › pecha-kucha › votum-ei (60 min) | ✓ |
| r2-s1-englisch-dialog-45 | prozedur | rosenshine-daily-review › text-exzerpieren › uebung-variation › abrufquiz (45 min) | ✓ |
| r2-s1-franz-vokabeln-lk-45 | faktenwissen | ampelabfrage › vorlesen-lesung › text-exzerpieren › lautleseverfahren (45 min) | ✗ leistungskontrolle: letzte Phasen: text-exzerpieren, lautleseverfahren |
| r2-s1-bio-mikroskop-90 | fertigkeit-bewegung | demonstrationsexperiment › lernen-am-modell › praxisauftrag-arbeitsplatz › museumsgang › aktives-zuhoeren (90 min) | ✗ praxis: Hauptphasen ohne Praxis: museumsgang; Praxisanteil 60 % |
| r2-s1-chemie-sicherheit-45 | konzeptaufbau | vorhersage-aufgabe › simulationsspiel-digital › abrufquiz › blitz-anwendung › votum-ei (45 min) | ✗ praxis: Hauptphasen ohne Praxis: blitz-anwendung; Praxisanteil 20 % |
| r2-s1-physik-hebel-45 | urteilsbildung | stummer-impuls › erotematik › experiment › blitzlicht (45 min) | ✓ |
| r2-s1-geschichte-quellen-45 | konzeptaufbau | ampelspiel › wirbelgruppe › brain-dump › blitz-anwendung › reflexionsprompt (45 min) | ✓ |
| r2-s1-erdkunde-karte-45 | konzeptaufbau | concept-cartoon › wirbelgruppe › karteikarten-leitner › blitz-anwendung › reflexionsprompt (45 min) | ✓ |
| r2-s1-politik-klassenrat-45 | urteilsbildung | stummer-impuls › lehrervortrag › standbild › votum-ei (45 min) | ✓ |
| r2-s1-wirtschaft-taschengeld-45 | projektlernen | stummer-impuls › vortrag-prompts › swot-analyse › selbstevaluation-bogen (45 min) | ✓ |
| r2-s1-informatik-binaer-45 | konzeptaufbau | vorhersage-aufgabe › wirbelgruppe › abrufquiz › blitz-anwendung › votum-ei (45 min) | ✓ |
| r2-s1-technik-loeten-90 | fertigkeit-bewegung | vorhersage-aufgabe › lernen-am-modell › praxisauftrag-arbeitsplatz › simulationsspiel-digital › reflexionsprompt (90 min) | ✓ |
| r2-s1-hauswirtschaft-kochen-90 | fertigkeit-bewegung | abc-liste › vier-stufen-methode › praxisauftrag-arbeitsplatz › fall-simulation-osce › votum-ei (90 min) | ✓ |
| r2-s1-sport-handball-lk-45 | fertigkeit-bewegung | aufwaermen › demonstration-nachmachen › dauer-intervallmethode › blitz-anwendung › sportmotorischer-test › cool-down-auswertung (45 min) | ✗ praxis: Hauptphasen ohne Praxis: blitz-anwendung; Praxisanteil 83 % |
| r2-s1-sport-tanz-45 | fertigkeit-bewegung | gebundene-musik-rhythmus › demonstration-nachmachen › spielform-zielspiel › blitz-anwendung › cool-down-auswertung (45 min) | ✗ praxis: Hauptphasen ohne Praxis: blitz-anwendung; Praxisanteil 80 % |
| r2-s1-ethik-gerechtigkeit-45 | fuenf-e | ampelspiel › kopfstandmethode › vortrag-prompts › blitz-anwendung › abrufquiz (45 min) | ✓ |
| r2-s1-darstellendes-spiel-90 | konzeptaufbau | vier-ecken-methode › vortrag-prompts › kofferpacken › stegreiftheater › reflexionsprompt (90 min) | ✗ praxis: Hauptphasen ohne Praxis: vortrag-prompts; Praxisanteil 40 % |
| r2-s1-medien-fakenews-45 | urteilsbildung | stummer-impuls › lehrervortrag › peer-feedback-rubric › selbstevaluation-bogen (45 min) | ✓ |
| r2-s1-klassenleitung-45 | urteilsbildung | stummer-impuls › lehrervortrag › blitz-anwendung › zielscheiben-feedback (45 min) | ✓ |
| r2-s2-mathe-ableitung-90 | direkte-instruktion | erotematik › lehrervortrag › loesungsbeispiele › rosenshine-daily-review › klassen-glossar (90 min) | ✓ |
| r2-s2-deutsch-faust-90 | konzeptaufbau | vier-ecken-methode › kooperatives-skript › brain-dump › textlupe › reflexionsprompt (90 min) | ✓ |
| r2-s2-englisch-klausur-90 | produktion | stummer-impuls › storytelling › kreatives-schreiben › lerntagebuch (90 min) | ✓ |
| r2-s2-bio-genetik-60 | konzeptaufbau | ampelspiel › vortrag-prompts › abrufquiz › blitz-anwendung › beobachtungsbogen › reflexionsprompt (60 min) | ✓ |
| r2-s2-philo-kant-90 | urteilsbildung | positionslinie › kraftfeldanalyse › british-parliamentary-debate › blitzlicht (90 min) | ✓ |
| r2-s2-geschichte-kalter-krieg-45 | konzeptaufbau | concept-cartoon › vortrag-prompts › abrufquiz › blitz-anwendung › reflexionsprompt (45 min) | ✓ |
| r2-s2-kunst-portrait-90 | produktion | positionslinie › kooperatives-skript › pecha-kucha › votum-ei (90 min) | ✓ |
| r2-s2-sport-fitness-90 | kondition-training | kugellager › stationstraining-bewegung › spielform-zielspiel › cool-down-auswertung (90 min) | ✓ |
| r2-bb-elektro-schaltplan-90 | prozedur | stummer-impuls › sq3r-lesemethode › lerntheke › abrufquiz (90 min) | ✓ |
| r2-bb-friseur-haare-90 | fertigkeit-bewegung | methode-66 › demonstration-nachmachen › praxisauftrag-arbeitsplatz › fall-simulation-osce › votum-ei (90 min) | ✓ |
| r2-bb-kaufleute-reklamation-45 | urteilsbildung | stummer-impuls › lautes-denken › rollenspiel › votum-ei (45 min) | ✓ |
| r2-bb-pflege-hygiene-lk-60 | fertigkeit-bewegung | vorhersage-aufgabe › vier-stufen-methode › demonstration-nachmachen › blitz-anwendung › fall-simulation-osce › reflexionsprompt (60 min) | ✗ fachpassung: vorhersage-aufgabe<br>✗ praxis: Hauptphasen ohne Praxis: blitz-anwendung; Praxisanteil 50 % |
| r2-bb-gastro-service-90 | fertigkeit-bewegung | rosenshine-daily-review › demonstration-nachmachen › praxisauftrag-arbeitsplatz › experiment › votum-ei (90 min) | ✓ |
| r2-bb-it-netzwerk-90 | projektlernen | stummer-impuls › thinking-at-the-edge › experiment › kompetenzraster-diagnose (90 min) | ✓ |
| r2-bb-ueba-metall-180 | fertigkeit-bewegung | ampelspiel › vier-stufen-methode › praxisauftrag-arbeitsplatz › experiment › reflexionsprompt (180 min) | ✓ |
| r2-hs-jura-fall-90 | problemloesen | positionslinie › scamper › kooperatives-skript › peer-feedback-rubric (90 min) | ✓ |
| r2-hs-medizin-anamnese-90 | prozedur | klassenspaziergang › vortrag-prompts › loesungsbeispiele › lern-bingo (90 min) | ✓ |
| r2-hs-ingenieur-vorlesung-90 | konzeptaufbau | vortrag-prompts › vorlesung-klassisch › brain-dump › kompetenzraster-diagnose (90 min) | ✗ gueltig: [{"regel":"R-08","schwere":"Warnung","grundlage":"A","pfad":"/ablauf/teile/1","meldung":"Mehr als 20 Minuten am Stück im passiven Modus."},{"regel":"R-04","schwere":"Fehler","grundlage":"S","pfad":"/ablauf","meldung":"Funktion „Vorwissen und Fehlvorstellungen sichtbar machen“ ist nicht abgedeckt (Zielzustand fehlvorstellungen-sichtbar)."},{"regel":"R-04","schwere":"Fehler","grundlage":"S","pfad":"/ablauf","meldung":"Funktion „Transfer“ ist nicht abgedeckt (Zielzustand transfer-gezeigt)."}] |
| r2-hs-lehramt-mikro-90 | konzeptaufbau | ampelspiel › wirbelgruppe › brain-dump › peer-feedback-rubric › microteaching (90 min) | ✓ |
| r2-hs-bwl-klausur-60 | prozedur | gruppenbildung-zufall › vorlesen-lesung › lerntempo-duett › karteikarten-leitner (60 min) | ✓ |
| r2-hs-online-statistik-60 | kooperatives-lernen | murmelgruppe › kooperatives-skript › brain-dump › peer-instruction (60 min) | ✓ |
| r2-eb-vhs-deutschkurs-90 | konzeptaufbau | ampelspiel › sq3r-lesemethode › brain-dump › textlupe › votum-ei (90 min) | ✓ |
| r2-eb-erste-hilfe-120 | fertigkeit-bewegung | impulsreferat › lernen-am-modell › praxisauftrag-arbeitsplatz › fall-simulation-osce › zielscheiben-feedback (120 min) | ✓ |
| r2-eb-lehrerfortbildung-ki-90 | fuenf-e | wortwolke › planspiel-simulation-computer › ki-tutor › simulationsspiel-digital › multiple-choice-test (90 min) | ✓ |
| r2-eb-firma-onboarding-60 | konzeptaufbau | concept-cartoon › kooperatives-skript › kofferpacken › blitz-anwendung › reflexionsprompt (60 min) | ✓ |
| r2-eb-senioren-smartphone-90 | konzeptaufbau | concept-cartoon › entdeckendes-lernen › einzelarbeit-uebung › verschachteltes-ueben › votum-ei (90 min) | ✗ praxis: Hauptphasen ohne Praxis: verschachteltes-ueben; Praxisanteil 20 % |
| r2-eb-yoga-60 | fertigkeit-bewegung | gebundene-musik-rhythmus › demonstration-nachmachen › dauer-intervallmethode › spielform-zielspiel › cool-down-auswertung (60 min) | ✓ |
| r2-x-ohne-frontal-45 | konzeptaufbau | vorhersage-aufgabe › wirbelgruppe › brain-dump › blitz-anwendung › votum-ei (45 min) | ✓ |
| r2-x-inklusion-45 | kooperatives-lernen | tps › partnerpuzzle › klassen-glossar › zwei-sterne-ein-wunsch (45 min) | ✓ |
| r2-x-vertretung-45 | konzeptaufbau | vorhersage-aufgabe › wirbelgruppe › spiral-wiederholung › blitz-anwendung › votum-ei (45 min) | ✓ |
| r2-x-projekttag-300 | projektlernen | nominal-group-technique › strukturierte-kontroverse › waldpaedagogik › lerntagebuch (300 min) | ✓ |
| r2-x-draussen-45 | fuenf-e | blitzlicht › osborn-checkliste › vortrag-prompts › blitz-anwendung › ampelabfrage (45 min) | ✗ praxis: Hauptphasen ohne Praxis: osborn-checkliste, blitz-anwendung; Praxisanteil 20 % |
| r2-x-englisch-sprachig-45 | konzeptaufbau | concept-cartoon › wirbelgruppe › karteikarten-leitner › blitz-anwendung › one-minute-paper (45 min) | ✓ |
