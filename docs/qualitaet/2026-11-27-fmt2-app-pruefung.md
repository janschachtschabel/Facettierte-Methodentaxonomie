# Audit: Does the app reflect FMT 2.0 everywhere? (origin/main 26ef0b5)

Read-only audit. Reference: docs/superpowers/specs/2026-11-26-fmt2-w-raster-design.md §5–§8.
Server tests run: apps/server 82/82 passed (vitest). Nothing was changed.

Each finding is marked **OK** or **Lücke**. Paths are relative to /home/claude/repo.

---

## 1 Web pages

### 1.1 SystematikPage (apps/web/src/pages/SystematikPage.tsx): mostly OK, 3 gaps

- OK: the W-Raster section replaces "Ergänzende Merkmale" (673 „Das W-Raster: neun Fragen, fünf Arten von Aussagen“, 706 field assignment, 785 Raumtypen, 819 Raumbedarf/Schriftbedarf).
- OK: Zielarten with chains and Wissensart per step (850–900), Setzung named (898–902).
- OK: Lesarten der Lernstände (10, 45, 623–660); the number of Lernzustände is dynamic (588, 609), so "11" is gone.
- OK: Evidenzbezug incl. programm (951–990).
- OK: Passungsregeln with Wirkung and Grundlage (1150–1240), Tausch oder Hilfe (1245), Planungsprofile (1295), Begleitziele (1345), „Grenzen der FMT 2.0“ (1503).
- OK: counts of Methoden and Hilfen come from the data (298, 1105).
- Lücke: the Zuordnungsstufen do not name all the new effects (135–141, 1078). Stage 4 „Passung“ lists only Eignung (Vorwissen, Stufe, Fach). It leaves out the other Passungsregeln (komplexitaet, sprachniveau, nachweis, sicherheitshinweis, lehrkraft-nicht-doppelt). Stage 5 does not say that a Begleitziel orders only within the tolerance, although §6 and §8 ask for this.
- Lücke: the Eintragsart „Hilfe“ has no explanation of its own. There is only a count (298) and a side remark under Begleitziele (1349). §5.2 says what a Hilfe is: it has no phase, appears in no chain step and has its own filter.
- Lücke (cosmetic): the comment „Live Catalog Analytics Dashboard (200 Methods)“ (1103) is out of date.

### 1.2 MethodDetailPage (apps/web/src/pages/MethodDetailPage.tsx): 7 gaps

- OK: a Hilfe gets a badge (88) and an explanation, and has no „In Baukasten“ button (164–181).
- OK: Bedarf is grouped by W-Feld (233–262, via planner/bedarfAnzeige.ts). It covers raumbedarf, schriftbedarf, termineMin, fachausstattungArt, betreuungshinweis and raumhinweis.
- OK: Evidenzbezug methode/prinzip/programm per finding (12–16, 336–340). The aesthetic methods show no transfer promise (19, 350–354).
- OK: status entwurf is shown as „Ersterfassung“ (94).
- Lücke **Eignung**: `eignungsgrund` (text, Grundlage E/S/A, Quelle per stufe/vorwissen/fachbereich) is shown nowhere. 11 data files carry it, e.g. data/bausteine/loesungsbeispiele.json. The only reader is packages/fmt-core/src/regeln.ts:72, and no web or server file reads it.
- Lücke **old term**: Eignung appears under „Q2 Bedingungen“ (299 heading „Kernkomponenten, Bedingungen & Risiken“, 306). It mixes `hinweis` with ungeeignetBeiVorwissen and ungeeignetBeiStufe. Under FMT 2.0 this is „Eignung“ (R-06 „Eignung und Passung“).
- Lücke: `fachbereichUngeeignet` stands apart as „Weniger geeignet für“ (124–129). It has no Grundlage and is not part of a block „Eignung“.
- Lücke **Einordnung in Ketten**: the page does not show which chains or chain steps the method can fill, with the bound Wissensart. Neither ketten.json nor `traegtWissensart` is used. Only neighbours are shown via InterfaceFlow (227–229).
- Lücke **Lesarten**: Vor- and Nachbedingungen appear only under their plain label (InterfaceFlow). The Lesart per Zielart (core `lesart()`) is not used on the detail page.
- Lücke **W-Raster grouping**: §8 says „Das Detail gliedert nach W-Feld und Art“. Only Bedarf is grouped this way. Beitrag (facets A1, liefert), Eignung and Einordnung stay in the old facet blocks (199, 359).
- Lücke (small): for a Hilfe the page still shows the full 13-facet radar and the „Schnittstelle & Anschlussfähigkeit“ block (227). A Hilfe has no phase, so these say little about it.

### 1.3 CatalogPage (apps/web/src/pages/CatalogPage.tsx): 4 gaps

- OK: Eintragsart filter Methoden/Hilfen with counts (118–147); the intro counts Methoden and Hilfen separately (102).
- OK: a Raum filter by Raumtyp (deckt den Raumbedarf) (257–267).
- Lücke: the Schriftbedarf filter is one local checkbox „ohne Lesen und Schreiben“ (65–71, 269–274). It cannot filter lesen and schreiben separately. It bypasses `search.suche` (core `schriftbedarf`) and is not kept in the URL.
- Lücke: there is no filter by Raumbedarf as such (raumBietet/raumbedarf/ohneRaumbedarf, which REST and MCP do have) and none by termineMin.
- Lücke: the URL keys (37, 48) leave out `raum` and `ohneSchrift`, so shared links lose these filters.
- Lücke (optional): there is no filter by Zielart or chain, and none by Evidenzbezug.

### 1.4 ComparePage (apps/web/src/pages/ComparePage.tsx): 1 gap (several missing rows)

- Lücke: the comparison table (27–41) has only the old rows (reichweite, ansatz, evidence, dauer, vorbereitung, gruppe, technik, 13 facets, vor/nach, Q1, Q3). It has no Eintragsart, raumbedarf, schriftbedarf, termineMin, fachbereich/fachbereichUngeeignet, Eignung (ungeeignetBei*, eignungsgrund) or Evidenzbezug. Nothing is grouped by W-Feld. The method list (11) mixes Methoden and Hilfen without a label.

### 1.5 ApiMcpPage (apps/web/src/pages/ApiMcpPage.tsx): good FMT 2.0 table, 6 gaps

- OK: the table „Neue Felder der FMT 2.0“ (6–23, 260–300) covers planungsprofil, begleitziel, termine, nachweis, raum (with the lernort alias), ohneSchrift, pflichtangaben, regelmeldungen, begleitstrang, genannteHilfen, entwurf and teilgruppenImpulse. It has an example request and answer (25–58).
- OK: the counts come from the data (katalogZahlenText, 63, 104). „15 Tools“ is correct.
- Lücke: the FMT 2.0 table lacks the other new request fields: `zielart` (nine values incl. `handlung`), `komplexitaet`, `sprachniveau`, `lehrende`, `einheit`, `bewertet`, `raumBietet`, `fachausstattungArt`. It also lacks the new method fields: `eintragsart`, `raumbedarf`, `schriftbedarf`, `termineMin`, `eignungsgrund`, `evidenzBezug: programm`.
- Lücke: the tool list is out of date. `match_scenario` (126) says „5-Stufen-Zuordnung … Matrix-Signale“ but not pflichtangaben or regelmeldungen. `list_vocabularies` (129) leaves out Passungsregeln, Raumtypen and Zielarten. `elaborate_scenario` (134) says „Verlaufstabelle + llmBriefing“ but not the Entwurf with seven Kernfelder. `adapt_scenario` (132) does not mention passt/Hilfe/Tausch. `search_methods` (123) does not mention the eintragsart, raum or schriftbedarf filters.
- Lücke: the REST table row `GET /api/v1/meta` (162–168) leaves out wfelder, arten, merkmale, regeln, raumtypen, zielarten and planungsprofile. The row `GET /api/v1/methods` (184–190) leaves out the eintragsart, raum, raumbedarf and schriftbedarf filters.
- Lücke: the sentence „Die Felder gelten gleich für /plan, /match …“ (264–266) is true only for the fields listed. /plan drops komplexitaet, sprachniveau, lehrende, einheit, bewertet and zieltyp (see 3.4).
- Lücke (small): the `schemes.length ?? 24` fallback (104) is out of date; the README says 36.
- Lücke (small): the old tool texts remain: „5-Stufen“, „6 Skalen“, „13-Regeln-Validator“ (104, 122, 168).

### 1.6 Start page = CatalogPage `/`; Layout; no help/about page: 1 small gap

- OK: no help or about page exists (App.tsx:21–30). The start page is the catalogue (see 1.3).
- Lücke (cosmetic): the footer falls back to version '1.0.0' (apps/web/src/components/Layout.tsx:124); the data is at 2.0.0.
- OK: a grep for the old terms in apps/web/src found no „Anforderung“, „Ergänzende Merkmale“, „303 Methoden“, „11 Lernzustände“ or „Bedingungsraum“. „lernort“ appears only as an alias in storage/import code (scenarioStorage.ts:75,190–196,265; PlannerPage.tsx:1232). „Einsatzprofil“ appears only in a code comment (data/CatalogContext.tsx:188). „Bedingungen“ remains only in MethodDetailPage 299/306/324 (see 1.2) and in the legal pages (not relevant).

### 1.7 DifferentiationPage (apps/web/src/pages/DifferentiationPage.tsx): 1 gap

- Lücke: it uses core `adaptScenario` (275, 306, 335), but its result cards (1039–1058) show only `massnahmen` with „+x %“ and `alternativeMethoden`. They do not show `antwort` (passt/Hilfe/Tausch), `beleg`, `hilfen` with `abbau`, `gesperrt`, the grouping hints or the regelmeldungen. That is the old matrix view without „Tausch oder Hilfe“.

---

## 2 Baukasten (PlannerPage + apps/web/src/planner/*)

### Step 1 Vorhaben: core logic OK, 5 gaps
- OK: the line „Verstanden / Fehlt noch“ reads the six Pflichtangaben from `pflichtangaben` (planner/pflichtangaben.ts; PlannerPage 1318, 1661–1760). The inline completions cover Ziel (all Zielarten), Fach/Thema, Stufe, Zeit and Raum. A guessed goal can be corrected.
- OK: Raum is a Raumtyp select with ticked properties (1761, 1805; raumBietet 307, 811). Lesen and Schreiben (ohneSchrift) and Termine are there (2238–2340). Begleitziele are a collapsible block with the right text (2343–2366). All are sent in `buildStructuredMatchRequest` (780–829).
- Lücke **Vorwissen and Bildungsstufe in „Mehr Angaben“ do not reach the matcher**. The selects write only `arrangement.kontext` (2072, 2090–2093). `buildStructuredMatchRequest` (780–829) sends neither `vorwissen` nor `kontext.bildungsstufe` (only `stufeErg`). So Eignung and the Passungsregeln (expertise reversal) do not see the teacher's choice.
- Lücke: the collapsible fields §8 asks for are missing: Sprachniveau, Komplexität, Nachweis, übergeordnete Einheit, bewertet, Planungsprofil and fachausstattungArt. There are no UI fields and no request fields. Lehrkräfte is free text („1 Lehrkraft“, 296) and is never sent as numeric `lehrende`, so the rule lehrkraft-nicht-doppelt cannot be switched off from the UI.
- Lücke: the summary „Mehr Angaben (freiwillig): Fach, Lernziele, Klassengröße, Technik, Lesen und Schreiben, Termine“ (2026) does not name Raum or Begleitziel.
- Lücke **AI path loses structured details**: `/api/v1/assistant/translate` accepts only `text` (assistant.ts:898). The planner sends `buildEnrichedAiText()` (831–854, 994–998). That text leaves out the „Fehlt noch“ completions (zielErg, stufeErg, zeitErg, themaErg), the subject field `fachbereich` and the planned Planungsprofil.
- Lücke **translate prompt is out of date** (assistant.ts:946–956): it explains only `zieltyp` with five old chains (prozedur, konzeptaufbau, problemloesen, faktenwissen, fuenf-e). It does not mention `zielart` (nine values incl. bewegung, kondition, urteilen, gestalten, handlung), `begleitziel`, `raum`, `ohneSchrift`, `termine` or the new chain `vollstaendige-handlung`.

### Old code path bypasses the core: Beispiele and chain selection
- Lücke **critical**: the starter presets (`applyStarterPreset` 856–891, STARTER_PRESETS 146–240) and the select „Funktionskette / Zieltyp“ (2119–2135) call `createChainPreset` (planner/arrangementOps.ts:114–373). It builds hard-coded methods per chain, including vollstaendige-handlung (325–341), with fixed kontext (bildungsstufe/vorwissen/zeit). Then `setMatchResult(null)` (888). This means no Kettenwahl by Zielart, no Wissensart-Bindung, no Bedarf check (Raum, Schrift, Termine), no Passungsregeln, no pflichtangaben, no Verstanden line, no begleitstrang and no planungsprofil from the core. The chain select also discards the user's own kontext.

### Step 2 Methodisches Konzept: 4 gaps
- OK: „Ablauf stimmig“ instead of „gut“ (1416, 2439). The Verstanden/Fehlt noch block (2455–2470) and the Angenommenes (annahmenListe 1309) are shown. Regelmeldungen appear with Regel and Grundlage, and A is labelled „Setzung“ (planner/regelmeldung.ts:10–33; PlannerPage 2482–2500). The Begleitstrang can be taken over or removed (2501–2530). Open steps show their reason (1313). The Lesart of Nachbedingungen is in the Verlaufsplan (components/VerlaufsplanView.tsx:228).
- Lücke: the exclusions are not shown with their Merkmal. `ausgeschlossen.rahmen[].merkmal` and `nichtVerankert[].merkmal` (core types.ts:718–722, 743) appear nowhere in apps/web. `genannteHilfen` and `weitereKetten` are not shown either.
- Lücke: the planner shows no Evidenzbezug (methode/prinzip/programm). `evidenzBezug` is read only on MethodDetailPage and SystematikPage; the planner shows only „Grad X“ (1930).
- Lücke: Passungsregeln are not re-checked after manual edits. Regelmeldungen come only from the last `matchResult` and are filtered by the methods in the flow (regelmeldung.ts:42). A method swapped in by hand gets no Eignung or Regel warning. The validator checks only R-00..R-12.
- Lücke **old candidate filters**: the method swap in the Verlaufsplan, `compatibleAlternatives` (VerlaufsplanView.tsx:99–115), filters only by lernfunktion, reichweite and dauer. The Partitur swap uses `search.ersatz` (PartiturView.tsx:115, core suche.ts:215). Neither considers Bedarf (raum/schrift/termine), Wissensart-Bindung, Technik or Eignung.

### Step 3 Binnendifferenzierung: core logic OK, 1 gap
- OK: TeilgruppenEntscheidung (components/TeilgruppenEntscheidung.tsx) shows passt, Hilfe or Tausch with Beleg and Grundlage and „Wann die Hilfe entfällt“ (111–134). Hilfe goes before Tausch (PlannerPage 2686–2693). The gesperrt text is shown (2674–2678), and gesperrte categories are missing from the selection (DifferentiationMatrixPanel.tsx:71). The grouping hints use teilgruppenHinweise (planner/differentiationFlow.ts:146–167).
- Lücke **parallel old path**: the matrix panel and the Verlaufsplan editor also offer „alternative methods“ per subgroup straight from `suggestAlternativeMethodsForGroup` (DifferentiationMatrixPanel.tsx:917–925; VerlaufsplanView.tsx:316–319). The latter also gets no constraints. There is no teilgruppen.json decision, no `istGleichwertig`, no „nur mit Beleg“ and no Bedarf check. The core function itself still has the old special rules (regex on the Befund text, psychomotorik/spiel-simulation guard: packages/fmt-core/src/differentiationMatrix.ts:486–498).

### Step 4 Material: OK
- OK: adopted Hilfen appear as Material („Die Hilfe steht als Material in Schritt 4“, TeilgruppenEntscheidung.tsx:134). There is a Begleitstrang section (PlannerPage 2957–2990; planner/begleitziele.ts).

### Step 5 Fertiges Szenario: OK, 1 gap
- OK: the Entwurf with Kernfelder, terms and modules comes from the Planungsprofil (planner/scenarioModel.ts:589–690, 794; ScenarioStudioPanel 374–375). The exports carry kernfelder and module (scenarioModel.ts:1164; lmsExport.ts:119).
- Lücke: the Planungsprofil cannot be chosen or changed. It comes only from the core answer or the Bildungsstufe (scenarioModel.ts:637, 681). After a Beispiel or chain preset (matchResult null) it is always derived from the Stufe. `bewertet` and `einheit` from the UI do not reach the Entwurf (see step 1).

---

## 3 REST (apps/server/src/routes/*)

### 3.1 GET /api/v1/fields, /schema: OK
- OK: api.ts:193–194 use `matcher.felder()` and `schema()`, which are the field list of the core (zuordnung.ts, incl. zielart, raum, raumBietet, fachausstattungArt, ohneSchrift, termine, nachweis, begleitziel, komplexitaet, sprachniveau, lehrende, thema, einheit, bewertet, planungsprofil).

### 3.2 GET /api/v1/meta: OK, 1 small gap
- OK: wfelder, arten, merkmale, raumtypen, zielarten, regeln and planungsprofile are there (api.ts:80–110).
- Lücke (small): it has no `ketten` (with schritte/wissensart), no teilgruppen table and no split into methoden/hilfen. `bausteine` counts both (api.ts:88).

### 3.3 GET/POST /api/v1/match (+ /zuordnung): OK
- OK: the core answer is passed through unchanged (api.ts:59–71) and contains pflichtangaben, regelmeldungen, begleitstrang, planungsprofil, nachweis, offenGruende and ausgeschlossen.rahmen[].merkmal. GET parses by type from felder() (api.ts:41–57).

### 3.4 POST /api/v1/plan: 3 gaps
- OK: the answer has pflichtangaben, regelmeldungen (regel, wirkung, grundlage, quelle, text, baustein), begleitstrang, offenGruende, nachweis, genannteHilfen, planungsprofil and entwurf (llm/briefings.ts:896–937).
- Lücke **request fields dropped**: `ScenarioPlanArgs` (briefings.ts:488–537) and `matchReq` (626–654) do not pass `komplexitaet`, `sprachniveau`, `lehrende`, `einheit`, `bewertet`, `zieltyp` (Wunschkette, e.g. vollstaendige-handlung), `lernfunktion`, `liefert`, `raumzeit` or `vorhanden`. They take effect only if they are in the text. `einheit` is read only from `matched.kriterien.einheit` (857). `bewertet` has no effect anywhere in the server or the Entwurf (grep).
- Lücke: `gruppen[]` in /plan has no `ohneSchrift` or `ohneBewegung` (briefings.ts:527–536), while /adapt does.
- Lücke (small): `methodenDetails` (briefings.ts:868–881) has no eintragsart, raumbedarf, schriftbedarf, termineMin, eignungsgrund or Lesart. `evidenz` is passed through raw (incl. evidenzBezug, OK). `maschinenlesbar` (938–951) carries no begleitziel, planungsprofil or raum.

### 3.5 GET /api/v1/methods (search): OK, 1 small gap
- OK: raumbedarf, schriftbedarf, ohneRaumbedarf, raum and eintragsart are accepted (api.ts:126–184; core SearchCriteria types.ts:579–587).
- Lücke (small): there is no `ohneSchrift` alias, no `termine` filter and no Zielart or chain filter. `gesamt` counts Methoden and Hilfen together.

### 3.6 POST /api/v1/classify: 1 gap
- Lücke: it returns kriterien, erkannt, offen, skalen, methodenVorschlaege and matrixMerkmale (catalog-store.ts:248–259), but no `pflichtangaben` (fehlt/angenommen). That leaves the natural first step for a caller without a signal for what to ask back.

### 3.7 POST /api/v1/differentiation/score: 1 gap
- OK: `merkmalsEntscheidungenFuerAnfrage` (vorgesehen: Tausch/Hilfe) and gesperrt are there (api.ts:324–376).
- Lücke: `alternativeMethoden` comes from the raw `suggestAlternativeMethodsForGroup` (api.ts:357–364). It has no condition (does the method trigger the rule?), no istGleichwertig and no Bedarf (raum/schrift).

### 3.8 POST /api/v1/adapt: OK
- OK: passt/Hilfe/Tausch with beleg and abbau, gesperrt, regelmeldungen. It accepts `lehrende` and `anfrage` (core adaptScenario.ts:88–93) and gruppen with ohneSchrift/ohneBewegung (validation.ts).

### 3.9 POST /api/v1/assistant/elaborate: OK
- OK: it accepts planungsprofil, planungsprofilAngenommen, raum, anzahl, einheit, nachweis, hinweiseListe, text, begleitziel and begleitstrang (assistant.ts:89–106) and returns `entwurf` (1068–1081).
- Lücke (small): there is no `bewertet` input (Entwurf §5.3) and no regelhinweise input. The Regelmeldungen of the plan go only through hinweiseListe as text.

### 3.10 POST /api/v1/assistant/translate: 1 gap (see 2/step 1)
- Lücke: the prompt is out of date (assistant.ts:946–956: zieltyp instead of zielart, no new fields). It accepts only `text`.

### 3.11 POST /api/v1/replacements: 1 gap
- Lücke: `search.ersatz` (core suche.ts:215) takes no situation (raum, ohneSchrift, termine) and does not check the Wissensart-Bindung of the chain step.

---

## 4 MCP (apps/server/src/mcp/server.ts)

Server init `new McpServer({ name, version })` (40–43) has **no `instructions`**. Nothing tells a calling AI how to proceed overall.

| # | Tool (line) | Input fields | Missing compared with REST / FMT 2.0 | Description status |
|---|---|---|---|---|
| 1 | search_methods (70) | text, lernfunktion, engagement, anleitung, interaktion, raumzeit, reichweite, ansatz, status, liefert, vorhanden, maxDauer, gruppe, maxTechnik, ohneInternet, ohneKI, bildungsstufe, vorwissen, raum, raumbedarf, ohneRaumbedarf, schriftbedarf, minEvidenz, eintragsart, fachbereich, fuerFachbereich, fach, limit | FMT 2.0 complete. The old facets weltbezug, adaptivitaet, feedback, repraesentation, rolle, aufgabe and sequenz are missing (REST has them). The hits leave out raumbedarf, schriftbedarf and termineMin. | „Facettierte Suche über alle N FMT-Unterrichtsmethoden (… 13 Facetten …)“. N includes the Hilfen. It mentions neither Raum/Schrift/Eintragsart nor what a Hilfe is → Lücke |
| 2 | get_method (160) | kennung | returns everything (OK) | „Liefert das vollständige 13-Facetten-Profil, Durchführungsschritte, … Evidenz …“. It does not mention Bedarf, Eignung (eignungsgrund), Eintragsart, Evidenzbezug or Einordnung in Ketten → Lücke |
| 3 | compare_methods (179) | methodeA, methodeB | compares only `bundle.facetten` (194). It has no Bedarf, Eignung, Eintragsart or Evidenzbezug | „Vergleicht zwei FMT-Bausteine Facette für Facette“ → Lücke |
| 4 | match_scenario (214) | all 37 felder() incl. zielart, raum, lernort, raumBietet, fachausstattungArt, termine, nachweis, begleitziel, ohneSchrift, komplexitaet, sprachniveau, lehrende, thema, einheit, bewertet, planungsprofil, variante, bildungsstufe, fachbereich, limit | the same as REST (OK) | „Deterministische 5-Stufen-Zuordnung … inkl. didaktischem Ansatz (ohne Halluzinationen, <1 ms)“. It does **not** mention pflichtangaben, regelmeldungen or begleitstrang → Lücke |
| 5 | validate_arrangement (301) | arrangement | – | R-00..R-12 OK. It does not say that the Passungsregeln are not checked here → small Lücke |
| 6 | suggest_replacements (318) | arrangement, pfad | no situation (raum, ohneSchrift, termine); no Bindung | „formal gültige Ersatzbausteine … live gegen R-00..R-12“ → Lücke (no Bedarf) |
| 7 | list_vocabularies (340) | scheme | REST /meta has wfelder, arten, merkmale and planungsprofile, but these are **missing**. ketten without schritte/wissensart (364); no teilgruppen table | „Listet alle FMT-Vokabulare, Funktionsketten, Passungsregeln …, Raumtypen, Zielarten, Binnendifferenzierungs-Personas und Anfragefelder“ → partly out of date |
| 8 | search_wlo_oer (376) | query, fach, fachbereich, bildungsstufe (hard enum), inhaltstyp, nurOffeneLizenz, maxItems | – | OK (not affected) |
| 9 | score_differentiation_matrix (403) | quickProfileId, personaId, selectedValues, minScore, limit, maxTechnik, ohneInternet, ohneKI, includeSystemMeasures, maxAufwand, bildungsstufe, baustein | `ebenen` missing (REST has it). alternativeMethoden from the raw suggest (454) | describes vorgesehen, bedingung and gesperrt → OK, but „alternative Methoden“ go without the Tausch condition |
| 10 | build_scenario_plan (473) | text, fach, fachbereich, thema, lernziele, didaktischerAnsatz, ansatz, anleitung, engagement, interaktion, reichweite, zeitMin, gruppe, bildungsstufe, planungsprofil, vorwissen, maxTechnik, maxVorbereitung, variante, ohneInternet, ohneKI, zielart, raum, lernort, raumBietet, fachausstattungArt, ohneSchrift, termine, nachweis, begleitziel, includeWloOer, umfang, gruppen[id,label,count,personaId,profile,selectedValues] | **missing:** zieltyp, komplexitaet, sprachniveau, lehrende, einheit, bewertet, lernfunktion, liefert, raumzeit, vorhanden, modus; gruppen[].ohneSchrift/ohneBewegung (same as /plan) | the main text (474) mentions neither pflichtangaben nor regelmeldungen; only the `umfang` describe does („Pflichtangaben (fehlt/angenommen), Regelmeldungen …“). There is no hint to ask back → Lücke |
| 11 | elaborate_scenario (545) | arrangement, fach, thema, didaktischerAnsatz, akteure, lernziele, problemstellung, hinweise, bildungsstufe, planungsprofil, begleitziel, begleitstrang, oerRessourcen, useServerLlm | **missing compared with REST:** raum, anzahl, einheit, nachweis, hinweiseListe, text, entwurfTeilgruppen, differenzierung, phasen, materialien → the Rahmendaten in the Entwurf have no Raum, Anzahl or Einheit | describes the seven Kernfelder and the Planungsprofil → OK |
| 12 | generate_phase_material (625) | baustein, fach, thema, bildungsstufe, phaseLabel, dauerMin, materialTyp, hinweise, useServerLlm | **missing:** planungsprofil, gruppen (REST MaterialPayload has them); no Hilfe or Begleitstrang as material | old (7 material types) → small Lücke |
| 13 | classify_scenario_text (671) | text | no pflichtangaben in the answer | „… auf FMT-Filterskalen, Fach/Thema, passende Methoden und …Matrix-Merkmale“. `empfohlenerNaechsterSchritt` (684) points only to match or plan and never to asking back → Lücke |
| 14 | adapt_scenario (694) | scenarioText, baustein, lerngruppenText, arrangement, phasen[], gruppen[…, ohneSchrift, ohneBewegung], fach, fachbereich, thema, bildungsstufe, zeitMin, maxTechnik, ohneInternet, ohneKI, maxAufwand, includeSystemMeasures | **missing compared with REST/core:** `lehrende` (rule lehrkraft-nicht-doppelt), `anfrage` / raum / ohneSchrift for the situation (equivalence „Bedarf im selben Raum“), `ebenen` | describes passt/Hilfe/Tausch, beleg, abbau, gesperrt and regelmeldungen → OK |
| 15 | list_differentiation_options (759) | oberkategorie | – | describes vorgesehen, bedingung and gesperrteKategorien → OK |

Resources and prompts:
- Lücke: `fmt://catalog/summary` (782–808) has no eintragsart per entry; `anzahl` counts Methoden and Hilfen together.
- Lücke: `fmt://rules` (831–838) has only FMT_RULES (Kompositionsregeln), without the Passungsregeln (data/regeln.json).
- Lücke: prompt `design_learning_scenario` (889–913). The argument says „Beschreibung von Thema, Bildungsstufe, Zeit, Gruppengröße und Ziel“, which leaves out Fach, Raum, Zielart, Vorwissen, Sprachniveau, Teilgruppen, Begleitziel and Planungsprofil. The steps never say to read `pflichtangaben.fehlt` and ask back, or to name `angenommen` as an assumption.
- Lücke: prompt `audit_lesson_plan` (915–934) speaks of „13 FMT-Regeln“ and does not mention the Passungsregeln.

**Elicitation guidance (asked explicitly): Lücke.**
- No tool description and no server instructions tell the calling AI which details it should **ask its user for**. There is nowhere a list of Bildungsstufe, Fach/Thema, Zeit, Anzahl, Raum, Ziel/Zielart (the six Pflichtangaben), nor of the optional Vorwissen, Sprachniveau, Komplexität, Teilgruppen, Begleitziel, Planungsprofil, Termine, Nachweis and Lehrende.
- Nowhere is it said that `pflichtangaben.fehlt` signals the gaps to ask back about and `pflichtangaben.angenommen` (Feld, Wert, Grund) the assumptions to state. The only mention is a noun list in `umfang.describe` of build_scenario_plan („Pflichtangaben (fehlt/angenommen)“). match_scenario and classify_scenario_text do not mention the field at all.
- Good beginnings that exist: the field describes for `begleitziel` (238–240) and `ohneSchrift` (241–243) explain their effect. build_scenario_plan says „Ohne Zeitangabe wird eine Stunde von 45 Minuten geplant“ (474). The `teilgruppenMethoden` rule says „übernimm sie nur nach Rückfrage“ (briefings.ts:888).

---

## Top 10 gaps

1. Planner: Beispiele and the chain select use the hard-coded `createChainPreset` (arrangementOps.ts:114–373; PlannerPage 879, 2127) and set matchResult to null. This bypasses Kettenwahl, Bindung, Bedarf, Passungsregeln, pflichtangaben and begleitstrang.
2. MCP: there is no guidance to elicit from the user. No `instructions` (server.ts:40); match_scenario, build_scenario_plan, classify and the prompt design_learning_scenario do not say to read `pflichtangaben.fehlt` and ask back or to name `angenommen` (216, 474, 684, 893).
3. /plan and build_scenario_plan drop komplexitaet, sprachniveau, lehrende, einheit, bewertet and zieltyp (briefings.ts:488–537, 626–654; server.ts:476–533). `bewertet` has no effect anywhere.
4. Planner step 1: Vorwissen and Bildungsstufe from „Mehr Angaben“ never reach the matcher (PlannerPage 2072–2093 vs 780–829). Sprachniveau, Komplexität, Nachweis, Einheit, bewertet, Planungsprofil and Lehrende (numeric) are missing as inputs.
5. Old alternative paths: `suggestAlternativeMethodsForGroup` in VerlaufsplanView.tsx:318, DifferentiationMatrixPanel.tsx:920, /differentiation/score and score_differentiation_matrix. `compatibleAlternatives` (VerlaufsplanView 99–115) and `search.ersatz` (/replacements, suggest_replacements, PartiturView 115) have no Bedarf, Bindung or istGleichwertig.
6. MethodDetailPage: Eignung (`eignungsgrund`) is not shown, and it stands under the old „Q2 Bedingungen“ (299, 306). There is no Einordnung in Ketten or Lesarten, and only Bedarf is grouped by W-Feld.
7. AI path in the planner and translate: the prompt knows only five old zieltyp chains, not zielart, handlung, begleitziel or raum (assistant.ts:946–956). Only text is sent, so the „Fehlt noch“ completions get lost (PlannerPage 831–854, 994).
8. MCP compared with REST: elaborate_scenario lacks raum, anzahl, einheit and nachweis; adapt_scenario lacks lehrende and anfrage/raum; generate_phase_material lacks planungsprofil; list_vocabularies lacks wfelder, arten, merkmale and planungsprofile; fmt://rules has no Passungsregeln.
9. Planner step 2: it does not show the Merkmal of exclusions (ausgeschlossen.rahmen/nichtVerankert), the Evidenzbezug or genannteHilfen. Passungsregeln are not re-checked after a manual method swap.
10. ComparePage and DifferentiationPage are out of date. Compare has no Bedarf, Eignung, Eintragsart or Evidenzbezug rows (ComparePage 27–41). DifferentiationPage shows only Matrix-% and alternatives, without passt/Hilfe/Tausch, abbau or gesperrt (1039–1058). In addition, ApiMcpPage lacks several new fields and has old tool texts (6–23, 122–135, 162–190).
