# Einsatzprofil Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Neben den 13 Facetten bekommt jede Methode ein benanntes Einsatzprofil aus Bedarf (BD1–BD6) und Eignung (EG1–EG3), das die Zuordnung mit erklärter Wirkung nutzt.

**Architecture:** `data/vocab.json` wird die einzige Quelle für Ebenen und Merkmale; Bundle, `/api/v1/meta`, Web und Ontologie lesen von dort. Das Merkmal `lernort` wird zu `raumbedarf` (Liste „braucht“ aus Raumeigenschaften); das Szenario nennt einen Raumtyp, der Eigenschaften bietet. Drei Stufen, jede ein eigener PR: (1) Lesen und Hinweise ohne Datenmodell, (2) Datenmodell Bedarf, (3) Eignung bereinigen.

**Tech Stack:** TypeScript, npm workspaces (`@fmt/core`, `@fmt/server`, `@fmt/web`), vitest, tsx, React/Vite, JSON-Daten unter `data/`.

**Spec:** `docs/superpowers/specs/2026-11-26-einsatzprofil-design.md`

## Global Constraints

- Die 13 Facetten (Felder, Werte, Kennungen A1–D2) bleiben unverändert.
- Wörter in Code-Kommentaren (englisch), Oberfläche und Doku (deutsch): „Einsatzprofil“, „Bedarf“, „Eignung“, „Rahmenbedingungen“. Nicht mehr: „Bedingungsraum“, „Ergänzende Merkmale“, „Lernort“ für Raumtypen, „Anforderung“, „Bedingung“ für das Szenario.
- Kennungen: BD1–BD6, EG1–EG3 (Spec Abschnitt 4). Feldnamen und Vokabularwerte exakt wie in der Spec.
- Datenänderungen an Methoden gehen zuerst als Vorschlag zur Durchsicht an Jan (Dateien unter `/mnt/project-files/einsatzprofil/`). Der PR der Stufe bleibt Entwurf, bis Jan den Vorschlag freigegeben hat.
- Qualitätstor: Nach jeder Stufe `npm test` grün und `npm run qualitaet`, `npm run qualitaet -- reihe2` ohne neue offene Befunde gegenüber dem Stand vor der Stufe.
- Ausgangspunkt ist der Arbeitsstand des Umsetzungs-Threads (lokale Änderungen P1, P2, P3, P6, P13 in `zuordnung.ts`). Zeilennummern in diesem Plan gelten für main bei Commit `915e9f2` und dienen nur zur Orientierung; maßgeblich sind die genannten Funktions- und Feldnamen.
- Fehlgeschlagene Tests einzeln nachlaufen lassen; die ganze Suite nur am Ende einer Aufgabe.

## Review Focus

1. **Praxisraum leert einen Kettenschritt:** In der Sporthalle scheiden alle Methoden mit `schreibplatz` aus. Erwartung: Der Ablauf bleibt gültig und vollständig (Sicherung mit Methoden ohne Schreibplatz), keine leeren Schritte. Test in Task 7.
2. **Kein Raum genannt:** Eine Anfrage ohne Raum darf nichts ausschließen; Methoden mit `bewegungsflaeche`, `aussenort` oder `fachausstattung` werden nur nach unten geordnet. Test in Task 7.
3. **Alias `lernort` in der Anfrage:** Bestehende REST- und MCP-Aufrufe mit `lernort` liefern dasselbe wie mit `raum`. Test in Task 7 und Task 8.
4. **Methode ohne `raumbedarf` und ohne `schriftbedarf` (Feld fehlt oder leer):** gilt als „braucht nichts“, wirft nicht. Test in Task 5.
5. **Genannter Wunsch trotz „ungeeignet“ und Alltagswort:** Hauptname bleibt mit Hinweis im Ablauf; ein Synonym, das ein Alltagswort ist („Leistungsmessung“ in Mathe), löst weiter keine Methode aus, steht aber mit Grund unter `nichtVerankert`. Test in Task 2.

---

## Dateien im Überblick

| Datei | Verantwortung | Stufe |
|---|---|---|
| `packages/fmt-core/src/zuordnung.ts` | Leseregeln, `rahmen()`, Raumlogik, Hinweise | 1, 2, 3 |
| `packages/fmt-core/src/mentions.ts` | `MethodMention.main` | 1 |
| `packages/fmt-core/src/einsatzprofil.ts` (neu) | `raumBietet`, `raumFehlt`, `schriftFehlt`, `eignungsWarnungen` | 2, 3 |
| `packages/fmt-core/src/types.ts` | `Baustein`, `MatchRequest`, `MatchHead`, `MerkmalMeta`, `EbeneMeta` | 1, 2, 3 |
| `packages/fmt-core/src/load-data.ts`, `scripts/build-artefacts.ts` | `ebenen`, `merkmale` in Daten, Bundle, JSON-Schema, Ontologie | 2 |
| `packages/fmt-core/src/validate.ts`, `rules.ts` | R-06 Text und Benennung | 1, 3 |
| `packages/fmt-core/src/suche.ts` | Suchfilter `raum` | 2 |
| `packages/fmt-core/scripts/vorschlag-einsatzprofil.ts` (neu) | erzeugt den Datenvorschlag | 2 |
| `packages/fmt-core/scripts/uebernehme-einsatzprofil.ts` (neu) | schreibt den freigegebenen Vorschlag in `data/bausteine/` | 2, 3 |
| `data/vocab.json`, `data/bausteine/*.json` | Vokabulare, Merkmalsliste, Methodendaten | 2, 3 |
| `apps/server/src/routes/api.ts`, `apps/server/src/mcp/server.ts` | `/meta`, Anfragefeld `raum` | 2 |
| `apps/web/src/pages/SystematikPage.tsx`, `MethodDetailPage.tsx`, `CatalogPage.tsx`, `apps/web/src/planner/scenarioModel.ts` | Einsatzprofil anzeigen, `raumhinweis` | 2 |
| `packages/fmt-core/test/einsatzprofil.test.ts` (neu) | Tests für Daten und Logik des Einsatzprofils | 2, 3 |

---

# Stufe 1: Lesen und Hinweise (PR A, keine Datenänderung)

### Task 1: Leseregeln

**Files:**
- Modify: `packages/fmt-core/src/zuordnung.ts` (Regelliste mit `['gruppe', …]`, `['maxTechnik', …]`, `['zielart', … 'psychomotorik']`, `['zieltyp', … 'produktion']`, `['fachbereich', … 'beruf-praxis']`)
- Test: `packages/fmt-core/test/golden-szenarien.ts` (Liste `LESEFAELLE`), läuft über `packages/fmt-core/test/golden.test.ts`

- [ ] **Step 1: Fälle an `LESEFAELLE` anhängen**

```ts
  { text: 'Bewegungsfertigkeit, Klasse 7, ohne Geräte', erwartet: { zielart: 'psychomotorik' }, nicht: { maxTechnik: 't-keine' } },
  { text: 'Mathe Klasse 8 Bruchrechnen ohne Geräte, 45 Minuten', erwartet: { maxTechnik: 't-keine' } },
  { text: 'Chemie Klasse 8 Schülerexperiment Säuren und Laugen, 90 Minuten', erwartet: { fachbereich: 'nawi-technik', zeitMin: 90 }, nicht: { gruppe: 8 } },
  { text: 'Chemie Klasse 8, 24 Schüler, Säuren und Laugen', erwartet: { gruppe: 24 } },
  { text: 'Lehrküche: Messer sicher benutzen, Klasse 8, 45 Minuten', erwartet: { fachbereich: 'beruf-praxis', lernort: 'fachraum' } },
  { text: 'Kunst Klasse 7 Linolschnitt drucken, 90 Minuten', erwartet: { zieltyp: 'produktion', fachbereich: 'aesthetik' } },
```

- [ ] **Step 2: Rot prüfen**

Run: `npm -w @fmt/core test -- golden.test.ts`
Expected: FAIL bei den Fällen 1, 3, 5 und 6.

- [ ] **Step 3: Regeln ändern**

- `gruppe`: Im Muster `schuler\w*` durch `schuler(?:innen|in|n)?` ersetzen, damit „8 Schülerexperiment“ nicht zählt.
- `zielart` → `psychomotorik`: Alternative `\bbewegungs(?:fertigkeit|lernen|aufgabe|schulung)\w*` ergänzen.
- `maxTechnik` → `t-keine`: Die Alternative `gerate` gilt nicht, wenn die Anfrage Bewegung meint. Nach dem Lesen aller Felder: Ist `zielart === 'psychomotorik'` oder `fachbereich === 'sport'` und stammt `maxTechnik` nur aus `ohne geräte` oder `keine geräte`, das Kriterium `maxTechnik` wieder entfernen.
- `fachbereich` → `beruf-praxis`: `\b(?:lehr|schul)kuche\b` ergänzen.
- `zieltyp` → `produktion`: `\blinol(?:schnitt|druck)\w*|\b(?:sieb|hoch|tief)druck\w*|\bradierung\w*` ergänzen.

- [ ] **Step 4: Grün prüfen**

Run: `npm -w @fmt/core test -- golden.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/fmt-core/src/zuordnung.ts packages/fmt-core/test/golden-szenarien.ts
git commit -m "Leseregeln: Bewegung ohne Fachwort, Sportgeräte, Schülerexperiment, Lehrküche, Druckverfahren"
```

### Task 2: Genannter Wunsch verschwindet nicht still

**Files:**
- Modify: `packages/fmt-core/src/mentions.ts`, `packages/fmt-core/src/zuordnung.ts` (Filter auf `currentMentions` mit `fachbereichUngeeignet`), `packages/fmt-core/src/types.ts` (`MatchHead`)
- Test: `packages/fmt-core/test/mentions.test.ts`, `packages/fmt-core/test/golden.test.ts`

**Interfaces:**
- Produces: `MethodMention { kennung: string; alias: string; main: boolean }` (`main`: Der Treffer ist der Hauptname der Methode). `MatchHead.hinweise?: string[]` (Hinweise an die Lehrkraft, in beiden Modi).

- [ ] **Step 1: Tests schreiben**

`mentions.test.ts`:
```ts
it('kennzeichnet Hauptname und Synonym', () => {
  const m = detector.detect('Laufdiktat und danach eine Erkundung');
  expect(m.find((x) => x.kennung === 'laufdiktat')?.main).toBe(true);
  expect(m.find((x) => x.kennung === 'exkursion')?.main).toBe(false);
});
```

`golden.test.ts`:
```ts
it('genannte Methode mit Hauptnamen bleibt trotz „ungeeignet im Fach“ im Ablauf, mit Hinweis', () => {
  const r = M.zuordnen({ text: 'Mathe Klasse 5 Laufdiktat zu Bruchrechnen, 45 Minuten' });
  expect((r.verankert || []).some((v) => v.baustein === 'laufdiktat')).toBe(true);
  expect((r.hinweise || []).join(' ')).toMatch(/Laufdiktat.*Mathematik.*unüblich/);
});
```

Der bestehende Test zu „Leistungsmessung“ in Mathe (`grep -n Leistungsmessung packages/fmt-core/test`) bleibt unverändert und muss grün bleiben: Ein Synonym mit Alltagsbedeutung löst im unpassenden Fach weiter keine Methode aus. Ihn um eine Erwartung ergänzen: Die Kennung steht mit dem Grund „im Fachbereich Mathematik/Informatik als ungeeignet markiert“ unter `nichtVerankert` (Label des Fachbereichs aus `vocab.json` übernehmen).

- [ ] **Step 2: Rot prüfen**

Run: `npm -w @fmt/core test -- mentions.test.ts golden.test.ts`
Expected: FAIL (`main` ist `undefined`, `laufdiktat` nicht verankert).

- [ ] **Step 3: Umsetzen**

- `mentions.ts`: `main` aus `AliasEntry.main` in den Treffer übernehmen.
- `zuordnung.ts`: `currentMentions` behält die Kennungen; daneben `currentMainMentions: Set<string>`. Im Filter gilt die Bedingung `fachbereichUngeeignet` nur für Treffer ohne `main`. Für jeden Treffer mit `main` und `fachbereichUngeeignet.includes(currentArea)` den Hinweis anhängen: `` `„${b.name}“ ist im Fachbereich ${label('fachbereich', currentArea)} unüblich und steht auf deinen Wunsch im Ablauf.` ``
- Ein durch den Filter entfernter Treffer ohne `main` kommt in `nichtVerankert` mit Grund `` `im Fachbereich ${label('fachbereich', currentArea)} als ungeeignet markiert` ``, sofern das Wort nicht schon aus einem anderen Grund entfällt (Diagnose-Regel, Raum-Regel).
- `hinweise` im Ergebnis beider Modi ausgeben (leere Liste weglassen).

- [ ] **Step 4: Grün prüfen**

Run: `npm -w @fmt/core test -- mentions.test.ts golden.test.ts stufe2.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/fmt-core/src packages/fmt-core/test
git commit -m "Genannte Methode bleibt trotz Fachbezug im Ablauf und bekommt einen Hinweis"
```

### Task 3: Warnung behauptet keine Evidenz, Sicherheitshinweis per Regel

**Files:**
- Modify: `packages/fmt-core/src/zuordnung.ts` (`passung()`), `packages/fmt-core/src/validate.ts` (`checkPre`), `apps/web/src/pages/MethodDetailPage.tsx` (Zeile mit „Evidenz spricht gegen Einsatz in“)
- Test: `packages/fmt-core/test/core.test.ts`, `packages/fmt-core/test/golden.test.ts`

**Interfaces:**
- Consumes: `MatchHead.hinweise` aus Task 2.
- Produces: Konstante `SICHERHEITSHINWEIS` (exportiert aus `zuordnung.ts`) mit dem Text aus Spec Abschnitt 5.

- [ ] **Step 1: Tests schreiben**

```ts
it('Stufenwarnung nennt keine Evidenz, wo keine hinterlegt ist', () => {
  const r = M.zuordnen({ modus: 'phase', lernfunktion: 'verstehen', bildungsstufe: 'primar' });
  const texte = (r.vorschlaege || []).flatMap((v) => v.warnungen || []);
  expect(texte.join(' ')).not.toMatch(/spricht die Evidenz dagegen/);
});
it('praktische Arbeit im Fachraum bekommt den Sicherheitshinweis, eine Deutschstunde nicht', () => {
  const chemie = M.zuordnen({ text: 'Chemie Klasse 8: Schülerexperiment zu Säuren und Laugen, 90 Minuten' });
  expect(chemie.hinweise || []).toContain(SICHERHEITSHINWEIS);
  const deutsch = M.zuordnen({ text: 'Deutsch Klasse 8 Gedichte, 45 Minuten' });
  expect(deutsch.hinweise || []).not.toContain(SICHERHEITSHINWEIS);
});
```

Den Feldnamen der Warnungen am Vorschlag vorher in `types.ts` nachsehen und den ersten Test daran anpassen.

- [ ] **Step 2: Rot prüfen**

Run: `npm -w @fmt/core test -- golden.test.ts`
Expected: FAIL.

- [ ] **Step 3: Umsetzen**

- Warntext in `passung()` und `checkPre`: `` `Für die Bildungsstufe „${label}“ nicht vorgesehen (Setzung der Redaktion).` `` Der Zusatz zur Evidenz kommt erst in Task 10 zurück, wenn `eignungsgrund` die Grundlage `E` nennt. `MethodDetailPage.tsx`: „Nicht vorgesehen für: …“.
- Sicherheitshinweis: nach dem Bau des Ergebnisses anhängen, wenn mindestens eine gewählte Methode `repraesentation` mit `enaktiv` hat **und** (`currentLernort` ist `fachraum`, `bewegungsraum` oder `draussen` **oder** `currentArea` ist `nawi-technik`, `beruf-praxis` oder `sport`). Im Phasenmodus zählen die ersten sechs Vorschläge.

- [ ] **Step 4: Grün prüfen und Qualitätstor**

Run: `npm test && npm run qualitaet && npm run qualitaet -- reihe2`
Expected: Tests PASS; offene Befunde nicht höher als vor Stufe 1.

- [ ] **Step 5: Commit und PR A**

```bash
git add -A && git commit -m "Passungswarnung ohne Evidenzbehauptung, Sicherheitshinweis bei praktischer Arbeit"
```

PR A als Entwurf öffnen. Titel: „Einsatzprofil Stufe 1: Lesen und Hinweise“.

---

# Stufe 2: Datenmodell Bedarf (PR B)

### Task 4: Merkmalsliste und Vokabulare in `vocab.json`

**Files:**
- Modify: `data/vocab.json`, `packages/fmt-core/src/types.ts`, `packages/fmt-core/src/load-data.ts`, `packages/fmt-core/scripts/build-artefacts.ts` (Bundle bei `facetten: D.facetten`), `packages/fmt-core/src/rules.ts` (R-06)
- Create: `packages/fmt-core/test/einsatzprofil.test.ts`

**Interfaces:**
- Produces:

```ts
export type EbeneId = 'bauweise' | 'bedarf' | 'eignung' | 'verknuepfung' | 'beleg' | 'beschreibung' | 'einordnung' | 'verwaltung';
export interface EbeneMeta { id: EbeneId; name: string; frage: string; felder: string[] }
export type MerkmalWirkung = 'schliesst-aus' | 'warnt' | 'ordnet';
export interface MerkmalMeta {
  id: string;            // BD1 … BD6, EG1 … EG3
  art: 'bedarf' | 'eignung';
  name: string;
  leitfrage: string;
  felder: string[];
  form: string;
  wirkung: MerkmalWirkung[];
  wirkungText: string;   // exact wording from spec section 4, column „Wirkung“
  grundlage: 'formal' | 'E' | 'S' | 'A' | 'je-eintrag';
}
// FmtData and the bundle type gain: ebenen: EbeneMeta[]; merkmale: MerkmalMeta[];
```

- [ ] **Step 1: Test schreiben** (`einsatzprofil.test.ts`, Daten laden wie in `core.test.ts`)

```ts
it('hat neun Einsatzmerkmale mit den Kennungen der Spec', () => {
  expect(D.merkmale.map((m) => m.id)).toEqual(['BD1', 'BD2', 'BD3', 'BD4', 'BD5', 'BD6', 'EG1', 'EG2', 'EG3']);
});
it('ordnet jedes Feld jeder Methode genau einer Ebene zu', () => {
  const ebeneVon = new Map<string, string>();
  for (const e of D.ebenen) for (const f of e.felder) {
    expect(ebeneVon.has(f), `${f} doppelt`).toBe(false);
    ebeneVon.set(f, e.id);
  }
  const felder = new Set(D.bausteine.flatMap((b) => Object.keys(b)));
  for (const f of felder) expect(ebeneVon.has(f), `Feld ${f} ohne Ebene`).toBe(true);
});
it('führt die Felder der Merkmale in der passenden Ebene', () => {
  for (const m of D.merkmale) {
    const ebene = D.ebenen.find((e) => e.id === m.art)!;
    for (const f of m.felder) expect(ebene.felder, `${m.id}: ${f}`).toContain(f);
  }
});
it('kennt das Wort Bedingungsraum nicht mehr', () => {
  expect(JSON.stringify(D.schemes)).not.toMatch(/Bedingungsraum/);
});
```

- [ ] **Step 2: Rot prüfen**

Run: `npm -w @fmt/core test -- einsatzprofil.test.ts`
Expected: FAIL (`D.merkmale` ist `undefined`).

- [ ] **Step 3: Umsetzen**

- `vocab.json`: Listen `ebenen` und `merkmale` nach Spec Abschnitt 3 und 4. Die Ebene `bauweise` nennt die 13 Facettenfelder (`facetten[].feld`), dazu `reichweite`, `kernkomponente`, `slot`, `komposit`. Felder, die der Loader ergänzt (zum Beispiel `typ`, `@id`), gehören zu `verwaltung`. In dieser Aufgabe stehen bei BD1 noch `lernort`, bei der Beschreibung `raum`, bei EG2 `geeignetBeiVorwissen`; Task 7 und Task 10 benennen um.
- Beschreibungen der Schemata `vorwissen`, `bildungsstufe`, `technikbedarf`: „Bedingungsraum:“ ersetzen durch „Eignung (EG2):“, „Eignung (EG1):“, „Bedarf (BD4):“. Schema `fachbereich`: „Eignung (EG3): …“. Schema `ansatz`: „(ergänzend zu den 13 Facetten)“ ersetzen durch „(Ebene Einordnung)“.
- `rules.ts` R-06 `prueft`: „Eignung: Baustein passt zu Vorwissen und Bildungsstufe“.
- `build-artefacts.ts`: Klassenkommentar `Kontext` → „Rahmenbedingungen eines Arrangements“.
- Loader und Bundle reichen `ebenen` und `merkmale` durch.

- [ ] **Step 4: Grün prüfen**

Run: `npm -w @fmt/core test -- einsatzprofil.test.ts artefacts.test.ts`
Expected: PASS (in `artefacts.test.ts` eine Erwartung auf „Bedingungsraum“ anpassen, falls vorhanden).

- [ ] **Step 5: Commit**

```bash
git add data/vocab.json packages/fmt-core
git commit -m "Einsatzprofil: Ebenen und Merkmale als Quelle in vocab.json"
```

### Task 5: Kernfunktionen des Einsatzprofils

**Files:**
- Create: `packages/fmt-core/src/einsatzprofil.ts`
- Modify: `data/vocab.json` (Schemata `raumbedarf`, `raumtyp`, `schriftbedarf`), `packages/fmt-core/src/index.ts` (Export), `packages/fmt-core/src/types.ts` (`VocabValue.bietet?: string[]`, `Baustein.raumbedarf?`, `Baustein.schriftbedarf?`, `Baustein.raumhinweis?`, `Baustein.betreuungshinweis?`)
- Test: `packages/fmt-core/test/einsatzprofil.test.ts`

**Interfaces:**
- Produces:

```ts
/** Room properties a room type offers (vocab raumtyp, field bietet). Unknown type: empty set. */
export function raumBietet(data: FmtData, raumtyp: string): Set<string>;
/** Labels of the needs the room type does not meet, in vocab order; [] when the method fits or needs nothing. */
export function raumFehlt(data: FmtData, b: Pick<Baustein, 'raumbedarf'>, raumtyp: string): string[];
/** Whether the method needs one of the properties that set this room apart from a classroom. */
export function nutztRaum(data: FmtData, b: Pick<Baustein, 'raumbedarf'>, raumtyp: string): boolean;
/** Labels of the literacy needs the learners lack; ohne holds 'lesen' and/or 'schreiben'. */
export function schriftFehlt(b: Pick<Baustein, 'schriftbedarf'>, ohne: string[]): string[];
```

- [ ] **Step 1: Tests schreiben**

```ts
const m = (raumbedarf?: string[], schriftbedarf?: string[]) => ({ raumbedarf, schriftbedarf });
it('Raumtypen bieten die Eigenschaften der Spec', () => {
  expect([...raumBietet(D, 'hoersaal')].sort()).toEqual(['schreibplatz', 'wandflaeche']);
  expect([...raumBietet(D, 'bewegungsraum')].sort()).toEqual(['bewegungsflaeche', 'stellflaeche']);
  expect(raumBietet(D, 'unbekannt').size).toBe(0);
});
it('meldet fehlende Raumeigenschaften mit Label', () => {
  expect(raumFehlt(D, m(['stellflaeche']), 'hoersaal')).toEqual(['Stellfläche']);
  expect(raumFehlt(D, m(['schreibplatz', 'wandflaeche']), 'bewegungsraum')).toEqual(['Schreibplatz', 'Wand- oder Tafelfläche']);
  expect(raumFehlt(D, m(['stellflaeche']), 'klassenraum')).toEqual([]);
  expect(raumFehlt(D, m(undefined), 'hoersaal')).toEqual([]);
  expect(raumFehlt(D, m([]), 'bewegungsraum')).toEqual([]);
});
it('erkennt, ob eine Methode den besonderen Raum nutzt', () => {
  expect(nutztRaum(D, m(['bewegungsflaeche']), 'bewegungsraum')).toBe(true);
  expect(nutztRaum(D, m(['stellflaeche']), 'bewegungsraum')).toBe(false);
  expect(nutztRaum(D, m(['fachausstattung']), 'fachraum')).toBe(true);
});
it('meldet fehlende Schriftsprache', () => {
  expect(schriftFehlt(m(undefined, ['liest', 'schreibt']), ['lesen'])).toEqual(['Lesen']);
  expect(schriftFehlt(m(undefined, ['schreibt']), ['lesen'])).toEqual([]);
  expect(schriftFehlt(m(undefined, undefined), ['lesen', 'schreiben'])).toEqual([]);
});
```

- [ ] **Step 2: Rot prüfen**

Run: `npm -w @fmt/core test -- einsatzprofil.test.ts`
Expected: FAIL („raumBietet is not a function“).

- [ ] **Step 3: Umsetzen**

Schemata in `vocab.json` nach Spec Abschnitt 4 (Werte, Labels, Tabelle `bietet`). Das Schema `lernort` bleibt bis Task 7 daneben bestehen. „Besondere“ Eigenschaften eines Raumtyps sind `bietet(raumtyp)` ohne `bietet('klassenraum')`.

- [ ] **Step 4: Grün prüfen**

Run: `npm -w @fmt/core test -- einsatzprofil.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add data/vocab.json packages/fmt-core
git commit -m "Einsatzprofil: Raumtypen, Raumbedarf und Schriftbedarf als Kernfunktionen"
```

### Task 6: Datenvorschlag erzeugen und Jan vorlegen

**Files:**
- Create: `packages/fmt-core/scripts/vorschlag-einsatzprofil.ts`
- Output: `/mnt/project-files/einsatzprofil/vorschlag-bedarf.json`, `/mnt/project-files/einsatzprofil/vorschlag-bedarf.md`

**Interfaces:**
- Produces: JSON `Record<kennung, { raumbedarf: string[]; schriftbedarf: string[]; raumhinweis: string | null; betreuungshinweis: string | null; kernkomponenteOrt: string | null; grund: string }>` für alle 303 Methoden.

- [ ] **Step 1: Skript schreiben.** Regeln je Methode, in dieser Reihenfolge; `text` = `kurzbeschreibung`, `durchfuehrung` und `material` zusammen, klein geschrieben; `raum` = heutiger Freitext:

| Ergebnis | Bedingung |
|---|---|
| `schriftbedarf` enthält `schreibt` | `text` passt auf `schreib\|notier\|schriftlich\|protokoll\|ausfüll\|verfass\|formulier\w* schriftlich\|arbeitsblatt\|lerntagebuch\|mitschrift` |
| `schriftbedarf` enthält `liest` | `text` passt auf `\blesen\b\|\bliest\b\|lektüre\|\btext\w*\|quelle\w*\|arbeitsblatt\|infokarte\|rollenkarte\|aufgabenkarte` |
| `raumbedarf` enthält `schreibplatz` | `schreibt` gesetzt und `interaktion` ist nicht nur `plenum-lehrergeleitet` |
| `raumbedarf` enthält `bewegungsflaeche` | `lernort` enthält `bewegungsraum` und nicht `klassenraum`, oder `raum` passt auf `halle\|sportplatz\|spielfläche` |
| `raumbedarf` enthält `stellflaeche` | `raum` passt auf `stuhlkreis\|kreise\|freie\|stehfläche\|bewegungsfläche\|laufweg\|ecken\|spielfläche im raum`, und `bewegungsflaeche` ist nicht gesetzt |
| `raumbedarf` enthält `wandflaeche` | `raum` oder `material` passt auf `wand\|tafel\|stellwand\|pinnwand\|plakat` |
| `raumbedarf` enthält `fachausstattung` | `lernort` ist genau `['fachraum']`, oder `raum` passt auf `fachraum\|labor\|werkstatt\|küche\|musikraum\|computerraum` und nennt nicht „klassenraum“ |
| `raumbedarf` enthält `aussenort` | `raum` passt auf `außerschul\|wald\|park\|natur\|einsatzort` und beginnt nicht mit „klassenraum“ |
| `kernkomponenteOrt` gesetzt | `aussenort` gesetzt; Text: „Lernort außerhalb der Schule“ |
| `raumhinweis` | `raum`, außer er lautet „Klassenraum“ oder „Regulärer Klassenraum“ (dann `null`) |
| `betreuungshinweis` | nur für `exkursion`, `exkursionsfuehrung-rezeptiv`, `waldpaedagogik`, `service-learning`: „Begleitpersonen und Aufsicht nach den Vorgaben des Landes und der Schule klären.“; für `experiment`, `demonstrationsexperiment`, `praxisauftrag-arbeitsplatz`, `vier-stufen-methode`: „Sicherheitsunterweisung vor Beginn; Aufsicht während der praktischen Arbeit.“ |

`grund` nennt die Regeln, die gegriffen haben. Die Markdown-Datei hat eine Tabelle (Methode, Raumbedarf, Schriftbedarf, Raumhinweis, Grund), sortiert nach Raumbedarf, und oben die Zählung je Wert.

- [ ] **Step 2: Skript laufen lassen und Stichprobe prüfen**

Run: `npx tsx packages/fmt-core/scripts/vorschlag-einsatzprofil.ts`
Expected: zwei Dateien; Zählung plausibel (Größenordnung: `schreibt` 120 bis 200 Methoden, `bewegungsflaeche` 7 bis 15, `aussenort` 4 bis 8). Von Hand prüfen und im Skript als Ausnahmeliste korrigieren: `kugellager` und `fishbowl` → `stellflaeche`; `aufwaermen`, `spielform-zielspiel` → `bewegungsflaeche`; `exkursion` → `aussenort`; `abrufquiz` → `schreibt`, `schreibplatz`; `tps`, `murmelgruppe` → leer; `museumsgang` → `wandflaeche`.

- [ ] **Step 3: Vorlegen**

Jan im Thread die Markdown-Datei anhängen mit der Bitte um Durchsicht. Korrekturen von Jan in die Ausnahmeliste des Skripts übernehmen und neu erzeugen. Die Tasks 7 bis 9 können mit dem Vorschlag weiterlaufen; der PR B bleibt Entwurf bis zur Freigabe.

- [ ] **Step 4: Commit**

```bash
git add packages/fmt-core/scripts/vorschlag-einsatzprofil.ts
git commit -m "Skript für den Datenvorschlag Raumbedarf und Schriftbedarf"
```

### Task 7: Daten umstellen und Zuordnung auf Raumbedarf

**Files:**
- Create: `packages/fmt-core/scripts/uebernehme-einsatzprofil.ts`
- Modify: `data/bausteine/*.json` (alle 303), `data/vocab.json` (Schema `lernort` entfernen, `merkmale`/`ebenen` anpassen), `packages/fmt-core/src/zuordnung.ts` (`FIELDS`, Leseregeln `lernort`, `rahmen()`, `fitsRoom`, `setRoom`, Rangstufe mit `b.lernort`, Filter `roomOnly`), `packages/fmt-core/src/types.ts`, `packages/fmt-core/scripts/build-artefacts.ts` (`VOCAB_PROPS`, JSON-Schema, JSON-LD-Kontext `raum`), `packages/fmt-core/test/golden-szenarien.ts`, `golden.test.ts`, `packages/fmt-core/test/qualitaet/pruefen.ts`
- Test: `packages/fmt-core/test/einsatzprofil.test.ts`, `golden.test.ts`

**Interfaces:**
- Consumes: `raumFehlt`, `nutztRaum`, `schriftFehlt` aus Task 5; Vorschlagsdatei aus Task 6.
- Produces: `MatchRequest.raum?: string` (Wert aus Vokabular `raumtyp`), `MatchRequest.lernort?: string` (Alias, veraltet), `MatchRequest.ohneSchrift?: string | string[]` (Werte `lesen`, `schreiben`). `Baustein.lernort` und `Baustein.raum` entfallen. Kriterium im Ergebnis heißt `raum`.

- [ ] **Step 1: Tests schreiben**

`einsatzprofil.test.ts` (Daten):
```ts
it('keine Methode trägt mehr lernort oder raum', () => {
  for (const b of D.bausteine) { expect(b.lernort, b.kennung).toBeUndefined(); expect(b.raum, b.kennung).toBeUndefined(); }
});
it('raumbedarf und schriftbedarf nutzen nur Vokabularwerte', () => {
  const rb = new Set(['schreibplatz', 'stellflaeche', 'bewegungsflaeche', 'wandflaeche', 'fachausstattung', 'aussenort']);
  for (const b of D.bausteine) {
    for (const v of b.raumbedarf || []) expect(rb.has(v), `${b.kennung}: ${v}`).toBe(true);
    for (const v of b.schriftbedarf || []) expect(['liest', 'schreibt'], b.kennung).toContain(v);
  }
});
it('konstitutiver Ort steht als Kernkomponente', () => {
  for (const b of D.bausteine.filter((x) => (x.raumbedarf || []).includes('aussenort'))) {
    expect(b.kernkomponente.some((k) => k.kennung === 'ort'), b.kennung).toBe(true);
  }
});
it('raumhinweis wiederholt nicht den Standardraum', () => {
  for (const b of D.bausteine) expect(b.raumhinweis || '', b.kennung).not.toMatch(/^(Regulärer )?Klassenraum$/);
});
```

`golden.test.ts` (Zuordnung):
```ts
it('genannter Hörsaal schließt Methoden mit Stellfläche aus, mit Grund', () => {
  const r = M.zuordnen({ text: 'Seminar Hochschule 30 Studierende im Hörsaal mit fester Bestuhlung, Diskussion zu Ethik, 90 Minuten' });
  const ids = alleBausteine(r);
  expect(ids).not.toContain('fishbowl');
  expect(ids).not.toContain('switch-rollentausch');
  expect(r.pruefung?.gueltig).toBe(true);
});
it('genannte Methode, die der Raum ausschließt, steht mit Grund unter nichtVerankert', () => {
  const r = M.zuordnen({ text: 'Kugellager im Hörsaal mit 200 Studierenden, Statistik, 90 Minuten' });
  expect((r.nichtVerankert || []).find((n) => n.baustein === 'kugellager')?.grund).toBe('braucht: Stellfläche');
});
it('Sporthalle: gültiger Ablauf ohne Methoden mit Schreibplatz, kein leerer Schritt', () => {
  const r = M.zuordnen({ text: 'Sport Klasse 7 Volleyball oberes Zuspiel in der Sporthalle, 45 Minuten' });
  expect(r.pruefung?.gueltig).toBe(true);
  for (const id of alleBausteine(r)) expect(byId.get(id)!.raumbedarf || [], id).not.toContain('schreibplatz');
  expect(r.offenSchritte || []).toEqual([]);
});
it('ohne genannten Raum schließt der Raumbedarf nichts aus', () => {
  const r = M.zuordnen({ modus: 'phase', lernfunktion: 'orientierung' });
  expect(r.stufen.nachRahmen).toBe(r.stufen.nachFunktion);
});
it('lernort bleibt als Alias für raum gültig', () => {
  const a = M.zuordnen({ text: 'Biologie Klasse 7 Pflanzen, 45 Minuten', lernort: 'draussen' });
  const b = M.zuordnen({ text: 'Biologie Klasse 7 Pflanzen, 45 Minuten', raum: 'draussen' });
  expect(alleBausteine(a)).toEqual(alleBausteine(b));
  expect(a.kriterien.raum).toBe('draussen');
});
it('Lernende, die nicht lesen können: keine Methode mit Lesebedarf', () => {
  const r = M.zuordnen({ text: 'Klasse 1, Kinder können noch nicht lesen, Thema Jahreszeiten, 45 Minuten' });
  expect(r.kriterien.ohneSchrift).toEqual(['lesen', 'schreiben']);
  for (const id of alleBausteine(r)) expect(byId.get(id)!.schriftbedarf || [], id).toEqual([]);
});
```

`alleBausteine(r)` als Helfer aus dem bestehenden `einsaetze()` in `test/qualitaet/pruefen.ts` ableiten (exportieren). Den Namen des Zählfelds (`stufen.nachRahmen`) in `types.ts` (`MatchHead`) prüfen.

- [ ] **Step 2: Rot prüfen**

Run: `npm -w @fmt/core test -- einsatzprofil.test.ts golden.test.ts`
Expected: FAIL.

- [ ] **Step 3: Daten übernehmen**

`uebernehme-einsatzprofil.ts` liest `vorschlag-bedarf.json` (Pfad als Argument) und schreibt je Methode: `raumbedarf` (nur wenn nicht leer), `schriftbedarf` (nur wenn nicht leer), `raumhinweis` (wenn nicht `null`), `betreuungshinweis` (wenn nicht `null`), Kernkomponente `{ "kennung": "ort", "name": <kernkomponenteOrt> }` (wenn gesetzt und noch nicht vorhanden); entfernt `lernort` und `raum`. Feldreihenfolge: neue Felder an der Stelle von `lernort` bzw. `raum`. Zwei Leerzeichen Einzug, Zeilenende wie bisher.

Run: `npx tsx packages/fmt-core/scripts/uebernehme-einsatzprofil.ts /mnt/project-files/einsatzprofil/vorschlag-bedarf.json`

- [ ] **Step 4: Zuordnung umstellen**

- Anfragefeld: `FIELDS`-Eintrag `lernort` → `raum`, Werte aus Schema `raumtyp`, Bedeutung: „Raum der Stunde (Klassenraum, Sporthalle, Fachraum, draußen, Hörsaal); Methoden, deren Raumbedarf er nicht deckt, scheiden aus“. Leseregeln schreiben das Kriterium `raum`. In `check()` wird `lernort` auf `raum` umgeschrieben, wenn `raum` fehlt. Interne Variable `currentLernort` → `currentRaum`.
- Neues Feld `ohneSchrift` (`typ: 'codes'`, Stufe 2, Werte `lesen`, `schreiben`). Leseregel: `(?:konnen|kann)\s+(?:noch\s+)?nicht\s+lesen|\bnichtleser\w*|\bvor\s+dem\s+schriftspracherwerb\b|\banalphabet\w*` → `['lesen', 'schreiben']`; `(?:konnen|kann)\s+(?:noch\s+)?nicht\s+schreiben` → `['schreiben']`.
- `rahmen(b, a)`: Ist `a.raum` gegeben (ausdrücklich oder aus dem Text gelesen, nicht von `setRoom` erschlossen) und `raumFehlt(...)` nicht leer, Rückgabe `` `braucht: ${fehlt.join(', ')}` ``. Ist `a.ohneSchrift` gegeben und `schriftFehlt(...)` nicht leer, Rückgabe `` `verlangt: ${fehlt.join(', ')}` ``.
- Erschlossener Raum (`setRoom` ohne Angabe: Sport → `bewegungsraum`, Praxis in Beruf oder Naturwissenschaft → `fachraum`) schließt nicht aus. Er wirkt wie bisher über die Rangstufe: An die Stelle der Bedingung mit `b.lernort` tritt `raumFehlt(D, b, currentRaum || 'klassenraum').length > 0`.
- `fitsRoom(b, ort)`: `raumFehlt(...)` leer **und** (`ort` ist `klassenraum` oder `hoersaal` **oder** `isPraxisMethod(b)` **oder** `nutztRaum(...)`). Der Rückfall auf den Freitext (`MOVES_AROUND`, `OUTSIDE`) entfällt.
- Filter `roomOnly` bei den Nennungen: `roomOnly` = `raumFehlt(D, b, 'klassenraum').length > 0`.
- `build-artefacts.ts`: `VOCAB_PROPS` `['lernort','lernort',true]` → `['raumbedarf','raumbedarf',true]`, dazu `['schriftbedarf','schriftbedarf',true]`; JSON-Schema und Kontext: `raum` → `raumhinweis`, neu `betreuungshinweis` (`type: 'string'`).
- `golden-szenarien.ts`: in `LESEFAELLE` den Schlüssel `lernort` durch `raum` ersetzen (auch in den Fällen aus Task 1).
- `vocab.json`: Schema `lernort` löschen; BD1 `felder: ['raumbedarf']`; Ebene Beschreibung `raumhinweis`, `betreuungshinweis` statt `raum`; Ebene Bedarf ohne `lernort`.

- [ ] **Step 5: Grün prüfen und Qualitätstor**

Run: `npm -w @fmt/core test && npm run qualitaet && npm run qualitaet -- reihe2`
Expected: PASS; offene Befunde nicht höher als vor Stufe 2. Steigt die Zahl, zuerst die Daten der betroffenen Methoden prüfen (falscher `schreibplatz` an einer Sportmethode), dann die Ausnahmeliste in Task 6 ergänzen und neu übernehmen.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Raumbedarf und Schriftbedarf ersetzen lernort; genannter Raum schließt aus"
```

### Task 8: Schnittstellen (REST, MCP, Suche, Ontologie)

**Files:**
- Modify: `apps/server/src/routes/api.ts` (`/api/v1/meta`), `apps/server/src/mcp/server.ts` (Schema bei `lernort: code('lernort')`), `packages/fmt-core/src/suche.ts`, `packages/fmt-core/scripts/build-artefacts.ts` (Ontologie)
- Test: `apps/server/test/api.test.ts`, `apps/server/test/mcp.test.ts`, `packages/fmt-core/test/artefacts.test.ts`, `packages/fmt-core/test/einsatzprofil.test.ts`

**Interfaces:**
- Consumes: `D.ebenen`, `D.merkmale`, `raumFehlt`.
- Produces: `/api/v1/meta` mit `ebenen: EbeneMeta[]` und `einsatzprofil: MerkmalMeta[]`; Suchkriterium `raum` (Raumtyp); MCP-Felder `raum`, `ohneSchrift`, `lernort` (veraltet); Ontologie-Eigenschaft `fmt:ebene`.

- [ ] **Step 1: Tests schreiben**

```ts
// api.test.ts
it('/meta nennt Ebenen und Einsatzmerkmale', async () => {
  const meta = (await app.inject({ url: '/api/v1/meta' })).json();
  expect(meta.ebenen.map((e: any) => e.id)).toContain('bedarf');
  expect(meta.einsatzprofil.map((m: any) => m.id)).toEqual(['BD1', 'BD2', 'BD3', 'BD4', 'BD5', 'BD6', 'EG1', 'EG2', 'EG3']);
});
// mcp.test.ts: match_scenario nimmt raum an und liest lernort als Alias (gleiches Ergebnis)
// einsatzprofil.test.ts
it('Suche nach Raum liefert nur Methoden, deren Raumbedarf der Raum deckt', () => {
  const hits = createSearch(D).suche({ raum: 'bewegungsraum' });
  expect(hits.length).toBeGreaterThan(20);
  for (const b of hits) expect(raumFehlt(D, b, 'bewegungsraum'), b.kennung).toEqual([]);
});
// artefacts.test.ts
it('Ontologie nennt je Eigenschaft die Ebene und enthält keine skos:Collection', () => {
  expect(ontology).toMatch(/fmt:raumbedarf a rdf:Property ;[^.]*fmt:ebene "bedarf"/);
  expect(ontology).not.toMatch(/skos:Collection/);
});
```

Für den MCP-Test das Muster des bestehenden `match_scenario`-Tests übernehmen.

- [ ] **Step 2: Rot prüfen**

Run: `npm -w @fmt/server test -- api.test.ts mcp.test.ts; npm -w @fmt/core test -- artefacts.test.ts einsatzprofil.test.ts`
Expected: FAIL.

- [ ] **Step 3: Umsetzen**

Ontologie: `fmt:ebene a rdf:Property ; rdfs:range xsd:string`; jede Eigenschaft aus `VOCAB_PROPS`, die in `D.ebenen[].felder` vorkommt, bekommt `fmt:ebene "<EbeneId>"`. Zahlen- und Textfelder des Einsatzprofils (`dauerMin`, `dauerMax`, `gruppeMin`, `gruppeMax`, `teamMin`, `teamMax`, `vorbereitungMin`, `internet`, `ki`, `raumhinweis`, `betreuungshinweis`) werden als `rdf:Property` mit `rdfs:domain fmt:Baustein`, passendem `xsd`-Typ und `fmt:ebene` ausgegeben.

- [ ] **Step 4: Grün prüfen**

Run: `npm run build:data && npm -w @fmt/server test && npm -w @fmt/core test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Einsatzprofil in /meta, MCP, Suche und Ontologie"
```

### Task 9: Oberfläche

**Files:**
- Modify: `apps/web/src/pages/SystematikPage.tsx` (`QMODS` Q2, `MATCH_STAGES`, Abschnitt „Ergänzende Merkmale neben den 13 Facetten“), `apps/web/src/pages/MethodDetailPage.tsx`, `apps/web/src/pages/CatalogPage.tsx`, `apps/web/src/pages/PlannerPage.tsx` (Schritt „3. Rahmenbedingungen“), `apps/web/src/planner/scenarioModel.ts` (`b?.raum`)
- Test: `apps/web/test/components.test.tsx`, `apps/web/test/cache-and-catalog.test.ts`, `apps/web/test/planner-page.test.tsx`

**Interfaces:**
- Consumes: `bundle.ebenen`, `bundle.merkmale`, Schemata `raumbedarf`, `raumtyp`, `schriftbedarf`.

- [ ] **Step 1: Tests schreiben**

```tsx
it('Systematik zeigt das Einsatzprofil mit Bedarf und Eignung statt „Ergänzende Merkmale“', () => {
  render(<SystematikPage />);
  expect(screen.getByRole('heading', { name: 'Einsatzprofil: Bedarf und Eignung' })).toBeTruthy();
  for (const id of ['BD1', 'BD6', 'EG3']) expect(screen.getByText(id)).toBeTruthy();
  expect(screen.queryByText(/Ergänzende Merkmale/)).toBeNull();
  expect(screen.queryByText(/Bedingungsraum/)).toBeNull();
});
it('Methodendetail zeigt den Kasten Einsatzprofil mit Raumbedarf', () => {
  renderDetail('kugellager');
  expect(screen.getByRole('heading', { name: 'Einsatzprofil' })).toBeTruthy();
  expect(screen.getByText(/Raumbedarf: Stellfläche/)).toBeTruthy();
});
it('Katalog filtert nach Raum', () => {
  const hits = filterCatalog(bundle, { raum: 'hoersaal' });
  expect(hits.some((b) => b.kennung === 'kugellager')).toBe(false);
});
```

Render-Helfer und Filterfunktion aus den bestehenden Tests derselben Dateien übernehmen (Namen dort nachsehen).

- [ ] **Step 2: Rot prüfen**

Run: `npm -w @fmt/web test`
Expected: FAIL in den neuen Tests.

- [ ] **Step 3: Umsetzen**

- Systematik: Q2 heißt „Einsatzprofil“, Text: „Bedarf (Raum, Zeit, Gruppe, Ausstattung, Vorbereitung, Schrift) und Eignung (Bildungsstufe, Vorwissen, Fachbezug). Verhindert kontextblinde Wirkungsrankings (Regel R-06).“ Der Abschnitt „Ergänzende Merkmale …“ wird zu „Einsatzprofil: Bedarf und Eignung“: eine Tabelle aus `bundle.merkmale` (Kennung, Merkmal, Leitfrage, Wirkung, Grundlage) und darunter je Vokabular (`raumbedarf`, `schriftbedarf`, `fachbereich`) Werte mit Zahl der Methoden. Evidenzbezug und Kettenrollen wandern in ihre eigenen Abschnitte (Qualitätsschicht, Funktionsketten). `MATCH_STAGES` Zeile 2: „Zeit, Gruppengröße, Technik, Raum, Schrift, Vorbereitung, ohne KI/Internet“.
- Methodendetail: Kasten „Einsatzprofil“ neben dem Facettenrad mit zwei Gruppen. Bedarf: „Raumbedarf: …“ (oder „keine besondere Anforderung“), Zeit, Gruppe, Ausstattung, Vorbereitung, „Schriftbedarf: …“. Eignung: Fachbezug, Bildungsstufe, Vorwissen. `raumhinweis` und `betreuungshinweis` stehen bei der Durchführung.
- Katalog: Filter „Raum“ (Werte aus `raumtyp`) im Bereich „Alle Facetten & Rahmenbedingungen“.
- Baukasten Schritt 3: Auswahl „Raum“ (Raumtyp) und Ankreuzfeld „Lernende können noch nicht lesen“ (setzt `ohneSchrift: ['lesen', 'schreiben']`).
- `scenarioModel.ts`: `b?.raum` → `b?.raumhinweis`.

- [ ] **Step 4: Grün prüfen und im Browser ansehen**

Run: `npm test && npm run build`
Expected: PASS. Danach `npm run dev:server` und `npm run dev:web` starten, Systematik, eine Methodenseite und den Baukasten mit „Hörsaal“ öffnen; Bildschirmfotos nach `/mnt/project-files/einsatzprofil/`.

- [ ] **Step 5: Commit und PR B**

```bash
git add -A && git commit -m "Oberfläche zeigt das Einsatzprofil; Filter und Baukasten kennen den Raum"
```

PR B als Entwurf öffnen. Titel: „Einsatzprofil Stufe 2: Bedarf“. Im Text auf den Datenvorschlag und Jans Freigabe verweisen.

---

# Stufe 3: Eignung bereinigen (PR C)

Diese Stufe setzt Punkt 3 der Zweitprüfung um. Jan hat ihn noch nicht ausdrücklich bestätigt: Vor Task 10 im Thread nachfragen und den Datenvorschlag vorlegen.

### Task 10: Vorwissen als Komplement, Begründung je Eignung

**Files:**
- Modify: `data/bausteine/*.json` (28 Methoden mit `geeignetBeiVorwissen`), `data/vocab.json` (EG2 `felder`, Ebene Eignung um `eignungsgrund`), `packages/fmt-core/src/types.ts`, `packages/fmt-core/src/einsatzprofil.ts`, `packages/fmt-core/src/zuordnung.ts` (`passung()`), `packages/fmt-core/src/validate.ts` (`checkPre`), `packages/fmt-core/scripts/build-artefacts.ts`, `apps/web/src/pages/MethodDetailPage.tsx`
- Test: `packages/fmt-core/test/einsatzprofil.test.ts`, `core.test.ts` (Fall „R-06 primar“)

**Interfaces:**
- Produces:

```ts
export interface Eignungsgrund { text: string; grundlage: 'E' | 'S' | 'A' }
// Baustein gains: ungeeignetBeiVorwissen?: string[]; eignungsgrund?: Partial<Record<'stufe' | 'vorwissen' | 'fachbereich', Eignungsgrund>>;
// Baustein loses: geeignetBeiVorwissen
/** Warnings for the given learner group, each with its basis; [] when nothing speaks against the method. */
export function eignungsWarnungen(data: FmtData, b: Baustein, a: { vorwissen?: string; bildungsstufe?: string }): Array<{ text: string; grundlage: 'E' | 'S' | 'A' }>;
```

- [ ] **Step 1: Tests schreiben**

```ts
it('keine Methode trägt mehr geeignetBeiVorwissen; das Komplement warnt gleich', () => {
  for (const b of D.bausteine) expect(b.geeignetBeiVorwissen, b.kennung).toBeUndefined();
  expect(D.bausteine.filter((b) => (b.ungeeignetBeiVorwissen || []).length).length).toBe(28);
});
it('Warnung nennt die Grundlage: gesetzt ohne Eintrag, belegt mit Eintrag', () => {
  const ohne = { ...D.bausteine[0], ungeeignetBeiStufe: ['primar'], eignungsgrund: undefined };
  expect(eignungsWarnungen(D, ohne, { bildungsstufe: 'primar' })).toEqual([
    { text: 'Für die Bildungsstufe „Primarstufe“ nicht vorgesehen (Setzung der Redaktion).', grundlage: 'A' }
  ]);
  const mit = { ...ohne, eignungsgrund: { stufe: { text: 'Problemlösen vor Instruktion wirkt bei Jüngeren schwächer (Sinha & Kapur 2021).', grundlage: 'E' as const } } };
  expect(eignungsWarnungen(D, mit, { bildungsstufe: 'primar' })[0]).toEqual({
    text: 'Für die Bildungsstufe „Primarstufe“ nicht vorgesehen: Problemlösen vor Instruktion wirkt bei Jüngeren schwächer (Sinha & Kapur 2021).', grundlage: 'E'
  });
});
```

Das Label der Primarstufe aus `vocab.json` übernehmen, falls es anders lautet.

- [ ] **Step 2: Rot prüfen**

Run: `npm -w @fmt/core test -- einsatzprofil.test.ts`
Expected: FAIL.

- [ ] **Step 3: Umsetzen**

- Daten: je Methode `ungeeignetBeiVorwissen` = `['gering','mittel','hoch']` ohne die Werte aus `geeignetBeiVorwissen`; Feld `geeignetBeiVorwissen` löschen (Skript `uebernehme-einsatzprofil.ts` um den Schalter `--vorwissen` erweitern).
- `eignungsgrund.stufe` mit Grundlage `E` nur dort eintragen, wo die hinterlegte Evidenz der Methode Alter oder Stufe ausdrücklich nennt (zwei Methoden; per `grep -l "ungeeignetBeiStufe" data/bausteine` und Durchsicht der `evidenz`-Texte bestimmen). `eignungsgrund.vorwissen` für alle 28: Text „Expertise-Reversal: Die Unterstützung hilft bei wenig Vorwissen und stört bei viel Vorwissen (Tetzlaff et al. 2025).“ bzw. sinngemäß umgekehrt, Grundlage `S`.
- `passung()` und `checkPre` rufen `eignungsWarnungen` auf; die Meldung der Regel R-06 trägt die Grundlage des Eintrags.
- Methodendetail: „Nicht vorgesehen für: …“ mit dem Begründungstext, wenn vorhanden.

- [ ] **Step 4: Grün prüfen**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Eignung: Vorwissen als ungeeignet-Liste, Warnung nennt Begründung und Grundlage"
```

### Task 11: „Ungeeignet im Fach“ bereinigen, C4-Widersprüche, `ki`-Test

**Files:**
- Create: `/mnt/project-files/einsatzprofil/vorschlag-eignung.md` (Vorschlag zur Durchsicht)
- Modify: `data/bausteine/*.json`, `packages/fmt-core/src/suche.ts` (`fuerFachbereich`), `packages/fmt-core/test/abschlussaudit.test.ts`, `packages/fmt-core/test/stufe2.test.ts`
- Test: `packages/fmt-core/test/einsatzprofil.test.ts`

**Interfaces:**
- Consumes: `raumFehlt` aus Task 5.

- [ ] **Step 1: Vorschlag erzeugen und Jan vorlegen**

Tabelle mit drei Teilen:
1. Sport-Einträge, die entfallen: alle Methoden mit `fachbereichUngeeignet` enthält `sport` **und** `raumFehlt(D, b, 'bewegungsraum')` nicht leer (der Raumbedarf erklärt den Ausschluss). Erwartete Größenordnung: 90 bis 100 von 103.
2. Sport-Einträge, die bleiben, und alle übrigen Einträge: je Methode ein Vorschlag für `eignungsgrund.fachbereich` (Text, Grundlage `S` oder `A`).
3. C4: die neun Methoden mit `ki-keine` und `feedbackgeber` zugleich (`beobachtungsbogen`, `elevator-pitch`, `kompetenzraster-checkliste`, `lesetagebuch`, `pecha-kucha`, `podcast-produktion`, `schuelercoaching`, `stop-motion-erklaerfilm`, `wiki-kollaboration`): Vorschlag `feedbackgeber` aus `rolle` entfernen, weil dort eine Person Rückmeldung gibt (steht in B4).

Auf Jans Freigabe warten.

- [ ] **Step 2: Tests schreiben**

```ts
it('„ungeeignet im Fach Sport“ steht nur noch dort, wo der Raum es nicht erklärt', () => {
  for (const b of D.bausteine.filter((x) => (x.fachbereichUngeeignet || []).includes('sport'))) {
    expect(raumFehlt(D, b, 'bewegungsraum'), b.kennung).toEqual([]);
  }
});
it('jeder Eintrag „ungeeignet im Fach“ hat eine Begründung', () => {
  for (const b of D.bausteine.filter((x) => (x.fachbereichUngeeignet || []).length)) {
    expect(b.eignungsgrund?.fachbereich?.text?.length ?? 0, b.kennung).toBeGreaterThan(10);
  }
});
it('C4 widerspricht sich nicht und ki folgt den KI-Rollen', () => {
  const SYSTEM = ['werkzeug', 'tutor', 'feedbackgeber', 'dialogpartner', 'simulationsrolle', 'belehrbarer-agent', 'antwortgeber'];
  const KI = ['tutor', 'dialogpartner', 'simulationsrolle', 'belehrbarer-agent', 'antwortgeber'];
  for (const b of D.bausteine) {
    if (b.rolle.includes('ki-keine')) expect(b.rolle.filter((r) => SYSTEM.includes(r)), b.kennung).toEqual([]);
    if (b.rolle.some((r) => KI.includes(r))) expect(b.ki, b.kennung).toBe(true);
  }
});
it('Suche „für Sport“ zeigt keine Methode, die in der Halle nicht geht', () => {
  for (const b of createSearch(D).suche({ fuerFachbereich: 'sport', raum: 'bewegungsraum' })) {
    expect((b.raumbedarf || []).includes('schreibplatz'), b.kennung).toBe(false);
  }
});
it('Sport-Theorie im Klassenraum stuft Schreibmethoden nicht herab', () => {
  const r = M.zuordnen({ text: 'Sport Klasse 10 Theoriestunde Trainingslehre im Klassenraum, 45 Minuten' });
  expect(r.pruefung?.gueltig).toBe(true);
});
```

- [ ] **Step 3: Rot prüfen**

Run: `npm -w @fmt/core test -- einsatzprofil.test.ts`
Expected: FAIL in den ersten drei Tests.

- [ ] **Step 4: Umsetzen**

Freigegebenen Vorschlag in die Daten übernehmen. Katalog: Der Filter „für Fachbereich Sport“ setzt zusätzlich `raum: 'bewegungsraum'`, solange kein anderer Raum gewählt ist; dieselbe Regel in `suche.ts` nicht einbauen (die Suche bleibt explizit). `abschlussaudit.test.ts` („fuerFachbereich liefert Methoden des Bereichs …“) und `stufe2.test.ts` an die neue Datenlage anpassen: Die Erwartung „nicht als ungeeignet markiert“ bleibt, die Erwartung zur Mindestzahl ebenfalls.

- [ ] **Step 5: Grün prüfen und Qualitätstor**

Run: `npm test && npm run qualitaet && npm run qualitaet -- reihe2`
Expected: PASS; offene Befunde nicht höher als vor Stufe 3. Die Sportfälle beider Reihen einzeln ansehen: keine Schreibmethode in der Halle.

- [ ] **Step 6: Commit und PR C**

```bash
git add -A && git commit -m "Eignung: Sport-Einträge durch Raumbedarf ersetzt, Begründungen, C4 bereinigt"
```

PR C als Entwurf öffnen. Titel: „Einsatzprofil Stufe 3: Eignung“.

### Task 12: Dokumentation und Abschluss

**Files:**
- Modify: `README.md` (Abschnitt zur Systematik und zur API), `docs/datenpflege/` (Anleitung zur Kodierung von Raumbedarf und Schriftbedarf mit der Aufnahmeregel aus Spec Abschnitt 6), `docs/qualitaet/` (Bericht mit den acht Anfragen aus Abschnitt 4 der Zweitprüfung, vorher und nachher)

- [ ] **Step 1:** Begriffe in README und Doku auf Spec Abschnitt 2 umstellen. Prüfen: `grep -rn "Bedingungsraum\|Ergänzende Merkmale" --include=*.md --include=*.ts --include=*.tsx --include=*.json . | grep -v node_modules | grep -v docs/superpowers` liefert nichts.
- [ ] **Step 2:** Die acht Anfragen aus der Zweitprüfung als Fälle in `packages/fmt-core/test/qualitaet/faelle-reihe2.ts` aufnehmen (Seminar im Hörsaal, Klasse 1 ohne Lesen, DaZ Sprachanfänger, Laufdiktat in Mathe, Lehrküche, Chemie Schülerexperiment, Linolschnitt, Bewegungsfertigkeit ohne Geräte). Für „DaZ Sprachanfänger“ `bekannt` setzen, falls der Katalog keine passenden Methoden hat.
- [ ] **Step 3:** `npm test && npm run build` grün; Bericht schreiben; Commit `git commit -am "Einsatzprofil: Doku, Kodieranleitung, Fälle der Zweitprüfung"`.
