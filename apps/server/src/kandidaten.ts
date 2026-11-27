import {
  alternativenFuerTeilgruppe,
  kettenSchritt,
  teilgruppenProfil,
  type AlternativenPruefung,
  type Arrangement,
  type MatchRequest,
  type MatrixScoreResult,
  type ReplacementCandidate,
  type TeilgruppenAlternative
} from '@fmt/core';
import type { CatalogStore } from './catalog-store.js';

/**
 * Request fields that describe the situation a replacement or a parallel method must fit: room, literacy, dates,
 * time, group size and the technology frame. REST and MCP read the same list.
 */
export const SITUATION_FELDER = [
  'raum',
  'lernort',
  'raumBietet',
  'fachausstattungArt',
  'ohneSchrift',
  'termine',
  'zeitMin',
  'gruppe',
  'maxTechnik',
  'ohneInternet',
  'ohneKI',
  'maxVorbereitung',
  'bildungsstufe',
  'fachbereich'
] as const;

/** Situation from a body: the fields of an object `situation`, top-level fields win over it. Undefined when none is given. */
export function situationAus(body: Record<string, unknown> | null | undefined): MatchRequest | undefined {
  if (!body) return undefined;
  const nested = body.situation && typeof body.situation === 'object' && !Array.isArray(body.situation) ? (body.situation as Record<string, unknown>) : {};
  const out: MatchRequest = {};
  for (const f of SITUATION_FELDER) {
    const v = body[f] ?? nested[f];
    if (v != null && v !== '') (out as Record<string, unknown>)[f] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/** German message for a malformed situation field, or null. */
export function situationFehler(s: MatchRequest | undefined): string | null {
  if (!s) return null;
  const os = s.ohneSchrift;
  if (os != null && typeof os !== 'boolean' && !(Array.isArray(os) ? os : [os]).every((x) => x === 'lesen' || x === 'schreiben')) {
    return 'Feld „ohneSchrift“: erlaubt sind „lesen“ und „schreiben“.';
  }
  for (const f of ['termine', 'zeitMin', 'gruppe', 'maxVorbereitung'] as const) {
    if (s[f] != null && !Number.isFinite(Number(s[f]))) return `Feld „${f}“: erwartet wird eine Zahl.`;
  }
  return null;
}

/** Note on replacement candidates, as REST /replacements and MCP suggest_replacements give it. */
export function ersatzHinweis(situation: MatchRequest | undefined): string {
  return (
    'Kandidaten passen formal (Arrangement bleibt gültig), sind Methoden und tragen die Wissensart des Kettenschritts' +
    (situation ? '; ihr Bedarf ist in der angegebenen Situation gedeckt' : '') +
    '. Gleiche Wirkung ist nicht garantiert (Loibl et al. 2024).'
  );
}

/** Fields that name the room, literacy or dates of a lesson; only they make a situation worth checking in /adapt. */
const RAHMEN_FELDER = ['raum', 'lernort', 'raumBietet', 'fachausstattungArt', 'ohneSchrift', 'termine'] as const;

/**
 * Request of the plan for subgroup decisions (core AdaptScenarioInput.anfrage): the object `anfrage` plus the
 * situation fields given at the top level (top level wins). Without `anfrage` and without any room, literacy or
 * date field it stays undefined, so a bare call keeps its former answer (no room counts as named).
 */
export function anpassungsAnfrage(body: Record<string, unknown> | null | undefined): MatchRequest | undefined {
  if (!body) return undefined;
  const nested = body.anfrage && typeof body.anfrage === 'object' && !Array.isArray(body.anfrage) ? (body.anfrage as MatchRequest) : undefined;
  const top = situationAus({ ...body, situation: undefined });
  const rahmen = RAHMEN_FELDER.some((f) => top && (top as Record<string, unknown>)[f] != null);
  if (!nested && !rahmen) return undefined;
  return { ...(nested || {}), ...(top || {}) };
}

/** Replacements at a path: formally valid, bound to the chain step's knowledge type, needs covered in the situation. */
export function ersatzKandidaten(store: CatalogStore, arrangement: Arrangement, pfad: string, situation?: MatchRequest): ReplacementCandidate[] {
  return store.search.ersatz(arrangement, pfad, store.exampleRegistry, situation);
}

export interface TeilgruppenAlternativenArgs {
  matrix: MatrixScoreResult;
  /** Planned method (kennung); without it there are no alternatives. */
  baustein?: string;
  personaId?: string;
  selectedValues?: Record<string, string>;
  ohneSchrift?: Array<'lesen' | 'schreiben'>;
  ohneBewegung?: boolean;
  situation?: MatchRequest;
  lehrende?: number;
  /** Chain and step the phase fills (binding and learning state of the step). */
  zieltyp?: string;
  kettenschritt?: string;
  dauerMin?: number;
  limit?: number;
}

/**
 * Parallel methods for a subgroup and a planned method, as REST /differentiation/score and the MCP tool
 * score_differentiation_matrix give them: methods only, needs covered in the situation, equivalent to the planned
 * method (core istGleichwertig).
 */
export function teilgruppenAlternativen(store: CatalogStore, a: TeilgruppenAlternativenArgs): AlternativenPruefung<TeilgruppenAlternative> {
  const geplant = a.baustein ? store.blocksById.get(a.baustein) : undefined;
  const t = store.bundle.teilgruppen;
  const situation = a.situation || {};
  const profil = teilgruppenProfil(
    {
      id: 'teilgruppe',
      label: 'Teilgruppe',
      personaId: a.personaId,
      selectedValues: a.selectedValues,
      ...(a.ohneSchrift?.length ? { ohneSchrift: a.ohneSchrift } : {}),
      ...(a.ohneBewegung ? { ohneBewegung: true } : {})
    },
    t
  );
  return alternativenFuerTeilgruppe(a.matrix, geplant, store.bundle.bausteine, store.bundle, {
    limit: a.limit ?? 5,
    phaseDurationMin: a.dauerMin,
    constraints: {
      maxTechnik: situation.maxTechnik as string | undefined,
      ohneInternet: situation.ohneInternet as boolean | undefined,
      ohneKI: situation.ohneKI as boolean | undefined,
      bildungsstufe: situation.bildungsstufe as string | undefined,
      fachbereich: situation.fachbereich as string | undefined
    },
    kontext: {
      anfrage: situation,
      schritt: kettenSchritt(store.bundle, a.zieltyp, a.kettenschritt),
      profil,
      lehrende: a.lehrende,
      regelwerk: { teilgruppen: t, regeln: store.bundle.regeln, schemes: store.bundle.schemes }
    }
  });
}
