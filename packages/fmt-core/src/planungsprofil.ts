import type { Planungsprofil } from './types.js';

export type { Planungsprofil, Kernfeld, PlanungsprofileRegelsatz } from './types.js';

/** Words in the request text that mark company training (case-insensitive, whole words; "am Arbeitsplatz" as a phrase). */
const BETRIEB = /(?<![\p{L}\p{N}])(betrieb|unterweisung|ausbilder|ausbilderin|lehrwerkstatt|am\s+arbeitsplatz)(?![\p{L}\p{N}])/iu;

const NACH_STUFE: Record<string, Planungsprofil['id']> = {
  primar: 'schule',
  sek1: 'schule',
  sek2: 'schule',
  hochschule: 'hochschule',
  erwachsenenbildung: 'erwachsenenbildung'
};

/**
 * Picks the planning profile: an explicit known `planungsprofil` wins, then the Bildungsstufe decides
 * (berufsbildung: betrieb when the text names company training, else berufsschule).
 * Without both, the profile is schule and `angenommen` is true.
 */
export function waehlePlanungsprofil(
  profile: Planungsprofil[],
  a: { planungsprofil?: string; bildungsstufe?: string; text?: string }
): { profil: Planungsprofil; angenommen: boolean } {
  const finde = (id: string) => profile.find((p) => p.id === id);
  const explizit = a.planungsprofil && finde(a.planungsprofil);
  if (explizit) return { profil: explizit, angenommen: false };
  const stufe = a.bildungsstufe;
  const id = stufe === 'berufsbildung' ? (BETRIEB.test(a.text || '') ? 'betrieb' : 'berufsschule') : stufe && NACH_STUFE[stufe];
  const profil = id && finde(id);
  if (profil) return { profil, angenommen: false };
  const schule = finde('schule');
  if (!schule) throw new Error('Planungsprofil „schule“ fehlt in data/planungsprofile.json.');
  return { profil: schule, angenommen: true };
}
