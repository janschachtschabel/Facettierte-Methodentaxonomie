import { Link } from 'react-router-dom';
import type { Baustein } from '@fmt/core';

interface Props {
  baustein: Baustein;
  allBlocks: Baustein[];
  labelOf: (scheme: string, code: string) => string;
}

export function InterfaceFlow({ baustein, allBlocks, labelOf }: Props) {
  const pre = baustein.vorbedingung || [];
  const post = baustein.nachbedingung || [];

  const fitsBefore = pre.length
    ? allBlocks
        .filter((other) => other.kennung !== baustein.kennung && pre.some((z) => (other.nachbedingung || []).includes(z)))
        .slice(0, 5)
    : [];

  const fitsAfter = post.length
    ? allBlocks
        .filter((other) => other.kennung !== baustein.kennung && (other.vorbedingung || []).some((z) => post.includes(z)))
        .slice(0, 5)
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1.2fr) auto minmax(0,1fr)',
          gap: 10,
          alignItems: 'center'
        }}
      >
        <div className="card" style={{ padding: 12 }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 6 }}>
            VORBEDINGUNGEN
          </div>
          {pre.length ? (
            <ul className="chips">
              {pre.map((z) => (
                <li key={z} className="chip chip-b">
                  {labelOf('lernzustand', z)}
                </li>
              ))}
            </ul>
          ) : (
            <span className="muted" style={{ fontSize: 14 }}>
              Keine vorausgesetzt (sofort einsetzbar)
            </span>
          )}
        </div>

        <span aria-hidden="true" style={{ fontFamily: 'var(--display)', fontSize: 22, color: 'var(--ink-2)' }}>
          →
        </span>

        <div className="card" style={{ padding: 12, borderColor: 'var(--dA)', borderWidth: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontFamily: 'var(--display)', fontWeight: 700 }}>{baustein.name}</span>
            <span className="range-badge">{baustein.reichweite.toUpperCase()}</span>
          </div>
          <div className="muted" style={{ fontSize: 13.5 }}>
            {baustein.dauerMin}–{baustein.dauerMax} min · {baustein.komposit ? 'Kompositbaustein' : 'Muster'}
          </div>
          {baustein.slot && baustein.slot.length > 0 && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--rule)' }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 4 }}>
                SLOTS ({baustein.slot.length}):
              </div>
              <ul className="chips">
                {baustein.slot.map((s) => (
                  <li key={s.kennung} className="chip">
                    {s.name} ({s.reichweite.toUpperCase()}
                    {s.pflicht ? ', Pflicht' : ''})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <span aria-hidden="true" style={{ fontFamily: 'var(--display)', fontSize: 22, color: 'var(--ink-2)' }}>
          →
        </span>

        <div className="card" style={{ padding: 12 }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 6 }}>
            NACHBEDINGUNGEN
          </div>
          {post.length ? (
            <ul className="chips">
              {post.map((z) => (
                <li key={z} className="chip chip-c">
                  {labelOf('lernzustand', z)}
                </li>
              ))}
            </ul>
          ) : (
            <span className="muted" style={{ fontSize: 14 }}>
              Kein verlässlicher Lernzustand (z. B. Komposit / Kontrast)
            </span>
          )}
        </div>
      </div>

      {(fitsBefore.length > 0 || fitsAfter.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          {fitsBefore.length > 0 && (
            <div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 13.5, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 6 }}>
                Passt gut davor (liefert Vorbedingung):
              </div>
              <ul className="chips">
                {fitsBefore.map((b) => (
                  <li key={b.kennung}>
                    <Link className="btn btn-sm" to={`/methoden/${b.kennung}`}>
                      {b.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {fitsAfter.length > 0 && (
            <div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 13.5, fontWeight: 700, color: 'var(--ink-2)', marginBottom: 6 }}>
                Passt gut danach (baut auf Nachbedingung auf):
              </div>
              <ul className="chips">
                {fitsAfter.map((b) => (
                  <li key={b.kennung}>
                    <Link className="btn btn-sm" to={`/methoden/${b.kennung}`}>
                      {b.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
