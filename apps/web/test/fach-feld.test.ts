import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMatcher, createValidator, type CatalogBundle, type FmtData } from '@fmt/core';
import { fachbereichFromField } from '../src/planner/fachFeld.js';

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
const M = createMatcher(DATA, createValidator(DATA));

describe('Baukasten ohne KI: Feld „Fach“ (Runde 5, P13)', () => {
  it('liefert den Fachbereich aus dem Feld, wenn der Text kein Fach nennt', () => {
    expect(fachbereichFromField(M, 'Kurvendiskussion üben, 8. Klasse, 45 Minuten', 'Mathematik')).toBe('mathe-informatik');
  });
  it('lässt ein im Text genanntes Fach gelten', () => {
    expect(fachbereichFromField(M, 'Politik Klasse 9: argumentieren üben, 45 Minuten', 'Deutsch')).toBeUndefined();
  });
  it('ohne Fach im Feld bleibt alles beim Text', () => {
    expect(fachbereichFromField(M, 'Kurvendiskussion, 45 Minuten', '  ')).toBeUndefined();
  });
});
