import { useEffect, useMemo, useRef, useState } from 'react';
import {
  detectLearnerGroupsFromText,
  detectMatrixTraitsFromText,
  FMT_GUARDRAILS,
  hasAdjustmentProfile,
  migrateKennungen,
  proposeAdditionalPhases,
  type AdditionalPhaseProposal,
  type Arrangement,
  type MethodAdjustment,
  type MatchRequest,
  type MatchResult,
  type PhasenAntwort
} from '@fmt/core';
import { useCatalog } from '../data/CatalogContext.js';
import { PartiturView } from '../components/PartiturView.js';
import { VerlaufsplanView } from '../components/VerlaufsplanView.js';
import { ScenarioStudioPanel, type StudioTab } from '../components/ScenarioStudioPanel.js';
import { TimelineBandSvg } from '../components/TimelineBandSvg.js';
import { TeilgruppenEntscheidung } from '../components/TeilgruppenEntscheidung.js';
import { buildServerByokHeaders, isUserLlmConfigured, runDirectTranslate } from '../lib/directLlm.js';
import {
  appendBlockToArrangement,
  collectUsedBlocks,
  createChainPreset,
  createEmptyArrangement,
  findNextVariant,
  exportArrangementHtmlHandout,
  exportArrangementOnePageSheet
} from '../planner/arrangementOps.js';
import { explainValidationMessage } from '../planner/validationHelpers.js';
import { addExtraPhase, removeExtraPhase, shiftAdjustmentKeys, shiftStepKeys, type AddedPhase } from '../planner/extraPhases.js';
import {
  activeSubgroups,
  adjustmentGroups,
  adjustmentPhases,
  adjustmentSignature,
  adjustmentsInForce,
  applyAdjustments,
  behalteUebernommene,
  hilfeAlsMaterial,
  mainGroupOnly,
  outdatedAdjustments,
  pruefeTeilgruppen,
  type TeilgruppenPruefung
} from '../planner/differentiationFlow.js';
import { fachbereichFromField } from '../planner/fachFeld.js';
import { verstandenAus } from '../planner/pflichtangaben.js';
import { meldungenImAblauf, regelZeile } from '../planner/regelmeldung.js';
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
  loadActivePlannerDraft,
  loadSavedScenarios,
  ohneGesperrteMerkmale,
  rahmenAusAltbestand,
  printHtmlDocument,
  saveActivePlannerDraft,
  saveScenarioToStorage,
  type SavedScenario
} from '../planner/scenarioStorage.js';
import { RAUM_EIGENSCHAFT_KLARTEXT, raumEigenschaftLabel, SCHRIFT_ORDER, toggleRaumEigenschaft } from '../planner/rahmen.js';

type PlannerStep = 1 | 2 | 3 | 4 | 5;

interface DidacticApproachOption {
  id: string;
  label: string;
  ansatz: string[];
  anleitung?: string[];
  engagement?: string[];
  interaktion?: string[];
  featured?: boolean;
}

const DIDACTIC_APPROACH_OPTIONS: DidacticApproachOption[] = [
  // 12 Kern-Ansätze direkt sichtbar in Schritt 1 (ohne Aufklappen)
  { id: 'problemorientiert', label: 'Problemorientiertes Lernen', ansatz: ['forschend'], engagement: ['konstruktiv'], featured: true },
  { id: 'forschend', label: 'Forschendes Lernen', ansatz: ['forschend'], engagement: ['konstruktiv'], featured: true },
  { id: 'entdeckend', label: 'Entdeckendes Lernen', ansatz: ['forschend', 'offen'], anleitung: ['geleitet', 'offen'], featured: true },
  { id: 'handlungsorientiert', label: 'Handlungsorientiertes Lernen', ansatz: ['spiel-simulation', 'forschend'], engagement: ['aktiv', 'konstruktiv'], featured: true },
  { id: 'kooperativ', label: 'Kooperatives Lernen', ansatz: ['kooperativ'], interaktion: ['partner', 'kleingruppe-kooperativ'], featured: true },
  { id: 'lernen-durch-lehren', label: 'Lernen durch Lehren', ansatz: ['kooperativ', 'offen'], engagement: ['interaktiv', 'konstruktiv'], interaktion: ['kleingruppe-kooperativ', 'plenum-lernendengeleitet'], featured: true },
  { id: 'projektorientiert', label: 'Projektorientiertes Lernen', ansatz: ['offen'], engagement: ['konstruktiv'], featured: true },
  { id: 'selbstgesteuert', label: 'Selbstgesteuertes Lernen', ansatz: ['offen', 'reflexion'], anleitung: ['offen'], featured: true },
  { id: 'diskursiv', label: 'Diskursives Lernen', ansatz: ['diskurs'], engagement: ['interaktiv'], featured: true },
  { id: 'spielerisch', label: 'Spielerisches Lernen', ansatz: ['spiel-simulation'], engagement: ['aktiv', 'interaktiv'], featured: true },
  { id: 'individualisiert', label: 'Individualisiertes Lernen', ansatz: ['offen', 'diagnose-feedback'], featured: true },
  { id: 'instruktionsorientiert', label: 'Instruktionsorientiertes Lernen', ansatz: ['instruktion', 'uebung'], anleitung: ['explizit'], featured: true },
  // 10 weitere wichtige didaktische Ansätze (1 Klick direkt daneben)
  { id: 'kollaborativ', label: 'Kollaboratives Lernen', ansatz: ['kooperativ'], engagement: ['interaktiv'], interaktion: ['kleingruppe-kooperativ'] },
  { id: 'selbstreguliert', label: 'Selbstreguliertes Lernen', ansatz: ['reflexion', 'diagnose-feedback'] },
  { id: 'erfahrungsbasiert', label: 'Erfahrungsbasiertes Lernen', ansatz: ['spiel-simulation', 'reflexion'], engagement: ['aktiv'] },
  { id: 'situationsorientiert', label: 'Situationsorientiertes Lernen', ansatz: ['forschend', 'spiel-simulation'] },
  { id: 'kompetenzorientiert', label: 'Kompetenzorientiertes Lernen', ansatz: ['forschend', 'diagnose-feedback'], engagement: ['konstruktiv'] },
  { id: 'konstruktivistisch', label: 'Konstruktivistisches Lernen', ansatz: ['forschend', 'kooperativ'], engagement: ['konstruktiv', 'interaktiv'] },
  { id: 'dialogisch', label: 'Dialogisches Lernen', ansatz: ['diskurs', 'kooperativ'], interaktion: ['partner', 'plenum-lernendengeleitet'] },
  { id: 'simulationsbasiert', label: 'Simulationsbasiertes Lernen', ansatz: ['spiel-simulation'], engagement: ['aktiv', 'interaktiv'] },
  { id: 'reflexiv', label: 'Reflexives Lernen', ansatz: ['reflexion'] },
  { id: 'digital-ki', label: 'Digitales & KI-gestütztes Lernen', ansatz: ['digital-ki'] }
];

const APPROACH_BY_ID = new Map(DIDACTIC_APPROACH_OPTIONS.map((o) => [o.id, o]));

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

/** Context with one detail set, or removed when empty, so that an empty field is not sent. */
function mitKontext<K extends keyof NonNullable<Arrangement['kontext']>>(
  kontext: Arrangement['kontext'],
  key: K,
  wert: NonNullable<Arrangement['kontext']>[K] | undefined
): Arrangement['kontext'] {
  const next = { ...(kontext || {}) } as NonNullable<Arrangement['kontext']>;
  if (wert === undefined || wert === '') delete next[key];
  else next[key] = wert;
  return next;
}

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

  // The Baukasten opens empty: no sample text, no preselected approach, no flow.
  const [scenarioText, setScenarioText] = useState('');
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [matchNotice, setMatchNotice] = useState<string | null>(null);
  // Counter behind „Anderer Vorschlag“: 0 is the first proposal for the current text.
  const [variante, setVariante] = useState(0);
  const [busyAi, setBusyAi] = useState(false);
  const [listening, setListening] = useState(false);

  // Optional structured context fields (aligned with Lernpfadeditor & directly wired to Matcher, Matrix, WLO & KI!)
  const [fach, setFach] = useState('');
  const [thema, setThema] = useState('');
  const [ansatzCodes, setAnsatzCodes] = useState<string[]>([]);
  const [showAllApproaches, setShowAllApproaches] = useState(false);
  const [presetContextSource, setPresetContextSource] = useState<string | null>(null);
  const [customAnsatzText, setCustomAnsatzText] = useState('');
  const [lehrkraefteInfo, setLehrkraefteInfo] = useState('1 Lehrkraft');
  const [lernziele, setLernziele] = useState('');
  const [problemstellung, setProblemstellung] = useState('');
  const [hinweise, setHinweise] = useState('');
  const [gruppeSize, setGruppeSize] = useState<string>('');
  const [maxTechnik, setMaxTechnik] = useState<string>('');
  const [ohneInternet, setOhneInternet] = useState(false);
  const [ohneKI, setOhneKI] = useState(false);
  const [raumzeitFilter, setRaumzeitFilter] = useState<string>('');
  // Room of the lesson (vocab raumtyp), no preselection; raumBietet is set only once the teacher changes a property.
  const [raum, setRaum] = useState<string>('');
  const [raumBietet, setRaumBietet] = useState<string[] | null>(null);
  const [ohneSchrift, setOhneSchrift] = useState<string[]>([]);
  const [termine, setTermine] = useState<string>('');
  // Missing required details completed in the line "Fehlt noch" (step 1); empty means not given, nothing is preset.
  const [zielErg, setZielErg] = useState('');
  const [stufeErg, setStufeErg] = useState('');
  const [zeitErg, setZeitErg] = useState('');
  const [themaErg, setThemaErg] = useState('');
  /** Completions belong to the text they were made for: a new text, a loaded example or scenario starts without them. */
  const clearErgaenzungen = () => {
    setZielErg('');
    setStufeErg('');
    setZeitErg('');
    setThemaErg('');
  };

  const [groups, setGroups] = useState<LearnerGroup[]>(STANDARD_LEARNER_GROUPS);
  const [aiDiffByStep, setAiDiffByStep] = useState<Record<string, StepDiffSuggestion[]>>({});
  const [subgroupMethods, setSubgroupMethods] = useState<SubgroupMethodMap>({});
  // Step 3 "Vorgehen anpassen": the proposals of the last run and the group selection they were made for.
  const [autoAdjustments, setAutoAdjustments] = useState<MethodAdjustment[]>([]);
  const [adjustedFor, setAdjustedFor] = useState<string | null>(null);
  // Step 3: answers per subgroup and phase of the last check, with the hints per group.
  const [pruefung, setPruefung] = useState<TeilgruppenPruefung | null>(null);
  // Set after "Alle Anpassungen zurücknehmen"; a new check or a new swap clears it.
  const [allesZurueck, setAllesZurueck] = useState(false);
  // A loaded scenario named a blocked trait (Lerntypen): step 3 shows the note once ('offen' → 'gezeigt' → gone).
  const [gesperrtHinweis, setGesperrtHinweis] = useState<'offen' | 'gezeigt' | null>(null);
  // Step 3: short phases for the whole class, proposed by the last check and taken over by the teacher.
  const [extraProposals, setExtraProposals] = useState<AdditionalPhaseProposal[]>([]);
  const [addedPhases, setAddedPhases] = useState<AddedPhase[]>([]);
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
  // Snapshot of the template flow as loaded. Only a flow that still equals it is cleared on own input,
  // so imported, saved or hand-edited flows are never wiped.
  const templateFlowRef = useRef<string | null>(null);
  // Request for which `variante` counts; a changed request starts again at the first proposal.
  const variantKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!bundle) return;
    if (!arrangement) {
      let initial = createEmptyArrangement(bundle);
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
          genannt?: string[];
          ohneSchrift?: Array<'lesen' | 'schreiben'>;
          ohneBewegung?: boolean;
        }>;
      };
      if (h.scenarioText && !h.returnToStep3) setScenarioText(h.scenarioText);
      if (typeof h.maxTechnik === 'string') setMaxTechnik(h.maxTechnik);
      if (typeof h.ohneInternet === 'boolean') setOhneInternet(h.ohneInternet);
      if (typeof h.ohneKI === 'boolean') setOhneKI(h.ohneKI);
      if (Array.isArray(h.groups) && h.groups.length > 0) {
        const geprueft = ohneGesperrteMerkmale(
          h.groups.map((g) => ({
            id: g.id,
            label: g.label,
            profile: g.label,
            focus: g.id === 'vertiefung' ? 'vertiefung' : g.id === 'regel' ? 'regel' : 'basis',
            active: true,
            count: g.count,
            personaId: g.personaId,
            matrixValues: g.matrixValues || {},
            ...(Array.isArray(g.genannt) ? { genannt: g.genannt } : {}),
            ...(g.ohneSchrift?.length ? { ohneSchrift: g.ohneSchrift } : {}),
            ...(g.ohneBewegung ? { ohneBewegung: true } : {})
          })),
          bundle?.teilgruppen.gesperrt
        );
        setGroups(geprueft.groups);
        if (geprueft.entfernt) setGesperrtHinweis('offen');
      }
      if (h.returnToStep3) {
        // The page was left for /differenzierung and mounts anew: bring the flow back from the live draft.
        const draft = loadActivePlannerDraft();
        if (draft) {
          setArrangement(migrateKennungen(draft.arrangement, bundle?.weiterleitungen));
          setFach(draft.fach || '');
          setThema(draft.thema || '');
          setScenarioText(draft.scenarioText || '');
          clearErgaenzungen();
          setStep(3);
          setResourceTab('diff');
          setMatchNotice('Aktualisierte Teilgruppen & Rahmenbedingungen aus „Differenzierung“ in Schritt 3 übernommen.');
        } else {
          setStep(1);
        }
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
    const labels = ansatzCodes.map((c) => APPROACH_BY_ID.get(c)?.label || labelOf('ansatz', c));
    if (customAnsatzText.trim()) labels.push(customAnsatzText.trim());
    return labels.join(', ');
  }, [ansatzCodes, customAnsatzText, labelOf]);

  // Subject area of the plan: from the proposal, otherwise read from subject and topic (examples, saved plans).
  const planFachbereich = useMemo(() => {
    const fromMatch = matchResult?.kriterien?.fachbereich;
    if (typeof fromMatch === 'string' && fromMatch) return fromMatch;
    const read = matcher && `${fach} ${thema}`.trim() ? matcher.lesen(`${fach}, ${thema}`).kriterien.fachbereich : undefined;
    return typeof read === 'string' && read ? read : undefined;
  }, [matchResult, matcher, fach, thema]);

  // Plans stored before a method was merged or renamed: rewrite former ids once the catalogue is there.
  useEffect(() => {
    if (!bundle?.weiterleitungen) return;
    setArrangement((prev) => (prev ? migrateKennungen(prev, bundle.weiterleitungen) : prev));
  }, [bundle, arrangement]);

  // An edited flow moves or replaces phases; proposals made for the old phase are taken out again.
  useEffect(() => {
    const stale = outdatedAdjustments(scenarioRows, adjustmentsInForce(subgroupMethods, autoAdjustments));
    if (stale.length > 0) setSubgroupMethods((prev) => applyAdjustments(prev, stale, []));
  }, [scenarioRows, subgroupMethods, autoAdjustments]);

  // The note on a removed blocked trait stands in step 3 until the teacher leaves it once.
  useEffect(() => {
    if (step === 3 && gesperrtHinweis === 'offen') setGesperrtHinweis('gezeigt');
    if (step !== 3 && gesperrtHinweis === 'gezeigt') setGesperrtHinweis(null);
  }, [step, gesperrtHinweis]);

  if (!bundle || !validator || !search || !matcher || !arrangement || !validation) {
    return <div className="page-section">Lade Szenario-Baukasten…</div>;
  }

  const byokHeaders = (): Record<string, string> => buildServerByokHeaders(byok);

  const toggleAnsatzCode = (id: string) => {
    setPresetContextSource(null);
    setAnsatzCodes((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  /**
   * When the user previously loaded a starter preset (or the initial sample) and now edits the
   * free-text prompt above, automatically clear stale preset-populated optional fields so old
   * Fach/Thema/Lernziele/Ansätze never contaminate the new scenario.
   */
  const handleScenarioTextChange = (nextText: string) => {
    // Completions stay while typing: buildRequest sends a completion only for a gap the text leaves open.
    setScenarioText(nextText);
    if (templateFlowRef.current && JSON.stringify(arrangement) === templateFlowRef.current) {
      // The untouched template flow belongs to the template text; an own description starts from an empty flow.
      templateFlowRef.current = null;
      setArrangement(createEmptyArrangement(bundle));
      setMatchResult(null);
      resetFlowDerived();
      setMatchNotice('Der Ablauf des Beispiels wurde für deine eigene Eingabe geleert.');
    }
    if (presetContextSource) {
      setPresetContextSource(null);
      setFach('');
      setThema('');
      setAnsatzCodes([]);
      setCustomAnsatzText('');
      setLernziele('');
      setProblemstellung('');
      setGruppeSize('');
      setMaxTechnik('');
      setOhneInternet(false);
      setOhneKI(false);
      setRaumzeitFilter('');
      setGroups(STANDARD_LEARNER_GROUPS);
      setMatchNotice('Das Beispiel wurde für deine eigene Eingabe zurückgesetzt.');
    }
  };

  /** Everything that is keyed by the steps of the current flow; a new flow starts without it. */
  const resetFlowDerived = () => {
    setThematicRows(null);
    setElaboration(null);
    setOerByStep({});
    setGeneratedMaterials([]);
    setAiDiffByStep({});
    setSubgroupMethods({});
    setAutoAdjustments([]);
    setAdjustedFor(null);
    setPruefung(null);
    setAllesZurueck(false);
    setExtraProposals([]);
    setAddedPhases([]);
  };

  const subgroups = activeSubgroups(groups);
  const groupSignature = adjustmentSignature(scenarioRows, groups, { maxTechnik, ohneInternet, ohneKI, fachbereich: planFachbereich });
  // Subgroups without persona or matrix values cannot be checked; the result says so.
  const uncheckedSubgroups = subgroups.filter(
    (g) => !hasAdjustmentProfile({ personaId: g.personaId, selectedValues: g.matrixValues, ohneSchrift: g.ohneSchrift, ohneBewegung: g.ohneBewegung })
  );
  const adjustmentsNow = adjustmentsInForce(subgroupMethods, autoAdjustments);
  // Added phases the teacher removed again in step 2 no longer count.
  const addedPhasesNow = addedPhases.filter((a) => scenarioRows.some((r) => r.methodId === a.kennung));

  const checkConstraints = {
    maxTechnik: maxTechnik || undefined,
    ohneInternet,
    ohneKI,
    bildungsstufe: arrangement.kontext?.bildungsstufe || undefined,
    fachbereich: planFachbereich
  };
  const signatureOf = (rows: typeof scenarioRows) =>
    adjustmentSignature(rows, groups, { maxTechnik, ohneInternet, ohneKI, fachbereich: planFachbereich });

  const regelsatz = { teilgruppen: bundle.teilgruppen, regeln: bundle.regeln, schemes: bundle.schemes };

  /**
   * Step 3: one answer per subgroup and phase (fits, help in the method, other method) and short phases the plan
   * lacks. Nothing is entered by itself: the teacher takes over a swap or a help on its card.
   */
  const runMethodAdjustment = () => {
    const phases = adjustmentPhases(scenarioRows);
    const res = pruefeTeilgruppen(bundle.bausteine, scenarioRows, groups, checkConstraints, regelsatz);
    setSubgroupMethods((prev) => behalteUebernommene(prev, autoAdjustments, res.vorschlaege));
    setAutoAdjustments(res.vorschlaege);
    setPruefung(res);
    setAllesZurueck(false);
    setExtraProposals(proposeAdditionalPhases(bundle.bausteine, phases, adjustmentGroups(groups), checkConstraints));
    setAdjustedFor(signatureOf(scenarioRows));
  };

  /**
   * A phase was inserted (delta 1) or removed (delta -1) at `index`: everything stored per phase moves with it.
   * Method swaps stay exactly as the teacher left them (taken-back ones are not entered again); only the list
   * of additional phases is brought up to date. A result that was already out of date stays marked as such.
   */
  const applyFlowChange = (nextArrangement: Arrangement, index: number, delta: 1 | -1) => {
    const rows = buildScenarioRows(nextArrangement, bundle, blocksById, labelOf, groups, {}, {}, '', {}, []);
    const upToDate = adjustedFor !== null && adjustedFor === groupSignature;
    setArrangement(nextArrangement);
    setSubgroupMethods((prev) => shiftStepKeys(prev, index, delta));
    if (upToDate) {
      // The cards follow the new flow: every phase, the added one too, gets its answer.
      const res = pruefeTeilgruppen(bundle.bausteine, rows, groups, checkConstraints, regelsatz);
      setAutoAdjustments(res.vorschlaege);
      setPruefung(res);
      setExtraProposals(proposeAdditionalPhases(bundle.bausteine, adjustmentPhases(rows), adjustmentGroups(groups), checkConstraints));
      setAdjustedFor(signatureOf(rows));
    } else {
      setAutoAdjustments((prev) => shiftAdjustmentKeys(prev, index, delta));
      setPruefung((prev) => (prev ? { ...prev, antworten: shiftAdjustmentKeys(prev.antworten, index, delta) } : prev));
    }
    setOerByStep((prev) => shiftStepKeys(prev, index, delta));
    setAiDiffByStep((prev) => shiftStepKeys(prev, index, delta));
    setGeneratedMaterials((prev) =>
      prev.flatMap((m) => {
        const key = Object.keys(shiftStepKeys({ [m.stepKey]: true }, index, delta))[0];
        return key ? [{ ...m, stepKey: key }] : [];
      })
    );
    // Topic rows keep their texts and move with their phases, like after any other edit of the flow.
    setThematicRows((prev) =>
      prev
        ? prev.flatMap((r) => {
            const key = Object.keys(shiftStepKeys({ [r.key]: true }, index, delta))[0];
            return key ? [{ ...r, key }] : [];
          })
        : prev
    );
    setFocusedStepKey((prev) => (prev ? (Object.keys(shiftStepKeys({ [prev]: true }, index, delta))[0] ?? null) : prev));
  };

  const addProposedPhase = (p: AdditionalPhaseProposal) => {
    const res = addExtraPhase(arrangement, blocksById, p);
    applyFlowChange(res.arrangement, res.index, 1);
    setAddedPhases((prev) => [...prev.filter((a) => a.kennung !== res.added.kennung), res.added]);
  };

  const removeAddedPhase = (a: AddedPhase) => {
    const res = removeExtraPhase(arrangement, a);
    setAddedPhases((prev) => prev.filter((x) => x.kennung !== a.kennung));
    if (res) applyFlowChange(res.arrangement, res.index, -1);
  };

  const undoAdjustments = (list: MethodAdjustment[]) => {
    setSubgroupMethods((prev) => applyAdjustments(prev, list, []));
  };

  const takeOverAdjustment = (a: MethodAdjustment) => {
    handleSubgroupMethodChange(a.stepKey, a.groupId, a.zuKennung);
    setAllesZurueck(false);
  };

  /** A help taken over goes into step 4 as material of its phase. */
  const takeOverSupport = (a: PhasenAntwort, phaseLabel: string) => {
    const m = hilfeAlsMaterial(a, phaseLabel);
    setGeneratedMaterials((prev) => [...prev.filter((x) => !(x.materialType === 'hilfe' && x.stepKey === a.stepKey && x.groupId === a.groupId)), m]);
  };

  const undoSupport = (a: PhasenAntwort) => {
    setGeneratedMaterials((prev) => prev.filter((x) => !(x.materialType === 'hilfe' && x.stepKey === a.stepKey && x.groupId === a.groupId)));
  };

  const updateGroup = (id: string, patch: Partial<LearnerGroup>) => {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
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
    if (ansatzCodes.length) {
      const fmtAnsatz = new Set<string>();
      const fmtAnleitung = new Set<string>();
      const fmtEngagement = new Set<string>();
      const fmtInteraktion = new Set<string>();
      for (const id of ansatzCodes) {
        const opt = APPROACH_BY_ID.get(id);
        if (opt) {
          opt.ansatz.forEach((a) => fmtAnsatz.add(a));
          opt.anleitung?.forEach((a) => fmtAnleitung.add(a));
          opt.engagement?.forEach((a) => fmtEngagement.add(a));
          opt.interaktion?.forEach((a) => fmtInteraktion.add(a));
        } else {
          fmtAnsatz.add(id);
        }
      }
      if (fmtAnsatz.size) req.ansatz = [...fmtAnsatz];
      if (fmtAnleitung.size && ansatzCodes.length === 1) req.anleitung = [...fmtAnleitung];
      if (fmtEngagement.size && ansatzCodes.length === 1) req.engagement = [...fmtEngagement];
      if (fmtInteraktion.size && ansatzCodes.length === 1) req.interaktion = [...fmtInteraktion];
    }
    // Only send explicit class size so we NEVER overwrite group sizes written in scenarioText (e.g. "6 Kinder", "120 Studierende")
    const explicitGroup = Number(gruppeSize);
    if (explicitGroup > 0) req.gruppe = explicitGroup;
    if (maxTechnik) req.maxTechnik = maxTechnik;
    if (ohneInternet) req.ohneInternet = true;
    if (ohneKI) req.ohneKI = true;
    if (raumzeitFilter) req.raumzeit = [raumzeitFilter];
    if (raum) req.raum = raum;
    if (raum && raumBietet) req.raumBietet = raumBietet;
    if (ohneSchrift.length) req.ohneSchrift = SCHRIFT_ORDER.filter((x) => ohneSchrift.includes(x));
    if (Number(termine) > 0) req.termine = Number(termine);
    // A completion only fills a gap: what the text itself states wins (explicit fields would beat the text).
    const ausText = matcher ? matcher.lesen(scenarioText).kriterien : {};
    if (zielErg && !ausText.zielart && !ausText.zieltyp) req.zielart = zielErg;
    if (stufeErg && !ausText.bildungsstufe) req.bildungsstufe = stufeErg;
    if (Number(zeitErg) > 0 && !ausText.zeitMin) req.zeitMin = Number(zeitErg);
    if (themaErg.trim() && !extractSubjectAndTopic(scenarioText).thema) req.thema = themaErg.trim();
    // The optional "Fach" field counts like in the AI mode and in /api/v1/plan, unless the text names a subject.
    const fbFeld = matcher ? fachbereichFromField(matcher, scenarioText, fach) : undefined;
    if (fbFeld) req.fachbereich = fbFeld;
    return req;
  };

  const buildEnrichedAiText = (): string => {
    const extras: string[] = [];
    if (fach.trim()) extras.push(`Fach: ${fach.trim()}`);
    if (thema.trim()) extras.push(`Thema: ${thema.trim()}`);
    if (didaktischerAnsatzLabel) extras.push(`Didaktischer Ansatz: ${didaktischerAnsatzLabel}`);
    if (lehrkraefteInfo.trim() && lehrkraefteInfo.trim() !== '1 Lehrkraft') {
      extras.push(`Lehrkräfte/Begleitung: ${lehrkraefteInfo.trim()}`);
    }
    if (lernziele.trim()) extras.push(`Lernziele: ${lernziele.trim()}`);
    if (gruppeSize && Number(gruppeSize) > 0) extras.push(`Klassengröße: ${gruppeSize} Lernende`);
    if (maxTechnik) extras.push(`Technik höchstens: ${labelOf('technikbedarf', maxTechnik)}`);
    if (ohneInternet) extras.push('ohne Internet');
    if (ohneKI) extras.push('ohne KI');
    if (raumzeitFilter) extras.push(`Raumzeit: ${labelOf('raumzeit', raumzeitFilter)}`);
    if (raum) extras.push(`Raum: ${labelOf('raumtyp', raum)}`);
    if (raum && raumBietet) {
      extras.push(`Der Raum bietet: ${raumBietet.map((x) => raumEigenschaftLabel(x, labelOf)).join(', ') || 'nichts davon'}`);
    }
    if (ohneSchrift.includes('lesen')) extras.push('Die Lernenden können noch nicht lesen');
    if (ohneSchrift.includes('schreiben')) extras.push('Die Lernenden können noch nicht schreiben');
    if (Number(termine) > 0) extras.push(`Termine: ${Number(termine)}`);
    return extras.length ? `${scenarioText.trim()}\n\nZusatzangaben: ${extras.join('; ')}` : scenarioText;
  };

  const applyStarterPreset = (p: StarterPreset) => {
    setFach(p.fach);
    setThema(p.thema);
    setScenarioText(p.text);
    setAnsatzCodes(
      p.ansatz.map((code) =>
        code === 'instruktion'
          ? 'instruktionsorientiert'
          : code === 'diskurs'
            ? 'diskursiv'
            : code === 'uebung'
              ? 'instruktionsorientiert'
              : code
      ).filter((v, i, arr) => arr.indexOf(v) === i)
    );
    setLernziele(p.lernziele);
    setProblemstellung(p.problemstellung);
    setMaxTechnik('');
    setOhneInternet(/ohne\s+internet/i.test(p.text));
    setOhneKI(false);
    setGruppeSize('');
    setGroups(STANDARD_LEARNER_GROUPS);
    setPresetContextSource(p.label);
    const preset = createChainPreset(p.chain, bundle);
    preset.name = `${p.fach}: ${p.thema}`;
    preset.kontext = {
      bildungsstufe: p.bildungsstufe,
      vorwissen: p.vorwissen,
      zeitbudgetMin: p.zeitMin
    };
    templateFlowRef.current = JSON.stringify(preset);
    setArrangement(preset);
    setMatchResult(null);
    clearErgaenzungen();
    resetFlowDerived();
    setMatchNotice(`Beispiel „${p.label}“ geladen. Sieh dir den Ablauf in Schritt 2 an oder überschreibe den Text mit deinem eigenen Vorhaben.`);
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
          matrixValues: g.selectedValues || {},
          ...(g.genannt ? { genannt: g.genannt } : {})
        }));
        const hasRegel = detectedGroups.some((g) => g.focus === 'regel');
        setGroups(
          hasRegel
            ? detectedGroups
            : [{ ...STANDARD_LEARNER_GROUPS[0], label: 'Regelgruppe', count: undefined }, ...detectedGroups]
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
    setVariante(0);
    setMatchResult(res);
    // Detected subgroups get their own notice in step 2; only the single-phase result mentions them here.
    const matrixHint = detectedMatrixTriggers.length
      ? ` Erkannte Teilgruppen (${[...new Set(detectedMatrixTriggers)].join(', ')}) kommen in Schritt 3 dazu.`
      : '';
    if (res.modus === 'ablauf' && res.arrangement) {
      setArrangement(res.arrangement);
      resetFlowDerived();
      setMatchNotice(`Vorschlag für deinen Ablauf: ${res.kette?.label}. Du kannst ihn hier ansehen und anpassen.`);
      setStep(2);
    } else if (res.modus === 'phase') {
      setMatchNotice(
        `Das klingt nach einer einzelnen Phase: ${res.vorschlaege.length} passende Methoden gefunden. Klicke unten eine an, um sie zu übernehmen.${matrixHint}`
      );
    }
  };

  /** Next equally suitable flow for the same text; the matcher stays deterministic per variant number. */
  const runOtherProposal = () => {
    const request = buildStructuredMatchRequest();
    const key = JSON.stringify(request);
    const from = variantKeyRef.current === key ? variante : 0;
    variantKeyRef.current = key;
    const next = findNextVariant((v) => matcher.zuordnen({ ...request, variante: v }), arrangement, from);
    if (!next) {
      setMatchNotice('Für diese Angaben gibt es keinen weiteren gleichwertigen Vorschlag. Ändere Text, Ansatz oder Zeit für andere Abläufe.');
      return;
    }
    setVariante(next.variante);
    setMatchResult(next.result);
    setArrangement(next.arrangement);
    resetFlowDerived();
    setMatchNotice(`Anderer Vorschlag (Variante ${next.variante + 1}) für dieselben Angaben.`);
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
      setVariante(0);
      if (json.ergebnis) setMatchResult(json.ergebnis);
      if (json.ergebnis?.modus === 'ablauf' && json.ergebnis?.arrangement) {
        setArrangement(json.ergebnis.arrangement as Arrangement);
        resetFlowDerived();
        setStep(2);
      }
      setMatchNotice(
        json.quelle === 'llm'
          ? 'Vorschlag für deinen Ablauf: von der KI verstanden, mit den Regeln der Methodendatenbank geprüft.'
          : json.hinweis || 'Vorschlag für deinen Ablauf nach den Regeln der Methodendatenbank.'
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
    raum,
    raumBietet: raumBietet ?? undefined,
    ohneSchrift,
    termine,
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
    // Plans saved before a method was merged or renamed keep working.
    setArrangement(migrateKennungen(p.arrangement, bundle?.weiterleitungen));
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
    // Old entries carry lernort, raumFilter or ohneLesen; storage and import read them into these fields.
    const rahmen = rahmenAusAltbestand(p as Record<string, unknown>);
    setRaum(rahmen.raum ?? '');
    setRaumBietet(rahmen.raumBietet ?? null);
    setOhneSchrift(rahmen.ohneSchrift ?? []);
    setTermine(rahmen.termine ?? '');
    if (p.lernziele !== undefined) setLernziele(p.lernziele);
    if (p.problemstellung !== undefined) setProblemstellung(p.problemstellung);
    if (p.lehrkraefteInfo !== undefined) setLehrkraefteInfo(p.lehrkraefteInfo);
    if (p.groups?.length) {
      // A blocked trait (Lerntypen) is not evaluated: the value is dropped and step 3 says so once.
      const geprueft = ohneGesperrteMerkmale(p.groups, bundle?.teilgruppen.gesperrt);
      setGroups(geprueft.groups);
      setGesperrtHinweis(geprueft.entfernt ? 'offen' : null);
    }
    if (p.aiDiffByStep) setAiDiffByStep(p.aiDiffByStep);
    if (p.oerByStep) setOerByStep(p.oerByStep);
    setSubgroupMethods(p.subgroupMethods || {});
    setAutoAdjustments([]);
    setAdjustedFor(null);
    setPruefung(null);
    setAllesZurueck(false);
    setExtraProposals([]);
    setAddedPhases([]);
    if (p.generatedMaterials) setGeneratedMaterials(p.generatedMaterials);
    if (p.thematicRows !== undefined) setThematicRows(p.thematicRows);
    if (p.elaboration !== undefined) setElaboration(p.elaboration);
    setMatchResult(null);
    clearErgaenzungen();
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
  const hasFlow = scenarioRows.length > 0;
  const canPropose = scenarioText.trim().length > 0;
  // Class size as typed in "Mehr Angaben", else as recognised in the description.
  // What the matcher assumed because the request left it open (pflichtangaben.angenommen), the other notes on the
  // sequence (annahmen of the plan), and why chain steps stayed open (shown above the flow).
  const annahmenListe = [...new Set((matchResult?.pflichtangaben?.angenommen || []).map((x) => x.grund))];
  const ablaufHinweise = [...new Set((matchResult?.modus === 'ablauf' && matchResult.annahmen) || [])].filter((t) => !annahmenListe.includes(t));
  const offeneSchritte =
    matchResult?.modus === 'ablauf'
      ? (matchResult.offenGruende || []).map((o) => ({
          ...o,
          label: bundle?.ketten.find((k) => k.id === matchResult.kette?.id)?.schritte.find((st) => st.id === o.schritt)?.label || o.schritt
        }))
      : [];
  // The line "Verstanden" and "Fehlt noch" read back from the last proposal (W13).
  const verstanden = matchResult ? verstandenAus(matchResult, labelOf, extractSubjectAndTopic(scenarioText).thema || undefined) : null;
  // Rule messages: only for methods in the arrangement (a proposal not taken or a method swapped out says nothing).
  // Method messages stand at their row in step 2; situation-level ones (no method) and those of a method in the
  // arrangement without a row of its own (e.g. in a slot) stand under "Hinweise zum Ablauf".
  // A message about several methods (the safety note) stays while any of them is in the arrangement.
  const regelmeldungen = meldungenImAblauf(matchResult?.regelmeldungen || [], usedBlocks, bundle?.regeln);
  const zeilenMethoden = new Set(scenarioRows.map((r) => r.methodId));
  const ablaufRegelmeldungen = regelmeldungen.filter((m) => !m.baustein || !zeilenMethoden.has(m.baustein));
  const classSize = Number(gruppeSize) || Number(matchResult?.kriterien?.gruppe) || undefined;
  const step2Groups = mainGroupOnly(groups, classSize);
  const adjustmentStale = adjustedFor !== null && adjustedFor !== groupSignature;
  // In step 2 another proposal is only offered while it cannot discard own work:
  // the flow is still the proposed one and nothing has been built on it yet.
  const otherProposalSafe =
    matchResult?.modus === 'ablauf' &&
    Boolean(matchResult.arrangement) &&
    JSON.stringify(matchResult.arrangement) === JSON.stringify(arrangement) &&
    totalAttachedOer === 0 &&
    generatedMaterials.length === 0 &&
    Object.keys(subgroupMethods).length === 0 &&
    !elaboration;

  const steps: Array<{ id: PlannerStep; label: string; sub: string; needsFlow: boolean }> = [
    { id: 1, label: 'Vorhaben', sub: 'Beschreiben, was du unterrichten willst', needsFlow: false },
    {
      id: 2,
      label: 'Methodisches Konzept',
      sub: hasFlow ? `${scenarioRows.length} Phasen für die ganze Klasse` : 'Ablauf für die ganze Klasse',
      needsFlow: false
    },
    {
      id: 3,
      label: 'Binnendifferenzierung',
      sub: subgroups.length
        ? `${subgroups.length} ${subgroups.length === 1 ? 'Teilgruppe' : 'Teilgruppen'}${adjustmentsNow.length ? ` · ${adjustmentsNow.length} ${adjustmentsNow.length === 1 ? 'Methode' : 'Methoden'} angepasst` : ''}`
        : 'Freiwillig: Teilgruppen berücksichtigen',
      needsFlow: true
    },
    {
      id: 4,
      label: 'Material',
      sub:
        totalAttachedOer + generatedMaterials.length > 0
          ? `${totalAttachedOer} freie Materialien · ${generatedMaterials.length} eigene`
          : 'Freie Materialien finden, eigene erstellen',
      needsFlow: true
    },
    { id: 5, label: 'Fertiges Szenario', sub: 'Ausformulieren, drucken, exportieren', needsFlow: true }
  ];

  return (
    <div className="page-section">
      {/* Compact Header + Global Save / Print Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Szenario-Baukasten</h1>
          {hasFlow ? (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontFamily: 'var(--display)', fontSize: 14 }}>
              <strong>{thema ? `${fach ? `${fach}: ` : ''}${thema}` : arrangement.name}</strong>
              <span className="muted">·</span>
              <span>
                ⏱ {validation.dauerMin} min{arrangement.kontext?.zeitbudgetMin ? ` / ${arrangement.kontext.zeitbudgetMin} min` : ''}
              </span>
              <span className="muted">·</span>
              <span style={{ fontWeight: 700, color: validation.gueltig ? 'var(--dC)' : 'var(--err)' }}>
                {validation.gueltig ? '✓ Ablauf stimmig' : `✕ ${nErr} ${nErr === 1 ? 'Stelle' : 'Stellen'} zu prüfen`}
                {nWarn > 0 ? ` (${nWarn} Hinweise)` : ''}
              </span>
            </div>
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: 15 }}>
              In fünf Schritten von der Idee zum fertigen Unterrichtsszenario.
            </p>
          )}
        </div>

        <div className="no-print" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <button type="button" className="btn btn-sm" disabled={!hasFlow} onClick={() => handleSaveBrowser(false)}>
            💾 Speichern
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setShowSavedDrawer((s) => !s)}>
            📂 Gespeichert ({savedScenarios.length})
          </button>
          <details className="planner-more">
            <summary className="btn btn-sm">Mehr ▾</summary>
            <div className="planner-more-menu">
              <button type="button" className="btn btn-sm" disabled={!hasFlow} onClick={handlePrintPdf}>
                🖨 Als PDF drucken
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={!hasFlow}
                onClick={handlePrintOnePage}
                title="Kompakte Pultvorlage auf höchstens einer A4-Seite (Querformat)"
              >
                📄 Kurzablauf auf einer Seite
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={!hasFlow}
                onClick={handleDownloadProjectFile}
                title="Vollständiges Szenario als Datei sichern (.fmt.json, wieder importierbar)"
              >
                ⬇ Als Datei sichern
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => fileInputRef.current?.click()}
                title="Gesicherte .fmt.json, API/MCP-Plan-JSON, JSON-LD oder HTML-Handout laden"
              >
                ⬆ Datei laden
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setShowJsonImport((v) => !v)}
                title="Maschinenlesbares Szenario-JSON (z. B. aus MCP, API oder .fmt.json) direkt einfügen"
              >
                📋 JSON einfügen
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setLlmSettingsOpen(true)}>
                {userLlmActive ? `🔑 KI (${byok.model || byok.provider})` : '⚙ KI verbinden'}
              </button>
            </div>
          </details>
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

      {/* Five guided steps; steps that need a flow stay locked until one exists */}
      <nav className="card no-print planner-steps" aria-label="Planungsschritte">
        {steps.map((s) => {
          const active = step === s.id;
          const locked = s.needsFlow && !hasFlow;
          return (
            <button
              key={s.id}
              type="button"
              className={`planner-step ${active ? 'is-active' : ''}`}
              aria-current={active ? 'step' : undefined}
              disabled={locked}
              title={locked ? 'Erst in Schritt 1 einen Ablauf vorschlagen lassen' : undefined}
              onClick={() => setStep(s.id)}
            >
              <span className="planner-step-no" aria-hidden="true">
                {s.id}
              </span>
              <span>
                <span className="planner-step-label">
                  <span className="sr-only">Schritt {s.id}: </span>
                  {s.label}
                </span>
                <span className="planner-step-sub">{s.sub}</span>
              </span>
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
                title="KI-Einstellungen öffnen. Der Baukasten funktioniert auch ganz ohne KI."
              >
                {llmAvailable
                  ? `✨ KI aktiv (${userLlmActive ? byok.model || byok.provider : meta?.llmModel || 'Server'})`
                  : 'Arbeitet ohne KI · KI verbinden ⚙'}
              </button>
            </div>

            <p className="muted" style={{ fontSize: 14.5, marginTop: 0, marginBottom: 10, maxWidth: 760 }}>
              Beschreibe dein Vorhaben in ein bis zwei Sätzen. Fach, Thema, Klasse und Zeit reichen schon. Daraus schlägt
              dir der Baukasten einen Ablauf mit passenden Methoden vor.
            </p>

            <textarea
              aria-label="Unterrichtsvorhaben beschreiben"
              rows={3}
              style={{ width: '100%' }}
              value={scenarioText}
              onChange={(e) => handleScenarioTextChange(e.target.value)}
              placeholder="z. B. Mathematik Klasse 6, Brüche addieren, Doppelstunde mit 90 Minuten, 26 Lernende"
            />

            {verstanden && (
              <section aria-label="Verstanden und fehlt noch" className="planner-verstanden" style={{ marginTop: 8, fontSize: 14 }}>
                <p style={{ margin: 0 }}>
                  <strong>Verstanden:</strong> {verstanden.verstanden.length ? verstanden.verstanden.join(' · ') : 'noch nichts'}
                </p>
                {(verstanden.fehlt.length > 0 || verstanden.zielVermutet) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 12px', marginTop: 4 }}>
                    {verstanden.fehlt.length > 0 && (
                      <span>
                        <strong>Fehlt noch:</strong> {verstanden.fehlt.map((f) => f.label).join(', ')}
                      </span>
                    )}
                    {/* A guessed goal can be corrected like a missing one; nothing is preselected (W13). */}
                    {verstanden.zielVermutet && !verstanden.fehlt.some((f) => f.feld === 'ziel') && (
                      <select aria-label="Ziel ergänzen" style={{ fontSize: 13.5, padding: '2px 6px' }} value={zielErg} onChange={(e) => setZielErg(e.target.value)}>
                        <option value="">Ziel …</option>
                        {valuesOf('zielart').map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.label}
                          </option>
                        ))}
                      </select>
                    )}
                    {verstanden.fehlt.map((f) => {
                      const feldStil = { fontSize: 13.5, padding: '2px 6px' };
                      if (f.feld === 'ziel')
                        return (
                          <select key={f.feld} aria-label="Ziel ergänzen" style={feldStil} value={zielErg} onChange={(e) => setZielErg(e.target.value)}>
                            <option value="">Ziel …</option>
                            {valuesOf('zielart').map((w) => (
                              <option key={w.id} value={w.id}>
                                {w.label}
                              </option>
                            ))}
                          </select>
                        );
                      if (f.feld === 'fach-und-thema')
                        return (
                          <span key={f.feld} style={{ display: 'inline-flex', gap: 6 }}>
                            {f.teil !== 'thema' && (
                              <input
                                type="text"
                                aria-label="Fach ergänzen"
                                placeholder="Fach"
                                style={{ ...feldStil, width: 130 }}
                                value={fach}
                                onChange={(e) => {
                                  setPresetContextSource(null);
                                  setFach(e.target.value);
                                }}
                              />
                            )}
                            {f.teil !== 'fach' && (
                              <input
                                type="text"
                                aria-label="Thema ergänzen"
                                placeholder="Thema"
                                style={{ ...feldStil, width: 150 }}
                                value={themaErg}
                                onChange={(e) => {
                                  setThemaErg(e.target.value);
                                  setThema(e.target.value.trim());
                                }}
                              />
                            )}
                          </span>
                        );
                      if (f.feld === 'bildungsstufe')
                        return (
                          <select key={f.feld} aria-label="Bildungsstufe ergänzen" style={feldStil} value={stufeErg} onChange={(e) => setStufeErg(e.target.value)}>
                            <option value="">Bildungsstufe …</option>
                            {valuesOf('bildungsstufe').map((w) => (
                              <option key={w.id} value={w.id}>
                                {w.label}
                              </option>
                            ))}
                          </select>
                        );
                      if (f.feld === 'anzahl')
                        return (
                          <input
                            key={f.feld}
                            type="number"
                            min={1}
                            aria-label="Anzahl der Lernenden ergänzen"
                            placeholder="Lernende"
                            style={{ ...feldStil, width: 100 }}
                            value={gruppeSize}
                            onChange={(e) => setGruppeSize(e.target.value)}
                          />
                        );
                      if (f.feld === 'raum')
                        return (
                          <select
                            key={f.feld}
                            aria-label="Raum ergänzen"
                            style={feldStil}
                            value={raum}
                            onChange={(e) => {
                              setPresetContextSource(null);
                              setRaum(e.target.value);
                              setRaumBietet(null);
                            }}
                          >
                            <option value="">Raum …</option>
                            {valuesOf('raumtyp').map((w) => (
                              <option key={w.id} value={w.id}>
                                {w.label}
                              </option>
                            ))}
                          </select>
                        );
                      return (
                        <input
                          key={f.feld}
                          type="number"
                          min={1}
                          aria-label="Zeit in Minuten ergänzen"
                          placeholder="Minuten"
                          style={{ ...feldStil, width: 100 }}
                          value={zeitErg}
                          onChange={(e) => setZeitErg(e.target.value)}
                        />
                      );
                    })}
                  </div>
                )}
                {verstanden.fehlt.length > 0 && (
                  <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 0' }}>
                    Der Ablauf entsteht auch mit Lücken. Was du ergänzt, gilt beim nächsten Vorschlag.
                  </p>
                )}
              </section>
            )}

            <div className="planner-raum" style={{ marginTop: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--display)', maxWidth: 360 }}>
                Raum
                <select
                  aria-label="Raum"
                  style={{ width: '100%' }}
                  value={raum}
                  onChange={(e) => {
                    setPresetContextSource(null);
                    setRaum(e.target.value);
                    setRaumBietet(null);
                  }}
                >
                  <option value="">nicht angegeben</option>
                  {valuesOf('raumtyp').map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </label>
              {raum ? (
                <fieldset style={{ border: 0, padding: 0, margin: '8px 0 0' }}>
                  <legend className="muted" style={{ fontSize: 13, padding: 0, marginBottom: 4 }}>
                    Was der Raum bietet (nimm weg, was fehlt):
                  </legend>
                  <div style={{ display: 'flex', gap: '6px 18px', flexWrap: 'wrap', fontSize: 14 }}>
                    {Object.keys(RAUM_EIGENSCHAFT_KLARTEXT).map((code) => {
                      const offered = valuesOf('raumtyp').find((w) => w.id === raum)?.bietet || [];
                      const checked = (raumBietet ?? offered).includes(code);
                      return (
                        <label key={code} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setPresetContextSource(null);
                              setRaumBietet(toggleRaumEigenschaft(raumBietet, offered, code, e.target.checked));
                            }}
                          />
                          {raumEigenschaftLabel(code, labelOf)}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ) : (
                <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
                  Steht der Raum nicht im Text, nimmt der Baukasten einen Raum an (meist den Klassenraum, im Fach Sport die Sporthalle) und sagt es dir.
                </p>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
              {llmAvailable ? (
                <>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busyAi || !canPropose}
                    onClick={() => void runAiTranslate()}
                  >
                    {busyAi ? 'Vorschlag wird erstellt…' : '✨ Ablauf vorschlagen'}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={!canPropose}
                    onClick={runDeterministicMatch}
                    title="Nutzt nur die festen Regeln der Methodendatenbank, ohne KI"
                  >
                    Ohne KI vorschlagen
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-primary" disabled={!canPropose} onClick={runDeterministicMatch}>
                  Ablauf vorschlagen →
                </button>
              )}
              {matchResult?.modus === 'ablauf' && matchResult.arrangement && (
                <button
                  type="button"
                  className="btn"
                  onClick={runOtherProposal}
                  title="Liefert für denselben Text einen anderen, gleichwertig passenden Ablauf"
                >
                  🔀 Anderer Vorschlag
                </button>
              )}
              <button type="button" className="btn btn-sm" onClick={toggleDictation}>
                {listening ? '🔴 Aufnahme läuft…' : '🎤 Diktieren'}
              </button>
              {hasFlow && (
                <button type="button" className="btn btn-sm btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => setStep(2)}>
                  Weiter zum Methodischen Konzept →
                </button>
              )}
            </div>
            {!canPropose && !hasFlow && (
              <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>
                Schreib zuerst kurz, was du vorhast, oder starte unten mit einem Beispiel.
              </p>
            )}

            {matchNotice && (
              <p style={{ marginTop: 10, marginBottom: 0, fontFamily: 'var(--display)', fontWeight: 600, color: 'var(--dA)' }}>
                {matchNotice}
              </p>
            )}

            {matchResult && matchResult.modus === 'phase' && matchResult.vorschlaege.length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--grid)' }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
                  Passende Methoden für diese Phase (Klick übernimmt sie in den Ablauf):
                </div>
                {annahmenListe.length > 0 && (
                  <p className="muted" style={{ fontSize: 13, margin: '0 0 6px' }}>
                    Angenommen: {annahmenListe.join(' ')}
                  </p>
                )}
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

            {/* Didactic approach: optional, nothing preselected */}
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--grid)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                <span style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 13.5 }}>
                  Didaktischer Ansatz (freiwillig)
                </span>
                <button type="button" className="diff-preset-link" onClick={() => setShowAllApproaches((s) => !s)}>
                  {showAllApproaches
                    ? 'Weniger Ansätze anzeigen ▲'
                    : `+ ${DIDACTIC_APPROACH_OPTIONS.filter((o) => !o.featured).length} weitere Ansätze anzeigen ▾`}
                </button>
              </div>
              <p className="muted" style={{ fontSize: 13, margin: '0 0 8px' }}>
                {ansatzCodes.length === 0 && !customAnsatzText.trim()
                  ? 'Nichts ausgewählt: Der Baukasten wählt die Methoden allein nach deiner Beschreibung. Klicke einen Ansatz an, wenn du eine Richtung vorgeben möchtest.'
                  : 'Deine Auswahl lenkt die Methodenwahl in diese Richtung. Ein weiterer Klick nimmt sie wieder heraus.'}
              </p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Didaktische Ansätze auswählen">
                {DIDACTIC_APPROACH_OPTIONS.filter((opt) => showAllApproaches || opt.featured || ansatzCodes.includes(opt.id)).map((opt) => {
                  const active = ansatzCodes.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={active}
                      className={`diff-chip-toggle ${active ? 'is-active' : ''}`}
                      onClick={() => toggleAnsatzCode(opt.id)}
                    >
                      <span>{active ? '✓' : '+'}</span>
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {showAllApproaches && (
                <input
                  type="text"
                  aria-label="Optional eigener didaktischer Ansatz"
                  style={{ width: '100%', marginTop: 8, fontSize: 13.5 }}
                  value={customAnsatzText}
                  onChange={(e) => {
                    setPresetContextSource(null);
                    setCustomAnsatzText(e.target.value);
                  }}
                  placeholder="Eigener Ansatz (z. B. Service Learning, Flipped Classroom, Montessori)"
                />
              )}
            </div>

            {/* Examples */}
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--grid)' }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>
                Oder mit einem Beispiel starten
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
                        templateFlowRef.current = null;
                        setMatchResult(null);
                        clearErgaenzungen();
                        setMatchNotice(null);
                        resetFlowDerived();
                        setStep(2);
                      }}
                    >
                      Musterablauf: {ex.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Optional Expandable Structured Inputs */}
          <details className="card" style={{ padding: 18 }}>
            <summary style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 16, cursor: 'pointer', color: 'var(--dA)' }}>
              Mehr Angaben (freiwillig): Fach, Lernziele, Klassengröße, Technik, Lesen und Schreiben, Termine
            </summary>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 14 }}>
              {/* Group A: Didaktische Grundlagen */}
              <div>
                <strong style={{ fontFamily: 'var(--display)', fontSize: 14.5 }}>1. Didaktischer Rahmen &amp; Ziele</strong>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))',
                    gap: '10px 14px',
                    marginTop: 8,
                    alignItems: 'end'
                  }}
                >
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--display)' }}>
                    Fach
                    <input
                      type="text"
                      style={{ width: '100%' }}
                      value={fach}
                      onChange={(e) => {
                        setPresetContextSource(null);
                        setFach(e.target.value);
                      }}
                      placeholder="z. B. Mathematik, Physik, Deutsch"
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--display)' }}>
                    Thema
                    <input
                      type="text"
                      style={{ width: '100%' }}
                      value={thema}
                      onChange={(e) => {
                        setPresetContextSource(null);
                        setThema(e.target.value);
                      }}
                      placeholder="z. B. Bruchrechnen, Dichte"
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--display)' }}>
                    Bildungsstufe
                    <select
                      style={{ width: '100%' }}
                      value={arrangement.kontext?.bildungsstufe || ''}
                      onChange={(e) => {
                        setPresetContextSource(null);
                        setArrangement({ ...arrangement, kontext: mitKontext(arrangement.kontext, 'bildungsstufe', e.target.value || undefined) });
                      }}
                    >
                      <option value="">nicht angegeben</option>
                      {valuesOf('bildungsstufe').map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--display)' }}>
                    Vorwissen
                    <select
                      style={{ width: '100%' }}
                      value={arrangement.kontext?.vorwissen || ''}
                      onChange={(e) => {
                        setPresetContextSource(null);
                        setArrangement({ ...arrangement, kontext: mitKontext(arrangement.kontext, 'vorwissen', e.target.value || undefined) });
                      }}
                    >
                      <option value="">nicht angegeben</option>
                      {valuesOf('vorwissen').map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--display)' }}>
                    Zeitbudget (Min.)
                    <input
                      type="number"
                      style={{ width: '100%' }}
                      min={0}
                      placeholder="nicht angegeben"
                      value={arrangement.kontext?.zeitbudgetMin ?? ''}
                      onChange={(e) => {
                        setPresetContextSource(null);
                        const min = Math.max(0, Number(e.target.value) || 0);
                        setArrangement({ ...arrangement, kontext: mitKontext(arrangement.kontext, 'zeitbudgetMin', min > 0 ? min : undefined) });
                      }}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--display)' }}>
                    Funktionskette / Zieltyp
                    <select
                      style={{ width: '100%' }}
                      value={arrangement.zieltyp || ''}
                      onChange={(e) => {
                        setPresetContextSource(null);
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
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--display)' }}>
                    Granularität / Rahmen
                    <select
                      style={{ width: '100%' }}
                      value={arrangement.reichweite}
                      onChange={(e) => {
                        setPresetContextSource(null);
                        setArrangement({ ...arrangement, reichweite: e.target.value });
                      }}
                    >
                      <option value="r2">Szenario / Einzelstunde (R2)</option>
                      <option value="r3">Reihe / Ensemble (R3)</option>
                      <option value="r4">Modul / Kurs (R4)</option>
                    </select>
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginTop: 12 }}>
                  <label style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    Lernziele (optional)
                    <textarea
                      rows={2}
                      style={{ width: '100%' }}
                      value={lernziele}
                      onChange={(e) => {
                        setPresetContextSource(null);
                        setLernziele(e.target.value);
                      }}
                      placeholder="Was sollen die Lernenden am Ende können?"
                    />
                  </label>
                  <label style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    Ausgangslage / typische Hürden (optional)
                    <textarea
                      rows={2}
                      style={{ width: '100%' }}
                      value={problemstellung}
                      onChange={(e) => {
                        setPresetContextSource(null);
                        setProblemstellung(e.target.value);
                      }}
                      placeholder="z. B. Fehlvorstellungen, geringe Motivation, heterogene Vorkenntnisse"
                    />
                  </label>
                </div>
              </div>

              {/* Group B: Akteure & Personenanzahl */}
              <div style={{ paddingTop: 14, borderTop: '1px solid var(--grid)' }}>
                <strong style={{ fontFamily: 'var(--display)', fontSize: 14.5 }}>
                  2. Lerngruppe &amp; Begleitung
                </strong>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                    gap: '10px 14px',
                    marginTop: 8,
                    alignItems: 'end',
                    maxWidth: 640
                  }}
                >
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--display)' }}>
                    Klassengröße (optional, Personen)
                    <input
                      type="number"
                      style={{ width: '100%' }}
                      min={1}
                      max={300}
                      value={gruppeSize}
                      placeholder="aus Text oder offen (z. B. 26)"
                      onChange={(e) => {
                        setPresetContextSource(null);
                        setGruppeSize(e.target.value);
                        const num = Number(e.target.value);
                        if (groups.length === 1 && groups[0].id === 'regel') {
                          setGroups([{ ...groups[0], count: num > 0 ? num : undefined }]);
                        }
                      }}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--display)' }}>
                    Lehrkraft / Begleitung
                    <input
                      type="text"
                      style={{ width: '100%' }}
                      value={lehrkraefteInfo}
                      onChange={(e) => setLehrkraefteInfo(e.target.value)}
                      placeholder="z. B. 1 Lehrkraft, Co-Teaching + Sonderpädagogik"
                    />
                  </label>
                </div>
                <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>
                  Bleibt die Klassengröße leer, übernimmt der Baukasten Zahlen aus deinem Text (z. B. „6 Kinder“ oder „120 Studierende“). Teilgruppen für die Binnendifferenzierung legst du erst in <strong>Schritt 3</strong> an.
                </p>
              </div>

              {/* Group C: Technik & Raum */}
              <div style={{ paddingTop: 14, borderTop: '1px solid var(--grid)' }}>
                <strong style={{ fontFamily: 'var(--display)', fontSize: 14.5 }}>
                  3. Rahmenbedingungen (Technik, Lesen und Schreiben, Termine – filtert Methoden direkt)
                </strong>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                    gap: '10px 14px',
                    marginTop: 8,
                    maxWidth: 640
                  }}
                >
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--display)' }}>
                    Verfügbare Technik (max.)
                    <select
                      style={{ width: '100%' }}
                      value={maxTechnik}
                      onChange={(e) => {
                        setPresetContextSource(null);
                        setMaxTechnik(e.target.value);
                      }}
                    >
                      <option value="">beliebig</option>
                      {valuesOf('technikbedarf').map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--display)' }}>
                    Termine
                    <input
                      aria-label="Termine"
                      type="number"
                      style={{ width: '100%' }}
                      min={1}
                      max={60}
                      value={termine}
                      placeholder="Anzahl der Termine, z. B. 3"
                      onChange={(e) => {
                        setPresetContextSource(null);
                        setTermine(e.target.value);
                      }}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--display)' }}>
                    Raum-Zeit-Modus
                    <select
                      style={{ width: '100%' }}
                      value={raumzeitFilter}
                      onChange={(e) => {
                        setPresetContextSource(null);
                        setRaumzeitFilter(e.target.value);
                      }}
                    >
                      <option value="">beliebig</option>
                      {valuesOf('raumzeit').map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', marginTop: 12, fontSize: 14 }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={ohneInternet}
                      onChange={(e) => {
                        setPresetContextSource(null);
                        setOhneInternet(e.target.checked);
                      }}
                    />
                    Ohne Internet / Offline
                  </label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={ohneKI}
                      onChange={(e) => {
                        setPresetContextSource(null);
                        setOhneKI(e.target.checked);
                      }}
                    />
                    Ohne KI-Methoden im Unterricht
                  </label>
                  {SCHRIFT_ORDER.map((was) => (
                    <label key={was} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={ohneSchrift.includes(was)}
                        onChange={(e) => {
                          setPresetContextSource(null);
                          setOhneSchrift((prev) => (e.target.checked ? [...prev.filter((x) => x !== was), was] : prev.filter((x) => x !== was)));
                        }}
                      />
                      Die Lernenden können noch nicht {was}
                    </label>
                  ))}
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
          <p className="planner-step-intro">
            {hasFlow ? (
              <>
                <strong>So läuft dein Unterricht für die ganze Klasse ab.</strong> Prüfe die Phasen und Methoden und passe sie
                bei Bedarf an. Teilgruppen kommen erst im nächsten Schritt dazu.
              </>
            ) : (
              <>
                <strong>Noch kein Ablauf.</strong> Lass dir in Schritt 1 einen vorschlagen oder stelle unten selbst Methoden
                zusammen.
              </>
            )}
          </p>
          <div className="card no-print" style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`btn btn-sm ${viewMode === 'verlaufsplan' && hasFlow ? 'btn-primary' : ''}`}
                disabled={!hasFlow}
                onClick={() => setViewMode('verlaufsplan')}
              >
                📋 Übersicht
              </button>
              <button
                type="button"
                className={`btn btn-sm ${viewMode === 'partitur' || !hasFlow ? 'btn-primary' : ''}`}
                onClick={() => setViewMode('partitur')}
              >
                🧩 Methoden tauschen und umstellen
              </button>
              {otherProposalSafe && (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={runOtherProposal}
                  title="Liefert für dieselben Angaben einen anderen, gleichwertig passenden Ablauf"
                >
                  🔀 Anderer Vorschlag
                </button>
              )}
              {hasFlow && (
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowLiveBand((s) => !s)}>
                  {showLiveBand ? '▲ Zeitband ausblenden' : '▼ Zeitband einblenden'}
                </button>
              )}
              {hasFlow && showLiveBand && (
                <button type="button" className="btn btn-sm btn-ghost" onClick={exportSvg}>
                  ⬇ SVG
                </button>
              )}
            </div>

            {hasFlow && (
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
                  {validation.gueltig ? '✓ Ablauf stimmig' : `✕ ${nErr} zu prüfen`}
                  {nWarn > 0 ? ` · ${nWarn} Hinweise` : ''} {showValidationDetails ? '▲' : '▼'}
                </button>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => setStep(3)}>
                  Weiter zur Binnendifferenzierung →
                </button>
              </div>
            )}
          </div>

          {matchNotice && (
            <p className="planner-notice" role="status">
              {matchNotice}
            </p>
          )}
          {verstanden && (
            <section aria-label="Verstanden" className="planner-notice" style={{ marginTop: 10 }}>
              <p style={{ margin: 0 }}>
                Verstanden: {verstanden.verstanden.length ? verstanden.verstanden.join(' · ') : 'noch nichts'}
              </p>
              {verstanden.fehlt.length > 0 && (
                <p style={{ margin: '2px 0 0' }}>
                  Fehlt noch: {verstanden.fehlt.map((f) => f.label).join(', ')}.{' '}
                  <button type="button" className="diff-preset-link" onClick={() => setStep(1)}>
                    In Schritt 1 ergänzen
                  </button>
                </p>
              )}
            </section>
          )}
          {annahmenListe.length > 0 && (
            <section aria-label="Angenommen" className="card planner-annahmen" style={{ padding: '10px 14px', marginTop: 10, borderLeft: '4px solid var(--dB)' }}>
              <strong style={{ fontFamily: 'var(--display)', fontSize: 14.5 }}>Angenommen, weil die Angabe fehlte</strong>
              <ul style={{ margin: '4px 0 6px', paddingLeft: 20, fontSize: 14 }}>
                {annahmenListe.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              <button type="button" className="diff-preset-link" onClick={() => setStep(1)}>
                ← Angaben in Schritt 1 ändern
              </button>
            </section>
          )}
          {(ablaufHinweise.length > 0 || ablaufRegelmeldungen.length > 0) && (
            <section aria-label="Hinweise zum Ablauf" className="card planner-ablauf-hinweise" style={{ padding: '10px 14px', marginTop: 10, borderLeft: '4px solid var(--grid)' }}>
              <strong style={{ fontFamily: 'var(--display)', fontSize: 14.5 }}>Hinweise zum Ablauf</strong>
              <ul style={{ margin: '4px 0 6px', paddingLeft: 20, fontSize: 14 }}>
                {ablaufRegelmeldungen.map((m, i) => (
                  <li key={`r${i}`}>
                    {m.text}
                    <div className="muted" style={{ fontSize: 12 }}>
                      {regelZeile(m, bundle?.regeln)}
                    </div>
                  </li>
                ))}
                {ablaufHinweise.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </section>
          )}
          {offeneSchritte.length > 0 && (
            <section aria-label="Offene Schritte" className="card" style={{ padding: '10px 14px', marginTop: 10, borderLeft: '4px solid var(--err)' }}>
              <strong style={{ fontFamily: 'var(--display)', fontSize: 14.5 }}>
                {offeneSchritte.length === 1 ? 'Ein Schritt bleibt offen' : `${offeneSchritte.length} Schritte bleiben offen`}
              </strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: 20, fontSize: 14 }}>
                {offeneSchritte.map((o) => (
                  <li key={o.schritt}>
                    <strong>{o.label}:</strong> {o.grund}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {subgroups.length > 0 && hasFlow && (
            <p className="planner-notice" role="status">
              Teilgruppen ({subgroups.map((g) => g.label).join(', ')}) sind vorgemerkt. Hier siehst du den Ablauf für die
              Regelgruppe, die Anpassungen für die Teilgruppen folgen in Schritt 3.
            </p>
          )}

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

          {hasFlow && showLiveBand && (
            <div className="card" style={{ padding: 14, marginTop: 10 }}>
              <TimelineBandSvg
                arrangement={arrangement}
                blocksById={blocksById}
                svgRef={svgRef}
                groups={step2Groups}
                subgroupMethods={{}}
                ketten={bundle.ketten}
              />
            </div>
          )}

          {viewMode === 'verlaufsplan' && hasFlow ? (
            <VerlaufsplanView
              rows={scenarioRows}
              groups={step2Groups}
              lehrkraefteInfo={lehrkraefteInfo}
              allBlocks={bundle.bausteine}
              regelmeldungen={regelmeldungen}
              regeln={bundle.regeln}
              subgroupMethods={{}}
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
          <p className="planner-step-intro">
            <strong>Braucht ein Teil deiner Lerngruppe etwas anderes?</strong> Wähle die Teilgruppen aus, lass das Vorgehen
            daran anpassen und sieh dir den aktualisierten Ablauf an. Wenn alle gleich arbeiten, geh einfach weiter.
          </p>
          {gesperrtHinweis && bundle.teilgruppen.gesperrtText && (
            <p className="planner-notice" role="status">
              {bundle.teilgruppen.gesperrtText}
            </p>
          )}
          <ScenarioStudioPanel
            mode="diff"
            diffMiddleSlot={
              subgroups.length > 0 ? (
                <>
                  <section className="planner-stage" aria-labelledby="planner-stage-adjust">
                    <strong id="planner-stage-adjust" className="planner-stage-title">
                      ② Methodisches Vorgehen anpassen
                    </strong>
                    <p className="muted" style={{ fontSize: 14, margin: '4px 0 10px', maxWidth: 760 }}>
                      Der Baukasten prüft jede Phase für jede Teilgruppe: Passt die Methode so, reicht eine Hilfe in derselben
                      Methode, oder braucht die Gruppe eine andere Methode, die parallel zur Klasse läuft? Eine Hilfe geht vor
                      einem Tausch. Du entscheidest, was du übernimmst. Fehlt dem Ablauf etwas, das deine Teilgruppen brauchen,
                      schlägt der Baukasten eine kurze zusätzliche Phase für alle vor.
                    </p>
                    <TeilgruppenEntscheidung
                      subgroups={subgroups}
                      onGroupChange={updateGroup}
                      pruefung={adjustmentStale ? null : pruefung}
                      rows={scenarioRows}
                      subgroupMethods={subgroupMethods}
                      generatedMaterials={generatedMaterials}
                      regeln={bundle.regeln}
                      onTauschUebernehmen={takeOverAdjustment}
                      onTauschZuruecknehmen={(a) => undoAdjustments([a])}
                      onHilfeUebernehmen={takeOverSupport}
                      onHilfeZuruecknehmen={undoSupport}
                    />
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
                      <button type="button" className="btn btn-primary" onClick={runMethodAdjustment}>
                        {adjustedFor === null ? 'Vorgehen an die Teilgruppen anpassen' : '↻ Erneut prüfen'}
                      </button>
                      {adjustmentsNow.length > 0 && (
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => {
                            undoAdjustments(adjustmentsNow);
                            setAllesZurueck(true);
                          }}
                        >
                          Alle Anpassungen zurücknehmen
                        </button>
                      )}
                    </div>
                    <div role="status" aria-live="polite">
                      {adjustmentStale && (
                        <p className="planner-notice" style={{ marginTop: 10 }}>
                          Teilgruppen, Ablauf oder Rahmen haben sich geändert. Klicke auf „Erneut prüfen“, damit das Vorgehen
                          dazu passt.
                        </p>
                      )}
                      {adjustedFor !== null && !adjustmentStale && adjustmentsNow.length === 0 && (allesZurueck || autoAdjustments.length === 0) && (
                        <p className="planner-notice" style={{ marginTop: 10 }}>
                          {allesZurueck
                            ? 'Alle Anpassungen sind zurückgenommen. Es gilt wieder eine Methode je Phase für alle.'
                            : 'Geprüft: Für die geprüften Teilgruppen muss keine Methode getauscht werden. Die Karten oben zeigen, wo eine Hilfe in der Methode reicht.'}
                        </p>
                      )}
                      {adjustedFor !== null && uncheckedSubgroups.length > 0 && (
                        <p className="planner-notice" style={{ marginTop: 10 }}>
                          Nicht geprüft: {uncheckedSubgroups.map((g) => g.label).join(', ')}. Für diese Teilgruppe fehlt ein
                          Profil. Wähle es unter „Mehr Details“ bei der Feinjustierung aus oder kreuze oben an, was sie noch
                          nicht kann.
                        </p>
                      )}
                      {!adjustmentStale && extraProposals.length > 0 && (
                        <>
                          <p style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14, margin: '12px 0 6px' }}>
                            {extraProposals.length === 1
                              ? 'Vorschlag: 1 zusätzliche Phase für alle'
                              : `Vorschlag: ${extraProposals.length} zusätzliche Phasen für alle`}
                          </p>
                          <ul className="planner-adjust-list">
                            {extraProposals.map((p) => (
                              <li key={p.kennung}>
                                <div>
                                  <span className="muted">
                                    {p.position === 'anfang' ? 'Am Anfang' : 'Am Ende'} · {p.dauerMin} Minuten
                                  </span>
                                  <div>
                                    <strong>{p.name}</strong> mit der ganzen Klasse
                                  </div>
                                  <div className="muted" style={{ fontSize: 13 }}>
                                    Warum: {p.grund}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  aria-label={`${p.name} ${p.position === 'anfang' ? 'am Anfang' : 'am Ende'} hinzufügen`}
                                  onClick={() => addProposedPhase(p)}
                                >
                                  Hinzufügen
                                </button>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                      {addedPhasesNow.length > 0 && (
                        <>
                          <p style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14, margin: '12px 0 6px' }}>
                            {addedPhasesNow.length === 1 ? '1 Phase hinzugefügt:' : `${addedPhasesNow.length} Phasen hinzugefügt:`}
                          </p>
                          <ul className="planner-adjust-list">
                            {addedPhasesNow.map((a) => {
                              const given = a.donors.reduce((sum, d) => sum + d.minutes, 0);
                              const from = a.donors.map((d) => `„${blocksById.get(d.kennung)?.name || d.kennung}“`).join(' und ');
                              return (
                                <li key={a.kennung}>
                                  <div>
                                    <div>
                                      <strong>{a.name}</strong> für alle, {a.art === 'vorwissen' ? 'am Anfang' : 'am Ende'}
                                    </div>
                                    <div className="muted" style={{ fontSize: 13 }}>
                                      {given >= a.dauerMin
                                        ? `Die ${a.dauerMin} Minuten kommen aus ${a.donors.length === 1 ? 'der Phase' : 'den Phasen'} ${from}. Die Gesamtzeit bleibt gleich.`
                                        : given > 0
                                          ? `${given} Minuten kommen aus ${from}. Der Ablauf ist dadurch ${a.dauerMin - given} Minuten länger.`
                                          : `Keine Phase kann Zeit abgeben. Der Ablauf ist dadurch ${a.dauerMin} Minuten länger.`}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    className="btn btn-sm"
                                    aria-label={`${a.name} wieder entfernen`}
                                    onClick={() => removeAddedPhase(a)}
                                  >
                                    Wieder entfernen
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </>
                      )}
                    </div>
                  </section>

                  <section className="planner-stage" aria-labelledby="planner-stage-updated">
                    <strong id="planner-stage-updated" className="planner-stage-title">
                      ③ Dein aktualisierter Ablauf
                    </strong>
                    <div style={{ marginTop: 8 }}>
                      <TimelineBandSvg
                        arrangement={arrangement}
                        blocksById={blocksById}
                        svgRef={svgRef}
                        groups={groups}
                        subgroupMethods={subgroupMethods}
                        ketten={bundle.ketten}
                        selectedStepKey={focusedStepKey || scenarioRows[0]?.key || null}
                        onSelectStep={(k) => setFocusedStepKey(k)}
                      />
                    </div>
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
                      heading="Ablauf mit allen Teilgruppen"
                      lead="Je Teilgruppe eine Spalte: Hinweise zur Anpassung und, wo eingetragen, eine eigene Methode. Mit dem Stift an einer Phase änderst du Hinweise oder wählst selbst eine andere Methode."
                      editLabel="✏ Hinweise und Methoden bearbeiten"
                    />
                  </section>
                </>
              ) : undefined
            }
            activeResourceTab={resourceTab}
            onResourceTabChange={setResourceTab}
            totalClassSize={classSize}
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
            fachbereich={planFachbereich}
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
                Für welche Phase suchst du Material? Klicke sie im Zeitband an.
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
            fachbereich={planFachbereich}
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
              Weiter zum fertigen Szenario →
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
            fachbereich={planFachbereich}
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
              ← Zurück zu Material
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
