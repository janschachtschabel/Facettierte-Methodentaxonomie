import type { Baustein, FacetMeta } from '@fmt/core';

const DOMAIN_COLOR: Record<string, string> = {
  A: 'var(--dA)',
  B: 'var(--dB)',
  C: 'var(--dC)',
  D: 'var(--dD)'
};

const DOMAIN_SOFT: Record<string, string> = {
  A: 'var(--dA-soft)',
  B: 'var(--dB-soft)',
  C: 'var(--dC-soft)',
  D: 'var(--dD-soft)'
};

/** Computes a deterministic 0..1 intensity score per FMT facet for visual fingerprinting. */
export function facetIntensity(b: Baustein, f: FacetMeta): number {
  const val = b[f.feld];
  if (f.feld === 'engagement') {
    const ranks: Record<string, number> = { passiv: 0.25, aktiv: 0.5, konstruktiv: 0.78, interaktiv: 1 };
    const arr = (val as string[] | undefined) || [];
    return arr.length ? Math.max(...arr.map((x) => ranks[x] ?? 0.4)) : 0.15;
  }
  if (f.feld === 'anleitung') {
    const ranks: Record<string, number> = { offen: 0.3, geleitet: 0.65, explizit: 1 };
    const arr = (val as string[] | undefined) || [];
    return arr.length ? Math.max(...arr.map((x) => ranks[x] ?? 0.5)) : 0.2;
  }
  if (f.feld === 'steuerung') {
    const st = b.steuerung;
    if (!st) return 0.35;
    const score: Record<string, number> = { lehrkraft: 0.25, geteilt: 0.65, lernende: 1 };
    const vals = ['organisation', 'lernweg', 'inhalt', 'sozial', 'bewertung']
      .map((d) => score[st[d] || 'lehrkraft'] ?? 0.3);
    return vals.reduce((a, c) => a + c, 0) / vals.length;
  }
  if (f.feld === 'rolle') {
    const arr = (val as string[] | undefined) || [];
    const hasAi = arr.some((x) => x !== 'ki-keine' && !['instrukteur', 'moderator', 'coach', 'ko-lernende'].includes(x));
    return hasAi ? 1 : 0.45;
  }
  if (Array.isArray(val)) {
    if (!val.length) return 0.15;
    return Math.min(1, 0.35 + val.length * 0.2);
  }
  return 0.25;
}

interface Props {
  baustein: Baustein;
  compareWith?: Baustein;
  facetten: FacetMeta[];
  mode?: 'mini' | 'full';
  selectedFacetId?: string | null;
  onSelectFacet?: (f: FacetMeta) => void;
}

export function ProfileRadarSvg({
  baustein,
  compareWith,
  facetten,
  mode = 'mini',
  selectedFacetId,
  onSelectFacet
}: Props) {
  const isMini = mode === 'mini';
  const size = isMini ? 52 : 340;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = isMini ? 22 : 118;
  const innerR = isMini ? 5 : 24;
  const n = facetten.length;

  const polar = (r: number, i: number) => {
    const angle = ((i * 360) / n - 90) * (Math.PI / 180);
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)] as const;
  };

  const polygonPoints = (b: Baustein) =>
    facetten
      .map((f, i) => {
        const r = innerR + facetIntensity(b, f) * (maxR - innerR);
        const [x, y] = polar(r, i);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  if (isMini) {
    return (
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`13-Facetten-Profil von ${baustein.name}`}
        style={{ flexShrink: 0 }}
      >
        <circle cx={cx} cy={cy} r={maxR} fill="var(--paper)" stroke="var(--rule)" strokeWidth="1" />
        <circle cx={cx} cy={cy} r={maxR * 0.55} fill="none" stroke="var(--grid)" strokeWidth="0.7" />
        {facetten.map((f, i) => {
          const r = innerR + facetIntensity(baustein, f) * (maxR - innerR);
          const [x, y] = polar(r, i);
          return (
            <line
              key={f.id}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke={DOMAIN_COLOR[f.domaene]}
              strokeWidth="2.1"
              strokeLinecap="round"
              opacity={0.9}
            />
          );
        })}
        <polygon points={polygonPoints(baustein)} fill="var(--dA)" fillOpacity="0.16" stroke="var(--ink)" strokeWidth="0.9" />
        <circle cx={cx} cy={cy} r={innerR * 0.7} fill={baustein.ki ? 'var(--dD)' : 'var(--surface)'} stroke="var(--ink)" strokeWidth="1" />
      </svg>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Interaktives 13-Facetten-Profilrad von ${baustein.name}`}
      style={{ width: '100%', maxWidth: 370, height: 'auto', display: 'block', margin: '0 auto' }}
    >
      {[0.35, 0.68, 1].map((ring) => (
        <circle
          key={ring}
          cx={cx}
          cy={cy}
          r={innerR + ring * (maxR - innerR)}
          fill="none"
          stroke="var(--grid)"
          strokeWidth="1"
          strokeDasharray={ring === 1 ? undefined : '3 3'}
        />
      ))}

      {facetten.map((f, i) => {
        const [xEnd, yEnd] = polar(maxR, i);
        const [xLab, yLab] = polar(maxR + 24, i);
        const rVal = innerR + facetIntensity(baustein, f) * (maxR - innerR);
        const [xVal, yVal] = polar(rVal, i);
        const active = selectedFacetId === f.id;
        return (
          <g
            key={f.id}
            style={{ cursor: onSelectFacet ? 'pointer' : 'default' }}
            onClick={() => onSelectFacet?.(f)}
          >
            <line x1={cx} y1={cy} x2={xEnd} y2={yEnd} stroke="var(--rule)" strokeWidth="1" />
            <line
              x1={cx}
              y1={cy}
              x2={xVal}
              y2={yVal}
              stroke={DOMAIN_COLOR[f.domaene]}
              strokeWidth={active ? 5 : 3.2}
              strokeLinecap="round"
            />
            <circle cx={xVal} cy={yVal} r={active ? 5.5 : 3.8} fill={DOMAIN_COLOR[f.domaene]} />
            <circle
              cx={xLab}
              cy={yLab}
              r="14"
              fill={active ? DOMAIN_COLOR[f.domaene] : DOMAIN_SOFT[f.domaene]}
              stroke={DOMAIN_COLOR[f.domaene]}
              strokeWidth={active ? 2 : 1}
            />
            <text
              x={xLab}
              y={yLab + 4}
              textAnchor="middle"
              fontSize="11"
              fontWeight="700"
              fontFamily="var(--display)"
              fill={active ? 'var(--on-domain)' : 'var(--ink)'}
            >
              {f.id}
            </text>
            <title>{`${f.id} ${f.name}`}</title>
          </g>
        );
      })}

      <polygon
        points={polygonPoints(baustein)}
        fill="var(--dA)"
        fillOpacity="0.18"
        stroke="var(--dA)"
        strokeWidth="2"
      />

      {compareWith && (
        <polygon
          points={polygonPoints(compareWith)}
          fill="var(--dD)"
          fillOpacity="0.16"
          stroke="var(--dD)"
          strokeWidth="2"
          strokeDasharray="5 3"
        />
      )}

      <circle cx={cx} cy={cy} r={innerR} fill="var(--surface)" stroke="var(--ink)" strokeWidth="1.5" />
      <text
        x={cx}
        y={cy + 4}
        textAnchor="middle"
        fontSize="12"
        fontWeight="700"
        fontFamily="var(--display)"
        fill="var(--ink)"
      >
        {baustein.reichweite.toUpperCase()}
      </text>
    </svg>
  );
}
