import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { buildApp } from '../src/app.js';
import { loadConfig, type ServerConfig } from '../src/config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIST_DATA = path.join(ROOT, 'dist-data');

const config = (over: Partial<ServerConfig> = {}): ServerConfig => ({
  ...loadConfig({}),
  host: '127.0.0.1',
  llmBaseUrl: '',
  llmApiKey: '',
  llmRateLimitPerMin: 1000,
  apiRateLimitPerMin: 100000,
  ...over
});

const TEXT = 'Mathematik Klasse 7, 45 Minuten Bruchrechnen, 26 Kinder, davon 5 DaZ-Kinder und 4 leistungsstarke';

describe('Abschlussaudit: REST und MCP unterstützen die neuen Zuordnungen gleich', () => {
  let app: FastifyInstance;
  let client: Client;
  const tool = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    const text = (r.content as Array<{ text: string }>)[0].text;
    let json: Record<string, any> = {};
    try {
      json = JSON.parse(text);
    } catch {
      json = { text };
    }
    return { json, isError: Boolean(r.isError) };
  };

  beforeAll(async () => {
    app = await buildApp({ distDataDir: DIST_DATA, config: config() });
    const addr = await app.listen({ port: 0, host: '127.0.0.1' });
    client = new Client({ name: 'audit', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', addr)));
  });
  afterAll(async () => {
    await client.close();
    await app.close();
  });

  it('Plan liefert Teilgruppen-Methoden und Zusatzphasen, kompakt wie voll und in REST wie MCP', async () => {
    const rest = (await app.inject({ method: 'POST', url: '/api/v1/plan', payload: { text: TEXT, umfang: 'kompakt' } })).json();
    expect(rest.teilgruppenMethoden.length + rest.zusatzphasen.length).toBeGreaterThan(0);
    const keys = new Set(rest.thematischeTabelle.map((r: { key: string }) => r.key));
    for (const t of rest.teilgruppenMethoden) {
      expect(keys.has(t.stepKey)).toBe(true);
      expect(t.groupId).not.toBe('regel');
    }
    const mcp = await tool('build_scenario_plan', { text: TEXT });
    expect(mcp.isError).toBe(false);
    expect(mcp.json.teilgruppenMethoden).toEqual(rest.teilgruppenMethoden);
    expect(mcp.json.zusatzphasen).toEqual(rest.zusatzphasen);
    const voll = (await app.inject({ method: 'POST', url: '/api/v1/plan', payload: { text: TEXT } })).json();
    expect(voll.zusatzphasen).toEqual(rest.zusatzphasen);
  });

  it('Plan nimmt einen Fachbereich an und lehnt unbekannte Codes ab', async () => {
    const ok = await app.inject({ method: 'POST', url: '/api/v1/plan', payload: { text: 'Stunde zu Gedichten', fachbereich: 'sprachen' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().erkannteKriterien.fachbereich).toBe('sprachen');
    const mcpBad = await tool('build_scenario_plan', { text: 'Stunde zu Gedichten', fachbereich: 'gibtsnicht' });
    expect(mcpBad.isError).toBe(true);
  });

  it('Anpassung mit Arrangement liefert Methodentausch und Zusatzphasen, Fach ergibt den Fachbereich', async () => {
    const plan = (await app.inject({ method: 'POST', url: '/api/v1/plan', payload: { text: TEXT } })).json();
    const payload = { arrangement: plan.maschinenlesbar.arrangement, lerngruppenText: '5 DaZ-Kinder, 4 leistungsstarke', fach: 'Mathematik' };
    const rest = (await app.inject({ method: 'POST', url: '/api/v1/adapt', payload })).json();
    expect(rest.kontext.fachbereich).toBe('mathe-informatik');
    expect(Array.isArray(rest.teilgruppenMethoden)).toBe(true);
    expect(rest.zusatzphasen.length).toBeGreaterThanOrEqual(0);
    const mcp = await tool('adapt_scenario', payload);
    expect(mcp.json.teilgruppenMethoden).toEqual(rest.teilgruppenMethoden);
    expect(mcp.json.zusatzphasen).toEqual(rest.zusatzphasen);
  });

  it('Anpassung prüft Codes in REST wie in MCP', async () => {
    const bad = await app.inject({ method: 'POST', url: '/api/v1/adapt', payload: { scenarioText: 'Stunde', maxTechnik: 'constructor' } });
    expect(bad.statusCode).toBe(400);
    const ok = await app.inject({ method: 'POST', url: '/api/v1/adapt', payload: { scenarioText: 'Stunde', maxTechnik: 't-geteilt', bildungsstufe: 'sek1' } });
    expect(ok.statusCode).toBe(200);
    expect((await tool('adapt_scenario', { scenarioText: 'Stunde', maxTechnik: 'constructor' })).isError).toBe(true);
  });

  it('Methodensuche nach Fach und Fachbereich in REST und MCP', async () => {
    const strict = (await app.inject({ method: 'GET', url: '/api/v1/methods?fachbereich=sport,aesthetik' })).json();
    expect(strict.anzahl).toBeGreaterThan(6);
    for (const b of strict.treffer) expect(b.fachbereich.some((f: string) => f === 'sport' || f === 'aesthetik')).toBe(true);

    const fach = (await app.inject({ method: 'GET', url: '/api/v1/methods?fach=Sport' })).json();
    expect(fach.fachErkannt.fachbereich).toBe('sport');
    for (const b of fach.treffer) expect(b.fachbereichUngeeignet || []).not.toContain('sport');
    expect(fach.anzahl).toBeGreaterThan(strict.anzahl);

    const mcp = await tool('search_methods', { fach: 'Sport', limit: 100 });
    expect(mcp.json.anzahl).toBe(fach.anzahl);
    expect(mcp.json.fachErkannt.fachbereich).toBe('sport');
    const mcpArea = await tool('search_methods', { fachbereich: ['sport', 'aesthetik'], limit: 100 });
    expect(mcpArea.json.anzahl).toBe(strict.anzahl);
  });

  it('frühere Kennungen funktionieren in REST, MCP und Linked Data', async () => {
    const rest = await app.inject({ method: 'GET', url: '/api/v1/methods/dreischritt-interview' });
    expect(rest.statusCode).toBe(200);
    expect(rest.json().kennung).toBe('drei-schritt-interview');
    const mcp = await tool('get_method', { kennung: 'dreischritt-interview' });
    expect(mcp.json.kennung).toBe('drei-schritt-interview');
    const ld = await app.inject({ method: 'GET', url: '/baustein/dreischritt-interview', headers: { accept: 'application/ld+json' } });
    expect(ld.statusCode).toBeLessThan(400);
  });
});

describe('Plan-API und Baukasten schlagen für dieselben Teilgruppen dasselbe vor', () => {
  it('Teilgruppen aus dem Text werden wie im Baukasten nur mit ihren erkannten Merkmalen geprüft', async () => {
    const core = await import('@fmt/core');
    const app = await buildApp({ distDataDir: DIST_DATA, config: config() });
    // The class test (only explicit, uniform) sets off the swap for the high performers (teilgruppen.json).
    const text = 'Mathematik Klasse 6, Brüche, Klassenarbeit, 90 Minuten, 26 Kinder, davon 5 DaZ-Kinder und 4 leistungsstarke';
    const plan = (await app.inject({ method: 'POST', url: '/api/v1/plan', payload: { text } })).json();
    // Wie apps/web PlannerPage: erkannte Gruppen mit selectedValues, ohne zusätzliche Persona, dazu die Regelgruppe.
    const groups = [
      { id: 'regel', label: 'Regelgruppe', isMain: true, personaId: 'average' },
      ...core.detectLearnerGroupsFromText(text).groups.map((g) => ({ id: g.id, label: g.label, personaId: g.personaId, selectedValues: g.selectedValues }))
    ];
    const phases = core.phasesForAdjustment(app.fmtStore.bundle, plan.maschinenlesbar.arrangement);
    const constraints = { bildungsstufe: plan.erkannteKriterien.bildungsstufe, fachbereich: plan.erkannteKriterien.fachbereich };
    const b = app.fmtStore.bundle;
    const ui = core.proposeMethodAdjustments(b.bausteine, phases, groups, constraints, { teilgruppen: b.teilgruppen, regeln: b.regeln, schemes: b.schemes });
    expect(ui.length).toBeGreaterThan(0);
    const pick = (xs: Array<{ groupId: string; stepKey: string; zuKennung: string }>) =>
      xs.map((x) => `${x.groupId}|${x.stepKey}|${x.zuKennung}`).sort();
    expect(pick(plan.teilgruppenMethoden)).toEqual(pick(ui));
    expect(plan.zusatzphasen.map((z: { kennung: string }) => z.kennung)).toEqual(
      core.proposeAdditionalPhases(app.fmtStore.bundle.bausteine, phases, groups, constraints).map((z) => z.kennung)
    );
    await app.close();
  });
});
