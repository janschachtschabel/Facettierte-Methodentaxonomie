import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { createSearch } from '../src/suche.js';
import { einordnungInKetten } from '../src/zielart.js';
import { REGEL_LAGE_FELDER, bausteineImArrangement, passungImArrangement } from '../src/regeln.js';
import * as core from '../src/index.js';
import type { Arrangement } from '../src/types.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const D = loadFmtData(path.join(ROOT, 'data'));
const search = createSearch(D);
const dichte = D.beispiele.find((a) => a['@id']?.endsWith('dichte-reihe')) as Arrangement;

describe('Neue Wege nach außen im Kern (Task A4, Lücken R08, R19)', () => {
  it('suche filtert nach zieltyp: nur Methoden, die einen Schritt der Kette füllen können', () => {
    const alle = search.suche({});
    const treffer = search.suche({ zieltyp: 'konzeptaufbau' });
    expect(treffer.length).toBeGreaterThan(0);
    expect(treffer.length).toBeLessThan(alle.length);
    for (const b of treffer) expect(einordnungInKetten(b, D.ketten).some((e) => e.kette === 'konzeptaufbau')).toBe(true);
    // Every method that fills a step of the chain is found (helps fill none).
    const erwartet = alle.filter((b) => einordnungInKetten(b, D.ketten).some((e) => e.kette === 'konzeptaufbau'));
    expect(treffer.map((b) => b.kennung).sort()).toEqual(erwartet.map((b) => b.kennung).sort());
    expect(treffer.some((b) => b.eintragsart === 'hilfe')).toBe(false);
  });

  it('suche mit kettenschritt grenzt auf den Schritt der Kette ein', () => {
    const kette = search.suche({ zieltyp: 'konzeptaufbau' });
    const schritt = search.suche({ zieltyp: 'konzeptaufbau', kettenschritt: 'k2' });
    expect(schritt.length).toBeGreaterThan(0);
    expect(schritt.length).toBeLessThan(kette.length);
    for (const b of schritt) {
      expect(einordnungInKetten(b, D.ketten).some((e) => e.kette === 'konzeptaufbau' && e.schritt === 'k2')).toBe(true);
    }
    // A step of another chain finds nothing inside this chain.
    expect(search.suche({ zieltyp: 'konzeptaufbau', kettenschritt: 'p1' })).toEqual([]);
  });

  it('bausteineImArrangement nennt jede Methode des Ablaufs einmal, auch Slots, Alternativen, Wiederkehr und Begleitendes', () => {
    expect(bausteineImArrangement(dichte)).toEqual([
      'vbe',
      'tps',
      'productive-failure',
      'erfindungsaufgabe',
      'vergleichende-instruktion',
      'loesungsbeispiele',
      'ki-tutor',
      'experiment',
      'exit-ticket',
      'reflexionsprompt',
      'abrufquiz',
      'lerntagebuch'
    ]);
    expect(bausteineImArrangement({ ablauf: undefined } as unknown as Arrangement)).toEqual([]);
  });

  it('passungImArrangement prüft die Passungsregeln für die Methoden des Ablaufs in der Situation', () => {
    const meldungen = passungImArrangement(dichte, { vorwissen: 'hoch', raum: 'klassenraum' }, D);
    expect(meldungen.some((m) => m.regel === 'eignung-vorwissen' && m.baustein === 'loesungsbeispiele')).toBe(true);
    // Every message with a method belongs to a method of the flow; the fit rule of the situation stands without one (R02).
    const imAblauf = new Set(bausteineImArrangement(dichte));
    for (const m of meldungen.filter((x) => x.baustein)) expect(imAblauf.has(m.baustein!)).toBe(true);
    expect(meldungen.some((m) => m.regel === 'viel-anleitung-hohes-vorwissen' && !m.baustein)).toBe(true);
    // Without a field the rules read, nothing fires.
    expect(passungImArrangement(dichte, { raum: 'klassenraum' }, D)).toEqual([]);
  });

  it('REGEL_LAGE_FELDER, bausteineImArrangement und passungImArrangement werden aus @fmt/core exportiert', () => {
    expect(core.REGEL_LAGE_FELDER).toEqual(['vorwissen', 'bildungsstufe', 'komplexitaet', 'sprachniveau', 'fachbereich']);
    expect(typeof core.bausteineImArrangement).toBe('function');
    expect(typeof core.passungImArrangement).toBe('function');
    expect(REGEL_LAGE_FELDER).toBe(core.REGEL_LAGE_FELDER);
  });
});
