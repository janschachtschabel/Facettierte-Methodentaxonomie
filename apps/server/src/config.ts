export interface ServerConfig {
  port: number;
  host: string;
  corsOrigin: string;
  llmBaseUrl: string;
  llmModel: string;
  llmApiKey: string;
  llmAllowByok: boolean;
  llmRateLimitPerMin: number;
  llmTimeoutMs: number;
  llmCacheMax: number;
  llmCacheTtlMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: Number(env.PORT) || 8080,
    host: env.HOST || '0.0.0.0',
    corsOrigin: env.CORS_ORIGIN || '*',
    llmBaseUrl: (env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    llmModel: env.LLM_MODEL || 'gpt-4o-mini',
    llmApiKey: (env.LLM_API_KEY || '').trim(),
    llmAllowByok: env.LLM_ALLOW_BYOK !== 'false',
    llmRateLimitPerMin: Number(env.LLM_RATE_LIMIT_PER_MIN) || 20,
    llmTimeoutMs: Number(env.LLM_TIMEOUT_MS) || 20000,
    llmCacheMax: Number(env.LLM_CACHE_MAX) || 500,
    llmCacheTtlMs: Number(env.LLM_CACHE_TTL_MS) || 3600000
  };
}
