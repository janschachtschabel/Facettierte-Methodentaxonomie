import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { FMT_GUARDRAILS, type Arrangement, type MatchRequest } from '@fmt/core';
import type { CatalogStore } from '../catalog-store.js';
import type { ServerConfig } from '../config.js';
import { LruTtlCache } from '../llm/cache.js';
import {
  ByokValidationError,
  callChatCompletion,
  extractJsonObject,
  resolveLlmTarget,
  type LlmOverride
} from '../llm/client.js';

function readByokHeaders(req: FastifyRequest, bodyObj?: Record<string, unknown> | null): LlmOverride {
  const h = req.headers;
  const headerStr = (name: string) => {
    const v = h[name];
    return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined;
  };
  const bodyBaseUrl =
    bodyObj && typeof bodyObj.baseUrl === 'string'
      ? bodyObj.baseUrl
      : bodyObj && typeof bodyObj.llmBaseUrl === 'string'
        ? bodyObj.llmBaseUrl
        : undefined;
  return {
    apiKey: headerStr('x-llm-api-key'),
    model: headerStr('x-llm-model'),
    provider: headerStr('x-llm-provider'),
    baseUrl: headerStr('x-llm-base-url') || headerStr('x-llm-endpoint') || bodyBaseUrl
  };
}

function collectUsedBlocks(node: unknown, out = new Set<string>()): Set<string> {
  if (!node || typeof node !== 'object') return out;
  const n = node as Record<string, unknown>;
  if (typeof n.baustein === 'string') out.add(n.baustein);
  if (Array.isArray(n.teile)) n.teile.forEach((x) => collectUsedBlocks(x, out));
  if (Array.isArray(n.begleitend)) n.begleitend.forEach((x) => collectUsedBlocks(x, out));
  if (Array.isArray(n.optionen)) n.optionen.forEach((x) => collectUsedBlocks(x, out));
  if (Array.isArray(n.belegung)) n.belegung.forEach((x) => collectUsedBlocks((x as { inhalt?: unknown }).inhalt, out));
  if (n.haupt) collectUsedBlocks(n.haupt, out);
  return out;
}

export function registerAssistantRoutes(app: FastifyInstance, store: CatalogStore, config: ServerConfig) {
  const ajv = new Ajv2020({ strict: false, validateFormats: false, allErrors: true });
  const validateAnfrage = ajv.compile(store.anfrageSchemaObj);
  const translateCache = new LruTtlCache<{ anfrage: MatchRequest }>(config.llmCacheMax, config.llmCacheTtlMs);
  const elaborateCache = new LruTtlCache<string>(config.llmCacheMax, config.llmCacheTtlMs);
  const diffCache = new LruTtlCache<Record<string, Array<{ groupId: string; groupLabel: string; measure: string }>>>(
    config.llmCacheMax,
    config.llmCacheTtlMs
  );
  const materialCache = new LruTtlCache<string>(config.llmCacheMax, config.llmCacheTtlMs);

  const hashKey = (parts: unknown[]) =>
    crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex');

  const rateLimitConfig = {
    rateLimit: {
      max: config.llmRateLimitPerMin,
      timeWindow: '1 minute'
    }
  };

  app.post('/api/v1/assistant/translate', { config: rateLimitConfig }, async (req, reply) => {
    const body = req.body as { text?: string } | null;
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (!text) return reply.code(400).send({ fehler: 'Bitte ein Szenario im Feld „text“ angeben.' });
    if (text.length > 4000) return reply.code(400).send({ fehler: 'Eingabetext zu lang (max. 4000 Zeichen).' });

    let target;
    try {
      target = resolveLlmTarget(config, readByokHeaders(req, body as Record<string, unknown> | null));
    } catch (e) {
      if (e instanceof ByokValidationError) return reply.code(400).send({ fehler: e.message });
      throw e;
    }

    const fallback = (hinweis: string) => {
      const ergebnis = store.matcher.zuordnen({ text });
      return reply.send({
        quelle: 'regeln-fallback',
        gecacht: false,
        hinweis,
        anfrage: ergebnis.kriterien,
        ergebnis,
        leitplanken: FMT_GUARDRAILS
      });
    };

    if (!target) {
      return fallback('Kein LLM-API-Key konfiguriert – deterministische Regel-Zuordnung wurde direkt ausgeführt.');
    }

    const cacheKey = hashKey(['translate', store.bundle.versionHash, target.model, text.toLowerCase()]);
    if (!target.isByok) {
      const cached = translateCache.get(cacheKey);
      if (cached) {
        const ergebnis = store.matcher.zuordnen(cached.anfrage);
        return reply.send({
          quelle: 'llm',
          gecacht: true,
          anfrage: cached.anfrage,
          ergebnis,
          leitplanken: FMT_GUARDRAILS
        });
      }
    }

    const systemPrompt =
      'Du übersetzt deutsche Unterrichtsszenarien strikt in ein JSON-Objekt gemäß folgendem FMT-Anfrage-Schema. ' +
      'Antworte AUSSCHLIESSLICH mit einem gültigen JSON-Objekt ohne Erklärtext. ' +
      'Verwende NUR erlaubte Enum-Codes aus dem Schema. Setze das Feld "text" NICHT.\n' +
      'Wichtige Zuordnungsregeln:\n' +
      '- Wenn eine ganze Stunde, Doppelstunde (90 min), Einzelstunde (45 min) oder Unterrichtsreihe beschrieben wird, setze "modus": "ablauf" und wähle den passendsten "zieltyp":\n' +
      '  • "prozedur" für Rechen-/Übungs-/Verfahrenskompetenzen (z. B. Bruchrechnen, Gleichungen, Rechtschreibung, handwerkliche/sportliche Abläufe)\n' +
      '  • "konzeptaufbau" für Begriffs- und Systemverständnis (z. B. Fotosynthese, Demokratie, Wirtschaftskreislauf)\n' +
      '  • "problemloesen" für offene Anwendungs-/Transferprobleme\n' +
      '  • "faktenwissen" für Vokabeln, Begriffslisten, Merkwissen\n' +
      '  • "fuenf-e" für forschend-entdeckende naturwissenschaftliche Einheiten\n' +
      '- Wenn nur eine einzelne Phase gesucht wird (z. B. Einstieg, Sicherung, Diagnose, Warm-up), setze "modus": "phase" und die passende "lernfunktion".\n' +
      '- Leite naheliegende Werte aus dem schulischen Kontext ab (z. B. Bruchrechnen -> bildungsstufe "sek1", Einzelstunde -> zeitMin 45, Doppelstunde -> zeitMin 90), lass aber wirklich unbekannte Rahmenbedingungen weg.\n\n' +
      `Schema:\n${store.anfrageSchemaJson}`;

    try {
      const raw = await callChatCompletion(
        target,
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ],
        {
          jsonMode: true,
          maxTokens: 600,
          timeoutMs: config.llmTimeoutMs,
          reasoningEffort: config.llmReasoningEffort
        }
      );
      const parsed = extractJsonObject(raw);
      if (!parsed) return fallback('LLM-Antwort enthielt kein gültiges JSON – Regel-Zuordnung als Fallback genutzt.');
      delete parsed.text;
      if (!validateAnfrage(parsed) || Object.keys(parsed).length === 0) {
        return fallback('LLM-Ausgabe entsprach nicht dem FMT-Schema – Regel-Zuordnung als Fallback genutzt.');
      }
      const ruleParsed = store.matcher.lesen(text).kriterien;
      const merged: Record<string, unknown> = { ...ruleParsed, ...parsed };
      if (!merged.modus && (merged.zieltyp || merged.zielart) && !merged.lernfunktion && !merged.liefert) {
        merged.modus = 'ablauf';
      }
      const anfrage = (validateAnfrage(merged) ? merged : parsed) as MatchRequest;
      const ergebnis = store.matcher.zuordnen(anfrage);
      if (!target.isByok) translateCache.set(cacheKey, { anfrage });
      return reply.send({
        quelle: 'llm',
        gecacht: false,
        anfrage,
        ergebnis,
        leitplanken: FMT_GUARDRAILS
      });
    } catch (e) {
      req.log.warn({ model: target.model, err: e instanceof Error ? e.message : String(e) }, 'LLM translate failed; using rule fallback');
      return fallback('LLM derzeit nicht erreichbar – deterministische Regel-Zuordnung als Fallback genutzt.');
    }
  });

  app.post('/api/v1/assistant/elaborate', { config: rateLimitConfig }, async (req, reply) => {
    const body = req.body as {
      arrangement?: Arrangement;
      thema?: string;
      fach?: string;
      hinweise?: string;
      lernziele?: string;
      problemstellung?: string;
      differenzierung?: unknown;
      oerRessourcen?: unknown;
    } | null;

    if (!body?.arrangement || body.arrangement.typ !== 'Arrangement') {
      return reply.code(400).send({ fehler: 'Bitte ein gültiges FMT-Arrangement übergeben.' });
    }

    let target;
    try {
      target = resolveLlmTarget(config, readByokHeaders(req, body as Record<string, unknown> | null));
    } catch (e) {
      if (e instanceof ByokValidationError) return reply.code(400).send({ fehler: e.message });
      throw e;
    }

    if (!target) {
      return reply.code(503).send({
        fehler: 'Für die fachliche Ausgestaltung ist kein LLM-API-Key konfiguriert. Sie können optional im Browser einen eigenen API-Key (BYOK) hinterlegen.'
      });
    }

    let pruefung;
    try {
      pruefung = store.validator.validate(body.arrangement, store.exampleRegistry);
    } catch (e) {
      return reply.code(400).send({ fehler: e instanceof Error ? e.message : 'Ungültiges Arrangement.' });
    }
    const usedIds = [...collectUsedBlocks(body.arrangement.ablauf)];
    const catalogContext = usedIds
      .map((id) => store.blocksById.get(id))
      .filter((b): b is NonNullable<typeof b> => Boolean(b))
      .map((b) => ({
        kennung: b.kennung,
        name: b.name,
        reichweite: b.reichweite,
        kurzbeschreibung: b.kurzbeschreibung,
        problem: b.problem,
        durchfuehrung: b.durchfuehrung,
        material: b.material,
        raum: b.raum,
        kernkomponente: b.kernkomponente.map((k) => k.name),
        qualitaetsrisiko: b.qualitaetsrisiko,
        evidenz: b.evidenz,
        quellen: b.quellen
      }));

    const cacheKey = hashKey([
      'elaborate-v4',
      store.bundle.versionHash,
      target.model,
      body.thema || '',
      body.fach || '',
      body.lernziele || '',
      body.problemstellung || '',
      body.hinweise || '',
      body.differenzierung || null,
      body.oerRessourcen || null,
      body.arrangement
    ]);

    if (!target.isByok) {
      const cached = elaborateCache.get(cacheKey);
      if (cached) {
        return reply.send({ gecacht: true, pruefung, ausarbeitung: cached, leitplanken: FMT_GUARDRAILS });
      }
    }

    const systemPrompt =
      'Du bist ein didaktischer Planungsassistent für die Facettierte Methodentaxonomie (FMT). ' +
      'Deine Aufgabe ist es, ein bereits komponiertes und geprüftes Arrangement zu einer praxisfertigen Beschreibung der gesamten Unterrichtsstunde bzw. Unterrichtsreihe auszuarbeiten.\n' +
      'AUFBAU (klares deutsches Markdown):\n' +
      '1. **Kurzüberblick & Lernziele** (Fach, Thema, Zielgruppe, Gesamtdauer, Granularität/Reichweite)\n' +
      '2. **Detaillierter Ablauf & Methodenanwendung** – Phase für Phase mit Zeitangaben, konkreten Aufgaben- und Moderationsimpulsen, Materialien und Übergängen. Wenn ein Baustein über Slots verschachtelt ist (z. B. R3-Container mit R2-/R1-Unterbausteinen), mache klar sichtbar, welche Methode Teil welchen Blocks ist. Berücksichtige auch Begleitstränge (Parallel) und verteilte Wiederkehr.\n' +
      '3. **Kernkomponenten, Qualitätsrisiken & Prüferhinweise** – benenne die wichtigsten Kernkomponenten und etwaige offene Validator-Warnungen/Fehler ehrlich inkl. Grundlage.\n' +
      '4. **Verwendete Methoden & Quellenverzeichnis** – liste alle eingesetzten Methoden mit ihren verifizierten Quellen-Titeln und Markdown-Links (`[Titel](URL)`) aus den übergebenen Katalogdaten auf.\n' +
      'STRENGE REGELN:\n' +
      '- Erfinde KEINE neuen Unterrichtsmethoden, keine neuen Studien und KEINE URLs außerhalb der übergebenen Katalogdaten.\n' +
      '- Evidenzbefunde immer nur mit ihrer Geltung und Gegenposition nennen.';

    const userPrompt =
      `AUSGESTALTUNG für Fach: ${body.fach || 'nicht angegeben'}, Thema: ${body.thema || 'nicht angegeben'}.\n` +
      (body.lernziele ? `Lernziele:\n${body.lernziele}\n` : '') +
      (body.problemstellung ? `Didaktische Ausgangslage / Problemstellung:\n${body.problemstellung}\n` : '') +
      (body.hinweise ? `Zusätzliche Hinweise: ${body.hinweise}\n` : '') +
      (body.differenzierung ? `\nBinnendifferenzierung / Lerngruppen:\n${JSON.stringify(body.differenzierung, null, 2)}\n` : '') +
      (body.oerRessourcen ? `\nVerknüpfte WLO/OER-Ressourcen:\n${JSON.stringify(body.oerRessourcen, null, 2)}\n` : '') +
      `\nArrangement (JSON):\n${JSON.stringify(body.arrangement, null, 2)}\n\n` +
      `Prüfungsergebnis:\n${JSON.stringify(pruefung, null, 2)}\n\n` +
      `Katalogdaten der verwendeten Bausteine (inkl. Durchführung, Material und verifizierten Quellen):\n${JSON.stringify(catalogContext, null, 2)}`;

    try {
      const ausarbeitung = await callChatCompletion(
        target,
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        {
          jsonMode: false,
          maxTokens: 2400,
          timeoutMs: config.llmTimeoutMs,
          reasoningEffort: config.llmReasoningEffort
        }
      );
      if (!target.isByok) elaborateCache.set(cacheKey, ausarbeitung);
      return reply.send({ gecacht: false, pruefung, ausarbeitung, leitplanken: FMT_GUARDRAILS });
    } catch (e) {
      return reply.code(502).send({
        fehler: e instanceof Error ? e.message : 'LLM-Ausgestaltung fehlgeschlagen.'
      });
    }
  });

  app.post('/api/v1/assistant/differentiate', { config: rateLimitConfig }, async (req, reply) => {
    const body = req.body as {
      phases?: Array<{ key: string; phaseLabel: string; methodId: string; durationMin: number }>;
      gruppen?: Array<{ id: string; label: string; profile: string }>;
      fach?: string;
      thema?: string;
      bildungsstufe?: string;
      hinweise?: string;
    } | null;

    const phases = Array.isArray(body?.phases) ? body!.phases.slice(0, 20) : [];
    const gruppen = Array.isArray(body?.gruppen) ? body!.gruppen.slice(0, 6) : [];
    if (!phases.length || !gruppen.length) {
      return reply.code(400).send({ fehler: 'Bitte Phasen und mindestens eine Lerngruppe übergeben.' });
    }

    let target;
    try {
      target = resolveLlmTarget(config, readByokHeaders(req, body as Record<string, unknown> | null));
    } catch (e) {
      if (e instanceof ByokValidationError) return reply.code(400).send({ fehler: e.message });
      throw e;
    }

    if (!target) {
      return reply.code(503).send({
        fehler: 'Für KI-Binnendifferenzierung ist kein LLM-API-Key konfiguriert. Die regelbasierten FMT-Hinweise stehen weiterhin direkt zur Verfügung.'
      });
    }

    const enrichedPhases = phases.map((p) => {
      const b = store.blocksById.get(p.methodId);
      return {
        key: p.key,
        phaseLabel: p.phaseLabel,
        durationMin: p.durationMin,
        methodId: p.methodId,
        methodName: b?.name || p.methodId,
        anleitung: b?.anleitung || [],
        adaptivitaet: b?.adaptivitaet || [],
        durchfuehrung: b?.durchfuehrung || [],
        variante: b?.variante || [],
        qualitaetsrisiko: b?.qualitaetsrisiko || []
      };
    });

    const cacheKey = hashKey([
      'diff-v1',
      store.bundle.versionHash,
      target.model,
      body?.fach || '',
      body?.thema || '',
      body?.bildungsstufe || '',
      body?.hinweise || '',
      gruppen,
      enrichedPhases.map((p) => [p.key, p.methodId, p.durationMin])
    ]);

    if (!target.isByok) {
      const cached = diffCache.get(cacheKey);
      if (cached) {
        return reply.send({ gecacht: true, vorschlaege: cached, leitplanken: FMT_GUARDRAILS });
      }
    }

    const systemPrompt =
      'Du bist ein Experte für Binnendifferenzierung und die Facettierte Methodentaxonomie (FMT). ' +
      'Erstelle für jede übergebene Unterrichtsphase und jede Lerngruppe eine knappe, konkret umsetzbare Differenzierungsmaßnahme (1–2 Sätze) passend zur jeweiligen FMT-Methode, zum Fach und zum Thema.\n' +
      'Antworte AUSSCHLIESSLICH mit gültigem JSON im Format:\n' +
      '{ "phasen": { "<phase.key>": [ { "groupId": "<group.id>", "groupLabel": "<group.label>", "measure": "<konkrete Maßnahme>" } ] } }\n' +
      'Verwende exakt die übergebenen phase.key- und group.id-Werte. Erfinde keine neuen Methoden.';

    const userPrompt =
      `Fach: ${body?.fach || 'nicht angegeben'}, Thema: ${body?.thema || 'nicht angegeben'}, Bildungsstufe: ${body?.bildungsstufe || 'nicht angegeben'}.\n` +
      (body?.hinweise ? `Hinweise: ${body.hinweise}\n` : '') +
      `\nLerngruppen:\n${JSON.stringify(gruppen, null, 2)}\n\n` +
      `Unterrichtsphasen mit FMT-Methoden:\n${JSON.stringify(enrichedPhases, null, 2)}`;

    try {
      const raw = await callChatCompletion(
        target,
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        {
          jsonMode: true,
          maxTokens: 1800,
          timeoutMs: config.llmTimeoutMs,
          reasoningEffort: config.llmReasoningEffort
        }
      );
      const parsed = extractJsonObject(raw) as {
        phasen?: Record<string, Array<{ groupId?: string; groupLabel?: string; measure?: string }>>;
      } | null;
      if (!parsed?.phasen || typeof parsed.phasen !== 'object') {
        return reply.code(502).send({ fehler: 'KI-Differenzierung enthielt kein gültiges JSON-Format.' });
      }
      const clean: Record<string, Array<{ groupId: string; groupLabel: string; measure: string }>> = {};
      for (const p of phases) {
        const list = Array.isArray(parsed.phasen[p.key]) ? parsed.phasen[p.key] : [];
        clean[p.key] = list
          .filter((x) => x && typeof x.measure === 'string' && x.measure.trim())
          .map((x) => {
            const g = gruppen.find((gr) => gr.id === x.groupId);
            return {
              groupId: g?.id || String(x.groupId || 'gruppe'),
              groupLabel: g?.label || String(x.groupLabel || 'Lerngruppe'),
              measure: x.measure!.trim()
            };
          });
      }
      if (!target.isByok) diffCache.set(cacheKey, clean);
      return reply.send({ gecacht: false, vorschlaege: clean, leitplanken: FMT_GUARDRAILS });
    } catch (e) {
      return reply.code(502).send({
        fehler: e instanceof Error ? e.message : 'KI-Differenzierung fehlgeschlagen.'
      });
    }
  });

  app.post('/api/v1/assistant/material', { config: rateLimitConfig }, async (req, reply) => {
    const body = req.body as {
      baustein?: string;
      phaseLabel?: string;
      dauerMin?: number;
      fach?: string;
      thema?: string;
      bildungsstufe?: string;
      materialTyp?: string;
      gruppen?: Array<{ label: string; profile: string }>;
      hinweise?: string;
    } | null;

    const methodId = typeof body?.baustein === 'string' ? body.baustein.trim() : '';
    const block = store.blocksById.get(methodId);
    if (!block) {
      return reply.code(400).send({ fehler: 'Bitte einen gültigen FMT-Methodenbaustein auswählen.' });
    }

    let target;
    try {
      target = resolveLlmTarget(config, readByokHeaders(req, body as Record<string, unknown> | null));
    } catch (e) {
      if (e instanceof ByokValidationError) return reply.code(400).send({ fehler: e.message });
      throw e;
    }

    if (!target) {
      return reply.code(503).send({
        fehler: 'Für den KI-Materialgenerator ist kein LLM-API-Key konfiguriert (optional BYOK im Browser hinterlegen).'
      });
    }

    const materialTyp = body?.materialTyp || 'arbeitsblatt';
    const cacheKey = hashKey([
      'material-v1',
      store.bundle.versionHash,
      target.model,
      methodId,
      materialTyp,
      body?.fach || '',
      body?.thema || '',
      body?.bildungsstufe || '',
      body?.dauerMin || block.dauerMin,
      body?.gruppen || [],
      body?.hinweise || ''
    ]);

    if (!target.isByok) {
      const cached = materialCache.get(cacheKey);
      if (cached) {
        return reply.send({ gecacht: true, material: cached, baustein: block.name, leitplanken: FMT_GUARDRAILS });
      }
    }

    const systemPrompt =
      'Du erstellst direkt im Unterricht einsetzbares, druckfertiges Lehrmaterial (klares deutsches Markdown) auf Basis einer konkreten FMT-Unterrichtsmethode.\n' +
      'STRUKTUR:\n' +
      '1. **Kopfzeile** (Titel, Fach, Thema, Methode, Zeitrahmen)\n' +
      '2. **Klare Arbeitsaufträge / Inhalt** – exakt passend zur gewählten FMT-Methode und deren Durchführungsschritten\n' +
      '3. **Binnendifferenzierung** – sofern Lerngruppen übergeben wurden, kennzeichne Hilfen (★ Basis / Satzstarter) und Erweiterungen (★★★ Vertiefung)\n' +
      '4. **Erwartungshorizont / Lehrkraft-Hinweise** (kurze Musterlösungen & typische Fehlvorstellungen)\n' +
      'Erfinde keine falschen Quellen-URLs.';

    const userPrompt =
      `MATERIALTYP: ${materialTyp}\n` +
      `Fach: ${body?.fach || 'nicht angegeben'} · Thema: ${body?.thema || 'nicht angegeben'} · Bildungsstufe: ${body?.bildungsstufe || 'Sekundarstufe I'}\n` +
      `Phase: ${body?.phaseLabel || 'Unterrichtsphase'} · Dauer: ${body?.dauerMin || block.dauerMin} min\n` +
      (body?.hinweise ? `Zusätzliche Hinweise: ${body.hinweise}\n` : '') +
      (body?.gruppen?.length ? `\nAktive Lerngruppen für Differenzierung:\n${JSON.stringify(body.gruppen, null, 2)}\n` : '') +
      `\nFMT-Methode:\n${JSON.stringify(
        {
          name: block.name,
          kurzbeschreibung: block.kurzbeschreibung,
          durchfuehrung: block.durchfuehrung,
          material: block.material,
          kernkomponente: block.kernkomponente.map((k) => k.name),
          qualitaetsrisiko: block.qualitaetsrisiko
        },
        null,
        2
      )}`;

    try {
      const material = await callChatCompletion(
        target,
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        {
          jsonMode: false,
          maxTokens: 2200,
          timeoutMs: config.llmTimeoutMs,
          reasoningEffort: config.llmReasoningEffort
        }
      );
      if (!target.isByok) materialCache.set(cacheKey, material);
      return reply.send({ gecacht: false, material, baustein: block.name, leitplanken: FMT_GUARDRAILS });
    } catch (e) {
      return reply.code(502).send({
        fehler: e instanceof Error ? e.message : 'Materialgenerierung fehlgeschlagen.'
      });
    }
  });
}
