import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildApp } from '../src/app.js';
import { loadCatalogStore } from '../src/catalog-store.js';
import type { ServerConfig } from '../src/config.js';
import { ByokValidationError, resolveLlmTarget } from '../src/llm/client.js';
import { createFmtMcpServer } from '../src/mcp/server.js';
import { resolveFachUri } from '../src/routes/oer.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIST_DATA = path.join(ROOT, 'dist-data');

const baseConfig = (over: Partial<ServerConfig> = {}): ServerConfig => ({
  port: 0,
  host: '127.0.0.1',
  corsOrigin: '*',
  llmBaseUrl: '',
  llmModel: '',
  llmApiKey: '',
  llmAllowByok: true,
  llmRateLimitPerMin: 1000,
  llmTimeoutMs: 2000,
  llmCacheMax: 10,
  llmCacheTtlMs: 1000,
  ...over
});

describe('Audit 2026-11: input hardening', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ distDataDir: DIST_DATA, config: baseConfig() });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('rejects BYOK provider names that only exist on Object.prototype', () => {
    for (const provider of ['constructor', 'tostring', '__proto__', 'hasownproperty']) {
      expect(() => resolveLlmTarget(baseConfig(), { apiKey: 'sk-x', provider })).toThrow(ByokValidationError);
    }
  });

  it('does not resolve subject URIs from prototype keys or from word fragments', () => {
    expect(resolveFachUri('constructor', null)).toBeNull();
    expect(resolveFachUri('toString', null)).toBeNull();
    // "Transport" contains "sport", but it is not the subject Sport
    expect(resolveFachUri('Transportlogistik', null)).toBeNull();
    // word prefixes still work
    expect(resolveFachUri('Mathematikdidaktik', null)).toBe('http://w3id.org/openeduhub/vocabs/discipline/380');
    expect(resolveFachUri('Physik', null)).toBe('http://w3id.org/openeduhub/vocabs/discipline/460');
  });

  it('answers /api/v1/adapt with 400 instead of 500 for malformed groups and phases', async () => {
    for (const payload of [
      { baustein: 'abrufquiz', gruppen: 'x' },
      { baustein: 'abrufquiz', gruppen: [null] },
      { baustein: 'abrufquiz', gruppen: [{ id: 1 }] },
      { phasen: [null], gruppen: [null] },
      { scenarioText: 'Einstieg', phasen: 'x' },
      { scenarioText: 'DaZ Mathe', fach: 5 },
      { scenarioText: 'DaZ Mathe', thema: ['x'] },
      { scenarioText: 'DaZ Mathe', bildungsstufe: {} }
    ]) {
      const res = await app.inject({ method: 'POST', url: '/api/v1/adapt', payload });
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      expect(res.json().fehler).toBeTruthy();
    }
    const ok = await app.inject({
      method: 'POST',
      url: '/api/v1/adapt',
      payload: { baustein: 'abrufquiz', gruppen: [{ id: 'g1', label: 'DaZ' }] }
    });
    expect(ok.statusCode).toBe(200);
  });

  it('answers /api/v1/assistant/material with 400 for malformed groups', async () => {
    for (const gruppen of ['x', [null], [{ label: 5 }]]) {
      const res = await app.inject({ method: 'POST', url: '/api/v1/assistant/material', payload: { baustein: 'abrufquiz', gruppen } });
      expect(res.statusCode, JSON.stringify(gruppen)).toBe(400);
    }
  });

  it('caps free text so a single request cannot block the event loop for long', async () => {
    const long = 'Mathematik Klasse 7 Bruchrechnen '.repeat(400); // > 8000 characters
    for (const [url, payload] of [
      ['/api/v1/match', { text: long }],
      ['/zuordnung', { text: long }],
      ['/api/v1/plan', { text: long }],
      ['/api/v1/classify', { text: long }],
      ['/api/v1/adapt', { scenarioText: long }],
      ['/api/v1/adapt', { lerngruppenText: long }],
      ['/api/v1/assistant/briefing', { task: 'translate', payload: { text: long } }]
    ] as const) {
      const res = await app.inject({ method: 'POST', url, payload });
      expect(res.statusCode, url).toBe(400);
      expect(res.json().fehler).toMatch(/8000/);
    }
    const ok = await app.inject({ method: 'POST', url: '/api/v1/match', payload: { text: 'Einstieg Bruchrechnen Klasse 6' } });
    expect(ok.statusCode).toBe(200);
  });
});

describe('Audit 2026-11: MCP cannot bypass the server LLM rate limit', () => {
  it('limits useServerLlm calls via MCP to llmRateLimitPerMin per minute', async () => {
    const store = loadCatalogStore(DIST_DATA);
    // Unreachable endpoint: each attempt still counts against the budget.
    const config = baseConfig({ llmApiKey: 'sk-server', llmBaseUrl: 'http://127.0.0.1:9/v1', llmModel: 'm', llmRateLimitPerMin: 1, llmTimeoutMs: 500 });
    const call = async () => {
      const server = createFmtMcpServer(store, config);
      const [a, b] = InMemoryTransport.createLinkedPair();
      await server.connect(a);
      const client = new Client({ name: 't', version: '1' });
      await client.connect(b);
      const res = await client.callTool({
        name: 'generate_phase_material',
        arguments: { baustein: 'abrufquiz', thema: 'Brüche', useServerLlm: true }
      });
      await client.close();
      return res as { isError?: boolean; content: Array<{ text: string }> };
    };
    const first = await call();
    expect(first.content[0].text).not.toMatch(/Limit/);
    const second = await call();
    expect(second.isError).toBe(true);
    expect(second.content[0].text).toMatch(/Limit/);
  });

  it('puts a rate limit on the MCP HTTP endpoint', async () => {
    const app = await buildApp({ distDataDir: DIST_DATA, config: baseConfig({ llmRateLimitPerMin: 1 }) });
    await app.ready();
    const res = await app.inject({ method: 'POST', url: '/mcp', payload: {} });
    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    await app.close();
  });
});
