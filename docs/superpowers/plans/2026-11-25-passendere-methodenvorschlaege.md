# Passendere Methodenvorschläge (Stufe 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `zuordnen()` liefert themenabhängige, variable Abläufe, die genannte Methoden enthalten und das Zeitbudget nutzen.

**Architecture:** Die Texterkennung bleibt in `zuordnung.ts`. Drei neue, abhängigkeitsfreie Module übernehmen je eine Entscheidung: Methodennennungen erkennen (`mentions.ts`), Kandidaten bewerten (`ranking.ts`), Zeit verteilen (`zeitverteilung.ts`). `zuordnung.ts` verdrahtet sie in `phase()` und `ablauf()`.

**Tech Stack:** TypeScript (ESM), Vitest, keine neuen Abhängigkeiten.

**Spec:** `docs/superpowers/specs/2026-11-25-passendere-methodenvorschlaege-design.md`

## Global Constraints

- Keine Änderung unter `data/` (Stufe 2 ist nicht Teil dieses Plans).
- Deterministisch: gleiche Anfrage, gleiches Ergebnis; kein `Math.random`, kein `Date`.
- Alle 57 bestehenden Tests bleiben grün; keine Erwartung wird abgeschwächt.
- Abläufe bleiben formal gültig (`pruefung.gueltig`) und innerhalb von `zeitMin`.
- Fehlertexte und Feldnamen deutsch, Codekommentare englisch (wie im Bestand).

## Review Focus

- Text ohne jede Rahmenangabe („Fotosynthese“): Einzelphase wie bisher, kein Absturz, keine leere Liste.
- Genannte Methode, die der Rahmen ausschließt („Rollenspiel“ bei 3 Personen): nicht verankern, Grund in `nichtVerankert`.
- Zwei genannte Methoden für denselben Kettenschritt: erste wird verankert, zweite als zusätzlicher Einsatz oder mit Grund abgelehnt.
- Sehr kleines Budget (20 min, 5 Schritte): Ablauf bleibt gültig, überschreitet das Budget nicht stärker als heute.
- `variante` negativ oder nicht ganzzahlig: Fehler `Feld „variante“` statt stiller Annahme.

---

### Task 1: Referenzsatz (rot)

**Files:**
- Create: `packages/fmt-core/test/golden.test.ts`
- Create: `packages/fmt-core/test/golden-szenarien.ts` (Themenliste, Lesefälle, Nennungsfälle)

**Interfaces:**
- Produces: `THEMEN: Array<[fach: string, thema: string]>` (30 Einträge), `LESEFAELLE`, `NENNUNGEN` für alle weiteren Tasks.

- [ ] **Step 1:** Tests schreiben, je ein `it` pro Ziel der Spec: `variabilitaet-45` (≥ 15 Abläufe, häufigster ≤ 20 %), `katalognutzung` (≥ 40 Methoden über 60 Szenarien), `nennungen` (Kennung in `schritte` oder deren `slots`), `zeitbudget` (0,9·Budget ≤ Dauer ≤ Budget für 45 und 90 min), `lesefaelle`, `gueltigkeit` (alle 60 gültig).
- [ ] **Step 2:** `npm -w @fmt/core test -- golden` ausführen; erwartet: alle Ziel-Tests rot außer `gueltigkeit`.
- [ ] **Step 3:** Commit `test(core): add golden reference scenarios for matcher quality`.

### Task 2: Texterkennung härten

**Files:**
- Modify: `packages/fmt-core/src/zuordnung.ts` (`RULES`, `ANSATZ_RULES`, `phase()`, Moduswahl in `zuordnen()`)

- [ ] **Step 1:** `lesefaelle` um die Fälle der Spec ergänzen (bereits rot aus Task 1).
- [ ] **Step 2:** Regeln ändern: Verneinung von Geräten vor Positivmuster (`ohne|keine` + `tablets|laptops|computer|endgeräte|geräte|technik`); `spiel` nur als ganzes Wort oder `lernspiel`; `hypothesen?` als ganzes Wort; Modus-Wörter mit Wortgrenzen (`reihe`, `einheit`, `wochen`, `modul`, `ablauf`); Erwachsenenbildung/VHS vor Hochschule; Zielart `psychomotorik` für Bewegungswörter, `prozeduren` für Schreiben und Programmieren.
- [ ] **Step 3:** In `zuordnen()`: `zielart` und `lernfunktion` aus semantischer Erkennung sind in `phase()` keine harten Filter (nur ausdrücklich übergebene oder per Schlüsselwort erkannte). Modus `ablauf`, wenn `zeitMin ≥ 40` und kein Phasen-Schlüsselwort erkannt wurde.
- [ ] **Step 4:** Kettenwahl ohne Zieltyp: psychomotorik/prozeduren → `prozedur`; sonst nach Ansatz `forschend → fuenf-e`, `uebung → prozedur`, `kooperativ → kooperatives-lernen`, `instruktion → direkte-instruktion`, `offen → projektlernen`, `diskurs → problemloesen`, sonst `konzeptaufbau`.
- [ ] **Step 5:** `npm -w @fmt/core test`; erwartet: `lesefaelle` grün, Bestand grün.
- [ ] **Step 6:** Commit `fix(matcher): harden free-text rules (negation, word boundaries, mode, chain choice)`.

### Task 3: Methodennennungen erkennen

**Files:**
- Create: `packages/fmt-core/src/mentions.ts`
- Test: `packages/fmt-core/test/mentions.test.ts`
- Modify: `packages/fmt-core/src/index.ts` (Export)

**Interfaces:**
- Produces: `createMentionDetector(data: FmtData): { detect(text: string): MethodMention[] }`, `interface MethodMention { kennung: string; alias: string }`. Reihenfolge wie im Text; je Kennung höchstens ein Eintrag.

- [ ] **Step 1:** Tests: „Rollenspiel“ → `rollenspiel`; „mit Schülerexperimenten“ → `experiment` (nicht `demonstrationsexperiment`); „Gruppenpuzzle“/„Jigsaw“ → `gruppenpuzzle`; „Think Pair Share“ → `tps`; „Zuspiel“, „Experimentierfreude“ und „Vortragsreihe“ → keine Nennung; leerer Text → `[]`.
- [ ] **Step 2:** Implementieren. Aliasse = Name ohne Klammerzusatz, Klammerinhalt, `alternativname`. Einwort-Alias ab 6 Zeichen trifft ein Wort mit höchstens 3 Zeichen Beugungsendung; ab 9 Zeichen auch als Kompositum-Ende. Mehrwort-Alias trifft als Wortfolge. Teilt sich ein Alias mehrere Methoden, gewinnt die, deren Hauptname der Alias ist; sonst keine Nennung.
- [ ] **Step 3:** Tests grün, Commit `feat(core): detect methods named in free text`.

### Task 4: Bewertung und Variabilität

**Files:**
- Create: `packages/fmt-core/src/ranking.ts`
- Test: `packages/fmt-core/test/ranking.test.ts`
- Modify: `packages/fmt-core/src/zuordnung.ts` (`rankOf`, `byRank`, `candidates`, `phase`), `packages/fmt-core/src/semantic.ts` (Rahmenwörter, absolute Skala), `packages/fmt-core/src/types.ts` (`MatchRequest.variante`)

**Interfaces:**
- Produces: `softScore(parts: SoftScoreParts): number` mit den Gewichten der Spec; `stableHash(seed: string, id: string): number` (32-Bit FNV-1a, 0..1); `pickOrder<T>(items: Array<{ item: T; hard: number[]; soft: number; id: string }>, seed: string, variante: number): T[]` – sortiert nach `hard`, dann gleichwertige (`soft ≤ best + 0.75`) nach `stableHash(seed + variante, id)`, Rest nach `soft`.
- Consumes: `MethodMention` aus Task 3 (genannte Methode: `soft − 10`).

- [ ] **Step 1:** Tests für `softScore` (Ansatz-Fehltreffer wiegt mehr als Evidenz C gegen A), `stableHash` (stabil, verteilt), `pickOrder` (gleiche Eingabe gleiche Reihenfolge; anderes `seed` andere Spitze bei gleichwertigen; `variante: 1` andere Spitze als `0`; harte Stufe schlägt jede Punktzahl).
- [ ] **Step 2:** `ranking.ts` implementieren, in `zuordnung.ts` verdrahten: `hard = [extra, passung, contrast, domain]`, alles Weitere in `softScore`. Seed = gefalteter Anfragetext ohne Zahlen und Rahmenwörter. Technik-Aufschlag nur, wenn weder `maxTechnik` noch `ohneInternet` noch `ohneKI` gesetzt sind und der Text kein Gerät nennt.
- [ ] **Step 3:** `semantic.rankMethods`: Rahmenwörter (Klasse, Minuten, Schüler, Stufen, Zahlen) vor der Suche entfernen; Score absolut skalieren (`min(1, score / 8)`).
- [ ] **Step 4:** `variante` als Feld (`integer`, Stufe 2) aufnehmen; `check()` lehnt Nicht-Ganzzahlen und negative Werte ab.
- [ ] **Step 5:** `npm -w @fmt/core test`; erwartet: `variabilitaet-45` und `katalognutzung` grün, Bestand grün. Commit `feat(matcher): weighted ranking with topic-seeded variety`.

### Task 5: Verankerung und Zeitverteilung

**Files:**
- Create: `packages/fmt-core/src/zeitverteilung.ts`
- Test: `packages/fmt-core/test/zeitverteilung.test.ts`
- Modify: `packages/fmt-core/src/zuordnung.ts` (`ablauf`, `phase`, `describe`), `packages/fmt-core/src/types.ts` (`AblaufMatchResult.verankert`, `nichtVerankert`, `annahmen`; `PhaseProposal.genannt`)

**Interfaces:**
- Produces: `phaseBudgets(steps: Array<{ funktion: string[] }>, budget: number, floors?: Array<number | undefined>): number[]` – Summe ≤ `budget`, jedes Element ≥ 5 und ≥ `floors[i]`, Anteile laut Spec; `stretch(durations: Array<{ min: number; max: number; cur: number }>, budget: number): number[]` – verteilt Restzeit in 5er-Schritten bis `max`, größte Spanne zuerst.
- Produces im Ergebnis: `verankert: Array<{ baustein: string; schritt: string }>`, `nichtVerankert: Array<{ baustein: string; grund: string }>`, `annahmen: string[]`.

- [ ] **Step 1:** Tests für `phaseBudgets` (5 Schritte Konzeptaufbau, 90 min: Hauptphase ≥ 25, Summe ≤ 90; Floor 30 am Schritt 4 wird eingehalten; 20 min ergibt je ≥ 5) und `stretch` (füllt bis Budget, nie über `max`).
- [ ] **Step 2:** Implementieren und in `ablauf()` verdrahten: Nennungen dem ersten Schritt zuordnen, dessen Ziel sie erreichen und der Rahmen und Prüfer zulässt; sonst als zusätzlicher Einsatz nach dem ersten Schritt mit Funktionsüberschneidung, wenn der Prüfer keinen Fehler meldet; sonst `nichtVerankert` mit Grund. Nach der Auswahl `stretch` anwenden, dann die bestehende Kürzung.
- [ ] **Step 3:** In `phase()`: genannte Methoden zuerst, `genannt: true`.
- [ ] **Step 4:** `npm -w @fmt/core test`; erwartet: `nennungen` und `zeitbudget` grün, Bestand grün. Commit `feat(matcher): anchor named methods and allocate time by phase role`.

### Task 6: Schnittstellen nachziehen und Gesamtprüfung

**Files:**
- Modify: `apps/server/src/mcp/server.ts` (`match_scenario`, `build_scenario_plan`: Parameter `variante`), `apps/server/src/llm/briefings.ts` (`ScenarioPlanArgs.variante`, Ausgabe `verankert`, `nichtVerankert`, `annahmen`), `README.md` (Testzahl)
- Test: `apps/server/test/api.test.ts` (ein Fall: `POST /api/v1/plan` mit „Rollenspiel“ enthält `rollenspiel` in `methodenDetails`)

- [ ] **Step 1:** Servertest schreiben, rot sehen, Parameter durchreichen, grün.
- [ ] **Step 2:** `npm run build && npm test` im Hauptordner; erwartet: Exit 0.
- [ ] **Step 3:** Audit-Skripte erneut gegen den lokalen Server laufen lassen und Vorher/Nachher in die PR-Beschreibung übernehmen.
- [ ] **Step 4:** Commit `feat(api,mcp): expose variante and anchoring info`, Push, Draft-PR.
