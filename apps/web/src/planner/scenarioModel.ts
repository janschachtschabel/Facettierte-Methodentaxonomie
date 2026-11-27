import {
  QUICK_LEARNER_GROUP_PROFILES,
  baueEntwurf,
  entwurfMarkdown,
  extractSubjectAndTopic,
  isRegularGroupId,
  istPruefschritt,
  profilBegriffe,
  regelmeldungenFuerEntwurf,
  scoreDifferentiationMatrix,
  waehlePlanungsprofil,
  type Arrangement,
  type Entwurf,
  type EntwurfPhase,
  type Passungsregel,
  type PlanungsprofileRegelsatz,
  type Regelmeldung,
  type ArrangementNode,
  type Baustein,
  type CatalogBundle,
  type EinsatzNode
} from '@fmt/core';
import { getMainSequence } from './arrangementOps.js';
import { safeOerList } from './safeUrl.js';
import { evidenzBezugBeiGrad } from './evidenz.js';

export interface LearnerGroup {
  id: string;
  label: string;
  profile: string;
  focus: 'basis' | 'regel' | 'vertiefung' | 'sprachsensibel' | 'custom';
  active: boolean;
  /** Number of learners in this subgroup (optional) */
  count?: number;
  /** Linked persona from binnendifferenzierungsmatrix */
  personaId?: string;
  /** Custom Anpassungsvariablen overrides for the scoring matrix */
  matrixValues?: Record<string, string>;
  /** What the group cannot do yet: read, write (statement of the teacher, not a matrix trait). */
  ohneSchrift?: Array<'lesen' | 'schreiben'>;
  /** The group cannot move freely (statement of the teacher, not a matrix trait). */
  ohneBewegung?: boolean;
  /**
   * Matrix values the teacher named (core values of a chip, values set by hand); only these decide the subgroup check,
   * the others only order the matrix. Undefined: every value in matrixValues counts.
   */
  genannt?: string[];
}

export interface StepDiffSuggestion {
  groupId: string;
  groupLabel: string;
  measure: string;
  source: 'matrix' | 'fmt-regel' | 'ki' | 'manuell';
}

export interface OerResource {
  id: string;
  title: string;
  description: string;
  url: string;
  /** Explicit WLO ccm:wwwurl field */
  wwwurl?: string;
  wloRenderUrl?: string | null;
  previewUrl?: string | null;
  license?: string | null;
  resourceType?: string | null;
  educationalContext?: string[];
  note?: string;
  source: 'wlo' | 'manual';
}

export interface GeneratedMaterialItem {
  id: string;
  stepKey: string;
  title: string;
  materialType: string;
  content: string;
  createdAt: string;
  /** Subgroup a help taken over in step 3 belongs to (materialType 'hilfe'). */
  groupId?: string;
}

/** Maps stepKey -> groupId -> alternative FMT method kennung */
export type SubgroupMethodMap = Record<string, Record<string, string>>;

export interface ThematicPhaseRow {
  key: string;
  orderLabel: string;
  phaseLabel: string;
  durationMin: number;
  methodId: string;
  methodName: string;
  /** Concrete methodological procedure (FMT Durchführungsschritte adapted to the topic!) */
  methodProcedure: string;
  teacherAction: string;
  learnerAction: string;
  groupAdaptations: Record<string, string>;
  materialsAndOer: string;
}

export interface ScenarioPhaseRow {
  key: string;
  orderLabel: string;
  stepIndex: number;
  slotKennung?: string;
  isNestedSlot: boolean;
  parentName?: string;
  phaseLabel: string;
  durationMin: number;
  orientationRange?: string;
  methodId: string;
  methodName: string;
  methodRange: string;
  methodUrl: string;
  evidenceGrade: string | null;
  /** What the findings of that grade rest on, in plain German ("Befund zur Methode"). */
  evidenceBezug?: string[];
  teacherRole: string;
  learnerRole: string;
  socialForm: string;
  environment: string;
  materials: string[];
  differentiation: StepDiffSuggestion[];
  subgroupMethods: Record<string, { methodId: string; methodName: string; methodUrl: string }>;
  oerResources: OerResource[];
  generatedMaterials: GeneratedMaterialItem[];
  block?: Baustein;
  /** Role of the chain step the phase fills ('sicherung' is read as the check step when the chain has none). */
  chainRole?: string;
  /** The phase fills the chain's check step (istPruefschritt). */
  chainCheck?: boolean;
  /** Id of the chain step the phase fills (its knowledge type binds a replacement). */
  chainStep?: string;
}

export interface MaterialTypeOption {
  id: string;
  label: string;
  description: string;
}

export const MATERIAL_TYPES: MaterialTypeOption[] = [
  { id: 'auto', label: 'Automatisch (passend zur FMT-Methode)', description: 'Wählt den optimalen Materialtyp aus Lernfunktion & Methode' },
  { id: 'arbeitsblatt', label: 'Gestuftes Arbeitsblatt', description: 'Aufgaben in Basis-, Regel- und Vertiefungsniveau inkl. Lösungshinweisen' },
  { id: 'infoblatt', label: 'Strukturiertes Infoblatt', description: 'Kompakte Kernkonzepte, Beispiele & Leitfragen' },
  { id: 'quiz', label: 'Kurz-Quiz / Abruftest (ohne Notendruck)', description: 'Abruf- und Diagnosefragen inkl. Musterlösung & häufigen Fehlvorstellungen' },
  { id: 'checkliste', label: 'Schritt-für-Schritt-Checkliste / Leittext', description: 'Prozedurale Handlungsanleitung zur Selbstkontrolle' },
  { id: 'versuchsanleitung', label: 'Beobachtungs- / Versuchsanleitung', description: 'Vorhersage-, Durchführungs- und Auswertungsbogen' },
  { id: 'diskussionskarten', label: 'Diskussions- & Impulskarten', description: 'Rollen-, Leitfragen- oder Pro/Contra-Karten für Austauschphasen' },
  { id: 'glossar', label: 'Fachbegriffs-Glossar & Satzstarter', description: 'Sprachsensible Begriffsübersicht mit Formulierungshilfen' }
];

export const STANDARD_LEARNER_GROUPS: LearnerGroup[] = [
  {
    id: 'regel',
    label: 'Regelgruppe (ganze Klasse)',
    profile: 'Gesamtgruppe ohne gesonderte Teilgruppen – Kernanforderung gemäß FMT-Konzept',
    focus: 'regel',
    active: true,
    count: 26,
    personaId: 'average'
  }
];

export interface QuickDiffGroupTemplate {
  id: string;
  label: string;
  chipLabel: string;
  profile: string;
  focus: LearnerGroup['focus'];
  defaultCount: number;
  personaId?: string;
  matrixValues: Record<string, string>;
  /** Core values of the preset: what the chip names (only these decide the subgroup check). */
  kern: string[];
}

// Single Source of Truth from @fmt/core (100% validated against DIFF_MATRIX_VARIABLES)
export const QUICK_DIFF_GROUP_TEMPLATES: QuickDiffGroupTemplate[] = QUICK_LEARNER_GROUP_PROFILES.map((p) => ({
  id: p.id,
  label: p.label,
  chipLabel: p.chipLabel,
  profile: p.profile,
  focus: p.focus,
  defaultCount: p.defaultCount,
  personaId: p.personaId,
  matrixValues: { ...p.selectedValues },
  kern: [...p.kern]
}));

export const DEFAULT_LEARNER_GROUPS: LearnerGroup[] = [
  {
    id: 'basis',
    label: 'Basisunterstützung & Sprachsensibel',
    profile: 'Geringeres Vorwissen, Bedarf an visuellen Strukturhilfen, Satzstartern und kleinschrittigen Beispielen',
    focus: 'basis',
    active: true,
    count: 6,
    personaId: 'languageAndCulture'
  },
  {
    id: 'regel',
    label: 'Regelgruppe',
    profile: 'Kernanforderung gemäß Lehrplan und FMT-Baustein',
    focus: 'regel',
    active: true,
    count: 14,
    personaId: 'average'
  },
  {
    id: 'vertiefung',
    label: 'Vertiefung & Leistungsstark',
    profile: 'Hohes Vorwissen, Bedarf an Transferaufgaben, offenen Problemen oder Experten-/Tutorrolle',
    focus: 'vertiefung',
    active: true,
    count: 6,
    personaId: 'highPerforming'
  }
];

export function detectMaterialTypeForBlock(b?: Baustein): string {
  if (!b) return 'arbeitsblatt';
  const fns = b.lernfunktion || [];
  if (b.kennung === 'vbe' || b.kennung === 'experiment' || b.piktogramm === 'experiment') return 'versuchsanleitung';
  if (fns.includes('diagnose') || b.kennung === 'abrufquiz' || b.kennung === 'exit-ticket' || b.kennung === 'brain-dump') {
    return 'quiz';
  }
  if (b.piktogramm === 'dialog' || b.piktogramm === 'debatte' || b.piktogramm === 'rolle' || b.ansatz.includes('diskurs')) {
    return 'diskussionskarten';
  }
  if (fns.includes('erwerb') && b.anleitung.includes('explizit')) return 'infoblatt';
  if ((b.aufgabe || []).includes('prozeduren')) return 'checkliste';
  return 'arbeitsblatt';
}

export function getOerWwwUrl(o: OerResource): string {
  return o.wwwurl || o.url;
}

export { extractSubjectAndTopic };

function summarizeTeacherRole(b: Baustein, labelOf: (s: string, c: string) => string): string {
  const roles = (b.rolle || [])
    .filter((r) => r !== 'ki-keine')
    .map((r) => labelOf('agentenrolle', r));
  const rolePrefix = roles.length ? roles.join(', ') : 'Moderation & Begleitung';
  const step0 = b.durchfuehrung?.[0] ? `Aufgabe: ${b.durchfuehrung[0]}` : '';
  const core = b.kernkomponente?.[0]?.name ? `Fokus: ${b.kernkomponente[0].name}` : '';
  return [rolePrefix, step0, core].filter(Boolean).join(' · ');
}

function summarizeLearnerRole(b: Baustein, labelOf: (s: string, c: string) => string): string {
  const eng = (b.engagement || []).map((e) => labelOf('engagement', e)).join(' / ');
  const steps = (b.durchfuehrung || []).length > 1 ? b.durchfuehrung.slice(1).join(' → ') : b.kurzbeschreibung;
  return `${eng || 'aktiv'} · ${steps}`;
}

export interface MatrixTechConstraints {
  maxTechnik?: string;
  ohneInternet?: boolean;
  ohneKI?: boolean;
}

export function buildDeterministicDiffHints(
  b: Baustein | undefined,
  groups: LearnerGroup[],
  constraints?: MatrixTechConstraints
): StepDiffSuggestion[] {
  if (!b) return [];
  const active = groups.filter((g) => g.active);
  const adapt = new Set(b.adaptivitaet || []);
  const hints: StepDiffSuggestion[] = [];

  for (const g of active) {
    if (g.focus === 'regel') {
      const core = b.kernkomponente?.[0]?.name;
      hints.push({
        groupId: g.id,
        groupLabel: g.label,
        measure: core
          ? `Standard-Durchführung mit Fokus auf Kernkomponente „${core}“.`
          : 'Standard-Durchführung gemäß Methodenprofil.',
        source: 'fmt-regel'
      });
      continue;
    }

    if (g.personaId || (g.matrixValues && Object.keys(g.matrixValues).length > 0)) {
      const scored = scoreDifferentiationMatrix({
        personaId: g.personaId,
        selectedValues: g.matrixValues,
        maxTechnik: constraints?.maxTechnik || undefined,
        ohneInternet: constraints?.ohneInternet,
        ohneKI: constraints?.ohneKI,
        limit: 4
      });
      if (scored.topRecommendations.length > 0) {
        const topRecs = scored.topRecommendations.slice(0, 2);
        const impulseText = topRecs
          .map((r) => `${r.name}: ${r.meta.umsetzungsimpuls}`)
          .join(' ');
        const extra =
          g.focus === 'basis' && b.anleitung.includes('offen')
            ? ' Bei offener Methode zusätzlich Hilfekarten bereithalten.'
            : g.focus === 'vertiefung' && (adapt.has('diff-inhalt') || adapt.has('diff-tempo'))
              ? ' Transfer- oder Erweiterungsimpuls ohne Leerlauf bereithalten.'
              : '';
        hints.push({
          groupId: g.id,
          groupLabel: g.label,
          measure: `${impulseText}${extra}`,
          source: 'matrix'
        });
        continue;
      }
    }

    if (g.focus === 'basis' || g.focus === 'sprachsensibel') {
      const parts: string[] = [];
      if (b.anleitung.includes('offen')) {
        parts.push('Gestufte Hilfekarten / Lösungsanfang bereitstellen (geringes Vorwissen entlasten).');
      } else {
        parts.push('Satzstarter, Fachbegriffs-Karten und ein ausgearbeitetes Musterbeispiel zur Orientierung geben.');
      }
      if (b.variante?.[0]) parts.push(`Variante: ${b.variante[0]}.`);
      hints.push({ groupId: g.id, groupLabel: g.label, measure: parts.join(' '), source: 'fmt-regel' });
    } else if (g.focus === 'vertiefung') {
      const parts: string[] = [];
      if (adapt.has('diff-inhalt') || adapt.has('diff-tempo')) {
        parts.push('Weiterführende Transfer- oder Gegenbeispiel-Aufgabe für schnellere Lernende bereithalten.');
      } else if (b.interaktion.includes('partner') || b.interaktion.includes('kleingruppe')) {
        parts.push('Als Peer-Coach / Rückmelder mit Kriterienraster einsetzen oder eigene Kontrollaufgabe entwerfen lassen.');
      } else {
        parts.push('Zusatzimpuls: Verfahren begründen, auf neuen Kontext übertragen oder typische Fehlerquelle analysieren.');
      }
      hints.push({ groupId: g.id, groupLabel: g.label, measure: parts.join(' '), source: 'fmt-regel' });
    } else {
      hints.push({
        groupId: g.id,
        groupLabel: g.label,
        measure: `Anpassung für ${g.label}: ${g.profile || 'Zeit-, Hilfe- oder Sozialform-Anpassung vorsehen.'}`,
        source: 'fmt-regel'
      });
    }
  }
  return hints;
}

export function buildScenarioRows(
  arrangement: Arrangement,
  bundle: CatalogBundle,
  blocksById: Map<string, Baustein>,
  labelOf: (schemeId: string, code: string) => string,
  groups: LearnerGroup[],
  aiDiffByStep: Record<string, StepDiffSuggestion[]>,
  oerByStep: Record<string, OerResource[]>,
  baseUrl = '',
  subgroupMethodsMap: SubgroupMethodMap = {},
  generatedMaterials: GeneratedMaterialItem[] = []
): ScenarioPhaseRow[] {
  const { seq } = getMainSequence(arrangement);
  const kette = arrangement.zieltyp ? bundle.ketten.find((k) => k.id === arrangement.zieltyp) : null;
  const rows: ScenarioPhaseRow[] = [];
  const mainSteps = seq.teile.filter((t) => t && t.typ !== 'Wiederkehr');

  const gradeOf = (b?: Baustein): string | null => {
    if (!b?.evidenz?.length) return null;
    if (b.evidenz.some((e) => e.grad === 'A')) return 'A';
    if (b.evidenz.some((e) => e.grad === 'B')) return 'B';
    return 'C';
  };

  const resolveSubgroupMethods = (stepKey: string) => {
    const raw = subgroupMethodsMap[stepKey] || {};
    const out: Record<string, { methodId: string; methodName: string; methodUrl: string }> = {};
    for (const [gid, mid] of Object.entries(raw)) {
      if (!mid) continue;
      const mb = blocksById.get(mid);
      out[gid] = {
        methodId: mid,
        methodName: mb?.name || mid,
        methodUrl: `${baseUrl}/methoden/${mid}`
      };
    }
    return out;
  };

  const makeRow = (
    key: string,
    orderLabel: string,
    stepIndex: number,
    phaseLabel: string,
    node: EinsatzNode,
    isNestedSlot: boolean,
    slotKennung?: string,
    parentName?: string,
    chainRole?: string,
    chainCheck?: boolean,
    chainStepId?: string
  ): ScenarioPhaseRow => {
    const b = blocksById.get(node.baustein);
    const social = (b?.interaktion || []).map((x) => labelOf('interaktion', x)).join(', ') || '–';
    const room = b?.raumhinweis || ((b?.raumzeit || []).map((x) => labelOf('raumzeit', x)).join(', ') || 'Klassenraum');
    const tech = b?.technik ? labelOf('technikbedarf', b.technik) : '';
    const diff = aiDiffByStep[key]?.length ? aiDiffByStep[key] : buildDeterministicDiffHints(b, groups);
    return {
      key,
      orderLabel,
      stepIndex,
      slotKennung,
      isNestedSlot,
      parentName,
      phaseLabel,
      durationMin: node.dauerMin ?? b?.dauerMin ?? 15,
      orientationRange: b ? `${b.dauerMin}–${b.dauerMax} min` : undefined,
      methodId: node.baustein,
      methodName: b?.name || node.baustein,
      methodRange: (b?.reichweite || '').toUpperCase(),
      methodUrl: `${baseUrl}/methoden/${node.baustein}`,
      evidenceGrade: gradeOf(b),
      ...(evidenzBezugBeiGrad(b, gradeOf(b)).length ? { evidenceBezug: evidenzBezugBeiGrad(b, gradeOf(b)) } : {}),
      teacherRole: b ? summarizeTeacherRole(b, labelOf) : 'Moderation',
      learnerRole: b ? summarizeLearnerRole(b, labelOf) : 'Bearbeitung',
      socialForm: social,
      environment: tech ? `${room} (${tech})` : room,
      materials: b?.material || [],
      differentiation: diff,
      subgroupMethods: resolveSubgroupMethods(key),
      oerResources: safeOerList(oerByStep[key]),
      generatedMaterials: generatedMaterials.filter((m) => m.stepKey === key),
      block: b,
      ...(chainRole ? { chainRole } : {}),
      ...(chainCheck ? { chainCheck } : {}),
      ...(chainStepId ? { chainStep: chainStepId } : {})
    };
  };

  mainSteps.forEach((node: ArrangementNode, visIdx: number) => {
    const realIdx = seq.teile.indexOf(node);
    const chainStep = node.kettenschritt && kette ? kette.schritte.find((s) => s.id === node.kettenschritt) : null;
    const phaseLabel = chainStep ? `${chainStep.id.toUpperCase()} · ${chainStep.label}` : `Phase ${visIdx + 1}`;
    const check = istPruefschritt(kette, node.kettenschritt);

    if (node.typ === 'Einsatz') {
      const parentBlock = blocksById.get(node.baustein);
      rows.push(makeRow(`step-${realIdx}`, `${visIdx + 1}`, realIdx, phaseLabel, node, false, undefined, undefined, chainStep?.rolle, check, chainStep?.id));
      (node.belegung || []).forEach((bel, si) => {
        if (bel.inhalt.typ === 'Einsatz') {
          const sl = parentBlock?.slot?.find((s) => s.kennung === bel.slotKennung);
          rows.push(
            makeRow(
              `step-${realIdx}-slot-${bel.slotKennung}`,
              `${visIdx + 1}.${si + 1}`,
              realIdx,
              `↳ Slot „${sl?.name || bel.slotKennung}“`,
              bel.inhalt,
              true,
              bel.slotKennung,
              parentBlock?.name || node.baustein
            )
          );
        }
      });
    } else if (node.typ === 'Alternative') {
      (node.optionen || []).forEach((opt, oi) => {
        if (opt.typ === 'Einsatz') {
          rows.push(
            makeRow(
              `step-${realIdx}-alt-${oi}`,
              `${visIdx + 1}${String.fromCharCode(97 + oi)}`,
              realIdx,
              `${phaseLabel} · Zweig ${oi + 1} (${node.kriterium || 'Differenzierung'})`,
              opt,
              false,
              undefined,
              undefined,
              chainStep?.rolle,
              check,
              chainStep?.id
            )
          );
        }
      });
    }
  });

  if (arrangement.ablauf.typ === 'Parallel' && Array.isArray(arrangement.ablauf.begleitend)) {
    arrangement.ablauf.begleitend.forEach((n, bi) => {
      if (n.typ === 'Einsatz') {
        rows.push(makeRow(`parallel-${bi}`, '═', -1, 'Begleitstrang (Parallel)', n, false));
      }
    });
  }

  const wk = seq.teile.find((t) => t.typ === 'Wiederkehr');
  if (wk && wk.typ === 'Wiederkehr') {
    const b = blocksById.get(wk.baustein);
    rows.push({
      key: 'wiederkehr',
      orderLabel: '◆',
      stepIndex: seq.teile.indexOf(wk),
      isNestedSlot: false,
      phaseLabel: wk.ausserhalbBudget
        ? `Verteilte Wiederkehr in Folgestunden (${wk.anzahl}× je ${wk.dauerMin ?? b?.dauerMin ?? 6} min, Abstand ${wk.abstand || 'P2D'})`
        : `Verteilte Wiederkehr (${wk.anzahl}×, Abstand ${wk.abstand || 'P2D'})`,
      durationMin: wk.ausserhalbBudget ? 0 : (wk.dauerMin ?? b?.dauerMin ?? 6) * wk.anzahl,
      orientationRange: b ? `je ${b.dauerMin}–${b.dauerMax} min` : undefined,
      methodId: wk.baustein,
      methodName: b?.name || wk.baustein,
      methodRange: (b?.reichweite || 'r1').toUpperCase(),
      methodUrl: `${baseUrl}/methoden/${wk.baustein}`,
      evidenceGrade: gradeOf(b),
      ...(evidenzBezugBeiGrad(b, gradeOf(b)).length ? { evidenceBezug: evidenzBezugBeiGrad(b, gradeOf(b)) } : {}),
      teacherRole: 'Verteilte Abruftermine ansetzen und kurz auswerten',
      learnerRole: b ? summarizeLearnerRole(b, labelOf) : 'Wiederholter Abruf',
      socialForm: (b?.interaktion || []).map((x) => labelOf('interaktion', x)).join(', ') || 'Einzelarbeit',
      environment: b?.raumhinweis || 'Klassenraum',
      materials: b?.material || [],
      differentiation: aiDiffByStep['wiederkehr']?.length ? aiDiffByStep['wiederkehr'] : buildDeterministicDiffHints(b, groups),
      subgroupMethods: resolveSubgroupMethods('wiederkehr'),
      oerResources: safeOerList(oerByStep['wiederkehr']),
      generatedMaterials: generatedMaterials.filter((m) => m.stepKey === 'wiederkehr'),
      block: b
    });
  }

  return rows;
}

/**
 * Builds an editable, topic-adapted thematic table for Step 4 & all exports,
 * weaving together Fach/Thema, linked FMT methods, subgroup alternative methods,
 * matrix/AI differentiation, generated materials, and WLO-OERs (with explicit wwwurl!).
 */
export function buildDefaultThematicRows(
  rows: ScenarioPhaseRow[],
  groups: LearnerGroup[],
  fach: string,
  thema: string
): ThematicPhaseRow[] {
  const topicLabel = thema.trim()
    ? fach.trim()
      ? `${fach.trim()} („${thema.trim()}“)`
      : `„${thema.trim()}“`
    : fach.trim() || 'Unterrichtsthema';
  const activeGroups = groups.filter((g) => g.active);

  return rows.map((r) => {
    const groupAdaptations: Record<string, string> = {};
    for (const g of activeGroups) {
      const alt = r.subgroupMethods[g.id];
      const diff = r.differentiation.find((d) => d.groupId === g.id);
      if (alt) {
        groupAdaptations[g.id] = `Eigene Methode: ${alt.methodName} zu ${topicLabel}${diff ? ` · ${diff.measure}` : ''}`;
      } else if (diff) {
        groupAdaptations[g.id] = diff.measure;
      } else {
        groupAdaptations[g.id] = `Bearbeitet ${topicLabel} im Rahmen von ${r.methodName}.`;
      }
    }

    const matParts: string[] = [];
    if (r.generatedMaterials.length) {
      matParts.push(r.generatedMaterials.map((m) => `Erstelltes Material: ${m.title}`).join(' · '));
    }
    if (r.oerResources.length) {
      matParts.push(
        r.oerResources
          .map((o) => {
            const href = getOerWwwUrl(o);
            return `WLO-OER: ${o.title} (${href})${o.note ? ` – ${o.note}` : ''}`;
          })
          .join(' · ')
      );
    }
    if (!matParts.length && r.materials.length) {
      matParts.push(r.materials.slice(0, 3).join(', '));
    }

    const stepsSummary = (r.block?.durchfuehrung || []).length
      ? r.block!.durchfuehrung.map((s, i) => `${i + 1}. ${s}`).join(' ')
      : r.block?.kurzbeschreibung || `Durchführung gemäß Methodenprofil ${r.methodName}.`;
    const coreNote = r.block?.kernkomponente?.[0]?.name ? ` (Kernkomponente: ${r.block.kernkomponente[0].name})` : '';

    return {
      key: r.key,
      orderLabel: r.orderLabel,
      phaseLabel: r.phaseLabel,
      durationMin: r.durationMin,
      methodId: r.methodId,
      methodName: r.methodName,
      methodProcedure: `Methode ${r.methodName} angewendet auf ${topicLabel}: ${stepsSummary}${coreNote}`,
      teacherAction: `Leitet ${r.methodName} zu ${topicLabel} an: ${r.teacherRole}`,
      learnerAction: `Erarbeiten ${topicLabel} via ${r.methodName}: ${r.learnerRole}`,
      groupAdaptations,
      materialsAndOer: matParts.join(' | ') || 'Standardmaterial'
    };
  });
}

/** What the draft needs beyond the plan rows. Without `planungsprofile` no draft is built (old callers). */
export interface EntwurfMeta {
  planungsprofile?: PlanungsprofileRegelsatz;
  /** Profile id from the core answer (`planungsprofil`); otherwise it follows from the Bildungsstufe. */
  planungsprofil?: string;
  /** The core answer assumed the profile (listed under pflichtangaben.angenommen). */
  planungsprofilAngenommen?: boolean;
  /** Room of the lesson as label. */
  raum?: string;
  anzahl?: number;
  /** Larger unit the lesson belongs to (free text). */
  einheit?: string;
  /** Form of proof as label. */
  nachweis?: string;
  /** Whether the lesson is graded; absent when not stated (the draft then says nothing about it). */
  bewertet?: boolean;
  /** Main goal as label when no learning objectives are written (e.g. the goal kind). */
  hauptziel?: string;
  begleitziele?: string[];
  /** Accompanying strand the plan proposes and the teacher has not taken into the flow (labels, D3). */
  begleitstrang?: Array<{ begleitziel: string; methode: string; dauerMin: number; baustein?: string }>;
  /** Rule messages of the plan for the field "Reflexion und Evaluation" (listed with rule, effect and basis). */
  regelmeldungen?: Regelmeldung[];
  /** Fit rules of the catalogue, for the readable rule names. */
  regeln?: Passungsregel[];
}

interface LessonTextMeta extends EntwurfMeta {
  fach: string;
  thema: string;
  didaktischerAnsatz?: string;
  lehrkraefteInfo?: string;
  lernziele?: string;
  problemstellung?: string;
  hinweise?: string;
  totalDurationMin: number;
  labelOf: (s: string, c: string) => string;
}

/** Column names for the activities in the lesson plan, in the terms of the planning profile ("Tätigkeit der Kursleitung"). */
export function entwurfSpalten(meta: EntwurfMeta, bildungsstufe?: string): { lehrende: string; lernende: string } | undefined {
  return entwurfBegriffe(meta, bildungsstufe)?.spalten;
}

/** Terms of the planning profile for the exports: persons and activity columns. */
export function entwurfBegriffe(
  meta: EntwurfMeta,
  bildungsstufe?: string
): { lehrende: string; lernende: string; spalten: { lehrende: string; lernende: string } } | undefined {
  const profile = meta.planungsprofile?.profile || [];
  if (!profile.length) return undefined;
  const profil =
    (meta.planungsprofil && profile.find((p) => p.id === meta.planungsprofil)) || waehlePlanungsprofil(profile, { bildungsstufe }).profil;
  const b = profilBegriffe(profil);
  return { lehrende: b.lehrende, lernende: b.lernende, spalten: { lehrende: b.taetigkeitLehrende, lernende: b.taetigkeitLernende } };
}

/** Default staffing text of step 1; only the school profile keeps it, other profiles show their own term instead. */
const STANDARD_LEHRKRAEFTE = '1 Lehrkraft';

/** Staffing line for headings and exports: the untouched default "1 Lehrkraft" is dropped outside the school terms. */
export function lehrendeInfo(lehrkraefteInfo: string | undefined, meta: EntwurfMeta, bildungsstufe?: string): string | undefined {
  const t = lehrkraefteInfo?.trim();
  if (!t) return undefined;
  const b = entwurfBegriffe(meta, bildungsstufe);
  return t === STANDARD_LEHRKRAEFTE && b && b.lehrende !== 'Lehrkraft' ? undefined : t;
}

/** Adaptations per subgroup already decided in the plan: own method, differentiation measures, helps taken over in step 3. */
function anpassungenJeGruppe(r: ScenarioPhaseRow, groups: LearnerGroup[]): Array<{ gruppe: string; text: string }> {
  const out: Array<{ gruppe: string; text: string }> = [];
  for (const g of groups.filter((x) => x.active && !isRegularGroupId(x.id))) {
    const parts: string[] = [];
    const alt = r.subgroupMethods[g.id];
    if (alt) parts.push(`Eigene Methode: ${alt.methodName}`);
    for (const d of r.differentiation.filter((x) => x.groupId === g.id)) parts.push(d.measure);
    for (const m of r.generatedMaterials.filter((x) => x.groupId === g.id && x.materialType === 'hilfe')) parts.push(`Hilfe „${m.title}“`);
    if (parts.length) out.push({ gruppe: g.label, text: parts.join('; ') });
  }
  return out;
}

/**
 * Draft with the seven core fields and the terms and modules of the planning profile (Paket D).
 * Null when the caller passes no planning profiles.
 */
export function buildScenarioEntwurf(
  arrangement: Arrangement,
  rows: ScenarioPhaseRow[],
  thematicRows: ThematicPhaseRow[],
  groups: LearnerGroup[],
  meta: LessonTextMeta
): Entwurf | null {
  const regelsatz = meta.planungsprofile;
  if (!regelsatz?.profile?.length) return null;
  const k = arrangement.kontext || {};
  const stated = meta.planungsprofil ? regelsatz.profile.find((p) => p.id === meta.planungsprofil) : undefined;
  const wahl = stated
    ? { profil: stated, angenommen: Boolean(meta.planungsprofilAngenommen) }
    : waehlePlanungsprofil(regelsatz.profile, { bildungsstufe: k.bildungsstufe });
  const byKey = new Map(thematicRows.map((t) => [t.key, t]));
  const activeGroups = groups.filter((g) => g.active);
  const teilgruppen = activeGroups.filter((g) => !isRegularGroupId(g.id));
  const totalLearners = activeGroups.reduce((s, g) => s + (g.count || 0), 0);
  const phasen: EntwurfPhase[] = rows.map((r) => {
    const tr = byKey.get(r.key);
    const medien = [
      ...r.generatedMaterials.filter((m) => m.materialType !== 'hilfe').map((m) => m.title),
      ...r.oerResources.map((o) => o.title),
      ...r.materials.slice(0, 3)
    ];
    return {
      zeitMin: r.durationMin,
      phase: r.phaseLabel,
      methode: r.methodName,
      sozialform: r.socialForm !== '–' ? r.socialForm : undefined,
      medien: medien.join(', ') || undefined,
      lehrende: tr?.teacherAction || r.teacherRole,
      lernende: tr?.learnerAction || r.learnerRole,
      schrittRolle: r.chainRole,
      pruefschritt: r.chainCheck,
      wiederkehr: r.key === 'wiederkehr',
      begleitend: r.key.startsWith('parallel-'),
      anpassungen: anpassungenJeGruppe(r, groups)
    };
  });
  return baueEntwurf(regelsatz, {
    profil: wahl.profil,
    profilAngenommen: wahl.angenommen,
    titel: meta.thema ? `${meta.thema} (${arrangement.name})` : arrangement.name,
    fach: meta.fach,
    thema: meta.thema,
    dauerMin: meta.totalDurationMin,
    raum: meta.raum,
    bildungsstufe: k.bildungsstufe ? meta.labelOf('bildungsstufe', k.bildungsstufe) : undefined,
    anzahl: meta.anzahl || totalLearners || undefined,
    vorwissen: k.vorwissen ? meta.labelOf('vorwissen', k.vorwissen) : undefined,
    sprachniveau: k.sprachniveau ? meta.labelOf('sprachniveau', k.sprachniveau) : undefined,
    teilgruppen: teilgruppen.map((g) => ({ name: g.label, anzahl: g.count, beschreibung: g.profile || undefined })),
    ausgangslage: meta.problemstellung,
    hauptziel: meta.lernziele?.trim() || meta.hauptziel,
    begleitziele: meta.begleitziele,
    begleitstrang: meta.begleitstrang?.map((s) => ({ begleitziel: s.begleitziel, methode: s.methode, dauerMin: s.dauerMin })),
    einheit: meta.einheit,
    phasen,
    nachweis: meta.nachweis,
    bewertet: meta.bewertet,
    hinweise: meta.hinweise?.trim() ? [meta.hinweise.trim()] : [],
    ...(meta.regelmeldungen?.length ? { regelmeldungen: regelmeldungenFuerEntwurf(meta.regelmeldungen, meta.regeln) } : {})
  });
}

/** Phase-by-phase procedure (method steps on the topic, roles in the profile's terms, groups, OER, materials). */
function phaseDetailLines(
  rows: ScenarioPhaseRow[],
  thematicRows: ThematicPhaseRow[],
  groups: LearnerGroup[],
  spalten: { lehrende: string; lernende: string }
): string[] {
  const activeGroups = groups.filter((g) => g.active);
  const byKey = new Map(thematicRows.map((t) => [t.key, t]));
  const lines: string[] = [];
  for (const r of rows) {
    const tr = byKey.get(r.key);
    lines.push('', `#### ${r.orderLabel}. ${r.phaseLabel} – ${r.methodName} (${r.durationMin} min, ${r.methodRange})`);
    if (tr?.methodProcedure) lines.push(`**Methodisches Vorgehen:** ${tr.methodProcedure}`);
    else if (r.block?.kurzbeschreibung) lines.push(r.block.kurzbeschreibung);
    lines.push(`- **${spalten.lehrende}:** ${tr?.teacherAction || r.teacherRole}`);
    lines.push(`- **${spalten.lernende} (${r.socialForm}):** ${tr?.learnerAction || r.learnerRole}`);
    if (activeGroups.length) {
      const notes = activeGroups
        .map((g) => {
          const val = tr?.groupAdaptations?.[g.id] || r.differentiation.find((d) => d.groupId === g.id)?.measure;
          return val ? `${g.label}: ${val}` : '';
        })
        .filter(Boolean);
      if (notes.length) lines.push(`- **Binnendifferenzierung:** ${notes.join(' | ')}`);
    }
    if (r.oerResources.length) {
      lines.push(
        `- **Eingebundene WLO-OER:** ${r.oerResources
          .map((o) => `[${o.title}](${getOerWwwUrl(o)}) (\`${getOerWwwUrl(o)}\`)${o.note ? ` – ${o.note}` : ''}`)
          .join(' · ')}`
      );
    }
    if (r.generatedMaterials.length) lines.push(`- **Erstellte Materialien:** ${r.generatedMaterials.map((m) => m.title).join(', ')}`);
    if (r.block?.kernkomponente?.length) {
      lines.push(
        `- **Kernkomponenten & Qualitätsrisiko:** ${r.block.kernkomponente.map((k) => k.name).join('; ')}${
          r.block.qualitaetsrisiko?.[0] ? ` · Achtung: ${r.block.qualitaetsrisiko[0]}` : ''
        }`
      );
    }
  }
  return lines;
}

/**
 * Generates a complete, printable structured German lesson draft without an LLM: the seven core fields with the
 * terms and modules of the planning profile, the phase-by-phase procedure after the lesson plan.
 * Without planning profiles (old callers) the former text is built.
 */
export function buildStructuredLessonText(
  arrangement: Arrangement,
  rows: ScenarioPhaseRow[],
  thematicRows: ThematicPhaseRow[],
  groups: LearnerGroup[],
  meta: LessonTextMeta
): string {
  const entwurf = buildScenarioEntwurf(arrangement, rows, thematicRows, groups, meta);
  if (!entwurf) return buildLegacyLessonText(arrangement, rows, thematicRows, groups, meta);
  const head = `## ${entwurf.planungsprofil.dokument}: ${meta.fach ? `${meta.fach} – ` : ''}${meta.thema || arrangement.name}`;
  const detail = ['#### Durchführung Phase für Phase', ...phaseDetailLines(rows, thematicRows, groups, entwurf.spalten)].join('\n');
  return [head, '', entwurfMarkdown(entwurf, 3, { verlauf: detail })].join('\n');
}

/** Lesson text of callers that pass no planning profiles (kept so old callers keep working). */
function buildLegacyLessonText(
  arrangement: Arrangement,
  rows: ScenarioPhaseRow[],
  thematicRows: ThematicPhaseRow[],
  groups: LearnerGroup[],
  meta: {
    fach: string;
    thema: string;
    didaktischerAnsatz?: string;
    lehrkraefteInfo?: string;
    lernziele?: string;
    problemstellung?: string;
    hinweise?: string;
    totalDurationMin: number;
    labelOf: (s: string, c: string) => string;
  }
): string {
  const activeGroups = groups.filter((g) => g.active);
  const totalLearners = activeGroups.reduce((s, g) => s + (g.count || 0), 0);
  const byKey = new Map(thematicRows.map((t) => [t.key, t]));
  const lines: string[] = [];

  lines.push(`### 1. Didaktischer Steckbrief & Rahmenbedingungen`);
  lines.push(
    `- **Fach & Thema:** ${meta.fach || 'Unterricht'} – ${meta.thema || arrangement.name}` +
      ` · **Dauer:** ${meta.totalDurationMin} min` +
      (arrangement.kontext?.zeitbudgetMin ? ` (Budget: ${arrangement.kontext.zeitbudgetMin} min)` : '')
  );
  lines.push(
    `- **Zielgruppe & Voraussetzungen:** ${
      arrangement.kontext?.bildungsstufe ? meta.labelOf('bildungsstufe', arrangement.kontext.bildungsstufe) : 'nicht angegeben'
    } · Vorwissen: ${
      arrangement.kontext?.vorwissen ? meta.labelOf('vorwissen', arrangement.kontext.vorwissen) : 'nicht angegeben'
    }` +
      ` · Lehrkraft: ${meta.lehrkraefteInfo || '1 Lehrkraft'}` +
      (totalLearners > 0 ? ` · ${totalLearners} Lernende gesamt` : '')
  );
  if (meta.didaktischerAnsatz) {
    lines.push(`- **Didaktischer Ansatz & Ablaufmodell:** ${meta.didaktischerAnsatz} (Kette: ${arrangement.zieltyp || 'Freier Ablauf'})`);
  }
  if (activeGroups.length) {
    lines.push(
      `- **Aktive Lerngruppen (Binnendifferenzierung):** ${activeGroups
        .map((g) => `${g.label}${g.count ? ` (${g.count} Pers.)` : ''}`)
        .join(' · ')}`
    );
  }
  if (meta.lernziele?.trim()) {
    lines.push('', '### 2. Lernziele', meta.lernziele.trim());
  }
  if (meta.problemstellung?.trim()) {
    lines.push('', '### Didaktische Ausgangslage & typische Hürden', meta.problemstellung.trim());
  }
  if (meta.hinweise?.trim()) {
    lines.push('', `**Besondere Hinweise:** ${meta.hinweise.trim()}`);
  }

  lines.push('', '### 3. Methodische Durchführung Phase für Phase (angepasst auf Thema, Gruppen & Materialien)');
  for (const r of rows) {
    const tr = byKey.get(r.key);
    lines.push('', `#### ${r.orderLabel}. ${r.phaseLabel} – ${r.methodName} (${r.durationMin} min, ${r.methodRange})`);
    if (tr?.methodProcedure) {
      lines.push(`**Methodisches Vorgehen:** ${tr.methodProcedure}`);
    } else if (r.block?.kurzbeschreibung) {
      lines.push(r.block.kurzbeschreibung);
    }
    lines.push(`- **Lehrkraft (${meta.lehrkraefteInfo || 'Lehrkraft'}):** ${tr?.teacherAction || r.teacherRole}`);
    lines.push(`- **Lernende (${r.socialForm}):** ${tr?.learnerAction || r.learnerRole}`);
    if (Object.keys(r.subgroupMethods).length > 0) {
      lines.push(
        `- **Parallele Teilgruppen-Methoden:** ${Object.entries(r.subgroupMethods)
          .map(([gid, sm]) => `${groups.find((g) => g.id === gid)?.label || gid}: ${sm.methodName}`)
          .join(' · ')}`
      );
    }
    if (activeGroups.length) {
      const groupNotes = activeGroups
        .map((g) => {
          const val = tr?.groupAdaptations?.[g.id] || r.differentiation.find((d) => d.groupId === g.id)?.measure;
          return val ? `${g.label}: ${val}` : '';
        })
        .filter(Boolean);
      if (groupNotes.length) lines.push(`- **Binnendifferenzierung:** ${groupNotes.join(' | ')}`);
    }
    if (r.oerResources.length > 0) {
      lines.push(
        `- **Eingebundene WLO-OER:** ${r.oerResources
          .map((o) => `[${o.title}](${getOerWwwUrl(o)}) (\`${getOerWwwUrl(o)}\`)${o.note ? ` – ${o.note}` : ''}`)
          .join(' · ')}`
      );
    }
    if (r.generatedMaterials.length > 0) {
      lines.push(`- **Erstellte Materialien:** ${r.generatedMaterials.map((m) => m.title).join(', ')}`);
    }
    if (r.block?.kernkomponente?.length) {
      lines.push(`- **Kernkomponenten & Qualitätsrisiko:** ${r.block.kernkomponente.map((k) => k.name).join('; ')}${r.block.qualitaetsrisiko?.[0] ? ` · Achtung: ${r.block.qualitaetsrisiko[0]}` : ''}`);
    }
  }

  return lines.join('\n');
}

/**
 * IMS-LD-inspired Neutral Learning Scenario linking didactic sequence,
 * actors (with counts & matrix personas), differentiation, subgroup alternative methods,
 * generated materials, WLO-OER resources (with explicit wwwurl), and canonical FMT methods.
 */
export interface NeutralLearningScenario {
  '@type': 'NeutralLearningScenario';
  schemaVersion: '1.5-fmt-imsld';
  license: string;
  metadata: {
    title: string;
    subject: string;
    topic: string;
    didacticApproach?: string;
    teachersAndStaff?: string;
    totalLearners?: number;
    learningObjectives?: string;
    problemStatement?: string;
    notes?: string;
    educationalLevel: string;
    priorKnowledge: string;
    granularity: string;
    chain: string;
    totalDurationMin: number;
    timeBudgetMin?: number;
    createdAt: string;
  };
  actors: Array<{
    id: string;
    name: string;
    type: 'Lehrkraft' | 'Lerngruppe';
    count?: number;
    personaId?: string;
    profile: string;
  }>;
  learning_sequences: Array<{
    sequence_id: string;
    sequence_name: string;
    phases: Array<{
      phase_id: string;
      order: string;
      phase_name: string;
      nested_in?: string;
      duration_min: number;
      orientation_range?: string;
      fmt_method: {
        kennung: string;
        name: string;
        reichweite: string;
        database_url: string;
        evidence_grade: string | null;
        lernfunktion: string[];
        anleitung: string[];
        engagement: string[];
        adaptivitaet: string[];
        durchfuehrung: string[];
        kernkomponenten: string[];
        quellen: Array<{ titel: string; url?: string; lizenz?: string }>;
      };
      subgroup_alternative_methods?: Record<string, { methodId: string; methodName: string; methodUrl: string }>;
      roles: {
        lehrkraft: string;
        lernende: string;
        sozialform: string;
      };
      thematic_application?: ThematicPhaseRow;
      environment: {
        raum_und_technik: string;
        materialien: string[];
        generated_materials: Array<{ title: string; materialType: string; content: string }>;
        oer_ressourcen: Array<OerResource & { wwwurl: string }>;
      };
      differentiation: StepDiffSuggestion[];
    }>;
  }>;
  generated_content: {
    narrative_lesson_plan_markdown: string;
    narrative_source: 'ki' | 'strukturiert';
    thematic_table: ThematicPhaseRow[];
    generated_materials: Array<{
      id: string;
      step_key: string;
      title: string;
      material_type: string;
      content_markdown: string;
      created_at: string;
    }>;
    differentiation_matrix_results: Array<{
      group_id: string;
      group_label: string;
      count?: number;
      persona_id?: string;
      top_measures: Array<{ id: string; name: string; score: number }>;
    }>;
  };
  fmt_arrangement: Arrangement;
  /** Planning profile of the draft with the column names of the lesson plan (absent for callers without profiles). */
  planungsprofil?: Entwurf['planungsprofil'] & { spalten: Entwurf['spalten'] };
  /** The seven core fields in fixed order, each with title and content. */
  kernfelder?: Entwurf['kernfelder'];
  /** Modules of the profile, empty to fill in. */
  module?: Entwurf['module'];
}

export function buildNeutralLearningScenario(
  arrangement: Arrangement,
  rows: ScenarioPhaseRow[],
  groups: LearnerGroup[],
  meta: {
    fach: string;
    thema: string;
    didaktischerAnsatz?: string;
    lehrkraefteInfo?: string;
    lernziele?: string;
    problemstellung?: string;
    hinweise?: string;
    totalLearners?: number;
    thematicRows?: ThematicPhaseRow[];
    elaboration?: string | null;
    generatedMaterials?: GeneratedMaterialItem[];
    totalDurationMin: number;
    labelOf: (s: string, c: string) => string;
  } & EntwurfMeta
): NeutralLearningScenario {
  const effThematic = meta.thematicRows?.length
    ? meta.thematicRows
    : buildDefaultThematicRows(rows, groups, meta.fach, meta.thema);
  const thematicByKey = new Map(effThematic.map((t) => [t.key, t]));
  const narrativeMd =
    meta.elaboration && meta.elaboration.trim()
      ? meta.elaboration.trim()
      : buildStructuredLessonText(arrangement, rows, effThematic, groups, meta);
  const allGeneratedMaterials =
    meta.generatedMaterials ?? rows.flatMap((r) => r.generatedMaterials);
  const entwurf = buildScenarioEntwurf(arrangement, rows, effThematic, groups, meta);

  const matrixSummary = groups
    .filter((g) => g.active)
    .map((g) => {
      const scored = scoreDifferentiationMatrix({
        personaId: g.personaId,
        selectedValues: g.matrixValues,
        maxTechnik: (meta as { maxTechnik?: string }).maxTechnik || undefined,
        ohneInternet: (meta as { ohneInternet?: boolean }).ohneInternet,
        ohneKI: (meta as { ohneKI?: boolean }).ohneKI,
        limit: 8
      });
      return {
        group_id: g.id,
        group_label: g.label,
        ...(g.count ? { count: g.count } : {}),
        ...(g.personaId ? { persona_id: g.personaId } : {}),
        top_measures: scored.topRecommendations.map((r) => ({ id: r.id, name: r.name, score: r.score }))
      };
    });

  return {
    '@type': 'NeutralLearningScenario',
    schemaVersion: '1.5-fmt-imsld',
    license: 'https://creativecommons.org/licenses/by/4.0/',
    metadata: {
      title: meta.thema ? `${arrangement.name} – ${meta.thema}` : arrangement.name,
      subject: meta.fach,
      topic: meta.thema,
      ...(meta.didaktischerAnsatz ? { didacticApproach: meta.didaktischerAnsatz } : {}),
      ...(meta.lehrkraefteInfo ? { teachersAndStaff: meta.lehrkraefteInfo } : {}),
      ...(meta.totalLearners ? { totalLearners: meta.totalLearners } : {}),
      ...(meta.lernziele?.trim() ? { learningObjectives: meta.lernziele.trim() } : {}),
      ...(meta.problemstellung?.trim() ? { problemStatement: meta.problemstellung.trim() } : {}),
      ...(meta.hinweise?.trim() ? { notes: meta.hinweise.trim() } : {}),
      educationalLevel: arrangement.kontext?.bildungsstufe
        ? meta.labelOf('bildungsstufe', arrangement.kontext.bildungsstufe)
        : 'nicht angegeben',
      priorKnowledge: arrangement.kontext?.vorwissen
        ? meta.labelOf('vorwissen', arrangement.kontext.vorwissen)
        : 'nicht angegeben',
      granularity: arrangement.reichweite.toUpperCase(),
      chain: arrangement.zieltyp || 'Freier Ablauf',
      totalDurationMin: meta.totalDurationMin,
      timeBudgetMin: arrangement.kontext?.zeitbudgetMin,
      createdAt: new Date().toISOString()
    },
    actors: [
      {
        id: 'actor-lehrkraft',
        name: meta.lehrkraefteInfo || 'Lehrkraft',
        type: 'Lehrkraft',
        profile: 'Planung, Moderation, Scaffolding, Feedback & Sicherung'
      },
      ...groups
        .filter((g) => g.active)
        .map((g) => ({
          id: `actor-${g.id}`,
          name: g.label,
          type: 'Lerngruppe' as const,
          ...(g.count ? { count: g.count } : {}),
          ...(g.personaId ? { personaId: g.personaId } : {}),
          profile: g.profile
        }))
    ],
    learning_sequences: [
      {
        sequence_id: 'seq-main',
        sequence_name: arrangement.name,
        phases: rows.map((r) => ({
          phase_id: r.key,
          order: r.orderLabel,
          phase_name: r.phaseLabel,
          ...(r.parentName ? { nested_in: r.parentName } : {}),
          duration_min: r.durationMin,
          ...(r.orientationRange ? { orientation_range: r.orientationRange } : {}),
          fmt_method: {
            kennung: r.methodId,
            name: r.methodName,
            reichweite: r.methodRange,
            database_url: r.methodUrl,
            evidence_grade: r.evidenceGrade,
            lernfunktion: r.block?.lernfunktion || [],
            anleitung: r.block?.anleitung || [],
            engagement: r.block?.engagement || [],
            adaptivitaet: r.block?.adaptivitaet || [],
            durchfuehrung: r.block?.durchfuehrung || [],
            kernkomponenten: (r.block?.kernkomponente || []).map((k) => k.name),
            quellen: (r.block?.quellen || []).map((q) => ({ titel: q.titel, url: q.url, lizenz: q.lizenz }))
          },
          ...(Object.keys(r.subgroupMethods).length ? { subgroup_alternative_methods: r.subgroupMethods } : {}),
          roles: {
            lehrkraft: r.teacherRole,
            lernende: r.learnerRole,
            sozialform: r.socialForm
          },
          ...(thematicByKey.get(r.key) ? { thematic_application: thematicByKey.get(r.key) } : {}),
          environment: {
            raum_und_technik: r.environment,
            materialien: r.materials,
            generated_materials: r.generatedMaterials.map((m) => ({
              title: m.title,
              materialType: m.materialType,
              content: m.content
            })),
            oer_ressourcen: r.oerResources.map((o) => ({ ...o, wwwurl: getOerWwwUrl(o) }))
          },
          differentiation: r.differentiation
        }))
      }
    ],
    generated_content: {
      narrative_lesson_plan_markdown: narrativeMd,
      narrative_source: meta.elaboration && meta.elaboration.trim() ? 'ki' : 'strukturiert',
      thematic_table: effThematic,
      generated_materials: allGeneratedMaterials.map((m) => ({
        id: m.id,
        step_key: m.stepKey,
        title: m.title,
        material_type: m.materialType,
        content_markdown: m.content,
        created_at: m.createdAt
      })),
      differentiation_matrix_results: matrixSummary
    },
    fmt_arrangement: arrangement,
    ...(entwurf
      ? { planungsprofil: { ...entwurf.planungsprofil, spalten: entwurf.spalten }, kernfelder: entwurf.kernfelder, module: entwurf.module }
      : {})
  };
}
