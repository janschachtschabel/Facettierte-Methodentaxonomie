import { useEffect, useRef, useState, type FormEvent } from 'react';

const LIMITS = { name: 120, email: 254, betreff: 150, nachricht: 5000 };

type Address = { teile: [string, string]; formularAktiv: boolean };

/**
 * The e-mail address is not part of the page source or the script bundle: the page fetches it in parts from
 * the server when it opens and shows it as plain text (no mailto link), so simple address harvesters do not
 * find it. If the server cannot be reached, a spelled-out form keeps the address available for people.
 */
function EmailAddress({ address }: { address: string | null | undefined }) {
  if (address === undefined) return <span className="muted">wird geladen …</span>;
  if (address === null) {
    return (
      <span>
        info (at) {['schachtschabel', 'net'].join(' (Punkt) ')}
      </span>
    );
  }
  const [local, domain] = address.split('\u0040');
  return (
    <span>
      {local}
      <span>@</span>
      {domain}
    </span>
  );
}

function ContactForm({ formActive }: { formActive: boolean | null }) {
  const openedAt = useRef(Date.now());
  const [values, setValues] = useState({ name: '', email: '', betreff: '', nachricht: '', website: '' });
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setState('sending');
    try {
      const res = await fetch('/api/v1/kontakt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, einverstanden: consent, geoeffnetUm: openedAt.current })
      });
      const data = (await res.json().catch(() => ({}))) as { gesendet?: boolean; fehler?: string };
      if (!res.ok || !data.gesendet) throw new Error(data.fehler || 'Die Nachricht konnte nicht gesendet werden.');
      setState('sent');
    } catch (err) {
      setState('idle');
      setError(err instanceof Error ? err.message : 'Die Nachricht konnte nicht gesendet werden.');
    }
  };

  if (state === 'sent') {
    return (
      <div className="msg msg-ok" role="status" style={{ marginTop: 12 }}>
        Danke für deine Nachricht! Sie ist angekommen, eine Antwort kommt an die angegebene E-Mail-Adresse.
      </div>
    );
  }

  return (
    <form className="contact-form" onSubmit={submit} noValidate={false}>
      {formActive === false && (
        <div className="msg msg-err" role="status">
          Das Formular ist auf diesem Server noch nicht eingerichtet. Bitte schreibe solange per E-Mail.
        </div>
      )}
      <label>
        Name
        <input type="text" required maxLength={LIMITS.name} autoComplete="name" value={values.name} onChange={set('name')} />
      </label>
      <label>
        E-Mail-Adresse für die Antwort
        <input type="email" required maxLength={LIMITS.email} autoComplete="email" value={values.email} onChange={set('email')} />
      </label>
      <label>
        Betreff (optional)
        <input type="text" maxLength={LIMITS.betreff} value={values.betreff} onChange={set('betreff')} />
      </label>
      <label>
        Nachricht
        <textarea required minLength={10} maxLength={LIMITS.nachricht} rows={7} value={values.nachricht} onChange={set('nachricht')} />
      </label>
      <div className="hp" aria-hidden="true">
        <label>
          Website
          <input type="text" tabIndex={-1} autoComplete="off" value={values.website} onChange={set('website')} />
        </label>
      </div>
      <label className="consent">
        <input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          Ich bin einverstanden, dass meine Angaben zur Beantwortung meiner Anfrage verarbeitet werden. Mehr dazu im
          Hinweis unten.
        </span>
      </label>
      {error && (
        <div className="msg msg-err" role="alert">
          {error}
        </div>
      )}
      <div>
        <button type="submit" className="btn btn-primary" disabled={state === 'sending' || !consent}>
          {state === 'sending' ? 'Wird gesendet …' : 'Nachricht senden'}
        </button>
      </div>
    </form>
  );
}

export function ImpressumPage() {
  const [formActive, setFormActive] = useState<boolean | null>(null);
  const [address, setAddress] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    fetch('/api/v1/kontakt/adresse')
      .then((res) => (res.ok ? (res.json() as Promise<Address>) : Promise.reject(new Error())))
      .then((data) => {
        if (!alive) return;
        setAddress(data.teile.join('\u0040'));
        setFormActive(data.formularAktiv);
      })
      .catch(() => alive && setAddress(null));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    const previous = document.title;
    document.title = 'Impressum & Kontakt · FMT Methodendatenbank';
    return () => {
      document.title = previous;
    };
  }, []);

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
      <ContactForm formActive={formActive} />

      <h3 style={{ marginTop: 28 }}>Hinweis zum Kontaktformular</h3>
      <p className="muted" style={{ fontSize: 14.5 }}>
        Name, E-Mail-Adresse, Betreff und Nachricht werden nur genutzt, um deine Anfrage zu beantworten (Art. 6 Abs. 1
        lit. b und f DSGVO). Der Server speichert sie nicht, sondern leitet sie einmalig per E-Mail an Jan Schachtschabel
        weiter. Zum Schutz vor Missbrauch wird die Zahl der Nachrichten je IP-Adresse kurzzeitig begrenzt. Du kannst
        jederzeit Auskunft über deine Daten und ihre Löschung verlangen.
      </p>
    </div>
  );
}
