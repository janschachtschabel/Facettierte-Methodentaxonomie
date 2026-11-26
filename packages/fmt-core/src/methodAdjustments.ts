import type { Baustein } from './types.js';
import { scoreDifferentiationMatrix, scoreMethodForGroup, suggestAlternativeMethodsForGroup } from './differentiationMatrix.js';

export interface MethodAdjustmentPhase {
  key: string;
  label?: string;
  block?: Baustein;
  durationMin?: number;
  /** Container methods with filled slots and accompanying strands keep their method for everyone. */
  locked?: boolean;
}

export interface MethodAdjustmentGroup {
  id: string;
  label: string;
  /** The main group keeps the plan as it is; only the other groups get parallel methods. */
  isMain?: boolean;
  personaId?: string;
  selectedValues?: Record<string, string>;
}

export interface MethodAdjustmentConstraints {
  maxTechnik?: string;
  ohneInternet?: boolean;
  ohneKI?: boolean;
  bildungsstufe?: string;
  /** Subject area of the plan; methods marked unsuitable for it are never proposed. */
  fachbereich?: string;
}

export interface MethodAdjustment {
  stepKey: string;
  phaseLabel: string;
  groupId: string;
  groupLabel: string;
  vonKennung: string;
  vonName: string;
  zuKennung: string;
  zuName: string;
  grund: string;
}

/** Subgroups can only be checked when a persona or matrix values describe their needs. */
export function hasAdjustmentProfile(g: Pick<MethodAdjustmentGroup, 'personaId' | 'selectedValues'>): boolean {
  return Boolean(g.personaId) || Object.keys(g.selectedValues || {}).length > 0;
}

/** A method counts as a weak fit for a group below this value; guidance alone already gives 4. */
const WEAK_FIT = 4;
/** The alternative has to be clearly better, otherwise the plan stays as it is. */
const MIN_GAIN = 3;

const TECH_RANK: Record<string, number> = { 't-keine': 0, 't-projektion': 1, 't-geteilt': 2, 't-einzeln': 3, 't-spezial': 4 };
const AI_ROLES = new Set(['tutor', 'dialogpartner', 'simulationsrolle', 'belehrbarer-agent', 'antwortgeber']);
const usesAi = (b: Baustein) => Boolean(b.ki) || (b.rolle || []).some((r) => AI_ROLES.has(r));

/**
 * A parallel method must not ask for more than the method it replaces: no extra devices, internet or AI,
 * no method the subject area rules out, and no fully open method for a group that needs support.
 */
function staysWithinFrame(
  candidate: Baustein,
  current: Baustein,
  needsScaffolding: boolean,
  constraints: MethodAdjustmentConstraints
): boolean {
  // Relative to the replaced method, also when a general technology limit is set (that limit applies on top).
  if ((TECH_RANK[candidate.technik] ?? 0) > Math.max(TECH_RANK[current.technik] ?? 0, 1)) return false;
  if (candidate.internet && !current.internet) return false;
  if (usesAi(candidate) && !usesAi(current)) return false;
  if (constraints.fachbereich && (candidate.fachbereichUngeeignet || []).includes(constraints.fachbereich)) return false;
  if (needsScaffolding && !candidate.anleitung.some((a) => a === 'explizit' || a === 'geleitet')) return false;
  return true;
}

const GUIDANCE_REASON: Record<string, string> = {
  explizit: 'führt klar angeleitet Schritt für Schritt',
  geleitet: 'leitet an und lässt Spielraum',
  offen: 'lässt mehr Freiraum für eigene Wege'
};

/** Reason in plain words for teachers, without facet codes. */
function plainReason(
  b: Baustein,
  profile: { preferredGuidance: string; needsScaffolding: boolean; benefitsFromEnrichment: boolean }
): string {
  const parts: string[] = [];
  if (b.anleitung.includes(profile.preferredGuidance)) parts.push(GUIDANCE_REASON[profile.preferredGuidance]);
  if (profile.needsScaffolding && (b.adaptivitaet.includes('diff-prozess') || b.adaptivitaet.includes('diff-tempo'))) {
    parts.push('bietet Hilfestufen oder eigenes Tempo');
  }
  if (profile.benefitsFromEnrichment && (b.engagement.includes('konstruktiv') || b.engagement.includes('interaktiv'))) {
    parts.push('ermöglicht Vertiefung und Transfer');
  }
  if (!parts.length) parts.push('passt besser zu den empfohlenen Maßnahmen für diese Gruppe');
  return parts.join(', ');
}

/**
 * Proposes parallel methods for learner subgroups where the planned method fits the group's needs poorly
 * and the catalogue holds a clearly better method for the same learning function.
 * Deterministic; never changes the method of the main group.
 */
export function proposeMethodAdjustments(
  allBlocks: Baustein[],
  phases: MethodAdjustmentPhase[],
  groups: MethodAdjustmentGroup[],
  constraints: MethodAdjustmentConstraints = {}
): MethodAdjustment[] {
  const out: MethodAdjustment[] = [];
  const byKennung = new Map(allBlocks.map((b) => [b.kennung, b]));
  const planned = new Set(phases.map((p) => p.block?.kennung).filter(Boolean) as string[]);

  for (const g of groups) {
    if (g.isMain) continue;
    if (!hasAdjustmentProfile(g)) continue;
    const matrix = scoreDifferentiationMatrix({
      personaId: g.personaId,
      selectedValues: g.selectedValues,
      maxTechnik: constraints.maxTechnik,
      ohneInternet: constraints.ohneInternet,
      ohneKI: constraints.ohneKI,
      limit: 10
    });
    const usedForGroup = new Set<string>();

    for (const p of phases) {
      if (!p.block || p.locked) continue;
      const current = scoreMethodForGroup(p.block, matrix).fit;
      if (current >= WEAK_FIT) continue;
      // All suitable alternatives: the filters below may rule out the first ones.
      const candidates = suggestAlternativeMethodsForGroup(matrix, p.block, allBlocks, allBlocks.length, p.durationMin, constraints);
      const best = candidates
        .map((c) => ({ c, block: byKennung.get(c.kennung) }))
        .filter((x): x is { c: (typeof candidates)[number]; block: Baustein } => Boolean(x.block))
        .filter((x) => !planned.has(x.c.kennung) && !usedForGroup.has(x.c.kennung))
        .filter((x) => staysWithinFrame(x.block, p.block!, matrix.didacticProfile.needsScaffolding, constraints))
        .map((x) => ({ ...x, group: scoreMethodForGroup(x.block, matrix) }))
        .filter((x) => x.group.fit - current >= MIN_GAIN)
        .sort((a, b) => b.group.fit - a.group.fit)[0];
      if (!best) continue;
      usedForGroup.add(best.c.kennung);
      out.push({
        stepKey: p.key,
        phaseLabel: p.label || p.block.name,
        groupId: g.id,
        groupLabel: g.label,
        vonKennung: p.block.kennung,
        vonName: p.block.name,
        zuKennung: best.c.kennung,
        zuName: best.c.name,
        grund: plainReason(best.block, matrix.didacticProfile)
      });
    }
  }
  return out;
}

export interface AdditionalPhaseProposal {
  /** 'vorwissen': guided start that activates prior knowledge; 'lernstand': short check at the end. */
  art: 'vorwissen' | 'lernstand';
  position: 'anfang' | 'ende';
  kennung: string;
  name: string;
  dauerMin: number;
  grund: string;
  /** Subgroups the phase is proposed for; it is held with the whole class. */
  groupIds: string[];
  groupLabels: string[];
}

/** Extra phases stay short so the rest of the lesson keeps its time. */
const EXTRA_PHASE_MAX_MIN = 5;

const listLabels = (labels: string[]) =>
  labels.length <= 1 ? labels.join('') : `${labels.slice(0, -1).join(', ')} und ${labels[labels.length - 1]}`;

/**
 * Proposes short additional phases for the whole class where the plan lacks something the subgroups depend on:
 * a clearly guided start that activates prior knowledge (groups that need support) and a short check at the end
 * that shows whether everyone reached the goal. Deterministic; at most one proposal per kind.
 */
export function proposeAdditionalPhases(
  allBlocks: Baustein[],
  phases: MethodAdjustmentPhase[],
  groups: MethodAdjustmentGroup[],
  constraints: MethodAdjustmentConstraints = {}
): AdditionalPhaseProposal[] {
  const profiled = groups
    .filter((g) => !g.isMain && hasAdjustmentProfile(g))
    .map((g) => ({
      g,
      matrix: scoreDifferentiationMatrix({
        personaId: g.personaId,
        selectedValues: g.selectedValues,
        maxTechnik: constraints.maxTechnik,
        ohneInternet: constraints.ohneInternet,
        ohneKI: constraints.ohneKI,
        limit: 10
      })
    }));
  if (!profiled.length) return [];

  const plannedBlocks = phases.map((p) => p.block).filter((b): b is Baustein => Boolean(b));
  const used = new Set(plannedBlocks.map((b) => b.kennung));
  const maxTech = Math.min(1, constraints.maxTechnik ? (TECH_RANK[constraints.maxTechnik] ?? 1) : 1);

  const inFrame = (b: Baustein) =>
    b.dauerMin <= EXTRA_PHASE_MAX_MIN &&
    b.anleitung.includes('explizit') &&
    (TECH_RANK[b.technik] ?? 0) <= maxTech &&
    !b.internet &&
    !usesAi(b) &&
    !b.komposit &&
    !(b.slot || []).length &&
    !(constraints.fachbereich && (b.fachbereichUngeeignet || []).includes(constraints.fachbereich)) &&
    !(constraints.bildungsstufe && (b.ungeeignetBeiStufe || []).includes(constraints.bildungsstufe)) &&
    // Movement and play methods only fit where the subject calls for them.
    !(b.aufgabe || []).includes('psychomotorik') &&
    !(b.ansatz || []).includes('spiel-simulation');

  const pick = (candidates: Baustein[], forGroups: typeof profiled): Baustein | undefined =>
    candidates
      .filter((b) => !used.has(b.kennung) && inFrame(b))
      .map((b) => ({ b, fit: forGroups.reduce((sum, x) => sum + scoreMethodForGroup(b, x.matrix).fit, 0) }))
      .sort(
        (a, b) =>
          b.fit - a.fit ||
          Number(b.b.status === 'kuratiert') - Number(a.b.status === 'kuratiert') ||
          a.b.dauerMin - b.b.dauerMin ||
          a.b.kennung.localeCompare(b.b.kennung)
      )[0]?.b;

  const out: AdditionalPhaseProposal[] = [];
  const add = (art: AdditionalPhaseProposal['art'], b: Baustein, forGroups: typeof profiled, grund: (labels: string, min: number) => string) => {
    used.add(b.kennung);
    const dauerMin = Math.min(Math.max(EXTRA_PHASE_MAX_MIN, b.dauerMin), b.dauerMax);
    out.push({
      art,
      position: art === 'vorwissen' ? 'anfang' : 'ende',
      kennung: b.kennung,
      name: b.name,
      dauerMin,
      grund: grund(listLabels(forGroups.map((x) => x.g.label)), dauerMin),
      groupIds: forGroups.map((x) => x.g.id),
      groupLabels: forGroups.map((x) => x.g.label)
    });
  };

  // 1. Guided start: groups that need support depend on prior knowledge being made explicit first.
  const needSupport = profiled.filter((x) => x.matrix.didacticProfile.needsScaffolding);
  // Such a start activates prior knowledge and shows it: learners answer, the teacher sees where they stand.
  const showsPriorKnowledge = (b: Baustein) =>
    (b.nachbedingung || []).includes('vorwissen-aktiviert') && b.lernfunktion.includes('diagnose') && ['orientierung', 'diagnose'].includes(b.lernfunktion[0]);
  const hasGuidedStart = plannedBlocks.some((b) => b.anleitung.includes('explizit') && showsPriorKnowledge(b));
  if (needSupport.length && !hasGuidedStart) {
    const b = pick(allBlocks.filter(showsPriorKnowledge), needSupport);
    if (b) {
      add('vorwissen', b, needSupport, (labels) => `${labels}: Ein klar angeleiteter Einstieg klärt vorab für alle, was schon bekannt ist und worauf die Stunde aufbaut.`);
    }
  }

  // 2. Check at the end: with subgroups in the room the plan should show whether everyone reached the goal.
  const hasCheck = plannedBlocks.some((b) => (b.nachbedingung || []).includes('lernstand-diagnostiziert'));
  if (!hasCheck) {
    const b = pick(
      // Methods made for the start of a lesson are no check at its end.
      allBlocks.filter(
        (x) =>
          (x.nachbedingung || []).includes('lernstand-diagnostiziert') &&
          x.lernfunktion[0] === 'diagnose' &&
          !(x.nachbedingung || []).includes('vorwissen-aktiviert')
      ),
      profiled
    );
    if (b) {
      add('lernstand', b, profiled, (labels, min) => `Bisher zeigt der Ablauf am Ende nicht, ob auch ${labels} das Ziel erreicht haben. Das wird hier in ${min} Minuten für alle sichtbar.`);
    }
  }
  return out;
}
