import { DEFAULT_LLM_MODEL, type ServerConfig } from '../config.js';

export const BYOK_PROVIDERS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  mistral: 'https://api.mistral.ai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  groq: 'https://api.groq.com/openai/v1',
  academiccloud: 'https://chat-ai.academiccloud.de/v1',
  deepseek: 'https://api.deepseek.com/v1',
  together: 'https://api.together.xyz/v1'
};

export function isOpenAiReasoningSeries(model: string): boolean {
  const m = model.trim().toLowerCase();
  return /(?:^|\/)(?:gpt-[56](?:[.\-_]|$)|o[134](?:[.\-_]|$))/.test(m);
}

export function supportsReasoningEffort(model: string): boolean {
  const m = model.trim().toLowerCase();
  if (!isOpenAiReasoningSeries(m)) return false;
  if (m.includes('search-api') || /(?:^|\/)o1-(?:mini|preview)/.test(m)) return false;
  return true;
}

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
  if (rawProviderInput && rawProviderInput !== 'server' && !Object.hasOwn(BYOK_PROVIDERS, rawProviderInput)) {
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
    const model = override?.model?.trim() || config.llmModel || DEFAULT_LLM_MODEL;
    return { baseUrl, model, apiKey: userKey, isByok: true };
  }

  if (!config.llmApiKey || !config.llmBaseUrl) return null;
  return {
    baseUrl: config.llmBaseUrl,
    model: config.llmModel || DEFAULT_LLM_MODEL,
    apiKey: config.llmApiKey,
    isByok: false
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  jsonMode?: boolean;
  maxTokens?: number;
  timeoutMs: number;
  reasoningEffort?: string;
}

export function buildChatCompletionBody(
  target: Pick<ResolvedLlmTarget, 'model'>,
  messages: ChatMessage[],
  opts: Pick<ChatCompletionOptions, 'jsonMode' | 'maxTokens' | 'reasoningEffort'>
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: target.model,
    messages
  };

  if (isOpenAiReasoningSeries(target.model)) {
    // OpenAI GPT-5, GPT-6 & o-series count reasoning + output tokens together in max_completion_tokens
    // and reject non-default temperature; give generous headroom so reasoning never starves output.
    const requested = opts.maxTokens ?? 2000;
    body.max_completion_tokens = Math.min(16000, Math.max(requested * 2, opts.jsonMode ? 4000 : 8000));
    if (supportsReasoningEffort(target.model)) {
      body.reasoning_effort = opts.reasoningEffort || 'low';
    }
  } else {
    body.temperature = 0.2;
    body.max_tokens = opts.maxTokens ?? 1600;
  }

  if (opts.jsonMode) {
    body.response_format = { type: 'json_object' };
  }
  return body;
}

export async function callChatCompletion(
  target: ResolvedLlmTarget,
  messages: ChatMessage[],
  opts: ChatCompletionOptions
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const body = buildChatCompletionBody(target, messages, opts);
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
      let detail = '';
      try {
        const errJson = (await res.json()) as { error?: { message?: string } };
        if (errJson?.error?.message) detail = `: ${errJson.error.message.slice(0, 240)}`;
      } catch {
        // ignore non-json upstream error body
      }
      throw new Error(`LLM-Anfrage fehlgeschlagen (HTTP ${res.status})${detail}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ finish_reason?: string; message?: { content?: string } }>;
    };
    const choice = data.choices?.[0];
    const content = choice?.message?.content;
    if (!content || typeof content !== 'string') {
      throw new Error(
        choice?.finish_reason === 'length'
          ? 'LLM-Ausgabe wurde wegen Token-Limit abgeschnitten (bitte kürzeren Umfang wählen).'
          : 'Leere LLM-Antwort.'
      );
    }
    return content;
  } catch (err) {
    if (err instanceof Error && (err.name === 'AbortError' || /aborted/i.test(err.message))) {
      throw new Error(
        `Zeitüberschreitung bei der KI-Antwort (${Math.round(opts.timeoutMs / 1000)} s). Bitte erneut versuchen.`
      );
    }
    throw err;
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
