# Passendere und variablere Methodenvorschläge – Konzept

Stand: 2026-11-25 · Grundlage: Funktionsaudit vom 2026-11-25 (84 Testanfragen gegen Stand `aa2bf19`).

## Problem

Die Zuordnung (`zuordnen()` in `packages/fmt-core/src/zuordnung.ts`) liefert formal gültige, aber kaum
themen- und fachabhängige Abläufe:

- 30 Themen aus 20 Fächern bei 45 Minuten ergeben 3 verschiedene Abläufe (24 identisch), 7 von 290 Methoden.
- Im Text genannte Methoden (Rollenspiel, Schülerexperiment) fehlen im Ablauf.
- Evidenzgrad, Zeitbudget und Abwechslung stehen in der Rangfolge vor der Nähe zum Anfragetext.
- Die Zeit wird gleichmäßig auf die Kettenschritte verteilt; es entsteht keine Hauptphase.
- Mehrere Textmuster greifen auf Wortteile zu („ohne Tablets“ → Tablets vorhanden, „Zuspiel“ → Spiel).

## Ziele (messbar)

| Ziel | Messung im Referenzsatz | Heute | Soll |
| --- | --- | --- | --- |
| Variabilität | verschiedene Abläufe bei 30 Themen × 45 min | 3 | ≥ 15 |
| Kein Einheitsablauf | Anteil des häufigsten Ablaufs | 80 % | ≤ 20 % |
| Katalognutzung | verschiedene Methoden über 60 Szenarien | 16 | ≥ 40 |
| Genannte Methode enthalten | 6 Szenarien mit Methodennamen | 0 von 6 | 6 von 6 |
| Zeitbudget genutzt | Dauer / Budget bei ≥ 45 min | 62–100 % | 90–100 % |
| Texterkennung | 14 Lesefälle aus dem Audit | 0 von 14 richtig | 14 von 14 |
| Gültigkeit | formal gültige Abläufe | bleibt | bleibt |

Determinismus bleibt: gleiche Eingabe, gleiches Ergebnis. Kein Sprachmodell nötig.

## Lösung in drei Stufen

### Stufe 1 – Zuordnungslogik (nur Code, dieser Plan)

1. **Texterkennung härten** (`lesen()`): Wortgrenzen, Verneinungen („ohne/keine X“) vor Positivmustern,
   Stufenwörter in sinnvoller Reihenfolge (VHS/Erwachsenenbildung vor Hochschule), Zielart für Bewegung,
   Schreiben und Programmieren. Aus dem Text gelesene Zielart ist in der Einzelphase kein harter Filter mehr.
   Eine Zeitangabe ab 40 Minuten ohne ausdrückliches Phasenwort ergibt einen Ablauf.
2. **Genannte Methoden verankern**: Ein Erkenner findet Methodennamen und Synonyme im Text
   (auch in Komposita wie „Schülerexperimente“). Im Ablauf wird die Methode in den ersten Kettenschritt
   gesetzt, dessen Ziel sie erreicht; sie erhält dort Vorrang und ihre Mindestdauer. In der Einzelphase steht
   sie oben. Das Ergebnis nennt `verankert` und begründet nicht verankerbare Nennungen.
3. **Rangfolge als gewichtete Punktzahl**: Harte Stufen bleiben nur für Zielerreichung, Passungswarnung,
   Negativevidenz, Domänensperre und für Methoden, deren Mindestdauer nicht mehr in die verbleibende Zeit passt.
   Danach zählt eine Summe (Werte in `packages/fmt-core/src/ranking.ts`):

   | Merkmal | Punkte (niedriger ist besser) |
   | --- | --- |
   | Ansatz passt nicht | +3 |
   | Anleitung, Interaktion, Engagement, Reichweite passen nicht | je +2 |
   | Wiederholung desselben Methodentyps im Ablauf | +2 je Treffer |
   | Zeit: Mindestdauer über dem Phasenanteil | +1 je 5 min, höchstens +4 |
   | Technik ohne Angabe im Text (Internet, KI, Geräte ab geteilter Nutzung) | +3 |
   | Textnähe (BM25 auf den Themenwörtern, ohne Rahmenwörter wie „Klasse“, „Minuten“) | 0 bis +2 |
   | Evidenzgrad A / B / C / keiner | 0 / +0,5 / +1 / +1,5 |
   | Status Entwurf | +0,5 |
   | Lernfunktion nicht an erster Stelle des Kettenschritts | +0,3 je Position |
   | Vorbereitungszeit | +0,005 je Minute (höchstens 60 min) |
   | Im Text genannt | −10 |

4. **Variabilität mit Determinismus**: Kandidaten, deren Punktzahl höchstens 0,75 über dem besten liegt,
   gelten als gleichwertig. Unter ihnen entscheidet ein Hash aus Themen­text und Methodenkennung statt des
   Alphabets. Neuer Parameter `variante` (Ganzzahl, Standard 0) liefert für „anderer Vorschlag“ die nächste
   gleichwertige Kombination.
5. **Zeit nach Phasenrolle**: Anteile je Lernfunktion des Kettenschritts (Orientierung 12, Erwerb/Verstehen/
   Problemlösen 30, Anwendung 25, Konsolidierung 18, Metakognition/Diagnose 8; normiert auf die Kette).
   Eine verankerte Methode erhält mindestens ihre Mindestdauer. Restzeit wird bis zur Höchstdauer der
   gewählten Methoden verteilt, in 5-Minuten-Schritten.
6. **Kettenwahl ohne Zieltyp**: Ansatz kooperativ → `kooperatives-lernen`, Instruktion →
   `direkte-instruktion`, offen/Projekt → `projektlernen`, Diskurs → `problemloesen`; sonst wie bisher.
7. **Referenzsatz** als Test (`packages/fmt-core/test/golden.test.ts`) mit den Zielwerten oben.

### Stufe 2 – Erweiterungen an Taxonomie und Daten (Vorschlag, erst nach Freigabe)

| Nr. | Erweiterung | Wozu | Umfang |
| --- | --- | --- | --- |
| D1 | Neues Vokabular `fachbereich` (mint, sprachen, gesellschaft, aesthetik, sport, beruf-praxis, uebergreifend) und Feld `fachbereich` je Methode, optional `fachbereichUngeeignet` | Fachgerechte Auswahl; ersetzt die Wortlisten der Domänensperre | 290 Methoden, Erstbefüllung automatisch vorschlagbar, dann Durchsicht |
| D2 | Feld `evidenzBezug` je Evidenzeintrag: `methode` (Studie zur Methode) oder `prinzip` (vom Wirkprinzip abgeleitet) | Abgeleitete A-Grade zählen in der Rangfolge wie B | rund 100 Methoden mit Grad A oder B prüfen |
| D3 | Kettenschritte in `ketten.json` um `rolle` (rand, haupt, sicherung) und `zeitanteil` ergänzen | Zeitverteilung als Daten statt Code | 9 Ketten |
| D4 | Drei neue Ketten: `urteilsbildung` (Diskurs), `fertigkeit-bewegung` (Sport, Praxis), `produktion` (Schreiben, Gestalten, Programmieren) | Fächer, die heute in „Konzeptaufbau“ fallen | 3 Ketten |
| D5 | Vor- und Nachbedingungen von etwa 20 Hauptphasen-Methoden prüfen (Experiment verlangt „Konzept gesichert“ und kann nie Explore-Phase sein) | Kernmethoden an der didaktisch üblichen Stelle einsetzbar | ca. 20 Methoden |
| D6 | Dublette `drei-schritt-interview` / `dreischritt-interview` zusammenführen | Keine doppelten Vorschläge | 1 Methode |
| D7 | Arrangement-Knoten `Wiederkehr` um `ausserhalbBudget` ergänzen (Wiederholung in Folgestunden) | 45-Minuten-Vorschläge lösen R-07 nicht mehr aus | Schema, Prüfer, 1 Regel |

### Stufe 3 – Schnittstellen und Oberfläche (nur Code, eigener Plan)

MCP-Antworten kürzen (`limit`, Kompaktmodus), `isError` setzen, erlaubte Werte als Enum, HTTP 400 statt 500,
erkannte Teilgruppen in `build_scenario_plan` übernehmen, Baukasten leert die Vorlage bei eigener Eingabe,
Suche nach Relevanz sortieren, Themenerkennung bereinigen.

## Ergebnis Stufe 1 (gemessen am 2026-11-25)

| Messung | Vorher | Nachher |
| --- | --- | --- |
| Verschiedene Abläufe, 30 Themen × 45 min | 3 | 21 |
| Anteil des häufigsten Ablaufs, 45 min | 80 % | 13 % |
| Anteil des häufigsten Ablaufs, 90 min | 67 % | 3 % |
| Verschiedene Methoden, 45 min / 90 min | 7 / 16 | 19 / 37 |
| Genannte Methode im Ablauf | 0 von 6 | 6 von 6 |
| Genutzte Zeit bei 45 und 90 min | 62–100 % | 100 % |

Offen bleibt nach Stufe 1: Der Einstieg (häufig „Ampelspiel“) und die Transferphase bei 45 Minuten
(„Blitz-Anwendung“) wechseln kaum, weil nur wenige Methoden das Schrittziel in der knappen Zeit erreichen.
Die Auswahl ist außerdem noch nicht fachgerecht (Sport, Kunst, Musik erhalten Abläufe wie Sachfächer) und
R-07 warnt weiter bei 45 Minuten. Das lösen D1, D3, D4 und D7 aus Stufe 2.

## Nicht-Ziele

Kein Sprachmodell in der Zuordnung, keine Änderung an den Regeln R-00 bis R-12, keine Datenänderung in Stufe 1.
