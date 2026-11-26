import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createMatcher, createSearch, createValidator, type CatalogBundle, type FmtData } from '@fmt/core';
import { PlannerPage } from '../src/pages/PlannerPage.js';
import { createChainPreset } from '../src/planner/arrangementOps.js';
import { ACTIVE_PLANNER_DRAFT_KEY, DIFF_HANDOFF_KEY, SAVED_SCENARIOS_KEY } from '../src/planner/scenarioStorage.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BUNDLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist-data', 'catalog.bundle.json'), 'utf8')) as CatalogBundle;
const DATA = { ...BUNDLE, VERSION: BUNDLE.version } as unknown as FmtData;
const validator = createValidator(DATA);
const labels = new Map<string, string>();
for (const s of BUNDLE.schemes) for (const w of s.werte || (s.gruppen || []).flatMap((g) => g.werte)) labels.set(`${s.id}:${w.id}`, w.label);

const CATALOG = {
  bundle: BUNDLE,
  meta: null,
  blocksById: new Map(BUNDLE.bausteine.map((b) => [b.kennung, b])),
  validator,
  search: createSearch(DATA, validator),
  matcher: createMatcher(DATA, validator),
  exampleRegistry: new Map(BUNDLE.beispiele.filter((e) => e['@id']).map((e) => [e['@id']!, e])),
  labelOf: (scheme: string, code: string) => labels.get(`${scheme}:${code}`) || code,
  valuesOf: (scheme: string) => {
    const s = BUNDLE.schemes.find((x) => x.id === scheme);
    return s ? s.werte || (s.gruppen || []).flatMap((g) => g.werte) : [];
  },
  pendingPlannerBlock: null,
  consumePendingPlannerBlock: () => null,
  byok: { enabled: false, apiKey: '', provider: '', model: '', baseUrl: '', directBrowser: false },
  setLlmSettingsOpen: () => {}
};

vi.mock('../src/data/CatalogContext.js', () => ({ useCatalog: () => CATALOG }));

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

const renderPlanner = () =>
  render(
    <MemoryRouter initialEntries={['/planer']}>
      <PlannerPage />
    </MemoryRouter>
  );
const stepButton = (n: number) =>
  within(screen.getByRole('navigation', { name: 'Planungsschritte' })).getAllByRole('button')[n - 1] as HTMLButtonElement;
const propose = (text: string) => {
  fireEvent.change(screen.getByLabelText('Unterrichtsvorhaben beschreiben'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: /Ablauf vorschlagen/ }));
};

describe('Szenario-Baukasten: geführte Schritte', () => {
  it('startet leer: kein Text, kein vorausgewählter Ansatz, Schritte 3 bis 5 gesperrt', () => {
    renderPlanner();
    expect((screen.getByLabelText('Unterrichtsvorhaben beschreiben') as HTMLTextAreaElement).value).toBe('');
    const chips = within(screen.getByRole('group', { name: 'Didaktische Ansätze auswählen' })).getAllByRole('button');
    expect(chips.length).toBeGreaterThanOrEqual(12);
    expect(chips.every((c) => c.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(screen.getByText(/Nichts ausgewählt/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Ablauf vorschlagen/ }) as HTMLButtonElement).disabled).toBe(true);
    expect([3, 4, 5].every((n) => stepButton(n).disabled)).toBe(true);
    expect(stepButton(2).disabled).toBe(false);
  });

  it('Raum hat keine Vorauswahl; Eigenschaften erscheinen erst nach der Wahl', () => {
    renderPlanner();
    const raum = screen.getByLabelText('Raum') as HTMLSelectElement;
    expect(raum.value).toBe('');
    const optionen = within(raum).getAllByRole('option').map((o) => o.textContent);
    expect(optionen).toContain('Klassen- oder Seminarraum');
    expect(optionen).toContain('Sporthalle, Sportplatz');
    expect(screen.queryByLabelText('Schreibplätze')).toBeNull();
    fireEvent.change(raum, { target: { value: 'hoersaal' } });
    expect((screen.getByLabelText('Schreibplätze') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Wand oder Tafel') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('freie Fläche zum Stehen und Gehen') as HTMLInputElement).checked).toBe(false);
    for (const e of ['große Fläche zum Laufen und Spielen', 'draußen', 'Fachausstattung']) expect(screen.getByLabelText(e)).toBeTruthy();
  });

  it('übergibt Raum, abgewählte Eigenschaften, Lesen, Schreiben und Termine an die Zuordnung', () => {
    const spy = vi.spyOn(CATALOG.matcher, 'zuordnen');
    renderPlanner();
    fireEvent.change(screen.getByLabelText('Raum'), { target: { value: 'hoersaal' } });
    propose('Statistik Hypothesentests, 90 Minuten');
    let req = spy.mock.calls.at(-1)![0]!;
    expect(req.raum).toBe('hoersaal');
    expect(req.raumBietet).toBeUndefined();
    expect(req.ohneSchrift).toBeUndefined();

    fireEvent.click(stepButton(1));
    fireEvent.click(screen.getByLabelText('Wand oder Tafel'));
    fireEvent.click(screen.getByLabelText('Die Lernenden können noch nicht lesen'));
    fireEvent.change(screen.getByLabelText('Termine'), { target: { value: '3' } });
    propose('Statistik Hypothesentests, 90 Minuten');
    req = spy.mock.calls.at(-1)![0]!;
    expect(req.raum).toBe('hoersaal');
    expect(req.raumBietet).toEqual(['schreibplatz']);
    expect(req.ohneSchrift).toEqual(['lesen']);
    expect(req.termine).toBe(3);

    fireEvent.click(stepButton(1));
    fireEvent.click(screen.getByLabelText('Die Lernenden können noch nicht schreiben'));
    propose('Statistik Hypothesentests, 90 Minuten');
    expect(spy.mock.calls.at(-1)![0]!.ohneSchrift).toEqual(['lesen', 'schreiben']);
    spy.mockRestore();
  });

  it('zeigt in Schritt 2, was angenommen wurde, mit einem Weg zurück zu Schritt 1', () => {
    renderPlanner();
    propose('Mathematik Klasse 6, Brüche addieren, 90 Minuten, 26 Lernende');
    expect(stepButton(2).getAttribute('aria-current')).toBe('step');
    const box = screen.getByRole('region', { name: 'Angenommen' });
    expect(within(box).getByText('Raum nicht angegeben: Klassenraum angenommen.')).toBeTruthy();
    fireEvent.click(within(box).getByRole('button', { name: /Angaben in Schritt 1 ändern/ }));
    expect(stepButton(1).getAttribute('aria-current')).toBe('step');
  });

  it('nennt in Schritt 2 den Grund für einen offenen Schritt', () => {
    renderPlanner();
    fireEvent.change(screen.getByLabelText('Raum'), { target: { value: 'klassenraum' } });
    propose('Sport Klasse 5, Ausdauer verbessern, 90 Minuten');
    const box = screen.getByRole('region', { name: 'Offene Schritte' });
    expect(within(box).getByText(/Keine Methode im Katalog liefert/)).toBeTruthy();
    expect(within(box).getByText(/braucht: Bewegungsfläche/)).toBeTruthy();
  });

  it('lädt ein gespeichertes Szenario mit dem alten Feld „lernort“', () => {
    const arrangement = createChainPreset('konzeptaufbau', BUNDLE);
    window.localStorage.setItem(
      SAVED_SCENARIOS_KEY,
      JSON.stringify([
        { id: 'sc_alt', savedAt: '2026-01-01T00:00:00Z', title: 'Alt', fach: 'Sport', thema: 'Ballspiele', hinweise: '', lernort: 'bewegungsraum', ohneLesen: true, arrangement, groups: [], aiDiffByStep: {}, oerByStep: {}, elaboration: null }
      ])
    );
    renderPlanner();
    fireEvent.click(screen.getByRole('button', { name: /Gespeichert \(1\)/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Laden' }));
    fireEvent.click(stepButton(1));
    expect((screen.getByLabelText('Raum') as HTMLSelectElement).value).toBe('bewegungsraum');
    expect((screen.getByLabelText('Die Lernenden können noch nicht lesen') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Die Lernenden können noch nicht schreiben') as HTMLInputElement).checked).toBe(true);
  });

  it('zeigt in Schritt 2 nur die Regelgruppe, auch wenn der Text Teilgruppen nennt', () => {
    renderPlanner();
    propose('Mathematik Klasse 6, Brüche addieren, 90 Minuten, 26 Lernende, davon 5 DaZ-Kinder');
    expect(stepButton(2).getAttribute('aria-current')).toBe('step');
    const table = screen.getByRole('table');
    expect(within(table).getByText(/Regelgruppe \(ganze Klasse\)/)).toBeTruthy();
    expect(within(table).queryByText(/DaZ & Sprachsensibel/)).toBeNull();
    expect(screen.getByText(/sind vorgemerkt/)).toBeTruthy();
    expect(stepButton(3).disabled).toBe(false);
  });

  it('passt in Schritt 3 das Vorgehen an, zeigt den aktualisierten Ablauf und nimmt Anpassungen zurück', () => {
    renderPlanner();
    propose('Mathematik Klasse 6, Brüche addieren, 90 Minuten, 26 Lernende');
    fireEvent.click(stepButton(3));
    // Without subgroups there is nothing to adjust yet.
    expect(screen.queryByRole('button', { name: 'Vorgehen an die Teilgruppen anpassen' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /DaZ \/ Sprachförderung/ }));
    fireEvent.click(screen.getByRole('button', { name: /ADHS \/ Fokusstruktur/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Vorgehen an die Teilgruppen anpassen' }));

    expect(screen.getByText(/Methode(n)? angepasst:/)).toBeTruthy();
    const undo = screen.getAllByRole('button', { name: /^Anpassung für .* zurücknehmen$/ });
    expect(undo.length).toBeGreaterThan(0);
    // The updated plan shows every subgroup and the method entered for it.
    expect(screen.getByText('Ablauf mit allen Teilgruppen')).toBeTruthy();
    expect(screen.getAllByText(/Eigene Methode für diese Gruppe/).length).toBe(undo.length);
    expect(stepButton(3).textContent).toMatch(/2 Teilgruppen · \d+ Methoden angepasst/);

    fireEvent.click(screen.getByRole('button', { name: 'Alle Anpassungen zurücknehmen' }));
    expect(screen.queryByText(/Eigene Methode für diese Gruppe/)).toBeNull();
    expect(screen.getByText(/Alle Anpassungen sind zurückgenommen/)).toBeTruthy();

    // Step 2 still shows the plan for the whole class only.
    fireEvent.click(stepButton(2));
    expect(within(screen.getByRole('table')).queryByText(/ADHS/)).toBeNull();
  });

  it('schlägt in Schritt 3 zusätzliche Phasen für alle vor, fügt sie ein und nimmt sie wieder heraus', () => {
    renderPlanner();
    propose('Mathematik Klasse 6, Brüche addieren, 90 Minuten, 26 Lernende');
    fireEvent.click(stepButton(2));
    const rowsBefore = within(screen.getByRole('table')).getAllByRole('row').length;
    fireEvent.click(stepButton(3));
    fireEvent.click(screen.getByRole('button', { name: /DaZ \/ Sprachförderung/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Vorgehen an die Teilgruppen anpassen' }));

    expect(screen.getByText(/Vorschlag: \d zusätzliche Phasen? für alle/)).toBeTruthy();
    const add = screen.getAllByRole('button', { name: /hinzufügen$/ });
    // A swap the teacher took back stays taken back when a phase is added.
    const undo = screen.queryByRole('button', { name: 'Alle Anpassungen zurücknehmen' });
    if (undo) fireEvent.click(undo);
    const parallelBefore = screen.queryAllByText(/Eigene Methode für diese Gruppe/).length;
    expect(parallelBefore).toBe(0);
    fireEvent.click(add[0]);

    // The phase is part of the flow now, the check ran again and nothing is reported as out of date.
    expect(screen.getByText(/1 Phase hinzugefügt:/)).toBeTruthy();
    expect(screen.queryByText(/Klicke auf „Erneut prüfen“/)).toBeNull();
    expect(screen.queryAllByRole('button', { name: /hinzufügen$/ }).length).toBe(add.length - 1);
    expect(screen.queryAllByText(/Eigene Methode für diese Gruppe/).length).toBe(0);
    fireEvent.click(stepButton(2));
    expect(within(screen.getByRole('table')).getAllByRole('row').length).toBe(rowsBefore + 1);

    fireEvent.click(stepButton(3));
    fireEvent.click(screen.getByRole('button', { name: /wieder entfernen$/ }));
    expect(screen.queryByText(/Phase hinzugefügt:/)).toBeNull();
    expect(screen.getAllByRole('button', { name: /hinzufügen$/ }).length).toBe(add.length);
    fireEvent.click(stepButton(2));
    expect(within(screen.getByRole('table')).getAllByRole('row').length).toBe(rowsBefore);
  });

  it('ein Musterablauf ersetzt den vorherigen Vorschlag samt Hinweis und „Anderer Vorschlag“', () => {
    renderPlanner();
    propose('Mathematik Klasse 6, Brüche addieren, 90 Minuten');
    expect(screen.getByText(/Vorschlag für deinen Ablauf/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Anderer Vorschlag/ })).toBeTruthy();
    fireEvent.click(stepButton(1));
    fireEvent.click(screen.getAllByRole('button', { name: /^Musterablauf:/ })[0]);
    expect(stepButton(2).getAttribute('aria-current')).toBe('step');
    expect(screen.queryByText(/Vorschlag für deinen Ablauf/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Anderer Vorschlag/ })).toBeNull();
  });

  it('kehrt aus „Differenzierung“ mit dem eigenen Ablauf in Schritt 3 zurück', () => {
    const arrangement = createChainPreset('konzeptaufbau', BUNDLE);
    window.sessionStorage.setItem(
      ACTIVE_PLANNER_DRAFT_KEY,
      JSON.stringify({ updatedAt: '', title: 't', fach: 'Physik', thema: 'Dichte', scenarioText: 'Physik Dichte', maxTechnik: '', ohneInternet: false, ohneKI: false, arrangement, groups: [] })
    );
    window.sessionStorage.setItem(DIFF_HANDOFF_KEY, JSON.stringify({ returnToStep3: true }));
    renderPlanner();
    expect(stepButton(3).getAttribute('aria-current')).toBe('step');
    expect(stepButton(3).disabled).toBe(false);
    expect(stepButton(2).textContent).toMatch(/\d+ Phasen für die ganze Klasse/);
    expect(screen.getByText('Physik: Dichte')).toBeTruthy();
  });

  it('fällt ohne gespeicherten Ablauf bei der Rückkehr auf Schritt 1 zurück', () => {
    window.sessionStorage.setItem(DIFF_HANDOFF_KEY, JSON.stringify({ returnToStep3: true }));
    renderPlanner();
    expect(stepButton(1).getAttribute('aria-current')).toBe('step');
  });
});
