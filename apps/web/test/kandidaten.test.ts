import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GLEICHWERTIG_GEPRUEFT,
  createMatcher,
  createValidator,
  istMethode,
  kettenSchritt,
  scoreDifferentiationMatrix,
  traegtWissensart,
  ungedeckterBedarf,
  baueSituation,
  type CatalogBundle,
  type FmtData
} from '@fmt/core';
import { buildScenarioRows, STANDARD_LEARNER_GROUPS, type LearnerGroup } from '../src/planner/scenarioModel.js';
import { parallelMethoden, schrittKandidaten, situationsAnfrage, weitereMethoden, type KandidatenRahmen } from '../src/planner/kandidaten.js';
import { ausschlussInSituation } from '@fmt/core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BUNDLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist-data', 'catalog.bundle.json'), 'utf8')) as CatalogBundle;
const DATA = { ...BUNDLE, VERSION: BUNDLE.version } as unknown as FmtData;
const matcher = createMatcher(DATA, createValidator(DATA));
const BY = new Map(BUNDLE.bausteine.map((b) => [b.kennung, b]));
const REGELWERK = { teilgruppen: BUNDLE.teilgruppen, regeln: BUNDLE.regeln, schemes: BUNDLE.schemes };

const plan = (text: string, extra: Record<string, unknown> = {}) => {
  const r = matcher.zuordnen({ text, ...extra });
  if (r.modus !== 'ablauf' || !r.arrangement) throw new Error('kein Ablauf');
  const rows = buildScenarioRows(r.arrangement, BUNDLE, BY, (_s, c) => c, STANDARD_LEARNER_GROUPS, {}, {});
  const { text: _t, ...anfrage } = r.kriterien as Record<string, unknown>;
  const rahmen: KandidatenRahmen = { constraints: { anfrage }, zieltyp: r.arrangement.zieltyp, ketten: BUNDLE.ketten, regelwerk: REGELWERK };
  return { r, rows, rahmen };
};

describe('Kandidaten im Baukasten über den Kernfilter (App-Nachzug N4)', () => {
  it('Zeilen kennen ihren Kettenschritt', () => {
    const { rows, r } = plan('Mathematik Bruchrechnen Klasse 6, 90 Minuten');
    const schritte = (r.modus === 'ablauf' && r.schritte) || [];
    expect(rows.filter((x) => x.chainStep).map((x) => x.chainStep)).toEqual(schritte.map((s) => s.schritt));
  });

  it('weitere Methoden: nur Methoden, Bedarf im Hörsaal gedeckt, ohne Lesen, Wissensart des Schritts', () => {
    const { rows, rahmen } = plan('Statistik Hypothesentests, 90 Minuten', { raum: 'hoersaal', ohneSchrift: ['lesen'] });
    const anfrage = situationsAnfrage(rahmen.constraints);
    const lage = baueSituation(anfrage, BUNDLE);
    let gesamt = 0;
    for (const row of rows) {
      const liste = weitereMethoden(row, BUNDLE.bausteine, rahmen);
      gesamt += liste.length;
      const schritt = kettenSchritt(BUNDLE, rahmen.zieltyp, row.chainStep);
      for (const b of liste) {
        expect(istMethode(b), b.kennung).toBe(true);
        expect(ungedeckterBedarf(b, anfrage, lage, BUNDLE), b.kennung).toBeNull();
        expect(b.schriftbedarf || [], b.kennung).not.toContain('liest');
        if (schritt) expect(traegtWissensart(b, schritt), b.kennung).toBe(true);
      }
    }
    expect(gesamt).toBeGreaterThan(0);
  });

  it('parallele Methoden für eine Teilgruppe sind gleichwertig geprüft und decken ihren Bedarf', () => {
    const { rows, rahmen } = plan('Biologie Klasse 8, Fotosynthese verstehen, 90 Minuten', { raum: 'klassenraum' });
    const gruppe: LearnerGroup = { id: 'daz', label: 'DaZ', profile: 'DaZ', focus: 'sprachsensibel', active: true, personaId: 'languageAndCulture', matrixValues: {} };
    const matrix = scoreDifferentiationMatrix({ personaId: gruppe.personaId, selectedValues: {}, limit: 5 });
    let geprueft = 0;
    for (const row of rows.filter((x) => x.block)) {
      const res = parallelMethoden(matrix, row, gruppe, BUNDLE.bausteine, rahmen);
      expect(res.gleichwertigGeprueft).toBe(true);
      for (const a of res.alternativen) {
        expect(a.pruefung).toBe(GLEICHWERTIG_GEPRUEFT);
        expect(istMethode(BY.get(a.kennung)!)).toBe(true);
        geprueft++;
      }
    }
    expect(geprueft).toBeGreaterThan(0);
  });
});

describe('Partitur: Auswahl je Schritt über den Kernfilter (Schlussreview I2)', () => {
  it('teilt die Methoden in passende und „passt hier nicht“ mit dem Grund des Kerns', () => {
    const { r, rahmen } = plan('Bruchrechnen Klasse 2, können noch nicht lesen, 45 Minuten', { raum: 'klassenraum', ohneSchrift: ['lesen'], zieltyp: 'direkte-instruktion' });
    if (r.modus !== 'ablauf' || !r.arrangement) throw new Error('kein Ablauf');
    const anfrage = situationsAnfrage(rahmen.constraints);
    const situation = baueSituation(anfrage, BUNDLE);
    const methoden = BUNDLE.bausteine.filter(istMethode);
    for (const schrittId of (r.arrangement.ablauf as { teile?: Array<{ kettenschritt?: string }> }).teile?.map((t) => t.kettenschritt) || []) {
      const schritt = kettenSchritt(BUNDLE, r.arrangement.zieltyp, schrittId);
      const { passend, ausgeschlossen } = schrittKandidaten(methoden, rahmen, schrittId);
      expect(passend.length + ausgeschlossen.length).toBe(methoden.length);
      for (const b of passend) expect(ausschlussInSituation(b, { anfrage, situation, schritt, data: BUNDLE }), b.kennung).toBeNull();
      for (const x of ausgeschlossen) expect(x.grund).toBe(ausschlussInSituation(x.b, { anfrage, situation, schritt, data: BUNDLE })!.grund);
    }
    // Room and literacy reject something here (e.g. a method that needs reading).
    expect(schrittKandidaten(methoden, rahmen).ausgeschlossen.length).toBeGreaterThan(0);
  });
});
