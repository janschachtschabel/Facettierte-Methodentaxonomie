import { useEffect, useMemo, useRef, useState } from 'react';
import {
  detectLearnerGroupsFromText,
  detectMatrixTraitsFromText,
  FMT_GUARDRAILS,
  type Arrangement,
  type MatchRequest,
  type MatchResult
} from '@fmt/core';
import { useCatalog } from '../data/CatalogContext.js';
import { PartiturView } from '../components/PartiturView.js';
import { VerlaufsplanView } from '../components/VerlaufsplanView.js';
import { ScenarioStudioPanel, type StudioTab } from '../components/ScenarioStudioPanel.js';
import { TimelineBandSvg } from '../components/TimelineBandSvg.js';
import { buildServerByokHeaders, isUserLlmConfigured, runDirectTranslate } from '../lib/directLlm.js';
import {
  appendBlockToArrangement,
  collectUsedBlocks,
  createChainPreset,
  exportArrangementHtmlHandout,
  exportArrangementOnePageSheet
} from '../planner/arrangementOps.js';
import { explainValidationMessage } from '../planner/validationHelpers.js';
import {
  buildDefaultThematicRows,
  buildNeutralLearningScenario,
  buildScenarioRows,
  buildStructuredLessonText,
  extractSubjectAndTopic,
  STANDARD_LEARNER_GROUPS,
  type GeneratedMaterialItem,
  type LearnerGroup,
  type OerResource,
  type StepDiffSuggestion,
  type SubgroupMethodMap,
  type ThematicPhaseRow
} from '../planner/scenarioModel.js';
import {
  deleteSavedScenario,
  DIFF_HANDOFF_KEY,
  exportScenarioProjectJson,
  importScenarioProjectJson,
  loadSavedScenarios,
  printHtmlDocument,
  saveActivePlannerDraft,
  saveScenarioToStorage,
  type SavedScenario
} from '../planner/scenarioStorage.js';

type PlannerStep = 1 | 2 | 3 | 4 | 5;

const DIDACTIC_APPROACH_OPTIONS: Array<{ code: string; label: string }> = [
  { code: 'forschend', label: 'Problemorientiertes / forschendes Lernen' },
  { code: 'kooperativ', label: 'Kooperatives Lernen' },
  { code: 'instruktion', label: 'Direkte Instruktion & Darbietung' },
  { code: 'offen', label: 'Projekt- & offenes Lernen' },
  { code: 'diskurs', label: 'Diskursives / argumentatives Lernen' },
  { code: 'spiel-simulation', label: 'Spielerisches / simulationsbasiertes Lernen' },
  { code: 'digital-ki', label: 'Digitales & KI-gestütztes Lernen' },
  { code: 'reflexion', label: 'Selbstgesteuertes / reflexives Lernen' }
];

interface StarterPreset {
  id: string;
  label: string;
  fach: string;
  thema: string;
  text: string;
  ansatz: string[];
  lernziele: string;
  problemstellung: string;
  bildungsstufe: string;
  vorwissen: string;
  zeitMin: number;
  chain: string;
}

const STARTER_PRESETS: StarterPreset[] = [
  {
    id: 'mathe-bruch',
    label: 'Mathe · Bruchrechnen (90 min)',
    fach: 'Mathematik',
    thema: 'Addition und Subtraktion von Brüchen',
    text: 'Mathematik Bruchrechnen Doppelstunde Klasse 6, 90 Minuten, geringes Vorwissen',
    ansatz: ['instruktion', 'uebung'],
    lernziele:
      '1. Gleichnamige und ungleichnamige Brüche sicher addieren\n2. Rechenschritte begründen und typische Fehler (Nenner addieren) erkennen',
    problemstellung:
      'Viele Lernende addieren Zähler und Nenner getrennt; schrittweise Lösungsbeispiele mit Fading beugen diesem Fehlkonzept vor.',
    bildungsstufe: 'sek1',
    vorwissen: 'gering',
    zeitMin: 90,
    chain: 'prozedur'
  },
  {
    id: 'physik-dichte',
    label: 'Physik · Dichte (Reihe, 270 min)',
    fach: 'Physik',
    thema: 'Dichte von Stoffen',
    text: 'Unterrichtsreihe Physik Klasse 7: das Konzept Dichte verstehen, wenig Vorwissen, 270 Minuten, ohne Geräte',
    ansatz: ['forschend'],
    lernziele:
      '1. Masse und Volumen als unabhängige Größen unterscheiden\n2. Dichte als Stoffkonstante berechnen und auf Schwimmen/Sinken anwenden',
    problemstellung:
      'Fehlvorstellung „schwere Dinge sinken immer“ – Vorhersage-Beobachtung-Erklärung macht das Alltagskonzept sichtbar.',
    bildungsstufe: 'sek1',
    vorwissen: 'gering',
    zeitMin: 270,
    chain: 'konzeptaufbau'
  },
  {
    id: 'bio-oekosystem',
    label: 'Biologie · Ökosystem Wald (5E, 135 min)',
    fach: 'Biologie',
    thema: 'Ökosystem Wald & Nahrungsnetze',
    text: 'Biologie Klasse 8 forschend 5E Ökosystem Wald, 135 Minuten, mittleres Vorwissen',
    ansatz: ['forschend', 'kooperativ'],
    lernziele:
      '1. Produzenten, Konsumenten und Destruenten in Nahrungsnetzen vernetzen\n2. Folgen von Störungen im Ökosystem hypothesengeleitet untersuchen',
    problemstellung: 'Abstrakte Stoffkreisläufe bleiben oft träges Wissen ohne eigene Erkundungs- und Erklärungsphase.',
    bildungsstufe: 'sek1',
    vorwissen: 'mittel',
    zeitMin: 135,
    chain: 'fuenf-e'
  },
  {
    id: 'deutsch-arg',
    label: 'Deutsch · Argumentieren (90 min)',
    fach: 'Deutsch',
    thema: 'Überzeugend argumentieren & Debatte',
    text: 'Deutsch Sekundarstufe I Doppelstunde 90 Minuten Argumentation und Problemlösen, mittleres Vorwissen',
    ansatz: ['diskurs', 'kooperativ'],
    lernziele: '1. These, Argument und Beispiel klar strukturieren\n2. Gegenargumente fair aufgreifen und entkräften',
    problemstellung:
      'Meinungen werden häufig ohne Beleg geäußert; strukturierte Austausch- und Vergleichsphasen schärfen die Argumentationsqualität.',
    bildungsstufe: 'sek1',
    vorwissen: 'mittel',
    zeitMin: 90,
    chain: 'problemloesen'
  },
  {
    id: 'gesch-demokratie',
    label: 'Politik · Demokratie & DaZ (135 min)',
    fach: 'Politik',
    thema: 'Gewaltenteilung & Demokratie',
    text: 'Politik Klasse 9 Faktenwissen und Verständnis Gewaltenteilung, 135 Minuten, wenig Vorwissen, mehrere DaZ-Kinder',
    ansatz: ['kooperativ'],
    lernziele:
      '1. Legislative, Exekutive und Judikative sicher zuordnen\n2. Kontrollmechanismen an einem aktuellen Fallbeispiel erläutern',
    problemstellung:
      'Institutionenkunde wirkt trocken, wenn Fachbegriffe nicht aktiv abgerufen und sprachsensibel (DaZ) an konkreten Fällen gesichert werden.',
    bildungsstufe: 'sek1',
    vorwissen: 'gering',
    zeitMin: 135,
    chain: 'faktenwissen'
  },
  {
    id: 'grundschule-sach',
    label: 'Grundschule · Wasserkreislauf (45 min)',
    fach: 'Sachunterricht',
    thema: 'Der Wasserkreislauf im Alltag',
    text: 'Grundschule Klasse 3 Sachunterricht Einzelstunde 45 Minuten Konzept Wasserkreislauf verstehen, geringes Vorwissen, ohne Internet',
    ansatz: ['kooperativ', 'spiel-simulation'],
    lernziele:
      '1. Verdunstung, Kondensation und Niederschlag in einfachen Worten benennen\n2. Den Kreislauf an einer Skizze gemeinsam erklären',
    problemstellung:
      'Kinder kennen Regen und Pfützen, verbinden sie aber selten zu einem geschlossenen Kreislauf.',
    bildungsstufe: 'primar',
    vorwissen: 'gering',
    zeitMin: 45,
    chain: 'konzeptaufbau'
  }
];

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
    setLlmSettingsOpen
  } = useCatalog();

  const [step, setStep] = useState<PlannerStep>(1);
  const [arrangement, setArrangement] = useState<Arrangement | null>(null);
  const [showLiveBand, setShowLiveBand] = useState(true);
  const [showValidationDetails, setShowValidationDetails] = useState(false);
  const [viewMode, setViewMode] = useState<'verlaufsplan' | 'partitur'>('verlaufsplan');
  const [resourceTab, setResourceTab] = useState<StudioTab>('oer');
  const [focusedStepKey, setFocusedStepKey] = useState<string | null>(null);

  const [scenarioText, setScenarioText] = useState(
    'Unterrichtsreihe Physik Klasse 7: das Konzept Dichte verstehen, wenig Vorwissen, 270 Minuten, ohne Geräte'
  );
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [matchNotice, setMatchNotice] = useState<string | null>(null);
  const [busyAi, setBusyAi] = useState(false);
  const [listening, setListening] = useState(false);

  // Optional structured context fields (aligned with Lernpfadeditor & directly wired to Matcher, Matrix, WLO & KI!)
  const [fach, setFach] = useState('Physik');
  const [thema, setThema] = useState('Dichte von Stoffen');
  const [ansatzCodes, setAnsatzCodes] = useState<string[]>(['forschend']);
  const [customAnsatzText, setCustomAnsatzText] = useState('');
  const [lehrkraefteInfo, setLehrkraefteInfo] = useState('1 Lehrkraft');
  const [lernziele, setLernziele] = useState('');
  const [problemstellung, setProblemstellung] = useState('');
  const [hinweise, setHinweise] = useState('');
  const [gruppeSize, setGruppeSize] = useState<string>('26');
  const [maxTechnik, setMaxTechnik] = useState<string>('');
  const [ohneInternet, setOhneInternet] = useState(false);
  const [ohneKI, setOhneKI] = useState(false);
  const [raumzeitFilter, setRaumzeitFilter] = useState<string>('');

  const [groups, setGroups] = useState<LearnerGroup[]>(STANDARD_LEARNER_GROUPS);
  const [aiDiffByStep, setAiDiffByStep] = useState<Record<string, StepDiffSuggestion[]>>({});
  const [subgroupMethods, setSubgroupMethods] = useState<SubgroupMethodMap>({});
  const [oerByStep, setOerByStep] = useState<Record<string, OerResource[]>>({});
  const [generatedMaterials, setGeneratedMaterials] = useState<GeneratedMaterialItem[]>([]);
  const [thematicRows, setThematicRows] = useState<ThematicPhaseRow[] | null>(null);
  const [elaboration, setElaboration] = useState<string | null>(null);

  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>(() => loadSavedScenarios());
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);
  const [showSavedDrawer, setShowSavedDrawer] = useState(false);
  const [showJsonImport, setShowJsonImport] = useState(false);
  const [jsonImportDraft, setJsonImportDraft] = useState('');
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!bundle) return;
    if (!arrangement) {
      let initial = createChainPreset('konzeptaufbau', bundle);
      if (pendingPlannerBlock) {
        const queued = consumePendingPlannerBlock();
        const b = queued ? blocksById.get(queued) : null;
        if (b) {
          initial = appendBlockToArrangement(initial, b);
          setStep(2);
          setViewMode('partitur');
        }
      }
      setArrangement(initial);
    } else if (pendingPlannerBlock) {
      const queued = consumePendingPlannerBlock();
      const b = queued ? blocksById.get(queued) : null;
      if (b) {
        setArrangement((prev) => (prev ? appendBlockToArrangement(prev, b) : prev));
        setStep(2);
        setViewMode('partitur');
      }
    }
  }, [bundle, arrangement, pendingPlannerBlock, blocksById, consumePendingPlannerBlock]);

  // Consume optional handoff from /differenzierung ("In Szenario-Baukasten übernehmen")
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DIFF_HANDOFF_KEY);
      if (!raw) return;
      sessionStorage.removeItem(DIFF_HANDOFF_KEY);
      const h = JSON.parse(raw) as {
        scenarioText?: string;
        maxTechnik?: string;
        ohneInternet?: boolean;
        ohneKI?: boolean;
        returnToStep3?: boolean;
        groups?: Array<{
          id: string;
          label: string;
          count?: number;
          personaId?: string;
          matrixValues?: Record<string, string>;
        }>;
      };
      if (h.scenarioText && !h.returnToStep3) setScenarioText(h.scenarioText);
      if (typeof h.maxTechnik === 'string') setMaxTechnik(h.maxTechnik);
      if (typeof h.ohneInternet === 'boolean') setOhneInternet(h.ohneInternet);
      if (typeof h.ohneKI === 'boolean') setOhneKI(h.ohneKI);
      if (Array.isArray(h.groups) && h.groups.length > 0) {
        setGroups(
          h.groups.map((g) => ({
            id: g.id,
            label: g.label,
            profile: g.label,
            focus: g.id === 'vertiefung' ? 'vertiefung' : g.id === 'regel' ? 'regel' : 'basis',
            active: true,
            count: g.count,
            personaId: g.personaId,
            matrixValues: g.matrixValues || {}
          }))
        );
      }
      if (h.returnToStep3) {
        setStep(3);
        setResourceTab('diff');
        setMatchNotice('Aktualisierte Teilgruppen & Rahmenbedingungen aus „Differenzierung“ in Schritt 3 übernommen.');
      } else {
        setMatchNotice('Differenzierungsprofil & Rahmenbedingungen aus „Differenzierung“ übernommen.');
        setStep(1);
      }
    } catch {
      // ignore invalid handoff payload
    }
  }, []);

  // Keep live Baukasten draft synced in sessionStorage so /differenzierung can open it immediately without saving first
  useEffect(() => {
    if (!arrangement) return;
    const title = [fach.trim(), thema.trim()].filter(Boolean).join(' · ') || arrangement.name || 'Aktuelles Baukasten-Szenario';
    saveActivePlannerDraft({
      updatedAt: new Date().toISOString(),
      title,
      fach,
      thema,
      scenarioText,
      bildungsstufe: arrangement.kontext?.bildungsstufe || arrangement.kontext?.stufe || undefined,
      zeitMin: arrangement.kontext?.zeitbudgetMin || undefined,
      maxTechnik,
      ohneInternet,
      ohneKI,
      arrangement,
      groups
    });
  }, [arrangement, fach, thema, scenarioText, maxTechnik, ohneInternet, ohneKI, groups]);

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
    return buildScenarioRows(
      arrangement,
      bundle,
      blocksById,
      labelOf,
      groups,
      aiDiffByStep,
      oerByStep,
      baseUrl,
      subgroupMethods,
      generatedMaterials
    );
  }, [arrangement, bundle, blocksById, labelOf, groups, aiDiffByStep, oerByStep, subgroupMethods, generatedMaterials]);

  const didaktischerAnsatzLabel = useMemo(() => {
    const labels = ansatzCodes.map(
      (c) => DIDACTIC_APPROACH_OPTIONS.find((x) => x.code === c)?.label || labelOf('ansatz', c)
    );
    if (customAnsatzText.trim()) labels.push(customAnsatzText.trim());
    return labels.join(', ');
  }, [ansatzCodes, customAnsatzText, labelOf]);

  if (!bundle || !validator || !search || !matcher || !arrangement || !validation) {
    return <div className="page-section">Lade Szenario-Baukasten…</div>;
  }

  const byokHeaders = (): Record<string, string> => buildServerByokHeaders(byok);

  const toggleAnsatzCode = (code: string) => {
    setAnsatzCodes((prev) => (prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code]));
  };

  const handleSubgroupMethodChange = (stepKey: string, groupId: string, methodId: string | null) => {
    setSubgroupMethods((prev) => {
      const nextStep = { ...(prev[stepKey] || {}) };
      if (!methodId) delete nextStep[groupId];
      else nextStep[groupId] = methodId;
      return { ...prev, [stepKey]: nextStep };
    });
  };

  const handleEditDiffMeasure = (stepKey: string, groupId: string, groupLabel: string, measure: string) => {
    setAiDiffByStep((prev) => {
      const row = scenarioRows.find((r) => r.key === stepKey);
      const baseList = prev[stepKey]?.length ? [...prev[stepKey]] : row ? [...row.differentiation] : [];
      const exists = baseList.some((d) => d.groupId === groupId);
      const updated: StepDiffSuggestion[] = exists
        ? baseList.map((d) => (d.groupId === groupId ? { ...d, measure, source: 'manuell' } : d))
        : [...baseList, { groupId, groupLabel, measure, source: 'manuell' }];
      return { ...prev, [stepKey]: updated };
    });
  };

  const buildStructuredMatchRequest = (): MatchRequest => {
    const req: MatchRequest = { text: scenarioText };
    if (ansatzCodes.length) req.ansatz = ansatzCodes;
    const sumGroupCounts = groups.filter((g) => g.active).reduce((s, g) => s + (g.count || 0), 0);
    const effGroup = Number(gruppeSize) || sumGroupCounts;
    if (effGroup > 0) req.gruppe = effGroup;
    if (maxTechnik) req.maxTechnik = maxTechnik;
    if (ohneInternet) req.ohneInternet = true;
    if (ohneKI) req.ohneKI = true;
    if (raumzeitFilter) req.raumzeit = [raumzeitFilter];
    return req;
  };

  const buildEnrichedAiText = (): string => {
    const extras: string[] = [];
    if (fach.trim()) extras.push(`Fach: ${fach.trim()}`);
    if (thema.trim()) extras.push(`Thema: ${thema.trim()}`);
    if (didaktischerAnsatzLabel) extras.push(`Didaktischer Ansatz: ${didaktischerAnsatzLabel}`);
    if (lehrkraefteInfo.trim()) extras.push(`Lehrkräfte/Begleitung: ${lehrkraefteInfo.trim()}`);
    if (lernziele.trim()) extras.push(`Lernziele: ${lernziele.trim()}`);
    if (gruppeSize && Number(gruppeSize) > 0) extras.push(`Klassengröße: ${gruppeSize} Lernende`);
    if (maxTechnik) extras.push(`Technik höchstens: ${labelOf('technikbedarf', maxTechnik)}`);
    if (ohneInternet) extras.push('ohne Internet');
    if (ohneKI) extras.push('ohne KI');
    if (raumzeitFilter) extras.push(`Raumzeit: ${labelOf('raumzeit', raumzeitFilter)}`);
    return extras.length ? `${scenarioText.trim()}\n\nZusatzangaben: ${extras.join('; ')}` : scenarioText;
  };

  const applyStarterPreset = (p: StarterPreset) => {
    setFach(p.fach);
    setThema(p.thema);
    setScenarioText(p.text);
    setAnsatzCodes(p.ansatz);
    setLernziele(p.lernziele);
    setProblemstellung(p.problemstellung);
    const preset = createChainPreset(p.chain, bundle);
    preset.name = `${p.fach}: ${p.thema}`;
    preset.kontext = {
      bildungsstufe: p.bildungsstufe,
      vorwissen: p.vorwissen,
      zeitbudgetMin: p.zeitMin
    };
    setArrangement(preset);
    setMatchResult(null);
    setThematicRows(null);
    setElaboration(null);
    setOerByStep({});
    setGeneratedMaterials([]);
    setAiDiffByStep({});
    setMatchNotice(`Starter-Vorlage „${p.label}“ geladen (${p.zeitMin} min). Du kannst direkt zu Schritt 2 wechseln oder die Felder anpassen.`);
  };

  const syncTopicFromScenarioText = (serverFach?: string | null, serverThema?: string | null) => {
    const local = extractSubjectAndTopic(scenarioText);
    const nextFach = (serverFach || local.fach || '').trim();
    const nextThema = (serverThema || local.thema || '').trim();
    const topicChanged =
      (nextThema && nextThema.toLowerCase() !== thema.trim().toLowerCase()) ||
      (nextFach && nextFach.toLowerCase() !== fach.trim().toLowerCase());
    if (nextFach) setFach(nextFach);
    if (nextThema) setThema(nextThema);
    if (topicChanged) {
      setThematicRows(null);
      setElaboration(null);
      setOerByStep({});
      setGeneratedMaterials([]);
      setAiDiffByStep({});
    }
    // Only add differentiation subgroups automatically when explicit heterogeneity cues (DaZ, LRS, ADHS...) appear in the prompt
    const matrixHit = detectMatrixTraitsFromText(scenarioText);
    if (matrixHit.signals.length > 0) {
      const det = detectLearnerGroupsFromText(scenarioText);
      if (det.groups.length > 0) {
        const detectedGroups: LearnerGroup[] = det.groups.map((g) => ({
          id: g.id,
          label: g.label,
          profile: g.label,
          focus: g.id === 'vertiefung' ? 'vertiefung' : g.id === 'regel' ? 'regel' : g.id === 'daz' ? 'sprachsensibel' : 'basis',
          active: true,
          count: g.count,
          personaId: g.personaId,
          matrixValues: g.selectedValues || {}
        }));
        const hasRegel = detectedGroups.some((g) => g.focus === 'regel');
        setGroups(
          hasRegel
            ? detectedGroups
            : [{ ...STANDARD_LEARNER_GROUPS[0], label: 'Regelniveau (Hauptgruppe)', count: undefined }, ...detectedGroups]
        );
      }
      return matrixHit.signals.map((s) => s.trigger).slice(0, 3);
    }
    return [] as string[];
  };

  const runDeterministicMatch = () => {
    setMatchNotice(null);
    const detectedMatrixTriggers = syncTopicFromScenarioText();
    const res = matcher.zuordnen(buildStructuredMatchRequest());
    setMatchResult(res);
    const matrixHint = detectedMatrixTriggers.length
      ? ` · Matrix-Merkmale automatisch erkannt (${detectedMatrixTriggers.join(', ')})`
      : '';
    if (res.modus === 'ablauf' && res.arrangement) {
      setArrangement(res.arrangement);
      setThematicRows(null);
      setElaboration(null);
      setMatchNotice(`Deterministisch in <1 ms komponiert (${res.kette?.label})${matrixHint}.`);
      setStep(2);
    } else if (res.modus === 'phase') {
      setMatchNotice(
        `Einzelphase erkannt: ${res.vorschlaege.length} passende Bausteine gefunden (unten anklicken zum Übernehmen)${matrixHint}.`
      );
    }
  };

  const runAiTranslate = async () => {
    setBusyAi(true);
    setMatchNotice(null);
    try {
      let json: {
        quelle?: string;
        gecacht?: boolean;
        hinweis?: string;
        fehler?: string;
        erkanntesFach?: string | null;
        erkanntesThema?: string | null;
        ergebnis?: MatchResult;
      };
      if (byok.enabled && byok.directBrowser) {
        json = await runDirectTranslate(byok, buildEnrichedAiText());
      } else {
        const res = await fetch('/api/v1/assistant/translate', {
          method: 'POST',
          headers: byokHeaders(),
          body: JSON.stringify({ text: buildEnrichedAiText() })
        });
        json = await res.json();
        if (!res.ok) {
          setMatchNotice(`Hinweis: ${json.fehler || 'Anfrage fehlgeschlagen.'}`);
          return;
        }
      }
      syncTopicFromScenarioText(json.erkanntesFach, json.erkanntesThema);
      if (json.ergebnis) setMatchResult(json.ergebnis);
      if (json.ergebnis?.modus === 'ablauf' && json.ergebnis?.arrangement) {
        setArrangement(json.ergebnis.arrangement as Arrangement);
        setThematicRows(null);
        setElaboration(null);
        setStep(2);
      }
      setMatchNotice(
        json.quelle === 'llm'
          ? `KI-Übersetzung (${byok.enabled && byok.directBrowser ? `Direkt: ${byok.model}` : json.gecacht ? 'aus Cache' : 'live'}) → deterministisch geprüft.`
          : json.hinweis || 'Deterministische Regel-Zuordnung genutzt.'
      );
    } catch (e) {
      if (byok.enabled && byok.directBrowser) {
        setMatchNotice(`Direkte KI-Anfrage fehlgeschlagen (${e instanceof Error ? e.message : 'Fehler'}) – deterministische Zuordnung genutzt.`);
      }
      runDeterministicMatch();
    } finally {
      setBusyAi(false);
    }
  };

  const toggleDictation = () => {
    const w = window as unknown as {
      SpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
        onend: () => void;
        onerror: () => void;
        start: () => void;
      };
      webkitSpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
        onend: () => void;
        onerror: () => void;
        start: () => void;
      };
    };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      setMatchNotice('Spracheingabe wird von diesem Browser leider nicht unterstützt (Chrome/Edge empfohlen).');
      return;
    }
    const rec = new SR();
    rec.lang = 'de-DE';
    rec.interimResults = false;
    setListening(true);
    rec.onresult = (e) => {
      const transcript = e.results?.[0]?.[0]?.transcript || '';
      if (transcript) setScenarioText((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
  };

  const jumpToResources = (tab: StudioTab, stepKey: string) => {
    setFocusedStepKey(stepKey);
    if (tab === 'diff') {
      setStep(3);
    } else {
      setResourceTab(tab);
      setStep(4);
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
    const effThematic = thematicRows?.length ? thematicRows : buildDefaultThematicRows(scenarioRows, groups, fach, thema);
    const effNarrative =
      elaboration && elaboration.trim()
        ? elaboration
        : buildStructuredLessonText(arrangement, scenarioRows, effThematic, groups, {
            fach,
            thema,
            didaktischerAnsatz: didaktischerAnsatzLabel,
            lehrkraefteInfo,
            lernziele,
            problemstellung,
            hinweise,
            totalDurationMin: validation.dauerMin,
            labelOf
          });
    const sc = buildNeutralLearningScenario(arrangement, scenarioRows, groups, {
      fach,
      thema,
      didaktischerAnsatz: didaktischerAnsatzLabel,
      lehrkraefteInfo,
      lernziele,
      problemstellung,
      hinweise,
      thematicRows: effThematic,
      elaboration: effNarrative,
      generatedMaterials,
      totalDurationMin: validation.dauerMin,
      labelOf
    });
    const html = exportArrangementHtmlHandout(arrangement, blocksById, validation, {
      fach,
      thema,
      didaktischerAnsatz: didaktischerAnsatzLabel,
      lehrkraefteInfo,
      lernziele,
      problemstellung,
      kiAusarbeitung: effNarrative,
      timelineSvg: resolveTimelineSvgString(),
      groups,
      thematicRows: effThematic,
      generatedMaterials,
      scenarioRows,
      machineReadableJson: JSON.stringify(sc, null, 2)
    });
    printHtmlDocument(html);
  };

  const handlePrintOnePage = () => {
    const effThematic = thematicRows?.length ? thematicRows : buildDefaultThematicRows(scenarioRows, groups, fach, thema);
    const html = exportArrangementOnePageSheet(arrangement, blocksById, validation, {
      fach,
      thema,
      didaktischerAnsatz: didaktischerAnsatzLabel,
      lehrkraefteInfo,
      lernziele,
      timelineSvg: resolveTimelineSvgString(),
      groups,
      thematicRows: effThematic,
      generatedMaterials,
      scenarioRows
    });
    printHtmlDocument(html);
  };

  const buildCurrentScenarioSnapshot = (title: string) => ({
    title,
    fach,
    thema,
    hinweise,
    scenarioText,
    ansatzCodes,
    customAnsatzText,
    gruppeSize,
    maxTechnik,
    ohneInternet,
    ohneKI,
    raumzeitFilter,
    lernziele,
    problemstellung,
    didaktischerAnsatz: didaktischerAnsatzLabel,
    lehrkraefteInfo,
    arrangement,
    groups,
    aiDiffByStep,
    oerByStep,
    subgroupMethods,
    generatedMaterials,
    thematicRows,
    elaboration
  });

  const handleSaveBrowser = (asNew = false) => {
    const title = thema ? `${fach ? `${fach}: ` : ''}${thema}` : arrangement.name;
    const { saved, list } = saveScenarioToStorage({
      id: asNew ? undefined : activeSavedId || undefined,
      ...buildCurrentScenarioSnapshot(title)
    });
    setActiveSavedId(saved.id);
    setSavedScenarios(list);
    setSaveNotice(`Szenario „${saved.title}“ im Browser gespeichert (${list.length} insgesamt).`);
    setTimeout(() => setSaveNotice(null), 4000);
  };

  const applyImportedScenario = (p: Partial<SavedScenario> & { arrangement: Arrangement }, label: string, savedId: string | null = null) => {
    setArrangement(p.arrangement);
    if (p.fach !== undefined) setFach(p.fach);
    if (p.thema !== undefined) setThema(p.thema);
    if (p.hinweise !== undefined) setHinweise(p.hinweise);
    if (p.scenarioText !== undefined) setScenarioText(p.scenarioText);
    if (p.ansatzCodes !== undefined) setAnsatzCodes(p.ansatzCodes);
    if (p.customAnsatzText !== undefined) setCustomAnsatzText(p.customAnsatzText);
    if (p.gruppeSize !== undefined) setGruppeSize(p.gruppeSize);
    if (p.maxTechnik !== undefined) setMaxTechnik(p.maxTechnik);
    if (p.ohneInternet !== undefined) setOhneInternet(p.ohneInternet);
    if (p.ohneKI !== undefined) setOhneKI(p.ohneKI);
    if (p.raumzeitFilter !== undefined) setRaumzeitFilter(p.raumzeitFilter);
    if (p.lernziele !== undefined) setLernziele(p.lernziele);
    if (p.problemstellung !== undefined) setProblemstellung(p.problemstellung);
    if (p.lehrkraefteInfo !== undefined) setLehrkraefteInfo(p.lehrkraefteInfo);
    if (p.groups?.length) setGroups(p.groups);
    if (p.aiDiffByStep) setAiDiffByStep(p.aiDiffByStep);
    if (p.oerByStep) setOerByStep(p.oerByStep);
    if (p.subgroupMethods) setSubgroupMethods(p.subgroupMethods);
    if (p.generatedMaterials) setGeneratedMaterials(p.generatedMaterials);
    if (p.thematicRows !== undefined) setThematicRows(p.thematicRows);
    if (p.elaboration !== undefined) setElaboration(p.elaboration);
    setMatchResult(null);
    setActiveSavedId(savedId);
    setShowSavedDrawer(false);
    setShowJsonImport(false);
    // Open directly on Step 4 if a finished thematic scenario was imported, else Step 2
    setStep(p.elaboration || (p.thematicRows && p.thematicRows.length > 0) ? 5 : 2);
    setSaveNotice(label);
    setTimeout(() => setSaveNotice(null), 4000);
  };

  const handleLoadSaved = (sc: SavedScenario) => {
    applyImportedScenario(sc, `Szenario „${sc.title}“ geladen.`, sc.id);
  };

  const handleDownloadProjectFile = () => {
    const title = thema ? `${fach ? `${fach}: ` : ''}${thema}` : arrangement.name;
    const json = exportScenarioProjectJson(buildCurrentScenarioSnapshot(title));
    const slug = (thema || arrangement.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'szenario';
    downloadFile(`fmt-${slug}.fmt.json`, json, 'application/json;charset=utf-8');
  };

  const handleImportRawProject = (raw: string, fallbackName: string) => {
    const res = importScenarioProjectJson(raw);
    if (!res.ok) {
      setSaveNotice(`Import fehlgeschlagen: ${res.fehler}`);
      return;
    }
    applyImportedScenario(res.project, `Szenario „${res.project.title || fallbackName}“ vollständig importiert.`);
    setJsonImportDraft('');
  };

  const handleUploadProjectFile = (file: File) => {
    file.text().then((raw) => handleImportRawProject(raw, file.name));
  };

  const nErr = validation.meldungen.filter((m) => m.schwere === 'Fehler').length;
  const nWarn = validation.meldungen.length - nErr;
  const userLlmActive = isUserLlmConfigured(byok);
  const llmAvailable = Boolean(meta?.llmConfigured || userLlmActive);
  const totalAttachedOer = Object.values(oerByStep).reduce((s, list) => s + list.length, 0);

  return (
    <div className="page-section">
      {/* Compact Header + Global Save / Print Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Lehr- &amp; Lernszenario-Studio</h1>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontFamily: 'var(--display)', fontSize: 14 }}>
            <strong>{thema ? `${fach ? `${fach}: ` : ''}${thema}` : arrangement.name}</strong>
            <span className="muted">·</span>
            <span>
              ⏱ {validation.dauerMin} min{arrangement.kontext?.zeitbudgetMin ? ` / ${arrangement.kontext.zeitbudgetMin} min` : ''}
            </span>
            <span className="muted">·</span>
            <span style={{ fontWeight: 700, color: validation.gueltig ? 'var(--dC)' : 'var(--err)' }}>
              {validation.gueltig ? '✓ Formal gültig' : `✕ ${nErr} Prüffehler`}
              {nWarn > 0 ? ` (${nWarn} Hinweise)` : ''}
            </span>
          </div>
        </div>

        <div className="no-print" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-sm btn-primary" onClick={handlePrintPdf}>
            🖨 PDF drucken
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={handlePrintOnePage}
            title="Kompakte Pultvorlage / Spickzettel auf maximal 1 A4-Seite (Querformat)"
          >
            📄 Kurzablauf (1 A4)
          </button>
          <button type="button" className="btn btn-sm" onClick={() => handleSaveBrowser(false)}>
            💾 Speichern
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setShowSavedDrawer((s) => !s)}>
            📂 Gespeichert ({savedScenarios.length})
          </button>
          <button type="button" className="btn btn-sm" onClick={handleDownloadProjectFile} title="Vollständiges Szenario maschinenlesbar als .fmt.json exportieren (wieder importierbar)">
            ⬇ Export (.fmt.json)
          </button>
          <button type="button" className="btn btn-sm" onClick={() => fileInputRef.current?.click()} title="Gespeicherte .fmt.json, API/MCP-Plan-JSON, JSON-LD oder HTML-Handout importieren">
            ⬆ Import
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => setShowJsonImport((v) => !v)}
            title="Maschinenlesbares Szenario-JSON (z. B. aus MCP, API oder .fmt.json) direkt einfügen"
          >
            📋 JSON einfügen
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.jsonld,.html,.htm"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUploadProjectFile(f);
              e.target.value = '';
            }}
          />
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setLlmSettingsOpen(true)}>
            {userLlmActive ? `🔑 KI (${byok.model || byok.provider})` : '⚙ KI-Anbindung'}
          </button>
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

      {showJsonImport && (
        <div className="card no-print" style={{ padding: 14, marginTop: 10, borderLeft: '4px solid var(--dA)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <strong style={{ fontFamily: 'var(--display)' }}>
              📋 Maschinenlesbares Szenario einfügen (.fmt.json, API-/MCP-Antwort, JSON-LD oder HTML-Handout)
            </strong>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowJsonImport(false)}>
              Schließen
            </button>
          </div>
          <textarea
            rows={5}
            style={{ width: '100%', fontFamily: 'var(--mono)', fontSize: 12.5 }}
            value={jsonImportDraft}
            onChange={(e) => setJsonImportDraft(e.target.value)}
            placeholder='{"@type":"FmtScenarioProject", ...} oder Ausgabe aus POST /api/v1/plan bzw. MCP build_scenario_plan hier einfügen…'
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={!jsonImportDraft.trim()}
              onClick={() => handleImportRawProject(jsonImportDraft, 'Eingefügtes JSON')}
            >
              ✓ Szenario laden &amp; anzeigen
            </button>
            <button type="button" className="btn btn-sm" onClick={() => fileInputRef.current?.click()}>
              ⬆ Stattdessen Datei wählen (.fmt.json / .html)
            </button>
          </div>
        </div>
      )}

      {showSavedDrawer && (
        <section className="card no-print" style={{ padding: 16, marginTop: 12, borderLeft: '4px solid var(--dA)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <strong style={{ fontFamily: 'var(--display)', fontSize: 16 }}>
              📂 Meine gespeicherten Szenarien ({savedScenarios.length})
            </strong>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => handleSaveBrowser(true)}>
                + Als Kopie speichern
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setShowSavedDrawer(false)}>
                Schließen
              </button>
            </div>
          </div>
          {savedScenarios.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              Noch keine Szenarien im Browser gespeichert. Klicke oben auf <strong>„💾 Speichern“</strong>.
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 10 }}>
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
                    {new Date(sc.savedAt).toLocaleString('de-DE')}
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

      {/* Clean 4-Step Guided Navigation Bar */}
      <nav
        className="card no-print"
        aria-label="Planungsschritte"
        style={{
          marginTop: 14,
          padding: 8,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: 8
        }}
      >
        {(
          [
            { id: 1 as const, label: '1. Szenario & Kontext', sub: 'Beschreibung, Ansatz & Rahmen' },
            {
              id: 2 as const,
              label: `2. Methodisches Konzept (${scenarioRows.length})`,
              sub: 'FMT-Rollen, Bausteine & Prüfer'
            },
            {
              id: 3 as const,
              label: '3. Binnendifferenzierung',
              sub:
                groups.filter((g) => g.active).length <= 1
                  ? 'Standardgruppe · optional anpassen'
                  : `${groups.filter((g) => g.active).length} Teilgruppen · UDL & Matrix`
            },
            {
              id: 4 as const,
              label: '4. WLO-OER & Material',
              sub: `${totalAttachedOer} WLO-OER · ${generatedMaterials.length} KI-Materialien`
            },
            {
              id: 5 as const,
              label: '5. Szenario & Export',
              sub: elaboration ? 'Tabelle + Text bereit' : 'Tabelle, Text, PDF/Word/LMS'
            }
          ] as const
        ).map((s) => {
          const active = step === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(s.id)}
              style={{
                textAlign: 'left',
                padding: '10px 12px',
                borderRadius: 6,
                border: `1.5px solid ${active ? 'var(--dA)' : 'var(--grid)'}`,
                background: active ? 'var(--dA-soft)' : 'var(--surface)',
                cursor: 'pointer',
                color: 'var(--ink)'
              }}
            >
              <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14.5, color: active ? 'var(--dA)' : 'var(--ink)' }}>
                {s.label}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                {s.sub}
              </div>
            </button>
          );
        })}
      </nav>

      {/* =================================================================== */}
      {/* SCHRITT 1: SZENARIO, STARTER-VORLAGEN & OPTIONALER LERNPFAD-KONTEXT */}
      {/* =================================================================== */}
      {step === 1 && (
        <section style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
              <h2 style={{ margin: 0, fontSize: 21 }}>Was möchtest du unterrichten?</h2>
              <button
                type="button"
                className="status-badge"
                style={{ cursor: 'pointer' }}
                onClick={() => setLlmSettingsOpen(true)}
                title="KI-Einstellungen öffnen (OpenAI-kompatible Anbindung konfigurieren)"
              >
                {llmAvailable
                  ? `✨ KI aktiv (${userLlmActive ? byok.model || byok.provider : meta?.llmModel || 'Server'})`
                  : '⚡ Zero-LLM-Modus · Eigene KI verbinden ⚙'}
              </button>
            </div>

            <p className="muted" style={{ fontSize: 14, marginTop: 0, marginBottom: 10 }}>
              Beschreibe dein Vorhaben in eigenen Worten – oder wähle eine Starter-Vorlage bzw. klappe unten die gezielten
              didaktischen Felder (Ansatz, Akteure, Klassengröße, Technik) auf.
            </p>

            <textarea
              rows={3}
              style={{ width: '100%' }}
              value={scenarioText}
              onChange={(e) => setScenarioText(e.target.value)}
              placeholder="z. B. Mathematik Bruchrechnen Doppelstunde Klasse 6, problemorientiertes Lernen, 26 Lernende, 90 Minuten"
            />

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <button type="button" className="btn btn-primary" disabled={busyAi} onClick={() => void runAiTranslate()}>
                ✨ {busyAi ? 'Analysiere Szenario…' : 'Mit KI verstehen & Ablauf bauen'}
              </button>
              <button type="button" className="btn" onClick={runDeterministicMatch}>
                ⚡ Sofort per Regeln zuordnen (&lt;1 ms)
              </button>
              <button type="button" className="btn btn-sm" onClick={toggleDictation}>
                {listening ? '🔴 Aufnahme läuft…' : '🎤 Diktieren'}
              </button>
              <button type="button" className="btn btn-sm btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => setStep(2)}>
                Weiter zu Schritt 2 (Methodisches Konzept) →
              </button>
            </div>

            {matchNotice && (
              <p style={{ marginTop: 10, marginBottom: 0, fontFamily: 'var(--display)', fontWeight: 600, color: 'var(--dA)' }}>
                {matchNotice}
              </p>
            )}

            {matchResult && matchResult.modus === 'phase' && matchResult.vorschlaege.length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--grid)' }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
                  Einzelphase erkannt – passende Bausteine (Klick übernimmt in den Ablauf):
                </div>
                <ul className="chips">
                  {matchResult.vorschlaege.slice(0, 12).map((v) => (
                    <li key={v.baustein}>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => {
                          const b = blocksById.get(v.baustein);
                          if (b) {
                            setArrangement(appendBlockToArrangement(arrangement, b));
                            setStep(2);
                          }
                        }}
                      >
                        + {v.name} ({v.dauerMin}–{v.dauerMax} min{v.evidenzgrad ? `, Grad ${v.evidenzgrad}` : ''})
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Starter Templates Row */}
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--grid)' }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>
                Schnellstart mit geprüften Vorlagen:
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {STARTER_PRESETS.map((p) => (
                  <button key={p.id} type="button" className="btn btn-sm" onClick={() => applyStarterPreset(p)}>
                    {p.label}
                  </button>
                ))}
                {bundle.beispiele.map((ex) => {
                  const slug = ex['@id']?.split('/').pop() || ex.name;
                  return (
                    <button
                      key={slug}
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => {
                        setArrangement(JSON.parse(JSON.stringify(ex)) as Arrangement);
                        setStep(2);
                      }}
                    >
                      FMT-Beispiel: {ex.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Optional Expandable Structured Inputs (Lernpfadeditor-aligned: Didaktischer Ansatz, Akteure & Personenanzahl, Technik) */}
          <details className="card" style={{ padding: 18 }}>
            <summary style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 16, cursor: 'pointer', color: 'var(--dA)' }}>
              ⚙ Optional: Didaktischer Ansatz, Akteure, Lerngruppe &amp; Technik verfeinern (fließen direkt in Planung, Matrix, KI &amp; WLO ein)
            </summary>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 14 }}>
              {/* Group A: Didaktische Grundlagen */}
              <div>
                <strong style={{ fontFamily: 'var(--display)', fontSize: 14.5 }}>1. Didaktischer Rahmen &amp; Ziele</strong>
                <div className="filter-grid" style={{ marginTop: 8 }}>
                  <label>
                    Fach
                    <input type="text" value={fach} onChange={(e) => setFach(e.target.value)} placeholder="z. B. Mathematik, Physik, Deutsch" />
                  </label>
                  <label>
                    Thema
                    <input type="text" value={thema} onChange={(e) => setThema(e.target.value)} placeholder="z. B. Bruchrechnen, Dichte" />
                  </label>
                  <label>
                    Bildungsstufe
                    <select
                      value={arrangement.kontext?.bildungsstufe || 'sek1'}
                      onChange={(e) =>
                        setArrangement({ ...arrangement, kontext: { ...arrangement.kontext, bildungsstufe: e.target.value } })
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
                        setArrangement({ ...arrangement, kontext: { ...arrangement.kontext, vorwissen: e.target.value } })
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
                      value={arrangement.kontext?.zeitbudgetMin ?? 90}
                      onChange={(e) =>
                        setArrangement({
                          ...arrangement,
                          kontext: { ...arrangement.kontext, zeitbudgetMin: Math.max(0, Number(e.target.value) || 0) }
                        })
                      }
                    />
                  </label>
                  <label>
                    Funktionskette / Zieltyp
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
                    Granularität / Rahmen
                    <select
                      value={arrangement.reichweite}
                      onChange={(e) => setArrangement({ ...arrangement, reichweite: e.target.value })}
                    >
                      <option value="r2">Szenario / Einzelstunde (R2)</option>
                      <option value="r3">Reihe / Ensemble (R3)</option>
                      <option value="r4">Modul / Kurs (R4)</option>
                    </select>
                  </label>
                </div>

                {/* Didaktische Ansätze (Lernpfadeditor-inspiriert: Verb + Lernen!) */}
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13.5, marginBottom: 6 }}>
                    Didaktischer Ansatz / Lernform (steuert Methoden-Ranking &amp; KI direkt):
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {DIDACTIC_APPROACH_OPTIONS.map((opt) => {
                      const active = ansatzCodes.includes(opt.code);
                      return (
                        <button
                          key={opt.code}
                          type="button"
                          className={`btn btn-sm ${active ? 'btn-primary' : ''}`}
                          onClick={() => toggleAnsatzCode(opt.code)}
                        >
                          {active ? '✓ ' : '+ '}
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    type="text"
                    style={{ width: '100%', marginTop: 8, fontSize: 13.5 }}
                    value={customAnsatzText}
                    onChange={(e) => setCustomAnsatzText(e.target.value)}
                    placeholder="Optional eigener didaktischer Ansatz (z. B. handlungsorientiertes Lernen, forschend-entdeckendes Lernen, Service Learning)"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10, marginTop: 12 }}>
                  <label style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    Lernziele (optional)
                    <textarea
                      rows={2}
                      value={lernziele}
                      onChange={(e) => setLernziele(e.target.value)}
                      placeholder="Was sollen die Lernenden am Ende können?"
                    />
                  </label>
                  <label style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    Ausgangslage / typische Hürden (optional)
                    <textarea
                      rows={2}
                      value={problemstellung}
                      onChange={(e) => setProblemstellung(e.target.value)}
                      placeholder="z. B. Fehlvorstellungen, geringe Motivation, heterogene Vorkenntnisse"
                    />
                  </label>
                </div>
              </div>

              {/* Group B: Akteure & Personenanzahl */}
              <div style={{ paddingTop: 12, borderTop: '1px solid var(--grid)' }}>
                <strong style={{ fontFamily: 'var(--display)', fontSize: 14.5 }}>
                  2. Lerngruppe &amp; Begleitung
                </strong>
                <div className="filter-grid" style={{ marginTop: 8 }}>
                  <label>
                    Gesamt-Klassengröße (Personen)
                    <input
                      type="number"
                      min={1}
                      max={300}
                      value={gruppeSize}
                      onChange={(e) => {
                        setGruppeSize(e.target.value);
                        const num = Number(e.target.value);
                        if (num > 0 && groups.length === 1 && groups[0].id === 'regel') {
                          setGroups([{ ...groups[0], count: num }]);
                        }
                      }}
                    />
                  </label>
                  <label>
                    Lehrkraft / Begleitpersonen
                    <input
                      type="text"
                      value={lehrkraefteInfo}
                      onChange={(e) => setLehrkraefteInfo(e.target.value)}
                      placeholder="z. B. 1 Lehrkraft, Co-Teaching + Sonderpädagogik"
                    />
                  </label>
                </div>
                <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>
                  Standardmäßig startet dein Konzept mit einer Gesamtgruppe (Regelniveau). Teilgruppen für Binnendifferenzierung fügst du gezielt nach dem Methodenkonzept in <strong>Schritt 3</strong> hinzu.
                </p>
              </div>

              {/* Group C: Technik & Raum */}
              <div style={{ paddingTop: 12, borderTop: '1px solid var(--grid)' }}>
                <strong style={{ fontFamily: 'var(--display)', fontSize: 14.5 }}>
                  3. Rahmenbedingungen (Raum &amp; Technik – filtert Methoden direkt)
                </strong>
                <div className="filter-grid" style={{ marginTop: 8 }}>
                  <label>
                    Verfügbare Technik (max.)
                    <select value={maxTechnik} onChange={(e) => setMaxTechnik(e.target.value)}>
                      <option value="">beliebig</option>
                      {valuesOf('technikbedarf').map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Raum-Zeit-Modus
                    <select value={raumzeitFilter} onChange={(e) => setRaumzeitFilter(e.target.value)}>
                      <option value="">beliebig</option>
                      {valuesOf('raumzeit').map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ justifyContent: 'flex-end' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 6 }}>
                      <input type="checkbox" checked={ohneInternet} onChange={(e) => setOhneInternet(e.target.checked)} />
                      Ohne Internet / Offline
                    </span>
                  </label>
                  <label style={{ justifyContent: 'flex-end' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 6 }}>
                      <input type="checkbox" checked={ohneKI} onChange={(e) => setOhneKI(e.target.checked)} />
                      Ohne KI-Methoden im Unterricht
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </details>
        </section>
      )}

      {/* =================================================================== */}
      {/* SCHRITT 2: METHODISCHES KONZEPT, ROLLEN, PARTITUR & LIVE-PRÜFUNG    */}
      {/* =================================================================== */}
      {step === 2 && (
        <section style={{ marginTop: 16 }}>
          <div className="card no-print" style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`btn btn-sm ${viewMode === 'verlaufsplan' ? 'btn-primary' : ''}`}
                onClick={() => setViewMode('verlaufsplan')}
              >
                📋 Methodisches Konzept (Rollen)
              </button>
              <button
                type="button"
                className={`btn btn-sm ${viewMode === 'partitur' ? 'btn-primary' : ''}`}
                onClick={() => setViewMode('partitur')}
              >
                🧩 Bausteine &amp; Slots bearbeiten
              </button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowLiveBand((s) => !s)}>
                {showLiveBand ? '▲ Zeitband ausblenden' : '▼ Zeitband einblenden'}
              </button>
              {showLiveBand && (
                <button type="button" className="btn btn-sm btn-ghost" onClick={exportSvg}>
                  ⬇ SVG
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-sm"
                style={{
                  borderColor: validation.gueltig ? 'var(--dC)' : 'var(--err)',
                  color: validation.gueltig ? 'var(--dC)' : 'var(--err)'
                }}
                onClick={() => setShowValidationDetails((s) => !s)}
              >
                {validation.gueltig ? '✓ Prüfer: Gültig' : `✕ Prüfer: ${nErr} Fehler`}
                {nWarn > 0 ? ` · ${nWarn} Hinweise` : ''} {showValidationDetails ? '▲' : '▼'}
              </button>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => setStep(3)}>
                Weiter zu Schritt 3: Binnendifferenzierung →
              </button>
            </div>
          </div>

          {(showValidationDetails || nErr > 0) && explainedMessages.length > 0 && (
            <div
              className="card"
              style={{
                padding: 14,
                marginTop: 10,
                borderLeft: `4px solid ${nErr > 0 ? 'var(--err)' : 'var(--dB)'}`
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <strong style={{ fontFamily: 'var(--display)', fontSize: 15 }}>
                  Live-Prüfung (R-00 bis R-12): {nErr} Fehler, {nWarn} Hinweise
                </strong>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowValidationDetails(false)}>
                  Einklappen
                </button>
              </div>
              <ul className="msgs" style={{ margin: 0 }}>
                {explainedMessages.map((em, i) => (
                  <li key={i} className={em.raw.schwere === 'Fehler' ? 'err' : ''}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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
                    <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
                      <strong>Behebung:</strong> {em.howToFix}
                    </div>
                  </li>
                ))}
              </ul>
              <details className="guardrails" style={{ marginTop: 10 }}>
                <summary>Die 4 FMT-Leitplanken</summary>
                <ul>
                  {FMT_GUARDRAILS.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </details>
            </div>
          )}

          {showLiveBand && (
            <div className="card" style={{ padding: 14, marginTop: 10 }}>
              <TimelineBandSvg
                arrangement={arrangement}
                blocksById={blocksById}
                svgRef={svgRef}
                groups={groups}
                subgroupMethods={subgroupMethods}
                ketten={bundle.ketten}
              />
            </div>
          )}

          {viewMode === 'verlaufsplan' ? (
            <VerlaufsplanView
              rows={scenarioRows}
              groups={groups}
              lehrkraefteInfo={lehrkraefteInfo}
              allBlocks={bundle.bausteine}
              subgroupMethods={subgroupMethods}
              onSubgroupMethodChange={handleSubgroupMethodChange}
              onEditDiffMeasure={handleEditDiffMeasure}
              onOpenResourcesForStep={(tab, k) => jumpToResources(tab, k)}
              maxTechnik={maxTechnik || undefined}
              ohneInternet={ohneInternet}
              ohneKI={ohneKI}
            />
          ) : (
            <PartiturView
              arrangement={arrangement}
              onChange={setArrangement}
              bundle={bundle}
              blocksById={blocksById}
              search={search}
              registry={exampleRegistry}
              labelOf={labelOf}
              explainedMessages={explainedMessages}
              onOpenOerForStep={(k) => jumpToResources('oer', k)}
              onOpenMaterialForStep={(k) => jumpToResources('material', k)}
            />
          )}
        </section>
      )}

      {/* =================================================================== */}
      {/* SCHRITT 3: BINNENDIFFERENZIERUNG (OPTIONAL, NACH METHODENKONZEPT)   */}
      {/* =================================================================== */}
      {step === 3 && (
        <section style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card no-print" style={{ padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <strong style={{ fontFamily: 'var(--display)', fontSize: 14.5 }}>
                🧭 Dein Methodenkonzept im Überblick (Phase anklicken zum Hervorheben)
              </strong>
              {(() => {
                const activeRow = scenarioRows.find((r) => r.key === (focusedStepKey || scenarioRows[0]?.key));
                return activeRow ? (
                  <span className="status-badge" style={{ borderColor: 'var(--dA)', color: 'var(--dA)' }}>
                    Aktiv: {activeRow.orderLabel} · {activeRow.methodName} ({activeRow.durationMin} min)
                  </span>
                ) : null;
              })()}
            </div>
            <TimelineBandSvg
              arrangement={arrangement}
              blocksById={blocksById}
              svgRef={svgRef}
              groups={groups}
              subgroupMethods={subgroupMethods}
              ketten={bundle.ketten}
              selectedStepKey={focusedStepKey || scenarioRows[0]?.key || null}
              onSelectStep={(k) => setFocusedStepKey(k)}
              oerByStep={oerByStep}
              generatedMaterials={generatedMaterials}
            />
          </div>

          <ScenarioStudioPanel
            mode="diff"
            activeResourceTab={resourceTab}
            onResourceTabChange={setResourceTab}
            totalClassSize={Number(gruppeSize) || undefined}
            focusedStepKey={focusedStepKey || scenarioRows[0]?.key || null}
            onSelectStepKey={(k) => setFocusedStepKey(k)}
            arrangement={arrangement}
            allBlocks={bundle.bausteine}
            blocksById={blocksById}
            usedBlocks={usedBlocks}
            validation={validation}
            scenarioRows={scenarioRows}
            labelOf={labelOf}
            fach={fach}
            thema={thema}
            didaktischerAnsatz={didaktischerAnsatzLabel}
            lehrkraefteInfo={lehrkraefteInfo}
            lernziele={lernziele}
            problemstellung={problemstellung}
            hinweise={hinweise}
            onFachChange={setFach}
            onThemaChange={setThema}
            onHinweiseChange={setHinweise}
            groups={groups}
            onGroupsChange={setGroups}
            aiDiffByStep={aiDiffByStep}
            onAiDiffChange={setAiDiffByStep}
            onEditDiffMeasure={handleEditDiffMeasure}
            subgroupMethods={subgroupMethods}
            onSubgroupMethodChange={handleSubgroupMethodChange}
            oerByStep={oerByStep}
            onOerByStepChange={setOerByStep}
            generatedMaterials={generatedMaterials}
            onGeneratedMaterialsChange={setGeneratedMaterials}
            thematicRows={thematicRows}
            onThematicRowsChange={setThematicRows}
            elaboration={elaboration}
            onElaborationChange={setElaboration}
            onPrintPdf={handlePrintPdf}
            onPrintOnePage={handlePrintOnePage}
            onNextStep={() => setStep(4)}
            onSaveBrowser={() => handleSaveBrowser(false)}
            onDownloadProject={handleDownloadProjectFile}
            getTimelineSvg={resolveTimelineSvgString}
            byok={byok}
            byokHeaders={byokHeaders}
            llmAvailable={llmAvailable}
            maxTechnik={maxTechnik || undefined}
            ohneInternet={ohneInternet}
            ohneKI={ohneKI}
          />
          <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <button type="button" className="btn" onClick={() => setStep(2)}>
              ← Zurück zum Methodischen Konzept
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setStep(4)}>
              Weiter zu Schritt 4: WLO-OER &amp; Material →
            </button>
          </div>
        </section>
      )}

      {/* =================================================================== */}
      {/* SCHRITT 4: WLO-OER-KACHELN & KI-MATERIAL                            */}
      {/* =================================================================== */}
      {step === 4 && (
        <section style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card no-print" style={{ padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <strong style={{ fontFamily: 'var(--display)', fontSize: 14.5 }}>
                🧭 Ablauf-Orientierung (Baustein anklicken, um Ziel-Phase für OER &amp; Material zu wählen)
              </strong>
              {(() => {
                const activeRow = scenarioRows.find((r) => r.key === (focusedStepKey || scenarioRows[0]?.key));
                return activeRow ? (
                  <span className="status-badge" style={{ borderColor: 'var(--dA)', color: 'var(--dA)' }}>
                    Aktiv: {activeRow.orderLabel} · {activeRow.methodName} ({activeRow.durationMin} min)
                  </span>
                ) : null;
              })()}
            </div>
            <TimelineBandSvg
              arrangement={arrangement}
              blocksById={blocksById}
              svgRef={svgRef}
              groups={groups}
              subgroupMethods={subgroupMethods}
              ketten={bundle.ketten}
              selectedStepKey={focusedStepKey || scenarioRows[0]?.key || null}
              onSelectStep={(k) => setFocusedStepKey(k)}
              oerByStep={oerByStep}
              generatedMaterials={generatedMaterials}
            />
          </div>

          <ScenarioStudioPanel
            mode="resources"
            activeResourceTab={resourceTab === 'material' ? 'material' : 'oer'}
            onResourceTabChange={setResourceTab}
            focusedStepKey={focusedStepKey || scenarioRows[0]?.key || null}
            onSelectStepKey={(k) => setFocusedStepKey(k)}
            arrangement={arrangement}
            allBlocks={bundle.bausteine}
            blocksById={blocksById}
            usedBlocks={usedBlocks}
            validation={validation}
            scenarioRows={scenarioRows}
            labelOf={labelOf}
            fach={fach}
            thema={thema}
            didaktischerAnsatz={didaktischerAnsatzLabel}
            lehrkraefteInfo={lehrkraefteInfo}
            lernziele={lernziele}
            problemstellung={problemstellung}
            hinweise={hinweise}
            onFachChange={setFach}
            onThemaChange={setThema}
            onHinweiseChange={setHinweise}
            groups={groups}
            onGroupsChange={setGroups}
            aiDiffByStep={aiDiffByStep}
            onAiDiffChange={setAiDiffByStep}
            onEditDiffMeasure={handleEditDiffMeasure}
            subgroupMethods={subgroupMethods}
            onSubgroupMethodChange={handleSubgroupMethodChange}
            oerByStep={oerByStep}
            onOerByStepChange={setOerByStep}
            generatedMaterials={generatedMaterials}
            onGeneratedMaterialsChange={setGeneratedMaterials}
            thematicRows={thematicRows}
            onThematicRowsChange={setThematicRows}
            elaboration={elaboration}
            onElaborationChange={setElaboration}
            onPrintPdf={handlePrintPdf}
            onPrintOnePage={handlePrintOnePage}
            onNextStep={() => setStep(5)}
            onSaveBrowser={() => handleSaveBrowser(false)}
            onDownloadProject={handleDownloadProjectFile}
            getTimelineSvg={resolveTimelineSvgString}
            byok={byok}
            byokHeaders={byokHeaders}
            llmAvailable={llmAvailable}
            maxTechnik={maxTechnik || undefined}
            ohneInternet={ohneInternet}
            ohneKI={ohneKI}
          />
          <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <button type="button" className="btn" onClick={() => setStep(3)}>
              ← Zurück zur Binnendifferenzierung
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setStep(5)}>
              Weiter zu Schritt 5: Fertiges thematisches Szenario &amp; Export →
            </button>
          </div>
        </section>
      )}

      {/* =================================================================== */}
      {/* SCHRITT 5: FERTIGES THEMATISCHES SZENARIO (TABELLE + TEXT + EXPORT) */}
      {/* =================================================================== */}
      {step === 5 && (
        <section style={{ marginTop: 16 }}>
          <div style={{ position: 'absolute', left: -9999, top: -9999, width: 1000, pointerEvents: 'none' }} aria-hidden="true">
            <TimelineBandSvg
              arrangement={arrangement}
              blocksById={blocksById}
              svgRef={svgRef}
              groups={groups}
              subgroupMethods={subgroupMethods}
              ketten={bundle.ketten}
            />
          </div>
          <ScenarioStudioPanel
            mode="export"
            activeResourceTab={resourceTab}
            onResourceTabChange={setResourceTab}
            focusedStepKey={focusedStepKey}
            arrangement={arrangement}
            allBlocks={bundle.bausteine}
            blocksById={blocksById}
            usedBlocks={usedBlocks}
            validation={validation}
            scenarioRows={scenarioRows}
            labelOf={labelOf}
            fach={fach}
            thema={thema}
            didaktischerAnsatz={didaktischerAnsatzLabel}
            lehrkraefteInfo={lehrkraefteInfo}
            lernziele={lernziele}
            problemstellung={problemstellung}
            hinweise={hinweise}
            onFachChange={setFach}
            onThemaChange={setThema}
            onHinweiseChange={setHinweise}
            groups={groups}
            onGroupsChange={setGroups}
            aiDiffByStep={aiDiffByStep}
            onAiDiffChange={setAiDiffByStep}
            onEditDiffMeasure={handleEditDiffMeasure}
            subgroupMethods={subgroupMethods}
            onSubgroupMethodChange={handleSubgroupMethodChange}
            oerByStep={oerByStep}
            onOerByStepChange={setOerByStep}
            generatedMaterials={generatedMaterials}
            onGeneratedMaterialsChange={setGeneratedMaterials}
            thematicRows={thematicRows}
            onThematicRowsChange={setThematicRows}
            elaboration={elaboration}
            onElaborationChange={setElaboration}
            onPrintPdf={handlePrintPdf}
            onPrintOnePage={handlePrintOnePage}
            onNextStep={() => setStep(5)}
            onSaveBrowser={() => handleSaveBrowser(false)}
            onDownloadProject={handleDownloadProjectFile}
            getTimelineSvg={resolveTimelineSvgString}
            byok={byok}
            byokHeaders={byokHeaders}
            llmAvailable={llmAvailable}
            maxTechnik={maxTechnik || undefined}
            ohneInternet={ohneInternet}
            ohneKI={ohneKI}
          />
          <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 14 }}>
            <button type="button" className="btn" onClick={() => setStep(4)}>
              ← Zurück zu WLO-OER &amp; Material
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
