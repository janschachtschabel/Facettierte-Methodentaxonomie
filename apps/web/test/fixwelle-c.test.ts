import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import type { CatalogBundle } from '@fmt/core';
import { adjustmentGroups, adjustmentSignature, pruefeTeilgruppen, teilgruppenRahmen } from '../src/planner/differentiationFlow.js';
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
