import type { Baustein } from '@fmt/core';

/** What a finding rests on, as a phrase after "Der Befund" (Evidenzaussage.evidenzBezug). */
export const EVIDENZBEZUG_TEXT: Record<'methode' | 'prinzip' | 'programm', string> = {
  methode: 'gilt der Methode',
  prinzip: 'gilt dem Wirkprinzip',
  programm: 'gilt ganzen Programmen, nicht der einzelnen Phase'
};

/** Short form next to the grade in the planner. */
export const EVIDENZBEZUG_KURZ: Record<'methode' | 'prinzip' | 'programm', string> = {
  methode: 'Befund zur Methode',
  prinzip: 'Befund zum Wirkprinzip',
  programm: 'Befund zu ganzen Programmen'
};

/**
 * What the findings of the given grade rest on (methode, prinzip, programm), in plain German and in the order
 * methode, prinzip, programm. Empty when the findings of that grade name no reference.
 */
export function evidenzBezugBeiGrad(b: Pick<Baustein, 'evidenz'> | undefined, grad: string | null | undefined): string[] {
  if (!b || !grad) return [];
  const da = new Set((b.evidenz || []).filter((e) => e.grad === grad).map((e) => e.evidenzBezug));
  return (['methode', 'prinzip', 'programm'] as const).filter((k) => da.has(k)).map((k) => EVIDENZBEZUG_KURZ[k]);
}
