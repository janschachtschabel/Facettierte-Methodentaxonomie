import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  DIFF_MATRIX_PERSONAS,
  FmtRequestError,
  QUICK_LEARNER_GROUP_PROFILES,
  istHilfe,
  getDifferentiationMetaSummary,
  scoreDifferentiationMatrix,
  type AdaptScenarioInput,
  type Arrangement,
  type MatchRequest,
  type MeasureEffort,
  type MeasureLevel,
  type SearchCriteria,
  type ZahlGrenze,
  ZAHL_GRENZEN
} from '@fmt/core';
import { differenzierungsMerkmale, merkmalsEntscheidungenFuerAnfrage, schemeValues, type CatalogStore } from '../catalog-store.js';
import type { ServerConfig } from '../config.js';
import { BYOK_PROVIDERS } from '../llm/client.js';
import { buildAdaptScenarioZeroLlm, buildScenarioPlanZeroLlm, type ScenarioPlanArgs } from '../llm/briefings.js';
import { anpassungsAnfrage, pruefSituationFehler, situationAus, situationFehler, teilgruppenAlternativen } from '../kandidaten.js';
import { ersatzAntwort, klassifikationsAntwort, methodenDetail, methodenTreffer, pruefungsAntwort, vokabularUebersicht, zuordnungsAntwort } from '../antworten.js';
import { anpassungLeerFehler, bausteinFehler, codeFehler, kettenschrittFehler, zahlenFehler, type EingabeFehler } from '../eingaben.js';
import { MAX_TEXT_CHARS, groupFieldError, isGroupList, isPhaseList, tooLongMessage } from './validation.js';

/**
 * A subject name (`fach`, e.g. "Mathematik" or "Physik") becomes the filter `fuerFachbereich`: methods of the
 * subject area plus those without subject binding, without the ones marked unsuitable for it.
 * Returns the recognised subject (null when unknown), or undefined when no subject was asked for.
 */
export function applySubjectFilter(store: CatalogStore, criteria: SearchCriteria) {
  const fach = typeof criteria.fach === 'string' ? criteria.fach.trim() : '';
  delete criteria.fach;
  if (!fach) return undefined;
  const erkannt = store.subjects.erkenne(fach, typeof criteria.bildungsstufe === 'string' ? criteria.bildungsstufe : undefined);
  if (erkannt && erkannt.fachbereich !== 'uebergreifend' && !criteria.fuerFachbereich) criteria.fuerFachbereich = erkannt.fachbereich;
  return erkannt;
}

/** Query parameters of GET /api/v1/methods that take a comma-separated list. */
const SUCHE_LISTEN = new Set([
  'reichweite',
  'lernfunktion',
  'engagement',
  'weltbezug',
  'anleitung',
  'adaptivitaet',
  'feedback',
  'interaktion',
  'repraesentation',
  'raumzeit',
  'rolle',
  'aufgabe',
  'sequenz',
  'vorhanden',
  'liefert',
  'ansatz',
  'status',
  'fachbereich',
  'raumbedarf',
  'schriftbedarf',
  'ohneRaumbedarf',
  'ohneSchrift'
]);
/** Single codes of the search; lernort is the former name of raum, zieltyp names a chain (kettenschritt one of its steps). */
const SUCHE_EINZELCODES = ['vorwissen', 'bildungsstufe', 'maxTechnik', 'raum', 'lernort', 'eintragsart', 'minEvidenz', 'fuerFachbereich', 'zieltyp'];
/** Every parameter whose values are codes (checked against the core lists). */
const SUCHE_CODES = [...SUCHE_LISTEN, ...SUCHE_EINZELCODES];
const SUCHE_SCHALTER = new Set(['ohneInternet', 'ohneKI']);
/** Numbers of the search with their bounds; request fields take the core bounds. limit and offset page the hits. */
const SUCHE_ZAHLEN: Record<string, ZahlGrenze> = {
  maxDauer: { min: 0 },
  gruppe: ZAHL_GRENZEN.gruppe,
  maxVorbereitung: ZAHL_GRENZEN.maxVorbereitung,
  termine: ZAHL_GRENZEN.termine,
  limit: { min: 1 },
  offset: { min: 0 }
};
/** All parameters GET /api/v1/methods reads; any other one is answered with 400. */
const SUCHE_PARAMETER = new Set(['text', 'fach', 'kategorie', 'kettenschritt', ...SUCHE_CODES, ...SUCHE_SCHALTER, ...Object.keys(SUCHE_ZAHLEN)]);

/** Bounds of the proposal limit of /match (as match_scenario's schema). */
const MATCH_LIMIT: ZahlGrenze = { min: 1, max: 100 };

/** Wrong types in a body of /differentiation/score (the MCP tool checks them in its schema), or null. */
function differenzierungsTypFehler(body: Record<string, unknown>): EingabeFehler | null {
  const sv = body.selectedValues;
  if (sv != null && (typeof sv !== 'object' || Array.isArray(sv) || !Object.values(sv).every((v) => typeof v === 'string'))) {
    return { fehler: 'Feld „selectedValues“: erwartet wird ein Objekt mit Text-Werten (Merkmal: Ausprägung).' };
  }
  if (body.ebenen != null && !Array.isArray(body.ebenen)) return { fehler: 'Feld „ebenen“: erwartet wird eine Liste.' };
  if (body.minScore != null && (typeof body.minScore !== 'number' || !Number.isFinite(body.minScore))) {
    return { fehler: 'Feld „minScore“: erwartet wird eine Zahl.' };
  }
  const bool = ['includeSystemMeasures', 'ohneBewegung'].find((k) => body[k] != null && typeof body[k] !== 'boolean');
  if (bool) return { fehler: `Feld „${bool}“: erwartet wird wahr oder falsch.` };
  return zahlenFehler(body, { limit: { min: 1 }, lehrende: ZAHL_GRENZEN.lehrende });
}

export function registerApiRoutes(app: FastifyInstance, store: CatalogStore, config: ServerConfig) {
  const fieldsMap = new Map(store.matcher.felder().map((f) => [f.feld, f]));
  const schemaCodes = (id: string) => schemeValues(store.bundle, id).map((w) => w.id);
  /** Search codes that differ from the request fields: the search takes "uebergreifend" and the ohneSchrift aliases. */
  const suchCodes: Record<string, string[]> = {
    fachbereich: schemaCodes('fachbereich'),
    fuerFachbereich: schemaCodes('fachbereich'),
    raumbedarf: schemaCodes('raumbedarf'),
    ohneRaumbedarf: schemaCodes('raumbedarf'),
    schriftbedarf: [...schemaCodes('schriftbedarf'), 'lesen', 'schreiben']
  };

  const parseQueryToMatchRequest = (query: Record<string, unknown>): MatchRequest => {
    const req: MatchRequest = {};
    for (const [key, raw] of Object.entries(query)) {
      if (raw == null || raw === '') continue;
      const val = Array.isArray(raw) ? raw.join(',') : String(raw);
      const f = fieldsMap.get(key);
      req[key] = !f
        ? val
        : f.typ === 'integer'
          ? Number(val)
          : f.typ === 'boolean'
            ? val === 'true' || val === '1'
            : f.typ === 'codes'
              ? val.split(',').filter(Boolean)
              : val;
    }
    return req;
  };

  const handleMatch = (anfrage: MatchRequest, reply: FastifyReply) => {
    if (typeof anfrage.text === 'string' && anfrage.text.length > MAX_TEXT_CHARS) {
      return reply.code(400).send({ fehler: tooLongMessage('text') });
    }
    if (anfrage.fach != null && typeof anfrage.fach !== 'string') {
      return reply.code(400).send({ fehler: 'Feld „fach“: erwartet wird ein Text.' });
    }
    // limit caps the proposals in mode phase, as in match_scenario; it is no field of the matcher.
    const { limit, ...rest } = anfrage;
    const badLimit = zahlenFehler({ limit }, { limit: MATCH_LIMIT });
    if (badLimit) return reply.code(400).send(badLimit);
    try {
      return reply.send(zuordnungsAntwort(store, rest, limit != null && limit !== '' ? Number(limit) : undefined));
    } catch (e) {
      return reply.code(400).send({ fehler: e instanceof Error ? e.message : 'Ungültige Anfrage.' });
    }
  };

  app.get('/healthz', async () => ({
    status: 'ok',
    version: store.bundle.version,
    bausteine: store.bundle.bausteine.length
  }));

  app.get('/api/v1/meta', async (_req, reply) => {
    reply.header('Cache-Control', 'no-cache');
    return {
      name: 'FMT-Methodendatenbank',
      version: store.bundle.version,
      versionHash: store.bundle.versionHash,
      builtAt: store.bundle.builtAt,
      bausteine: store.bundle.bausteine.length,
      kuratiert: store.bundle.bausteine.filter((b) => b.status === 'kuratiert').length,
      entwurf: store.bundle.bausteine.filter((b) => b.status === 'entwurf').length,
      creator: store.bundle.creator,
      license: store.bundle.license,
      licenseName: store.bundle.licenseName,
      repository: store.bundle.repository,
      // Same entries as MCP list_vocabularies (shared builder): methods and helps counted apart (bausteine counts
      // both), grid, chains, fit rules, planning profiles, subgroup table, personas and the request fields.
      ...vokabularUebersicht(store),
      llmConfigured: Boolean(config.llmApiKey),
      llmModel: config.llmApiKey ? config.llmModel : null,
      llmAllowByok: config.llmAllowByok,
      llmByokProviders: Object.keys(BYOK_PROVIDERS),
      embeddingsEngine: store.model2vec ? 'hybrid-model2vec' : 'hybrid-bm25-trigram',
      embeddingsModel: store.model2vec ? store.model2vec.modelId : null,
      mcpEndpoint: '/mcp'
    };
  });

  app.get('/api/v1/catalog', async (req: FastifyRequest<{ Querystring: { v?: string } }>, reply) => {
    reply.header('ETag', store.etag);
    const matchesVersion = typeof req.query?.v === 'string' && req.query.v === store.bundle.versionHash;
    reply.header(
      'Cache-Control',
      matchesVersion ? 'public, max-age=31536000, immutable' : 'public, no-cache'
    );
    if (req.headers['if-none-match'] === store.etag) {
      return reply.code(304).send();
    }
    return reply.type('application/json; charset=utf-8').send(store.bundleJson);
  });

  app.get('/api/v1/methods', async (req: FastifyRequest<{ Querystring: Record<string, string | string[]> }>, reply) => {
    const q = req.query || {};
    const unbekannt = Object.keys(q).filter((k) => !SUCHE_PARAMETER.has(k));
    if (unbekannt.length) {
      return reply.code(400).send({
        fehler: `Unbekannte Parameter: ${unbekannt.map((k) => `„${k}“`).join(', ')}. Erlaubt: ${[...SUCHE_PARAMETER].join(', ')}.`,
        erlaubt: [...SUCHE_PARAMETER]
      });
    }
    const criteria: SearchCriteria = {};
    for (const [k, raw] of Object.entries(q)) {
      if (raw == null || raw === '') continue;
      if (SUCHE_SCHALTER.has(k)) {
        criteria[k] = raw === 'true' || raw === '1';
      } else if (SUCHE_LISTEN.has(k)) {
        criteria[k] = Array.isArray(raw) ? raw : String(raw).split(',').filter(Boolean);
      } else {
        criteria[k] = Array.isArray(raw) ? raw[0] : raw;
      }
    }
    // ohneSchrift=true (or 1) means both abilities, false none, as the search reads the flag.
    const os = criteria.ohneSchrift;
    if (Array.isArray(os) && os.length === 1 && ['true', '1', 'false', '0'].includes(os[0])) criteria.ohneSchrift = os[0] === 'true' || os[0] === '1';
    const bad =
      zahlenFehler(criteria, SUCHE_ZAHLEN) ||
      codeFehler(store, typeof criteria.ohneSchrift === 'boolean' ? { ...criteria, ohneSchrift: undefined } : criteria, SUCHE_CODES, { eigene: suchCodes }) ||
      kettenschrittFehler(store, criteria);
    if (bad) return reply.code(400).send(bad);
    // Former name of raum, as the matcher reads it.
    if (criteria.lernort != null) {
      if (criteria.raum == null) criteria.raum = String(criteria.lernort);
      delete criteria.lernort;
    }
    const limit = criteria.limit != null ? Number(criteria.limit) : undefined;
    const offset = criteria.offset != null ? Number(criteria.offset) : 0;
    delete criteria.limit;
    delete criteria.offset;
    const t0 = process.hrtime.bigint();
    const fachErkannt = applySubjectFilter(store, criteria);
    const hits = store.search.suche(criteria);
    const textQuery = typeof criteria.text === 'string' ? criteria.text.trim() : '';
    const semanticInfo =
      textQuery && hits.length < 5
        ? store.classifyText(textQuery)
        : null;
    const dauerMs = Math.round(Number(process.hrtime.bigint() - t0) / 1e4) / 100;
    const hilfenGesamt = store.bundle.bausteine.filter(istHilfe).length;
    const hilfenTreffer = hits.filter(istHilfe).length;
    const shown = hits.slice(offset, limit != null ? offset + limit : undefined);
    return {
      gesamt: store.bundle.bausteine.length,
      gesamtMethoden: store.bundle.bausteine.length - hilfenGesamt,
      gesamtHilfen: hilfenGesamt,
      anzahl: hits.length,
      anzahlMethoden: hits.length - hilfenTreffer,
      anzahlHilfen: hilfenTreffer,
      angezeigt: shown.length,
      dauerMs,
      ...(fachErkannt !== undefined ? { fachErkannt } : {}),
      // The full entry plus the fields of the shared hit (entry kind, evidence grade and basis, chain steps).
      treffer: shown.map((b) => ({ ...b, ...methodenTreffer(store, b) })),
      ...(semanticInfo
        ? {
            semantischeVorschlaege: semanticInfo.methodenVorschlaege.slice(0, 6),
            skalenHinweise: semanticInfo.skalen
          }
        : {})
    };
  });

  app.get('/api/v1/methods/:kennung', async (req: FastifyRequest<{ Params: { kennung: string } }>, reply) => {
    const b = store.blocksById.get(req.params.kennung);
    if (!b) return reply.code(404).send({ fehler: 'Unbekannter Baustein.' });
    reply.header('ETag', store.etag);
    return methodenDetail(store, b);
  });

  app.get('/api/v1/fields', async () => store.matcher.felder());
  app.get('/api/v1/schema', async () => store.matcher.schema());

  app.get('/api/v1/match', async (req: FastifyRequest<{ Querystring: Record<string, unknown> }>, reply) =>
    handleMatch(parseQueryToMatchRequest(req.query || {}), reply)
  );
  app.post('/api/v1/match', async (req, reply) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return reply.code(400).send({ fehler: 'Erwartet wird ein JSON-Objekt.' });
    }
    return handleMatch(body as MatchRequest, reply);
  });

  // Body: the arrangement itself (as before) or { arrangement, situation }; with situation the fit rules are checked too.
  app.post('/api/v1/validate', async (req, reply) => {
    const body = req.body as Record<string, unknown> | null;
    const istArrangement = (x: unknown): x is Arrangement =>
      Boolean(x) && typeof x === 'object' && !Array.isArray(x) && (x as { typ?: unknown }).typ === 'Arrangement';
    let arrangement: Arrangement | undefined;
    if (istArrangement(body)) {
      const { situation: _situation, ...rest } = body as Arrangement & { situation?: unknown };
      arrangement = rest as Arrangement;
    } else if (body && typeof body === 'object' && istArrangement(body.arrangement)) {
      arrangement = body.arrangement;
    }
    if (!arrangement) {
      return reply.code(400).send({ fehler: 'Erwartet wird ein FMT-Arrangement-Objekt mit typ: "Arrangement" (oder ein Objekt mit arrangement und situation).' });
    }
    const situation = body!.situation;
    const bad = pruefSituationFehler(store, situation);
    if (bad) return reply.code(400).send(bad);
    try {
      return pruefungsAntwort(store, arrangement, situation as Record<string, unknown> | undefined);
    } catch (e) {
      return reply.code(400).send({ fehler: e instanceof Error ? e.message : 'Ungültiges Arrangement.' });
    }
  });

  app.post('/api/v1/replacements', async (req, reply) => {
    const body = req.body as ({ arrangement?: Arrangement; pfad?: string } & Record<string, unknown>) | null;
    if (!body?.arrangement || typeof body.pfad !== 'string') {
      return reply.code(400).send({ fehler: 'Erwartet wird { arrangement, pfad }.' });
    }
    // Situation of the lesson (raum, ohneSchrift, termine …), as object `situation` or as top-level fields.
    const situation = situationAus(body);
    const badSituation = situationFehler(store, situation);
    if (badSituation) return reply.code(400).send(badSituation);
    try {
      return ersatzAntwort(store, body.arrangement, body.pfad, situation);
    } catch (e) {
      return reply.code(400).send({ fehler: e instanceof Error ? e.message : 'Ungültiger Pfad.' });
    }
  });

  app.post('/api/v1/classify', async (req, reply) => {
    const body = req.body as { text?: string } | null;
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (!text) {
      return reply.code(400).send({ fehler: 'Bitte ein Feld "text" zur Klassifikation übergeben.' });
    }
    if (text.length > MAX_TEXT_CHARS) return reply.code(400).send({ fehler: tooLongMessage('text') });
    return klassifikationsAntwort(store, text);
  });

  app.post('/api/v1/plan', async (req, reply) => {
    const body = req.body as Partial<ScenarioPlanArgs> | null;
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (!text) {
      return reply.code(400).send({ fehler: 'Bitte ein Feld "text" für die Szenario-Vorfilterung übergeben.' });
    }
    const b = body as Record<string, unknown>;
    const badText = ['fach', 'fachbereich', 'thema', 'lernziele', 'didaktischerAnsatz'].find((k) => b[k] != null && typeof b[k] !== 'string');
    if (badText) return reply.code(400).send({ fehler: `Feld „${badText}“: erwartet wird Text.` });
    const isGroup = (g: unknown) =>
      !!g && typeof g === 'object' && typeof (g as { id?: unknown }).id === 'string' && typeof (g as { label?: unknown }).label === 'string';
    if (b.gruppen != null && !(Array.isArray(b.gruppen) && b.gruppen.every(isGroup))) {
      return reply.code(400).send({ fehler: 'Feld „gruppen“: erwartet wird eine Liste von Objekten mit id und label.' });
    }
    const badGroup = groupFieldError(b.gruppen);
    if (badGroup) return reply.code(400).send({ fehler: badGroup });
    if (b.bewertet != null && typeof b.bewertet !== 'boolean') return reply.code(400).send({ fehler: 'Feld „bewertet“: erwartet wird wahr oder falsch.' });
    try {
      return await buildScenarioPlanZeroLlm(store, {
        ...(body as ScenarioPlanArgs),
        text,
        includeWloOer: Boolean(body?.includeWloOer),
        umfang: body?.umfang === 'kompakt' ? 'kompakt' : 'voll'
      });
    } catch (e) {
      // Only requests the caller can fix become 400; anything else stays a server error.
      if (e instanceof FmtRequestError) return reply.code(400).send({ fehler: e.message });
      throw e;
    }
  });

  app.get('/api/v1/differentiation/meta', async () => ({
    ...getDifferentiationMetaSummary(),
    ...differenzierungsMerkmale(store.bundle),
    personas: DIFF_MATRIX_PERSONAS.map((p) => ({ id: p.id, name: p.name, description: p.description }))
  }));

  app.post('/api/v1/adapt', async (req, reply) => {
    const body = (req.body || {}) as Partial<AdaptScenarioInput & { text?: string }>;
    const notText = ['scenarioText', 'text', 'lerngruppenText', 'baustein', 'fach', 'fachbereich', 'thema', 'bildungsstufe', 'maxTechnik'].find(
      (k) => (body as Record<string, unknown>)[k] != null && typeof (body as Record<string, unknown>)[k] !== 'string'
    );
    if (notText) return reply.code(400).send({ fehler: `Feld „${notText}“: erwartet wird Text.` });
    // Same codes as the MCP tool adapt_scenario accepts: the situation fields at the top level (raum, maxTechnik,
    // bildungsstufe …) and the codes of the matrix.
    const badCode =
      situationFehler(store, situationAus({ ...body, situation: undefined })) ||
      codeFehler(store, body as Record<string, unknown>, ['maxAufwand', 'ebenen']) ||
      zahlenFehler(body as Record<string, unknown>, { lehrende: ZAHL_GRENZEN.lehrende });
    if (badCode) return reply.code(400).send(badCode);
    if (body.gruppen != null && !isGroupList(body.gruppen)) {
      return reply.code(400).send({ fehler: 'Feld „gruppen“: erwartet wird eine Liste von Objekten mit id und label.' });
    }
    const badGroupField = groupFieldError(body.gruppen);
    if (badGroupField) return reply.code(400).send({ fehler: badGroupField });
    if (body.phasen != null && !isPhaseList(body.phasen)) {
      return reply.code(400).send({ fehler: 'Feld „phasen“: erwartet wird eine Liste von Objekten mit phaseLabel.' });
    }
    const leer = anpassungLeerFehler(body as Record<string, unknown>);
    if (leer) return reply.code(400).send(leer);
    // Situation of the plan for the subgroup decisions: object `anfrage` plus raum, ohneSchrift, termine … at the top level.
    const anfrage = anpassungsAnfrage(body as Record<string, unknown>);
    const badSituation = situationFehler(store, anfrage) || bausteinFehler(store, body.baustein);
    if (badSituation) return reply.code(400).send(badSituation);
    return buildAdaptScenarioZeroLlm(store, { ...body, ...(anfrage ? { anfrage } : {}) });
  });

  app.post('/api/v1/differentiation/score', async (req, reply) => {
    const body = (req.body || {}) as {
      personaId?: string;
      quickProfileId?: string;
      selectedValues?: Record<string, string>;
      minScore?: number;
      limit?: number;
      baustein?: string;
      bildungsstufe?: string;
      ebenen?: MeasureLevel[];
      includeSystemMeasures?: boolean;
      maxTechnik?: string;
      ohneInternet?: boolean;
      ohneKI?: boolean;
      maxAufwand?: MeasureEffort;
      /** The group cannot read or write / move freely (as in /adapt). */
      ohneSchrift?: Array<'lesen' | 'schreiben'>;
      ohneBewegung?: boolean;
      lehrende?: number;
      /** Chain and step of the phase: binding and learning state the parallel method must reach. */
      zieltyp?: string;
      kettenschritt?: string;
      dauerMin?: number;
    } & Record<string, unknown>;
    // Same codes as the MCP tool score_differentiation_matrix accepts; the situation is checked as in /adapt.
    const situation = situationAus(body) || {};
    const bad =
      codeFehler(store, body, ['quickProfileId', 'personaId', 'maxAufwand', 'ebenen', 'zieltyp']) ||
      situationFehler(store, situation) ||
      differenzierungsTypFehler(body) ||
      bausteinFehler(store, body.baustein);
    if (bad) return reply.code(400).send(bad);
    const quickProfile = body.quickProfileId
      ? QUICK_LEARNER_GROUP_PROFILES.find((p) => p.id === body.quickProfileId)
      : undefined;
    const mergedSelected = {
      ...(quickProfile?.selectedValues || {}),
      ...(body.selectedValues || {})
    };
    const scoreResult = scoreDifferentiationMatrix({
      personaId: body.personaId ?? quickProfile?.personaId,
      selectedValues: Object.keys(mergedSelected).length ? mergedSelected : undefined,
      gesperrt: store.bundle.teilgruppen.gesperrt,
      minScore: body.minScore,
      limit: body.limit,
      ebenen: body.ebenen,
      includeSystemMeasures: body.includeSystemMeasures,
      maxTechnik: body.maxTechnik,
      ohneInternet: body.ohneInternet,
      ohneKI: body.ohneKI,
      maxAufwand: body.maxAufwand
    });
    // Parallel methods: methods only, needs covered in the situation, equivalent to the planned method (core).
    const pruefung = teilgruppenAlternativen(store, {
      matrix: scoreResult,
      baustein: body.baustein,
      personaId: body.personaId ?? quickProfile?.personaId,
      selectedValues: mergedSelected,
      ohneSchrift: Array.isArray(body.ohneSchrift) ? body.ohneSchrift : undefined,
      ohneBewegung: body.ohneBewegung === true,
      situation,
      lehrende: typeof body.lehrende === 'number' ? body.lehrende : undefined,
      zieltyp: body.zieltyp,
      kettenschritt: body.kettenschritt,
      dauerMin: typeof body.dauerMin === 'number' ? body.dauerMin : undefined
    });
    const alternativeMethoden = pruefung.alternativen;
    return {
      ...scoreResult,
      ...merkmalsEntscheidungenFuerAnfrage(store.bundle, body.personaId ?? quickProfile?.personaId, mergedSelected),
      alternativeMethoden,
      ...(body.baustein
        ? { alternativenPruefung: { gleichwertigGeprueft: pruefung.gleichwertigGeprueft, hinweis: pruefung.hinweis, ausgeschlossen: pruefung.ausgeschlossen.slice(0, 10) } }
        : {}),
      personas: DIFF_MATRIX_PERSONAS.map((p) => ({ id: p.id, name: p.name, description: p.description })),
      schnellProfile: QUICK_LEARNER_GROUP_PROFILES.map((p) => ({ id: p.id, label: p.label, profile: p.profile }))
    };
  });

  // Backwards-compatible FMT v0.7.0 German API aliases
  app.get('/felder', async () => store.matcher.felder());
  app.get('/schema', async () => store.matcher.schema());
  app.get('/zuordnung', async (req: FastifyRequest<{ Querystring: Record<string, unknown> }>, reply) =>
    handleMatch(parseQueryToMatchRequest(req.query || {}), reply)
  );
  app.post('/zuordnung', async (req, reply) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return reply.code(400).send({ fehler: 'Erwartet wird ein JSON-Objekt.' });
    }
    return handleMatch(body as MatchRequest, reply);
  });
}
