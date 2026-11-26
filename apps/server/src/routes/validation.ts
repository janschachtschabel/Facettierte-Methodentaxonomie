/**
 * Shared request checks for REST and MCP. Malformed input must end in a 400 with a German message,
 * never in a 500 from a TypeError deep inside the core.
 */

/** Longest free text accepted for scenario and search fields. Longer texts block the event loop for a noticeable time. */
export const MAX_TEXT_CHARS = 8000;

/** A request the caller can fix; routes answer it with HTTP 400. */
export class InvalidRequestError extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function tooLongMessage(field: string): string {
  return `Feld „${field}“ ist zu lang (max. ${MAX_TEXT_CHARS} Zeichen).`;
}

/** Groups as the adapt and plan endpoints expect them: objects with a string id and label. */
export function isGroupList(v: unknown): boolean {
  return Array.isArray(v) && v.every((g) => isObject(g) && typeof g.id === 'string' && typeof g.label === 'string');
}

/** Phases for adapt: objects with a string phaseLabel. */
export function isPhaseList(v: unknown): boolean {
  return Array.isArray(v) && v.every((p) => isObject(p) && typeof p.phaseLabel === 'string');
}

/** Groups for material generation: objects with a string label. */
export function isMaterialGroupList(v: unknown): boolean {
  return Array.isArray(v) && v.every((g) => isObject(g) && typeof g.label === 'string');
}

/**
 * Path of the first string anywhere in a JSON value that exceeds MAX_TEXT_CHARS, e.g. "gruppen[0].text", or null.
 * Depth is bounded so a deeply nested body cannot exhaust the stack.
 */
export function findTooLongString(value: unknown, path = '', depth = 0): string | null {
  if (typeof value === 'string') return value.length > MAX_TEXT_CHARS ? path || '(Text)' : null;
  if (!value || typeof value !== 'object' || depth > 64) return null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findTooLongString(value[i], `${path}[${i}]`, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  for (const [k, v] of Object.entries(value)) {
    if (k.length > MAX_TEXT_CHARS) return path ? `${path}.(Schlüssel)` : '(Schlüssel)';
    const hit = findTooLongString(v, path ? `${path}.${k}` : k, depth + 1);
    if (hit) return hit;
  }
  return null;
}
