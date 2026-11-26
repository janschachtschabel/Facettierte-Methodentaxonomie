import { useEffect, useState } from 'react';

type Address = { teile: [string, string] };

/**
 * Address of the legal notice. It is not part of the page source or the script bundle: it is fetched in parts
 * from the server when the page opens, so simple address harvesters do not find it.
 * undefined = loading, null = server not reachable.
 */
export function useContactAddress() {
  const [address, setAddress] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    fetch('/api/v1/kontakt/adresse')
      .then((res) => (res.ok ? (res.json() as Promise<Address>) : Promise.reject(new Error())))
      .then((data) => {
        if (!alive) return;
        setAddress(data.teile.join('@'));
      })
      .catch(() => alive && setAddress(null));
    return () => {
      alive = false;
    };
  }, []);
  return { address };
}

/** Shows the address as plain text (no mailto link); a spelled-out form when the server cannot be reached. */
export function EmailAddress({ address }: { address: string | null | undefined }) {
  if (address === undefined) return <span className="muted">wird geladen …</span>;
  if (address === null) {
    return <span>info (at) {['schachtschabel', 'net'].join(' (Punkt) ')}</span>;
  }
  const [local, domain] = address.split('@');
  return (
    <span>
      {local}
      <span>@</span>
      {domain}
    </span>
  );
}

export function usePageTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · FMT Methodendatenbank`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
