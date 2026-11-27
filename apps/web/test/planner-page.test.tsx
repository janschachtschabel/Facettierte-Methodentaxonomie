import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createMatcher, createSearch, createValidator, type CatalogBundle, type FmtData } from '@fmt/core';
import { PlannerPage } from '../src/pages/PlannerPage.js';
import { createChainPreset } from '../src/planner/arrangementOps.js';
import { regelZeile } from '../src/planner/regelmeldung.js';
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
    // Only what was assumed for a missing detail stands under "Angenommen"; other notes on the plan stand apart.
    expect(within(box).queryByText(/Keine Angabe zur Ausstattung/)).toBeNull();
    const hinweise = screen.getByRole('region', { name: 'Hinweise zum Ablauf' });
    expect(within(hinweise).getByText(/Keine Angabe zur Ausstattung/)).toBeTruthy();
    fireEvent.click(within(box).getByRole('button', { name: /Angaben in Schritt 1 ändern/ }));
    expect(stepButton(1).getAttribute('aria-current')).toBe('step');
  });

  it('Hinweis zum Raum nennt die Sporthalle im Fach Sport', () => {
    renderPlanner();
    expect(screen.getByText(/nimmt der Baukasten einen Raum an \(meist den Klassenraum, im Fach Sport die Sporthalle\)/)).toBeTruthy();
  });

  it('nennt in Schritt 2 den Grund für einen offenen Schritt', () => {
    renderPlanner();
    fireEvent.change(screen.getByLabelText('Raum'), { target: { value: 'klassenraum' } });
    propose('Sport Klasse 5, Ausdauer verbessern, 90 Minuten');
    const box = screen.getByRole('region', { name: 'Offene Schritte' });
    // Since Tor D2 the makerspace needs a workshop, so the transfer step stays open in the classroom as well.
    expect(within(box).getAllByText(/Keine Methode im Katalog liefert/)).toHaveLength(2);
    expect(within(box).getAllByText(/braucht: Bewegungsfläche/)).toHaveLength(2);
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

  it('Schritt 1: nach dem Vorschlag „Verstanden“ und „Fehlt noch“, jede Lücke direkt ergänzbar, nichts vorbelegt (Task B4)', () => {
    const spy = vi.spyOn(CATALOG.matcher, 'zuordnen');
    renderPlanner();
    expect(screen.queryByRole('region', { name: 'Verstanden und fehlt noch' })).toBeNull();
    propose('Einstieg für Ethik Klasse 10, Gerechtigkeit, 30 Lernende im Hörsaal');
    // A single phase stays in step 1.
    expect(stepButton(1).getAttribute('aria-current')).toBe('step');
    const zeile = screen.getByRole('region', { name: 'Verstanden und fehlt noch' });
    expect(zeile.textContent).toContain('Verstanden: Ethik · Klasse 10 · 30 Lernende · Hörsaal · Ziel: Orientierung');
    expect(within(zeile).getByText(/Fehlt noch:/).parentElement!.textContent).toBe('Fehlt noch: Zeit');
    const zeit = within(zeile).getByLabelText('Zeit in Minuten ergänzen') as HTMLInputElement;
    expect(zeit.value).toBe('');
    fireEvent.change(zeit, { target: { value: '45' } });
    propose('Einstieg für Ethik Klasse 10, Gerechtigkeit, 30 Lernende im Hörsaal');
    expect(spy.mock.calls.at(-1)![0]!.zeitMin).toBe(45);
    spy.mockRestore();
    fireEvent.click(stepButton(1));
    const neu = screen.getByRole('region', { name: 'Verstanden und fehlt noch' });
    expect(neu.textContent).toContain('45 Minuten');
    expect(within(neu).queryByLabelText('Zeit in Minuten ergänzen')).toBeNull();
  });

  it('Schritt 1: ein nur vermutetes Ziel lässt sich korrigieren, die Auswahl sendet zielart (Fix-Welle B, Punkt 6)', () => {
    const spy = vi.spyOn(CATALOG.matcher, 'zuordnen');
    renderPlanner();
    propose('Ethik Klasse 10, Gerechtigkeit, 30 Lernende im Hörsaal');
    // Without time the text still becomes a plan (W13); back to step 1 to correct the guess.
    fireEvent.click(stepButton(1));
    const zeile = screen.getByRole('region', { name: 'Verstanden und fehlt noch' });
    expect(zeile.textContent).toContain('Ziel (vermutet): Diagnose');
    const ziel = within(zeile).getByLabelText('Ziel ergänzen') as HTMLSelectElement;
    expect(ziel.value).toBe('');
    fireEvent.change(ziel, { target: { value: 'urteilen' } });
    propose('Ethik Klasse 10, Gerechtigkeit, 30 Lernende im Hörsaal');
    expect(spy.mock.calls.at(-1)![0]!.zielart).toBe('urteilen');
    spy.mockRestore();
  });

  it('Schritt 1: jede der sechs Angaben ist ergänzbar, ohne Vorauswahl; der Ablauf entsteht trotz Lücken (Task B4)', () => {
    const spy = vi.spyOn(CATALOG.matcher, 'zuordnen');
    renderPlanner();
    propose('etwas über Pflanzen');
    fireEvent.click(stepButton(1));
    const zeile = screen.getByRole('region', { name: 'Verstanden und fehlt noch' });
    const felder = ['Ziel ergänzen', 'Fach ergänzen', 'Bildungsstufe ergänzen', 'Anzahl der Lernenden ergänzen', 'Raum ergänzen', 'Zeit in Minuten ergänzen'];
    // All six details are missing for this text (the topic "Pflanzen" is read, the subject is not): every control is there and empty.
    expect(within(zeile).getByText(/Fehlt noch:/).parentElement!.textContent).toBe(
      'Fehlt noch: Fach, Bildungsstufe, Anzahl der Lernenden, Raum, Zeit, Ziel'
    );
    for (const f of felder) expect((within(zeile).getByLabelText(f) as HTMLInputElement | HTMLSelectElement).value, f).toBe('');
    expect(within(zeile).getByLabelText('Bildungsstufe ergänzen')).toBeTruthy();
    expect(within(zeile).getByLabelText('Anzahl der Lernenden ergänzen')).toBeTruthy();
    expect(within(zeile).getByLabelText('Raum ergänzen')).toBeTruthy();
    fireEvent.change(within(zeile).getByLabelText('Bildungsstufe ergänzen'), { target: { value: 'primar' } });
    fireEvent.change(within(zeile).getByLabelText('Anzahl der Lernenden ergänzen'), { target: { value: '22' } });
    fireEvent.change(within(zeile).getByLabelText('Raum ergänzen'), { target: { value: 'draussen' } });
    fireEvent.change(within(zeile).getByLabelText('Ziel ergänzen'), { target: { value: 'konzepte' } });
    propose('etwas über Pflanzen');
    const req = spy.mock.calls.at(-1)![0]!;
    expect(req.bildungsstufe).toBe('primar');
    expect(req.gruppe).toBe(22);
    expect(req.raum).toBe('draussen');
    expect(req.zielart).toBe('konzepte');
    spy.mockRestore();
  });

  it('Schritt 2 nennt, was noch fehlt, mit einem Weg zurück zu Schritt 1 (Task B4)', () => {
    renderPlanner();
    propose('Mathematik Klasse 6, Brüche addieren, 90 Minuten, 26 Lernende');
    expect(stepButton(2).getAttribute('aria-current')).toBe('step');
    const fehlt = screen.getByText(/^Fehlt noch: Raum/);
    fireEvent.click(within(fehlt.closest('p')!).getByRole('button', { name: /In Schritt 1 ergänzen/ }));
    expect(stepButton(1).getAttribute('aria-current')).toBe('step');
    expect((screen.getByLabelText('Raum ergänzen') as HTMLSelectElement).value).toBe('');
  });

  it('Schritt 2: je Warnung der Satz und darunter Regel und Grundlage; „Ablauf stimmig“ ohne Wertung (Task B4)', () => {
    renderPlanner();
    propose('VHS Integrationskurs Deutsch A2: beim Arzt, 90 Minuten, 15 Teilnehmende');
    expect(stepButton(2).getAttribute('aria-current')).toBe('step');
    const tabelle = screen.getByRole('table');
    const warnung = within(tabelle).getAllByText(/verlangt Lesen oder Schreiben, das Sprachniveau ist aber niedrig/)[0];
    const zeile = warnung.closest('li')!;
    expect(within(zeile).getByText('Regel: Schrift bei niedrigem Sprachniveau · Grundlage: belegt (Höfler et al. 2024)')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Ablauf stimmig|zu prüfen/ })).toBeTruthy();
    // No rating in the planner's own words (method descriptions in the table may say "sehr gut / sicher").
    const schritt2 = tabelle.closest('section')!.cloneNode(true) as HTMLElement;
    schritt2.querySelectorAll('table').forEach((t) => t.remove());
    expect(schritt2.textContent).not.toMatch(/\bgut\b|empfohlen/i);
    expect(within(tabelle).queryAllByText(/^Regel: /).every((e) => !/\bgut\b|empfohlen/i.test(e.textContent || ''))).toBe(true);
  });

  it('Regelzeile: belegt mit Quelle, Setzung, Eignungsregeln mit eigenem Namen', () => {
    const regeln = BUNDLE.regeln!;
    expect(regelZeile({ regel: 'entdecken-nur-mit-stuetze', wirkung: 'warnt', grundlage: 'E', quelle: 'Alfieri et al. 2011', text: 'x' }, regeln)).toBe(
      'Regel: Entdecken nur mit Stütze · Grundlage: belegt (Alfieri et al. 2011)'
    );
    expect(regelZeile({ regel: 'genannter-wunsch-bleibt', wirkung: 'weist-hin', grundlage: 'A', text: 'x' }, regeln)).toBe('Regel: Genannter Wunsch bleibt · Grundlage: Setzung');
    expect(regelZeile({ regel: 'eignung-stufe', wirkung: 'warnt', grundlage: 'A', text: 'x' }, regeln)).toBe('Regel: Eignung für die Bildungsstufe · Grundlage: Setzung');
    expect(regelZeile({ regel: 'eignung-fach', wirkung: 'warnt', grundlage: 'S', quelle: 'Redaktion 2026', text: 'x' }, regeln)).toBe(
      'Regel: Eignung für den Fachbereich · Grundlage: gefolgert (Redaktion 2026)'
    );
  });

  it('Ergänztes gilt nicht gegen den Text: neue Zeit im Text gewinnt, Laden leert die Ergänzungen (B4-Fix 1)', () => {
    const spy = vi.spyOn(CATALOG.matcher, 'zuordnen');
    renderPlanner();
    propose('Ethik Klasse 10, Gerechtigkeit, 30 Lernende im Hörsaal');
    fireEvent.click(stepButton(1));
    const zeit = screen.getByLabelText('Zeit in Minuten ergänzen') as HTMLInputElement;
    fireEvent.change(zeit, { target: { value: '45' } });
    // Typing in the text keeps the completion; the gap-only check lets the time in the text win.
    fireEvent.change(screen.getByLabelText('Unterrichtsvorhaben beschreiben'), {
      target: { value: 'Ethik Klasse 10, Gerechtigkeit, 30 Lernende im Hörsaal, Doppelstunde, 90 Minuten' }
    });
    expect(zeit.value).toBe('45');
    fireEvent.click(screen.getByRole('button', { name: /Ablauf vorschlagen/ }));
    expect(spy.mock.calls.at(-1)![0]!.zeitMin).toBeUndefined();
    expect((spy.mock.results.at(-1)!.value as { kriterien: { zeitMin?: number } }).kriterien.zeitMin).toBe(90);

    // A completion from before a loaded example is gone.
    fireEvent.click(stepButton(1));
    propose('etwas über Pflanzen');
    fireEvent.click(stepButton(1));
    fireEvent.change(screen.getByLabelText('Bildungsstufe ergänzen'), { target: { value: 'primar' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Bruchrechnen/ })[0]);
    fireEvent.click(stepButton(1));
    propose('etwas über Tiere');
    expect(spy.mock.calls.at(-1)![0]!.bildungsstufe).toBeUndefined();
    spy.mockRestore();
  });

  it('Ergänzungen bleiben beim Tippen im Text erhalten (Fix-Welle B, Punkt 7)', () => {
    const spy = vi.spyOn(CATALOG.matcher, 'zuordnen');
    renderPlanner();
    propose('etwas über Pflanzen');
    fireEvent.click(stepButton(1));
    fireEvent.change(screen.getByLabelText('Bildungsstufe ergänzen'), { target: { value: 'primar' } });
    propose('etwas über Pflanzen und Tiere');
    expect(spy.mock.calls.at(-1)![0]!.bildungsstufe).toBe('primar');
    spy.mockRestore();
  });

  it('Schritt 2 zeigt nur Meldungen zu Methoden im Ablauf (Fix-Welle B, Punkt 3)', () => {
    renderPlanner();
    // A single phase: the safety note stands at a proposal (Stummer Impuls) the teacher may not take.
    propose('Einstieg Chemie Klasse 8 Säuren');
    const vorschlag = (name: RegExp) => screen.getAllByRole('button').find((b) => /^\+ /.test(b.textContent || '') && name.test(b.textContent || ''))!;
    fireEvent.click(vorschlag(/Daily Review|Rosenshine/));
    expect(stepButton(2).getAttribute('aria-current')).toBe('step');
    expect(document.body.textContent).not.toMatch(/praktisch gearbeitet/);
    // Taken into the flow, the method shows its message at its row; removed again, the message is gone.
    fireEvent.click(stepButton(1));
    fireEvent.click(vorschlag(/Stummer Impuls/));
    expect(screen.getByRole('list', { name: /Hinweise zu Stummer Impuls/ }).textContent).toMatch(/praktisch gearbeitet/);
    fireEvent.click(screen.getByRole('button', { name: /Methoden tauschen und umstellen/ }));
    const entfernen = screen.getAllByRole('button', { name: 'Schritt entfernen' });
    fireEvent.click(entfernen[entfernen.length - 1]);
    expect(document.body.textContent).not.toMatch(/praktisch gearbeitet/);
    fireEvent.click(screen.getByRole('button', { name: /Übersicht/ }));
    expect(screen.queryByRole('list', { name: /Hinweise zu Stummer Impuls/ })).toBeNull();
    expect(document.body.textContent).not.toMatch(/praktisch gearbeitet/);
  });

  it('Schritt 2 zeigt „Verstanden“ auch, wenn nichts fehlt (B4-Fix 2)', () => {
    renderPlanner();
    fireEvent.change(screen.getByLabelText('Raum'), { target: { value: 'klassenraum' } });
    propose('Mathematik Klasse 6, Brüche addieren, 90 Minuten, 26 Lernende');
    expect(stepButton(2).getAttribute('aria-current')).toBe('step');
    const hinweis = screen.getByRole('region', { name: 'Verstanden' });
    expect(hinweis.textContent).toMatch(/^Verstanden: Mathematik · Klasse 6 · 26 Lernende · Klassen- oder Seminarraum · 90 Minuten · Ziel: /);
    expect(hinweis.textContent).not.toMatch(/Fehlt noch|vermutet/);
  });

  it('„Mehr Angaben“ ist ohne Vorauswahl; Leeres wird nicht gesendet (B4-Fix 4)', () => {
    renderPlanner();
    const mehr = screen.getByText(/^Mehr Angaben \(freiwillig\)/).closest('details')!;
    for (const name of ['Bildungsstufe', 'Vorwissen']) expect((within(mehr).getByLabelText(name) as HTMLSelectElement).value, name).toBe('');
    expect((within(mehr).getByLabelText('Zeitbudget (Min.)') as HTMLInputElement).value).toBe('');
    // Every select there starts empty except the structural plan size (Granularität), which every plan has.
    const selects = within(mehr).queryAllByRole('combobox') as HTMLSelectElement[];
    for (const sel of selects.filter((x) => !/Granularität/.test(x.closest('label')?.textContent || ''))) expect(sel.value, sel.closest('label')?.textContent?.slice(0, 30)).toBe('');
  });

  it('Thema leeren leert das Thema (B4-Fix 8)', () => {
    renderPlanner();
    propose('Biologie Klasse 7');
    fireEvent.click(stepButton(1));
    const feld = screen.getByLabelText('Thema ergänzen');
    const thema = screen.getByLabelText('Thema') as HTMLInputElement;
    fireEvent.change(feld, { target: { value: 'Fotosynthese' } });
    expect(thema.value).toBe('Fotosynthese');
    fireEvent.change(feld, { target: { value: '' } });
    expect(thema.value).toBe('');
  });
});
