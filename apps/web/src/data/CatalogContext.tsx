import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  createMatcher,
  KennungIndex,
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
import { CACHE_KEY, getSafeLocalStorage, loadCatalogWithCache, type ServerMeta } from './catalogCache.js';

export type LlmProviderId =
  | 'openai'
  | 'gemini'
  | 'mistral'
  | 'openrouter'
  | 'academiccloud'
  | 'groq'
  | 'ollama'
  | 'lmstudio'
  | 'custom'
  | 'server';

export interface ByokSettings {
  enabled: boolean;
  apiKey: string;
  provider: LlmProviderId;
  baseUrl: string;
  model: string;
  directBrowser: boolean;
  persistLocal: boolean;
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
  llmSettingsOpen: boolean;
  setLlmSettingsOpen: (open: boolean) => void;
}

const CatalogContext = createContext<CatalogContextValue | null>(null);
const BYOK_KEY = 'fmt_byok_session_v1';
const BYOK_LOCAL_KEY = 'fmt_byok_local_v2';

export const DEFAULT_BYOK_SETTINGS: ByokSettings = {
  enabled: false,
  apiKey: '',
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-6-luna',
  directBrowser: false,
  persistLocal: false
};

function normalizeByok(p: Partial<ByokSettings> | null | undefined, persistLocal: boolean): ByokSettings {
  if (!p) return { ...DEFAULT_BYOK_SETTINGS };
  const provider = (p.provider || 'openai') as LlmProviderId;
  const directBrowser =
    typeof p.directBrowser === 'boolean'
      ? p.directBrowser
      : provider === 'custom' || provider === 'ollama' || provider === 'lmstudio';
  const enabled = typeof p.enabled === 'boolean' ? p.enabled : Boolean(p.apiKey || (directBrowser && p.baseUrl));
  return {
    enabled,
    apiKey: p.apiKey || '',
    provider,
    baseUrl: p.baseUrl || (provider === 'openai' ? 'https://api.openai.com/v1' : ''),
    model: p.model || '',
    directBrowser,
    persistLocal
  };
}

function readByok(): ByokSettings {
  try {
    const sess = window.sessionStorage.getItem(BYOK_KEY);
    if (sess) return normalizeByok(JSON.parse(sess) as Partial<ByokSettings>, false);
    const loc = window.localStorage.getItem(BYOK_LOCAL_KEY);
    if (loc) return normalizeByok(JSON.parse(loc) as Partial<ByokSettings>, true);
  } catch {
    // ignore
  }
  return { ...DEFAULT_BYOK_SETTINGS };
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
  const [llmSettingsOpen, setLlmSettingsOpen] = useState(false);

  const setByok = (next: ByokSettings) => {
    setByokState(next);
    try {
      window.sessionStorage.removeItem(BYOK_KEY);
      window.localStorage.removeItem(BYOK_LOCAL_KEY);
      if (next.enabled) {
        const serialized = JSON.stringify(next);
        if (next.persistLocal) window.localStorage.setItem(BYOK_LOCAL_KEY, serialized);
        else window.sessionStorage.setItem(BYOK_KEY, serialized);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    let active = true;
    const storage = getSafeLocalStorage();
    loadCatalogWithCache(undefined, storage, (fresh, freshMeta) => {
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
    const empty = {
      search: null,
      validator: null,
      matcher: null,
      blocksById: new Map<string, Baustein>(),
      exampleRegistry: new Map<string, Arrangement>(),
      schemesMap: new Map<string, Scheme>(),
      labelsMap: new Map<string, string>(),
      corrupted: false
    };
    if (!bundle) return empty;
    try {
      const data: FmtData = {
        VERSION: bundle.version,
        NS: bundle.NS,
        creator: bundle.creator,
        license: bundle.license,
        schemes: bundle.schemes,
        facetten: bundle.facetten,
        // A bundle cached before the Einsatzprofil has no levels yet.
        wfelder: bundle.wfelder ?? [],
        arten: bundle.arten ?? [],
        merkmale: bundle.merkmale ?? [],
        ketten: bundle.ketten,
        regeln: bundle.regeln ?? [],
        // A bundle cached before the subgroup table has none; empty means no row triggers.
        teilgruppen: bundle.teilgruppen ?? { merkmale: [], sonst: { antwort: 'hilfe', grundlage: 'U', wohin: '' }, gesperrt: [], gesperrtText: '', abbau: {}, neutral: [] },
        // A bundle cached before the planning profiles has none; the matcher then names no profile.
        planungsprofile: bundle.planungsprofile ?? { kernfelder: [], profile: [] },
        bausteine: bundle.bausteine,
        beispiele: bundle.beispiele,
        faecher: bundle.faecher,
        weiterleitungen: bundle.weiterleitungen
      };
      const validator = createValidator(data);
      const search = createSearch(data, validator);
      const matcher = createMatcher(data, validator);
      // Former ids of merged or renamed methods answer with the current method.
      const blocksById: Map<string, Baustein> = new KennungIndex(
        bundle.bausteine.map((b) => [b.kennung, b] as const),
        bundle.weiterleitungen
      );
      const exampleRegistry = new Map(bundle.beispiele.filter((e) => e['@id']).map((e) => [e['@id']!, e]));
      const schemesMap = new Map(bundle.schemes.map((s) => [s.id, s]));
      const labelsMap = new Map<string, string>();
      for (const s of bundle.schemes) {
        const vals = s.werte || (s.gruppen || []).flatMap((g) => g.werte);
        for (const w of vals) labelsMap.set(`${s.id}:${w.id}`, w.label);
      }
      return { search, validator, matcher, blocksById, exampleRegistry, schemesMap, labelsMap, corrupted: false };
    } catch {
      return { ...empty, corrupted: true };
    }
  }, [bundle]);

  useEffect(() => {
    if (!derived.corrupted) return;
    const storage = getSafeLocalStorage();
    try {
      storage.removeItem(CACHE_KEY);
    } catch {
      // ignore
    }
    setBundle(null);
    setLoading(true);
    loadCatalogWithCache(undefined, storage)
      .then((res) => {
        setBundle(res.bundle);
        setFromCache(false);
        if (res.meta) setMeta(res.meta);
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Fehler beim Laden des Katalogs.');
        setLoading(false);
      });
  }, [derived.corrupted]);

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
    setByok,
    llmSettingsOpen,
    setLlmSettingsOpen
  };

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog must be used inside CatalogProvider');
  return ctx;
}
