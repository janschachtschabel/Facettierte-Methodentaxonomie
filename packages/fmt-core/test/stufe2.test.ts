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
      if (r.modus === 'ablauf') expect(r.pruefung?.dauerMin).toBeLessThanOrEqual(45);
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
