import type { Baustein } from '@fmt/core';

interface Props {
  baustein: Baustein;
  labelOf: (schemeId: string, code: string) => string;
}

const ENGAGEMENT_LEVEL: Record<string, number> = {
  passiv: 1,
  aktiv: 2,
  konstruktiv: 3,
  interaktiv: 4
};

function guidancePalette(anleitung: string[]): { fill: string; soft: string; label: string } {
  if (anleitung.includes('offen') && anleitung.includes('explizit')) {
    return { fill: 'var(--dD)', soft: 'var(--dD-soft)', label: 'offen → explizit' };
  }
  if (anleitung.includes('offen')) {
    return { fill: 'var(--dB)', soft: 'var(--dB-soft)', label: 'offen' };
  }
  if (anleitung.includes('geleitet')) {
    return { fill: 'var(--dC)', soft: 'var(--dC-soft)', label: 'geleitet' };
  }
  return { fill: 'var(--dA)', soft: 'var(--dA-soft)', label: 'explizit' };
}

function shortStepLabel(step: string): string {
  const clean = step.replace(/^\d+[.)]\s*/, '').trim();
  const words = clean.split(/\s+/).slice(0, 2).join(' ');
  return words.length > 13 ? `${words.slice(0, 12)}…` : words;
}

function socialIcon(interaktion: string[]): string {
  if (interaktion.some((x) => x.startsWith('kleingruppe'))) return '⬡ Gruppe';
  if (interaktion.includes('partner')) return '👥 Partner';
  if (interaktion.some((x) => x.startsWith('plenum'))) return '◎ Plenum';
  return '👤 Einzel';
}

/**
 * Data-driven parametric mini-diagram rendered on every catalog method card.
 * Instantly communicates: workflow phases / nested slots, guidance color (B1),
 * engagement intensity (A2), social form (C1), and distributed/AI markers.
 */
export function MethodCardDiagram({ baustein, labelOf }: Props) {
  const pal = guidancePalette(baustein.anleitung || []);
  const maxEng = Math.max(1, ...(baustein.engagement || []).map((e) => ENGAGEMENT_LEVEL[e] || 2));
  const engLabel =
    baustein.engagement?.length > 0 ? labelOf('engagement', baustein.engagement[baustein.engagement.length - 1]) : 'aktiv';
  const hasSlots = Boolean(baustein.slot && baustein.slot.length > 0);
  const isDistributed = (baustein.sequenz || []).includes('verteilt') || (baustein.sequenz || []).includes('verschachtelt');

  const stepLabels = (baustein.durchfuehrung || []).slice(0, 3).map(shortStepLabel);
  while (stepLabels.length < 2) {
    stepLabels.push(stepLabels.length === 0 ? 'Impuls' : 'Sicherung');
  }

  return (
    <div
      style={{
        background: 'var(--paper)',
        border: '1px solid var(--grid)',
        borderRadius: 6,
        padding: '6px 8px 4px',
        margin: '4px 0 2px'
      }}
      title={`Ablaufvorschau: ${pal.label} · Engagement: ${engLabel} · ${socialIcon(baustein.interaktion || [])}`}
    >
      <svg viewBox="0 0 280 54" style={{ width: '100%', height: 50, display: 'block' }} aria-hidden="true">
        {/* Left: Workflow / Container diagram */}
        {hasSlots ? (
          <g>
            <rect
              x={2}
              y={4}
              width={202}
              height={32}
              rx={5}
              fill={pal.soft}
              stroke={pal.fill}
              strokeWidth={1.3}
              strokeDasharray="4 2"
            />
            {(baustein.slot || []).slice(0, 2).map((sl, i, arr) => {
              const slotW = arr.length === 1 ? 186 : 90;
              const x = 10 + i * 96;
              return (
                <g key={sl.kennung}>
                  <rect x={x} y={10} width={slotW} height={20} rx={4} fill="var(--surface)" stroke={pal.fill} strokeWidth={1.1} />
                  <text
                    x={x + slotW / 2}
                    y={23}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight={600}
                    fill="var(--ink)"
                    fontFamily="var(--display)"
                  >
                    ▣ {sl.name.length > 13 ? `${sl.name.slice(0, 12)}…` : sl.name}
                  </text>
                </g>
              );
            })}
          </g>
        ) : (
          <g>
            {stepLabels.map((lbl, idx) => {
              const count = stepLabels.length;
              const gap = 10;
              const boxW = Math.floor((204 - gap * (count - 1)) / count);
              const x = 2 + idx * (boxW + gap);
              return (
                <g key={idx}>
                  <rect
                    x={x}
                    y={8}
                    width={boxW}
                    height={24}
                    rx={4}
                    fill={idx === 0 ? pal.soft : 'var(--surface)'}
                    stroke={pal.fill}
                    strokeWidth={idx === 0 ? 1.4 : 1}
                  />
                  <text
                    x={x + boxW / 2}
                    y={23}
                    textAnchor="middle"
                    fontSize={8.8}
                    fontWeight={idx === 0 ? 700 : 500}
                    fill="var(--ink)"
                    fontFamily="var(--display)"
                  >
                    {lbl}
                  </text>
                  {idx < count - 1 && (
                    <path
                      d={`M ${x + boxW + 2} 20 L ${x + boxW + gap - 2} 20`}
                      stroke="var(--ink-2)"
                      strokeWidth={1.2}
                      strokeLinecap="round"
                    />
                  )}
                </g>
              );
            })}
          </g>
        )}

        {/* Right: 4-step ICAP Activity Meter */}
        <g transform="translate(216, 6)">
          <text x={30} y={7} textAnchor="middle" fontSize={8} fill="var(--ink-2)" fontFamily="var(--display)">
            {engLabel}
          </text>
          {[1, 2, 3, 4].map((lvl) => {
            const barH = 4 + lvl * 4;
            const active = lvl <= maxEng;
            return (
              <rect
                key={lvl}
                x={(lvl - 1) * 15 + 3}
                y={30 - barH}
                width={10}
                height={barH}
                rx={2}
                fill={active ? pal.fill : 'var(--grid)'}
                opacity={active ? 0.92 : 0.6}
              />
            );
          })}
        </g>

        {/* Bottom strip: social form + guidance + rhythm/AI indicator */}
        <text x={2} y={50} fontSize={8.5} fill="var(--ink-2)" fontFamily="var(--display)">
          {socialIcon(baustein.interaktion || [])} · {pal.label}
          {isDistributed ? ' · ◆ verteilt' : ''}
          {baustein.ki ? ' · ◉ KI' : ''}
        </text>
      </svg>
    </div>
  );
}
