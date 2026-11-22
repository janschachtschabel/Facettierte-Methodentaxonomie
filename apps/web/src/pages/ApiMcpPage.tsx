import { useCatalog } from '../data/CatalogContext.js';

export function ApiMcpPage() {
  const { bundle, meta } = useCatalog();
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
          <h2>Verfügbare MCP-Tools &amp; Resources</h2>
          <ul style={{ paddingLeft: 18, fontSize: 15 }}>
            <li><code>search_methods</code> – Facettierte Suche über {totalLabel} Methoden</li>
            <li><code>get_method</code> – Vollständiges Profil inkl. Evidenz &amp; Quellen</li>
            <li><code>compare_methods</code> – Facette-für-Facette-Differenzvergleich</li>
            <li><code>match_scenario</code> – Deterministische 5-Stufen-Zuordnung (Phase oder Ablauf)</li>
            <li><code>validate_arrangement</code> – Regelprüfung R-00 bis R-12 inkl. Grundlagen</li>
            <li><code>suggest_replacements</code> – Formal gültige Ersatzkandidaten an einem Knotenpfad</li>
            <li><code>list_vocabularies</code> – Kontrollierte Codes &amp; Funktionsketten</li>
          </ul>
          <p style={{ fontSize: 14 }} className="muted">
            <strong>Resources:</strong> <code>fmt://catalog/summary</code> · <code>fmt://method/{'{kennung}'}</code> ·{' '}
            <code>fmt://vocab/{'{scheme}'}</code> · <code>fmt://schema/{'{fmt|anfrage}'}</code> · <code>fmt://rules</code>
          </p>
          <p style={{ fontSize: 14, marginBottom: 0 }} className="muted">
            <strong>Prompts:</strong> <code>design_learning_scenario</code> · <code>audit_lesson_plan</code>
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
                <td>Version, SHA-256 <code>versionHash</code>, Bausteine-Anzahl, LLM-Status ({meta?.llmConfigured ? 'aktiv' : 'deterministisch'})</td>
              </tr>
              <tr>
                <td><code>GET /api/v1/catalog</code></td>
                <td>Komplettes Katalog-Bundle mit <code>ETag</code> &amp; <code>304 Not Modified</code></td>
              </tr>
              <tr>
                <td><code>GET /api/v1/methods?text=…&amp;lernfunktion=…</code></td>
                <td>Facettierte Suche</td>
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
                <td>Fachliche Ausgestaltung eines geprüften Arrangements unter 4 Leitplanken</td>
              </tr>
            </tbody>
          </table>
        </div>
        <pre>{`curl -s -X POST ${origin}/api/v1/match \\
  -H "Content-Type: application/json" \\
  -d '{"text":"Sicherung für Klasse 7, 10 Minuten, 28 Schüler, ohne Geräte"}'`}</pre>
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
