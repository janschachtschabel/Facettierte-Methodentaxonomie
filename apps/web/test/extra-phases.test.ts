import { describe, it, expect } from 'vitest';
import type { AdditionalPhaseProposal, Arrangement, Baustein, MethodAdjustment } from '@fmt/core';
import { addExtraPhase, removeExtraPhase, shiftAdjustmentKeys, shiftStepKeys } from '../src/planner/extraPhases.js';
import { getMainSequence } from '../src/planner/arrangementOps.js';

const b = (kennung: string, dauerMin: number, dauerMax: number) => ({ kennung, name: kennung, dauerMin, dauerMax }) as Baustein;
const blocks = new Map([b('einstieg', 5, 15), b('arbeit', 15, 40), b('uebung', 10, 25), b('check', 3, 7), b('quiz', 3, 8)].map((x) => [x.kennung, x]));
const plan = (): Arrangement => ({
  typ: 'Arrangement',
  name: 'Test',
  reichweite: 'r3',
  ablauf: {
    typ: 'Sequenz',
    teile: [
      { typ: 'Einsatz', baustein: 'einstieg', dauerMin: 10 },
      { typ: 'Einsatz', baustein: 'arbeit', dauerMin: 20 },
      { typ: 'Einsatz', baustein: 'uebung', dauerMin: 15 },
      { typ: 'Wiederkehr', baustein: 'quiz', anzahl: 3, abstand: 'P1W', dauerMin: 6 }
    ]
  }
});
const proposal = (position: 'anfang' | 'ende'): AdditionalPhaseProposal => ({
  art: position === 'anfang' ? 'vorwissen' : 'lernstand',
  position,
  kennung: 'check',
  name: 'Check',
  dauerMin: 5,
  grund: 'x',
  groupIds: ['daz'],
  groupLabels: ['DaZ']
});
const ids = (a: Arrangement) => getMainSequence(a).seq.teile.map((t) => ('baustein' in t ? `${t.baustein}:${t.dauerMin}` : t.typ));

describe('Zusätzliche Phase in den Ablauf einfügen', () => {
  it('setzt die Phase ans Ende vor die wiederkehrende Übung und nimmt die Zeit aus der längsten Phase', () => {
    const res = addExtraPhase(plan(), blocks, proposal('ende'));
    expect(ids(res.arrangement)).toEqual(['einstieg:10', 'arbeit:15', 'uebung:15', 'check:5', 'quiz:6']);
    expect(res.index).toBe(3);
    expect(res.added).toMatchObject({ kennung: 'check', donors: [{ kennung: 'arbeit', minutes: 5 }], dauerMin: 5 });
  });

  it('setzt die Phase an den Anfang', () => {
    const res = addExtraPhase(plan(), blocks, proposal('anfang'));
    expect(ids(res.arrangement)).toEqual(['check:5', 'einstieg:10', 'arbeit:15', 'uebung:15', 'quiz:6']);
    expect(res.index).toBe(0);
  });

  it('verlängert den Ablauf, wenn keine Phase Zeit abgeben kann', () => {
    const tight = plan();
    const teile = getMainSequence(tight).seq.teile as Array<{ dauerMin: number }>;
    teile[0].dauerMin = 5;
    teile[1].dauerMin = 15;
    teile[2].dauerMin = 10;
    const res = addExtraPhase(tight, blocks, proposal('ende'));
    expect(ids(res.arrangement)).toEqual(['einstieg:5', 'arbeit:15', 'uebung:10', 'check:5', 'quiz:6']);
    expect(res.added.donors).toEqual([]);
  });

  it('sammelt die Minuten aus mehreren Phasen, wenn eine allein nicht reicht', () => {
    const p = plan();
    const teile = getMainSequence(p).seq.teile as Array<{ dauerMin: number }>;
    teile[0].dauerMin = 5;
    teile[1].dauerMin = 18;
    teile[2].dauerMin = 12;
    const res = addExtraPhase(p, blocks, proposal('ende'));
    expect(ids(res.arrangement)).toEqual(['einstieg:5', 'arbeit:15', 'uebung:10', 'check:5', 'quiz:6']);
    expect(ids(removeExtraPhase(res.arrangement, res.added)!.arrangement)).toEqual(ids(p));
  });

  it('entfernt die Phase wieder und gibt die Zeit zurück', () => {
    const start = plan();
    const res = addExtraPhase(start, blocks, proposal('anfang'));
    const back = removeExtraPhase(res.arrangement, res.added);
    expect(back?.index).toBe(0);
    expect(ids(back!.arrangement)).toEqual(ids(start));
    expect(removeExtraPhase(start, res.added)).toBeNull();
  });

  it('lässt den ursprünglichen Ablauf unverändert', () => {
    const start = plan();
    const before = JSON.stringify(start);
    addExtraPhase(start, blocks, proposal('anfang'));
    expect(JSON.stringify(start)).toBe(before);
  });
});

describe('Zuordnungen wandern mit ihren Phasen', () => {
  it('verschiebt alle Schlüssel ab der Einfügestelle', () => {
    const map = { 'step-0': 'a', 'step-1': 'b', 'step-1-slot-x': 'c', 'step-2': 'd', wiederkehr: 'w', 'parallel-0': 'p' };
    expect(shiftStepKeys(map, 1, 1)).toEqual({ 'step-0': 'a', 'step-2': 'b', 'step-2-slot-x': 'c', 'step-3': 'd', wiederkehr: 'w', 'parallel-0': 'p' });
    expect(shiftStepKeys(map, 0, 1)['step-1']).toBe('a');
  });

  it('lässt beim Entfernen die Einträge der entfernten Phase fallen', () => {
    const map = { 'step-0': 'a', 'step-1': 'b', 'step-1-slot-x': 'c', 'step-2': 'd' };
    expect(shiftStepKeys(map, 1, -1)).toEqual({ 'step-0': 'a', 'step-1': 'd' });
  });

  it('verschiebt auch die automatischen Anpassungen', () => {
    const a = { stepKey: 'step-1', groupId: 'daz' } as MethodAdjustment;
    expect(shiftAdjustmentKeys([a], 0, 1)[0].stepKey).toBe('step-2');
    expect(shiftAdjustmentKeys([a], 1, -1)).toEqual([]);
    expect(shiftAdjustmentKeys([a], 2, 1)[0].stepKey).toBe('step-1');
  });
});
