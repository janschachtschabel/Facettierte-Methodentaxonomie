import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { createMentionDetector } from '../src/index.js';

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
