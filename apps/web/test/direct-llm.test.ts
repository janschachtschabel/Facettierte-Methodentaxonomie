import { describe, it, expect, vi, afterEach } from 'vitest';
import { runDirectTranslate } from '../src/lib/directLlm.js';
import type { ByokSettings } from '../src/data/CatalogContext.js';

afterEach(() => vi.unstubAllGlobals());

describe('runDirectTranslate (KI direkt aus dem Browser)', () => {
  it('sends the request text along to /api/v1/match, so named methods still count (Runde 5, P1)', async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: { body?: string }) => {
        const json = (x: unknown) => ({ ok: true, status: 200, json: async () => x });
        if (url === '/api/v1/assistant/briefing') {
          return json({ llmBriefing: { systemPrompt: 's', userPrompt: 'u' }, vorfilterung: { kriterien: { zeitMin: 90 } } });
        }
        if (url === '/api/v1/match') {
          bodies.push(JSON.parse(init?.body || '{}'));
          return json({ modus: 'ablauf' });
        }
        return json({ choices: [{ message: { content: JSON.stringify({ modus: 'ablauf', zieltyp: 'kooperatives-lernen' }) } }] });
      })
    );
    const byok = { enabled: true, directBrowser: true, provider: 'openai', apiKey: 'k', model: 'm', baseUrl: 'https://api.openai.com/v1' } as unknown as ByokSettings;
    const text = 'Geschichte Klasse 9 mit einem Gruppenpuzzle, 90 Minuten';
    await runDirectTranslate(byok, text);
    expect(bodies[0].text).toBe(text);
    expect(bodies[0].zieltyp).toBe('kooperatives-lernen');
  });

  it('structured fields go to the briefing and win over the model in /api/v1/match (App-Nachzug N3)', async () => {
    const bodies: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: { body?: string }) => {
        const json = (x: unknown) => ({ ok: true, status: 200, json: async () => x });
        if (url.startsWith('/api/')) bodies.push({ url, body: JSON.parse(init?.body || '{}') });
        if (url === '/api/v1/assistant/briefing') return json({ llmBriefing: { systemPrompt: 's', userPrompt: 'u' } });
        if (url === '/api/v1/match') return json({ modus: 'ablauf' });
        return json({ choices: [{ message: { content: JSON.stringify({ zielart: 'verstehen', bildungsstufe: 'sek2' }) } }] });
      })
    );
    const byok = { enabled: true, directBrowser: true, provider: 'openai', apiKey: 'k', model: 'm', baseUrl: 'https://api.openai.com/v1' } as unknown as ByokSettings;
    await runDirectTranslate(byok, 'etwas über Pflanzen', { bildungsstufe: 'primar', zeitMin: 45 });
    expect(bodies[0].body).toEqual({ task: 'translate', payload: { bildungsstufe: 'primar', zeitMin: 45, text: 'etwas über Pflanzen' } });
    expect(bodies[1].body).toEqual({ zielart: 'verstehen', bildungsstufe: 'primar', zeitMin: 45, text: 'etwas über Pflanzen' });
  });
});
