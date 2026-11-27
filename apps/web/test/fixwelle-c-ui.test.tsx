import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { MethodAdjustment, PhasenAntwort } from '@fmt/core';
import { TeilgruppenEntscheidung } from '../src/components/TeilgruppenEntscheidung.js';
import { belegOhneQuelle, hilfeAlsMaterial, sichtbareHilfen, type TeilgruppenPruefung } from '../src/planner/differentiationFlow.js';
import type { LearnerGroup, ScenarioPhaseRow } from '../src/planner/scenarioModel.js';

afterEach(() => cleanup());

const gruppe: LearnerGroup = { id: 'daz', label: 'DaZ', profile: '', focus: 'sprachsensibel', active: true, count: 4 };
const rows = [{ key: 'step-0', orderLabel: '1', methodName: 'Gruppenpuzzle' }] as ScenarioPhaseRow[];
const antwort = (p: Partial<PhasenAntwort>): PhasenAntwort => ({
  stepKey: 'step-0',
  groupId: 'daz',
  groupLabel: 'DaZ',
  antwort: 'hilfe',
  grund: 'Sprachkompetenz: gering: Hilfe in derselben Methode – sprachliches Gerüst, dieselbe Methode (Quelle: Höfler et al. 2024).',
  merkmal: 'sprachstand',
  grundlage: 'E',
  quelle: 'Höfler et al. 2024',
  hilfen: [{ id: 'teilgruppe:sprachstand', name: 'sprachliches Gerüst, dieselbe Methode', abbau: 'Regelmäßig prüfen.', grundlage: 'E', quelle: 'Höfler et al. 2024' }],
  alternativen: [],
  ...p
});
const zeige = (pruefung: TeilgruppenPruefung) =>
  render(
    <TeilgruppenEntscheidung
      subgroups={[gruppe]}
      onGroupChange={() => {}}
      pruefung={pruefung}
      rows={rows}
      subgroupMethods={{}}
      generatedMaterials={[]}
      onTauschUebernehmen={() => {}}
      onTauschZuruecknehmen={() => {}}
      onHilfeUebernehmen={() => {}}
      onHilfeZuruecknehmen={() => {}}
    />
  );
const karte = () => screen.getAllByRole('listitem').find((li) => li.classList.contains('tg-karte'))!;

describe('Fix wave C, 3: nie eine leere Hilfe-Karte', () => {
  it('ohne genannte Hilfe steht ein Satz statt einer leeren Liste, ohne „Übernehmen“', () => {
    zeige({ antworten: [antwort({ hilfen: [], grundlage: 'U', quelle: undefined, grund: 'Lernstrategien: kaum vorhanden: Hilfe in derselben Methode – Vorschlag; keine belegte Grenze (Grundlage ungeklärt).' })], vorschlaege: [], hinweise: {} });
    const k = karte();
    expect(within(k).queryAllByRole('list')).toHaveLength(0);
    expect(within(k).getByText('Für diese Gruppe ist hier keine belegte Hilfe hinterlegt. Prüfe selbst, was sie in dieser Methode braucht.')).toBeTruthy();
    expect(within(k).queryByRole('button', { name: /übernehmen$/ })).toBeNull();
  });
});

describe('Fix wave C, 4: die Grundlage steht einmal', () => {
  it('der Beleg nennt die Quelle nicht noch einmal; die Belegzeile nennt sie', () => {
    zeige({ antworten: [antwort({})], vorschlaege: [], hinweise: {} });
    const k = karte();
    expect(within(k).getByText(/^Beleg: /).textContent).toBe('Beleg: Sprachkompetenz: gering: Hilfe in derselben Methode – sprachliches Gerüst, dieselbe Methode.');
    expect(within(k).getAllByText(/Höfler et al\. 2024/)).toHaveLength(1);
    expect(within(k).getByText('Grundlage: belegt (Höfler et al. 2024)')).toBeTruthy();
  });

  it('belegOhneQuelle nimmt Quelle, „Grundlage ungeklärt“ und „Setzung der Redaktion“ heraus, auch mit Klammern in der Quelle', () => {
    expect(belegOhneQuelle('A: B (Quelle: Patall et al. 2008 (Wirkung auf die Leistung ungeklärt)).')).toBe('A: B.');
    expect(belegOhneQuelle('A: B (Grundlage ungeklärt).')).toBe('A: B.');
    expect(belegOhneQuelle('A: B (Setzung der Redaktion). Tausch gegen: C.')).toBe('A: B. Tausch gegen: C.');
    expect(belegOhneQuelle('Die Gruppe kann nicht lesen; X verlangt lesen.')).toBe('Die Gruppe kann nicht lesen; X verlangt lesen.');
  });
});

describe('Fix wave C, 9: die Tausch-Karte nennt, was sonst gilt', () => {
  it('„Sonst: Hilfe – …“ mit der Hilfe, die die Gruppe bekommt, wenn die Methode bleibt', () => {
    const vorschlag: MethodAdjustment = {
      stepKey: 'step-0',
      phaseLabel: 'Erfindung',
      groupId: 'daz',
      groupLabel: 'DaZ',
      vonKennung: 'erfindungsaufgabe',
      vonName: 'Erfindungsaufgabe',
      zuKennung: 'induktive-beispielreihe',
      zuName: 'Induktive Beispielreihe',
      grund: 'g',
      merkmal: 'vorwissen-gering'
    };
    const a = antwort({
      antwort: 'tausch',
      merkmal: 'vorwissen-gering',
      hilfen: [],
      sonstHilfen: [
        { id: 'teilgruppe:vorwissen-gering', name: 'mehr Anleitung, Lösungsbeispiele; oder Entdecken mit Stütze', abbau: 'x' },
        { id: 'm1', name: 'Lösungsbeispiele mit Teilschritten', abbau: 'y' }
      ],
      alternativen: [{ kennung: 'induktive-beispielreihe', name: 'Induktive Beispielreihe', reichweite: 'phase', dauerMin: 10, dauerMax: 20, grund: '' }]
    });
    zeige({ antworten: [a], vorschlaege: [vorschlag], hinweise: {} });
    expect(within(karte()).getByText('Sonst: Hilfe – mehr Anleitung, Lösungsbeispiele; oder Entdecken mit Stütze; Lösungsbeispiele mit Teilschritten')).toBeTruthy();
  });
});

describe('Fix wave C, 10: Karte und Material zeigen dieselben Hilfen', () => {
  it('höchstens drei, an einer Stelle geschnitten', () => {
    const viele = antwort({ hilfen: [1, 2, 3, 4].map((i) => ({ id: `h${i}`, name: `Hilfe ${i}`, abbau: 'a' })) });
    expect(sichtbareHilfen(viele).map((h) => h.id)).toEqual(['h1', 'h2', 'h3']);
    const m = hilfeAlsMaterial(viele, 'Phase 1');
    expect(m.title).toBe('Hilfe für DaZ: Hilfe 1, Hilfe 2, Hilfe 3');
    expect(m.content).not.toContain('Hilfe 4');
    zeige({ antworten: [viele], vorschlaege: [], hinweise: {} });
    expect(within(karte()).queryByText('Hilfe 4')).toBeNull();
    expect(within(karte()).getByText('Hilfe 3')).toBeTruthy();
  });
});

describe('Fix wave C, Runde 2, 5: Gruppe ohne genannte Merkmale', () => {
  const NOTIZ = 'Diese Gruppe nennt keine Merkmale. Wähle Merkmale, damit der Baukasten Hilfen oder eine andere Methode vorschlagen kann.';
  const mit = (g: LearnerGroup) =>
    render(
      <TeilgruppenEntscheidung
        subgroups={[g]}
        onGroupChange={() => {}}
        pruefung={null}
        rows={rows}
        subgroupMethods={{}}
        generatedMaterials={[]}
        onTauschUebernehmen={() => {}}
        onTauschZuruecknehmen={() => {}}
        onHilfeUebernehmen={() => {}}
        onHilfeZuruecknehmen={() => {}}
      />
    );

  it('eine Gruppe nur mit Persona zeigt einen kleinen Hinweis', () => {
    mit({ ...gruppe, personaId: 'languageAndCulture', matrixValues: {} });
    expect(screen.getByText(NOTIZ)).toBeTruthy();
  });

  it('mit genannten Werten oder eigener Angabe kein Hinweis', () => {
    mit({ ...gruppe, personaId: 'languageAndCulture', matrixValues: { vorwissen: 'vorwissen-gering' } });
    expect(screen.queryByText(NOTIZ)).toBeNull();
    cleanup();
    mit({ ...gruppe, personaId: 'languageAndCulture', matrixValues: { strukturierung: 'strukturierung-stark' }, genannt: [] });
    expect(screen.getByText(NOTIZ)).toBeTruthy();
    cleanup();
    mit({ ...gruppe, personaId: 'languageAndCulture', ohneBewegung: true });
    expect(screen.queryByText(NOTIZ)).toBeNull();
  });
});
