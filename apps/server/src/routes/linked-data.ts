import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { resolveKennung } from '@fmt/core';
import type { CatalogStore } from '../catalog-store.js';

function prefersHtml(accept?: string): boolean {
  if (!accept) return false;
  const a = accept.toLowerCase();
  if (a.includes('application/ld+json') || a.includes('text/turtle') || a.includes('application/json')) {
    return a.indexOf('text/html') !== -1 && a.indexOf('text/html') < Math.min(
      ...[a.indexOf('application/ld+json'), a.indexOf('text/turtle'), a.indexOf('application/json')].filter((i) => i >= 0)
    );
  }
  return a.includes('text/html');
}

export function registerLinkedDataRoutes(app: FastifyInstance, store: CatalogStore) {
  const sendCached = (req: FastifyRequest, reply: FastifyReply, contentType: string, payload: string) => {
    reply.header('ETag', store.etag);
    reply.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
    if (req.headers['if-none-match'] === store.etag) return reply.code(304).send();
    return reply.type(contentType).send(payload);
  };

  // Static-style extension endpoints
  app.get('/vocabs/:file', async (req: FastifyRequest<{ Params: { file: string } }>, reply) => {
    const id = req.params.file.endsWith('.ttl') ? req.params.file.slice(0, -4) : req.params.file;
    const ttl = store.vocabsTtl.get(id);
    if (!ttl) return reply.code(404).send({ fehler: 'Unbekanntes Vokabular.' });
    return sendCached(req, reply, 'text/turtle; charset=utf-8', ttl);
  });

  app.get('/ontologie.ttl', async (req, reply) => sendCached(req, reply, 'text/turtle; charset=utf-8', store.ontologieTtl));
  app.get('/context.jsonld', async (req, reply) => sendCached(req, reply, 'application/ld+json; charset=utf-8', store.contextJsonld));
  app.get('/schema/fmt.schema.json', async (req, reply) =>
    sendCached(req, reply, 'application/schema+json; charset=utf-8', store.fmtSchemaJson)
  );
  app.get('/schema/anfrage.schema.json', async (req, reply) =>
    sendCached(req, reply, 'application/schema+json; charset=utf-8', store.anfrageSchemaJson)
  );

  app.get('/bausteine/katalog.jsonld', async (req, reply) =>
    sendCached(req, reply, 'application/ld+json; charset=utf-8', store.katalogJsonld)
  );

  app.get('/bausteine/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const raw = req.params.id;
    if (raw.endsWith('.jsonld')) {
      const ld = store.bausteineJsonld.get(resolveKennung(raw.slice(0, -7), store.bundle.weiterleitungen));
      if (!ld) return reply.code(404).send({ fehler: 'Unbekannter Baustein.' });
      return sendCached(req, reply, 'application/ld+json; charset=utf-8', ld);
    }
    // Backwards-compatible v0.7.0 GET /bausteine/<kennung>
    const b = store.blocksById.get(raw);
    if (!b) return reply.code(404).send({ fehler: 'Unbekannter Baustein.' });
    reply.header('ETag', store.etag);
    return b;
  });

  app.get('/beispiele/:file', async (req: FastifyRequest<{ Params: { file: string } }>, reply) => {
    const id = req.params.file.endsWith('.jsonld') ? req.params.file.slice(0, -7) : req.params.file;
    const ld = store.beispieleJsonld.get(id);
    if (!ld) return reply.code(404).send({ fehler: 'Unbekanntes Beispiel-Arrangement.' });
    return sendCached(req, reply, 'application/ld+json; charset=utf-8', ld);
  });

  // Canonical w3id.org/fmt/ IRI dereferencing with Accept content negotiation
  app.get('/baustein/:kennung', async (req: FastifyRequest<{ Params: { kennung: string } }>, reply) => {
    const kennung = resolveKennung(req.params.kennung, store.bundle.weiterleitungen);
    const ld = store.bausteineJsonld.get(kennung);
    if (!ld) return reply.code(404).send({ fehler: 'Unbekannter Baustein.' });
    reply.header('Vary', 'Accept');
    if (prefersHtml(req.headers.accept)) {
      return reply.redirect(`/methoden/${encodeURIComponent(kennung)}`, 302);
    }
    return sendCached(req, reply, 'application/ld+json; charset=utf-8', ld);
  });

  const handleVocabCanon = (req: FastifyRequest<{ Params: { scheme: string } }>, reply: FastifyReply) => {
    const scheme = req.params.scheme.replace(/\.ttl$/, '');
    const ttl = store.vocabsTtl.get(scheme);
    if (!ttl) return reply.code(404).send({ fehler: 'Unbekanntes Vokabular.' });
    reply.header('Vary', 'Accept');
    if (prefersHtml(req.headers.accept)) {
      return reply.redirect(`/systematik#${encodeURIComponent(scheme)}`, 302);
    }
    return sendCached(req, reply, 'text/turtle; charset=utf-8', ttl);
  };

  app.get('/vocab/:scheme', handleVocabCanon);
  app.get('/vocab/:scheme/', handleVocabCanon);
  app.get('/vocab/:scheme/:code', handleVocabCanon);

  app.get('/ns', async (req, reply) => {
    reply.header('Vary', 'Accept');
    if (prefersHtml(req.headers.accept)) return reply.redirect('/systematik', 302);
    return sendCached(req, reply, 'text/turtle; charset=utf-8', store.ontologieTtl);
  });
}
