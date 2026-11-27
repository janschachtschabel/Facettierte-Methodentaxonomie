import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { erstelleRegeln, nurSekundarEvidenz } from '../src/regeln.js';
import type { Baustein } from '../src/types.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const D = loadFmtData(path.join(ROOT, 'data'));
const R = erstelleRegeln(D.regeln);
const b = {
  kennung: 'test',
  name: 'Testmethode',
  anleitung: ['geleitet'],
  sequenz: [],
  feedback: ['fb-lehrkraft'],
  adaptivitaet: ['uniform'],
  schriftbedarf: []
} as unknown as Baustein;
const ids = (m: { regel: string }[]) => m.map((x) => x.regel);

describe('Regelmaschine', () => {
  it('offene Methode bei geringem Vorwissen warnt mit Quelle', () => {
    const m = R.pruefe({ ...b, anleitung: ['offen'], sequenz: ['instruktion-vor-problem'] }, { vorwissen: 'gering' });
    expect(m).toEqual([
      expect.objectContaining({ regel: 'wenig-anleitung-geringes-vorwissen', wirkung: 'warnt', grundlage: 'E', quelle: expect.stringContaining('Tetzlaff') })
    ]);
  });
  it('Ausnahme: Problemlösen vor Instruktion löst die Vorwissensregel nicht aus', () => {
    const m = R.pruefe({ ...b, anleitung: ['offen'], sequenz: ['problem-vor-instruktion'] }, { vorwissen: 'gering' });
    expect(ids(m)).not.toContain('wenig-anleitung-geringes-vorwissen');
  });
  it('offen neben geleitet warnt nicht', () => {
    const m = R.pruefe({ ...b, anleitung: ['offen', 'geleitet'] }, { vorwissen: 'gering' });
    expect(ids(m)).toEqual([]);
  });
  it('komplexer Inhalt ohne Angabe zum Vorwissen feuert nicht', () => {
    const m = R.pruefe({ ...b, anleitung: ['offen'] }, { komplexitaet: 'hoch' });
    expect(ids(m)).not.toContain('wenig-anleitung-komplexer-inhalt');
    const m2 = R.pruefe({ ...b, anleitung: ['offen'] }, { komplexitaet: 'hoch', vorwissen: 'mittel' });
    expect(ids(m2)).toContain('wenig-anleitung-komplexer-inhalt');
  });
  it('Eignung ohne Grund heißt Setzung der Redaktion; mit Grund nennt sie die Quelle', () => {
    const ohne = R.pruefe({ ...b, ungeeignetBeiStufe: ['primar'] }, { bildungsstufe: 'primar' });
    expect(ohne).toEqual([expect.objectContaining({ regel: 'eignung-stufe', wirkung: 'warnt', grundlage: 'A', text: expect.stringContaining('Setzung der Redaktion') })]);
    const mit = R.pruefe(
      { ...b, ungeeignetBeiVorwissen: ['gering'], eignungsgrund: { vorwissen: { text: 'Zu viel Offenheit.', grundlage: 'E', quelle: 'Kirschner 2006' } } },
      { vorwissen: 'gering' }
    );
    expect(mit).toEqual([expect.objectContaining({ regel: 'eignung-vorwissen', grundlage: 'E', quelle: 'Kirschner 2006', text: expect.stringContaining('Zu viel Offenheit') })]);
    const fach = R.pruefe({ ...b, fachbereichUngeeignet: ['sport'] }, { fachbereich: 'sport' });
    expect(ids(fach)).toEqual(['eignung-fach']);
  });
  it('Entdecken ohne Stütze warnt, mit Rückmeldung nicht; Schrift bei A2 warnt', () => {
    expect(ids(R.pruefe({ ...b, anleitung: ['offen'], feedback: [] }, {}))).toEqual(['entdecken-nur-mit-stuetze']);
    expect(ids(R.pruefe({ ...b, anleitung: ['offen'] }, {}))).toEqual([]);
    expect(ids(R.pruefe({ ...b, schriftbedarf: ['liest'] }, { sprachniveau: 'a2' }))).toEqual(['schrift-niedriges-sprachniveau']);
    expect(ids(R.pruefe({ ...b, sequenz: ['problem-vor-instruktion'] }, { bildungsstufe: 'primar' }))).toEqual(['problemloesen-vor-instruktion-primar']);
    expect(ids(R.pruefe({ ...b, anleitung: ['explizit'] }, { vorwissen: 'hoch' }))).toEqual(['viel-anleitung-hohes-vorwissen']);
  });
  it('Text ersetzt {methode}', () => {
    const m = R.pruefe({ ...b, anleitung: ['offen'], feedback: [] }, {});
    expect(m[0].text).toContain('Testmethode');
    expect(m[0].text).not.toContain('{methode}');
    expect(m[0].baustein).toBe('test');
  });
  it('jede Regel der Datei hat Wirkung, Grundlage und Text; jede Regel mit Grundlage E nennt eine Quelle', () => {
    expect(R.alle().length).toBe(16);
    for (const r of R.alle()) {
      expect(r.wirkung, r.id).toBeTruthy();
      expect(r.grundlage, r.id).toBeTruthy();
      expect(r.text.length, r.id).toBeGreaterThan(10);
      expect(r.wfelder.length, r.id).toBeGreaterThan(0);
      if (r.grundlage === 'E') expect(r.quelle, r.id).toBeTruthy();
      expect(R.regel(r.id)).toBe(r);
    }
    expect(R.regel('genannter-wunsch-bleibt')!.text).toMatch(/angenommen/i);
  });
});

describe('nurSekundarEvidenz (eingebaute Regel evidenz-geltung)', () => {
  const mit = (...geltung: string[]) => ({ evidenz: geltung.map((g) => ({ grad: 'C', befund: 'b', quelle: 'q', geltung: g })) }) as unknown as Baustein;

  it('„Schulen“ allgemein heißt nicht nur Sekundarstufe (Tor D2)', () => {
    expect(nurSekundarEvidenz(mit('Allgemeinbildende & berufliche Schulen, Hochschulen'))).toBe(false);
    expect(nurSekundarEvidenz(mit('Schulen und Hochschulen'))).toBe(false);
    expect(nurSekundarEvidenz(mit('Schule und Hochschule'))).toBe(false);
  });

  it('nur Sekundarstufe, berufliche Schulen oder später bleibt nur Sekundarstufe', () => {
    expect(nurSekundarEvidenz(mit('Sekundarstufe und Hochschule'))).toBe(true);
    expect(nurSekundarEvidenz(mit('Hochschule und Sekundarstufe II/Berufsbildung'))).toBe(true);
    expect(nurSekundarEvidenz(mit('Berufliche Schulen und Hochschulen'))).toBe(true);
    expect(nurSekundarEvidenz(mit('Sekundarstufe', 'Primarstufe'))).toBe(false);
  });

  it('in den Daten: diktat-klassisch, vokabeltest-kurzkontrolle und vorlesen-lesung warnen nicht mehr', () => {
    for (const k of ['diktat-klassisch', 'vokabeltest-kurzkontrolle', 'vorlesen-lesung']) {
      expect(nurSekundarEvidenz(D.bausteine.find((b) => b.kennung === k)!), k).toBe(false);
    }
  });
});
