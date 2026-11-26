import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { EmailAddress, useContactAddress, usePageTitle } from '../components/LegalShared.js';

/** Mail programs cut long mailto links; the message stays well below that. */
const LIMITS = { name: 120, betreff: 150, nachricht: 1500 };

/** Builds the mailto link; exported for tests. */
export function buildMailto(address: string, v: { name: string; betreff: string; nachricht: string }): string {
  const subject = `[FMT] ${v.betreff.trim() || 'Nachricht über die Methodendatenbank'}`;
  const body = `${v.nachricht.trim()}${v.name.trim() ? `\n\n${v.name.trim()}` : ''}`;
  return `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * The form does not send anything itself: it opens the visitor's own mail program with the message filled in,
 * and the visitor sends it from there. This website neither receives nor stores the text.
 */
function ContactForm({ address }: { address: string | null | undefined }) {
  const [values, setValues] = useState({ name: '', betreff: '', nachricht: '' });
  const [opened, setOpened] = useState(false);
  const set = (k: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [k]: e.target.value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!address) return;
    window.location.href = buildMailto(address, values);
    setOpened(true);
  };

  return (
    <form className="contact-form" onSubmit={submit}>
      <p className="muted" style={{ margin: 0, fontSize: 14.5 }}>
        Das Formular verschickt nichts selbst: Es öffnet dein E-Mail-Programm mit der vorbereiteten Nachricht, und du
        sendest sie von dort ab. Diese Website empfängt und speichert den Text nicht.
      </p>
      <label>
        Dein Name (optional)
        <input type="text" maxLength={LIMITS.name} autoComplete="name" value={values.name} onChange={set('name')} />
      </label>
      <label>
        Betreff (optional)
        <input type="text" maxLength={LIMITS.betreff} value={values.betreff} onChange={set('betreff')} />
      </label>
      <label>
        Nachricht
        <textarea required maxLength={LIMITS.nachricht} rows={7} value={values.nachricht} onChange={set('nachricht')} />
      </label>
      {address === null && (
        <div className="msg msg-err" role="status">
          Die Adresse konnte gerade nicht geladen werden. Bitte schreibe an die oben ausgeschriebene Adresse.
        </div>
      )}
      {opened && (
        <div className="msg msg-ok" role="status">
          Dein E-Mail-Programm sollte sich jetzt mit der Nachricht geöffnet haben. Falls nicht, schreibe bitte direkt an
          die Adresse oben.
        </div>
      )}
      <div>
        <button type="submit" className="btn btn-primary" disabled={!address || !values.nachricht.trim()}>
          Im E-Mail-Programm öffnen
        </button>
      </div>
    </form>
  );
}

export function ImpressumPage() {
  const { address } = useContactAddress();
  usePageTitle('Impressum & Kontakt');

  return (
    <div className="page-section impressum">
      <h1>Impressum</h1>

      <h2 style={{ marginTop: 16 }}>Angaben gemäß § 5 DDG</h2>
      <address>
        Jan Schachtschabel
        <br />
        Steubenstr. 34
        <br />
        99423 Weimar
        <br />
        Deutschland
      </address>

      <h2 style={{ marginTop: 24 }}>Kontakt</h2>
      <p>
        E-Mail: <EmailAddress address={address} />
        <br />
        oder über das Kontaktformular unten.
      </p>

      <h2 style={{ marginTop: 24 }}>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
      <address>Jan Schachtschabel, Anschrift wie oben</address>

      <h2 id="kontakt" style={{ marginTop: 32 }}>
        Kontaktformular
      </h2>
      <ContactForm address={address} />

      <p className="muted" style={{ fontSize: 14.5, marginTop: 20 }}>
        Wie mit deiner E-Mail umgegangen wird, steht in der <Link to="/datenschutz">Datenschutzerklärung</Link>. Für
        die Nutzung der Methodendatenbank gelten die <Link to="/nutzungsbedingungen">Nutzungsbedingungen</Link>.
      </p>
    </div>
  );
}
