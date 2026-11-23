# Binnendifferenzierung & Szenario-Anpassung (`adapt_scenario` + `/differenzierung`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich the 115×172 differentiation matrix with curated classroom metadata (`ebene`, `aufwand`, `technik`, `phasen`, `fmtBruecke`, `umsetzungsimpuls`), add a multi-group UDL/conflict & scenario-adaptation engine (`adaptScenario`), expose it via REST (`POST /api/v1/adapt`) and a 14th MCP tool (`adapt_scenario`), and provide a dedicated `/differenzierung` Web-App view tightly integrated with the FMT Baukasten.

**Architecture:** One shared deterministic Zero-LLM (`< 5 ms`) differentiation core in `@fmt/core` (`differentiationMetadata.ts`, `differentiationMatrix.ts`, `adaptScenario.ts`) powering both standalone chat/API/Web adaptation use cases and Baukasten Step 3 / `build_scenario_plan`.

**Tech Stack:** TypeScript (ESM), Node.js 22, Fastify 5, `@modelcontextprotocol/sdk`, React 18, Vite 6, Vitest 2.

**Spec:** `docs/superpowers/specs/2026-11-23-binnendifferenzierung-adapt-scenario-design.md`

## Global Constraints
- Zero-LLM-First (`< 5 ms` without external HTTP or LLM calls), no new runtime dependencies.
- Preserve original 115×172 weights in `differentiationMatrixData.ts`; enrich via separate overlay.
- Code Apache-2.0; content/metadata CC BY 4.0 (Jan Schachtschabel).
- Backwards-compatible extensions to `scoreDifferentiationMatrix()`, `POST /api/v1/differentiation/score`, `build_scenario_plan`, and existing 49 tests.
- Epistemic guard: explicitly label matrix values as heuristic point-matrix outputs, separate from empirical FMT evidence grades (`A`–`C`).

## Review Focus
- 100% metadata coverage: every single one of the 172 measures has a valid `MeasureEnrichment` and every `fmtBruecke` token matches a real FMT vocabulary code.
- No system/school-level measures (*Förderstunden, Noten, Nachhilfe, Entwicklungsberichte*) leak into default scenario mode.
- Free-text subgroup extraction (e.g. *„5 DaZ-Kinder“*) never leaks unrelated clinical/cognitive traits from full personas.
- Single-variable queries do not produce alphabetical tie-break noise (`unterricht-sofort` beats `organisation-system`).
- Analog/offline constraints (`maxTechnik: 't-keine'`, `ohneInternet: true`) consistently exclude digital/online measures across Core, API, MCP, and Web UI.

---

### Task 1: 172-Measure Metadata Overlay & Normalized Scoring (`@fmt/core`)
**Files:**
- Create: `packages/fmt-core/src/differentiationMetadata.ts`
- Modify: `packages/fmt-core/src/differentiationMatrix.ts`
- Test: `packages/fmt-core/test/differentiation.test.ts`

- [ ] Write failing tests verifying 172/172 coverage, valid `fmtBruecke` tokens, default exclusion of `organisation-system`, normalized scores (`-100..+100`) & tie-breaking, and `fmtBruecke`-driven `suggestAlternativeMethodsForGroup()`.
- [ ] Implement `differentiationMetadata.ts` covering all 40 categories + measure-level overrides for all 172 measures.
- [ ] Update `differentiationMatrix.ts` with `ebenen`/`includeSystemMeasures`, `normalizedScore`, `relevanz`, `meta`, `meta.technik` filtering, and `fmtBruecke` method matching.
- [ ] Verify `@fmt/core` tests pass.

### Task 2: Multi-Group UDL, Conflict Detection & `adaptScenario()` (`@fmt/core`)
**Files:**
- Create: `packages/fmt-core/src/adaptScenario.ts`
- Modify: `packages/fmt-core/src/index.ts`
- Test: `packages/fmt-core/test/differentiation.test.ts`

- [ ] Write failing tests for `detectLearnerGroupsFromText()` (strict trait-only subgroups, 0/1/multi-signal handling), UDL basis intersection, conflict detection with resolution strategies, and `adaptScenario()` on both free text and FMT arrangements.
- [ ] Implement `detectLearnerGroupsFromText()` and `adaptScenario()` in `adaptScenario.ts`, export from `index.ts`.
- [ ] Verify `@fmt/core` build & tests pass.

### Task 3: Server Briefings, REST API `/api/v1/adapt` & 14th MCP Tool `adapt_scenario` (`@fmt/server`)
**Files:**
- Modify: `apps/server/src/llm/briefings.ts`
- Modify: `apps/server/src/routes/api.ts`
- Modify: `apps/server/src/mcp/server.ts`
- Test: `apps/server/test/api.test.ts`, `apps/server/test/mcp.test.ts`

- [ ] Add failing API & MCP tests for `POST /api/v1/adapt`, `GET /api/v1/differentiation/meta`, 14th MCP tool `adapt_scenario` (free text + FMT arrangement), and additive `udlBasis`/`konflikte` in `build_scenario_plan`.
- [ ] Implement `buildAdaptBriefing()` in `briefings.ts`, wire routes in `api.ts` and `adapt_scenario` + updated `score_differentiation_matrix` in `server.ts`.
- [ ] Verify `@fmt/server` build & tests pass.

### Task 4: Dedicated `/differenzierung` Page, Baukasten Handoff & Upgraded Step 3 (`@fmt/web`)
**Files:**
- Create: `apps/web/src/pages/DifferentiationPage.tsx`
- Modify: `apps/web/src/App.tsx`, `apps/web/src/components/Layout.tsx`, `apps/web/src/components/DifferentiationMatrixPanel.tsx`, `apps/web/src/pages/PlannerPage.tsx`
- Test: `apps/web/test/differentiation.test.tsx`

- [ ] Create `DifferentiationPage.tsx` with free-text & saved-scenario modes, UDL/conflict/subgroup/phase cards, analog/system toggles, Markdown/JSON export, and Baukasten handoff (`sessionStorage`).
- [ ] Wire route `/differenzierung` in `App.tsx`, nav item in `Layout.tsx`, handoff reader in `PlannerPage.tsx`, and UDL/conflict/impulse/system-toggle upgrades in `DifferentiationMatrixPanel.tsx`.
- [ ] Add React render/interaction tests in `apps/web/test/differentiation.test.tsx`.
- [ ] Run full `npm run build` + `npm test`, live API/MCP check, commit, push & verify GitHub Actions CI + GHCR image.
