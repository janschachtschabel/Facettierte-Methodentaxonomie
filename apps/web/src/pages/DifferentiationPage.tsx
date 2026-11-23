import { useMemo, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  QUICK_LEARNER_GROUP_PROFILES,
  adaptScenario,
  detectLearnerGroupsFromText,
  type AdaptScenarioResult,
  type MeasureEffort,
  type MeasureLevel
} from '@fmt/core';
import { useCatalog } from '../data/CatalogContext.js';
import { exportMarkdownToPrintableHtml } from '../planner/arrangementOps.js';
import {
  DIFF_HANDOFF_KEY,
  loadActivePlannerDraft,
  loadSavedScenarios,
  printHtmlDocument,
  type ActivePlannerDraft,
  type SavedScenario
} from '../planner/scenarioStorage.js';

export { DIFF_HANDOFF_KEY };

type InputMode = 'planner' | 'free' | 'saved';
type ResultTab = 'udl' | 'konflikte' | 'teilgruppen' | 'phasen' | 'alle';

interface QuickPreset {
  id: string;
  label: string;
  scenarioText: string;
  lerngruppenText: string;
  bildungsstufe: string;
  zeitMin: number;
  maxTechnik: string;
  ohneInternet: boolean;
}

interface GroupChip {
  id: string;
  label: string;
  snippet: string;
  match: RegExp;
}

const CHIP_MATCHERS: Record<string, RegExp> = {
  daz: /\bdaz\b|sprachsensib|sprachförder|mehrsprach/i,
  adhs: /\badhs\b|\bads\b|konzentration|aufmerksamkeit/i,
  lrs: /\blrs\b|legasthen|lese-?rechtschreib/i,
  'foerder-lernen': /förderbedarf\s*lernen|lernschwierigkeit|sonderpädagog/i,
  'vorwissen-gering': /gering(?:es|em)?\s+vorwissen|wenig\s+vorwissen|basisunterstütz/i,
  vertiefung: /leistungsstark|hochbegab|vertiefung|schnell/i,
  schuechtern: /schüchtern|zurückhalt|geringe\s+beteiligung|angst/i,
  barriere: /\bseh(?:beeintr|behind|schw[aä]ch)|blind|\bh[oö]r(?:beeintr|sch[aä]dig)|schwerh[oö]rig|geh[oö]rlos|motorik|motorisch|barriere/i
};

const GROUP_CHIPS: GroupChip[] = QUICK_LEARNER_GROUP_PROFILES.map((p) => ({
  id: p.id,
  label: p.chipLabel,
  snippet: p.snippet,
  match: CHIP_MATCHERS[p.id] || new RegExp(p.id, 'i')
}));

const QUICK_PRESETS: QuickPreset[] = [
  {
    id: 'inklusion-mathe',
    label: 'Grundschule Mathe (Inklusion)',
    scenarioText: 'Mathematik Klasse 4: Bruchteile entdecken (Hälfte und Viertel) durch Papierfalten, Vergleichen und erste Aufgaben, 45 Minuten, ohne Geräte, ohne Internet.',
    lerngruppenText: '24 Kinder: 5 DaZ-Kinder, 2 Kinder mit ADHS und 4 sehr leistungsstarke Kinder',
    bildungsstufe: 'primar',
    zeitMin: 45,
    maxTechnik: 't-keine',
    ohneInternet: true
  },
  {
    id: 'daz-sek1',
    label: 'Sek I Bio (DaZ & LRS)',
    scenarioText: 'Biologie Klasse 7 Doppelstunde: Ökosystem Wald und Nahrungsketten anhand eines Sachtextes und Schaubildes erarbeiten, 90 Minuten.',
    lerngruppenText: '26 Lernende: 6 DaZ-Kinder, 3 mit LRS und 5 leistungsstarke Lernende',
    bildungsstufe: 'sek1',
    zeitMin: 90,
    maxTechnik: 't-projektion',
    ohneInternet: false
  },
  {
    id: 'adhs-foerder',
    label: 'Fördergruppe (ADHS & Lernen)',
    scenarioText: 'Fördergruppe Klasse 3: Leseverständnis an kurzen Alltagsgeschichten üben, 45 Minuten, analog ohne Geräte.',
    lerngruppenText: '6 Kinder mit ADHS, Förderbedarf Lernen und LRS',
    bildungsstufe: 'primar',
    zeitMin: 45,
    maxTechnik: 't-keine',
    ohneInternet: true
  },
  {
    id: 'sek2-diskurs',
    label: 'Oberstufe Geschichte (Vorwissen)',
    scenarioText: 'Geschichte Klasse 12 Doppelstunde: Quellenanalyse zur Weimarer Republik und kontroverse Debatte, 90 Minuten.',
    lerngruppenText: '22 Lernende: 4 mit geringem Vorwissen und Sprachunterstützungsbedarf, 6 sehr leistungsstarke Lernende',
    bildungsstufe: 'sek2',
    zeitMin: 90,
    maxTechnik: 't-einzeln',
    ohneInternet: false
  }
];

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

function formatGuidanceLabel(guidance: string): string {
  switch (guidance) {
    case 'explizit':
      return 'Klare Schritt-für-Schritt-Führung';
    case 'geleitet':
      return 'Geleitet mit Hilfestellungen';
    case 'offen':
      return 'Offen & selbstgesteuert';
    default:
      return guidance;
  }
}

function formatStageLabel(stage: string): string {
  const map: Record<string, string> = {
    primar: 'Primarstufe',
    sek1: 'Sekundarstufe I',
    sek2: 'Sekundarstufe II',
    berufsbildung: 'Berufsbildung',
    hochschule: 'Hochschule',
    erwachsenenbildung: 'Erwachsenenbildung'
  };
  return map[stage] || 'Stufe offen';
}

function formatTechSummary(maxTechnik: string, ohneInternet: boolean, ohneKI: boolean): string {
  const parts: string[] = [];
  if (maxTechnik === 't-keine') parts.push('Analog');
  else if (maxTechnik === 't-projektion') parts.push('Beamer/Tafel');
  else if (maxTechnik === 't-einzeln') parts.push('Endgeräte');
  if (ohneInternet) parts.push('Offline');
  if (ohneKI) parts.push('Ohne KI');
  return parts.length ? parts.join(' · ') : 'Technik frei';
}

function buildMarkdownChecklist(res: AdaptScenarioResult, scenarioText: string): string {
  const lines: string[] = [
    '# Binnendifferenzierungs- & Anpassungsplan',
    '',
    `- **Kontext:** ${res.kontext.fach || 'Fach offen'} · ${res.kontext.thema || 'Szenario'} · ${res.kontext.zeitMin ? `${res.kontext.zeitMin} min` : 'Zeit offen'} · ${res.kontext.anzahlTeilgruppen} Teilgruppen`,
    `- **Rahmen:** Technik=${res.kontext.maxTechnik || 'frei'}, Offline=${res.kontext.ohneInternet ? 'ja' : 'nein'}, Ebenen=${res.kontext.aktiveEbenen.join(', ')}`,
    ''
  ];
  if (scenarioText.trim()) {
    lines.push('## Ausgangsszenario', scenarioText.trim(), '');
  }
  lines.push('## 1. Gemeinsame Basis für alle (UDL)');
  for (const u of res.udlBasis) {
    lines.push(`- **${u.name}** (Passung ≥ +${u.minNormalizedScore} %, ${formatEffortLabel(u.meta.aufwand)}): ${u.meta.umsetzungsimpuls}`);
  }
  lines.push('');
  if (res.konflikte.length) {
    lines.push('## 2. Zielkonflikte & Auflösungsstrategien');
    for (const k of res.konflikte) {
      lines.push(
        `- **${k.measureName}** (hilft: ${k.staerkendFuer.map((x) => `${x.label} +${x.normalizedScore}%`).join(', ')} · hemmt: ${k.hemmendFuer.map((x) => `${x.label} ${x.normalizedScore}%`).join(', ')})  \n  → *Lösung:* ${k.aufloesungsstrategie}`
      );
    }
    lines.push('');
  }
  lines.push('## 3. Teilgruppen-Anpassungen');
  for (const tg of res.teilgruppen) {
    lines.push(`### ${tg.label}${tg.count ? ` (${tg.count})` : ''}`);
    for (const m of tg.spezifischeMassnahmen) {
      lines.push(`- **${m.name}** (+${m.normalizedScore} %): ${m.meta.umsetzungsimpuls}`);
    }
    if (tg.vermeiden.length) {
      lines.push(`- *Vermeiden:* ${tg.vermeiden.map((v) => `${v.name} (${v.normalizedScore} %)`).join('; ')}`);
    }
    lines.push('');
  }
  lines.push('## 4. Phasen-Anpassungen');
  for (const p of res.phasenAnpassungen) {
    lines.push(`### ${p.orderLabel}. ${p.phaseLabel}${p.durationMin ? ` (${p.durationMin} min)` : ''}${p.bausteinName ? ` – ${p.bausteinName}` : ''}`);
    if (p.passendeFmtMethoden.length) {
      lines.push(`- **Passende FMT-Methoden:** ${p.passendeFmtMethoden.map((m) => `${m.name} (${m.dauerMin}–${m.dauerMax} min${m.evidenzgrad ? `, Grad ${m.evidenzgrad}` : ''})`).join(' · ')}`);
    }
    for (const ti of p.teilgruppenImpulse) {
      lines.push(`- **${ti.groupLabel}:** ${ti.massnahmen.map((m) => m.name).join(', ')}`);
    }
    lines.push('');
  }
  lines.push(`> ${res.epistemischerHinweis}`);
  return lines.join('\n');
}

export function DifferentiationPage() {
  const { bundle } = useCatalog();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const livePlannerDraft: ActivePlannerDraft | null = useMemo(() => loadActivePlannerDraft(), []);
  const savedScenarios: SavedScenario[] = useMemo(() => {
    try {
      return loadSavedScenarios();
    } catch {
      return [];
    }
  }, []);

  const preferPlanner = Boolean(livePlannerDraft && searchParams.get('source') === 'planner');

  const [inputMode, setInputMode] = useState<InputMode>(preferPlanner ? 'planner' : 'free');
  const [activePresetId, setActivePresetId] = useState<string>(preferPlanner ? '' : QUICK_PRESETS[0].id);
  const [scenarioText, setScenarioText] = useState(
    preferPlanner && livePlannerDraft ? livePlannerDraft.scenarioText || livePlannerDraft.title : QUICK_PRESETS[0].scenarioText
  );
  const [lerngruppenText, setLerngruppenText] = useState(preferPlanner ? '' : QUICK_PRESETS[0].lerngruppenText);
  const [bildungsstufe, setBildungsstufe] = useState(
    preferPlanner && livePlannerDraft ? livePlannerDraft.bildungsstufe || '' : QUICK_PRESETS[0].bildungsstufe
  );
  const [zeitMin, setZeitMin] = useState<string>(
    preferPlanner && livePlannerDraft?.zeitMin ? String(livePlannerDraft.zeitMin) : String(QUICK_PRESETS[0].zeitMin)
  );
  const [maxTechnik, setMaxTechnik] = useState(
    preferPlanner && livePlannerDraft ? livePlannerDraft.maxTechnik || '' : QUICK_PRESETS[0].maxTechnik
  );
  const [ohneInternet, setOhneInternet] = useState(
    preferPlanner && livePlannerDraft ? livePlannerDraft.ohneInternet : QUICK_PRESETS[0].ohneInternet
  );
  const [ohneKI, setOhneKI] = useState(preferPlanner && livePlannerDraft ? livePlannerDraft.ohneKI : false);
  const [maxAufwand, setMaxAufwand] = useState<MeasureEffort | ''>('');
  const [includeSystemMeasures, setIncludeSystemMeasures] = useState(false);
  const [selectedSavedId, setSelectedSavedId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<ResultTab>('udl');
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

  const activeSaved = useMemo(
    () => savedScenarios.find((s) => s.id === selectedSavedId) || savedScenarios[0] || null,
    [savedScenarios, selectedSavedId]
  );

  const switchMode = (mode: InputMode) => {
    setInputMode(mode);
    if (mode === 'planner' && livePlannerDraft) {
      setBildungsstufe(livePlannerDraft.bildungsstufe || '');
      if (livePlannerDraft.zeitMin) setZeitMin(String(livePlannerDraft.zeitMin));
      setMaxTechnik(livePlannerDraft.maxTechnik || '');
      setOhneInternet(livePlannerDraft.ohneInternet);
      setOhneKI(livePlannerDraft.ohneKI);
      setLerngruppenText('');
    }
  };

  const result: AdaptScenarioResult | null = useMemo(() => {
    if (!bundle) return null;
    if (inputMode === 'planner' && livePlannerDraft) {
      return adaptScenario(bundle, {
        arrangement: livePlannerDraft.arrangement,
        scenarioText: livePlannerDraft.scenarioText || livePlannerDraft.title,
        lerngruppenText: lerngruppenText.trim() || undefined,
        gruppen: !lerngruppenText.trim() && livePlannerDraft.groups?.length
          ? livePlannerDraft.groups
              .filter((g) => g.active)
              .map((g) => ({
                id: g.id,
                label: g.label,
                count: g.count,
                personaId: g.personaId,
                selectedValues: g.matrixValues
              }))
          : undefined,
        fach: livePlannerDraft.fach,
        thema: livePlannerDraft.thema,
        bildungsstufe: bildungsstufe || undefined,
        zeitMin: Number(zeitMin) || undefined,
        maxTechnik: maxTechnik || undefined,
        ohneInternet,
        ohneKI,
        maxAufwand: maxAufwand || undefined,
        includeSystemMeasures
      });
    }
    if (inputMode === 'saved' && activeSaved) {
      return adaptScenario(bundle, {
        arrangement: activeSaved.arrangement,
        scenarioText: activeSaved.scenarioText || activeSaved.title,
        lerngruppenText: lerngruppenText.trim() || undefined,
        gruppen: !lerngruppenText.trim() && activeSaved.groups?.length
          ? activeSaved.groups
              .filter((g) => g.active)
              .map((g) => ({
                id: g.id,
                label: g.label,
                count: g.count,
                personaId: g.personaId,
                selectedValues: g.matrixValues
              }))
          : undefined,
        fach: activeSaved.fach,
        thema: activeSaved.thema,
        bildungsstufe: bildungsstufe || undefined,
        zeitMin: Number(zeitMin) || undefined,
        maxTechnik: maxTechnik || undefined,
        ohneInternet,
        ohneKI,
        maxAufwand: maxAufwand || undefined,
        includeSystemMeasures
      });
    }
    return adaptScenario(bundle, {
      scenarioText,
      lerngruppenText,
      bildungsstufe: bildungsstufe || undefined,
      zeitMin: Number(zeitMin) || undefined,
      maxTechnik: maxTechnik || undefined,
      ohneInternet,
      ohneKI,
      maxAufwand: maxAufwand || undefined,
      includeSystemMeasures
    });
  }, [
    bundle,
    inputMode,
    livePlannerDraft,
    activeSaved,
    scenarioText,
    lerngruppenText,
    bildungsstufe,
    zeitMin,
    maxTechnik,
    ohneInternet,
    ohneKI,
    maxAufwand,
    includeSystemMeasures
  ]);

  const applyPreset = (p: QuickPreset) => {
    setInputMode('free');
    setActivePresetId(p.id);
    setScenarioText(p.scenarioText);
    setLerngruppenText(p.lerngruppenText);
    setBildungsstufe(p.bildungsstufe);
    setZeitMin(String(p.zeitMin));
    setMaxTechnik(p.maxTechnik);
    setOhneInternet(p.ohneInternet);
  };

  const toggleGroupChip = (chip: GroupChip) => {
    setActivePresetId('');
    const current = lerngruppenText.trim();
    if (chip.match.test(current)) {
      const parts = current
        .split(/,|;|\bund\b/i)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !chip.match.test(s));
      setLerngruppenText(parts.join(', '));
    } else {
      setLerngruppenText(current ? `${current}, ${chip.snippet}` : chip.snippet);
    }
  };

  const activeScenarioTitle =
    inputMode === 'planner' && livePlannerDraft
      ? livePlannerDraft.title
      : inputMode === 'saved' && activeSaved
        ? activeSaved.title
        : scenarioText;

  const handleCopyMarkdown = async () => {
    if (!result) return;
    const md = buildMarkdownChecklist(result, activeScenarioTitle);
    try {
      await navigator.clipboard.writeText(md);
      setCopyNotice('Checkliste als Markdown kopiert.');
      setTimeout(() => setCopyNotice(null), 3000);
    } catch {
      setCopyNotice('Kopieren nicht möglich – nutze bitte den JSON-Download.');
    }
  };

  const handleDownloadJson = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fmt-differenzierungsplan.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrintPdf = () => {
    if (!result) return;
    const md = buildMarkdownChecklist(result, activeScenarioTitle);
    const html = exportMarkdownToPrintableHtml(
      `Binnendifferenzierungsplan · ${result.kontext.thema || activeScenarioTitle || 'Szenario'}`,
      md
    );
    printHtmlDocument(html);
  };

  const handleSendToPlanner = () => {
    const returnToStep3 = inputMode === 'planner' && Boolean(livePlannerDraft);
    const det = lerngruppenText.trim()
      ? detectLearnerGroupsFromText(lerngruppenText)
      : returnToStep3 && livePlannerDraft
        ? {
            groups: livePlannerDraft.groups
              .filter((g) => g.active)
              .map((g) => ({
                id: g.id,
                label: g.label,
                count: g.count,
                personaId: g.personaId,
                selectedValues: g.matrixValues || {}
              }))
          }
        : detectLearnerGroupsFromText(scenarioText);

    const handoff = {
      scenarioText: [scenarioText.trim(), lerngruppenText.trim()].filter(Boolean).join(' · '),
      maxTechnik,
      ohneInternet,
      ohneKI,
      returnToStep3,
      groups: det.groups.map((g) => ({
        id: g.id,
        label: g.label,
        count: g.count,
        personaId: 'personaId' in g ? g.personaId : undefined,
        matrixValues: g.selectedValues || {}
      }))
    };
    try {
      sessionStorage.setItem(DIFF_HANDOFF_KEY, JSON.stringify(handoff));
    } catch {
      // ignore storage errors
    }
    navigate('/planer?from=diff');
  };

  const showSection = (tab: Exclude<ResultTab, 'alle'>) => activeTab === 'alle' || activeTab === tab;

  const filterSummary = [
    formatStageLabel(bildungsstufe),
    zeitMin ? `${zeitMin} Min.` : 'Zeit offen',
    formatTechSummary(maxTechnik, ohneInternet, ohneKI),
    maxAufwand ? `Aufwand: ${formatEffortLabel(maxAufwand)}` : null,
    includeSystemMeasures ? 'inkl. Schulorganisation' : 'nur Unterricht & Material'
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="diff-wrap">
      {/* Compact Header */}
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 30, fontFamily: 'var(--display)' }}>
          Binnendifferenzierung &amp; Szenario-Anpassung
        </h1>
        <p className="muted" style={{ margin: '6px 0 0', maxWidth: 820, fontSize: 15.5 }}>
          Überprüfe einen Unterrichtsentwurf oder dein laufendes Baukasten-Szenario auf heterogene Lernvoraussetzungen:
          gemeinsame Basis (UDL), Zielkonflikte mit Lösungen und passende FMT-Methoden.
        </p>
      </header>

      {/* Unified Input Card: Step 1 (Scenario) + Step 2 (Learner Groups) + Collapsible Constraints */}
      <section className="card" style={{ padding: 22, marginBottom: 20 }} aria-label="Eingaben für die Differenzierung">
        {/* Source Selector */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          <div className="diff-segmented" role="group" aria-label="Quelle auswählen">
            {livePlannerDraft && (
              <button
                type="button"
                className={`diff-segmented-btn ${inputMode === 'planner' ? 'is-active' : ''}`}
                onClick={() => switchMode('planner')}
              >
                Aktuelles Baukasten-Szenario
              </button>
            )}
            <button
              type="button"
              className={`diff-segmented-btn ${inputMode === 'free' ? 'is-active' : ''}`}
              onClick={() => switchMode('free')}
            >
              Eigenes Szenario
            </button>
            <button
              type="button"
              className={`diff-segmented-btn ${inputMode === 'saved' ? 'is-active' : ''}`}
              disabled={savedScenarios.length === 0}
              title={savedScenarios.length === 0 ? 'Noch kein Szenario im Baukasten gespeichert' : 'Gespeichertes Baukasten-Szenario laden'}
              onClick={() => switchMode('saved')}
            >
              Gespeichert ({savedScenarios.length})
            </button>
          </div>
          {!livePlannerDraft && (
            <Link to="/planer" className="muted" style={{ fontSize: 13.5 }}>
              Oder direkt im Szenario-Baukasten planen →
            </Link>
          )}
        </div>

        {/* Step 1: Scenario */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span className="diff-section-num" aria-hidden="true">1</span>
            <label htmlFor="diff-scenario-input" style={{ fontSize: 15.5, fontWeight: 700, fontFamily: 'var(--display)' }}>
              Unterrichtsszenario
            </label>
          </div>

          {inputMode === 'planner' && livePlannerDraft ? (
            <div className="diff-live-banner">
              <div>
                <strong style={{ fontSize: 15 }}>{livePlannerDraft.title}</strong>
                <div className="muted" style={{ fontSize: 13.5, marginTop: 2 }}>
                  Live aus dem Szenario-Baukasten · {result ? result.phasenAnpassungen.length : 0} Phasen ·{' '}
                  {livePlannerDraft.groups.filter((g) => g.active).length} Teilgruppen voreingestellt
                </div>
              </div>
              <Link to="/planer" className="btn btn-sm">
                Im Baukasten bearbeiten →
              </Link>
            </div>
          ) : inputMode === 'saved' && activeSaved ? (
            <select
              id="diff-scenario-input"
              className="diff-field-input"
              value={activeSaved.id}
              onChange={(e) => setSelectedSavedId(e.target.value)}
            >
              {savedScenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} ({s.fach || 'ohne Fach'})
                </option>
              ))}
            </select>
          ) : (
            <>
              <textarea
                id="diff-scenario-input"
                className="diff-field-textarea"
                rows={3}
                value={scenarioText}
                onChange={(e) => {
                  setActivePresetId('');
                  setScenarioText(e.target.value);
                }}
                placeholder="Fach, Klasse/Stufe, Thema und geplante Aktivitäten kurz beschreiben …"
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginTop: 6, fontSize: 13 }}>
                <span className="muted">Beispiel laden:</span>
                {QUICK_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`diff-preset-link ${activePresetId === p.id ? 'is-active' : ''}`}
                    onClick={() => applyPreset(p)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Step 2: Learner Groups */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <span className="diff-section-num" aria-hidden="true">2</span>
            <label htmlFor="diff-groups-input" style={{ fontSize: 15.5, fontWeight: 700, fontFamily: 'var(--display)' }}>
              Lerngruppe &amp; Voraussetzungen
            </label>
            <span className="muted" style={{ fontSize: 13 }}>
              {inputMode === 'planner' && !lerngruppenText.trim()
                ? '(Nutzt aktuell die Teilgruppen aus dem Baukasten – Klick zum Überschreiben)'
                : '(Per Klick auswählen oder unten frei ergänzen)'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 10 }} role="group" aria-label="Häufige Lernvoraussetzungen auswählen">
            {GROUP_CHIPS.map((chip) => {
              const active = chip.match.test(lerngruppenText);
              return (
                <button
                  key={chip.id}
                  type="button"
                  aria-pressed={active}
                  className={`diff-chip-toggle ${active ? 'is-active' : ''}`}
                  onClick={() => toggleGroupChip(chip)}
                >
                  <span>{active ? '✓' : '+'}</span>
                  {chip.label}
                </button>
              );
            })}
          </div>

          <input
            id="diff-groups-input"
            type="text"
            className="diff-field-input"
            value={lerngruppenText}
            onChange={(e) => {
              setActivePresetId('');
              setLerngruppenText(e.target.value);
            }}
            placeholder={
              inputMode === 'planner'
                ? 'Leer lassen für die Baukasten-Teilgruppen – oder hier gezielt ergänzen (z. B. 5 DaZ-Kinder, 2 ADHS)'
                : 'Optional genauer beschreiben, z. B. 24 Kinder: 5 DaZ-Kinder, 2 mit ADHS, 4 sehr leistungsstarke Kinder'
            }
          />
        </div>

        {/* Collapsible Constraints Drawer */}
        <details className="diff-filters-details">
          <summary className="diff-filters-summary">
            <span>
              <strong>Rahmenbedingungen:</strong> {filterSummary}
            </span>
            <span style={{ fontFamily: 'var(--display)', fontWeight: 600, color: 'var(--dA)' }}>
              Filter anpassen ▾
            </span>
          </summary>

          <div className="diff-constraints-grid">
            <label>
              Bildungsstufe
              <select value={bildungsstufe} onChange={(e) => setBildungsstufe(e.target.value)}>
                <option value="">Alle Stufen</option>
                <option value="primar">Primarstufe</option>
                <option value="sek1">Sekundarstufe I</option>
                <option value="sek2">Sekundarstufe II</option>
                <option value="berufsbildung">Berufsbildung</option>
                <option value="hochschule">Hochschule</option>
                <option value="erwachsenenbildung">Erwachsenenbildung</option>
              </select>
            </label>
            <label>
              Unterrichtszeit (Min.)
              <input
                type="number"
                min={10}
                max={360}
                value={zeitMin}
                onChange={(e) => setZeitMin(e.target.value)}
              />
            </label>
            <label>
              Verfügbare Technik
              <select value={maxTechnik} onChange={(e) => setMaxTechnik(e.target.value)}>
                <option value="">Keine Einschränkung</option>
                <option value="t-keine">Analog (ohne Geräte)</option>
                <option value="t-projektion">Nur Beamer / Projektion</option>
                <option value="t-einzeln">Endgeräte für Lernende</option>
              </select>
            </label>
            <label>
              Max. Vorbereitung
              <select
                value={maxAufwand}
                onChange={(e) => setMaxAufwand(e.target.value as MeasureEffort | '')}
              >
                <option value="">Alle Aufwände</option>
                <option value="sofort">Nur sofort (0 Min.)</option>
                <option value="kurz">Bis kurz (~5–10 Min.)</option>
                <option value="mittel">Bis mittel (&gt;15 Min.)</option>
              </select>
            </label>
          </div>

          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center', marginTop: 12, fontSize: 14 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={ohneInternet} onChange={(e) => setOhneInternet(e.target.checked)} />
              Ohne Internet
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={ohneKI} onChange={(e) => setOhneKI(e.target.checked)} />
              Ohne KI
            </label>
            <label
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
              title="Zeigt zusätzlich schulorganisatorische Maßnahmen (z. B. Förderstunden, Notenvergabe), die über eine Einzelstunde hinausgehen."
            >
              <input
                type="checkbox"
                checked={includeSystemMeasures}
                onChange={(e) => setIncludeSystemMeasures(e.target.checked)}
              />
              Auch Schul-/Systemmaßnahmen anzeigen
            </label>
          </div>
        </details>
      </section>

      {/* Step 3: Unified Results Card */}
      {result && (
        <section className="card" style={{ padding: 22 }} aria-label="Anpassungsplan">
          {/* Header + Export / Handoff Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span className="diff-section-num" style={{ marginTop: 3 }} aria-hidden="true">3</span>
              <div>
                <h2 style={{ margin: 0, fontSize: 22, fontFamily: 'var(--display)' }}>
                  Dein Anpassungsplan
                </h2>
                <div className="muted" style={{ fontSize: 13.5, marginTop: 2 }}>
                  Aktiv für:{' '}
                  {result.teilgruppen.map((tg) => `${tg.label}${tg.count ? ` (${tg.count})` : ''}`).join(' · ')}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" onClick={handleSendToPlanner}>
                {inputMode === 'planner' && livePlannerDraft
                  ? 'In Baukasten übernehmen (Schritt 3) →'
                  : 'Im Szenario-Baukasten weiterplanen →'}
              </button>
              <button type="button" className="btn" onClick={handlePrintPdf}>
                Drucken / PDF
              </button>
              <button type="button" className="btn" onClick={() => void handleCopyMarkdown()}>
                Checkliste kopieren
              </button>
              <button type="button" className="btn" onClick={handleDownloadJson}>
                JSON
              </button>
            </div>
          </div>

          {copyNotice && (
            <div className="diff-pill diff-pill-pos" style={{ marginBottom: 12 }}>
              {copyNotice}
            </div>
          )}

          {/* View Tabs (Focused default: 1. Basis für alle, WCAG arrow-key navigable) */}
          <div
            className="diff-tabs"
            role="tablist"
            aria-label="Bereiche des Anpassungsplans"
            onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
              const order: ResultTab[] = ['udl', 'konflikte', 'teilgruppen', 'phasen', 'alle'];
              const idx = order.indexOf(activeTab);
              if (e.key === 'ArrowRight') {
                e.preventDefault();
                setActiveTab(order[(idx + 1) % order.length]);
              } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                setActiveTab(order[(idx - 1 + order.length) % order.length]);
              }
            }}
          >
            <button
              id="diff-tab-udl"
              type="button"
              role="tab"
              aria-selected={activeTab === 'udl'}
              aria-controls="diff-panel-content"
              className={`diff-tab ${activeTab === 'udl' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('udl')}
            >
              1. Basis für alle ({result.udlBasis.length})
            </button>
            <button
              id="diff-tab-konflikte"
              type="button"
              role="tab"
              aria-selected={activeTab === 'konflikte'}
              aria-controls="diff-panel-content"
              className={`diff-tab ${activeTab === 'konflikte' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('konflikte')}
            >
              2. Zielkonflikte ({result.konflikte.length})
            </button>
            <button
              id="diff-tab-teilgruppen"
              type="button"
              role="tab"
              aria-selected={activeTab === 'teilgruppen'}
              aria-controls="diff-panel-content"
              className={`diff-tab ${activeTab === 'teilgruppen' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('teilgruppen')}
            >
              3. Nach Teilgruppe ({result.teilgruppen.length})
            </button>
            <button
              id="diff-tab-phasen"
              type="button"
              role="tab"
              aria-selected={activeTab === 'phasen'}
              aria-controls="diff-panel-content"
              className={`diff-tab ${activeTab === 'phasen' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('phasen')}
            >
              4. Nach Phase ({result.phasenAnpassungen.length})
            </button>
            <button
              id="diff-tab-alle"
              type="button"
              role="tab"
              aria-selected={activeTab === 'alle'}
              aria-controls="diff-panel-content"
              className={`diff-tab ${activeTab === 'alle' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('alle')}
            >
              Gesamtansicht
            </button>
          </div>

          <div
            id="diff-panel-content"
            role="tabpanel"
            aria-labelledby={`diff-tab-${activeTab}`}
            style={{ display: 'flex', flexDirection: 'column', gap: 26 }}
          >
            {/* 1. UDL Basis */}
            {showSection('udl') && (
              <div>
                <h3 style={{ margin: 0, fontSize: 19, fontFamily: 'var(--display)' }}>
                  1. Gemeinsame Basis für alle (UDL – Universal Design for Learning)
                </h3>
                <p className="diff-section-lead">
                  Hilft allen {result.kontext.anzahlTeilgruppen} Teilgruppen gleichzeitig – einmal einplanen, für die ganze Klasse wirksam.
                </p>

                {result.udlBasis.length === 0 ? (
                  <p className="muted" style={{ marginTop: 12 }}>
                    Keine gemeinsame Überschneidung unter den aktuellen Filtern – wechsle auf „3. Nach Teilgruppe“ oder lockere die Rahmenbedingungen.
                  </p>
                ) : (
                  <div className="diff-grid-2">
                    {result.udlBasis.map((u) => (
                      <article key={u.id} className="diff-item-card">
                        <div className="diff-item-head">
                          <strong style={{ fontSize: 15.5, lineHeight: 1.3 }}>{u.name}</strong>
                          <span
                            className="diff-pill diff-pill-pos"
                            title="Normalisierter Passungswert aus der Differenzierungsmatrix (-100 % bis +100 %), keine empirische Effektstärke."
                          >
                            Passung ≥ +{u.minNormalizedScore} %
                          </span>
                        </div>
                        <div className="muted" style={{ fontSize: 12.5 }}>
                          {formatLevelLabel(u.meta.ebene)} · {formatEffortLabel(u.meta.aufwand)} · {u.oberKategorieName}
                        </div>
                        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{u.meta.umsetzungsimpuls}</p>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 2. Zielkonflikte */}
            {showSection('konflikte') && (
              <div>
                <h3 style={{ margin: 0, fontSize: 19, fontFamily: 'var(--display)' }}>
                  2. Zielkonflikte zwischen Teilgruppen &amp; Auflösungsstrategien
                </h3>
                <p className="diff-section-lead">
                  Wo dieselbe Maßnahme einer Gruppe hilft, aber eine andere bremst – mit konkretem Vorschlag, wie beides im selben Unterricht klappt.
                </p>

                {result.konflikte.length === 0 ? (
                  <p className="muted" style={{ marginTop: 12 }}>
                    Für diese Gruppenkombination wurden keine starken Zielkonflikte erkannt.
                  </p>
                ) : (
                  <div className="diff-grid-2">
                    {result.konflikte.map((k) => (
                      <article key={k.measureId} className="diff-item-card">
                        <div className="diff-item-head">
                          <div>
                            <strong style={{ fontSize: 15.5 }}>{k.measureName}</strong>
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
                        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
                          <strong>Auflösung:</strong> {k.aufloesungsstrategie}
                        </p>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 3. Teilgruppen */}
            {showSection('teilgruppen') && (
              <div>
                <h3 style={{ margin: 0, fontSize: 19, fontFamily: 'var(--display)' }}>
                  3. Gezielte Anpassungen pro Teilgruppe
                </h3>
                <p className="diff-section-lead">
                  Was jede Teilgruppe zusätzlich zur gemeinsamen Basis braucht – und was du für diese Gruppe gezielt weglassen solltest.
                </p>

                <div className="diff-grid-2">
                  {result.teilgruppen.map((tg) => (
                    <article key={tg.id} className="diff-item-card">
                      <div className="diff-item-head">
                        <strong style={{ fontSize: 15.5 }}>
                          {tg.label}
                          {tg.count ? ` (${tg.count})` : ''}
                        </strong>
                        <span className="diff-pill diff-pill-info">
                          {formatGuidanceLabel(tg.didacticProfile.preferredGuidance)}
                        </span>
                      </div>

                      <ul style={{ margin: '2px 0 0', paddingLeft: 18, fontSize: 14, display: 'flex', flexDirection: 'column', gap: 7 }}>
                        {tg.spezifischeMassnahmen.map((m) => (
                          <li key={m.id}>
                            <strong>{m.name}</strong>{' '}
                            <span className="muted" style={{ fontSize: 12.5 }}>
                              (+{m.normalizedScore} % · {formatEffortLabel(m.meta.aufwand)})
                            </span>
                            <div className="muted" style={{ fontSize: 13, marginTop: 1 }}>{m.meta.umsetzungsimpuls}</div>
                          </li>
                        ))}
                      </ul>

                      {tg.vermeiden.length > 0 && (
                        <div style={{ marginTop: 4, paddingTop: 8, borderTop: '1px solid var(--rule)', fontSize: 13, color: 'var(--err)' }}>
                          <strong>Eher vermeiden:</strong>{' '}
                          {tg.vermeiden.map((v) => `${v.name} (${v.normalizedScore} %)`).join(' · ')}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            )}

            {/* 4. Phasen-Anpassungen */}
            {showSection('phasen') && (
              <div>
                <h3 style={{ margin: 0, fontSize: 19, fontFamily: 'var(--display)' }}>
                  4. Phasen-Anpassungen &amp; passende FMT-Methoden
                </h3>
                <p className="diff-section-lead">
                  Konkrete Umsetzung entlang der Unterrichtsphasen – mit direkt verlinkten FMT-Methodenbausteinen.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
                  {result.phasenAnpassungen.map((p) => (
                    <article key={p.key} className="diff-item-card">
                      <div className="diff-item-head">
                        <strong style={{ fontSize: 15.5 }}>
                          {p.orderLabel}. {p.phaseLabel}
                          {p.bausteinName ? ` – ${p.bausteinName}` : ''}
                        </strong>
                        <span className="diff-pill">
                          {p.lernfunktion}{p.durationMin ? ` · ca. ${p.durationMin} Min.` : ''}
                        </span>
                      </div>

                      {p.methodenKontext && (
                        <div
                          style={{
                            padding: '8px 10px',
                            borderRadius: 6,
                            background: 'var(--surface)',
                            borderLeft: '3px solid var(--dA)',
                            fontSize: 13,
                            lineHeight: 1.45
                          }}
                        >
                          <strong>Methoden-Kontext ({p.bausteinName}):</strong>{' '}
                          {p.methodenKontext.methodenAnpassungshinweis}
                        </div>
                      )}

                      {p.passendeFmtMethoden.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
                          <span className="muted" style={{ fontWeight: 600 }}>Passende FMT-Methoden:</span>
                          {p.passendeFmtMethoden.map((m) => (
                            <Link
                              key={m.kennung}
                              to={`/methoden/${m.kennung}`}
                              className="diff-pill diff-pill-info"
                              style={{ textDecoration: 'none' }}
                              title={m.grund}
                            >
                              {m.name} ({m.dauerMin}–{m.dauerMax} Min.{m.evidenzgrad ? `, Grad ${m.evidenzgrad}` : ''})
                            </Link>
                          ))}
                        </div>
                      )}

                      <div className="diff-grid-2" style={{ marginTop: 4 }}>
                        {p.teilgruppenImpulse.map((ti) => (
                          <div
                            key={ti.groupId}
                            style={{
                              fontSize: 13.5,
                              padding: '10px 12px',
                              background: 'var(--surface)',
                              borderRadius: 6,
                              border: '1px solid var(--rule)'
                            }}
                          >
                            <strong>{ti.groupLabel}</strong>
                            <div style={{ marginTop: 3 }}>
                              {ti.massnahmen.map((m) => `${m.name} (+${m.normalizedScore} %)`).join(' · ')}
                            </div>
                            {ti.alternativeMethoden.length > 0 && (
                              <div className="muted" style={{ fontSize: 12.5, marginTop: 5 }}>
                                Alternative FMT-Methode: {ti.alternativeMethoden.slice(0, 2).map((a) => a.name).join(', ')}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Quiet Methodological Footer */}
          <div style={{ marginTop: 22, paddingTop: 14, borderTop: '1px solid var(--rule)', fontSize: 13, color: 'var(--ink-2)' }}>
            <strong>Einordnung:</strong> {result.epistemischerHinweis}{' '}
            Auch per REST-API (<code>POST /api/v1/adapt</code>) und MCP-Tool (<code>adapt_scenario</code>) direkt im Chat nutzbar.
          </div>
        </section>
      )}
    </div>
  );
}
