import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Arrangement, Baustein, ValidationResult } from '@fmt/core';
import { SimpleMarkdown } from './SimpleMarkdown.js';
import { WloOerCards } from './WloOerCards.js';
import {
  exportArrangementHtmlHandout,
  exportArrangementMarkdown,
  exportArrangementWordDoc,
  exportMarkdownToPrintableHtml,
  importArrangementJson
} from '../planner/arrangementOps.js';
import {
  buildNeutralLearningScenario,
  detectMaterialTypeForBlock,
  MATERIAL_TYPES,
  type LearnerGroup,
  type OerResource,
  type ScenarioPhaseRow,
  type StepDiffSuggestion
} from '../planner/scenarioModel.js';
import { exportScenarioToImscc, exportScenarioToMoodleXml } from '../planner/lmsExport.js';
import { printHtmlDocument } from '../planner/scenarioStorage.js';

export type StudioTab = 'oer' | 'diff' | 'material';

interface Props {
  mode: 'resources' | 'export';
  activeResourceTab: StudioTab;
  onResourceTabChange: (tab: StudioTab) => void;
  focusedStepKey: string | null;
  arrangement: Arrangement;
  onArrangementChange: (next: Arrangement) => void;
  blocksById: Map<string, Baustein>;
  usedBlocks: Baustein[];
  validation: ValidationResult;
  scenarioRows: ScenarioPhaseRow[];
  labelOf: (schemeId: string, code: string) => string;
  fach: string;
  thema: string;
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
  oerByStep: Record<string, OerResource[]>;
  onOerByStepChange: (next: Record<string, OerResource[]>) => void;
  elaboration: string | null;
  onElaborationChange: (next: string | null) => void;
  onPrintPdf: () => void;
  onSaveBrowser: () => void;
  onDownloadProject: () => void;
  getTimelineSvg: () => string | null;
  byokHeaders: () => Record<string, string>;
  llmAvailable: boolean;
}

export function ScenarioStudioPanel({
  mode,
  activeResourceTab,
  onResourceTabChange,
  focusedStepKey,
  arrangement,
  onArrangementChange,
  blocksById,
  usedBlocks,
  validation,
  scenarioRows,
  labelOf,
  fach,
  thema,
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
  oerByStep,
  onOerByStepChange,
  elaboration,
  onElaborationChange,
  onPrintPdf,
  onSaveBrowser,
  onDownloadProject,
  getTimelineSvg,
  byokHeaders,
  llmAvailable
}: Props) {
  // Full AI elaboration state
  const [busyElab, setBusyElab] = useState(false);
  const [elabError, setElabError] = useState<string | null>(null);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  // Differentiation state
  const [newGroupLabel, setNewGroupLabel] = useState('');
  const [newGroupProfile, setNewGroupProfile] = useState('');
  const [busyDiff, setBusyDiff] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  // Material generator state
  const [matStepKey, setMatStepKey] = useState<string>(scenarioRows[0]?.key || 'step-0');
  const [matType, setMatType] = useState<string>('auto');
  const [matNotes, setMatNotes] = useState<string>('');
  const [busyMat, setBusyMat] = useState(false);
  const [matError, setMatError] = useState<string | null>(null);
  const [generatedMaterial, setGeneratedMaterial] = useState<{ title: string; content: string } | null>(null);

  useEffect(() => {
    if (focusedStepKey) setMatStepKey(focusedStepKey);
  }, [focusedStepKey]);

  useEffect(() => {
    if (!scenarioRows.some((r) => r.key === matStepKey) && scenarioRows[0]) {
      setMatStepKey(scenarioRows[0].key);
    }
  }, [scenarioRows, matStepKey]);

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

  const buildScenario = () =>
    buildNeutralLearningScenario(arrangement, scenarioRows, groups, {
      fach,
      thema,
      totalDurationMin: validation.dauerMin,
      labelOf
    });

  const exportOpts = () => ({
    fach,
    thema,
    lernziele,
    problemstellung,
    kiAusarbeitung: elaboration,
    timelineSvg: getTimelineSvg(),
    scenarioRows
  });

  const runAiElaborate = async () => {
    setBusyElab(true);
    setElabError(null);
    try {
      const res = await fetch('/api/v1/assistant/elaborate', {
        method: 'POST',
        headers: byokHeaders(),
        body: JSON.stringify({
          arrangement,
          thema,
          fach,
          lernziele: lernziele.trim() || undefined,
          problemstellung: problemstellung.trim() || undefined,
          hinweise: hinweise.trim() || undefined,
          differenzierung: groups.filter((g) => g.active).map((g) => ({ gruppe: g.label, profil: g.profile })),
          oerRessourcen: Object.values(oerByStep).flat().map((o) => ({ titel: o.title, url: o.url }))
        })
      });
      const json = await res.json();
      if (!res.ok) {
        setElabError(json.fehler || 'Ausgestaltung fehlgeschlagen.');
        return;
      }
      onElaborationChange(String(json.ausarbeitung));
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
      const res = await fetch('/api/v1/assistant/differentiate', {
        method: 'POST',
        headers: byokHeaders(),
        body: JSON.stringify({
          fach,
          thema,
          bildungsstufe: arrangement.kontext?.bildungsstufe
            ? labelOf('bildungsstufe', arrangement.kontext.bildungsstufe)
            : 'Sekundarstufe I',
          hinweise: hinweise.trim() || undefined,
          gruppen: activeGroups.map((g) => ({ id: g.id, label: g.label, profile: g.profile })),
          phases: scenarioRows.map((r) => ({
            key: r.key,
            phaseLabel: r.phaseLabel,
            methodId: r.methodId,
            durationMin: r.durationMin
          }))
        })
      });
      const json = await res.json();
      if (!res.ok) {
        setDiffError(json.fehler || 'KI-Differenzierung fehlgeschlagen.');
        return;
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

  const runMaterialGen = async () => {
    const row = scenarioRows.find((r) => r.key === matStepKey);
    if (!row) return;
    setBusyMat(true);
    setMatError(null);
    const effType = matType === 'auto' ? detectMaterialTypeForBlock(row.block) : matType;
    try {
      const res = await fetch('/api/v1/assistant/material', {
        method: 'POST',
        headers: byokHeaders(),
        body: JSON.stringify({
          baustein: row.methodId,
          phaseLabel: row.phaseLabel,
          dauerMin: row.durationMin,
          fach,
          thema,
          bildungsstufe: arrangement.kontext?.bildungsstufe
            ? labelOf('bildungsstufe', arrangement.kontext.bildungsstufe)
            : 'Sekundarstufe I',
          materialTyp: effType,
          gruppen: groups.filter((g) => g.active).map((g) => ({ label: g.label, profile: g.profile })),
          hinweise: matNotes.trim() || hinweise.trim() || undefined
        })
      });
      const json = await res.json();
      if (!res.ok) {
        setMatError(json.fehler || 'Materialgenerierung fehlgeschlagen.');
        return;
      }
      setGeneratedMaterial({
        title: `${row.methodName} – ${MATERIAL_TYPES.find((t) => t.id === effType)?.label || effType}`,
        content: String(json.material)
      });
    } catch (e) {
      setMatError(e instanceof Error ? e.message : 'Netzwerkfehler');
    } finally {
      setBusyMat(false);
    }
  };

  const totalAttachedOer = Object.values(oerByStep).reduce((s, list) => s + list.length, 0);
  const selectedMatRow = scenarioRows.find((r) => r.key === matStepKey);
  const autoDetectedType = detectMaterialTypeForBlock(selectedMatRow?.block);

  // =========================================================================
  // MODE 1 (STEP 3): OER-KACHELN, BINNENDIFFERENZIERUNG & MATERIALGENERATOR
  // =========================================================================
  if (mode === 'resources') {
    return (
      <div className="card" style={{ padding: 20 }}>
        <div
          className="no-print"
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            borderBottom: '1px solid var(--grid)',
            paddingBottom: 12,
            marginBottom: 16
          }}
        >
          <button
            type="button"
            className={`btn btn-sm ${activeResourceTab === 'oer' ? 'btn-primary' : ''}`}
            onClick={() => onResourceTabChange('oer')}
          >
            🌐 WLO / OER-Kacheln {totalAttachedOer > 0 ? `(${totalAttachedOer} verknüpft)` : ''}
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeResourceTab === 'diff' ? 'btn-primary' : ''}`}
            onClick={() => onResourceTabChange('diff')}
          >
            ⚖ Binnendifferenzierung ({groups.filter((g) => g.active).length} Gruppen)
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeResourceTab === 'material' ? 'btn-primary' : ''}`}
            onClick={() => onResourceTabChange('material')}
          >
            📝 KI-Materialgenerator (Arbeitsblatt / Quiz / Karten)
          </button>
        </div>

        {activeResourceTab === 'oer' && (
          <WloOerCards
            scenarioRows={scenarioRows}
            initialStepKey={focusedStepKey || scenarioRows[0]?.key || 'step-0'}
            fach={fach}
            thema={thema}
            bildungsstufe={arrangement.kontext?.bildungsstufe || ''}
            oerByStep={oerByStep}
            onOerByStepChange={onOerByStepChange}
          />
        )}

        {activeResourceTab === 'diff' && (
          <div>
            <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>
              Jede aktive Teilgruppe erscheint als eigene <strong>Spalte in der Rollen-Verlaufstabelle</strong> (Schritt 2), im PDF-Entwurf und im LMS-Export.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10, marginBottom: 14 }}>
              {groups.map((g) => (
                <div
                  key={g.id}
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    background: g.active ? 'var(--paper)' : 'transparent',
                    border: `1px solid ${g.active ? 'var(--dA)' : 'var(--grid)'}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 8
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', flex: 1 }}>
                    <input
                      type="checkbox"
                      checked={g.active}
                      onChange={(e) =>
                        onGroupsChange(groups.map((x) => (x.id === g.id ? { ...x, active: e.target.checked } : x)))
                      }
                    />
                    <span>
                      <strong style={{ fontFamily: 'var(--display)' }}>{g.label}</strong>
                      <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                        {g.profile}
                      </div>
                    </span>
                  </label>
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
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              <input
                type="text"
                style={{ flex: '1 1 180px' }}
                placeholder="Eigene Teilgruppe (z. B. DaZ / LRS / ADHS)"
                value={newGroupLabel}
                onChange={(e) => setNewGroupLabel(e.target.value)}
              />
              <input
                type="text"
                style={{ flex: '2 1 260px' }}
                placeholder="Förderbedarf / Unterstützungsfokus"
                value={newGroupProfile}
                onChange={(e) => setNewGroupProfile(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  if (!newGroupLabel.trim()) return;
                  onGroupsChange([
                    ...groups,
                    {
                      id: `custom-${Date.now()}`,
                      label: newGroupLabel.trim(),
                      profile: newGroupProfile.trim() || 'Individuelle Unterstützung',
                      focus: 'custom',
                      active: true
                    }
                  ]);
                  setNewGroupLabel('');
                  setNewGroupProfile('');
                }}
              >
                + Teilgruppe hinzufügen
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busyDiff || !llmAvailable}
                onClick={runAiDifferentiate}
              >
                ✨ {busyDiff ? 'Generiere Differenzierung…' : 'Themenspezifische Differenzierung mit KI erzeugen'}
              </button>
              {Object.keys(aiDiffByStep).length > 0 && (
                <button type="button" className="btn btn-sm" onClick={() => onAiDiffChange({})}>
                  Auf FMT-Regelhinweise zurücksetzen
                </button>
              )}
            </div>

            {diffError && (
              <div className="msgs">
                <li className="err">{diffError}</li>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 10 }}>
              {scenarioRows.map((r) => (
                <div key={r.key} style={{ padding: 12, borderRadius: 8, background: 'var(--paper)', border: '1px solid var(--grid)' }}>
                  <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14.5, marginBottom: 6 }}>
                    {r.orderLabel} · {r.methodName} ({r.durationMin} min)
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                    {r.differentiation.map((d, di) => (
                      <li key={di} style={{ marginBottom: 4 }}>
                        <strong>{d.groupLabel}:</strong> {d.measure}{' '}
                        <span className="muted" style={{ fontSize: 11.5 }}>
                          [{d.source === 'ki' ? 'KI' : 'FMT'}]
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeResourceTab === 'material' && (
          <div>
            <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>
              Erstellt druckfertiges Unterrichtsmaterial (Arbeitsblatt, Quiz, Checkliste, Karten) passend zur gewählten FMT-Methode und deinen Lerngruppen.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginBottom: 10 }}>
              <label style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
                Phase / FMT-Methode
                <select value={matStepKey} onChange={(e) => setMatStepKey(e.target.value)}>
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
              Zusatzwunsch fürs Material (optional)
              <input
                type="text"
                value={matNotes}
                onChange={(e) => setMatNotes(e.target.value)}
                placeholder="z. B. 4 gestufte Aufgaben mit Alltagsbezug, inkl. Selbstkontroll-Lösung"
              />
            </label>

            <button
              type="button"
              className="btn btn-primary"
              disabled={busyMat || !llmAvailable || !selectedMatRow}
              onClick={runMaterialGen}
            >
              📝 {busyMat ? 'Generiere Material…' : 'Unterrichtsmaterial generieren (KI)'}
            </button>

            {matError && (
              <div className="msgs" style={{ marginTop: 8 }}>
                <li className="err">{matError}</li>
              </div>
            )}

            {generatedMaterial && (
              <div
                style={{
                  marginTop: 14,
                  padding: 18,
                  background: 'var(--paper)',
                  borderRadius: 8,
                  border: '1px solid var(--rule)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  <strong style={{ fontFamily: 'var(--display)', fontSize: 16 }}>{generatedMaterial.title}</strong>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() =>
                        printHtmlDocument(exportMarkdownToPrintableHtml(generatedMaterial.title, generatedMaterial.content))
                      }
                    >
                      🖨 Als PDF drucken
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() =>
                        downloadFile(
                          'fmt-material.html',
                          exportMarkdownToPrintableHtml(generatedMaterial.title, generatedMaterial.content),
                          'text/html;charset=utf-8'
                        )
                      }
                    >
                      ⬇ Handout (.html)
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => downloadFile('fmt-material.md', generatedMaterial.content, 'text/markdown;charset=utf-8')}
                    >
                      ⬇ Markdown (.md)
                    </button>
                  </div>
                </div>
                <SimpleMarkdown content={generatedMaterial.content} />
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // MODE 2 (STEP 4): VOLLBREITER UNTERRICHTSENTWURF, QUELLEN & EXPORTE
  // =========================================================================
  const standardMarkdown = exportArrangementMarkdown(arrangement, blocksById, validation, exportOpts());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Prominent Action & Export Ribbon */}
      <div className="card no-print" style={{ padding: 20, borderTop: '3px solid var(--dA)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 23 }}>Fertiger Unterrichtsentwurf &amp; Export</h2>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 14.5 }}>
              {fach || 'Fach'} · {thema || arrangement.name} · {validation.dauerMin} min · {usedBlocks.length} verlinkte FMT-Methoden
              {totalAttachedOer > 0 ? ` · ${totalAttachedOer} WLO-OER` : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" disabled={busyElab} onClick={runAiElaborate}>
              ✨ {busyElab ? 'Formuliere Entwurf…' : elaboration ? 'KI-Entwurf neu ausformulieren' : 'Vollständigen Entwurf ausformulieren (KI)'}
            </button>
            <button type="button" className="btn btn-primary" onClick={onPrintPdf}>
              🖨 Als PDF drucken / speichern
            </button>
          </div>
        </div>

        {/* Quick Metadata inline polish */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 14 }}>
          <label style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
            Fach
            <input type="text" value={fach} onChange={(e) => onFachChange(e.target.value)} />
          </label>
          <label style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
            Thema
            <input type="text" value={thema} onChange={(e) => onThemaChange(e.target.value)} />
          </label>
          <label style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
            Zusatzhinweise für KI-Entwurf
            <input
              type="text"
              value={hinweise}
              onChange={(e) => onHinweiseChange(e.target.value)}
              placeholder="z. B. Fokus auf Alltagsbeispiele, Zeitpuffer einplanen"
            />
          </label>
        </div>

        {/* Grouped Export Buttons */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--grid)' }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() =>
              downloadFile('fmt-unterrichtsentwurf.doc', exportArrangementWordDoc(arrangement, blocksById, validation, exportOpts()), 'application/msword;charset=utf-8')
            }
          >
            ⬇ Word / LibreOffice (.doc)
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() =>
              downloadFile('fmt-unterrichtsentwurf.html', exportArrangementHtmlHandout(arrangement, blocksById, validation, exportOpts()), 'text/html;charset=utf-8')
            }
          >
            ⬇ Handout (.html)
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => downloadFile('fmt-unterrichtsentwurf.md', standardMarkdown, 'text/markdown;charset=utf-8')}
          >
            ⬇ Markdown (.md)
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
              const sc = buildScenario();
              downloadFile('fmt-imsld-szenario.json', JSON.stringify(sc, null, 2), 'application/json;charset=utf-8');
            }}
          >
            ⬇ IMS-LD (.json)
          </button>
          <button type="button" className="btn btn-sm" onClick={onSaveBrowser}>
            💾 Im Browser speichern
          </button>
          <button type="button" className="btn btn-sm" onClick={onDownloadProject}>
            ⬇ Projektdatei (.fmt.json)
          </button>
        </div>

        {elabError && (
          <div className="msgs" style={{ marginTop: 10 }}>
            <li className="err">{elabError}</li>
          </div>
        )}
      </div>

      {/* FULL-WIDTH Prominent Draft Preview */}
      <article className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--grid)' }}>
          <div>
            <span className="status-badge" style={{ marginBottom: 4 }}>
              {elaboration ? '✨ KI-ausformulierter Unterrichtsentwurf' : '📋 Strukturierter FMT-Entwurf (sofort druckbereit)'}
            </span>
            <h3 style={{ margin: '4px 0 0', fontSize: 20 }}>
              {thema ? `${fach ? `${fach}: ` : ''}${thema}` : arrangement.name}
            </h3>
          </div>
          {!elaboration && (
            <span className="muted" style={{ fontSize: 13 }}>
              Tipp: Klicke oben auf <strong>„Vollständigen Entwurf ausformulieren (KI)“</strong> für ausformulierte Impulse &amp; Übergänge.
            </span>
          )}
        </div>

        {elaboration ? (
          <SimpleMarkdown content={elaboration} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {(lernziele.trim() || problemstellung.trim()) && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                {lernziele.trim() && (
                  <div style={{ padding: 12, borderRadius: 6, background: 'var(--paper)', border: '1px solid var(--grid)' }}>
                    <strong style={{ fontFamily: 'var(--display)' }}>Lernziele</strong>
                    <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap', fontSize: 14 }}>{lernziele}</p>
                  </div>
                )}
                {problemstellung.trim() && (
                  <div style={{ padding: 12, borderRadius: 6, background: 'var(--paper)', border: '1px solid var(--grid)' }}>
                    <strong style={{ fontFamily: 'var(--display)' }}>Ausgangslage / Problemstellung</strong>
                    <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap', fontSize: 14 }}>{problemstellung}</p>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {scenarioRows.map((r) => (
                <div
                  key={r.key}
                  style={{
                    padding: 14,
                    borderRadius: 8,
                    background: 'var(--paper)',
                    border: '1px solid var(--grid)',
                    borderLeft: `4px solid ${r.isNestedSlot ? 'var(--dD)' : 'var(--dA)'}`
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div>
                      <strong style={{ fontFamily: 'var(--display)', fontSize: 16 }}>
                        {r.orderLabel} · {r.phaseLabel}:{' '}
                        <Link to={`/methoden/${r.methodId}`}>{r.methodName}</Link>
                      </strong>
                    </div>
                    <span className="chip">{r.durationMin} min</span>
                  </div>
                  {r.block?.kurzbeschreibung && (
                    <p style={{ margin: '6px 0', fontSize: 14 }}>{r.block.kurzbeschreibung}</p>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, fontSize: 13.5, marginTop: 6 }}>
                    <div>
                      <strong>👩‍🏫 Lehrkraft:</strong> {r.teacherRole}
                    </div>
                    <div>
                      <strong>👥 Lernende:</strong> {r.learnerRole}
                    </div>
                  </div>
                  {r.block?.durchfuehrung?.length ? (
                    <ol style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 13.5 }}>
                      {r.block.durchfuehrung.map((step, si) => (
                        <li key={si}>{step}</li>
                      ))}
                    </ol>
                  ) : null}
                  {r.differentiation.length > 0 && (
                    <div style={{ marginTop: 8, fontSize: 13 }}>
                      <strong>⚖ Differenzierung:</strong>{' '}
                      {r.differentiation.map((d) => `${d.groupLabel}: ${d.measure}`).join(' · ')}
                    </div>
                  )}
                  {r.oerResources.length > 0 && (
                    <div style={{ marginTop: 6, fontSize: 13 }}>
                      <strong>🌐 OER:</strong>{' '}
                      {r.oerResources.map((o, oi) => (
                        <span key={o.id}>
                          {oi > 0 && ' · '}
                          <a href={o.url} target="_blank" rel="noreferrer">
                            {o.title}
                          </a>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Always-visible verified source list for all used blocks */}
        {usedBlocks.length > 0 && (
          <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--grid)' }}>
            <h4 style={{ margin: '0 0 8px', fontFamily: 'var(--display)', fontSize: 15.5 }}>
              Verlinkte FMT-Methoden &amp; verifiziertes Quellenverzeichnis ({usedBlocks.length})
            </h4>
            <ul style={{ paddingLeft: 18, margin: 0, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {usedBlocks.map((b) => (
                <li key={b.kennung}>
                  <Link to={`/methoden/${b.kennung}`}>
                    <strong>{b.name}</strong>
                  </Link>
                  :{' '}
                  {(b.quellen || []).map((q, qi) => (
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
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Technical JSON-LD drawer cleanly tucked at the bottom */}
        <details className="no-print" style={{ marginTop: 18 }}>
          <summary style={{ fontFamily: 'var(--display)', fontWeight: 600, cursor: 'pointer', fontSize: 13.5 }}>
            Technischer Export / Import (FMT JSON-LD)
          </summary>
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-sm"
              style={{ marginBottom: 8 }}
              onClick={() => downloadFile('fmt-arrangement.jsonld', JSON.stringify(arrangement, null, 2), 'application/ld+json')}
            >
              ⬇ FMT JSON-LD herunterladen
            </button>
            <pre style={{ maxHeight: 200 }}>{JSON.stringify(arrangement, null, 2)}</pre>
            <textarea
              rows={3}
              style={{ width: '100%', marginTop: 8 }}
              placeholder="Eigenes FMT-Arrangement (JSON-LD) hier einfügen…"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            {importError && <p style={{ color: 'var(--err)', fontSize: 13.5 }}>{importError}</p>}
            <button
              type="button"
              className="btn btn-sm"
              style={{ marginTop: 6 }}
              onClick={() => {
                const res = importArrangementJson(importText);
                if (!res.ok) setImportError(res.fehler);
                else {
                  setImportError(null);
                  onArrangementChange(res.arrangement);
                  setImportText('');
                }
              }}
            >
              JSON-LD importieren
            </button>
          </div>
        </details>
      </article>
    </div>
  );
}
