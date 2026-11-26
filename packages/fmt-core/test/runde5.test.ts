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

describe('Runde 5, P3: Thema ohne Fachname ergibt den Fachbereich', () => {
  const faelle: Array<[string, string]> = [
    ['Satz des Pythagoras einführen, Klasse 9, 45 Minuten', 'mathe-informatik'],
    ['Bruchrechnung Klasse 6', 'mathe-informatik'],
    ['Lineare Funktionen wiederholen und am Ende Test schreiben, 8. Klasse, 90 Minuten', 'mathe-informatik'],
    ['Gedichtanalyse Expressionismus, Klasse 10, 45 Minuten', 'sprachen'],
    ['Einstieg Photosynthese', 'nawi-technik'],
    ['Turnen in der 3. Klasse: Rolle vorwärts lernen, 45 Minuten', 'sport'],
    ['English year 8: watch a short film and discuss it, 90 minutes', 'sprachen'],
    ['Reihenschaltung und Parallelschaltung, Klasse 8', 'nawi-technik'],
    ['Industrialisierung in England, Klasse 9', 'gesellschaft']
  ];
  it.each(faelle)('%s → %s', (text, fb) => {
    expect(M.lesen(text).kriterien.fachbereich).toBe(fb);
  });
  it('ein genanntes Fach geht vor dem Thema', () => {
    expect(M.lesen('Politik Klasse 10: Stromkreis der Macht').kriterien.fachbereich).toBe('gesellschaft');
  });
  it('Themenwörter in Alltagssprache lösen keinen Fachbereich aus', () => {
    expect(M.lesen('Klassenrat: Streit in der Pause klären, 45 Minuten').kriterien.fachbereich).toBeUndefined();
  });
});
