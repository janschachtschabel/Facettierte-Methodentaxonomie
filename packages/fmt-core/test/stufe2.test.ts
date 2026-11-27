import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { createMatcher, createValidator } from '../src/index.js';
import type { Arrangement, ArrangementNode, MatchResult } from '../src/types.js';
import { THEMEN, szenarioText } from './golden-szenarien.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const D = loadFmtData(path.join(ROOT, 'data'));
const V = createValidator(D);
const M = createMatcher(D, V);
const steps = (r: MatchResult) => (r.modus === 'ablauf' ? (r.schritte || []).map((s) => s.baustein) : []);
const rules = (r: MatchResult) => (r.modus === 'ablauf' ? (r.pruefung?.meldungen || []).map((m) => m.regel) : []);
const topLevel = (r: MatchResult): ArrangementNode[] =>
  r.modus === 'ablauf' && r.arrangement && r.arrangement.ablauf.typ === 'Sequenz' ? r.arrangement.ablauf.teile : [];

describe('D7: Wiederkehr außerhalb des Zeitbudgets', () => {
  const plan = (teil: ArrangementNode): Arrangement => ({
    '@context': D.NS + 'context.jsonld',
    '@id': D.NS + 'plan/test',
    typ: 'Arrangement',
    name: 'Test',
    reichweite: 'r3',
    kontext: { zeitbudgetMin: 20 },
    ablauf: { typ: 'Sequenz', teile: [{ typ: 'Einsatz', baustein: 'lehrervortrag', dauerMin: 15 }, teil] }
  });

  it('zählt nicht zur Dauer, wird aber getrennt ausgewiesen', () => {
    const inside = V.validate(plan({ typ: 'Wiederkehr', baustein: 'abrufquiz', anzahl: 3, abstand: 'P2D', dauerMin: 5 }));
    const outside = V.validate(
      plan({ typ: 'Wiederkehr', baustein: 'abrufquiz', anzahl: 3, abstand: 'P2D', dauerMin: 5, ausserhalbBudget: true })
    );
    expect(inside.dauerMin).toBe(30);
    expect(inside.meldungen.some((m) => m.regel === 'R-09')).toBe(true);
    expect(outside.dauerMin).toBe(15);
    expect(outside.dauerAusserhalbMin).toBe(15);
    expect(outside.meldungen.some((m) => m.regel === 'R-09')).toBe(false);
    expect(outside.wiederkehr).toEqual(inside.wiederkehr);
  });

  it('45-Minuten-Vorschläge planen die Wiederholung für Folgestunden und lösen R-07 nicht mehr aus', () => {
    for (const [f, t] of THEMEN) {
      const r = M.zuordnen({ text: szenarioText(f, t, 45) });
      expect(rules(r), `${f}: ${t}`).not.toContain('R-07');
      if (r.modus === "ablauf") {
        expect(r.pruefung?.dauerMin).toBeLessThanOrEqual(45);
        if (topLevel(r).some((n) => n.typ === "Wiederkehr")) expect(r.pruefung?.dauerAusserhalbMin).toBeGreaterThan(0);
      }
      const rec = topLevel(r).filter((n) => n.typ === 'Wiederkehr');
      for (const n of rec) expect(n.typ === 'Wiederkehr' && n.ausserhalbBudget).toBe(true);
    }
  });
});

describe('D3: Kettenschritte tragen Rolle und Zeitanteil', () => {
  it('jeder Schritt hat rolle und zeitanteil, jede Kette eine Hauptphase', () => {
    for (const k of D.ketten) {
      for (const s of k.schritte) {
        expect(['rand', 'haupt', 'sicherung'], `${k.id}/${s.id}`).toContain(s.rolle);
        expect(s.zeitanteil, `${k.id}/${s.id}`).toBeGreaterThan(0);
      }
      expect(k.schritte.some((s) => s.rolle === 'haupt'), k.id).toBe(true);
    }
  });

  it('die Hauptphase erhält bei 90 Minuten die meiste Zeit', () => {
    const r = M.zuordnen({ text: 'Geschichte Klasse 9: Industrialisierung, 90 Minuten', zieltyp: 'kooperatives-lernen' });
    expect(r.modus).toBe('ablauf');
    const nodes = topLevel(r).filter((n) => n.typ === 'Einsatz');
    const dur = nodes.map((n) => (n.typ === 'Einsatz' ? n.dauerMin || 0 : 0));
    expect(dur[1]).toBe(Math.max(...dur));
    expect(dur[1]).toBeGreaterThanOrEqual(35);
  });
});

describe('D4: Ketten für Urteilsbildung, Bewegung und Produktion', () => {
  const chainOf = (r: MatchResult) => (r.modus === 'ablauf' ? r.kette?.id : undefined);

  it('alle drei Ketten ergeben bei 45 und 90 Minuten gültige Abläufe', () => {
    for (const zieltyp of ['urteilsbildung', 'fertigkeit-bewegung', 'produktion']) {
      for (const zeitMin of [45, 90]) {
        const r = M.zuordnen({ zieltyp, zeitMin, gruppe: 24, bildungsstufe: 'sek1' });
        expect(r.modus).toBe('ablauf');
        if (r.modus === 'ablauf') {
          expect(r.pruefung?.gueltig, `${zieltyp} ${zeitMin}: ${JSON.stringify(r.pruefung?.meldungen)}`).toBe(true);
          expect(r.offen).toEqual([]);
          expect(r.pruefung?.dauerMin).toBeLessThanOrEqual(zeitMin);
        }
      }
    }
  });

  it('der Text wählt die passende Kette', () => {
    expect(chainOf(M.zuordnen({ text: 'Sport Klasse 8: Weitsprung, 45 Minuten' }))).toBe('fertigkeit-bewegung');
    expect(chainOf(M.zuordnen({ text: 'Politik Klasse 10: Tempolimit, Pro-Contra-Debatte, 90 Minuten, 24 Schüler' }))).toBe('urteilsbildung');
    expect(chainOf(M.zuordnen({ text: 'Deutsch Klasse 8 Erörterung schreiben, 2 x 45 Minuten' }))).toBe('produktion');
    expect(chainOf(M.zuordnen({ text: 'Kunst Klasse 8: Perspektive zeichnen, 45 Minuten' }))).toBe('produktion');
    expect(chainOf(M.zuordnen({ text: 'Informatik Klasse 10: Schleifen in Python programmieren, 90 Minuten' }))).toBe('produktion');
    expect(chainOf(M.zuordnen({ text: 'Deutsch Klasse 8: Kommasetzung, 45 Minuten' }))).toBe('prozedur');
  });
});

describe('D1: Fachbereich', () => {
  const AREAS = ['mathe-informatik', 'nawi-technik', 'sprachen', 'gesellschaft', 'aesthetik', 'sport', 'beruf-praxis', 'uebergreifend'];
  const byId = new Map(D.bausteine.map((b) => [b.kennung, b]));

  it('Vokabular und Befüllung: jede Methode hat mindestens einen gültigen Fachbereich', () => {
    const scheme = D.schemes.find((s) => s.id === 'fachbereich');
    expect((scheme?.werte || []).map((w) => w.id)).toEqual(AREAS);
    for (const b of D.bausteine) {
      expect(b.fachbereich?.length, b.kennung).toBeGreaterThan(0);
      for (const f of [...(b.fachbereich || []), ...(b.fachbereichUngeeignet || [])]) expect(AREAS, b.kennung).toContain(f);
      expect((b.fachbereichUngeeignet || []).includes('uebergreifend'), b.kennung).toBe(false);
      for (const f of b.fachbereichUngeeignet || []) expect(b.fachbereich, `${b.kennung}: ${f} zugleich geeignet und ungeeignet`).not.toContain(f);
    }
  });

  it('liest den Fachbereich aus dem Fach im Text', () => {
    const area = (text: string) => M.lesen(text).kriterien.fachbereich;
    expect(area('Physik Klasse 8: Stromkreis, 45 Minuten')).toBe('nawi-technik');
    expect(area('Mathematik Klasse 8: Prozentrechnung, 45 Minuten')).toBe('mathe-informatik');
    expect(area('Informatik Klasse 8: Algorithmen, 45 Minuten')).toBe('mathe-informatik');
    expect(area('Englisch Klasse 8: Simple Past, 45 Minuten')).toBe('sprachen');
    expect(area('Geschichte Klasse 8: Weimarer Republik, 45 Minuten')).toBe('gesellschaft');
    expect(area('Deutsch Klasse 8: Kurzgeschichten analysieren, 45 Minuten')).toBe('sprachen');
    expect(area('Musik Klasse 8: Dur und Moll, 45 Minuten')).toBe('aesthetik');
    expect(area('Sport Klasse 8: Weitsprung, 45 Minuten')).toBe('sport');
    expect(area('Berufsschule Pflege: Kommunikation mit Angehörigen, 90 Minuten')).toBe('beruf-praxis');
    expect(area('Einstieg mit Tablets, ohne Technik, 10 Minuten')).toBeUndefined();
  });

  it('schlägt keine Methode vor, die für den Fachbereich ungeeignet ist', () => {
    for (const [f, t] of THEMEN) {
      for (const min of [45, 90]) {
        const text = szenarioText(f, t, min);
        const area = M.lesen(text).kriterien.fachbereich as string | undefined;
        if (!area) continue;
        for (const id of steps(M.zuordnen({ text }))) {
          expect(byId.get(id)?.fachbereichUngeeignet || [], `${text}: ${id}`).not.toContain(area);
        }
      }
    }
  });

  it('bevorzugt fachtypische Methoden: Sport erhält Bewegungsmethoden, Physik bei 90 Minuten eine naturwissenschaftliche Methode', () => {
    const sport = steps(M.zuordnen({ text: 'Sport Klasse 8: Weitsprung, 90 Minuten' }));
    expect(sport.filter((id) => byId.get(id)?.fachbereich?.includes('sport')).length).toBeGreaterThanOrEqual(2);
    const physik = steps(M.zuordnen({ text: 'Physik Klasse 8: Stromkreis, 90 Minuten' }));
    expect(physik.some((id) => byId.get(id)?.fachbereich?.includes('nawi-technik'))).toBe(true);
    for (const [f, t] of THEMEN.filter(([fach]) => fach === 'Mathematik' || fach === 'Informatik')) {
      expect(steps(M.zuordnen({ text: szenarioText(f, t, 90) })), `${f}: ${t}`).not.toContain('experiment');
    }
  });
});

describe('D2: Evidenzbezug', () => {
  it('jeder Evidenzeintrag mit Grad A oder B nennt seinen Bezug', () => {
    for (const b of D.bausteine) {
      for (const e of b.evidenz || []) {
        if (e.grad === 'A' || e.grad === 'B') expect(['methode', 'prinzip'], b.kennung).toContain(e.evidenzBezug);
      }
    }
  });

  it('ein nur abgeleiteter Grad A zählt in der Rangfolge wie B', async () => {
    const { rankingGrade } = await import('../src/ranking.js');
    expect(rankingGrade([{ grad: 'A', evidenzBezug: 'prinzip' }])).toBe('B');
    expect(rankingGrade([{ grad: 'A', evidenzBezug: 'methode' }])).toBe('A');
    expect(rankingGrade([{ grad: 'A', evidenzBezug: 'prinzip' }, { grad: 'A', evidenzBezug: 'methode' }])).toBe('A');
    expect(rankingGrade([{ grad: 'B', evidenzBezug: 'prinzip' }])).toBe('B');
    expect(rankingGrade([{ grad: 'C' }])).toBe('C');
    expect(rankingGrade([])).toBeNull();
    const placemat = D.bausteine.find((b) => b.kennung === 'placemat')!;
    expect(rankingGrade(placemat.evidenz)).toBe('B');
  });
});

describe('D5: Vor- und Nachbedingungen der Kernmethoden', () => {
  const byId = new Map(D.bausteine.map((b) => [b.kennung, b]));
  const anchored = (r: MatchResult, id: string) =>
    r.modus === 'ablauf' ? (r.verankert || []).find((v) => v.baustein === id)?.schritt : undefined;

  it('das Schülerexperiment kann die Erkundungsphase tragen', () => {
    const r = M.zuordnen({ text: 'Physik Klasse 8: Dichte forschend-entdeckend mit Schülerexperimenten, Doppelstunde, 24 Schüler' });
    expect(r.modus === 'ablauf' && r.kette?.id).toBe('fuenf-e');
    expect(anchored(r, 'experiment')).toMatch(/^Explore/);
    if (r.modus === 'ablauf') expect(r.pruefung?.gueltig).toBe(true);
  });

  it('die Fishbowl trägt die Kontroverse in der Urteilsbildung', () => {
    const r = M.zuordnen({ text: 'Ethik Klasse 10: Sterbehilfe als Fishbowl diskutieren, 90 Minuten, 24 Schüler' });
    expect(r.modus === 'ablauf' && r.kette?.id).toBe('urteilsbildung');
    expect(anchored(r, 'fishbowl')).toMatch(/^Kontrovers/);
  });

  it('Analyse- und Präsentationsformate setzen Inhalte voraus', () => {
    for (const id of ['karikatur-bildanalyse', 'swot-analyse', 'pecha-kucha', 'stegreiftheater']) {
      expect(byId.get(id)?.vorbedingung?.length, id).toBeGreaterThan(0);
    }
    expect(byId.get('karikatur-bildanalyse')?.nachbedingung).not.toContain('konzept-gesichert');
  });
});

describe('Review: Textregeln lösen nicht auf Alltagsverben aus', () => {
  const read = (text: string) => M.lesen(text).kriterien;

  it('zielart gestalten und urteilen brauchen ein Produkt bzw. ein Debattenwort', () => {
    for (const text of [
      'Wie kann ich den Einstieg in die Stunde gestalten? 10 Minuten',
      'Mathe Klasse 6, 45 Minuten: Bruchrechnen üben, am Ende Ergebnisse diskutieren',
      'Mathe Klasse 8: Graphen zeichnen, 45 Minuten',
      'Die Schüler schreiben morgen eine Klassenarbeit, Wiederholung Brüche 45 Minuten',
      'Kurze Diskussion zum Einstieg, 5 Minuten'
    ]) {
      expect(read(text).zieltyp, text).toBeUndefined();
      expect(['gestalten', 'urteilen'], text).not.toContain(read(text).zielart);
    }
    expect(M.zuordnen({ text: 'Wie kann ich den Einstieg in die Stunde gestalten? 10 Minuten' }).modus).toBe('phase');
    expect(M.zuordnen({ text: 'Kurze Diskussion zum Einstieg, 5 Minuten' }).modus).toBe('phase');
    expect(read('Kunst Klasse 7: ein Plakat gestalten, 90 Minuten').zielart).toBe('gestalten');
    expect(read('Deutsch Klasse 9: einen Kommentar schreiben, 90 Minuten').zielart).toBe('gestalten');
  });

  it('eine ausdrücklich gesetzte Zielart hat Vorrang vor einem aus dem Text gelesenen Zieltyp', () => {
    const r = M.zuordnen({ text: 'Deutsch Klasse 8: Pro-Contra-Debatte zur Kommasetzung, 45 Minuten', zielart: 'prozeduren' });
    expect(r.modus === 'ablauf' && r.kette?.id).toBe('prozedur');
  });

  it('fachbereich: Adjektive und Alltagswörter sind kein Fach', () => {
    expect(read('Geschichte Klasse 8, 90 Minuten: Französische Revolution').fachbereich).toBe('gesellschaft');
    expect(read('Erdkunde Klasse 9: Lateinamerika, 45 Minuten').fachbereich).toBe('gesellschaft');
    expect(read('Politik Klasse 10: deutsch-französische Beziehungen, 45 Minuten').fachbereich).toBe('gesellschaft');
    expect(read('Biologie Klasse 7: Pflege von Zimmerpflanzen, 45 Minuten').fachbereich).toBe('nawi-technik');
    expect(read('Deutsch Klasse 6: mit Werken von Kästner, 45 Minuten').fachbereich).toBe('sprachen');
    expect(read('Französisch Klasse 8: passé composé, 45 Minuten').fachbereich).toBe('sprachen');
    expect(read('Latein Klasse 8: Ablativus absolutus, 45 Minuten').fachbereich).toBe('sprachen');
  });

  it('zeitMin hat eine Obergrenze', () => {
    expect(() => M.zuordnen({ zieltyp: 'produktion', zeitMin: 1e8 })).toThrow(/zeitMin/);
    expect(M.zuordnen({ zieltyp: 'produktion', zeitMin: 3000 }).modus).toBe('ablauf');
  });
});
