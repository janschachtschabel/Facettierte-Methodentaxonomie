import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { createMatcher, createValidator } from '../src/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const D = loadFmtData(path.join(ROOT, 'data'));
const M = createMatcher(D, createValidator(D));
const name = (id: string) => D.bausteine.find((b) => b.kennung === id)!.name;

describe('Fix wave Paket B', () => {
  it('2: ein Sicherheitshinweis je Antwort, an der ersten praktischen Methode, nennt bis zu zwei weitere', () => {
    const chemie = M.zuordnen({ text: 'Chemie Klasse 8: Schülerexperiment zu Säuren und Laugen, 90 Minuten' });
    const s = (chemie.regelmeldungen || []).filter((m) => m.regel === 'sicherheitshinweis');
    expect(s.length).toBe(1);
    expect(s[0].baustein).toBeTruthy();
    expect(s[0].text).toMatch(/^Im Ablauf wird praktisch gearbeitet \(z\. B\. .+\)\. Kläre vorher Sicherheit und Aufsicht\.$/);
    expect(s[0].text).toContain(name(s[0].baustein!));
    const genannt = s[0].text.match(/z\. B\. (.+)\)\./)![1].split(/, | und /);
    expect(genannt.length).toBeGreaterThanOrEqual(1);
    expect(genannt.length).toBeLessThanOrEqual(3);
    expect(genannt[0]).toBe(name(s[0].baustein!));
    expect((chemie.hinweise || []).filter((h) => /Sicherheit und Aufsicht/.test(h)).length).toBe(1);
  });

  it('9: keine Kennungen BD/EG mehr in den Beschreibungen des Vokabulars (W2)', () => {
    const vocab = fs.readFileSync(path.join(ROOT, 'data', 'vocab.json'), 'utf8');
    expect(vocab.match(/\b(?:BD|EG)[0-9]\b/g) || []).toEqual([]);
  });

  it('11: findet sich keine Prüfmethode der gewünschten Form, sagt die Antwort es sichtbar (W5, kein stilles Lockern)', () => {
    const r = M.zuordnen({ text: 'Elektroniker Lernfeld 3, Fehlersuche an Schaltungen, 45 Minuten, am Ende praktische Prüfung' });
    expect(r.nachweis?.formen).toEqual(['praktisch']);
    const m = (r.regelmeldungen || []).find((x) => x.regel === 'nachweis-passt-zum-ziel');
    expect(m).toBeTruthy();
    expect(m!.text).toBe(`Keine Prüfmethode der Form praktisch passt in diese Stunde; gewählt wurde ${name(m!.baustein!)}.`);
    expect((r.hinweise || []).some((h) => h.startsWith('Keine Prüfmethode der Form praktisch'))).toBe(true);
    // A check of the wanted form gets no such message.
    const sport = M.zuordnen({ text: 'Sport Klasse 8, Ausdauer mit Leistungskontrolle, Sportplatz, 45 Minuten' });
    expect(sport.nachweis?.formen).toContain('praktisch');
    expect((sport.regelmeldungen || []).some((x) => x.regel === 'nachweis-passt-zum-ziel')).toBe(false);
  });
});
