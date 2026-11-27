# FMT 2.0: Abschlussbericht der Qualitätsfälle

Stand 27.11.2026, Branch `claude/project-thread-7yaiw3` nach Task D7 (Übernahme der Durchsicht 3, Tor D3). Grundlage sind `npm run qualitaet` mit allen vier Reihen, `npm run qualitaet:ausgang` und die Ausgangsdatei `packages/fmt-core/test/qualitaet/ausgang.json`. Der Ausgangsstand vor der Umstellung steht in `2026-11-27-fmt2-ausgang.md`, der Zwischenstand nach Paket A in `2026-11-27-fmt2-paket-a.md`.

## Ergebnis in Kürze

- **Kein Fall ist schlechter als vor der Umstellung.** `npm run qualitaet:ausgang` meldet „keine Verschlechterung“: In den 157 Fällen der Reihen 1 bis 3 geht keine Prüfung von bestanden nach nicht bestanden.
- **Reihe 3 ist besser:** 9 statt 11 offene Befunde. `r3-ort-museum-60` besteht jetzt `kriterien`, `r3-kurz-bruchrechnung` besteht `modus` und dazu die drei Prüfungen, die erst im Ablauf greifen.
- **Reihe 4 (die 20 neuen Fälle):** 0 offene Befunde, 1 bekannte Datenlücke statt 19 zu Beginn von Paket A. Die eine Markierung `bekannt` steht mit Grund unten. Vier veraltete Markierungen an Prüfungen, die bestehen, sind entfernt. Ein neuer Test hält fest, dass `bekannt` nur an einer Prüfung stehen darf, die nicht besteht.
- **Durchsicht 3 übernommen:** elf neue Einträge (acht Methoden, drei Hilfen) im Status `entwurf`, Evidenzbezug `programm` bei vier Befunden, ein geteilter Befund, sechs Hattie-Befunde ersetzt oder gekennzeichnet. Die Übernahme ändert 20 von 177 Abläufen, keinen davon zum Schlechteren.

## Zahlen vor und nach der Umstellung

„Vorher“ ist der Ausgangsstand vor Paket A (`ausgang.json`; für Reihe 4, die nicht in der Ausgangsdatei steht, der Stand zu Beginn von Paket A). „Nachher“ ist der Stand nach Task D7. Eine Prüfung ist eine Prüfart an einem Fall (etwa `kriterien` oder `fachpassung`).

| Reihe | Fälle | Prüfungen bestanden vorher | Prüfungen bestanden nachher | Fälle ohne Befund vorher | Fälle ohne Befund nachher | offen vorher → nachher | bekannt vorher → nachher |
|---|---|---|---|---|---|---|---|
| 1 | 48 | 296 von 297 | 296 von 297 | 47 | 47 | 0 → 0 | 1 → 1 |
| 2 | 63 | 384 von 384 | 384 von 384 | 63 | 63 | 0 → 0 | 0 → 0 |
| 3 | 46 | 264 von 275 | 269 von 278 | 35 | 37 | 11 → 9 | 0 → 0 |
| 4 | 20 | – (nicht in `ausgang.json`) | 129 von 130 | – | 19 | 0 → 0 | 19 → 1 |

Reihe 3 hat drei Prüfungen mehr, weil `r3-kurz-bruchrechnung` jetzt einen Ablauf bekommt und damit `zeit`, `methodendauer` und `fachpassung` greifen; alle drei bestehen.

Ausgabe von `npm run qualitaet` je Reihe:

| Reihe | Ausgangsstand | vor D7 (Commit 3c47de3) | nach D7 |
|---|---|---|---|
| 1 | 48 Fälle, 0 offene Befunde, 1 bekannte Datenlücken. Variabilität: 43 verschiedene Abläufe, häufigster 4 %; Sport: 10 verschiedene, häufigster 18 %. | 48 Fälle, 0 offene Befunde, 1 bekannte Datenlücken. Variabilität: 44 verschiedene Abläufe, häufigster 4 %; Sport: 10 verschiedene, häufigster 18 %. | 48 Fälle, 0 offene Befunde, 1 bekannte Datenlücken. Variabilität: 44 verschiedene Abläufe, häufigster 4 %; Sport: 10 verschiedene, häufigster 18 %. |
| 2 | 63 Fälle, 0 offene Befunde, 0 bekannte Datenlücken. Variabilität: 62 verschiedene Abläufe, häufigster 2 %. | 63 Fälle, 0 offene Befunde, 0 bekannte Datenlücken. Variabilität: 62 verschiedene Abläufe, häufigster 2 %. | 63 Fälle, 0 offene Befunde, 0 bekannte Datenlücken. Variabilität: 62 verschiedene Abläufe, häufigster 2 %. |
| 3 | 46 Fälle, 11 offene Befunde, 0 bekannte Datenlücken. Variabilität: 41 verschiedene Abläufe, häufigster 2 %. | 46 Fälle, 9 offene Befunde, 0 bekannte Datenlücken. Variabilität: 41 verschiedene Abläufe, häufigster 5 %. | 46 Fälle, 9 offene Befunde, 0 bekannte Datenlücken. Variabilität: 41 verschiedene Abläufe, häufigster 5 %. |
| 4 | (Beginn Paket A) 20 Fälle, 0 offene Befunde, 19 bekannte Datenlücken. Variabilität: 16 verschiedene Abläufe, häufigster 6 %. | 20 Fälle, 0 offene Befunde, 1 bekannte Datenlücken. Variabilität: 19 verschiedene Abläufe, häufigster 5 %. | 20 Fälle, 0 offene Befunde, 1 bekannte Datenlücken. Variabilität: 19 verschiedene Abläufe, häufigster 5 %. |

## Was in Reihe 4 noch `bekannt` ist

| Fall | Prüfung | Grund |
|---|---|---|
| n19 („Mathematik Klasse 5, Bruchrechnen, Lernkontrolle als klassisches Diktat, 45 Minuten“) | `fachpassung` | Gewollt: Die Lehrkraft nennt das klassische Diktat, der genannte Wunsch bleibt (Regel `genannter-wunsch-bleibt`), und die Regel `eignung-fach` warnt. Die allgemeine Fachprüfung findet deshalb eine Methode der Sprachen im Mathematikplan. Das ist das Ziel des Falls, keine Schwäche. |

Entfernt in D7, weil die Prüfung besteht: `bekannt: { profil: 'Paket D' }` an n13, n14, n15 und n16 (Planungsprofile seit Task D1).

Außerhalb von Reihe 4 bleibt in Reihe 1 `pflege-unterweisung-60` (`enthaelt`): Die Vier-Stufen-Methode erlaubt höchstens 12 Personen; bei 16 Auszubildenden fehlt das Ausweichen in Teilgruppen. Dieser Fall ist auch im Ausgangsstand so markiert.

## Die offenen Befunde in Reihe 3

Reihe 3 ist ein Bericht und wird im Test nicht geprüft. Alle neun Befunde stehen schon im Ausgangsstand. Zwei Befunde des Ausgangsstands sind gelöst.

| Fall | Prüfung | Befund |
|---|---|---|
| r3-ort-erdkunde-bach-90 | kriterien | `ansatz` `spiel-simulation` fälschlich gelesen |
| r3-ort-gs-wald-90 | kriterien | `raum` nicht gelesen statt `draussen` |
| r3-ort-sport-draussen-45 | kriterien | `raum` `bewegungsraum` statt `draussen` |
| r3-gs-deutsch-diktat-45 | leistungskontrolle | keine Leistungskontrolle in den ersten und letzten Phasen |
| r3-s1-informatik-scratch-90 | praxis | Hauptphasen ohne Praxis: `vortrag-prompts`, `gamification`; Praxisanteil 25 % |
| r3-s1-vertretung-30 | modus | erwartet Ablauf, erhalten Einzelphase |
| r3-s1-klassenrat-45 | kriterien | `bildungsstufe` nicht gelesen statt `sek1` |
| r3-bs-erzieher-portfolio-90 | kriterien | `bildungsstufe` nicht gelesen statt `berufsbildung` |
| r3-eb-erstehilfe-120 | kriterien | `zeitMin` 90 statt 120 |

Sieben der neun betreffen das Lesen des Textes (`lesen()`), nicht die Daten.

## Was die Übernahme der Durchsicht 3 an den Plänen ändert

Vergleich der Berichte vor und nach D7 (Commit 3c47de3 gegen den Stand nach D7). 20 von 177 Fällen haben einen anderen Ablauf oder andere erste Vorschläge: 4 in Reihe 1, 5 in Reihe 2, 5 in Reihe 3 und 6 in Reihe 4. Alle bestehen ihre Prüfungen wie vorher.

| Neuer Eintrag | Fälle, in denen er vorkommt | Schritt |
|---|---|---|
| `strukturierte-gruppenreflexion` | r2-gs-religion-feste-45, r2-s1-hauswirtschaft-kochen-90, r2-eb-vhs-deutschkurs-90, r3-s1-ethik-dilemma-45, n03, n05, n16 | letzter Schritt (statt `votum-ei`, `zielscheiben-feedback`, `selbstevaluation-bogen`, `kompetenzraster-diagnose`) |
| `darstellungswechsel` | kleingruppe-3-45, r2-s1-informatik-binaer-45, r3-kurz-bruchrechnung, n15, n17 | Erarbeitung (statt `kooperatives-skript`, `wirbelgruppe`) |
| `gestaltungsaufgabe-gruppen` | kunst-malen-90, r2-gs-kunst-collage-90 | Hauptschritt (statt `markt-der-moeglichkeiten`, `galeriemethode`) |
| `schreiben-mit-schreibrahmen` | r2-eb-vhs-deutschkurs-90, r3-ort-gs-wald-90 | Anwendung (statt `textlupe`, `museumsgang`) |
| `methodische-uebungsreihe` | n01 | Hauptschritt (statt `differenzielles-lernen`) |

Weitere Verschiebungen ohne neuen Eintrag: `neg-partner-gruppe-45` (`induktives-entdecken` und `blitz-anwendung` statt `vortrag-prompts` und `switch-rollentausch`), `kein-check-nachbesprechung-45` (`kreatives-schreiben` statt `museumsgang`), `r3-s1-mathe-funktionen-test-90` (`multiple-choice-test` statt `kompetenzraster-checkliste`, dessen Befund jetzt Grad C hat) und `r3-kurz-abschluss-reflexion-10` (Einzelphase: `feynman-methode` rückt nach, `kompetenzraster-checkliste` fällt aus den ersten vier).

Hilfen (`satzmuster-redemittel`, `sprachvergleich`, `zielsetzung-planungsbogen`) kommen in keinem Plan vor.

## Codeänderungen in D7

- **Textrelevanz nur über Methoden.** Im Probelauf D6 verlor der A2-Plan („VHS Integrationskurs Deutsch A2: beim Arzt“) die SQ3R-Lesemethode, sobald die Hilfe `sprachvergleich` im Katalog stand. Ursache: Der BM25-Index der Textrelevanz (`semantic.ts`, `rankMethods`) enthielt auch Hilfen. `sprachvergleich` stand mit seinem Text an der Spitze der Rangfolge, nahm einen der 35 Plätze ein und setzte den Höchstwert, an dem die Relevanz aller Methoden normiert wird. Eine Hilfe wirkte so über den Text auf die Wahl der Methoden. Jetzt enthält der Index nur Methoden (`nurMethoden`), ebenso die Vektoren von model2vec im Server. Ein Test in `core.test.ts` prüft, dass `rankMethods` keine Hilfe nennt und dass der Plan mit und ohne Hilfen gleich bleibt. Ein Test im Server prüft, dass `/api/v1/classify` keine Hilfe als Methodenvorschlag nennt. Der Test „Schrift bei niedrigem Sprachniveau warnt ohne Tausch“ besteht wieder unverändert.
- **Schema:** `betreuungshinweis` steht jetzt im JSON-Schema und im JSON-LD-Kontext wie in `types.ts`.
- **Methodendetail:** `kategorie` ist im Typ optional wie in den Daten (26 Einträge haben keine OEH-Kategorie, darunter alle elf neuen). Die Detailseite brach bei solchen Einträgen ab.

## Status `entwurf`

Der Status filtert heute nichts. Ein Eintrag im Status `entwurf` wird gesucht und zugeordnet wie jeder andere. In der Rangfolge zählt ein kleines Gewicht gegen ihn (`draft`, 0,5 in `ranking.ts`), und bei Gleichstand gehen kuratierte Einträge vor (`zuordnung.ts`, `methodAdjustments.ts`, `adaptScenario.ts`). Die Suche filtert nur, wenn `status` angegeben ist. Die Oberfläche zeigt den Status als Kennzeichen „Ersterfassung“ in Katalog und Methodendetail. Von 314 Einträgen sind 292 im Status `entwurf`. Das Verhalten ist unverändert.

## Offene Zweifel der Tore

Die Protokolle liegen unter `/mnt/project-files/fmt2/pruefung/`:

- **Tor D1** (`tor-D1.md`, Abschnitt „Offene Zweifel der Prüfer“): die Grenze bei Wandfläche („Tafel oder Pinnwand“); Termine bei Wiederholungsmethoden; Schrift bei Notizen und Chat-Formen; Kandidaten für später (`makerspace-tueftelwerkstatt`, `laufdiktat`, `dual-praxismodul`, `gruppenbildung-zufall`).
- **Tor D2** (`tor-D2.md`, „Offene Zweifel“, sieben Punkte): Sperrliste für präferierte Arbeitsformen; Leistungsniveau als Näherung für Vorwissen; `siebensprung-pbl`; `wirbelgruppe` ohne Raumbedarf; `forschendes-lernen`; `flipped` als Komposit; `rosenshine-daily-review`.
- **Tor D3** (`tor-D3.md`, „Offene Zweifel“, sechs Punkte): Prediger & Wessel 2018 nur als Kurzangabe im Regelsatz; Grad B bei Schülercoaching kaum gedeckt; Microteaching und Hattie 2009; „Johnson & Johnson 2009“ bei der Strukturierten Kontroverse; Kernkomponenten der Ästhetischen Forschung nicht prüfbar; die neuen Einträge bleiben im Status `entwurf`, bis Jan sie gelesen hat.

Offen bleibt aus D6: `rankingGrade` senkt nur Grad A mit Bezug `programm` oder `prinzip`; ein Programmbefund mit Grad B zählt weiter als B (betrifft `training-sozialer-fertigkeiten` und `zielsetzung-planungsbogen`). Teil 4 des Tors D3 (184 Befunde ohne Evidenzbezug) ist für eine spätere Durchsicht vorgemerkt.

## Grenzen

Die offenen Punkte aus Design Abschnitt 11 stehen auf der Systematikseite unter „Grenzen der FMT 2.0“: Die Bindung ist gezählt, aber nicht an Fällen im Unterricht gerechnet. Was ein Raumtyp bietet, ist gesetzt. Die Lesarten sind gesetzt. Zwei unabhängige Kodierende und Fachlehrkräfte fehlen. Der Nutzen für das Lernen ist mit Tests nicht zu klären. Die Qualitätsfälle prüfen, dass die Zuordnung ihren Regeln folgt, nicht, dass Lernende besser lernen.
