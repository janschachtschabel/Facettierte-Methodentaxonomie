import type { ReactNode } from 'react';
import { MCP_HINWEISE } from '@fmt/core';
import { useCatalog } from '../data/CatalogContext.js';
import { katalogZahlenText } from '../data/katalogZahlen.js';

/** Request and answer fields added by FMT 2.0 (where they are read or returned). */
const FMT2_FELDER: Array<[string, string, ReactNode]> = [
  ['planungsprofil', 'Anfrage und Antwort', 'schule, berufsschule, betrieb, hochschule oder erwachsenenbildung. Ohne Angabe folgt das Profil aus der Bildungsstufe (in der Berufsbildung auch aus „Betrieb“ im Text); die Antwort nennt das Profil, ein angenommenes zusätzlich unter pflichtangaben.'],
  ['begleitziel', 'Anfrage', 'sprache, sozial, selbstregulation (auch als Liste). Wählt nie die Kette, ordnet nur unter gleichwertigen Methoden.'],
  ['termine', 'Anfrage', 'Zahl der Termine. Methoden mit termineMin brauchen mehrere; ein Begleitziel in einer einzelnen Stunde meldet die Regel begleitziel-braucht-termine.'],
  ['nachweis', 'Anfrage und Antwort', 'Form der Überprüfung (etwa schriftlich, praktisch). Ohne Angabe trägt die Zielart sie; die Antwort nennt Formen, Quelle und Grund.'],
  [
    'raum',
    'Anfrage',
    <>
      Raumtyp (früher <code>lernort</code>, das alte Feld gilt weiter); dazu <code>raumBietet</code> und <code>fachausstattungArt</code>.
    </>
  ],
  ['ohneSchrift', 'Anfrage', 'lesen oder schreiben: Methoden, die das brauchen, kommen nicht in Frage.'],
  ['pflichtangaben', 'Antwort', 'Welche der sechs Pflichtangaben fehlen (fehlt) und was dafür angenommen ist (angenommen: Feld, Wert, Grund).'],
  ['regelmeldungen', 'Antwort', 'Jede Meldung einer Passungsregel mit regel, wirkung, grundlage, quelle, text und der Methode, wenn sie eine betrifft.'],
  ['begleitstrang', 'Antwort', 'Je Begleitziel (sozial, selbstregulation) ein kurzer Vorschlag am Ende der Stunde mit Methode, Dauer und Grund. Er steht nicht im Ablauf.'],
  ['genannteHilfen', 'Antwort', 'Im Text genannte Hilfen (Eintragsart hilfe): nie eine Phase, sie gehören zu einer Methode.'],
  ['entwurf', 'Antwort (umfang „voll“)', 'Entwurf mit den sieben Kernfeldern in den Begriffen des Planungsprofils, dazu Spalten des Verlaufsplans und Module. In methodenDetails steht je Methode status; „entwurf“ heißt Ersterfassung, noch nicht kuratiert.'],
  ['teilgruppenImpulse', 'Antwort von POST /api/v1/adapt', 'Je Phase und Teilgruppe die Entscheidung antwort (passt; hilfe: die geplante Methode bleibt, die Gruppe bekommt eine Hilfe; tausch) mit beleg (Grund, Merkmal, Grundlage, Quelle) und hilfen samt abbau; gesperrte Merkmale (Lerntypen) stehen unter gesperrt.'],
  ['ohneMethode', 'Antwort von POST /api/v1/adapt (je teilgruppenImpulse)', 'true, wenn für die Phase keine FMT-Methode geplant ist (freier Text ohne Bausteine). Dann ist keine Passung geprüft: antwort hilfe nennt nur die Hilfen der Matrix für die Gruppe, keine Entscheidung über eine Methode.']
];

/** Further request fields of FMT 2.0 (same names in REST and MCP; the list of the core is GET /api/v1/fields). */
const FMT2_ANFRAGEFELDER: Array<[string, ReactNode]> = [
  [
    'zielart',
    <>
      Art des Lernziels: fakten, konzepte, prozeduren, problemloesen, bewegung, kondition, urteilen, gestalten, handlung. Daraus
      folgt die Funktionskette (etwa <code>handlung</code> → vollständige Handlung); die alten Codes (psychomotorik,
      einstellungen) gelten weiter. <code>zieltyp</code> wählt eine Kette direkt.
    </>
  ],
  ['komplexitaet', 'Komplexität des Inhalts (gering, mittel, hoch); Methoden mit hoher Eigenverantwortung warnen bei hoher Komplexität.'],
  ['sprachniveau', 'Sprachniveau der ganzen Lerngruppe (A1 bis C2); Methoden mit viel Schrift warnen bei niedrigem Niveau. Nicht für eine Teilgruppe.'],
  ['lehrende', 'Anzahl der Lehrenden im Raum (Teamteaching: 2). Mit einer Lehrkraft darf nur eine von zwei parallelen Methoden sie binden (Regel lehrkraft-nicht-doppelt); mit zwei entfällt das.'],
  ['einheit', 'Einheit, zu der die Stunde gehört (Lernfeld, Unterrichtsreihe, Modul); sie steht in den Rahmendaten des Entwurfs.'],
  ['bewertet', 'true, wenn die Stunde oder ihr Ergebnis bewertet wird; der Entwurf nennt es.'],
  ['raumBietet', 'Raumeigenschaften, die der Raum abweichend vom Raumtyp bietet (z. B. bewegungsflaeche, wandflaeche).'],
  ['fachausstattungArt', 'Art der Fachausstattung, die der Raum bietet (Sport, Musik, Labor, Werkstatt, Küche, Rechner).']
];

/** Fields of a method (catalogue entry) added by FMT 2.0. */
const FMT2_METHODENFELDER: Array<[string, string]> = [
  ['eintragsart', 'methode (trägt eine Phase) oder hilfe (stützt Lernende in einer Methode, nie eine eigene Phase).'],
  ['raumbedarf', 'Raumeigenschaften, die die Methode braucht (schreibplatz, stellflaeche, bewegungsflaeche, wandflaeche, fachausstattung, aussenort).'],
  ['schriftbedarf', 'liest und/oder schreibt: ob die Lernenden lesen oder schreiben; Gegenstück der Anfrage ist ohneSchrift.'],
  ['termineMin', 'Wie viele Termine die Methode mindestens braucht; Gegenstück der Anfrage ist termine.'],
  ['eignungsgrund', 'Je stufe, vorwissen, fachbereich der Grund einer Eignungsaussage mit grundlage (E belegt, S gefolgert, A Setzung) und quelle.'],
  ['evidenz[].evidenzBezug', 'methode, prinzip oder programm: worauf sich ein Befund bezieht; programm heißt ganze Programme, nicht die einzelne Phase.']
];

const FMT2_ANFRAGE = JSON.stringify(
  {
    text: 'Englisch Klasse 7, Wortschatz Freizeit, 45 Minuten, 26 Lernende',
    planungsprofil: 'schule',
    begleitziel: ['sozial', 'sprache'],
    umfang: 'kompakt'
  },
  null,
  2
);

/** Shortened answer of the request above (values as the server returns them). */
const FMT2_ANTWORT = JSON.stringify(
  {
    planungsprofil: { id: 'schule', angenommen: false, dokument: 'Unterrichtsentwurf', einheit: 'Unterrichtsstunde' },
    pflichtangaben: {
      fehlt: ['raum'],
      angenommen: [{ feld: 'raum', wert: 'klassenraum', grund: 'Raum nicht angegeben: Klassenraum angenommen.' }]
    },
    regelmeldungen: [
      {
        regel: 'begleitziel-braucht-termine',
        wirkung: 'weist-hin',
        grundlage: 'E',
        quelle: 'Dignath & Büttner 2008; Durlak et al. 2011; Lee et al. 2015',
        text: 'Wirkungen auf soziales Lernen und Fach- und Bildungssprache sind für Programme über mehrere Wochen belegt. Eine einzelne Stunde genügt dafür nicht.'
      }
    ],
    begleitstrang: [{ begleitziel: 'sozial', baustein: 'votum-ei', dauerMin: 3, position: 'ende', grund: 'Trägt das Begleitziel soziales Lernen: … Ein Vorschlag zum Übernehmen; er steht nicht im Ablauf.' }],
    methodenDetails: [{ kennung: 'gruppenbildung-zufall', status: 'entwurf', '…': '…' }]
  },
  null,
  2
);

export function ApiMcpPage() {
  const { bundle, meta, setLlmSettingsOpen } = useCatalog();
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080';
  const totalLabel = bundle ? `alle ${katalogZahlenText(bundle.bausteine)}` : 'alle Methoden';

  const mcpHttpConfig = JSON.stringify(
    {
      mcpServers: {
        'fmt-methodendatenbank': {
          url: `${origin}/mcp`
        }
      }
    },
    null,
    2
  );

  const mcpStdioConfig = JSON.stringify(
    {
      mcpServers: {
        'fmt-methodendatenbank-local': {
          command: 'node',
          args: ['apps/server/dist/mcp/stdio.js']
        }
      }
    },
    null,
    2
  );

  return (
    <div className="page-section">
      <h1>API, MCP &amp; Linked Data (OER)</h1>
      <p className="muted" style={{ maxWidth: '72ch' }}>
        {bundle ? `Alle ${katalogZahlenText(bundle.bausteine)}` : 'Alle Unterrichtsmethoden'},{' '}
        {/* One SKOS file per scheme plus the vocabulary of the function chains (as built in dist-data). */}
        {bundle ? `${bundle.schemes.length + 1} SKOS-Vokabulare` : 'die SKOS-Vokabulare'}, die deterministische Zuordnung in fünf
        Stufen mit Passungsregeln (&lt;1 ms, 0 LLM-Tokens) und die Prüfung gegen die Kompositionsregeln R-00 bis R-12 stehen für externe KI-Agents über <strong>MCP</strong> und{' '}
        <strong>REST / JSON-LD</strong> offen unter <strong>CC BY 4.0 (Jan Schachtschabel)</strong> bereit.
      </p>

      <section className="split-2" style={{ marginTop: 22 }}>
        <div className="card" style={{ padding: 18 }}>
          <h2>MCP-Server (Model Context Protocol)</h2>
          <p style={{ fontSize: 15 }}>
            <strong>Remote Streamable HTTP:</strong> <code>{origin}/mcp</code>
          </p>
          <pre>{mcpHttpConfig}</pre>
          <p style={{ fontSize: 15, marginTop: 12 }}>
            <strong>Lokaler stdio-Start (z. B. Claude Desktop / Cursor / Antigravity):</strong>
          </p>
          <pre>{mcpStdioConfig}</pre>
        </div>

        <div className="card" style={{ padding: 18 }}>
          <h2>Verfügbare MCP-Tools &amp; Resources (15 Tools · ohne LLM zuerst)</h2>
          <p className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>
            Alle MCP-Tools antworten standardmäßig <strong>ohne Server-LLM in &lt;5 ms</strong> (Vorfilterung, Regelprüfung,
            Matrix-Scoring &amp; Klassifikation) und liefern bei komplexen Aufgaben ein fertiges <code>llmBriefing</code> für
            das Enduser-LLM. Klassifikations-Engine: <code>{meta?.embeddingsEngine || 'hybrid-bm25-trigram'}</code>.
          </p>
          <ul style={{ paddingLeft: 18, fontSize: 15 }}>
            <li><code>classify_scenario_text</code> – Freitext ohne LLM einordnen (Regeln + BM25/Trigram + opt. Model2Vec): Filterskalen, Fach/Thema, Matrix-Merkmale und <code>pflichtangaben</code> (was fehlt, was angenommen würde)</li>
            <li><code>search_methods</code> – Facettierte Suche über {totalLabel}, auch nach <code>eintragsart</code> (Methoden oder Hilfen), <code>raum</code>, <code>raumbedarf</code>, <code>schriftbedarf</code>, <code>fach</code> oder <code>fachbereich</code></li>
            <li><code>get_method</code> – Vollständiges Profil mit Bedarf, Eignung (<code>eignungsgrund</code>), Eintragsart, Evidenz samt Bezug und der Einordnung in Funktionsketten (frühere Kennungen werden weitergeleitet)</li>
            <li><code>compare_methods</code> – Vergleich zweier Einträge nach Facetten, Bedarf, Eignung, Eintragsart und Evidenzbezug</li>
            <li><code>match_scenario</code> – Deterministische Zuordnung in fünf Stufen (Kette nach Zielart, Bindung der Wissensart, Bedarf, Passungsregeln) mit <code>pflichtangaben</code>, <code>regelmeldungen</code>, <code>begleitstrang</code> und <code>planungsprofil</code></li>
            <li><code>validate_arrangement</code> – Regelprüfung R-00 bis R-12 inkl. Grundlagen (die Passungsregeln prüft die Zuordnung)</li>
            <li><code>suggest_replacements</code> – Ersatzkandidaten an einem Knotenpfad: nur Methoden, Bedarf in der Situation, Wissensart des Kettenschritts</li>
            <li><code>list_vocabularies</code> – Kontrollierte Codes, W-Felder, Arten, Merkmale, Funktionsketten mit Wissensart je Schritt, Passungsregeln, Raumtypen, Zielarten, Planungsprofile und Differenzierungs-Personas</li>
            <li><code>list_differentiation_options</code> – <strong>Eigenständiger Katalog</strong> der Lernvoraussetzungs-Merkmale, Schnellprofile, Personas &amp; Handlungsebenen, mit Tausch oder Hilfe je Merkmal und ohne gesperrte Merkmale (<code>GET /api/v1/differentiation/meta</code>)</li>
            <li><code>search_wlo_oer</code> – Live-OER-Suche auf WLO Prod (<code>redaktion.openeduhub.net</code>) inkl. <code>wwwurl</code>, gefiltert nach Fach oder Fachbereich</li>
            <li><code>score_differentiation_matrix</code> – Normalisierte Binnendifferenzierungsmatrix (−100..+100 %, <code>quickProfileId</code>, Ebenen-/Technikfilter) mit Tausch oder Hilfe je Merkmal</li>
            <li><code>adapt_scenario</code> – <strong>Eigenständige Szenario- &amp; Methoden-Anpassung</strong>: je Phase und Teilgruppe passt, Hilfe oder Tausch mit <code>beleg</code> und <code>abbau</code>, <code>gesperrt</code>, <code>regelmeldungen</code>, dazu UDL-Basis, Zielkonflikte, <code>teilgruppenMethoden</code> und <code>zusatzphasen</code> wie Schritt 3 des Baukastens (<code>POST /api/v1/adapt</code>)</li>
            <li><code>build_scenario_plan</code> – Kompletter Szenario-Plan ohne LLM (&lt;5 ms) mit <code>pflichtangaben</code>, <code>regelmeldungen</code>, Begleitstrang, parallelen Methoden für Teilgruppen und opt. WLO-OER; mit <code>umfang: "voll"</code> zusätzlich der <code>entwurf</code>, <code>llmBriefing</code> und JSON-LD</li>
            <li><code>elaborate_scenario</code> – Entwurf mit den sieben Kernfeldern in den Begriffen des Planungsprofils, Verlaufstabelle und <code>llmBriefing</code> für das Enduser-LLM</li>
            <li><code>generate_phase_material</code> – Druckfertige Material-Strukturvorlage + <code>llmBriefing</code></li>
          </ul>
          <p style={{ fontSize: 14 }} className="muted">
            <strong>Resources:</strong> <code>fmt://catalog/summary</code> · <code>fmt://differentiation/options</code> ·{' '}
            <code>fmt://method/{'{kennung}'}</code> · <code>fmt://vocab/{'{scheme}'}</code> ·{' '}
            <code>fmt://schema/{'{fmt|anfrage}'}</code> · <code>fmt://rules</code>
          </p>
          <p style={{ fontSize: 14, marginBottom: 0 }} className="muted">
            <strong>Prompts:</strong> <code>design_learning_scenario</code> · <code>adapt_lesson_differentiation</code> ·{' '}
            <code>audit_lesson_plan</code>
          </p>
        </div>
      </section>

      <section className="card" style={{ padding: 18, marginTop: 24 }}>
        <h2>REST API &amp; Caching</h2>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Endpunkt</th>
                <th>Zweck</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>GET /api/v1/meta</code></td>
                <td>
                  Version, SHA-256 <code>versionHash</code>, Anzahl der Methoden und Hilfen, <code>wfelder</code>, <code>arten</code>,{' '}
                  <code>merkmale</code>, <code>regeln</code> (Passungsregeln), <code>raumtypen</code>, <code>zielarten</code>,{' '}
                  <code>ketten</code> mit Wissensart je Schritt, <code>teilgruppen</code> (Tausch oder Hilfe),{' '}
                  <code>planungsprofile</code>, Klassifikations-Engine (
                  <code>{meta?.embeddingsEngine || 'hybrid-bm25-trigram'}</code>), Server-LLM (
                  {meta?.llmConfigured ? `aktiv: ${meta.llmModel}` : 'Zero-LLM-Standard'})
                </td>
              </tr>
              <tr>
                <td><code>POST /api/v1/classify</code></td>
                <td>Freitext ohne LLM einordnen: Filterskalen, Fach/Thema, Methoden, Matrix-Merkmale und <code>pflichtangaben</code></td>
              </tr>
              <tr>
                <td><code>POST /api/v1/plan</code></td>
                <td>Plan ohne LLM (&lt;5 ms) mit allen Anfragefeldern: Arrangement, <code>pflichtangaben</code>, <code>regelmeldungen</code>, <code>begleitstrang</code>, <code>teilgruppenMethoden</code>, <code>zusatzphasen</code>; mit <code>umfang: "voll"</code> der <code>entwurf</code> und ein fertiges <code>llmBriefing</code></td>
              </tr>
              <tr>
                <td><code>POST /api/v1/assistant/briefing</code></td>
                <td>Erzeugt in &lt;2 ms vorab gefilterte Prompt-Pakete (<code>translate</code>, <code>elaborate</code>, <code>differentiate</code>, <code>material</code>) fürs Enduser-LLM</td>
              </tr>
              <tr>
                <td><code>GET /api/v1/catalog</code></td>
                <td>Komplettes Katalog-Bundle mit <code>ETag</code> &amp; <code>304 Not Modified</code></td>
              </tr>
              <tr>
                <td><code>GET /api/v1/methods?text=…&amp;lernfunktion=…</code></td>
                <td>
                  Facettierte Suche. <code>fach=Physik</code> oder <code>fuerFachbereich=…</code>: Methoden des Fachbereichs und
                  fachübergreifende, ohne ungeeignete; <code>fachbereich=a,b</code>: streng nur diese Fachbereiche. Dazu{' '}
                  <code>eintragsart</code> (methode, hilfe), <code>raum</code> (Raumtyp deckt den Bedarf), <code>raumbedarf</code>,{' '}
                  <code>ohneRaumbedarf</code>, <code>schriftbedarf</code>, <code>ohneSchrift</code> (lesen, schreiben) und{' '}
                  <code>termine</code>
                </td>
              </tr>
              <tr>
                <td><code>GET /api/v1/methods/:kennung</code></td>
                <td>Einzelne Methode; frühere Kennungen führen zur aktuellen Methode</td>
              </tr>
              <tr>
                <td><code>POST /api/v1/adapt</code></td>
                <td>
                  Anpassung an Lerngruppen: je Phase und Teilgruppe passt, Hilfe oder Tausch mit <code>beleg</code> und{' '}
                  <code>abbau</code>, <code>gesperrt</code>, <code>regelmeldungen</code>, dazu UDL-Basis, Zielkonflikte,{' '}
                  <code>teilgruppenMethoden</code> und <code>zusatzphasen</code> (Gruppe mit <code>id: "regel"</code> = Regelgruppe)
                </td>
              </tr>
              <tr>
                <td><code>GET /api/v1/differentiation/meta</code></td>
                <td>Lernvoraussetzungs-Merkmale, Schnellprofile, Personas und Handlungsebenen</td>
              </tr>
              <tr>
                <td><code>POST /api/v1/match</code> (Alias: <code>POST /zuordnung</code>)</td>
                <td>Zuordnung in fünf Stufen (Freitext oder strukturiertes Schema) mit <code>pflichtangaben</code>, <code>regelmeldungen</code> und <code>begleitstrang</code></td>
              </tr>
              <tr>
                <td><code>POST /api/v1/validate</code></td>
                <td>Prüfung eines Arrangements gegen R-00..R-12</td>
              </tr>
              <tr>
                <td><code>POST /api/v1/replacements</code></td>
                <td>Ersatzkandidaten für einen Knotenpfad: nur Methoden, Bedarf in der Situation (<code>raum</code>, <code>ohneSchrift</code>, <code>termine</code>), Wissensart des Kettenschritts</td>
              </tr>
              <tr>
                <td><code>POST /api/v1/assistant/translate</code></td>
                <td>Hybrid LLM Freitext → Schema (mit automatischem Regel-Fallback &amp; LRU-Cache)</td>
              </tr>
              <tr>
                <td><code>POST /api/v1/assistant/elaborate</code></td>
                <td>Entwurf mit den sieben Kernfeldern (Begriffe des Planungsprofils), Verlaufstabelle und ausformulierter Entwurf unter 4 Leitplanken</td>
              </tr>
              <tr>
                <td><code>POST /api/v1/assistant/differentiate</code></td>
                <td>KI-Verfeinerung der Binnendifferenzierungsmatrix für alle Phasen</td>
              </tr>
              <tr>
                <td><code>POST /api/v1/assistant/material</code></td>
                <td>KI-Materialgenerator (Arbeitsblatt, Quiz, Checkliste, Karten)</td>
              </tr>
              <tr>
                <td><code>POST /api/v1/oer/wlo-search</code></td>
                <td>
                  Live-OER-Suche auf WirLernenOnline Prod (<code>redaktion.openeduhub.net</code>) inkl. <code>wwwurl</code>.
                  Filter: <code>fach</code>, sonst <code>fachbereich</code> (alle OEH-Fächer des Bereichs), dazu{' '}
                  <code>bildungsstufe</code> und <code>inhaltstyp</code>
                </td>
              </tr>
              <tr>
                <td><code>POST /api/v1/differentiation/score</code></td>
                <td>Deterministische Binnendifferenzierungsmatrix (115 Ausprägungen × 172 Maßnahmen, je Zelle −2..+2 Punkte, normalisiert −100..+100 %)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <pre>{`curl -s -X POST ${origin}/api/v1/plan \\
  -H "Content-Type: application/json" \\
  -d '{"text":"Kooperatives Lernen 2 x 45 Minuten Klasse 7 mit DaZ-Kindern zum Thema Nachhaltigkeit"}'`}</pre>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 14 }}>
          <span className="muted">
            Eigene OpenAI-kompatible KI-Anbindung (OpenAI, Mistral, Gemini, GWDG Academic Cloud, Ollama, LM Studio, LiteLLM) direkt in der App nutzen:
          </span>
          <button type="button" className="btn btn-sm" onClick={() => setLlmSettingsOpen(true)}>
            ⚙ KI-Einstellungen öffnen
          </button>
        </div>
      </section>

      <section className="card" style={{ padding: 18, marginTop: 24 }}>
        <h2>Neue Felder der FMT 2.0</h2>
        <p style={{ fontSize: 15, maxWidth: '76ch' }}>
          Die Anfragefelder gelten gleich für <code>POST /api/v1/plan</code>, <code>POST /api/v1/match</code> und die
          MCP-Tools <code>match_scenario</code> und <code>build_scenario_plan</code>; die vollständige Liste mit Werten
          liefert <code>GET /api/v1/fields</code>. Alte Aufrufe
          laufen weiter: <code>lernort</code> gilt als <code>raum</code>, die sechs alten Codes in <code>zielart</code> und der
          Raumtyp <code>fachraum</code> bleiben gültig.
        </p>
        <div className="scroll">
          <table aria-label="Neue Felder der FMT 2.0">
            <thead>
              <tr>
                <th>Feld</th>
                <th>Wo</th>
                <th>Bedeutung</th>
              </tr>
            </thead>
            <tbody>
              {FMT2_FELDER.map(([feld, wo, text]) => (
                <tr key={feld}>
                  <td>
                    <code>{feld}</code>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{wo}</td>
                  <td>{text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 style={{ marginTop: 18 }}>Weitere Anfragefelder</h3>
        <div className="scroll">
          <table aria-label="Weitere Anfragefelder der FMT 2.0">
            <thead>
              <tr>
                <th>Feld</th>
                <th>Bedeutung</th>
              </tr>
            </thead>
            <tbody>
              {FMT2_ANFRAGEFELDER.map(([feld, text]) => (
                <tr key={feld}>
                  <td>
                    <code>{feld}</code>
                  </td>
                  <td>{text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 style={{ marginTop: 18 }}>Neue Felder einer Methode</h3>
        <div className="scroll">
          <table aria-label="Neue Felder einer Methode">
            <thead>
              <tr>
                <th>Feld</th>
                <th>Bedeutung</th>
              </tr>
            </thead>
            <tbody>
              {FMT2_METHODENFELDER.map(([feld, text]) => (
                <tr key={feld}>
                  <td>
                    <code>{feld}</code>
                  </td>
                  <td>{text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 15, marginTop: 12 }}>
          <strong>Beispielanfrage:</strong>
        </p>
        <pre aria-label="Beispielanfrage FMT 2.0">{`curl -s -X POST ${origin}/api/v1/plan \\
  -H "Content-Type: application/json" \\
  -d '${FMT2_ANFRAGE}'`}</pre>
        <p style={{ fontSize: 15, marginTop: 12 }}>
          <strong>Auszug der Antwort</strong> (gekürzt):
        </p>
        <pre aria-label="Auszug der Antwort">{FMT2_ANTWORT}</pre>
      </section>

      <section className="card" style={{ padding: 18, marginTop: 24 }}>
        <h2>Was die KI beim Nutzer erfragen soll</h2>
        <p style={{ fontSize: 15, maxWidth: '76ch' }}>
          Der MCP-Server gibt einer aufrufenden KI diese Hinweise mit (<code>instructions</code>). Sie gelten genauso für
          einen Aufruf über REST: Fehlt eine Pflichtangabe, nennt die Antwort sie unter <code>pflichtangaben.fehlt</code>,
          und was angenommen wurde, steht unter <code>pflichtangaben.angenommen</code>.
        </p>
        <pre aria-label="Hinweise des MCP-Servers" style={{ whiteSpace: 'pre-wrap' }}>
          {MCP_HINWEISE}
        </pre>
      </section>

      <section className="card" style={{ padding: 18, marginTop: 24 }}>
        <h2>Linked Data, SKOS &amp; JSON-LD (CC BY 4.0)</h2>
        <p style={{ fontSize: 15 }}>
          Kanonische <code>w3id.org/fmt/</code>-Pfade (<code>/baustein/:kennung</code>, <code>/vocab/:scheme/</code>,{' '}
          <code>/ns</code>) unterstützen <code>Accept</code>-Content-Negotiation (<code>application/ld+json</code>,{' '}
          <code>text/turtle</code>, <code>text/html</code>).
        </p>
        <ul className="chips">
          <li><a className="btn btn-sm" href="/bausteine/katalog.jsonld" target="_blank" rel="noreferrer">katalog.jsonld</a></li>
          <li><a className="btn btn-sm" href="/context.jsonld" target="_blank" rel="noreferrer">context.jsonld</a></li>
          <li><a className="btn btn-sm" href="/ontologie.ttl" target="_blank" rel="noreferrer">ontologie.ttl</a></li>
          <li><a className="btn btn-sm" href="/vocabs/lernfunktion.ttl" target="_blank" rel="noreferrer">vocabs/lernfunktion.ttl</a></li>
          <li><a className="btn btn-sm" href="/vocabs/ansatz.ttl" target="_blank" rel="noreferrer">vocabs/ansatz.ttl</a></li>
          <li><a className="btn btn-sm" href="/schema/fmt.schema.json" target="_blank" rel="noreferrer">fmt.schema.json</a></li>
          <li><a className="btn btn-sm" href="/schema/anfrage.schema.json" target="_blank" rel="noreferrer">anfrage.schema.json</a></li>
        </ul>
      </section>
    </div>
  );
}
