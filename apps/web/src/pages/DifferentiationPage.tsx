import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  adaptScenario,
  detectLearnerGroupsFromText,
  type AdaptScenarioResult,
  type MeasureEffort
} from '@fmt/core';
import { useCatalog } from '../data/CatalogContext.js';
import { loadSavedScenarios, type SavedScenario } from '../planner/scenarioStorage.js';

export const DIFF_HANDOFF_KEY = 'fmt_diff_handoff_v1';

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
    label: 'Sek I Deutsch/Bio · DaZ & LRS (90 min)',
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
    lerngruppenText: '22 Lernende: 4 mit sehr geringem Vorwissen und Sprachunterstützungsbedarf, 6 sehr leistungsstarke Lernende',
    bildungsstufe: 'sek2',
    zeitMin: 90,
    maxTechnik: 't-einzeln',
    ohneInternet: false
  }
];

function buildMarkdownChecklist(res: AdaptScenarioResult, scenarioText: string): string {
  const lines: string[] = [
    `# Binnendifferenzierungs- & Anpassungsplan`,
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
    lines.push(`- **${u.name}** (mind. +${u.minNormalizedScore} %, Aufwand: ${u.meta.aufwand}): ${u.meta.umsetzungsimpuls}`);
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
    setScenarioText(p.scenarioText);
    setLerngruppenText(p.lerngruppenText);
    setBildungsstufe(p.bildungsstufe);
    setZeitMin(String(p.zeitMin));
    setMaxTechnik(p.maxTechnik);
    setOhneInternet(p.ohneInternet);
  };

  const handleCopyMarkdown = async () => {
    if (!result) return;
    const md = buildMarkdownChecklist(result, inputMode === 'saved' && activeSaved ? activeSaved.title : scenarioText);
    try {
      await navigator.clipboard.writeText(md);
      setCopyNotice('Anpassungs-Checkliste als Markdown kopiert.');
      setTimeout(() => setCopyNotice(null), 3000);
    } catch {
      setCopyNotice('Kopieren nicht möglich – nutze bitte den JSON-Export.');
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

  return (
    <div className="wrap" style={{ paddingTop: 22, paddingBottom: 48 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 30, fontFamily: 'var(--display)' }}>
            Binnendifferenzierung &amp; Szenario-Anpassung
          </h1>
          <p className="muted" style={{ margin: '6px 0 0', maxWidth: 780, fontSize: 15 }}>
            Passe ein freies Unterrichtsszenario oder ein FMT-Arrangement in &lt;5 ms ohne KI-Kosten an heterogene
            Lernvoraussetzungen an: gemeinsame <strong>UDL-Basis</strong>, <strong>Zielkonflikte mit Auflösungsstrategien</strong>,
            konkrete <strong>Umsetzungsimpulse</strong> und passende <strong>FMT-Methoden</strong>.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={handleSendToPlanner}>
            In Szenario-Baukasten übernehmen →
          </button>
          <button type="button" className="btn" onClick={() => void handleCopyMarkdown()}>
            📋 Checkliste (Markdown)
          </button>
          <button type="button" className="btn" onClick={handleDownloadJson}>
            ⬇ JSON
          </button>
        </div>
      </div>

      {copyNotice && (
        <div className="status-badge" style={{ marginBottom: 12, borderColor: 'var(--dA)', color: 'var(--dA)' }}>
          {copyNotice}
        </div>
      )}

      {/* Input Card */}
      <div className="card" style={{ padding: 20, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className={`btn btn-sm ${inputMode === 'free' ? 'btn-primary' : ''}`}
              onClick={() => setInputMode('free')}
            >
              Freies Szenario / Text
            </button>
            <button
              type="button"
              className={`btn btn-sm ${inputMode === 'saved' ? 'btn-primary' : ''}`}
              disabled={savedScenarios.length === 0}
              onClick={() => setInputMode('saved')}
            >
              Aus gespeichertem Baukasten-Szenario ({savedScenarios.length})
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {QUICK_PRESETS.map((p) => (
              <button key={p.id} type="button" className="btn btn-sm" onClick={() => applyPreset(p)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {inputMode === 'saved' && activeSaved ? (
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              Gespeichertes FMT-Szenario wählen
            </label>
            <select
              className="input"
              value={activeSaved.id}
              onChange={(e) => setSelectedSavedId(e.target.value)}
              style={{ maxWidth: 460 }}
            >
              {savedScenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} ({s.fach || 'ohne Fach'})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              Unterrichtsszenario oder vorhandener Entwurf (Freitext)
            </label>
            <textarea
              className="input"
              rows={3}
              value={scenarioText}
              onChange={(e) => setScenarioText(e.target.value)}
              placeholder="z. B. Mathematik Klasse 4 Bruchteile einführen mit Papierfalten, 45 Minuten, ohne Geräte..."
            />
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            Lernvoraussetzungen &amp; Teilgruppen (Freitext – z. B. DaZ, ADHS, LRS, Förderbedarf, Leistungsstarke)
          </label>
          <input
            type="text"
            className="input"
            value={lerngruppenText}
            onChange={(e) => setLerngruppenText(e.target.value)}
            placeholder="z. B. 26 Kinder: 5 DaZ-Kinder, 2 mit ADHS, 4 sehr leistungsstarke Kinder"
          />
        </div>

        {/* Constraints Bar */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', fontSize: 13.5 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Stufe:
            <select className="input" style={{ width: 'auto' }} value={bildungsstufe} onChange={(e) => setBildungsstufe(e.target.value)}>
              <option value="">Alle</option>
              <option value="primar">Primarstufe</option>
              <option value="sek1">Sekundarstufe I</option>
              <option value="sek2">Sekundarstufe II</option>
              <option value="berufsbildung">Berufsbildung</option>
              <option value="hochschule">Hochschule</option>
              <option value="erwachsenenbildung">Erwachsenenbildung</option>
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Zeit (min):
            <input
              type="number"
              className="input"
              style={{ width: 76 }}
              min={10}
              max={360}
              value={zeitMin}
              onChange={(e) => setZeitMin(e.target.value)}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Technik:
            <select className="input" style={{ width: 'auto' }} value={maxTechnik} onChange={(e) => setMaxTechnik(e.target.value)}>
              <option value="">Keine Einschränkung</option>
              <option value="t-keine">Analog (ohne Geräte)</option>
              <option value="t-projektion">Nur Beamer / Projektion</option>
              <option value="t-einzeln">Endgeräte für Lernende</option>
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Aufwand:
            <select
              className="input"
              style={{ width: 'auto' }}
              value={maxAufwand}
              onChange={(e) => setMaxAufwand(e.target.value as MeasureEffort | '')}
            >
              <option value="">Alle</option>
              <option value="sofort">Nur sofort (0 min)</option>
              <option value="kurz">Bis kurz</option>
              <option value="mittel">Bis mittel</option>
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
            <input type="checkbox" checked={ohneInternet} onChange={(e) => setOhneInternet(e.target.checked)} />
            Ohne Internet
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
            <input type="checkbox" checked={ohneKI} onChange={(e) => setOhneKI(e.target.checked)} />
            Ohne KI
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={includeSystemMeasures}
              onChange={(e) => setIncludeSystemMeasures(e.target.checked)}
            />
            Auch Schul-/Systemmaßnahmen anzeigen
          </label>
        </div>
      </div>

      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* 1. UDL Basis */}
          <section className="card" style={{ padding: 20, borderTop: '3px solid var(--dA)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 20, fontFamily: 'var(--display)' }}>
                1. Gemeinsame Basis für alle (UDL – Universal Design for Learning)
              </h2>
              <span className="muted" style={{ fontSize: 13 }}>
                {result.udlBasis.length} Maßnahmen · wirken positiv für alle {result.kontext.anzahlTeilgruppen} Teilgruppen · {result.dauerMs} ms
              </span>
            </div>
            {result.udlBasis.length === 0 ? (
              <p className="muted" style={{ marginTop: 10 }}>
                Unter den aktuellen Filtern gibt es keine gemeinsame Überschneidung – prüfe unten die Teilgruppen-Empfehlungen oder lockere den Aufwandsfilter.
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginTop: 14 }}>
                {result.udlBasis.map((u) => (
                  <div
                    key={u.id}
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      background: 'var(--paper)',
                      border: '1px solid var(--rule)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                      <strong style={{ fontSize: 14.5 }}>{u.name}</strong>
                      <span className="status-badge" style={{ borderColor: 'var(--dA)', color: 'var(--dA)' }}>
                        mind. +{u.minNormalizedScore} %
                      </span>
                    </div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
                      {u.oberKategorieName} · {u.meta.ebene} · Aufwand: {u.meta.aufwand}
                    </div>
                    <p style={{ margin: '6px 0 0', fontSize: 13.5, lineHeight: 1.45 }}>{u.meta.umsetzungsimpuls}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 2. Zielkonflikte & Auflösungsstrategien */}
          {result.konflikte.length > 0 && (
            <section className="card" style={{ padding: 20, borderTop: '3px solid var(--dC)' }}>
              <h2 style={{ margin: '0 0 10px', fontSize: 20, fontFamily: 'var(--display)' }}>
                2. Zielkonflikte zwischen Teilgruppen &amp; Auflösungsstrategien ({result.konflikte.length})
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {result.konflikte.map((k) => (
                  <div
                    key={k.measureId}
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      background: 'var(--paper)',
                      border: '1px solid var(--dC)'
                    }}
                  >
                    <strong style={{ fontSize: 14.5 }}>{k.measureName}</strong>{' '}
                    <span className="muted" style={{ fontSize: 12.5 }}>({k.kategorieName})</span>
                    <div style={{ fontSize: 13, marginTop: 4, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      <span style={{ color: 'var(--dA)' }}>
                        ✓ Stärkend: {k.staerkendFuer.map((x) => `${x.label} (+${x.normalizedScore} %)`).join(', ')}
                      </span>
                      <span style={{ color: 'var(--dD)' }}>
                        ⚠ Hemmend: {k.hemmendFuer.map((x) => `${x.label} (${x.normalizedScore} %)`).join(', ')}
                      </span>
                    </div>
                    <p style={{ margin: '6px 0 0', fontSize: 13.5 }}>
                      <strong>Auflösung:</strong> {k.aufloesungsstrategie}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 3. Teilgruppen */}
          <section className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 20, fontFamily: 'var(--display)' }}>
                3. Teilgruppen-Anpassungen ({result.teilgruppen.length})
              </h2>
              <span className="muted" style={{ fontSize: 13 }}>
                Quelle: {result.kontext.gruppenQuelle}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, marginTop: 14 }}>
              {result.teilgruppen.map((tg) => (
                <div
                  key={tg.id}
                  style={{
                    padding: 14,
                    borderRadius: 8,
                    background: 'var(--paper)',
                    border: '1px solid var(--rule)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <strong style={{ fontSize: 15 }}>
                      {tg.label}
                      {tg.count ? ` (${tg.count})` : ''}
                    </strong>
                    <span className="status-badge">Lenkung: {tg.didacticProfile.preferredGuidance}</span>
                  </div>
                  {tg.erkannteSignale.length > 0 && (
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                      Erkannt: {tg.erkannteSignale.join(', ')}
                    </div>
                  )}
                  <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {tg.spezifischeMassnahmen.map((m) => (
                      <li key={m.id}>
                        <strong>{m.name}</strong>{' '}
                        <span className="muted">
                          (+{m.normalizedScore} %, {m.meta.aufwand})
                        </span>
                        <div className="muted" style={{ fontSize: 12.5 }}>{m.meta.umsetzungsimpuls}</div>
                      </li>
                    ))}
                  </ul>
                  {tg.vermeiden.length > 0 && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--rule)', fontSize: 12.5, color: 'var(--dD)' }}>
                      <strong>Eher vermeiden:</strong>{' '}
                      {tg.vermeiden.map((v) => `${v.name} (${v.normalizedScore} %)`).join(' · ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* 4. Phasen-Anpassungen & passende FMT-Methoden */}
          <section className="card" style={{ padding: 20 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 20, fontFamily: 'var(--display)' }}>
              4. Phasen-Anpassungen &amp; passende FMT-Methoden
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {result.phasenAnpassungen.map((p) => (
                <div
                  key={p.key}
                  style={{
                    padding: 14,
                    borderRadius: 8,
                    background: 'var(--paper)',
                    border: '1px solid var(--rule)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 15 }}>
                      {p.orderLabel}. {p.phaseLabel}
                      {p.bausteinName ? ` – ${p.bausteinName}` : ''}
                    </strong>
                    <span className="muted" style={{ fontSize: 12.5 }}>
                      Lernfunktion: {p.lernfunktion}
                      {p.durationMin ? ` · ${p.durationMin} min` : ''}
                    </span>
                  </div>

                  {p.passendeFmtMethoden.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
                      <strong>Passende FMT-Methoden:</strong>
                      {p.passendeFmtMethoden.map((m) => (
                        <Link
                          key={m.kennung}
                          to={`/methoden/${m.kennung}`}
                          className="status-badge"
                          style={{ textDecoration: 'none' }}
                          title={m.grund}
                        >
                          {m.name} ({m.dauerMin}–{m.dauerMax} min{m.evidenzgrad ? `, Grad ${m.evidenzgrad}` : ''})
                        </Link>
                      ))}
                    </div>
                  )}

                  <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
                    {p.teilgruppenImpulse.map((ti) => (
                      <div key={ti.groupId} style={{ fontSize: 13, padding: 8, background: 'var(--surface)', borderRadius: 6 }}>
                        <strong>{ti.groupLabel}:</strong>{' '}
                        {ti.massnahmen.map((m) => `${m.name} (+${m.normalizedScore} %)`).join(' · ')}
                        {ti.alternativeMethoden.length > 0 && (
                          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                            Alternativ-Methode:{' '}
                            {ti.alternativeMethoden.slice(0, 2).map((a) => a.name).join(', ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Epistemic Note & MCP/API Hint */}
          <div className="card" style={{ padding: 14, fontSize: 13, color: 'var(--ink-2)' }}>
            <strong>Methodische Einordnung:</strong> {result.epistemischerHinweis}{' '}
            <span style={{ marginLeft: 6 }}>
              Auch per REST-API (<code>POST /api/v1/adapt</code>) und MCP-Tool (<code>adapt_scenario</code>) direkt im Chat nutzbar.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
