import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { createSearch, createValidator, type CatalogBundle, type FmtData } from '@fmt/core';
import { SystematikPage, GRUNDLAGE_TEXT } from '../src/pages/SystematikPage.js';
import { grundlageKlartext } from '../src/planner/regelmeldung.js';
import { MethodDetailPage } from '../src/pages/MethodDetailPage.js';
import { CatalogPage } from '../src/pages/CatalogPage.js';
import { RAUM_EIGENSCHAFT_KLARTEXT } from '../src/planner/rahmen.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BUNDLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist-data', 'catalog.bundle.json'), 'utf8')) as CatalogBundle;
const DATA = { ...BUNDLE, VERSION: BUNDLE.version } as unknown as FmtData;
const labels = new Map<string, string>();
for (const s of BUNDLE.schemes) for (const w of s.werte || (s.gruppen || []).flatMap((g) => g.werte)) labels.set(`${s.id}:${w.id}`, w.label);

const validator = createValidator(DATA);
const CATALOG = {
  bundle: BUNDLE,
  loading: false,
  error: null,
  blocksById: new Map(BUNDLE.bausteine.map((b) => [b.kennung, b])),
  search: createSearch(DATA, validator),
  comparePair: [null, null],
  setComparePair: () => {},
  queueBlockForPlanner: () => {},
  labelOf: (scheme: string, code: string) => labels.get(`${scheme}:${code}`) || code,
  valuesOf: (scheme: string) => {
    const s = BUNDLE.schemes.find((x) => x.id === scheme);
    return s ? s.werte || (s.gruppen || []).flatMap((g) => g.werte) : [];
  }
};
vi.mock('../src/data/CatalogContext.js', () => ({ useCatalog: () => CATALOG }));

afterEach(() => cleanup());

const sectionOf = (heading: string) => screen.getByRole('heading', { name: heading }).closest('section') as HTMLElement;

describe('W-Raster in der Oberfläche', () => {
  it('Systematik zeigt das W-Raster mit neun W-Feldern, fünf Arten, Raumtypen und Zielarten', () => {
    render(
      <MemoryRouter>
        <SystematikPage />
      </MemoryRouter>
    );
    const sec = sectionOf('Das W-Raster: neun Fragen, fünf Arten von Aussagen');
    const raster = within(sec).getByRole('table', { name: 'W-Raster' });
    const zeilen = within(raster).getAllByRole('row').slice(1);
    expect(zeilen.length).toBe(9);
    for (const w of BUNDLE.wfelder!) expect(within(raster).getByText(w.frage)).toBeTruthy();
    for (const a of BUNDLE.arten!) expect(within(raster).getByRole('columnheader', { name: a.name })).toBeTruthy();
    for (const feld of ['raumbedarf', 'schriftbedarf', 'termineMin', 'fachbereichUngeeignet']) expect(within(raster).getByText(feld)).toBeTruthy();

    const raeume = within(sec).getByRole('table', { name: 'Raumtypen' });
    expect(within(raeume).getAllByRole('row').slice(1).length).toBe(12);
    expect(within(raeume).getByText('Hörsaal')).toBeTruthy();

    const ziele = within(sec).getByRole('table', { name: 'Zielarten' });
    expect(within(ziele).getAllByRole('row').slice(1).length).toBe(9);
    expect(within(ziele).getByText(/Urteilsbildung/)).toBeTruthy();
    expect(within(ziele).getAllByText(/Kontrovers diskutieren und abwägen/).length).toBeGreaterThan(0);

    expect(screen.getByRole('heading', { name: 'Die 12 Lernzustände als Schnittstelle' })).toBeTruthy();
    expect(screen.queryAllByText(/11 Lernzustände/).map((e) => e.textContent)).toEqual([]);
    expect(screen.queryAllByText(/Ergänzende Merkmale/).map((e) => e.textContent)).toEqual([]);
    expect(screen.queryAllByText(/Bedingungsraum/).map((e) => e.textContent)).toEqual([]);
    // Room types are never called "Lernort" (a method name may still contain the word).
    expect(sec.textContent).not.toMatch(/Lernort/);
  });

  it('Systematik zeigt die Passungsregeln aus den Daten neben den 13 Kompositionsregeln (Task B4)', () => {
    render(
      <MemoryRouter>
        <SystematikPage />
      </MemoryRouter>
    );
    const sec = sectionOf('Passungsregeln');
    const tabelle = within(sec).getByRole('table', { name: 'Passungsregeln' });
    expect(within(tabelle).getAllByRole('row').slice(1).length).toBe(BUNDLE.regeln!.length);
    expect(within(tabelle).getByText('Schrift bei niedrigem Sprachniveau')).toBeTruthy();
    expect(within(tabelle).getAllByText(/Höfler et al\. 2024/).length).toBeGreaterThan(0);
    const wirkung = within(sec).getByRole('table', { name: 'Welche Wirkung hat welche Art' });
    for (const w of ['schließt aus', 'warnt', 'ordnet', 'weist hin']) expect(within(wirkung).getByRole('rowheader', { name: w })).toBeTruthy();
    expect(within(wirkung).getByText('Eignung')).toBeTruthy();
    // The section stands next to the composition rules.
    const kompo = sectionOf('Die 13 Kompositionsregeln (R-00 bis R-12)');
    expect(kompo.nextElementSibling).toBe(sec);
    expect(sec.textContent).not.toMatch(/Bedingungsraum|Anforderung/);
  });

  it('Grundlage „U“ heißt „ungeklärt“ (Spec §6), nicht „Umsetzung“', () => {
    expect(grundlageKlartext({ grundlage: 'U' })).toBe('ungeklärt');
    expect(GRUNDLAGE_TEXT.U).toBe('ungeklärt (U)');
  });

  it('Methodendetail zeigt „Was die Methode braucht“ nach W-Feld mit dem Hinweis zum Raum', () => {
    const b = BUNDLE.bausteine.find((x) => x.raumhinweis && (x.raumbedarf || []).length)!;
    render(
      <MemoryRouter initialEntries={[`/methoden/${b.kennung}`]}>
        <Routes>
          <Route path="/methoden/:kennung" element={<MethodDetailPage />} />
        </Routes>
      </MemoryRouter>
    );
    const sec = sectionOf('Was die Methode braucht');
    expect(within(sec).getByText('Lernumgebung')).toBeTruthy();
    expect(within(sec).getByText('Zeit')).toBeTruthy();
    expect(within(sec).getByText(RAUM_EIGENSCHAFT_KLARTEXT[b.raumbedarf![0]], { exact: false })).toBeTruthy();
    expect(within(sec).getByText(b.raumhinweis!, { exact: false })).toBeTruthy();

    cleanup();
    const t = BUNDLE.bausteine.find((x) => x.termineMin)!;
    render(
      <MemoryRouter initialEntries={[`/methoden/${t.kennung}`]}>
        <Routes>
          <Route path="/methoden/:kennung" element={<MethodDetailPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(within(sectionOf('Was die Methode braucht')).getByText(`mindestens ${t.termineMin} Termine`, { exact: false })).toBeTruthy();
  });

  it('Katalog filtert nach Raum und „ohne Lesen und Schreiben“', () => {
    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>
    );
    // The table view renders faster than 300 cards with diagrams.
    fireEvent.click(screen.getByRole('button', { name: 'Tabelle' }));
    const anzahl = () => Number((screen.getByTestId('trefferzahl').textContent || '').match(/\d+/)![0]);
    const alle = anzahl();
    expect(alle).toBe(BUNDLE.bausteine.length);

    // Independent expectation: the lecture hall offers a writing place and a wall (vocab raumtyp), so only methods
    // whose room needs are among these stay; a warm-up (Bewegungsfläche) goes, a lecture (no room need) stays.
    fireEvent.change(screen.getByLabelText('Raum'), { target: { value: 'hoersaal' } });
    const hoersaalBietet = new Set(['schreibplatz', 'wandflaeche']);
    const imHoersaal = BUNDLE.bausteine.filter((b) => (b.raumbedarf || []).every((x) => hoersaalBietet.has(x))).length;
    expect(imHoersaal).toBeGreaterThan(0);
    expect(imHoersaal).toBeLessThan(alle);
    expect(anzahl()).toBe(imHoersaal);
    expect(screen.queryByText('Aufwärmen / Aufwärmspiel')).toBeNull();
    expect(screen.getByText('Lehrervortrag (klassisch)')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Raum'), { target: { value: '' } });
    fireEvent.click(screen.getByLabelText('ohne Lesen und Schreiben'));
    // A learning journal (schreibt) goes; the warm-up (no reading or writing) is back.
    expect(anzahl()).toBeGreaterThan(0);
    expect(anzahl()).toBeLessThan(alle);
    expect(screen.queryByText('Lerntagebuch mit Leitfragen (Prompts)')).toBeNull();
    expect(screen.getByText('Aufwärmen / Aufwärmspiel')).toBeTruthy();
    }, 60_000);
});
