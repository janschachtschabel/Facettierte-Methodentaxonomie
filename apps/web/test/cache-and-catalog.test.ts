import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSearch, type CatalogBundle, type FmtData } from '@fmt/core';
import { loadCatalogWithCache, CACHE_KEY } from '../src/data/catalogCache.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const EXPECTED_METHOD_COUNT = fs.readdirSync(path.join(ROOT, 'data', 'bausteine')).filter((f) => f.endsWith('.json')).length;
const BUNDLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist-data', 'catalog.bundle.json'), 'utf8')) as CatalogBundle;

function makeMemoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    }
  };
}

describe('Client Catalog Cache & Fast Faceted Search', () => {
  it('returns cached catalog immediately and skips refetch when versionHash matches /api/v1/meta', async () => {
    const storage = makeMemoryStorage({ [CACHE_KEY]: JSON.stringify(BUNDLE) });
    const fetcher = vi.fn(async (url: string) => {
      if (url === '/api/v1/meta') {
        return new Response(JSON.stringify({ versionHash: BUNDLE.versionHash, llmConfigured: false, llmAllowByok: true }), {
          status: 200
        });
      }
      throw new Error('Unexpected fetch: ' + url);
    });

    const onUpdate = vi.fn();
    const res = await loadCatalogWithCache(fetcher, storage, onUpdate);
    expect(res.fromCache).toBe(true);
    expect(res.bundle.bausteine.length).toBe(EXPECTED_METHOD_COUNT);
    await res.revalidated;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('refreshes cache in background when server versionHash changes', async () => {
    const stale = { ...BUNDLE, versionHash: '0'.repeat(64) };
    const storage = makeMemoryStorage({ [CACHE_KEY]: JSON.stringify(stale) });
    const fetcher = vi.fn(async (url: string) => {
      if (url === '/api/v1/meta') {
        return new Response(JSON.stringify({ versionHash: BUNDLE.versionHash, llmConfigured: true, llmAllowByok: true }), {
          status: 200
        });
      }
      if (url.startsWith('/api/v1/catalog')) {
        return new Response(JSON.stringify(BUNDLE), { status: 200 });
      }
      throw new Error('Unexpected fetch: ' + url);
    });

    const onUpdate = vi.fn();
    const res = await loadCatalogWithCache(fetcher, storage, onUpdate);
    expect(res.fromCache).toBe(true);
    await res.revalidated;
    expect(fetcher).toHaveBeenCalledWith(
      `/api/v1/catalog?v=${encodeURIComponent(BUNDLE.versionHash)}`,
      expect.objectContaining({ cache: 'no-cache' })
    );
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.getItem(CACHE_KEY)!).versionHash).toBe(BUNDLE.versionHash);
  });

  it('silently recovers from corrupted localStorage JSON without crashing (Review Focus #1)', async () => {
    const storage = makeMemoryStorage({ [CACHE_KEY]: '{broken-json' });
    const fetcher = vi.fn(async (url: string) => {
      if (url === '/api/v1/meta') {
        return new Response(JSON.stringify({ versionHash: BUNDLE.versionHash, llmConfigured: false, llmAllowByok: true }), {
          status: 200
        });
      }
      if (url === '/api/v1/catalog') {
        return new Response(JSON.stringify(BUNDLE), { status: 200 });
      }
      throw new Error('Unexpected fetch: ' + url);
    });

    const res = await loadCatalogWithCache(fetcher, storage);
    expect(res.fromCache).toBe(false);
    expect(res.bundle.bausteine.length).toBe(EXPECTED_METHOD_COUNT);
    expect(JSON.parse(storage.getItem(CACHE_KEY)!).versionHash).toBe(BUNDLE.versionHash);

    // Outdated schema (missing required schemes / stub blocks) must also fall back cleanly
    const outdated = makeMemoryStorage({
      [CACHE_KEY]: JSON.stringify({
        version: '0.1.0',
        versionHash: 'outdated-v0',
        bausteine: [{}],
        schemes: [],
        facetten: [],
        ketten: []
      })
    });
    const resOutdated = await loadCatalogWithCache(fetcher, outdated);
    expect(resOutdated.fromCache).toBe(false);
    expect(resOutdated.bundle.bausteine.length).toBe(EXPECTED_METHOD_COUNT);
  });

  it('filters 200 methods client-side in < 20ms including synonyms and ansatz', () => {
    const data: FmtData = {
      VERSION: BUNDLE.version,
      NS: BUNDLE.NS,
      creator: BUNDLE.creator,
      license: BUNDLE.license,
      schemes: BUNDLE.schemes,
      facetten: BUNDLE.facetten,
      ketten: BUNDLE.ketten,
      bausteine: BUNDLE.bausteine,
      beispiele: BUNDLE.beispiele
    };
    const search = createSearch(data);
    const t0 = performance.now();
    const hits1 = search.suche({ text: 'Jigsaw' });
    const hits2 = search.suche({ text: 'Einstieg', maxDauer: 15, maxTechnik: 't-keine' });
    const hits3 = search.suche({ ansatz: 'diskurs' });
    const elapsed = performance.now() - t0;

    expect(hits1.map((b) => b.kennung)).toEqual(['gruppenpuzzle']);
    expect(hits2.length).toBeGreaterThan(3);
    expect(hits3.length).toBeGreaterThanOrEqual(10);
    expect(elapsed).toBeLessThan(20);
  });
});
