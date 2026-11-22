import type { Arrangement, ArrangementNode, Baustein, WiederkehrNode } from '@fmt/core';
import type { LearnerGroup, SubgroupMethodMap } from '../planner/scenarioModel.js';

interface Props {
  arrangement: Arrangement;
  blocksById: Map<string, Baustein>;
  svgRef?: React.RefObject<SVGSVGElement | null>;
  groups?: LearnerGroup[];
  subgroupMethods?: SubgroupMethodMap;
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

export function TimelineBandSvg({ arrangement, blocksById, svgRef, groups = [], subgroupMethods = {} }: Props) {
  const isPar = arrangement.ablauf?.typ === 'Parallel';
  const haupt: ArrangementNode | undefined =
    arrangement.ablauf?.typ === 'Parallel' ? arrangement.ablauf.haupt : arrangement.ablauf;
  const teile: ArrangementNode[] =
    haupt && haupt.typ === 'Sequenz'
      ? Array.isArray(haupt.teile)
        ? haupt.teile
        : []
      : haupt
        ? [haupt]
        : [];

  const items: Array<{ row: number; t0: number; t1: number; b: Baustein; label?: string }> = [];
  const subLaneItems: Array<{ groupId: string; t0: number; t1: number; b: Baustein }> = [];
  const wks: WiederkehrNode[] = [];

  const lay = (node: ArrangementNode | undefined, t0: number, d: number, stepKey?: string) => {
    if (!node || typeof node !== 'object') return;
    if (node.typ === 'Einsatz') {
      const b = blocksById.get(node.baustein);
      if (!b) return;
      items.push({ row: Math.min(3, RANG[b.reichweite] || 2), t0, t1: t0 + d, b });

      // Check if any subgroup has a parallel alternative method for this stepKey
      if (stepKey && subgroupMethods[stepKey]) {
        for (const [gid, altMethodId] of Object.entries(subgroupMethods[stepKey])) {
          const altBlock = altMethodId ? blocksById.get(altMethodId) : undefined;
          if (altBlock) {
            subLaneItems.push({ groupId: gid, t0, t1: t0 + d, b: altBlock });
          }
        }
      }

      const kids = (Array.isArray(node.belegung) ? node.belegung : [])
        .map((x) => ({ slot: x?.slotKennung, inhalt: x?.inhalt }))
        .filter((k): k is { slot: string; inhalt: ArrangementNode } => Boolean(k.inhalt));
      const sum = kids.reduce((s, k) => s + (k.inhalt.typ === 'Einsatz' ? k.inhalt.dauerMin || 0 : 0), 0);
      const sc = sum > d && sum > 0 ? d / sum : 1;
      let t = t0;
      kids.forEach((k) => {
        const dd = (k.inhalt.typ === 'Einsatz' ? k.inhalt.dauerMin || 0 : 0) * sc;
        lay(k.inhalt, t, dd, stepKey ? `${stepKey}-slot-${k.slot}` : undefined);
        t += dd;
      });
    } else if (node.typ === 'Alternative') {
      const opts = Array.isArray(node.optionen) ? node.optionen : [];
      const first = opts[0];
      if (first) lay(first, t0, d, stepKey ? `${stepKey}-alt-0` : undefined);
      // Render additional Alternative branches cleanly on a dedicated lane
      opts.slice(1).forEach((opt, oi) => {
        if (opt?.typ === 'Einsatz') {
          const altB = blocksById.get(opt.baustein);
          if (altB) {
            subLaneItems.push({ groupId: `__alt_branch_${oi + 2}`, t0, t1: t0 + d, b: altB });
          }
        }
      });
    }
  };

  let t = 0;
  teile.forEach((node, realIdx) => {
    if (!node || typeof node !== 'object') return;
    if (node.typ === 'Wiederkehr') {
      wks.push(node);
      return;
    }
    const opts = node.typ === 'Alternative' && Array.isArray(node.optionen) ? node.optionen : [];
    const dur =
      node.typ === 'Einsatz'
        ? node.dauerMin || 15
        : node.typ === 'Alternative'
          ? Math.max(15, ...opts.map((o) => (o?.typ === 'Einsatz' ? o.dauerMin || 15 : 15)))
          : 20;
    lay(node, t, dur, `step-${realIdx}`);
    t += dur;
  });

  const total = Math.max(t, 1);
  const rows: Array<[string, number | string]> = [
    ['Begleitend', 0],
    ['R3 Reihe', 3],
    ['R2 Szenario', 2],
    ['R1 Interaktion', 1]
  ];

  // Dynamically add parallel swimlanes ONLY for subgroups/branches that actually have alternative methods!
  const activeSubLaneIds = [...new Set(subLaneItems.map((s) => s.groupId))];
  for (const laneId of activeSubLaneIds) {
    if (laneId.startsWith('__alt_branch_')) {
      rows.push([`⑂ Zweig ${laneId.replace('__alt_branch_', '')}`, laneId]);
    } else {
      const grp = groups.find((g) => g.id === laneId);
      const shortLbl = grp ? grp.label.split(' ')[0] : laneId;
      rows.push([`↳ ${shortLbl}`, laneId]);
    }
  }

  const X0 = 132;
  const W = 748;
  const RH = 38;
  const Y0 = 10;
  const yOf = (r: number | string) => Y0 + rows.findIndex((x) => x[1] === r) * RH;
  const xOf = (tt: number) => X0 + (tt / total) * W;
  const H = Y0 + rows.length * RH + 28;

  return (
    <div>
      <div className="scroll">
        <svg
          ref={svgRef}
          viewBox={`0 0 900 ${H}`}
          role="img"
          aria-label="Zeitband nach Reichweite und Teilgruppen-Schwimmlinien"
          style={{ minWidth: 700, width: '100%', height: 'auto', display: 'block' }}
        >
          {rows.map(([label, r], i) => {
            const y = Y0 + i * RH;
            const isSubLane = typeof r === 'string';
            return (
              <g key={String(r)}>
                <rect
                  x={X0}
                  y={y}
                  width={W}
                  height={RH - 6}
                  fill={isSubLane ? 'color-mix(in srgb, var(--dD-soft) 50%, var(--surface))' : i % 2 ? 'var(--surface)' : 'transparent'}
                />
                <text
                  x={X0 - 10}
                  y={y + RH / 2 + 2}
                  textAnchor="end"
                  fontSize="13"
                  fontWeight={isSubLane ? 700 : 500}
                  fill={isSubLane ? 'var(--dD)' : 'var(--ink-2)'}
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
                  <text x={x + 6} y={y + (RH - 12) / 2 + 4} fontSize="12" fill="var(--on-domain)" fontFamily="var(--display)">
                    {txt}
                  </text>
                )}
              </g>
            );
          })}

          {/* Parallel Subgroup Alternative Method Swimlanes */}
          {subLaneItems.map((it, idx) => {
            const x = xOf(it.t0);
            const w = Math.max(xOf(it.t1) - x - 2, 4);
            const y = yOf(it.groupId) + 3;
            const maxChars = Math.floor((w - 10) / 7);
            let txt = shortName(it.b.name);
            if (txt.length > maxChars) txt = txt.slice(0, Math.max(3, maxChars - 1)) + '…';
            return (
              <g key={`sub-${idx}`}>
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={RH - 12}
                  rx={4}
                  fill={guidanceColor(it.b)}
                  stroke="var(--ink)"
                  strokeDasharray="4 2"
                  strokeWidth={1.2}
                />
                <title>{`Parallele Teilgruppen-Methode: ${it.b.name} (${Math.round(it.t1 - it.t0)} min)`}</title>
                {w > 50 && (
                  <text x={x + 6} y={y + (RH - 12) / 2 + 4} fontSize="12" fill="var(--on-domain)" fontFamily="var(--display)">
                    {txt}
                  </text>
                )}
              </g>
            );
          })}

          {isPar &&
            arrangement.ablauf.typ === 'Parallel' &&
            (Array.isArray(arrangement.ablauf.begleitend) ? arrangement.ablauf.begleitend : []).map((n, idx) => {
              if (n.typ !== 'Einsatz') return null;
              const b = blocksById.get(n.baustein);
              if (!b) return null;
              const y = yOf(0) + 3;
              return (
                <g key={`par-${idx}`}>
                  <rect x={X0} y={y} width={W} height={RH - 12} rx={4} fill={guidanceColor(b)} opacity={0.85} />
                  <text x={X0 + 8} y={y + (RH - 12) / 2 + 4} fontSize="12" fill="var(--on-domain)" fontFamily="var(--display)">
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
      <div className="muted" style={{ fontSize: 13, fontFamily: 'var(--display)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <span><span style={{ color: 'var(--dA)' }}>■</span> explizit</span>
        <span><span style={{ color: 'var(--dC)' }}>■</span> geleitet</span>
        <span><span style={{ color: 'var(--dB)' }}>■</span> offen</span>
        <span><span style={{ color: 'var(--dD)' }}>■</span> offen → explizit</span>
        <span>□ in R1: verteilte Wiederkehr</span>
        {activeSubLaneIds.length > 0 && <span>┄ Parallele Schwimmlinie (Teilgruppe / Zweig)</span>}
      </div>
    </div>
  );
}
