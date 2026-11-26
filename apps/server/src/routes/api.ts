import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  DIFF_MATRIX_PERSONAS,
  DIFF_MATRIX_VARIABLES,
  FmtRequestError,
  QUICK_LEARNER_GROUP_PROFILES,
  getDifferentiationMetaSummary,
  scoreDifferentiationMatrix,
  suggestAlternativeMethodsForGroup,
  type AdaptScenarioInput,
  type Arrangement,
  type MatchRequest,
  type MeasureEffort,
  type MeasureLevel,
  type SearchCriteria
} from '@fmt/core';
import type { CatalogStore } from '../catalog-store.js';
import type { ServerConfig } from '../config.js';
import { BYOK_PROVIDERS } from '../llm/client.js';
import { buildAdaptScenarioZeroLlm, buildScenarioPlanZeroLlm, type ScenarioPlanArgs } from '../llm/briefings.js';
import { extractSubjectAndTopicFromText } from './assistant.js';
import { MAX_TEXT_CHARS, isGroupList, isPhaseList, tooLongMessage } from './validation.js';

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

export function registerApiRoutes(app: FastifyInstance, store: CatalogStore, config: ServerConfig) {
  const fieldsMap = new Map(store.matcher.felder().map((f) => [f.feld, f]));

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
    const t0 = process.hrtime.bigint();
    try {
      const r = store.matcher.zuordnen(anfrage);
      r.dauerMs = Math.round(Number(process.hrtime.bigint() - t0) / 1e4) / 100;
      return reply.send(r);
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
      ebenen: store.bundle.ebenen,
      einsatzprofil: store.bundle.merkmale,
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

  app.get('/api/v1/methods', async (req: FastifyRequest<{ Querystring: Record<string, string | string[]> }>) => {
    const q = req.query || {};
    const criteria: SearchCriteria = {};
    const multiFields = new Set([
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
      'fachbereich'
    ]);
    for (const [k, raw] of Object.entries(q)) {
      if (raw == null || raw === '') continue;
      if (k === 'ohneInternet' || k === 'ohneKI') {
        criteria[k] = raw === 'true' || raw === '1';
      } else if (multiFields.has(k)) {
        criteria[k] = Array.isArray(raw) ? raw : String(raw).split(',').filter(Boolean);
      } else {
        criteria[k] = Array.isArray(raw) ? raw[0] : raw;
      }
    }
    const t0 = process.hrtime.bigint();
    const fachErkannt = applySubjectFilter(store, criteria);
    const hits = store.search.suche(criteria);
    const textQuery = typeof criteria.text === 'string' ? criteria.text.trim() : '';
    const semanticInfo =
      textQuery && hits.length < 5
        ? store.classifyText(textQuery)
        : null;
    const dauerMs = Math.round(Number(process.hrtime.bigint() - t0) / 1e4) / 100;
    return {
      gesamt: store.bundle.bausteine.length,
      anzahl: hits.length,
      dauerMs,
      ...(fachErkannt !== undefined ? { fachErkannt } : {}),
      treffer: hits,
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
    return b;
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

  app.post('/api/v1/validate', async (req, reply) => {
    const body = req.body as Arrangement | null;
    if (!body || typeof body !== 'object' || Array.isArray(body) || body.typ !== 'Arrangement') {
      return reply.code(400).send({ fehler: 'Erwartet wird ein FMT-Arrangement-Objekt mit typ: "Arrangement".' });
    }
    try {
      return store.validator.validate(body, store.exampleRegistry);
    } catch (e) {
      return reply.code(400).send({ fehler: e instanceof Error ? e.message : 'Ungültiges Arrangement.' });
    }
  });

  app.post('/api/v1/replacements', async (req, reply) => {
    const body = req.body as { arrangement?: Arrangement; pfad?: string } | null;
    if (!body?.arrangement || typeof body.pfad !== 'string') {
      return reply.code(400).send({ fehler: 'Erwartet wird { arrangement, pfad }.' });
    }
    try {
      const kandidaten = store.search.ersatz(body.arrangement, body.pfad, store.exampleRegistry);
      return {
        pfad: body.pfad,
        hinweis: 'Kandidaten passen formal (Arrangement bleibt gültig). Gleiche Wirkung ist nicht garantiert (Loibl et al. 2024).',
        kandidaten
      };
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
    const extracted = extractSubjectAndTopicFromText(text);
    return {
      ...store.classifyText(text),
      erkanntesFach: extracted.fach,
      erkanntesThema: extracted.thema
    };
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
    variables: DIFF_MATRIX_VARIABLES,
    personas: DIFF_MATRIX_PERSONAS.map((p) => ({ id: p.id, name: p.name, description: p.description }))
  }));

  app.post('/api/v1/adapt', async (req, reply) => {
    const body = (req.body || {}) as Partial<AdaptScenarioInput & { text?: string }>;
    const notText = ['scenarioText', 'text', 'lerngruppenText', 'baustein', 'fach', 'fachbereich', 'thema', 'bildungsstufe', 'maxTechnik'].find(
      (k) => (body as Record<string, unknown>)[k] != null && typeof (body as Record<string, unknown>)[k] !== 'string'
    );
    if (notText) return reply.code(400).send({ fehler: `Feld „${notText}“: erwartet wird Text.` });
    // Same codes as the MCP tool adapt_scenario accepts.
    const badCode = (['maxTechnik', 'bildungsstufe', 'fachbereich'] as const).find((k) => {
      const v = (body as Record<string, unknown>)[k];
      const allowed = fieldsMap.get(k)?.werte?.map((w) => w.code);
      return typeof v === 'string' && v !== '' && allowed && !allowed.includes(v);
    });
    if (badCode) {
      const allowed = fieldsMap.get(badCode)!.werte!.map((w) => w.code).join(', ');
      return reply.code(400).send({ fehler: `Feld „${badCode}“: unbekannter Wert. Erlaubt: ${allowed}.` });
    }
    if (body.gruppen != null && !isGroupList(body.gruppen)) {
      return reply.code(400).send({ fehler: 'Feld „gruppen“: erwartet wird eine Liste von Objekten mit id und label.' });
    }
    if (body.phasen != null && !isPhaseList(body.phasen)) {
      return reply.code(400).send({ fehler: 'Feld „phasen“: erwartet wird eine Liste von Objekten mit phaseLabel.' });
    }
    const hasScenario =
      (typeof body.scenarioText === 'string' && body.scenarioText.trim().length > 0) ||
      (typeof body.text === 'string' && body.text.trim().length > 0) ||
      (typeof body.baustein === 'string' && body.baustein.trim().length > 0) ||
      Boolean(body.arrangement) ||
      (Array.isArray(body.phasen) && body.phasen.length > 0) ||
      (typeof body.lerngruppenText === 'string' && body.lerngruppenText.trim().length > 0) ||
      (Array.isArray(body.gruppen) && body.gruppen.length > 0);
    if (!hasScenario) {
      return reply
        .code(400)
        .send({ fehler: 'Bitte mindestens scenarioText/text, baustein, arrangement, phasen, lerngruppenText oder gruppen übergeben.' });
    }
    return buildAdaptScenarioZeroLlm(store, body);
  });

  app.post('/api/v1/differentiation/score', async (req) => {
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
    };
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
      minScore: body.minScore,
      limit: body.limit,
      ebenen: body.ebenen,
      includeSystemMeasures: body.includeSystemMeasures,
      maxTechnik: body.maxTechnik,
      ohneInternet: body.ohneInternet,
      ohneKI: body.ohneKI,
      maxAufwand: body.maxAufwand
    });
    const currentBlock = body.baustein ? store.blocksById.get(body.baustein) : undefined;
    const alternativeMethoden = currentBlock
      ? suggestAlternativeMethodsForGroup(scoreResult, currentBlock, store.bundle.bausteine, 5, undefined, {
          maxTechnik: body.maxTechnik,
          ohneInternet: body.ohneInternet,
          ohneKI: body.ohneKI,
          bildungsstufe: body.bildungsstufe
        })
      : [];
    return {
      ...scoreResult,
      alternativeMethoden,
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
