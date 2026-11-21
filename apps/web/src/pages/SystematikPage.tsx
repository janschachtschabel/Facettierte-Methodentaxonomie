import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FMT_RULES } from '@fmt/core';
import { useCatalog } from '../data/CatalogContext.js';
import { EvidenceBadge } from '../components/EvidenceBadge.js';

const DOMAINS = [
  { id: 'A', name: ['Lernprozess'], color: 'var(--dA)', soft: 'var(--dA-soft)' },
  { id: 'B', name: ['Steuerung', '& Adaptivität'], color: 'var(--dB)', soft: 'var(--dB-soft)' },
  { id: 'C', name: ['Interaktion', '& Medialität'], color: 'var(--dC)', soft: 'var(--dC-soft)' },
  { id: 'D', name: ['Gegenstand', '& Zeit'], color: 'var(--dD)', soft: 'var(--dD-soft)' }
];

const QMODS = [
  { id: 'Q1', name: 'Kernkomponenten', text: 'Jeder Baustein deklariert unverzichtbare Kernkomponenten (Regel R-10). Fehlt eine, gilt die Bezeichnung nicht mehr.', basis: 'Implementationsforschung (Durlak & DuPre 2008)' },
  { id: 'Q2', name: 'Bedingungsraum', text: 'Vorwissen, Bildungsstufe, Zeitbudget, Gruppe, Technik. Verhindert kontextblinde Wirkungsrankings (Regel R-06).', basis: 'Expertise-Reversal (Kalyuga et al. 2003; Tetzlaff et al. 2025)' },
  { id: 'Q3', name: 'Qualitätsschicht', text: 'Trennt Design (Plan) von Durchführung (Klassenführung, Unterstützung, kognitive Aktivierung) und nennt Qualitätsrisiken.', basis: 'Praetorius et al. (2018)' },
  { id: 'Q4', name: 'Evidenzschicht', text: 'Befunde mit Evidenzgrad A bis C, Quelle, Geltungsbereich und Gegenposition. Grad A verlangt ≥ 2 unabhängige Synthesen.', basis: 'Meta-analytische Synthesen' },
  { id: 'Q5', name: 'Komposition', text: '11 Lernzustände als Schnittstellen, Slots für Schachtelung, 6 Operatoren, 13 Regeln, 5-Stufen-Zuordnung, SKOS & JSON-LD.', basis: 'Oser & Baeriswyl; Loibl et al. (2024); W3C SKOS/JSON-LD' }
];

const OBSOLETE = [
  ['Lernstile und Lerntypen als Kriterium der Methodenwahl', 'Belastbare Evidenz für die Passung fehlt.', 'Pashler et al. 2008'],
  ['Lernpyramide mit festen Behaltensquoten (10 %, 20 %, 90 %)', 'Die Prozentwerte gehen auf keine belastbare Studie zurück.', 'Subramony et al. 2014'],
  ['Sichtbare Aktivität = kognitive Aktivierung', 'Verhalten zeigt tiefes Verarbeiten nicht zuverlässig an.', 'Thurn et al. 2023; Praetorius et al. 2018'],
  ['Entdecken ohne Anleitung ist überlegen', 'Ohne Unterstützung im Mittel schlechter als explizite Instruktion (d ≈ −0,38).', 'Alfieri et al. 2011'],
  ['Leistung mit KI = Lernen', 'Bessere Übungsleistung mit ungeführter KI kann Prüfung ohne KI verschlechtern (−17 %).', 'Bastani et al. 2025'],
  ['ChatGPT-Meta-Analyse (g ≈ 0,87)', 'Die vielzitierte Synthese wurde am 22. April 2026 zurückgezogen.', 'Wang & Fan 2025; Rückzugsvermerk 2026']
];

const C = 280;
const polar = (r: number, deg: number) => {
  const t = (deg * Math.PI) / 180;
  return [C + r * Math.sin(t), C - r * Math.cos(t)] as const;
};

function sectorPath(r0: number, r1: number, a0: number, a1: number) {
  const [x0, y0] = polar(r1, a0);
  const [x1, y1] = polar(r1, a1);
  const [x2, y2] = polar(r0, a1);
  const [x3, y3] = polar(r0, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${x0} ${y0}A${r1} ${r1} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 ${large} 0 ${x3} ${y3}Z`;
}

export function SystematikPage() {
  const { bundle, valuesOf, labelOf } = useCatalog();
  const [selectedId, setSelectedId] = useState('A2');
  const [plotFilter, setPlotFilter] = useState('');
  const [hoveredPlot, setHoveredPlot] = useState<string | null>(null);

  if (!bundle) return <div className="page-section">Lade Systematik…</div>;

  const step = 360 / bundle.facetten.length;
  const selectedFacet = bundle.facetten.find((f) => f.id === selectedId);
  const selectedQ = QMODS.find((q) => q.id === selectedId);

  const plotBlocks = bundle.bausteine.filter((b) => {
    if (!b.plot) return false;
    if (plotFilter && !b.ansatz.includes(plotFilter)) return false;
    return true;
  });

  const L = 92;
  const Rt = 730;
  const T = 26;
  const B = 410;
  const xs = (v: number) => Rt - v * (Rt - L);
  const ys = (v: number) => B - (v / 3) * (B - T - 30) - 15;

  const domainArcs: Array<{ d: (typeof DOMAINS)[number]; a0: number; a1: number }> = [];
  let start = 0;
  DOMAINS.forEach((d) => {
    const n = bundle.facetten.filter((f) => f.domaene === d.id).length;
    domainArcs.push({ d, a0: start, a1: start + n * step });
    start += n * step;
  });

  return (
    <div className="page-section">
      {/* Hero with Interactive Facet Compass */}
      <div className="split-2" style={{ alignItems: 'center' }}>
        <div>
          <h1>Eine Karte der Unterrichtsmethoden</h1>
          <p className="muted" style={{ fontFamily: 'var(--display)', fontSize: 20, marginTop: 6 }}>
            Facettierte Methodentaxonomie (FMT) · Version {bundle.version} · CC BY 4.0 Jan Schachtschabel
          </p>
          <p style={{ fontSize: 18 }}>
            Wirksamkeit hängt an Merkmalen unter Bedingungen, nicht an Methodennamen. Die FMT beschreibt deshalb jede der{' '}
            <strong>{bundle.bausteine.length} Methoden</strong> als Profil über <strong>13 getrennt kodierte Facetten</strong> in
            vier Domänen – geordnet auf zwei Achsen (Reichweite &amp; Beschreibungsstufe) und kombinierbar über sechs Operatoren.
          </p>

          <div
            className="card"
            style={{
              padding: 16,
              borderLeft: `4px solid ${selectedFacet ? DOMAINS.find((d) => d.id === selectedFacet.domaene)?.color : 'var(--ink)'}`
            }}
          >
            {selectedFacet ? (
              <>
                <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14, color: 'var(--ink-2)' }}>
                  {selectedFacet.id} · Domäne {selectedFacet.domaene} · Kodierung: {selectedFacet.inferenz}-inferent
                </div>
                <h3 style={{ marginTop: 4 }}>{selectedFacet.name}</h3>
                <p style={{ marginBottom: 8 }}>{selectedFacet.leitfrage}</p>
                <ul className="chips" style={{ marginBottom: 10 }}>
                  {valuesOf(selectedFacet.schema).map((w) => (
                    <li key={w.id} className="chip">
                      {w.label}
                    </li>
                  ))}
                </ul>
                <p style={{ fontSize: 14, marginBottom: 4 }}>
                  <strong>Fundierung:</strong> {selectedFacet.fundierung}
                </p>
                <p style={{ fontSize: 14, marginBottom: 0 }}>
                  <strong>Schließt Lücke:</strong> {selectedFacet.schliesst}
                </p>
              </>
            ) : selectedQ ? (
              <>
                <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14, color: 'var(--ink-2)' }}>
                  {selectedQ.id} · Querschnittsmodul
                </div>
                <h3 style={{ marginTop: 4 }}>{selectedQ.name}</h3>
                <p>{selectedQ.text}</p>
                <p style={{ fontSize: 14, marginBottom: 0 }}>
                  <strong>Fundierung:</strong> {selectedQ.basis}
                </p>
              </>
            ) : null}
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
            {QMODS.map((q) => (
              <button
                key={q.id}
                type="button"
                className="btn btn-sm btn-ghost"
                aria-pressed={selectedId === q.id}
                onClick={() => setSelectedId(q.id)}
              >
                {q.id} {q.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <svg
            viewBox="0 0 560 560"
            role="group"
            aria-label="Interaktiver Facettenkompass mit vier Domänen und dreizehn Facetten"
            style={{ width: '100%', maxWidth: 520, display: 'block', margin: '0 auto' }}
          >
            <circle cx={C} cy={C} r={244} fill="none" stroke="var(--rule)" strokeWidth={1} />
            {domainArcs.map(({ d, a0, a1 }) => {
              const [tx, ty] = polar(100, (a0 + a1) / 2);
              return (
                <g key={d.id}>
                  <path d={sectorPath(70, 130, a0, a1)} fill={d.color} stroke="var(--paper)" strokeWidth={2} />
                  <text
                    x={tx}
                    y={ty}
                    textAnchor="middle"
                    fill="var(--on-domain)"
                    fontSize={13.5}
                    fontWeight={700}
                    fontFamily="var(--display)"
                  >
                    {d.name.map((ln, idx) => (
                      <tspan key={idx} x={tx} dy={idx === 0 ? (d.name.length > 1 ? -4 : 4) : 15}>
                        {ln}
                      </tspan>
                    ))}
                  </text>
                </g>
              );
            })}
            {bundle.facetten.map((f, i) => {
              const a0 = i * step;
              const a1 = (i + 1) * step;
              const d = DOMAINS.find((x) => x.id === f.domaene)!;
              const on = selectedId === f.id;
              const [tx, ty] = polar(188, (a0 + a1) / 2);
              return (
                <g
                  key={f.id}
                  tabIndex={0}
                  role="button"
                  aria-pressed={on}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedId(f.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedId(f.id);
                    }
                  }}
                >
                  <path
                    d={sectorPath(136, 238, a0, a1)}
                    fill={on ? d.color : d.soft}
                    stroke="var(--paper)"
                    strokeWidth={2}
                  />
                  <text
                    x={tx}
                    y={ty}
                    textAnchor="middle"
                    fill={on ? 'var(--on-domain)' : 'var(--ink)'}
                    fontSize={13}
                    fontWeight={600}
                    fontFamily="var(--display)"
                  >
                    <tspan x={tx} dy={-4}>
                      {f.id}
                    </tspan>
                    <tspan x={tx} dy={15}>
                      {f.kurz}
                    </tspan>
                  </text>
                </g>
              );
            })}
            <circle cx={C} cy={C} r={64} fill="var(--surface)" stroke="var(--ink)" strokeWidth={1.5} />
            <text x={C} y={C - 4} textAnchor="middle" fill="var(--ink)" fontSize={18} fontWeight={700} fontFamily="var(--display)">
              Methode
            </text>
            <text x={C} y={C + 16} textAnchor="middle" fill="var(--ink)" fontSize={18} fontWeight={700} fontFamily="var(--display)">
              = Profil
            </text>
          </svg>
          <p className="muted" style={{ textAlign: 'center', fontSize: 13.5 }}>
            Facette im Kompass antippen für Leitfrage, Vokabular und Fundierung
          </p>
        </div>
      </div>

      {/* 100-Method Scatter Plot: Lenkung vs. Aktivität */}
      <section style={{ marginTop: 42, paddingTop: 32, borderTop: '1px solid var(--rule)' }}>
        <h2>Lenkung ist nicht Aktivität ({plotBlocks.length} Methoden im Raum)</h2>
        <p className="muted" style={{ maxWidth: '72ch' }}>
          Anleitungsgrad (B1) und Engagementmodus (A2) sind getrennt. Starke Anleitung kann hoch konstruktiv sein (oben links),
          während offene Formen ohne Struktur in die Gefahrenzone unten rechts abrutschen können. Punkt anklicken öffnet das Methodenprofil.
        </p>

        <div style={{ margin: '12px 0' }}>
          <label style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            Ansatz hervorheben:
            <select value={plotFilter} onChange={(e) => setPlotFilter(e.target.value)}>
              <option value="">Alle {bundle.bausteine.filter((b) => b.plot).length} Methoden</option>
              {valuesOf('ansatz').map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <svg viewBox="0 0 760 470" style={{ width: '100%', maxWidth: 880, display: 'block', margin: '0 auto' }}>
            {['passiv', 'aktiv', 'konstruktiv', 'interaktiv'].map((band, i) => {
              const y0 = Math.max(T, ys(i + 0.5));
              const y1 = Math.min(B, ys(i - 0.5));
              return (
                <g key={band}>
                  <rect x={L} y={y0} width={Rt - L} height={y1 - y0} fill={i % 2 ? 'var(--paper)' : 'transparent'} />
                  <text x={L - 10} y={ys(i) + 5} textAnchor="end" fontSize={14} fill="var(--ink-2)" fontFamily="var(--display)">
                    {band}
                  </text>
                </g>
              );
            })}
            <line x1={L} y1={B} x2={Rt} y2={B} stroke="var(--ink)" strokeWidth={1.2} />
            <line x1={L} y1={T} x2={L} y2={B} stroke="var(--ink)" strokeWidth={1.2} />
            <line x1={(L + Rt) / 2} y1={T} x2={(L + Rt) / 2} y2={B} stroke="var(--rule)" strokeDasharray="4 4" />
            <text x={L} y={B + 22} fontSize={14} fill="var(--ink-2)" fontFamily="var(--display)">
              explizit-instruiert
            </text>
            <text x={(L + Rt) / 2} y={B + 22} textAnchor="middle" fontSize={14} fill="var(--ink-2)" fontFamily="var(--display)">
              geleitet
            </text>
            <text x={Rt} y={B + 22} textAnchor="end" fontSize={14} fill="var(--ink-2)" fontFamily="var(--display)">
              offen-entdeckend
            </text>
            <text x={(L + Rt) / 2} y={B + 46} textAnchor="middle" fontSize={15} fontWeight={700} fill="var(--ink)" fontFamily="var(--display)">
              B1 Anleitungsgrad
            </text>
            <text
              x={18}
              y={(T + B) / 2}
              textAnchor="middle"
              fontSize={15}
              fontWeight={700}
              fill="var(--ink)"
              fontFamily="var(--display)"
              transform={`rotate(-90 18 ${(T + B) / 2})`}
            >
              A2 Engagementmodus
            </text>
            <text x={Rt - 8} y={B - 10} textAnchor="end" fontSize={13} fontStyle="italic" fill="var(--dD)">
              offen und passiv: Gefahrenzone
            </text>

            {plotBlocks.map((b) => {
              const cx = xs(b.plot!.x);
              const cy = ys(b.plot!.y);
              const isHov = hoveredPlot === b.kennung;
              return (
                <Link key={b.kennung} to={`/methoden/${b.kennung}`}>
                  <g
                    onMouseEnter={() => setHoveredPlot(b.kennung)}
                    onMouseLeave={() => setHoveredPlot(null)}
                    style={{ cursor: 'pointer' }}
                  >
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isHov ? 8.5 : 5.5}
                      fill={b.ki ? 'var(--paper)' : b.status === 'kuratiert' ? 'var(--dA)' : 'var(--dC)'}
                      stroke="var(--ink)"
                      strokeWidth={b.ki ? 2.4 : 1}
                      opacity={hoveredPlot && !isHov ? 0.55 : 0.95}
                    />
                    <title>{`${b.name} (${b.reichweite.toUpperCase()})`}</title>
                    {(isHov || plotFilter !== '') && (
                      <text
                        x={cx > 560 ? cx - 10 : cx + 10}
                        y={cy + 4}
                        textAnchor={cx > 560 ? 'end' : 'start'}
                        fontSize={12.5}
                        fontWeight={isHov ? 700 : 500}
                        fill="var(--ink)"
                        fontFamily="var(--display)"
                      >
                        {b.name.replace(/ \(.*\)$/, '')}
                      </text>
                    )}
                  </g>
                </Link>
              );
            })}
          </svg>
          <p className="muted" style={{ fontSize: 13.5, textAlign: 'center', margin: '8px 0 0' }}>
            Blau = Kuratierter Kern (22) · Grün = Ersterfassung (78) · Ring = KI-Beteiligung · Hover für Name, Klick für Detailprofil
          </p>
        </div>
      </section>

      {/* Two Axes & Three Layers */}
      <section style={{ marginTop: 42, paddingTop: 32, borderTop: '1px solid var(--rule)' }}>
        <h2>Zwei Achsen, drei Ebenen &amp; sechs Operatoren</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 20 }}>
          <div className="card" style={{ padding: 16, borderTop: '4px solid var(--dA)' }}>
            <h3>1. Design (Plan)</h3>
            <p className="muted" style={{ fontSize: 14.5, margin: 0 }}>
              Hier klassifiziert die FMT: 13 Facetten, Schnittstellen und Kernkomponenten beschreiben das Angebot.
            </p>
          </div>
          <div className="card" style={{ padding: 16, borderTop: '4px solid var(--dB)' }}>
            <h3>2. Durchführung</h3>
            <p className="muted" style={{ fontSize: 14.5, margin: 0 }}>
              Unterrichtsqualität im Klassenraum (Klassenführung, Unterstützung, kognitive Aktivierung, Fachlichkeit).
            </p>
          </div>
          <div className="card" style={{ padding: 16, borderTop: '4px solid var(--dC)' }}>
            <h3>3. Nutzung &amp; Wirkung</h3>
            <p className="muted" style={{ fontSize: 14.5, margin: 0 }}>
              Was Lernende kognitiv tun und was es bewirkt – belegt in der Evidenzschicht, stets unter Bedingungen.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {valuesOf('kompositionsoperator').map((op) => (
            <div key={op.id} className="card" style={{ padding: 14 }}>
              <strong style={{ fontFamily: 'var(--display)', fontSize: 17 }}>{op.label}</strong>
              <p className="muted" style={{ fontSize: 14, margin: '4px 0 0' }}>
                {op.definition}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 13 Composition Rules */}
      <section style={{ marginTop: 42, paddingTop: 32, borderTop: '1px solid var(--rule)' }}>
        <h2>Die 13 Kompositionsregeln (R-00 bis R-12)</h2>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Regel</th>
                <th>Prüft</th>
                <th>Schwere</th>
                <th>Grundlage</th>
              </tr>
            </thead>
            <tbody>
              {FMT_RULES.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontFamily: 'var(--display)', fontWeight: 700 }}>{r.id}</td>
                  <td>{r.prueft}</td>
                  <td>{r.schwere}</td>
                  <td>
                    <span className="basis-tag">{r.grundlage === 'formal' ? 'formal' : `[${r.grundlage}]`}</span>
                    {r.begruendung}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Obsolete Myths & Limits */}
      <section style={{ marginTop: 42, paddingTop: 32, borderTop: '1px solid var(--rule)' }}>
        <h2>Überholt, aber im Umlauf &amp; Grenzen der FMT</h2>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Verbreitete Behauptung</th>
                <th>Forschungsstand</th>
                <th>Beleg</th>
              </tr>
            </thead>
            <tbody>
              {OBSOLETE.map(([claim, status, ref]) => (
                <tr key={claim}>
                  <td>
                    <strong>{claim}</strong>
                  </td>
                  <td>{status}</td>
                  <td className="muted">{ref}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card" style={{ padding: 16, marginTop: 18 }}>
          <h3>Grenzen &amp; Offenlegung</h3>
          <p style={{ fontSize: 15 }}>
            Die FMT ist ein prüfbares Beschreibungsmodell, kein fertiges Bewertungsinstrument: Kodierübereinstimmung (κ ≥ 0,70),
            Kalibrierung der Regeln und fachdidaktische Vertiefungen stehen aus. Evidenzgrade{' '}
            <EvidenceBadge grade="A" /> <EvidenceBadge grade="B" /> <EvidenceBadge grade="C" /> gelten stets nur für ihre genannte
            Geltung; neu ergänzte Bausteine im 100er-Katalog tragen transparent den Status <em>Ersterfassung</em>.
          </p>
          <p className="muted" style={{ fontSize: 14, marginBottom: 0 }}>
            Reichweiten: {valuesOf('reichweite').map((r) => `${r.id.toUpperCase()} ${labelOf('reichweite', r.id)}`).join(' · ')}
          </p>
        </div>
      </section>
    </div>
  );
}
