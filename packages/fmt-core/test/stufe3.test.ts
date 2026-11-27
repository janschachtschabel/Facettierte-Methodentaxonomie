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
    // The topic stays literal (FMT 2.1 E3): a subject word inside the phrase stays.
    expect(thema('Ich möchte in Deutsch Klasse 9 eine Erörterung schreiben lassen, 90 Minuten')).toBe('Deutsch eine Erörterung schreiben');
    expect(thema('Doppelstunde Chemie, Säuren und Basen, Klasse 9, 30 Lernende, nur ein Beamer')).toBe('Säuren und Basen');
  });

  it('behält Technik-, Personen- und Fachwörter, wenn sie das Thema sind', () => {
    expect(thema('Umgang mit KI und Internet im Alltag, Klasse 8, 45 min')).toBe('Umgang mit KI und Internet im Alltag');
    expect(thema('Lernen mit KI: Chancen und Risiken, Ethik Klasse 11')).toBe('Lernen mit KI: Chancen und Risiken');
    expect(thema('Sicherer Umgang mit Smartphones, Klasse 6')).toBe('Sicherer Umgang mit Smartphones');
    expect(thema('Leben ohne Strom, Sachunterricht Klasse 4')).toBe('Leben ohne Strom');
    expect(thema('Kein Internet für alle? Digitale Spaltung, Politik Klasse 10')).toBe('Kein Internet für alle? Digitale Spaltung');
    expect(thema('Die 3 Kinder aus der Krachmacherstraße lesen, Deutsch Klasse 3')).toBe('Die 3 Kinder aus der Krachmacherstraße lesen');
    expect(thema('Inklusion: Unterricht mit ADHS-Kindern gestalten, 90 Minuten')).toBe('Inklusion: Unterricht mit ADHS-Kindern gestalten');
    expect(thema('Vortrag an der Universität Wien halten üben, Deutsch Klasse 12')).toBe('Vortrag an der Universität Wien halten üben');
    expect(thema('Religion und Staat im Mittelalter, Geschichte Klasse 7')).toBe('Religion und Staat im Mittelalter');
    expect(thema('Geschichte des Internets, Informatik Klasse 9')).toBe('Geschichte des Internets');
    expect(thema('Kunst der Renaissance, Klasse 8')).toBe('Kunst der Renaissance');
    expect(thema('Stromkreis mit Technik-Baukasten bauen, Sachunterricht Klasse 4')).toBe('Stromkreis mit Technik-Baukasten bauen');
  });

  it('räumt Sonderfälle auf', () => {
    expect(thema('Das Thema: Dreisatz. Klasse 7, 25 Schülerinnen und Schüler')).toBe('Dreisatz');
    expect(thema('Ich plane eine Unterrichtsreihe zu Europa, Klasse 6, 4 Wochen')).toBe('Europa');
    expect(thema('Bruchrechnen für 26 Schüler, 45 Minuten')).toBe('Bruchrechnen');
    const daz = extractSubjectAndTopic('Deutsch als Zweitsprache: Wegbeschreibung, Erwachsenenbildung, 12 Teilnehmende');
    expect(daz.fach).toBe('Deutsch als Zweitsprache');
    expect(daz.thema).toBe('Wegbeschreibung');
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

  it('wertet ganze Wörter und Wortenden im Namen höher als Zufallstreffer', () => {
    const names = (text: string) => S.suche({ text }).map((b) => b.name);
    const pos = (text: string, re: RegExp) => names(text).findIndex((n) => re.test(n));
    expect(pos('spiel', /Rollenspiel|Planspiel/)).toBeLessThan(pos('spiel', /Lösungsbeispiele/));
    expect(pos('Erklärvideo', /^Erklärvideo/)).toBeLessThan(pos('Erklärvideo', /^Lehrervortrag/));
    expect(pos('Vortrag', /^Vortrag mit/)).toBeLessThan(pos('Vortrag', /^Schülerreferat/));
    expect(names('KI')[0]).toMatch(/\bKI\b/);
  });

  it('bleibt ohne Suchtext bei der Ordnung nach Evidenzgrad und Name', () => {
    const all = S.suche({});
    const grades = all.map((b) => S.bestGrade(b) || 'Z');
    expect(grades).toEqual([...grades].sort());
  });
});

describe('Anfrage lesen und prüfen', () => {
  it('liest DaZ als Merkmal der Lerngruppe nicht als Fach', () => {
    const fb = (t: string) => M.lesen(t).kriterien.fachbereich;
    expect(fb('Mathematik Klasse 7, 28 Kinder, davon 5 mit DaZ, Bruchrechnen, 45 Minuten')).toBe('mathe-informatik');
    expect(fb('Fotosynthese Klasse 7, 5 DaZ-Kinder')).not.toBe('sprachen');
    expect(fb('DaZ-Unterricht, Wortschatz Wohnen, 45 Minuten')).toBe('sprachen');
    expect(fb('DaZ Klasse 5: Wortschatz Wohnen')).toBe('sprachen');
    expect(fb('DaZ-Gruppe, 8 Lernende: Wortschatz Wohnen')).toBe('sprachen');
    expect(fb('DaZ-Intensivklasse: Wortschatz Wohnen, 45 Minuten')).toBe('sprachen');
    expect(fb('Physik Klasse 8, Dichte, viele DaZ Schüler')).toBe('nawi-technik');
    expect(fb('Dichte, Klasse 8, einige Kinder haben DaZ')).not.toBe('sprachen');
    expect(fb('Biologie Klasse 7, Zelle, Kinder mit LRS, DaZ und ADHS')).toBe('nawi-technik');
  });

  it('meldet ungültige Angaben als FmtRequestError', () => {
    expect(() => M.zuordnen({ text: 'x', maxTechnik: 'quatsch' })).toThrow(FmtRequestError);
    expect(() => M.zuordnen({ quatsch: 1 } as never)).toThrow(FmtRequestError);
  });
});
