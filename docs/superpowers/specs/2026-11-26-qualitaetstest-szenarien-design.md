# Qualitätstest für Szenariovorschläge (Design, kurz)

**Anlass:** Jan hat den Use Case „Sportunterricht 45 Minuten, Ausdauertraining mit anschließender Leistungskontrolle“ geprüft haben wollen und einen Qualitätstest über viele denkbare Anfragen angeregt (2026-11-26). Code-Änderungen sind ohne Rückfrage freigegeben, Daten- und Taxonomieänderungen nur als Vorschlag.

**Ziel:** Eine wiederholbare Suite, die realistische Anfragen durch den Kern (`zuordnen`) schickt und die Antwort nach fachdidaktischen Kriterien prüft. API, MCP und Baukasten rufen denselben Kern auf, deshalb prüft die Suite alle drei Wege mit.

**Nicht-Ziele:** keine neuen Methoden oder Ketten im Katalog; keine LLM-Bewertung (die Suite bleibt deterministisch und läuft in der CI).

## Ansätze

1. **Kriterien-Suite im Kern (gewählt).** Fälle als Daten (`test/qualitaet/faelle.ts`), Prüfungen als Funktionen (`test/qualitaet/pruefen.ts`), Vitest als Gate, Bericht als Markdown (`npm run qualitaet`). Schnell, deterministisch, in der CI.
2. Snapshot der kompletten Antworten. Zeigt jede Änderung, bewertet aber nichts und bricht bei jeder gewollten Verbesserung.
3. LLM-Bewertung der Antworten. Näher am Urteil einer Fachdidaktikerin, aber nicht deterministisch, kostet Tokens und braucht einen Schlüssel in der CI.

## Kriterien je Fall

Immer: gültiger Ablauf, Zeitbudget 90–100 %, jede Methode innerhalb ihrer Dauer, keine fachfremde Methode. Je nach Fall: erwarteter Modus und Kette, Praxis (Hauptphasen sind Bewegungs- oder Praxismethoden), Leistungskontrolle (eine Prüfmethode in den letzten beiden Phasen), genannte Methode enthalten, Verneinungen beachtet, gelesene Kriterien. Über alle Fälle: Variabilität der Abläufe.

Eine **bekannte Datenlücke** (`bekannt`) wird berichtet, lässt den Test aber nicht scheitern. Sie gilt eng: Bei „Praxis“ nur für die Transferphase.

## Code-Änderungen (Kern)

- Verneinte Wendungen („keine Gruppenarbeit“, „ohne Experimente“) wählen nichts mehr aus; ausgeschlossene Sozialformen kommen in eine eigene harte Rangstufe.
- „3 Schüler mit Förderbedarf“, „davon 4 mit DaZ“ ist keine Gruppengröße.
- Leistungskontrolle, Lernkontrolle, Test usw. setzen `liefert: lernstand-diagnostiziert`; mit einem Zeitbudget ab 30 Minuten entsteht ein Ablauf, der mit einer Prüfphase endet (vorhandener Kettenschritt oder zusätzlicher Schritt vor der Abschlussreflexion).
- Bewegungs- und Praxiswörter (Ausdauer, Zirkeltraining, Koordination, Klatschen/Trommeln, Handgriffe, Vier-Stufen-Methode …) setzen die Zielart Psychomotorik.
- In Ketten mit Zielart Psychomotorik bekommen Klassenraummethoden einen Malus (Hauptphase 4, Rahmenphase 1,5; Prüfphase ausgenommen).
- Zeit: Überschreitet die Mindestdauer den Rest der Stunde, kommt die Methode mit der kleinsten Überschreitung zuerst. Reicht das Budget nicht für fünf Minuten je Phase, gibt es Vorschläge für eine Einzelphase mit Hinweis (ausdrücklich `modus: "ablauf"` verkürzt die Phasen auf drei Minuten).
- Themenerkennung: „ein Szenario unterstellen für den …“ und „mit anschließender Leistungskontrolle“ sind Rahmen, kein Thema; „Sportunterricht“ erkennt das Fach.
