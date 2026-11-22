import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { scoreDifferentiationMatrix, suggestAlternativeMethodsForGroup, type Baustein } from '@fmt/core';
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

const RANGE_ORDER: Record<string, number> = { r1: 1, r2: 2, r3: 3, r4: 4, r5: 5 };

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
  const [editMode, setEditMode] = useState(false);
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null);

  const matrixByGroup = useMemo(() => {
    const m = new Map<string, ReturnType<typeof scoreDifferentiationMatrix>>();
    for (const g of groups) {
      m.set(g.id, scoreDifferentiationMatrix({ personaId: g.personaId, selectedValues: g.matrixValues, limit: 5 }));
    }
    return m;
  }, [groups]);

  if (!rows.length) {
    return (
      <div className="card" style={{ padding: 20, marginTop: 12, textAlign: 'center' }}>
        <p className="muted">Noch keine Phasen im Szenario enthalten.</p>
      </div>
    );
  }

  const activeGroups = groups.filter((g) => g.active);

  /** Strictly filter alternative methods by matching purpose (Lernfunktion), compatible granularity (rang <= current), and duration. */
  const compatibleAlternatives = (row: ScenarioPhaseRow): Baustein[] => {
    const cur = row.block;
    if (!cur) return [];
    const fns = new Set(cur.lernfunktion || []);
    const curRank = RANGE_ORDER[cur.reichweite] ?? 2;
    const maxDur = Math.max(row.durationMin * 1.5, cur.dauerMax);
    return allBlocks
      .filter((b) => {
        if (b.kennung === cur.kennung) return false;
        if (!b.lernfunktion.some((f) => fns.has(f))) return false;
        const bRank = RANGE_ORDER[b.reichweite] ?? 2;
        if (bRank > curRank) return false;
        if (b.dauerMin > maxDur) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  };

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
            Zeigt den <strong>Ablauf und die Rollen aus der FMT-Methodendatenbank</strong> (ohne KI).
            Herkunft der Hinweise: <span className="status-badge" style={{ fontSize: 11 }}>FMT</span> Methodenbeschreibung ·{' '}
            <span className="status-badge" style={{ fontSize: 11 }}>Matrix</span> Punkte-Matrix ·{' '}
            <span className="status-badge" style={{ fontSize: 11 }}>KI</span> optional in Schritt 3 konkretisiert.
          </p>
        </div>

        <button
          type="button"
          className={`btn btn-sm no-print ${editMode ? 'btn-primary' : ''}`}
          onClick={() => {
            setEditMode((s) => !s);
            setEditingRowKey(null);
          }}
        >
          {editMode ? '✓ Bearbeitung beenden' : '✏ Rollen & Parallel-Methoden anpassen'}
        </button>
      </div>

      <div className="scroll" style={{ margin: '8px 0 0' }}>
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
                    {g.focus === 'basis' || g.focus === 'sprachsensibel'
                      ? '⭐ '
                      : g.focus === 'vertiefung'
                        ? '🚀 '
                        : '👥 '}
                    {g.label}
                    {g.count ? <span className="muted" style={{ fontWeight: 500 }}> ({g.count} Pers.)</span> : null}
                  </th>
                ))
              ) : (
                <th>👥 Lernende</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isRowEditing = editMode || editingRowKey === r.key;
              const compatBlocks = isRowEditing ? compatibleAlternatives(r) : [];
              return (
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
                    {r.block?.durchfuehrung?.length ? (
                      <details style={{ marginTop: 5, fontSize: 12, color: 'var(--ink-2)' }}>
                        <summary style={{ cursor: 'pointer', fontFamily: 'var(--display)', fontWeight: 600, color: 'var(--dA)' }}>
                          Ablauf der Methode ({r.block.durchfuehrung.length} Schritte)
                        </summary>
                        <ol style={{ margin: '4px 0 0', paddingLeft: 16, lineHeight: 1.4 }}>
                          {r.block.durchfuehrung.map((st, si) => (
                            <li key={si}>{st}</li>
                          ))}
                        </ol>
                      </details>
                    ) : null}
                    <div className="no-print" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        style={{ fontSize: 11.5, padding: '2px 7px' }}
                        title="In Schritt 3: WLO-OER für diese Phase suchen oder zuordnen"
                        onClick={() => onOpenResourcesForStep('oer', r.key)}
                      >
                        🌐 {r.oerResources.length > 0 ? `${r.oerResources.length} OER` : 'OER'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        style={{ fontSize: 11.5, padding: '2px 7px' }}
                        title="In Schritt 3: Materialauftrag per KI erstellen"
                        onClick={() => onOpenResourcesForStep('material', r.key)}
                      >
                        📝 {r.generatedMaterials.length > 0 ? `${r.generatedMaterials.length} Mat.` : 'Material'}
                      </button>
                      {!editMode && (
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          style={{ fontSize: 11.5, padding: '2px 7px' }}
                          title="Diese Phase direkt anpassen oder parallele Teilgruppen-Methode wählen"
                          onClick={() => setEditingRowKey((k) => (k === r.key ? null : r.key))}
                        >
                          {editingRowKey === r.key ? '✓ Fertig' : '✏'}
                        </button>
                      )}
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
                      const mRes = matrixByGroup.get(g.id);
                      const recommendedAlts =
                        isRowEditing && !isMain && mRes && r.block
                          ? suggestAlternativeMethodsForGroup(mRes, r.block, allBlocks, 4, r.durationMin)
                          : [];
                      const recommendedSet = new Set(recommendedAlts.map((x) => x.kennung));
                      const otherCompat = compatBlocks.filter((b) => !recommendedSet.has(b.kennung));

                      return (
                        <td key={g.id} style={{ fontSize: 13 }}>
                          {altMethod && (
                            <div
                              style={{
                                padding: '4px 8px',
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
                            <div style={{ marginBottom: specific ? 6 : 0, color: 'var(--ink)' }}>{r.learnerRole}</div>
                          )}

                          {isRowEditing ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <textarea
                                aria-label={`Anpassung ${g.label} in ${r.phaseLabel}`}
                                rows={2}
                                style={{
                                  width: '100%',
                                  fontSize: 12.5,
                                  padding: '5px 7px',
                                  lineHeight: 1.4,
                                  background: 'var(--paper)'
                                }}
                                value={specific?.measure || ''}
                                placeholder={`Anpassung für ${g.label}…`}
                                onChange={(e) => onEditDiffMeasure(r.key, g.id, g.label, e.target.value)}
                              />
                              {!isMain && (
                                <select
                                  aria-label={`Alternative Methode für ${g.label} in ${r.phaseLabel}`}
                                  style={{ fontSize: 12, padding: '3px 6px', width: '100%' }}
                                  value={altMethodId}
                                  onChange={(e) => onSubgroupMethodChange(r.key, g.id, e.target.value || null)}
                                >
                                  <option value="">Methode anpassen (Standard)</option>
                                  {recommendedAlts.length > 0 && (
                                    <optgroup label="★ Passend zu Matrix, Zweck & Granularität">
                                      {recommendedAlts.map((a) => (
                                        <option key={a.kennung} value={a.kennung}>
                                          ★ {a.name} ({a.reichweite.toUpperCase()}, {a.dauerMin}–{a.dauerMax}m)
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}
                                  {otherCompat.length > 0 && (
                                    <optgroup label="✓ Gleicher Zweck & passende Granularität">
                                      {otherCompat.map((b) => (
                                        <option key={b.kennung} value={b.kennung}>
                                          🔀 {b.name} ({b.reichweite.toUpperCase()}, {b.dauerMin}–{b.dauerMax}m)
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}
                                </select>
                              )}
                            </div>
                          ) : (
                            specific && (
                              <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.45 }}>
                                {specific.measure}{' '}
                                <span
                                  className="status-badge"
                                  style={{ fontSize: 10.5, padding: '0 5px', marginLeft: 3, verticalAlign: 'middle' }}
                                >
                                  {sourceTag}
                                </span>
                              </div>
                            )
                          )}
                        </td>
                      );
                    })
                  ) : (
                    <td>{r.learnerRole}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
