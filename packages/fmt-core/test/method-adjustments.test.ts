import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import {
  proposeMethodAdjustments,
  QUICK_LEARNER_GROUP_PROFILES,
  scoreDifferentiationMatrix,
  scoreMethodForGroup,
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

// Bruchrechnen-Ablauf: durchgehend „geleitet“, also schwache Passung für Gruppen mit Bedarf an expliziter Anleitung.
const PHASES: MethodAdjustmentPhase[] = ['kugellager', 'sos-modell', 'uebung-variation', 'verschachteltes-ueben']
  .map((k) => D.bausteine.find((b) => b.kennung === k))
  .filter(Boolean)
  .map((b, i) => ({ key: `s${i}`, label: b!.name, block: b!, durationMin: 20 }));

describe('proposeMethodAdjustments', () => {
  it('nutzt für den Test einen Ablauf mit mindestens drei Phasen', () => {
    expect(PHASES.length).toBeGreaterThanOrEqual(3);
  });

  it('schlägt ohne Teilgruppen nichts vor und ändert nie die Regelgruppe', () => {
    expect(proposeMethodAdjustments(D.bausteine, PHASES, [MAIN])).toEqual([]);
    const adj = proposeMethodAdjustments(D.bausteine, PHASES, [MAIN, quick('daz')]);
    expect(adj.every((a) => a.groupId === 'daz')).toBe(true);
  });

  it('ersetzt schwach passende Methoden durch klar besser passende derselben Lernfunktion', () => {
    const adj = proposeMethodAdjustments(D.bausteine, PHASES, [MAIN, quick('daz')]);
    expect(adj.length).toBeGreaterThan(0);
    const matrix = scoreDifferentiationMatrix({ selectedValues: quick('daz').selectedValues, limit: 10 });
    for (const a of adj) {
      const von = block(a.vonKennung);
      const zu = block(a.zuKennung);
      expect(zu.lernfunktion.some((f) => von.lernfunktion.includes(f))).toBe(true);
      expect(scoreMethodForGroup(zu, matrix).fit - scoreMethodForGroup(von, matrix).fit).toBeGreaterThanOrEqual(3);
      expect(a.grund).not.toBe('');
      expect(PHASES.some((p) => p.block!.kennung === a.zuKennung)).toBe(false);
    }
  });

  it('verlangt nie mehr Technik, Internet oder KI als die ersetzte Methode', () => {
    for (const p of QUICK_LEARNER_GROUP_PROFILES) {
      for (const a of proposeMethodAdjustments(D.bausteine, PHASES, [MAIN, quick(p.id)])) {
        const von = block(a.vonKennung);
        const zu = block(a.zuKennung);
        expect(['t-keine', 't-projektion'].includes(zu.technik) || zu.technik === von.technik).toBe(true);
        expect(zu.internet && !von.internet).toBe(false);
        expect(Boolean(zu.ki) && !von.ki).toBe(false);
      }
    }
  });

  it('gibt Gruppen mit Unterstützungsbedarf keine völlig offene Methode', () => {
    for (const p of QUICK_LEARNER_GROUP_PROFILES) {
      const matrix = scoreDifferentiationMatrix({ personaId: p.personaId, selectedValues: p.selectedValues, limit: 10 });
      if (!matrix.didacticProfile.needsScaffolding) continue;
      for (const a of proposeMethodAdjustments(D.bausteine, PHASES, [MAIN, quick(p.id)])) {
        expect(block(a.zuKennung).anleitung.some((x) => x === 'explizit' || x === 'geleitet')).toBe(true);
      }
    }
  });

  it('lässt gesperrte Phasen und Gruppen ohne Profil unverändert', () => {
    const locked = PHASES.map((p) => ({ ...p, locked: true }));
    expect(proposeMethodAdjustments(D.bausteine, locked, [MAIN, quick('daz')])).toEqual([]);
    expect(proposeMethodAdjustments(D.bausteine, PHASES, [MAIN, { id: 'x', label: 'Eigene Gruppe' }])).toEqual([]);
  });

  it('vergibt je Gruppe keine Methode doppelt und ist deterministisch', () => {
    const run = () => proposeMethodAdjustments(D.bausteine, PHASES, [MAIN, quick('daz'), quick('adhs')]);
    const adj = run();
    for (const g of ['daz', 'adhs']) {
      const ids = adj.filter((a) => a.groupId === g).map((a) => a.zuKennung);
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(run()).toEqual(adj);
  });
});
