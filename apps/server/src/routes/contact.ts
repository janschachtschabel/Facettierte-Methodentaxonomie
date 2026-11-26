import type { FastifyInstance } from 'fastify';
import { DEFAULT_CONTACT_TO } from '../config.js';

/**
 * The address of the legal notice. The server sends no mail: the contact form in the web app opens the
 * visitor's own mail program. The address is handed out on request only, so it never stands in the page
 * source or the script bundle.
 */
export function registerContactRoutes(app: FastifyInstance) {
  app.get('/api/v1/kontakt/adresse', { config: { rateLimit: { max: 120, timeWindow: '1 hour' } } }, async (_req, reply) => {
    reply.header('Cache-Control', 'no-store').header('X-Robots-Tag', 'noindex, nofollow');
    const [local, domain] = DEFAULT_CONTACT_TO.split('@');
    return { teile: [local, domain] };
  });
}
