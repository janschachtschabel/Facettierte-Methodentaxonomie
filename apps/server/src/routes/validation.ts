/**
 * Shared request checks for REST and MCP. Malformed input must end in a 400 with a German message,
 * never in a 500 from a TypeError deep inside the core.
 */

/** Longest free text accepted for scenario and search fields. Longer texts block the event loop for a noticeable time. */
export const MAX_TEXT_CHARS = 8000;

/** A request the caller can fix; routes answer it with HTTP 400. */
export class InvalidRequestError extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Name of the first field whose text exceeds MAX_TEXT_CHARS, or null. */
export function firstTooLongText(obj: unknown, fields: string[]): string | null {
  if (!isObject(obj)) return null;
  return fields.find((f) => typeof obj[f] === 'string' && (obj[f] as string).length > MAX_TEXT_CHARS) ?? null;
}

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
