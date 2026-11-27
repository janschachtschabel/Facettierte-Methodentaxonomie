import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import type { CatalogBundle, MethodAdjustment, PhasenAntwort } from '@fmt/core';
import {
  activeSubgroups,
  adjustmentGroups,
  adjustmentPhases,
  adjustmentSignature,
  adjustmentsInForce,
  applyAdjustments,
  behalteUebernommene,
  belegZeile,
  hilfeAlsMaterial,
  hilfeUebernommen,
  mainGroupOnly,
  outdatedAdjustments,
  pruefeTeilgruppen
} from '../src/planner/differentiationFlow.js';
import { ohneGesperrteMerkmale } from '../src/planner/scenarioStorage.js';
import { buildScenarioRows, STANDARD_LEARNER_GROUPS, type LearnerGroup, type ScenarioPhaseRow } from '../src/planner/scenarioModel.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BUNDLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist-data', 'catalog.bundle.json'), 'utf8')) as CatalogBundle;
const BLOCKS = new Map(BUNDLE.bausteine.map((b) => [b.kennung, b]));
const REGELSATZ = { teilgruppen: BUNDLE.teilgruppen, regeln: BUNDLE.regeln, schemes: BUNDLE.schemes };

const regel: LearnerGroup = { ...STANDARD_LEARNER_GROUPS[0], label: 'Regelgruppe', count: 16 };
const daz: LearnerGroup = { id: 'daz', label: 'DaZ', profile: '', focus: 'sprachsensibel', active: true, count: 5 };
const stark: LearnerGroup = { id: 'vertiefung', label: 'Leistungsstark', profile: '', focus: 'vertiefung', active: true, count: 5 };

const adj = (stepKey: string, groupId: string, zu: string): MethodAdjustment => ({
  stepKey,
  phaseLabel: stepKey,
  groupId,
  groupLabel: groupId,
  vonKennung: 'alt',
  vonName: 'Alt',
  zuKennung: zu,
  zuName: zu,
  grund: 'passt besser',
  merkmal: 'vorwissen-hoch'
});

describe('Schritt 2 zeigt nur die Regelgruppe', () => {
  it('liefert genau eine Spalte für die ganze Klasse, auch wenn Teilgruppen angelegt sind', () => {
    const only = mainGroupOnly([regel, daz, stark]);
    expect(only).toHaveLength(1);
    expect(only[0].id).toBe('regel');
    expect(only[0].label).toBe('Regelgruppe (ganze Klasse)');
    expect(only[0].count).toBe(26);
  });

  it('nimmt eine ausdrücklich genannte Klassengröße', () => {
    expect(mainGroupOnly([regel, daz], 30)[0].count).toBe(30);
  });

  it('zeigt keine Teilzahl, wenn die Regelgruppe nicht gezählt ist', () => {
    expect(mainGroupOnly([{ ...regel, count: undefined }, daz])[0].count).toBeUndefined();
  });

  it('setzt eine neutrale Regelgruppe ein, wenn nur Teilgruppen vorhanden sind', () => {
    const only = mainGroupOnly([daz, stark]);
    expect(only[0].id).toBe('regel');
    expect(only[0].count).toBe(10);
  });

  it('erkennt Teilgruppen ohne die Regelgruppe und ohne abgewählte Gruppen', () => {
    expect(activeSubgroups([regel, daz, { ...stark, active: false }]).map((g) => g.id)).toEqual(['daz']);
    expect(activeSubgroups(STANDARD_LEARNER_GROUPS)).toEqual([]);
  });
});

describe('Phasen für die Methodenanpassung', () => {
  const row = (key: string, stepIndex: number, isNestedSlot = false): ScenarioPhaseRow =>
    ({ key, stepIndex, isNestedSlot, orderLabel: key, methodName: key, durationMin: 10 }) as ScenarioPhaseRow;

  it('sperrt Container mit belegten Slots, Begleitstrang und Wiederkehr', () => {
    const phases = adjustmentPhases([
      row('step-0', 0),
      row('step-1', 1),
      row('step-1-slot-a', 1, true),
      row('parallel-0', -1),
      row('wiederkehr', 4)
    ]);
    expect(phases.map((p) => [p.key, Boolean(p.locked)])).toEqual([
      ['step-0', false],
      ['step-1', true],
      ['step-1-slot-a', false],
      ['parallel-0', true],
      ['wiederkehr', true]
    ]);
  });
});

describe('Vorschläge übernehmen und zurücknehmen', () => {
  it('trägt neue Vorschläge ein und ersetzt die vorherigen', () => {
    const first = [adj('step-0', 'daz', 'm1'), adj('step-2', 'daz', 'm2')];
    const map1 = applyAdjustments({}, [], first);
    expect(map1).toEqual({ 'step-0': { daz: 'm1' }, 'step-2': { daz: 'm2' } });
    const map2 = applyAdjustments(map1, first, [adj('step-0', 'daz', 'm3')]);
    expect(map2).toEqual({ 'step-0': { daz: 'm3' } });
  });

  it('lässt von Hand gewählte Parallel-Methoden stehen', () => {
    const manual = { 'step-0': { daz: 'hand' } };
    const map = applyAdjustments(manual, [], [adj('step-0', 'daz', 'm1'), adj('step-1', 'daz', 'm2')]);
    expect(map).toEqual({ 'step-0': { daz: 'hand' }, 'step-1': { daz: 'm2' } });
    // A proposal that was changed by hand afterwards is not removed on the next run.
    const changed = { 'step-1': { daz: 'hand2' } };
    expect(applyAdjustments(changed, [adj('step-1', 'daz', 'm2')], [])).toEqual(changed);
  });

  it('zeigt nur Vorschläge, die noch gelten', () => {
    const list = [adj('step-0', 'daz', 'm1'), adj('step-1', 'daz', 'm2')];
    expect(adjustmentsInForce({ 'step-0': { daz: 'm1' }, 'step-1': { daz: 'anders' } }, list)).toEqual([list[0]]);
  });

  it('erkennt Vorschläge, deren Phase inzwischen eine andere Methode trägt', () => {
    const rows = [
      { key: 'step-0', methodId: 'alt' },
      { key: 'step-1', methodId: 'getauscht' }
    ] as ScenarioPhaseRow[];
    const list = [adj('step-0', 'daz', 'm1'), adj('step-1', 'daz', 'm2'), adj('step-9', 'daz', 'm3')];
    expect(outdatedAdjustments(rows, list)).toEqual([list[1], list[2]]);
  });

  it('ändert die Signatur bei anderem Ablauf, anderen Teilgruppen oder anderem Rahmen', () => {
    const rows = [{ key: 'step-0', methodId: 'a' }] as ScenarioPhaseRow[];
    const base = adjustmentSignature(rows, [regel, daz], {});
    expect(adjustmentSignature(rows, [regel, daz], {})).toBe(base);
    expect(adjustmentSignature([{ key: 'step-0', methodId: 'b' }] as ScenarioPhaseRow[], [regel, daz], {})).not.toBe(base);
    expect(adjustmentSignature(rows, [regel, daz, stark], {})).not.toBe(base);
    expect(adjustmentSignature(rows, [regel, daz], { ohneKI: true })).not.toBe(base);
  });
});

describe('Schritt 3: Entscheidung je Teilgruppe (Task C6)', () => {
  const antwort = (p: Partial<PhasenAntwort>): PhasenAntwort => ({
    stepKey: 'step-1',
    groupId: 'daz',
    groupLabel: 'DaZ',
    antwort: 'hilfe',
    grund: 'Sprachliches Gerüst in derselben Methode.',
    grundlage: 'E',
    quelle: 'Höfler et al. 2024',
    hilfen: [
      { id: 'h1', name: 'Wortspeicher', abbau: 'Entfällt, sobald die Gruppe die Fachwörter selbst nutzt.' },
      { id: 'h2', name: 'Satzanfänge', abbau: 'Entfällt, sobald die Gruppe eigene Sätze bildet.' }
    ],
    alternativen: [],
    ...p
  });

  it('gibt „kann noch nicht lesen/schreiben“ und „kann sich nicht frei bewegen“ an die Prüfung weiter', () => {
    const g: LearnerGroup = { ...daz, ohneSchrift: ['lesen'], ohneBewegung: true };
    const [, sub] = adjustmentGroups([regel, g]);
    expect(sub.ohneSchrift).toEqual(['lesen']);
    expect(sub.ohneBewegung).toBe(true);
    const rows = [{ key: 'step-0', methodId: 'a' }] as ScenarioPhaseRow[];
    const base = adjustmentSignature(rows, [regel, daz], {});
    expect(adjustmentSignature(rows, [regel, { ...daz, ohneSchrift: ['schreiben'] }], {})).not.toBe(base);
    expect(adjustmentSignature(rows, [regel, { ...daz, ohneBewegung: true }], {})).not.toBe(base);
  });

  it('prüft eine Gruppe, die nur „kann noch nicht lesen“ angibt', () => {
    const rows = buildScenarioRows(createArrangement(), BUNDLE, BLOCKS, (_s, c) => c, [regel], {}, {});
    const nurLesen: LearnerGroup = { ...daz, personaId: undefined, matrixValues: {}, ohneSchrift: ['lesen'] };
    const res = pruefeTeilgruppen(BUNDLE.bausteine, rows, [regel, nurLesen], {}, REGELSATZ);
    expect(res.antworten.filter((a) => a.groupId === 'daz').length).toBe(rows.filter((r) => r.methodId).length);
  });

  it('liefert je Gruppe und Phase eine Antwort, Vorschläge nur bei „tausch“ und Hinweise je Gruppe', () => {
    const rows = buildScenarioRows(createArrangement(), BUNDLE, BLOCKS, (_s, c) => c, [regel], {}, {});
    const schwach: LearnerGroup = { id: 'basis', label: 'Geringes Vorwissen', profile: '', focus: 'basis', active: true, matrixValues: { vorwissen: 'vorwissen-gering' } };
    const sprache: LearnerGroup = { ...daz, matrixValues: { sprachkompetenz: 'sprachkompetenz-gering' } };
    const res = pruefeTeilgruppen(BUNDLE.bausteine, rows, [regel, schwach, sprache], {}, REGELSATZ);
    for (const g of [schwach, sprache]) {
      expect(res.antworten.filter((a) => a.groupId === g.id).map((a) => a.stepKey)).toEqual(rows.map((r) => r.key));
      expect(Array.isArray(res.hinweise[g.id])).toBe(true);
    }
    expect(res.antworten.some((a) => a.groupId === 'regel')).toBe(false);
    // Language support is a help, never a swap (teilgruppen.json).
    expect(res.antworten.filter((a) => a.groupId === 'daz').every((a) => a.antwort !== 'tausch')).toBe(true);
    const tausch = res.antworten.filter((a) => a.antwort === 'tausch');
    expect(res.vorschlaege.map((v) => `${v.stepKey}/${v.groupId}`)).toEqual(tausch.map((a) => `${a.stepKey}/${a.groupId}`));
    // A group with low prior knowledge in a cooperative small group method gets the hint under its own cards.
    const alle = Object.values(res.hinweise).flat().map((m) => m.regel);
    expect(alle.every((r) => ['gruppierung-nur-mit-anpassung', 'leistungsschwache-nicht-unter-sich'].includes(r))).toBe(true);
    expect(res.hinweise.basis.map((m) => m.regel)).toContain('leistungsschwache-nicht-unter-sich');
    expect((res.hinweise.daz || []).some((m) => m.regel === 'leistungsschwache-nicht-unter-sich')).toBe(false);
  });

  it('nennt „gruppierung-nur-mit-anpassung“ unter der Gruppe, die weder Tausch noch Hilfe bekommt', () => {
    const rows = buildScenarioRows(createArrangement(), BUNDLE, BLOCKS, (_s, c) => c, [regel], {}, {});
    // A trait that maps to no row of the table: every phase fits.
    const ohne: LearnerGroup = { id: 'x', label: 'Gruppe X', profile: '', focus: 'custom', active: true, matrixValues: { 'zeitliche-verfuegbarkeit': 'zeitliche-verfuegbarkeit-flexibel' } };
    const res = pruefeTeilgruppen(BUNDLE.bausteine, rows, [regel, ohne], {}, REGELSATZ);
    expect(res.antworten.every((a) => a.antwort === 'passt')).toBe(true);
    expect(res.hinweise.x.map((m) => m.regel)).toContain('gruppierung-nur-mit-anpassung');
    expect(res.hinweise.x[0].text.startsWith('Gruppe X: ')).toBe(true);
  });

  it('übernommene Methoden bleiben nach erneuter Prüfung nur, solange sie vorgeschlagen sind; nichts wird von selbst eingetragen', () => {
    const a1 = adj('step-0', 'daz', 'm1');
    const a2 = adj('step-1', 'daz', 'm2');
    const current = { 'step-0': { daz: 'm1' }, 'step-2': { daz: 'hand' } };
    // a1 taken over; a2 only proposed. The new run proposes a2 again, a1 no longer.
    expect(behalteUebernommene(current, [a1, a2], [a2])).toEqual({ 'step-2': { daz: 'hand' } });
    expect(behalteUebernommene(current, [a1, a2], [a1, a2])).toEqual(current);
    expect(behalteUebernommene({}, [], [a1, a2])).toEqual({});
  });

  it('macht aus einer übernommenen Hilfe ein Material für Schritt 4', () => {
    const m = hilfeAlsMaterial(antwort({}), 'Phase 2 · Gruppenpuzzle');
    expect(m.stepKey).toBe('step-1');
    expect(m.groupId).toBe('daz');
    expect(m.materialType).toBe('hilfe');
    expect(m.title).toBe('Hilfe für DaZ: Wortspeicher, Satzanfänge');
    expect(m.content).toContain('Phase 2 · Gruppenpuzzle');
    expect(m.content).toContain('Wann die Hilfe entfällt: Entfällt, sobald die Gruppe die Fachwörter selbst nutzt.');
    expect(m.content).toContain('Grundlage: belegt (Höfler et al. 2024)');
    expect(hilfeUebernommen([m], 'step-1', 'daz')).toBe(true);
    expect(hilfeUebernommen([m], 'step-1', 'basis')).toBe(false);
    expect(hilfeUebernommen([{ ...m, stepKey: 'step-2' }], 'step-1', 'daz')).toBe(false);
  });

  it('Belegzeile: Grundlage im Klartext, ohne Grundlage „ungeklärt“', () => {
    expect(belegZeile({ grundlage: 'E', quelle: 'Höfler et al. 2024' })).toBe('Grundlage: belegt (Höfler et al. 2024)');
    expect(belegZeile({ grundlage: 'A' })).toBe('Grundlage: Setzung');
    expect(belegZeile({})).toBe('Grundlage: ungeklärt');
  });

  it('entfernt gesperrte Merkmale (Lerntypen) beim Laden und meldet es', () => {
    const alt: LearnerGroup = { ...daz, matrixValues: { sensorische: 'sensorische-visuell', vorwissen: 'vorwissen-gering' } };
    const res = ohneGesperrteMerkmale([regel, alt]);
    expect(res.entfernt).toBe(true);
    expect(res.groups[1].matrixValues).toEqual({ vorwissen: 'vorwissen-gering' });
    expect(res.groups[0]).toBe(regel);
    expect(ohneGesperrteMerkmale([regel, daz]).entfernt).toBe(false);
  });
});

function createArrangement() {
  return {
    typ: 'Arrangement',
    name: 'Test',
    kontext: { bildungsstufe: 'sek1', zeitbudgetMin: 90 },
    ablauf: {
      typ: 'Sequenz',
      teile: [
        { typ: 'Einsatz', baustein: 'erfindungsaufgabe', dauerMin: 30 },
        { typ: 'Einsatz', baustein: 'gruppenpuzzle', dauerMin: 30 },
        { typ: 'Einsatz', baustein: 'exit-ticket', dauerMin: 10 }
      ]
    }
  } as unknown as Parameters<typeof buildScenarioRows>[0];
}
