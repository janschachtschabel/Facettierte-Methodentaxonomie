import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import type { Baustein } from '../src/types.js';
import { vorschlagAlle, type BedarfVorschlag } from '../scripts/vorschlag-einsatzprofil.js';
import { bauZeile, parseCsv, termineMinVorschlag, type PapierZeile } from '../scripts/vorschlag-fmt2-bedarf.js';
import { vorDurchsicht1 } from './fixtures/vor-durchsicht-1.js';

// The proposal reads the room fields of the time before Durchsicht 1 (test fixture).
const D = vorDurchsicht1(loadFmtData(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'data')));
const repoAlle = vorschlagAlle(D, { deckelAusnehmen: ['fachausstattung'] });
const finde = (k: string) => D.bausteine.find((b) => b.kennung === k)!;

const repoV = (raum: string[], schrift: string[] = []): BedarfVorschlag => ({
  raumbedarf: raum, schriftbedarf: schrift, raumhinweis: null, betreuungshinweis: null, kernkomponenteOrt: null, grund: ''
});
const papierV = (raum: string, schrift = ''): PapierZeile => ({
  kennung: 'x', raumbedarf_vorschlag: raum, fachausstattung_art: '', schriftbedarf_vorschlag: schrift, termineMin_vorschlag: '', hinweis: ''
});
const klein = (extra: Partial<Baustein>): Baustein =>
  ({ kennung: 'x', name: 'X', status: 'entwurf', lernort: ['klassenraum'], aufgabe: ['konzepte'], repraesentation: [], sequenz: [], durchfuehrung: [], material: [], ...extra }) as unknown as Baustein;

describe('bauZeile: zwei Quellen', () => {
  it('Übereinstimmung gilt als Wert, ohne Abweichung', () => {
    const z = bauZeile(klein({}), repoV(['schreibplatz'], ['schreibt']), papierV('schreibplatz', 'schreibt'));
    expect(z.raumbedarf_vorschlag).toBe('schreibplatz');
    expect(z.schriftbedarf_vorschlag).toBe('schreibt');
    expect(z.abweichung).toBe('nein');
  });
  it('Abweichung: Wert des Repository-Skripts, abweichung ja', () => {
    const z = bauZeile(klein({}), repoV(['wandflaeche']), papierV('schreibplatz|wandflaeche'));
    expect(z.raumbedarf_vorschlag).toBe('wandflaeche');
    expect(z.raumbedarf_papier).toBe('schreibplatz|wandflaeche');
    expect(z.abweichung).toBe('ja');
  });
  it('Reihenfolge der Werte spielt für die Übereinstimmung keine Rolle', () => {
    const z = bauZeile(klein({}), repoV(['wandflaeche', 'schreibplatz']), papierV('schreibplatz|wandflaeche'));
    expect(z.abweichung).toBe('nein');
  });
  it('Zeilen tragen leere Prüfspalten', () => {
    const z = bauZeile(klein({}), repoV([]), undefined);
    expect([z.entscheidung, z.pruefnotiz]).toEqual(['', '']);
  });
});

describe('bekannte Fehler', () => {
  const zeile = (k: string) => bauZeile(finde(k), repoAlle[k], undefined);
  it('Exkursion braucht den Außenort, obwohl lernort den Klassenraum nennt', () => {
    expect(finde('exkursion').lernort).toContain('klassenraum');
    expect(zeile('exkursion').raumbedarf_vorschlag).toContain('aussenort');
  });
  it('Gruppenpuzzle braucht Stellfläche', () => {
    expect(zeile('gruppenpuzzle').raumbedarf_vorschlag).toBe('stellflaeche');
  });
  it('Schülerexperiment (experiment) braucht Fachausstattung, ohne Deckelung', () => {
    expect(zeile('experiment').raumbedarf_vorschlag).toContain('fachausstattung');
    const gedeckelt = vorschlagAlle(D)['experiment'];
    expect(gedeckelt.raumbedarf).not.toContain('fachausstattung');
  });
});

describe('Regeln aus lernort', () => {
  it('nur Bewegungsraum und draußen: Bewegungsfläche', () => {
    const z = bauZeile(klein({ lernort: ['bewegungsraum', 'draussen'] }), repoV([]), undefined);
    expect(z.raumbedarf_vorschlag).toBe('bewegungsflaeche');
  });
  it('Fachraum ohne Klassenraum: Fachausstattung; mit Klassenraum nicht', () => {
    expect(bauZeile(klein({ lernort: ['fachraum'] }), repoV([]), undefined).raumbedarf_vorschlag).toBe('fachausstattung');
    expect(bauZeile(klein({ lernort: ['klassenraum', 'fachraum'] }), repoV([]), undefined).raumbedarf_vorschlag).toBe('');
  });
  it('nur draußen: Außenort', () => {
    expect(bauZeile(klein({ lernort: ['draussen'] }), repoV([]), undefined).raumbedarf_vorschlag).toContain('aussenort');
  });
});

describe('termineMin', () => {
  it('2 bei sequenz verteilt', () => {
    expect(termineMinVorschlag(klein({ sequenz: ['geblockt', 'verteilt'] })).wert).toBe('2');
  });
  it('2, wenn die Durchführung einen Abstand nennt', () => {
    expect(termineMinVorschlag(klein({ durchfuehrung: ['Nach einigen Tagen mit gemischten Fragen wiederholen'] })).wert).toBe('2');
  });
  it('sonst leer, auch bei langer Dauer oder „nächster Stunde“', () => {
    expect(termineMinVorschlag(klein({ durchfuehrung: ['Antworten vor der nächsten Stunde sichten'], dauerMax: 400 } as Partial<Baustein>)).wert).toBe('');
    expect(termineMinVorschlag(finde('gruppenpuzzle')).wert).toBe('');
  });
});

describe('Sport bei „ungeeignet im Fach“', () => {
  const sport = (extra: Partial<Baustein>, raum: string[]) =>
    bauZeile(klein({ fachbereichUngeeignet: ['sport', 'sprachen'], ...extra }), repoV(raum), undefined).fach_ungeeignet_vorschlag;
  it('entfällt, wenn der Raumbedarf etwas nennt, das die Sporthalle nicht bietet', () => {
    expect(sport({ aufgabe: ['psychomotorik'] }, ['schreibplatz'])).toBe('sprachen');
  });
  it('entfällt, wenn die Methode keine Psychomotorik trägt', () => {
    expect(sport({ aufgabe: ['konzepte'] }, ['stellflaeche'])).toBe('sprachen');
  });
  it('bleibt für Durchsicht 2, wenn die Halle den Bedarf deckt und Psychomotorik getragen wird', () => {
    expect(sport({ aufgabe: ['psychomotorik'] }, ['stellflaeche'])).toBe('sport|sprachen');
  });
});

describe('Wissensart und CSV', () => {
  it('Wissensart ohne Wert bekommt einen Vorschlag mit Grund im Hinweis', () => {
    const z = bauZeile(finde('swot-analyse'), repoAlle['swot-analyse'], undefined);
    expect(z.wissensart_alt).toBe('');
    expect(z.wissensart_vorschlag).toBe('konzepte');
    expect(z.hinweis).toContain('Wissensart:');
  });
  it('Methoden außerhalb der Urteile behalten ihre Wissensart', () => {
    const z = bauZeile(finde('gruppenpuzzle'), repoAlle['gruppenpuzzle'], undefined);
    expect(z.wissensart_vorschlag).toBe(z.wissensart_alt);
  });
  it('parseCsv liest Anführungszeichen und Kommas', () => {
    expect(parseCsv('a,b\n"x,y",2\n')).toEqual([{ a: 'x,y', b: '2' }]);
  });
});
