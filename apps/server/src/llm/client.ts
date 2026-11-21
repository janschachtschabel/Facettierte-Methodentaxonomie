import type { ServerConfig } from '../config.js';

export const BYOK_PROVIDERS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  mistral: 'https://api.mistral.ai/v1',
  openrouter: 'https://openrouter.ai/api/v1'
};

export interface LlmOverride {
  apiKey?: string;
  model?: string;
  provider?: string;
  baseUrl?: string;
}

export interface ResolvedLlmTarget {
  baseUrl: string;
  model: string;
  apiKey: string;
  isByok: boolean;
}

export class ByokValidationError extends Error {}

export function resolveLlmTarget(config: ServerConfig, override?: LlmOverride): ResolvedLlmTarget | null {
  if (override?.baseUrl && override.baseUrl.trim()) {
    throw new ByokValidationError(
      'Benutzerdefinierte LLM-URLs (baseUrl / X-LLM-Base-Url) werden aus Sicherheitsgründen (SSRF-Schutz) nicht über den Server geproxyt. Bitte einen freigegebenen Provider wählen.'
    );
  }

  const rawProviderInput = override?.provider?.trim().toLowerCase() || '';
  if (rawProviderInput && rawProviderInput !== 'server' && !(rawProviderInput in BYOK_PROVIDERS)) {
    throw new ByokValidationError(
      `Ungültiger BYOK-Provider. Erlaubt: server, ${Object.keys(BYOK_PROVIDERS).join(', ')}. Freie URLs werden aus Sicherheitsgründen nicht über den Server geproxyt.`
    );
  }

  const userKey = override?.apiKey?.trim() || '';
  if (userKey) {
    if (!config.llmAllowByok) {
      throw new ByokValidationError('BYOK-Modus ist auf diesem Server deaktiviert.');
    }
    const rawProvider = rawProviderInput || 'server';
    let baseUrl: string;
    if (rawProvider === 'server') {
      if (!config.llmBaseUrl) throw new ByokValidationError('Kein Server-LLM-Endpunkt konfiguriert.');
      baseUrl = config.llmBaseUrl;
    } else {
      baseUrl = BYOK_PROVIDERS[rawProvider];
    }
    const model = override?.model?.trim() || config.llmModel || 'gpt-4o-mini';
    return { baseUrl, model, apiKey: userKey, isByok: true };
  }

  if (!config.llmApiKey || !config.llmBaseUrl) return null;
  return {
    baseUrl: config.llmBaseUrl,
    model: config.llmModel || 'gpt-4o-mini',
    apiKey: config.llmApiKey,
    isByok: false
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function callChatCompletion(
  target: ResolvedLlmTarget,
  messages: ChatMessage[],
  opts: { jsonMode?: boolean; maxTokens?: number; timeoutMs: number }
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const body: Record<string, unknown> = {
      model: target.model,
      messages,
      temperature: 0.2,
      max_tokens: opts.maxTokens ?? 900
    };
    if (opts.jsonMode) {
      body.response_format = { type: 'json_object' };
    }
    const res = await fetch(`${target.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${target.apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!res.ok) {
      throw new Error(`LLM-Anfrage fehlgeschlagen (HTTP ${res.status}).`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      throw new Error('Leere LLM-Antwort.');
    }
    return content;
  } finally {
    clearTimeout(timer);
  }
}

export function extractJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
