import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  DIFF_MATRIX_PERSONAS,
  FMT_GUARDRAILS,
  FMT_RULES,
  scoreDifferentiationMatrix,
  suggestAlternativeMethodsForGroup,
  type Arrangement,
  type MatchRequest,
  type SearchCriteria
} from '@fmt/core';
import type { CatalogStore } from '../catalog-store.js';
import { loadConfig, type ServerConfig } from '../config.js';
import { searchWloOer } from '../routes/oer.js';
import {
  elaborateScenarioCore,
  extractSubjectAndTopicFromText,
  generateMaterialCore
} from '../routes/assistant.js';
import {
  buildElaborateBriefing,
  buildMaterialBriefing,
  buildScenarioPlanZeroLlm
} from '../llm/briefings.js';

export function createFmtMcpServer(store: CatalogStore, config?: ServerConfig): McpServer {
  const effectiveConfig = config ?? loadConfig();
  const server = new McpServer({
    name: 'fmt-methodendatenbank',
    version: store.bundle.version
  });

  const textResult = (obj: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(obj, null, 2) }]
  });

  // 1. search_methods
  server.tool(
    'search_methods',
    `Facettierte Suche über alle ${store.bundle.bausteine.length} FMT-Unterrichtsmethoden (Freitext, Synonyme, Phasennamen, 13 Facetten, didaktischer Ansatz, Zeit, Gruppengröße, Technik, Evidenzgrad).`,
    {
      text: z.string().optional().describe('Suchwort, Synonym (z. B. Jigsaw) oder Phasenname (Einstieg, Sicherung)'),
      lernfunktion: z.union([z.string(), z.array(z.string())]).optional(),
      engagement: z.union([z.string(), z.array(z.string())]).optional(),
      anleitung: z.union([z.string(), z.array(z.string())]).optional(),
      interaktion: z.union([z.string(), z.array(z.string())]).optional(),
      raumzeit: z.union([z.string(), z.array(z.string())]).optional(),
      reichweite: z.union([z.string(), z.array(z.string())]).optional(),
      ansatz: z.union([z.string(), z.array(z.string())]).optional(),
      status: z.enum(['kuratiert', 'entwurf']).optional(),
      liefert: z.union([z.string(), z.array(z.string())]).optional(),
      vorhanden: z.union([z.string(), z.array(z.string())]).optional(),
      maxDauer: z.number().int().min(0).optional(),
      gruppe: z.number().int().min(1).optional(),
      maxTechnik: z.string().optional(),
      ohneInternet: z.boolean().optional(),
      ohneKI: z.boolean().optional(),
      bildungsstufe: z.string().optional(),
      vorwissen: z.string().optional(),
      minEvidenz: z.enum(['A', 'B', 'C']).optional(),
      limit: z.number().int().min(1).max(100).optional().default(20)
    },
    async ({ limit, ...criteria }) => {
      const t0 = process.hrtime.bigint();
      const hits = store.search.suche(criteria as SearchCriteria);
      const textQuery = typeof criteria.text === 'string' ? criteria.text.trim() : '';
      const semantic = textQuery && hits.length < 5 ? store.classifyText(textQuery) : null;
      const dauerMs = Math.round(Number(process.hrtime.bigint() - t0) / 1e4) / 100;
      return textResult({
        gesamt: store.bundle.bausteine.length,
        anzahl: hits.length,
        angezeigt: Math.min(hits.length, limit),
        dauerMs,
        treffer: hits.slice(0, limit).map((b) => ({
          kennung: b.kennung,
          name: b.name,
          kurzbeschreibung: b.kurzbeschreibung,
          reichweite: b.reichweite,
          status: b.status,
          ansatz: b.ansatz,
          dauerMin: b.dauerMin,
          dauerMax: b.dauerMax,
          lernfunktion: b.lernfunktion,
          anleitung: b.anleitung,
          engagement: b.engagement,
          vorbedingung: b.vorbedingung,
          nachbedingung: b.nachbedingung,
          evidenzgrad: store.search.bestGrade(b)
        })),
        ...(semantic
          ? {
              semantischeVorschlaege: semantic.methodenVorschlaege.slice(0, 6),
              skalenHinweise: semantic.skalen
            }
          : {}),
        lizenz: `${store.bundle.licenseName} (${store.bundle.creator})`
      });
    }
  );

  // 2. get_method
  server.tool(
    'get_method',
    'Liefert das vollständige 13-Facetten-Profil, Durchführungsschritte, Schnittstellen, Kernkomponenten, Qualitätsrisiken, Evidenz (mit Geltung) und freie Quellen einer Methode.',
    {
      kennung: z.string().describe('Eindeutige Kennung der Methode, z. B. "gruppenpuzzle" oder "abrufquiz"')
    },
    async ({ kennung }) => {
      const b = store.blocksById.get(kennung);
      if (!b) return textResult({ fehler: `Unbekannter Baustein „${kennung}“.` });
      return textResult({
        ...b,
        creator: store.bundle.creator,
        license: store.bundle.license,
        leitplankenHinweis: 'Hoch-inferente Facetten (A1, D1) sind Experteneinschätzungen; Evidenz gilt stets nur im angegebenen Geltungsbereich.'
      });
    }
  );

  // 3. compare_methods
  server.tool(
    'compare_methods',
    'Vergleicht zwei FMT-Bausteine Facette für Facette und hebt gezielt alle Unterschiede hervor.',
    {
      methodeA: z.string(),
      methodeB: z.string()
    },
    async ({ methodeA, methodeB }) => {
      const a = store.blocksById.get(methodeA);
      const b = store.blocksById.get(methodeB);
      if (!a || !b) {
        return textResult({ fehler: `Unbekannte Kennung: ${!a ? methodeA : methodeB}` });
      }
      const unterschiede: Array<{ facette: string; label: string; a: unknown; b: unknown }> = [];
      const gemeinsam: string[] = [];
      for (const f of store.bundle.facetten) {
        const va = a[f.feld] ?? null;
        const vb = b[f.feld] ?? null;
        if (JSON.stringify(va) !== JSON.stringify(vb)) {
          unterschiede.push({ facette: f.feld, label: `${f.id} ${f.name}`, a: va, b: vb });
        } else {
          gemeinsam.push(`${f.id} ${f.name}`);
        }
      }
      return textResult({
        methodeA: { kennung: a.kennung, name: a.name, reichweite: a.reichweite, evidenzgrad: store.search.bestGrade(a) },
        methodeB: { kennung: b.kennung, name: b.name, reichweite: b.reichweite, evidenzgrad: store.search.bestGrade(b) },
        unterschiede,
        gemeinsam
      });
    }
  );

  // 4. match_scenario
  server.tool(
    'match_scenario',
    'Deterministische 5-Stufen-Zuordnung für eine Phase oder eine geprüfte modulare Unterrichtsreihe inkl. didaktischem Ansatz (ohne Halluzinationen, <1 ms).',
    {
      text: z.string().optional(),
      modus: z.enum(['phase', 'ablauf']).optional(),
      zieltyp: z.string().optional(),
      zielart: z.string().optional(),
      ansatz: z.union([z.string(), z.array(z.string())]).optional().describe('Didaktischer Ansatz, z. B. "forschend", "kooperativ", "instruktion"'),
      lernfunktion: z.union([z.string(), z.array(z.string())]).optional(),
      anleitung: z.union([z.string(), z.array(z.string())]).optional(),
      engagement: z.union([z.string(), z.array(z.string())]).optional(),
      interaktion: z.union([z.string(), z.array(z.string())]).optional(),
      reichweite: z.union([z.string(), z.array(z.string())]).optional(),
      liefert: z.union([z.string(), z.array(z.string())]).optional(),
      zeitMin: z.number().int().min(0).optional(),
      gruppe: z.number().int().min(1).optional(),
      maxTechnik: z.string().optional(),
      ohneInternet: z.boolean().optional(),
      ohneKI: z.boolean().optional(),
      maxVorbereitung: z.number().int().min(0).optional(),
      raumzeit: z.union([z.string(), z.array(z.string())]).optional(),
      vorhanden: z.union([z.string(), z.array(z.string())]).optional(),
      vorwissen: z.string().optional(),
      bildungsstufe: z.string().optional()
    },
    async (args) => {
      try {
        const t0 = process.hrtime.bigint();
        const res = store.matcher.zuordnen(args as MatchRequest);
        const text = typeof args.text === 'string' ? args.text.trim() : '';
        const extra = text
          ? {
              ...extractSubjectAndTopicFromText(text),
              erkannteMatrixMerkmale: store.classifyText(text).matrixMerkmale
            }
          : {};
        const dauerMs = Math.round(Number(process.hrtime.bigint() - t0) / 1e4) / 100;
        return textResult({ ...res, dauerMs, ...extra, leitplanken: FMT_GUARDRAILS });
      } catch (e) {
        return textResult({ fehler: e instanceof Error ? e.message : 'Ungültige Anfrage.' });
      }
    }
  );

  // 5. validate_arrangement
  server.tool(
    'validate_arrangement',
    'Prüft ein FMT-Arrangement gegen alle 13 Kompositionsregeln (R-00 bis R-12) und nennt je Meldung die Grundlage (formal, [E], [S], [A]).',
    {
      arrangement: z.record(z.unknown()).describe('FMT-Arrangement im kompakten JSON-LD-Format')
    },
    async ({ arrangement }) => {
      try {
        const res = store.validator.validate(arrangement as unknown as Arrangement, store.exampleRegistry);
        return textResult({ ...res, leitplanken: FMT_GUARDRAILS });
      } catch (e) {
        return textResult({ fehler: e instanceof Error ? e.message : 'Ungültiges Arrangement.' });
      }
    }
  );

  // 6. suggest_replacements
  server.tool(
    'suggest_replacements',
    'Berechnet formal gültige Ersatzbausteine an einem Knotenpfad eines Arrangements (jeder Kandidat live gegen R-00..R-12 geprüft).',
    {
      arrangement: z.record(z.unknown()),
      pfad: z.string().describe('JSON-Pfad des Knotens, z. B. "/ablauf/teile/0" oder "/ablauf/haupt/teile/1"')
    },
    async ({ arrangement, pfad }) => {
      try {
        const kandidaten = store.search.ersatz(arrangement as unknown as Arrangement, pfad, store.exampleRegistry);
        return textResult({
          pfad,
          hinweis: 'Kandidaten passen formal (Arrangement bleibt gültig). Gleiche Wirkung ist nicht garantiert (Loibl et al. 2024).',
          kandidaten
        });
      } catch (e) {
        return textResult({ fehler: e instanceof Error ? e.message : 'Ungültiger Pfad.' });
      }
    }
  );

  // 7. list_vocabularies
  server.tool(
    'list_vocabularies',
    'Listet alle FMT-Vokabulare, Funktionsketten, Binnendifferenzierungs-Personas und Anfragefelder auf.',
    {
      scheme: z.string().optional().describe('Optional: Schema-ID wie "lernfunktion", "ansatz", "lernzustand", "bildungsstufe"')
    },
    async ({ scheme }) => {
      if (scheme) {
        const found = store.bundle.schemes.find((s) => s.id === scheme);
        if (!found) {
          return textResult({
            fehler: `Unbekanntes Schema „${scheme}“.`,
            verfuegbar: store.bundle.schemes.map((s) => s.id)
          });
        }
        return textResult({
          id: found.id,
          titel: found.titel,
          beschreibung: found.beschreibung,
          werte: found.werte || (found.gruppen || []).flatMap((g) => g.werte.map((w) => ({ ...w, gruppe: g.label })))
        });
      }
      return textResult({
        schemes: store.bundle.schemes.map((s) => ({ id: s.id, titel: s.titel })),
        ketten: store.bundle.ketten.map((k) => ({ id: k.id, label: k.label, zielart: k.zielart })),
        differenzierungsPersonas: DIFF_MATRIX_PERSONAS.map((p) => ({ id: p.id, name: p.name, description: p.description })),
        anfrageFelder: store.matcher.felder()
      });
    }
  );

  // 8. search_wlo_oer (WLO Prod instance, always returning wwwurl!)
  server.tool(
    'search_wlo_oer',
    'Sucht freie Bildungsmaterialien (OER) live auf der WirLernenOnline-Produktionsinstanz (redaktion.openeduhub.net) mit offiziellen Fach-, Bildungsstufen- und Medientyp-URIs. Liefert für jeden Treffer explizit die wwwurl.',
    {
      query: z.string().describe('Suchbegriff oder Thema (z. B. "Bruchrechnen", "Dichte", "Fotosynthese")'),
      fach: z.string().optional().describe('Fachname (z. B. "Mathematik", "Physik", "Biologie", "Deutsch")'),
      bildungsstufe: z.enum(['primar', 'sek1', 'sek2', 'berufsbildung', 'hochschule', 'erwachsenenbildung']).optional(),
      inhaltstyp: z
        .enum(['arbeitsblatt', 'uebung', 'video', 'interaktiv', 'experiment', 'quiz', 'rollenspiel', 'fallstudie', 'handout', 'lernspiel'])
        .optional(),
      nurOffeneLizenz: z.boolean().optional().default(false),
      maxItems: z.number().int().min(1).max(15).optional().default(6)
    },
    async (args) => {
      try {
        const res = await searchWloOer(args);
        return textResult(res);
      } catch (e) {
        return textResult({ fehler: e instanceof Error ? e.message : 'WLO-OER-Suche fehlgeschlagen.' });
      }
    }
  );

  // 9. score_differentiation_matrix
  server.tool(
    'score_differentiation_matrix',
    'Berechnet deterministische Binnendifferenzierungs-Empfehlungen über die Punkte-Matrix (-2 bis +2 über 115 Anpassungsvariablen × 172 Maßnahmen). Optional wird bei Angabe eines FMT-Bausteins geprüft, welche alternativen FMT-Methoden für diese Teilgruppe besser passen.',
    {
      personaId: z
        .enum(['languageAndCulture', 'average', 'highPerforming', 'foerderLernen', 'foerderEmSoz'])
        .optional()
        .describe('Vordefinierte Schüler-Persona'),
      selectedValues: z
        .record(z.string())
        .optional()
        .describe('Individuelle Anpassungsvariablen (z. B. {"vorwissen":"vorwissen-gering","sprachkompetenz":"sprachkompetenz-gering"})'),
      minScore: z.number().int().optional(),
      limit: z.number().int().min(1).max(40).optional().default(12),
      baustein: z.string().optional().describe('Optional: FMT-Methodenkennung, um alternative Methoden für diese Teilgruppe zu empfehlen')
    },
    async ({ personaId, selectedValues, minScore, limit, baustein }) => {
      const scoreResult = scoreDifferentiationMatrix({ personaId, selectedValues, minScore, limit });
      const currentBlock = baustein ? store.blocksById.get(baustein) : undefined;
      const alternativeMethoden = currentBlock
        ? suggestAlternativeMethodsForGroup(scoreResult, currentBlock, store.bundle.bausteine, 5)
        : [];
      return textResult({
        ...scoreResult,
        alternativeMethoden,
        verfuegbarePersonas: DIFF_MATRIX_PERSONAS.map((p) => ({ id: p.id, name: p.name, description: p.description }))
      });
    }
  );

  // 10. build_scenario_plan (Ultra-fast Zero-LLM pre-filtering + matrix + optional WLO OER + caller LLM briefing!)
  server.tool(
    'build_scenario_plan',
    'Komponiert in <5 ms ohne Server-LLM ein vollständiges, geprüftes Lehr-/Lernszenario (Freitext-Vorfilterung, FMT-Methodenablauf, automatisch erkannte Binnendifferenzierungsmatrix-Merkmale, optional WLO-OER mit wwwurl, thematische Basistabelle, JSON-LD) inkl. fertigem llmBriefing zur direkten Ausformulierung im eigenen LLM.',
    {
      text: z.string().describe('Beschreibung des Unterrichtsvorhabens'),
      fach: z.string().optional(),
      thema: z.string().optional(),
      lernziele: z.string().optional(),
      didaktischerAnsatz: z.string().optional(),
      ansatz: z.union([z.string(), z.array(z.string())]).optional(),
      anleitung: z.union([z.string(), z.array(z.string())]).optional(),
      engagement: z.union([z.string(), z.array(z.string())]).optional(),
      interaktion: z.union([z.string(), z.array(z.string())]).optional(),
      reichweite: z.union([z.string(), z.array(z.string())]).optional(),
      zeitMin: z.number().int().min(10).optional(),
      gruppe: z.number().int().min(1).optional(),
      bildungsstufe: z.string().optional(),
      vorwissen: z.string().optional(),
      maxTechnik: z.string().optional(),
      maxVorbereitung: z.number().int().min(0).optional(),
      ohneInternet: z.boolean().optional(),
      ohneKI: z.boolean().optional(),
      includeWloOer: z.boolean().optional().default(false).describe('Optional: Live-WLO-OER-Suche (mit wwwurl); false für <5 ms Antwortzeit'),
      gruppen: z
        .array(
          z.object({
            id: z.string(),
            label: z.string(),
            count: z.number().int().min(1).optional(),
            personaId: z.string().optional(),
            profile: z.string().optional()
          })
        )
        .optional()
    },
    async (args) => {
      const plan = await buildScenarioPlanZeroLlm(store, args);
      return textResult(plan);
    }
  );

  // 11. elaborate_scenario (Zero-LLM by default: <2 ms deterministic table + ready-to-use llmBriefing for the caller's LLM!)
  server.tool(
    'elaborate_scenario',
    'Erstellt in <2 ms deterministisch eine thematische Verlaufstabelle, validiert R-00..R-12 und liefert ein vorab gefiltertes llmBriefing (Katalogdaten, Durchführungsschritte, Kernkomponenten, Evidenz & Leitplanken), damit das aufrufende Enduser-LLM den Entwurf direkt ohne Halluzinationen ausformulieren kann.',
    {
      arrangement: z.record(z.unknown()).describe('FMT-Arrangement JSON-LD'),
      fach: z.string().optional(),
      thema: z.string().optional(),
      didaktischerAnsatz: z.string().optional(),
      akteure: z.string().optional(),
      lernziele: z.string().optional(),
      problemstellung: z.string().optional(),
      hinweise: z.string().optional(),
      oerRessourcen: z
        .array(z.object({ stepKey: z.string().optional(), titel: z.string(), wwwurl: z.string() }))
        .optional(),
      useServerLlm: z
        .boolean()
        .optional()
        .default(false)
        .describe('Standard false (<2 ms, Zero-LLM + llmBriefing für das Enduser-LLM). Nur true setzen, wenn explizit der Server-LLM genutzt werden soll.')
    },
    async (args) => {
      try {
        const t0 = process.hrtime.bigint();
        const payload = {
          arrangement: args.arrangement as unknown as Arrangement,
          fach: args.fach,
          thema: args.thema,
          didaktischerAnsatz: args.didaktischerAnsatz,
          akteure: args.akteure,
          lernziele: args.lernziele,
          problemstellung: args.problemstellung,
          hinweise: args.hinweise,
          oerRessourcen: args.oerRessourcen
        };
        if (args.useServerLlm && effectiveConfig.llmApiKey) {
          const res = await elaborateScenarioCore(store, effectiveConfig, {}, payload);
          return textResult({ ...res, leitplanken: FMT_GUARDRAILS });
        }
        const briefing = buildElaborateBriefing(store, payload);
        const dauerMs = Math.round(Number(process.hrtime.bigint() - t0) / 1e4) / 100;
        return textResult({
          quelle: 'deterministisch',
          dauerMs,
          pruefung: briefing.pruefung,
          ausarbeitung: briefing.fallbackMarkdown,
          thematischeTabelle: briefing.fallbackTable,
          llmBriefing: briefing.llmBriefing,
          leitplanken: FMT_GUARDRAILS
        });
      } catch (e) {
        return textResult({ fehler: e instanceof Error ? e.message : 'Ausarbeitung fehlgeschlagen.' });
      }
    }
  );

  // 12. generate_phase_material (Zero-LLM by default: <2 ms printable Markdown template + llmBriefing for caller's LLM!)
  server.tool(
    'generate_phase_material',
    'Erstellt in <2 ms deterministisch eine druckfertige Material-Strukturvorlage (Arbeitsblatt, Infoblatt, Quiz, Checkliste, Versuchsanleitung, Diskussionskarten, Glossar) plus ein fertiges llmBriefing für die fachliche Ausformulierung im Enduser-LLM.',
    {
      baustein: z.string().describe('FMT-Methodenkennung, z. B. "loesungsbeispiele" oder "abrufquiz"'),
      fach: z.string().optional(),
      thema: z.string().optional(),
      bildungsstufe: z.string().optional(),
      phaseLabel: z.string().optional(),
      dauerMin: z.number().int().min(1).optional(),
      materialTyp: z
        .enum(['arbeitsblatt', 'infoblatt', 'quiz', 'checkliste', 'versuchsanleitung', 'diskussionskarten', 'glossar'])
        .optional()
        .default('arbeitsblatt'),
      hinweise: z.string().optional(),
      useServerLlm: z
        .boolean()
        .optional()
        .default(false)
        .describe('Standard false (<2 ms, Zero-LLM-Vorlage + llmBriefing für das Enduser-LLM).')
    },
    async (args) => {
      try {
        const t0 = process.hrtime.bigint();
        const mode = args.useServerLlm && effectiveConfig.llmApiKey ? 'ki' : 'template';
        const res = await generateMaterialCore(store, effectiveConfig, {}, { ...args, mode });
        const briefing = buildMaterialBriefing(store, args);
        const dauerMs = Math.round(Number(process.hrtime.bigint() - t0) / 1e4) / 100;
        return textResult({
          ...res,
          dauerMs,
          llmBriefing: res.llmBriefing || briefing.llmBriefing,
          leitplanken: FMT_GUARDRAILS
        });
      } catch (e) {
        return textResult({ fehler: e instanceof Error ? e.message : 'Materialgenerierung fehlgeschlagen.' });
      }
    }
  );

  // 13. classify_scenario_text (Zero-LLM hybrid rule + BM25/Model2Vec scale & matrix classifier)
  server.tool(
    'classify_scenario_text',
    'Klassifiziert einen freien deutschen Szenariotext extrem schnell ohne LLM (Regeln + BM25/Trigram + optional lokales Model2Vec-Embedding) auf FMT-Filterskalen, Fach/Thema, passende Methoden und Binnendifferenzierungsmatrix-Merkmale.',
    {
      text: z.string().describe('Freitext-Beschreibung der Unterrichtsidee inkl. Rahmen, Lernziel und Lerngruppenhinweisen')
    },
    async ({ text }) => {
      const extracted = extractSubjectAndTopicFromText(text);
      const cls = store.classifyText(text);
      return textResult({
        ...cls,
        erkanntesFach: extracted.fach,
        erkanntesThema: extracted.thema,
        empfohlenerNaechsterSchritt:
          cls.kriterien.modus === 'phase'
            ? 'match_scenario (modus: "phase") oder search_methods aufrufen'
            : 'build_scenario_plan mit den vorab erkannten Kriterien aufrufen',
        leitplanken: FMT_GUARDRAILS
      });
    }
  );

  // Resources
  server.resource('catalog-summary', 'fmt://catalog/summary', async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(
          {
            version: store.bundle.version,
            versionHash: store.bundle.versionHash,
            creator: store.bundle.creator,
            license: store.bundle.license,
            anzahl: store.bundle.bausteine.length,
            bausteine: store.bundle.bausteine.map((b) => ({
              kennung: b.kennung,
              name: b.name,
              reichweite: b.reichweite,
              ansatz: b.ansatz,
              lernfunktion: b.lernfunktion,
              evidenzgrad: store.search.bestGrade(b)
            }))
          },
          null,
          2
        )
      }
    ]
  }));

  server.resource('fmt-rules', 'fmt://rules', async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify({ regeln: FMT_RULES, leitplanken: FMT_GUARDRAILS }, null, 2)
      }
    ]
  }));

  server.resource(
    'method-detail',
    new ResourceTemplate('fmt://method/{kennung}', { list: undefined }),
    async (uri, { kennung }) => {
      const id = String(kennung);
      const ld = store.bausteineJsonld.get(id);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/ld+json',
            text: ld || JSON.stringify({ fehler: 'Unbekannter Baustein.' })
          }
        ]
      };
    }
  );

  server.resource(
    'vocab-ttl',
    new ResourceTemplate('fmt://vocab/{scheme}', { list: undefined }),
    async (uri, { scheme }) => {
      const id = String(scheme);
      const ttl = store.vocabsTtl.get(id);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/turtle',
            text: ttl || `# Unbekanntes Vokabular: ${id}`
          }
        ]
      };
    }
  );

  server.resource(
    'fmt-schema',
    new ResourceTemplate('fmt://schema/{name}', { list: undefined }),
    async (uri, { name }) => {
      const text = String(name) === 'anfrage' ? store.anfrageSchemaJson : store.fmtSchemaJson;
      return {
        contents: [{ uri: uri.href, mimeType: 'application/schema+json', text }]
      };
    }
  );

  // Prompts
  server.prompt(
    'design_learning_scenario',
    'Leitet einen KI-Agent an, ein Lehr-/Lernszenario deterministisch über FMT-Tools inkl. Binnendifferenzierungsmatrix & WLO-OER zu komponieren.',
    {
      szenario: z.string().describe('Beschreibung von Thema, Bildungsstufe, Zeit, Gruppengröße und Ziel')
    },
    async ({ szenario }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Plane ein modulares Lehr-/Lernszenario für folgende Anfrage:\n\n"${szenario}"\n\n` +
              `Vorgehen (schnelle Zero-LLM-Vorfilterung über MCP, Ausformulierung durch dich als Enduser-LLM):\n` +
              `1. Nutze \`classify_scenario_text\` oder direkt \`build_scenario_plan\`, um in <5 ms einen geprüften FMT-Ablauf, erkannte Binnendifferenzierungsmatrix-Merkmale und ein fertiges \`llmBriefing\` zu erhalten.\n` +
              `2. Suche bei Bedarf mit \`search_wlo_oer\` freie Bildungsmaterialien (immer exakte \`wwwurl\` übernehmen).\n` +
              `3. Prüfe eigene Anpassungen mit \`validate_arrangement\` und formuliere den thematischen Endentwurf direkt anhand des gelieferten \`llmBriefing\` aus (nutze \`generate_phase_material\` für Material-Vorlagen + Briefings).\n` +
              `4. Beachte zwingend die vier FMT-Leitplanken:\n` +
              FMT_GUARDRAILS.map((g, i) => `   ${i + 1}. ${g}`).join('\n')
          }
        }
      ]
    })
  );

  server.prompt(
    'audit_lesson_plan',
    'Prüft einen bestehenden Unterrichtsentwurf anhand der 13 FMT-Regeln und schlägt formal gültige Alternativen vor.',
    {
      entwurf: z.string().describe('Beschreibung oder JSON-LD eines Unterrichtsablaufs')
    },
    async ({ entwurf }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Analysiere folgenden Unterrichtsentwurf mit den FMT-Tools (\`search_methods\`, \`validate_arrangement\`, \`suggest_replacements\`):\n\n${entwurf}\n\n` +
              `Weise bei jeder Regelmeldung ihre Grundlage aus (formal, [E], [S], [A]) und mache klar, dass ein gültiges Arrangement kein Qualitätsurteil über die Durchführung ist.`
          }
        }
      ]
    })
  );

  return server;
}
