import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  DIFF_MATRIX_PERSONAS,
  FMT_GUARDRAILS,
  FMT_RULES,
  QUICK_LEARNER_GROUP_PROFILES,
  nurMethoden,
  getDifferentiationMetaSummary,
  scoreDifferentiationMatrix,
  suggestAlternativeMethodsForGroup,
  type Arrangement,
  type MatchRequest,
  type SearchCriteria
} from '@fmt/core';
import { oehDisciplinesForFachbereich, resolveKennung } from '@fmt/core';
import { differenzierungsMerkmale, merkmalsEntscheidungenFuerAnfrage, schemeValues, type CatalogStore } from '../catalog-store.js';
import { loadConfig, type ServerConfig } from '../config.js';
import { searchWloOer, setWloAreaLookup, setWloSubjectLookup } from '../routes/oer.js';
import {
  elaborateScenarioCore,
  extractSubjectAndTopicFromText,
  generateMaterialCore
} from '../routes/assistant.js';
import {
  buildAdaptScenarioZeroLlm,
  buildElaborateBriefing,
  buildMaterialBriefing,
  buildScenarioPlanZeroLlm
} from '../llm/briefings.js';
import { LLM_BUDGET_EXCEEDED, serverLlmBudget } from '../llm/budget.js';
import { MAX_TEXT_CHARS } from '../routes/validation.js';
import { applySubjectFilter } from '../routes/api.js';

export function createFmtMcpServer(store: CatalogStore, config?: ServerConfig): McpServer {
  const effectiveConfig = config ?? loadConfig();
  // The WLO search reads subjects and subject areas from the catalogue; set here so the stdio server has them too.
  setWloSubjectLookup((name) => store.subjects.schulfachUri(name));
  setWloAreaLookup((fachbereich) => oehDisciplinesForFachbereich(store.bundle.faecher, fachbereich).map((f) => f.uri));
  const server = new McpServer({
    name: 'fmt-methodendatenbank',
    version: store.bundle.version
  });

  // Compact JSON: indentation adds about a quarter to the size and tells a client model nothing.
  const textResult = (obj: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(obj) }]
  });
  /** Errors carry isError so a client can tell them from results without reading the text. */
  const errorResult = (fehler: string) => ({
    content: [{ type: 'text' as const, text: JSON.stringify({ fehler }) }],
    isError: true
  });

  // Allowed codes come from the matcher's own field list, so tool schemas and checks cannot drift apart.
  const fieldCodes = (feld: string) =>
    (store.matcher.felder().find((f) => f.feld === feld)?.werte || []).map((w) => w.code) as [string, ...string[]];
  const code = (feld: string) => z.enum(fieldCodes(feld));
  const codes = (feld: string) => z.union([code(feld), z.array(code(feld))]);

  // Codes of the scheme schriftbedarf as the data holds them, plus the ohneSchrift codes as aliases (mapped in suche).
  const schriftCode = z.enum([
    ...((store.bundle.schemes.find((s) => s.id === 'schriftbedarf')?.werte || []).map((w) => w.id) as string[]),
    'lesen',
    'schreiben'
  ] as unknown as [string, ...string[]]);

  // 1. search_methods
  server.tool(
    'search_methods',
    `Facettierte Suche über alle ${store.bundle.bausteine.length} FMT-Unterrichtsmethoden (Freitext, Synonyme, Phasennamen, 13 Facetten, didaktischer Ansatz, Fach bzw. Fachbereich, Zeit, Gruppengröße, Technik, Evidenzgrad).`,
    {
      text: z.string().max(MAX_TEXT_CHARS).optional().describe('Suchwort, Synonym (z. B. Jigsaw) oder Phasenname (Einstieg, Sicherung)'),
      lernfunktion: codes('lernfunktion').optional(),
      engagement: codes('engagement').optional(),
      anleitung: codes('anleitung').optional(),
      interaktion: codes('interaktion').optional(),
      raumzeit: codes('raumzeit').optional(),
      reichweite: codes('reichweite').optional(),
      ansatz: codes('ansatz').optional(),
      status: z.enum(['kuratiert', 'entwurf']).optional(),
      liefert: codes('liefert').optional(),
      vorhanden: codes('vorhanden').optional(),
      maxDauer: z.number().int().min(0).optional(),
      gruppe: z.number().int().min(1).optional(),
      maxTechnik: code('maxTechnik').optional(),
      ohneInternet: z.boolean().optional(),
      ohneKI: z.boolean().optional(),
      bildungsstufe: code('bildungsstufe').optional(),
      vorwissen: code('vorwissen').optional(),
      raum: code('raum').optional().describe('Raumtyp: nur Methoden, deren Raumbedarf er deckt'),
      raumbedarf: codes('raumBietet').optional().describe('Nur Methoden, die mindestens eine dieser Raumeigenschaften brauchen'),
      ohneRaumbedarf: codes('raumBietet').optional().describe('Nur Methoden, die keine dieser Raumeigenschaften brauchen'),
      schriftbedarf: z
        .union([schriftCode, z.array(schriftCode)])
        .optional()
        .describe('Nur Methoden, die Lesen (liest) oder Schreiben (schreibt) brauchen; lesen/schreiben werden auch angenommen'),
      minEvidenz: z.enum(['A', 'B', 'C']).optional(),
      eintragsart: z
        .enum(['methode', 'hilfe'])
        .optional()
        .describe('Nur Methoden (tragen eine Phase) oder nur Hilfen (stützen Lernende innerhalb einer Methode); ohne Angabe beide'),
      fachbereich: codes('fachbereich')
        .optional()
        .describe('Streng: nur Methoden, die diesem Fachbereich zugeordnet sind ("uebergreifend" = ohne Fachbindung)'),
      fuerFachbereich: code('fachbereich')
        .optional()
        .describe('Passend für einen Fachbereich: Methoden des Bereichs und fachübergreifende, ohne die dafür ungeeigneten'),
      fach: z
        .string()
        .max(MAX_TEXT_CHARS)
        .optional()
        .describe('Fachname (Schul- oder Hochschulfach, z. B. "Physik"); wirkt wie fuerFachbereich mit dem Fachbereich des Fachs'),
      limit: z.number().int().min(1).max(100).optional().default(20)
    },
    async ({ limit, ...criteria }) => {
      const t0 = process.hrtime.bigint();
      const fachErkannt = applySubjectFilter(store, criteria as SearchCriteria);
      const hits = store.search.suche(criteria as SearchCriteria);
      const textQuery = typeof criteria.text === 'string' ? criteria.text.trim() : '';
      const semantic = textQuery && hits.length < 5 ? store.classifyText(textQuery) : null;
      const dauerMs = Math.round(Number(process.hrtime.bigint() - t0) / 1e4) / 100;
      return textResult({
        gesamt: store.bundle.bausteine.length,
        anzahl: hits.length,
        angezeigt: Math.min(hits.length, limit),
        dauerMs,
        ...(fachErkannt !== undefined ? { fachErkannt } : {}),
        treffer: hits.slice(0, limit).map((b) => ({
          kennung: b.kennung,
          name: b.name,
          kurzbeschreibung: b.kurzbeschreibung,
          reichweite: b.reichweite,
          status: b.status,
          eintragsart: b.eintragsart || 'methode',
          ansatz: b.ansatz,
          dauerMin: b.dauerMin,
          dauerMax: b.dauerMax,
          lernfunktion: b.lernfunktion,
          anleitung: b.anleitung,
          engagement: b.engagement,
          vorbedingung: b.vorbedingung,
          nachbedingung: b.nachbedingung,
          fachbereich: b.fachbereich || [],
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
      kennung: z.string().max(MAX_TEXT_CHARS).describe('Eindeutige Kennung der Methode, z. B. "gruppenpuzzle" oder "abrufquiz"')
    },
    async ({ kennung }) => {
      const b = store.blocksById.get(kennung);
      if (!b) return errorResult(`Unbekannter Baustein „${kennung}“.`);
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
      methodeA: z.string().max(MAX_TEXT_CHARS),
      methodeB: z.string().max(MAX_TEXT_CHARS)
    },
    async ({ methodeA, methodeB }) => {
      const a = store.blocksById.get(methodeA);
      const b = store.blocksById.get(methodeB);
      if (!a || !b) {
        return errorResult(`Unbekannte Kennung: ${!a ? methodeA : methodeB}`);
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

  // Allowed subject areas come from the vocabulary, not from a copy in this file.
  // 4. match_scenario
  server.tool(
    'match_scenario',
    'Deterministische 5-Stufen-Zuordnung für eine Phase oder eine geprüfte modulare Unterrichtsreihe inkl. didaktischem Ansatz (ohne Halluzinationen, <1 ms).',
    {
      text: z.string().max(MAX_TEXT_CHARS).optional(),
      modus: z.enum(['phase', 'ablauf']).optional(),
      zieltyp: code('zieltyp').optional(),
      zielart: code('zielart').optional().describe('Art des Lernziels: fakten, konzepte, prozeduren, problemloesen, bewegung, kondition, urteilen, gestalten, handlung'),
      ansatz: codes('ansatz').optional().describe('Didaktischer Ansatz, z. B. "forschend", "kooperativ", "instruktion"'),
      lernfunktion: codes('lernfunktion').optional(),
      anleitung: codes('anleitung').optional(),
      engagement: codes('engagement').optional(),
      interaktion: codes('interaktion').optional(),
      reichweite: codes('reichweite').optional(),
      liefert: codes('liefert').optional(),
      zeitMin: z.number().int().min(0).optional(),
      gruppe: z.number().int().min(1).optional(),
      maxTechnik: code('maxTechnik').optional(),
      ohneInternet: z.boolean().optional(),
      ohneKI: z.boolean().optional(),
      maxVorbereitung: z.number().int().min(0).optional(),
      raumzeit: codes('raumzeit').optional(),
      raum: code('raum')
        .optional()
        .describe('Raum der Stunde; wird sonst aus dem Text gelesen. Methoden, deren Raumbedarf er nicht deckt, scheiden aus.'),
      // Former name of raum: stays accepted for old clients, deliberately without a description.
      lernort: code('raum').optional(),
      raumBietet: codes('raumBietet')
        .optional()
        .describe('Raumeigenschaften, die der Raum zusätzlich zum Raumtyp bietet (z. B. Bewegungsfläche, Wandfläche)'),
      fachausstattungArt: code('fachausstattungArt').optional().describe('Art der Fachausstattung, die der Raum bietet'),
      termine: z.number().int().min(1).optional().describe('Anzahl der Termine (Sitzungen, Stunden) der Einheit'),
      nachweis: code('nachweis').optional().describe('Woran sich der Lernerfolg zeigen soll; ordnet die Prüfmethode'),
      begleitziel: codes('begleitziel')
        .optional()
        .describe('Was nebenbei gefördert werden soll (sprache, sozial, selbstregulation); wählt nie die Kette, ordnet nur unter gleichwertigen Methoden; die Antwort nennt begleitstrang'),
      ohneSchrift: codes('ohneSchrift')
        .optional()
        .describe('Was die Lernenden noch nicht können (lesen, schreiben); Methoden mit diesem Schriftbedarf scheiden aus'),
      vorhanden: codes('vorhanden').optional(),
      vorwissen: code('vorwissen').optional(),
      variante: z.number().int().min(0).optional().describe('0 = erster Vorschlag; 1, 2, … liefern den nächsten gleichwertigen Vorschlag zum selben Text'),
      bildungsstufe: code('bildungsstufe').optional(),
      fachbereich: code('fachbereich')
        .optional()
        .describe('Fächergruppe; wird sonst aus dem Fach im Text gelesen'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(10)
        .describe('Höchstzahl der Vorschläge im Modus phase; vorschlaegeGesamt nennt die Zahl aller passenden Bausteine')
    },
    async ({ limit, ...args }) => {
      try {
        const t0 = process.hrtime.bigint();
        const full = store.matcher.zuordnen(args as MatchRequest);
        const res =
          full.modus === 'phase'
            ? { ...full, vorschlaege: full.vorschlaege.slice(0, limit), vorschlaegeGesamt: full.vorschlaege.length }
            : full;
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
        return errorResult(e instanceof Error ? e.message : 'Ungültige Anfrage.');
      }
    }
  );

  // 5. validate_arrangement
  server.tool(
    'validate_arrangement',
    'Prüft ein FMT-Arrangement gegen alle 13 Kompositionsregeln (R-00 bis R-12) und nennt je Meldung die Grundlage (formal, [E], [S], [A]).',
    {
      arrangement: z.record(z.string().max(MAX_TEXT_CHARS), z.unknown()).describe('FMT-Arrangement im kompakten JSON-LD-Format')
    },
    async ({ arrangement }) => {
      try {
        const res = store.validator.validate(arrangement as unknown as Arrangement, store.exampleRegistry);
        return textResult({ ...res, leitplanken: FMT_GUARDRAILS });
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : 'Ungültiges Arrangement.');
      }
    }
  );

  // 6. suggest_replacements
  server.tool(
    'suggest_replacements',
    'Berechnet formal gültige Ersatzbausteine an einem Knotenpfad eines Arrangements (jeder Kandidat live gegen R-00..R-12 geprüft).',
    {
      arrangement: z.record(z.string().max(MAX_TEXT_CHARS), z.unknown()),
      pfad: z.string().max(MAX_TEXT_CHARS).describe('JSON-Pfad des Knotens, z. B. "/ablauf/teile/0" oder "/ablauf/haupt/teile/1"')
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
        return errorResult(e instanceof Error ? e.message : 'Ungültiger Pfad.');
      }
    }
  );

  // 7. list_vocabularies
  server.tool(
    'list_vocabularies',
    'Listet alle FMT-Vokabulare, Funktionsketten, Passungsregeln (mit Text, W-Feldern, Wirkung und Grundlage), Raumtypen, Zielarten, Binnendifferenzierungs-Personas und Anfragefelder auf.',
    {
      scheme: z.string().max(MAX_TEXT_CHARS).optional().describe('Optional: Schema-ID wie "lernfunktion", "ansatz", "lernzustand", "bildungsstufe"')
    },
    async ({ scheme }) => {
      if (scheme) {
        const found = store.bundle.schemes.find((s) => s.id === scheme);
        if (!found) {
          return {
            ...textResult({ fehler: `Unbekanntes Schema „${scheme}“.`, verfuegbar: store.bundle.schemes.map((s) => s.id) }),
            isError: true
          };
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
        // Same entries as /api/v1/meta: what each rule checks, its text, W fields, effect and basis.
        regeln: store.bundle.regeln,
        raumtypen: schemeValues(store.bundle, 'raumtyp'),
        zielarten: schemeValues(store.bundle, 'zielart'),
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
      query: z.string().max(MAX_TEXT_CHARS).describe('Suchbegriff oder Thema (z. B. "Bruchrechnen", "Dichte", "Fotosynthese")'),
      fach: z.string().max(MAX_TEXT_CHARS).optional().describe('Fachname (z. B. "Mathematik", "Physik", "Biologie", "Deutsch")'),
      fachbereich: code('fachbereich')
        .optional()
        .describe('FMT-Fachbereich. Ohne erkanntes Einzelfach filtert die Suche nach allen OEH-Fächern dieses Bereichs.'),
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
        return errorResult(e instanceof Error ? e.message : 'WLO-OER-Suche fehlgeschlagen.');
      }
    }
  );

  // 9. score_differentiation_matrix
  server.tool(
    'score_differentiation_matrix',
    'Eigenständiges Binnendifferenzierungs-Tool (auch ohne FMT-Arrangement nutzbar): Berechnet deterministische Empfehlungen über die Punkte-Matrix (115 Lernvoraussetzungs-Ausprägungen × 172 Maßnahmen, normalisiert -100..+100 %) unter Berücksichtigung von maxTechnik/ohneInternet/ohneKI/maxAufwand. Akzeptiert quickProfileId (z. B. "daz", "adhs", "lrs", "vertiefung"), personaId oder individuelle selectedValues. Optional werden bei Angabe eines FMT-Bausteins passende alternative Methoden für diese Teilgruppe vorgeschlagen (nie Hilfen, nur Methoden). `merkmale` nennt je Ausprägung unter `vorgesehen`, ob die Tabelle einen Tausch oder eine Hilfe vorsieht (mit Grundlage und Quelle); ein Tausch gilt nur unter `bedingung` (die geplante Methode löst den Grund aus und passt sich niemandem an), die Antwort für einen Ablauf gibt adapt_scenario; gesperrte Kategorien (Lerntypen/Lernstile) werden nicht gewertet und stehen mit Begründung unter `gesperrt`, ohne Fehler.',
    {
      quickProfileId: z
        .enum(['daz', 'adhs', 'lrs', 'foerder-lernen', 'vorwissen-gering', 'vertiefung', 'schuechtern', 'barriere'])
        .optional()
        .describe('Schnellprofil für typische Teilgruppen (z. B. "daz", "adhs", "lrs", "vertiefung")'),
      personaId: z
        .enum(['languageAndCulture', 'average', 'highPerforming', 'foerderLernen', 'foerderEmSoz'])
        .optional()
        .describe('Vordefinierte Schüler-Persona'),
      selectedValues: z
        .record(z.string().max(MAX_TEXT_CHARS), z.string().max(MAX_TEXT_CHARS))
        .optional()
        .describe('Individuelle Anpassungsvariablen (z. B. {"vorwissen":"vorwissen-gering","sprachkompetenz":"sprachkompetenz-gering"}); Liste per list_differentiation_options abrufbar'),
      minScore: z.number().int().optional(),
      limit: z.number().int().min(1).max(40).optional().default(12),
      maxTechnik: z.string().max(MAX_TEXT_CHARS).optional().describe('Optional: Technikeinschränkung (z. B. "t-keine" filtert digitale Maßnahmen heraus)'),
      ohneInternet: z.boolean().optional().describe('Optional: true filtert online-abhängige Maßnahmen heraus'),
      ohneKI: z.boolean().optional().describe('Optional: true schließt KI-abhängige Maßnahmen aus'),
      includeSystemMeasures: z
        .boolean()
        .optional()
        .default(false)
        .describe('Standard false (blendet Schul-/Systemmaßnahmen wie Förderstunden/Noten aus); true zeigt alle 3 Ebenen'),
      maxAufwand: z.enum(['sofort', 'kurz', 'mittel']).optional().describe('Optional: maximaler Vorbereitungsaufwand'),
      bildungsstufe: z.string().max(MAX_TEXT_CHARS).optional().describe('Optional: Bildungsstufe (z. B. "primar", "sek1") zur Filterung von Alternativmethoden'),
      baustein: z.string().max(MAX_TEXT_CHARS).optional().describe('Optional: FMT-Methodenkennung, um alternative Methoden für diese Teilgruppe zu empfehlen')
    },
    async ({ quickProfileId, personaId, selectedValues, minScore, limit, maxTechnik, ohneInternet, ohneKI, includeSystemMeasures, maxAufwand, bildungsstufe, baustein }) => {
      const quickProfile = quickProfileId
        ? QUICK_LEARNER_GROUP_PROFILES.find((p) => p.id === quickProfileId)
        : undefined;
      const mergedSelected = {
        ...(quickProfile?.selectedValues || {}),
        ...(selectedValues || {})
      };
      const scoreResult = scoreDifferentiationMatrix({
        personaId: personaId ?? quickProfile?.personaId,
        selectedValues: Object.keys(mergedSelected).length ? mergedSelected : undefined,
        gesperrt: store.bundle.teilgruppen.gesperrt,
        minScore,
        limit,
        maxTechnik,
        ohneInternet,
        ohneKI,
        includeSystemMeasures,
        maxAufwand
      });
      const currentBlock = baustein ? store.blocksById.get(baustein) : undefined;
      const alternativeMethoden = currentBlock
        ? suggestAlternativeMethodsForGroup(scoreResult, currentBlock, nurMethoden(store.bundle.bausteine), 5, undefined, {
            maxTechnik,
            ohneInternet,
            ohneKI,
            bildungsstufe
          })
        : [];
      return textResult({
        ...scoreResult,
        ...merkmalsEntscheidungenFuerAnfrage(store.bundle, personaId ?? quickProfile?.personaId, mergedSelected),
        alternativeMethoden,
        verfuegbareSchnellProfile: QUICK_LEARNER_GROUP_PROFILES.map((p) => ({ id: p.id, label: p.label, profile: p.profile })),
        verfuegbarePersonas: DIFF_MATRIX_PERSONAS.map((p) => ({ id: p.id, name: p.name, description: p.description }))
      });
    }
  );

  // 10. build_scenario_plan (Ultra-fast Zero-LLM pre-filtering + matrix + optional WLO OER + caller LLM briefing!)
  server.tool(
    'build_scenario_plan',
    'Komponiert in <5 ms ohne Server-LLM ein vollständiges, R-00..R-12-geprüftes Lehr-/Lernszenario (FMT-Methodenablauf, methodenDetails mit Durchführungsschritten/Risiken/Evidenz, technik-gefilterte Binnendifferenzierungsmatrix, zeitkonsistente thematischeTabelle, `teilgruppenMethoden` und `zusatzphasen` als Vorschläge wie Schritt 3 des Baukastens, `verbindlicheUmsetzungsregeln`; mit `umfang: "voll"` zusätzlich `llmBriefing` und JSON-LD `maschinenlesbar` für den Baukasten-Import). WICHTIG FÜR CLIENT-LLMs: Die zurückgegebenen FMT-Methoden (inkl. Durchführungsschritten, Kernkomponenten, Status, Risiken & Evidenz mit Geltung) methodentreu aufs Thema übertragen und exakte Phasendauern aus `thematischeTabelle` beibehalten; Abweichungen explizit kennzeichnen. Ohne Zeitangabe wird eine Stunde von 45 Minuten geplant; reicht das Zeitbudget für keinen Ablauf, antwortet das Tool mit `modus: "phase"` und Methodenvorschlägen für eine Phase.',
    {
      text: z.string().max(MAX_TEXT_CHARS).describe('Beschreibung des Unterrichtsvorhabens'),
      fach: z.string().max(MAX_TEXT_CHARS).optional(),
      fachbereich: code('fachbereich').optional().describe('FMT-Fachbereich; wird sonst aus dem Fach gelesen'),
      thema: z.string().max(MAX_TEXT_CHARS).optional(),
      lernziele: z.string().max(MAX_TEXT_CHARS).optional(),
      didaktischerAnsatz: z.string().max(MAX_TEXT_CHARS).optional(),
      ansatz: codes('ansatz').optional(),
      anleitung: codes('anleitung').optional(),
      engagement: codes('engagement').optional(),
      interaktion: codes('interaktion').optional(),
      reichweite: codes('reichweite').optional(),
      zeitMin: z.number().int().min(10).optional(),
      gruppe: z.number().int().min(1).optional(),
      bildungsstufe: code('bildungsstufe').optional(),
      planungsprofil: code('planungsprofil')
        .optional()
        .describe('Planungsprofil des Entwurfs (Begriffe, Module); sonst aus Bildungsstufe und Text, ohne beides angenommen'),
      vorwissen: code('vorwissen').optional(),
      maxTechnik: code('maxTechnik').optional(),
      maxVorbereitung: z.number().int().min(0).optional(),
      variante: z.number().int().min(0).optional().describe('0 = erster Vorschlag; 1, 2, … liefern den nächsten gleichwertigen Vorschlag zum selben Text'),
      ohneInternet: z.boolean().optional(),
      ohneKI: z.boolean().optional(),
      zielart: code('zielart').optional().describe('Art des Lernziels: fakten, konzepte, prozeduren, problemloesen, bewegung, kondition, urteilen, gestalten, handlung'),
      raum: code('raum')
        .optional()
        .describe('Raum der Stunde; wird sonst aus dem Text gelesen. Methoden, deren Raumbedarf er nicht deckt, scheiden aus.'),
      // Former name of raum: stays accepted for old clients, deliberately without a description.
      lernort: code('raum').optional(),
      raumBietet: codes('raumBietet').optional().describe('Raumeigenschaften, die der Raum zusätzlich zum Raumtyp bietet'),
      fachausstattungArt: code('fachausstattungArt').optional().describe('Art der Fachausstattung, die der Raum bietet'),
      ohneSchrift: codes('ohneSchrift').optional().describe('Was die Lernenden noch nicht können (lesen, schreiben); Methoden mit diesem Schriftbedarf scheiden aus'),
      termine: z.number().int().min(1).optional().describe('Anzahl der Termine (Sitzungen, Stunden) der Einheit'),
      nachweis: code('nachweis').optional().describe('Woran sich der Lernerfolg zeigen soll; ordnet die Prüfmethode'),
      begleitziel: codes('begleitziel')
        .optional()
        .describe('Was nebenbei gefördert werden soll (sprache, sozial, selbstregulation); wählt nie die Kette, ordnet nur unter gleichwertigen Methoden; die Antwort nennt begleitstrang (kurze Methode am Ende, ein Vorschlag, nicht im Ablauf)'),
      includeWloOer: z.boolean().optional().default(false).describe('Optional: Live-WLO-OER-Suche (mit wwwurl); false für <5 ms Antwortzeit'),
      umfang: z
        .enum(['kompakt', 'voll'])
        .optional()
        .default('kompakt')
        .describe('kompakt (Standard): Ablauf, Methodendetails, Tabelle, Lerngruppen, Pflichtangaben (fehlt/angenommen), Regelmeldungen (Regel, Wirkung, Grundlage, Quelle, Text) und Planungsprofil. voll: zusätzlich entwurf (sieben Kernfelder mit den Begriffen des Planungsprofils, Module zum Ausfüllen), llmBriefing, maschinenlesbar (Baukasten-Import), udlBasis, konflikte'),
      gruppen: z
        .array(
          z.object({
            id: z.string().max(MAX_TEXT_CHARS),
            label: z.string().max(MAX_TEXT_CHARS),
            count: z.number().int().min(1).optional(),
            personaId: z.string().max(MAX_TEXT_CHARS).optional(),
            profile: z.string().max(MAX_TEXT_CHARS).optional(),
            selectedValues: z.record(z.string().max(MAX_TEXT_CHARS), z.string().max(MAX_TEXT_CHARS)).optional()
          })
        )
        .optional()
        .describe('Optional: Lerngruppen; die Gruppe mit id "regel" ist die Regelgruppe und behält den Ablauf, die übrigen bekommen bei Bedarf `teilgruppenMethoden`')
    },
    async (args) => {
      try {
        const plan = await buildScenarioPlanZeroLlm(store, args);
        return 'fehler' in plan && typeof plan.fehler === 'string' ? { ...textResult(plan), isError: true } : textResult(plan);
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : 'Szenarioplan fehlgeschlagen.');
      }
    }
  );

  // 11. elaborate_scenario (Zero-LLM by default: <2 ms deterministic table + ready-to-use llmBriefing for the caller's LLM!)
  server.tool(
    'elaborate_scenario',
    'Erstellt in <2 ms deterministisch eine thematische Verlaufstabelle und den Entwurf mit sieben Kernfeldern (Rahmendaten, Lernvoraussetzungen, Ziele, Einordnung, Verlaufsplan, Sicherung des Lernerfolgs, Reflexion) in den Begriffen des Planungsprofils, validiert R-00..R-12 und liefert ein vorab gefiltertes llmBriefing (Katalogdaten, Durchführungsschritte, Kernkomponenten, Evidenz & Leitplanken), damit das aufrufende Enduser-LLM den Entwurf direkt ohne Halluzinationen ausformulieren kann.',
    {
      arrangement: z.record(z.string().max(MAX_TEXT_CHARS), z.unknown()).describe('FMT-Arrangement JSON-LD'),
      fach: z.string().max(MAX_TEXT_CHARS).optional(),
      thema: z.string().max(MAX_TEXT_CHARS).optional(),
      didaktischerAnsatz: z.string().max(MAX_TEXT_CHARS).optional(),
      akteure: z.string().max(MAX_TEXT_CHARS).optional(),
      lernziele: z.string().max(MAX_TEXT_CHARS).optional(),
      problemstellung: z.string().max(MAX_TEXT_CHARS).optional(),
      hinweise: z.string().max(MAX_TEXT_CHARS).optional(),
      bildungsstufe: code('bildungsstufe').optional().describe('Bildungsstufe; sonst aus dem Arrangement. Ohne Angabe steht „Bildungsstufe nicht angegeben“.'),
      planungsprofil: code('planungsprofil').optional().describe('Planungsprofil des Entwurfs (Begriffe, Module); sonst aus der Bildungsstufe'),
      begleitziel: codes('begleitziel').optional().describe('Begleitziele des Plans; erscheinen im Kernfeld Ziele'),
      begleitstrang: z
        .array(
          z.object({
            begleitziel: code('begleitziel'),
            baustein: z.string().max(MAX_TEXT_CHARS).optional(),
            name: z.string().max(MAX_TEXT_CHARS).optional(),
            dauerMin: z.number().int().min(1)
          })
        )
        .optional()
        .describe('Begleitstrang aus build_scenario_plan (Feld begleitstrang); erscheint als Vorschlag im Kernfeld Ziele'),
      oerRessourcen: z
        .array(z.object({ stepKey: z.string().max(MAX_TEXT_CHARS).optional(), titel: z.string().max(MAX_TEXT_CHARS), wwwurl: z.string().max(MAX_TEXT_CHARS) }))
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
          oerRessourcen: args.oerRessourcen,
          bildungsstufe: args.bildungsstufe,
          planungsprofil: args.planungsprofil,
          begleitziel: args.begleitziel,
          begleitstrang: args.begleitstrang
        };
        if (args.useServerLlm && effectiveConfig.llmApiKey) {
          if ((args.arrangement as { typ?: unknown }).typ !== 'Arrangement') {
            return errorResult('Bitte ein gültiges FMT-Arrangement (typ: "Arrangement") übergeben.');
          }
          if (!serverLlmBudget(effectiveConfig).tryTake()) return errorResult(LLM_BUDGET_EXCEEDED);
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
          entwurf: briefing.entwurf,
          llmBriefing: briefing.llmBriefing,
          leitplanken: FMT_GUARDRAILS
        });
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : 'Ausarbeitung fehlgeschlagen.');
      }
    }
  );

  // 12. generate_phase_material (Zero-LLM by default: <2 ms printable Markdown template + llmBriefing for caller's LLM!)
  server.tool(
    'generate_phase_material',
    'Erstellt in <2 ms deterministisch eine druckfertige Material-Strukturvorlage (Arbeitsblatt, Infoblatt, Quiz, Checkliste, Versuchsanleitung, Diskussionskarten, Glossar) plus ein fertiges llmBriefing für die fachliche Ausformulierung im Enduser-LLM.',
    {
      baustein: z.string().max(MAX_TEXT_CHARS).describe('FMT-Methodenkennung, z. B. "loesungsbeispiele" oder "abrufquiz"'),
      fach: z.string().max(MAX_TEXT_CHARS).optional(),
      thema: z.string().max(MAX_TEXT_CHARS).optional(),
      bildungsstufe: z.string().max(MAX_TEXT_CHARS).optional(),
      phaseLabel: z.string().max(MAX_TEXT_CHARS).optional(),
      dauerMin: z.number().int().min(1).optional(),
      materialTyp: z
        .enum(['arbeitsblatt', 'infoblatt', 'quiz', 'checkliste', 'versuchsanleitung', 'diskussionskarten', 'glossar'])
        .optional()
        .default('arbeitsblatt'),
      hinweise: z.string().max(MAX_TEXT_CHARS).optional(),
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
        // Check the input before spending a server-LLM slot on a request that would fail anyway.
        if (mode === 'ki' && !store.blocksById.has(args.baustein.trim())) {
          return errorResult('Bitte einen gültigen FMT-Methodenbaustein auswählen.');
        }
        if (mode === 'ki' && !serverLlmBudget(effectiveConfig).tryTake()) return errorResult(LLM_BUDGET_EXCEEDED);
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
        return errorResult(e instanceof Error ? e.message : 'Materialgenerierung fehlgeschlagen.');
      }
    }
  );

  // 13. classify_scenario_text (Zero-LLM hybrid rule + BM25/Model2Vec scale & matrix classifier)
  server.tool(
    'classify_scenario_text',
    'Klassifiziert einen freien deutschen Szenariotext extrem schnell ohne LLM (Regeln + BM25/Trigram + optional lokales Model2Vec-Embedding) auf FMT-Filterskalen, Fach/Thema, passende Methoden und Binnendifferenzierungsmatrix-Merkmale.',
    {
      text: z.string().max(MAX_TEXT_CHARS).describe('Freitext-Beschreibung der Unterrichtsidee inkl. Rahmen, Lernziel und Lerngruppenhinweisen')
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

  // 14. adapt_scenario (Standalone & FMT-integrated Zero-LLM differentiation + UDL + conflict resolution)
  server.tool(
    'adapt_scenario',
    'Eigenständiges Binnendifferenzierungs- & Anpassungs-Tool (vollständig unabhängig von build_scenario_plan nutzbar!): Nutze dieses Tool immer, wenn ein freies Unterrichtsszenario, eine einzelne FMT-Methode (`baustein`) oder ein FMT-Arrangement an konkrete Lernvoraussetzungen (z. B. DaZ, ADHS, LRS, Förderbedarf, geringes Vorwissen, schüchtern, Motorik, Leistungsstarke) angepasst werden soll. Liefert in <5 ms deterministisch: gemeinsame UDL-Basis, Zielkonflikte mit Auflösungsstrategien, teilgruppenspezifische Maßnahmen (-100..+100 %) mit Umsetzungsimpuls, methodentreuen Phasen-Kontext (`methodenKontext` inkl. Kernkomponente & Anpassungshinweis), passende/alternative FMT-Methoden, `teilgruppenMethoden` (parallele Methode für eine Teilgruppe, wo die geplante schlecht passt; die Regelgruppe mit id "regel" behält den Plan) und `zusatzphasen` (kurze Phasen für alle am Anfang oder Ende) wie Schritt 3 des Baukastens, sowie ein fertiges `llmBriefing`. Je Gruppe und Phase nennt `teilgruppenImpulse` die Antwort (`antwort`: passt, Hilfe in derselben Methode oder Tausch gegen eine gleichwertige Methode) mit `beleg` (Merkmal, Grundlage, Quelle), `hilfen` (je mit `abbau`, wann sie entfallen) und `alternativeMethoden` (nur beim Tausch); `teilgruppenHilfen`, `gesperrt` (Merkmale ohne Beleg, z. B. Lerntypen; kein Fehler) und `regelmeldungen` stehen auf oberster Ebene.',
    {
      scenarioText: z.string().max(MAX_TEXT_CHARS).optional().describe('Freitext-Beschreibung des vorhandenen Unterrichtsszenarios oder Entwurfs'),
      baustein: z.string().max(MAX_TEXT_CHARS).optional().describe('Optional: einzelne FMT-Methodenkennung (z. B. "gruppenpuzzle", "ampelspiel"), um genau diese Methode direkt anzupassen'),
      lerngruppenText: z
        .string()
        .max(MAX_TEXT_CHARS)
        .optional()
        .describe('Freitext zu Lernvoraussetzungen / Teilgruppen, z. B. "26 Kinder: 5 DaZ, 2 ADHS, 4 sehr leistungsstark"'),
      arrangement: z.record(z.string().max(MAX_TEXT_CHARS), z.unknown()).optional().describe('Optional: bestehendes FMT-Arrangement JSON-LD aus dem Baukasten oder build_scenario_plan'),
      phasen: z
        .array(
          z.object({
            key: z.string().max(MAX_TEXT_CHARS).optional(),
            phaseLabel: z.string().max(MAX_TEXT_CHARS),
            durationMin: z.number().int().min(1).optional(),
            baustein: z.string().max(MAX_TEXT_CHARS).optional(),
            lernfunktion: z.string().max(MAX_TEXT_CHARS).optional(),
            beschreibung: z.string().max(MAX_TEXT_CHARS).optional()
          })
        )
        .optional()
        .describe('Optional: eigene Phasenliste (auch ohne FMT-Methodenkennungen)'),
      gruppen: z
        .array(
          z.object({
            id: z.string().max(MAX_TEXT_CHARS),
            label: z.string().max(MAX_TEXT_CHARS),
            count: z.number().int().min(1).optional(),
            personaId: z.string().max(MAX_TEXT_CHARS).optional(),
            selectedValues: z.record(z.string().max(MAX_TEXT_CHARS), z.string().max(MAX_TEXT_CHARS)).optional(),
            text: z.string().max(MAX_TEXT_CHARS).optional(),
            ohneSchrift: z.array(z.enum(['lesen', 'schreiben'])).optional().describe('Was die Gruppe nicht kann; Methoden mit diesem Schriftbedarf werden getauscht oder bekommen eine Hilfe'),
            ohneBewegung: z.boolean().optional().describe('true: die Gruppe kann sich nicht frei bewegen (Methoden mit Stell- oder Bewegungsfläche scheiden aus)')
          })
        )
        .optional()
        .describe('Optional: explizite Teilgruppen mit Persona oder Matrix-Variablen (IDs über list_differentiation_options abrufbar), dazu eigene Aussagen `ohneSchrift` und `ohneBewegung`. Die Gruppe mit id "regel" ist die Regelgruppe.'),
      fach: z.string().max(MAX_TEXT_CHARS).optional().describe('Fachname; daraus wird der Fachbereich gelesen, wenn er fehlt'),
      fachbereich: code('fachbereich').optional().describe('FMT-Fachbereich; Methoden, die dafür als ungeeignet markiert sind, werden nie vorgeschlagen'),
      thema: z.string().max(MAX_TEXT_CHARS).optional(),
      bildungsstufe: code('bildungsstufe').optional(),
      zeitMin: z.number().int().min(5).optional(),
      maxTechnik: code('maxTechnik').optional().describe('Höchster Technikbedarf: "t-keine" (nur analog), "t-projektion", "t-geteilt" (Geräte je Gruppe), "t-einzeln"'),
      ohneInternet: z.boolean().optional(),
      ohneKI: z.boolean().optional(),
      maxAufwand: z.enum(['sofort', 'kurz', 'mittel']).optional(),
      includeSystemMeasures: z
        .boolean()
        .optional()
        .default(false)
        .describe('Standard false (nur sofort umsetzbare Unterrichts- & Materialmaßnahmen)')
    },
    async (args) => {
      const res = buildAdaptScenarioZeroLlm(store, {
        ...args,
        arrangement: args.arrangement as unknown as Arrangement | undefined
      });
      return textResult(res);
    }
  );

  // 15. list_differentiation_options (Standalone catalog of all 36 learner-trait variables, 8 quick profiles, 5 personas & 3 action levels)
  server.tool(
    'list_differentiation_options',
    'Listet eigenständig alle verfügbaren Lernvoraussetzungs-Merkmale (36 Anpassungsvariablen mit 115 Ausprägungen), die 8 kuratierten Schnellprofile (DaZ, ADHS, LRS, Förderbedarf Lernen, Geringes Vorwissen, Leistungsstark, Schüchtern, Sehen/Hören/Motorik), Personas und Handlungsebenen der Binnendifferenzierungsmatrix auf. Gesperrte Kategorien (Lerntypen/Lernstile, nicht belegt) fehlen in der Liste und stehen unter `gesperrteKategorien`; jede Ausprägung nennt unter `teilgruppe.vorgesehen`, ob die Tabelle einen Tausch der Methode oder eine Hilfe in derselben Methode vorsieht (ein Tausch nur unter `teilgruppe.bedingung`), mit Grundlage und Quelle – damit ein Client gezielt `adapt_scenario` oder `score_differentiation_matrix` parametrisieren kann.',
    {
      oberkategorie: z
        .string()
        .max(MAX_TEXT_CHARS)
        .optional()
        .describe('Optional: Filter auf eine Oberkategorie der Lernvoraussetzungen (z. B. "kognitive", "sprache-kultur", "foerderbedarf")')
    },
    async ({ oberkategorie }) => {
      const summary = getDifferentiationMetaSummary();
      const { variables, gesperrteKategorien } = differenzierungsMerkmale(store.bundle, oberkategorie);
      return textResult({
        ...summary,
        personas: DIFF_MATRIX_PERSONAS.map((p) => ({ id: p.id, name: p.name, description: p.description })),
        anpassungsvariablen: variables,
        gesperrteKategorien
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

  server.resource('differentiation-options', 'fmt://differentiation/options', async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(
          {
            ...getDifferentiationMetaSummary(),
            personas: DIFF_MATRIX_PERSONAS.map((p) => ({ id: p.id, name: p.name, description: p.description })),
            ...(() => {
              const { variables, gesperrteKategorien } = differenzierungsMerkmale(store.bundle);
              return { anpassungsvariablen: variables, gesperrteKategorien };
            })()
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
      const id = resolveKennung(String(kennung), store.bundle.weiterleitungen);
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
      szenario: z.string().max(MAX_TEXT_CHARS).describe('Beschreibung von Thema, Bildungsstufe, Zeit, Gruppengröße und Ziel')
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
      entwurf: z.string().max(MAX_TEXT_CHARS).describe('Beschreibung oder JSON-LD eines Unterrichtsablaufs')
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

  server.prompt(
    'adapt_lesson_differentiation',
    'Passt einen beliebigen Unterrichtsentwurf oder eine einzelne Methode unabhängig vom FMT-Baukasten an heterogene Lernvoraussetzungen an (UDL, Zielkonflikte, Teilgruppen & Methodenkontext).',
    {
      szenario: z.string().max(MAX_TEXT_CHARS).describe('Beschreibung der geplanten Stunde, Aktivität oder Methode'),
      lerngruppe: z.string().max(MAX_TEXT_CHARS).describe('Beschreibung der Lerngruppe / Voraussetzungen (z. B. DaZ, ADHS, LRS, Leistungsstarke)')
    },
    async ({ szenario, lerngruppe }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Differenziere folgendes Unterrichtsvorhaben praxistauglich und evidenztransparent:\n\n` +
              `Unterrichtsvorhaben: "${szenario}"\n` +
              `Lerngruppe: "${lerngruppe}"\n\n` +
              `Vorgehen:\n` +
              `1. Rufe \`adapt_scenario\` direkt mit \`scenarioText\` und \`lerngruppenText\` (und ggf. \`baustein\`, \`maxTechnik\`, \`ohneInternet\`) auf. Falls du exakte Merkmals-IDs brauchst, rufe vorher \`list_differentiation_options\` auf.\n` +
              `2. Übernimm die zurückgegebene UDL-Basis, benenne Zielkonflikte offen mit ihrer Auflösungsstrategie und halte dich bei konkreten Methoden an \`methodenKontext.kernkomponente\`.\n` +
              `3. Trenne klar zwischen der heuristischen Binnendifferenzierungsmatrix (-100 bis +100 %) und empirischen FMT-Evidenzgraden (A–C).`
          }
        }
      ]
    })
  );

  return server;
}
