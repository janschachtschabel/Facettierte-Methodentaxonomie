export const DEFAULT_LLM_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_LLM_MODEL = 'gpt-6-luna';

export interface ServerConfig {
  port: number;
  host: string;
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
    corsOrigin: env.CORS_ORIGIN || '*',
    llmBaseUrl,
    llmModel: (env.LLM_MODEL || DEFAULT_LLM_MODEL).trim(),
    llmApiKey,
    llmReasoningEffort: (env.LLM_REASONING_EFFORT || 'low').trim() || 'low',
    llmAllowByok: env.LLM_ALLOW_BYOK !== 'false',
    llmRateLimitPerMin: Number(env.LLM_RATE_LIMIT_PER_MIN) || 20,
    llmTimeoutMs: Number(env.LLM_TIMEOUT_MS) || 90000,
    llmCacheMax: Number(env.LLM_CACHE_MAX) || 500,
    llmCacheTtlMs: Number(env.LLM_CACHE_TTL_MS) || 3600000
  };
}
