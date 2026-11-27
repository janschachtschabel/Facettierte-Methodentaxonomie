import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { EvidenceGrade, SearchCriteria } from '@fmt/core';
import { useCatalog } from '../data/CatalogContext.js';
import { MethodPictogram } from '../components/MethodPictogram.js';
import { MethodCardDiagram } from '../components/MethodCardDiagram.js';
import { ProfileRadarSvg } from '../components/ProfileRadarSvg.js';
import { EvidenceBadge } from '../components/EvidenceBadge.js';

const GRANULARITY_READABLE: Record<string, string> = {
  r1: 'Interaktion (R1)',
  r2: 'Szenario (R2)',
  r3: 'Reihe / Ensemble (R3)',
  r4: 'Modul / Kurs (R4)',
  r5: 'Curriculum (R5)'
};

export function CatalogPage() {
  const {
    bundle,
    search,
    loading,
    error,
    labelOf,
    valuesOf,
    comparePair,
    setComparePair,
    queueBlockForPlanner
  } = useCatalog();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [showExpert, setShowExpert] = useState(false);
  const [filters, setFilters] = useState<SearchCriteria>(() => {
    const init: Record<string, unknown> = {};
    const keys = ['text', 'ansatz', 'lernfunktion', 'reichweite', 'liefert', 'maxDauer', 'minEvidenz', 'status', 'bildungsstufe', 'fuerFachbereich', 'eintragsart'] as const;
    for (const k of keys) {
      const v = searchParams.get(k);
      if (v) init[k] = k === 'maxDauer' ? Number(v) : v;
    }
    return init as SearchCriteria;
  });

  useEffect(() => {
    if (![...searchParams.keys()].length) return;
    const next: Record<string, unknown> = {};
    const keys = ['text', 'ansatz', 'lernfunktion', 'reichweite', 'liefert', 'maxDauer', 'minEvidenz', 'status', 'bildungsstufe', 'fuerFachbereich', 'eintragsart'] as const;
    for (const k of keys) {
      const v = searchParams.get(k);
      if (v) next[k] = k === 'maxDauer' ? Number(v) : v;
    }
    if (Object.keys(next).length) setFilters(next as SearchCriteria);
  }, [searchParams]);

  const setFilter = (key: string, val: unknown) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (val === '' || val === false || val == null) delete next[key];
      else next[key] = val;
      return next;
    });
  };

  // Learners who cannot read or write yet: only methods without reading or writing (field schriftbedarf).
  const [ohneSchrift, setOhneSchrift] = useState(false);
  const hits = useMemo(() => {
    if (!search) return [];
    const found = search.suche(filters);
    return ohneSchrift ? found.filter((b) => !(b.schriftbedarf || []).length) : found;
  }, [search, filters, ohneSchrift]);
  const resetFilters = () => {
    setFilters({});
    setOhneSchrift(false);
  };

  if (loading) return <div className="page-section">Lade FMT-Methodenkatalog…</div>;
  if (error || !bundle || !search) return <div className="page-section">Fehler: {error}</div>;

  const ansatzValues = valuesOf('ansatz');
  const activeAnsatz = typeof filters.ansatz === 'string' ? filters.ansatz : '';
  const activeArt = filters.eintragsart || '';
  const hilfenAnzahl = bundle.bausteine.filter((b) => b.eintragsart === 'hilfe').length;
  const istHilfe = (b: { eintragsart?: string }) => b.eintragsart === 'hilfe';
  const HILFE_TITEL = 'Eine Hilfe stützt Lernende innerhalb einer Methode; du ordnest sie in Schritt 3 des Baukastens den Phasen zu.';

  const pickForCompare = (kennung: string) => {
    setComparePair([kennung, comparePair[0] === kennung ? comparePair[1] : comparePair[0]]);
    navigate('/vergleich');
  };

  const addToPlanner = (kennung: string) => {
    queueBlockForPlanner(kennung);
    navigate('/planer');
  };

  return (
    <div className="page-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1>Methodenkatalog</h1>
          <p className="muted" style={{ maxWidth: '68ch', marginTop: 6 }}>
            {bundle.bausteine.length} Unterrichtsmethoden für Bildung im deutschsprachigen Raum – beschrieben als
            13-Facetten-Profile, verknüpfbar über Lernzustände und maschinenlesbar unter CC BY 4.0 (Jan Schachtschabel).
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/planer" className="btn btn-primary">
            ✦ Szenario im Baukasten planen
          </Link>
          <Link to="/systematik" className="btn">
            Systematik (FMT)
          </Link>
        </div>
      </div>

      {/* Methods carry a phase, helps support learners inside a method */}
      <div style={{ marginTop: 18 }}>
        <ul className="chips" role="group" aria-label="Methoden / Hilfen">
          <li>
            <button type="button" className="btn btn-sm" aria-pressed={!activeArt} onClick={() => setFilter('eintragsart', '')}>
              Methoden und Hilfen ({bundle.bausteine.length})
            </button>
          </li>
          <li>
            <button
              type="button"
              className="btn btn-sm"
              aria-pressed={activeArt === 'methode'}
              onClick={() => setFilter('eintragsart', activeArt === 'methode' ? '' : 'methode')}
            >
              Methoden ({bundle.bausteine.length - hilfenAnzahl})
            </button>
          </li>
          <li>
            <button
              type="button"
              className="btn btn-sm"
              aria-pressed={activeArt === 'hilfe'}
              title={HILFE_TITEL}
              onClick={() => setFilter('eintragsart', activeArt === 'hilfe' ? '' : 'hilfe')}
            >
              Hilfen ({hilfenAnzahl})
            </button>
          </li>
        </ul>
      </div>

      {/* Quick Ansatz Tabs */}
      <div style={{ marginTop: 10 }}>
        <ul className="chips" role="group" aria-label="Filter nach didaktischem Ansatz">
          <li>
            <button
              type="button"
              className="btn btn-sm"
              aria-pressed={!activeAnsatz}
              onClick={() => setFilter('ansatz', '')}
            >
              Alle Ansätze ({bundle.bausteine.length})
            </button>
          </li>
          {ansatzValues.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className="btn btn-sm"
                aria-pressed={activeAnsatz === a.id}
                onClick={() => setFilter('ansatz', activeAnsatz === a.id ? '' : a.id)}
              >
                {a.label}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Faceted Filter Panel */}
      <section className="filter-panel" aria-label="Such- und Facettenfilter">
        <div className="filter-grid">
          <label style={{ gridColumn: 'span 2' }}>
            Suche (Name, Synonym, Phase wie „Einstieg“ / „Sicherung“)
            <input
              type="search"
              placeholder="z. B. Jigsaw, Sicherung, Debatte, Feedback…"
              value={String(filters.text || '')}
              onChange={(e) => setFilter('text', e.target.value)}
            />
          </label>

          <label>
            A1 Lernfunktion
            <select
              value={String(filters.lernfunktion || '')}
              onChange={(e) => setFilter('lernfunktion', e.target.value)}
            >
              <option value="">beliebig</option>
              {valuesOf('lernfunktion').map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>

          <label title="Zeigt Methoden dieses Fachbereichs und fachübergreifende Methoden, ohne die dafür ungeeigneten">
            Fachbereich
            <select
              value={String(filters.fuerFachbereich || '')}
              onChange={(e) => setFilter('fuerFachbereich', e.target.value)}
            >
              <option value="">alle</option>
              {valuesOf('fachbereich')
                .filter((w) => w.id !== 'uebergreifend')
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
            </select>
          </label>

          <label>
            Granularität / Reichweite
            <select value={String(filters.reichweite || '')} onChange={(e) => setFilter('reichweite', e.target.value)}>
              <option value="">beliebig</option>
              {valuesOf('reichweite').map((w) => (
                <option key={w.id} value={w.id}>
                  {GRANULARITY_READABLE[w.id] || `${w.label} (${w.id.toUpperCase()})`}
                </option>
              ))}
            </select>
          </label>

          <label>
            B1 Anleitungsgrad
            <select value={String(filters.anleitung || '')} onChange={(e) => setFilter('anleitung', e.target.value)}>
              <option value="">beliebig</option>
              {valuesOf('anleitung').map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            A2 Engagement
            <select value={String(filters.engagement || '')} onChange={(e) => setFilter('engagement', e.target.value)}>
              <option value="">beliebig</option>
              {valuesOf('engagement').map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>

          <label title="Zeigt Methoden, deren Raumbedarf dieser Raum deckt">
            Raum
            <select aria-label="Raum" value={String(filters.raum || '')} onChange={(e) => setFilter('raum', e.target.value)}>
              <option value="">beliebig</option>
              {valuesOf('raumtyp').map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>

          <label style={{ justifyContent: 'flex-end' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8 }}>
              <input type="checkbox" checked={ohneSchrift} onChange={(e) => setOhneSchrift(e.target.checked)} />
              ohne Lesen und Schreiben
            </span>
          </label>

          <label>
            Zeitbudget (min)
            <input
              type="number"
              min={0}
              placeholder="verfügbar"
              value={filters.maxDauer ?? ''}
              onChange={(e) => setFilter('maxDauer', e.target.value)}
            />
          </label>

          <label>
            Evidenz mindestens
            <select
              value={String(filters.minEvidenz || '')}
              onChange={(e) => setFilter('minEvidenz', e.target.value as EvidenceGrade | '')}
            >
              <option value="">beliebig</option>
              <option value="A">Grad A (mehrere Synthesen)</option>
              <option value="B">Grad B oder besser</option>
              <option value="C">Grad C oder besser</option>
            </select>
          </label>
        </div>

        {showExpert && (
          <div className="filter-grid" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--grid)' }}>
            <label>
              Liefert Lernzustand
              <select value={String(filters.liefert || '')} onChange={(e) => setFilter('liefert', e.target.value)}>
                <option value="">beliebig</option>
                {valuesOf('lernzustand').map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              C1 Interaktionsstruktur
              <select value={String(filters.interaktion || '')} onChange={(e) => setFilter('interaktion', e.target.value)}>
                <option value="">beliebig</option>
                {valuesOf('interaktion').map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              C3 Raum-Zeit-Modus
              <select value={String(filters.raumzeit || '')} onChange={(e) => setFilter('raumzeit', e.target.value)}>
                <option value="">beliebig</option>
                {valuesOf('raumzeit').map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Technik höchstens
              <select value={String(filters.maxTechnik || '')} onChange={(e) => setFilter('maxTechnik', e.target.value)}>
                <option value="">beliebig</option>
                {valuesOf('technikbedarf').map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Bildungsstufe
              <select
                value={String(filters.bildungsstufe || '')}
                onChange={(e) => setFilter('bildungsstufe', e.target.value)}
              >
                <option value="">beliebig</option>
                {valuesOf('bildungsstufe').map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Lerngruppe (Personen)
              <input
                type="number"
                min={1}
                placeholder="z. B. 28"
                value={filters.gruppe ?? ''}
                onChange={(e) => setFilter('gruppe', e.target.value)}
              />
            </label>

            <label>
              Redaktionsstatus
              <select value={String(filters.status || '')} onChange={(e) => setFilter('status', e.target.value)}>
                <option value="">alle</option>
                <option value="kuratiert">
                  Kuratiert ({bundle.bausteine.filter((b) => b.status === 'kuratiert').length} Kernmethoden)
                </option>
                <option value="entwurf">
                  Ersterfassung ({bundle.bausteine.filter((b) => b.status !== 'kuratiert').length} Methoden)
                </option>
              </select>
            </label>

            <label style={{ justifyContent: 'flex-end' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={Boolean(filters.ohneKI)}
                  onChange={(e) => setFilter('ohneKI', e.target.checked)}
                />
                Ohne KI-Bausteine
              </span>
            </label>
          </div>
        )}

        <div
          style={{
            marginTop: 12,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap'
          }}
        >
          <div data-testid="trefferzahl" style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 16 }}>
            {hits.length} von {bundle.bausteine.length} Methoden
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowExpert((s) => !s)}>
              {showExpert ? '▲ Expertenfilter ausblenden' : '▼ Alle Facetten & Rahmenbedingungen'}
            </button>
            {(Object.keys(filters).length > 0 || ohneSchrift) && (
              <button type="button" className="btn btn-sm" onClick={resetFilters}>
                Filter zurücksetzen
              </button>
            )}
            <button
              type="button"
              className="btn btn-sm"
              aria-pressed={viewMode === 'cards'}
              onClick={() => setViewMode('cards')}
            >
              Karten
            </button>
            <button
              type="button"
              className="btn btn-sm"
              aria-pressed={viewMode === 'table'}
              onClick={() => setViewMode('table')}
            >
              Tabelle
            </button>
          </div>
        </div>
        <details style={{ marginTop: 10 }}>
          <summary style={{ fontFamily: 'var(--display)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', color: 'var(--dA)' }}>
            🎨 Visuelle Kachel-Legende (Granularität, Lenkungsfarben &amp; Ablaufvorschau)
          </summary>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8, fontSize: 13 }}>
            <span>
              <strong>Granularität:</strong> Interaktion (R1, 2–15 min) → Szenario (R2, 15–60 min) → Reihe / Ensemble (R3, Stunden–Wochen) → Modul / Kurs (R4)
            </span>
            <span>
              <strong>Lenkungsfarbe:</strong> <span style={{ color: 'var(--dA)', fontWeight: 700 }}>■ explizit</span> ·{' '}
              <span style={{ color: 'var(--dC)', fontWeight: 700 }}>■ geleitet</span> ·{' '}
              <span style={{ color: 'var(--dB)', fontWeight: 700 }}>■ offen</span> ·{' '}
              <span style={{ color: 'var(--dD)', fontWeight: 700 }}>■ offen → explizit</span>
            </span>
            <span>
              <strong>Balken rechts:</strong> Aktivitätsgrad (ICAP: passiv → aktiv → konstruktiv → interaktiv)
            </span>
          </div>
        </details>
      </section>

      {hits.length === 0 ? (
        <div className="card" style={{ padding: 24, textAlign: 'center' }}>
          <p>Keine Methode erfüllt alle gewählten Kriterien. Lockere einzelne Filter.</p>
          <button type="button" className="btn" onClick={resetFilters}>
            Alle Filter zurücksetzen
          </button>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="catalog-grid">
          {hits.map((b) => {
            const grade = search.bestGrade(b);
            return (
              <article key={b.kennung} className="card method-card">
                <div className="method-card-head">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <MethodPictogram type={b.piktogramm} />
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span className="range-badge" title={`FMT-Granularitätsebene ${b.reichweite.toUpperCase()}`}>
                          {GRANULARITY_READABLE[b.reichweite] || b.reichweite.toUpperCase()}
                        </span>
                        {istHilfe(b) && (
                          <span className="status-badge" title={HILFE_TITEL}>
                            Hilfe
                          </span>
                        )}
                        {b.komposit && <span className="status-badge">Container</span>}
                        {b.ki && <span className="status-badge">KI</span>}
                        <span className={`status-badge ${b.status === 'kuratiert' ? 'status-kuratiert' : ''}`}>
                          {b.status === 'kuratiert' ? 'Kuratiert' : 'Ersterfassung'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <ProfileRadarSvg baustein={b} facetten={bundle.facetten} mode="mini" />
                </div>

                {/* Fixed line counts keep diagram, text and tags at the same height in every card */}
                <div>
                  <Link to={`/methoden/${b.kennung}`} className="method-card-title" title={b.name}>
                    {b.name}
                  </Link>
                  <div className="muted method-card-alt" title={(b.alternativname || []).join(' · ') || undefined}>
                    {(b.alternativname || []).slice(0, 3).join(' · ') || '\u00a0'}
                  </div>
                </div>

                <MethodCardDiagram baustein={b} labelOf={labelOf} />

                <p className="method-card-desc">{b.kurzbeschreibung}</p>

                <ul className="chips method-card-chips">
                  {/* Guidance first: with two fixed rows a third learning function may be cut, never the guidance */}
                  {b.anleitung.slice(0, 1).map((a) => (
                    <li key={a} className="chip chip-b">
                      {labelOf('anleitung', a)}
                    </li>
                  ))}
                  {b.lernfunktion.slice(0, 3).map((f) => (
                    <li key={f} className="chip chip-a">
                      {labelOf('lernfunktion', f)}
                    </li>
                  ))}
                </ul>

                <div className="method-card-foot">
                  <div className="meta-row">
                    <span>
                      ⏱ {b.dauerMin}–{b.dauerMax} min
                    </span>
                    <span>👥 {b.gruppeMin}–{b.gruppeMax}</span>
                    <EvidenceBadge grade={grade} />
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="btn btn-sm" onClick={() => pickForCompare(b.kennung)}>
                      Vergleich
                    </button>
                    {!istHilfe(b) && (
                      <button type="button" className="btn btn-sm" onClick={() => addToPlanner(b.kennung)}>
                        + Baukasten
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Methode</th>
                <th>Granularität</th>
                <th>min</th>
                <th>Lernfunktion</th>
                <th>Anleitung</th>
                <th>Liefert</th>
                <th>Evidenz</th>
                <th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {hits.map((b) => (
                <tr key={b.kennung}>
                  <td>
                    <Link to={`/methoden/${b.kennung}`} style={{ fontWeight: 700 }}>
                      {b.name}
                    </Link>
                    <div className="muted" style={{ fontSize: 13 }}>
                      {b.alternativname.slice(0, 3).join(', ')}
                    </div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{GRANULARITY_READABLE[b.reichweite] || b.reichweite.toUpperCase()}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {b.dauerMin}–{b.dauerMax}
                  </td>
                  <td>{b.lernfunktion.map((f) => labelOf('lernfunktion', f)).join(', ')}</td>
                  <td>{b.anleitung.map((a) => labelOf('anleitung', a)).join(', ')}</td>
                  <td>{(b.nachbedingung || []).map((z) => labelOf('lernzustand', z)).join(', ') || '–'}</td>
                  <td>
                    <EvidenceBadge grade={search.bestGrade(b)} />
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {istHilfe(b) ? (
                      <span className="muted" title={HILFE_TITEL}>
                        Hilfe
                      </span>
                    ) : (
                      <button type="button" className="btn btn-sm" onClick={() => addToPlanner(b.kennung)}>
                        + Baukasten
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
