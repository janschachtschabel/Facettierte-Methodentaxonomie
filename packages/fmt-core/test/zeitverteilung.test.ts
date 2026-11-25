import { describe, it, expect } from 'vitest';
import { phaseBudgets, stretch } from '../src/zeitverteilung.js';

const konzeptaufbau = [
  { funktion: ['orientierung'] },
  { funktion: ['verstehen'] },
  { funktion: ['konsolidierung'] },
  { funktion: ['anwendung', 'problemloesen'] },
  { funktion: ['metakognition'] }
];
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('Zeit nach Phasenrolle', () => {
  it('gibt der Hauptphase den größten Anteil und bleibt im Budget', () => {
    const b = phaseBudgets(konzeptaufbau, 90);
    expect(sum(b)).toBeLessThanOrEqual(90);
    expect(sum(b)).toBeGreaterThanOrEqual(86);
    expect(b[1]).toBeGreaterThanOrEqual(25);
    expect(b[1]).toBe(Math.max(...b));
    expect(b[0]).toBeLessThan(b[3]);
    expect(b[4]).toBeLessThan(b[2]);
  });

  it('hält Mindestdauern verankerter Methoden ein', () => {
    const b = phaseBudgets(konzeptaufbau, 90, [undefined, undefined, undefined, 40, undefined]);
    expect(b[3]).toBeGreaterThanOrEqual(40);
    expect(sum(b)).toBeLessThanOrEqual(90);
    expect(b.every((x) => x >= 5)).toBe(true);
  });

  it('gibt bei sehr kleinem Budget jedem Schritt mindestens 5 Minuten', () => {
    expect(phaseBudgets(konzeptaufbau, 20)).toEqual([5, 5, 5, 5, 5]);
    expect(phaseBudgets([], 45)).toEqual([]);
  });

  it('stretch verteilt Restzeit in 5er-Schritten bis zur Höchstdauer', () => {
    const parts = [
      { min: 5, max: 10, cur: 5 },
      { min: 15, max: 45, cur: 20 },
      { min: 5, max: 8, cur: 8 }
    ];
    const out = stretch(parts, 50);
    expect(sum(out)).toBe(50);
    expect(out[2]).toBe(8);
    expect(stretch(parts, 80)).toEqual([10, 45, 8]);
    expect(out[0]).toBeLessThanOrEqual(10);
    expect(out[1]).toBeLessThanOrEqual(45);
    expect(stretch([{ min: 5, max: 10, cur: 10 }], 60)).toEqual([10]);
    expect(stretch([{ min: 5, max: 30, cur: 20 }], 15)).toEqual([20]);
  });
});

describe('phaseBudgets with data shares', () => {
  it('uses zeitanteil from the chain step before the learning function', async () => {
    const { phaseBudgets } = await import('../src/zeitverteilung.js');
    const steps = [
      { funktion: ['orientierung'], zeitanteil: 10 },
      { funktion: ['orientierung'], zeitanteil: 70 },
      { funktion: ['verstehen'], zeitanteil: 20 }
    ];
    expect(phaseBudgets(steps, 100)).toEqual([10, 70, 20]);
  });
});
