import { useCatalog } from '../data/CatalogContext.js';
import { ProfileRadarSvg } from '../components/ProfileRadarSvg.js';
import { ControlBars } from '../components/ControlBars.js';
import { EvidenceBadge } from '../components/EvidenceBadge.js';
import { istHilfe, type Baustein, type FacetMeta } from '@fmt/core';
import { raumEigenschaftLabel } from '../planner/rahmen.js';
import { eignungNachWFeld } from '../planner/methodeRaster.js';
import { EVIDENZBEZUG_KURZ } from '../planner/evidenz.js';

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

  const codes = (x: string[] | undefined, scheme: string) => (x || []).map((c) => labelOf(scheme, c)).join(', ');
  const eintragsart = (x: Baustein) => (istHilfe(x) ? 'Hilfe (stützt Lernende in einer Methode)' : 'Methode (trägt eine Phase)');
  const raumbedarf = (x: Baustein) => (x.raumbedarf || []).map((r) => raumEigenschaftLabel(r, labelOf)).join(', ') || 'kein besonderer Bedarf';
  const schriftbedarf = (x: Baustein) =>
    (x.schriftbedarf || []).map((v) => (v === 'liest' ? 'lesen' : v === 'schreibt' ? 'schreiben' : labelOf('schriftbedarf', v))).join(' und ') || 'kein Bedarf angegeben';
  const eignung = (x: Baustein) =>
    eignungNachWFeld(x, bundle, labelOf)
      .flatMap((r) => r.zeilen)
      .filter((e) => e.art !== 'fachbereich')
      .map((e) => `${e.merkmal}: ${e.aussage.replace('Passt weniger zu: ', 'passt weniger zu ')} (Grundlage: ${e.grundlage})`)
      .join('; ') || 'keine Einschränkung erfasst';
  const ungeeignetFach = (x: Baustein) => {
    const g = x.eignungsgrund?.fachbereich;
    const liste = codes(x.fachbereichUngeeignet, 'fachbereich');
    return liste ? `${liste}${g ? ` (${g.text})` : ''}` : '–';
  };
  const evidenzBezug = (x: Baustein) =>
    (['methode', 'prinzip', 'programm'] as const)
      .filter((k) => (x.evidenz || []).some((e) => e.evidenzBezug === k))
      .map((k) => EVIDENZBEZUG_KURZ[k])
      .join(', ') || '–';
  const zeile = (label: string, f: (x: Baustein) => string) => ({ label, va: f(a), vb: f(b) });

  const rows: Array<{ label: string; va: string; vb: string; group?: boolean }> = [
    { label: 'Einordnung', va: '', vb: '', group: true },
    zeile('Eintragsart', eintragsart),
    { label: 'Reichweite / Granularität', va: `${a.reichweite.toUpperCase()} ${labelOf('reichweite', a.reichweite)}`, vb: `${b.reichweite.toUpperCase()} ${labelOf('reichweite', b.reichweite)}` },
    { label: 'Didaktischer Ansatz', va: (a.ansatz || []).map((c) => labelOf('ansatz', c)).join(', ') || '–', vb: (b.ansatz || []).map((c) => labelOf('ansatz', c)).join(', ') || '–' },
    zeile('Fachbereich', (x) => codes(x.fachbereich, 'fachbereich') || '–'),
    { label: 'Bedarf', va: '', vb: '', group: true },
    { label: 'Dauer', va: `${a.dauerMin}–${a.dauerMax} min`, vb: `${b.dauerMin}–${b.dauerMax} min` },
    zeile('Termine', (x) => (x.termineMin != null ? `mindestens ${x.termineMin}` : 'ein Termin genügt')),
    { label: 'Vorbereitung', va: `${a.vorbereitungMin} min`, vb: `${b.vorbereitungMin} min` },
    { label: 'Lerngruppe', va: `${a.gruppeMin}–${a.gruppeMax} Pers.`, vb: `${b.gruppeMin}–${b.gruppeMax} Pers.` },
    zeile('Raumbedarf', raumbedarf),
    zeile('Schriftbedarf (Lernende …)', schriftbedarf),
    { label: 'Technik', va: `${labelOf('technikbedarf', a.technik)}${a.internet ? ', Internet' : ''}`, vb: `${labelOf('technikbedarf', b.technik)}${b.internet ? ', Internet' : ''}` },
    { label: 'Vorbedingungen', va: (a.vorbedingung || []).map((z) => labelOf('lernzustand', z)).join(', ') || '–', vb: (b.vorbedingung || []).map((z) => labelOf('lernzustand', z)).join(', ') || '–' },
    { label: 'Eignung', va: '', vb: '', group: true },
    zeile('Bildungsstufe und Vorwissen', eignung),
    zeile('Fachbereich ungeeignet', ungeeignetFach),
    { label: 'Beitrag und Evidenz', va: '', vb: '', group: true },
    { label: 'Nachbedingungen', va: (a.nachbedingung || []).map((z) => labelOf('lernzustand', z)).join(', ') || '–', vb: (b.nachbedingung || []).map((z) => labelOf('lernzustand', z)).join(', ') || '–' },
    { label: 'Evidenzgrad (beste Studie)', va: search.bestGrade(a) ? `Grad ${search.bestGrade(a)} (${a.evidenz.length} Belege)` : 'Ohne Wirksamkeitsbeleg', vb: search.bestGrade(b) ? `Grad ${search.bestGrade(b)} (${b.evidenz.length} Belege)` : 'Ohne Wirksamkeitsbeleg' },
    zeile('Evidenzbezug', evidenzBezug),
    { label: 'Bauweise (13 Facetten)', va: '', vb: '', group: true },
    ...bundle.facetten.map((f) => ({ label: `${f.id} ${f.kurz}`, va: facetVal(a, f), vb: facetVal(b, f) })),
    { label: 'Q1 Kernkomponenten', va: a.kernkomponente.map((k) => k.name).join('; ') || '–', vb: b.kernkomponente.map((k) => k.name).join('; ') || '–' },
    { label: 'Q3 Qualitätsrisiken', va: (a.qualitaetsrisiko || []).join('; ') || '–', vb: (b.qualitaetsrisiko || []).join('; ') || '–' }
  ];

  return (
    <div className="page-section">
      <h1>Methoden vergleichen</h1>
      <p className="muted" style={{ maxWidth: '68ch' }}>
        Gleiche Oberfläche, verschiedenes Profil: Zwei Methoden lassen sich nach Einordnung, Bedarf, Eignung, Beitrag und
        den 13 Facetten nebeneinanderstellen. Hervorgehobene Zeilen markieren Unterschiede. Hilfen sind in der Auswahl als
        „(Hilfe)“ gekennzeichnet: Sie tragen keine Phase.
      </p>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '18px 0' }}>
        <label style={{ fontFamily: 'var(--display)', fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 4 }}>
          Methode A (Blau, durchgezogen)
          <select value={a.kennung} onChange={(e) => setComparePair([e.target.value, b.kennung])}>
            {sorted.map((x) => (
              <option key={x.kennung} value={x.kennung}>
                {istHilfe(x) ? `${x.name} (Hilfe)` : x.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontFamily: 'var(--display)', fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 4 }}>
          Methode B (Pflaume, gestrichelt)
          <select value={b.kennung} onChange={(e) => setComparePair([a.kennung, e.target.value])}>
            {sorted.map((x) => (
              <option key={x.kennung} value={x.kennung}>
                {istHilfe(x) ? `${x.name} (Hilfe)` : x.name}
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
          <p className="muted" style={{ fontSize: 12, textAlign: 'center', margin: '8px 0 0' }}>
            Lesehilfe Radar: Ordinale Achsen (A2 Engagement, B1 Anleitung, B2 Steuerung) zeigen die Ausprägungsstärke; kategoriale Achsen zeigen die Funktions-/Format-Bandbreite. Exakte Werte stehen in der Vergleichstabelle unten.
          </p>
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
            {rows.map((r) =>
              r.group ? (
                <tr key={`g-${r.label}`}>
                  <th colSpan={3} scope="colgroup" style={{ fontFamily: 'var(--display)', background: 'var(--surface)' }}>
                    {r.label}
                  </th>
                </tr>
              ) : (
              <tr key={r.label} className={r.va !== r.vb ? 'diff' : ''}>
                <td style={{ fontFamily: 'var(--display)', fontWeight: 600 }}>{r.label}</td>
                <td>{r.va}</td>
                <td>{r.vb}</td>
              </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
