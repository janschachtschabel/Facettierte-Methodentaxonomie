import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    // Since Paket C a method is swapped only where the subgroup decision asks for it (teilgruppen.json), no longer
    // for a weak matrix fit: DaZ and ADHS in the guided Brüche plan keep their methods and get helps. The class test
    // (klassenarbeit-summativ, only explicit and uniform) sets off the swap for high performers.
    propose('Mathematik Klasse 6, Brüche, Klassenarbeit, 90 Minuten, 26 Lernende');
    fireEvent.click(stepButton(3));
    // Without subgroups there is nothing to adjust yet.
    expect(screen.queryByRole('button', { name: 'Vorgehen an die Teilgruppen anpassen' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /DaZ \/ Sprachförderung/ }));
    fireEvent.click(screen.getByRole('button', { name: /Leistungsstark \/ Vertiefung/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Vorgehen an die Teilgruppen anpassen' }));

    // Since C6 nothing is entered by itself: the teacher takes each swap over on its card.
    expect(screen.queryByText(/Eigene Methode für diese Gruppe/)).toBeNull();
    const take = screen.getAllByRole('button', { name: /^Andere Methode für .* übernehmen$/ });
    expect(take.length).toBeGreaterThan(0);
    take.forEach((b) => fireEvent.click(b));
    const undo = screen.getAllByRole('button', { name: /^Andere Methode für .* zurücknehmen$/ });
    expect(undo.length).toBe(take.length);
    // The updated plan shows every subgroup and the method entered for it.
    expect(screen.getByText('Ablauf mit allen Teilgruppen')).toBeTruthy();
    expect(screen.getAllByText(/Eigene Methode für diese Gruppe/).length).toBe(undo.length);
    expect(stepButton(3).textContent).toMatch(/2 Teilgruppen · \d+ Methoden? angepasst/);

    fireEvent.click(screen.getByRole('button', { name: 'Alle Anpassungen zurücknehmen' }));
    expect(screen.queryByText(/Eigene Methode für diese Gruppe/)).toBeNull();
    expect(screen.getByText(/Alle Anpassungen sind zurückgenommen/)).toBeTruthy();

    // Step 2 still shows the plan for the whole class only.
    fireEvent.click(stepButton(2));
    expect(within(screen.getByRole('table')).queryByText(/Leistungsstark/)).toBeNull();
  });

  it('tauscht in Schritt 3 nicht mehr allein wegen schwacher Matrix-Passung', () => {
    renderPlanner();
    propose('Mathematik Klasse 6, Brüche addieren, 90 Minuten, 26 Lernende');
    fireEvent.click(stepButton(3));
    fireEvent.click(screen.getByRole('button', { name: /DaZ \/ Sprachförderung/ }));
    fireEvent.click(screen.getByRole('button', { name: /ADHS \/ Fokusstruktur/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Vorgehen an die Teilgruppen anpassen' }));
    expect(screen.getByText(/muss keine Methode getauscht werden/)).toBeTruthy();
    expect(screen.queryByText(/Eigene Methode für diese Gruppe/)).toBeNull();
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
    // The plan assumes the goal kind (Ethik → Urteilen); the line names it as assumed, not the guessed function.
    expect(zeile.textContent).toContain('Ziel (angenommen): Urteilen');
    expect(zeile.textContent).not.toContain('Diagnose');
    const ziel = within(zeile).getByLabelText('Ziel ergänzen') as HTMLSelectElement;
    expect(ziel.value).toBe('');
    fireEvent.change(ziel, { target: { value: 'konzepte' } });
    propose('Ethik Klasse 10, Gerechtigkeit, 30 Lernende im Hörsaal');
    expect(spy.mock.calls.at(-1)![0]!.zielart).toBe('konzepte');
    spy.mockRestore();
  });

  it('Schritt 1: in einer einzelnen Phase steht die vermutete Lernfunktion als Ziel, mit derselben Auswahl (Runde 2)', () => {
    renderPlanner();
    propose('eine Methode für Mathe Klasse 7 Brüche');
    const phase = screen.getByRole('region', { name: 'Verstanden und fehlt noch' });
    expect(phase.textContent).toContain('Ziel (vermutet): Diagnose');
    expect(within(phase).getByLabelText('Ziel ergänzen')).toBeTruthy();
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

  it('Der Sicherheitshinweis bleibt, solange eine praktische Methode im Ablauf steht, und nennt nur diese (Runde 2, Punkt 1)', () => {
    renderPlanner();
    // Single phase: the note stands at Stummer Impuls and names Soziometrische Aufstellung; taking the latter keeps it.
    propose('Einstieg Chemie Klasse 8 Säuren');
    const vorschlag = (name: RegExp) => screen.getAllByRole('button').find((b) => /^\+ /.test(b.textContent || '') && name.test(b.textContent || ''))!;
    fireEvent.click(vorschlag(/Soziometrische Aufstellung/));
    expect(stepButton(2).getAttribute('aria-current')).toBe('step');
    const zeile = screen.getByRole('list', { name: /Hinweise zu Soziometrische Aufstellung/ });
    expect(zeile.textContent).toContain('Im Ablauf wird praktisch gearbeitet (z. B. Soziometrische Aufstellung (Lebendige Statistik)). Kläre vorher Sicherheit und Aufsicht.');
    expect(document.body.textContent).not.toMatch(/Unter den Vorschlägen|Stummer Impuls/);
  });

  it('Ohne die erste praktische Methode bleibt der Sicherheitshinweis an der nächsten (Runde 2, Punkt 1)', () => {
    renderPlanner();
    propose('Chemie Klasse 8: Schülerexperiment zu Säuren und Laugen, 90 Minuten');
    expect(screen.getByRole('list', { name: /Hinweise zu Geleitetes Experiment/ }).textContent).toMatch(/praktisch gearbeitet/);
    fireEvent.click(screen.getByRole('button', { name: /Methoden tauschen und umstellen/ }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Schritt entfernen' })[1]);
    fireEvent.click(screen.getByRole('button', { name: /Übersicht/ }));
    expect(screen.queryByRole('list', { name: /Hinweise zu Geleitetes Experiment/ })).toBeNull();
    const rest = screen.getByRole('list', { name: /Hinweise zu Interaktive Computersimulation/ });
    expect(rest.textContent).toContain('Im Ablauf wird praktisch gearbeitet (z. B. Interaktive Computersimulation / Virtuelles Labor). Kläre vorher Sicherheit und Aufsicht.');
    expect(document.body.textContent).not.toMatch(/z\. B\. Geleitetes Experiment/);
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

describe('Schritt 3: Entscheidung je Teilgruppe (Task C6)', () => {
  const N07 = 'Mathematik Klasse 8, lineare Funktionen, 90 Minuten, Erfindungsaufgabe mit kontrastierenden Fällen, Teilgruppe: 6 Lernende mit geringem Vorwissen';
  const N08 = 'Biologie Klasse 7, Fotosynthese, 45 Minuten, Teilgruppe: 4 Lernende DaZ Niveau A2';
  const pruefen = () => fireEvent.click(screen.getByRole('button', { name: 'Vorgehen an die Teilgruppen anpassen' }));
  const gruppen = () => screen.getAllByRole('region', { name: /^Entscheidung für / });

  it('je Teilgruppe drei Kästchen ohne Vorauswahl; eine Änderung verlangt erneutes Prüfen', () => {
    renderPlanner();
    propose(N08);
    fireEvent.click(stepButton(3));
    const [g] = gruppen();
    const lesen = within(g).getByLabelText('kann noch nicht lesen') as HTMLInputElement;
    const schreiben = within(g).getByLabelText('kann noch nicht schreiben') as HTMLInputElement;
    const bewegen = within(g).getByLabelText('kann sich nicht frei bewegen') as HTMLInputElement;
    expect([lesen.checked, schreiben.checked, bewegen.checked]).toEqual([false, false, false]);
    pruefen();
    fireEvent.click(lesen);
    expect((within(gruppen()[0]).getByLabelText('kann noch nicht lesen') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/Klicke auf „Erneut prüfen“/)).toBeTruthy();
  });

  it('n08: je Phase eine Karte; DaZ bekommt „Hilfe in dieser Methode“ mit „Wann die Hilfe entfällt“ und Beleg, keinen Tausch', () => {
    renderPlanner();
    propose(N08);
    fireEvent.click(stepButton(3));
    pruefen();
    const [g] = gruppen();
    const karten = within(g).getAllByRole('listitem').filter((li) => li.classList.contains('tg-karte'));
    expect(karten.length).toBe(within(screen.getByRole('table')).getAllByRole('row').length - 1);
    for (const k of karten) {
      const titel = within(k).getByText(/^(Passt so|Hilfe in dieser Methode|Andere Methode für diese Gruppe)$/);
      expect(titel).toBeTruthy();
    }
    expect(within(g).queryByText('Andere Methode für diese Gruppe')).toBeNull();
    const hilfe = karten.find((k) => within(k).queryByText('Hilfe in dieser Methode'))!;
    expect(hilfe).toBeTruthy();
    const hilfen = within(hilfe).getAllByText(/^Wann die Hilfe entfällt:/);
    expect(hilfen.length).toBeGreaterThan(0);
    expect(hilfen.length).toBeLessThanOrEqual(3);
    expect(within(hilfe).getByText(/^Grundlage: belegt \(Höfler et al\. 2024\)$/)).toBeTruthy();
    expect(within(hilfe).getByText(/^Beleg: /)).toBeTruthy();
  });

  it('n08: eine übernommene Hilfe geht als Material in Schritt 4 und lässt sich zurücknehmen', () => {
    renderPlanner();
    propose(N08);
    fireEvent.click(stepButton(3));
    pruefen();
    const [knopf] = within(gruppen()[0]).getAllByRole('button', { name: /^Hilfe für .* übernehmen$/ });
    fireEvent.click(knopf);
    expect(within(gruppen()[0]).getAllByRole('button', { name: /^Hilfe für .* zurücknehmen$/ }).length).toBe(1);
    fireEvent.click(stepButton(4));
    fireEvent.click(screen.getByRole('button', { name: /Material per KI erstellen/ }));
    expect(screen.getByText(/angehängte Materialien \(1\)/)).toBeTruthy();
    expect(screen.getAllByText(/^Hilfe für /).length).toBeGreaterThan(0);
    fireEvent.click(stepButton(3));
    fireEvent.click(within(gruppen()[0]).getByRole('button', { name: /^Hilfe für .* zurücknehmen$/ }));
    expect(within(gruppen()[0]).queryByRole('button', { name: /^Hilfe für .* zurücknehmen$/ })).toBeNull();
  });

  it('n07: „Andere Methode für diese Gruppe“ mit Beleg; nichts ist eingetragen, bis du „Übernehmen“ klickst, und es ist umkehrbar', () => {
    renderPlanner();
    propose(N07);
    fireEvent.click(stepButton(3));
    pruefen();
    const g = gruppen()[0];
    const tausch = within(g).getAllByText('Andere Methode für diese Gruppe');
    expect(tausch.length).toBeGreaterThan(0);
    const karte = tausch[0].closest('li')!;
    expect(within(karte).getByText(/^Beleg: /)).toBeTruthy();
    expect(within(karte).getByText(/^Grundlage: /)).toBeTruthy();
    expect(screen.queryByText(/Eigene Methode für diese Gruppe/)).toBeNull();
    fireEvent.click(within(karte).getByRole('button', { name: /übernehmen$/ }));
    expect(screen.getAllByText(/Eigene Methode für diese Gruppe/).length).toBe(1);
    expect(stepButton(3).textContent).toMatch(/1 Methode angepasst/);
    fireEvent.click(within(gruppen()[0]).getByRole('button', { name: /^Andere Methode für .* zurücknehmen$/ }));
    expect(screen.queryByText(/Eigene Methode für diese Gruppe/)).toBeNull();
  });

  it('Fix C5/C6: erneutes Prüfen nimmt eine übernommene Hilfe zurück, die nicht mehr gilt, und sagt es in einer Zeile', () => {
    renderPlanner();
    propose(N08);
    fireEvent.click(stepButton(3));
    pruefen();
    for (const knopf of within(gruppen()[0]).getAllByRole('button', { name: /^Hilfe für .* übernehmen$/ })) fireEvent.click(knopf);
    const vorher = within(gruppen()[0]).getAllByRole('button', { name: /^Hilfe für .* zurücknehmen$/ }).length;
    expect(vorher).toBeGreaterThan(0);
    fireEvent.click(within(gruppen()[0]).getByLabelText('kann noch nicht lesen'));
    fireEvent.click(within(gruppen()[0]).getByLabelText('kann noch nicht schreiben'));
    fireEvent.click(screen.getByRole('button', { name: '↻ Erneut prüfen' }));
    const nachher = within(gruppen()[0]).queryAllByRole('button', { name: /^Hilfe für .* zurücknehmen$/ }).length;
    expect(nachher).toBeLessThan(vorher);
    expect(screen.getByText(/übernommene Hilfen? (passt|passen) nicht mehr und (ist|sind) zurückgenommen\./)).toBeTruthy();
  });

  it('Fix C7: eine eingefügte Phase verschiebt eine übernommene Hilfe und prüft sie wie „Erneut prüfen“', () => {
    renderPlanner();
    propose('Mathematik Klasse 6, Brüche addieren, 90 Minuten, 26 Lernende');
    fireEvent.click(stepButton(3));
    fireEvent.click(screen.getByRole('button', { name: /DaZ \/ Sprachförderung/ }));
    pruefen();
    const [knopf] = within(gruppen()[0]).getAllByRole('button', { name: /^Hilfe für .* übernehmen$/ });
    const phase = knopf.getAttribute('aria-label')!.replace(/^Hilfe für .* in Phase /, '').replace(/ übernehmen$/, '');
    fireEvent.click(knopf);
    const add = screen.getAllByRole('button', { name: /hinzufügen$/ });
    fireEvent.click(add[0]);
    // The help moved with its phase and still holds: it stays taken over, nothing is reported as taken back.
    expect(screen.queryByText(/passt nicht mehr/)).toBeNull();
    const zurueck = within(gruppen()[0]).getAllByRole('button', { name: /^Hilfe für .* zurücknehmen$/ });
    expect(zurueck).toHaveLength(1);
    expect(zurueck[0].getAttribute('aria-label')).toContain(phase.replace(/^\d+/, ''));
  });

  it('Hinweise zur Gruppierung stehen unter den Karten der Gruppe, mit Regel und Grundlage', () => {
    renderPlanner();
    // A cooperative small-group method with a group of low prior knowledge: leistungsschwache-nicht-unter-sich.
    propose('Mathematik Klasse 8, lineare Funktionen, 90 Minuten, Gruppenpuzzle, Teilgruppe: 6 Lernende mit geringem Vorwissen');
    fireEvent.click(stepButton(3));
    pruefen();
    const g = gruppen()[0];
    const hinweise = within(g).getByRole('list', { name: /^Hinweise zu / });
    const regeln = within(hinweise).getAllByText(/^Regel: .* · Grundlage: /);
    expect(regeln.length).toBeGreaterThan(0);
    // The hints come after the cards.
    const karten = within(g).getAllByRole('listitem').filter((li) => li.classList.contains('tg-karte'));
    expect(karten[karten.length - 1].compareDocumentPosition(hinweise) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('ein gespeichertes Szenario mit Lerntyp lädt; der Wert entfällt und Schritt 3 zeigt den Hinweis einmal', () => {
    const arrangement = createChainPreset('konzeptaufbau', BUNDLE);
    const groups = [
      { id: 'regel', label: 'Regelgruppe', profile: '', focus: 'regel', active: true },
      { id: 'visuell', label: 'Visuelle', profile: '', focus: 'custom', active: true, matrixValues: { sensorische: 'sensorische-visuell', vorwissen: 'vorwissen-gering' } }
    ];
    window.localStorage.setItem(
      SAVED_SCENARIOS_KEY,
      JSON.stringify([{ id: 'sc_lt', savedAt: '2026-01-01T00:00:00Z', title: 'Lerntyp', fach: 'Physik', thema: 'Dichte', hinweise: '', arrangement, groups, aiDiffByStep: {}, oerByStep: {}, elaboration: null }])
    );
    renderPlanner();
    fireEvent.click(screen.getByRole('button', { name: /Gespeichert \(1\)/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Laden' }));
    fireEvent.click(stepButton(3));
    expect(screen.getAllByText(BUNDLE.teilgruppen.gesperrtText!)).toHaveLength(1);
    fireEvent.click(stepButton(2));
    fireEvent.click(stepButton(3));
    expect(screen.queryByText(BUNDLE.teilgruppen.gesperrtText!)).toBeNull();
  });
});

describe('Schritt 5: Entwurf mit sieben Kernfeldern nach Planungsprofil (Paket D, D2)', () => {
  it('Schritt 1: aufklappbares Feld „Was soll nebenbei gefördert werden?“ ohne Vorauswahl; die Auswahl geht als begleitziel an die Zuordnung (D3)', () => {
    const spy = vi.spyOn(CATALOG.matcher, 'zuordnen');
    renderPlanner();
    expect(screen.getByText('Was soll nebenbei gefördert werden?')).toBeTruthy();
    const feld = screen.getByRole('group', { name: 'Was soll nebenbei gefördert werden?' });
    const boxen = within(feld).getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxen.map((b) => b.closest('label')!.textContent)).toEqual(['Fach- und Bildungssprache', 'Soziales Lernen', 'Selbstregulation']);
    expect(boxen.every((b) => !b.checked)).toBe(true);
    propose('Physik Klasse 8, Stromkreis, 45 Minuten');
    expect(spy.mock.calls.at(-1)![0]!.begleitziel).toBeUndefined();
    fireEvent.click(stepButton(1));
    fireEvent.click(within(screen.getByRole('group', { name: 'Was soll nebenbei gefördert werden?' })).getByLabelText('Soziales Lernen'));
    propose('Physik Klasse 8, Stromkreis, 45 Minuten, Lernstrategien');
    // The field and the text together: what the text names is not lost.
    expect(spy.mock.calls.at(-1)![0]!.begleitziel).toEqual(['sozial', 'selbstregulation']);
    spy.mockRestore();
  });

  it('Schritt 2: Begleitstrang als Vorschlagskarte, übernehmen und wieder entfernen; Schritt 4 als Material; Schritt 5 nennt ihn (D3)', () => {
    renderPlanner();
    propose('Englisch Klasse 5, Wortschatz Tiere, 45 Minuten, soziales Lernen stärken');
    const strang = (CATALOG.matcher.zuordnen({ text: 'Englisch Klasse 5, Wortschatz Tiere, 45 Minuten, soziales Lernen stärken' }) as { begleitstrang?: Array<{ name: string; dauerMin: number }> }).begleitstrang![0];
    const box = screen.getByRole('region', { name: 'Begleitziele' });
    expect(within(box).getByText(new RegExp(`Vorschlag: ${strang.name}, ${strang.dauerMin} min am Ende`))).toBeTruthy();
    expect(within(box).getByText(/Ein Vorschlag zum Übernehmen/)).toBeTruthy();
    // Nothing is taken over until you click.
    const rows = () => within(screen.getByRole('table')).getAllByRole('row').length;
    const vorher = rows();
    fireEvent.click(within(box).getByRole('button', { name: `${strang.name} am Ende übernehmen` }));
    expect(rows()).toBe(vorher + 1);
    fireEvent.click(within(screen.getByRole('region', { name: 'Begleitziele' })).getByRole('button', { name: `${strang.name} wieder entfernen` }));
    expect(rows()).toBe(vorher);

    fireEvent.click(stepButton(4));
    const mat = screen.getByRole('region', { name: 'Begleitstrang für Begleitziele' });
    expect(within(mat).getAllByText(new RegExp(strang.name)).length).toBeGreaterThan(0);
    fireEvent.click(within(mat).getByRole('button', { name: `${strang.name} als Material anhängen` }));
    expect(within(screen.getByRole('region', { name: 'Begleitstrang für Begleitziele' })).getByRole('button', { name: `Material zu ${strang.name} zurücknehmen` })).toBeTruthy();

    fireEvent.click(stepButton(5));
    const text = document.body.textContent || '';
    expect(text).toContain('Soziales Lernen');
    expect(text).toContain(`Begleitstrang (Vorschlag): ${strang.name}, ${strang.dauerMin} min am Ende (Soziales Lernen)`);
  });

  it('zwei Begleitziele: zwei verschiedene Methoden; eine übernehmen markiert nur diese; im Ablauf kein Material mehr (Fix-Welle D, Punkt 1)', () => {
    renderPlanner();
    fireEvent.click(within(screen.getByRole('group', { name: 'Was soll nebenbei gefördert werden?' })).getByLabelText('Soziales Lernen'));
    propose('Physik Klasse 8, Stromkreis, 45 Minuten, Lernstrategien');
    const r = CATALOG.matcher.zuordnen({ text: 'Physik Klasse 8, Stromkreis, 45 Minuten, Lernstrategien', begleitziel: ['sozial', 'selbstregulation'] }) as { begleitstrang?: Array<{ name: string; baustein: string }> };
    const [a, b] = r.begleitstrang!;
    expect(a.baustein).not.toBe(b.baustein);
    const box = () => screen.getByRole('region', { name: 'Begleitziele' });
    // Attach a as material first, then take it into the flow: the material goes, it is a phase now.
    fireEvent.click(stepButton(4));
    fireEvent.click(within(screen.getByRole('region', { name: 'Begleitstrang für Begleitziele' })).getByRole('button', { name: `${a.name} als Material anhängen` }));
    fireEvent.click(stepButton(2));
    fireEvent.click(within(box()).getByRole('button', { name: `${a.name} am Ende übernehmen` }));
    expect(within(box()).getByRole('button', { name: `${a.name} wieder entfernen` })).toBeTruthy();
    expect(within(box()).getByRole('button', { name: `${b.name} am Ende übernehmen` })).toBeTruthy();
    fireEvent.click(stepButton(4));
    const mat = screen.getByRole('region', { name: 'Begleitstrang für Begleitziele' });
    expect(within(mat).queryByRole('button', { name: `${a.name} als Material anhängen` })).toBeNull();
    expect(within(mat).queryByRole('button', { name: `Material zu ${a.name} zurücknehmen` })).toBeNull();
    expect(within(mat).getByText((t) => t.startsWith(`${a.name} steht als letzte Phase im Ablauf`))).toBeTruthy();
    expect(within(mat).getByRole('button', { name: `${b.name} als Material anhängen` })).toBeTruthy();
    fireEvent.click(stepButton(5));
    const text = document.body.textContent || '';
    expect(text).not.toContain(`Begleitstrang (${'Soziales Lernen'}): ${a.name}`);
  });

  it('Speichern und Laden behält Planungsprofil, Einheit, Nachweis, Regelhinweise und Begleitstrang im Entwurf (Fix-Welle D, Punkt 7)', () => {
    const text = 'Berufsschule, Unterweisung im Betrieb: Bohrmaschine sicher bedienen, Einheit Lernfeld 3, 45 Minuten, Lernstand prüfen, soziales Lernen stärken';
    renderPlanner();
    propose(text);
    fireEvent.click(stepButton(5));
    const vorher = document.body.textContent || '';
    const erwartet = ['Konzept zur Ausbildungssituation', 'Lernfeld 3', 'Begleitstrang (Vorschlag)', 'Tätigkeit der Ausbilderin oder des Ausbilders'];
    for (const t of erwartet) expect(vorher, t).toContain(t);
    fireEvent.click(screen.getAllByRole('button', { name: /Speichern/ })[0]);
    const gespeichert = JSON.parse(window.localStorage.getItem(SAVED_SCENARIOS_KEY)!)[0];
    expect(gespeichert.entwurfAngaben).toMatchObject({ planungsprofil: 'betrieb', einheit: 'Lernfeld 3' });
    cleanup();

    renderPlanner();
    fireEvent.click(screen.getByRole('button', { name: /Gespeichert \(1\)/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Laden' }));
    fireEvent.click(stepButton(5));
    const nachher = document.body.textContent || '';
    for (const t of erwartet) expect(nachher, t).toContain(t);
    expect(nachher).not.toContain('Unterrichtsentwurf mit Lernsituation');
    const nachweis = CATALOG.labelOf('nachweisform', 'praktisch');
    expect(vorher).toContain(`**Nachweis:** ${nachweis}`.replace(/\*\*/g, ''));
    expect(nachher).toContain(`Nachweis: ${nachweis}`);
    const regel = BUNDLE.regeln!.find((r) => r.id === 'sicherheitshinweis')!;
    expect(vorher).toContain(regel.name);
    expect(nachher).toContain(regel.name);
  });

  it('Schritt 2: Begleitziel Sprache ohne Begleitstrang, mit dem Hinweis auf Hilfen in Schritt 3 (D3)', () => {
    renderPlanner();
    propose('Chemie Klasse 9, Säuren und Basen, 45 Minuten, sprachsensibel');
    const box = screen.getByRole('region', { name: 'Begleitziele' });
    expect(within(box).getByText(/Schritt 3/)).toBeTruthy();
    expect(within(box).queryByRole('button', { name: /am Ende übernehmen$/ })).toBeNull();
  });

  it('n15: Sitzung, Studierende, Modul; Spalten in den Begriffen der Hochschule', () => {
    renderPlanner();
    propose('Hochschule, Seminar Statistik, 90 Minuten, 25 Studierende, Prüfungsform Klausur');
    expect(screen.getAllByText(/Tätigkeit der Lehrenden/).length).toBeGreaterThan(0);
    fireEvent.click(stepButton(5));
    const text = document.body.textContent || '';
    for (const t of ['Ablaufplan der Sitzung', 'Lernvoraussetzungen der Studierenden', 'Einordnung in das Modul', 'Verlaufsplan der Sitzung', 'Sicherung und Kontrolle des Lernerfolgs', 'Reflexion und Evaluation', 'Prüfungsform']) {
      expect(text, t).toContain(t);
    }
    expect(text).not.toContain('Sekundarstufe I');
  });
});

describe('Schritt 1 und 5: jede Angabe erreicht den Kern (App-Nachzug N3)', () => {
  const mehrAngaben = () => screen.getByText(/^Mehr Angaben \(freiwillig\)/).closest('details')!;
  const waehle = (label: string, value: string) => fireEvent.change(within(mehrAngaben()).getByLabelText(label), { target: { value } });

  it('„Mehr Angaben“ nennt alle freiwilligen Angaben, auch Raum und Begleitziel, und enthält sie', () => {
    renderPlanner();
    const zeile = screen.getByText(/^Mehr Angaben \(freiwillig\)/).textContent!;
    for (const t of ['Fach', 'Stufe', 'Vorwissen', 'Sprachniveau', 'Komplexität', 'Lehrende', 'Raum', 'Technik', 'Lesen und Schreiben', 'Termine', 'Nachweis', 'Bewertung', 'Einheit', 'Planungsprofil', 'Begleitziel']) {
      expect(zeile, t).toContain(t);
    }
    const mehr = mehrAngaben();
    expect(within(mehr).getByLabelText('Raum')).toBeTruthy();
    expect(within(mehr).getByRole('group', { name: 'Was soll nebenbei gefördert werden?' })).toBeTruthy();
  });

  it('neue Felder ohne Vorauswahl; alle gehen in die Anfrage an den Kern, Vorwissen und Bildungsstufe eingeschlossen', () => {
    const spy = vi.spyOn(CATALOG.matcher, 'zuordnen');
    renderPlanner();
    const mehr = mehrAngaben();
    for (const name of ['Sprachniveau', 'Komplexität des Inhalts', 'Nachweis', 'Wird die Stunde bewertet?', 'Planungsprofil', 'Art der Fachausstattung']) {
      expect((within(mehr).getByLabelText(name) as HTMLSelectElement).value, name).toBe('');
    }
    for (const name of ['Übergeordnete Einheit', 'Anzahl Lehrende']) expect((within(mehr).getByLabelText(name) as HTMLInputElement).value, name).toBe('');
    // The options are the core's values of the field.
    const opts = (label: string) => within(within(mehr).getByLabelText(label)).getAllByRole('option').map((o) => (o as HTMLOptionElement).value).filter(Boolean);
    const kern = (feld: string) => CATALOG.matcher.felder().find((f) => f.feld === feld)!.werte!.map((w) => w.code);
    expect(opts('Sprachniveau')).toEqual(kern('sprachniveau'));
    expect(opts('Planungsprofil')).toEqual(kern('planungsprofil'));
    expect(opts('Art der Fachausstattung')).toEqual(kern('fachausstattungArt'));
    propose('Biologie, Fotosynthese, 45 Minuten');
    const leer = spy.mock.calls.at(-1)![0]!;
    for (const f of ['vorwissen', 'sprachniveau', 'komplexitaet', 'nachweis', 'einheit', 'bewertet', 'planungsprofil', 'lehrende', 'fachausstattungArt']) expect(leer[f], f).toBeUndefined();

    fireEvent.click(stepButton(1));
    waehle('Bildungsstufe', 'sek2');
    waehle('Vorwissen', 'hoch');
    waehle('Sprachniveau', 'b1');
    waehle('Komplexität des Inhalts', 'hoch');
    waehle('Nachweis', 'muendlich');
    waehle('Übergeordnete Einheit', 'Reihe Ökologie');
    waehle('Wird die Stunde bewertet?', 'nein');
    waehle('Planungsprofil', 'erwachsenenbildung');
    waehle('Anzahl Lehrende', '2');
    waehle('Raum', 'fachraum');
    waehle('Art der Fachausstattung', 'labor');
    propose('Biologie, Fotosynthese, 45 Minuten');
    expect(spy.mock.calls.at(-1)![0]).toMatchObject({
      bildungsstufe: 'sek2',
      vorwissen: 'hoch',
      sprachniveau: 'b1',
      komplexitaet: 'hoch',
      nachweis: 'muendlich',
      einheit: 'Reihe Ökologie',
      bewertet: false,
      planungsprofil: 'erwachsenenbildung',
      lehrende: 2,
      raum: 'fachraum',
      fachausstattungArt: 'labor'
    });
    spy.mockRestore();
  });

  it('KI-Weg: die strukturierten Angaben samt Ergänzungen aus „Fehlt noch“ gehen neben dem Text an /assistant/translate', async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: { body?: string }) => {
        const body = JSON.parse(init?.body || '{}') as Record<string, unknown>;
        if (url === '/api/v1/assistant/translate') bodies.push(body);
        const { text, ...felder } = body;
        const ergebnis = CATALOG.matcher.zuordnen({ ...felder, text: String(text || '') });
        return { ok: true, status: 200, json: async () => ({ quelle: 'regeln-fallback', ergebnis }) };
      })
    );
    const meta = CATALOG.meta;
    (CATALOG as { meta: unknown }).meta = { llmConfigured: true, llmModel: 'test' };
    try {
      renderPlanner();
      fireEvent.change(screen.getByLabelText('Unterrichtsvorhaben beschreiben'), { target: { value: 'etwas über Pflanzen' } });
      fireEvent.click(screen.getByRole('button', { name: 'Ohne KI vorschlagen' }));
      fireEvent.click(stepButton(1));
      const zeile = screen.getByRole('region', { name: 'Verstanden und fehlt noch' });
      fireEvent.change(within(zeile).getByLabelText('Bildungsstufe ergänzen'), { target: { value: 'primar' } });
      fireEvent.change(within(zeile).getByLabelText('Zeit in Minuten ergänzen'), { target: { value: '45' } });
      waehle('Sprachniveau', 'a2');
      fireEvent.click(screen.getByRole('button', { name: /✨ Ablauf vorschlagen/ }));
      await waitFor(() => expect(bodies.length).toBe(1));
      expect(bodies[0]).toMatchObject({ bildungsstufe: 'primar', zeitMin: 45, sprachniveau: 'a2' });
      expect(String(bodies[0].text)).toContain('etwas über Pflanzen');
    } finally {
      (CATALOG as { meta: unknown }).meta = meta;
      vi.unstubAllGlobals();
    }
  });

  it('Schritt 5: Planungsprofil wählbar (derselbe Zustand wie in Schritt 1); leer folgt es wieder aus der Stufe', () => {
    renderPlanner();
    propose('Biologie Klasse 7, Fotosynthese, 45 Minuten');
    fireEvent.click(stepButton(5));
    expect(document.body.textContent).toContain('Unterrichtsentwurf');
    const profil = screen.getByLabelText('Planungsprofil') as HTMLSelectElement;
    expect(profil.value).toBe('');
    fireEvent.change(profil, { target: { value: 'hochschule' } });
    expect(document.body.textContent).toContain('Ablaufplan der Sitzung');
    fireEvent.click(stepButton(1));
    expect((within(mehrAngaben()).getByLabelText('Planungsprofil') as HTMLSelectElement).value).toBe('hochschule');
    // Proposed again with the profile chosen, then cleared in step 5: derived from the Stufe again.
    propose('Biologie Klasse 7, Fotosynthese, 45 Minuten');
    fireEvent.click(stepButton(5));
    expect(document.body.textContent).toContain('Ablaufplan der Sitzung');
    fireEvent.change(screen.getByLabelText('Planungsprofil'), { target: { value: '' } });
    expect(document.body.textContent).not.toContain('Ablaufplan der Sitzung');
    expect(document.body.textContent).toContain('Unterrichtsentwurf');
  });

  it('Einheit und Bewertung aus Schritt 1 stehen im Entwurf und bleiben nach Speichern und Laden', () => {
    renderPlanner();
    waehle('Übergeordnete Einheit', 'Reihe Ökologie');
    waehle('Wird die Stunde bewertet?', 'ja');
    waehle('Vorwissen', 'gering');
    propose('Biologie Klasse 7, Fotosynthese, 45 Minuten');
    fireEvent.click(stepButton(5));
    const vorher = document.body.textContent || '';
    expect(vorher).toContain('Reihe Ökologie');
    expect(vorher).toContain('wird bewertet');
    fireEvent.click(screen.getAllByRole('button', { name: /Speichern/ })[0]);
    const gespeichert = JSON.parse(window.localStorage.getItem(SAVED_SCENARIOS_KEY)!)[0];
    expect(gespeichert.mehrAngaben).toMatchObject({ einheit: 'Reihe Ökologie', bewertet: true, vorwissen: 'gering' });
    expect(gespeichert.entwurfAngaben).toMatchObject({ einheit: 'Reihe Ökologie', bewertet: true });
    cleanup();

    renderPlanner();
    fireEvent.click(screen.getByRole('button', { name: /Gespeichert \(1\)/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Laden' }));
    fireEvent.click(stepButton(5));
    const nachher = document.body.textContent || '';
    expect(nachher).toContain('Reihe Ökologie');
    expect(nachher).toContain('wird bewertet');
    fireEvent.click(stepButton(1));
    expect((within(mehrAngaben()).getByLabelText('Wird die Stunde bewertet?') as HTMLSelectElement).value).toBe('ja');
    expect((within(mehrAngaben()).getByLabelText('Vorwissen') as HTMLSelectElement).value).toBe('gering');
  });
});
