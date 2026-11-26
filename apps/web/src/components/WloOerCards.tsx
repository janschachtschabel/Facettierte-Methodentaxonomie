import { useEffect, useRef, useState } from 'react';
import { useCatalog } from '../data/CatalogContext.js';
import { getOerWwwUrl, type OerResource, type ScenarioPhaseRow } from '../planner/scenarioModel.js';

interface Props {
  scenarioRows: ScenarioPhaseRow[];
  initialStepKey: string;
  onTargetStepChange?: (stepKey: string) => void;
  fach: string;
  /** FMT subject area of the plan; the search filters by its OEH subjects when no single subject is known. */
  fachbereich?: string;
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

function preferredContentTypeForRow(row: ScenarioPhaseRow): string {
  const fns = row.block?.lernfunktion || [];
  if (row.block?.piktogramm === 'experiment') return 'experiment';
  if (fns.includes('diagnose') || row.methodId === 'abrufquiz') return 'quiz';
  if (fns.includes('erwerb')) return 'video';
  if (fns.includes('konsolidierung')) return 'uebung';
  return 'arbeitsblatt';
}

export function WloOerCards({
  scenarioRows,
  initialStepKey,
  onTargetStepChange,
  fach,
  fachbereich,
  thema,
  bildungsstufe,
  oerByStep,
  onOerByStepChange
}: Props) {
  const [targetStep, setTargetStep] = useState(initialStepKey || scenarioRows[0]?.key || 'step-0');
  const [query, setQuery] = useState(thema);
  const [inhaltstyp, setInhaltstyp] = useState('');
  const [nurOffeneLizenz, setNurOffeneLizenz] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyAutoAll, setBusyAutoAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [fachfilter, setFachfilter] = useState<{ art: string; fachbereich?: string; faecher: string[] } | null>(null);
  const { labelOf, bundle } = useCatalog();
  const [results, setResults] = useState<OerResource[]>([]);
  const [instanz, setInstanz] = useState('https://redaktion.openeduhub.net');

  // Custom OER link form (allows manual addition or adjustment!)
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [customNote, setCustomNote] = useState('');

  const autoSearchedRef = useRef<string>('');

  useEffect(() => {
    if (initialStepKey && scenarioRows.some((r) => r.key === initialStepKey)) {
      setTargetStep(initialStepKey);
    }
  }, [initialStepKey, scenarioRows]);

  useEffect(() => {
    if (!query && thema) setQuery(thema);
  }, [thema, query]);

  const fetchWlo = async (q: string, lrt: string, maxItems = 8) => {
    const res = await fetch('/api/v1/oer/wlo-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: q,
        fach,
        fachbereich: fachbereich || undefined,
        bildungsstufe,
        inhaltstyp: lrt || undefined,
        nurOffeneLizenz,
        maxItems
      })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.fehler || 'WLO-Suche fehlgeschlagen.');
    if (json.instanz) setInstanz(String(json.instanz));
    setFachfilter(json.fachfilter && Array.isArray(json.fachfilter.faecher) ? json.fachfilter : null);
    return {
      items: ((json.ergebnisse || []) as OerResource[]).map((item) => ({
        ...item,
        wwwurl: item.wwwurl || item.url
      })),
      hinweis: json.hinweis ? String(json.hinweis) : null
    };
  };

  const runSearch = async (overrideQuery?: string) => {
    const q = (overrideQuery ?? query).trim() || thema.trim() || fach.trim();
    if (!q) return;
    setBusy(true);
    setError(null);
    setHint(null);
    try {
      const { items, hinweis } = await fetchWlo(q, inhaltstyp, 8);
      setResults(items);
      if (hinweis) setHint(hinweis);
      else if (items.length === 0) setHint('Keine Treffer – versuche einen kürzeren Fachbegriff oder „Alle Medientypen“.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Netzwerkfehler bei WLO-Suche');
    } finally {
      setBusy(false);
    }
  };

  // Auto-run an initial WLO Prod search once when entering Step 3 with a topic so tiles are immediately visible!
  useEffect(() => {
    const seed = (thema || fach).trim();
    if (!seed || autoSearchedRef.current === `${seed}|${fach}|${fachbereich || ''}|${bildungsstufe}`) return;
    autoSearchedRef.current = `${seed}|${fach}|${fachbereich || ''}|${bildungsstufe}`;
    void runSearch(seed);
  }, [thema, fach, fachbereich, bildungsstufe]);

  // Smart batch search: fetches topic OERs across phase-appropriate content types and assigns 1 suggestion per empty phase
  const runAutoSuggestAllPhases = async () => {
    const q = (query || thema || fach).trim();
    if (!q) return;
    setBusyAutoAll(true);
    setError(null);
    setHint(null);
    try {
      const { items } = await fetchWlo(q, '', 12);
      setResults(items);
      if (!items.length) {
        setHint('Keine WLO-Treffer für automatische Phasenzuordnung gefunden.');
        return;
      }
      const next = { ...oerByStep };
      const usedUrls = new Set(Object.values(next).flat().map((x) => getOerWwwUrl(x)));
      let assigned = 0;

      for (const row of scenarioRows) {
        if ((next[row.key] || []).length > 0) continue;
        const wantedType = preferredContentTypeForRow(row);
        const match =
          items.find(
            (it) =>
              !usedUrls.has(getOerWwwUrl(it)) &&
              (it.resourceType || '').toLowerCase().includes(wantedType.slice(0, 5))
          ) || items.find((it) => !usedUrls.has(getOerWwwUrl(it)));
        if (match) {
          usedUrls.add(getOerWwwUrl(match));
          next[row.key] = [
            ...(next[row.key] || []),
            { ...match, note: `Vorgeschlagen für „${row.methodName}“ – bei Bedarf unten anpassen oder entfernen.` }
          ];
          assigned++;
        }
      }
      onOerByStepChange(next);
      setHint(
        assigned > 0
          ? `${assigned} passende WLO-OER-Vorschläge aus der Prod-Instanz den Phasen zugeordnet. Du kannst unten jeden Vorschlag anpassen, verschieben oder entfernen.`
          : 'Alle Phasen haben bereits OER-Materialien zugeordnet.'
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Automatische WLO-Zuordnung fehlgeschlagen.');
    } finally {
      setBusyAutoAll(false);
    }
  };

  const attachOer = (stepKey: string, item: OerResource) => {
    const existing = oerByStep[stepKey] || [];
    const href = getOerWwwUrl(item);
    if (existing.some((x) => getOerWwwUrl(x) === href)) return;
    onOerByStepChange({ ...oerByStep, [stepKey]: [...existing, { ...item, wwwurl: href }] });
  };

  const detachOer = (stepKey: string, href: string) => {
    const existing = oerByStep[stepKey] || [];
    onOerByStepChange({ ...oerByStep, [stepKey]: existing.filter((x) => getOerWwwUrl(x) !== href) });
  };

  const updateAttachedNote = (stepKey: string, href: string, note: string) => {
    const existing = oerByStep[stepKey] || [];
    onOerByStepChange({
      ...oerByStep,
      [stepKey]: existing.map((x) => (getOerWwwUrl(x) === href ? { ...x, note } : x))
    });
  };

  const moveAttachedOer = (fromStep: string, toStep: string, item: OerResource) => {
    if (fromStep === toStep) return;
    const href = getOerWwwUrl(item);
    const fromList = (oerByStep[fromStep] || []).filter((x) => getOerWwwUrl(x) !== href);
    const toList = oerByStep[toStep] || [];
    if (toList.some((x) => getOerWwwUrl(x) === href)) {
      onOerByStepChange({ ...oerByStep, [fromStep]: fromList });
    } else {
      onOerByStepChange({ ...oerByStep, [fromStep]: fromList, [toStep]: [...toList, item] });
    }
  };

  const addCustomOer = () => {
    const t = customTitle.trim();
    const u = customUrl.trim();
    if (!t || !/^https?:\/\//i.test(u)) return;
    attachOer(targetStep, {
      id: `custom-${Date.now()}`,
      title: t,
      description: customNote.trim(),
      url: u,
      wwwurl: u,
      note: customNote.trim() || undefined,
      license: 'Eigene Quelle',
      resourceType: 'Web-Ressource',
      source: 'manual'
    });
    setCustomTitle('');
    setCustomUrl('');
    setCustomNote('');
    setShowCustomForm(false);
  };

  const totalAttached = Object.values(oerByStep).reduce((s, list) => s + list.length, 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <div>
          <strong style={{ fontFamily: 'var(--display)', fontSize: 16 }}>
            🌐 Offene Bildungsmaterialien (OER) in WirLernenOnline suchen &amp; Phasen zuordnen
          </strong>
          <p className="muted" style={{ fontSize: 13.5, margin: '2px 0 0' }}>
            Live-Suche auf der <strong>WLO-Produktionsinstanz</strong> mit offiziellen Fach-, Bildungsstufen- und Medientyp-URIs.
            Jede zugeordnete Ressource wird mit ihrer <strong>wwwurl</strong> in den thematischen Entwurf (Schritt 4) und alle Exporte übernommen.
          </p>
        </div>
        <span className="status-badge" style={{ borderColor: 'var(--dA)', color: 'var(--dA)' }}>
          WLO Prod · {instanz.replace(/^https?:\/\//, '')}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10, marginBottom: 12 }}>
        <label style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
          Ziel-Phase für Zuordnung
          <select
            value={targetStep}
            onChange={(e) => {
              setTargetStep(e.target.value);
              onTargetStepChange?.(e.target.value);
            }}
          >
            {scenarioRows.map((r) => (
              <option key={r.key} value={r.key}>
                {r.orderLabel} · {r.methodName} ({r.durationMin} min)
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
          Suchbegriff / Thema
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void runSearch();
            }}
            placeholder={thema || 'z. B. Bruchrechnen, Dichte, Fotosynthese'}
          />
        </label>
        <label style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
          Medientyp (WLO-Filter)
          <select value={inhaltstyp} onChange={(e) => setInhaltstyp(e.target.value)}>
            {WLO_CONTENT_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13.5, display: 'flex', alignItems: 'flex-end', paddingBottom: 6 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={nurOffeneLizenz} onChange={(e) => setNurOffeneLizenz(e.target.checked)} />
            Nur freie CC-Lizenzen (CC0 / CC BY)
          </span>
        </label>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void runSearch()}>
          🔍 {busy ? 'Suche in WLO Prod…' : 'In WirLernenOnline suchen'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={busyAutoAll || !scenarioRows.length}
          title="Sucht passende WLO-OER-Inhalte zum Thema und schlägt je Phase eine Ressource vor (danach frei anpassbar)"
          onClick={() => void runAutoSuggestAllPhases()}
        >
          ✨ {busyAutoAll ? 'Ordne Phasen zu…' : 'OER automatisch für alle Phasen vorschlagen'}
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowCustomForm((s) => !s)}>
          + Eigenen OER-Link ergänzen
        </button>
      </div>

      {showCustomForm && (
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background: 'var(--paper)',
            border: '1px solid var(--dA)',
            marginBottom: 14,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 8,
            alignItems: 'end'
          }}
        >
          <label style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 4 }}>
            Titel
            <input type="text" value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder="z. B. PhET-Simulation Dichte" />
          </label>
          <label style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 4 }}>
            Direkt-URL (wwwurl)
            <input type="text" value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder="https://…" />
          </label>
          <label style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 4 }}>
            Einsatzhinweis (optional)
            <input type="text" value={customNote} onChange={(e) => setCustomNote(e.target.value)} placeholder="z. B. Aufgabe 1–3 für Basisgruppe" />
          </label>
          <button type="button" className="btn btn-primary btn-sm" onClick={addCustomOer}>
            + An gewählte Phase anhängen
          </button>
        </div>
      )}

      {error && (
        <div className="msgs">
          <li className="err">{error}</li>
        </div>
      )}
      {fachfilter?.art === 'fachbereich' && fachfilter.fachbereich && (
        <p className="muted" style={{ fontSize: 13, margin: '0 0 8px' }}>
          Gefiltert nach dem Fachbereich „{labelOf('fachbereich', fachfilter.fachbereich)}“, also nach den WLO-Fächern{' '}
          {(() => {
            const names = (bundle?.faecher?.schulfaecher || []).filter((f) => fachfilter.faecher.includes(f.uri)).map((f) => f.label);
            return names.length > 6 ? `${names.slice(0, 6).join(', ')} und ${names.length - 6} weiteren` : names.join(', ');
          })()}
          . Trage oben in Schritt 1 ein Fach ein, wenn du nur ein Fach möchtest.
        </p>
      )}
      {hint && (
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          ℹ️ {hint}
        </p>
      )}

      {/* Visual OER Tile Grid (4 per row × 2 rows = up to 8 cards, matching Method Catalog) */}
      {results.length > 0 && (
        <div className="oer-grid-4" style={{ marginTop: 12 }}>
          {results.slice(0, 8).map((item) => {
            const href = getOerWwwUrl(item);
            const attached = (oerByStep[targetStep] || []).some((x) => getOerWwwUrl(x) === href);
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
                        height: 40,
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
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14.5, lineHeight: 1.25, display: 'block' }}
                    >
                      {item.title} ↗
                    </a>
                    <div
                      style={{
                        fontSize: 11.5,
                        fontFamily: 'var(--mono)',
                        color: 'var(--dA)',
                        marginTop: 4,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                      title={`wwwurl: ${href}`}
                    >
                      🔗 {href}
                    </div>
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
                    onClick={() => (attached ? detachOer(targetStep, href) : attachOer(targetStep, item))}
                  >
                    {attached ? '✓ Angehängt' : '+ An Phase'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Editable list of attached OERs per phase (always showing wwwurl + phase switcher + usage note!) */}
      {totalAttached > 0 && (
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--grid)' }}>
          <strong style={{ fontFamily: 'var(--display)', fontSize: 15 }}>
            ✓ Zugeordnete OER-Ressourcen ({totalAttached}) – anpassbar für den Endentwurf:
          </strong>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {scenarioRows.flatMap((r) =>
              r.oerResources.map((o) => {
                const href = getOerWwwUrl(o);
                return (
                  <div
                    key={`${r.key}-${o.id}`}
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      background: 'var(--paper)',
                      border: '1px solid var(--dA)',
                      display: 'grid',
                      gridTemplateColumns: 'minmax(180px, 240px) 1fr auto',
                      gap: 10,
                      alignItems: 'center'
                    }}
                  >
                    <select
                      aria-label={`Phase für ${o.title}`}
                      style={{ fontSize: 12.5 }}
                      value={r.key}
                      onChange={(e) => moveAttachedOer(r.key, e.target.value, o)}
                    >
                      {scenarioRows.map((opt) => (
                        <option key={opt.key} value={opt.key}>
                          {opt.orderLabel} · {opt.methodName}
                        </option>
                      ))}
                    </select>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14 }}>
                        <a href={href} target="_blank" rel="noreferrer">
                          {o.title} ↗
                        </a>{' '}
                        {o.license && <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>({o.license})</span>}
                      </div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--dA)', wordBreak: 'break-all' }}>
                        wwwurl: {href}
                      </div>
                      <input
                        type="text"
                        style={{ width: '100%', marginTop: 4, fontSize: 12.5, padding: '4px 8px' }}
                        value={o.note || ''}
                        onChange={(e) => updateAttachedNote(r.key, href, e.target.value)}
                        placeholder="Einsatzhinweis für diese Phase (fließt in Schritt 4 & Export ein)…"
                      />
                    </div>
                    <button type="button" className="btn btn-sm" onClick={() => detachOer(r.key, href)} title="Zuordnung entfernen">
                      ✕
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
