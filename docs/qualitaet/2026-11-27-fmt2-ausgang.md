# Ausgangsstand der Qualitätsfälle vor FMT 2.0

Stand: Branch claude/project-thread-7yaiw3 vor Beginn von Paket A (origin/main 1d61ef9 plus Stufe 2); Ausgabe von `npm run qualitaet`, `reihe2`, `reihe3`.
Grundlage für `packages/fmt-core/test/ausgang.json`.

# Qualitätsbericht Szenariovorschläge

48 Fälle, 0 offene Befunde, 1 bekannte Datenlücken.
Variabilität: 43 verschiedene Abläufe, häufigster 4 %; Sport: 10 verschiedene, häufigster 18 %.

| Fall | Kette | Ablauf | Befund |
|---|---|---|---|
| sport-ausdauer-lk-45 | kondition-training | aufwaermen › dauer-intervallmethode › spielform-zielspiel › sportmotorischer-test › cool-down-auswertung (45 min) | ✓ |
| sport-ausdauer-45 | kondition-training | aufwaermen › dauer-intervallmethode › spielform-zielspiel › cool-down-auswertung (45 min) | ✓ |
| sport-basketball-lk-45 | fertigkeit-bewegung | aufwaermen › demonstration-nachmachen › teil-ganz-ueben › spielform-zielspiel › sportmotorischer-test › cool-down-auswertung (45 min) | ✓ |
| sport-turnen-90 | fertigkeit-bewegung | aufwaermen › demonstration-nachmachen › stationstraining-bewegung › spielform-zielspiel › cool-down-auswertung (90 min) | ✓ |
| sport-fussball-20 | Einzelphase | sportmotorischer-test, demonstration-nachmachen, aufwaermen, dauer-intervallmethode | ✓ |
| sport-schwimmen-45 | fertigkeit-bewegung | aufwaermen › demonstration-nachmachen › teil-ganz-ueben › spielform-zielspiel › cool-down-auswertung (45 min) | ✓ |
| sport-volleyball-45 | fertigkeit-bewegung | aufwaermen › demonstration-nachmachen › teil-ganz-ueben › spielform-zielspiel › cool-down-auswertung (45 min) | ✓ |
| sport-tanz-90 | fertigkeit-bewegung | klassenspaziergang › demonstration-nachmachen › teil-ganz-ueben › vorfuehrung-rueckmeldung › schuelercoaching (90 min) | ✓ |
| sport-zirkel-60-gs | kondition-training | aufwaermen › stationstraining-bewegung › spielform-zielspiel › cool-down-auswertung (60 min) | ✓ |
| sport-weitsprung-lk-90 | fertigkeit-bewegung | kugellager › demonstration-nachmachen › stationstraining-bewegung › spielform-zielspiel › sportmotorischer-test › cool-down-auswertung (90 min) | ✓ |
| sport-ausdauer-foerder-45 | kondition-training | gebundene-musik-rhythmus › dauer-intervallmethode › spielform-zielspiel › cool-down-auswertung (45 min) | ✓ |
| musik-rhythmus-45 | fertigkeit-bewegung | gebundene-musik-rhythmus › demonstration-nachmachen › teil-ganz-ueben › vorfuehrung-rueckmeldung › votum-ei (45 min) | ✓ |
| kunst-malen-90 | produktion | positionslinie › demonstration-nachmachen › markt-der-moeglichkeiten › reflexionsprompt (90 min) | ✓ |
| berufsschule-reifen-90 | fertigkeit-bewegung | clustering-schreiben › vier-stufen-methode › praxisauftrag-arbeitsplatz › vorfuehrung-rueckmeldung › votum-ei (90 min) | ✓ |
| pflege-unterweisung-60 | fertigkeit-bewegung | erotematik › demonstration-nachmachen › praxisauftrag-arbeitsplatz › vorfuehrung-rueckmeldung › blitzlicht (60 min) | ◐ enthaelt: vier-stufen-methode fehlt (bekannt: Vier-Stufen-Methode erlaubt höchstens 12 Personen; bei 16 Auszubildenden fehlt das Ausweichen in Teilgruppen) |
| deutsch-lernkontrolle-45 | kooperatives-lernen | gruppenbildung-zufall › kooperatives-skript › zickzack-dialog › exit-ticket (45 min) | ✓ |
| physik-lernzielkontrolle-45 | konzeptaufbau | live-abstimmung › vortrag-prompts › karteikarten-leitner › blitz-anwendung › one-minute-paper › selbstevaluation-bogen (45 min) | ✓ |
| mathe-test-45 | konzeptaufbau | ampelspiel › vortrag-prompts › multiple-choice-test › blitz-anwendung › one-minute-paper › selbstevaluation-bogen (45 min) | ✓ |
| englisch-vokabeltest-30 | faktenwissen | clustering-schreiben › lehrervortrag › abrufquiz › vokabeltest-kurzkontrolle (30 min) | ✓ |
| bio-fotosynthese-45 | kooperatives-lernen | abc-liste › kooperatives-skript › klassen-glossar › abrufquiz (45 min) | ✓ |
| geschichte-weimar-90 | konzeptaufbau | ampelspiel › entdeckendes-lernen › abrufquiz › lernprodukt-galerie › reflexionsprompt (90 min) | ✓ |
| politik-wahlrecht-90 | urteilsbildung | positionslinie › lehrgespraech › dynamische-urteilsbildung › reflexionsprompt (90 min) | ✓ |
| sachunterricht-wasser-45 | konzeptaufbau | ampelspiel › vortrag-prompts › brain-dump › blitz-anwendung › reflexionsprompt (45 min) | ✓ |
| mathe-brueche-60 | prozedur | stummer-impuls › vortrag-prompts › loesungsbeispiele › karteikarten-leitner (60 min) | ✓ |
| informatik-scratch-45 | produktion | stummer-impuls › aktives-zuhoeren › pair-programming › zwei-sterne-ein-wunsch (45 min) | ✓ |
| hochschule-statistik-90 | konzeptaufbau | vorhersage-aufgabe › vorlesung-klassisch › vortrag-prompts › karteikarten-leitner › blitz-anwendung › reflexionsprompt (90 min) | ✓ |
| evb-zeitmanagement-60 | konzeptaufbau | ampelspiel › kooperatives-skript › abrufquiz › blitz-anwendung › votum-ei (60 min) | ✓ |
| chemie-saeuren-20 | Einzelphase | abrufquiz, kooperatives-skript, verschachteltes-ueben, kofferpacken | ✓ |
| erdkunde-klima-30 | Einzelphase | abrufquiz, vortrag-prompts, brain-dump, reflexionsprompt | ✓ |
| neg-gruppenarbeit-60 | konzeptaufbau | concept-cartoon › kooperatives-skript › abrufquiz › stegreiftheater › reflexionsprompt (60 min) | ✓ |
| neg-partner-gruppe-45 | konzeptaufbau | ampelspiel › scaffolding-hilfen › abrufquiz › blitz-anwendung › reflexionsprompt (45 min) | ✓ |
| neg-experimente-90 | konzeptaufbau | vier-ecken-methode › wirbelgruppe › karteikarten-leitner › museumsgang › votum-ei (90 min) | ✓ |
| neg-tablets-45 | prozedur | impulsreferat › tafelbild-entwicklung › loesungsbeispiele › abrufquiz (45 min) | ✓ |
| neg-diskussion-45 | konzeptaufbau | live-abstimmung › vortrag-prompts › abrufquiz › switch-rollentausch › votum-ei (45 min) | ✓ |
| teilgruppe-foerder-45 | direkte-instruktion | erotematik › lehrervortrag › uebung-variation › brain-dump › numbered-heads-together (45 min) | ✓ |
| teilgruppe-daz-90 | kooperatives-lernen | ampelspiel › kooperatives-skript › lern-bingo › brain-dump (90 min) | ✓ |
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

# Qualitätsbericht Szenariovorschläge

63 Fälle, 0 offene Befunde, 0 bekannte Datenlücken.
Variabilität: 62 verschiedene Abläufe, häufigster 2 %; Sport: 0 verschiedene, häufigster 0 %.

| Fall | Kette | Ablauf | Befund |
|---|---|---|---|
| r2-gs-deutsch-lesen-45 | prozedur | fantasiereise › lehrervortrag › uebung-variation › abrufquiz (45 min) | ✓ |
| r2-gs-mathe-einmaleins-30 | faktenwissen | abc-liste › vortrag-prompts › karteikarten-leitner › spiral-wiederholung (30 min) | ✓ |
| r2-gs-sachunterricht-strom-90 | fuenf-e | tps › experiment › wirbelgruppe › museumsgang › exit-ticket (90 min) | ✓ |
| r2-gs-sport-ballgewoehnung-45 | fertigkeit-bewegung | aufwaermen › demonstration-nachmachen › teil-ganz-ueben › spielform-zielspiel › cool-down-auswertung (45 min) | ✓ |
| r2-gs-musik-lied-45 | fertigkeit-bewegung | gebundene-musik-rhythmus › demonstration-nachmachen › teil-ganz-ueben › vorfuehrung-rueckmeldung › zwei-sterne-ein-wunsch (45 min) | ✓ |
| r2-gs-kunst-collage-90 | produktion | stummer-impuls › demonstration-nachmachen › galeriemethode › lerntagebuch (90 min) | ✓ |
| r2-gs-religion-feste-45 | konzeptaufbau | ampelspiel › wirbelgruppe › abrufquiz › blitz-anwendung › votum-ei (45 min) | ✓ |
| r2-gs-englisch-farben-20 | Einzelphase | lern-bingo, switch-rollentausch, kofferpacken, stegreiftheater | ✓ |
| r2-s1-mathe-wahrscheinlichkeit-45 | fuenf-e | vorhersage-aufgabe › kopfstandmethode › vortrag-prompts › blitz-anwendung › exit-ticket (45 min) | ✓ |
| r2-s1-mathe-terme-lk-45 | prozedur | vorhersage-aufgabe › vortrag-prompts › blitz-anwendung › vokabeltest-kurzkontrolle › one-minute-paper (45 min) | ✓ |
| r2-s1-deutsch-erzaehlung-90 | produktion | positionslinie › text-exzerpieren › kreatives-schreiben › lerntagebuch (90 min) | ✓ |
| r2-s1-deutsch-zeitung-60 | konzeptaufbau | live-abstimmung › text-exzerpieren › brain-dump › pecha-kucha › votum-ei (60 min) | ✓ |
| r2-s1-englisch-dialog-45 | prozedur | ampelspiel › lehrervortrag › uebung-variation › abrufquiz (45 min) | ✓ |
| r2-s1-franz-vokabeln-lk-45 | faktenwissen | vokabeltest-kurzkontrolle › vorlesen-lesung › text-exzerpieren › lautleseverfahren (45 min) | ✓ |
| r2-s1-bio-mikroskop-90 | fertigkeit-bewegung | demonstrationsexperiment › lernen-am-modell › bestimmungsuebung › praxisauftrag-arbeitsplatz › reflexionsprompt (90 min) | ✓ |
| r2-s1-chemie-sicherheit-45 | fertigkeit-bewegung | vorhersage-aufgabe › demonstrationsexperiment › praxisauftrag-arbeitsplatz › transferauftrag-variation › votum-ei (45 min) | ✓ |
| r2-s1-physik-hebel-45 | urteilsbildung | stummer-impuls › erotematik › experiment › blitzlicht (45 min) | ✓ |
| r2-s1-geschichte-quellen-45 | konzeptaufbau | ampelspiel › wirbelgruppe › brain-dump › blitz-anwendung › reflexionsprompt (45 min) | ✓ |
| r2-s1-erdkunde-karte-45 | konzeptaufbau | live-abstimmung › wirbelgruppe › karteikarten-leitner › blitz-anwendung › reflexionsprompt (45 min) | ✓ |
| r2-s1-politik-klassenrat-45 | urteilsbildung | stummer-impuls › lehrervortrag › standbild › votum-ei (45 min) | ✓ |
| r2-s1-wirtschaft-taschengeld-45 | projektlernen | stummer-impuls › vortrag-prompts › swot-analyse › selbstevaluation-bogen (45 min) | ✓ |
| r2-s1-informatik-binaer-45 | konzeptaufbau | vorhersage-aufgabe › wirbelgruppe › abrufquiz › blitz-anwendung › votum-ei (45 min) | ✓ |
| r2-s1-technik-loeten-90 | fertigkeit-bewegung | vorhersage-aufgabe › demonstrationsexperiment › praxisauftrag-arbeitsplatz › transferauftrag-variation › reflexionsprompt (90 min) | ✓ |
| r2-s1-hauswirtschaft-kochen-90 | fertigkeit-bewegung | abc-liste › vier-stufen-methode › praxisauftrag-arbeitsplatz › vorfuehrung-rueckmeldung › schuelercoaching (90 min) | ✓ |
| r2-s1-sport-handball-lk-45 | fertigkeit-bewegung | aufwaermen › demonstration-nachmachen › teil-ganz-ueben › spielform-zielspiel › sportmotorischer-test › cool-down-auswertung (45 min) | ✓ |
| r2-s1-sport-tanz-45 | fertigkeit-bewegung | gebundene-musik-rhythmus › demonstration-nachmachen › teil-ganz-ueben › vorfuehrung-rueckmeldung › cool-down-auswertung (45 min) | ✓ |
| r2-s1-ethik-gerechtigkeit-45 | fuenf-e | ampelspiel › bisoziation › vortrag-prompts › blitz-anwendung › abrufquiz (45 min) | ✓ |
| r2-s1-darstellendes-spiel-90 | fertigkeit-bewegung | klassenspaziergang › vier-stufen-methode › gebundene-musik-rhythmus › standbild › reflexionsprompt (90 min) | ✓ |
| r2-s1-medien-fakenews-45 | urteilsbildung | stummer-impuls › erklaervideo › peer-feedback-rubric › selbstevaluation-bogen (45 min) | ✓ |
| r2-s1-klassenleitung-45 | urteilsbildung | stummer-impuls › lehrervortrag › blitz-anwendung › zielscheiben-feedback (45 min) | ✓ |
| r2-s2-mathe-ableitung-90 | direkte-instruktion | erotematik › lehrervortrag › loesungsbeispiele › abrufquiz › klassen-glossar (90 min) | ✓ |
| r2-s2-deutsch-faust-90 | konzeptaufbau | vier-ecken-methode › kooperatives-skript › brain-dump › textlupe › reflexionsprompt (90 min) | ✓ |
| r2-s2-englisch-klausur-90 | produktion | positionslinie › lehrervortrag › kreatives-schreiben › lerntagebuch (90 min) | ✓ |
| r2-s2-bio-genetik-60 | konzeptaufbau | live-abstimmung › vortrag-prompts › abrufquiz › blitz-anwendung › beobachtungsbogen › reflexionsprompt (60 min) | ✓ |
| r2-s2-philo-kant-90 | urteilsbildung | positionslinie › kraftfeldanalyse › british-parliamentary-debate › blitzlicht (90 min) | ✓ |
| r2-s2-geschichte-kalter-krieg-45 | konzeptaufbau | live-abstimmung › vortrag-prompts › abrufquiz › blitz-anwendung › reflexionsprompt (45 min) | ✓ |
| r2-s2-kunst-portrait-90 | produktion | positionslinie › kooperatives-skript › pecha-kucha › votum-ei (90 min) | ✓ |
| r2-s2-sport-fitness-90 | kondition-training | kugellager › dauer-intervallmethode › spielform-zielspiel › cool-down-auswertung (90 min) | ✓ |
| r2-bb-elektro-schaltplan-90 | prozedur | stummer-impuls › sq3r-lesemethode › lerntheke › abrufquiz (90 min) | ✓ |
| r2-bb-friseur-haare-90 | fertigkeit-bewegung | methode-66 › demonstration-nachmachen › praxisauftrag-arbeitsplatz › fall-simulation-osce › votum-ei (90 min) | ✓ |
| r2-bb-kaufleute-reklamation-45 | urteilsbildung | stummer-impuls › lautes-denken › rollenspiel › votum-ei (45 min) | ✓ |
| r2-bb-pflege-hygiene-lk-60 | fertigkeit-bewegung | tps › vier-stufen-methode › demonstration-nachmachen › transferauftrag-variation › fall-simulation-osce › reflexionsprompt (60 min) | ✓ |
| r2-bb-gastro-service-90 | fertigkeit-bewegung | ampelspiel › demonstration-nachmachen › praxisauftrag-arbeitsplatz › vorfuehrung-rueckmeldung › votum-ei (88 min) | ✓ |
| r2-bb-it-netzwerk-90 | projektlernen | stummer-impuls › vortrag-prompts › experiment › schuelercoaching (90 min) | ✓ |
| r2-bb-ueba-metall-180 | fertigkeit-bewegung | ampelspiel › vier-stufen-methode › praxisauftrag-arbeitsplatz › experiment › reflexionsprompt (180 min) | ✓ |
| r2-hs-jura-fall-90 | problemloesen | positionslinie › walt-disney-methode › kooperatives-skript › peer-feedback-rubric (90 min) | ✓ |
| r2-hs-medizin-anamnese-90 | prozedur | klassenspaziergang › vortrag-prompts › loesungsbeispiele › lern-bingo (90 min) | ✓ |
| r2-hs-ingenieur-vorlesung-90 | konzeptaufbau | live-abstimmung › vorlesung-klassisch › vortrag-prompts › brain-dump › blitz-anwendung › reflexionsprompt (90 min) | ✓ |
| r2-hs-lehramt-mikro-90 | konzeptaufbau | live-abstimmung › wirbelgruppe › brain-dump › peer-feedback-rubric › microteaching (90 min) | ✓ |
| r2-hs-bwl-klausur-60 | prozedur | gruppenbildung-zufall › vorlesen-lesung › lerntempo-duett › karteikarten-leitner (60 min) | ✓ |
| r2-hs-online-statistik-60 | kooperatives-lernen | murmelgruppe › kooperatives-skript › brain-dump › peer-instruction (60 min) | ✓ |
| r2-eb-vhs-deutschkurs-90 | konzeptaufbau | ampelspiel › sq3r-lesemethode › brain-dump › textlupe › votum-ei (90 min) | ✓ |
| r2-eb-erste-hilfe-120 | fertigkeit-bewegung | live-abstimmung › lernen-am-modell › vier-stufen-methode › fall-simulation-osce › zielscheiben-feedback (120 min) | ✓ |
| r2-eb-lehrerfortbildung-ki-90 | fuenf-e | live-abstimmung › planspiel-simulation-computer › ki-tutor › peer-feedback-rubric › wortwolke (90 min) | ✓ |
| r2-eb-firma-onboarding-60 | konzeptaufbau | concept-cartoon › kooperatives-skript › kofferpacken › blitz-anwendung › reflexionsprompt (60 min) | ✓ |
| r2-eb-senioren-smartphone-90 | fertigkeit-bewegung | klassenspaziergang › demonstration-nachmachen › microteaching › transferauftrag-variation › votum-ei (90 min) | ✓ |
| r2-eb-yoga-60 | fertigkeit-bewegung | gebundene-musik-rhythmus › teil-ganz-ueben › differenzielles-lernen › spielform-zielspiel › cool-down-auswertung (60 min) | ✓ |
| r2-x-ohne-frontal-45 | konzeptaufbau | vorhersage-aufgabe › wirbelgruppe › brain-dump › blitz-anwendung › votum-ei (45 min) | ✓ |
| r2-x-inklusion-45 | kooperatives-lernen | freewriting › kooperatives-skript › abrufquiz › vokabeltest-kurzkontrolle (45 min) | ✓ |
| r2-x-vertretung-45 | konzeptaufbau | vorhersage-aufgabe › wirbelgruppe › spiral-wiederholung › blitz-anwendung › votum-ei (45 min) | ✓ |
| r2-x-projekttag-300 | projektlernen | nominal-group-technique › sokratisches-gespraech › waldpaedagogik › lerntagebuch (300 min) | ✓ |
| r2-x-draussen-45 | prozedur | blitzlicht › demonstrationsexperiment › bestimmungsuebung › brain-dump (45 min) | ✓ |
| r2-x-englisch-sprachig-45 | konzeptaufbau | concept-cartoon › wirbelgruppe › karteikarten-leitner › blitz-anwendung › one-minute-paper (45 min) | ✓ |

# Qualitätsbericht Szenariovorschläge

46 Fälle, 11 offene Befunde, 0 bekannte Datenlücken.
Variabilität: 41 verschiedene Abläufe, häufigster 2 %; Sport: 0 verschiedene, häufigster 0 %.

| Fall | Kette | Ablauf | Befund |
|---|---|---|---|
| r3-ort-erdkunde-bach-90 | konzeptaufbau | vier-ecken-methode › entdeckendes-lernen › kofferpacken › rollenspiel › reflexionsprompt (90 min) | ✗ kriterien: ansatz=["spiel-simulation"] fälschlich gelesen |
| r3-ort-bio-schulgarten-45 | prozedur | tps › demonstrationsexperiment › bestimmungsuebung › abrufquiz (45 min) | ✓ |
| r3-ort-gs-wald-90 | fuenf-e | ecriture-automatique › entdeckendes-lernen › sketchnotes › lernprodukt-galerie › abrufquiz (90 min) | ✗ kriterien: raum=undefined statt "draussen" |
| r3-ort-museum-60 | konzeptaufbau | live-abstimmung › scaffolding-hilfen › karteikarten-leitner › blitz-anwendung › kanban-lernboard (60 min) | ✗ kriterien: raum=undefined statt "draussen" |
| r3-ort-hoersaal-bwl-90 | konzeptaufbau | ampelspiel › vorlesung-klassisch › vortrag-prompts › karteikarten-leitner › blitz-anwendung › kompetenzraster-diagnose (90 min) | ✓ |
| r3-ort-chemie-labor-90 | fertigkeit-bewegung | vorhersage-aufgabe › demonstrationsexperiment › bestimmungsuebung › transferauftrag-variation › reflexionsprompt (90 min) | ✓ |
| r3-ort-technik-werkstatt-90 | fertigkeit-bewegung | demonstrationsexperiment › lernen-am-modell › praxisauftrag-arbeitsplatz › transferauftrag-variation › votum-ei (90 min) | ✓ |
| r3-ort-hauswirtschaft-kueche-90 | fertigkeit-bewegung | advance-organizer › demonstration-nachmachen › pair-programming › vorfuehrung-rueckmeldung › zielscheiben-feedback (90 min) | ✓ |
| r3-ort-sport-draussen-45 | fertigkeit-bewegung | aufwaermen › demonstration-nachmachen › teil-ganz-ueben › spielform-zielspiel › cool-down-auswertung (45 min) | ✗ kriterien: raum="bewegungsraum" statt "draussen" |
| r3-gs-mathe-geld-45 | prozedur | ampelspiel › vortrag-prompts › loesungsbeispiele › brain-dump (45 min) | ✓ |
| r3-gs-deutsch-diktat-45 | prozedur | freewriting › woerterwiese › laufdiktat › zickzack-dialog (45 min) | ✗ leistungskontrolle: erste und letzte Phasen: freewriting, woerterwiese, laufdiktat, zickzack-dialog |
| r3-gs-sachunterricht-verkehr-45 | konzeptaufbau | concept-cartoon › vortrag-prompts › karteikarten-leitner › blitz-anwendung › votum-ei (45 min) | ✓ |
| r3-gs-sport-turnen-45 | fertigkeit-bewegung | gebundene-musik-rhythmus › demonstration-nachmachen › teil-ganz-ueben › spielform-zielspiel › cool-down-auswertung (45 min) | ✓ |
| r3-gs-morgenkreis-15 | Einzelphase | abrufquiz, vortrag-prompts, brain-dump, exit-ticket | ✓ |
| r3-s1-mathe-pythagoras-45 | direkte-instruktion | concept-cartoon › lehrervortrag › einzelarbeit-uebung › exit-ticket › karteikarten-leitner (45 min) | ✓ |
| r3-s1-mathe-funktionen-test-90 | prozedur | stummer-impuls › text-exzerpieren › uebung-variation › brain-dump › kompetenzraster-checkliste (90 min) | ✓ |
| r3-s1-deutsch-gedicht-45 | konzeptaufbau | ampelspiel › vortrag-prompts › karteikarten-leitner › blitz-anwendung › reflexionsprompt (45 min) | ✓ |
| r3-s1-englisch-film-90 | konzeptaufbau | vier-ecken-methode › sos-modell › karteikarten-leitner › blitz-anwendung › reflexionsprompt (90 min) | ✓ |
| r3-s1-latein-uebersetzen-45 | prozedur | ampelspiel › lehrervortrag › uebung-variation › zickzack-dialog (45 min) | ✓ |
| r3-s1-politik-wahl-90 | urteilsbildung | stummer-impuls › kooperatives-skript › british-parliamentary-debate › switch-rollentausch (90 min) | ✓ |
| r3-s1-ethik-dilemma-45 | urteilsbildung | stummer-impuls › erotematik › kraftfeldanalyse › votum-ei (45 min) | ✓ |
| r3-s1-informatik-scratch-90 | produktion | stummer-impuls › vortrag-prompts › gamification › reflexionsprompt (90 min) | ✗ praxis: Hauptphasen ohne Praxis: vortrag-prompts, gamification; Praxisanteil 25 % |
| r3-s1-musik-trommeln-45 | fertigkeit-bewegung | gebundene-musik-rhythmus › demonstration-nachmachen › teil-ganz-ueben › vorfuehrung-rueckmeldung › reflexionsprompt (45 min) | ✓ |
| r3-s1-kunst-perspektive-90 | fertigkeit-bewegung | vier-ecken-methode › demonstration-nachmachen › teil-ganz-ueben › vorfuehrung-rueckmeldung › votum-ei (88 min) | ✓ |
| r3-s1-physik-strom-inklusion-45 | kooperatives-lernen | rosenshine-daily-review › lernen-am-modell › zickzack-dialog › vokabeltest-kurzkontrolle (45 min) | ✓ |
| r3-s1-vertretung-30 | Einzelphase | lerntagebuch, brainstorming, erfindungsaufgabe, scaffolding-hilfen | ✗ modus: erwartet ablauf, erhalten phase |
| r3-s1-klassenrat-45 | projektlernen | stummer-impuls › tafelbild-entwicklung › blitz-anwendung › klassenrat (45 min) | ✗ kriterien: bildungsstufe=undefined statt "sek1" |
| r3-s2-geschichte-klausur-90 | konzeptaufbau | live-abstimmung › gruppenarbeit-klassisch › abrufquiz › museumsgang › reflexionsprompt (90 min) | ✓ |
| r3-s2-philo-kant-90 | urteilsbildung | positionslinie › fishbowl › rollenspiel › blitzlicht (90 min) | ✓ |
| r3-s2-bio-genetik-flipped-45 | konzeptaufbau | concept-cartoon › vortrag-prompts › abrufquiz › blitz-anwendung › reflexionsprompt (45 min) | ✓ |
| r3-s2-sport-volleyball-90 | fertigkeit-bewegung | gebundene-musik-rhythmus › demonstration-nachmachen › teil-ganz-ueben › differenzielles-lernen › cool-down-auswertung (90 min) | ✓ |
| r3-s2-deutsch-erorterung-90 | produktion | stummer-impuls › text-exzerpieren › kreatives-schreiben › lerntagebuch (90 min) | ✓ |
| r3-bs-kfz-reifen-90 | fertigkeit-bewegung | tps › lernen-am-modell › praxisauftrag-arbeitsplatz › vorfuehrung-rueckmeldung › votum-ei (90 min) | ✓ |
| r3-bs-einzelhandel-kunden-90 | prozedur | ampelspiel › vier-stufen-methode › loesungsbeispiele › verschachteltes-ueben (90 min) | ✓ |
| r3-bs-pflege-blutdruck-60 | fertigkeit-bewegung | cocktail-party › demonstration-nachmachen › praxisauftrag-arbeitsplatz › vorfuehrung-rueckmeldung › reflexionsprompt (60 min) | ✓ |
| r3-bs-elektro-pruefung-45 | kooperatives-lernen | gruppenbildung-zufall › vortrag-prompts › fehleranalyse › abrufquiz › multiple-choice-test (45 min) | ✓ |
| r3-bs-erzieher-portfolio-90 | konzeptaufbau | concept-cartoon › thinking-at-the-edge › buddy-book › stegreiftheater › zielscheiben-feedback (90 min) | ✗ kriterien: bildungsstufe=undefined statt "berufsbildung" |
| r3-hs-seminar-referat-90 | urteilsbildung | stummer-impuls › wirbelgruppe › fishbowl › blitzlicht (90 min) | ✓ |
| r3-hs-mathe-uebung-90 | prozedur | brainstorming › vortrag-prompts › loesungsbeispiele › brain-dump (90 min) | ✓ |
| r3-hs-online-60 | konzeptaufbau | ampelspiel › vortrag-prompts › abrufquiz › blitz-anwendung › reflexionsprompt (60 min) | ✓ |
| r3-eb-vhs-spanisch-90 | konzeptaufbau | ampelspiel › vortrag-prompts › brain-dump › textlupe › votum-ei (90 min) | ✓ |
| r3-eb-erstehilfe-120 | fertigkeit-bewegung | rosenshine-daily-review › vier-stufen-methode › loesungsbeispiele › vorfuehrung-rueckmeldung › votum-ei (90 min) | ✗ kriterien: zeitMin=90 statt 120 |
| r3-eb-workshop-team-180 | kooperatives-lernen | vorlesen-lesung › kooperatives-skript › abrufquiz › vokabeltest-kurzkontrolle (45 min) | ✓ |
| r3-kurz-bruchrechnung | Einzelphase | abrufquiz, verschachteltes-ueben, loesungsbeispiele, vortrag-prompts | ✗ modus: erwartet ablauf, erhalten phase |
| r3-kurz-einstieg-photosynthese | Einzelphase | rosenshine-daily-review, ecriture-automatique, freewriting, stummer-impuls | ✓ |
| r3-kurz-abschluss-reflexion-10 | Einzelphase | reflexionsprompt, beobachtungsbogen, kompetenzraster-checkliste, kompetenzraster-diagnose | ✓ |

