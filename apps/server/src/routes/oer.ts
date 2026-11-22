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

// Official OpenEduHub discipline URIs (virtual:taxonid)
const FACH_TO_TAXON_URI: Record<string, string> = {
  mathematik: 'http://w3id.org/openeduhub/vocabs/discipline/380',
  mathe: 'http://w3id.org/openeduhub/vocabs/discipline/380',
  physik: 'http://w3id.org/openeduhub/vocabs/discipline/460',
  biologie: 'http://w3id.org/openeduhub/vocabs/discipline/080',
  chemie: 'http://w3id.org/openeduhub/vocabs/discipline/100',
  deutsch: 'http://w3id.org/openeduhub/vocabs/discipline/120',
  daz: 'http://w3id.org/openeduhub/vocabs/discipline/28002',
  englisch: 'http://w3id.org/openeduhub/vocabs/discipline/20001',
  franzoesisch: 'http://w3id.org/openeduhub/vocabs/discipline/20002',
  spanisch: 'http://w3id.org/openeduhub/vocabs/discipline/20007',
  latein: 'http://w3id.org/openeduhub/vocabs/discipline/20005',
  geschichte: 'http://w3id.org/openeduhub/vocabs/discipline/240',
  geografie: 'http://w3id.org/openeduhub/vocabs/discipline/220',
  geographie: 'http://w3id.org/openeduhub/vocabs/discipline/220',
  erdkunde: 'http://w3id.org/openeduhub/vocabs/discipline/220',
  politik: 'http://w3id.org/openeduhub/vocabs/discipline/480',
  gemeinschaftskunde: 'http://w3id.org/openeduhub/vocabs/discipline/48005',
  gesellschaftskunde: 'http://w3id.org/openeduhub/vocabs/discipline/48005',
  wirtschaft: 'http://w3id.org/openeduhub/vocabs/discipline/700',
  informatik: 'http://w3id.org/openeduhub/vocabs/discipline/320',
  kunst: 'http://w3id.org/openeduhub/vocabs/discipline/060',
  musik: 'http://w3id.org/openeduhub/vocabs/discipline/420',
  sport: 'http://w3id.org/openeduhub/vocabs/discipline/600',
  ethik: 'http://w3id.org/openeduhub/vocabs/discipline/160',
  philosophie: 'http://w3id.org/openeduhub/vocabs/discipline/450',
  religion: 'http://w3id.org/openeduhub/vocabs/discipline/520',
  sachunterricht: 'http://w3id.org/openeduhub/vocabs/discipline/28010',
  paedagogik: 'http://w3id.org/openeduhub/vocabs/discipline/440',
  psychologie: 'http://w3id.org/openeduhub/vocabs/discipline/510',
  nachhaltigkeit: 'http://w3id.org/openeduhub/vocabs/discipline/64018',
  medienbildung: 'http://w3id.org/openeduhub/vocabs/discipline/900',
  mint: 'http://w3id.org/openeduhub/vocabs/discipline/04003'
};

// Official OpenEduHub content type URIs (ccm:oeh_lrt_aggregated)
const CONTENT_TYPE_TO_LRT_URI: Record<string, string> = {
  arbeitsblatt: 'http://w3id.org/openeduhub/vocabs/new_lrt_aggregated/c8e52242-361b-4a2a-b95d-25e516b28b45',
  uebung: 'http://w3id.org/openeduhub/vocabs/new_lrt_aggregated/0b2d7dec-8eb1-4a28-9cf2-4f3a4f5a511b',
  video: 'http://w3id.org/openeduhub/vocabs/new_lrt_aggregated/38774279-af36-4ec2-8e70-811d5a51a6a1',
  interaktiv: 'http://w3id.org/openeduhub/vocabs/new_lrt_aggregated/05aa0f49-7e1b-498b-a7d5-c5fc8e73b2e2',
  experiment: 'http://w3id.org/openeduhub/vocabs/new_lrt_aggregated/ffe4d8e8-3cfd-4e9a-b025-83f129eb5c9d',
  quiz: 'http://w3id.org/openeduhub/vocabs/new_lrt_aggregated/02bfd0fe-96ab-4dd6-a306-ec362ec25ea0',
  rollenspiel: 'http://w3id.org/openeduhub/vocabs/new_lrt_aggregated/d0c115e4-848d-4aea-8e31-23869e9add3e',
  fallstudie: 'http://w3id.org/openeduhub/vocabs/new_lrt_aggregated/41eaccae-899b-4209-8a54-c793a3cdf538',
  handout: 'http://w3id.org/openeduhub/vocabs/new_lrt_aggregated/9abf6ace-85bc-44e2-af4f-93a6bd255a21',
  lernspiel: 'http://w3id.org/openeduhub/vocabs/new_lrt_aggregated/ded96854-280a-45ac-ad3a-f5b9b8dd0a03'
};

// Guard against edu-sharing Trap #2.8 ("Ein Rahmenwort ruiniert eine Anfrage"):
// Strip German articles/prepositions from ngsearchword before querying edu-sharing.
const DE_STOPWORDS = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'eines',
  'und', 'oder', 'von', 'vom', 'zu', 'zum', 'zur', 'im', 'in', 'am', 'an', 'auf', 'mit', 'fuer',
  'für', 'ueber', 'über', 'bei', 'beim', 'als', 'aus', 'nach', 'durch', 'klasse', 'stunde',
  'doppelstunde', 'unterricht', 'thema'
]);

export function sanitizeWloSearchWord(raw: string): string {
  const tokens = raw
    .replace(/[,;:!?()[\]„“"']/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !DE_STOPWORDS.has(t.toLowerCase()));
  return (tokens.length ? tokens.join(' ') : raw.trim()).slice(0, 120);
}

function resolveFachUri(fach: string): string | null {
  const norm = fach
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
  if (!norm) return null;
  if (FACH_TO_TAXON_URI[norm]) return FACH_TO_TAXON_URI[norm];
  const hit = Object.keys(FACH_TO_TAXON_URI).find((k) => norm.includes(k));
  return hit ? FACH_TO_TAXON_URI[hit] : null;
}

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
  const seenUrls = new Set<string>();
  for (const n of nodes) {
    const props = n.properties || {};
    const id = n.ref?.id || '';
    const title = firstProp(props, 'cclom:title', 'cm:title', 'cm:name') || n.name || '';
    const url =
      firstProp(props, 'ccm:wwwurl', 'cclom:location') ||
      (id ? `https://redaktion.openeduhub.net/edu-sharing/components/render/${id}` : '');
    if (!title || !url || !/^https?:\/\//i.test(url) || seenUrls.has(url)) continue;
    seenUrls.add(url);
    const description = firstProp(props, 'cclom:general_description', 'cm:description').slice(0, 320);
    const license = firstProp(props, 'ccm:commonlicense_key_DISPLAYNAME', 'ccm:commonlicense_key') || null;
    const resourceType = firstProp(props, 'ccm:oeh_lrt_aggregated_DISPLAYNAME', 'ccm:oeh_lrt_aggregated') || null;
    const educationalContext = (props['ccm:educationalcontext_DISPLAYNAME'] || props['ccm:educationalcontext'] || []).slice(0, 3);
    const keywords = (props['cclom:general_keyword'] || []).slice(0, 6);
    out.push({
      id: id || crypto.createHash('sha1').update(url).digest('hex').slice(0, 12),
      title,
      description,
      url,
      previewUrl: n.preview?.url && /^https?:\/\//i.test(n.preview.url) ? n.preview.url : null,
      license,
      resourceType,
      educationalContext,
      keywords,
      source: 'wlo'
    });
  }
  return out;
}

async function queryEduSharing(
  criteria: Array<{ property: string; values: string[] }>,
  maxItems: number,
  signal: AbortSignal
): Promise<OerItem[]> {
  const params = new URLSearchParams({
    contentType: 'FILES',
    maxItems: String(maxItems),
    skipCount: '0',
    propertyFilter: '-all-'
  });
  const res = await fetch(`${WLO_ENDPOINT}?${params.toString()}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'FMT-Methodendatenbank/1.4'
    },
    body: JSON.stringify({ criteria }),
    signal
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const data = (await res.json()) as { nodes?: WloNode[] };
  return normalizeWloNodes(Array.isArray(data.nodes) ? data.nodes : []);
}

export function registerOerRoutes(app: FastifyInstance, config: ServerConfig) {
  const cache = new LruTtlCache<{ items: OerItem[]; hinweis?: string }>(250, 10 * 60 * 1000);

  app.post(
    '/api/v1/oer/wlo-search',
    {
      config: {
        rateLimit: {
          max: Math.max(40, config.llmRateLimitPerMin * 3),
          timeWindow: '1 minute'
        }
      }
    },
    async (req, reply) => {
      const body = req.body as {
        query?: string;
        fach?: string;
        bildungsstufe?: string;
        inhaltstyp?: string;
        maxItems?: number;
      } | null;

      const rawQuery = typeof body?.query === 'string' ? body.query.trim() : '';
      const fach = typeof body?.fach === 'string' ? body.fach.trim() : '';
      const bildungsstufe = typeof body?.bildungsstufe === 'string' ? body.bildungsstufe.trim() : '';
      const inhaltstyp = typeof body?.inhaltstyp === 'string' ? body.inhaltstyp.trim().toLowerCase() : '';
      const maxItems = Math.max(1, Math.min(12, Number(body?.maxItems) || 6));

      const cleanWord = sanitizeWloSearchWord(rawQuery || fach);
      if (!cleanWord) {
        return reply.code(400).send({ fehler: 'Bitte Suchbegriff oder Thema für die WLO-OER-Suche angeben.' });
      }

      const fachUri = resolveFachUri(fach);
      const ctxUri = STAGE_TO_WLO_CONTEXT[bildungsstufe] || null;
      const lrtUri = CONTENT_TYPE_TO_LRT_URI[inhaltstyp] || null;

      const cacheKey = crypto
        .createHash('sha256')
        .update(JSON.stringify([cleanWord.toLowerCase(), fachUri, ctxUri, lrtUri, maxItems]))
        .digest('hex');

      const cached = cache.get(cacheKey);
      if (cached) {
        return reply.send({
          quelle: 'wlo',
          gecacht: true,
          suchbegriff: cleanWord,
          hinweis: cached.hinweis,
          anzahl: cached.items.length,
          ergebnisse: cached.items
        });
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 9000);
      try {
        const buildCriteria = (useLrt: boolean, useCtx: boolean, useFach: boolean) => {
          const c: Array<{ property: string; values: string[] }> = [{ property: 'ngsearchword', values: [cleanWord] }];
          if (useFach && fachUri) c.push({ property: 'virtual:taxonid', values: [fachUri] });
          if (useCtx && ctxUri) c.push({ property: 'ccm:educationalcontext', values: [ctxUri] });
          if (useLrt && lrtUri) c.push({ property: 'ccm:oeh_lrt_aggregated', values: [lrtUri] });
          return c;
        };

        let hinweis: string | undefined;
        let items = await queryEduSharing(buildCriteria(true, true, true), maxItems, controller.signal);

        // Progressive relaxation if strict URI combination yields 0 hits
        if (items.length === 0 && (lrtUri || ctxUri || fachUri)) {
          items = await queryEduSharing(buildCriteria(false, true, true), maxItems, controller.signal);
          if (items.length > 0 && lrtUri) {
            hinweis = 'Filter „Inhaltstyp“ wurde für mehr Treffer gelockert.';
          }
        }
        if (items.length === 0 && (ctxUri || fachUri)) {
          items = await queryEduSharing(buildCriteria(false, false, true), maxItems, controller.signal);
          if (items.length > 0) {
            hinweis = 'Bildungsstufen-Filter wurde für mehr Treffer gelockert.';
          }
        }
        if (items.length === 0 && fachUri) {
          items = await queryEduSharing(buildCriteria(false, false, false), maxItems, controller.signal);
          if (items.length > 0) {
            hinweis = 'Fach- und Stufenfilter wurden gelockert (offene Stichwortsuche).';
          }
        }

        cache.set(cacheKey, { items, hinweis });
        return reply.send({
          quelle: 'wlo',
          gecacht: false,
          suchbegriff: cleanWord,
          hinweis,
          anzahl: items.length,
          ergebnisse: items
        });
      } catch (e) {
        return reply.code(502).send({
          fehler:
            e instanceof Error && e.name === 'AbortError'
              ? 'Zeitüberschreitung bei der WirLernenOnline-Suche (9 s).'
              : `WirLernenOnline-Suche derzeit nicht verfügbar (${e instanceof Error ? e.message : 'Netzwerkfehler'}).`
        });
      } finally {
        clearTimeout(timer);
      }
    }
  );
}
