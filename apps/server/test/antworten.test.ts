import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { PFLICHTANGABEN_NAMEN } from '@fmt/core';
import { buildApp } from '../src/app.js';
import { importScenarioProjectJson } from '../../web/src/planner/scenarioStorage.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIST_DATA = path.join(ROOT, 'dist-data');

type Tool = { name: string; description?: string };
type Prompt = { name: string };

describe('Lesbare und gleiche Antworten: REST und MCP (Task A2, Lücken R01, R04, R09, R10, R20, R21, R25, R26)', () => {
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
    client = new Client({ name: 'fmt-antworten-test', version: '1.0.0' });
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
  /** The parts of an answer that differ between two calls (time). */
  const ohneZeit = (x: Record<string, unknown>) => {
    const { dauerMs: _d, ...rest } = x;
    return rest;
  };

  describe('Pflichtangaben mit lesbaren Namen (R04)', () => {
    it('der Kern nennt jede Pflichtangabe mit Namen', () => {
      expect(PFLICHTANGABEN_NAMEN).toEqual({
        ziel: 'Ziel',
        'fach-und-thema': 'Fach und Thema',
        bildungsstufe: 'Bildungsstufe',
        anzahl: 'Anzahl der Lernenden',
        raum: 'Raum',
        zeit: 'Zeit'
      });
    });

    it('empfohlenerNaechsterSchritt nennt die Namen, keine Codes', async () => {
      const r = (await call('classify_scenario_text', { text: 'Mathe Bruchrechnen' })).json();
      expect(r.pflichtangaben.fehlt.length).toBeGreaterThan(0);
      for (const f of r.pflichtangaben.fehlt as Array<keyof typeof PFLICHTANGABEN_NAMEN>) {
        expect(r.empfohlenerNaechsterSchritt).toContain(PFLICHTANGABEN_NAMEN[f]);
      }
      expect(r.empfohlenerNaechsterSchritt).not.toMatch(/fach-und-thema|anzahl/);
    });
  });

  describe('Methoden: Treffer und Eintrag (R09, R10)', () => {
    it('REST /methods/:kennung trägt eintragsart, evidenzgrad und einordnung wie get_method', async () => {
      const rest = (await get('/api/v1/methods/gruppenpuzzle')).json();
      const mcp = (await call('get_method', { kennung: 'gruppenpuzzle' })).json();
      expect(rest.eintragsart).toBe('methode');
      expect(rest.evidenzgrad).toMatch(/^[ABC]$/);
      expect(Array.isArray(rest.einordnung)).toBe(true);
      expect(rest.einordnung.length).toBeGreaterThan(0);
      expect(rest).toEqual(mcp);
    });

    it('REST /methods: jeder Treffer trägt eintragsart und evidenzgrad und behält den vollen Eintrag', async () => {
      const r = (await get('/api/v1/methods?text=gruppenpuzzle&limit=3')).json();
      expect(r.treffer.length).toBeGreaterThan(0);
      for (const t of r.treffer) {
        expect(['methode', 'hilfe']).toContain(t.eintragsart);
        expect('evidenzgrad' in t).toBe(true);
        expect(Array.isArray(t.durchfuehrung)).toBe(true);
      }
    });

    it('search_methods: Treffer tragen Eignung, Evidenzbezug, Gruppe, Technik und eine kurze Einordnung wie REST', async () => {
      const mcp = (await call('search_methods', { text: 'gruppenpuzzle', limit: 3 })).json();
      const rest = (await get('/api/v1/methods?text=gruppenpuzzle&limit=3')).json();
      const t = mcp.treffer.find((x: { kennung: string }) => x.kennung === 'gruppenpuzzle');
      expect(t).toBeTruthy();
      for (const feld of ['fachbereichUngeeignet', 'ungeeignetBeiStufe', 'ungeeignetBeiVorwissen', 'evidenzBezug', 'gruppeMin', 'gruppeMax', 'technik', 'einordnung']) {
        expect(t, feld).toHaveProperty(feld);
      }
      expect(t.einordnung.length).toBeGreaterThan(0);
      expect(Object.keys(t.einordnung[0]).sort()).toEqual(['kette', 'schritt']);
      // Same hit builder: every field of the MCP hit has the same value in the REST hit.
      const r = rest.treffer.find((x: { kennung: string }) => x.kennung === 'gruppenpuzzle');
      for (const [k, v] of Object.entries(t)) expect(r[k], k).toEqual(v);
    });

    it('eine Methode mit eignungsgrund nennt ihn im Treffer', async () => {
      const mcp = (await call('search_methods', { limit: 100 })).json();
      expect(mcp.treffer.some((x: { eignungsgrund?: unknown }) => x.eignungsgrund)).toBe(true);
    });
  });

  describe('Ersatzkandidaten (R20)', () => {
    const base = () => ({ arrangement: dichte, pfad: '/ablauf/haupt/teile/1' });

    it('jeder Kandidat nennt seinen Bedarf; ausgeschlossen nennt Baustein, Merkmal und Grund', async () => {
      const r = (await post('/api/v1/replacements', { ...base(), raum: 'klassenraum', ohneSchrift: ['lesen', 'schreiben'], termine: 1 })).json();
      expect(r.kandidaten.length).toBeGreaterThan(0);
      for (const k of r.kandidaten) {
        expect(Array.isArray(k.raumbedarf)).toBe(true);
        expect(Array.isArray(k.schriftbedarf)).toBe(true);
      }
      expect(r.ausgeschlossen.length).toBeGreaterThan(0);
      for (const a of r.ausgeschlossen) {
        expect(typeof a.baustein).toBe('string');
        expect(typeof a.merkmal).toBe('string');
        expect(typeof a.grund).toBe('string');
      }
      expect(r.ausgeschlossen.some((a: { merkmal: string }) => a.merkmal === 'schriftbedarf')).toBe(true);
      // No help in the list: a help never fills a phase and is not a candidate.
      expect(r.ausgeschlossen.some((a: { merkmal: string }) => a.merkmal === 'eintragsart')).toBe(false);
    });

    it('suggest_replacements antwortet gleich wie REST /replacements', async () => {
      const args = { ...base(), raum: 'klassenraum', ohneSchrift: ['lesen'] };
      const rest = (await post('/api/v1/replacements', args)).json();
      const mcp = (await call('suggest_replacements', args)).json();
      expect(mcp).toEqual(rest);
    });
  });

  describe('maschinenlesbar des Plans (R21)', () => {
    const text = 'Mathematik Bruchrechnen Klasse 6, 26 Lernende, 90 Minuten, Sprache nebenbei fördern';

    it('trägt begleitziel, planungsprofil, raum und pflichtangaben.angenommen; schemaVersion 1.6', async () => {
      const p = (await post('/api/v1/plan', { text, raum: 'klassenraum', begleitziel: ['sprache'] })).json();
      const m = p.maschinenlesbar;
      expect(m.schemaVersion).toBe('1.6');
      expect(m.begleitziel).toEqual(['sprache']);
      expect(m.planungsprofil).toBe(p.planungsprofil.id);
      expect(m.raum).toBe('klassenraum');
      expect(m.pflichtangaben.angenommen).toEqual(p.pflichtangaben.angenommen);
    });

    it('ohne Raum steht der angenommene Raum unter pflichtangaben.angenommen, raum bleibt leer', async () => {
      const m = (await post('/api/v1/plan', { text })).json().maschinenlesbar;
      expect(m.raum).toBeNull();
      expect(m.pflichtangaben.angenommen.some((a: { feld: string }) => a.feld === 'raum')).toBe(true);
    });

    it('der Baukasten-Import liest die neuen Felder (1.5) und nimmt die alte Fassung (1.4) weiter an', async () => {
      const plan = (await post('/api/v1/plan', { text, raum: 'klassenraum', begleitziel: ['sprache'] })).json();
      const neu = importScenarioProjectJson(JSON.stringify(plan));
      expect(neu.ok).toBe(true);
      if (neu.ok) {
        expect(neu.project.raum).toBe('klassenraum');
        expect(neu.project.begleitziele).toEqual(['sprache']);
        expect(neu.project.entwurfAngaben?.planungsprofil).toBe(plan.planungsprofil.id);
        expect(neu.project.entwurfAngaben?.begleitziele).toEqual(['sprache']);
      }
      const ohneRaum = (await post('/api/v1/plan', { text })).json();
      const angenommen = importScenarioProjectJson(JSON.stringify(ohneRaum));
      expect(angenommen.ok).toBe(true);
      if (angenommen.ok) {
        expect(angenommen.project.raum).toBeUndefined();
        expect(angenommen.project.entwurfAngaben?.raumAngenommen).toBe(
          ohneRaum.pflichtangaben.angenommen.find((a: { feld: string }) => a.feld === 'raum').wert
        );
      }
      // A plan of the former version carries none of the new fields and still loads.
      const { begleitziel: _b, planungsprofil: _p, raum: _r, pflichtangaben: _a, ...altM } = plan.maschinenlesbar;
      const alt = importScenarioProjectJson(JSON.stringify({ maschinenlesbar: { ...altM, schemaVersion: '1.4' } }));
      expect(alt.ok).toBe(true);
      if (alt.ok) {
        expect(alt.project.arrangement.typ).toBe('Arrangement');
        expect(alt.project.raum).toBeUndefined();
        expect(alt.project.entwurfAngaben).toBeUndefined();
      }
    });
  });

  describe('classify und match: REST wie MCP (R25)', () => {
    it('/classify antwortet wie classify_scenario_text (empfohlenerNaechsterSchritt, leitplanken)', async () => {
      const text = 'Mathe Bruchrechnen';
      const rest = (await post('/api/v1/classify', { text })).json();
      const mcp = (await call('classify_scenario_text', { text })).json();
      expect(rest.empfohlenerNaechsterSchritt).toBeTruthy();
      expect(rest.leitplanken).toBeTruthy();
      expect(ohneZeit(rest)).toEqual(ohneZeit(mcp));
    });

    it('/match antwortet wie match_scenario (Fach, Thema, Matrix-Merkmale, leitplanken, vorschlaegeGesamt, limit)', async () => {
      const anfrage = { text: 'Mathematik Bruchrechnen Klasse 6, 20 Minuten Einstieg, 5 DaZ', modus: 'phase' };
      const rest = (await post('/api/v1/match', { ...anfrage, limit: 3 })).json();
      const mcp = (await call('match_scenario', { ...anfrage, limit: 3 })).json();
      expect(rest.vorschlaege.length).toBeLessThanOrEqual(3);
      expect(rest.vorschlaegeGesamt).toBeGreaterThanOrEqual(rest.vorschlaege.length);
      expect(rest.limit).toBe(3);
      for (const k of ['erkannteMatrixMerkmale', 'leitplanken', 'erkanntesFach', 'erkanntesThema']) expect(rest, k).toHaveProperty(k);
      // fach stays the matcher's field (a recognised subject object, if any); the text reading goes to erkanntesFach.
      expect(typeof rest.fach).not.toBe('string');
      expect(rest.erkanntesFach).toBe('Mathematik');
      expect(ohneZeit(rest)).toEqual(ohneZeit(mcp));
    });

    it('/match ohne limit behält alle Vorschläge (rückwärtskompatibel) und nennt vorschlaegeGesamt', async () => {
      const r = (await get('/api/v1/match?text=Einstieg%2020%20Minuten&modus=phase')).json();
      expect(r.vorschlaegeGesamt).toBe(r.vorschlaege.length);
      expect(r.limit).toBeUndefined();
      expect((await get('/api/v1/match?text=Einstieg&modus=phase&limit=2')).json().vorschlaege.length).toBeLessThanOrEqual(2);
    });

    it('/match weist ein falsches limit ab', async () => {
      const r = await post('/api/v1/match', { text: 'Einstieg', limit: 0 });
      expect(r.statusCode).toBe(400);
      expect(r.json().fehler).toMatch(/Feld „limit“/);
    });

    it('list_vocabularies zählt Methoden und Hilfen wie REST /meta', async () => {
      const meta = (await get('/api/v1/meta')).json();
      const v = (await call('list_vocabularies', {})).json();
      expect(v.methoden).toBe(meta.methoden);
      expect(v.hilfen).toBe(meta.hilfen);
    });
  });

  describe('Texte (R01, R26) und gleiche Fehlermeldung bei elaborate', () => {
    it('adapt_scenario: teilgruppenHilfen, gesperrt und regelmeldungen stehen immer oben, als eigener Satz', () => {
      const d = tools.find((t) => t.name === 'adapt_scenario')!.description!;
      expect(d).toContain('über eine Methode. `teilgruppenHilfen`');
      expect(d).toMatch(/stehen immer auf oberster Ebene/);
    });

    it('Prompt adapt_lesson_differentiation fragt nach Raum und Lehrenden und liest die Antwort wie adapt_scenario', async () => {
      const prompts = (await client.listPrompts()).prompts as Prompt[];
      expect(prompts.some((p) => p.name === 'adapt_lesson_differentiation')).toBe(true);
      const p = await client.getPrompt({ name: 'adapt_lesson_differentiation', arguments: { szenario: 'Gruppenpuzzle Klasse 7', lerngruppe: '5 DaZ' } });
      const text = (p.messages[0].content as { text: string }).text;
      for (const w of ['Raum', 'Lehrende', 'teilgruppenImpulse', 'beleg', 'abbau', 'gesperrt', 'regelmeldungen', 'Gruppen']) expect(text, w).toContain(w);
    });

    it('ein ungültiges Arrangement hat bei REST /assistant/elaborate und elaborate_scenario denselben Text', async () => {
      const rest = await post('/api/v1/assistant/elaborate', { arrangement: { typ: 'Kein' }, mode: 'briefing' });
      const mcp = await call('elaborate_scenario', { arrangement: { typ: 'Kein' } });
      expect(rest.statusCode).toBe(400);
      expect(mcp.isError).toBe(true);
      expect(mcp.json().fehler).toBe(rest.json().fehler);
    });
  });
});
