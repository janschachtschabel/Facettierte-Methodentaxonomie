# Qualitätstest Szenariovorschläge, 2026-11-26

## Use Case: „Sportunterricht 45 Minuten, Ausdauertraining mit anschließender Leistungskontrolle“

**Vorher (main, PR 1–9):** Think-Pair-Share › Partnerpuzzle › Strukturierte Einzelarbeit (Stillarbeit) › Kurztransfer-Aufgabe › Two Stars and a Wish. Die Kette „Bewegung und praktische Fertigkeit“ stimmte, aber alle Hauptphasen waren Klassenraummethoden. „Ausdauertraining“ wurde nicht als Bewegungsziel erkannt, „Leistungskontrolle“ gar nicht; dafür las die semantische Schätzung „kooperativ“ und „geleitet“. Im MCP-Ergebnis hieß das Thema „ein Szenario unterstellen für den - ausdauertraining mit anschließender leistungskontrolle“. Fachdidaktisch unbrauchbar: kein Aufwärmen, keine Belastungsphase, kein Test.

**Nachher:** Klassenspaziergang (8 min) › Bewegungsdemonstration & Nachmachen › Bodypercussion › Kurztransfer-Aufgabe › Two Stars and a Wish (als Leistungskontrolle) › Reflexionsprompt, 45 min, gültig, Thema „ausdauertraining“. Zielart Psychomotorik und die Prüfphase werden erkannt, die Hauptphasen sind überwiegend Bewegungsmethoden. **Immer noch schwach**, und zwar wegen des Katalogs: Es gibt keine Ausdauer-Trainingsmethode (Bodypercussion ist die beste vorhandene Bewegungsübung), keine kurze Spiel- oder Anwendungsform für Sport und keinen sportmotorischen Test. Eine Fachkraft würde planen: Aufwärmen (8) › Dauer- oder Intervalllauf (20) › Ausdauertest, z. B. 6-Minuten-Lauf (12) › Cool-down und Auswertung (5).

## Ergebnis der Suite

48 realistische Anfragen (Sport, Musik, Kunst, Berufsschule, Pflege, MINT, Sprachen, Gesellschaft, Grundschule, Hochschule, Erwachsenenbildung; 20–90 Minuten; Leistungskontrollen, Verneinungen, Teilgruppen, genannte Methoden, dazu Gegenproben aus dem Review wie „ohne Benotung“ oder „Nachbesprechung der Klassenarbeit“). Vorher 26 Befunde (bei den ersten 38 Fällen), nachher 0 offene Befunde und 12 bekannte Datenlücken (11-mal die Transferphase in Praxisstunden, einmal Kleinstgruppen).

**Stärken:** gültige Abläufe und saubere Zeitlogik in allen Fällen; genannte Methoden werden eingebaut; gute Variabilität (41 verschiedene Abläufe, häufigster 4 %); Fachbereich und Bildungsstufe werden zuverlässig gelesen.

**Schwächen, die behoben sind:** Verneinungen wirkten als Wunsch („keine Gruppenarbeit“ ergab Gruppenarbeit, „ohne Experimente“ forschendes Lernen); „3 Schüler mit Förderbedarf“ wurde als Gruppengröße 3 gelesen; Leistungs- und Lernkontrollen fehlten im Ablauf; im Sport landeten Stillarbeit, Vortrag und Partnerpuzzle in den Hauptphasen; ein 20-Minuten-Ablauf dauerte 25 Minuten; Musik („Rhythmus klatschen“) und Berufspraxis („Reifenwechsel üben“) bekamen Konzeptaufbau oder nur Einzelphasen; das Thema enthielt Anfrage-Floskeln.

**Schwächen, die offen bleiben (Daten, siehe Vorschläge):** Transferphase in Praxisstunden (Kurztransfer-Aufgabe statt Spielform); im Sport wirkt die Einstimmung oft wie Klassenraum (Klassenspaziergang, Soziometrie) statt Aufwärmen; Leistungskontrolle im Sport über allgemeine Feedbackmethoden statt Messung; „Freispiel (Primar)“ kann in der Berufsschule erscheinen; Informatik-Programmierstunden bekommen kaum Programmierpraxis.

## Datenvorschläge (zur Durchsicht, nicht umgesetzt)

- **S1 Spielform / Zielspiel (Sport, Praxis):** kurze Anwendungsform (10–20 min), Lernfunktion Anwendung, liefert transfer-gezeigt, Zielart Psychomotorik, Fachbereich sport. Schließt die bekannte Lücke in 11 Fällen.
- **S2 Aufwärmen / Aufwärmspiel:** 5–10 min, Orientierung, liefert vorwissen-aktiviert, Fachbereich sport (Herz-Kreislauf, Mobilisation, kleine Spiele).
- **S3 Dauer- und Intervallmethode (Ausdauertraining):** 15–30 min, Konsolidierung/Anwendung, liefert prozedur-gelaeufig, Fachbereich sport; Varianten Fahrtspiel, Intervall, Dauerlauf nach Puls.
- **S4 Sportmotorischer Test / Leistungsmessung:** 10–20 min, Diagnose als erste Lernfunktion, liefert lernstand-diagnostiziert, Fachbereich sport (z. B. 6-Minuten-Lauf, Cooper-Test, Weitsprung-Messung mit Bewertungsbogen).
- **S5 Cool-down mit Belastungsrückmeldung:** 3–8 min, Metakognition, Fachbereich sport.
- **S6 Kette „Kondition und Training“:** Aufwärmen › Belastung › (Leistungsprüfung) › Abwärmen und Auswerten, Zielart Psychomotorik. Die bisherige Kette „Vormachen – Üben – Anwenden“ passt zu Technik, nicht zu Ausdauer und Kraft.
- **S7 „Freispiel (Primar)“:** ungeeignet für Sek II, Berufsbildung, Hochschule und Erwachsenenbildung markieren.
- **S9 Kleinstgruppen (unter 4 Personen):** kurze Einstiegsmethoden für „Fehlvorstellungen sichtbar machen“ mit gruppeMin 1 (z. B. Vorhersage-Aufgabe, Fehlerbild-Diagnose); heute bleibt nur Just-in-Time-Teaching mit 20 Minuten, der 45-Minuten-Ablauf läuft auf 50 Minuten (schon vor diesem PR so).
- **S8 Programmierpraxis:** eine Methode für angeleitetes Programmieren (z. B. Pair Programming / Live Coding), Fachbereich mathe-informatik.

## Wiederholen

`npm run qualitaet` druckt den aktuellen Bericht; `npm test` prüft die Fälle als Teil der CI (`packages/fmt-core/test/qualitaet.test.ts`). Neue Fälle kommen in `packages/fmt-core/test/qualitaet/faelle.ts`.

## Aktueller Bericht

48 Fälle, 0 offene Befunde, 12 bekannte Datenlücken.
Variabilität: 41 verschiedene Abläufe, häufigster 4 %; Sport: 10 verschiedene, häufigster 18 %.

| Fall | Kette | Ablauf | Befund |
|---|---|---|---|
| sport-ausdauer-lk-45 | fertigkeit-bewegung | klassenspaziergang › demonstration-nachmachen › gebundene-musik-rhythmus › blitz-anwendung › zwei-sterne-ein-wunsch › reflexionsprompt (45 min) | ◐ praxis: Hauptphasen ohne Praxis: blitz-anwendung; Praxisanteil 50 % (bekannt: Katalog hat keine kurze Spiel- oder Anwendungsform für Sport und Praxis (unter 15 min, liefert transfer-gezeigt); Datenvorschlag S1) |
| sport-ausdauer-45 | fertigkeit-bewegung | soziometrie-aufstellung › demonstration-nachmachen › differenzielles-lernen › blitz-anwendung › votum-ei (45 min) | ◐ praxis: Hauptphasen ohne Praxis: blitz-anwendung; Praxisanteil 60 % (bekannt: Katalog hat keine kurze Spiel- oder Anwendungsform für Sport und Praxis (unter 15 min, liefert transfer-gezeigt); Datenvorschlag S1) |
| sport-basketball-lk-45 | fertigkeit-bewegung | gebundene-musik-rhythmus › demonstration-nachmachen › vier-stufen-methode › blitz-anwendung › exit-ticket › votum-ei (45 min) | ◐ praxis: Hauptphasen ohne Praxis: blitz-anwendung; Praxisanteil 50 % (bekannt: Katalog hat keine kurze Spiel- oder Anwendungsform für Sport und Praxis (unter 15 min, liefert transfer-gezeigt); Datenvorschlag S1) |
| sport-turnen-90 | fertigkeit-bewegung | klassenspaziergang › demonstration-nachmachen › stationstraining-bewegung › differenzielles-lernen › reflexionsprompt (90 min) | ✓ |
| sport-fussball-20 | Einzelphase | demonstration-nachmachen, differenzielles-lernen, gebundene-musik-rhythmus, klassenspaziergang | ✓ |
| sport-schwimmen-45 | fertigkeit-bewegung | soziometrie-aufstellung › demonstration-nachmachen › stationstraining-bewegung › blitz-anwendung › reflexionsprompt (45 min) | ◐ praxis: Hauptphasen ohne Praxis: blitz-anwendung; Praxisanteil 60 % (bekannt: Katalog hat keine kurze Spiel- oder Anwendungsform für Sport und Praxis (unter 15 min, liefert transfer-gezeigt); Datenvorschlag S1) |
| sport-volleyball-45 | fertigkeit-bewegung | stummer-impuls › demonstration-nachmachen › stationstraining-bewegung › blitz-anwendung › reflexionsprompt (45 min) | ◐ praxis: Hauptphasen ohne Praxis: blitz-anwendung; Praxisanteil 60 % (bekannt: Katalog hat keine kurze Spiel- oder Anwendungsform für Sport und Praxis (unter 15 min, liefert transfer-gezeigt); Datenvorschlag S1) |
| sport-tanz-90 | fertigkeit-bewegung | klassenspaziergang › demonstration-nachmachen › stationstraining-bewegung › differenzielles-lernen › reflexionsprompt (90 min) | ✓ |
| sport-zirkel-60-gs | fertigkeit-bewegung | gebundene-musik-rhythmus › demonstration-nachmachen › stationstraining-bewegung › blitz-anwendung › reflexionsprompt (60 min) | ◐ praxis: Hauptphasen ohne Praxis: blitz-anwendung; Praxisanteil 60 % (bekannt: Katalog hat keine kurze Spiel- oder Anwendungsform für Sport und Praxis (unter 15 min, liefert transfer-gezeigt); Datenvorschlag S1) |
| sport-weitsprung-lk-90 | fertigkeit-bewegung | klassenspaziergang › demonstration-nachmachen › stationstraining-bewegung › differenzielles-lernen › beobachtungsbogen › zwei-sterne-ein-wunsch (90 min) | ✓ |
| sport-ausdauer-foerder-45 | fertigkeit-bewegung | tps › demonstration-nachmachen › gebundene-musik-rhythmus › blitz-anwendung › zwei-sterne-ein-wunsch (45 min) | ◐ praxis: Hauptphasen ohne Praxis: blitz-anwendung; Praxisanteil 40 % (bekannt: Katalog hat keine kurze Spiel- oder Anwendungsform für Sport und Praxis (unter 15 min, liefert transfer-gezeigt); Datenvorschlag S1) |
| musik-rhythmus-45 | fertigkeit-bewegung | gebundene-musik-rhythmus › demonstration-nachmachen › differenzielles-lernen › blitz-anwendung › votum-ei (45 min) | ◐ praxis: Hauptphasen ohne Praxis: blitz-anwendung; Praxisanteil 60 % (bekannt: Katalog hat keine kurze Spiel- oder Anwendungsform für Sport und Praxis (unter 15 min, liefert transfer-gezeigt); Datenvorschlag S1) |
| kunst-malen-90 | produktion | positionslinie › demonstration-nachmachen › markt-der-moeglichkeiten › reflexionsprompt (90 min) | ✓ |
| berufsschule-reifen-90 | fertigkeit-bewegung | freispiel-primar › drei-stufen-lektion › lerntheke › blitz-anwendung › votum-ei (90 min) | ◐ praxis: Hauptphasen ohne Praxis: blitz-anwendung; Praxisanteil 60 % (bekannt: Katalog hat keine kurze Spiel- oder Anwendungsform für Sport und Praxis (unter 15 min, liefert transfer-gezeigt); Datenvorschlag S1) |
| pflege-unterweisung-60 | fertigkeit-bewegung | soziometrie-aufstellung › vier-stufen-methode › loesungsbeispiele › blitz-anwendung › blitzlicht (60 min) | ◐ praxis: Hauptphasen ohne Praxis: blitz-anwendung; Praxisanteil 60 % (bekannt: Katalog hat keine kurze Spiel- oder Anwendungsform für Sport und Praxis (unter 15 min, liefert transfer-gezeigt); Datenvorschlag S1) |
| deutsch-lernkontrolle-45 | kooperatives-lernen | gruppenbildung-zufall › kooperatives-skript › zickzack-dialog › zwei-sterne-ein-wunsch (45 min) | ✓ |
| physik-lernzielkontrolle-45 | konzeptaufbau | ampelspiel › vortrag-prompts › karteikarten-leitner › blitz-anwendung › multiple-choice-test › selbstevaluation-bogen (45 min) | ✓ |
| mathe-test-45 | konzeptaufbau | ampelspiel › vortrag-prompts › multiple-choice-test › blitz-anwendung › one-minute-paper › selbstevaluation-bogen (45 min) | ✓ |
| englisch-vokabeltest-30 | faktenwissen | abc-liste › chorsprechen › abrufquiz › vokabeltest-kurzkontrolle (30 min) | ✓ |
| bio-fotosynthese-45 | kooperatives-lernen | tps › kooperatives-skript › klassen-glossar › zwei-sterne-ein-wunsch (45 min) | ✓ |
| geschichte-weimar-90 | konzeptaufbau | ampelspiel › entdeckendes-lernen › abrufquiz › lernprodukt-galerie › reflexionsprompt (90 min) | ✓ |
| politik-wahlrecht-90 | urteilsbildung | positionslinie › lehrgespraech › dynamische-urteilsbildung › switch-rollentausch (90 min) | ✓ |
| sachunterricht-wasser-45 | konzeptaufbau | ampelspiel › vortrag-prompts › brain-dump › blitz-anwendung › reflexionsprompt (45 min) | ✓ |
| mathe-brueche-60 | konzeptaufbau | ampelspiel › sos-modell › karteikarten-leitner › scamper › reflexionsprompt (60 min) | ✓ |
| informatik-scratch-45 | produktion | methode-66 › aktives-zuhoeren › museumsgang › zwei-sterne-ein-wunsch (45 min) | ✓ |
| hochschule-statistik-90 | konzeptaufbau | ampelspiel › vorlesung-klassisch › vortrag-prompts › karteikarten-leitner › blitz-anwendung › reflexionsprompt (90 min) | ✓ |
| evb-zeitmanagement-60 | konzeptaufbau | ampelspiel › kooperatives-skript › abrufquiz › scamper › votum-ei (60 min) | ✓ |
| chemie-saeuren-20 | Einzelphase | abrufquiz, kooperatives-skript, verschachteltes-ueben, kofferpacken | ✓ |
| erdkunde-klima-30 | Einzelphase | abrufquiz, vortrag-prompts, brain-dump, reflexionsprompt | ✓ |
| neg-gruppenarbeit-60 | konzeptaufbau | ampelspiel › kooperatives-skript › abrufquiz › stegreiftheater › reflexionsprompt (60 min) | ✓ |
| neg-partner-gruppe-45 | konzeptaufbau | ampelspiel › induktives-entdecken › abrufquiz › blitz-anwendung › reflexionsprompt (45 min) | ✓ |
| neg-experimente-90 | konzeptaufbau | ampelspiel › wirbelgruppe › karteikarten-leitner › pecha-kucha › votum-ei (90 min) | ✓ |
| neg-tablets-45 | prozedur | impulsreferat › tafelbild-entwicklung › loesungsbeispiele › abrufquiz (45 min) | ✓ |
| neg-diskussion-45 | konzeptaufbau | schreibgespraech › vortrag-prompts › abrufquiz › blitz-anwendung › votum-ei (45 min) | ✓ |
| teilgruppe-foerder-45 | direkte-instruktion | erotematik › lehrervortrag › blitz-anwendung › rosenshine-daily-review › karteikarten-leitner (45 min) | ✓ |
| teilgruppe-daz-90 | kooperatives-lernen | woerterwiese › kooperatives-skript › lautleseverfahren › multiple-choice-test (90 min) | ✓ |
| kein-check-benoetigen-45 | konzeptaufbau | ampelspiel › ki-tutor › flashcard-spaced-repetition › blitz-anwendung › votum-ei (45 min) | ✓ |
| kein-check-ohne-benotung-45 | konzeptaufbau | ampelspiel › vortrag-prompts › karteikarten-leitner › blitz-anwendung › votum-ei (45 min) | ✓ |
| kein-check-verneint-45 | konzeptaufbau | ampelspiel › wirbelgruppe › brain-dump › blitz-anwendung › reflexionsprompt (45 min) | ✓ |
| kein-check-vorbereitung-45 | konzeptaufbau | ampelspiel › vortrag-prompts › brain-dump › switch-rollentausch › reflexionsprompt (45 min) | ✓ |
| kein-check-nachbesprechung-45 | konzeptaufbau | ampelspiel › wirbelgruppe › karteikarten-leitner › blitz-anwendung › reflexionsprompt (45 min) | ✓ |
| fach-nach-verneinung-45 | konzeptaufbau | ampelspiel › vortrag-prompts › karteikarten-leitner › blitz-anwendung › votum-ei (45 min) | ✓ |
| teilgruppe-zweistellig-45 | konzeptaufbau | ampelspiel › wirbelgruppe › karteikarten-leitner › blitz-anwendung › reflexionsprompt (45 min) | ✓ |
| wunsch-nach-verneinung-45 | kooperatives-lernen | numbered-heads-together › gruppenarbeit-klassisch › kofferpacken › zwei-sterne-ein-wunsch (45 min) | ✓ |
| kleingruppe-3-45 | konzeptaufbau | just-in-time-teaching › ki-tutor › abrufquiz › blitz-anwendung › reflexionsprompt (50 min) | ◐ zeit: 50 von 45 min (bekannt: Für Gruppen unter 4 Personen bleibt im Einstieg „Fehlvorstellungen sichtbar machen“ nur Just-in-Time-Teaching (mind. 20 min); Datenvorschlag S9) |
| nennung-gruppenpuzzle-90 | kooperatives-lernen | murmelgruppe › gruppenpuzzle › partnerarbeit › beobachtungsbogen (90 min) | ✓ |
| nennung-tps-45 | kooperatives-lernen | tps › partnerpuzzle › klassen-glossar › zwei-sterne-ein-wunsch (45 min) | ✓ |
| nennung-stationen-sport-45 | fertigkeit-bewegung | gebundene-musik-rhythmus › demonstration-nachmachen › stationstraining-bewegung › blitz-anwendung › reflexionsprompt (45 min) | ◐ praxis: Hauptphasen ohne Praxis: blitz-anwendung; Praxisanteil 60 % (bekannt: Katalog hat keine kurze Spiel- oder Anwendungsform für Sport und Praxis (unter 15 min, liefert transfer-gezeigt); Datenvorschlag S1) |
