import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ZAHL_GRENZEN } from '@fmt/core';
import { buildApp } from '../src/app.js';
import { KATALOG_FILTER_SCHLUESSEL, filterInUrl } from '../../web/src/data/katalogFilter.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIST_DATA = path.join(ROOT, 'dist-data');

type Tool = { name: string; inputSchema: { properties?: Record<string, Record<string, unknown>> } };

describe('Eingaben prüfen: REST und MCP (Task A1, Lücken R03, R06, R07, R11–R17)', () => {
  let app: FastifyInstance;
  let client: Client;
  let tools: Tool[];
  let dichte: Record<string, unknown>;
  let felder: Array<{ feld: string; werte?: Array<{ code: string; label: string }> }>;

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
    client = new Client({ name: 'fmt-eingaben-test', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', baseUrl)));
    tools = (await client.listTools()).tools as Tool[];
    dichte = (await app.inject({ method: 'GET', url: '/beispiele/dichte-reihe.jsonld' })).json();
    felder = (await app.inject({ method: 'GET', url: '/api/v1/fields' })).json();
  });
  afterAll(async () => {
    await client.close();
    await app.close();
  });

  const codesOf = (feld: string) => felder.find((f) => f.feld === feld)!.werte!.map((w) => w.code);
  const labelOf = (feld: string, code: string) => felder.find((f) => f.feld === feld)!.werte!.find((w) => w.code === code)!.label;
  const get = (url: string) => app.inject({ method: 'GET', url });
  const post = (url: string, payload: unknown) => app.inject({ method: 'POST', url, payload: payload as Record<string, unknown> });
  const call = async (name: string, args: Record<string, unknown>) => {
    const res = await client.callTool({ name, arguments: args });
    const text = (res.content as Array<{ text: string }>)[0].text;
    return { isError: Boolean(res.isError), text };
  };
  const props = (name: string) => tools.find((t) => t.name === name)!.inputSchema.properties || {};
  /** 400 with a message naming the field and, for codes, the allowed values. */
  const expect400 = (res: { statusCode: number; json: () => { fehler?: string; erlaubt?: string[] } }, feld: RegExp, erlaubt?: string) => {
    expect(res.statusCode, JSON.stringify(res.json())).toBe(400);
    expect(res.json().fehler).toMatch(feld);
    if (erlaubt) expect(res.json().erlaubt).toContain(erlaubt);
  };

  describe('GET /api/v1/methods (R03, R06, R07)', () => {
    it('unbekannte Codes ergeben 400 mit den erlaubten Werten', async () => {
      expect400(await get('/api/v1/methods?raum=mondbasis'), /Feld „raum“: unbekannter Wert „mondbasis“/, 'klassenraum');
      expect400(await get('/api/v1/methods?lernort=mondbasis'), /Feld „lernort“/, 'klassenraum');
      expect400(await get('/api/v1/methods?bildungsstufe=quatsch'), /Feld „bildungsstufe“/, 'sek1');
      expect400(await get('/api/v1/methods?eintragsart=quatsch'), /Feld „eintragsart“/, 'hilfe');
      expect400(await get('/api/v1/methods?minEvidenz=Z'), /Feld „minEvidenz“/, 'A');
      expect400(await get('/api/v1/methods?maxTechnik=quatsch'), /Feld „maxTechnik“/, 't-keine');
      expect400(await get('/api/v1/methods?lernfunktion=erwerb,quatsch'), /Feld „lernfunktion“: unbekannter Wert „quatsch“/);
      expect400(await get('/api/v1/methods?weltbezug=quatsch'), /Feld „weltbezug“/);
      expect400(await get('/api/v1/methods?status=quatsch'), /Feld „status“/, 'kuratiert');
      expect400(await get('/api/v1/methods?schriftbedarf=quatsch'), /Feld „schriftbedarf“/, 'lesen');
      expect400(await get('/api/v1/methods?ohneRaumbedarf=quatsch'), /Feld „ohneRaumbedarf“/);
    });

    it('unbekannte Parameter ergeben 400 und werden genannt', async () => {
      const r = await get('/api/v1/methods?foo=bar&zielart=konzepte&text=quiz');
      expect(r.statusCode).toBe(400);
      expect(r.json().fehler).toMatch(/foo/);
      expect(r.json().fehler).toMatch(/zielart/);
      expect(r.json().fehler).not.toMatch(/„text“/);
      expect(r.json().erlaubt).toContain('text');
      expect(r.json().erlaubt).toContain('limit');
    });

    it('unlesbare Zahlen ergeben 400', async () => {
      expect400(await get('/api/v1/methods?termine=abc'), /Feld „termine“: erwartet wird eine ganze Zahl ab 0/);
      expect400(await get('/api/v1/methods?gruppe=-3'), /Feld „gruppe“/);
      expect400(await get('/api/v1/methods?maxDauer=viel'), /Feld „maxDauer“/);
      expect400(await get('/api/v1/methods?limit=abc'), /Feld „limit“: erwartet wird eine ganze Zahl ab 1/);
      expect400(await get('/api/v1/methods?limit=0'), /Feld „limit“/);
      expect400(await get('/api/v1/methods?offset=-1'), /Feld „offset“/);
    });

    it('limit und offset blättern; anzahl bleibt die Zahl aller Treffer', async () => {
      const alle = (await get('/api/v1/methods')).json();
      expect(alle.treffer.length).toBe(alle.anzahl);
      const eins = await get('/api/v1/methods?limit=1');
      expect(eins.statusCode).toBe(200);
      expect(eins.json().anzahl).toBe(alle.anzahl);
      expect(eins.json().treffer).toHaveLength(1);
      expect(eins.json().treffer[0].kennung).toBe(alle.treffer[0].kennung);
      const zweite = (await get('/api/v1/methods?limit=2&offset=1')).json();
      expect(zweite.treffer.map((b: { kennung: string }) => b.kennung)).toEqual(alle.treffer.slice(1, 3).map((b: { kennung: string }) => b.kennung));
      expect(zweite.anzahl).toBe(alle.anzahl);
    });

    it('alle bisher gültigen Parameter wirken weiter (Aliase, Fach, Schalter)', async () => {
      const raum = (await get('/api/v1/methods?raum=klassenraum')).json();
      const lernort = await get('/api/v1/methods?lernort=klassenraum');
      expect(lernort.statusCode).toBe(200);
      expect(lernort.json().anzahl).toBe(raum.anzahl);
      for (const q of [
        'fach=Physik',
        'ohneSchrift=lesen',
        'ohneSchrift=true',
        'ohneInternet=true&ohneKI=1',
        'fachbereich=uebergreifend',
        'fuerFachbereich=nawi-technik',
        'schriftbedarf=lesen',
        'vorhanden=' + codesOf('vorhanden')[0],
        'vorwissen=' + codesOf('vorwissen')[0],
        'maxVorbereitung=10',
        'kategorie=x'
      ]) {
        const r = await get('/api/v1/methods?' + q);
        expect(r.statusCode, q + ' ' + r.body.slice(0, 200)).toBe(200);
      }
    });

    it('die URL-Parameter des Katalogs der Web-App bleiben gültig (katalogFilter.ts)', async () => {
      const first = (feld: string) => codesOf(feld)[0];
      const filter: Record<string, unknown> = {
        text: 'quiz',
        ansatz: first('ansatz'),
        lernfunktion: first('lernfunktion'),
        reichweite: first('reichweite'),
        liefert: first('liefert'),
        minEvidenz: 'B',
        status: 'kuratiert',
        bildungsstufe: 'sek1',
        fuerFachbereich: first('fachbereich'),
        eintragsart: 'methode',
        anleitung: first('anleitung'),
        engagement: first('engagement'),
        interaktion: first('interaktion'),
        raumzeit: first('raumzeit'),
        maxTechnik: 't-keine',
        raum: 'klassenraum',
        raumbedarf: first('raumBietet'),
        ohneRaumbedarf: first('raumBietet'),
        maxDauer: 30,
        gruppe: 20,
        termine: 2,
        ohneKI: true,
        ohneSchrift: ['lesen', 'schreiben']
      };
      expect(Object.keys(filter).sort()).toEqual([...KATALOG_FILTER_SCHLUESSEL].sort());
      const r = await get('/api/v1/methods?' + filterInUrl(filter).toString());
      expect(r.statusCode, r.body.slice(0, 300)).toBe(200);
    });
  });

  describe('POST /adapt, /differentiation/score, /replacements (R03, R15, R16)', () => {
    it('/adapt prüft raum oben und in anfrage und kennt unbekannte Bausteine', async () => {
      expect400(await post('/api/v1/adapt', { scenarioText: 'Stunde', raum: 'mondbasis' }), /Feld „raum“: unbekannter Wert/, 'klassenraum');
      expect400(await post('/api/v1/adapt', { scenarioText: 'Stunde', anfrage: { raum: 'mondbasis' } }), /Feld „raum“/, 'klassenraum');
      expect400(await post('/api/v1/adapt', { scenarioText: 'Stunde', anfrage: { zielart: 'quatsch' } }), /Feld „zielart“/);
      expect400(await post('/api/v1/adapt', { scenarioText: 'Stunde', raumBietet: ['quatsch'] }), /Feld „raumBietet“/);
      expect400(await post('/api/v1/adapt', { baustein: 'gibtsnicht' }), /Unbekannter Baustein „gibtsnicht“/);
      expect400(await post('/api/v1/adapt', { scenarioText: 'Stunde', maxTechnik: 'quatsch' }), /Feld „maxTechnik“: unbekannter Wert „quatsch“/, 't-keine');
      const ok = await post('/api/v1/adapt', { baustein: 'gruppenpuzzle', raum: 'klassenraum', anfrage: { termine: 1 } });
      expect(ok.statusCode).toBe(200);
    });

    it('/differentiation/score prüft Codes, Typen und den Baustein', async () => {
      const url = '/api/v1/differentiation/score';
      expect400(await post(url, { quickProfileId: 'daz', raum: 'mondbasis' }), /Feld „raum“/, 'klassenraum');
      expect400(await post(url, { quickProfileId: 'quatsch' }), /Feld „quickProfileId“/, 'daz');
      expect400(await post(url, { personaId: 'quatsch' }), /Feld „personaId“/, 'average');
      expect400(await post(url, { quickProfileId: 'daz', maxAufwand: 'quatsch' }), /Feld „maxAufwand“/, 'sofort');
      expect400(await post(url, { quickProfileId: 'daz', ebenen: ['quatsch'] }), /Feld „ebenen“/, 'unterricht-sofort');
      expect400(await post(url, { quickProfileId: 'daz', zieltyp: 'quatsch' }), /Feld „zieltyp“/);
      expect400(await post(url, { quickProfileId: 'daz', maxTechnik: 'quatsch' }), /Feld „maxTechnik“/);
      expect400(await post(url, { quickProfileId: 'daz', bildungsstufe: 'quatsch' }), /Feld „bildungsstufe“/);
      expect400(await post(url, { selectedValues: 'x' }), /Feld „selectedValues“/);
      expect400(await post(url, { quickProfileId: 'daz', limit: 'x' }), /Feld „limit“/);
      expect400(await post(url, { quickProfileId: 'daz', minScore: 'x' }), /Feld „minScore“/);
      expect400(await post(url, { quickProfileId: 'daz', baustein: 'gibtsnicht' }), /Unbekannter Baustein „gibtsnicht“/);
      const ok = await post(url, { quickProfileId: 'daz', baustein: 'gruppenpuzzle', ebenen: ['unterricht-sofort'], maxAufwand: 'kurz', limit: 5 });
      expect(ok.statusCode).toBe(200);
    });

    it('/replacements prüft die Situation oben und in situation', async () => {
      const base = { arrangement: dichte, pfad: '/ablauf/haupt/teile/1' };
      expect400(await post('/api/v1/replacements', { ...base, raum: 'mondbasis' }), /Feld „raum“/, 'klassenraum');
      expect400(await post('/api/v1/replacements', { ...base, situation: { raum: 'mondbasis' } }), /Feld „raum“/, 'klassenraum');
      expect400(await post('/api/v1/replacements', { ...base, situation: { maxTechnik: 'quatsch' } }), /Feld „maxTechnik“/);
      expect((await post('/api/v1/replacements', { ...base, situation: { raum: 'klassenraum', ohneSchrift: true } })).statusCode).toBe(200);
    });
  });

  describe('Assistent: elaborate, briefing, material (R14)', () => {
    it('/assistant/elaborate prüft planungsprofil, bildungsstufe, begleitziel und anzahl', async () => {
      const url = '/api/v1/assistant/elaborate';
      const base = { arrangement: dichte, mode: 'briefing' };
      expect400(await post(url, { ...base, planungsprofil: 'quatsch' }), /Feld „planungsprofil“/, 'schule');
      expect400(await post(url, { ...base, bildungsstufe: 'quatsch' }), /Feld „bildungsstufe“/, 'sek1');
      expect400(await post(url, { ...base, begleitziel: ['quatsch'] }), /Feld „begleitziel“/, 'sprache');
      expect400(await post(url, { ...base, anzahl: 'x' }), /Feld „anzahl“/);
      // Codes and labels stay accepted (the web app sends labels).
      const ok = await post(url, {
        ...base,
        planungsprofil: 'schule',
        bildungsstufe: labelOf('bildungsstufe', 'sek1'),
        begleitziel: [labelOf('begleitziel', 'sprache'), 'sozial'],
        anzahl: 24
      });
      expect(ok.statusCode, ok.body.slice(0, 300)).toBe(200);
    });

    it('/assistant/briefing prüft dieselben Felder für elaborate und material', async () => {
      const url = '/api/v1/assistant/briefing';
      expect400(await post(url, { task: 'elaborate', payload: { arrangement: dichte, bildungsstufe: 'quatsch' } }), /Feld „bildungsstufe“/);
      expect400(await post(url, { task: 'material', payload: { baustein: 'abrufquiz', materialTyp: 'quatsch' } }), /Feld „materialTyp“/, 'quiz');
      expect400(await post(url, { task: 'material', payload: { baustein: 'abrufquiz', planungsprofil: 'quatsch' } }), /Feld „planungsprofil“/);
      expect((await post(url, { task: 'material', payload: { baustein: 'abrufquiz', materialTyp: 'quiz' } })).statusCode).toBe(200);
    });

    it('/assistant/material prüft materialTyp, planungsprofil und bildungsstufe', async () => {
      const url = '/api/v1/assistant/material';
      expect400(await post(url, { baustein: 'abrufquiz', materialTyp: 'quatsch', mode: 'template' }), /Feld „materialTyp“/, 'arbeitsblatt');
      expect400(await post(url, { baustein: 'abrufquiz', planungsprofil: 'quatsch', mode: 'template' }), /Feld „planungsprofil“/);
      expect400(await post(url, { baustein: 'abrufquiz', bildungsstufe: 'quatsch', mode: 'template' }), /Feld „bildungsstufe“/);
      const ok = await post(url, { baustein: 'abrufquiz', bildungsstufe: labelOf('bildungsstufe', 'primar'), materialTyp: 'quiz', mode: 'template' });
      expect(ok.statusCode, ok.body.slice(0, 300)).toBe(200);
    });
  });

  describe('MCP (R11, R12, R13, R16, R17)', () => {
    it('adapt_scenario weist leere Eingaben ab, nimmt text an und kennt unbekannte Bausteine', async () => {
      const leer = await call('adapt_scenario', {});
      expect(leer.isError).toBe(true);
      expect(leer.text).toMatch(/Bitte mindestens scenarioText\/text/);
      expect((await call('adapt_scenario', { text: 'Gruppenarbeit zu Brüchen, 5 DaZ' })).isError).toBe(false);
      const unbekannt = await call('adapt_scenario', { baustein: 'gibtsnicht' });
      expect(unbekannt.isError).toBe(true);
      expect(unbekannt.text).toMatch(/Unbekannter Baustein „gibtsnicht“/);
      expect((await call('adapt_scenario', { scenarioText: 'Stunde', anfrage: { raum: 'mondbasis' } })).isError).toBe(true);
      expect((await call('adapt_scenario', { scenarioText: 'Stunde', anfrage: { lernort: 'klassenraum', termine: 0 } })).isError).toBe(false);
    });

    it('elaborate_scenario prüft das Arrangement auch ohne Server-LLM', async () => {
      const r = await call('elaborate_scenario', { arrangement: { foo: 1 } });
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/gültiges FMT-Arrangement/);
      expect((await call('elaborate_scenario', { arrangement: dichte })).isError).toBe(false);
    });

    it('classify_scenario_text weist leeren Text ab', async () => {
      expect((await call('classify_scenario_text', { text: '' })).isError).toBe(true);
      expect((await call('classify_scenario_text', { text: '   ' })).isError).toBe(true);
    });

    it('score_differentiation_matrix kennt unbekannte Bausteine', async () => {
      const r = await call('score_differentiation_matrix', { quickProfileId: 'daz', baustein: 'gibtsnicht' });
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/Unbekannter Baustein „gibtsnicht“/);
    });

    it('Schemata: Enums aus dem Kern, anfrage als Objekt der Anfragefelder, Zahlgrenzen aus ZAHL_GRENZEN', async () => {
      expect(props('score_differentiation_matrix').maxTechnik.enum).toEqual(codesOf('maxTechnik'));
      expect(props('score_differentiation_matrix').bildungsstufe.enum).toEqual(codesOf('bildungsstufe'));
      expect(props('generate_phase_material').bildungsstufe.enum).toEqual(codesOf('bildungsstufe'));
      const anfrage = props('adapt_scenario').anfrage as { type?: string; properties?: Record<string, { enum?: string[] }> };
      expect(anfrage.type).toBe('object');
      expect(anfrage.properties?.raum.enum).toEqual(codesOf('raum'));
      const min = (tool: string, feld: string) => props(tool)[feld].minimum;
      for (const [tool, feld] of [
        ['search_methods', 'gruppe'],
        ['search_methods', 'termine'],
        ['match_scenario', 'gruppe'],
        ['match_scenario', 'termine'],
        ['match_scenario', 'lehrende'],
        ['build_scenario_plan', 'zeitMin'],
        ['build_scenario_plan', 'gruppe'],
        ['build_scenario_plan', 'termine'],
        ['score_differentiation_matrix', 'lehrende'],
        ['adapt_scenario', 'lehrende']
      ] as const) {
        expect(min(tool, feld), `${tool}.${feld}`).toBe(ZAHL_GRENZEN[feld].min);
      }
      expect(props('build_scenario_plan').zeitMin.maximum).toBe(ZAHL_GRENZEN.zeitMin.max);
    });
  });
});
