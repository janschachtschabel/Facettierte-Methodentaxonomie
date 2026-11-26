import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { createMatcher, createValidator } from '../src/index.js';
import { alleFallergebnisse, vergleicheMitAusgang } from './qualitaet/vergleich.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const D = loadFmtData(path.join(ROOT, 'data'));
const M = createMatcher(D, createValidator(D));

describe('Ausgangsstand der Qualitätsfälle', () => {
  it('kein Qualitätsfall ist schlechter als im Ausgangsstand', () => {
    expect(vergleicheMitAusgang(alleFallergebnisse(M, D))).toEqual([]);
  });
});
