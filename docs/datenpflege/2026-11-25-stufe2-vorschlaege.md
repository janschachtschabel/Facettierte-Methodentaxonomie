# Daten- und Taxonomieerweiterungen D1 bis D7 – Vorschläge zur Durchsicht

Stand: 2026-11-25. Alle Einträge unten sind Vorschläge, die bereits in `data/` eingetragen sind, damit die Zuordnung sie nutzen kann. Jede Zeile lässt sich direkt in der jeweiligen Methodendatei ändern; die Tests prüfen nur die Form (gültige Codes, Pflichtfelder), nicht die einzelne Einstufung.

## D1 Fachbereich

Neues Vokabular `fachbereich`: `mathe-informatik` (Mathematik und Informatik), `nawi-technik` (Naturwissenschaften und Technik), `sprachen` (Sprachen), `gesellschaft` (Gesellschaft), `aesthetik` (Ästhetische Fächer), `sport` (Sport und Bewegung), `beruf-praxis` (Beruf und Praxis), `uebergreifend` (Fachübergreifend). Mathematik/Informatik und Naturwissenschaften/Technik sind auf Jans Entscheidung vom 2026-11-25 getrennt.

Jede Methode trägt `fachbereich` (wo sie zu Hause ist) und optional `fachbereichUngeeignet`. Wirkung in der Zuordnung: ungeeignet = zurückgestellt (harte Stufe), zu Hause = 0,5 Punkte besser, nur in anderen Fachbereichen zu Hause = 1,5 Punkte schlechter. Der Fachbereich der Anfrage wird aus dem Fach im Text gelesen.

158 Methoden sind ohne Einschränkung `uebergreifend`. Die übrigen 131:

| Methode | Fachbereich | Ungeeignet für |
| --- | --- | --- |
| ABC-Liste (nach Birkenbihl) (`abc-liste`) | uebergreifend | sport |
| Amerikanische Debatte (`amerikanische-debatte`) | gesellschaft, sprachen | sport |
| Freier Abruf (Brain Dump) (`brain-dump`) | uebergreifend | sport |
| Methode 6-3-5 (Brainwriting) (`brainwriting-635`) | uebergreifend | sport |
| British Parliamentary Style Debatte (`british-parliamentary-debate`) | gesellschaft, sprachen | sport |
| Buddy Book (Faltbüchlein) (`buddy-book`) | uebergreifend | sport |
| CATWOE-Perspektivenanalyse (`catwoe-analyse`) | beruf-praxis, gesellschaft | sport |
| Chorsprechen & Strukturierte Nachsprechübung (`chorsprechen`) | sprachen, aesthetik | mathe-informatik, nawi-technik, sport |
| Clustering (Assoziationsnetz) (`clustering-schreiben`) | sprachen, uebergreifend | sport |
| Cognitive Apprenticeship (Kognitive Meisterlehre) (`cognitive-apprenticeship`) | beruf-praxis, uebergreifend | – |
| Collective-Notebook-Methode (`collective-notebook`) | uebergreifend | sport |
| Concept Mapping (`concept-mapping`) | uebergreifend | sport |
| Cornell-Methode (Strukturierte Mitschrift) (`cornell-methode`) | uebergreifend | sport |
| Deduktive Regelvermittlung (`deduktives-erlaeutern`) | mathe-informatik, sprachen | sport |
| Deliberative Beratung (Bürgerrat im Unterricht) (`deliberation`) | gesellschaft, sprachen | sport |
| Bewegungsdemonstration & Angeleitetes Nachmachen (`demonstration-nachmachen`) | sport, aesthetik, beruf-praxis | – |
| Demonstrationsexperiment (`demonstrationsexperiment`) | nawi-technik | sprachen, gesellschaft, aesthetik, sport, mathe-informatik |
| Dialogisches Lernen (nach Ruf & Gallin) (`dialogisches-lernen`) | sprachen, mathe-informatik | sport |
| Differenzielles Lernen (Bewegungsvariation nach Schöllhorn) (`differenzielles-lernen`) | sport, aesthetik | mathe-informatik, nawi-technik, sprachen, gesellschaft |
| Klassisches Diktat (Rechtschreibkontrolle) (`diktat-klassisch`) | sprachen | mathe-informatik, nawi-technik, gesellschaft, aesthetik, sport |
| Dilemmadiskussion (Konstanzer Methode) (`dilemmadiskussion`) | gesellschaft, sprachen | sport |
| Begleitetes Praxis- & Reflexionsmodul (Praktikum) (`dual-praxismodul`) | beruf-praxis | – |
| Dynamische Urteilsbildung (`dynamische-urteilsbildung`) | gesellschaft, sprachen | sport |
| Automatisches Schreiben (Ideenfluss) (`ecriture-automatique`) | sprachen, uebergreifend | sport |
| Egg-Race (Konstruktionswettbewerb) (`egg-race`) | nawi-technik | sprachen, gesellschaft, sport |
| Erfindungsaufgabe mit kontrastierenden Fällen (`erfindungsaufgabe`) | mathe-informatik, nawi-technik | sport |
| Erlebnispädagogische Kooperationsaufgabe (`erlebnispaedagogik`) | sport, uebergreifend | – |
| Mnemotechnik & Eselsbrücken entwickeln (`eselsbruecken-mnemonik`) | uebergreifend | sport |
| Geleitetes Experiment in Kleingruppen (`experiment`) | nawi-technik, beruf-praxis | sprachen, gesellschaft, mathe-informatik |
| Simulationsstation / OSCE-Praxischeck (`fall-simulation-osce`) | beruf-praxis | sprachen, gesellschaft, aesthetik |
| Fantasiereise (Imaginative Hinführung) (`fantasiereise`) | aesthetik, sprachen, gesellschaft | mathe-informatik, nawi-technik |
| Fishbowl-Diskussion (`fishbowl`) | gesellschaft, sprachen, uebergreifend | – |
| Digitales Spaced-Repetition-Training (Anki / Leitner) (`flashcard-spaced-repetition`) | uebergreifend | sport |
| Freewriting (Freies Schreiben) (`freewriting`) | sprachen, uebergreifend | sport |
| Freie Internetrecherche (ohne Leitfragen) (`freie-internetrecherche`) | uebergreifend | sport |
| Freie Lesezeit (Sustained Silent Reading) (`freies-stoebern-leseecke`) | sprachen | mathe-informatik, nawi-technik, sport |
| Freier Text & Klassenzeitung (Freinet) (`freinet-druckerei`) | sprachen | mathe-informatik, nawi-technik, sport |
| Galeriemethode (Skizzen-Galerie) (`galeriemethode`) | aesthetik, uebergreifend | sport |
| Bodypercussion & Rhythmische Erarbeitung (`gebundene-musik-rhythmus`) | aesthetik, sport | mathe-informatik, nawi-technik, gesellschaft |
| Godly Play (Bodenbild-Erzählung & Ergründungsgespräch) (`godly-play`) | gesellschaft | mathe-informatik, nawi-technik, sport |
| Induktive Beispielreihe (`induktives-entdecken`) | mathe-informatik, sprachen | sport |
| Jeux Dramatiques (Ausdrucksspiel) (`jeux-dramatiques`) | sprachen, gesellschaft, aesthetik | mathe-informatik, nawi-technik, sport |
| Schülerfirma / Übungsfirma (Langzeit-Projektmodul) (`juniorfirma-schuelerfirma`) | beruf-praxis | – |
| Kriteriengeleitete Bild- & Karikaturenanalyse (`karikatur-bildanalyse`) | gesellschaft, aesthetik, sprachen | mathe-informatik, nawi-technik, sport |
| Lernkartei (Leitner-System) (`karteikarten-leitner`) | uebergreifend | sport |
| KI-gestütztes kriteriengeleitetes Textfeedback (`ki-textfeedback`) | sprachen, gesellschaft | sport |
| Wachsendes Fachbegriffs-Glossar / Wortwand (`klassen-glossar`) | uebergreifend | sport |
| Klassenarbeit / Schriftliche Klausur (summativ) (`klassenarbeit-summativ`) | uebergreifend | sport |
| Kollegiale Fallberatung (`kollegiale-fallberatung`) | beruf-praxis | sport |
| Kraftfeldanalyse (nach Lewin) (`kraftfeldanalyse`) | beruf-praxis, gesellschaft | sport |
| Kreatives Schreiben nach Schreibimpuls (`kreatives-schreiben`) | sprachen | mathe-informatik, nawi-technik, sport |
| K-W-L-Methode (Wissen – Wollen – Gelernt) (`kwl-methode`) | uebergreifend | sport |
| Laufdiktat (Schleichdiktat) (`laufdiktat`) | sprachen | mathe-informatik, nawi-technik, gesellschaft, aesthetik, sport |
| Lautleseverfahren (Tandem- & Chorlesen) (`lautleseverfahren`) | sprachen | mathe-informatik, nawi-technik, aesthetik, sport |
| Lehrgang (`lehrgang`) | beruf-praxis | – |
| Leittextmethode (`leittextmethode`) | beruf-praxis | – |
| Begriffs- & Lern-Bingo (`lern-bingo`) | uebergreifend | sport |
| Lernen am Modell (Cognitive Apprenticeship) (`lernen-am-modell`) | beruf-praxis, uebergreifend | – |
| Lernfeldorientiertes Unterrichtsmodul (`lernfeld-curriculum`) | beruf-praxis | – |
| Lernplakat & Posterpräsentation (`lernplakat`) | aesthetik, uebergreifend | sport |
| Lerntagebuch mit Leitfragen (Prompts) (`lerntagebuch`) | uebergreifend | sport |
| Lesetagebuch (Lektürebegleitendes Journal) (`lesetagebuch`) | sprachen | mathe-informatik, nawi-technik, aesthetik, sport |
| Loci-Methode (Gedächtnispalast) (`loci-methode`) | uebergreifend | sport |
| Lösungsbeispiele mit Fading (`loesungsbeispiele`) | mathe-informatik, nawi-technik, beruf-praxis | sport, aesthetik |
| Makerspace / Tüftelwerkstatt (FabLab) (`makerspace-tueftelwerkstatt`) | nawi-technik, mathe-informatik, aesthetik, beruf-praxis | sprachen, gesellschaft, sport |
| Microteaching (`microteaching`) | beruf-praxis | sport |
| Mind Mapping (`mind-mapping`) | uebergreifend | sport |
| Model United Nations (MUN) (`model-united-nations`) | gesellschaft | mathe-informatik, nawi-technik, aesthetik, sport |
| Morphologische Analyse (Zwicky-Box) (`morphologischer-kasten`) | beruf-praxis, nawi-technik, gesellschaft | sport |
| Multiple-Choice-Kurztest (Richtig/Falsch-Diagnose) (`multiple-choice-test`) | uebergreifend | sport |
| Mystery-Methode (`mystery-methode`) | gesellschaft, nawi-technik | sport |
| Netzplantechnik (Projekt- & Ablaufplanung) (`netzplantechnik-projekt`) | beruf-praxis, mathe-informatik | sport, sprachen |
| One-Minute-Paper (`one-minute-paper`) | uebergreifend | sport |
| Papiercomputer (Einflussmatrix nach Vester) (`papiercomputer`) | beruf-praxis, gesellschaft | sport |
| Parlamentssimulation (`parlamentssimulation`) | gesellschaft | mathe-informatik, nawi-technik, aesthetik, sport |
| Peer Instruction (nach Mazur) (`peer-instruction`) | mathe-informatik, nawi-technik, uebergreifend | – |
| Placemat-Methode (`placemat`) | uebergreifend | sport |
| Planspiel (`planspiel`) | gesellschaft, beruf-praxis, uebergreifend | – |
| Computersimulation & Virtuelles Labor (`planspiel-simulation-computer`) | nawi-technik, gesellschaft | sport |
| Lern-Podcast selbst produzieren (`podcast-produktion`) | aesthetik, sprachen, uebergreifend | sport |
| Podiumsdiskussion (`podiumsdiskussion`) | gesellschaft, sprachen | sport |
| Positionslinie (Meinungsbarometer) (`positionslinie`) | gesellschaft, sprachen, uebergreifend | – |
| Pro-Contra-Debatte (Jugend debattiert) (`pro-contra-debatte`) | gesellschaft, sprachen | sport |
| Productive Failure (`productive-failure`) | mathe-informatik, nawi-technik, uebergreifend | – |
| Produktives Lernen in der Praxis (`produktives-lernen`) | beruf-praxis | – |
| Kriteriengeleitete Quellen- & Informationsprüfung (`quellenkritik-check`) | gesellschaft, sprachen | sport |
| Quellenkritik & Faktencheck (Lateral Reading) (`quellenkritik-faktencheck`) | gesellschaft, sprachen | sport |
| Relevanzbaumanalyse (`relevanzbaum`) | beruf-praxis, gesellschaft | sport |
| Reziprokes Lehren und Lesen (`reziprokes-lesen`) | sprachen, gesellschaft, uebergreifend | sport, aesthetik |
| Rollenspiel (`rollenspiel`) | gesellschaft, sprachen, beruf-praxis | sport |
| Schreibgespräch (Stille Diskussion) (`schreibgespraech`) | uebergreifend | sport |
| Schreibkonferenz (`schreibkonferenz`) | sprachen | mathe-informatik, nawi-technik, sport |
| Freies Forschen im Schülerlabor (`schuelerlabor-frei`) | nawi-technik | sprachen, gesellschaft, aesthetik, sport, mathe-informatik |
| Service Learning (Lernen durch Engagement) (`service-learning`) | gesellschaft, uebergreifend | – |
| Simulation globale (Ganzheitliche Lebensweltsimulation) (`simulation-globale`) | sprachen | mathe-informatik, nawi-technik, sport |
| Interaktive Computersimulation / Virtuelles Labor (`simulationsspiel-digital`) | nawi-technik, gesellschaft | sport |
| Sketchnotes (Visuelle Notizen) (`sketchnotes`) | aesthetik, uebergreifend | sport |
| Sokratisches Gespräch (`sokratisches-gespraech`) | gesellschaft, sprachen, uebergreifend | – |
| SOS-Modell (Sammeln – Ordnen – Systematisieren) (`sos-modell`) | mathe-informatik, sprachen | sport |
| Fünf-Schritt-Lesemethode (SQ3R) (`sq3r-lesemethode`) | sprachen, gesellschaft, uebergreifend | sport, aesthetik |
| Standbild (Szenisches Spiel) (`standbild`) | sprachen, gesellschaft, aesthetik | mathe-informatik, nawi-technik, sport |
| Zirkel- & Bewegungstraining (Motorische Stationen) (`stationstraining-bewegung`) | sport | mathe-informatik, nawi-technik, sprachen, gesellschaft |
| Stegreiftheater (Improvisationsszene) (`stegreiftheater`) | sprachen, gesellschaft, aesthetik | mathe-informatik, nawi-technik, sport |
| Stop-Motion- & Legetrick-Erklärfilm (Schülerproduktion) (`stop-motion-erklaerfilm`) | aesthetik, sprachen, uebergreifend | sport |
| Storytelling im Unterricht (`storytelling`) | sprachen, gesellschaft, uebergreifend | – |
| Strukturierte Kontroverse (SAC) (`strukturierte-kontroverse`) | gesellschaft, sprachen | sport |
| Strukturlegetechnik (`strukturlegetechnik`) | uebergreifend | sport |
| Pädagogische Reflexionsgruppe (Supervision) (`supervision-gruppe`) | beruf-praxis | sport |
| Switch / Freeze-Tag (Schneller Rollenwechsel) (`switch-rollentausch`) | sprachen, gesellschaft, aesthetik | mathe-informatik, nawi-technik, sport |
| SWOT-Analyse (Stärken · Schwächen · Chancen · Risiken) (`swot-analyse`) | beruf-praxis, gesellschaft | sport |
| Szenario-Technik (`szenario-technik`) | gesellschaft, uebergreifend | – |
| Tafelabschrift / Strukturiertes Abschreiben (`tafelabschrift-abschreiben`) | uebergreifend | sport |
| Tandem-Sprachlernen (`tandem-lernen`) | sprachen | mathe-informatik, nawi-technik, gesellschaft, aesthetik, sport |
| Strukturiertes Textmarkieren & Exzerpieren (`text-exzerpieren`) | sprachen, gesellschaft, uebergreifend | sport, aesthetik |
| Textlupe (Peer-Textüberarbeitung) (`textlupe`) | sprachen, gesellschaft | sport |
| Operatives & variierendes Üben (`uebung-variation`) | mathe-informatik, sprachen | sport |
| Ursache-Wirkungs-Diagramm (Ishikawa / Fischgräte) (`ursache-wirkungs-diagramm`) | beruf-praxis, nawi-technik, gesellschaft | sport |
| Vorhersage–Beobachtung–Erklärung (`vbe`) | nawi-technik | sprachen, aesthetik, sport, mathe-informatik |
| Verschachteltes Üben (Interleaving) (`verschachteltes-ueben`) | mathe-informatik, nawi-technik, uebergreifend | – |
| Vier-Stufen-Methode (Unterweisung) (`vier-stufen-methode`) | beruf-praxis, sport, aesthetik | gesellschaft, sprachen |
| Vokabeltest / Schriftliche Kurzkontrolle (`vokabeltest-kurzkontrolle`) | uebergreifend | sport |
| Vorlesen / Lehrervorlesung (rezeptiv) (`vorlesen-lesung`) | sprachen, gesellschaft | mathe-informatik, nawi-technik, sport |
| Vorlesung (Akademischer Überblicksvortrag) (`vorlesung-klassisch`) | uebergreifend | sport |
| Waldpädagogische Naturerkundung (`waldpaedagogik`) | nawi-technik | – |
| Wandzeitung (`wandzeitung`) | uebergreifend | sport |
| WebQuest (`webquest`) | uebergreifend | sport |
| Kollaboratives Unterrichtswiki (`wiki-kollaboration`) | uebergreifend | sport |
| Wörterwiese (`woerterwiese`) | sprachen | mathe-informatik, nawi-technik, sport |
| Zickzack-Dialog (`zickzack-dialog`) | sprachen, gesellschaft, uebergreifend | – |
| Zukunftskonferenz (Future Search) (`zukunftskonferenz`) | gesellschaft, uebergreifend | – |
| Zukunftswerkstatt (nach Jungk) (`zukunftswerkstatt`) | gesellschaft, uebergreifend | – |

## D2 Evidenzbezug

Jeder Evidenzeintrag mit Grad A oder B trägt `evidenzBezug`: `methode` (Studien zur Methode selbst) oder `prinzip` (vom Wirkprinzip abgeleitet). Ein nur abgeleiteter Grad A zählt in der Rangfolge wie B; die Anzeige des Grades bleibt unverändert.

Als `prinzip` eingestuft (alle übrigen: `methode`):

| Methode | Grad | Befund | Quelle |
| --- | --- | --- | --- |
| Abrufquiz (ohne Notendruck) (`abrufquiz`) | A | Verteilte Wiederholung verbessert das Behalten gegenüber massierter | Cepeda et al. 2006; Dunlosky et al. 2013 |
| Ampelspiel (Positionierung mit Rot–Gelb–Grün) (`ampelspiel`) | B | All-Student-Response-Systeme (gleichzeitige Rückmeldung aller Lernenden) stärken formative Diagnose und Beteiligung | Wiliam 2011 (Embedded Formative Assessment) |
| Autogrammjagd (Find Someone Who) (`autogrammjagd`) | B | Strukturierte kooperative Abruf- und Austauschformate erhöhen Aktivierung und gegenseitige Erklärqualität im Vergleich zu reinem Frontalabfragen | Kagan & Kagan 2009; Kyndt et al. 2013 |
| Prozessbegleitender Beobachtungs- & Feedbackbogen (`beobachtungsbogen`) | B | Systematische formative Diagnose während des Lernprozesses erhöht die Passung nachfolgender Lernhilfen deutlich | Wiliam 2011; Kingston & Nash 2011 |
| Buddy Book (Faltbüchlein) (`buddy-book`) | B | Aktives Zusammenfassen und visuelles Strukturieren in eigenen Worten (generative Lernstrategien) fördern Behalten und Verständnis deutlich (ES ≈ 0,50) | Fiorella & Mayer 2015; Dunlosky et al. 2013 |
| Drei-Schritt-Interview (`drei-schritt-interview`) | B | Teil der strukturierten kooperativen Verfahren (Kagan), deren positive Effekte bei Interdependenz und Verantwortlichkeit meta-analytisch gestützt sind. | Kyndt et al. 2013; Kagan & Kagan 2009 |
| Exit-Ticket (`exit-ticket`) | B | Formative Diagnose wirkt positiv, vermutlich deutlich schwächer als früher berichtet (≈ 0,20 statt 0,40–0,70) | Black & Wiliam 1998; Kingston & Nash 2011 |
| Feynman-Methode (Einfach erklären & Lücken finden) (`feynman-methode`) | B | Kombiniert Selbsterklärung (g ≈ 0,55, Bisra et al. 2018) und Abrufpraxis (g ≈ 0,50, Yang et al. 2021). | Bisra et al. 2018; Fiorella & Mayer 2013 |
| Freie Internetrecherche (ohne Leitfragen) (`freie-internetrecherche`) | A | Unangeleitete Recherche ohne Such- und Prüfgerüst führt bei Novizen zu kognitiver Überlastung und geringem Lernerfolg. | Kirschner, Sweller & Clark 2006; Alfieri et al. 2011 |
| Arbeitsteilige Gruppenarbeit (`gruppenarbeit-klassisch`) | A | Strukturierte kooperative Gruppenarbeit zeigt konsistent mittlere positive Effekte auf Leistung (ES ≈ 0,54). | Kyndt et al. 2013; Johnson & Johnson 2009 |
| Gruppenpuzzle (Jigsaw) (`gruppenpuzzle`) | A | Kooperatives Lernen wirkt positiv auf Leistung (ES ≈ 0,54) | Kyndt et al. 2013; Johnson, Johnson & Stanne 2000 |
| Klassenspaziergang (`klassenspaziergang`) | B | Strukturierte Partnerinteraktion mit hoher individueller Sprechzeit steigert kognitive Aktivierung und Behaltensleistung; kurze Bewegungsunterbrechungen unterstützen Aufmerksamkeit | Chi & Wylie 2014 (ICAP); Erwin et al. 2012 |
| Fachliches Kofferpacken (`kofferpacken`) | B | Aktives mündliches Abrufen (Retrieval Practice) stärkt kurz- und mittelfristiges Behalten von Begriffen deutlich gegenüber reinem Wiederlesen | Roediger & Karpicke 2006; Adesope et al. 2017 |
| Kompetenzraster & Ich-kann-Checkliste (`kompetenzraster-checkliste`) | B | Transparente Erfolgskriterien und kriteriengeleitete Selbsteinschätzung stärken formatives Feedback und Selbstregulation | Black & Wiliam 2009; Hattie 2009 |
| Begriffs- & Lern-Bingo (`lern-bingo`) | B | Spielerisch eingebettete Abrufübungen verbinden den positiven Testing-Effekt mit erhöhter kurzfristiger Motivation | Roediger & Karpicke 2006; Sailer & Homner 2020 |
| Museumsgang mit Kriterien-Feedback (Structured Gallery Walk) (`lernprodukt-galerie`) | B | Kriteriengeleitetes Peer-Feedback an sichtbaren Lernprodukten stärkt Qualitätsbewusstsein und fachliche Korrekturfähigkeit. | Topping (2009); Double, McGrane & Hopfenbeck (2020) |
| Lösungsbeispiele mit Fading (`loesungsbeispiele`) | A | Expertise-Reversal: Der Vorteil starker Anleitung kehrt sich mit wachsendem Vorwissen um | Kalyuga et al. 2003; Tetzlaff et al. 2025 |
| Microlearning mit verteiltem Abruf (Spaced Micro-Units) (`microlearning-spaced`) | A | Segmentierung (Segmenting Principle) kombiniert mit verteiltem Abruf verbessert Behalten und Transfer signifikant. | Mayer (2021): Multimedia Learning; Cepeda et al. (2006) |
| Partnerpuzzle (`partnerpuzzle`) | B | Strukturierte kooperative Vermittlung in Zweierteams mit individueller Rechenschaft fördert Verstehen und Behalten | Kyndt et al. 2013; Roscoe & Chi 2007 |
| Placemat-Methode (`placemat`) | A | Strukturiertes kooperatives Lernen mit individueller Rechenschaft wirkt positiv auf Leistung (ES ≈ 0,54) | Kyndt et al. 2013; Johnson, Johnson & Stanne 2000 |
| Daily Review (Täglicher Abruf-Einstieg nach Rosenshine) (`rosenshine-daily-review`) | A | Regelmäßiger kurzer Abruf zu Stundenbeginn stärkt Langzeitbehalten und reduziert kognitive Überlastung beim Anknüpfen neuen Wissens. | Rosenshine (2012): Principles of Instruction; Roediger & Karpicke (2006) |
| Schreibkonferenz (`schreibkonferenz`) | A | Kriteriengeleitetes Peer-Feedback und angeleitete Textüberarbeitung zeigen deutliche positive Effekte auf die Schreibqualität (ES ≈ 0,50–0,75) | Graham & Perin 2007; Graham, Harris & Hebert 2011; Huisman et al. 2019 |
| Schüler- & Lerncoaching (`schuelercoaching`) | B | Individuelle Lernberatung und zielorientiertes Coaching unterstützen Selbstwirksamkeit und Selbstregulation | Hardeland 2015; Dignath & Büttner 2008 |
| Simulation globale (Ganzheitliche Lebensweltsimulation) (`simulation-globale`) | B | Handlungs- und szenariobasierte Langzeitsimulationen steigern Lernmotivation, authentische Sprachproduktion und Transfer bei klarer Strukturierung | Debyser 1986; Yaiche 1996; Vlachopoulos & Makri 2017 |
| Sketchnotes (Visuelle Notizen) (`sketchnotes`) | B | Lernendes Zeichnen fördert Behalten und Verstehen, wenn es konzeptuelle Zusammenhänge abbildet | Fiorella & Zhang 2018; Wammes et al. 2016 |
| SOS-Modell (Sammeln – Ordnen – Systematisieren) (`sos-modell`) | A | Geleitet-induktives Entdecken mit anschließender expliziter Konsolidierung (vergleichbar mit Guided Discovery / Contrasting Cases) fördert nachhaltiges Regelverständnis | Alfieri et al. 2011; Schwartz et al. 2011; Ziebell & Schmidjell 2012 |
| Spiraliges Wiederholungs-Warm-up (Cumulative Review) (`spiral-wiederholung`) | A | Kombiniert Abrufpraxis (Yang et al. 2021), Verteilung (Cepeda et al. 2006) und Verschachtelung (Brunmair & Richter 2019). | Cepeda et al. 2006; Yang et al. 2021; Brunmair & Richter 2019 |
| Stop-Motion- & Legetrick-Erklärfilm (Schülerproduktion) (`stop-motion-erklaerfilm`) | B | Selbstständiges Erstellen von Erklärungen und multimedialen Lernprodukten fördert tiefes Verstehen (Learning by Explaining / Generative Learning) | Fiorella & Mayer 2016 (Educational Psychology Review) |
| Switch / Freeze-Tag (Schneller Rollenwechsel) (`switch-rollentausch`) | B | Perspektivwechsel- und Rollenspielverfahren fördern Argumentationsfähigkeit, Empathie und mündliche Sprachflüssigkeit | Johnson & Johnson 2009 (Constructive Controversy); Lee et al. 2015 (Drama-Based Pedagogy) |
| Textlupe (Peer-Textüberarbeitung) (`textlupe`) | B | Kriteriengeleitetes Peer-Feedback im Schreibprozess verbessert die Textqualität (ES ≈ 0,30–0,50) | Graham, Hebert & Harris 2015 |
| Votum-Ei (Zeichnerisches Vier-Quadranten-Feedback) (`votum-ei`) | B | Regelmäßiges formatives Lern- und Unterrichtsfeedback wirkt lernförderlich, wenn die Ergebnisse zur Anpassung des weiteren Unterrichts genutzt werden | Hattie & Timperley 2007; Black & Wiliam 2009 |
| Wirbelgruppe (`wirbelgruppe`) | A | Strukturierte kooperative Austauschformate mit individueller Erklärpflicht fördern Verständnis und Beteiligungsbreite (ES ≈ 0,54) | Kyndt et al. 2013; Johnson & Johnson 2009 |
| Wörterwiese (`woerterwiese`) | B | Vorwissensaktivierung und explizite Wortschatz-Vorentlastung verbessern das Text- und Fachverständnis besonders bei sprachlich heterogenen Lerngruppen | Marzano 2004; Lesaux et al. 2010; Beck, McKeown & Kucan 2013 |
| Zickzack-Dialog (`zickzack-dialog`) | B | Strukturierte mündliche Interaktionsroutinen mit Scaffolding fördern Sprachproduktion, Verständnissicherung und Beteiligung stiller Lernender | Long 1996 (Interaction Hypothesis); Mackey & Goo 2007 |

## D3 Rolle und Zeitanteil der Kettenschritte

`zeitanteil` ist ein relatives Gewicht je Schritt; `rolle` ist `rand`, `haupt` oder `sicherung`.

| Kette | Schritt | Rolle | Zeitanteil |
| --- | --- | --- | --- |
| konzeptaufbau | k1 Vorwissen und Fehlvorstellungen sichtbar machen | rand | 12 |
| konzeptaufbau | k2 Konzept generieren oder darbieten und sichern | haupt | 35 |
| konzeptaufbau | k3 Konsolidieren | sicherung | 15 |
| konzeptaufbau | k4 Transfer | haupt | 28 |
| konzeptaufbau | k5 Reflexion | rand | 10 |
| prozedur | p1 Vorwissen aktivieren | rand | 10 |
| prozedur | p2 Modellieren und erklären | haupt | 25 |
| prozedur | p3 Geleitete, dann selbstständige Übung | haupt | 45 |
| prozedur | p4 Verteilt und verschachtelt wiederholen | sicherung | 20 |
| problemloesen | q1 Problem erschließen | rand | 12 |
| problemloesen | q2 Lösungsversuche | haupt | 33 |
| problemloesen | q3 Vergleich und Instruktion | sicherung | 25 |
| problemloesen | q4 Anwendung auf neue Fälle | haupt | 30 |
| faktenwissen | f1 Vorwissen aktivieren | rand | 12 |
| faktenwissen | f2 Erwerb | haupt | 40 |
| faktenwissen | f3 Abrufen und verteilt wiederholen | sicherung | 33 |
| faktenwissen | f4 Lernstand prüfen | rand | 15 |
| fuenf-e | e1 Engage: Interesse wecken, Vorwissen aktivieren | rand | 10 |
| fuenf-e | e2 Explore: eigenständig erkunden | haupt | 32 |
| fuenf-e | e3 Explain: Konzept klären und sichern | sicherung | 23 |
| fuenf-e | e4 Elaborate: auf neue Situationen anwenden | haupt | 25 |
| fuenf-e | e5 Evaluate: Lernstand feststellen | rand | 10 |
| pbl-siebensprung | pbl1 Authentischen Problemfall erschließen | rand | 12 |
| pbl-siebensprung | pbl2 Hypothesen & Lernfragen entwickeln | haupt | 30 |
| pbl-siebensprung | pbl3 Synthese & Konzeptsicherung | sicherung | 25 |
| pbl-siebensprung | pbl4 Übertragung auf neuen Problemfall | haupt | 23 |
| pbl-siebensprung | pbl5 Prozess- & Lernreflexion | rand | 10 |
| direkte-instruktion | di1 Review & Vorwissen aktivieren | rand | 10 |
| direkte-instruktion | di2 Explizit modellieren & erklären | haupt | 25 |
| direkte-instruktion | di3 Geleitete Übung mit Feedback | haupt | 35 |
| direkte-instruktion | di4 Verständnis & Lernstand prüfen | rand | 10 |
| direkte-instruktion | di5 Selbstständig festigen & verteilt abrufen | sicherung | 20 |
| kooperatives-lernen | ko1 Vorwissen & Perspektiven aktivieren | rand | 12 |
| kooperatives-lernen | ko2 Kooperative Erarbeitung (Team/Experten) | haupt | 50 |
| kooperatives-lernen | ko3 Gegenseitige Konsolidierung & Abruf | sicherung | 25 |
| kooperatives-lernen | ko4 Gemeinsame Reflexion & Diagnose | rand | 13 |
| projektlernen | pr1 Projektanlass & Problemstellung klären | rand | 12 |
| projektlernen | pr2 Planung, Recherche & Konzeptsicherung | haupt | 28 |
| projektlernen | pr3 Produktentwicklung, Erprobung & Präsentation | haupt | 48 |
| projektlernen | pr4 Projekt- & Prozessreflexion | rand | 12 |
| urteilsbildung | u1 Streitfrage erschließen und erste Position beziehen | rand | 12 |
| urteilsbildung | u2 Sachwissen und Argumente erarbeiten | haupt | 28 |
| urteilsbildung | u3 Kontrovers diskutieren und abwägen | haupt | 45 |
| urteilsbildung | u4 Urteil begründen und reflektieren | sicherung | 15 |
| fertigkeit-bewegung | b1 Einstimmen und Bewegungsvorstellung aktivieren | rand | 12 |
| fertigkeit-bewegung | b2 Vormachen und erklären | haupt | 18 |
| fertigkeit-bewegung | b3 Üben mit Rückmeldung | haupt | 40 |
| fertigkeit-bewegung | b4 Anwenden in Spiel-, Gestaltungs- oder Ernstform | haupt | 20 |
| fertigkeit-bewegung | b5 Auswerten | rand | 10 |
| produktion | pd1 Auftrag, Anlass und Kriterien klären | rand | 10 |
| produktion | pd2 Vorbilder, Muster und Techniken erschließen | haupt | 22 |
| produktion | pd3 Entwerfen und ausarbeiten | haupt | 48 |
| produktion | pd4 Rückmeldung einholen, überarbeiten und reflektieren | sicherung | 20 |

## D4 Neue Ketten

| Kette | Wird gewählt bei | Schritte (Lernfunktion → Zielzustand) |
| --- | --- | --- |
| Urteilsbildung (Streitfrage – Argumente – Kontroverse – Urteil) (`urteilsbildung`) | Ansatz Diskurs; Wörter wie Debatte, Streitfrage, Pro und Contra, diskutieren, Fishbowl | Streitfrage erschließen und erste Position beziehen (orientierung → problem-erschlossen); Sachwissen und Argumente erarbeiten (erwerb/verstehen → erstwissen-ungesichert); Kontrovers diskutieren und abwägen (anwendung/problemloesen/verstehen → transfer-gezeigt); Urteil begründen und reflektieren (metakognition → lernen-reflektiert) |
| Bewegung und praktische Fertigkeit (Vormachen – Üben – Anwenden) (`fertigkeit-bewegung`) | Zielart Psychomotorik (Sportarten, Bewegungsabläufe) oder Fachbereich Sport | Einstimmen und Bewegungsvorstellung aktivieren (orientierung → vorwissen-aktiviert); Vormachen und erklären (erwerb → erstwissen-ungesichert); Üben mit Rückmeldung (konsolidierung/anwendung → prozedur-gelaeufig); Anwenden in Spiel-, Gestaltungs- oder Ernstform (anwendung/problemloesen → transfer-gezeigt); Auswerten (metakognition → lernen-reflektiert) |
| Produktion (Schreiben, Gestalten, Programmieren) (`produktion`) | schreiben, verfassen, programmieren, zeichnen, malen, gestalten, komponieren, entwerfen; Plakat/Podcast/Film erstellen | Auftrag, Anlass und Kriterien klären (orientierung → problem-erschlossen); Vorbilder, Muster und Techniken erschließen (erwerb/verstehen → erstwissen-ungesichert); Entwerfen und ausarbeiten (anwendung/problemloesen → transfer-gezeigt); Rückmeldung einholen, überarbeiten und reflektieren (metakognition/diagnose → lernen-reflektiert) |

Die Kette `prozedur` gilt nicht mehr für die Zielart Psychomotorik.

## D5 Vor- und Nachbedingungen

Geprüft wurden 45 häufig gewählte Hauptphasen-Methoden. Geändert:

| Methode | Änderung | Grund |
| --- | --- | --- |
| Geleitetes Experiment (`experiment`) | Vorbedingung `konzept-gesichert` → `vorwissen-aktiviert`; Nachbedingung zusätzlich `loesungsversuche`; Sequenz zusätzlich `problem-vor-instruktion` | Ein Experiment kann die Erkundungsphase (Explore) tragen, nicht nur den Transfer. |
| Fishbowl (`fishbowl`) | Lernfunktion zusätzlich `anwendung`; Nachbedingung zusätzlich `transfer-gezeigt` | Gleichbehandlung mit Pro-Contra-Debatte und Podiumsdiskussion. |
| Dilemmadiskussion (`dilemmadiskussion`) | Nachbedingung zusätzlich `transfer-gezeigt` | Kann die Kontroverse in der Urteilsbildung tragen. |
| Kreatives Schreiben (`kreatives-schreiben`) | Nachbedingung zusätzlich `loesungsversuche` | Ein Entwurf liegt vor; Schreibkonferenz kann anschließen. |
| Textlupe (`textlupe`) | Nachbedingung zusätzlich `lernen-reflektiert` | Überarbeitung nach Rückmeldung schließt die Produktionskette ab. |
| Mystery (`mystery-methode`) | Nachbedingung zusätzlich `loesungsversuche` | Lernende entwickeln eigene Lösungen; als Erkundungsphase einsetzbar. |
| Bild- und Karikaturenanalyse (`karikatur-bildanalyse`) | Vorbedingung neu `vorwissen-aktiviert`; Nachbedingung `konzept-gesichert` → `problem-erschlossen` | Eine Bildanalyse sichert kein Konzept; sie erschließt ein Problem oder wendet Wissen an. |
| Stegreiftheater (`stegreiftheater`) | Vorbedingung `vorwissen-aktiviert` → `erstwissen-ungesichert` | Braucht Inhalte, die gespielt werden (wie Standbild). |
| SWOT-Analyse (`swot-analyse`) | Vorbedingung neu `erstwissen-ungesichert` | Analyse setzt Sachkenntnis voraus. |
| Pecha Kucha (`pecha-kucha`) | Vorbedingung neu `erstwissen-ungesichert` | Präsentation setzt Inhalte voraus. |

Nicht geändert, aber auffällig: `lesetagebuch` (Reichweite R3, Mindestdauer 20 min) wird in Einzelstunden als Erarbeitung gewählt; `scaffolding-hilfen` ist eher eine Stütze als eine Phase; `schreibkonferenz` und `lernprodukt-galerie` verlangen `loesungsversuche`, das die meisten Produktionsmethoden nicht liefern.

## D6 Dublette

`dreischritt-interview` ist in `drei-schritt-interview` aufgegangen (Durchführung, Material, zweite Quelle, Qualitätsrisiko und Vorwissenseignung übernommen). Der Katalog hat damit 289 Methoden.

## D7 Wiederholung in Folgestunden

Der Knoten `Wiederkehr` kennt `ausserhalbBudget`. Bei einem Zeitbudget bis 180 Minuten plant die Zuordnung die verteilte Wiederholung für Folgestunden: sie zählt nicht zur Dauer, erfüllt aber R-07. Die Prüfung weist die Minuten getrennt als `dauerAusserhalbMin` aus.

