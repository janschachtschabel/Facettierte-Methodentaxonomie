import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { WloOerCards } from '../src/components/WloOerCards.js';

vi.mock('../src/data/CatalogContext.js', () => ({
  useCatalog: () => ({
    labelOf: (_f: string, id: string) => (id === 'sprachen' ? 'Sprachen' : id),
    bundle: {
      faecher: {
        schulfaecher: [
          { id: '120', uri: 'http://w3id.org/openeduhub/vocabs/discipline/120', label: 'Deutsch', fachbereich: 'sprachen' },
          { id: '20001', uri: 'http://w3id.org/openeduhub/vocabs/discipline/20001', label: 'Englisch', fachbereich: 'sprachen' }
        ],
        hochschulfaecher: []
      }
    }
  })
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const props = {
  scenarioRows: [],
  initialStepKey: 'step-0',
  fach: '',
  thema: 'Wegbeschreibung',
  bildungsstufe: 'sek1',
  oerByStep: {},
  onOerByStepChange: () => {}
};

describe('WLO-Suche mit Fachbereich', () => {
  it('schickt den Fachbereich mit und sagt in Klartext, wonach gefiltert wurde', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: string }) => {
        bodies.push(JSON.parse(init.body));
        return {
          ok: true,
          json: async () => ({
            ergebnisse: [],
            fachfilter: {
              art: 'fachbereich',
              fachbereich: 'sprachen',
              faecher: ['http://w3id.org/openeduhub/vocabs/discipline/120', 'http://w3id.org/openeduhub/vocabs/discipline/20001']
            }
          })
        };
      })
    );
    render(<WloOerCards {...props} fachbereich="sprachen" />);
    await waitFor(() => expect(bodies.length).toBeGreaterThan(0));
    expect(bodies[0].fachbereich).toBe('sprachen');
    const note = await screen.findByText(/Gefiltert nach dem Fachbereich/);
    expect(note.textContent).toContain('Sprachen');
    expect(note.textContent).toContain('Deutsch');
    expect(note.textContent).toContain('Englisch');
  });

  it('zeigt ohne Fachfilter keinen Filterhinweis', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ergebnisse: [] }) }));
    vi.stubGlobal('fetch', fetchMock);
    render(<WloOerCards {...props} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByText(/Gefiltert nach/)).toBeNull();
  });
});
