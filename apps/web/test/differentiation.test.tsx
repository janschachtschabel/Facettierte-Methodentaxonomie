import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CatalogBundle } from '@fmt/core';
import { DifferentiationPage } from '../src/pages/DifferentiationPage.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BUNDLE = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'dist-data', 'catalog.bundle.json'), 'utf8')
) as CatalogBundle;

vi.mock('../src/data/CatalogContext.js', () => ({
  useCatalog: () => ({
    bundle: BUNDLE
  })
}));

afterEach(() => {
  cleanup();
});

describe('DifferentiationPage (/differenzierung)', () => {
  it('renders UDL basis, conflicts with resolution strategies, analog filter, and system-measures toggle cleanly', () => {
    render(
      <MemoryRouter initialEntries={['/differenzierung']}>
        <DifferentiationPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/Binnendifferenzierung & Szenario-Anpassung/i)).toBeTruthy();
    expect(screen.getByText(/1\. Gemeinsame Basis für alle \(UDL/i)).toBeTruthy();
    expect(screen.getByText(/2\. Zielkonflikte zwischen Teilgruppen/i)).toBeTruthy();
    expect(screen.getByText(/4\. Phasen-Anpassungen/i)).toBeTruthy();
    expect(screen.getByText(/heuristischen Expertenmodell/i)).toBeTruthy();

    // Default preset is analog (t-keine + ohneInternet) and excludes system measures
    expect(screen.queryByText(/Interaktive digitale Medien/i)).toBeNull();
    expect(screen.queryByText(/Zusätzliche Förderstunden/i)).toBeNull();

    // Toggling "Auch Schul-/Systemmaßnahmen anzeigen" works without error
    const sysCheckbox = screen.getByLabelText(/Auch Schul-\/Systemmaßnahmen anzeigen/i) as HTMLInputElement;
    expect(sysCheckbox.checked).toBe(false);
    fireEvent.click(sysCheckbox);
    expect(sysCheckbox.checked).toBe(true);
  });
});
