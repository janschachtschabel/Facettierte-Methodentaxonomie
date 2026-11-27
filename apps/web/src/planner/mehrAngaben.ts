import type { ArrangementKontext, MatchRequest } from '@fmt/core';

/**
 * Optional details of step 1 ("Mehr Angaben"). Every key is a request field of the core (matcher.felder()); empty
 * means not given. These are the teacher's explicit choices, so they win over what the matcher reads from the text.
 */
export interface MehrAngaben {
  bildungsstufe?: string;
  vorwissen?: string;
  zeitMin?: number;
  sprachniveau?: string;
  komplexitaet?: string;
  /** Form of proof (scheme nachweisform). */
  nachweis?: string;
  /** Larger unit the lesson belongs to (free text). */
  einheit?: string;
  /** Undefined: not stated; the draft then says nothing about grading. */
  bewertet?: boolean;
  /** Empty: the core derives the profile from the Bildungsstufe (and the text). */
  planungsprofil?: string;
  /** Number of teachers or adults in the room (the free text "Lehrkraft / Begleitung" stays for the draft). */
  lehrende?: number;
  fachausstattungArt?: string;
  /** Wished chain ("Funktionskette"); empty: the core chooses the chain from the goal kind. */
  zieltyp?: string;
}

/** Fields whose values are codes of the core (field list of matcher.felder()). */
export const MEHR_ANGABEN_CODEFELDER = [
  'bildungsstufe',
  'vorwissen',
  'sprachniveau',
  'komplexitaet',
  'nachweis',
  'planungsprofil',
  'fachausstattungArt',
  'zieltyp'
] as const;

export type CodeFeld = (typeof MEHR_ANGABEN_CODEFELDER)[number];

const positiv = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : undefined);

/** The request fields of the details; empty values are left out so that nothing unstated is sent. */
export function mehrAngabenInAnfrage(m: MehrAngaben): Partial<MatchRequest> {
  const out: Partial<MatchRequest> = {};
  for (const f of MEHR_ANGABEN_CODEFELDER) {
    const v = m[f];
    if (typeof v === 'string' && v) out[f] = v;
  }
  const zeit = positiv(m.zeitMin);
  if (zeit) out.zeitMin = zeit;
  const lehrende = positiv(m.lehrende);
  if (lehrende) out.lehrende = lehrende;
  const einheit = m.einheit?.trim();
  if (einheit) out.einheit = einheit;
  if (typeof m.bewertet === 'boolean') out.bewertet = m.bewertet;
  return out;
}

/**
 * Reads saved or imported details; files may come from anyone, so only well-formed values are kept and codes must be
 * among the values the core offers for the field (`erlaubt`).
 */
export function mehrAngabenLesen(v: unknown, erlaubt: (feld: CodeFeld) => string[]): MehrAngaben | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  const out: MehrAngaben = {};
  for (const f of MEHR_ANGABEN_CODEFELDER) {
    const x = o[f];
    if (typeof x === 'string' && erlaubt(f).includes(x)) out[f] = x;
  }
  const zeit = positiv(o.zeitMin);
  if (zeit) out.zeitMin = zeit;
  const lehrende = positiv(o.lehrende);
  if (lehrende) out.lehrende = lehrende;
  if (typeof o.einheit === 'string' && o.einheit.trim()) out.einheit = o.einheit;
  if (typeof o.bewertet === 'boolean') out.bewertet = o.bewertet;
  return out;
}

/** The structured fields of a request without its text (what /assistant/translate takes next to the text). */
export function ohneText(req: MatchRequest): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(req)) {
    if (k === 'text' || v === undefined || v === null || v === '') continue;
    out[k] = v;
  }
  return out;
}

/**
 * Details for a scenario saved before "Mehr Angaben" existed: the values its arrangement context still holds (and that
 * still reach the draft and the rule check), so the selects show them and they can be cleared. Codes must be among
 * the values the core offers for the field.
 */
export function mehrAngabenAusKontext(kontext: ArrangementKontext | undefined, erlaubt: (feld: CodeFeld) => string[]): MehrAngaben {
  if (!kontext) return {};
  return (
    mehrAngabenLesen(
      {
        bildungsstufe: kontext.bildungsstufe || kontext.stufe,
        vorwissen: kontext.vorwissen,
        sprachniveau: kontext.sprachniveau,
        komplexitaet: kontext.komplexitaet,
        zeitMin: kontext.zeitbudgetMin
      },
      erlaubt
    ) || {}
  );
}
