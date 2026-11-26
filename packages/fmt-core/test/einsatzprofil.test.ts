import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { createSearch, createValidator } from '../src/index.js';
import { raumBietet, raumFehlt, nutztRaum, schriftFehlt } from '../src/einsatzprofil.js';

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

describe('Einsatzprofil: Raum und Schrift', () => {
  const m = (raumbedarf?: string[], schriftbedarf?: string[]) => ({ raumbedarf, schriftbedarf });

  it('Raumtypen bieten die Eigenschaften der Spec', () => {
    expect([...raumBietet(D, 'hoersaal')].sort()).toEqual(['schreibplatz', 'wandflaeche']);
    expect([...raumBietet(D, 'bewegungsraum')].sort()).toEqual(['bewegungsflaeche', 'stellflaeche']);
    expect(raumBietet(D, 'unbekannt').size).toBe(0);
  });

  it('meldet fehlende Raumeigenschaften mit Label', () => {
    expect(raumFehlt(D, m(['stellflaeche']), 'hoersaal')).toEqual(['Stellfläche']);
    expect(raumFehlt(D, m(['schreibplatz', 'wandflaeche']), 'bewegungsraum')).toEqual(['Schreibplatz', 'Wand- oder Tafelfläche']);
    expect(raumFehlt(D, m(['stellflaeche']), 'klassenraum')).toEqual([]);
    expect(raumFehlt(D, m(undefined), 'hoersaal')).toEqual([]);
    expect(raumFehlt(D, m([]), 'bewegungsraum')).toEqual([]);
  });

  it('erkennt, ob eine Methode den besonderen Raum nutzt', () => {
    expect(nutztRaum(D, m(['bewegungsflaeche']), 'bewegungsraum')).toBe(true);
    expect(nutztRaum(D, m(['stellflaeche']), 'bewegungsraum')).toBe(false);
    expect(nutztRaum(D, m(['fachausstattung']), 'fachraum')).toBe(true);
  });

  it('Suche nach Raum liefert nur Methoden, deren Raumbedarf der Raum deckt', () => {
    const hits = createSearch(D, createValidator(D)).suche({ raum: 'bewegungsraum' });
    expect(hits.length).toBeGreaterThan(20);
    for (const b of hits) expect(raumFehlt(D, b, 'bewegungsraum'), b.kennung).toEqual([]);
  });

  it('meldet fehlende Schriftsprache', () => {
    expect(schriftFehlt(m(undefined, ['liest', 'schreibt']), ['lesen'])).toEqual(['Lesen']);
    expect(schriftFehlt(m(undefined, ['schreibt']), ['lesen'])).toEqual([]);
    expect(schriftFehlt(m(undefined, undefined), ['lesen', 'schreiben'])).toEqual([]);
  });
});

describe('Einsatzprofil: Datenvorschlag', () => {
  it('leitet Raumbedarf so ab, dass keine Methode ihre eigenen Raumtypen ausschließt', async () => {
    const { vorschlagAlle } = await import('../scripts/vorschlag-einsatzprofil.js');
    const v = vorschlagAlle(D);
    expect(v['sportmotorischer-test'].raumbedarf).toEqual(['bewegungsflaeche']);
    expect(v.rollenspiel.raumbedarf).toEqual(['stellflaeche']);
    expect(v.exkursion.raumbedarf).toEqual(['aussenort']);
    expect(v.abrufquiz).toMatchObject({ raumbedarf: ['schreibplatz'], schriftbedarf: ['schreibt'] });
    const bietet = Object.fromEntries((D.schemes.find((s) => s.id === 'raumtyp')!.werte || []).map((w) => [w.id, w.bietet || []]));
    for (const b of D.bausteine)
      for (const ort of b.lernort || [])
        for (const x of v[b.kennung].raumbedarf.filter((x: string) => x !== 'aussenort'))
          expect(bietet[ort], `${b.kennung}: ${ort} ohne ${x}`).toContain(x);
  });
});
