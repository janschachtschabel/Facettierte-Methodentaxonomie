import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig, type ServerConfig } from '../src/config.js';
import { wloSubjectFilter } from '../src/routes/oer.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIST_DATA = path.join(ROOT, 'dist-data');
const DISCIPLINE = 'http://w3id.org/openeduhub/vocabs/discipline/';

const baseConfig = (over: Partial<ServerConfig> = {}): ServerConfig => ({
  ...loadConfig({}),
  host: '127.0.0.1',
  llmBaseUrl: '',
  llmApiKey: '',
  llmRateLimitPerMin: 1000,
  apiRateLimitPerMin: 100000,
  ...over
});

describe('Folgeschritte: Fachbereich als WLO-Filter und frühere Kennungen', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ distDataDir: DIST_DATA, config: baseConfig() });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('filtert mit dem genannten Fach, sonst mit den OEH-Fächern des Fachbereichs', () => {
    expect(wloSubjectFilter('Mathematik', 'mathe-informatik')).toEqual({ art: 'fach', uris: [`${DISCIPLINE}380`] });
    const sprachen = wloSubjectFilter('', 'sprachen');
    expect(sprachen.art).toBe('fachbereich');
    expect(sprachen.uris).toEqual(expect.arrayContaining([`${DISCIPLINE}120`, `${DISCIPLINE}20001`]));
    expect(sprachen.uris.length).toBeGreaterThan(5);
    // A subject word the vocabulary does not know falls back to the area.
    expect(wloSubjectFilter('Quatschfach', 'nawi-technik').art).toBe('fachbereich');
    expect(wloSubjectFilter('', 'uebergreifend')).toEqual({ art: null, uris: [] });
    expect(wloSubjectFilter('', 'constructor')).toEqual({ art: null, uris: [] });
    expect(wloSubjectFilter('', undefined)).toEqual({ art: null, uris: [] });
  });

  it('schickt die Fächer des Fachbereichs als Filter an WLO und nennt den Filter in der Antwort', async () => {
    const bodies: Array<{ criteria: Array<{ property: string; values: string[] }> }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: string }) => {
        bodies.push(JSON.parse(init.body));
        const nodes = Array.from({ length: 5 }, (_, i) => ({
          ref: { id: `n${i}` },
          properties: { 'cclom:title': [`Treffer ${i}`], 'ccm:wwwurl': [`https://example.org/fb/${i}`] }
        }));
        return { ok: true, status: 200, json: async () => ({ nodes }) };
      })
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/oer/wlo-search',
      payload: { query: 'Wegbeschreibung Folgeschritte', fachbereich: 'sprachen', bildungsstufe: 'sek1' }
    });
    expect(res.statusCode).toBe(200);
    const taxon = bodies[0].criteria.find((c) => c.property === 'virtual:taxonid');
    expect(taxon?.values).toEqual(expect.arrayContaining([`${DISCIPLINE}120`, `${DISCIPLINE}20001`]));
    expect(res.json().fachfilter).toMatchObject({ art: 'fachbereich', fachbereich: 'sprachen' });
    expect(res.json().fachfilter.faecher.length).toBe(taxon!.values.length);
  });

  it('sucht auch nur mit Fachbereich nicht ohne Suchbegriff', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/oer/wlo-search', payload: { fachbereich: 'sprachen' } });
    expect(res.statusCode).toBe(400);
  });

  it('beantwortet die frühere Kennung einer zusammengeführten Methode', async () => {
    const api = await app.inject({ method: 'GET', url: '/api/v1/methods/dreischritt-interview' });
    expect(api.statusCode).toBe(200);
    expect(api.json().kennung).toBe('drei-schritt-interview');

    const html = await app.inject({ method: 'GET', url: '/baustein/dreischritt-interview', headers: { accept: 'text/html' } });
    expect(html.statusCode).toBe(302);
    expect(html.headers.location).toBe('/methoden/drei-schritt-interview');

    const ld = await app.inject({ method: 'GET', url: '/baustein/dreischritt-interview', headers: { accept: 'application/ld+json' } });
    expect(ld.statusCode).toBe(200);
    expect(ld.body).toContain('drei-schritt-interview');

    const unknown = await app.inject({ method: 'GET', url: '/api/v1/methods/gibt-es-nicht' });
    expect(unknown.statusCode).toBe(404);
  });
});
