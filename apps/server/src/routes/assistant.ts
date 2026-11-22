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
  methodProcedure: string;
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
  mode?: 'ki' | 'template';
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

const KNOWN_SUBJECT_PATTERNS: Array<[RegExp, string]> = [
  [/\bmathematik\b|\bmathe\b|\bbruchrechn|\bgleichung|\bgeometrie|\balgebra/i, 'Mathematik'],
  [/\bphysik\b|\bdichte\b|\belektrizit|\bmechanik|\boptik/i, 'Physik'],
  [/\bbiologie\b|\bbio\b|\bökosystem|\boekosystem|\bfotosynthese|\bzelle\b|\bgenetik/i, 'Biologie'],
  [/\bchemie\b|\bsäure|\blauge|\batom|\bmolekül|\breaktion/i, 'Chemie'],
  [/\bdeutsch\b|\bargumentier|\bgedicht|\brechtschreib|\baufsatz|\blerntext/i, 'Deutsch'],
  [/\benglisch\b|\benglish\b/i, 'Englisch'],
  [/\bfranzösisch\b|\bfranzoesisch\b/i, 'Französisch'],
  [/\bspanisch\b/i, 'Spanisch'],
  [/\bgeschichte\b|\bweimar|\bantike|\bmittelalter|\bindustrialisierung/i, 'Geschichte'],
  [/\bpolitik\b|\bgemeinschaftskunde\b|\bsozialkunde\b|\bdemokratie|\bgewaltenteilung/i, 'Politik'],
  [/\bgeografie\b|\bgeographie\b|\berdkunde\b|\bklimawandel/i, 'Geografie'],
  [/\binformatik\b|\bprogrammieren|\balgorithm/i, 'Informatik'],
  [/\bwirtschaft\b|\bökonomie\b/i, 'Wirtschaft'],
  [/\bethik\b|\bphilosophie\b/i, 'Ethik / Philosophie'],
  [/\breligion\b/i, 'Religion'],
  [/\bkunst\b/i, 'Kunst'],
  [/\bmusik\b/i, 'Musik'],
  [/\bsport\b/i, 'Sport'],
  [/\bhauswirtschaft\b|\bernährung\b|\blebensmittel|\bverbraucherbildung/i, 'Ernährung & Verbraucherbildung'],
  [/\bnachhaltigkeit\b|\bbne\b/i, 'Nachhaltigkeit (BNE)'],
  [/\bsachunterricht\b/i, 'Sachunterricht']
];

export function extractSubjectAndTopicFromText(raw: string): { fach: string | null; thema: string | null } {
  const firstLine = (raw || '').split(/\n\s*Zusatzangaben:/i)[0].trim();
  if (!firstLine) return { fach: null, thema: null };

  let fach: string | null = null;
  for (const [re, label] of KNOWN_SUBJECT_PATTERNS) {
    if (re.test(firstLine)) {
      fach = label;
      break;
    }
  }

  // Strip framing boilerplate (class, duration, approach) to isolate the core topic cleanly
  const cleaned = firstLine
    .replace(/\b(?:problemorientiertes?|problembasiertes?|forschendes?|entdeckendes?|kooperatives?|projektbasiertes?|handlungsorientiertes?|offenes?)\s+lernen\b/gi, ' ')
    .replace(/\b(?:direkte\s+instruktion|unterrichtsreihe|unterrichtseinheit|einzelstunde|doppelstunde|stunde|sequenz|modul)\b/gi, ' ')
    .replace(/\b(?:mit\s+)?\d+\s*[x×]\s*\d+\s*(?:minuten|min\.?)\b/gi, ' ')
    .replace(/\b\d+\s*(?:minuten|min\.?|stunden|unterrichtsstunden)\b/gi, ' ')
    .replace(/\b(?:für\s+)?(?:schüler(?:innen)?|lernende|kinder|klasse|jahrgang(?:sstufe)?)\s*(?:der\s+)?\d+\.?\s*(?:klasse)?\b/gi, ' ')
    .replace(/\b(?:klasse|jg\.?|jahrgang)\s*\d+\b/gi, ' ')
    .replace(/\b(?:sekundarstufe\s*(?:i{1,2}|1|2)|grundschule|oberstufe|mittelstufe|berufsschule)\b/gi, ' ')
    .replace(/\b(?:geringes?|wenig|mittleres?|hohes?)\s+vorwissen\b/gi, ' ')
    .replace(/\b(?:ohne\s+geräte|ohne\s+internet|ohne\s+ki)\b/gi, ' ')
    .replace(/\b(?:mathematik|physik|biologie|chemie|deutsch|englisch|geschichte|politik|geografie|erdkunde|informatik|ethik|kunst|musik|sport|wirtschaft)\b/gi, ' ')
    .replace(/^[\s.,:;–-]+|[\s.,:;–-]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*[.,;:]\s*$/g, '')
    .trim();

  const thema = cleaned.length >= 3 ? cleaned.slice(0, 110) : null;
  return { fach, thema };
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

    const stepsSummary = (b?.durchfuehrung || []).length
      ? b!.durchfuehrung.map((s, i) => `${i + 1}. ${s}`).join(' ')
      : b?.kurzbeschreibung || `Durchführung gemäß ${p.methodName}.`;
    const coreNote = b?.kernkomponente?.[0]?.name ? ` (Kernkomponente: ${b.kernkomponente[0].name})` : '';

    return {
      key: p.key,
      orderLabel: p.orderLabel,
      phaseLabel: p.phaseLabel,
      durationMin: p.durationMin,
      methodId: p.methodId,
      methodName: p.methodName,
      methodProcedure: `Methode „${p.methodName}“ am Thema ${topicTag}: ${stepsSummary}${coreNote}`,
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
  meta?: {
    teilprompts: number;
    erfolgreich: number;
    fehlgeschlagen: number;
    dauerMs: number;
  };
}> {
  const startedAt = Date.now();
  const pruefung = store.validator.validate(body.arrangement, store.exampleRegistry);
  const usedIds = [...collectUsedBlocks(body.arrangement.ablauf)];
  // Include any subgroup alternative methods too
  for (const p of body.phasen || []) {
    for (const sub of Object.values(p.subgroupMethods || {})) {
      if (sub?.methodId && !usedIds.includes(sub.methodId)) usedIds.push(sub.methodId);
    }
  }
  const catalogById = new Map(
    usedIds
      .map((id) => store.blocksById.get(id))
      .filter((b): b is NonNullable<typeof b> => Boolean(b))
      .map((b) => [
        b.kennung,
        {
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
        }
      ])
  );
  const catalogContext = [...catalogById.values()];

  const buildStructuredMarkdownFallback = (rows: ThematicTableRow[]) =>
    [
      `# Unterrichtsentwurf: ${body.fach ? `${body.fach} – ` : ''}${body.thema || body.arrangement.name}`,
      '',
      `- **Gesamtdauer:** ${pruefung.dauerMin} min · **Prüfstatus:** ${pruefung.gueltig ? 'Gültig' : 'Prüfhinweise offen'}`,
      ...(body.didaktischerAnsatz ? [`- **Didaktischer Ansatz:** ${body.didaktischerAnsatz}`] : []),
      ...(body.akteure ? [`- **Akteure / Lerngruppe:** ${body.akteure}`] : []),
      ...(body.lernziele ? ['', '## Lernziele', body.lernziele] : []),
      '',
      '## Thematischer Ablauf',
      ...rows.map(
        (r) =>
          `### ${r.orderLabel}. ${r.phaseLabel} – ${r.methodName} (${r.durationMin} min)\n- **Methodisches Vorgehen:** ${r.methodProcedure}\n- **Lehrkraft:** ${r.teacherAction}\n- **Lernende:** ${r.learnerAction}\n- **Materialien & OER:** ${r.materialsAndOer}`
      )
    ].join('\n');

  const fallbackTable = buildDeterministicThematicTable(store, body);
  const target = resolveLlmTarget(config, override);
  if (!target) {
    return {
      quelle: 'deterministisch',
      gecacht: false,
      pruefung,
      ausarbeitung: buildStructuredMarkdownFallback(fallbackTable),
      thematischeTabelle: fallbackTable
    };
  }

  const cacheKey = hashKey([
    'elaborate-v6',
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

  // Shared compact scenario header used across all parallel sub-prompts
  const sharedContextHeader =
    `FACH: ${body.fach || 'nicht angegeben'} · THEMA: ${body.thema || 'nicht angegeben'} · GESAMTDAUER: ${pruefung.dauerMin} min\n` +
    (body.didaktischerAnsatz ? `Didaktischer Ansatz: ${body.didaktischerAnsatz}\n` : '') +
    (body.akteure ? `Akteure / Personenanzahl: ${body.akteure}\n` : '') +
    (body.lernziele ? `Lernziele:\n${body.lernziele}\n` : '') +
    (body.problemstellung ? `Didaktische Ausgangslage / Problemstellung:\n${body.problemstellung}\n` : '') +
    (body.hinweise ? `Zusätzliche Hinweise: ${body.hinweise}\n` : '') +
    (body.differenzierung?.length
      ? `Lerngruppen & Binnendifferenzierungsmatrix:\n${JSON.stringify(body.differenzierung)}\n`
      : '');

  const arcOverview = fallbackTable
    .map((r) => `${r.orderLabel}. ${r.phaseLabel} [${r.methodName}, ${r.durationMin} min]`)
    .join(' → ');

  const subTimeoutMs = Math.max(config.llmTimeoutMs, 60000);

  // Split thematic table into small parallel batches (max 3 phases per batch) so each call finishes quickly & reliably
  const CHUNK_SIZE = 3;
  const phaseChunks: ThematicTableRow[][] = [];
  for (let i = 0; i < fallbackTable.length; i += CHUNK_SIZE) {
    phaseChunks.push(fallbackTable.slice(i, i + CHUNK_SIZE));
  }

  const tableSystemPrompt =
    'Du bist ein didaktischer Planungsassistent für die Facettierte Methodentaxonomie (FMT). ' +
    'Konkretisiere NUR die übergebenen Unterrichtsphasen präzise und praxisfertig auf das Fach, das Thema, die Lerngruppen (Binnendifferenzierungsmatrix), die WLO-OER-Ressourcen (inkl. exakter wwwurl) und erstellte Materialien.\n' +
    'WICHTIG: Die methodische Vorgehensweise (Durchführungsschritte & Kernkomponenten jeder FMT-Methode) darf NICHT verloren gehen – übertrage sie explizit und schrittweise auf das konkrete Thema!\n' +
    'ANTWORTE AUSSCHLIESSLICH als gültiges JSON-Objekt mit exakt diesem Feld:\n' +
    '{\n' +
    '  "thematischeTabelle": [\n' +
    '    {\n' +
    '      "key": "<exakter phase.key>",\n' +
    '      "methodProcedure": "<konkret aufs Thema übertragene methodische Schrittfolge / didaktische Vorgehensweise der FMT-Methode (2-4 Sätze)>",\n' +
    '      "teacherAction": "<konkrete thematische Lehrkrafthandlung inkl. Impuls/Moderation (2-3 Sätze)>",\n' +
    '      "learnerAction": "<konkrete thematische Aktivität der Lernenden mit Bezug aufs Thema (2-3 Sätze)>",\n' +
    '      "groupAdaptations": { "<groupId>": "<konkrete thematische Anpassung oder alternative Methode für diese Teilgruppe>" },\n' +
    '      "materialsAndOer": "<konkreter Bezug auf zugeordnete Materialien & WLO-OER inkl. vollständiger wwwurl>"\n' +
    '    }\n' +
    '  ]\n' +
    '}\n' +
    'STRENGE REGELN: Erfinde KEINE neuen Methoden, Studien oder URLs außerhalb der übergebenen Katalog- und WLO-Daten.';

  const tableBatchPromises = phaseChunks.map((chunk, chunkIdx) => {
    const chunkKeys = new Set(chunk.map((r) => r.key));
    const chunkMethodIds = new Set<string>();
    for (const r of chunk) {
      chunkMethodIds.add(r.methodId);
      const subMap = body.phasen?.find((p) => p.key === r.key)?.subgroupMethods || {};
      for (const sub of Object.values(subMap)) {
        if (sub?.methodId) chunkMethodIds.add(sub.methodId);
      }
    }
    const chunkCatalog = [...chunkMethodIds]
      .map((id) => catalogById.get(id))
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
      .map((b) => ({
        kennung: b.kennung,
        name: b.name,
        kurzbeschreibung: b.kurzbeschreibung,
        durchfuehrung: b.durchfuehrung,
        kernkomponente: b.kernkomponente,
        material: b.material
      }));
    const chunkOers = (body.oerRessourcen || []).filter((o) => !o.stepKey || chunkKeys.has(o.stepKey));
    const chunkMats = (body.materialien || []).filter((m) => !m.stepKey || chunkKeys.has(m.stepKey));

    const chunkUserPrompt =
      `${sharedContextHeader}\n` +
      `Gesamtverlauf zur Einordnung (Abschnitt ${chunkIdx + 1}/${phaseChunks.length}):\n${arcOverview}\n\n` +
      `DIESE PHASEN KONKRETISIEREN (exakte Keys verwenden):\n${JSON.stringify(
        chunk.map((r) => ({
          key: r.key,
          orderLabel: r.orderLabel,
          phaseLabel: r.phaseLabel,
          durationMin: r.durationMin,
          methodId: r.methodId,
          methodName: r.methodName,
          subgroupMethods: body.phasen?.find((p) => p.key === r.key)?.subgroupMethods
        }))
      )}\n` +
      (chunkOers.length ? `\nZugeordnete WLO-OER (wwwurl exakt übernehmen!):\n${JSON.stringify(chunkOers)}\n` : '') +
      (chunkMats.length ? `\nErstellte Materialien:\n${JSON.stringify(chunkMats)}\n` : '') +
      `\nFMT-Methodenbeschreibungen für diesen Abschnitt:\n${JSON.stringify(chunkCatalog)}`;

    return callChatCompletion(
      target,
      [
        { role: 'system', content: tableSystemPrompt },
        { role: 'user', content: chunkUserPrompt }
      ],
      {
        jsonMode: true,
        maxTokens: 2800,
        timeoutMs: subTimeoutMs,
        reasoningEffort: config.llmReasoningEffort
      }
    );
  });

  // Narrative prose lesson plan runs concurrently in plain Markdown (no JSON escaping overhead!)
  const narrativeSystemPrompt =
    'Du bist ein didaktischer Planungsassistent für die Facettierte Methodentaxonomie (FMT). ' +
    'Erstelle einen praxisfertigen, klar gegliederten deutschen Unterrichtsentwurf im Markdown-Format (KEIN JSON, direkt lesbares Markdown!).\n' +
    'Struktur:\n' +
    '1. ## Kurzüberblick, Lernziele, didaktischer Ansatz & Lernvoraussetzungen\n' +
    '2. ## Thematische Durchführung (Phase für Phase): Übertrage die konkrete methodische Vorgehensweise (Schrittfolge & Kernkomponenten der FMT-Methoden) explizit auf das Thema, inkl. konkreter Arbeitsimpulse, Moderationsübergänge, Einbindung der erstellten Materialien und WLO-OER-Links (immer mit exakter wwwurl als Markdown-Link)\n' +
    '3. ## Binnendifferenzierung & Teilgruppen-Unterstützung\n' +
    '4. ## Qualitätsrisiken & verifizierte Quellen (nur aus den übergebenen Katalogdaten)\n' +
    'STRENGE REGELN: Erfinde KEINE neuen Methoden, Studien oder URLs. Evidenzbefunde immer mit Geltung nennen.';

  const narrativeUserPrompt =
    `AUSGESTALTUNG DES UNTERRICHTSENTWURFS (Markdown):\n${sharedContextHeader}\n` +
    (body.oerRessourcen?.length ? `WLO-OER-Ressourcen (exakte wwwurl einbinden):\n${JSON.stringify(body.oerRessourcen)}\n` : '') +
    (body.materialien?.length ? `Erstellte Unterrichtsmaterialien:\n${JSON.stringify(body.materialien)}\n` : '') +
    `\nPhasenfolge:\n${JSON.stringify(
      fallbackTable.map((r) => ({
        order: r.orderLabel,
        phase: r.phaseLabel,
        dauerMin: r.durationMin,
        methode: r.methodName,
        subgroupMethods: body.phasen?.find((p) => p.key === r.key)?.subgroupMethods
      }))
    )}\n` +
    `Prüfstatus: ${pruefung.gueltig ? 'Formal gültig' : 'Prüfhinweise vorhanden'} (${pruefung.dauerMin} min)\n\n` +
    `FMT-Katalogdaten (Durchführung, Kernkomponenten, Risiken, Evidenz, Quellen):\n${JSON.stringify(catalogContext)}`;

  const narrativePromise = callChatCompletion(
    target,
    [
      { role: 'system', content: narrativeSystemPrompt },
      { role: 'user', content: narrativeUserPrompt }
    ],
    {
      jsonMode: false,
      maxTokens: 3200,
      timeoutMs: subTimeoutMs,
      reasoningEffort: config.llmReasoningEffort
    }
  );

  // Run all phase batches + narrative Markdown in parallel with fault tolerance
  const [narrativeSettled, ...batchSettled] = await Promise.allSettled([narrativePromise, ...tableBatchPromises]);

  const llmRowsByKey = new Map<
    string,
    {
      methodProcedure?: string;
      teacherAction?: string;
      learnerAction?: string;
      groupAdaptations?: Record<string, string>;
      materialsAndOer?: string;
    }
  >();

  let succeeded = 0;
  let failed = 0;
  let firstError: Error | null = null;

  for (const res of batchSettled) {
    if (res.status === 'fulfilled') {
      succeeded++;
      const parsed = extractJsonObject(res.value) as {
        thematischeTabelle?: Array<{
          key?: string;
          methodProcedure?: string;
          teacherAction?: string;
          learnerAction?: string;
          groupAdaptations?: Record<string, string>;
          materialsAndOer?: string;
        }>;
      } | null;
      const rows = Array.isArray(parsed?.thematischeTabelle) ? parsed!.thematischeTabelle : [];
      for (const r of rows) {
        if (r && typeof r.key === 'string' && r.key.trim()) {
          llmRowsByKey.set(r.key.trim(), r);
        }
      }
    } else {
      failed++;
      if (!firstError) firstError = res.reason instanceof Error ? res.reason : new Error(String(res.reason));
    }
  }

  let ausarbeitung = '';
  if (narrativeSettled.status === 'fulfilled' && narrativeSettled.value.trim()) {
    succeeded++;
    const rawNarr = narrativeSettled.value.trim();
    // In case a mock or model still returned JSON with an ausarbeitung field, unwrap gracefully
    const maybeJson = rawNarr.startsWith('{') ? (extractJsonObject(rawNarr) as { ausarbeitung?: string } | null) : null;
    ausarbeitung =
      typeof maybeJson?.ausarbeitung === 'string' && maybeJson.ausarbeitung.trim()
        ? maybeJson.ausarbeitung.trim()
        : rawNarr;
  } else {
    failed++;
    if (narrativeSettled.status === 'rejected' && !firstError) {
      firstError =
        narrativeSettled.reason instanceof Error
          ? narrativeSettled.reason
          : new Error(String(narrativeSettled.reason));
    }
  }

  if (succeeded === 0) {
    throw firstError || new Error('KI-Ausgestaltung fehlgeschlagen.');
  }

  const mergedTable: ThematicTableRow[] = fallbackTable.map((baseRow) => {
    const match = llmRowsByKey.get(baseRow.key);
    if (!match) return baseRow;
    const mergedGroups: Record<string, string> = { ...baseRow.groupAdaptations };
    if (match.groupAdaptations && typeof match.groupAdaptations === 'object') {
      for (const [gk, gv] of Object.entries(match.groupAdaptations)) {
        if (typeof gv === 'string' && gv.trim()) mergedGroups[gk] = gv.trim();
      }
    }
    return {
      ...baseRow,
      methodProcedure:
        typeof match.methodProcedure === 'string' && match.methodProcedure.trim()
          ? match.methodProcedure.trim()
          : baseRow.methodProcedure,
      teacherAction:
        typeof match.teacherAction === 'string' && match.teacherAction.trim()
          ? match.teacherAction.trim()
          : baseRow.teacherAction,
      learnerAction:
        typeof match.learnerAction === 'string' && match.learnerAction.trim()
          ? match.learnerAction.trim()
          : baseRow.learnerAction,
      groupAdaptations: mergedGroups,
      materialsAndOer:
        typeof match.materialsAndOer === 'string' && match.materialsAndOer.trim()
          ? match.materialsAndOer.trim()
          : baseRow.materialsAndOer
    };
  });

  if (!ausarbeitung) {
    ausarbeitung = buildStructuredMarkdownFallback(mergedTable);
  }

  const meta = {
    teilprompts: 1 + phaseChunks.length,
    erfolgreich: succeeded,
    fehlgeschlagen: failed,
    dauerMs: Date.now() - startedAt
  };
  const result = { ausarbeitung, thematischeTabelle: mergedTable };
  if (!target.isByok && failed === 0) sharedElaborateCache.set(cacheKey, result);
  return { quelle: 'llm', gecacht: false, pruefung, ...result, meta };
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
  const target = body.mode === 'template' ? null : resolveLlmTarget(config, override);
  if (!target) {
    const fachLabel = body.fach?.trim() || 'Unterricht';
    const themaLabel = body.thema?.trim() || block.name;
    const dauer = body.dauerMin || block.dauerMin;
    const stufe = body.bildungsstufe || 'Sekundarstufe I';
    const steps = block.durchfuehrung || [];
    const cores = (block.kernkomponente || []).map((k) => k.name);
    const risks = block.qualitaetsrisiko || [];

    const typeHeading: Record<string, string> = {
      arbeitsblatt: 'Gestuftes Arbeitsblatt',
      infoblatt: 'Strukturiertes Infoblatt',
      quiz: 'Kurz-Quiz / Abruftest (ohne Notendruck)',
      checkliste: 'Schritt-für-Schritt-Checkliste',
      versuchsanleitung: 'Beobachtungs- & Versuchsanleitung',
      diskussionskarten: 'Diskussions- & Impulskarten',
      glossar: 'Fachbegriffs-Glossar & Satzstarter'
    };

    const bodySections: string[] = [];
    if (materialTyp === 'versuchsanleitung') {
      bodySections.push(
        '## 1. Fragestellung & eigene Vorhersage',
        `- **Leitfrage zum Thema „${themaLabel}“:** _[Konkrete Beobachtungs- oder Forschungsfrage ergänzen]_`,
        '- **Meine Vorhersage vor dem Versuch:** Ich vermute, dass ________________________, weil ________________________.',
        '',
        '## 2. Materialien & Durchführung',
        ...(block.material?.length ? [`- **Benötigtes Material:** ${block.material.join(', ')}`] : []),
        ...steps.map((s, i) => `${i + 1}. ${s}`),
        '',
        '## 3. Beobachtung & Erklärung',
        '| Beobachtung / Messwert | Vergleich mit Vorhersage | Fachliche Erklärung |',
        '|---|---|---|',
        '| | | |',
        '| | | |'
      );
    } else if (materialTyp === 'quiz') {
      bodySections.push(
        '## Abruf- & Diagnosefragen (ohne Notendruck)',
        `Bearbeite die Fragen zu **${themaLabel}** zunächst allein aus dem Gedächtnis (ca. ${Math.min(10, dauer)} min).`,
        '',
        `1. **Basisfrage (AFB I):** Nenne zwei zentrale Merkmale oder Begriffe zu „${themaLabel}“.`,
        `2. **Verständnisfrage (AFB II):** Erkläre in eigenen Worten den Zusammenhang bei „${themaLabel}“ anhand eines Beispiels.`,
        `3. **Typische Fehlvorstellung prüfen (AFB II):** Prüfe folgende Aussage auf Richtigkeit und begründe kurz: _[Typische Fehlvorstellung zu ${themaLabel} einfügen]_`,
        `4. **Transferfrage (AFB III):** Übertrage das Prinzip auf eine neue Alltagssituation.`,
        '',
        '## Selbstcheck & Musterlösung (für die Auswertung)',
        '- **Abgleich:** Markiere sichere Antworten (✓) und offene Punkte (?) für die nächste Wiederholung.'
      );
    } else if (materialTyp === 'checkliste') {
      bodySections.push(
        `## Schritt-für-Schritt-Checkliste (${block.name})`,
        ...steps.map((s) => `- [ ] ${s}`),
        ...cores.map((c) => `- [ ] Qualitätskriterium beachtet: **${c}**`),
        '',
        '## Abschluss-Check',
        `- [ ] Ich kann die Kernaussage zu **${themaLabel}** in 2 Sätzen erklären.`,
        '- [ ] Offene Frage für die Sicherungsphase notiert: ________________________'
      );
    } else if (materialTyp === 'diskussionskarten') {
      bodySections.push(
        `## Impuls- & Rollenkarten zu „${themaLabel}“`,
        '> **Karte 1 – Pro / Befürwortung:** Sammle 2 sachliche Argumente und ein konkretes Beispiel für die These.',
        '> **Karte 2 – Contra / Einwand:** Formuliere 2 begründete Gegenargumente oder Risiken.',
        '> **Karte 3 – Praxis / Alltag:** Zeige, wie sich das Thema im Alltag oder in der Region auswirkt.',
        '> **Karte 4 – Moderation & Zusammenfassung:** Achte auf faire Redezeit und fasse am Ende die stärksten Punkte zusammen.',
        '',
        '## Gesprächsablauf',
        ...steps.map((s, i) => `${i + 1}. ${s}`)
      );
    } else if (materialTyp === 'glossar') {
      bodySections.push(
        `## Fachbegriffs-Glossar zu „${themaLabel}“`,
        '| Fachbegriff | Erklärung in eigenen Worten | Beispiel / Skizze |',
        '|---|---|---|',
        `| _Begriff 1 (${themaLabel})_ | | |`,
        '| _Begriff 2_ | | |',
        '| _Begriff 3_ | | |',
        '',
        '## Sprachsensible Satzstarter',
        '- *„Mir fällt bei … auf, dass …“*',
        '- *„Ich vermute …, weil …“*',
        '- *„Im Vergleich zu … zeigt sich, dass …“*',
        '- *„Zusammenfassend lässt sich sagen, dass …“*'
      );
    } else if (materialTyp === 'infoblatt') {
      bodySections.push(
        `## Kernkonzepte zu „${themaLabel}“`,
        `- **Leitidee (${fachLabel}):** _[Zentrale Erklärung oder Definition zu „${themaLabel}“ ergänzen]_`,
        `- **Warum ist das wichtig?** ${block.problem || 'Hilft, fachliche Zusammenhänge sicher zu durchdringen.'}`,
        '',
        '## Leitfragen zum Verstehen',
        ...steps.slice(0, 3).map((s, i) => `${i + 1}. ${s} *(bezogen auf ${themaLabel})*`),
        '',
        '## Merksatz & Beispiel',
        `> **Merke:** _[Prägnanter Merksatz oder Formel zu „${themaLabel}“]_`
      );
    } else {
      // Gestuftes Arbeitsblatt (default)
      bodySections.push(
        `## Arbeitsauftrag (${block.name} am Thema „${themaLabel}“)`,
        ...steps.map((s, i) => `${i + 1}. ${s}`),
        '',
        '## Gestufte Aufgaben',
        `- **★ Basis (Einstieg & Sicherung):** Nutze die Vorlage / Satzstarter und bearbeite den ersten Teilauftrag zu *${themaLabel}*.`,
        `- **★★ Regel (Kernanforderung):** Bearbeite die Hauptaufgabe zu *${themaLabel}* vollständig und begründe deinen Lösungsweg.`,
        `- **★★★ Vertiefung (Transfer):** Übertrage dein Ergebnis auf ein neues Alltagsbeispiel oder prüfe einen möglichen Denkfehler.`
      );
    }

    const template = [
      `# ${typeHeading[materialTyp] || materialTyp}: ${fachLabel} – ${themaLabel}`,
      '',
      `**Methode:** ${block.name} · **Phase:** ${body.phaseLabel || 'Unterrichtsphase'} · **Dauer:** ${dauer} min · **Stufe:** ${stufe}`,
      ...(body.hinweise ? ['', `> **Zusatzauftrag:** ${body.hinweise}`] : []),
      '',
      ...bodySections,
      '',
      ...(body.gruppen?.length
        ? [
            '## Binnendifferenzierung (aus Matrix)',
            ...body.gruppen.map(
              (g) =>
                `- **${g.label}${g.count ? ` (${g.count} Pers.)` : ''}:** ${g.matrixMeasures?.slice(0, 3).join('; ') || g.profile}`
            ),
            ''
          ]
        : []),
      '## Hinweise für die Lehrkraft (FMT-Katalog)',
      ...cores.map((c) => `- **Kernkomponente:** ${c}`),
      ...risks.map((r) => `- **Qualitätsrisiko im Blick behalten:** ${r}`),
      '',
      '_Struktur-Vorlage ohne LLM erzeugt (sofort bearbeitbar & isoliert druckbar) · FMT · CC BY 4.0_'
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
      maxTokens: 5000,
      timeoutMs: Math.max(config.llmTimeoutMs, 60000),
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

    const extractedMeta = extractSubjectAndTopicFromText(text);
    const fallback = (hinweis: string) => {
      const ergebnis = store.matcher.zuordnen({ text });
      return reply.send({
        quelle: 'regeln-fallback',
        gecacht: false,
        hinweis,
        erkanntesFach: extractedMeta.fach,
        erkanntesThema: extractedMeta.thema,
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
          erkanntesFach: extractedMeta.fach,
          erkanntesThema: extractedMeta.thema,
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
          maxTokens: 1600,
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
        erkanntesFach: extractedMeta.fach,
        erkanntesThema: extractedMeta.thema,
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
          maxTokens: 4500,
          timeoutMs: Math.max(config.llmTimeoutMs, 60000),
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
    try {
      // Works both with LLM (fully elaborated tasks) AND without LLM (structured print-ready FMT template!)
      const res = await generateMaterialCore(store, config, override, body as MaterialPayload);
      return reply.send({ ...res, leitplanken: FMT_GUARDRAILS });
    } catch (e) {
      if (e instanceof ByokValidationError) return reply.code(400).send({ fehler: e.message });
      return reply.code(502).send({
        fehler: e instanceof Error ? e.message : 'Materialgenerierung fehlgeschlagen.'
      });
    }
  });
}
