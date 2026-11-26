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

const ANLEITUNG_X: Record<string, number> = { explizit: 0.85, geleitet: 0.5, offen: 0.15 };
const ENGAGEMENT_Y: Record<string, number> = { passiv: 0.3, aktiv: 1.1, konstruktiv: 2.0, interaktiv: 2.75 };

function coordsOf(b: Baustein): { x: number; y: number } {
  if (b.plot && typeof b.plot.x === 'number' && typeof b.plot.y === 'number') {
    return b.plot;
  }
  const xs = (b.anleitung || []).map((a) => ANLEITUNG_X[a]).filter((n) => typeof n === 'number');
  const ys = (b.engagement || []).map((e) => ENGAGEMENT_Y[e]).filter((n) => typeof n === 'number');
  return {
    x: xs.length ? xs.reduce((s, n) => s + n, 0) / xs.length : 0.5,
    y: ys.length ? ys.reduce((s, n) => s + n, 0) / ys.length : 1.5
  };
}

export function CatalogAnalytics({ bundle, valuesOf, labelOf }: Props) {
  const [plotAnsatz, setPlotAnsatz] = useState('');
  const [plotReichweite, setPlotReichweite] = useState('');
  const [hoveredPlot, setHoveredPlot] = useState<string | null>(null);

  const blocks = bundle.bausteine;
  const hasHighlight = Boolean(plotAnsatz || plotReichweite);

  const isHighlighted = (b: Baustein) => {
    if (plotAnsatz && !b.ansatz.includes(plotAnsatz)) return false;
    if (plotReichweite && b.reichweite !== plotReichweite) return false;
    return true;
  };

  // ALWAYS keep ALL methods visible in the scatter plot; optional selection highlights without hiding
  const { bgBlocks, fgBlocks } = useMemo(() => {
    if (!hasHighlight) return { bgBlocks: [] as Baustein[], fgBlocks: blocks };
    const bg: Baustein[] = [];
    const fg: Baustein[] = [];
    for (const b of blocks) {
      if (isHighlighted(b)) fg.push(b);
      else bg.push(b);
    }
    return { bgBlocks: bg, fgBlocks: fg };
  }, [blocks, hasHighlight, plotAnsatz, plotReichweite]);

  const hoveredBlock = hoveredPlot ? blocks.find((b) => b.kennung === hoveredPlot) || null : null;

  const L = 96;
  const Rt = 736;
  const T = 26;
  const B = 410;
  const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));
  const xs = (v: number) => clamp(Rt - clamp(v, 0, 1) * (Rt - L), L + 12, Rt - 12);
  const ys = (v: number) => clamp(B - (clamp(v, 0, 3) / 3) * (B - T - 30) - 15, T + 12, B - 12);

  // Deterministic collision-free label placement for highlighted subset
  const staticLabels = useMemo(() => {
    const map = new Map<string, { x: number; y: number; anchor: 'start' | 'end'; text: string }>();
    if (!hasHighlight || fgBlocks.length > 28) return map;

    const placed: Array<{ x0: number; x1: number; y0: number; y1: number }> = [];
    const sorted = [...fgBlocks].sort((a, b) => {
      const ca = coordsOf(a);
      const cb = coordsOf(b);
      return ys(ca.y) - ys(cb.y) || xs(ca.x) - xs(cb.x);
    });

    for (const b of sorted) {
      const pt = coordsOf(b);
      const cx = xs(pt.x);
      const cy = ys(pt.y);
      const rawText = b.name.replace(/ \(.*\)$/, '');
      const text = rawText.length > 28 ? `${rawText.slice(0, 27)}…` : rawText;
      const w = text.length * 6.4 + 6;
      const h = 14;
      const preferLeft = cx > 540;
      const candidates: Array<{ x: number; y: number; anchor: 'start' | 'end' }> = [
        { x: preferLeft ? cx - 9 : cx + 9, y: cy + 4, anchor: preferLeft ? 'end' : 'start' },
        { x: preferLeft ? cx + 9 : cx - 9, y: cy + 4, anchor: preferLeft ? 'start' : 'end' },
        { x: preferLeft ? cx - 9 : cx + 9, y: cy - 9, anchor: preferLeft ? 'end' : 'start' },
        { x: preferLeft ? cx - 9 : cx + 9, y: cy + 16, anchor: preferLeft ? 'end' : 'start' },
        { x: preferLeft ? cx + 9 : cx - 9, y: cy - 9, anchor: preferLeft ? 'start' : 'end' },
        { x: preferLeft ? cx + 9 : cx - 9, y: cy + 16, anchor: preferLeft ? 'start' : 'end' }
      ];

      for (const c of candidates) {
        const x0 = c.anchor === 'start' ? c.x : c.x - w;
        const x1 = c.anchor === 'start' ? c.x + w : c.x;
        const y0 = c.y - h + 2;
        const y1 = c.y + 2;
        if (x0 < L + 2 || x1 > Rt - 2 || y0 < T + 2 || y1 > B - 2) continue;
        const overlaps = placed.some((p) => !(x1 + 3 < p.x0 || x0 - 3 > p.x1 || y1 + 2 < p.y0 || y0 - 2 > p.y1));
        if (!overlaps) {
          placed.push({ x0, x1, y0, y1 });
          map.set(b.kennung, { ...c, text });
          break;
        }
      }
    }
    return map;
  }, [fgBlocks, hasHighlight]);

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
            <h3 style={{ margin: 0 }}>
              1. Lenkung ist nicht Aktivität (alle {blocks.length} Methoden im Raum
              {hasHighlight ? ` · ${fgBlocks.length} hervorgehoben` : ''})
            </h3>
            <p className="muted" style={{ fontSize: 14.5, margin: '4px 0 0', maxWidth: '72ch' }}>
              Anleitungsgrad (B1) und Engagementmodus (A2) sind unabhängig kodiert. Alle {blocks.length} Methoden bleiben stets sichtbar; Auswahl hebt Teilmengen hervor.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              Ansatz hervorheben:
              <select value={plotAnsatz} onChange={(e) => setPlotAnsatz(e.target.value)}>
                <option value="">Alle {blocks.length} Methoden</option>
                {valuesOf('ansatz').map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              Reichweite hervorheben:
              <select value={plotReichweite} onChange={(e) => setPlotReichweite(e.target.value)}>
                <option value="">Alle (R1–R4)</option>
                {reichweiten.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label} ({r.id.toUpperCase()})
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {hasHighlight && (
          <div
            style={{
              marginTop: 8,
              padding: '6px 10px',
              borderRadius: 6,
              background: 'var(--dA-soft)',
              fontFamily: 'var(--display)',
              fontSize: 13,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap'
            }}
          >
            <span>
              <strong>Hervorhebung aktiv:</strong> {fgBlocks.length} von {blocks.length} Methoden hervorgehoben
              {plotAnsatz ? ` (Ansatz: ${labelOf('ansatz', plotAnsatz)})` : ''}
              {plotReichweite ? ` (Reichweite: ${plotReichweite.toUpperCase()})` : ''} – die übrigen {bgBlocks.length} Methoden bleiben als grauer Hintergrund sichtbar.
            </span>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setPlotAnsatz('');
                setPlotReichweite('');
              }}
            >
              Hervorhebung zurücksetzen
            </button>
          </div>
        )}

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

          {/* Background (non-highlighted) methods stay visibly rendered to avoid visual distortion */}
          {bgBlocks.map((b) => {
            const pt = coordsOf(b);
            const cx = xs(pt.x);
            const cy = ys(pt.y);
            return (
              <Link key={b.kennung} to={`/methoden/${b.kennung}`}>
                <g
                  onMouseEnter={() => setHoveredPlot(b.kennung)}
                  onMouseLeave={() => setHoveredPlot(null)}
                  style={{ cursor: 'pointer' }}
                >
                  <circle cx={cx} cy={cy} r={3.8} fill="var(--ink-2)" opacity={0.18} />
                  <title>{`${b.name} (${b.reichweite.toUpperCase()}, ${b.dauerMin}–${b.dauerMax} min)`}</title>
                </g>
              </Link>
            );
          })}
          {/* Foreground (all methods by default, or highlighted subset) */}
          {fgBlocks.map((b) => {
            const pt = coordsOf(b);
            const cx = xs(pt.x);
            const cy = ys(pt.y);
            const isHov = hoveredPlot === b.kennung;
            const lbl = staticLabels.get(b.kennung);
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
                    r={isHov ? 8.5 : hasHighlight ? 5.6 : 5}
                    fill={b.ki ? 'var(--paper)' : b.status === 'kuratiert' ? 'var(--dA)' : 'var(--dC)'}
                    stroke="var(--ink)"
                    strokeWidth={b.ki ? 2.4 : 0.9}
                    opacity={hoveredPlot && !isHov ? 0.42 : 0.94}
                  />
                  <title>{`${b.name} (${b.reichweite.toUpperCase()}, ${b.dauerMin}–${b.dauerMax} min)`}</title>
                  {lbl && !isHov && (
                    <text
                      x={lbl.x}
                      y={lbl.y}
                      textAnchor={lbl.anchor}
                      fontSize={11.5}
                      fontWeight={500}
                      fill="var(--ink)"
                      fontFamily="var(--display)"
                      style={{ paintOrder: 'stroke', stroke: 'var(--surface)', strokeWidth: 3.5, strokeLinejoin: 'round' }}
                    >
                      {lbl.text}
                    </text>
                  )}
                </g>
              </Link>
            );
          })}
          {hoveredBlock && (() => {
            const pt = coordsOf(hoveredBlock);
            const cx = xs(pt.x);
            const cy = ys(pt.y);
            const label = hoveredBlock.name.replace(/ \(.*\)$/, '');
            const anchor = cx > 500 ? 'end' : 'start';
            const tx = anchor === 'end' ? cx - 12 : cx + 12;
            return (
              <g style={{ pointerEvents: 'none' }}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={8.5}
                  fill={hoveredBlock.ki ? 'var(--paper)' : hoveredBlock.status === 'kuratiert' ? 'var(--dA)' : 'var(--dC)'}
                  stroke="var(--ink)"
                  strokeWidth={2.2}
                />
                <text
                  x={tx}
                  y={cy + 4}
                  textAnchor={anchor}
                  fontSize={13}
                  fontWeight={700}
                  fill="var(--ink)"
                  fontFamily="var(--display)"
                  style={{ paintOrder: 'stroke', stroke: 'var(--surface)', strokeWidth: 4.5, strokeLinejoin: 'round' }}
                >
                  {label}
                </text>
              </g>
            );
          })()}
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
          <h3 style={{ margin: 0 }}>4. Schnittstellen-Abdeckung ({stateStats.rows.length} Lernzustände)</h3>
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
