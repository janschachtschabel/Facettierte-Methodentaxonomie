import type { Arrangement, ArrangementNode, Baustein, WiederkehrNode } from '@fmt/core';

interface Props {
  arrangement: Arrangement;
  blocksById: Map<string, Baustein>;
  svgRef?: React.RefObject<SVGSVGElement | null>;
}

const RANG: Record<string, number> = { r1: 1, r2: 2, r3: 3, r4: 4, r5: 5 };
const shortName = (n: string) => n.replace(/ \(.*\)$/, '');

function guidanceColor(b: Baustein): string {
  const a = b.anleitung || [];
  if (a.includes('offen') && a.includes('explizit')) return 'var(--dD)';
  if (a.includes('offen')) return 'var(--dB)';
  if (a.includes('geleitet')) return 'var(--dC)';
  return 'var(--dA)';
}

export function TimelineBandSvg({ arrangement, blocksById, svgRef }: Props) {
  const isPar = arrangement.ablauf.typ === 'Parallel';
  const haupt: ArrangementNode = arrangement.ablauf.typ === 'Parallel' ? arrangement.ablauf.haupt : arrangement.ablauf;
  const teile: ArrangementNode[] = haupt.typ === 'Sequenz' ? haupt.teile : [haupt];

  const items: Array<{ row: number; t0: number; t1: number; b: Baustein; label?: string }> = [];
  const wks: WiederkehrNode[] = [];

  const lay = (node: ArrangementNode, t0: number, d: number) => {
    if (node.typ === 'Einsatz') {
      const b = blocksById.get(node.baustein);
      if (!b) return;
      items.push({ row: Math.min(3, RANG[b.reichweite] || 2), t0, t1: t0 + d, b });
      const kids = (node.belegung || []).map((x) => x.inhalt);
      const sum = kids.reduce((s, k) => s + (k.typ === 'Einsatz' ? k.dauerMin || 0 : 0), 0);
      const sc = sum > d && sum > 0 ? d / sum : 1;
      let t = t0;
      kids.forEach((k) => {
        const dd = (k.typ === 'Einsatz' ? k.dauerMin || 0 : 0) * sc;
        lay(k, t, dd);
        t += dd;
      });
    } else if (node.typ === 'Alternative') {
      const first = node.optionen[0];
      if (first) lay(first, t0, d);
    }
  };

  let t = 0;
  teile.forEach((node) => {
    if (node.typ === 'Wiederkehr') {
      wks.push(node);
      return;
    }
    const dur =
      node.typ === 'Einsatz'
        ? node.dauerMin || 15
        : node.typ === 'Alternative'
          ? Math.max(...node.optionen.map((o) => (o.typ === 'Einsatz' ? o.dauerMin || 15 : 15)))
          : 20;
    lay(node, t, dur);
    t += dur;
  });

  const total = Math.max(t, 1);
  const rows: Array<[string, number]> = [
    ['Begleitend', 0],
    ['R3 Reihe', 3],
    ['R2 Szenario', 2],
    ['R1 Interaktion', 1]
  ];
  const X0 = 118;
  const W = 762;
  const RH = 40;
  const Y0 = 10;
  const yOf = (r: number) => Y0 + rows.findIndex((x) => x[1] === r) * RH;
  const xOf = (tt: number) => X0 + (tt / total) * W;
  const H = Y0 + rows.length * RH + 28;

  return (
    <div>
      <div className="scroll">
        <svg
          ref={svgRef}
          viewBox={`0 0 900 ${H}`}
          role="img"
          aria-label="Zeitband nach Reichweite"
          style={{ minWidth: 700, width: '100%', height: 'auto', display: 'block' }}
        >
          {rows.map(([label, r], i) => {
            const y = Y0 + i * RH;
            return (
              <g key={r}>
                <rect x={X0} y={y} width={W} height={RH - 6} fill={i % 2 ? 'var(--surface)' : 'transparent'} />
                <text
                  x={X0 - 10}
                  y={y + RH / 2 + 2}
                  textAnchor="end"
                  fontSize="13.5"
                  fill="var(--ink-2)"
                  fontFamily="var(--display)"
                >
                  {label}
                </text>
              </g>
            );
          })}

          {items.map((it, idx) => {
            const x = xOf(it.t0);
            const w = Math.max(xOf(it.t1) - x - 2, 4);
            const y = yOf(it.row) + 3;
            const maxChars = Math.floor((w - 10) / 7);
            let txt = shortName(it.b.name);
            if (txt.length > maxChars) txt = txt.slice(0, Math.max(3, maxChars - 1)) + '…';
            return (
              <g key={idx}>
                <rect x={x} y={y} width={w} height={RH - 12} rx={4} fill={guidanceColor(it.b)} />
                <title>{`${it.b.name} (${Math.round(it.t1 - it.t0)} min)`}</title>
                {w > 56 && (
                  <text x={x + 6} y={y + (RH - 12) / 2 + 4} fontSize="12.5" fill="var(--on-domain)" fontFamily="var(--display)">
                    {txt}
                  </text>
                )}
              </g>
            );
          })}

          {isPar &&
            arrangement.ablauf.typ === 'Parallel' &&
            arrangement.ablauf.begleitend.map((n, idx) => {
              if (n.typ !== 'Einsatz') return null;
              const b = blocksById.get(n.baustein);
              if (!b) return null;
              const y = yOf(0) + 3;
              return (
                <g key={`par-${idx}`}>
                  <rect x={X0} y={y} width={W} height={RH - 12} rx={4} fill={guidanceColor(b)} opacity={0.85} />
                  <text x={X0 + 8} y={y + (RH - 12) / 2 + 4} fontSize="12.5" fill="var(--on-domain)" fontFamily="var(--display)">
                    {b.name} (begleitend, {n.dauerMin || b.dauerMin} min)
                  </text>
                </g>
              );
            })}

          {wks.map((node, wi) => {
            const b = blocksById.get(node.baustein);
            if (!b) return null;
            return Array.from({ length: node.anzahl }).map((_, i) => {
              const frac = node.anzahl > 1 ? 0.35 + (0.62 * i) / (node.anzahl - 1) : 0.7;
              return (
                <g key={`wk-${wi}-${i}`}>
                  <rect
                    x={X0 + frac * W - 6}
                    y={yOf(1) + 1}
                    width={12}
                    height={RH - 8}
                    rx={2}
                    fill="var(--paper)"
                    stroke={guidanceColor(b)}
                    strokeWidth={3}
                  />
                  <title>{`${b.name}, Durchgang ${i + 1} von ${node.anzahl} (${node.abstand || 'P2D'})`}</title>
                </g>
              );
            });
          })}

          <text x={X0} y={Y0 + rows.length * RH + 16} fontSize="13" fill="var(--ink-2)" fontFamily="var(--display)">
            0 min
          </text>
          <text x={X0 + W} y={Y0 + rows.length * RH + 16} textAnchor="end" fontSize="13" fill="var(--ink-2)" fontFamily="var(--display)">
            {Math.round(total)} min Hauptablauf
          </text>
        </svg>
      </div>
      <div className="muted" style={{ fontSize: 13.5, fontFamily: 'var(--display)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <span><span style={{ color: 'var(--dA)' }}>■</span> explizit</span>
        <span><span style={{ color: 'var(--dC)' }}>■</span> geleitet</span>
        <span><span style={{ color: 'var(--dB)' }}>■</span> offen</span>
        <span><span style={{ color: 'var(--dD)' }}>■</span> offen → explizit</span>
        <span>□ in R1: verteilte Wiederkehr</span>
      </div>
    </div>
  );
}
