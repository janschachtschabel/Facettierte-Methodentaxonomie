import { useEffect, useState } from 'react';
import type { OerResource, ScenarioPhaseRow } from '../planner/scenarioModel.js';

interface Props {
  scenarioRows: ScenarioPhaseRow[];
  initialStepKey: string;
  fach: string;
  thema: string;
  bildungsstufe: string;
  oerByStep: Record<string, OerResource[]>;
  onOerByStepChange: (next: Record<string, OerResource[]>) => void;
}

const WLO_CONTENT_TYPES = [
  { id: '', label: 'Alle Medientypen' },
  { id: 'arbeitsblatt', label: 'Arbeitsblatt' },
  { id: 'uebung', label: 'Übungsmaterial' },
  { id: 'interaktiv', label: 'Interaktives Medium' },
  { id: 'video', label: 'Video / Erklärfilm' },
  { id: 'experiment', label: 'Experiment' },
  { id: 'quiz', label: 'Quiz / Test' },
  { id: 'rollenspiel', label: 'Rollenspiel' },
  { id: 'fallstudie', label: 'Fallstudie' }
];

export function WloOerCards({
  scenarioRows,
  initialStepKey,
  fach,
  thema,
  bildungsstufe,
  oerByStep,
  onOerByStepChange
}: Props) {
  const [targetStep, setTargetStep] = useState(initialStepKey || scenarioRows[0]?.key || 'step-0');
  const [query, setQuery] = useState(thema);
  const [inhaltstyp, setInhaltstyp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [results, setResults] = useState<OerResource[]>([]);

  useEffect(() => {
    if (initialStepKey && scenarioRows.some((r) => r.key === initialStepKey)) {
      setTargetStep(initialStepKey);
    }
  }, [initialStepKey, scenarioRows]);

  useEffect(() => {
    if (!query && thema) setQuery(thema);
  }, [thema, query]);

  const runSearch = async (overrideQuery?: string) => {
    const q = (overrideQuery ?? query).trim() || thema.trim() || fach.trim();
    if (!q) return;
    setBusy(true);
    setError(null);
    setHint(null);
    try {
      const res = await fetch('/api/v1/oer/wlo-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          fach,
          bildungsstufe,
          inhaltstyp: inhaltstyp || undefined,
          maxItems: 9
        })
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.fehler || 'WLO-Suche fehlgeschlagen.');
        return;
      }
      setResults((json.ergebnisse || []) as OerResource[]);
      if (json.hinweis) setHint(String(json.hinweis));
      else if ((json.ergebnisse || []).length === 0) setHint('Keine Treffer – versuche einen kürzeren Fachbegriff.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Netzwerkfehler bei WLO-Suche');
    } finally {
      setBusy(false);
    }
  };

  const attachOer = (stepKey: string, item: OerResource) => {
    const existing = oerByStep[stepKey] || [];
    if (existing.some((x) => x.url === item.url)) return;
    onOerByStepChange({ ...oerByStep, [stepKey]: [...existing, item] });
  };

  const detachOer = (stepKey: string, url: string) => {
    const existing = oerByStep[stepKey] || [];
    onOerByStepChange({ ...oerByStep, [stepKey]: existing.filter((x) => x.url !== url) });
  };

  const totalAttached = Object.values(oerByStep).reduce((s, list) => s + list.length, 0);

  return (
    <div>
      <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>
        Durchsucht <strong>WirLernenOnline / OpenEduHub</strong> mit offiziellen Fach- und Bildungsstufen-URIs nach freien OER-Materialien.
        Gefundene Kacheln lassen sich per Klick direkt an jede Phase anhängen – und erscheinen automatisch in Verlaufstabelle, PDF &amp; LMS-Export.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 12 }}>
        <label style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
          Ziel-Phase im Szenario
          <select value={targetStep} onChange={(e) => setTargetStep(e.target.value)}>
            {scenarioRows.map((r) => (
              <option key={r.key} value={r.key}>
                {r.orderLabel} · {r.methodName} ({r.durationMin} min)
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
          Thema / Stichwort
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') runSearch();
            }}
            placeholder={thema || 'z. B. Bruchrechnen, Dichte, Fotosynthese'}
          />
        </label>
        <label style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
          Medientyp (optional)
          <select value={inhaltstyp} onChange={(e) => setInhaltstyp(e.target.value)}>
            {WLO_CONTENT_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => runSearch()}>
          🌐 {busy ? 'Suche in WirLernenOnline…' : 'Passende WLO-Kacheln suchen'}
        </button>
        {thema && (
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => { setQuery(thema); runSearch(thema); }}>
            ✨ Vorschläge zu „{thema}“ ({fach || 'alle Fächer'})
          </button>
        )}
      </div>

      {error && (
        <div className="msgs">
          <li className="err">{error}</li>
        </div>
      )}
      {hint && (
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          ℹ️ {hint}
        </p>
      )}

      {/* Visual OER Tile Grid */}
      {results.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 12,
            marginTop: 12
          }}
        >
          {results.map((item) => {
            const attached = (oerByStep[targetStep] || []).some((x) => x.url === item.url);
            return (
              <article
                key={item.id}
                style={{
                  borderRadius: 8,
                  background: 'var(--paper)',
                  border: `1px solid ${attached ? 'var(--dC)' : 'var(--grid)'}`,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  {item.previewUrl ? (
                    <div style={{ height: 112, background: 'var(--surface)', overflow: 'hidden', borderBottom: '1px solid var(--grid)' }}>
                      <img
                        src={item.previewUrl}
                        alt={item.title}
                        loading="lazy"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        onError={(e) => {
                          (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
                        }}
                      />
                    </div>
                  ) : (
                    <div
                      style={{
                        height: 44,
                        background: 'var(--dA-soft)',
                        borderBottom: '1px solid var(--grid)',
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0 10px',
                        fontFamily: 'var(--display)',
                        fontSize: 12,
                        fontWeight: 700,
                        color: 'var(--dA)'
                      }}
                    >
                      🌐 {item.resourceType || 'OER-Ressource (WLO)'}
                    </div>
                  )}
                  <div style={{ padding: 10 }}>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14.5, lineHeight: 1.25, display: 'block' }}
                    >
                      {item.title} ↗
                    </a>
                    {item.description && (
                      <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0', lineHeight: 1.4 }}>
                        {item.description.length > 130 ? `${item.description.slice(0, 129)}…` : item.description}
                      </p>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    padding: '8px 10px',
                    borderTop: '1px solid var(--grid)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 6,
                    background: 'var(--surface)'
                  }}
                >
                  <span className="muted" style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[item.resourceType, item.license].filter(Boolean).join(' · ') || 'WLO'}
                  </span>
                  <button
                    type="button"
                    className={`btn btn-sm ${attached ? '' : 'btn-primary'}`}
                    onClick={() => (attached ? detachOer(targetStep, item.url) : attachOer(targetStep, item))}
                  >
                    {attached ? '✓ Angehängt' : '+ An Phase'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {totalAttached > 0 && (
        <div style={{ marginTop: 18, paddingTop: 12, borderTop: '1px solid var(--grid)' }}>
          <strong style={{ fontFamily: 'var(--display)', fontSize: 14.5 }}>
            ✓ Mit diesem Szenario verknüpfte WLO-Materialien ({totalAttached}):
          </strong>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {scenarioRows.flatMap((r) =>
              r.oerResources.map((o) => (
                <div
                  key={`${r.key}-${o.id}`}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    background: 'var(--paper)',
                    border: '1px solid var(--dA)',
                    fontSize: 13,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8
                  }}
                >
                  <span>
                    <strong>{r.orderLabel}:</strong>{' '}
                    <a href={o.url} target="_blank" rel="noreferrer">
                      {o.title}
                    </a>
                  </span>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => detachOer(r.key, o.url)}>
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
