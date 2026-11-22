import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Arrangement, Baustein, ValidationResult } from '@fmt/core';
import { SimpleMarkdown } from './SimpleMarkdown.js';
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

export type StudioTab = 'export' | 'diff' | 'oer' | 'material';

interface Props {
  activeTab: StudioTab;
  onTabChange: (tab: StudioTab) => void;
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
  getTimelineSvg: () => string | null;
  byokHeaders: () => Record<string, string>;
  llmAvailable: boolean;
}

export function ScenarioStudioPanel({
  activeTab,
  onTabChange,
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

  // WLO OER search state
  const [oerTargetStep, setOerTargetStep] = useState<string>(scenarioRows[0]?.key || 'step-0');
  const [oerQuery, setOerQuery] = useState<string>(thema);
  const [busyOer, setBusyOer] = useState(false);
  const [oerError, setOerError] = useState<string | null>(null);
  const [oerResults, setOerResults] = useState<OerResource[]>([]);

  // Material generator state
  const [matStepKey, setMatStepKey] = useState<string>(scenarioRows[0]?.key || 'step-0');
  const [matType, setMatType] = useState<string>('auto');
  const [matNotes, setMatNotes] = useState<string>('');
  const [busyMat, setBusyMat] = useState(false);
  const [matError, setMatError] = useState<string | null>(null);
  const [generatedMaterial, setGeneratedMaterial] = useState<{ title: string; content: string } | null>(null);

  useEffect(() => {
    if (focusedStepKey) {
      setOerTargetStep(focusedStepKey);
      setMatStepKey(focusedStepKey);
    }
  }, [focusedStepKey]);

  useEffect(() => {
    if (!scenarioRows.some((r) => r.key === oerTargetStep) && scenarioRows[0]) {
      setOerTargetStep(scenarioRows[0].key);
    }
    if (!scenarioRows.some((r) => r.key === matStepKey) && scenarioRows[0]) {
      setMatStepKey(scenarioRows[0].key);
    }
  }, [scenarioRows, oerTargetStep, matStepKey]);

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

  const runWloSearch = async () => {
    setBusyOer(true);
    setOerError(null);
    try {
      const res = await fetch('/api/v1/oer/wlo-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: oerQuery.trim() || thema,
          fach,
          bildungsstufe: arrangement.kontext?.bildungsstufe || '',
          maxItems: 8
        })
      });
      const json = await res.json();
      if (!res.ok) {
        setOerError(json.fehler || 'WLO-Suche fehlgeschlagen.');
        return;
      }
      setOerResults((json.ergebnisse || []) as OerResource[]);
    } catch (e) {
      setOerError(e instanceof Error ? e.message : 'Netzwerkfehler bei WLO-Suche');
    } finally {
      setBusyOer(false);
    }
  };

  const attachOer = (stepKey: string, item: OerResource) => {
    const existing = oerByStep[stepKey] || [];
    if (existing.some((x) => x.url === item.url)) return;
    onOerByStepChange({ ...oerByStep, [stepKey]: [...existing, item] });
  };

  const detachOer = (stepKey: string, url: string) => {
    const existing = oerByStep[stepKey] || [];
    onOerByStepChange({ ...oerByStep, [stepKey]: existing.filter((x) => x.url !== url) });
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

  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <h2 style={{ fontSize: 22, margin: 0 }}>4. Szenario-Studio: Entwurf, Differenzierung, OER &amp; LMS-Export</h2>
      </div>

      {/* Shared Subject / Topic / Notes bar */}
      <div className="no-print" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <label style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
          Fach
          <input type="text" value={fach} onChange={(e) => onFachChange(e.target.value)} />
        </label>
        <label style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
          Thema
          <input type="text" value={thema} onChange={(e) => onThemaChange(e.target.value)} />
        </label>
      </div>
      <label
        className="no-print"
        style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 14, display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}
      >
        Zusätzliche Hinweise (Lerngruppe, Schwerpunkt, Differenzierungsbedarf)
        <input
          type="text"
          value={hinweise}
          onChange={(e) => onHinweiseChange(e.target.value)}
          placeholder="z. B. heterogene 7. Klasse, 2 Sprachanfänger, Fokus auf Alltagsbeispiele"
        />
      </label>

      {/* Studio Tabs */}
      <div className="no-print" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid var(--grid)', paddingBottom: 10, marginBottom: 14 }}>
        <button
          type="button"
          className={`btn btn-sm ${activeTab === 'export' ? 'btn-primary' : ''}`}
          onClick={() => onTabChange('export')}
        >
          📄 Unterrichtsentwurf &amp; LMS-Exporte
        </button>
        <button
          type="button"
          className={`btn btn-sm ${activeTab === 'diff' ? 'btn-primary' : ''}`}
          onClick={() => onTabChange('diff')}
        >
          ⚖ Binnendifferenzierung ({groups.filter((g) => g.active).length})
        </button>
        <button
          type="button"
          className={`btn btn-sm ${activeTab === 'oer' ? 'btn-primary' : ''}`}
          onClick={() => onTabChange('oer')}
        >
          🌐 WLO / OER-Suche {totalAttachedOer > 0 ? `(${totalAttachedOer})` : ''}
        </button>
        <button
          type="button"
          className={`btn btn-sm ${activeTab === 'material' ? 'btn-primary' : ''}`}
          onClick={() => onTabChange('material')}
        >
          📝 Materialgenerator
        </button>
      </div>

      {/* TAB 1: EXPORT & FULL AI LESSON DESCRIPTION */}
      {activeTab === 'export' && (
        <div>
          <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>
            Exportiert dein vollständiges Lehr- und Lernszenario inkl. IMS-LD-Verlaufstabelle, verlinkter FMT-Methoden ({usedBlocks.length}),
            Binnendifferenzierung, WLO-OER-Ressourcen und verifizierter Quellen – direkt nutzbar in Moodle, ILIAS, Canvas oder als Handout.
          </p>

          <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <button type="button" className="btn btn-primary" disabled={busyElab} onClick={runAiElaborate}>
              ✨ {busyElab ? 'Erstelle Unterrichtsentwurf…' : 'Gesamten Unterrichtsentwurf ausformulieren (KI)'}
            </button>
          </div>

          <div className="no-print" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              title="Saubere A4-Druckansicht mit Zeitband, Verlaufstabelle, Differenzierung & Quellen – direkt als PDF speicherbar"
              onClick={onPrintPdf}
            >
              🖨 Als PDF drucken / speichern
            </button>
            <button
              type="button"
              className="btn btn-sm"
              title="Öffnet direkt bearbeitbar in Microsoft Word & LibreOffice Writer"
              onClick={() =>
                downloadFile(
                  'fmt-unterrichtsentwurf.doc',
                  exportArrangementWordDoc(arrangement, blocksById, validation, {
                    fach,
                    thema,
                    kiAusarbeitung: elaboration,
                    scenarioRows
                  }),
                  'application/msword;charset=utf-8'
                )
              }
            >
              ⬇ Word / LibreOffice (.doc)
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                downloadFile(
                  'fmt-unterrichtsentwurf.html',
                  exportArrangementHtmlHandout(arrangement, blocksById, validation, {
                    fach,
                    thema,
                    kiAusarbeitung: elaboration,
                    timelineSvg: getTimelineSvg(),
                    scenarioRows
                  }),
                  'text/html;charset=utf-8'
                )
              }
            >
              ⬇ Entwurf &amp; Handout (.html)
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                downloadFile(
                  'fmt-unterrichtsentwurf.md',
                  exportArrangementMarkdown(arrangement, blocksById, validation, {
                    fach,
                    thema,
                    kiAusarbeitung: elaboration,
                    scenarioRows
                  }),
                  'text/markdown;charset=utf-8'
                )
              }
            >
              ⬇ Markdown (.md)
            </button>
            <button
              type="button"
              className="btn btn-sm"
              title="IMS Common Cartridge 1.3 – direkt importierbar in Moodle, ILIAS, Canvas & itslearning"
              onClick={() => {
                const sc = buildScenario();
                downloadFile('fmt-lernszenario.imscc', exportScenarioToImscc(sc, scenarioRows), 'application/zip');
              }}
            >
              ⬇ LMS: IMS Common Cartridge (.imscc)
            </button>
            <button
              type="button"
              className="btn btn-sm"
              title="Moodle XML Kursstruktur mit FMT-Methodenseiten & WLO-Links"
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
              title="IMS-LD-inspiriertes neutrales Lernszenario inkl. FMT-Methodenlinks, Rollen & Differenzierung"
              onClick={() => {
                const sc = buildScenario();
                downloadFile('fmt-imsld-szenario.json', JSON.stringify(sc, null, 2), 'application/json;charset=utf-8');
              }}
            >
              ⬇ IMS-LD Szenario (.json)
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => downloadFile('fmt-arrangement.jsonld', JSON.stringify(arrangement, null, 2), 'application/ld+json')}
            >
              ⬇ FMT JSON-LD
            </button>
          </div>

          {elabError && (
            <div className="msgs">
              <li className="err">{elabError}</li>
            </div>
          )}

          {elaboration && (
            <div
              style={{
                marginTop: 12,
                padding: 16,
                background: 'var(--paper)',
                borderRadius: 8,
                border: '1px solid var(--rule)',
                maxHeight: 540,
                overflowY: 'auto'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <strong style={{ fontFamily: 'var(--display)', fontSize: 16 }}>
                  KI-Unterrichtsentwurf ({fach} · {thema})
                </strong>
                <button
                  type="button"
                  className="btn btn-sm no-print"
                  onClick={() =>
                    downloadFile(
                      'fmt-unterrichtsentwurf-ki.md',
                      exportArrangementMarkdown(arrangement, blocksById, validation, {
                        fach,
                        thema,
                        kiAusarbeitung: elaboration,
                        scenarioRows
                      }),
                      'text/markdown;charset=utf-8'
                    )
                  }
                >
                  ⬇ inkl. Quellen speichern
                </button>
              </div>
              <SimpleMarkdown content={elaboration} />
            </div>
          )}

          {usedBlocks.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--grid)' }}>
              <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
                Verlinkte FMT-Methoden &amp; Quellenverzeichnis ({usedBlocks.length}):
              </div>
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

          <details className="no-print" style={{ marginTop: 16 }}>
            <summary style={{ fontFamily: 'var(--display)', fontWeight: 600, cursor: 'pointer' }}>
              JSON-LD anzeigen oder importieren
            </summary>
            <pre style={{ maxHeight: 220 }}>{JSON.stringify(arrangement, null, 2)}</pre>
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
          </details>
        </div>
      )}

      {/* TAB 2: BINNENDIFFERENZIERUNG */}
      {activeTab === 'diff' && (
        <div>
          <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>
            Aktive Lerngruppen erscheinen sofort im <strong>Verlaufsplan</strong>, im <strong>Handout</strong> und in den <strong>LMS-Exporten</strong>.
            Die FMT erzeugt sofort regelbasierte Hinweise aus <code>B3 Adaptivität</code> &amp; <code>B1 Anleitung</code> – optional verfeinert die KI jede Phase passend zu Fach &amp; Thema.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {groups.map((g) => (
              <div
                key={g.id}
                style={{
                  padding: 10,
                  borderRadius: 6,
                  background: g.active ? 'var(--paper)' : 'transparent',
                  border: '1px solid var(--grid)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 10
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
                    <div className="muted" style={{ fontSize: 12.5 }}>
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

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            <input
              type="text"
              style={{ flex: '1 1 160px' }}
              placeholder="Neue Teilgruppe (z. B. DaZ / Sprachanfänger)"
              value={newGroupLabel}
              onChange={(e) => setNewGroupLabel(e.target.value)}
            />
            <input
              type="text"
              style={{ flex: '2 1 220px' }}
              placeholder="Förderbedarf / Profil"
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
              + Gruppe hinzufügen
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {scenarioRows.map((r) => (
              <div key={r.key} style={{ padding: 10, borderRadius: 6, background: 'var(--paper)', border: '1px solid var(--grid)' }}>
                <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                  {r.orderLabel} · {r.methodName} ({r.durationMin} min)
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                  {r.differentiation.map((d, di) => (
                    <li key={di}>
                      <strong>{d.groupLabel}:</strong> {d.measure}{' '}
                      <span className="muted" style={{ fontSize: 11.5 }}>
                        [{d.source === 'ki' ? 'KI-Entwurf' : 'FMT-Regel'}]
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: WLO / OER SEARCH */}
      {activeTab === 'oer' && (
        <div>
          <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>
            Durchsucht <strong>WirLernenOnline / OpenEduHub</strong> nach freien Unterrichtsmaterialien (OER) und verknüpft sie direkt mit
            der gewählten Phase im Verlaufsplan, Handout und LMS-Export (<code>.imscc</code> / Moodle).
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <label style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
              Ziel-Phase im Szenario
              <select value={oerTargetStep} onChange={(e) => setOerTargetStep(e.target.value)}>
                {scenarioRows.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.orderLabel} · {r.methodName} ({r.durationMin} min)
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
              Suchbegriff (WLO)
              <input
                type="text"
                value={oerQuery}
                onChange={(e) => setOerQuery(e.target.value)}
                placeholder={thema || 'z. B. Bruchrechnen, Dichte, Fotosynthese'}
              />
            </label>
          </div>

          <button type="button" className="btn btn-primary" disabled={busyOer} onClick={runWloSearch}>
            🌐 {busyOer ? 'Suche in WirLernenOnline…' : 'Freie OER-Materialien suchen'}
          </button>

          {oerError && (
            <div className="msgs" style={{ marginTop: 8 }}>
              <li className="err">{oerError}</li>
            </div>
          )}

          {oerResults.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {oerResults.map((item) => {
                const attached = (oerByStep[oerTargetStep] || []).some((x) => x.url === item.url);
                return (
                  <div
                    key={item.id}
                    style={{
                      padding: 10,
                      borderRadius: 6,
                      background: 'var(--paper)',
                      border: '1px solid var(--grid)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: 10
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <a href={item.url} target="_blank" rel="noreferrer" style={{ fontFamily: 'var(--display)', fontWeight: 700 }}>
                        {item.title} ↗
                      </a>
                      {item.description && (
                        <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                          {item.description}
                        </div>
                      )}
                      <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                        {[item.resourceType, item.license, ...(item.educationalContext || [])].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`btn btn-sm ${attached ? '' : 'btn-primary'}`}
                      onClick={() => (attached ? detachOer(oerTargetStep, item.url) : attachOer(oerTargetStep, item))}
                    >
                      {attached ? '✓ Angehängt' : '+ An Phase'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {totalAttachedOer > 0 && (
            <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--grid)' }}>
              <strong style={{ fontFamily: 'var(--display)', fontSize: 14 }}>
                Angehängte OER-Materialien ({totalAttachedOer}):
              </strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>
                {scenarioRows.flatMap((r) =>
                  r.oerResources.map((o) => (
                    <li key={`${r.key}-${o.id}`} style={{ marginBottom: 4 }}>
                      <strong>{r.orderLabel} ({r.methodName}):</strong>{' '}
                      <a href={o.url} target="_blank" rel="noreferrer">
                        {o.title}
                      </a>{' '}
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => detachOer(r.key, o.url)}>
                        ✕
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: MATERIALGENERATOR */}
      {activeTab === 'material' && (
        <div>
          <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>
            Erzeugt direkt einsetzbares Unterrichtsmaterial (inkl. Differenzierung &amp; Erwartungshorizont) – exakt abgestimmt auf die
            Durchführungsschritte der gewählten FMT-Methode.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
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

          <label style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
            Zusatzwunsch fürs Material (optional)
            <input
              type="text"
              value={matNotes}
              onChange={(e) => setMatNotes(e.target.value)}
              placeholder="z. B. 4 gestufte Aufgaben mit Alltagsbezug Pizza/Rezept, inkl. Selbstkontroll-Lösung"
            />
          </label>

          <button type="button" className="btn btn-primary" disabled={busyMat || !llmAvailable || !selectedMatRow} onClick={runMaterialGen}>
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
                marginTop: 12,
                padding: 16,
                background: 'var(--paper)',
                borderRadius: 8,
                border: '1px solid var(--rule)',
                maxHeight: 520,
                overflowY: 'auto'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <strong style={{ fontFamily: 'var(--display)', fontSize: 15 }}>{generatedMaterial.title}</strong>
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
