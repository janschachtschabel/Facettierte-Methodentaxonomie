import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { isWloPreviewUrl } from '../src/routes/oer.js';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { buildApp, requestLogFields } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIST_DATA = path.join(ROOT, 'dist-data');

describe('Kontakt und Datensparsamkeit', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ distDataDir: DIST_DATA, config: { ...loadConfig({}), llmApiKey: '', apiRateLimitPerMin: 100000 } });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('gibt die Impressums-Adresse nur zerlegt auf Anfrage heraus', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/kontakt/adresse' });
    expect(res.json()).toEqual({ teile: ['info', 'schachtschabel.net'] });
    expect(res.headers['x-robots-tag']).toContain('noindex');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('der Server verschickt keine E-Mails', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/kontakt', payload: { nachricht: 'Hallo' } });
    expect(res.statusCode).toBe(404);
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps', 'server', 'package.json'), 'utf8'));
    expect(Object.keys(pkg.dependencies || {})).not.toContain('nodemailer');
  });

  it('protokolliert Anfragen ohne IP-Adresse und ohne Suchtext', () => {
    expect(requestLogFields({ method: 'GET', url: '/api/v1/methods?text=Klasse+7a', ip: '203.0.113.5' } as never)).toEqual({
      method: 'GET',
      url: '/api/v1/methods'
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('Vorschaubilder kommen nur von WLO und nur über den eigenen Server', async () => {
    const ok = 'https://redaktion.openeduhub.net/edu-sharing/preview?nodeId=abc';
    expect(isWloPreviewUrl(ok)).toBe(true);
    expect(isWloPreviewUrl('https://evil.example/edu-sharing/preview')).toBe(false);
    expect(isWloPreviewUrl('https://redaktion.openeduhub.net.evil.example/edu-sharing/x')).toBe(false);
    expect(isWloPreviewUrl('http://redaktion.openeduhub.net/edu-sharing/x')).toBe(false);
    expect(isWloPreviewUrl('https://user:pw@redaktion.openeduhub.net/edu-sharing/x')).toBe(false);

    const bad = await app.inject({ method: 'GET', url: '/api/v1/oer/vorschau?u=' + encodeURIComponent('http://169.254.169.254/') });
    expect(bad.statusCode).toBe(400);

    const fetchMock = vi.fn(async () => new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } }));
    vi.stubGlobal('fetch', fetchMock);
    const img = await app.inject({ method: 'GET', url: '/api/v1/oer/vorschau?u=' + encodeURIComponent(ok) });
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(fetchMock).toHaveBeenCalledWith(ok, expect.objectContaining({ redirect: 'error' }));

    // A second view comes from the cache and does not reach WLO again.
    const again = await app.inject({ method: 'GET', url: '/api/v1/oer/vorschau?u=' + encodeURIComponent(ok) });
    expect(again.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const other = (n: number) => ok + '&n=' + n;
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { headers: { 'content-type': 'text/html' } })));
    expect((await app.inject({ method: 'GET', url: '/api/v1/oer/vorschau?u=' + encodeURIComponent(other(1)) })).statusCode).toBe(404);

    // Oversized images are refused, whether announced by content-length or only noticed while streaming.
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(big, { headers: { 'content-type': 'image/png', 'content-length': String(big.length) } })));
    expect((await app.inject({ method: 'GET', url: '/api/v1/oer/vorschau?u=' + encodeURIComponent(other(2)) })).statusCode).toBe(404);
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < 3; i++) c.enqueue(new Uint8Array(1024 * 1024));
        c.close();
      }
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(stream, { headers: { 'content-type': 'image/png' } })));
    expect((await app.inject({ method: 'GET', url: '/api/v1/oer/vorschau?u=' + encodeURIComponent(other(3)) })).statusCode).toBe(404);
  });

  it('die Adresse steht nicht im Quelltext der Web-App', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, f.name);
        if (f.isDirectory()) walk(p);
        else if (/\.(tsx?|html|css)$/.test(f.name)) files.push(p);
      }
    };
    walk(path.join(ROOT, 'apps', 'web', 'src'));
    files.push(path.join(ROOT, 'apps', 'web', 'index.html'));
    for (const f of files) expect(fs.readFileSync(f, 'utf8')).not.toContain('schachtschabel.net');
  });
});
