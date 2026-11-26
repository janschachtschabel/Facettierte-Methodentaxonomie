import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { createSearch, createValidator } from '../src/index.js';
import { raumBietet, raumFehlt, nutztRaum, schriftFehlt, ungedeckterBedarf } from '../src/bedarf.js';
import { baueSituation } from '../src/situation.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const D = loadFmtData(path.join(ROOT, 'data'));

describe('Bedarf: Vokabular', () => {
  it('kennt das Wort Bedingungsraum nicht mehr', () => {
    expect(JSON.stringify(D.schemes)).not.toMatch(/Bedingungsraum/);
  });
});

describe('Bedarf: Raum und Schrift', () => {
  const m = (raumbedarf?: string[], schriftbedarf?: string[]) => ({ raumbedarf, schriftbedarf });

  it('Raumtypen bieten die Eigenschaften der Spec', () => {
    expect([...raumBietet(D, 'hoersaal')].sort()).toEqual(['schreibplatz', 'wandflaeche']);
    expect([...raumBietet(D, 'bewegungsraum')].sort()).toEqual(['bewegungsflaeche', 'fachausstattung', 'stellflaeche']);
    expect(raumBietet(D, 'unbekannt').size).toBe(0);
  });

  it('meldet fehlende Raumeigenschaften mit Label', () => {
    const fehlt = (b: ReturnType<typeof m>, raum: string) => raumFehlt(b, baueSituation({ raum }, D));
    expect(fehlt(m(['stellflaeche']), 'hoersaal')).toEqual(['stellflaeche']);
    expect(fehlt(m(['schreibplatz', 'wandflaeche']), 'bewegungsraum')).toEqual(['schreibplatz', 'wandflaeche']);
    expect(fehlt(m(['stellflaeche']), 'klassenraum')).toEqual([]);
    expect(fehlt(m(undefined), 'hoersaal')).toEqual([]);
    expect(fehlt(m([]), 'bewegungsraum')).toEqual([]);
  });

  it('erkennt, ob eine Methode den besonderen Raum nutzt', () => {
    expect(nutztRaum(D, m(['bewegungsflaeche']), 'bewegungsraum')).toBe(true);
    expect(nutztRaum(D, m(['stellflaeche']), 'bewegungsraum')).toBe(false);
    expect(nutztRaum(D, m(['fachausstattung']), 'fachraum')).toBe(true);
  });

  it('Suche nach Raum liefert nur Methoden, deren Raumbedarf der Raum deckt', () => {
    const hits = createSearch(D, createValidator(D)).suche({ raum: 'bewegungsraum' });
    expect(hits.length).toBeGreaterThan(20);
    for (const b of hits) expect(raumFehlt(b, baueSituation({ raum: 'bewegungsraum' }, D)), b.kennung).toEqual([]);
  });

  it('meldet fehlende Schriftsprache', () => {
    expect(schriftFehlt(m(undefined, ['liest', 'schreibt']), ['lesen'])).toEqual(['Lesen']);
    expect(schriftFehlt(m(undefined, ['schreibt']), ['lesen'])).toEqual([]);
    expect(schriftFehlt(m(undefined, undefined), ['lesen', 'schreiben'])).toEqual([]);
  });
});

describe('Bedarf: Datenvorschlag', () => {
  it('leitet Raumbedarf so ab, dass keine Methode ihre eigenen Raumtypen ausschließt', async () => {
    const { vorschlagAlle } = await import('../scripts/vorschlag-einsatzprofil.js');
    const { vorDurchsicht1 } = await import('./fixtures/vor-durchsicht-1.js');
    // The proposal reads the room fields of the time before Durchsicht 1 (test fixture).
    const DA = vorDurchsicht1(D);
    const v = vorschlagAlle(DA);
    expect(v['sportmotorischer-test'].raumbedarf).toEqual(['bewegungsflaeche']);
    expect(v.rollenspiel.raumbedarf).toEqual(['stellflaeche']);
    expect(v.exkursion.raumbedarf).toEqual(['aussenort']);
    expect(v.abrufquiz).toMatchObject({ raumbedarf: ['schreibplatz'], schriftbedarf: ['schreibt'] });
    const bietet = Object.fromEntries((D.schemes.find((s) => s.id === 'raumtyp')!.werte || []).map((w) => [w.id, w.bietet || []]));
    for (const b of DA.bausteine)
      for (const ort of b.lernort || [])
        for (const x of v[b.kennung].raumbedarf.filter((x: string) => x !== 'aussenort'))
          expect(bietet[ort], `${b.kennung}: ${ort} ohne ${x}`).toContain(x);
  });
});

describe('Bedarf gegen Situation', () => {
  const kugellager = D.bausteine.find((b) => b.kennung === 'kugellager')!;
  const abrufquiz = D.bausteine.find((b) => b.kennung === 'abrufquiz')!;
  const ohneNeueFelder = (() => {
    const { raumbedarf, fachausstattungArt, schriftbedarf, termineMin, ...rest } = abrufquiz;
    void raumbedarf; void fachausstattungArt; void schriftbedarf; void termineMin;
    return rest as typeof abrufquiz;
  })();

  it('Hörsaal bietet keine Stellfläche: Kugellager ist ausgeschlossen', () => {
    const s = baueSituation({ raum: 'hoersaal' }, D);
    expect(ungedeckterBedarf({ ...kugellager, raumbedarf: ['stellflaeche'] }, { raum: 'hoersaal' }, s, D)).toEqual({
      merkmal: 'raumbedarf',
      grund: 'braucht: Stellfläche'
    });
  });
  it('ohne Raumangabe wird nichts wegen des Raums ausgeschlossen, der Raum steht unter angenommen', () => {
    const s = baueSituation({ fachbereich: 'sport' }, D);
    expect(s.raumGenannt).toBe(false);
    expect(s.pflichtangaben.angenommen.map((x) => x.feld)).toContain('raum');
    expect(ungedeckterBedarf({ ...abrufquiz, raumbedarf: ['schreibplatz'] }, {}, s, D)).toBeNull();
    expect(raumFehlt({ ...abrufquiz, raumbedarf: ['schreibplatz'] }, s)).toEqual(['schreibplatz']);
  });
  it('Methode ohne neue Kodierung wird nie wegen Raum, Schrift oder Terminen ausgeschlossen', () => {
    const s = baueSituation({ raum: 'hoersaal', ohneSchrift: ['lesen', 'schreiben'], termine: 1 }, D);
    expect(ungedeckterBedarf(ohneNeueFelder, { raum: 'hoersaal' }, s, D)).toBeNull();
  });
  it('Klassenmusizieren braucht Fachausstattung der Art Musik: im Werkraum ausgeschlossen, im allgemeinen Fachraum nicht', () => {
    const musik = { ...abrufquiz, raumbedarf: ['fachausstattung'], fachausstattungArt: 'musik' };
    const werk = baueSituation({ raum: 'werkraum' }, D);
    expect(ungedeckterBedarf(musik, { raum: 'werkraum' }, werk, D)?.merkmal).toBe('fachausstattungArt');
    const fach = baueSituation({ raum: 'fachraum' }, D);
    expect(ungedeckterBedarf(musik, { raum: 'fachraum' }, fach, D)).toBeNull();
    const mr = baueSituation({ raum: 'musikraum' }, D);
    expect(ungedeckterBedarf(musik, { raum: 'musikraum' }, mr, D)).toBeNull();
  });
  it('ohneSchrift lesen schließt eine Methode mit schriftbedarf liest aus', () => {
    const a = { ohneSchrift: ['lesen'] };
    const s = baueSituation(a, D);
    expect(ungedeckterBedarf({ ...abrufquiz, schriftbedarf: ['liest'] }, a, s, D)).toEqual({ merkmal: 'schriftbedarf', grund: 'verlangt: Lesen' });
    expect(ungedeckterBedarf({ ...abrufquiz, schriftbedarf: ['schreibt'] }, a, s, D)).toBeNull();
  });
  it('termine 1 schließt eine Methode mit termineMin 2 aus', () => {
    const a = { termine: 1 };
    const s = baueSituation(a, D);
    expect(ungedeckterBedarf({ ...abrufquiz, termineMin: 2 }, a, s, D)).toMatchObject({ merkmal: 'termineMin' });
    expect(ungedeckterBedarf({ ...abrufquiz, termineMin: 1 }, a, s, D)).toBeNull();
  });
  it('übernimmt die Texte der Rahmenbedingungen in fester Reihenfolge', () => {
    const s = baueSituation({}, D);
    expect(ungedeckterBedarf({ ...abrufquiz, dauerMin: 30 }, { zeitMin: 10 }, s, D)).toEqual({ merkmal: 'dauerMin', grund: 'braucht mindestens 30 min' });
    expect(ungedeckterBedarf({ ...abrufquiz, gruppeMin: 5 }, { gruppe: 2 }, s, D)).toEqual({ merkmal: 'gruppeMin', grund: 'erst ab 5 Personen' });
    expect(ungedeckterBedarf({ ...abrufquiz, internet: true }, { ohneInternet: true }, s, D)).toEqual({ merkmal: 'internet', grund: 'braucht Internet' });
  });
});
