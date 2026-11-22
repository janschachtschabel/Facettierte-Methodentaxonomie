import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Baustein, CatalogBundle, VocabValue } from '@fmt/core';

interface Props {
  bundle: CatalogBundle;
  valuesOf: (schemeId: string) => VocabValue[];
  labelOf: (schemeId: string, code: string) => string;
}

const bestGrade = (b: Baustein): 'A' | 'B' | 'C' => {
  if (b.evidenz.some((e) => e.grad === 'A')) return 'A';
  if (b.evidenz.some((e) => e.grad === 'B')) return 'B';
  return 'C';
};

export function CatalogAnalytics({ bundle, valuesOf, labelOf }: Props) {
  const [plotAnsatz, setPlotAnsatz] = useState('');
  const [plotReichweite, setPlotReichweite] = useState('');
  const [hoveredPlot, setHoveredPlot] = useState<string | null>(null);

  const blocks = bundle.bausteine;

  const plotBlocks = useMemo(
    () =>
      blocks.filter((b) => {
        if (!b.plot) return false;
        if (plotAnsatz && !b.ansatz.includes(plotAnsatz)) return false;
        if (plotReichweite && b.reichweite !== plotReichweite) return false;
        return true;
      }),
    [blocks, plotAnsatz, plotReichweite]
  );

  const hoveredBlock = hoveredPlot ? blocks.find((b) => b.kennung === hoveredPlot) || null : null;

  const L = 96;
  const Rt = 736;
  const T = 26;
  const B = 410;
  const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));
  const xs = (v: number) => clamp(Rt - clamp(v, 0, 1) * (Rt - L), L + 12, Rt - 12);
  const ys = (v: number) => clamp(B - (clamp(v, 0, 3) / 3) * (B - T - 30) - 15, T + 12, B - 12);

  // Heatmap: Reichweite (R1..R4) x Lernfunktion (8)
  const reichweiten = valuesOf('reichweite').filter((r) => r.id !== 'r5');
  const lernfunktionen = valuesOf('lernfunktion');
  const heatData = useMemo(() => {
    let maxVal = 1;
    const matrix = reichweiten.map((r) =>
      lernfunktionen.map((lf) => {
        const count = blocks.filter((b) => b.reichweite === r.id && b.lernfunktion.includes(lf.id)).length;
        if (count > maxVal) maxVal = count;
        return count;
      })
    );
    return { matrix, maxVal };
  }, [blocks, reichweiten, lernfunktionen]);

  // Ansätze x Evidence Grade (A/B/C) & Curated count
  const ansatzStats = useMemo(() => {
    const ansaetze = valuesOf('ansatz');
    const rows = ansaetze.map((a) => {
      const list = blocks.filter((b) => b.ansatz.includes(a.id));
      const gA = list.filter((b) => bestGrade(b) === 'A').length;
      const gB = list.filter((b) => bestGrade(b) === 'B').length;
      const gC = list.filter((b) => bestGrade(b) === 'C').length;
      const kur = list.filter((b) => b.status === 'kuratiert').length;
      return { id: a.id, label: a.label, total: list.length, gA, gB, gC, kur };
    });
    const maxTotal = Math.max(1, ...rows.map((r) => r.total));
    return { rows: rows.sort((a, b) => b.total - a.total), maxTotal };
  }, [blocks, valuesOf]);

  // Learning States Coverage: produces vs requires
  const stateStats = useMemo(() => {
    const states = valuesOf('lernzustand');
    const rows = states.map((s) => ({
      id: s.id,
      label: s.label,
      produces: blocks.filter((b) => (b.nachbedingung || []).includes(s.id)).length,
      requires: blocks.filter((b) => (b.vorbedingung || []).includes(s.id)).length
    }));
    const maxVal = Math.max(1, ...rows.flatMap((r) => [r.produces, r.requires]));
    return { rows, maxVal };
  }, [blocks, valuesOf]);

  // Duration buckets & Social form x Engagement
  const durationBuckets = useMemo(() => {
    const defs = [
      { id: 'kurz', label: 'Kompakt (≤ 10 min)', test: (b: Baustein) => b.dauerMin <= 10, max: '10' },
      { id: 'phase', label: 'Phase (11–30 min)', test: (b: Baustein) => b.dauerMin > 10 && b.dauerMin <= 30, max: '30' },
      { id: 'stunde', label: 'Stunde (31–60 min)', test: (b: Baustein) => b.dauerMin > 30 && b.dauerMin <= 60, max: '60' },
      { id: 'reihe', label: 'Reihe / Projekt (> 60 min)', test: (b: Baustein) => b.dauerMin > 60, max: '' }
    ];
    return defs.map((d) => ({ ...d, count: blocks.filter(d.test).length }));
  }, [blocks]);

  const totalA = blocks.filter((b) => bestGrade(b) === 'A').length;
  const totalB = blocks.filter((b) => bestGrade(b) === 'B').length;
  const totalC = blocks.filter((b) => bestGrade(b) === 'C').length;
  const totalCurated = blocks.filter((b) => b.status === 'kuratiert').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Summary KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <div className="card" style={{ padding: 14, borderTop: '3px solid var(--dA)' }}>
          <div className="muted" style={{ fontSize: 13, fontFamily: 'var(--display)' }}>Bausteine gesamt</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 700 }}>{blocks.length}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>{totalCurated} kuratiert · {blocks.length - totalCurated} Ersterfassung</div>
        </div>
        <div className="card" style={{ padding: 14, borderTop: '3px solid var(--dC)' }}>
          <div className="muted" style={{ fontSize: 13, fontFamily: 'var(--display)' }}>Evidenzverteilung</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 700, marginTop: 4 }}>
            A: {totalA} · B: {totalB} · C: {totalC}
          </div>
          <div className="muted" style={{ fontSize: 12.5 }}>Grad A = ≥ 2 unabhängige Synthesen</div>
        </div>
        <div className="card" style={{ padding: 14, borderTop: '3px solid var(--dB)' }}>
          <div className="muted" style={{ fontSize: 13, fontFamily: 'var(--display)' }}>Reichweiten (Granularität)</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, marginTop: 6 }}>
            {reichweiten.map((r) => `${r.id.toUpperCase()}: ${blocks.filter((b) => b.reichweite === r.id).length}`).join(' · ')}
          </div>
          <div className="muted" style={{ fontSize: 12.5 }}>Interaktion → Szenario → Reihe → Modul</div>
        </div>
        <div className="card" style={{ padding: 14, borderTop: '3px solid var(--dD)' }}>
          <div className="muted" style={{ fontSize: 13, fontFamily: 'var(--display)' }}>Ohne Technik einsetzbar</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 700 }}>
            {blocks.filter((b) => b.technik === 't-keine').length}
          </div>
          <div className="muted" style={{ fontSize: 12.5 }}>
            {blocks.filter((b) => b.ki).length} Bausteine mit KI-Beteiligung
          </div>
        </div>
      </div>

      {/* 1. Scatter Plot B1 x A2 */}
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0 }}>1. Lenkung ist nicht Aktivität ({plotBlocks.length} Methoden im Raum)</h3>
            <p className="muted" style={{ fontSize: 14.5, margin: '4px 0 0', maxWidth: '72ch' }}>
              Anleitungsgrad (B1) und Engagementmodus (A2) sind unabhängig kodiert. Punkt antippen öffnet das Methodenprofil.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              Ansatz:
              <select value={plotAnsatz} onChange={(e) => setPlotAnsatz(e.target.value)}>
                <option value="">Alle Ansätze</option>
                {valuesOf('ansatz').map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              Reichweite:
              <select value={plotReichweite} onChange={(e) => setPlotReichweite(e.target.value)}>
                <option value="">Alle (R1–R4)</option>
                {reichweiten.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.id.toUpperCase()} {r.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <svg viewBox="0 0 760 470" style={{ width: '100%', maxWidth: 880, display: 'block', margin: '10px auto 0' }}>
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
                    r={isHov ? 8.5 : 5}
                    fill={b.ki ? 'var(--paper)' : b.status === 'kuratiert' ? 'var(--dA)' : 'var(--dC)'}
                    stroke="var(--ink)"
                    strokeWidth={b.ki ? 2.4 : 0.9}
                    opacity={hoveredPlot && !isHov ? 0.45 : 0.92}
                  />
                  <title>{`${b.name} (${b.reichweite.toUpperCase()}, ${b.dauerMin}–${b.dauerMax} min)`}</title>
                  {(isHov || (plotAnsatz !== '' && plotBlocks.length <= 28)) && (
                    <text
                      x={cx > 560 ? cx - 10 : cx + 10}
                      y={cy + 4}
                      textAnchor={cx > 560 ? 'end' : 'start'}
                      fontSize={12}
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

        <div
          style={{
            minHeight: 26,
            marginTop: 8,
            textAlign: 'center',
            fontFamily: 'var(--display)',
            fontSize: 14,
            color: hoveredBlock ? 'var(--ink)' : 'var(--ink-2)'
          }}
        >
          {hoveredBlock ? (
            <>
              <strong>{hoveredBlock.name}</strong> ({hoveredBlock.reichweite.toUpperCase()} · {hoveredBlock.dauerMin}–{hoveredBlock.dauerMax} min ·
              Evidenz {bestGrade(hoveredBlock)}) – {hoveredBlock.kurzbeschreibung}
            </>
          ) : (
            <>Blau = Kuratierter Kern ({totalCurated}) · Grün = Ersterfassung ({blocks.length - totalCurated}) · Ring = KI-Beteiligung · Klick öffnet Profil</>
          )}
        </div>
      </div>

      {/* 2. Heatmap: Reichweite x Lernfunktion */}
      <div className="card" style={{ padding: 18 }}>
        <h3 style={{ margin: 0 }}>2. Abdeckungs-Heatmap: Reichweite (R1–R4) × Lernfunktion (A1)</h3>
        <p className="muted" style={{ fontSize: 14.5, margin: '4px 0 12px', maxWidth: '72ch' }}>
          Zeigt auf einen Blick, wie viele Bausteine je Granularitätsstufe und Lernfunktion zur Verfügung stehen. Klick auf eine Zelle filtert den Katalog direkt.
        </p>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Reichweite</th>
                {lernfunktionen.map((lf) => (
                  <th key={lf.id} style={{ fontSize: 13.5, textAlign: 'center' }}>
                    {lf.label.split(' ')[0]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reichweiten.map((r, ri) => (
                <tr key={r.id}>
                  <td style={{ fontFamily: 'var(--display)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {r.id.toUpperCase()} {r.label}
                  </td>
                  {lernfunktionen.map((lf, ci) => {
                    const cnt = heatData.matrix[ri][ci];
                    const alpha = cnt === 0 ? 0 : 0.14 + (cnt / heatData.maxVal) * 0.68;
                    return (
                      <td
                        key={lf.id}
                        style={{
                          textAlign: 'center',
                          fontFamily: 'var(--display)',
                          fontWeight: cnt > 0 ? 700 : 400,
                          background: cnt > 0 ? `color-mix(in srgb, var(--dA) ${Math.round(alpha * 100)}%, var(--surface))` : 'transparent',
                          color: alpha > 0.5 ? 'var(--on-domain)' : 'var(--ink)'
                        }}
                      >
                        {cnt > 0 ? (
                          <Link
                            to={`/?reichweite=${r.id}&lernfunktion=${lf.id}`}
                            style={{ color: 'inherit', textDecoration: 'none', display: 'block' }}
                            title={`${cnt} Methoden (${r.id.toUpperCase()} · ${lf.label}) im Katalog anzeigen`}
                          >
                            {cnt}
                          </Link>
                        ) : (
                          <span className="muted">0</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3 & 4 side by side: Ansätze x Evidenz + Lernzustands-Abdeckung */}
      <div className="split-2">
        <div className="card" style={{ padding: 18 }}>
          <h3 style={{ margin: 0 }}>3. Didaktische Ansätze &amp; Evidenzgrade</h3>
          <p className="muted" style={{ fontSize: 14, margin: '4px 0 12px' }}>
            Mehrfachzuordnungen möglich · Grün = Grad A, Ocker = Grad B, Violett = Grad C · Klick filtert Katalog.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ansatzStats.rows.map((r) => (
              <Link
                key={r.id}
                to={`/?ansatz=${r.id}`}
                style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
                title={`${r.label} im Katalog filtern`}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--display)', fontSize: 13.5, marginBottom: 2 }}>
                  <strong>{r.label}</strong>
                  <span className="muted">
                    {r.total} (A:{r.gA} · B:{r.gB} · C:{r.gC})
                  </span>
                </div>
                <div
                  style={{
                    height: 12,
                    borderRadius: 6,
                    background: 'var(--paper)',
                    border: '1px solid var(--grid)',
                    display: 'flex',
                    overflow: 'hidden'
                  }}
                >
                  {r.gA > 0 && <div style={{ width: `${(r.gA / ansatzStats.maxTotal) * 100}%`, background: 'var(--dC)' }} />}
                  {r.gB > 0 && <div style={{ width: `${(r.gB / ansatzStats.maxTotal) * 100}%`, background: 'var(--dB)' }} />}
                  {r.gC > 0 && <div style={{ width: `${(r.gC / ansatzStats.maxTotal) * 100}%`, background: 'var(--dD)' }} />}
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 18 }}>
          <h3 style={{ margin: 0 }}>4. Schnittstellen-Abdeckung (11 Lernzustände)</h3>
          <p className="muted" style={{ fontSize: 14, margin: '4px 0 12px' }}>
            Grün = Bausteine, die den Zustand <strong>liefern</strong> · Blau = Bausteine, die ihn <strong>voraussetzen</strong>. Klick zeigt Lieferanten.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stateStats.rows.map((s) => (
              <Link
                key={s.id}
                to={`/?liefert=${s.id}`}
                style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
                title={`Bausteine anzeigen, die „${s.label}“ liefern`}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--display)', fontSize: 13, marginBottom: 2 }}>
                  <strong>{s.label}</strong>
                  <span className="muted">
                    liefert: {s.produces} · vorausgesetzt: {s.requires}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  <div style={{ height: 9, background: 'var(--paper)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${(s.produces / stateStats.maxVal) * 100}%`, height: '100%', background: 'var(--dC)' }} />
                  </div>
                  <div style={{ height: 9, background: 'var(--paper)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${(s.requires / stateStats.maxVal) * 100}%`, height: '100%', background: 'var(--dA)' }} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* 5. Duration profile */}
      <div className="card" style={{ padding: 18 }}>
        <h3 style={{ margin: 0 }}>5. Zeitbedarf (Mindestdauer im Unterricht)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 12 }}>
          {durationBuckets.map((b) => (
            <Link
              key={b.id}
              to={b.max ? `/?maxDauer=${b.max}` : '/'}
              className="card"
              style={{ padding: 12, textDecoration: 'none', color: 'inherit', background: 'var(--paper)' }}
            >
              <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14 }}>{b.label}</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 24, fontWeight: 700, color: 'var(--dA)', marginTop: 4 }}>
                {b.count} Methoden
              </div>
              <div className="muted" style={{ fontSize: 12.5 }}>
                {Math.round((b.count / blocks.length) * 100)} % des Katalogs
              </div>
            </Link>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 13.5, marginTop: 10, marginBottom: 0 }}>
          Reichweiten-Skala: {reichweiten.map((r) => `${r.id.toUpperCase()} ${labelOf('reichweite', r.id)} (${r.definition})`).join(' · ')}
        </p>
      </div>
    </div>
  );
}
