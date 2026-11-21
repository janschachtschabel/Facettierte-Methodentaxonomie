import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { createValidator, createSearch, createMatcher, FMT_RULES } from '../src/index.js';
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
    expect(ids({ text: 'jigsaw' })).toEqual(['gruppenpuzzle']);
    expect(ids({ text: 'Lernzirkel' })).toEqual(['stationenlernen']);
    expect(ids({ liefert: 'wissen-konsolidiert' })).toContain('abrufquiz');
    expect(ids({ bildungsstufe: 'primar' })).not.toContain('productive-failure');
    expect(ids({ ansatz: 'kooperativ' })).toContain('gruppenpuzzle');
    expect(ids({ status: 'kuratiert' }).length).toBeGreaterThanOrEqual(22);
    expect(ids({ ohneKI: true })).not.toContain('ki-tutor');
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
  });
});
