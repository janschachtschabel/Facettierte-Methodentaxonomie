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
