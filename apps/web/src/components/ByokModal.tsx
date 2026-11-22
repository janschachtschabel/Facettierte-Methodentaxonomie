import { useEffect, useState } from 'react';
import { DEFAULT_BYOK_SETTINGS, type ByokSettings, type LlmProviderId } from '../data/CatalogContext.js';
import type { ServerMeta } from '../data/catalogCache.js';
import { OPENAI_PRESETS, testOpenAiConnection } from '../lib/directLlm.js';

interface Props {
  open: boolean;
  onClose: () => void;
  value: ByokSettings;
  onSave: (next: ByokSettings) => void;
  meta?: ServerMeta | null;
}

const PROXY_ALLOWED = new Set(['openai', 'gemini', 'mistral', 'openrouter', 'academiccloud', 'groq', 'server']);

export function ByokModal({ open, onClose, value, onSave, meta }: Props) {
  const [provider, setProvider] = useState<LlmProviderId>(value.provider || 'openai');
  const [baseUrl, setBaseUrl] = useState(value.baseUrl || 'https://api.openai.com/v1');
  const [model, setModel] = useState(value.model || 'gpt-6-luna');
  const [apiKey, setApiKey] = useState(value.apiKey || '');
  const [directBrowser, setDirectBrowser] = useState(value.directBrowser);
  const [persistLocal, setPersistLocal] = useState(value.persistLocal);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setProvider(value.provider || 'openai');
    setBaseUrl(value.baseUrl || 'https://api.openai.com/v1');
    setModel(value.model || 'gpt-6-luna');
    setApiKey(value.apiKey || '');
    setDirectBrowser(value.directBrowser);
    setPersistLocal(value.persistLocal);
    setTestResult(null);
  }, [open, value]);

  if (!open) return null;

  const preset = OPENAI_PRESETS.find((p) => p.id === provider);
  const canUseProxy = PROXY_ALLOWED.has(provider) && meta?.llmAllowByok !== false;

  const handleProviderChange = (nextId: LlmProviderId) => {
    setProvider(nextId);
    setTestResult(null);
    const p = OPENAI_PRESETS.find((x) => x.id === nextId);
    if (p) {
      if (p.baseUrl) setBaseUrl(p.baseUrl);
      if (p.defaultModel) setModel(p.defaultModel);
      setDirectBrowser(p.defaultDirect || meta?.llmAllowByok === false);
    } else if (nextId === 'server') {
      setDirectBrowser(false);
    }
  };

  const currentDraft = (): ByokSettings => ({
    enabled: true,
    provider,
    baseUrl: baseUrl.trim(),
    model: model.trim(),
    apiKey: apiKey.trim(),
    directBrowser: canUseProxy ? directBrowser : true,
    persistLocal
  });

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const res = await testOpenAiConnection(currentDraft());
    setTestResult({ ok: res.ok, message: res.message });
    setTesting(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="KI-Einstellungen (OpenAI-kompatible LLM-Anbindung)"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
        background: 'rgba(15, 27, 38, 0.58)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="card" style={{ maxWidth: 560, width: '100%', maxHeight: '92vh', overflowY: 'auto', padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <h2 style={{ margin: 0 }}>⚙ KI-Einstellungen (OpenAI-kompatibel)</h2>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} aria-label="Schließen">
            ✕
          </button>
        </div>

        <div
          style={{
            marginTop: 10,
            padding: '8px 12px',
            borderRadius: 8,
            background: meta?.llmConfigured ? 'var(--dC-soft)' : 'var(--bg-soft, #f4f6f8)',
            border: '1px solid var(--border)',
            fontSize: 13
          }}
        >
          {meta?.llmConfigured ? (
            <>
              <strong>Server-LLM aktiv (ENV):</strong> <code>{meta.llmModel || 'konfiguriert'}</code>. Du kannst hier optional
              trotzdem deine eigene OpenAI-kompatible Anbindung für diese Sitzung bevorzugen.
            </>
          ) : (
            <>
              <strong>Server läuft im Zero-LLM-Modus</strong> (kein API-Key in ENV gesetzt; Suche, Zuordnung, Matrix,
              Klassifikation &amp; Materialvorlagen arbeiten komplett ohne LLM in &lt;5 ms). Trage hier optional deine eigene
              OpenAI-kompatible KI-Anbindung ein (z. B. OpenAI, Mistral, Gemini, GWDG Academic Cloud, OpenRouter, Ollama oder LM
              Studio).
            </>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 11, margin: '14px 0' }}>
          <label style={{ fontFamily: 'var(--display)', fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 4 }}>
            Anbieter / Vorlage (OpenAI-kompatibel)
            <select value={provider} onChange={(e) => handleProviderChange(e.target.value as LlmProviderId)}>
              {OPENAI_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
              {meta?.llmAllowByok !== false && <option value="server">Server-Standard-Endpunkt (mit eigenem Key)</option>}
            </select>
            {preset && (
              <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>
                {preset.hint}
              </span>
            )}
          </label>

          {(directBrowser || provider === 'custom' || provider === 'ollama' || provider === 'lmstudio') && (
            <label style={{ fontFamily: 'var(--display)', fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 4 }}>
              OpenAI-kompatible Base-URL (<code>/v1</code>)
              <input
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="z. B. http://localhost:11434/v1 oder https://chat-ai.academiccloud.de/v1"
              />
            </label>
          )}

          <label style={{ fontFamily: 'var(--display)', fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 4 }}>
            Modellname
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="z. B. gpt-6-luna, gpt-4o-mini, gemini-2.5-flash, llama3.2, mistral-small-latest"
            />
          </label>

          <label style={{ fontFamily: 'var(--display)', fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 4 }}>
            API-Key {preset && !preset.requiresKey ? '(optional bei lokalem Endpunkt)' : ''}
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={preset && !preset.requiresKey ? 'optional (leer lassen für Ollama / LM Studio)' : 'sk-…'}
            />
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: canUseProxy ? 'pointer' : 'default' }}>
              <input
                type="checkbox"
                checked={!canUseProxy || directBrowser}
                disabled={!canUseProxy}
                onChange={(e) => setDirectBrowser(e.target.checked)}
              />
              <span>
                <strong>Direkt aus dem Browser verbinden</strong> (API-Key verlässt deinen Browser nicht Richtung FMT-Server;
                erforderlich für eigene/lokale URLs wie Ollama, LM Studio, LiteLLM)
              </span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={persistLocal} onChange={(e) => setPersistLocal(e.target.checked)} />
              <span>
                Einstellungen lokal in diesem Browser merken (<code>localStorage</code> statt nur bis Tab-Schließung)
              </span>
            </label>
          </div>
        </div>

        {testResult && (
          <div
            className={testResult.ok ? 'msg msg-ok' : 'msg msg-err'}
            role="status"
            style={{ marginBottom: 12, fontSize: 13 }}
          >
            {testResult.ok ? '✓ ' : '⚠ '}
            {testResult.message}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-sm" onClick={handleTest} disabled={testing}>
              {testing ? 'Teste…' : '🔌 Verbindung testen'}
            </button>
            {value.enabled && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  onSave({ ...DEFAULT_BYOK_SETTINGS });
                  onClose();
                }}
              >
                Deaktivieren (Zero-LLM)
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn" onClick={onClose}>
              Abbrechen
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                const draft = currentDraft();
                const hasCreds = draft.directBrowser ? Boolean(draft.baseUrl && draft.model) : Boolean(draft.apiKey);
                onSave(hasCreds ? draft : { ...DEFAULT_BYOK_SETTINGS });
                onClose();
              }}
            >
              Speichern &amp; aktivieren
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
