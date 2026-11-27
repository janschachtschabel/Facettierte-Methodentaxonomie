import { describe, it, expect } from 'vitest';
import { pickOrder, softScore, stableHash, type SoftScoreParts } from '../src/ranking.js';

const base: SoftScoreParts = {
  ansatzMiss: false,
  softFilterMisses: 0,
  variety: 0,
  overBudgetMin: 0,
  techUnasked: false,
  textRelevance: 0,
  evidence: 'A',
  draft: false,
  functionPosition: 0,
  vorbereitungMin: 0,
  mentioned: false
};

describe('Bewertung der Kandidaten', () => {
  it('gewichtet Ansatz und Textnähe stärker als den Evidenzgrad', () => {
    expect(softScore({ ...base, evidence: 'C' })).toBeLessThan(softScore({ ...base, evidence: 'A', ansatzMiss: true }));
    expect(softScore({ ...base, evidence: 'C', textRelevance: 1 })).toBeLessThan(softScore({ ...base, evidence: 'A', textRelevance: 0 }));
    expect(softScore({ ...base, evidence: 'A' })).toBeLessThan(softScore({ ...base, evidence: 'B' }));
    expect(softScore({ ...base, draft: false })).toBeLessThan(softScore({ ...base, draft: true }));
  });

  it('begrenzt den Zeitabzug und zieht genannte Methoden nach vorn', () => {
    expect(softScore({ ...base, overBudgetMin: 200 }) - softScore(base)).toBe(4);
    expect(softScore({ ...base, mentioned: true, ansatzMiss: true, evidence: null, draft: true })).toBeLessThan(softScore(base));
  });

  it('Raumbedarf ordnet: eine Methode, die den besonderen Raum nicht nutzt, steht im Hauptschritt weiter hinten als am Rand', () => {
    expect(softScore({ ...base, raumUngenutzt: 'haupt' })).toBeGreaterThan(softScore({ ...base, raumUngenutzt: 'rand' }));
    expect(softScore({ ...base, raumUngenutzt: 'rand' })).toBeGreaterThan(softScore(base));
    expect(softScore({ ...base, ohnePraxisImHauptschritt: true })).toBeGreaterThan(softScore(base));
    // A named method stays ahead (genannter-wunsch-bleibt).
    expect(softScore({ ...base, mentioned: true, raumUngenutzt: 'haupt', ohnePraxisImHauptschritt: true })).toBeLessThan(softScore(base));
  });

  it('stableHash ist stabil und streut', () => {
    expect(stableHash('wald', 'abrufquiz')).toBe(stableHash('wald', 'abrufquiz'));
    const values = Array.from({ length: 200 }, (_, i) => stableHash('thema', `m${i}`));
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(values.filter((v) => v < 0.5).length).toBeGreaterThan(70);
    expect(values.filter((v) => v < 0.5).length).toBeLessThan(130);
  });

  it('pickOrder: harte Stufe schlägt Punktzahl, Gleichwertige wechseln mit Thema und Variante', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ item: `m${i}`, id: `m${i}`, hard: [0], soft: i < 8 ? 1 + i * 0.05 : 5 }));
    const worseTier = { item: 'tier', id: 'tier', hard: [1], soft: -100 };
    const order = pickOrder([...items, worseTier], 'fotosynthese');
    expect(order[order.length - 1]).toBe('tier');
    expect(order.slice(0, 8).sort()).toEqual(['m0', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7']);
    expect(order.slice(8, 12).sort()).toEqual(['m10', 'm11', 'm8', 'm9']);
    expect(pickOrder([...items, worseTier], 'fotosynthese')).toEqual(order);

    const tops = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((seed) => pickOrder(items, seed)[0]));
    expect(tops.size).toBeGreaterThanOrEqual(3);
    const variants = new Set([0, 1, 2, 3, 4, 5].map((v) => pickOrder(items, 'fotosynthese', v)[0]));
    expect(variants.size).toBeGreaterThanOrEqual(3);
  });

  it('pickOrder mit Toleranz 0 sortiert rein nach Punktzahl', () => {
    const items = [
      { item: 'b', id: 'b', hard: [0], soft: 2 },
      { item: 'a', id: 'a', hard: [0], soft: 1 }
    ];
    expect(pickOrder(items, 'x', 0, 0)).toEqual(['a', 'b']);
  });
});

describe('softScore: phase filling and subject area', () => {
  const base = {
    ansatzMiss: false,
    softFilterMisses: 0,
    variety: 0,
    overBudgetMin: 0,
    techUnasked: false,
    textRelevance: 0,
    evidence: 'A' as const,
    draft: false,
    functionPosition: 0,
    vorbereitungMin: 0,
    mentioned: false
  };
  it('a method that cannot fill the phase scores worse, capped at 3', async () => {
    const { softScore } = await import('../src/ranking.js');
    expect(softScore({ ...base, underBudgetMin: 9 })).toBe(softScore(base));
    expect(softScore({ ...base, underBudgetMin: 20 }) - softScore(base)).toBe(2);
    expect(softScore({ ...base, underBudgetMin: 80 }) - softScore(base)).toBe(3);
  });
  it('subject area: at home is better than neutral, foreign is worse', async () => {
    const { softScore } = await import('../src/ranking.js');
    expect(softScore({ ...base, fachbereich: 'passt' })).toBeLessThan(softScore({ ...base, fachbereich: 'neutral' }));
    expect(softScore({ ...base, fachbereich: 'fremd' })).toBeGreaterThan(softScore({ ...base, fachbereich: 'neutral' }));
  });
});
