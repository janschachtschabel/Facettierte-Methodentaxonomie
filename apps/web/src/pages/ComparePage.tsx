import { useCatalog } from '../data/CatalogContext.js';
import { ProfileRadarSvg } from '../components/ProfileRadarSvg.js';
import { ControlBars } from '../components/ControlBars.js';
import { EvidenceBadge } from '../components/EvidenceBadge.js';
import type { Baustein, FacetMeta } from '@fmt/core';

export function ComparePage() {
  const { bundle, blocksById, search, labelOf, comparePair, setComparePair } = useCatalog();
  if (!bundle || !search) return <div className="page-section">Lade…</div>;

  const sorted = [...bundle.bausteine].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const a = blocksById.get(comparePair[0]) || sorted[0];
  const b = blocksById.get(comparePair[1]) || sorted[1];

  const facetVal = (x: Baustein, f: FacetMeta) => {
    const val = x[f.feld];
    if (f.feld === 'steuerung') {
      if (!x.steuerung) return '–';
      return ['organisation', 'lernweg', 'inhalt', 'sozial', 'bewertung']
        .map((d) => `${labelOf('steuerungsdimension', d)}: ${labelOf('steuerungstraeger', x.steuerung![d] || 'lehrkraft')}`)
        .join('; ');
    }
    if (!Array.isArray(val) || !val.length) return '–';
    return val.map((c) => labelOf(f.schema, String(c))).join(', ');
  };

  const rows: Array<{ label: string; va: string; vb: string; group?: boolean }> = [
    { label: 'Reichweite', va: `${a.reichweite.toUpperCase()} ${labelOf('reichweite', a.reichweite)}`, vb: `${b.reichweite.toUpperCase()} ${labelOf('reichweite', b.reichweite)}` },
    { label: 'Dauer', va: `${a.dauerMin}–${a.dauerMax} min`, vb: `${b.dauerMin}–${b.dauerMax} min` },
    { label: 'Vorbereitung', va: `${a.vorbereitungMin} min`, vb: `${b.vorbereitungMin} min` },
    { label: 'Lerngruppe', va: `${a.gruppeMin}–${a.gruppeMax} Pers.`, vb: `${b.gruppeMin}–${b.gruppeMax} Pers.` },
    { label: 'Technik', va: `${labelOf('technikbedarf', a.technik)}${a.internet ? ', Internet' : ''}`, vb: `${labelOf('technikbedarf', b.technik)}${b.internet ? ', Internet' : ''}` },
    ...bundle.facetten.map((f) => ({ label: `${f.id} ${f.kurz}`, va: facetVal(a, f), vb: facetVal(b, f) })),
    { label: 'Vorbedingungen', va: (a.vorbedingung || []).map((z) => labelOf('lernzustand', z)).join(', ') || '–', vb: (b.vorbedingung || []).map((z) => labelOf('lernzustand', z)).join(', ') || '–' },
    { label: 'Nachbedingungen', va: (a.nachbedingung || []).map((z) => labelOf('lernzustand', z)).join(', ') || '–', vb: (b.nachbedingung || []).map((z) => labelOf('lernzustand', z)).join(', ') || '–' },
    { label: 'Q1 Kernkomponenten', va: a.kernkomponente.map((k) => k.name).join('; ') || '–', vb: b.kernkomponente.map((k) => k.name).join('; ') || '–' },
    { label: 'Q3 Qualitätsrisiken', va: (a.qualitaetsrisiko || []).join('; ') || '–', vb: (b.qualitaetsrisiko || []).join('; ') || '–' }
  ];

  return (
    <div className="page-section">
      <h1>Methoden vergleichen</h1>
      <p className="muted" style={{ maxWidth: '68ch' }}>
        Gleiche Oberfläche, verschiedenes Profil: Zwei Methoden lassen sich Facette für Facette nebeneinanderstellen.
        Hervorgehobene Zeilen markieren didaktische Unterschiede.
      </p>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '18px 0' }}>
        <label style={{ fontFamily: 'var(--display)', fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 4 }}>
          Methode A (Blau, durchgezogen)
          <select value={a.kennung} onChange={(e) => setComparePair([e.target.value, b.kennung])}>
            {sorted.map((x) => (
              <option key={x.kennung} value={x.kennung}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontFamily: 'var(--display)', fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 4 }}>
          Methode B (Pflaume, gestrichelt)
          <select value={b.kennung} onChange={(e) => setComparePair([a.kennung, e.target.value])}>
            {sorted.map((x) => (
              <option key={x.kennung} value={x.kennung}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="split-2" style={{ marginBottom: 24 }}>
        <div className="card" style={{ padding: 18 }}>
          <h3 style={{ textAlign: 'center' }}>Dual-Profil-Overlay (13 Facetten)</h3>
          <ProfileRadarSvg baustein={a} compareWith={b} facetten={bundle.facetten} mode="full" />
          <div style={{ display: 'flex', justifyContent: 'center', gap: 18, fontFamily: 'var(--display)', fontSize: 14, marginTop: 8 }}>
            <span>
              <strong style={{ color: 'var(--dA)' }}>━━</strong> {a.name} <EvidenceBadge grade={search.bestGrade(a)} />
            </span>
            <span>
              <strong style={{ color: 'var(--dD)' }}>╌╌</strong> {b.name} <EvidenceBadge grade={search.bestGrade(b)} />
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card" style={{ padding: 16 }}>
            <h3>Steuerungsprofil: {a.name}</h3>
            <ControlBars steuerung={a.steuerung} />
          </div>
          <div className="card" style={{ padding: 16 }}>
            <h3>Steuerungsprofil: {b.name}</h3>
            <ControlBars steuerung={b.steuerung} />
          </div>
        </div>
      </div>

      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Merkmal / Facette</th>
              <th>{a.name}</th>
              <th>{b.name}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className={r.va !== r.vb ? 'diff' : ''}>
                <td style={{ fontFamily: 'var(--display)', fontWeight: 600 }}>{r.label}</td>
                <td>{r.va}</td>
                <td>{r.vb}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
