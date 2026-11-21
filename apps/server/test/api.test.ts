import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIST_DATA = path.join(ROOT, 'dist-data');

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

  it('serves /healthz and /api/v1/meta with versionHash, block count 200, CC-BY 4.0 and LLM availability', async () => {
    const h = await app.inject({ method: 'GET', url: '/healthz' });
    expect(h.statusCode).toBe(200);
    expect(h.json()).toMatchObject({ status: 'ok' });

    const meta = await app.inject({ method: 'GET', url: '/api/v1/meta' });
    expect(meta.statusCode).toBe(200);
    const body = meta.json();
    expect(body.bausteine).toBe(200);
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
    expect(r1.json().bausteine.length).toBe(200);

    const r2 = await app.inject({ method: 'GET', url: '/api/v1/catalog', headers: { 'if-none-match': etag } });
    expect(r2.statusCode).toBe(304);
    expect(r2.body).toBe('');
  });

  it('filters methods via /api/v1/methods, returns single method, and handles 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/methods?text=jigsaw' });
    expect(res.statusCode).toBe(200);
    expect(res.json().treffer.map((b: { kennung: string }) => b.kennung)).toEqual(['gruppenpuzzle']);

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
