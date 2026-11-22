import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSearch, createValidator, type Arrangement, type CatalogBundle, type FmtData } from '@fmt/core';
import {
  appendBlockToArrangement,
  collectUsedBlocks,
  createChainPreset,
  exportArrangementHtmlHandout,
  exportArrangementMarkdown,
  fitContainerDurationToSlots,
  importArrangementJson,
  moveStep,
  removeStep,
  replaceNodeAtPath,
  setParallelBlock,
  setRecurrence,
  setSlotBlock,
  unwrapAlternative,
  updateSlotDuration,
  wrapStepInAlternative
} from '../src/planner/arrangementOps.js';
import { explainValidationMessage } from '../src/planner/validationHelpers.js';
import {
  buildNeutralLearningScenario,
  buildScenarioRows,
  DEFAULT_LEARNER_GROUPS,
  detectMaterialTypeForBlock
} from '../src/planner/scenarioModel.js';
import { exportScenarioToImscc, exportScenarioToMoodleXml } from '../src/planner/lmsExport.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BUNDLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist-data', 'catalog.bundle.json'), 'utf8')) as CatalogBundle;
const DATA: FmtData = {
  VERSION: BUNDLE.version,
  NS: BUNDLE.NS,
  creator: BUNDLE.creator,
  license: BUNDLE.license,
  schemes: BUNDLE.schemes,
  facetten: BUNDLE.facetten,
  ketten: BUNDLE.ketten,
  bausteine: BUNDLE.bausteine,
  beispiele: BUNDLE.beispiele
};
const VALIDATOR = createValidator(DATA);
const SEARCH = createSearch(DATA, VALIDATOR);
const BLOCKS = new Map(BUNDLE.bausteine.map((b) => [b.kennung, b]));
const REGISTRY = new Map(BUNDLE.beispiele.filter((b) => b['@id']).map((b) => [b['@id']!, b]));

describe('Modular Scenario Planner Tree Operations', () => {
  it('builds valid presets (0 errors, 0 warnings) for every function chain', () => {
    for (const k of BUNDLE.ketten) {
      const arr = createChainPreset(k.id, BUNDLE);
      const res = VALIDATOR.validate(arr, REGISTRY);
      expect(res.gueltig, `${k.id}: ${JSON.stringify(res.meldungen)}`).toBe(true);
      expect(res.meldungen, `${k.id} warnings`).toEqual([]);
    }
  });

  it('supports appending blocks, reordering, slot editing, Alternative branching, Parallel, Wiederkehr, and ersatz() swaps', () => {
    let arr = createChainPreset('konzeptaufbau', BUNDLE);
    arr = appendBlockToArrangement(arr, BLOCKS.get('blitzlicht')!);
    expect(VALIDATOR.validate(arr, REGISTRY).dauerMin).toBeGreaterThan(200);

    // Convert step 2 into an Alternative branch and back
    arr = wrapStepInAlternative(arr, 2, BLOCKS.get('ki-tutor')!, 'Nach Lernstand differenzieren');
    const haupt = arr.ablauf.typ === 'Parallel' ? arr.ablauf.haupt : arr.ablauf;
    expect(haupt.typ === 'Sequenz' && haupt.teile[2].typ).toBe('Alternative');
    arr = unwrapAlternative(arr, 2, 0);
    const haupt2 = arr.ablauf.typ === 'Parallel' ? arr.ablauf.haupt : arr.ablauf;
    expect(haupt2.typ === 'Sequenz' && haupt2.teile[2].typ).toBe('Einsatz');

    // Fill slot & swap via ersatz path
    arr = setSlotBlock(arr, 0, 'austausch', BLOCKS.get('kugellager')!);
    const pfad = arr.ablauf.typ === 'Parallel' ? '/ablauf/haupt/teile/1' : '/ablauf/teile/1';
    const cands = SEARCH.ersatz(arr, pfad, REGISTRY);
    expect(cands.length).toBeGreaterThan(0);
    arr = replaceNodeAtPath(arr, pfad, cands[0].baustein, cands[0].dauerMin);
    expect(VALIDATOR.validate(arr, REGISTRY).gueltig).toBe(true);

    // Move, remove, parallel & recurrence updates
    arr = moveStep(arr, 0, 1);
    arr = setParallelBlock(arr, null);
    expect(arr.ablauf.typ).toBe('Sequenz');
    arr = setRecurrence(arr, { baustein: 'abrufquiz', anzahl: 3, abstand: 'P2D', dauerMin: 6 });
    expect(VALIDATOR.validate(arr, REGISTRY).wiederkehr.length).toBe(1);
    arr = removeStep(arr, 0);
    expect(arr.ablauf.typ).toBe('Sequenz');
  });

  it('safely handles malformed/cyclic JSON-LD import and empty step lists without crashing (Review Focus #5)', () => {
    const badJson = importArrangementJson('{ not json');
    expect(badJson.ok).toBe(false);

    const wrongType = importArrangementJson(JSON.stringify({ typ: 'Baustein', name: 'x' }));
    expect(wrongType.ok).toBe(false);

    expect(importArrangementJson(JSON.stringify({ typ: 'Arrangement', ablauf: [] })).ok).toBe(false);
    expect(importArrangementJson(JSON.stringify({ typ: 'Arrangement', ablauf: {} })).ok).toBe(false);
    expect(importArrangementJson(JSON.stringify({ typ: 'Arrangement', ablauf: { typ: 'Parallel' } })).ok).toBe(false);
    expect(
      importArrangementJson(JSON.stringify({ typ: 'Arrangement', ablauf: { typ: 'Sequenz', teile: 'not-array' } })).ok
    ).toBe(false);

    const cyclic = importArrangementJson(
      JSON.stringify({
        '@id': BUNDLE.NS + 'cyc',
        typ: 'Arrangement',
        name: 'Zyklus',
        reichweite: 'r4',
        ablauf: { typ: 'Verweis', arrangement: BUNDLE.NS + 'cyc' }
      })
    );
    expect(cyclic.ok).toBe(true);
    if (cyclic.ok) {
      const reg = new Map(REGISTRY);
      reg.set(BUNDLE.NS + 'cyc', { ...cyclic.arrangement, reichweite: 'r3' });
      const v = VALIDATOR.validate(cyclic.arrangement, reg);
      expect(v.meldungen.some((m) => m.regel === 'R-12')).toBe(true);
    }

    // Remove all steps cleanly & export Markdown safely
    let arr = createChainPreset('faktenwissen', BUNDLE);
    for (let i = 0; i < 10; i++) arr = removeStep(arr, 0);
    const md = exportArrangementMarkdown(arr, BLOCKS, VALIDATOR.validate(arr, REGISTRY));
    expect(md).toContain('# ');
    expect(md).toContain('CC BY 4.0');
  });

  it('exports full lesson Markdown & HTML handout with method steps, sources and KI elaboration, and produces 1-click validation fixes', () => {
    const preset = createChainPreset('konzeptaufbau', BUNDLE);
    const used = collectUsedBlocks(preset, BLOCKS);
    expect(used.length).toBeGreaterThanOrEqual(5);

    const val = VALIDATOR.validate(preset, REGISTRY);
    const md = exportArrangementMarkdown(preset, BLOCKS, val, {
      fach: 'Physik',
      thema: 'Dichte',
      kiAusarbeitung: '## Stundenverlauf\nKonkrete Anwendung der Methoden.'
    });
    expect(md).toContain('Quellenverzeichnis zu den verwendeten Methoden');
    expect(md).toContain('Durchführung:');
    expect(md).toContain('https://');
    expect(md).toContain('Konkrete Anwendung der Methoden.');

    const html = exportArrangementHtmlHandout(preset, BLOCKS, val, { fach: 'Physik', thema: 'Dichte' });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Quellenverzeichnis');

    // Broken R-01 + R-03 arrangement gets plain-German explanation & working 1-click fix
    const broken: Arrangement = {
      typ: 'Arrangement',
      name: 'Zu kleiner Rahmen',
      reichweite: 'r2',
      ablauf: { typ: 'Sequenz', teile: [{ typ: 'Einsatz', baustein: 'productive-failure', dauerMin: 90 }] }
    };
    const bVal = VALIDATOR.validate(broken, REGISTRY);
    const r01 = bVal.meldungen.find((m) => m.regel === 'R-01')!;
    const explained = explainValidationMessage(r01, broken, BLOCKS, BUNDLE, bVal.dauerMin);
    expect(explained.location).toContain('Schritt 1');
    expect(explained.quickFix).toBeDefined();
    const fixed = explained.quickFix!.apply(broken);
    expect(fixed.reichweite).toBe('r3');
  });

  it('supports flexible slot durations, R-09 auto-fit quick fixes, IMS-LD scenario model, and .imscc / Moodle XML exports', () => {
    let arr = createChainPreset('konzeptaufbau', BUNDLE);
    // Edit slot duration directly inside VBE (step 0) and auto-fit container
    arr = updateSlotDuration(arr, 0, 'austausch', 35, true);
    const haupt = arr.ablauf.typ === 'Parallel' ? arr.ablauf.haupt : arr.ablauf;
    expect(haupt.typ === 'Sequenz' && haupt.teile[0].typ === 'Einsatz' && haupt.teile[0].dauerMin).toBeGreaterThanOrEqual(35);

    // Budget warning on /kontext produces a working 1-click R-09 quick fix
    const tight: Arrangement = { ...arr, kontext: { ...arr.kontext, zeitbudgetMin: 100 } };
    const tVal = VALIDATOR.validate(tight, REGISTRY);
    const r09Budget = tVal.meldungen.find((m) => m.regel === 'R-09' && m.pfad === '/kontext');
    expect(r09Budget).toBeDefined();
    const expBudget = explainValidationMessage(r09Budget!, tight, BLOCKS, BUNDLE, tVal.dauerMin);
    expect(expBudget.quickFix).toBeDefined();
    expect(expBudget.quickFix!.apply(tight).kontext?.zeitbudgetMin).toBe(tVal.dauerMin);

    // Fit container duration helper
    arr = fitContainerDurationToSlots(arr, 1);
    const val = VALIDATOR.validate(arr, REGISTRY);

    const labelOf = (schemeId: string, code: string) => {
      const s = BUNDLE.schemes.find((x) => x.id === schemeId);
      const vals = s?.werte || (s?.gruppen || []).flatMap((g) => g.werte);
      return vals.find((w) => w.id === code)?.label || code;
    };

    const rows = buildScenarioRows(
      arr,
      BUNDLE,
      BLOCKS,
      labelOf,
      DEFAULT_LEARNER_GROUPS,
      {},
      {
        'step-0': [
          {
            id: 'wlo-1',
            title: 'Dichte verstehen – Interaktive Simulation',
            description: 'Freies OER-Material',
            url: 'https://wirlernenonline.de/dichte-sim',
            license: 'CC_BY',
            source: 'wlo'
          }
        ]
      },
      'https://fmt.example.org'
    );
    expect(rows.length).toBeGreaterThanOrEqual(7);
    expect(rows[0].methodUrl).toBe('https://fmt.example.org/methoden/vbe');
    expect(rows[0].differentiation.length).toBe(3);
    expect(rows[0].oerResources.length).toBe(1);
    expect(detectMaterialTypeForBlock(BLOCKS.get('vbe'))).toBe('versuchsanleitung');
    expect(detectMaterialTypeForBlock(BLOCKS.get('abrufquiz'))).toBe('quiz');

    const scenario = buildNeutralLearningScenario(arr, rows, DEFAULT_LEARNER_GROUPS, {
      fach: 'Physik',
      thema: 'Dichte',
      totalDurationMin: val.dauerMin,
      labelOf
    });
    expect(scenario['@type']).toBe('NeutralLearningScenario');
    expect(scenario.learning_sequences[0].phases[0].fmt_method.database_url).toContain('/methoden/vbe');

    // IMS Common Cartridge (.imscc) ZIP starts with PK signature and embeds imsmanifest.xml + WLO webLink
    const zipBytes = exportScenarioToImscc(scenario, rows);
    expect(zipBytes[0]).toBe(0x50); // 'P'
    expect(zipBytes[1]).toBe(0x4b); // 'K'
    const zipText = new TextDecoder().decode(zipBytes);
    expect(zipText).toContain('imsmanifest.xml');
    expect(zipText).toContain('fmt_scenario_imsld.json');
    expect(zipText).toContain('https://wirlernenonline.de/dichte-sim');
    expect(zipText).toContain('https://fmt.example.org/methoden/vbe');

    // Moodle XML backup export contains FMT method pages & OER URL activity
    const moodleXml = exportScenarioToMoodleXml(scenario, rows);
    expect(moodleXml).toContain('<moodle_backup>');
    expect(moodleXml).toContain('https://wirlernenonline.de/dichte-sim');
    expect(moodleXml).toContain('Vorhersage');

    // HTML handout renders IMS-LD Verlaufsplan table cleanly
    const html = exportArrangementHtmlHandout(arr, BLOCKS, val, {
      fach: 'Physik',
      thema: 'Dichte',
      scenarioRows: rows
    });
    expect(html).toContain('<table><thead><tr><th>#</th>');
    expect(html).toContain('https://wirlernenonline.de/dichte-sim');
  });
});
