# FMT 2.0 (W-Raster) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die FMT 2.0 (neun W-Felder mal fünf Arten von Aussagen) wird die eine Quelle für Daten, Zuordnung, Binnendifferenzierung, Entwurf, REST, MCP, Baukasten und Systematikseite; die Sonderregeln für Fächer und Räume im Zuordnungscode entfallen.

**Architecture:** Schrittweiser Ersatz. Neue kleine Module in `packages/fmt-core/src` (`situation.ts`, `bedarf.ts`, `zielart.ts`, `regeln.ts`, `teilgruppen.ts`, `planungsprofil.ts`) übernehmen je eine Aufgabe aus `zuordnung.ts` und `methodAdjustments.ts`. Der Regelsatz liegt als Daten in `data/` (`vocab.json`, `ketten.json`, `regeln.json`, `teilgruppen.json`, `planungsprofile.json`). Jede Sonderregel wird erst entfernt, wenn die allgemeine Lösung dieselben Qualitätsfälle besteht.

**Tech Stack:** TypeScript 5.7, npm-Workspaces (`@fmt/core`, `@fmt/server` mit Fastify und MCP-SDK, `@fmt/web` mit React und Vite), Vitest, tsx für Skripte.

**Spec:** `docs/superpowers/specs/2026-11-26-fmt2-w-raster-design.md` (gleich `/mnt/project-files/fmt2/design.md`). Quellen unter `/mnt/project-files/fmt2/quellen/`, vor allem `fmt2-vorschlag/fmt2-regelsatz.json`, `fmt2-vorschlag/fmt2-testfaelle.json`, `fmt2-vorschlag/fmt2-datenvorschlag.csv`, `fmt2-kodierleitfaden.md`.

## Global Constraints

- Sprache: Deutsch in Daten, Meldungen, Oberfläche, Commits und Dokumenten. Code-Kommentare englisch wie im Bestand.
- Wörter: Bedarf, Eignung, Rahmenbedingungen, Beitrag, Einordnung, Bauweise, Wunsch. Nicht verwenden: „Anforderung“, „Bedingung“ (für die Situation), „Bedingungsraum“, „Lernort“ (für Raumtypen), „Ergänzende Merkmale“.
- Die 13 Facetten, ihre Werte, die acht Lernfunktionen und die zwölf Lernstände bleiben unverändert.
- Code-Änderungen ohne Rückfrage. **Jede Änderung an `data/bausteine/*.json` und jede neue Methode oder Hilfe braucht vorher eine unabhängige Prüfung durch ein Fable-5.2-Modell** (Tore D1, D2, D3; Ablauf im Abschnitt „Tore“). Jan hat die Durchsicht am 26.11.2026 abgegeben („übernimm du die prüfarbeit mit einem fable 5.2 modell und entscheide selbst“). Der Regelsatz der Papiere gilt damit als übernommen: `data/vocab.json`, `data/ketten.json` und die drei neuen Regelsatz-Dateien dürfen direkt geschrieben werden (Tor R ist erledigt).
- Kein Push ohne Jans Freigabe. Ein Pull Request je Paket (A, B, C, D), als Draft.
- Alles läuft ohne Sprachmodell. Kein Sprachmodell wählt eine Methode.
- Bedienkonzept des Baukastens: Schritt 1 ohne Vorauswahl, eine Hauptaktion je Schritt, Klartext statt Fachsprache, Änderungen am Ablauf der ganzen Klasse nur als Vorschlag zum Übernehmen.
- Bildungsstufe bleibt bei sechs Werten.
- Alte Aufrufer: `lernort` (Alias für `raum`), die sechs Wissensart-Codes im Feld `zielart` und der Raumtyp `fachraum` werden weiter angenommen.
- Schutz des Qualitätsstands: Ein Qualitätsfall, der im Ausgangsstand besteht, muss nach jedem Task bestehen (Task A1 baut die Prüfung dafür).
- Tests: nach einem Fehlschlag nur die fehlgeschlagenen erneut laufen lassen; die ganze Suite am Ende jedes Pakets.

## Review Focus

1. **Alte Anfrage:** `{ lernort: 'bewegungsraum', zielart: 'psychomotorik' }` über REST und MCP ergibt denselben Ablauf wie `{ raum: 'bewegungsraum', zielart: 'bewegung' }` und keinen 400er. Test in Task A6.
2. **Methode ohne neue Kodierung:** Eine Methode ohne `raumbedarf`, `schriftbedarf` und `termineMin` wird nie wegen Raum, Schrift oder Terminen ausgeschlossen. Test in Task A4.
3. **Widersprüchliche Situation:** `{ raum: 'klassenraum', zielart: 'bewegung', raumBietet: [] }` liefert eine Antwort ohne Ausnahme; offene Schritte nennen das fehlende Merkmal. Test in Task A8.
4. **Teilgruppe nur mit gesperrtem Merkmal** („visuelle Lerntypen“): keine Anpassung, ein Hinweis, kein Absturz; ein im Browser gespeichertes Szenario mit `sensorische-visuell` lädt weiter. Tests in Task C2 und C6.
5. **Hilfe im Freitext genannt** („mit Wortspeicher“): Sie erscheint als Hilfe-Hinweis und nie als Phase; `nichtVerankert` bleibt leer. Test in Task C4.

## Dateien im Überblick

| Datei | Verantwortung | Paket |
|---|---|---|
| `data/vocab.json` | Listen `wfelder`, `arten`, `merkmale`; neue Schemata | A, B, D |
| `data/ketten.json` | `zielart`, `ansatz` je Kette; `wissensart` je Schritt; neue Kette | A, D |
| `data/regeln.json` | Passungsregeln | B |
| `data/teilgruppen.json` | Tausch oder Hilfe je Matrix-Merkmal, Abbau-Texte, Sperrliste | C |
| `data/planungsprofile.json` | Kernfelder, fünf Profile | D |
| `packages/fmt-core/src/raster.ts` | Typen und Zugriff auf W-Felder, Arten, Merkmale | A |
| `packages/fmt-core/src/situation.ts` | Anfrage zu Situation, Pflichtangaben, Angenommenes | A, B |
| `packages/fmt-core/src/bedarf.ts` | Bedarf gegen Rahmenbedingung | A |
| `packages/fmt-core/src/zielart.ts` | Kettenwahl, Bindung, Nachweisform, Lesart | A, D |
| `packages/fmt-core/src/regeln.ts` | Passungsregeln auswerten | B |
| `packages/fmt-core/src/teilgruppen.ts` | Antwort je Teilgruppe, Gleichwertigkeit | C |
| `packages/fmt-core/src/planungsprofil.ts` | Profilwahl, Begriffe | D |
| `packages/fmt-core/src/zuordnung.ts` | nutzt die Module; verliert die Sonderregeln | A, B, D |
| `packages/fmt-core/src/methodAdjustments.ts`, `adaptScenario.ts` | nutzen `teilgruppen.ts` | C |
| `packages/fmt-core/scripts/vorschlag-fmt2-*.ts`, `uebernehme-durchsicht.ts` | Datenvorschläge und Übernahme | A, B, D |
| `packages/fmt-core/test/qualitaet/faelle-reihe4.ts`, `ausgang.json`, `vergleich.ts` | 20 neue Fälle, Ausgangsstand | A bis D |
| `apps/server/src/routes/api.ts`, `apps/server/src/mcp/server.ts`, `apps/server/src/llm/briefings.ts`, `apps/server/src/routes/assistant.ts` | Schnittstellen, Entwurfsvorgaben | A bis D |
| `apps/web/src/pages/PlannerPage.tsx`, `SystematikPage.tsx`, `MethodDetailPage.tsx`, `CatalogPage.tsx`, `apps/web/src/planner/*` | Oberfläche | A bis D |

`einsatzprofil.ts` aus den lokalen Stufe-2-Commits wird zu `bedarf.ts` umbenannt und angepasst, nicht doppelt geführt.

## Tore

| Tor | Was geprüft wird | Wovon es abhängt | Was wartet |
|---|---|---|---|
| R | erledigt: Regelsatz gilt als übernommen (Jan, 26.11.2026) | – | nichts |
| D1 | `/mnt/project-files/fmt2/durchsicht-1-bedarf.csv` und `.md` | Task A5 | Task A9 und A10 |
| D2 | `/mnt/project-files/fmt2/durchsicht-2-eignung.md` | Task B5, C1 | Task B6, C5 (Datenteil) |
| D3 | `/mnt/project-files/fmt2/durchsicht-3-katalog.md` und `daten-entwurf/*.json` | Task D6 | Task D7 |

Wartet ein Task auf ein Tor, geht die Arbeit mit dem nächsten Task weiter, der nicht davon abhängt.

**Ablauf eines Tors (Prüfung statt Jans Durchsicht).**

1. Der Umsetzende erzeugt den Vorschlag (Tabelle oder Dokument) unter `/mnt/project-files/fmt2/`.
2. Er startet einen Prüfer: Agent-Werkzeug mit `model: "fable"`, frischer Kontext (kein Fork). Der Prüfer bekommt die Pfade des Vorschlags, des Kodierleitfadens (`/mnt/project-files/fmt2/quellen/fmt2-kodierleitfaden.md`), der Taxonomie (`quellen/fmt2-taxonomie-w-fragen.md`) und des Ordners `data/bausteine`. Er bekommt nicht die Begründungen oder Schlüsse des Vorschlagenden. Auftrag: jede Zeile gegen die Durchführung und das Material der Methode nach den Grundregeln des Leitfadens prüfen (Grundform; Bedarf nur, was ohne Ausnahme gilt und ablesbar ist; Eignung nur mit Begründung). Bei 303 Zeilen in Blöcken zu etwa 60 Methoden, je Block ein Prüfer.
3. Der Prüfer schreibt in die Spalte `entscheidung` nur, was vom Vorschlag abweicht (`feld=wert; feld=wert`), mit einem Satz Begründung in der Spalte `pruefnotiz`. Bei Tor D2 und D3 schreibt er je Eintrag „übernehmen“, „ändern: …“ oder „streichen“, mit Grund.
4. Ist der Vorschlagende anderer Ansicht als der Prüfer, gilt die vorsichtigere Lesart: kein Bedarf und keine Eignungswarnung ohne Beleg in Durchführung, Material oder Quelle.
5. Ergebnis nach `/mnt/project-files/fmt2/pruefung/tor-<D1|D2|D3>.md`: Zahl der geprüften Zeilen, Zahl und Liste der Abweichungen mit Grund, offene Zweifel. Diese Datei liest Jan nach; sie wird der Nachricht zum Pull Request angehängt.
6. Erst danach schreibt das Übernahme-Skript in `data/bausteine`.

Wo unten von Durchsicht die Rede ist, gilt dieser Ablauf. Jans Freigabe braucht weiterhin jeder Push.

**PR A und die Tore.** Paket A wird als ein Pull Request geliefert, der die geprüften Daten aus Tor D1 enthält; der Abbau der Sonderregeln (Task A10) läuft erst gegen die übernommenen Daten (Task A9). Die Tasks A2 bis A8 arbeiten bis dahin mit Fixtures.

---

# Paket A: Raum, Schrift, Zielart (PR A)

### Task A1: Ausgangsstand sichern und Stufe-2-Commits übernehmen

**Files:**
- Create: `packages/fmt-core/test/qualitaet/vergleich.ts`, `packages/fmt-core/test/qualitaet/ausgang.json`, `packages/fmt-core/test/ausgang.test.ts`, `docs/qualitaet/2026-11-27-fmt2-ausgang.md`
- Modify: `package.json` (Skript `qualitaet:ausgang`)

**Interfaces:**
- Produces: `ladeAusgang(): Record<string, Record<Pruefung, boolean>>` (Fall-Kennung zu Prüfung zu bestanden) und `vergleicheMitAusgang(aktuell: Fallergebnis[]): Array<{ fall: string; pruefung: Pruefung; detail: string }>` (nur Verschlechterungen).

Dieser Plan ist gegen `origin/main` (`1d61ef9`) geschrieben; die Stufe-2-Commits waren beim Planen nicht sichtbar. Alle Schnittstellen in diesem Plan gelten deshalb unabhängig davon. Was die lokalen Commits schon liefern, wird übernommen und auf die Namen dieses Plans gebracht; wo sie abweichen, gilt der Plan. Lassen sie sich nicht sauber übernehmen, beginnt Paket A auf `main` ohne sie, weil A3, A4 und A5 alles Nötige selbst festlegen.

- [ ] **Step 1:** Arbeitszweig von `origin/main` (`1d61ef9` oder neuer) anlegen. Die lokalen Stufe-2-Commits des Einsatzprofils (Tasks 4, 5, 6, 8, 7A, 9A des Plans `2026-11-26-einsatzprofil.md`) darauf übernehmen. In `.superpowers/sdd/` notieren, welche Dateien sie anlegen (`einsatzprofil.ts`, `einsatzprofil.test.ts`, Skript `vorschlag-einsatzprofil.ts`, Listen `ebenen` und `merkmale` in `vocab.json`, Feld `raum` mit Alias `lernort`, `ohneSchrift`).
- [ ] **Step 2:** `npm test` laufen lassen; alles grün ist Voraussetzung. Ergebnis notieren.
- [ ] **Step 3:** `vergleich.ts` schreiben: führt `pruefeFall` für alle Fälle aus `faelle.ts`, `faelle-reihe2.ts`, `faelle-reihe3.ts` aus. Mit `--schreiben` legt es `ausgang.json` an.
- [ ] **Step 4:** Test `ausgang.test.ts`:

```ts
it('kein Qualitätsfall ist schlechter als im Ausgangsstand', () => {
  expect(vergleicheMitAusgang(alleFallergebnisse(M, D))).toEqual([]);
});
```

- [ ] **Step 5:** `npm run qualitaet:ausgang -- --schreiben`, dann `npx vitest run packages/fmt-core/test/ausgang.test.ts`. Erwartet: PASS. Bericht `npm run qualitaet` nach `docs/qualitaet/2026-11-27-fmt2-ausgang.md` schreiben.
- [ ] **Step 6:** Commit „FMT 2.0: Ausgangsstand der Qualitätsfälle gesichert“.

`ausgang.json` wird nur neu geschrieben, wenn ein Fall besser wird, nie um eine Verschlechterung zu verdecken. Wer es neu schreibt, nennt im Commit die Fälle.

### Task A2: Die 20 neuen Fälle als Reihe 4

**Files:**
- Create: `packages/fmt-core/test/qualitaet/faelle-reihe4.ts`
- Modify: `packages/fmt-core/test/qualitaet/faelle.ts` (Typ `Qualitaetsfall`, `Pruefung`), `pruefen.ts`, `bericht.ts`, `packages/fmt-core/test/qualitaet.test.ts`

**Interfaces:**
- Produces: neue Felder in `Qualitaetsfall.erwartet`:

```ts
/** No method in the plan needs one of these room properties. */
ohneRaumbedarf?: string[];
/** No method in the plan needs learners to read or write ('liest' | 'schreibt'). */
ohneSchriftbedarf?: string[];
/** Every method in a main or securing step carries one of these knowledge types. */
wissensartHaupt?: string[];
/** Mandatory details the answer must report as missing. */
pflichtFehlt?: string[];
/** Fields the answer must report as assumed. */
angenommen?: string[];
/** Rule ids that must appear in regelmeldungen. */
regeln?: string[];
/** The check step uses a method of this form. */
nachweisform?: string;
/** Planning profile of the answer. */
planungsprofil?: string;
/** A companion strand for this companion goal is proposed. */
begleitstrang?: string;
/** Subgroup expectations, evaluated through adaptScenario. */
teilgruppe?: { antwort: 'passt' | 'hilfe' | 'tausch'; gesperrt?: boolean; abbau?: boolean };
```

und neue Werte in `Pruefung`: `'bedarf' | 'bindung' | 'pflichtangaben' | 'regel' | 'nachweis' | 'profil' | 'begleitziel' | 'teilgruppe'`.

- [ ] **Step 1:** Alle 20 Fälle aus `fmt2-testfaelle.json` mit Kennung `n01` bis `n20` und wörtlichem Text übertragen. Die Erwartung in die Felder oben übersetzen, zum Beispiel:

| Fall | Erwartung als Felder |
|---|---|
| n01 | `kette: 'fertigkeit-bewegung'`, `wissensartHaupt: ['psychomotorik']`, `ohneRaumbedarf: ['schreibplatz']` |
| n02 | `kriterien: { raum: 'klassenraum' }`, `praxis` nicht gesetzt, Kette aus der Zielart Konzepte |
| n05 | `kette: 'urteilsbildung'`, `ohneRaumbedarf: ['stellflaeche']`, `nicht: ['fishbowl', 'kugellager']` |
| n06 | `ohneSchriftbedarf: ['liest', 'schreibt']` |
| n07 | `teilgruppe: { antwort: 'tausch' }` |
| n08 | `teilgruppe: { antwort: 'hilfe', abbau: true }` |
| n09 | `teilgruppe: { antwort: 'passt', gesperrt: true }` |
| n11 | `begleitstrang: 'selbstregulation'`, `regeln: ['begleitziel-braucht-termine']` |
| n13 | `kette: 'vollstaendige-handlung'`, `planungsprofil: 'berufsschule'` |
| n17 | `pflichtFehlt: ['anzahl', 'raum']`, `angenommen: ['raum']` |
| n18 | `nachweisform: 'praktisch'` |
| n19 | `enthaelt: 'laufdiktat'` |
| n20 | `regeln: ['wenig-anleitung-komplexer-inhalt']` |

Die übrigen Fälle folgen demselben Muster aus der Spalte `erwartung` der Vorlage.
- [ ] **Step 2:** Jeder Fall bekommt `bekannt` für jede Prüfung, die erst ein späteres Paket oder ein Tor erfüllt, mit dem Grund „Paket B“, „Paket C“, „Paket D“ oder „Tor D1“. Zuordnung: n01 bis n06 und n18 Paket A; n17, n19, n20 Paket B; n07 bis n10 Paket C; n11 bis n16 Paket D.
- [ ] **Step 3:** `pruefen.ts` um die neuen Prüfungen erweitern. Solange ein Feld der Antwort noch nicht existiert (`pflichtangaben`, `regelmeldungen`), gilt die Prüfung als nicht bestanden.
- [ ] **Step 4:** `npx vitest run packages/fmt-core/test/qualitaet.test.ts`. Erwartet: PASS, weil alle neuen Prüfungen `bekannt` tragen. `npm run qualitaet` zeigt 20 neue Fälle mit bekannten Lücken.
- [ ] **Step 5:** Commit.

Mit jedem späteren Task, der eine Prüfung erfüllt, wird die Markierung `bekannt` an den betroffenen Fällen entfernt. Das steht dort nicht noch einmal.

### Task A3: Raster und Vokabulare

**Files:**
- Create: `packages/fmt-core/src/raster.ts`, `packages/fmt-core/test/raster.test.ts`
- Modify: `data/vocab.json`, `packages/fmt-core/src/types.ts`, `load-data.ts`, `index.ts`, `packages/fmt-core/scripts/build-artefacts.ts` (Bundle)

**Interfaces:**
- Produces in `types.ts`:

```ts
export type Wirkung = 'schliesst-aus' | 'warnt' | 'ordnet' | 'weist-hin';
export type Grundlage = 'formal' | 'Recht' | 'E' | 'S' | 'A' | 'U';
export interface WFeld { id: string; name: string; frage: string; planung: 'gegeben' | 'vorschlag' }
export interface Aussageart { id: 'bauweise' | 'beitrag' | 'bedarf' | 'eignung' | 'einordnung'; name: string; aussage: string; wirkung: string }
export interface Merkmal {
  /** Field name(s) at the method, e.g. 'raumbedarf' or 'dauerMin'. */
  feld: string;
  wfeld: string;
  art: Aussageart['id'];
  /** Request fields that are the counterpart in the situation. */
  situation: string[];
  wirkung: Wirkung;
  grundlage: Grundlage;
  regel?: string;
}
```

`FmtData` und `CatalogBundle` bekommen `wfelder: WFeld[]`, `arten: Aussageart[]`, `merkmale: Merkmal[]`. `VocabValue` bekommt `bietet?: string[]`, `fachausstattungArt?: string`, `wissensart?: string[]`, `nachweis?: string[]`, `lesart?: Record<string, string> | string`. `Baustein` bekommt `raumbedarf?`, `fachausstattungArt?`, `schriftbedarf?`, `termineMin?`, `eintragsart?: 'methode' | 'hilfe'`, `raumhinweis?`, `betreuungshinweis?`, `eignungsgrund?: Partial<Record<'stufe' | 'vorwissen' | 'fachbereich', { text: string; grundlage: 'E' | 'S' | 'A'; quelle?: string }>>`, `ungeeignetBeiVorwissen?: string[]`.
- Produces in `raster.ts`: `merkmalFuer(data: FmtData, feld: string): Merkmal | undefined`, `merkmaleNachWFeld(data: FmtData): Map<string, Merkmal[]>`.

Werte, die das Design festlegt:

- `wfelder` in dieser Reihenfolge: `lernziele`, `lerninhalte`, `lernende`, `lernbegleitung`, `lernumgebung`, `zeit`, `methode`, `medien`, `ueberpruefung`. Namen und Fragen aus `fmt2-regelsatz.json` → `wfelder`.
- `merkmale`: die 17 Zeilen aus `fmt2-regelsatz.json` → `merkmale`, je Feld der Methode eine Zeile (zusammengefasste Zeilen wie „gruppeMin, gruppeMax, teamMin, teamMax“ aufteilen). Dazu die 13 Facetten mit `art: 'bauweise'`, `wfeld: 'methode'` (C3 `raumzeit` unter `lernumgebung`, B4 `feedback` unter `ueberpruefung`, D1 `aufgabe` unter `lernziele`, A1 `lernfunktion` unter `lernziele`), `ansatz`, `kategorie`, `fachbereich` mit `art: 'einordnung'`, `nachbedingung` mit `art: 'beitrag'`, `betreuungshinweis` unter `lernbegleitung`.
- Schema `raumbedarf`: `schreibplatz`, `stellflaeche`, `bewegungsflaeche`, `wandflaeche`, `aussenort`, `fachausstattung`; Definitionen aus der Einsatzprofil-Spec Abschnitt 4.
- Schema `raumtyp`: die elf Werte aus `fmt2-regelsatz.json` → `raumtypen` mit `bietet` und `fachausstattungArt`, dazu `fachraum` (bietet `schreibplatz`, `stellflaeche`, `wandflaeche`, `fachausstattung`; ohne Art).
- Schema `fachausstattungart`: `sport`, `musik`, `labor`, `werkstatt`, `kueche`, `rechner`.
- Schema `schriftbedarf`: `liest`, `schreibt`. Schema `eintragsart`: `methode`, `hilfe`.
- Schema `zielart` mit `wissensart` und `nachweis`:

| Kennung | Label | `wissensart` | `nachweis` |
|---|---|---|---|
| `fakten` | Faktenwissen | fakten | – |
| `konzepte` | Konzepte verstehen | konzepte | – |
| `prozeduren` | Verfahren beherrschen | prozeduren | – |
| `problemloesen` | Problemlösen und Transfer | konzepte, prozeduren | – |
| `bewegung` | Bewegung und praktische Fertigkeit | psychomotorik | praktisch |
| `kondition` | Kondition | psychomotorik | praktisch |
| `urteilen` | Urteilen und Werten | einstellungen, konzepte | – |
| `gestalten` | Gestalten und Produzieren | prozeduren, konzepte, psychomotorik | produkt, praktisch |
| `handlung` | Berufliche Handlung | prozeduren, psychomotorik | praktisch |

- Schema `nachweisform`: `schriftlich`, `muendlich`, `praktisch`, `produkt`.
- Die Listen `ebenen` und die Kennungen BD1 bis BD6, EG1 bis EG3 aus den Stufe-2-Commits entfallen.

- [ ] **Step 1:** Test `raster.test.ts`:

```ts
it('jedes Merkmal nennt ein bekanntes W-Feld und eine bekannte Art', () => { /* über D.merkmale */ });
it('jedes Feld, das an einer Methode vorkommt, hat ein Merkmal oder steht auf der Liste der Verwaltungsfelder', () => {
  const verwaltung = ['kennung', 'name', 'status', 'quellen', 'piktogramm', 'plot', '@context', '@id', 'typ', 'beschreibungsstufe',
    'kurzbeschreibung', 'alternativname', 'problem', 'durchfuehrung', 'variante', 'hinweis', 'qualitaetsrisiko', 'evidenz',
    'kernkomponente', 'slot', 'komposit', 'reichweite', 'steuerung', 'raumhinweis', 'raum', 'lernort', 'eignungsgrund'];
  /* every key of every Baustein is in verwaltung or has merkmalFuer(D, key) */
});
it('jeder Raumtyp bietet nur Werte aus raumbedarf', () => {});
it('jede Zielart nennt Wissensarten aus D1', () => {});
```

- [ ] **Step 2:** Test laufen lassen, FAIL erwartet (`merkmale` fehlt).
- [ ] **Step 3:** Daten und Typen anlegen, `load-data.ts` liest die drei Listen, Bundle führt sie.
- [ ] **Step 4:** Test laufen lassen, PASS erwartet. `npm -w @fmt/core test` für `artefacts.test.ts`.
- [ ] **Step 5:** Commit.

### Task A4: Situation und Bedarf

**Files:**
- Create: `packages/fmt-core/src/situation.ts`, `packages/fmt-core/src/bedarf.ts` (aus `einsatzprofil.ts`), `packages/fmt-core/test/situation.test.ts`, `packages/fmt-core/test/bedarf.test.ts`
- Modify: `packages/fmt-core/src/index.ts`

**Interfaces:**
- Consumes: `FmtData.schemes` (`raumtyp`, `raumbedarf`), Typen aus Task A3.
- Produces:

```ts
export type Pflichtangabe = 'ziel' | 'fach-und-thema' | 'bildungsstufe' | 'anzahl' | 'raum' | 'zeit';
export interface Annahme { feld: string; wert: unknown; grund: string }
export interface Situation {
  /** Room type; stated or assumed. */
  raum?: string;
  /** Whether the request states the room (type or properties). Only then an uncovered room need excludes. */
  raumGenannt: boolean;
  /** What the room offers. */
  bietet: Set<string>;
  fachausstattungArt?: string;
  ohneSchrift: string[];            // 'lesen' | 'schreiben'
  termine?: number;
  pflichtangaben: { fehlt: Pflichtangabe[]; angenommen: Annahme[] };
}
export function baueSituation(a: MatchRequest, data: Pick<FmtData, 'schemes'>, kontext?: { thema?: string; fachErkannt?: boolean; psychomotorisch?: boolean }): Situation;

export interface BedarfLuecke { merkmal: string; grund: string }
/** First need of the method the situation does not cover; null when all needs are covered or not checkable. */
export function ungedeckterBedarf(b: Baustein, a: MatchRequest, s: Situation, data: Pick<FmtData, 'schemes'>): BedarfLuecke | null;
/** Room needs the room does not offer (also when the room is only assumed). */
export function raumFehlt(b: Baustein, s: Situation): string[];
```

Regeln, die das Design festlegt:

- Raum genannt: `a.raum` oder `a.lernort` (Alias) oder `a.raumBietet`. `bietet` ist `raumBietet`, wenn gesetzt, sonst das `bietet` des Raumtyps.
- Raum nicht genannt: angenommen wird `bewegungsraum` bei Fachbereich `sport`; `fachraum` bei psychomotorischem Ziel in `beruf-praxis` oder `nawi-technik`; sonst `klassenraum`. Eintrag in `angenommen` mit Grund, zum Beispiel „Raum nicht angegeben: Sporthalle angenommen, weil das Fach Sport ist.“ Chemie ohne Raumangabe und ohne psychomotorisches Ziel nimmt also den Klassenraum an (Fall n17). **Ein angenommener Raum schließt nie aus.** Er wirkt nur über `raumFehlt` auf die Rangstufe und über die angenommene Zielart auf die Kettenwahl. Ausgeschlossen wird wegen des Raums nur bei `raumGenannt`.
- `pflichtangaben.fehlt`: `ziel` (weder `zielart` noch `zieltyp` noch `lernfunktion` noch `liefert`), `fach-und-thema` (kein Fachbereich oder kein Thema), `bildungsstufe`, `anzahl` (`gruppe`), `raum` (nicht genannt), `zeit` (`zeitMin`).
- `ungedeckterBedarf` prüft in dieser Reihenfolge und übernimmt die Texte aus `rahmen()` in `zuordnung.ts`: Dauer, Gruppe, Technik, Internet, KI, Vorbereitung, Raum-Zeit; neu: Raum (nur wenn `raumGenannt`; Grund „braucht: Stellfläche“ mit dem Label des Werts), Art der Fachausstattung (nur wenn Methode und Raum eine Art nennen und sie abweichen), Schrift (`ohneSchrift` enthält `lesen` und die Methode `liest`; ebenso `schreiben`), Termine (`termine < termineMin`). `merkmal` ist der Feldname der Methode.

- [ ] **Step 1:** Tests schreiben:

```ts
it('Hörsaal bietet keine Stellfläche: Kugellager ist ausgeschlossen', () => {
  const s = baueSituation({ raum: 'hoersaal' }, D);
  expect(ungedeckterBedarf({ ...kugellager, raumbedarf: ['stellflaeche'] }, { raum: 'hoersaal' }, s, D))
    .toEqual({ merkmal: 'raumbedarf', grund: 'braucht: Stellfläche' });
});
it('raumBietet überschreibt den Raumtyp', () => {
  const s = baueSituation({ raum: 'klassenraum', raumBietet: ['schreibplatz'] }, D);
  expect([...s.bietet]).toEqual(['schreibplatz']);
});
it('lernort ist Alias für raum', () => { expect(baueSituation({ lernort: 'draussen' }, D).raum).toBe('draussen'); });
it('ohne Raumangabe wird nichts wegen des Raums ausgeschlossen, der Raum steht unter angenommen', () => {
  const s = baueSituation({ fachbereich: 'sport' }, D);
  expect(s.raumGenannt).toBe(false);
  expect(s.pflichtangaben.angenommen.map((x) => x.feld)).toContain('raum');
  expect(ungedeckterBedarf({ ...abrufquiz, raumbedarf: ['schreibplatz'] }, {}, s, D)).toBeNull();
  expect(raumFehlt({ ...abrufquiz, raumbedarf: ['schreibplatz'] }, s)).toEqual(['schreibplatz']);
});
it('Methode ohne neue Kodierung wird nie wegen Raum, Schrift oder Terminen ausgeschlossen', () => {
  const s = baueSituation({ raum: 'hoersaal', ohneSchrift: ['lesen', 'schreiben'], termine: 1 }, D);
  expect(ungedeckterBedarf(ohneNeueFelder, { raum: 'hoersaal' }, s, D)).toBeNull();
});
it('Klassenmusizieren braucht Fachausstattung der Art Musik: im Werkraum ausgeschlossen, im allgemeinen Fachraum nicht', () => {});
it('ohneSchrift lesen schließt eine Methode mit schriftbedarf liest aus', () => {});
it('termine 1 schließt eine Methode mit termineMin 2 aus', () => {});
```

- [ ] **Step 2:** FAIL prüfen. **Step 3:** Implementieren. **Step 4:** PASS prüfen. **Step 5:** Commit.

### Task A5: Datenvorschlag 1 erzeugen und prüfen lassen (Tor D1)

**Files:**
- Create: `packages/fmt-core/scripts/vorschlag-fmt2-bedarf.ts`, `/mnt/project-files/fmt2/durchsicht-1-bedarf.csv`, `/mnt/project-files/fmt2/durchsicht-1-bedarf.md`

**Interfaces:**
- Produces: CSV mit den Spalten `kennung, name, status, gruppe, lernort_alt, raum_alt, raumbedarf_repo, raumbedarf_papier, raumbedarf_vorschlag, abweichung, fachausstattungArt, schriftbedarf_repo, schriftbedarf_papier, schriftbedarf_vorschlag, termineMin_vorschlag, wissensart_alt, wissensart_vorschlag, fach_ungeeignet_alt, fach_ungeeignet_vorschlag, hinweis, entscheidung, pruefnotiz`. Listen mit `|` getrennt. Die Spalten `entscheidung` und `pruefnotiz` bleiben leer; der Prüfer trägt dort nur ein, was vom Vorschlag abweicht, im Format `feld=wert; feld=wert`, und begründet es.

- [ ] **Step 1:** Skript schreiben. Eingaben als Argumente: Repository-Daten, `/mnt/project-files/einsatzprofil/vorschlag-bedarf.json` (Spalten `_repo`), `fmt2-datenvorschlag.csv` (Spalten `_papier`). Regeln für `_vorschlag`:
  - Die Deckelung „keine Methode braucht, was einer ihrer Räume nicht bietet“ aus dem alten Skript entfällt für `fachausstattung` (die Sporthalle bietet sie jetzt).
  - Stimmen beide Quellen überein, gilt der Wert. Weichen sie ab, gilt der Wert des Repository-Skripts, und `abweichung` ist `ja`.
  - Methoden, deren `lernort` weder `klassenraum` noch `hoersaal` enthält: `bewegungsflaeche`, wenn `lernort` nur aus `bewegungsraum` und `draussen` besteht; `fachausstattung`, wenn `lernort` `fachraum` enthält; `aussenort`, wenn `lernort` nur `draussen` ist.
  - `schreibt` nur, wenn Lernende schreiben (nicht, wenn nur die Lehrkraft schreibt); bei Unsicherheit leer und Hinweis „Schrift prüfen“.
  - `termineMin_vorschlag`: 2 nur bei `sequenz` mit `verteilt` oder wenn die Durchführung Abstand zwischen Terminen nennt. Die 64 Vorschläge der Vorlage nicht übernehmen.
  - `wissensart_vorschlag`: nur für die elf Methoden ohne Wissensart, die sechs mit „D1 prüfen“ und Praxismethoden, die nur „Konzepte“ tragen; jeweils mit Begründung im Hinweis.
  - `fach_ungeeignet_vorschlag`: Einträge mit `sport` entfallen, wenn `raumbedarf_vorschlag` einen Wert nennt, den die Sporthalle nicht bietet, oder die Methode keine Psychomotorik trägt. Die übrigen bleiben für Durchsicht 2.
  - `gruppe` für die Reihenfolge nach Kodierleitfaden: `1 kuratiert`, `2 praxis`, `3 uebrige`.
  - Bekannte Fehler ausdrücklich behandeln: Exkursion (`aussenort`), Gruppenpuzzle (`stellflaeche`), Schülerexperiment (`fachausstattung`).
- [ ] **Step 2:** `durchsicht-1-bedarf.md` schreiben: Zählung je Wert, die Zeilen mit `abweichung = ja`, die Liste der Methoden mit geänderter Wissensart, in einfachem Deutsch, höchstens zwei Seiten vor der Tabelle.
- [ ] **Step 3:** Prüfung nach dem Ablauf im Abschnitt „Tore“ starten (fünf Blöcke). Ergebnis nach `/mnt/project-files/fmt2/pruefung/tor-D1.md`. Task A9 und A10 warten darauf.
- [ ] **Step 4:** Commit des Skripts (ohne Datenänderung).

### Task A6: Zielart, Kettenwahl und Bindung als Daten

**Files:**
- Create: `packages/fmt-core/src/zielart.ts`, `packages/fmt-core/test/zielart.test.ts`
- Modify: `data/ketten.json`, `packages/fmt-core/src/types.ts` (`KettenSchritt.wissensart?: string[]`, `Funktionskette.ansatz?: string[]`)

**Interfaces:**
- Produces:

```ts
/** Old knowledge-type codes accepted in the request field zielart. */
export const ZIELART_ALIAS: Record<string, string> = { psychomotorik: 'bewegung', einstellungen: 'urteilen' };
export function normZielart(code: string | undefined): string | undefined;
export interface Kettenwahl { kette: Funktionskette; grund: 'zieltyp' | 'zielart' | 'ansatz' | 'angenommen' }
export function waehleKette(ketten: Funktionskette[], a: { zieltyp?: string; zielart?: string; ansatz?: string[] }): Kettenwahl | null;
/** Whether the method delivers its learning state for a knowledge type the chain step asks for. */
export function traegtWissensart(b: Baustein, schritt: Pick<KettenSchritt, 'rolle' | 'wissensart'>): boolean;
export function wissensartenVon(b: Baustein): string[];
export type Nachweisform = 'schriftlich' | 'muendlich' | 'praktisch' | 'produkt';
export function nachweisformen(b: Baustein): Nachweisform[];
```

Festlegungen:

- `data/ketten.json`, je Kette:

| Kette | `zielart` | `ansatz` |
|---|---|---|
| `konzeptaufbau` | konzepte | – |
| `prozedur` | prozeduren | uebung |
| `problemloesen` | problemloesen | – |
| `faktenwissen` | fakten | – |
| `fuenf-e` | konzepte | forschend |
| `pbl-siebensprung` | problemloesen | – |
| `direkte-instruktion` | prozeduren, konzepte | instruktion |
| `kooperatives-lernen` | – | kooperativ |
| `projektlernen` | gestalten | offen |
| `urteilsbildung` | urteilen | diskurs |
| `fertigkeit-bewegung` | bewegung | – |
| `kondition-training` | kondition | – |
| `produktion` | gestalten | – |

  Die Reihenfolge in der Datei bleibt; `produktion` rückt vor `projektlernen`, damit „Gestalten“ ohne Wunsch die Produktionskette ergibt.
- `wissensart` je Schritt: wörtlich aus `fmt2-regelsatz.json` → `kettenschritteWissensart` (57 Zeilen). Randschritte bleiben ohne Angabe.
- `waehleKette`: `zieltyp` gewinnt. Sonst die Ketten der Zielart; unter ihnen die erste, deren `ansatz` einen gewünschten Ansatz enthält, sonst die erste ohne `ansatz`, sonst die erste. Ohne Zielart die erste Kette, deren `ansatz` einen gewünschten Ansatz enthält. Sonst `null`; der Aufrufer nimmt dann `konzepte` an und trägt das unter `angenommen` ein.
- `traegtWissensart`: wahr, wenn der Schritt keine `wissensart` nennt oder die Rolle `rand` ist; sonst wahr genau dann, wenn die Methode eine der Wissensarten in D1 trägt. Eine Methode ohne Wissensart trägt nicht.
- `nachweisformen` (Setzung, steht im Regel-Treffer-Bericht von Task B5): `praktisch` bei `enaktiv` in C2; `schriftlich` bei `schreibt` im Schriftbedarf; `produkt` bei `konstruktiv` in A2 und Reichweite ab R2; `muendlich` sonst, wenn die Interaktion nicht nur `einzel` ist.

- [ ] **Step 1:** Tests:

```ts
it('Zielart Konzepte ergibt Konzeptaufbau, mit Ansatz forschend 5E, mit Ansatz Instruktion Direkte Instruktion', () => {});
it('Zielart Gestalten ergibt Produktion, mit Ansatz offen Projektlernen', () => {});
it('ohne Zielart wählt der Ansatz kooperativ die Kette Kooperatives Lernen', () => {});
it('zieltyp gewinnt gegen Zielart', () => {});
it('alte Codes: psychomotorik wird bewegung, einstellungen wird urteilen', () => {});
it('Abrufquiz (Fakten, Konzepte) trägt den Übungsschritt der Bewegungskette nicht', () => {
  const b3 = kette('fertigkeit-bewegung').schritte.find((s) => s.ziel === 'prozedur-gelaeufig')!;
  expect(traegtWissensart(baustein('abrufquiz'), b3)).toBe(false);
  expect(traegtWissensart(baustein('teil-ganz-ueben'), b3)).toBe(true);
});
it('Randschritte binden nicht', () => {});
it('jeder Haupt- und Sicherungsschritt jeder Kette hat im Katalog mindestens eine tragende Methode', () => { /* guards the data */ });
```

- [ ] **Step 2 bis 5:** FAIL, implementieren, PASS, Commit.

### Task A7: Anfragefelder und Leseregeln

**Files:**
- Modify: `packages/fmt-core/src/zuordnung.ts` (`FIELDS`, `RULES`, `VERB_CHAINS`, `lesen`), `packages/fmt-core/src/types.ts` (`MatchRequest`), `packages/fmt-core/test/golden-szenarien.ts` (`LESEFAELLE`)

**Interfaces:**
- Produces: neue Anfragefelder `raum` (Code `raumtyp`), `raumBietet` (Codes `raumbedarf`), `fachausstattungArt` (Code), `ohneSchrift` (Codes `lesen`, `schreiben`), `termine` (Zahl). `zielart` nimmt die neun Werte aus dem Schema `zielart` und die sechs alten Codes; `check()` wandelt alte Codes mit `normZielart` um. `lernort` bleibt in `check()` erlaubt, steht aber nicht in `felder()` und `schema()`.

Leseregeln:

| Text | ergibt |
|---|---|
| bisherige Regel `zielart` → `psychomotorik` | `zielart: 'bewegung'` |
| bisherige Regel `zieltyp` → `kondition-training` | `zielart: 'kondition'` |
| bisherige Regel `zieltyp` → `urteilsbildung` und `VERB_CHAINS` Urteil | `zielart: 'urteilen'` |
| bisherige Regel `zieltyp` → `produktion` | `zielart: 'gestalten'` |
| bisherige Regel `zieltyp` → `problemloesen` und `VERB_CHAINS` Fall | `zielart: 'problemloesen'` |
| bisherige Regel `zieltyp` → `faktenwissen` | `zielart: 'fakten'` |
| `VERB_CHAINS` Projekt | `zielart: 'gestalten'`, Ansatz `offen` |
| `VERB_CHAINS` Erkunden | `zielart: 'konzepte'`, Ansatz `forschend` |
| benannte Modelle (PBL, Projektlernen, Direkte Instruktion, Kooperatives Lernen, 5E) | bleiben `zieltyp` |
| „Musikraum“, „im Werkraum“, „Werkstatt“, „Lehrküche“, „Schulküche“, „Computerraum“, „PC-Raum“, „Labor“, „Chemieraum“, „Physikraum“ | der jeweilige neue Raumtyp statt `fachraum` |
| „feste Bestuhlung“ | `raum: 'hoersaal'`, wenn kein anderer Raum genannt ist |
| „online“, „Videokonferenz“ ohne Raum | `raum: 'digital'` zusätzlich zu `raumzeit` |
| „außerschulischer Lernort“, „im Betrieb“, „am Arbeitsplatz“, „im Museum“ | `raum: 'ausserschulisch'` |
| „können (noch) nicht lesen“, „Leseanfänger“, „nicht alphabetisiert“ | `ohneSchrift: ['lesen', 'schreiben']` |
| „können (noch) nicht schreiben“ | `ohneSchrift: ['schreiben']` |
| „über N Termine“, „N Sitzungen“, „N Doppelstunden“ | `termine: N` |

- [ ] **Step 1:** Lesefälle in `LESEFAELLE` ergänzen: je Zeile der Tabelle ein Fall, dazu Gegenfälle („Wortschatz in der Küche“ ist kein Raum; „Bestuhlung im Theater“ als Thema ist kein Hörsaal; „Kinder können schon lesen“ setzt `ohneSchrift` nicht).
- [ ] **Step 2:** `npx vitest run packages/fmt-core/test/golden.test.ts`, FAIL erwartet.
- [ ] **Step 3:** Felder und Regeln umsetzen. `zuordnen` nutzt vorerst weiter die alten Pfade; Stellen, die `a.zielart === 'psychomotorik'` oder `(kette.zielart || []).includes('psychomotorik')` prüfen, lesen jetzt `bewegung` und `kondition`.
- [ ] **Step 4:** `golden.test.ts`, `ausgang.test.ts` und `qualitaet.test.ts` laufen lassen, PASS erwartet. Review Focus 1 als Test in `core.test.ts`:

```ts
it('alte Anfrage mit lernort und zielart psychomotorik ergibt denselben Ablauf wie die neue', () => {
  const alt = M.zuordnen({ text: 'Sport Klasse 7, Handstand, 90 Minuten', lernort: 'bewegungsraum', zielart: 'psychomotorik' });
  const neu = M.zuordnen({ text: 'Sport Klasse 7, Handstand, 90 Minuten', raum: 'bewegungsraum', zielart: 'bewegung' });
  expect(bausteineVon(alt)).toEqual(bausteineVon(neu));
});
```

- [ ] **Step 5:** Commit.

### Task A8: Zuordnung auf Situation, Bedarf, Kettenwahl und Bindung umstellen

**Files:**
- Modify: `packages/fmt-core/src/zuordnung.ts` (`rahmen`, `candidates`, `ablauf`, `planen`, `setRoom`), `packages/fmt-core/src/types.ts` (`MatchHead`, `AblaufMatchResult`)
- Test: `packages/fmt-core/test/core.test.ts`, `golden.test.ts`

**Interfaces:**
- Consumes: `baueSituation`, `ungedeckterBedarf`, `raumFehlt` (A4); `waehleKette`, `traegtWissensart` (A6).
- Produces: `MatchHead.pflichtangaben?: Situation['pflichtangaben']`; `PhaseMatchResult.ausgeschlossen.rahmen[].merkmal?: string`; `AblaufMatchResult.offenGruende?: Array<{ schritt: string; grund: string }>`.

- [ ] **Step 1:** Tests:

```ts
it('Hörsaal: kein Schritt trägt eine Methode mit Stellfläche', () => {});   // uses methods given raumbedarf in a test fixture
it('Bewegungskette: jeder Haupt- und Sicherungsschritt trägt Psychomotorik', () => {});
it('widersprüchliche Situation liefert eine Antwort mit Grund statt einer Ausnahme', () => {
  const r = M.zuordnen({ text: 'Handstand üben, 45 Minuten', raum: 'klassenraum', raumBietet: [], zielart: 'bewegung' });
  expect(r.modus).toBe('ablauf');
  expect((r as AblaufMatchResult).offenGruende?.length).toBeGreaterThan(0);
});
it('ohne Raumangabe steht der angenommene Raum unter pflichtangaben.angenommen', () => {});
it('eine genannte Methode, die die Wissensart des Schritts nicht trägt, bleibt als Zusatzphase im Ablauf', () => {});
```

  Die Fixture für Raumbedarf legt für eine Handvoll Methoden Werte fest (`kugellager`, `fishbowl`: `stellflaeche`; `abrufquiz`: `schreibplatz`), solange Tor D1 offen ist.
- [ ] **Step 2:** FAIL prüfen.
- [ ] **Step 3:** Umsetzen:
  - `rahmen(b, a)` ruft `ungedeckterBedarf` und liefert weiter den Text; der Aufrufer in `phase()` trägt zusätzlich `merkmal` ein.
  - Die Rangstufe „Raum“ in `rankOf` (heute `b.lernort` ohne Klassenraum) wird `raumFehlt(b, situation).length ? 1 : 0`.
  - `candidates()` und die Ausweichliste in `ablauf()` nehmen für Schritte mit `wissensart` nur Methoden, für die `traegtWissensart` wahr ist. Bleibt ein Schritt offen, steht in `offenGruende` der Satz „Keine Methode im Katalog liefert ‚{Lernstand}‘ für {Wissensart} unter diesen Rahmenbedingungen.“
  - Die Kettenwahl in `planen()` (Filter auf `k.zielart`, Tabelle `byAnsatz`, Sportfall) wird `waehleKette`. Fach Sport ohne Zielart und ohne genannten Klassenraum nimmt `bewegung` an und trägt es unter `angenommen` ein. Ohne jede Zielart: `konzepte` angenommen.
  - `setRoom` setzt `currentLernort` aus `situation.raum`; `currentPraxis` bleibt vorerst.
  - Die Sonderregeln bleiben in diesem Task noch stehen.
- [ ] **Step 4:** `core.test.ts`, `golden.test.ts`, `ausgang.test.ts`, `qualitaet.test.ts`. PASS erwartet. Verschlechtert sich ein Ausgangsfall, Ursache im Bericht festhalten und beheben, bevor es weitergeht.
- [ ] **Step 5:** Commit.

### Task A9: Daten der Durchsicht 1 übernehmen (nach Tor D1)

**Files:**
- Create: `packages/fmt-core/scripts/uebernehme-durchsicht.ts`, `packages/fmt-core/test/fmt2-daten.test.ts`
- Modify: `data/bausteine/*.json`, `data/vocab.json` (Schema `lernort` entfernen), `data/meta.json` und `package.json` (Version `2.0.0`), `packages/fmt-core/scripts/build-artefacts.ts` (`VOCAB_PROPS`, JSON-Schema, Kontext), `packages/fmt-core/src/types.ts`

**Interfaces:**
- Produces: `tsx packages/fmt-core/scripts/uebernehme-durchsicht.ts <csv>`; liest die geprüfte CSV (Spalte `entscheidung` überschreibt den Vorschlag), schreibt je Methode `raumbedarf`, `fachausstattungArt`, `schriftbedarf`, `termineMin`, die Wissensart in `aufgabe`, das bereinigte `fachbereichUngeeignet`, benennt `raum` in `raumhinweis` um und entfernt `lernort`. Wiederholbar ohne weitere Änderung.

- [ ] **Step 1:** Test `fmt2-daten.test.ts`:

```ts
it('keine Methode trägt mehr lernort oder das Freitextfeld raum', () => {});
it('raumbedarf, schriftbedarf und fachausstattungArt nutzen nur Werte der Vokabulare', () => {});
it('fachausstattungArt steht nur bei Methoden mit raumbedarf fachausstattung', () => {});
it('jede Methode trägt mindestens eine Wissensart in D1', () => {});
it('wer schreibt, braucht in keinem Fall einen Raum ohne Schreibplatz als einzigen bisherigen Lernort', () => {}); // plausibility: lists offenders
```

- [ ] **Step 2:** FAIL prüfen. **Step 3:** Skript schreiben und laufen lassen. Alle Stellen, die `b.lernort` oder `b.raum` lesen, auf `raumbedarf` und `raumhinweis` umstellen (`zuordnung.ts`, `scenarioModel.ts`, `MethodDetailPage.tsx`, `SystematikPage.tsx`, Tests). Die Fixture aus Task A8 entfällt.
- [ ] **Step 4:** Ganze Suite `npm test`. Die Markierung „Tor D1“ an n01 bis n06 entfernen. `npm run qualitaet`.
- [ ] **Step 5:** Commit „FMT 2.0: Raumbedarf, Schriftbedarf und Wissensart nach Durchsicht übernommen“.

### Task A10: Sonderregeln abbauen (nach Task A9)

**Files:**
- Modify: `packages/fmt-core/src/zuordnung.ts`, `packages/fmt-core/src/ranking.ts`, `packages/fmt-core/test/qualitaet/pruefen.ts`, `packages/fmt-core/test/ranking.test.ts`

Je Zeile ein eigener Commit. Vor und nach jeder Zeile laufen `ausgang.test.ts` und `qualitaet.test.ts`. Verschlechtert sich ein Fall, bleibt die Sonderregel stehen; die Zeile kommt mit Fall und Ursache in `docs/qualitaet/2026-11-27-fmt2-abbau.md` und in die Nachricht an Jan.

| Nr. | Sonderregel (Stand `1d61ef9`) | Ersatz |
|---|---|---|
| 1 | `fitsRoom`, `MOVES_AROUND`, `OUTSIDE` | `raumFehlt` |
| 2 | `praxisFremd` in `rankOf` und die Gewichte `praxisFremdHaupt`, `praxisFremdRand` in `ranking.ts` | Bindung und Raumbedarf |
| 3 | `isPraxisMethod` in `zuordnung.ts` und `istPraxismethode` in `pruefen.ts` | die Prüfung `praxis` liest Wissensart Psychomotorik oder `enaktiv` |
| 4 | `offPractice` in `candidates()` | Bindung gilt für Hauptschritte; für den Einstieg `raumFehlt` |
| 5 | `GESTALTUNG`, `currentGestaltung`, die Leihe in `areaFits` (Tanz) | Zielart und Raumbedarf entscheiden; das Fach ordnet nur |
| 6 | praktischer Prüfschritt: Block „A requested check in a practice lesson“ in `ablauf()` und die Stufe `pruefung` | Regel „Nachweis passt zum Ziel“: Im Prüfschritt stehen Methoden vorn, deren `nachweisformen` die Form aus `a.nachweis` oder aus `zielart.nachweis` enthalten; die Mindestzeit kommt von der ersten solchen Methode |
| 7 | Rangstufe für `fachbereichUngeeignet` in `rankOf` | Einträge ohne Sport zählen bis Paket B weiter in dieser Stufe; danach als Warnung (Task B3) |
| 8 | `currentPraxis` und `setRoom` | `situation` |
| 9 | Filter `roomOnly` für genannte Methoden | `ungedeckterBedarf`; eine genannte Methode mit ungedecktem Raumbedarf steht unter `nichtVerankert` mit dem Merkmal |
| 10 | Sonderfall `kondition-training` ohne Fach in `planen()` | Zielart `kondition` nimmt bei fehlendem Fach den Fachbereich Sport an und nennt es |

- [ ] **Step 1 bis 10:** je Zeile: entfernen, Tests laufen lassen, committen oder zurücknehmen und dokumentieren.
- [ ] **Step 11:** Neues Anfragefeld `nachweis` (Code `nachweisform`) in `FIELDS`, Leseregeln „mündliche Prüfung“, „praktische Prüfung“, „Klausur“ (schriftlich), „Produkt abgeben“, Test für n18.
- [ ] **Step 12:** `npm run qualitaet`, Bericht nach `docs/qualitaet/2026-11-27-fmt2-paket-a.md` mit der Gegenüberstellung „mit und ohne Sonderregeln“ (Hypothese der FMT 2.0, Abschnitt „Offene Punkte“).

### Task A11: Schnittstellen für Paket A

**Files:**
- Modify: `apps/server/src/routes/api.ts` (`/api/v1/meta`, `/api/v1/methods`), `apps/server/src/mcp/server.ts`, `packages/fmt-core/src/suche.ts`, `packages/fmt-core/scripts/build-artefacts.ts`
- Test: `apps/server/test/api.test.ts`, `apps/server/test/mcp.test.ts`, `packages/fmt-core/test/artefacts.test.ts`

**Interfaces:**
- Produces: `/api/v1/meta` mit `wfelder`, `arten`, `merkmale`, `raumtypen`, `zielarten`. Suchkriterien `raumbedarf`, `schriftbedarf`, `ohneRaumbedarf` (Methoden, die keinen der Werte brauchen). MCP `match_scenario` und `build_scenario_plan` mit `raum`, `raumBietet`, `fachausstattungArt`, `ohneSchrift`, `termine`, `nachweis`, `zielart` (neun Werte); `lernort` bleibt als nicht dokumentierter Parameter. Ontologie, Kontext und JSON-Schema mit den neuen Eigenschaften und SKOS-Schemata.

- [ ] **Step 1:** Tests: `GET /api/v1/meta` nennt neun W-Felder und fünf Arten; `POST /api/v1/match` mit `lernort` antwortet 200; MCP-Schema von `match_scenario` enthält `raum` und nicht `lernort` in der Beschreibung; `ontologie.ttl` enthält `raumbedarf` als Eigenschaft und kein `lernort`; kompakte Antwort von `build_scenario_plan` enthält `pflichtangaben`.
- [ ] **Step 2 bis 5:** FAIL, umsetzen, PASS, Commit.

### Task A12: Oberfläche für Paket A

**Files:**
- Modify: `apps/web/src/pages/PlannerPage.tsx` (Schritt 1, Abschnitt Rahmenbedingungen), `apps/web/src/pages/SystematikPage.tsx`, `MethodDetailPage.tsx`, `CatalogPage.tsx`, `apps/web/src/planner/scenarioStorage.ts`
- Test: `apps/web/test/planner-page.test.tsx`, `components.test.tsx`, `cache-and-catalog.test.ts`

Festlegungen:

- Schritt 1: Feld „Raum“ ohne Vorauswahl mit den Raumtypen als Klartext („Klassen- oder Seminarraum“, „Sporthalle, Sportplatz“ …). Nach der Wahl erscheinen die Eigenschaften als ankreuzbare Liste („Schreibplätze“, „freie Fläche zum Stehen und Gehen“, „große Fläche zum Laufen und Spielen“, „Wand oder Tafel“, „draußen“, „Fachausstattung“); Abwählen setzt `raumBietet`. Zwei Kästchen „Die Lernenden können noch nicht lesen“ und „… noch nicht schreiben“. Feld „Termine“.
- Schritt 2: Über dem Ablauf steht, was angenommen wurde („Raum nicht angegeben: Klassenraum angenommen“), mit einem Link zurück zu Schritt 1. Offene Schritte zeigen ihren Grund.
- Systematik: Abschnitt „Ergänzende Merkmale neben den 13 Facetten“ wird „Das W-Raster: neun Fragen, fünf Arten von Aussagen“, gefüllt aus `bundle.wfelder`, `bundle.arten`, `bundle.merkmale`; Tabelle der Raumtypen; Tabelle der Zielarten mit Ketten und Wissensart je Schritt. Überschrift „11 Lernzustände“ auf zwölf berichtigen.
- Methodendetail: Abschnitt „Was die Methode braucht“ (Bedarf nach W-Feld) mit Raumbedarf, Schriftbedarf, Terminen; `raumhinweis` als Text. Katalog: Filter „Raum“ (zeigt Methoden, die im gewählten Raumtyp gehen) und „ohne Lesen und Schreiben“.
- Gespeicherte Szenarien mit `lernort` laden weiter (Umsetzung beim Laden).

- [ ] **Step 1:** Tests je Punkt (Raum ohne Vorauswahl; Abwählen einer Eigenschaft setzt `raumBietet`; Angenommenes sichtbar; Systematik zeigt neun W-Felder; gespeichertes Szenario mit `lernort` lädt).
- [ ] **Step 2 bis 4:** FAIL, umsetzen, PASS.
- [ ] **Step 5:** App starten, Schritt 1 und 2 mit „Ethik Klasse 10, Sterbehilfe, Hörsaal mit fester Bestuhlung, 30 Lernende“ durchgehen, Bildschirmfotos nach `/mnt/project-files/fmt2/bilder/`. Commit.
- [ ] **Step 6:** Ganze Suite, Review nach `superpowers:requesting-code-review`, Jan um Push-Freigabe für PR A bitten.

---

# Paket B: Regeln und Pflichtangaben (PR B)

### Task B1: Regelsatz als Daten und Regelmaschine

**Files:**
- Create: `data/regeln.json`, `packages/fmt-core/src/regeln.ts`, `packages/fmt-core/test/regeln.test.ts`
- Modify: `packages/fmt-core/src/types.ts`, `load-data.ts`, `index.ts`, `build-artefacts.ts`

**Interfaces:**
- Produces:

```ts
export type ListenVergleich = { enthaelt?: string[]; nur?: string[]; ohne?: string[] };
export interface Passungsregel {
  id: string;
  name: string;
  wfelder: string[];
  art: 'deklarativ' | 'eingebaut';
  wenn?: { methode?: Record<string, ListenVergleich>; situation?: Record<string, string[]> };
  wirkung: Wirkung;
  grundlage: Grundlage;
  quelle?: string;
  /** Plain German sentence shown to the teacher; {methode} is replaced by the method name. */
  text: string;
  ersetzt?: string;
}
export interface Regelmeldung { regel: string; wirkung: Wirkung; grundlage: Grundlage; quelle?: string; text: string; baustein?: string }
export interface RegelSituation { vorwissen?: string; bildungsstufe?: string; komplexitaet?: string; sprachniveau?: string; fachbereich?: string }
export function erstelleRegeln(regeln: Passungsregel[]): {
  /** Declarative rules and suitability entries of the method that fire in this situation. */
  pruefe(b: Baustein, s: RegelSituation): Regelmeldung[];
  regel(id: string): Passungsregel | undefined;
  alle(): Passungsregel[];
};
```

`FmtData.regeln: Passungsregel[]`, im Bundle ebenso.

Regeln in `data/regeln.json` (Kennungen und Quellen wörtlich aus `fmt2-regelsatz.json` → `regeln`):

| Kennung | Art | `wenn.methode` | `wenn.situation` | Wirkung | Grundlage |
|---|---|---|---|---|---|
| `bedarf-gedeckt` | eingebaut | – | – | schliesst-aus | formal |
| `zielart-bindung` | eingebaut | – | – | schliesst-aus | S |
| `wenig-anleitung-geringes-vorwissen` | deklarativ | `anleitung: { nur: ['offen'] }`, `sequenz: { ohne: ['problem-vor-instruktion'] }` | `vorwissen: ['gering']` | warnt | E |
| `viel-anleitung-hohes-vorwissen` | deklarativ | `anleitung: { nur: ['explizit'] }` | `vorwissen: ['hoch']` | warnt | E |
| `entdecken-nur-mit-stuetze` | deklarativ | `anleitung: { nur: ['offen'] }`, `feedback: { ohne: ['fb-lehrkraft', 'peer', 'system', 'selbstkontrolle'] }`, `adaptivitaet: { nur: ['uniform'] }` | – | warnt | E |
| `problemloesen-vor-instruktion-primar` | deklarativ | `sequenz: { enthaelt: ['problem-vor-instruktion'] }` | `bildungsstufe: ['primar']` | warnt | E |
| `wenig-anleitung-komplexer-inhalt` | deklarativ | `anleitung: { nur: ['offen'] }` | `komplexitaet: ['hoch']`, `vorwissen: ['gering', 'mittel']` | warnt | E |
| `schrift-niedriges-sprachniveau` | deklarativ | `schriftbedarf: { enthaelt: ['liest', 'schreibt'] }` | `sprachniveau: ['a1', 'a2']` | warnt | E |
| `nachweis-passt-zum-ziel` | eingebaut | – | – | ordnet | S |
| `sicherheitshinweis` | eingebaut | – | – | weist-hin | A |
| `lehrkraft-nicht-doppelt` | eingebaut | – | – | schliesst-aus | S |
| `gruppierung-nur-mit-anpassung` | eingebaut | – | – | weist-hin | E |
| `leistungsschwache-nicht-unter-sich` | eingebaut | – | – | weist-hin | E |
| `genannter-wunsch-bleibt` | eingebaut | – | – | weist-hin | A |
| `begleitziel-braucht-termine` | eingebaut | – | – | weist-hin | E |
| `evidenz-geltung` | eingebaut | – | – | warnt | A |

Fehlt in einer Regel mit mehreren Situationsfeldern eine Angabe, feuert die Regel nicht. Eignungseinträge der Methode (`ungeeignetBeiStufe`, `ungeeignetBeiVorwissen`, `fachbereichUngeeignet`) liefert `pruefe` als Meldungen mit den Kennungen `eignung-stufe`, `eignung-vorwissen`, `eignung-fach`, Wirkung `warnt`, Grundlage und Quelle aus `eignungsgrund`; fehlt der Grund, Grundlage `A` und der Zusatz „(Setzung der Redaktion)“.

- [ ] **Step 1:** Tests:

```ts
it('offene Methode bei geringem Vorwissen warnt mit Quelle', () => {
  const m = R.pruefe({ ...b, anleitung: ['offen'], sequenz: ['instruktion-vor-problem'] }, { vorwissen: 'gering' });
  expect(m).toEqual([expect.objectContaining({ regel: 'wenig-anleitung-geringes-vorwissen', wirkung: 'warnt', grundlage: 'E', quelle: expect.stringContaining('Tetzlaff') })]);
});
it('Ausnahme: Problemlösen vor Instruktion löst die Vorwissensregel nicht aus', () => {});
it('offen neben geleitet warnt nicht', () => {});
it('komplexer Inhalt ohne Angabe zum Vorwissen feuert nicht', () => {});
it('Eignung ohne Grund heißt Setzung der Redaktion; mit Grund nennt sie die Quelle', () => {});
it('jede Regel der Datei hat Wirkung, Grundlage und Text; jede Regel mit Grundlage E nennt eine Quelle', () => {});
```

- [ ] **Step 2 bis 5:** FAIL, umsetzen, PASS, Commit.

### Task B2: Neue Angaben der Situation für Regeln

**Files:**
- Modify: `data/vocab.json` (Schemata `komplexitaet`: `gering`, `mittel`, `hoch`; `sprachniveau`: `a1` bis `c2`), `packages/fmt-core/src/zuordnung.ts` (`FIELDS`, `RULES`), `golden-szenarien.ts`

**Interfaces:**
- Produces: Anfragefelder `komplexitaet`, `sprachniveau`, `lehrende` (Zahl), `thema` (Text), `einheit` (Text), `bewertet` (ja/nein).

Leseregeln: „komplexer Inhalt“, „anspruchsvolles Thema“, „viele Zusammenhänge“ → `komplexitaet: 'hoch'`; „Niveau A2“, „DaZ A1“, „Sprachniveau B1“ → `sprachniveau` (nur wenn die Angabe für die ganze Gruppe gilt, nicht nach „davon“, „Teilgruppe“, einer Zahl von Lernenden); „zwei Lehrkräfte“, „Teamteaching“, „mit Begleitperson“ → `lehrende: 2`; „Lernfeld 3“, „Unterrichtsreihe zu …“, „im Modul …“ → `einheit`; „benotet“, „bewertet“ → `bewertet: true`.

- [ ] **Step 1 bis 5:** Lesefälle (auch Gegenfall „4 Lernende DaZ Niveau A2“ setzt `sprachniveau` der Gruppe nicht), FAIL, umsetzen, PASS, Commit.

### Task B3: Pflichtangaben und Regelmeldungen in der Antwort

**Files:**
- Modify: `packages/fmt-core/src/zuordnung.ts` (`passung`, `describe`, `ablauf`, `zuordnen`, `withSafetyNote`, `withUnusualNote`), `packages/fmt-core/src/validate.ts` (`checkPre`, R-06), `packages/fmt-core/src/rules.ts` (R-06 Text), `packages/fmt-core/src/types.ts`
- Test: `core.test.ts`, `golden.test.ts`, `mentions.test.ts`

**Interfaces:**
- Consumes: `erstelleRegeln` (B1), `Situation.pflichtangaben` (A4).
- Produces: `MatchHead.regelmeldungen?: Regelmeldung[]`; `PhaseProposal.regelmeldungen?: Regelmeldung[]`. `warnungen: string[]` und `hinweise: string[]` bleiben und werden aus den Meldungen gefüllt (Text plus Quelle in Klammern). `createValidator(data)` nutzt dieselbe Regelmaschine für R-06; `RuleMeta` von R-06: `prueft: 'Eignung und Passung: Methode passt zu Vorwissen, Bildungsstufe und Inhalt'`.

- [ ] **Step 1:** Tests:

```ts
it('n17: Chemie Klasse 9 ohne Raum und Anzahl nennt beide Lücken und den angenommenen Raum', () => {
  const r = M.zuordnen({ text: 'Chemie Klasse 9, Säuren und Basen, 45 Minuten' });
  expect(r.pflichtangaben!.fehlt).toEqual(expect.arrayContaining(['anzahl', 'raum']));
  expect(r.pflichtangaben!.angenommen.map((x) => x.feld)).toContain('raum');
});
it('jede Warnung im Ablauf steht als Regelmeldung mit Regel und Grundlage', () => {});
it('Sicherheitshinweis und Hinweis „unüblich“ stehen als Regelmeldungen sicherheitshinweis und genannter-wunsch-bleibt', () => {});
it('n20: offene Methoden tragen bei komplexem Inhalt und geringem Vorwissen die Warnung, angeleitete stehen vorn', () => {});
it('ein begründeter Eintrag „ungeeignet im Fach“ warnt und steht in der Rangstufe der Warnungen', () => {});
```

- [ ] **Step 2:** FAIL prüfen.
- [ ] **Step 3:** Umsetzen. `passung()` ruft `regeln.pruefe`. `geeignetBeiVorwissen` wird nicht mehr gelesen (die Regeln ersetzen es; die Daten folgen in Task B6). `hasSekHochschuleOnlyEvidence` wird die eingebaute Regel `evidenz-geltung`. Die eigene Rangstufe für `fachbereichUngeeignet` entfällt (Abbau Nr. 7 aus Task A10).
- [ ] **Step 4:** PASS; `ausgang.test.ts` und `qualitaet.test.ts`. **Step 5:** Commit.

### Task B4: Schnittstellen und Anzeige für Paket B

**Files:**
- Modify: `apps/server/src/routes/api.ts`, `apps/server/src/mcp/server.ts`, `apps/web/src/pages/PlannerPage.tsx`, `apps/web/src/pages/SystematikPage.tsx`, `apps/web/src/components/VerlaufsplanView.tsx`
- Test: `apps/server/test/api.test.ts`, `mcp.test.ts`, `apps/web/test/planner-page.test.tsx`

Festlegungen:

- `/api/v1/meta` führt `regeln`. `build_scenario_plan` (kompakt) nennt `pflichtangaben` und je Regelmeldung Regel, Wirkung, Grundlage, Quelle, Text. `list_vocabularies` führt Regeln, Raumtypen, Zielarten.
- Schritt 1: Nach „Ablauf vorschlagen“ steht unter dem Textfeld eine Zeile „Verstanden: Ethik · Klasse 10 · 30 Lernende · Hörsaal“ und „Fehlt noch: Zeit“. Jede fehlende Angabe ist direkt daneben ergänzbar. Nichts ist vorbelegt; der Ablauf entsteht auch mit Lücken.
- Schritt 2: je Warnung der Satz, darunter klein „Regel: … · Grundlage: belegt (Quelle)“ oder „Setzung“. Über dem Ablauf „Ablauf stimmig“ statt einer Wertung; nirgends „gut“ oder „empfohlen“.
- Systematik: Abschnitt „Passungsregeln“ aus `bundle.regeln` neben den 13 Kompositionsregeln; Tabelle „Welche Wirkung hat welche Art“.

- [ ] **Step 1 bis 5:** Tests, FAIL, umsetzen, PASS, Bildschirmfotos, Commit.

### Task B5: Datenvorschlag 2 erzeugen und prüfen lassen (Tor D2)

**Files:**
- Create: `packages/fmt-core/scripts/vorschlag-fmt2-eignung.ts`, `/mnt/project-files/fmt2/durchsicht-2-eignung.md`

Inhalt des Vorschlags, je Teil eine Tabelle:

1. **Regel-Treffer-Bericht:** je deklarativer Regel die Zahl und die Namen der getroffenen Methoden; dazu die Verteilung von `nachweisformen` über die Prüfmethoden. Zweck: Der Prüfer und später Jan sehen, ob die Lesart („nur offen“) trifft, was gemeint ist.
2. **28 Einträge `geeignetBeiVorwissen`:** je Methode, was die Regeln sagen. Stimmen Regel und Eintrag überein: Eintrag entfällt. Weichen sie ab: Vorschlag „entfällt“ oder „bleibt als `ungeeignetBeiVorwissen` mit Grund“; ein Eintrag bleibt nur mit Beleg.
3. **47 Einträge `ungeeignetBeiStufe`:** gedeckt durch `problemloesen-vor-instruktion-primar` (entfällt) oder nicht (Vorschlag für `eignungsgrund.stufe` mit Grundlage, sonst „Setzung“ oder streichen).
4. **Verbleibende Einträge `fachbereichUngeeignet`:** je Eintrag ein Vorschlag für `eignungsgrund.fachbereich` oder „streichen“.
5. **Fünf Kandidaten für Eintragsart Hilfe** (`scaffolding-hilfen`, `woerterwiese`, `flipped`, `freie-internetrecherche`, `ki-chat`) mit Empfehlung je Eintrag. `flipped`, `freie-internetrecherche` und `ki-chat` haben keine Nachbedingung; Vorschlag dort: Nachbedingung ergänzen oder Hilfe.
6. **B3 „nur uniform“ (153 Methoden):** nur die Methoden, deren `variante` oder Durchführung eine Anpassung nennt, mit Vorschlag für B3.
7. **Zuordnung der Matrix-Merkmale zu Tausch oder Hilfe** (aus Task C1).

- [ ] **Step 1:** Skript und Dokument erzeugen. **Step 2:** Prüfung nach dem Ablauf im Abschnitt „Tore“, Ergebnis nach `pruefung/tor-D2.md`. **Step 3:** Commit des Skripts.

### Task B6: Daten der Durchsicht 2 übernehmen (nach Tor D2)

**Files:**
- Modify: `data/bausteine/*.json`, `packages/fmt-core/test/fmt2-daten.test.ts`, `stufe2.test.ts`, `abschlussaudit.test.ts`

- [ ] **Step 1:** Tests ergänzen: keine Methode trägt `geeignetBeiVorwissen`; jeder Eintrag in `fachbereichUngeeignet` und `ungeeignetBeiVorwissen` hat einen `eignungsgrund`; jede `eintragsart: 'hilfe'` hat keine Nachbedingung.
- [ ] **Step 2 bis 5:** FAIL, Daten übernehmen, PASS, ganze Suite, Commit. Review, Jan um Push-Freigabe für PR B bitten.

---

# Paket C: Teilgruppen (PR C)

### Task C1: Tabelle „Tausch oder Hilfe“ als Daten

**Files:**
- Create: `data/teilgruppen.json` (die Zuordnung zu Matrix-Kennungen geht mit Tor D2 in die Prüfung), `packages/fmt-core/test/teilgruppen-daten.test.ts`
- Modify: `packages/fmt-core/src/types.ts`, `load-data.ts`

**Interfaces:**
- Produces:

```ts
export type Richtung = 'mehr-anleitung' | 'weniger-anleitung' | 'explizit-mit-strategie' | 'ohne-lesen' | 'ohne-schreiben' | 'ohne-bewegung';
export interface MerkmalAntwort {
  id: string;                         // id from the papers, e.g. 'vorwissen-gering'
  /** Matrix value ids (Ausprägungen) this row covers. */
  auspraegungen: string[];
  antwort: 'tausch' | 'hilfe';
  richtung?: Richtung;
  wohin: string;
  grundlage: Grundlage;
  quelle?: string;
}
export interface TeilgruppenRegelsatz {
  merkmale: MerkmalAntwort[];
  /** Answer for matrix values no row names. */
  sonst: { antwort: 'hilfe'; grundlage: 'U'; wohin: string };
  /** Matrix category ids that never trigger anything. */
  gesperrt: string[];
  gesperrtText: string;
  /** When a support is withdrawn, by measure area id of the matrix ('unterstuetzung', 'lernmaterialien', …) plus 'sonst'. */
  abbau: Record<string, string>;
}
```

`FmtData.teilgruppen: TeilgruppenRegelsatz`.

Zuordnung (Vorschlag, geht mit Tor D2 in die Prüfung):

| `id` | `auspraegungen` | Antwort, Richtung | Grundlage, Quelle |
|---|---|---|---|
| `vorwissen-gering` | `vorwissen-gering`, `leistungsniveau-gering` | Tausch, `mehr-anleitung` | E; Tetzlaff et al. 2025; Alfieri et al. 2011 |
| `vorwissen-hoch` | `vorwissen-hoch`, `leistungsniveau-hoch` | Tausch, `weniger-anleitung` | E; Tetzlaff et al. 2025; Steenbergen-Hu et al. 2016 |
| `lernschwierigkeiten` | `foerderbedarf-lernen-leicht`, `foerderbedarf-lernen-umfassend` | Tausch, `explizit-mit-strategie` | E, Übertragung A; Swanson & Hoskyn 1998; KMK 2011 |
| `sprachstand` | `sprachkompetenz-gering`, `sprachkompetenz-mittel`, `ausdrucksfaehigkeit-eingeschraenkt`, `foerderbedarf-sprache-gelegentlich`, `foerderbedarf-sprache-erheblich`, `kultureller-hintergrund-neu` | Hilfe | E; Höfler et al. 2024 |
| `sehen-hoeren` | `foerderbedarf-sehen-leicht`, `foerderbedarf-sehen-deutlich`, `foerderbedarf-hoeren-beeintraechtigung`, `foerderbedarf-hoeren-taub` | Hilfe | E; KMK 2011 |
| `arbeitsgedaechtnis` | `denkverarbeitung-langsam` | Hilfe | S; Melby-Lervåg et al. 2016 |
| `motivation-interesse` | `interessen-desinteresse`, `interessen-situativ`, `engagement-gering`, `relevanz-gering`, `werte-vermeidung`, `selbstwirksamkeit-gering` | Hilfe | E; Patall et al. 2008 |
| `emotional-sozial` | alle Ausprägungen der Oberkategorie `sozial-emotional` mit Unterstützungsbedarf, `foerderbedarf-emotional-sozial-gelegentlich`, `-deutlich` | Hilfe | U |
| `selbstregulation-gering` | `metakognitive-gering`, `lernstrategien-kaum` | Hilfe | U |
| `kann-sich-nicht-frei-bewegen` | `foerderbedarf-koerperlich-deutlich` | Tausch, `ohne-bewegung` | formal |

`gesperrt`: `['sensorische']`. `gesperrtText`: „Lerntypen und Lernstile sind als Grundlage der Methodenwahl nicht belegt (Pashler et al. 2008; Rogowsky et al. 2015). Das Merkmal wird nicht ausgewertet.“ „Leistungsniveau als Näherung für Vorwissen“ ist eine Setzung und steht so in der Durchsicht. `kann-nicht-lesen` und `kann-nicht-schreiben` sind keine Matrix-Werte; sie kommen als Angabe der Teilgruppe (Task C2).

`abbau` (Vorschlag): `unterstuetzung`: „Entfällt, sobald die Gruppe die Aufgabe zweimal ohne die Stütze löst; vorher schrittweise zurücknehmen.“ `lernmaterialien`: „Entfällt, wenn das Standardmaterial verstanden wird.“ `aufgaben`: „Entfällt, wenn die Regelaufgabe gelingt.“ `lernzeit`: „Entfällt, wenn die Gruppe im Zeitrahmen der Klasse fertig wird.“ `sonst`: „Regelmäßig prüfen, ob die Hilfe noch nötig ist, und sie dann zurücknehmen.“

- [ ] **Step 1:** Test: jede `auspraegung` existiert in `DIFF_MATRIX_VARIABLES`; keine steht in zwei Zeilen; jede gesperrte Kategorie existiert; jede Zeile mit `tausch` nennt eine `richtung`.
- [ ] **Step 2 bis 5:** FAIL, Datei anlegen, PASS, Commit.

### Task C2: Antwort je Teilgruppe und Gleichwertigkeit

**Files:**
- Create: `packages/fmt-core/src/teilgruppen.ts`, `packages/fmt-core/test/teilgruppen.test.ts`
- Modify: `packages/fmt-core/src/index.ts`

**Interfaces:**
- Consumes: `TeilgruppenRegelsatz` (C1), `erstelleRegeln` (B1), `ungedeckterBedarf`, `baueSituation` (A4), `traegtWissensart`, `wissensartenVon` (A6).
- Produces:

```ts
export interface TeilgruppenProfil {
  id: string;
  label: string;
  /** Matrix values of the group (category id → value id). */
  selectedValues: Record<string, string>;
  ohneSchrift?: Array<'lesen' | 'schreiben'>;
  ohneBewegung?: boolean;
}
export interface TeilgruppenEntscheidung {
  antwort: 'passt' | 'hilfe' | 'tausch';
  /** Row of the table that decided; undefined for 'passt'. */
  merkmal?: string;
  richtung?: Richtung;
  grund: string;                       // plain German, names the trait and the source
  grundlage?: Grundlage;
  quelle?: string;
  /** Traits on the blocklist the group named. */
  gesperrt: string[];
}
export function bereinigeProfil(p: TeilgruppenProfil, t: TeilgruppenRegelsatz): { profil: TeilgruppenProfil; gesperrt: string[] };
export function entscheideTeilgruppe(geplant: Baustein, p: TeilgruppenProfil, t: TeilgruppenRegelsatz): TeilgruppenEntscheidung;
export interface Gleichwertigkeit { ok: boolean; gruende: string[] }
export function istGleichwertig(
  kandidat: Baustein,
  geplant: Baustein,
  ctx: { schritt?: Pick<KettenSchritt, 'ziel' | 'rolle' | 'wissensart'>; anfrage: MatchRequest; situation: Situation; dauerMin?: number; profil: TeilgruppenProfil; lehrende?: number; data: Pick<FmtData, 'schemes'>; regeln: ReturnType<typeof erstelleRegeln> }
): Gleichwertigkeit;
export function erfuelltRichtung(b: Baustein, r: Richtung): boolean;
```

Entscheidung, in dieser Reihenfolge:

1. Gesperrte Kategorien aus `selectedValues` entfernen und merken.
2. Formal: `ohneSchrift` trifft den `schriftbedarf` der Methode, oder `ohneBewegung` (auch aus `foerderbedarf-koerperlich-deutlich`) trifft `stellflaeche` oder `bewegungsflaeche` → `tausch`, Grundlage `formal`.
3. Zeilen mit `tausch`, deren Ausprägung die Gruppe trägt: Löst die Methode den Anlass aus (`mehr-anleitung`: B1 enthält weder `explizit` noch `geleitet`; `weniger-anleitung`: B1 ist nur `explizit`; `explizit-mit-strategie`: B1 enthält `explizit` nicht) und ist B3 nur `uniform` → `tausch`. Löst sie den Anlass aus und lässt Anpassung zu (B3 nicht nur `uniform`) → `hilfe` mit dem Grund „Die Methode lässt sich anpassen“.
4. Sonst: Trägt die Gruppe irgendeine Ausprägung mit Unterstützungsbedarf (eine Zeile mit `hilfe` oder `sonst`) → `hilfe`. Das gilt auch, wenn B3 der Methode nur `uniform` ist: Eine Hilfe wird an die Methode angelegt (Material, Stütze, Zeit) und ändert die Methode nicht; B3 entscheidet nur bei `tausch`-Zeilen zwischen Tausch und Hilfe (Fall n08: DaZ A2 bekommt Hilfen, keinen Tausch).

Der Weg vom Merkmal zur Regel ist das Feld `richtung` der `tausch`-Zeile; einen anderen gibt es nicht. Jede Matrix-Ausprägung, die `teilgruppen.json` nicht nennt, fällt unter `sonst` (Hilfe, Grundlage U). `kann-nicht-lesen`, `kann-nicht-schreiben` und `kann-sich-nicht-bewegen` stehen nicht in der Matrix; sie sind Angaben der Teilgruppe und führen über den formalen Bedarf zum Tausch.
5. Sonst `passt`.

`erfuelltRichtung`: `mehr-anleitung`: B1 enthält `explizit` oder `geleitet`; `weniger-anleitung`: B1 enthält `offen` oder `geleitet`; `explizit-mit-strategie`: B1 enthält `explizit`; `ohne-lesen`, `ohne-schreiben`: Schriftbedarf ohne den Wert; `ohne-bewegung`: Raumbedarf ohne `stellflaeche` und `bewegungsflaeche`.

Gleichwertigkeit, alle vier Bedingungen, jede mit eigenem Grundtext:

1. Gleicher Lernstand für dieselbe Wissensart: Die Hülle der Nachbedingung des Kandidaten enthält das Ziel des Schritts (ohne Schritt: jede Nachbedingung der geplanten Methode), und die Wissensarten überschneiden sich (mit denen des Schritts, sonst der geplanten Methode).
2. Bedarf gedeckt: `ungedeckterBedarf(kandidat, anfrage, situation)` ist `null`, `raumFehlt` ist leer, `kandidat.dauerMin <= dauerMin`, und der Kandidat braucht nicht mehr Technik, Internet oder KI als die geplante Methode (bisherige Regel `staysWithinFrame`).
3. Passt zur Teilgruppe: kein formaler Ausschluss aus dem Profil; `regeln.pruefe` liefert für die Situation der Teilgruppe (Vorwissen aus dem Profil) keine Warnung.
4. Nebeneinander führbar: Nicht beide Methoden binden die Lehrkraft (`steuerung.organisation === 'lehrkraft'` oder `rolle` enthält `instrukteur`), außer `lehrende >= 2`.

- [ ] **Step 1:** Tests:

```ts
it('geringes Vorwissen und eine nur offene, uniforme Methode: Tausch mit Beleg Tetzlaff', () => {});
it('geringes Vorwissen und eine angeleitete Methode: passt oder Hilfe, kein Tausch', () => {});
it('geringes Vorwissen und eine offene Methode mit diff-prozess: Hilfe, weil die Methode sich anpassen lässt', () => {});
it('DaZ (sprachkompetenz-gering): Hilfe, nie Tausch', () => {});
it('nur sensorische-visuell: passt, gesperrt enthält sensorische', () => {
  const e = entscheideTeilgruppe(b, { id: 'g', label: 'visuelle Lerntypen', selectedValues: { sensorische: 'sensorische-visuell' } }, T);
  expect(e).toMatchObject({ antwort: 'passt', gesperrt: ['sensorische'] });
});
it('kann nicht lesen und Methode mit schriftbedarf liest: Tausch, Grundlage formal', () => {});
it('Ersatz mit anderem Lernstand ist nicht gleichwertig', () => {});
it('Ersatz, der im Raum der Stunde nicht geht, ist nicht gleichwertig', () => {});
it('zwei lehrkraftgebundene Methoden sind nicht nebeneinander führbar; mit zwei Lehrenden schon', () => {});
```

- [ ] **Step 2 bis 5:** FAIL, umsetzen, PASS, Commit.

### Task C3: Anpassungsvorschläge auf die neue Entscheidung umstellen

**Files:**
- Modify: `packages/fmt-core/src/methodAdjustments.ts`, `packages/fmt-core/src/adaptScenario.ts`, `packages/fmt-core/src/differentiationMatrix.ts` (`detectMatrixTraitsFromText`, `scoreDifferentiationMatrix`)
- Test: `packages/fmt-core/test/method-adjustments.test.ts`, `differentiation.test.ts`, `folgeschritte.test.ts`

**Interfaces:**
- Consumes: Task C2.
- Produces:
  - `MethodAdjustmentGroup` bekommt `ohneSchrift?`, `ohneBewegung?`. `MethodAdjustmentConstraints` bekommt `anfrage?: MatchRequest`, `lehrende?: number`.
  - `proposeMethodAdjustments(allBlocks, phases, groups, constraints, regelsatz: { teilgruppen: TeilgruppenRegelsatz; regeln: Passungsregel[]; schemes: Scheme[] })`. Ein Vorschlag entsteht nur bei `antwort === 'tausch'`. Kandidaten kommen weiter aus `suggestAlternativeMethodsForGroup`, gefiltert mit `erfuelltRichtung` und `istGleichwertig`. Die Schwellen `WEAK_FIT` und `MIN_GAIN` lösen keinen Tausch mehr aus; die Passung der Matrix ordnet nur noch unter gleichwertigen Kandidaten. `MethodAdjustment` bekommt `merkmal`, `grundlage`, `quelle`.
  - Neu: `proposeSupports(phases, groups, regelsatz): Array<{ stepKey: string; groupId: string; groupLabel: string; antwort: 'hilfe'; grund: string; grundlage?: Grundlage; quelle?: string; hilfen: Array<{ id: string; name: string; abbau: string }> }>`; die Hilfen sind die Maßnahmen, die `scoreDifferentiationMatrix` für die Gruppe als `kern` einstuft und die mit der Interaktion der Methode vereinbar sind (bisherige Prüfung `conflictsWithMethodInteraction`), höchstens drei je Phase.
  - Neu: `teilgruppenHinweise(phases, groups, adjustments, supports, regelsatz): Regelmeldung[]` für `gruppierung-nur-mit-anpassung` (Teilgruppe ohne Tausch und ohne Hilfe) und `leistungsschwache-nicht-unter-sich` (Gruppe mit `vorwissen-gering` oder `leistungsniveau-gering` in einer Methode mit `kleingruppe-kooperativ`).
  - `AdaptScenarioResult` bekommt je Teilgruppe und Phase `antwort`, `beleg`, `hilfen` mit `abbau`, dazu `gesperrt: Array<{ gruppe: string; text: string }>` und `regelmeldungen`.
  - Gesperrte Kategorien: `scoreDifferentiationMatrix` ignoriert sie; `detectMatrixTraitsFromText` meldet sie getrennt als `gesperrt`.

- [ ] **Step 1:** Tests, darunter die Fälle n07 bis n10 als Kerntests und:

```ts
it('n08: DaZ A2 in Biologie bekommt keine andere Methode, aber ein sprachliches Gerüst mit Abbau-Satz', () => {});
it('n09: „visuelle Lerntypen“ löst nichts aus und nennt den Grund', () => {});
it('Teilgruppe ohne Tausch und ohne Hilfe bekommt den Hinweis gruppierung-nur-mit-anpassung', () => {});
it('die Regelgruppe bleibt in jedem Fall unverändert', () => {});
```

- [ ] **Step 2:** FAIL. **Step 3:** Umsetzen; bestehende Tests, die einen Tausch allein wegen schwacher Matrix-Passung erwarten, an die neue Regel anpassen und die Änderung im Commit nennen. **Step 4:** PASS; ganze Kernsuite. **Step 5:** Commit.

### Task C4: Eintragsart Hilfe im Katalog und in der Zuordnung

**Files:**
- Modify: `packages/fmt-core/src/zuordnung.ts`, `suche.ts`, `mentions.ts`, `validate.ts`, `apps/web/src/pages/CatalogPage.tsx`, `MethodDetailPage.tsx`
- Test: `core.test.ts`, `mentions.test.ts`, `apps/web/test/cache-and-catalog.test.ts`

Festlegungen: Ein Eintrag mit `eintragsart: 'hilfe'` ist nie Kandidat für einen Kettenschritt, einen Slot oder eine Phase. Suchkriterium `eintragsart`; ohne Angabe liefert die Suche beide Arten, der Katalog zeigt einen Umschalter „Methoden / Hilfen“. Wird eine Hilfe im Text genannt, steht sie in der Antwort unter `hinweise` („‚Wortspeicher‘ ist eine Hilfe und wird in Schritt 3 den Phasen zugeordnet“) und in einem neuen Feld `genannteHilfen: string[]`; `nichtVerankert` nennt sie nicht. Der Prüfer meldet einen Einsatz einer Hilfe als Phase mit R-00.

- [ ] **Step 1:** Tests (Review Focus 5 als Test mit einer Fixture-Hilfe). **Step 2 bis 5:** FAIL, umsetzen, PASS, Commit.

### Task C5: Schnittstellen für Paket C

**Files:**
- Modify: `apps/server/src/routes/api.ts` (`/api/v1/adapt`, `/api/v1/differentiation/meta`), `apps/server/src/mcp/server.ts` (`adapt_scenario`, `list_differentiation_options`, `score_differentiation_matrix`, `search_methods`)
- Test: `apps/server/test/api.test.ts`, `mcp.test.ts`

Festlegungen: `adapt` nimmt je Gruppe `ohneSchrift` und `ohneBewegung` an und liefert die Felder aus Task C3. `list_differentiation_options` und `/differentiation/meta` führen gesperrte Kategorien nicht und nennen je Merkmal Tausch oder Hilfe mit Quelle. Ein gesperrter Wert in einer Anfrage ergibt keinen Fehler, sondern den Text unter `gesperrt`.

- [ ] **Step 1 bis 5:** Tests, FAIL, umsetzen, PASS, Commit.

### Task C6: Schritt 3 des Baukastens

**Files:**
- Modify: `apps/web/src/pages/PlannerPage.tsx` (Schritt 3), `apps/web/src/planner/differentiationFlow.ts`, `scenarioModel.ts` (`LearnerGroup`), `scenarioStorage.ts`, `apps/web/src/components/DifferentiationMatrixPanel.tsx`, `apps/web/src/pages/DifferentiationPage.tsx`
- Test: `apps/web/test/differentiation-flow.test.ts`, `differentiation.test.tsx`, `planner-page.test.tsx`

Festlegungen:

- Je Teilgruppe und Phase eine von drei Karten: „Passt so“; „Hilfe in dieser Methode“ mit bis zu drei Hilfen, dem Satz „Wann die Hilfe entfällt“ und dem Beleg; „Andere Methode für diese Gruppe“ mit Beleg und dem Knopf „Übernehmen“, wie bisher umkehrbar.
- Hilfe steht vor dem Tausch. Die Karte „Andere Methode“ erscheint nur bei `antwort === 'tausch'`.
- Je Teilgruppe zwei Kästchen „kann noch nicht lesen“, „kann noch nicht schreiben“ und eines „kann sich nicht frei bewegen“.
- Die Auswahl der Merkmale zeigt gesperrte Kategorien nicht. Ein gespeichertes Szenario mit einem gesperrten Wert lädt; der Wert wird beim Laden entfernt, und Schritt 3 zeigt einmal den Hinweistext.
- Hinweise `gruppierung-nur-mit-anpassung` und `leistungsschwache-nicht-unter-sich` stehen unter den Karten der Gruppe.
- Übernommene Hilfen gehen als Material in Schritt 4.

- [ ] **Step 1:** Tests je Punkt. **Step 2 bis 4:** FAIL, umsetzen, PASS. **Step 5:** App starten, n07 und n08 durchspielen, Bildschirmfotos. Commit.
- [ ] **Step 6:** Datenteil nach Tor D2 (Eintragsart Hilfe, B3) ist in Task B6 enthalten. Ganze Suite, Review, Jan um Push-Freigabe für PR C bitten.

---

# Paket D: Entwurf und Katalog (PR D)

### Task D1: Planungsprofile

**Files:**
- Create: `data/planungsprofile.json`, `packages/fmt-core/src/planungsprofil.ts`, `packages/fmt-core/test/planungsprofil.test.ts`
- Modify: `data/vocab.json` (Schema `planungsprofil`), `types.ts`, `load-data.ts`, `zuordnung.ts` (`FIELDS`)

**Interfaces:**
- Produces:

```ts
export interface Planungsprofil {
  id: 'schule' | 'berufsschule' | 'betrieb' | 'hochschule' | 'erwachsenenbildung';
  bildungsstufe: string[];
  einheit: string; groessereEinheit: string; dokument: string; lehrende: string; lernende: string;
  status: string;
  module: Array<{ id: string; name: string }>;
}
export interface Kernfeld { id: 'rahmendaten' | 'lernvoraussetzungen' | 'ziele' | 'einordnung' | 'verlauf' | 'lernerfolg' | 'reflexion'; name: string; wfelder: string[] }
export function waehlePlanungsprofil(profile: Planungsprofil[], a: { planungsprofil?: string; bildungsstufe?: string; text?: string }): { profil: Planungsprofil; angenommen: boolean };
```

Werte wörtlich aus `fmt2-regelsatz.json` → `planungsprofile` (Kernfelder und fünf Bereiche). Wahl: `planungsprofil` gewinnt; sonst `primar`, `sek1`, `sek2` → `schule`; `hochschule` → `hochschule`; `erwachsenenbildung` → `erwachsenenbildung`; `berufsbildung` → `betrieb`, wenn der Text „Betrieb“, „Unterweisung“, „Ausbilder“, „Ausbilderin“, „Lehrwerkstatt“ oder „am Arbeitsplatz“ nennt, sonst `berufsschule`. Ohne Bildungsstufe: `schule` mit `angenommen: true`.

- [ ] **Step 1:** Tests: je Zeile der Wahl ein Fall; n13 ergibt `berufsschule`, n14 `betrieb`, n15 `hochschule`, n16 `erwachsenenbildung`; jedes Profil nennt alle Begriffe. **Step 2 bis 5:** FAIL, umsetzen, PASS, Commit.

### Task D2: Entwurf mit sieben Kernfeldern und Begriffen des Profils

**Files:**
- Modify: `apps/web/src/planner/scenarioModel.ts` (`NeutralLearningScenario`, `buildNeutralLearningScenario`, `buildStructuredLessonText`), `apps/web/src/planner/lmsExport.ts`, `apps/web/src/components/VerlaufsplanView.tsx`, `apps/web/src/pages/PlannerPage.tsx` (Schritt 5), `apps/server/src/llm/briefings.ts`, `apps/server/src/routes/assistant.ts`, `apps/server/src/mcp/server.ts` (`build_scenario_plan`, `elaborate_scenario`)
- Test: `apps/web/test/planner.test.ts`, `apps/server/test/assistant.test.ts`, `mcp.test.ts`

Festlegungen:

- `NeutralLearningScenario` bekommt `planungsprofil`, `kernfelder` (sieben Einträge in fester Reihenfolge, jeder mit Titel und Inhalt) und `module` (zugeschaltete Module mit leerem Inhalt zum Ausfüllen).
- Herkunft je Kernfeld nach Design Abschnitt 8 und Fachkonzept: Rahmendaten aus den Pflichtangaben; Lernvoraussetzungen aus Vorwissen, Sprachniveau und Teilgruppen; Ziele aus Hauptziel und Begleitzielen; Einordnung aus `einheit`; Verlaufsplan aus dem methodischen Konzept mit den Anpassungen je Teilgruppe; Sicherung des Lernerfolgs aus dem Prüfschritt; Reflexion aus dem Abschlussschritt und den Hinweisen.
- Überschriften und Spaltennamen nutzen die Begriffe des Profils („Tätigkeit der Lehrkraft“ wird „Tätigkeit der Kursleitung“). Die Exporte folgen.
- Die drei Stellen mit der Vorgabe `'Sekundarstufe I'` (`briefings.ts` Zeile 378, `assistant.ts` Zeilen 675 und 847 im Stand `1d61ef9`) nutzen das Profil; ohne Bildungsstufe steht „Bildungsstufe nicht angegeben“.
- Leitplanken im Briefing für ein Sprachmodell, wörtlich: „Methoden, Reihenfolge und Kernkomponenten sind vorgegeben und werden nicht geändert. Aussagen zur Wirksamkeit stammen nur aus dem Katalog, mit Grad, Geltung und Bezug. Kennzeichne, was übernommen und was erzeugt ist. Beschreibe Gruppen, keine einzelnen Lernenden.“

- [ ] **Step 1:** Tests: Entwurf für n15 nutzt „Sitzung“, „Studierende“, „Modul“ und führt sieben Kernfelder; Entwurf ohne Bildungsstufe enthält nirgends „Sekundarstufe I“; Briefing enthält die vier Leitplanken. **Step 2 bis 5:** FAIL, umsetzen, PASS, Commit.

### Task D3: Begleitziele

**Files:**
- Modify: `data/vocab.json` (Schema `begleitziel`: `sprache`, `sozial`, `selbstregulation`), `packages/fmt-core/src/zuordnung.ts`, `ranking.ts`, `zielart.ts`, `types.ts`
- Test: `core.test.ts`, `ranking.test.ts`, `golden-szenarien.ts`

**Interfaces:**
- Produces: Anfragefeld `begleitziel` (Codes). `traegtBegleitziel(b: Baustein, ziel: string): boolean` in `zielart.ts`: `sozial`: C1 `kleingruppe-kooperativ` oder A3 `andere`; `selbstregulation`: D1 `metakognitiv` oder A1 `metakognition`; `sprache`: Schriftbedarf nicht leer oder C1 `partner`, `kleingruppe-kooperativ`, `plenum-lernendengeleitet`. `SoftScoreParts.begleitziel?: boolean` mit Gewicht `-0.5` (kleiner als `EQUIVALENCE_TOLERANCE` 0.75). `AblaufMatchResult.begleitstrang?: Array<{ begleitziel: string; baustein: string; name: string; dauerMin: number; position: 'ende'; grund: string }>`.

Festlegungen: Ein Begleitziel wählt nie die Kette. Der Begleitstrang ist ein Vorschlag zum Übernehmen und steht nicht im Ablauf: für `selbstregulation` und `sozial` die kürzeste Methode mit A1 `metakognition`, Nachbedingung `lernen-reflektiert`, `dauerMin <= 5`, die das Begleitziel trägt und deren Bedarf gedeckt ist; für `sprache` kein Strang, sondern der Hinweis auf Hilfen in Schritt 3. Die Regel `begleitziel-braucht-termine` feuert, wenn `termine` fehlt oder 1 ist, mit dem Text „Wirkungen auf {Begleitziel} sind für Programme über mehrere Wochen belegt. Eine einzelne Stunde genügt dafür nicht.“ Leseregeln: „Selbstregulation fördern“, „Lernen lernen“, „Lernstrategien“; „soziales Lernen“, „Zusammenarbeit stärken“, „Klassenklima“; „sprachsensibel“, „Fachsprache“, „Bildungssprache“.

- [ ] **Step 1:** Tests:

```ts
it('n11: mit und ohne Begleitziel dieselbe Kette und dieselben Hauptmethoden; mit Begleitziel ein Begleitstrang und der Hinweis', () => {});
it('n12: unter gleichwertigen Methoden steht eine kooperative vorn', () => {});
it('ein Begleitziel verdrängt keine Methode mit besserer Rangstufe', () => {});
```

- [ ] **Step 2 bis 5:** FAIL, umsetzen, PASS, Commit. Oberfläche: aufklappbares Feld „Was soll nebenbei gefördert werden?“ in Schritt 1; Begleitstrang als Vorschlagskarte in Schritt 2 und als Material in Schritt 4.

### Task D4: Lesarten der Lernstände und Evidenzbezug

**Files:**
- Modify: `data/vocab.json` (`lernzustand[].lesart`, `zielart[].lesart`), `packages/fmt-core/src/zielart.ts`, `types.ts` (`Evidenzaussage.evidenzBezug` um `'programm'`), `ranking.ts` (`rankingGrade`), `apps/web/src/pages/MethodDetailPage.tsx`, `SystematikPage.tsx`, `apps/web/src/components/VerlaufsplanView.tsx`
- Test: `zielart.test.ts`, `ranking.test.ts`, `apps/web/test/components.test.tsx`

**Interfaces:**
- Produces: `lesart(data: FmtData, zustand: string, zielart?: string): string`. Lesart je Zielart: `fakten`, `konzepte`, `prozeduren`, `problemloesen` → `wissen`; `bewegung`, `kondition`, `handlung` → `bewegung`; `urteilen` → `urteilen`; `gestalten` → `gestalten`. Texte wörtlich aus der Tabelle „Lesarten“ der FMT 2.0; ein Strich dort heißt: Label des Zustands. `fehlvorstellungen-sichtbar` liest sich in jeder Lesart als „Ausgangslage sichtbar“.
- `rankingGrade`: Grad A mit Bezug `programm` zählt wie B (wie `prinzip`).
- Anzeige: Evidenz mit „gilt der Methode“, „gilt dem Wirkprinzip“ oder „gilt ganzen Programmen, nicht der einzelnen Phase“. Für Methoden des Fachbereichs `aesthetik` der Satz „Begründet mit dem Eigenwert; ein Transfer auf andere Leistungen ist nicht belegt (Sala & Gobet 2020).“

- [ ] **Step 1 bis 5:** Tests (Lesart „Feinform gelingt“ für `prozedur-gelaeufig` bei Zielart `bewegung`; ohne Zielart das Label), FAIL, umsetzen, PASS, Commit.

### Task D5: Kette „vollständige Handlung“

**Files:**
- Modify: `data/ketten.json`, `packages/fmt-core/src/zuordnung.ts` (Leseregel), `golden-szenarien.ts`
- Test: `golden.test.ts`, `zielart.test.ts`

Festlegungen: Kette wörtlich aus `fmt2-regelsatz.json` → `neueKette` (fünf Schritte h1 bis h5), `zielart: ['handlung']`. Leseregel: „Lernfeld“, „Lernsituation“, „vollständige Handlung“, „Kundenauftrag“, „Arbeitsauftrag“ zusammen mit Bildungsstufe `berufsbildung` → `zielart: 'handlung'`. Eine kurze Unterweisung (n14, 15 Minuten) bleibt Zielart `bewegung`.

- [ ] **Step 1 bis 5:** Tests (n13 ergibt die neue Kette; n14 nicht; der Test „jeder Haupt- und Sicherungsschritt hat eine tragende Methode“ aus Task A6 gilt auch hier), FAIL, umsetzen, PASS, Commit.

### Task D6: Datenvorschlag 3 erzeugen und prüfen lassen (Tor D3)

**Files:**
- Create: `/mnt/project-files/fmt2/durchsicht-3-katalog.md`, `/mnt/project-files/fmt2/daten-entwurf/*.json` (elf Entwürfe)

Inhalt: die elf fehlenden Einträge aus `fmt2-regelsatz.json` → `fehlendeMethoden` als vollständige Bausteine im Format des Repositorys (acht Methoden, drei Hilfen: Satzmuster und Redemittel, Sprachvergleich, Zielsetzung mit Planungsbogen), mit Status `entwurf`, Quellen und Evidenz samt Bezug; Vorschlag für den Evidenzbezug `programm` an den Befunden, die Programmen gelten (Klassenrat, Blitzlicht und weitere, mit Begründung); die sechs Hattie-Befunde mit Vorschlag „Quelle ersetzen“ oder „kennzeichnen“; die 185 Befunde ohne Bezug nur gezählt, mit Vorschlag für eine spätere Durchsicht. Vor dem Schreiben jedes Entwurfs prüfen, ob der Katalog die Methode unter anderem Namen schon führt (`alternativname`, Weiterleitungen).

- [ ] **Step 1:** Entwürfe und Dokument erzeugen; jeder Entwurf besteht `validate` und die Datenprüfungen in einem Probelauf. **Step 2:** Prüfung nach dem Ablauf im Abschnitt „Tore“, Ergebnis nach `pruefung/tor-D3.md`. Neue Methoden bleiben im Status `entwurf`, bis Jan sie gelesen hat.

### Task D7: Daten der Durchsicht 3 übernehmen, Systematik und Dokumentation abschließen (nach Tor D3)

**Files:**
- Modify: `data/bausteine/*.json`, `apps/web/src/pages/SystematikPage.tsx`, `apps/web/src/pages/ApiMcpPage.tsx`, `README.md`, `docs/datenpflege/2026-11-27-kodierleitfaden-fmt2.md` (aus `fmt2-kodierleitfaden.md`, mit den Feldnamen des Repositorys), `docs/qualitaet/2026-11-27-fmt2-abschluss.md`

- [ ] **Step 1:** Daten übernehmen; Datenprüfungen und ganze Suite.
- [ ] **Step 2:** Systematik: Tabelle „Tausch oder Hilfe“, Planungsprofile, Lesarten, Begleitziele; Abschnitt „Grenzen“ mit den offenen Punkten aus Design Abschnitt 11. API-Seite: neue Felder mit Beispielanfrage.
- [ ] **Step 3:** `npm run qualitaet`; an keinem der 20 neuen Fälle steht mehr `bekannt`, außer mit einem Grund, der im Abschlussbericht steht. Abschlussbericht mit den Zahlen vor und nach der Umstellung.
- [ ] **Step 4:** Commit, Review, Jan um Push-Freigabe für PR D bitten.

---

## Selbstprüfung des Plans gegen das Design

| Design | Task |
|---|---|
| Abschnitt 4, W1 bis W13 | W1 Global Constraints; W2, W3 A3; W4 A6, A7; W5 A8; W6 D6; W7 A5; W8 B1, B6; W9 B3; W10 D1; W11 C1 bis C3; W12 B1 (`sicherheitshinweis`), A3 (`betreuungshinweis`); W13 B4 |
| 5.1 Regelsatz | A3, A6, B1, C1, D1 |
| 5.2 Methode | A3 (Typen), A9, B6, D7 (Daten) |
| 5.3 Situation | A7, A10 (`nachweis`), B2, D1, D3 |
| 5.4 Antwort | A8, B3, C3, D3 |
| 6 Kern, Abbau | A4, A6, A8, A10, B1, C2, D1 |
| 7 Schnittstellen | A11, B4, C5, D2 |
| 8 Oberfläche | A12, B4, C6, D2, D3, D4, D7 |
| 9 Lieferung, vorhandene Arbeit | A1, A5, Tore |
