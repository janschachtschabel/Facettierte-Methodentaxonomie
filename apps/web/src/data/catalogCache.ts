import type { CatalogBundle } from '@fmt/core';

export const CACHE_KEY = 'fmt_catalog_bundle_v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ServerMeta {
  versionHash: string;
  llmConfigured: boolean;
  llmModel?: string | null;
  llmAllowByok: boolean;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function isValidBundle(obj: unknown): obj is CatalogBundle {
  if (!obj || typeof obj !== 'object') return false;
  const b = obj as Partial<CatalogBundle>;
  return (
    typeof b.versionHash === 'string' &&
    b.versionHash.length > 0 &&
    Array.isArray(b.bausteine) &&
    b.bausteine.length > 0 &&
    Array.isArray(b.schemes) &&
    Array.isArray(b.facetten) &&
    Array.isArray(b.ketten)
  );
}

export function readCachedBundle(storage: StorageLike): CatalogBundle | null {
  try {
    const raw = storage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isValidBundle(parsed)) {
      storage.removeItem(CACHE_KEY);
      return null;
    }
    return parsed;
  } catch {
    try {
      storage.removeItem(CACHE_KEY);
    } catch {
      // ignore storage quota/privacy errors
    }
    return null;
  }
}

function writeCachedBundle(storage: StorageLike, bundle: CatalogBundle) {
  try {
    storage.setItem(CACHE_KEY, JSON.stringify(bundle));
  } catch {
    // ignore quota errors (e.g. private browsing)
  }
}

export interface LoadCatalogResult {
  bundle: CatalogBundle;
  fromCache: boolean;
  meta: ServerMeta | null;
  revalidated: Promise<ServerMeta | null>;
}

export async function loadCatalogWithCache(
  fetcher: FetchLike = (url, init) => fetch(url, init),
  storage: StorageLike = window.localStorage,
  onUpdated?: (fresh: CatalogBundle, meta: ServerMeta) => void
): Promise<LoadCatalogResult> {
  const cached = readCachedBundle(storage);

  if (cached) {
    const revalidated = (async (): Promise<ServerMeta | null> => {
      try {
        const metaRes = await fetcher('/api/v1/meta', { headers: { Accept: 'application/json' } });
        if (!metaRes.ok) return null;
        const meta = (await metaRes.json()) as ServerMeta;
        if (meta.versionHash && meta.versionHash !== cached.versionHash) {
          const catRes = await fetcher('/api/v1/catalog', { headers: { Accept: 'application/json' } });
          if (catRes.ok) {
            const fresh = (await catRes.json()) as CatalogBundle;
            if (isValidBundle(fresh)) {
              writeCachedBundle(storage, fresh);
              onUpdated?.(fresh, meta);
            }
          }
        }
        return meta;
      } catch {
        return null;
      }
    })();

    return { bundle: cached, fromCache: true, meta: null, revalidated };
  }

  const [catRes, metaRes] = await Promise.all([
    fetcher('/api/v1/catalog', { headers: { Accept: 'application/json' } }),
    fetcher('/api/v1/meta', { headers: { Accept: 'application/json' } }).catch(() => null)
  ]);

  if (!catRes.ok) {
    throw new Error(`Katalog konnte nicht geladen werden (HTTP ${catRes.status}).`);
  }
  const bundle = (await catRes.json()) as CatalogBundle;
  if (!isValidBundle(bundle)) {
    throw new Error('Ungültiges Katalog-Format vom Server.');
  }
  writeCachedBundle(storage, bundle);
  const meta = metaRes && metaRes.ok ? ((await metaRes.json()) as ServerMeta) : null;
  return { bundle, fromCache: false, meta, revalidated: Promise.resolve(meta) };
}
