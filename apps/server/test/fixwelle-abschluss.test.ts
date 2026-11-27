import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { BLOCK_STATUS } from '@fmt/core';
import { buildApp } from '../src/app.js';
import { loadCatalogStore } from '../src/catalog-store.js';
import { erlaubteCodes, KETTENSCHRITT_OHNE_ZIELTYP, REGELMELDUNGEN_FEHLER } from '../src/eingaben.js';
import { MAX_TEXT_CHARS } from '../src/routes/validation.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIST_DATA = path.join(ROOT, 'dist-data');

type Schema = { enum?: string[]; anyOf?: Schema[]; items?: Schema; type?: string };
type Tool = { name: string; description?: string; inputSchema: { properties?: Record<string, Schema> } };

describe('Fixwelle nach dem Final-Review (API und MCP fertigstellen)', () => {
  let app: FastifyInstance;
  let client: Client;
  let tools: Tool[];
  let dichte: Record<string, unknown>;
  const store = loadCatalogStore(DIST_DATA);

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
        llmRateLimitPerMin: 1000,
        llmTimeoutMs: 5000,
        llmCacheMax: 100,
        llmCacheTtlMs: 60000
      }
    });
    const baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
    client = new Client({ name: 'fmt-fixwelle-abschluss-test', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', baseUrl)));
    tools = (await client.listTools()).tools as Tool[];
    dichte = (await app.inject({ method: 'GET', url: '/beispiele/dichte-reihe.jsonld' })).json();
  });
  afterAll(async () => {
    await client.close();
    await app.close();
  });

  const post = (url: string, payload: unknown) => app.inject({ method: 'POST', url, payload: payload as Record<string, unknown> });
  const call = async (name: string, args: Record<string, unknown>) => {
    const res = await client.callTool({ name, arguments: args });
    const text = (res.content as Array<{ text: string }>)[0].text;
    return { isError: Boolean(res.isError), text, json: () => JSON.parse(text) };
  };
  const tool = (name: string) => tools.find((t) => t.name === name)!;
  const enumOf = (s: Schema | undefined): string[] | undefined => s?.enum ?? s?.anyOf?.map(enumOf).find(Boolean) ?? s?.items?.enum;

  it('I1: suggest_replacements sagt, dass ausgeschlossen höchstens 20 Methoden nennt, und nennt ausgeschlossenGesamt', () => {
    const d = tool('suggest_replacements').description!;
    expect(d).toContain('`ausgeschlossen` nennt bis zu 20 übrige Methoden mit baustein, merkmal und grund, `ausgeschlossenGesamt` ihre Zahl');
  });

  describe('I3: Bildungsstufe und Begleitziel als Code oder Bezeichnung, wie REST', () => {
    it('generate_phase_material nimmt „Sekundarstufe I“ an und antwortet wie mit dem Code', async () => {
      const args = { baustein: 'abrufquiz', thema: 'Dichte', materialTyp: 'quiz' };
      const rest = await post('/api/v1/assistant/material', { ...args, bildungsstufe: 'Sekundarstufe I' });
      expect(rest.statusCode).toBe(200);
      const label = await call('generate_phase_material', { ...args, bildungsstufe: 'Sekundarstufe I' });
      expect(label.isError, label.text).toBe(false);
      const code = await call('generate_phase_material', { ...args, bildungsstufe: 'sek1' });
      const ohneZeit = (x: Record<string, unknown>) => JSON.stringify(x, (k, v) => (/^dauer(Ms|Us|Ns)?$/.test(k) || k === 'ms' ? undefined : v));
      expect(ohneZeit(label.json())).toBe(ohneZeit(code.json()));
      // Case is ignored, as REST does.
      expect((await call('generate_phase_material', { ...args, bildungsstufe: 'sekundarstufe i' })).isError).toBe(false);
    });

    it('generate_phase_material: ein unbekannter Wert bleibt ein Fehler; das Schema nennt weiter die Codes', async () => {
      expect((await post('/api/v1/assistant/material', { baustein: 'abrufquiz', bildungsstufe: 'Mittelstufe' })).statusCode).toBe(400);
      expect((await call('generate_phase_material', { baustein: 'abrufquiz', bildungsstufe: 'Mittelstufe' })).isError).toBe(true);
      expect(enumOf(tool('generate_phase_material').inputSchema.properties!.bildungsstufe)).toEqual(erlaubteCodes(store, 'bildungsstufe'));
    });

    it('elaborate_scenario nimmt Bildungsstufe und Begleitziel als Bezeichnung an, wie REST /assistant/elaborate', async () => {
      const args = { arrangement: dichte, bildungsstufe: 'Sekundarstufe I', begleitziel: ['Soziales Lernen', 'selbstregulation'] };
      const rest = await post('/api/v1/assistant/elaborate', { mode: 'briefing', ...args });
      expect(rest.statusCode).toBe(200);
      const mcp = await call('elaborate_scenario', args);
      expect(mcp.isError, mcp.text).toBe(false);
      const code = await call('elaborate_scenario', { arrangement: dichte, bildungsstufe: 'sek1', begleitziel: ['sozial', 'selbstregulation'] });
      expect(JSON.stringify(mcp.json().entwurf)).toBe(JSON.stringify(code.json().entwurf));
      expect((await call('elaborate_scenario', { arrangement: dichte, begleitziel: 'Soziales Lernen' })).isError).toBe(false);
      expect((await call('elaborate_scenario', { arrangement: dichte, begleitziel: ['Mut'] })).isError).toBe(true);
      expect(enumOf(tool('elaborate_scenario').inputSchema.properties!.begleitziel)).toEqual(erlaubteCodes(store, 'begleitziel'));
    });
  });

  it('M4: die Werte-Listen der MCP-Tools kommen aus derselben Quelle wie REST', () => {
    const props = (name: string) => tool(name).inputSchema.properties!;
    expect(enumOf(props('search_methods').status)).toEqual([...BLOCK_STATUS]);
    expect(erlaubteCodes(store, 'status')).toEqual([...BLOCK_STATUS]);
    for (const feld of ['minEvidenz', 'eintragsart']) expect(enumOf(props('search_methods')[feld]), feld).toEqual(erlaubteCodes(store, feld));
    for (const feld of ['quickProfileId', 'personaId', 'maxAufwand']) expect(enumOf(props('score_differentiation_matrix')[feld]), feld).toEqual(erlaubteCodes(store, feld));
    expect(enumOf(props('adapt_scenario').maxAufwand)).toEqual(erlaubteCodes(store, 'maxAufwand'));
    expect(enumOf(props('search_wlo_oer').bildungsstufe)).toEqual(erlaubteCodes(store, 'bildungsstufe'));
  });

  it('M5: limit der Differenzierung hat in REST und MCP dieselben Grenzen', async () => {
    const restZuViel = await post('/api/v1/differentiation/score', { quickProfileId: 'daz', limit: 100 });
    expect(restZuViel.statusCode).toBe(400);
    expect(restZuViel.json().fehler).toMatch(/limit/);
    expect((await call('score_differentiation_matrix', { quickProfileId: 'daz', limit: 100 })).isError).toBe(true);
    expect((await post('/api/v1/differentiation/score', { quickProfileId: 'daz', limit: 40 })).statusCode).toBe(200);
    expect((await call('score_differentiation_matrix', { quickProfileId: 'daz', limit: 40 })).isError).toBe(false);
  });

  it('M6: /validate in der Hülle weist unbekannte Schlüssel ab, statt die Situation still zu übergehen', async () => {
    const res = await post('/api/v1/validate', { arrangement: dichte, situaton: { vorwissen: 'hoch' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().fehler).toBe('Unbekanntes Feld „situaton“. Erlaubt: arrangement, situation.');
    expect(res.json().erlaubt).toEqual(['arrangement', 'situation']);
    // The bare arrangement (with situation beside its fields) stays as before.
    expect((await post('/api/v1/validate', dichte)).statusCode).toBe(200);
    expect((await post('/api/v1/validate', { ...dichte, situation: { vorwissen: 'hoch' } })).statusCode).toBe(200);
  });

  it('M7: ein unbekanntes Feld der Situation nennt fach unter den erlaubten Feldern; fach wird angenommen', async () => {
    const res = await post('/api/v1/validate', { arrangement: dichte, situation: { farbe: 'blau' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().erlaubt).toContain('fach');
    expect(res.json().erlaubt).not.toContain('lernort');
    expect(res.json().fehler).toMatch(/Erlaubt: .*\bfach\b/);
    const mcp = await call('validate_arrangement', { arrangement: dichte, situation: { farbe: 'blau' } });
    expect(mcp.isError).toBe(true);
    expect(mcp.json().fehler).toBe(res.json().fehler);
    expect((await post('/api/v1/validate', { arrangement: dichte, situation: { fach: 'Physik' } })).statusCode).toBe(200);
  });

  it('M8: validate_arrangement nennt den Alias lernort nicht', () => {
    expect(tool('validate_arrangement').description).not.toMatch(/lernort/);
  });

  describe('M9: Regelmeldungen im Entwurf: REST und MCP weisen dieselben Eingaben ab', () => {
    const meldung = { regel: 'r', wirkung: 'weist-hin', grundlage: 'E', text: 'Ein Hinweis.' };
    it('Text nur aus Leerzeichen', async () => {
      const regelmeldungen = [{ ...meldung, text: ' ' }];
      const rest = await post('/api/v1/assistant/elaborate', { mode: 'briefing', arrangement: dichte, regelmeldungen });
      expect(rest.statusCode).toBe(400);
      const mcp = await call('elaborate_scenario', { arrangement: dichte, regelmeldungen });
      expect(mcp.isError).toBe(true);
      expect(mcp.json().fehler).toBe(REGELMELDUNGEN_FEHLER);
    });
    it('mehr als 50 Meldungen oder ein zu langer Text', async () => {
      const viele = Array.from({ length: 51 }, () => meldung);
      expect((await post('/api/v1/assistant/elaborate', { mode: 'briefing', arrangement: dichte, regelmeldungen: viele })).statusCode).toBe(400);
      expect((await call('elaborate_scenario', { arrangement: dichte, regelmeldungen: viele })).isError).toBe(true);
      const lang = [{ ...meldung, text: 'x'.repeat(MAX_TEXT_CHARS + 1) }];
      expect((await post('/api/v1/assistant/elaborate', { mode: 'briefing', arrangement: dichte, regelmeldungen: lang })).statusCode).toBe(400);
      expect((await call('elaborate_scenario', { arrangement: dichte, regelmeldungen: lang })).isError).toBe(true);
      expect((await post('/api/v1/assistant/elaborate', { mode: 'briefing', arrangement: dichte, regelmeldungen: [meldung] })).statusCode).toBe(200);
    });
  });

  it('M10: kettenschritt der Differenzierung wird geprüft wie bei /methods', async () => {
    const kette = store.bundle.ketten[0];
    const falsch = await post('/api/v1/differentiation/score', { quickProfileId: 'daz', zieltyp: kette.id, kettenschritt: 'zzz' });
    expect(falsch.statusCode).toBe(400);
    expect(falsch.json().erlaubt).toEqual(kette.schritte.map((s) => s.id));
    const mcp = await call('score_differentiation_matrix', { quickProfileId: 'daz', zieltyp: kette.id, kettenschritt: 'zzz' });
    expect(mcp.isError).toBe(true);
    expect(mcp.json().fehler).toBe(falsch.json().fehler);
    const ohne = await post('/api/v1/differentiation/score', { quickProfileId: 'daz', kettenschritt: kette.schritte[0].id });
    expect(ohne.json().fehler).toBe(KETTENSCHRITT_OHNE_ZIELTYP);
    expect((await call('score_differentiation_matrix', { quickProfileId: 'daz', kettenschritt: kette.schritte[0].id })).json().fehler).toBe(KETTENSCHRITT_OHNE_ZIELTYP);
    expect((await post('/api/v1/differentiation/score', { quickProfileId: 'daz', zieltyp: kette.id, kettenschritt: kette.schritte[0].id })).statusCode).toBe(200);
  });
});
