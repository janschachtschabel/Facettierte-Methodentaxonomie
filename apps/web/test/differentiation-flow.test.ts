import { describe, it, expect } from 'vitest';
import type { MethodAdjustment } from '@fmt/core';
import {
  activeSubgroups,
  adjustmentPhases,
  adjustmentSignature,
  adjustmentsInForce,
  applyAdjustments,
  mainGroupOnly,
  outdatedAdjustments
} from '../src/planner/differentiationFlow.js';
import { STANDARD_LEARNER_GROUPS, type LearnerGroup, type ScenarioPhaseRow } from '../src/planner/scenarioModel.js';

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
