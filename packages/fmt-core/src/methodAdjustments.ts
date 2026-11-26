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
  if (!constraints.maxTechnik && (TECH_RANK[candidate.technik] ?? 0) > Math.max(TECH_RANK[current.technik] ?? 0, 1)) return false;
  if (candidate.internet && !current.internet) return false;
  if (usesAi(candidate) && !usesAi(current)) return false;
  if (constraints.fachbereich && (candidate.fachbereichUngeeignet || []).includes(constraints.fachbereich)) return false;
  if (needsScaffolding && !candidate.anleitung.some((a) => a === 'explizit' || a === 'geleitet')) return false;
  return true;
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
    const hasProfile = Boolean(g.personaId) || Object.keys(g.selectedValues || {}).length > 0;
    if (!hasProfile) continue;
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
      const candidates = suggestAlternativeMethodsForGroup(matrix, p.block, allBlocks, 8, p.durationMin, constraints);
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
        grund: best.group.reasons.join(', ')
      });
    }
  }
  return out;
}
