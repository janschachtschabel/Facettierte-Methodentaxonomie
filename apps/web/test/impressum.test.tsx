import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ImpressumPage, buildMailto } from '../src/pages/ImpressumPage.js';
import { DatenschutzPage } from '../src/pages/DatenschutzPage.js';
import { NutzungsbedingungenPage } from '../src/pages/NutzungsbedingungenPage.js';
import { wloPreviewPath } from '../src/components/WloOerCards.js';

let llmConfigured = true;
vi.mock('../src/data/CatalogContext.js', () => ({
  useCatalog: () => ({ meta: { llmConfigured }, labelOf: (_f: string, id: string) => id, bundle: null })
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const withRouter = (el: React.ReactElement) => render(<MemoryRouter>{el}</MemoryRouter>);

describe('Impressum & Kontakt', () => {
  it('zeigt Name, Anschrift und die vom Server geladene E-Mail als Text ohne mailto-Link', async () => {
    const fetchMock = vi.fn(() => json({ teile: ['info', 'example.org'] }));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = withRouter(<ImpressumPage />);
    expect(screen.getByText(/Steubenstr\. 34/)).toBeTruthy();
    await waitFor(() => expect(container.textContent).toContain('info@example.org'));
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/kontakt/adresse');
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
  });

  it('zeigt bei nicht erreichbarem Server eine ausgeschriebene Adresse und sperrt das Formular', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const { container } = withRouter(<ImpressumPage />);
    await waitFor(() => expect(container.textContent).toContain('info (at) schachtschabel (Punkt) net'));
    expect((screen.getByRole('button', { name: 'Im E-Mail-Programm öffnen' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('baut die Nachricht als mailto-Link für das eigene E-Mail-Programm und sendet nichts an den Server', async () => {
    const fetchMock = vi.fn(() => json({ teile: ['info', 'example.org'] }));
    vi.stubGlobal('fetch', fetchMock);
    withRouter(<ImpressumPage />);
    await screen.findByText(/example\.org/);
    fireEvent.change(screen.getByLabelText('Nachricht'), { target: { value: 'Frage zum Gruppenpuzzle' } });
    fireEvent.click(screen.getByRole('button', { name: 'Im E-Mail-Programm öffnen' }));
    await screen.findByText(/E-Mail-Programm sollte sich jetzt/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(buildMailto('info@example.org', { name: 'Erika', betreff: 'Frage & Antwort', nachricht: 'Hallo\nWelt' })).toBe(
      'mailto:info@example.org?subject=' + encodeURIComponent('[FMT] Frage & Antwort') + '&body=' + encodeURIComponent('Hallo\nWelt\n\nErika')
    );
  });
});

describe('Datenschutz und Nutzungsbedingungen', () => {
  it('Datenschutzerklärung nennt Hosting, Logs ohne IP, OpenAI und Spracheingabe', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json({ teile: ['info', 'example.org'] })));
    llmConfigured = true;
    const { container } = withRouter(<DatenschutzPage />);
    const text = container.textContent || '';
    for (const part of ['Hostinger', 'nicht aber deine IP-Adresse', 'OpenAI', 'Spracherkennung', 'keine Cookies', 'Thüringer']) {
      expect(text).toContain(part);
    }
    await waitFor(() => expect(container.textContent).toContain('info@example.org'));
  });

  it('meldet, wenn keine Server-KI eingeschaltet ist', () => {
    vi.stubGlobal('fetch', vi.fn(() => json({ teile: ['info', 'example.org'] })));
    llmConfigured = false;
    const { container } = withRouter(<DatenschutzPage />);
    expect(container.textContent).toContain('keine Server-KI eingeschaltet');
  });

  it('Nutzungsbedingungen nennen Lizenzen und Haftung', () => {
    const { container } = withRouter(<NutzungsbedingungenPage />);
    expect(container.textContent).toContain('CC BY 4.0');
    expect(container.textContent).toContain('Haftung');
  });

  it('Vorschaubilder laufen nur von WLO über den eigenen Server', () => {
    expect(wloPreviewPath('https://redaktion.openeduhub.net/edu-sharing/preview?nodeId=1')).toBe(
      '/api/v1/oer/vorschau?u=' + encodeURIComponent('https://redaktion.openeduhub.net/edu-sharing/preview?nodeId=1')
    );
    expect(wloPreviewPath('https://example.org/bild.png')).toBeNull();
    expect(wloPreviewPath(null)).toBeNull();
  });
});
