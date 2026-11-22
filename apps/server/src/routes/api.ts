import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  DIFF_MATRIX_PERSONAS,
  scoreDifferentiationMatrix,
  suggestAlternativeMethodsForGroup,
  type Arrangement,
  type MatchRequest,
  type SearchCriteria
} from '@fmt/core';
import type { CatalogStore } from '../catalog-store.js';
import type { ServerConfig } from '../config.js';
import { BYOK_PROVIDERS } from '../llm/client.js';
import { buildScenarioPlanZeroLlm, type ScenarioPlanArgs } from '../llm/briefings.js';
import { extractSubjectAndTopicFromText } from './assistant.js';

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
      'status'
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
    return buildScenarioPlanZeroLlm(store, {
      ...(body as ScenarioPlanArgs),
      text,
      includeWloOer: Boolean(body?.includeWloOer)
    });
  });

  app.post('/api/v1/differentiation/score', async (req) => {
    const body = (req.body || {}) as {
      personaId?: string;
      selectedValues?: Record<string, string>;
      minScore?: number;
      limit?: number;
      baustein?: string;
    };
    const scoreResult = scoreDifferentiationMatrix({
      personaId: body.personaId,
      selectedValues: body.selectedValues,
      minScore: body.minScore,
      limit: body.limit
    });
    const currentBlock = body.baustein ? store.blocksById.get(body.baustein) : undefined;
    const alternativeMethoden = currentBlock
      ? suggestAlternativeMethodsForGroup(scoreResult, currentBlock, store.bundle.bausteine, 5)
      : [];
    return {
      ...scoreResult,
      alternativeMethoden,
      personas: DIFF_MATRIX_PERSONAS.map((p) => ({ id: p.id, name: p.name, description: p.description }))
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
