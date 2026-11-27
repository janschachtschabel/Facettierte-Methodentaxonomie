import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { lesart, OHNE_GLEICHWERTIGKEITSPRUEFUNG, scoreDifferentiationMatrix, type Baustein, type Passungsregel, type Regelmeldung, type Scheme } from '@fmt/core';
import { regelZeile } from '../planner/regelmeldung.js';
import { parallelMethoden, weitereMethoden, type KandidatenRahmen, type WeitereRahmen } from '../planner/kandidaten.js';
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
  maxTechnik?: string;
  ohneInternet?: boolean;
  ohneKI?: boolean;
  /** Heading and lead; step 3 reuses the table as "updated plan". */
  heading?: string;
  lead?: ReactNode;
  editLabel?: string;
  /** Rule messages of the proposal; those about a method stand in its row with rule and basis. */
  regelmeldungen?: Regelmeldung[];
  regeln?: Passungsregel[];
  /** Column names for the activities in the terms of the planning profile ("Tätigkeit der Kursleitung"). */
  spalten?: { lehrende: string; lernende: string };
  /** Vocabulary schemes; with them each row names the learning state the method yields (vocab lernzustand). */
  schemes?: Scheme[];
  /** Goal kind of the plan (match result): learning states are shown in its reading (Lesart); without it, the labels. */
  zielart?: string;
  /**
   * Frame of the plan for other methods of a subgroup (situation, chain, rule set). With it the core checks them:
   * methods only, needs covered, knowledge type of the step, equivalent where it can check that.
   */
  kandidaten?: KandidatenRahmen;
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
  onOpenResourcesForStep,
  maxTechnik,
  ohneInternet,
  ohneKI,
  heading,
  lead,
  editLabel,
  regelmeldungen = [],
  regeln = [],
  spalten,
  schemes,
  zielart,
  kandidaten
}: Props) {
  const spalteLehrende = spalten?.lehrende || 'Tätigkeit der Lehrkraft';
  const spalteLernende = spalten?.lernende || 'Tätigkeit der Lernenden';
  const [editMode, setEditMode] = useState(false);
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null);

  const matrixByGroup = useMemo(() => {
    const m = new Map<string, ReturnType<typeof scoreDifferentiationMatrix>>();
    for (const g of groups) {
      m.set(
        g.id,
        scoreDifferentiationMatrix({
          personaId: g.personaId,
          selectedValues: g.matrixValues,
          maxTechnik: maxTechnik || undefined,
          ohneInternet,
          ohneKI,
          limit: 5
        })
      );
    }
    return m;
  }, [groups, maxTechnik, ohneInternet, ohneKI]);

  if (!rows.length) {
    return (
      <div className="card" style={{ padding: 20, marginTop: 12, textAlign: 'center' }}>
        <p className="muted">Noch keine Phasen im Szenario enthalten.</p>
      </div>
    );
  }

  const activeGroups = groups.filter((g) => g.active);

  // Without the plan's frame only the entry kind is checked (no situation, no chain); the pickers say what was checked.
  const weitereRahmen: WeitereRahmen = kandidaten || {
    constraints: { maxTechnik, ohneInternet, ohneKI },
    ketten: [],
    regelwerk: { schemes: schemes || [] }
  };
  /** Methods of the same purpose, granularity and duration whose needs and chain step the core accepts. */
  const compatibleAlternatives = (row: ScenarioPhaseRow): Baustein[] => weitereMethoden(row, allBlocks, weitereRahmen);

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
          <strong style={{ fontFamily: 'var(--display)', fontSize: 17 }}>
            {heading || 'Dein Ablauf für die ganze Klasse'}
          </strong>
          <p className="muted" style={{ fontSize: 13.5, margin: '4px 0 0', maxWidth: 760 }}>
            {lead || (
              <>
                Jede Zeile ist eine Phase mit ihrer Methode: {spalteLehrende} und {spalteLernende}. Alle Angaben stammen aus
                der Methodendatenbank, ohne KI.
              </>
            )}
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
          {editMode ? '✓ Bearbeitung beenden' : editLabel || '✏ Hinweise bearbeiten'}
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
                👩‍🏫 {spalteLehrende}
                {lehrkraefteInfo ? (
                  <span className="muted" style={{ display: 'block', fontWeight: 500, fontSize: 12 }}>
                    {lehrkraefteInfo}
                  </span>
                ) : null}
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
                <th>👥 {spalteLernende}</th>
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
                      {r.evidenceGrade && r.evidenceBezug?.length ? (
                        <span className="muted" aria-label={`Evidenzbezug ${r.methodName}`} style={{ fontSize: 11.5 }}>
                          {r.evidenceBezug.join(' · ')}
                        </span>
                      ) : null}
                    </div>
                    <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
                      <span className="chip" style={{ fontSize: 11, padding: '1px 6px' }}>
                        {RANGE_READABLE[r.methodRange] || r.methodRange}
                      </span>
                      <span className="muted" style={{ fontSize: 11.5 }}>
                        {r.socialForm}
                      </span>
                    </div>
                    {schemes && r.block?.nachbedingung?.length ? (
                      <div aria-label={`Lernstand nach ${r.methodName}`} style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 4 }}>
                        <strong>Danach:</strong> {r.block.nachbedingung.map((z) => lesart({ schemes }, z, zielart)).join(' · ')}
                      </div>
                    ) : null}
                    {(() => {
                      const eigene = regelmeldungen.filter((m) => m.baustein === r.methodId);
                      return eigene.length ? (
                        <ul aria-label={`Hinweise zu ${r.methodName}`} style={{ margin: '6px 0 0', paddingLeft: 16, fontSize: 12.5, lineHeight: 1.4 }}>
                          {eigene.map((m, i) => (
                            <li key={i} style={{ color: m.wirkung === 'warnt' ? 'var(--err)' : 'var(--ink)' }}>
                              {m.text}
                              <div className="muted" style={{ fontSize: 11.5 }}>
                                {regelZeile(m, regeln)}
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : null;
                    })()}
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
                      // Equivalent parallel methods for this subgroup, checked by the core (needs, binding, equivalence).
                      const recommendedAlts =
                        isRowEditing && !isMain && mRes && r.block && kandidaten
                          ? parallelMethoden(mRes, r, g, allBlocks, kandidaten, 4).alternativen
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
                              🔀 <strong>Eigene Methode für diese Gruppe:</strong>{' '}
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
                                    <optgroup label="★ Gleichwertig für diese Gruppe (geprüft)">
                                      {recommendedAlts.map((a) => (
                                        <option key={a.kennung} value={a.kennung}>
                                          ★ {a.name} ({a.reichweite.toUpperCase()}, {a.dauerMin}–{a.dauerMax}m)
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}
                                  {otherCompat.length > 0 && (
                                    <optgroup label={`✓ Gleicher Zweck${kandidaten ? ', Bedarf gedeckt' : ''} (${OHNE_GLEICHWERTIGKEITSPRUEFUNG})`}>
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
