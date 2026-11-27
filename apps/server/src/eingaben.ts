import {
  BLOCK_STATUS,
  DIFF_MATRIX_PERSONAS,
  GRUNDLAGE_KLARTEXT,
  WIRKUNG_KLARTEXT,
  MEASURE_EFFORT_ORDER,
  MEASURE_LEVEL_ORDER,
  QUICK_LEARNER_GROUP_PROFILES,
  unbekannterWert,
  zahlFehler,
  type FeldFehler,
  type Grundlage,
  type Wirkung,
  type ZahlGrenze
} from '@fmt/core';
import { schemeValues, type CatalogStore } from './catalog-store.js';
import { MAX_TEXT_CHARS, tooLongMessage } from './routes/validation.js';

/**
 * Input checks REST and MCP share: codes against the core value lists (matcher.felder(), the schemes and the lists of
 * the differentiation matrix), whole numbers and the known catalogue entries. Every message has the wording of the
 * core (unbekannterWert, zahlFehler); REST sends it with status 400, MCP as errorResult.
 */
export type EingabeFehler = FeldFehler;

/** Kinds of material the template and the briefing know (REST /assistant/material, MCP generate_phase_material). */
export const MATERIAL_TYPEN = ['arbeitsblatt', 'infoblatt', 'quiz', 'checkliste', 'versuchsanleitung', 'diskussionskarten', 'glossar'] as const;

/** Message for a draft request without a valid arrangement (REST /assistant/elaborate, MCP elaborate_scenario). */
export const ARRANGEMENT_FEHLER = 'Bitte ein gültiges FMT-Arrangement (typ: "Arrangement") übergeben.';

/** Message for a list of rule messages that is not in the form of the plan (REST /assistant/elaborate, MCP elaborate_scenario). */
export const REGELMELDUNGEN_FEHLER = 'Feld „regelmeldungen“: erwartet wird eine Liste von Objekten mit regel, wirkung, grundlage und text (wie im Plan).';

/** Effects and bases a rule message can have (core). */
export const REGEL_WIRKUNGEN = Object.keys(WIRKUNG_KLARTEXT) as [Wirkung, ...Wirkung[]];
export const REGEL_GRUNDLAGEN = Object.keys(GRUNDLAGE_KLARTEXT) as [Grundlage, ...Grundlage[]];

/** Most rule messages a draft takes (REST /assistant/elaborate, MCP elaborate_scenario). */
export const REGELMELDUNGEN_MAX = 50;

/** Bounds of limit in the differentiation score (REST /differentiation/score, MCP score_differentiation_matrix). */
export const SCORE_LIMIT: ZahlGrenze = { min: 1, max: 40 };

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
      return nurCodes(BLOCK_STATUS);
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

/**
 * The code of a value given as code or label (case and outer spaces of the label ignored), as codeFehler with mitLabel
 * accepts it; any other value comes back unchanged, so the caller's own check answers it. MCP normalises with it
 * before its enum, so the tools take what REST takes.
 */
export function labelZuCode(store: CatalogStore, feld: string, wert: unknown): unknown {
  if (typeof wert !== 'string') return wert;
  const werte = werteVon(store, feld) || [];
  if (werte.some((w) => w.code === wert)) return wert;
  const gesucht = wert.trim().toLowerCase();
  return werte.find((w) => w.label != null && w.label.toLowerCase() === gesucht)?.code ?? wert;
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

/** Message for a chain step named without its chain (REST /methods, MCP search_methods). */
export const KETTENSCHRITT_OHNE_ZIELTYP = 'Feld „kettenschritt“: nur zusammen mit zieltyp; eine Schritt-ID gilt innerhalb einer Kette.';

/**
 * A chain step outside its chain, or null: kettenschritt needs zieltyp and must be one of that chain's step ids (as
 * einordnungInKetten names them). zieltyp itself is checked by codeFehler.
 */
export function kettenschrittFehler(store: CatalogStore, werte: Record<string, unknown>): EingabeFehler | null {
  const schritt = werte.kettenschritt;
  if (schritt == null || schritt === '') return null;
  if (werte.zieltyp == null || werte.zieltyp === '') return { fehler: KETTENSCHRITT_OHNE_ZIELTYP };
  const kette = store.bundle.ketten.find((k) => k.id === String(werte.zieltyp));
  if (!kette) return null;
  const ids = kette.schritte.map((st) => st.id);
  return ids.includes(String(schritt)) ? null : { fehler: unbekannterWert('kettenschritt', String(schritt), ids), erlaubt: ids };
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
  return regelmeldungenFehler(body.regelmeldungen);
}

/** First fault of rule messages in the form of the plan (regel, wirkung, grundlage, text; quelle optional), or null. */
export function regelmeldungenFehler(meldungen: unknown): EingabeFehler | null {
  if (meldungen == null) return null;
  const istText = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
  if (!Array.isArray(meldungen)) return { fehler: REGELMELDUNGEN_FEHLER };
  if (meldungen.length > REGELMELDUNGEN_MAX) return { fehler: `Feld „regelmeldungen“: höchstens ${REGELMELDUNGEN_MAX} Meldungen.` };
  for (const m of meldungen) {
    if (!m || typeof m !== 'object' || Array.isArray(m)) return { fehler: REGELMELDUNGEN_FEHLER };
    const r = m as Record<string, unknown>;
    if (!istText(r.regel) || !istText(r.text) || (r.quelle != null && typeof r.quelle !== 'string')) return { fehler: REGELMELDUNGEN_FEHLER };
    const zuLang = (['regel', 'text', 'quelle'] as const).find((k) => typeof r[k] === 'string' && (r[k] as string).length > MAX_TEXT_CHARS);
    if (zuLang) return { fehler: tooLongMessage(`regelmeldungen.${zuLang}`) };
    for (const [feld, erlaubt] of [
      ['wirkung', REGEL_WIRKUNGEN as readonly string[]],
      ['grundlage', REGEL_GRUNDLAGEN as readonly string[]]
    ] as const) {
      if (!erlaubt.includes(String(r[feld]))) return { fehler: unbekannterWert(`regelmeldungen.${feld}`, String(r[feld] ?? ''), erlaubt), erlaubt: [...erlaubt] };
    }
  }
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
