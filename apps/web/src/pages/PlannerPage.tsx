import { useEffect, useMemo, useRef, useState } from 'react';
import {
  detectLearnerGroupsFromText,
  detectMatrixTraitsFromText,
  FMT_GUARDRAILS,
  hasAdjustmentProfile,
  migrateKennungen,
  passungNeuPruefen,
  proposeAdditionalPhases,
  regelLageAus,
  type AdditionalPhaseProposal,
  type Arrangement,
  type Begleitstrang,
  type MethodAdjustment,
  type MatchRequest,
  type MatchResult,
  type PhasenAntwort,
  waehlePlanungsprofil
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
  createEmptyArrangement,
  findNextVariant,
  exportArrangementHtmlHandout,
  exportArrangementOnePageSheet
} from '../planner/arrangementOps.js';
import { explainValidationMessage } from '../planner/validationHelpers.js';
import { addExtraPhase, removeExtraPhase, shiftAdjustmentKeys, shiftStepKeys, type AddedPhase } from '../planner/extraPhases.js';
import { begleitstrangAlsMaterial, begleitstrangAlsPhase, begleitstrangMaterialId, begleitzielHinweise } from '../planner/begleitziele.js';
import {
  activeSubgroups,
  adjustmentGroups,
  adjustmentPhases,
  adjustmentSignature,
  adjustmentsInForce,
  applyAdjustments,
  hilfeAlsMaterial,
  mainGroupOnly,
  nachErneuterPruefung,
  outdatedAdjustments,
  pruefeTeilgruppen,
  teilgruppenRahmen,
  verschiebePruefung,
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
  type ThematicPhaseRow,
  type EntwurfMeta,
  entwurfBegriffe,
  lehrendeInfo
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
  entwurfAngabenAus,
  type EntwurfAngaben,
  type GewaehltesFeld,
  type SavedScenario
} from '../planner/scenarioStorage.js';
import { RAUM_EIGENSCHAFT_KLARTEXT, raumEigenschaftLabel, SCHRIFT_ORDER, toggleRaumEigenschaft } from '../planner/rahmen.js';
import { mehrAngabenAusKontext, mehrAngabenInAnfrage, mehrAngabenLesen, ohneText, type CodeFeld, type MehrAngaben } from '../planner/mehrAngaben.js';
import { BEISPIEL_ANFRAGEN, type BeispielAnfrage } from '../planner/beispiele.js';
import { ausschlussZeilen, genannteHilfenNamen } from '../planner/ausschluesse.js';
import { evidenzBezugBeiGrad } from '../planner/evidenz.js';
import { situationsAnfrage, type KandidatenRahmen } from '../planner/kandidaten.js';

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

/** Value of the chain select that only takes the chain off the current flow. */
const FREIER_ABLAUF = '__frei';

/** A proposal of the core asked for by an example (Beispiel) or by the chain select (Funktionskette). */
interface MatchAuftrag {
  nr: number;
  art: 'beispiel' | 'kette';
  label: string;
}

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
  // A proposal asked for by an example or the chain select: it runs once the fields of step 1 are set (next render).
  const [matchAuftrag, setMatchAuftrag] = useState<MatchAuftrag | null>(null);
  const runMatchRef = useRef<((a: MatchAuftrag) => void) | null>(null);
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
  // Accompanying goals (D3): nothing preselected; they only order equivalent methods and add a proposed strand.
  const [begleitziele, setBegleitziele] = useState<string[]>([]);
  // Optional details of "Mehr Angaben" (request fields of the core); empty means not given. The planning profile is
  // the same state in step 1 and step 5.
  const [mehr, setMehr] = useState<MehrAngaben>({});
  // Values of a request field as the core lists them (matcher.felder()), for the selects of "Mehr Angaben".
  const feldWerte = useMemo(() => new Map((matcher?.felder() || []).map((f) => [f.feld, f.werte || []])), [matcher]);
  const werteVon = (feld: string) => feldWerte.get(feld) || [];
  /** Sets one detail of "Mehr Angaben"; an empty value removes it, so that it is not sent. */
  const setMehrFeld = <K extends keyof MehrAngaben>(key: K, wert: MehrAngaben[K] | undefined) => {
    setPresetContextSource(null);
    setMehr((prev) => {
      const next = { ...prev };
      if (wert === undefined || wert === '' || (typeof wert === 'number' && !(wert > 0))) delete next[key];
      else next[key] = wert;
      return next;
    });
  };
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
  /** One line after a new check that took back (or brought up to date) something the teacher had taken over. */
  const [pruefStatus, setPruefStatus] = useState<string | null>(null);
  // A loaded scenario named a blocked trait (Lerntypen): step 3 shows the note once ('offen' → 'gezeigt' → gone).
  const [gesperrtHinweis, setGesperrtHinweis] = useState<'offen' | 'gezeigt' | null>(null);
  // Step 3: short phases for the whole class, proposed by the last check and taken over by the teacher.
  const [extraProposals, setExtraProposals] = useState<AdditionalPhaseProposal[]>([]);
  const [addedPhases, setAddedPhases] = useState<AddedPhase[]>([]);
  // Accompanying strands the teacher took into the flow in step 2 (D3).
  const [begleitPhasen, setBegleitPhasen] = useState<AddedPhase[]>([]);
  // The draft's parts of the matcher answer, as saved with a loaded scenario (loading does not match again).
  const [geladeneAngaben, setGeladeneAngaben] = useState<EntwurfAngaben | null>(null);
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
  // Core answer for the current request, kept while the request is unchanged (draft parts after a cleared choice).
  const aktuelleAntwortRef = useRef<{ key: string; angaben: EntwurfAngaben } | null>(null);
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
      groups,
      ...(matchResult?.kriterien ? { anfrage: matchResult.kriterien as MatchRequest } : {})
    });
  }, [arrangement, fach, thema, scenarioText, maxTechnik, ohneInternet, ohneKI, groups, matchResult]);

  useEffect(() => {
    if (matchAuftrag) runMatchRef.current?.(matchAuftrag);
  }, [matchAuftrag]);

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
      setMehr({});
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
    setPruefStatus(null);
    setExtraProposals([]);
    setAddedPhases([]);
    setBegleitPhasen([]);
    setGeladeneAngaben(null);
  };

  const subgroups = activeSubgroups(groups);
  // The request of step 1 as the matcher read it (room, time …): a parallel method must cover its needs in that frame.
  const checkConstraints = teilgruppenRahmen(
    {
      maxTechnik: maxTechnik || undefined,
      ohneInternet,
      ohneKI,
      bildungsstufe: arrangement.kontext?.bildungsstufe || undefined,
      fachbereich: planFachbereich
    },
    matchResult?.kriterien
  );
  const groupSignature = adjustmentSignature(scenarioRows, groups, checkConstraints);
  // Subgroups without persona or matrix values cannot be checked; the result says so.
  const uncheckedSubgroups = subgroups.filter(
    (g) => !hasAdjustmentProfile({ personaId: g.personaId, selectedValues: g.matrixValues, ohneSchrift: g.ohneSchrift, ohneBewegung: g.ohneBewegung })
  );
  const adjustmentsNow = adjustmentsInForce(subgroupMethods, autoAdjustments);
  // Added phases the teacher removed again in step 2 no longer count.
  const addedPhasesNow = addedPhases.filter((a) => scenarioRows.some((r) => r.methodId === a.kennung));

  const signatureOf = (rows: typeof scenarioRows) => adjustmentSignature(rows, groups, checkConstraints);

  const regelsatz = { teilgruppen: bundle.teilgruppen, regeln: bundle.regeln, schemes: bundle.schemes };


  /**
   * Step 3: one answer per subgroup and phase (fits, help in the method, other method) and short phases the plan
   * lacks. Nothing is entered by itself: the teacher takes over a swap or a help on its card.
   */
  const phaseLabelIn = (rows: typeof scenarioRows) => (stepKey: string) => {
    const r = rows.find((x) => x.key === stepKey);
    return r ? `${r.orderLabel} · ${r.methodName}` : stepKey;
  };

  const runMethodAdjustment = () => {
    const phases = adjustmentPhases(scenarioRows);
    const res = pruefeTeilgruppen(bundle.bausteine, scenarioRows, groups, checkConstraints, regelsatz);
    const nach = nachErneuterPruefung(subgroupMethods, autoAdjustments, res, generatedMaterials, phaseLabelIn(scenarioRows));
    setSubgroupMethods(nach.subgroupMethods);
    setGeneratedMaterials(nach.materials);
    setPruefStatus(nach.status);
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
    // Everything stored per phase moves with it first.
    const methods = shiftStepKeys(subgroupMethods, index, delta);
    const previous = shiftAdjustmentKeys(autoAdjustments, index, delta);
    const materials = generatedMaterials.flatMap((m) => {
      const key = Object.keys(shiftStepKeys({ [m.stepKey]: true }, index, delta))[0];
      return key ? [{ ...m, stepKey: key }] : [];
    });
    if (upToDate) {
      // The cards follow the new flow: every phase, the added one too, gets its answer; what was taken over stays
      // only while the new check still gives it, as after "Erneut prüfen".
      const res = pruefeTeilgruppen(bundle.bausteine, rows, groups, checkConstraints, regelsatz);
      const nach = nachErneuterPruefung(methods, previous, res, materials, phaseLabelIn(rows));
      setSubgroupMethods(nach.subgroupMethods);
      setGeneratedMaterials(nach.materials);
      setPruefStatus(nach.status);
      setAutoAdjustments(res.vorschlaege);
      setPruefung(res);
      setExtraProposals(proposeAdditionalPhases(bundle.bausteine, adjustmentPhases(rows), adjustmentGroups(groups), checkConstraints));
      setAdjustedFor(signatureOf(rows));
    } else {
      setSubgroupMethods(methods);
      setGeneratedMaterials(materials);
      setAutoAdjustments(previous);
      setPruefung((prev) => verschiebePruefung(prev, index, delta));
    }
    setOerByStep((prev) => shiftStepKeys(prev, index, delta));
    setAiDiffByStep((prev) => shiftStepKeys(prev, index, delta));
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

  /** Takes the proposed accompanying strand into the flow as the last phase (D3); undone with removeBegleitstrang. */
  const takeOverBegleitstrang = (st: Begleitstrang) => {
    const res = addExtraPhase(arrangement, blocksById, begleitstrangAlsPhase(st));
    applyFlowChange(res.arrangement, res.index, 1);
    setBegleitPhasen((prev) => [...prev.filter((a) => a.kennung !== res.added.kennung), res.added]);
    // A strand in the flow is a phase, not material as well.
    setGeneratedMaterials((prev) => prev.filter((m) => m.id !== begleitstrangMaterialId(st)));
  };

  const removeBegleitstrang = (a: AddedPhase) => {
    const res = removeExtraPhase(arrangement, a);
    setBegleitPhasen((prev) => prev.filter((x) => x.kennung !== a.kennung));
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
    // Accompanying goals: the boxes of step 1 together with those the text names (the field alone would drop them).
    if (begleitziele.length) {
      const gewaehlt = new Set([...begleitziele, ...((ausText.begleitziel as string[] | undefined) || [])]);
      req.begleitziel = valuesOf('begleitziel').map((w) => w.id).filter((id) => gewaehlt.has(id));
    }
    if (zielErg && !ausText.zielart && !ausText.zieltyp) req.zielart = zielErg;
    if (stufeErg && !ausText.bildungsstufe) req.bildungsstufe = stufeErg;
    if (Number(zeitErg) > 0 && !ausText.zeitMin) req.zeitMin = Number(zeitErg);
    if (themaErg.trim() && !extractSubjectAndTopic(scenarioText).thema) req.thema = themaErg.trim();
    // The optional "Fach" field counts like in the AI mode and in /api/v1/plan, unless the text names a subject.
    const fbFeld = matcher ? fachbereichFromField(matcher, scenarioText, fach) : undefined;
    if (fbFeld) req.fachbereich = fbFeld;
    // "Mehr Angaben" are explicit choices of the teacher: they win over the text and over a completion.
    Object.assign(req, mehrAngabenInAnfrage(mehr));
    return req;
  };

  /**
   * Text for the AI path: the description plus the free-text details that have no request field. Everything with a
   * field (room, size, completions of "Fehlt noch", "Mehr Angaben" …) goes as structured field next to the text.
   */
  const buildEnrichedAiText = (): string => {
    const extras: string[] = [];
    if (fach.trim()) extras.push(`Fach: ${fach.trim()}`);
    if (thema.trim()) extras.push(`Thema: ${thema.trim()}`);
    if (didaktischerAnsatzLabel) extras.push(`Didaktischer Ansatz: ${didaktischerAnsatzLabel}`);
    if (lehrkraefteInfo.trim() && lehrkraefteInfo.trim() !== '1 Lehrkraft') {
      extras.push(`Lehrkräfte/Begleitung: ${lehrkraefteInfo.trim()}`);
    }
    if (lernziele.trim()) extras.push(`Lernziele: ${lernziele.trim()}`);
    return extras.length ? `${scenarioText.trim()}\n\nZusatzangaben: ${extras.join('; ')}` : scenarioText;
  };

  /**
   * An example is a request: it fills the fields of step 1 (with "Mehr Angaben") and asks the core for a proposal, so
   * the chain, the methods and every check come from the matcher. What was set before is replaced by the example.
   */
  const applyBeispiel = (ex: BeispielAnfrage) => {
    setFach(ex.fach);
    setThema(ex.thema);
    setScenarioText(ex.text);
    setAnsatzCodes([...ex.ansatz]);
    setCustomAnsatzText('');
    setLernziele(ex.lernziele);
    setProblemstellung(ex.problemstellung);
    setMaxTechnik('');
    setOhneInternet(/ohne\s+internet/i.test(ex.text));
    setOhneKI(false);
    setGruppeSize('');
    setRaumzeitFilter('');
    setRaum('');
    setRaumBietet(null);
    setOhneSchrift([]);
    setTermine('');
    setBegleitziele([]);
    setMehr({ ...ex.mehr });
    setGroups(STANDARD_LEARNER_GROUPS);
    setPresetContextSource(ex.label);
    clearErgaenzungen();
    setMatchNotice(null);
    setMatchAuftrag({ nr: Date.now(), art: 'beispiel', label: ex.label });
  };

  const syncTopicFromScenarioText = (serverFach?: string | null, serverThema?: string | null, themaBehalten = false) => {
    const local = themaBehalten ? { fach: '', thema: '' } : extractSubjectAndTopic(scenarioText);
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

  /**
   * Asks the core for a proposal for the request of step 1. `auftrag`: the run comes from an example or from the chain
   * select; then step 1 stays open and the notice says where the flow is. An example keeps its subject and topic.
   */
  const runDeterministicMatch = (auftrag?: MatchAuftrag) => {
    setMatchNotice(null);
    const detectedMatrixTriggers = syncTopicFromScenarioText(undefined, undefined, auftrag?.art === 'beispiel');
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
      // The untouched flow of an example belongs to its text: an own description starts from an empty flow again.
      templateFlowRef.current = auftrag?.art === 'beispiel' ? JSON.stringify(res.arrangement) : null;
      if (auftrag?.art === 'beispiel') {
        setMatchNotice(
          `Beispiel „${auftrag.label}“ geladen: Vorschlag für deinen Ablauf: ${res.kette?.label}. Sieh ihn dir in Schritt 2 an oder überschreibe den Text mit deinem eigenen Vorhaben.`
        );
      } else if (auftrag?.art === 'kette') {
        setMatchNotice(`Neuer Vorschlag mit der Kette ${res.kette?.label}. Deine Angaben bleiben; sieh dir den Ablauf in Schritt 2 an.`);
      } else {
        setMatchNotice(`Vorschlag für deinen Ablauf: ${res.kette?.label}. Du kannst ihn hier ansehen und anpassen.`);
        setStep(2);
      }
    } else if (res.modus === 'phase') {
      setMatchNotice(
        `Das klingt nach einer einzelnen Phase: ${res.vorschlaege.length} passende Methoden gefunden. Klicke unten eine an, um sie zu übernehmen.${matrixHint}`
      );
    }
  };

  runMatchRef.current = runDeterministicMatch;

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
      // The structured fields win over what the language model reads (server and browser path alike).
      const felder = ohneText(buildStructuredMatchRequest());
      if (byok.enabled && byok.directBrowser) {
        json = await runDirectTranslate(byok, buildEnrichedAiText(), felder);
      } else {
        const res = await fetch('/api/v1/assistant/translate', {
          method: 'POST',
          headers: byokHeaders(),
          body: JSON.stringify({ ...felder, text: buildEnrichedAiText() })
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
            lehrkraefteInfo: lehrendeZeile,
            lernziele,
            problemstellung,
            hinweise,
            totalDurationMin: validation.dauerMin,
            labelOf,
            ...entwurfMeta
          });
    const sc = buildNeutralLearningScenario(arrangement, scenarioRows, groups, {
      fach,
      thema,
      didaktischerAnsatz: didaktischerAnsatzLabel,
      lehrkraefteInfo: lehrendeZeile,
      lernziele,
      problemstellung,
      hinweise,
      thematicRows: effThematic,
      elaboration: effNarrative,
      generatedMaterials,
      totalDurationMin: validation.dauerMin,
      labelOf,
      ...entwurfMeta
    });
    const html = exportArrangementHtmlHandout(arrangement, blocksById, validation, {
      fach,
      thema,
      didaktischerAnsatz: didaktischerAnsatzLabel,
      lehrkraefteInfo: lehrendeZeile,
      profil: exportProfil,
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
      lehrkraefteInfo: lehrendeZeile,
      profil: exportProfil,
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
    begleitziele,
    mehrAngaben: Object.keys(mehr).length ? mehr : undefined,
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
    elaboration,
    entwurfAngaben: angaben || undefined,
    begleitPhasen: begleitPhasen.length ? begleitPhasen : undefined
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
    setBegleitziele(Array.isArray(p.begleitziele) ? p.begleitziele.filter((x) => typeof x === 'string') : []);
    // Files may come from anyone: only codes the core offers for the field are kept.
    // Saved before "Mehr Angaben" existed: the selects show what the arrangement's context still holds.
    const erlaubtFuer = (feld: CodeFeld) => werteVon(feld).map((w) => w.code);
    setMehr(
      p.mehrAngaben === undefined
        ? mehrAngabenAusKontext(p.arrangement.kontext, erlaubtFuer)
        : mehrAngabenLesen(p.mehrAngaben, erlaubtFuer) || {}
    );
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
    setPruefStatus(null);
    setExtraProposals([]);
    setAddedPhases([]);
    setBegleitPhasen(p.begleitPhasen || []);
    setGeladeneAngaben(p.entwurfAngaben || null);
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
  // The answer's parts the draft reads: from the last proposal, else as saved with a loaded scenario.
  const angaben: EntwurfAngaben | null = matchResult ? entwurfAngabenAus(matchResult) : geladeneAngaben;
  // Fit rules for the flow as it is now: the core checks every method in it again in the plan's situation (the last
  // answer, a choice of "Mehr Angaben" made since wins), so a method swapped in by hand gets its warning and one
  // swapped out loses it. Notes that are not about one method stay as the answer gave them.
  const regelLage = regelLageAus({
    bildungsstufe: arrangement.kontext?.bildungsstufe,
    vorwissen: arrangement.kontext?.vorwissen,
    fachbereich: planFachbereich,
    ...(angaben?.regelLage || {}),
    ...(matchResult?.kriterien || {}),
    ...mehrAngabenInAnfrage(mehr)
  });
  const regelmeldungen = meldungenImAblauf(
    passungNeuPruefen(angaben?.regelmeldungen || [], usedBlocks, regelLage, bundle.regeln, labelOf),
    usedBlocks,
    bundle?.regeln
  );
  const zeilenMethoden = new Set(scenarioRows.map((r) => r.methodId));
  const ablaufRegelmeldungen = regelmeldungen.filter((m) => !m.baustein || !zeilenMethoden.has(m.baustein));
  const classSize = Number(gruppeSize) || Number(matchResult?.kriterien?.gruppe) || undefined;
  // Draft (step 5): planning profile from the core answer, room, size, unit, proof and the plan's notes.
  const angenommenRaum = angaben?.raumAngenommen;
  const raumCode = raum || angaben?.raum || angenommenRaum || '';
  const zielCode = angaben?.zielart;
  // Accompanying goals as the matcher read them (boxes and text), the strands it proposes and those taken into the flow.
  const begleitzielCodes = angaben?.begleitziele || begleitziele;
  const begleitstraenge: Begleitstrang[] = angaben?.begleitstrang || [];
  const begleitPhasenNow = begleitPhasen.filter((a) => scenarioRows.some((r) => r.methodId === a.kennung));
  const begleitImAblauf = (st: Begleitstrang) => begleitPhasenNow.find((a) => a.kennung === st.baustein);
  const begleitHinweise = begleitzielHinweise(angaben?.hinweise);
  // A choice of "Mehr Angaben" sent with the last proposal and cleared since: that answer still holds the old value, so
  // the draft reads the core's answer for the current request instead (computed once per request).
  const mehrJetzt = mehrAngabenInAnfrage(mehr);
  const geleert = (f: GewaehltesFeld) => mehrJetzt[f] === undefined && Boolean(angaben?.gewaehlt?.includes(f));
  const aktuelleAngaben = (): EntwurfAngaben => {
    const req = buildStructuredMatchRequest();
    const key = JSON.stringify(req);
    if (aktuelleAntwortRef.current?.key !== key) aktuelleAntwortRef.current = { key, angaben: entwurfAngabenAus(matcher.zuordnen(req)) };
    return aktuelleAntwortRef.current.angaben;
  };
  const quelleFuer = (f: GewaehltesFeld) => (geleert(f) ? aktuelleAngaben() : angaben);
  // Planning profile of the draft: chosen in step 1 or 5, else the core's. When the last proposal had a chosen profile
  // that is cleared now, the core derives it again from the Bildungsstufe and the text (no new proposal needed).
  const profilAbgeleitet =
    !mehr.planungsprofil && angaben?.planungsprofilGewaehlt && bundle?.planungsprofile?.profile?.length
      ? waehlePlanungsprofil(bundle.planungsprofile.profile, { bildungsstufe: arrangement.kontext?.bildungsstufe, text: scenarioText })
      : null;
  const entwurfMeta: EntwurfMeta = {
    planungsprofile: bundle?.planungsprofile,
    planungsprofil: mehr.planungsprofil || profilAbgeleitet?.profil.id || angaben?.planungsprofil,
    planungsprofilAngenommen: mehr.planungsprofil ? false : profilAbgeleitet ? profilAbgeleitet.angenommen : Boolean(angaben?.planungsprofilAngenommen),
    raum: raumCode ? `${labelOf('raumtyp', raumCode)}${!raum && !angaben?.raum && angenommenRaum ? ' (angenommen)' : ''}` : undefined,
    anzahl: classSize,
    // Unit, proof and grading as chosen in "Mehr Angaben" count at once; otherwise as the last proposal read them, or,
    // for a choice cleared since, as the core answers the current request.
    einheit: mehrJetzt.einheit || quelleFuer('einheit')?.einheit,
    nachweis: (mehr.nachweis ? [mehr.nachweis] : quelleFuer('nachweis')?.nachweis)?.map((f) => labelOf('nachweisform', f)).join(' oder ') || undefined,
    bewertet: mehrJetzt.bewertet ?? quelleFuer('bewertet')?.bewertet,
    hauptziel: zielCode ? labelOf('zielart', zielCode) : bundle?.ketten.find((k) => k.id === arrangement.zieltyp)?.label,
    begleitziele: begleitzielCodes.length ? begleitzielCodes.map((c) => labelOf('begleitziel', c)) : undefined,
    // A strand taken into the flow is a phase of the plan now, no longer a proposal.
    begleitstrang: begleitstraenge
      .filter((st) => !begleitImAblauf(st))
      .map((st) => ({ begleitziel: labelOf('begleitziel', st.begleitziel), methode: st.name, dauerMin: st.dauerMin, baustein: st.baustein })),
    regelmeldungen: regelmeldungen.length ? regelmeldungen : undefined,
    regeln: bundle?.regeln
  };
  const exportProfil = entwurfBegriffe(entwurfMeta, arrangement.kontext?.bildungsstufe);
  const verlaufSpalten = exportProfil?.spalten;
  // The untouched default "1 Lehrkraft" is not shown outside the school terms.
  const lehrendeZeile = lehrendeInfo(lehrkraefteInfo, entwurfMeta, arrangement.kontext?.bildungsstufe);
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

  // Frame for every picker of another method (replacement in step 2, parallel method in step 3): the request as the
  // core read it, else the fields of step 1, with the chain and the number of teachers. The core filters the candidates.
  const kandidatenRahmen: KandidatenRahmen = {
    constraints: { ...checkConstraints, anfrage: checkConstraints.anfrage ?? (ohneText(buildStructuredMatchRequest()) as MatchRequest) },
    zieltyp: arrangement.zieltyp,
    lehrende: mehr.lehrende,
    ketten: bundle.ketten,
    regelwerk: regelsatz
  };
  // What the core left out and why (with the method's field), and the helps the request named (no phase).
  const ausschluesse = ausschlussZeilen(matchResult, blocksById, bundle);
  const hilfenNamen = genannteHilfenNamen(matchResult, blocksById);
  const AUSSCHLUSS_SICHTBAR = 8;
  const ausschlussBlock = () =>
    ausschluesse.length > 0 ? (
      <section aria-label="Nicht eingeplant" className="card" style={{ padding: '10px 14px', marginTop: 10, borderLeft: '4px solid var(--grid)' }}>
        <strong style={{ fontFamily: 'var(--display)', fontSize: 14.5 }}>
          {matchResult?.modus === 'ablauf' ? 'Genannt, aber nicht eingeplant' : 'Nicht vorgeschlagen, weil der Bedarf nicht gedeckt ist'}
        </strong>
        <ul style={{ margin: '4px 0 0', paddingLeft: 20, fontSize: 14 }}>
          {ausschluesse.slice(0, AUSSCHLUSS_SICHTBAR).map((z) => (
            <li key={z.baustein}>
              <strong>{z.name}</strong> {z.grund}.
              {z.merkmal && (
                <div className="muted" style={{ fontSize: 12 }}>
                  Merkmal: {z.merkmal}
                  {z.wfeld ? ` · W-Feld: ${z.wfeld}` : ''}
                </div>
              )}
            </li>
          ))}
        </ul>
        {ausschluesse.length > AUSSCHLUSS_SICHTBAR && (
          <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
            Dazu {ausschluesse.length - AUSSCHLUSS_SICHTBAR} weitere Methoden.
          </p>
        )}
      </section>
    ) : null;

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

            {/* Room: a required detail, visible in step 1 (spec §8), with the properties it offers. */}
            <div className="planner-raum" style={{ marginTop: 10, maxWidth: 640 }}>
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
                    onClick={() => runDeterministicMatch()}
                    title="Nutzt nur die festen Regeln der Methodendatenbank, ohne KI"
                  >
                    Ohne KI vorschlagen
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-primary" disabled={!canPropose} onClick={() => runDeterministicMatch()}>
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
                        + {v.name} ({v.dauerMin}–{v.dauerMax} min
                        {v.evidenzgrad
                          ? `, Grad ${v.evidenzgrad}${evidenzBezugBeiGrad(blocksById.get(v.baustein), v.evidenzgrad).map((t) => `, ${t}`).join('')}`
                          : ''}
                        )
                      </button>
                    </li>
                  ))}
                </ul>
                {ausschlussBlock()}
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
              <p className="muted" style={{ fontSize: 13, margin: '0 0 8px' }}>
                Ein Beispiel füllt die Angaben oben aus. Den Ablauf schlägt der Baukasten dann so vor wie für deine eigene
                Beschreibung.
              </p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {BEISPIEL_ANFRAGEN.map((ex) => (
                  <button key={ex.id} type="button" className="btn btn-sm" onClick={() => applyBeispiel(ex)}>
                    {ex.label}
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
              Mehr Angaben (freiwillig): Fach, Stufe, Vorwissen, Sprachniveau, Komplexität, Funktionskette, Lernziele, Klassengröße, Lehrende,
              Fachausstattung, Technik, Lesen und Schreiben, Termine, Nachweis, Bewertung, Einheit, Planungsprofil, Begleitziel
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
                      value={mehr.bildungsstufe || ''}
                      onChange={(e) => {
                        setMehrFeld('bildungsstufe', e.target.value || undefined);
                        setArrangement({ ...arrangement, kontext: mitKontext(arrangement.kontext, 'bildungsstufe', e.target.value || undefined) });
                      }}
                    >
                      <option value="">nicht angegeben</option>
                      {werteVon('bildungsstufe').map((w) => (
                        <option key={w.code} value={w.code}>
                          {w.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--display)' }}>
                    Vorwissen
                    <select
                      style={{ width: '100%' }}
                      value={mehr.vorwissen || ''}
                      onChange={(e) => {
                        setMehrFeld('vorwissen', e.target.value || undefined);
                        setArrangement({ ...arrangement, kontext: mitKontext(arrangement.kontext, 'vorwissen', e.target.value || undefined) });
                      }}
                    >
                      <option value="">nicht angegeben</option>
                      {werteVon('vorwissen').map((w) => (
                        <option key={w.code} value={w.code}>
                          {w.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--display)' }}>
                    Sprachniveau
                    <select
                      style={{ width: '100%' }}
                      value={mehr.sprachniveau || ''}
                      onChange={(e) => {
                        setMehrFeld('sprachniveau', e.target.value || undefined);
                        setArrangement({ ...arrangement, kontext: mitKontext(arrangement.kontext, 'sprachniveau', e.target.value || undefined) });
                      }}
                    >
                      <option value="">nicht angegeben</option>
                      {werteVon('sprachniveau').map((w) => (
                        <option key={w.code} value={w.code}>
                          {w.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--display)' }}>
                    Komplexität des Inhalts
                    <select
                      style={{ width: '100%' }}
                      value={mehr.komplexitaet || ''}
                      onChange={(e) => {
                        setMehrFeld('komplexitaet', e.target.value || undefined);
                        setArrangement({ ...arrangement, kontext: mitKontext(arrangement.kontext, 'komplexitaet', e.target.value || undefined) });
                      }}
                    >
                      <option value="">nicht angegeben</option>
                      {werteVon('komplexitaet').map((w) => (
                        <option key={w.code} value={w.code}>
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
                      value={mehr.zeitMin ?? ''}
                      onChange={(e) => {
                        const min = Math.max(0, Number(e.target.value) || 0);
                        setMehrFeld('zeitMin', min > 0 ? min : undefined);
                        setArrangement({ ...arrangement, kontext: mitKontext(arrangement.kontext, 'zeitbudgetMin', min > 0 ? min : undefined) });
                      }}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--display)' }}>
                    Funktionskette / Zieltyp
                    <select
                      style={{ width: '100%' }}
                      value={mehr.zieltyp || (!arrangement.zieltyp && hasFlow ? FREIER_ABLAUF : '')}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === FREIER_ABLAUF) {
                          // Only takes the chain off the current flow; no method is chosen or changed.
                          setMehrFeld('zieltyp', undefined);
                          setArrangement({ ...arrangement, zieltyp: undefined, name: 'Freier Ablauf' });
                          return;
                        }
                        // The chain goes into the request; the core proposes again with everything else of step 1.
                        setMehrFeld('zieltyp', v || undefined);
                        const label = bundle.ketten.find((k) => k.id === v)?.label || 'aus der Zielart';
                        // Same rule as "Anderer Vorschlag": a new proposal must not discard own work (hand edits,
                        // subgroup methods, OER, materials, elaboration). Then the wish waits for the next proposal.
                        if (hasFlow && !otherProposalSafe) {
                          setMatchNotice(
                            v
                              ? `Die Kette „${label}“ gilt beim nächsten Vorschlag („Ablauf vorschlagen“). Dein Ablauf mit deinen Änderungen bleibt bis dahin, wie er ist.`
                              : 'Die Kette aus der Zielart gilt beim nächsten Vorschlag („Ablauf vorschlagen“). Dein Ablauf mit deinen Änderungen bleibt bis dahin, wie er ist.'
                          );
                          return;
                        }
                        if (v || canPropose || matchResult) setMatchAuftrag({ nr: Date.now(), art: 'kette', label });
                      }}
                    >
                      <option value="">Aus der Zielart (Vorschlag des Baukastens)</option>
                      <option value={FREIER_ABLAUF}>Freier Ablauf (ohne Kette)</option>
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
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--display)' }}>
                    Anzahl Lehrende
                    <input
                      type="number"
                      style={{ width: '100%' }}
                      min={1}
                      max={10}
                      value={mehr.lehrende ?? ''}
                      placeholder="nicht angegeben (z. B. 2 beim Teamteaching)"
                      onChange={(e) => setMehrFeld('lehrende', Number(e.target.value) > 0 ? Math.round(Number(e.target.value)) : undefined)}
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
                  3. Rahmen (Fachausstattung, Technik, Lesen und Schreiben, Termine – filtert Methoden direkt)
                </strong>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--display)', maxWidth: 360, marginTop: 10 }}>
                  Art der Fachausstattung
                  <select style={{ width: '100%' }} value={mehr.fachausstattungArt || ''} onChange={(e) => setMehrFeld('fachausstattungArt', e.target.value || undefined)}>
                    <option value="">nicht angegeben</option>
                    {werteVon('fachausstattungArt').map((w) => (
                      <option key={w.code} value={w.code}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                </label>
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

              {/* Group D: proof, grading, unit and planning profile; they reach the matcher and the draft of step 5. */}
              <div style={{ paddingTop: 14, borderTop: '1px solid var(--grid)' }}>
                <strong style={{ fontFamily: 'var(--display)', fontSize: 14.5 }}>4. Nachweis, Bewertung und Entwurf</strong>
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
                    Nachweis
                    <select style={{ width: '100%' }} value={mehr.nachweis || ''} onChange={(e) => setMehrFeld('nachweis', e.target.value || undefined)}>
                      <option value="">nicht angegeben</option>
                      {werteVon('nachweis').map((w) => (
                        <option key={w.code} value={w.code}>
                          {w.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--display)' }}>
                    Wird die Stunde bewertet?
                    <select
                      style={{ width: '100%' }}
                      value={mehr.bewertet === undefined ? '' : mehr.bewertet ? 'ja' : 'nein'}
                      onChange={(e) => setMehrFeld('bewertet', e.target.value === '' ? undefined : e.target.value === 'ja')}
                    >
                      <option value="">nicht angegeben</option>
                      <option value="ja">ja</option>
                      <option value="nein">nein</option>
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--display)' }}>
                    Übergeordnete Einheit
                    <input
                      type="text"
                      style={{ width: '100%' }}
                      value={mehr.einheit ?? ''}
                      placeholder="z. B. Lernfeld 3, Reihe Ökologie"
                      onChange={(e) => setMehrFeld('einheit', e.target.value || undefined)}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--display)' }}>
                    Planungsprofil
                    <select style={{ width: '100%' }} value={mehr.planungsprofil || ''} onChange={(e) => setMehrFeld('planungsprofil', e.target.value || undefined)}>
                      <option value="">aus der Bildungsstufe</option>
                      {werteVon('planungsprofil').map((w) => (
                        <option key={w.code} value={w.code}>
                          {w.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>
                  Das Planungsprofil bestimmt Begriffe und Aufbau des Entwurfs in Schritt 5. Du kannst es dort noch ändern.
                </p>
              </div>

              {/* Group E: accompanying goals (D3): nothing preselected, nothing blocks. */}
              <div style={{ paddingTop: 14, borderTop: '1px solid var(--grid)' }}>
                <strong style={{ fontFamily: 'var(--display)', fontSize: 14.5 }}>Was soll nebenbei gefördert werden?</strong>
                <div role="group" aria-label="Was soll nebenbei gefördert werden?" style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', marginTop: 8, fontSize: 14 }}>
                  {valuesOf('begleitziel').map((w) => (
                    <label key={w.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={begleitziele.includes(w.id)}
                        onChange={(e) => {
                          setPresetContextSource(null);
                          setBegleitziele((prev) => (e.target.checked ? [...prev.filter((x) => x !== w.id), w.id] : prev.filter((x) => x !== w.id)));
                        }}
                      />
                      {w.label}
                    </label>
                  ))}
                </div>
                <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>
                  Ein Begleitziel wählt nie den Ablauf. Unter gleichwertigen Methoden kommt eine passende nach vorn, und du bekommst einen
                  kurzen Begleitstrang am Ende als Vorschlag. Wirkungen sind für Programme über mehrere Wochen belegt.
                </p>
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
          {hasFlow && (begleitstraenge.length > 0 || begleitHinweise.length > 0) && (
            <section aria-label="Begleitziele" className="card" style={{ padding: '10px 14px', marginTop: 10, borderLeft: '4px solid var(--dB)' }}>
              <strong style={{ fontFamily: 'var(--display)', fontSize: 14.5 }}>
                Begleitziele: {begleitzielCodes.map((c) => labelOf('begleitziel', c)).join(', ')}
              </strong>
              <ul className="planner-adjust-list" style={{ margin: '6px 0 0' }}>
                {begleitstraenge.map((st) => {
                  const drin = begleitImAblauf(st);
                  return (
                    <li key={st.begleitziel}>
                      <div>
                        <div>
                          <strong>
                            Vorschlag: {st.name}, {st.dauerMin} min am Ende
                          </strong>{' '}
                          <span className="muted">({labelOf('begleitziel', st.begleitziel)})</span>
                        </div>
                        <div className="muted" style={{ fontSize: 13 }}>
                          {drin ? `${st.name} steht jetzt als letzte Phase im Ablauf.` : st.grund}
                        </div>
                      </div>
                      {drin ? (
                        <button type="button" className="btn btn-sm" aria-label={`${st.name} wieder entfernen`} onClick={() => removeBegleitstrang(drin)}>
                          Wieder entfernen
                        </button>
                      ) : (
                        <button type="button" className="btn btn-sm" aria-label={`${st.name} am Ende übernehmen`} onClick={() => takeOverBegleitstrang(st)}>
                          Übernehmen
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
              {begleitHinweise.map((h) => (
                <p key={h} style={{ fontSize: 14, margin: '6px 0 0' }}>
                  {h}
                </p>
              ))}
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
          {ausschlussBlock()}
          {hilfenNamen.length > 0 && (
            <section aria-label="Genannte Hilfen" className="card" style={{ padding: '10px 14px', marginTop: 10, borderLeft: '4px solid var(--dB)' }}>
              <strong style={{ fontFamily: 'var(--display)', fontSize: 14.5 }}>Genannte Hilfen: {hilfenNamen.join(', ')}</strong>
              <p style={{ fontSize: 14, margin: '4px 0 0' }}>
                Eine Hilfe ist keine eigene Phase. Du ordnest sie in Schritt 3 den Phasen zu, für die ganze Klasse oder für eine
                Teilgruppe.
              </p>
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
              lehrkraefteInfo={lehrendeZeile}
              spalten={verlaufSpalten}
              allBlocks={bundle.bausteine}
              regelmeldungen={regelmeldungen}
              regeln={bundle.regeln}
              schemes={bundle.schemes}
              zielart={zielCode}
              kandidaten={kandidatenRahmen}
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
              situation={situationsAnfrage(kandidatenRahmen.constraints)}
              kandidaten={kandidatenRahmen}
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
            kandidaten={kandidatenRahmen}
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
                      {!adjustmentStale && pruefStatus && (
                        <p className="planner-notice" style={{ marginTop: 10 }}>
                          {pruefStatus}
                        </p>
                      )}
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
                      lehrkraefteInfo={lehrendeZeile}
                      spalten={verlaufSpalten}
                      allBlocks={bundle.bausteine}
                      schemes={bundle.schemes}
                      zielart={zielCode}
                      kandidaten={kandidatenRahmen}
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
            entwurfMeta={entwurfMeta}
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

          {begleitstraenge.length > 0 && (
            <section aria-label="Begleitstrang für Begleitziele" className="card no-print" style={{ padding: 14 }}>
              <strong style={{ fontFamily: 'var(--display)', fontSize: 14.5 }}>Begleitstrang für Begleitziele</strong>
              <ul className="planner-adjust-list" style={{ margin: '6px 0 0' }}>
                {begleitstraenge.map((st) => {
                  const ziel = labelOf('begleitziel', st.begleitziel);
                  const angehaengt = generatedMaterials.some((m) => m.id === begleitstrangMaterialId(st));
                  const letzte = scenarioRows[scenarioRows.length - 1]?.key;
                  const imAblauf = !!begleitImAblauf(st);
                  return (
                    <li key={st.begleitziel}>
                      <div>
                        <div>
                          <strong>{st.name}</strong> ({ziel}, {st.dauerMin} min am Ende)
                        </div>
                        <div className="muted" style={{ fontSize: 13 }}>
                          {imAblauf ? `${st.name} steht als letzte Phase im Ablauf; als Material entfällt er.` : st.grund}
                        </div>
                      </div>
                      {imAblauf ? null : angehaengt ? (
                        <button
                          type="button"
                          className="btn btn-sm"
                          aria-label={`Material zu ${st.name} zurücknehmen`}
                          onClick={() => setGeneratedMaterials((prev) => prev.filter((m) => m.id !== begleitstrangMaterialId(st)))}
                        >
                          Zurücknehmen
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-sm"
                          aria-label={`${st.name} als Material anhängen`}
                          disabled={!letzte}
                          onClick={() => letzte && setGeneratedMaterials((prev) => [...prev.filter((m) => m.id !== begleitstrangMaterialId(st)), begleitstrangAlsMaterial(st, ziel, letzte)])}
                        >
                          Als Material anhängen
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

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
            entwurfMeta={entwurfMeta}
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
          {/* Planning profile of the draft: the same choice as in step 1 ("Mehr Angaben"); empty: from the Bildungsstufe. */}
          <div className="no-print card" style={{ padding: '12px 16px', marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 14, fontWeight: 600, fontFamily: 'var(--display)' }}>
              Planungsprofil
              <select value={mehr.planungsprofil || ''} onChange={(e) => setMehrFeld('planungsprofil', e.target.value || undefined)}>
                <option value="">aus der Bildungsstufe</option>
                {werteVon('planungsprofil').map((w) => (
                  <option key={w.code} value={w.code}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>
            <span className="muted" style={{ fontSize: 13 }}>
              {(() => {
                const p = bundle.planungsprofile?.profile?.find((x) => x.id === entwurfMeta.planungsprofil);
                return p ? `Der Entwurf folgt dem Profil „${labelOf('planungsprofil', p.id)}“: ${p.dokument}.` : 'Der Entwurf folgt der Bildungsstufe.';
              })()}
            </span>
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
            entwurfMeta={entwurfMeta}
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
