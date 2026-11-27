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

  it('6: ein nur vermutetes Ziel steht unter pflichtangaben.angenommen (W13)', () => {
    for (const text of ['Ethik Klasse 10, Gerechtigkeit, 30 Lernende im Hörsaal', 'Ethik Klasse 10, Gerechtigkeit, 30 Lernende im Hörsaal, 45 Minuten']) {
      const r = M.zuordnen({ text });
      const fn = r.erkannt.find((e) => e.feld === 'lernfunktion');
      expect(fn?.beleg, text).toMatch(/^semantisch/);
      const code = (r.kriterien.lernfunktion as string[])[0];
      const label = D.schemes.find((x) => x.id === 'lernfunktion')!.werte!.find((w) => w.id === code)!.label;
      expect(r.pflichtangaben?.angenommen, text).toContainEqual({ feld: 'lernfunktion', wert: code, grund: `Ziel „${label}“ vermutet aus dem Text.` });
    }
    // A goal the text names is no guess.
    const einstieg = M.zuordnen({ text: 'Einstieg für Mathe Klasse 7 Brüche' });
    expect((einstieg.pflichtangaben?.angenommen || []).some((x) => /vermutet aus dem Text/.test(x.grund))).toBe(false);
    // A goal the caller states replaces the guess.
    const mitZiel = M.zuordnen({ text: 'Ethik Klasse 10, Gerechtigkeit, 30 Lernende im Hörsaal', zielart: 'urteilen' });
    expect((mitZiel.pflichtangaben?.angenommen || []).some((x) => /vermutet aus dem Text/.test(x.grund))).toBe(false);
  });

  it('1: ohne Zeit, aber mit Fach oder Stufe entsteht ein Ablauf mit angenommenen 45 Minuten (W13)', () => {
    for (const text of [
      'Ethik Klasse 10, Sterbehilfe, Hörsaal mit fester Bestuhlung, 30 Lernende',
      'Sachunterricht Klasse 1, Jahreszeiten, Kinder können noch nicht lesen',
      'Fotosynthese Klasse 7',
      'Biologie: Fotosynthese'
    ]) {
      const r = M.zuordnen({ text });
      expect(r.modus, text).toBe('ablauf');
      expect(r.pflichtangaben?.fehlt, text).toContain('zeit');
      expect(r.pflichtangaben?.angenommen.find((x) => x.feld === 'zeit')?.wert, text).toBe(45);
    }
  });

  it('1: eine eindeutig einzelne Phase bleibt eine Phase, ein Thema allein ist kein Rahmen', () => {
    for (const text of ['Einstieg für Mathe Klasse 7 Brüche', 'eine Methode für Mathe Klasse 7 Brüche', 'Sicherung Geschichte Klasse 9 Weimarer Republik', 'Fotosynthese']) {
      expect(M.zuordnen({ text }).modus, text).toBe('phase');
    }
  });

  it('1: Ethik, Philosophie und Religion ohne Ziel nehmen Urteilen an und nennen es (wie Sport → Bewegung)', () => {
    const urteil = (text: string, fach: string) => {
      const r = M.zuordnen({ text });
      expect(r.modus === 'ablauf' && r.kette?.id, text).toBe('urteilsbildung');
      expect(r.pflichtangaben?.angenommen, text).toContainEqual({
        feld: 'zielart',
        wert: 'urteilen',
        grund: `Ziel Urteilsbildung angenommen, weil das Fach ${fach} ist.`
      });
    };
    // n05: the assumption wins over a merely semantic guess of an approach (Kooperatives Lernen).
    urteil('Ethik Klasse 10, Sterbehilfe, Hörsaal mit fester Bestuhlung, 30 Lernende', 'Ethik');
    urteil('Religion Klasse 8, Weltreligionen, 45 Minuten', 'Religion');
    urteil('Philosophie Klasse 11, Freiheit, 45 Minuten', 'Philosophie');
    // A goal read from the text or stated by the caller wins.
    const wiederholen = M.zuordnen({ text: 'Ethik Klasse 10, Sterbehilfe, Begriffe wiederholen, 45 Minuten' });
    expect(wiederholen.modus === 'ablauf' && wiederholen.kette?.id).not.toBe('urteilsbildung');
    const fakten = M.zuordnen({ text: 'Ethik Klasse 8, Fakten zur Sterbehilfe lernen, 45 Minuten' });
    expect(fakten.modus === 'ablauf' && fakten.kette?.id).toBe('faktenwissen');
    const gesagt = M.zuordnen({ text: 'Religion Klasse 8, Weltreligionen, 45 Minuten', zielart: 'konzepte' });
    expect(gesagt.modus === 'ablauf' && gesagt.kette?.id).not.toBe('urteilsbildung');
    for (const r of [wiederholen, fakten, gesagt]) {
      expect((r.pflichtangaben?.angenommen || []).some((x) => /Urteilsbildung angenommen/.test(x.grund))).toBe(false);
    }
    // Discussing the text rules out speaks against judging.
    const keineDiskussion = M.zuordnen({ text: 'Ethik Klasse 9 Freundschaft, 45 Minuten, bitte keine Diskussion im Plenum' });
    expect(keineDiskussion.modus === 'ablauf' && keineDiskussion.kette?.id).not.toBe('urteilsbildung');
    // Primary school: Religion and Ethik lessons mostly build concepts, no judging assumed.
    const primar = M.zuordnen({ text: 'Religion Klasse 3 Feste der Weltreligionen, 45 Minuten' });
    expect(primar.kriterien.bildungsstufe).toBe('primar');
    expect(primar.modus === 'ablauf' && primar.kette?.id).toBe('konzeptaufbau');
    expect((primar.pflichtangaben?.angenommen || []).some((x) => /Urteilsbildung angenommen/.test(x.grund))).toBe(false);
    // Other subjects keep the general assumption.
    const geschichte = M.zuordnen({ text: 'Geschichte Klasse 9, Weimarer Republik, 45 Minuten' });
    expect((geschichte.pflichtangaben?.angenommen || []).some((x) => /Urteilsbildung angenommen/.test(x.grund))).toBe(false);
  });
});
