import katex from 'katex';
import { safeExternalUrl } from './safeUrl.js';

export type MathOutputMode = 'htmlAndMathml' | 'mathml';

export interface MarkdownHtmlOptions {
  mathOutput?: MathOutputMode;
}

export const escHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function renderKatex(expr: string, displayMode: boolean, mathOutput: MathOutputMode): string {
  const cleaned = expr.trim();
  if (!cleaned) return '';
  try {
    const html = katex.renderToString(cleaned, {
      displayMode,
      output: mathOutput,
      throwOnError: false,
      strict: false,
      trust: false
    });
    return displayMode ? `<div class="math-display">${html}</div>` : `<span class="math-inline">${html}</span>`;
  } catch {
    return displayMode
      ? `<pre class="math-fallback"><code>${escHtml(cleaned)}</code></pre>`
      : `<code>${escHtml(cleaned)}</code>`;
  }
}

export { safeExternalUrl };

function safeHref(url: string): string | null {
  return safeExternalUrl(url) || null;
}

/**
 * Renders inline Markdown + LaTeX math ($...$, $$...$$, \(...\), \[...\]) safely to HTML.
 * Tokenizes code spans and math spans FIRST so characters like `_`, `*`, `\` inside formulas
 * or code are never corrupted by Markdown emphasis rules.
 */
export function renderInlineMarkdownHtml(raw: string, mathOutput: MathOutputMode = 'htmlAndMathml'): string {
  if (!raw) return '';
  const tokens: string[] = [];
  const stash = (html: string) => {
    const idx = tokens.length;
    tokens.push(html);
    return `\u0000TOK${idx}\u0000`;
  };

  // NUL marks our own placeholders below; input must not be able to forge one.
  let s = raw.replace(/\u0000/g, '');

  // 1. Inline code spans (`...`)
  s = s.replace(/`([^`\n]+)`/g, (_m, code: string) => stash(`<code>${escHtml(code)}</code>`));

  // 2. Inline display math ($$...$$ or \[...\]) occurring inside a line
  s = s.replace(/\$\$([^$\n]+?)\$\$/g, (_m, expr: string) => stash(renderKatex(expr, true, mathOutput)));
  s = s.replace(/\\\[([^\]\n]+?)\\\]/g, (_m, expr: string) => stash(renderKatex(expr, true, mathOutput)));

  // 3. Inline math \(...\)
  s = s.replace(/\\\((.+?)\\\)/g, (_m, expr: string) => stash(renderKatex(expr, false, mathOutput)));

  // 4. Inline math $...$ (avoid matching bare prices like "$100" or "$5 und $10")
  s = s.replace(/(?<!\\)\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/g, (full, expr: string) => {
    const t = expr.trim();
    // Skip pure currency / number amounts without math operators/commands
    if (/^\d+(?:[.,]\d+)?(?:\s*(?:€|EUR|USD|Euro|Dollar))?$/i.test(t)) return full;
    return stash(renderKatex(t, false, mathOutput));
  });

  // 5. Markdown links [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (full, label: string, url: string) => {
    const href = safeHref(url);
    if (!href) return full;
    const inner = renderInlineMarkdownHtml(label, mathOutput);
    return stash(`<a href="${escHtml(href)}" target="_blank" rel="noreferrer">${inner}</a>`);
  });

  // 6. Escape all remaining raw HTML characters (XSS protection)
  s = escHtml(s);

  // 7. Auto-link bare https:// URLs
  s = s.replace(/(^|[\s(])((?:https?:\/\/)[^\s<)\u0000]+)/g, (_m, lead: string, rawUrl: string) => {
    let url = rawUrl;
    let trail = '';
    while (/[.,;:!?]$/.test(url)) {
      trail = url.slice(-1) + trail;
      url = url.slice(0, -1);
    }
    return `${lead}<a href="${url}" target="_blank" rel="noreferrer">${url}</a>${trail}`;
  });

  // 8. Emphasis, strong, strikethrough
  s = s.replace(/\*\*\*([^*\n]+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([^_\n]+?)__/g, '<strong>$1</strong>');
  s = s.replace(/~~([^~\n]+?)~~/g, '<del>$1</del>');
  s = s.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<em>$1</em>');
  s = s.replace(/(^|[\s([{"„])_([^_\n]+?)_(?=$|[\s.,;:!?)\]}"“])/g, '$1<em>$2</em>');

  // 9. Restore stashed tokens
  return s.replace(/\u0000TOK(\d+)\u0000/g, (_m, i: string) => tokens[Number(i)] ?? '');
}

function splitTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|') && !trimmed.endsWith('\\|')) trimmed = trimmed.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === '\\' && trimmed[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (trimmed[i] === '|') {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += trimmed[i];
    }
  }
  cells.push(cur.trim());
  return cells;
}

function parseTableAlignments(sepLine: string): Array<'left' | 'center' | 'right' | null> | null {
  const trimmed = sepLine.trim();
  if (!trimmed.includes('-')) return null;
  if (!/^\|?[\s:|-]+\|?$/.test(trimmed)) return null;
  const cells = splitTableRow(trimmed);
  if (!cells.length) return null;
  const aligns: Array<'left' | 'center' | 'right' | null> = [];
  for (const c of cells) {
    if (!/^:?-{1,}:?$/.test(c)) return null;
    if (c.startsWith(':') && c.endsWith(':')) aligns.push('center');
    else if (c.endsWith(':')) aligns.push('right');
    else if (c.startsWith(':')) aligns.push('left');
    else aligns.push(null);
  }
  return aligns;
}

/**
 * Full GFM Markdown + KaTeX LaTeX Math renderer to clean, XSS-safe HTML.
 * Shared across React UI (htmlAndMathml) and PDF / HTML / Word print exports (mathml).
 */
export function markdownToHtml(md: string, opts: MarkdownHtmlOptions = {}): string {
  const mathOutput: MathOutputMode = opts.mathOutput ?? 'htmlAndMathml';
  const rawLines = (md || '').replace(/\r\n/g, '\n').split('\n');
  const htmlParts: string[] = [];

  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      htmlParts.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      htmlParts.push('</ol>');
      inOl = false;
    }
  };

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i];
    const line = rawLine.trim();

    if (!line) {
      closeLists();
      continue;
    }

    // 1. Fenced code blocks (``` ... ```)
    if (line.startsWith('```')) {
      closeLists();
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < rawLines.length && !rawLines[i].trim().startsWith('```')) {
        codeLines.push(rawLines[i]);
        i++;
      }
      const cls = lang ? ` class="lang-${escHtml(lang)}"` : '';
      htmlParts.push(`<pre><code${cls}>${escHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    // 2. Display math blocks ($$ ... $$ or \[ ... \])
    if (line.startsWith('$$')) {
      closeLists();
      if (line.length > 4 && line.endsWith('$$')) {
        htmlParts.push(renderKatex(line.slice(2, -2), true, mathOutput));
      } else {
        const mathLines: string[] = [];
        const rest = line.slice(2).trim();
        if (rest) mathLines.push(rest);
        i++;
        while (i < rawLines.length) {
          const cur = rawLines[i].trim();
          if (cur.endsWith('$$')) {
            const before = cur.slice(0, -2).trim();
            if (before) mathLines.push(before);
            break;
          }
          mathLines.push(rawLines[i]);
          i++;
        }
        htmlParts.push(renderKatex(mathLines.join('\n'), true, mathOutput));
      }
      continue;
    }

    if (line.startsWith('\\[')) {
      closeLists();
      if (line.length > 4 && line.endsWith('\\]')) {
        htmlParts.push(renderKatex(line.slice(2, -2), true, mathOutput));
      } else {
        const mathLines: string[] = [];
        const rest = line.slice(2).trim();
        if (rest) mathLines.push(rest);
        i++;
        while (i < rawLines.length) {
          const cur = rawLines[i].trim();
          if (cur.endsWith('\\]')) {
            const before = cur.slice(0, -2).trim();
            if (before) mathLines.push(before);
            break;
          }
          mathLines.push(rawLines[i]);
          i++;
        }
        htmlParts.push(renderKatex(mathLines.join('\n'), true, mathOutput));
      }
      continue;
    }

    // 3. Horizontal rule (---, ***, ___)
    if (/^(?:[-*_]\s*){3,}$/.test(line)) {
      closeLists();
      htmlParts.push('<hr />');
      continue;
    }

    // 4. GFM Tables (header line + |---| separator line)
    if (line.includes('|') && i + 1 < rawLines.length) {
      const aligns = parseTableAlignments(rawLines[i + 1]);
      if (aligns) {
        closeLists();
        const headers = splitTableRow(rawLine);
        i += 2;
        const bodyRows: string[][] = [];
        while (i < rawLines.length && rawLines[i].trim().includes('|') && rawLines[i].trim() !== '') {
          // Stop if a new heading/hr starts
          if (/^(?:#{1,6}\s|[-*_]{3,}$)/.test(rawLines[i].trim())) break;
          bodyRows.push(splitTableRow(rawLines[i]));
          i++;
        }
        i--;
        const thHtml = headers
          .map((h, ci) => {
            const al = aligns[ci] ? ` style="text-align:${aligns[ci]}"` : '';
            return `<th${al}>${renderInlineMarkdownHtml(h, mathOutput)}</th>`;
          })
          .join('');
        const bodyHtml = bodyRows
          .map(
            (r) =>
              `<tr>${headers
                .map((_, ci) => {
                  const al = aligns[ci] ? ` style="text-align:${aligns[ci]}"` : '';
                  return `<td${al}>${renderInlineMarkdownHtml(r[ci] ?? '', mathOutput)}</td>`;
                })
                .join('')}</tr>`
          )
          .join('');
        htmlParts.push(
          `<div class="md-table-wrap"><table><thead><tr>${thHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`
        );
        continue;
      }
    }

    // 5. Headings (# .. #####)
    const headingMatch = line.match(/^(#{1,5})\s+(.*)$/);
    if (headingMatch) {
      closeLists();
      const level = headingMatch[1].length;
      htmlParts.push(`<h${level}>${renderInlineMarkdownHtml(headingMatch[2], mathOutput)}</h${level}>`);
      continue;
    }

    // 6. Blockquotes (> ...)
    if (line.startsWith('>')) {
      closeLists();
      const quoteLines: string[] = [];
      while (i < rawLines.length && rawLines[i].trim().startsWith('>')) {
        quoteLines.push(rawLines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      i--;
      const innerHtml = markdownToHtml(quoteLines.join('\n'), opts);
      htmlParts.push(`<blockquote>${innerHtml}</blockquote>`);
      continue;
    }

    // 7. Unordered & task lists (- / * / +)
    if (/^[-*+]\s+/.test(line)) {
      if (inOl) {
        htmlParts.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        htmlParts.push('<ul>');
        inUl = true;
      }
      const itemBody = line.replace(/^[-*+]\s+/, '');
      const taskMatch = itemBody.match(/^\[([ xX])\]\s+(.*)$/);
      if (taskMatch) {
        const checked = taskMatch[1].toLowerCase() === 'x';
        htmlParts.push(
          `<li class="md-task-item"><span class="md-checkbox">${checked ? '☑' : '☐'}</span> ${renderInlineMarkdownHtml(taskMatch[2], mathOutput)}</li>`
        );
      } else {
        htmlParts.push(`<li>${renderInlineMarkdownHtml(itemBody, mathOutput)}</li>`);
      }
      continue;
    }

    // 8. Ordered lists (1. / 2.)
    if (/^\d+[.)]\s+/.test(line)) {
      if (inUl) {
        htmlParts.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        htmlParts.push('<ol>');
        inOl = true;
      }
      htmlParts.push(`<li>${renderInlineMarkdownHtml(line.replace(/^\d+[.)]\s+/, ''), mathOutput)}</li>`);
      continue;
    }

    // 9. Regular paragraph (merge consecutive plain lines into one paragraph)
    closeLists();
    const paraLines: string[] = [line];
    while (i + 1 < rawLines.length) {
      const next = rawLines[i + 1].trim();
      if (
        !next ||
        next.startsWith('#') ||
        next.startsWith('>') ||
        next.startsWith('```') ||
        next.startsWith('$$') ||
        next.startsWith('\\[') ||
        /^[-*+]\s+/.test(next) ||
        /^\d+[.)]\s+/.test(next) ||
        /^(?:[-*_]\s*){3,}$/.test(next) ||
        (next.includes('|') && i + 2 < rawLines.length && parseTableAlignments(rawLines[i + 2]))
      ) {
        break;
      }
      paraLines.push(next);
      i++;
    }
    htmlParts.push(`<p>${paraLines.map((pl) => renderInlineMarkdownHtml(pl, mathOutput)).join('<br />')}</p>`);
  }

  closeLists();
  return htmlParts.join('\n');
}
