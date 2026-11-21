# FMT Methodendatenbank Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Dockerized FMT Methodendatenbank (100 curated/sourced teaching methods for German education, editorial React web app with profile graphics & interactive modular scenario score, REST/Linked-Data API with `w3id.org` content negotiation, Remote/stdio MCP server, and OpenAI-compatible hybrid LLM assistant) in `janschachtschabel/Facettierte-Methodentaxonomie`.

**Architecture:** TypeScript npm-workspaces monorepo (`data/` single source of truth → `packages/fmt-core` deterministic validator/search/matcher & SKOS/JSON-LD/bundle generator → `apps/server` unified Fastify HTTP + MCP Streamable HTTP + LLM proxy/cache → `apps/web` React/Vite editorial SPA with local catalog caching and client-side `fmt-core`). Everything ships in one multi-stage Node 22 Alpine Docker image.

**Tech Stack:** TypeScript 5.x, Node 22, npm Workspaces, Vitest, Fastify 5 (`@fastify/static`, `@fastify/compress`, `@fastify/cors`, `@fastify/rate-limit`), `@modelcontextprotocol/sdk`, React 19, Vite 6, React Router 7, `@fontsource/barlow-semi-condensed`, `@fontsource/literata`, `n3`, `ajv`, `jsonld`, Docker.

**Spec:** `docs/superpowers/specs/2026-11-21-fmt-methodendatenbank-design.md`

## Global Constraints

- **Licenses:** Software code under `Apache-2.0` (`LICENSE`); all data, taxonomy, vocabularies, method descriptions, and graphics under `CC-BY 4.0` (`LICENSE-CONTENT.md`, `dct:creator "Jan Schachtschabel"`, `dct:license <https://creativecommons.org/licenses/by/4.0/>`).
- **Four FMT Guardrails (always enforced in UI, API, MCP & LLM):**
  1. Validator is a structural filter, never a quality seal.
  2. Every rule message (`R-00`–`R-12`) carries and displays its basis (`formal`, `[E]`, `[S]`, `[A]`).
  3. High-inference facets (`A1`, `D1`) are clearly presented as expert judgements, not objective facts.
  4. Evidence always names grade (`A`/`B`/`C`), source, scope (`geltung`), and counter-position (`umstritten`); Grade `A` requires `>= 2` independent syntheses (`;` separated).
- **Zero-Key Operation:** App, search, matcher, validator, REST/Linked-Data API, and MCP server must work completely without `LLM_API_KEY`.
- **LLM Configuration:** OpenAI-compatible via `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`; optional BYOK (`LLM_ALLOW_BYOK`, default `true`) restricted to server-configured endpoint or fixed public HTTPS provider allowlist (never proxy arbitrary user `baseUrl`).
- **Editorial Design DNA:** Paper `#EEF2EE` / surface `#F8FAF7` (Dark `#0F1B26` / `#162533`), 4 domain colors A `#2C5D8A` / B `#9A6A12` / C `#3F7343` / D `#7A4E7E`, locally bundled `Barlow Semi Condensed` & `Literata` (no external Google Fonts requests).
- **Repository Hygiene:** GitHub repo `janschachtschabel/Facettierte-Methodentaxonomie` gets the clean monorepo; `wissen/` stays local and gitignored.

## Review Focus

1. **Corrupted or stale browser cache (`localStorage`):** Invalid JSON or outdated schema in `localStorage` must silently fall back to fetching `/api/v1/catalog` without crashing `apps/web` (tested in Task 7).
2. **LLM invalid JSON, hallucinated enum codes, or upstream timeout:** `/api/v1/assistant/translate` must validate LLM output against `anfrage.schema.json` and transparently fall back to deterministic `lesen()` instead of returning HTTP 500 (tested in Task 6).
3. **SSRF & secret leakage in BYOK mode:** Arbitrary internal/custom `baseUrl` headers (e.g. `http://169.254.169.254`, `http://localhost:11434`) must be rejected with HTTP 400; BYOK API keys must never be logged or share the default server cache (tested in Task 6).
4. **Canonical `w3id.org` routes vs. SPA fallback:** `/baustein/:id` with `Accept: application/ld+json` returns JSON-LD, with `Accept: text/html` redirects to `/methoden/:id`, while hard-reloading `/methoden/:id` or `/planer` always serves the SPA `index.html` (tested in Task 5).
5. **Malformed/cyclic JSON-LD import or empty composite slots in `/planer`:** Importing broken/cyclic arrangements or removing all steps must never crash `PartiturView` or `TimelineBandSvg` and must surface `R-00`–`R-12` messages cleanly (tested in Task 8).

---

### Task 1: Git Repository Wiring, Licenses & Monorepo Scaffolding

**Files:**
- Create: `.gitignore`, `LICENSE-CONTENT.md`, `.env.example`, `package.json`, `tsconfig.base.json`
- Create: `packages/fmt-core/package.json`, `packages/fmt-core/tsconfig.json`
- Create: `apps/server/package.json`, `apps/server/tsconfig.json`
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`
- Preserve from remote: `LICENSE` (Apache-2.0)

**Interfaces:**
- Produces: Working npm workspace monorepo (`@fmt/core`, `@fmt/server`, `@fmt/web`) wired to `origin` (`https://github.com/janschachtschabel/Facettierte-Methodentaxonomie.git`) on `main`, with root scripts `build`, `build:data`, `test`, `dev`, `start`.

- [ ] **Step 1: Initialize git repo & sync with remote `main` cleanly**
  Initialize git in workspace root, add remote `origin https://github.com/janschachtschabel/Facettierte-Methodentaxonomie.git`, fetch `main`, checkout `main` preserving local `.agents/`, `docs/`, `wissen/`, and `Die Facettierte Methodentaxonomie...md` untouched.

- [ ] **Step 2: Create `.gitignore`, `LICENSE-CONTENT.md` (CC-BY 4.0 Jan Schachtschabel), and `.env.example`**
  - `.gitignore` excludes `node_modules/`, `dist/`, `dist-data/`, `wissen/`, `Die Facettierte Methodentaxonomie*.md`, `.env`, `.agents/`, `*.log`, `.DS_Store`.
  - `.env.example` documents `PORT=8080`, `LLM_BASE_URL=`, `LLM_MODEL=`, `LLM_API_KEY=`, `LLM_ALLOW_BYOK=true`, `LLM_RATE_LIMIT_PER_MIN=20`, `LLM_CACHE_MAX=500`, `LLM_CACHE_TTL_MS=3600000`, `CORS_ORIGIN=*`.

- [ ] **Step 3: Create root `package.json`, `tsconfig.base.json`, and workspace `package.json`/`tsconfig.json` files**
  - Root scripts:
    - `build:data`: `npm -w @fmt/core run build && npm -w @fmt/core run build:artefacts`
    - `build`: `npm run build:data && npm -w @fmt/web run build && npm -w @fmt/server run build`
    - `test`: `npm -w @fmt/core test && npm -w @fmt/server test && npm -w @fmt/web test`
  - Install dependencies via `npm install`.

- [ ] **Step 4: Verify workspace installation and git status**
  Run: `npm ls --workspaces --depth=0 && git status --short`
  Expected: All 3 workspaces (`@fmt/core`, `@fmt/server`, `@fmt/web`) resolved with exit code 0; `wissen/` ignored.

- [ ] **Step 5: Commit**
  Commit monorepo scaffolding, licenses, and spec/plan docs on `main`.

---

### Task 2: Data Migration (`data/`) & Deterministic Core (`packages/fmt-core`)

**Files:**
- Create: `data/meta.json`, `data/vocab.json`, `data/ketten.json`, `data/crosswalk/oeh-didacticPlanningTools.json`, `data/beispiele/dichte-reihe.json`, `data/beispiele/modul-stoffe.json`, `data/beispiele/fehlerhafte-reihe.json`
- Create: `data/bausteine/<22-existing-ids>.json` (one JSON file per block, migrated from `wissen/fmt/src/data.js`, enriched with `status: "kuratiert"`, `kurzbeschreibung`, `piktogramm`, `ansatz`, `quellen`)
- Create: `packages/fmt-core/src/types.ts`, `packages/fmt-core/src/rules.ts`, `packages/fmt-core/src/validate.ts`, `packages/fmt-core/src/suche.ts`, `packages/fmt-core/src/zuordnung.ts`, `packages/fmt-core/src/index.ts`
- Test: `packages/fmt-core/test/core.test.ts`

**Interfaces:**
- Consumes: `data/*.json` loaded as `FmtData`.
- Produces (exported from `@fmt/core`):
  - Types: `FmtData`, `Scheme`, `FacetMeta`, `Funktionskette`, `Baustein`, `Quelle`, `Arrangement`, `ArrangementNode`, `ValidationResult`, `ValidationMessage` (includes `grundlage: 'formal' | 'E' | 'S' | 'A'`), `SearchCriteria`, `ReplacementCandidate`, `MatchRequest`, `MatchResult`, `RuleMeta`, `CatalogBundle`, `PiktogrammId`.
  - Constants: `FMT_RULES: RuleMeta[]`, `PIKTOGRAMME: readonly PiktogrammId[]`.
  - Functions: `createValidator(data: FmtData)`, `createSearch(data: FmtData, validator?)`, `createMatcher(data: FmtData, validator)`.

- [ ] **Step 1: Write failing core test suite in `packages/fmt-core/test/core.test.ts`**
  Include all validator tests (`dichte-reihe` valid 0 warnings, `modul-stoffe` inherits states, `fehlerhafte-reihe` triggers `R-01`..`R-11`, `R-12` cyclic/orphan, `nachKernphase`, single retrieval consolidates + `R-07` warns, empty composite `R-11`, open core phase `R-05`, `primar` `R-06`, every message carries `grundlage`), search tests (synonyms `jigsaw`/`Lernzirkel`/phase `Einstieg`, `ansatz` filter, `status` filter, `ersatz()`), and matcher tests (5 stages, `phase` & `ablauf` modes, German free-text `lesen()`, invalid value throws).

- [ ] **Step 2: Run test to verify it fails**
  Run: `npm -w @fmt/core test`
  Expected: FAIL (missing modules).

- [ ] **Step 3: Migrate `wissen/fmt/src/data.js` and crosswalk into `data/`**
  - Add 23rd SKOS ConceptScheme `ansatz` in `data/vocab.json` with the 12 didactic traditions (`instruktion`, `kooperativ`, `forschend`, `offen`, `diskurs`, `kreativ`, `visualisierung`, `uebung`, `diagnose-feedback`, `reflexion`, `spiel-simulation`, `digital-ki`).
  - Split the 22 existing blocks into `data/bausteine/<kennung>.json` with `status: "kuratiert"`, `kurzbeschreibung`, `piktogramm`, `ansatz`, and verified `quellen`.
  - Copy `oeh-didacticPlanningTools.json` into `data/crosswalk/`.

- [ ] **Step 4: Implement `packages/fmt-core/src/{types,rules,validate,suche,zuordnung,index}.ts`**
  - Port logic cleanly with 100% behavioral parity to `wissen/fmt/src/{validate,suche,zuordnung}.js`.
  - Attach `grundlage` from `FMT_RULES` onto every `ValidationMessage`.
  - Support `ansatz`, `status`, and `kurzbeschreibung` text search in `suche.ts`.

- [ ] **Step 5: Run tests & build to verify PASS**
  Run: `npm -w @fmt/core run build && npm -w @fmt/core test`
  Expected: All core tests PASS.

- [ ] **Step 6: Commit**
  Commit `data/` migration and `packages/fmt-core` engine.

---

### Task 3: Artefact Build Pipeline (`build-artefacts.ts`) & Semantic-Web Verification

**Files:**
- Create: `packages/fmt-core/src/load-data.ts` (Node file loader reading `data/` into `FmtData`)
- Create: `packages/fmt-core/scripts/build-artefacts.ts`
- Test: `packages/fmt-core/test/artefacts.test.ts`

**Interfaces:**
- Consumes: `data/` files and `@fmt/core` (`createValidator`, `createMatcher`, `FMT_RULES`, `PIKTOGRAMME`).
- Produces (`dist-data/`):
  - `vocabs/*.ttl` (23 schemes + `funktionskette.ttl`, with `dct:creator` & `dct:license`)
  - `ontologie.ttl` (adds `fmt:Quelle`, `fmt:quelltyp`, `fmt:status`, `fmt:ansatz`)
  - `context.jsonld` (maps `kurzbeschreibung`, `quellen`, `ansatz`, `status`, `dct:creator`, `dct:license`)
  - `fmt.schema.json` & `anfrage.schema.json`
  - `bausteine/*.jsonld`, `bausteine/katalog.jsonld` (with `@context`, `dct:creator`, `dct:license`, UI-only `plot`/`ki`/`piktogramm` stripped)
  - `beispiele/*.jsonld`
  - `catalog.bundle.json` (`{ version, versionHash, builtAt, creator, license, NS, schemes, facetten, ketten, bausteine, beispiele, oeh, rules }`)

- [ ] **Step 1: Write failing semantic-web & schema test suite in `packages/fmt-core/test/artefacts.test.ts`**
  Assert:
  - All 24 Turtle files (`vocabs/*.ttl` + `ontologie.ttl`) parse via `n3` with `prefLabel`, `inScheme`, `dct:creator`, `dct:license`.
  - `fmt.schema.json` (Ajv 2020-12) accepts every exported `bausteine/*.jsonld` and `beispiele/*.jsonld` and rejects unknown vocab codes and unknown keys.
  - `jsonld.expand` + `toRDF` resolves every vocabulary property (including `ansatz`) into `https://w3id.org/fmt/vocab/` and produces valid RDF quads.
  - OEH crosswalk check fails on missing IRIs and resolves all used `kategorie` labels.
  - Every block has `>= 1` `quellen` entry, valid `piktogramm`, and Grade-A findings cite `>= 2` syntheses (`;`).
  - `catalog.bundle.json` contains deterministic 64-char hex `versionHash` matching SHA-256 of canonical catalog content.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npm -w @fmt/core test -- test/artefacts.test.ts`
  Expected: FAIL (`dist-data` not generated yet).

- [ ] **Step 3: Implement `packages/fmt-core/src/load-data.ts` and `packages/fmt-core/scripts/build-artefacts.ts`**
  Port SKOS/RDFS/JSON-LD/JSON-Schema generation from `wissen/fmt/src/build.js` with the Section 5.1 extensions and SHA-256 `versionHash` generation.

- [ ] **Step 4: Build artefacts and verify all tests pass**
  Run: `npm run build:data && npm -w @fmt/core test`
  Expected: `dist-data/` built cleanly and all core + artefact tests PASS.

- [ ] **Step 5: Commit**
  Commit build pipeline and semantic-web tests.

---

### Task 4: Expand Catalog to 100 German Teaching Methods (`data/bausteine/*.json`)

**Files:**
- Create: 78 new JSON files in `data/bausteine/<kennung>.json` (total = 100 blocks)
- Modify: `packages/fmt-core/test/artefacts.test.ts` (add 100-method coverage & source-quality assertions)

**Interfaces:**
- Consumes: `data/vocab.json`, `data/crosswalk/oeh-didacticPlanningTools.json`, `fmt.schema.json`.
- Produces: Exactly 100 schema-valid, OEH-mapped, sourced building blocks spanning all 12 `ansatz` traditions, `R1`–`R3`, all 11 learning states (`>= 2` blocks producing each state), and all 4 quadrants of Guidance × Engagement.

- [ ] **Step 1: Add failing 100-method coverage & quality assertions to `packages/fmt-core/test/artefacts.test.ts`**
  Assert: `bausteine.length === 100`, all 12 `ansatz` values covered (`>= 4` each), every `lernzustand` produced by `>= 2` blocks, every block has `quellen` with valid `https://` URLs where `quelltyp` is `wikipedia` or `oer`, all 78 new blocks have `status: "entwurf"`, and all 5 function chains compose valid arrangements via `zuordnung`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npm -w @fmt/core test -- test/artefacts.test.ts`
  Expected: FAIL (only 22 blocks exist).

- [ ] **Step 3: Author the 78 new building blocks across all 12 didactic areas**
  Use parallel authoring batches (covering all 12 categories from Spec Section 5.2), verifying Wikipedia DE / bpb / ZUM / OEH URLs and applying strict evidence discipline (Grade `C` default unless backed by verified FMT meta-analyses; every `evidenz` entry has `geltung`; every `kategorie` IRI verified against `data/crosswalk/oeh-didacticPlanningTools.json`; consistent `plot` coordinates derived from `anleitung` & `engagement`).

- [ ] **Step 4: Build artefacts and run full `@fmt/core` test suite**
  Run: `npm run build:data && npm -w @fmt/core test`
  Expected: 100 blocks pass SKOS, JSON-Schema, JSON-LD expansion, OEH crosswalk, evidence, coverage, validator, search, and matcher tests.

- [ ] **Step 5: Commit**
  Commit all 78 new building blocks and updated coverage tests.

---

### Task 5: Unified Server (`apps/server`) – In-Memory Store, REST API, Caching/ETag, Linked Data & `w3id.org` Content Negotiation

**Files:**
- Create: `apps/server/src/config.ts`
- Create: `apps/server/src/catalog-store.ts`
- Create: `apps/server/src/routes/api.ts`
- Create: `apps/server/src/routes/linked-data.ts`
- Create: `apps/server/src/app.ts` (Fastify app factory, testable via `app.inject`)
- Create: `apps/server/src/index.ts` (entrypoint starting server on `PORT`)
- Test: `apps/server/test/api.test.ts`

**Interfaces:**
- Consumes: `dist-data/` artefacts and `@fmt/core`.
- Produces: `buildApp(options)` returning configured Fastify instance serving:
  - `GET /healthz`
  - `GET /api/v1/meta`, `GET /api/v1/catalog` (`ETag` + `304`), `GET /api/v1/methods`, `GET /api/v1/methods/:kennung`, `GET /api/v1/fields`, `GET /api/v1/schema`, `GET|POST /api/v1/match`, `POST /api/v1/validate`, `POST /api/v1/replacements`
  - Backwards-compatible v0.7.0 aliases: `GET|POST /zuordnung`, `GET /felder`, `GET /schema`, `GET /bausteine/:kennung` (JSON or JSON-LD)
  - Linked Data extension routes: `GET /vocabs/:scheme.ttl`, `GET /ontologie.ttl`, `GET /context.jsonld`, `GET /bausteine/katalog.jsonld`, `GET /bausteine/:kennung.jsonld`, `GET /beispiele/:id.jsonld`, `GET /schema/fmt.schema.json`, `GET /schema/anfrage.schema.json`
  - Canonical `w3id.org` content negotiation: `GET /baustein/:kennung`, `GET /vocab/:scheme`, `GET /vocab/:scheme/`, `GET /vocab/:scheme/:code`, `GET /ns`
  - Static SPA serving (`apps/web/dist`) with SPA history fallback for `/methoden/*`, `/planer`, `/vergleich`, `/systematik`, `/api-mcp`.

- [ ] **Step 1: Write failing API, caching & content-negotiation tests in `apps/server/test/api.test.ts`**
  Cover: `/healthz`, `/api/v1/meta`, `/api/v1/catalog` `ETag` & `If-None-Match` → `304`, `/api/v1/methods?text=jigsaw`, `/api/v1/match` (phase & ablauf & 400 on bad code), `/api/v1/validate`, `/api/v1/replacements`, v0.7.0 aliases (`/zuordnung`, `/felder`, `/schema`), Linked Data content types (`text/turtle`, `application/ld+json`), and **Review Focus #4** (`/baustein/gruppenpuzzle` with `Accept: application/ld+json` → 200 JSON-LD vs `Accept: text/html` → 302 `/methoden/gruppenpuzzle`; `/methoden/gruppenpuzzle` serves SPA fallback when static dir exists).

- [ ] **Step 2: Run test to verify it fails**
  Run: `npm -w @fmt/server test -- test/api.test.ts`
  Expected: FAIL (modules missing).

- [ ] **Step 3: Implement `config.ts`, `catalog-store.ts`, `routes/api.ts`, `routes/linked-data.ts`, `app.ts`, `index.ts`**
  Load all `dist-data/` files into RAM once at startup; compute strong `ETag` from `versionHash`; register compression, CORS, rate-limiting, API/Linked-Data routes, and SPA fallback cleanly ordered so API/Linked-Data/MCP routes take precedence.

- [ ] **Step 4: Run server tests and TypeScript build**
  Run: `npm -w @fmt/server run build && npm -w @fmt/server test`
  Expected: All API, caching & content-negotiation tests PASS.

- [ ] **Step 5: Commit**
  Commit server core, REST API, caching, and Linked-Data routes.

---

### Task 6: MCP Server (`/mcp` Streamable HTTP + `stdio`) & Hybrid OpenAI-Compatible LLM Assistant

**Files:**
- Create: `apps/server/src/mcp/server.ts` (creates configured `McpServer` with 7 tools, 5 resource templates, 2 prompts)
- Create: `apps/server/src/mcp/http.ts` (mounts Streamable HTTP on `/mcp` in Fastify)
- Create: `apps/server/src/mcp/stdio.ts` (standalone stdio CLI entrypoint)
- Create: `apps/server/src/llm/cache.ts` (bounded LRU cache with TTL)
- Create: `apps/server/src/llm/client.ts` (OpenAI-compatible client, SSRF allowlist guard, strict timeout, key redaction)
- Create: `apps/server/src/routes/assistant.ts` (`/api/v1/assistant/translate`, `/api/v1/assistant/elaborate`)
- Modify: `apps/server/src/app.ts` (mount MCP & assistant routes)
- Test: `apps/server/test/mcp.test.ts`
- Test: `apps/server/test/assistant.test.ts`

**Interfaces:**
- Consumes: `CatalogStore`, `@fmt/core` (`suche`, `validate`, `zuordnung`, `ersatz`), `ServerConfig`.
- Produces:
  - MCP Streamable HTTP endpoint `POST|GET|DELETE /mcp` and `stdio` binary `apps/server/dist/mcp/stdio.js` exposing:
    - Tools: `search_methods`, `get_method`, `compare_methods`, `match_scenario`, `validate_arrangement`, `suggest_replacements`, `list_vocabularies`
    - Resources: `fmt://catalog/summary`, `fmt://method/{kennung}`, `fmt://vocab/{scheme}`, `fmt://schema/{name}`, `fmt://rules`
    - Prompts: `design_learning_scenario`, `audit_lesson_plan`
  - REST Assistant endpoints:
    - `POST /api/v1/assistant/translate` → `{ quelle: 'llm' | 'regeln-fallback', gecacht: boolean, hinweis?: string, anfrage, ergebnis }`
    - `POST /api/v1/assistant/elaborate` → `{ gecacht: boolean, pruefung, ausarbeitung: string, leitplanken: string[] }`

- [ ] **Step 1: Write failing MCP tests (`apps/server/test/mcp.test.ts`) and LLM assistant tests (`apps/server/test/assistant.test.ts`)**
  - `mcp.test.ts`: Connect real `@modelcontextprotocol/sdk` `Client` + `StreamableHTTPClientTransport` to `/mcp`; list tools/resources/prompts; invoke `search_methods`, `get_method`, `compare_methods`, `match_scenario`, `validate_arrangement`, `suggest_replacements`, `list_vocabularies`; read `fmt://catalog/summary` and `fmt://rules`.
  - `assistant.test.ts`: Spin up a local mock OpenAI-compatible HTTP server; test:
    - translate happy path + LRU cache hit (mock called only once for identical prompt),
    - elaborate happy path (validates arrangement first, includes 4 FMT guardrails),
    - **Review Focus #2:** mock returning invalid JSON, hallucinated enum (`bildungsstufe: "hogwarts"`), or 500/timeout → transparently falls back to deterministic `lesen()` with `quelle: 'regeln-fallback'`,
    - **Review Focus #3:** BYOK with allowed provider (`openai`) vs arbitrary internal `baseUrl` (`http://169.254.169.254/v1` → HTTP 400); verify BYOK bypasses shared cache and never echoes/logs the key,
    - zero-key mode (`LLM_API_KEY` unset): `translate` works via `regeln-fallback`, `elaborate` returns 503 with clear German message.

- [ ] **Step 2: Run tests to verify they fail**
  Run: `npm -w @fmt/server test -- test/mcp.test.ts test/assistant.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement MCP server (`mcp/{server,http,stdio}.ts`) and LLM assistant (`llm/{cache,client}.ts`, `routes/assistant.ts`)**
  - Enforce `anfrage.schema.json` validation via Ajv on LLM translate output; strip unknown/invalid fields or fall back to `lesen()`.
  - Fixed BYOK provider allowlist map: `openai` (`https://api.openai.com/v1`), `gemini` (`https://generativelanguage.googleapis.com/v1beta/openai`), `mistral` (`https://api.mistral.ai/v1`), `openrouter` (`https://openrouter.ai/api/v1`), or `server` (uses server's configured `LLM_BASE_URL` with user's key). Reject any raw `baseUrl` override with 400.

- [ ] **Step 4: Run full server test suite & build**
  Run: `npm -w @fmt/server run build && npm -w @fmt/server test`
  Expected: All API, MCP & Assistant tests PASS.

- [ ] **Step 5: Commit**
  Commit MCP server and hybrid LLM assistant.

---

### Task 7: Web-App Foundation (`apps/web`) – Editorial Design System, Client Cache Sync, Catalog, Profile Graphics, Detail & Compare

**Files:**
- Create: `apps/web/index.html`, `apps/web/vite.config.ts`, `apps/web/src/main.tsx`, `apps/web/src/App.tsx`
- Create: `apps/web/src/styles/tokens.css`, `apps/web/src/styles/global.css`
- Create: `apps/web/src/data/catalogCache.ts`, `apps/web/src/data/CatalogContext.tsx`
- Create: `apps/web/src/components/Layout.tsx`, `apps/web/src/components/MethodPictogram.tsx`, `apps/web/src/components/ProfileRadarSvg.tsx`, `apps/web/src/components/ControlBars.tsx`, `apps/web/src/components/InterfaceFlow.tsx`, `apps/web/src/components/EvidenceBadge.tsx`
- Create: `apps/web/src/pages/CatalogPage.tsx`, `apps/web/src/pages/MethodDetailPage.tsx`, `apps/web/src/pages/ComparePage.tsx`
- Test: `apps/web/test/cache-and-catalog.test.ts`

**Interfaces:**
- Consumes: `@fmt/core` (running directly in browser) and `GET /api/v1/meta`, `GET /api/v1/catalog`.
- Produces:
  - `loadCatalogWithCache(fetcher, storage)` with instant cached return + background `versionHash` revalidation.
  - `useCatalog()` hook providing `{ bundle, search, validator, matcher, status, refreshNotice, compareIds, toggleCompare, addToPlanner }`.
  - Complete Catalog (`/`), Method Detail (`/methoden/:kennung`), and Compare (`/vergleich`) pages matching FMT editorial tokens, locally hosted fonts, dark/light theme switch, and CC-BY 4.0 footer.

- [ ] **Step 1: Write failing tests in `apps/web/test/cache-and-catalog.test.ts`**
  Cover:
  - Instant cache hit when `versionHash` matches `/api/v1/meta` (no `/api/v1/catalog` refetch).
  - Background refresh when `versionHash` changes (updates storage & invokes callback).
  - **Review Focus #1:** Corrupted JSON or missing fields in `localStorage` silently resets cache and fetches `/api/v1/catalog`.
  - Client-side faceted search over the 100-method bundle executes in `< 20 ms` and finds synonyms (`Jigsaw`, `Einstieg`) and `ansatz`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npm -w @fmt/web test -- test/cache-and-catalog.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement editorial CSS tokens, fonts, `catalogCache.ts`, `CatalogContext.tsx`, SVG profile/pictogram components, and Catalog/Detail/Compare pages**
  - Bundle `@fontsource/barlow-semi-condensed` (500/600/700) and `@fontsource/literata` (400/600) locally.
  - `ProfileRadarSvg`: compact 48×48 mini-fingerprint mode for catalog cards + full interactive 13-facet wheel mode for Detail + Dual-Overlay mode for Compare.
  - `MethodDetailPage`: shows full profile, `ControlBars` (Peschel B2), `InterfaceFlow` (with computed „Passt davor / danach“ links), steps, Q1–Q4, `status` badge (`Kuratiert` vs. `Ersterfassung`), clickable free `quellen`, CC-BY 4.0 citation copy box, and JSON-LD download.

- [ ] **Step 4: Run web tests and production build**
  Run: `npm -w @fmt/web test && npm -w @fmt/web run build`
  Expected: Tests PASS and Vite production bundle builds cleanly.

- [ ] **Step 5: Commit**
  Commit web app foundation, caching, profile graphics, Catalog, Detail, and Compare pages.

---

### Task 8: Modular Scenario Planner (Didaktische Partitur + Zeitband + AI Assistant), Systematik & API/MCP Pages

**Files:**
- Create: `apps/web/src/planner/arrangementOps.ts`
- Create: `apps/web/src/components/PartiturView.tsx`
- Create: `apps/web/src/components/TimelineBandSvg.tsx`
- Create: `apps/web/src/components/ByokModal.tsx`
- Create: `apps/web/src/pages/PlannerPage.tsx`
- Create: `apps/web/src/pages/SystematikPage.tsx`
- Create: `apps/web/src/pages/ApiMcpPage.tsx`
- Modify: `apps/web/src/App.tsx` (wire `/planer`, `/systematik`, `/api-mcp`)
- Test: `apps/web/test/planner.test.ts`

**Interfaces:**
- Consumes: `useCatalog()`, `FMT_RULES`, `/api/v1/assistant/{translate,elaborate}`.
- Produces:
  - Pure tree helpers in `arrangementOps.ts`: `createChainPreset`, `appendBlockToArrangement`, `removeStep`, `moveStep`, `replaceNodeAtPath`, `setSlotBlock`, `wrapStepInAlternative`, `unwrapAlternative`, `setParallelBlock`, `setRecurrence`, `importArrangementJson`, `exportArrangementMarkdown`.
  - Complete `/planer` (Hybrid AI + Didaktische Partitur + Zeitband SVG + live R-00..R-12 validator + Markdown/SVG/JSON-LD/Print export), `/systematik` (interactive 13-facet compass, R×S matrix, 100-method Guidance×Engagement scatter plot, 6 operators, 13 rules, gap matrix, evidence & myths, limits), and `/api-mcp` (live endpoints & MCP client snippets).

- [ ] **Step 1: Write failing planner tests in `apps/web/test/planner.test.ts`**
  Cover:
  - Creating preset for each of the 5 chains validates with 0 errors and 0 warnings.
  - Appending a block („In Baukasten“), reordering steps, filling nested slots, converting a step into an `Alternative` branch, and applying `ersatz()` swap at a path keep validator paths synchronized.
  - **Review Focus #5:** Importing malformed JSON, unknown block IDs, cyclic `Verweis`, or removing all steps returns clean error/validation state without throwing; `exportArrangementMarkdown` handles empty/partial arrangements safely.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npm -w @fmt/web test -- test/planner.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement `arrangementOps.ts`, `PartiturView.tsx`, `TimelineBandSvg.tsx`, `ByokModal.tsx`, `PlannerPage.tsx`, `SystematikPage.tsx`, `ApiMcpPage.tsx`**
  - `PartiturView.tsx`: renders chain steps with live Learning-State connector pills between adjacent steps, nested R3→R2→R1 module cards with embedded slot pockets, 1-click `ersatz()` swap popover (displaying FMT notice *„Passt formal – gleiche Wirkung nicht garantiert“*), `Parallel` companion track, `Wiederkehr` rhythm markers, and `Alternative` split cards.
  - `PlannerPage.tsx`: free-text bar with instant rule-based matching + optional „Mit KI verstehen“ (`/api/v1/assistant/translate`) + „Fachlich ausformulieren“ (`/api/v1/assistant/elaborate`) with always-visible 4-guardrails banner + print/Markdown/SVG/JSON-LD export + example loader (`dichte-reihe`, `modul-stoffe`, `fehlerhafte-reihe`).
  - `SystematikPage.tsx`: full interactive FMT explanation page with all 100 methods filterable in the Lenkung×Aktivität scatter plot.
  - `ApiMcpPage.tsx`: copy-paste MCP client configuration (Streamable HTTP `/mcp` and local `stdio`), REST examples, Linked-Data & Schema links.

- [ ] **Step 4: Run web tests and full workspace build**
  Run: `npm -w @fmt/web test && npm run build`
  Expected: All web tests PASS and full monorepo builds cleanly.

- [ ] **Step 5: Commit**
  Commit Planner, Systematik, and API/MCP pages.

---

### Task 9: Docker Container, Documentation & End-to-End Verification

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`
- Modify: `README.md` (full German + concise English documentation: features, Docker quickstart, ENV config, MCP setup, REST/Linked-Data API, CC-BY 4.0 & Apache-2.0 licenses, Jan Schachtschabel attribution)

**Interfaces:**
- Produces: Production multi-stage Docker image (`fmt-methodendatenbank:latest`) running as non-root `node` on port `8080` with `HEALTHCHECK` on `/healthz`.

- [ ] **Step 1: Write `Dockerfile`, `docker-compose.yml`, and `README.md`**
  Multi-stage Dockerfile (`node:22-alpine`): builder stage compiles `@fmt/core`, `dist-data/`, `@fmt/web`, `@fmt/server`; runtime stage copies only production `node_modules`, `dist-data/`, `apps/web/dist/`, and `apps/server/dist/`, runs as `USER node`, exposes `8080`, `HEALTHCHECK` hits `http://127.0.0.1:8080/healthz`.

- [ ] **Step 2: Run full test suite across all workspaces**
  Run: `npm run build && npm test`
  Expected: 100% PASS across `@fmt/core`, `@fmt/server`, and `@fmt/web`.

- [ ] **Step 3: Build Docker image and run live container smoke tests**
  Run `docker build -t fmt-methodendatenbank:test .`, start container on a local port without `LLM_API_KEY`, verify HTTP 200 on `/`, `/methoden/gruppenpuzzle` (SPA reload), `/healthz`, `/api/v1/meta`, `/api/v1/catalog` (plus `ETag` → `304`), `/vocabs/lernfunktion.ttl` (`text/turtle`), `/baustein/gruppenpuzzle` (`Accept: application/ld+json`), and `/mcp` handshake; then stop & remove test container.

- [ ] **Step 4: Commit**
  Commit Docker configuration and `README.md`; verify `git status` is clean and ready to push to `https://github.com/janschachtschabel/Facettierte-Methodentaxonomie`.
