import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { createValidator } from '../src/validate.js';
import { createMatcher } from '../src/zuordnung.js';
import { passungNeuPruefen, regelLageAus } from '../src/regeln.js';
import * as core from '../src/index.js';
import type { Regelmeldung } from '../src/types.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const D = loadFmtData(path.join(ROOT, 'data'));
const b = (k: string) => D.bausteine.find((x) => x.kennung === k)!;

describe('Passungsregeln nach einem Tausch von Hand neu prüfen (App-Nachzug N4)', () => {
  it('wird aus @fmt/core exportiert', () => {
    expect(typeof core.passungNeuPruefen).toBe('function');
    expect(typeof core.regelLageAus).toBe('function');
  });

  it('regelLageAus liest nur die Felder der Regeln und lässt Leeres weg', () => {
    expect(regelLageAus({ vorwissen: 'hoch', bildungsstufe: '', raum: 'hoersaal', text: 'x', sprachniveau: 'a2' })).toEqual({
      vorwissen: 'hoch',
      sprachniveau: 'a2'
    });
    expect(regelLageAus(undefined)).toEqual({});
  });

  it('eine von Hand eingesetzte Methode bekommt ihre Warnung, eine entfernte verliert sie', () => {
    const alt: Regelmeldung[] = [
      { regel: 'viel-anleitung-hohes-vorwissen', wirkung: 'warnt', grundlage: 'E', text: 'alt', baustein: 'lehrervortrag' }
    ];
    const neu = passungNeuPruefen(alt, [b('loesungsbeispiele')], { vorwissen: 'hoch' }, D.regeln);
    expect(neu.map((m) => [m.regel, m.baustein])).toEqual([['eignung-vorwissen', 'loesungsbeispiele']]);
  });

  it('Meldungen ohne Methode, der Sicherheitshinweis und ein genannter Wunsch bleiben wie in der Antwort', () => {
    const lage: Regelmeldung = { regel: 'wenig-anleitung-geringes-vorwissen', wirkung: 'warnt', grundlage: 'E', text: 'Lage' };
    const sicher: Regelmeldung = {
      regel: 'sicherheitshinweis',
      wirkung: 'weist-hin',
      grundlage: 'Recht',
      text: 'Sicherheit',
      baustein: 'demonstrationsexperiment',
      bausteine: ['demonstrationsexperiment']
    };
    const wunsch: Regelmeldung = { regel: 'genannter-wunsch-bleibt', wirkung: 'weist-hin', grundlage: 'A', text: 'Wunsch', baustein: 'lehrervortrag' };
    const neu = passungNeuPruefen([lage, sicher, wunsch], [b('lehrervortrag')], { vorwissen: 'hoch' }, D.regeln);
    expect(neu.slice(0, 3)).toEqual([lage, sicher, wunsch]);
    expect(neu.slice(3).map((m) => m.regel)).toEqual(['viel-anleitung-hohes-vorwissen']);
  });

  it('gleiche Methoden und gleiche Lage: dieselben Warnungen wie der Kern bei der Zuordnung', () => {
    const matcher = createMatcher(D, createValidator(D));
    const r = matcher.zuordnen({ text: 'Mathematik Bruchrechnen Klasse 6, 90 Minuten, mit Lösungsbeispielen und Lehrervortrag', vorwissen: 'hoch' });
    expect(r.modus).toBe('ablauf');
    expect((r.regelmeldungen || []).some((m) => m.regel === 'viel-anleitung-hohes-vorwissen' && m.baustein === 'lehrervortrag')).toBe(true);
    const methoden = r.modus === 'ablauf' ? (r.schritte || []).map((s) => b(s.baustein)) : [];
    const neu = passungNeuPruefen(r.regelmeldungen || [], methoden, regelLageAus(r.kriterien), D.regeln, (s, c) => {
      const sc = D.schemes.find((x) => x.id === s);
      return (sc?.werte || (sc?.gruppen || []).flatMap((g) => g.werte)).find((w) => w.id === c)?.label || c;
    });
    const key = (m: Regelmeldung) => `${m.regel}|${m.baustein || ''}|${m.text}`;
    expect(neu.map(key).sort()).toEqual((r.regelmeldungen || []).map(key).sort());
  });
});
