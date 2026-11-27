import {
  proposeMethodAdjustments,
  proposeSupports,
  teilgruppenAntworten,
  teilgruppenHinweise,
  type Baustein,
  type Grundlage,
  type MatchRequest,
  type MethodAdjustment,
  type MethodAdjustmentConstraints,
  type MethodAdjustmentGroup,
  type MethodAdjustmentPhase,
  type PhasenAntwort,
  type Regelmeldung,
  type TeilgruppenRegelwerk
} from '@fmt/core';
import { grundlageKlartext } from './regelmeldung.js';
import type { GeneratedMaterialItem, LearnerGroup, ScenarioPhaseRow, SubgroupMethodMap } from './scenarioModel.js';

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
  // Without a main group among the groups a neutral one stands in, so hints of a subgroup never show as "whole class".
  const base: LearnerGroup = isMainGroup(main) ? main : { id: 'regel', label: '', profile: '', focus: 'regel', active: true, personaId: 'average' };
  return [{ ...base, label: 'Regelgruppe (ganze Klasse)', focus: 'regel', active: true, count }];
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
      selectedValues: g.matrixValues,
      ...(g.genannt ? { genannt: g.genannt } : {}),
      ...(g.ohneSchrift?.length ? { ohneSchrift: g.ohneSchrift } : {}),
      ...(g.ohneBewegung ? { ohneBewegung: true } : {})
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

/**
 * Proposals whose phase no longer holds the method they replaced, e.g. after the flow was edited in step 2.
 * Step keys follow the position in the flow, so such a proposal would otherwise sit on a different phase.
 */
export function outdatedAdjustments(rows: ScenarioPhaseRow[], adjustments: MethodAdjustment[]): MethodAdjustment[] {
  const methodByKey = new Map(rows.map((r) => [r.key, r.methodId]));
  return adjustments.filter((a) => methodByKey.get(a.stepKey) !== a.vonKennung);
}

/**
 * Frame of the subgroup check: the plan's limits and the request of step 1 as the matcher read it (room, time, group
 * size …), so a parallel method has to cover its needs in the same room and time slot. The text itself is left out.
 */
export function teilgruppenRahmen(
  rahmen: Omit<MethodAdjustmentConstraints, 'anfrage'>,
  kriterien: Record<string, unknown> | null | undefined
): MethodAdjustmentConstraints {
  const anfrage = kriterien
    ? (Object.fromEntries(Object.entries(kriterien).filter(([k, v]) => k !== 'text' && v != null && v !== '')) as MatchRequest)
    : undefined;
  return { ...rahmen, ...(anfrage ? { anfrage } : {}) };
}

/** What a run of "Vorgehen anpassen" depends on; a different signature means the result may be out of date. */
export function adjustmentSignature(
  rows: ScenarioPhaseRow[],
  groups: LearnerGroup[],
  constraints: { maxTechnik?: string; ohneInternet?: boolean; ohneKI?: boolean; fachbereich?: string; anfrage?: MatchRequest }
): string {
  const anfrage = Object.entries(constraints.anfrage || {})
    .filter(([k]) => k !== 'text')
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify([
    rows.map((r) => [r.key, r.methodId]),
    activeSubgroups(groups).map((g) => [g.id, g.personaId || '', g.matrixValues || {}, g.genannt ?? null, g.ohneSchrift || [], Boolean(g.ohneBewegung)]),
    [constraints.maxTechnik || '', Boolean(constraints.ohneInternet), Boolean(constraints.ohneKI), constraints.fachbereich || ''],
    anfrage
  ]);
}

/** Result of "Vorgehen anpassen": one answer per subgroup and phase, the swaps among them and the hints per group. */
export interface TeilgruppenPruefung {
  antworten: PhasenAntwort[];
  /** Parallel methods for the answers 'tausch'; proposals the teacher takes over by hand. */
  vorschlaege: MethodAdjustment[];
  /** Hints on grouping (gruppierung-nur-mit-anpassung, leistungsschwache-nicht-unter-sich) by group id. */
  hinweise: Record<string, Regelmeldung[]>;
}

/** Step 3: the subgroup decision of the core (one path for answers, swaps, helps and hints). */
export function pruefeTeilgruppen(
  allBlocks: Baustein[],
  rows: ScenarioPhaseRow[],
  groups: LearnerGroup[],
  constraints: MethodAdjustmentConstraints,
  regelsatz: TeilgruppenRegelwerk
): TeilgruppenPruefung {
  const phases = adjustmentPhases(rows);
  const gruppen = adjustmentGroups(groups);
  const antworten = teilgruppenAntworten(allBlocks, phases, gruppen, constraints, regelsatz);
  const vorschlaege = proposeMethodAdjustments(allBlocks, phases, gruppen, constraints, regelsatz, antworten);
  const hilfen = proposeSupports(phases, gruppen, regelsatz, { antworten });
  const hinweise: Record<string, Regelmeldung[]> = {};
  // Asked group by group, so a hint stands under the cards of the group it is about.
  for (const g of gruppen) {
    if (g.isMain) continue;
    hinweise[g.id] = teilgruppenHinweise(phases, [g], vorschlaege, hilfen, regelsatz);
  }
  return { antworten, vorschlaege, hinweise };
}

const sameAdjustment = (a: MethodAdjustment, b: MethodAdjustment) =>
  a.stepKey === b.stepKey && a.groupId === b.groupId && a.zuKennung === b.zuKennung;

/**
 * After a new check: swaps the teacher took over stay while the new check still proposes them; the others are taken
 * out. Nothing is entered by itself, and methods picked by hand stay untouched.
 */
export function behalteUebernommene(current: SubgroupMethodMap, previous: MethodAdjustment[], next: MethodAdjustment[]): SubgroupMethodMap {
  const entfallen = adjustmentsInForce(current, previous).filter((a) => !next.some((n) => sameAdjustment(a, n)));
  return applyAdjustments(current, entfallen, []);
}

/** Small line under a decision: "Grundlage: belegt (Quelle)"; without a basis it is "ungeklärt". */
export function belegZeile(b: { grundlage?: Grundlage; quelle?: string }): string {
  return `Grundlage: ${grundlageKlartext({ grundlage: b.grundlage ?? 'U', quelle: b.quelle })}`;
}

/** A help taken over in step 3 goes into step 4 as material of its phase. */
export function hilfeAlsMaterial(a: PhasenAntwort, phaseLabel: string, now = new Date()): GeneratedMaterialItem {
  const namen = a.hilfen.map((h) => h.name).join(', ');
  const content = [
    `# Hilfe für ${a.groupLabel}`,
    '',
    `Phase: ${phaseLabel}`,
    '',
    ...a.hilfen.flatMap((h) => [`- **${h.name}**`, `  Wann die Hilfe entfällt: ${h.abbau}`]),
    '',
    `Beleg: ${a.grund}`,
    '',
    belegZeile(a)
  ].join('\n');
  return {
    id: `hilfe-${a.stepKey}-${a.groupId}`,
    stepKey: a.stepKey,
    groupId: a.groupId,
    title: `Hilfe für ${a.groupLabel}: ${namen}`,
    materialType: 'hilfe',
    content,
    createdAt: now.toISOString()
  };
}

export function hilfeUebernommen(materials: GeneratedMaterialItem[], stepKey: string, groupId: string): boolean {
  return materials.some((m) => m.materialType === 'hilfe' && m.stepKey === stepKey && m.groupId === groupId);
}
