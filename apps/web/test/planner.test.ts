import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSearch, createMatcher, createValidator, type Arrangement, type CatalogBundle, type FmtData } from '@fmt/core';
import {
  appendBlockToArrangement,
  collectUsedBlocks,
  createEmptyArrangement,
  findNextVariant,
  exportArrangementHtmlHandout,
  exportArrangementMarkdown,
  exportArrangementOnePageSheet,
  exportArrangementWordDoc,
  exportMarkdownToPrintableHtml,
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
import { createChainPreset } from './kettenVorlage.js';
import { explainValidationMessage } from '../src/planner/validationHelpers.js';
import {
  buildNeutralLearningScenario,
  buildScenarioRows,
  DEFAULT_LEARNER_GROUPS,
  entwurfBegriffe,
  lehrendeInfo,
  detectMaterialTypeForBlock,
  extractSubjectAndTopic
} from '../src/planner/scenarioModel.js';
import { markdownToHtml, renderInlineMarkdownHtml } from '../src/planner/markdownMath.js';
import { exportScenarioToImscc, exportScenarioToMoodleXml } from '../src/planner/lmsExport.js';
import {
  deleteSavedScenario,
  entwurfAngabenAus,
  exportScenarioProjectJson,
  importScenarioProjectJson,
  loadSavedScenarios,
  saveScenarioToStorage
} from '../src/planner/scenarioStorage.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BUNDLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist-data', 'catalog.bundle.json'), 'utf8')) as CatalogBundle;
const DATA: FmtData = {
  VERSION: BUNDLE.version,
  NS: BUNDLE.NS,
  creator: BUNDLE.creator,
  license: BUNDLE.license,
  schemes: BUNDLE.schemes,
  facetten: BUNDLE.facetten,
  wfelder: BUNDLE.wfelder,
  arten: BUNDLE.arten,
  merkmale: BUNDLE.merkmale,
  ketten: BUNDLE.ketten,
  regeln: BUNDLE.regeln,
  teilgruppen: BUNDLE.teilgruppen,
  planungsprofile: BUNDLE.planungsprofile,
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
      // Since Task B3, R-06 reads every fit rule: the invention task (open, no feedback, uniform) triggers
      // „Entdecken nur mit Stütze“ wherever it stands. That one warning is expected; any other is a finding.
      const andere = res.meldungen.filter((m) => !(m.regel === 'R-06' && m.meldung.startsWith('Erfindungsaufgabe ') && m.meldung.includes('offen angelegt')));
      expect(andere, `${k.id} warnings`).toEqual([]);
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

    // Differentiated print/export (Markdown, HTML, One-Page-Sheet) includes UDL basis, conflicts & subgroup alternative methods
    const diffRows = buildScenarioRows(
      preset,
      BUNDLE,
      BLOCKS,
      (_s, c) => c,
      DEFAULT_LEARNER_GROUPS,
      {},
      {},
      '',
      { 'step-0': { basis: 'ampelspiel' } }
    );
    const mdDiff = exportArrangementMarkdown(preset, BLOCKS, val, {
      fach: 'Physik',
      thema: 'Dichte',
      groups: DEFAULT_LEARNER_GROUPS,
      scenarioRows: diffRows
    });
    expect(mdDiff).toContain('Gemeinsame Basis für alle Teilgruppen (UDL)');
    expect(mdDiff).toContain('Erkannte Zielkonflikte');
    expect(mdDiff).toContain('Alternativ-Methode');

    const onePageDiff = exportArrangementOnePageSheet(preset, BLOCKS, val, {
      fach: 'Physik',
      thema: 'Dichte',
      groups: DEFAULT_LEARNER_GROUPS,
      scenarioRows: diffRows
    });
    expect(onePageDiff).toContain('UDL-Basis');

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

  it('Lösungshinweise der Regeln sprechen mit „du“ (Fix-Welle B, Punkt 4)', () => {
    const arr = createChainPreset('konzeptaufbau', BUNDLE);
    for (const regel of ['R-99', 'R-02', 'R-03', 'R-04', 'R-06', 'R-07', 'R-08', 'R-09', 'R-11']) {
      const e = explainValidationMessage({ regel, schwere: 'Warnung', pfad: '/', meldung: '' } as never, arr, BLOCKS, BUNDLE, 45);
      expect(e.howToFix, regel).not.toMatch(/\b(?:Sie|Ihr\w*)\b/);
    }
    const r06 = explainValidationMessage({ regel: 'R-06', schwere: 'Warnung', pfad: '/', meldung: '' } as never, arr, BLOCKS, BUNDLE, 45);
    expect(r06.howToFix).toBe(
      'Prüfe, ob die Methode zu Bildungsstufe, Vorwissen, Inhalt, Sprachniveau und Fach passt (der Hinweis nennt Regel und Grundlage), oder nutze „⇄ Ersatz“.'
    );
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

    // HTML handout renders IMS-LD Verlaufsplan table cleanly with A4 print CSS, embedded SVG & isolated material pages
    const sampleMat = {
      id: 'mat-1',
      stepKey: rows[0].key,
      title: 'Arbeitsblatt Dichte-Versuch',
      materialType: 'arbeitsblatt',
      content: '## Aufgabe 1\nVergleiche Holz und Metall.',
      createdAt: '2026-11-22T12:00:00Z'
    };
    const html = exportArrangementHtmlHandout(arr, BLOCKS, val, {
      fach: 'Physik',
      thema: 'Dichte',
      timelineSvg: '<svg viewBox="0 0 100 20"><rect width="100" height="20"/></svg>',
      scenarioRows: rows,
      generatedMaterials: [sampleMat]
    });
    expect(html).toContain('@page { size: A4;');
    expect(html).toContain('Visuelles Zeitband');
    expect(html).toContain('<table><thead><tr><th>#</th>');
    expect(html).toContain('https://wirlernenonline.de/dichte-sim');
    expect(html).toContain('page-break-before: always');
    expect(html).toContain('page-break-after: always');
    expect(html).toContain('<section class="material-page">');
    expect(html).toContain('Arbeitsblatt Dichte-Versuch');

    // Word .doc & printable material HTML exports
    const wordDoc = exportArrangementWordDoc(arr, BLOCKS, val, {
      fach: 'Physik',
      thema: 'Dichte',
      scenarioRows: rows,
      generatedMaterials: [sampleMat]
    });
    expect(wordDoc).toContain('urn:schemas-microsoft-com:office:word');
    expect(wordDoc).toContain('<table><thead><tr><th>#</th>');
    expect(wordDoc).toContain('<section class="material-page">');

    // Automatic subject & topic extraction from natural-language prompts
    const extracted = extractSubjectAndTopic(
      'Problemorientiertes Lernen. Nachhaltigkeit bei der Lebensmittelzubereitung. Doppelstunde mit 2 x 45 Minuten für Schüler der 7. Klasse.'
    );
    expect(extracted.fach).toBe('Ernährung & Verbraucherbildung');
    expect(extracted.thema).toContain('Nachhaltigkeit bei der Lebensmittelzubereitung');

    const matHtml = exportMarkdownToPrintableHtml('Arbeitsblatt Dichte', '# Arbeitsblatt\n1. Aufgabe A\n2. Aufgabe B');
    expect(matHtml).toContain('@page { size: A4;');
    expect(matHtml).toContain('<ol>');

    // Browser scenario persistence & .fmt.json project round-trip
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const { saved, list } = saveScenarioToStorage(
      {
        title: 'Physik: Dichte',
        fach: 'Physik',
        thema: 'Dichte',
        hinweise: 'Heterogene Klasse 7',
        arrangement: arr,
        groups: DEFAULT_LEARNER_GROUPS,
        aiDiffByStep: {},
        oerByStep: {},
        elaboration: '## Entwurf\nTest'
      },
      storage
    );
    expect(list.length).toBe(1);
    expect(loadSavedScenarios(storage)[0].id).toBe(saved.id);

    const projectJson = exportScenarioProjectJson({
      title: 'Physik: Dichte',
      fach: 'Physik',
      thema: 'Dichte',
      hinweise: 'Test',
      arrangement: arr,
      groups: DEFAULT_LEARNER_GROUPS,
      aiDiffByStep: {},
      oerByStep: {},
      elaboration: '## Entwurf'
    });
    const imported = importScenarioProjectJson(projectJson);
    expect(imported.ok).toBe(true);
    if (imported.ok) {
      expect(imported.project.fach).toBe('Physik');
      expect(imported.project.elaboration).toBe('## Entwurf');
    }
    expect(importScenarioProjectJson('{broken').ok).toBe(false);
    // Files and browser entries from before FMT 2.0 name the room "lernort" or "raumFilter" and carry a reading flag.
    const alt = importScenarioProjectJson(JSON.stringify({ ...JSON.parse(projectJson), lernort: 'draussen', ohneLesen: true }));
    expect(alt.ok && alt.project.raum).toBe('draussen');
    expect(alt.ok && alt.project.ohneSchrift).toEqual(['lesen', 'schreiben']);
    mem.set('fmt_saved_scenarios_v1', JSON.stringify([{ ...saved, raumFilter: 'hoersaal' }]));
    expect(loadSavedScenarios(storage)[0].raum).toBe('hoersaal');
    expect(deleteSavedScenario(saved.id, storage).length).toBe(0);
  });

  it('Projektdatei behält die Angaben des Entwurfs: Planungsprofil betrieb, Einheit, Nachweis, Regelmeldungen, Begleitstrang (Fix-Welle D, Punkt 7)', () => {
    const r = createMatcher(DATA, VALIDATOR).zuordnen({ text: 'Berufsschule, Unterweisung im Betrieb: Bohrmaschine sicher bedienen, Einheit Lernfeld 3, 45 Minuten, soziales Lernen stärken' });
    const angaben = entwurfAngabenAus(r);
    expect(angaben).toMatchObject({ planungsprofil: 'betrieb', einheit: 'Lernfeld 3', nachweis: ['praktisch'], begleitziele: ['sozial'] });
    const phase = { art: 'begleitstrang' as const, kennung: angaben.begleitstrang![0].baustein, name: 'x', dauerMin: 3, grund: 'g', donors: [{ kennung: 'a', minutes: 3 }] };
    const json = exportScenarioProjectJson({
      title: 'T',
      fach: 'Metall',
      thema: 'Bohren',
      hinweise: '',
      arrangement: (r as { arrangement: Arrangement }).arrangement,
      groups: DEFAULT_LEARNER_GROUPS,
      aiDiffByStep: {},
      oerByStep: {},
      elaboration: null,
      entwurfAngaben: angaben,
      begleitPhasen: [phase]
    });
    const imp = importScenarioProjectJson(json);
    if (!imp.ok) throw new Error(imp.fehler);
    expect(imp.project.entwurfAngaben).toEqual(JSON.parse(JSON.stringify(angaben)));
    expect(imp.project.begleitPhasen).toEqual([phase]);
    // Files may come from anyone: malformed entries are dropped.
    const kaputt = importScenarioProjectJson(
      JSON.stringify({ ...JSON.parse(json), entwurfAngaben: { planungsprofil: 7, regelmeldungen: [{ regel: 1 }], begleitstrang: ['x'] }, begleitPhasen: [{ kennung: 3 }] })
    );
    if (!kaputt.ok) throw new Error(kaputt.fehler);
    expect(kaputt.project.entwurfAngaben?.planungsprofil).toBeUndefined();
    expect(kaputt.project.entwurfAngaben?.regelmeldungen).toEqual([]);
    expect(kaputt.project.entwurfAngaben?.begleitstrang).toEqual([]);
    expect(kaputt.project.begleitPhasen).toEqual([]);
  });

  it('renders GFM Markdown tables, rules, blockquotes, KaTeX formulas (UI & MathML print) and escapes XSS safely', () => {
    const sample = [
      '## Auswertung & Formeln',
      '',
      'Die Dichte berechnet sich als $\\rho = \\frac{m}{V}$ (Preisbeispiel: $5 und $10 bleiben Text).',
      '',
      '$$E = m \\cdot c^2$$',
      '',
      '---',
      '',
      '| Methode | Risiko | Maßnahme |',
      '|---|---|---|',
      '| **Placemat** | Dominanz | Stille Einzelarbeit |',
      '',
      '> Hinweis: *Quellen* prüfen und `<script>alert(1)</script>` ignorieren.',
      '',
      '- [x] Hypothese aufgestellt',
      '- [ ] Messung dokumentiert'
    ].join('\n');

    const uiHtml = markdownToHtml(sample, { mathOutput: 'htmlAndMathml' });
    expect(uiHtml).toContain('<table><thead><tr><th>Methode</th><th>Risiko</th><th>Maßnahme</th></tr></thead>');
    expect(uiHtml).toContain('<strong>Placemat</strong>');
    expect(uiHtml).toContain('<hr />');
    expect(uiHtml).toContain('<blockquote>');
    expect(uiHtml).toContain('katex');
    expect(uiHtml).toContain('<math');
    expect(uiHtml).toContain('☑');
    expect(uiHtml).toContain('☐');
    expect(uiHtml).not.toContain('<script>');
    expect(uiHtml).toContain('$5 und $10');

    const printHtml = markdownToHtml('Formel: \\(a^2 + b^2 = c^2\\)', { mathOutput: 'mathml' });
    expect(printHtml).toContain('<math');
    expect(printHtml).not.toContain('katex-html');

    const inline = renderInlineMarkdownHtml('Berechne $\\rho = \\frac{m}{V}$ mit **Waage**', 'htmlAndMathml');
    expect(inline).toContain('katex');
    expect(inline).toContain('<strong>Waage</strong>');

    // Compact 1-page A4 portrait cheat-sheet ("Kurzablauf") + sources box + isolated material pages
    const arr = createChainPreset('fuenf-e', BUNDLE);
    const val = VALIDATOR.validate(arr, REGISTRY);
    const rows = buildScenarioRows(arr, BUNDLE, BLOCKS, (_s, c) => c, DEFAULT_LEARNER_GROUPS, {}, {}, 'https://fmt.example.org');
    const onePage = exportArrangementOnePageSheet(arr, BLOCKS, val, {
      fach: 'Physik',
      thema: 'Dichte',
      lernziele: 'Formel $\\rho = \\frac{m}{V}$ anwenden',
      groups: DEFAULT_LEARNER_GROUPS,
      scenarioRows: rows,
      generatedMaterials: [
        {
          stepKey: rows[0].key,
          title: 'Infoblatt Dichte',
          materialType: 'infoblatt',
          content: '## Kerngedanke\nDichte $\\rho = \\frac{m}{V}$'
        }
      ]
    });
    expect(onePage).toContain('@page { size: A4 portrait;');
    expect(onePage).toContain('class="one-page-sheet"');
    expect(onePage).toContain('max-height: 277mm');
    expect(onePage).toContain('class="sources-box"');
    expect(onePage).toContain('<section class="material-page">');
    expect(onePage).toContain('<math');
    expect(onePage).toContain('Kurzablauf');
  });

  it('round-trips complete machine-readable scenarios (.fmt.json, API/MCP FmtScenarioPlan JSON, and embedded HTML handouts)', () => {
    const arr = createChainPreset('prozedur', BUNDLE);
    const val = VALIDATOR.validate(arr, REGISTRY);

    // 1. Full .fmt.json project round-trip (preserving scenarioText, ansatzCodes, matrixValues, thematicRows, materials & elaboration)
    const exported = exportScenarioProjectJson({
      title: 'Mathe: Bruchrechnen',
      fach: 'Mathematik',
      thema: 'Bruchrechnen',
      scenarioText: 'Mathematik Bruchrechnen Doppelstunde Klasse 6, 90 Minuten',
      ansatzCodes: ['instruktion', 'uebung'],
      hinweise: 'Alltagsbeispiele Pizza/Schokolade',
      lernziele: 'Brüche gleichnamig machen',
      problemstellung: 'Nenner werden addiert',
      didaktischerAnsatz: 'Direkte Instruktion & Übung',
      lehrkraefteInfo: '1 Lehrkraft + Schulbegleitung',
      arrangement: arr,
      groups: DEFAULT_LEARNER_GROUPS,
      aiDiffByStep: {},
      oerByStep: {
        'step-0': [
          {
            id: 'oer-1',
            title: 'Bruchrechnen interaktiv',
            description: 'OER',
            url: 'https://example.org/brueche',
            wwwurl: 'https://example.org/brueche',
            license: 'CC_BY',
            source: 'wlo'
          }
        ]
      },
      generatedMaterials: [
        {
          id: 'mat-1',
          stepKey: 'step-0',
          title: 'Arbeitsblatt Brüche',
          materialType: 'arbeitsblatt',
          content: '## Aufgabe 1',
          createdAt: '2026-11-22T22:00:00.000Z'
        }
      ],
      thematicRows: [
        {
          key: 'step-0',
          orderLabel: '1',
          phaseLabel: 'Einstieg',
          durationMin: 10,
          methodId: 'tps',
          methodName: 'Think-Pair-Share',
          methodProcedure: 'Konkretes Vorgehen zu Brüchen',
          teacherAction: 'Stellt Pizza-Impuls',
          learnerAction: 'Notieren Vorstellungen',
          groupAdaptations: { basis: 'Bruchstreifen nutzen' },
          materialsAndOer: 'Arbeitsblatt Brüche'
        }
      ],
      elaboration: '## Ausformulierter Entwurf\nMit $\\frac{1}{2} + \\frac{1}{4} = \\frac{3}{4}$.'
    });

    const reimported = importScenarioProjectJson(exported);
    expect(reimported.ok).toBe(true);
    if (reimported.ok) {
      expect(reimported.project.fach).toBe('Mathematik');
      expect(reimported.project.scenarioText).toContain('Bruchrechnen');
      expect(reimported.project.ansatzCodes).toEqual(['instruktion', 'uebung']);
      expect(reimported.project.thematicRows?.[0].methodProcedure).toContain('Brüchen');
      expect(reimported.project.generatedMaterials?.length).toBe(1);
      expect(reimported.project.elaboration).toContain('\\frac{1}{2}');
    }

    // 2. Direct import of API (/api/v1/plan) or MCP (build_scenario_plan) response JSON!
    const apiPlanJson = JSON.stringify({
      fach: 'Biologie',
      thema: 'Ökosystem Wald',
      lerngruppenUndMatrix: [
        { id: 'basis', label: 'DaZ & Basis', personaId: 'languageAndCulture', matrixTop: ['Visuelle Medien (+8)'] }
      ],
      wloOerRessourcen: [{ titel: 'Wald-Video', wwwurl: 'https://example.org/wald', lizenz: 'CC_BY' }],
      thematischeTabelle: [
        {
          key: 'step-0',
          orderLabel: '1',
          phaseLabel: 'Einstieg',
          durationMin: 15,
          methodId: 'placemat',
          methodName: 'Placemat-Methode',
          methodProcedure: 'Waldbegriffe sammeln',
          teacherAction: 'Legt Plakat aus',
          learnerAction: 'Notieren im Randfeld',
          groupAdaptations: { basis: 'Bildkarten nutzen' },
          materialsAndOer: 'Wald-Video'
        }
      ],
      maschinenlesbar: {
        '@type': 'FmtScenarioPlan',
        arrangement: arr
      }
    });
    const importedPlan = importScenarioProjectJson(apiPlanJson);
    expect(importedPlan.ok).toBe(true);
    if (importedPlan.ok) {
      expect(importedPlan.project.fach).toBe('Biologie');
      expect(importedPlan.project.thema).toBe('Ökosystem Wald');
      expect(importedPlan.project.thematicRows?.[0].methodId).toBe('placemat');
      expect(importedPlan.project.groups?.[0].label).toBe('DaZ & Basis');
      expect(importedPlan.project.oerByStep?.['step-0']?.[0].wwwurl).toBe('https://example.org/wald');
    }

    // 3. Re-import directly from an exported HTML handout (embedded JSON-LD / project script!)
    const html = exportArrangementHtmlHandout(arr, BLOCKS, val, {
      fach: 'Mathematik',
      thema: 'Bruchrechnen',
      kiAusarbeitung: '## Stundenverlauf'
    });
    const importedHtml = importScenarioProjectJson(html);
    expect(importedHtml.ok).toBe(true);
    if (importedHtml.ok) {
      expect(importedHtml.project.arrangement.typ).toBe('Arrangement');
    }
  });

describe('Stufe 3: eigene Eingabe und anderer Vorschlag', () => {
  it('liefert einen leeren freien Ablauf ohne Vorlagenreste', () => {
    const empty = createEmptyArrangement(BUNDLE);
    expect(empty.zieltyp).toBeUndefined();
    expect(empty.kontext).toBeUndefined();
    expect(empty.ablauf).toEqual({ typ: 'Sequenz', teile: [] });
    expect(empty.name).toBe('Freier Ablauf');
  });

  it('findet den nächsten Vorschlag mit anderer Methodenfolge', () => {
    const matcher = createMatcher(DATA, VALIDATOR);
    const text = 'Biologie Klasse 7, Fotosynthese, 45 Minuten';
    const run = (variante: number) => matcher.zuordnen({ text, variante });
    const first = run(0);
    expect(first.modus).toBe('ablauf');
    if (first.modus !== 'ablauf' || !first.arrangement) return;
    const next = findNextVariant(run, first.arrangement, 0);
    expect(next).not.toBeNull();
    expect(next!.variante).toBeGreaterThan(0);
    expect(JSON.stringify(next!.arrangement.ablauf)).not.toBe(JSON.stringify(first.arrangement.ablauf));
    // deterministic: same call, same answer
    expect(findNextVariant(run, first.arrangement, 0)!.variante).toBe(next!.variante);
  });

  it('meldet, wenn es keinen anderen Vorschlag gibt', () => {
    const arr = createChainPreset('konzeptaufbau', BUNDLE);
    const same = () => ({ modus: 'ablauf', arrangement: arr }) as never;
    expect(findNextVariant(same, arr, 0)).toBeNull();
  });
});
});

describe('Schnellkorrekturen bieten keine Hilfe als Phase oder Slot an (Task C4)', () => {
  const alsHilfe = (ids: Set<string>): CatalogBundle => ({
    ...BUNDLE,
    bausteine: BUNDLE.bausteine.map((b) => (ids.has(b.kennung) ? { ...b, eintragsart: 'hilfe' as const } : b))
  });
  const genannt = (label: string | undefined) => (label ? (label.match(/„([^“]+)“ (?:anfügen|belegen)/) || [])[1] : undefined);
  const nameZuKennung = new Map(BUNDLE.bausteine.map((b) => [b.name, b.kennung]));

  it('R-04: der fehlende Lernzustand wird nie durch eine Hilfe ergänzt', () => {
    const arr = createChainPreset('konzeptaufbau', BUNDLE);
    const zustaende = (BUNDLE.schemes.find((s) => s.id === 'lernzustand')?.werte || []).map((w) => w.id);
    const vorschlag = (bundle: CatalogBundle, z: string) =>
      genannt(
        explainValidationMessage(
          { regel: 'R-04', schwere: 'Fehler', pfad: '/ablauf', meldung: `Funktion fehlt (Zielzustand ${z}).` } as never,
          arr,
          new Map(bundle.bausteine.map((b) => [b.kennung, b])),
          bundle,
          45
        ).quickFix?.label
      );
    const vorher = new Set(zustaende.map((z) => nameZuKennung.get(vorschlag(BUNDLE, z) || '')).filter((k): k is string => Boolean(k)));
    expect(vorher.size).toBeGreaterThan(0);
    const DX = alsHilfe(vorher);
    for (const z of zustaende) {
      const k = nameZuKennung.get(vorschlag(DX, z) || '');
      expect(k && vorher.has(k), z).toBeFalsy();
    }
  });

  it('R-11: ein leerer Pflichtslot wird nie mit einer Hilfe belegt', () => {
    const container = BUNDLE.bausteine.find((b) => (b.slot || []).some((s) => s.pflicht))!;
    const arr: Arrangement = {
      typ: 'Arrangement',
      name: 'slot',
      reichweite: 'r4',
      ablauf: { typ: 'Sequenz', teile: [{ typ: 'Einsatz', baustein: container.kennung, dauerMin: container.dauerMin }] }
    };
    const kandidat = (bundle: CatalogBundle) =>
      nameZuKennung.get(
        genannt(
          explainValidationMessage(
            { regel: 'R-11', schwere: 'Warnung', pfad: '/ablauf/teile/0', meldung: '' } as never,
            arr,
            new Map(bundle.bausteine.map((b) => [b.kennung, b])),
            bundle,
            container.dauerMin
          ).quickFix?.label
        ) || ''
      );
    const hilfen = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const k = kandidat(alsHilfe(hilfen));
      expect(k, `Runde ${i}`).toBeTruthy();
      expect(hilfen.has(k!)).toBe(false);
      hilfen.add(k!);
    }
  });
});


describe('Entwurf mit sieben Kernfeldern und Begriffen des Planungsprofils (Paket D, D2)', () => {
  const labelOf = (schemeId: string, code: string) => {
    const s = BUNDLE.schemes.find((x) => x.id === schemeId);
    const vals = s?.werte || (s?.gruppen || []).flatMap((g) => g.werte);
    return vals.find((w) => w.id === code)?.label || code;
  };
  const matcher = createMatcher(DATA, VALIDATOR);
  const entwurfFuer = (text: string, extra: Record<string, unknown> = {}) => {
    const r = matcher.zuordnen({ text });
    if (r.modus !== 'ablauf' || !r.arrangement) throw new Error('kein Ablauf');
    const arr = r.arrangement;
    const groups = DEFAULT_LEARNER_GROUPS.map((g) => (g.id === 'basis' ? { ...g, active: true, count: 4 } : g));
    const rows = buildScenarioRows(arr, BUNDLE, BLOCKS, labelOf, groups, {}, {}, '', {}, [
      { id: 'h1', stepKey: 'step-1', title: 'Wortliste', materialType: 'hilfe', content: 'x', createdAt: '2026-11-27T00:00:00Z', groupId: 'basis' }
    ]);
    const sc = buildNeutralLearningScenario(arr, rows, groups, {
      fach: 'Statistik',
      thema: 'Mittelwerte',
      totalDurationMin: VALIDATOR.validate(arr).dauerMin,
      labelOf,
      planungsprofile: BUNDLE.planungsprofile,
      planungsprofil: r.planungsprofil,
      planungsprofilAngenommen: (r.pflichtangaben?.angenommen || []).some((x) => x.feld === 'planungsprofil'),
      ...extra
    });
    return { sc, rows, r };
  };

  it('n15: Entwurf nutzt „Sitzung“, „Studierende“, „Modul“ und führt sieben Kernfelder', () => {
    const { sc } = entwurfFuer('Hochschule, Seminar Statistik, 90 Minuten, 25 Studierende, Prüfungsform Klausur');
    expect(sc.planungsprofil?.id).toBe('hochschule');
    expect(sc.kernfelder?.map((k) => k.id)).toEqual(['rahmendaten', 'lernvoraussetzungen', 'ziele', 'einordnung', 'verlauf', 'lernerfolg', 'reflexion']);
    const text = sc.generated_content.narrative_lesson_plan_markdown;
    for (const w of ['Sitzung', 'Studierende', 'Modul']) expect(text, w).toContain(w);
    expect(text).toContain('Tätigkeit der Lehrenden');
    expect(sc.module?.map((m) => m.id)).toEqual(['arbeitsaufwand-leistungspunkte', 'pruefungsform', 'abstimmung-ziel-pruefung-methode']);
    sc.module?.forEach((m) => expect(m.inhalt).toBe(''));
  });

  it('Verlaufsplan trägt die Anpassungen je Teilgruppe (Hilfe aus Schritt 3)', () => {
    const { sc } = entwurfFuer('Hochschule, Seminar Statistik, 90 Minuten, 25 Studierende');
    const verlauf = sc.kernfelder!.find((k) => k.id === 'verlauf')!.inhalt;
    expect(verlauf).toContain('Anpassungen je Teilgruppe');
    expect(verlauf).toMatch(/Hilfe „Wortliste“/);
  });

  it('Sicherung des Lernerfolgs nur aus dem Prüfschritt, nicht aus der Eingangsdiagnose oder der Wiederkehr (Fix-Welle D, Punkt 4)', () => {
    const { sc, rows } = entwurfFuer('Biologie Klasse 7, Fotosynthese, 45 Minuten');
    const f = Object.fromEntries(sc.kernfelder!.map((k) => [k.id, k.inhalt]));
    const erste = rows[0].methodName;
    expect(f.lernerfolg).not.toContain(erste);
    expect(f.lernerfolg).not.toMatch(/Wiederkehr/);
    expect(f.lernerfolg.split('\n').filter((l) => /Prüfschritt|Sicherung/.test(l))).toHaveLength(1);
    expect(f.reflexion).not.toMatch(/Wiederkehr/);
    expect(f.reflexion).toContain(rows.filter((r) => r.key !== 'wiederkehr' && !r.isNestedSlot).at(-1)!.methodName);
  });

  it('Entwurf ohne Bildungsstufe enthält nirgends „Sekundarstufe I“', () => {
    const { sc, r } = entwurfFuer('Fotosynthese, Lichtreaktion, 45 Minuten');
    expect(r.planungsprofil).toBe('schule');
    expect(sc.planungsprofil).toMatchObject({ id: 'schule', angenommen: true });
    const all = JSON.stringify(sc);
    expect(all).not.toContain('Sekundarstufe I');
    expect(all).toContain('Bildungsstufe nicht angegeben');
  });

  it('Exporte folgen den Begriffen: Erwachsenenbildung nennt „Tätigkeit der Kursleitung“', () => {
    const { sc, rows } = entwurfFuer('Volkshochschule, Kochkurs Grundtechniken, 3 Stunden, 12 Teilnehmende');
    expect(sc.planungsprofil?.id).toBe('erwachsenenbildung');
    const moodle = exportScenarioToMoodleXml(sc, rows);
    expect(moodle).toContain('Tätigkeit der Kursleitung');
    expect(moodle).not.toContain('Rolle Lehrkraft');
    const zip = new TextDecoder().decode(exportScenarioToImscc(sc, rows));
    expect(zip).toContain('Tätigkeit der Teilnehmenden');
    expect(sc.generated_content.narrative_lesson_plan_markdown).toContain('Kursverlaufsplan');
  });

  it('Schule: „Tätigkeit der Lehrkraft“ bleibt', () => {
    const { sc } = entwurfFuer('Biologie Klasse 7, Fotosynthese, 45 Minuten');
    expect(sc.planungsprofil?.spalten.lehrende).toBe('Tätigkeit der Lehrkraft');
    expect(sc.generated_content.narrative_lesson_plan_markdown).toContain('Tätigkeit der Schülerinnen und Schüler');
  });
  it('Markdown, Word, HTML-Handout und Einseiter folgen den Begriffen (Erwachsenenbildung)', () => {
    const { sc, rows, r } = entwurfFuer('Volkshochschule, Kochkurs Grundtechniken, 3 Stunden, 12 Teilnehmende');
    const arr = r.modus === 'ablauf' ? r.arrangement! : (undefined as never);
    const val = VALIDATOR.validate(arr);
    const meta = { planungsprofile: BUNDLE.planungsprofile, planungsprofil: r.planungsprofil };
    const profil = entwurfBegriffe(meta, arr.kontext?.bildungsstufe)!;
    expect(profil).toMatchObject({ lehrende: 'Kursleitung', lernende: 'Teilnehmende' });
    const opts = {
      fach: 'Kochen',
      thema: 'Grundtechniken',
      lehrkraefteInfo: lehrendeInfo('1 Lehrkraft', meta, arr.kontext?.bildungsstufe),
      groups: DEFAULT_LEARNER_GROUPS,
      scenarioRows: rows,
      thematicRows: sc.generated_content.thematic_table,
      profil
    };
    expect(opts.lehrkraefteInfo).toBeUndefined();
    const md = exportArrangementMarkdown(arr, BLOCKS, val, opts);
    expect(md).toContain('Tätigkeit der Kursleitung');
    expect(md).toContain('Tätigkeit der Teilnehmenden');
    const mdOhneThema = exportArrangementMarkdown(arr, BLOCKS, val, { ...opts, thematicRows: undefined });
    expect(mdOhneThema).toContain('| Tätigkeit der Kursleitung | Tätigkeit der Teilnehmenden |');
    const word = exportArrangementWordDoc(arr, BLOCKS, val, opts);
    const html = exportArrangementHtmlHandout(arr, BLOCKS, val, opts);
    const one = exportArrangementOnePageSheet(arr, BLOCKS, val, opts);
    for (const [name, out] of [['md', md], ['md2', mdOhneThema], ['word', word], ['html', html], ['one', one]] as const) {
      expect(out, name).not.toMatch(/Lehrkraft/);
    }
    expect(one).toContain('Tätigkeit der Kursleitung &amp; Tätigkeit der Teilnehmenden');
    expect(lehrendeInfo('1 Lehrkraft + Schulbegleitung', meta)).toBe('1 Lehrkraft + Schulbegleitung');
  });
});
