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
import { registerMcpHttpRoutes } from './mcp/http.js';

export interface BuildAppOptions {
  distDataDir: string;
  webDistDir?: string;
  config?: ServerConfig;
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance & { fmtStore: CatalogStore }> {
  const config = options.config ?? loadConfig();
  const store = loadCatalogStore(options.distDataDir);

  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 128 * 1024
  }) as unknown as FastifyInstance & { fmtStore: CatalogStore };

  app.fmtStore = store;

  await app.register(cors, {
    origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((s) => s.trim()),
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'Mcp-Session-Id', 'X-LLM-Api-Key', 'X-LLM-Model', 'X-LLM-Provider']
  });

  await app.register(compress, { global: true, threshold: 1024 });

  await app.register(rateLimit, {
    global: false
  });

  registerApiRoutes(app, store, config);
  registerLinkedDataRoutes(app, store);
  registerAssistantRoutes(app, store, config);
  registerMcpHttpRoutes(app, store);

  const webDir = options.webDistDir;
  if (webDir && fs.existsSync(path.join(webDir, 'index.html'))) {
    const indexHtml = fs.readFileSync(path.join(webDir, 'index.html'), 'utf8');

    await app.register(fastifyStatic, {
      root: webDir,
      prefix: '/',
      index: ['index.html'],
      setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache');
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
