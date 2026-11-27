import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { createMatcher, createValidator, detectLearnerGroupsFromText, detectMatrixTraitsFromText } from '../src/index.js';
import { extractSubjectAndTopic } from '../src/thema.js';
import type { EinsatzNode, FmtData } from '../src/types.js';

/** Task Q2 (scenario test 2026-11-27, causes U3 and U9): reading free text, topic and required details. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const D = loadFmtData(path.join(ROOT, 'data'));
const M = createMatcher(D, createValidator(D));
const lies = (text: string) => M.lesen(text).kriterien;
const zuordnen = (text: string, felder: Record<string, unknown> = {}) => M.zuordnen({ text, ...felder });
const thema = (text: string) => extractSubjectAndTopic(text).thema;

describe('Wortregeln (U3 b)', () => {
  it('Kurvendiskussion ist kein Diskurs, eine Diskussion bleibt einer', () => {
    expect(lies('Kurvendiskussion ganzrationaler Funktionen üben').ansatz || []).not.toContain('diskurs');
    expect(lies('Ethik Klasse 8, Diskussion: Darf man lügen?').ansatz).toContain('diskurs');
    expect(lies('Seminar, Textdiskussion zu Bourdieu').ansatz).toContain('diskurs');
  });

  it('„Geschichte vom/von/über …“ ist eine Erzählung, nicht das Fach', () => {
    expect(extractSubjectAndTopic('Religion Klasse 2, die Geschichte vom barmherzigen Samariter, 45 Minuten').fach).toBe('Religion');
    expect(lies('Klasse 3, die Geschichte von Sankt Martin hören').fachbereich).toBeUndefined();
    expect(extractSubjectAndTopic('Geschichte Klasse 9, Weimarer Republik').fach).toBe('Geschichte');
    expect(lies('Geschichte Klasse 9, Weimarer Republik').fachbereich).toBe('gesellschaft');
  });

  it('Rollstuhl nur als Lernende (im Rollstuhl, Rollstuhlfahrer, Kind mit Rollstuhl), nicht als Gegenstand', () => {
    const motorik = (t: string) => detectLearnerGroupsFromText(t).groups.some((g) => g.id === 'motorik');
    const merkmal = (t: string) => detectMatrixTraitsFromText(t).selectedValues['foerderbedarf-koerperlich'] === 'foerderbedarf-koerperlich-deutlich';
    for (const t of ['Mathe Klasse 6, 3 Kinder im Rollstuhl', 'Klasse 5, davon 1 Rollstuhlfahrer', 'Sport Klasse 4, ein Kind mit Rollstuhl']) {
      expect(motorik(t), t).toBe(true);
      expect(merkmal(t), t).toBe(true);
    }
    const objekt = 'Pflegeausbildung 2. Lehrjahr: Transfer vom Bett in den Rollstuhl üben, Skills Lab, 90 Minuten, 16 Auszubildende';
    expect(motorik(objekt)).toBe(false);
    expect(merkmal(objekt)).toBe(false);
  });

  it('eine semantisch geratene Lernfunktion kommt nicht aus einem Text ohne Rahmen und nicht aus „prüfen“ allein', () => {
    expect(lies('Ich brauche was für morgen').lernfunktion).toBeUndefined();
    expect(lies('Kants kategorischer Imperativ an einem Dilemma prüfen').lernfunktion).toBeUndefined();
  });
});

describe('Raum (U3 d)', () => {
  it('Bindestrich- und freie Formen', () => {
    expect(lies('Biologie Klasse 6, Mikroskopieren, Biologie-Fachraum, 90 Minuten').raum).toBe('fachraum-nawi');
    expect(lies('Physik Klasse 8, Linsen, Physik-Raum, 45 Minuten').raum).toBe('fachraum-nawi');
    expect(lies('Pflege, Verbandwechsel, Fachraum, 90 Minuten').raum).toBe('fachraum');
  });

  it('„Werkstatt“ als eigener Listenpunkt ist der Raum, nicht die Methode Werkstatt', () => {
    const g = M.lesen('Berufsschule Kfz: Bremsbeläge wechseln, Werkstatt, 90 Minuten');
    expect(g.kriterien.raum).toBe('werkraum');
    // The approach may still be guessed from the wording, but not read from the room word.
    expect(g.erkannt.find((e) => e.feld === 'ansatz')?.beleg || '').not.toMatch(/werkstatt/);
    expect(lies('Bruchrechnen in einer Werkstatt mit Stationen').ansatz).toContain('offen');
  });
});

describe('Ziel- und Fachwörter (U3 a, e)', () => {
  it('Songwriting und komponieren: gestalten', () => {
    expect(lies('Musik Klasse 9, Songwriting mit Tablets').zielart).toBe('gestalten');
    expect(lies('Musik Klasse 7: eine Melodie komponieren').zielart).toBe('gestalten');
  });

  it('Rückenfit, Rückenschule, Kräftigung, Funktionsgymnastik: Kondition im Fachbereich Sport', () => {
    for (const t of ['Rückenfit-Kurs, 60 Minuten', 'Rückenschule für Erwachsene', 'Kräftigung der Rumpfmuskulatur, Turnhalle', 'Funktionsgymnastik im Verein']) {
      expect(lies(t).zielart, t).toBe('kondition');
    }
    expect(lies('Rückenschule für Erwachsene').fachbereich).toBe('sport');
    const r = zuordnen('Rückenfit-Kurs für Erwachsene im Sportverein, Kräftigung der Rumpfmuskulatur, 60 Minuten, Turnhalle, 15 Teilnehmende');
    expect(r.kriterien.fachbereich).toBe('sport');
  });

  it('„… bestimmen“ mit Wörtern dazwischen: Prozeduren', () => {
    expect(lies('Bäume auf dem Schulhof an Blättern bestimmen').zielart).toBe('prozeduren');
  });

  it('Schülerversuch, Versuchsreihe, Versuchsprotokoll: Ansatz forschend', () => {
    for (const t of ['Verbrennung von Metallen: Schülerversuch mit Eisenwolle', 'Versuchsreihe zur Löslichkeit', 'Versuchsprotokoll schreiben']) {
      expect(lies(t).ansatz, t).toContain('forschend');
    }
  });

  it('schriftlicher Test, schriftliche Arbeit, Klassenarbeit schreiben: Nachweis schriftlich; eine Vorbereitung darauf nicht', () => {
    for (const t of ['Mathe Klasse 6, schriftlicher Test mit Note', 'Deutsch: schriftliche Arbeit zur Kurzgeschichte', 'Klasse 8, heute Klassenarbeit schreiben']) {
      expect(lies(t).nachweis, t).toBe('schriftlich');
    }
    expect(lies('Vorbereitung auf die schriftliche Arbeit, Klasse 8').nachweis).toBeUndefined();
  });

  it('Prüfungs- und Klausurvorbereitung: Lernfunktion Konsolidierung, ganze Stunde mit Übungskette', () => {
    expect(lies('Klausurvorbereitung Analysis, 90 Minuten').lernfunktion).toEqual(['konsolidierung']);
    const r = zuordnen('Berufsschule Industriekaufleute: Deckungsbeitragsrechnung, Prüfungsvorbereitung für die Abschlussprüfung, 90 Minuten, 22 Azubis');
    expect(r.modus).toBe('ablauf');
    expect(r.modus === 'ablauf' && r.kette?.id).toBe('prozedur');
  });

  it('Excel und Tabellenkalkulation: Mathematik/Informatik und Prozeduren; Statistik bleibt', () => {
    expect(lies('VHS-Kurs Excel Grundlagen').fachbereich).toBe('mathe-informatik');
    expect(lies('Tabellenkalkulation für Einsteiger').zielart).toBe('prozeduren');
    expect(lies('Vorlesung Statistik I').fachbereich).toBe('mathe-informatik');
  });

  it('Soziologie, Psychologie, Pädagogik: Gesellschaft', () => {
    for (const t of ['Seminar Soziologie im Master', 'Psychologie: Lerntheorien', 'Pädagogik Grundkurs']) expect(lies(t).fachbereich, t).toBe('gesellschaft');
  });

  it('Berufsbildung im Praxisraum ohne anderes Ziel: Zielart Handlung angenommen und genannt', () => {
    const r = zuordnen('Berufsschule Kfz-Mechatroniker: Bremsbeläge an der Scheibenbremse wechseln, Werkstatt, 90 Minuten, 12 Azubis');
    expect(r.modus === 'ablauf' && r.kette?.id).toBe('vollstaendige-handlung');
    expect(r.pflichtangaben?.angenommen).toContainEqual(expect.objectContaining({ feld: 'zielart', wert: 'handlung' }));
    expect(r.pflichtangaben?.fehlt).toContain('ziel');
  });
});

describe('Pflichtangaben (U9)', () => {
  it('ein geratenes Ziel füllt die Lücke „ziel“ nicht und steht unter angenommen', () => {
    const r = zuordnen('Irgendwas Aktivierendes zum Thema Klimawandel');
    expect(r.erkannt.find((e) => e.feld === 'lernfunktion')?.beleg).toMatch(/^semantisch/);
    expect(r.pflichtangaben?.fehlt).toContain('ziel');
    expect(r.pflichtangaben?.angenommen).toContainEqual(expect.objectContaining({ feld: 'lernfunktion' }));
  });

  it('ein Fach, das nur aus einem Themenwort geraten ist, steht unter angenommen; ein genanntes nicht', () => {
    expect(zuordnen('Irgendwas Aktivierendes zum Thema Klimawandel').pflichtangaben?.angenommen).toContainEqual({
      feld: 'fach',
      wert: 'Geografie',
      grund: 'Kein Fach genannt: Geografie angenommen aus dem Thema.'
    });
    const genannt = zuordnen('Erdkunde Klasse 9: Klimawandel, 45 Minuten');
    expect((genannt.pflichtangaben?.angenommen || []).some((x) => x.feld === 'fach')).toBe(false);
    // An explicit field beats the text.
    const feld = zuordnen('Klimawandel', { fachbereich: 'nawi-technik' });
    expect((feld.pflichtangaben?.angenommen || []).some((x) => x.feld === 'fach')).toBe(false);
  });

  it('Thema ohne erkanntes Fach: fach-und-thema fehlt und die Antwort sagt, wie geplant wurde', () => {
    const r = zuordnen('Alphabetisierungskurs: Einkaufen, Preise verstehen und vergleichen', { bildungsstufe: 'erwachsenenbildung', zeitMin: 90, gruppe: 8, raum: 'klassenraum' });
    expect(r.pflichtangaben?.fehlt).toContain('fach-und-thema');
    expect(r.pflichtangaben?.angenommen).toContainEqual({ feld: 'fach', wert: null, grund: 'Fach nicht erkannt: ohne Fachbezug geplant.' });
    // A subject read from the text closes the gap.
    expect(zuordnen('Seminar Soziologie im Master, 12 Studierende, Textdiskussion zu Bourdieus Habitusbegriff, 90 Minuten').pflichtangaben?.fehlt).not.toContain('fach-und-thema');
  });
});

describe('Thema (U3 f)', () => {
  it('nur das als Fach gelesene Wort fällt weg (Textanfang oder eigener Kommateil)', () => {
    expect(thema('Chemie Oberstufe: funktionelle Gruppen der organischen Chemie auswendig können, 20 Minuten Wiederholung, 19 Schüler')).toBe(
      'funktionelle Gruppen der organischen Chemie auswendig können'
    );
    expect(thema('Klasse 7, Bruchrechnen, Mathe, 45 Minuten')).toBe('Bruchrechnen');
    expect(thema('Religion Klasse 2, die Geschichte vom barmherzigen Samariter im Erzählkreis')).toContain('Geschichte vom barmherzigen Samariter');
  });

  it('Ordnungszahlen bleiben ganz („2. Lehrjahr“, „1. Semester“)', () => {
    expect(thema('Pflegeausbildung 2. Lehrjahr, Lernfeld Mobilisation: Transfer üben, 90 Minuten')).toContain('2. Lehrjahr');
    expect(thema('Laborpraktikum Chemie im 1. Semester: Säure-Base-Titration, 180 Minuten')).toContain('1. Semester');
  });

  it('ein Kommateil, der nur den Raum nennt, gehört nicht zum Thema', () => {
    expect(thema('Vorlesung Statistik I, Hörsaal, 250 Studierende, 90 Minuten, Hypothesentests einführen')).not.toContain('Hörsaal');
    expect(thema('Klasse 1 Mathe, Zahlen bis 10 zerlegen mit Plättchen, 20 Minuten, 22 Kinder, Klassenraum')).toBe('Zahlen bis 10 zerlegen mit Plättchen');
    expect(thema('Pflege: Verbandwechsel, Skills Lab, 90 Minuten')).toBe('Pflege: Verbandwechsel');
  });
});

describe('Benoteter Test als Stunde (U3)', () => {
  // Fixture: a written check of up to 40 minutes, as the catalogue lacks one until QD2.
  const mitLangemTest = (): FmtData => {
    const kopie = structuredClone(D);
    const mc = kopie.bausteine.find((b) => b.kennung === 'multiple-choice-test')!;
    mc.dauerMax = 40;
    mc.schriftbedarf = ['schreibt'];
    return kopie;
  };
  const pruefschrittMin = (r: ReturnType<typeof M.zuordnen>) => {
    if (r.modus !== 'ablauf' || !r.arrangement || r.arrangement.ablauf.typ !== 'Sequenz') return { pruef: 0, gesamt: 0 };
    const haupt = r.arrangement.ablauf.teile.filter((n): n is EinsatzNode => n.typ === 'Einsatz');
    return {
      pruef: haupt.filter((n) => !n.kettenschritt).reduce((x, n) => x + (n.dauerMin ?? 0), 0),
      gesamt: haupt.reduce((x, n) => x + (n.dauerMin ?? 0), 0)
    };
  };

  it('der Prüfschritt hält mindestens die Hälfte der Zeit mit einer schriftlichen Prüfung; ohne Note nicht', () => {
    const DF = mitLangemTest();
    const MF = createMatcher(DF, createValidator(DF));
    const benotet = MF.zuordnen({ text: 'Mathe Klasse 6 Bruchrechnen, schriftlicher Test mit Note, 45 Minuten, 27 Schüler' });
    const { pruef, gesamt } = pruefschrittMin(benotet);
    expect(pruef * 2).toBeGreaterThanOrEqual(gesamt);
    expect(benotet.nachweis?.formen).toEqual(['schriftlich']);
    const ohneNote = pruefschrittMin(MF.zuordnen({ text: 'Mathe Klasse 6 Bruchrechnen üben, schriftlicher Test, 45 Minuten, 27 Schüler' }));
    expect(ohneNote.pruef * 2).toBeLessThan(ohneNote.gesamt);
  });
});
