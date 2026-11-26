import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import compress from '@fastify/compress';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { loadCatalogStore, type CatalogStore } from './catalog-store.js';
import { loadConfig, type ServerConfig } from './config.js';
import { registerApiRoutes } from './routes/api.js';
import { registerLinkedDataRoutes } from './routes/linked-data.js';
import { registerAssistantRoutes } from './routes/assistant.js';
import { registerOerRoutes, setWloSubjectLookup } from './routes/oer.js';
import { registerMcpHttpRoutes } from './mcp/http.js';
import { findTooLongString, tooLongMessage } from './routes/validation.js';

export interface BuildAppOptions {
  distDataDir: string;
  webDistDir?: string;
  config?: ServerConfig;
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance & { fmtStore: CatalogStore }> {
  const config = options.config ?? loadConfig();
  const store = loadCatalogStore(options.distDataDir);

  const trustProxy =
    typeof config.trustProxy === 'number'
      ? (_address: string, hop: number) => hop < (config.trustProxy as number)
      : Boolean(config.trustProxy);

  const app = Fastify({
    logger: options.logger ?? false,
    trustProxy,
    bodyLimit: 128 * 1024
  }) as unknown as FastifyInstance & { fmtStore: CatalogStore };

  app.fmtStore = store;

  await app.register(cors, {
    origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((s) => s.trim()),
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'Mcp-Session-Id', 'X-LLM-Api-Key', 'X-LLM-Model', 'X-LLM-Provider']
  });

  await app.register(compress, { global: true, threshold: 1024 });

  // Compute endpoints without their own (LLM) limit get a generous per-IP limit. Must be added before the
  // rate-limit plugin so that the plugin's own onRoute hook already sees the injected config.
  const isComputeRoute = (url: string, methods: string[]) =>
    (url.startsWith('/api/v1/') || url === '/zuordnung') &&
    (methods.includes('POST') || url === '/api/v1/match' || url === '/zuordnung');
  app.addHook('onRoute', (route) => {
    const methods = ([] as string[]).concat(route.method as string | string[]);
    const cfg = (route.config ?? {}) as { rateLimit?: unknown };
    if (cfg.rateLimit === undefined && isComputeRoute(route.url, methods)) {
      route.config = { ...cfg, rateLimit: { max: config.apiRateLimitPerMin, timeWindow: '1 minute' } };
    }
  });

  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_req, ctx) => ({
      statusCode: ctx.statusCode,
      fehler: `Zu viele Anfragen – bitte in ${ctx.after} erneut versuchen.`
    })
  });

  // No free-text string in a JSON body may exceed MAX_TEXT_CHARS (MCP checks this per tool schema).
  app.addHook('preHandler', async (req, reply) => {
    if (req.method !== 'POST' || !(req.url.startsWith('/api/') || req.url.startsWith('/zuordnung'))) return;
    const field = findTooLongString(req.body);
    if (field) return reply.code(400).send({ fehler: tooLongMessage(field) });
  });

  registerApiRoutes(app, store, config);
  registerLinkedDataRoutes(app, store);
  registerAssistantRoutes(app, store, config);
  setWloSubjectLookup((name) => store.subjects.schulfachUri(name));
  registerOerRoutes(app, config);
  registerMcpHttpRoutes(app, store, config);

  const webDir = options.webDistDir;
  if (webDir && fs.existsSync(path.join(webDir, 'index.html'))) {
    const indexHtml = fs.readFileSync(path.join(webDir, 'index.html'), 'utf8');

    await app.register(fastifyStatic, {
      root: webDir,
      prefix: '/',
      index: ['index.html'],
      setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.header('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (filePath.endsWith('index.html')) {
          res.header('Cache-Control', 'no-cache');
        }
      }
    });

    app.setNotFoundHandler((req, reply) => {
      if (
        req.method === 'GET' &&
        !req.url.startsWith('/api/') &&
        !req.url.startsWith('/mcp') &&
        !req.url.startsWith('/vocabs/') &&
        !req.url.startsWith('/vocab/') &&
        !req.url.startsWith('/bausteine/') &&
        !req.url.startsWith('/baustein/') &&
        !req.url.startsWith('/beispiele/') &&
        !req.url.startsWith('/schema/')
      ) {
        return reply.type('text/html; charset=utf-8').header('Cache-Control', 'no-cache').send(indexHtml);
      }
      return reply.code(404).send({ fehler: 'Nicht gefunden.' });
    });
  }

  return app;
}
