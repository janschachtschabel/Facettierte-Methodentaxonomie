import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { FMT_GUARDRAILS, type Arrangement, type MatchRequest } from '@fmt/core';
import type { CatalogStore } from '../catalog-store.js';
import type { ServerConfig } from '../config.js';
import { LruTtlCache } from '../llm/cache.js';
import {
  ByokValidationError,
  callChatCompletion,
  extractJsonObject,
  resolveLlmTarget,
  type LlmOverride
} from '../llm/client.js';

function readByokHeaders(req: FastifyRequest): LlmOverride {
  const h = req.headers;
  return {
    apiKey: typeof h['x-llm-api-key'] === 'string' ? h['x-llm-api-key'] : undefined,
    model: typeof h['x-llm-model'] === 'string' ? h['x-llm-model'] : undefined,
    provider: typeof h['x-llm-provider'] === 'string' ? h['x-llm-provider'] : undefined
  };
}

function collectUsedBlocks(node: unknown, out = new Set<string>()): Set<string> {
  if (!node || typeof node !== 'object') return out;
  const n = node as Record<string, unknown>;
  if (typeof n.baustein === 'string') out.add(n.baustein);
  if (Array.isArray(n.teile)) n.teile.forEach((x) => collectUsedBlocks(x, out));
  if (Array.isArray(n.begleitend)) n.begleitend.forEach((x) => collectUsedBlocks(x, out));
  if (Array.isArray(n.optionen)) n.optionen.forEach((x) => collectUsedBlocks(x, out));
  if (Array.isArray(n.belegung)) n.belegung.forEach((x) => collectUsedBlocks((x as { inhalt?: unknown }).inhalt, out));
  if (n.haupt) collectUsedBlocks(n.haupt, out);
  return out;
}

export function registerAssistantRoutes(app: FastifyInstance, store: CatalogStore, config: ServerConfig) {
  const ajv = new Ajv2020({ strict: false, validateFormats: false, allErrors: true });
  const validateAnfrage = ajv.compile(store.anfrageSchemaObj);
  const translateCache = new LruTtlCache<{ anfrage: MatchRequest }>(config.llmCacheMax, config.llmCacheTtlMs);
  const elaborateCache = new LruTtlCache<string>(config.llmCacheMax, config.llmCacheTtlMs);

  const hashKey = (parts: unknown[]) =>
    crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex');

  const rateLimitConfig = {
    rateLimit: {
      max: config.llmRateLimitPerMin,
      timeWindow: '1 minute'
    }
  };

  app.post('/api/v1/assistant/translate', { config: rateLimitConfig }, async (req, reply) => {
    const body = req.body as { text?: string } | null;
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (!text) return reply.code(400).send({ fehler: 'Bitte ein Szenario im Feld „text“ angeben.' });
    if (text.length > 4000) return reply.code(400).send({ fehler: 'Eingabetext zu lang (max. 4000 Zeichen).' });

    let target;
    try {
      target = resolveLlmTarget(config, readByokHeaders(req));
    } catch (e) {
      if (e instanceof ByokValidationError) return reply.code(400).send({ fehler: e.message });
      throw e;
    }

    const fallback = (hinweis: string) => {
      const ergebnis = store.matcher.zuordnen({ text });
      return reply.send({
        quelle: 'regeln-fallback',
        gecacht: false,
        hinweis,
        anfrage: ergebnis.kriterien,
        ergebnis,
        leitplanken: FMT_GUARDRAILS
      });
    };

    if (!target) {
      return fallback('Kein LLM-API-Key konfiguriert – deterministische Regel-Zuordnung wurde direkt ausgeführt.');
    }

    const cacheKey = hashKey(['translate', store.bundle.versionHash, target.model, text.toLowerCase()]);
    if (!target.isByok) {
      const cached = translateCache.get(cacheKey);
      if (cached) {
        const ergebnis = store.matcher.zuordnen(cached.anfrage);
        return reply.send({
          quelle: 'llm',
          gecacht: true,
          anfrage: cached.anfrage,
          ergebnis,
          leitplanken: FMT_GUARDRAILS
        });
      }
    }

    const systemPrompt =
      'Du übersetzt deutsche Unterrichtsszenarien strikt in ein JSON-Objekt gemäß folgendem FMT-Anfrage-Schema. ' +
      'Antworte AUSSCHLIESSLICH mit einem gültigen JSON-Objekt ohne Erklärtext. ' +
      'Verwende NUR erlaubte Enum-Codes aus dem Schema. Lass Felder weg, die nicht aus dem Text hervorgehen. Setze das Feld "text" NICHT.\n\n' +
      `Schema:\n${store.anfrageSchemaJson}`;

    try {
      const raw = await callChatCompletion(
        target,
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ],
        { jsonMode: true, maxTokens: 400, timeoutMs: config.llmTimeoutMs }
      );
      const parsed = extractJsonObject(raw);
      if (!parsed) return fallback('LLM-Antwort enthielt kein gültiges JSON – Regel-Zuordnung als Fallback genutzt.');
      delete parsed.text;
      if (!validateAnfrage(parsed) || Object.keys(parsed).length === 0) {
        return fallback('LLM-Ausgabe entsprach nicht dem FMT-Schema – Regel-Zuordnung als Fallback genutzt.');
      }
      const anfrage = parsed as MatchRequest;
      const ergebnis = store.matcher.zuordnen(anfrage);
      if (!target.isByok) translateCache.set(cacheKey, { anfrage });
      return reply.send({
        quelle: 'llm',
        gecacht: false,
        anfrage,
        ergebnis,
        leitplanken: FMT_GUARDRAILS
      });
    } catch {
      return fallback('LLM derzeit nicht erreichbar – deterministische Regel-Zuordnung als Fallback genutzt.');
    }
  });

  app.post('/api/v1/assistant/elaborate', { config: rateLimitConfig }, async (req, reply) => {
    const body = req.body as {
      arrangement?: Arrangement;
      thema?: string;
      fach?: string;
      hinweise?: string;
    } | null;

    if (!body?.arrangement || body.arrangement.typ !== 'Arrangement') {
      return reply.code(400).send({ fehler: 'Bitte ein gültiges FMT-Arrangement übergeben.' });
    }

    let target;
    try {
      target = resolveLlmTarget(config, readByokHeaders(req));
    } catch (e) {
      if (e instanceof ByokValidationError) return reply.code(400).send({ fehler: e.message });
      throw e;
    }

    if (!target) {
      return reply.code(503).send({
        fehler: 'Für die fachliche Ausgestaltung ist kein LLM-API-Key konfiguriert. Sie können optional im Browser einen eigenen API-Key (BYOK) hinterlegen.'
      });
    }

    const pruefung = store.validator.validate(body.arrangement, store.exampleRegistry);
    const usedIds = [...collectUsedBlocks(body.arrangement.ablauf)];
    const catalogContext = usedIds
      .map((id) => store.blocksById.get(id))
      .filter((b): b is NonNullable<typeof b> => Boolean(b))
      .map((b) => ({
        kennung: b.kennung,
        name: b.name,
        durchfuehrung: b.durchfuehrung,
        kernkomponente: b.kernkomponente.map((k) => k.name),
        qualitaetsrisiko: b.qualitaetsrisiko,
        evidenz: b.evidenz
      }));

    const cacheKey = hashKey([
      'elaborate',
      store.bundle.versionHash,
      target.model,
      body.thema || '',
      body.fach || '',
      body.hinweise || '',
      body.arrangement
    ]);

    if (!target.isByok) {
      const cached = elaborateCache.get(cacheKey);
      if (cached) {
        return reply.send({ gecacht: true, pruefung, ausarbeitung: cached, leitplanken: FMT_GUARDRAILS });
      }
    }

    const systemPrompt =
      'Du bist ein didaktischer Planungsassistent für die Facettierte Methodentaxonomie (FMT). ' +
      'Deine Aufgabe ist es, ein bereits komponiertes und geprüftes Arrangement fachlich für Thema und Lerngruppe auszugestalten (konkrete Aufgabenideen, Übergänge, Moderationsimpulse, Zeitverteilung). ' +
      'STRENGE REGELN:\n' +
      '- Erfinde KEINE neuen Unterrichtsmethoden oder Wirksamkeitsstudien außerhalb der übergebenen Bausteine.\n' +
      '- Respektiere alle Kernkomponenten der gewählten Bausteine und benenne typische Qualitätsrisiken knapp.\n' +
      '- Erwähne offene Validator-Warnungen oder Fehler ehrlich mit ihrer Grundlage.\n' +
      '- Antworte auf Deutsch in klarem, praxisnahem Markdown.';

    const userPrompt =
      `AUSGESTALTUNG für Fach: ${body.fach || 'nicht angegeben'}, Thema: ${body.thema || 'nicht angegeben'}.\n` +
      (body.hinweise ? `Zusätzliche Hinweise: ${body.hinweise}\n` : '') +
      `\nArrangement (JSON):\n${JSON.stringify(body.arrangement, null, 2)}\n\n` +
      `Prüfungsergebnis:\n${JSON.stringify(pruefung, null, 2)}\n\n` +
      `Katalogdaten der verwendeten Bausteine:\n${JSON.stringify(catalogContext, null, 2)}`;

    try {
      const ausarbeitung = await callChatCompletion(
        target,
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        { jsonMode: false, maxTokens: 1400, timeoutMs: config.llmTimeoutMs }
      );
      if (!target.isByok) elaborateCache.set(cacheKey, ausarbeitung);
      return reply.send({ gecacht: false, pruefung, ausarbeitung, leitplanken: FMT_GUARDRAILS });
    } catch (e) {
      return reply.code(502).send({
        fehler: e instanceof Error ? e.message : 'LLM-Ausgestaltung fehlgeschlagen.'
      });
    }
  });
}
