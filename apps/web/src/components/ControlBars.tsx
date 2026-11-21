import type { Steuerungsprofil } from '@fmt/core';

const DIMS: Array<{ key: string; label: string }> = [
  { key: 'organisation', label: 'Organisation' },
  { key: 'lernweg', label: 'Lernweg' },
  { key: 'inhalt', label: 'Inhalt' },
  { key: 'sozial', label: 'Sozialbeziehung' },
  { key: 'bewertung', label: 'Bewertung' }
];

const POS: Record<string, { pct: number; label: string; color: string }> = {
  lehrkraft: { pct: 16, label: 'Lehrkraft', color: 'var(--dA)' },
  geteilt: { pct: 50, label: 'geteilt', color: 'var(--dB)' },
  lernende: { pct: 84, label: 'Lernende', color: 'var(--dC)' }
};

export function ControlBars({ steuerung }: { steuerung?: Steuerungsprofil }) {
  if (!steuerung) {
    return <p className="muted" style={{ fontSize: 14.5 }}>Kein explizites 5-Achsen-Steuerungsprofil hinterlegt.</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: 'var(--display)',
          fontSize: 12.5,
          color: 'var(--ink-2)',
          paddingLeft: 122
        }}
      >
        <span>Lehrkraft</span>
        <span>geteilt</span>
        <span>Lernende</span>
      </div>
      {DIMS.map((d) => {
        const val = steuerung[d.key] || 'lehrkraft';
        const p = POS[val] || POS.lehrkraft;
        return (
          <div key={d.key} style={{ display: 'grid', gridTemplateColumns: '116px 1fr 72px', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 14.5 }}>{d.label}</span>
            <div style={{ position: 'relative', height: 10, background: 'var(--surface-2)', borderRadius: 999, border: '1px solid var(--rule)' }}>
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${p.pct}%`,
                  background: p.color,
                  borderRadius: 999,
                  opacity: 0.35
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: `calc(${p.pct}% - 7px)`,
                  top: -3,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: p.color,
                  border: '2px solid var(--surface)'
                }}
              />
            </div>
            <span style={{ fontFamily: 'var(--display)', fontSize: 13.5, color: 'var(--ink-2)', textAlign: 'right' }}>
              {p.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
