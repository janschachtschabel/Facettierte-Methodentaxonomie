import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import {
  adaptScenario,
  bereinigeProfil,
  createMatcher,
  createValidator,
  entscheideTeilgruppe,
  erfuelltRichtung,
  erstelleRegeln,
  istGleichwertig,
  baueSituation,
  proposeMethodAdjustments,
  proposeSupports,
  QUICK_LEARNER_GROUP_PROFILES,
  scoreDifferentiationMatrix,
  teilgruppenAntworten,
  teilgruppenHinweise,
  teilgruppenProfil,
  type AdaptScenarioResult,
  type MethodAdjustmentGroup,
  type MethodAdjustmentPhase
} from '../src/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const D = loadFmtData(path.join(ROOT, 'data'));
const M = createMatcher(D, createValidator(D));
const R = { teilgruppen: D.teilgruppen, regeln: D.regeln, schemes: D.schemes };
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
const phasen = (...ids: string[]): MethodAdjustmentPhase[] =>
  ids.map((k, i) => ({ key: `s${i}`, label: block(k).name, block: block(k), durationMin: 20 }));

// Bruchrechnen-Ablauf: durchgehend „geleitet“; früher schwache Matrix-Passung für Gruppen mit Bedarf an expliziter Anleitung.
const PHASES = phasen('kugellager', 'sos-modell', 'uebung-variation', 'verschachteltes-ueben');
// Ablauf mit Methoden, die nur explizit und uniform anleiten (Lehrervortrag, Abrufquiz): löst bei hohem Vorwissen den Tausch aus.
const EXPLIZIT = phasen('lehrervortrag', 'abrufquiz', 'uebung-variation');

/** Plan of the matcher for a quality case text, adapted for the subgroup in lerngruppenText. */
function adaptiere(text: string, lerngruppenText: string): AdaptScenarioResult {
  const r = M.zuordnen({ text });
  if (r.modus !== 'ablauf' || !r.arrangement) throw new Error(`kein Ablauf für ${text}`);
  return adaptScenario(D, { arrangement: r.arrangement, lerngruppenText });
}
const impulse = (res: AdaptScenarioResult, groupId: string) =>
  res.phasenAnpassungen.flatMap((p) => p.teilgruppenImpulse.filter((t) => t.groupId === groupId).map((t) => ({ ...t, phase: p })));

describe('proposeMethodAdjustments', () => {
  it('nutzt für den Test einen Ablauf mit mindestens drei Phasen', () => {
    expect(PHASES.length).toBeGreaterThanOrEqual(3);
  });

  it('schlägt ohne Teilgruppen nichts vor und ändert nie die Regelgruppe', () => {
    expect(proposeMethodAdjustments(D.bausteine, PHASES, [MAIN], {}, R)).toEqual([]);
    const adj = proposeMethodAdjustments(D.bausteine, EXPLIZIT, [MAIN, quick('vertiefung')], {}, R);
    expect(adj.every((a) => a.groupId === 'vertiefung')).toBe(true);
  });

  // Früher: „ersetzt schwach passende Methoden durch klar besser passende derselben Lernfunktion“ (WEAK_FIT/MIN_GAIN).
  it('tauscht nicht mehr allein wegen schwacher Matrix-Passung: DaZ im geleiteten Ablauf behält die Methode', () => {
    expect(proposeMethodAdjustments(D.bausteine, PHASES, [MAIN, quick('daz')], {}, R)).toEqual([]);
    expect(proposeSupports(PHASES, [MAIN, quick('daz')], R).length).toBeGreaterThan(0);
  });

  it('tauscht nur bei der Antwort tausch; der Ersatz erfüllt die Richtung, ist gleichwertig und nennt Merkmal und Beleg', () => {
    const regeln = erstelleRegeln(D.regeln);
    let gesehen = 0;
    // Two teachers: most catalogue methods are organised by the teacher, so with one teacher few pairs run side by side.
    for (const lehrende of [1, 2]) for (const p of QUICK_LEARNER_GROUP_PROFILES) {
      const g = quick(p.id);
      for (const ablauf of [PHASES, EXPLIZIT, phasen('erfindungsaufgabe', 'open-space')]) {
        for (const a of proposeMethodAdjustments(D.bausteine, ablauf, [MAIN, g], { lehrende }, R)) {
          gesehen++;
          const von = block(a.vonKennung);
          const zu = block(a.zuKennung);
          const profil = bereinigeProfil(teilgruppenProfil(g, D.teilgruppen), D.teilgruppen).profil;
          const e = entscheideTeilgruppe(von, profil, D.teilgruppen);
          expect(e.antwort, `${p.id} ${a.vonKennung}`).toBe('tausch');
          expect(a.merkmal).toBe(e.merkmal);
          expect(a.grundlage).toBe(e.grundlage);
          if (e.quelle) expect(a.quelle).toBe(e.quelle);
          expect(erfuelltRichtung(zu, e.richtung!)).toBe(true);
          const ctx = { anfrage: {}, situation: baueSituation({}, D), dauerMin: 20, profil, lehrende, data: D, regeln, t: D.teilgruppen };
          expect(istGleichwertig(zu, von, ctx).ok, `${a.zuKennung} statt ${a.vonKennung}`).toBe(true);
          expect(zu.lernfunktion.some((f) => von.lernfunktion.includes(f))).toBe(true);
          expect(ablauf.some((x) => x.block!.kennung === a.zuKennung)).toBe(false);
          expect(a.grund).not.toBe('');
        }
      }
    }
    expect(gesehen).toBeGreaterThan(0);
  });

  it('verlangt nie mehr Technik, Internet oder KI als die ersetzte Methode', () => {
    for (const p of QUICK_LEARNER_GROUP_PROFILES) {
      for (const a of proposeMethodAdjustments(D.bausteine, EXPLIZIT, [MAIN, quick(p.id)], { lehrende: 2 }, R)) {
        const von = block(a.vonKennung);
        const zu = block(a.zuKennung);
        expect(['t-keine', 't-projektion'].includes(zu.technik) || zu.technik === von.technik).toBe(true);
        expect(zu.internet && !von.internet).toBe(false);
        expect(Boolean(zu.ki) && !von.ki).toBe(false);
      }
    }
  });

  it('hält die Technikgrenze der ersetzten Methode auch bei gesetztem maxTechnik', () => {
    for (const p of QUICK_LEARNER_GROUP_PROFILES) {
      for (const a of proposeMethodAdjustments(D.bausteine, EXPLIZIT, [MAIN, quick(p.id)], { maxTechnik: 't-einzeln', lehrende: 2 }, R)) {
        const zu = block(a.zuKennung);
        expect(['t-keine', 't-projektion'].includes(zu.technik) || zu.technik === block(a.vonKennung).technik).toBe(true);
      }
    }
  });

  it('gibt Gruppen mit Unterstützungsbedarf keine völlig offene Methode', () => {
    for (const p of QUICK_LEARNER_GROUP_PROFILES) {
      const matrix = scoreDifferentiationMatrix({ personaId: p.personaId, selectedValues: p.selectedValues, limit: 10 });
      if (!matrix.didacticProfile.needsScaffolding) continue;
      for (const ablauf of [PHASES, EXPLIZIT, phasen('erfindungsaufgabe', 'open-space')]) {
        for (const a of proposeMethodAdjustments(D.bausteine, ablauf, [MAIN, quick(p.id)], { lehrende: 2 }, R)) {
          expect(block(a.zuKennung).anleitung.some((x) => x === 'explizit' || x === 'geleitet')).toBe(true);
        }
      }
    }
  });

  it('lässt gesperrte Phasen und Gruppen ohne Profil unverändert', () => {
    const locked = EXPLIZIT.map((p) => ({ ...p, locked: true }));
    expect(proposeMethodAdjustments(D.bausteine, EXPLIZIT, [MAIN, quick('vertiefung')], { lehrende: 2 }, R).length).toBeGreaterThan(0);
    expect(proposeMethodAdjustments(D.bausteine, locked, [MAIN, quick('vertiefung')], { lehrende: 2 }, R)).toEqual([]);
    expect(proposeMethodAdjustments(D.bausteine, EXPLIZIT, [MAIN, { id: 'x', label: 'Eigene Gruppe' }], {}, R)).toEqual([]);
  });

  it('vergibt je Gruppe keine Methode doppelt und ist deterministisch', () => {
    const run = () => proposeMethodAdjustments(D.bausteine, EXPLIZIT, [MAIN, quick('vertiefung'), quick('foerder-lernen')], { lehrende: 2 }, R);
    const adj = run();
    for (const g of ['vertiefung', 'foerder-lernen']) {
      const ids = adj.filter((a) => a.groupId === g).map((a) => a.zuKennung);
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(run()).toEqual(adj);
  });

  it('eine Gruppe, die sich nicht frei bewegen kann, bekommt für eine Methode mit Bewegungsfläche einen formalen Tausch', () => {
    const bewegt = D.bausteine.filter((b) => (b.raumbedarf || []).includes('bewegungsflaeche') && !b.komposit && !(b.slot || []).length);
    expect(bewegt.length).toBeGreaterThan(0);
    const g: MethodAdjustmentGroup = { id: 'rolli', label: 'Rollstuhl', ohneBewegung: true };
    const adj = bewegt.flatMap((b) => proposeMethodAdjustments(D.bausteine, phasen(b.kennung), [MAIN, g], {}, R));
    expect(adj.length).toBeGreaterThan(0);
    for (const a of adj) {
      expect(a.grundlage).toBe('formal');
      expect(erfuelltRichtung(block(a.zuKennung), 'ohne-bewegung')).toBe(true);
    }
  });

  it('Tausch ohne gleichwertigen Ersatz wird zur Hilfe und sagt, warum kein Ersatz kam', () => {
    let rueckfall = 0;
    for (const p of QUICK_LEARNER_GROUP_PROFILES) {
      const g = quick(p.id);
      const profil = teilgruppenProfil(g, D.teilgruppen);
      for (const b of D.bausteine.filter((x) => !x.komposit).slice(0, 120)) {
        const ablauf = phasen(b.kennung);
        for (const a of teilgruppenAntworten(D.bausteine, ablauf, [MAIN, g], {}, R)) {
          // Never a bare swap.
          if (a.antwort === 'tausch') expect(a.alternativen.length, `${p.id} ${b.kennung}`).toBeGreaterThan(0);
          const e = entscheideTeilgruppe(b, profil, D.teilgruppen);
          if (e.antwort === 'tausch' && a.antwort !== 'tausch') {
            rueckfall++;
            expect(a.antwort).toBe('hilfe');
            expect(a.grund).toMatch(/^Kein gleichwertiger Ersatz: /);
            expect(a.grund).toContain(e.grund);
            expect(a.merkmal).toBe(e.merkmal);
            expect(a.hilfen.length).toBeGreaterThan(0);
            for (const h of a.hilfen) expect(h.abbau.length).toBeGreaterThan(10);
          }
        }
      }
    }
    expect(rueckfall).toBeGreaterThan(0);
  });

  it('eine festgelegte Phase tauscht nie; die Gruppe bekommt dort eine Hilfe', () => {
    const fest = EXPLIZIT.map((p) => ({ ...p, locked: true }));
    const a = teilgruppenAntworten(D.bausteine, fest, [MAIN, quick('vertiefung')], { lehrende: 2 }, R).find((x) => x.stepKey === 's0')!;
    expect(a.antwort).toBe('hilfe');
    expect(a.grund).toMatch(/^Kein gleichwertiger Ersatz: Die Phase ist für alle festgelegt/);
    expect(proposeSupports(fest, [MAIN, quick('vertiefung')], R, {}, undefined, D.bausteine).some((s) => s.stepKey === 's0')).toBe(true);
  });
});

describe('proposeSupports', () => {
  it('Hilfen sind Kern-Maßnahmen der Matrix, passen zur Interaktion, höchstens drei je Phase, jede mit Abbau-Satz', () => {
    const sup = proposeSupports(PHASES, [MAIN, quick('daz')], R);
    expect(sup.length).toBeGreaterThan(0);
    const matrix = scoreDifferentiationMatrix({ selectedValues: quick('daz').selectedValues, limit: 50 });
    const kern = new Set(matrix.byOberKategorie.flatMap((o) => o.measures).filter((m) => m.relevanz === 'kern').map((m) => m.id));
    const abbauTexte = new Set(Object.values(D.teilgruppen.abbau));
    for (const s of sup) {
      expect(s.antwort).toBe('hilfe');
      expect(s.groupId).toBe('daz');
      expect(s.hilfen.length).toBeGreaterThan(0);
      expect(s.hilfen.length).toBeLessThanOrEqual(3);
      expect(s.grundlage).toBe('E');
      expect(s.quelle).toContain('Höfler');
      for (const h of s.hilfen) {
        expect(kern.has(h.id), h.id).toBe(true);
        expect(abbauTexte.has(h.abbau), h.abbau).toBe(true);
      }
    }
    // Pure solo method: no group or plenary measure.
    for (const s of proposeSupports(phasen('abrufquiz'), [MAIN, quick('daz')], R)) {
      for (const h of s.hilfen) expect(['sozialform-gruppe', 'sozialform-plenum']).not.toContain(h.id);
    }
  });

  it('die Regelgruppe bleibt in jedem Fall unverändert', () => {
    for (const p of QUICK_LEARNER_GROUP_PROFILES) {
      for (const ablauf of [PHASES, EXPLIZIT]) {
        const gruppen = [MAIN, quick(p.id)];
        const adj = proposeMethodAdjustments(D.bausteine, ablauf, gruppen, {}, R);
        const sup = proposeSupports(ablauf, gruppen, R);
        expect(adj.some((a) => a.groupId === 'regel')).toBe(false);
        expect(sup.some((s) => s.groupId === 'regel')).toBe(false);
        expect(teilgruppenHinweise(ablauf, gruppen, adj, sup, R).some((m) => m.text.startsWith('Regelgruppe'))).toBe(false);
      }
    }
    // Even with a profile that would set off a swap, the main group keeps its plan.
    const starkeHaupt: MethodAdjustmentGroup = { ...MAIN, personaId: undefined, selectedValues: { vorwissen: 'vorwissen-hoch' } };
    expect(proposeMethodAdjustments(D.bausteine, EXPLIZIT, [starkeHaupt], {}, R)).toEqual([]);
    expect(proposeSupports(EXPLIZIT, [starkeHaupt], R)).toEqual([]);
    const res = adaptScenario(D, {
      phasen: EXPLIZIT.map((p) => ({ key: p.key, phaseLabel: p.label!, baustein: p.block!.kennung, durationMin: 20 })),
      gruppen: [
        { id: 'regel', label: 'Regelgruppe', personaId: 'average' },
        { id: 'vertiefung', label: 'Leistungsstark', selectedValues: quick('vertiefung').selectedValues }
      ]
    });
    for (const t of impulse(res, 'regel')) {
      expect(t.antwort).toBe('passt');
      expect(t.hilfen).toEqual([]);
      expect(t.alternativeMethoden).toEqual([]);
    }
    expect(res.teilgruppenMethoden.some((a) => a.groupId === 'regel')).toBe(false);
  });
});

describe('teilgruppenHinweise', () => {
  it('Teilgruppe ohne Tausch und ohne Hilfe bekommt den Hinweis gruppierung-nur-mit-anpassung', () => {
    const g: MethodAdjustmentGroup = { id: 'basis', label: 'Basis', selectedValues: { vorwissen: 'vorwissen-gering' } };
    const gruppen = [MAIN, g];
    const adj = proposeMethodAdjustments(D.bausteine, PHASES, gruppen, {}, R);
    const sup = proposeSupports(PHASES, gruppen, R);
    expect(adj).toEqual([]);
    expect(sup).toEqual([]);
    const h = teilgruppenHinweise(PHASES, gruppen, adj, sup, R).find((m) => m.regel === 'gruppierung-nur-mit-anpassung');
    expect(h).toMatchObject({ wirkung: 'weist-hin', grundlage: 'E' });
    expect(h!.quelle).toContain('Lou');
    expect(h!.text).toContain('Basis');
    // With a help the hint does not come.
    const daz = [MAIN, quick('daz')];
    const supDaz = proposeSupports(PHASES, daz, R);
    expect(teilgruppenHinweise(PHASES, daz, [], supDaz, R).some((m) => m.regel === 'gruppierung-nur-mit-anpassung')).toBe(false);
  });

  it('Gruppe mit geringem Vorwissen in einer kooperativen Kleingruppenmethode bekommt leistungsschwache-nicht-unter-sich', () => {
    const g: MethodAdjustmentGroup = { id: 'basis', label: 'Basis', selectedValues: { leistungsniveau: 'leistungsniveau-gering' } };
    const hinweise = teilgruppenHinweise(PHASES, [MAIN, g], [], [], R).filter((m) => m.regel === 'leistungsschwache-nicht-unter-sich');
    expect(hinweise.map((m) => m.baustein)).toEqual(['sos-modell']);
    expect(hinweise[0]).toMatchObject({ wirkung: 'weist-hin', grundlage: 'E' });
    expect(hinweise[0].text).toContain(block('sos-modell').name);
    // Without kleingruppe-kooperativ in the plan, no hint.
    expect(teilgruppenHinweise(EXPLIZIT, [MAIN, g], [], [], R).some((m) => m.regel === 'leistungsschwache-nicht-unter-sich')).toBe(false);
  });
});

describe('Qualitätsfälle n07 bis n10 als Kerntests', () => {
  it('n07: geringes Vorwissen tauscht eine nur offene, uniforme Methode gegen eine angeleitete', () => {
    // Paper text: the matcher plans only guided methods, so nothing sets off the swap; the group gets helps.
    const papier = adaptiere('Mathematik Klasse 8, lineare Funktionen, 45 Minuten', '6 Lernende mit geringem Vorwissen');
    const tg = impulse(papier, 'vorwissen-gering');
    expect(tg.length).toBeGreaterThan(0);
    for (const t of tg) {
      expect(t.antwort, t.phase.baustein!).toBe('hilfe');
      expect(t.hilfen.length).toBeGreaterThan(0);
      expect(block(t.phase.baustein!).anleitung.some((a) => a === 'explizit' || a === 'geleitet')).toBe(true);
    }
    expect(papier.teilgruppenMethoden).toEqual([]);
    // Case text (faelle-reihe4): the teacher names the discovery task, which is only open and uniform: swap with Beleg.
    const res = adaptiere(
      'Mathematik Klasse 8, lineare Funktionen, 90 Minuten, Erfindungsaufgabe mit kontrastierenden Fällen',
      '6 Lernende mit geringem Vorwissen'
    );
    const t = impulse(res, 'vorwissen-gering').find((x) => x.phase.baustein === 'erfindungsaufgabe')!;
    expect(t.antwort).toBe('tausch');
    expect(t.beleg).toMatchObject({ merkmal: 'vorwissen-gering', grundlage: 'E' });
    expect(t.beleg.quelle).toContain('Tetzlaff');
    expect(t.alternativeMethoden.length).toBeGreaterThan(0);
    for (const a of t.alternativeMethoden) expect(erfuelltRichtung(block(a.kennung), 'mehr-anleitung')).toBe(true);
    const vorschlag = res.teilgruppenMethoden.find((a) => a.vonKennung === 'erfindungsaufgabe')!;
    expect(vorschlag.zuKennung).toBe(t.alternativeMethoden[0].kennung);
  });

  it('n08: DaZ A2 in Biologie bekommt keine andere Methode, aber ein sprachliches Gerüst mit Abbau-Satz', () => {
    const res = adaptiere('Biologie Klasse 7, Fotosynthese, 45 Minuten', '4 Lernende DaZ Niveau A2');
    expect(res.teilgruppenMethoden.filter((a) => a.groupId === 'daz')).toEqual([]);
    const tg = impulse(res, 'daz');
    expect(tg.length).toBeGreaterThan(0);
    for (const t of tg) {
      expect(t.alternativeMethoden).toEqual([]);
      expect(t.antwort).not.toBe('tausch');
    }
    const hilfe = tg.filter((t) => t.antwort === 'hilfe');
    expect(hilfe.length).toBeGreaterThan(0);
    for (const t of hilfe) {
      expect(t.beleg.grund).toContain('sprachliches Gerüst');
      // The help that names the row's need comes first.
      expect(t.hilfen[0].name).toMatch(/Sprach/);
      expect(t.beleg.quelle).toContain('Höfler');
      expect(t.hilfen.length).toBeGreaterThan(0);
      for (const h of t.hilfen) expect(h.abbau).toMatch(/Entfällt|zurücknehmen/);
    }
    // DaZ is no learning style: nothing is reported as blocked.
    expect(res.gesperrt).toEqual([]);
  });

  it('n09: „visuelle Lerntypen“ löst nichts aus und nennt den Grund', () => {
    const res = adaptiere('Deutsch Klasse 6, Balladen, 45 Minuten', 'visuelle Lerntypen');
    const g = res.teilgruppen.find((t) => t.id !== 'regel')!;
    expect(g).toBeDefined();
    for (const t of impulse(res, g.id)) {
      expect(t.antwort).toBe('passt');
      expect(t.hilfen).toEqual([]);
      expect(t.alternativeMethoden).toEqual([]);
    }
    expect(res.teilgruppenMethoden).toEqual([]);
    expect(res.gesperrt).toEqual([{ gruppe: g.label, text: D.teilgruppen.gesperrtText }]);
    expect(res.gesperrt[0].text).toContain('Pashler');
    expect(res.regelmeldungen.some((m) => m.regel === 'gruppierung-nur-mit-anpassung')).toBe(false);
  });

  it('n10: Leistungsstarke tauschen eine nur explizit angeleitete, uniforme Methode', () => {
    const res = adaptiere('Geschichte Klasse 9, Weimarer Republik, 90 Minuten', '5 Leistungsstarke');
    const tausch = impulse(res, 'vertiefung').filter((t) => t.antwort === 'tausch');
    expect(tausch.length).toBeGreaterThan(0);
    for (const t of tausch) {
      expect(t.beleg).toMatchObject({ merkmal: 'vorwissen-hoch', grundlage: 'E' });
      const von = block(t.phase.baustein!);
      expect(von.anleitung.every((a) => a === 'explizit')).toBe(true);
      for (const a of t.alternativeMethoden) expect(erfuelltRichtung(block(a.kennung), 'weniger-anleitung')).toBe(true);
    }
    for (const a of res.teilgruppenMethoden) expect(erfuelltRichtung(block(a.zuKennung), 'weniger-anleitung')).toBe(true);
    // With two teachers an equivalent, less guided method can run beside the quiz.
    const r = M.zuordnen({ text: 'Geschichte Klasse 9, Weimarer Republik, 90 Minuten' });
    if (r.modus !== 'ablauf' || !r.arrangement) throw new Error('kein Ablauf');
    const zwei = adaptScenario(D, { arrangement: r.arrangement, lerngruppenText: '5 Leistungsstarke', lehrende: 2 });
    const getauscht = zwei.teilgruppenMethoden.filter((a) => a.groupId === 'vertiefung');
    expect(getauscht.length).toBeGreaterThan(0);
    for (const a of getauscht) {
      expect(a).toMatchObject({ merkmal: 'vorwissen-hoch', grundlage: 'E' });
      expect(erfuelltRichtung(block(a.zuKennung), 'weniger-anleitung')).toBe(true);
    }
  });
});

describe('Ein Entscheidungsweg für Tabelle und Vorschläge', () => {
  it.each([
    ['DaZ', 'Biologie Klasse 7, Fotosynthese, 45 Minuten', '4 Lernende DaZ Niveau A2'],
    ['Leistungsstark', 'Geschichte Klasse 9, Weimarer Republik, 90 Minuten', '5 Leistungsstarke']
  ])('%s: teilgruppenImpulse, teilgruppenMethoden und teilgruppenHilfen stimmen überein', (_n, text, gruppe) => {
    const res = adaptiere(text, gruppe);
    const zeilen = res.phasenAnpassungen.flatMap((p) => p.teilgruppenImpulse.filter((t) => t.groupId !== 'regel').map((t) => ({ ...t, key: p.key })));
    expect(zeilen.length).toBeGreaterThan(0);
    for (const z of zeilen) {
      if (z.antwort === 'tausch') expect(z.alternativeMethoden.length).toBeGreaterThan(0);
      const tausch = res.teilgruppenMethoden.filter((a) => a.groupId === z.groupId && a.stepKey === z.key);
      expect(tausch.length).toBe(z.antwort === 'tausch' ? 1 : 0);
      if (tausch[0]) expect(tausch[0].zuKennung).toBe(z.alternativeMethoden[0].kennung);
      const hilfe = res.teilgruppenHilfen.filter((s) => s.groupId === z.groupId && s.stepKey === z.key);
      expect(hilfe.length).toBe(z.antwort === 'hilfe' && z.hilfen.length ? 1 : 0);
      if (hilfe[0]) expect(hilfe[0].hilfen).toEqual(z.hilfen);
    }
  });
});
