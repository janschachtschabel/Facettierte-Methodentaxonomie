# Design-Spezifikation: FMT Methodendatenbank – Web-App, API & MCP-Server

**Datum:** 2026-11-21  
**Autor / Rechteinhaber Inhalte:** Jan Schachtschabel  
**Repository:** `https://github.com/janschachtschabel/Facettierte-Methodentaxonomie`  
**Lizenzen:**
- **Inhalte, Taxonomie, Vokabulare, Methodenbeschreibungen, Grafiken:** CC-BY 4.0 (Jan Schachtschabel)
- **Software-Quellcode:** Apache-2.0

---

## 1. Ziel & Kontext (Intent & Why)

Auf Basis der bereits entwickelten **Facettierten Methodentaxonomie (FMT v0.7.0)** in `wissen/fmt/` entsteht eine schnelle, visuell ansprechende und maschinenlesbare **Datenbank für Unterrichtsmethoden** im deutschsprachigen Bildungsraum.

Das System richtet sich gleichrangig an **zwei Nutzergruppen**:
1. **Menschen (Lehrkräfte, Dozierende, Referendar:innen, Didaktiker:innen):** suchen gezielt nach passenden Unterrichtsmethoden über 13 didaktische Facetten und praktische Rahmenbedingungen, erfassen Methodenprofile visuell auf einen Blick, verstehen die FMT-Systematik interaktiv und kombinieren mehrere Methoden zu modularen, regelgeprüften Lehr- und Lernszenarien – wahlweise manuell oder unterstützt durch einen eingebauten KI-Assistenten.
2. **Externe KI-Agents & Bildungsplattformen:** greifen günstig, deterministisch und in Millisekunden über **MCP (Model Context Protocol)** sowie eine **REST- und Linked-Data-API (SKOS / JSON-LD)** auf Katalog, 5-Stufen-Zuordnung, Kompositionsvalidator und Austausch-Berechnung zu, ohne Methoden oder Wirksamkeitsbelege zu halluzinieren.

### Grundprinzip: Deterministischer Kern, dünne LLM-Ränder
Suche (`suche`), 5-Stufen-Zuordnung (`zuordnung`), Komposition entlang von Funktionsketten, formaler Bausteinaustausch (`ersatz`) und Regelprüfung (`validate`, R-00 bis R-12) laufen **vollständig ohne Sprachmodell in < 1 ms**. Ein LLM kommt ausschließlich an zwei optionalen Stellen zum Einsatz:
1. **Eingang (Übersetzung):** Unscharfe Freitext-Szenarien in das strenge 15-Felder-Anfrageschema (`anfrage.schema.json`) übersetzen.
2. **Ausgang (Ausgestaltung):** Ein bereits deterministisch komponiertes und validiertes Arrangement fachlich für Thema, Lerngruppe und Kontext ausformulieren (konkrete Aufgaben, Übergänge, Zeitvorschläge).

---

## 2. Ziele, Nicht-Ziele & Anti-Ziele

### Ziele
- **Umfassender Startkatalog (~100 Methoden):** Erweiterung der 22 bestehenden Bausteine auf die ~100 wichtigsten Unterrichtsmethoden für Bildung in Deutschland über alle didaktischen Ansätze hinweg, mit freien Quellenangaben (z. B. Wikipedia, bpb, ZUM, OpenEduHub/WLO, Fachliteratur) und sauberer 13-Facetten-Kodierung.
- **Hohe Geschwindigkeit & Caching:** Clientseitiger Katalog-Cache mit automatischem Versions-/ETag-Abgleich gegen den Server, sodass Suche, Filterung, Vergleich und Baukasten-Prüfung ohne Netzwerklatenz (< 5 ms) im Browser laufen; In-Memory-Caching auf dem Server für API, MCP und wiederkehrende LLM-Anfragen.
- **Ansprechende Visualisierungen:** Weiterentwicklung der redaktionellen Gestaltungssprache aus `Facettierte_Methodentaxonomie_FMT_0.7.0 (1).html` – mit Profilgrafiken je Methode, kleinen Piktogrammen, interaktiver Systematik-Erklärseite und einer **visuellen modularen Szenario-Partitur**.
- **Erstklassige Agent-Anbindung:** Remote-MCP-Endpunkt (`/mcp` via Streamable HTTP) + lokaler `stdio`-Modus sowie vollständige REST- und Linked-Data-Endpunkte (SKOS `.ttl`, JSON-LD, JSON Schema).
- **Einfacher Eigenbetrieb:** Ein einziger, kompakter Multi-Stage-Docker-Container, konfigurierbar über Umgebungsvariablen (`LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`, `PORT`, etc.).

### Nicht-Ziele (für v1)
- Kein Multi-User-Login, keine Benutzerkonten, keine serverseitige Speicherung persönlicher Unterrichtspläne (Speichern/Teilen läuft über lokalen Browser-Speicher, URL-State oder JSON-LD-/Markdown-Export).
- Kein Browser-basiertes Redaktions-CMS mit Datenbank (Methoden werden als Dateien im Git-Repo gepflegt und durch automatisierte Tests abgesichert).
- Keine fachspezifischen Curricula oder kompletten Unterrichtsmaterialien in der Datenbank selbst (diese erzeugt bei Bedarf der optionale Ausgestaltungs-Schritt des Assistenten).

### Anti-Ziele (Was selbst bei technischer Funktion ein Scheitern wäre)
- **Verstoß gegen die vier FMT-Leitplanken:**
  1. Der Validator darf niemals als „Qualitätssiegel“ verkauft werden – er ist ein struktureller Filter.
  2. Jede Regelmeldung (R-00 bis R-12) muss immer ihre Grundlage anzeigen (`formal`, `[E]` belegt, `[S]` gefolgert, `[A]` Setzung).
  3. Hoch-inferente Facetten (A1, D1) und Experteneinschätzungen dürfen nicht als objektive Tatsachen dargestellt werden.
  4. Evidenz muss stets mit Grad (A/B/C), Quelle, Geltung und ggf. Gegenposition genannt werden; Methoden ohne Meta-Analyse erhalten ehrlich Grad C statt aufgeblähter Belege.
- **Halluzinierte Methoden oder Belege:** Der KI-Assistent darf nur Bausteine und Belege aus dem Katalog empfehlen; Schritte, die unter den Bedingungen kein Baustein abdeckt, bleiben offen und werden benannt.
- **Zwang zum API-Key:** Die Web-App und alle MCP-/REST-Kernfunktionen müssen vollständig nutzbar sein, auch wenn kein `LLM_API_KEY` gesetzt ist.

---

## 3. Gewählter Architektur-Ansatz (und verworfene Alternativen)

### Betrachtete Ansätze
1. **Ansatz 1: Schlankes TypeScript-Monorepo (`data/` + `packages/fmt-core` + `apps/web` + `apps/server`) im einzelnen Docker-Image** *(gewählt)*
   - *Trade-offs:* Ein kleines Docker-Image (~100 MB), null Datenbank-Wartung, identische Engine im Browser und Server (0 ms Filterlatenz + Caching), saubere React/SVG-Komponenten für komplexe Visualisierungen, native Integration von MCP Streamable HTTP im dedizierten Node-Server. Etwas mehr Build-Setup als reines Vanilla-JS, dafür hervorragend wartbar und testbar.
2. **Ansatz 2: Full-Stack Meta-Framework (Next.js / SvelteKit) mit SSR** *(verworfen)*
   - *Trade-offs:* Gute SEO out-of-the-box, aber höherer Runtime-Overhead im Container, unnötige Komplexität zwischen SSR-State und clientseitiger Caching-Engine, und spürbar hakeligere Einbindung von Remote-MCP Streamable HTTP.
3. **Ansatz 3: Direkter Ausbau des bestehenden Vanilla-JS-Prototyps** *(verworfen)*
   - *Trade-offs:* Minimale Abhängigkeiten, aber bei 100 Methoden, interaktiven Profil-SVGs, einer modularen Szenario-Partitur mit Slot-Nesting und Live-Ersatz sowie KI-Assistent wird manuelle DOM-Verwaltung schnell unübersichtlich und fehleranfällig.

### Warum Ansatz 1
Ansatz 1 verbindet maximale Ausführungsgeschwindigkeit (lokaler Browser-Cache + deterministische In-Memory-Engine) mit hoher Wartbarkeit für komplexe SVG-Visualisierungen und einem sauberen, standardkonformen MCP- & Linked-Data-Server in einem einzelnen Docker-Container. Optional kann der Node-Server bei Bedarf später leichte `<meta>`-/JSON-LD-Injection für `/methoden/:kennung` ergänzen, ohne SSR-Framework-Ballast.

---

## 4. Systemarchitektur & Repository-Struktur

```text
Facettierte-Methodentaxonomie/
├── LICENSE                         # Apache-2.0 (Software-Quellcode)
├── LICENSE-CONTENT.md              # CC-BY 4.0 (Daten, Taxonomie, Texte, Grafiken – Jan Schachtschabel)
├── README.md                       # Übersicht, Docker-Start, MCP-/API-Nutzung, Lizenzhinweis
├── Dockerfile                      # Multi-Stage Build (Node 22 Alpine, non-root, /healthz)
├── docker-compose.yml              # Beispiel-Compose mit ENV-Variablen
├── .env.example                    # LLM_BASE_URL, LLM_MODEL, LLM_API_KEY, PORT, CACHE_TTL
├── package.json                    # npm Workspaces
├── data/                           # Single Source of Truth (CC-BY 4.0)
│   ├── meta.json                   # Version, Namespace, Autor, Lizenz-IRI
│   ├── vocab.json                  # Alle 22 SKOS-ConceptSchemes + 13 Facetten-Definitionen
│   ├── ketten.json                 # Funktionsketten (Konzeptaufbau, Prozedur, Problemlösen, Fakten, 5E, ...)
│   ├── crosswalk/
│   │   └── oeh-didacticPlanningTools.json
│   ├── beispiele/                  # Beispiel-Arrangements (dichte-reihe, modul-stoffe, fehlerhafte-reihe)
│   └── bausteine/                  # ~100 Einzeldateien (<kennung>.json), je Methode eine Datei
├── packages/
│   └── fmt-core/                   # Abhängigkeitsfreier Kern (Node + Browser, ESM/TS)
│       ├── src/
│       │   ├── types.ts            # Typen für Schemes, Facetten, Bausteine, Arrangements, Anfragen
│       │   ├── validate.ts         # Port & Erweiterung von validate.js (R-00..R-12)
│       │   ├── suche.ts            # Port von suche.js (Suche + ersatz())
│       │   ├── zuordnung.ts        # Port von zuordnung.js (5-Stufen-Matcher + regelbasierter Parser)
│       │   ├── rules.ts            # Regel-Metadaten (Grundlage: formal / E / S / A)
│       │   └── index.ts
│       └── scripts/
│           └── build-artefacts.ts  # Erzeugt dist-data/: SKOS .ttl, ontologie.ttl, context.jsonld,
│                                   # fmt.schema.json, anfrage.schema.json, bausteine/*.jsonld,
│                                   # catalog.bundle.json (mit SHA-256-Content-Hash)
├── apps/
│   ├── web/                        # React + TypeScript + Vite SPA
│   │   └── src/
│   │       ├── data/               # Client-Cache-Manager (localStorage/IndexedDB + /api/v1/meta Sync)
│   │       ├── components/         # Profil-SVGs, Piktogramme, Facettenkompass, Partitur, Badges
│   │       ├── pages/              # Katalog, Methode-Detail, Vergleich, Planer, Systematik, API/MCP
│   │       └── styles/             # Editorial Design Tokens (Paper/Dark, Barlow + Literata, 4 Domänen)
│   └── server/                     # Node + TypeScript (Fastify oder Hono)
│       └── src/
│           ├── index.ts            # HTTP Server (Static SPA + REST + Linked Data + MCP + Health)
│           ├── catalog-store.ts    # Lädt dist-data/ beim Start komplett in RAM + ETag/Hash
│           ├── routes/
│           │   ├── api.ts          # /api/v1/* (meta, catalog, methods, match, validate, replacements)
│           │   ├── linked-data.ts  # /vocab/*.ttl, /bausteine/*.jsonld, /context.jsonld, /schema/*
│           │   └── assistant.ts    # /api/v1/assistant/{translate,elaborate} (OpenAI-kompatibel + Cache)
│           ├── mcp/
│           │   ├── server.ts       # MCP Server Definition (Tools, Resources, Prompts)
│           │   ├── http.ts         # Streamable HTTP Transport auf /mcp
│           │   └── stdio.ts        # Optionaler CLI-Entrypoint für lokale MCP-Clients
│           └── llm/
│               ├── client.ts       # OpenAI-kompatibler Client (ENV + optional BYOK-Header)
│               └── cache.ts        # In-Memory LRU-Cache mit TTL für LLM-Übersetzungen/Ausgestaltungen
└── docs/
    └── superpowers/specs/          # Diese Design-Spezifikation
```

---

## 5. Datenmodell, OER-Quellen & 100-Methoden-Katalog

### 5.1 Schema-Erweiterungen gegenüber FMT 0.7.0 (abwärtskompatibel & RDF-konform)
*(Detailentscheidung des Architekten – bitte prüfen)*

Alle bestehenden Felder, Vokabulare, OEH-Mappings, Regeln (R-00..R-12) und JSON-LD-Expansionen bleiben vollständig erhalten. Ergänzt werden folgende Felder am `Baustein`:

- `kurzbeschreibung` (`string`, 1–2 Sätze): prägnante Katalog-Kurzbeschreibung für Kartenansicht und MCP-Trefferlisten. JSON-LD-Mapping: `schema:description`.
- `piktogramm` (`enum` aus 12 semantischen SVG-Typen: `vortrag`, `dialog`, `gruppen`, `stationen`, `experiment`, `projekt`, `quiz`, `reflexion`, `rolle`, `visualisierung`, `debatte`, `ki`): reines Darstellungsfeld (wie `plot` und `ki`), wird beim JSON-LD-Export gestrippt, aber im Quell-Schema validiert.
- `ansatz` (`Array<code_ansatz>`): eigenes **23. SKOS-ConceptScheme** (`vocabs/ansatz.ttl` mit 12 didaktischen Traditionen/Bereichen: `instruktion`, `kooperativ`, `forschend`, `offen`, `diskurs`, `kreativ`, `visualisierung`, `uebung`, `diagnose-feedback`, `reflexion`, `spiel-simulation`, `digital-ki`). Expandiert damit sauber in den FMT-Vokabular-Namespace (`https://w3id.org/fmt/vocab/ansatz/…`) und ermöglicht zusätzlich zur Facettensuche einen niedrigschwelligen Katalog-Einstieg.
- `quellen` (`Array<{ typ?: 'Quelle', titel: string; url?: string; quelltyp: 'wikipedia' | 'oer' | 'fachliteratur' | 'institution'; lizenz?: string }>`): explizite Quellenangabe, bevorzugt freie Quellen (z. B. deutschsprachige Wikipedia, bpb, ZUM-Unterrichten, OpenEduHub/WLO, Universität Köln Methodenpool). In JSON-LD als typisierte `fmt:Quelle`-Knoten über `dct:source` (`@container: '@set'`) mit `dct:title`, `schema:url`, `fmt:quelltyp`, `dct:license`.
- `status` (`'kuratiert' | 'entwurf'`, optional, JSON-LD `fmt:status`): macht transparent, welche Bausteine bereits redaktionell geprüft sind (die bestehenden 22 Bausteine = `'kuratiert'`) und welche im Zuge der 100er-Erweiterung neu aus freien Quellen erfasst wurden (`'entwurf'`, im UI dezent als „Ersterfassung“ gekennzeichnet – ganz im Sinne der FMT-Transparenz). Alle Datensätze erscheinen unter CC-BY 4.0 (Jan Schachtschabel).
- **Lizenz- & Urheber-Metadaten** im JSON-LD-Kontext, Katalog-Graphen und allen SKOS-Dateien:
  - `dct:creator`: `"Jan Schachtschabel"`
  - `dct:license`: `<https://creativecommons.org/licenses/by/4.0/>`

### 5.2 Abdeckungsplan & Erfassungs-Policy: ~100 wichtigste Unterrichtsmethoden
*(Detailentscheidung des Architekten – bitte prüfen)*

Die bestehenden 22 Bausteine werden vollständig übernommen (`status: "kuratiert"`) und durch **78 neu erfasste Bausteine** (`status: "entwurf"`) auf **exakt 100 Bausteine** erweitert.

**Strikte Evidenz- & Quellen-Policy für alle 78 neuen Bausteine:**
- **Kein Erfinden von Meta-Analysen:** Neu erfasste Bausteine erhalten standardmäßig **Evidenzgrad C** (ehrliche Einordnung als Praxistradition / theoretische Fundierung inkl. `geltung`), es sei denn, ein bereits geprüfter Synthesebefund aus dem FMT-Literaturkorpus (z. B. Alfieri et al. 2011, Kyndt et al. 2013, Rowland 2014, Cepeda et al. 2006, Wisniewski et al. 2020, Lazonder & Harmsen 2016) greift nachweislich auf das Kernmerkmal.
- **Geprüfte freie Quellen:** Jede Methode trägt mindestens eine freie, stabile Quellenangabe (bevorzugt verifizierte deutschsprachige Wikipedia-URLs, bpb, ZUM-Unterrichten, OpenEduHub/WLO oder Standardwerke); URLs werden im Rahmen der Befüllung auf Erreichbarkeit geprüft.

| Didaktischer Bereich | Ziel-Anzahl | Beispiel-Methoden (inkl. bestehender 22) |
|---|---:|---|
| 1. Instruktion, Darbietung & Modellierung | ~11 | Lehrervortrag, Vortrag mit Selbsterklärungsprompts, Direkte Instruktion, Lösungsbeispiele mit Fading, Lautes Denken (Cognitive Modeling), Advance Organizer, Erklärvideo-Einsatz, Impulsreferat, Lehrgespräch (fragend-entwickelnd), Demonstrationsexperiment, Scaffolding / Gestufte Hilfen |
| 2. Kooperatives & kollaboratives Lernen | ~14 | Think-Pair-Share, Gruppenpuzzle (Jigsaw), Kugellager, Placemat, Lerntempo-Duett, Gruppenrallye (STAD), Gruppenturnier (TGT), Partnerinterview, Reziprokes Lesen, Schreibgespräch, Strukturierte Kontroverse, Museumsgang (Gallery Walk), World Café, Peer Instruction |
| 3. Forschendes, problem- & fallorientiertes Lernen | ~12 | VBE (Predict-Observe-Explain), Ankerfall, Erfindungsaufgabe mit Kontrastfällen, Vergleichende Instruktion, Productive Failure, Geleitetes Experiment, Problemorientiertes Lernen (POL/PBL), Fallstudie (Case Study), WebQuest, Forschendes Lernen (offen), Szenario-Technik, Design Thinking (Unterricht) |
| 4. Offener Unterricht, Freiarbeit & Reformpädagogik | ~9 | Offenes Stationenlernen, Wochenplanarbeit, Lerntheke, Freiarbeit, Lernbüro, Projektmethode (Frey), Werkstattunterricht, Projektprüfung / Lernprodukt-Werkstatt, Lernen durch Lehren (LdL) |
| 5. Diskurs, Debatte & Gesprächsformen | ~10 | Fishbowl, Pro-Contra-Debatte, Amerikanische Debatte, Podiumsdiskussion, Sokratisches Gespräch, Blitzlicht, Murmelgruppe, Vier-Ecken-Methode, Positionslinie (Meinungsbarometer), Philosophieren mit Kindern / Dilemmadiskussion |
| 6. Kreativität, Ideenfindung & Einstiege | ~8 | Brainstorming, Brainwriting (6-3-5), Methode 66, ABC-Liste, Kopfstandmethode, Walt-Disney-Methode, Provokation / Stummer Impuls, Assoziationskette / Wortwolke |
| 7. Visualisierung, Strukturierung & Textarbeit | ~10 | Concept Mapping, Mind Mapping, Strukturlegetechnik, Venn-Diagramm / Vergleichsmatrix, Fünf-Schritt-Lesemethode (SQ3R), Textlupe, Advance-Visual / Sketchnotes, Zeitleiste / Zeitstrahl, Fischgrätendiagramm (Ishikawa), Lernplakat |
| 8. Übung, Konsolidierung & Abruf | ~8 | Abrufquiz, Karteikarten (Leitner-System), Verschachteltes Üben (Interleaving), Fehleranalyse / Fehlersuche, Partnerdiktat / Laufdiktat, Domino / Trimino, Lernspiel / Quiz-Duell, Speed-Wiederholung (Brain Dump) |
| 9. Diagnose, Feedback & Assessment | ~8 | Exit-Ticket, One-Minute-Paper, Ampelabfrage / Fingerabfrage, Peer-Feedback (Kriterienraster), Zielscheiben-Feedback, Zwei Sterne und ein Wunsch, Diagnosebogen / Kompetenzraster, Kriteriengeleitetes Selbst-Assessment |
| 10. Reflexion & Metakognition | ~5 | Reflexionsprompt, Lerntagebuch mit Prompts, Lernportfolio, Lernvertrag / Zielvereinbarung, Lautes Reflektieren (Methoden-Rückschau) |
| 11. Handlungsorientierung, Spiel & Simulation | ~7 | Rollenspiel, Planspiel, Standbild / Szenisches Spiel, Simulationsexperiment, Zukunftswerkstatt, Exkursion / Außerschulischer Lernort, Erkundung / Expertenbefragung |
| 12. Digitale & KI-gestützte Methoden | ~8 | Flipped Classroom, KI-Tutor mit sokratischen Leitplanken, KI-Chat als Antwortgeber (Kontrast-Baustein), Belehrbarer KI-Agent (Teachable Agent), KI-gestütztes Text-Feedback, Prompt-Kritik & Faktencheck, Kollaboratives Etherpad/Wiki, Interaktive Simulation / Virtuelles Labor |

*(Summe: ~110 Kandidaten, konsolidiert auf exakt 100 saubere, klar abgegrenzte Bausteine ohne Doppelungen.)*

### Qualitätsregeln für alle 100 Bausteine (automatisiert getestet)
- Alle Pflichtfelder laut `fmt.schema.json` gefüllt (13 Facetten, Schnittstelle, Kernkomponenten, Praxisschicht, OEH-Kategorien, Dauer, Gruppe, Technik, Vorbereitung).
- `plot`-Koordinaten (`x` Anleitung, `y` Engagement) für das Streudiagramm aus den Facetten konsistent abgeleitet oder explizit gepflegt.
- Mindestens eine `quellen`-Angabe pro Baustein (bevorzugt freie Quellen mit stabiler URL, z. B. `de.wikipedia.org/wiki/...`, `bpb.de`, `unterrichten.zum.de`, `wirlernenonline.de`).
- Strikte Evidenz-Disziplin wie in `test.js`: Grad A nur bei ≥ 2 unabhängigen Synthesen (`;` getrennt), jeder Befund mit `geltung`; Methoden ohne belastbare Meta-Analyse erhalten ehrlich Grad C mit Hinweis auf Praxistradition/Theorie.

---

## 6. Visualisierungs- & UX-Konzept

### 6.1 Visuelle Identität
Direkte Weiterentwicklung der bestehenden Gestaltungssprache aus `Facettierte_Methodentaxonomie_FMT_0.7.0 (1).html`:
- **Editorial-Ästhetik:** Warmes Papier (`#EEF2EE`) und Oberfläche (`#F8FAF7`) im Hellmodus, tiefes Schieferblau (`#0F1B26` / `#162533`) im Dunkelmodus (umschaltbar + `prefers-color-scheme`).
- **Typografie:** `Barlow Semi Condensed` für Struktur, Labels, Daten und Überschriften; `Literata` für Lesetexte und didaktische Beschreibungen (lokal/selbst gehostet im Bundle für DSGVO-Konformität und Offline-Speed – keine Google-Fonts-Abhängigkeit!).
- **Vier semantische Domänenfarben:**
  - Domäne A (Lernprozess): Blau (`#2C5D8A` / Dark `#86B5E0`)
  - Domäne B (Steuerung & Adaptivität): Ocker/Bernstein (`#9A6A12` / Dark `#E2B65E`)
  - Domäne C (Interaktion & Medialität): Salbeigrün (`#3F7343` / Dark `#92C48F`)
  - Domäne D (Gegenstand & Zeit): Pflaume (`#7A4E7E` / Dark `#CDA0CF`)

### 6.2 Navigationsstruktur (5 klare Ansichten)
Top-Navigation: **Katalog** · **Szenario-Baukasten** · **Vergleich** · **Systematik (FMT)** · **API & MCP** (+ Theme-Switch & Cache-Status-Indikator). Footer auf jeder Seite: `CC-BY 4.0 · Jan Schachtschabel` + Link zu Lizenz, GitHub-Repo und Linked-Data-Exports.

### 6.3 Profilgrafiken & Katalog-Karten (`/`)
- **Sofortsuche & Filter:** Suchfeld (durchsucht Name, Synonyme, Varianten, Phasennamen wie „Einstieg“/„Sicherung“, Kurzbeschreibung) + schnelle Filterleiste (Lernfunktion, Reichweite R1–R4, Anleitungsgrad, Engagementmodus, Zeitbudget, Gruppengröße, max. Technik, Evidenzgrad) + ausklappbare Expertenfilter (alle 13 Facetten, Vor-/Nachbedingungen, Adaptivität, ohne KI, didaktischer Ansatz). Umschaltbar zwischen **Karten-Grid** und **kompakter Tabelle**.
- **Visuelle Methodenkarte:**
  - Links oben: kleines, reduziertes **Methoden-Piktogramm (SVG)** + Reichweiten-Badge (`R1`/`R2`/`R3`).
  - Rechts oben: **Mini-Profil-Kompass (SVG, 48×48 px)** – eine stilisierte 13-Speichen-Signatur in den 4 Domänenfarben, bei der Ausprägung/Intensität sofort visuell ablesbar ist (z. B. hohe Anleitung vs. hohe Interaktion vs. KI-Ring).
  - Körper: Methodenname, Synonyme, 1–2 Sätze Kurzbeschreibung, primäre Lernfunktionen als Chips.
  - Fußzeile: Dauer (`15–45 min`), Gruppengröße, Technik-Symbol, Evidenz-Plakette (`A`/`B`/`C`), Aktionen: *Details*, *Vergleichen (+)*, *In Baukasten*.

### 6.4 Methoden-Detailseite (`/methoden/:kennung`) & Vergleich (`/vergleich`)
- **Kopfbereich:** Name, Synonyme, Kurzbeschreibung, Reichweite, Quick-Facts (Dauer, Vorbereitung, Gruppengröße, Teilgruppen, Technik, Internet) + großes **interaktives 13-Facetten-Profilrad (SVG)** (angelehnt an den Facettenkompass: jede der 13 Facetten zeigt die konkreten Werte der Methode; Hover/Klick zeigt Leitfrage, Kodier-Inferenzgrad und Fundierung).
- **Steuerungsprofil (Peschel, Facette B2):** 5-Zeilen-Balkendiagramm (Organisation, Lernweg, Inhalt, Sozialbeziehung, Bewertung) auf der Skala *Lehrkraft ↔ geteilt ↔ Lernende*.
- **Schnittstellen-Visualisierung (SVG/Flow):** Links *Vorbedingungen* (Lernzustände) → Mitte *Baustein + ggf. eingebettete Slots* → Rechts *Nachbedingungen* (Lernzustände) → darunter direkt verlinkt: *„Passt gut davor“* und *„Passt gut danach“* (deterministisch aus den Lernzuständen berechnet!).
- **Praxisschicht & Qualität:** Problem, nummerierte Durchführungsschritte, Material & Raum, Varianten, Q1 Kernkomponenten, Q2 Bedingungen/Vorwissen, Q3 Qualitätsrisiken, Q4 Evidenz (mit Grad, Quelle, Geltung, Gegenposition).
- **Quellen & Zitieren:** Klickbare freie Quellenangaben (Wikipedia/OER/Literatur) + fertiger CC-BY-4.0-Zitierhinweis + JSON-LD-Download.
- **Methodenvergleich (`/vergleich`):** Zwei Methoden nebeneinander mit **Dual-Profil-Overlay-SVG**, 5-Achsen-Steuerungsvergleich und der farblich hervorgehobenen 13-Facetten-Differenztabelle.

### 6.5 Modularer Szenario-Baukasten & LLM-Assistent (`/planer`)
Weiterentwicklung des `#bandsvg` und des Planers aus der HTML zu einer **interaktiven didaktischen Partitur**:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ 1. SZENARIO-EINGABE & KI-ASSISTENT                                         │
│ [ Freitext: "Unterrichtsreihe Physik Kl. 7: Dichte verstehen, 270 min..." ]│
│ [⚡ Sofort zuordnen (Regeln)]  [✨ Mit KI verstehen & planen]  [Beispiele] │
│ Erkannte Kriterien: [Zieltyp: Konzeptaufbau ×] [Sek I ×] [Wenig Vorwissen] │
├────────────────────────────────────────────────────────────────────────────┤
│ 2. DIDAKTISCHE PARTITUR (Umschaltbar: [Modulare Partitur] [Zeitband SVG])  │
│                                                                            │
│  Schritt 1 ──(Fehlvorst. sichtbar)──▶ Schritt 2 ──(Konzept gesichert)──▶ … │
│ ┌──────────────────────┐            ┌─────────────────────────────────┐    │
│ │ R2 Vorhersage-Beob.  │            │ R3 Productive Failure [Komposit]│    │
│ │ [30 min] [geleitet]  │            │ ┌─────────────┐ ┌─────────────┐ │    │
│ │  └ Slot: Austausch   │            │ │Slot: Gener. │ │Slot: Konsol.│ │    │
│ │    [R1 Think-Pair]   │            │ │R2 Erfindung │ │R2 Vergl.Ins.│ │    │
│ │ [⇄ Ersatz] [⚙ Edit]  │            │ │[45m][offen] │ │[40m][expl.] │ │    │
│ └──────────────────────┘            │ └─────────────┘ └─────────────┘ │    │
│                                     └─────────────────────────────────┘    │
│ ── Parallel (Begleitstrang): ═══ [R3 Lerntagebuch mit Prompts · 20 min] ══ │
│ ── Wiederkehr (verteilt):    ····· [◆ Abrufquiz] ····· [◆ Abrufquiz] ····· │
├────────────────────────────────────────────────────────────────────────────┤
│ 3. LIVE-VALIDATOR (R-00..R-12)      │ 4. KI-AUSGESTALTUNG & EXPORT         │
│ ✓ Gültig · 0 Fehler · 0 Warnungen   │ [✨ Fachlich für Thema ausformulieren]│
│ Dauer: 255 / 270 min                │ [Druck/PDF] [Markdown] [SVG] [JSONLD]│
│ Erreichte Zustände: [Vorwissen ✓]…  │ (Hinweis: Leitplanken immer sichtbar)│
└────────────────────────────────────────────────────────────────────────────┘
```

- **Editiermodell der Partitur *(Detailentscheidung des Architekten)*:** Der Planer arbeitet direkt auf dem echten, rekursiven FMT-`Arrangement`-Datenmodell (immutable Baum-Operationen, synchron zu den Validator- und `ersatz()`-Pfaden):
  - Standardmäßig startet man **zieltypgeführt** entlang einer Funktionskette (oder wählt „Freier Ablauf“ ohne feste Kette) bzw. lädt eines der geprüften Beispiele (z. B. `dichte-reihe`) oder importiert ein JSON-LD-Arrangement.
  - Schritte lassen sich hinzufügen, entfernen, umsortieren und bei Bedarf in eine **Alternative** (2 Zweige mit Kriterium nach Diagnose/Wahl) umwandeln.
  - „In Baukasten“ auf einer Katalogkarte hängt den Baustein als neuen Schritt an (oder ersetzt gezielt einen ausgewählten Slot/Schritt).
- **Lernzustands-Verbinder:** Zwischen den Schritten zeigen farbige Konnektor-Pills, welche Lernzustände von Schritt *n* an Schritt *n+1* übergeben werden – fehlende Vorbedingungen (R-03) oder offene Phasen ohne Sicherung (R-05) sind sofort visuell lokalisierbar.
- **Schachtelbare Modul-Karten (R3 → R2 → R1):** Komposit- und Slot-Bausteine zeigen ihre Slots direkt eingebettet als „Taschen“ im übergeordneten Baustein. Jeder Slot lässt sich direkt befüllen, in der Dauer anpassen oder per Klick über **`ersatz()`** durch formal gültige Alternativen austauschen (mit explizitem FMT-Hinweis: *„Passt formal – gleiche Wirkung nicht garantiert“*).
- **Vollständige Unterstützung aller Operatoren:** *Sequenz*, *Schachtelung*, *Parallel* (Begleitstrang), *Wiederkehr* (verteilte Marker auf der Zeitachse) und *Alternative* (adaptive Verzweigung nach Diagnose/Wahl).
- **Zweite Ansicht (Kompaktes Zeitband-SVG):** Das bewährte, zeitproportionale Reichweiten-Band (`#bandsvg`) bleibt als umschaltbare & exportierbare SVG-Grafik erhalten (ideal für Unterrichtsentwürfe und Präsentationen).
- **KI-Assistent (optional):**
  - *Schritt A:* „Mit KI verstehen“ schickt nur den Freitext an `/api/v1/assistant/translate` → liefert strukturierte `anfrage.schema.json`-Kriterien zurück, die der Nutzer als transparente Chips sieht und korrigieren kann → deterministische Zuordnung & Prüfung läuft sofort.
  - *Schritt B:* „Fachlich ausformulieren“ schickt das **validierte** Arrangement + Thema/Klassenstufe an `/api/v1/assistant/elaborate` → generiert konkrete Aufgabenideen, Moderationsimpulse und Übergänge zu exakt den gewählten Bausteinen (mit eingeblendetem Leitplanken-Banner).

### 6.6 Systematik-Erklärseite (`/systematik`) & API/MCP-Seite (`/api-mcp`)
- **`/systematik`:** Übernimmt alle starken interaktiven Visualisierungen aus der bestehenden HTML: interaktiver **13-Facetten-Kompass** + Querschnittsmodule Q1–Q5, **2-Achsen-Tabelle (R×S)** & 3 Ebenen, **Streudiagramm „Lenkung ≠ Aktivität“** (erweitert auf alle 100 Methoden mit Filter nach Reichweite/Ansatz/KI und Klick-Vorschau), die **6 Operator-Glyphen**, **13 Kompositionsregeln** mit Grundlagen-Legende (`formal`/`[E]`/`[S]`/`[A]`), **Lückenmatrix**, **Evidenz & überholte Mythen** sowie **Grenzen**.
- **`/api-mcp`:** Zeigt die Live-Endpunkte, Copy-Paste-Konfiguration für MCP-Clients (Streamable HTTP URL + lokales `stdio`), interaktive Beispiel-Requests, Links zu SKOS/JSON-LD/JSON-Schema und die CC-BY-4.0-Nutzungsbedingungen.

---

## 7. API-, MCP-, Caching- & LLM-Architektur

### 7.1 Performance & Caching-Strategie
1. **Build-Zeit:** `build-artefacts.ts` erzeugt alle SKOS/JSON-LD/Schema-Dateien sowie `catalog.bundle.json` (alle 100 Bausteine, Schemes, Ketten, Beispiele, OEH-Labels) und berechnet einen deterministischen **SHA-256-Content-Hash** (`versionHash`).
2. **Server (In-Memory):** Beim Container-Start lädt `catalog-store.ts` das Bundle, die kompilierten Artefakte und den vorkonfigurierten `fmt-core` (Suche, Validator, Matcher) vollständig in den Arbeitsspeicher. Null Festplatten-I/O pro Request; Antworten < 1 ms.
3. **HTTP-Caching:** `GET /api/v1/catalog` und alle Linked-Data-Dateien senden starke `ETag` (`"<versionHash>"`) und `Cache-Control: public, max-age=300, stale-while-revalidate=86400`; bei passendem `If-None-Match` antwortet der Server mit `304 Not Modified`. Statische JS/CSS-Assets von Vite nutzen `Cache-Control: public, max-age=31536000, immutable`.
4. **Client-Cache & Abgleich in der Web-App:**
   - Beim App-Start liest der Client zunächst sofort den gecachten Katalog aus `localStorage` / IndexedDB (sofortiges Rendering ohne Wartezeit).
   - Im Hintergrund prüft er leichtgewichtig `GET /api/v1/meta` (~200 Bytes). Nur wenn `versionHash` abweicht, wird `GET /api/v1/catalog` neu geladen und der lokale Cache atomar aktualisiert (mit dezentem Hinweis „Katalog aktualisiert“).
5. **LLM-Cache:** Serverseitiger In-Memory-LRU-Cache (z. B. 500 Einträge, konfigurierbare TTL, Key = Hash aus normalisierter Anfrage + Modellname + `versionHash`). Identische Szenario-Übersetzungen kosten 0 Tokens.

### 7.2 MCP-Server (`/mcp` Streamable HTTP + `stdio`)
Implementiert mit `@modelcontextprotocol/sdk`:
- **Tools:**
  - `search_methods` – Facettierte Suche nach Text/Synonymen, Facetten, Reichweite, Zeit, Gruppe, Technik, Lernzuständen, Evidenzgrad, Ansatz (liefert kompakte Treffer + Gesamtzahl, damit Agent-Kontext schlank bleibt).
  - `get_method` – Vollständiges Profil eines Bausteins inkl. Durchführung, Kernkomponenten, Evidenz und Quellen.
  - `compare_methods` – Facette-für-Facette-Vergleich zweier Bausteine (zeigt gezielt Unterschiede).
  - `match_scenario` – 5-Stufen-Zuordnung für eine Phase oder einen kompletten geprüften Ablauf (strukturiert oder Freitext).
  - `validate_arrangement` – Prüft ein beliebiges FMT-Arrangement gegen R-00 bis R-12 und gibt Meldungen inkl. Regelgrundlage (`formal`/`E`/`S`/`A`) zurück.
  - `suggest_replacements` – Berechnet formal gültige Ersatzbausteine an einem Knotenpfad via `ersatz()`.
  - `list_vocabularies` – Liefert erlaubte Codes & Labels für Facetten, Lernzustände, Ketten und Anfragefelder.
- **Resources:**
  - `fmt://catalog/summary` (kompakte Übersicht aller 100 Methoden)
  - `fmt://method/{kennung}` (vollständiger Baustein als JSON-LD)
  - `fmt://vocab/{scheme}` (SKOS/JSON-Vokabular)
  - `fmt://schema/anfrage` & `fmt://schema/fmt`
  - `fmt://rules` (alle 13 Regeln mit Grundlage)
- **Prompts:**
  - `design_learning_scenario` (Anleitung für externe Agents inkl. der 4 FMT-Leitplanken)
  - `audit_lesson_plan` (Anleitung zur Regelprüfung eines bestehenden Entwurfs)

### 7.3 REST- & Linked-Data-Endpunkte
- **REST JSON (`/api/v1/`):**
  - `GET /api/v1/meta` (Version, `versionHash`, Anzahl Bausteine, LLM-Verfügbarkeit, Lizenz, Autor)
  - `GET /api/v1/catalog` (komplettes Bundle mit `ETag`)
  - `GET /api/v1/methods` (Query-Parameter analog `suche.js`)
  - `GET /api/v1/methods/:kennung`
  - `GET /api/v1/fields` & `GET /api/v1/schema`
  - `GET /api/v1/match` & `POST /api/v1/match` (5-Stufen-Zuordnung)
  - `POST /api/v1/validate` (Regelprüfung R-00..R-12)
  - `POST /api/v1/replacements` (Ersatzbausteine für einen Arrangement-Pfad)
  - `POST /api/v1/assistant/translate` (Freitext → `anfrage.schema.json` + Fallback auf `lesen()`)
  - `POST /api/v1/assistant/elaborate` (validiertes Arrangement → fachliche Ausgestaltung)
- **Linked Data, Kanonische `w3id.org`-Auflösung & v0.7.0-Kompatibilität *(Detailentscheidung des Architekten)*:**
  - *Datei-Endpunkte:* `GET /vocabs/:scheme.ttl` (`text/turtle`), `GET /ontologie.ttl`, `GET /context.jsonld`, `GET /bausteine/katalog.jsonld`, `GET /bausteine/:kennung.jsonld`, `GET /beispiele/:id.jsonld`, `GET /schema/fmt.schema.json`, `GET /schema/anfrage.schema.json`.
  - *Kanonische IRI-Dereferenzierung (w3id.org-ready):* `GET /baustein/:kennung`, `GET /vocab/:scheme/`, `GET /vocab/:scheme/:code` und `GET /ns` unterstützen `Accept`-Content-Negotiation (`application/ld+json` / `text/turtle` liefern RDF/JSON-LD; `text/html` leitet auf die entsprechende Web-App-Ansicht `/methoden/:kennung` bzw. `/systematik`).
  - *v0.7.0-Abwärtskompatibilität:* Dünne Aliase auf `/zuordnung` (`GET`/`POST`), `/felder` (`GET`) und `/schema` (`GET`) stellen sicher, dass bestehende FMT-0.7.0-Clients unverändert funktionieren.
- **Betrieb:** `GET /healthz`

### 7.4 LLM-Konfiguration, BYOK & Sicherheit im Docker-Container *(Detailentscheidung des Architekten)*
- **ENV-Variablen:**
  - `PORT` (Standard `8080`)
  - `LLM_BASE_URL` (z. B. `https://api.openai.com/v1`, `https://generativelanguage.googleapis.com/v1beta/openai/`, `http://ollama:11434/v1`)
  - `LLM_MODEL` (z. B. `gpt-4o-mini`, `gemini-2.5-flash`, `mistral-small-latest`)
  - `LLM_API_KEY` (optional – ohne Key läuft die App im reinen deterministischen Modus).
  - `LLM_ALLOW_BYOK` (`true`/`false`, Standard `true`)
  - `LLM_RATE_LIMIT_PER_MIN` (Standard `20` pro IP)
  - `CORS_ORIGIN` (Standard `*` für öffentliche OER-API/MCP)
- **SSRF-Schutz bei BYOK:** Der Server proxyt **niemals** frei eingegebene `baseUrl`-Werte aus dem Browser. Im BYOK-Modus (`sessionStorage`, nie geloggt) darf der Nutzer entweder (a) eigenen API-Key + Modell gegen den serverseitig konfigurierten Endpoint bzw. eine feste öffentliche HTTPS-Provider-Allowlist (OpenAI, Gemini, Mistral, OpenRouter) nutzen, oder (b) für eigene/lokale Endpunkte optional direkt aus dem Browser anfragen. BYOK-Anfragen teilen keinen serverseitigen Cache mit dem Default-Key.
- **Kostenschutz & Robustheit:** Strict JSON-Schema-Output (mit Fallback-JSON-Extraktion + Schema-Validierung gegen `anfrage.schema.json`), harte Timeouts (20 s), Max-Token-Limits, IP-Rate-Limiting und LRU-Cache.

---

## 8. Migrationsgrenze & Verifikation

### 8.1 Umgang mit `wissen/fmt/` und Legacy-HTML *(Detailentscheidung des Architekten)*
- Das GitHub-Repository `janschachtschabel/Facettierte-Methodentaxonomie` enthält ausschließlich das saubere Root-Monorepo (`data/`, `packages/`, `apps/`, `docs/`). Der lokale Ordner `wissen/` bleibt auf dem Entwicklungsrechner als Referenz erhalten (wird nicht als Legacy-Duplikat ins neue Repo gepusht).
- Die alte Single-File-HTML (`methodentaxonomie.html`) wird durch die neue React-SPA (`apps/web`) abgelöst; die bisherige JSDOM-Prüfung (#16 in `wissen/fmt/test/test.js`) wird durch moderne Frontend-Komponenten- und Integrationstests ersetzt. Alle fachlichen, semantischen und API-bezogenen Checks (#1–#15, #17, #18) werden vollständig in die neue Testsuite übernommen und auf alle 100 Bausteine ausgeweitet.

### 8.2 Qualitätskriterien & automatisierte Nachweise
Vor Abschluss werden folgende Nachweise automatisiert geprüft:
1. **Taxonomie- & Daten-Integrität (`fmt-core`):** Turtle/SKOS-Parsing aller 23 Vokabulare + Ontologie mit `n3`, JSON-Schema-Validierung mit `ajv`, JSON-LD-Expansion & RDF-Quads mit `jsonld`, OEH-Crosswalk-Check, Pflicht-Quellenangaben, Evidenzgrad-A-Regel (≥ 2 Synthesen), Validator R-00..R-12, Suche, `ersatz()` und 5-Stufen-Matcher für **alle 100 Bausteine**.
2. **Server-, API-, MCP- & LLM-Tests (`apps/server`):** End-to-End-Tests für REST-Endpunkte, `ETag`/`304`-Caching, Linked-Data-Content-Types, MCP-Tool-Aufrufe & Resources über Streamable HTTP, sowie LLM-Translate/Elaborate mit gemocktem OpenAI-kompatiblen Server inkl. Fallback ohne API-Key.
3. **Frontend-Build & UI-Prüfung (`apps/web`):** TypeScript-Check, Production-Build, Komponenten-/Logiktests für Client-Cache-Sync und Partitur-Logik sowie Live-Prüfung der gerenderten Web-App.
4. **Docker-Verification:** Erfolgreicher `docker build` (falls Docker lokal verfügbar) oder vollständige Verifikation des Production-Startskripts (`node apps/server/dist/index.js`) inkl. `/healthz`, Web-App-Auslieferung und `/mcp`-Handshake.

---

## 9. Was dem Builder überlassen bleibt

- Konkrete Wahl des Node-HTTP-Frameworks (`fastify` vs. `hono`) und Test-Runners (`vitest` vs. `node:test`).
- Styling-Mechanismus in `apps/web` (CSS Modules / Vanilla CSS mit Custom Properties oder Tailwind – solange die definierten Editorial-Design-Tokens, Typografie, 4 Domänenfarben und Hell-/Dunkelmodus exakt eingehalten werden).
- Exakte interne SVG-Geometrie der 12 Methoden-Piktogramme und des 13-Facetten-Mini-Fingerprints (solange lesbar, barrierefrei und im einheitlichen Strichstil).
- Lokale Font-Einbindung (z. B. via `@fontsource/barlow-semi-condensed` und `@fontsource/literata`).
