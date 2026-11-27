import { describe, it, expect } from 'vitest';
import { subgroupsFromText } from '../src/llm/briefings.js';

describe('Fix wave C, 1: im Text genannte Gruppen tragen ihre Kernwerte', () => {
  it('subgroupsFromText gibt die genannten Werte weiter', () => {
    const [g] = subgroupsFromText('Mathe Klasse 8, 6 Lernende mit geringem Vorwissen', 24);
    expect(g.id).toBe('vorwissen-gering');
    expect(g.genannt).toEqual(['vorwissen-gering', 'leistungsniveau-gering']);
  });
});
