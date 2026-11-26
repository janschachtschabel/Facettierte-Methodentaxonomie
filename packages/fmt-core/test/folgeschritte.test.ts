import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import {
  adaptScenario,
  KennungIndex,
  migrateKennungen,
  oehDisciplinesForFachbereich,
  createValidator,
  proposeAdditionalPhases,
  QUICK_LEARNER_GROUP_PROFILES,
  resolveKennung,
  type MethodAdjustmentGroup,
  type MethodAdjustmentPhase
} from '../src/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const D = loadFmtData(path.join(ROOT, 'data'));
const block = (kennung: string) => {
  const b = D.bausteine.find((x) => x.kennung === kennung);
  if (!b) throw new Error(`Baustein ${kennung} fehlt`);
  return b;
};
const quick = (id: string): MethodAdjustmentGroup => {
  const p = QUICK_LEARNER_GROUP_PROFILES.find((x) => x.id === id)!;
  return { id: p.id, label: p.label, personaId: p.personaId, selectedValues: p.selectedValues };
};
const MAIN: MethodAdjustmentGroup = { id: 'regel', label: 'Regelgruppe', isMain: true, personaId: 'average' };
const phases = (...ids: string[]): MethodAdjustmentPhase[] =>
  ids.map((k, i) => ({ key: `step-${i}`, label: block(k).name, block: block(k), durationMin: 20 }));

// Geleiteter Einstieg, keine Lernstandsphase.
const PLAN = phases('kugellager', 'sos-modell', 'uebung-variation', 'verschachteltes-ueben');

describe('Zusätzliche Phasen für alle', () => {
  it('schlägt ohne Teilgruppe mit Profil nichts vor', () => {
    expect(proposeAdditionalPhases(D.bausteine, PLAN, [MAIN])).toEqual([]);
    expect(proposeAdditionalPhases(D.bausteine, PLAN, [MAIN, { id: 'x', label: 'Eigene Gruppe' }])).toEqual([]);
  });

  it('schlägt eine kurze Lernstandsphase am Ende vor, wenn der Ablauf keine hat', () => {
    const out = proposeAdditionalPhases(D.bausteine, PLAN, [MAIN, quick('daz')]);
    const end = out.find((p) => p.art === 'lernstand');
    expect(end).toBeTruthy();
    expect(end!.position).toBe('ende');
    const b = block(end!.kennung);
    expect(b.nachbedingung).toContain('lernstand-diagnostiziert');
    expect(b.dauerMin).toBeLessThanOrEqual(5);
    expect(end!.dauerMin).toBeGreaterThanOrEqual(b.dauerMin);
    expect(end!.dauerMin).toBeLessThanOrEqual(b.dauerMax);
    expect(end!.groupIds).toEqual(['daz']);
    expect(end!.grund).not.toMatch(/diagnose|nachbedingung|lernfunktion/);
  });

  it('schlägt keine Lernstandsphase vor, wenn der Ablauf schon eine enthält', () => {
    const out = proposeAdditionalPhases(D.bausteine, [...PLAN, ...phases('exit-ticket')], [MAIN, quick('daz')]);
    expect(out.some((p) => p.art === 'lernstand')).toBe(false);
  });

  it('behält den Vorschlag fürs Ende, wenn der Einstieg übernommen ist', () => {
    const first = proposeAdditionalPhases(D.bausteine, PLAN, [MAIN, quick('daz')]);
    const start = first.find((p) => p.art === 'vorwissen')!;
    const withStart = [...phases(start.kennung), ...PLAN];
    const next = proposeAdditionalPhases(D.bausteine, withStart, [MAIN, quick('daz')]);
    expect(next.map((p) => p.art)).toEqual(['lernstand']);
  });

  it('schlägt Gruppen mit Unterstützungsbedarf einen klar angeleiteten Vorwissens-Einstieg vor', () => {
    const out = proposeAdditionalPhases(D.bausteine, PLAN, [MAIN, quick('daz')]);
    const start = out.find((p) => p.art === 'vorwissen');
    expect(start).toBeTruthy();
    expect(start!.position).toBe('anfang');
    const b = block(start!.kennung);
    expect(b.anleitung).toContain('explizit');
    expect(b.nachbedingung).toContain('vorwissen-aktiviert');
    expect(b.lernfunktion).toContain('diagnose');
  });

  it('nimmt für das Ende keine Einstiegsmethode', () => {
    for (const p of QUICK_LEARNER_GROUP_PROFILES) {
      for (const x of proposeAdditionalPhases(D.bausteine, PLAN, [MAIN, quick(p.id)])) {
        if (x.art === 'lernstand') expect(block(x.kennung).nachbedingung, `${p.id} ${x.kennung}`).not.toContain('vorwissen-aktiviert');
      }
    }
  });

  it('lässt den Einstieg, wenn der Ablauf schon klar angeleitet Vorwissen aktiviert', () => {
    const plan = [...phases('rosenshine-daily-review'), ...PLAN];
    const out = proposeAdditionalPhases(D.bausteine, plan, [MAIN, quick('daz')]);
    expect(out.some((p) => p.art === 'vorwissen')).toBe(false);
  });

  it('bleibt im Rahmen: kurz, ohne zusätzliche Geräte, Internet oder KI, nichts doppelt, deterministisch', () => {
    for (const p of QUICK_LEARNER_GROUP_PROFILES) {
      const run = () => proposeAdditionalPhases(D.bausteine, PLAN, [MAIN, quick(p.id)], { fachbereich: 'mathe-informatik' });
      const out = run();
      expect(run()).toEqual(out);
      expect(new Set(out.map((x) => x.kennung)).size).toBe(out.length);
      for (const x of out) {
        const b = block(x.kennung);
        expect(['t-keine', 't-projektion']).toContain(b.technik);
        expect(b.internet).toBe(false);
        expect(Boolean(b.ki)).toBe(false);
        expect(b.dauerMin).toBeLessThanOrEqual(5);
        expect((b.fachbereichUngeeignet || []).includes('mathe-informatik')).toBe(false);
        expect(PLAN.some((ph) => ph.block!.kennung === x.kennung)).toBe(false);
      }
    }
  });
});

describe('Fachbereich und OEH/WLO-Fächer', () => {
  it('liefert zu einem Fachbereich die OEH-Fächer aus dem Crosswalk', () => {
    const sprachen = oehDisciplinesForFachbereich(D.faecher, 'sprachen');
    expect(sprachen.map((s) => s.label)).toEqual(expect.arrayContaining(['Deutsch', 'Englisch', 'Deutsch als Zweitsprache']));
    expect(sprachen.every((s) => s.uri.startsWith('http://w3id.org/openeduhub/vocabs/discipline/'))).toBe(true);
    expect(oehDisciplinesForFachbereich(D.faecher, 'mathe-informatik').map((s) => s.label).sort()).toEqual(['Informatik', 'Mathematik']);
    expect(oehDisciplinesForFachbereich(D.faecher, 'sport').map((s) => s.label)).toEqual(['Sport']);
  });

  it('gibt für „fachübergreifend“, unbekannte Bereiche und fehlenden Crosswalk keinen Filter', () => {
    expect(oehDisciplinesForFachbereich(D.faecher, 'uebergreifend')).toEqual([]);
    expect(oehDisciplinesForFachbereich(D.faecher, 'gibt-es-nicht')).toEqual([]);
    expect(oehDisciplinesForFachbereich(undefined, 'sprachen')).toEqual([]);
  });

  it('deckt jeden fachlichen Bereich mit mindestens einem OEH-Fach ab', () => {
    const areas = (D.schemes.find((s) => s.id === 'fachbereich')!.werte || []).map((w) => w.id).filter((id) => id !== 'uebergreifend');
    expect(areas.length).toBe(7);
    for (const a of areas) expect(oehDisciplinesForFachbereich(D.faecher, a).length, a).toBeGreaterThan(0);
  });
});

describe('Frühere Kennungen', () => {
  it('leitet die zusammengeführte Dublette auf die gültige Kennung um', () => {
    expect(D.weiterleitungen?.['dreischritt-interview']).toBe('drei-schritt-interview');
    expect(resolveKennung('dreischritt-interview', D.weiterleitungen)).toBe('drei-schritt-interview');
    expect(resolveKennung('drei-schritt-interview', D.weiterleitungen)).toBe('drei-schritt-interview');
    expect(resolveKennung('kugellager', undefined)).toBe('kugellager');
  });

  it('beantwortet Nachschlagen mit der früheren Kennung, ohne sie aufzulisten', () => {
    const index = new KennungIndex(D.bausteine.map((b) => [b.kennung, b] as const), D.weiterleitungen);
    expect(index.get('dreischritt-interview')?.kennung).toBe('drei-schritt-interview');
    expect(index.has('dreischritt-interview')).toBe(true);
    expect(index.has('gibt-es-nicht')).toBe(false);
    expect(index.size).toBe(D.bausteine.length);
    expect([...index.keys()]).not.toContain('dreischritt-interview');
  });

  it('schreibt frühere Kennungen in gespeicherten Abläufen um', () => {
    const alt = {
      typ: 'Arrangement',
      name: 'Alt',
      reichweite: 'r3',
      ablauf: {
        typ: 'Sequenz',
        teile: [
          { typ: 'Einsatz', baustein: 'dreischritt-interview', dauerMin: 15 },
          { typ: 'Alternative', optionen: [{ typ: 'Einsatz', baustein: 'dreischritt-interview', dauerMin: 10 }] },
          { typ: 'Einsatz', baustein: 'exit-ticket', dauerMin: 5 }
        ]
      }
    };
    const neu = migrateKennungen(alt, D.weiterleitungen);
    expect(JSON.stringify(neu)).not.toContain('dreischritt-interview');
    expect(JSON.stringify(neu).match(/drei-schritt-interview/g)).toHaveLength(2);
    expect(alt.ablauf.teile[0].baustein).toBe('dreischritt-interview');
    const unchanged = { typ: 'Einsatz', baustein: 'exit-ticket' };
    expect(migrateKennungen(unchanged, D.weiterleitungen)).toBe(unchanged);
  });

  it('prüft einen Ablauf mit früherer Kennung wie mit der gültigen', () => {
    const plan = (id: string) =>
      ({ typ: 'Arrangement', name: 'P', reichweite: 'r3', ablauf: { typ: 'Sequenz', teile: [{ typ: 'Einsatz', baustein: id, dauerMin: 15 }] } }) as never;
    const v = createValidator(D);
    expect(v.validate(plan('dreischritt-interview'), {})).toEqual(v.validate(plan('drei-schritt-interview'), {}));
  });

  it('kennt die frühere Kennung auch bei der Anpassung eines Szenarios', () => {
    const run = (id: string) => adaptScenario(D, { baustein: id, lerngruppenText: '5 DaZ-Kinder' });
    const alt = run('dreischritt-interview');
    const neu = run('drei-schritt-interview');
    expect(JSON.stringify({ ...alt, dauerMs: 0 }).length).toBe(JSON.stringify({ ...neu, dauerMs: 0 }).length);
  });

  it('zeigt nur auf vorhandene Methoden und nie von einer vorhandenen weg', () => {
    const ids = new Set(D.bausteine.map((b) => b.kennung));
    for (const [alt, neu] of Object.entries(D.weiterleitungen || {})) {
      expect(ids.has(neu), neu).toBe(true);
      expect(ids.has(alt), alt).toBe(false);
    }
  });
});
