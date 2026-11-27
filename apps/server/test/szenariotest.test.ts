import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { buildApp } from '../src/app.js';
import { SZ, type Sz } from '../../../scripts/szenariotest/szenarien.mts';

/**
 * Scenario test of 2026-11-27 (docs/qualitaet/2026-11-27-szenariotest.md), server side: what only the server builds
 * (table, Zusatzphasen, Entwurf, groups, MCP parity). Scenario ids as in scripts/szenariotest/szenarien.mts and in
 * REIHE5 (packages/fmt-core/test/qualitaet/faelle-reihe5.ts). Requests as the runner sends them (/plan with umfang voll).
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIST_DATA = path.join(ROOT, 'dist-data');

type Plan = Record<string, any>;

describe('Szenariotest 2026-11-27 (Server)', () => {
  let app: FastifyInstance;
  let client: Client;
  const plaene = new Map<string, Plan>();

  beforeAll(async () => {
    app = await buildApp({
      distDataDir: DIST_DATA,
      config: {
        port: 0,
        host: '127.0.0.1',
        corsOrigin: '*',
        llmBaseUrl: '',
        llmModel: '',
        llmApiKey: '',
        llmAllowByok: false,
        llmRateLimitPerMin: 100000,
        llmTimeoutMs: 5000,
        llmCacheMax: 100,
        llmCacheTtlMs: 60000
      }
    });
    const baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
    client = new Client({ name: 'fmt-szenariotest', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', baseUrl)));
    for (const s of SZ) {
      const res = await post('/api/v1/plan', planAnfrage(s));
      plaene.set(s.id, { status: res.statusCode, ...res.json() });
    }
  });
  afterAll(async () => {
    await client.close();
    await app.close();
  });

  const post = (url: string, payload: unknown) => app.inject({ method: 'POST', url, payload: payload as Record<string, unknown> });
  const call = async (name: string, args: Record<string, unknown>) => {
    const res = await client.callTool({ name, arguments: args });
    const text = (res.content as Array<{ text: string }>)[0].text;
    return { isError: Boolean(res.isError), json: JSON.parse(text) as Plan };
  };
  const ohneZeit = (x: Plan) => JSON.parse(JSON.stringify(x, (k, v) => (k === 'dauerMs' ? undefined : v)));
  const planAnfrage = (s: Sz) => ({ ...s.p, umfang: 'voll' });
  const plan = (id: string) => plaene.get(id)!;

  it('alle 56 Szenarien bekommen von /plan eine Antwort (Status 200)', () => {
    expect(SZ).toHaveLength(56);
    expect(SZ.filter((s) => plan(s.id).status !== 200).map((s) => s.id)).toEqual([]);
  });

  it('MCP build_scenario_plan antwortet in den Vergleichsfällen (mcp: true) wie REST /plan', async () => {
    const mcp = SZ.filter((s) => s.mcp);
    expect(mcp.length).toBeGreaterThan(0);
    for (const s of mcp) {
      const res = await call('build_scenario_plan', planAnfrage(s));
      expect(res.isError, s.id).toBe(false);
      const { status: _status, ...rest } = plan(s.id);
      expect(ohneZeit(res.json), s.id).toEqual(ohneZeit(rest));
    }
  });

  // Server acceptance of the later tasks (plan docs/superpowers/plans/2026-11-27-szenariotest-befunde.md); each task
  // turns its entries into tests.
  it.todo('Q2: gs2-religion-samariter: fach Religion; bs-pflege-transfer: keine Gruppe motorik, keine Zusatzphase dafür');
  it.todo('Q2: gs4-englisch-wortschatz-10, s1-franz-vokabeln-10: pflichtangaben auch in der Einzelphase (REST und MCP)');
  it.todo('Q4: s1-ethik-luegen-diskussion, gs2-sport-werfen, hs-seminar-soziologie-12: zusatzphasen leer; gs4-mathe-teilgruppen behält sie');
  it.todo('Q5: gs4-mathe-teilgruppen, s1-mathe-pythagoras-gruppen: Förderbedarf Lernen bekommt hilfe oder tausch (adapt, REST = MCP)');
  it.todo('Q5: s1-deutsch-sachtext-gruppen: Lesegruppe bekommt in jeder Phase hilfe „kann nicht lesen“');
  it.todo('Q6: keine Zeile „Phase N“ über alle 56; Hauptziel kein Kettenname; Lesart in schritte[].ziel; /match = /plan im Modus');
});
