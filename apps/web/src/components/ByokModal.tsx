import { useState } from 'react';
import type { ByokSettings } from '../data/CatalogContext.js';

interface Props {
  open: boolean;
  onClose: () => void;
  value: ByokSettings;
  onSave: (next: ByokSettings) => void;
}

export function ByokModal({ open, onClose, value, onSave }: Props) {
  const [provider, setProvider] = useState(value.provider || 'openai');
  const [model, setModel] = useState(value.model || 'gpt-6-luna');
  const [apiKey, setApiKey] = useState(value.apiKey || '');

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Eigener KI-API-Key (BYOK)"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(15, 27, 38, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 18
      }}
    >
      <div className="card" style={{ maxWidth: 460, width: '100%', padding: 20 }}>
        <h2>Eigener API-Key (BYOK)</h2>
        <p className="muted" style={{ fontSize: 14 }}>
          Optional: Ihr Key wird ausschließlich im <code>sessionStorage</code> dieses Browser-Tabs gespeichert, niemals geloggt und nur an den gewählten öffentlichen HTTPS-Anbieter weitergeleitet.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '14px 0' }}>
          <label style={{ fontFamily: 'var(--display)', fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 4 }}>
            Anbieter (Allowlist)
            <select value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="openai">OpenAI (api.openai.com)</option>
              <option value="gemini">Google Gemini OpenAI-kompatibel</option>
              <option value="mistral">Mistral AI (api.mistral.ai)</option>
              <option value="openrouter">OpenRouter (openrouter.ai)</option>
              <option value="server">Server-Standard-Endpunkt</option>
            </select>
          </label>
          <label style={{ fontFamily: 'var(--display)', fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 4 }}>
            Modellname
            <input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="z. B. gpt-6-luna, gpt-5-mini oder gemini-2.5-flash" />
          </label>
          <label style={{ fontFamily: 'var(--display)', fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 4 }}>
            API-Key
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" />
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setApiKey('');
              onSave({ apiKey: '', provider, model });
              onClose();
            }}
          >
            Key löschen
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn" onClick={onClose}>
              Abbrechen
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                onSave({ apiKey: apiKey.trim(), provider, model: model.trim() });
                onClose();
              }}
            >
              Übernehmen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
