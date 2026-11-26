import type { Arrangement } from '@fmt/core';
import { importArrangementJson } from './arrangementOps.js';
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
  /** Room type of the lesson (vocab raumtyp). */
  raumFilter?: string;
  /** Learners cannot read (and write) yet. */
  ohneLesen?: boolean;
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
    return parsed.filter(
      (item): item is SavedScenario =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof item.id === 'string' &&
        typeof item.title === 'string' &&
        Boolean(item.arrangement) &&
        item.arrangement.typ === 'Arrangement'
    );
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
            : undefined
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
        raumFilter: strOrUndef(parsed.raumFilter),
        ohneLesen: typeof parsed.ohneLesen === 'boolean' ? parsed.ohneLesen : undefined,
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
