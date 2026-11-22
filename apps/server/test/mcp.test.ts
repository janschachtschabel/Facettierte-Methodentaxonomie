import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { buildApp } from '../src/app.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIST_DATA = path.join(ROOT, 'dist-data');
const EXPECTED_METHOD_COUNT = fs.readdirSync(path.join(ROOT, 'data', 'bausteine')).filter((f) => f.endsWith('.json')).length;

describe('FMT MCP Server (Streamable HTTP /mcp)', () => {
  let app: FastifyInstance;
  let client: Client;
  let baseUrl: string;

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
        llmAllowByok: true,
        llmRateLimitPerMin: 100,
        llmTimeoutMs: 5000,
        llmCacheMax: 100,
        llmCacheTtlMs: 60000
      }
    });
    const addr = await app.listen({ port: 0, host: '127.0.0.1' });
    baseUrl = addr;

    const transport = new StreamableHTTPClientTransport(new URL('/mcp', baseUrl));
    client = new Client({ name: 'fmt-test-client', version: '1.0.0' });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
    await app.close();
  });

  it('lists all 13 FMT tools, resources, and prompts', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'build_scenario_plan',
      'classify_scenario_text',
      'compare_methods',
      'elaborate_scenario',
      'generate_phase_material',
      'get_method',
      'list_vocabularies',
      'match_scenario',
      'score_differentiation_matrix',
      'search_methods',
      'search_wlo_oer',
      'suggest_replacements',
      'validate_arrangement'
    ]);

    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual(['audit_lesson_plan', 'design_learning_scenario']);

    const { resources } = await client.listResources();
    expect(resources.some((r) => r.uri === 'fmt://catalog/summary')).toBe(true);
    expect(resources.some((r) => r.uri === 'fmt://rules')).toBe(true);
  });

  it('executes search_methods, get_method, compare_methods, match_scenario, validate_arrangement, suggest_replacements and list_vocabularies', async () => {
    const searchRes = await client.callTool({
      name: 'search_methods',
      arguments: { text: 'jigsaw', limit: 5 }
    });
    const searchJson = JSON.parse((searchRes.content as Array<{ text: string }>)[0].text);
    expect(searchJson.treffer[0].kennung).toBe('gruppenpuzzle');

    const getRes = await client.callTool({ name: 'get_method', arguments: { kennung: 'abrufquiz' } });
    const getJson = JSON.parse((getRes.content as Array<{ text: string }>)[0].text);
    expect(getJson.kennung).toBe('abrufquiz');
    expect(getJson.quellen.length).toBeGreaterThanOrEqual(1);

    const cmpRes = await client.callTool({
      name: 'compare_methods',
      arguments: { methodeA: 'lehrervortrag', methodeB: 'vortrag-prompts' }
    });
    const cmpJson = JSON.parse((cmpRes.content as Array<{ text: string }>)[0].text);
    expect(cmpJson.unterschiede.some((u: { facette: string }) => u.facette === 'engagement')).toBe(true);

    const matchRes = await client.callTool({
      name: 'match_scenario',
      arguments: { zieltyp: 'konzeptaufbau', bildungsstufe: 'sek1', vorwissen: 'gering', zeitMin: 270 }
    });
    const matchJson = JSON.parse((matchRes.content as Array<{ text: string }>)[0].text);
    expect(matchJson.modus).toBe('ablauf');
    expect(matchJson.pruefung.gueltig).toBe(true);

    const valRes = await client.callTool({
      name: 'validate_arrangement',
      arguments: { arrangement: matchJson.arrangement }
    });
    const valJson = JSON.parse((valRes.content as Array<{ text: string }>)[0].text);
    expect(valJson.gueltig).toBe(true);

    const badValRes = await client.callTool({
      name: 'validate_arrangement',
      arguments: {
        arrangement: { typ: 'Arrangement', name: 'Kaputt', reichweite: 'r3', ablauf: { typ: 'Sequenz', teile: 'nope' } }
      }
    });
    const badValJson = JSON.parse((badValRes.content as Array<{ text: string }>)[0].text);
    expect(badValJson.gueltig).toBe(false);
    expect(badValJson.meldungen.some((m: { regel: string }) => m.regel === 'R-00')).toBe(true);

    const repRes = await client.callTool({
      name: 'suggest_replacements',
      arguments: { arrangement: matchJson.arrangement, pfad: '/ablauf/teile/0' }
    });
    const repJson = JSON.parse((repRes.content as Array<{ text: string }>)[0].text);
    expect(Array.isArray(repJson.kandidaten)).toBe(true);

    const vocabRes = await client.callTool({ name: 'list_vocabularies', arguments: { scheme: 'ansatz' } });
    const vocabJson = JSON.parse((vocabRes.content as Array<{ text: string }>)[0].text);
    expect(vocabJson.werte.length).toBe(12);

    // New v1.5 MCP tools: score_differentiation_matrix, build_scenario_plan, elaborate_scenario, generate_phase_material
    const diffRes = await client.callTool({
      name: 'score_differentiation_matrix',
      arguments: { personaId: 'languageAndCulture', baustein: 'erfindungsaufgabe', limit: 6 }
    });
    const diffJson = JSON.parse((diffRes.content as Array<{ text: string }>)[0].text);
    expect(diffJson.topRecommendations.length).toBeGreaterThan(0);
    expect(diffJson.alternativeMethoden.length).toBeGreaterThan(0);

    const planRes = await client.callTool({
      name: 'build_scenario_plan',
      arguments: {
        text: 'Mathematik Bruchrechnen Doppelstunde Klasse 6, 90 Minuten, geringes Vorwissen',
        fach: 'Mathematik',
        thema: 'Bruchrechnen',
        includeWloOer: false
      }
    });
    const planJson = JSON.parse((planRes.content as Array<{ text: string }>)[0].text);
    expect(planJson.pruefung.gueltig).toBe(true);
    expect(planJson.thematischeTabelle.length).toBeGreaterThan(0);
    expect(planJson.llmBriefing.systemPrompt).toContain('FMT');
    expect(planJson.maschinenlesbar['@type']).toBe('FmtScenarioPlan');

    const elabRes = await client.callTool({
      name: 'elaborate_scenario',
      arguments: {
        arrangement: matchJson.arrangement,
        fach: 'Physik',
        thema: 'Dichte',
        oerRessourcen: [{ titel: 'PhET Dichte', wwwurl: 'https://phet.colorado.edu/de/simulations/density' }]
      }
    });
    const elabJson = JSON.parse((elabRes.content as Array<{ text: string }>)[0].text);
    expect(elabJson.quelle).toBe('deterministisch');
    expect(elabJson.thematischeTabelle.length).toBeGreaterThan(0);
    expect(elabJson.ausarbeitung).toContain('Dichte');
    expect(elabJson.llmBriefing.userPrompt).toContain('phet.colorado.edu');

    const matRes = await client.callTool({
      name: 'generate_phase_material',
      arguments: { baustein: 'abrufquiz', fach: 'Physik', thema: 'Dichte', materialTyp: 'quiz' }
    });
    const matJson = JSON.parse((matRes.content as Array<{ text: string }>)[0].text);
    expect(matJson.quelle).toBe('deterministisch');
    expect(matJson.material).toContain('Abrufquiz');
    expect(matJson.llmBriefing.userPrompt).toContain('MATERIALTYP: quiz');

    const clsRes = await client.callTool({
      name: 'classify_scenario_text',
      arguments: { text: 'Kooperatives Lernen 2 x 45 Minuten Klasse 7 mit DaZ-Kindern' }
    });
    const clsJson = JSON.parse((clsRes.content as Array<{ text: string }>)[0].text);
    expect(clsJson.kriterien.zeitMin).toBe(90);
    expect(clsJson.matrixMerkmale.selectedValues.sprachkompetenz).toBe('sprachkompetenz-gering');
  });

  it('reads MCP resources fmt://catalog/summary and fmt://rules', async () => {
    const summary = await client.readResource({ uri: 'fmt://catalog/summary' });
    const parsed = JSON.parse((summary.contents[0] as { text: string }).text);
    expect(parsed.anzahl).toBe(EXPECTED_METHOD_COUNT);
    expect(parsed.creator).toBe('Jan Schachtschabel');

    // Verify CORS header survives reply.hijack() on /mcp
    const corsRes = await fetch(new URL('/mcp', baseUrl), {
      method: 'POST',
      headers: {
        Origin: 'https://example.org',
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 99,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'cors-check', version: '1.0' } }
      })
    });
    expect(corsRes.status).toBe(200);
    expect(corsRes.headers.get('access-control-allow-origin')).toBeTruthy();

    const rules = await client.readResource({ uri: 'fmt://rules' });
    const parsedRules = JSON.parse((rules.contents[0] as { text: string }).text);
    expect(parsedRules.regeln.length).toBe(13);
  });
});
