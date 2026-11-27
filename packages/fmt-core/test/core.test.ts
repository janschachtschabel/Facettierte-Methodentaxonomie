import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { loadFmtData } from '../src/load-data.js';
import {
  createValidator,
  createSearch,
  createMatcher,
  createSemanticClassifier,
  detectMatrixTraitsFromText,
  FMT_RULES,
  PIKTOGRAMME,
  scoreDifferentiationMatrix,
  suggestAlternativeMethodsForGroup
} from '../src/index.js';
import type { AblaufMatchResult, Arrangement, MatchResult, PhaseMatchResult } from '../src/types.js';
import { nachweisformen } from '../src/zielart.js';
import { erstelleRegeln } from '../src/regeln.js';
import { mitEintraegen } from './fixtures/eignung.js';

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
    // Since Task B3, R-06 reads every fit rule. The invention task is open, without feedback and uniform, but it solves
    // the problem before the instruction: Tor D2 exempts that sequence from „Entdecken nur mit Stütze“.
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

    // Tor D2 gave every stage entry a reason; the fixture puts back the old entry of erfindungsaufgabe without one.
    const primar = createValidator(mitEintraegen(D)).validate(
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
    const r06 = primar.meldungen.filter((m) => m.regel === 'R-06' && /Bildungsstufe/.test(m.meldung)).map((m) => m.meldung).join(' ');
    expect(r06).toMatch(/passt weniger zur Bildungsstufe „Primarstufe“\. \(Setzung der Redaktion\)/);
    expect(r06).not.toMatch(/Evidenz/);
  });

  it('searches by synonym, phase name, facet, ansatz, status, time, states, evidence and computes valid replacements', () => {
    const ids = (k: Parameters<typeof S.suche>[0]) => S.suche(k).map((b) => b.kennung);
    expect(ids({ text: 'jigsaw' })).toContain('gruppenpuzzle');
    expect(ids({ text: 'jigsaw' })).toContain('partnerpuzzle');
    expect(ids({ text: 'Lernzirkel' })).toEqual(['stationenlernen']);
    expect(ids({ liefert: 'wissen-konsolidiert' })).toContain('abrufquiz');
    expect(ids({ bildungsstufe: 'primar' })).not.toContain('dual-praxismodul');
    // Tor D2 moved most stage and prior-knowledge entries into rules; the search honours those rules (Fix round 1).
    expect(ids({ bildungsstufe: 'primar' })).not.toContain('productive-failure');
    expect(ids({ bildungsstufe: 'primar' })).not.toContain('blended-learning');
    expect(ids({ bildungsstufe: 'sek1' })).toContain('productive-failure');
    expect(ids({ vorwissen: 'gering' })).not.toContain('freiarbeit');
    expect(ids({ vorwissen: 'mittel' })).toContain('freiarbeit');
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

    // Expanded didactic approaches (incl. Lernen durch Lehren, handlungsorientiert, dialogisch, individualisiert, selbstreguliert, instruktionsorientiert)
    expect(M.lesen('Lernen durch Lehren in Klasse 9').kriterien.ansatz).toEqual(['kooperativ', 'offen']);
    expect(M.lesen('Handlungsorientiertes Lernen im Fach Biologie').kriterien.ansatz).toEqual(['forschend', 'spiel-simulation']);
    expect(M.lesen('Dialogisches Lernen im Ethikunterricht').kriterien.ansatz).toEqual(['kooperativ', 'diskurs']);
    expect(M.lesen('Individualisiertes Lernen mit Stationen').kriterien.ansatz).toEqual(['offen', 'diagnose-feedback']);
    expect(M.lesen('Selbstreguliertes Lernen und Reflexives Lernen').kriterien.ansatz).toEqual(['reflexion']);
    expect(M.lesen('Instruktionsorientiertes Lernen für Rechenverfahren').kriterien.ansatz).toEqual(['instruktion']);
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

  it('matches all planner starter scenarios deterministically as valid, budget-fitting Abläufe without negative-evidence contrast methods', () => {
    const NEGATIVE_CONTRAST_IDS = new Set([
      'unangeleitete-gruppenarbeit',
      'tafelabschrift-abschreiben',
      'vorlesung-klassisch'
    ]);

    const starterCases: Array<{
      id: string;
      text: string;
      ansatz: string[];
      expectedChain: string;
      maxBudgetMin: number;
      ohneInternet?: boolean;
    }> = [
      {
        id: 'mathe-bruch',
        text: 'Mathematik Bruchrechnen Doppelstunde Klasse 6, 90 Minuten, geringes Vorwissen',
        ansatz: ['instruktion', 'uebung'],
        expectedChain: 'prozedur',
        maxBudgetMin: 90
      },
      {
        id: 'physik-dichte',
        text: 'Unterrichtsreihe Physik Klasse 7: das Konzept Dichte verstehen, wenig Vorwissen, 270 Minuten, ohne Geräte',
        ansatz: ['forschend'],
        // Goal kind konzepte with the wished approach forschend: the chain choice (waehleKette) takes the 5E chain.
        expectedChain: 'fuenf-e',
        maxBudgetMin: 270
      },
      {
        id: 'bio-oekosystem',
        text: 'Biologie Klasse 8 forschend 5E Ökosystem Wald, 135 Minuten, mittleres Vorwissen',
        ansatz: ['forschend', 'kooperativ'],
        expectedChain: 'fuenf-e',
        maxBudgetMin: 135
      },
      {
        id: 'deutsch-arg',
        text: 'Deutsch Sekundarstufe I Doppelstunde 90 Minuten Argumentation und Problemlösen, mittleres Vorwissen',
        ansatz: ['diskurs', 'kooperativ'],
        expectedChain: 'problemloesen',
        maxBudgetMin: 90
      },
      {
        id: 'gesch-demokratie',
        text: 'Politik Klasse 9 Faktenwissen und Verständnis Gewaltenteilung, 135 Minuten, wenig Vorwissen, mehrere DaZ-Kinder',
        ansatz: ['kooperativ'],
        expectedChain: 'faktenwissen',
        maxBudgetMin: 135
      },
      {
        id: 'grundschule-sach',
        text: 'Grundschule Klasse 3 Sachunterricht Einzelstunde 45 Minuten Konzept Wasserkreislauf verstehen, geringes Vorwissen, ohne Internet',
        ansatz: ['kooperativ', 'spiel-simulation'],
        expectedChain: 'konzeptaufbau',
        maxBudgetMin: 45,
        ohneInternet: true
      }
    ];

    for (const c of starterCases) {
      const res = M.zuordnen({ text: c.text, ansatz: c.ansatz, gruppe: 26, ohneInternet: c.ohneInternet });
      expect(res.modus, `${c.id} should match as ablauf`).toBe('ablauf');
      if (res.modus === 'ablauf') {
        expect(res.kette?.id, `${c.id} chain`).toBe(c.expectedChain);
        expect(res.arrangement, `${c.id} arrangement`).toBeTruthy();
        expect(res.pruefung?.gueltig, `${c.id} valid`).toBe(true);
        expect(res.schritte?.length, `${c.id} steps`).toBeGreaterThanOrEqual(4);
        // Must NEVER auto-pick empirically weak contrast methods!
        for (const s of res.schritte || []) {
          expect(NEGATIVE_CONTRAST_IDS.has(s.baustein), `${c.id} must not pick negative contrast ${s.baustein}`).toBe(false);
        }
        // Must fit cleanly inside the requested lesson time budget!
        expect(res.pruefung!.dauerMin, `${c.id} duration (${res.pruefung!.dauerMin} min) <= ${c.maxBudgetMin} min`).toBeLessThanOrEqual(
          c.maxBudgetMin
        );
      }
    }

    // Explicit single-phase pattern test (modus: 'phase')
    const phaseCase = M.zuordnen({ text: 'Kurze Sicherung am Stundenende, 10 Minuten, Klasse 7, ohne Geräte' });
    expect(phaseCase.modus).toBe('phase');
    if (phaseCase.modus === 'phase') {
      expect(phaseCase.vorschlaege.length).toBeGreaterThan(3);
      expect(NEGATIVE_CONTRAST_IDS.has(phaseCase.vorschlaege[0].baustein)).toBe(false);
    }
  });

  it('excludes Sek/Hochschule-only text methods for Primarstufe and filters digital matrix measures when maxTechnik=t-keine', () => {
    // 1. Live Grundschule Mathematik Bruchteile scenario (primar, 45 min, t-keine)
    const primarRes = M.zuordnen({
      text: 'Mathematik Grundschule Bruchteile entdecken: Hälfte und Viertel, 45 Minuten, mittleres Vorwissen, ohne Geräte, ohne Internet',
      modus: 'ablauf',
      zieltyp: 'konzeptaufbau',
      bildungsstufe: 'primar',
      zeitMin: 45,
      gruppe: 24,
      vorwissen: 'mittel',
      ansatz: ['kooperativ', 'forschend'],
      maxTechnik: 't-keine',
      maxVorbereitung: 15,
      ohneInternet: true,
      ohneKI: true
    });
    expect(primarRes.modus).toBe('ablauf');
    if (primarRes.modus === 'ablauf') {
      expect(primarRes.pruefung.gueltig).toBe(true);
      expect(primarRes.pruefung.dauerMin).toBeLessThanOrEqual(45);
      const ids = (primarRes.schritte || []).map((s) => s.baustein);
      expect(ids).not.toContain('kooperatives-skript');
      expect(ids).not.toContain('sq3r-lesemethode');
      expect(ids).not.toContain('text-exzerpieren');
    }

    // 2. Differentiation matrix must respect maxTechnik='t-keine' and ohneInternet=true
    const analogHigh = scoreDifferentiationMatrix({
      personaId: 'highPerforming',
      limit: 8,
      maxTechnik: 't-keine',
      ohneInternet: true
    });
    expect(analogHigh.topRecommendations.length).toBeGreaterThan(0);
    const forbiddenIds = new Set([
      'medienformate-interaktiv',
      'medienformate-audiovisuell',
      'methodik-lernprozess-digital',
      'unterstuetzungsformate-online',
      'lernwerkzeuge-digital',
      'leistungserfassung-digital'
    ]);
    for (const rec of analogHigh.topRecommendations) {
      expect(forbiddenIds.has(rec.id), `analog matrix must not recommend ${rec.id} (${rec.name})`).toBe(false);
    }
  });

  it('produces valid, domain-plausible plans across diverse education sectors (lecture 180, online, async solo, math, sports, vocational)', () => {
    // 1. Negations ("ohne Internet", "ohne KI") must NEVER trigger ansatz: ["digital-ki"]
    const noNet = M.lesen('Grundschule Mathematik Bruchteile 45 Minuten, ohne Geräte, ohne Internet');
    expect(noNet.kriterien.ansatz || []).not.toContain('digital-ki');
    const noAi = M.lesen('Berufsschule Elektrotechnik Schaltung Problemlösen 90 Minuten, ohne KI');
    expect(noAi.kriterien.ansatz || []).not.toContain('digital-ki');
    const solo = M.lesen('Asynchrone Selbstlernphase 60 Minuten Konzept Klimasystem verstehen, Einzelarbeit zu Hause mit Laptop');
    expect(solo.kriterien.ansatz || []).not.toContain('kooperativ');

    // 2. Math direct instruction must NOT pick language/dictation methods (diktat-klassisch, lautleseverfahren)
    const math = M.zuordnen({
      text: 'Mathematik Klasse 7 Doppelstunde Lineare Gleichungen üben und rechnen, 90 Minuten, 28 Schüler, geringes Vorwissen, direkte Instruktion',
      bildungsstufe: 'sek1',
      zeitMin: 90,
      gruppe: 28
    });
    expect(math.modus).toBe('ablauf');
    if (math.modus === 'ablauf') {
      expect(math.pruefung.gueltig).toBe(true);
      const ids = (math.schritte || []).map((s) => s.baustein);
      expect(ids).not.toContain('diktat-klassisch');
      expect(ids).not.toContain('lautleseverfahren');
    }

    // 3. Large university lecture (180 students), online VHS course (distanz), and async solo study (gruppe: 1) MUST all be formally valid!
    const hardSettings: Array<[string, Parameters<typeof M.zuordnen>[0]]> = [
      [
        'Großvorlesung 180',
        {
          text: 'Universität Vorlesung Informatik 90 Minuten 180 Studierende Datenbank-Normalisierung verstehen, Beamer vorhanden, geringes Vorwissen',
          bildungsstufe: 'hochschule',
          zeitMin: 90,
          gruppe: 180
        }
      ],
      [
        'VHS Online Distanz',
        {
          text: 'Erwachsenenbildung VHS Online-Kurs Videokonferenz 90 Minuten 12 Teilnehmende KI-Kompetenz im Alltag, mittleres Vorwissen',
          modus: 'ablauf',
          zieltyp: 'konzeptaufbau',
          bildungsstufe: 'erwachsenenbildung',
          zeitMin: 90,
          gruppe: 12
        }
      ],
      [
        'Asynchron Einzelarbeit',
        {
          text: 'Asynchrone Selbstlernphase 60 Minuten Sekundarstufe II Konzept Klimasystem verstehen, Einzelarbeit zu Hause mit Laptop',
          bildungsstufe: 'sek2',
          zeitMin: 60,
          gruppe: 1
        }
      ]
    ];
    for (const [label, req] of hardSettings) {
      const res = M.zuordnen(req);
      expect(res.modus, label).toBe('ablauf');
      if (res.modus === 'ablauf') {
        expect(res.pruefung.gueltig, `${label} errors: ${JSON.stringify(res.pruefung.meldungen)}`).toBe(true);
        expect(res.pruefung.dauerMin, `${label} within budget`).toBeLessThanOrEqual(req.zeitMin!);
      }
    }
  });

  it('applies generic variety guard, semantic relevance re-ranking, and matrix-to-guidance feedback without hardcoded method lists', () => {
    // 1. Matrix-to-guidance feedback: ADHS/LRS Fördergruppe infers explicit guidance and avoids 25m unstructured group work
    const adhsParsed = M.lesen('Grundschule Fördergruppe 6 Kinder mit ADHS und LRS, 45 Minuten Leseverständnis üben, sehr wenig Vorwissen, ohne Geräte');
    expect(adhsParsed.kriterien.anleitung).toEqual(['explizit']);
    const adhsPlan = M.zuordnen({
      text: 'Grundschule Fördergruppe 6 Kinder mit ADHS und LRS, 45 Minuten Leseverständnis üben, sehr wenig Vorwissen, ohne Geräte',
      bildungsstufe: 'primar',
      zeitMin: 45,
      gruppe: 6
    });
    expect(adhsPlan.modus).toBe('ablauf');
    if (adhsPlan.modus === 'ablauf') {
      expect(adhsPlan.pruefung.gueltig).toBe(true);
      const ids = (adhsPlan.schritte || []).map((s) => s.baustein);
      expect(ids).not.toContain('gruppenarbeit-klassisch');
    }

    // 2. Facet-based anti-redundancy: Chemistry 135m must not stack TWO digital simulations in the same sequence
    const chem = M.zuordnen({
      text: 'Chemie Oberstufe 3 Stunden 135 Minuten Säure-Base-Titration forschend experimentieren, 18 Schüler, mittleres Vorwissen',
      bildungsstufe: 'sek2',
      zeitMin: 135,
      gruppe: 18
    });
    expect(chem.modus).toBe('ablauf');
    if (chem.modus === 'ablauf') {
      const ids = (chem.schritte || []).map((s) => s.baustein);
      const simCount = ids.filter((id) => id.includes('simulation')).length;
      expect(simCount, `should not stack 2 simulations: ${ids.join(' -> ')}`).toBeLessThanOrEqual(1);
    }

    // 3. Semantic relevance tie-breaker: History "Quellenanalyse und Debatte" differentiates from Psychology seminar
    const hist = M.zuordnen({
      text: 'Geschichte Oberstufe Klasse 12 Doppelstunde 90 Minuten Weimarer Republik Quellenanalyse und kontroverse Debatte, 20 Schüler, hohes Vorwissen, Diskurs',
      bildungsstufe: 'sek2',
      zeitMin: 90,
      gruppe: 20
    });
    const psych = M.zuordnen({
      text: 'Hochschule Seminar Psychologie 90 Minuten 25 Studierende Forschungsdesign kritisch diskutieren und anwenden, hohes Vorwissen',
      bildungsstufe: 'hochschule',
      zeitMin: 90,
      gruppe: 25
    });
    expect(hist.modus).toBe('ablauf');
    expect(psych.modus).toBe('ablauf');
    if (hist.modus === 'ablauf' && psych.modus === 'ablauf') {
      const histIds = (hist.schritte || []).map((s) => s.baustein);
      const psychIds = (psych.schritte || []).map((s) => s.baustein);
      expect(histIds.join(',')).not.toBe(psychIds.join(','));
    }
  });
});

describe('FMT 2.0: Anfragefelder und Leseregeln', () => {
  const D = loadFmtData(DATA_DIR);
  const M = createMatcher(D, createValidator(D));
  const bausteineVon = (r: MatchResult) =>
    r.modus === 'ablauf' ? (r.schritte || []).map((s) => s.baustein) : r.vorschlaege.map((v) => v.baustein);

  it('alte Anfrage mit lernort und zielart psychomotorik ergibt denselben Ablauf wie die neue', () => {
    const alt = M.zuordnen({ text: 'Sport Klasse 7, Handstand, 90 Minuten', lernort: 'bewegungsraum', zielart: 'psychomotorik' });
    const neu = M.zuordnen({ text: 'Sport Klasse 7, Handstand, 90 Minuten', raum: 'bewegungsraum', zielart: 'bewegung' });
    expect(bausteineVon(alt).length).toBeGreaterThan(0);
    expect(bausteineVon(alt)).toEqual(bausteineVon(neu));
  });

  it('alte Codes in zielart werden umgewandelt; einstellungen führt zur Urteilsbildung', () => {
    const r = M.zuordnen({ text: 'Ethik Klasse 10 Sterbehilfe, 90 Minuten', zielart: 'einstellungen' });
    expect(r.kriterien.zielart).toBe('urteilen');
    expect(r.modus === 'ablauf' && r.kette?.id).toBe('urteilsbildung');
  });

  it('neue Felder werden geprüft; lernort gilt, steht aber nicht in felder() und schema()', () => {
    const felder = M.felder().map((f) => f.feld);
    for (const f of ['raum', 'raumBietet', 'fachausstattungArt', 'ohneSchrift', 'termine']) expect(felder).toContain(f);
    expect(felder).not.toContain('lernort');
    expect(Object.keys(M.schema().properties)).not.toContain('lernort');
    const zielarten = M.felder().find((f) => f.feld === 'zielart')!.werte!.map((w) => w.code);
    for (const z of ['fakten', 'konzepte', 'prozeduren', 'problemloesen', 'bewegung', 'kondition', 'urteilen', 'gestalten', 'handlung', 'einstellungen', 'psychomotorik', 'metakognitiv']) {
      expect(zielarten).toContain(z);
    }
    expect(() => M.zuordnen({ text: 'Mathe Klasse 8, 45 Minuten', raum: 'lehrkueche', raumBietet: ['stellflaeche'], fachausstattungArt: 'kueche', termine: 3 })).not.toThrow();
    expect(() => M.zuordnen({ text: 'Mathe Klasse 8, 45 Minuten', raumBietet: ['sofa'] })).toThrow(/raumBietet/);
    expect(() => M.zuordnen({ text: 'Mathe Klasse 8, 45 Minuten', lernort: 'kirche' })).toThrow(/kirche/);
    expect(() => M.zuordnen({ text: 'Mathe Klasse 8, 45 Minuten', termine: -1 })).toThrow(/termine/);
  });

  it.each([
    ['Politik Klasse 10: Tempolimit diskutieren und beurteilen, 90 Minuten', 'urteilsbildung'],
    ['Jura Klasse 11: Fallbearbeitung Kaufrecht, 90 Minuten', 'problemloesen'],
    ['Klasse 8 Projekttag Müll, 90 Minuten', 'projektlernen'],
    ['Biologie Klasse 6: Bäume im Park erkunden, 90 Minuten', 'fuenf-e']
  ])('Handlungsverb ohne Zielangabe: %s → Ablauf %s', (text, kette) => {
    const r = M.zuordnen({ text });
    expect(r.modus === 'ablauf' && r.kette?.id).toBe(kette);
  });
});

describe('FMT 2.0: Zuordnung auf Situation, Bedarf, Kettenwahl und Bindung', () => {
  const D = loadFmtData(DATA_DIR);
  const M = createMatcher(D, createValidator(D));
  const ablaufBausteine = (r: MatchResult) =>
    r.modus === 'ablauf' ? [...(r.schritte || []).map((s) => s.baustein), ...(r.schritte || []).flatMap((s) => s.slots.map((x) => x.baustein))] : [];
  const stellflaeche = new Set(D.bausteine.filter((b) => (b.raumbedarf || []).includes('stellflaeche')).map((b) => b.kennung));

  it('Hörsaal: kein Schritt trägt eine Methode mit Stellfläche', () => {
    const r = M.zuordnen({ text: 'Ethik Klasse 10, Sterbehilfe, mit Fishbowl und Kugellager, 90 Minuten', raum: 'hoersaal', gruppe: 30 });
    expect(r.modus).toBe('ablauf');
    expect(ablaufBausteine(r).length).toBeGreaterThan(0);
    expect(ablaufBausteine(r).filter((id) => stellflaeche.has(id))).toEqual([]);
    const nicht = (r as AblaufMatchResult).nichtVerankert || [];
    expect(nicht).toContainEqual({ baustein: 'fishbowl', grund: 'braucht: Stellfläche', merkmal: 'raumbedarf' });
    expect(nicht).toContainEqual({ baustein: 'kugellager', grund: 'braucht: Stellfläche', merkmal: 'raumbedarf' });
  });

  it('Phase im Hörsaal: der Ausschluss nennt das Merkmal; ein angenommener Raum schließt nicht aus', () => {
    const genannt = M.zuordnen({ modus: 'phase', lernfunktion: ['verstehen', 'konsolidierung', 'anwendung'], raum: 'hoersaal' }) as PhaseMatchResult;
    expect(genannt.ausgeschlossen.rahmen).toContainEqual({ baustein: 'fishbowl', name: expect.any(String), grund: 'braucht: Stellfläche', merkmal: 'raumbedarf' });
    expect(genannt.vorschlaege.map((v) => v.baustein)).not.toContain('kugellager');
    const angenommen = M.zuordnen({ modus: 'phase', lernfunktion: ['verstehen', 'konsolidierung', 'anwendung'] }) as PhaseMatchResult;
    expect(angenommen.ausgeschlossen.rahmen.map((x) => x.baustein)).not.toContain('fishbowl');
    expect(angenommen.pflichtangaben?.angenommen).toContainEqual(expect.objectContaining({ feld: 'raum', wert: 'klassenraum' }));
  });

  it('raumBietet: [] ist ein genannter Raum, der nichts bietet', () => {
    const r = M.zuordnen({ modus: 'phase', lernfunktion: ['konsolidierung'], raum: 'klassenraum', raumBietet: [] }) as PhaseMatchResult;
    expect(r.ausgeschlossen.rahmen).toContainEqual(expect.objectContaining({ baustein: 'abrufquiz', merkmal: 'raumbedarf', grund: 'braucht: Schreibplatz' }));
    expect(r.pflichtangaben?.fehlt).not.toContain('raum');
  });

  it('Bewegungskette: jeder Haupt- und Sicherungsschritt trägt Psychomotorik', () => {
    const kette = D.ketten.find((k) => k.id === 'fertigkeit-bewegung')!;
    for (const text of ['Sport Klasse 7, Handstand, Sporthalle, 90 Minuten', 'Sport Klasse 5, Prellen im Basketball, 45 Minuten']) {
      const r = M.zuordnen({ text }) as AblaufMatchResult;
      expect(r.kette?.id, text).toBe('fertigkeit-bewegung');
      const gebunden = (r.schritte || []).filter((s) => ['haupt', 'sicherung'].includes(kette.schritte.find((k) => k.id === s.schritt)?.rolle || ''));
      expect(gebunden.length, text).toBeGreaterThan(0);
      for (const s of gebunden) expect(D.bausteine.find((b) => b.kennung === s.baustein)!.aufgabe, `${text}: ${s.baustein}`).toContain('psychomotorik');
    }
  });

  it('widersprüchliche Situation liefert eine Antwort mit Grund statt einer Ausnahme', () => {
    // Real data after Tor D1: some movement methods need no room property (teil-ganz-ueben, demonstration-nachmachen),
    // so a classroom that offers nothing still carries the skill chain; every bound step then carries psychomotorik.
    const bewegung = M.zuordnen({ text: 'Sport Klasse 7, Handstand, 45 Minuten', raum: 'klassenraum', raumBietet: [], zielart: 'bewegung' }) as AblaufMatchResult;
    expect(bewegung.modus).toBe('ablauf');
    const kette = D.ketten.find((k) => k.id === bewegung.kette?.id)!;
    for (const s of bewegung.schritte || []) {
      if (!kette.schritte.find((k) => k.id === s.schritt)?.wissensart?.length) continue;
      const b = D.bausteine.find((x) => x.kennung === s.baustein)!;
      expect(b.raumbedarf || [], s.baustein).toEqual([]);
    }
    // The training steps have no carrying method without a movement area: they stay open and name the need.
    const r = M.zuordnen({ text: 'Sport Klasse 8, Ausdauerlauf, 45 Minuten', raum: 'klassenraum', raumBietet: [], zielart: 'kondition' });
    expect(r.modus).toBe('ablauf');
    const gruende = (r as AblaufMatchResult).offenGruende || [];
    expect(gruende.length).toBeGreaterThan(0);
    const satz = 'Keine Methode im Katalog liefert ‚Körperliche Leistungsfähigkeit trainiert‘ für Motorische Fertigkeiten unter diesen Rahmenbedingungen.';
    const grund = gruende.find((g) => g.schritt === 't2')?.grund || '';
    expect(grund.startsWith(satz), grund).toBe(true);
    expect(grund).toContain('braucht: Bewegungsfläche');
  });

  it('gebundener Schritt mit Fachbereich: ohne tragende Methode bleibt er offen, keine Ersatzmethode', () => {
    const r = M.zuordnen({ text: 'Sport Klasse 8, Ausdauerlauf, 45 Minuten', fachbereich: 'sport', raum: 'klassenraum', raumBietet: [], zielart: 'kondition' }) as AblaufMatchResult;
    expect(r.kette?.id).toBe('kondition-training');
    expect((r.offenGruende || []).map((g) => g.schritt)).toEqual(expect.arrayContaining(['t2', 't3']));
    expect((r.annahmen || []).filter((x) => /praktische Methode des Fachbereichs/.test(x))).toEqual([]);
    const kette = D.ketten.find((k) => k.id === 'kondition-training')!;
    for (const s of r.schritte || []) {
      if (kette.schritte.find((k) => k.id === s.schritt)?.rolle !== 'haupt') continue;
      expect(D.bausteine.find((b) => b.kennung === s.baustein)!.aufgabe, s.baustein).toContain('psychomotorik');
    }
  });

  it('Nachweis: aus der Anfrage (Klausur) oder aus der Zielart (Kondition: praktisch); unbekannte Form wird abgelehnt', () => {
    const n15 = M.zuordnen({ text: 'Hochschule, Seminar Statistik, 90 Minuten, 25 Studierende, Prüfungsform Klausur' });
    expect(n15.kriterien.nachweis).toBe('schriftlich');
    expect(n15.nachweis).toMatchObject({ formen: ['schriftlich'], quelle: 'anfrage' });
    const n18 = M.zuordnen({ text: 'Sport Klasse 8, Ausdauer mit Leistungskontrolle, Sportplatz, 45 Minuten' });
    expect(n18.nachweis).toMatchObject({ formen: ['praktisch'], quelle: 'zielart' });
    expect(M.zuordnen({ text: 'Geschichte Klasse 9, Weimarer Republik, 45 Minuten' }).nachweis).toBeUndefined();
    expect(M.felder().find((f) => f.feld === 'nachweis')!.werte!.map((w) => w.code)).toEqual(['schriftlich', 'muendlich', 'praktisch', 'produkt']);
    expect(() => M.zuordnen({ text: 'Mathe Klasse 8, 45 Minuten', nachweis: 'tanz' })).toThrow(/nachweis/);
  });

  it('n18: im Prüfschritt steht eine Prüfmethode mit der Nachweisform der Zielart (praktisch)', () => {
    const r = M.zuordnen({ text: 'Sport Klasse 8, Ausdauer mit Leistungskontrolle, Sportplatz, 45 Minuten' }) as AblaufMatchResult;
    const kette = D.ketten.find((k) => k.id === r.kette?.id)!;
    const pruef = (r.schritte || []).find((s) => s.schritt === 'leistungskontrolle' || kette.schritte.find((k) => k.id === s.schritt)?.ziel === 'lernstand-diagnostiziert');
    expect(pruef, JSON.stringify(r.schritte)).toBeDefined();
    expect(nachweisformen(D.bausteine.find((b) => b.kennung === pruef!.baustein)!)).toContain('praktisch');
    // A stated form of proof orders the check step as well: an oral check in maths.
    const m = M.zuordnen({ text: 'Mathematik Klasse 8, lineare Funktionen, 45 Minuten, Lernzielkontrolle am Ende', nachweis: 'muendlich' }) as AblaufMatchResult;
    const letzte = (m.schritte || []).find((s) => s.schritt === 'leistungskontrolle' || D.ketten.find((k) => k.id === m.kette?.id)!.schritte.find((k) => k.id === s.schritt)?.ziel === 'lernstand-diagnostiziert');
    expect(nachweisformen(D.bausteine.find((b) => b.kennung === letzte!.baustein)!), letzte!.baustein).toContain('muendlich');
  });

  it('ungeeignet im Fach warnt in jedem Fachbereich (eignung-fach); ohne Begründung als Setzung der Redaktion', () => {
    // Fixture: the entry of makerspace-tueftelwerkstatt as it stood before Tor D2 (without a reason).
    const MX = createMatcher(mitEintraegen(D), createValidator(mitEintraegen(D)));
    const r = MX.zuordnen({ modus: 'phase', lernfunktion: ['problemloesen'], fachbereich: 'sport' }) as PhaseMatchResult;
    const v = r.vorschlaege.find((x) => x.baustein === 'makerspace-tueftelwerkstatt');
    expect(v?.warnungen).toContain('Makerspace / Tüftelwerkstatt (FabLab) passt weniger zum Fachbereich „Sport und Bewegung“. (Setzung der Redaktion)');
    expect((v?.warnungen || []).some((w) => w.includes('Durchsicht'))).toBe(false);
    // The other subject areas warn as well since Task B3 (Abbau Zeile 7: no rank tier of their own).
    const m = MX.zuordnen({ modus: 'phase', lernfunktion: ['problemloesen'], fachbereich: 'gesellschaft' }) as PhaseMatchResult;
    const g = m.vorschlaege.find((x) => x.baustein === 'makerspace-tueftelwerkstatt');
    expect(g?.regelmeldungen).toContainEqual(expect.objectContaining({ regel: 'eignung-fach', grundlage: 'A' }));
  });

  it('ohne Raumangabe steht der angenommene Raum unter pflichtangaben.angenommen', () => {
    const r = M.zuordnen({ text: 'Chemie Klasse 9, Säuren und Basen, 45 Minuten' });
    expect(r.pflichtangaben?.fehlt).toEqual(expect.arrayContaining(['anzahl', 'raum']));
    expect(r.pflichtangaben?.fehlt).not.toContain('fach-und-thema');
    expect(r.pflichtangaben?.angenommen).toContainEqual(expect.objectContaining({ feld: 'raum', wert: 'klassenraum' }));
    const sport = M.zuordnen({ text: 'Sport Klasse 7, Handstand, 90 Minuten' });
    expect(sport.pflichtangaben?.angenommen).toContainEqual(expect.objectContaining({ feld: 'raum', wert: 'bewegungsraum' }));
    expect(sport.pflichtangaben?.angenommen).toContainEqual(expect.objectContaining({ feld: 'zielart', wert: 'bewegung' }));
    const genannt = M.zuordnen({ text: 'Chemie Klasse 9, Säuren und Basen, 45 Minuten', raum: 'fachraum-nawi', gruppe: 24 });
    expect(genannt.pflichtangaben?.fehlt).not.toContain('raum');
    expect((genannt.pflichtangaben?.angenommen || []).map((x) => x.feld)).not.toContain('raum');
  });

  it('ohne Zielart und ohne Hinweis im Text wird konzepte angenommen', () => {
    const r = M.zuordnen({ text: 'Geschichte Klasse 9, Weimarer Republik, 45 Minuten' });
    expect(r.modus === 'ablauf' && r.kette?.id).toBe('konzeptaufbau');
    expect(r.pflichtangaben?.angenommen).toContainEqual(expect.objectContaining({ feld: 'zielart', wert: 'konzepte' }));
    expect(r.kriterien.zielart).toBeUndefined();
  });

  it('Kettenwahl über waehleKette: Zielart mit Ansatz wählt die Kette des Ansatzes', () => {
    const r = M.zuordnen({ text: 'Physik Klasse 8, Stromkreis, 90 Minuten', zielart: 'konzepte', ansatz: ['forschend'] });
    expect(r.modus === 'ablauf' && r.kette?.id).toBe('fuenf-e');
  });

  it('eine genannte Methode, die die Wissensart des Schritts nicht trägt, bleibt als Zusatzphase im Ablauf', () => {
    const r = M.zuordnen({ text: 'Sport Klasse 7, Handstand mit Gruppenpuzzle, 90 Minuten' }) as AblaufMatchResult;
    expect(r.kette?.id).toBe('fertigkeit-bewegung');
    const s = (r.schritte || []).find((x) => x.baustein === 'gruppenpuzzle');
    expect(s?.schritt).toBe('zusatz');
    expect(r.verankert).toContainEqual({ baustein: 'gruppenpuzzle', schritt: expect.stringMatching(/^Zusatzphase/) });
  });
});

describe('Piktogramme', () => {
  const D = loadFmtData(DATA_DIR);
  it('jedes Piktogramm der Daten hat eine Zeichnung in der Oberfläche', () => {
    const known = new Set<string>(PIKTOGRAMME);
    const missing = [...new Set(D.bausteine.map((b) => b.piktogramm).filter(Boolean))].filter((p) => !known.has(p));
    expect(missing).toEqual([]);
    const svg = readFileSync(path.join(ROOT, 'apps/web/src/components/MethodPictogram.tsx'), 'utf8');
    expect(PIKTOGRAMME.filter((p) => !svg.includes(`type === '${p}'`))).toEqual([]);
  });
});

describe('Pflichtangaben und Regelmeldungen in der Antwort (Task B3)', () => {
  const D = loadFmtData(DATA_DIR);
  const M = createMatcher(D, createValidator(D));
  const regelIds = new Set([...D.regeln.map((r) => r.id), 'eignung-stufe', 'eignung-vorwissen', 'eignung-fach']);
  // Fixture: Eignung entries without a reason as they stood before Tor D2 (laufdiktat in Mathematik and others).
  const DX = mitEintraegen(D);
  const MX = createMatcher(DX, createValidator(DX));
  const alsText = (m: { text: string; quelle?: string }) => (m.quelle ? `${m.text} (${m.quelle})` : m.text);

  it('n17: Chemie Klasse 9 ohne Raum und Anzahl nennt beide Lücken und den angenommenen Raum', () => {
    const r = M.zuordnen({ text: 'Chemie Klasse 9, Säuren und Basen, 45 Minuten' });
    expect(r.pflichtangaben!.fehlt).toEqual(expect.arrayContaining(['anzahl', 'raum']));
    expect(r.pflichtangaben!.angenommen.map((x) => x.feld)).toContain('raum');
  });

  it('jede Warnung im Ablauf steht als Regelmeldung mit Regel und Grundlage', () => {
    const r = MX.zuordnen({ text: 'Mathe Klasse 5 Laufdiktat zu Bruchrechnen, 45 Minuten' }) as AblaufMatchResult;
    expect(r.modus).toBe('ablauf');
    const meldungen = r.regelmeldungen || [];
    expect(meldungen.length).toBeGreaterThan(0);
    for (const m of meldungen) {
      expect(regelIds.has(m.regel), m.regel).toBe(true);
      expect(['E', 'S', 'A', 'formal']).toContain(m.grundlage);
      expect(m.text.length).toBeGreaterThan(0);
    }
    expect(meldungen).toContainEqual(
      expect.objectContaining({ regel: 'eignung-fach', wirkung: 'warnt', baustein: 'laufdiktat', grundlage: 'A' })
    );
    // The text lists are filled from the messages: text plus source in brackets.
    expect(r.hinweise).toEqual(meldungen.map(alsText));
    // Every warning of a chosen method is a message (same rule machine as the ranking).
    const gewaehlt = new Set(JSON.stringify(r.arrangement).match(/"baustein":"[^"]+"/g)!.map((x) => x.slice(12, -1)));
    const R = erstelleRegeln(D.regeln);
    const k = r.kriterien as Record<string, string | undefined>;
    const lage = { vorwissen: k.vorwissen, bildungsstufe: k.bildungsstufe, komplexitaet: k.komplexitaet, sprachniveau: k.sprachniveau, fachbereich: k.fachbereich };
    for (const id of gewaehlt) {
      for (const w of R.pruefe(DX.bausteine.find((b) => b.kennung === id)!, lage)) {
        expect(meldungen.some((m) => m.regel === w.regel && m.baustein === id), `${id} ${w.regel}`).toBe(true);
      }
    }
  });

  it('Sicherheitshinweis und Hinweis „unüblich“ stehen als Regelmeldungen sicherheitshinweis und genannter-wunsch-bleibt', () => {
    const chemie = M.zuordnen({ text: 'Chemie Klasse 8: Schülerexperiment zu Säuren und Laugen, 90 Minuten' });
    const s = (chemie.regelmeldungen || []).find((m) => m.regel === 'sicherheitshinweis');
    expect(s).toMatchObject({ wirkung: 'weist-hin', grundlage: 'A', quelle: expect.stringContaining('RiSU') });
    expect(chemie.hinweise || []).toContain(alsText(s!));
    const deutsch = M.zuordnen({ text: 'Deutsch Klasse 8 Gedichte, 45 Minuten' });
    expect((deutsch.regelmeldungen || []).some((m) => m.regel === 'sicherheitshinweis')).toBe(false);

    const mathe = MX.zuordnen({ text: 'Mathe Klasse 5 Laufdiktat zu Bruchrechnen, 45 Minuten' });
    const g = (mathe.regelmeldungen || []).find((m) => m.regel === 'genannter-wunsch-bleibt');
    expect(g).toMatchObject({ wirkung: 'weist-hin', grundlage: 'A', baustein: 'laufdiktat' });
    expect(g!.text).toMatch(/Laufdiktat/);
    expect((mathe.regelmeldungen || []).some((m) => m.regel === 'eignung-fach' && m.baustein === 'laufdiktat')).toBe(true);
    expect((mathe.hinweise || []).join(' ')).toMatch(/Laufdiktat.*Mathematik/);
  });

  it('n20: offene Methoden tragen bei komplexem Inhalt und geringem Vorwissen die Warnung, angeleitete stehen vorn', () => {
    const text = 'Informatik Klasse 10, Sortieralgorithmen, 90 Minuten, komplexer Inhalt, geringes Vorwissen';
    const p = M.zuordnen({ text, modus: 'phase', lernfunktion: 'problemloesen' }) as PhaseMatchResult;
    expect(p.kriterien).toMatchObject({ komplexitaet: 'hoch', vorwissen: 'gering' });
    const offen = p.vorschlaege.filter((v) => D.bausteine.find((b) => b.kennung === v.baustein)!.anleitung.every((x) => x === 'offen'));
    expect(offen.length).toBeGreaterThan(0);
    for (const v of offen) {
      const m = (v.regelmeldungen || []).find((x) => x.regel === 'wenig-anleitung-komplexer-inhalt');
      expect(m, v.baustein).toMatchObject({ wirkung: 'warnt', grundlage: 'E', quelle: expect.stringContaining('Chen') });
      expect(v.warnungen).toContain(alsText(m!));
    }
    // Guided methods (without a warning) stand before every warned method.
    const ersterGewarnt = p.vorschlaege.findIndex((v) => v.warnungen.length > 0);
    expect(ersterGewarnt).toBeGreaterThan(0);
    expect(p.vorschlaege.slice(ersterGewarnt).every((v) => v.warnungen.length > 0)).toBe(true);
    const a = M.zuordnen({ text });
    expect((a.regelmeldungen || []).some((m) => m.regel === 'wenig-anleitung-komplexer-inhalt')).toBe(true);
  });

  it('ein begründeter Eintrag „ungeeignet im Fach“ warnt und steht in der Rangstufe der Warnungen', () => {
    const begruendet = {
      ...D,
      bausteine: D.bausteine.map((b) =>
        b.kennung === 'makerspace-tueftelwerkstatt'
          ? { ...b, fachbereichUngeeignet: ['gesellschaft'], eignungsgrund: { fachbereich: { text: 'Braucht eine Werkstatt.', grundlage: 'S' as const, quelle: 'Redaktion 2026' } } }
          : b
      )
    };
    const M2 = createMatcher(begruendet, createValidator(begruendet));
    const r = M2.zuordnen({ modus: 'phase', lernfunktion: ['problemloesen'], fachbereich: 'gesellschaft' }) as PhaseMatchResult;
    const i = r.vorschlaege.findIndex((x) => x.baustein === 'makerspace-tueftelwerkstatt');
    expect(i).toBeGreaterThanOrEqual(0);
    const v = r.vorschlaege[i];
    expect(v.regelmeldungen).toContainEqual(expect.objectContaining({ regel: 'eignung-fach', grundlage: 'S', quelle: 'Redaktion 2026' }));
    expect(v.warnungen.join(' ')).toMatch(/Braucht eine Werkstatt\..*\(Redaktion 2026\)/);
    // Same tier as the other warnings: no method without a warning follows, and a method with another warning
    // but a better soft score may follow it (no tier of its own below the warnings).
    expect(r.vorschlaege.slice(i).every((x) => x.warnungen.length > 0)).toBe(true);
  });

  it('Schrift bei niedrigem Sprachniveau warnt ohne Tausch: die Lesemethode bleibt und trägt die Warnung', () => {
    const r = M.zuordnen({ text: 'VHS Integrationskurs Deutsch A2: beim Arzt, 90 Minuten, 15 Teilnehmende' }) as AblaufMatchResult;
    expect(r.kriterien.sprachniveau).toBe('a2');
    expect((r.schritte || []).map((x) => x.baustein)).toContain('sq3r-lesemethode');
    expect(r.regelmeldungen).toContainEqual(expect.objectContaining({ regel: 'schrift-niedriges-sprachniveau', baustein: 'sq3r-lesemethode', wirkung: 'warnt' }));
    // No note that such methods stand further back: the rule does not move them (keinTausch).
    expect((r.regelmeldungen || []).some((m) => m.regel === 'schrift-niedriges-sprachniveau' && m.wirkung === 'ordnet')).toBe(false);
  });

  it('R-06 prüft mit derselben Regelmaschine: Eignung und Passung', () => {
    expect(FMT_RULES.find((r) => r.id === 'R-06')!.prueft).toBe('Eignung und Passung: Methode passt zu Vorwissen, Bildungsstufe und Inhalt');
    const V = createValidator(D);
    const offen = D.bausteine.find((b) => b.anleitung.length && b.anleitung.every((x) => x === 'offen') && !(b.sequenz || []).includes('problem-vor-instruktion') && !(b.vorbedingung || []).length)!;
    const r = V.validate({
      typ: 'Arrangement',
      name: 't',
      reichweite: 'r3',
      kontext: { vorwissen: 'gering' },
      ablauf: { typ: 'Sequenz', teile: [{ typ: 'Einsatz', baustein: offen.kennung, dauerMin: offen.dauerMin }] }
    });
    const r06 = r.meldungen.filter((m) => m.regel === 'R-06');
    expect(r06.map((m) => m.meldung).join(' ')).toMatch(/Tetzlaff/);
  });

  it('Regeltexte sprechen die Lehrkraft mit „du“ an wie der Baukasten (B4-Fix 3)', () => {
    for (const r of D.regeln) expect(r.text, r.id).not.toMatch(/\b(?:Sie (?:bekommen|haben)|Ihre?r?\b|(?:Geben|Lassen|Planen|Prüfen|Nutzen|Klären|Setzen) Sie)/);
    expect(D.regeln.find((r) => r.id === 'genannter-wunsch-bleibt')!.text).toMatch(/^\{methode\} hast du genannt\./);
  });

  it('Regel ohne Methode (Lage): eigene Wirkung „warnt“, wahrer Satz zur genannten Methode, auch im Phasenmodus (B3-Review a, c)', () => {
    const r = M.zuordnen({ text: 'Mathematik Klasse 7, Brüche, 45 Minuten, 25 Lernende', vorwissen: 'gering' }) as AblaufMatchResult;
    expect(r.kriterien.vorwissen).toBe('gering');
    const lage = (r.regelmeldungen || []).filter((m) => m.regel === 'wenig-anleitung-geringes-vorwissen' && !m.baustein);
    expect(lage).toHaveLength(1);
    expect(lage[0].wirkung).toBe('warnt');
    expect(lage[0].grundlage).toBe('E');
    expect(lage[0].text).toMatch(/stehen weiter hinten – nicht aber eine Methode, die du selbst genannt hast\.$/);
    const p = M.zuordnen({ modus: 'phase', lernfunktion: ['erwerb'], vorwissen: 'gering' }) as PhaseMatchResult;
    const pl = (p.regelmeldungen || []).find((m) => m.regel === 'wenig-anleitung-geringes-vorwissen' && !m.baustein)!;
    expect(pl).toBeDefined();
    expect(pl.wirkung).toBe('warnt');
    // The situation-level reading stays in the notes of a single phase (method warnings stand at each proposal).
    expect((p.hinweise || []).some((h) => h.startsWith(pl.text))).toBe(true);
    expect((p.regelmeldungen || []).every((m) => m.wirkung !== 'ordnet' || m.regel === 'nachweis-passt-zum-ziel')).toBe(true);
  });

  it('R-06 trägt die Grundlage der Meldung selbst: Setzung der Redaktion (A) und evidenz-geltung (A) (B3-Review d)', () => {
    const V = createValidator(DX);
    const b = DX.bausteine.find((x) => (x.ungeeignetBeiStufe || []).includes('primar') && !x.eignungsgrund?.stufe)!;
    const r = V.validate({
      typ: 'Arrangement',
      name: 't',
      reichweite: 'r3',
      kontext: { bildungsstufe: 'primar' },
      ablauf: { typ: 'Sequenz', teile: [{ typ: 'Einsatz', baustein: b.kennung, dauerMin: b.dauerMin }] }
    });
    const stufe = r.meldungen.find((m) => m.regel === 'R-06' && /Setzung der Redaktion/.test(m.meldung))!;
    expect(stufe).toBeDefined();
    expect(stufe.grundlage).toBe('A');
    const offen = D.bausteine.find((x) => x.anleitung.length && x.anleitung.every((y) => y === 'offen') && !(x.vorbedingung || []).length && !(x.sequenz || []).includes('problem-vor-instruktion'))!;
    const e = V.validate({
      typ: 'Arrangement',
      name: 't',
      reichweite: 'r3',
      kontext: { vorwissen: 'gering' },
      ablauf: { typ: 'Sequenz', teile: [{ typ: 'Einsatz', baustein: offen.kennung, dauerMin: offen.dauerMin }] }
    });
    expect(e.meldungen.filter((m) => m.regel === 'R-06' && /Tetzlaff/.test(m.meldung)).every((m) => m.grundlage === 'E')).toBe(true);
  });
});
