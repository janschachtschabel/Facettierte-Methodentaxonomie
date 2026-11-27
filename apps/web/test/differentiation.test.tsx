import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CatalogBundle } from '@fmt/core';
import { DifferentiationPage } from '../src/pages/DifferentiationPage.js';
import { DifferentiationMatrixPanel } from '../src/components/DifferentiationMatrixPanel.js';
import { ACTIVE_PLANNER_DRAFT_KEY, DIFF_HANDOFF_KEY } from '../src/planner/scenarioStorage.js';
import { buildScenarioRows, STANDARD_LEARNER_GROUPS, type LearnerGroup } from '../src/planner/scenarioModel.js';
import { createChainPreset } from './kettenVorlage.js';
import { useState } from 'react';

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
  window.sessionStorage.clear();
});

describe('DifferentiationPage (/differenzierung)', () => {
  it('opens focused on UDL tab, switches cleanly across tabs, supports clickable group chips and system-measures filter', () => {
    render(
      <MemoryRouter initialEntries={['/differenzierung']}>
        <DifferentiationPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/Binnendifferenzierung & Szenario-Anpassung/i)).toBeTruthy();
    // Focused default tab shows 1. Basis für alle (UDL) without overwhelming with all 4 sections at once
    expect(screen.getByText(/1\. Gemeinsame Basis für alle \(UDL/i)).toBeTruthy();
    expect(screen.queryByText(/2\. Zielkonflikte zwischen Teilgruppen/i)).toBeNull();
    expect(screen.getByText(/heuristischen Expertenmodell/i)).toBeTruthy();

    // Default preset is analog (t-keine + ohneInternet) and excludes system measures
    expect(screen.queryByText(/Interaktive digitale Medien/i)).toBeNull();
    expect(screen.queryByText(/Zusätzliche Förderstunden/i)).toBeNull();

    // Clicking a group chip ("LRS / Lesen & Schreiben") toggles cleanly
    const lrsChip = screen.getByRole('button', { name: /LRS \/ Lesen & Schreiben/i });
    expect(lrsChip.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(lrsChip);
    expect(lrsChip.getAttribute('aria-pressed')).toBe('true');

    // Switching tabs shows Zielkonflikte & Phasen cleanly
    fireEvent.click(screen.getByRole('tab', { name: /2\. Zielkonflikte/i }));
    expect(screen.getByText(/2\. Zielkonflikte zwischen Teilgruppen/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /4\. Nach Phase/i }));
    expect(screen.getByText(/4\. Phasen-Anpassungen/i)).toBeTruthy();

    // Gesamtansicht displays all sections together
    fireEvent.click(screen.getByRole('tab', { name: /Gesamtansicht/i }));
    expect(screen.getByText(/1\. Gemeinsame Basis für alle \(UDL/i)).toBeTruthy();
    expect(screen.getByText(/2\. Zielkonflikte zwischen Teilgruppen/i)).toBeTruthy();

    // Toggling "Auch Schul-/Systemmaßnahmen anzeigen" inside filter drawer works
    const sysCheckbox = screen.getByLabelText(/Auch Schul-\/Systemmaßnahmen anzeigen/i) as HTMLInputElement;
    expect(sysCheckbox.checked).toBe(false);
    fireEvent.click(sysCheckbox);
    expect(sysCheckbox.checked).toBe(true);
  });

  it('auto-loads the active Baukasten draft when opened via ?source=planner', () => {
    window.sessionStorage.setItem(
      ACTIVE_PLANNER_DRAFT_KEY,
      JSON.stringify({
        updatedAt: new Date().toISOString(),
        title: 'Physik · Dichte von Stoffen',
        fach: 'Physik',
        thema: 'Dichte von Stoffen',
        scenarioText: 'Physik Klasse 7 Dichte',
        bildungsstufe: 'sek1',
        zeitMin: 90,
        maxTechnik: 't-keine',
        ohneInternet: true,
        ohneKI: false,
        arrangement: {
          typ: 'Arrangement',
          name: 'Dichte-Reihe',
          kontext: { bildungsstufe: 'sek1', zeitbudgetMin: 90 },
          struktur: {
            typ: 'Sequenz',
            teile: [
              { typ: 'Einsatz', baustein: 'ampelspiel', dauerMin: 10 },
              { typ: 'Einsatz', baustein: 'partnerarbeit', dauerMin: 20 }
            ]
          }
        },
        groups: [
          { id: 'basis', label: 'Basis & Sprachsensibel', profile: '', focus: 'basis', active: true, count: 6, personaId: 'languageAndCulture' },
          { id: 'vertiefung', label: 'Vertiefung', profile: '', focus: 'vertiefung', active: true, count: 5, personaId: 'highPerforming' }
        ]
      })
    );

    render(
      <MemoryRouter initialEntries={['/differenzierung?source=planner']}>
        <DifferentiationPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/Aktuelles Baukasten-Szenario/i)).toBeTruthy();
    expect(screen.getByText(/Physik · Dichte von Stoffen/i)).toBeTruthy();
    expect(screen.getByText(/In Baukasten übernehmen \(Schritt 3\)/i)).toBeTruthy();
  });

  it('DifferentiationMatrixPanel in Baukasten Step 3 starts with the Regelgruppe and unlocks UDL/conflicts on chip click', () => {
    function Harness() {
      const [groups, setGroups] = useState<LearnerGroup[]>(STANDARD_LEARNER_GROUPS);
      return (
        <MemoryRouter>
          <DifferentiationMatrixPanel
            groups={groups}
            onGroupsChange={setGroups}
            scenarioRows={[]}
            allBlocks={BUNDLE.bausteine}
            subgroupMethods={{}}
            onSubgroupMethodChange={() => {}}
            aiDiffByStep={{}}
            onAiDiffChange={() => {}}
            onEditDiffMeasure={() => {}}
            onRunAiDifferentiate={() => {}}
            busyDiff={false}
            diffError={null}
            llmAvailable={false}
          />
        </MemoryRouter>
      );
    }

    render(<Harness />);
    expect(screen.getAllByText(/Regelgruppe \(ganze Klasse\)/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/bisher nur die Regelgruppe/i)).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /1\. Basis für alle/i })).toBeNull();

    // Clicking a subgroup chip immediately activates differentiation tabs & visible active-selection bar with balanced headcount
    fireEvent.click(screen.getByRole('button', { name: /DaZ \/ Sprachförderung/i }));
    expect(screen.getByRole('region', { name: /Aktive Teilgruppen im Konzept/i })).toBeTruthy();
    expect(screen.getByText(/Regelgruppe und 1 Teilgruppe · 26 Lernende/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Teilgruppe DaZ & Sprachsensibel entfernen/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /1\. Basis für alle/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /2\. Zielkonflikte/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Alle Teilgruppen entfernen/i })).toBeTruthy();

    // Removing the subgroup via its clear × button restores the single Regelgruppe cleanly
    fireEvent.click(screen.getByRole('button', { name: /Teilgruppe DaZ & Sprachsensibel entfernen/i }));
    expect(screen.queryByRole('tab', { name: /1\. Basis für alle/i })).toBeNull();
    expect(screen.getByText(/bisher nur die Regelgruppe · 26 Lernende/i)).toBeTruthy();
  });
});

describe('Phasen & Alternativ-Methoden bieten keine Hilfe an (Task C4)', () => {
  it('die Auswahl „Alternative FMT-Methode“ enthält keine Hilfe', () => {
    const labelOf = (schemeId: string, code: string) => {
      const sc = BUNDLE.schemes.find((x) => x.id === schemeId);
      return (sc?.werte || (sc?.gruppen || []).flatMap((g) => g.werte) || []).find((w) => w.id === code)?.label || code;
    };
    const blocks = new Map(BUNDLE.bausteine.map((b) => [b.kennung, b]));
    const rows = buildScenarioRows(createChainPreset('konzeptaufbau', BUNDLE), BUNDLE, blocks, labelOf, STANDARD_LEARNER_GROUPS, {}, {}, '', {});
    const optionen = (allBlocks: CatalogBundle['bausteine']) => {
      function Harness() {
        const [groups, setGroups] = useState<LearnerGroup[]>(STANDARD_LEARNER_GROUPS);
        return (
          <MemoryRouter>
            <DifferentiationMatrixPanel
              groups={groups}
              onGroupsChange={setGroups}
              scenarioRows={rows}
              allBlocks={allBlocks}
              subgroupMethods={{}}
              onSubgroupMethodChange={() => {}}
              aiDiffByStep={{}}
              onAiDiffChange={() => {}}
              onEditDiffMeasure={() => {}}
              onRunAiDifferentiate={() => {}}
              busyDiff={false}
              diffError={null}
              llmAvailable={false}
            />
          </MemoryRouter>
        );
      }
      const { container, unmount } = render(<Harness />);
      fireEvent.click(screen.getByRole('button', { name: /DaZ \/ Sprachförderung/i }));
      fireEvent.click(screen.getByRole('tab', { name: /4\. Phasen/i }));
      const werte = new Set([...container.querySelectorAll('optgroup option')].map((o) => (o as HTMLOptionElement).value).filter(Boolean));
      unmount();
      return werte;
    };
    const vorher = optionen(BUNDLE.bausteine);
    expect(vorher.size).toBeGreaterThan(0);
    const nachher = optionen(BUNDLE.bausteine.map((b) => (vorher.has(b.kennung) ? { ...b, eintragsart: 'hilfe' as const } : b)));
    expect([...nachher].filter((k) => vorher.has(k))).toEqual([]);
  });
});


describe('Merkmale ohne gesperrte Kategorien (Task C6)', () => {
  it('die Auswahl der Merkmale zeigt „Sensorische Präferenzen“ nicht', () => {
    function Harness() {
      const [groups, setGroups] = useState<LearnerGroup[]>(STANDARD_LEARNER_GROUPS);
      return (
        <MemoryRouter>
          <DifferentiationMatrixPanel
            groups={groups}
            onGroupsChange={setGroups}
            scenarioRows={[]}
            allBlocks={BUNDLE.bausteine}
            subgroupMethods={{}}
            onSubgroupMethodChange={() => {}}
            aiDiffByStep={{}}
            onAiDiffChange={() => {}}
            onEditDiffMeasure={() => {}}
            onRunAiDifferentiate={() => {}}
            busyDiff={false}
            diffError={null}
            llmAvailable={false}
          />
        </MemoryRouter>
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /DaZ \/ Sprachförderung/i }));
    fireEvent.click(screen.getByRole('tab', { name: /3\. Teilgruppen/i }));
    fireEvent.click(screen.getByRole('button', { name: /Alle \d+ Variablen/ }));
    expect(screen.getAllByText('Vorwissen').length).toBeGreaterThan(0);
    expect(screen.queryByText('Sensorische Präferenzen')).toBeNull();
  });
});

describe('Differenzierung reicht die Angaben der Teilgruppe weiter (Task C6)', () => {
  it('„kann noch nicht lesen“ und „kann sich nicht frei bewegen“ gehen zurück in den Baukasten', () => {
    window.sessionStorage.setItem(
      ACTIVE_PLANNER_DRAFT_KEY,
      JSON.stringify({
        updatedAt: new Date().toISOString(),
        title: 'Physik · Dichte',
        fach: 'Physik',
        thema: 'Dichte',
        scenarioText: 'Physik Klasse 7 Dichte',
        maxTechnik: '',
        ohneInternet: false,
        ohneKI: false,
        arrangement: {
          typ: 'Arrangement',
          name: 'Dichte',
          kontext: { bildungsstufe: 'sek1', zeitbudgetMin: 45 },
          ablauf: { typ: 'Sequenz', teile: [{ typ: 'Einsatz', baustein: 'partnerarbeit', dauerMin: 20 }] }
        },
        groups: [
          { id: 'regel', label: 'Regelgruppe', profile: '', focus: 'regel', active: true },
          { id: 'x', label: 'Gruppe X', profile: '', focus: 'custom', active: true, ohneSchrift: ['lesen'], ohneBewegung: true }
        ]
      })
    );
    render(
      <MemoryRouter initialEntries={['/differenzierung?source=planner']}>
        <DifferentiationPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /In Baukasten übernehmen \(Schritt 3\)/i }));
    const h = JSON.parse(window.sessionStorage.getItem(DIFF_HANDOFF_KEY) || '{}');
    const x = h.groups.find((g: { id: string }) => g.id === 'x');
    expect(x.ohneSchrift).toEqual(['lesen']);
    expect(x.ohneBewegung).toBe(true);
  });
});
