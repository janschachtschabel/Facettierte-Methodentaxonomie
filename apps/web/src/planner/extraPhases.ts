import type { AdditionalPhaseProposal, Arrangement, ArrangementNode, Baustein, EinsatzNode } from '@fmt/core';
import { getMainSequence, withMainSequence } from './arrangementOps.js';

/** An additional phase the teacher took over from the proposals of step 3. */
export interface AddedPhase {
  art: AdditionalPhaseProposal['art'];
  kennung: string;
  name: string;
  dauerMin: number;
  grund: string;
  /** Phases that gave minutes so the total length stayed the same (or grew less). */
  donors: Array<{ kennung: string; minutes: number }>;
}

const isEinsatz = (n: ArrangementNode): n is EinsatzNode => n.typ === 'Einsatz';
const minutes = (n: EinsatzNode) => n.dauerMin ?? 0;

/**
 * Inserts the proposed phase for the whole class. The minutes come from the longest phase that can spare them
 * (it never drops below the minimum of its method); otherwise the flow grows by the new phase.
 */
export function addExtraPhase(
  arr: Arrangement,
  blocksById: Map<string, Baustein>,
  proposal: AdditionalPhaseProposal
): { arrangement: Arrangement; index: number; added: AddedPhase } {
  const teile = getMainSequence(arr).seq.teile;
  const recurring = teile.findIndex((t) => t.typ === 'Wiederkehr');
  const index = proposal.position === 'anfang' ? 0 : recurring === -1 ? teile.length : recurring;

  // Minutes each phase can spare without dropping below the minimum of its method; longest phases give first.
  const spare = teile
    .map((t, i) => {
      if (!isEinsatz(t) || (t.belegung || []).length) return { i, slack: 0, min: 0 };
      const min = blocksById.get(t.baustein)?.dauerMin ?? minutes(t);
      return { i, slack: Math.max(0, minutes(t) - min), min: minutes(t) };
    })
    .filter((x) => x.slack > 0)
    .sort((a, b) => b.slack - a.slack || b.min - a.min || a.i - b.i);
  const take = new Map<number, number>();
  let open = proposal.dauerMin;
  for (const x of spare) {
    if (open <= 0) break;
    const m = Math.min(x.slack, open);
    take.set(x.i, m);
    open -= m;
  }
  const donors = [...take.entries()].map(([i, m]) => ({ kennung: (teile[i] as EinsatzNode).baustein, minutes: m }));

  const arrangement = withMainSequence(arr, (cur) => {
    const copy = cur.map((t, i) => (take.has(i) && isEinsatz(t) ? { ...t, dauerMin: minutes(t) - take.get(i)! } : t));
    copy.splice(index, 0, { typ: 'Einsatz', baustein: proposal.kennung, dauerMin: proposal.dauerMin });
    return copy;
  });
  return {
    arrangement,
    index,
    added: { art: proposal.art, kennung: proposal.kennung, name: proposal.name, dauerMin: proposal.dauerMin, grund: proposal.grund, donors }
  };
}

/** Takes an added phase out again and gives its minutes back. Null when the phase is no longer in the flow. */
export function removeExtraPhase(arr: Arrangement, added: AddedPhase): { arrangement: Arrangement; index: number } | null {
  const teile = getMainSequence(arr).seq.teile;
  const index = teile.findIndex((t) => isEinsatz(t) && t.baustein === added.kennung);
  if (index === -1) return null;
  const arrangement = withMainSequence(arr, (cur) => {
    const copy = cur.filter((_, i) => i !== index);
    for (const d of added.donors) {
      const at = copy.findIndex((t) => isEinsatz(t) && t.baustein === d.kennung);
      if (at >= 0) copy[at] = { ...(copy[at] as EinsatzNode), dauerMin: minutes(copy[at] as EinsatzNode) + d.minutes };
    }
    return copy;
  });
  return { arrangement, index };
}

const STEP_KEY = /^step-(\d+)(.*)$/;

/**
 * Entries of the planner are keyed by the position of a phase ("step-2", "step-2-slot-x"). When a phase is
 * inserted (delta 1) or removed (delta -1) at `fromIndex`, the entries move with their phases;
 * entries of a removed phase are dropped.
 */
export function shiftStepKeys<T>(map: Record<string, T>, fromIndex: number, delta: 1 | -1): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(map)) {
    const m = STEP_KEY.exec(key);
    if (!m) {
      out[key] = value;
      continue;
    }
    const n = Number(m[1]);
    if (delta === -1 && n === fromIndex) continue;
    const moved = delta === 1 ? n >= fromIndex : n > fromIndex;
    out[moved ? `step-${n + delta}${m[2]}` : key] = value;
  }
  return out;
}

export function shiftAdjustmentKeys<T extends { stepKey: string }>(list: T[], fromIndex: number, delta: 1 | -1): T[] {
  return list.flatMap((a) => {
    const moved = shiftStepKeys({ [a.stepKey]: true }, fromIndex, delta);
    const key = Object.keys(moved)[0];
    return key ? [{ ...a, stepKey: key }] : [];
  });
}
