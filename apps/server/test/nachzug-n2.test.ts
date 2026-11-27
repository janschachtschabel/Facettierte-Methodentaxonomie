import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { buildApp } from '../src/app.js';
import { anpassungsAnfrage } from '../src/kandidaten.js';
import { MCP_HINWEISE } from '@fmt/core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIST_DATA = path.join(ROOT, 'dist-data');
const VERBOTEN = ['Anforderung', 'Bedingungsraum', 'Lernort', 'Ergänzende Merkmale'];

type Tool = { name: string; description?: string; inputSchema: { properties?: Record<string, { enum?: string[]; description?: string; items?: unknown; type?: string }> } };

describe('App-Nachzug N2: MCP auf FMT-2.0-Stand, Hinweise zum Erfragen', () => {
  let app: FastifyInstance;
  let client: Client;
  let baseUrl: string;
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
    baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
    client = new Client({ name: 'fmt-n2-test', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', baseUrl)));
    tools = (await client.listTools()).tools as Tool[];
  });
  afterAll(async () => {
    await client.close();
    await app.close();
  });

  const call = async (name: string, args: Record<string, unknown>) => {
    const res = await client.callTool({ name, arguments: args });
    const text = (res.content as Array<{ text: string }>)[0].text;
    // Schema errors come as plain text from the SDK, tool errors as JSON.
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      json = { fehler: text };
    }
    return { isError: res.isError, json };
  };
  const ok = async (name: string, args: Record<string, unknown>) => {
    const r = await call(name, args);
    expect(r.isError, JSON.stringify(r.json).slice(0, 400)).toBeFalsy();
    return r.json;
  };
  const rest = async (method: 'GET' | 'POST', url: string, payload?: unknown) => {
    const r = await app.inject({ method, url, ...(payload ? { payload: payload as Record<string, unknown> } : {}) });
    return { status: r.statusCode, json: r.json() };
  };
  const tool = (name: string) => tools.find((t) => t.name === name)!;
  const props = (name: string) => tool(name).inputSchema.properties || {};

  describe('Hinweise für die aufrufende KI', () => {
    it('der Server nennt instructions: Pflichtangaben, Rückfrage, Annahmen, keine eigene Methodenwahl, Gruppen statt Einzelner', () => {
      const ins = client.getInstructions() || '';
      expect(ins.length).toBeGreaterThan(200);
      // Short enough to read: rough notes, not a form.
      expect(ins.length).toBeLessThan(2500);
      for (const w of ['pflichtangaben.fehlt', 'pflichtangaben.angenommen', 'Bildungsstufe', 'Fach', 'Thema', 'Zeit', 'Gruppengröße', 'Raum', 'Zielart', 'Vorwissen', 'Sprachniveau', 'Komplexität', 'Teilgruppen', 'Begleitziel', 'Planungsprofil', 'Termine', 'Nachweis', 'Lehrende']) {
        expect(ins, w).toContain(w);
      }
      expect(ins).toMatch(/eine kurze Frage/i);
      expect(ins).toMatch(/keine Methoden? selbst/i);
      expect(ins).toMatch(/Katalog/);
      expect(ins).toMatch(/Gruppen/);
      for (const w of VERBOTEN) expect(ins).not.toContain(w);
    });

    it('die instructions sind der Text aus dem Kern (dieselben Worte wie die Seite API & MCP) und sagen, was ohne Antwort gilt', () => {
      const ins = client.getInstructions() || '';
      expect(ins).toBe(MCP_HINWEISE);
      // The user cannot or will not answer: plan anyway and name the assumptions (N2 review, minor 4).
      expect(ins).toMatch(/Kann oder will der Nutzer nicht antworten, plane trotzdem weiter und nenne die Annahmen aus pflichtangaben\.angenommen/);
    });

    it('die Werkzeuge, die eine Anfrage annehmen, sagen, was beim Nutzer zu erfragen ist', () => {
      for (const n of ['match_scenario', 'build_scenario_plan', 'classify_scenario_text', 'adapt_scenario', 'elaborate_scenario', 'generate_phase_material', 'score_differentiation_matrix', 'search_methods']) {
        expect(tool(n).description, n).toContain('Erfrage beim Nutzer:');
      }
      for (const n of ['match_scenario', 'build_scenario_plan', 'classify_scenario_text']) {
        expect(tool(n).description, n).toContain('Lies pflichtangaben.fehlt und frage nach');
      }
      for (const t of tools) for (const w of VERBOTEN) expect(t.description || '', `${t.name}: ${w}`).not.toContain(w);
    });

    it('classify_scenario_text liefert pflichtangaben wie REST /classify und rät bei Lücken zur Rückfrage', async () => {
      const text = 'Mathe Bruchrechnen';
      const mcp = await ok('classify_scenario_text', { text });
      const r = await rest('POST', '/api/v1/classify', { text });
      expect(mcp.pflichtangaben).toEqual(r.json.pflichtangaben);
      expect(mcp.pflichtangaben.fehlt.length).toBeGreaterThan(0);
      expect(mcp.empfohlenerNaechsterSchritt).toMatch(/frag/i);
      for (const f of mcp.pflichtangaben.fehlt) expect(mcp.empfohlenerNaechsterSchritt).toContain(f);
      const voll = await ok('classify_scenario_text', {
        text: 'Mathematik Klasse 7, 26 Schülerinnen und Schüler, Klassenraum, 45 Minuten, Bruchrechnen: Brüche addieren üben'
      });
      if (voll.pflichtangaben.fehlt.length === 0) expect(voll.empfohlenerNaechsterSchritt).not.toMatch(/Frage zuerst/);
    });
  });

  describe('Eingaben wie REST', () => {
    it('build_scenario_plan kennt alle Anfragefelder des Kerns (außer modus) mit denselben Codes', async () => {
      const felder = (await rest('GET', '/api/v1/fields')).json as Array<{ feld: string; werte?: Array<{ code: string }> }>;
      const p = props('build_scenario_plan');
      for (const f of felder) {
        if (f.feld === 'modus') continue;
        expect(p[f.feld], 'build_scenario_plan ' + f.feld).toBeDefined();
        if (f.werte && p[f.feld].enum) expect(p[f.feld].enum, f.feld).toEqual(f.werte.map((w) => w.code));
      }
      const gruppe = JSON.stringify(p.gruppen);
      expect(gruppe).toContain('ohneSchrift');
      expect(gruppe).toContain('ohneBewegung');
    });

    it('build_scenario_plan reicht zieltyp, komplexitaet, sprachniveau, lehrende, einheit und bewertet wie REST /plan an den Kern', async () => {
      const anfrage = {
        text: 'Berufsschule, Elektroniker, Schaltung aufbauen und prüfen, 90 Minuten, 20 Lernende',
        bildungsstufe: 'berufsbildung',
        zieltyp: 'vollstaendige-handlung',
        komplexitaet: 'hoch',
        sprachniveau: 'b1',
        lehrende: 2,
        einheit: 'Lernfeld 3: Steuerungen analysieren',
        bewertet: true,
        umfang: 'kompakt'
      };
      const mcp = await ok('build_scenario_plan', anfrage);
      const r = await rest('POST', '/api/v1/plan', anfrage);
      expect(mcp.erkannteKriterien).toMatchObject({ zieltyp: 'vollstaendige-handlung', komplexitaet: 'hoch', sprachniveau: 'b1', lehrende: 2, bewertet: true });
      expect(mcp.erkannteKriterien).toEqual(r.json.erkannteKriterien);
      expect(mcp.pflichtangaben).toEqual(r.json.pflichtangaben);
    });

    it('build_scenario_plan nimmt Teilgruppen mit ohneSchrift und ohneBewegung an', async () => {
      const anfrage = {
        text: 'Sachunterricht Klasse 2, Wetter, 45 Minuten, 22 Kinder, Klassenraum',
        gruppen: [
          { id: 'regel', label: 'Regelgruppe', count: 18 },
          { id: 'anfang', label: 'Kinder, die noch nicht lesen', count: 4, ohneSchrift: ['lesen', 'schreiben'] }
        ],
        umfang: 'kompakt'
      };
      const mcp = await ok('build_scenario_plan', anfrage);
      const r = await rest('POST', '/api/v1/plan', anfrage);
      expect(mcp.teilgruppenMethoden).toEqual(r.json.teilgruppenMethoden);
      const bad = await call('build_scenario_plan', { ...anfrage, gruppen: [{ id: 'x', label: 'x', ohneSchrift: ['malen'] }] });
      expect(bad.isError).toBe(true);
    });

    it('elaborate_scenario nimmt raum, anzahl, einheit, nachweis, bewertet und hinweiseListe an; sie stehen in den Rahmendaten', async () => {
      const plan = await ok('build_scenario_plan', { text: 'Biologie Klasse 7, Fotosynthese, 45 Minuten', umfang: 'voll' });
      const arrangement = plan.maschinenlesbar.arrangement ?? plan.maschinenlesbar;
      const res = await ok('elaborate_scenario', {
        arrangement,
        fach: 'Biologie',
        thema: 'Fotosynthese',
        raum: 'fachraum-nawi',
        anzahl: 24,
        einheit: 'Reihe Stoffwechsel',
        nachweis: 'muendlich',
        bewertet: true,
        hinweiseListe: ['Schutzbrillen bereitlegen.']
      });
      const kernfelder = res.entwurf.kernfelder as Array<{ id: string; inhalt: string }>;
      const alles = kernfelder.map((k) => k.inhalt).join('\n');
      expect(alles).toContain('Fachraum');
      expect(alles).toContain('24');
      expect(alles).toContain('Reihe Stoffwechsel');
      expect(alles).toMatch(/mündlich/i);
      expect(alles).toMatch(/bewertet|benotet/i);
      expect(alles).toContain('Schutzbrillen bereitlegen.');
    });

    it('adapt_scenario nimmt lehrende, anfrage, raum, ohneSchrift und ebenen an und antwortet wie REST /adapt', async () => {
      const basis = {
        scenarioText: 'Klasse 6, 45 Minuten',
        baustein: 'fallstudie',
        gruppen: [
          { id: 'regel', label: 'Regelgruppe', count: 20 },
          { id: 'anfang', label: 'Leseanfänger', count: 4, ohneSchrift: ['lesen', 'schreiben'] }
        ]
      };
      const body = { ...basis, lehrende: 2, raum: 'hoersaal', anfrage: { termine: 1 }, ebenen: ['unterricht-sofort'] };
      const mcp = await ok('adapt_scenario', body);
      const r = await rest('POST', '/api/v1/adapt', body);
      expect(r.status).toBe(200);
      expect(mcp.kontext.aktiveEbenen).toEqual(['unterricht-sofort']);
      const kern = (x: Record<string, unknown>) => JSON.stringify([x.phasenAnpassungen, x.teilgruppenMethoden, x.teilgruppen]);
      expect(kern(mcp)).toBe(kern(r.json));
      // The situation reaches the subgroup decision: without it the answer differs.
      const ohne = await ok('adapt_scenario', basis);
      expect(kern(ohne)).not.toBe(kern(mcp));
      const bad = await call('adapt_scenario', { ...body, ohneSchrift: ['malen'] });
      expect(bad.isError).toBe(true);
      const badAnfrage = await call('adapt_scenario', { ...basis, anfrage: { termine: 'viele' } });
      expect(badAnfrage.isError).toBe(true);
    });

    it('anpassungsAnfrage: Situation aus anfrage und den Feldern auf oberster Ebene; ohne Angaben undefined', () => {
      expect(anpassungsAnfrage({})).toBeUndefined();
      expect(anpassungsAnfrage({ zeitMin: 45 })).toBeUndefined();
      expect(anpassungsAnfrage({ raum: 'draussen', zeitMin: 45, anfrage: { termine: 2, zielart: 'bewegung' } })).toEqual({
        raum: 'draussen',
        zeitMin: 45,
        termine: 2,
        zielart: 'bewegung'
      });
      expect(anpassungsAnfrage({ ohneSchrift: ['lesen'], anfrage: { ohneSchrift: ['schreiben'] } })).toEqual({ ohneSchrift: ['lesen'] });
    });

    it('REST /adapt prüft die Situation (ohneSchrift) wie /replacements', async () => {
      const r = await rest('POST', '/api/v1/adapt', { scenarioText: 'Mathe Klasse 5', ohneSchrift: ['malen'] });
      expect(r.status).toBe(400);
    });

    it('generate_phase_material nimmt planungsprofil und gruppen an', async () => {
      const p = props('generate_phase_material');
      expect(p.planungsprofil.enum).toContain('betrieb');
      const res = await ok('generate_phase_material', {
        baustein: 'abrufquiz',
        fach: 'Mathematik',
        thema: 'Brüche',
        planungsprofil: 'erwachsenenbildung',
        gruppen: [{ label: 'Basis', profile: 'Wortbank und Satzstarter', count: 4 }]
      });
      const r = await rest('POST', '/api/v1/assistant/material', {
        baustein: 'abrufquiz',
        fach: 'Mathematik',
        thema: 'Brüche',
        planungsprofil: 'erwachsenenbildung',
        gruppen: [{ label: 'Basis', profile: 'Wortbank und Satzstarter', count: 4 }],
        mode: 'template'
      });
      expect(res.material).toBe(r.json.material);
      expect(res.material).toContain('Basis');
    });

    it('score_differentiation_matrix nimmt ebenen und die Situation an und prüft sie wie REST', async () => {
      const args = { personaId: 'languageAndCulture', baustein: 'lehrervortrag', ebenen: ['unterricht-sofort'], ohneSchrift: ['lesen'], raum: 'klassenraum' };
      const mcp = await ok('score_differentiation_matrix', args);
      const r = await rest('POST', '/api/v1/differentiation/score', args);
      expect(mcp.alternativeMethoden).toEqual(r.json.alternativeMethoden);
      expect(mcp.topRecommendations).toEqual(r.json.topRecommendations);
      const ohneEbenen = await ok('score_differentiation_matrix', { ...args, ebenen: undefined, includeSystemMeasures: true });
      expect(JSON.stringify(ohneEbenen.topRecommendations)).not.toBe(JSON.stringify(mcp.topRecommendations));
      const bad = await call('score_differentiation_matrix', { ...args, termine: 'viele' });
      expect(bad.isError).toBe(true);
      const badRest = await rest('POST', '/api/v1/differentiation/score', { ...args, ohneSchrift: ['malen'] });
      expect(badRest.status).toBe(400);
    });

    it('suggest_replacements nimmt die Situation an wie REST /replacements', async () => {
      const dichte = (await rest('GET', '/api/v1/catalog')).json.beispiele.find((a: { '@id'?: string }) => (a['@id'] || '').endsWith('dichte-reihe'));
      const body = { arrangement: dichte, pfad: '/ablauf/haupt/teile/1', situation: { raum: 'klassenraum', ohneSchrift: ['lesen', 'schreiben'], termine: 1 } };
      const mcp = await ok('suggest_replacements', body);
      const r = await rest('POST', '/api/v1/replacements', body);
      expect(mcp).toEqual(r.json);
      const ohne = await ok('suggest_replacements', { arrangement: dichte, pfad: '/ablauf/haupt/teile/1' });
      expect(mcp.kandidaten.length).toBeLessThan(ohne.kandidaten.length);
      const top = await ok('suggest_replacements', { arrangement: dichte, pfad: '/ablauf/haupt/teile/1', ohneSchrift: ['lesen', 'schreiben'] });
      expect(top.kandidaten.length).toBeLessThan(ohne.kandidaten.length);
    });

    it('search_methods kennt die übrigen Facetten, ohneSchrift und termine; Treffer nennen Bedarf und Eintragsart', async () => {
      const p = props('search_methods');
      for (const f of ['weltbezug', 'adaptivitaet', 'feedback', 'repraesentation', 'rolle', 'aufgabe', 'sequenz', 'ohneSchrift', 'termine']) expect(p[f], f).toBeDefined();
      const alle = await ok('search_methods', { limit: 100 });
      expect(alle.gesamtMethoden + alle.gesamtHilfen).toBe(alle.gesamt);
      const t = alle.treffer[0];
      for (const k of ['raumbedarf', 'schriftbedarf', 'eintragsart']) expect(t, k).toHaveProperty(k);
      const mitTermine = alle.treffer.find((b: { termineMin?: number }) => b.termineMin != null);
      const bausteine = fs.readdirSync(path.join(ROOT, 'data', 'bausteine')).map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'bausteine', f), 'utf8')));
      if (bausteine.some((b) => b.termineMin != null)) {
        const t1 = await ok('search_methods', { termine: 1, limit: 100 });
        const restT1 = await rest('GET', '/api/v1/methods?termine=1');
        expect(t1.anzahl).toBe(restT1.json.anzahl);
        expect(mitTermine === undefined || typeof mitTermine.termineMin === 'number').toBe(true);
      }
      const enaktiv = await ok('search_methods', { repraesentation: 'enaktiv', limit: 100 });
      const restEnaktiv = await rest('GET', '/api/v1/methods?repraesentation=enaktiv');
      expect(enaktiv.anzahl).toBe(restEnaktiv.json.anzahl);
      expect(enaktiv.anzahl).toBeGreaterThan(0);
      const os = await ok('search_methods', { ohneSchrift: 'lesen', limit: 100 });
      const restOs = await rest('GET', '/api/v1/methods?ohneSchrift=lesen');
      expect(os.anzahl).toBe(restOs.json.anzahl);
    });
  });

  describe('Antworten und Beschreibungen', () => {
    it('get_method nennt die Einordnung in Ketten; die Beschreibung nennt Bedarf, Eignung, Eintragsart, Evidenzbezug und Ketten', async () => {
      const d = tool('get_method').description!;
      for (const w of ['Bedarf', 'Eignung', 'Eintragsart', 'Evidenzbezug', 'Ketten']) expect(d, w).toContain(w);
      const m = await ok('get_method', { kennung: 'gruppenpuzzle' });
      expect(m.einordnung.length).toBeGreaterThan(0);
      expect(m.einordnung[0]).toEqual(expect.objectContaining({ kette: expect.any(String), schritt: expect.any(String), schrittLabel: expect.any(String) }));
    });

    it('compare_methods vergleicht auch Bedarf, Eignung, Eintragsart und Evidenzbezug', async () => {
      const d = tool('compare_methods').description!;
      for (const w of ['Bedarf', 'Eignung', 'Eintragsart', 'Evidenzbezug']) expect(d, w).toContain(w);
      const c = await ok('compare_methods', { methodeA: 'gruppenpuzzle', methodeB: 'lehrervortrag' });
      const neu = ['eintragsart', 'raumbedarf', 'fachausstattungArt', 'schriftbedarf', 'termineMin', 'fachbereich', 'fachbereichUngeeignet', 'ungeeignetBeiStufe', 'ungeeignetBeiVorwissen', 'eignungsgrund', 'evidenzBezug'];
      expect(c.verglichen).toEqual(expect.arrayContaining(neu));
      for (const u of c.unterschiede) expect(c.verglichen).toContain(u.facette);
      // gruppenpuzzle and lehrervortrag differ at least in their evidence basis or subject binding.
      expect(c.unterschiede.some((u: { facette: string }) => neu.includes(u.facette))).toBe(true);
    });

    it('match_scenario und validate_arrangement beschreiben die FMT-2.0-Antwort', () => {
      const m = tool('match_scenario').description!;
      for (const w of ['pflichtangaben', 'regelmeldungen', 'begleitstrang', 'planungsprofil']) expect(m, w).toContain(w);
      expect(tool('validate_arrangement').description).toMatch(/Passungsregeln/);
      expect(tool('validate_arrangement').description).toMatch(/match_scenario|build_scenario_plan/);
      expect(tool('generate_phase_material').description).toMatch(/Hilfe/);
    });

    it('list_vocabularies nennt wfelder, arten, merkmale, planungsprofile, ketten mit schritten und die Teilgruppen-Tabelle wie /meta', async () => {
      const v = await ok('list_vocabularies', {});
      const meta = (await rest('GET', '/api/v1/meta')).json;
      for (const k of ['wfelder', 'arten', 'merkmale', 'planungsprofile', 'teilgruppen', 'ketten', 'regeln']) expect(v[k], k).toEqual(meta[k]);
      expect(v.ketten[0].schritte.length).toBeGreaterThan(0);
      for (const w of ['W-Felder', 'Planungsprofile', 'Teilgruppen']) expect(tool('list_vocabularies').description, w).toContain(w);
    });
  });

  describe('Ressourcen und Prompts', () => {
    it('fmt://catalog/summary nennt die Eintragsart und zählt Methoden und Hilfen getrennt', async () => {
      const s = JSON.parse(((await client.readResource({ uri: 'fmt://catalog/summary' })).contents[0] as { text: string }).text);
      expect(s.methoden + s.hilfen).toBe(s.anzahl);
      expect(s.hilfen).toBeGreaterThan(0);
      expect(s.bausteine.every((b: { eintragsart?: string }) => b.eintragsart === 'methode' || b.eintragsart === 'hilfe')).toBe(true);
    });

    it('fmt://rules nennt neben den Kompositionsregeln die Passungsregeln', async () => {
      const r = JSON.parse(((await client.readResource({ uri: 'fmt://rules' })).contents[0] as { text: string }).text);
      expect(r.regeln.length).toBe(13);
      const meta = (await rest('GET', '/api/v1/meta')).json;
      expect(r.passungsregeln).toEqual(meta.regeln);
    });

    it('design_learning_scenario fragt zuerst nach den Pflichtangaben und nennt Annahmen; audit_lesson_plan kennt die Passungsregeln', async () => {
      const d = await client.getPrompt({ name: 'design_learning_scenario', arguments: { szenario: 'Mathe, Brüche' } });
      const text = (d.messages[0].content as { text: string }).text;
      for (const w of ['pflichtangaben.fehlt', 'pflichtangaben.angenommen', 'Raum', 'Zielart', 'Teilgruppen', 'Begleitziel', 'Planungsprofil']) expect(text, w).toContain(w);
      expect(text).toMatch(/eine kurze Frage/i);
      const { prompts } = await client.listPrompts();
      const arg = prompts.find((p) => p.name === 'design_learning_scenario')!.arguments![0].description!;
      for (const w of ['Fach', 'Raum', 'Zielart']) expect(arg, w).toContain(w);
      const a = await client.getPrompt({ name: 'audit_lesson_plan', arguments: { entwurf: 'Einstieg, Vortrag, Quiz' } });
      const at = (a.messages[0].content as { text: string }).text;
      expect(at).toContain('Passungsregeln');
      expect(prompts.find((p) => p.name === 'audit_lesson_plan')!.description).not.toMatch(/13 FMT-Regeln/);
      for (const w of VERBOTEN) {
        expect(text).not.toContain(w);
        expect(at).not.toContain(w);
      }
    });
  });
});
