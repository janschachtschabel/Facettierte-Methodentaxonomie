import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import {
  DIFF_MATRIX_MEASURES,
  DIFF_MATRIX_PERSONAS,
  DIFF_MATRIX_VARIABLES,
  QUICK_LEARNER_GROUP_PROFILES,
  adaptScenario,
  createMatcher,
  createValidator,
  detectLearnerGroupsFromText,
  GESPERRTE_MATRIX_KATEGORIEN,
  detectMatrixTraitsFromText,
  getMeasureEnrichment,
  scoreDifferentiationMatrix,
  suggestAlternativeMethodsForGroup
} from '../src/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DATA_DIR = path.join(ROOT, 'data');

describe('FMT Differentiation Enrichment & adaptScenario Engine', () => {
  const D = loadFmtData(DATA_DIR);
  const V = createValidator(D);
  const M = createMatcher(D, V);

  it('covers 100% of all 172 measures with valid classroom metadata and valid FMT vocabulary bridge tokens', () => {
    const validCodesByScheme = new Map<string, Set<string>>();
    for (const s of D.schemes) {
      const vals = s.werte || (s.gruppen || []).flatMap((g) => g.werte);
      validCodesByScheme.set(s.id, new Set(vals.map((v) => v.id)));
    }

    let count = 0;
    for (const ok of DIFF_MATRIX_MEASURES) {
      for (const kat of ok.kategorien) {
        for (const ausp of kat.auspraegungen) {
          count++;
          const meta = getMeasureEnrichment(ausp.id, kat.id);
          expect(['unterricht-sofort', 'material-planung', 'organisation-system']).toContain(meta.ebene);
          expect(['sofort', 'kurz', 'mittel']).toContain(meta.aufwand);
          expect(['analog', 'projektion', 'digital', 'online']).toContain(meta.technik);
          expect(meta.umsetzungsimpuls.length).toBeGreaterThan(20);

          for (const ph of meta.phasen) {
            expect(validCodesByScheme.get('lernfunktion')?.has(ph), `invalid phase "${ph}" on ${ausp.id}`).toBe(true);
          }
          for (const tok of meta.fmtBruecke) {
            const [schemeId, codeId] = tok.split(':');
            expect(
              validCodesByScheme.get(schemeId)?.has(codeId),
              `invalid fmtBruecke token "${tok}" on ${ausp.id}`
            ).toBe(true);
          }
        }
      }
    }
    expect(count).toBe(172);
  });

  it('excludes organisation-system measures by default, provides normalized scores (-100..+100), and avoids alphabetical noise on single-variable queries', () => {
    const res = scoreDifferentiationMatrix({ personaId: 'languageAndCulture', limit: 15 });
    expect(res.topRecommendations.length).toBeGreaterThan(0);
    for (const rec of res.topRecommendations) {
      expect(rec.meta.ebene).not.toBe('organisation-system');
      expect(rec.normalizedScore).toBeGreaterThanOrEqual(15);
      expect(rec.normalizedScore).toBeLessThanOrEqual(100);
      expect(['kern', 'ergaenzend']).toContain(rec.relevanz);
      expect(rec.meta.umsetzungsimpuls.length).toBeGreaterThan(15);
    }
    expect(res.topRecommendations.some((r) => /Förderstunden|Entwicklungsberichte|Nachhilfe/i.test(r.name))).toBe(false);

    // Explicit opt-in includes organisation-system measures again
    const withSys = scoreDifferentiationMatrix({
      personaId: 'languageAndCulture',
      includeSystemMeasures: true,
      limit: 20
    });
    expect(withSys.topRecommendations.some((r) => r.meta.ebene === 'organisation-system')).toBe(true);

    // Single variable query prioritizes immediate classroom actions over alphabetical digital tools
    const single = scoreDifferentiationMatrix({
      selectedValues: { 'foerderbedarf-lernen': 'foerderbedarf-lernen-umfassend' },
      maxTechnik: 't-keine',
      limit: 8
    });
    expect(single.topRecommendations.length).toBeGreaterThan(0);
    expect(single.topRecommendations[0].meta.ebene).toBe('unterricht-sofort');
    expect(single.topRecommendations.every((r) => r.meta.technik === 'analog')).toBe(true);
  });

  it('extracts distinct free-text subgroups strictly on detected traits without leaking clinical persona assumptions onto DaZ', () => {
    const det = detectLearnerGroupsFromText('26 Kinder: 5 DaZ-Kinder, 2 mit ADHS und 4 sehr leistungsstarke Kinder');
    expect(det.groups.map((g) => g.id)).toEqual(['daz', 'adhs', 'vertiefung']);
    expect(det.groups[0].count).toBe(5);
    expect(det.groups[0].personaId).toBeUndefined();
    expect(det.groups[0].selectedValues?.['foerderbedarf-lernen']).toBeUndefined();
    expect(det.groups[0].selectedValues?.['psychische-gesundheit']).toBeUndefined();
    expect(det.groups[0].selectedValues?.sprachkompetenz).toBe('sprachkompetenz-gering');
  });

  it('computes UDL basis, cross-group conflicts with resolution strategies, and phase adaptations for BOTH free text and FMT arrangements', () => {
    // 1. Free-text standalone chat scenario (no FMT arrangement)
    const freeRes = adaptScenario(D, {
      scenarioText: 'Mathematik Klasse 4 Bruchteile einführen mit Papierfalten, 45 Minuten, ohne Geräte, ohne Internet',
      lerngruppenText: '5 DaZ-Kinder, 2 Kinder mit ADHS und 4 sehr leistungsstarke Kinder',
      fach: 'Mathematik',
      thema: 'Bruchteile',
      bildungsstufe: 'primar',
      zeitMin: 45
    });
    expect(freeRes.kontext.gruppenQuelle).toBe('erkannt');
    expect(freeRes.kontext.maxTechnik).toBe('t-keine');
    expect(freeRes.kontext.ohneInternet).toBe(true);
    expect(freeRes.kontext.aktiveEbenen).toEqual(['unterricht-sofort', 'material-planung']);
    expect(freeRes.udlBasis.length).toBeGreaterThan(0);
    expect(freeRes.konflikte.length).toBeGreaterThan(0);
    expect(freeRes.konflikte[0].aufloesungsstrategie.length).toBeGreaterThan(25);
    expect(freeRes.phasenAnpassungen.length).toBe(3);
    expect(freeRes.phasenAnpassungen[0].passendeFmtMethoden.length).toBeGreaterThan(0);
    expect(freeRes.epistemischerHinweis).toContain('heuristischen');
    // Strictly analog: no digital/online measures in UDL or subgroups
    for (const u of freeRes.udlBasis) expect(u.meta.technik).toBe('analog');
    for (const tg of freeRes.teilgruppen) {
      for (const m of tg.spezifischeMassnahmen) expect(m.meta.technik).toBe('analog');
    }

    // Without a planned method no fit was checked: every answer says so (ohneMethode), and nothing is swapped.
    const freeImpulse = freeRes.phasenAnpassungen.flatMap((p) => p.teilgruppenImpulse);
    expect(freeImpulse.length).toBeGreaterThan(0);
    for (const ti of freeImpulse) {
      expect(ti.ohneMethode).toBe(true);
      expect(ti.antwort).not.toBe('tausch');
    }

    // 2. Single detected subgroup adds Regelniveau automatically
    const singleGroupRes = adaptScenario(D, {
      scenarioText: 'Biologie Klasse 6 Fotosynthese, 45 Minuten, 4 DaZ-Kinder'
    });
    expect(singleGroupRes.kontext.gruppenQuelle).toBe('erkannt+regelniveau');
    expect(singleGroupRes.teilgruppen.length).toBe(2);

    // 3. FMT Arrangement adaptation (with alternative methods respecting analog filter)
    const matched = M.zuordnen({
      text: 'Mathematik Bruchrechnen Doppelstunde Klasse 6, 90 Minuten, geringes Vorwissen, ohne Geräte',
      ansatz: ['instruktion', 'uebung'],
      gruppe: 26
    });
    expect(matched.modus).toBe('ablauf');
    if (matched.modus === 'ablauf' && matched.arrangement) {
      const arrRes = adaptScenario(D, {
        arrangement: matched.arrangement,
        lerngruppenText: '6 DaZ-Kinder und 5 leistungsstarke Kinder',
        maxTechnik: 't-keine',
        ohneInternet: true
      });
      expect(arrRes.phasenAnpassungen.length).toBeGreaterThanOrEqual(4);
      expect(arrRes.phasenAnpassungen[0].baustein).toBeTruthy();
      // With planned methods the answers are fit checks and carry no flag.
      for (const ti of arrRes.phasenAnpassungen.flatMap((p) => p.teilgruppenImpulse)) expect(ti.ohneMethode).toBeUndefined();
      expect(arrRes.udlBasis.length).toBeGreaterThan(0);
      expect(arrRes.konflikte.length).toBeGreaterThan(0);
    }

    // 4. suggestAlternativeMethodsForGroup respects maxTechnik='t-keine' and uses fmtBruecke
    const scored = scoreDifferentiationMatrix({ personaId: 'foerderLernen', maxTechnik: 't-keine' });
    const alts = suggestAlternativeMethodsForGroup(
      scored,
      D.bausteine.find((b) => b.kennung === 'entdeckendes-lernen'),
      D.bausteine,
      5,
      30,
      { maxTechnik: 't-keine', ohneInternet: true }
    );
    expect(alts.length).toBeGreaterThan(0);
    for (const a of alts) {
      const blk = D.bausteine.find((x) => x.kennung === a.kennung)!;
      expect(blk.technik).toBe('t-keine');
      expect(blk.internet).toBe(false);
    }
  });

  it('validates 100% of variable/value IDs in DIFF_MATRIX_PERSONAS, QUICK_LEARNER_GROUP_PROFILES, and detectLearnerGroupsFromText, and preserves method context without niche-domain swaps', () => {
    const validVars = new Map<string, Set<string>>();
    for (const ok of DIFF_MATRIX_VARIABLES) {
      for (const k of ok.kategorien) {
        validVars.set(k.id, new Set(k.auspraegungen.map((a) => a.id)));
      }
    }

    // 1. Every persona value ID must exist in DIFF_MATRIX_VARIABLES
    for (const p of DIFF_MATRIX_PERSONAS) {
      for (const [k, v] of Object.entries(p.values)) {
        expect(validVars.get(k)?.has(v), `invalid persona value ${p.id}: ${k}=${v}`).toBe(true);
      }
    }

    // 2. Every quick profile value ID must exist in DIFF_MATRIX_VARIABLES
    expect(QUICK_LEARNER_GROUP_PROFILES.length).toBeGreaterThanOrEqual(8);
    for (const qp of QUICK_LEARNER_GROUP_PROFILES) {
      expect(Object.keys(qp.selectedValues).length).toBeGreaterThan(0);
      for (const [k, v] of Object.entries(qp.selectedValues)) {
        expect(validVars.get(k)?.has(v), `invalid quick profile value ${qp.id}: ${k}=${v}`).toBe(true);
      }
    }

    // 3. Everyday German prompts all trigger valid trait-only subgroups (no silent fallback)
    for (const sample of [
      'geringes Vorwissen',
      'schüchterne Lernende mit Prüfungsangst',
      'motorische Einschränkung',
      'geringe Motivation',
      '5 DaZ-Kinder, 2 ADHS, 3 LRS, 4 Leistungsstarke'
    ]) {
      const det = detectLearnerGroupsFromText(sample);
      expect(det.groups.length, `expected detected subgroup(s) for "${sample}"`).toBeGreaterThan(0);
      for (const g of det.groups) {
        for (const [k, v] of Object.entries(g.selectedValues || {})) {
          expect(validVars.get(k)?.has(v), `invalid detected value ${g.id}: ${k}=${v}`).toBe(true);
        }
      }
    }

    // 4. Direct single-method adaptation attaches methodenKontext and avoids niche sports/theater swaps & timetable measures
    const singleMethodRes = adaptScenario(D, {
      baustein: 'experiment',
      lerngruppenText: '5 DaZ-Kinder, 2 ADHS, 4 Leistungsstarke',
      bildungsstufe: 'sek1',
      maxTechnik: 't-keine',
      ohneInternet: true
    });
    expect(singleMethodRes.phasenAnpassungen.length).toBe(1);
    const ph = singleMethodRes.phasenAnpassungen[0];
    expect(ph.baustein).toBe('experiment');
    expect(ph.methodenKontext).toBeDefined();
    expect(ph.methodenKontext?.methodenAnpassungshinweis.length).toBeGreaterThan(25);
    const allAltNames = ph.teilgruppenImpulse.flatMap((t) => t.alternativeMethoden.map((a) => a.name));
    expect(allAltNames.some((n) => /Freispiel|Zirkel|Stegreiftheater|Jeux Dramatiques|Schöllhorn|Bewegung/i.test(n))).toBe(false);

    // No timetable/school-org measures leak into Leistungsstark recommendations by default
    const strong = singleMethodRes.teilgruppen.find((t) => t.id === 'vertiefung')!;
    expect(strong.spezifischeMassnahmen.some((m) => /Fachzeitanteile|Gleitzeit|Fachräume|Klassenlehrkraft/i.test(m.name))).toBe(false);
  });

  it('gesperrte Kategorien: die Matrix wertet sie nicht aus, die Texterkennung meldet sie getrennt', () => {
    expect([...GESPERRTE_MATRIX_KATEGORIEN]).toEqual(D.teilgruppen.gesperrt);
    const nurSensorisch = scoreDifferentiationMatrix({ selectedValues: { sensorische: 'sensorische-visuell' } });
    expect(nurSensorisch.selectedCount).toBe(0);
    expect(nurSensorisch.topRecommendations).toEqual([]);
    const mit = scoreDifferentiationMatrix({ selectedValues: { vorwissen: 'vorwissen-gering', sensorische: 'sensorische-visuell' }, limit: 20 });
    const ohne = scoreDifferentiationMatrix({ selectedValues: { vorwissen: 'vorwissen-gering' }, limit: 20 });
    expect(mit).toEqual(ohne);
    // With an explicit empty list the category counts again (callers with other data).
    expect(scoreDifferentiationMatrix({ selectedValues: { sensorische: 'sensorische-visuell' }, gesperrt: [] }).selectedCount).toBe(1);

    const det = detectMatrixTraitsFromText('Teilgruppe: visuelle Lerntypen');
    expect(det.selectedValues.sensorische).toBeUndefined();
    expect(det.gesperrt.map((g) => g.categoryId)).toEqual(['sensorische']);
    expect(det.signals).toEqual([]);
    // Presets no longer carry the blocked category.
    for (const qp of QUICK_LEARNER_GROUP_PROFILES) expect(qp.selectedValues.sensorische).toBeUndefined();
    for (const g of detectLearnerGroupsFromText('5 DaZ-Kinder, 3 LRS, 2 hörbeeinträchtigt, 1 sehbehindert').groups) {
      expect(g.selectedValues?.sensorische).toBeUndefined();
    }
    expect(detectMatrixTraitsFromText('DaZ, LRS, schwerhörig, sehbehindert').gesperrt).toEqual([]);
    // Negated learning styles are not a group and nothing is blocked.
    for (const t of ['keine Lerntypen bitte', 'ohne visuelle Lerntypen', 'Wir unterscheiden nicht nach Lerntypen', 'keine Einteilung: kein Lernstil-Test']) {
      expect(detectMatrixTraitsFromText(t).gesperrt, t).toEqual([]);
    }
    expect(detectLearnerGroupsFromText('Wir unterscheiden nicht nach Lerntypen').groups.map((g) => g.id)).not.toContain('lerntypen');
    expect(detectLearnerGroupsFromText('4 visuelle Lerntypen').groups.map((g) => g.id)).toContain('lerntypen');
  });

  it('adaptScenario nennt je Teilgruppe und Phase Antwort, Beleg und Hilfen und liefert Regelmeldungen', () => {
    const res = adaptScenario(D, { baustein: 'sos-modell', lerngruppenText: '5 DaZ-Kinder und 4 mit geringem Vorwissen' });
    expect(Array.isArray(res.regelmeldungen)).toBe(true);
    expect(res.gesperrt).toEqual([]);
    for (const p of res.phasenAnpassungen) {
      for (const t of p.teilgruppenImpulse) {
        expect(['passt', 'hilfe', 'tausch']).toContain(t.antwort);
        expect(typeof t.beleg.grund).toBe('string');
        for (const h of t.hilfen) expect(h.abbau.length).toBeGreaterThan(10);
      }
    }
    // sos-modell is cooperative in small groups: the group with low prior knowledge gets the grouping hint.
    expect(res.regelmeldungen.map((m) => m.regel)).toContain('leistungsschwache-nicht-unter-sich');
  });
});
