import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { createMatcher, createValidator, unbekannterWert, ZAHL_GRENZEN, zahlFehler } from '../src/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const data = loadFmtData(path.join(ROOT, 'data'));
const M = createMatcher(data, createValidator(data));

describe('Eingaben prüfen: eine Quelle für Codes und Zahlgrenzen (Lücken R03, R17)', () => {
  it('ZAHL_GRENZEN nennt jedes Zahlfeld der Anfrage mit der Grenze, die der Kern annimmt', () => {
    const zahlFelder = M.felder()
      .filter((f) => f.typ === 'integer')
      .map((f) => f.feld)
      .sort();
    expect(Object.keys(ZAHL_GRENZEN).sort()).toEqual(zahlFelder);
    // The core accepts 0 everywhere today; zeitMin has the budget limit.
    for (const g of Object.values(ZAHL_GRENZEN)) expect(g.min).toBe(0);
    expect(ZAHL_GRENZEN.zeitMin.max).toBe(20000);
    // The JSON schema of the request reads the same bounds.
    const props = M.schema().properties as Record<string, { minimum?: number; maximum?: number }>;
    expect(props.zeitMin).toMatchObject({ minimum: 0, maximum: 20000 });
    expect(props.gruppe).toMatchObject({ minimum: 0 });
  });

  it('pruefeFeld meldet unbekannte Codes wie zuordnen und nennt die erlaubten Werte', () => {
    const f = M.pruefeFeld('raum', 'mondbasis');
    expect(f?.fehler).toBe(unbekannterWert('raum', 'mondbasis', f!.erlaubt!));
    expect(f?.erlaubt).toContain('klassenraum');
    expect(() => M.zuordnen({ raum: 'mondbasis' })).toThrow(f!.fehler);
    // The former name lernort is checked as raum, the message names the field as given.
    expect(M.pruefeFeld('lernort', 'mondbasis')?.fehler).toMatch(/^Feld „lernort“: unbekannter Wert „mondbasis“/);
    expect(M.pruefeFeld('raumBietet', ['bewegungsflaeche', 'quatsch'])?.fehler).toMatch(/„quatsch“/);
    expect(M.pruefeFeld('raum', 'klassenraum')).toBeNull();
    expect(M.pruefeFeld('unbekanntesFeld', 'x')).toBeNull();
  });

  it('pruefeFeld prüft Zahlen mit den Grenzen aus ZAHL_GRENZEN', () => {
    expect(M.pruefeFeld('termine', 'abc')?.fehler).toBe('Feld „termine“: erwartet wird eine ganze Zahl ab 0.');
    expect(M.pruefeFeld('termine', '3')).toBeNull();
    expect(M.pruefeFeld('gruppe', 0)).toBeNull();
    expect(M.pruefeFeld('zeitMin', 20001)?.fehler).toBe('Feld „zeitMin“: höchstens 20000 Minuten.');
    expect(zahlFehler('limit', '0', { min: 1 })).toBe('Feld „limit“: erwartet wird eine ganze Zahl ab 1.');
    expect(zahlFehler('limit', 5, { min: 1 })).toBeNull();
  });
});
