import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApiMcpPage } from '../src/pages/ApiMcpPage.js';

// The page needs only the catalogue counts and the meta answer; without a bundle it shows its fallback texts.
vi.mock('../src/data/CatalogContext.js', () => ({ useCatalog: () => ({ bundle: null, meta: null, setLlmSettingsOpen: () => {} }) }));

afterEach(cleanup);

describe('API-Seite: neue Wege nach außen (Task A4, Lücken R08, R19)', () => {
  const zeile = (pfad: string) => {
    render(
      <MemoryRouter>
        <ApiMcpPage />
      </MemoryRouter>
    );
    const code = [...document.querySelectorAll('td > code')].find((c) => c.textContent?.startsWith(pfad));
    return code!.closest('tr')!.textContent || '';
  };

  it('die Zeile zu /methods nennt zieltyp und kettenschritt', () => {
    const z = zeile('GET /api/v1/methods?');
    expect(z).toContain('zieltyp');
    expect(z).toContain('kettenschritt');
  });

  it('die Zeile zu /validate nennt situation und regelmeldungen', () => {
    const z = zeile('POST /api/v1/validate');
    expect(z).toContain('situation');
    expect(z).toContain('regelmeldungen');
    // R02: the messages of the situation come along (safety note, accompanying goal without dates).
    expect(z).toContain('Sicherheitshinweis');
    expect(z).toContain('Begleitziel');
  });

  it('die MCP-Liste nennt zieltyp bei search_methods und situation bei validate_arrangement', () => {
    render(
      <MemoryRouter>
        <ApiMcpPage />
      </MemoryRouter>
    );
    const li = (name: string) => [...document.querySelectorAll('li')].find((l) => l.querySelector('code')?.textContent === name)!.textContent || '';
    expect(li('search_methods')).toContain('zieltyp');
    expect(li('validate_arrangement')).toContain('situation');
  });
});
