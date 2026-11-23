import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIST_DATA = path.join(ROOT, 'dist-data');
const EXPECTED_METHOD_COUNT = fs.readdirSync(path.join(ROOT, 'data', 'bausteine')).filter((f) => f.endsWith('.json')).length;

describe('FMT Unified Server: REST API, Caching, Linked Data & Content Negotiation', () => {
  let app: FastifyInstance;
  let fakeWebDir: string;

  beforeAll(async () => {
    fakeWebDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fmt-web-test-'));
    fs.writeFileSync(path.join(fakeWebDir, 'index.html'), '<!doctype html><html><body>FMT_SPA_SHELL</body></html>', 'utf8');
    app = await buildApp({
      distDataDir: DIST_DATA,
      webDistDir: fakeWebDir,
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
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(fakeWebDir, { recursive: true, force: true });
  });

  it('serves /healthz and /api/v1/meta with versionHash, dynamic block count, CC-BY 4.0 and LLM availability', async () => {
    const h = await app.inject({ method: 'GET', url: '/healthz' });
    expect(h.statusCode).toBe(200);
    expect(h.json()).toMatchObject({ status: 'ok' });

    const meta = await app.inject({ method: 'GET', url: '/api/v1/meta' });
    expect(meta.statusCode).toBe(200);
    const body = meta.json();
    expect(body.bausteine).toBe(EXPECTED_METHOD_COUNT);
    expect(body.creator).toBe('Jan Schachtschabel');
    expect(body.license).toBe('https://creativecommons.org/licenses/by/4.0/');
    expect(body.versionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(body.llmConfigured).toBe(false);
  });

  it('supports ETag and 304 Not Modified on /api/v1/catalog', async () => {
    const r1 = await app.inject({ method: 'GET', url: '/api/v1/catalog' });
    expect(r1.statusCode).toBe(200);
    const etag = r1.headers.etag as string;
    expect(etag).toBeTruthy();
    expect(r1.json().bausteine.length).toBe(EXPECTED_METHOD_COUNT);

    const r2 = await app.inject({ method: 'GET', url: '/api/v1/catalog', headers: { 'if-none-match': etag } });
    expect(r2.statusCode).toBe(304);
    expect(r2.body).toBe('');
  });

  it('filters methods via /api/v1/methods, returns single method, and handles 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/methods?text=jigsaw' });
    expect(res.statusCode).toBe(200);
    const ids = res.json().treffer.map((b: { kennung: string }) => b.kennung);
    expect(ids).toContain('gruppenpuzzle');
    expect(ids).toContain('partnerpuzzle');

    const one = await app.inject({ method: 'GET', url: '/api/v1/methods/abrufquiz' });
    expect(one.statusCode).toBe(200);
    expect(one.json().kennung).toBe('abrufquiz');

    const miss = await app.inject({ method: 'GET', url: '/api/v1/methods/existiert-nicht' });
    expect(miss.statusCode).toBe(404);
  });

  it('matches scenarios, validates arrangements, and computes replacements via /api/v1/* and v0.7.0 aliases', async () => {
    const m1 = await app.inject({
      method: 'POST',
      url: '/api/v1/match',
      payload: { text: 'Einstieg in der Grundschule, 15 Minuten, 24 Kinder' }
    });
    expect(m1.statusCode).toBe(200);
    expect(m1.json().modus).toBe('phase');
    expect(m1.json().vorschlaege.length).toBeGreaterThan(0);

    const bad = await app.inject({ method: 'POST', url: '/api/v1/match', payload: { zieltyp: 'gibtsnicht' } });
    expect(bad.statusCode).toBe(400);

    const alias = await app.inject({ method: 'GET', url: '/zuordnung?lernfunktion=diagnose&zeitMin=5&gruppe=30' });
    expect(alias.statusCode).toBe(200);
    expect(alias.json().vorschlaege.some((x: { baustein: string }) => x.baustein === 'exit-ticket')).toBe(true);

    const felder = await app.inject({ method: 'GET', url: '/felder' });
    expect(felder.statusCode).toBe(200);
    expect(Array.isArray(felder.json())).toBe(true);

    const schema = await app.inject({ method: 'GET', url: '/schema' });
    expect(schema.statusCode).toBe(200);
    expect(schema.json().title).toBe('FMT-Anfrage');

    const dichte = (await app.inject({ method: 'GET', url: '/beispiele/dichte-reihe.jsonld' })).json();
    const val = await app.inject({ method: 'POST', url: '/api/v1/validate', payload: dichte });
    expect(val.statusCode).toBe(200);
    expect(val.json().gueltig).toBe(true);

    const malformedVal = await app.inject({
      method: 'POST',
      url: '/api/v1/validate',
      payload: { typ: 'Arrangement', name: 'Broken', reichweite: 'r3', ablauf: { typ: 'Sequenz', teile: 'not-array' } }
    });
    expect(malformedVal.statusCode).toBe(200);
    expect(malformedVal.json().gueltig).toBe(false);
    expect(malformedVal.json().meldungen.some((m: { regel: string }) => m.regel === 'R-00')).toBe(true);

    const rep = await app.inject({
      method: 'POST',
      url: '/api/v1/replacements',
      payload: { arrangement: dichte, pfad: '/ablauf/haupt/teile/1' }
    });
    expect(rep.statusCode).toBe(200);
    expect(rep.json().kandidaten.some((c: { baustein: string }) => c.baustein === 'vortrag-prompts')).toBe(true);

    // Parity check: /api/v1/match and /api/v1/plan on starter Doppelstunde + Grundschule 45 min
    const mMathe = await app.inject({
      method: 'POST',
      url: '/api/v1/match',
      payload: {
        text: 'Mathematik Bruchrechnen Doppelstunde Klasse 6, 90 Minuten, geringes Vorwissen',
        ansatz: ['instruktion', 'uebung'],
        gruppe: 26
      }
    });
    expect(mMathe.statusCode).toBe(200);
    const mj = mMathe.json();
    expect(mj.modus).toBe('ablauf');
    expect(mj.kette.id).toBe('prozedur');
    expect(mj.pruefung.gueltig).toBe(true);
    expect(mj.pruefung.dauerMin).toBeLessThanOrEqual(90);

    const pGs = await app.inject({
      method: 'POST',
      url: '/api/v1/plan',
      payload: {
        text: 'Grundschule Klasse 3 Sachunterricht Einzelstunde 45 Minuten Konzept Wasserkreislauf verstehen, geringes Vorwissen, ohne Internet',
        ansatz: ['kooperativ', 'spiel-simulation'],
        gruppe: 24,
        ohneInternet: true,
        includeWloOer: false
      }
    });
    expect(pGs.statusCode).toBe(200);
    const pg = pGs.json();
    expect(pg.pruefung.gueltig).toBe(true);
    expect(pg.pruefung.dauerMin).toBeLessThanOrEqual(45);
    expect(pg.maschinenlesbar['@type']).toBe('FmtScenarioPlan');
    expect(pg.maschinenlesbar.schemaVersion).toBe('1.4');
    expect(pg.maschinenlesbar.thematicRows.length).toBeGreaterThan(0);
    expect(Array.isArray(pg.udlBasis)).toBe(true);
    expect(Array.isArray(pg.konflikte)).toBe(true);

    // New differentiation metadata & standalone /api/v1/adapt endpoint
    const dMeta = await app.inject({ method: 'GET', url: '/api/v1/differentiation/meta' });
    expect(dMeta.statusCode).toBe(200);
    expect(dMeta.json().anzahlMassnahmen).toBe(172);

    const adaptRes = await app.inject({
      method: 'POST',
      url: '/api/v1/adapt',
      payload: {
        scenarioText: 'Mathematik Klasse 4 Bruchteile einführen mit Papierfalten, 45 Minuten, ohne Geräte, ohne Internet',
        lerngruppenText: '5 DaZ-Kinder, 2 Kinder mit ADHS und 4 sehr leistungsstarke Kinder',
        bildungsstufe: 'primar',
        zeitMin: 45
      }
    });
    expect(adaptRes.statusCode).toBe(200);
    const aj = adaptRes.json();
    expect(aj.udlBasis.length).toBeGreaterThan(0);
    expect(aj.konflikte.length).toBeGreaterThan(0);
    expect(aj.teilgruppen.length).toBe(3);
    expect(aj.phasenAnpassungen.length).toBe(3);
    expect(aj.verbindlicheUmsetzungsregeln.length).toBeGreaterThanOrEqual(4);
    expect(aj.udlBasis.every((u: { meta: { technik: string; ebene: string } }) => u.meta.technik === 'analog' && u.meta.ebene !== 'organisation-system')).toBe(true);
  });

  it('serves SKOS Turtle, JSON-LD, canonical w3id.org content negotiation and SPA fallback cleanly (Review Focus #4)', async () => {
    const ttl = await app.inject({ method: 'GET', url: '/vocabs/lernfunktion.ttl' });
    expect(ttl.statusCode).toBe(200);
    expect(ttl.headers['content-type']).toContain('text/turtle');
    expect(ttl.body).toContain('skos:ConceptScheme');

    const ctx = await app.inject({ method: 'GET', url: '/context.jsonld' });
    expect(ctx.statusCode).toBe(200);
    expect(ctx.headers['content-type']).toContain('application/ld+json');

    // Canonical w3id.org IRI /baustein/:kennung with JSON-LD Accept
    const ld = await app.inject({
      method: 'GET',
      url: '/baustein/gruppenpuzzle',
      headers: { accept: 'application/ld+json' }
    });
    expect(ld.statusCode).toBe(200);
    expect(ld.headers['content-type']).toContain('application/ld+json');
    expect(ld.json()['@id']).toBe('https://w3id.org/fmt/baustein/gruppenpuzzle');

    // Canonical w3id.org IRI /baustein/:kennung with HTML Accept redirects to SPA detail page
    const htmlRedirect = await app.inject({
      method: 'GET',
      url: '/baustein/gruppenpuzzle',
      headers: { accept: 'text/html,application/xhtml+xml' }
    });
    expect(htmlRedirect.statusCode).toBe(302);
    expect(htmlRedirect.headers.location).toBe('/methoden/gruppenpuzzle');

    // Canonical /vocab/:scheme/ with Turtle Accept
    const vTtl = await app.inject({
      method: 'GET',
      url: '/vocab/ansatz/',
      headers: { accept: 'text/turtle' }
    });
    expect(vTtl.statusCode).toBe(200);
    expect(vTtl.headers['content-type']).toContain('text/turtle');

    // SPA client-side route hard reload returns index.html
    const spa = await app.inject({
      method: 'GET',
      url: '/methoden/gruppenpuzzle',
      headers: { accept: 'text/html' }
    });
    expect(spa.statusCode).toBe(200);
    expect(spa.body).toContain('FMT_SPA_SHELL');
  });
});
