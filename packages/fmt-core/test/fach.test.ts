import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { createMatcher, createSubjectDetector, createValidator } from '../src/index.js';
import { termsOf } from '../src/fach.js';

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

describe('Suchwörter aus den Vokabularen', () => {
  it('enthalten keine Bruchstücke und decken die Hochschulfächer ab', () => {
    const uni = D.faecher!.hochschulfaecher.filter((f) => f.ebene !== 1);
    const all = uni.flatMap((f) => termsOf(f, true));
    for (const t of all) {
      expect(t, t).not.toMatch(/^-|-$|\.|^studienbereich/);
      expect(t.length).toBeGreaterThanOrEqual(3);
    }
    const terms = (label: string) => termsOf(uni.find((f) => f.label === label)!, true);
    expect(terms('Maschinenbau/-wesen')).toEqual(['maschinenbau']);
    expect(terms('Medizin (Allgemein-Medizin)')).toContain('medizin');
    expect(terms('Kunstgeschichte, Kunstwissenschaft')).toEqual(['kunstgeschichte', 'kunstwissenschaft']);
    expect(terms('Transport-/Fördertechnik')).toEqual(['fordertechnik']);
    expect(terms('Betriebswirtschaftslehre')).toContain('bwl');
    expect(terms('Allgemeine Sprachwissenschaft/Indogermanistik')).toContain('indogermanistik');
    // Only collective headings may stay without a search word
    const without = uni.filter((f) => f.ebene === 3 && termsOf(f, true).length === 0).map((f) => f.label);
    expect(without.every((l) => /allgemein|Interdisziplinäre|Lernbereich|Sonstige|Orientierungsstudium/.test(l)), without.join('; ')).toBe(true);
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

  it('liest ein Fachwort ohne Rahmenangabe nicht als Fach', () => {
    for (const t of [
      'Politik der Weimarer Republik, 90 Minuten',
      'Die Chemie zwischen den Gruppenmitgliedern stimmt nicht, Teamtraining Klasse 8',
      'Welche Rolle spielt Religion im Alltag, 45 Minuten',
      'Die Geschichte von Hänsel und Gretel nacherzählen, Klasse 2',
      'Der Reifen ist platt: Fahrradwerkstatt Klasse 6',
      'Körperpflege und Hygiene, Klasse 2, 45 Minuten',
      'Musik 20 Minuten hören, dann Vokabeln'
    ]) {
      expect(fach(t), t).toBeNull();
    }
    for (const t of [
      'Seminar Classroom Management für Lehramtsstudierende, 90 Minuten',
      'Hochschuldidaktik: Plastik im Meer, 90 Minuten',
      'Seminar Regie führen im Klassenzimmer, Studierende, 90 Minuten',
      'Seminar Gestaltung von Lernumgebungen, Hochschule',
      'Seminar Neue Medien im Unterricht, Universität',
      'Seminar Transport-Logistik, Hochschule',
      'Seminar Wirtschafts-Ethik, Master'
    ]) {
      expect(fach(t, 'hochschule'), t).toBeNull();
    }
  });

  it('erkennt übliche Schreibweisen', () => {
    expect(fach('Geschichtsunterricht Klasse 8, Industrialisierung')).toMatchObject({ label: 'Geschichte' });
    expect(fach('Physik-Unterricht Klasse 8')).toMatchObject({ label: 'Physik' });
    expect(fach('Informatik-AG: Scratch, 6. Klasse')).toMatchObject({ label: 'Informatik' });
    expect(fach('Werken Klasse 5, Holz sägen')).toMatchObject({ label: 'Werken', fachbereich: 'aesthetik' });
    expect(fach('DaZ Klasse 5: Wortschatz Wohnen')).toMatchObject({ label: 'Deutsch als Zweitsprache' });
    expect(fach('Bruchrechnen, Mathematik, 45 Minuten')).toMatchObject({ label: 'Mathematik' });
    expect(fach('VHS Spanisch A1, Begrüßung')).toMatchObject({ label: 'Spanisch' });
    expect(fach('Physik Klasse 8, Dichte, viele DaZ Schüler')).toMatchObject({ label: 'Physik' });
    expect(fach('Seminar BWL, Kostenrechnung, 30 Studierende', 'hochschule')).toMatchObject({ label: 'Betriebswirtschaftslehre' });
    expect(fach('Vorlesung Medizin, Anatomie des Herzens', 'hochschule')).toMatchObject({ fachbereich: 'nawi-technik' });
    expect(fach('Seminar Kunstgeschichte, Impressionismus', 'hochschule')).toMatchObject({ fachbereich: 'aesthetik' });
    expect(fach('Seminar Germanistik an der Uni, Lyrik', 'hochschule')).toMatchObject({ fachbereich: 'sprachen' });
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

  it('richtet den Fachbereich nach dem erkannten Fach, auch wenn ein anderes Fachwort im Thema steht', () => {
    for (const [t, area] of [
      ['Sport und Ernährung, Biologie Klasse 8, 45 Minuten', 'nawi-technik'],
      ['Die Kunst des Argumentierens, Deutsch Klasse 9', 'sprachen'],
      ['Stunde mit Musik auflockern, Mathe Klasse 5', 'mathe-informatik'],
      ['Die Geschichte der Mathematik, Projekt, Geschichte Klasse 10', 'gesellschaft']
    ] as const) {
      const r = M.lesen(t);
      expect(r.kriterien.fachbereich, t).toBe(area);
      expect(r.fach!.fachbereich, t).toBe(area);
      expect(r.erkannt.filter((e) => e.feld === 'fachbereich').length).toBe(1);
    }
    // An explicitly given subject area still wins
    const r = M.zuordnen({ text: 'Türkisch Klasse 7, Wegbeschreibung, 45 Minuten', fachbereich: 'mathe-informatik' });
    expect(r.kriterien.fachbereich).toBe('mathe-informatik');
  });

  it('arbeitet ohne Fachvokabular wie bisher', () => {
    const plain = createMatcher({ ...D, faecher: undefined }, createValidator(D));
    expect(plain.lesen('Türkisch Klasse 7').fach).toBeUndefined();
    expect(plain.lesen('Mathematik Klasse 7').kriterien.fachbereich).toBe('mathe-informatik');
    expect(createSubjectDetector(undefined).erkenne('Mathematik Klasse 7')).toBeNull();
  });

  it('nennt das erkannte Fach im Ergebnis', () => {
    const r = M.zuordnen({ text: 'Italienisch Klasse 8, Wegbeschreibung, 45 Minuten' });
    expect(r.fach).toMatchObject({ label: 'Italienisch', uri: 'http://w3id.org/openeduhub/vocabs/discipline/20004' });
    expect(M.zuordnen({ text: 'Bruchrechnen Klasse 6, 45 Minuten' }).fach).toBeUndefined();
    expect(M.lesen('Vorlesung Maschinenbau, 90 Minuten').fach).toMatchObject({ quelle: 'hochschulfach' });
  });
});
