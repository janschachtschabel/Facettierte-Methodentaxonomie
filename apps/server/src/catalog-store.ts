import fs from 'node:fs';
import path from 'node:path';
import {
  createMatcher,
  createSearch,
  createSemanticClassifier,
  createValidator,
  detectMatrixTraitsFromText,
  type Arrangement,
  DIFF_MATRIX_VARIABLES,
  getPersonaValues,
  type Baustein,
  type CatalogBundle,
  type FmtData,
  type FmtMatcher,
  type FmtSearch,
  type FmtSemanticClassifier,
  type FmtValidator,
  type MatrixTraitDetectionResult,
  type ScaleHit,
  type ScaleName,
  type SemanticMethodHit,
  type DetectedSubject,
  type FmtSubjectDetector,
  createSubjectDetector
} from '@fmt/core';
import { KennungIndex } from '@fmt/core';
import { loadModel2VecClassifier, type Model2VecClassifier } from './embeddings/model2vec.js';

export interface HybridTextClassification {
  engine: 'hybrid-model2vec' | 'hybrid-bm25-trigram';
  modelId: string | null;
  dauerMs: number;
  kriterien: Record<string, unknown>;
  erkannt: Array<{ feld: string; wert: unknown; beleg: string }>;
  offen: string[];
  skalen: Record<ScaleName, ScaleHit[]>;
  methodenVorschlaege: SemanticMethodHit[];
  matrixMerkmale: MatrixTraitDetectionResult;
  /** Subject named in the text with its OEH URI, or null. */
  fach: DetectedSubject | null;
}

export interface CatalogStore {
  bundle: CatalogBundle;
  bundleJson: string;
  etag: string;
  data: FmtData;
  /** Recognises school and university subjects (OEH vocabularies) in a text. */
  subjects: FmtSubjectDetector;
  validator: FmtValidator;
  search: FmtSearch;
  matcher: FmtMatcher;
  semantic: FmtSemanticClassifier;
  model2vec: Model2VecClassifier | null;
  classifyText: (text: string) => HybridTextClassification;
  blocksById: Map<string, Baustein>;
  exampleRegistry: Map<string, Arrangement>;
  vocabsTtl: Map<string, string>;
  ontologieTtl: string;
  contextJsonld: string;
  fmtSchemaJson: string;
  anfrageSchemaJson: string;
  anfrageSchemaObj: Record<string, unknown>;
  katalogJsonld: string;
  bausteineJsonld: Map<string, string>;
  beispieleJsonld: Map<string, string>;
}

/** Codes and labels of one vocabulary (flat or grouped), as /api/v1/meta and the MCP tool list_vocabularies give them. */
export function schemeValues(bundle: CatalogBundle, id: string): { id: string; label: string }[] {
  const s = bundle.schemes.find((x) => x.id === id);
  const werte = s?.werte || (s?.gruppen || []).flatMap((g) => g.werte);
  return werte.map((w) => ({ id: w.id, label: w.label }));
}

/**
 * What the table "Tausch oder Hilfe" provides for one matrix value, with basis and source. This is no answer for a
 * plan: a swap row swaps only when the planned method sets off the row's reason and adapts to nobody (`bedingung`).
 */
export interface MerkmalsAntwort {
  vorgesehen: 'tausch' | 'hilfe' | 'passt';
  /** When the provision applies (swap rows only). */
  bedingung?: string;
  merkmal?: string;
  richtung?: string;
  wohin?: string;
  grundlage?: string;
  quelle?: string;
}

/** Swap rows: a non-formal one swaps only for a method that sets off its reason and is only uniform (B3). */
const BEDINGUNG_TAUSCH = 'nur wenn die Methode den Grund auslöst und nur uniform ist';
const BEDINGUNG_FORMAL = 'nur wenn die Methode den Grund auslöst';
const FORMALE_RICHTUNGEN = new Set(['ohne-lesen', 'ohne-schreiben', 'ohne-bewegung']);

/** Row of teilgruppen.json that covers a matrix value; neutral values fit, unnamed ones get the default help. */
export function merkmalsAntwort(bundle: CatalogBundle, wert: string): MerkmalsAntwort {
  const t = bundle.teilgruppen;
  if (t.neutral.includes(wert)) return { vorgesehen: 'passt' };
  const m = t.merkmale.find((x) => x.auspraegungen.includes(wert));
  if (!m) return { vorgesehen: t.sonst.antwort, wohin: t.sonst.wohin, grundlage: t.sonst.grundlage };
  const bedingung = m.antwort !== 'tausch' ? undefined : m.richtung && FORMALE_RICHTUNGEN.has(m.richtung) ? BEDINGUNG_FORMAL : BEDINGUNG_TAUSCH;
  return {
    vorgesehen: m.antwort,
    ...(bedingung ? { bedingung } : {}),
    merkmal: m.id,
    ...(m.richtung ? { richtung: m.richtung } : {}),
    wohin: m.wohin,
    grundlage: m.grundlage,
    ...(m.quelle ? { quelle: m.quelle } : {})
  };
}

/**
 * Matrix variables without the blocked categories (teilgruppen.json); every value says whether the subgroup gets
 * a swap or a help, with basis and source. The blocked categories are listed with the reason.
 */
export function differenzierungsMerkmale(bundle: CatalogBundle, oberkategorie?: string) {
  const t = bundle.teilgruppen;
  const needle = oberkategorie?.toLowerCase();
  const variables = DIFF_MATRIX_VARIABLES.filter((v) => !needle || v.id === oberkategorie || v.name.toLowerCase().includes(needle))
    .map((v) => ({
      ...v,
      kategorien: v.kategorien
        .filter((k) => !t.gesperrt.includes(k.id))
        .map((k) => ({ ...k, auspraegungen: k.auspraegungen.map((a) => ({ ...a, teilgruppe: merkmalsAntwort(bundle, a.id) })) }))
    }))
    .filter((v) => v.kategorien.length > 0);
  const gesperrteKategorien = DIFF_MATRIX_VARIABLES.flatMap((v) => v.kategorien)
    .filter((k) => t.gesperrt.includes(k.id))
    .map((k) => ({ id: k.id, name: k.name, text: t.gesperrtText }));
  return { variables, gesperrteKategorien };
}

/** Per selected value the answer of the table, and the blocked categories of the request (no error, only the text). */
export function merkmalsEntscheidungen(bundle: CatalogBundle, selectedValues: Record<string, string>) {
  const t = bundle.teilgruppen;
  const merkmale = Object.entries(selectedValues)
    .filter(([kategorie, wert]) => !t.gesperrt.includes(kategorie) && !t.neutral.includes(wert))
    .map(([kategorie, wert]) => ({ kategorie, wert, ...merkmalsAntwort(bundle, wert) }));
  const gesperrt = Object.keys(selectedValues)
    .filter((kategorie) => t.gesperrt.includes(kategorie))
    .map((kategorie) => ({ kategorie, text: t.gesperrtText }));
  return { merkmale, gesperrt };
}

/** Decision per value of a score request: persona and values count, only the values named by the caller can be reported as blocked. */
export function merkmalsEntscheidungenFuerAnfrage(bundle: CatalogBundle, personaId: string | undefined, selectedValues: Record<string, string>) {
  const alle = merkmalsEntscheidungen(bundle, { ...(personaId ? getPersonaValues(personaId) : {}), ...selectedValues });
  return { merkmale: alle.merkmale, gesperrt: alle.gesperrt.filter((g) => g.kategorie in selectedValues) };
}

export function loadCatalogStore(distDataDir: string): CatalogStore {
  const read = (rel: string) => fs.readFileSync(path.join(distDataDir, rel), 'utf8');
  const bundleJson = read('catalog.bundle.json');
  const bundle = JSON.parse(bundleJson) as CatalogBundle;
  const etag = `"${bundle.versionHash}"`;

  const data: FmtData = {
    VERSION: bundle.version,
    NS: bundle.NS,
    creator: bundle.creator,
    license: bundle.license,
    licenseName: bundle.licenseName,
    repository: bundle.repository,
    schemes: bundle.schemes,
    facetten: bundle.facetten,
    wfelder: bundle.wfelder,
    arten: bundle.arten,
    merkmale: bundle.merkmale,
    ketten: bundle.ketten,
    regeln: bundle.regeln,
    teilgruppen: bundle.teilgruppen,
    planungsprofile: bundle.planungsprofile,
    bausteine: bundle.bausteine,
    beispiele: bundle.beispiele,
    faecher: bundle.faecher,
    weiterleitungen: bundle.weiterleitungen
  };

  const subjects = createSubjectDetector(data.faecher);
  const validator = createValidator(data);
  const search = createSearch(data, validator);
  const matcher = createMatcher(data, validator);
  const semantic = createSemanticClassifier(data);

  // Auto-load optional local Model2Vec static embeddings (e.g. JanSchachtschabel/m2v-qwen3-4b-256-edu)
  let model2vec: Model2VecClassifier | null = null;
  const candidateM2vDir =
    process.env.FMT_M2V_MODEL_DIR || path.resolve(distDataDir, '..', 'models', 'm2v-qwen3-4b-256-edu');
  if (candidateM2vDir && process.env.FMT_M2V_MODEL_DIR !== 'none') {
    try {
      model2vec = loadModel2VecClassifier(candidateM2vDir, data);
    } catch {
      model2vec = null;
    }
  }

  const scales: ScaleName[] = ['ansatz', 'lernfunktion', 'anleitung', 'engagement', 'interaktion', 'reichweite'];
  const classifyText = (text: string): HybridTextClassification => {
    const t0 = Date.now();
    const parsed = matcher.lesen(text);
    const bmRes = semantic.classifyScales(text);
    const m2vRes = model2vec ? model2vec.classifyScales(text) : null;

    // Ensemble BM25+Trigram with Model2Vec when local model is loaded (best of lexical + semantic recall!)
    const skalen = {} as Record<ScaleName, ScaleHit[]>;
    for (const s of scales) {
      if (!m2vRes) {
        skalen[s] = bmRes.scales[s];
        continue;
      }
      const fused = new Map<string, { code: string; label: string; score: number }>();
      for (const h of bmRes.scales[s]) {
        fused.set(h.code, { code: h.code, label: h.label, score: h.score * 0.55 });
      }
      for (const h of m2vRes.scales[s]) {
        const prev = fused.get(h.code);
        if (prev) prev.score += h.score * 0.65;
        else fused.set(h.code, { code: h.code, label: h.label, score: h.score * 0.65 });
      }
      skalen[s] = [...fused.values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((x) => ({ ...x, score: Math.round(Math.min(1, x.score) * 100) / 100 }));
    }

    // Fuse top method suggestions
    const bmMethods = semantic.rankMethods(text, 10);
    let methodenVorschlaege = bmMethods.slice(0, 8);
    if (model2vec) {
      const m2vMethods = model2vec.rankMethods(text, 10);
      const fusedM = new Map<string, SemanticMethodHit>();
      for (const m of bmMethods) fusedM.set(m.kennung, { ...m, score: m.score * 0.55 });
      for (const m of m2vMethods) {
        const prev = fusedM.get(m.kennung);
        if (prev) prev.score += m.score * 0.65;
        else fusedM.set(m.kennung, { ...m, score: m.score * 0.65 });
      }
      methodenVorschlaege = [...fusedM.values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map((x) => ({ ...x, score: Math.round(Math.min(1, x.score) * 100) / 100 }));
    }

    const matrixMerkmale = detectMatrixTraitsFromText(text);
    return {
      engine: model2vec ? 'hybrid-model2vec' : 'hybrid-bm25-trigram',
      modelId: model2vec ? model2vec.modelId : null,
      dauerMs: Date.now() - t0,
      kriterien: parsed.kriterien,
      erkannt: parsed.erkannt,
      offen: parsed.offen,
      skalen,
      methodenVorschlaege,
      matrixMerkmale,
      fach: parsed.fach ?? null
    };
  };

  // Former ids of merged or renamed methods answer with the current method.
  const blocksById: Map<string, Baustein> = new KennungIndex(
    bundle.bausteine.map((b) => [b.kennung, b] as const),
    bundle.weiterleitungen
  );
  const exampleRegistry = new Map<string, Arrangement>(
    bundle.beispiele.filter((a) => Boolean(a['@id'])).map((a) => [a['@id']!, a])
  );

  const vocabsTtl = new Map<string, string>();
  for (const f of fs.readdirSync(path.join(distDataDir, 'vocabs'))) {
    if (f.endsWith('.ttl')) vocabsTtl.set(f.slice(0, -4), read(path.join('vocabs', f)));
  }

  const bausteineJsonld = new Map<string, string>();
  for (const f of fs.readdirSync(path.join(distDataDir, 'bausteine'))) {
    if (f.endsWith('.jsonld') && f !== 'katalog.jsonld') {
      bausteineJsonld.set(f.slice(0, -7), read(path.join('bausteine', f)));
    }
  }

  const beispieleJsonld = new Map<string, string>();
  for (const f of fs.readdirSync(path.join(distDataDir, 'beispiele'))) {
    if (f.endsWith('.jsonld')) {
      beispieleJsonld.set(f.slice(0, -7), read(path.join('beispiele', f)));
    }
  }

  const anfrageSchemaJson = read('anfrage.schema.json');

  return {
    bundle,
    bundleJson,
    etag,
    data,
    validator,
    search,
    matcher,
    semantic,
    subjects,
    model2vec,
    classifyText,
    blocksById,
    exampleRegistry,
    vocabsTtl,
    ontologieTtl: read('ontologie.ttl'),
    contextJsonld: read('context.jsonld'),
    fmtSchemaJson: read('fmt.schema.json'),
    anfrageSchemaJson,
    anfrageSchemaObj: JSON.parse(anfrageSchemaJson) as Record<string, unknown>,
    katalogJsonld: read(path.join('bausteine', 'katalog.jsonld')),
    bausteineJsonld,
    beispieleJsonld
  };
}
