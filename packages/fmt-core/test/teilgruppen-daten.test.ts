import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { DIFF_MATRIX_VARIABLES } from '../src/differentiationMatrix.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const T = loadFmtData(path.join(ROOT, 'data')).teilgruppen;
const alleAuspraegungen = new Set(DIFF_MATRIX_VARIABLES.flatMap((o) => o.kategorien.flatMap((k) => k.auspraegungen.map((a) => a.id))));
const alleKategorien = new Set(DIFF_MATRIX_VARIABLES.flatMap((o) => o.kategorien.map((k) => k.id)));

describe('Tabelle „Tausch oder Hilfe“ als Daten', () => {
  it('jede Ausprägung existiert in der Matrix', () => {
    for (const m of T.merkmale) for (const a of m.auspraegungen) expect(alleAuspraegungen.has(a), `${m.id}: ${a}`).toBe(true);
  });
  it('keine Ausprägung steht in zwei Zeilen', () => {
    const gesehen = new Map<string, string>();
    for (const m of T.merkmale)
      for (const a of m.auspraegungen) {
        expect(gesehen.has(a), `${a} in ${gesehen.get(a)} und ${m.id}`).toBe(false);
        gesehen.set(a, m.id);
      }
  });
  it('jede gesperrte Kategorie existiert', () => {
    expect(T.gesperrt.length).toBeGreaterThan(0);
    for (const k of T.gesperrt) expect(alleKategorien.has(k), k).toBe(true);
    expect(T.gesperrtText).toContain('Pashler');
  });
  it('jede Zeile mit Tausch nennt eine Richtung, Hilfe nicht', () => {
    for (const m of T.merkmale) {
      if (m.antwort === 'tausch') expect(m.richtung, m.id).toBeTruthy();
      else expect(m.richtung, m.id).toBeUndefined();
    }
  });
  it('Zeilen haben eindeutige Kennungen, Ziel und Grundlage; E-Zeilen eine Quelle', () => {
    expect(new Set(T.merkmale.map((m) => m.id)).size).toBe(T.merkmale.length);
    for (const m of T.merkmale) {
      expect(m.wohin.length, m.id).toBeGreaterThan(0);
      expect(m.auspraegungen.length, m.id).toBeGreaterThan(0);
      if (m.grundlage === 'E') expect(m.quelle, m.id).toBeTruthy();
    }
  });
  it('Auffangantwort und Abbau', () => {
    expect(T.sonst).toMatchObject({ antwort: 'hilfe', grundlage: 'U' });
    expect(Object.keys(T.abbau).sort()).toEqual(['aufgaben', 'lernmaterialien', 'lernzeit', 'sonst', 'unterstuetzung']);
  });
});
