import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import {
  adaptScenario,
  createSearch,
  scoreDifferentiationMatrix,
  suggestAlternativeMethodsForGroup,
  TECH_RANK
} from '../src/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const D = loadFmtData(path.join(ROOT, 'data'));
const techOf = new Map(D.bausteine.map((b) => [b.kennung, b.technik]));

describe('Technikgrenze (Geräte je Gruppe)', () => {
  it('folgt der Rangfolge des Vokabulars', () => {
    const scheme = D.schemes.find((s) => s.id === 'technikbedarf')!;
    for (const w of scheme.werte || []) expect(TECH_RANK[w.id]).toBe(w.rang);
  });

  const matrix = scoreDifferentiationMatrix({ personaId: 'languageAndCulture', limit: 10 });
  const geteilt = D.bausteine.filter((b) => b.technik === 't-geteilt');

  it('Alternativen bei maxTechnik Projektion brauchen keine Geräte je Gruppe', () => {
    for (const current of geteilt.concat(D.bausteine.filter((b) => b.technik === 't-einzeln'))) {
      const alt = suggestAlternativeMethodsForGroup(matrix, current, D.bausteine, 50, undefined, { maxTechnik: 't-projektion' });
      for (const a of alt) expect(['t-keine', 't-projektion']).toContain(techOf.get(a.kennung));
    }
  });

  it('Alternativen bei maxTechnik Geräte je Gruppe brauchen kein Gerät je Person', () => {
    for (const current of D.bausteine.filter((b) => b.technik !== 't-keine')) {
      const alt = suggestAlternativeMethodsForGroup(matrix, current, D.bausteine, 50, undefined, { maxTechnik: 't-geteilt' });
      for (const a of alt) expect(techOf.get(a.kennung)).not.toBe('t-einzeln');
    }
  });

  it('Methodenvorschläge der Anpassung halten die Grenze Geräte je Gruppe ein', () => {
    const res = adaptScenario(D, {
      scenarioText: 'Gruppenarbeit mit Tablets zur Fotosynthese',
      lerngruppenText: '5 DaZ-Kinder, 3 leistungsstarke',
      maxTechnik: 't-geteilt'
    });
    const all = JSON.stringify(res);
    const ids = D.bausteine.filter((b) => b.technik === 't-einzeln').map((b) => b.kennung);
    for (const p of res.phasenAnpassungen || []) {
      for (const m of p.passendeFmtMethoden || []) expect(ids).not.toContain(m.kennung);
    }
    expect(all.length).toBeGreaterThan(0);
  });
});

describe('Suche nach Fachbereich', () => {
  const search = createSearch(D);
  it('fuerFachbereich liefert Methoden des Bereichs und fachübergreifende, ohne unpassende', () => {
    const hits = search.suche({ fuerFachbereich: 'sport' });
    expect(hits.length).toBeGreaterThan(6);
    for (const b of hits) {
      expect((b.fachbereich || []).some((f) => f === 'sport' || f === 'uebergreifend')).toBe(true);
      expect(b.fachbereichUngeeignet || []).not.toContain('sport');
    }
    expect(hits.some((b) => (b.fachbereich || []).includes('sport'))).toBe(true);
  });
  it('fachbereich bleibt ein strenger Filter', () => {
    const hits = search.suche({ fachbereich: 'sport' });
    for (const b of hits) expect(b.fachbereich).toContain('sport');
  });
});

describe('Anpassung liefert Teilgruppen-Methoden und Zusatzphasen wie Schritt 3 des Baukastens', () => {
  const phasen = ['kugellager', 'sos-modell', 'uebung-variation', 'verschachteltes-ueben'].map((k, i) => ({
    key: `step-${i}`,
    phaseLabel: k,
    baustein: k,
    durationMin: 20
  }));
  const res = adaptScenario(D, {
    phasen,
    gruppen: [
      { id: 'regel', label: 'Regelgruppe', personaId: 'average' },
      { id: 'daz', label: 'DaZ', personaId: 'languageAndCulture' }
    ]
  });

  it('schlägt Zusatzphasen für alle vor und tauscht nie die Methode der Regelgruppe', () => {
    expect(Array.isArray(res.teilgruppenMethoden)).toBe(true);
    expect(res.zusatzphasen.length).toBeGreaterThan(0);
    for (const t of res.teilgruppenMethoden) expect(t.groupId).not.toBe('regel');
    for (const z of res.zusatzphasen) expect(z.groupIds).not.toContain('regel');
  });

  it('ohne Methoden in den Phasen gibt es keine Vorschläge', () => {
    const frei = adaptScenario(D, { scenarioText: 'Stunde zur Fotosynthese', lerngruppenText: '4 DaZ-Kinder' });
    expect(frei.teilgruppenMethoden).toEqual([]);
    expect(frei.zusatzphasen).toEqual([]);
  });

  it('hält einen unpassenden Fachbereich aus allen Methodenvorschlägen heraus', () => {
    const unpassend = new Set(D.bausteine.filter((b) => (b.fachbereichUngeeignet || []).includes('mathe-informatik')).map((b) => b.kennung));
    expect(unpassend.size).toBeGreaterThan(0);
    const r = adaptScenario(D, { phasen, fachbereich: 'mathe-informatik', lerngruppenText: '5 DaZ-Kinder, 3 leistungsstarke' });
    for (const t of r.teilgruppenMethoden) expect(unpassend.has(t.zuKennung)).toBe(false);
    for (const z of r.zusatzphasen) expect(unpassend.has(z.kennung)).toBe(false);
    for (const p of r.phasenAnpassungen)
      for (const tg of p.teilgruppenImpulse) for (const a of tg.alternativeMethoden) expect(unpassend.has(a.kennung)).toBe(false);
  });
});
