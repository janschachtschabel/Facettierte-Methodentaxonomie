import type { Baustein, FmtData, Funktionskette, KettenSchritt, MatchRequest } from './types.js';
import type { Situation } from './situation.js';
import type { TeilgruppenRegelwerk } from './methodAdjustments.js';
import { baueSituation } from './situation.js';
import { ungedeckterBedarf } from './bedarf.js';
import { istMethode } from './eintragsart.js';
import { traegtWissensart } from './zielart.js';
import { erstelleRegeln } from './regeln.js';
import { istGleichwertig, type TeilgruppenProfil } from './teilgruppen.js';
import { suggestAlternativeMethodsForGroup, type MatrixScoreResult } from './differentiationMatrix.js';

/** Label of a candidate that passed the equivalence check (istGleichwertig). */
export const GLEICHWERTIG_GEPRUEFT = 'gleichwertig geprüft';
/** Label of a candidate that was only checked for need and chain-step binding. */
export const OHNE_GLEICHWERTIGKEITSPRUEFUNG = 'ohne Gleichwertigkeitsprüfung';

/** Chain step by chain id and step id; undefined when either is unknown. */
export function kettenSchritt(
  data: { ketten: Funktionskette[] },
  zieltyp: string | undefined,
  schrittId: string | undefined
): KettenSchritt | undefined {
  if (!zieltyp || !schrittId) return undefined;
  return data.ketten.find((k) => k.id === zieltyp)?.schritte.find((s) => s.id === schrittId);
}

export interface KandidatAusschluss {
  merkmal: string;
  grund: string;
}

/**
 * Why a candidate cannot fill a phase in this situation, or null when it can: a help never fills a phase; a method
 * must carry the knowledge type the chain step binds (edge steps do not bind); its needs (room, literacy, dates,
 * time, devices …) must be covered. Without a situation only the entry kind and the binding are checked.
 * Every picker that offers a replacement or a parallel method uses this one check.
 */
export function ausschlussInSituation(
  b: Baustein,
  ctx: {
    anfrage?: MatchRequest;
    situation?: Situation;
    schritt?: Pick<KettenSchritt, 'rolle' | 'wissensart'>;
    data: Pick<FmtData, 'schemes'>;
  }
): KandidatAusschluss | null {
  if (!istMethode(b)) return { merkmal: 'eintragsart', grund: 'ist eine Hilfe und füllt keine Phase' };
  if (ctx.schritt && !traegtWissensart(b, ctx.schritt)) {
    return { merkmal: 'wissensart', grund: `trägt nicht die Wissensart des Schritts (${(ctx.schritt.wissensart || []).join(', ')})` };
  }
  if (ctx.situation) {
    const luecke = ungedeckterBedarf(b, ctx.anfrage || {}, ctx.situation, ctx.data);
    if (luecke) return luecke;
  }
  return null;
}

export interface AlternativenKontext {
  /** Request of the plan or the situation alone (raum, raumBietet, ohneSchrift, termine, zeitMin, gruppe, maxTechnik …). */
  anfrage?: MatchRequest;
  /** Chain step the phase fills: its knowledge type binds, its goal is the learning state to reach. */
  schritt?: Pick<KettenSchritt, 'ziel' | 'rolle' | 'wissensart'>;
  /** Minutes of the phase. */
  dauerMin?: number;
  /** Profile of the subgroup; needed for the equivalence check. */
  profil?: TeilgruppenProfil;
  /** Number of teachers (with two, both methods may bind a teacher). */
  lehrende?: number;
  /** Table "Tausch oder Hilfe", fit rules and vocabularies; needed for the equivalence check. */
  regelwerk?: TeilgruppenRegelwerk;
}

export type GepruefteAlternative<T> = T & {
  /** True when the candidate passed istGleichwertig; false when only need and binding were checked. */
  gleichwertigGeprueft: boolean;
  /** GLEICHWERTIG_GEPRUEFT or OHNE_GLEICHWERTIGKEITSPRUEFUNG. */
  pruefung: string;
};

export interface AlternativenPruefung<T> {
  alternativen: GepruefteAlternative<T>[];
  /** Whether the equivalence check ran. */
  gleichwertigGeprueft: boolean;
  /** Plain German: what was checked, and what was missing for the equivalence check. */
  hinweis: string;
  /** Candidates left out, with the first reason. */
  ausgeschlossen: Array<{ kennung: string; name: string; grund: string }>;
}

/**
 * Filters candidates for a replacement or a parallel method. Always: methods only, need covered in the situation,
 * knowledge type of the chain step. With the planned method, the profile of the subgroup and the rule set, a
 * candidate must also be equivalent (istGleichwertig); otherwise the result says it was not checked for that.
 * Keeps the order of the candidates.
 */
export function pruefeAlternativen<T extends { kennung: string }>(
  kandidaten: readonly T[],
  geplant: Baustein | undefined,
  bausteine: ReadonlyMap<string, Baustein>,
  data: Pick<FmtData, 'schemes'>,
  ctx: AlternativenKontext = {}
): AlternativenPruefung<T> {
  const anfrage = ctx.anfrage || {};
  const situation = baueSituation(anfrage, data);
  const fehlt = [!geplant && 'die geplante Methode', !ctx.profil && 'das Profil der Teilgruppe', !ctx.regelwerk && 'die Regeln'].filter(
    (x): x is string => Boolean(x)
  );
  const pruefbar = fehlt.length === 0;
  const regeln = pruefbar ? erstelleRegeln(ctx.regelwerk!.regeln) : undefined;

  const alternativen: GepruefteAlternative<T>[] = [];
  const ausgeschlossen: AlternativenPruefung<T>['ausgeschlossen'] = [];
  for (const k of kandidaten) {
    const b = bausteine.get(k.kennung);
    if (!b) continue;
    const aus = ausschlussInSituation(b, { anfrage, situation, schritt: ctx.schritt, data });
    if (aus) {
      ausgeschlossen.push({ kennung: b.kennung, name: b.name, grund: `${b.name} ${aus.grund}` });
      continue;
    }
    if (pruefbar) {
      const g = istGleichwertig(b, geplant!, {
        schritt: ctx.schritt,
        anfrage,
        situation,
        dauerMin: ctx.dauerMin,
        profil: ctx.profil!,
        lehrende: ctx.lehrende,
        data: ctx.regelwerk!,
        regeln: regeln!,
        t: ctx.regelwerk!.teilgruppen
      });
      if (!g.ok) {
        ausgeschlossen.push({ kennung: b.kennung, name: b.name, grund: g.gruende[0] });
        continue;
      }
    }
    alternativen.push({ ...k, gleichwertigGeprueft: pruefbar, pruefung: pruefbar ? GLEICHWERTIG_GEPRUEFT : OHNE_GLEICHWERTIGKEITSPRUEFUNG });
  }
  const hinweis = pruefbar
    ? 'Nur gleichwertige Methoden: gleicher Lernstand und gleiche Wissensart, Bedarf im selben Raum gedeckt, passt zur Teilgruppe, läuft neben der geplanten Methode.'
    : `Ohne Gleichwertigkeitsprüfung (es fehlt ${fehlt.join(', ')}): geprüft sind nur Bedarf in der Situation und die Wissensart des Schritts.`;
  return { alternativen, gleichwertigGeprueft: pruefbar, hinweis, ausgeschlossen };
}

export type TeilgruppenAlternative = ReturnType<typeof suggestAlternativeMethodsForGroup>[number];

/**
 * Parallel methods for a subgroup: the candidates of suggestAlternativeMethodsForGroup (same function, matrix fit),
 * filtered by pruefeAlternativen. The limit applies after the filter.
 */
export function alternativenFuerTeilgruppe(
  matrix: MatrixScoreResult,
  geplant: Baustein | undefined,
  allBlocks: Baustein[],
  data: Pick<FmtData, 'schemes'>,
  opts: {
    limit?: number;
    phaseDurationMin?: number;
    constraints?: Parameters<typeof suggestAlternativeMethodsForGroup>[5];
    kontext?: AlternativenKontext;
  } = {}
): AlternativenPruefung<TeilgruppenAlternative> {
  const roh = suggestAlternativeMethodsForGroup(matrix, geplant, allBlocks, allBlocks.length, opts.phaseDurationMin, opts.constraints);
  const kontext: AlternativenKontext = { ...(opts.phaseDurationMin != null ? { dauerMin: opts.phaseDurationMin } : {}), ...opts.kontext };
  const r = pruefeAlternativen(roh, geplant, new Map(allBlocks.map((b) => [b.kennung, b] as const)), data, kontext);
  return { ...r, alternativen: r.alternativen.slice(0, opts.limit ?? 5) };
}
