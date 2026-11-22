import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import {
  createValidator,
  createSearch,
  createMatcher,
  createSemanticClassifier,
  detectMatrixTraitsFromText,
  FMT_RULES,
  scoreDifferentiationMatrix,
  suggestAlternativeMethodsForGroup
} from '../src/index.js';
import type { Arrangement } from '../src/types.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DATA_DIR = path.join(ROOT, 'data');

describe('FMT Core: Validator, Search, Matcher', () => {
  const D = loadFmtData(DATA_DIR);
  const V = createValidator(D);
  const S = createSearch(D, V);
  const M = createMatcher(D, V);
  const reg = new Map(D.beispiele.map((a) => [a['@id']!, a]));
  const byId = (suffix: string) => D.beispiele.find((a) => a['@id']?.endsWith(suffix))!;

  it('validates example R3 „dichte-reihe“ without errors or warnings', () => {
    const res = V.validate(byId('dichte-reihe'), reg);
    expect(res.gueltig).toBe(true);
    expect(res.meldungen).toEqual([]);
  });

  it('validates R4 „modul-stoffe“ embedding R3 by reference and inheriting states', () => {
    const res = V.validate(byId('modul-stoffe'), reg);
    expect(res.gueltig).toBe(true);
    expect(res.meldungen).toEqual([]);
    expect(res.endzustand).toContain('konzept-gesichert');
  });

  it('triggers R-01 through R-11 on „fehlerhafte-reihe“ and tags every message with grundlage', () => {
    const faulty = V.validate(byId('fehlerhafte-reihe'), reg);
    expect(faulty.gueltig).toBe(false);
    const rules = new Set(faulty.meldungen.map((m) => m.regel));
    for (const r of ['R-01', 'R-02', 'R-03', 'R-04', 'R-05', 'R-06', 'R-07', 'R-08', 'R-09', 'R-10', 'R-11']) {
      expect(rules.has(r), `missing ${r}`).toBe(true);
    }
    for (const m of faulty.meldungen) {
      expect(['formal', 'E', 'S', 'A']).toContain(m.grundlage);
    }
    expect(FMT_RULES.length).toBe(13);
  });

  it('reports R-12 on cyclic and unresolvable references', () => {
    const cyc: Arrangement = {
      '@id': D.NS + 'x',
      typ: 'Arrangement',
      name: 'x',
      reichweite: 'r4',
      ablauf: { typ: 'Verweis', arrangement: D.NS + 'x' }
    };
    const cycRes = V.validate(cyc, new Map([[D.NS + 'x', { ...cyc, reichweite: 'r3' }]]));
    expect(cycRes.meldungen.some((m) => m.regel === 'R-12')).toBe(true);
    const orphan = V.validate({
      typ: 'Arrangement',
      name: 'y',
      reichweite: 'r3',
      ablauf: { typ: 'Verweis', arrangement: D.NS + 'nirgends' }
    });
    expect(orphan.meldungen.some((m) => m.regel === 'R-12')).toBe(true);
  });

  it('handles nachKernphase slots, single retrieval consolidation, empty composites, open core phases, and R-06 primar', () => {
    const nachKern = V.validate({
      typ: 'Arrangement',
      name: 'z',
      reichweite: 'r3',
      ablauf: {
        typ: 'Einsatz',
        baustein: 'gruppenpuzzle',
        dauerMin: 60,
        belegung: [{ slotKennung: 'sicherung', inhalt: { typ: 'Einsatz', baustein: 'abrufquiz', dauerMin: 8 } }]
      }
    });
    expect(nachKern.meldungen.some((m) => m.regel === 'R-03')).toBe(false);

    const single = V.validate({
      typ: 'Arrangement',
      name: 't',
      reichweite: 'r3',
      ablauf: {
        typ: 'Sequenz',
        teile: [
          { typ: 'Einsatz', baustein: 'lehrervortrag', dauerMin: 15 },
          { typ: 'Einsatz', baustein: 'abrufquiz', dauerMin: 6 }
        ]
      }
    });
    expect(single.endzustand).toContain('wissen-konsolidiert');

    const r07 = (last: Arrangement['ablauf']) =>
      V.validate({
        typ: 'Arrangement',
        name: 't',
        reichweite: 'r3',
        zieltyp: 'faktenwissen',
        ablauf: { typ: 'Sequenz', teile: [{ typ: 'Einsatz', baustein: 'lehrervortrag', dauerMin: 15 }, last] }
      }).meldungen.some((m) => m.regel === 'R-07');
    expect(r07({ typ: 'Einsatz', baustein: 'abrufquiz', dauerMin: 6 })).toBe(true);
    expect(r07({ typ: 'Wiederkehr', baustein: 'abrufquiz', anzahl: 2, dauerMin: 6 })).toBe(false);

    const emptyPf = V.validate({
      typ: 'Arrangement',
      name: 't',
      reichweite: 'r3',
      ablauf: {
        typ: 'Sequenz',
        teile: [
          { typ: 'Einsatz', baustein: 'tps', dauerMin: 8 },
          { typ: 'Einsatz', baustein: 'productive-failure', dauerMin: 90 }
        ]
      }
    });
    expect(emptyPf.endzustand).not.toContain('konzept-gesichert');
    expect(emptyPf.meldungen.some((m) => m.regel === 'R-11')).toBe(true);

    const projekt = V.validate({
      typ: 'Arrangement',
      name: 't',
      reichweite: 'r3',
      ablauf: {
        typ: 'Sequenz',
        teile: [
          { typ: 'Einsatz', baustein: 'lehrervortrag', dauerMin: 15 },
          {
            typ: 'Einsatz',
            baustein: 'projektmethode',
            dauerMin: 180,
            belegung: [
              { slotKennung: 'planung', inhalt: { typ: 'Einsatz', baustein: 'tps', dauerMin: 10 } },
              { slotKennung: 'fixpunkt', inhalt: { typ: 'Einsatz', baustein: 'exit-ticket', dauerMin: 5 } }
            ]
          }
        ]
      }
    });
    expect(projekt.meldungen.some((m) => m.regel === 'R-05')).toBe(true);

    const primar = V.validate(
      {
        typ: 'Arrangement',
        name: 't',
        reichweite: 'r3',
        kontext: { bildungsstufe: 'primar' },
        ablauf: {
          typ: 'Sequenz',
          teile: [
            { typ: 'Einsatz', baustein: 'tps', dauerMin: 8 },
            { typ: 'Einsatz', baustein: 'erfindungsaufgabe', dauerMin: 40 },
            { typ: 'Einsatz', baustein: 'vergleichende-instruktion', dauerMin: 30 }
          ]
        }
      }
    );
    expect(primar.meldungen.some((m) => m.regel === 'R-06')).toBe(true);
  });

  it('searches by synonym, phase name, facet, ansatz, status, time, states, evidence and computes valid replacements', () => {
    const ids = (k: Parameters<typeof S.suche>[0]) => S.suche(k).map((b) => b.kennung);
    expect(ids({ text: 'jigsaw' })).toContain('gruppenpuzzle');
    expect(ids({ text: 'jigsaw' })).toContain('partnerpuzzle');
    expect(ids({ text: 'Lernzirkel' })).toEqual(['stationenlernen']);
    expect(ids({ liefert: 'wissen-konsolidiert' })).toContain('abrufquiz');
    expect(ids({ bildungsstufe: 'primar' })).not.toContain('productive-failure');
    expect(ids({ ansatz: 'kooperativ' })).toContain('gruppenpuzzle');
    expect(ids({ status: 'kuratiert' }).length).toBeGreaterThanOrEqual(22);
    expect(ids({ ohneKI: true })).not.toContain('ki-tutor');
    expect(ids({ ohneKI: true })).not.toContain('ki-chat');
    expect(ids({ ohneKI: true })).toContain('abrufquiz');
    expect(ids({ ohneKI: true })).toContain('loesungsbeispiele');
    expect(ids({ ohneKI: true })).toContain('projektmethode');
    expect(ids({ ohneKI: true })).toContain('lerntagebuch');
    expect(ids({ maxTechnik: 't-keine' })).not.toContain('ki-tutor');
    expect(ids({ text: 'Einstieg' }).every((id) => D.bausteine.find((b) => b.kennung === id)!.lernfunktion.includes('orientierung'))).toBe(true);

    const dichteArr = byId('dichte-reihe');
    const k2 = S.ersatz(dichteArr, '/ablauf/haupt/teile/1', reg).map((x) => x.baustein);
    expect(k2).toContain('vortrag-prompts');
    expect(k2).not.toContain('ki-chat');
    expect(k2).not.toContain('tps');
  });

  it('matches scenarios in 5 stages (phase, ablauf, German free text, unknown value rejection)', () => {
    const ph = M.zuordnen({ text: 'Sicherung für Klasse 7, 10 Minuten, 28 Schüler, ohne Geräte' });
    expect(ph.modus).toBe('phase');
    if (ph.modus === 'phase') {
      expect(ph.kriterien.zeitMin).toBe(10);
      expect(ph.kriterien.bildungsstufe).toBe('sek1');
      expect(ph.kriterien.gruppe).toBe(28);
      expect(ph.kriterien.maxTechnik).toBe('t-keine');
      expect(ph.vorschlaege[0].evidenzgrad).toBe('A');
      const topIds = ph.vorschlaege.slice(0, 3).map((v) => v.baustein);
      expect(topIds).toContain('abrufquiz');
      expect(topIds).toContain('brain-dump');
    }

    for (const k of D.ketten) {
      const r = M.zuordnen({ zieltyp: k.id, bildungsstufe: 'sek1', vorwissen: 'gering' });
      expect(r.modus).toBe('ablauf');
      if (r.modus === 'ablauf' && r.pruefung) {
        expect(r.pruefung.gueltig).toBe(true);
        expect(r.offen).toEqual([]);
      }
    }

    const reihe = M.zuordnen({ text: 'Unterrichtsreihe Physik Klasse 7: das Konzept Dichte verstehen, wenig Vorwissen, 270 Minuten' });
    expect(reihe.modus).toBe('ablauf');
    if (reihe.modus === 'ablauf' && reihe.pruefung) {
      expect(reihe.kette?.id).toBe('konzeptaufbau');
      expect(reihe.pruefung.dauerMin).toBeLessThanOrEqual(270);
    }

    expect(() => M.zuordnen({ bildungsstufe: 'klasse7' })).toThrow(/unbekannter Wert/);

    const ohneKiMatch = M.zuordnen({ text: 'Sicherung ohne KI, 10 Minuten' });
    expect(ohneKiMatch.modus).toBe('phase');
    if (ohneKiMatch.modus === 'phase') {
      expect(ohneKiMatch.vorschlaege.some((v) => v.baustein === 'abrufquiz')).toBe(true);
      expect(ohneKiMatch.vorschlaege.some((v) => v.baustein === 'ki-tutor')).toBe(false);
    }
  });

  it('safely handles malformed non-array fields and Verweis cycles without @id', () => {
    const badSeq = {
      typ: 'Arrangement',
      name: 'Defekte Sequenz',
      reichweite: 'r3',
      ablauf: { typ: 'Sequenz', teile: 'not-array' }
    } as unknown as Arrangement;
    const res1 = V.validate(badSeq);
    expect(res1.gueltig).toBe(false);
    expect(res1.meldungen.some((m) => m.regel === 'R-00' && m.schwere === 'Fehler')).toBe(true);

    // Cycle where neither root nor referenced arrangement has @id matching registry key
    const cycRef: Arrangement = {
      typ: 'Arrangement',
      name: 'Ohne ID Zyklus',
      reichweite: 'r2',
      ablauf: { typ: 'Verweis', arrangement: 'urn:cyc-no-id' }
    };
    const rootNoId: Arrangement = {
      typ: 'Arrangement',
      name: 'Root ohne ID',
      reichweite: 'r3',
      ablauf: { typ: 'Verweis', arrangement: 'urn:cyc-no-id' }
    };
    const cycReg = new Map<string, Arrangement>([['urn:cyc-no-id', cycRef]]);
    const res2 = V.validate(rootNoId, cycReg);
    expect(res2.gueltig).toBe(false);
    expect(res2.meldungen.some((m) => m.regel === 'R-12' && m.schwere === 'Fehler')).toBe(true);
  });

  it('scores Binnendifferenzierungsmatrix personas deterministically, suggests subgroup alternative methods, and recognizes ansatz in free text', () => {
    const langRes = scoreDifferentiationMatrix({ personaId: 'languageAndCulture', limit: 8 });
    expect(langRes.selectedCount).toBeGreaterThan(20);
    expect(langRes.topRecommendations.length).toBeGreaterThanOrEqual(5);
    expect(langRes.topRecommendations[0].score).toBeGreaterThan(10);
    expect(langRes.didacticProfile.preferredGuidance).toBe('explizit');
    expect(langRes.didacticProfile.needsLanguageSupport).toBe(true);
    expect(langRes.avoidMeasures.length).toBeGreaterThan(0);

    const highRes = scoreDifferentiationMatrix({ personaId: 'highPerforming', limit: 8 });
    expect(highRes.didacticProfile.preferredGuidance).toBe('offen');
    expect(highRes.didacticProfile.benefitsFromEnrichment).toBe(true);

    const openBlock = D.bausteine.find((b) => b.kennung === 'erfindungsaufgabe');
    const alts = suggestAlternativeMethodsForGroup(langRes, openBlock, D.bausteine, 5);
    expect(alts.length).toBeGreaterThan(0);
    expect(alts.every((a) => a.kennung !== 'erfindungsaufgabe')).toBe(true);

    const ansatzMatch = M.zuordnen({ text: 'Problemorientiertes Lernen Physik Klasse 8 Konzept verstehen, 135 Minuten' });
    expect(ansatzMatch.kriterien.ansatz).toEqual(['forschend']);
  });

  it('extracts multiplicative durations, multi-ansatz, guidance/interaction/prep scales, semantic scale fallback & matrix traits without LLM', () => {
    const parsed = M.lesen(
      'Kooperatives und spielerisches Lernen mit 2 x 45 Minuten in der 7. Klasse, Partnerarbeit ohne Vorbereitung, geleitet mit Leitfragen'
    );
    expect(parsed.kriterien.zeitMin).toBe(90);
    expect(parsed.kriterien.bildungsstufe).toBe('sek1');
    expect(parsed.kriterien.ansatz).toEqual(['kooperativ', 'spiel-simulation']);
    expect(parsed.kriterien.interaktion).toEqual(['partner']);
    expect(parsed.kriterien.anleitung).toEqual(['geleitet']);
    expect(parsed.kriterien.maxVorbereitung).toBe(5);

    const sem = createSemanticClassifier(D);
    const cls = sem.classifyScales('Gemeinsam ein Plakat oder Schaubild malen um Zusammenhänge sichtbar zu machen');
    expect(cls.scales.ansatz[0]?.code).toBe('visualisierung');
    expect(cls.scales.lernfunktion.some((x) => x.code === 'verstehen')).toBe(true);
    expect(sem.rankMethods('Fehlvorstellungen vor Experiment sichtbar machen', 5).length).toBeGreaterThan(0);

    const traits = detectMatrixTraitsFromText('Sehr heterogene 7. Klasse mit vielen DaZ-Kindern, LRS und einem Schüler mit ADHS');
    expect(traits.selectedValues.sprachkompetenz).toBe('sprachkompetenz-gering');
    expect(traits.selectedValues.strukturierung).toBe('strukturierung-stark');
    expect(traits.signals.length).toBeGreaterThanOrEqual(4);
    expect(traits.matrixScore?.topRecommendations.length).toBeGreaterThan(0);
  });
});
