import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { createMatcher, createSubjectDetector, createValidator } from '../src/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const D = loadFmtData(path.join(ROOT, 'data'));
const M = createMatcher(D, createValidator(D));
const F = createSubjectDetector(D.faecher);

describe('OEH-Fachzuordnung (data/crosswalk/oeh-faecher.json)', () => {
  it('ordnet jedes Schul- und Hochschulfach einem gültigen Fachbereich zu', () => {
    const areas = new Set((D.schemes.find((s) => s.id === 'fachbereich')!.werte || []).map((w) => w.id));
    expect(D.faecher!.schulfaecher.length).toBe(70);
    expect(D.faecher!.hochschulfaecher.length).toBe(344);
    for (const f of [...D.faecher!.schulfaecher, ...D.faecher!.hochschulfaecher]) {
      expect(areas.has(f.fachbereich), `${f.id} ${f.label}`).toBe(true);
      expect(f.uri).toMatch(/^http:\/\/w3id\.org\/openeduhub\/vocabs\/(discipline|hochschulfaechersystematik)\/.+/);
      expect(f.label.length).toBeGreaterThan(1);
    }
    const ids = D.faecher!.hochschulfaecher.map((f) => f.id);
    for (const f of D.faecher!.hochschulfaecher) if (f.oberbegriff) expect(ids).toContain(f.oberbegriff);
  });
});

describe('Facherkennung aus dem Text', () => {
  const fach = (t: string, stufe?: string) => F.erkenne(t, stufe);

  it('erkennt Schulfächer mit OEH-Kennung und Fachbereich', () => {
    expect(fach('Italienisch Klasse 8, Wegbeschreibung')).toMatchObject({
      quelle: 'schulfach',
      label: 'Italienisch',
      uri: 'http://w3id.org/openeduhub/vocabs/discipline/20004',
      fachbereich: 'sprachen'
    });
    expect(fach('Mathe Klasse 6, Bruchrechnen')).toMatchObject({ label: 'Mathematik', fachbereich: 'mathe-informatik' });
    expect(fach('Erdkunde Klasse 5: Kartenarbeit')).toMatchObject({ label: 'Geografie', fachbereich: 'gesellschaft' });
    expect(fach('Psychologie Kurs 11, Konditionierung')).toMatchObject({ label: 'Psychologie', fachbereich: 'gesellschaft' });
    expect(fach('Astronomie: Mondphasen, Klasse 9')).toMatchObject({ label: 'Astronomie', fachbereich: 'nawi-technik' });
    expect(fach('Sportunterricht Klasse 7, Basketball')).toMatchObject({ label: 'Sport', fachbereich: 'sport' });
    expect(fach('Biologiestunde zur Zelle')).toMatchObject({ label: 'Biologie' });
  });

  it('nutzt Hochschulfächer nur bei Hochschulbezug und dann vorrangig', () => {
    expect(fach('Maschinenbau: Thermodynamik, 90 Minuten', 'hochschule')).toMatchObject({
      quelle: 'hochschulfach',
      label: 'Maschinenbau/-wesen',
      fachbereich: 'nawi-technik'
    });
    expect(fach('Seminar Betriebswirtschaftslehre, Kostenrechnung', 'hochschule')).toMatchObject({ quelle: 'hochschulfach', fachbereich: 'gesellschaft' });
    expect(fach('Vorlesung Rechtswissenschaft, Vertragsrecht', 'hochschule')).toMatchObject({ fachbereich: 'gesellschaft' });
    expect(fach('Informatik Vorlesung, Sortierverfahren', 'hochschule')).toMatchObject({ quelle: 'hochschulfach', fachbereich: 'mathe-informatik' });
    // Without a university context "Architektur" is a topic, the subject is Kunst
    expect(fach('Architektur der Gotik, Kunst Klasse 9')).toMatchObject({ quelle: 'schulfach', label: 'Kunst' });
    expect(fach('Maschinenbau: Thermodynamik')).toBeNull();
  });

  it('liest Alltagswörter und Lerngruppenmerkmale nicht als Fach', () => {
    expect(fach('Mit Werken von Goethe arbeiten, Klasse 10')).toBeNull();
    expect(fach('Eine Geschichte schreiben, Klasse 4')).toBeNull();
    expect(fach('Allgemein gute Stunde zur Gesundheit planen')).toBeNull();
    expect(fach('Mathematik Klasse 7, davon 5 mit Deutsch als Zweitsprache')).toMatchObject({ label: 'Mathematik' });
    expect(fach('Bruchrechnen, 5 Kinder mit Deutsch als Zweitsprache, Mathematik Klasse 7')).toMatchObject({ label: 'Mathematik' });
    expect(fach('deutsch-französische Beziehungen, Geschichte Klasse 10')).toMatchObject({ label: 'Geschichte' });
    expect(fach('')).toBeNull();
  });

  it('zieht das Fach mit Rahmenangabe einem Fachwort im Thema vor', () => {
    expect(fach('Einfluss der Religion im Mittelalter, Geschichte Klasse 7')).toMatchObject({ label: 'Geschichte' });
    expect(fach('Kunst der Renaissance, Geschichte Klasse 8')).toMatchObject({ label: 'Geschichte' });
    expect(fach('Musik und Politik in der DDR, Musikunterricht 10. Klasse')).toMatchObject({ label: 'Musik' });
    expect(fach('Physik: Dichte, Klasse 7')).toMatchObject({ label: 'Physik' });
    expect(fach('Sport und Gesundheit, Biologie Kurs 11')).toMatchObject({ label: 'Biologie' });
  });
});

describe('Zuordnung mit Facherkennung', () => {
  const fb = (t: string) => M.lesen(t).kriterien.fachbereich;

  it('füllt den Fachbereich für Fächer, die die Textregeln nicht kennen', () => {
    expect(fb('Türkisch Klasse 7, Wegbeschreibung, 45 Minuten')).toBe('sprachen');
    expect(fb('Psychologie Kurs 11, Konditionierung, 90 Minuten')).toBe('gesellschaft');
    expect(fb('Vorlesung Maschinenbau, Thermodynamik, 90 Minuten, 120 Studierende')).toBe('nawi-technik');
    expect(fb('Seminar Betriebswirtschaftslehre an der Hochschule, Kostenrechnung, 90 Minuten')).toBe('gesellschaft');
  });

  it('lässt die Ergebnisse der bisherigen Textregeln unverändert', () => {
    expect(fb('Elektrotechnik Berufsschule, Ohmsches Gesetz')).toBe('beruf-praxis');
    expect(fb('Mathematik Klasse 7, 28 Kinder, davon 5 mit DaZ, Bruchrechnen')).toBe('mathe-informatik');
    expect(fb('Fotosynthese Klasse 7, 5 DaZ-Kinder')).toBeUndefined();
    expect(fb('Bruchrechnen Klasse 6')).toBeUndefined();
  });

  it('nennt das erkannte Fach im Ergebnis', () => {
    const r = M.zuordnen({ text: 'Italienisch Klasse 8, Wegbeschreibung, 45 Minuten' });
    expect(r.fach).toMatchObject({ label: 'Italienisch', uri: 'http://w3id.org/openeduhub/vocabs/discipline/20004' });
    expect(M.zuordnen({ text: 'Bruchrechnen Klasse 6, 45 Minuten' }).fach).toBeUndefined();
    expect(M.lesen('Vorlesung Maschinenbau, 90 Minuten').fach).toMatchObject({ quelle: 'hochschulfach' });
  });
});
