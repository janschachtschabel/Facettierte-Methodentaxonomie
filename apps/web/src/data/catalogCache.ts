import type { CatalogBundle } from '@fmt/core';

export const CACHE_KEY = 'fmt_catalog_bundle_v2';

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
  llmByokProviders?: string[];
  embeddingsEngine?: string;
  embeddingsModel?: string | null;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const REQUIRED_SCHEMES = ['reichweite', 'lernzustand', 'technikbedarf', 'lernfunktion', 'ansatz'];

function isValidBundle(obj: unknown): obj is CatalogBundle {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const b = obj as Partial<CatalogBundle>;
  if (
    typeof b.version !== 'string' ||
    !b.version.length ||
    typeof b.versionHash !== 'string' ||
    !b.versionHash.length ||
    !Array.isArray(b.bausteine) ||
    b.bausteine.length === 0 ||
    !Array.isArray(b.schemes) ||
    !Array.isArray(b.facetten) ||
    b.facetten.length === 0 ||
    !Array.isArray(b.ketten) ||
    b.ketten.length === 0 ||
    !Array.isArray(b.beispiele)
  ) {
    return false;
  }
  const schemeMap = new Map(
    b.schemes
      .filter((s) => s && typeof s === 'object' && typeof s.id === 'string')
      .map((s) => [s.id, s])
  );
  for (const id of REQUIRED_SCHEMES) {
    const s = schemeMap.get(id);
    if (!s) return false;
    const vals = Array.isArray(s.werte) ? s.werte : Array.isArray(s.gruppen) ? s.gruppen.flatMap((g) => g?.werte || []) : [];
    if (!vals.length) return false;
  }
  return b.bausteine.every(
    (m) =>
      m &&
      typeof m === 'object' &&
      typeof m.kennung === 'string' &&
      m.kennung.length > 0 &&
      typeof m.name === 'string' &&
      typeof m.reichweite === 'string' &&
      Array.isArray(m.lernfunktion) &&
      Array.isArray(m.evidenz)
  );
}

const MEMORY_STORAGE: StorageLike = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

export function getSafeLocalStorage(): StorageLike {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Privacy mode / restricted iframe SecurityError
  }
  return MEMORY_STORAGE;
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
  storage: StorageLike = getSafeLocalStorage(),
  onUpdated?: (fresh: CatalogBundle, meta: ServerMeta) => void
): Promise<LoadCatalogResult> {
  const cached = readCachedBundle(storage);

  if (cached) {
    const revalidated = (async (): Promise<ServerMeta | null> => {
      try {
        const metaRes = await fetcher('/api/v1/meta', {
          cache: 'no-cache',
          headers: { Accept: 'application/json' }
        });
        if (!metaRes.ok) return null;
        const meta = (await metaRes.json()) as ServerMeta;
        if (meta.versionHash && meta.versionHash !== cached.versionHash) {
          const catUrl = `/api/v1/catalog?v=${encodeURIComponent(meta.versionHash)}`;
          const catRes = await fetcher(catUrl, {
            cache: 'no-cache',
            headers: { Accept: 'application/json' }
          });
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
    fetcher('/api/v1/catalog', { cache: 'no-cache', headers: { Accept: 'application/json' } }),
    fetcher('/api/v1/meta', { cache: 'no-cache', headers: { Accept: 'application/json' } }).catch(() => null)
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
