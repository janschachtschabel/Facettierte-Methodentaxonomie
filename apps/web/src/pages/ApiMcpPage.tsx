import { useCatalog } from '../data/CatalogContext.js';

export function ApiMcpPage() {
  const { bundle, meta, setLlmSettingsOpen } = useCatalog();
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080';
  const totalMethods = bundle?.bausteine.length ?? null;
  const totalLabel = totalMethods != null ? `alle ${totalMethods}` : 'alle';

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
        {totalMethods != null ? `Alle ${totalMethods}` : 'Alle'} Unterrichtsmethoden, {bundle?.schemes.length ?? 24} SKOS-Vokabulare, die deterministische 5-Stufen-Zuordnung
        (&lt;1 ms, 0 LLM-Tokens) und der 13-Regeln-Validator stehen für externe KI-Agents über <strong>MCP</strong> und{' '}
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
          <h2>Verfügbare MCP-Tools &amp; Resources (15 Tools · Zero-LLM-First)</h2>
          <p className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>
            Alle MCP-Tools antworten standardmäßig <strong>ohne Server-LLM in &lt;5 ms</strong> (Vorfilterung, Regelprüfung,
            Matrix-Scoring &amp; Klassifikation) und liefern bei komplexen Aufgaben ein fertiges <code>llmBriefing</code> für
            das Enduser-LLM. Klassifikations-Engine: <code>{meta?.embeddingsEngine || 'hybrid-bm25-trigram'}</code>.
          </p>
          <ul style={{ paddingLeft: 18, fontSize: 15 }}>
            <li><code>classify_scenario_text</code> – Zero-LLM Freitext-Klassifikation (Regeln + BM25/Trigram + opt. Model2Vec) auf 6 Skalen, Fach/Thema &amp; Matrix-Merkmale</li>
            <li><code>search_methods</code> – Facettierte Suche über {totalLabel} Methoden inkl. semantischer Vorschläge, auch nach <code>fach</code> oder <code>fachbereich</code></li>
            <li><code>get_method</code> – Vollständiges Profil inkl. Evidenz &amp; Quellen (frühere Kennungen werden weitergeleitet)</li>
            <li><code>compare_methods</code> – Facette-für-Facette-Differenzvergleich</li>
            <li><code>match_scenario</code> – Deterministische 5-Stufen-Zuordnung inkl. didaktischem Ansatz &amp; Matrix-Signalen</li>
            <li><code>validate_arrangement</code> – Regelprüfung R-00 bis R-12 inkl. Grundlagen</li>
            <li><code>suggest_replacements</code> – Formal gültige Ersatzkandidaten an einem Knotenpfad</li>
            <li><code>list_vocabularies</code> – Kontrollierte Codes, Funktionsketten &amp; Differenzierungs-Personas</li>
            <li><code>list_differentiation_options</code> – <strong>Eigenständiger Katalog</strong> aller 36 Lernvoraussetzungs-Variablen (115 Ausprägungen), 8 Schnellprofile, Personas &amp; Handlungsebenen (<code>GET /api/v1/differentiation/meta</code>)</li>
            <li><code>search_wlo_oer</code> – Live-OER-Suche auf WLO Prod (<code>redaktion.openeduhub.net</code>) inkl. <code>wwwurl</code>, gefiltert nach Fach oder Fachbereich</li>
            <li><code>score_differentiation_matrix</code> – Normalisierte Binnendifferenzierungsmatrix (−100..+100 %, <code>quickProfileId</code>, Ebenen-/Technikfilter) &amp; alternative Teilgruppen-Methoden</li>
            <li><code>adapt_scenario</code> – <strong>Eigenständige Szenario- &amp; Methoden-Anpassung</strong> (für freie Chat-Entwürfe, einzelne <code>baustein</code>-Methoden &amp; FMT-Arrangements): UDL-Basis, Zielkonflikte + Auflösungen, Methoden-Kontext, FMT-Methoden sowie <code>teilgruppenMethoden</code> und <code>zusatzphasen</code> wie Schritt 3 des Baukastens (<code>POST /api/v1/adapt</code>)</li>
            <li><code>build_scenario_plan</code> – Kompletter Zero-LLM-Szenario-Plan (&lt;5 ms) mit Matrix, parallelen Methoden für Teilgruppen, Zusatzphasen für alle &amp; opt. WLO-OER; mit <code>umfang: "voll"</code> zusätzlich <code>llmBriefing</code>, UDL/Konflikte und JSON-LD</li>
            <li><code>elaborate_scenario</code> – Deterministische Verlaufstabelle + <code>llmBriefing</code> für das Enduser-LLM</li>
            <li><code>generate_phase_material</code> – Druckfertige Material-Strukturvorlage (7 Typen) + <code>llmBriefing</code></li>
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
                  Version, SHA-256 <code>versionHash</code>, Bausteine-Anzahl, Klassifikations-Engine (
                  <code>{meta?.embeddingsEngine || 'hybrid-bm25-trigram'}</code>), Server-LLM (
                  {meta?.llmConfigured ? `aktiv: ${meta.llmModel}` : 'Zero-LLM-Standard'})
                </td>
              </tr>
              <tr>
                <td><code>POST /api/v1/classify</code></td>
                <td>Zero-LLM Freitext-Klassifikation auf 6 Skalen, Fach/Thema, Methoden &amp; Matrix-Merkmale</td>
              </tr>
              <tr>
                <td><code>POST /api/v1/plan</code></td>
                <td>Zero-LLM End-to-End-Vorfilterung (&lt;5 ms): Arrangement, Matrix, Tabelle, <code>teilgruppenMethoden</code>, <code>zusatzphasen</code> &amp; fertiges <code>llmBriefing</code> (mit <code>umfang: "voll"</code>)</td>
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
                  fachübergreifende, ohne ungeeignete; <code>fachbereich=a,b</code>: streng nur diese Fachbereiche
                </td>
              </tr>
              <tr>
                <td><code>GET /api/v1/methods/:kennung</code></td>
                <td>Einzelne Methode; frühere Kennungen führen zur aktuellen Methode</td>
              </tr>
              <tr>
                <td><code>POST /api/v1/adapt</code></td>
                <td>
                  Anpassung an Lerngruppen: UDL-Basis, Zielkonflikte, Maßnahmen je Phase, <code>teilgruppenMethoden</code> und{' '}
                  <code>zusatzphasen</code> (Gruppe mit <code>id: "regel"</code> = Regelgruppe)
                </td>
              </tr>
              <tr>
                <td><code>GET /api/v1/differentiation/meta</code></td>
                <td>Lernvoraussetzungs-Merkmale, Schnellprofile, Personas und Handlungsebenen</td>
              </tr>
              <tr>
                <td><code>POST /api/v1/match</code> (Alias: <code>POST /zuordnung</code>)</td>
                <td>5-Stufen-Zuordnung (Freitext oder strukturiertes Schema)</td>
              </tr>
              <tr>
                <td><code>POST /api/v1/validate</code></td>
                <td>Prüfung eines Arrangements gegen R-00..R-12</td>
              </tr>
              <tr>
                <td><code>POST /api/v1/replacements</code></td>
                <td>Austausch-Kandidaten (<code>ersatz()</code>) für einen Knotenpfad</td>
              </tr>
              <tr>
                <td><code>POST /api/v1/assistant/translate</code></td>
                <td>Hybrid LLM Freitext → Schema (mit automatischem Regel-Fallback &amp; LRU-Cache)</td>
              </tr>
              <tr>
                <td><code>POST /api/v1/assistant/elaborate</code></td>
                <td>Thematische Verlaufstabelle + ausformulierter Unterrichtsentwurf unter 4 Leitplanken</td>
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
