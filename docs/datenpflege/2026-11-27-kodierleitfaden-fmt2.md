# FMT 2.0: Kodierleitfaden für die Methodendatenbank

Stand 27.11.2026, nach Durchsicht 3 (Tor D3). Übernommen aus dem Kodierleitfaden vom 26.11.2026 (`fmt2-kodierleitfaden.md`, Jan Schachtschabel). Die Regeln sind dieselben. Neu sind die Feldnamen und Werte, wie sie in `data/bausteine/*.json` und `data/vocab.json` stehen, und der Stand nach den drei Durchsichten. Die 13 Facetten bleiben, wie sie sind. Die Begründung des Modells steht im Design `docs/superpowers/specs/2026-11-26-fmt2-w-raster-design.md`.

## Zweck und Stand

Der Leitfaden sagt, was an den Einträgen zu kodieren und durchzusehen ist, damit die FMT 2.0 im Baukasten wirkt. Die Zahlen „heute“ sind an `data/` gezählt (314 Einträge: 310 Methoden, 4 Hilfen).

| Arbeit | Feld im Repository | Umfang im Leitfaden (303 Methoden) | Heute |
| --- | --- | --- | --- |
| Raumbedarf setzen | `raumbedarf` | 303 Methoden; Vorschlag für 163 | 127 Einträge mit Raumbedarf (Durchsicht 1) |
| Schriftbedarf setzen | `schriftbedarf` | 303 Methoden; Vorschlag für 115 | 122 Einträge mit Schriftbedarf (Durchsicht 1) |
| Mindestzahl der Termine | `termineMin` | Vorschlag „2“ für 64 Methoden | 21 Einträge (Durchsicht 1, 3) |
| Wissensart in D1 | `aufgabe` (Codes `fakten`, `konzepte`, `prozeduren`, `einstellungen`, `psychomotorik`, `metakognitiv`) | 236 mit „Konzepte“, 11 ohne Wissensart | Jeder Eintrag trägt eine Wissensart, außer `ki-chat` (Tor D1, bewusst leer) |
| Ungeeignet im Fachbereich | `fachbereichUngeeignet` mit `eignungsgrund.fachbereich` | 118 Einträge | 7 Einträge, jeder mit Grund (Durchsicht 2) |
| Geeignet bei Vorwissen auflösen | `geeignetBeiVorwissen` → `ungeeignetBeiVorwissen` mit `eignungsgrund.vorwissen` | 28 Einträge | Feld entfallen; 3 Einträge in `ungeeignetBeiVorwissen` (Durchsicht 2) |
| Ungeeignet bei Bildungsstufe begründen | `ungeeignetBeiStufe` mit `eignungsgrund.stufe` | 47 Einträge | 9 Einträge; die übrigen deckt eine Regel (Durchsicht 2) |
| Eintragsart prüfen | `eintragsart` (`methode`, `hilfe`; ohne Angabe gilt `methode`) | 5 Kandidaten für „Hilfe“ | 4 Hilfen: `scaffolding-hilfen` (Tor D2), `satzmuster-redemittel`, `sprachvergleich`, `zielsetzung-planungsbogen` (Tor D3) |
| B3 durchsehen | `adaptivitaet` | 153 Methoden nur `uniform` | 152 Einträge nur `uniform`; offen |
| Evidenzbezug ergänzen | `evidenz[].evidenzBezug` (`methode`, `prinzip`, `programm`) | 185 Befunde ohne Angabe; 6 stützen sich auf Hattie | 184 ohne Angabe; Hattie nur noch bei `microteaching` (gekennzeichnet) und `votum-ei` (Feedbackmodell, keine Rangfolge) (Tor D3) |

Der Datenvorschlag zu jeder Durchsicht ist ein automatischer erster Durchgang und keine Kodierung \[A\]. Übernommen wird nur, was ein Tor geprüft hat.

## Grundregeln

- **Grundform kodieren.** Maßgeblich ist die Durchführung im Feld `durchfuehrung`. Andere Formen stehen unter `variante`.
- **Als Bedarf nur, was ohne Ausnahme gilt.** Ein Bedarf schließt aus. Was meist nötig oder nur günstig ist, gehört in `raumhinweis` oder `material`; eine Begleitung, die gebraucht wird, in `betreuungshinweis` (bisher in keinem Eintrag gesetzt; die Übungsreihe führt ihren Text im `hinweis`).
- **Ein Bedarf ist ablesbar.** Er steht in den Durchführungsschritten oder im Material. Braucht es ein Urteil, ist es kein Bedarf.
- **Eignung nur mit Begründung und Grundlage.** Jeder Eintrag in `fachbereichUngeeignet`, `ungeeignetBeiVorwissen` und `ungeeignetBeiStufe` hat einen Grund in `eignungsgrund` mit `text`, `grundlage` (`E` belegt, `S` gefolgert, `A` gesetzt) und, wo es eine gibt, `quelle`. Ohne Beleg sagt die Warnung, dass sie eine Setzung ist.
- **Wechselwirkungen stehen im Regelsatz.** Ob wenig Anleitung bei geringem Vorwissen schadet, steht in `data/regeln.json`, nicht an der Methode.
- **Verbreitung ist keine Eignung.** `fachbereich` sagt, wo eine Methode üblich ist.
- **Neue Einträge stehen im Status `entwurf`.** `status: "kuratiert"` setzt nur Jan nach dem Lesen. Ein Entwurf wird vorgeschlagen wie jeder andere Eintrag; in der Rangfolge zählt nur ein kleines Gewicht gegen ihn (`draft`, 0,5 in `ranking.ts`), und die Oberfläche nennt ihn „Ersterfassung“.

## Regeln je Feld

| Feld | Leitfrage | Werte (Codes) | Beispiel | Häufiger Fehler |
| --- | --- | --- | --- | --- |
| `raumbedarf` | Ohne welche Eigenschaft des Raums ist die Methode nicht durchführbar? | `schreibplatz`, `stellflaeche`, `bewegungsflaeche`, `wandflaeche`, `aussenort`, `fachausstattung`; leer heißt: kein besonderer Bedarf | `kugellager`: `stellflaeche`. `aufwaermen`: `bewegungsflaeche`. `lerntagebuch`: `schreibplatz` | einen Raumtyp eintragen (Raumtypen stehen in der Anfrage, Feld `raum`); Wünschenswertes als Bedarf |
| `stellflaeche` oder `bewegungsflaeche` | Reicht ein umgeräumter Klassenraum? | `stellflaeche`: ja. `bewegungsflaeche`: nein, es braucht Halle oder Platz | `fishbowl`: `stellflaeche`. Spielform: `bewegungsflaeche` | beides gleich behandeln |
| `fachausstattung` | Braucht die Methode die Ausstattung des Gegenstands? | Wert in `raumbedarf` oder leer | `vier-stufen-methode`, Schülerexperiment | die Art festlegen, obwohl sie vom Gegenstand abhängt |
| `fachausstattungArt` | Legt eine Kernkomponente die Art fest? | `sport`, `musik`, `labor`, `werkstatt`, `kueche`, `rechner`; meist leer; nur zusammen mit `raumbedarf` `fachausstattung` | `klassenmusizieren`: `musik` | bei jeder Praxismethode setzen |
| `schriftbedarf` | Müssen die Lernenden selbst lesen oder schreiben? | `liest`, `schreibt` | Abrufquiz auf Zetteln: `schreibt`. Vormachen: leer | mitzählen, was nur die Lehrkraft schreibt; „liest“ setzen, wo die Vorlage auch ein Bild sein kann (Tor D3, Darstellungswechsel) |
| `termineMin` | Braucht die Methode Abstand zwischen Terminen? | Zahl ab 2, sonst leer; die Dauer `dauerMin`–`dauerMax` gilt dann für alle Termine zusammen | `lerntagebuch` über Wochen; Projekt | lange Dauer mit mehreren Terminen verwechseln |
| Wissensart in D1 (`aufgabe`) | Für welche Art von Ziel liefert die Methode ihren Lernstand? | `fakten`, `konzepte`, `prozeduren`, `psychomotorik`, `einstellungen`, `metakognitiv` (neben AFB, Struktur und Authentizität im selben Feld) | `teil-ganz-ueben`: `psychomotorik`, `prozeduren`. Soziale Ziele: `einstellungen` (`klassenrat`, `training-sozialer-fertigkeiten`) | `konzepte` als Vorgabe stehen lassen; soziale Ziele als `prozeduren`, dann wählt eine Verfahrenskette den Eintrag (Tor D3) |
| `eintragsart` | Trägt der Eintrag eine Phase und liefert einen Lernstand? | `methode` (Standard) oder `hilfe`; eine Hilfe hat keine `nachbedingung` | Wortspeicher, `satzmuster-redemittel`: `hilfe`. `gruppenpuzzle`: `methode` | Hilfen als Methoden führen |
| `fachbereichUngeeignet` | Gibt es einen Grund, der nicht Raum oder Zielart ist? | Fachbereich, dazu `eignungsgrund.fachbereich` | selten | `sport` eintragen, wenn die Halle gemeint ist (das sagt `raumbedarf`) |
| `ungeeignetBeiVorwissen`, `ungeeignetBeiStufe` | Gibt es einen belegten Grund an der Methode selbst? | Werte aus `vorwissen` und `bildungsstufe`, dazu `eignungsgrund.vorwissen` oder `eignungsgrund.stufe` | `forschendes-lernen` bei geringem Vorwissen | eine Regel des Regelsatzes an jeder Methode wiederholen |
| `evidenz[].evidenzBezug` | Wem gilt der Befund? | `methode`, `prinzip`, `programm` | `training-sozialer-fertigkeiten`: Durlak et al. 2011 mit `programm`. `direkte-instruktion`: Rosenshine 2012 mit `methode`, Stockard et al. 2018 mit `programm` | Programmbefunde als Beleg der Einzelmethode; einen Programmbefund ergänzen, der die Rangfolge hebt (Tor D3, Klassenrat) |
| `evidenz[].grad` und `quelle` | Trägt die Quelle den Befund? | `A` (mindestens zwei Synthesen), `B`, `C`; Quelle aus den Papieren oder dem Katalog | ohne methodenspezifische Quelle: Grad `C`, Quelle „keine methodenspezifische Quelle; …“ | Hattie als Quelle einer Rangfolge; ein Konzeptbuch als Beleg einer Wirkung |
| `evidenz[].geltung` | Wofür gilt der Befund? | Text | „gilt dem Programm, nicht der einzelnen Trainingseinheit“ | einen geteilten Befund ohne eigene Geltung lassen |

Der Wert `programm` beim Evidenzbezug: Die starken Befunde zum sozialen Lernen gelten ganzen Programmen und vererben sich nicht auf eine einzelne Stundenphase (Durlak et al. 2011; Recherche C). `rankingGrade` stuft Grad A mit `programm` oder `prinzip` auf B herab; Grad B mit `programm` bleibt B (offener Punkt aus D6, siehe Abschlussbericht). Effektstärken nach Hattie dienen nicht als Rangfolge (Wecker et al. 2016). \[E\]

## Ablauf einer Durchsicht im Repository

| Schritt | Werkzeug | Ergebnis |
| --- | --- | --- |
| 1 Vorschlag | `packages/fmt-core/scripts/vorschlag-fmt2-bedarf.ts`, `vorschlag-fmt2-eignung.ts`, `vorschlag-fmt2-katalog.ts` | Vorschlagsdokument und CSV unter `/mnt/project-files/fmt2/`; keine Datei unter `data/` ändert sich |
| 2 Tor | zwei unabhängige Prüfer je Block | `…-geprueft.csv`: Spalte `final` ist, was übernommen wird, Spalte `tor` der Grund; die vorsichtigere Lesart gilt |
| 3 Übernahme | `uebernehme-durchsicht.ts` (D1), `uebernehme-eignung.ts` (D2), `uebernehme-katalog.ts` (D3) | Daten in `data/bausteine/`; ein zweiter Lauf ändert nichts |
| 4 Prüfung | `npm run build:data`, Tests von Kern, Server und Web, `npm run qualitaet` (alle Reihen), `npm run qualitaet:ausgang` | kein Qualitätsfall schlechter als im Ausgangsstand |

`uebernehme-katalog.ts` liest die Texte der Spalte `final` nicht maschinell. Eine Tabelle im Skript hält für jede Zeile den Anfang ihres `final`-Textes und die Änderung, für die er steht. Fehlt eine Zeile, fehlt eine Entscheidung oder beginnt ein `final` anders, hält das Skript an.

## Reihenfolge (Stand)

| Schritt | Inhalt | Stand |
| --- | --- | --- |
| 1 | 22 kuratierte Methoden vollständig durchsehen | Durchsicht 1 |
| 2 | alle Praxismethoden: Raumbedarf und Wissensart | Durchsicht 1 |
| 3 | Schriftbedarf für alle | Durchsicht 1 |
| 4 | Raumbedarf für die übrigen; Sport-Einträge bei „ungeeignet im Fach“ entfallen | Durchsicht 1 und 2 |
| 5 | Eignung begründen oder streichen; Vorwissen auflösen | Durchsicht 2 |
| 6 | Eintragsart, Evidenzbezug `programm`, Hattie-Befunde, fehlende Einträge des Regelsatzes | Durchsicht 3 |
| 7 | 184 Befunde ohne Evidenzbezug: Gruppe A (Platzhalter) in einem Zug `methode` mit einheitlichem Wortlaut, Gruppe B einzeln nach Quelle | offen (Tor D3, Teil 4) |
| 8 | B3 (`adaptivitaet`) bei 152 Einträgen nur `uniform` | offen |

Eine Methode ohne Raum- und Schriftbedarf wird nicht ausgeschlossen; sie wird nur zu oft vorgeschlagen. Die Umstellung lässt sich deshalb in Teilen ausliefern. \[S\]

## Qualitätssicherung

| Schritt | Maß | Stand |
| --- | --- | --- |
| Testfälle mit festgelegter Erwartung | 157 Fälle in Reihe 1 bis 3 (Ausgangsstand `ausgang.json`) und 20 neue in Reihe 4; kein Fall schlechter | erfüllt, siehe `docs/qualitaet/2026-11-27-fmt2-abschluss.md` |
| Zwei unabhängige Kodierende | κ ≥ 0,70 je Feld an etwa 30 Methoden | nicht begonnen \[U\] |
| Gegenprüfung durch Fachlehrkräfte | Anteil bestätigter Angaben | nicht möglich; später \[U\] |

## Nachweise

- Durlak, J. A. et al. (2011). The impact of enhancing students’ social and emotional learning. Child Development, 82(1), 405–432.
- Wecker, C., Vogel, F. & Hetmanek, A. (2016). Visionär und imposant – aber auch belastbar? Zeitschrift für Erziehungswissenschaft, 20, 21–40.
- Kodierleitfaden FMT 2.0 vom 26.11.2026 (`fmt2-kodierleitfaden.md`), Datenvorschläge 1 bis 3 und die Protokolle der Tore D1 bis D3 unter `/mnt/project-files/fmt2/pruefung/`.

Die Literatur ist den Rechercheberichten entnommen und hier nicht erneut geöffnet.
