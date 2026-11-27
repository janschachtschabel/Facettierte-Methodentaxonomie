import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  ausschlussInSituation,
  baueSituation,
  createMatcher,
  createSearch,
  createValidator,
  kettenSchritt,
  type Arrangement,
  type CatalogBundle,
  type FmtData
} from '@fmt/core';
import { PlannerPage } from '../src/pages/PlannerPage.js';
import { ApiMcpPage } from '../src/pages/ApiMcpPage.js';
import { createChainPreset } from './kettenVorlage.js';
import { SAVED_SCENARIOS_KEY } from '../src/planner/scenarioStorage.js';
import { getMainSequence } from '../src/planner/arrangementOps.js';

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
const mehrAngaben = () => screen.getByText(/^Mehr Angaben \(freiwillig\)/).closest('details')!;
const feld = (label: string) => within(mehrAngaben()).getByLabelText(label) as HTMLSelectElement | HTMLInputElement;

describe('Schlussreview-Fixwelle (Baukasten)', () => {
  it('I2: die Auswahl je Schritt der Partitur bietet nur, was der Kern zulässt; der Rest steht gesperrt mit Grund', () => {
    const spy = vi.spyOn(CATALOG.matcher, 'zuordnen');
    renderPlanner();
    fireEvent.change(screen.getByLabelText('Raum'), { target: { value: 'klassenraum' } });
    fireEvent.click(screen.getByLabelText('Die Lernenden können noch nicht lesen'));
    propose('Bruchrechnen Klasse 2, 45 Minuten, direkte Instruktion');
    const res = spy.mock.results.at(-1)!.value as ReturnType<typeof CATALOG.matcher.zuordnen>;
    spy.mockRestore();
    if (res.modus !== 'ablauf' || !res.arrangement) throw new Error('kein Ablauf');
    const { text: _t, ...anfrage } = res.kriterien as Record<string, unknown>;
    const situation = baueSituation(anfrage, BUNDLE);
    const steps = getMainSequence(res.arrangement).seq.teile.filter((t) => t && t.typ === 'Einsatz') as Array<{ baustein: string; kettenschritt?: string }>;

    fireEvent.click(screen.getByRole('button', { name: /Methoden tauschen und umstellen/ }));
    const selects = screen.getAllByLabelText(/^Baustein für Schritt \d+$/) as HTMLSelectElement[];
    expect(selects.length).toBe(steps.length);
    let gesperrt = 0;
    selects.forEach((select, i) => {
      const schritt = kettenSchritt(BUNDLE, res.arrangement!.zieltyp, steps[i].kettenschritt);
      for (const o of Array.from(select.options)) {
        const b = CATALOG.blocksById.get(o.value)!;
        const aus = ausschlussInSituation(b, { anfrage, situation, schritt, data: BUNDLE });
        if (o.value === steps[i].baustein) continue;
        if (o.disabled) {
          gesperrt++;
          expect(aus, o.value).not.toBeNull();
          expect(o.textContent).toContain(aus!.grund);
          expect((o.parentElement as HTMLOptGroupElement).label).toBe('Passt hier nicht');
        } else {
          expect(aus, `${o.value} in Schritt ${i + 1}`).toBeNull();
        }
      }
    });
    expect(gesperrt).toBeGreaterThan(0);
  });

  it('Minor 2: hat der Ablauf eigene Arbeit, verwirft die Wahl der Funktionskette sie nicht, sondern gilt beim nächsten Vorschlag', () => {
    const spy = vi.spyOn(CATALOG.matcher, 'zuordnen');
    renderPlanner();
    propose('Mathematik Bruchrechnen Klasse 6, 90 Minuten');
    // Own work: one method swapped by hand in the Partitur.
    fireEvent.click(screen.getByRole('button', { name: /Methoden tauschen und umstellen/ }));
    const select = screen.getAllByLabelText(/^Baustein für Schritt \d+$/)[0] as HTMLSelectElement;
    const anders = Array.from(select.options).find((o) => !o.disabled && o.value !== select.value)!.value;
    fireEvent.change(select, { target: { value: anders } });
    const vorher = spy.mock.calls.length;
    fireEvent.click(stepButton(1));
    fireEvent.change(feld('Funktionskette / Zieltyp'), { target: { value: 'vollstaendige-handlung' } });
    expect(spy.mock.calls.length).toBe(vorher);
    expect(screen.getByText(/Die Kette „Berufliche Handlung[^“]*“ gilt beim nächsten Vorschlag/)).toBeTruthy();
    fireEvent.click(stepButton(2));
    fireEvent.click(screen.getByRole('button', { name: /Methoden tauschen und umstellen/ }));
    expect((screen.getAllByLabelText(/^Baustein für Schritt \d+$/)[0] as HTMLSelectElement).value).toBe(anders);
    // The next proposal takes the wish.
    fireEvent.click(stepButton(1));
    fireEvent.click(screen.getByRole('button', { name: /Ablauf vorschlagen/ }));
    expect(spy.mock.calls.at(-1)![0]!.zieltyp).toBe('vollstaendige-handlung');
    spy.mockRestore();
  });

  it('Minor 3: ein vor dem Nachzug gespeichertes Szenario zeigt Stufe, Vorwissen und Zeit aus dem Kontext; sie lassen sich leeren', () => {
    const arrangement: Arrangement = { ...createChainPreset('konzeptaufbau', BUNDLE), kontext: { bildungsstufe: 'sek1', vorwissen: 'gering', zeitbudgetMin: 90 } };
    window.localStorage.setItem(
      SAVED_SCENARIOS_KEY,
      JSON.stringify([
        { id: 'sc_alt', savedAt: '2026-01-01T00:00:00Z', title: 'Alt', fach: 'Mathematik', thema: 'Brüche', hinweise: '', arrangement, groups: [], aiDiffByStep: {}, oerByStep: {}, elaboration: null }
      ])
    );
    const spy = vi.spyOn(CATALOG.matcher, 'zuordnen');
    renderPlanner();
    fireEvent.click(screen.getByRole('button', { name: /Gespeichert \(1\)/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Laden' }));
    fireEvent.click(stepButton(1));
    expect(feld('Bildungsstufe').value).toBe('sek1');
    expect(feld('Vorwissen').value).toBe('gering');
    expect(feld('Zeitbudget (Min.)').value).toBe('90');
    fireEvent.change(feld('Vorwissen'), { target: { value: '' } });
    expect(feld('Vorwissen').value).toBe('');
    propose('Mathematik Brüche');
    const req = spy.mock.calls.at(-1)![0]!;
    expect(req.vorwissen).toBeUndefined();
    expect(req.bildungsstufe).toBe('sek1');
    spy.mockRestore();
  });

  it('Minor 6: der Raum steht in Schritt 1 sichtbar, nicht in „Mehr Angaben“', () => {
    renderPlanner();
    const raum = screen.getByLabelText('Raum');
    expect(raum.closest('details')).toBeNull();
    expect(within(mehrAngaben()).queryByLabelText('Raum')).toBeNull();
    expect(screen.getByText(/^Mehr Angaben \(freiwillig\)/).textContent).not.toMatch(/Lehrende, Raum,/);
  });
});

describe('Schlussreview-Fixwelle (API-Seite und Dev-Proxy)', () => {
  it('Minor 1: die API-Seite beschreibt ohneMethode und liest hilfe nicht als Hilfe in derselben Methode', () => {
    render(
      <MemoryRouter>
        <ApiMcpPage />
      </MemoryRouter>
    );
    const tabelle = screen.getByRole('table', { name: 'Neue Felder der FMT 2.0' });
    expect(within(tabelle).getByText('ohneMethode', { selector: 'td > code' })).toBeTruthy();
    expect(document.body.textContent).not.toContain('Hilfe in derselben Methode');
  });

  it('Minor 7: der Dev-Proxy leitet nur /api/ weiter, nicht die Seite /api-mcp', () => {
    // Read from the file: importing the config loads esbuild, which does not run under jsdom.
    const src = fs.readFileSync(path.join(ROOT, 'apps', 'web', 'vite.config.ts'), 'utf8');
    const keys = [...src.matchAll(/'([^']+)':\s*'http:\/\/localhost/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(3);
    expect(keys).not.toContain('/api');
    const matches = (url: string) => keys.some((k) => (k.startsWith('^') ? new RegExp(k).test(url) : url.startsWith(k)));
    expect(matches('/api/v1/meta')).toBe(true);
    expect(matches('/api-mcp')).toBe(false);
  });
});
