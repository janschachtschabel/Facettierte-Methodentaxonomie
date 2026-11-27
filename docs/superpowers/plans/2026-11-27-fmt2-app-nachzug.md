# FMT 2.0 App-Nachzug: Seiten, Baukasten, REST und MCP auf den neuen Stand

**Goal:** Every entry point of the app (pages, Baukasten, REST, MCP) uses and shows the FMT 2.0 systematics; no path bypasses the core logic. The MCP tells a calling AI what to elicit from its user.

**Spec:** docs/superpowers/specs/2026-11-26-fmt2-w-raster-design.md (§5–§8). **Gap list (binding input, file:line):** docs/qualitaet/2026-11-27-fmt2-app-pruefung.md.

## Global Constraints
- German in UI/data/docs/commits; code comments English. Never use „Anforderung“, „Bedingung“ (for the situation), „Bedingungsraum“, „Lernort“ (for room types; only as accepted input alias), „Ergänzende Merkmale“.
- No change to data/bausteine/*.json. No LLM chooses a method. ausgang.json never rewritten, `bekannt` never loosened.
- Baukasten concept (Jan): no preselection, one main action per step, plain language; changes for the whole class only as proposals to take over. UI texts in „du“.
- TDD for code. `npm run build:data` before server/web tests.
- Core is the single source of decisions: UI, REST and MCP call core functions (matcher, regeln, teilgruppen, nurMethoden/istMethode, lesart, planungsprofil) instead of own logic.

## Task N1: REST/Kern-Parität und alte Kandidatenpfade
Audit §3, §2 (old candidate filters), top gaps 3, 5, 7.
- /api/v1/plan (briefings.ts ScenarioPlanArgs + matchReq) passes every field of `matcher.felder()` (komplexitaet, sprachniveau, lehrende, einheit, bewertet, zieltyp, lernfunktion, liefert, raumzeit, vorhanden …); gruppen[] accept ohneSchrift/ohneBewegung like /adapt. `bewertet` reaches the Entwurf (Rahmendaten and Sicherung des Lernerfolgs name it) and /assistant/elaborate accepts it.
- /api/v1/classify returns `pflichtangaben` (fehlt/angenommen) from the core.
- Alternatives for subgroups (`suggestAlternativeMethodsForGroup` callers: /differentiation/score, score tool) only return methods (istMethode) whose Bedarf fits the given situation and, when a planned method is given, that are gleichwertig (core `istGleichwertig`); otherwise label them „ohne Gleichwertigkeitsprüfung“. `search.ersatz` (/replacements) accepts the situation (raum, ohneSchrift, termine) and respects Wissensart-Bindung of the chain step.
- /assistant/translate prompt: zielart (nine values incl. handlung), begleitziel, raum, ohneSchrift, termine, nachweis, planungsprofil, chain vollstaendige-handlung; accepts optional structured fields alongside text and merges them (structured wins).
- /meta: add ketten (schritte, wissensart), teilgruppen table, counts methoden/hilfen. /methods: ohneSchrift alias, termine filter, gesamt split.

## Task N2: MCP auf FMT-2.0-Stand, Hinweise zum Erfragen
Audit §4, top gaps 2, 8.
- `new McpServer(..., { instructions })` with a short German guide for the calling AI: which details to elicit from its user — required (Bildungsstufe, Fach/Thema, Zeit, Gruppengröße, Raum, Ziel/Zielart) and optional (Vorwissen, Sprachniveau, Komplexität, Teilgruppen with Merkmalen, Begleitziel, Planungsprofil, Termine, Nachweis, Lehrende); always read `pflichtangaben.fehlt` and ask back for those (one short question, not a form), state `pflichtangaben.angenommen` as assumptions; never let the AI pick methods itself; mark what it generated vs. what came from the catalog; describe groups, not individuals.
- Each relevant tool description gets one line „Erfrage beim Nutzer: …“ and, where the answer has it, „Lies pflichtangaben.fehlt und frage nach“. classify_scenario_text returns pflichtangaben and its `empfohlenerNaechsterSchritt` says to ask back when fehlt is not empty.
- Input parity with REST: build_scenario_plan (all felder incl. zieltyp, komplexitaet, sprachniveau, lehrende, einheit, bewertet; gruppen ohneSchrift/ohneBewegung), elaborate_scenario (raum, anzahl, einheit, nachweis, hinweiseListe, bewertet), adapt_scenario (lehrende, anfrage/raum/ohneSchrift, ebenen), generate_phase_material (planungsprofil, gruppen), score_differentiation_matrix (ebenen), suggest_replacements (situation), search_methods (missing old facets; hits carry raumbedarf/schriftbedarf/termineMin/eintragsart).
- Descriptions updated: search_methods, get_method (Bedarf, Eignung, Eintragsart, Evidenzbezug, Ketten), compare_methods (also compares Bedarf, Eignung, Eintragsart, Evidenzbezug), match_scenario (pflichtangaben, regelmeldungen, begleitstrang, planungsprofil), validate_arrangement (Passungsregeln not checked here; use match/plan), list_vocabularies (+ wfelder, arten, merkmale, planungsprofile, ketten with schritte, teilgruppen), generate_phase_material.
- Resources: catalog/summary with eintragsart and split counts; fmt://rules adds the Passungsregeln. Prompts design_learning_scenario and audit_lesson_plan rewritten for FMT 2.0 including the ask-back step.
- MCP test: instructions present and name pflichtangaben; field parity test extended to build_scenario_plan.

## Task N3: Baukasten Schritt 1 und 5 (Angaben erreichen den Kern)
Audit §2 step 1, step 5, top gaps 4, 7.
- „Mehr Angaben“: Vorwissen and Bildungsstufe reach the match request. New optional inputs (collapsed, nothing preselected): Sprachniveau, Komplexität, Nachweis, übergeordnete Einheit, bewertet (ja/nein), Planungsprofil (Auswahl, leer = aus Stufe abgeleitet), Lehrende (Zahl), Fachausstattung. All go into `buildStructuredMatchRequest`; Lehrende text stays as free text for the Entwurf.
- Summary line names all optional fields incl. Raum and Begleitziel.
- AI path: send the structured fields (incl. Fehlt-noch completions) with the text to /assistant/translate.
- Step 5: Planungsprofil can be changed there too (same state as step 1); einheit and bewertet reach the Entwurf.

## Task N4: Baukasten Beispiele, Kettenwahl und Schritt 2 über den Kern
Audit §2 (old code path, step 2), top gaps 1, 9.
- Beispiele become example *requests*: applying one fills step 1 fields and runs the core matcher (no hard-coded method lists, no `setMatchResult(null)`). The chain select „Funktionskette“ sets `zieltyp` in the request and re-runs the matcher keeping the user's context. `createChainPreset` is removed or only used by tests; vollstaendige-handlung covered.
- Step 2 shows: Merkmal of exclusions (`ausgeschlossen.rahmen[].merkmal`, `nichtVerankert[].merkmal`) in plain text, Evidenzbezug next to the grade, genannteHilfen.
- After a manual method swap the Passungsregeln are re-checked via the core (regeln engine on the current arrangement + request) so the warnings stay current.
- Swap candidates in Verlaufsplan (`compatibleAlternatives`) and Partitur (`search.ersatz`) and the step-3 matrix panel/Verlaufsplan subgroup alternatives use the core filters from N1 (methods only, Bedarf fits, Bindung, gleichwertig where applicable).

## Task N5: Seiten (Methode, Vergleich, Katalog, Differenzierung, Systematik, API)
Audit §1, top gaps 6, 10.
- MethodDetailPage: block „Eignung“ (Stufe, Vorwissen, Fachbereich, each with Grundlage and eignungsgrund/Quelle) replacing „Q2 Bedingungen“; block „Einordnung“ listing chains/steps the method can fill (core: Lernfunktion + traegtWissensart) with Lesart of its Vor-/Nachbedingungen; group Beitrag/Bedarf/Eignung/Einordnung by W-Feld as §8 says; for a Hilfe hide radar and Schnittstelle block and explain what it supports.
- ComparePage: rows Eintragsart, Raumbedarf, Schriftbedarf, Termine, Fachbereich/ungeeignet, Eignung, Evidenzbezug; label Hilfen in the picker.
- CatalogPage: Schriftbedarf filter lesen/schreiben via core search, Raumbedarf and Termine filters, all filters in the URL; optional Zielart/Evidenzbezug filter.
- DifferentiationPage: result cards show passt/Hilfe/Tausch with Beleg, Grundlage, abbau, gesperrt, grouping hints (reuse TeilgruppenEntscheidung component).
- SystematikPage: stages 4/5 name all Passungsregeln and the Begleitziel tolerance; a short section „Eintragsart Hilfe“; stale comment.
- ApiMcpPage: field table complete (zielart, komplexitaet, sprachniveau, lehrende, einheit, bewertet, raumBietet, fachausstattungArt; method fields eintragsart, raumbedarf, schriftbedarf, termineMin, eignungsgrund, evidenzBezug programm); tool and REST rows updated; a paragraph „Was die KI beim Nutzer erfragen soll“ mirroring the MCP instructions; SKOS fallback from data; footer version from data.

## Task N6: Abschluss
- Screenshots of the changed pages and Baukasten steps (Playwright, deviceScaleFactor 2) to /mnt/project-files/fmt2/bilder/n-*.png.
- Full suites, `npm run qualitaet` (no regression), README touch-up if counts/behaviour changed.
