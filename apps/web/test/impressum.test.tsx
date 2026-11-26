import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { ImpressumPage } from '../src/pages/ImpressumPage.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

describe('Impressum & Kontakt', () => {
  it('zeigt Name, Anschrift und die vom Server geladene E-Mail als Text ohne mailto-Link', async () => {
    const fetchMock = vi.fn(() => json({ teile: ['info', 'example.org'], formularAktiv: true }));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(<ImpressumPage />);
    expect(screen.getByText(/Steubenstr\. 34/)).toBeTruthy();
    expect(screen.getAllByText(/99423 Weimar/).length).toBeGreaterThan(0);
    await waitFor(() => expect(container.textContent).toContain('info@example.org'));
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/kontakt/adresse');
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
  });

  it('zeigt bei nicht erreichbarem Server eine ausgeschriebene Adresse und meldet ein inaktives Formular sofort', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const { container } = render(<ImpressumPage />);
    await waitFor(() => expect(container.textContent).toContain('info (at) schachtschabel (Punkt) net'));
    cleanup();
    vi.stubGlobal('fetch', vi.fn(() => json({ teile: ['info', 'example.org'], formularAktiv: false })));
    render(<ImpressumPage />);
    await screen.findByText(/noch nicht eingerichtet/);
  });

  it('sendet das Formular mit Honeypot und Öffnungszeit und bestätigt den Versand', async () => {
    const fetchMock = vi.fn((url: string, _init?: RequestInit) =>
      url === '/api/v1/kontakt/adresse' ? json({ teile: ['info', 'example.org'], formularAktiv: true }) : json({ gesendet: true })
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<ImpressumPage />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Erika' } });
    fireEvent.change(screen.getByLabelText('E-Mail-Adresse für die Antwort'), { target: { value: 'erika@example.org' } });
    fireEvent.change(screen.getByLabelText('Nachricht'), { target: { value: 'Eine Frage zum Gruppenpuzzle.' } });
    const send = screen.getByRole('button', { name: 'Nachricht senden' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(send);
    await screen.findByText(/Danke für deine Nachricht/);
    const [url, init] = fetchMock.mock.calls.find(([u]) => u === '/api/v1/kontakt')!;
    expect(url).toBe('/api/v1/kontakt');
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ name: 'Erika', email: 'erika@example.org', einverstanden: true, website: '' });
    expect(typeof body.geoeffnetUm).toBe('number');
  });

  it('zeigt die Fehlermeldung des Servers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url === '/api/v1/kontakt/adresse'
          ? json({ teile: ['info', 'example.org'], formularAktiv: true })
          : json({ fehler: 'Bitte gib eine gültige E-Mail-Adresse an.' }, 400)
      )
    );
    render(<ImpressumPage />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Erika' } });
    fireEvent.change(screen.getByLabelText('Nachricht'), { target: { value: 'Eine Frage zum Gruppenpuzzle.' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.submit(screen.getByRole('button', { name: 'Nachricht senden' }).closest('form')!);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('gültige E-Mail-Adresse'));
  });
});
