import type { FmtMatcher } from '@fmt/core';

/**
 * Subject area from the optional "Fach" field of step 1 (Baukasten without AI).
 * Only fills a gap: a subject the text names (or its topic implies) keeps priority, so a field that was
 * filled automatically from the text cannot override what the text says.
 */
export function fachbereichFromField(matcher: FmtMatcher, scenarioText: string, fach: string): string | undefined {
  if (!fach.trim()) return undefined;
  if (matcher.lesen(scenarioText).kriterien.fachbereich) return undefined;
  const fb = matcher.lesen(fach).kriterien.fachbereich;
  return typeof fb === 'string' ? fb : undefined;
}
