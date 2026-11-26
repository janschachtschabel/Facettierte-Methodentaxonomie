import type { FastifyInstance } from 'fastify';
import { createTransport } from 'nodemailer';
import { DEFAULT_CONTACT_TO, type ServerConfig } from '../config.js';

export interface ContactMail {
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  text: string;
}
export type ContactSender = (mail: ContactMail) => Promise<void>;

/** Limits of the form fields; longer input is refused, not cut. */
export const CONTACT_LIMITS = { name: 120, email: 254, betreff: 150, nachricht: 5000 } as const;
/** A person needs a few seconds to fill in the form; faster submissions come from bots. */
export const CONTACT_MIN_FILL_MS = 3000;
/** A form older than this was left open too long; the page has to be loaded again. */
const CONTACT_MAX_FILL_MS = 24 * 60 * 60 * 1000;

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;
/** Header fields must not carry line breaks (header injection) or control characters. */
const oneLine = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();

export interface ContactInput {
  name?: unknown;
  email?: unknown;
  betreff?: unknown;
  nachricht?: unknown;
  einverstanden?: unknown;
  /** Honeypot: hidden field, people leave it empty. */
  website?: unknown;
  /** Time the form was shown (ms since epoch), set by the web app. */
  geoeffnetUm?: unknown;
}

export type ContactCheck =
  | { ok: true; name: string; email: string; betreff: string; nachricht: string }
  | { ok: false; fehler: string; spam?: boolean };

export function checkContactInput(body: ContactInput | null | undefined, now = Date.now()): ContactCheck {
  const b = body || {};
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  if (str(b.website).trim()) return { ok: false, fehler: 'spam', spam: true };
  const opened = typeof b.geoeffnetUm === 'number' ? b.geoeffnetUm : NaN;
  if (!Number.isFinite(opened) || now - opened < CONTACT_MIN_FILL_MS) return { ok: false, fehler: 'spam', spam: true };
  if (now - opened > CONTACT_MAX_FILL_MS) {
    return { ok: false, fehler: 'Das Formular war zu lange geöffnet. Bitte lade die Seite neu und sende die Nachricht noch einmal.' };
  }
  const name = oneLine(str(b.name));
  const email = oneLine(str(b.email));
  const betreff = oneLine(str(b.betreff));
  const nachricht = str(b.nachricht).replace(/\r\n?/g, '\n').trim();
  if (!name) return { ok: false, fehler: 'Bitte gib deinen Namen an.' };
  if (!EMAIL_RE.test(email)) return { ok: false, fehler: 'Bitte gib eine gültige E-Mail-Adresse an, damit eine Antwort möglich ist.' };
  if (nachricht.length < 10) return { ok: false, fehler: 'Bitte schreibe eine Nachricht (mindestens 10 Zeichen).' };
  for (const [feld, wert] of [['name', name], ['email', email], ['betreff', betreff], ['nachricht', nachricht]] as const) {
    if (wert.length > CONTACT_LIMITS[feld]) {
      return { ok: false, fehler: `Das Feld „${feld}“ ist zu lang (höchstens ${CONTACT_LIMITS[feld]} Zeichen).` };
    }
  }
  if (b.einverstanden !== true) {
    return { ok: false, fehler: 'Bitte bestätige, dass deine Angaben zur Beantwortung der Anfrage verarbeitet werden dürfen.' };
  }
  return { ok: true, name, email, betreff, nachricht };
}

export function smtpSender(config: ServerConfig): ContactSender | null {
  if (!config.smtpHost || !config.contactFrom) return null;
  const transport = createTransport({
    host: config.smtpHost,
    port: config.smtpPort || 587,
    secure: Boolean(config.smtpSecure),
    // A relay on the same machine may speak plain SMTP; every other server has to offer STARTTLS.
    requireTLS: !config.smtpSecure && !/^(localhost|127\.0\.0\.1|::1)$/i.test(config.smtpHost),
    ...(config.smtpUser ? { auth: { user: config.smtpUser, pass: config.smtpPass || '' } } : {}),
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000
  });
  return async (mail) => {
    await transport.sendMail(mail);
  };
}

export function registerContactRoutes(app: FastifyInstance, config: ServerConfig, sender: ContactSender | null = smtpSender(config)) {
  const to = config.contactTo || DEFAULT_CONTACT_TO;
  const perHour = config.contactRateLimitPerHour || 5;

  // The address is handed out on request only, so it never stands in the page source or the script bundle.
  app.get('/api/v1/kontakt/adresse', { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, async (_req, reply) => {
    reply.header('Cache-Control', 'no-store').header('X-Robots-Tag', 'noindex, nofollow');
    const [local, domain] = to.split('@');
    return { teile: [local, domain], formularAktiv: Boolean(sender) };
  });

  app.post('/api/v1/kontakt', { config: { rateLimit: { max: perHour, timeWindow: '1 hour' } } }, async (req, reply) => {
    const check = checkContactInput(req.body as ContactInput);
    if (!check.ok) {
      // Bots get the same answer as people, so they cannot tell they were caught.
      if (check.spam) return reply.send({ gesendet: true });
      return reply.code(400).send({ fehler: check.fehler });
    }
    if (!sender) {
      return reply.code(503).send({ fehler: 'Das Kontaktformular ist auf diesem Server nicht eingerichtet. Bitte schreibe direkt per E-Mail (Adresse im Impressum).' });
    }
    try {
      await sender({
        to,
        from: `FMT-Kontaktformular <${config.contactFrom}>`,
        replyTo: `${check.name.replace(/["<>]/g, '')} <${check.email}>`,
        subject: `[FMT-Kontakt] ${check.betreff || 'Nachricht über das Kontaktformular'}`,
        text: `Name: ${check.name}\nE-Mail: ${check.email}\n\n${check.nachricht}\n\n— gesendet über das Kontaktformular der FMT-Methodendatenbank`
      });
      return reply.send({ gesendet: true });
    } catch (e) {
      req.log.error({ err: e }, 'Kontaktformular: Versand fehlgeschlagen');
      return reply.code(502).send({ fehler: 'Die Nachricht konnte gerade nicht versendet werden. Bitte versuche es später noch einmal oder schreibe direkt per E-Mail.' });
    }
  });
}
