import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { createMatcher, createMentionDetector, createValidator } from '../src/index.js';
import type { PhaseMatchResult } from '../src/types.js';
import { FIXTURE_HILFE, mitHilfe } from './fixtures/hilfe.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const detector = createMentionDetector(loadFmtData(path.join(ROOT, 'data')));
const ids = (text: string) => detector.detect(text).map((m) => m.kennung);

describe('Methodennennungen im Freitext', () => {
  it('erkennt Hauptnamen, Beugungen und Synonyme', () => {
    expect(ids('Kommunikation mit Angehörigen, Rollenspiel, 90 Minuten')).toEqual(['rollenspiel']);
    expect(ids('Industrialisierung als Gruppenpuzzle')).toEqual(['gruppenpuzzle']);
    expect(ids('Wir machen ein Jigsaw zur Zelle')).toEqual(['gruppenpuzzle']);
    expect(ids('Fotosynthese mit Think Pair Share')).toEqual(['tps']);
    expect(ids('Sterbehilfe als Fishbowl diskutieren')).toEqual(['fishbowl']);
    expect(ids('Tempolimit, Pro-Contra-Debatte')).toEqual(['pro-contra-debatte']);
  });

  it('erkennt Methoden am Ende eines Kompositums und bevorzugt den Hauptnamen', () => {
    expect(ids('Dichte forschend-entdeckend mit Schülerexperimenten')).toEqual(['experiment']);
    expect(ids('Einstieg mit einem Demonstrationsexperiment')).toEqual(['demonstrationsexperiment']);
  });

  it('hält die Reihenfolge im Text und nennt jede Methode einmal', () => {
    expect(ids('Erst Placemat, dann Gruppenpuzzle, am Ende noch ein Placemat')).toEqual(['placemat', 'gruppenpuzzle']);
  });

  it('meldet keine Nennung bei Wortteilen, Alltagswörtern und leerem Text', () => {
    expect(ids('Volleyball: oberes Zuspiel')).toEqual([]);
    expect(ids('Mit viel Experimentierfreude starten')).toEqual([]);
    expect(ids('Eine Vortragsreihe zur Stadtgeschichte')).toEqual([]);
    expect(ids('Mathematik Klasse 8: Prozentrechnung, 45 Minuten')).toEqual([]);
    expect(ids('')).toEqual([]);
  });
  it('kennzeichnet Hauptname und Synonym', () => {
    const m = detector.detect('Laufdiktat und danach eine Erkundung');
    expect(m.find((x) => x.kennung === 'laufdiktat')?.main).toBe(true);
    expect(m.find((x) => x.kennung === 'exkursion')?.main).toBe(false);
  });
});

describe('Genannter Wunsch bleibt (Regel genannter-wunsch-bleibt)', () => {
  const D = loadFmtData(path.join(ROOT, 'data'));
  const M = createMatcher(D, createValidator(D));

  it('eine genannte Methode mit Warnung steht vorn, behält die Warnung und bekommt die Regelmeldung', () => {
    const r = M.zuordnen({ text: 'Grundschule Klasse 3, Einstieg mit Peer Instruction' }) as PhaseMatchResult;
    expect(r.modus).toBe('phase');
    // Wunsch genannt comes before the warnings in the ranking (spec 6, Reihenfolge der Wirkung).
    expect(r.vorschlaege[0].baustein).toBe('peer-instruction');
    // Tor D2 dropped the stage entry of peer-instruction: the built-in rule evidenz-geltung warns instead.
    expect(r.vorschlaege[0].regelmeldungen).toContainEqual(expect.objectContaining({ regel: 'evidenz-geltung', wirkung: 'warnt' }));
    const g = (r.regelmeldungen || []).find((m) => m.regel === 'genannter-wunsch-bleibt');
    expect(g).toMatchObject({ baustein: 'peer-instruction', wirkung: 'weist-hin', grundlage: 'A' });
    expect(g!.text).toMatch(/unter den Vorschlägen/);
  });

  it('ohne Warnung und ohne Raumlücke gibt es keine Meldung zum Wunsch', () => {
    const r = M.zuordnen({ text: 'Sterbehilfe als Fishbowl diskutieren, Klasse 10, 45 Minuten' });
    expect(r.modus === 'ablauf' && (r.verankert || []).some((v) => v.baustein === 'fishbowl')).toBe(true);
    expect((r.regelmeldungen || []).some((m) => m.regel === 'genannter-wunsch-bleibt' && m.baustein === 'fishbowl')).toBe(false);
  });
});

describe('Genannte Hilfen (Task C4)', () => {
  const DH = mitHilfe(loadFmtData(path.join(ROOT, 'data')));
  const MH = createMatcher(DH, createValidator(DH));

  it('der Detektor kennzeichnet eine genannte Hilfe', () => {
    const m = createMentionDetector(DH).detect('Gruppenpuzzle mit Wortspeicher');
    expect(m.find((x) => x.kennung === FIXTURE_HILFE)?.hilfe).toBe(true);
    expect(m.find((x) => x.kennung === 'gruppenpuzzle')?.hilfe).toBeUndefined();
  });

  it('eine genannte Hilfe steht unter genannteHilfen und im Hinweis, die genannte Methode wird verankert', () => {
    const r = MH.zuordnen({ text: 'Industrialisierung als Gruppenpuzzle mit Wortspeicher, Klasse 9, 90 Minuten' });
    expect(r.modus).toBe('ablauf');
    if (r.modus !== 'ablauf') return;
    expect(r.genannteHilfen).toEqual([FIXTURE_HILFE]);
    expect(r.hinweise).toContain('‚Wortspeicher‘ ist eine Hilfe und wird in Schritt 3 den Phasen zugeordnet');
    expect((r.verankert || []).map((v) => v.baustein)).toContain('gruppenpuzzle');
    expect((r.nichtVerankert || []).map((v) => v.baustein)).not.toContain(FIXTURE_HILFE);
  });

  it('eine verneinte Hilfe ist nicht genannt', () => {
    const r = MH.zuordnen({ text: 'Deutsch Klasse 5, Märchen, 45 Minuten, ohne Wortspeicher' });
    expect(r.genannteHilfen).toBeUndefined();
  });
});
