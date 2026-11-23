import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  computeMultiGroupSynthesis,
  detectLearnerGroupsFromText,
  DIFF_MATRIX_PERSONAS,
  DIFF_MATRIX_VARIABLES,
  scoreDifferentiationMatrix,
  suggestAlternativeMethodsForGroup,
  type Baustein,
  type MeasureEffort,
  type MeasureLevel
} from '@fmt/core';
import {
  DEFAULT_LEARNER_GROUPS,
  QUICK_DIFF_GROUP_TEMPLATES,
  STANDARD_LEARNER_GROUPS,
  type LearnerGroup,
  type QuickDiffGroupTemplate,
  type ScenarioPhaseRow,
  type StepDiffSuggestion,
  type SubgroupMethodMap
} from '../planner/scenarioModel.js';

interface Props {
  groups: LearnerGroup[];
  onGroupsChange: (next: LearnerGroup[]) => void;
  scenarioRows: ScenarioPhaseRow[];
  focusedStepKey?: string | null;
  onSelectStepKey?: (stepKey: string) => void;
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
  maxTechnik?: string;
  ohneInternet?: boolean;
  ohneKI?: boolean;
  totalClassSize?: number;
}

type PanelTab = 'udl' | 'konflikte' | 'gruppen' | 'phasen';

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

function formatLevelLabel(level: MeasureLevel): string {
  switch (level) {
    case 'unterricht-sofort':
      return 'Sofort im Unterricht';
    case 'material-planung':
      return 'In der Materialplanung';
    case 'organisation-system':
      return 'Schulorganisation';
  }
}

function formatEffortLabel(effort: MeasureEffort): string {
  switch (effort) {
    case 'sofort':
      return '0 Min. Vorbereitung';
    case 'kurz':
      return '~5–10 Min.';
    case 'mittel':
      return '>15 Min.';
  }
}

export function DifferentiationMatrixPanel({
  groups,
  onGroupsChange,
  scenarioRows,
  focusedStepKey,
  onSelectStepKey,
  allBlocks,
  subgroupMethods,
  onSubgroupMethodChange,
  aiDiffByStep,
  onAiDiffChange,
  onEditDiffMeasure,
  onRunAiDifferentiate,
  busyDiff,
  diffError,
  llmAvailable,
  maxTechnik,
  ohneInternet,
  ohneKI,
  totalClassSize
}: Props) {
  const [selectedGroupId, setSelectedGroupId] = useState<string>(groups[0]?.id || 'regel');
  const [activeTab, setActiveTab] = useState<PanelTab>('udl');
  const [showAllVariables, setShowAllVariables] = useState(false);
  const [includeSystemMeasures, setIncludeSystemMeasures] = useState(false);
  const [quickText, setQuickText] = useState('');
  const [newGroupLabel, setNewGroupLabel] = useState('');
  const [newGroupCount, setNewGroupCount] = useState('4');
  const [newGroupPersona, setNewGroupPersona] = useState('foerderLernen');

  const activeGroups = useMemo(() => groups.filter((g) => g.active), [groups]);
  const isStandardOnly = activeGroups.length <= 1 && (activeGroups.length === 0 || activeGroups[0].focus === 'regel');

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) || activeGroups[0] || groups[0];

  const matrixByGroup = useMemo(() => {
    const map = new Map<string, ReturnType<typeof scoreDifferentiationMatrix>>();
    for (const g of groups) {
      map.set(
        g.id,
        scoreDifferentiationMatrix({
          personaId: g.personaId,
          selectedValues: g.matrixValues,
          maxTechnik: maxTechnik || undefined,
          ohneInternet,
          ohneKI,
          includeSystemMeasures,
          limit: 10
        })
      );
    }
    return map;
  }, [groups, maxTechnik, ohneInternet, ohneKI, includeSystemMeasures]);

  const multiSynthesis = useMemo(() => {
    if (activeGroups.length < 2) return null;
    return computeMultiGroupSynthesis(
      activeGroups.map((g) => ({
        id: g.id,
        label: g.label,
        count: g.count,
        personaId: g.personaId,
        selectedValues: g.matrixValues
      })),
      {
        maxTechnik: maxTechnik || undefined,
        ohneInternet,
        ohneKI,
        includeSystemMeasures
      }
    );
  }, [activeGroups, maxTechnik, ohneInternet, ohneKI, includeSystemMeasures]);

  const activeMatrix = selectedGroup ? matrixByGroup.get(selectedGroup.id) : null;
  const sortedBlocks = useMemo(() => [...allBlocks].sort((a, b) => a.name.localeCompare(b.name, 'de')), [allBlocks]);

  const updateGroup = (id: string, patch: Partial<LearnerGroup>) => {
    onGroupsChange(groups.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  };

  const toggleQuickTemplate = (tpl: QuickDiffGroupTemplate) => {
    const exists = groups.find((g) => g.id === tpl.id);
    if (exists) {
      const remaining = groups.filter((g) => g.id !== tpl.id);
      if (remaining.length === 0) {
        onGroupsChange(
          STANDARD_LEARNER_GROUPS.map((g) => ({ ...g, count: totalClassSize || g.count }))
        );
      } else {
        onGroupsChange(remaining);
      }
      return;
    }

    const baseList = groups.length > 0
      ? groups.map((g) => (g.id === 'regel' ? { ...g, label: 'Regelniveau (Hauptgruppe)', active: true } : g))
      : [{ ...STANDARD_LEARNER_GROUPS[0], label: 'Regelniveau (Hauptgruppe)', count: totalClassSize || 26 }];

    const nextGroup: LearnerGroup = {
      id: tpl.id,
      label: tpl.label,
      profile: tpl.profile,
      focus: tpl.focus,
      active: true,
      count: tpl.defaultCount,
      personaId: tpl.personaId,
      matrixValues: { ...tpl.matrixValues }
    };
    onGroupsChange([...baseList, nextGroup]);
    setSelectedGroupId(nextGroup.id);
  };

  const applyClassicThreeGroups = () => {
    onGroupsChange(DEFAULT_LEARNER_GROUPS.map((g) => ({ ...g })));
    setSelectedGroupId('basis');
  };

  const resetToStandardGroup = () => {
    onGroupsChange(
      STANDARD_LEARNER_GROUPS.map((g) => ({ ...g, count: totalClassSize || g.count }))
    );
    setSelectedGroupId('regel');
    onAiDiffChange({});
  };

  const applyQuickTextGroups = () => {
    const trimmed = quickText.trim();
    if (!trimmed) return;
    const det = detectLearnerGroupsFromText(trimmed);
    if (!det.groups.length) return;
    const mapped: LearnerGroup[] = det.groups.map((g) => ({
      id: g.id,
      label: g.label,
      profile: g.label,
      focus: g.id === 'vertiefung' ? 'vertiefung' : g.id === 'regel' ? 'regel' : g.id === 'daz' ? 'sprachsensibel' : 'basis',
      active: true,
      count: g.count,
      personaId: g.personaId,
      matrixValues: g.selectedValues || {}
    }));
    const hasRegel = mapped.some((g) => g.focus === 'regel');
    const next = hasRegel
      ? mapped
      : [{ ...STANDARD_LEARNER_GROUPS[0], label: 'Regelniveau (Hauptgruppe)', count: undefined }, ...mapped];
    onGroupsChange(next);
    setSelectedGroupId(mapped[0].id);
    setQuickText('');
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
    onAiDiffChange({});
  };

  const totalLearners = activeGroups.reduce((s, g) => s + (g.count || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <strong style={{ fontFamily: 'var(--display)', fontSize: 19 }}>
            Binnendifferenzierung für dein Methodenkonzept
          </strong>
          <p className="muted" style={{ fontSize: 14, margin: '4px 0 0', maxWidth: 740 }}>
            {isStandardOnly
              ? 'Dein Konzept aus Schritt 2 gilt aktuell für die Standardgruppe (Regelniveau). Füge hier bei Bedarf Teilgruppen hinzu – oder gehe direkt weiter zu OER & Material.'
              : `${activeGroups.length} aktive Teilgruppen${totalLearners > 0 ? ` (${totalLearners} Lernende)` : ''} – alle Anpassungen fließen automatisch in Material (Schritt 4) und Entwurf (Schritt 5) ein.`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={includeSystemMeasures}
              onChange={(e) => setIncludeSystemMeasures(e.target.checked)}
            />
            Schul-/Systemmaßnahmen
          </label>
          <Link
            to="/differenzierung?source=planner"
            className="btn btn-sm"
            title="Aktuelles Baukasten-Szenario in der Vollansicht öffnen & als Checkliste exportieren"
          >
            Vollansicht &amp; Checkliste ↗
          </Link>
        </div>
      </div>

      {/* Quick Subgroup Builder: Always accessible, super calm */}
      <div
        style={{
          padding: 16,
          borderRadius: 'var(--radius)',
          background: 'var(--paper)',
          border: '1px solid var(--rule)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <strong style={{ fontFamily: 'var(--display)', fontSize: 14.5 }}>
            {isStandardOnly ? 'Teilgruppen per Klick hinzufügen (optional):' : 'Aktive Teilgruppen anpassen oder ergänzen:'}
          </strong>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-sm" onClick={applyClassicThreeGroups}>
              Standard-3er-Differenzierung (Basis · Regel · Vertiefung)
            </button>
            {!isStandardOnly && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={resetToStandardGroup}>
                ↺ Zurück auf Standardgruppe
              </button>
            )}
          </div>
        </div>

        {/* 8 Clickable Subgroup Chips */}
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }} role="group" aria-label="Teilgruppen per Klick hinzufügen">
          {QUICK_DIFF_GROUP_TEMPLATES.map((tpl) => {
            const active = groups.some((g) => g.id === tpl.id && g.active);
            return (
              <button
                key={tpl.id}
                type="button"
                aria-pressed={active}
                className={`diff-chip-toggle ${active ? 'is-active' : ''}`}
                onClick={() => toggleQuickTemplate(tpl)}
              >
                <span>{active ? '✓' : '+'}</span>
                {tpl.chipLabel}
              </button>
            );
          })}
        </div>

        {/* Optional Free-Text Subgroup Recognition */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            style={{ flex: '1 1 280px', fontSize: 14 }}
            value={quickText}
            onChange={(e) => setQuickText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyQuickTextGroups();
              }
            }}
            placeholder="Oder Lerngruppe kurz beschreiben (z. B. „5 DaZ-Kinder, 2 ADHS, 4 Leistungsstarke“) …"
          />
          <button type="button" className="btn btn-sm" disabled={!quickText.trim()} onClick={applyQuickTextGroups}>
            Aus Text erkennen
          </button>
        </div>
      </div>

      {/* When differentiated (2+ groups OR non-standard group), show unified 4-tab differentiation workspace */}
      {!isStandardOnly && (
        <div>
          <div className="diff-tabs" role="tablist" aria-label="Bereiche der Binnendifferenzierung">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'udl'}
              className={`diff-tab ${activeTab === 'udl' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('udl')}
            >
              1. Basis für alle ({multiSynthesis?.udlBasis.length ?? 0})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'konflikte'}
              className={`diff-tab ${activeTab === 'konflikte' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('konflikte')}
            >
              2. Zielkonflikte ({multiSynthesis?.konflikte.length ?? 0})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'gruppen'}
              className={`diff-tab ${activeTab === 'gruppen' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('gruppen')}
            >
              3. Teilgruppen &amp; Feinjustierung ({activeGroups.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'phasen'}
              className={`diff-tab ${activeTab === 'phasen' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('phasen')}
            >
              4. Phasen &amp; Alternativ-Methoden ({scenarioRows.length})
            </button>
          </div>

          {/* TAB 1: UDL BASIS */}
          {activeTab === 'udl' && (
            <div>
              <p className="diff-section-lead">
                Diese Maßnahmen wirken für <strong>alle {activeGroups.length} aktiven Teilgruppen gleichzeitig positiv</strong> – einmal
                einplanen, für die gesamte Klasse wirksam.
              </p>
              {!multiSynthesis || multiSynthesis.udlBasis.length === 0 ? (
                <p className="muted" style={{ marginTop: 12 }}>
                  Keine gemeinsame Überschneidung unter den aktuellen Filtern – prüfe „3. Teilgruppen &amp; Feinjustierung“.
                </p>
              ) : (
                <div className="diff-grid-2">
                  {multiSynthesis.udlBasis.map((u) => (
                    <article key={u.id} className="diff-item-card">
                      <div className="diff-item-head">
                        <strong style={{ fontSize: 15 }}>{u.name}</strong>
                        <span className="diff-pill diff-pill-pos">Passung ≥ +{u.minNormalizedScore} %</span>
                      </div>
                      <div className="muted" style={{ fontSize: 12.5 }}>
                        {formatLevelLabel(u.meta.ebene)} · {formatEffortLabel(u.meta.aufwand)} · {u.oberKategorieName}
                      </div>
                      <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>{u.meta.umsetzungsimpuls}</p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ZIELKONFLIKTE */}
          {activeTab === 'konflikte' && (
            <div>
              <p className="diff-section-lead">
                Wo sich die Bedürfnisse zweier Teilgruppen widersprechen – inklusive praktischer Auflösungsstrategie für dieselbe Stunde.
              </p>
              {!multiSynthesis || multiSynthesis.konflikte.length === 0 ? (
                <p className="muted" style={{ marginTop: 12 }}>
                  Für deine aktuellen Teilgruppen wurden keine starken Zielkonflikte erkannt.
                </p>
              ) : (
                <div className="diff-grid-2">
                  {multiSynthesis.konflikte.map((k) => (
                    <article key={k.measureId} className="diff-item-card">
                      <div className="diff-item-head">
                        <div>
                          <strong style={{ fontSize: 15 }}>{k.measureName}</strong>
                          <div className="muted" style={{ fontSize: 12.5 }}>{k.kategorieName}</div>
                        </div>
                        <span className="diff-pill diff-pill-warn">Zielkonflikt</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <span className="diff-pill diff-pill-pos">
                          ✓ Hilft: {k.staerkendFuer.map((x) => `${x.label} (+${x.normalizedScore} %)`).join(', ')}
                        </span>
                        <span className="diff-pill diff-pill-neg">
                          ⚠ Hemmt: {k.hemmendFuer.map((x) => `${x.label} (${x.normalizedScore} %)`).join(', ')}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>
                        <strong>Auflösung:</strong> {k.aufloesungsstrategie}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: TEILGRUPPEN & FEINJUSTIERUNG */}
          {activeTab === 'gruppen' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="diff-grid-2">
                {groups.map((g) => {
                  const isSelected = selectedGroup?.id === g.id;
                  const mRes = matrixByGroup.get(g.id);
                  return (
                    <div
                      key={g.id}
                      onClick={() => setSelectedGroupId(g.id)}
                      className="diff-item-card"
                      style={{
                        cursor: 'pointer',
                        background: isSelected ? 'var(--dA-soft)' : 'var(--paper)',
                        borderColor: isSelected ? 'var(--dA)' : 'var(--rule)'
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
                            onChange={(e) =>
                              updateGroup(g.id, { count: e.target.value ? Math.max(0, Number(e.target.value)) : undefined })
                            }
                          />
                          <span className="muted" style={{ fontSize: 12 }}>Pers.</span>
                          {groups.length > 1 && g.id !== 'regel' && (
                            <button
                              type="button"
                              className="btn btn-sm"
                              title="Teilgruppe entfernen"
                              onClick={() => onGroupsChange(groups.filter((x) => x.id !== g.id))}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>

                      <div onClick={(e) => e.stopPropagation()}>
                        <select
                          aria-label={`Matrix-Persona für ${g.label}`}
                          style={{ width: '100%', fontSize: 13, padding: '4px 6px' }}
                          value={g.personaId || ''}
                          onChange={(e) => applyPersonaToGroup(g.id, e.target.value)}
                        >
                          <option value="">– Eigene Merkmale / ohne Vorlage –</option>
                          {DIFF_MATRIX_PERSONAS.map((p) => (
                            <option key={p.id} value={p.id}>
                              Vorlage: {p.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {mRes && mRes.topRecommendations.length > 0 && (
                        <div className="muted" style={{ fontSize: 12.5 }}>
                          <strong>Top-Empfehlung:</strong> {mRes.topRecommendations[0].name} (+{mRes.topRecommendations[0].normalizedScore} %)
                          <div style={{ marginTop: 2 }}>{mRes.topRecommendations[0].meta.umsetzungsimpuls}</div>
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
                  style={{ flex: '1 1 200px', fontSize: 13.5 }}
                  placeholder="Eigene Teilgruppe anlegen (z. B. Sprachanfänger, Projekt-Tutoren)"
                  value={newGroupLabel}
                  onChange={(e) => setNewGroupLabel(e.target.value)}
                />
                <input
                  type="number"
                  min={1}
                  max={100}
                  style={{ width: 78, fontSize: 13.5 }}
                  value={newGroupCount}
                  onChange={(e) => setNewGroupCount(e.target.value)}
                  placeholder="Pers."
                />
                <select value={newGroupPersona} onChange={(e) => setNewGroupPersona(e.target.value)} style={{ flex: '1 1 210px', fontSize: 13.5 }}>
                  {DIFF_MATRIX_PERSONAS.map((p) => (
                    <option key={p.id} value={p.id}>
                      Vorlage: {p.name}
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
                  + Teilgruppe anlegen
                </button>
              </div>

              {/* Matrix Inspector for Selected Subgroup */}
              {selectedGroup && activeMatrix && (
                <div className="diff-item-card" style={{ borderColor: 'var(--dA)' }}>
                  <div className="diff-item-head">
                    <div>
                      <strong style={{ fontSize: 15 }}>
                        Matrix-Details für „{selectedGroup.label}“ ({activeMatrix.selectedCount} Merkmale aktiv)
                      </strong>
                      <div className="muted" style={{ fontSize: 13 }}>{activeMatrix.didacticProfile.summary}</div>
                    </div>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowAllVariables((s) => !s)}>
                      {showAllVariables ? '▲ Weniger Variablen' : '▼ Alle 36 Variablen'}
                    </button>
                  </div>

                  <div className="diff-grid-2" style={{ marginTop: 4 }}>
                    <div>
                      <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 13, marginBottom: 6, color: 'var(--dC)' }}>
                        ✓ Empfohlene Maßnahmen
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {activeMatrix.topRecommendations.slice(0, 6).map((rec) => (
                          <span
                            key={rec.id}
                            className="diff-pill diff-pill-pos"
                            title={rec.meta.umsetzungsimpuls}
                          >
                            +{rec.normalizedScore} % · {rec.name}
                          </span>
                        ))}
                      </div>
                    </div>

                    {activeMatrix.avoidMeasures.length > 0 && (
                      <div>
                        <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 13, marginBottom: 6, color: 'var(--err)' }}>
                          ⚠ Eher vermeiden
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {activeMatrix.avoidMeasures.slice(0, 4).map((rec) => (
                            <span key={rec.id} className="diff-pill diff-pill-neg">
                              {rec.normalizedScore} % · {rec.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <details open={showAllVariables} style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--rule)' }}>
                    <summary style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', color: 'var(--dA)' }}>
                      Anpassungsvariablen für „{selectedGroup.label}“ feinjustieren
                    </summary>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, marginTop: 10 }}>
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
            </div>
          )}

          {/* TAB 4: PHASEN & ALTERNATIV-METHODEN */}
          {activeTab === 'phasen' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <p className="diff-section-lead" style={{ margin: 0 }}>
                  Passe einzelne Phasen deines Konzepts pro Teilgruppe an oder weise einer Teilgruppe eine alternative FMT-Methode zu.
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={busyDiff || !llmAvailable}
                    onClick={onRunAiDifferentiate}
                  >
                    ✨ {busyDiff ? 'Konkretisiere…' : 'Mit KI auf Thema konkretisieren'}
                  </button>
                  {Object.keys(aiDiffByStep).length > 0 && (
                    <button type="button" className="btn btn-sm" onClick={applyMatrixToAllPhases}>
                      ↺ Auf Matrix zurücksetzen
                    </button>
                  )}
                </div>
              </div>

              {diffError && (
                <div className="msgs">
                  <li className="err">{diffError}</li>
                </div>
              )}

              <div className="diff-grid-2">
                {scenarioRows.map((r) => {
                  const isFocused = Boolean(focusedStepKey && focusedStepKey === r.key);
                  return (
                    <div
                      key={r.key}
                      onClick={() => onSelectStepKey?.(r.key)}
                      className="diff-item-card"
                      style={{
                        borderColor: isFocused ? 'var(--dA)' : 'var(--rule)',
                        background: isFocused ? 'color-mix(in srgb, var(--dA-soft) 45%, var(--paper))' : 'var(--paper)'
                      }}
                    >
                      <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 15 }}>
                        {r.orderLabel} · {r.methodName} ({r.durationMin} Min.)
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {activeGroups.map((g) => {
                          const diff = r.differentiation.find((d) => d.groupId === g.id);
                          const altId = subgroupMethods[r.key]?.[g.id] || '';
                          const mRes = matrixByGroup.get(g.id);
                          const suggestedAlts =
                            mRes && r.block && g.focus !== 'regel'
                              ? suggestAlternativeMethodsForGroup(mRes, r.block, allBlocks, 5, r.durationMin)
                              : [];
                          const sugIds = new Set(suggestedAlts.map((x) => x.kennung));
                          const rangeOrd: Record<string, number> = { r1: 1, r2: 2, r3: 3, r4: 4, r5: 5 };
                          const curRank = r.block ? rangeOrd[r.block.reichweite] ?? 2 : 2;
                          const fns = new Set(r.block?.lernfunktion || []);
                          const maxDur = Math.max(r.durationMin * 1.5, r.block?.dauerMax ?? 45);
                          const compatRest = sortedBlocks.filter(
                            (b) =>
                              b.kennung !== r.methodId &&
                              !sugIds.has(b.kennung) &&
                              b.lernfunktion.some((f) => fns.has(f)) &&
                              (rangeOrd[b.reichweite] ?? 2) <= curRank &&
                              b.dauerMin <= maxDur
                          );
                          return (
                            <div
                              key={g.id}
                              style={{
                                padding: 10,
                                borderRadius: 6,
                                background: 'var(--surface)',
                                border: '1px solid var(--rule)'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                <strong style={{ fontFamily: 'var(--display)', fontSize: 13.5 }}>
                                  {g.label}
                                  {g.count ? ` (${g.count} Pers.)` : ''}
                                </strong>
                                <span className="muted" style={{ fontSize: 11.5 }}>
                                  {diff?.source === 'ki' ? 'KI' : diff?.source === 'manuell' ? 'Bearbeitet' : 'Matrix'}
                                </span>
                              </div>
                              <textarea
                                rows={2}
                                style={{ width: '100%', fontSize: 13, padding: '5px 7px' }}
                                value={diff?.measure || ''}
                                onChange={(e) => onEditDiffMeasure(r.key, g.id, g.label, e.target.value)}
                              />
                              {g.focus !== 'regel' && (
                                <div style={{ marginTop: 6 }}>
                                  <label style={{ fontFamily: 'var(--display)', fontSize: 12, fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 3 }}>
                                    Alternative FMT-Methode (optional)
                                    <select
                                      style={{ fontSize: 12.5, padding: '4px 6px' }}
                                      value={altId}
                                      onChange={(e) => onSubgroupMethodChange(r.key, g.id, e.target.value || null)}
                                    >
                                      <option value="">Gleiche Methode wie Hauptgruppe (nur anpassen)</option>
                                      {suggestedAlts.length > 0 && (
                                        <optgroup label="★ Passend zu Matrix, Zweck & Granularität">
                                          {suggestedAlts.map((a) => (
                                            <option key={a.kennung} value={a.kennung}>
                                              ★ {a.name} ({a.dauerMin}–{a.dauerMax} Min. · {a.grund})
                                            </option>
                                          ))}
                                        </optgroup>
                                      )}
                                      {compatRest.length > 0 && (
                                        <optgroup label="✓ Weitere passende Methoden">
                                          {compatRest.map((b) => (
                                            <option key={b.kennung} value={b.kennung}>
                                              {b.name} ({b.dauerMin}–{b.dauerMax} Min.)
                                            </option>
                                          ))}
                                        </optgroup>
                                      )}
                                    </select>
                                  </label>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
