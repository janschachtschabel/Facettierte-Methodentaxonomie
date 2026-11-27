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

  it('lists all 15 FMT tools, resources, and prompts', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'adapt_scenario',
      'build_scenario_plan',
      'classify_scenario_text',
      'compare_methods',
      'elaborate_scenario',
      'generate_phase_material',
      'get_method',
      'list_differentiation_options',
      'list_vocabularies',
      'match_scenario',
      'score_differentiation_matrix',
      'search_methods',
      'search_wlo_oer',
      'suggest_replacements',
      'validate_arrangement'
    ]);

    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual([
      'adapt_lesson_differentiation',
      'audit_lesson_plan',
      'design_learning_scenario'
    ]);

    const { resources } = await client.listResources();
    expect(resources.some((r) => r.uri === 'fmt://catalog/summary')).toBe(true);
    expect(resources.some((r) => r.uri === 'fmt://differentiation/options')).toBe(true);
    expect(resources.some((r) => r.uri === 'fmt://rules')).toBe(true);
  });

  it('search_methods filtert nach ohneRaumbedarf und schriftbedarf (Codes des Schemas und Aliasse)', async () => {
    const call = async (args: Record<string, unknown>) => {
      const res = await client.callTool({ name: 'search_methods', arguments: { limit: 100, ...args } });
      expect(res.isError, JSON.stringify(res.content)).toBeFalsy();
      return JSON.parse((res.content as Array<{ text: string }>)[0].text);
    };
    const liest = await call({ schriftbedarf: 'liest' });
    expect(liest.anzahl).toBeGreaterThan(0);
    const lesen = await call({ schriftbedarf: 'lesen' });
    expect(lesen.anzahl).toBe(liest.anzahl);
    const beides = await call({ schriftbedarf: ['liest', 'schreibt'], ohneRaumbedarf: ['bewegungsflaeche'] });
    // Independent expectation from the method files.
    const dir = path.join(ROOT, 'data', 'bausteine');
    const erwartet = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as { schriftbedarf?: string[]; raumbedarf?: string[] })
      .filter((b) => (b.schriftbedarf || []).length && !(b.raumbedarf || []).includes('bewegungsflaeche')).length;
    expect(erwartet).toBeGreaterThan(0);
    expect(beides.anzahl).toBe(erwartet);
  });

  it('search_methods filtert nach eintragsart; build_scenario_plan nennt genannteHilfen', async () => {
    const call = async (name: string, args: Record<string, unknown>) => {
      const res = await client.callTool({ name, arguments: args });
      expect(res.isError, JSON.stringify(res.content)).toBeFalsy();
      return JSON.parse((res.content as Array<{ text: string }>)[0].text);
    };
    const hilfen = await call('search_methods', { eintragsart: 'hilfe', limit: 100 });
    expect(hilfen.anzahl).toBeGreaterThan(0);
    expect(hilfen.treffer.every((b: { eintragsart?: string }) => b.eintragsart === 'hilfe')).toBe(true);
    const methoden = await call('search_methods', { eintragsart: 'methode', limit: 100 });
    expect(methoden.treffer.some((b: { eintragsart?: string }) => b.eintragsart === 'hilfe')).toBe(false);
    const hilfe = hilfen.treffer[0] as { kennung: string; name: string };
    const name = hilfe.name.replace(/\s*\(.*\)\s*$/, '');
    const plan = await call('build_scenario_plan', { text: `Deutsch Klasse 5, Märchen, 45 Minuten, mit ${name}`, umfang: 'kompakt' });
    expect(plan.genannteHilfen).toEqual([hilfe.kennung]);
    expect(plan.nichtVerankert.map((n: { baustein: string }) => n.baustein)).not.toContain(hilfe.kennung);
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

    // raum is the room field; lernort is still read as its alias and gives the same result.
    const text = 'Biologie Klasse 7 Pflanzen, 45 Minuten';
    const viaRaum = await client.callTool({ name: 'match_scenario', arguments: { text, raum: 'draussen', ohneSchrift: ['schreiben'] } });
    const viaAlias = await client.callTool({ name: 'match_scenario', arguments: { text, lernort: 'draussen', ohneSchrift: ['schreiben'] } });
    expect(viaRaum.isError).toBeFalsy();
    const raumJson = JSON.parse((viaRaum.content as Array<{ text: string }>)[0].text);
    const aliasJson = JSON.parse((viaAlias.content as Array<{ text: string }>)[0].text);
    expect(raumJson.kriterien.raum).toBe('draussen');
    expect(raumJson.kriterien.ohneSchrift).toEqual(['schreiben']);
    expect(aliasJson.schritte).toEqual(raumJson.schritte);

    const kompakt = await client.callTool({ name: 'build_scenario_plan', arguments: { text, umfang: 'kompakt', raum: 'draussen', termine: 1 } });
    expect(kompakt.isError).toBeFalsy();
    const kompaktJson = JSON.parse((kompakt.content as Array<{ text: string }>)[0].text);
    expect(kompaktJson.pflichtangaben).toBeDefined();
    expect(kompaktJson.erkannteKriterien.raum).toBe('draussen');
    const offen = await client.callTool({
      name: 'build_scenario_plan',
      arguments: { text: 'Sport Klasse 8, Ausdauerlauf, 45 Minuten', umfang: 'kompakt', raum: 'klassenraum', raumBietet: [], zielart: 'kondition', nachweis: 'praktisch' }
    });
    expect(offen.isError, JSON.stringify(offen.content)).toBeFalsy();
    const offenJson = JSON.parse((offen.content as Array<{ text: string }>)[0].text);
    expect(offenJson.offenGruende?.length).toBeGreaterThan(0);
    expect(offenJson.nachweis?.formen).toContain('praktisch');
    const vhs = await client.callTool({
      name: 'build_scenario_plan',
      arguments: { text: 'VHS Integrationskurs Deutsch A2: beim Arzt, 90 Minuten, 15 Teilnehmende', umfang: 'kompakt' }
    });
    const vhsJson = JSON.parse((vhs.content as Array<{ text: string }>)[0].text);
    expect(vhsJson.pflichtangaben.fehlt).toEqual(expect.any(Array));
    expect(vhsJson.regelmeldungen).toContainEqual(
      expect.objectContaining({ regel: 'schrift-niedriges-sprachniveau', wirkung: 'warnt', grundlage: 'E', quelle: expect.any(String), text: expect.any(String) })
    );

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
    const alleRes = await client.callTool({ name: 'list_vocabularies', arguments: {} });
    const alle = JSON.parse((alleRes.content as Array<{ text: string }>)[0].text);
    expect(alle.regeln).toHaveLength(16);
    expect(alle.regeln[0]).toEqual(expect.objectContaining({ id: expect.any(String), name: expect.any(String), wirkung: expect.any(String), grundlage: expect.any(String) }));
    expect(alle.raumtypen.map((r: { id: string }) => r.id)).toEqual(expect.arrayContaining(['klassenraum', 'fachraum']));
    expect(alle.zielarten).toHaveLength(9);
    // Rules carry text and W fields like /api/v1/meta; the description names the new lists.
    expect(alle.regeln[0]).toEqual(expect.objectContaining({ text: expect.any(String), wfelder: expect.any(Array) }));
    const { tools: alleTools } = await client.listTools();
    const beschreibung = alleTools.find((t) => t.name === 'list_vocabularies')!.description!;
    for (const w of ['Passungsregeln', 'Raumtypen', 'Zielarten']) expect(beschreibung).toContain(w);

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
        ansatz: ['instruktion', 'uebung'],
        includeWloOer: false
      }
    });
    const planJson = JSON.parse((planRes.content as Array<{ text: string }>)[0].text);
    expect(planJson.pruefung.gueltig).toBe(true);
    expect(planJson.pruefung.dauerMin).toBeLessThanOrEqual(90);
    expect(planJson.thematischeTabelle.length).toBeGreaterThan(0);
    expect(planJson.llmBriefing).toBeUndefined();
    expect(planJson.maschinenlesbar).toBeUndefined();
    expect((planRes.content as Array<{ text: string }>)[0].text.length).toBeLessThan(30000);

    const planVollRes = await client.callTool({
      name: 'build_scenario_plan',
      arguments: { text: 'Mathematik Bruchrechnen Doppelstunde Klasse 6, 90 Minuten, geringes Vorwissen', umfang: 'voll' }
    });
    const planJsonKompakt = planJson;
    expect(planJsonKompakt.thematischeTabelle.length).toBeGreaterThan(0);
    const planVoll = JSON.parse((planVollRes.content as Array<{ text: string }>)[0].text);
    expect(planVoll.llmBriefing.systemPrompt).toContain('FMT');
    expect(planVoll.maschinenlesbar['@type']).toBe('FmtScenarioPlan');
    expect(planVoll.maschinenlesbar.schemaVersion).toBe('1.4');
    expect(planVoll.maschinenlesbar.thematicRows.length).toBeGreaterThan(0);

    // Regression test from live ChatGPT MCP session: Grundschule Mathematik Bruchteile 45 min analog
    const gsPlanRes = await client.callTool({
      name: 'build_scenario_plan',
      arguments: {
        text: 'Mathematik Grundschule Bruchteile entdecken: Hälfte und Viertel, handlungsorientiert, entdeckend, anschaulich, kooperativ',
        fach: 'Mathematik',
        thema: 'Bruchteile entdecken: Hälfte und Viertel',
        bildungsstufe: 'primar',
        zeitMin: 45,
        gruppe: 24,
        vorwissen: 'mittel',
        didaktischerAnsatz: 'handlungsorientiert, entdeckend, anschaulich, kooperativ',
        maxTechnik: 't-keine',
        maxVorbereitung: 15,
        ohneInternet: true,
        ohneKI: true,
        includeWloOer: false
      }
    });
    const gsPlan = JSON.parse((gsPlanRes.content as Array<{ text: string }>)[0].text);
    expect(gsPlan.pruefung.gueltig).toBe(true);
    expect(gsPlan.pruefung.dauerMin).toBeLessThanOrEqual(45);
    // 1. Duration sum in thematischeTabelle MUST equal pruefung.dauerMin (fixes 40 vs 45 min mismatch)
    const tableDurSum = gsPlan.thematischeTabelle.reduce((sum: number, r: { durationMin: number }) => sum + r.durationMin, 0);
    expect(tableDurSum).toBe(gsPlan.pruefung.dauerMin);
    // 2. No Sek/Hochschule-only text method like kooperatives-skript in Primarstufe
    expect(gsPlan.thematischeTabelle.map((r: { methodId: string }) => r.methodId)).not.toContain('kooperatives-skript');
    // 3. Matrix must not recommend digital/online measures when maxTechnik='t-keine'
    const allMatrixTops: string[] = gsPlan.lerngruppenUndMatrix.flatMap((g: { matrixTop: string[] }) => g.matrixTop);
    expect(allMatrixTops.some((m) => /digital|online/i.test(m))).toBe(false);
    // 4. Binding client-LLM contract & structured methodenDetails must be returned top-level
    expect(Array.isArray(gsPlan.verbindlicheUmsetzungsregeln)).toBe(true);
    // Compact answers omit the Baukasten import rule together with the `maschinenlesbar` block
    expect(gsPlan.verbindlicheUmsetzungsregeln.length).toBe(4);
    expect(JSON.stringify(gsPlan.verbindlicheUmsetzungsregeln)).not.toContain('maschinenlesbar');
    expect(Array.isArray(gsPlan.methodenDetails)).toBe(true);
    expect(gsPlan.methodenDetails.length).toBe(gsPlan.thematischeTabelle.length);
    expect(gsPlan.methodenDetails[0].status).toBeTruthy();
    expect(Array.isArray(gsPlan.methodenDetails[0].durchfuehrung)).toBe(true);

    // Verify match_scenario parity on Doppelstunde starter text
    const matheMatchRes = await client.callTool({
      name: 'match_scenario',
      arguments: {
        text: 'Mathematik Bruchrechnen Doppelstunde Klasse 6, 90 Minuten, geringes Vorwissen',
        ansatz: ['instruktion', 'uebung'],
        gruppe: 26
      }
    });
    const matheMatch = JSON.parse((matheMatchRes.content as Array<{ text: string }>)[0].text);
    expect(matheMatch.modus).toBe('ablauf');
    expect(matheMatch.kette.id).toBe('prozedur');
    expect(matheMatch.pruefung.gueltig).toBe(true);
    expect(matheMatch.pruefung.dauerMin).toBeLessThanOrEqual(90);

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

    // 14th MCP tool: adapt_scenario (standalone free-text chat scenario AND FMT arrangement)
    const adaptFreeRes = await client.callTool({
      name: 'adapt_scenario',
      arguments: {
        scenarioText: 'Deutsch Klasse 5 Satzglieder erarbeiten mit Arbeitsblatt, 45 Minuten, ohne Geräte, ohne Internet',
        lerngruppenText: '6 DaZ-Kinder, 2 mit LRS und 4 leistungsstarke Kinder',
        bildungsstufe: 'sek1',
        zeitMin: 45
      }
    });
    const adaptFree = JSON.parse((adaptFreeRes.content as Array<{ text: string }>)[0].text);
    expect(adaptFree.udlBasis.length).toBeGreaterThan(0);
    expect(adaptFree.konflikte.length).toBeGreaterThan(0);
    expect(adaptFree.phasenAnpassungen.length).toBe(3);
    expect(adaptFree.verbindlicheUmsetzungsregeln.length).toBeGreaterThanOrEqual(4);
    expect(adaptFree.udlBasis.every((u: { meta: { ebene: string; technik: string } }) => u.meta.ebene !== 'organisation-system' && u.meta.technik === 'analog')).toBe(true);

    const adaptArrRes = await client.callTool({
      name: 'adapt_scenario',
      arguments: {
        arrangement: matchJson.arrangement,
        lerngruppenText: '5 DaZ-Kinder und 4 leistungsstarke Kinder',
        maxTechnik: 't-keine',
        ohneInternet: true
      }
    });
    const adaptArr = JSON.parse((adaptArrRes.content as Array<{ text: string }>)[0].text);
    expect(adaptArr.phasenAnpassungen.length).toBeGreaterThanOrEqual(4);
    expect(adaptArr.phasenAnpassungen[0].baustein).toBeTruthy();
    expect(adaptArr.phasenAnpassungen[0].methodenKontext).toBeDefined();

    // Standalone 1-method adaptation via `baustein` shortcut + standalone `list_differentiation_options`
    const optRes = await client.callTool({ name: 'list_differentiation_options', arguments: {} });
    const optJson = JSON.parse((optRes.content as Array<{ text: string }>)[0].text);
    expect(optJson.anzahlMassnahmen).toBe(172);
    expect(optJson.schnellProfile.length).toBeGreaterThanOrEqual(8);
    expect(optJson.anpassungsvariablen.length).toBeGreaterThanOrEqual(8);
    // C5: no blocked category, each value names Tausch or Hilfe with source
    const kats = optJson.anpassungsvariablen.flatMap((v: { kategorien: unknown[] }) => v.kategorien) as Array<{
      id: string;
      auspraegungen: Array<{ id: string; teilgruppe?: { antwort: string; quelle?: string } }>;
    }>;
    expect(kats.find((k) => k.id === 'sensorische')).toBeUndefined();
    expect(optJson.gesperrteKategorien[0].id).toBe('sensorische');
    expect(kats.flatMap((k) => k.auspraegungen).find((a) => a.id === 'vorwissen-gering')?.teilgruppe).toMatchObject({ vorgesehen: 'tausch', bedingung: 'nur wenn die Methode den Grund auslöst und nur uniform ist' });
    const filtered = JSON.parse(
      ((await client.callTool({ name: 'list_differentiation_options', arguments: { oberkategorie: 'sensorische' } })).content as Array<{ text: string }>)[0].text
    );
    expect(filtered.anpassungsvariablen.flatMap((v: { kategorien: Array<{ id: string }> }) => v.kategorien).some((k: { id: string }) => k.id === 'sensorische')).toBe(false);

    // adapt_scenario: groups with ohneSchrift/ohneBewegung; blocked value gives text, no error
    const adaptGrp = JSON.parse(
      ((await client.callTool({
        name: 'adapt_scenario',
        arguments: {
          baustein: 'cornell-methode',
          bildungsstufe: 'sek1',
          gruppen: [
            { id: 'regel', label: 'Klasse' },
            { id: 'g1', label: 'Ohne Schreiben', ohneSchrift: ['schreiben'], ohneBewegung: true },
            { id: 'g2', label: 'Lerntyp', selectedValues: { sensorische: 'sensorische-visuell' } }
          ]
        }
      })).content as Array<{ text: string }>)[0].text
    );
    const imp = adaptGrp.phasenAnpassungen[0].teilgruppenImpulse as Array<{ groupId: string; antwort: string }>;
    expect(['tausch', 'hilfe']).toContain(imp.find((i) => i.groupId === 'g1')!.antwort);
    expect(adaptGrp.gesperrt).toEqual([expect.objectContaining({ gruppe: 'Lerntyp' })]);

    const scoreC5 = JSON.parse(
      ((await client.callTool({
        name: 'score_differentiation_matrix',
        arguments: { selectedValues: { vorwissen: 'vorwissen-gering', sensorische: 'sensorische-visuell' }, baustein: 'gruppenpuzzle', bildungsstufe: 'sek1' }
      })).content as Array<{ text: string }>)[0].text
    );
    expect(scoreC5.merkmale[0]).toMatchObject({ wert: 'vorwissen-gering', vorgesehen: 'tausch', bedingung: 'nur wenn die Methode den Grund auslöst und nur uniform ist' });
    expect(scoreC5.merkmale[0]).not.toHaveProperty('antwort');
    expect(scoreC5.gesperrt[0].kategorie).toBe('sensorische');

    const singleMethodRes = await client.callTool({
      name: 'adapt_scenario',
      arguments: {
        baustein: 'gruppenpuzzle',
        lerngruppenText: '4 DaZ-Kinder, 2 mit ADHS, 3 Leistungsstarke',
        bildungsstufe: 'sek1',
        maxTechnik: 't-keine',
        ohneInternet: true
      }
    });
    const singleMethod = JSON.parse((singleMethodRes.content as Array<{ text: string }>)[0].text);
    expect(singleMethod.phasenAnpassungen.length).toBe(1);
    expect(singleMethod.phasenAnpassungen[0].baustein).toBe('gruppenpuzzle');
    expect(singleMethod.phasenAnpassungen[0].methodenKontext?.kernkomponente.length).toBeGreaterThan(0);

    const quickScoreRes = await client.callTool({
      name: 'score_differentiation_matrix',
      arguments: { quickProfileId: 'daz', baustein: 'gruppenpuzzle', bildungsstufe: 'sek1', maxTechnik: 't-keine' }
    });
    const quickScore = JSON.parse((quickScoreRes.content as Array<{ text: string }>)[0].text);
    // The DaZ preset no longer carries the blocked category sensorische (Lerntypen, teilgruppen.json) nor a special
    // need in language (DaZ is second-language acquisition, fix wave C): two values.
    expect(quickScore.selectedCount).toBe(2);
    expect(quickScore.topRecommendations.length).toBeGreaterThan(0);
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

  it('kennzeichnet Fehler mit isError', async () => {
    const parse = (r: unknown) => JSON.parse(((r as { content: Array<{ text: string }> }).content)[0].text);
    const unknown = await client.callTool({ name: 'get_method', arguments: { kennung: 'gibt-es-nicht' } });
    expect(unknown.isError).toBe(true);
    expect(parse(unknown).fehler).toContain('gibt-es-nicht');

    const cmp = await client.callTool({ name: 'compare_methods', arguments: { methodeA: 'abrufquiz', methodeB: 'nope' } });
    expect(cmp.isError).toBe(true);

    const path = await client.callTool({
      name: 'suggest_replacements',
      arguments: { arrangement: { typ: 'Arrangement', name: 'x', reichweite: 'r3', ablauf: { typ: 'Sequenz', teile: [] } }, pfad: '/ablauf/teile/9' }
    });
    expect(path.isError).toBe(true);

    const ok = await client.callTool({ name: 'get_method', arguments: { kennung: 'abrufquiz' } });
    expect(ok.isError).toBeFalsy();
  });

  it('nennt erlaubte Werte als Enum und weist unbekannte Werte ab', async () => {
    const { tools } = await client.listTools();
    const props = (name: string) => (tools.find((t) => t.name === name)!.inputSchema.properties || {}) as Record<string, { enum?: string[]; anyOf?: unknown[] }>;
    const match = props('match_scenario');
    expect(match.zieltyp.enum).toContain('konzeptaufbau');
    expect(match.maxTechnik.enum).toContain('t-keine');
    expect(match.bildungsstufe.enum).toContain('sek1');
    expect(match.vorwissen.enum).toEqual(expect.arrayContaining(['gering', 'mittel', 'hoch']));
    expect(JSON.stringify(match.ansatz)).toContain('kooperativ');
    for (const f of ['raum', 'raumBietet', 'fachausstattungArt', 'ohneSchrift', 'termine', 'nachweis', 'zielart']) {
      expect(match[f], 'match_scenario ' + f).toBeDefined();
      expect(props('build_scenario_plan')[f], 'build_scenario_plan ' + f).toBeDefined();
    }
    expect(match.zielart.enum).toEqual(expect.arrayContaining(['fakten', 'konzepte', 'prozeduren', 'problemloesen', 'bewegung', 'kondition', 'urteilen', 'gestalten', 'handlung']));
    const toolList = tools.filter((t) => ['match_scenario', 'build_scenario_plan'].includes(t.name));
    for (const t of toolList) {
      expect(t.description!.toLowerCase()).not.toContain('lernort');
      const descs = Object.values((t.inputSchema.properties || {}) as Record<string, { description?: string }>).map((p) => p.description || '');
      expect(descs.join(' ').toLowerCase()).not.toContain('lernort');
    }
    const plan = props('build_scenario_plan');
    expect(plan.maxTechnik.enum).toContain('t-keine');
    expect(plan.bildungsstufe.enum).toContain('primar');

    const bad = await client.callTool({ name: 'match_scenario', arguments: { text: 'Einstieg', maxTechnik: 'quatsch' } });
    expect(bad.isError).toBe(true);
    expect((bad.content as Array<{ text: string }>)[0].text).toContain('maxTechnik');
  });

  it('kürzt die Vorschlagsliste von match_scenario', async () => {
    const parse = (r: unknown) => JSON.parse(((r as { content: Array<{ text: string }> }).content)[0].text);
    const std = parse(await client.callTool({ name: 'match_scenario', arguments: { text: 'Einstieg Bruchrechnen Klasse 6' } }));
    expect(std.modus).toBe('phase');
    expect(std.vorschlaege.length).toBe(10);
    expect(std.vorschlaegeGesamt).toBeGreaterThan(10);
    const three = parse(await client.callTool({ name: 'match_scenario', arguments: { text: 'Einstieg Bruchrechnen Klasse 6', limit: 3 } }));
    expect(three.vorschlaege.length).toBe(3);
    expect(three.vorschlaege[0].baustein).toBe(std.vorschlaege[0].baustein);
  });

  it('übernimmt im Text genannte Teilgruppen in den Szenarioplan', async () => {
    const parse = (r: unknown) => JSON.parse(((r as { content: Array<{ text: string }> }).content)[0].text);
    const plan = parse(
      await client.callTool({
        name: 'build_scenario_plan',
        arguments: { text: 'Mathematik Klasse 7, 28 Kinder, davon 5 DaZ-Kinder, 2 mit ADHS und 4 sehr leistungsstarke Kinder, Bruchrechnen, 45 Minuten' }
      })
    );
    const groups = plan.lerngruppenUndMatrix as Array<{ id: string; count?: number }>;
    expect(groups.find((g) => g.id === 'daz')?.count).toBe(5);
    expect(groups.find((g) => g.id === 'vertiefung')?.count).toBe(4);
    expect(groups.find((g) => g.id === 'regel')?.count).toBe(17);
    // Each named group gets its own measures, not those of the average learner
    const top = (id: string) => (plan.lerngruppenUndMatrix as Array<{ id: string; matrixTop: string[] }>).find((g) => g.id === id)!.matrixTop.join(' | ');
    expect(top('vertiefung')).toMatch(/Hohe Anforderungen|Erweiterte Ziele|Anspruchsvolle/);
    expect(top('vertiefung')).not.toBe(top('daz'));
    expect(top('daz')).not.toMatch(/Mittlere Anforderungen|Standardziele/);

    const alle = parse(
      await client.callTool({ name: 'build_scenario_plan', arguments: { text: 'Mathematik Klasse 7, 25 Kinder, davon 25 DaZ-Kinder, Bruchrechnen, 45 Minuten' } })
    );
    expect((alle.lerngruppenUndMatrix as Array<{ id: string }>).map((g) => g.id)).toEqual(['daz']);
    expect(plan.erkannteKriterien.fachbereich).toBe('mathe-informatik');

    const ohne = parse(await client.callTool({ name: 'build_scenario_plan', arguments: { text: 'Mathematik Klasse 7, Bruchrechnen, 45 Minuten' } }));
    expect((ohne.lerngruppenUndMatrix as Array<{ id: string }>).map((g) => g.id)).toEqual(['basis', 'regel', 'vertiefung']);
  });
});
