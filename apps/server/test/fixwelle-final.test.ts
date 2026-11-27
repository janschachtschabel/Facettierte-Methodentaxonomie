import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { buildApp } from '../src/app.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIST_DATA = path.join(ROOT, 'dist-data');

type Tool = { name: string; description?: string; inputSchema: { properties?: Record<string, unknown> } };

describe('Schlussreview-Fixwelle: MCP folgt dem eigenen Leitfaden', () => {
  let app: FastifyInstance;
  let client: Client;
  let tools: Tool[];

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
        llmRateLimitPerMin: 100,
        llmTimeoutMs: 5000,
        llmCacheMax: 100,
        llmCacheTtlMs: 60000
      }
    });
    const baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
    client = new Client({ name: 'fmt-fixwelle-test', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', baseUrl)));
    tools = (await client.listTools()).tools as Tool[];
  });
  afterAll(async () => {
    await client.close();
    await app.close();
  });

  const ok = async (name: string, args: Record<string, unknown>) => {
    const res = await client.callTool({ name, arguments: args });
    const text = (res.content as Array<{ text: string }>)[0].text;
    expect(res.isError, text.slice(0, 400)).toBeFalsy();
    return JSON.parse(text);
  };
  const tool = (name: string) => tools.find((t) => t.name === name)!;
  const props = (name: string) => tool(name).inputSchema.properties || {};

  describe('I1: fach-und-thema → fach und thema gilt auch für match_scenario', () => {
    const rahmen = { text: 'Stunde planen', zielart: 'konzepte', bildungsstufe: 'sek1', gruppe: 24, raum: 'klassenraum', zeitMin: 45 };

    it('match_scenario nimmt fach an; mit fach und thema fehlt fach-und-thema nicht mehr', async () => {
      expect(props('match_scenario').fach).toBeDefined();
      const ohne = await ok('match_scenario', { ...rahmen, modus: 'ablauf' });
      expect(ohne.pflichtangaben.fehlt).toContain('fach-und-thema');
      const mit = await ok('match_scenario', { ...rahmen, modus: 'ablauf', fach: 'Mathematik', thema: 'Bruchrechnen' });
      expect(mit.pflichtangaben.fehlt).not.toContain('fach-und-thema');
      expect(mit.kriterien.fachbereich).toBe('mathe-informatik');
    });

    it('REST /match nimmt fach genauso an (POST und GET)', async () => {
      const post = await app.inject({ method: 'POST', url: '/api/v1/match', payload: { ...rahmen, modus: 'ablauf', fach: 'Mathematik', thema: 'Bruchrechnen' } });
      expect(post.statusCode).toBe(200);
      expect(post.json().pflichtangaben.fehlt).not.toContain('fach-und-thema');
      const get = await app.inject({ method: 'GET', url: '/api/v1/match?text=Stunde%20planen&fach=Mathematik&thema=Bruchrechnen' });
      expect(get.statusCode).toBe(200);
      expect(get.json().pflichtangaben.fehlt).not.toContain('fach-und-thema');
    });

    it('ein Fach, das der Wortschatz nicht kennt, ersetzt keinen ausdrücklich gesetzten Fachbereich', async () => {
      const r = await ok('match_scenario', { ...rahmen, fach: 'Mathematik', fachbereich: 'sprachen', thema: 'Bruchrechnen' });
      expect(r.kriterien.fachbereich).toBe('sprachen');
    });

    it('der Leitfaden mit match_scenario endet: classify → fehlt → Felder nachreichen → fehlt leer', async () => {
      const text = 'Ich möchte eine Stunde planen';
      const cls = await ok('classify_scenario_text', { text });
      const fehlt: string[] = cls.pflichtangaben.fehlt;
      expect(fehlt.length).toBeGreaterThan(0);
      // Answers of the user, mapped as the guide says (ziel → zielart, fach-und-thema → fach und thema, …).
      const antworten: Record<string, Record<string, unknown>> = {
        ziel: { zielart: 'konzepte' },
        'fach-und-thema': { fach: 'Mathematik', thema: 'Bruchrechnen' },
        bildungsstufe: { bildungsstufe: 'sek1' },
        anzahl: { gruppe: 24 },
        raum: { raum: 'klassenraum' },
        zeit: { zeitMin: 45 }
      };
      const felder = Object.assign({}, ...fehlt.map((f) => antworten[f]));
      for (const name of ['match_scenario', 'build_scenario_plan']) {
        const r = await ok(name, { text, ...felder });
        expect(r.pflichtangaben.fehlt, name).toEqual([]);
      }
    });

    it('match_scenario fragt nicht nach Teilgruppen (kein Feld dafür), sondern verweist auf adapt_scenario und build_scenario_plan', () => {
      const d = tool('match_scenario').description || '';
      const erfrage = d.slice(d.indexOf('Erfrage beim Nutzer:'));
      expect(erfrage).not.toMatch(/Teilgruppen mit/);
      expect(d).toContain('adapt_scenario');
      expect(d).toContain('build_scenario_plan');
    });
  });

  describe('Minor 1: ohneMethode ist beschrieben', () => {
    it('adapt_scenario erklärt ohneMethode und liest hilfe nicht als Hilfe in derselben Methode', () => {
      const d = tool('adapt_scenario').description || '';
      expect(d).toContain('ohneMethode');
      expect(d).not.toContain('Hilfe in derselben Methode');
    });
  });

  describe('Gap 8: elaborate_scenario nimmt die übrigen REST-Felder an', () => {
    it('text, entwurfTeilgruppen, differenzierung, phasen und materialien stehen im Schema', () => {
      const p = props('elaborate_scenario');
      for (const f of ['text', 'entwurfTeilgruppen', 'differenzierung', 'phasen', 'materialien']) expect(p[f], f).toBeDefined();
    });

    it('der Entwurf ist derselbe wie bei REST /assistant/elaborate (mode briefing)', async () => {
      const plan = await ok('build_scenario_plan', { text: 'Biologie Klasse 7, Fotosynthese, 45 Minuten', umfang: 'voll' });
      const arrangement = plan.maschinenlesbar.arrangement ?? plan.maschinenlesbar;
      const extra = {
        text: 'Ausbildungsbetrieb, Biologie Klasse 7',
        entwurfTeilgruppen: [{ id: 'daz', gruppe: 'DaZ', anzahl: 4 }],
        differenzierung: [{ id: 'daz', gruppe: 'DaZ', anzahl: 4, matrixMassnahmen: ['Wortspeicher an der Tafel'] }],
        materialien: [{ titel: 'Arbeitsblatt Blattquerschnitt', typ: 'arbeitsblatt' }]
      };
      const mcp = await ok('elaborate_scenario', { arrangement, fach: 'Biologie', thema: 'Fotosynthese', ...extra });
      const rest = await app.inject({
        method: 'POST',
        url: '/api/v1/assistant/elaborate',
        payload: { mode: 'briefing', arrangement, fach: 'Biologie', thema: 'Fotosynthese', ...extra }
      });
      expect(rest.statusCode).toBe(200);
      expect(mcp.entwurf).toEqual(rest.json().entwurf);
      expect(JSON.stringify(mcp.entwurf)).toContain('DaZ');
    });
  });
});

describe('Schlussreview-Fixwelle: die Seite /api-mcp lädt auch direkt (SPA-Fallback)', () => {
  it('GET /api-mcp liefert die App, GET /api/… ohne Route bleibt 404 mit JSON', async () => {
    const webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fmt-web-'));
    fs.writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><title>FMT</title><div id="root"></div>');
    const app = await buildApp({
      distDataDir: DIST_DATA,
      webDistDir: webDir,
      config: {
        port: 0,
        host: '127.0.0.1',
        corsOrigin: '*',
        llmBaseUrl: '',
        llmModel: '',
        llmApiKey: '',
        llmAllowByok: false,
        llmRateLimitPerMin: 100,
        llmTimeoutMs: 5000,
        llmCacheMax: 100,
        llmCacheTtlMs: 60000
      }
    });
    try {
      const seite = await app.inject({ method: 'GET', url: '/api-mcp' });
      expect(seite.statusCode).toBe(200);
      expect(seite.headers['content-type']).toContain('text/html');
      expect(seite.body).toContain('<div id="root">');
      const fehlt = await app.inject({ method: 'GET', url: '/api/v1/gibt-es-nicht' });
      expect(fehlt.statusCode).toBe(404);
      expect(fehlt.json().fehler).toBeTruthy();
    } finally {
      await app.close();
      fs.rmSync(webDir, { recursive: true, force: true });
    }
  });
});
