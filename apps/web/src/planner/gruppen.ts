import type { LearnerGroup, QuickDiffGroupTemplate } from './scenarioModel.js';

/** A subgroup from a quick chip: all values of the preset, but only its core values count as named. */
export function gruppeAusVorlage(tpl: QuickDiffGroupTemplate): LearnerGroup {
  return {
    id: tpl.id,
    label: tpl.label,
    profile: tpl.profile,
    focus: tpl.focus,
    active: true,
    count: tpl.defaultCount,
    personaId: tpl.personaId,
    matrixValues: { ...tpl.matrixValues },
    genannt: [...tpl.kern]
  };
}

/**
 * Sets (or clears, with an empty value) one matrix value of a group. A value the teacher sets by hand is named; the
 * former value of that category no longer is. Without a core list every value counts already.
 */
export function setzeGruppenwert(g: LearnerGroup, kategorie: string, wert: string): LearnerGroup {
  const alt = g.matrixValues?.[kategorie];
  const matrixValues = { ...(g.matrixValues || {}) };
  if (!wert) delete matrixValues[kategorie];
  else matrixValues[kategorie] = wert;
  if (!g.genannt) return { ...g, matrixValues };
  const genannt = g.genannt.filter((w) => w !== alt);
  if (wert && !genannt.includes(wert)) genannt.push(wert);
  return { ...g, matrixValues, genannt };
}
