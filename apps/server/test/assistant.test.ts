import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig, validateDomainHost } from '../src/config.js';
import { buildChatCompletionBody, isOpenAiReasoningSeries } from '../src/llm/client.js';
import { sanitizeWloSearchWord } from '../src/routes/oer.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIST_DATA = path.join(ROOT, 'dist-data');
const LEITPLANKEN = [
  'Methoden, Reihenfolge und Kernkomponenten sind vorgegeben und werden nicht geändert.',
  'Aussagen zur Wirksamkeit stammen nur aus dem Katalog, mit Grad, Geltung und Bezug.',
  'Kennzeichne, was übernommen und was erzeugt ist.',
  'Beschreibe Gruppen, keine einzelnen Lernenden.'
];

describe('FMT Hybrid LLM Assistant (OpenAI-compatible, Cache, Fallback, BYOK SSRF Guard)', () => {
  let mockServer: http.Server;
  let mockBaseUrl = '';
  let mockCalls = 0;
  let lastMockBody: Record<string, unknown> | null = null;
  let mockBehavior: 'valid' | 'ablauf' | 'bad-json' | 'hallucinated-enum' | 'error' = 'valid';
  let appWithKey: FastifyInstance;
  let appNoKey: FastifyInstance;

  beforeAll(async () => {
    mockServer = http.createServer((req, res) => {
      mockCalls++;
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        if (mockBehavior === 'error') {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'upstream fail' }));
          return;
        }
        const parsed = JSON.parse(body || '{}');
        lastMockBody = parsed;
        const userText = String(parsed.messages?.[1]?.content || '');
        let content = '';
        if (String(parsed.messages?.[0]?.content || '').includes('thematischeTabelle')) {
          content = JSON.stringify({
            thematischeTabelle: [
              {
                key: 'step-0',
                methodProcedure: 'Konkretes Vorgehen der Methode am Thema.',
                teacherAction: 'Leitet die Erarbeitung am Thema an.',
                learnerAction: 'Erarbeiten das Thema strukturiert.',
                groupAdaptations: { basis: 'Satzstarter nutzen.' },
                materialsAndOer: 'Arbeitsblatt + WLO-OER'
              }
            ]
          });
        } else if (userText.includes('AUSGESTALTUNG')) {
          content = '## Konkrete Ausgestaltung\nNutzen Sie die Bausteine genau wie geprüft.';
        } else if (userText.includes('MATERIALTYP:')) {
          content = '# Gestuftes Arbeitsblatt\n## Aufgaben\n1. Basisaufgabe\n2. Vertiefungsaufgabe';
        } else if (parsed.messages?.[0]?.content?.includes('Binnendifferenzierung')) {
          content = JSON.stringify({
            phasen: {
              'step-0': [
                { groupId: 'basis', groupLabel: 'Basis', measure: 'Satzstarter und Rechenbeispiel bereitstellen.' }
              ]
            }
          });
        } else if (mockBehavior === 'ablauf') {
          content = JSON.stringify({ modus: 'ablauf', zieltyp: 'kooperatives-lernen', zeitMin: 90 });
        } else if (mockBehavior === 'bad-json') {
          content = 'Das ist kein JSON!';
        } else if (mockBehavior === 'hallucinated-enum') {
          content = JSON.stringify({ bildungsstufe: 'hogwarts', lernfunktion: ['zaubern'], zeitMin: 45 });
        } else {
          content = JSON.stringify({
            modus: 'phase',
            lernfunktion: ['orientierung'],
            bildungsstufe: 'sek1',
            zeitMin: 15,
            gruppe: 26,
            maxTechnik: 't-keine'
          });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content } }] }));
      });
    });

    await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
    const addr = mockServer.address() as { port: number };
    mockBaseUrl = `http://127.0.0.1:${addr.port}/v1`;

    appWithKey = await buildApp({
      distDataDir: DIST_DATA,
      config: {
        port: 0,
        host: '127.0.0.1',
        corsOrigin: '*',
        llmBaseUrl: mockBaseUrl,
        llmModel: 'mock-mini',
        llmApiKey: 'sk-server-secret',
        llmAllowByok: true,
        llmRateLimitPerMin: 100,
        llmTimeoutMs: 5000,
        llmCacheMax: 100,
        llmCacheTtlMs: 60000
      }
    });
    await appWithKey.ready();

    appNoKey = await buildApp({
      distDataDir: DIST_DATA,
      config: {
        port: 0,
        host: '127.0.0.1',
        corsOrigin: '*',
        llmBaseUrl: mockBaseUrl,
        llmModel: 'mock-mini',
        llmApiKey: '',
        llmAllowByok: true,
        llmRateLimitPerMin: 100,
        llmTimeoutMs: 5000,
        llmCacheMax: 100,
        llmCacheTtlMs: 60000
      }
    });
    await appNoKey.ready();
  });

  afterAll(async () => {
    await appWithKey.close();
    await appNoKey.close();
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  });

  it('translates free text with LLM and caches identical requests', async () => {
    mockBehavior = 'valid';
    mockCalls = 0;

    const r1 = await appWithKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/translate',
      payload: { text: 'Ich brauche einen aktivierenden Einstieg zum Thema Fotosynthese, 7. Klasse, 15 Minuten' }
    });
    expect(r1.statusCode).toBe(200);
    const j1 = r1.json();
    expect(j1.quelle).toBe('llm');
    expect(j1.gecacht).toBe(false);
    expect(j1.anfrage.bildungsstufe).toBe('sek1');
    expect(j1.erkanntesFach).toBe('Biologie');
    expect(j1.erkanntesThema).toContain('Fotosynthese');
    expect(j1.ergebnis.modus).toBe('phase');
    expect(mockCalls).toBe(1);

    const r2 = await appWithKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/translate',
      payload: { text: 'Ich brauche einen aktivierenden Einstieg zum Thema Fotosynthese, 7. Klasse, 15 Minuten' }
    });
    expect(r2.statusCode).toBe(200);
    expect(r2.json().gecacht).toBe(true);
    expect(mockCalls).toBe(1);
  });

  it('keeps the request text in the AI path, so named methods still count (Runde 5, P1)', async () => {
    mockBehavior = 'ablauf';
    const r = await appWithKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/translate',
      payload: { text: 'Geschichte Klasse 9, Industrialisierung mit einem Gruppenpuzzle erarbeiten, 90 Minuten' }
    });
    expect(r.statusCode).toBe(200);
    const j = r.json();
    expect(j.quelle).toBe('llm');
    expect(j.anfrage.text).toContain('Gruppenpuzzle');
    expect(JSON.stringify(j.ergebnis.arrangement)).toContain('"gruppenpuzzle"');
    mockBehavior = 'valid';
  });

  it('falls back cleanly to deterministic lesen() on bad JSON, hallucinated enums, or upstream error (Review Focus #2)', async () => {
    mockBehavior = 'bad-json';
    const rBad = await appWithKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/translate',
      payload: { text: 'Sicherung Klasse 8, 10 Minuten, ohne Geräte' }
    });
    expect(rBad.statusCode).toBe(200);
    expect(rBad.json().quelle).toBe('regeln-fallback');
    expect(rBad.json().ergebnis.kriterien.zeitMin).toBe(10);

    mockBehavior = 'hallucinated-enum';
    const rHallu = await appWithKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/translate',
      payload: { text: 'Diagnose Grundschule, 5 Minuten' }
    });
    expect(rHallu.statusCode).toBe(200);
    expect(rHallu.json().quelle).toBe('regeln-fallback');

    mockBehavior = 'error';
    const rErr = await appWithKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/translate',
      payload: { text: 'Einstieg 15 Minuten' }
    });
    expect(rErr.statusCode).toBe(200);
    expect(rErr.json().quelle).toBe('regeln-fallback');
  });

  it('works in zero-key mode (translate via fallback, elaborate returns 503 with clear German message)', async () => {
    const t = await appNoKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/translate',
      payload: { text: 'Sicherung Klasse 7, 10 Minuten' }
    });
    expect(t.statusCode).toBe(200);
    expect(t.json().quelle).toBe('regeln-fallback');

    const dichte = (await appNoKey.inject({ method: 'GET', url: '/beispiele/dichte-reihe.jsonld' })).json();
    const e = await appNoKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/elaborate',
      payload: { arrangement: dichte, thema: 'Dichte', fach: 'Physik' }
    });
    expect(e.statusCode).toBe(503);
    expect(e.json().fehler).toMatch(/LLM|API-Key/i);
  });

  it('elaborates a validated arrangement via parallel sub-prompts and includes all 4 FMT guardrails', async () => {
    mockBehavior = 'valid';
    const callsBefore = mockCalls;
    const dichte = (await appWithKey.inject({ method: 'GET', url: '/beispiele/dichte-reihe.jsonld' })).json();
    const res = await appWithKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/elaborate',
      payload: { arrangement: dichte, thema: 'Dichte von Stoffen', fach: 'Physik' }
    });
    expect(res.statusCode).toBe(200);
    const j = res.json();
    expect(j.pruefung.gueltig).toBe(true);
    expect(j.ausarbeitung).toContain('Ausgestaltung');
    expect(j.thematischeTabelle.length).toBeGreaterThan(3);
    expect(j.thematischeTabelle[0].methodProcedure).toContain('Konkretes Vorgehen');
    expect(j.meta.teilprompts).toBeGreaterThan(2);
    expect(j.meta.fehlgeschlagen).toBe(0);
    expect(mockCalls - callsBefore).toBe(j.meta.teilprompts);
    expect(j.leitplanken.length).toBe(4);
  });

  it('rejects arbitrary BYOK baseUrl to prevent SSRF and never leaks or caches BYOK keys (Review Focus #3)', async () => {
    mockBehavior = 'valid';
    const ssrf = await appNoKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/translate',
      headers: {
        'x-llm-api-key': 'sk-user-secret-999',
        'x-llm-provider': 'http://169.254.169.254/latest/meta-data'
      },
      payload: { text: 'Einstieg 10 Minuten' }
    });
    expect(ssrf.statusCode).toBe(400);
    expect(ssrf.body).not.toContain('sk-user-secret-999');

    const ssrfBaseUrlHeader = await appNoKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/translate',
      headers: {
        'x-llm-api-key': 'sk-user-secret-999',
        'x-llm-base-url': 'http://169.254.169.254/v1'
      },
      payload: { text: 'Einstieg 10 Minuten' }
    });
    expect(ssrfBaseUrlHeader.statusCode).toBe(400);
    expect(ssrfBaseUrlHeader.body).not.toContain('sk-user-secret-999');

    const ssrfProviderNoKey = await appNoKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/translate',
      headers: { 'x-llm-provider': 'http://localhost:11434/v1' },
      payload: { text: 'Einstieg 10 Minuten' }
    });
    expect(ssrfProviderNoKey.statusCode).toBe(400);

    const ssrfBodyBaseUrl = await appNoKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/translate',
      payload: { text: 'Einstieg 10 Minuten', baseUrl: 'http://169.254.169.254/v1' }
    });
    expect(ssrfBodyBaseUrl.statusCode).toBe(400);

    // Allowed BYOK provider 'server' uses server's configured mockBaseUrl with user's key and bypasses shared cache
    const before = mockCalls;
    const byok1 = await appNoKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/translate',
      headers: { 'x-llm-api-key': 'sk-user-secret-999', 'x-llm-provider': 'server' },
      payload: { text: 'BYOK Anfrage Fotosynthese' }
    });
    expect(byok1.statusCode).toBe(200);
    expect(byok1.json().quelle).toBe('llm');
    expect(byok1.json().gecacht).toBe(false);
    expect(byok1.body).not.toContain('sk-user-secret-999');
    expect(mockCalls).toBe(before + 1);
  });

  it('keeps server LLM strictly opt-in via LLM_API_KEY (or LLM_USE_OPENAI_ENV=true) and adapts GPT-5/GPT-6 parameters', async () => {
    // Strictly Zero-LLM unless LLM_API_KEY (or explicit LLM_USE_OPENAI_ENV=true) is set
    const cfgNoExplicit = loadConfig({ OPENAI_API_KEY: 'sk-os-test-key' });
    expect(cfgNoExplicit.llmBaseUrl).toBe('https://api.openai.com/v1');
    expect(cfgNoExplicit.llmModel).toBe('gpt-6-luna');
    expect(cfgNoExplicit.llmApiKey).toBe('');

    const cfgExplicit = loadConfig({ LLM_API_KEY: 'sk-explicit-key' });
    expect(cfgExplicit.llmApiKey).toBe('sk-explicit-key');

    const cfgOptInOpenAi = loadConfig({ OPENAI_API_KEY: 'sk-os-test-key', LLM_USE_OPENAI_ENV: 'true' });
    expect(cfgOptInOpenAi.llmApiKey).toBe('sk-os-test-key');

    const cfgDisabled = loadConfig({ OPENAI_API_KEY: 'sk-os-test-key', LLM_USE_OPENAI_ENV: 'true', LLM_API_KEY: 'none' });
    expect(cfgDisabled.llmApiKey).toBe('');

    const cfgNonOpenAi = loadConfig({
      OPENAI_API_KEY: 'sk-os-test-key',
      LLM_USE_OPENAI_ENV: 'true',
      LLM_BASE_URL: 'https://api.mistral.ai/v1'
    });
    expect(cfgNonOpenAi.llmApiKey).toBe('');

    // Hostinger Docker Manager DOMAIN validation (empty allowed for first deploy; https:// rejected loudly)
    expect(validateDomainHost(undefined)).toBeNull();
    expect(validateDomainHost('')).toBeNull();
    expect(validateDomainHost('methoden.example.de')).toBe('methoden.example.de');
    expect(validateDomainHost('srv123456.hstgr.cloud')).toBe('srv123456.hstgr.cloud');
    expect(() => validateDomainHost('https://methoden.example.de')).toThrow(/reinen Hostnamen/i);
    expect(() => validateDomainHost('http://methoden.example.de/')).toThrow(/reinen Hostnamen/i);
    expect(() => validateDomainHost('methoden.example.de/pfad')).toThrow(/reinen Hostnamen/i);
    expect(() => validateDomainHost('methoden.example.de:443')).toThrow(/reinen Hostnamen/i);

    for (const m of ['gpt-5', 'gpt-5-mini', 'gpt-5.4-mini', 'gpt-5.6-luna', 'gpt-6-luna', 'gpt-6-sol', 'gpt-6.2-astra', 'o3-mini']) {
      expect(isOpenAiReasoningSeries(m)).toBe(true);
      const body = buildChatCompletionBody({ model: m }, [{ role: 'user', content: 'JSON bitte' }], {
        jsonMode: true,
        maxTokens: 600,
        reasoningEffort: 'low'
      });
      expect(body.max_completion_tokens).toBeGreaterThanOrEqual(4000);
      expect(body.max_tokens).toBeUndefined();
      expect(body.temperature).toBeUndefined();
      expect(body.reasoning_effort).toBe('low');
      expect(body.response_format).toEqual({ type: 'json_object' });

      const bigBody = buildChatCompletionBody({ model: m }, [{ role: 'user', content: 'Große Ausarbeitung' }], {
        jsonMode: true,
        maxTokens: 8000,
        reasoningEffort: 'low'
      });
      expect(bigBody.max_completion_tokens).toBe(16000);
    }

    for (const m of ['gpt-4o-mini', 'gemini-2.5-flash', 'mistral-small-latest']) {
      expect(isOpenAiReasoningSeries(m)).toBe(false);
      const body = buildChatCompletionBody({ model: m }, [{ role: 'user', content: 'JSON bitte' }], {
        jsonMode: true,
        maxTokens: 600
      });
      expect(body.max_tokens).toBe(600);
      expect(body.temperature).toBe(0.2);
      expect(body.max_completion_tokens).toBeUndefined();
      expect(body.reasoning_effort).toBeUndefined();
    }

    // End-to-end wire payload verification for gpt-6-luna
    mockBehavior = 'valid';
    lastMockBody = null;
    const wire = await appNoKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/translate',
      headers: {
        'x-llm-api-key': 'sk-byok-wire',
        'x-llm-provider': 'server',
        'x-llm-model': 'gpt-6-luna'
      },
      payload: { text: 'Einstieg Fotosynthese 15 Minuten' }
    });
    expect(wire.statusCode).toBe(200);
    expect(wire.json().quelle).toBe('llm');
    expect(lastMockBody?.model).toBe('gpt-6-luna');
    expect(lastMockBody?.max_completion_tokens).toBeGreaterThanOrEqual(1000);
    expect(lastMockBody?.max_tokens).toBeUndefined();
    expect(lastMockBody?.temperature).toBeUndefined();
    expect(lastMockBody?.reasoning_effort).toBe('low');
  });

  it('supports AI differentiation, classroom material generation, and WLO OER input validation', async () => {
    mockBehavior = 'valid';
    const diffRes = await appWithKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/differentiate',
      payload: {
        fach: 'Mathematik',
        thema: 'Bruchrechnen',
        gruppen: [{ id: 'basis', label: 'Basis', profile: 'Geringes Vorwissen' }],
        phases: [{ key: 'step-0', phaseLabel: 'P1', methodId: 'loesungsbeispiele', durationMin: 25 }]
      }
    });
    expect(diffRes.statusCode).toBe(200);
    expect(diffRes.json().vorschlaege['step-0'][0].measure).toContain('Satzstarter');

    const matRes = await appWithKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/material',
      payload: {
        baustein: 'loesungsbeispiele',
        fach: 'Mathematik',
        thema: 'Bruchrechnen',
        materialTyp: 'arbeitsblatt',
        gruppen: [{ label: 'Basis', profile: 'Geringes Vorwissen' }]
      }
    });
    expect(matRes.statusCode).toBe(200);
    expect(matRes.json().material).toContain('Gestuftes Arbeitsblatt');

    // WLO search rejects empty query with clean 400 and strips German articles & didactic filler words (edu-sharing Trap 2.8)
    expect(sanitizeWloSearchWord('die Bruchrechnung für die Klasse 6')).toBe('Bruchrechnung');
    expect(sanitizeWloSearchWord('Dichte von Stoffen im Physik Unterricht')).toBe('Dichte Stoffen Physik');
    expect(sanitizeWloSearchWord('das Konzept Dichte verstehen')).toBe('Dichte');
    const badWlo = await appWithKey.inject({
      method: 'POST',
      url: '/api/v1/oer/wlo-search',
      payload: {}
    });
    expect(badWlo.statusCode).toBe(400);

    // Zero-LLM material template generation works cleanly without any API key (200 deterministisch)
    const zeroKeyMat = await appNoKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/material',
      payload: {
        baustein: 'vbe',
        fach: 'Physik',
        thema: 'Dichte von Stoffen',
        materialTyp: 'versuchsanleitung',
        gruppen: [{ label: 'Basis', profile: 'DaZ', matrixMeasures: ['Visuelle Medien', 'Satzstarter'] }]
      }
    });
    expect(zeroKeyMat.statusCode).toBe(200);
    expect(zeroKeyMat.json().quelle).toBe('deterministisch');
    expect(zeroKeyMat.json().material).toContain('Beobachtungs- & Versuchsanleitung');
    expect(zeroKeyMat.json().material).toContain('Visuelle Medien');

    // Zero-LLM hybrid free-text classification endpoint (/api/v1/classify)
    const cls = await appNoKey.inject({
      method: 'POST',
      url: '/api/v1/classify',
      payload: {
        text: 'Kooperatives und spielerisches Lernen mit 2 x 45 Minuten in der 7. Klasse, viele DaZ-Kinder und ein Schüler mit ADHS, Partnerarbeit ohne Vorbereitung'
      }
    });
    expect(cls.statusCode).toBe(200);
    const cj = cls.json();
    expect(cj.kriterien.zeitMin).toBe(90);
    expect(cj.kriterien.bildungsstufe).toBe('sek1');
    expect(cj.kriterien.ansatz).toContain('kooperativ');
    expect(cj.kriterien.ansatz).toContain('spiel-simulation');
    expect(cj.kriterien.interaktion).toContain('partner');
    expect(cj.kriterien.maxVorbereitung).toBe(5);
    expect(cj.matrixMerkmale.selectedValues.sprachkompetenz).toBe('sprachkompetenz-gering');
    expect(cj.matrixMerkmale.selectedValues.strukturierung).toBe('strukturierung-stark');
    expect(cj.methodenVorschlaege.length).toBeGreaterThan(0);

    // A help is never a method suggestion, also when the text names it (Task D7).
    const bundle = JSON.parse(readFileSync(path.join(DIST_DATA, 'catalog.bundle.json'), 'utf8')) as { bausteine: Array<{ kennung: string; eintragsart?: string }> };
    const hilfen = new Set(bundle.bausteine.filter((b) => b.eintragsart === 'hilfe').map((b) => b.kennung));
    expect(hilfen.size).toBeGreaterThan(0);
    const clsH = await appNoKey.inject({
      method: 'POST',
      url: '/api/v1/classify',
      payload: { text: 'Sprachvergleich: Herkunftssprache und Deutsch vergleichen, Satzmuster und Redemittel, Scaffolding' }
    });
    expect(clsH.statusCode).toBe(200);
    const vorschlaegeH = (clsH.json().methodenVorschlaege as Array<{ kennung: string }>).map((m) => m.kennung);
    expect(vorschlaegeH.length).toBeGreaterThan(0);
    expect(vorschlaegeH.filter((k) => hilfen.has(k))).toEqual([]);

    // Ultra-fast Zero-LLM scenario pre-filtering + caller-LLM briefing endpoint (/api/v1/plan)
    const planRes = await appNoKey.inject({
      method: 'POST',
      url: '/api/v1/plan',
      payload: {
        text: 'Kooperatives Lernen 2 x 45 Minuten in der 7. Klasse, mehrere DaZ-Kinder, Thema Nachhaltigkeit bei Lebensmitteln',
        includeWloOer: false
      }
    });
    expect(planRes.statusCode).toBe(200);
    const pj = planRes.json();
    expect(pj.pruefung.gueltig).toBe(true);
    expect(pj.erkannteKriterien.zeitMin).toBe(90);
    expect(pj.erkannteMatrixSignale.length).toBeGreaterThan(0);
    expect(pj.llmBriefing.systemPrompt).toContain('FMT');
    expect(pj.llmBriefing.userPrompt).toContain('Nachhaltigkeit');

    // Zero-LLM Prompt-Briefing endpoint (/api/v1/assistant/briefing) for external & browser-direct LLMs
    const briefTranslate = await appNoKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/briefing',
      payload: { task: 'translate', payload: { text: 'Einstieg Fotosynthese Klasse 7, 15 Minuten' } }
    });
    expect(briefTranslate.statusCode).toBe(200);
    expect(briefTranslate.json().llmBriefing.jsonMode).toBe(true);
    expect(briefTranslate.json().vorfilterung.kriterien.zeitMin).toBe(15);

    const briefMat = await appNoKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/briefing',
      payload: { task: 'material', payload: { baustein: 'abrufquiz', fach: 'Biologie', thema: 'Fotosynthese', materialTyp: 'quiz' } }
    });
    expect(briefMat.statusCode).toBe(200);
    expect(briefMat.json().fallbackMaterial).toContain('Fotosynthese');
    expect(briefMat.json().llmBriefing.userPrompt).toContain('MATERIALTYP: quiz');
  });
  it('caps the number of parallel LLM sub-prompts for very long arrangements (cost amplification guard)', async () => {
    mockBehavior = 'valid';
    const callsBefore = mockCalls;
    const arrangement = {
      '@context': 'https://w3id.org/fmt/context.jsonld',
      typ: 'Arrangement',
      name: 'Sehr lange Reihe',
      ablauf: { typ: 'Sequenz', teile: Array.from({ length: 60 }, () => ({ typ: 'Einsatz', baustein: 'abrufquiz' })) }
    };
    const res = await appWithKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/elaborate',
      payload: { arrangement, thema: 'Lange Reihe ' + Date.now(), fach: 'Mathematik' }
    });
    expect(res.statusCode).toBe(200);
    const j = res.json();
    expect(j.thematischeTabelle.length).toBe(60);
    expect(j.meta.teilprompts).toBeLessThanOrEqual(9);
    expect(mockCalls - callsBefore).toBeLessThanOrEqual(9);
  });
  it('Entwurf im Briefing: sieben Kernfelder, Begriffe des Profils, vier Leitplanken, keine Vorgabe „Sekundarstufe I“ (Paket D, D2)', async () => {
    const dichte = (await appNoKey.inject({ method: 'GET', url: '/beispiele/dichte-reihe.jsonld' })).json();
    const ohneStufe = { ...dichte, kontext: { ...(dichte.kontext || {}), bildungsstufe: undefined } };
    const brief = await appNoKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/briefing',
      payload: { task: 'elaborate', payload: { arrangement: ohneStufe, thema: 'Dichte', fach: 'Physik' } }
    });
    expect(brief.statusCode).toBe(200);
    const b = brief.json();
    for (const satz of LEITPLANKEN) expect(b.llmBriefing.systemPrompt, satz).toContain(satz);
    expect(b.entwurf.kernfelder.map((k: { id: string }) => k.id)).toEqual(['rahmendaten', 'lernvoraussetzungen', 'ziele', 'einordnung', 'verlauf', 'lernerfolg', 'reflexion']);
    expect(b.entwurf.planungsprofil).toMatchObject({ id: 'schule', angenommen: true });
    expect(JSON.stringify(b)).not.toContain('Sekundarstufe I');
    expect(b.fallbackMarkdown).toContain('Bildungsstufe nicht angegeben');

    const kurs = (
      await appNoKey.inject({
        method: 'POST',
        url: '/api/v1/assistant/briefing',
        payload: { task: 'elaborate', payload: { arrangement: dichte, thema: 'Dichte', fach: 'Physik', planungsprofil: 'erwachsenenbildung' } }
      })
    ).json();
    expect(kurs.fallbackMarkdown).toContain('Tätigkeit der Kursleitung');
    expect(kurs.llmBriefing.systemPrompt).toContain('Tätigkeit der Kursleitung');
    expect(kurs.fallbackMarkdown).toContain('Kursverlaufsplan');
  });

  it('Material ohne Bildungsstufe: „Bildungsstufe nicht angegeben“ statt „Sekundarstufe I“, Begriffe des Profils (Paket D, D2)', async () => {
    const briefMat = (
      await appNoKey.inject({
        method: 'POST',
        url: '/api/v1/assistant/briefing',
        payload: { task: 'material', payload: { baustein: 'abrufquiz', fach: 'Biologie', thema: 'Fotosynthese', materialTyp: 'quiz' } }
      })
    ).json();
    expect(briefMat.llmBriefing.userPrompt).toContain('Bildungsstufe nicht angegeben');
    expect(JSON.stringify(briefMat)).not.toContain('Sekundarstufe I');
    const hs = (
      await appNoKey.inject({
        method: 'POST',
        url: '/api/v1/assistant/briefing',
        payload: { task: 'material', payload: { baustein: 'abrufquiz', thema: 'Statistik', materialTyp: 'quiz', bildungsstufe: 'hochschule' } }
      })
    ).json();
    expect(hs.llmBriefing.userPrompt).toContain('Studierende');
    expect(hs.llmBriefing.userPrompt).toContain('Bildungsstufe: Hochschule');
    expect(hs.fallbackMaterial).toContain('Studierende');

    mockBehavior = 'valid';
    await appWithKey.inject({
      method: 'POST',
      url: '/api/v1/assistant/material',
      payload: { baustein: 'loesungsbeispiele', fach: 'Mathematik', thema: 'Brüche', materialTyp: 'arbeitsblatt' }
    });
    const userPrompt = String((lastMockBody?.messages as Array<{ content: string }>)[1].content);
    expect(userPrompt).toContain('Bildungsstufe nicht angegeben');
    expect(userPrompt).not.toContain('Sekundarstufe I');
  });
  it('Fix D2: Betrieb im Material richtig gebeugt, Leitplanken im Feld leitplanken, angenommenes Profil bleibt angenommen', async () => {
    const mat = (
      await appNoKey.inject({
        method: 'POST',
        url: '/api/v1/assistant/material',
        payload: { baustein: 'abrufquiz', thema: 'Arbeitssicherheit', materialTyp: 'quiz', planungsprofil: 'betrieb', mode: 'template' }
      })
    ).json();
    expect(mat.material).toContain('Hinweise für die Ausbilderin oder den Ausbilder');
    expect(mat.material).not.toContain('oder des Ausbilders (FMT');
    const schule = (
      await appNoKey.inject({ method: 'POST', url: '/api/v1/assistant/material', payload: { baustein: 'abrufquiz', thema: 'Brüche', materialTyp: 'quiz', mode: 'template' } })
    ).json();
    expect(schule.material).toContain('Hinweise für die Lehrkraft');

    const dichte = (await appNoKey.inject({ method: 'GET', url: '/beispiele/dichte-reihe.jsonld' })).json();
    const b = (
      await appNoKey.inject({
        method: 'POST',
        url: '/api/v1/assistant/briefing',
        payload: { task: 'elaborate', payload: { arrangement: dichte, thema: 'Dichte', planungsprofil: 'schule', planungsprofilAngenommen: true } }
      })
    ).json();
    for (const satz of LEITPLANKEN) expect(b.llmBriefing.leitplanken, satz).toContain(satz);
    expect(b.entwurf.planungsprofil.angenommen).toBe(true);
    expect(b.llmBriefing.systemPrompt).toContain('Planungsprofil: Schule (angenommen)');
  });
});
