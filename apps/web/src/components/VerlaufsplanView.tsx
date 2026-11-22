import { Link } from 'react-router-dom';
import { EvidenceBadge } from './EvidenceBadge.js';
import type { ScenarioPhaseRow } from '../planner/scenarioModel.js';

interface Props {
  rows: ScenarioPhaseRow[];
  onOpenOerForStep: (stepKey: string) => void;
  onOpenMaterialForStep: (stepKey: string) => void;
}

export function VerlaufsplanView({ rows, onOpenOerForStep, onOpenMaterialForStep }: Props) {
  if (!rows.length) {
    return (
      <div className="card" style={{ padding: 20, marginTop: 12, textAlign: 'center' }}>
        <p className="muted">Noch keine Phasen im Szenario enthalten.</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 16, marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <strong style={{ fontFamily: 'var(--display)', fontSize: 16 }}>
            IMS-LD Verlaufsplan (Akteure, verlinkte FMT-Methoden, Material &amp; Binnendifferenzierung)
          </strong>
          <p className="muted" style={{ fontSize: 13.5, margin: '2px 0 0' }}>
            Jede Zeile verlinkt direkt in die FMT-Methodendatenbank und zeigt Lehrkraft-/Lernenden-Rollen sowie aktive Förder- und Erweiterungshinweise.
          </p>
        </div>
      </div>

      <div className="scroll">
        <table style={{ width: '100%', fontSize: 13.5 }}>
          <thead>
            <tr>
              <th style={{ width: 42 }}>#</th>
              <th>Phase &amp; FMT-Methode</th>
              <th style={{ width: 92 }}>Zeit</th>
              <th>Rolle Lehrkraft</th>
              <th>Rolle Lernende &amp; Sozialform</th>
              <th>Lernumgebung, Material &amp; WLO-OER</th>
              <th>Binnendifferenzierung</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.key}
                style={{
                  background: r.isNestedSlot ? 'color-mix(in srgb, var(--dD-soft) 45%, var(--surface))' : undefined
                }}
              >
                <td style={{ fontFamily: 'var(--display)', fontWeight: 700, whiteSpace: 'nowrap' }}>{r.orderLabel}</td>
                <td>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 12.5, color: 'var(--ink-2)' }}>{r.phaseLabel}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                    <Link to={`/methoden/${r.methodId}`} style={{ fontFamily: 'var(--display)', fontWeight: 700 }}>
                      {r.methodName}
                    </Link>
                    <span className="chip" style={{ fontSize: 11, padding: '1px 6px' }}>
                      {r.methodRange}
                    </span>
                    {r.evidenceGrade && <EvidenceBadge grade={r.evidenceGrade as 'A' | 'B' | 'C'} />}
                  </div>
                  <div className="no-print" style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => onOpenOerForStep(r.key)}>
                      🌐 OER
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => onOpenMaterialForStep(r.key)}>
                      📝 Material
                    </button>
                  </div>
                </td>
                <td style={{ whiteSpace: 'nowrap', fontFamily: 'var(--display)' }}>
                  <strong>{r.durationMin} min</strong>
                  {r.orientationRange && (
                    <div className="muted" style={{ fontSize: 11.5 }}>
                      ({r.orientationRange})
                    </div>
                  )}
                </td>
                <td>{r.teacherRole}</td>
                <td>
                  <div>{r.learnerRole}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
                    Sozialform: {r.socialForm}
                  </div>
                </td>
                <td>
                  <div style={{ fontSize: 12.5 }}>
                    <strong>Ort/Technik:</strong> {r.environment}
                  </div>
                  {r.materials.length > 0 && (
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                      Material: {r.materials.join(', ')}
                    </div>
                  )}
                  {r.oerResources.length > 0 && (
                    <ul style={{ margin: '6px 0 0', paddingLeft: 16, fontSize: 12.5 }}>
                      {r.oerResources.map((o) => (
                        <li key={o.id}>
                          <a href={o.url} target="_blank" rel="noreferrer">
                            🌐 {o.title}
                          </a>
                          {o.license ? ` (${o.license})` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td>
                  {r.differentiation.length === 0 ? (
                    <span className="muted">–</span>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {r.differentiation.map((d, di) => (
                        <li key={`${d.groupId}-${di}`}>
                          <strong>{d.groupLabel}:</strong> {d.measure}{' '}
                          <span className="muted" style={{ fontSize: 11 }}>
                            [{d.source === 'ki' ? 'KI' : 'FMT'}]
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
