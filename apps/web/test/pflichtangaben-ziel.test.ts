import { describe, it, expect } from 'vitest';
import type { MatchResult } from '@fmt/core';
import { verstandenAus } from '../src/planner/pflichtangaben.js';

/** Task Q2 (U9): a guessed goal leaves „ziel“ in fehlt; the line still names the guess so it can be corrected. */
const labelOf = (_scheme: string, code: string) => ({ orientierung: 'Orientierung', konzepte: 'Konzepte verstehen' })[code] || code;
const antwort = (teil: Partial<MatchResult> & Record<string, unknown>) =>
  ({ modus: 'phase', kriterien: {}, erkannt: [], offen: [], vorschlaege: [], ...teil }) as unknown as MatchResult;

describe('Verstanden-Zeile: geratenes Ziel bei fehlendem Ziel', () => {
  it('eine semantisch geratene Lernfunktion steht als „Ziel (vermutet)“, Ziel fehlt weiter', () => {
    const v = verstandenAus(
      antwort({
        kriterien: { lernfunktion: ['orientierung'] },
        erkannt: [{ feld: 'lernfunktion', wert: ['orientierung'], beleg: 'semantisch: Orientierung' }],
        pflichtangaben: { fehlt: ['ziel'], angenommen: [{ feld: 'lernfunktion', wert: 'orientierung', grund: 'vermutet' }] }
      }),
      labelOf,
      'Klimawandel'
    )!;
    expect(v.verstanden).toContain('Ziel (vermutet): Orientierung');
    expect(v.fehlt.map((f) => f.feld)).toContain('ziel');
    expect(v.zielVermutet).toBe(true);
  });

  it('eine angenommene Zielart steht als „Ziel (angenommen)“, Ziel fehlt weiter', () => {
    const v = verstandenAus(
      antwort({ modus: 'ablauf', pflichtangaben: { fehlt: ['ziel'], angenommen: [{ feld: 'zielart', wert: 'konzepte', grund: 'angenommen' }] } }),
      labelOf
    )!;
    expect(v.verstanden).toContain('Ziel (angenommen): Konzepte verstehen');
    expect(v.fehlt.map((f) => f.feld)).toContain('ziel');
  });

  it('ohne Vermutung steht kein Ziel in der Zeile', () => {
    const v = verstandenAus(antwort({ pflichtangaben: { fehlt: ['ziel'], angenommen: [] } }), labelOf)!;
    expect(v.verstanden.some((x) => x.startsWith('Ziel'))).toBe(false);
    expect(v.zielVermutet).toBe(false);
  });
});
