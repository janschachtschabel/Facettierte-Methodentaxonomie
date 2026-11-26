import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CatalogBundle } from '@fmt/core';
import { SystematikPage } from '../src/pages/SystematikPage.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BUNDLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist-data', 'catalog.bundle.json'), 'utf8')) as CatalogBundle;
const labels = new Map<string, string>();
for (const s of BUNDLE.schemes) for (const w of s.werte || (s.gruppen || []).flatMap((g) => g.werte)) labels.set(`${s.id}:${w.id}`, w.label);

const CATALOG = {
  bundle: BUNDLE,
  labelOf: (scheme: string, code: string) => labels.get(`${scheme}:${code}`) || code,
  valuesOf: (scheme: string) => {
    const s = BUNDLE.schemes.find((x) => x.id === scheme);
    return s ? s.werte || (s.gruppen || []).flatMap((g) => g.werte) : [];
  }
};
vi.mock('../src/data/CatalogContext.js', () => ({ useCatalog: () => CATALOG }));

afterEach(() => cleanup());

describe('Einsatzprofil in der Oberfläche', () => {
  it('Systematik zeigt das Einsatzprofil mit Bedarf und Eignung statt „Ergänzende Merkmale“', () => {
    render(
      <MemoryRouter>
        <SystematikPage />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: 'Einsatzprofil: Bedarf und Eignung' })).toBeTruthy();
    for (const feld of ['raumbedarf', 'schriftbedarf', 'fachbereichUngeeignet']) expect(screen.getByText(feld)).toBeTruthy();
    expect(screen.queryByText(/Ergänzende Merkmale/)).toBeNull();
    expect(screen.queryByText(/Bedingungsraum/)).toBeNull();
  });
});
