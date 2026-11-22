# Facettierte Methodentaxonomie (FMT) – Methodendatenbank, Web-App, REST-API & MCP-Server

Eine offene, maschinenlesbare **Datenbank für 290 Unterrichtsmethoden** im deutschsprachigen Bildungsraum auf Basis der **Facettierten Methodentaxonomie (FMT)** – für Lehrkräfte, Didaktiker:innen und KI-Agents.

- **Autor (Inhalte, Taxonomie & Grafiken):** Jan Schachtschabel
- **Inhalts- & Datenlizenz:** [CC BY 4.0](LICENSE-CONTENT.md) (`https://creativecommons.org/licenses/by/4.0/`)
- **Software-Quellcode:** [Apache License 2.0](LICENSE)
- **Ausführlicher Betriebs-, Deployment- & Konfigurations-Guide:** [docs/DEPLOYMENT-UND-KONFIGURATION.md](docs/DEPLOYMENT-UND-KONFIGURATION.md)

---

## Funktionsumfang

- **Methodenkatalog (290 Methoden, 24 SKOS-Vokabulare):** Kuratierte Kernbausteine + breit gestreute Ersterfassungen über alle 12 didaktischen Ansätze, Granularitätsebenen (`R1`–`R4`) und Facetten – jeweils mit vollständigem 13-Facetten-Profil, 5-Achsen-Steuerungsprofil, Durchführungsschritten, Kernkomponenten, Qualitätsrisiken, Evidenzgrad (mit Geltung & Gegenposition), Piktogramm, Mini-Ablaufgrafik und geprüften freien Quellen.
- **Zero-LLM-First (`< 5 ms`, 0 € Betriebskosten):**
  - Facettierte Suche, 5-Stufen-Zuordnung (`lesen()` + `zuordnen()`), 13-Regeln-Validator (`R-00`–`R-12`), Binnendifferenzierungsmatrix (115 Variablen × 172 Maßnahmen), 7 druckfertige Material-Strukturvorlagen und hybride Freitext-Klassifikation (`POST /api/v1/classify`, `POST /api/v1/plan`) laufen **komplett ohne Sprachmodell**.
  - Optionales statisches deutsches Bildungs-Embedding (**`JanSchachtschabel/m2v-qwen3-4b-256-edu`**, Apache-2.0) direkt in reinem Node.js ohne Python/ONNX nachladbar (`npm run download:m2v`).
- **Szenario-Baukasten (4 Schritte) & Exporte:** Live-Zeitband (`TimelineBandSvg`), Didaktische Partitur, IMS-LD-Verlaufsplan, Live-WLO-OER-Suche (`wwwurl`), Binnendifferenzierungsmatrix, druckfertiger PDF-Export (mit isolierten Materialseiten), **1-Seiten-A4-Kurzablauf (Pultvorlage)**, Markdown/LaTeX-Formeln (KaTeX offline), Word/LibreOffice (`.doc`), HTML+JSON-LD, **IMS Common Cartridge (`.imscc`)** und **Moodle-XML**.
- **Flexible KI-Anbindung (optional):**
  1. **Zero-LLM-Standard:** Server läuft ohne API-Key; API & MCP liefern bei komplexen Aufgaben fertige `llmBriefing`-Pakete für das eigene Enduser-LLM.
  2. **Eigene KI in den App-Einstellungen (`⚙ KI-Einstellungen`):** Endnutzer können direkt im Browser jede OpenAI-kompatible Anbindung eintragen (OpenAI, Google Gemini, Mistral AI, OpenRouter, GWDG Academic Cloud, Groq, **lokales Ollama / LM Studio** oder eigene LiteLLM/vLLM-Endpunkte – inkl. Browser-Direktmodus ohne Weitergabe des Keys an den FMT-Server).
  3. **Optionales Server-LLM per ENV:** Strikt opt-in über `LLM_API_KEY`.
- **MCP-Server (13 Tools) & Linked Data:** Remote-MCP (`/mcp` via Streamable HTTP) + lokaler `stdio`-Start, REST-API (`/api/v1/*` + v0.7.0-Aliase), 24 SKOS-Vokabulare (`.ttl`), JSON-LD, JSON Schema und `w3id.org/fmt/`-Content-Negotiation.

---

## Installation & Nutzung mit Docker

### 1. Hostinger Docker Manager (VPS · „Compose from URL“)

Die `docker-compose.yml` im Hauptordner ist direkt für Hostingers Docker Manager (hinter Hostingers Traefik) vorbereitet – ohne Pflichtvariablen, ohne `external: true`-Netz und ohne Port-Konflikte auf 80/443:

1. Im Hostinger Docker Manager → **Compose** → **Compose from URL** einfügen:
   ```text
   https://github.com/janschachtschabel/Facettierte-Methodentaxonomie
   ```
2. Anwendungsnamen übernehmen und **bereitstellen**. Der erste Deploy startet sofort ohne Variablen mit dem vorgebauten öffentlichen Multi-Arch-Image `ghcr.io/janschachtschabel/facettierte-methodentaxonomie:latest` (GHCR, `linux/amd64` + `linux/arm64`).
3. Projekt **Bearbeiten** → in `.env` den **reinen Hostnamen ohne `https://`** eintragen und erneut bereitstellen:
   ```env
   DOMAIN=methoden.deine-domain.de
   ```
   *(Ohne eigene Domain funktioniert auch der VPS-Hostname `srvNNNNNN.hstgr.cloud`.)* Hostingers Traefik holt das Let's-Encrypt-Zertifikat automatisch.

### 2. Einzelner Container direkt starten (`docker run`, ohne Compose)

```bash
docker run -d \
  --name fmt-methodendatenbank \
  -p 8080:8080 \
  --restart unless-stopped \
  ghcr.io/janschachtschabel/facettierte-methodentaxonomie:latest
```

Danach direkt erreichbar unter `http://localhost:8080/`.

### 3. Lokal aus dem Quellcode mit Docker bauen (`docker-compose.build.yml`)

```bash
# Zero-LLM-Modus (sofort startbereit auf http://localhost:8080):
docker compose -f docker-compose.build.yml up --build

# Optional mit angepasster .env:
cp .env.example .env
# z. B. LLM_API_KEY oder PORT anpassen
docker compose -f docker-compose.build.yml up --build -d
```

### 4. Optional: Lokales Model2Vec-Embedding im Docker-Container aktivieren

Standardmäßig nutzt der Container den 0-MB-Hybridklassifikator (`hybrid-bm25-trigram`). Um zusätzlich das deutsche Bildungs-Embedding `JanSchachtschabel/m2v-qwen3-4b-256-edu` (~255 MB, einmalig ins Volume `fmt-models`) zu aktivieren:

```bash
docker compose exec fmt node scripts/download-m2v.mjs
docker compose restart fmt
```

Nach dem Neustart meldet `GET /api/v1/meta` automatisch `"embeddingsEngine": "hybrid-model2vec"`.

---

## Installation & Nutzung ohne Docker (Node.js)

**Voraussetzungen:** **Node.js 22+** (LTS) und `npm` (kein Python, kein Docker, keine Datenbank erforderlich).

### Produktivbetrieb lokal / auf eigenem Linux- oder Windows-Server

```bash
git clone https://github.com/janschachtschabel/Facettierte-Methodentaxonomie.git
cd Facettierte-Methodentaxonomie

npm ci
npm run build      # baut @fmt/core, dist-data/ (290 Methoden + 24 SKOS), @fmt/web und @fmt/server
npm test           # führt alle 46 automatisierten Tests aus

# Optional: lokale Konfiguration anlegen (wird beim Start automatisch aus ./.env geladen)
cp .env.example .env

# Optional: Model2Vec-Embedding herunterladen (~255 MB, sonst 0-MB BM25+Trigram)
npm run download:m2v

# Produktionsserver starten (Standard: http://0.0.0.0:8080)
npm start
```

### Entwicklungsmodus (Hot-Reload)

```bash
npm run build:data # einmalig Katalog-Artefakte (dist-data/) erzeugen
npm run dev:server # Terminal 1: Fastify API + MCP mit Auto-Reload (Port 8080)
npm run dev:web    # Terminal 2: Vite Dev-Server (Proxy zu 8080)
```

### Wichtige URLs nach dem Start

| URL | Zweck |
|---|---|
| `http://localhost:8080/` | Web-App (Methodenkatalog, Szenario-Baukasten, Vergleich, Systematik) |
| `http://localhost:8080/mcp` | Remote-MCP-Server (Streamable HTTP, 13 Zero-LLM-Tools) |
| `http://localhost:8080/api/v1/meta` | Status, Version, Hash, Methodenanzahl, Klassifikations-Engine & LLM-Status |
| `http://localhost:8080/api/v1/plan` | Ein-Schritt-Zero-LLM-Vorfilterung inkl. `llmBriefing` (`POST`) |
| `http://localhost:8080/api/v1/classify` | Hybride Freitext-Klassifikation auf 6 Skalen & Matrix-Merkmale (`POST`) |
| `http://localhost:8080/bausteine/katalog.jsonld` | Linked-Data-Gesamtkatalog (JSON-LD, CC BY 4.0) |
| `http://localhost:8080/healthz` | Healthcheck (`200 OK`) |

---

## Alle relevanten Umgebungsvariablen (`.env`)

Die Anwendung lädt lokal automatisch eine `.env`-Datei im Projekt-Hauptordner (`process.loadEnvFile`) sowie reguläre Prozess-/Container-Umgebungsvariablen. Alle Variablen sind **optional** – ohne jede Konfiguration läuft die App im schnellen Zero-LLM-Modus.

### Server, Netzwerk & Reverse Proxy

| Variable | Standardwert | Beschreibung |
|---|---|---|
| `PORT` | `8080` | HTTP-Port des Fastify-Servers (im Docker-Container fest `8080`). |
| `HOST` | `0.0.0.0` | Bind-Adresse des Servers (`127.0.0.1` für rein lokalen Zugriff). |
| `TRUST_PROXY` | `0` lokal / `1` in `docker-compose.yml` | Anzahl vertrauenswürdiger Reverse-Proxy-Hops (`0`/`false`, `1`, `2`, `true`). Hinter Hostingers Traefik auf `1` lassen, damit Rate-Limits die echte Client-IP verwenden. |
| `CORS_ORIGIN` | `*` | Erlaubte Origins für Browser-/MCP-Zugriffe (`*` oder kommagetrennte Liste, z. B. `https://app.example.de,https://edu.example.de`). |
| `DOMAIN` | *(leer)* | **Reiner DNS-Hostname** ohne `https://`, Pfad oder Port (z. B. `methoden.deine-domain.de`). Leer beim Erst-Deploy erlaubt; ungültige Angaben mit `https://` brechen den Start gezielt mit Fehlermeldung ab. |

### Docker / Hostinger / Traefik (`docker-compose.yml`)

| Variable | Standardwert | Beschreibung |
|---|---|---|
| `FMT_IMAGE` | `janschachtschabel/fmt-methodendatenbank:latest` | Zu verwendendes Container-Image (alternativ `ghcr.io/janschachtschabel/facettierte-methodentaxonomie:latest`). |
| `TRAEFIK_NETWORK` | `fmt-methodendatenbank-web` | Name des Docker-Standardnetzes (wird automatisch angelegt/mitbenutzt, kein `external: true`). |
| `TRAEFIK_ENTRYPOINT` | `websecure` | Name des HTTPS-Entrypoints im Hostinger-Traefik. |
| `TRAEFIK_CERTRESOLVER` | `letsencrypt` | Name des ACME-/TLS-Certresolvers im Hostinger-Traefik. |

### Optionale Server-LLM-Anbindung (OpenAI-kompatibel)

| Variable | Standardwert | Beschreibung |
|---|---|---|
| `LLM_API_KEY` | *(leer)* | **Strikt opt-in.** Leer = Zero-LLM-Modus. Setzen aktiviert das Server-LLM. Wert `none` oder `off` erzwingt dauerhaft den Zero-LLM-Modus. |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | Basis-URL eines OpenAI-kompatiblen Endpunkts (z. B. OpenAI, Mistral, Gemini, OpenRouter, GWDG Academic Cloud, lokales Ollama/vLLM). |
| `LLM_MODEL` | `gpt-6-luna` | Modellname beim Server-LLM. OpenAI-Reasoning-Modelle (`gpt-5*`, `gpt-6*`, `o1`/`o3`/`o4`) nutzen automatisch `max_completion_tokens` und `reasoning_effort`. |
| `LLM_USE_OPENAI_ENV` | `false` | Nur auf `true` setzen, wenn explizit ein bereits im Betriebssystem gesetzter `OPENAI_API_KEY` übernommen werden soll. |
| `OPENAI_API_KEY` | *(leer)* | Wird **nur** verwendet, wenn `LLM_USE_OPENAI_ENV=true`, `LLM_API_KEY` leer und `LLM_BASE_URL` auf `*.openai.com` zeigt. |
| `LLM_REASONING_EFFORT` | `low` | Reasoning-Stufe für OpenAI-Reasoning-Modelle (`low`, `medium`, `high`). |
| `LLM_ALLOW_BYOK` | `true` | Erlaubt Nutzern den Server-Proxy für freigegebene Provider (`openai`, `gemini`, `mistral`, `openrouter`, `groq`, `academiccloud`, `deepseek`, `together`). Eigene/lokale URLs (Ollama, LM Studio, LiteLLM) verbinden sich sicherheitshalber direkt aus dem Browser (SSRF-Schutz). |
| `LLM_RATE_LIMIT_PER_MIN` | `20` | Maximale KI-Anfragen pro Minute und Client-IP auf `/api/v1/assistant/*`. |
| `LLM_TIMEOUT_MS` | `90000` | Upstream-Timeout in Millisekunden für Server-LLM-Aufrufe. |
| `LLM_CACHE_MAX` | `500` | Maximale Anzahl Einträge im In-Memory-LRU-Cache für Server-LLM-Antworten (BYOK-Anfragen werden nie geteilt gecacht). |
| `LLM_CACHE_TTL_MS` | `3600000` | Gültigkeitsdauer (TTL) des LLM-Caches in Millisekunden (`3600000` = 1 Stunde). |

### Klassifikation & Datenpfade

| Variable | Standardwert | Beschreibung |
|---|---|---|
| `FMT_M2V_MODEL_DIR` | `./models/m2v-qwen3-4b-256-edu` (Docker: `/app/models/m2v-qwen3-4b-256-edu`) | Verzeichnis für das optionale statische Model2Vec-Modell (`npm run download:m2v`). Mit `none` explizit abschaltbar (Fallback: `hybrid-bm25-trigram`). |
| `FMT_DATA_DIR` | `<repo>/dist-data` | Abweichender Pfad zu den gebauten Katalog-Artefakten (gilt für Server und `mcp:stdio`). |
| `FMT_WEB_DIR` | `<repo>/apps/web/dist` | Abweichender Pfad zum gebauten Frontend-Bundle. |

---

## MCP-Server (13 Zero-LLM-Tools für KI-Clients)

Alle MCP-Tools antworten standardmäßig **ohne Server-LLM in `< 5 ms`** (Suche, 5-Stufen-Zuordnung, Regelprüfung, Binnendifferenzierungsmatrix, hybride Freitext-Klassifikation) und liefern bei komplexen Aufgaben ein fertiges **`llmBriefing`** für das aufrufende Enduser-LLM.

### Remote MCP (`Streamable HTTP` – z. B. hinter Hostinger HTTPS)

```json
{
  "mcpServers": {
    "fmt-methodendatenbank": {
      "url": "https://methoden.deine-domain.de/mcp"
    }
  }
}
```

### Lokaler MCP (`stdio` – z. B. Claude Desktop, Cursor, Antigravity)

```json
{
  "mcpServers": {
    "fmt-methodendatenbank-local": {
      "command": "node",
      "args": ["apps/server/dist/mcp/stdio.js"]
    }
  }
}
```

---

## Architektur, Verzeichnisse & Skripte

- `data/` – Single Source of Truth unter **CC BY 4.0** (`meta.json`, `vocab.json`, `ketten.json`, `crosswalk/`, `beispiele/`, `bausteine/*.json` mit **290 Methoden**)
- `packages/fmt-core/` – Abhängigkeitsfreier TypeScript-Kern (`validate`, `suche`, `zuordnung`, `semantic`, `differentiationMatrix`) & Artefakt-Generator (`dist-data/`)
- `apps/server/` – Fastify-Server (Static SPA, REST API inkl. `/api/v1/classify`, `/api/v1/plan`, `/api/v1/assistant/briefing`, Linked Data + `w3id.org`, MCP Streamable HTTP + `stdio`, optionales Model2Vec & OpenAI-kompatibles LLM)
- `apps/web/` – React + TypeScript + Vite SPA mit Browser-Cache-Sync, 4-Schritte-Szenario-Studio, globalen **⚙ KI-Einstellungen** (Proxy + Browser-Direktmodus) und KaTeX/Markdown-Export
- `docs/` – Vertiefende Dokumentation ([DEPLOYMENT-UND-KONFIGURATION.md](docs/DEPLOYMENT-UND-KONFIGURATION.md))
- `.github/workflows/` – Automatisierte CI (`ci.yml` inkl. Docker First-Deploy Smoke Test) & Multi-Arch-Image-Publish (`docker-publish.yml` → Docker Hub & GHCR)

| npm-Skript | Funktion |
|---|---|
| `npm run build` | Baut Core, `dist-data/`, Web-App und Server |
| `npm run build:data` | Baut nur `@fmt/core` und generiert `dist-data/` |
| `npm test` | Führt die komplette Testsuite über alle 3 Workspaces aus (44 Tests) |
| `npm start` | Startet den gebauten Produktionsserver (`apps/server/dist/index.js`) |
| `npm run mcp:stdio` | Startet den lokalen MCP-Server über `stdin`/`stdout` |
| `npm run download:m2v` | Lädt optional `JanSchachtschabel/m2v-qwen3-4b-256-edu` nach `models/` |
| `npm run check:links` | Prüft alle freien Quellen-URLs der Methodendatenbank per HTTP |

---

## Die vier FMT-Leitplanken

1. Der Prüfer ist ein struktureller Filter – ein gültiger Ablauf ist kein Qualitätsurteil.
2. Jede Regelmeldung weist aus, ob sie `formal`, empirisch belegt `[E]`, gefolgert `[S]` oder gesetzt `[A]` ist.
3. Hoch-inferente Facetten (`A1`, `D1`) sind didaktische Einschätzungen, keine objektiven Tatsachen.
4. Evidenzbefunde gelten immer nur mit ihrer genannten Geltung und Gegenposition; die Entscheidung bleibt bei der Lehrkraft.
