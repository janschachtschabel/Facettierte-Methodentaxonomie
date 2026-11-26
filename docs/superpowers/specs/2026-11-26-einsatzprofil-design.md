# Einsatzprofil: Design

Stand 2026-11-26. Grundlage: Begutachtung, Empfehlung und Zweitprüfung (Claude Doc „Einsatzprofil: unabhängige Zweitprüfung“, https://claude.ai/artifact/5DkdirJ4wRLEahhEKUftr3). Entscheidungen von Jan am 2026-11-26: Wörter „Bedarf“ und „Rahmenbedingungen“ sind gesetzt; Sicherheit und Aufsicht wird kein kodiertes Merkmal.

## 1 Ziel

Die 13 Facetten bleiben unverändert. Neben ihnen bekommt jede Methode ein benanntes **Einsatzprofil**. Die Zuordnung nutzt es mit erklärter Wirkung. Auslöser waren Sportstunden mit Klassenraummethoden; die Zweitprüfung zeigte dasselbe Muster für Hörsaal, Klasse 1 und DaZ.

## 2 Begriffe

| Begriff | Gehört zu | Bedeutung |
|---|---|---|
| Facette | Methode | Merkmal der Bauweise: Was ist die Methode? |
| Einsatzprofil | Methode | Alle Einsatzmerkmale: Bedarf und Eignung |
| Bedarf (BD) | Methode | Was die Methode braucht. Tatsache, an der Beschreibung ablesbar. |
| Eignung (EG) | Methode | Für wen und wo sie passt. Urteil mit Begründung und Grundlage (E, S oder A). |
| Rahmenbedingungen | Szenario | Was die Situation mitbringt: Raum, Zeit, Gruppe, Ausstattung, Lerngruppe |

Der Bedarf wird gegen die Rahmenbedingungen geprüft (Zuordnungsstufe „2 Rahmen“). Die Eignung ergibt die Passung (Stufe „4 Passung“). Nicht mehr verwenden: „Bedingungsraum“, „Ergänzende Merkmale“, „Lernort“ für Raumtypen, „Anforderung“ (belegt durch den Anforderungsbereich in D1), „Bedingung“ für das Szenario (belegt durch Vor- und Nachbedingung).

Art und Wirkung sind getrennt: Die Art (Bedarf oder Eignung) hängt am Inhalt. Die Wirkung steht je Merkmal daneben und greift nur, wenn das Szenario die passende Angabe macht.

## 3 Ebenen

| Ebene (Kennung) | Frage | Felder |
|---|---|---|
| Bauweise (`bauweise`) | Wie ist die Methode gebaut? | 13 Facetten, `reichweite`, `kernkomponente`, `slot`, `komposit` |
| Einsatzprofil: Bedarf (`bedarf`) | Was braucht sie? | BD1 bis BD6 |
| Einsatzprofil: Eignung (`eignung`) | Für wen und wo passt sie? | EG1 bis EG3 |
| Verknüpfung (`verknuepfung`) | Wie schließt sie an? | `vorbedingung`, `nachbedingung` |
| Beleg (`beleg`) | Wie gut ist sie gestützt? | `evidenz`, `qualitaetsrisiko` |
| Beschreibung (`beschreibung`) | Wie wird sie durchgeführt? | `name`, `alternativname`, `kurzbeschreibung`, `problem`, `durchfuehrung`, `variante`, `hinweis`, `raumhinweis`, `betreuungshinweis`, `piktogramm` |
| Einordnung (`einordnung`) | Wo steht sie im Katalog? | `ansatz`, `kategorie`, `plot` |
| Verwaltung (`verwaltung`) | – | `status`, `quellen`, `kennung` |

## 4 Einsatzmerkmale

| Kennung | Merkmal | Felder | Form | Wirkung | Grundlage |
|---|---|---|---|---|---|
| BD1 | Raumbedarf | `raumbedarf` | Liste „braucht“ | schließt aus, wenn das Szenario den Raum nennt; sonst ordnet | formal |
| BD2 | Zeitbedarf | `dauerMin`, `dauerMax` | Spanne | schließt aus | formal |
| BD3 | Gruppengröße | `gruppeMin`, `gruppeMax`, `teamMin`, `teamMax` | Spanne | schließt aus | formal |
| BD4 | Ausstattungsbedarf | `technik`, `internet`, `ki`, `material` | Stufe, ja/nein, Text | schließt aus | formal |
| BD5 | Vorbereitungsaufwand | `vorbereitungMin` | Minuten | schließt aus, wenn angegeben | formal |
| BD6 | Schriftbedarf | `schriftbedarf` | Liste | schließt aus, wenn das Szenario „kann nicht lesen“ oder „kann nicht schreiben“ nennt | formal |
| EG1 | Bildungsstufe | `ungeeignetBeiStufe` | ungeeignet | warnt | je Eintrag |
| EG2 | Vorwissen | `ungeeignetBeiVorwissen` | ungeeignet | warnt | je Eintrag |
| EG3 | Fachbezug | `fachbereich`, `fachbereichUngeeignet` | typisch, ungeeignet | ordnet; ungeeignet ordnet nach unten und zeigt einen Hinweis | S |

### BD1 Raumbedarf

Vokabular `raumbedarf` (Werte): `schreibplatz` (Schreibplatz), `stellflaeche` (Stellfläche: freie Fläche zum Stehen, Gehen oder für Stuhlkreise, im Klassenraum durch Umräumen), `bewegungsflaeche` (Bewegungsfläche: große freie Fläche zum Laufen und Spielen), `wandflaeche` (Wand- oder Tafelfläche), `fachausstattung` (Fachausstattung: Werkstatt, Labor, Küche, Instrumente, Rechner), `aussenort` (Ort außerhalb des Gebäudes). Alle Einträge einer Methode müssen erfüllt sein. Leer heißt: keine besondere Anforderung an den Raum.

Vokabular `raumtyp` (Rahmenbedingung des Szenarios, bisher `lernort`). Jeder Wert trägt `bietet`:

| Raumtyp | bietet |
|---|---|
| `klassenraum` | schreibplatz, stellflaeche, wandflaeche |
| `hoersaal` | schreibplatz, wandflaeche |
| `bewegungsraum` | stellflaeche, bewegungsflaeche |
| `fachraum` | schreibplatz, stellflaeche, wandflaeche, fachausstattung |
| `draussen` | stellflaeche, bewegungsflaeche, aussenort |

„Feste Bestuhlung“ ist damit kein Wert: Dem Hörsaal fehlt die Stellfläche. „Lernort“ bleibt frei für die Einrichtung (Schule, Betrieb, außerschulischer Ort); dieses Merkmal kommt erst mit dem Ausbau der beruflichen Bildung.

Ist der Ort konstitutiv (Exkursion, Waldpädagogik), steht er zusätzlich als Kernkomponente in der Methode.

### BD6 Schriftbedarf

Vokabular `schriftbedarf`: `liest` (Lernende lesen Text), `schreibt` (Lernende schreiben Text). Wer schreibt, braucht in der Regel einen Schreibplatz; der Datenvorschlag leitet `schreibplatz` daraus ab.

### Eignung

`geeignetBeiVorwissen` wird durch sein Komplement `ungeeignetBeiVorwissen` ersetzt, damit „geeignet“ nicht zweierlei bedeutet. Begründungen stehen in `eignungsgrund`: je Merkmal (`stufe`, `vorwissen`, `fachbereich`) ein Text und eine Grundlage (`E` belegt, `S` gefolgert, `A` gesetzt). Fehlt der Eintrag, gilt `A`, und die Warnung sagt das.

Bei `fachbereichUngeeignet` entfallen die Sport-Einträge, die nur den Raum meinen (Stufe 3 des Plans, mit Datenvorschlag zur Durchsicht). Eine Methode, die im Text mit ihrem Hauptnamen genannt ist, bleibt trotz „ungeeignet“ im Ablauf und bekommt einen Hinweis.

## 5 Betreuung und Aufsicht, Sicherheit

Kein kodiertes Einsatzmerkmal. Begründung: Die Gefährdung hängt am Inhalt (Stoff, Werkzeug) und am Raum, nicht an der Methode; ein fehlender Eintrag läse sich wie eine Entwarnung.

Zum Wort: „Unterstützung“ ist im Vokabular durch B3 Adaptivität belegt (Scaffolding, „Maß der Unterstützung“). Aufsicht ändert sich nicht mit Lernunterschieden. Der Bereich heißt deshalb **Betreuung und Aufsicht** und gehört zur Ebene Beschreibung:

- Textfeld `betreuungshinweis` an wenigen Methoden (Begleitperson, ständige Aufsicht, Unterweisung vorab).
- Regel im Plan: Trifft praktische Arbeit (eine Methode mit `enaktiv` in C2) auf Fachraum, Bewegungsraum oder draußen oder auf die Fachbereiche Naturwissenschaft/Technik, Beruf/Praxis oder Sport, steht im Ergebnis der Hinweis: „Praktische Arbeit: Sicherheitsregeln und Aufsicht nach den Vorgaben des Landes und der Schule beachten (zum Beispiel RiSU in Naturwissenschaften und Technik).“

Ein Bedarfsmerkmal „Betreuungsbedarf“ (zweite Person nötig) wird erst geprüft, wenn Fälle es verlangen.

## 6 Nicht aufgenommen

Lautstärke, Sprachniveau, Barrierefreiheit, Kosten als eigene Merkmale. Maßstab für spätere Wünsche ist die Aufnahmeregel: Das Merkmal ändert nicht, was die Methode ist; es ist ohne Urteil ablesbar; es unterscheidet; die Zuordnung nutzt es mit erklärter Wirkung.

## 7 `ki` und C4

`ki` bleibt als Teil von BD4 gespeichert. Ein Test prüft: Jede KI-Rolle in C4 (`tutor`, `dialogpartner`, `simulationsrolle`, `belehrbarer-agent`, `antwortgeber`) verlangt `ki: true`. Neun Methoden tragen in C4 zugleich `ki-keine` und `feedbackgeber`; das ist ein Kodierfehler und wird als Datenvorschlag bereinigt. C4 wird nicht aufgeteilt.

## 8 Quelle der Ebenenangabe

`data/vocab.json` bekommt die Listen `ebenen` und `merkmale`. Bundle, `/api/v1/meta`, Systematikseite, Methodendetail und Ontologie lesen von dort. Keine `skos:Collection` aus Konzeptschemata.

## 9 Schnittstelle

Das Anfragefeld `lernort` heißt künftig `raum` (REST, MCP, Kern). `lernort` wird als Alias weiter angenommen und nicht mehr dokumentiert. Neues Anfragefeld `ohneSchrift` mit den Werten `lesen` und `schreiben` (Liste).
