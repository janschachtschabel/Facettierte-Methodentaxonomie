import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FMT_RULES, oehDisciplinesForFachbereich } from '@fmt/core';
import { useCatalog } from '../data/CatalogContext.js';
import { EvidenceBadge } from '../components/EvidenceBadge.js';
import { CatalogAnalytics } from '../components/CatalogAnalytics.js';
import { raumEigenschaftLabel } from '../planner/rahmen.js';

const DOMAINS = [
  { id: 'A', name: ['Lernprozess'], color: 'var(--dA)', soft: 'var(--dA-soft)' },
  { id: 'B', name: ['Steuerung', '& Adaptivität'], color: 'var(--dB)', soft: 'var(--dB-soft)' },
  { id: 'C', name: ['Interaktion', '& Medialität'], color: 'var(--dC)', soft: 'var(--dC-soft)' },
  { id: 'D', name: ['Gegenstand', '& Zeit'], color: 'var(--dD)', soft: 'var(--dD-soft)' }
];

const QMODS = [
  {
    id: 'Q1',
    name: 'Kernkomponenten',
    text: 'Jeder Baustein deklariert unverzichtbare Kernkomponenten (Regel R-10). Fehlt eine, gilt die Bezeichnung nicht mehr.',
    basis: 'Implementationsforschung (Durlak & DuPre 2008)',
    closes: 'Implementationsblindheit (N1)'
  },
  {
    id: 'Q2',
    name: 'Bedarf und Eignung',
    text: 'Bedarf (Raum, Zeit, Termine, Gruppe, Ausstattung, Vorbereitung, Lesen und Schreiben) und Eignung (Bildungsstufe, Vorwissen, Fachbezug) im W-Raster. Verhindert kontextblinde Wirkungsrankings (Regel R-06).',
    basis: 'Expertise-Reversal (Kalyuga et al. 2003; Tetzlaff et al. 2025)',
    closes: 'Kontextblindheit (M3)'
  },
  {
    id: 'Q3',
    name: 'Qualitätsschicht',
    text: 'Trennt Design (Plan) von Durchführung (Klassenführung, Unterstützung, kognitive Aktivierung) und nennt Qualitätsrisiken.',
    basis: 'Praetorius et al. (2018)',
    closes: 'Sichtstruktur-Fixierung'
  },
  {
    id: 'Q4',
    name: 'Evidenzschicht',
    text: 'Befunde mit Evidenzgrad A bis C, Quelle, Geltungsbereich und Gegenposition. Grad A verlangt ≥ 2 unabhängige Synthesen.',
    basis: 'Meta-analytische Synthesen',
    closes: 'Evidenz ohne Gütegrad (N4)'
  },
  {
    id: 'Q5',
    name: 'Komposition',
    text: '12 Lernzustände als Schnittstellen, Slots für Schachtelung, 6 Operatoren, 13 Regeln, 5-Stufen-Zuordnung, SKOS & JSON-LD.',
    basis: 'Oser & Baeriswyl (2001); Loibl et al. (2024); W3C SKOS/JSON-LD',
    closes: 'Fehlende Kompositionslogik & Maschinenlesbarkeit (N7, N8)'
  }
];

const AXIS_EXAMPLES: Record<string, [string, string, string]> = {
  r1: ['3-minütiges Murmelgespräch zu Beginn der Biologiestunde', 'Think-Pair-Share · Exit-Ticket · Abrufquiz', 'A1 Orientierung, A2 interaktiv, C1 Partner'],
  r2: ['45-minütiges Gruppenpuzzle zur Energieversorgung in 8b', 'Gruppenpuzzle · Lösungsbeispiele · VBE', 'A1 Verstehen, B1 geleitet, C1 kooperativ'],
  r3: ['6-stündige Physikreihe „Dichte von Stoffen“ (VBE → PF → Üben)', 'Productive Failure · Projektmethode · Stationenlernen', 'Kette Konzeptaufbau (K1–K5), D2 Problem vor Instruktion'],
  r4: ['Halbjahres-Modul „Ökosysteme“ mit begleitendem Lernportfolio', 'Blended Learning · COOL · Produktives Lernen', 'C3 Präsenz + Distanz, B2 geteilte Steuerung'],
  r5: ['Kompetenzorientiertes Kerncurriculum Sekundarstufe I', 'Curriculare Leitlinien / Bildungsgang-Architektur', 'Verknüpfung mehrerer Module (R4) über Jahrgänge']
};

const INFER_TEXT: Record<string, string> = {
  niedrig: 'niedrig-inferent, direkt am Plan ablesbar',
  mittel: 'mittel-inferent, braucht Kodierregeln und Ankerbeispiele',
  hoch: 'hoch-inferent, fachdidaktische Einschätzung über die Absicht des Designs'
};

export const GRUNDLAGE_TEXT: Record<string, string> = {
  formal: 'formal (ablesbar)',
  E: 'belegt (E)',
  S: 'gefolgert (S)',
  A: 'gesetzt (A)',
  U: 'ungeklärt (U)',
  Recht: 'Recht'
};

const WIRKUNG_TEXT: Record<string, string> = {
  'schliesst-aus': 'schließt aus',
  warnt: 'warnt',
  ordnet: 'ordnet',
  'weist-hin': 'weist hin'
};

/** The four effects in the order they act on the rank of a method (spec 6, "Reihenfolge der Wirkung"). */
const WIRKUNG_REIHE: Array<[string, string]> = [
  ['schliesst-aus', 'Die Methode kommt nicht in Frage, weil etwas Ablesbares nicht passt.'],
  ['warnt', 'Die Methode bleibt wählbar und trägt einen Hinweis mit Grundlage. Sie steht weiter hinten, außer die Regel sieht keinen Tausch vor oder die Lehrkraft hat sie selbst genannt.'],
  ['ordnet', 'Die Methode rückt nach vorn oder hinten; nichts fällt weg.'],
  ['weist-hin', 'Ein Hinweis für die Lehrkraft; die Rangfolge ändert sich nicht.']
];

const ROLE_LABEL: Record<string, string> = { rand: 'Rand', haupt: 'Haupt', sicherung: 'Sicherung' };

const MATCH_STAGES = [
  ['1 Funktion', 'Was soll die Phase oder Reihe leisten?', 'Beitrag: Zielart, Lernfunktion, gewünschter Lernzustand; Wissensart je Kettenschritt', 'schließt aus', 'Klauer & Leutner 2012; Oser & Baeriswyl 2001'],
  ['2 Rahmen', 'Was ist praktisch möglich?', 'Bedarf gegen Rahmenbedingungen: Zeit, Termine, Gruppengröße, Technik, Raum mit Eigenschaften, Lesen und Schreiben, Vorbereitung, ohne KI/Internet', 'schließt aus (ein angenommener Raum nur ordnend)', 'formal'],
  ['3 Anschluss', 'Was bringen die Lernenden mit?', 'Bedarf: Vorbedingungen gegen vorhandene Lernzustände', 'schließt aus', 'Loibl et al. 2024'],
  ['4 Passung', 'Für wen passt es?', 'Eignung: Vorwissen (Expertise-Reversal), Bildungsstufe, Fachbereich', 'warnt', 'Tetzlaff et al. 2025; Sinha & Kapur 2021'],
  ['5 Auswahl', 'Welcher der verbleibenden?', 'Punktzahl aus Fachbereich, Ansatz, Anleitung, Zeit, Technik, Textnähe und Evidenz (Studie zur Methode vor abgeleitetem Prinzip); im Text genannte Methoden haben Vorrang', 'ordnet (Lehrkraft entscheidet)', 'Setzung']
];

const LLM_BOUNDARY = [
  ['Bausteine filtern, Anschluss prüfen, Rangfolge bilden', 'Nein – deterministischer Code (< 1 ms)'],
  ['Ablauf entlang einer Funktionskette zusammensetzen & prüfen', 'Nein – deterministischer Prüfer (R-00..R-12)'],
  ['Freitext in Kriterien übersetzen', 'Optional – Regeln lesen explizite Angaben, LLM versteht Umschreibungen (Schema-geprüft)'],
  ['Geprüften Ablauf fachlich für Thema & Lerngruppe ausformulieren', 'Ja – konkrete Aufgaben, Übergänge, Moderation & Quellen'],
  ['Neue Methoden erfassen & kodieren', 'Als Entwurf mit menschlicher Prüfung']
];

const GAP_MATRIX_HEADERS = ['Sicht vs. Tiefe', 'Granularität', 'Lenkung ≠ Aktivität', 'Steuerung (B2)', 'Adaptivität', 'Bewertung', 'KI-Rollen', 'Komposition', 'Evidenzgrad', 'Maschinenlesbar'];
const GAP_MATRIX_ROWS: Array<{ name: string; vals: string[]; fmt?: boolean }> = [
  { name: 'Meyer (1987)', vals: ['○', '●', '○', '◐', '○', '○', '○', '○', '○', '○'] },
  { name: 'Flechsig (1996)', vals: ['◐', '◐', '○', '◐', '○', '○', '○', '○', '○', '○'] },
  { name: 'Aebli (1983)', vals: ['●', '○', '◐', '○', '○', '○', '○', '◐', '○', '○'] },
  { name: 'Oser & Baeriswyl (2001)', vals: ['●', '◐', '◐', '○', '○', '○', '○', '●', '◐', '○'] },
  { name: 'Baumgartner (2011)', vals: ['◐', '●', '◐', '◐', '◐', '◐', '○', '○', '○', '○'] },
  { name: 'Mühlhausen (2023)', vals: ['●', '◐', '◐', '◐', '◐', '◐', '○', '○', '◐', '○'] },
  { name: 'IMS Learning Design', vals: ['○', '●', '○', '○', '◐', '◐', '○', '●', '○', '●'] },
  { name: 'FMT (dieses Modell)', vals: ['●', '●', '●', '●', '●', '●', '●', '●', '●', '●'], fmt: true }
];

const EVIDENCE_TABLE: Array<[string, string, string, 'A' | 'B' | 'C']> = [
  ['B1 offen-entdeckend ohne Unterstützung', 'schlechter als explizite Instruktion, d ≈ −0,38 (Alfieri et al. 2011)', 'besonders bei geringem Vorwissen', 'A'],
  ['B1 geleitet-entdeckend', 'besser als andere Formen, d ≈ 0,30 (Alfieri et al. 2011; Lazonder & Harmsen 2016)', 'Anleitung passend zum Kenntnisstand; Verhältnis zu DI strittig', 'A'],
  ['A1 Konsolidierung über Abruf', 'Testing-Effekt g ≈ 0,50–0,61 (Rowland 2014; Yang et al. 2021)', 'robust über Alter und Material; wirkt schon einmalig', 'A'],
  ['D2 verteilt statt massiert', 'robuster Behaltensvorteil (Cepeda et al. 2006)', 'Abstand skaliert mit dem Behaltensintervall', 'A'],
  ['D1 Novizen mit Lösungsbeispielen', 'g ≈ 0,48 in Mathematik (Barbieri et al. 2023); Umkehr bei Expertise (Tetzlaff et al. 2025)', 'Fading als Übergang entscheidend', 'A'],
  ['A2 konstruktiv durch Selbsterklärung', 'g ≈ 0,55 (Bisra et al. 2018)', 'Prompts auf Prinzipien gerichtet', 'A'],
  ['C1 kooperativ strukturiert', 'ES ≈ 0,54 auf Leistung (Kyndt et al. 2013)', 'erfordert Interdependenz und individuelle Verantwortlichkeit', 'A'],
  ['B4 Feedback', 'd ≈ 0,48, stark heterogen (Wisniewski, Zierer & Hattie 2020)', 'Informationsgehalt entscheidet (elaboriert > bloße Verstärkung)', 'B'],
  ['B4 formative Diagnose', 'positiv, Größe strittig: ≈ 0,20 (Kingston & Nash 2011)', 'wirkt nur, wenn die Diagnose den weiteren Unterricht steuert', 'B'],
  ['D2 Problem vor Instruktion (PF)', 'g ≈ 0,36; bis 0,58 bei hoher Treue (Sinha & Kapur 2021)', 'konzeptuelles Wissen; nicht für Klasse 2–5', 'B'],
  ['C4 KI als Antwortgeber', 'Übung +48 %, Prüfung ohne KI −17 % (Bastani et al. 2025)', 'ohne Leitplanken; Leistung mit KI ≠ Lernen ohne KI', 'C'],
  ['C4 KI als Tutor mit Leitplanken', 'gemischt (Kestin et al. 2025; Bastani et al. 2025)', 'Design entscheidend; Prüfung ohne KI maßgeblich', 'C']
];

const OBSOLETE = [
  ['Lernstile und Lerntypen als Kriterium der Methodenwahl', 'Belastbare Evidenz für die Passung fehlt.', 'Pashler et al. 2008'],
  ['Lernpyramide mit festen Behaltensquoten (10 %, 20 %, 90 %)', 'Die Prozentwerte gehen auf keine belastbare Studie zurück.', 'Subramony et al. 2014'],
  ['Sichtbare Aktivität = kognitive Aktivierung', 'Verhalten zeigt tiefes Verarbeiten nicht zuverlässig an.', 'Thurn et al. 2023; Praetorius et al. 2018'],
  ['Entdecken ohne Anleitung ist überlegen', 'Ohne Unterstützung im Mittel schlechter als explizite Instruktion (d ≈ −0,38).', 'Alfieri et al. 2011'],
  ['„Direkte Instruktion“ ist als Ganzes belegt', 'Die große Synthese gilt Engelmanns ausgearbeiteten Programmen, nicht jedem Frontalunterricht.', 'Stockard et al. 2018'],
  ['Leistung mit KI = Lernen', 'Bessere Übungsleistung mit ungeführter KI kann Prüfung ohne KI verschlechtern (−17 %).', 'Bastani et al. 2025'],
  ['ChatGPT-Meta-Analyse (g ≈ 0,87)', 'Die vielzitierte Synthese wurde am 22. April 2026 zurückgezogen.', 'Wang & Fan 2025; Rückzugsvermerk 2026']
];

const ROADMAP = [
  ['Kodierhandbuch', 'Definition, prototypisches Ankerbeispiel und Grenzfall für jeden Facettenwert und Lernzustand.'],
  ['Crosswalks', 'OEH-Vokabular angebunden; Abgleich mit Baumgartners 26 Dimensionen und AMB (DINI AG KIM) ausbauen.'],
  ['Abdeckungstest (> 130 Methoden)', 'Mit dem aktuellen Datenbestand übertroffen; laufende Kuratierung der Ersterfassungen.'],
  ['Reliabilität (κ ≥ 0,70)', 'Zwei unabhängige Kodierende prüfen Übereinstimmung je Facette und für Vor-/Nachbedingungen.'],
  ['Regeln kalibrieren', 'Validator an von Fachleuten bewerteten Unterrichtsreihen prüfen (Treffer vs. Fehlalarme).'],
  ['Fachdidaktisches Delphi', 'Fachgebundene Funktionsketten und Lernzustände (MINT, Sprachen, Gesellschaftswissenschaften) ergänzen.'],
  ['Evidenz laufend pflegen', 'Geltung, Gegenposition und Prüfdatum je Befund pflegen; KI-Befunde jährlich prüfen.']
];

const C = 280;
const polar = (r: number, deg: number) => {
  const t = (deg * Math.PI) / 180;
  return [C + r * Math.sin(t), C - r * Math.cos(t)] as const;
};

function sectorPath(r0: number, r1: number, a0: number, a1: number) {
  const [x0, y0] = polar(r1, a0);
  const [x1, y1] = polar(r1, a1);
  const [x2, y2] = polar(r0, a1);
  const [x3, y3] = polar(r0, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${x0} ${y0}A${r1} ${r1} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 ${large} 0 ${x3} ${y3}Z`;
}

function OperatorGlyph({ id }: { id: string }) {
  const box = (x: number, y: number, w: number, h: number, fill: string, key: string) => (
    <rect key={key} x={x} y={y} width={w} height={h} rx={3} fill={fill} stroke="var(--ink)" strokeWidth={1} />
  );
  return (
    <svg viewBox="0 0 132 46" aria-hidden="true" style={{ width: 132, height: 46, display: 'block', marginBottom: 8 }}>
      {id === 'sequenz' && (
        <>
          {box(2, 14, 36, 18, 'var(--dA-soft)', 's1')}
          {box(48, 14, 36, 18, 'var(--dA-soft)', 's2')}
          {box(94, 14, 36, 18, 'var(--dA-soft)', 's3')}
        </>
      )}
      {id === 'schachtelung' && (
        <>
          {box(2, 4, 128, 38, 'var(--dC-soft)', 'c1')}
          {box(12, 16, 46, 18, 'var(--surface)', 'c2')}
          {box(66, 16, 46, 18, 'var(--surface)', 'c3')}
        </>
      )}
      {id === 'parallel' && (
        <>
          {box(2, 6, 128, 16, 'var(--dA-soft)', 'p1')}
          {box(2, 28, 128, 10, 'var(--dD-soft)', 'p2')}
        </>
      )}
      {id === 'wiederkehr' && (
        <>
          {box(2, 14, 128, 18, 'var(--surface)', 'w0')}
          {[20, 58, 96].map((x) => box(x, 18, 14, 10, 'var(--dB)', `w${x}`))}
        </>
      )}
      {id === 'alternative' && (
        <>
          {box(2, 14, 30, 18, 'var(--dA-soft)', 'a1')}
          {box(52, 2, 36, 16, 'var(--dC-soft)', 'a2')}
          {box(52, 28, 36, 16, 'var(--dC-soft)', 'a3')}
          <path d="M32 23 L52 10 M32 23 L52 36" stroke="var(--ink)" fill="none" />
          {box(100, 14, 30, 18, 'var(--dA-soft)', 'a4')}
        </>
      )}
      {id === 'verweis' && (
        <>
          {box(2, 4, 128, 38, 'var(--surface)', 'v1')}
          {box(10, 12, 56, 22, 'var(--dD-soft)', 'v2')}
          <path d="M74 23 h40 m-8 -6 l8 6 l-8 6" stroke="var(--ink)" fill="none" />
        </>
      )}
    </svg>
  );
}

export function SystematikPage() {
  const { bundle, search, valuesOf, labelOf } = useCatalog();
  const [selectedId, setSelectedId] = useState('A2');

  if (!bundle) return <div className="page-section">Lade Systematik…</div>;

  const step = 360 / bundle.facetten.length;
  const selectedFacet = bundle.facetten.find((f) => f.id === selectedId);
  const selectedQ = QMODS.find((q) => q.id === selectedId);

  const domainArcs: Array<{ d: (typeof DOMAINS)[number]; a0: number; a1: number }> = [];
  let start = 0;
  DOMAINS.forEach((d) => {
    const n = bundle.facetten.filter((f) => f.domaene === d.id).length;
    domainArcs.push({ d, a0: start, a1: start + n * step });
    start += n * step;
  });

  const reichweiten = valuesOf('reichweite');
  const lernzustaende = valuesOf('lernzustand');

  return (
    <div className="page-section">
      {/* 1. Hero + Interactive Facet Compass */}
      <div className="split-2" style={{ alignItems: 'center' }}>
        <div>
          <h1>Eine Karte der Unterrichtsmethoden</h1>
          <p className="muted" style={{ fontFamily: 'var(--display)', fontSize: 20, marginTop: 6 }}>
            Facettierte Methodentaxonomie (FMT) · Version {bundle.version} · CC BY 4.0 Jan Schachtschabel
          </p>
          <p style={{ fontSize: 17.5 }}>
            Bestehende Methodensammlungen ordnen nach Einzelkriterien oder nach Methodennamen – Wirksamkeitsbefunde hängen jedoch an{' '}
            <strong>Merkmalen unter Bedingungen</strong>. Die FMT beschreibt deshalb jede der{' '}
            <strong>{bundle.bausteine.length} Methoden</strong> als Profil aus <strong>13 getrennt kodierten Facetten</strong> in vier
            Domänen, geordnet auf zwei Achsen und kombinierbar über sechs Operatoren.
          </p>

          <div
            className="card"
            style={{
              padding: 16,
              borderLeft: `4px solid ${selectedFacet ? DOMAINS.find((d) => d.id === selectedFacet.domaene)?.color : 'var(--ink)'}`
            }}
          >
            {selectedFacet ? (
              <>
                <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14, color: 'var(--ink-2)' }}>
                  {selectedFacet.id} · Domäne {selectedFacet.domaene} · {INFER_TEXT[selectedFacet.inferenz] || selectedFacet.inferenz}
                </div>
                <h3 style={{ marginTop: 4 }}>{selectedFacet.name}</h3>
                <p style={{ marginBottom: 8 }}>{selectedFacet.leitfrage}</p>
                <ul className="chips" style={{ marginBottom: 10 }}>
                  {valuesOf(selectedFacet.schema).map((w) => (
                    <li key={w.id} className="chip">
                      {w.label}
                    </li>
                  ))}
                </ul>
                <p style={{ fontSize: 14, marginBottom: 4 }}>
                  <strong>Fundierung:</strong> {selectedFacet.fundierung}
                </p>
                <p style={{ fontSize: 14, marginBottom: 4 }}>
                  <strong>Schließt Lücke:</strong> {selectedFacet.schliesst}
                </p>
                <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
                  SKOS-Vokabular:{' '}
                  <a href={`/vocabs/${selectedFacet.schema}.ttl`} target="_blank" rel="noreferrer">
                    {bundle.NS}vocab/{selectedFacet.schema}/
                  </a>
                </p>
              </>
            ) : selectedQ ? (
              <>
                <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14, color: 'var(--ink-2)' }}>
                  {selectedQ.id} · Querschnittsmodul
                </div>
                <h3 style={{ marginTop: 4 }}>{selectedQ.name}</h3>
                <p>{selectedQ.text}</p>
                <p style={{ fontSize: 14, marginBottom: 4 }}>
                  <strong>Fundierung:</strong> {selectedQ.basis}
                </p>
                <p style={{ fontSize: 14, marginBottom: 0 }}>
                  <strong>Schließt:</strong> {selectedQ.closes}
                </p>
              </>
            ) : null}
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
            {QMODS.map((q) => (
              <button
                key={q.id}
                type="button"
                className="btn btn-sm btn-ghost"
                aria-pressed={selectedId === q.id}
                onClick={() => setSelectedId(q.id)}
              >
                {q.id} {q.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <svg
            viewBox="0 0 560 560"
            role="group"
            aria-label="Interaktiver Facettenkompass mit vier Domänen und dreizehn Facetten"
            style={{ width: '100%', maxWidth: 520, display: 'block', margin: '0 auto' }}
          >
            <circle cx={C} cy={C} r={244} fill="none" stroke="var(--rule)" strokeWidth={1} />
            {domainArcs.map(({ d, a0, a1 }) => {
              const [tx, ty] = polar(100, (a0 + a1) / 2);
              return (
                <g key={d.id}>
                  <path d={sectorPath(70, 130, a0, a1)} fill={d.color} stroke="var(--paper)" strokeWidth={2} />
                  <text
                    x={tx}
                    y={ty}
                    textAnchor="middle"
                    fill="var(--on-domain)"
                    fontSize={13.5}
                    fontWeight={700}
                    fontFamily="var(--display)"
                  >
                    {d.name.map((ln, idx) => (
                      <tspan key={idx} x={tx} dy={idx === 0 ? (d.name.length > 1 ? -4 : 4) : 15}>
                        {ln}
                      </tspan>
                    ))}
                  </text>
                </g>
              );
            })}
            {bundle.facetten.map((f, i) => {
              const a0 = i * step;
              const a1 = (i + 1) * step;
              const d = DOMAINS.find((x) => x.id === f.domaene)!;
              const on = selectedId === f.id;
              const [tx, ty] = polar(188, (a0 + a1) / 2);
              return (
                <g
                  key={f.id}
                  tabIndex={0}
                  role="button"
                  aria-pressed={on}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedId(f.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedId(f.id);
                    }
                  }}
                >
                  <path d={sectorPath(136, 238, a0, a1)} fill={on ? d.color : d.soft} stroke="var(--paper)" strokeWidth={2} />
                  <text
                    x={tx}
                    y={ty}
                    textAnchor="middle"
                    fill={on ? 'var(--on-domain)' : 'var(--ink)'}
                    fontSize={13}
                    fontWeight={600}
                    fontFamily="var(--display)"
                  >
                    <tspan x={tx} dy={-4}>
                      {f.id}
                    </tspan>
                    <tspan x={tx} dy={15}>
                      {f.kurz}
                    </tspan>
                  </text>
                </g>
              );
            })}
            <circle cx={C} cy={C} r={64} fill="var(--surface)" stroke="var(--ink)" strokeWidth={1.5} />
            <text x={C} y={C - 4} textAnchor="middle" fill="var(--ink)" fontSize={18} fontWeight={700} fontFamily="var(--display)">
              Methode
            </text>
            <text x={C} y={C + 16} textAnchor="middle" fill="var(--ink)" fontSize={18} fontWeight={700} fontFamily="var(--display)">
              = Profil
            </text>
          </svg>
          <p className="muted" style={{ textAlign: 'center', fontSize: 13.5 }}>
            Der Kreis kennt keine Rangfolge: Facette antippen für Leitfrage, Werte &amp; Fundierung
          </p>
        </div>
      </div>

      {/* 2. Begründung & 5 Anforderungen */}
      <section style={{ marginTop: 40, paddingTop: 30, borderTop: '1px solid var(--rule)' }}>
        <h2>Warum eine Facettierte Methodentaxonomie? (Begründung &amp; 5 Anforderungen)</h2>
        <p style={{ maxWidth: '76ch' }}>
          Klassische Systematiken ordnen Verschiedenes: Meyer (1987) nach Umfang, Flechsig (1996) nach 20 Modellen, Aebli (1983) nach
          Grundformen, Oser &amp; Baeriswyl (2001) nach Choreografie und Basismodellen, Baumgartner (2011) nach Größe und Abstraktion.
          Gleichzeitig zeigt die empirische Bildungsforschung, dass nicht der <em>Methodenname</em> wirkt, sondern <strong>Merkmale unter
          Bedingungen</strong> (z. B. Anleitungsgrad bei geringem Vorwissen, Informationsgehalt des Feedbacks, Strukturierung in Gruppen).
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 14 }}>
          {[
            ['1. Facetten statt Baum', 'Merkmale getrennt erfassen statt starrer Einordnung an genau einen Baumort (Broughton 2006).'],
            ['2. Plan ≠ Durchführung', 'Den Plan einer Methode (Design) klar von der Klassenraum-Qualität und der Wirkung trennen.'],
            ['3. Evidenz mit Geltung', 'Befunde an Merkmale binden und stets Grad (A–C), Geltungsbereich und Gegenposition nennen.'],
            ['4. Kombinierbarkeit', 'Methoden als Bausteine mit Vor-/Nachbedingungen von der Phase bis zur Unterrichtsreihe verbinden.'],
            ['5. Maschinenlesbar', 'Alle Daten als SKOS, JSON-LD, JSON Schema & MCP aus einer offenen Quelle (CC BY 4.0) ausliefern.']
          ].map(([title, desc]) => (
            <div key={title} className="card" style={{ padding: 14 }}>
              <strong style={{ fontFamily: 'var(--display)', fontSize: 16 }}>{title}</strong>
              <p className="muted" style={{ fontSize: 14, margin: '4px 0 0' }}>
                {desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Granularitätsebenen (R1-R5), Zwei Achsen (R x S Matrix) & Drei Ebenen */}
      <section style={{ marginTop: 42, paddingTop: 32, borderTop: '1px solid var(--rule)' }}>
        <h2>Granularitätsebenen (R1–R5), zwei Achsen &amp; drei Ebenen</h2>
        <p style={{ maxWidth: '78ch' }}>
          In der Praxis werden Methoden ganz unterschiedlicher Größe nebeneinander genannt – vom 5-minütigen <em>Exit-Ticket</em> bis zur
          mehrwöchigen <em>Projektmethode</em>. In Anlehnung an Baumgartner (2011) trennt die FMT deshalb die{' '}
          <strong>Granularität / Reichweite (R1–R5)</strong> von der <strong>Beschreibungsstufe (S1–S6)</strong>. Größere Einheiten
          können über <strong>Slots</strong> gezielt kleinere Einheiten aufnehmen (<code>R4 ⊃ R3 ⊃ R2 ⊃ R1</code>, geprüft durch Regel{' '}
          <code>R-01</code>).
        </p>

        {/* Visual Granularity Ladder */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))', gap: 10, margin: '16px 0 22px' }}>
          {[
            ['R1 Interaktion', 'Sekunden bis ~15 min', 'var(--dC)', 'var(--dC-soft)', 'Kleinster Baustein innerhalb einer Phase (z. B. Think-Pair-Share, Abrufquiz, Exit-Ticket). Passt in Slots von R2 und R3.'],
            ['R2 Szenario', '~15 bis 60 min', 'var(--dA)', 'var(--dA-soft)', 'Durchgehende Unterrichtsphase oder Einzelstunde (z. B. Gruppenpuzzle, Lösungsbeispiele, VBE). Kann R1-Slots enthalten.'],
            ['R3 Ensemble / Reihe', 'Stunden bis Wochen', 'var(--dD)', 'var(--dD-soft)', 'Verbindet mehrere Szenarien zu einer mehrstündigen Sequenz (z. B. Productive Failure, Projektmethode, Stationenlernen).'],
            ['R4 Modul / Kurs', 'Wochen bis Halbjahr', 'var(--dB)', 'var(--dB-soft)', 'Rahmt ganze Themenblöcke oder Kurse inkl. Präsenz-/Distanzphasen (z. B. Blended Learning, Daltonplan, Epochenunterricht).'],
            ['R5 Curriculum', 'Bildungsgang / Jahrgänge', 'var(--ink)', 'var(--surface)', 'Übergeordnete Bildungs- und Lehrplanebene (Rahmen für mehrere R4-Module; keine Einzelmethode im Katalog).']
          ].map(([title, span, col, bg, desc]) => (
            <div key={title} className="card" style={{ padding: 13, borderTop: `4px solid ${col}`, background: bg }}>
              <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 16 }}>{title}</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 6 }}>{span}</div>
              <p style={{ fontSize: 13.5, margin: 0 }}>{desc}</p>
            </div>
          ))}
        </div>

        <p className="card" style={{ padding: '10px 14px', fontSize: 14.5, maxWidth: 'none', borderLeft: '4px solid var(--dA)' }}>
          <strong>Wo liegt die klassische Unterrichtsstunde (45–90 min)?</strong> Sie ist bewusst keine eigene Stufe: Besteht die Stunde aus
          einem durchgehenden Verfahren (z. B. ein Gruppenpuzzle), entspricht sie <strong>R2</strong>. Verbindet sie mehrere eigenständige
          Szenarien (z. B. Einstieg → Erarbeitung → Sicherung), ist sie ein kleines <strong>R3-Ensemble</strong>.
        </p>

        <div className="scroll">
          <table style={{ minWidth: 820 }}>
            <thead>
              <tr>
                <th>Reichweite (Granularität)</th>
                <th>S1 Praxisbeschreibung</th>
                <th>S2 Muster (Datenbank-Einheit)</th>
                <th>S3 Modell / Profil</th>
                <th>S4 Prinzip</th>
                <th>S5 Dimension</th>
                <th>S6 Kategorie</th>
              </tr>
            </thead>
            <tbody>
              {reichweiten.map((r, idx) => {
                const ex = AXIS_EXAMPLES[r.id] || ['–', '–', '–'];
                return (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <strong style={{ fontFamily: 'var(--display)' }}>
                        {r.id.toUpperCase()} {r.label}
                      </strong>
                      <div className="muted" style={{ fontSize: 12.5 }}>
                        {r.definition}
                      </div>
                    </td>
                    <td style={{ background: 'var(--surface)' }}>{ex[0]}</td>
                    <td style={{ background: 'var(--surface)', fontWeight: 600 }}>{ex[1]}</td>
                    <td style={{ background: 'var(--surface)' }}>{ex[2]}</td>
                    {idx === 0 && (
                      <>
                        <td rowSpan={reichweiten.length} style={{ background: 'var(--dA-soft)', borderLeft: '1px solid var(--rule)' }}>
                          Einzelne Facettenwerte, z. B. <em>geleitet-entdeckend</em> oder <em>verteilt</em>
                        </td>
                        <td rowSpan={reichweiten.length} style={{ background: 'var(--dA-soft)', borderLeft: '1px solid var(--rule)' }}>
                          Die 13 Facetten – gültig auf jeder Reichweite
                        </td>
                        <td rowSpan={reichweiten.length} style={{ background: 'var(--dA-soft)', borderLeft: '1px solid var(--rule)' }}>
                          4 Domänen: A Lernprozess, B Steuerung, C Interaktion, D Gegenstand &amp; Zeit
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginTop: 18 }}>
          <div className="card" style={{ padding: 16, borderTop: '4px solid var(--dA)' }}>
            <h3>1. Design (Plan)</h3>
            <p className="muted" style={{ fontSize: 14.5, margin: 0 }}>
              Die Methode als Plan. Hier klassifiziert die Taxonomie: 13 Facetten, Schnittstellen und Kernkomponenten beschreiben das Angebot.
            </p>
          </div>
          <div className="card" style={{ padding: 16, borderTop: '4px solid var(--dB)' }}>
            <h3>2. Durchführung</h3>
            <p className="muted" style={{ fontSize: 14.5, margin: 0 }}>
              Die Methode im Klassenraum. Hier urteilt die Unterrichtsqualität: Klassenführung, Unterstützung, kognitive Aktivierung, Fachlichkeit.
            </p>
          </div>
          <div className="card" style={{ padding: 16, borderTop: '4px solid var(--dC)' }}>
            <h3>3. Nutzung &amp; Wirkung</h3>
            <p className="muted" style={{ fontSize: 14.5, margin: 0 }}>
              Was Lernende kognitiv tun und was es bewirkt. Hier belegt die Evidenzschicht – stets unter Bedingungen und ohne Hilfe gemessen.
            </p>
          </div>
        </div>
      </section>

      {/* 4. Bausteine kombinieren: 6 Operatoren mit SVG-Symbolen + Lernzustände */}
      <section style={{ marginTop: 42, paddingTop: 32, borderTop: '1px solid var(--rule)' }}>
        <h2>Bausteine kombinieren: 6 Operatoren, Slots &amp; {lernzustaende.length} Lernzustände</h2>
        <p style={{ maxWidth: '76ch' }}>
          Jede Methode ist ein Baustein mit Schnittstelle: <strong>Vorbedingungen</strong> nennen, welcher Lernzustand vorliegen muss;{' '}
          <strong>Nachbedingungen</strong>, welcher danach erreicht ist. Größere Bausteine (R2/R3) besitzen <strong>Slots</strong>, die
          Bausteine kleinerer Reichweite aufnehmen (Schachtelung: <code>R3 ⊃ R2 ⊃ R1</code>). Sechs Operatoren verbinden Bausteine auf
          jeder Reichweite:
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginTop: 14 }}>
          {valuesOf('kompositionsoperator').map((op) => (
            <div key={op.id} className="card" style={{ padding: 16 }}>
              <OperatorGlyph id={op.id} />
              <strong style={{ fontFamily: 'var(--display)', fontSize: 18 }}>{op.label}</strong>
              <p className="muted" style={{ fontSize: 14.5, margin: '4px 0 0' }}>
                {op.definition}
              </p>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 16, marginTop: 18 }}>
          <h3 style={{ marginBottom: 6 }}>Die {lernzustaende.length} Lernzustände als Schnittstelle</h3>
          <p className="muted" style={{ fontSize: 14.5, marginBottom: 10 }}>
            Die Zustände modellieren grobes Zwischenwissen zwischen Phasen (Loibl et al. 2024; Koedinger et al. 2012). Stärkere Zustände
            implizieren schwächere (z. B. impliziert <em>Konzept verstanden und gesichert</em> → <em>Erstwissen erworben</em>).{' '}
            <strong>Wichtig:</strong> Hilfe zählt nicht als Lernen – ein ungeführter KI-Antwortgeber erzeugt keinen Lernzustand.
          </p>
          <ul className="chips">
            {lernzustaende.map((z) => (
              <li key={z.id} className="chip chip-c" title={z.impliziert?.length ? `Impliziert: ${z.impliziert.map((x) => labelOf('lernzustand', x)).join(', ')}` : undefined}>
                {z.label}
                {z.impliziert?.length ? ` (⊃ ${z.impliziert.map((x) => labelOf('lernzustand', x)).join(', ')})` : ''}
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 12 }}>
            <Link to="/planer" className="btn btn-primary btn-sm">
              Im Szenario-Baukasten ausprobieren →
            </Link>
          </div>
        </div>
      </section>

      {/* 4b. W-Raster: nine W-fields times five kinds of statement (live from the data) */}
      <section style={{ marginTop: 42, paddingTop: 32, borderTop: '1px solid var(--rule)' }}>
        <h2>Das W-Raster: neun Fragen, fünf Arten von Aussagen</h2>
        <p style={{ maxWidth: '76ch' }}>
          Unterricht planen heißt klären, wer was von wem, wann, mit wem, wo, wie, womit und wozu lernt (Jank &amp; Meyer
          2002). Die FMT führt diese Fragen als neun W-Felder. Die 13 Facetten beantworten nur das Feld „Methode“, also das
          Wie. In jedem anderen Feld nennt die Situation ihre Rahmenbedingungen, und die Methode sagt, was sie dort beiträgt,
          braucht oder nicht verträgt. So stehen Methode und Lehr-Lern-Situation im selben Raster.
        </p>
        <p style={{ maxWidth: '76ch' }}>
          Jede Angabe über eine Methode gehört zu einer von fünf Arten. Die Art hängt am Inhalt der Angabe, ihre Wirkung in
          der Zuordnung steht daneben. Ausschließen darf nur, was an der Beschreibung ablesbar ist; ein Forschungsbefund zu
          Vorwissen oder Bildungsstufe ist ein Mittelwert und führt zu einer Warnung mit Quelle.
        </p>
        <div className="scroll">
          <table aria-label="Arten von Aussagen">
            <thead>
              <tr>
                <th>Art</th>
                <th>Sagt</th>
                <th>Wirkung in der Zuordnung</th>
              </tr>
            </thead>
            <tbody>
              {(bundle.arten || []).map((a) => (
                <tr key={a.id}>
                  <td style={{ fontFamily: 'var(--display)', fontWeight: 700 }}>{a.name}</td>
                  <td>{a.aussage}</td>
                  <td>{a.wirkung}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 style={{ marginTop: 22 }}>Welche Felder einer Methode wohin gehören</h3>
        <p className="muted" style={{ maxWidth: '76ch', fontSize: 14 }}>
          Zeilen: die neun Fragen. Spalten: die fünf Arten. In den Zellen stehen die Felder der Methodenbeschreibung. Felder
          mit „gegeben“ bringt die Lehrkraft als Rahmenbedingung mit; „Vorschlag“ heißt: Hier schlägt der Baukasten vor.
        </p>
        <div className="scroll">
          <table aria-label="W-Raster">
            <thead>
              <tr>
                <th>W-Feld</th>
                {(bundle.arten || []).map((a) => (
                  <th key={a.id}>{a.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(bundle.wfelder || []).map((w) => (
                <tr key={w.id}>
                  <td>
                    <strong style={{ fontFamily: 'var(--display)' }}>{w.name}</strong>
                    <div className="muted" style={{ fontSize: 13 }}>
                      {w.frage}
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {w.planung === 'vorschlag' ? 'Vorschlag' : 'gegeben'}
                    </div>
                  </td>
                  {(bundle.arten || []).map((a) => {
                    const felder = (bundle.merkmale || []).filter((m) => m.wfeld === w.id && m.art === a.id);
                    return (
                      <td key={a.id} style={{ fontSize: 13 }}>
                        {felder.length
                          ? felder.map((m, i) => (
                              <span key={m.feld}>
                                {i > 0 ? ', ' : ''}
                                <code title={`${WIRKUNG_TEXT[m.wirkung] || m.wirkung}; Grundlage: ${GRUNDLAGE_TEXT[m.grundlage] || m.grundlage}`}>{m.feld}</code>
                              </span>
                            ))
                          : '–'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: 'pointer', fontFamily: 'var(--display)', fontWeight: 600 }}>
            Alle {(bundle.merkmale || []).length} Felder mit Wirkung und Grundlage
          </summary>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>W-Feld</th>
                  <th>Feld</th>
                  <th>Art der Aussage</th>
                  <th>Wirkung</th>
                  <th>Grundlage</th>
                </tr>
              </thead>
              <tbody>
                {(bundle.merkmale || []).map((m) => (
                  <tr key={m.feld}>
                    <td>{(bundle.wfelder || []).find((w) => w.id === m.wfeld)?.name || m.wfeld}</td>
                    <td style={{ fontFamily: 'var(--mono)' }}>{m.feld}</td>
                    <td style={{ fontFamily: 'var(--display)', fontWeight: 700 }}>
                      {(bundle.arten || []).find((a) => a.id === m.art)?.name || m.art}
                    </td>
                    <td>{WIRKUNG_TEXT[m.wirkung] || m.wirkung}</td>
                    <td>{GRUNDLAGE_TEXT[m.grundlage] || m.grundlage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <h3 style={{ marginTop: 22 }}>Wo wird gelernt? Raumtypen und was sie bieten</h3>
        <p style={{ maxWidth: '76ch' }}>
          Eine Methode nennt keinen Raumnamen, sondern Eigenschaften, die sie braucht (Raumbedarf). Ein Raumtyp ist durch
          das beschrieben, was er bietet: Dem Hörsaal fehlt die freie Fläche zum Stehen und Gehen, der Sporthalle der
          Schreibplatz. Im Baukasten lassen sich die Eigenschaften des gewählten Raums abwählen. Nennt die Lehrkraft einen
          Raum, scheiden Methoden aus, deren Bedarf er nicht deckt. Nennt sie keinen, nimmt der Baukasten einen an und sagt
          es; ein angenommener Raum ordnet nur und schließt nichts aus.
        </p>
        <div className="scroll">
          <table aria-label="Raumtypen">
            <thead>
              <tr>
                <th>Raumtyp</th>
                <th>Beschreibung</th>
                <th>Bietet</th>
                <th>Methoden, die dort gehen</th>
              </tr>
            </thead>
            <tbody>
              {valuesOf('raumtyp').map((w) => (
                <tr key={w.id}>
                  <td style={{ fontFamily: 'var(--display)', fontWeight: 700 }}>{w.label}</td>
                  <td style={{ fontSize: 13.5 }}>{w.definition}</td>
                  <td style={{ fontSize: 13.5 }}>
                    {(w.bietet || []).map((x) => raumEigenschaftLabel(x, labelOf)).join(', ')}
                    {w.fachausstattungArt ? ` (${labelOf('fachausstattungart', w.fachausstattungArt)})` : ''}
                  </td>
                  <td>{search ? search.suche({ raum: w.id }).length : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 style={{ marginTop: 22 }}>Raumbedarf und Schriftbedarf</h3>
        <p style={{ maxWidth: '76ch' }}>
          Der Schriftbedarf sagt, ob die Lernenden in der Methode lesen oder schreiben. Können sie es noch nicht, scheiden
          diese Methoden aus. Die Mindestzahl der Termine hält fest, dass manche Methoden Abstand zwischen den Terminen
          brauchen (Cepeda et al. 2006); {bundle.bausteine.filter((b) => b.termineMin).length} Methoden nennen sie.
        </p>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Wert</th>
                <th>Bedeutung</th>
                <th>Methoden</th>
              </tr>
            </thead>
            <tbody>
              {(['raumbedarf', 'schriftbedarf'] as const).flatMap((feld) =>
                valuesOf(feld).map((w) => (
                  <tr key={`${feld}:${w.id}`}>
                    <td style={{ fontFamily: 'var(--display)', fontWeight: 700 }}>
                      {feld === 'raumbedarf' ? 'Raumbedarf' : 'Schriftbedarf'}: {w.label}
                    </td>
                    <td>{w.definition}</td>
                    <td>{bundle.bausteine.filter((b) => (b[feld] || []).includes(w.id)).length}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <h3 style={{ marginTop: 22 }}>Wozu wird gelernt? Zielarten, Ketten und Wissensart je Schritt</h3>
        <p style={{ maxWidth: '76ch' }}>
          Die Zielart wählt die Funktionskette des Ablaufs. Jeder tragende Schritt einer Kette ist an eine Wissensart (D1)
          gebunden: Eine Methode festigt dort nur, was sie auch trägt. Die Zielart legt außerdem fest, woran sich der
          Lernerfolg zeigt (Nachweis). Die Bindung je Schritt ist eine Setzung und lässt sich in den Daten ändern.
        </p>
        <div className="scroll">
          <table aria-label="Zielarten">
            <thead>
              <tr>
                <th>Zielart</th>
                <th>Wissensart</th>
                <th>Nachweis</th>
                <th>Ketten mit Wissensart je Schritt</th>
              </tr>
            </thead>
            <tbody>
              {valuesOf('zielart').map((z) => {
                const ketten = bundle.ketten.filter((k) => (k.zielart || []).includes(z.id));
                return (
                  <tr key={z.id}>
                    <td style={{ fontFamily: 'var(--display)', fontWeight: 700 }}>{z.label}</td>
                    <td style={{ fontSize: 13.5 }}>{(z.wissensart || []).map((x) => labelOf('aufgabenstruktur', x)).join(', ')}</td>
                    <td style={{ fontSize: 13.5 }}>{(z.nachweis || []).map((x) => labelOf('nachweisform', x)).join(', ') || 'offen'}</td>
                    <td style={{ fontSize: 13.5 }}>
                      {ketten.length === 0
                        ? '–'
                        : ketten.map((k) => (
                            <div key={k.id} style={{ marginBottom: 6 }}>
                              <strong>{k.label}</strong>
                              <ol style={{ margin: '2px 0 0', paddingLeft: 18 }}>
                                {k.schritte.map((st) => (
                                  <li key={st.id}>
                                    {st.label}
                                    {st.wissensart?.length ? (
                                      <span className="muted"> – {st.wissensart.map((x) => labelOf('aufgabenstruktur', x)).join(', ')}</span>
                                    ) : null}
                                  </li>
                                ))}
                              </ol>
                            </div>
                          ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ maxWidth: '76ch', fontSize: 14 }}>
          Gesetzt und nicht empirisch geprüft sind: was ein Raumtyp bietet, die Bindung der Wissensart je Schritt und die
          Form des Nachweises je Zielart. Sie stehen als Setzung in den Daten. Zwei unabhängige Kodierende und eine Prüfung
          durch Fachlehrkräfte fehlen noch.
        </p>

        <h3 style={{ marginTop: 22 }}>Fachbezug: Wo ist eine Methode zu Hause?</h3>
        <p style={{ maxWidth: '76ch' }}>
          Jede Methode trägt einen oder mehrere von acht Fachbereichen. „Fachübergreifend“ heißt: ohne Fachbindung überall
          einsetzbar. Zusätzlich kann eine Methode Fachbereiche nennen, in denen sie nicht passt
          ({bundle.bausteine.filter((b) => (b.fachbereichUngeeignet || []).length > 0).length} Methoden tun das). Bei der
          Zuordnung rücken Methoden des erkannten Fachbereichs nach vorn, unpassende nach hinten.
        </p>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Fachbereich</th>
                <th>Umfasst</th>
                <th>Fächer bei OpenEduHub/WLO</th>
                <th>Methoden</th>
              </tr>
            </thead>
            <tbody>
              {valuesOf('fachbereich').map((w) => (
                <tr key={w.id}>
                  <td style={{ fontFamily: 'var(--display)', fontWeight: 700 }}>{w.label}</td>
                  <td>{w.definition}</td>
                  <td style={{ fontSize: 13.5 }}>
                    {oehDisciplinesForFachbereich(bundle.faecher, w.id)
                      .map((f) => f.label)
                      .join(', ') || 'kein Fachfilter'}
                  </td>
                  <td>{bundle.bausteine.filter((b) => (b.fachbereich || []).includes(w.id)).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ maxWidth: '76ch', fontSize: 14 }}>
          Einzelfächer hängen bewusst nicht an den Methoden. Nennt eine Anfrage ein Schul- oder Hochschulfach, bildet eine
          Erkennungsschicht es über die Fachvokabulare von OpenEduHub/WLO auf einen der acht Fachbereiche ab. Dieselbe
          Kennung dient der Suche nach freien Materialien: Ist ein Fach genannt, filtert die Suche bei WirLernenOnline
          nach diesem Fach. Ist nur der Fachbereich bekannt, filtert sie nach allen Fächern der Spalte „Fächer bei
          OpenEduHub/WLO“. Dazu kommt die Bildungsstufe. Im Vokabular sind die Fachbereiche über{' '}
          <code>skos:narrowMatch</code> mit diesen Fächern verknüpft.
        </p>

      </section>

      {/* 4c. Quality layer: what a finding rests on */}
      <section style={{ marginTop: 42, paddingTop: 32, borderTop: '1px solid var(--rule)' }}>
        <h2>Qualitätsschicht: Evidenzbezug</h2>
        <h3 style={{ marginTop: 22 }}>Worauf stützt sich ein Befund?</h3>
        <p style={{ maxWidth: '76ch' }}>
          Jede Evidenzaussage nennt neben dem Grad A bis C auch ihren Bezug. So bleibt sichtbar, ob eine Methode selbst
          untersucht wurde oder ob der Befund von einem Wirkprinzip auf sie übertragen ist.
        </p>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Bezug</th>
                <th>Bedeutung</th>
                <th>Wirkung in der Rangfolge</th>
                <th>Evidenzaussagen</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontFamily: 'var(--display)', fontWeight: 700 }}>Methode</td>
                <td>Studien haben genau diese Methode untersucht.</td>
                <td>Der Grad zählt voll.</td>
                <td>{bundle.bausteine.reduce((n, b) => n + (b.evidenz || []).filter((e) => e.evidenzBezug === 'methode').length, 0)}</td>
              </tr>
              <tr>
                <td style={{ fontFamily: 'var(--display)', fontWeight: 700 }}>Prinzip</td>
                <td>Der Befund gilt einem Wirkprinzip, das die Methode umsetzt (z. B. Abrufübung).</td>
                <td>Ein abgeleiteter Grad A zählt wie Grad B.</td>
                <td>{bundle.bausteine.reduce((n, b) => n + (b.evidenz || []).filter((e) => e.evidenzBezug === 'prinzip').length, 0)}</td>
              </tr>
              <tr>
                <td style={{ fontFamily: 'var(--display)', fontWeight: 700 }}>Ohne Angabe</td>
                <td>Noch nicht eingestuft (Ersterfassung).</td>
                <td>Der Grad zählt wie angegeben.</td>
                <td>{bundle.bausteine.reduce((n, b) => n + (b.evidenz || []).filter((e) => !e.evidenzBezug).length, 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>

      </section>

      {/* 4d. Function chains: roles and time shares */}
      <section style={{ marginTop: 42, paddingTop: 32, borderTop: '1px solid var(--rule)' }}>
        <h2>Funktionsketten: Rollen und Zeitanteile</h2>
        <h3 style={{ marginTop: 22 }}>Wie viel Zeit bekommt welcher Schritt?</h3>
        <p style={{ maxWidth: '76ch' }}>
          Jeder Schritt einer Funktionskette hat eine Rolle: <strong>Rand</strong> (Einstieg oder Abschluss),{' '}
          <strong>Haupt</strong> (die eigentliche Arbeit) oder <strong>Sicherung</strong>. Dazu kommt ein Zeitanteil. Daraus
          verteilt die Zuordnung das Zeitbudget, statt alle Schritte gleich lang zu machen. Wiederholungen in Folgestunden
          zählen nicht zum Budget der geplanten Stunde.
        </p>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Funktionskette</th>
                <th>Schritte mit Rolle und Zeitanteil</th>
              </tr>
            </thead>
            <tbody>
              {bundle.ketten.map((k) => {
                const total = k.schritte.reduce((n, st) => n + (st.zeitanteil || 0), 0);
                return (
                  <tr key={k.id}>
                    <td style={{ fontFamily: 'var(--display)', fontWeight: 700 }}>{k.label}</td>
                    <td>
                      <ul className="chips">
                        {k.schritte.map((st) => (
                          <li
                            key={st.id}
                            className={`chip ${st.rolle === 'haupt' ? 'chip-a' : st.rolle === 'sicherung' ? 'chip-b' : ''}`}
                            title={`Rolle: ${ROLE_LABEL[st.rolle || ''] || 'ohne Angabe'}`}
                          >
                            {st.label} · {ROLE_LABEL[st.rolle || ''] || 'ohne Rolle'}
                            {st.zeitanteil && total ? ` · ${Math.round((st.zeitanteil / total) * 100)} %` : ''}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 5. 5 Stufen der Zuordnung & Rolle des Sprachmodells */}
      <section style={{ marginTop: 42, paddingTop: 32, borderTop: '1px solid var(--rule)' }}>
        <h2>Zuordnung in 5 Stufen &amp; Rolle des Sprachmodells</h2>
        <p style={{ maxWidth: '76ch' }}>
          Auswahl und Prüfung bleiben vollständig in Daten und Regeln – sie arbeiten deterministisch in &lt; 1 ms ohne Sprachmodell. Ein
          optionales Sprachmodell übersetzt lediglich freien Text ins Anfrage-Schema (Schema-validiert) und gestaltet geprüfte Abläufe
          fachlich aus.
        </p>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Stufe</th>
                <th>Leitfrage</th>
                <th>Geprüfte Merkmale</th>
                <th>Wirkung</th>
                <th>Grundlage</th>
              </tr>
            </thead>
            <tbody>
              {MATCH_STAGES.map(([s, q, m, w, g]) => (
                <tr key={s}>
                  <td style={{ fontFamily: 'var(--display)', fontWeight: 700, whiteSpace: 'nowrap' }}>{s}</td>
                  <td>{q}</td>
                  <td>{m}</td>
                  <td><strong>{w}</strong></td>
                  <td className="muted">{g}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ maxWidth: '76ch', marginTop: 12 }}>
          Liegen mehrere Methoden in Stufe 5 praktisch gleichauf, gelten sie als gleichwertig. Der Baukasten wählt dann für
          dieselbe Anfrage immer dieselbe, und <strong>„Anderer Vorschlag“</strong> liefert die nächste gleichwertige
          Kombination. Nennt die Anfrage eine Methode beim Namen, wird sie im passenden Schritt fest eingeplant.
        </p>
        <div className="scroll" style={{ marginTop: 14 }}>
          <table>
            <thead>
              <tr>
                <th>Teilaufgabe</th>
                <th>Sprachmodell nötig?</th>
              </tr>
            </thead>
            <tbody>
              {LLM_BOUNDARY.map(([task, need]) => (
                <tr key={task}>
                  <td><strong>{task}</strong></td>
                  <td>{need}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 6. Live Catalog Analytics Dashboard (200 Methods) */}
      <section style={{ marginTop: 42, paddingTop: 32, borderTop: '1px solid var(--rule)' }}>
        <h2>Auswertungen &amp; Verortung des Katalogs ({bundle.bausteine.length} Methoden live)</h2>
        <p className="muted" style={{ maxWidth: '76ch', marginBottom: 18 }}>
          Alle Grafiken werden live aus dem aktuellen Katalog berechnet. Klicks auf Punkte, Heatmap-Zellen oder Balken führen direkt zu den
          passenden Methoden im Katalog.
        </p>
        <CatalogAnalytics bundle={bundle} valuesOf={valuesOf} labelOf={labelOf} />
      </section>

      {/* 7. Die 13 Kompositionsregeln */}
      <section style={{ marginTop: 42, paddingTop: 32, borderTop: '1px solid var(--rule)' }}>
        <h2>Die 13 Kompositionsregeln (R-00 bis R-12)</h2>
        <p className="muted" style={{ maxWidth: '74ch' }}>
          Jede Regel weist ihre Grundlage aus: <code>formal</code> (Daten-/Strukturkonsistenz), <code>[E]</code> (empirisch belegt),{' '}
          <code>[S]</code> (theoretisch gefolgert) oder <code>[A]</code> (didaktische Setzung). Der Prüfer filtert Pläne – er ersetzt kein
          didaktisches Qualitätsurteil.
        </p>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Regel</th>
                <th>Prüft</th>
                <th>Schwere</th>
                <th>Grundlage</th>
              </tr>
            </thead>
            <tbody>
              {FMT_RULES.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontFamily: 'var(--display)', fontWeight: 700, whiteSpace: 'nowrap' }}>{r.id}</td>
                  <td>{r.prueft}</td>
                  <td>{r.schwere}</td>
                  <td>
                    <span className="basis-tag">{r.grundlage === 'formal' ? 'formal' : `[${r.grundlage}]`}</span>
                    {r.begruendung}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 7b. Passungsregeln (data/regeln.json, live from the bundle) */}
      <section style={{ marginTop: 42, paddingTop: 32, borderTop: '1px solid var(--rule)' }}>
        <h2>Passungsregeln</h2>
        <p style={{ maxWidth: '76ch' }}>
          Die Kompositionsregeln prüfen einen fertigen Ablauf. Die Passungsregeln verbinden die Situation mit der Methode:
          Sie lesen, was die Lehrkraft angibt (Vorwissen, Bildungsstufe, Inhalt, Sprachniveau, Fach, Raum), und sagen, was
          das für eine Methode heißt. Jede Regel nennt ihre Wirkung und ihre Grundlage. Eine Regel mit Grundlage „belegt“
          nennt die Studie, eine Setzung bleibt als Setzung sichtbar. Im Baukasten steht unter jedem Hinweis, welche Regel
          ihn auslöst und worauf sie sich stützt.
        </p>
        <h3 style={{ marginTop: 22 }}>Welche Wirkung hat welche Art</h3>
        <p className="muted" style={{ maxWidth: '76ch', fontSize: 14 }}>
          In dieser Reihenfolge wirken die Angaben in der Rangfolge einer Methode. Ein genannter Wunsch der Lehrkraft steht
          vor den Warnungen.
        </p>
        <div className="scroll">
          <table aria-label="Welche Wirkung hat welche Art">
            <thead>
              <tr>
                <th>Wirkung</th>
                <th>Was in der Zuordnung geschieht</th>
                <th>Art der Aussage</th>
                <th>Passungsregeln</th>
              </tr>
            </thead>
            <tbody>
              {WIRKUNG_REIHE.map(([w, tut]) => {
                const text = WIRKUNG_TEXT[w];
                const arten = (bundle.arten || []).filter((a) => a.wirkung.includes(text));
                const regeln = (bundle.regeln || []).filter((r) => r.wirkung === w);
                return (
                  <tr key={w}>
                    <th scope="row" style={{ fontFamily: 'var(--display)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {text}
                    </th>
                    <td>{tut}</td>
                    <td>{arten.length ? arten.map((a) => a.name).join(', ') : '–'}</td>
                    <td>{regeln.length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <h3 style={{ marginTop: 22 }}>Die {(bundle.regeln || []).length} Passungsregeln</h3>
        <div className="scroll">
          <table aria-label="Passungsregeln">
            <thead>
              <tr>
                <th>Regel</th>
                <th>Sagt</th>
                <th>Wirkung</th>
                <th>Grundlage</th>
              </tr>
            </thead>
            <tbody>
              {(bundle.regeln || []).map((r) => (
                <tr key={r.id}>
                  <td style={{ fontFamily: 'var(--display)', fontWeight: 700 }}>
                    {r.name}
                    <div className="muted" style={{ fontFamily: 'var(--mono)', fontWeight: 400, fontSize: 11.5 }}>
                      {r.id}
                    </div>
                  </td>
                  <td>
                    {r.text.replace(/^\{methode\}/, 'Die Methode').replace(/\{methode\}/g, 'die Methode')}
                    {r.keinTausch && (
                      <div className="muted" style={{ fontSize: 12.5 }}>
                        Warnt und zeigt Hilfe, die Methode bleibt im Ablauf.
                      </div>
                    )}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{WIRKUNG_TEXT[r.wirkung] || r.wirkung}</td>
                  <td>
                    {GRUNDLAGE_TEXT[r.grundlage] || r.grundlage}
                    {r.quelle && (
                      <div className="muted" style={{ fontSize: 12.5 }}>
                        {r.quelle}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 8. Lückenmatrix */}
      <section style={{ marginTop: 42, paddingTop: 32, borderTop: '1px solid var(--rule)' }}>
        <h2>Welche Lücken bestehender Systematiken geschlossen werden</h2>
        <p className="muted" style={{ maxWidth: '74ch' }}>
          Vergleichende Einschätzung (keine empirische Kodierung): ● erfüllt · ◐ teilweise · ○ fehlt. Für die FMT gilt „erfüllt“
          strukturell; die Befüllung und Reliabilitätsprüfung der Evidenzschicht ist laufende Arbeit.
        </p>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Systematik</th>
                {GAP_MATRIX_HEADERS.map((h) => (
                  <th key={h} style={{ textAlign: 'center', fontSize: 13 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GAP_MATRIX_ROWS.map((row) => (
                <tr key={row.name} style={row.fmt ? { borderTop: '2px solid var(--ink)', fontWeight: 700 } : undefined}>
                  <td style={{ fontFamily: 'var(--display)', fontWeight: 700, whiteSpace: 'nowrap' }}>{row.name}</td>
                  {row.vals.map((v, i) => (
                    <td
                      key={i}
                      style={{
                        textAlign: 'center',
                        fontSize: 16,
                        background: v === '●' ? 'var(--dC-soft)' : v === '◐' ? 'var(--dB-soft)' : 'transparent'
                      }}
                    >
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 9. Evidenz, Überholt, Roadmap & Grenzen */}
      <section style={{ marginTop: 42, paddingTop: 32, borderTop: '1px solid var(--rule)' }}>
        <h2>Was die Evidenz trägt &amp; was überholt ist</h2>
        <p className="muted" style={{ maxWidth: '74ch' }}>
          Befunde hängen an Facettenwerten unter Bedingungen, nicht an Methodennamen. <EvidenceBadge grade="A" /> konsistent über ≥ 2
          Meta-Analysen · <EvidenceBadge grade="B" /> eine Meta-Analyse oder heterogen · <EvidenceBadge grade="C" /> Einzelstudien / vorläufig.
        </p>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Facettenmerkmal</th>
                <th>Empirischer Befund</th>
                <th>Geltung &amp; Vorbehalt</th>
                <th>Grad</th>
              </tr>
            </thead>
            <tbody>
              {EVIDENCE_TABLE.map(([feat, finding, scope, g]) => (
                <tr key={feat}>
                  <td style={{ fontFamily: 'var(--display)', fontWeight: 700 }}>{feat}</td>
                  <td>{finding}</td>
                  <td className="muted">{scope}</td>
                  <td>
                    <EvidenceBadge grade={g} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 style={{ marginTop: 28 }}>Überholt, aber im Umlauf</h3>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Verbreitete Behauptung</th>
                <th>Forschungsstand</th>
                <th>Beleg</th>
              </tr>
            </thead>
            <tbody>
              {OBSOLETE.map(([claim, status, ref]) => (
                <tr key={claim}>
                  <td><strong>{claim}</strong></td>
                  <td>{status}</td>
                  <td className="muted">{ref}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="split-2" style={{ marginTop: 24 }}>
          <div className="card" style={{ padding: 18 }}>
            <h3>Vom Entwurf zum Vokabular (Prüfschritte)</h3>
            <ol style={{ paddingLeft: 20, margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ROADMAP.map(([title, desc]) => (
                <li key={title} style={{ fontSize: 14.5 }}>
                  <strong style={{ fontFamily: 'var(--display)' }}>{title}:</strong> {desc}
                </li>
              ))}
            </ol>
          </div>
          <div className="card" style={{ padding: 18 }}>
            <h3>Grenzen &amp; Offenlegung</h3>
            <ul style={{ paddingLeft: 18, margin: '8px 0 0', fontSize: 14.5, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li>Die FMT ist ein prüfbares Beschreibungsmodell, kein empirisch geeichtes Bewertungsinstrument (Kodierübereinstimmung κ ≥ 0,70 steht aus).</li>
              <li>Lernfunktion und Engagementmodus beschreiben das <em>Angebot</em>, nicht den garantierten kognitiven Prozess im Klassenraum.</li>
              <li>Formaler Austausch (<code>ersatz()</code>) sichert Regelkonformität, nicht automatisch gleiche Wirkung (Loibl et al. 2024).</li>
              <li>Die meisten Synthesen stammen aus den USA und der Hochschule; Übertragbarkeit auf deutsche Schulen ist im Einzelfall zu prüfen.</li>
              <li>KI-Evidenz ist jung und instabil; Leistung <em>mit</em> KI zählt nie als Beleg für Lernen <em>ohne</em> KI.</li>
              <li>
                Alle {bundle.bausteine.filter((b) => b.status !== 'kuratiert').length} neu ergänzten Bausteine im aktuellen Katalog (
                {bundle.bausteine.length} Methoden gesamt) tragen transparent den Status <em>Ersterfassung</em>.
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
