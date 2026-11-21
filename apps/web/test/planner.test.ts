import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSearch, createValidator, type CatalogBundle, type FmtData } from '@fmt/core';
import {
  appendBlockToArrangement,
  createChainPreset,
  exportArrangementMarkdown,
  importArrangementJson,
  moveStep,
  removeStep,
  replaceNodeAtPath,
  setParallelBlock,
  setRecurrence,
  setSlotBlock,
  unwrapAlternative,
  wrapStepInAlternative
} from '../src/planner/arrangementOps.js';

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
});
