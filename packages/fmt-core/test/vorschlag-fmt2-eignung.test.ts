import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import type { Baustein } from '../src/types.js';
import { parseCsv } from '../scripts/vorschlag-fmt2-bedarf.js';
import { art, bloecke, regelVorwissen, treffer, weiteLesart, zuCsv, type Eintrag } from '../scripts/vorschlag-fmt2-eignung.js';

// Synthetic methods only, so the test does not depend on the data that Tor D2 changes.
const D = loadFmtData(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'data'));
const klein = (extra: Partial<Baustein>): Baustein =>
  ({ kennung: 'x', name: 'X', anleitung: ['geleitet'], sequenz: [], feedback: [], adaptivitaet: [], lernfunktion: [], evidenz: [], ...extra }) as unknown as Baustein;
const e = (kennung: string, teil = '2', vorschlag = 'entfällt'): Eintrag => ({
  eintrag: `T${teil}-${kennung}`, teil, kennung, feld: 'f', wert_alt: '', vorschlag, beleg: 'a, "b"', entscheidung: '', pruefnotiz: ''
});

describe('vorschlag-fmt2-eignung', () => {
  it('liest die Vorwissens-Regeln mit der Regelmaschine: nur offen warnt bei gering, nur explizit bei hoch', () => {
    expect(regelVorwissen(klein({ anleitung: ['offen'] }), D.regeln)).toEqual({ gering: ['wenig-anleitung-geringes-vorwissen'] });
    expect(regelVorwissen(klein({ anleitung: ['offen'], sequenz: ['problem-vor-instruktion'] }), D.regeln)).toEqual({});
    expect(regelVorwissen(klein({ anleitung: ['explizit'] }), D.regeln)).toEqual({ hoch: ['viel-anleitung-hohes-vorwissen'] });
    expect(regelVorwissen(klein({ anleitung: ['offen', 'geleitet'] }), D.regeln)).toEqual({});
  });

  it('die weite Lesart trifft auch offen neben geleitet', () => {
    const r = D.regeln.find((x) => x.id === 'wenig-anleitung-geringes-vorwissen')!;
    const m = [klein({ kennung: 'a', anleitung: ['offen'] }), klein({ kennung: 'b', anleitung: ['offen', 'geleitet'] })];
    expect(treffer(r, m).map((b) => b.kennung)).toEqual(['a']);
    expect(treffer(weiteLesart(r)!, m).map((b) => b.kennung)).toEqual(['a', 'b']);
  });

  it('Blöcke halten die Einträge einer Methode zusammen und stellen Regeln und Matrix ans Ende', () => {
    const alle = [e('b'), e('a'), e('regel', '1'), ...Array.from({ length: 5 }, (_, i) => e(`c`, String(3 + (i % 2)))), e('d')].map((x, i) => ({ ...x, eintrag: `${x.eintrag}-${i}` }));
    const bl = bloecke(alle, 4);
    expect(bl.flat()).toHaveLength(alle.length);
    const block = (k: string) => bl.findIndex((b) => b.some((x) => x.kennung === k));
    expect(bl.filter((b) => b.some((x) => x.kennung === 'c'))).toHaveLength(1);
    expect(block('regel')).toBe(bl.length - 1);
    expect(block('a')).toBeLessThanOrEqual(block('d'));
  });

  it('CSV ist mit Kommas und Anführungszeichen lesbar', () => {
    const rows = parseCsv(zuCsv([e('a')]));
    expect(rows[0].beleg).toBe('a, "b"');
    expect(Object.keys(rows[0])).toEqual(['eintrag', 'teil', 'kennung', 'feld', 'wert_alt', 'vorschlag', 'beleg', 'entscheidung', 'pruefnotiz']);
  });

  it('ordnet Vorschläge für die Übersicht ein', () => {
    expect(art(e('a', '3', 'streichen'))).toBe('weg');
    expect(art(e('a', '3', 'ungeeignetBeiStufe=primar; eignungsgrund.stufe: S – Text'))).toBe('grund');
    expect(art(e('a', '7', 'bleibt'))).toBe('gleich');
    expect(art(e('a', '6', 'adaptivitaet=mikro'))).toBe('neu');
  });
});
