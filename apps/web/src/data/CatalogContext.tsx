import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  createMatcher,
  createSearch,
  createValidator,
  type Arrangement,
  type Baustein,
  type CatalogBundle,
  type FmtData,
  type FmtMatcher,
  type FmtSearch,
  type FmtValidator,
  type Scheme,
  type VocabValue
} from '@fmt/core';
import { loadCatalogWithCache, type ServerMeta } from './catalogCache.js';

export interface ByokSettings {
  apiKey: string;
  provider: string;
  model: string;
}

interface CatalogContextValue {
  bundle: CatalogBundle | null;
  meta: ServerMeta | null;
  loading: boolean;
  error: string | null;
  fromCache: boolean;
  refreshNotice: string | null;
  search: FmtSearch | null;
  validator: FmtValidator | null;
  matcher: FmtMatcher | null;
  blocksById: Map<string, Baustein>;
  exampleRegistry: Map<string, Arrangement>;
  labelOf: (schemeId: string, code: string) => string;
  valuesOf: (schemeId: string) => VocabValue[];
  comparePair: [string, string];
  setComparePair: React.Dispatch<React.SetStateAction<[string, string]>>;
  pendingPlannerBlock: string | null;
  queueBlockForPlanner: (kennung: string) => void;
  consumePendingPlannerBlock: () => string | null;
  byok: ByokSettings;
  setByok: (next: ByokSettings) => void;
}

const CatalogContext = createContext<CatalogContextValue | null>(null);
const BYOK_KEY = 'fmt_byok_session_v1';

function readByok(): ByokSettings {
  try {
    const raw = window.sessionStorage.getItem(BYOK_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<ByokSettings>;
      return { apiKey: p.apiKey || '', provider: p.provider || 'openai', model: p.model || '' };
    }
  } catch {
    // ignore
  }
  return { apiKey: '', provider: 'openai', model: '' };
}

export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const [bundle, setBundle] = useState<CatalogBundle | null>(null);
  const [meta, setMeta] = useState<ServerMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);
  const [comparePair, setComparePair] = useState<[string, string]>(['lehrervortrag', 'vortrag-prompts']);
  const [pendingPlannerBlock, setPendingPlannerBlock] = useState<string | null>(null);
  const [byok, setByokState] = useState<ByokSettings>(() => readByok());

  const setByok = (next: ByokSettings) => {
    setByokState(next);
    try {
      if (next.apiKey) window.sessionStorage.setItem(BYOK_KEY, JSON.stringify(next));
      else window.sessionStorage.removeItem(BYOK_KEY);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    let active = true;
    loadCatalogWithCache(undefined, window.localStorage, (fresh, freshMeta) => {
      if (!active) return;
      setBundle(fresh);
      setMeta(freshMeta);
      setRefreshNotice('Katalog im Hintergrund auf neuesten Stand aktualisiert.');
      setTimeout(() => setRefreshNotice(null), 5000);
    })
      .then((res) => {
        if (!active) return;
        setBundle(res.bundle);
        setFromCache(res.fromCache);
        if (res.meta) setMeta(res.meta);
        setLoading(false);
        res.revalidated.then((m) => {
          if (active && m) setMeta(m);
        });
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : 'Fehler beim Laden des Katalogs.');
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const derived = useMemo(() => {
    if (!bundle) {
      return {
        search: null,
        validator: null,
        matcher: null,
        blocksById: new Map<string, Baustein>(),
        exampleRegistry: new Map<string, Arrangement>(),
        schemesMap: new Map<string, Scheme>(),
        labelsMap: new Map<string, string>()
      };
    }
    const data: FmtData = {
      VERSION: bundle.version,
      NS: bundle.NS,
      creator: bundle.creator,
      license: bundle.license,
      schemes: bundle.schemes,
      facetten: bundle.facetten,
      ketten: bundle.ketten,
      bausteine: bundle.bausteine,
      beispiele: bundle.beispiele
    };
    const validator = createValidator(data);
    const search = createSearch(data, validator);
    const matcher = createMatcher(data, validator);
    const blocksById = new Map(bundle.bausteine.map((b) => [b.kennung, b]));
    const exampleRegistry = new Map(bundle.beispiele.filter((e) => e['@id']).map((e) => [e['@id']!, e]));
    const schemesMap = new Map(bundle.schemes.map((s) => [s.id, s]));
    const labelsMap = new Map<string, string>();
    for (const s of bundle.schemes) {
      const vals = s.werte || (s.gruppen || []).flatMap((g) => g.werte);
      for (const w of vals) labelsMap.set(`${s.id}:${w.id}`, w.label);
    }
    return { search, validator, matcher, blocksById, exampleRegistry, schemesMap, labelsMap };
  }, [bundle]);

  const value: CatalogContextValue = {
    bundle,
    meta,
    loading,
    error,
    fromCache,
    refreshNotice,
    search: derived.search,
    validator: derived.validator,
    matcher: derived.matcher,
    blocksById: derived.blocksById,
    exampleRegistry: derived.exampleRegistry,
    labelOf: (schemeId, code) => derived.labelsMap.get(`${schemeId}:${code}`) || code,
    valuesOf: (schemeId) => {
      const s = derived.schemesMap.get(schemeId);
      if (!s) return [];
      return s.werte || (s.gruppen || []).flatMap((g) => g.werte);
    },
    comparePair,
    setComparePair,
    pendingPlannerBlock,
    queueBlockForPlanner: (kennung) => setPendingPlannerBlock(kennung),
    consumePendingPlannerBlock: () => {
      const k = pendingPlannerBlock;
      setPendingPlannerBlock(null);
      return k;
    },
    byok,
    setByok
  };

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog must be used inside CatalogProvider');
  return ctx;
}
