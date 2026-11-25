/**
 * URL checks for every link built from imported files, LLM output or external search results.
 * Only http(s) and mailto survive; javascript:, data: and the like are dropped.
 */

export function safeExternalUrl(url: unknown): string {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  return /^(?:https?:\/\/|mailto:)/i.test(trimmed) ? trimmed : '';
}

interface LinkLike {
  url?: string;
  wwwurl?: string;
  wloRenderUrl?: string | null;
  previewUrl?: string | null;
}

/**
 * Entries whose effective link (wwwurl, else url) and url are safe; others are dropped.
 * Secondary links (wloRenderUrl, previewUrl) are set to null when unsafe.
 */
export function safeOerList<T extends LinkLike>(list: T[] | undefined | null): T[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      (o) => !!o && typeof o === 'object' && !!safeExternalUrl(o.wwwurl || o.url) && (!o.url || !!safeExternalUrl(o.url))
    )
    .map((o) => {
      const out = { ...o };
      if (out.wloRenderUrl != null) out.wloRenderUrl = safeExternalUrl(out.wloRenderUrl) || null;
      if (out.previewUrl != null) out.previewUrl = safeExternalUrl(out.previewUrl) || null;
      return out;
    });
}
