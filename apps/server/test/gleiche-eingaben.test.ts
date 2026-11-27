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

describe('Gleiche Eingaben: REST und MCP (Task A3, Lücken R22, R23, R24)', () => {
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
    client = new Client({ name: 'fmt-gleiche-eingaben-test', version: '1.0.0' });
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
  const reflexion = (r: { entwurf: { kernfelder: Array<{ id: string; inhalt: string }> } }) => r.entwurf.kernfelder.find((k) => k.id === 'reflexion')!.inhalt;

  describe('Regelmeldungen im Entwurf (R22)', () => {
    const planText = 'Klasse 1 Sachunterricht Pflanzen, 20 Kinder können noch nicht lesen, 45 Minuten';
    let plan: { arrangement: Record<string, unknown>; regelmeldungen: Array<{ regel: string; text: string; quelle?: string }>; hinweise: string[] };
    beforeAll(async () => {
      const voll = (await post('/api/v1/plan', { text: planText })).json();
      plan = { ...voll, arrangement: voll.maschinenlesbar.arrangement };
    });

    it('elaborate (REST, briefing) nimmt regelmeldungen in der Form des Plans an und nennt Regel, Wirkung und Grundlage', async () => {
      expect(plan.regelmeldungen.length).toBeGreaterThan(0);
      const m = plan.regelmeldungen[0];
      const res = await post('/api/v1/assistant/elaborate', { mode: 'briefing', arrangement: plan.arrangement, hinweiseListe: plan.hinweise, regelmeldungen: plan.regelmeldungen });
      expect(res.statusCode).toBe(200);
      const r = reflexion(res.json());
      expect(r).toContain('- **Regelmeldungen:**');
      expect(r).toMatch(new RegExp(`${m.text.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*\\(Regel: .+ · Wirkung: .+ · Grundlage: .+\\)`));
      // The same message is not listed again as a plain note.
      expect(r.split(m.text).length - 1).toBe(1);
    });

    it('elaborate_scenario (MCP) gibt denselben Entwurf wie REST', async () => {
      const args = { arrangement: plan.arrangement, hinweiseListe: plan.hinweise, regelmeldungen: plan.regelmeldungen };
      const rest = (await post('/api/v1/assistant/elaborate', { mode: 'briefing', ...args })).json();
      const mcp = await call('elaborate_scenario', args);
      expect(mcp.isError).toBe(false);
      expect(mcp.json().entwurf).toEqual(rest.entwurf);
    });

    it('der Entwurf des Plans (umfang voll) nennt die Regelmeldungen ebenso', async () => {
      const voll = (await post('/api/v1/plan', { text: planText, umfang: 'voll' })).json();
      expect(reflexion(voll)).toContain('- **Regelmeldungen:**');
    });

    it('eine Regelmeldung mit unbekannter Wirkung wird abgewiesen (REST 400 mit erlaubt)', async () => {
      const res = await post('/api/v1/assistant/elaborate', {
        mode: 'briefing',
        arrangement: plan.arrangement,
        regelmeldungen: [{ ...plan.regelmeldungen[0], wirkung: 'droht' }]
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().fehler).toContain('regelmeldungen.wirkung');
      expect(res.json().erlaubt).toEqual(expect.arrayContaining(['warnt', 'schliesst-aus']));
      const ohneText = await post('/api/v1/assistant/elaborate', { mode: 'briefing', arrangement: plan.arrangement, regelmeldungen: [{ regel: 'x' }] });
      expect(ohneText.statusCode).toBe(400);
      const mcp = await call('elaborate_scenario', { arrangement: plan.arrangement, regelmeldungen: [{ ...plan.regelmeldungen[0], wirkung: 'droht' }] });
      expect(mcp.isError).toBe(true);
    });
  });

  describe('elaborate_scenario nimmt die Felder von REST an (R23)', () => {
    it('planungsprofilAngenommen erscheint im Entwurf wie bei REST', async () => {
      const args = { arrangement: dichte, planungsprofil: 'schule', planungsprofilAngenommen: true };
      const mcp = (await call('elaborate_scenario', args)).json();
      const rest = (await post('/api/v1/assistant/elaborate', { mode: 'briefing', ...args })).json();
      expect(mcp.entwurf.planungsprofil.angenommen).toBe(true);
      expect(mcp.entwurf).toEqual(rest.entwurf);
    });

    it('oerRessourcen mit url, lizenz und notiz, ohne wwwurl', async () => {
      const oer = { titel: 'Freies Arbeitsblatt', url: 'https://example.org/blatt', lizenz: 'CC BY 4.0', notiz: 'für alle' };
      const mcp = await call('elaborate_scenario', { arrangement: dichte, oerRessourcen: [oer] });
      expect(mcp.isError).toBe(false);
      const rest = (await post('/api/v1/assistant/elaborate', { mode: 'briefing', arrangement: dichte, oerRessourcen: [oer] })).json();
      expect(mcp.json().thematischeTabelle).toEqual(rest.thematischeTabelle);
      expect(mcp.json().thematischeTabelle[0].materialsAndOer).toContain('https://example.org/blatt');
    });
  });

  describe('lernort, situation und genannt wie bei REST (R24)', () => {
    it('score_differentiation_matrix nimmt lernort und das Objekt situation an wie REST /differentiation/score', async () => {
      for (const args of [
        { quickProfileId: 'daz', baustein: 'gruppenpuzzle', lernort: 'klassenraum' },
        { quickProfileId: 'daz', baustein: 'gruppenpuzzle', situation: { raum: 'klassenraum', termine: 1 } }
      ]) {
        const rest = (await post('/api/v1/differentiation/score', args)).json();
        const mcp = await call('score_differentiation_matrix', args);
        expect(mcp.isError, JSON.stringify(args)).toBe(false);
        // The situation decides the parallel methods; both check it the same way.
        expect(mcp.json().alternativeMethoden).toEqual(rest.alternativeMethoden);
        expect(mcp.json().alternativenPruefung).toEqual(rest.alternativenPruefung);
      }
      const bad = await call('score_differentiation_matrix', { quickProfileId: 'daz', situation: { raum: 'mond' } });
      expect(bad.isError).toBe(true);
      const badRest = await post('/api/v1/differentiation/score', { quickProfileId: 'daz', lernort: 'mond' });
      expect(badRest.statusCode).toBe(400);
      expect((await call('score_differentiation_matrix', { quickProfileId: 'daz', lernort: 'mond' })).isError).toBe(true);
    });

    it('adapt_scenario nimmt lernort an wie REST /adapt', async () => {
      const args = { baustein: 'gruppenpuzzle', lerngruppenText: '24 Kinder, 4 DaZ', lernort: 'klassenraum' };
      const rest = (await post('/api/v1/adapt', args)).json();
      const mcp = await call('adapt_scenario', args);
      expect(mcp.isError).toBe(false);
      expect(ohneZeit(mcp.json())).toEqual(ohneZeit(rest));
      // lernort is checked as raum, with the same message.
      const badArgs = { baustein: 'gruppenpuzzle', lerngruppenText: '24 Kinder, 4 DaZ', lernort: 'mond' };
      const badRest = await post('/api/v1/adapt', badArgs);
      expect(badRest.statusCode).toBe(400);
      const badMcp = await call('adapt_scenario', badArgs);
      expect(badMcp.isError).toBe(true);
      expect(badMcp.text).toContain('lernort');
    });

    it('suggest_replacements nimmt lernort an, oben und im Objekt situation', async () => {
      for (const extra of [{ lernort: 'klassenraum' }, { situation: { lernort: 'klassenraum' } }]) {
        const args = { arrangement: dichte, pfad: '/ablauf/haupt/teile/1', ...extra };
        const rest = (await post('/api/v1/replacements', args)).json();
        const mcp = await call('suggest_replacements', args);
        expect(mcp.isError).toBe(false);
        expect(mcp.json()).toEqual(rest);
        expect(mcp.json().situation).toEqual({ lernort: 'klassenraum' });
      }
    });

    it('build_scenario_plan nimmt gruppen[].genannt an wie REST /plan', async () => {
      const args = {
        text: 'Physik Klasse 8 Hebelgesetz, 24 Lernende, 45 Minuten',
        umfang: 'kompakt',
        gruppen: [
          { id: 'regel', label: 'Regelgruppe', count: 20 },
          { id: 'daz', label: 'DaZ', count: 4, personaId: 'languageAndCulture', genannt: ['sprachkompetenz-gering'] }
        ]
      };
      const rest = (await post('/api/v1/plan', args)).json();
      const mcp = await call('build_scenario_plan', args);
      expect(mcp.isError).toBe(false);
      expect(ohneZeit(mcp.json())).toEqual(ohneZeit(rest));
      expect(tool('build_scenario_plan').inputSchema.properties!.gruppen).toBeTruthy();
      expect(JSON.stringify(tool('build_scenario_plan').inputSchema.properties!.gruppen)).toContain('genannt');
    });

    it('der andere Standard von umfang (REST voll, MCP kompakt) steht in der Beschreibung', () => {
      const umfang = tool('build_scenario_plan').inputSchema.properties!.umfang.description || '';
      expect(umfang).toMatch(/REST \/plan.*voll/);
    });
  });

  describe('Folgepunkte aus der Prüfung von A2', () => {
    it('Ersatz: ausgeschlossen höchstens 20 Einträge, ausgeschlossenGesamt nennt alle (REST und MCP)', async () => {
      const args = { arrangement: dichte, pfad: '/ablauf/haupt/teile/1', raum: 'klassenraum', ohneSchrift: ['lesen', 'schreiben'] };
      const rest = (await post('/api/v1/replacements', args)).json();
      expect(rest.ausgeschlossen.length).toBe(20);
      expect(rest.ausgeschlossenGesamt).toBeGreaterThan(20);
      const mcp = (await call('suggest_replacements', args)).json();
      expect(mcp).toEqual(rest);
    });

    it('/meta trägt anfrageFelder und differenzierungsPersonas wie list_vocabularies', async () => {
      const meta = (await get('/api/v1/meta')).json();
      const vok = (await call('list_vocabularies', {})).json();
      expect(meta.anfrageFelder.length).toBeGreaterThan(10);
      expect(meta.anfrageFelder).toEqual(vok.anfrageFelder);
      expect(meta.differenzierungsPersonas).toEqual(vok.differenzierungsPersonas);
      for (const k of ['wfelder', 'arten', 'merkmale', 'ketten', 'regeln', 'planungsprofile', 'teilgruppen', 'raumtypen', 'zielarten', 'methoden', 'hilfen'])
        expect(meta[k], k).toEqual(vok[k]);
    });

    it('match_scenario nennt in der Beschreibung fach als Objekt und erkanntesFach, erkanntesThema', () => {
      expect(tool('match_scenario').description).toMatch(/erkanntesFach/);
      expect(tool('match_scenario').description).toMatch(/erkanntesThema/);
    });
  });
});
