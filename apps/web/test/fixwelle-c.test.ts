import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import type { CatalogBundle, MethodAdjustment, PhasenAntwort } from '@fmt/core';
import {
  adjustmentGroups,
  adjustmentSignature,
  hilfeAlsMaterial,
  nachErneuterPruefung,
  pruefeTeilgruppen,
  teilgruppenRahmen,
  verschiebePruefung,
  type TeilgruppenPruefung
} from '../src/planner/differentiationFlow.js';
import {
  buildScenarioRows,
  QUICK_DIFF_GROUP_TEMPLATES,
  STANDARD_LEARNER_GROUPS,
  type LearnerGroup,
  type ScenarioPhaseRow
} from '../src/planner/scenarioModel.js';
import { gruppeAusVorlage, setzeGruppenwert } from '../src/planner/gruppen.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BUNDLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist-data', 'catalog.bundle.json'), 'utf8')) as CatalogBundle;
const BLOCKS = new Map(BUNDLE.bausteine.map((b) => [b.kennung, b]));
const REGELSATZ = { teilgruppen: BUNDLE.teilgruppen, regeln: BUNDLE.regeln, schemes: BUNDLE.schemes };
const regel: LearnerGroup = { ...STANDARD_LEARNER_GROUPS[0], label: 'Regelgruppe', count: 16 };
const vorlage = (id: string) => QUICK_DIFF_GROUP_TEMPLATES.find((t) => t.id === id)!;

function arrangement(...ids: string[]) {
  return {
    typ: 'Arrangement',
    name: 'Test',
    kontext: { bildungsstufe: 'sek1', zeitbudgetMin: 90 },
    ablauf: { typ: 'Sequenz', teile: ids.map((baustein) => ({ typ: 'Einsatz', baustein, dauerMin: 20 })) }
  } as unknown as Parameters<typeof buildScenarioRows>[0];
}
const rowsFor = (...ids: string[]) => buildScenarioRows(arrangement(...ids), BUNDLE, BLOCKS, (_s, c) => c, [regel], {}, {});

describe('Fix wave C, 1: Schnellprofile nennen nur ihre Kernwerte', () => {
  it('eine Gruppe aus dem Chip trägt die Kernwerte als genannt; die Prüfung bekommt sie', () => {
    const g = gruppeAusVorlage(vorlage('vorwissen-gering'));
    expect(g.genannt).toEqual(['vorwissen-gering', 'leistungsniveau-gering']);
    expect(g.matrixValues?.lernstrategien).toBe('lernstrategien-kaum');
    const [, sub] = adjustmentGroups([regel, g]);
    expect(sub.genannt).toEqual(g.genannt);
  });

  it('ein Zusatzwert des Chips gibt in einer angeleiteten Methode keine U-Hilfe', () => {
    const g = gruppeAusVorlage(vorlage('vorwissen-gering'));
    const res = pruefeTeilgruppen(BUNDLE.bausteine, rowsFor('rosenshine-daily-review'), [regel, g], {}, REGELSATZ);
    expect(res.antworten.find((a) => a.groupId === g.id)?.antwort).toBe('passt');
  });

  it('ein von Hand gesetzter Wert wird genannt; der alte Wert derselben Kategorie nicht mehr', () => {
    const g = gruppeAusVorlage(vorlage('vorwissen-gering'));
    const neu = setzeGruppenwert(g, 'lernstrategien', 'lernstrategien-kaum');
    expect(neu.genannt).toContain('lernstrategien-kaum');
    const anders = setzeGruppenwert(g, 'vorwissen', 'vorwissen-mittel');
    expect(anders.genannt).toEqual(['leistungsniveau-gering', 'vorwissen-mittel']);
    const weg = setzeGruppenwert(g, 'vorwissen', '');
    expect(weg.matrixValues?.vorwissen).toBeUndefined();
    expect(weg.genannt).toEqual(['leistungsniveau-gering']);
    // Without a core list every value counts already.
    const frei: LearnerGroup = { id: 'f', label: 'F', profile: '', focus: 'custom', active: true, matrixValues: {} };
    expect(setzeGruppenwert(frei, 'vorwissen', 'vorwissen-gering').genannt).toBeUndefined();
  });

  it('die Signatur ändert sich mit den genannten Werten', () => {
    const g = gruppeAusVorlage(vorlage('vorwissen-gering'));
    const rows = [{ key: 'step-0', methodId: 'a' }] as ScenarioPhaseRow[];
    expect(adjustmentSignature(rows, [regel, g], {})).not.toBe(adjustmentSignature(rows, [regel, { ...g, genannt: undefined }], {}));
  });
});

describe('Fix wave C, 2: die Prüfung bekommt die Anfrage aus Schritt 1', () => {
  it('teilgruppenRahmen gibt die gelesene Anfrage als anfrage weiter, ohne den Text', () => {
    const r = teilgruppenRahmen({ maxTechnik: 't-keine', fachbereich: 'mathe' }, { text: 'x', raum: 'klassenraum', zeitMin: 45 });
    expect(r).toMatchObject({ maxTechnik: 't-keine', fachbereich: 'mathe', anfrage: { raum: 'klassenraum', zeitMin: 45 } });
    expect(r.anfrage).not.toHaveProperty('text');
    expect(teilgruppenRahmen({}, undefined).anfrage).toBeUndefined();
  });

  it('die Signatur ändert sich mit dem Raum der Anfrage', () => {
    const rows = [{ key: 'step-0', methodId: 'a' }] as ScenarioPhaseRow[];
    const ohne = adjustmentSignature(rows, [regel], teilgruppenRahmen({}, { zeitMin: 45 }));
    expect(adjustmentSignature(rows, [regel], teilgruppenRahmen({}, { zeitMin: 45, raum: 'klassenraum' }))).not.toBe(ohne);
    expect(adjustmentSignature(rows, [regel], teilgruppenRahmen({}, { zeitMin: 45, text: 'anders' }))).toBe(ohne);
  });
});

const adj = (stepKey: string, groupId: string, zu: string): MethodAdjustment => ({
  stepKey,
  phaseLabel: stepKey,
  groupId,
  groupLabel: groupId,
  vonKennung: 'alt',
  vonName: 'Alt',
  zuKennung: zu,
  zuName: zu,
  grund: 'g',
  merkmal: 'vorwissen-gering'
});
const hilfe = (stepKey: string, namen: string[]): PhasenAntwort => ({
  stepKey,
  groupId: 'daz',
  groupLabel: 'DaZ',
  antwort: 'hilfe',
  grund: 'g',
  grundlage: 'E',
  hilfen: namen.map((n, i) => ({ id: `h${i}`, name: n, abbau: 'a' })),
  alternativen: []
});
const passt = (stepKey: string): PhasenAntwort => ({ ...hilfe(stepKey, []), antwort: 'passt' });
const pruefung = (antworten: PhasenAntwort[], vorschlaege: MethodAdjustment[] = []): TeilgruppenPruefung => ({ antworten, vorschlaege, hinweise: {} });
const label = (k: string) => `Phase ${k}`;

describe('Fix wave C, 5 und 6: erneute Prüfung nimmt Übernommenes zurück und sagt es', () => {
  it('5: eine übernommene Methode, die nicht mehr vorgeschlagen wird, ist zurückgenommen, mit einer Statuszeile', () => {
    const a1 = adj('step-0', 'vg', 'm1');
    const r = nachErneuterPruefung({ 'step-0': { vg: 'm1' } }, [a1], pruefung([passt('step-0')]), [], label);
    expect(r.subgroupMethods).toEqual({});
    expect(r.status).toBe('Eine übernommene Methode passt nicht mehr und ist zurückgenommen.');
    const bleibt = nachErneuterPruefung({ 'step-0': { vg: 'm1' } }, [a1], pruefung([], [a1]), [], label);
    expect(bleibt.subgroupMethods).toEqual({ 'step-0': { vg: 'm1' } });
    expect(bleibt.status).toBeNull();
  });

  it('6: eine übernommene Hilfe ohne Hilfe in der neuen Prüfung wird entfernt; geänderte Hilfen werden aktualisiert', () => {
    const alt = hilfeAlsMaterial(hilfe('step-0', ['Wortspeicher']), label('step-0'));
    const r = nachErneuterPruefung({}, [], pruefung([passt('step-0')]), [alt], label);
    expect(r.materials).toEqual([]);
    expect(r.status).toBe('Eine übernommene Hilfe passt nicht mehr und ist zurückgenommen.');
    const neu = nachErneuterPruefung({}, [], pruefung([hilfe('step-0', ['Wortspeicher', 'Satzanfänge'])]), [alt], label);
    expect(neu.materials).toHaveLength(1);
    expect(neu.materials[0].title).toBe('Hilfe für DaZ: Wortspeicher, Satzanfänge');
    expect(neu.status).toBe('Eine übernommene Hilfe hat sich geändert und ist aktualisiert.');
    const gleich = nachErneuterPruefung({}, [], pruefung([hilfe('step-0', ['Wortspeicher'])]), [alt], label);
    expect(gleich.materials[0]).toBe(alt);
    expect(gleich.status).toBeNull();
    // Other materials stay untouched.
    const blatt = { ...alt, id: 'ab', materialType: 'arbeitsblatt' };
    expect(nachErneuterPruefung({}, [], pruefung([passt('step-0')]), [blatt], label).materials).toEqual([blatt]);
  });

  it('mehrere: die Zahl steht in der Statuszeile', () => {
    const r = nachErneuterPruefung(
      { 'step-0': { vg: 'm1' }, 'step-1': { vg: 'm2' } },
      [adj('step-0', 'vg', 'm1'), adj('step-1', 'vg', 'm2')],
      pruefung([]),
      [],
      label
    );
    expect(r.status).toBe('2 übernommene Methoden passen nicht mehr und sind zurückgenommen.');
  });
});

describe('Fix wave C, 7: eine veraltete Prüfung verschiebt auch ihre Vorschläge', () => {
  it('verschiebePruefung verschiebt Antworten und Vorschläge mit der Phase', () => {
    const p = pruefung([hilfe('step-1', ['x'])], [adj('step-1', 'vg', 'm1')]);
    const v = verschiebePruefung(p, 0, 1)!;
    expect(v.antworten[0].stepKey).toBe('step-2');
    expect(v.vorschlaege[0].stepKey).toBe('step-2');
    expect(verschiebePruefung(null, 0, 1)).toBeNull();
  });
});

describe('Fix wave C, Follow-up: Gruppe ohne genannte Werte', () => {
  it('die Standardgruppe „basis“ (nur Persona) passt überall und bekommt keinen Hinweis', () => {
    const basis: LearnerGroup = { id: 'basis', label: 'Basis', profile: '', focus: 'basis', active: true, personaId: 'languageAndCulture' };
    const res = pruefeTeilgruppen(BUNDLE.bausteine, rowsFor('lehrervortrag', 'gruppenpuzzle'), [regel, basis], {}, REGELSATZ);
    expect(res.antworten.filter((a) => a.groupId === 'basis').every((a) => a.antwort === 'passt')).toBe(true);
    expect(res.hinweise.basis.some((m) => m.regel === 'gruppierung-nur-mit-anpassung')).toBe(false);
  });
});

describe('Fix wave C, Runde 2: Status nach einer verschobenen Phase', () => {
  it('4: nur eine andere Phasenbezeichnung ist keine geänderte Hilfe; das Material bekommt still die neue Bezeichnung', () => {
    const alt = hilfeAlsMaterial(hilfe('step-1', ['Wortspeicher']), '2 · Gruppenpuzzle');
    const r = nachErneuterPruefung({}, [], pruefung([hilfe('step-1', ['Wortspeicher'])]), [alt], () => '3 · Gruppenpuzzle');
    expect(r.status).toBeNull();
    expect(r.materials).toHaveLength(1);
    expect(r.materials[0].content).toContain('Phase: 3 · Gruppenpuzzle');
  });
});
