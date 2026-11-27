import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { buildApp } from '../src/app.js';
import { loadConfig, type ServerConfig } from '../src/config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIST_DATA = path.join(ROOT, 'dist-data');
const config = (): ServerConfig => ({ ...loadConfig({}), host: '127.0.0.1', llmBaseUrl: '', llmApiKey: '', llmRateLimitPerMin: 1000, apiRateLimitPerMin: 100000 });

describe('Runde 5: Szenarioplan in REST und MCP', () => {
  let app: FastifyInstance;
  let client: Client;
  const plan = async (payload: Record<string, unknown>) => (await app.inject({ method: 'POST', url: '/api/v1/plan', payload: { umfang: 'kompakt', ...payload } })).json();
  const tool = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    return { json: JSON.parse((r.content as Array<{ text: string }>)[0].text), isError: Boolean(r.isError) };
  };
  beforeAll(async () => {
    app = await buildApp({ distDataDir: DIST_DATA, config: config() });
    const addr = await app.listen({ port: 0, host: '127.0.0.1' });
    client = new Client({ name: 'runde5', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', addr)));
  });
  afterAll(async () => {
    await client.close();
    await app.close();
  });

  it('Szenarioplan gibt die Hinweise der Zuordnung weiter (Sicherheitshinweis)', async () => {
    const p = await plan({ text: 'Chemie Klasse 8: Schülerexperiment zu Säuren und Laugen, 90 Minuten' });
    expect((p.hinweise || []).join(' ')).toMatch(/Sicherheit und die Aufsicht/);
    const m = await tool('build_scenario_plan', { text: 'Chemie Klasse 8: Schülerexperiment zu Säuren und Laugen, 90 Minuten' });
    expect((m.json.hinweise || []).join(' ')).toMatch(/Sicherheit und die Aufsicht/);
  });

  it('P2: ohne Zeitangabe plant der Szenarioplan eine Stunde von 45 Minuten', async () => {
    const p = await plan({ text: 'Bruchrechnung Klasse 6' });
    expect(p.pruefung.dauerMin).toBeLessThanOrEqual(45);
    expect(p.pruefung.dauerMin).toBeGreaterThanOrEqual(40);
  });

  it('P2: ist das Zeitbudget zu kurz für einen Ablauf, kommen Vorschläge für eine Phase statt eines zu langen Plans', async () => {
    const text = 'Abschlussreflexion für eine Projektwoche, 10 Minuten';
    const p = await plan({ text });
    expect(p.modus).toBe('phase');
    expect(p.vorschlaege.length).toBeGreaterThan(0);
    expect(p.hinweis).toMatch(/10 Minuten/);
    expect(p.thematischeTabelle).toBeUndefined();
    const m = await tool('build_scenario_plan', { text });
    expect(m.isError).toBe(false);
    expect(m.json.modus).toBe('phase');
    expect(m.json.vorschlaege.map((v: { baustein: string }) => v.baustein)).toEqual(p.vorschlaege.map((v: { baustein: string }) => v.baustein));
  });
});
