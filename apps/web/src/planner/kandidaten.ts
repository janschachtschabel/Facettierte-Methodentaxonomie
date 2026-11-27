import {
  alternativenFuerTeilgruppe,
  ausschlussInSituation,
  baueSituation,
  kettenSchritt,
  nurMethoden,
  teilgruppenProfil,
  type AlternativenPruefung,
  type Baustein,
  type Funktionskette,
  type MatchRequest,
  type MatrixScoreResult,
  type MethodAdjustmentConstraints,
  type TeilgruppenAlternative,
  type TeilgruppenRegelwerk
} from '@fmt/core';
import { adjustmentGroups } from './differentiationFlow.js';
import type { LearnerGroup, ScenarioPhaseRow } from './scenarioModel.js';

/**
 * Frame for every picker that offers another method for a phase or a subgroup: the plan's request as the core read
 * it (room, literacy, dates, time, technology …), the chain, the number of teachers and the rule set. The core's
 * candidate filter (alternativen.ts) reads it; the pickers add no rule of their own.
 */
export interface KandidatenRahmen {
  constraints: MethodAdjustmentConstraints;
  zieltyp?: string;
  lehrende?: number;
  ketten: Funktionskette[];
  regelwerk: TeilgruppenRegelwerk;
}

/** The situation of the plan as a request: the read request plus the technology frame of step 1. */
export function situationsAnfrage(c: MethodAdjustmentConstraints): MatchRequest {
  const out: MatchRequest = { ...(c.anfrage || {}) };
  delete out.text;
  if (c.maxTechnik) out.maxTechnik = c.maxTechnik;
  if (c.ohneInternet) out.ohneInternet = true;
  if (c.ohneKI) out.ohneKI = true;
  return out;
}

/** What the filter of further methods needs: the frame without the subgroup rules (the vocabularies are enough). */
export type WeitereRahmen = Pick<KandidatenRahmen, 'constraints' | 'zieltyp' | 'ketten'> & { regelwerk: Pick<TeilgruppenRegelwerk, 'schemes'> };

const schrittVon = (r: WeitereRahmen, row: ScenarioPhaseRow) => kettenSchritt({ ketten: r.ketten }, r.zieltyp, row.chainStep);

/**
 * Parallel methods for a subgroup in a phase: candidates of the matrix, filtered by the core (methods only, needs
 * covered in the situation, knowledge type of the chain step, equivalent to the planned method for this subgroup).
 */
export function parallelMethoden(
  matrix: MatrixScoreResult,
  row: ScenarioPhaseRow,
  group: LearnerGroup,
  allBlocks: Baustein[],
  r: KandidatenRahmen,
  limit = 5
): AlternativenPruefung<TeilgruppenAlternative> {
  const [g] = adjustmentGroups([{ ...group, active: true }]);
  return alternativenFuerTeilgruppe(matrix, row.block, allBlocks, r.regelwerk, {
    limit,
    phaseDurationMin: row.durationMin,
    constraints: {
      maxTechnik: r.constraints.maxTechnik,
      ohneInternet: r.constraints.ohneInternet,
      ohneKI: r.constraints.ohneKI,
      bildungsstufe: r.constraints.bildungsstufe,
      fachbereich: r.constraints.fachbereich
    },
    kontext: {
      anfrage: situationsAnfrage(r.constraints),
      schritt: schrittVon(r, row),
      profil: teilgruppenProfil(g, r.regelwerk.teilgruppen),
      lehrende: r.lehrende ?? r.constraints.lehrende,
      regelwerk: r.regelwerk
    }
  });
}

const RANG: Record<string, number> = { r1: 1, r2: 2, r3: 3, r4: 4, r5: 5 };

/**
 * Further methods the teacher may pick by hand for a phase: same learning function, no larger range, a fitting
 * duration, and the core's check (methods only, needs covered in the situation, knowledge type of the chain step).
 * They are not checked for equivalence; the picker says so.
 */
export function weitereMethoden(row: ScenarioPhaseRow, allBlocks: Baustein[], r: WeitereRahmen, ohne: ReadonlySet<string> = new Set()): Baustein[] {
  const cur = row.block;
  if (!cur) return [];
  const fns = new Set(cur.lernfunktion || []);
  const curRank = RANG[cur.reichweite] ?? 2;
  const maxDur = Math.max(row.durationMin * 1.5, cur.dauerMax);
  const anfrage = situationsAnfrage(r.constraints);
  const situation = baueSituation(anfrage, r.regelwerk);
  const schritt = schrittVon(r, row);
  return nurMethoden(allBlocks)
    .filter(
      (b) =>
        b.kennung !== cur.kennung &&
        !ohne.has(b.kennung) &&
        b.lernfunktion.some((f) => fns.has(f)) &&
        (RANG[b.reichweite] ?? 2) <= curRank &&
        b.dauerMin <= maxDur &&
        !ausschlussInSituation(b, { anfrage, situation, schritt, data: r.regelwerk })
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/**
 * Methods for the per-step select of the Partitur (and its slots), split by the core's check: `passend` covers the
 * needs in the situation and carries the chain step's knowledge type; `ausgeschlossen` names the core's reason. The
 * teacher sees both, the rejected ones only as disabled entries with the reason.
 */
export function schrittKandidaten(
  cands: Baustein[],
  r: WeitereRahmen,
  schrittId?: string
): { passend: Baustein[]; ausgeschlossen: Array<{ b: Baustein; grund: string }> } {
  const anfrage = situationsAnfrage(r.constraints);
  const situation = baueSituation(anfrage, r.regelwerk);
  const schritt = kettenSchritt({ ketten: r.ketten }, r.zieltyp, schrittId);
  const passend: Baustein[] = [];
  const ausgeschlossen: Array<{ b: Baustein; grund: string }> = [];
  for (const b of cands) {
    const aus = ausschlussInSituation(b, { anfrage, situation, schritt, data: r.regelwerk });
    if (aus) ausgeschlossen.push({ b, grund: aus.grund });
    else passend.push(b);
  }
  return { passend, ausgeschlossen };
}
