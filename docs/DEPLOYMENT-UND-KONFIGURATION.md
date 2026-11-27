# Deployment-, Betriebs- & Konfigurationshandbuch (FMT Methodendatenbank)

Dieser Leitfaden beschreibt alle Betriebsarten der **FMT Methodendatenbank** – vom 1-Klick-Deploy bei Hostinger über eigene Reverse-Proxy-Setups und den Betrieb ohne Docker bis hin zu allen Umgebungsvariablen, KI-Modi (Zero-LLM, Browser-Direkt-KI, Ollama/LM Studio, Server-LLM) sowie REST-API und MCP-Nutzung.

---

## 1. Übersicht der Betriebsarten

| Szenario | Empfohlener Weg | Benötigte Infrastruktur |
|---|---|---|
| **Hostinger VPS (Docker Manager)** | `docker-compose.yml` per **Compose from URL** | Hostinger VPS mit vorinstalliertem Traefik |
| **Eigener Server mit Docker** | `docker run` oder `docker-compose.yml` / `docker-compose.build.yml` | Docker Engine + Compose |
| **Betrieb ohne Docker (Linux / Windows / macOS)** | Node.js 22 + `npm ci && npm run build && npm start` | Nur Node.js 22+ (keine DB, kein Python) |
| **Lokaler KI-Agent (Claude Desktop / Cursor / Antigravity)** | `npm run mcp:stdio` oder Remote `https://<domain>/mcp` | Node.js 22+ oder laufender Server |

---

## 2. Deployment mit Docker

### 2.1 Hostinger Docker Manager („Compose from URL“)

Die Datei `docker-compose.yml` im Projekt-Hauptordner erfüllt alle Hostinger-Anforderungen:
- vorgebautes öffentliches Multi-Arch-Image (`linux/amd64`, `linux/arm64`) auf GHCR (`ghcr.io/janschachtschabel/facettierte-methodentaxonomie:latest`), ohne Registry-Login direkt pullbar,
- kein `build:` und keine Bind-Mounts auf Repo-Dateien,
- kein `external: true`-Netz (benanntes Standardnetz `fmt-methodendatenbank-web`),
- keine Host-Ports `80`/`443` (HTTPS übernimmt Hostingers Traefik über Labels),
- Datenschutz: Die Datenschutzerklärung sagt zu, dass auch der Reverse Proxy kein Zugriffsprotokoll mit IP-Adressen führt. Traefiks `accessLog` muss deshalb ausgeschaltet bleiben (Standard) oder IP-Adressen auslassen,
- **erster Deploy gelingt komplett ohne Variablen**.

#### Schritt-für-Schritt-Ablauf
1. **Docker Manager → Compose → Compose from URL** öffnen.
2. Repository-URL eingeben:
   ```text
   https://github.com/janschachtschabel/Facettierte-Methodentaxonomie
   ```
3. Vorgeschlagenen Anwendungsnamen übernehmen und **Bereitstellen** klicken.
   *(Hostinger kopiert `.env.example` automatisch als Start-`.env` und startet den Container im Zero-LLM-Modus.)*
4. Projekt öffnen → **Bearbeiten** → `.env` anpassen:
   ```env
   # WICHTIG: Reiner Hostname OHNE https:// und OHNE abschließenden Slash!
   DOMAIN=methoden.deine-domain.de
   ```
   *(Ohne eigene Domain kann der Hostinger-VPS-Hostname `srvNNNNNN.hstgr.cloud` verwendet werden.)*
5. DNS-A-Eintrag der Domain auf die VPS-IP setzen und im Docker Manager erneut **Bereitstellen** klicken. Traefik beantragt automatisch ein Let's-Encrypt-Zertifikat.

#### Diagnose über die Hostinger-Webkonsole (Root-Shell)

```bash
# Echte Fehlermeldung bei fehlgeschlagenem Deploy anzeigen:
cat /docker/<projektname>/.build.log

# Compose-Konfiguration prüfen:
cd /docker/<projektname> && docker compose config -q && echo CONFIG-OK

# Container-Logs der FMT-App (inkl. DOMAIN-Prüfung & Engine-Status):
docker logs <projektname>-fmt-1 --tail 80

# Traefik-Logs bei Zertifikats- oder Hostname-Problemen:
docker logs $(docker ps -q --filter name=traefik) --tail 40 2>&1

# Healthcheck im Container prüfen:
docker exec <projektname>-fmt-1 node -e "fetch('http://127.0.0.1:8080/api/v1/meta').then(r=>r.text()).then(console.log)"
```

> **Typischer Fehler bei `DOMAIN`:** Steht versehentlich `DOMAIN=https://methoden.example.de` in `.env`, bricht die Anwendung beim Start gezielt mit einer klaren Fehlermeldung ab (`Exit 1`), statt still einen Traefik-`404`-Fehler mit Default-Zertifikat zu erzeugen. Einfach `https://` entfernen und neu bereitstellen.

### 2.2 Eigener Server mit Docker (ohne Hostinger-Traefik)

Direkt per `docker run` auf Port `8080`:

```bash
docker run -d \
  --name fmt-methodendatenbank \
  -p 8080:8080 \
  -e TRUST_PROXY=1 \
  -e CORS_ORIGIN=* \
  -v fmt-models:/app/models \
  --restart unless-stopped \
  ghcr.io/janschachtschabel/facettierte-methodentaxonomie:latest
```

Oder lokal aus dem Quellcode bauen:

```bash
docker compose -f docker-compose.build.yml up --build -d
```

#### Betrieb hinter eigenem Nginx oder Caddy
- Container intern auf `127.0.0.1:8080` binden (`-p 127.0.0.1:8080:8080`).
- `TRUST_PROXY=1` setzen (bei genau **einem** Reverse Proxy vor Node.js).
- Für MCP Streamable HTTP (`/mcp`) Proxy-Buffering deaktivieren (`proxy_buffering off;` in Nginx), damit Streaming-Antworten verzögerungsfrei ankommen.

---

## 3. Installation & Betrieb ohne Docker (Node.js 22+)

### 3.1 Lokale Installation (Linux, macOS, Windows)

```bash
git clone https://github.com/janschachtschabel/Facettierte-Methodentaxonomie.git
cd Facettierte-Methodentaxonomie

npm ci
npm run build
npm test
npm start
```

Die App liest automatisch eine `.env`-Datei im Projekt-Hauptordner (sofern vorhanden). Umgebungsvariablen der Shell haben Vorrang.

**Windows PowerShell Beispiel:**
```powershell
$env:PORT = '8080'
$env:HOST = '127.0.0.1'
npm start
```

### 3.2 Dauerbetrieb unter Linux mit `systemd` (ohne Docker)

Beispiel `/etc/systemd/system/fmt-methodendatenbank.service`:

```ini
[Unit]
Description=FMT Methodendatenbank (Web, REST API & MCP)
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/fmt-methodendatenbank
EnvironmentFile=-/opt/fmt-methodendatenbank/.env
Environment=NODE_ENV=production
Environment=PORT=8080
Environment=HOST=127.0.0.1
Environment=TRUST_PROXY=1
ExecStart=/usr/bin/node /opt/fmt-methodendatenbank/apps/server/dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now fmt-methodendatenbank
sudo systemctl status fmt-methodendatenbank
```

---

## 4. Die drei KI- & Klassifikations-Modi im Detail

### Modus A: Zero-LLM-Modus (Standard, 0 €)
- Aktiv, solange `LLM_API_KEY` leer ist.
- Alle Kernfunktionen laufen deterministisch in **< 5 ms**: Suche, 5-Stufen-Zuordnung, 13-Regeln-Validator, Binnendifferenzierungsmatrix, Freitext-Klassifikation (`POST /api/v1/classify`), Szenario-Vorfilterung (`POST /api/v1/plan`), 7 druckfertige Material-Vorlagen und alle 15 MCP-Tools.
- Komplexe Endpunkte (`POST /api/v1/plan`, `POST /api/v1/assistant/briefing`, MCP `build_scenario_plan` / `elaborate_scenario` / `generate_phase_material`) liefern ein fertiges **`llmBriefing`** (`systemPrompt`, `userPrompt`, Katalogfakten, Leitplanken) mit, das der Endnutzer direkt in seinem eigenen LLM weiterverarbeitet.

### Modus B: Eigene OpenAI-kompatible KI in den App-Einstellungen (`⚙ KI-Einstellungen`)
Auch wenn auf dem Server **kein** `LLM_API_KEY` gesetzt ist, kann jede:r Nutzer:in oben rechts über **`⚙ KI-Einstellungen`** eine eigene OpenAI-kompatible Anbindung eintragen:
- **Vorkonfigurierte Anbieter:** OpenAI, Google Gemini, Mistral AI (EU), OpenRouter, GWDG Academic Cloud / SAIA, Groq, **Ollama (lokal)**, **LM Studio (lokal)** sowie **beliebige eigene `/v1`-Endpunkte** (z. B. Hochschul-LiteLLM, vLLM, OpenWebUI).
- **Zwei sichere Verbindungswege:**
  1. **Direkt aus dem Browser (Standard für eigene & lokale Endpunkte):** Der FMT-Server liefert in `< 2 ms` das vorab gefilterte Prompt-Paket über `/api/v1/assistant/briefing`; der Browser sendet den OpenAI-Call direkt an die eingetragene Base-URL. Der API-Key erreicht den FMT-Server nie (kein SSRF-Risiko), und **lokales Ollama/LM Studio funktioniert sogar gegen eine remote gehostete FMT-Instanz**.
     - *Tipp für lokales Ollama:* `OLLAMA_ORIGINS=*` setzen, damit der Browser per CORS auf `http://localhost:11434/v1` zugreifen darf.
     - *Tipp für LM Studio:* Im Local-Server-Tab **Enable CORS** aktivieren.
  2. **Über Server-Proxy (Allowlist):** Für die freigegebenen öffentlichen Provider (`openai`, `gemini`, `mistral`, `openrouter`, `groq`, `academiccloud`, `deepseek`, `together`) – verhindert CORS-Probleme bei Anbietern ohne Browser-CORS-Header.
- **Speicherung:** Standardmäßig nur im `sessionStorage` des aktuellen Browser-Tabs; optional per Checkbox dauerhaft im `localStorage` des eigenen Browsers. Inklusive **`🔌 Verbindung testen`**-Button.

### Modus C: Optionales Server-LLM über Umgebungsvariablen
Wenn du als Betreiber allen Nutzern standardmäßig ein zentrales Modell bereitstellen möchtest, setze in `.env`:

```env
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-6-luna
LLM_API_KEY=sk-...
```

Andere OpenAI-kompatible Server-Beispiele:
- **Mistral (EU):** `LLM_BASE_URL=https://api.mistral.ai/v1`, `LLM_MODEL=mistral-small-latest`
- **GWDG Academic Cloud (SAIA):** `LLM_BASE_URL=https://chat-ai.academiccloud.de/v1`, `LLM_MODEL=meta-llama-3.1-8b-instruct`
- **Google Gemini:** `LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai`, `LLM_MODEL=gemini-2.5-flash`
- **Lokales Ollama am Server:** `LLM_BASE_URL=http://127.0.0.1:11434/v1`, `LLM_MODEL=qwen2.5:14b`, `LLM_API_KEY=ollama`

---

## 5. Optionales lokales Model2Vec-Embedding (`m2v-qwen3-4b-256-edu`)

Für eine noch stärkere rein semantische Freitext-zu-Filter-Klassifikation ohne LLM kann das statische deutsche Bildungs-Embedding **`JanSchachtschabel/m2v-qwen3-4b-256-edu`** (Apache-2.0, ~255 MB, reines Node.js ohne Python/ONNX) einmalig geladen werden:

- **Ohne Docker:**
  ```bash
  npm run download:m2v
  npm start
  ```
- **Mit Docker (bleibt im Volume `fmt-models` erhalten):**
  ```bash
  docker compose exec fmt node scripts/download-m2v.mjs
  docker compose restart fmt
  ```
- **Abschalten trotz vorhandenem Ordner:** `FMT_M2V_MODEL_DIR=none` setzen (fällt auf das 0-MB-Standardmodell `hybrid-bm25-trigram` zurück).

---

## 6. Vollständige Referenz aller Umgebungsvariablen

| Variable | Typ / Werte | Default | Gültig in | Wirkung |
|---|---|---|---|---|
| `PORT` | Integer | `8080` | Server / Build-Compose | HTTP-Port des Fastify-Servers |
| `HOST` | IP / Hostname | `0.0.0.0` | Server | Bind-Interface (`127.0.0.1` für nur lokal) |
| `TRUST_PROXY` | `0`, `false`, `1`, `2`, `true` | `0` (`1` in `docker-compose.yml`) | Server | Vertraute Proxy-Hops für `X-Forwarded-For` & Rate-Limiting |
| `CORS_ORIGIN` | `*` oder CSV-Liste | `*` | Server | Erlaubte CORS-Origins |
| `DOMAIN` | Reiner Hostname (ohne `https://`) | *(leer)* | Server + Hostinger-Compose | Hostname für Traefik-Router & Let's Encrypt; wird beim Start strikt validiert |
| `HOST_PORT` | Integer | `8120` | `docker-compose.yml` | Konfigurierbarer Host-Port auf dem VPS (`http://<VPS-IP>:8120`), kollisionsfrei neben 80/443/8080 |
| `HOST_BIND` | IP-Adresse | `0.0.0.0` | `docker-compose.yml` | Bind-Adresse des Host-Ports (`127.0.0.1` für reinen Traefik-HTTPS-Zugriff ohne direkten HTTP-Port) |
| `FMT_IMAGE` | Docker-Image-Tag | `ghcr.io/janschachtschabel/facettierte-methodentaxonomie:latest` | `docker-compose.yml` | Image-Quelle (GHCR Standard oder Docker Hub) |
| `TRAEFIK_NETWORK` | Netzwerkname | `fmt-methodendatenbank-web` | `docker-compose.yml` | Name des benannten Docker-Standardnetzes |
| `TRAEFIK_ENTRYPOINT` | Traefik-Entrypoint | `websecure` | `docker-compose.yml` | HTTPS-Entrypoint auf dem VPS |
| `TRAEFIK_CERTRESOLVER` | Traefik-Resolver | `letsencrypt` | `docker-compose.yml` | ACME-Certresolver auf dem VPS |
| `LLM_API_KEY` | String / `none` / `off` | *(leer)* | Server | Aktiviert Server-LLM (opt-in); `none`/`off` deaktiviert jedes Server-LLM |
| `LLM_BASE_URL` | HTTPS/HTTP URL | `https://api.openai.com/v1` | Server | OpenAI-kompatible Basis-URL |
| `LLM_MODEL` | Modellname | `gpt-6-luna` | Server | Standardmodell für Server-LLM |
| `LLM_USE_OPENAI_ENV` | `true` / `false` | `false` | Server | Erlaubt bei `true` die Übernahme von OS-`OPENAI_API_KEY` für `*.openai.com` |
| `OPENAI_API_KEY` | String | *(leer)* | Server | Nur aktiv bei `LLM_USE_OPENAI_ENV=true` |
| `LLM_REASONING_EFFORT` | `low` / `medium` / `high` | `low` | Server | Parameter für OpenAI GPT-5/GPT-6/o-Serie |
| `LLM_ALLOW_BYOK` | `true` / `false` | `true` | Server | Aktiviert/deaktiviert Server-Proxy-BYOK (Allowlist) |
| `LLM_RATE_LIMIT_PER_MIN` | Integer | `20` | Server | Rate-Limit pro IP und Minute auf `/api/v1/assistant/*` |
| `API_RATE_LIMIT_PER_MIN` | Integer | `300` | Server | Rate-Limit pro IP und Minute auf die Rechen-Endpunkte ohne LLM (`/api/v1/match`, `/plan`, `/adapt` …) |
| `LLM_TIMEOUT_MS` | Integer (ms) | `90000` | Server | Timeout für LLM-Upstream-Anfragen |
| `LLM_CACHE_MAX` | Integer | `500` | Server | Maximale LRU-Cache-Größe für Server-LLM-Antworten |
| `LLM_CACHE_TTL_MS` | Integer (ms) | `3600000` | Server | Cache-Lebensdauer in ms (1 Stunde) |
| `FMT_M2V_MODEL_DIR` | Pfad oder `none` | `./models/m2v-qwen3-4b-256-edu` | Server + `download-m2v.mjs` | Speicherort für optionales Model2Vec-Modell |
| `FMT_DATA_DIR` | Pfad | `<repo>/dist-data` | Server + `mcp:stdio` | Pfad zu den gebauten Katalog-Artefakten |
| `FMT_WEB_DIR` | Pfad | `<repo>/apps/web/dist` | Server | Pfad zur gebauten Web-App |

---

## 7. Praxisbeispiele: REST-API & MCP

### Schnelle Zero-LLM-Vorfilterung inkl. `llmBriefing` (`POST /api/v1/plan`)

```bash
curl -s -X POST http://localhost:8080/api/v1/plan \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Kooperatives Lernen 2 x 45 Minuten in der 7. Klasse, mehrere DaZ-Kinder, Thema Nachhaltigkeit bei Lebensmitteln",
    "includeWloOer": false
  }'
```

Liefert in `< 5 ms` (mit Model2Vec ~30–45 ms):
- `erkannteKriterien` (`zeitMin: 90`, `bildungsstufe: "sek1"`, `ansatz: ["kooperativ"]`),
- `erkannteMatrixSignale` (DaZ → `sprachkompetenz-gering`),
- `pruefung` (`gueltig: true` über alle 13 Regeln),
- `thematischeTabelle` (deterministische Basistabelle),
- `llmBriefing` (`systemPrompt` + `userPrompt` inkl. vorselektierter FMT-Methodendaten & 4 Leitplanken für das Enduser-LLM).

### Hybride Freitext-Klassifikation (`POST /api/v1/classify`)

```bash
curl -s -X POST http://localhost:8080/api/v1/classify \
  -H "Content-Type: application/json" \
  -d '{"text":"Doppelstunde 2 x 45 min, forschendes Lernen, wenig Vorwissen, ohne Internet, ADHS in der Klasse"}'
```

### Vorab gefiltertes Prompt-Paket für das eigene LLM (`POST /api/v1/assistant/briefing`)

Unterstützte Werte für `task`: `translate`, `elaborate`, `differentiate`, `material`.

```bash
curl -s -X POST http://localhost:8080/api/v1/assistant/briefing \
  -H "Content-Type: application/json" \
  -d '{
    "task": "material",
    "payload": {
      "baustein": "abrufquiz",
      "fach": "Physik",
      "thema": "Dichte von Stoffen",
      "materialTyp": "quiz"
    }
  }'
```

### Übersicht aller 15 MCP-Tools (`/mcp` & `stdio`)

1. `search_methods` – Facettierte Suche im Katalog (310 Methoden und 4 Hilfen): Freitext, 13 Facetten, Fach bzw. Fachbereich, Zeit, Gruppengröße, Technik, Evidenzgrad, Bedarf, Eintragsart sowie Kette (`zieltyp`) und Kettenschritt (`kettenschritt`); Treffer mit Bedarf, Eignung, Evidenzbezug und `einordnung`
2. `get_method` – Vollständiger Eintrag einer Methode oder Hilfe: 13-Facetten-Profil, Durchführung, Schnittstellen, Kernkomponenten, Risiken, Bedarf, Eignung, Evidenz mit Geltung und Evidenzbezug, Quellen und `einordnung` (Kettenschritte)
3. `compare_methods` – Vergleicht zwei Einträge Facette für Facette, dazu Eintragsart, Bedarf, Eignung und Evidenzbezug (`unterschiede`, `verglichen`)
4. `match_scenario` – Deterministische 5-Stufen-Zuordnung für eine Phase oder einen geprüften Ablauf mit `pflichtangaben`, `regelmeldungen`, `begleitstrang` und `planungsprofil`
5. `validate_arrangement` – Prüft ein Arrangement gegen `R-00` bis `R-12` mit Grundlage (`formal`, `[E]`, `[S]`, `[A]`); mit `situation` zusätzlich die Passungsregeln dieses (auch von Hand geänderten) Ablaufs als `regelmeldungen`
6. `suggest_replacements` – Ersatzkandidaten an einem Knotenpfad, live gegen `R-00` bis `R-12` geprüft; mit der Situation nur Kandidaten, deren Bedarf gedeckt ist, dazu `ausgeschlossen` mit Grund
7. `list_vocabularies` – Alle Vokabulare, W-Felder, Arten und Merkmale, Funktionsketten mit Schritten, Passungsregeln, Planungsprofile, Teilgruppen-Tabelle, Raumtypen, Zielarten, Personas, Anfragefelder und die Zahl der Methoden und Hilfen (wie REST `/meta`)
8. `search_wlo_oer` – Live-OER-Suche auf WirLernenOnline (`redaktion.openeduhub.net`) mit offiziellen Fach-, Bildungsstufen- und Medientyp-URIs; jeder Treffer mit `wwwurl`
9. `score_differentiation_matrix` – Binnendifferenzierungsmatrix (115 Ausprägungen × 172 Maßnahmen, −100..+100 %) nach Schnellprofil, Persona oder eigenen Werten; mit Baustein geprüfte alternative Methoden für die Teilgruppe (`alternativenPruefung`)
10. `build_scenario_plan` – Vollständiges, `R-00`..`R-12`-geprüftes Szenario ohne Server-LLM (Ablauf, `methodenDetails`, Matrix, `thematischeTabelle`, `teilgruppenMethoden`, `zusatzphasen`); `umfang: "voll"` ergänzt `llmBriefing` und `maschinenlesbar`
11. `elaborate_scenario` – Verlaufstabelle und Entwurf mit sieben Kernfeldern in den Begriffen des Planungsprofils, dazu ein gefiltertes `llmBriefing`; `regelmeldungen` aus dem Plan stehen unter Reflexion
12. `generate_phase_material` – Druckfertige Material-Strukturvorlage (7 Typen) zu einer Methode, Hilfe oder Methode des Begleitstrangs, mit gestuften Hilfen je Lerngruppe und `llmBriefing`
13. `classify_scenario_text` – Freitext-Klassifikation ohne LLM (Regeln, BM25/Trigram, optional Model2Vec) auf Filterskalen, Fach/Thema, Methoden und Matrix-Merkmale; `pflichtangaben` nennt, was fehlt und was angenommen würde
14. `adapt_scenario` – Anpassung eines freien Szenarios, einer Methode (`baustein`) oder eines Arrangements an Lernvoraussetzungen: UDL-Basis, Zielkonflikte, Maßnahmen, `teilgruppenImpulse`, `teilgruppenMethoden`, `zusatzphasen`, `gesperrt` und `regelmeldungen` (auch als `POST /api/v1/adapt`)
15. `list_differentiation_options` – Alle Lernvoraussetzungs-Merkmale (36 Variablen mit 115 Ausprägungen), 8 Schnellprofile, Personas und Handlungsebenen; je Ausprägung, ob die Tabelle Tausch oder Hilfe vorsieht; gesperrte Kategorien unter `gesperrteKategorien`

**Fehler:** Eigene Fehler der Tools kommen mit `isError: true` und demselben deutschen Text wie REST (HTTP 400 `{ fehler, erlaubt? }`). Fehler aus der Schemaprüfung des MCP-SDK (z. B. ein Wert außerhalb eines Enums: `match_scenario { raum: "mondbasis" }`) kommen dagegen als englischer SDK-Text („MCP error -32602: Input validation error … Invalid option: expected one of …“), ebenfalls mit `isError: true`; die erlaubten Werte stehen in diesem Text und als Enum im Tool-Schema.
