import {
  ENTWURF_LEITPLANKEN,
  FMT_GUARDRAILS,
  adaptScenario,
  entwurfMarkdown,
  istPruefschritt,
  type Entwurf,
  computeMultiGroupSynthesis,
  detectLearnerGroupsFromText,
  isRegularGroupId,
  phasesForAdjustment,
  proposeAdditionalPhases,
  proposeMethodAdjustments,
  scoreDifferentiationMatrix,
  type AdaptScenarioInput,
  type Arrangement,
  type MatchRequest,
  type ValidationResult
} from '@fmt/core';
import { schemeValues, type CatalogStore } from '../catalog-store.js';
import {
  buildDeterministicThematicTable,
  extractScheduledPhases,
  extractSubjectAndTopicFromText,
  type ElaboratePayload,
  type MaterialPayload,
  type ThematicTableRow
} from '../routes/assistant.js';
import { searchWloOer } from '../routes/oer.js';
import { entwurfAusTabelle, profilRahmen } from './entwurf.js';

export interface PromptPair {
  systemPrompt: string;
  userPrompt: string;
  jsonMode: boolean;
  maxTokens: number;
}

export interface LlmBriefingPacket {
  zweck: string;
  ausfuehrungHinweis: string;
  systemPrompt: string;
  userPrompt: string;
  jsonMode: boolean;
  maxTokens: number;
  leitplanken: readonly string[];
}

export interface ElaborateBriefingResult {
  pruefung: ValidationResult;
  fallbackTable: ThematicTableRow[];
  fallbackMarkdown: string;
  tableBatches: Array<{ chunkIndex: number; phaseKeys: string[]; prompt: PromptPair }>;
  narrativePrompt: PromptPair;
  llmBriefing: LlmBriefingPacket;
  /** Draft with the seven core fields and the terms and modules of the planning profile. */
  entwurf: Entwurf;
}

/** The four guardrails for a language model writing out a draft, as a prompt block. */
const LEITPLANKEN_BLOCK = `LEITPLANKEN:\n${ENTWURF_LEITPLANKEN.map((g) => `- ${g}`).join('\n')}`;

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

export function buildTranslateBriefing(store: CatalogStore, text: string) {
  const pre = store.classifyText(text);
  const extracted = extractSubjectAndTopicFromText(text);
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
    '  • "pbl-siebensprung" für problemorientiertes Lernen\n' +
    '- Wenn ein didaktischer Ansatz erwähnt wird (z. B. problemorientiertes Lernen -> ["forschend"], kooperatives Lernen -> ["kooperativ"], direkte Instruktion -> ["instruktion"]), setze das Array "ansatz".\n' +
    '- Wenn nur eine einzelne Phase gesucht wird (z. B. Einstieg, Sicherung, Diagnose), setze "modus": "phase" und die passende "lernfunktion".\n\n' +
    `Vorfilterung (bereits deterministisch erkannt – bitte nur präzisieren/ergänzen):\n${JSON.stringify(pre.kriterien)}\n\n` +
    `Schema:\n${store.anfrageSchemaJson}`;

  return {
    erkanntesFach: extracted.fach,
    erkanntesThema: extracted.thema,
    vorfilterung: pre,
    llmBriefing: {
      zweck: 'Freitext-Unterrichtsszenario auf das strenge FMT-Anfrage-JSON-Schema abbilden',
      ausfuehrungHinweis:
        'Das Ergebnis-JSON anschließend an POST /api/v1/match (oder MCP match_scenario) übergeben, um einen deterministisch geprüften Ablauf zu erzeugen.',
      systemPrompt,
      userPrompt: text,
      jsonMode: true,
      maxTokens: 1200,
      leitplanken: FMT_GUARDRAILS
    } satisfies LlmBriefingPacket
  };
}

/**
 * Draft with the seven core fields for an elaboration: profile, terms and modules, from the given table rows
 * (deterministic or merged with LLM rows), as object and as Markdown.
 */
export function buildEntwurfFuerAusarbeitung(
  store: CatalogStore,
  body: ElaboratePayload,
  pruefung: ValidationResult,
  rows: ThematicTableRow[]
): { entwurf: Entwurf; markdown: string; rahmen: ReturnType<typeof profilRahmen> } {
  const kontext = body.arrangement.kontext || {};
  const chain = body.arrangement.zieltyp ? store.bundle.ketten.find((k) => k.id === body.arrangement.zieltyp) : undefined;
  const geplant = body.phasen?.length ? body.phasen : extractScheduledPhases(store, body.arrangement);
  const rolleJeSchritt = new Map((chain?.schritte || []).map((st) => [st.id, st.rolle]));
  const bildungsstufe = body.bildungsstufe || kontext.bildungsstufe;
  const rahmen = profilRahmen(store, { planungsprofil: body.planungsprofil, bildungsstufe, text: body.text, angenommen: body.planungsprofilAngenommen });
  const entwurf = entwurfAusTabelle(
    store,
    {
      planungsprofil: body.planungsprofil,
      planungsprofilAngenommen: body.planungsprofilAngenommen,
      bildungsstufe,
      text: body.text,
      titel: body.thema || body.arrangement.name,
      fach: body.fach,
      thema: body.thema,
      dauerMin: pruefung.dauerMin,
      raum: body.raum,
      anzahl: body.anzahl,
      vorwissen: kontext.vorwissen,
      sprachniveau: kontext.sprachniveau,
      teilgruppen: body.differenzierung,
      ausgangslage: body.problemstellung,
      hauptziel: body.lernziele?.trim() || chain?.label,
      einheit: body.einheit,
      nachweis: body.nachweis,
      hinweise: [...(body.hinweise?.trim() ? [body.hinweise.trim()] : []), ...(body.hinweiseListe || [])],
      begleitziel: body.begleitziel,
      begleitstrang: body.begleitstrang,
      schritte: Object.fromEntries(
        geplant.map((p) => [
          p.key,
          {
            rolle: p.kettenschritt ? rolleJeSchritt.get(p.kettenschritt) : undefined,
            pruefschritt: istPruefschritt(chain, p.kettenschritt),
            // The web app sends its repetition row under the key 'wiederkehr'.
            wiederkehr: Boolean(p.wiederkehr) || p.key === 'wiederkehr'
          }
        ])
      )
    },
    rows
  );
  const { spalten } = entwurf;

  const markdown = [
    `# ${entwurf.planungsprofil.dokument}: ${body.fach ? `${body.fach} – ` : ''}${body.thema || body.arrangement.name}`,
    '',
    `- **Gesamtdauer:** ${pruefung.dauerMin} min · **Prüfstatus:** ${pruefung.gueltig ? 'Gültig' : 'Prüfhinweise offen'}`,
    ...(body.didaktischerAnsatz ? [`- **Didaktischer Ansatz:** ${body.didaktischerAnsatz}`] : []),
    ...(body.akteure ? [`- **Akteure / Lerngruppe:** ${body.akteure}`] : []),
    '',
    entwurfMarkdown(entwurf, 2, {
      verlauf: [
        '### Durchführung Phase für Phase',
        ...rows.map(
          (r) =>
            `#### ${r.orderLabel}. ${r.phaseLabel} – ${r.methodName} (${r.durationMin} min)\n- **Methodisches Vorgehen:** ${r.methodProcedure}\n- **${spalten.lehrende}:** ${r.teacherAction}\n- **${spalten.lernende}:** ${r.learnerAction}\n- **Materialien & OER:** ${r.materialsAndOer}`
        )
      ].join('\n')
    })
  ].join('\n');

  return { entwurf, markdown, rahmen };
}

export function buildElaborateBriefing(store: CatalogStore, body: ElaboratePayload): ElaborateBriefingResult {
  const pruefung = store.validator.validate(body.arrangement, store.exampleRegistry);
  const usedIds = [...collectUsedBlocks(body.arrangement.ablauf)];
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
          raumhinweis: b.raumhinweis,
          kernkomponente: b.kernkomponente.map((k) => k.name),
          qualitaetsrisiko: b.qualitaetsrisiko,
          evidenz: b.evidenz,
          quellen: b.quellen
        }
      ])
  );
  const catalogContext = [...catalogById.values()];
  const fallbackTable = buildDeterministicThematicTable(store, body);

  const { entwurf, markdown: fallbackMarkdown, rahmen } = buildEntwurfFuerAusarbeitung(store, body, pruefung, fallbackTable);
  const { spalten } = entwurf;

  const sharedContextHeader =
    `FACH: ${body.fach || 'nicht angegeben'} · THEMA: ${body.thema || 'nicht angegeben'} · GESAMTDAUER: ${pruefung.dauerMin} min\n` +
    `Bildungsstufe: ${rahmen.stufe} · ${rahmen.zeile}\n` +
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
    'STRENGE REGELN: Erfinde KEINE neuen Methoden, Studien oder URLs außerhalb der übergebenen Katalog- und WLO-Daten.\n' +
    `BEGRIFFE: "teacherAction" ist die ${spalten.lehrende}, "learnerAction" die ${spalten.lernende}.\n` +
    LEITPLANKEN_BLOCK;

  const tableBatches = phaseChunks.map((chunk, chunkIdx) => {
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

    return {
      chunkIndex: chunkIdx,
      phaseKeys: chunk.map((r) => r.key),
      prompt: {
        systemPrompt: tableSystemPrompt,
        userPrompt: chunkUserPrompt,
        jsonMode: true,
        maxTokens: 2800
      }
    };
  });

  const narrativeSystemPrompt =
    'Du bist ein didaktischer Planungsassistent für die Facettierte Methodentaxonomie (FMT). ' +
    `Erstelle einen praxisfertigen, klar gegliederten deutschen Entwurf (${entwurf.planungsprofil.dokument}) im Markdown-Format (KEIN JSON, direkt lesbares Markdown!).\n` +
    `BEGRIFFE DES PLANUNGSPROFILS: ${rahmen.zeile}. Spalten des Verlaufsplans: ${Object.values(spalten).join(' | ')}.\n` +
    'VERBINDLICHE STRUKTUR (sieben Kernfelder in dieser Reihenfolge, Inhalt aus dem mitgelieferten Entwurf):\n' +
    entwurf.kernfelder.map((k, i) => `${i + 1}. ## ${k.titel}`).join('\n') +
    '\n' +
    (entwurf.module.length ? `Danach die Module zum Ausfüllen: ${entwurf.module.map((m) => m.name).join(', ')} (nur als Überschrift mit Platz, nichts erfinden).\n` : '') +
    'METHODENTREUE: Setze im Verlaufsplan JEDE ausgewählte FMT-Methode um – übertrage ihre originalen Durchführungsschritte & Kernkomponenten explizit auf das konkrete Thema (inkl. Arbeitsimpulsen, Übergängen, Materialien und WLO-OER-Links mit exakter wwwurl). ' +
    'Binnendifferenzierung: Matrix-Empfehlungen mit dem Hinweis ausweisen, dass es sich um Werte der FMT-Punktematrix handelt, nicht um empirische Effektstärken.\n' +
    'STRENGE REGELN: Erfinde KEINE neuen Methoden, Studien oder URLs. Übernimm die exakten Phasendauern (Summe = Gesamtdauer).\n' +
    LEITPLANKEN_BLOCK;

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
    `Entwurf (deterministisch aus dem geprüften Ablauf, übernommen):\n${entwurfMarkdown(entwurf, 2)}\n\n` +
    `FMT-Katalogdaten (Durchführung, Kernkomponenten, Risiken, Evidenz, Quellen):\n${JSON.stringify(catalogContext)}`;

  const narrativePrompt: PromptPair = {
    systemPrompt: narrativeSystemPrompt,
    userPrompt: narrativeUserPrompt,
    jsonMode: false,
    maxTokens: 3200
  };

  return {
    pruefung,
    fallbackTable,
    fallbackMarkdown,
    tableBatches,
    narrativePrompt,
    entwurf,
    llmBriefing: {
      zweck: 'Geprüftes FMT-Arrangement mit vorselektierten Methodendaten, Matrix-Maßnahmen und WLO-Links im eigenen LLM thematisch ausformulieren',
      ausfuehrungHinweis:
        'Nutze dieses vorab gefilterte Briefing direkt in deinem eigenen LLM (z. B. Claude, ChatGPT, Ollama), ohne weitere Katalog-Abfragen. Erfinde keine Methoden, Studien oder URLs außerhalb der enthaltenen FMT-Katalogdaten.',
      systemPrompt: narrativeSystemPrompt,
      userPrompt: narrativeUserPrompt,
      jsonMode: false,
      maxTokens: 3200,
      // The draft guardrails travel in the structured field too, not only inside the system prompt.
      leitplanken: [...FMT_GUARDRAILS, ...ENTWURF_LEITPLANKEN]
    }
  };
}

export interface DifferentiateBriefingPayload {
  phases: Array<{ key: string; phaseLabel: string; methodId: string; durationMin: number }>;
  gruppen: Array<{ id: string; label: string; profile: string; count?: number; matrixMeasures?: string[] }>;
  fach?: string;
  thema?: string;
  bildungsstufe?: string;
  hinweise?: string;
}

export function buildDifferentiateBriefing(store: CatalogStore, body: DifferentiateBriefingPayload) {
  const enrichedPhases = body.phases.slice(0, 20).map((p) => {
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
  const gruppen = body.gruppen.slice(0, 6);

  const systemPrompt =
    'Du bist ein Experte für Binnendifferenzierung (Binnendifferenzierungsmatrix) und die Facettierte Methodentaxonomie (FMT). ' +
    'Erstelle für jede übergebene Unterrichtsphase und jede Lerngruppe eine knappe, konkret umsetzbare, themenspezifische Differenzierungsmaßnahme (1–2 Sätze) unter Berücksichtigung der berechneten Matrix-Empfehlungen und Gruppengröße.\n' +
    'Antworte AUSSCHLIESSLICH mit gültigem JSON im Format:\n' +
    '{ "phasen": { "<phase.key>": [ { "groupId": "<group.id>", "groupLabel": "<group.label>", "measure": "<konkrete Maßnahme>" } ] } }\n' +
    'Verwende exakt die übergebenen phase.key- und group.id-Werte. Erfinde keine neuen Methoden.';

  const userPrompt =
    `Fach: ${body.fach || 'nicht angegeben'}, Thema: ${body.thema || 'nicht angegeben'}, Bildungsstufe: ${body.bildungsstufe || 'nicht angegeben'}.\n` +
    (body.hinweise ? `Hinweise: ${body.hinweise}\n` : '') +
    `\nLerngruppen inkl. Matrix-Top-Empfehlungen:\n${JSON.stringify(gruppen, null, 2)}\n\n` +
    `Unterrichtsphasen mit FMT-Methoden:\n${JSON.stringify(enrichedPhases, null, 2)}`;

  return {
    enrichedPhases,
    llmBriefing: {
      zweck: 'Phasenspezifische Binnendifferenzierungs-Maßnahmen pro Lerngruppe auf Basis der Matrix-Punkte ausformulieren',
      ausfuehrungHinweis: 'Direkt im eigenen LLM als JSON-Prompt ausführen; alle Matrix-Top-Empfehlungen sind bereits vorausberechnet.',
      systemPrompt,
      userPrompt,
      jsonMode: true,
      maxTokens: 3500,
      leitplanken: FMT_GUARDRAILS
    } satisfies LlmBriefingPacket
  };
}

export function buildMaterialBriefing(store: CatalogStore, body: MaterialPayload) {
  const methodId = (body.baustein || '').trim();
  const block = store.blocksById.get(methodId);
  if (!block) {
    throw new Error('Bitte einen gültigen FMT-Methodenbaustein auswählen.');
  }
  const materialTyp = body.materialTyp || 'arbeitsblatt';

  const systemPrompt =
    'Du erstellst direkt im Unterricht einsetzbares, druckfertiges Lehrmaterial (klares deutsches Markdown) auf Basis einer konkreten FMT-Unterrichtsmethode.\n' +
    'STRUKTUR:\n' +
    '1. **Kopfzeile** (Titel, Fach, Thema, Methode, Zeitrahmen)\n' +
    '2. **Klare Arbeitsaufträge / Inhalt** – exakt passend zur gewählten FMT-Methode und deren Durchführungsschritten\n' +
    '3. **Binnendifferenzierung** – sofern Lerngruppen und Matrix-Maßnahmen übergeben wurden, kennzeichne Hilfen (★ Basis / Satzstarter) und Erweiterungen (★★★ Vertiefung)\n' +
    '4. **Erwartungshorizont / Lehrkraft-Hinweise** (kurze Musterlösungen & typische Fehlvorstellungen)\n' +
    'Erfinde keine falschen Quellen-URLs.';

  const methodenFakten = {
    kennung: block.kennung,
    name: block.name,
    kurzbeschreibung: block.kurzbeschreibung,
    durchfuehrung: block.durchfuehrung,
    material: block.material,
    kernkomponente: block.kernkomponente.map((k) => k.name),
    qualitaetsrisiko: block.qualitaetsrisiko
  };

  // No silent default: without a Bildungsstufe the prompt says so; the planning profile names the terms.
  const rahmen = profilRahmen(store, { planungsprofil: body.planungsprofil, bildungsstufe: body.bildungsstufe });
  const userPrompt =
    `MATERIALTYP: ${materialTyp}\n` +
    `Fach: ${body.fach || 'nicht angegeben'} · Thema: ${body.thema || 'nicht angegeben'} · Bildungsstufe: ${rahmen.stufe}\n` +
    `${rahmen.zeile}\n` +
    `Phase: ${body.phaseLabel || 'Unterrichtsphase'} · Dauer: ${body.dauerMin || block.dauerMin} min\n` +
    (body.hinweise ? `Zusätzliche Hinweise: ${body.hinweise}\n` : '') +
    (body.gruppen?.length ? `\nAktive Lerngruppen & Binnendifferenzierung:\n${JSON.stringify(body.gruppen, null, 2)}\n` : '') +
    `\nFMT-Methode:\n${JSON.stringify(methodenFakten, null, 2)}`;

  return {
    baustein: block.name,
    materialTyp,
    methodenFakten,
    llmBriefing: {
      zweck: `Druckfertiges ${materialTyp} passend zur FMT-Methode „${block.name}“ im eigenen LLM ausarbeiten`,
      ausfuehrungHinweis:
        'Die mitgelieferte deterministische Struktur-Vorlage ist bereits direkt nutzbar; für themenspezifische Aufgaben, Texte und Musterlösungen dieses Briefing an dein eigenes LLM übergeben.',
      systemPrompt,
      userPrompt,
      jsonMode: false,
      maxTokens: 4500,
      leitplanken: FMT_GUARDRAILS
    } satisfies LlmBriefingPacket
  };
}

export interface ScenarioPlanArgs {
  text: string;
  fach?: string;
  /** FMT subject area; read from the subject when missing. */
  fachbereich?: string;
  thema?: string;
  lernziele?: string;
  didaktischerAnsatz?: string;
  ansatz?: string | string[];
  anleitung?: string | string[];
  engagement?: string | string[];
  interaktion?: string | string[];
  reichweite?: string | string[];
  zeitMin?: number;
  gruppe?: number;
  bildungsstufe?: string;
  /** Planning profile of the draft (scheme planungsprofil); otherwise it follows from Bildungsstufe and text. */
  planungsprofil?: string;
  vorwissen?: string;
  maxTechnik?: string;
  maxVorbereitung?: number;
  ohneInternet?: boolean;
  ohneKI?: boolean;
  zielart?: string;
  raum?: string;
  /** Former name of raum. */
  lernort?: string;
  raumBietet?: string | string[];
  fachausstattungArt?: string;
  ohneSchrift?: string | string[];
  termine?: number;
  nachweis?: string;
  /** Accompanying goals (scheme begleitziel): order equivalent methods and propose a short accompanying strand. */
  begleitziel?: string | string[];
  /** 0 = first proposal; higher values give the next equally suitable combination. */
  variante?: number;
  includeWloOer?: boolean;
  /** kompakt leaves out llmBriefing, maschinenlesbar and other long blocks; default voll. */
  umfang?: 'kompakt' | 'voll';
  gruppen?: Array<{
    id: string;
    label: string;
    count?: number;
    personaId?: string;
    profile?: string;
    selectedValues?: Record<string, string>;
    /** Values the text named (core values of the pattern); only these decide the subgroup check. */
    genannt?: string[];
  }>;
}

type PlanGroup = NonNullable<ScenarioPlanArgs['gruppen']>[number];

/** Whole-class statements such as "geringes Vorwissen" only count as a subgroup when a headcount is given. */
const CLASS_WIDE_GROUP_IDS = new Set(['vorwissen-gering', 'motivation-gering']);

/** Persona that supplies the remaining traits of a named group; its own detected traits take precedence. */
const GROUP_PERSONA: Record<string, string> = {
  daz: 'languageAndCulture',
  vertiefung: 'highPerforming',
  lrs: 'foerderLernen',
  'foerder-lernen': 'foerderLernen',
  adhs: 'foerderEmSoz',
  autismus: 'foerderEmSoz'
};

/**
 * Subgroups the text names (e.g. "5 DaZ-Kinder, 4 leistungsstarke") plus the remaining regular group.
 * Empty when the text names none, so the caller falls back to the three standard groups.
 */
export function subgroupsFromText(text: string, groupSize?: number): PlanGroup[] {
  const named = detectLearnerGroupsFromText(text).groups.filter((g) => !CLASS_WIDE_GROUP_IDS.has(g.id) || g.count);
  if (!named.length) return [];
  const counted = named.reduce((sum, g) => sum + (g.count || 0), 0);
  const allCounted = named.every((g) => g.count);
  // The regular group holds whoever is left. It is dropped when the named groups already fill the class.
  const rest = groupSize && allCounted ? groupSize - counted : undefined;
  const regel =
    named.some((g) => g.id === 'regel') || rest === 0
      ? []
      : [{ id: 'regel', label: 'Regelgruppe', personaId: 'average', ...(rest && rest > 0 ? { count: rest } : {}) }];
  return [
    ...named.map((g) => ({
      id: g.id,
      label: g.label,
      count: g.count,
      personaId: GROUP_PERSONA[g.id],
      selectedValues: g.selectedValues,
      ...(g.genannt ? { genannt: g.genannt } : {})
    })),
    ...regel
  ];
}

/** Room of the plan as label: stated in the request, else the assumed one (marked). */
function raumLabel(store: CatalogStore, matched: { kriterien: Record<string, unknown>; pflichtangaben?: { angenommen: Array<{ feld: string; wert: unknown }> } }): string | undefined {
  const label = (code: string) => schemeValues(store.bundle, 'raumtyp').find((w) => w.id === code)?.label || code;
  const genannt = matched.kriterien.raum || matched.kriterien.lernort;
  if (typeof genannt === 'string' && genannt) return label(genannt);
  const angenommen = matched.pflichtangaben?.angenommen.find((x) => x.feld === 'raum')?.wert;
  return angenommen ? `${label(String(angenommen))} (angenommen)` : undefined;
}

/** Fields only needed for the caller's own LLM run or for the Baukasten import; left out in compact answers. */
const PLAN_FULL_ONLY = ['llmBriefing', 'entwurf', 'maschinenlesbar', 'skalenVorfilterung', 'erkannteMatrixSignale', 'udlBasis', 'konflikte', 'engine'] as const;

export function compactScenarioPlan<T extends Record<string, unknown>>(plan: T): Partial<T> & { hinweisUmfang?: string } {
  if ('fehler' in plan) return plan;
  const out: Record<string, unknown> = { ...plan };
  for (const key of PLAN_FULL_ONLY) delete out[key];
  if (Array.isArray(out.verbindlicheUmsetzungsregeln)) {
    out.verbindlicheUmsetzungsregeln = (out.verbindlicheUmsetzungsregeln as string[])
      .filter((r) => !r.startsWith('BAUKASTEN-IMPORT'))
      .map((r) => r.replace(' und `maschinenlesbar.arrangement`', ''));
  }
  out.hinweisUmfang =
    'Kompakte Antwort. Mit umfang: "voll" kommen zusätzlich llmBriefing, entwurf (sieben Kernfelder nach Planungsprofil), maschinenlesbar (Baukasten-Import), udlBasis und konflikte.';
  return out as Partial<T> & { hinweisUmfang?: string };
}

/**
 * Ultra-fast Zero-LLM end-to-end scenario pre-filtering & briefing builder (<5 ms without WLO HTTP).
 * Combines hybrid classification (rules + BM25/Model2Vec), matrix trait auto-detection,
 * validated FMT arrangement matching, deterministic thematic table, optional WLO OER,
 * and a ready-to-use LLM briefing packet for the caller's own LLM.
 */
export async function buildScenarioPlanZeroLlm(store: CatalogStore, args: ScenarioPlanArgs) {
  const t0 = process.hrtime.bigint();
  const classification = store.classifyText(args.text);
  const extracted = extractSubjectAndTopicFromText(args.text);
  const thema = args.thema?.trim() || extracted.thema || args.text.slice(0, 110);
  // A subject given as its own field counts like a subject named in the text.
  const stufe = args.bildungsstufe || (classification.kriterien.bildungsstufe as string | undefined);
  const fachFeld = args.fach?.trim() ? store.subjects.erkenne(args.fach, stufe) : null;

  // Subject words the vocabulary does not hold (e.g. "Naturwissenschaften") still reach the text rules.
  const fachbereichAusFeld = args.fach?.trim() ? (store.matcher.lesen(args.fach).kriterien.fachbereich as string | undefined) : undefined;

  const matchReq: MatchRequest = {
    text: args.text,
    modus: 'ablauf',
    ansatz: args.ansatz,
    anleitung: args.anleitung,
    engagement: args.engagement,
    interaktion: args.interaktion,
    reichweite: args.reichweite,
    zeitMin: args.zeitMin,
    gruppe: args.gruppe,
    bildungsstufe: args.bildungsstufe,
    planungsprofil: args.planungsprofil,
    vorwissen: args.vorwissen,
    maxTechnik: args.maxTechnik,
    maxVorbereitung: args.maxVorbereitung,
    ohneInternet: args.ohneInternet,
    ohneKI: args.ohneKI,
    variante: args.variante,
    zielart: args.zielart,
    raum: args.raum || args.lernort,
    raumBietet: args.raumBietet,
    fachausstattungArt: args.fachausstattungArt,
    ohneSchrift: args.ohneSchrift,
    termine: args.termine,
    nachweis: args.nachweis,
    begleitziel: args.begleitziel,
    fachbereich:
      args.fachbereich || (fachFeld && fachFeld.fachbereich !== 'uebergreifend' ? fachFeld.fachbereich : fachbereichAusFeld)
  };
  let matched = store.matcher.zuordnen(matchReq);
  let angenommenerZieltyp: string | null = null;
  if (matched.modus !== 'ablauf' || !matched.arrangement) {
    // Infer sensible default zieltyp from pre-classified ansatz/scales so casual prompts always get a valid plan
    const ansatzList = Array.isArray(classification.kriterien.ansatz)
      ? (classification.kriterien.ansatz as string[])
      : [];
    const fallbackZieltyp = ansatzList.includes('forschend')
      ? 'fuenf-e'
      : ansatzList.includes('uebung')
        ? 'prozedur'
        : 'konzeptaufbau';
    angenommenerZieltyp = fallbackZieltyp;
    matched = store.matcher.zuordnen({ ...matchReq, zieltyp: fallbackZieltyp });
  }
  // A frame too short for any lesson plan ("Abschlussreflexion, 10 Minuten") gets methods for one phase,
  // like the Baukasten, instead of a plan that overruns the time.
  const budget = typeof matched.kriterien.zeitMin === 'number' ? matched.kriterien.zeitMin : undefined;
  if (matched.modus === 'ablauf' && budget != null && (matched.pruefung?.dauerMin ?? 0) > budget) {
    const phase = store.matcher.zuordnen({ ...matchReq, modus: 'phase' });
    if (phase.modus === 'phase' && phase.vorschlaege.length) {
      return {
        modus: 'phase' as const,
        hinweis: `${budget} Minuten reichen nicht für einen vollständigen Ablauf (kürzester Vorschlag ${matched.pruefung?.dauerMin} min). Vorschläge für eine einzelne Phase; für einen Ablauf mehr Zeit angeben.`,
        fach: args.fach?.trim() || extracted.fach || undefined,
        thema,
        erkannteKriterien: phase.kriterien,
        vorschlaege: phase.vorschlaege.slice(0, 10),
        vorschlaegeGesamt: phase.vorschlaege.length,
        hinweise: phase.hinweise || [],
        dauerMs: Math.round(Number(process.hrtime.bigint() - t0) / 1e4) / 100,
        leitplanken: FMT_GUARDRAILS
      };
    }
  }
  if (matched.modus !== 'ablauf' || !matched.arrangement) {
    return {
      fehler: 'Konnte keinen vollständigen Ablauf zuordnen.',
      dauerMs: Math.round(Number(process.hrtime.bigint() - t0) / 1e4) / 100,
      vorfilterung: classification,
      ergebnis: matched
    };
  }

  // Subject with OEH URI: from the own field if given, otherwise as named in the text.
  // A subject field the vocabulary does not know is not replaced by a guess from the text.
  const fachErkannt = args.fach?.trim() ? fachFeld : matched.fach || null;
  const fach = args.fach?.trim() || extracted.fach || fachErkannt?.label || undefined;

  const detectedTraits = classification.matrixMerkmale;
  const defaultGroups: PlanGroup[] = [
    {
      id: 'basis',
      label: 'Basisunterstützung & Sprachsensibel',
      personaId:
        detectedTraits.suggestedPersonaId && detectedTraits.suggestedPersonaId !== 'highPerforming'
          ? detectedTraits.suggestedPersonaId
          : 'languageAndCulture',
      selectedValues:
        detectedTraits.signals.length > 0 && detectedTraits.suggestedPersonaId !== 'highPerforming'
          ? detectedTraits.selectedValues
          : undefined
    },
    { id: 'regel', label: 'Regelgruppe', personaId: 'average' },
    {
      id: 'vertiefung',
      label: 'Vertiefung & Leistungsstark',
      personaId: 'highPerforming',
      selectedValues:
        detectedTraits.signals.length > 0 && detectedTraits.suggestedPersonaId === 'highPerforming'
          ? detectedTraits.selectedValues
          : undefined
    }
  ];
  const groupSize = args.gruppe ?? (typeof matched.kriterien.gruppe === 'number' ? matched.kriterien.gruppe : undefined);
  const namedGroups = subgroupsFromText(args.text, groupSize);
  const activeGroups: PlanGroup[] =
    args.gruppen && args.gruppen.length ? args.gruppen : namedGroups.length ? namedGroups : defaultGroups;

  const effectiveMaxTechnik =
    args.maxTechnik || (typeof matched.kriterien.maxTechnik === 'string' ? matched.kriterien.maxTechnik : undefined);
  const effectiveOhneInternet =
    args.ohneInternet ?? (typeof matched.kriterien.ohneInternet === 'boolean' ? matched.kriterien.ohneInternet : undefined);
  const effectiveOhneKI =
    args.ohneKI ?? (typeof matched.kriterien.ohneKI === 'boolean' ? matched.kriterien.ohneKI : undefined);

  const groupMatrices = activeGroups.map((g) => {
    const scored = scoreDifferentiationMatrix({
      // Named groups carry their own traits; the average persona would dilute them.
      personaId: g.personaId || (g.selectedValues ? undefined : 'average'),
      selectedValues: g.selectedValues,
      limit: 6,
      maxTechnik: effectiveMaxTechnik,
      ohneInternet: effectiveOhneInternet,
      ohneKI: effectiveOhneKI
    });
    return {
      ...g,
      matrixTop: scored.topRecommendations.slice(0, 4).map((r) => `${r.name} (+${r.score})`),
      matrixTopDetails: scored.topRecommendations.slice(0, 4).map((r) => ({
        id: r.id,
        name: r.name,
        normalizedScore: r.normalizedScore,
        relevanz: r.relevanz,
        ebene: r.meta.ebene,
        aufwand: r.meta.aufwand,
        umsetzungsimpuls: r.meta.umsetzungsimpuls
      })),
      didacticProfile: scored.didacticProfile
    };
  });

  const multiGroupSynthesis = computeMultiGroupSynthesis(
    activeGroups.map((g) => ({
      id: g.id,
      label: g.label,
      count: g.count,
      // Named groups carry their own traits; the average persona would dilute them.
      personaId: g.personaId || (g.selectedValues ? undefined : 'average'),
      selectedValues: g.selectedValues
    })),
    {
      maxTechnik: effectiveMaxTechnik,
      ohneInternet: effectiveOhneInternet,
      ohneKI: effectiveOhneKI
    }
  );

  // Step 3 of the Baukasten: parallel methods for subgroups and short extra phases for everyone (proposals only).
  const planFachbereich = matched.kriterien.fachbereich as string | undefined;
  const adjustmentPhases = phasesForAdjustment(store.bundle, matched.arrangement);
  // Groups read from the text are checked with their detected traits only, exactly as the Baukasten does
  // (the persona added above for the matrix would steer the method check elsewhere than in the web app).
  const fromText = activeGroups === namedGroups;
  const adjustmentGroups = activeGroups.map((g) => ({
    id: g.id,
    label: g.label,
    isMain: isRegularGroupId(g.id),
    personaId: fromText && g.selectedValues && Object.keys(g.selectedValues).length ? undefined : g.personaId,
    selectedValues: g.selectedValues,
    ...(g.genannt ? { genannt: g.genannt } : {})
  }));
  const adjustmentConstraints = {
    maxTechnik: effectiveMaxTechnik,
    ohneInternet: effectiveOhneInternet,
    ohneKI: effectiveOhneKI,
    bildungsstufe: args.bildungsstufe || (matched.kriterien.bildungsstufe as string | undefined),
    fachbereich: planFachbereich && planFachbereich !== 'uebergreifend' ? planFachbereich : undefined,
    // The request as the matcher read it (room, time …): a parallel method must cover its needs in that frame.
    anfrage: matched.kriterien as MatchRequest
  };
  const regelsatz = { teilgruppen: store.bundle.teilgruppen, regeln: store.bundle.regeln, schemes: store.bundle.schemes };
  const teilgruppenMethoden = proposeMethodAdjustments(store.bundle.bausteine, adjustmentPhases, adjustmentGroups, adjustmentConstraints, regelsatz);
  const zusatzphasen = proposeAdditionalPhases(store.bundle.bausteine, adjustmentPhases, adjustmentGroups, adjustmentConstraints);

  let oerHits: Array<{ titel: string; wwwurl: string; wloRenderUrl: string | null; lizenz: string | null; medientyp: string | null }> = [];
  if (args.includeWloOer && (thema || fach)) {
    try {
      const wlo = await searchWloOer({
        query: thema || fach || args.text,
        fach,
        // Without a single subject the OEH subjects of the plan's subject area narrow the search.
        fachbereich: matched.kriterien.fachbereich as string | undefined,
        bildungsstufe: args.bildungsstufe || (matched.kriterien.bildungsstufe as string | undefined),
        maxItems: 6
      });
      oerHits = wlo.ergebnisse.map((o) => ({
        titel: o.title,
        wwwurl: o.wwwurl,
        wloRenderUrl: o.wloRenderUrl,
        lizenz: o.license,
        medientyp: o.resourceType
      }));
    } catch {
      // Graceful offline fallback
    }
  }

  const elabPayload: ElaboratePayload = {
    arrangement: matched.arrangement,
    fach,
    thema,
    didaktischerAnsatz: args.didaktischerAnsatz,
    lernziele: args.lernziele,
    differenzierung: groupMatrices.map((g) => ({
      id: g.id,
      gruppe: g.label,
      profil: g.profile || g.didacticProfile.summary,
      anzahl: g.count,
      matrixMassnahmen: g.matrixTop
    })),
    oerRessourcen: oerHits.map((o) => ({ titel: o.titel, wwwurl: o.wwwurl, lizenz: o.lizenz })),
    // Draft: profile and assumptions from the core answer, the request as the matcher read it, the plan's notes.
    text: args.text,
    bildungsstufe: args.bildungsstufe || (matched.kriterien.bildungsstufe as string | undefined),
    planungsprofil: matched.planungsprofil,
    planungsprofilAngenommen: (matched.pflichtangaben?.angenommen || []).some((x) => x.feld === 'planungsprofil'),
    raum: raumLabel(store, matched),
    anzahl: groupSize,
    einheit: typeof matched.kriterien.einheit === 'string' ? matched.kriterien.einheit : undefined,
    nachweis: matched.nachweis?.formen.map((f) => schemeValues(store.bundle, 'nachweisform').find((w) => w.id === f)?.label || f).join(' oder '),
    hinweiseListe: matched.hinweise || [],
    // Accompanying goals as the matcher read them (field or text) and the strand it proposes (D3).
    begleitziel: matched.kriterien.begleitziel as string[] | undefined,
    begleitstrang: matched.begleitstrang
  };

  const briefing = buildElaborateBriefing(store, elabPayload);
  const dauerMs = Math.round(Number(process.hrtime.bigint() - t0) / 1e4) / 100;

  const methodenDetails = briefing.fallbackTable.map((row) => {
    const b = store.blocksById.get(row.methodId);
    return {
      phase: row.phaseLabel,
      dauerMinGeplant: row.durationMin,
      kennung: row.methodId,
      name: row.methodName,
      status: b?.status || 'entwurf',
      reichweite: b?.reichweite || null,
      kurzbeschreibung: b?.kurzbeschreibung || '',
      durchfuehrung: b?.durchfuehrung || [],
      kernkomponente: (b?.kernkomponente || []).map((k) => k.name),
      qualitaetsrisiko: b?.qualitaetsrisiko || [],
      evidenz: b?.evidenz || []
    };
  });

  const verbindlicheUmsetzungsregeln = [
    'METHODENTREUE: Setze alle ausgewählten FMT-Methoden aus `methodenDetails` mit Kennung, Status (`kuratiert`/`entwurf`) sowie ihren originalen Durchführungsschritten und Kernkomponenten konkret auf das Thema um. Ersetze sie nicht stillschweigend durch freie Eigenphasen; begründe und markiere eventuelle Abweichungen explizit.',
    `ZEITKONSISTENZ: Übernimm exakt die geplanten Phasendauern aus \`thematischeTabelle\` (Summe = ${matched.pruefung?.dauerMin ?? briefing.pruefung.dauerMin} min, identisch mit \`pruefung.dauerMin\` und \`maschinenlesbar.arrangement\`).`,
    'TRANSPARENZ (MATRIX, RISIKEN & EVIDENZ): Weise Binnendifferenzierungs-Empfehlungen aus `lerngruppenUndMatrix` mit dem Hinweis aus, dass es sich um Punkte der FMT-Differenzierungsmatrix handelt (keine empirischen Effektstärken), und nenne Qualitätsrisiken sowie Evidenz immer zusammen mit ihrem Geltungsbereich.',
    'TEILGRUPPEN & ZUSATZPHASEN: Die Regelgruppe folgt dem Ablauf. `teilgruppenMethoden` nennt je Phase (`stepKey` = Zeile in `thematischeTabelle`) parallele Methoden für einzelne Teilgruppen mit Grund; `zusatzphasen` sind kurze Phasen für die ganze Klasse (Anfang oder Ende). Beides sind Vorschläge: übernimm sie nur nach Rückfrage und nenne sie als solche.',
    'BAUKASTEN-IMPORT: Biete bei Bedarf den Block `maschinenlesbar` (`FmtScenarioPlan v1.4`) an, damit die Lehrkraft den Entwurf direkt über „📋 JSON einfügen“ im FMT-Szenario-Baukasten öffnen, grafisch prüfen und exportieren kann.'
  ];

  const plan = {
    verbindlicheUmsetzungsregeln,
    dauerMs,
    engine: classification.engine,
    fach: fach || null,
    fachErkannt,
    thema: thema || null,
    angenommenerZieltyp,
    erkannteKriterien: matched.kriterien,
    skalenVorfilterung: classification.skalen,
    erkannteMatrixSignale: detectedTraits.signals,
    pruefung: matched.pruefung,
    verankert: matched.verankert || [],
    nichtVerankert: matched.nichtVerankert || [],
    // Helps named in the text: never a phase, they go to the phases in step 3 (hinweise says so).
    genannteHilfen: matched.genannteHilfen || [],
    // Steps left open and why (uncovered need), and the form of proof the check is ordered by.
    ...(matched.modus === 'ablauf' && matched.offenGruende?.length ? { offenGruende: matched.offenGruende } : {}),
    ...(matched.nachweis ? { nachweis: matched.nachweis } : {}),
    // Accompanying strand per accompanying goal: a proposal to take over, not part of the plan (D3).
    ...(matched.modus === 'ablauf' && matched.begleitstrang?.length ? { begleitstrang: matched.begleitstrang } : {}),
    annahmen: matched.annahmen || [],
    hinweise: matched.hinweise || [],
    pflichtangaben: matched.pflichtangaben,
    // Each rule message with rule, effect, basis, source and text (and the method it speaks about, if any).
    regelmeldungen: (matched.regelmeldungen || []).map((m) => ({
      regel: m.regel,
      wirkung: m.wirkung,
      grundlage: m.grundlage,
      ...(m.quelle ? { quelle: m.quelle } : {}),
      text: m.text,
      ...(m.baustein ? { baustein: m.baustein } : {}),
      ...(m.bausteine?.length ? { bausteine: m.bausteine } : {})
    })),
    methodenDetails,
    udlBasis: multiGroupSynthesis.udlBasis.slice(0, 5),
    konflikte: multiGroupSynthesis.konflikte.slice(0, 4),
    lerngruppenUndMatrix: groupMatrices,
    teilgruppenMethoden,
    zusatzphasen,
    wloOerRessourcen: oerHits,
    thematischeTabelle: briefing.fallbackTable,
    // Planning profile with its terms (also in compact answers) and the draft with seven core fields (full answer).
    planungsprofil: { ...briefing.entwurf.planungsprofil, spalten: briefing.entwurf.spalten },
    entwurf: briefing.entwurf,
    llmBriefing: briefing.llmBriefing,
    maschinenlesbar: {
      '@type': 'FmtScenarioPlan',
      schemaVersion: '1.4',
      license: store.bundle.license,
      title: fach ? `${fach}: ${thema}` : thema,
      fach: fach || null,
      thema: thema || null,
      lernziele: args.lernziele || null,
      didaktischerAnsatz: args.didaktischerAnsatz || null,
      scenarioText: args.text,
      arrangement: matched.arrangement,
      thematicRows: briefing.fallbackTable
    },
    leitplanken: FMT_GUARDRAILS
  };
  return args.umfang === 'kompakt' ? compactScenarioPlan(plan) : plan;
}

/**
 * Zero-LLM end-to-end scenario differentiation & adaptation briefing (< 5 ms).
 * Works for BOTH standalone free-text scenarios (chat / MCP / API) and structured FMT arrangements.
 */
export function buildAdaptScenarioZeroLlm(store: CatalogStore, input: AdaptScenarioInput & { text?: string }) {
  const effectiveText = input.scenarioText?.trim() || input.text?.trim() || undefined;
  const extracted = effectiveText ? extractSubjectAndTopicFromText(effectiveText) : { fach: null, thema: null };
  const fachName = input.fach?.trim() || extracted.fach || undefined;
  const stufe = input.bildungsstufe || input.arrangement?.kontext?.bildungsstufe || undefined;
  const fachErkannt = fachName ? store.subjects.erkenne(fachName, stufe) : null;
  const fachbereich =
    input.fachbereich ||
    (fachErkannt && fachErkannt.fachbereich !== 'uebergreifend' ? fachErkannt.fachbereich : undefined);
  const result = adaptScenario(store.bundle, {
    ...input,
    fachbereich,
    scenarioText: effectiveText,
    fach: input.fach?.trim() || extracted.fach || undefined,
    thema: input.thema?.trim() || extracted.thema || undefined
  });

  const verbindlicheUmsetzungsregeln = [
    'UDL ZUERST: Beginne mit den gemeinsamen Basis-Maßnahmen aus `udlBasis` (sie helfen allen Teilgruppen gleichzeitig mit minimalem Mehraufwand) und übertrage deren `umsetzungsimpuls` konkret auf das Unterrichtsthema.',
    'KONFLIKTE AKTIV AUFLÖSEN: Nenne jeden erkannten Zielkonflikt aus `konflikte` offen und setze die zugehörige `aufloesungsstrategie` (z. B. gestufte Aufgabenkarten, parallele Lernwege, Sternchenaufgaben) konkret um.',
    'METHODENKERN WAHREN: Wenn eine Phase einen konkreten FMT-Baustein mit `methodenKontext` enthält, erhalte dessen `kernkomponente` und beachte den `methodenAnpassungshinweis`, statt die Methode durch allgemeine Standard-Tipps zu verwässern.',
    'METHODENTAUSCH & ZUSATZPHASEN: `teilgruppenMethoden` (parallele Methode für eine Teilgruppe, die Regelgruppe bleibt beim Plan) und `zusatzphasen` (kurze Phase für alle) sind Vorschläge. Stelle sie als Option dar, nicht als bereits geänderten Ablauf.',
    'TEILGRUPPEN & VERMEIDEN: Formuliere für jede Gruppe in `teilgruppen` konkrete, themenspezifische Hilfen bzw. Vertiefungen und beachte ausdrücklich die `vermeiden`-Hinweise.',
    'RAHMEN & EPISTEMIK: Beachte strikt die erkannten Technik-/Offline-Grenzen (`kontext.maxTechnik`, `kontext.ohneInternet`) und trenne klar zwischen der heuristischen Binnendifferenzierungsmatrix (-100 bis +100 %, keine Effektstärken) und empirischen FMT-Evidenzgraden (A–C mit Geltungsbereich).'
  ];

  const systemPrompt =
    'Du bist ein Experte für Binnendifferenzierung, Universal Design for Learning (UDL) und die Facettierte Methodentaxonomie (FMT). ' +
    'Nutze ausschließlich die übergebenen deterministischen Anpassungsdaten (`udlBasis`, `konflikte`, `teilgruppen`, `phasenAnpassungen`), um ein konkretes, sofort im Unterricht umsetzbares Differenzierungskonzept auf Deutsch im Markdown-Format zu formulieren.\n' +
    'STRUKTUR:\n' +
    '1. ## Gemeinsame Basis für alle (UDL)\n' +
    '2. ## Zielkonflikte & konkrete Auflösungsstrategien\n' +
    '3. ## Konkrete Anpassungen je Phase & Teilgruppe (inkl. Satzstartern, Hilfekarten oder Transferimpulsen passend zum Thema sowie ggf. alternativen FMT-Methoden)\n' +
    '4. ## Was vermieden werden sollte & Einordnung (heuristische Matrix vs. FMT-Evidenz)\n' +
    'Erfinde KEINE neuen FMT-Methoden oder Studien außerhalb der übergebenen Daten.';

  const userPrompt =
    `SZENARIO-KONTEXT:\n${JSON.stringify(result.kontext, null, 2)}\n` +
    (effectiveText ? `\nAusgangsszenario:\n${effectiveText}\n` : '') +
    `\nUDL-BASIS:\n${JSON.stringify(result.udlBasis, null, 2)}\n` +
    `\nZIELKONFLIKTE:\n${JSON.stringify(result.konflikte, null, 2)}\n` +
    `\nTEILGRUPPEN:\n${JSON.stringify(result.teilgruppen, null, 2)}\n` +
    `\nPHASEN-ANPASSUNGEN:\n${JSON.stringify(result.phasenAnpassungen, null, 2)}` +
    (result.teilgruppenMethoden.length ? `\n\nPARALLELE METHODEN FÜR TEILGRUPPEN (Vorschlag):\n${JSON.stringify(result.teilgruppenMethoden, null, 2)}` : '') +
    (result.zusatzphasen.length ? `\n\nZUSATZPHASEN FÜR ALLE (Vorschlag):\n${JSON.stringify(result.zusatzphasen, null, 2)}` : '');

  return {
    verbindlicheUmsetzungsregeln,
    ...result,
    llmBriefing: {
      zweck: 'Geprüften UDL- & Binnendifferenzierungsplan konkret auf das Unterrichtsthema, Aufgabenstellungen und Phasen ausformulieren',
      ausfuehrungHinweis:
        'Alle UDL-Maßnahmen, Zielkonflikte, Teilgruppen-Profile und FMT-Methodenvorschläge sind deterministisch vorausberechnet. Übertrage die Umsetzungsimpulse direkt auf das Thema.',
      systemPrompt,
      userPrompt,
      jsonMode: false,
      maxTokens: 3200,
      leitplanken: FMT_GUARDRAILS
    } satisfies LlmBriefingPacket,
    leitplanken: FMT_GUARDRAILS
  };
}
