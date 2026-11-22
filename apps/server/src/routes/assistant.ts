import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { FMT_GUARDRAILS, type Arrangement, type MatchRequest, type ValidationResult } from '@fmt/core';
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

export interface ThematicTableRow {
  key: string;
  orderLabel: string;
  phaseLabel: string;
  durationMin: number;
  methodId: string;
  methodName: string;
  teacherAction: string;
  learnerAction: string;
  groupAdaptations: Record<string, string>;
  materialsAndOer: string;
}

export interface ElaboratePayload {
  arrangement: Arrangement;
  thema?: string;
  fach?: string;
  didaktischerAnsatz?: string;
  akteure?: string;
  hinweise?: string;
  lernziele?: string;
  problemstellung?: string;
  differenzierung?: Array<{
    id?: string;
    gruppe: string;
    profil?: string;
    anzahl?: number;
    matrixMassnahmen?: string[];
  }>;
  oerRessourcen?: Array<{
    stepKey?: string;
    titel: string;
    wwwurl?: string;
    url?: string;
    lizenz?: string | null;
    notiz?: string;
  }>;
  materialien?: Array<{
    stepKey?: string;
    titel: string;
    typ?: string;
    kurzinhalt?: string;
  }>;
  phasen?: Array<{
    key: string;
    orderLabel: string;
    phaseLabel: string;
    durationMin: number;
    methodId: string;
    methodName: string;
    subgroupMethods?: Record<string, { methodId: string; methodName: string }>;
  }>;
}

export interface MaterialPayload {
  baustein: string;
  phaseLabel?: string;
  dauerMin?: number;
  fach?: string;
  thema?: string;
  bildungsstufe?: string;
  materialTyp?: string;
  gruppen?: Array<{ label: string; profile: string; count?: number; matrixMeasures?: string[] }>;
  hinweise?: string;
}

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

export function buildDeterministicThematicTable(
  store: CatalogStore,
  payload: ElaboratePayload
): ThematicTableRow[] {
  const thema = payload.thema?.trim() || payload.arrangement.name;
  const fach = payload.fach?.trim() || '';
  const topicTag = fach ? `${fach} – ${thema}` : thema;
  const groups = payload.differenzierung || [];
  const oers = payload.oerRessourcen || [];
  const mats = payload.materialien || [];

  const phaseList: NonNullable<ElaboratePayload['phasen']> = payload.phasen?.length
    ? payload.phasen
    : [...collectUsedBlocks(payload.arrangement.ablauf)].map((id, i) => {
        const b = store.blocksById.get(id);
        return {
          key: `step-${i}`,
          orderLabel: String(i + 1),
          phaseLabel: `Phase ${i + 1}`,
          durationMin: b?.dauerMin ?? 15,
          methodId: id,
          methodName: b?.name || id
        };
      });

  return phaseList.map((p) => {
    const b = store.blocksById.get(p.methodId);
    const stepOers = oers.filter((o) => !o.stepKey || o.stepKey === p.key);
    const stepMats = mats.filter((m) => !m.stepKey || m.stepKey === p.key);
    const firstStep = b?.durchfuehrung?.[0] || 'Phase einführen und Arbeitsauftrag transparent machen.';
    const learnerSteps = (b?.durchfuehrung || []).slice(1, 3).join(' ');

    const groupAdaptations: Record<string, string> = {};
    for (const g of groups) {
      const gKey = g.id || g.gruppe;
      const alt = p.subgroupMethods?.[gKey];
      if (alt) {
        groupAdaptations[gKey] = `Alternative Methode: ${alt.methodName} zum Thema „${thema}“ (${g.profil || 'Teilgruppe'}).`;
      } else if (g.matrixMassnahmen?.length) {
        groupAdaptations[gKey] = `Zu „${thema}“: ${g.matrixMassnahmen.slice(0, 2).join('; ')}.`;
      } else {
        groupAdaptations[gKey] = `Anpassung zu „${thema}“: ${g.profil || 'gemäß Leistungsprofil'}.`;
      }
    }

    const matParts: string[] = [];
    if (stepMats.length) {
      matParts.push(stepMats.map((m) => `Material: ${m.titel}`).join(' · '));
    }
    if (stepOers.length) {
      matParts.push(
        stepOers
          .map((o) => {
            const href = o.wwwurl || o.url || '';
            return `WLO-OER: ${o.titel}${href ? ` (${href})` : ''}`;
          })
          .join(' · ')
      );
    }
    if (!matParts.length && b?.material?.length) {
      matParts.push(b.material.slice(0, 3).join(', '));
    }

    return {
      key: p.key,
      orderLabel: p.orderLabel,
      phaseLabel: p.phaseLabel,
      durationMin: p.durationMin,
      methodId: p.methodId,
      methodName: p.methodName,
      teacherAction: `Leitet „${p.methodName}“ zu ${topicTag} an: ${firstStep}`,
      learnerAction: `Erarbeiten ${topicTag} mittels ${p.methodName}: ${learnerSteps || b?.kurzbeschreibung || 'Aufgabenbearbeitung und Sicherung.'}`,
      groupAdaptations,
      materialsAndOer: matParts.join(' | ') || 'Standardmaterial'
    };
  });
}

const sharedElaborateCache = new LruTtlCache<{ ausarbeitung: string; thematischeTabelle: ThematicTableRow[] }>(
  120,
  30 * 60 * 1000
);
const sharedMaterialCache = new LruTtlCache<string>(120, 30 * 60 * 1000);

const hashKey = (parts: unknown[]) =>
  crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex');

export async function elaborateScenarioCore(
  store: CatalogStore,
  config: ServerConfig,
  override: LlmOverride,
  body: ElaboratePayload
): Promise<{
  quelle: 'llm' | 'deterministisch';
  gecacht: boolean;
  pruefung: ValidationResult;
  ausarbeitung: string;
  thematischeTabelle: ThematicTableRow[];
}> {
  const pruefung = store.validator.validate(body.arrangement, store.exampleRegistry);
  const usedIds = [...collectUsedBlocks(body.arrangement.ablauf)];
  // Include any subgroup alternative methods too
  for (const p of body.phasen || []) {
    for (const sub of Object.values(p.subgroupMethods || {})) {
      if (sub?.methodId && !usedIds.includes(sub.methodId)) usedIds.push(sub.methodId);
    }
  }
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

  const fallbackTable = buildDeterministicThematicTable(store, body);
  const target = resolveLlmTarget(config, override);
  if (!target) {
    const mdLines = [
      `# Unterrichtsentwurf: ${body.fach ? `${body.fach} – ` : ''}${body.thema || body.arrangement.name}`,
      '',
      `- **Gesamtdauer:** ${pruefung.dauerMin} min · **Prüfstatus:** ${pruefung.gueltig ? 'Gültig' : 'Prüfhinweise offen'}`,
      ...(body.didaktischerAnsatz ? [`- **Didaktischer Ansatz:** ${body.didaktischerAnsatz}`] : []),
      ...(body.akteure ? [`- **Akteure / Lerngruppe:** ${body.akteure}`] : []),
      ...(body.lernziele ? ['', '## Lernziele', body.lernziele] : []),
      '',
      '## Thematischer Ablauf',
      ...fallbackTable.map(
        (r) =>
          `### ${r.orderLabel}. ${r.phaseLabel} – ${r.methodName} (${r.durationMin} min)\n- **Lehrkraft:** ${r.teacherAction}\n- **Lernende:** ${r.learnerAction}\n- **Materialien & OER:** ${r.materialsAndOer}`
      )
    ];
    return {
      quelle: 'deterministisch',
      gecacht: false,
      pruefung,
      ausarbeitung: mdLines.join('\n'),
      thematischeTabelle: fallbackTable
    };
  }

  const cacheKey = hashKey([
    'elaborate-v5',
    store.bundle.versionHash,
    target.model,
    body.thema || '',
    body.fach || '',
    body.didaktischerAnsatz || '',
    body.akteure || '',
    body.lernziele || '',
    body.problemstellung || '',
    body.hinweise || '',
    body.differenzierung || null,
    body.oerRessourcen || null,
    body.materialien || null,
    body.phasen || null,
    body.arrangement
  ]);

  if (!target.isByok) {
    const cached = sharedElaborateCache.get(cacheKey);
    if (cached) {
      return { quelle: 'llm', gecacht: true, pruefung, ...cached };
    }
  }

  const systemPrompt =
    'Du bist ein didaktischer Planungsassistent für die Facettierte Methodentaxonomie (FMT). ' +
    'Erstelle auf Basis des geprüften FMT-Arrangements, des Themas, der Lerngruppen/Differenzierungsmatrix, der verknüpften WLO-OER-Ressourcen (inkl. wwwurl) und erstellten Materialien einen praxisfertigen, thematisch konkretisierten Unterrichtsentwurf.\n' +
    'ANTWORTE AUSSCHLIESSLICH als gültiges JSON-Objekt mit exakt diesen zwei Feldern:\n' +
    '{\n' +
    '  "thematischeTabelle": [\n' +
    '    {\n' +
    '      "key": "<exakter phase.key>",\n' +
    '      "teacherAction": "<konkrete thematische Lehrkrafthandlung inkl. Impuls/Moderation (2-3 Sätze)>",\n' +
    '      "learnerAction": "<konkrete thematische Aktivität der Lernenden mit Bezug aufs Thema (2-3 Sätze)>",\n' +
    '      "groupAdaptations": { "<groupId>": "<konkrete thematische Anpassung oder alternative Methode für diese Teilgruppe>" },\n' +
    '      "materialsAndOer": "<konkreter Bezug auf zugeordnete Materialien & WLO-OER inkl. vollständiger wwwurl>"\n' +
    '    }\n' +
    '  ],\n' +
    '  "ausarbeitung": "<ausführliches, klares deutsches Markdown mit: 1. Kurzüberblick, Lernziele, didaktischer Ansatz & Akteure; 2. Thematische Durchführungsbeschreibung Phase für Phase mit konkreten Aufgaben-/Moderationsimpulsen, Übergängen, Material- & WLO-OER-Einbindung (immer mit vollständiger wwwurl als Markdown-Link); 3. Binnendifferenzierung & ggf. parallele Teilgruppen-Methoden; 4. Kernkomponenten, Qualitätsrisiken & verifiziertes Quellenverzeichnis aus den Katalogdaten>"\n' +
    '}\n' +
    'STRENGE REGELN:\n' +
    '- Beziehe zugeordnete WLO-OER-Inhalte (immer mit ihrer exakten wwwurl!) und erstellte Materialien aktiv in die jeweiligen Phasen ein.\n' +
    '- Erfinde KEINE neuen Methoden, keine neuen Studien und KEINE URLs außerhalb der übergebenen Katalog- und WLO-Daten.\n' +
    '- Evidenzbefunde immer nur mit ihrer Geltung und Gegenposition nennen.';

  const userPrompt =
    `FACH: ${body.fach || 'nicht angegeben'} · THEMA: ${body.thema || 'nicht angegeben'}\n` +
    (body.didaktischerAnsatz ? `Didaktischer Ansatz: ${body.didaktischerAnsatz}\n` : '') +
    (body.akteure ? `Akteure / Personenanzahl: ${body.akteure}\n` : '') +
    (body.lernziele ? `Lernziele:\n${body.lernziele}\n` : '') +
    (body.problemstellung ? `Didaktische Ausgangslage / Problemstellung:\n${body.problemstellung}\n` : '') +
    (body.hinweise ? `Zusätzliche Hinweise: ${body.hinweise}\n` : '') +
    (body.differenzierung?.length
      ? `\nLerngruppen & Binnendifferenzierungsmatrix:\n${JSON.stringify(body.differenzierung, null, 2)}\n`
      : '') +
    (body.oerRessourcen?.length
      ? `\nZugeordnete WLO-OER-Ressourcen (inkl. wwwurl – zwingend einbinden!):\n${JSON.stringify(body.oerRessourcen, null, 2)}\n`
      : '') +
    (body.materialien?.length
      ? `\nErstellte/zugeordnete Unterrichtsmaterialien:\n${JSON.stringify(body.materialien, null, 2)}\n`
      : '') +
    `\nPhasenstruktur (exakte Keys verwenden):\n${JSON.stringify(
      fallbackTable.map((r) => ({
        key: r.key,
        orderLabel: r.orderLabel,
        phaseLabel: r.phaseLabel,
        durationMin: r.durationMin,
        methodId: r.methodId,
        methodName: r.methodName,
        subgroupMethods: body.phasen?.find((p) => p.key === r.key)?.subgroupMethods
      })),
      null,
      2
    )}\n\n` +
    `Prüfungsergebnis:\n${JSON.stringify(pruefung, null, 2)}\n\n` +
    `Katalogdaten der verwendeten Bausteine (inkl. Durchführung, Material und verifizierten Quellen):\n${JSON.stringify(catalogContext, null, 2)}`;

  const raw = await callChatCompletion(
    target,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    {
      jsonMode: true,
      maxTokens: 3200,
      timeoutMs: config.llmTimeoutMs,
      reasoningEffort: config.llmReasoningEffort
    }
  );

  const parsed = extractJsonObject(raw) as {
    thematischeTabelle?: Array<{
      key?: string;
      teacherAction?: string;
      learnerAction?: string;
      groupAdaptations?: Record<string, string>;
      materialsAndOer?: string;
    }>;
    ausarbeitung?: string;
  } | null;

  const llmRows = Array.isArray(parsed?.thematischeTabelle) ? parsed!.thematischeTabelle : [];
  const mergedTable: ThematicTableRow[] = fallbackTable.map((baseRow) => {
    const match = llmRows.find((r) => r && r.key === baseRow.key);
    if (!match) return baseRow;
    const mergedGroups: Record<string, string> = { ...baseRow.groupAdaptations };
    if (match.groupAdaptations && typeof match.groupAdaptations === 'object') {
      for (const [gk, gv] of Object.entries(match.groupAdaptations)) {
        if (typeof gv === 'string' && gv.trim()) mergedGroups[gk] = gv.trim();
      }
    }
    return {
      ...baseRow,
      teacherAction: typeof match.teacherAction === 'string' && match.teacherAction.trim() ? match.teacherAction.trim() : baseRow.teacherAction,
      learnerAction: typeof match.learnerAction === 'string' && match.learnerAction.trim() ? match.learnerAction.trim() : baseRow.learnerAction,
      groupAdaptations: mergedGroups,
      materialsAndOer:
        typeof match.materialsAndOer === 'string' && match.materialsAndOer.trim()
          ? match.materialsAndOer.trim()
          : baseRow.materialsAndOer
    };
  });

  const ausarbeitung =
    typeof parsed?.ausarbeitung === 'string' && parsed.ausarbeitung.trim()
      ? parsed.ausarbeitung.trim()
      : raw.trim();

  const result = { ausarbeitung, thematischeTabelle: mergedTable };
  if (!target.isByok) sharedElaborateCache.set(cacheKey, result);
  return { quelle: 'llm', gecacht: false, pruefung, ...result };
}

export async function generateMaterialCore(
  store: CatalogStore,
  config: ServerConfig,
  override: LlmOverride,
  body: MaterialPayload
): Promise<{ quelle: 'llm' | 'deterministisch'; gecacht: boolean; material: string; baustein: string }> {
  const methodId = (body.baustein || '').trim();
  const block = store.blocksById.get(methodId);
  if (!block) {
    throw new Error('Bitte einen gültigen FMT-Methodenbaustein auswählen.');
  }

  const materialTyp = body.materialTyp || 'arbeitsblatt';
  const target = resolveLlmTarget(config, override);
  if (!target) {
    const template = [
      `# ${block.name} – ${materialTyp} (${body.fach || 'Unterricht'}: ${body.thema || 'Thema'})`,
      '',
      `- **Phase:** ${body.phaseLabel || 'Unterrichtsphase'} · **Dauer:** ${body.dauerMin || block.dauerMin} min · **Stufe:** ${body.bildungsstufe || 'Sekundarstufe I'}`,
      '',
      '## Arbeitsauftrag (auf Basis FMT-Methode)',
      ...(block.durchfuehrung || []).map((s, i) => `${i + 1}. ${s}`),
      '',
      ...(body.gruppen?.length
        ? [
            '## Binnendifferenzierung',
            ...body.gruppen.map(
              (g) => `- **${g.label}${g.count ? ` (${g.count} Pers.)` : ''}:** ${g.matrixMeasures?.slice(0, 2).join('; ') || g.profile}`
            )
          ]
        : []),
      '',
      '## Kernkomponenten & Hinweise für die Lehrkraft',
      ...(block.kernkomponente || []).map((k) => `- ${k.name}`)
    ].join('\n');
    return { quelle: 'deterministisch', gecacht: false, material: template, baustein: block.name };
  }

  const cacheKey = hashKey([
    'material-v2',
    store.bundle.versionHash,
    target.model,
    methodId,
    materialTyp,
    body.fach || '',
    body.thema || '',
    body.bildungsstufe || '',
    body.dauerMin || block.dauerMin,
    body.gruppen || [],
    body.hinweise || ''
  ]);

  if (!target.isByok) {
    const cached = sharedMaterialCache.get(cacheKey);
    if (cached) {
      return { quelle: 'llm', gecacht: true, material: cached, baustein: block.name };
    }
  }

  const systemPrompt =
    'Du erstellst direkt im Unterricht einsetzbares, druckfertiges Lehrmaterial (klares deutsches Markdown) auf Basis einer konkreten FMT-Unterrichtsmethode.\n' +
    'STRUKTUR:\n' +
    '1. **Kopfzeile** (Titel, Fach, Thema, Methode, Zeitrahmen)\n' +
    '2. **Klare Arbeitsaufträge / Inhalt** – exakt passend zur gewählten FMT-Methode und deren Durchführungsschritten\n' +
    '3. **Binnendifferenzierung** – sofern Lerngruppen und Matrix-Maßnahmen übergeben wurden, kennzeichne Hilfen (★ Basis / Satzstarter) und Erweiterungen (★★★ Vertiefung)\n' +
    '4. **Erwartungshorizont / Lehrkraft-Hinweise** (kurze Musterlösungen & typische Fehlvorstellungen)\n' +
    'Erfinde keine falschen Quellen-URLs.';

  const userPrompt =
    `MATERIALTYP: ${materialTyp}\n` +
    `Fach: ${body.fach || 'nicht angegeben'} · Thema: ${body.thema || 'nicht angegeben'} · Bildungsstufe: ${body.bildungsstufe || 'Sekundarstufe I'}\n` +
    `Phase: ${body.phaseLabel || 'Unterrichtsphase'} · Dauer: ${body.dauerMin || block.dauerMin} min\n` +
    (body.hinweise ? `Zusätzliche Hinweise: ${body.hinweise}\n` : '') +
    (body.gruppen?.length ? `\nAktive Lerngruppen & Binnendifferenzierung:\n${JSON.stringify(body.gruppen, null, 2)}\n` : '') +
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
  if (!target.isByok) sharedMaterialCache.set(cacheKey, material);
  return { quelle: 'llm', gecacht: false, material, baustein: block.name };
}

export function registerAssistantRoutes(app: FastifyInstance, store: CatalogStore, config: ServerConfig) {
  const ajv = new Ajv2020({ strict: false, validateFormats: false, allErrors: true });
  const validateAnfrage = ajv.compile(store.anfrageSchemaObj);
  const translateCache = new LruTtlCache<{ anfrage: MatchRequest }>(config.llmCacheMax, config.llmCacheTtlMs);
  const diffCache = new LruTtlCache<Record<string, Array<{ groupId: string; groupLabel: string; measure: string }>>>(
    config.llmCacheMax,
    config.llmCacheTtlMs
  );

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
      '  • "prozedur" für Rechen-/Übungs-/Verfahrenskompetenzen (z. B. Bruchrechnen, Gleichungen, Rechtschreibung)\n' +
      '  • "konzeptaufbau" für Begriffs- und Systemverständnis (z. B. Fotosynthese, Demokratie, Dichte)\n' +
      '  • "problemloesen" für offene Anwendungs-/Transferprobleme\n' +
      '  • "faktenwissen" für Vokabeln, Begriffslisten, Merkwissen\n' +
      '  • "fuenf-e" für forschend-entdeckende naturwissenschaftliche Einheiten\n' +
      '- Wenn ein didaktischer Ansatz erwähnt wird (z. B. problemorientiertes Lernen -> ["forschend"], kooperatives Lernen -> ["kooperativ"], direkte Instruktion -> ["instruktion"]), setze das Array "ansatz".\n' +
      '- Wenn nur eine einzelne Phase gesucht wird (z. B. Einstieg, Sicherung, Diagnose), setze "modus": "phase" und die passende "lernfunktion".\n\n' +
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
    const body = req.body as Partial<ElaboratePayload> | null;
    if (!body?.arrangement || body.arrangement.typ !== 'Arrangement') {
      return reply.code(400).send({ fehler: 'Bitte ein gültiges FMT-Arrangement übergeben.' });
    }

    const override = readByokHeaders(req, body as Record<string, unknown> | null);
    let target;
    try {
      target = resolveLlmTarget(config, override);
    } catch (e) {
      if (e instanceof ByokValidationError) return reply.code(400).send({ fehler: e.message });
      throw e;
    }

    if (!target) {
      return reply.code(503).send({
        fehler: 'Für die fachliche Ausgestaltung ist kein LLM-API-Key konfiguriert. Sie können optional im Browser einen eigenen API-Key (BYOK) hinterlegen.'
      });
    }

    try {
      const res = await elaborateScenarioCore(store, config, override, body as ElaboratePayload);
      return reply.send({ ...res, leitplanken: FMT_GUARDRAILS });
    } catch (e) {
      return reply.code(502).send({
        fehler: e instanceof Error ? e.message : 'LLM-Ausgestaltung fehlgeschlagen.'
      });
    }
  });

  app.post('/api/v1/assistant/differentiate', { config: rateLimitConfig }, async (req, reply) => {
    const body = req.body as {
      phases?: Array<{ key: string; phaseLabel: string; methodId: string; durationMin: number }>;
      gruppen?: Array<{ id: string; label: string; profile: string; count?: number; matrixMeasures?: string[] }>;
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
        fehler: 'Für KI-Binnendifferenzierung ist kein LLM-API-Key konfiguriert. Die Binnendifferenzierungsmatrix steht weiterhin direkt zur Verfügung.'
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
        variante: b?.variante || []
      };
    });

    const cacheKey = hashKey([
      'diff-v2',
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
      'Du bist ein Experte für Binnendifferenzierung (Binnendifferenzierungsmatrix) und die Facettierte Methodentaxonomie (FMT). ' +
      'Erstelle für jede übergebene Unterrichtsphase und jede Lerngruppe eine knappe, konkret umsetzbare, themenspezifische Differenzierungsmaßnahme (1–2 Sätze) unter Berücksichtigung der berechneten Matrix-Empfehlungen und Gruppengröße.\n' +
      'Antworte AUSSCHLIESSLICH mit gültigem JSON im Format:\n' +
      '{ "phasen": { "<phase.key>": [ { "groupId": "<group.id>", "groupLabel": "<group.label>", "measure": "<konkrete Maßnahme>" } ] } }\n' +
      'Verwende exakt die übergebenen phase.key- und group.id-Werte. Erfinde keine neuen Methoden.';

    const userPrompt =
      `Fach: ${body?.fach || 'nicht angegeben'}, Thema: ${body?.thema || 'nicht angegeben'}, Bildungsstufe: ${body?.bildungsstufe || 'nicht angegeben'}.\n` +
      (body?.hinweise ? `Hinweise: ${body.hinweise}\n` : '') +
      `\nLerngruppen inkl. Matrix-Top-Empfehlungen:\n${JSON.stringify(gruppen, null, 2)}\n\n` +
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
    const body = req.body as Partial<MaterialPayload> | null;
    const methodId = typeof body?.baustein === 'string' ? body.baustein.trim() : '';
    if (!store.blocksById.has(methodId)) {
      return reply.code(400).send({ fehler: 'Bitte einen gültigen FMT-Methodenbaustein auswählen.' });
    }

    const override = readByokHeaders(req, body as Record<string, unknown> | null);
    let target;
    try {
      target = resolveLlmTarget(config, override);
    } catch (e) {
      if (e instanceof ByokValidationError) return reply.code(400).send({ fehler: e.message });
      throw e;
    }

    if (!target) {
      return reply.code(503).send({
        fehler: 'Für den KI-Materialgenerator ist kein LLM-API-Key konfiguriert (optional BYOK im Browser hinterlegen).'
      });
    }

    try {
      const res = await generateMaterialCore(store, config, override, body as MaterialPayload);
      return reply.send({ ...res, leitplanken: FMT_GUARDRAILS });
    } catch (e) {
      return reply.code(502).send({
        fehler: e instanceof Error ? e.message : 'Materialgenerierung fehlgeschlagen.'
      });
    }
  });
}
