import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { merkmalFuer, merkmaleNachWFeld } from '../src/raster.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const D = loadFmtData(path.join(ROOT, 'data'));
const werte = (scheme: string) => {
  const s = D.schemes.find((x) => x.id === scheme)!;
  return s.werte || (s.gruppen || []).flatMap((g) => g.werte);
};

describe('W-Raster', () => {
  it('führt neun W-Felder und fünf Aussagearten in der festgelegten Reihenfolge', () => {
    expect(D.wfelder.map((w) => w.id)).toEqual([
      'lernziele', 'lerninhalte', 'lernende', 'lernbegleitung', 'lernumgebung', 'zeit', 'methode', 'medien', 'ueberpruefung'
    ]);
    expect(D.arten.map((a) => a.id)).toEqual(['bauweise', 'beitrag', 'bedarf', 'eignung', 'einordnung']);
    expect(D.ebenen).toBeUndefined();
  });

  it('jedes Merkmal nennt ein bekanntes W-Feld und eine bekannte Art', () => {
    const wf = new Set(D.wfelder.map((w) => w.id));
    const arten = new Set(D.arten.map((a) => a.id));
    for (const m of D.merkmale) {
      expect(wf.has(m.wfeld), `${m.feld}: W-Feld ${m.wfeld}`).toBe(true);
      expect(arten.has(m.art), `${m.feld}: Art ${m.art}`).toBe(true);
    }
    expect(new Set(D.merkmale.map((m) => m.feld)).size).toBe(D.merkmale.length);
  });

  it('jedes Feld, das an einer Methode vorkommt, hat ein Merkmal oder steht auf der Liste der Verwaltungsfelder', () => {
    const verwaltung = ['kennung', 'name', 'status', 'quellen', 'piktogramm', 'plot', '@context', '@id', 'typ', 'beschreibungsstufe',
      'kurzbeschreibung', 'alternativname', 'problem', 'durchfuehrung', 'variante', 'hinweis', 'qualitaetsrisiko', 'evidenz',
      'kernkomponente', 'slot', 'komposit', 'reichweite', 'steuerung', 'raumhinweis', 'raum', 'lernort', 'eignungsgrund'];
    const keys = new Set(D.bausteine.flatMap((b) => Object.keys(b)));
    for (const k of keys) expect(verwaltung.includes(k) || merkmalFuer(D, k), `Feld ${k}`).toBeTruthy();
  });

  it('merkmalFuer und merkmaleNachWFeld lesen dieselben Merkmale', () => {
    expect(merkmalFuer(D, 'raumbedarf')).toMatchObject({ wfeld: 'lernumgebung', art: 'bedarf', situation: ['raum'] });
    expect(merkmalFuer(D, 'gibtEsNicht')).toBeUndefined();
    const nach = merkmaleNachWFeld(D);
    expect([...nach.keys()]).toEqual(D.wfelder.map((w) => w.id));
    expect(nach.get('methode')!.length).toBeGreaterThanOrEqual(9);
    expect([...nach.values()].flat().length).toBe(D.merkmale.length);
  });

  it('führt die 13 Facetten als Bauweise der Methode, mit vier Ausnahmen beim W-Feld', () => {
    const wo: Record<string, string> = { raumzeit: 'lernumgebung', feedback: 'ueberpruefung', aufgabe: 'lernziele', lernfunktion: 'lernziele' };
    for (const f of D.facetten) {
      const m = merkmalFuer(D, f.feld)!;
      expect(m, f.feld).toBeDefined();
      expect(m.art).toBe('bauweise');
      expect(m.wfeld).toBe(wo[f.feld] || 'methode');
    }
  });

  it('jeder Raumtyp bietet nur Werte aus raumbedarf', () => {
    const erlaubt = new Set(werte('raumbedarf').map((w) => w.id));
    const arten = new Set(werte('fachausstattungart').map((w) => w.id));
    expect(werte('raumtyp')).toHaveLength(12);
    for (const t of werte('raumtyp')) {
      for (const x of t.bietet || []) expect(erlaubt.has(x), `${t.id}: ${x}`).toBe(true);
      if (t.fachausstattungArt) {
        expect(arten.has(t.fachausstattungArt)).toBe(true);
        expect(t.bietet).toContain('fachausstattung');
      }
    }
    expect(werte('raumtyp').find((t) => t.id === 'fachraum')!.fachausstattungArt).toBeUndefined();
  });

  it('jede Zielart nennt Wissensarten aus D1', () => {
    const d1 = new Set(
      D.schemes.find((s) => s.id === 'aufgabenstruktur')!.gruppen!.find((g) => g.id === 'wissensart')!.werte.map((w) => w.id)
    );
    const nachweis = new Set(werte('nachweisform').map((w) => w.id));
    expect(werte('zielart').map((z) => z.id)).toEqual([
      'fakten', 'konzepte', 'prozeduren', 'problemloesen', 'bewegung', 'kondition', 'urteilen', 'gestalten', 'handlung'
    ]);
    for (const z of werte('zielart')) {
      expect(z.wissensart!.length, z.id).toBeGreaterThan(0);
      for (const w of z.wissensart!) expect(d1.has(w), `${z.id}: ${w}`).toBe(true);
      for (const n of z.nachweis || []) expect(nachweis.has(n), `${z.id}: ${n}`).toBe(true);
    }
  });

  it('führt die kleinen Schemata', () => {
    expect(werte('nachweisform').map((w) => w.id)).toEqual(['schriftlich', 'muendlich', 'praktisch', 'produkt']);
    expect(werte('eintragsart').map((w) => w.id)).toEqual(['methode', 'hilfe']);
    expect(werte('fachausstattungart').map((w) => w.id)).toEqual(['sport', 'musik', 'labor', 'werkstatt', 'kueche', 'rechner']);
  });
});
