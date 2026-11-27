# API und MCP fertigstellen

**Goal:** REST and MCP are complete and consistent relative to the core (FMT 2.0): every invalid input is reported in a readable way, both entry points take and return the same fields, and the last capabilities of the core (Passungsregeln for a given arrangement, search by goal type) are reachable from outside.

**Spec:** docs/superpowers/specs/2026-11-26-fmt2-w-raster-design.md. **Gap list (binding input, IDs R01–R27 with file:line):** docs/qualitaet/2026-11-27-api-restluecken.md.

## Global Constraints
- German in UI/data/docs/commits and in every error text; code comments English. Never use „Anforderung“, „Bedingung“ (for the situation), „Bedingungsraum“, „Ergänzende Merkmale“. „lernort“ only as accepted input alias.
- No change to data/bausteine/*.json except the gated change in Task A6. No LLM chooses a method. ausgang.json never rewritten, `bekannt` never loosened.
- Core is the single source: validation of codes, readable names and rule checks live in @fmt/core (or one shared server module) and REST and MCP both call it. No second copy of a value list.
- Error form: REST answers HTTP 400 `{ fehler: string, erlaubt?: string[] }` like /match and /plan today; MCP answers `errorResult(...)` (isError) with the same German text.
- Backwards compatible: existing valid requests keep working with the same answer, except where an answer gains fields. `maschinenlesbar.schemaVersion` is raised when its shape changes.
- TDD for code. `npm run build:data` before server/web tests. Tests: core, server, web all green; `npm run qualitaet:ausgang` without Verschlechterung.

## Task A1: Eingaben prüfen (REST und MCP)
Gaps R03, R06, R07, R11, R12, R13, R14, R15, R16, R17.
- One shared check for code fields of a situation and of search criteria (raum, lernort alias, raumBietet, bildungsstufe, maxTechnik, eintragsart, minEvidenz, planungsprofil, begleitziel, materialTyp, quickProfileId, personaId, maxAufwand, ebenen, zieltyp …) against the core value lists (`matcher.felder()` / schemes). Message like zuordnung.ts:447 incl. allowed values. `situationFehler` uses it.
- REST /methods: reads `limit` and `offset` (not criteria); unknown parameters → 400 naming them; unreadable numbers → 400; invalid codes → 400.
- REST /adapt, /differentiation/score, /replacements (top level and in `anfrage`/`situation`), /assistant/elaborate, /assistant/briefing, /assistant/material: same check, 400.
- Unknown `baustein` (set but not in catalog) → 400 / isError „Unbekannter Baustein …“ in /adapt, adapt_scenario, /differentiation/score, score_differentiation_matrix.
- MCP: adapt_scenario rejects empty input like REST, accepts alias `text`, wraps in try/catch; elaborate_scenario checks `typ === "Arrangement"` before both branches; classify_scenario_text rejects empty text.
- MCP schemas: `maxTechnik`, `bildungsstufe` as enums from the core in score_differentiation_matrix and generate_phase_material; `adapt_scenario.anfrage` as partial object of the request fields; number bounds come from one core constant used by both sides (decide the bound once; 0 allowed only where the core accepts it).

## Task A2: Lesbare und gleiche Antworten
Gaps R01, R04, R09, R10, R20, R21, R25, R26.
- Readable names of the Pflichtangaben live in the core (next to KI_PFLICHTANGABEN); MCP `empfohlenerNaechsterSchritt` and the web app use them (the web's own list goes).
- REST /methods hits and /methods/:kennung carry `eintragsart`, `evidenzgrad`; detail carries `einordnung` (same builder as MCP get_method). MCP search_methods hits carry Eignung (fachbereichUngeeignet, ungeeignetBeiStufe, ungeeignetBeiVorwissen, eignungsgrund), `evidenzBezug`, gruppeMin/Max, technik and a short `einordnung` (chain ids and steps). Use one shared hit builder for REST and MCP.
- Replacement candidates (/replacements, suggest_replacements) carry raumbedarf, schriftbedarf, termineMin and the list `ausgeschlossen[{baustein, merkmal, grund}]` from `ausschlussInSituation`.
- Plan `maschinenlesbar`: begleitziel, planungsprofil, raum and pflichtangaben.angenommen; schemaVersion raised; the Baukasten import reads them (test).
- REST /classify and /match answers equal the MCP ones (empfohlenerNaechsterSchritt, leitplanken, erkanntes Fach/Thema, erkannteMatrixMerkmale, vorschlaegeGesamt, limit) via shared builders; list_vocabularies gets the counts methoden/hilfen.
- adapt_scenario description: fix the semicolon sentence (R01). Prompt adapt_lesson_differentiation aligned with the adapt_scenario description (ask for Raum and Lehrende; read teilgruppenImpulse with beleg/abbau, gesperrt, regelmeldungen; groups, not individuals).

## Task A3: Gleiche Eingaben
Gaps R22, R23, R24.
- elaborate (REST and MCP) accepts `regelmeldungen` in the plan's form and shows them in the Entwurf with Regel, Wirkung and Grundlage (the web sends them).
- elaborate_scenario accepts `planungsprofilAngenommen` and oerRessourcen `url`, `lizenz`, `notiz` (`wwwurl` optional when `url` is given).
- `lernort` alias and `situation` object accepted the same way in score_differentiation_matrix, adapt_scenario, suggest_replacements as in REST; build_scenario_plan accepts `gruppen[].genannt`. The different `umfang` default (REST voll, MCP kompakt) stays and is documented in the tool description and ApiMcpPage.

## Task A4: Neue Wege nach außen
Gaps R08, R19.
- Search filter `zieltyp` (chain id) and optional `kettenschritt` in core `search.suche` via `einordnungInKetten`; offered in REST /methods and MCP search_methods (enum from the chains).
- /validate and validate_arrangement accept an optional `situation` (the request fields) and then also return `regelmeldungen` for the methods of the arrangement from `passungNeuPruefen`/`regelLageAus`. Without situation the answer stays as today. Descriptions updated.

## Task A5: Keine alten Warnungen nach dem Leeren
Gap R02.
- Core: `passungNeuPruefen` (or a sibling) recomputes the situation messages too (begleitziel-braucht-termine, Nachweis, Sicherheitshinweis, …) for the current request, not only per-method warnings.
- Web: fields the user cleared in „Mehr Angaben“ are removed from the rule situation (no fallback to the old answer's value). Test: set Sprachniveau, clear it, warning gone.

## Task A6: Doku, Ontologie und zwei Datenentscheidungen
Gaps R05, R18, R27 (ontology part only; no OpenAPI).
- README and docs/DEPLOYMENT-UND-KONFIGURATION.md: 15 tools, full list with current texts, current counts; note that MCP schema errors come as SDK text with isError (R18), also on ApiMcpPage.
- `fmt:evidenzBezug` into the ontology (build-artefacts.ts).
- Lesart for zielart `handlung` (ruling, see ledger): its own reading key `handlung` with wording for practical work tasks (Handgriff, Arbeitsauftrag) instead of the sport reading; vocab.json zielart handlung `lesart: "handlung"`, lernzustand texts added. Only after the independent gate in pruefung/api-tor.md.
- data/bausteine/stummer-impuls.json: drop `enaktiv` from repraesentation, only after the same gate.

## Task A7: Abschluss
- Final whole-branch review, one fix wave, full tests, qualitaet:ausgang, PR, CI, merge.
