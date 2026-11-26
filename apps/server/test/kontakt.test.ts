import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig, type ServerConfig } from '../src/config.js';
import { checkContactInput, type ContactMail } from '../src/routes/contact.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIST_DATA = path.join(ROOT, 'dist-data');
const config = (over: Partial<ServerConfig> = {}): ServerConfig => ({
  ...loadConfig({ CONTACT_FROM: 'noreply@example.org' }),
  host: '127.0.0.1',
  llmApiKey: '',
  apiRateLimitPerMin: 100000,
  ...over
});
const valid = (over: Record<string, unknown> = {}) => ({
  name: 'Erika Muster',
  email: 'erika@example.org',
  betreff: 'Frage zur Methode',
  nachricht: 'Hallo, ich habe eine Frage zum Gruppenpuzzle.',
  einverstanden: true,
  website: '',
  geoeffnetUm: Date.now() - 10000,
  ...over
});

describe('Kontaktformular: Prüfung der Eingaben', () => {
  it('nimmt eine vollständige Nachricht an', () => {
    expect(checkContactInput(valid()).ok).toBe(true);
  });
  it('erkennt Honeypot und zu schnelles Absenden als Spam', () => {
    expect(checkContactInput(valid({ website: 'http://spam' }))).toMatchObject({ ok: false, spam: true });
    expect(checkContactInput(valid({ geoeffnetUm: Date.now() - 500 }))).toMatchObject({ ok: false, spam: true });
    expect(checkContactInput(valid({ geoeffnetUm: undefined }))).toMatchObject({ ok: false, spam: true });
  });
  it('verlangt Name, gültige E-Mail, Nachricht und Einwilligung', () => {
    expect(checkContactInput(valid({ name: ' ' })).ok).toBe(false);
    expect(checkContactInput(valid({ email: 'keine-mail' })).ok).toBe(false);
    expect(checkContactInput(valid({ nachricht: 'kurz' })).ok).toBe(false);
    expect(checkContactInput(valid({ einverstanden: false })).ok).toBe(false);
    expect(checkContactInput(valid({ nachricht: 'x'.repeat(5001) })).ok).toBe(false);
  });
  it('entfernt Zeilenumbrüche aus Kopfzeilen-Feldern', () => {
    const r = checkContactInput(valid({ betreff: 'Hallo\r\nBcc: opfer@example.org', name: 'A\nB' }));
    expect(r.ok && r.betreff).toBe('Hallo Bcc: opfer@example.org');
    expect(r.ok && r.name).toBe('A B');
  });
});

describe('Kontaktformular: Endpunkte', () => {
  let app: FastifyInstance;
  const sent: ContactMail[] = [];
  beforeAll(async () => {
    app = await buildApp({
      distDataDir: DIST_DATA,
      config: config({ contactRateLimitPerHour: 3 }),
      contactSender: async (m) => {
        sent.push(m);
      }
    });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('stellt an die Impressums-Adresse zu, mit Antwortadresse der Absenderin', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/kontakt', payload: valid() });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ gesendet: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(['info', 'schachtschabel.net'].join('@'));
    expect(sent[0].replyTo).toContain('erika@example.org');
    expect(sent[0].subject).toContain('Frage zur Methode');
  });

  it('antwortet Bots wie Menschen, verschickt aber nichts', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/kontakt', payload: valid({ website: 'x' }) });
    expect(res.json()).toEqual({ gesendet: true });
    expect(sent).toHaveLength(1);
  });

  it('meldet Eingabefehler mit 400 und begrenzt die Anfragen je Stunde', async () => {
    const bad = await app.inject({ method: 'POST', url: '/api/v1/kontakt', payload: valid({ email: 'x' }) });
    expect(bad.statusCode).toBe(400);
    const limited = await app.inject({ method: 'POST', url: '/api/v1/kontakt', payload: valid() });
    expect(limited.statusCode).toBe(429);
  });

  it('gibt die Adresse nur zerlegt auf Anfrage heraus', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/kontakt/adresse' });
    expect(res.json()).toEqual({ teile: ['info', 'schachtschabel.net'], formularAktiv: true });
    expect(res.headers['x-robots-tag']).toContain('noindex');
  });

  it('meldet 503, wenn kein SMTP eingerichtet ist', async () => {
    const plain = await buildApp({ distDataDir: DIST_DATA, config: config({ smtpHost: undefined }) });
    await plain.ready();
    const res = await plain.inject({ method: 'POST', url: '/api/v1/kontakt', payload: valid() });
    expect(res.statusCode).toBe(503);
    expect((await plain.inject({ method: 'GET', url: '/api/v1/kontakt/adresse' })).json().formularAktiv).toBe(false);
    await plain.close();
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
