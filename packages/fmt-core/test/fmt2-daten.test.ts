import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { endwerte, leseEntscheidung, uebernehme, WISSENSARTEN } from '../scripts/uebernehme-durchsicht.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const D = loadFmtData(path.resolve(HERE, '..', '..', '..', 'data'));
/** Old room fields before Durchsicht 1 (lernort, raum), kept as a test fixture for plausibility checks. */
const ALT = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'vor-durchsicht-1.json'), 'utf8')) as Record<
  string,
  { lernort: string[]; raum?: string; aufgabe: string[]; fachbereichUngeeignet?: string[] }
>;
const werte = (scheme: string) => new Set((D.schemes.find((s) => s.id === scheme)?.werte || []).map((w) => w.id));
const roh = (b: unknown) => b as Record<string, unknown>;

describe('FMT 2.0: Daten nach Durchsicht 1', () => {
  it('keine Methode trägt mehr lernort oder das Freitextfeld raum', () => {
    const mit = D.bausteine.filter((b) => 'lernort' in roh(b) || 'raum' in roh(b)).map((b) => b.kennung);
    expect(mit).toEqual([]);
    // The room texts survive as raumhinweis.
    const hinweise = Object.entries(ALT).filter(([, a]) => a.raum).map(([k]) => k);
    expect(hinweise.length).toBeGreaterThan(100);
    for (const k of hinweise) expect(D.bausteine.find((b) => b.kennung === k)!.raumhinweis, k).toBe(ALT[k].raum);
    expect(werte('lernort').size).toBe(0);
  });

  it('raumbedarf, schriftbedarf und fachausstattungArt nutzen nur Werte der Vokabulare', () => {
    const raum = werte('raumbedarf');
    const schrift = werte('schriftbedarf');
    const art = werte('fachausstattungart');
    for (const b of D.bausteine) {
      for (const x of b.raumbedarf || []) expect(raum.has(x), `${b.kennung}: ${x}`).toBe(true);
      for (const x of b.schriftbedarf || []) expect(schrift.has(x), `${b.kennung}: ${x}`).toBe(true);
      if (b.fachausstattungArt) expect(art.has(b.fachausstattungArt), b.kennung).toBe(true);
      if (b.termineMin != null) expect(Number.isInteger(b.termineMin) && b.termineMin >= 2, b.kennung).toBe(true);
      for (const k of ['raumbedarf', 'schriftbedarf', 'fachbereichUngeeignet'] as const)
        expect(roh(b)[k] === undefined || (roh(b)[k] as unknown[]).length > 0, `${b.kennung}: leere Liste ${k}`).toBe(true);
    }
    expect(D.bausteine.filter((b) => b.raumbedarf?.length).length).toBeGreaterThan(100);
    expect(D.bausteine.filter((b) => b.schriftbedarf?.length).length).toBeGreaterThan(100);
  });

  it('fachausstattungArt steht nur bei Methoden mit raumbedarf fachausstattung', () => {
    const ohne = D.bausteine.filter((b) => b.fachausstattungArt && !(b.raumbedarf || []).includes('fachausstattung'));
    expect(ohne.map((b) => b.kennung)).toEqual([]);
  });

  it('jede Methode trägt mindestens eine Wissensart in D1', () => {
    const ohne = D.bausteine.filter((b) => !(b.aufgabe || []).some((x) => WISSENSARTEN.includes(x))).map((b) => b.kennung);
    // ki-chat is a contrast entry without a reliable learning state; Tor D1 left its knowledge type empty on purpose.
    const BEWUSST_LEER = ['ki-chat'];
    expect(ohne).toEqual(BEWUSST_LEER);
    // The other values of D1 (AFB, structure, authenticity) stay untouched.
    for (const b of D.bausteine) {
      const rest = (x: string[]) => x.filter((y) => !WISSENSARTEN.includes(y));
      expect(rest(b.aufgabe || []), b.kennung).toEqual(rest(ALT[b.kennung].aufgabe));
    }
  });

  it('wer schreibt, braucht in keinem Fall einen Raum ohne Schreibplatz als einzigen bisherigen Lernort', () => {
    // Plausibility: a method that has learners write was not made only for rooms without a writing place.
    const ohneSchreibplatz = new Set(['bewegungsraum', 'draussen']);
    const auffaellig = D.bausteine
      .filter((b) => (b.schriftbedarf || []).includes('schreibt'))
      .filter((b) => {
        const lernort = ALT[b.kennung]?.lernort || [];
        return lernort.length > 0 && lernort.every((x) => ohneSchreibplatz.has(x));
      })
      .map((b) => b.kennung);
    // Known offenders after the gate would be listed here with a reason; there are none.
    const BEKANNT: string[] = [];
    expect(auffaellig).toEqual(BEKANNT);
  });
});

describe('uebernehme-durchsicht.ts', () => {
  const zeile = (extra: Record<string, string>) => ({
    kennung: 'x', raumbedarf_vorschlag: 'schreibplatz|wandflaeche', fachausstattungArt: '', schriftbedarf_vorschlag: 'schreibt',
    termineMin_vorschlag: '2', wissensart_alt: 'konzepte', wissensart_vorschlag: '', fach_ungeeignet_vorschlag: 'sport|sprachen',
    entscheidung: '', ...extra
  });

  it('die Entscheidung überschreibt den Vorschlag, leerer Wert heißt leere Liste', () => {
    const d = endwerte(zeile({ entscheidung: 'raumbedarf=schreibplatz; termineMin=; fach_ungeeignet=' }));
    expect(d).toEqual({ raumbedarf: ['schreibplatz'], schriftbedarf: ['schreibt'], wissensart: ['konzepte'], fachUngeeignet: [] });
    expect(endwerte(zeile({ wissensart_vorschlag: 'fakten' })).wissensart).toEqual(['fakten']);
    expect(endwerte(zeile({ wissensart_vorschlag: 'fakten', entscheidung: 'wissensart=fakten|prozeduren' })).wissensart).toEqual(['fakten', 'prozeduren']);
    expect(() => leseEntscheidung('lernort=x')).toThrow(/unbekanntes Feld/);
  });

  it('hält die Reihenfolge der Schlüssel, lässt leere Felder weg und ist wiederholbar', () => {
    const alt = {
      kennung: 'x', fachbereich: ['sprachen'], fachbereichUngeeignet: ['sport'], lernort: ['klassenraum'],
      aufgabe: ['afb2', 'konzepte'], material: ['Tafel'], raum: 'Stuhlkreis', gruppeMin: 2
    };
    const d = endwerte(zeile({ entscheidung: 'fach_ungeeignet=' }));
    const neu = uebernehme(alt, d);
    expect(Object.keys(neu)).toEqual(['kennung', 'fachbereich', 'raumbedarf', 'schriftbedarf', 'termineMin', 'aufgabe', 'material', 'raumhinweis', 'gruppeMin']);
    expect(neu.aufgabe).toEqual(['konzepte', 'afb2']);
    expect(neu.raumhinweis).toBe('Stuhlkreis');
    expect(uebernehme(neu, d)).toEqual(neu);
    expect(JSON.stringify(uebernehme(neu, d))).toBe(JSON.stringify(neu));
  });
});
