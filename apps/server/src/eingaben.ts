import {
  DIFF_MATRIX_PERSONAS,
  MEASURE_EFFORT_ORDER,
  MEASURE_LEVEL_ORDER,
  QUICK_LEARNER_GROUP_PROFILES,
  unbekannterWert,
  zahlFehler,
  type BlockStatus,
  type FeldFehler,
  type ZahlGrenze
} from '@fmt/core';
import { schemeValues, type CatalogStore } from './catalog-store.js';

/**
 * Input checks REST and MCP share: codes against the core value lists (matcher.felder(), the schemes and the lists of
 * the differentiation matrix), whole numbers and the known catalogue entries. Every message has the wording of the
 * core (unbekannterWert, zahlFehler); REST sends it with status 400, MCP as errorResult.
 */
export type EingabeFehler = FeldFehler;

/** Kinds of material the template and the briefing know (REST /assistant/material, MCP generate_phase_material). */
export const MATERIAL_TYPEN = ['arbeitsblatt', 'infoblatt', 'quiz', 'checkliste', 'versuchsanleitung', 'diskussionskarten', 'glossar'] as const;

/** Status of a catalogue entry (core type BlockStatus). */
const STATUS: readonly BlockStatus[] = ['kuratiert', 'entwurf'];

type Wert = { code: string; label?: string };

const nurCodes = (codes: readonly string[]): Wert[] => codes.map((code) => ({ code }));
const ausSchema = (store: CatalogStore, schema: string): Wert[] => schemeValues(store.bundle, schema).map((w) => ({ code: w.id, label: w.label }));

/**
 * Allowed values of an input field with their labels: request fields from matcher.felder() (lernort as raum), the
 * other code fields from their core lists, facets from their scheme. Undefined for fields without a value list.
 */
function werteVon(store: CatalogStore, feld: string): Wert[] | undefined {
  const f = store.matcher.felder().find((x) => x.feld === (feld === 'lernort' ? 'raum' : feld));
  if (f?.werte) return f.werte;
  switch (feld) {
    case 'eintragsart':
      return ausSchema(store, 'eintragsart');
    case 'minEvidenz':
      return ausSchema(store, 'evidenzgrad');
    case 'status':
      return nurCodes(STATUS);
    case 'quickProfileId':
      return QUICK_LEARNER_GROUP_PROFILES.map((p) => ({ code: p.id, label: p.label }));
    case 'personaId':
      return DIFF_MATRIX_PERSONAS.map((p) => ({ code: p.id, label: p.name }));
    case 'maxAufwand':
      return nurCodes(Object.keys(MEASURE_EFFORT_ORDER));
    case 'ebenen':
      return nurCodes(Object.keys(MEASURE_LEVEL_ORDER));
    case 'materialTyp':
      return nurCodes(MATERIAL_TYPEN);
  }
  const facette = store.bundle.facetten.find((x) => x.feld === feld);
  return facette ? ausSchema(store, (facette.schema as string | undefined) || feld) : undefined;
}

/** Allowed codes of an input field (see werteVon). */
export function erlaubteCodes(store: CatalogStore, feld: string): string[] | undefined {
  return werteVon(store, feld)?.map((w) => w.code);
}

const liste = (x: unknown): string[] => (x == null || x === '' ? [] : Array.isArray(x) ? x.map(String) : [String(x)]);

export interface CodeOptionen {
  /** Allowed codes that differ from the field's own list (e.g. the search takes fachbereich "uebergreifend"). */
  eigene?: Record<string, readonly string[]>;
  /** Fields that take a label as well as a code (case ignored), as the draft reads them. */
  mitLabel?: readonly string[];
}

/** First value outside the allowed codes among the named fields of `werte`, or null. */
export function codeFehler(store: CatalogStore, werte: Record<string, unknown>, felder: readonly string[], opt: CodeOptionen = {}): EingabeFehler | null {
  for (const feld of felder) {
    const gegeben = liste(werte[feld]);
    if (!gegeben.length) continue;
    const eigene = opt.eigene?.[feld];
    const erlaubt: Wert[] | undefined = eigene ? nurCodes(eigene) : werteVon(store, feld);
    if (!erlaubt) continue;
    const label = opt.mitLabel?.includes(feld);
    const passt = (v: string) => erlaubt.some((w) => w.code === v || (label && w.label != null && w.label.toLowerCase() === v.trim().toLowerCase()));
    const falsch = gegeben.find((v) => !passt(v));
    if (falsch !== undefined) {
      const codes = erlaubt.map((w) => w.code);
      return { fehler: unbekannterWert(feld, falsch, codes), erlaubt: codes };
    }
  }
  return null;
}

/** First value of the named fields that is no whole number within its bounds, or null. */
export function zahlenFehler(werte: Record<string, unknown>, grenzen: Record<string, ZahlGrenze>): EingabeFehler | null {
  for (const [feld, grenze] of Object.entries(grenzen)) {
    const fehler = zahlFehler(feld, werte[feld], grenze);
    if (fehler) return { fehler };
  }
  return null;
}

/** Message for a catalogue entry that is named but unknown (as get_method words it), or null. */
export function bausteinFehler(store: CatalogStore, baustein: unknown): EingabeFehler | null {
  if (baustein == null || baustein === '') return null;
  const kennung = typeof baustein === 'string' ? baustein.trim() : '';
  if (kennung && store.blocksById.has(kennung)) return null;
  return { fehler: `Unbekannter Baustein „${String(baustein)}“.` };
}

/**
 * Fields of the draft and the material (REST /assistant/elaborate, /assistant/briefing, /assistant/material; MCP
 * elaborate_scenario and generate_phase_material check the same codes in their schemas). bildungsstufe and
 * begleitziel take labels too, as the web app sends them.
 */
export function entwurfFelderFehler(store: CatalogStore, body: Record<string, unknown>): EingabeFehler | null {
  const code = codeFehler(store, body, ['planungsprofil', 'bildungsstufe', 'begleitziel', 'materialTyp'], { mitLabel: ['bildungsstufe', 'begleitziel'] });
  if (code) return code;
  const zahl = zahlenFehler(body, { anzahl: { min: 1 } });
  if (zahl) return zahl;
  if (body.bewertet != null && typeof body.bewertet !== 'boolean') return { fehler: 'Feld „bewertet“: erwartet wird wahr oder falsch.' };
  return null;
}

/** Message when an adaptation request names nothing to adapt (REST /adapt, MCP adapt_scenario), or null. */
export function anpassungLeerFehler(body: Record<string, unknown>): EingabeFehler | null {
  const text = (k: string) => typeof body[k] === 'string' && (body[k] as string).trim().length > 0;
  const nichtLeer = (k: string) => Array.isArray(body[k]) && (body[k] as unknown[]).length > 0;
  const gegeben =
    text('scenarioText') || text('text') || text('baustein') || Boolean(body.arrangement) || nichtLeer('phasen') || text('lerngruppenText') || nichtLeer('gruppen');
  return gegeben ? null : { fehler: 'Bitte mindestens scenarioText/text, baustein, arrangement, phasen, lerngruppenText oder gruppen übergeben.' };
}
