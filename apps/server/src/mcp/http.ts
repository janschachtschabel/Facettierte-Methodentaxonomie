import type { FastifyInstance } from 'fastify';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { CatalogStore } from '../catalog-store.js';
import { createFmtMcpServer } from './server.js';

export function registerMcpHttpRoutes(app: FastifyInstance, store: CatalogStore) {
  // Stateless Streamable HTTP MCP endpoint: safe across restarts, scalable, zero session memory leaks
  app.all('/mcp', async (req, reply) => {
    if (req.method !== 'POST' && req.method !== 'GET' && req.method !== 'DELETE') {
      return reply.code(405).send({ fehler: 'Methode nicht erlaubt.' });
    }
    const mcpServer = createFmtMcpServer(store);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });
    // Copy Fastify headers (including @fastify/cors headers) to raw response before hijack
    const fastifyHeaders = reply.getHeaders();
    for (const [k, v] of Object.entries(fastifyHeaders)) {
      if (v !== undefined) reply.raw.setHeader(k, v as string | number | readonly string[]);
    }
    reply.hijack();
    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(req.raw, reply.raw, req.body);
    } catch (err) {
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        reply.raw.end(JSON.stringify({ fehler: err instanceof Error ? err.message : 'MCP-Fehler' }));
      }
    } finally {
      await transport.close().catch(() => {});
      await mcpServer.close().catch(() => {});
    }
  });
}
