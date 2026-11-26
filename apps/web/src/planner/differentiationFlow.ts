import type { MethodAdjustment, MethodAdjustmentGroup, MethodAdjustmentPhase } from '@fmt/core';
import type { LearnerGroup, ScenarioPhaseRow, SubgroupMethodMap } from './scenarioModel.js';

/** The main group ("Regelgruppe") is the one the plan of step 2 is written for. */
export function isMainGroup(g: LearnerGroup): boolean {
  return g.focus === 'regel';
}

export function activeSubgroups(groups: LearnerGroup[]): LearnerGroup[] {
  return groups.filter((g) => g.active && !isMainGroup(g));
}

/**
 * Step 2 shows the plan for the whole class only: one column, counted with everyone,
 * no matter which subgroups step 3 already holds.
 */
export function mainGroupOnly(groups: LearnerGroup[], totalClassSize?: number): LearnerGroup[] {
  const active = groups.filter((g) => g.active);
  const main = active.find(isMainGroup) || active[0] || groups[0];
  if (!main) return [];
  // Without a known class size the head count is only shown when every group has one.
  const allCounted = active.every((g) => (g.count || 0) > 0);
  const count =
    totalClassSize && totalClassSize > 0 ? totalClassSize : allCounted ? active.reduce((s, g) => s + (g.count || 0), 0) : undefined;
  return [{ ...main, label: 'Regelgruppe (ganze Klasse)', focus: 'regel', active: true, count }];
}

/** Container methods with filled slots and the accompanying strands keep one method for everyone. */
export function adjustmentPhases(rows: ScenarioPhaseRow[]): MethodAdjustmentPhase[] {
  const parents = new Set(rows.filter((r) => r.isNestedSlot).map((r) => r.stepIndex));
  return rows.map((r) => ({
    key: r.key,
    label: `${r.orderLabel} · ${r.methodName}`,
    block: r.block,
    durationMin: r.durationMin,
    locked: r.stepIndex < 0 || r.key === 'wiederkehr' || (!r.isNestedSlot && parents.has(r.stepIndex))
  }));
}

export function adjustmentGroups(groups: LearnerGroup[]): MethodAdjustmentGroup[] {
  return groups
    .filter((g) => g.active)
    .map((g) => ({
      id: g.id,
      label: g.label,
      isMain: isMainGroup(g),
      personaId: g.personaId,
      selectedValues: g.matrixValues
    }));
}

/**
 * Replaces the earlier automatic proposals by the new ones. Parallel methods the teacher picked by hand
 * stay untouched: an earlier proposal is only removed while it still holds the proposed method.
 */
export function applyAdjustments(
  current: SubgroupMethodMap,
  previous: MethodAdjustment[],
  next: MethodAdjustment[]
): SubgroupMethodMap {
  const out: SubgroupMethodMap = {};
  for (const [stepKey, byGroup] of Object.entries(current)) out[stepKey] = { ...byGroup };
  for (const a of previous) {
    if (out[a.stepKey]?.[a.groupId] === a.zuKennung) delete out[a.stepKey][a.groupId];
  }
  for (const a of next) {
    if (out[a.stepKey]?.[a.groupId]) continue; // hand-picked method wins
    out[a.stepKey] = { ...(out[a.stepKey] || {}), [a.groupId]: a.zuKennung };
  }
  for (const k of Object.keys(out)) if (Object.keys(out[k]).length === 0) delete out[k];
  return out;
}

/** Proposals that are still in force, i.e. not replaced or removed by hand since. */
export function adjustmentsInForce(current: SubgroupMethodMap, adjustments: MethodAdjustment[]): MethodAdjustment[] {
  return adjustments.filter((a) => current[a.stepKey]?.[a.groupId] === a.zuKennung);
}
