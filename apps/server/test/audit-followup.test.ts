import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildApp } from '../src/app.js';
import { loadCatalogStore } from '../src/catalog-store.js';
import { loadConfig, proxyHint, type ServerConfig } from '../src/config.js';
import { createFmtMcpServer } from '../src/mcp/server.js';
import { resolveFachUri } from '../src/routes/oer.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIST_DATA = path.join(ROOT, 'dist-data');
const LONG = 'x'.repeat(8001);

const baseConfig = (over: Partial<ServerConfig> = {}): ServerConfig => ({
  ...loadConfig({}),
  host: '127.0.0.1',
  llmBaseUrl: '',
  llmApiKey: '',
  llmRateLimitPerMin: 1000,
  apiRateLimitPerMin: 100000,
  ...over
});

describe('Audit follow-up: every free-text field is length-capped', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ distDataDir: DIST_DATA, config: baseConfig() });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('rejects over-long strings anywhere in REST bodies and names the field', async () => {
    const cases: Array<[string, unknown, string]> = [
      ['/api/v1/plan', { text: 'Mathe 7 Brüche', fach: LONG }, 'fach'],
      ['/api/v1/plan', { text: 'Mathe 7 Brüche', lernziele: LONG }, 'lernziele'],
      ['/api/v1/adapt', { scenarioText: 'DaZ', gruppen: [{ id: 'g', label: 'G', text: LONG }] }, 'gruppen[0].text'],
      ['/api/v1/adapt', { scenarioText: 'DaZ', phasen: [{ phaseLabel: 'P', beschreibung: LONG }] }, 'phasen[0].beschreibung'],
      ['/api/v1/assistant/differentiate', { phases: [{ key: 'a' }], gruppen: [{ id: 'g' }], hinweise: LONG }, 'hinweise'],
      ['/api/v1/assistant/briefing', { task: 'material', payload: { baustein: 'abrufquiz', hinweise: LONG } }, 'payload.hinweise']
    ];
    for (const [url, payload, field] of cases) {
      const res = await app.inject({ method: 'POST', url, payload: payload as object });
      expect(res.statusCode, `${url} ${field}`).toBe(400);
      expect(res.json().fehler).toContain(field);
    }
  });

  it('caps every string argument of MCP tools', async () => {
    const store = loadCatalogStore(DIST_DATA);
    const server = createFmtMcpServer(store, baseConfig());
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    const client = new Client({ name: 't', version: '1' });
    await client.connect(b);
    const plan = (await client.callTool({ name: 'build_scenario_plan', arguments: { text: 'Mathe 7 Brüche', fach: LONG } })) as { isError?: boolean };
    expect(plan.isError).toBe(true);
    const adapt = (await client.callTool({
      name: 'adapt_scenario',
      arguments: { scenarioText: 'DaZ', gruppen: [{ id: 'g', label: 'G', text: LONG }] }
    })) as { isError?: boolean };
    expect(adapt.isError).toBe(true);
    const ok = (await client.callTool({ name: 'build_scenario_plan', arguments: { text: 'Mathe 7 Brüche', fach: 'Mathematik' } })) as { isError?: boolean };
    expect(ok.isError).toBeFalsy();
    await client.close();
  });
});

describe('Audit follow-up: rate limits', () => {
  it('answers 429 in German with the usual {fehler} shape', async () => {
    const app = await buildApp({ distDataDir: DIST_DATA, config: baseConfig({ llmRateLimitPerMin: 1 }) });
    await app.ready();
    const send = () => app.inject({ method: 'POST', url: '/api/v1/assistant/translate', payload: { text: 'Einstieg Brüche' } });
    expect((await send()).statusCode).toBe(200);
    const limited = await send();
    expect(limited.statusCode).toBe(429);
    expect(limited.json().fehler).toMatch(/Zu viele Anfragen/);
    await app.close();
  });

  it('puts a generous, configurable limit on the compute endpoints without LLM', async () => {
    expect(loadConfig({}).apiRateLimitPerMin).toBe(300);
    expect(loadConfig({ API_RATE_LIMIT_PER_MIN: '50' }).apiRateLimitPerMin).toBe(50);
    const app = await buildApp({ distDataDir: DIST_DATA, config: baseConfig({ apiRateLimitPerMin: 2 }) });
    await app.ready();
    const send = () => app.inject({ method: 'POST', url: '/api/v1/match', payload: { text: 'Einstieg' } });
    const first = await send();
    expect(first.headers['x-ratelimit-limit']).toBe('2');
    await send();
    expect((await send()).statusCode).toBe(429);
    // read-only catalogue routes stay unlimited
    const meta = await app.inject({ method: 'GET', url: '/api/v1/meta' });
    expect(meta.headers['x-ratelimit-limit']).toBeUndefined();
    await app.close();
  });
});

describe('Audit follow-up: smaller points', () => {
  it('recognises subject compounds with a school prefix, but still not Transport', () => {
    const sport = 'http://w3id.org/openeduhub/vocabs/discipline/600';
    expect(resolveFachUri('Schulsport', null)).toBe(sport);
    expect(resolveFachUri('Wahlpflichtinformatik', null)).toBe('http://w3id.org/openeduhub/vocabs/discipline/320');
    expect(resolveFachUri('Transportlogistik', null)).toBeNull();
    expect(resolveFachUri('Transport', null)).toBeNull();
  });

  it('hints at TRUST_PROXY when a domain is set but no proxy is trusted', () => {
    expect(proxyHint('methoden.example.org', false)).toMatch(/TRUST_PROXY/);
    expect(proxyHint('methoden.example.org', 1)).toBeNull();
    expect(proxyHint(null, false)).toBeNull();
  });
});
