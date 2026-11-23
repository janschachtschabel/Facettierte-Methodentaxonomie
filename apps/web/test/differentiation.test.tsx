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
  it('renders clear 3-step guide, interactive group chips, view tabs, UDL/conflicts/phases, and analog/system filters', () => {
    render(
      <MemoryRouter initialEntries={['/differenzierung']}>
        <DifferentiationPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/Binnendifferenzierung & Szenario-Anpassung/i)).toBeTruthy();
    expect(screen.getByText(/Unterricht beschreiben/i)).toBeTruthy();
    expect(screen.getByText(/Lerngruppe markieren/i)).toBeTruthy();
    expect(screen.getByText(/1\. Gemeinsame Basis für alle \(UDL/i)).toBeTruthy();
    expect(screen.getByText(/2\. Zielkonflikte zwischen Teilgruppen/i)).toBeTruthy();
    expect(screen.getByText(/4\. Phasen-Anpassungen/i)).toBeTruthy();
    expect(screen.getByText(/heuristischen Expertenmodell/i)).toBeTruthy();

    // Default preset is analog (t-keine + ohneInternet) and excludes system measures
    expect(screen.queryByText(/Interaktive digitale Medien/i)).toBeNull();
    expect(screen.queryByText(/Zusätzliche Förderstunden/i)).toBeNull();

    // Clicking a group chip ("LRS / Lesen & Schreiben") adds it directly to the learner group input
    const lrsChip = screen.getByRole('button', { name: /LRS \/ Lesen & Schreiben/i });
    expect(lrsChip.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(lrsChip);
    expect(lrsChip.getAttribute('aria-pressed')).toBe('true');

    // Switching result tab to "2. Zielkonflikte" focuses cleanly on conflicts only
    const conflictTab = screen.getByRole('tab', { name: /2\. Zielkonflikte/i });
    fireEvent.click(conflictTab);
    expect(screen.queryByText(/1\. Gemeinsame Basis für alle \(UDL/i)).toBeNull();
    expect(screen.getByText(/2\. Zielkonflikte zwischen Teilgruppen/i)).toBeTruthy();

    // Switching back to "Gesamtplan" restores all sections
    fireEvent.click(screen.getByRole('tab', { name: /Gesamtplan/i }));
    expect(screen.getByText(/1\. Gemeinsame Basis für alle \(UDL/i)).toBeTruthy();

    // Toggling "Auch Schul-/Systemmaßnahmen anzeigen" works without error
    const sysCheckbox = screen.getByLabelText(/Auch Schul-\/Systemmaßnahmen anzeigen/i) as HTMLInputElement;
    expect(sysCheckbox.checked).toBe(false);
    fireEvent.click(sysCheckbox);
    expect(sysCheckbox.checked).toBe(true);
  });
});
