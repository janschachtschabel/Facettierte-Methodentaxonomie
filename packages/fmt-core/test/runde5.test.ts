import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { createMatcher, createValidator } from '../src/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const D = loadFmtData(path.join(ROOT, 'data'));
const M = createMatcher(D, createValidator(D));

describe('Runde 5: Befunde aus Testreihe 3', () => {
  it('P2: Ein Ablauf ohne Zeitangabe nimmt eine Stunde von 45 Minuten an', () => {
    const r = M.zuordnen({ text: 'Einstieg Photosynthese', modus: 'ablauf' });
    expect(r.modus).toBe('ablauf');
    expect(r.pruefung?.dauerMin).toBeLessThanOrEqual(45);
    expect(r.pruefung?.dauerMin).toBeGreaterThanOrEqual(40);
    expect((r.annahmen || []).join(' ')).toMatch(/45 Minuten/);
  });
});
