# Bedingungen B1–B14: Stand 0 (vor Paket 1)

Stand: 27.11.2026 · Engine-Stand Commit af7aa28 (Q2 eingespielt, FMT 2.1 noch nicht umgesetzt) · 56 Szenarien aus `scripts/szenariotest/szenarien.mts` · Lauf ohne Server-LLM, Variante 0 · Prüfer `scripts/szenariotest/bedingungen.mts` (Task P0.1).

**Der Maßstab `scripts/szenariotest/soll.mts` ist geprüft.** Der unabhängige Torprüfer hat ihn nach Entscheidung 17 einmal geprüft (Protokoll `/mnt/project-files/fmt2/pruefung/soll-szenariotest.md`: 41 Einträge ok, 15 geändert). Alle 15 Änderungen sind eingetragen (Fixrunde 1 zu P0.1). Spätere Änderungen am Maßstab nur mit Grund am Eintrag.

Nachrechnen: `npm run build:data && npm run szenariotest:bedingungen -- <Ordner>` (Lauf im Prozess, schreibt `rohergebnisse.json`, `bedingungen.json`, `bedingungen.md`); mit `--aus <rohergebnisse.json>` ohne neuen Lauf; mit `--paket N` Exit-Code 1, sobald eine Bedingung der Pakete 1 bis N in einem Szenario verletzt ist.

## Zusammenfassung

| Bedingung | Paket | erfüllt | verletzt | entfällt | Spec E12 nennt |
|---|---|---|---|---|---|
| B1 Summe = Zeitvorgabe, Wiederkehr getrennt | 1 | 54 | 0 | 2 | 32 Abläufe |
| B2 Kein Schriftbedarf ohne Schrift | 4 | 3 | 2 | 51 | Nr. 1, 8 |
| B3 Kernhandlung im Hauptschritt | 3 | 4 | 11 | 41 | Nr. 14, 16, 20, 33 |
| B4 Keine R3/R4 als Phase | 1 | 54 | 2 | 0 | Nr. 39, 46 |
| B5 Dauer im Rahmen der Methode | 1 | 54 | 0 | 2 | Nr. 43, 46 |
| B6 Ungültig oder gewarnt → Hinweis | 1 | 54 | 0 | 2 | Nr. 43, 45 |
| B7 Keine Gruppe ohne Nennung | 1 | 5 | 51 | 0 | 49 Pläne |
| B8 Sicherheitshinweis am Raum | 2 | 0 | 19 | 37 | Nr. 38, 41, 42 |
| B9 Annahmen mit Grund | 3 | 24 | 32 | 0 | Nr. 53 |
| B10 Keine „Phase N“, keine Codes, Thema wörtlich | 1 | 46 | 10 | 0 | Nr. 26, 36, 45 |
| B11 /plan und /match gleicher Modus | 1 | 51 | 5 | 0 | 5 Fälle |
| B12 Keine Methode doppelt, Gruppengröße | 2 | 54 | 0 | 2 | Nr. 49 |
| B13 Teilgruppe erhält Hilfe oder Tausch | 4 | 0 | 3 | 53 | Nr. 9, 11, 27 |
| B14 Rückfall gemeldet, nichts Fachfremdes | 2 | 56 | 0 | 0 | Nr. 19, 41 |

Paket 1 ist heute nicht erfüllt: B4 (2), B7 (51), B10 (10) und B11 (5) sind verletzt.

Gegenüber der ersten Messung (Commit 9a663b7, Maßstab ungeprüft) änderte sich nur B10 (44/12 → 46/10): Nr. 10 und 44 lassen nur ganze Satzteile mit Stufe, Zeit, Gruppengröße und Raum weg und gelten nach der Entscheidung des Steuernden als wörtlich. B3 bleibt bei 11 Verletzungen: Nr. 6 kommt hinzu (Kernhandlung Bodypercussion), Nr. 46 entfällt (Titration ist Handgriff, keine Kernhandlung).

## Was sich gegenüber dem Bericht geändert hat

Die Spalte „Spec E12 nennt“ beschreibt den Lauf vom 27.11.2026 auf Commit 633e460. Seitdem haben Q1 und Q2 Teile behoben:
- B1 und B6: Q1 setzt die Wiederkehr als Zeile „Wiederkehr in Folgestunden“ mit 0 Minuten und übernimmt die Prüfmeldungen in die Hinweise (Nr. 43, 45).
- B5: Heute liegt jede Phase im Rahmen ihrer Methode. Nr. 46 hat 90 Minuten Jenaplan-Rhythmisierung (Rahmen 90–450); das verletzt B4, nicht B5.
- B12: Nr. 49 plant ohne Lern-Schnitzeljagd; alle Methoden fassen die genannte Gruppengröße.
- B14: Kein Plan hat heute eine Methode, deren Fachliste das Fach der Stunde ausschließt. Nr. 19 (Differenzielles Lernen, Fachliste Sport und Ästhetik) und Nr. 41 (Bewegungsdemonstration, Fachliste mit Beruf und Praxis) sind nach den Daten nicht fachfremd. Felder `rueckfall` und Lücken-Zeilen gibt es erst ab Paket 1 und 2.
- B2: Nr. 1 und 8 bleiben verletzt (ABC-Liste, Brain Dump, Wirbelgruppe u. a. mit Schriftbedarf in Klasse 1 und 2).

## Lesart des Prüfers

Wo die Bedingung Spielraum lässt, liest der Prüfer so (Grundlage: Aufgabe P0.1 des Plans):
- Zeilen und Knoten: Der Prüfer geht die Knoten so durch wie `extractScheduledPhases` (apps/server/src/routes/assistant.ts): Sequenz und Schleife über ihre Teile, Parallel über `haupt`, Wahl über die erste Option, je `Einsatz` und `Wiederkehr` eine Zeile; dazu der Knoten `Freiphase` aus P1.2. Daraus kommen Kettenschritt (B3, B8) und Minuten je Wiederholung (B5). Passen Zahl oder Methoden von Zeilen und Knoten nicht zusammen, sind B3, B5 und B8 mit dem Grund „Zeilen und Knoten passen nicht zusammen“ verletzt. Methoden in Slots und im Zweig `begleitend` gehören zum Plan (B2, B4, B12, B14), haben aber keine eigene Zeile.
- B3 und B8, Hauptschritt: Vor Paket 3 ist es der Schritt mit Rolle `haupt` und dem größten Zeitanteil der Kette.
- B6: Eine Prüfmeldung gilt als „in Worten“ genannt, wenn ihr Text in einem Hinweis oder einer Regelmeldung steht oder wenn ein Hinweis alle in „…“ zitierten Begriffe der Meldung nennt.
- B7: Mit genannten Teilgruppen zählt der Prüfer die Gruppe „regel“ (Rest der Klasse) mit, weil die Anfrage sie übergibt.
- B1: Ohne genannte Zeit gilt nur die angenommene Zeit unter `pflichtangaben.angenommen` (Feld `zeit`), kein anderer Satz mit Minuten.
- B4 und B5: Eine Methoden-Id, die der Katalog nicht kennt, ist eine Verletzung.
- B9: Für Zeit, Gruppengröße, Raum, Stufe, Fachbereich und „ohne Schrift“ entscheidet `soll.mts`, ob ein Wert genannt ist. Für alle anderen Felder gilt ein Wert als genannt, wenn er als Feld in der Anfrage steht oder `/match` einen Beleg aus dem Text nennt; Belege „semantisch: …“ und „Thema: …“ sind Vermutungen, keine Nennung. Ersetzt die Engine einen genannten Wert durch einen anderen, gilt er nicht als genannt; leere Listen zählen nicht. Unter den Annahmen heißen Zeit „zeit“, Gruppengröße „anzahl“ und Fachbereich „fach“.
- B10 (Entscheidung des Steuernden): Thema bei strukturierter Anfrage gleich dem Text. Bei freiem Text gilt es als wörtlich, wenn es ein zusammenhängender Teil des Texts ist oder wenn nur ganze, durch Komma oder Doppelpunkt getrennte Teile fehlen, die nichts nennen als Fach, Stufe oder Klasse, Gruppengröße, Raum, Phase oder Zeit. Fächer nach `data/crosswalk/oeh-faecher.json` (Name, Alternativnamen, Begriffe). Wörter innerhalb eines Teils herauszulösen bleibt eine Verletzung (Nr. 15, 19, 22, 26, 29, 33, 40, 43, 56; Nr. 21 ist strukturiert). Codes: Vokabular-Ids mit Bindestrich, Ids von Kettenschritten, Regelcodes `R-00` bis `R-99`.
- B11: Fragt `/match` nur mit weniger Feldern erfolgreich (erster Versuch 400), entfällt B11. Heute kommt das nicht vor.
- B13 (Entscheidung des Steuernden): Auf der Planseite zählen Einträge mit „hilfe“ oder „tausch“ in `teilgruppenMethoden`, Einträge in `teilgruppenHilfen` und ein Hilfetext in `groupAdaptations` einer Zeile, der das genannte Merkmal der Gruppe anspricht (Sprache: etwa Satzstarter, Wortspeicher, Fachbegriffe; Lesen: Vorlesen, Screenreader, Textentlastung; Förderbedarf Lernen: Anleitung, Strategie, Lösungsbeispiel; leistungsstark: Vertiefung, Anspruch). Der vorangestellte Themensatz „Zu „…“:“ zählt nicht. Die Art des Merkmals steht am Maßstab (Feld `art`).
- B14: Ohne genanntes Fach (Nr. 52, 53) prüft der Prüfer die Fachpassung nicht. Das Kennzeichen „Grundform“ liest er als Feld `grundform: true` am Baustein (kommt mit Paket 2). Ein Eintrag in `rueckfall` ohne Schritt und ohne Namen ist eine Verletzung; nennt er die Methode per Id, sucht der Prüfer ihren Namen in den Hinweisen.

## Ergebnis des Prüfers

Zeichen: ✓ erfüllt, ✗ verletzt, – entfällt (die Bedingung trifft auf das Szenario nicht zu).

### Je Bedingung

| Bedingung | Paket | erfüllt | verletzt | entfällt |
|---|---|---|---|---|
| B1 | 1 | 54 | 0 | 2 |
| B2 | 4 | 3 | 2 | 51 |
| B3 | 3 | 4 | 11 | 41 |
| B4 | 1 | 54 | 2 | 0 |
| B5 | 1 | 54 | 0 | 2 |
| B6 | 1 | 54 | 0 | 2 |
| B7 | 1 | 5 | 51 | 0 |
| B8 | 2 | 0 | 19 | 37 |
| B9 | 3 | 24 | 32 | 0 |
| B10 | 1 | 46 | 10 | 0 |
| B11 | 1 | 51 | 5 | 0 |
| B12 | 2 | 54 | 0 | 2 |
| B13 | 4 | 0 | 3 | 53 |
| B14 | 2 | 56 | 0 | 0 |

### Je Szenario

| Nr. | Szenario | B1 | B2 | B3 | B4 | B5 | B6 | B7 | B8 | B9 | B10 | B11 | B12 | B13 | B14 | verletzt |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | gs1-mathe-zerlegen-20 | ✓ | ✗ | – | ✓ | ✓ | ✓ | ✗ | – | ✗ | ✓ | ✗ | ✓ | – | ✓ | 4 |
| 2 | gs1-deutsch-anlaute-ohneschrift | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✗ | – | ✓ | ✓ | ✓ | ✓ | – | ✓ | 1 |
| 3 | gs3-sachunterricht-draussen | ✓ | – | – | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | – | ✓ | 2 |
| 4 | gs4-englisch-wortschatz-10 | – | – | – | ✓ | – | – | ✓ | – | ✗ | ✓ | ✓ | – | – | ✓ | 1 |
| 5 | gs2-sport-werfen | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | – | ✓ | 3 |
| 6 | gs4-musik-bodypercussion | ✓ | – | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | – | ✓ | 4 |
| 7 | gs3-kunst-drucken-90 | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | – | ✓ | 3 |
| 8 | gs2-religion-samariter | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ | – | ✓ | ✓ | ✓ | ✓ | – | ✓ | 3 |
| 9 | gs4-mathe-teilgruppen | ✓ | – | – | ✓ | ✓ | ✓ | ✓ | – | ✗ | ✓ | ✓ | ✓ | ✗ | ✓ | 2 |
| 10 | s1-mathe-linfkt-einstieg | ✓ | – | – | ✓ | ✓ | ✓ | ✗ | – | ✗ | ✓ | ✗ | ✓ | – | ✓ | 3 |
| 11 | s1-deutsch-sachtext-gruppen | ✓ | – | – | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | 1 |
| 12 | s1-englisch-rollenspiel | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✗ | – | ✓ | ✓ | ✓ | ✓ | – | ✓ | 1 |
| 13 | s1-bio-mikroskop-90 | ✓ | – | – | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | – | ✓ | 2 |
| 14 | s1-chemie-verbrennung | ✓ | – | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | – | ✓ | 3 |
| 15 | s1-physik-stromkreis-problem | ✓ | – | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ | ✓ | ✓ | – | ✓ | 4 |
| 16 | s1-geschichte-karikatur | ✓ | – | ✗ | ✓ | ✓ | ✓ | ✗ | – | ✗ | ✓ | ✓ | ✓ | – | ✓ | 3 |
| 17 | s1-politik-wahlalter-urteil | ✓ | – | – | ✓ | ✓ | ✓ | ✗ | – | ✗ | ✓ | ✓ | ✓ | – | ✓ | 2 |
| 18 | s1-ethik-luegen-diskussion | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✗ | – | ✓ | ✓ | ✓ | ✓ | – | ✓ | 1 |
| 19 | s1-kunst-linolschnitt | ✓ | – | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | – | ✓ | 5 |
| 20 | s1-musik-songwriting-tablets | ✓ | – | ✗ | ✓ | ✓ | ✓ | ✗ | – | ✗ | ✓ | ✓ | ✓ | – | ✓ | 3 |
| 21 | s1-sport-ausdauer-draussen | ✓ | – | – | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | – | ✓ | 4 |
| 22 | s1-sport-bodenturnen-90 | ✓ | – | – | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | – | ✓ | 4 |
| 23 | s1-informatik-scratch | ✓ | – | – | ✓ | ✓ | ✓ | ✗ | – | ✓ | ✓ | ✓ | ✓ | – | ✓ | 1 |
| 24 | s1-informatik-unplugged | ✓ | – | – | ✓ | ✓ | ✓ | ✗ | – | ✓ | ✓ | ✓ | ✓ | – | ✓ | 1 |
| 25 | s1-wirtschaft-budget | ✓ | – | – | ✓ | ✓ | ✓ | ✗ | – | ✗ | ✓ | ✓ | ✓ | – | ✓ | 2 |
| 26 | s1-mathe-bruch-test | ✓ | – | – | ✓ | ✓ | ✓ | ✗ | – | ✗ | ✗ | ✓ | ✓ | – | ✓ | 3 |
| 27 | s1-mathe-pythagoras-gruppen | ✓ | – | – | ✓ | ✓ | ✓ | ✓ | – | ✗ | ✓ | ✓ | ✓ | ✗ | ✓ | 2 |
| 28 | s1-franz-vokabeln-10 | – | – | – | ✓ | – | – | ✓ | – | ✗ | ✓ | ✓ | – | – | ✓ | 1 |
| 29 | s1-erdkunde-distanz | ✓ | – | – | ✓ | ✓ | ✓ | ✗ | – | ✓ | ✗ | ✓ | ✓ | – | ✓ | 2 |
| 30 | s2-deutsch-gedicht-90 | ✓ | – | – | ✓ | ✓ | ✓ | ✗ | – | ✓ | ✓ | ✓ | ✓ | – | ✓ | 1 |
| 31 | s2-mathe-kurvendiskussion | ✓ | – | – | ✓ | ✓ | ✓ | ✗ | – | ✗ | ✓ | ✓ | ✓ | – | ✓ | 2 |
| 32 | s2-bio-genetik-digital | ✓ | – | – | ✓ | ✓ | ✓ | ✗ | – | ✓ | ✓ | ✓ | ✓ | – | ✓ | 1 |
| 33 | s2-geschichte-projekttag | ✓ | – | ✗ | ✓ | ✓ | ✓ | ✗ | – | ✗ | ✗ | ✓ | ✓ | – | ✓ | 4 |
| 34 | s2-philo-kant-urteil | ✓ | – | – | ✓ | ✓ | ✓ | ✗ | – | ✗ | ✓ | ✓ | ✓ | – | ✓ | 2 |
| 35 | s2-chemie-fakten-20 | ✓ | – | – | ✓ | ✓ | ✓ | ✗ | – | ✗ | ✓ | ✓ | ✓ | – | ✓ | 2 |
| 36 | bs-pflege-transfer | ✓ | – | – | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | – | ✓ | 3 |
| 37 | bs-kfz-bremsen | ✓ | – | – | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | – | ✓ | 3 |
| 38 | bs-einzelhandel-reklamation | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | – | ✓ | 3 |
| 39 | bs-gastro-saucen | ✓ | – | – | ✗ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | – | ✓ | 3 |
| 40 | bs-it-netzwerk-ohneinternet | ✓ | – | – | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ | ✓ | ✓ | – | ✓ | 3 |
| 41 | betrieb-kasse-unterweisung | ✓ | – | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✓ | – | ✓ | 5 |
| 42 | bs-wirtschaft-pruefungsvorb | ✓ | – | – | ✓ | ✓ | ✓ | ✗ | – | ✓ | ✓ | ✓ | ✓ | – | ✓ | 1 |
| 43 | hs-vorlesung-statistik-250 | ✓ | – | – | ✓ | ✓ | ✓ | ✗ | – | ✗ | ✗ | ✓ | ✓ | – | ✓ | 3 |
| 44 | hs-seminar-soziologie-12 | ✓ | – | ✗ | ✓ | ✓ | ✓ | ✗ | – | ✓ | ✓ | ✓ | ✓ | – | ✓ | 2 |
| 45 | hs-bwl-fallstudie-online | ✓ | – | ✗ | ✓ | ✓ | ✓ | ✗ | – | ✗ | ✓ | ✓ | ✓ | – | ✓ | 3 |
| 46 | hs-labor-titration | ✓ | – | – | ✗ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | – | ✓ | 3 |
| 47 | vhs-alpha-einkaufen | ✓ | ✓ | – | ✓ | ✓ | ✓ | ✗ | – | ✓ | ✓ | ✓ | ✓ | – | ✓ | 1 |
| 48 | vhs-spanisch-a1 | ✓ | – | – | ✓ | ✓ | ✓ | ✗ | – | ✗ | ✓ | ✓ | ✓ | – | ✓ | 2 |
| 49 | vhs-excel-4 | ✓ | – | – | ✓ | ✓ | ✓ | ✗ | – | ✓ | ✓ | ✓ | ✓ | – | ✓ | 1 |
| 50 | verein-rueckenfit-60 | ✓ | – | – | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | – | ✓ | 3 |
| 51 | integrationskurs-a2-arzt | ✓ | – | – | ✓ | ✓ | ✓ | ✗ | – | ✗ | ✓ | ✓ | ✓ | – | ✓ | 2 |
| 52 | vage-morgen | ✓ | – | – | ✓ | ✓ | ✓ | ✗ | – | ✓ | ✓ | ✗ | ✓ | – | ✓ | 2 |
| 53 | vage-klimawandel | ✓ | – | – | ✓ | ✓ | ✓ | ✗ | – | ✗ | ✓ | ✗ | ✓ | – | ✓ | 3 |
| 54 | luecke-mathe-45 | ✓ | – | – | ✓ | ✓ | ✓ | ✗ | – | ✓ | ✓ | ✓ | ✓ | – | ✓ | 1 |
| 55 | luecke-nur-zielart | ✓ | – | – | ✓ | ✓ | ✓ | ✗ | – | ✓ | ✓ | ✓ | ✓ | – | ✓ | 1 |
| 56 | luecke-sport-ohne-raum | ✓ | – | – | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | – | ✓ | 4 |

### Verletzungen im Einzelnen

#### B1 (0 verletzt)

Keine.

#### B2 (2 verletzt)

| Nr. | Szenario | Befund |
|---|---|---|
| 1 | gs1-mathe-zerlegen-20 | Mit Schriftbedarf: ABC-Liste (nach Birkenbihl) (schreibt); Freier Abruf (Brain Dump) (schreibt) |
| 8 | gs2-religion-samariter | Mit Schriftbedarf: Concept Cartoon (Meinungsbild zu einer Streitfrage) (schreibt); Wirbelgruppe (schreibt); Freier Abruf (Brain Dump) (schreibt); Reflexionsprompt (schreibt) |

#### B3 (11 verletzt)

| Nr. | Szenario | Befund |
|---|---|---|
| 6 | gs4-musik-bodypercussion | Hauptschritt „Üben mit Rückmeldung“ hält Bewegungsdemonstration & Angeleitetes Nachmachen, nicht „Bodypercussion“ |
| 8 | gs2-religion-samariter | Hauptschritt „Konzept generieren oder darbieten und sichern“ hält Wirbelgruppe, nicht „Erzählkreis“ |
| 14 | s1-chemie-verbrennung | Hauptschritt „Explore: eigenständig erkunden“ hält Kopfstandmethode (Umkehrtechnik), nicht „Schülerversuch“ |
| 15 | s1-physik-stromkreis-problem | Hauptschritt „Lösungsversuche“ hält Provokationstechnik (PO), nicht „Fehlersuche“ |
| 16 | s1-geschichte-karikatur | Hauptschritt „Kooperative Erarbeitung (Team/Experten)“ hält Storytelling im Unterricht, nicht „Karikaturen“ |
| 19 | s1-kunst-linolschnitt | Hauptschritt „Entwerfen und ausarbeiten“ hält Differenzielles Lernen (Bewegungsvariation nach Schöllhorn), nicht „Linolschnitt“ |
| 20 | s1-musik-songwriting-tablets | Hauptschritt „Entwerfen und ausarbeiten“ hält Museumsgang (Gallery Walk), nicht „Songwriting“ |
| 33 | s2-geschichte-projekttag | Hauptschritt „Produktentwicklung, Erprobung & Präsentation“ hält Stegreiftheater (Improvisationsszene), nicht „Zeitzeugeninterview“ |
| 41 | betrieb-kasse-unterweisung | Hauptschritt „Kooperative Erarbeitung (Team/Experten)“ hält Bewegungsdemonstration & Angeleitetes Nachmachen, nicht „Unterweisung“ |
| 44 | hs-seminar-soziologie-12 | Hauptschritt „Kontrovers diskutieren und abwägen“ hält Rollenspiel, nicht „Textdiskussion“ |
| 45 | hs-bwl-fallstudie-online | Hauptschritt q2 nicht in der Tabelle |

#### B4 (2 verletzt)

| Nr. | Szenario | Befund |
|---|---|---|
| 39 | bs-gastro-saucen | Tabelle: Freiarbeit (offene Arbeitsphase) (r3) |
| 46 | hs-labor-titration | Tabelle: Jenaplan-Rhythmisierung (Gespräch, Spiel, Arbeit, Feier) (r3) |

#### B5 (0 verletzt)

Keine.

#### B6 (0 verletzt)

Keine.

#### B7 (51 verletzt)

| Nr. | Szenario | Befund |
|---|---|---|
| 1 | gs1-mathe-zerlegen-20 | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine) |
| 2 | gs1-deutsch-anlaute-ohneschrift | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine) |
| 3 | gs3-sachunterricht-draussen | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine) |
| 5 | gs2-sport-werfen | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine) |
| 6 | gs4-musik-bodypercussion | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine) |
| 7 | gs3-kunst-drucken-90 | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine) |
| 8 | gs2-religion-samariter | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine) |
| 10 | s1-mathe-linfkt-einstieg | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine) |
| 12 | s1-englisch-rollenspiel | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine) |
| 13 | s1-bio-mikroskop-90 | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine), Mündliche Leistungsabfrage / Prüfungsgespräch |
| 14 | s1-chemie-verbrennung | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine) |
| 15 | s1-physik-stromkreis-problem | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine), Mündliche Leistungsabfrage / Prüfungsgespräch |
| 16 | s1-geschichte-karikatur | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine) |
| 17 | s1-politik-wahlalter-urteil | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine), Mündliche Leistungsabfrage / Prüfungsgespräch |
| 18 | s1-ethik-luegen-diskussion | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine), Mündliche Leistungsabfrage / Prüfungsgespräch |
| 19 | s1-kunst-linolschnitt | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine) |
| 20 | s1-musik-songwriting-tablets | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine) |
| 21 | s1-sport-ausdauer-draussen | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine), Mündliche Leistungsabfrage / Prüfungsgespräch |
| 22 | s1-sport-bodenturnen-90 | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine), Mündliche Leistungsabfrage / Prüfungsgespräch |
| 23 | s1-informatik-scratch | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine) |
| 24 | s1-informatik-unplugged | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Ampel- und Fingerabfrage |
| 25 | s1-wirtschaft-budget | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine) |
| 26 | s1-mathe-bruch-test | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine) |
| 29 | s1-erdkunde-distanz | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine) |
| 30 | s2-deutsch-gedicht-90 | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark |
| 31 | s2-mathe-kurvendiskussion | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine), Mündliche Leistungsabfrage / Prüfungsgespräch |
| 32 | s2-bio-genetik-digital | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine) |
| 33 | s2-geschichte-projekttag | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine) |
| 34 | s2-philo-kant-urteil | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine) |
| 35 | s2-chemie-fakten-20 | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine) |
| 36 | bs-pflege-transfer | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Mündliche Leistungsabfrage / Prüfungsgespräch |
| 37 | bs-kfz-bremsen | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine) |
| 38 | bs-einzelhandel-reklamation | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine) |
| 39 | bs-gastro-saucen | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine) |
| 40 | bs-it-netzwerk-ohneinternet | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark |
| 41 | betrieb-kasse-unterweisung | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine) |
| 42 | bs-wirtschaft-pruefungsvorb | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine) |
| 43 | hs-vorlesung-statistik-250 | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine) |
| 44 | hs-seminar-soziologie-12 | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine), Mündliche Leistungsabfrage / Prüfungsgespräch |
| 45 | hs-bwl-fallstudie-online | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine) |
| 46 | hs-labor-titration | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine), Mündliche Leistungsabfrage / Prüfungsgespräch |
| 47 | vhs-alpha-einkaufen | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine) |
| 48 | vhs-spanisch-a1 | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine), Mündliche Leistungsabfrage / Prüfungsgespräch |
| 49 | vhs-excel-4 | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine) |
| 50 | verein-rueckenfit-60 | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine), Mündliche Leistungsabfrage / Prüfungsgespräch |
| 51 | integrationskurs-a2-arzt | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine), Mündliche Leistungsabfrage / Prüfungsgespräch |
| 52 | vage-morgen | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine) |
| 53 | vage-klimawandel | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine) |
| 54 | luecke-mathe-45 | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine) |
| 55 | luecke-nur-zielart | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Mündliche Leistungsabfrage / Prüfungsgespräch |
| 56 | luecke-sport-ohne-raum | Gruppen ohne Angabe: Basisunterstützung & Sprachsensibel, Regelgruppe, Vertiefung & Leistungsstark; Zusatzphasen: Daily Review (Täglicher Abruf-Einstieg nach Rosenshine), Mündliche Leistungsabfrage / Prüfungsgespräch |

#### B8 (19 verletzt)

| Nr. | Szenario | Befund |
|---|---|---|
| 3 | gs3-sachunterricht-draussen | Hinweis nennt den Raum nicht (Außengelände); Hinweis nennt andere Methode: Soziometrische Aufstellung (Lebendige Statistik) |
| 5 | gs2-sport-werfen | Hinweis nennt den Raum nicht (Sporthalle, Sportplatz); Hinweis nennt andere Methode: Aufwärmen / Aufwärmspiel, Bewegungsdemonstration & Angeleitetes Nachmachen |
| 6 | gs4-musik-bodypercussion | Sicherheitshinweis ohne Raum mit Gefahr: „Im Ablauf wird praktisch gearbeitet (z. B. Bodypercussion & Rhythmische Erarbeitung, Abschnittsweises Üben (Teil-Ganz-Methode) und Bewegungsdemonstration & Angeleitetes Nachmachen). Kläre vorher Sicherheit und Aufsicht.“ |
| 7 | gs3-kunst-drucken-90 | Hinweis nennt den Raum nicht (Kunst- oder Werkraum, Werkstatt); Hinweis nennt andere Methode: Lernen am Modell (Cognitive Apprenticeship) |
| 13 | s1-bio-mikroskop-90 | Hinweis nennt den Raum nicht (Fachraum Naturwissenschaften); Hinweis nennt andere Methode: Demonstrationsexperiment, Transferauftrag in veränderter Situation |
| 14 | s1-chemie-verbrennung | Hinweis nennt den Raum nicht (Fachraum Naturwissenschaften); Hinweis nennt die Kernhandlung nicht (Kopfstandmethode (Umkehrtechnik)); Hinweis nennt andere Methode: Soziometrische Aufstellung (Lebendige Statistik) |
| 15 | s1-physik-stromkreis-problem | Hinweis nennt den Raum nicht (Fachraum Naturwissenschaften); Hinweis nennt die Kernhandlung nicht (Provokationstechnik (PO)); Hinweis nennt andere Methode: Praxisauftrag am Arbeitsplatz |
| 19 | s1-kunst-linolschnitt | Hinweis nennt den Raum nicht (Kunst- oder Werkraum, Werkstatt); Hinweis nennt andere Methode: Positionslinie (Meinungsbarometer), Bewegungsdemonstration & Angeleitetes Nachmachen |
| 21 | s1-sport-ausdauer-draussen | Hinweis nennt den Raum nicht (Außengelände); Hinweis nennt andere Methode: Aufwärmen / Aufwärmspiel, Spielform / Zielspiel (Anwenden im Spiel) |
| 22 | s1-sport-bodenturnen-90 | Hinweis nennt den Raum nicht (Sporthalle, Sportplatz); Hinweis nennt andere Methode: Aufwärmen / Aufwärmspiel, Bewegungsdemonstration & Angeleitetes Nachmachen |
| 36 | bs-pflege-transfer | Hinweis nennt den Raum nicht (Fachraum oder Werkstatt); Hinweis nennt die Kernhandlung nicht (Gradual Release of Responsibility (Ich – Wir – Ihr – Du)); Hinweis nennt andere Methode: Positionslinie (Meinungsbarometer) |
| 37 | bs-kfz-bremsen | Hinweis nennt den Raum nicht (Fachraum oder Werkstatt / Kunst- oder Werkraum, Werkstatt); Hinweis nennt andere Methode: Positionslinie (Meinungsbarometer) |
| 38 | bs-einzelhandel-reklamation | Sicherheitshinweis ohne Raum mit Gefahr: „Im Ablauf wird praktisch gearbeitet (z. B. Rollenspiel). Kläre vorher Sicherheit und Aufsicht.“ |
| 39 | bs-gastro-saucen | Hinweis nennt den Raum nicht (Lehrküche); Hinweis nennt andere Methode: Positionslinie (Meinungsbarometer), Geleitetes Experiment in Kleingruppen |
| 40 | bs-it-netzwerk-ohneinternet | Sicherheitshinweis ohne Raum mit Gefahr: „Im Ablauf wird praktisch gearbeitet (z. B. Geleitet-entdeckendes Lernen und Geleitetes Experiment in Kleingruppen). Kläre vorher Sicherheit und Aufsicht.“ |
| 41 | betrieb-kasse-unterweisung | Sicherheitshinweis ohne Raum mit Gefahr: „Im Ablauf wird praktisch gearbeitet (z. B. Bewegungsdemonstration & Angeleitetes Nachmachen). Kläre vorher Sicherheit und Aufsicht.“ |
| 46 | hs-labor-titration | Hinweis nennt den Raum nicht (Fachraum Naturwissenschaften / Fachraum oder Werkstatt); Hinweis nennt andere Methode: Klassenspaziergang, Demonstrationsexperiment |
| 50 | verein-rueckenfit-60 | Hinweis nennt den Raum nicht (Sporthalle, Sportplatz); Hinweis nennt andere Methode: Aufwärmen / Aufwärmspiel, Spielform / Zielspiel (Anwenden im Spiel) |
| 56 | luecke-sport-ohne-raum | Hinweis nennt den Raum nicht (Sporthalle, Sportplatz); Hinweis nennt andere Methode: Aufwärmen / Aufwärmspiel, Bewegungsdemonstration & Angeleitetes Nachmachen |

#### B9 (32 verletzt)

| Nr. | Szenario | Befund |
|---|---|---|
| 1 | gs1-mathe-zerlegen-20 | ansatz = ["kooperativ"] nicht genannt und nicht unter den Annahmen |
| 4 | gs4-englisch-wortschatz-10 | ansatz = ["uebung"] nicht genannt und nicht unter den Annahmen |
| 5 | gs2-sport-werfen | ansatz = ["kooperativ"] nicht genannt und nicht unter den Annahmen; anleitung = ["geleitet"] nicht genannt und nicht unter den Annahmen |
| 6 | gs4-musik-bodypercussion | ansatz = ["kooperativ"] nicht genannt und nicht unter den Annahmen |
| 7 | gs3-kunst-drucken-90 | ansatz = ["kreativ"] nicht genannt und nicht unter den Annahmen; lernfunktion = ["anwendung"] nicht genannt und nicht unter den Annahmen |
| 9 | gs4-mathe-teilgruppen | ansatz = ["uebung"] nicht genannt und nicht unter den Annahmen |
| 10 | s1-mathe-linfkt-einstieg | fachbereich = "mathe-informatik" nicht genannt und nicht unter den Annahmen |
| 16 | s1-geschichte-karikatur | ansatz = ["kooperativ"] nicht genannt und nicht unter den Annahmen |
| 17 | s1-politik-wahlalter-urteil | lernfunktion = ["problemloesen"] nicht genannt und nicht unter den Annahmen |
| 19 | s1-kunst-linolschnitt | ansatz = ["reflexion"] nicht genannt und nicht unter den Annahmen |
| 20 | s1-musik-songwriting-tablets | ansatz = ["kooperativ"] nicht genannt und nicht unter den Annahmen |
| 21 | s1-sport-ausdauer-draussen | ansatz = ["kooperativ"] nicht genannt und nicht unter den Annahmen |
| 22 | s1-sport-bodenturnen-90 | ansatz = ["spiel-simulation"] nicht genannt und nicht unter den Annahmen |
| 25 | s1-wirtschaft-budget | lernfunktion = ["konsolidierung"] nicht genannt und nicht unter den Annahmen |
| 26 | s1-mathe-bruch-test | ansatz = ["kooperativ"] nicht genannt und nicht unter den Annahmen |
| 27 | s1-mathe-pythagoras-gruppen | ansatz = ["kooperativ"] nicht genannt und nicht unter den Annahmen |
| 28 | s1-franz-vokabeln-10 | ansatz = ["uebung"] nicht genannt und nicht unter den Annahmen |
| 31 | s2-mathe-kurvendiskussion | ansatz = ["uebung"] nicht genannt und nicht unter den Annahmen |
| 33 | s2-geschichte-projekttag | ansatz = ["reflexion"] nicht genannt und nicht unter den Annahmen; anleitung = ["explizit"] nicht genannt und nicht unter den Annahmen |
| 34 | s2-philo-kant-urteil | ansatz = ["forschend"] nicht genannt und nicht unter den Annahmen |
| 35 | s2-chemie-fakten-20 | ansatz = ["uebung"] nicht genannt und nicht unter den Annahmen |
| 36 | bs-pflege-transfer | ansatz = ["uebung"] nicht genannt und nicht unter den Annahmen |
| 37 | bs-kfz-bremsen | ansatz = ["offen"] nicht genannt und nicht unter den Annahmen |
| 38 | bs-einzelhandel-reklamation | lernfunktion = ["anwendung"] nicht genannt und nicht unter den Annahmen |
| 41 | betrieb-kasse-unterweisung | ansatz = ["kooperativ"] nicht genannt und nicht unter den Annahmen |
| 43 | hs-vorlesung-statistik-250 | ansatz = ["instruktion"] nicht genannt und nicht unter den Annahmen |
| 45 | hs-bwl-fallstudie-online | lernfunktion = ["orientierung"] nicht genannt und nicht unter den Annahmen |
| 48 | vhs-spanisch-a1 | ansatz = ["uebung"] nicht genannt und nicht unter den Annahmen |
| 50 | verein-rueckenfit-60 | anleitung = ["explizit"] nicht genannt und nicht unter den Annahmen |
| 51 | integrationskurs-a2-arzt | lernfunktion = ["verstehen"] nicht genannt und nicht unter den Annahmen |
| 53 | vage-klimawandel | lernfunktion = ["orientierung"] nicht genannt und nicht unter den Annahmen |
| 56 | luecke-sport-ohne-raum | ansatz = ["kooperativ"] nicht genannt und nicht unter den Annahmen |

#### B10 (10 verletzt)

| Nr. | Szenario | Befund |
|---|---|---|
| 15 | s1-physik-stromkreis-problem | Thema „Physik Stromkreise: Warum leuchtet die Lampe nicht? Fehlersuche als Problemlöseaufgabe“ ist kein zusammenhängender Teil der Anfrage (Wörter innerhalb eines Satzteils fehlen, oder ein fehlender Teil nennt mehr als Fach, Stufe, Gruppengröße, Raum, Phase oder Zeit) |
| 19 | s1-kunst-linolschnitt | Thema „Kunst Linolschnitt: eigenes Motiv schneiden und drucken“ ist kein zusammenhängender Teil der Anfrage (Wörter innerhalb eines Satzteils fehlen, oder ein fehlender Teil nennt mehr als Fach, Stufe, Gruppengröße, Raum, Phase oder Zeit) |
| 21 | s1-sport-ausdauer-draussen | Thema „Ausdauerlauf: durchlaufen lernen“ ≠ Text der Anfrage „Ausdauerlauf: 20 Minuten durchlaufen lernen“ |
| 22 | s1-sport-bodenturnen-90 | Thema „Sport Bodenturnen: Rolle vorwärts und Handstand“ ist kein zusammenhängender Teil der Anfrage (Wörter innerhalb eines Satzteils fehlen, oder ein fehlender Teil nennt mehr als Fach, Stufe, Gruppengröße, Raum, Phase oder Zeit) |
| 26 | s1-mathe-bruch-test | Phasenname „Phase 5“; Thema „Mathe Bruchrechnen, schriftlicher Test mit Note“ ist kein zusammenhängender Teil der Anfrage (Wörter innerhalb eines Satzteils fehlen, oder ein fehlender Teil nennt mehr als Fach, Stufe, Gruppengröße, Raum, Phase oder Zeit) |
| 29 | s1-erdkunde-distanz | Thema „Erdkunde Plattentektonik im Distanzunterricht per Videokonferenz“ ist kein zusammenhängender Teil der Anfrage (Wörter innerhalb eines Satzteils fehlen, oder ein fehlender Teil nennt mehr als Fach, Stufe, Gruppengröße, Raum, Phase oder Zeit) |
| 33 | s2-geschichte-projekttag | Thema „Projekttag Geschichte: Alltag in der DDR, Zeitzeugeninterviews vorbereiten und auswerten“ ist kein zusammenhängender Teil der Anfrage (Wörter innerhalb eines Satzteils fehlen, oder ein fehlender Teil nennt mehr als Fach, Stufe, Gruppengröße, Raum, Phase oder Zeit) |
| 40 | bs-it-netzwerk-ohneinternet | Phasenname „Phase 3“; Thema „Fachinformatiker: Netzwerk-Fehlersuche und Subnetting, Computerraum ohne Internet“ ist kein zusammenhängender Teil der Anfrage (Wörter innerhalb eines Satzteils fehlen, oder ein fehlender Teil nennt mehr als Fach, Stufe, Gruppengröße, Raum, Phase oder Zeit) |
| 43 | hs-vorlesung-statistik-250 | Phasenname „Phase 2“; Code „R-08“ in hinweise; Thema „Vorlesung Statistik I, Hypothesentests“ ist kein zusammenhängender Teil der Anfrage (Wörter innerhalb eines Satzteils fehlen, oder ein fehlender Teil nennt mehr als Fach, Stufe, Gruppengröße, Raum, Phase oder Zeit) |
| 56 | luecke-sport-ohne-raum | Thema „Sport Basketball Korbleger lernen“ ist kein zusammenhängender Teil der Anfrage (Wörter innerhalb eines Satzteils fehlen, oder ein fehlender Teil nennt mehr als Fach, Stufe, Gruppengröße, Raum, Phase oder Zeit) |

#### B11 (5 verletzt)

| Nr. | Szenario | Befund |
|---|---|---|
| 1 | gs1-mathe-zerlegen-20 | /plan „ablauf“, /match „phase“ |
| 10 | s1-mathe-linfkt-einstieg | /plan „ablauf“, /match „phase“ |
| 41 | betrieb-kasse-unterweisung | /plan „ablauf“, /match „phase“ |
| 52 | vage-morgen | /plan „ablauf“, /match „phase“ |
| 53 | vage-klimawandel | /plan „ablauf“, /match „phase“ |

#### B12 (0 verletzt)

Keine.

#### B13 (3 verletzt)

| Nr. | Szenario | Befund |
|---|---|---|
| 9 | gs4-mathe-teilgruppen | Plan: „daz“ ohne Hilfe oder Tausch (teilgruppenMethoden, teilgruppenHilfen, Hilfetext zum Merkmal in groupAdaptations); /adapt: „foerder“ (Förderbedarf Lernen (Persona)) bekommt nur „passt“; Plan: „foerder“ ohne Hilfe oder Tausch (teilgruppenMethoden, teilgruppenHilfen, Hilfetext zum Merkmal in groupAdaptations) |
| 11 | s1-deutsch-sachtext-gruppen | Plan: „daz“ ohne Hilfe oder Tausch (teilgruppenMethoden, teilgruppenHilfen, Hilfetext zum Merkmal in groupAdaptations) |
| 27 | s1-mathe-pythagoras-gruppen | /adapt: „stark“ (leistungsstark (Persona)) bekommt nur „passt“; /adapt: „foerder“ (Förderbedarf Lernen (Persona)) bekommt nur „passt“; Plan: „foerder“ ohne Hilfe oder Tausch (teilgruppenMethoden, teilgruppenHilfen, Hilfetext zum Merkmal in groupAdaptations) |

#### B14 (0 verletzt)

Keine.

