import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { ServerConfig } from '../config.js';
import { LruTtlCache } from '../llm/cache.js';

export interface OerItem {
  id: string;
  title: string;
  description: string;
  url: string;
  previewUrl: string | null;
  license: string | null;
  resourceType: string | null;
  educationalContext: string[];
  keywords: string[];
  source: 'wlo';
}

const WLO_ENDPOINT =
  'https://redaktion.openeduhub.net/edu-sharing/rest/search/v1/queries/-home-/mds_oeh/ngsearch';

const STAGE_TO_WLO_CONTEXT: Record<string, string> = {
  primar: 'http://w3id.org/openeduhub/vocabs/educationalContext/grundschule',
  sek1: 'http://w3id.org/openeduhub/vocabs/educationalContext/sekundarstufe_1',
  sek2: 'http://w3id.org/openeduhub/vocabs/educationalContext/sekundarstufe_2',
  berufsbildung: 'http://w3id.org/openeduhub/vocabs/educationalContext/berufliche_bildung',
  hochschule: 'http://w3id.org/openeduhub/vocabs/educationalContext/hochschule',
  erwachsenenbildung: 'http://w3id.org/openeduhub/vocabs/educationalContext/fortbildung'
};

interface WloNode {
  ref?: { id?: string };
  name?: string;
  preview?: { url?: string };
  properties?: Record<string, string[] | undefined>;
}

function firstProp(props: Record<string, string[] | undefined> | undefined, ...keys: string[]): string {
  if (!props) return '';
  for (const k of keys) {
    const v = props[k];
    if (Array.isArray(v) && v.length && typeof v[0] === 'string' && v[0].trim()) {
      return v[0].trim();
    }
  }
  return '';
}

export function normalizeWloNodes(nodes: WloNode[]): OerItem[] {
  const out: OerItem[] = [];
  for (const n of nodes) {
    const props = n.properties || {};
    const id = n.ref?.id || '';
    const title = firstProp(props, 'cclom:title', 'cm:title', 'cm:name') || n.name || '';
    const url = firstProp(props, 'ccm:wwwurl', 'cclom:location') || (id ? `https://redaktion.openeduhub.net/edu-sharing/components/render/${id}` : '');
    if (!title || !url) continue;
    const description = firstProp(props, 'cclom:general_description', 'cm:description').slice(0, 360);
    const license = firstProp(props, 'ccm:commonlicense_key', 'ccm:commonlicense_key_DISPLAYNAME') || null;
    const resourceType = firstProp(props, 'ccm:oeh_lrt_aggregated_DISPLAYNAME', 'ccm:oeh_lrt_aggregated') || null;
    const educationalContext = (props['ccm:educationalcontext_DISPLAYNAME'] || props['ccm:educationalcontext'] || []).slice(0, 4);
    const keywords = (props['cclom:general_keyword'] || []).slice(0, 6);
    out.push({
      id: id || crypto.createHash('sha1').update(url).digest('hex').slice(0, 12),
      title,
      description,
      url,
      previewUrl: n.preview?.url || null,
      license,
      resourceType,
      educationalContext,
      keywords,
      source: 'wlo'
    });
  }
  return out;
}

export function registerOerRoutes(app: FastifyInstance, config: ServerConfig) {
  const cache = new LruTtlCache<OerItem[]>(200, 10 * 60 * 1000);

  app.post(
    '/api/v1/oer/wlo-search',
    {
      config: {
        rateLimit: {
          max: Math.max(30, config.llmRateLimitPerMin * 2),
          timeWindow: '1 minute'
        }
      }
    },
    async (req, reply) => {
      const body = req.body as {
        query?: string;
        fach?: string;
        bildungsstufe?: string;
        maxItems?: number;
      } | null;

      const rawQuery = typeof body?.query === 'string' ? body.query.trim() : '';
      const fach = typeof body?.fach === 'string' ? body.fach.trim() : '';
      const bildungsstufe = typeof body?.bildungsstufe === 'string' ? body.bildungsstufe.trim() : '';
      const maxItems = Math.max(1, Math.min(12, Number(body?.maxItems) || 6));

      const searchWord = [fach, rawQuery].filter(Boolean).join(' ').trim();
      if (!searchWord) {
        return reply.code(400).send({ fehler: 'Bitte Suchbegriff oder Thema für die WLO-OER-Suche angeben.' });
      }

      const cacheKey = crypto
        .createHash('sha256')
        .update(JSON.stringify([searchWord.toLowerCase(), bildungsstufe, maxItems]))
        .digest('hex');

      const cached = cache.get(cacheKey);
      if (cached) {
        return reply.send({ quelle: 'wlo', gecacht: true, anzahl: cached.length, ergebnisse: cached });
      }

      const criteria: Array<{ property: string; values: string[] }> = [
        { property: 'ngsearchword', values: [searchWord] }
      ];
      const ctxUri = STAGE_TO_WLO_CONTEXT[bildungsstufe];
      if (ctxUri) {
        criteria.push({ property: 'ccm:educationalcontext', values: [ctxUri] });
      }

      const params = new URLSearchParams({
        contentType: 'FILES',
        maxItems: String(maxItems),
        skipCount: '0',
        propertyFilter: '-all-'
      });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(`${WLO_ENDPOINT}?${params.toString()}`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'FMT-Methodendatenbank/1.3'
          },
          body: JSON.stringify({ criteria }),
          signal: controller.signal
        });

        if (!res.ok) {
          return reply.code(502).send({
            fehler: `WirLernenOnline-Suche derzeit nicht verfügbar (HTTP ${res.status}).`
          });
        }

        const data = (await res.json()) as { nodes?: WloNode[] };
        const items = normalizeWloNodes(Array.isArray(data.nodes) ? data.nodes : []);
        cache.set(cacheKey, items);
        return reply.send({ quelle: 'wlo', gecacht: false, anzahl: items.length, ergebnisse: items });
      } catch (e) {
        return reply.code(502).send({
          fehler:
            e instanceof Error && e.name === 'AbortError'
              ? 'Zeitüberschreitung bei der WirLernenOnline-Suche (8 s).'
              : 'WirLernenOnline-Suche fehlgeschlagen (Netzwerkfehler).'
        });
      } finally {
        clearTimeout(timer);
      }
    }
  );
}
