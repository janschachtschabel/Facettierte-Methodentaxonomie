import { Link } from 'react-router-dom';
import { EvidenceBadge } from './EvidenceBadge.js';
import type { LearnerGroup, ScenarioPhaseRow } from '../planner/scenarioModel.js';

interface Props {
  rows: ScenarioPhaseRow[];
  groups: LearnerGroup[];
  onOpenOerForStep: (stepKey: string) => void;
  onOpenMaterialForStep: (stepKey: string) => void;
}

const RANGE_READABLE: Record<string, string> = {
  R1: 'Interaktion (R1)',
  R2: 'Szenario (R2)',
  R3: 'Reihe / Ensemble (R3)',
  R4: 'Modul / Kurs (R4)'
};

export function VerlaufsplanView({ rows, groups, onOpenOerForStep, onOpenMaterialForStep }: Props) {
  if (!rows.length) {
    return (
      <div className="card" style={{ padding: 20, marginTop: 12, textAlign: 'center' }}>
        <p className="muted">Noch keine Phasen im Szenario enthalten.</p>
      </div>
    );
  }

  const activeGroups = groups.filter((g) => g.active);

  return (
    <div className="card" style={{ padding: 16, marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <strong style={{ fontFamily: 'var(--display)', fontSize: 16.5 }}>
            📋 Rollen-Verlaufstabelle (IMS-LD): Lehrkraft &amp; Lerngruppen im Blick
          </strong>
          <p className="muted" style={{ fontSize: 13.5, margin: '2px 0 0' }}>
            Jede Aktion verlinkt direkt in die FMT-Methodendatenbank und zeigt getrennt nach Rolle, was Lehrkraft und einzelne Schülerteilgruppen tun.
          </p>
        </div>
      </div>

      <div className="scroll">
        <table style={{ width: '100%', fontSize: 13.5, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ width: 38 }}>#</th>
              <th style={{ minWidth: 210 }}>Phase &amp; FMT-Methode</th>
              <th style={{ width: 88 }}>Zeit</th>
              <th style={{ minWidth: 190, background: 'color-mix(in srgb, var(--dA-soft) 55%, var(--surface))' }}>
                👩‍🏫 Lehrkraft
              </th>
              {activeGroups.length > 0 ? (
                activeGroups.map((g) => (
                  <th
                    key={g.id}
                    style={{
                      minWidth: 185,
                      background:
                        g.focus === 'basis' || g.focus === 'sprachsensibel'
                          ? 'color-mix(in srgb, var(--dB-soft) 55%, var(--surface))'
                          : g.focus === 'vertiefung'
                            ? 'color-mix(in srgb, var(--dD-soft) 55%, var(--surface))'
                            : 'color-mix(in srgb, var(--dC-soft) 55%, var(--surface))'
                    }}
                  >
                    {g.focus === 'basis' || g.focus === 'sprachsensibel'
                      ? '⭐ '
                      : g.focus === 'vertiefung'
                        ? '🚀 '
                        : '👥 '}
                    {g.label}
                  </th>
                ))
              ) : (
                <th style={{ minWidth: 190 }}>👥 Lernende</th>
              )}
              <th style={{ minWidth: 195 }}>🌐 Material &amp; WLO-OER</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.key}
                style={{
                  background: r.isNestedSlot ? 'color-mix(in srgb, var(--dD-soft) 35%, var(--surface))' : undefined
                }}
              >
                <td style={{ fontFamily: 'var(--display)', fontWeight: 700, whiteSpace: 'nowrap' }}>{r.orderLabel}</td>
                <td>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 12.5, color: 'var(--ink-2)' }}>{r.phaseLabel}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 3 }}>
                    <Link to={`/methoden/${r.methodId}`} style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14.5 }}>
                      {r.methodName}
                    </Link>
                    {r.evidenceGrade && <EvidenceBadge grade={r.evidenceGrade as 'A' | 'B' | 'C'} />}
                  </div>
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
                    <span className="chip" style={{ fontSize: 11, padding: '1px 6px' }}>
                      {RANGE_READABLE[r.methodRange] || r.methodRange}
                    </span>
                    <span className="muted" style={{ fontSize: 11.5 }}>
                      {r.socialForm}
                    </span>
                  </div>
                </td>
                <td style={{ whiteSpace: 'nowrap', fontFamily: 'var(--display)' }}>
                  <strong>{r.durationMin} min</strong>
                  {r.orientationRange && (
                    <div className="muted" style={{ fontSize: 11.5 }}>
                      Richtwert {r.orientationRange}
                    </div>
                  )}
                </td>
                <td style={{ background: 'color-mix(in srgb, var(--dA-soft) 18%, transparent)' }}>
                  {r.teacherRole}
                </td>
                {activeGroups.length > 0 ? (
                  activeGroups.map((g) => {
                    const specific = r.differentiation.find((d) => d.groupId === g.id);
                    const isMain = g.focus === 'regel';
                    return (
                      <td key={g.id}>
                        {isMain && (
                          <div style={{ marginBottom: specific ? 5 : 0 }}>
                            {r.learnerRole}
                          </div>
                        )}
                        {specific ? (
                          <div style={{ fontSize: 12.5 }}>
                            {specific.measure}{' '}
                            <span className="muted" style={{ fontSize: 11 }}>
                              [{specific.source === 'ki' ? 'KI' : 'FMT'}]
                            </span>
                          </div>
                        ) : (
                          !isMain && <span className="muted" style={{ fontSize: 12.5 }}>{r.learnerRole}</span>
                        )}
                      </td>
                    );
                  })
                ) : (
                  <td>{r.learnerRole}</td>
                )}
                <td>
                  <div style={{ fontSize: 12 }}>
                    <strong>Ort/Technik:</strong> {r.environment}
                  </div>
                  {r.materials.length > 0 && (
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                      {r.materials.slice(0, 3).join(', ')}
                    </div>
                  )}
                  {r.oerResources.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                      {r.oerResources.map((o) => (
                        <a
                          key={o.id}
                          href={o.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: 'block',
                            padding: '4px 7px',
                            borderRadius: 5,
                            background: 'var(--paper)',
                            border: '1px solid var(--dA)',
                            fontSize: 12,
                            textDecoration: 'none',
                            color: 'var(--ink)'
                          }}
                        >
                          🌐 <strong>{o.title}</strong>
                          {o.license ? <span className="muted"> ({o.license})</span> : null}
                        </a>
                      ))}
                    </div>
                  )}
                  <div className="no-print" style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => onOpenOerForStep(r.key)}>
                      🌐 OER
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => onOpenMaterialForStep(r.key)}>
                      📝 Material
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
