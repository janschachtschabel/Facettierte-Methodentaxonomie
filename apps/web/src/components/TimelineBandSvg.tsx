import type { Arrangement, ArrangementNode, Baustein, Funktionskette, WiederkehrNode } from '@fmt/core';
import type { LearnerGroup, SubgroupMethodMap } from '../planner/scenarioModel.js';

interface Props {
  arrangement: Arrangement;
  blocksById: Map<string, Baustein>;
  svgRef?: React.RefObject<SVGSVGElement | null>;
  groups?: LearnerGroup[];
  subgroupMethods?: SubgroupMethodMap;
  ketten?: Funktionskette[];
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

export function TimelineBandSvg({
  arrangement,
  blocksById,
  svgRef,
  groups = [],
  subgroupMethods = {},
  ketten = []
}: Props) {
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
  const kette = arrangement.zieltyp ? ketten.find((k) => k.id === arrangement.zieltyp) : null;

  const items: Array<{ row: number; t0: number; t1: number; b: Baustein; label?: string }> = [];
  const subLaneItems: Array<{ groupId: string; t0: number; t1: number; b: Baustein }> = [];
  const phaseSpans: Array<{ t0: number; t1: number; shortPurpose: string; fullPurpose: string }> = [];
  const wks: WiederkehrNode[] = [];

  const lay = (node: ArrangementNode | undefined, t0: number, d: number, stepKey?: string) => {
    if (!node || typeof node !== 'object') return;
    if (node.typ === 'Einsatz') {
      const b = blocksById.get(node.baustein);
      if (!b) return;
      items.push({ row: Math.min(3, RANG[b.reichweite] || 2), t0, t1: t0 + d, b });

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
  let phaseNum = 0;
  teile.forEach((node, realIdx) => {
    if (!node || typeof node !== 'object') return;
    if (node.typ === 'Wiederkehr') {
      wks.push(node);
      return;
    }
    phaseNum++;
    const opts = node.typ === 'Alternative' && Array.isArray(node.optionen) ? node.optionen : [];
    const dur =
      node.typ === 'Einsatz'
        ? node.dauerMin || 15
        : node.typ === 'Alternative'
          ? Math.max(15, ...opts.map((o) => (o?.typ === 'Einsatz' ? o.dauerMin || 15 : 15)))
          : 20;
    const chainStep = node.kettenschritt && kette ? kette.schritte.find((s) => s.id === node.kettenschritt) : null;
    const fullPurpose = chainStep ? `${chainStep.id.toUpperCase()}: ${chainStep.label}` : `Phase ${phaseNum}`;
    const shortPurpose = chainStep ? `${chainStep.id.toUpperCase()} · ${chainStep.label}` : `P${phaseNum}`;
    phaseSpans.push({ t0: t, t1: t + dur, shortPurpose, fullPurpose });
    lay(node, t, dur, `step-${realIdx}`);
    t += dur;
  });

  const total = Math.max(t, 1);
  const hasPar = isPar && arrangement.ablauf.typ === 'Parallel' && (arrangement.ablauf.begleitend || []).length > 0;
  const hasR3 = items.some((it) => it.row === 3);
  const hasR2 = items.some((it) => it.row === 2);
  const hasR1 = items.some((it) => it.row === 1) || wks.length > 0;

  const rows: Array<[string, number | string]> = [];
  if (hasPar) rows.push(['Begleitend', 0]);
  if (hasR3) rows.push(['R3 Reihe', 3]);
  if (hasR2 || (!hasR3 && !hasR1)) rows.push(['R2 Szenario', 2]);
  if (hasR1) rows.push(['R1 Interaktion', 1]);

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

  // Wide, crisp 1320px coordinate space -> never looks distorted or oversized on 1920x1080!
  const VB_W = 1320;
  const X0 = 148;
  const W = VB_W - X0 - 20;
  const RH = 28;
  const Y0 = 8;
  const yOf = (r: number | string) => Y0 + rows.findIndex((x) => x[1] === r) * RH;
  const xOf = (tt: number) => X0 + (tt / total) * W;
  const phaseAxisY = Y0 + rows.length * RH + 6;
  const H = phaseAxisY + 34;

  return (
    <div>
      <div className="scroll" style={{ margin: 0 }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VB_W} ${H}`}
          role="img"
          aria-label="Zeitband nach Reichweite, Phasenzweck und Teilgruppen-Schwimmlinien"
          style={{ width: '100%', maxWidth: 1240, height: 'auto', display: 'block' }}
        >
          {/* Subtle vertical phase boundaries */}
          {phaseSpans.map((ps, pi) =>
            pi > 0 ? (
              <line
                key={`div-${pi}`}
                x1={xOf(ps.t0)}
                y1={Y0}
                x2={xOf(ps.t0)}
                y2={phaseAxisY + 14}
                stroke="var(--grid)"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
            ) : null
          )}

          {rows.map(([label, r], i) => {
            const y = Y0 + i * RH;
            const isSubLane = typeof r === 'string';
            return (
              <g key={String(r)}>
                <rect
                  x={X0}
                  y={y}
                  width={W}
                  height={RH - 4}
                  rx={3}
                  fill={
                    isSubLane
                      ? 'color-mix(in srgb, var(--dD-soft) 50%, var(--surface))'
                      : i % 2
                        ? 'var(--paper)'
                        : 'transparent'
                  }
                />
                <text
                  x={X0 - 10}
                  y={y + RH / 2 + 2}
                  textAnchor="end"
                  fontSize="12"
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
            const w = Math.max(xOf(it.t1) - x - 3, 4);
            const y = yOf(it.row) + 2;
            const maxChars = Math.floor((w - 12) / 6.5);
            let txt = shortName(it.b.name);
            if (txt.length > maxChars) txt = txt.slice(0, Math.max(3, maxChars - 1)) + '…';
            return (
              <g key={idx}>
                <rect x={x} y={y} width={w} height={RH - 8} rx={4} fill={guidanceColor(it.b)} />
                <title>{`${it.b.name} (${Math.round(it.t1 - it.t0)} min)`}</title>
                {w > 54 && (
                  <text x={x + 7} y={y + (RH - 8) / 2 + 4} fontSize="11.5" fontWeight="600" fill="var(--on-domain)" fontFamily="var(--display)">
                    {txt}
                  </text>
                )}
              </g>
            );
          })}

          {subLaneItems.map((it, idx) => {
            const x = xOf(it.t0);
            const w = Math.max(xOf(it.t1) - x - 3, 4);
            const y = yOf(it.groupId) + 2;
            const maxChars = Math.floor((w - 12) / 6.5);
            let txt = shortName(it.b.name);
            if (txt.length > maxChars) txt = txt.slice(0, Math.max(3, maxChars - 1)) + '…';
            return (
              <g key={`sub-${idx}`}>
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={RH - 8}
                  rx={4}
                  fill={guidanceColor(it.b)}
                  stroke="var(--ink)"
                  strokeDasharray="4 2"
                  strokeWidth={1.1}
                />
                <title>{`Parallele Teilgruppen-Methode: ${it.b.name} (${Math.round(it.t1 - it.t0)} min)`}</title>
                {w > 48 && (
                  <text x={x + 7} y={y + (RH - 8) / 2 + 4} fontSize="11.5" fontWeight="600" fill="var(--on-domain)" fontFamily="var(--display)">
                    {txt}
                  </text>
                )}
              </g>
            );
          })}

          {hasPar &&
            arrangement.ablauf.typ === 'Parallel' &&
            (Array.isArray(arrangement.ablauf.begleitend) ? arrangement.ablauf.begleitend : []).map((n, idx) => {
              if (n.typ !== 'Einsatz') return null;
              const b = blocksById.get(n.baustein);
              if (!b) return null;
              const y = yOf(0) + 2;
              return (
                <g key={`par-${idx}`}>
                  <rect x={X0} y={y} width={W} height={RH - 8} rx={4} fill={guidanceColor(b)} opacity={0.85} />
                  <text x={X0 + 8} y={y + (RH - 8) / 2 + 4} fontSize="11.5" fontWeight="600" fill="var(--on-domain)" fontFamily="var(--display)">
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
                    x={X0 + frac * W - 5}
                    y={yOf(1) + 1}
                    width={10}
                    height={RH - 6}
                    rx={2}
                    fill="var(--paper)"
                    stroke={guidanceColor(b)}
                    strokeWidth={2.4}
                  />
                  <title>{`${b.name}, Durchgang ${i + 1} von ${node.anzahl} (${node.abstand || 'P2D'})`}</title>
                </g>
              );
            });
          })}

          {/* Crisp X-Axis: Phase Purpose Labels + Time Scale */}
          <line x1={X0} y1={phaseAxisY} x2={X0 + W} y2={phaseAxisY} stroke="var(--rule)" strokeWidth="1" />
          {phaseSpans.map((ps, pi) => {
            const x = xOf(ps.t0);
            const w = xOf(ps.t1) - x;
            const maxChars = Math.floor((w - 8) / 6.2);
            const labelTxt =
              maxChars >= 6
                ? ps.shortPurpose.length > maxChars
                  ? ps.shortPurpose.slice(0, maxChars - 1) + '…'
                  : ps.shortPurpose
                : `P${pi + 1}`;
            return (
              <g key={`ps-${pi}`}>
                <title>{`${ps.fullPurpose} (${Math.round(ps.t0)}–${Math.round(ps.t1)} min)`}</title>
                <text
                  x={x + w / 2}
                  y={phaseAxisY + 13}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="600"
                  fill="var(--ink-2)"
                  fontFamily="var(--display)"
                >
                  {labelTxt}
                </text>
              </g>
            );
          })}
          <text x={X0} y={phaseAxisY + 28} fontSize="11" fill="var(--ink-2)" fontFamily="var(--display)">
            0 min
          </text>
          <text x={X0 + W} y={phaseAxisY + 28} textAnchor="end" fontSize="11" fill="var(--ink-2)" fontFamily="var(--display)">
            {Math.round(total)} min Hauptablauf
          </text>
        </svg>
      </div>
      <div className="muted" style={{ fontSize: 12.5, fontFamily: 'var(--display)', display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 4 }}>
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
