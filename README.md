# Facettierte Methodentaxonomie (FMT) – Methodendatenbank, Web-App, API & MCP-Server

Eine offene, maschinenlesbare **Datenbank für 240 Unterrichtsmethoden** im deutschsprachigen Bildungsraum auf Basis der **Facettierten Methodentaxonomie (FMT)** – für Lehrkräfte, Didaktiker:innen und KI-Agents.

- **Autor (Inhalte, Taxonomie & Grafiken):** Jan Schachtschabel
- **Inhalts- & Datenlizenz:** [CC BY 4.0](LICENSE-CONTENT.md) (`https://creativecommons.org/licenses/by/4.0/`)
- **Software-Quellcode:** [Apache License 2.0](LICENSE)

---

## Funktionsumfang

- **Methodenkatalog (240 Methoden):** 22 kuratierte Kernbausteine + 218 breit gestreute Ersterfassungen über alle 12 didaktischen Bereiche, alle Granularitätsebenen (`R1`–`R4`) und alle Aufgaben-/Feedback-/Engagement-Dimensionen (inkl. rein offen-entdeckender, rezeptiv-passiver & summativer Kontrastformate, Psychomotorik, Simulationen und verschachteltem Üben) – jeweils mit vollständigem 13-Facetten-Profil, 5-Achsen-Steuerungsprofil, Durchführungsschritten, Evidenzgrad (mit Geltung & Gegenposition), Piktogramm, Mini-Ablaufgrafik und **live HTTP-geprüften freien Quellenangaben** (`npm run check:links`).
- **Vollständige FMT-Systematik & Live-Auswertungen:** Interaktiver 13-Facetten-Kompass, R×S-Matrix (Reichweite × Beschreibungsstufe), 6 Operator-Grafiken, 11 Lernzustände, 5 Stufen der Zuordnung, Lückenmatrix, Evidenztabelle, B1×A2-Streudiagramm, Reichweite×Lernfunktion-Heatmap, Ansätze×Evidenz-Balken und Schnittstellen-Abdeckung.
- **Extrem schnell durch Caching:** Build-Zeit-Bundle mit SHA-256-Hash, In-Memory-Server-Store mit `ETag`/`304`, sofortiger Browser-Cache mit Hintergrund-Abgleich gegen `/api/v1/meta` (Facettenfilter, Vergleich & Baukasten laufen in < 5 ms lokal im Browser).
- **Modularer Szenario-Baukasten („Didaktische Partitur“ + IMS-LD Verlaufsplan + Live-Zeitband):** Dauerhaft sichtbare Live-Schachtelungsgrafik (`Begleitend`, `R3`, `R2`, `R1`), frei anpassbare Zeiten mit Orientierungswerten in jedem Schritt & Slot (inkl. Auto-Anpassung), umschaltbarer **IMS-LD Verlaufsplan** (Akteur-Tabelle mit direkt verlinkten FMT-Methoden), **Binnendifferenzierung** (FMT-Regelhinweise + KI-Verfeinerung), **WirLernenOnline (WLO) OER-Suche** pro Phase, **KI-Materialgenerator**, verständliche Inline-Prüfmeldungen (`R-00`–`R-12`) mit 1-Klick-Fixes sowie **LMS- & Handout-Exporte** (HTML-Entwurf, Markdown, **IMS Common Cartridge `.imscc`**, **Moodle-XML**, **IMS-LD Szenario-JSON**, SVG, JSON-LD).
- **Günstiger Hybrid-KI-Assistent (optional):** Suche, 5-Stufen-Zuordnung und Validierung arbeiten deterministisch in < 1 ms **ohne Sprachmodell**. Optional übersetzt ein OpenAI-kompatibles Modell (Standard: OpenAI `gpt-6-luna` mit automatischer Unterstützung der GPT-5-/GPT-6-Parameter `max_completion_tokens` & `reasoning_effort`, liest `LLM_API_KEY` oder OS-`OPENAI_API_KEY` bzw. `.env`) Freitext ins Anfrage-Schema und formuliert geprüfte Arrangements zu einer vollständigen Stundenbeschreibung inkl. Quellenverzeichnis aus.
- **MCP-Server & Linked Data:** Remote-MCP (`/mcp` via Streamable HTTP) + lokaler `stdio`-Start, REST-API (`/api/v1/*` + v0.7.0-Aliase), 24 SKOS-Vokabulare (`.ttl`), JSON-LD, JSON Schema und kanonische `w3id.org/fmt/`-Content-Negotiation.

---

## Schnellstart mit Docker

### 1. Hostinger Docker Manager (VPS · „Compose from URL“)

1. Im Hostinger Docker Manager → **Compose** → **Compose from URL** folgende URL einfügen:
   `https://github.com/janschachtschabel/Facettierte-Methodentaxonomie`
2. Anwendungsnamen übernehmen und **bereitstellen** (erster Deploy gelingt sofort ohne Variablen, nutzt das vorgebaute Docker-Hub-Image `janschachtschabel/fmt-methodendatenbank:latest` hinter Hostingers Traefik).
3. Projekt bearbeiten → in `.env` den reinen Hostnamen (ohne `https://`) setzen:
   `DOMAIN=methoden.deine-domain.de` (oder `srvNNNNNN.hstgr.cloud`) → erneut bereitstellen. Traefik holt das Let's-Encrypt-Zertifikat automatisch.
4. Optional: `LLM_API_KEY` leer lassen (Zero-LLM-Standard, `< 5 ms`); Endnutzer können jederzeit in der App unter **⚙ KI-Einstellungen** ihre eigene OpenAI-kompatible KI (OpenAI, Mistral, Gemini, GWDG, OpenRouter, Ollama, LM Studio …) eintragen.

### 2. Lokal selbst bauen (`docker-compose.build.yml`)

```bash
# Ohne LLM-Key (sofort einsatzbereit im schnellen Zero-LLM-Modus auf Port 8080):
docker compose -f docker-compose.build.yml up --build

# Mit optionalem Server-LLM:
cp .env.example .env
# LLM_API_KEY in .env setzen
docker compose -f docker-compose.build.yml up --build
```

Danach erreichbar unter:
- Web-App: `http://localhost:8080/`
- MCP (Streamable HTTP): `http://localhost:8080/mcp`
- REST API Meta: `http://localhost:8080/api/v1/meta`
- Linked Data Katalog: `http://localhost:8080/bausteine/katalog.jsonld`
- Healthcheck: `http://localhost:8080/healthz`

---

## Lokale Entwicklung

```bash
npm install
npm run build      # baut @fmt/core, dist-data/ (SKOS/JSON-LD/Bundle), @fmt/web und @fmt/server
npm test           # führt alle Tests über Core (SKOS/Schema/JSON-LD/100 Methoden), Server (API/MCP/LLM) & Web aus
npm start          # startet den Produktionsserver auf PORT=8080
```

### Lokaler MCP-Server (`stdio`)

```json
{
  "mcpServers": {
    "fmt-methodendatenbank": {
      "command": "node",
      "args": ["apps/server/dist/mcp/stdio.js"]
    }
  }
}
```

### Remote MCP-Server (`Streamable HTTP`)

```json
{
  "mcpServers": {
    "fmt-methodendatenbank": {
      "url": "http://localhost:8080/mcp"
    }
  }
}
```

---

## Architektur & Verzeichnisse

- `data/` – Single Source of Truth unter CC BY 4.0 (`meta.json`, `vocab.json`, `ketten.json`, `crosswalk/`, `beispiele/`, `bausteine/*.json` mit 100 Methoden)
- `packages/fmt-core/` – Abhängigkeitsfreier TypeScript-Kern (`validate`, `suche`, `zuordnung`) & Artefakt-Generator (`dist-data/`)
- `apps/server/` – Fastify-Server (Static SPA, REST API, Linked Data + `w3id.org` Content Negotiation, MCP Streamable HTTP + `stdio`, OpenAI-kompatibler LLM-Assistent + LRU-Cache + BYOK-SSRF-Schutz)
- `apps/web/` – React + TypeScript + Vite SPA im FMT-Editorial-Design mit Browser-Cache-Sync

## Die vier FMT-Leitplanken

1. Der Prüfer ist ein struktureller Filter – ein gültiger Ablauf ist kein Qualitätsurteil.
2. Jede Regelmeldung weist aus, ob sie `formal`, empirisch belegt `[E]`, gefolgert `[S]` oder gesetzt `[A]` ist.
3. Hoch-inferente Facetten (`A1`, `D1`) sind didaktische Einschätzungen, keine objektiven Tatsachen.
4. Evidenzbefunde gelten immer nur mit ihrer genannten Geltung und Gegenposition; die Entscheidung bleibt bei der Lehrkraft.
