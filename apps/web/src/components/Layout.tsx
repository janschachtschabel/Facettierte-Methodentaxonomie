import React, { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useCatalog } from '../data/CatalogContext.js';
import { ByokModal } from './ByokModal.js';
import { isUserLlmConfigured } from '../lib/directLlm.js';

export function Layout({ children }: { children: React.ReactNode }) {
  const { bundle, meta, error, fromCache, refreshNotice, byok, setByok, llmSettingsOpen, setLlmSettingsOpen } =
    useCatalog();
  const userLlmActive = isUserLlmConfigured(byok);
  const [theme, setTheme] = useState<'auto' | 'light' | 'dark'>(() => {
    try {
      return (localStorage.getItem('fmt_theme') as 'auto' | 'light' | 'dark') || 'auto';
    } catch {
      return 'auto';
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('fmt_theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const cycleTheme = () => {
    setTheme((t) => (t === 'auto' ? 'dark' : t === 'dark' ? 'light' : 'auto'));
  };

  return (
    <>
      <header className="topbar">
        <div className="wrap topbar-inner">
          <Link to="/" className="brand">
            <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
              <circle cx="16" cy="16" r="14" fill="var(--surface)" stroke="var(--ink)" strokeWidth="1.5" />
              <path d="M16 16 L16 3 A13 13 0 0 1 29 16 Z" fill="var(--dA)" />
              <path d="M16 16 L29 16 A13 13 0 0 1 16 29 Z" fill="var(--dB)" />
              <path d="M16 16 L16 29 A13 13 0 0 1 3 16 Z" fill="var(--dC)" />
              <path d="M16 16 L3 16 A13 13 0 0 1 16 3 Z" fill="var(--dD)" />
              <circle cx="16" cy="16" r="5" fill="var(--surface)" stroke="var(--ink)" strokeWidth="1.4" />
            </svg>
            <span>FMT Methodendatenbank</span>
          </Link>

          <nav className="nav" aria-label="Hauptnavigation">
            <NavLink to="/" end>
              Katalog ({bundle ? bundle.bausteine.length : '…'})
            </NavLink>
            <NavLink to="/planer">Szenario-Baukasten</NavLink>
            <NavLink to="/differenzierung">Differenzierung</NavLink>
            <NavLink to="/vergleich">Vergleich</NavLink>
            <NavLink to="/systematik">Systematik</NavLink>
            <NavLink to="/api-mcp">API &amp; MCP</NavLink>
          </nav>

          <div className="nav-tools">
            {bundle && (
              <span
                className="status-badge"
                title={`Katalog v${bundle.version} · Hash ${bundle.versionHash.slice(0, 8)} · ${fromCache ? 'aus Browser-Cache (abgeglichen)' : 'frisch geladen'}`}
              >
                {fromCache ? '⚡ Cache' : '✓ Live'}
              </span>
            )}
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setLlmSettingsOpen(true)}
              title={
                userLlmActive
                  ? `Eigene KI aktiv (${byok.directBrowser ? 'Direkt' : 'Proxy'}: ${byok.model || byok.provider})`
                  : meta?.llmConfigured
                    ? `Server-KI aktiv (${meta.llmModel}) · Klicken für eigene KI-Einstellungen`
                    : 'Zero-LLM-Modus aktiv · Klicken, um eigene OpenAI-kompatible KI zu verbinden'
              }
            >
              {userLlmActive
                ? `🔑 KI: ${byok.model ? byok.model.slice(0, 16) : byok.provider}`
                : meta?.llmConfigured
                  ? `✨ KI: ${meta.llmModel ? meta.llmModel.slice(0, 14) : 'Server'}`
                  : '⚙ KI-Einstellungen'}
            </button>
            <button type="button" className="btn btn-sm" onClick={cycleTheme} title="Farbschema umschalten">
              {theme === 'auto' ? '◐ Auto' : theme === 'dark' ? '☾ Dunkel' : '☀ Hell'}
            </button>
          </div>
        </div>
      </header>

      {refreshNotice && (
        <div
          role="status"
          style={{
            background: 'var(--dC-soft)',
            borderBottom: '1px solid var(--dC)',
            padding: '6px 22px',
            fontFamily: 'var(--display)',
            fontSize: 14,
            textAlign: 'center'
          }}
        >
          {refreshNotice}
        </div>
      )}

      <main className="wrap">
        {error && !bundle ? (
          <div className="msg msg-err" role="alert" style={{ marginTop: 18 }}>
            <strong>Katalog konnte nicht geladen werden:</strong> {error}
          </div>
        ) : (
          children
        )}
      </main>

      <footer className="footer">
        <div className="wrap footer-inner">
          <div>
            <strong>Facettierte Methodentaxonomie (FMT)</strong> · Version {bundle?.version || '1.0.0'}
            <br />
            Inhalte, Daten, Vokabulare &amp; Grafiken:{' '}
            <a href="https://creativecommons.org/licenses/by/4.0/deed.de" target="_blank" rel="noreferrer">
              CC BY 4.0
            </a>{' '}
            · Autor: <strong>{bundle?.creator || 'Jan Schachtschabel'}</strong> · Quellcode: Apache-2.0
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', fontFamily: 'var(--display)' }}>
            <a href="/bausteine/katalog.jsonld" target="_blank" rel="noreferrer">
              JSON-LD Katalog
            </a>
            <a href="/vocabs/lernfunktion.ttl" target="_blank" rel="noreferrer">
              SKOS Vokabulare
            </a>
            <Link to="/api-mcp">MCP &amp; REST API</Link>
            <a href="https://github.com/janschachtschabel/Facettierte-Methodentaxonomie" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </div>
        </div>
      </footer>

      <ByokModal
        open={llmSettingsOpen}
        onClose={() => setLlmSettingsOpen(false)}
        value={byok}
        onSave={setByok}
        meta={meta}
      />
    </>
  );
}
