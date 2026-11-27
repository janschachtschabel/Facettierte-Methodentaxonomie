import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { normZielart, waehleKette, traegtWissensart, wissensartenVon, nachweisformen, traegtBegleitziel, lesart, LESART_JE_ZIELART } from '../src/zielart.js';
import type { Baustein } from '../src/types.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const D = loadFmtData(path.join(ROOT, 'data'));
const kette = (id: string) => D.ketten.find((k) => k.id === id)!;
const baustein = (id: string) => D.bausteine.find((b) => b.kennung === id)!;
const wahl = (a: Parameters<typeof waehleKette>[1]) => waehleKette(D.ketten, a);

describe('Kettenwahl', () => {
  it('Zielart Konzepte ergibt Konzeptaufbau, mit Ansatz forschend 5E, mit Ansatz Instruktion Direkte Instruktion', () => {
    expect(wahl({ zielart: 'konzepte' })?.kette.id).toBe('konzeptaufbau');
    expect(wahl({ zielart: 'konzepte', ansatz: ['forschend'] })?.kette.id).toBe('fuenf-e');
    expect(wahl({ zielart: 'konzepte', ansatz: ['instruktion'] })?.kette.id).toBe('direkte-instruktion');
    expect(wahl({ zielart: 'konzepte' })?.grund).toBe('zielart');
    expect(wahl({ zielart: 'konzepte', ansatz: ['forschend'] })?.grund).toBe('ansatz');
  });
  it('Zielart Gestalten ergibt Produktion, mit Ansatz offen Projektlernen', () => {
    expect(wahl({ zielart: 'gestalten' })?.kette.id).toBe('produktion');
    expect(wahl({ zielart: 'gestalten', ansatz: ['offen'] })?.kette.id).toBe('projektlernen');
  });
  it('ohne Zielart wählt der Ansatz kooperativ die Kette Kooperatives Lernen', () => {
    expect(wahl({ ansatz: ['kooperativ'] })?.kette.id).toBe('kooperatives-lernen');
    expect(wahl({})).toBeNull();
  });
  it('zieltyp gewinnt gegen Zielart', () => {
    const w = wahl({ zieltyp: 'faktenwissen', zielart: 'konzepte' });
    expect(w?.kette.id).toBe('faktenwissen');
    expect(w?.grund).toBe('zieltyp');
  });
  it('alte Codes: psychomotorik wird bewegung, einstellungen wird urteilen', () => {
    expect(normZielart('psychomotorik')).toBe('bewegung');
    expect(normZielart('einstellungen')).toBe('urteilen');
    expect(normZielart('konzepte')).toBe('konzepte');
    expect(normZielart(undefined)).toBeUndefined();
    expect(wahl({ zielart: 'psychomotorik' })?.kette.id).toBe('fertigkeit-bewegung');
    expect(wahl({ zielart: 'einstellungen' })?.kette.id).toBe('urteilsbildung');
  });
});

describe('Bindung der Wissensart', () => {
  it('Abrufquiz (Fakten, Konzepte) trägt den Übungsschritt der Bewegungskette nicht', () => {
    const b3 = kette('fertigkeit-bewegung').schritte.find((s) => s.ziel === 'prozedur-gelaeufig')!;
    expect(traegtWissensart(baustein('abrufquiz'), b3)).toBe(false);
    expect(traegtWissensart(baustein('teil-ganz-ueben'), b3)).toBe(true);
  });
  it('Randschritte binden nicht', () => {
    const rand = kette('fertigkeit-bewegung').schritte.find((s) => s.rolle === 'rand')!;
    expect(traegtWissensart(baustein('abrufquiz'), rand)).toBe(true);
    expect(traegtWissensart({ aufgabe: [] } as unknown as Baustein, { rolle: 'haupt', wissensart: ['fakten'] })).toBe(false);
    expect(traegtWissensart({ aufgabe: [] } as unknown as Baustein, { rolle: 'haupt' })).toBe(true);
  });
  it('wissensartenVon filtert D1 auf Wissensarten', () => {
    expect(wissensartenVon({ aufgabe: ['afb2', 'prozeduren', 'fall', 'konzepte'] } as unknown as Baustein).sort()).toEqual(['konzepte', 'prozeduren']);
  });
  it('jede Hauptschritt und Sicherungsschritt trägt eine Wissensart, Randschritte keine', () => {
    for (const k of D.ketten)
      for (const s of k.schritte) {
        if (s.rolle === 'rand') expect(s.wissensart, `${k.id}/${s.id}`).toBeUndefined();
        else expect(s.wissensart?.length, `${k.id}/${s.id}`).toBeGreaterThan(0);
      }
  });
  it('jeder Haupt- und Sicherungsschritt jeder Kette hat im Katalog mindestens eine tragende Methode', () => {
    // D1 (aufgabe) is reviewed since Tor D1; known gaps would be listed here with a reason.
    const bekannteLuecken: string[] = [];
    const fehlt: string[] = [];
    for (const k of D.ketten)
      for (const s of k.schritte) {
        if (s.rolle === 'rand') continue;
        const trag = D.bausteine.filter((b) => b.nachbedingung?.includes(s.ziel) || s.funktion.some((f) => b.lernfunktion.includes(f)));
        if (!trag.some((b) => traegtWissensart(b, s))) fehlt.push(`${k.id}/${s.id}`);
      }
    expect(fehlt.sort()).toEqual(bekannteLuecken.sort());
  });
});

describe('Nachweisformen', () => {
  const m = (o: Partial<Baustein>) => ({ engagement: [], interaktion: ['einzel'], reichweite: 'r1', aufgabe: [], repraesentation: [], schriftbedarf: [], ...o }) as unknown as Baustein;
  it('praktisch, schriftlich, Produkt, mündlich', () => {
    expect(nachweisformen(m({ repraesentation: ['enaktiv'], aufgabe: ['psychomotorik'] }))).toContain('praktisch');
    expect(nachweisformen(m({ repraesentation: ['enaktiv'], aufgabe: ['prozeduren'] }))).toContain('praktisch');
    expect(nachweisformen(m({ schriftbedarf: ['schreibt'] }))).toContain('schriftlich');
    expect(nachweisformen(m({ engagement: ['konstruktiv'], reichweite: 'r2' }))).toContain('produkt');
    expect(nachweisformen(m({ engagement: ['konstruktiv'], reichweite: 'r1' }))).not.toContain('produkt');
    expect(nachweisformen(m({ interaktion: ['partner'] }))).toEqual(['muendlich']);
    expect(nachweisformen(m({}))).toEqual([]);
  });
  it('enaktiv zählt nur bei Wissensart psychomotorik oder prozeduren als praktisch (Tor D2, T1)', () => {
    expect(nachweisformen(m({ repraesentation: ['enaktiv'], aufgabe: ['fakten'] }))).not.toContain('praktisch');
    expect(nachweisformen(m({ repraesentation: ['enaktiv'] }))).not.toContain('praktisch');
    expect(nachweisformen(m({ repraesentation: ['enaktiv'], aufgabe: ['konzepte'], interaktion: ['plenum-lehrergeleitet'] }))).toEqual(['muendlich']);
  });
});

describe('traegtBegleitziel (Paket D, D3)', () => {
  const b = (x: Partial<Baustein>) => ({ ...baustein('placemat'), interaktion: [], weltbezug: [], aufgabe: [], lernfunktion: ['erwerb'], schriftbedarf: [], ...x }) as Baustein;
  it('sozial: C1 kleingruppe-kooperativ oder A3 andere', () => {
    expect(traegtBegleitziel(b({ interaktion: ['kleingruppe-kooperativ'] }), 'sozial')).toBe(true);
    expect(traegtBegleitziel(b({ weltbezug: ['andere'] }), 'sozial')).toBe(true);
    expect(traegtBegleitziel(b({ interaktion: ['partner'], weltbezug: ['gegenstand'] }), 'sozial')).toBe(false);
  });
  it('selbstregulation: D1 metakognitiv oder A1 metakognition', () => {
    expect(traegtBegleitziel(b({ aufgabe: ['metakognitiv'] }), 'selbstregulation')).toBe(true);
    expect(traegtBegleitziel(b({ lernfunktion: ['erwerb', 'metakognition'] }), 'selbstregulation')).toBe(true);
    expect(traegtBegleitziel(b({ aufgabe: ['konzepte'] }), 'selbstregulation')).toBe(false);
  });
  it('sprache: Schriftbedarf nicht leer oder C1 partner, kleingruppe-kooperativ, plenum-lernendengeleitet', () => {
    expect(traegtBegleitziel(b({ schriftbedarf: ['liest'] }), 'sprache')).toBe(true);
    for (const i of ['partner', 'kleingruppe-kooperativ', 'plenum-lernendengeleitet']) expect(traegtBegleitziel(b({ interaktion: [i] }), 'sprache')).toBe(true);
    expect(traegtBegleitziel(b({ interaktion: ['einzel', 'plenum-lehrergeleitet'] }), 'sprache')).toBe(false);
  });
  it('unbekanntes Begleitziel: nie', () => {
    expect(traegtBegleitziel(b({ interaktion: ['kleingruppe-kooperativ'] }), 'mut')).toBe(false);
  });
});


describe('Lesarten der Lernstände je Zielart (Paket D, D4)', () => {
  it('prozedur-gelaeufig liest sich bei Zielart Bewegung als „Feinform gelingt“, ohne Zielart als Label', () => {
    expect(lesart(D, 'prozedur-gelaeufig', 'bewegung')).toBe('Feinform gelingt');
    expect(lesart(D, 'prozedur-gelaeufig')).toBe('Prozedur geläufig');
    expect(lesart(D, 'prozedur-gelaeufig', '')).toBe('Prozedur geläufig');
  });
  it('Zielarten werden auf vier Lesarten abgebildet; alte Codes über den Alias', () => {
    expect(LESART_JE_ZIELART).toEqual({
      fakten: 'wissen', konzepte: 'wissen', prozeduren: 'wissen', problemloesen: 'wissen',
      bewegung: 'bewegung', kondition: 'bewegung', handlung: 'bewegung',
      urteilen: 'urteilen', gestalten: 'gestalten'
    });
    for (const z of D.schemes.find((s) => s.id === 'zielart')!.werte!) expect(z.lesart, z.id).toBe(LESART_JE_ZIELART[z.id]);
    expect(lesart(D, 'erstwissen-ungesichert', 'kondition')).toBe('Grobform gelingt');
    expect(lesart(D, 'erstwissen-ungesichert', 'psychomotorik')).toBe('Grobform gelingt');
    expect(lesart(D, 'transfer-gezeigt', 'einstellungen')).toBe('Urteil begründet');
    expect(lesart(D, 'loesungsversuche', 'gestalten')).toBe('Entwurf liegt vor');
    expect(lesart(D, 'konzept-gesichert', 'fakten')).toBe('Konzept verstanden und gesichert');
    expect(lesart(D, 'transfer-gezeigt', 'problemloesen')).toBe('auf Neues übertragen');
  });
  it('ein Strich in der Tabelle heißt: Label des Zustands', () => {
    expect(lesart(D, 'leistung-trainiert', 'konzepte')).toBe('Körperliche Leistungsfähigkeit trainiert');
    expect(lesart(D, 'prozedur-gelaeufig', 'urteilen')).toBe('Prozedur geläufig');
    expect(lesart(D, 'wissen-konsolidiert', 'gestalten')).toBe('Wissen konsolidiert');
    expect(lesart(D, 'leistung-trainiert', 'kondition')).toBe('Leistungsfähigkeit trainiert');
  });
  it('fehlvorstellungen-sichtbar liest sich in jeder Lesart als „Ausgangslage sichtbar“, ohne Zielart als Label', () => {
    for (const z of Object.keys(LESART_JE_ZIELART)) expect(lesart(D, 'fehlvorstellungen-sichtbar', z)).toBe('Ausgangslage sichtbar');
    expect(lesart(D, 'fehlvorstellungen-sichtbar')).toBe('Fehlvorstellungen sichtbar');
  });
  it('unbekannte Zielart oder unbekannter Zustand fallen auf Label bzw. Code zurück', () => {
    expect(lesart(D, 'prozedur-gelaeufig', 'unbekannt')).toBe('Prozedur geläufig');
    expect(lesart(D, 'gibt-es-nicht', 'bewegung')).toBe('gibt-es-nicht');
  });
  it('die zwölf Lernstände und ihre Labels bleiben unverändert', () => {
    const werte = D.schemes.find((s) => s.id === 'lernzustand')!.werte!;
    expect(werte.map((w) => [w.id, w.label])).toEqual([
      ['vorwissen-aktiviert', 'Vorwissen aktiviert'],
      ['fehlvorstellungen-sichtbar', 'Fehlvorstellungen sichtbar'],
      ['problem-erschlossen', 'Problem erschlossen'],
      ['loesungsversuche', 'Eigene Lösungsversuche liegen vor'],
      ['erstwissen-ungesichert', 'Erstwissen erworben, ungesichert'],
      ['konzept-gesichert', 'Konzept verstanden und gesichert'],
      ['prozedur-gelaeufig', 'Prozedur geläufig'],
      ['leistung-trainiert', 'Körperliche Leistungsfähigkeit trainiert'],
      ['wissen-konsolidiert', 'Wissen konsolidiert'],
      ['transfer-gezeigt', 'Transfer gezeigt / Produkt erstellt'],
      ['lernstand-diagnostiziert', 'Lernstand diagnostiziert'],
      ['lernen-reflektiert', 'Eigenes Lernen reflektiert']
    ]);
  });
});
