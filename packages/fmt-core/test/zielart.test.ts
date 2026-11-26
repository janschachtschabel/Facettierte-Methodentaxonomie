import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { normZielart, waehleKette, traegtWissensart, wissensartenVon, nachweisformen } from '../src/zielart.js';
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
    // bis Tor D1: D1 (aufgabe) der Methoden ist noch nicht durchgesehen; bekannte Lücken stehen hier.
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
    expect(nachweisformen(m({ repraesentation: ['enaktiv'] }))).toContain('praktisch');
    expect(nachweisformen(m({ schriftbedarf: ['schreibt'] }))).toContain('schriftlich');
    expect(nachweisformen(m({ engagement: ['konstruktiv'], reichweite: 'r2' }))).toContain('produkt');
    expect(nachweisformen(m({ engagement: ['konstruktiv'], reichweite: 'r1' }))).not.toContain('produkt');
    expect(nachweisformen(m({ interaktion: ['partner'] }))).toEqual(['muendlich']);
    expect(nachweisformen(m({}))).toEqual([]);
  });
});
