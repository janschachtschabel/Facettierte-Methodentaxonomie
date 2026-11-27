import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMatcher, createValidator, type CatalogBundle, type FmtData } from '@fmt/core';
import { BEISPIEL_ANFRAGEN } from '../src/planner/beispiele.js';
import { MEHR_ANGABEN_CODEFELDER, mehrAngabenInAnfrage } from '../src/planner/mehrAngaben.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BUNDLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist-data', 'catalog.bundle.json'), 'utf8')) as CatalogBundle;
const DATA = { ...BUNDLE, VERSION: BUNDLE.version } as unknown as FmtData;
const matcher = createMatcher(DATA, createValidator(DATA));
const werte = (feld: string) => (matcher.felder().find((f) => f.feld === feld)?.werte || []).map((w) => w.code);

describe('Beispiele sind Anfragen an den Kern (App-Nachzug N4)', () => {
  it('kein Beispiel nennt eine Kette oder Methoden; die Codes stammen aus matcher.felder()', () => {
    for (const ex of BEISPIEL_ANFRAGEN) {
      expect(Object.keys(ex)).not.toContain('chain');
      expect(ex.mehr.zieltyp, ex.id).toBeUndefined();
      for (const f of MEHR_ANGABEN_CODEFELDER) {
        const v = ex.mehr[f];
        if (v) expect(werte(f), `${ex.id}: ${f}`).toContain(v);
      }
    }
  });

  it('jedes Beispiel ergibt im Kern einen gültigen Ablauf; die Kette folgt aus der Zielart, auch die vollständige Handlung', () => {
    const ketten = new Set<string>();
    for (const ex of BEISPIEL_ANFRAGEN) {
      const r = matcher.zuordnen({ text: ex.text, ...mehrAngabenInAnfrage(ex.mehr) });
      expect(r.modus, ex.id).toBe('ablauf');
      if (r.modus !== 'ablauf') continue;
      expect(r.pruefung?.gueltig, ex.id).toBe(true);
      expect(r.pflichtangaben, ex.id).toBeTruthy();
      ketten.add(r.kette!.id);
    }
    expect(ketten.has('vollstaendige-handlung')).toBe(true);
    expect(ketten.size).toBeGreaterThanOrEqual(4);
  });
});
