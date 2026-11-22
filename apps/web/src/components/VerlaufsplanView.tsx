import { Link } from 'react-router-dom';
import type { Baustein } from '@fmt/core';
import { EvidenceBadge } from './EvidenceBadge.js';
import type { LearnerGroup, ScenarioPhaseRow, SubgroupMethodMap } from '../planner/scenarioModel.js';

interface Props {
  rows: ScenarioPhaseRow[];
  groups: LearnerGroup[];
  lehrkraefteInfo?: string;
  allBlocks: Baustein[];
  subgroupMethods: SubgroupMethodMap;
  onSubgroupMethodChange: (stepKey: string, groupId: string, methodId: string | null) => void;
  onEditDiffMeasure: (stepKey: string, groupId: string, groupLabel: string, measure: string) => void;
  onOpenResourcesForStep: (tab: 'oer' | 'material' | 'diff', stepKey: string) => void;
}

const RANGE_READABLE: Record<string, string> = {
  R1: 'Interaktion (R1)',
  R2: 'Szenario (R2)',
  R3: 'Reihe / Ensemble (R3)',
  R4: 'Modul / Kurs (R4)'
};

export function VerlaufsplanView({
  rows,
  groups,
  lehrkraefteInfo,
  allBlocks,
  subgroupMethods,
  onSubgroupMethodChange,
  onEditDiffMeasure,
  onOpenResourcesForStep
}: Props) {
  if (!rows.length) {
    return (
      <div className="card" style={{ padding: 20, marginTop: 12, textAlign: 'center' }}>
        <p className="muted">Noch keine Phasen im Szenario enthalten.</p>
      </div>
    );
  }

  const activeGroups = groups.filter((g) => g.active);
  const sortedBlocks = [...allBlocks].sort((a, b) => a.name.localeCompare(b.name, 'de'));

  return (
    <div className="card" style={{ padding: 16, marginTop: 12 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 10
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ fontFamily: 'var(--display)', fontSize: 17 }}>
              📋 Methodisches Konzept: Rollen &amp; FMT-Verlaufsgerüst
            </strong>
            <span className="status-badge">Schritt 2 · Struktur &amp; Akteure</span>
          </div>
          <p className="muted" style={{ fontSize: 13.5, margin: '4px 0 0' }}>
            Zeigt das <strong>methodische Grundgerüst aus der FMT-Datenbank</strong> (Rollen von Lehrkraft &amp; Schülerteilgruppen).
            Du kannst hier je Teilgruppe Maßnahmen direkt bearbeiten oder eine <strong>alternative FMT-Methode</strong> als parallele
            Schwimmlinie wählen. Material- &amp; WLO-OER-Zuordnung erfolgt in <strong>Schritt 3</strong>, die konkrete thematische
            Anpassung auf dein Thema in <strong>Schritt 4</strong>.
          </p>
        </div>
      </div>

      <div className="scroll">
        <table style={{ width: '100%', fontSize: 13.5, borderCollapse: 'collapse', tableLayout: 'auto' }}>
          <thead>
            <tr>
              <th style={{ width: 34 }}>#</th>
              <th style={{ width: '21%' }}>Phase &amp; FMT-Methode</th>
              <th style={{ width: 78 }}>Zeit</th>
              <th style={{ width: '20%', background: 'color-mix(in srgb, var(--dA-soft) 55%, var(--surface))' }}>
                👩‍🏫 {lehrkraefteInfo || 'Lehrkraft'}
              </th>
              {activeGroups.length > 0 ? (
                activeGroups.map((g) => (
                  <th
                    key={g.id}
                    style={{
                      background:
                        g.focus === 'basis' || g.focus === 'sprachsensibel'
                          ? 'color-mix(in srgb, var(--dB-soft) 55%, var(--surface))'
                          : g.focus === 'vertiefung'
                            ? 'color-mix(in srgb, var(--dD-soft) 55%, var(--surface))'
                            : 'color-mix(in srgb, var(--dC-soft) 55%, var(--surface))'
                    }}
                  >
                    <div>
                      {g.focus === 'basis' || g.focus === 'sprachsensibel'
                        ? '⭐ '
                        : g.focus === 'vertiefung'
                          ? '🚀 '
                          : '👥 '}
                      {g.label}
                      {g.count ? <span className="muted" style={{ fontWeight: 500 }}> ({g.count} Pers.)</span> : null}
                    </div>
                  </th>
                ))
              ) : (
                <th>👥 Lernende</th>
              )}
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
                  <div style={{ fontFamily: 'var(--display)', fontSize: 12, color: 'var(--ink-2)' }}>{r.phaseLabel}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
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
                  {/* Compact status badges linking to Step 3 (without needing a wide extra column) */}
                  <div className="no-print" style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      style={{ fontSize: 11.5, padding: '2px 7px' }}
                      title="In Schritt 3: WLO-OER für diese Phase suchen oder zuordnen"
                      onClick={() => onOpenResourcesForStep('oer', r.key)}
                    >
                      🌐 {r.oerResources.length > 0 ? `${r.oerResources.length} OER` : 'OER suchen'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      style={{ fontSize: 11.5, padding: '2px 7px' }}
                      title="In Schritt 3: Materialauftrag per KI erstellen"
                      onClick={() => onOpenResourcesForStep('material', r.key)}
                    >
                      📝 {r.generatedMaterials.length > 0 ? `${r.generatedMaterials.length} Mat.` : 'Material erstellen'}
                    </button>
                  </div>
                </td>
                <td style={{ whiteSpace: 'nowrap', fontFamily: 'var(--display)' }}>
                  <strong>{r.durationMin} min</strong>
                  {r.orientationRange && (
                    <div className="muted" style={{ fontSize: 11 }}>
                      Richtwert {r.orientationRange}
                    </div>
                  )}
                </td>
                <td style={{ background: 'color-mix(in srgb, var(--dA-soft) 18%, transparent)', fontSize: 13 }}>
                  {r.teacherRole}
                </td>
                {activeGroups.length > 0 ? (
                  activeGroups.map((g) => {
                    const specific = r.differentiation.find((d) => d.groupId === g.id);
                    const altMethodId = subgroupMethods[r.key]?.[g.id] || '';
                    const altMethod = r.subgroupMethods[g.id];
                    const isMain = g.focus === 'regel';
                    const sourceTag =
                      specific?.source === 'ki'
                        ? 'KI'
                        : specific?.source === 'matrix'
                          ? 'Matrix'
                          : specific?.source === 'manuell'
                            ? 'Bearbeitet'
                            : 'FMT';
                    return (
                      <td key={g.id} style={{ fontSize: 12.5 }}>
                        {altMethod && (
                          <div
                            style={{
                              padding: '4px 7px',
                              borderRadius: 5,
                              marginBottom: 6,
                              background: 'var(--dD-soft)',
                              border: '1px solid var(--dD)',
                              fontFamily: 'var(--display)',
                              fontSize: 12
                            }}
                          >
                            🔀 <strong>Parallele Methode:</strong>{' '}
                            <Link to={`/methoden/${altMethod.methodId}`}>{altMethod.methodName}</Link>
                          </div>
                        )}
                        {isMain && !altMethod && (
                          <div style={{ marginBottom: 4, color: 'var(--ink)' }}>{r.learnerRole}</div>
                        )}
                        <textarea
                          aria-label={`Anpassung ${g.label} in ${r.phaseLabel}`}
                          rows={2}
                          style={{
                            width: '100%',
                            fontSize: 12.5,
                            padding: '4px 6px',
                            lineHeight: 1.38,
                            resize: 'vertical',
                            background: 'var(--paper)'
                          }}
                          value={specific?.measure || ''}
                          placeholder={`Anpassung für ${g.label}…`}
                          onChange={(e) => onEditDiffMeasure(r.key, g.id, g.label, e.target.value)}
                        />
                        <div
                          className="no-print"
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4, marginTop: 4 }}
                        >
                          <span className="muted" style={{ fontSize: 11 }}>
                            [{sourceTag}]
                          </span>
                          {!isMain && (
                            <select
                              aria-label={`Alternative Methode für ${g.label} in ${r.phaseLabel}`}
                              style={{ fontSize: 11.5, padding: '2px 5px', maxWidth: 170 }}
                              value={altMethodId}
                              onChange={(e) => onSubgroupMethodChange(r.key, g.id, e.target.value || null)}
                            >
                              <option value="">Methode anpassen (Standard)</option>
                              {sortedBlocks.map((b) => (
                                <option key={b.kennung} value={b.kennung}>
                                  🔀 {b.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </td>
                    );
                  })
                ) : (
                  <td>{r.learnerRole}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
