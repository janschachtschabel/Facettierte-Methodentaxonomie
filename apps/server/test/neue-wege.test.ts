import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { buildApp } from '../src/app.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIST_DATA = path.join(ROOT, 'dist-data');

type Tool = { name: string; description?: string; inputSchema: { properties?: Record<string, { description?: string }> } };

describe('Neue Wege nach außen: REST und MCP (Task A4, Lücken R08, R19)', () => {
  let app: FastifyInstance;
  let client: Client;
  let tools: Tool[];
  let dichte: Record<string, unknown>;

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
    client = new Client({ name: 'fmt-neue-wege-test', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', baseUrl)));
    tools = (await client.listTools()).tools as Tool[];
    dichte = (await app.inject({ method: 'GET', url: '/beispiele/dichte-reihe.jsonld' })).json();
  });
  afterAll(async () => {
    await client.close();
    await app.close();
  });

  const get = (url: string) => app.inject({ method: 'GET', url });
  const post = (url: string, payload: unknown) => app.inject({ method: 'POST', url, payload: payload as Record<string, unknown> });
  const call = async (name: string, args: Record<string, unknown>) => {
    const res = await client.callTool({ name, arguments: args });
    const text = (res.content as Array<{ text: string }>)[0].text;
    return { isError: Boolean(res.isError), text, json: () => JSON.parse(text) };
  };
  const ohneZeit = (x: Record<string, unknown>) => {
    const { dauerMs: _d, ...rest } = x;
    return rest;
  };
  const tool = (name: string) => tools.find((t) => t.name === name)!;
  type Treffer = { kennung: string; eintragsart: string; einordnung: Array<{ kette: string; schritt: string }> };

  describe('Suche nach Kette und Kettenschritt (R08)', () => {
    it('/methods?zieltyp nennt nur Methoden, die einen Schritt der Kette füllen können', async () => {
      const alle = (await get('/api/v1/methods')).json();
      const res = await get('/api/v1/methods?zieltyp=konzeptaufbau');
      expect(res.statusCode).toBe(200);
      const r = res.json();
      expect(r.anzahl).toBeGreaterThan(0);
      expect(r.anzahl).toBeLessThan(alle.anzahl);
      expect(r.anzahlHilfen).toBe(0);
      for (const t of r.treffer as Treffer[]) expect(t.einordnung.some((e) => e.kette === 'konzeptaufbau')).toBe(true);
    });

    it('/methods?zieltyp&kettenschritt grenzt auf den Schritt ein; search_methods findet dieselben Methoden', async () => {
      const kette = (await get('/api/v1/methods?zieltyp=konzeptaufbau')).json();
      const r = (await get('/api/v1/methods?zieltyp=konzeptaufbau&kettenschritt=k2&limit=100')).json();
      expect(r.anzahl).toBeGreaterThan(0);
      expect(r.anzahl).toBeLessThan(kette.anzahl);
      for (const t of r.treffer as Treffer[]) expect(t.einordnung.some((e) => e.kette === 'konzeptaufbau' && e.schritt === 'k2')).toBe(true);
      const mcp = await call('search_methods', { zieltyp: 'konzeptaufbau', kettenschritt: 'k2', limit: 100 });
      expect(mcp.isError).toBe(false);
      expect((mcp.json().treffer as Treffer[]).map((t) => t.kennung)).toEqual((r.treffer as Treffer[]).map((t) => t.kennung));
      expect(mcp.json().anzahl).toBe(r.anzahl);
    });

    it('ein unbekannter zieltyp wird abgewiesen (REST 400 mit den Ketten, MCP-Schema mit denselben Codes)', async () => {
      const res = await get('/api/v1/methods?zieltyp=kochen');
      expect(res.statusCode).toBe(400);
      expect(res.json().fehler).toContain('Feld „zieltyp“: unbekannter Wert „kochen“');
      expect(res.json().erlaubt).toEqual(expect.arrayContaining(['konzeptaufbau', 'prozedur']));
      const schema = tool('search_methods').inputSchema.properties!.zieltyp as { enum?: string[]; anyOf?: unknown[] };
      expect(JSON.stringify(schema)).toContain('konzeptaufbau');
      const mcp = await call('search_methods', { zieltyp: 'kochen' });
      expect(mcp.isError).toBe(true);
    });

    it('kettenschritt ohne zieltyp wird abgewiesen, mit derselben Meldung in REST und MCP', async () => {
      const res = await get('/api/v1/methods?kettenschritt=k2');
      expect(res.statusCode).toBe(400);
      expect(res.json().fehler).toContain('zieltyp');
      const mcp = await call('search_methods', { kettenschritt: 'k2' });
      expect(mcp.isError).toBe(true);
      expect(mcp.json().fehler).toBe(res.json().fehler);
    });

    it('ein Schritt, der nicht zur Kette gehört, wird abgewiesen (erlaubt: die Schritte der Kette)', async () => {
      const res = await get('/api/v1/methods?zieltyp=konzeptaufbau&kettenschritt=p1');
      expect(res.statusCode).toBe(400);
      expect(res.json().fehler).toContain('Feld „kettenschritt“: unbekannter Wert „p1“');
      expect(res.json().erlaubt).toEqual(['k1', 'k2', 'k3', 'k4', 'k5']);
      const mcp = await call('search_methods', { zieltyp: 'konzeptaufbau', kettenschritt: 'p1' });
      expect(mcp.isError).toBe(true);
      expect(mcp.json().fehler).toBe(res.json().fehler);
    });

    it('die Beschreibung von search_methods nennt zieltyp und kettenschritt', () => {
      expect(tool('search_methods').description).toContain('zieltyp');
      expect(tool('search_methods').description).toContain('kettenschritt');
    });
  });

  describe('Passungsregeln für einen gegebenen Ablauf (R19)', () => {
    type Pruefung = { meldungen: unknown[]; gueltig: boolean; regelmeldungen?: Array<{ regel: string; baustein?: string; wirkung: string; grundlage: string; text: string }> };

    it('/validate ohne situation antwortet wie bisher, ohne regelmeldungen', async () => {
      const res = await post('/api/v1/validate', dichte);
      expect(res.statusCode).toBe(200);
      expect(res.json()).not.toHaveProperty('regelmeldungen');
    });

    it('/validate mit situation nennt regelmeldungen; das Ergebnis von R-00 bis R-12 bleibt gleich', async () => {
      const ohne = (await post('/api/v1/validate', dichte)).json() as Pruefung;
      const res = await post('/api/v1/validate', { arrangement: dichte, situation: { vorwissen: 'hoch' } });
      expect(res.statusCode).toBe(200);
      const mit = res.json() as Pruefung;
      expect(mit.meldungen).toEqual(ohne.meldungen);
      expect(mit.gueltig).toBe(ohne.gueltig);
      expect(mit.regelmeldungen!.some((m) => m.regel === 'eignung-vorwissen' && m.baustein === 'loesungsbeispiele')).toBe(true);
      for (const m of mit.regelmeldungen!) expect(m).toEqual(expect.objectContaining({ wirkung: expect.any(String), grundlage: expect.any(String), text: expect.any(String) }));
      // The situation may also stand next to the arrangement fields of the body.
      const daneben = (await post('/api/v1/validate', { ...dichte, situation: { vorwissen: 'hoch' } })).json() as Pruefung;
      expect(daneben).toEqual(mit);
    });

    it('validate_arrangement mit situation gibt dieselben regelmeldungen wie REST', async () => {
      const rest = (await post('/api/v1/validate', { arrangement: dichte, situation: { vorwissen: 'hoch', lernort: 'klassenraum' } })).json() as Pruefung;
      const mcp = await call('validate_arrangement', { arrangement: dichte, situation: { vorwissen: 'hoch', lernort: 'klassenraum' } });
      expect(mcp.isError).toBe(false);
      expect(mcp.json().regelmeldungen).toEqual(rest.regelmeldungen);
      expect(mcp.json().meldungen).toEqual(rest.meldungen);
      const ohne = await call('validate_arrangement', { arrangement: dichte });
      expect(ohne.json()).not.toHaveProperty('regelmeldungen');
    });

    it('die kriterien einer Antwort von /match lassen sich als situation übergeben', async () => {
      const match = (await post('/api/v1/match', { text: 'Physik Klasse 7 Dichte, Vorwissen hoch', modus: 'ablauf' })).json();
      const res = await post('/api/v1/validate', { arrangement: dichte, situation: match.kriterien });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json().regelmeldungen)).toBe(true);
    });

    it('eine falsche situation wird abgewiesen, mit derselben Meldung in REST und MCP', async () => {
      const code = await post('/api/v1/validate', { arrangement: dichte, situation: { vorwissen: 'riesig' } });
      expect(code.statusCode).toBe(400);
      expect(code.json().fehler).toContain('Feld „vorwissen“: unbekannter Wert „riesig“');
      expect(code.json().erlaubt).toEqual(expect.arrayContaining(['hoch']));
      const feld = await post('/api/v1/validate', { arrangement: dichte, situation: { farbe: 'blau' } });
      expect(feld.statusCode).toBe(400);
      expect(feld.json().fehler).toContain('Unbekanntes Feld „farbe“');
      const keinObjekt = await post('/api/v1/validate', { arrangement: dichte, situation: 'hoch' });
      expect(keinObjekt.statusCode).toBe(400);
      expect(keinObjekt.json().fehler).toContain('situation');
      const mcp = await call('validate_arrangement', { arrangement: dichte, situation: { farbe: 'blau' } });
      expect(mcp.isError).toBe(true);
      expect(mcp.json().fehler).toBe(feld.json().fehler);
    });

    it('die Beschreibung von validate_arrangement nennt situation und regelmeldungen', () => {
      const d = tool('validate_arrangement').description!;
      expect(d).toContain('situation');
      expect(d).toContain('regelmeldungen');
      expect(d).not.toContain('prüft dieses Werkzeug nicht');
    });
  });
});
