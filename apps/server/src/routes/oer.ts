import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { ServerConfig } from '../config.js';
import { LruTtlCache } from '../llm/cache.js';

export interface OerItem {
  id: string;
  title: string;
  description: string;
  /** Primary target URL (always prefers ccm:wwwurl from WLO) */
  url: string;
  /** Explicit WLO ccm:wwwurl field (direct link to the educational resource) */
  wwwurl: string;
  /** Permalink to the WLO Prod metadata/render view */
  wloRenderUrl: string | null;
  previewUrl: string | null;
  license: string | null;
  resourceType: string | null;
  educationalContext: string[];
  keywords: string[];
  source: 'wlo';
}

export interface WloSearchParams {
  query: string;
  fach?: string;
  /** FMT subject area; filters by all OEH subjects of the area when no single subject is known. */
  fachbereich?: string;
  bildungsstufe?: string;
  inhaltstyp?: string;
  nurOffeneLizenz?: boolean;
  maxItems?: number;
}

export interface WloSearchResponse {
  quelle: 'wlo';
  instanz: string;
  gecacht: boolean;
  suchbegriff: string;
  /** Which subject filter the search started with: the named subject or the OEH subjects of the subject area. */
  fachfilter?: WloFachfilter;
  hinweis?: string;
  anzahl: number;
  ergebnisse: OerItem[];
}

export interface WloFachfilter {
  art: 'fach' | 'fachbereich';
  fachbereich?: string;
  /** OEH discipline URIs sent as filter (one of them has to match). */
  faecher: string[];
}

export const WLO_PROD_ORIGIN = 'https://redaktion.openeduhub.net';
const WLO_ENDPOINT = `${WLO_PROD_ORIGIN}/edu-sharing/rest/search/v1/queries/-home-/mds_oeh/ngsearch`;

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
const DE_STOPWORDS = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'eines',
  'und', 'oder', 'von', 'vom', 'zu', 'zum', 'zur', 'im', 'in', 'am', 'an', 'auf', 'mit', 'fuer',
  'für', 'ueber', 'über', 'bei', 'beim', 'als', 'aus', 'nach', 'durch', 'klasse', 'stunde',
  'doppelstunde', 'unterricht', 'thema', 'konzept', 'verstehen', 'lernen', 'einfuehrung',
  'einführung', 'erklaeren', 'erklären', 'ueben', 'üben', 'vertiefen', 'anwenden', 'grundlagen',
  'methoden', 'methode', 'schueler', 'schüler', 'lernende', 'einheit', 'reihe', 'projekt'
]);

export function sanitizeWloSearchWord(raw: string): string {
  const tokens = raw
    .replace(/[,;:!?()[\]„“"']/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !DE_STOPWORDS.has(t.toLowerCase()));
  return (tokens.length ? tokens.join(' ') : raw.trim()).slice(0, 120);
}

/** Prefixes that form school subject compounds: Schulsport, Wahlpflichtinformatik, Leistungskursmathematik … */
const SUBJECT_PREFIXES = ['schul', 'wahlpflicht', 'wahl', 'leistungskurs', 'grundkurs', 'profil', 'zusatz', 'fach'];

/** Looks a subject name up in the OEH discipline vocabulary; set once at start from the catalogue. */
let subjectLookup: ((name: string) => string | null) | null = null;
export function setWloSubjectLookup(lookup: (name: string) => string | null): void {
  subjectLookup = lookup;
}

/** OEH discipline URI for a subject name: the vocabulary first, the short built-in list as fallback. */
export function resolveFachUri(fach: string, lookup: ((name: string) => string | null) | null = subjectLookup): string | null {
  const viaVocabulary = fach.trim() && lookup ? lookup(fach) : null;
  if (viaVocabulary) return viaVocabulary;
  const norm = fach
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
  if (!norm) return null;
  if (Object.hasOwn(FACH_TO_TAXON_URI, norm)) return FACH_TO_TAXON_URI[norm];
  // A key must start a word ("Mathematikdidaktik" → mathe) or follow a school prefix ("Schulsport" → sport),
  // but must not sit anywhere inside a word ("Transport" ≠ sport).
  const words = norm.split(/[^a-z]+/).filter(Boolean);
  const startsAfterPrefix = (w: string, k: string) => SUBJECT_PREFIXES.some((p) => w.startsWith(p + k));
  const hit = Object.keys(FACH_TO_TAXON_URI).find((k) => words.some((w) => w.startsWith(k) || startsAfterPrefix(w, k)));
  return hit ? FACH_TO_TAXON_URI[hit] : null;
}

/** OEH discipline URIs of an FMT subject area; set once at start from the catalogue. */
let areaLookup: ((fachbereich: string) => string[]) | null = null;
export function setWloAreaLookup(lookup: (fachbereich: string) => string[]): void {
  areaLookup = lookup;
}

/**
 * Subject filter of a WLO search: the named subject if the vocabulary knows it, otherwise every OEH subject
 * of the plan's subject area (WLO matches one of them). No filter for 'uebergreifend' and unknown areas.
 */
export function wloSubjectFilter(fach: string, fachbereich: string | undefined): { art: 'fach' | 'fachbereich' | null; uris: string[] } {
  const fachUri = resolveFachUri(fach);
  if (fachUri) return { art: 'fach', uris: [fachUri] };
  const uris = fachbereich && areaLookup ? areaLookup(fachbereich) : [];
  return uris.length ? { art: 'fachbereich', uris } : { art: null, uris: [] };
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

function firstExternalHttpUrl(props: Record<string, string[] | undefined> | undefined, ...keys: string[]): string {
  if (!props) return '';
  for (const k of keys) {
    const v = props[k];
    if (!Array.isArray(v)) continue;
    for (const candidate of v) {
      if (typeof candidate !== 'string') continue;
      const trimmed = candidate.trim();
      if (/^https?:\/\//i.test(trimmed) && !trimmed.startsWith(WLO_PROD_ORIGIN)) {
        return trimmed;
      }
    }
  }
  return '';
}

export function normalizeWloNodes(nodes: WloNode[]): OerItem[] {
  const externalItems: OerItem[] = [];
  const repoFallbackItems: OerItem[] = [];
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  for (const n of nodes) {
    const props = n.properties || {};
    const id = n.ref?.id || '';
    const title = firstProp(props, 'cclom:title', 'cm:title', 'cm:name') || n.name || '';
    const normTitle = title.toLowerCase().replace(/\s+/g, ' ').trim();
    const wloRenderUrl = id ? `${WLO_PROD_ORIGIN}/edu-sharing/components/render/${id}` : null;
    // Prefer real external wwwurl from WLO metadata (ccm:wwwurl -> cclom:location -> ccm:replicationsourceid)
    const externalUrl = firstExternalHttpUrl(props, 'ccm:wwwurl', 'cclom:location', 'ccm:replicationsourceid');
    const wwwurl = externalUrl || wloRenderUrl || '';
    if (!title || !wwwurl || !/^https?:\/\//i.test(wwwurl)) continue;
    if (seenUrls.has(wwwurl) || (normTitle && seenTitles.has(normTitle))) continue;
    seenUrls.add(wwwurl);
    if (normTitle) seenTitles.add(normTitle);
    const description = firstProp(props, 'cclom:general_description', 'cm:description').slice(0, 320);
    const license = firstProp(props, 'ccm:commonlicense_key_DISPLAYNAME', 'ccm:commonlicense_key') || null;
    const resourceType = firstProp(props, 'ccm:oeh_lrt_aggregated_DISPLAYNAME', 'ccm:oeh_lrt_aggregated') || null;
    const educationalContext = (props['ccm:educationalcontext_DISPLAYNAME'] || props['ccm:educationalcontext'] || []).slice(0, 3);
    const keywords = (props['cclom:general_keyword'] || []).slice(0, 6);
    const item: OerItem = {
      id: id || crypto.createHash('sha1').update(wwwurl).digest('hex').slice(0, 12),
      title,
      description,
      url: wwwurl,
      wwwurl,
      wloRenderUrl,
      previewUrl: n.preview?.url && /^https?:\/\//i.test(n.preview.url) ? n.preview.url : null,
      license,
      resourceType,
      educationalContext,
      keywords,
      source: 'wlo'
    };
    if (externalUrl) externalItems.push(item);
    else repoFallbackItems.push(item);
  }
  // Always prioritize items that carry a genuine external ccm:wwwurl over internal repo-render URLs
  return [...externalItems, ...repoFallbackItems];
}

const wloCache = new LruTtlCache<{ items: OerItem[]; hinweis?: string; fachfilter?: WloFachfilter }>(300, 10 * 60 * 1000);

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
      'User-Agent': 'FMT-Methodendatenbank/1.5'
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

export async function searchWloOer(params: WloSearchParams): Promise<WloSearchResponse> {
  const rawQuery = (params.query || '').trim();
  const fach = (params.fach || '').trim();
  const fachbereich = (params.fachbereich || '').trim();
  const bildungsstufe = (params.bildungsstufe || '').trim();
  const inhaltstyp = (params.inhaltstyp || '').trim().toLowerCase();
  const nurOffeneLizenz = Boolean(params.nurOffeneLizenz);
  const maxItems = Math.max(1, Math.min(16, Number(params.maxItems) || 8));
  const rawFetchLimit = Math.min(24, Math.max(16, maxItems * 2));

  const cleanWord = sanitizeWloSearchWord(rawQuery || fach);
  if (!cleanWord) {
    throw new Error('Bitte Suchbegriff oder Thema für die WLO-OER-Suche angeben.');
  }

  const subject = wloSubjectFilter(fach, fachbereich);
  const fachUris = subject.uris;
  const fachfilter: WloFachfilter | undefined = subject.art
    ? { art: subject.art, ...(subject.art === 'fachbereich' ? { fachbereich } : {}), faecher: fachUris }
    : undefined;
  const ctxUri = Object.hasOwn(STAGE_TO_WLO_CONTEXT, bildungsstufe) ? STAGE_TO_WLO_CONTEXT[bildungsstufe] : null;
  const lrtUri = Object.hasOwn(CONTENT_TYPE_TO_LRT_URI, inhaltstyp) ? CONTENT_TYPE_TO_LRT_URI[inhaltstyp] : null;

  const cacheKey = crypto
    .createHash('sha256')
    .update(JSON.stringify(['v3', cleanWord.toLowerCase(), fachUris, ctxUri, lrtUri, nurOffeneLizenz, maxItems]))
    .digest('hex');

  const cached = wloCache.get(cacheKey);
  if (cached) {
    return {
      quelle: 'wlo',
      instanz: WLO_PROD_ORIGIN,
      gecacht: true,
      suchbegriff: cleanWord,
      fachfilter: cached.fachfilter,
      hinweis: cached.hinweis,
      anzahl: cached.items.length,
      ergebnisse: cached.items
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const buildCriteria = (word: string, useLrt: boolean, useCtx: boolean, useFach: boolean) => {
      const c: Array<{ property: string; values: string[] }> = [{ property: 'ngsearchword', values: [word] }];
      if (useFach && fachUris.length) c.push({ property: 'virtual:taxonid', values: fachUris });
      if (useCtx && ctxUri) c.push({ property: 'ccm:educationalcontext', values: [ctxUri] });
      if (useLrt && lrtUri) c.push({ property: 'ccm:oeh_lrt_aggregated', values: [lrtUri] });
      if (nurOffeneLizenz) {
        c.push({ property: 'ccm:commonlicense_key', values: ['CC_0', 'CC_BY', 'CC_BY_SA', 'PDM'] });
      }
      return c;
    };

    const mergeUnique = (base: OerItem[], extra: OerItem[]) => {
      const seenU = new Set(base.map((x) => x.wwwurl));
      const seenT = new Set(base.map((x) => x.title.toLowerCase().trim()));
      const merged = [...base];
      for (const it of extra) {
        const nt = it.title.toLowerCase().trim();
        if (seenU.has(it.wwwurl) || seenT.has(nt)) continue;
        seenU.add(it.wwwurl);
        seenT.add(nt);
        merged.push(it);
      }
      // Keep external wwwurl items ahead of repo-render fallbacks
      const ext = merged.filter((x) => !x.wwwurl.startsWith(WLO_PROD_ORIGIN));
      const repo = merged.filter((x) => x.wwwurl.startsWith(WLO_PROD_ORIGIN));
      return [...ext, ...repo].slice(0, maxItems);
    };

    const minWanted = Math.min(4, maxItems);
    let hinweis: string | undefined;
    // The subject filter only counts as applied while no query had to drop it.
    let fachGelockert = false;
    let items = await queryEduSharing(buildCriteria(cleanWord, true, true, true), rawFetchLimit, controller.signal);

    // Progressive relaxation if strict URI combination yields fewer than 4 hits
    if (items.length < minWanted && lrtUri) {
      const more = await queryEduSharing(buildCriteria(cleanWord, false, true, true), rawFetchLimit, controller.signal);
      items = mergeUnique(items, more);
      if (items.length >= minWanted) hinweis = 'Medientyp-Filter wurde für eine breitere Auswahl gelockert.';
    }
    if (items.length < minWanted && ctxUri) {
      const more = await queryEduSharing(buildCriteria(cleanWord, false, false, true), rawFetchLimit, controller.signal);
      items = mergeUnique(items, more);
      if (items.length >= minWanted) hinweis = 'Bildungsstufen-Filter wurde für mehr Treffer gelockert.';
    }
    if (items.length < minWanted && fachUris.length) {
      fachGelockert = true;
      const more = await queryEduSharing(buildCriteria(cleanWord, false, false, false), rawFetchLimit, controller.signal);
      items = mergeUnique(items, more);
      if (items.length >= minWanted) hinweis = 'Fach- und Stufenfilter wurden gelockert (offene Stichwortsuche in WLO Prod).';
    }
    // If a multi-word query still yields < 4 hits, retry with the strongest single core noun
    const words = cleanWord.split(/\s+/).filter(Boolean);
    if (items.length < minWanted && words.length > 1) {
      const coreWord = [...words].sort((a, b) => b.length - a.length)[0];
      const more = await queryEduSharing(buildCriteria(coreWord, false, false, fachUris.length > 0), rawFetchLimit, controller.signal);
      items = mergeUnique(items, more);
      if (items.length > 0) hinweis = `Auswahl um Treffer zum Kernbegriff „${coreWord}“ erweitert.`;
    }
    items = mergeUnique([], items);

    const appliedFilter = fachGelockert ? undefined : fachfilter;
    wloCache.set(cacheKey, { items, hinweis, fachfilter: appliedFilter });
    return {
      quelle: 'wlo',
      instanz: WLO_PROD_ORIGIN,
      gecacht: false,
      suchbegriff: cleanWord,
      fachfilter: appliedFilter,
      hinweis,
      anzahl: items.length,
      ergebnisse: items
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Only preview images of the WLO production instance are passed through; nothing else can be fetched. */
export function isWloPreviewUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.origin === WLO_PROD_ORIGIN && u.pathname.startsWith('/edu-sharing/') && !u.username && !u.password;
  } catch {
    return false;
  }
}

const PREVIEW_MAX_BYTES = 2 * 1024 * 1024;
// Thumbnails are small; a short cache keeps repeated views from reaching WLO again.
const previewCache = new LruTtlCache<{ type: string; buf: Buffer }>(200, 60 * 60 * 1000);

/** Reads a response body but stops as soon as it grows past `max` bytes (returns null then). */
async function readCapped(res: Response, max: number): Promise<Buffer | null> {
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > max) {
    await res.body?.cancel().catch(() => {});
    return null;
  }
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export function registerOerRoutes(app: FastifyInstance, config: ServerConfig) {
  // Preview images of WLO hits travel through this server: the visitor's browser never contacts WLO itself.
  app.get(
    '/api/v1/oer/vorschau',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const raw = String((req.query as { u?: unknown })?.u ?? '');
      if (!isWloPreviewUrl(raw)) return reply.code(400).send({ fehler: 'Nur Vorschaubilder von WirLernenOnline.' });
      const send = (img: { type: string; buf: Buffer }) =>
        reply
          .header('Content-Type', img.type)
          .header('Cache-Control', 'public, max-age=86400')
          .header('X-Content-Type-Options', 'nosniff')
          // SVG may carry scripts; it is only ever shown as an image, never as a document.
          .header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
          .send(img.buf);
      const cached = previewCache.get(raw);
      if (cached) return send(cached);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(raw, { signal: controller.signal, redirect: 'error', headers: { Accept: 'image/*' } });
        const type = res.headers.get('content-type') || '';
        if (!res.ok || !/^image\/(png|jpe?g|gif|webp|svg\+xml)\b/i.test(type)) {
          await res.body?.cancel().catch(() => {});
          return reply.code(404).send({ fehler: 'Kein Vorschaubild.' });
        }
        const buf = await readCapped(res, PREVIEW_MAX_BYTES);
        if (!buf) return reply.code(404).send({ fehler: 'Vorschaubild zu groß.' });
        const img = { type, buf };
        previewCache.set(raw, img);
        return send(img);
      } catch {
        return reply.code(502).send({ fehler: 'Vorschaubild nicht erreichbar.' });
      } finally {
        clearTimeout(timer);
      }
    }
  );

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
      const body = req.body as Partial<WloSearchParams> | null;
      const rawQuery = typeof body?.query === 'string' ? body.query.trim() : '';
      const fach = typeof body?.fach === 'string' ? body.fach.trim() : '';
      if (!rawQuery && !fach) {
        return reply.code(400).send({ fehler: 'Bitte Suchbegriff oder Thema für die WLO-OER-Suche angeben.' });
      }
      try {
        const result = await searchWloOer({
          query: rawQuery,
          fach,
          fachbereich: typeof body?.fachbereich === 'string' ? body.fachbereich : undefined,
          bildungsstufe: typeof body?.bildungsstufe === 'string' ? body.bildungsstufe : undefined,
          inhaltstyp: typeof body?.inhaltstyp === 'string' ? body.inhaltstyp : undefined,
          nurOffeneLizenz: Boolean(body?.nurOffeneLizenz),
          maxItems: typeof body?.maxItems === 'number' ? body.maxItems : 9
        });
        return reply.send(result);
      } catch (e) {
        return reply.code(502).send({
          fehler:
            e instanceof Error && e.name === 'AbortError'
              ? 'Zeitüberschreitung bei der WirLernenOnline-Suche (9 s).'
              : `WirLernenOnline-Suche derzeit nicht verfügbar (${e instanceof Error ? e.message : 'Netzwerkfehler'}).`
        });
      }
    }
  );
}
