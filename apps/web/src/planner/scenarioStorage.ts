import { GESPERRTE_MATRIX_KATEGORIEN, type Arrangement, type Begleitstrang, type MatchRequest, type MatchResult, type Regelmeldung } from '@fmt/core';
import { importArrangementJson } from './arrangementOps.js';
import type { AddedPhase } from './extraPhases.js';
import type { MehrAngaben } from './mehrAngaben.js';
import { safeExternalUrl, safeOerList } from './safeUrl.js';
import type {
  GeneratedMaterialItem,
  LearnerGroup,
  OerResource,
  StepDiffSuggestion,
  SubgroupMethodMap,
  ThematicPhaseRow
} from './scenarioModel.js';

export const SAVED_SCENARIOS_KEY = 'fmt_saved_scenarios_v1';
export const ACTIVE_PLANNER_DRAFT_KEY = 'fmt_active_planner_draft_v1';
export const DIFF_HANDOFF_KEY = 'fmt_diff_handoff_v1';

export interface ActivePlannerDraft {
  updatedAt: string;
  title: string;
  fach: string;
  thema: string;
  scenarioText: string;
  bildungsstufe?: string;
  zeitMin?: number;
  maxTechnik: string;
  ohneInternet: boolean;
  ohneKI: boolean;
  arrangement: Arrangement;
  groups: LearnerGroup[];
  /** Request of step 1 as the matcher read it (room, time …); the subgroup check reads it. */
  anfrage?: MatchRequest;
}

export function saveActivePlannerDraft(draft: ActivePlannerDraft): void {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(ACTIVE_PLANNER_DRAFT_KEY, JSON.stringify(draft));
    }
  } catch {
    // ignore storage errors
  }
}

export function loadActivePlannerDraft(): ActivePlannerDraft | null {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    const raw = window.sessionStorage.getItem(ACTIVE_PLANNER_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActivePlannerDraft>;
    if (!parsed || typeof parsed !== 'object' || !parsed.arrangement || parsed.arrangement.typ !== 'Arrangement') {
      return null;
    }
    return parsed as ActivePlannerDraft;
  } catch {
    return null;
  }
}

export interface SavedScenario {
  id: string;
  savedAt: string;
  title: string;
  fach: string;
  thema: string;
  hinweise: string;
  scenarioText?: string;
  ansatzCodes?: string[];
  customAnsatzText?: string;
  gruppeSize?: string;
  maxTechnik?: string;
  ohneInternet?: boolean;
  ohneKI?: boolean;
  raumzeitFilter?: string;
  /** Room type of the lesson (vocab raumtyp). Older entries name it raumFilter or lernort; see rahmenAusAltbestand. */
  raum?: string;
  /** Room properties the teacher set by hand (vocab raumbedarf); absent: what the room type offers. */
  raumBietet?: string[];
  /** What the learners cannot do yet: 'lesen', 'schreiben'. */
  ohneSchrift?: string[];
  /** Number of dates the unit runs over. */
  termine?: string;
  /** Accompanying goals chosen in step 1 (codes of the scheme begleitziel). */
  begleitziele?: string[];
  /** Optional details of "Mehr Angaben" (request fields); read back with mehrAngabenLesen, which checks the codes. */
  mehrAngaben?: MehrAngaben;
  lernziele?: string;
  problemstellung?: string;
  didaktischerAnsatz?: string;
  lehrkraefteInfo?: string;
  arrangement: Arrangement;
  groups: LearnerGroup[];
  aiDiffByStep: Record<string, StepDiffSuggestion[]>;
  oerByStep: Record<string, OerResource[]>;
  subgroupMethods?: SubgroupMethodMap;
  generatedMaterials?: GeneratedMaterialItem[];
  thematicRows?: ThematicPhaseRow[] | null;
  elaboration: string | null;
  /** What the draft in step 5 takes from the matcher's answer; kept so a loaded scenario keeps its draft. */
  entwurfAngaben?: EntwurfAngaben;
  /** Accompanying strands taken into the flow (step 2), so "Wieder entfernen" works after loading. */
  begleitPhasen?: AddedPhase[];
}

/**
 * The parts of the matcher's answer the draft (step 5) and the notes of step 2 read: planning profile, unit, form of
 * proof, rule notes, accompanying goals and strands. Saved with the scenario, because loading does not match again.
 */
export interface EntwurfAngaben {
  planungsprofil?: string;
  planungsprofilAngenommen?: boolean;
  /** The request stated the profile (chosen in step 1 or 5); clearing the choice then derives it again. */
  planungsprofilGewaehlt?: boolean;
  /** Whether the lesson is graded, as the request stated it; absent when not stated. */
  bewertet?: boolean;
  /**
   * Of einheit, bewertet and nachweis: those the request set as explicit field (not only read from the text). When such
   * a choice is cleared, the draft must not keep the value from this answer.
   */
  gewaehlt?: GewaehltesFeld[];
  /** Room the matcher assumed (code), when the request names none. */
  raumAngenommen?: string;
  /** Room as the matcher read it (code). */
  raum?: string;
  einheit?: string;
  zielart?: string;
  /** Forms of proof (codes of nachweisform). */
  nachweis?: string[];
  regelmeldungen?: Regelmeldung[];
  /** Accompanying goals as the matcher read them (codes). */
  begleitziele?: string[];
  begleitstrang?: Begleitstrang[];
  hinweise?: string[];
}

export type GewaehltesFeld = 'einheit' | 'bewertet' | 'nachweis';
const GEWAEHLTE_FELDER: GewaehltesFeld[] = ['einheit', 'bewertet', 'nachweis'];

/** The draft's parts of a matcher answer. */
export function entwurfAngabenAus(r: MatchResult): EntwurfAngaben {
  const k = (r.kriterien || {}) as Record<string, unknown>;
  // A field counts as chosen when the request holds it but the text reading (erkannt) does not, or reads another value.
  const gewaehlt = GEWAEHLTE_FELDER.filter((f) => {
    if (k[f] === undefined || k[f] === null || k[f] === '') return false;
    const gelesen = (r.erkannt || []).find((e) => e.feld === f);
    return !gelesen || gelesen.wert !== k[f];
  });
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  const angenommenRaum = r.pflichtangaben?.angenommen.find((x) => x.feld === 'raum')?.wert;
  return {
    planungsprofil: r.planungsprofil,
    planungsprofilAngenommen: (r.pflichtangaben?.angenommen || []).some((x) => x.feld === 'planungsprofil'),
    planungsprofilGewaehlt: typeof k.planungsprofil === 'string' && k.planungsprofil !== '',
    bewertet: typeof k.bewertet === 'boolean' ? k.bewertet : undefined,
    gewaehlt,
    raumAngenommen: angenommenRaum ? String(angenommenRaum) : undefined,
    raum: str(k.raum),
    einheit: str(k.einheit),
    zielart: str(k.zielart),
    nachweis: r.nachweis?.formen,
    regelmeldungen: r.regelmeldungen,
    begleitziele: Array.isArray(k.begleitziel) ? (k.begleitziel as string[]) : [],
    begleitstrang: r.modus === 'ablauf' ? r.begleitstrang : undefined,
    hinweise: r.hinweise
  };
}

/** Reads saved or imported strands taken into the flow; malformed entries are dropped. */
export function begleitPhasenLesen(v: unknown): AddedPhase[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v
    .filter((y): y is Record<string, unknown> => Boolean(y) && typeof y === 'object')
    .filter((y) => typeof y.kennung === 'string' && typeof y.name === 'string' && typeof y.dauerMin === 'number')
    .map((y) => ({
      art: 'begleitstrang' as const,
      kennung: y.kennung as string,
      name: y.name as string,
      dauerMin: y.dauerMin as number,
      grund: typeof y.grund === 'string' ? y.grund : '',
      donors: (Array.isArray(y.donors) ? y.donors : [])
        .filter((d): d is { kennung: string; minutes: number } => Boolean(d) && typeof d.kennung === 'string' && typeof d.minutes === 'number')
        .map((d) => ({ kennung: d.kennung, minutes: d.minutes }))
    }));
}

/** Reads saved or imported draft parts; files may come from anyone, so only well-formed values are kept. */
export function entwurfAngabenLesen(v: unknown): EntwurfAngaben | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === 'string' && x ? x : undefined);
  const strs = (x: unknown) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === 'string') : undefined);
  const objs = <T>(x: unknown, ok: (y: Record<string, unknown>) => boolean) =>
    Array.isArray(x) ? (x.filter((y) => y && typeof y === 'object' && ok(y as Record<string, unknown>)) as T[]) : undefined;
  return {
    planungsprofil: str(o.planungsprofil),
    planungsprofilAngenommen: o.planungsprofilAngenommen === true,
    planungsprofilGewaehlt: o.planungsprofilGewaehlt === true,
    bewertet: typeof o.bewertet === 'boolean' ? o.bewertet : undefined,
    gewaehlt: strs(o.gewaehlt)?.filter((x): x is GewaehltesFeld => (GEWAEHLTE_FELDER as string[]).includes(x)),
    raumAngenommen: str(o.raumAngenommen),
    raum: str(o.raum),
    einheit: str(o.einheit),
    zielart: str(o.zielart),
    nachweis: strs(o.nachweis),
    regelmeldungen: objs<Regelmeldung>(o.regelmeldungen, (y) => typeof y.regel === 'string' && typeof y.text === 'string'),
    begleitziele: strs(o.begleitziele),
    begleitstrang: objs<Begleitstrang>(
      o.begleitstrang,
      (y) => typeof y.begleitziel === 'string' && typeof y.baustein === 'string' && typeof y.name === 'string' && typeof y.dauerMin === 'number' && typeof y.grund === 'string'
    ),
    hinweise: strs(o.hinweise)
  };
}

/**
 * Room and writing details of a saved scenario. Entries from before FMT 2.0 carry the room as `lernort`
 * (former API field) or `raumFilter`, and reading as the flag `ohneLesen`; they are read into the new fields.
 */
export function rahmenAusAltbestand(p: Record<string, unknown>): Pick<SavedScenario, 'raum' | 'raumBietet' | 'ohneSchrift' | 'termine'> {
  const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined);
  const strList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined);
  const raum = str(p.raum) || str(p.raumFilter) || str(p.lernort);
  const ohneSchrift = strList(p.ohneSchrift) ?? (p.ohneLesen === true ? ['lesen', 'schreiben'] : undefined);
  const termine = typeof p.termine === 'number' ? String(p.termine) : str(p.termine);
  const out: Pick<SavedScenario, 'raum' | 'raumBietet' | 'ohneSchrift' | 'termine'> = {};
  if (raum) out.raum = raum;
  const bietet = strList(p.raumBietet);
  if (bietet) out.raumBietet = bietet;
  if (ohneSchrift) out.ohneSchrift = ohneSchrift;
  if (termine) out.termine = termine;
  return out;
}

/**
 * Blocked matrix categories (Lerntypen, data/teilgruppen.json `gesperrt`) are not evaluated. A saved scenario that
 * still names one loads; the value is dropped here, and `entfernt` tells step 3 to show the note once.
 */
export function ohneGesperrteMerkmale(
  groups: LearnerGroup[],
  gesperrt: readonly string[] = GESPERRTE_MATRIX_KATEGORIEN
): { groups: LearnerGroup[]; entfernt: boolean } {
  let entfernt = false;
  const out = groups.map((g) => {
    const werte = g.matrixValues || {};
    if (!Object.keys(werte).some((k) => gesperrt.includes(k))) return g;
    entfernt = true;
    return { ...g, matrixValues: Object.fromEntries(Object.entries(werte).filter(([k]) => !gesperrt.includes(k))) };
  });
  return { groups: out, entfernt };
}

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function getBrowserStorage(): StorageAdapter {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Privacy mode fallback
  }
  const mem = new Map<string, string>();
  return {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => {
      mem.set(k, v);
    }
  };
}

export function loadSavedScenarios(storage: StorageAdapter = getBrowserStorage()): SavedScenario[] {
  try {
    const raw = storage.getItem(SAVED_SCENARIOS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is SavedScenario =>
          Boolean(item) &&
          typeof item === 'object' &&
          typeof item.id === 'string' &&
          typeof item.title === 'string' &&
          Boolean(item.arrangement) &&
          item.arrangement.typ === 'Arrangement'
      )
      .map((item) => {
        const { raumFilter: _r, lernort: _l, ohneLesen: _o, ...rest } = item as SavedScenario & Record<string, unknown>;
        return { ...rest, ...rahmenAusAltbestand(item as unknown as Record<string, unknown>) } as SavedScenario;
      });
  } catch {
    return [];
  }
}

export function saveScenarioToStorage(
  scenario: Omit<SavedScenario, 'id' | 'savedAt'> & { id?: string },
  storage: StorageAdapter = getBrowserStorage()
): { saved: SavedScenario; list: SavedScenario[] } {
  const list = loadSavedScenarios(storage);
  const id = scenario.id || `sc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const saved: SavedScenario = {
    ...scenario,
    id,
    savedAt: new Date().toISOString()
  };
  const next = [saved, ...list.filter((x) => x.id !== id)].slice(0, 40);
  try {
    storage.setItem(SAVED_SCENARIOS_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota exceeded
  }
  return { saved, list: next };
}

export function deleteSavedScenario(
  id: string,
  storage: StorageAdapter = getBrowserStorage()
): SavedScenario[] {
  const next = loadSavedScenarios(storage).filter((x) => x.id !== id);
  try {
    storage.setItem(SAVED_SCENARIOS_KEY, JSON.stringify(next));
  } catch {
    // Ignore
  }
  return next;
}

export function exportScenarioProjectJson(scenario: Omit<SavedScenario, 'id' | 'savedAt'>): string {
  return JSON.stringify(
    {
      '@type': 'FmtScenarioProject',
      schemaVersion: '1.4',
      exportedAt: new Date().toISOString(),
      ...scenario
    },
    null,
    2
  );
}

function extractEmbeddedJsonFromHtml(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('<')) return null;
  const projectMatch = trimmed.match(/<script[^>]*id=["']fmt-scenario-project["'][^>]*>([\s\S]*?)<\/script>/i);
  if (projectMatch?.[1]?.trim()) return projectMatch[1].trim();
  const ldMatch = trimmed.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (ldMatch?.[1]?.trim()) return ldMatch[1].trim();
  return null;
}

export function importScenarioProjectJson(
  raw: string
):
  | { ok: true; project: Partial<SavedScenario> & { arrangement: Arrangement } }
  | { ok: false; fehler: string } {
  try {
    const jsonSource = extractEmbeddedJsonFromHtml(raw) ?? raw;
    const parsed = JSON.parse(jsonSource) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, fehler: 'Datei enthält kein gültiges JSON-Objekt.' };
    }
    // Accept full FmtScenarioProject, API/MCP FmtScenarioPlan (maschinenlesbar), NeutralLearningScenario, HTML handout, or plain FMT Arrangement JSON-LD
    const maschinenlesbar =
      parsed.maschinenlesbar && typeof parsed.maschinenlesbar === 'object'
        ? (parsed.maschinenlesbar as Record<string, unknown>)
        : null;
    const arrCandidate =
      parsed.typ === 'Arrangement'
        ? parsed
        : parsed.arrangement && typeof parsed.arrangement === 'object'
          ? parsed.arrangement
          : maschinenlesbar?.arrangement && typeof maschinenlesbar.arrangement === 'object'
            ? maschinenlesbar.arrangement
            : parsed.fmt_arrangement && typeof parsed.fmt_arrangement === 'object'
              ? parsed.fmt_arrangement
              : null;
    if (!arrCandidate) {
      return { ok: false, fehler: 'Kein gültiges FMT-Arrangement in der Datei gefunden.' };
    }
    const checked = importArrangementJson(JSON.stringify(arrCandidate));
    if (!checked.ok) return checked;

    const meta = (parsed.metadata && typeof parsed.metadata === 'object' ? parsed.metadata : {}) as Record<
      string,
      unknown
    >;

    // Normalize groups from either SavedScenario.groups OR API/MCP lerngruppenUndMatrix
    let groups: LearnerGroup[] | undefined = Array.isArray(parsed.groups) ? (parsed.groups as LearnerGroup[]) : undefined;
    if (!groups && Array.isArray(parsed.lerngruppenUndMatrix)) {
      groups = (parsed.lerngruppenUndMatrix as Array<Record<string, unknown>>).map((g, i) => ({
        id: String(g.id || `grp-${i}`),
        label: String(g.label || `Gruppe ${i + 1}`),
        focus: i === 0 ? 'basis' : i === 2 ? 'vertiefung' : 'regel',
        profile: String(
          g.profile ||
            (g.didacticProfile && typeof g.didacticProfile === 'object'
              ? (g.didacticProfile as Record<string, unknown>).summary || ''
              : '') ||
            (Array.isArray(g.matrixTop) ? g.matrixTop.join('; ') : '')
        ),
        active: true,
        count: typeof g.count === 'number' ? g.count : undefined,
        personaId: typeof g.personaId === 'string' ? g.personaId : undefined,
        matrixValues:
          g.selectedValues && typeof g.selectedValues === 'object'
            ? (g.selectedValues as Record<string, string>)
            : undefined,
        ...(Array.isArray(g.genannt) ? { genannt: g.genannt.filter((x): x is string => typeof x === 'string') } : {}),
        ...(Array.isArray(g.ohneSchrift)
          ? { ohneSchrift: g.ohneSchrift.filter((x): x is 'lesen' | 'schreiben' => x === 'lesen' || x === 'schreiben') }
          : {}),
        ...(g.ohneBewegung === true ? { ohneBewegung: true } : {})
      }));
    }

    // Normalize thematicRows from either thematicRows, thematischeTabelle (API/MCP), or maschinenlesbar.thematicRows
    const thematicRows = Array.isArray(parsed.thematicRows)
      ? (parsed.thematicRows as ThematicPhaseRow[])
      : Array.isArray(parsed.thematischeTabelle)
        ? (parsed.thematischeTabelle as ThematicPhaseRow[])
        : Array.isArray(maschinenlesbar?.thematicRows)
          ? (maschinenlesbar!.thematicRows as ThematicPhaseRow[])
          : null;

    // Normalize OER from either oerByStep OR API/MCP wloOerRessourcen
    // Imported files may come from anyone: keep only OER entries with http(s)/mailto links.
    let oerByStep: Record<string, OerResource[]> | undefined =
      parsed.oerByStep && typeof parsed.oerByStep === 'object' && !Array.isArray(parsed.oerByStep)
        ? Object.fromEntries(
            Object.entries(parsed.oerByStep as Record<string, OerResource[]>).map(([k, v]) => [k, safeOerList(v)])
          )
        : undefined;
    if (!oerByStep && Array.isArray(parsed.wloOerRessourcen) && parsed.wloOerRessourcen.length > 0) {
      const firstKey = thematicRows?.[0]?.key || 'step-0';
      oerByStep = {
        [firstKey]: (parsed.wloOerRessourcen as Array<Record<string, unknown>>)
          .filter((o) => !!o && typeof o === 'object' && !!safeExternalUrl(o.wwwurl || o.url))
          .map((o, i) => {
            const href = safeExternalUrl(o.wwwurl || o.url);
            return {
              id: `imported-oer-${i}`,
              title: String(o.titel || o.title || 'WLO-OER'),
              description: '',
              url: href,
              wwwurl: href,
              wloRenderUrl: safeExternalUrl(o.wloRenderUrl) || null,
              license: typeof o.lizenz === 'string' ? o.lizenz : null,
              resourceType: typeof o.medientyp === 'string' ? o.medientyp : null,
              source: 'wlo'
            };
          })
      };
    }

    const strOrUndef = (v: unknown) => (typeof v === 'string' ? v : undefined);

    return {
      ok: true,
      project: {
        title:
          strOrUndef(parsed.title) ||
          strOrUndef(maschinenlesbar?.title) ||
          strOrUndef(meta.title) ||
          checked.arrangement.name,
        fach: strOrUndef(parsed.fach) || strOrUndef(maschinenlesbar?.fach) || strOrUndef(meta.subject),
        thema: strOrUndef(parsed.thema) || strOrUndef(maschinenlesbar?.thema) || strOrUndef(meta.topic),
        hinweise: strOrUndef(parsed.hinweise),
        scenarioText: strOrUndef(parsed.scenarioText) || strOrUndef(maschinenlesbar?.scenarioText),
        ansatzCodes: Array.isArray(parsed.ansatzCodes) ? parsed.ansatzCodes.map(String) : undefined,
        customAnsatzText: strOrUndef(parsed.customAnsatzText),
        gruppeSize: strOrUndef(parsed.gruppeSize),
        maxTechnik: strOrUndef(parsed.maxTechnik),
        ohneInternet: typeof parsed.ohneInternet === 'boolean' ? parsed.ohneInternet : undefined,
        ohneKI: typeof parsed.ohneKI === 'boolean' ? parsed.ohneKI : undefined,
        raumzeitFilter: strOrUndef(parsed.raumzeitFilter),
        ...rahmenAusAltbestand(parsed),
        begleitziele: Array.isArray(parsed.begleitziele) ? parsed.begleitziele.filter((x): x is string => typeof x === 'string') : undefined,
        mehrAngaben:
          parsed.mehrAngaben && typeof parsed.mehrAngaben === 'object' && !Array.isArray(parsed.mehrAngaben)
            ? (parsed.mehrAngaben as MehrAngaben)
            : undefined,
        lernziele: strOrUndef(parsed.lernziele) || strOrUndef(maschinenlesbar?.lernziele),
        problemstellung: strOrUndef(parsed.problemstellung),
        didaktischerAnsatz: strOrUndef(parsed.didaktischerAnsatz) || strOrUndef(maschinenlesbar?.didaktischerAnsatz),
        lehrkraefteInfo: strOrUndef(parsed.lehrkraefteInfo),
        groups,
        aiDiffByStep:
          parsed.aiDiffByStep && typeof parsed.aiDiffByStep === 'object' && !Array.isArray(parsed.aiDiffByStep)
            ? (parsed.aiDiffByStep as Record<string, StepDiffSuggestion[]>)
            : undefined,
        oerByStep,
        subgroupMethods:
          parsed.subgroupMethods && typeof parsed.subgroupMethods === 'object' && !Array.isArray(parsed.subgroupMethods)
            ? (parsed.subgroupMethods as SubgroupMethodMap)
            : undefined,
        generatedMaterials: Array.isArray(parsed.generatedMaterials)
          ? (parsed.generatedMaterials as GeneratedMaterialItem[])
          : undefined,
        thematicRows,
        elaboration: strOrUndef(parsed.elaboration) || strOrUndef(parsed.ausarbeitung) || null,
        entwurfAngaben: entwurfAngabenLesen(parsed.entwurfAngaben),
        begleitPhasen: begleitPhasenLesen(parsed.begleitPhasen),
        arrangement: checked.arrangement
      }
    };
  } catch (e) {
    return { ok: false, fehler: 'Ungültige Projektdatei: ' + (e instanceof Error ? e.message : String(e)) };
  }
}

/**
 * Prints a self-contained HTML document cleanly via an invisible iframe
 * (works without popup blockers and yields crisp vector A4 PDFs via browser Print-to-PDF).
 */
export function printHtmlDocument(html: string): void {
  if (typeof document === 'undefined') return;
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  const cleanup = () => {
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 1500);
  };

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc || !iframe.contentWindow) {
    cleanup();
    window.print();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const triggerPrint = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      cleanup();
    }
  };

  // Wait a short tick so fonts & inline SVGs lay out before opening the print/PDF dialog
  setTimeout(triggerPrint, 180);
}
