# FMT 2.1: Ergänzung nach dem Szenariotest

27. Nov. 2026 · Jan Schachtschabel (abgeschrieben aus Jans Nachricht im Thread; Tabellen in Listenform)

## Kurzfassung
Der Szenariotest vom 27.11.2026 bewertet 10 von 56 Plänen als gut, 31 als mangelhaft und 15 als schlecht [E, Bericht]. Das W-Raster hält: Bedarf, Pflichtangaben und Planungsprofile arbeiten wie vorgesehen. Schwach ist die Besetzung der Kettenschritte. Die App füllt jeden Schritt mit dem besten verfügbaren Treffer, auch wenn keiner passt [S]. Diese Ergänzung ändert das in zwölf Punkten.

| Nr. | Änderung | Art | Behebt | Aufwand |
|---|---|---|---|---|
| E1 | Angabe „Anlass“ in der Situation | Modell | Standardplan bei Übung, Test, Prüfungsvorbereitung | mittel |
| E2 | Angabe „Kernhandlung“, die den Hauptschritt fest besetzt | Modell | fehlender Versuch, fehlende Quellenarbeit | mittel |
| E3 | Status je Angabe und Bestätigung des Verstandenen | Modell, Code | falsch gelesener Freitext | mittel |
| E4 | Filter für Reichweite und Dauer | Regel | 90 Minuten „Jenaplan“ als Phase | klein |
| E5 | Mindestpassung; sonst Grundform oder gemeldete Lücke | Regel, Daten | fachfremde Methoden | mittel |
| E6 | Stufenprofile mit abgeleiteten Rahmenbedingungen | Daten | Schreibmethoden in Klasse 1 | klein |
| E7 | Bedarf als Vereinigung statt als Schnittmenge | Daten | Lücken im Schrift- und Raumbedarf | mittel |
| E8 | Fachtypik und Schrittprofile | Daten | beliebige Besetzung | mittel |
| E9 | Sicherheitshinweis am Raumtyp | Regel | Hinweis beim Rollenspiel | klein |
| E10 | Teilgruppen: Persona zählt als genannt, keine Standardgruppen | Regel | „passt“ ohne Hilfe, „Daily Review“ in 49 Plänen | klein |
| E11 | Meldungen und Kennzeichnungen im Plan | Code | ungültiger Plan ohne Hinweis, Wiederkehr-Zeile | klein |
| E12 | 14 prüfbare Bedingungen als Regressionstest | Test | Rückfälle | mittel |

## Befund
- Strukturierte Anfragen: 2 gut, 11 mit Mängeln, 3 schlecht. Freie Anfragen: 8, 20, 12 → Der Freitext-Leser ist nicht die Hauptursache. Auch saubere Eingaben liefern schwache Pläne [E].
- Vier-Stufen-Methode, Bild- und Karikaturenanalyse und Naturerkundung stehen im Katalog (Commit 633e460) → Bei Kasse, Karikatur und Bäumen wählt die App falsch; keine Datenlücke [E].
- Quellenanalyse, Erzählkreis und Textgespräch fehlen dem Namen nach → zu ergänzen [E].
- Reichweite und Dauer stehen an allen 314 Methoden; „Jenaplan-Rhythmisierung“ und „Freiarbeit“ haben Reichweite R3 → Der Filter fehlt, die Daten sind da [E].
- Schriftbedarf an 122, Raumbedarf an 127 von 314 Methoden → Übernahme als Schnittmenge lässt Methoden durch den Filter [S].
- Die ABC-Liste trägt „schreibt“ und steht trotzdem im Plan für Klasse 1 → Der Bedarf greift nur, wenn „ohne Schrift“ genannt ist [E].
- 292 von 314 Methoden haben den Status Entwurf → Kuratierung bleibt der größte Posten [E].
Drei Ursachen liegen im Entwurf der FMT 2.0: kein leerer Schritt vorgesehen; aus der Bildungsstufe wird nichts abgeleitet; Sicherheitshinweis an handelnde Methoden statt an den Raum [S].

## Neue Angaben der Situation
### E1 Anlass
Der Anlass sagt, welche Art von Einheit geplant wird. Er steht im Feld Lernziele und setzt, welche Lernstände schon erreicht sind. An der Methode kommt kein Feld hinzu [S].
- Einführung: Kette der Zielart ab dem ersten Schritt
- Übung: Der Erwerb gilt als erreicht. Die Kette beginnt beim Üben; keine lange Regelvermittlung
- Wiederholung: Abruf und Festigung; Wiederkehr in Folgeterminen
- Prüfung: kein Lernablauf, sondern Einweisung, Bearbeitung und Abgabe; dazu eine neue Kette „Prüfung“
- Prüfungsvorbereitung: Aufgaben im Format der Prüfung, Diagnose der Lücken, gezieltes Üben
- Projekt: Projektkette; die Zeit verteilt sich auf einen Tag oder mehrere Termine
- Training: Kette Kondition oder Bewegung
- Unterweisung: vollständige Handlung; die Vier-Stufen-Methode ist die Kernhandlung
- Erkundung: Außenort; eine Erkundungsmethode ist die Kernhandlung
Fehlt der Anlass, fragt die App danach. Sie rät ihn nicht.

### E2 Kernhandlung
Die Kernhandlung ist das, was nach dem Willen der Lehrkraft in der Einheit geschehen soll: ein Schülerversuch, Quellenarbeit mit Karikaturen, ein Rollenspiel, Songwriting mit Tablets. Sie ist mehr als ein Wunsch.
- Zuordnung: Die Kernhandlung wird einer Methode oder einer Grundform zugeordnet. Gelingt das nicht, steht sie als freie Phase im Plan
- Platz: Sie besetzt den Hauptschritt der Kette. Die übrigen Schritte ordnen sich um sie
- Zeit: Sie erhält den größten Zeitanteil, mindestens die Mindestdauer ihrer Methode
- Vorrang: Eine Regel darf vor ihr warnen, sie aber nicht entfernen

### E3 Status je Angabe
Jede Angabe trägt einen von vier Status: genannt, abgeleitet, angenommen, fehlt. Abgeleitet heißt, dass eine Regel den Wert aus einer genannten Angabe gewinnt, etwa „Sporthalle“ aus dem Fach Sport. Angenommen heißt, dass ein Standardwert gilt.
- Ausschluss: Nur genannte und abgeleitete Werte schließen aus. Angenommene Werte schließen nichts aus
- Bestätigung: Vor dem Plan zeigt die App, was sie verstanden hat. Der Nutzer kann jede Angabe ändern
- Rückfrage: höchstens zwei Fragen, zuerst zu Anlass und Kernhandlung
- Kein Plan: Fehlen das Ziel oder drei Pflichtangaben, liefert die App Fragen oder zwei Alternativen statt eines Standardplans
- Thema: Der Text des Themas bleibt wörtlich. Erkannte Wörter werden nicht herausgestrichen
- Teilgruppen: entstehen nur aus einer ausdrücklichen Angabe, nie aus einem Wort im Thema
Der Wortlisten-Leser bleibt als Rückfall. Ob ein Sprachmodell den Freitext besser liest, ist offen und mit denselben 56 Szenarien zu prüfen [H].

## Auswahl je Kettenschritt
Feste Reihenfolge: erst filtern, dann die Passung prüfen, dann ordnen. Bleibt nichts übrig, folgt der Rückfall.

### E4 Filter
- Bedarf gedeckt: Raum, Schrift, Geräte, Internet, KI, Gruppengröße, Termine (vorhanden; Daten nach E7)
- Reichweite (neu): Ein Schritt innerhalb einer Einheit nimmt nur Methoden der Reichweite R1 und R2. R3 und R4 rahmen eine ganze Einheit oder Reihe und werden als Rahmen angeboten
- Dauer (neu): Die zugeteilte Zeit liegt zwischen Mindest- und Höchstdauer der Methode. Sonst wählt die App eine andere Methode oder teilt den Schritt
- Stufenprofil (neu): abgeleitete Rahmenbedingungen der Bildungsstufe (E6)
- Zielart-Bindung: Die Methode trägt die Zielart des Schritts (vorhanden)

### E5 Passung, Rang und Rückfall
- Passung: Ein Kandidat passt, wenn er alle Filter besteht und das Schrittprofil erfüllt (E8). Eine Punktzahl allein reicht nicht
- Rang: 1. Kernhandlung, 2. Fachtypik, 3. Evidenz, 4. Vielfalt: keine Methode zweimal im Plan
- Rückfall 1: die Grundform des Schritts, etwa „Erklären“ oder „Aufgaben bearbeiten“
- Rückfall 2: Besteht auch die Grundform einen Filter nicht, bleibt der Schritt als gemeldete Lücke im Plan: Titel ist das Ziel des Schritts, dazu der Satz „Für diesen Schritt steht keine passende Methode im Katalog.“
- Verbot: Keine fachfremde Methode springt ein. Die Übergangsregel aus Paket A entfällt
- Meldung: Jede Besetzung durch Rückfall steht unter den Hinweisen
Eine schlichte Grundform ist besser als eine benannte Methode, die nicht passt [S]. Ein Sprachmodell kann unter den passenden Kandidaten wählen und die Wahl begründen; die Regeln prüfen das Ergebnis danach erneut. Das ist nicht erprobt [H].

## Neue Daten
### Grundformen (zu E5)
Zwölf schlichte Bausteine decken jeden Kettenschritt ab. Die Liste lehnt sich an Aebli (1983) an und ist eine Setzung [S]. Vorhandene Methoden erhalten ein Kennzeichen; drei Grundformen fehlen.
| Grundform | Deckt | Im Katalog |
|---|---|---|
| Erklären | Erwerb | Lehrervortrag |
| Vormachen | Erwerb bei Verfahren und Bewegung | Demonstration und Nachmachen, Lautes Denken |
| Gemeinsam besprechen | Verstehen, Urteilen | Unterrichtsgespräch |
| Auftrag klären | Orientierung | fehlt |
| Am Gegenstand arbeiten: Text, Bild, Quelle, Objekt | Erarbeitung | fehlt |
| Aufgaben bearbeiten, einzeln | Üben, Anwenden | Stillarbeit |
| Zu zweit bearbeiten | Üben | Partnerarbeit |
| Üben mit Rückmeldung | Festigen | Operatives Üben |
| Abrufen | Wiederholen | Abrufquiz |
| Ergebnisse vorstellen und sichern | Sicherung | fehlt |
| Lernstand kurz prüfen | Diagnose | Exit-Ticket |
| Rückblick | Reflexion | Blitzlicht |

### E6 Stufenprofile
- Klasse 1 und 2: Lesen und Schreiben sind nicht vorausgesetzt → Methoden mit Schriftbedarf entfallen, außer das Ziel ist Lesen oder Schreiben. Grundlage: Schriftspracherwerb liegt in diesen Klassen; Lehrpläne nicht je Land nachgeschlagen [A]
- Klasse 3 und 4: kurze Texte → Warnung bei textlastigen Methoden [A]
- Kurse bis Sprachniveau A2: Schrift in der Zielsprache eingeschränkt → Warnung mit Verweis auf Hilfen, wie bisher. Höfler et al. (2024); Evidenz dünn [E]
- alle Stufen: Höchstlänge einer Phase → keine Regel; belastbare Werte fehlen [U]
Die Eignung nach Stufe an der einzelnen Methode bleibt. Sie ist kaum gefüllt und gehört in die Kuratierung.

### E7 Bedarf als Vereinigung
Setzt eine der beiden Quellen einen Bedarf, gilt er und trägt das Kennzeichen „ungeprüft“. Grund: ungleiche Kosten. Ein fehlender Bedarf bringt eine falsche Methode in den Plan, und niemand sieht den Fehler. Ein zu viel gesetzter Bedarf lässt eine Methode fehlen; das fällt in der Suche auf und lässt sich korrigieren [S]. Nachkodiert werden zuerst die Methoden, die der Test am häufigsten gewählt hat.

### E8 Fachtypik und Schrittprofile
Die Fachtypik ordnet nur. Sie ist eine Setzung und je Fach zu belegen [U].
- Mathematik, Informatik: Aufgaben bearbeiten, Lösungsbeispiele, Programmieren
- Naturwissenschaft, Technik: Schüler- und Demonstrationsversuch, Messen, Modellarbeit
- Sprachen: Textarbeit, Sprechen im Dialog, Schreiben
- Gesellschaft: Arbeit an Quelle, Bild und Karte, Diskussion, Fallanalyse
- Ästhetik: Gestalten, Musizieren, Aufführen
- Sport: Übungsreihe, Spielform, Training
- Beruf und Praxis: Arbeitsauftrag als vollständige Handlung, Unterweisung, Kundengespräch
Schrittprofile (nutzen vorhandene Facetten):
- Auftrag analysieren: verlangt Arbeit am Auftrag oder Material; Weltbezug Gegenstand → schließt Positionslinie aus
- Planen: Ergebnis ist ein Arbeitsplan → schließt Kreativtechniken ohne Planprodukt aus
- Kontrollieren, Bewerten: Rückmeldung am Produkt nach Kriterien → schließt Daily Review, Aktives Zuhören aus
- Kontroverse: Gegenpositionen treffen aufeinander → schließt Markt der Möglichkeiten, SWOT-Analyse aus
- Vormachen: Lehrende oder Modell zeigen den Ablauf → schließt Methoden aus, in denen Lernende üben
Die Bewegungskette gilt auch für Handgriffe wie Mikroskopieren. Ihre Schrittnamen werden neutral: „Ablauf vormachen“, „Ablauf üben“, „Anwenden“ [S].

### E9 Raumtyp und Gefahr
- Fachraum Naturwissenschaft, Labor, Werkstatt, Küche: ja. Schule: KMK (2023); Betrieb und Hochschule: eigene Regelwerke, nicht nachgeschlagen [A]
- Sporthalle, Schwimmbad: ja. Erlasse der Länder zum Schulsport; ob die RiSU gilt, ist nicht geprüft [A]
- Außenort: ja, zur Aufsicht; je Land [A]
- Kunst- und Werkraum: nur wenn die Kernhandlung Werkzeug verlangt; KMK (2023)
- Klassenraum, Hörsaal, Computerraum, digital: nein
Der Hinweis nennt den Raum und die Kernhandlung. Er nennt keine beliebige Methode aus dem Plan.

### Fehlende Einträge
Zu ergänzen sind Quellenanalyse, Textgespräch, Erzählkreis, die drei fehlenden Grundformen und eine Kette „Prüfung“.

## Geänderte Regeln und Entscheidungen
| Punkt | Bisher | Neu | Grund |
|---|---|---|---|
| E9 Sicherheitshinweis | handelnde Methode plus Fachbereich oder Raum | Raumtyp nach der Tabelle oben | 9 von 19 Hinweisen waren fragwürdig [E, Bericht] |
| Problemlösen vor Instruktion in der Primarstufe | meldet, sobald irgendeine Methode im Katalog betroffen wäre | meldet nur, wenn eine gewählte Methode betroffen ist | Warnung in 8 von 8 Grundschulplänen [E, Bericht] |
| E10 Persona | Werte einer Persona gelten nicht als genannt | Eine gewählte Persona ist eine Nennung | „passt“ in jeder Phase [E, Bericht] |
| E10 Hohes Vorwissen | „passt“ | weniger Anleitung oder Tausch | Tetzlaff et al., 2025 [E] |
| E10 Förderbedarf Lernen | „passt“ | mehr Anleitung und Strategiehilfe | Swanson und Hoskyn (1998) [E] |
| E10 Gruppe ohne Lesen | sprachliches Gerüst | Leseentlastung oder Tausch gegen eine Methode ohne Schriftbedarf | folgt aus dem Bedarf [S] |
| E10 Standardgruppen | drei Gruppen ohne Angabe, daraus Zusatzphasen | entfallen; Teilgruppen nur bei Angabe | „Daily Review“ in 49 von 54 Plänen [E, Bericht] |
| Gleichwertiger Ersatz | keine neue Warnung | zusätzlich: derselbe Lernstand für dieselbe Zielart | sonst ändert der Tausch das Ziel [S] |
| Sperrliste | nur sensorische Präferenzen in der Matrix | auch Lerntyp und Lernstil im Freitext | Pashler et al. (2008) [E] |
| Annahme ohne Zeit | 45 Minuten und voller Ablauf | Rückfrage nach E3 | „Projekttag“ wurde zu 45 Minuten [E, Bericht] |
| E11 Wiederkehr | Zeile ohne Kennzeichnung in der Tabelle | eigene Zeile „in Folgestunden“, außerhalb der Summe | Tabellen mit 60 statt 45 Minuten [E, Bericht] |
| E11 Ungültiger Plan | wird ohne Hinweis geliefert | jede Prüfmeldung steht unter den Hinweisen, in Worten statt Codes | [E, Bericht] |
| E11 Beschriftung | „Phase 3“, Hauptziel nennt die Kette | Schritt trägt sein Ziel als Namen; Hauptziel nennt das Lernziel | [E, Bericht] |
| E11 Zwei Wege | /plan und /match wählen den Modus verschieden | eine gemeinsame Entscheidung | 5 abweichende Fälle [E, Bericht] |
Die Entscheidung, in Ethik, Philosophie und Religion ohne Ziel die Urteilsbildung anzunehmen, bleibt. Sie ist Fachtypik für drei Fächer und geht in E8 auf.

## E12 Prüfbare Bedingungen
Jede Bedingung lässt sich ohne Urteil an der Antwort der Schnittstelle prüfen. Die 56 Szenarien des Tests werden damit zum Regressionstest.
| Nr. | Bedingung | Gehört zu | Fälle im Test |
|---|---|---|---|
| B1 | Die Summe der Phasen in der Tabelle ist die Zeitvorgabe. Die Wiederkehr steht getrennt | E11 | 32 Abläufe |
| B2 | Keine Methode mit Schriftbedarf, wenn Schrift genannt oder abgeleitet ausgeschlossen ist | E6, E7 | Nr. 1, 8 |
| B3 | Eine genannte Kernhandlung steht im Hauptschritt | E2 | Nr. 14, 16, 20, 33 |
| B4 | Keine Methode der Reichweite R3 oder R4 als einzelne Phase | E4 | Nr. 39, 46 |
| B5 | Jede Phase liegt zwischen Mindest- und Höchstdauer ihrer Methode | E4 | Nr. 43, 46 |
| B6 | Ist die Prüfung ungültig oder warnt sie, steht ein Hinweis im Plan | E11 | Nr. 43, 45 |
| B7 | Keine Gruppe und keine Zusatzphase ohne genannte Teilgruppe | E10 | 49 Pläne |
| B8 | Ein Sicherheitshinweis erscheint nur bei einem Raumtyp mit Gefahr und nennt Raum und Kernhandlung | E9 | Nr. 38, 41, 42 |
| B9 | Jede abgeleitete oder angenommene Angabe steht mit Grund unter den Annahmen | E3 | Nr. 53 |
| B10 | Kein Phasenname „Phase N“, kein roher Code im Text, das Thema bleibt wörtlich | E3, E11 | Nr. 26, 36, 45 |
| B11 | /plan und /match wählen denselben Modus | E11 | 5 Fälle |
| B12 | Keine Methode zweimal im Plan und keine außerhalb ihrer Gruppengröße | E5 | Nr. 49 |
| B13 | Eine Teilgruppe mit genanntem Merkmal erhält Tausch oder Hilfe, wenn eine Regel greift | E10 | Nr. 9, 11, 27 |
| B14 | Jeder Rückfall steht unter den Hinweisen; keine fachfremde Methode springt ein | E5 | Nr. 19, 41 |
Die Bedingungen prüfen, ob ein Plan fehlerfrei gebaut ist, nicht ob er didaktisch gut ist. Dafür braucht es Referenzszenarien mit Musterlösung und mindestens zwei Urteilende [S].

## Reihenfolge und Abnahme
Vor dem ersten Paket laufen dieselben 56 Szenarien einmal gegen den Stand vor der Umstellung (Commit 1d61ef9) [S].
| Paket | Inhalt | Abnahme |
|---|---|---|
| 1 Sofort | E4, E11, Standardgruppen aus E10 | B1, B4 bis B7, B10 und B11 in allen 56 Szenarien erfüllt |
| 2 Rückfall | E5 mit den Grundformen, E9 | B8, B12 und B14 erfüllt |
| 3 Eingabe | E1, E2, E3 | B3 und B9 erfüllt; ein Lauf mit und einer ohne Sprachmodell |
| 4 Daten | E6, E7, E8, fehlende Einträge, Kuratierung der meistgewählten Methoden | B2 und B13 erfüllt; neue Beurteilung der 56 Szenarien durch zwei Personen |
Paket 1 ist reine Fehlerbehebung. Die Pakete 2 bis 4 ändern Modell und Daten und gelten erst nach Freigabe. **Jan hat am 27.11.2026 13:35 UTC alle Pakete freigegeben („Alle, nacheinander“).**

## Offene Punkte
- Fachtypik und Schrittprofile: Setzung aus Erfahrungswissen; je Fach an der Fachdidaktik zu belegen [U]
- Stufenprofile: plausibel, Lehrpläne nicht je Land nachgeschlagen [A]
- Regelwerke zur Sicherheit außerhalb von Naturwissenschaft und Technik: nicht nachgeschlagen [A]
- Auswahl durch ein Sprachmodell: nicht erprobt [H]
- Ursache der Fälle in U1: an drei Fällen geprüft; Protokoll der Kandidaten je Schritt fehlt [U]
- Güte der Urteile im Test: eine Person, ein Lauf
- Höchstlänge einer Phase je Stufe: keine belastbaren Werte [U]

## Nachweise
- Aebli, H. (1983). Zwölf Grundformen des Lehrens. Klett-Cotta.
- Höfler, M., Woerfel, T., Vasylyeva, T., & Twente, L. (2024). Wirkung sprachsensibler Unterrichtsansätze. Zeitschrift für Erziehungswissenschaft, 27(2), 449–495.
- KMK (2023). Richtlinie zur Sicherheit im Unterricht (RiSU), Fassung vom 21.09.2023.
- Pashler, H., McDaniel, M., Rohrer, D., & Bjork, R. (2008). Learning styles: Concepts and evidence. PSPI, 9(3), 105–119.
- Swanson, H. L., & Hoskyn, M. (1998). Review of Educational Research, 68(3), 277–321.
- Tetzlaff, L., Simonsmeier, B. A., Peters, T., & Brod, G. (2025). Learning and Instruction, 98, 102142.
- Szenariotest der Planungs-Engine, Bericht vom 27.11.2026; FMT 2.0: Entscheidungen aus der Umsetzung; Repository Commit 633e460.
