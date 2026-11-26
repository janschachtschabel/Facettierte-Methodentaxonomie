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
  it('zeigt Name und Anschrift, die E-Mail erst auf Klick', async () => {
    const fetchMock = vi.fn(() => json({ teile: ['info', 'example.org'], formularAktiv: true }));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(<ImpressumPage />);
    expect(screen.getByText(/Steubenstr\. 34/)).toBeTruthy();
    expect(screen.getAllByText(/99423 Weimar/).length).toBeGreaterThan(0);
    expect(container.innerHTML).not.toContain('@');
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'E-Mail-Adresse anzeigen' }));
    const link = await screen.findByRole('link', { name: 'info@example.org' });
    expect(link.getAttribute('href')).toBe('mailto:info@example.org');
  });

  it('sendet das Formular mit Honeypot und Öffnungszeit und bestätigt den Versand', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => json({ gesendet: true }));
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
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/kontakt');
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ name: 'Erika', email: 'erika@example.org', einverstanden: true, website: '' });
    expect(typeof body.geoeffnetUm).toBe('number');
  });

  it('zeigt die Fehlermeldung des Servers', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json({ fehler: 'Bitte gib eine gültige E-Mail-Adresse an.' }, 400)));
    render(<ImpressumPage />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Erika' } });
    fireEvent.change(screen.getByLabelText('Nachricht'), { target: { value: 'Eine Frage zum Gruppenpuzzle.' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.submit(screen.getByRole('button', { name: 'Nachricht senden' }).closest('form')!);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('gültige E-Mail-Adresse'));
  });
});
