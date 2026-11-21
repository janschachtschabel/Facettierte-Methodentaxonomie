import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..');
const BAUSTEINE_DIR = path.join(ROOT, 'data', 'bausteine');
const UA = 'FMT-Methodendatenbank-LinkCheck/1.1 (https://github.com/janschachtschabel/Facettierte-Methodentaxonomie)';

interface SourceEntry {
  titel?: string;
  url?: string;
}

async function main() {
  const files = fs.readdirSync(BAUSTEINE_DIR).filter((f) => f.endsWith('.json')).sort();
  const urlMap = new Map<string, string[]>();

  for (const f of files) {
    const b = JSON.parse(fs.readFileSync(path.join(BAUSTEINE_DIR, f), 'utf8')) as {
      kennung: string;
      quellen?: SourceEntry[];
    };
    for (const q of b.quellen || []) {
      if (!q.url) continue;
      if (!urlMap.has(q.url)) urlMap.set(q.url, []);
      urlMap.get(q.url)!.push(b.kennung);
    }
  }

  const entries = [...urlMap.entries()];
  const broken: Array<{ status: string | number; url: string; blocks: string[] }> = [];
  let ok = 0;

  async function checkOne([url, blocks]: [string, string[]]) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': UA } });
      if (res.status === 405 || res.status === 403 || res.status === 429) {
        res = await fetch(url, { method: 'GET', redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': UA } });
      }
      if (res.status >= 400) {
        broken.push({ status: res.status, url, blocks });
      } else {
        ok++;
      }
    } catch (e) {
      broken.push({ status: `ERR:${e instanceof Error ? e.name : 'unknown'}`, url, blocks });
    } finally {
      clearTimeout(timer);
    }
  }

  const CONCURRENCY = 8;
  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    await Promise.all(entries.slice(i, i + CONCURRENCY).map(checkOne));
  }

  console.log(`Checked ${entries.length} unique URLs across ${files.length} methods: ${ok} OK, ${broken.length} broken.`);
  for (const b of broken) {
    console.error(`BROKEN [${b.status}] (${b.blocks.join(', ')}): ${b.url}`);
  }
  if (broken.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
