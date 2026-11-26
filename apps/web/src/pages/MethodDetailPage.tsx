import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import type { FacetMeta } from '@fmt/core';
import { useCatalog } from '../data/CatalogContext.js';
import { MethodPictogram } from '../components/MethodPictogram.js';
import { ProfileRadarSvg } from '../components/ProfileRadarSvg.js';
import { ControlBars } from '../components/ControlBars.js';
import { InterfaceFlow } from '../components/InterfaceFlow.js';
import { EvidenceBadge } from '../components/EvidenceBadge.js';
import { bedarfNachWFeld } from '../planner/bedarfAnzeige.js';

export function MethodDetailPage() {
  const { kennung } = useParams();
  const navigate = useNavigate();
  const { bundle, blocksById, search, labelOf, setComparePair, comparePair, queueBlockForPlanner } = useCatalog();
  const [selectedFacet, setSelectedFacet] = useState<FacetMeta | null>(null);
  const [copied, setCopied] = useState(false);

  if (!bundle || !search) return <div className="page-section">Lade…</div>;
  const b = kennung ? blocksById.get(kennung) : undefined;
  // An old link to a merged or renamed method leads to the current page.
  if (b && kennung && b.kennung !== kennung) return <Navigate to={`/methoden/${encodeURIComponent(b.kennung)}`} replace />;
  if (!b) {
    return (
      <div className="page-section">
        <h1>Methode nicht gefunden</h1>
        <p>Der Baustein „{kennung}“ existiert nicht im Katalog.</p>
        <Link to="/" className="btn">
          ← Zurück zum Katalog
        </Link>
      </div>
    );
  }

  const activeFacet = selectedFacet || bundle.facetten[0];
  const grade = search.bestGrade(b);

  const renderFacetVal = (f: FacetMeta) => {
    const val = b[f.feld];
    if (f.feld === 'steuerung' && b.steuerung) {
      return ['organisation', 'lernweg', 'inhalt', 'sozial', 'bewertung']
        .map((d) => `${labelOf('steuerungsdimension', d)}: ${labelOf('steuerungstraeger', b.steuerung![d] || 'lehrkraft')}`)
        .join(' · ');
    }
    if (Array.isArray(val) && val.length) {
      return val.map((c) => labelOf(f.schema, String(c))).join(', ');
    }
    return '–';
  };

  const citation = `${b.name} (FMT-Baustein ${b.kennung}), Jan Schachtschabel, Facettierte Methodentaxonomie v${bundle.version}, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), ${window.location.origin}/baustein/${b.kennung}`;

  const copyCitation = async () => {
    try {
      await navigator.clipboard.writeText(citation);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // ignore
    }
  };

  return (
    <div className="page-section">
      <div style={{ marginBottom: 14 }}>
        <Link to="/" className="btn btn-sm">
          ← Alle Methoden
        </Link>
      </div>

      {/* Hero Header */}
      <div className="split-2">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <MethodPictogram type={b.piktogramm} size={46} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="range-badge">
                {b.reichweite.toUpperCase()} {labelOf('reichweite', b.reichweite)}
              </span>
              {b.komposit && <span className="status-badge">Kompositbaustein</span>}
              {b.ki && <span className="status-badge">KI-Beteiligung</span>}
              <span className={`status-badge ${b.status === 'kuratiert' ? 'status-kuratiert' : ''}`}>
                {b.status === 'kuratiert' ? 'Kuratiert' : 'Ersterfassung'}
              </span>
              <EvidenceBadge grade={grade} />
            </div>
          </div>

          <h1>{b.name}</h1>
          {b.alternativname.length > 0 && (
            <p className="muted" style={{ fontFamily: 'var(--display)', fontSize: 16, marginTop: 4 }}>
              Auch bekannt als: {b.alternativname.join(' · ')}
            </p>
          )}
          <p style={{ fontSize: 18, marginTop: 10 }}>{b.kurzbeschreibung}</p>

          <ul className="chips" style={{ margin: '12px 0 18px' }}>
            {b.ansatz.map((a) => (
              <li key={a} className="chip chip-d">
                {labelOf('ansatz', a)}
              </li>
            ))}
            {b.lernfunktion.map((f) => (
              <li key={f} className="chip chip-a">
                {labelOf('lernfunktion', f)}
              </li>
            ))}
            {(b.fachbereich || []).map((f) => (
              <li key={`fb-${f}`} className="chip" title="Fachbereich">
                {labelOf('fachbereich', f)}
              </li>
            ))}
          </ul>
          {(b.fachbereichUngeeignet || []).length > 0 && (
            <p className="muted" style={{ fontSize: 14, marginTop: -8 }}>
              Weniger geeignet für: {(b.fachbereichUngeeignet || []).map((f) => labelOf('fachbereich', f)).join(', ')}
            </p>
          )}

          {/* Practical Quick-Facts */}
          <div
            className="card"
            style={{
              padding: 14,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: 10,
              fontFamily: 'var(--display)'
            }}
          >
            <div>
              <div className="muted" style={{ fontSize: 12.5 }}>DAUER</div>
              <strong>{b.dauerMin}–{b.dauerMax} min</strong>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12.5 }}>VORBEREITUNG</div>
              <strong>ca. {b.vorbereitungMin} min</strong>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12.5 }}>LERNGRUPPE</div>
              <strong>{b.gruppeMin}–{b.gruppeMax} Pers.</strong>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12.5 }}>TECHNIK</div>
              <strong>
                {labelOf('technikbedarf', b.technik)}
                {b.internet ? ' + Internet' : ''}
              </strong>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                queueBlockForPlanner(b.kennung);
                navigate('/planer');
              }}
            >
              + In Szenario-Baukasten übernehmen
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setComparePair([b.kennung, comparePair[0] === b.kennung ? comparePair[1] : comparePair[0]]);
                navigate('/vergleich');
              }}
            >
              Mit anderer Methode vergleichen
            </button>
            <a className="btn" href={`/bausteine/${b.kennung}.jsonld`} target="_blank" rel="noreferrer">
              JSON-LD öffnen
            </a>
          </div>
        </div>

        {/* Interactive 13-Facet Profile Radar */}
        <div className="card" style={{ padding: 18 }}>
          <h3 style={{ textAlign: 'center', marginBottom: 4 }}>13-Facetten-Profil</h3>
          <p className="muted" style={{ fontSize: 13.5, textAlign: 'center', marginBottom: 10 }}>
            Facette anklicken für Ausprägung, Leitfrage &amp; Kodiersicherheit
          </p>
          <ProfileRadarSvg
            baustein={b}
            facetten={bundle.facetten}
            mode="full"
            selectedFacetId={activeFacet.id}
            onSelectFacet={setSelectedFacet}
          />
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--grid)', fontSize: 14.5 }}>
            <div style={{ fontFamily: 'var(--display)', fontWeight: 700 }}>
              {activeFacet.id} {activeFacet.name}{' '}
              <span className="status-badge">Inferenz: {activeFacet.inferenz}</span>
            </div>
            <p className="muted" style={{ fontSize: 13.5, margin: '4px 0' }}>
              {activeFacet.leitfrage}
            </p>
            <div>
              <strong>Ausprägung:</strong> {renderFacetVal(activeFacet)}
            </div>
          </div>
        </div>
      </div>

      {/* Interface Flow */}
      <section style={{ marginTop: 32 }}>
        <h2>Schnittstelle &amp; Anschlussfähigkeit</h2>
        <InterfaceFlow baustein={b} allBlocks={bundle.bausteine} labelOf={labelOf} />
      </section>

      {/* Need of the method, grouped by W-field (W-Raster, kind "Bedarf") */}
      <section style={{ marginTop: 32 }}>
        <h2>Was die Methode braucht</h2>
        <p className="muted" style={{ fontSize: 14, maxWidth: '76ch' }}>
          Der Bedarf der Methode, geordnet nach den Fragen des W-Rasters. Nennt dein Szenario das Gegenstück (etwa einen
          Raum ohne freie Fläche), scheidet die Methode im Baukasten aus.
        </p>
        <div className="card" style={{ padding: 0 }}>
          <table aria-label="Bedarf nach W-Feld" style={{ margin: 0 }}>
            <tbody>
              {bedarfNachWFeld(b, bundle, labelOf).map((row) => (
                <tr key={row.wfeld}>
                  <th scope="row" style={{ width: '24%', verticalAlign: 'top' }}>
                    {row.name}
                    <div className="muted" style={{ fontSize: 12.5, fontWeight: 400 }}>
                      {row.frage}
                    </div>
                  </th>
                  <td>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {row.zeilen.map((z) => (
                        <li key={z}>{z}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Practice & Steering */}
      <section className="split-2" style={{ marginTop: 32 }}>
        <div className="card" style={{ padding: 18 }}>
          <h2>Durchführung &amp; Praxis</h2>
          <p>
            <strong>Didaktisches Problem:</strong> {b.problem}
          </p>
          <ol style={{ paddingLeft: 20 }}>
            {b.durchfuehrung.map((step, i) => (
              <li key={i} style={{ marginBottom: 6 }}>
                {step}
              </li>
            ))}
          </ol>
          <p style={{ fontSize: 15 }}>
            <strong>Material:</strong> {b.material.join(', ')}
          </p>
          {b.variante && b.variante.length > 0 && (
            <p style={{ fontSize: 15 }}>
              <strong>Varianten:</strong> {b.variante.join(' · ')}
            </p>
          )}
          {b.kategorie.length > 0 && (
            <p style={{ fontSize: 14 }} className="muted">
              <strong>OpenEduHub-Kategorien:</strong> {b.kategorie.map((iri) => bundle.oeh[iri] || iri).join(', ')}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ padding: 18 }}>
            <h3>B2 Steuerungsort (in Anlehnung an Peschel)</h3>
            <ControlBars steuerung={b.steuerung} />
          </div>

          <div className="card" style={{ padding: 18 }}>
            <h3>Q1–Q3 Kernkomponenten, Bedingungen &amp; Risiken</h3>
            <p style={{ fontSize: 15 }}>
              <strong>Q1 Kernkomponenten (Regel R-10):</strong>{' '}
              {b.kernkomponente.length ? b.kernkomponente.map((k) => k.name).join(' · ') : 'Keine (Kontrast-Baustein)'}
            </p>
            {(b.hinweis || b.geeignetBeiVorwissen || b.ungeeignetBeiStufe) && (
              <p style={{ fontSize: 15 }}>
                <strong>Q2 Bedingungen:</strong> {b.hinweis || ''}{' '}
                {b.geeignetBeiVorwissen &&
                  `Vorwissen: ${b.geeignetBeiVorwissen.map((v) => labelOf('vorwissen', v)).join(', ')}. `}
                {b.ungeeignetBeiStufe &&
                  `Nicht vorgesehen für: ${b.ungeeignetBeiStufe.map((s) => labelOf('bildungsstufe', s)).join(', ')}.`}
              </p>
            )}
            {b.qualitaetsrisiko && b.qualitaetsrisiko.length > 0 && (
              <p style={{ fontSize: 15, marginBottom: 0 }}>
                <strong>Q3 Qualitätsrisiken:</strong> {b.qualitaetsrisiko.join(' · ')}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Evidence */}
      <section style={{ marginTop: 32 }}>
        <h2>Q4 Evidenzlage (stets unter Bedingungen)</h2>
        <div style={{ display: 'grid', gap: 12 }}>
          {b.evidenz.map((e, i) => (
            <div key={i} className="card" style={{ padding: 14, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <EvidenceBadge grade={e.grad} />
              <div>
                <div>
                  <strong>{e.befund}</strong> ({e.quelle})
                </div>
                <div className="muted" style={{ fontSize: 14, marginTop: 3 }}>
                  <strong>Geltung:</strong> {e.geltung}
                </div>
                {e.evidenzBezug && (
                  <div className="muted" style={{ fontSize: 14, marginTop: 3 }}>
                    <strong>Bezug:</strong>{' '}
                    {e.evidenzBezug === 'methode' ? 'Studien zu dieser Methode' : 'abgeleitet vom zugrunde liegenden Wirkprinzip'}
                  </div>
                )}
                {e.umstritten && (
                  <div style={{ fontSize: 14, marginTop: 3, color: 'var(--dB)' }}>
                    <strong>Gegenposition / Einordnung:</strong> {e.umstritten}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Complete 13-Facet Table */}
      <section style={{ marginTop: 32 }}>
        <h2>Vollständiges 13-Facetten-Profil</h2>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Facette</th>
                <th>Ausprägung</th>
                <th>Kodierung</th>
              </tr>
            </thead>
            <tbody>
              {bundle.facetten.map((f) => (
                <tr key={f.id}>
                  <td style={{ fontFamily: 'var(--display)', fontWeight: 600 }}>
                    {f.id} {f.name}
                  </td>
                  <td>{renderFacetVal(f)}</td>
                  <td>
                    <span className="status-badge">{f.inferenz}-inferent</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Sources & CC-BY Attribution */}
      <section style={{ marginTop: 32 }} className="card">
        <div style={{ padding: 18 }}>
          <h2>Quellen &amp; Lizenz (CC BY 4.0)</h2>
          <ul style={{ paddingLeft: 20 }}>
            {b.quellen.map((q, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                {q.url ? (
                  <a href={q.url} target="_blank" rel="noreferrer">
                    {q.titel}
                  </a>
                ) : (
                  q.titel
                )}{' '}
                <span className="status-badge">{q.quelltyp}</span>
                {q.lizenz && <span className="muted" style={{ fontSize: 13 }}> ({q.lizenz})</span>}
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--grid)', fontSize: 14 }}>
            <div style={{ marginBottom: 6 }}>
              <strong>Zitierhinweis (CC BY 4.0):</strong> {citation}
            </div>
            <button type="button" className="btn btn-sm" onClick={copyCitation}>
              {copied ? '✓ Zitierhinweis kopiert' : 'Zitierhinweis kopieren'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
