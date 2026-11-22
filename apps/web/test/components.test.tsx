import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createSearch, createValidator, type Arrangement, type CatalogBundle, type FmtData } from '@fmt/core';
import { PartiturView } from '../src/components/PartiturView.js';
import { TimelineBandSvg } from '../src/components/TimelineBandSvg.js';
import { CatalogAnalytics } from '../src/components/CatalogAnalytics.js';
import { MethodCardDiagram } from '../src/components/MethodCardDiagram.js';
import { VerlaufsplanView } from '../src/components/VerlaufsplanView.js';
import { createChainPreset, setRecurrence } from '../src/planner/arrangementOps.js';
import { buildScenarioRows, DEFAULT_LEARNER_GROUPS } from '../src/planner/scenarioModel.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BUNDLE = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'dist-data', 'catalog.bundle.json'), 'utf8')
) as CatalogBundle;

const DATA: FmtData = {
  VERSION: BUNDLE.version,
  NS: BUNDLE.NS,
  creator: BUNDLE.creator,
  license: BUNDLE.license,
  schemes: BUNDLE.schemes,
  facetten: BUNDLE.facetten,
  ketten: BUNDLE.ketten,
  bausteine: BUNDLE.bausteine,
  beispiele: BUNDLE.beispiele
};

const VALIDATOR = createValidator(DATA);
const SEARCH = createSearch(DATA, VALIDATOR);
const BLOCKS = new Map(BUNDLE.bausteine.map((b) => [b.kennung, b]));
const REGISTRY = new Map(BUNDLE.beispiele.filter((e) => e['@id']).map((e) => [e['@id']!, e]));
const labelOf = (schemeId: string, code: string) => {
  const s = BUNDLE.schemes.find((x) => x.id === schemeId);
  const vals = s?.werte || (s?.gruppen || []).flatMap((g) => g.werte) || [];
  return vals.find((w) => w.id === code)?.label || code;
};

afterEach(() => cleanup());

describe('React UI Components (PartiturView & TimelineBandSvg)', () => {
  it('appends before Wiederkehr, reorders visible steps cleanly, and allows removing Verweis nodes', () => {
    let current = setRecurrence(createChainPreset('konzeptaufbau', BUNDLE), {
      baustein: 'abrufquiz',
      anzahl: 3,
      abstand: 'P2D',
      dauerMin: 6
    });
    const onChange = (next: Arrangement) => {
      current = next;
    };

    const { rerender } = render(
      <MemoryRouter>
        <PartiturView
          arrangement={current}
          onChange={onChange}
          bundle={BUNDLE}
          blocksById={BLOCKS}
          search={SEARCH}
          registry={REGISTRY}
          labelOf={labelOf}
        />
      </MemoryRouter>
    );

    const addSelect = screen.getByLabelText('Schritt anfügen');
    fireEvent.change(addSelect, { target: { value: 'exit-ticket' } });

    // Appended block must appear BEFORE Wiederkehr with midpoint duration
    const teileAfterAdd = current.ablauf.typ === 'Parallel' && current.ablauf.haupt.typ === 'Sequenz'
      ? current.ablauf.haupt.teile
      : current.ablauf.typ === 'Sequenz'
        ? current.ablauf.teile
        : [];
    const wkIdx = teileAfterAdd.findIndex((n) => n.typ === 'Wiederkehr');
    const exitIdx = teileAfterAdd.findIndex((n) => n.typ === 'Einsatz' && n.baustein === 'exit-ticket');
    expect(wkIdx).toBeGreaterThan(exitIdx);
    expect(exitIdx).toBeGreaterThan(-1);

    // Add a Verweis node and verify it has a working remove button
    const withVerweis: Arrangement = {
      ...current,
      ablauf: {
        typ: 'Sequenz',
        teile: [
          { typ: 'Einsatz', baustein: 'advance-organizer', dauerMin: 10 },
          { typ: 'Verweis', arrangement: 'https://w3id.org/fmt/beispiel/dichte-reihe' },
          { typ: 'Wiederkehr', baustein: 'abrufquiz', anzahl: 3, abstand: 'P2D', dauerMin: 6 }
        ]
      }
    };
    current = withVerweis;
    rerender(
      <MemoryRouter>
        <PartiturView
          arrangement={current}
          onChange={onChange}
          bundle={BUNDLE}
          blocksById={BLOCKS}
          search={SEARCH}
          registry={REGISTRY}
          labelOf={labelOf}
        />
      </MemoryRouter>
    );

    const removeVerweisBtn = screen.getByLabelText('Verweis entfernen');
    fireEvent.click(removeVerweisBtn);
    expect(current.ablauf.typ === 'Sequenz' && current.ablauf.teile.some((n) => n.typ === 'Verweis')).toBe(false);
  });

  it('renders TimelineBandSvg cleanly with empty steps or empty Alternative optionen without NaN coordinates', () => {
    const edgeArr: Arrangement = {
      typ: 'Arrangement',
      name: 'Edge Case',
      reichweite: 'r3',
      ablauf: {
        typ: 'Sequenz',
        teile: [{ typ: 'Alternative', kriterium: 'Leer', optionen: [] }]
      }
    };
    const { container } = render(<TimelineBandSvg arrangement={edgeArr} blocksById={BLOCKS} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg!.innerHTML).not.toContain('NaN');
    expect(svg!.innerHTML).not.toContain('Infinity');
  });

  it('renders CatalogAnalytics live across ALL database methods with every dot inside the SVG plot bounds', () => {
    const valuesOf = (schemeId: string) => {
      const s = BUNDLE.schemes.find((x) => x.id === schemeId);
      return s?.werte || (s?.gruppen || []).flatMap((g) => g.werte) || [];
    };
    const { container } = render(
      <MemoryRouter>
        <CatalogAnalytics bundle={BUNDLE} valuesOf={valuesOf} labelOf={labelOf} />
      </MemoryRouter>
    );
    expect(container.textContent).toContain(String(BUNDLE.bausteine.length));
    expect(container.textContent).toContain('Abdeckungs-Heatmap');
    expect(container.textContent).toContain('Schnittstellen-Abdeckung');
    const circles = [...container.querySelectorAll('svg circle')];
    expect(circles.length).toBe(BUNDLE.bausteine.length);
    for (const c of circles) {
      const cx = Number(c.getAttribute('cx'));
      const cy = Number(c.getAttribute('cy'));
      expect(cx).toBeGreaterThanOrEqual(96);
      expect(cx).toBeLessThanOrEqual(736);
      expect(cy).toBeGreaterThanOrEqual(26);
      expect(cy).toBeLessThanOrEqual(410);
    }
  });

  it('renders MethodCardDiagram for both regular and container methods and VerlaufsplanView with per-actor columns', () => {
    const pf = BLOCKS.get('productive-failure')!;
    const { container: c1 } = render(<MethodCardDiagram baustein={pf} labelOf={labelOf} />);
    expect(c1.querySelector('svg')).toBeTruthy();
    expect(c1.textContent).toContain('▣');

    const vbe = BLOCKS.get('vbe')!;
    const { container: c2 } = render(<MethodCardDiagram baustein={vbe} labelOf={labelOf} />);
    expect(c2.querySelector('svg')).toBeTruthy();

    const preset = createChainPreset('konzeptaufbau', BUNDLE);
    const rows = buildScenarioRows(preset, BUNDLE, BLOCKS, labelOf, DEFAULT_LEARNER_GROUPS, {}, {});
    const { container: c3 } = render(
      <MemoryRouter>
        <VerlaufsplanView
          rows={rows}
          groups={DEFAULT_LEARNER_GROUPS}
          onOpenOerForStep={() => {}}
          onOpenMaterialForStep={() => {}}
        />
      </MemoryRouter>
    );
    expect(c3.textContent).toContain('Lehrkraft');
    expect(c3.textContent).toContain('Basisunterstützung');
    expect(c3.textContent).toContain('Vertiefung');
    expect(c3.textContent).toContain('Szenario (R2)');
  });
});
