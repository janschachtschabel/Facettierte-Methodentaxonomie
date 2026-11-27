import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// R18 (accepted and documented in README, DEPLOYMENT and ApiMcpPage): errors of the SDK schema check come as SDK
// text with isError and the allowed values, not as the German { fehler } form of the tools' own errors.
describe('MCP: Fehler aus der Schemaprüfung (R18, dokumentiert)', () => {
  let app: FastifyInstance;
  let client: Client;
  beforeAll(async () => {
    app = await buildApp({
      distDataDir: path.join(ROOT, 'dist-data'),
      config: { ...loadConfig({}), host: '127.0.0.1', llmBaseUrl: '', llmApiKey: '', apiRateLimitPerMin: 100000 }
    });
    const addr = await app.listen({ port: 0, host: '127.0.0.1' });
    client = new Client({ name: 'r18', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', addr)));
  });
  afterAll(async () => {
    await client.close();
    await app.close();
  });

  it('unbekannter Raum: isError, SDK-Text nennt die erlaubten Werte', async () => {
    const r = await client.callTool({ name: 'match_scenario', arguments: { raum: 'mondbasis' } });
    expect(r.isError).toBe(true);
    const text = (r.content as Array<{ text: string }>)[0].text;
    expect(text).toMatch(/-32602/);
    expect(text).toContain('klassenraum');
  });
});
