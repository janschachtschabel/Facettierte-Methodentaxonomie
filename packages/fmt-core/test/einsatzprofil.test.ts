import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const D = loadFmtData(path.join(ROOT, 'data'));

describe('Einsatzprofil: Ebenen und Merkmale', () => {
  it('hat neun Einsatzmerkmale mit den Kennungen der Spec', () => {
    expect(D.merkmale.map((m) => m.id)).toEqual(['BD1', 'BD2', 'BD3', 'BD4', 'BD5', 'BD6', 'EG1', 'EG2', 'EG3']);
  });

  it('ordnet jedes Feld jeder Methode genau einer Ebene zu', () => {
    const ebeneVon = new Map<string, string>();
    for (const e of D.ebenen)
      for (const f of e.felder) {
        expect(ebeneVon.has(f), `${f} doppelt`).toBe(false);
        ebeneVon.set(f, e.id);
      }
    const felder = new Set(D.bausteine.flatMap((b) => Object.keys(b)));
    for (const f of felder) expect(ebeneVon.has(f), `Feld ${f} ohne Ebene`).toBe(true);
  });

  it('führt die Felder der Merkmale in der passenden Ebene', () => {
    for (const m of D.merkmale) {
      const ebene = D.ebenen.find((e) => e.id === m.art)!;
      for (const f of m.felder) expect(ebene.felder, `${m.id}: ${f}`).toContain(f);
    }
  });

  it('kennt das Wort Bedingungsraum nicht mehr', () => {
    expect(JSON.stringify(D.schemes)).not.toMatch(/Bedingungsraum/);
  });
});
