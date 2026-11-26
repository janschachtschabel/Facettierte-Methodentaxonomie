# FMT 2.0 im Repository: Design

Stand 2026-11-26. Planung für die Integration der FMT 2.0 (W-Raster über alle didaktischen W-Fragen) in Daten, Kern, API, MCP, Baukasten und Systematik. Grundlage ist `main` bei Commit `1d61ef9` (303 Methoden, 13 Ketten).

Quellen, alle unter `/mnt/project-files/fmt2/quellen/`:

| Datei | Rolle |
|---|---|
| `fmt2-taxonomie-w-fragen.md` | gültig: das Modell (im Folgenden „FMT 2.0“) |
| `fmt2-kodierleitfaden.md` | gültig: Kodierregeln für die 303 Methoden |
| `fmt2-baukasten-fachkonzept.md` | gültig: Wirkung im Baukasten, Pakete A bis D |
| `fmt-paper-begruendung-aufbau-verwendung.md` | gültig: Paper auf Stand 2.0, Begründung |
| `protokoll-abgeloest-rahmen-und-auftraege.md` | abgelöst: nur Protokoll (Paket 0.9.0) |
| `fmt2-vorschlag/` | Regelsatz (JSON), Datenvorschlag (CSV), Probe der Bindung, 20 Testfälle, Skripte |

Die zweite Fassung der drei Papiere, die Jan um 21:36 UTC nachgereicht hat, ist bytegleich mit der ersten.

## 1 Absicht

Die 13 Facetten beantworten nur das „Wie“. In der Erprobung führte das zu Sonderregeln im Code: Klassenraummethoden in der Sporthalle, Fishbowl im Hörsaal, Abrufquiz für Kinder, die nicht lesen. Die FMT 2.0 stellt Methode und Situation in ein Raster aus neun W-Feldern und ersetzt die Sonderregeln durch Angaben im Datenmodell und durch Regeln, die als Daten gepflegt werden. Dieses Design sagt, wie das im Repository aussieht.

**Ziele**

- Das W-Raster ist die eine Quelle für Zuordnung, Binnendifferenzierung, Entwurf, Schnittstellen und Systematikseite.
- Sonderregeln für Fächer und Räume in `zuordnung.ts` entfallen, sobald Raumbedarf und Zielart-Bindung dieselben Qualitätsfälle bestehen.
- Jeder Ausschluss nennt das Merkmal, jede Warnung Regel und Quelle. Fehlt eine Pflichtangabe, nennt die Antwort die Lücke und das Angenommene.
- Für Teilgruppen ist die Hilfe der Normalfall und der Methodentausch die begründete Ausnahme.
- Der Entwurf spricht die Sprache des Bildungsbereichs.

**Nicht-Ziele**

- Die 13 Facetten und ihre Werte ändern (A1 bleibt bei acht Lernfunktionen, zwölf Lernstände bleiben).
- Ein Regelwerk je Bundesland für Sicherheit und Aufsicht.
- Die Leseregeln für Freitext neu bauen. Sie bleiben Code; nur was sie liefern, ändert sich (Zielart statt Kette).
- Paper und Begleitdokumente überarbeiten.

**Was das Ergebnis verfehlen würde**

- Eine Methode verschwindet still, weil ein neues Feld noch nicht kodiert ist.
- Ein Qualitätsfall, der heute besteht, fällt nach dem Abbau einer Sonderregel durch.
- Die Oberfläche zeigt Taxonomie-Fachsprache statt Klartext, oder Schritt 1 des Baukastens wird ein Pflichtformular.
- Methodendaten werden ohne Prüfung geändert (seit 26.11.2026: unabhängige Prüfung durch ein Fable-5.2-Modell statt Jans Durchsicht, Abschnitt 12).

## 2 Rahmen

- Sprache Deutsch. Code-Änderungen ohne Rückfrage; Taxonomie- und Datenänderungen erst als Vorschlag an Jan; kein Push ohne Jans Freigabe.
- Alles läuft ohne Sprachmodell. Ein Modell übersetzt Freitext und gestaltet aus, es wählt keine Methode.
- Bildungsstufe bleibt bei sechs Werten. Schul- und Hochschulfächer hängen nicht an Methoden.
- Bedienkonzept des Baukastens gilt weiter: Schritt 1 ohne Vorauswahl, eine Hauptaktion je Schritt, Klartext, Änderungen für alle nur als Vorschlag zum Übernehmen.
- Planung mit Fable 5.2, Umsetzung mit Opus 5.5 im Thread „Szenarioqualität nach Runde 4 erneut prüfen“. Dort liegen ungepushte Commits aus Stufe 2 des Einsatzprofils (Tasks 4, 5, 6, 8, 7A, 9A). Sie werden weiterverwendet und an dieses Design angepasst (Abschnitt 9).

## 3 Wege

| Weg | Kern | Stärke | Schwäche |
|---|---|---|---|
| 1 Schicht daneben | Sonderregeln bleiben, neue Felder kommen als weitere Rangstufen hinzu | kleines Risiko | zwei Wahrheiten; die Papiere verlangen das Gegenteil; der Code wächst weiter |
| 2 Neubau der Zuordnung | `zuordnung.ts` neu schreiben, Regelmaschine zuerst | sauber | 1.822 Zeilen mit 158 Qualitätsfällen auf einmal riskiert; lange kein lieferbarer Stand |
| **3 Schrittweiser Ersatz** | neue Module neben `zuordnung.ts`; je Sonderregel erst die allgemeine Lösung einschalten, dann die Sonderregel entfernen, jedes Mal gegen alle Qualitätsfälle | jeder Schritt lieferbar und prüfbar; deckt sich mit den Paketen A bis D und mit „lässt sich in Teilen ausliefern“ | zeitweise beide Mechanismen im Code |

Gewählt ist Weg 3. Das ist meine Wahl; Jan hat das Wie der Planung überlassen. Weg 1 widerspricht dem Zweck, Weg 2 gefährdet den erreichten Qualitätsstand.

## 4 Widersprüche und wie sie aufgelöst sind

Die Zeilen W1 bis W13 sind meine Entscheidungen. Jan hat das Entscheiden am 26.11.2026 übertragen; Abschnitt 12 fasst zusammen, was in seinem Auftrag gesetzt ist.

| Nr. | Widerspruch | Auflösung |
|---|---|---|
| W1 | Protokoll: „Anforderung“, „Bedingung“. FMT 2.0 und Jan: „Bedarf“, „Rahmenbedingungen“ | Es gelten Bedarf, Eignung, Rahmenbedingungen, dazu Beitrag, Einordnung, Bauweise (FMT 2.0). „Anforderung“ und „Bedingung“ kommen nirgends vor. Jans Entscheidung. |
| W2 | Einsatzprofil-Spec im Repository gliedert in acht Ebenen mit Kennungen BD1 bis BD6, EG1 bis EG3. FMT 2.0 gliedert in neun W-Felder mal fünf Arten | W-Felder und Arten ersetzen die Ebenen. Die Kennungen BD/EG entfallen; ein Merkmal heißt wie sein Feld. „Einsatzprofil“ bleibt als Sammelwort für Bedarf und Eignung in der Anzeige erlaubt. Die Ebene „Verknüpfung“ löst sich auf: Vorbedingung ist Bedarf im Feld Lernende, Nachbedingung der Beitrag im Feld Lernziele. |
| W3 | Spec: fünf Raumtypen, die Sporthalle bietet keine Fachausstattung. FMT 2.0: elf Raumtypen, die Sporthalle bietet Fachausstattung der Art Sport | FMT 2.0 gilt. `fachraum` bleibt als allgemeiner Raumtyp ohne Art erhalten, damit alte Anfragen weiter gehen. |
| W4 | „Zielart“ meint in der FMT 2.0 zweierlei: die neun Zielarten des Hauptziels und die sechs Wissensarten in D1. Im Repository ist `zielart` heute die Wissensart | Zwei Vokabulare. `zielart` (neun Werte, neu) ist die Angabe der Situation und steht an der Kette. D1 heißt weiter Wissensart. Das Anfragefeld `zielart` nimmt die sechs alten Codes als Alias an. |
| W5 | „Ausschließen darf nur Formales“ gegen „Zielart-Bindung schließt aus“ mit Grundlage S | Die Bindung gehört zum Beitrag („wählt aus und schließt aus“) wie Regel R-04. Sie gilt nur in Haupt- und Sicherungsschritten. Findet ein Schritt deshalb keine Methode, bleibt er offen und die Antwort sagt, welche Wissensart fehlt. Kein stilles Lockern. |
| W6 | FMT 2.0: „zehn Methoden fehlen“, der Regelsatz nennt elf (zusätzlich Methodische Übungsreihe), das Fachkonzept sagt elf | Elf. Die Methodische Übungsreihe fehlt im Katalog tatsächlich. |
| W7 | Zwei Datenvorschläge für Raum- und Schriftbedarf: `einsatzprofil/vorschlag-bedarf.json` (Skript des Repositorys, 303 Zeilen, am heutigen `lernort` gedeckelt) und `fmt2-datenvorschlag.csv` (Wortsuche, 163 Vorschläge zum Raum) | Eine gemeinsame Durchsichtstabelle mit beiden Vorschlägen, einem zusammengeführten Wert und einer Markierung bei Abweichung. Die Deckelung am `lernort` entfällt, weil die Sporthalle jetzt Fachausstattung bietet. |
| W8 | Spec Stufe 3: `geeignetBeiVorwissen` wird zu `ungeeignetBeiVorwissen`. FMT 2.0: eine Regel über B1 ersetzt die 28 Einträge | Die Regel gilt. `ungeeignetBeiVorwissen` gibt es nur als belegte Ausnahme mit `eignungsgrund`. |
| W9 | Heute setzt `fachbereichUngeeignet` eine Methode hart zurück. FMT 2.0: Eignung warnt, das Fach ordnet | Ein begründeter Eintrag warnt und steht in der Rangstufe der übrigen Warnungen. Einträge ohne Begründung entfallen nach der Prüfung (Abschnitt 12). |
| W10 | Planungsprofile trennen Berufsschule und Betrieb; die Bildungsstufe hat für beide nur „Berufsbildung“ und bleibt bei sechs Werten | Neues Anfragefeld `planungsprofil` mit fünf Werten. Ohne Angabe folgt es aus der Bildungsstufe; „Betrieb“, „Unterweisung“, „Ausbilder“ im Text ergeben das Profil Betrieb. |
| W11 | Sperrliste gegen Matrix: Die Binnendifferenzierungsmatrix führt „Sensorische Präferenzen“ als Merkmal | Die kompilierte Matrix bleibt unverändert. Eine Datei `data/teilgruppen.json` legt je Matrix-Merkmal die Antwort fest: Tausch, Hilfe oder gesperrt. Gesperrte Merkmale werden nicht angeboten und lösen nichts aus; nennt eine Anfrage sie, sagt die Antwort, dass Lerntypen nicht belegt sind. |
| W12 | Sicherheit und Aufsicht: Jan will sie als Teil der Unterstützung im Lehr- und Lernprozess einordnen; die Spec stellt sie unter „Beschreibung“ | W-Feld Lernbegleitung. Kein kodiertes Merkmal, sondern die Regel `sicherheitshinweis` und an wenigen Methoden der Text `betreuungshinweis`. |
| W13 | Sechs Pflichtangaben „fragt der Baukasten in einem Schritt ab“ gegen „Schritt 1 leicht und ohne Vorauswahl“ | Freitext bleibt der Einstieg. Nach dem Lesen zeigt eine Zeile „Verstanden“ und „Fehlt noch“ mit den sechs Angaben zum direkten Ergänzen. Nichts ist vorbelegt, nichts blockiert. |

## 5 Datenmodell

### 5.1 Regelsatz (zentral gepflegt)

| Datei | Neu oder geändert |
|---|---|
| `data/vocab.json` | Listen `wfelder` (9), `arten` (5), `merkmale` (je Feld der Methode: W-Feld, Art, Gegenstück der Situation, Wirkung, Grundlage). Neue Schemata: `raumbedarf` (6), `raumtyp` (11, plus `fachraum`; jeder Wert mit `bietet` und wahlweise `fachausstattungArt`), `fachausstattungart` (6), `schriftbedarf` (2), `zielart` (9; je Wert `wissensart` und `lesart`), `begleitziel` (3), `eintragsart` (2), `nachweisform` (4), `sprachniveau` (A1 bis C2), `komplexitaet` (3), `planungsprofil` (5). `lernzustand` bekommt je Wert `lesart` für vier Lesarten. `lernort` entfällt mit der Datenumstellung. |
| `data/ketten.json` | je Kette `zielart` mit den neuen Kennungen und `ansatz`; je Schritt `wissensart`. Neue Kette `vollstaendige-handlung`. Die Reihenfolge in der Datei entscheidet, welche Kette einer Zielart ohne Wunsch gilt. |
| `data/regeln.json` (neu) | 15 Passungsregeln aus dem Regelsatz und die Regel zum Geltungsbereich der Evidenz. Je Regel: Kennung, Name, W-Felder, Bedingung, Wirkung, Grundlage, Quelle, Text. |
| `data/teilgruppen.json` (neu) | je Matrix-Merkmal: Antwort (Tausch, Hilfe, gesperrt), Richtung, Grundlage, Quelle; Text zum Abbau je Maßnahmenbereich; Sperrliste. |
| `data/planungsprofile.json` (neu) | sieben Kernfelder; fünf Profile mit Begriffen für Einheit, größere Einheit, Dokument, Lehrende, Lernende und den zuschaltbaren Modulen. |

Vorlage für alle fünf ist `fmt2-vorschlag/fmt2-regelsatz.json`. Wo sie von diesem Design abweicht, gilt das Design (W3, W4, W11).

**Bedingung einer Regel.** Eine Regel ist entweder deklarativ oder eingebaut. Deklarativ heißt: `wenn.methode` und `wenn.situation` nennen Felder mit Werten, die Maschine vergleicht. Für Listen an der Methode gibt es drei Vergleiche: `enthaelt` (mindestens einer), `nur` (kein anderer Wert), `ohne` (keiner). Eingebaut heißt: Die Logik steht im Code, die Regel steht trotzdem mit Wirkung, Grundlage und Text in der Datei, damit Anzeige und Schnittstelle sie nennen können. Eingebaut sind `bedarf-gedeckt`, `zielart-bindung`, `nachweis-passt-zum-ziel`, `sicherheitshinweis`, `lehrkraft-nicht-doppelt`, `genannter-wunsch-bleibt`, `gruppierung-nur-mit-anpassung`, `leistungsschwache-nicht-unter-sich`, `evidenz-geltung`.

Wie „wenig Anleitung“ genau gelesen wird (B1 nur „offen“ oder auch „offen“ neben „geleitet“), ist eine Setzung. Ein Bericht zählt je Regel die getroffenen Methoden und geht mit dem zweiten Datenvorschlag an Jan.

**Zwei Regelfamilien.** Die Kompositionsregeln R-00 bis R-12 prüfen ein Arrangement und bleiben. Die Passungsregeln verbinden Situation und Methode. R-06 verweist künftig auf die Passungsregeln und heißt „Eignung und Passung“ statt „Bedingungsraum“.

### 5.2 Methode

| Feld | Änderung | W-Feld, Art |
|---|---|---|
| `raumbedarf` | neu, Liste; leer heißt kein besonderer Bedarf | Lernumgebung, Bedarf |
| `fachausstattungArt` | neu, nur wo eine Kernkomponente die Art bindet | Lernumgebung, Bedarf |
| `schriftbedarf` | neu, Liste aus `liest`, `schreibt` | Lernende, Bedarf |
| `termineMin` | neu, Zahl, selten | Zeit, Bedarf |
| `eintragsart` | neu, `methode` (Vorgabe) oder `hilfe` | Einordnung |
| `raumhinweis` | bisher `raum` (Freitext) | Lernumgebung, Text |
| `betreuungshinweis` | neu, Text, selten | Lernbegleitung, Text |
| `eignungsgrund` | neu: je Merkmal (`stufe`, `vorwissen`, `fachbereich`) Text, Grundlage (E, S, A) und Quelle | Eignung |
| `ungeeignetBeiVorwissen` | ersetzt `geeignetBeiVorwissen`; nur als belegte Ausnahme | Lernende, Eignung |
| `lernort` | entfällt | – |
| `evidenz[].evidenzBezug` | dritter Wert `programm` | Beleg |
| D1 Wissensart, B3, `fachbereichUngeeignet`, `ungeeignetBeiStufe` | Durchsicht nach Kodierleitfaden | – |

Eine Hilfe trägt keine Phase: Sie hat keine Nachbedingung, erscheint in keinem Kettenschritt und steht im Katalog mit eigenem Filter. Die 172 Maßnahmen der Matrix bleiben, wo sie sind, und gelten als Hilfen.

### 5.3 Situation (Anfrage)

| Feld | Typ | Wirkung |
|---|---|---|
| `zielart` | Code, neun Werte; alte Wissensart-Codes als Alias | wählt die Kette |
| `zieltyp` | Code, Kette (bleibt) | Wunsch: eine bestimmte Kette |
| `begleitziel` | Codes: `sprache`, `sozial`, `selbstregulation` | ordnet unter Gleichwertigen; ergänzt Begleitstrang und Hinweis |
| `raum` | Code Raumtyp; `lernort` als Alias | Vorbelegung der Raumeigenschaften |
| `raumBietet` | Codes Raumbedarf | überschreibt die Vorbelegung |
| `fachausstattungArt` | Code | überschreibt die Art des Raumtyps |
| `ohneSchrift` | Codes: `lesen`, `schreiben` | schließt Methoden mit diesem Schriftbedarf aus |
| `termine` | Zahl | schließt Methoden mit höherem `termineMin` aus |
| `komplexitaet`, `sprachniveau` | Code | warnen über Regeln |
| `nachweis` | Code Nachweisform | ordnet die Prüfmethode |
| `bewertet` | ja/nein | geht in den Entwurf |
| `lehrende` | Zahl | ab zwei entfällt die Regel „Lehrkraft nicht doppelt gebunden“ |
| `planungsprofil` | Code | Begriffe und Module des Entwurfs |
| `thema`, `einheit` | Text | gehen in den Entwurf; `einheit` ist die übergeordnete Einheit |

Alle bisherigen Felder bleiben. Teilgruppen bleiben Sache der Anpassungsschnittstelle (`adapt`), nicht der Zuordnung.

### 5.4 Antwort

- `pflichtangaben`: `fehlt` (Liste aus den sechs) und `angenommen` (Feld, Wert, Grund). Der Raum, den die Zuordnung heute still aus dem Fach ableitet, steht künftig hier. `annahmen` bleibt als Textliste für alte Aufrufer.
- `regelmeldungen`: je Meldung Regel, Wirkung, Grundlage, Quelle, Text und wahlweise Methode. Die Textlisten `warnungen` und `hinweise` bleiben und werden daraus gefüllt.
- Jeder Ausschluss in `ausgeschlossen.rahmen` nennt zusätzlich `merkmal`.
- Offene Schritte nennen den Grund, zum Beispiel die fehlende Wissensart.

## 6 Kern

Neue Module in `packages/fmt-core/src`, jedes klein und für sich testbar:

| Modul | Aufgabe | Ersetzt in `zuordnung.ts` |
|---|---|---|
| `situation.ts` | Anfrage zur Situation machen: Raumtyp zu Eigenschaften, Aliase, Pflichtangaben, Angenommenes | `setRoom`, stille Ableitungen |
| `bedarf.ts` | prüft jeden Bedarf gegen die Rahmenbedingung, liefert Merkmal und Grund | `rahmen`, `fitsRoom`, Rangstufe für `lernort`, Filter `roomOnly` |
| `zielart.ts` | Zielart zu Kette, Bindung der Wissensart je Schritt, Lesarten, Form des Nachweises einer Methode | `byAnsatz`, `VERB_CHAINS` als Kettenwahl, `isPraxisMethod`, `praxisFremd`, `offPractice`, Tanz-Sonderfall, praktischer Prüfschritt |
| `regeln.ts` | Passungsregeln laden und auswerten | `passung`, `geeignetBeiVorwissen` |
| `teilgruppen.ts` | Tausch oder Hilfe je Merkmal, Gleichwertigkeit, Hinweise | Schwellen `WEAK_FIT`, `MIN_GAIN` als Auslöser des Tauschs |
| `planungsprofil.ts` | Begriffe, Kernfelder und Module je Bildungsbereich | Vorgabe „Sekundarstufe I“ |

**Abbau der Sonderregeln.** Jede Zeile der rechten Spalte wird einzeln entfernt. Vor und nach jedem Entfernen laufen alle Qualitätsfälle; ein Fall, der vorher bestand, muss weiter bestehen. Fällt einer durch, bleibt die Sonderregel, und der Fall kommt mit Ursache in den Bericht (meist fehlt dann eine Methode oder eine Kodierung). Die Leseregeln für Zeit, Stufe, Fach, Gruppe und die Wortlisten für Text- und Mediendomänen (`domainPenalty`) bleiben.

**Reihenfolge der Wirkung** in der Rangfolge einer Methode: Beitrag und Bindung (schließt aus), Bedarf (schließt aus, wenn die Situation das Gegenstück nennt), Wunsch genannt, Warnungen aus Regeln und Eignung, dann die weiche Ordnung. Ein Begleitziel wirkt nur innerhalb der Toleranz, in der Methoden als gleichwertig gelten, damit es das Hauptziel nicht verdrängt.

**Fehlende Kodierung.** Solange `raumbedarf` und `schriftbedarf` fehlen, gilt der Bedarf als leer. Fehlt die Wissensart in D1, trägt die Methode in gebundenen Schritten nicht; die elf betroffenen Methoden stehen deshalb im ersten Datenvorschlag.

**Teilgruppen.** Reihenfolge der Antworten: Die Methode passt; Hilfe in der Methode; parallele Methode. Getauscht wird nur, wenn das Merkmal laut `teilgruppen.json` einen Tausch vorsieht und die geplante Methode die zugehörige Regel auslöst, oder wenn ein Bedarf formal nicht gedeckt ist (lesen, schreiben, sich bewegen). Lässt die Methode Anpassung zu (B3 nicht nur „uniform“) und ist der Grund kein formaler, bleibt die Methode und bekommt eine Hilfe. Ein Ersatz muss gleichwertig sein: gleicher Lernstand für dieselbe Wissensart, Bedarf im selben Raum und Zeitfenster gedeckt, keine neue Warnung, Lehrkraft nicht in beiden Methoden gebunden. Jede Hilfe nennt, wann sie entfällt.

Drei Klarstellungen dazu. Erstens: Sieht das Merkmal eine Hilfe vor, bleibt es bei der Hilfe, auch wenn die Methode in B3 nur „uniform“ ist. Eine Hilfe wird an die Methode angelegt und verändert sie nicht; B3 entscheidet nur bei Merkmalen mit Tausch, ob getauscht oder geholfen wird. Zweitens: Der Weg vom Merkmal zur Regel steht in `teilgruppen.json` als Richtung der Zeile (mehr Anleitung, weniger Anleitung, explizit mit Strategie); Lernschwierigkeiten lösen den Tausch aus, wenn die Methode keine explizite Anleitung trägt. Drittens: Matrix-Merkmale, die die Tabelle nicht nennt, bekommen die Antwort Hilfe mit Grundlage „ungeklärt“. „Kann nicht lesen“, „kann nicht schreiben“ und „kann sich nicht bewegen“ sind Angaben der Teilgruppe, keine Matrix-Merkmale.

**Angenommener Raum.** Nennt die Anfrage keinen Raum, wird einer angenommen und unter `pflichtangaben.angenommen` genannt: Sporthalle im Fach Sport, Fachraum bei psychomotorischem Ziel in Berufspraxis oder Naturwissenschaft und Technik, sonst Klassenraum. Ein angenommener Raum schließt nie aus; er ordnet nur. Ausgeschlossen wird wegen des Raums nur, wenn die Lehrkraft ihn genannt hat.

## 7 Schnittstellen

- **REST.** `/api/v1/fields` und `/api/v1/schema` folgen der Feldliste des Kerns. `/api/v1/meta` liefert W-Felder, Arten, Merkmale, Regeln, Raumtypen, Zielarten, Planungsprofile. `/api/v1/match` und `/api/v1/plan` liefern `pflichtangaben` und `regelmeldungen`. `/api/v1/adapt` liefert je Teilgruppe die Antwort (passt, Hilfe, Tausch) mit Beleg und Abbau. `/api/v1/methods` filtert nach `eintragsart`, `raumbedarf`, `schriftbedarf`.
- **MCP.** Die Werkzeuge übernehmen die Felder aus dem Kern. `build_scenario_plan` nennt in der kompakten Antwort Lücken, Angenommenes und Regelmeldungen. `list_vocabularies` führt die neuen Listen. `adapt_scenario` und `list_differentiation_options` zeigen Tausch oder Hilfe und keine gesperrten Merkmale.
- **Linked Data.** Ontologie, JSON-LD-Kontext und JSON-Schema bekommen die neuen Eigenschaften; die neuen Vokabulare erscheinen als SKOS-Schemata.
- **Alte Aufrufer.** `lernort`, die sechs alten Zielart-Codes und `fachraum` werden weiter angenommen. Die Katalogversion steigt auf 2.0.0, wenn `lernort` aus den Methoden verschwindet.

## 8 Oberfläche

**Baukasten, fünf Schritte wie bisher**

| Schritt | Änderung |
|---|---|
| 1 Vorhaben | Zeile „Verstanden / Fehlt noch“ mit den sechs Pflichtangaben. Raum als Auswahl mit ankreuzbaren Eigenschaften. Aufklappbar: Begleitziele, Vorwissen, Sprachniveau, Komplexität, „können nicht lesen“, „können nicht schreiben“, Termine, Nachweis, übergeordnete Einheit. |
| 2 Methodisches Konzept | Über dem Ablauf: fehlende Angaben und Angenommenes. Je Warnung Regel und Quelle; eine Setzung heißt Setzung. Je Ausschluss das Merkmal. „Ablauf stimmig“ statt „gut“. Evidenz mit Bezug Methode, Prinzip oder Programm. Lernstände in der Lesart der Zielart. |
| 3 Binnendifferenzierung | Je Teilgruppe zuerst die Hilfe, mit dem Satz, wann sie entfällt. „Andere Methode“ nur mit Beleg. Hinweise zu Gruppierung und gemischten Gruppen. Gesperrte Merkmale fehlen in der Auswahl. |
| 4 Material | Hilfen aus Schritt 3 erscheinen als Material. Begleitstrang für Begleitziele. |
| 5 Fertiges Szenario | Sieben Kernfelder; Begriffe und Module nach Planungsprofil; Exporte folgen. |

**Systematikseite.** Der Abschnitt „Ergänzende Merkmale neben den 13 Facetten“ wird zum Abschnitt „W-Raster“: neun W-Felder mal fünf Arten aus `vocab.merkmale`, Raumtypen mit Eigenschaften, Zielarten mit Ketten und Wissensart je Schritt, Lesarten der Lernstände, Passungsregeln mit Grundlage, Tabelle „Tausch oder Hilfe“, Planungsprofile. Die Zuordnungsstufen nennen die neuen Wirkungen. Die Überschrift „11 Lernzustände“ wird auf zwölf berichtigt.

**Methodendetail und Katalog.** Das Detail gliedert nach W-Feld und Art. Der Katalog filtert nach Eintragsart, Raumbedarf und Schriftbedarf. Ästhetische Methoden zeigen kein Transferversprechen.

## 9 Lieferung

Vier Pakete wie im Fachkonzept, je ein Pull Request. Jedes Paket ist fertig, wenn alle Qualitätsfälle des Repositorys und die 20 neuen ohne neuen offenen Befund laufen.

| Paket | Code (ohne Rückfrage) | Daten (erst nach unabhängiger Prüfung, Abschnitt 12) |
|---|---|---|
| A Raum, Schrift, Zielart | Vokabulare, Typen, `situation.ts`, `bedarf.ts`, `zielart.ts`, Feldliste, Leseregeln, Abbau der Sonderregeln, Schnittstellen, Oberfläche für Raum | Durchsicht 1: `raumbedarf`, `schriftbedarf`, `termineMin`, Wissensart D1, Sport-Einträge bei „ungeeignet im Fach“, `raum` zu `raumhinweis` |
| B Regeln und Pflichtangaben | `regeln.ts`, `data/regeln.json`, Pflichtangaben, Regelmeldungen, Anzeige | Durchsicht 2: 28 Vorwissens-Einträge, 47 Stufen-Einträge, 48 verbleibende Fach-Einträge, Regel-Treffer-Bericht |
| C Teilgruppen | `teilgruppen.ts`, `data/teilgruppen.json`, Gleichwertigkeit, Sperrliste, Eintragsart Hilfe, Schritt 3 | Durchsicht 2: fünf Kandidaten für „Hilfe“, B3 „nur uniform“ |
| D Entwurf und Katalog | Planungsprofile, sieben Kernfelder, Begleitziele, Lesarten, Evidenzbezug „Programm“ | Durchsicht 3: Kette „vollständige Handlung“, elf neue Methoden und Hilfen, sechs Hattie-Befunde |

Die 20 neuen Fälle kommen als vierte Reihe in `packages/fmt-core/test/qualitaet`. Fälle, die an Daten hängen, tragen bis zur Prüfung die Markierung `bekannt`.

**Vorhandene Arbeit.** Die ungepushten Commits aus Stufe 2 des Einsatzprofils bleiben die Grundlage für Paket A: `einsatzprofil.ts` wird zu `bedarf.ts`, die Listen `ebenen` und `merkmale` werden zu `wfelder`, `arten` und `merkmale`, die fünf Raumtypen zu elf, das Anfragefeld `raum` mit Alias `lernort` und `ohneSchrift` bleiben. Der Datenvorschlag `einsatzprofil/vorschlag-bedarf.json` geht in die gemeinsame Durchsichtstabelle ein (W7). Die Stufe 3 des alten Plans ist durch die Pakete A und B ersetzt.

**Stand der Stufe-2-Commits.** Sie liegen nur im Umsetzungs-Thread und waren beim Planen nicht sichtbar. Der Plan ist deshalb gegen `main` geschrieben und legt alle Schnittstellen selbst fest. Der Umsetzende übernimmt aus den Commits, was passt, und richtet es an den Namen des Plans aus.

**Reihenfolge in Paket A.** Der Abbau der Sonderregeln läuft erst gegen geprüfte Daten. Paket A ist ein Pull Request, der Code und geprüfte Daten zusammen enthält.

## 10 Dem Umsetzenden überlassen

- Namen der internen Funktionen und der genaue Zuschnitt der Dateien, solange die Modulgrenzen aus Abschnitt 6 gelten.
- Gewichte in der weichen Ordnung, solange die Qualitätsfälle bestehen.
- Layout der neuen Anzeigen im Rahmen des Bedienkonzepts.
- Wortlaut der Regeltexte, in einfachem Deutsch.

## 11 Offene Punkte aus den Papieren

Sie bleiben offen und stehen als Grenzen auf der Systematikseite: Die Bindung ist gezählt, aber noch nicht an den Fällen gerechnet (wird in Paket A geprüft). Was ein Raumtyp bietet, ist gesetzt. Die Lesarten sind gesetzt. Zwei unabhängige Kodierende und Fachlehrkräfte fehlen. Der Nutzen für das Lernen ist mit Tests nicht zu klären.

## 12 Entscheidungen in Jans Auftrag

Jan am 26.11.2026: „übernimm du die prüfarbeit mit einem fable 5.2 modell und entscheide selbst“. Daraus folgt:

| Entscheidung | Begründung |
|---|---|
| Der Regelsatz der Papiere (`fmt2-regelsatz.json`: Raumtypen, Zielarten, Ketten mit Wissensart je Schritt, 15 Passungsregeln, Tabelle Tausch oder Hilfe, Planungsprofile) gilt als übernommen. | Er ist das Ergebnis der Recherche, gegen das Repository abgeglichen (Abschnitt 4) und trägt je Regel seine Grundlage. Setzungen bleiben als Setzung sichtbar. |
| Die vier Setzungen der FMT 2.0 bleiben: was ein Raumtyp bietet, die Bindung der Wissensart je Schritt, die Lesarten der Lernstände, die Form des Nachweises. | Ohne sie wirkt das Raster nicht. Sie stehen auf der Systematikseite als Setzung und lassen sich in den Daten ändern, ohne Code anzufassen. |
| Die Widersprüche W1 bis W13 sind wie in Abschnitt 4 aufgelöst. | Je Zeile dort. Wo zwei Papiere sich widersprechen, gilt das jüngere (FMT 2.0, Kodierleitfaden, Fachkonzept) und Jans frühere Wortwahl. |
| Datenvorschläge an den 303 Methoden prüft statt Jan ein unabhängiges Fable-5.2-Modell (frischer Kontext, kennt Vorschlag, Kodierleitfaden und Methode, nicht die Schlüsse des Vorschlagenden). | Jans Auftrag. Die Unabhängigkeit ersetzt, so gut es ohne zweite Person geht, die zwei Kodierenden des Leitfadens. |
| Bei Uneinigkeit zwischen Vorschlag und Prüfung gilt die vorsichtigere Lesart: kein Bedarf und keine Warnung ohne Beleg. | Ein Bedarf schließt aus; ein falscher Bedarf nimmt einer Lehrkraft eine brauchbare Methode. Eine fehlende Angabe führt nur dazu, dass eine Methode zu oft vorgeschlagen wird (Kodierleitfaden). |
| Jede Prüfung hinterlässt ein Protokoll unter `/mnt/project-files/fmt2/pruefung/` mit allen Abweichungen und Gründen. | Damit Jan nachlesen und einzelne Werte zurückdrehen kann. |
| Neue Methoden und Hilfen (elf) kommen mit Status „Entwurf“ in den Katalog. | Sie sind neu geschrieben und nicht nur neu kodiert; der Status hält das sichtbar, bis Jan sie gelesen hat. |
| Ein angenommener Raum ordnet nur, er schließt nicht aus. | Eine Annahme, die die Lehrkraft nicht gemacht hat, darf ihr keine Methode nehmen. |
| Eine vorgesehene Hilfe bleibt Hilfe, auch bei Methoden mit B3 „nur uniform“. | Sonst würde bei der Hälfte des Katalogs getauscht, gegen die Regel „erst Hilfe, dann Tausch“ und gegen den Fall n08. |

Unverändert bleibt: Jeder Push wartet auf Jans Freigabe. Die Prüfung durch ein Modell ersetzt weder zwei menschliche Kodierende noch Fachlehrkräfte; das steht weiter als Grenze in Abschnitt 11.
