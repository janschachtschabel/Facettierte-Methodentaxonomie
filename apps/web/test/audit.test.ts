import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CatalogBundle } from '@fmt/core';
import { createChainPreset, exportArrangementOnePageSheet } from '../src/planner/arrangementOps.js';
import { buildNeutralLearningScenario, buildScenarioRows, DEFAULT_LEARNER_GROUPS } from '../src/planner/scenarioModel.js';
import { markdownToHtml, renderInlineMarkdownHtml, safeExternalUrl } from '../src/planner/markdownMath.js';
import { exportScenarioToImscc, exportScenarioToMoodleXml } from '../src/planner/lmsExport.js';
import { importScenarioProjectJson } from '../src/planner/scenarioStorage.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BUNDLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist-data', 'catalog.bundle.json'), 'utf8')) as CatalogBundle;
const BLOCKS = new Map(BUNDLE.bausteine.map((b) => [b.kennung, b]));
const labelOf = (_s: string, code: string) => code;

describe('Audit 2026-11: markdown renderer cannot be tricked into attribute injection', () => {
  it('ignores NUL placeholder look-alikes in the input', () => {
    const attacks = [
      '[a](https://x/onmouseover=alert(1)/) https://a.b/\u0000TOK0\u0000',
      '$x$ https://a.b/\u0000TOK0\u0000',
      '\u0000TOK0\u0000 `code`'
    ];
    for (const a of attacks) {
      const html = renderInlineMarkdownHtml(a);
      expect(html, a).not.toMatch(/href="[^"]*</);
      expect(html).not.toContain('\u0000');
      expect(markdownToHtml(a)).not.toMatch(/href="[^"]*</);
    }
  });
});

describe('Audit 2026-11: exports only link http(s) and mailto URLs', () => {
  it('safeExternalUrl keeps web links and drops script URLs', () => {
    expect(safeExternalUrl('https://wirlernenonline.de/x')).toBe('https://wirlernenonline.de/x');
    expect(safeExternalUrl(' mailto:a@b.de ')).toBe('mailto:a@b.de');
    expect(safeExternalUrl('javascript:alert(1)')).toBe('');
    expect(safeExternalUrl('JaVaScRiPt:alert(1)')).toBe('');
    expect(safeExternalUrl('data:text/html,<script>')).toBe('');
    expect(safeExternalUrl(undefined)).toBe('');
  });

  it('does not write javascript: OER links into LMS packages or the one-page sheet', () => {
    const arr = createChainPreset(BUNDLE.ketten[0].id, BUNDLE);
    const rows = buildScenarioRows(arr, BUNDLE, BLOCKS, labelOf, DEFAULT_LEARNER_GROUPS, {}, {
      'step-0': [
        { id: 'evil', title: 'Böse', description: '', url: 'javascript:alert(1)', wwwurl: 'javascript:alert(1)', license: null, source: 'wlo' }
      ]
    } as never, 'https://fmt.example.org');
    expect(rows[0].oerResources.length).toBe(0);
    const scenario = buildNeutralLearningScenario(arr, rows, DEFAULT_LEARNER_GROUPS, { fach: 'Physik', thema: 'Dichte', totalDurationMin: 45, labelOf });
    const zipText = new TextDecoder().decode(exportScenarioToImscc(scenario, rows));
    expect(zipText.toLowerCase()).not.toContain('javascript:');
    expect(exportScenarioToMoodleXml(scenario, rows).toLowerCase()).not.toContain('javascript:');
    const sheet = exportArrangementOnePageSheet(arr, BLOCKS, { gueltig: true, dauerMin: 45, meldungen: [] } as never, { scenarioRows: rows });
    expect(sheet.toLowerCase()).not.toMatch(/href="javascript:/);
  });

  it('drops script URLs from imported project files', () => {
    const arr = createChainPreset(BUNDLE.ketten[0].id, BUNDLE);
    const res = importScenarioProjectJson(
      JSON.stringify({
        arrangement: arr,
        wloOerRessourcen: [{ titel: 'Böse', wwwurl: 'javascript:alert(1)' }, { titel: 'Gut', wwwurl: 'https://wirlernenonline.de/x' }],
        oerByStep: undefined
      })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const all = Object.values(res.project.oerByStep || {}).flat();
    expect(all.map((o) => o.wwwurl)).toEqual(['https://wirlernenonline.de/x']);
  });

  it('drops script URLs from imported oerByStep maps', () => {
    const arr = createChainPreset(BUNDLE.ketten[0].id, BUNDLE);
    const res = importScenarioProjectJson(
      JSON.stringify({
        arrangement: arr,
        oerByStep: { 'step-0': [{ id: 'x', title: 'Böse', url: 'javascript:alert(1)', wwwurl: 'javascript:alert(1)', source: 'wlo' }] }
      })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(Object.values(res.project.oerByStep || {}).flat()).toEqual([]);
  });
});
