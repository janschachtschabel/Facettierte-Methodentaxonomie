import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIST_DATA = path.join(ROOT, 'dist-data');

describe('FMT Hybrid LLM Assistant (OpenAI-compatible, Cache, Fallback, BYOK SSRF Guard)', () => {
  let mockServer: http.Server;
  let mockBaseUrl = '';
  let mockCalls = 0;
  let mockBehavior: 'valid' | 'bad-json' | 'hallucinated-enum' | 'error' = 'valid';
  let appWithKey: FastifyInstance;
  let appNoKey: FastifyInstance;

  beforeAll(async () => {
    mockServer = http.createServer((req, res) => {
      mockCalls++;
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        if (mockBehavior === 'error') {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'upstream fail' }));
          return;
        }
        const parsed = JSON.parse(body || '{}');
        const userText = String(parsed.messages?.[1]?.content || '');
        let content = '';
        if (userText.includes('AUSGESTALTUNG') || parsed.messages?.[0]?.content?.includes('ausgestalten')) {
          content = '## Konkrete Ausgestaltung\nNutzen Sie die Bausteine genau wie geprüft.';
        } else if (mockBehavior === 'bad-json') {
          content = 'Das ist kein JSON!';
        } else if (mockBehavior === 'hallucinated-enum') {
          content = JSON.stringify({ bildungsstufe: 'hogwarts', lernfunktion: ['zaubern'], zeitMin: 45 });
        } else {
          content = JSON.stringify({
            modus: 'phase',
            lernfunktion: ['orientierung'],
            bildungsstufe: 'sek1',
            zeitMin: 15,
            gruppe: 26,
            maxTechnik: 't-keine'
          });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content } }] }));
      });
    });

    await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
    const addr = mockServer.address() as { port: number };
    mockBaseUrl = `http://127.0.0.1:${addr.port}/v1`;

    appWithKey = await buildApp({
      distDataDir: DIST_DATA,
      config: {
        port: 0,
        host: '127.0.0.1',
        corsOrigin: '*',
        llmBaseUrl: mockBaseUrl,
        llmModel: 'mock-mini',
        llmApiKey: 'sk-server-secret',
        llmAllowByok: true,
        llmRateLimitPerMin: 100,
        llmTimeoutMs: 5000,
        llmCacheMax: 100,
        llmCacheTtlMs: 60000
      }
    });
    await appWithKey.ready();

    appNoKey = await buildApp({
      distDataDir: DIST_DATA,
      config: {
        port: 0,
        host: '127.0.0.1',
        corsOrigin: '*',
        llmBaseUrl: mockBaseUrl,
        llmModel: 'mock-mini',
        llmApiKey: '',
        llmAllowByok: true,
        llmRateLimitPerMin: 100,
        llmTimeoutMs: 5000,
        llmCacheMax: 100,
        llmCacheTtlMs: 60000
      }
    });
    await appNoKey.ready();
  });

  afterAll(async () => {
    await appWithKey.close();
    await appNoKey.close();
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  });

  it('translates free text with LLM and caches identical requests', async () => {
    mockBehavior = 'valid';
    mockCalls = 0;

    const r1 = await appWithKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/translate',
      payload: { text: 'Ich brauche einen aktivierenden Einstieg zum Thema Fotosynthese, 7. Klasse, 15 Minuten' }
    });
    expect(r1.statusCode).toBe(200);
    const j1 = r1.json();
    expect(j1.quelle).toBe('llm');
    expect(j1.gecacht).toBe(false);
    expect(j1.anfrage.bildungsstufe).toBe('sek1');
    expect(j1.ergebnis.modus).toBe('phase');
    expect(mockCalls).toBe(1);

    const r2 = await appWithKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/translate',
      payload: { text: 'Ich brauche einen aktivierenden Einstieg zum Thema Fotosynthese, 7. Klasse, 15 Minuten' }
    });
    expect(r2.statusCode).toBe(200);
    expect(r2.json().gecacht).toBe(true);
    expect(mockCalls).toBe(1);
  });

  it('falls back cleanly to deterministic lesen() on bad JSON, hallucinated enums, or upstream error (Review Focus #2)', async () => {
    mockBehavior = 'bad-json';
    const rBad = await appWithKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/translate',
      payload: { text: 'Sicherung Klasse 8, 10 Minuten, ohne Geräte' }
    });
    expect(rBad.statusCode).toBe(200);
    expect(rBad.json().quelle).toBe('regeln-fallback');
    expect(rBad.json().ergebnis.kriterien.zeitMin).toBe(10);

    mockBehavior = 'hallucinated-enum';
    const rHallu = await appWithKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/translate',
      payload: { text: 'Diagnose Grundschule, 5 Minuten' }
    });
    expect(rHallu.statusCode).toBe(200);
    expect(rHallu.json().quelle).toBe('regeln-fallback');

    mockBehavior = 'error';
    const rErr = await appWithKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/translate',
      payload: { text: 'Einstieg 15 Minuten' }
    });
    expect(rErr.statusCode).toBe(200);
    expect(rErr.json().quelle).toBe('regeln-fallback');
  });

  it('works in zero-key mode (translate via fallback, elaborate returns 503 with clear German message)', async () => {
    const t = await appNoKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/translate',
      payload: { text: 'Sicherung Klasse 7, 10 Minuten' }
    });
    expect(t.statusCode).toBe(200);
    expect(t.json().quelle).toBe('regeln-fallback');

    const dichte = (await appNoKey.inject({ method: 'GET', url: '/beispiele/dichte-reihe.jsonld' })).json();
    const e = await appNoKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/elaborate',
      payload: { arrangement: dichte, thema: 'Dichte', fach: 'Physik' }
    });
    expect(e.statusCode).toBe(503);
    expect(e.json().fehler).toMatch(/LLM|API-Key/i);
  });

  it('elaborates a validated arrangement and includes all 4 FMT guardrails', async () => {
    mockBehavior = 'valid';
    const dichte = (await appWithKey.inject({ method: 'GET', url: '/beispiele/dichte-reihe.jsonld' })).json();
    const res = await appWithKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/elaborate',
      payload: { arrangement: dichte, thema: 'Dichte von Stoffen', fach: 'Physik' }
    });
    expect(res.statusCode).toBe(200);
    const j = res.json();
    expect(j.pruefung.gueltig).toBe(true);
    expect(j.ausarbeitung).toContain('Ausgestaltung');
    expect(j.leitplanken.length).toBe(4);
  });

  it('rejects arbitrary BYOK baseUrl to prevent SSRF and never leaks or caches BYOK keys (Review Focus #3)', async () => {
    mockBehavior = 'valid';
    const ssrf = await appNoKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/translate',
      headers: {
        'x-llm-api-key': 'sk-user-secret-999',
        'x-llm-provider': 'http://169.254.169.254/latest/meta-data'
      },
      payload: { text: 'Einstieg 10 Minuten' }
    });
    expect(ssrf.statusCode).toBe(400);
    expect(ssrf.body).not.toContain('sk-user-secret-999');

    const ssrfBaseUrlHeader = await appNoKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/translate',
      headers: {
        'x-llm-api-key': 'sk-user-secret-999',
        'x-llm-base-url': 'http://169.254.169.254/v1'
      },
      payload: { text: 'Einstieg 10 Minuten' }
    });
    expect(ssrfBaseUrlHeader.statusCode).toBe(400);
    expect(ssrfBaseUrlHeader.body).not.toContain('sk-user-secret-999');

    const ssrfProviderNoKey = await appNoKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/translate',
      headers: { 'x-llm-provider': 'http://localhost:11434/v1' },
      payload: { text: 'Einstieg 10 Minuten' }
    });
    expect(ssrfProviderNoKey.statusCode).toBe(400);

    const ssrfBodyBaseUrl = await appNoKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/translate',
      payload: { text: 'Einstieg 10 Minuten', baseUrl: 'http://169.254.169.254/v1' }
    });
    expect(ssrfBodyBaseUrl.statusCode).toBe(400);

    // Allowed BYOK provider 'server' uses server's configured mockBaseUrl with user's key and bypasses shared cache
    const before = mockCalls;
    const byok1 = await appNoKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/translate',
      headers: { 'x-llm-api-key': 'sk-user-secret-999', 'x-llm-provider': 'server' },
      payload: { text: 'BYOK Anfrage Fotosynthese' }
    });
    expect(byok1.statusCode).toBe(200);
    expect(byok1.json().quelle).toBe('llm');
    expect(byok1.json().gecacht).toBe(false);
    expect(byok1.body).not.toContain('sk-user-secret-999');
    expect(mockCalls).toBe(before + 1);
  });
});
