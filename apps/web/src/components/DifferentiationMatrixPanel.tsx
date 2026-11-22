import { useMemo, useState } from 'react';
import {
  DIFF_MATRIX_PERSONAS,
  DIFF_MATRIX_VARIABLES,
  scoreDifferentiationMatrix,
  suggestAlternativeMethodsForGroup,
  type Baustein
} from '@fmt/core';
import type {
  LearnerGroup,
  ScenarioPhaseRow,
  StepDiffSuggestion,
  SubgroupMethodMap
} from '../planner/scenarioModel.js';

interface Props {
  groups: LearnerGroup[];
  onGroupsChange: (next: LearnerGroup[]) => void;
  scenarioRows: ScenarioPhaseRow[];
  allBlocks: Baustein[];
  subgroupMethods: SubgroupMethodMap;
  onSubgroupMethodChange: (stepKey: string, groupId: string, methodId: string | null) => void;
  aiDiffByStep: Record<string, StepDiffSuggestion[]>;
  onAiDiffChange: (next: Record<string, StepDiffSuggestion[]>) => void;
  onEditDiffMeasure: (stepKey: string, groupId: string, groupLabel: string, measure: string) => void;
  onRunAiDifferentiate: () => void;
  busyDiff: boolean;
  diffError: string | null;
  llmAvailable: boolean;
}

const KEY_VARIABLE_IDS = new Set([
  'vorwissen',
  'leistungsniveau',
  'metakognitive',
  'strukturierung',
  'methoden',
  'engagement',
  'sprachkompetenz',
  'soziale-kompetenzen',
  'zeitliche-verfuegbarkeit',
  'foerderbedarf-lernen',
  'foerderbedarf-sprache',
  'foerderbedarf-emotional-sozial'
]);

export function DifferentiationMatrixPanel({
  groups,
  onGroupsChange,
  scenarioRows,
  allBlocks,
  subgroupMethods,
  onSubgroupMethodChange,
  aiDiffByStep,
  onAiDiffChange,
  onEditDiffMeasure,
  onRunAiDifferentiate,
  busyDiff,
  diffError,
  llmAvailable
}: Props) {
  const [selectedGroupId, setSelectedGroupId] = useState<string>(groups[0]?.id || 'basis');
  const [showAllVariables, setShowAllVariables] = useState(false);
  const [newGroupLabel, setNewGroupLabel] = useState('');
  const [newGroupCount, setNewGroupCount] = useState('4');
  const [newGroupPersona, setNewGroupPersona] = useState('foerderLernen');

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) || groups[0];

  const matrixByGroup = useMemo(() => {
    const map = new Map<string, ReturnType<typeof scoreDifferentiationMatrix>>();
    for (const g of groups) {
      map.set(
        g.id,
        scoreDifferentiationMatrix({
          personaId: g.personaId,
          selectedValues: g.matrixValues,
          limit: 10
        })
      );
    }
    return map;
  }, [groups]);

  const activeMatrix = selectedGroup ? matrixByGroup.get(selectedGroup.id) : null;
  const sortedBlocks = useMemo(() => [...allBlocks].sort((a, b) => a.name.localeCompare(b.name, 'de')), [allBlocks]);

  const updateGroup = (id: string, patch: Partial<LearnerGroup>) => {
    onGroupsChange(groups.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  };

  const applyPersonaToGroup = (id: string, personaId: string) => {
    const p = DIFF_MATRIX_PERSONAS.find((x) => x.id === personaId);
    updateGroup(id, {
      personaId: personaId || undefined,
      matrixValues: {},
      ...(p ? { profile: p.description } : {})
    });
  };

  const setGroupVariable = (id: string, varId: string, auspraegungId: string) => {
    const g = groups.find((x) => x.id === id);
    if (!g) return;
    const nextVals = { ...(g.matrixValues || {}) };
    if (!auspraegungId) delete nextVals[varId];
    else nextVals[varId] = auspraegungId;
    updateGroup(id, { matrixValues: nextVals });
  };

  const applyMatrixToAllPhases = () => {
    // Clearing manual/KI overrides falls back cleanly to live matrix-scored recommendations per group
    onAiDiffChange({});
  };

  const totalLearners = groups.filter((g) => g.active).reduce((s, g) => s + (g.count || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <strong style={{ fontFamily: 'var(--display)', fontSize: 16.5 }}>
            ⚖ Binnendifferenzierungsmatrix (Punktesystem −2 bis +2) &amp; Teilgruppen-Methoden
          </strong>
          <span className="status-badge">
            {groups.filter((g) => g.active).length} aktive Teilgruppen · {totalLearners > 0 ? `${totalLearners} Lernende gesamt` : 'Personenzahl optional'}
          </span>
        </div>
        <p className="muted" style={{ fontSize: 13.5, margin: '4px 0 0' }}>
          Wähle pro Teilgruppe eine Persona oder einzelne Anpassungsvariablen aus der{' '}
          <strong>Binnendifferenzierungsmatrix</strong> (115 Ausprägungen × 172 Maßnahmen). Im Einzelfall kannst du pro Phase
          entweder <strong>die Methode anpassen</strong> oder <strong>eine alternative FMT-Methode für die Teilgruppe</strong>{' '}
          (parallele Schwimmlinie) wählen.
        </p>
      </div>

      {/* Group Cards with Headcount & Persona Selector */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
        {groups.map((g) => {
          const isSelected = selectedGroup?.id === g.id;
          const mRes = matrixByGroup.get(g.id);
          return (
            <div
              key={g.id}
              onClick={() => setSelectedGroupId(g.id)}
              style={{
                padding: 12,
                borderRadius: 8,
                cursor: 'pointer',
                background: isSelected ? 'var(--dA-soft)' : g.active ? 'var(--paper)' : 'transparent',
                border: `1.5px solid ${isSelected ? 'var(--dA)' : g.active ? 'var(--rule)' : 'var(--grid)'}`
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <label
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: 'var(--display)', fontWeight: 700 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={g.active}
                    onChange={(e) => updateGroup(g.id, { active: e.target.checked })}
                  />
                  {g.label}
                </label>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="number"
                    min={0}
                    max={200}
                    aria-label={`Personenzahl ${g.label}`}
                    style={{ width: 58, padding: '2px 5px', fontSize: 12.5 }}
                    value={g.count ?? ''}
                    placeholder="Anz."
                    onChange={(e) => updateGroup(g.id, { count: e.target.value ? Math.max(0, Number(e.target.value)) : undefined })}
                  />
                  <span className="muted" style={{ fontSize: 12 }}>Pers.</span>
                  {g.focus === 'custom' && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => onGroupsChange(groups.filter((x) => x.id !== g.id))}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              <div style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                <select
                  aria-label={`Matrix-Persona für ${g.label}`}
                  style={{ width: '100%', fontSize: 12.5, padding: '4px 6px' }}
                  value={g.personaId || ''}
                  onChange={(e) => applyPersonaToGroup(g.id, e.target.value)}
                >
                  <option value="">– Ohne Persona (nur eigene Variablen) –</option>
                  {DIFF_MATRIX_PERSONAS.map((p) => (
                    <option key={p.id} value={p.id}>
                      Persona: {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {mRes && mRes.topRecommendations.length > 0 && (
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  <strong>Top-Score:</strong> {mRes.topRecommendations[0].name} (<strong>+{mRes.topRecommendations[0].score}</strong>)
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Custom Subgroup */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          style={{ flex: '1 1 200px' }}
          placeholder="Neue Teilgruppe (z. B. DaZ, Förderbedarf Lernen, Schnelllerner)"
          value={newGroupLabel}
          onChange={(e) => setNewGroupLabel(e.target.value)}
        />
        <input
          type="number"
          min={1}
          max={100}
          style={{ width: 84 }}
          value={newGroupCount}
          onChange={(e) => setNewGroupCount(e.target.value)}
          placeholder="Pers."
        />
        <select value={newGroupPersona} onChange={(e) => setNewGroupPersona(e.target.value)} style={{ flex: '1 1 210px' }}>
          {DIFF_MATRIX_PERSONAS.map((p) => (
            <option key={p.id} value={p.id}>
              Basis-Persona: {p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            if (!newGroupLabel.trim()) return;
            const p = DIFF_MATRIX_PERSONAS.find((x) => x.id === newGroupPersona);
            const id = `custom-${Date.now()}`;
            onGroupsChange([
              ...groups,
              {
                id,
                label: newGroupLabel.trim(),
                profile: p?.description || 'Individuelle Teilgruppe',
                focus: 'custom',
                active: true,
                count: Number(newGroupCount) || undefined,
                personaId: newGroupPersona
              }
            ]);
            setSelectedGroupId(id);
            setNewGroupLabel('');
          }}
        >
          + Teilgruppe hinzufügen
        </button>
      </div>

      {/* Interactive Matrix Scoring Inspector for Selected Subgroup */}
      {selectedGroup && activeMatrix && (
        <div
          style={{
            padding: 16,
            borderRadius: 8,
            background: 'var(--paper)',
            border: '1px solid var(--dA)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <div>
              <strong style={{ fontFamily: 'var(--display)', fontSize: 15.5 }}>
                📊 Matrix-Auswertung für „{selectedGroup.label}“ ({activeMatrix.selectedCount} aktive Variablen)
              </strong>
              <div className="muted" style={{ fontSize: 13 }}>
                {activeMatrix.didacticProfile.summary}
              </div>
            </div>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowAllVariables((s) => !s)}>
              {showAllVariables ? '▲ Nur Kernvariablen anzeigen' : '▼ Alle 36 Anpassungsvariablen feinjustieren'}
            </button>
          </div>

          {/* Scored Recommendations + Avoid Warnings */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: 14 }}>
            <div>
              <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 13.5, marginBottom: 6, color: 'var(--dC)' }}>
                ✓ Höchstbewertete Differenzierungsmaßnahmen (Punkte-Matrix)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {activeMatrix.topRecommendations.map((rec) => (
                  <span
                    key={rec.id}
                    className="chip chip-c"
                    style={{ fontSize: 12.5, padding: '4px 9px' }}
                    title={`${rec.oberKategorieName} → ${rec.kategorieName}`}
                  >
                    <strong>+{rec.score}</strong> · {rec.name}
                  </span>
                ))}
              </div>
            </div>

            {activeMatrix.avoidMeasures.length > 0 && (
              <div>
                <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 13.5, marginBottom: 6, color: 'var(--err)' }}>
                  ⚠ Eher ungeeignet laut Matrix (vermeiden)
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {activeMatrix.avoidMeasures.slice(0, 4).map((rec) => (
                    <span
                      key={rec.id}
                      className="chip"
                      style={{ fontSize: 12, padding: '3px 8px', borderColor: 'var(--err)', color: 'var(--err)' }}
                    >
                      <strong>{rec.score}</strong> · {rec.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Fine-tune Anpassungsvariablen */}
          <details open={showAllVariables} style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--grid)' }}>
            <summary style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', color: 'var(--dA)' }}>
              🎚 Anpassungsvariablen für „{selectedGroup.label}“ gezielt feinjustieren
            </summary>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8, marginTop: 10 }}>
              {DIFF_MATRIX_VARIABLES.flatMap((ok) =>
                ok.kategorien
                  .filter((k) => showAllVariables || KEY_VARIABLE_IDS.has(k.id))
                  .map((kat) => {
                    const personaVal = selectedGroup.personaId
                      ? DIFF_MATRIX_PERSONAS.find((p) => p.id === selectedGroup.personaId)?.values[kat.id] || ''
                      : '';
                    const curVal = selectedGroup.matrixValues?.[kat.id] ?? personaVal;
                    return (
                      <label
                        key={kat.id}
                        style={{ fontFamily: 'var(--display)', fontSize: 12.5, fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 3 }}
                      >
                        {kat.name}
                        <select
                          style={{ fontSize: 12.5, padding: '4px 6px' }}
                          value={curVal}
                          onChange={(e) => setGroupVariable(selectedGroup.id, kat.id, e.target.value)}
                        >
                          <option value="">– nicht gesetzt –</option>
                          {kat.auspraegungen.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  })
              )}
            </div>
          </details>
        </div>
      )}

      {/* Action Bar: Matrix vs KI */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busyDiff || !llmAvailable}
          onClick={onRunAiDifferentiate}
        >
          ✨ {busyDiff ? 'Konkretisiere Differenzierung…' : 'Matrix-Empfehlungen mit KI auf das Thema konkretisieren'}
        </button>
        {Object.keys(aiDiffByStep).length > 0 && (
          <button type="button" className="btn btn-sm" onClick={applyMatrixToAllPhases}>
            ↺ Auf reine Matrix-Punktempfehlungen zurücksetzen
          </button>
        )}
      </div>

      {diffError && (
        <div className="msgs">
          <li className="err">{diffError}</li>
        </div>
      )}

      {/* Phase-by-phase customization: Adapt Method OR Choose Alternative FMT Method per Subgroup */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 12 }}>
        {scenarioRows.map((r) => (
          <div key={r.key} style={{ padding: 14, borderRadius: 8, background: 'var(--paper)', border: '1px solid var(--grid)' }}>
            <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14.5, marginBottom: 8 }}>
              {r.orderLabel} · {r.methodName} ({r.durationMin} min)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {groups
                .filter((g) => g.active)
                .map((g) => {
                  const diff = r.differentiation.find((d) => d.groupId === g.id);
                  const altId = subgroupMethods[r.key]?.[g.id] || '';
                  const mRes = matrixByGroup.get(g.id);
                  const suggestedAlts =
                    mRes && r.block && g.focus !== 'regel'
                      ? suggestAlternativeMethodsForGroup(mRes, r.block, allBlocks, 4)
                      : [];
                  return (
                    <div
                      key={g.id}
                      style={{
                        padding: 9,
                        borderRadius: 6,
                        background: 'var(--surface)',
                        border: '1px solid var(--grid)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <strong style={{ fontFamily: 'var(--display)', fontSize: 13 }}>
                          {g.label}
                          {g.count ? ` (${g.count} Pers.)` : ''}
                        </strong>
                        <span className="muted" style={{ fontSize: 11 }}>
                          [{diff?.source || 'matrix'}]
                        </span>
                      </div>
                      <textarea
                        rows={2}
                        style={{ width: '100%', fontSize: 12.5, padding: '4px 6px' }}
                        value={diff?.measure || ''}
                        onChange={(e) => onEditDiffMeasure(r.key, g.id, g.label, e.target.value)}
                      />
                      {g.focus !== 'regel' && (
                        <div style={{ marginTop: 6 }}>
                          <label style={{ fontFamily: 'var(--display)', fontSize: 12, fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 3 }}>
                            Optional: Alternative FMT-Methode für diese Teilgruppe (parallele Schwimmlinie)
                            <select
                              style={{ fontSize: 12.5, padding: '3px 6px' }}
                              value={altId}
                              onChange={(e) => onSubgroupMethodChange(r.key, g.id, e.target.value || null)}
                            >
                              <option value="">Gleiche Methode wie Hauptgruppe (nur anpassen)</option>
                              {suggestedAlts.length > 0 && (
                                <optgroup label="★ Passend laut Binnendifferenzierungsmatrix">
                                  {suggestedAlts.map((a) => (
                                    <option key={a.kennung} value={a.kennung}>
                                      ★ {a.name} ({a.dauerMin}–{a.dauerMax} min · {a.grund})
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              <optgroup label="Alle FMT-Methoden">
                                {sortedBlocks.map((b) => (
                                  <option key={b.kennung} value={b.kennung}>
                                    {b.name} ({b.reichweite.toUpperCase()})
                                  </option>
                                ))}
                              </optgroup>
                            </select>
                          </label>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
