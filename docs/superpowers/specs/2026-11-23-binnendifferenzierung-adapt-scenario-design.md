# Design-Spezifikation: Aufbereitete Binnendifferenzierung & Szenario-Anpassung (`adapt_scenario` + `/differenzierung`)

**Datum:** 2026-11-23  
**Status:** Entwurf zur Freigabe (Option C – gemeinsamer Differenzierungs-Kern mit eigenständigem Werkzeug & tiefer Baukasten-Verzahnung)  
**Bezug:** Portierung und fachdidaktische Aufbereitung der [Binnendifferenzierungsmatrix](https://github.com/janschachtschabel/binnendifferenzierungsmatrix) (`115 Anpassungsvariablen × 172 Maßnahmen`) in die FMT Methodendatenbank.

---

## 1. Absicht & Warum

Lehrkräfte und KI-Clients (z. B. ChatGPT, Claude, Antigravity über MCP oder REST-API) sollen für ein **konkretes Lehr-/Lernszenario** in `< 5 ms` (Zero-LLM-First) belastbare, direkt im Unterricht umsetzbare Vorschläge erhalten, **wie das Szenario an heterogene Lernvoraussetzungen angepasst bzw. binnendifferenziert realisiert werden kann**.

Die im Repo bereits enthaltenen Rohdaten der Binnendifferenzierungsmatrix (`differentiationMatrixData.ts`) sind dafür in ihrer aktuellen Form nicht ausreichend:
1. Sie mischen **sofortige Unterrichtsanpassungen** (*Satzstarter, Hilfekarten, Zeitpuffer*) mit **langfristigen Systemmaßnahmen** (*Zusätzliche Förderstunden, Entwicklungsberichte, Sonderpädagogik*).
2. Sie bewerten nur **einzelne isolierte Personas** statt einer **heterogenen Lerngruppe** (keine UDL-Schnittmenge, keine Konflikterkennung zwischen Teilgruppen).
3. Sie liefern **unkalibrierte Rohsummen** (`+67` bei 20 Variablen vs. `+2` bei 1 Variable mit alphabetischem Gleichstand-Rauschen).
4. Die 172 Maßnahmen sind reine Schlagwort-Labels ohne **Phasenbindung**, **Aufwandsklasse**, **Technik-/Offline-Bezug**, **FMT-Facetten-Brücke** oder **konkreten Umsetzungsimpuls**.
5. Es gibt keinen schnellen Stand-alone-Einstieg in App, API und MCP für bereits vorhandene/freie Unterrichtsentwürfe (z. B. direkt im Chat des Users).

---

## 2. Ziele, Nicht-Ziele & Anti-Ziele

### Ziele
- **G1 – Kuratiertes Metadaten-Overlay über alle 172 Maßnahmen** (ohne die originale 115×172-Punktematrix zu zerstören): `ebene`, `aufwand`, `technik`, `phasen`, `fmtBruecke`, `umsetzungsimpuls`.
- **G2 – Normalisierte Passung (`-100..+100`) & Relevanzstufen** (`kern` / `ergaenzend` / `neutral` / `vermeiden`) inkl. Tie-Breaker-Ordnung nach Unterrichtsnähe statt Alphabet.
- **G3 – Mehr-Gruppen-Synthese (UDL + Teilgruppen + Konfliktlösung):** Automatische Berechnung gemeinsamer Basis-Maßnahmen (*Universal Design for Learning*), gruppenspezifischer Anpassungen und expliziter Zielkonflikte inkl. konkreter Auflösungsstrategie (z. B. gestufte Hilfekarten, parallele Wahlwege).
- **G4 – Eigenständiges Werkzeug `adapt_scenario` (MCP) & `POST /api/v1/adapt` (REST-API):** Funktioniert sowohl für **freie Szenariotexte** (Chat-Use-Case ohne FMT-Arrangement) als auch für **strukturierte FMT-Arrangements / Phasenlisten** – inkl. phasenbezogener Anpassungen, passender alternativer FMT-Methoden und verbindlicher Client-LLM-Umsetzungsregeln (`llmBriefing`).
- **G5 – Tiefe Verzahnung mit dem FMT-Baukasten & eigener App-Zugang `/differenzierung`:**
  - Eigener Navigationspunkt **„Differenzierung“ (`/differenzierung`)** für schnelles Anpassen freier oder gespeicherter Szenarien + Übergabe in den Baukasten (*„Im Baukasten weiterbearbeiten“*).
  - Baukasten Schritt 3 (`DifferentiationMatrixPanel`, `VerlaufsplanView`, `ScenarioStudioPanel`), `build_scenario_plan` und `score_differentiation_matrix` nutzen automatisch denselben aufbereiteten Kern.

### Nicht-Ziele
- Kein verpflichtendes Server-LLM (Zero-LLM-First bleibt strikt erhalten, `< 5 ms` Antwortzeit).
- Keine Veränderung der 115×172-Originalgewichte aus `binnendifferenzierungsmatrix` (volle Rückführbarkeit bleibt erhalten).
- Keine personenbezogene Speicherung von Schülerdaten (DSGVO-frei, rein anonymisierte Teilgruppen/Profile).

### Anti-Ziele (was als Fehlschlag gilt)
- System-/Schulmaßnahmen (*Zusätzliche Förderstunden, Notengebung, Nachhilfe*) als Top-Empfehlungen für eine konkrete 45-Min-Unterrichtsstunde auszugeben.
- Digitale/Online-Maßnahmen bei `maxTechnik: "t-keine"` oder `ohneInternet: true` zu empfehlen.
- Die heuristische Punktematrix fälschlich als „empirische Effektstärke“ darzustellen (epistemische Trennung zu FMT-Evidenzgraden `A`–`C` ist zwingend).
- Bestehende API-Endpunkte (`POST /api/v1/differentiation/score`, `POST /api/v1/plan`), bestehende MCP-Tools (`score_differentiation_matrix`, `build_scenario_plan`) oder vorhandene 49 Tests zu brechen.

---

## 3. Rahmenbedingungen & Architektur-Entscheidung (Optionen)

Es wurden drei Optionen abgewogen:
- **Option A (Komplett getrennt):** Eigene Seite + eigene Tools ohne FMT-Verzahnung → abgelehnt, da Maßnahmen generisch bleiben und Doppelpflege zu Schritt 3 entsteht.
- **Option B (Nur intern im Baukasten):** Keine eigene Seite, kein `adapt_scenario` → abgelehnt, da freie Chat-/MCP-Use-Cases ohne vorherigen FMT-Ablauf nicht direkt bedient werden.
- **Option C (Gewählt):** **Ein gemeinsamer aufbereiteter Differenzierungs-Kern in `@fmt/core`** mit **zwei gleichwertigen Zugängen** – eigenständiges Schnell-Werkzeug (`/differenzierung`, `POST /api/v1/adapt`, MCP `adapt_scenario`) **und** nahtlose Nutzung im Baukasten (`Schritt 3`) sowie in `build_scenario_plan`.

**Technische & rechtliche Rahmenbedingungen:**
- Code unter `Apache-2.0`, Inhalte/Metadaten unter `CC BY 4.0 (Jan Schachtschabel)`.
- Reines TypeScript/Node.js 22 (keine neue Laufzeit-Abhängigkeit, Hostinger-Docker-kompatibel).
- Alle 172 Maßnahmen-Metadaten werden durch einen deterministischen Unit-Test auf 100 % Vollständigkeit (`172/172`) geprüft.

---

## 4. Fachlich-technisches Design

### 4.1 Metadaten-Overlay für alle 172 Maßnahmen (`packages/fmt-core/src/differentiationMetadata.ts`)

Für jede der 40 Maßnahmen-Kategorien (und wo nötig gezielt auf Ebene einzelner der 172 Ausprägungen) wird ein typisiertes Overlay definiert:

```ts
export type MeasureLevel = 'unterricht-sofort' | 'material-planung' | 'organisation-system';
export type MeasureEffort = 'sofort' | 'kurz' | 'mittel';
export type MeasureTech = 'analog' | 'projektion' | 'digital' | 'online';

export interface MeasureEnrichment {
  ebene: MeasureLevel;
  aufwand: MeasureEffort;
  technik: MeasureTech;
  /** Passende FMT-Lernfunktionen (leer = phasenübergreifend) */
  phasen: string[];
  /** Brücke zu FMT-Facetten (validiert gegen FMT-Vokabular, z. B. anleitung:explizit, adaptivitaet:diff-prozess, repraesentation:ikonisch) */
  fmtBruecke: string[];
  /** Konkreter, praxisnaher 1-Satz-Umsetzungsimpuls für Lehrkraft & Client-LLM */
  umsetzungsimpuls: string;
}
```

**Verbindliche Abgrenzungsregel für `MeasureLevel` (Entscheidungsvorschlag):**
- **`unterricht-sofort`**: Durch 1 Lehrkraft **während** einer 45–90-Min-Stunde ohne vorherige Materialerstellung umsetzbar (Sozialformen, Tempo/Zeitpuffer, mündliches/Peer-/Selbst-Feedback, Lenkungsgrad, akustisch-visuelle Raumorganisation, mündliche Wortschatz-/Verständnishilfen).
- **`material-planung`**: Durch 1 Lehrkraft **bei der Vorbereitung** dieser Stunde/Reihe umsetzbar (gestufte Aufgaben, Hilfekarten, Satzstarter, visuelle/haptische/vereinfachte/mehrsprachige Materialien, Kompetenzraster, digitale/interaktive Aufgaben).
- **`organisation-system`**: Erfordert **externes Personal, Schulorganisation, Prüfungs-/Notenordnung oder mehrwöchige/außerschulische Strukturen** (*Sonderpädagogik, Lernbegleiter, Zusatzstunden, Nachhilfe, Beratung, Notenvergabe, Punktesysteme, verbale Entwicklungsberichte, Klausuren, Hausarbeiten, außerschulische Lernorte, Lehrplan-/Epochen-/Jahresplanung, Biorhythmen*).
- **Default-Filter:** `scoreDifferentiationMatrix()` und `adaptScenario()` filtern standardmäßig auf `ebenen: ['unterricht-sofort', 'material-planung']`; Systemmaßnahmen lassen sich überall explizit per `includeSystemMeasures: true` (oder explizitem `ebenen`-Array) zuschalten.
- **Technik-/Offline-Filter:** Nutzt direkt `meta.technik`:
  - `maxTechnik === 't-keine'` → erlaubt nur `'analog'`
  - `maxTechnik === 't-projektion'` → erlaubt `'analog' | 'projektion'`
  - `ohneInternet === true` → schließt `'online'` aus.

### 4.2 Normalisierte Bewertung & Relevanzstufen (`packages/fmt-core/src/differentiationMatrix.ts`)

`scoreDifferentiationMatrix()` bleibt abwärtskompatibel (behält `score`, `topRecommendations`, `byOberKategorie`, `avoidMeasures`, `didacticProfile`) und ergänzt pro Empfehlung:
- `normalizedScore`: `Math.round((rawScore / (selectedCount * 2)) * 100)` (`-100..+100`) – vergleichbar unabhängig davon, ob 1 oder 35 Variablen aktiv sind.
- `relevanz`: `'kern'` (`>= 45`), `'ergaenzend'` (`15..44`), `'neutral'` (`-14..14`), `'vermeiden'` (`<= -15`).
- `meta`: das vollständige `MeasureEnrichment`.
- **Schwellenwerte (Entscheidungsvorschlag):** Wenn kein explizites Legacy-`minScore` übergeben wird, nutzt `topRecommendations` `normalizedScore >= 15` (so bleiben `'neutral'`-Einträge draußen, während auch `average`-Personas verlässliche Empfehlungen liefern) und `avoidMeasures` nutzt `normalizedScore <= -15`.
- **Tie-Breaking bei Gleichstand:** `normalizedScore DESC` → `ebene`-Priorität (`unterricht-sofort` vor `material-planung` vor `organisation-system`) → `aufwand` (`sofort` vor `kurz` vor `mittel`) → `name`.
- **Aktive `fmtBruecke`:** `fmtBruecke`-Tokens (`anleitung:*`, `adaptivitaet:*`, `engagement:*`, `interaktion:*`, `repraesentation:*`, `feedback:*`) werden in Unit-Tests gegen das FMT-Vokabular geprüft und steuern die Methoden-Passung in `suggestAlternativeMethodsForGroup()` sowie in `adaptScenario()` aktiv mit.

### 4.3 Mehr-Gruppen-Synthese & Szenario-Anpassung (`adaptScenario()` in `@fmt/core`)

Neue Kernfunktion `adaptScenario(catalog, input)` in `packages/fmt-core/src/adaptScenario.ts`:

**Eingabe (`AdaptScenarioInput`):**
- **Szenario (mindestens eines):**
  - `scenarioText?: string` – beliebiger Freitext (z. B. bestehender Unterrichtsentwurf aus ChatGPT, Schulbuch-Idee oder Stichpunkte)
  - `arrangement?: Arrangement` – bestehendes FMT-Arrangement JSON-LD
  - `phasen?: Array<{ key?: string; phaseLabel: string; durationMin?: number; baustein?: string; lernfunktion?: string; beschreibung?: string }>` – eigene Phasenliste (auch ohne FMT-Methoden-IDs!)
- **Lernvoraussetzungen / Gruppen (flexibel):**
  - `lerngruppenText?: string` – Freitext (z. B. *„6 DaZ-Kinder, 2 mit ADHS, 4 sehr leistungsstark“*) → automatische Extraktion separater Teilgruppen über `detectLearnerGroupsFromText()`.
  - `gruppen?: Array<{ id: string; label: string; count?: number; personaId?: string; selectedValues?: Record<string, string>; text?: string }>` – explizite Teilgruppen.
- **Saubere Gruppen-Synthese-Regeln (Entscheidungsvorschlag):**
  1. **Keine unzulässigen klinischen/kognitiven Persona-Unterstellungen:** Aus Freitext erkannte Gruppen (z. B. *„5 DaZ-Kinder“* oder *„2 Kinder mit ADHS“*) werden **strikt anhand ihrer erkannten Merkmals-Traits** bewertet – sie erben **nicht** automatisch die 36 gebündelten Variablen der Voll-Persona `languageAndCulture` (die u. a. `foerderbedarf-lernen-umfassend` und `psychische-gesundheit-haeufig` enthält). Voll-Personas greifen nur, wenn der Aufrufer sie explizit per `personaId` wählt oder keine Signale im Text stehen.
  2. **0 oder 1 erkanntes Gruppensignal:**
     - **0 Signale** (z. B. reiner Stundenentwurf ohne Klassenbeschreibung): Automatische Standard-Trias (*Basisunterstützung*, *Regelniveau*, *Vertiefung*) mit Kennzeichnung `gruppenQuelle: 'standard-heterogenitaet'` in `kontext`.
     - **1 erkanntes Teilgruppen-Signal** (z. B. *„26 Kinder, 4 DaZ“*): Die erkannte Teilgruppe **plus** eine ergänzte Gruppe *„Regelniveau (übrige Klasse)“* (`gruppenQuelle: 'erkannt+regelniveau'`), damit UDL-Schnittmenge und Konflikterkennung für den gesamten Klassenverband funktionieren.
     - **≥ 2 erkannte oder explizit übergebene Gruppen:** Exakt diese Gruppen (`gruppenQuelle: 'erkannt'` bzw. `'explizit'`).
- **Rahmenbedingungen:** `fach`, `thema`, `bildungsstufe`, `zeitMin`, `maxTechnik`, `ohneInternet`, `ohneKI`, `maxAufwand?: MeasureEffort`, `includeSystemMeasures?: boolean` (Default `false`).

**Deterministische Ausgabe (`AdaptScenarioResult`, `< 5 ms`):**
1. **`kontext`**: Erkannte Rahmenbedingungen, `gruppenQuelle`, aktive Teilgruppen (inkl. erkannter Matrix-Signale), aktive Ebenen-/Technikfilter.
2. **`udlBasis`** (*Universal Design for Learning*): Maßnahmen, die für **alle** Teilgruppen positiv (`normalizedScore >= 20`) und für keine Gruppe kontraindiziert (`<= -15`) sind – sortiert nach minimaler Gruppeneignung & niedrigem Aufwand, inkl. `umsetzungsimpuls`.
3. **`teilgruppen`**: Pro Gruppe die top gruppenspezifischen Maßnahmen (über die UDL-Basis hinaus), `avoidMeasures` (was bei dieser Gruppe schadet) und `didacticProfile`.
4. **`konflikte`**: Maßnahmen, bei denen mindestens eine Gruppe `normalizedScore >= 30` und eine andere `<= -20` liegt (z. B. *Offene Aufgaben*, *Hohe Anforderungen*, *Schnelles Tempo*), jeweils mit konkreter **Auflösungsstrategie** (z. B. *„Parallele Lernwege / gestufte Aufgabenkarten: Basisgruppe erhält Schritt-für-Schritt-Gerüst, Vertiefungsgruppe bearbeitet die offene Transfer-Variante“*).
5. **`phasenAnpassungen`**:
   - Bei übergebenem `arrangement` oder `phasen`: Für **jede Phase** die dazu passenden Maßnahmen (über `meta.phasen` / Lernfunktion der Phase) + passende **alternative FMT-Methoden** pro Teilgruppe (über `fmtBruecke` + Technik-/Offline-Filter).
   - Bei reinem `scenarioText` ohne Phasen: Automatische Ableitung einer 3-teiligen Grundstruktur (*Einstieg & Aktivierung*, *Erarbeitung & Verstehen*, *Übung, Transfer & Sicherung*) plus **Top-FMT-Methodenempfehlungen** passend zu den erkannten Differenzierungsbedarfen!
6. **`epistemischerHinweis`**: Klarer Hinweis, dass Matrix-Werte ein heuristisches Expertenmodell (keine empirischen Effektstärken) sind, während verknüpfte FMT-Methoden eigene Evidenzgrade (`A`–`C`) mit Geltungsbereich tragen.

### 4.4 REST-API & MCP-Schnittstellen (`apps/server`)

1. **Neuer REST-Endpunkt `POST /api/v1/adapt`** (`apps/server/src/routes/api.ts`):
   - Ruft `adaptScenario()` auf und hängt ein vorab gefiltertes **`llmBriefing`** + **`verbindlicheUmsetzungsregeln`** an (analog zu `POST /api/v1/plan`), damit externe Clients den Anpassungsplan ohne Halluzinationen in konkrete Arbeitsaufträge/Satzstarter/Hilfekarten ausformulieren können.
   - `GET /api/v1/differentiation/meta`: Liefert alle 9 Variablen-Oberkategorien (115 Ausprägungen), Personas, Ebenen und Filteroptionen für UI & externe Clients.
   - `POST /api/v1/differentiation/score`: Weiterhin 100 % abwärtskompatibel (additiv erweitert um `normalizedScore`, `relevanz`, `meta`, `ebenen`, `includeSystemMeasures`, `maxTechnik`, `ohneInternet`, `ohneKI`).
2. **Neues 14. MCP-Tool `adapt_scenario`** (`apps/server/src/mcp/server.ts`):
   - Beschreibung macht für ChatGPT / Claude / Cursor glasklar: *„Nutze dieses Tool immer, wenn ein vorhandenes oder freies Unterrichtsszenario (auch ohne FMT-Arrangement) an konkrete Lernvoraussetzungen (z. B. DaZ, ADHS, LRS, Inklusion, Leistungsstarke, heterogene Klasse) angepasst oder binnendifferenziert werden soll. Liefert in <5 ms UDL-Basis, teilgruppenspezifische Maßnahmen, Zielkonflikte mit Auflösungsstrategien, phasenbezogene Anpassungen, alternative FMT-Methoden und verbindliche Umsetzungsregeln.“*
   - **Abwärtskompatible Integration in `build_scenario_plan`:** Behält das bisherige `lerngruppenUndMatrix[].matrixTop`-Format bei (jetzt aber ohne Systemmaßnahmen wie *Förderstunden*), ergänzt additiv `udlBasis` & `konflikte` auf Top-Level und gibt die `umsetzungsimpulse` im `llmBriefing` mit.

### 4.5 Web-App: Eigene Seite `/differenzierung` + Baukasten-Verzahnung (`apps/web`)

1. **Neuer Nav-Tab „Differenzierung“ (`/differenzierung`):**
   - **Eingabebereich (2 Modi umschaltbar):**
     - *Freies Szenario / Text*: Freitextfeld für beliebigen Stundenentwurf oder Unterrichtsidee + Klassenbeschreibung (z. B. *„26 Kinder, 5 DaZ, 2 ADHS, 4 sehr schnell“*) + Schnell-Presets (z. B. *Inklusive Klasse*, *DaZ + Leistungsstarke*, *ADHS/LRS analog*) + Rahmenfilter (`maxTechnik`, `ohneInternet`, `ohneKI`, optional Toggle *„Auch Schul-/Systemmaßnahmen anzeigen“*).
     - *Aus Baukasten / Gespeichertem Szenario*: Übernimmt per 1 Klick ein gespeichertes oder aktuelles FMT-Szenario inkl. aller Phasen.
   - **Ergebnisbereich (sofort in `< 5 ms`, Zero-LLM):**
     - **1. Gemeinsame Basis (UDL)** – grüne Karten („Hilft allen Gruppen gleichzeitig“) inkl. konkretem Umsetzungsimpuls & Aufwands-Badge (`sofort` / `kurz`).
     - **2. Zielkonflikte & Auflösungsstrategien** – bernsteinfarbene Warnkarten bei gegensätzlichen Gruppenbedarfen.
     - **3. Teilgruppen-Anpassungen & Vermeiden-Hinweise** – gruppierte Karten mit normalisierter Passung (`0–100 %`) und ausklappbaren Detail-Variablen.
     - **4. Phasen-Anpassungen & passende FMT-Methoden** – konkrete Vorschläge pro Phase inkl. alternativer FMT-Methoden mit Evidenzgrad.
     - **Aktionen:** *„In Szenario-Baukasten übernehmen“* (übergibt Gruppen, Matrix-Werte, Rahmenfilter und ggf. Text direkt an `/planer` via `sessionStorage`-Handoff), *„Anpassungs-Checkliste kopieren (Markdown)“* und *„Export (.json)“*.
2. **Aufwertung von Baukasten Schritt 3 (`DifferentiationMatrixPanel.tsx`) & nahtlose Vererbung:**
   - `DifferentiationMatrixPanel.tsx` zeigt nun ebenfalls **UDL-Kern, Zielkonflikte, Umsetzungsimpulse & normalisierte Passung (%)** sowie den Toggle *„Systemmaßnahmen einblenden“*.
   - `VerlaufsplanView.tsx`, `ScenarioStudioPanel.tsx` und `scenarioModel.ts` erben automatisch die ebenen-gefilterten & normalisierten Matrix-Empfehlungen (ohne die bestehenden Exportformate zu brechen).

---

## 5. Entscheidungen des Builders (Freiheitsgrade)

Der Implementierer darf eigenständig entscheiden über:
- Die genaue visuelle Kartengestaltung auf `/differenzierung` im bestehenden FMT-Designsystem (`--paper`, `--surface`, `--dA`..`--dD`, `--ink`).
- Die konkrete Ausformulierung der 1-Satz-`umsetzungsimpulse` für die 40 Maßnahmen-Kategorien / 172 Ausprägungen (fachlich präzise, deutsch, handlungsorientiert).
- Ob der Baukasten-Handoff über `sessionStorage` oder Router-State erfolgt (Empfehlung: `sessionStorage`-Key + Query-Flag, damit Reloads robust bleiben).

---

## 6. Verifikations- & Testplan

1. **`@fmt/core` Tests:**
   - Vollständigkeitstest: Alle 172 Maßnahmen aus `DIFF_MATRIX_MEASURES` besitzen ein gültiges `MeasureEnrichment`.
   - Ebenen-Filter-Test: Standard-Szenario-Modus liefert 0 `organisation-system`-Maßnahmen (*keine „Zusätzlichen Förderstunden“* im 45-Min-Entwurf).
   - UDL- & Konflikt-Test: Heterogene Klasse (`languageAndCulture` + `highPerforming`) findet gemeinsame UDL-Basis **und** erkennt den Konflikt bei *offenen Aufgaben / hohen Anforderungen* inkl. Auflösungsstrategie.
   - Normalisierungs- & Gleichstands-Test: 1 einzelne gewählte Variable (z. B. `foerderbedarf-lernen-umfassend`) priorisiert `unterricht-sofort` vor alphabetischem Rauschen.
   - `adaptScenario()`-Tests: sowohl mit freiem Text (ohne FMT-Arrangement) als auch mit einem FMT-Arrangement + Technik-/Offline-Filter.
2. **`@fmt/server` Tests:**
   - REST-API `POST /api/v1/adapt` & `GET /api/v1/differentiation/meta`.
   - MCP-Tool-Liste (jetzt **14 Tools** inkl. `adapt_scenario`) und End-to-End-Aufruf von `adapt_scenario` über Streamable HTTP (`/mcp`) für einen freien Unterrichtstext UND ein FMT-Arrangement.
   - Regressionstest, dass `build_scenario_plan` keine Systemmaßnahmen (*Förderstunden/Entwicklungsberichte*) mehr in `matrixTop` mischt.
3. **`@fmt/web` Tests:**
   - Render- & Interaktionstest für `DifferentiationPage` (`/differenzierung`) mit UDL-Karten, Konflikten und analogem Filter.
4. **CI & Docker:** `npm run build`, `npm test`, GitHub Actions `CI` + `Publish Docker Image` grün.
