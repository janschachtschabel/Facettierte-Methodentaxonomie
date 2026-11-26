import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
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
  /** Rendered between the group picker and the detail tabs (step 3: adjust methods, updated plan). */
  middleSlot?: ReactNode;
}

type PanelTab = 'udl' | 'konflikte' | 'gruppen' | 'phasen';

const TAB_ORDER: PanelTab[] = ['udl', 'konflikte', 'gruppen', 'phasen'];

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

/** Keeps total headcount balanced on Regelniveau ONLY when a total class size is explicitly known */
function rebalanceMainGroupCount(list: LearnerGroup[], targetTotal?: number): LearnerGroup[] {
  const mainIdx = list.findIndex((g) => g.id === 'regel');
  if (mainIdx === -1) return list;
  const knownTotal = targetTotal && targetTotal > 0 ? targetTotal : list[mainIdx].count;
  if (!knownTotal || knownTotal <= 0) return list;
  const othersSum = list.reduce((s, g, i) => (i === mainIdx || !g.active ? s : s + (g.count || 0)), 0);
  const nextMainCount = Math.max(1, knownTotal - othersSum);
  return list.map((g, i) => (i === mainIdx ? { ...g, count: nextMainCount } : g));
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
  totalClassSize,
  middleSlot
}: Props) {
  const [selectedGroupId, setSelectedGroupId] = useState<string>(groups[0]?.id || 'regel');
  const [activeTab, setActiveTab] = useState<PanelTab>('udl');
  const [showAllVariables, setShowAllVariables] = useState(false);
  // The detail tabs are collapsed by default and open when a group tag asks for them.
  const [detailsOpen, setDetailsOpen] = useState(false);
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

  const removeSubgroup = (id: string) => {
    const remaining = groups.filter((g) => g.id !== id);
    if (remaining.length === 0 || (remaining.length === 1 && remaining[0].id === 'regel')) {
      onGroupsChange(STANDARD_LEARNER_GROUPS.map((g) => ({ ...g, count: totalClassSize || g.count })));
      setSelectedGroupId('regel');
    } else {
      onGroupsChange(rebalanceMainGroupCount(remaining, totalClassSize));
      if (selectedGroupId === id) setSelectedGroupId(remaining[0].id);
    }
  };

  const toggleQuickTemplate = (tpl: QuickDiffGroupTemplate) => {
    const exists = groups.find((g) => g.id === tpl.id);
    if (exists) {
      removeSubgroup(tpl.id);
      return;
    }

    const baseList = groups.length > 0
      ? groups.map((g) => (g.id === 'regel' ? { ...g, label: 'Regelgruppe', active: true } : g))
      : [{ ...STANDARD_LEARNER_GROUPS[0], label: 'Regelgruppe', count: totalClassSize || 26 }];

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
    onGroupsChange(rebalanceMainGroupCount([...baseList, nextGroup], totalClassSize));
    setSelectedGroupId(nextGroup.id);
  };

  const applyClassicThreeGroups = () => {
    onGroupsChange(rebalanceMainGroupCount(DEFAULT_LEARNER_GROUPS.map((g) => ({ ...g })), totalClassSize));
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
      count: g.count ?? 4,
      personaId: g.personaId,
      matrixValues: g.selectedValues || {}
    }));
    const hasRegel = mapped.some((g) => g.focus === 'regel');
    const next = hasRegel
      ? mapped
      : [{ ...STANDARD_LEARNER_GROUPS[0], label: 'Regelgruppe' }, ...mapped];
    onGroupsChange(rebalanceMainGroupCount(next, totalClassSize));
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

  const handleTabKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = TAB_ORDER.indexOf(activeTab);
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setActiveTab(TAB_ORDER[(idx + 1) % TAB_ORDER.length]);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setActiveTab(TAB_ORDER[(idx - 1 + TAB_ORDER.length) % TAB_ORDER.length]);
    }
  };

  const totalLearners = activeGroups.reduce((s, g) => s + (g.count || 0), 0);
  const subgroupCount = activeGroups.filter((g) => g.focus !== 'regel').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <strong style={{ fontFamily: 'var(--display)', fontSize: 19 }}>
            ① Wer in deiner Lerngruppe braucht etwas anderes?
          </strong>
          <p className="muted" style={{ fontSize: 14, margin: '4px 0 0', maxWidth: 740 }}>
            {isStandardOnly
              ? 'Bisher gilt dein Ablauf für die ganze Klasse. Wähle hier Teilgruppen aus, wenn du differenzieren möchtest. Der Schritt ist freiwillig.'
              : 'Für jede Teilgruppe bekommst du Hinweise je Phase. Alles fließt in Material (Schritt 4) und das fertige Szenario (Schritt 5) ein.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link
            to="/differenzierung?source=planner"
            className="btn btn-sm"
            title="Aktuelles Baukasten-Szenario in der Vollansicht öffnen & als Checkliste/PDF exportieren"
          >
            Vollansicht &amp; Checkliste ↗
          </Link>
        </div>
      </div>

      {/* Prominent Active Selection Bar: ALWAYS shows exact current groups + direct 1-click remove/edit/reset */}
      <div className="diff-active-bar" role="region" aria-label="Aktive Teilgruppen im Konzept">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <strong style={{ fontFamily: 'var(--display)', fontSize: 14.5, color: 'var(--dA)' }}>
            {isStandardOnly
              ? 'Deine Lerngruppe: bisher nur die Regelgruppe'
              : `Deine Lerngruppe: Regelgruppe und ${subgroupCount} ${subgroupCount === 1 ? 'Teilgruppe' : 'Teilgruppen'}`}
            {totalLearners > 0 && activeGroups.every((g) => (g.count || 0) > 0) ? ` · ${totalLearners} Lernende` : ''}
          </strong>
          {!isStandardOnly && (
            <button
              type="button"
              className="btn btn-sm diff-reset-btn"
              onClick={resetToStandardGroup}
              title="Entfernt alle zusätzlichen Teilgruppen und kehrt zur Regelgruppe allein zurück"
            >
              ↺ Alle Teilgruppen entfernen
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {activeGroups.map((g) => (
            <span key={g.id} className="diff-active-tag">
              <button
                type="button"
                className="diff-active-tag-btn"
                title={`„${g.label}“ unter „Mehr Details“ feinjustieren`}
                onClick={() => {
                  setSelectedGroupId(g.id);
                  if (!isStandardOnly) {
                    setActiveTab('gruppen');
                    setDetailsOpen(true);
                  }
                }}
              >
                <span>{g.label}</span>
                {g.count ? <span className="muted" style={{ fontWeight: 500 }}>({g.count} Pers.)</span> : null}
              </button>
              {!isStandardOnly && g.id !== 'regel' && (
                <button
                  type="button"
                  className="diff-active-tag-remove"
                  aria-label={`Teilgruppe ${g.label} entfernen`}
                  title={`„${g.label}“ wieder entfernen`}
                  onClick={() => removeSubgroup(g.id)}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Subgroup Picker Box (separated cleanly from the active selection bar) */}
      <div
        style={{
          padding: 15,
          borderRadius: 'var(--radius)',
          background: 'var(--paper)',
          border: '1px solid var(--rule)',
          display: 'flex',
          flexDirection: 'column',
          gap: 11
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <strong style={{ fontFamily: 'var(--display)', fontSize: 14 }}>
            Teilgruppe per Klick hinzufügen oder wieder abwählen:
          </strong>
          <button type="button" className="diff-preset-link" onClick={applyClassicThreeGroups}>
            Vorlage laden: Basis · Regel · Vertiefung (3 Gruppen)
          </button>
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
          <label htmlFor="baukasten-diff-quicktext" className="muted" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>
            Lerngruppe kurz beschreiben
          </label>
          <input
            id="baukasten-diff-quicktext"
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

      {middleSlot}

      {/* Detail workspace: collapsed by default so the three main stages stay in view */}
      {!isStandardOnly && (
        <details
          className="diff-details"
          open={detailsOpen}
          onToggle={(e) => setDetailsOpen((e.currentTarget as HTMLDetailsElement).open)}
        >
          <summary>
            Mehr Details: Maßnahmen für alle, Zielkonflikte und Feinjustierung je Teilgruppe und Phase
          </summary>
          <label
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, cursor: 'pointer', margin: '10px 0' }}
          >
            <input
              type="checkbox"
              checked={includeSystemMeasures}
              onChange={(e) => setIncludeSystemMeasures(e.target.checked)}
            />
            Auch Maßnahmen der Schulorganisation anzeigen
          </label>
          <div
            className="diff-tabs"
            role="tablist"
            aria-label="Bereiche der Binnendifferenzierung"
            onKeyDown={handleTabKeyDown}
          >
            <button
              id="baukasten-tab-udl"
              type="button"
              role="tab"
              aria-selected={activeTab === 'udl'}
              aria-controls="baukasten-panel-udl"
              className={`diff-tab ${activeTab === 'udl' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('udl')}
            >
              1. Basis für alle ({multiSynthesis?.udlBasis.length ?? 0})
            </button>
            <button
              id="baukasten-tab-konflikte"
              type="button"
              role="tab"
              aria-selected={activeTab === 'konflikte'}
              aria-controls="baukasten-panel-konflikte"
              className={`diff-tab ${activeTab === 'konflikte' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('konflikte')}
            >
              2. Zielkonflikte ({multiSynthesis?.konflikte.length ?? 0})
            </button>
            <button
              id="baukasten-tab-gruppen"
              type="button"
              role="tab"
              aria-selected={activeTab === 'gruppen'}
              aria-controls="baukasten-panel-gruppen"
              className={`diff-tab ${activeTab === 'gruppen' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('gruppen')}
            >
              3. Teilgruppen &amp; Feinjustierung ({activeGroups.length})
            </button>
            <button
              id="baukasten-tab-phasen"
              type="button"
              role="tab"
              aria-selected={activeTab === 'phasen'}
              aria-controls="baukasten-panel-phasen"
              className={`diff-tab ${activeTab === 'phasen' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('phasen')}
            >
              4. Phasen &amp; Alternativ-Methoden ({scenarioRows.length})
            </button>
          </div>

          {/* TAB 1: UDL BASIS */}
          {activeTab === 'udl' && (
            <div id="baukasten-panel-udl" role="tabpanel" aria-labelledby="baukasten-tab-udl">
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
                        <span
                          className="diff-pill diff-pill-pos"
                          title="Normalisierter Passungswert aus der Differenzierungsmatrix (-100 bis +100 %), keine empirische Effektstärke."
                        >
                          Passung ≥ +{u.minNormalizedScore} %
                        </span>
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
            <div id="baukasten-panel-konflikte" role="tabpanel" aria-labelledby="baukasten-tab-konflikte">
              <p className="diff-section-lead">
                Wo sich die Bedürfnisse zweier Teilgruppen widersprechen – die Auflösungsstrategie zeigt, wie beides in derselben Stunde gelingt.
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
            <div
              id="baukasten-panel-gruppen"
              role="tabpanel"
              aria-labelledby="baukasten-tab-gruppen"
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              <p className="diff-section-lead">
                Passe hier Personenzahlen, Vorlagen oder einzelne Lernvoraussetzungen an. Klicke auf <strong>„Merkmale bearbeiten“</strong>,
                um die Matrix-Auswertung einer Gruppe unten anzuzeigen.
              </p>

              <div className="diff-grid-2">
                {groups.map((g) => {
                  const isSelected = selectedGroup?.id === g.id;
                  const mRes = matrixByGroup.get(g.id);
                  return (
                    <article
                      key={g.id}
                      className="diff-item-card"
                      style={{
                        background: isSelected ? 'var(--dA-soft)' : 'var(--paper)',
                        borderColor: isSelected ? 'var(--dA)' : 'var(--rule)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <label
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: 'var(--display)', fontWeight: 700 }}
                        >
                          <input
                            type="checkbox"
                            checked={g.active}
                            onChange={(e) => updateGroup(g.id, { active: e.target.checked })}
                          />
                          {g.label}
                        </label>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
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
                              aria-label={`Teilgruppe ${g.label} entfernen`}
                              title="Teilgruppe entfernen"
                              onClick={() => removeSubgroup(g.id)}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </div>

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

                      {mRes && mRes.topRecommendations.length > 0 && (
                        <div className="muted" style={{ fontSize: 12.5 }}>
                          <strong>Top-Empfehlung:</strong> {mRes.topRecommendations[0].name} (+{mRes.topRecommendations[0].normalizedScore} %)
                          <div style={{ marginTop: 2 }}>{mRes.topRecommendations[0].meta.umsetzungsimpuls}</div>
                        </div>
                      )}

                      <div style={{ marginTop: 'auto', paddingTop: 4 }}>
                        <button
                          type="button"
                          className={`btn btn-sm ${isSelected ? 'btn-primary' : ''}`}
                          aria-pressed={isSelected}
                          onClick={() => setSelectedGroupId(g.id)}
                        >
                          {isSelected ? '✓ Unten ausgewählt' : 'Merkmale bearbeiten'}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* Add Custom Subgroup */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  type="text"
                  aria-label="Name für neue eigene Teilgruppe"
                  style={{ flex: '1 1 200px', fontSize: 13.5 }}
                  placeholder="Eigene Teilgruppe anlegen (z. B. Sprachanfänger, Projekt-Tutoren)"
                  value={newGroupLabel}
                  onChange={(e) => setNewGroupLabel(e.target.value)}
                />
                <input
                  type="number"
                  aria-label="Personenzahl neue Teilgruppe"
                  min={1}
                  max={100}
                  style={{ width: 78, fontSize: 13.5 }}
                  value={newGroupCount}
                  onChange={(e) => setNewGroupCount(e.target.value)}
                  placeholder="Pers."
                />
                <select
                  aria-label="Vorlage für neue Teilgruppe"
                  value={newGroupPersona}
                  onChange={(e) => setNewGroupPersona(e.target.value)}
                  style={{ flex: '1 1 210px', fontSize: 13.5 }}
                >
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
                    const next = rebalanceMainGroupCount(
                      [
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
                      ],
                      totalClassSize
                    );
                    onGroupsChange(next);
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
            <div
              id="baukasten-panel-phasen"
              role="tabpanel"
              aria-labelledby="baukasten-tab-phasen"
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <p className="diff-section-lead" style={{ margin: 0 }}>
                  Passe jede Phase deines Konzepts direkt pro Teilgruppe an oder wähle optional eine alternative FMT-Methode.
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
                  const kernName = r.block?.kernkomponente?.[0]?.name;
                  return (
                    <article
                      key={r.key}
                      onFocus={() => onSelectStepKey?.(r.key)}
                      className="diff-item-card"
                      style={{
                        borderColor: isFocused ? 'var(--dA)' : 'var(--rule)',
                        background: isFocused ? 'color-mix(in srgb, var(--dA-soft) 45%, var(--paper))' : 'var(--paper)'
                      }}
                    >
                      <div className="diff-item-head">
                        <strong style={{ fontFamily: 'var(--display)', fontSize: 15 }}>
                          {r.orderLabel} · {r.methodName} ({r.durationMin} Min.)
                        </strong>
                        {!isFocused && onSelectStepKey && (
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            onClick={() => onSelectStepKey(r.key)}
                          >
                            Im Zeitband zeigen
                          </button>
                        )}
                      </div>

                      {kernName && (
                        <div className="muted" style={{ fontSize: 12.5 }}>
                          <strong>Kernkomponente wahren:</strong> {kernName}
                        </div>
                      )}

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {activeGroups.map((g) => {
                          const diff = r.differentiation.find((d) => d.groupId === g.id);
                          const altId = subgroupMethods[r.key]?.[g.id] || '';
                          const mRes = matrixByGroup.get(g.id);
                          const suggestedAlts =
                            mRes && r.block && g.focus !== 'regel'
                              ? suggestAlternativeMethodsForGroup(mRes, r.block, allBlocks, 5, r.durationMin, {
                                  maxTechnik,
                                  ohneInternet,
                                  ohneKI
                                })
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
                          const textareaId = `diff-measure-${r.key}-${g.id}`;
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
                                <label htmlFor={textareaId} style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 13.5 }}>
                                  {g.label}
                                  {g.count ? ` (${g.count} Pers.)` : ''}
                                </label>
                                <span className="muted" style={{ fontSize: 11.5 }}>
                                  {diff?.source === 'ki' ? 'KI' : diff?.source === 'manuell' ? 'Bearbeitet' : 'Empfehlung'}
                                </span>
                              </div>
                              <textarea
                                id={textareaId}
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
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </details>
      )}
    </div>
  );
}
