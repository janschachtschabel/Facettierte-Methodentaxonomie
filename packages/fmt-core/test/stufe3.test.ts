import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { createMatcher, createSearch, createValidator, extractSubjectAndTopic, FmtRequestError } from '../src/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const D = loadFmtData(path.join(ROOT, 'data'));
const S = createSearch(D);
const M = createMatcher(D, createValidator(D));

describe('Themenerkennung ohne Rahmenreste', () => {
  const thema = (t: string) => extractSubjectAndTopic(t).thema;

  it('entfernt Klasse, Zeit, Gruppengröße und Technikangaben', () => {
    expect(thema('Bruchrechnen: Brüche addieren, Klasse 6, 26 Schüler, ohne Tablets')).toBe('Bruchrechnen: Brüche addieren');
    expect(thema('Thema Fotosynthese in Klasse 7, 45 Minuten')).toBe('Fotosynthese');
    expect(thema('45 Minuten Englisch, simple past, Klasse 6 ohne Tablets')).toBe('simple past');
    expect(thema('Rollenspiel zur Weimarer Republik, Geschichte Klasse 10')).toBe('Rollenspiel zur Weimarer Republik');
  });

  it('entfernt Angaben zur Lerngruppe', () => {
    expect(thema('Klasse 7, 28 Kinder, davon 5 mit DaZ, 3 mit LRS und 4 leistungsstarke, Bruchrechnen, 45 Minuten')).toBe('Bruchrechnen');
  });

  it('lässt keine leeren Kommastellen oder hängenden Wörter stehen', () => {
    for (const t of [
      'Ich möchte in Deutsch Klasse 9 eine Erörterung schreiben lassen, 90 Minuten',
      'Unterrichtsreihe Physik Klasse 7: das Konzept Dichte verstehen, wenig Vorwissen, 270 Minuten, ohne Geräte',
      'Doppelstunde Chemie, Säuren und Basen, Klasse 9, 30 Lernende, nur ein Beamer'
    ]) {
      const r = thema(t)!;
      expect(r).not.toMatch(/,\s*,|^[,.:;\s]|[,.:;\s]$/);
      expect(r).not.toMatch(/\b(?:in|im|für|mit|und|zur|zum)$/i);
      expect(r).not.toMatch(/^(?:in|im|für|mit|und)\b/i);
    }
    expect(thema('Ich möchte in Deutsch Klasse 9 eine Erörterung schreiben lassen, 90 Minuten')).toBe('eine Erörterung schreiben');
    expect(thema('Doppelstunde Chemie, Säuren und Basen, Klasse 9, 30 Lernende, nur ein Beamer')).toBe('Säuren und Basen');
  });

  it('erkennt das Fach', () => {
    expect(extractSubjectAndTopic('Thema Fotosynthese in Klasse 7').fach).toBe('Biologie');
    expect(extractSubjectAndTopic('').thema).toBeNull();
  });
});

describe('Suche nach Relevanz', () => {
  const ids = (text: string) => S.suche({ text }).map((b) => b.kennung);

  it('stellt Namens- und Synonymtreffer vor Treffer in der Beschreibung', () => {
    expect(ids('jigsaw')[0]).toBe('gruppenpuzzle');
    expect(ids('Rollenspiel')[0]).toBe('rollenspiel');
    expect(ids('Fishbowl')[0]).toBe('fishbowl');
    const quiz = S.suche({ text: 'quiz' });
    const firstNonName = quiz.findIndex((b) => !/quiz/i.test([b.name, ...(b.alternativname || [])].join(' ')));
    const lastName = quiz.map((b) => /quiz/i.test(b.name)).lastIndexOf(true);
    expect(firstNonName === -1 || lastName < firstNonName).toBe(true);
  });

  it('bleibt ohne Suchtext bei der Ordnung nach Evidenzgrad und Name', () => {
    const all = S.suche({});
    const grade = (i: number) => S.bestGrade(all[i]) || 'Z';
    expect(grade(0) <= grade(all.length - 1)).toBe(true);
  });
});

describe('Anfrage lesen und prüfen', () => {
  it('liest DaZ als Merkmal der Lerngruppe nicht als Fach', () => {
    const fb = (t: string) => M.lesen(t).kriterien.fachbereich;
    expect(fb('Mathematik Klasse 7, 28 Kinder, davon 5 mit DaZ, Bruchrechnen, 45 Minuten')).toBe('mathe-informatik');
    expect(fb('Fotosynthese Klasse 7, 5 DaZ-Kinder')).not.toBe('sprachen');
    expect(fb('DaZ-Unterricht, Wortschatz Wohnen, 45 Minuten')).toBe('sprachen');
    expect(fb('DaZ Klasse 5: Wortschatz Wohnen')).toBe('sprachen');
  });

  it('meldet ungültige Angaben als FmtRequestError', () => {
    expect(() => M.zuordnen({ text: 'x', maxTechnik: 'quatsch' })).toThrow(FmtRequestError);
    expect(() => M.zuordnen({ quatsch: 1 } as never)).toThrow(FmtRequestError);
  });
});
