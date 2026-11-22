import type { Arrangement } from '@fmt/core';
import { importArrangementJson } from './arrangementOps.js';
import type {
  GeneratedMaterialItem,
  LearnerGroup,
  OerResource,
  StepDiffSuggestion,
  SubgroupMethodMap,
  ThematicPhaseRow
} from './scenarioModel.js';

export const SAVED_SCENARIOS_KEY = 'fmt_saved_scenarios_v1';

export interface SavedScenario {
  id: string;
  savedAt: string;
  title: string;
  fach: string;
  thema: string;
  hinweise: string;
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
      schemaVersion: '1.3',
      exportedAt: new Date().toISOString(),
      ...scenario
    },
    null,
    2
  );
}

export function importScenarioProjectJson(
  raw: string
):
  | { ok: true; project: Partial<SavedScenario> & { arrangement: Arrangement } }
  | { ok: false; fehler: string } {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, fehler: 'Datei enthält kein gültiges JSON-Objekt.' };
    }
    // Accept either full FmtScenarioProject, NeutralLearningScenario, or plain FMT Arrangement JSON-LD
    const arrCandidate =
      parsed.typ === 'Arrangement'
        ? parsed
        : parsed.arrangement && typeof parsed.arrangement === 'object'
          ? parsed.arrangement
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
    return {
      ok: true,
      project: {
        title:
          typeof parsed.title === 'string'
            ? parsed.title
            : typeof meta.title === 'string'
              ? meta.title
              : checked.arrangement.name,
        fach: typeof parsed.fach === 'string' ? parsed.fach : typeof meta.subject === 'string' ? meta.subject : undefined,
        thema: typeof parsed.thema === 'string' ? parsed.thema : typeof meta.topic === 'string' ? meta.topic : undefined,
        hinweise: typeof parsed.hinweise === 'string' ? parsed.hinweise : undefined,
        lernziele: typeof parsed.lernziele === 'string' ? parsed.lernziele : undefined,
        problemstellung: typeof parsed.problemstellung === 'string' ? parsed.problemstellung : undefined,
        didaktischerAnsatz: typeof parsed.didaktischerAnsatz === 'string' ? parsed.didaktischerAnsatz : undefined,
        lehrkraefteInfo: typeof parsed.lehrkraefteInfo === 'string' ? parsed.lehrkraefteInfo : undefined,
        groups: Array.isArray(parsed.groups) ? (parsed.groups as LearnerGroup[]) : undefined,
        aiDiffByStep:
          parsed.aiDiffByStep && typeof parsed.aiDiffByStep === 'object' && !Array.isArray(parsed.aiDiffByStep)
            ? (parsed.aiDiffByStep as Record<string, StepDiffSuggestion[]>)
            : undefined,
        oerByStep:
          parsed.oerByStep && typeof parsed.oerByStep === 'object' && !Array.isArray(parsed.oerByStep)
            ? (parsed.oerByStep as Record<string, OerResource[]>)
            : undefined,
        subgroupMethods:
          parsed.subgroupMethods && typeof parsed.subgroupMethods === 'object' && !Array.isArray(parsed.subgroupMethods)
            ? (parsed.subgroupMethods as SubgroupMethodMap)
            : undefined,
        generatedMaterials: Array.isArray(parsed.generatedMaterials)
          ? (parsed.generatedMaterials as GeneratedMaterialItem[])
          : undefined,
        thematicRows: Array.isArray(parsed.thematicRows) ? (parsed.thematicRows as ThematicPhaseRow[]) : null,
        elaboration: typeof parsed.elaboration === 'string' ? parsed.elaboration : null,
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
