export const DEFAULT_LLM_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_LLM_MODEL = 'gpt-6-luna';

export interface ServerConfig {
  port: number;
  host: string;
  trustProxy?: number | boolean;
  corsOrigin: string;
  llmBaseUrl: string;
  llmModel: string;
  llmApiKey: string;
  llmReasoningEffort?: string;
  llmAllowByok: boolean;
  llmRateLimitPerMin: number;
  llmTimeoutMs: number;
  llmCacheMax: number;
  llmCacheTtlMs: number;
  /** Per-IP limit per minute for the compute endpoints without LLM (match, plan, adapt …). */
  apiRateLimitPerMin: number;
}

const HOSTNAME_RE =
  /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Validates DOMAIN for Traefik Host(`…`) labels (Hostinger Docker Manager rule):
 * - Empty/unset is valid (first deploy succeeds without variables).
 * - Non-empty MUST be a pure hostname (no http://, https://, path, port, or spaces).
 */
export function validateDomainHost(raw?: string): string | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed) || trimmed.includes('/') || trimmed.includes(':') || /\s/.test(trimmed)) {
    throw new Error(
      `Ungültiger Wert für DOMAIN="${trimmed}": Bitte nur den reinen Hostnamen ohne "https://", Pfad oder Port eintragen (z. B. methoden.deine-domain.de oder srvNNNNNN.hstgr.cloud).`
    );
  }
  if (!HOSTNAME_RE.test(trimmed)) {
    throw new Error(
      `Ungültiger Hostname in DOMAIN="${trimmed}": Erwartet wird ein gültiger DNS-Hostname (z. B. methoden.deine-domain.de).`
    );
  }
  return trimmed;
}

/**
 * Startup hint: behind Traefik (DOMAIN set) without TRUST_PROXY every request seems to come from the proxy,
 * so all users share one rate-limit bucket.
 */
export function proxyHint(domain: string | null, trustProxy: number | boolean | undefined): string | null {
  if (!domain || trustProxy) return null;
  return '[FMT] Hinweis: DOMAIN ist gesetzt, TRUST_PROXY aber nicht. Hinter einem Reverse Proxy teilen sich dann alle Nutzer ein Ratelimit. Für Traefik TRUST_PROXY=1 setzen.';
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function parseTrustProxy(raw?: string): number | boolean {
  const v = (raw || '').trim().toLowerCase();
  if (!v || v === '0' || v === 'false' || v === 'off') return false;
  if (v === 'true') return true;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : false;
}

function isOpenAiUrl(baseUrl: string): boolean {
  try {
    const u = new URL(baseUrl);
    return u.hostname === 'api.openai.com' || u.hostname.endsWith('.openai.com');
  } catch {
    return false;
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const llmBaseUrl = (env.LLM_BASE_URL || DEFAULT_LLM_BASE_URL).replace(/\/+$/, '');
  const explicitKey = (env.LLM_API_KEY || '').trim();
  const disableFallback = explicitKey.toLowerCase() === 'none' || explicitKey.toLowerCase() === 'off';
  // Server-LLM is strictly opt-in via LLM_API_KEY (or explicit LLM_USE_OPENAI_ENV=true).
  // This ensures local/Docker deployments stay fast & Zero-LLM unless intentionally configured.
  const useOpenAiEnv = (env.LLM_USE_OPENAI_ENV || '').trim().toLowerCase() === 'true';
  const openAiFallback =
    !disableFallback && useOpenAiEnv && isOpenAiUrl(llmBaseUrl) ? (env.OPENAI_API_KEY || '').trim() : '';
  const llmApiKey = disableFallback ? '' : explicitKey || openAiFallback;

  return {
    port: Number(env.PORT) || 8080,
    host: env.HOST || '0.0.0.0',
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    corsOrigin: env.CORS_ORIGIN || '*',
    llmBaseUrl,
    llmModel: (env.LLM_MODEL || DEFAULT_LLM_MODEL).trim(),
    llmApiKey,
    llmReasoningEffort: (env.LLM_REASONING_EFFORT || 'low').trim() || 'low',
    llmAllowByok: env.LLM_ALLOW_BYOK !== 'false',
    llmRateLimitPerMin: Number(env.LLM_RATE_LIMIT_PER_MIN) || 20,
    llmTimeoutMs: Number(env.LLM_TIMEOUT_MS) || 90000,
    llmCacheMax: Number(env.LLM_CACHE_MAX) || 500,
    llmCacheTtlMs: Number(env.LLM_CACHE_TTL_MS) || 3600000,
    apiRateLimitPerMin: positiveInt(env.API_RATE_LIMIT_PER_MIN, 300)
  };
}
