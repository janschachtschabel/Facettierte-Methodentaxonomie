import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { normZielart, waehleKette, traegtWissensart, wissensartenVon, nachweisformen, traegtBegleitziel, lesart, LESART_JE_ZIELART } from '../src/zielart.js';
import type { Baustein } from '../src/types.js';
import { createMatcher, createValidator } from '../src/index.js';

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

describe('Kette „vollständige Handlung“ (Paket D, D5)', () => {
  const M = createMatcher(D, createValidator(D));
  it('steht aus dem Regelsatz in den Daten (h4 bindet wie h3), gebunden an die Zielart handlung, Grundlage ungeklärt', () => {
    const k = kette('vollstaendige-handlung');
    expect(k.label).toBe('Berufliche Handlung (vollständige Handlung)');
    expect(k.zielart).toEqual(['handlung']);
    expect(k.grundlage).toBe('U');
    expect(k.quelle).toBe('KMK 2021: Lernsituationen im Lernfeld; Lernwirksamkeit der Phasenfolge kaum geprüft');
    expect(k.schritte.map((s) => [s.id, s.label, s.funktion, s.ziel, s.rolle, s.zeitanteil, s.wissensart])).toEqual([
      ['h1', 'Auftrag analysieren, informieren', ['orientierung'], 'problem-erschlossen', 'rand', 10, undefined],
      ['h2', 'Planen und entscheiden', ['problemloesen', 'verstehen'], 'loesungsversuche', 'haupt', 20, ['prozeduren', 'konzepte']],
      ['h3', 'Ausführen', ['anwendung', 'konsolidierung'], 'prozedur-gelaeufig', 'haupt', 45, ['prozeduren', 'psychomotorik']],
      // h4 binds like h3; the rule set lacked the entry (controller ruling, D5).
      ['h4', 'Kontrollieren', ['diagnose'], 'lernstand-diagnostiziert', 'sicherung', 13, ['prozeduren', 'psychomotorik']],
      ['h5', 'Bewerten und reflektieren', ['metakognition'], 'lernen-reflektiert', 'rand', 12, undefined]
    ]);
  });
  it('Zielart handlung wählt die Kette', () => {
    expect(wahl({ zielart: 'handlung' })?.kette.id).toBe('vollstaendige-handlung');
    expect(wahl({ zielart: 'handlung' })?.grund).toBe('zielart');
  });
  it('n13: Lernfeld in der Berufsschule ergibt die Kette vollständige Handlung', () => {
    const r = M.zuordnen({ text: 'Berufsschule, Lernfeld 3 Kfz-Mechatronik, Bremsanlage prüfen, Werkstatt, 180 Minuten' });
    expect(r.modus).toBe('ablauf');
    if (r.modus === 'ablauf') {
      expect(r.kette?.id).toBe('vollstaendige-handlung');
      expect(r.pruefung?.gueltig).toBe(true);
    }
  });
  it('n14: eine kurze Unterweisung bleibt Bewegung und Einzelphase', () => {
    const r = M.zuordnen({ text: 'Betrieb, Auszubildende im 1. Lehrjahr, Unterweisung Bohren an der Ständerbohrmaschine, 15 Minuten' });
    expect(r.modus).toBe('phase');
    expect(M.lesen('Betrieb, Auszubildende im 1. Lehrjahr, Unterweisung Bohren an der Ständerbohrmaschine, 15 Minuten').kriterien.zielart).toBe('bewegung');
  });
  it('Prüfschritt ohne Wissensart: eine praktische Prüfung, die nicht in die Zeit oder nicht zum Fach passt, wird gesagt, nicht geplant', () => {
    const r = M.zuordnen({ text: 'Elektroniker Lernfeld 3, Fehlersuche an Schaltungen, 45 Minuten, am Ende praktische Prüfung' });
    expect(r.modus === 'ablauf' && r.kette?.id).toBe('vollstaendige-handlung');
    if (r.modus !== 'ablauf') return;
    expect(r.pruefung?.dauerMin).toBeLessThanOrEqual(45);
    const h4 = (r.schritte || []).find((s) => s.schritt === 'h4')!;
    expect(['fall-simulation-osce', 'sportmotorischer-test']).not.toContain(h4.baustein);
    expect((r.regelmeldungen || []).some((x) => x.regel === 'nachweis-passt-zum-ziel')).toBe(true);
  });
  it('Leseregel nur mit Bildungsstufe berufsbildung; eine angegebene Bildungsstufe zählt, eine angegebene Zielart gewinnt', () => {
    expect(M.lesen('Lernsituation Angebot erstellen, 90 Minuten').kriterien.zielart).toBeUndefined();
    expect(M.lesen('Lernsituation Angebot erstellen, 90 Minuten', 'berufsbildung').kriterien.zielart).toBe('handlung');
    expect(M.lesen('Berufsschule: Lernsituation Angebot erstellen, 90 Minuten', 'sek2').kriterien.zielart).toBeUndefined();
    const r = M.zuordnen({ text: 'Berufsschule, Lernsituation Angebot erstellen, 90 Minuten', zielart: 'konzepte' });
    if (r.modus === 'ablauf') expect(r.kette?.id).not.toBe('vollstaendige-handlung');
    const r2 = M.zuordnen({ text: 'Lernsituation Angebot erstellen, 90 Minuten', bildungsstufe: 'berufsbildung' });
    expect(r2.modus === 'ablauf' && r2.kette?.id).toBe('vollstaendige-handlung');
  });
});

describe('Einordnung in Ketten (App-Nachzug N2)', () => {
  it('nennt die Kettenschritte, deren Funktion die Methode hat und deren Wissensart sie trägt', async () => {
    const { einordnungInKetten } = await import('../src/zielart.js');
    const b = baustein('gruppenpuzzle');
    const e = einordnungInKetten(b, D.ketten);
    expect(e.length).toBeGreaterThan(0);
    for (const x of e) {
      const st = kette(x.kette).schritte.find((s) => s.id === x.schritt)!;
      expect(st.funktion.some((f) => b.lernfunktion.includes(f))).toBe(true);
      expect(traegtWissensart(b, st)).toBe(true);
      expect(x.label).toBe(kette(x.kette).label);
      expect(x.schrittLabel).toBe(st.label);
    }
    // Independent count: every step with a shared function and a carried knowledge type.
    const erwartet = D.ketten.flatMap((k) => k.schritte.filter((s) => s.funktion.some((f) => b.lernfunktion.includes(f)) && traegtWissensart(b, s))).length;
    expect(e.length).toBe(erwartet);
  });
  it('eine Hilfe füllt keinen Kettenschritt', async () => {
    const { einordnungInKetten } = await import('../src/zielart.js');
    const hilfe = D.bausteine.find((b) => b.eintragsart === 'hilfe')!;
    expect(einordnungInKetten(hilfe, D.ketten)).toEqual([]);
  });
});
