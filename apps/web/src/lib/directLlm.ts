import type { ByokSettings } from '../data/CatalogContext.js';
import type { ThematicPhaseRow } from '../planner/scenarioModel.js';

export interface OpenAiPreset {
  id: ByokSettings['provider'];
  label: string;
  baseUrl: string;
  defaultModel: string;
  defaultDirect: boolean;
  requiresKey: boolean;
  hint: string;
}

export const OPENAI_PRESETS: OpenAiPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI (api.openai.com)',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-6-luna',
    defaultDirect: false,
    requiresKey: true,
    hint: 'Über Server-Proxy (kein CORS-Problem) oder direkt aus dem Browser nutzbar.'
  },
  {
    id: 'gemini',
    label: 'Google Gemini (OpenAI-kompatibel)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
    defaultDirect: false,
    requiresKey: true,
    hint: 'Offizieller OpenAI-kompatibler Gemini-Endpunkt.'
  },
  {
    id: 'mistral',
    label: 'Mistral AI (EU · api.mistral.ai)',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-small-latest',
    defaultDirect: false,
    requiresKey: true,
    hint: 'Europäischer Anbieter (DSGVO-freundlich).'
  },
  {
    id: 'openrouter',
    label: 'OpenRouter (openrouter.ai)',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    defaultDirect: false,
    requiresKey: true,
    hint: 'Zugriff auf viele offene & kommerzielle Modelle über einen Key.'
  },
  {
    id: 'academiccloud',
    label: 'GWDG Academic Cloud / SAIA (Hochschule DE)',
    baseUrl: 'https://chat-ai.academiccloud.de/v1',
    defaultModel: 'meta-llama-3.1-8b-instruct',
    defaultDirect: false,
    requiresKey: true,
    hint: 'Deutscher Hochschul-KI-Dienst (KISSKI / GWDG).'
  },
  {
    id: 'groq',
    label: 'Groq (api.groq.com)',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    defaultDirect: false,
    requiresKey: true,
    hint: 'Sehr schnelle Open-Weights-Inferenz.'
  },
  {
    id: 'ollama',
    label: 'Ollama (lokal · localhost:11434)',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.2',
    defaultDirect: true,
    requiresKey: false,
    hint: 'Läuft lokal auf deinem Rechner (Direktzugriff aus dem Browser; bei Bedarf OLLAMA_ORIGINS=* setzen).'
  },
  {
    id: 'lmstudio',
    label: 'LM Studio (lokal · localhost:1234)',
    baseUrl: 'http://localhost:1234/v1',
    defaultModel: 'local-model',
    defaultDirect: true,
    requiresKey: false,
    hint: 'Lokaler OpenAI-Server in LM Studio (CORS im LM-Studio-Server aktivieren).'
  },
  {
    id: 'custom',
    label: 'Eigener OpenAI-kompatibler Endpunkt (LiteLLM / vLLM / OpenWebUI)',
    baseUrl: '',
    defaultModel: '',
    defaultDirect: true,
    requiresKey: false,
    hint: 'Direktverbindung aus deinem Browser zu jedem OpenAI-kompatiblen /v1-Endpunkt (Key verlässt den Browser nicht Richtung FMT-Server).'
  }
];

function isReasoningModel(model: string): boolean {
  const m = model.trim().toLowerCase();
  return /(?:^|\/)(?:gpt-[56](?:[.\-_]|$)|o[134](?:[.\-_]|$))/.test(m);
}

export function isUserLlmConfigured(byok: ByokSettings): boolean {
  if (!byok.enabled) return false;
  if (byok.directBrowser) {
    return Boolean(byok.baseUrl.trim() && byok.model.trim());
  }
  return Boolean(byok.apiKey.trim());
}

export function buildServerByokHeaders(byok: ByokSettings): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (byok.enabled && !byok.directBrowser && byok.apiKey.trim()) {
    h['X-LLM-Api-Key'] = byok.apiKey.trim();
    h['X-LLM-Provider'] = byok.provider || 'openai';
    if (byok.model.trim()) h['X-LLM-Model'] = byok.model.trim();
  }
  return h;
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
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

export async function callBrowserDirectChat(
  byok: ByokSettings,
  systemPrompt: string,
  userPrompt: string,
  opts: { jsonMode?: boolean; maxTokens?: number; timeoutMs?: number } = {}
): Promise<string> {
  const baseUrl = byok.baseUrl.trim().replace(/\/+$/, '');
  const model = byok.model.trim();
  if (!baseUrl) throw new Error('Bitte eine OpenAI-kompatible Base-URL in den KI-Einstellungen eintragen.');
  if (!model) throw new Error('Bitte einen Modellnamen in den KI-Einstellungen eintragen.');

  const endpoint = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (byok.apiKey.trim()) {
    headers.Authorization = `Bearer ${byok.apiKey.trim()}`;
  } else {
    headers.Authorization = 'Bearer local-no-key';
  }

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  };
  if (isReasoningModel(model)) {
    const reqTokens = opts.maxTokens ?? 2400;
    body.max_completion_tokens = Math.min(16000, Math.max(reqTokens * 2, opts.jsonMode ? 4000 : 8000));
    body.reasoning_effort = 'low';
  } else {
    body.temperature = 0.2;
    body.max_tokens = opts.maxTokens ?? 2400;
  }
  if (opts.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 90000);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!res.ok) {
      let detail = '';
      try {
        const err = (await res.json()) as { error?: { message?: string } };
        if (err?.error?.message) detail = `: ${err.error.message.slice(0, 220)}`;
      } catch {
        // ignore
      }
      throw new Error(`Direkte LLM-Anfrage fehlgeschlagen (HTTP ${res.status})${detail}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Leere Antwort vom eigenen OpenAI-kompatiblen Endpunkt.');
    return content;
  } catch (err) {
    if (err instanceof TypeError && /fetch|network|cors/i.test(err.message)) {
      throw new Error(
        `Direktverbindung zu ${endpoint} vom Browser blockiert (CORS oder Endpunkt nicht erreichbar). Tipp: Für Ollama OLLAMA_ORIGINS=* setzen oder bei OpenAI/Gemini/Mistral/OpenRouter „Über Server-Proxy“ wählen.`
      );
    }
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Zeitüberschreitung bei der Antwort des eigenen LLM-Endpunkts.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function testOpenAiConnection(byok: ByokSettings): Promise<{ ok: boolean; message: string; ms: number }> {
  const t0 = performance.now();
  try {
    if (byok.directBrowser) {
      const reply = await callBrowserDirectChat(
        byok,
        'Antworte extrem kurz mit OK.',
        'Verbindungstest: Antworte mit OK.',
        { maxTokens: 32, timeoutMs: 15000 }
      );
      const ms = Math.round(performance.now() - t0);
      return { ok: true, ms, message: `Direktverbindung aktiv (${byok.model}, ${ms} ms): „${reply.trim().slice(0, 40)}“` };
    }
    // Proxy-mode test via /api/v1/assistant/translate
    const res = await fetch('/api/v1/assistant/translate', {
      method: 'POST',
      headers: buildServerByokHeaders({ ...byok, enabled: true }),
      body: JSON.stringify({ text: 'Kurzer Einstieg 10 Minuten Klasse 7' })
    });
    const json = await res.json();
    const ms = Math.round(performance.now() - t0);
    if (!res.ok) {
      return { ok: false, ms, message: json.fehler || `Fehler HTTP ${res.status}` };
    }
    if (json.quelle === 'llm') {
      return { ok: true, ms, message: `Server-Proxy aktiv (${byok.provider} / ${byok.model || 'Standard'}, ${ms} ms).` };
    }
    return { ok: false, ms, message: json.hinweis || 'LLM nicht erreicht (Regel-Fallback aktiv).' };
  } catch (e) {
    const ms = Math.round(performance.now() - t0);
    return { ok: false, ms, message: e instanceof Error ? e.message : 'Verbindungstest fehlgeschlagen.' };
  }
}

export async function runDirectTranslate(byok: ByokSettings, text: string) {
  const bRes = await fetch('/api/v1/assistant/briefing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: 'translate', payload: { text } })
  });
  const briefing = await bRes.json();
  if (!bRes.ok) throw new Error(briefing.fehler || 'Briefing fehlgeschlagen.');

  const raw = await callBrowserDirectChat(byok, briefing.llmBriefing.systemPrompt, briefing.llmBriefing.userPrompt, {
    jsonMode: true,
    maxTokens: 1200,
    timeoutMs: 45000
  });
  const parsed = extractJsonObject(raw);
  if (!parsed) throw new Error('Das eigene LLM hat kein gültiges JSON geliefert.');
  delete parsed.text;
  // The matcher reads the text as in the rule path; the LLM fields are explicit and take precedence.
  const merged = { ...parsed, text };
  const matchRes = await fetch('/api/v1/match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(merged)
  });
  const ergebnis = await matchRes.json();
  if (!matchRes.ok) {
    // Graceful fallback to pre-classified match if model invented an enum
    const fbRes = await fetch('/api/v1/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const fb = await fbRes.json();
    return {
      quelle: 'regeln-fallback' as const,
      gecacht: false,
      hinweis: 'Eigenes LLM nutzte unbekannten Code – deterministische Regel-Zuordnung verwendet.',
      erkanntesFach: briefing.erkanntesFach,
      erkanntesThema: briefing.erkanntesThema,
      ergebnis: fb
    };
  }
  return {
    quelle: 'llm' as const,
    gecacht: false,
    erkanntesFach: briefing.erkanntesFach,
    erkanntesThema: briefing.erkanntesThema,
    anfrage: merged,
    ergebnis
  };
}

export async function runDirectElaborate(byok: ByokSettings, payload: Record<string, unknown>) {
  const startedAt = performance.now();
  const bRes = await fetch('/api/v1/assistant/briefing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: 'elaborate', payload })
  });
  const briefing = await bRes.json();
  if (!bRes.ok) throw new Error(briefing.fehler || 'Briefing fehlgeschlagen.');

  const tableBatches = (briefing.tableBatches || []) as Array<{
    prompt: { systemPrompt: string; userPrompt: string; maxTokens: number };
  }>;
  const narrativePrompt = briefing.narrativePrompt as { systemPrompt: string; userPrompt: string; maxTokens: number };
  const fallbackTable = (briefing.fallbackTable || []) as ThematicPhaseRow[];

  const [narrSettled, ...batchSettled] = await Promise.allSettled([
    callBrowserDirectChat(byok, narrativePrompt.systemPrompt, narrativePrompt.userPrompt, {
      jsonMode: false,
      maxTokens: narrativePrompt.maxTokens
    }),
    ...tableBatches.map((b) =>
      callBrowserDirectChat(byok, b.prompt.systemPrompt, b.prompt.userPrompt, {
        jsonMode: true,
        maxTokens: b.prompt.maxTokens
      })
    )
  ]);

  let succeeded = 0;
  let failed = 0;
  let firstError: Error | null = null;
  const llmRows = new Map<string, Partial<ThematicPhaseRow>>();

  for (const s of batchSettled) {
    if (s.status === 'fulfilled') {
      succeeded++;
      const parsed = extractJsonObject(s.value) as { thematischeTabelle?: Array<Partial<ThematicPhaseRow>> } | null;
      for (const r of parsed?.thematischeTabelle || []) {
        if (r?.key) llmRows.set(r.key, r);
      }
    } else {
      failed++;
      if (!firstError) firstError = s.reason instanceof Error ? s.reason : new Error(String(s.reason));
    }
  }

  let ausarbeitung = String(briefing.fallbackMarkdown || '');
  if (narrSettled.status === 'fulfilled' && narrSettled.value.trim()) {
    succeeded++;
    ausarbeitung = narrSettled.value.trim();
  } else {
    failed++;
    if (narrSettled.status === 'rejected' && !firstError) {
      firstError = narrSettled.reason instanceof Error ? narrSettled.reason : new Error(String(narrSettled.reason));
    }
  }

  if (succeeded === 0) throw firstError || new Error('Direkte LLM-Ausgestaltung fehlgeschlagen.');

  const mergedTable: ThematicPhaseRow[] = fallbackTable.map((base) => {
    const hit = llmRows.get(base.key);
    if (!hit) return base;
    return {
      ...base,
      methodProcedure: hit.methodProcedure?.trim() || base.methodProcedure,
      teacherAction: hit.teacherAction?.trim() || base.teacherAction,
      learnerAction: hit.learnerAction?.trim() || base.learnerAction,
      groupAdaptations: { ...base.groupAdaptations, ...(hit.groupAdaptations || {}) },
      materialsAndOer: hit.materialsAndOer?.trim() || base.materialsAndOer
    };
  });

  return {
    quelle: 'llm' as const,
    gecacht: false,
    ausarbeitung,
    thematischeTabelle: mergedTable,
    meta: {
      teilprompts: 1 + tableBatches.length,
      erfolgreich: succeeded,
      fehlgeschlagen: failed,
      dauerMs: Math.round(performance.now() - startedAt)
    }
  };
}

export async function runDirectDifferentiate(byok: ByokSettings, payload: Record<string, unknown>) {
  const bRes = await fetch('/api/v1/assistant/briefing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: 'differentiate', payload })
  });
  const briefing = await bRes.json();
  if (!bRes.ok) throw new Error(briefing.fehler || 'Differenzierungs-Briefing fehlgeschlagen.');

  const raw = await callBrowserDirectChat(byok, briefing.llmBriefing.systemPrompt, briefing.llmBriefing.userPrompt, {
    jsonMode: true,
    maxTokens: 3500
  });
  const parsed = extractJsonObject(raw) as {
    phasen?: Record<string, Array<{ groupId?: string; groupLabel?: string; measure?: string }>>;
  } | null;
  if (!parsed?.phasen) throw new Error('Eigenes LLM lieferte kein gültiges JSON für die Binnendifferenzierung.');
  return { vorschlaege: parsed.phasen };
}

export async function runDirectMaterial(byok: ByokSettings, payload: Record<string, unknown>) {
  const bRes = await fetch('/api/v1/assistant/briefing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: 'material', payload })
  });
  const briefing = await bRes.json();
  if (!bRes.ok) throw new Error(briefing.fehler || 'Material-Briefing fehlgeschlagen.');

  const material = await callBrowserDirectChat(byok, briefing.llmBriefing.systemPrompt, briefing.llmBriefing.userPrompt, {
    jsonMode: false,
    maxTokens: 4500
  });
  return { quelle: 'llm' as const, gecacht: false, material, baustein: briefing.baustein };
}
