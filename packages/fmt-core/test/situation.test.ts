import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { baueSituation } from '../src/situation.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const D = loadFmtData(path.join(ROOT, 'data'));

describe('Situation', () => {
  it('Raum genannt: bietet kommt vom Raumtyp, raumBietet überschreibt', () => {
    const s = baueSituation({ raum: 'hoersaal' }, D);
    expect(s.raumGenannt).toBe(true);
    expect([...s.bietet].sort()).toEqual(['schreibplatz', 'wandflaeche']);
    const t = baueSituation({ raum: 'klassenraum', raumBietet: ['schreibplatz'] }, D);
    expect([...t.bietet]).toEqual(['schreibplatz']);
  });
  it('raumBietet allein nennt den Raum', () => {
    const s = baueSituation({ raumBietet: ['stellflaeche'] }, D);
    expect(s.raumGenannt).toBe(true);
    expect(s.raum).toBeUndefined();
  });
  it('lernort ist Alias für raum', () => {
    expect(baueSituation({ lernort: 'draussen' }, D).raum).toBe('draussen');
  });
  it('Fachausstattung, Schrift und Termine werden übernommen', () => {
    const s = baueSituation({ raum: 'musikraum', ohneSchrift: ['lesen'], termine: 3 }, D);
    expect(s.fachausstattungArt).toBe('musik');
    expect(s.ohneSchrift).toEqual(['lesen']);
    expect(s.termine).toBe(3);
    expect(baueSituation({ ohneSchrift: 'schreiben' }, D).ohneSchrift).toEqual(['schreiben']);
  });
  it('angenommener Raum: Sport, psychomotorisch in Beruf oder NaWi-Technik, sonst Klassenraum', () => {
    const sport = baueSituation({ fachbereich: 'sport' }, D);
    expect(sport.raum).toBe('bewegungsraum');
    expect(sport.pflichtangaben.angenommen.find((x) => x.feld === 'raum')?.grund).toMatch(/Raum nicht angegeben/);
    expect(baueSituation({ fachbereich: 'beruf-praxis' }, D, { psychomotorisch: true }).raum).toBe('fachraum');
    expect(baueSituation({ fachbereich: 'nawi-technik' }, D, { psychomotorisch: true }).raum).toBe('fachraum');
    // n17: Chemie without room and without psychomotor goal
    expect(baueSituation({ fachbereich: 'nawi-technik' }, D).raum).toBe('klassenraum');
    expect(baueSituation({}, D).raum).toBe('klassenraum');
  });
  it('Pflichtangaben', () => {
    const leer = baueSituation({}, D);
    expect(leer.pflichtangaben.fehlt).toEqual(['ziel', 'fach-und-thema', 'bildungsstufe', 'anzahl', 'raum', 'zeit']);
    const voll = baueSituation(
      { zielart: 'wissen', fachbereich: 'sport', bildungsstufe: 'sek1', gruppe: 20, raum: 'bewegungsraum', zeitMin: 45 },
      D,
      { thema: 'Staffellauf' }
    );
    expect(voll.pflichtangaben.fehlt).toEqual([]);
    const ohneThema = baueSituation({ liefert: 'x', fachbereich: 'sport' }, D);
    expect(ohneThema.pflichtangaben.fehlt).toContain('fach-und-thema');
    expect(baueSituation({ lernfunktion: 'x' }, D, { thema: 't', fachErkannt: true }).pflichtangaben.fehlt).not.toContain('fach-und-thema');
  });
});
