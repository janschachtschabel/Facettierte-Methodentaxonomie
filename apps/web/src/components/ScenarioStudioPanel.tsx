import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { scoreDifferentiationMatrix, type Arrangement, type Baustein, type ValidationResult } from '@fmt/core';
import { InlineMarkdown, SimpleMarkdown } from './SimpleMarkdown.js';
import { WloOerCards, wloPreviewPath } from './WloOerCards.js';
import { DifferentiationMatrixPanel } from './DifferentiationMatrixPanel.js';
import type { KandidatenRahmen } from '../planner/kandidaten.js';
import {
  exportArrangementHtmlHandout,
  exportArrangementMarkdown,
  exportArrangementOnePageSheet,
  exportArrangementWordDoc,
  exportMarkdownToPrintableHtml
} from '../planner/arrangementOps.js';
import {
  buildDefaultThematicRows,
  buildNeutralLearningScenario,
  buildStructuredLessonText,
  detectMaterialTypeForBlock,
  getOerWwwUrl,
  MATERIAL_TYPES,
  type GeneratedMaterialItem,
  type LearnerGroup,
  type OerResource,
  type ScenarioPhaseRow,
  type StepDiffSuggestion,
  type SubgroupMethodMap,
  type ThematicPhaseRow,
  type EntwurfMeta,
  entwurfBegriffe,
  lehrendeInfo
} from '../planner/scenarioModel.js';
import { exportScenarioToImscc, exportScenarioToMoodleXml } from '../planner/lmsExport.js';
import { printHtmlDocument } from '../planner/scenarioStorage.js';
import type { ByokSettings } from '../data/CatalogContext.js';
import { runDirectDifferentiate, runDirectElaborate, runDirectMaterial } from '../lib/directLlm.js';

export type StudioTab = 'oer' | 'diff' | 'material';

interface Props {
  mode: 'diff' | 'resources' | 'export';
  activeResourceTab: StudioTab;
  onResourceTabChange: (tab: StudioTab) => void;
  totalClassSize?: number;
  /** Step 3 only: content between group picker and detail tabs. */
  diffMiddleSlot?: ReactNode;
  /** Frame of the plan for other methods of a subgroup (core filter), passed on to the matrix panel. */
  kandidaten?: KandidatenRahmen;
  focusedStepKey: string | null;
  onSelectStepKey?: (stepKey: string) => void;
  arrangement: Arrangement;
  allBlocks: Baustein[];
  blocksById: Map<string, Baustein>;
  usedBlocks: Baustein[];
  validation: ValidationResult;
  scenarioRows: ScenarioPhaseRow[];
  labelOf: (schemeId: string, code: string) => string;
  fach: string;
  /** FMT subject area of the plan; narrows the WLO search when no single subject is known. */
  fachbereich?: string;
  thema: string;
  didaktischerAnsatz: string;
  lehrkraefteInfo: string;
  lernziele: string;
  problemstellung: string;
  hinweise: string;
  onFachChange: (v: string) => void;
  onThemaChange: (v: string) => void;
  onHinweiseChange: (v: string) => void;
  groups: LearnerGroup[];
  onGroupsChange: (next: LearnerGroup[]) => void;
  aiDiffByStep: Record<string, StepDiffSuggestion[]>;
  onAiDiffChange: (next: Record<string, StepDiffSuggestion[]>) => void;
  onEditDiffMeasure: (stepKey: string, groupId: string, groupLabel: string, measure: string) => void;
  subgroupMethods: SubgroupMethodMap;
  onSubgroupMethodChange: (stepKey: string, groupId: string, methodId: string | null) => void;
  oerByStep: Record<string, OerResource[]>;
  onOerByStepChange: (next: Record<string, OerResource[]>) => void;
  generatedMaterials: GeneratedMaterialItem[];
  onGeneratedMaterialsChange: (next: GeneratedMaterialItem[]) => void;
  thematicRows: ThematicPhaseRow[] | null;
  onThematicRowsChange: (next: ThematicPhaseRow[] | null) => void;
  elaboration: string | null;
  onElaborationChange: (next: string | null) => void;
  onPrintPdf: () => void;
  onPrintOnePage?: () => void;
  onNextStep?: () => void;
  onSaveBrowser: () => void;
  onDownloadProject: () => void;
  getTimelineSvg: () => string | null;
  byok?: ByokSettings;
  byokHeaders: () => Record<string, string>;
  llmAvailable: boolean;
  maxTechnik?: string;
  ohneInternet?: boolean;
  ohneKI?: boolean;
  /** Planning profile and plan details for the draft with seven core fields (Paket D). */
  entwurfMeta?: EntwurfMeta;
}

export function ScenarioStudioPanel({
  mode,
  activeResourceTab,
  onResourceTabChange,
  totalClassSize,
  diffMiddleSlot,
  kandidaten,
  focusedStepKey,
  onSelectStepKey,
  arrangement,
  allBlocks,
  blocksById,
  usedBlocks,
  validation,
  scenarioRows,
  labelOf,
  fach,
  fachbereich,
  thema,
  didaktischerAnsatz,
  lehrkraefteInfo,
  lernziele,
  problemstellung,
  hinweise,
  onFachChange,
  onThemaChange,
  onHinweiseChange,
  groups,
  onGroupsChange,
  aiDiffByStep,
  onAiDiffChange,
  onEditDiffMeasure,
  subgroupMethods,
  onSubgroupMethodChange,
  oerByStep,
  onOerByStepChange,
  generatedMaterials,
  onGeneratedMaterialsChange,
  thematicRows,
  onThematicRowsChange,
  elaboration,
  onElaborationChange,
  onPrintPdf,
  onPrintOnePage,
  onNextStep,
  onSaveBrowser,
  onDownloadProject,
  getTimelineSvg,
  byok,
  byokHeaders,
  llmAvailable,
  maxTechnik,
  ohneInternet,
  ohneKI,
  entwurfMeta = {}
}: Props) {
  const exportProfil = entwurfBegriffe(entwurfMeta, arrangement.kontext?.bildungsstufe);
  const spalten = exportProfil?.spalten;
  // The untouched default "1 Lehrkraft" is not shown outside the school terms.
  const lehrendeZeile = lehrendeInfo(lehrkraefteInfo, entwurfMeta, arrangement.kontext?.bildungsstufe);
  // Full AI elaboration state
  const [busyElab, setBusyElab] = useState(false);
  const [elabError, setElabError] = useState<string | null>(null);
  const [elabStatus, setElabStatus] = useState<string | null>(null);
  const [editingTable, setEditingTable] = useState(false);
  const [editingText, setEditingText] = useState(false);
  const [previewModal, setPreviewModal] = useState<
    | { kind: 'material'; item: GeneratedMaterialItem }
    | { kind: 'oer'; item: OerResource; phaseLabel: string }
    | null
  >(null);

  // Differentiation state
  const [busyDiff, setBusyDiff] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  // Material generator state
  const [matStepKey, setMatStepKey] = useState<string>(scenarioRows[0]?.key || 'step-0');
  const [matType, setMatType] = useState<string>('auto');
  const [matNotes, setMatNotes] = useState<string>('');
  const [busyMat, setBusyMat] = useState(false);
  const [matError, setMatError] = useState<string | null>(null);
  const [draftMaterial, setDraftMaterial] = useState<{ title: string; materialType: string; content: string } | null>(null);
  const [editingDraftMat, setEditingDraftMat] = useState(false);

  useEffect(() => {
    if (focusedStepKey) setMatStepKey(focusedStepKey);
  }, [focusedStepKey]);

  useEffect(() => {
    if (!scenarioRows.some((r) => r.key === matStepKey) && scenarioRows[0]) {
      setMatStepKey(scenarioRows[0].key);
    }
  }, [scenarioRows, matStepKey]);

  const effectiveThematicRows = useMemo(() => {
    const defaults = buildDefaultThematicRows(scenarioRows, groups, fach, thema);
    if (!thematicRows || !thematicRows.length) return defaults;
    const byKey = new Map(thematicRows.map((r) => [r.key, r]));
    return defaults.map((d) => {
      const saved = byKey.get(d.key);
      if (!saved) return d;
      return {
        ...d,
        methodProcedure: saved.methodProcedure || d.methodProcedure,
        teacherAction: saved.teacherAction || d.teacherAction,
        learnerAction: saved.learnerAction || d.learnerAction,
        groupAdaptations: { ...d.groupAdaptations, ...(saved.groupAdaptations || {}) },
        materialsAndOer: saved.materialsAndOer || d.materialsAndOer
      };
    });
  }, [scenarioRows, groups, fach, thema, thematicRows]);

  const structuredTextDraft = useMemo(
    () =>
      buildStructuredLessonText(arrangement, scenarioRows, effectiveThematicRows, groups, {
        fach,
        thema,
        didaktischerAnsatz,
        lehrkraefteInfo: lehrendeZeile,
        lernziele,
        problemstellung,
        hinweise,
        totalDurationMin: validation.dauerMin,
        labelOf,
        ...entwurfMeta
      }),
    [
      arrangement,
      scenarioRows,
      effectiveThematicRows,
      groups,
      fach,
      thema,
      didaktischerAnsatz,
      lehrendeZeile,
      lernziele,
      problemstellung,
      hinweise,
      validation.dauerMin,
      labelOf,
      entwurfMeta
    ]
  );

  const effectiveNarrativeText = elaboration && elaboration.trim() ? elaboration : structuredTextDraft;

  const openMaterialInNewTab = (mat: GeneratedMaterialItem) => {
    const html = exportMarkdownToPrintableHtml(mat.title, mat.content);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const downloadFile = (filename: string, content: string | Uint8Array, mime: string) => {
    const payload = typeof content === 'string' ? content : new Uint8Array(content);
    const blob = new Blob([payload], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalLearners = groups.filter((g) => g.active).reduce((s, g) => s + (g.count || 0), 0);

  const buildScenario = () =>
    buildNeutralLearningScenario(arrangement, scenarioRows, groups, {
      fach,
      thema,
      didaktischerAnsatz,
      lehrkraefteInfo: lehrendeZeile,
      lernziele,
      problemstellung,
      hinweise,
      totalLearners: totalLearners || undefined,
      thematicRows: effectiveThematicRows,
      elaboration: effectiveNarrativeText,
      generatedMaterials,
      totalDurationMin: validation.dauerMin,
      labelOf,
      ...entwurfMeta
    });

  const exportOpts = (includeMachineReadableInMd = false) => {
    const sc = buildScenario();
    const machineJson = JSON.stringify(sc, null, 2);
    return {
      fach,
      thema,
      didaktischerAnsatz,
      lehrkraefteInfo: lehrendeZeile,
      lernziele,
      problemstellung,
      kiAusarbeitung: effectiveNarrativeText,
      timelineSvg: getTimelineSvg(),
      groups,
      thematicRows: effectiveThematicRows,
      generatedMaterials,
      scenarioRows,
      machineReadableJson: machineJson,
      includeMachineReadableInMd,
      profil: exportProfil
    };
  };

  const runAiElaborate = async () => {
    setBusyElab(true);
    setElabError(null);
    try {
      const activeGroups = groups.filter((g) => g.active);
      const diffPayload = activeGroups.map((g) => {
        const mRes = scoreDifferentiationMatrix({ personaId: g.personaId, selectedValues: g.matrixValues, maxTechnik: maxTechnik || undefined, ohneInternet, ohneKI, limit: 5 });
        return {
          id: g.id,
          gruppe: g.label,
          profil: g.profile,
          anzahl: g.count,
          matrixMassnahmen: mRes.topRecommendations.map((r) => `${r.name} (+${r.score})`)
        };
      });

      const oerPayload = scenarioRows.flatMap((r) =>
        r.oerResources.map((o) => ({
          stepKey: r.key,
          titel: o.title,
          wwwurl: getOerWwwUrl(o),
          url: getOerWwwUrl(o),
          lizenz: o.license || null,
          notiz: o.note || undefined
        }))
      );

      const matPayload = generatedMaterials.map((m) => ({
        stepKey: m.stepKey,
        titel: m.title,
        typ: m.materialType,
        kurzinhalt: m.content.slice(0, 320)
      }));

      const phasenPayload = scenarioRows.map((r) => ({
        key: r.key,
        orderLabel: r.orderLabel,
        phaseLabel: r.phaseLabel,
        durationMin: r.durationMin,
        methodId: r.methodId,
        methodName: r.methodName,
        subgroupMethods: Object.fromEntries(
          Object.entries(r.subgroupMethods).map(([gid, sm]) => [gid, { methodId: sm.methodId, methodName: sm.methodName }])
        )
      }));

      const akteureSummary = [
        lehrendeZeile || exportProfil?.lehrende || '1 Lehrkraft',
        totalLearners ? `${totalLearners} Lernende gesamt` : '',
        activeGroups.map((g) => `${g.label}${g.count ? ` (${g.count})` : ''}`).join(', ')
      ]
        .filter(Boolean)
        .join(' · ');

      const elaboratePayload = {
        arrangement,
        thema,
        fach,
        didaktischerAnsatz: didaktischerAnsatz || undefined,
        akteure: akteureSummary || undefined,
        lernziele: lernziele.trim() || undefined,
        problemstellung: problemstellung.trim() || undefined,
        hinweise: hinweise.trim() || undefined,
        differenzierung: diffPayload,
        oerRessourcen: oerPayload,
        materialien: matPayload,
        phasen: phasenPayload,
        bildungsstufe: arrangement.kontext?.bildungsstufe || undefined,
        // An assumed profile stays marked as assumed; the plan details fill the core fields as in the structured text.
        planungsprofil: entwurfMeta.planungsprofil,
        planungsprofilAngenommen: entwurfMeta.planungsprofilAngenommen || undefined,
        raum: entwurfMeta.raum,
        anzahl: entwurfMeta.anzahl,
        einheit: entwurfMeta.einheit,
        nachweis: entwurfMeta.nachweis,
        bewertet: entwurfMeta.bewertet,
        hinweiseListe: entwurfMeta.regelhinweise?.length ? entwurfMeta.regelhinweise : undefined,
        // Accompanying goals and the proposed strand (labels; the server reads labels as well), for the field Ziele.
        begleitziel: entwurfMeta.begleitziele?.length ? entwurfMeta.begleitziele : undefined,
        begleitstrang: entwurfMeta.begleitstrang?.length
          ? entwurfMeta.begleitstrang.map((s) => ({ begleitziel: s.begleitziel, baustein: s.baustein, name: s.methode, dauerMin: s.dauerMin }))
          : undefined
      };

      let json: {
        fehler?: string;
        thematischeTabelle?: ThematicPhaseRow[];
        ausarbeitung?: string;
        gecacht?: boolean;
        meta?: { teilprompts: number; erfolgreich: number; fehlgeschlagen: number; dauerMs: number };
      };
      if (byok?.enabled && byok.directBrowser) {
        json = await runDirectElaborate(byok, elaboratePayload);
      } else {
        const res = await fetch('/api/v1/assistant/elaborate', {
          method: 'POST',
          headers: byokHeaders(),
          body: JSON.stringify(elaboratePayload)
        });
        json = await res.json();
        if (!res.ok) {
          setElabError(json.fehler || 'Ausgestaltung fehlgeschlagen.');
          return;
        }
      }
      if (Array.isArray(json.thematischeTabelle) && json.thematischeTabelle.length > 0) {
        onThematicRowsChange(json.thematischeTabelle as ThematicPhaseRow[]);
      }
      onElaborationChange(String(json.ausarbeitung));
      if (json.meta && typeof json.meta.teilprompts === 'number') {
        const sec = ((Number(json.meta.dauerMs) || 0) / 1000).toFixed(1).replace('.', ',');
        setElabStatus(
          json.meta.fehlgeschlagen > 0
            ? `Teilweise fertiggestellt (${json.meta.erfolgreich}/${json.meta.teilprompts} parallele Teilprompts in ${sec} s; fehlende Abschnitte mit FMT-Struktur aufgefüllt).`
            : `✓ ${json.meta.teilprompts} parallele Teilprompts fertiggestellt (${sec} s).`
        );
      } else if (json.gecacht) {
        setElabStatus('✓ Aus Cache geladen.');
      } else {
        setElabStatus(null);
      }
    } catch (e) {
      setElabError(e instanceof Error ? e.message : 'Netzwerkfehler');
    } finally {
      setBusyElab(false);
    }
  };

  const runAiDifferentiate = async () => {
    setBusyDiff(true);
    setDiffError(null);
    try {
      const activeGroups = groups.filter((g) => g.active);
      const diffRequestPayload = {
        fach,
        thema,
        // Without a Bildungsstufe nothing is sent; the server then says it is not given (no silent default).
        bildungsstufe: arrangement.kontext?.bildungsstufe ? labelOf('bildungsstufe', arrangement.kontext.bildungsstufe) : undefined,
        planungsprofil: entwurfMeta.planungsprofil,
        hinweise: hinweise.trim() || undefined,
        gruppen: activeGroups.map((g) => {
          const scored = scoreDifferentiationMatrix({ personaId: g.personaId, selectedValues: g.matrixValues, maxTechnik: maxTechnik || undefined, ohneInternet, ohneKI, limit: 5 });
          return {
            id: g.id,
            label: g.label,
            profile: g.profile,
            count: g.count,
            matrixMeasures: scored.topRecommendations.map((r) => `${r.name} (+${r.score})`)
          };
        }),
        phases: scenarioRows.map((r) => ({
          key: r.key,
          phaseLabel: r.phaseLabel,
          methodId: r.methodId,
          durationMin: r.durationMin
        }))
      };
      let json: { fehler?: string; vorschlaege?: Record<string, Array<{ groupId?: string; groupLabel?: string; measure?: string }>> };
      if (byok?.enabled && byok.directBrowser) {
        json = await runDirectDifferentiate(byok, diffRequestPayload);
      } else {
        const res = await fetch('/api/v1/assistant/differentiate', {
          method: 'POST',
          headers: byokHeaders(),
          body: JSON.stringify(diffRequestPayload)
        });
        json = await res.json();
        if (!res.ok) {
          setDiffError(json.fehler || 'KI-Differenzierung fehlgeschlagen.');
          return;
        }
      }
      const next: Record<string, StepDiffSuggestion[]> = {};
      for (const [k, list] of Object.entries(json.vorschlaege || {})) {
        next[k] = (list as Array<{ groupId: string; groupLabel: string; measure: string }>).map((x) => ({
          ...x,
          source: 'ki'
        }));
      }
      onAiDiffChange(next);
    } catch (e) {
      setDiffError(e instanceof Error ? e.message : 'Netzwerkfehler');
    } finally {
      setBusyDiff(false);
    }
  };

  const runMaterialGen = async (mode: 'ki' | 'template' = 'ki') => {
    const row = scenarioRows.find((r) => r.key === matStepKey);
    if (!row) return;
    setBusyMat(true);
    setMatError(null);
    const effType = matType === 'auto' ? detectMaterialTypeForBlock(row.block) : matType;
    try {
      const activeGroups = groups.filter((g) => g.active);
      const matRequestPayload = {
        baustein: row.methodId,
        phaseLabel: row.phaseLabel,
        dauerMin: row.durationMin,
        fach,
        thema,
        // Without a Bildungsstufe nothing is sent; the server then says it is not given (no silent default).
        bildungsstufe: arrangement.kontext?.bildungsstufe ? labelOf('bildungsstufe', arrangement.kontext.bildungsstufe) : undefined,
        planungsprofil: entwurfMeta.planungsprofil,
        materialTyp: effType,
        mode,
        gruppen: activeGroups.map((g) => {
          const scored = scoreDifferentiationMatrix({ personaId: g.personaId, selectedValues: g.matrixValues, maxTechnik: maxTechnik || undefined, ohneInternet, ohneKI, limit: 4 });
          return {
            label: g.label,
            profile: g.profile,
            count: g.count,
            matrixMeasures: scored.topRecommendations.map((x) => x.name)
          };
        }),
        hinweise: matNotes.trim() || hinweise.trim() || undefined
      };
      let json: { fehler?: string; material?: string };
      if (mode === 'ki' && byok?.enabled && byok.directBrowser) {
        json = await runDirectMaterial(byok, matRequestPayload);
      } else {
        const res = await fetch('/api/v1/assistant/material', {
          method: 'POST',
          headers: byokHeaders(),
          body: JSON.stringify(matRequestPayload)
        });
        json = await res.json();
        if (!res.ok) {
          setMatError(json.fehler || 'Materialgenerierung fehlgeschlagen.');
          return;
        }
      }
      setDraftMaterial({
        title: `${row.methodName} – ${MATERIAL_TYPES.find((t) => t.id === effType)?.label || effType}`,
        materialType: effType,
        content: String(json.material)
      });
      setEditingDraftMat(false);
    } catch (e) {
      setMatError(e instanceof Error ? e.message : 'Netzwerkfehler');
    } finally {
      setBusyMat(false);
    }
  };

  const attachDraftMaterialToPhase = () => {
    if (!draftMaterial) return;
    const item: GeneratedMaterialItem = {
      id: `mat-${Date.now()}`,
      stepKey: matStepKey,
      title: draftMaterial.title,
      materialType: draftMaterial.materialType,
      content: draftMaterial.content,
      createdAt: new Date().toISOString()
    };
    onGeneratedMaterialsChange([...generatedMaterials, item]);
  };

  const updateThematicCell = (
    key: string,
    field: 'methodProcedure' | 'teacherAction' | 'learnerAction' | 'materialsAndOer',
    value: string
  ) => {
    const next = effectiveThematicRows.map((r) => (r.key === key ? { ...r, [field]: value } : r));
    onThematicRowsChange(next);
  };

  const updateThematicGroupCell = (key: string, groupId: string, value: string) => {
    const next = effectiveThematicRows.map((r) =>
      r.key === key ? { ...r, groupAdaptations: { ...r.groupAdaptations, [groupId]: value } } : r
    );
    onThematicRowsChange(next);
  };

  const totalAttachedOer = Object.values(oerByStep).reduce((s, list) => s + list.length, 0);
  const selectedMatRow = scenarioRows.find((r) => r.key === matStepKey);
  const autoDetectedType = detectMaterialTypeForBlock(selectedMatRow?.block);
  const activeGroups = groups.filter((g) => g.active);

  // =========================================================================
  // MODE 0 (STEP 3): BINNENDIFFERENZIERUNG (OPTIONAL, NACH METHODENKONZEPT)
  // =========================================================================
  if (mode === 'diff') {
    const isStandardOnly = activeGroups.length <= 1 && (activeGroups.length === 0 || activeGroups[0].focus === 'regel');
    return (
      <div className="card" style={{ padding: 20 }}>
        <DifferentiationMatrixPanel
          groups={groups}
          onGroupsChange={onGroupsChange}
          scenarioRows={scenarioRows}
          focusedStepKey={focusedStepKey}
          onSelectStepKey={onSelectStepKey}
          allBlocks={allBlocks}
          subgroupMethods={subgroupMethods}
          onSubgroupMethodChange={onSubgroupMethodChange}
          aiDiffByStep={aiDiffByStep}
          onAiDiffChange={onAiDiffChange}
          onEditDiffMeasure={onEditDiffMeasure}
          onRunAiDifferentiate={() => void runAiDifferentiate()}
          busyDiff={busyDiff}
          diffError={diffError}
          llmAvailable={llmAvailable}
          maxTechnik={maxTechnik}
          ohneInternet={ohneInternet}
          ohneKI={ohneKI}
          totalClassSize={totalClassSize}
          middleSlot={diffMiddleSlot}
          kandidaten={kandidaten}
        />
        {onNextStep && (
          <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--rule)' }}>
            <button type="button" className="btn btn-primary" onClick={onNextStep}>
              {isStandardOnly ? 'Ohne Differenzierung weiter zu Material →' : 'Weiter zu Material →'}
            </button>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // MODE 1 (STEP 4): WLO-OER-SUCHE & KI-MATERIALAUFTRAG
  // =========================================================================
  if (mode === 'resources') {
    const effectiveTab = activeResourceTab === 'material' ? 'material' : 'oer';
    return (
      <div className="card" style={{ padding: 20 }}>
        <div
          className="no-print"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            borderBottom: '1px solid var(--grid)',
            paddingBottom: 12,
            marginBottom: 16
          }}
        >
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`btn btn-sm ${effectiveTab === 'oer' ? 'btn-primary' : ''}`}
              onClick={() => onResourceTabChange('oer')}
            >
              🌐 WLO / OER finden &amp; zuordnen {totalAttachedOer > 0 ? `(${totalAttachedOer})` : ''}
            </button>
            <button
              type="button"
              className={`btn btn-sm ${effectiveTab === 'material' ? 'btn-primary' : ''}`}
              onClick={() => onResourceTabChange('material')}
            >
              📝 Material per KI erstellen {generatedMaterials.length > 0 ? `(${generatedMaterials.length} angehängt)` : ''}
            </button>
          </div>
          {onNextStep && (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={onNextStep}
              title="Weiter zum fertigen thematischen Unterrichtsszenario & Export (Schritt 5)"
            >
              Weiter zu Schritt 5: Entwurf &amp; Export →
            </button>
          )}
        </div>

        {effectiveTab === 'oer' && (
          <WloOerCards
            scenarioRows={scenarioRows}
            initialStepKey={focusedStepKey || scenarioRows[0]?.key || 'step-0'}
            onTargetStepChange={onSelectStepKey}
            fach={fach}
            fachbereich={fachbereich}
            thema={thema}
            bildungsstufe={arrangement.kontext?.bildungsstufe || ''}
            oerByStep={oerByStep}
            onOerByStepChange={onOerByStepChange}
          />
        )}

        {effectiveTab === 'material' && (
          <div>
            <strong style={{ fontFamily: 'var(--display)', fontSize: 16 }}>
              📝 Materialauftrag an die KI (Arbeitsblatt, Quiz, Checkliste, Karten)
            </strong>
            <p className="muted" style={{ fontSize: 13.5, margin: '3px 0 12px' }}>
              Erzeugt konkretes, druckfertiges Unterrichtsmaterial passend zur FMT-Methode, deinem Thema und der
              Binnendifferenzierungsmatrix. Du kannst den Entwurf bearbeiten und direkt an die Phase anhängen – dann
              bezieht sich der fertige Unterrichtsentwurf (Schritt 4) ausdrücklich darauf.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginBottom: 10 }}>
              <label style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
                Phase / FMT-Methode
                <select
                  value={matStepKey}
                  onChange={(e) => {
                    setMatStepKey(e.target.value);
                    onSelectStepKey?.(e.target.value);
                  }}
                >
                  {scenarioRows.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.orderLabel} · {r.methodName} ({r.durationMin} min)
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
                Materialtyp
                <select value={matType} onChange={(e) => setMatType(e.target.value)}>
                  {MATERIAL_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.id === 'auto'
                        ? `${t.label} → ${MATERIAL_TYPES.find((x) => x.id === autoDetectedType)?.label || autoDetectedType}`
                        : t.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
              Auftrag / Zusatzwunsch fürs Material (optional)
              <input
                type="text"
                value={matNotes}
                onChange={(e) => setMatNotes(e.target.value)}
                placeholder="z. B. 4 gestufte Aufgaben mit Alltagsbezug, Satzstarter für Basisgruppe, inkl. Musterlösung"
              />
            </label>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {llmAvailable ? (
                <>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busyMat || !selectedMatRow}
                    onClick={() => void runMaterialGen('ki')}
                  >
                    ✨ {busyMat ? 'Generiere Material…' : 'Material per KI erstellen'}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={busyMat || !selectedMatRow}
                    title="Erzeugt sofort ein druckfertiges Struktur-Arbeitsblatt ohne KI-Tokens aus FMT-Schritten & Matrix"
                    onClick={() => void runMaterialGen('template')}
                  >
                    📄 Struktur-Vorlage ohne KI (&lt;1 ms)
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busyMat || !selectedMatRow}
                  onClick={() => void runMaterialGen('template')}
                >
                  📄 {busyMat ? 'Erstelle Vorlage…' : 'Material-Vorlage erstellen (ohne KI)'}
                </button>
              )}
            </div>

            {matError && (
              <div className="msgs" style={{ marginTop: 8 }}>
                <li className="err">{matError}</li>
              </div>
            )}

            {draftMaterial && (
              <div
                style={{
                  marginTop: 14,
                  padding: 18,
                  background: 'var(--paper)',
                  borderRadius: 8,
                  border: '1px solid var(--dA)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  <strong style={{ fontFamily: 'var(--display)', fontSize: 16 }}>{draftMaterial.title}</strong>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-sm btn-primary" onClick={attachDraftMaterialToPhase}>
                      ✓ An gewählte Phase anhängen (für Schritt 4)
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => setEditingDraftMat((s) => !s)}>
                      {editingDraftMat ? '👁 Vorschau' : '✏ Bearbeiten'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() =>
                        printHtmlDocument(exportMarkdownToPrintableHtml(draftMaterial.title, draftMaterial.content))
                      }
                    >
                      🖨 PDF
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => downloadFile('fmt-material.md', draftMaterial.content, 'text/markdown;charset=utf-8')}
                    >
                      ⬇ .md
                    </button>
                  </div>
                </div>
                {editingDraftMat ? (
                  <textarea
                    rows={14}
                    style={{ width: '100%', fontFamily: 'var(--mono)', fontSize: 13 }}
                    value={draftMaterial.content}
                    onChange={(e) => setDraftMaterial({ ...draftMaterial, content: e.target.value })}
                  />
                ) : (
                  <SimpleMarkdown content={draftMaterial.content} />
                )}
              </div>
            )}

            {generatedMaterials.length > 0 && (
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--grid)' }}>
                <strong style={{ fontFamily: 'var(--display)', fontSize: 15 }}>
                  ✓ An dieses Szenario angehängte Materialien ({generatedMaterials.length}):
                </strong>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  {generatedMaterials.map((m) => {
                    const row = scenarioRows.find((r) => r.key === m.stepKey);
                    return (
                      <div
                        key={m.id}
                        style={{
                          padding: 10,
                          borderRadius: 6,
                          background: 'var(--paper)',
                          border: '1px solid var(--dC)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 10,
                          flexWrap: 'wrap'
                        }}
                      >
                        <div>
                          <strong style={{ fontFamily: 'var(--display)' }}>{m.title}</strong>
                          <div className="muted" style={{ fontSize: 12 }}>
                            Phase: {row ? `${row.orderLabel} · ${row.methodName}` : m.stepKey}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => printHtmlDocument(exportMarkdownToPrintableHtml(m.title, m.content))}
                          >
                            🖨 PDF
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => onGeneratedMaterialsChange(generatedMaterials.filter((x) => x.id !== m.id))}
                          >
                            ✕
                          </button>
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

  // =========================================================================
  // MODE 2 (STEP 4): FERTIGES THEMATISCHES SZENARIO (TABELLE + TEXT + EXPORT)
  // =========================================================================
  const standardMarkdownWithJson = exportArrangementMarkdown(arrangement, blocksById, validation, exportOpts(true));
  const machineReadablePreview = JSON.stringify(buildScenario(), null, 2);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Prominent Action & Export Ribbon */}
      <div className="card no-print" style={{ padding: 20, borderTop: '3px solid var(--dA)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 23 }}>4. Fertiges thematisches Unterrichtsszenario &amp; Export</h2>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 14.5 }}>
              {fach || 'Fach'} · {thema || arrangement.name} · {validation.dauerMin} min · {usedBlocks.length} FMT-Methoden
              {totalAttachedOer > 0 ? ` · ${totalAttachedOer} WLO-OER` : ''}
              {generatedMaterials.length > 0 ? ` · ${generatedMaterials.length} KI-Materialien` : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" disabled={busyElab} onClick={() => void runAiElaborate()}>
              ✨{' '}
              {busyElab
                ? `Arbeite ${scenarioRows.length} Phasen + Entwurf in ${Math.max(1, Math.ceil(scenarioRows.length / 3)) + 1} parallelen Teilprompts aus…`
                : elaboration
                  ? 'Thematische Tabelle & Entwurf neu ausarbeiten (KI)'
                  : 'Thematische Tabelle & Entwurf ausarbeiten (KI)'}
            </button>
            <button type="button" className="btn btn-primary" onClick={onPrintPdf}>
              🖨 Als PDF drucken / speichern
            </button>
            <button
              type="button"
              className="btn"
              title="Kompakte Pultvorlage / Kurzablauf auf maximal 1 A4-Seite (Querformat)"
              onClick={() => {
                if (onPrintOnePage) {
                  onPrintOnePage();
                } else {
                  printHtmlDocument(exportArrangementOnePageSheet(arrangement, blocksById, validation, exportOpts(false)));
                }
              }}
            >
              📄 Kurzablauf (1 A4-Seite)
            </button>
          </div>
        </div>

        {/* Quick Metadata inline polish */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 14 }}>
          <label style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
            Fach
            <input type="text" value={fach} onChange={(e) => onFachChange(e.target.value)} />
          </label>
          <label style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
            Thema
            <input type="text" value={thema} onChange={(e) => onThemaChange(e.target.value)} />
          </label>
          <label style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
            Zusatzhinweise für thematische Ausarbeitung
            <input
              type="text"
              value={hinweise}
              onChange={(e) => onHinweiseChange(e.target.value)}
              placeholder="z. B. Fokus auf Alltagsbeispiele, Zeitpuffer einplanen"
            />
          </label>
        </div>

        {/* Grouped Export Buttons (Table + Text + Machine-Readable!) */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--grid)' }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() =>
              downloadFile(
                'fmt-unterrichtsentwurf.doc',
                exportArrangementWordDoc(arrangement, blocksById, validation, exportOpts(false)),
                'application/msword;charset=utf-8'
              )
            }
          >
            ⬇ Word / LibreOffice (.doc)
          </button>
          <button
            type="button"
            className="btn btn-sm"
            title="Kompakte 1-Seiten-Pultvorlage (max. 1 A4-Seite Querformat) als druckfertige HTML-Datei"
            onClick={() =>
              downloadFile(
                'fmt-kurzablauf-1seite.html',
                exportArrangementOnePageSheet(arrangement, blocksById, validation, exportOpts(false)),
                'text/html;charset=utf-8'
              )
            }
          >
            ⬇ Kurzablauf 1 A4 (.html)
          </button>
          <button
            type="button"
            className="btn btn-sm"
            title="Enthält Zeitband-SVG, thematische Tabelle, Text, WLO-OER-wwwurl und eingebettetes JSON-LD"
            onClick={() =>
              downloadFile(
                'fmt-unterrichtsentwurf.html',
                exportArrangementHtmlHandout(arrangement, blocksById, validation, exportOpts(false)),
                'text/html;charset=utf-8'
              )
            }
          >
            ⬇ Handout + JSON-LD (.html)
          </button>
          <button
            type="button"
            className="btn btn-sm"
            title="Enthält thematische Tabelle, Text, WLO-OER-wwwurl und maschinenlesbare IMS-LD JSON-Repräsentation"
            onClick={() => downloadFile('fmt-unterrichtsentwurf.md', standardMarkdownWithJson, 'text/markdown;charset=utf-8')}
          >
            ⬇ Markdown inkl. Tabelle &amp; JSON (.md)
          </button>
          <button
            type="button"
            className="btn btn-sm"
            title="IMS Common Cartridge 1.3 – importierbar in Moodle, ILIAS, Canvas & itslearning"
            onClick={() => {
              const sc = buildScenario();
              downloadFile('fmt-lernszenario.imscc', exportScenarioToImscc(sc, scenarioRows), 'application/zip');
            }}
          >
            ⬇ LMS: Common Cartridge (.imscc)
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              const sc = buildScenario();
              downloadFile('fmt-moodle-kurs.xml', exportScenarioToMoodleXml(sc, scenarioRows), 'application/xml;charset=utf-8');
            }}
          >
            ⬇ Moodle (.xml)
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              downloadFile('fmt-imsld-szenario.json', machineReadablePreview, 'application/json;charset=utf-8');
            }}
          >
            ⬇ Maschinenlesbar IMS-LD (.json)
          </button>
          <button type="button" className="btn btn-sm" onClick={onSaveBrowser}>
            💾 Speichern
          </button>
          <button type="button" className="btn btn-sm" onClick={onDownloadProject}>
            ⬇ Projekt (.fmt.json)
          </button>
        </div>

        {elabError && (
          <div className="msgs" style={{ marginTop: 10 }}>
            <li className="err">{elabError}</li>
          </div>
        )}
        {elabStatus && !elabError && (
          <div style={{ marginTop: 8, fontSize: 12.5, fontFamily: 'var(--display)', color: 'var(--dA)' }}>
            {elabStatus}
          </div>
        )}

        {/* Clear, transparent prompt when thematic AI elaboration hasn't been triggered yet */}
        {!elaboration && (
          <div
            style={{
              marginTop: 14,
              padding: '12px 14px',
              borderRadius: 8,
              background: 'var(--dB-soft)',
              borderLeft: '4px solid var(--dB)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap'
            }}
          >
            <div style={{ fontSize: 13.5, flex: '1 1 360px' }}>
              <strong style={{ fontFamily: 'var(--display)' }}>
                ℹ Hinweis: Aktuell wird die automatische Struktur-Vorschau (ohne KI) angezeigt.
              </strong>{' '}
              Die Tabelle und der Text nutzen bereits deine FMT-Methoden, Matrix-Werte und OERs.{' '}
              {llmAvailable
                ? `Klicke auf „Thematische Tabelle & Entwurf ausarbeiten (KI)“, damit alle Schritte, Impulse und Materialien sprachlich konkret auf „${thema || arrangement.name}“ zugeschnitten werden (läuft bewusst erst auf Klick, um Tokens zu sparen).`
                : 'Ohne LLM-Key kannst du Tabelle und Text direkt manuell bearbeiten und sofort drucken/exportieren.'}
            </div>
            {llmAvailable && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busyElab}
                onClick={() => void runAiElaborate()}
              >
                ✨ {busyElab ? 'Generiere…' : 'Jetzt thematisch ausarbeiten (KI)'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* SECTION A: THEMATISCHE VERLAUFSTABELLE (angepasst auf Fach, Thema, Materialien & WLO-OER!) */}
      <section className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong style={{ fontFamily: 'var(--display)', fontSize: 18 }}>
                📋 Thematischer Verlaufsplan: {fach ? `${fach} – ` : ''}{thema || arrangement.name}
              </strong>
              <span className="status-badge" style={{ borderColor: 'var(--dC)', color: 'var(--dC)' }}>
                {thematicRows ? 'Thematisch angepasst' : 'Vorbelegt aus FMT + Matrix + OER'}
              </span>
            </div>
            <p className="muted" style={{ fontSize: 13.5, margin: '3px 0 0' }}>
              Zeigt die konkrete Anwendung jeder FMT-Methode auf dein Thema – inklusive Teilgruppen-Anpassungen,
              erstellter Materialien und WLO-OER-Links (<strong>mit wwwurl</strong>). Jede Zelle ist anpassbar.
            </p>
          </div>
          <div className="no-print" style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn btn-sm" onClick={() => setEditingTable((s) => !s)}>
              {editingTable ? '✓ Bearbeitung beenden' : '✏ Tabelle direkt bearbeiten'}
            </button>
            {thematicRows && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => onThematicRowsChange(null)}>
                ↺ Zurücksetzen
              </button>
            )}
          </div>
        </div>

        <div className="scroll">
          <table style={{ width: '100%', fontSize: 13.5, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ width: 32 }}>#</th>
                <th style={{ width: '13%' }}>Phase &amp; FMT-Methode</th>
                <th style={{ width: 58 }}>Zeit</th>
                <th style={{ width: '22%', background: 'color-mix(in srgb, var(--dC-soft) 45%, var(--surface))' }}>
                  🧭 Methodisches Vorgehen (am Thema)
                </th>
                <th style={{ width: '15%', background: 'color-mix(in srgb, var(--dA-soft) 55%, var(--surface))' }}>
                  👩‍🏫 {spalten?.lehrende || lehrendeZeile || 'Lehrkraft'}
                </th>
                <th style={{ width: '15%' }}>👥 {spalten?.lernende || 'Lernende'}</th>
                {activeGroups.length > 0 && (
                  <th style={{ width: '18%', background: 'color-mix(in srgb, var(--dB-soft) 45%, var(--surface))' }}>
                    ⚖ Binnendifferenzierung
                  </th>
                )}
                <th style={{ width: '15%' }}>🌐 Material &amp; WLO-OER</th>
              </tr>
            </thead>
            <tbody>
              {effectiveThematicRows.map((tr) => {
                const scRow = scenarioRows.find((r) => r.key === tr.key);
                return (
                  <tr key={tr.key}>
                    <td style={{ fontFamily: 'var(--display)', fontWeight: 700 }}>{tr.orderLabel}</td>
                    <td>
                      <div className="muted" style={{ fontSize: 12 }}>{tr.phaseLabel}</div>
                      <Link to={`/methoden/${tr.methodId}`} style={{ fontFamily: 'var(--display)', fontWeight: 700 }}>
                        {tr.methodName}
                      </Link>
                      {scRow && Object.keys(scRow.subgroupMethods).length > 0 && (
                        <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--dD)' }}>
                          {Object.entries(scRow.subgroupMethods).map(([gid, sm]) => {
                            const g = groups.find((x) => x.id === gid);
                            return (
                              <div key={gid}>
                                🔀 {g?.label.split(' ')[0] || gid}:{' '}
                                <Link to={`/methoden/${sm.methodId}`}>{sm.methodName}</Link>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontFamily: 'var(--display)', fontWeight: 700 }}>{tr.durationMin} min</td>
                    <td style={{ background: 'color-mix(in srgb, var(--dC-soft) 16%, transparent)', fontSize: 12.5 }}>
                      {editingTable ? (
                        <textarea
                          rows={4}
                          style={{ width: '100%', fontSize: 12.5 }}
                          value={tr.methodProcedure}
                          onChange={(e) => updateThematicCell(tr.key, 'methodProcedure', e.target.value)}
                        />
                      ) : (
                        <InlineMarkdown text={tr.methodProcedure} />
                      )}
                    </td>
                    <td style={{ background: 'color-mix(in srgb, var(--dA-soft) 18%, transparent)', fontSize: 12.5 }}>
                      {editingTable ? (
                        <textarea
                          rows={3}
                          style={{ width: '100%', fontSize: 12.5 }}
                          value={tr.teacherAction}
                          onChange={(e) => updateThematicCell(tr.key, 'teacherAction', e.target.value)}
                        />
                      ) : (
                        <InlineMarkdown text={tr.teacherAction} />
                      )}
                    </td>
                    <td>
                      {editingTable ? (
                        <textarea
                          rows={3}
                          style={{ width: '100%', fontSize: 12.5 }}
                          value={tr.learnerAction}
                          onChange={(e) => updateThematicCell(tr.key, 'learnerAction', e.target.value)}
                        />
                      ) : (
                        <InlineMarkdown text={tr.learnerAction} />
                      )}
                    </td>
                    {activeGroups.length > 0 && (
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {activeGroups.map((g) => {
                            const val = tr.groupAdaptations[g.id] || '';
                            return (
                              <div key={g.id} style={{ fontSize: 12.5 }}>
                                <strong style={{ fontFamily: 'var(--display)' }}>
                                  {g.label}
                                  {g.count ? ` (${g.count})` : ''}:
                                </strong>{' '}
                                {editingTable ? (
                                  <textarea
                                    rows={2}
                                    style={{ width: '100%', fontSize: 12, marginTop: 2 }}
                                    value={val}
                                    onChange={(e) => updateThematicGroupCell(tr.key, g.id, e.target.value)}
                                  />
                                ) : val ? (
                                  <InlineMarkdown text={val} />
                                ) : (
                                  '–'
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    )}
                    <td>
                      {editingTable ? (
                        <textarea
                          rows={3}
                          style={{ width: '100%', fontSize: 12.5 }}
                          value={tr.materialsAndOer}
                          onChange={(e) => updateThematicCell(tr.key, 'materialsAndOer', e.target.value)}
                        />
                      ) : (
                        <div style={{ fontSize: 12.5 }}>
                          <InlineMarkdown text={tr.materialsAndOer} />
                        </div>
                      )}
                      {scRow && scRow.generatedMaterials.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                          {scRow.generatedMaterials.map((m) => (
                            <div
                              key={m.id}
                              style={{
                                padding: '5px 7px',
                                borderRadius: 5,
                                background: 'var(--dC-soft)',
                                border: '1px solid var(--dC)',
                                fontSize: 11.5
                              }}
                            >
                              <div style={{ fontWeight: 700, fontFamily: 'var(--display)' }}>📝 {m.title}</div>
                              <div className="no-print" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  style={{ fontSize: 11, padding: '1px 6px' }}
                                  onClick={() => setPreviewModal({ kind: 'material', item: m })}
                                >
                                  👁 Öffnen
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-ghost"
                                  style={{ fontSize: 11, padding: '1px 6px' }}
                                  onClick={() => openMaterialInNewTab(m)}
                                >
                                  ↗ Neuer Tab
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {scRow && scRow.oerResources.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                          {scRow.oerResources.map((o) => {
                            const href = getOerWwwUrl(o);
                            return (
                              <div
                                key={o.id}
                                style={{
                                  padding: '5px 7px',
                                  borderRadius: 5,
                                  background: 'var(--paper)',
                                  border: '1px solid var(--dA)',
                                  fontSize: 11.5
                                }}
                              >
                                <a href={href} target="_blank" rel="noreferrer" style={{ fontWeight: 700 }}>
                                  🌐 {o.title} ↗
                                </a>
                                <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, wordBreak: 'break-all', color: 'var(--ink-2)' }}>
                                  {href}
                                </div>
                                <div className="no-print" style={{ marginTop: 3 }}>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-ghost"
                                    style={{ fontSize: 11, padding: '1px 6px' }}
                                    onClick={() => setPreviewModal({ kind: 'oer', item: o, phaseLabel: `${tr.orderLabel} · ${tr.methodName}` })}
                                  >
                                    👁 Details
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* SECTION B: AUSFORMULIERTER UNTERRICHTSENTWURF (TEXT – EDITIERBAR) */}
      <article className="card" style={{ padding: 24 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            marginBottom: 14,
            paddingBottom: 10,
            borderBottom: '1px solid var(--grid)'
          }}
        >
          <div>
            <span className="status-badge" style={{ marginBottom: 4 }}>
              {elaboration
                ? '✨ Ausformulierter Unterrichtsentwurf (mit Material- & OER-Bezug)'
                : '📋 Strukturierter Textentwurf (druckbereit aus FMT + Kontext + Matrix + OER)'}
            </span>
            <h3 style={{ margin: '4px 0 0', fontSize: 20 }}>
              {thema ? `${fach ? `${fach}: ` : ''}${thema}` : arrangement.name}
            </h3>
          </div>
          <div className="no-print" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                if (!editingText && !elaboration) {
                  onElaborationChange(structuredTextDraft);
                }
                setEditingText((s) => !s);
              }}
            >
              {editingText ? '👁 Leseansicht' : '✏ Entwurfstext bearbeiten'}
            </button>
            {elaboration && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  onElaborationChange(null);
                  setEditingText(false);
                }}
              >
                ↺ Auf Struktur-Entwurf zurücksetzen
              </button>
            )}
          </div>
        </div>

        {editingText ? (
          <textarea
            rows={22}
            style={{ width: '100%', fontFamily: 'var(--mono)', fontSize: 13.5 }}
            value={effectiveNarrativeText}
            onChange={(e) => onElaborationChange(e.target.value)}
          />
        ) : (
          <SimpleMarkdown content={effectiveNarrativeText} />
        )}

        {/* Always-visible attached generated materials directory (clickable modal + new tab + isolated PDF print!) */}
        {generatedMaterials.length > 0 && (
          <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--grid)' }}>
            <h4 style={{ margin: '0 0 8px', fontFamily: 'var(--display)', fontSize: 15.5 }}>
              📝 Erstellte Unterrichtsmaterialien ({generatedMaterials.length}) — im PDF-Druck jeweils auf eigener Seite
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {generatedMaterials.map((m) => {
                const row = scenarioRows.find((r) => r.key === m.stepKey);
                return (
                  <div
                    key={m.id}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      background: 'var(--paper)',
                      border: '1px solid var(--dC)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 10,
                      flexWrap: 'wrap'
                    }}
                  >
                    <div>
                      <strong style={{ fontFamily: 'var(--display)', fontSize: 14.5 }}>{m.title}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>
                        Zugeordnete Phase: {row ? `${row.orderLabel} · ${row.methodName}` : m.stepKey}
                      </div>
                    </div>
                    <div className="no-print" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={() => setPreviewModal({ kind: 'material', item: m })}
                      >
                        👁 Im Fenster öffnen
                      </button>
                      <button type="button" className="btn btn-sm" onClick={() => openMaterialInNewTab(m)}>
                        ↗ In neuem Tab
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => printHtmlDocument(exportMarkdownToPrintableHtml(m.title, m.content))}
                      >
                        🖨 Isoliert drucken
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Always-visible verified WLO-OER & FMT source directories */}
        {totalAttachedOer > 0 && (
          <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--grid)' }}>
            <h4 style={{ margin: '0 0 8px', fontFamily: 'var(--display)', fontSize: 15.5 }}>
              🌐 Verknüpfte WLO / OER-Ressourcen (inkl. wwwurl) ({totalAttachedOer})
            </h4>
            <ul style={{ paddingLeft: 18, margin: 0, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {scenarioRows.flatMap((r) =>
                r.oerResources.map((o) => {
                  const href = getOerWwwUrl(o);
                  return (
                    <li key={`${r.key}-${o.id}`}>
                      <strong>{r.orderLabel} ({r.methodName}):</strong>{' '}
                      <a href={href} target="_blank" rel="noreferrer">
                        {o.title}
                      </a>{' '}
                      — <code style={{ fontSize: 12 }}>{href}</code>
                      {o.license ? <span className="muted"> ({o.license})</span> : null}
                      {o.note ? <span className="muted"> · {o.note}</span> : null}
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        )}

        {usedBlocks.length > 0 && (
          <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--grid)' }}>
            <h4 style={{ margin: '0 0 8px', fontFamily: 'var(--display)', fontSize: 15.5 }}>
              Verlinkte FMT-Methoden &amp; verifiziertes Quellenverzeichnis ({usedBlocks.length})
            </h4>
            <ul style={{ paddingLeft: 18, margin: 0, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {usedBlocks.map((b) => (
                <li key={b.kennung}>
                  <Link to={`/methoden/${b.kennung}`} style={{ fontWeight: 700 }}>
                    {b.name}
                  </Link>
                  {b.quellen?.length ? (
                    <>
                      {' — '}
                      {b.quellen.map((q, qi) => (
                        <span key={qi}>
                          {qi > 0 && ' · '}
                          {q.url ? (
                            <a href={q.url} target="_blank" rel="noreferrer">
                              {q.titel}
                            </a>
                          ) : (
                            q.titel
                          )}
                        </span>
                      ))}
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* SECTION C: MASCHINENLESBARE REPRÄSENTATION */}
        <details className="no-print" style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--grid)' }}>
          <summary style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 15, cursor: 'pointer', color: 'var(--dA)' }}>
            {'{}'} Maschinenlesbare Repräsentation (IMS-LD NeutralLearningScenario &amp; FMT JSON-LD)
          </summary>
          <p className="muted" style={{ fontSize: 13, margin: '6px 0 8px' }}>
            Enthält auch alle generierten Inhalte (<code>generated_content</code>: Entwurfstext, thematische Tabelle, erstellte
            Materialien &amp; Matrix-Ergebnisse). Wird im HTML-Handout, Markdown, <code>.imscc</code> und <code>.json</code> mitexportiert.
          </p>
          <pre style={{ maxHeight: 320 }}>{machineReadablePreview}</pre>
        </details>
      </article>

      {/* Large scrollable closable Modal for Generated Materials & WLO-OER Details */}
      {previewModal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setPreviewModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 27, 38, 0.58)',
            zIndex: 120,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20
          }}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(960px, 95vw)',
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid var(--grid)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
                background: 'var(--paper)'
              }}
            >
              <div>
                <span className="status-badge">
                  {previewModal.kind === 'material' ? '📝 Erstelltes Unterrichtsmaterial' : `🌐 WLO-OER · ${previewModal.phaseLabel}`}
                </span>
                <h3 style={{ margin: '4px 0 0', fontSize: 18 }}>
                  {previewModal.kind === 'material' ? previewModal.item.title : previewModal.item.title}
                </h3>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {previewModal.kind === 'material' ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() =>
                        printHtmlDocument(exportMarkdownToPrintableHtml(previewModal.item.title, previewModal.item.content))
                      }
                    >
                      🖨 Drucken / PDF
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => openMaterialInNewTab(previewModal.item)}>
                      ↗ Neuer Tab
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => downloadFile('fmt-material.md', previewModal.item.content, 'text/markdown;charset=utf-8')}
                    >
                      ⬇ .md
                    </button>
                  </>
                ) : (
                  <a
                    href={getOerWwwUrl(previewModal.item)}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-sm btn-primary"
                  >
                    ↗ Ressource öffnen (wwwurl)
                  </a>
                )}
                <button type="button" className="btn btn-sm" onClick={() => setPreviewModal(null)}>
                  ✕ Schließen
                </button>
              </div>
            </div>

            <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
              {previewModal.kind === 'material' ? (
                <SimpleMarkdown content={previewModal.item.content} />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {wloPreviewPath(previewModal.item.previewUrl) && (
                    <img
                      src={wloPreviewPath(previewModal.item.previewUrl)!}
                      alt={previewModal.item.title}
                      style={{ maxHeight: 260, width: 'auto', objectFit: 'contain', borderRadius: 6, border: '1px solid var(--grid)' }}
                    />
                  )}
                  <div>
                    <strong>Direkt-URL (wwwurl):</strong>{' '}
                    <a href={getOerWwwUrl(previewModal.item)} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>
                      {getOerWwwUrl(previewModal.item)}
                    </a>
                  </div>
                  {previewModal.item.wloRenderUrl && (
                    <div>
                      <strong>WLO-Katalogeintrag:</strong>{' '}
                      <a href={previewModal.item.wloRenderUrl} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>
                        {previewModal.item.wloRenderUrl}
                      </a>
                    </div>
                  )}
                  {previewModal.item.resourceType && (
                    <div><strong>Medientyp:</strong> {previewModal.item.resourceType}</div>
                  )}
                  {previewModal.item.license && (
                    <div><strong>Lizenz:</strong> {previewModal.item.license}</div>
                  )}
                  {previewModal.item.note && (
                    <div><strong>Einsatzhinweis für diese Phase:</strong> {previewModal.item.note}</div>
                  )}
                  {previewModal.item.description && (
                    <div>
                      <strong>Beschreibung:</strong>
                      <p style={{ margin: '4px 0 0' }}>{previewModal.item.description}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
