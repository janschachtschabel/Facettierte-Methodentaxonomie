import type { Begleitstrang } from '@fmt/core';
import type { GeneratedMaterialItem } from './scenarioModel.js';

/**
 * Accompanying goals in the Baukasten (Paket D, D3): the strand the matcher proposes is a card in step 2 (to take over
 * as the last phase) and material in step 4. Nothing is taken over until the teacher clicks.
 */

/** The strand as a phase at the end, for addExtraPhase. */
export function begleitstrangAlsPhase(s: Begleitstrang) {
  return { art: 'begleitstrang' as const, position: 'ende' as const, kennung: s.baustein, name: s.name, dauerMin: s.dauerMin, grund: s.grund };
}

/** Id of the material made from a strand (one per accompanying goal). */
export const begleitstrangMaterialId = (s: Pick<Begleitstrang, 'begleitziel'>) => `begleitstrang-${s.begleitziel}`;

/** The strand as material of the last phase in step 4. */
export function begleitstrangAlsMaterial(s: Begleitstrang, zielLabel: string, stepKey: string, now = new Date()): GeneratedMaterialItem {
  const content = [
    `# Begleitstrang: ${s.name}`,
    '',
    `Begleitziel: ${zielLabel}`,
    `Am Ende der Stunde, ${s.dauerMin} min`,
    '',
    s.grund,
    '',
    'Wirkungen auf Begleitziele sind für Programme über mehrere Wochen belegt: Wiederhole den Begleitstrang über mehrere Termine.'
  ].join('\n');
  return {
    id: begleitstrangMaterialId(s),
    stepKey,
    title: `Begleitstrang (${zielLabel}): ${s.name}`,
    materialType: 'begleitstrang',
    content,
    createdAt: now.toISOString()
  };
}

/** Notes of the answer that concern accompanying goals (e.g. the note on language helps in step 3). */
export const begleitzielHinweise = (hinweise: string[] | undefined) => (hinweise || []).filter((h) => h.startsWith('Begleitziel '));
