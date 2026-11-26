# Bedienkonzept Szenario-Baukasten: geführte Schritte

Datum: 2026-11-26 · Status: umgesetzt (PR „Baukasten verständlicher“)

## Absicht

Der Baukasten soll ohne Erklärung bedienbar sein. Jans Vorgaben: In Schritt 1 ist kein didaktischer Ansatz
vorausgewählt. Schritt 2 zeigt das methodische Konzept nur für die Regelgruppe. Schritt 3 nimmt Hinweise zur
Binnendifferenzierung auf, passt bei Bedarf das methodische Vorgehen an und zeigt den aktualisierten Ablauf, mit
anderen oder zusätzlichen Methoden, bevor es zu Material und Ausformulierung geht.

## Ziele, Nicht-Ziele

- Jeder Schritt sagt in einem Satz, was hier zu tun ist, und hat genau eine Hauptaktion.
- Keine Vorbelegung, die eine Entscheidung vorwegnimmt (Text, Ansatz, Ablauf).
- Fachsprache der Taxonomie tritt in der Bedienung zurück („Ablauf stimmig“ statt „Formal gültig“).
- Nicht-Ziel: Änderungen an Taxonomie, Daten, Regeln R-00 bis R-12 oder an der Zuordnungslogik.
- Anti-Ziel: Teilgruppen, die still Methoden der ganzen Klasse verändern.

## Wege, die zur Wahl standen

1. **Nur Vorbelegungen entfernen.** Kleinster Eingriff, erfüllt aber Schritt 3 nicht: Die Wahl einer
   Parallel-Methode lag in einem von vier Reitern und musste je Phase von Hand geschehen.
2. **Teilgruppen in die Zuordnung geben und den Ablauf neu berechnen.** Liefert einen ganz neuen Ablauf, verwirft
   aber die Arbeit aus Schritt 2 und ändert auch den Weg der Regelgruppe.
3. **Gewählt: Ablauf der Regelgruppe bleibt, Teilgruppen bekommen wo nötig eine parallele Methode.** Ein Klick
   prüft jede Phase gegen die Teilgruppen, trägt besser passende Methoden ein, begründet sie und lässt jede einzeln
   zurücknehmen. Schritt 2 bleibt gültig, die Änderung ist sichtbar und umkehrbar.

## Entwurf

**Leiste mit fünf Schritten:** Vorhaben · Methodisches Konzept · Binnendifferenzierung · Material · Fertiges
Szenario. Die Schritte 3 bis 5 sind gesperrt, solange kein Ablauf existiert. Selten gebrauchte Aktionen (Druck,
Datei, JSON, KI) liegen unter „Mehr“.

**Schritt 1, Vorhaben:** leeres Textfeld mit Beispiel im Platzhalter, eine Hauptaktion „Ablauf vorschlagen“. Der
didaktische Ansatz ist freiwillig und leer; ein Satz sagt, was ohne Auswahl geschieht. Beispiele stehen darunter.

**Schritt 2, Methodisches Konzept:** Ablauf für die ganze Klasse in einer Spalte „Regelgruppe (ganze Klasse)“. Im
Text erkannte Teilgruppen werden vorgemerkt und mit einem Hinweis auf Schritt 3 angekündigt, aber nicht gezeigt.

**Schritt 3, Binnendifferenzierung** in drei Abschnitten auf einer Seite:

1. *Wer braucht etwas anderes?* Teilgruppen per Klick oder Kurztext.
2. *Methodisches Vorgehen anpassen.* `proposeMethodAdjustments` (`@fmt/core`) schlägt je Teilgruppe und Phase eine
   Methode derselben Lernfunktion vor, wenn die geplante schwach passt (Passung < 4) und die Alternative um
   mindestens 3 Punkte besser ist. Die Passung nutzt dieselben Signale wie die bestehende Alternativ-Empfehlung
   (Lenkungsbedarf, Facetten-Brücken der Matrix, Hilfestufen, Vertiefung). Schutzregeln: nie mehr Technik, Internet
   oder KI als die ersetzte Methode, kein für den Fachbereich ungeeigneter Baustein, keine völlig offene Methode für
   Gruppen mit Unterstützungsbedarf, keine Methode doppelt, Container mit belegten Slots und Begleitstränge bleiben.
   Von Hand gewählte Methoden werden nie überschrieben.
3. *Dein aktualisierter Ablauf.* Zeitband und Tabelle mit einer Spalte je Teilgruppe, eigene Methoden markiert.

Die bisherigen Reiter (Basis für alle, Zielkonflikte, Feinjustierung, Phasen) bleiben erhalten, eingeklappt unter
„Mehr Details“.

## Grenzen

Die Passung ist eine Heuristik aus der Differenzierungsmatrix, keine Wirksamkeitsaussage. „Zusätzliche Methoden“
heißt hier: eine eigene Methode für eine Teilgruppe neben der Methode der Klasse. Zusätzliche Phasen für alle
entstehen dabei nicht.
