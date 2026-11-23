import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  adaptScenario,
  detectLearnerGroupsFromText,
  type AdaptScenarioResult,
  type MeasureEffort,
  type MeasureLevel
} from '@fmt/core';
import { useCatalog } from '../data/CatalogContext.js';
import { loadSavedScenarios, type SavedScenario } from '../planner/scenarioStorage.js';

export const DIFF_HANDOFF_KEY = 'fmt_diff_handoff_v1';

type ResultTab = 'alle' | 'udl' | 'konflikte' | 'teilgruppen' | 'phasen';

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

const GROUP_CHIPS: GroupChip[] = [
  { id: 'daz', label: 'DaZ / Sprachförderung', snippet: 'DaZ-Kinder', match: /\bdaz\b|sprachsensib|sprachförder|mehrsprach/i },
  { id: 'adhs', label: 'ADHS / Fokusstruktur', snippet: 'ADHS', match: /\badhs\b|\bads\b|konzentration|aufmerksamkeit/i },
  { id: 'lrs', label: 'LRS / Lesen & Schreiben', snippet: 'LRS', match: /\blrs\b|legasthen|lese-?rechtschreib/i },
  { id: 'lernen', label: 'Förderbedarf Lernen', snippet: 'Förderbedarf Lernen', match: /förderbedarf\s*lernen|lernschwierigkeit|sonderpädagog/i },
  { id: 'vorwissen', label: 'Geringes Vorwissen', snippet: 'geringes Vorwissen', match: /gering(?:es|em)?\s+vorwissen|wenig\s+vorwissen|basisunterstütz/i },
  { id: 'stark', label: 'Leistungsstark / Vertiefung', snippet: 'leistungsstarke Lernende', match: /leistungsstark|hochbegab|vertiefung|schnell/i },
  { id: 'ruhig', label: 'Schüchtern / geringe Beteiligung', snippet: 'schüchterne Lernende', match: /schüchtern|zurückhalt|geringe\s+beteiligung|angst/i },
  { id: 'barriere', label: 'Sehen / Hören / Motorik', snippet: 'Seh- oder Hörbeeinträchtigung', match: /sehbeeintr|hörbeeintr|motorik|barriere/i }
];

const QUICK_PRESETS: QuickPreset[] = [
  {
    id: 'inklusion-mathe',
    label: 'Grundschule Mathe · Inklusion (45 min, analog)',
    scenarioText: 'Mathematik Klasse 4: Bruchteile entdecken (Hälfte und Viertel) durch Papierfalten, Vergleichen und erste Aufgaben, 45 Minuten, ohne Geräte, ohne Internet.',
    lerngruppenText: '24 Kinder: 5 DaZ-Kinder, 2 Kinder mit ADHS und 4 sehr leistungsstarke Kinder',
    bildungsstufe: 'primar',
    zeitMin: 45,
    maxTechnik: 't-keine',
    ohneInternet: true
  },
  {
    id: 'daz-sek1',
    label: 'Sek I Bio · DaZ & LRS (90 min)',
    scenarioText: 'Biologie Klasse 7 Doppelstunde: Ökosystem Wald und Nahrungsketten anhand eines Sachtextes und Schaubildes erarbeiten, 90 Minuten.',
    lerngruppenText: '26 Lernende: 6 DaZ-Kinder, 3 mit LRS und 5 leistungsstarke Lernende',
    bildungsstufe: 'sek1',
    zeitMin: 90,
    maxTechnik: 't-projektion',
    ohneInternet: false
  },
  {
    id: 'adhs-foerder',
    label: 'Fördergruppe ADHS & Lernen (45 min, analog)',
    scenarioText: 'Fördergruppe Klasse 3: Leseverständnis an kurzen Alltagsgeschichten üben, 45 Minuten, analog ohne Geräte.',
    lerngruppenText: '6 Kinder mit ADHS, Förderbedarf Lernen und LRS',
    bildungsstufe: 'primar',
    zeitMin: 45,
    maxTechnik: 't-keine',
    ohneInternet: true
  },
  {
    id: 'sek2-diskurs',
    label: 'Oberstufe Geschichte · Heterogenes Vorwissen (90 min)',
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
      return '~5–10 Min. Vorbereitung';
    case 'mittel':
      return '>15 Min. Vorbereitung';
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
  if (maxTechnik === 't-keine') parts.push('analog');
  else if (maxTechnik === 't-projektion') parts.push('nur Beamer/Tafel');
  else if (maxTechnik === 't-einzeln') parts.push('Endgeräte vorhanden');
  if (ohneInternet) parts.push('offline');
  if (ohneKI) parts.push('ohne KI');
  return parts.length ? parts.join(', ') : 'Technik frei';
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

  const [inputMode, setInputMode] = useState<'free' | 'saved'>('free');
  const [activePresetId, setActivePresetId] = useState<string>(QUICK_PRESETS[0].id);
  const [scenarioText, setScenarioText] = useState(QUICK_PRESETS[0].scenarioText);
  const [lerngruppenText, setLerngruppenText] = useState(QUICK_PRESETS[0].lerngruppenText);
  const [bildungsstufe, setBildungsstufe] = useState(QUICK_PRESETS[0].bildungsstufe);
  const [zeitMin, setZeitMin] = useState<string>(String(QUICK_PRESETS[0].zeitMin));
  const [maxTechnik, setMaxTechnik] = useState(QUICK_PRESETS[0].maxTechnik);
  const [ohneInternet, setOhneInternet] = useState(QUICK_PRESETS[0].ohneInternet);
  const [ohneKI, setOhneKI] = useState(false);
  const [maxAufwand, setMaxAufwand] = useState<MeasureEffort | ''>('');
  const [includeSystemMeasures, setIncludeSystemMeasures] = useState(false);
  const [selectedSavedId, setSelectedSavedId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<ResultTab>('alle');
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

  const savedScenarios: SavedScenario[] = useMemo(() => {
    try {
      return loadSavedScenarios();
    } catch {
      return [];
    }
  }, []);

  const activeSaved = useMemo(
    () => savedScenarios.find((s) => s.id === selectedSavedId) || savedScenarios[0] || null,
    [savedScenarios, selectedSavedId]
  );

  const result: AdaptScenarioResult | null = useMemo(() => {
    if (!bundle) return null;
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
      // Remove matching comma/und-separated clause cleanly
      const parts = current
        .split(/,|;|\bund\b/i)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !chip.match.test(s));
      setLerngruppenText(parts.join(', '));
    } else {
      setLerngruppenText(current ? `${current}, ${chip.snippet}` : chip.snippet);
    }
  };

  const handleCopyMarkdown = async () => {
    if (!result) return;
    const md = buildMarkdownChecklist(result, inputMode === 'saved' && activeSaved ? activeSaved.title : scenarioText);
    try {
      await navigator.clipboard.writeText(md);
      setCopyNotice('Anpassungs-Checkliste als Markdown in die Zwischenablage kopiert.');
      setTimeout(() => setCopyNotice(null), 3500);
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

  const handleSendToPlanner = () => {
    const det = detectLearnerGroupsFromText(lerngruppenText || scenarioText);
    const handoff = {
      scenarioText: [scenarioText.trim(), lerngruppenText.trim()].filter(Boolean).join(' · '),
      maxTechnik,
      ohneInternet,
      ohneKI,
      groups: det.groups.map((g) => ({
        id: g.id,
        label: g.label,
        count: g.count,
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

  return (
    <div className="diff-wrap">
      {/* Page Header */}
      <header style={{ marginBottom: 6 }}>
        <h1 style={{ margin: 0, fontSize: 32, fontFamily: 'var(--display)' }}>
          Binnendifferenzierung &amp; Szenario-Anpassung
        </h1>
        <p className="muted" style={{ margin: '8px 0 0', maxWidth: 860, fontSize: 16 }}>
          Beschreibe deinen Unterricht und wähle die Lernvoraussetzungen deiner Gruppe – du erhältst sofort
          einen praxisfertigen Anpassungsplan: was <strong>allen gleichzeitig hilft</strong>, wie du{' '}
          <strong>Zielkonflikte zwischen Gruppen löst</strong> und welche <strong>FMT-Methoden</strong> dazu passen.
        </p>
      </header>

      {/* Clear 3-Step Usage Guide */}
      <div className="diff-guide" aria-label="So funktioniert diese Seite">
        <div className="diff-guide-step">
          <span className="diff-step-num" aria-hidden="true">1</span>
          <div>
            <strong>Unterricht beschreiben</strong>
            <div className="muted">Eigenen Stundenentwurf eintragen, ein Beispiel anklicken oder ein Baukasten-Szenario laden.</div>
          </div>
        </div>
        <div className="diff-guide-step">
          <span className="diff-step-num" aria-hidden="true">2</span>
          <div>
            <strong>Lerngruppe markieren</strong>
            <div className="muted">Teilgruppen per Klick aktivieren (z. B. DaZ, ADHS, Leistungsstarke) oder frei beschreiben.</div>
          </div>
        </div>
        <div className="diff-guide-step">
          <span className="diff-step-num" aria-hidden="true">3</span>
          <div>
            <strong>Plan direkt nutzen</strong>
            <div className="muted">Ergebnisse aktualisieren sich live – als Checkliste kopieren oder in den Szenario-Baukasten übernehmen.</div>
          </div>
        </div>
      </div>

      {/* Input Card: Step 1 & Step 2 */}
      <section className="card" style={{ padding: 22, marginBottom: 22 }} aria-label="Eingaben für die Differenzierung">
        {/* Source Mode + Examples */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 14, marginBottom: 16, borderBottom: '1px solid var(--rule)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', fontFamily: 'var(--display)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Ausgangspunkt:
              </span>
              <button
                type="button"
                className={`btn btn-sm ${inputMode === 'free' ? 'btn-primary' : ''}`}
                onClick={() => setInputMode('free')}
              >
                Eigenes Szenario beschreiben
              </button>
              <button
                type="button"
                className={`btn btn-sm ${inputMode === 'saved' ? 'btn-primary' : ''}`}
                disabled={savedScenarios.length === 0}
                title={savedScenarios.length === 0 ? 'Speichere zuerst ein Szenario im Szenario-Baukasten' : 'Ein gespeichertes Baukasten-Szenario laden'}
                onClick={() => setInputMode('saved')}
              >
                Aus Baukasten laden ({savedScenarios.length})
              </button>
            </div>
          </div>

          {inputMode === 'free' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span className="muted" style={{ fontSize: 13, marginRight: 2 }}>
                Oder Beispiel laden:
              </span>
              {QUICK_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`btn btn-sm ${activePresetId === p.id ? 'btn-primary' : ''}`}
                  onClick={() => applyPreset(p)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Step 1: Scenario */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span className="diff-step-num" aria-hidden="true">1</span>
            <label htmlFor="diff-scenario-input" style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--display)' }}>
              {inputMode === 'saved' ? 'Gespeichertes Szenario aus dem Baukasten' : 'Was planst du im Unterricht?'}
            </label>
          </div>
          {inputMode === 'saved' && activeSaved ? (
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
            <textarea
              id="diff-scenario-input"
              className="diff-field-textarea"
              rows={3}
              value={scenarioText}
              onChange={(e) => {
                setActivePresetId('');
                setScenarioText(e.target.value);
              }}
              placeholder="z. B. Mathematik Klasse 4: Bruchteile entdecken (Hälfte und Viertel) durch Papierfalten und Partnerarbeit, 45 Minuten, ohne Geräte …"
            />
          )}
        </div>

        {/* Step 2: Learner Groups (Clickable Chips + Optional Free Text) */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span className="diff-step-num" aria-hidden="true">2</span>
            <label htmlFor="diff-groups-input" style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--display)' }}>
              Wer sitzt in deiner Lerngruppe?
            </label>
            <span className="muted" style={{ fontSize: 13 }}>
              (Per Klick auswählen oder unten frei ergänzen)
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
            placeholder="Optional genauer beschreiben, z. B. 24 Kinder: 5 DaZ-Kinder, 2 mit ADHS, 4 sehr leistungsstarke Kinder"
          />

          {/* Live feedback of detected subgroups */}
          {result && result.teilgruppen.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 9, fontSize: 13 }}>
              <span className="muted" style={{ fontWeight: 600 }}>Aktive Teilgruppen im Plan:</span>
              {result.teilgruppen.map((tg) => (
                <span key={tg.id} className="diff-pill diff-pill-info">
                  {tg.label}{tg.count ? ` (${tg.count})` : ''}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Constraints Bar */}
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
            Max. Vorbereitungsaufwand
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
            title="Zeigt zusätzlich langfristige schulorganisatorische Maßnahmen (z. B. Förderstunden, Notenvergabe), die über eine einzelne Stunde hinausgehen."
          >
            <input
              type="checkbox"
              checked={includeSystemMeasures}
              onChange={(e) => setIncludeSystemMeasures(e.target.checked)}
            />
            Auch Schul-/Systemmaßnahmen anzeigen
          </label>
        </div>
      </section>

      {/* Step 3: Results Area */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Result Header, Summary, View Tabs & Actions */}
          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span className="diff-step-num" aria-hidden="true">3</span>
                <div>
                  <h2 style={{ margin: 0, fontSize: 22, fontFamily: 'var(--display)' }}>
                    Dein Anpassungsplan
                  </h2>
                  <div className="muted" style={{ fontSize: 13.5 }}>
                    {result.kontext.anzahlTeilgruppen} Teilgruppen · {formatStageLabel(bildungsstufe)} ·{' '}
                    {zeitMin ? `${zeitMin} Min.` : 'Zeit offen'} · {formatTechSummary(maxTechnik, ohneInternet, ohneKI)}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary" onClick={handleSendToPlanner}>
                  Im Szenario-Baukasten weiterplanen →
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

            <div className="diff-tabs" role="tablist" aria-label="Bereiche des Anpassungsplans">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'alle'}
                className={`diff-tab ${activeTab === 'alle' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('alle')}
              >
                Gesamtplan
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'udl'}
                className={`diff-tab ${activeTab === 'udl' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('udl')}
              >
                1. Basis für alle ({result.udlBasis.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'konflikte'}
                className={`diff-tab ${activeTab === 'konflikte' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('konflikte')}
              >
                2. Zielkonflikte ({result.konflikte.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'teilgruppen'}
                className={`diff-tab ${activeTab === 'teilgruppen' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('teilgruppen')}
              >
                3. Nach Teilgruppe ({result.teilgruppen.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'phasen'}
                className={`diff-tab ${activeTab === 'phasen' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('phasen')}
              >
                4. Nach Phase ({result.phasenAnpassungen.length})
              </button>
            </div>
          </div>

          {/* 1. UDL Basis */}
          {showSection('udl') && (
            <section className="card" style={{ padding: 22, borderTop: '3px solid var(--dC)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: 21, fontFamily: 'var(--display)' }}>
                  1. Gemeinsame Basis für alle (UDL – Universal Design for Learning)
                </h3>
                <span className="diff-pill diff-pill-pos">
                  {result.udlBasis.length} Maßnahmen für alle {result.kontext.anzahlTeilgruppen} Teilgruppen
                </span>
              </div>
              <p className="diff-section-lead">
                Diese Maßnahmen wirken für <strong>alle aktiven Teilgruppen gleichzeitig positiv</strong>. Wenn du sie einmal einplanst,
                entlastet das die ganze Klasse – ohne für jede Gruppe eigene Sonderwege bauen zu müssen.
              </p>

              {result.udlBasis.length === 0 ? (
                <p className="muted" style={{ marginTop: 12 }}>
                  Unter den aktuellen Filtern gibt es keine gemeinsame Überschneidung – prüfe den Bereich „Nach Teilgruppe“ oder lockere den Aufwandsfilter.
                </p>
              ) : (
                <div className="diff-card-grid">
                  {result.udlBasis.map((u) => (
                    <article key={u.id} className="diff-measure-card">
                      <div className="diff-measure-head">
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
                      <p style={{ margin: '4px 0 0', fontSize: 14, lineHeight: 1.5 }}>{u.meta.umsetzungsimpuls}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 2. Zielkonflikte & Auflösungsstrategien */}
          {showSection('konflikte') && (
            <section className="card" style={{ padding: 22, borderTop: '3px solid var(--dB)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: 21, fontFamily: 'var(--display)' }}>
                  2. Zielkonflikte zwischen Teilgruppen &amp; Auflösungsstrategien
                </h3>
                <span className="diff-pill diff-pill-warn">
                  {result.konflikte.length} {result.konflikte.length === 1 ? 'Konflikt' : 'Konflikte'} erkannt
                </span>
              </div>
              <p className="diff-section-lead">
                Hier würde dieselbe Maßnahme einer Gruppe helfen, aber einer anderen schaden (z. B. sehr offene Aufgaben vs. Bedarf an klarer Struktur).
                Die Auflösungsstrategie zeigt, wie du beide Bedürfnisse in derselben Stunde zusammenbringst.
              </p>

              {result.konflikte.length === 0 ? (
                <p className="muted" style={{ marginTop: 12 }}>
                  Für die aktuelle Gruppenkombination wurden keine starken Zielkonflikte erkannt.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
                  {result.konflikte.map((k) => (
                    <article
                      key={k.measureId}
                      style={{
                        padding: '14px 16px',
                        borderRadius: 'var(--radius)',
                        background: 'var(--paper)',
                        border: '1px solid var(--dB)',
                        borderLeft: '4px solid var(--dB)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: 15.5 }}>{k.measureName}</strong>
                        <span className="muted" style={{ fontSize: 13 }}>({k.kategorieName})</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                        <span className="diff-pill diff-pill-pos">
                          ✓ Hilft: {k.staerkendFuer.map((x) => `${x.label} (+${x.normalizedScore} %)`).join(', ')}
                        </span>
                        <span className="diff-pill diff-pill-neg">
                          ⚠ Hemmt: {k.hemmendFuer.map((x) => `${x.label} (${x.normalizedScore} %)`).join(', ')}
                        </span>
                      </div>
                      <p style={{ margin: '10px 0 0', fontSize: 14.5, lineHeight: 1.5 }}>
                        <strong>So löst du es im Unterricht:</strong> {k.aufloesungsstrategie}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 3. Teilgruppen */}
          {showSection('teilgruppen') && (
            <section className="card" style={{ padding: 22, borderTop: '3px solid var(--dA)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: 21, fontFamily: 'var(--display)' }}>
                  3. Gezielte Anpassungen pro Teilgruppe
                </h3>
                <span className="diff-pill diff-pill-info">{result.teilgruppen.length} Teilgruppen</span>
              </div>
              <p className="diff-section-lead">
                Was jede einzelne Teilgruppe <strong>zusätzlich zur gemeinsamen Basis</strong> braucht – inklusive empfohlener Steuerungsart
                und Maßnahmen, die du für diese Gruppe bewusst weglassen solltest.
              </p>

              <div className="diff-card-grid">
                {result.teilgruppen.map((tg) => (
                  <article key={tg.id} className="diff-measure-card">
                    <div className="diff-measure-head">
                      <strong style={{ fontSize: 16 }}>
                        {tg.label}
                        {tg.count ? ` (${tg.count})` : ''}
                      </strong>
                      <span className="diff-pill diff-pill-info">
                        {formatGuidanceLabel(tg.didacticProfile.preferredGuidance)}
                      </span>
                    </div>

                    <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {tg.spezifischeMassnahmen.map((m) => (
                        <li key={m.id}>
                          <strong>{m.name}</strong>{' '}
                          <span className="muted" style={{ fontSize: 12.5 }}>
                            (+{m.normalizedScore} % · {formatEffortLabel(m.meta.aufwand)})
                          </span>
                          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{m.meta.umsetzungsimpuls}</div>
                        </li>
                      ))}
                    </ul>

                    {tg.vermeiden.length > 0 && (
                      <div
                        style={{
                          marginTop: 8,
                          padding: '8px 10px',
                          borderRadius: 6,
                          background: 'var(--err-soft)',
                          fontSize: 13,
                          color: 'var(--err)'
                        }}
                      >
                        <strong>Eher vermeiden:</strong>{' '}
                        {tg.vermeiden.map((v) => `${v.name} (${v.normalizedScore} %)`).join(' · ')}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* 4. Phasen-Anpassungen & passende FMT-Methoden */}
          {showSection('phasen') && (
            <section className="card" style={{ padding: 22, borderTop: '3px solid var(--dD)' }}>
              <h3 style={{ margin: 0, fontSize: 21, fontFamily: 'var(--display)' }}>
                4. Phasen-Anpassungen &amp; passende FMT-Methoden
              </h3>
              <p className="diff-section-lead">
                Konkrete Umsetzung entlang deiner Unterrichtsphasen – inklusive direkt verlinkter FMT-Methodenbausteine,
                die zu Bildungsstufe, Technik und Lerngruppe passen.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
                {result.phasenAnpassungen.map((p) => (
                  <article
                    key={p.key}
                    style={{
                      padding: 16,
                      borderRadius: 'var(--radius)',
                      background: 'var(--paper)',
                      border: '1px solid var(--rule)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 16 }}>
                        {p.orderLabel}. {p.phaseLabel}
                        {p.bausteinName ? ` – ${p.bausteinName}` : ''}
                      </strong>
                      <span className="muted" style={{ fontSize: 13 }}>
                        Lernfunktion: {p.lernfunktion}
                        {p.durationMin ? ` · ca. ${p.durationMin} Min.` : ''}
                      </span>
                    </div>

                    {p.passendeFmtMethoden.length > 0 && (
                      <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 13.5 }}>
                        <strong>Passende FMT-Methoden:</strong>
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

                    <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
                      {p.teilgruppenImpulse.map((ti) => (
                        <div key={ti.groupId} style={{ fontSize: 13.5, padding: '10px 12px', background: 'var(--surface)', borderRadius: 6, border: '1px solid var(--rule)' }}>
                          <strong>{ti.groupLabel}</strong>
                          <div style={{ marginTop: 4 }}>
                            {ti.massnahmen.map((m) => `${m.name} (+${m.normalizedScore} %)`).join(' · ')}
                          </div>
                          {ti.alternativeMethoden.length > 0 && (
                            <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                              Alternative FMT-Methode:{' '}
                              {ti.alternativeMethoden.slice(0, 2).map((a) => a.name).join(', ')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* Epistemic Note & MCP/API Hint */}
          <div className="card" style={{ padding: '14px 18px', fontSize: 13.5, color: 'var(--ink-2)' }}>
            <strong>Hinweis zur Einordnung:</strong> {result.epistemischerHinweis}{' '}
            <span>
              Diese Funktion steht auch per REST-API (<code>POST /api/v1/adapt</code>) und als MCP-Tool (<code>adapt_scenario</code>) direkt im KI-Chat zur Verfügung.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
