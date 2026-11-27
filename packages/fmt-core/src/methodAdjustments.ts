import type { Baustein, Grundlage, MatchRequest, Passungsregel, Regelmeldung, Scheme, TeilgruppenRegelsatz } from './types.js';
import { TECH_RANK } from './technik.js';
import { mehrTechnikAls, setztKiEin } from './bedarf.js';
import {
  getPersonaValues,
  scoreDifferentiationMatrix,
  scoreMethodForGroup,
  suggestAlternativeMethodsForGroup,
  type MatrixScoreResult
} from './differentiationMatrix.js';
import { erstelleRegeln } from './regeln.js';
import { baueSituation } from './situation.js';
import {
  bereinigeProfil,
  entscheideTeilgruppe,
  erfuelltRichtung,
  istGleichwertig,
  type TeilgruppenEntscheidung,
  type TeilgruppenProfil
} from './teilgruppen.js';

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
  /** The group cannot read or write (statement of the group, not a matrix trait). */
  ohneSchrift?: Array<'lesen' | 'schreiben'>;
  /** The group cannot move freely (statement of the group, not a matrix trait). */
  ohneBewegung?: boolean;
}

export interface MethodAdjustmentConstraints {
  maxTechnik?: string;
  ohneInternet?: boolean;
  ohneKI?: boolean;
  bildungsstufe?: string;
  /** Subject area of the plan; methods marked unsuitable for it are never proposed. */
  fachbereich?: string;
  /** Request of the plan (room, time, devices …); a replacement has to cover its needs in the same frame. */
  anfrage?: MatchRequest;
  /** Number of teachers; with two, both methods may bind a teacher. */
  lehrende?: number;
}

/** What the subgroup decision reads: the table "Tausch oder Hilfe", the fit rules and the vocabularies. */
export interface TeilgruppenRegelwerk {
  teilgruppen: TeilgruppenRegelsatz;
  regeln: Passungsregel[];
  schemes: Scheme[];
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
  /** Row of the table "Tausch oder Hilfe" that asks for the swap. */
  merkmal: string;
  grundlage?: Grundlage;
  quelle?: string;
}

export interface SupportProposal {
  stepKey: string;
  groupId: string;
  groupLabel: string;
  antwort: 'hilfe';
  grund: string;
  grundlage?: Grundlage;
  quelle?: string;
  /** Measures of the matrix the help consists of; each says when it is no longer needed. */
  hilfen: Array<{ id: string; name: string; abbau: string }>;
}

/** Subgroups can only be checked when a persona, matrix values or own statements describe their needs. */
export function hasAdjustmentProfile(g: Pick<MethodAdjustmentGroup, 'personaId' | 'selectedValues' | 'ohneSchrift' | 'ohneBewegung'>): boolean {
  return Boolean(g.personaId) || Object.keys(g.selectedValues || {}).length > 0 || Boolean(g.ohneSchrift?.length) || Boolean(g.ohneBewegung);
}

/**
 * Profile of a group for the subgroup decision: persona values below the group's own values. Blocked categories of
 * the persona are dropped here (a persona is no statement of the teacher); blocked categories the group names itself
 * stay and are reported by the decision.
 */
export function teilgruppenProfil(g: MethodAdjustmentGroup, t: TeilgruppenRegelsatz): TeilgruppenProfil {
  const persona = Object.fromEntries(
    Object.entries(g.personaId ? getPersonaValues(g.personaId) : {}).filter(([k]) => !t.gesperrt.includes(k))
  );
  return {
    id: g.id,
    label: g.label,
    selectedValues: { ...persona, ...(g.selectedValues || {}) },
    ...(g.ohneSchrift?.length ? { ohneSchrift: g.ohneSchrift } : {}),
    ...(g.ohneBewegung ? { ohneBewegung: true } : {})
  };
}

/** Matrix result of a group, without the blocked categories of the table. */
export const matrixFuer = (g: MethodAdjustmentGroup, t: TeilgruppenRegelsatz, constraints: MethodAdjustmentConstraints, limit = 10) =>
  scoreDifferentiationMatrix({
    personaId: g.personaId,
    selectedValues: g.selectedValues,
    gesperrt: t.gesperrt,
    maxTechnik: constraints.maxTechnik,
    ohneInternet: constraints.ohneInternet,
    ohneKI: constraints.ohneKI,
    limit
  });

/** Request the equivalence check reads: the given one, or the frame of the constraints. */
function anfrageAus(constraints: MethodAdjustmentConstraints): MatchRequest {
  if (constraints.anfrage) return constraints.anfrage;
  const a: MatchRequest = {};
  if (constraints.maxTechnik) a.maxTechnik = constraints.maxTechnik;
  if (constraints.ohneInternet) a.ohneInternet = true;
  if (constraints.ohneKI) a.ohneKI = true;
  if (constraints.bildungsstufe) a.bildungsstufe = constraints.bildungsstufe;
  if (constraints.fachbereich) a.fachbereich = constraints.fachbereich;
  return a;
}

/** Social form of a measure that contradicts the interaction of the method (e.g. solo work in a group method). */
export function conflictsWithMethodInteraction(measureId: string, block?: Baustein): boolean {
  if (!block) return false;
  const inter = block.interaktion || [];
  const isSocial = inter.includes('kleingruppe-kooperativ') || inter.includes('partner') || inter.includes('plenum-lehrergeleitet') || inter.includes('plenum-lernendengeleitet');
  const isPureSolo = inter.includes('einzel') && !isSocial;
  if (isSocial && measureId === 'sozialform-einzel') return true;
  if (isPureSolo && (measureId === 'sozialform-gruppe' || measureId === 'sozialform-plenum')) return true;
  if (inter.includes('plenum-lehrergeleitet') && measureId === 'methodik-lernprozess-fachspezifisch') return true;
  return false;
}

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
  if (mehrTechnikAls(candidate, current)) return false;
  if (constraints.fachbereich && (candidate.fachbereichUngeeignet || []).includes(constraints.fachbereich)) return false;
  if (needsScaffolding && !candidate.anleitung.some((a) => a === 'explizit' || a === 'geleitet')) return false;
  return true;
}

export interface GleichwertigerKandidat {
  kennung: string;
  name: string;
  reichweite: string;
  dauerMin: number;
  dauerMax: number;
  grund: string;
}

/**
 * Parallel methods that may replace the planned one for a subgroup whose answer is the swap: candidates of
 * suggestAlternativeMethodsForGroup that fulfil the direction of the swap row and are equivalent (istGleichwertig).
 * The matrix fit only orders the equivalent candidates. Empty unless the decision is 'tausch'.
 */
export function gleichwertigeKandidaten(
  allBlocks: Baustein[],
  geplant: Baustein,
  entscheidung: TeilgruppenEntscheidung,
  profil: TeilgruppenProfil,
  matrix: MatrixScoreResult,
  regelsatz: TeilgruppenRegelwerk,
  constraints: MethodAdjustmentConstraints = {},
  dauerMin?: number,
  regeln: ReturnType<typeof erstelleRegeln> = erstelleRegeln(regelsatz.regeln)
): GleichwertigerKandidat[] {
  if (entscheidung.antwort !== 'tausch' || !entscheidung.richtung) return [];
  const byKennung = new Map(allBlocks.map((b) => [b.kennung, b]));
  const anfrage = anfrageAus(constraints);
  const situation = baueSituation(anfrage, regelsatz);
  const candidates = suggestAlternativeMethodsForGroup(matrix, geplant, allBlocks, allBlocks.length, dauerMin, constraints);
  return candidates
    .map((c) => ({ c, block: byKennung.get(c.kennung) }))
    .filter((x): x is { c: GleichwertigerKandidat; block: Baustein } => Boolean(x.block))
    .filter((x) => staysWithinFrame(x.block, geplant, matrix.didacticProfile.needsScaffolding, constraints))
    .filter((x) => erfuelltRichtung(x.block, entscheidung.richtung!))
    .filter(
      (x) =>
        istGleichwertig(x.block, geplant, {
          anfrage,
          situation,
          dauerMin,
          profil,
          lehrende: constraints.lehrende,
          data: regelsatz,
          regeln,
          t: regelsatz.teilgruppen
        }).ok
    )
    .map((x, i) => ({ ...x, i, fit: scoreMethodForGroup(x.block, matrix).fit }))
    .sort((a, b) => b.fit - a.fit || a.i - b.i)
    .map((x) => x.c);
}

/**
 * Proposes parallel methods for learner subgroups where the subgroup decision asks for a swap (the trait's row in
 * teilgruppen.json says swap and the planned method sets off its reason, or a formal need is not covered) and the
 * catalogue holds an equivalent method that fulfils the direction. Deterministic; never changes the method of the
 * main group.
 */
export function proposeMethodAdjustments(
  allBlocks: Baustein[],
  phases: MethodAdjustmentPhase[],
  groups: MethodAdjustmentGroup[],
  constraints: MethodAdjustmentConstraints,
  regelsatz: TeilgruppenRegelwerk
): MethodAdjustment[] {
  const out: MethodAdjustment[] = [];
  const t = regelsatz.teilgruppen;
  const regeln = erstelleRegeln(regelsatz.regeln);
  const planned = new Set(phases.map((p) => p.block?.kennung).filter(Boolean) as string[]);

  for (const g of groups) {
    if (g.isMain) continue;
    if (!hasAdjustmentProfile(g)) continue;
    const profil = teilgruppenProfil(g, t);
    const matrix = matrixFuer(g, t, constraints);
    const usedForGroup = new Set<string>();

    for (const p of phases) {
      if (!p.block || p.locked) continue;
      const e = entscheideTeilgruppe(p.block, profil, t);
      if (e.antwort !== 'tausch') continue;
      const best = gleichwertigeKandidaten(allBlocks, p.block, e, profil, matrix, regelsatz, constraints, p.durationMin, regeln).find(
        (c) => !planned.has(c.kennung) && !usedForGroup.has(c.kennung)
      );
      if (!best) continue;
      usedForGroup.add(best.kennung);
      out.push({
        stepKey: p.key,
        phaseLabel: p.label || p.block.name,
        groupId: g.id,
        groupLabel: g.label,
        vonKennung: p.block.kennung,
        vonName: p.block.name,
        zuKennung: best.kennung,
        zuName: best.name,
        grund: e.grund,
        merkmal: e.merkmal!,
        ...(e.grundlage ? { grundlage: e.grundlage } : {}),
        ...(e.quelle ? { quelle: e.quelle } : {})
      });
    }
  }
  return out;
}

const MAX_HILFEN = 3;

/** Words of the table rows that name no kind of help (the method itself, hedges). */
const KEINE_HILFE = new Set(['method', 'dersel', 'diesel', 'vorsch', 'belegt', 'grenze', 'dafuer', 'gleich']);
const stems = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .split(/[^a-zäöüß]+/)
      .filter((w) => w.length >= 6)
      .map((w) => w.slice(0, 6))
      .filter((w) => !KEINE_HILFE.has(w))
  );

/**
 * Helps of the matrix for a group in one method: core measures that fit the interaction of the method, at most three.
 * Order: measures that name what the table row asks for (shared word stems with its `wohin`), then measures of the
 * help areas (the areas teilgruppen.json gives a sentence on when the help ends), then the order of the matrix.
 */
export function hilfenFuer(
  block: Baustein | undefined,
  matrix: MatrixScoreResult,
  t: TeilgruppenRegelsatz,
  wohin?: string
): Array<{ id: string; name: string; abbau: string }> {
  const gesucht = stems(wohin || '');
  const nennt = (name: string) => [...stems(name)].some((w) => gesucht.has(w));
  const bereich = (id: string) => (id in t.abbau && id !== 'sonst' ? 0 : 1);
  return matrix.topRecommendations
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.relevanz === 'kern' && !conflictsWithMethodInteraction(m.id, block))
    .sort((a, b) => Number(nennt(b.m.name)) - Number(nennt(a.m.name)) || bereich(a.m.oberKategorieId) - bereich(b.m.oberKategorieId) || a.i - b.i)
    .slice(0, MAX_HILFEN)
    .map(({ m }) => ({ id: m.id, name: m.name, abbau: t.abbau[m.oberKategorieId] ?? t.abbau.sonst }));
}

/** The table row's `wohin` behind a decision (for the order of the helps). */
export function wohinVon(e: Pick<TeilgruppenEntscheidung, 'merkmal'>, t: TeilgruppenRegelsatz): string | undefined {
  return e.merkmal === 'sonst' ? t.sonst.wohin : t.merkmale.find((m) => m.id === e.merkmal)?.wohin;
}

/**
 * Helps inside the planned method for subgroups whose answer is 'hilfe'. The method stays; the help is laid on it
 * and names when it is no longer needed. Locked phases get helps as well, since a help does not change the method.
 */
export function proposeSupports(
  phases: MethodAdjustmentPhase[],
  groups: MethodAdjustmentGroup[],
  regelsatz: TeilgruppenRegelwerk,
  constraints: MethodAdjustmentConstraints = {}
): SupportProposal[] {
  const out: SupportProposal[] = [];
  const t = regelsatz.teilgruppen;
  for (const g of groups) {
    if (g.isMain || !hasAdjustmentProfile(g)) continue;
    const profil = teilgruppenProfil(g, t);
    const matrix = matrixFuer(g, t, constraints, 50);
    for (const p of phases) {
      if (!p.block) continue;
      const e = entscheideTeilgruppe(p.block, profil, t);
      if (e.antwort !== 'hilfe') continue;
      const hilfen = hilfenFuer(p.block, matrix, t, wohinVon(e, t));
      if (!hilfen.length) continue;
      out.push({
        stepKey: p.key,
        groupId: g.id,
        groupLabel: g.label,
        antwort: 'hilfe',
        grund: e.grund,
        ...(e.grundlage ? { grundlage: e.grundlage } : {}),
        ...(e.quelle ? { quelle: e.quelle } : {}),
        hilfen
      });
    }
  }
  return out;
}

const GERINGE_LEISTUNG = ['vorwissen-gering', 'leistungsniveau-gering'];

/**
 * Hints on grouping (built-in rules): a subgroup that gets neither a swap nor a help (gruppierung-nur-mit-anpassung),
 * and a group with low prior knowledge or performance in a method that works in cooperative small groups
 * (leistungsschwache-nicht-unter-sich, once per method). Groups whose profile names only blocked categories are left
 * out; the blocked note explains them.
 */
export function teilgruppenHinweise(
  phases: MethodAdjustmentPhase[],
  groups: MethodAdjustmentGroup[],
  adjustments: Pick<MethodAdjustment, 'groupId'>[],
  supports: Pick<SupportProposal, 'groupId' | 'hilfen'>[],
  regelsatz: TeilgruppenRegelwerk
): Regelmeldung[] {
  const t = regelsatz.teilgruppen;
  const regeln = erstelleRegeln(regelsatz.regeln);
  const out: Regelmeldung[] = [];
  const kooperativGemeldet = new Set<string>();
  for (const g of groups) {
    if (g.isMain || !hasAdjustmentProfile(g)) continue;
    const { profil } = bereinigeProfil(teilgruppenProfil(g, t), t);
    const nurGesperrt = !Object.keys(profil.selectedValues).length && !profil.ohneSchrift?.length && !profil.ohneBewegung && !g.personaId;
    if (nurGesperrt) continue;
    const bekommt = adjustments.some((a) => a.groupId === g.id) || supports.some((s) => s.groupId === g.id && s.hilfen.length > 0);
    if (!bekommt) {
      const r = regeln.regel('gruppierung-nur-mit-anpassung');
      const m = r && regeln.meldung(r.id, undefined, `${g.label}: ${r.text}`);
      if (m) out.push(m);
    }
    if (Object.values(profil.selectedValues).some((w) => GERINGE_LEISTUNG.includes(w))) {
      for (const p of phases) {
        if (!p.block || kooperativGemeldet.has(p.block.kennung)) continue;
        if (!(p.block.interaktion || []).includes('kleingruppe-kooperativ')) continue;
        const m = regeln.meldung('leistungsschwache-nicht-unter-sich', p.block);
        if (m) {
          kooperativGemeldet.add(p.block.kennung);
          out.push(m);
        }
      }
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
    !setztKiEin(b) &&
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
  // Methods made for the start of a lesson (entry ticket, daily review) are no check at its end.
  const checksGoal = (b: Baustein) =>
    (b.nachbedingung || []).includes('lernstand-diagnostiziert') && !(b.nachbedingung || []).includes('vorwissen-aktiviert');
  if (!plannedBlocks.some(checksGoal)) {
    const b = pick(
      allBlocks.filter((x) => checksGoal(x) && x.lernfunktion[0] === 'diagnose'),
      profiled
    );
    if (b) {
      add('lernstand', b, profiled, (labels, min) => `Bisher zeigt der Ablauf am Ende nicht, ob auch ${labels} das Ziel erreicht haben. Das wird hier in ${min} Minuten für alle sichtbar.`);
    }
  }
  return out;
}
