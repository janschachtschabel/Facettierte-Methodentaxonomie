import { useEffect, useMemo, useRef, useState } from 'react';
import { FMT_GUARDRAILS, type Arrangement, type MatchResult } from '@fmt/core';
import { useCatalog } from '../data/CatalogContext.js';
import { PartiturView } from '../components/PartiturView.js';
import { TimelineBandSvg } from '../components/TimelineBandSvg.js';
import { ByokModal } from '../components/ByokModal.js';
import { SimpleMarkdown } from '../components/SimpleMarkdown.js';
import {
  appendBlockToArrangement,
  collectUsedBlocks,
  createChainPreset,
  exportArrangementHtmlHandout,
  exportArrangementMarkdown,
  importArrangementJson
} from '../planner/arrangementOps.js';
import { explainValidationMessage } from '../planner/validationHelpers.js';

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
  const [scenarioText, setScenarioText] = useState(
    'Unterrichtsreihe Physik Klasse 7: das Konzept Dichte verstehen, wenig Vorwissen, 270 Minuten, ohne Geräte'
  );
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [matchNotice, setMatchNotice] = useState<string | null>(null);
  const [busyAi, setBusyAi] = useState(false);

  const [thema, setThema] = useState('Dichte von Stoffen');
  const [fach, setFach] = useState('Physik');
  const [hinweise, setHinweise] = useState('');
  const [elaboration, setElaboration] = useState<string | null>(null);
  const [elabError, setElabError] = useState<string | null>(null);

  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [byokOpen, setByokOpen] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

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

  const runAiElaborate = async () => {
    setBusyAi(true);
    setElabError(null);
    try {
      const res = await fetch('/api/v1/assistant/elaborate', {
        method: 'POST',
        headers: byokHeaders(),
        body: JSON.stringify({ arrangement, thema, fach, hinweise: hinweise.trim() || undefined })
      });
      const json = await res.json();
      if (!res.ok) {
        setElabError(json.fehler || 'Ausgestaltung fehlgeschlagen.');
        return;
      }
      setElaboration(String(json.ausarbeitung));
    } catch (e) {
      setElabError(e instanceof Error ? e.message : 'Netzwerkfehler');
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

  const exportSvg = () => {
    if (!svgRef.current) return;
    const cs = getComputedStyle(document.documentElement);
    const vars = ['--dA', '--dB', '--dC', '--dD', '--paper', '--surface', '--ink', '--ink-2', '--rule', '--on-domain', '--display'];
    let xml = new XMLSerializer().serializeToString(svgRef.current);
    for (const v of vars) {
      const resolved = cs.getPropertyValue(v).trim();
      if (resolved) xml = xml.split(`var(${v})`).join(resolved);
    }
    downloadFile('fmt-szenario-zeitband.svg', xml, 'image/svg+xml;charset=utf-8');
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
          {meta?.llmAllowByok !== false && (
            <button type="button" className="btn btn-sm" onClick={() => setByokOpen(true)}>
              🔑 {byok.apiKey ? `BYOK aktiv (${byok.provider})` : 'Eigener KI-Key (BYOK)'}
            </button>
          )}
          <button type="button" className="btn btn-sm" onClick={() => window.print()}>
            🖨 Drucken / PDF
          </button>
        </div>
      </div>

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
        <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>
          <strong>Hinweis zur Granularität:</strong> Eine Unterrichtsstunde ist <strong>R2</strong> (durchgehendes Szenario) oder ein kleines{' '}
          <strong>R3-Ensemble</strong> (mehrere verbundene Szenarien). Größere Container-Bausteine (z. B. <em>Productive Failure R3</em>{' '}
          oder <em>VBE R2</em>) nehmen Bausteine kleinerer Reichweite in ihren Slots auf.
        </p>
      </section>

      {/* 3. Live Combination Visualization (ALWAYS VISIBLE above editor) + Didaktische Partitur */}
      <section style={{ marginTop: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>2. Live-Komposition &amp; Didaktische Partitur: {arrangement.name}</h2>
          <div className="no-print" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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

        <PartiturView
          arrangement={arrangement}
          onChange={setArrangement}
          bundle={bundle}
          blocksById={blocksById}
          search={search}
          registry={exampleRegistry}
          labelOf={labelOf}
          explainedMessages={explainedMessages}
        />
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

        {/* AI Full Lesson Description & Complete Export with Sources */}
        <div className="card" style={{ padding: 18 }}>
          <h2 style={{ fontSize: 22 }}>4. Stundenbeschreibung, Quellen &amp; Export</h2>
          <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>
            Exportiert den kompletten Ablauf inkl. Durchführungs­schritten, Materialien, Kernkomponenten und verifizierten Quellenangaben
            aller {usedBlocks.length} eingesetzten Methoden – optional ergänzt um eine vollständige KI-Stundenbeschreibung.
          </p>

          <div className="no-print" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <label style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
              Fach
              <input type="text" value={fach} onChange={(e) => setFach(e.target.value)} />
            </label>
            <label style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
              Thema
              <input type="text" value={thema} onChange={(e) => setThema(e.target.value)} />
            </label>
          </div>
          <label
            className="no-print"
            style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 14, display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}
          >
            Zusätzliche Hinweise für die KI (optional, z. B. Lerngruppe, Differenzierung)
            <input
              type="text"
              value={hinweise}
              onChange={(e) => setHinweise(e.target.value)}
              placeholder="z. B. heterogene 7. Klasse, 2 Sprachanfänger, Fokus auf Alltagsbeispiele"
            />
          </label>

          <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <button type="button" className="btn btn-primary" disabled={busyAi} onClick={runAiElaborate}>
              ✨ {busyAi ? 'Erstelle Stundenbeschreibung…' : 'Gesamte Stunde ausformulieren (KI)'}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                downloadFile(
                  'fmt-stundenplan.md',
                  exportArrangementMarkdown(arrangement, blocksById, validation, { fach, thema, kiAusarbeitung: elaboration }),
                  'text/markdown;charset=utf-8'
                )
              }
            >
              ⬇ Stundenplan (.md)
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                downloadFile(
                  'fmt-stundenhandout.html',
                  exportArrangementHtmlHandout(arrangement, blocksById, validation, { fach, thema, kiAusarbeitung: elaboration }),
                  'text/html;charset=utf-8'
                )
              }
            >
              ⬇ Handout (.html)
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                downloadFile('fmt-arrangement.jsonld', JSON.stringify(arrangement, null, 2), 'application/ld+json')
              }
            >
              ⬇ JSON-LD
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
                  KI-Stundenbeschreibung ({fach} · {thema})
                </strong>
                <button
                  type="button"
                  className="btn btn-sm no-print"
                  onClick={() =>
                    downloadFile(
                      'fmt-stundenbeschreibung-ki.md',
                      exportArrangementMarkdown(arrangement, blocksById, validation, { fach, thema, kiAusarbeitung: elaboration }),
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

          {/* Always-visible verified source list for all used blocks */}
          {usedBlocks.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--grid)' }}>
              <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
                Quellenangaben zu den {usedBlocks.length} verwendeten Methoden:
              </div>
              <ul style={{ paddingLeft: 18, margin: 0, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {usedBlocks.map((b) => (
                  <li key={b.kennung}>
                    <strong>{b.name}:</strong>{' '}
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
                  setArrangement(res.arrangement);
                  setImportText('');
                }
              }}
            >
              JSON-LD importieren
            </button>
          </details>
        </div>
      </section>

      <ByokModal open={byokOpen} onClose={() => setByokOpen(false)} value={byok} onSave={setByok} />
    </div>
  );
}
