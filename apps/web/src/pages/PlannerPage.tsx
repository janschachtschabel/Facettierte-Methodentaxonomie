import { useEffect, useMemo, useRef, useState } from 'react';
import { FMT_GUARDRAILS, type Arrangement, type MatchResult } from '@fmt/core';
import { useCatalog } from '../data/CatalogContext.js';
import { PartiturView } from '../components/PartiturView.js';
import { VerlaufsplanView } from '../components/VerlaufsplanView.js';
import { ScenarioStudioPanel, type StudioTab } from '../components/ScenarioStudioPanel.js';
import { TimelineBandSvg } from '../components/TimelineBandSvg.js';
import { ByokModal } from '../components/ByokModal.js';
import {
  appendBlockToArrangement,
  collectUsedBlocks,
  createChainPreset,
  exportArrangementHtmlHandout
} from '../planner/arrangementOps.js';
import { explainValidationMessage } from '../planner/validationHelpers.js';
import {
  buildScenarioRows,
  DEFAULT_LEARNER_GROUPS,
  type LearnerGroup,
  type OerResource,
  type StepDiffSuggestion
} from '../planner/scenarioModel.js';
import {
  deleteSavedScenario,
  exportScenarioProjectJson,
  importScenarioProjectJson,
  loadSavedScenarios,
  printHtmlDocument,
  saveScenarioToStorage,
  type SavedScenario
} from '../planner/scenarioStorage.js';

export function PlannerPage() {
  const {
    bundle,
    meta,
    blocksById,
    validator,
    search,
    matcher,
    exampleRegistry,
    labelOf,
    valuesOf,
    pendingPlannerBlock,
    consumePendingPlannerBlock,
    byok,
    setByok
  } = useCatalog();

  const [arrangement, setArrangement] = useState<Arrangement | null>(null);
  const [showLiveBand, setShowLiveBand] = useState(true);
  const [viewMode, setViewMode] = useState<'partitur' | 'verlaufsplan'>('partitur');
  const [studioTab, setStudioTab] = useState<StudioTab>('export');
  const [focusedStepKey, setFocusedStepKey] = useState<string | null>(null);
  const [scenarioText, setScenarioText] = useState(
    'Unterrichtsreihe Physik Klasse 7: das Konzept Dichte verstehen, wenig Vorwissen, 270 Minuten, ohne Geräte'
  );
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [matchNotice, setMatchNotice] = useState<string | null>(null);
  const [busyAi, setBusyAi] = useState(false);

  const [thema, setThema] = useState('Dichte von Stoffen');
  const [fach, setFach] = useState('Physik');
  const [hinweise, setHinweise] = useState('');
  const [groups, setGroups] = useState<LearnerGroup[]>(DEFAULT_LEARNER_GROUPS);
  const [aiDiffByStep, setAiDiffByStep] = useState<Record<string, StepDiffSuggestion[]>>({});
  const [oerByStep, setOerByStep] = useState<Record<string, OerResource[]>>({});
  const [elaboration, setElaboration] = useState<string | null>(null);

  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>(() => loadSavedScenarios());
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);
  const [showSavedDrawer, setShowSavedDrawer] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const [byokOpen, setByokOpen] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const studioRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!bundle) return;
    if (!arrangement) {
      let initial = createChainPreset('konzeptaufbau', bundle);
      if (pendingPlannerBlock) {
        const queued = consumePendingPlannerBlock();
        const b = queued ? blocksById.get(queued) : null;
        if (b) initial = appendBlockToArrangement(initial, b);
      }
      setArrangement(initial);
    } else if (pendingPlannerBlock) {
      const queued = consumePendingPlannerBlock();
      const b = queued ? blocksById.get(queued) : null;
      if (b) setArrangement((prev) => (prev ? appendBlockToArrangement(prev, b) : prev));
    }
  }, [bundle, arrangement, pendingPlannerBlock, blocksById, consumePendingPlannerBlock]);

  const validation = useMemo(() => {
    if (!validator || !arrangement) return null;
    return validator.validate(arrangement, exampleRegistry);
  }, [validator, arrangement, exampleRegistry]);

  const explainedMessages = useMemo(() => {
    if (!validation || !arrangement || !bundle) return [];
    return validation.meldungen.map((m) =>
      explainValidationMessage(m, arrangement, blocksById, bundle, validation.dauerMin)
    );
  }, [validation, arrangement, blocksById, bundle]);

  const usedBlocks = useMemo(() => {
    if (!arrangement) return [];
    return collectUsedBlocks(arrangement, blocksById);
  }, [arrangement, blocksById]);

  const scenarioRows = useMemo(() => {
    if (!arrangement || !bundle) return [];
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return buildScenarioRows(arrangement, bundle, blocksById, labelOf, groups, aiDiffByStep, oerByStep, baseUrl);
  }, [arrangement, bundle, blocksById, labelOf, groups, aiDiffByStep, oerByStep]);

  const jumpToStudio = (tab: StudioTab, stepKey: string) => {
    setFocusedStepKey(stepKey);
    setStudioTab(tab);
    studioRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (!bundle || !validator || !search || !matcher || !arrangement || !validation) {
    return <div className="page-section">Lade Szenario-Baukasten…</div>;
  }

  const byokHeaders = (): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (byok.apiKey) {
      h['X-LLM-Api-Key'] = byok.apiKey;
      h['X-LLM-Provider'] = byok.provider || 'openai';
      if (byok.model) h['X-LLM-Model'] = byok.model;
    }
    return h;
  };

  const runDeterministicMatch = () => {
    setMatchNotice(null);
    const res = matcher.zuordnen({ text: scenarioText });
    setMatchResult(res);
    if (res.modus === 'ablauf' && res.arrangement) {
      setArrangement(res.arrangement);
      setMatchNotice(`Deterministisch in <1 ms komponiert (Kette: ${res.kette?.label}).`);
    } else if (res.modus === 'phase') {
      setMatchNotice(`Einzelphase erkannt: ${res.vorschlaege.length} passende Bausteine gefunden (klicken zum Übernehmen).`);
    }
  };

  const runAiTranslate = async () => {
    setBusyAi(true);
    setMatchNotice(null);
    try {
      const res = await fetch('/api/v1/assistant/translate', {
        method: 'POST',
        headers: byokHeaders(),
        body: JSON.stringify({ text: scenarioText })
      });
      const json = await res.json();
      if (!res.ok) {
        setMatchNotice(`Hinweis: ${json.fehler || 'Anfrage fehlgeschlagen.'}`);
        return;
      }
      setMatchResult(json.ergebnis as MatchResult);
      if (json.ergebnis?.modus === 'ablauf' && json.ergebnis?.arrangement) {
        setArrangement(json.ergebnis.arrangement as Arrangement);
      }
      setMatchNotice(
        json.quelle === 'llm'
          ? `KI-Übersetzung (${json.gecacht ? 'aus Cache' : 'live'}) → deterministisch geprüft.`
          : json.hinweis || 'Deterministische Regel-Zuordnung genutzt.'
      );
    } catch {
      runDeterministicMatch();
    } finally {
      setBusyAi(false);
    }
  };

  const downloadFile = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resolveTimelineSvgString = (): string | null => {
    if (!svgRef.current) return null;
    const cs = getComputedStyle(document.documentElement);
    const vars = ['--dA', '--dB', '--dC', '--dD', '--paper', '--surface', '--ink', '--ink-2', '--rule', '--on-domain', '--display'];
    let xml = new XMLSerializer().serializeToString(svgRef.current);
    for (const v of vars) {
      const resolved = cs.getPropertyValue(v).trim();
      if (resolved) xml = xml.split(`var(${v})`).join(resolved);
    }
    return xml;
  };

  const exportSvg = () => {
    const xml = resolveTimelineSvgString();
    if (!xml) return;
    downloadFile('fmt-szenario-zeitband.svg', xml, 'image/svg+xml;charset=utf-8');
  };

  const handlePrintPdf = () => {
    const html = exportArrangementHtmlHandout(arrangement, blocksById, validation, {
      fach,
      thema,
      kiAusarbeitung: elaboration,
      timelineSvg: resolveTimelineSvgString(),
      scenarioRows
    });
    printHtmlDocument(html);
  };

  const handleSaveBrowser = (asNew = false) => {
    const title = thema ? `${fach ? `${fach}: ` : ''}${thema}` : arrangement.name;
    const { saved, list } = saveScenarioToStorage({
      id: asNew ? undefined : activeSavedId || undefined,
      title,
      fach,
      thema,
      hinweise,
      arrangement,
      groups,
      aiDiffByStep,
      oerByStep,
      elaboration
    });
    setActiveSavedId(saved.id);
    setSavedScenarios(list);
    setSaveNotice(`Szenario „${saved.title}“ im Browser gespeichert (${list.length} insgesamt).`);
    setTimeout(() => setSaveNotice(null), 4000);
  };

  const handleLoadSaved = (sc: SavedScenario) => {
    setArrangement(sc.arrangement);
    setFach(sc.fach);
    setThema(sc.thema);
    setHinweise(sc.hinweise);
    setGroups(sc.groups?.length ? sc.groups : DEFAULT_LEARNER_GROUPS);
    setAiDiffByStep(sc.aiDiffByStep || {});
    setOerByStep(sc.oerByStep || {});
    setElaboration(sc.elaboration || null);
    setActiveSavedId(sc.id);
    setShowSavedDrawer(false);
    setSaveNotice(`Szenario „${sc.title}“ geladen.`);
    setTimeout(() => setSaveNotice(null), 3500);
  };

  const handleDownloadProjectFile = () => {
    const title = thema ? `${fach ? `${fach}: ` : ''}${thema}` : arrangement.name;
    const json = exportScenarioProjectJson({
      title,
      fach,
      thema,
      hinweise,
      arrangement,
      groups,
      aiDiffByStep,
      oerByStep,
      elaboration
    });
    const slug = (thema || arrangement.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'szenario';
    downloadFile(`fmt-${slug}.fmt.json`, json, 'application/json;charset=utf-8');
  };

  const handleUploadProjectFile = (file: File) => {
    file.text().then((raw) => {
      const res = importScenarioProjectJson(raw);
      if (!res.ok) {
        setSaveNotice(`Import fehlgeschlagen: ${res.fehler}`);
        return;
      }
      const p = res.project;
      setArrangement(p.arrangement);
      if (p.fach) setFach(p.fach);
      if (p.thema) setThema(p.thema);
      if (p.hinweise !== undefined) setHinweise(p.hinweise);
      if (p.groups?.length) setGroups(p.groups);
      if (p.aiDiffByStep) setAiDiffByStep(p.aiDiffByStep);
      if (p.oerByStep) setOerByStep(p.oerByStep);
      if (p.elaboration !== undefined) setElaboration(p.elaboration);
      setActiveSavedId(null);
      setSaveNotice(`Projektdatei „${p.title || file.name}“ geladen.`);
      setTimeout(() => setSaveNotice(null), 4000);
    });
  };

  const nErr = validation.meldungen.filter((m) => m.schwere === 'Fehler').length;
  const nWarn = validation.meldungen.length - nErr;
  const llmAvailable = Boolean(meta?.llmConfigured || byok.apiKey);

  return (
    <div className="page-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h1>Modularer Szenario-Baukasten</h1>
          <p className="muted" style={{ maxWidth: '74ch', marginTop: 4 }}>
            Kombinieren Sie Methoden als modulare Bausteine mit Lernzustands-Schnittstellen, verschachtelten Container-Slots (
            <code>R3 ⊃ R2 ⊃ R1</code>), Begleitstrang, Wiederkehr und Alternativen – live visualisiert und geprüft gegen R-00 bis R-12.
          </p>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-sm btn-primary" onClick={handlePrintPdf} title="Öffnet saubere A4-Druckansicht zum Speichern als PDF (inkl. Zeitband, Verlaufstabelle & Quellen)">
            🖨 Als PDF drucken / speichern
          </button>
          <button type="button" className="btn btn-sm" onClick={() => handleSaveBrowser(false)} title="Speichert das komplette Szenario inkl. Differenzierung, OER & KI-Entwurf im Browser">
            💾 Speichern
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setShowSavedDrawer((s) => !s)}>
            📂 Meine Szenarien ({savedScenarios.length})
          </button>
          <button type="button" className="btn btn-sm" onClick={handleDownloadProjectFile} title="Komplettes Szenario als .fmt.json-Projektdatei lokal sichern">
            ⬇ Datei (.fmt.json)
          </button>
          <button type="button" className="btn btn-sm" onClick={() => fileInputRef.current?.click()} title="Gespeicherte .fmt.json- oder JSON-LD-Datei wieder öffnen">
            ⬆ Öffnen
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.jsonld"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUploadProjectFile(f);
              e.target.value = '';
            }}
          />
          {meta?.llmAllowByok !== false && (
            <button type="button" className="btn btn-sm" onClick={() => setByokOpen(true)}>
              🔑 {byok.apiKey ? `BYOK aktiv (${byok.provider})` : 'Eigener KI-Key (BYOK)'}
            </button>
          )}
        </div>
      </div>

      {saveNotice && (
        <div
          className="card no-print"
          style={{ padding: '8px 14px', marginTop: 10, borderLeft: '4px solid var(--dC)', fontFamily: 'var(--display)', fontWeight: 600, fontSize: 14 }}
        >
          ✓ {saveNotice}
        </div>
      )}

      {showSavedDrawer && (
        <section className="card no-print" style={{ padding: 16, marginTop: 12, borderLeft: '4px solid var(--dA)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <strong style={{ fontFamily: 'var(--display)', fontSize: 16 }}>
              📂 Gespeicherte Szenarien im Browser ({savedScenarios.length})
            </strong>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => handleSaveBrowser(true)}>
                + Aktuelles als neuen Eintrag speichern
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setShowSavedDrawer(false)}>
                Schließen
              </button>
            </div>
          </div>
          {savedScenarios.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              Noch keine Szenarien gespeichert. Klicke oben auf <strong>„💾 Speichern“</strong> oder sichere eine Projektdatei (<code>.fmt.json</code>).
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
              {savedScenarios.map((sc) => (
                <div
                  key={sc.id}
                  style={{
                    padding: 10,
                    borderRadius: 6,
                    background: 'var(--paper)',
                    border: `1px solid ${activeSavedId === sc.id ? 'var(--dA)' : 'var(--grid)'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4
                  }}
                >
                  <strong style={{ fontFamily: 'var(--display)', fontSize: 14.5 }}>{sc.title}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {sc.arrangement.reichweite.toUpperCase()} · {new Date(sc.savedAt).toLocaleString('de-DE')}
                    {sc.elaboration ? ' · inkl. KI-Entwurf' : ''}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => handleLoadSaved(sc)}>
                      Laden
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => {
                        setSavedScenarios(deleteSavedScenario(sc.id));
                        if (activeSavedId === sc.id) setActiveSavedId(null);
                      }}
                    >
                      Löschen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 1. Scenario Input & Hybrid AI Assistant */}
      <section className="card no-print" style={{ padding: 18, marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 22 }}>1. Szenario beschreiben &amp; zuordnen</h2>
          <span className="status-badge">
            {llmAvailable ? `✨ KI aktiv (${byok.model || meta?.llmModel || 'gpt-6-luna'})` : '⚡ Deterministischer Sofort-Modus (0 €)'}
          </span>
        </div>

        <textarea
          rows={2}
          style={{ width: '100%' }}
          value={scenarioText}
          onChange={(e) => setScenarioText(e.target.value)}
          placeholder="z. B. Unterrichtsreihe Physik Klasse 7: Konzept Dichte verstehen, wenig Vorwissen, 270 Minuten, ohne Geräte"
        />

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <button type="button" className="btn btn-primary" onClick={runDeterministicMatch}>
            ⚡ Sofort zuordnen (Regeln, &lt;1 ms)
          </button>
          <button type="button" className="btn" disabled={busyAi} onClick={runAiTranslate}>
            ✨ {busyAi ? 'Analysiere…' : 'Mit KI verstehen & planen'}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => setScenarioText('Sicherung für Klasse 7, 10 Minuten, 28 Schüler, ohne Geräte')}
          >
            Beispiel: Sicherung (Phase)
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() =>
              setScenarioText('Unterrichtsreihe Physik Klasse 7: das Konzept Dichte verstehen, wenig Vorwissen, 270 Minuten')
            }
          >
            Beispiel: Konzeptreihe (R3)
          </button>
        </div>

        {matchNotice && (
          <p style={{ marginTop: 10, marginBottom: 0, fontFamily: 'var(--display)', fontWeight: 600, color: 'var(--dA)' }}>
            {matchNotice}
          </p>
        )}

        {matchResult && matchResult.modus === 'phase' && matchResult.vorschlaege.length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--grid)' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
              Passende Bausteine für diese Phase (Anklicken zum Anfügen an die Partitur):
            </div>
            <ul className="chips">
              {matchResult.vorschlaege.slice(0, 12).map((v) => (
                <li key={v.baustein}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      const b = blocksById.get(v.baustein);
                      if (b) setArrangement(appendBlockToArrangement(arrangement, b));
                    }}
                  >
                    + {v.name} ({v.dauerMin}–{v.dauerMax}m{v.evidenzgrad ? `, Grad ${v.evidenzgrad}` : ''})
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* 2. Context, Granularity & Preset Controls */}
      <section className="filter-panel no-print" style={{ marginTop: 18 }}>
        <div className="filter-grid">
          <label>
            Funktionskette / Vorlage
            <select
              value={arrangement.zieltyp || ''}
              onChange={(e) => {
                if (!e.target.value) setArrangement({ ...arrangement, zieltyp: undefined, name: 'Freier Ablauf' });
                else setArrangement(createChainPreset(e.target.value, bundle));
              }}
            >
              <option value="">Freier Ablauf (ohne Kette)</option>
              {bundle.ketten.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Granularität / Rahmen (R-01)
            <select
              value={arrangement.reichweite}
              onChange={(e) => setArrangement({ ...arrangement, reichweite: e.target.value })}
            >
              <option value="r2">R2 Einzelstunde / Szenario (nimmt R1–R2)</option>
              <option value="r3">R3 Unterrichtsreihe / Ensemble (nimmt R1–R3)</option>
              <option value="r4">R4 Modul / Kurs (nimmt R1–R4)</option>
            </select>
          </label>

          <label>
            Bildungsstufe
            <select
              value={arrangement.kontext?.bildungsstufe || 'sek1'}
              onChange={(e) =>
                setArrangement({
                  ...arrangement,
                  kontext: { ...arrangement.kontext, bildungsstufe: e.target.value }
                })
              }
            >
              {valuesOf('bildungsstufe').map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Vorwissen
            <select
              value={arrangement.kontext?.vorwissen || 'gering'}
              onChange={(e) =>
                setArrangement({
                  ...arrangement,
                  kontext: { ...arrangement.kontext, vorwissen: e.target.value }
                })
              }
            >
              {valuesOf('vorwissen').map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Zeitbudget (min)
            <input
              type="number"
              min={0}
              value={arrangement.kontext?.zeitbudgetMin ?? 270}
              onChange={(e) =>
                setArrangement({
                  ...arrangement,
                  kontext: { ...arrangement.kontext, zeitbudgetMin: Math.max(0, Number(e.target.value) || 0) }
                })
              }
            />
          </label>

          <label>
            Beispiel-Arrangement laden
            <select
              defaultValue=""
              onChange={(e) => {
                if (!e.target.value) return;
                const found = bundle.beispiele.find((ex) => ex['@id']?.endsWith(e.target.value));
                if (found) setArrangement(JSON.parse(JSON.stringify(found)) as Arrangement);
                e.target.value = '';
              }}
            >
              <option value="">Beispiel wählen…</option>
              {bundle.beispiele.map((ex) => {
                const slug = ex['@id']?.split('/').pop() || ex.name;
                return (
                  <option key={slug} value={slug}>
                    {ex.name}
                  </option>
                );
              })}
            </select>
          </label>
        </div>
        <details style={{ marginTop: 10 }}>
          <summary style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', color: 'var(--dA)' }}>
            ? Was bedeuten die Granularitätsebenen R1 bis R4 im Baukasten?
          </summary>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 8, marginTop: 8, fontSize: 13 }}>
            <div style={{ padding: 8, borderRadius: 6, background: 'var(--dC-soft)' }}>
              <strong>R1 Interaktion (2–15 min):</strong> Einzelimpuls wie Think-Pair-Share, Abrufquiz oder Exit-Ticket. Passt direkt in Slots von R2/R3.
            </div>
            <div style={{ padding: 8, borderRadius: 6, background: 'var(--dA-soft)' }}>
              <strong>R2 Szenario (15–60 min):</strong> Durchgehende Phase oder Einzelstunde (z. B. Gruppenpuzzle, VBE, Lösungsbeispiele).
            </div>
            <div style={{ padding: 8, borderRadius: 6, background: 'var(--dD-soft)' }}>
              <strong>R3 Reihe / Ensemble (Stunden–Wochen):</strong> Verbindet mehrere Szenarien oder Container-Bausteine (z. B. Productive Failure, Projekt).
            </div>
            <div style={{ padding: 8, borderRadius: 6, background: 'var(--dB-soft)' }}>
              <strong>R4 Modul / Kurs (Wochen–Halbjahr):</strong> Übergeordneter Rahmen für komplette Kurse (z. B. Blended Learning, Daltonplan).
            </div>
          </div>
          <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0' }}>
            Regel <code>R-01</code> prüft, dass jeder Baustein in den gewählten Rahmen passt und eingebettete Slot-Methoden kleiner sind als ihr Container (<code>R4 ⊃ R3 ⊃ R2 ⊃ R1</code>).
          </p>
        </details>
      </section>

      {/* 3. Live Combination Visualization (ALWAYS VISIBLE above editor) + Didaktische Partitur */}
      <section style={{ marginTop: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>2. Live-Komposition &amp; Didaktische Partitur: {arrangement.name}</h2>
          <div className="no-print" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`btn btn-sm ${viewMode === 'partitur' ? 'btn-primary' : ''}`}
              onClick={() => setViewMode('partitur')}
            >
              🧩 Partitur-Editor
            </button>
            <button
              type="button"
              className={`btn btn-sm ${viewMode === 'verlaufsplan' ? 'btn-primary' : ''}`}
              onClick={() => setViewMode('verlaufsplan')}
            >
              📋 Verlaufsplan (IMS-LD)
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setShowLiveBand((s) => !s)}>
              {showLiveBand ? '▲ Zeitband ausblenden' : '▼ Live-Zeitband einblenden'}
            </button>
            {showLiveBand && (
              <button type="button" className="btn btn-sm" onClick={exportSvg}>
                ⬇ Zeitband (SVG)
              </button>
            )}
          </div>
        </div>

        {showLiveBand && (
          <div className="card" style={{ padding: 16, marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <strong style={{ fontFamily: 'var(--display)', fontSize: 15 }}>
                Schachtelung &amp; Ablauf live (Granularität {arrangement.reichweite.toUpperCase()} · {validation.dauerMin} min
                {arrangement.kontext?.zeitbudgetMin ? ` / ${arrangement.kontext.zeitbudgetMin} min Budget` : ''})
              </strong>
              <span
                style={{
                  fontFamily: 'var(--display)',
                  fontWeight: 700,
                  fontSize: 14,
                  color: validation.gueltig ? 'var(--dC)' : 'var(--err)'
                }}
              >
                {validation.gueltig ? '✓ Formal gültig' : `✕ ${nErr} Prüffehler`}
                {nWarn > 0 ? ` · ${nWarn} Warnungen` : ''}
              </span>
            </div>
            <TimelineBandSvg arrangement={arrangement} blocksById={blocksById} svgRef={svgRef} />
          </div>
        )}

        {viewMode === 'partitur' ? (
          <PartiturView
            arrangement={arrangement}
            onChange={setArrangement}
            bundle={bundle}
            blocksById={blocksById}
            search={search}
            registry={exampleRegistry}
            labelOf={labelOf}
            explainedMessages={explainedMessages}
            onOpenOerForStep={(k) => jumpToStudio('oer', k)}
            onOpenMaterialForStep={(k) => jumpToStudio('material', k)}
          />
        ) : (
          <VerlaufsplanView
            rows={scenarioRows}
            onOpenOerForStep={(k) => jumpToStudio('oer', k)}
            onOpenMaterialForStep={(k) => jumpToStudio('material', k)}
          />
        )}
      </section>

      {/* 4. Understandable Live Validator & Full Export / AI Lesson Description */}
      <section className="split-2" style={{ marginTop: 24 }}>
        <div className="card" style={{ padding: 18 }}>
          <h2 style={{ fontSize: 22 }}>3. Live-Prüfung (R-00 bis R-12) – verständlich eingeordnet</h2>
          <p
            style={{
              fontFamily: 'var(--display)',
              fontSize: 19,
              fontWeight: 700,
              color: validation.gueltig ? 'var(--dC)' : 'var(--err)'
            }}
          >
            {validation.gueltig ? '✓ Gültig' : '✕ Ungültig'}: {nErr} Fehler, {nWarn} Warnungen · {validation.dauerMin} min
            {arrangement.kontext?.zeitbudgetMin ? ` / ${arrangement.kontext.zeitbudgetMin} min Budget` : ''}
          </p>

          <ul className="msgs">
            {explainedMessages.length === 0 ? (
              <li>Keine Fehler, keine Warnungen – alle Schnittstellen, Granularitäten und Zielzustände passen zusammen.</li>
            ) : (
              explainedMessages.map((em, i) => (
                <li key={i} className={em.raw.schwere === 'Fehler' ? 'err' : ''}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                    <div>
                      <span className="basis-tag">
                        {em.raw.regel} · {em.raw.grundlage === 'formal' ? 'formal' : `[${em.raw.grundlage}]`}
                      </span>{' '}
                      <strong>{em.location}:</strong> {em.raw.meldung}
                    </div>
                    {em.quickFix && (
                      <button
                        type="button"
                        className="btn btn-sm btn-primary no-print"
                        onClick={() => setArrangement(em.quickFix!.apply(arrangement))}
                      >
                        ✦ {em.quickFix.label}
                      </button>
                    )}
                  </div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                    <strong>Warum?</strong> {em.why}
                    <br />
                    <strong>Behebung:</strong> {em.howToFix}
                  </div>
                </li>
              ))
            )}
          </ul>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
              Erreichte Lernzustände ({validation.endzustand.length}):
            </div>
            <ul className="chips">
              {validation.endzustand.map((z) => (
                <li key={z} className="chip chip-c">
                  {labelOf('lernzustand', z)}
                </li>
              ))}
            </ul>
          </div>

          <details className="guardrails" style={{ marginTop: 16 }}>
            <summary>Die 4 FMT-Leitplanken (bitte beachten)</summary>
            <ul>
              {FMT_GUARDRAILS.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          </details>
        </div>

        {/* Scenario Studio: Differentiation, WLO OER, Material Generator & LMS Exports */}
        <div ref={studioRef}>
          <ScenarioStudioPanel
            activeTab={studioTab}
            onTabChange={setStudioTab}
            focusedStepKey={focusedStepKey}
            arrangement={arrangement}
            onArrangementChange={setArrangement}
            blocksById={blocksById}
            usedBlocks={usedBlocks}
            validation={validation}
            scenarioRows={scenarioRows}
            labelOf={labelOf}
            fach={fach}
            thema={thema}
            hinweise={hinweise}
            onFachChange={setFach}
            onThemaChange={setThema}
            onHinweiseChange={setHinweise}
            groups={groups}
            onGroupsChange={setGroups}
            aiDiffByStep={aiDiffByStep}
            onAiDiffChange={setAiDiffByStep}
            oerByStep={oerByStep}
            onOerByStepChange={setOerByStep}
            elaboration={elaboration}
            onElaborationChange={setElaboration}
            onPrintPdf={handlePrintPdf}
            getTimelineSvg={resolveTimelineSvgString}
            byokHeaders={byokHeaders}
            llmAvailable={llmAvailable}
          />
        </div>
      </section>

      <ByokModal open={byokOpen} onClose={() => setByokOpen(false)} value={byok} onSave={setByok} />
    </div>
  );
}
