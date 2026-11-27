import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  DIFF_MATRIX_PERSONAS,
  FMT_GUARDRAILS,
  FMT_RULES,
  KI_OPTIONALE_ANGABEN,
  KI_PFLICHTANGABEN,
  MCP_HINWEISE,
  MEASURE_LEVEL_ORDER,
  QUICK_LEARNER_GROUP_PROFILES,
  MELDUNG_LAGE_FELDER,
  getDifferentiationMetaSummary,
  istHilfe,
  scoreDifferentiationMatrix,
  ZAHL_GRENZEN,
  type Arrangement,
  type Baustein,
  type MatchRequest,
  type MeasureLevel,
  type SearchCriteria,
  type ZahlGrenze
} from '@fmt/core';
import { oehDisciplinesForFachbereich, resolveKennung } from '@fmt/core';
import { differenzierungsMerkmale, merkmalsEntscheidungenFuerAnfrage, schemeValues, type CatalogStore } from '../catalog-store.js';
import { SITUATION_FELDER, anpassungsAnfrage, pruefSituationFehler, situationAus, situationFehler, teilgruppenAlternativen } from '../kandidaten.js';
import {
  ersatzAntwort,
  evidenzBezugVon,
  klassifikationsAntwort,
  methodenDetail,
  methodenTreffer,
  pruefungsAntwort,
  vokabularUebersicht,
  zuordnungsAntwort
} from '../antworten.js';
import { anpassungLeerFehler, ARRANGEMENT_FEHLER, bausteinFehler, kettenschrittFehler, MATERIAL_TYPEN, REGEL_GRUNDLAGEN, REGEL_WIRKUNGEN } from '../eingaben.js';
import { loadConfig, type ServerConfig } from '../config.js';
import { searchWloOer, setWloAreaLookup, setWloSubjectLookup } from '../routes/oer.js';
import { elaborateScenarioCore, generateMaterialCore } from '../routes/assistant.js';
import {
  buildAdaptScenarioZeroLlm,
  buildElaborateBriefing,
  buildMaterialBriefing,
  buildScenarioPlanZeroLlm
} from '../llm/briefings.js';
import { LLM_BUDGET_EXCEEDED, serverLlmBudget } from '../llm/budget.js';
import { MAX_TEXT_CHARS } from '../routes/validation.js';
import { applySubjectFilter } from '../routes/api.js';

/** Required and optional details (shared with the web page "API & MCP" via the core). */
const PFLICHT = KI_PFLICHTANGABEN;
const OPTIONAL = KI_OPTIONALE_ANGABEN;
/** Optional details without subgroups, for tools that take no subgroups. */
const OPTIONAL_OHNE_TEILGRUPPEN = KI_OPTIONALE_ANGABEN.split(', ')
  .filter((x) => !x.startsWith('Teilgruppen'))
  .join(', ');
/** One line for tools whose answer carries pflichtangaben. */
const RUECKFRAGE = 'Lies pflichtangaben.fehlt und frage nach (eine kurze Frage, kein Formular); nenne pflichtangaben.angenommen als Annahmen.';

/** Server instructions for the calling AI; the text lives in the core so ApiMcpPage shows the same. */
export { MCP_HINWEISE };

export function createFmtMcpServer(store: CatalogStore, config?: ServerConfig): McpServer {
  const effectiveConfig = config ?? loadConfig();
  // The WLO search reads subjects and subject areas from the catalogue; set here so the stdio server has them too.
  setWloSubjectLookup((name) => store.subjects.schulfachUri(name));
  setWloAreaLookup((fachbereich) => oehDisciplinesForFachbereich(store.bundle.faecher, fachbereich).map((f) => f.uri));
  const server = new McpServer(
    {
      name: 'fmt-methodendatenbank',
      version: store.bundle.version
    },
    { instructions: MCP_HINWEISE }
  );

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
  const bedeutung = (feld: string) => store.matcher.felder().find((f) => f.feld === feld)?.bedeutung || feld;
  /** Whole number of a request field with the bounds the core accepts (ZAHL_GRENZEN), as REST checks them. */
  const zahl = (feld: string) => {
    const g: ZahlGrenze = (ZAHL_GRENZEN as Record<string, ZahlGrenze>)[feld] ?? { min: 0 };
    const s = z.number().int().min(g.min);
    return g.max != null ? s.max(g.max) : s;
  };

  /**
   * Schema entries for the core request fields (matcher.felder()): type, codes and meaning come from the core, so a
   * new field reaches the MCP tools without retyping. Tools list their own entries after the spread to override.
   */
  const felderSchema = (ausser: readonly string[] = [], nur?: readonly string[]) => {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const f of store.matcher.felder()) {
      if (ausser.includes(f.feld) || (nur && !nur.includes(f.feld))) continue;
      const s =
        f.typ === 'code'
          ? code(f.feld)
          : f.typ === 'codes'
            ? codes(f.feld)
            : f.typ === 'integer'
              ? zahl(f.feld)
              : f.typ === 'boolean'
                ? z.boolean()
                : z.string().max(MAX_TEXT_CHARS);
      shape[f.feld] = s.optional().describe(f.bedeutung);
    }
    return shape;
  };
  /** Former name of raum: stays accepted for old clients (as in REST), deliberately without a description. */
  const lernortSchema = () => ({ lernort: code('raum').optional() });
  /** Situation fields (room, literacy, dates, time, group, technology) as REST situationAus reads them, lernort included. */
  const situationSchema = () => ({ ...felderSchema([], SITUATION_FELDER), ...lernortSchema() });

  // Codes of a facet's scheme (flat or grouped), for the facets that are not request fields.
  const facettenCode = (feld: string) => {
    const schema = store.bundle.facetten.find((f) => f.feld === feld)?.schema as string | undefined;
    const ids = schemeValues(store.bundle, schema || feld).map((w) => w.id) as [string, ...string[]];
    const c = z.enum(ids);
    return z.union([c, z.array(c)]).optional();
  };
  const ebenenSchema = z
    .array(z.enum(Object.keys(MEASURE_LEVEL_ORDER) as [MeasureLevel, ...MeasureLevel[]]))
    .optional()
    .describe('Handlungsebenen der Maßnahmen: unterricht-sofort, material-planung, organisation-system');

  /** Label of a code in a scheme; any other text stays as given. */
  const labelOf = (scheme: string, v: string) => schemeValues(store.bundle, scheme).find((w) => w.id === v)?.label || v;

  // Codes of the scheme schriftbedarf as the data holds them, plus the ohneSchrift codes as aliases (mapped in suche).
  const schriftCode = z.enum([
    ...((store.bundle.schemes.find((s) => s.id === 'schriftbedarf')?.werte || []).map((w) => w.id) as string[]),
    'lesen',
    'schreiben'
  ] as unknown as [string, ...string[]]);

  // 1. search_methods
  server.tool(
    'search_methods',
    `Facettierte Suche im Katalog (${store.bundle.bausteine.filter((b) => !istHilfe(b)).length} Methoden und ${store.bundle.bausteine.filter(istHilfe).length} Hilfen; eine Hilfe stützt Lernende innerhalb einer Methode und füllt keine Phase): Freitext, Synonyme, Phasennamen, 13 Facetten, didaktischer Ansatz, Fach bzw. Fachbereich, Zeit, Gruppengröße, Technik, Evidenzgrad, Bedarf (Raum, Schrift, Termine), Eintragsart sowie Kette (zieltyp) und optional Kettenschritt (kettenschritt, nur mit zieltyp): dann nur Methoden, die einen Schritt der Kette füllen können. Treffer nennen Eintragsart, Gruppengröße, Technik, Bedarf (raumbedarf, schriftbedarf, termineMin), Eignung (fachbereichUngeeignet, ungeeignetBeiStufe, ungeeignetBeiVorwissen, eignungsgrund), Evidenzgrad und evidenzBezug sowie einordnung (Kette und Schritt, die die Methode füllen kann; Bezeichnungen in get_method). Zum Planen einer Stunde match_scenario oder build_scenario_plan nutzen. Erfrage beim Nutzer: nur, was die Suche eingrenzt (z. B. Bildungsstufe, Raum, Zeit, Gruppengröße, Technik).`,
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
      // The facets that are no request fields, with the codes of their schemes (as REST /methods accepts them).
      weltbezug: facettenCode('weltbezug'),
      adaptivitaet: facettenCode('adaptivitaet'),
      feedback: facettenCode('feedback'),
      repraesentation: facettenCode('repraesentation'),
      rolle: facettenCode('rolle'),
      aufgabe: facettenCode('aufgabe'),
      sequenz: facettenCode('sequenz'),
      maxDauer: z.number().int().min(0).optional(),
      gruppe: zahl('gruppe').optional(),
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
      ohneSchrift: codes('ohneSchrift').optional().describe(bedeutung('ohneSchrift')),
      termine: zahl('termine').optional().describe('Anzahl der Termine: Methoden, die mehr brauchen (termineMin), scheiden aus'),
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
      zieltyp: code('zieltyp')
        .optional()
        .describe('Kette (Zieltyp): nur Methoden, die einen Schritt dieser Kette füllen können (Hilfen füllen keinen)'),
      kettenschritt: z
        .string()
        .max(MAX_TEXT_CHARS)
        .optional()
        .describe('Schritt-ID der Kette (z. B. k2; Ketten und Schritte über list_vocabularies); nur zusammen mit zieltyp'),
      limit: z.number().int().min(1).max(100).optional().default(20)
    },
    async ({ limit, ...criteria }) => {
      const badSchritt = kettenschrittFehler(store, criteria);
      if (badSchritt) return errorResult(badSchritt.fehler);
      const t0 = process.hrtime.bigint();
      const fachErkannt = applySubjectFilter(store, criteria as SearchCriteria);
      const hits = store.search.suche(criteria as SearchCriteria);
      const textQuery = typeof criteria.text === 'string' ? criteria.text.trim() : '';
      const semantic = textQuery && hits.length < 5 ? store.classifyText(textQuery) : null;
      const dauerMs = Math.round(Number(process.hrtime.bigint() - t0) / 1e4) / 100;
      const hilfenGesamt = store.bundle.bausteine.filter(istHilfe).length;
      const hilfenTreffer = hits.filter(istHilfe).length;
      return textResult({
        gesamt: store.bundle.bausteine.length,
        gesamtMethoden: store.bundle.bausteine.length - hilfenGesamt,
        gesamtHilfen: hilfenGesamt,
        anzahl: hits.length,
        anzahlMethoden: hits.length - hilfenTreffer,
        anzahlHilfen: hilfenTreffer,
        angezeigt: Math.min(hits.length, limit),
        dauerMs,
        ...(fachErkannt !== undefined ? { fachErkannt } : {}),
        treffer: hits.slice(0, limit).map((b) => methodenTreffer(store, b)),
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
    'Liefert den vollständigen Eintrag einer Methode oder Hilfe: Eintragsart, 13-Facetten-Profil, Durchführungsschritte, Schnittstellen (Vor- und Nachbedingungen), Kernkomponenten, Qualitätsrisiken, Bedarf (raumbedarf, fachausstattungArt, schriftbedarf, termineMin), Eignung (fachbereich, fachbereichUngeeignet, ungeeignetBeiStufe, ungeeignetBeiVorwissen, je mit eignungsgrund und Grundlage), Evidenz mit Geltung und Evidenzbezug (methode, prinzip, programm) und freie Quellen. `einordnung` nennt die Kettenschritte, die die Methode füllen kann (Ketten aus list_vocabularies; eine Hilfe füllt keinen).',
    {
      kennung: z.string().max(MAX_TEXT_CHARS).describe('Eindeutige Kennung der Methode, z. B. "gruppenpuzzle" oder "abrufquiz"')
    },
    async ({ kennung }) => {
      const b = store.blocksById.get(kennung);
      if (!b) return errorResult(`Unbekannter Baustein „${kennung}“.`);
      return textResult(methodenDetail(store, b));
    }
  );

  // 3. compare_methods
  server.tool(
    'compare_methods',
    'Vergleicht zwei Einträge des Katalogs Facette für Facette und dazu Eintragsart, Bedarf (Raum, Fachausstattung, Schrift, Termine), Eignung (Fachbereich, ungeeignet für Stufe, Vorwissen oder Fachbereich, eignungsgrund) und Evidenzbezug; `unterschiede` nennt alles, was abweicht, `verglichen` die verglichenen Felder.',
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
      const verglichen: string[] = [];
      const vergleiche = (feld: string, label: string, va: unknown, vb: unknown) => {
        verglichen.push(feld);
        if (JSON.stringify(va ?? null) !== JSON.stringify(vb ?? null)) unterschiede.push({ facette: feld, label, a: va ?? null, b: vb ?? null });
        else gemeinsam.push(label);
      };
      for (const f of store.bundle.facetten) vergleiche(f.feld, `${f.id} ${f.name}`, a[f.feld], b[f.feld]);
      // FMT 2.0 fields: entry kind, needs, fit and the basis of the evidence.
      const merkmale: Array<[string, string, (x: Baustein) => unknown]> = [
        ['eintragsart', 'Eintragsart', (x) => x.eintragsart || 'methode'],
        ['raumbedarf', 'Bedarf: Raum', (x) => x.raumbedarf || []],
        ['fachausstattungArt', 'Bedarf: Fachausstattung', (x) => x.fachausstattungArt],
        ['schriftbedarf', 'Bedarf: Schrift', (x) => x.schriftbedarf || []],
        ['termineMin', 'Bedarf: Termine', (x) => x.termineMin],
        ['fachbereich', 'Eignung: Fachbereich', (x) => x.fachbereich || []],
        ['fachbereichUngeeignet', 'Eignung: ungeeignet für Fachbereich', (x) => x.fachbereichUngeeignet || []],
        ['ungeeignetBeiStufe', 'Eignung: ungeeignet für Bildungsstufe', (x) => x.ungeeignetBeiStufe || []],
        ['ungeeignetBeiVorwissen', 'Eignung: ungeeignet bei Vorwissen', (x) => x.ungeeignetBeiVorwissen || []],
        ['eignungsgrund', 'Eignung: Begründung', (x) => x.eignungsgrund],
        ['evidenzBezug', 'Evidenzbezug', evidenzBezugVon]
      ];
      for (const [feld, label, wert] of merkmale) vergleiche(feld, label, wert(a), wert(b));
      return textResult({
        methodeA: { kennung: a.kennung, name: a.name, reichweite: a.reichweite, evidenzgrad: store.search.bestGrade(a) },
        methodeB: { kennung: b.kennung, name: b.name, reichweite: b.reichweite, evidenzgrad: store.search.bestGrade(b) },
        unterschiede,
        gemeinsam,
        verglichen
      });
    }
  );

  // Allowed subject areas come from the vocabulary, not from a copy in this file.
  // 4. match_scenario
  server.tool(
    'match_scenario',
    `Deterministische 5-Stufen-Zuordnung für eine Phase oder einen geprüften Ablauf (Funktionskette nach Zielart, Zieltyp oder Ansatz), ohne Halluzinationen, <1 ms. Die Antwort nennt pflichtangaben (fehlt: Angaben, nach denen du fragst; angenommen: Annahmen mit Feld, Wert und Grund), regelmeldungen (Passungsregeln mit Wirkung, Grundlage und Quelle), begleitstrang (kurze Methode zum Begleitziel, ein Vorschlag) und planungsprofil (Begriffe des Entwurfs). Ausdrücklich gesetzte Felder haben Vorrang vor dem Text; fach (Fachname) wird zum Fachbereich wie bei build_scenario_plan. Wie REST /match ist fach in der Antwort das erkannte Fach als Objekt (früher Text); den gelesenen Fachnamen nennt erkanntesFach, das Thema erkanntesThema. Teilgruppen nimmt dieses Tool nicht an: dafür build_scenario_plan (gruppen) oder adapt_scenario. Erfrage beim Nutzer: ${PFLICHT}; wenn bekannt ${OPTIONAL_OHNE_TEILGRUPPEN}. ${RUECKFRAGE}`,
    {
      // Every core request field with its codes and meaning; the entries below refine the descriptions.
      ...felderSchema(),
      text: z.string().max(MAX_TEXT_CHARS).optional(),
      fach: z
        .string()
        .max(MAX_TEXT_CHARS)
        .optional()
        .describe('Fachname (z. B. "Mathematik"); daraus wird der Fachbereich gelesen, wenn er fehlt. Mit thema deckt es die Pflichtangabe fach-und-thema.'),
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
      zeitMin: zahl('zeitMin').optional(),
      gruppe: zahl('gruppe').optional(),
      maxTechnik: code('maxTechnik').optional(),
      ohneInternet: z.boolean().optional(),
      ohneKI: z.boolean().optional(),
      maxVorbereitung: zahl('maxVorbereitung').optional(),
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
      termine: zahl('termine').optional().describe('Anzahl der Termine (Sitzungen, Stunden) der Einheit'),
      nachweis: code('nachweis').optional().describe('Woran sich der Lernerfolg zeigen soll; ordnet die Prüfmethode'),
      begleitziel: codes('begleitziel')
        .optional()
        .describe('Was nebenbei gefördert werden soll (sprache, sozial, selbstregulation); wählt nie die Kette, ordnet nur unter gleichwertigen Methoden; die Antwort nennt begleitstrang'),
      ohneSchrift: codes('ohneSchrift')
        .optional()
        .describe('Was die Lernenden noch nicht können (lesen, schreiben); Methoden mit diesem Schriftbedarf scheiden aus'),
      vorhanden: codes('vorhanden').optional(),
      vorwissen: code('vorwissen').optional(),
      // Stage-4 fields (FMT 2.0): same names, codes and meaning as REST /match (matcher.felder()).
      komplexitaet: code('komplexitaet').optional().describe(bedeutung('komplexitaet')),
      sprachniveau: code('sprachniveau').optional().describe(bedeutung('sprachniveau')),
      lehrende: zahl('lehrende').optional().describe(bedeutung('lehrende')),
      thema: z.string().max(MAX_TEXT_CHARS).optional().describe(bedeutung('thema')),
      einheit: z.string().max(MAX_TEXT_CHARS).optional().describe(bedeutung('einheit')),
      bewertet: z.boolean().optional().describe(bedeutung('bewertet')),
      planungsprofil: code('planungsprofil').optional().describe(bedeutung('planungsprofil')),
      variante: zahl('variante').optional().describe('0 = erster Vorschlag; 1, 2, … liefern den nächsten gleichwertigen Vorschlag zum selben Text'),
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
        // Same answer as REST /match (shared builder).
        return textResult(zuordnungsAntwort(store, args as MatchRequest, limit));
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : 'Ungültige Anfrage.');
      }
    }
  );

  // 5. validate_arrangement
  server.tool(
    'validate_arrangement',
    `Prüft ein FMT-Arrangement gegen alle 13 Kompositionsregeln (R-00 bis R-12) und nennt je Meldung die Grundlage (formal, [E], [S], [A]). Mit \`situation\` (Felder der Anfrage wie bei match_scenario, z. B. die kriterien einer Antwort) nennt die Antwort zusätzlich \`regelmeldungen\` (Form wie bei match_scenario und build_scenario_plan): die Passungsregeln für die Methoden dieses Ablaufs, auch wenn er von Hand geändert wurde, und die Meldungen der Lage wie bei match_scenario: Passungsregeln der Situation ohne Methode, sicherheitshinweis (praktische Methoden in Fachraum, Sporthalle, draußen oder einem praktischen Fachbereich) und begleitziel-braucht-termine. Gelesen werden ${MELDUNG_LAGE_FELDER.join(', ')} (fach wie fachbereich, lernort wie raum); ein geleertes Feld gilt als nicht angegeben. Den genannten Wunsch und den Nachweis nennt nur die Antwort von match_scenario, weil sie Text und Prüfschritt des Plans brauchen. Das Ergebnis von R-00 bis R-12 bleibt gleich. Bedarf im Raum, Schrift und Termine prüft suggest_replacements je Phase; einen neuen Ablauf wählt match_scenario.`,
    {
      arrangement: z.record(z.string().max(MAX_TEXT_CHARS), z.unknown()).describe('FMT-Arrangement im kompakten JSON-LD-Format'),
      // Unknown keys pass the schema and are answered by the shared check with the same text as REST.
      situation: z
        .object({ ...felderSchema(), ...lernortSchema(), fach: z.string().max(MAX_TEXT_CHARS).optional() })
        .passthrough()
        .optional()
        .describe('Situation der Stunde (Felder der Anfrage); ohne sie bleibt die Antwort wie bisher')
    },
    async ({ arrangement, situation }) => {
      const bad = pruefSituationFehler(store, situation);
      if (bad) return errorResult(bad.fehler);
      try {
        const res = pruefungsAntwort(store, arrangement as unknown as Arrangement, situation as Record<string, unknown> | undefined);
        return textResult({ ...res, leitplanken: FMT_GUARDRAILS });
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : 'Ungültiges Arrangement.');
      }
    }
  );

  // 6. suggest_replacements
  server.tool(
    'suggest_replacements',
    'Berechnet Ersatzbausteine an einem Knotenpfad eines Arrangements: jeder Kandidat ist live gegen R-00..R-12 geprüft, ist eine Methode (keine Hilfe) und trägt die Wissensart des Kettenschritts. Mit der Situation (raum, ohneSchrift, termine, zeitMin, gruppe, maxTechnik …, als Objekt `situation` oder als einzelne Felder) bleiben nur Kandidaten, deren Bedarf darin gedeckt ist; dieselbe Prüfung wie REST /replacements. Jeder Kandidat nennt raumbedarf, schriftbedarf und termineMin; `ausgeschlossen` nennt die übrigen Methoden mit baustein, merkmal und grund.',
    {
      arrangement: z.record(z.string().max(MAX_TEXT_CHARS), z.unknown()),
      pfad: z.string().max(MAX_TEXT_CHARS).describe('JSON-Pfad des Knotens, z. B. "/ablauf/teile/0" oder "/ablauf/haupt/teile/1"'),
      situation: z.object(situationSchema()).optional().describe('Situation der Stunde; einzelne Felder auf oberster Ebene haben Vorrang'),
      ...situationSchema()
    },
    async ({ arrangement, pfad, ...rest }) => {
      const situation = situationAus(rest as Record<string, unknown>);
      const bad = situationFehler(store, situation);
      if (bad) return errorResult(bad.fehler);
      try {
        return textResult(ersatzAntwort(store, arrangement as unknown as Arrangement, pfad, situation));
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : 'Ungültiger Pfad.');
      }
    }
  );

  // 7. list_vocabularies
  server.tool(
    'list_vocabularies',
    'Listet alle FMT-Vokabulare, W-Felder (wfelder), Arten und Merkmale des Rasters, Funktionsketten mit Schritten (Funktion, Ziel, Rolle, Wissensart), Passungsregeln (mit Text, W-Feldern, Wirkung und Grundlage), Planungsprofile (Kernfelder, Begriffe, Module), die Teilgruppen-Tabelle „Tausch oder Hilfe“, Raumtypen, Zielarten, Binnendifferenzierungs-Personas, Anfragefelder und die Zahl der Methoden und Hilfen auf; dieselben Einträge wie REST /meta.',
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
        // Same entries as /api/v1/meta (shared builder).
        ...vokabularUebersicht(store)
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
    'Eigenständiges Binnendifferenzierungs-Tool (auch ohne FMT-Arrangement nutzbar): Berechnet deterministische Empfehlungen über die Punkte-Matrix (115 Lernvoraussetzungs-Ausprägungen × 172 Maßnahmen, normalisiert -100..+100 %) unter Berücksichtigung von maxTechnik/ohneInternet/ohneKI/maxAufwand. Akzeptiert quickProfileId (z. B. "daz", "adhs", "lrs", "vertiefung"), personaId oder individuelle selectedValues. Optional werden bei Angabe eines FMT-Bausteins alternative Methoden für diese Teilgruppe vorgeschlagen: nur Methoden (nie Hilfen), deren Bedarf gedeckt ist und die der geplanten Methode gleichwertig sind (`alternativenPruefung` sagt, was geprüft ist). `merkmale` nennt je Ausprägung unter `vorgesehen`, ob die Tabelle einen Tausch oder eine Hilfe vorsieht (mit Grundlage und Quelle); ein Tausch gilt nur unter `bedingung` (die geplante Methode löst den Grund aus und passt sich niemandem an), die Antwort für einen Ablauf gibt adapt_scenario; gesperrte Kategorien (Lerntypen/Lernstile) werden nicht gewertet und stehen mit Begründung unter `gesperrt`, ohne Fehler. Die Situation (raum, termine, zeitMin …, einzeln oder als Objekt `situation`) und ohneSchrift/ohneBewegung der Teilgruppe prüft es wie REST /differentiation/score. Erfrage beim Nutzer: Merkmale der Teilgruppe als Gruppe (keine Diagnose einzelner Lernender), die geplante Methode und den Raum.',
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
      maxTechnik: code('maxTechnik').optional().describe('Optional: Technikeinschränkung (z. B. "t-keine" filtert digitale Maßnahmen heraus)'),
      ohneInternet: z.boolean().optional().describe('Optional: true filtert online-abhängige Maßnahmen heraus'),
      ohneKI: z.boolean().optional().describe('Optional: true schließt KI-abhängige Maßnahmen aus'),
      includeSystemMeasures: z
        .boolean()
        .optional()
        .default(false)
        .describe('Standard false (blendet Schul-/Systemmaßnahmen wie Förderstunden/Noten aus); true zeigt alle 3 Ebenen'),
      maxAufwand: z.enum(['sofort', 'kurz', 'mittel']).optional().describe('Optional: maximaler Vorbereitungsaufwand'),
      bildungsstufe: code('bildungsstufe').optional().describe('Optional: Bildungsstufe (z. B. "primar", "sek1") zur Filterung von Alternativmethoden'),
      baustein: z.string().max(MAX_TEXT_CHARS).optional().describe('Optional: FMT-Methodenkennung, um alternative Methoden für diese Teilgruppe zu empfehlen'),
      ebenen: ebenenSchema,
      ohneSchrift: z.array(z.enum(['lesen', 'schreiben'])).optional().describe('Was die Teilgruppe nicht kann; Alternativen mit diesem Schriftbedarf scheiden aus'),
      ohneBewegung: z.boolean().optional().describe('true: die Teilgruppe kann sich nicht frei bewegen'),
      lehrende: zahl('lehrende').optional().describe(bedeutung('lehrende')),
      zieltyp: code('zieltyp').optional().describe('Kette der Phase: Bindung und Lernzustand, die die Alternative erreichen muss (mit kettenschritt)'),
      kettenschritt: z.string().max(MAX_TEXT_CHARS).optional().describe('Schritt-ID der Kette, den die Phase füllt (Ketten über list_vocabularies)'),
      dauerMin: z.number().int().min(1).optional().describe('Minuten der Phase'),
      // Remaining situation fields (raum, termine, zeitMin …); maxTechnik, ohneInternet, ohneKI and bildungsstufe stand above.
      ...felderSchema([], SITUATION_FELDER.filter((f) => !['maxTechnik', 'ohneInternet', 'ohneKI', 'bildungsstufe', 'ohneSchrift'].includes(f))),
      ...lernortSchema(),
      situation: z.object(situationSchema()).optional().describe('Situation der Stunde als Objekt (wie REST /differentiation/score); einzelne Felder auf oberster Ebene haben Vorrang')
    },
    async (args) => {
      const { quickProfileId, personaId, selectedValues, minScore, limit, maxTechnik, ohneInternet, ohneKI, includeSystemMeasures, maxAufwand, baustein, ebenen } = args;
      // Same situation and catalogue check as REST /differentiation/score.
      const situation = situationAus(args as Record<string, unknown>) || {};
      const bad = situationFehler(store, situation) || bausteinFehler(store, baustein);
      if (bad) return errorResult(bad.fehler);
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
        maxAufwand,
        ebenen: ebenen as MeasureLevel[] | undefined
      });
      // Same core filter as REST /differentiation/score: methods only, needs covered, equivalent to the planned method.
      const pruefung = teilgruppenAlternativen(store, {
        matrix: scoreResult,
        baustein,
        personaId: personaId ?? quickProfile?.personaId,
        selectedValues: mergedSelected,
        ohneSchrift: args.ohneSchrift,
        ohneBewegung: args.ohneBewegung === true,
        situation,
        lehrende: args.lehrende,
        zieltyp: args.zieltyp,
        kettenschritt: args.kettenschritt,
        dauerMin: args.dauerMin
      });
      const alternativeMethoden = pruefung.alternativen;
      return textResult({
        ...scoreResult,
        ...merkmalsEntscheidungenFuerAnfrage(store.bundle, personaId ?? quickProfile?.personaId, mergedSelected),
        alternativeMethoden,
        ...(baustein
          ? { alternativenPruefung: { gleichwertigGeprueft: pruefung.gleichwertigGeprueft, hinweis: pruefung.hinweis, ausgeschlossen: pruefung.ausgeschlossen.slice(0, 10) } }
          : {}),
        verfuegbareSchnellProfile: QUICK_LEARNER_GROUP_PROFILES.map((p) => ({ id: p.id, label: p.label, profile: p.profile })),
        verfuegbarePersonas: DIFF_MATRIX_PERSONAS.map((p) => ({ id: p.id, name: p.name, description: p.description }))
      });
    }
  );

  // 10. build_scenario_plan (Ultra-fast Zero-LLM pre-filtering + matrix + optional WLO OER + caller LLM briefing!)
  server.tool(
    'build_scenario_plan',
    'Komponiert in <5 ms ohne Server-LLM ein vollständiges, R-00..R-12-geprüftes Lehr-/Lernszenario (FMT-Methodenablauf, methodenDetails mit Durchführungsschritten/Risiken/Evidenz, technik-gefilterte Binnendifferenzierungsmatrix, zeitkonsistente thematischeTabelle, `teilgruppenMethoden` und `zusatzphasen` als Vorschläge wie Schritt 3 des Baukastens, `verbindlicheUmsetzungsregeln`; mit `umfang: "voll"` zusätzlich `llmBriefing` und JSON-LD `maschinenlesbar` für den Baukasten-Import). WICHTIG FÜR CLIENT-LLMs: Die zurückgegebenen FMT-Methoden (inkl. Durchführungsschritten, Kernkomponenten, Status, Risiken & Evidenz mit Geltung) methodentreu aufs Thema übertragen und exakte Phasendauern aus `thematischeTabelle` beibehalten; Abweichungen explizit kennzeichnen. Ohne Zeitangabe wird eine Stunde von 45 Minuten geplant; reicht das Zeitbudget für keinen Ablauf, antwortet das Tool mit `modus: "phase"` und Methodenvorschlägen für eine Phase. Die Antwort nennt pflichtangaben (fehlt, angenommen) und regelmeldungen (Passungsregeln mit Wirkung und Grundlage). Nimmt alle Anfragefelder des Kerns an wie REST /plan.' +
      ` Erfrage beim Nutzer: ${PFLICHT} sowie Teilgruppen mit Anzahl und Merkmalen; wenn bekannt ${OPTIONAL}. ${RUECKFRAGE}`,
    {
      // Every core request field (modus is set by the plan); the entries below refine the descriptions.
      ...felderSchema(['modus']),
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
      zeitMin: zahl('zeitMin').optional(),
      gruppe: zahl('gruppe').optional(),
      bildungsstufe: code('bildungsstufe').optional(),
      planungsprofil: code('planungsprofil')
        .optional()
        .describe('Planungsprofil des Entwurfs (Begriffe, Module); sonst aus Bildungsstufe und Text, ohne beides angenommen'),
      vorwissen: code('vorwissen').optional(),
      maxTechnik: code('maxTechnik').optional(),
      maxVorbereitung: zahl('maxVorbereitung').optional(),
      variante: zahl('variante').optional().describe('0 = erster Vorschlag; 1, 2, … liefern den nächsten gleichwertigen Vorschlag zum selben Text'),
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
      termine: zahl('termine').optional().describe('Anzahl der Termine (Sitzungen, Stunden) der Einheit'),
      nachweis: code('nachweis').optional().describe('Woran sich der Lernerfolg zeigen soll; ordnet die Prüfmethode'),
      begleitziel: codes('begleitziel')
        .optional()
        .describe('Was nebenbei gefördert werden soll (sprache, sozial, selbstregulation); wählt nie die Kette, ordnet nur unter gleichwertigen Methoden; die Antwort nennt begleitstrang (kurze Methode am Ende, ein Vorschlag, nicht im Ablauf)'),
      includeWloOer: z.boolean().optional().default(false).describe('Optional: Live-WLO-OER-Suche (mit wwwurl); false für <5 ms Antwortzeit'),
      umfang: z
        .enum(['kompakt', 'voll'])
        .optional()
        .default('kompakt')
        .describe('kompakt (Standard dieses Tools; REST /plan antwortet ohne Angabe voll): Ablauf, Methodendetails, Tabelle, Lerngruppen, Pflichtangaben (fehlt/angenommen), Regelmeldungen (Regel, Wirkung, Grundlage, Quelle, Text) und Planungsprofil. voll: zusätzlich entwurf (sieben Kernfelder mit den Begriffen des Planungsprofils, Module zum Ausfüllen), llmBriefing, maschinenlesbar (Baukasten-Import), udlBasis, konflikte'),
      gruppen: z
        .array(
          z.object({
            id: z.string().max(MAX_TEXT_CHARS),
            label: z.string().max(MAX_TEXT_CHARS),
            count: z.number().int().min(1).optional(),
            personaId: z.string().max(MAX_TEXT_CHARS).optional(),
            profile: z.string().max(MAX_TEXT_CHARS).optional(),
            selectedValues: z.record(z.string().max(MAX_TEXT_CHARS), z.string().max(MAX_TEXT_CHARS)).optional(),
            genannt: z
              .array(z.string().max(MAX_TEXT_CHARS))
              .max(50)
              .optional()
              .describe('Ausprägungen, die der Text für die Gruppe nennt (wie REST /plan); nur sie entscheiden über Tausch oder Hilfe'),
            ohneSchrift: z.array(z.enum(['lesen', 'schreiben'])).optional().describe('Was die Gruppe nicht kann; Methoden mit diesem Schriftbedarf werden getauscht oder bekommen eine Hilfe'),
            ohneBewegung: z.boolean().optional().describe('true: die Gruppe kann sich nicht frei bewegen (Methoden mit Stell- oder Bewegungsfläche scheiden aus)')
          })
        )
        .optional()
        .describe('Optional: Lerngruppen mit Anzahl und Merkmalen (keine einzelnen Lernenden); die Gruppe mit id "regel" ist die Regelgruppe und behält den Ablauf, die übrigen bekommen bei Bedarf `teilgruppenMethoden`')
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
    'Erstellt in <2 ms deterministisch eine thematische Verlaufstabelle und den Entwurf mit sieben Kernfeldern (Rahmendaten, Lernvoraussetzungen, Ziele, Einordnung, Verlaufsplan, Sicherung des Lernerfolgs, Reflexion) in den Begriffen des Planungsprofils, validiert R-00..R-12 und liefert ein vorab gefiltertes llmBriefing (Katalogdaten, Durchführungsschritte, Kernkomponenten, Evidenz & Leitplanken), damit das aufrufende Enduser-LLM den Entwurf direkt ohne Halluzinationen ausformulieren kann. Raum, Anzahl, Einheit, Nachweis, bewertet und hinweiseListe (aus build_scenario_plan: Raum, Gruppengröße, hinweise) erscheinen in den Rahmendaten und der Sicherung des Lernerfolgs; regelmeldungen (aus build_scenario_plan, unverändert) stehen mit Regel, Wirkung und Grundlage unter Reflexion; planungsprofilAngenommen markiert das Planungsprofil als Annahme; text, entwurfTeilgruppen, differenzierung, phasen und materialien wie REST /assistant/elaborate. Erfrage beim Nutzer: Raum, Gruppengröße, übergeordnete Einheit, Nachweis und ob bewertet wird, wenn sie noch nicht bekannt sind.',
    {
      arrangement: z.record(z.string().max(MAX_TEXT_CHARS), z.unknown()).describe('FMT-Arrangement JSON-LD'),
      text: z.string().max(MAX_TEXT_CHARS).optional().describe('Text der Anfrage; Wörter wie Betrieb oder Ausbildung wählen das Planungsprofil'),
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
      raum: z.string().max(MAX_TEXT_CHARS).optional().describe('Raum der Stunde als Raumtyp-Code (z. B. "fachraum-nawi") oder Bezeichnung; erscheint in den Rahmendaten'),
      anzahl: z.number().int().min(1).optional().describe('Gruppengröße; erscheint in den Rahmendaten'),
      einheit: z.string().max(MAX_TEXT_CHARS).optional().describe(bedeutung('einheit')),
      nachweis: z.string().max(MAX_TEXT_CHARS).optional().describe('Woran sich der Lernerfolg zeigt: Code (schriftlich, muendlich, praktisch, produkt) oder Text'),
      bewertet: z.boolean().optional().describe(bedeutung('bewertet')),
      hinweiseListe: z.array(z.string().max(MAX_TEXT_CHARS)).max(50).optional().describe('Hinweise des Plans (Feld hinweise aus build_scenario_plan); erscheinen im Entwurf'),
      regelmeldungen: z
        .array(
          z.object({
            regel: z.string().min(1).max(MAX_TEXT_CHARS),
            wirkung: z.enum(REGEL_WIRKUNGEN),
            grundlage: z.enum(REGEL_GRUNDLAGEN),
            quelle: z.string().max(MAX_TEXT_CHARS).optional(),
            text: z.string().min(1).max(MAX_TEXT_CHARS),
            baustein: z.string().max(MAX_TEXT_CHARS).optional(),
            bausteine: z.array(z.string().max(MAX_TEXT_CHARS)).max(50).optional()
          })
        )
        .max(50)
        .optional()
        .describe('Regelmeldungen des Plans (Feld regelmeldungen aus build_scenario_plan, unverändert); erscheinen unter Reflexion mit Regel, Wirkung und Grundlage'),
      planungsprofilAngenommen: z.boolean().optional().describe('true: das Planungsprofil ist angenommen (aus pflichtangaben.angenommen des Plans); der Entwurf sagt es'),
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
        .array(
          z
            .object({
              stepKey: z.string().max(MAX_TEXT_CHARS).optional(),
              titel: z.string().max(MAX_TEXT_CHARS),
              wwwurl: z.string().max(MAX_TEXT_CHARS).optional(),
              url: z.string().max(MAX_TEXT_CHARS).optional(),
              lizenz: z.string().max(MAX_TEXT_CHARS).nullable().optional(),
              notiz: z.string().max(MAX_TEXT_CHARS).optional()
            })
            .refine((o) => Boolean(o.wwwurl || o.url), { message: 'Feld „oerRessourcen“: je Eintrag wwwurl oder url angeben.' })
        )
        .max(100)
        .optional()
        .describe('OER je Phase (stepKey) oder für alle: titel und wwwurl (aus search_wlo_oer) oder url, dazu lizenz und notiz wie REST'),
      // Same fields as REST /assistant/elaborate (ElaboratePayload).
      entwurfTeilgruppen: z
        .array(
          z.object({
            id: z.string().max(MAX_TEXT_CHARS).optional(),
            gruppe: z.string().max(MAX_TEXT_CHARS),
            profil: z.string().max(MAX_TEXT_CHARS).optional(),
            anzahl: z.number().int().min(1).optional()
          })
        )
        .max(50)
        .optional()
        .describe('Teilgruppen, die der Entwurf unter Lernvoraussetzungen nennt (Gruppen mit Anzahl, keine Einzelnen); ohne Angabe gilt differenzierung'),
      differenzierung: z
        .array(
          z.object({
            id: z.string().max(MAX_TEXT_CHARS).optional(),
            gruppe: z.string().max(MAX_TEXT_CHARS),
            profil: z.string().max(MAX_TEXT_CHARS).optional(),
            anzahl: z.number().int().min(1).optional(),
            matrixMassnahmen: z.array(z.string().max(MAX_TEXT_CHARS)).max(50).optional()
          })
        )
        .max(50)
        .optional()
        .describe('Teilgruppen mit Maßnahmen der Matrix (z. B. aus adapt_scenario); erscheinen je Phase in der Verlaufstabelle'),
      phasen: z
        .array(
          z.object({
            key: z.string().max(MAX_TEXT_CHARS),
            orderLabel: z.string().max(MAX_TEXT_CHARS),
            phaseLabel: z.string().max(MAX_TEXT_CHARS),
            durationMin: z.number().int().min(0),
            methodId: z.string().max(MAX_TEXT_CHARS),
            methodName: z.string().max(MAX_TEXT_CHARS),
            subgroupMethods: z
              .record(z.string().max(MAX_TEXT_CHARS), z.object({ methodId: z.string().max(MAX_TEXT_CHARS), methodName: z.string().max(MAX_TEXT_CHARS) }))
              .optional(),
            kettenschritt: z.string().max(MAX_TEXT_CHARS).optional(),
            wiederkehr: z.boolean().optional()
          })
        )
        .max(100)
        .optional()
        .describe('Optional: Phasen mit Methoden je Teilgruppe (subgroupMethods); sonst aus dem Arrangement gelesen'),
      materialien: z
        .array(
          z.object({
            stepKey: z.string().max(MAX_TEXT_CHARS).optional(),
            titel: z.string().max(MAX_TEXT_CHARS),
            typ: z.string().max(MAX_TEXT_CHARS).optional(),
            kurzinhalt: z.string().max(MAX_TEXT_CHARS).optional()
          })
        )
        .max(100)
        .optional()
        .describe('Eigene Materialien (Titel, Typ, Kurzinhalt), je Phase über stepKey oder für alle'),
      useServerLlm: z
        .boolean()
        .optional()
        .default(false)
        .describe('Standard false (<2 ms, Zero-LLM + llmBriefing für das Enduser-LLM). Nur true setzen, wenn explizit der Server-LLM genutzt werden soll.')
    },
    async (args) => {
      // Same check as REST /assistant/elaborate, before either branch.
      if ((args.arrangement as { typ?: unknown }).typ !== 'Arrangement') {
        return errorResult(ARRANGEMENT_FEHLER);
      }
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
          begleitstrang: args.begleitstrang,
          // Codes become the labels the draft names; free text stays as given.
          raum: args.raum ? labelOf('raumtyp', args.raum) : undefined,
          anzahl: args.anzahl,
          einheit: args.einheit,
          nachweis: args.nachweis ? labelOf('nachweisform', args.nachweis) : undefined,
          bewertet: args.bewertet,
          hinweiseListe: args.hinweiseListe,
          regelmeldungen: args.regelmeldungen,
          planungsprofilAngenommen: args.planungsprofilAngenommen,
          text: args.text,
          entwurfTeilgruppen: args.entwurfTeilgruppen,
          differenzierung: args.differenzierung,
          phasen: args.phasen,
          materialien: args.materialien
        };
        if (args.useServerLlm && effectiveConfig.llmApiKey) {
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
    'Erstellt in <2 ms deterministisch eine druckfertige Material-Strukturvorlage (Arbeitsblatt, Infoblatt, Quiz, Checkliste, Versuchsanleitung, Diskussionskarten, Glossar) zu einer Methode plus ein fertiges llmBriefing für die fachliche Ausformulierung im Enduser-LLM. `baustein` kann auch eine Hilfe sein (Material, das Lernende innerhalb der Methode stützt) oder die Methode des Begleitstrangs (begleitstrang[].baustein aus build_scenario_plan). Das Planungsprofil bestimmt, wie die Lernenden heißen; `gruppen` legt gestufte Hilfen und Vertiefungen je Lerngruppe an. Erfrage beim Nutzer: Materialart, Thema und Lerngruppen mit ihren Hilfen, wenn sie noch nicht bekannt sind. Kennzeichne in deiner Ausformulierung, was du erzeugt hast.',
    {
      baustein: z.string().max(MAX_TEXT_CHARS).describe('FMT-Methodenkennung, z. B. "loesungsbeispiele" oder "abrufquiz"'),
      fach: z.string().max(MAX_TEXT_CHARS).optional(),
      thema: z.string().max(MAX_TEXT_CHARS).optional(),
      bildungsstufe: code('bildungsstufe').optional(),
      phaseLabel: z.string().max(MAX_TEXT_CHARS).optional(),
      dauerMin: z.number().int().min(1).optional(),
      materialTyp: z
        .enum(MATERIAL_TYPEN)
        .optional()
        .default('arbeitsblatt'),
      hinweise: z.string().max(MAX_TEXT_CHARS).optional(),
      planungsprofil: code('planungsprofil').optional().describe(bedeutung('planungsprofil')),
      gruppen: z
        .array(
          z.object({
            label: z.string().max(MAX_TEXT_CHARS),
            profile: z.string().max(MAX_TEXT_CHARS).describe('Was die Gruppe braucht (z. B. Wortbank und Satzstarter)'),
            count: z.number().int().min(1).optional(),
            matrixMeasures: z.array(z.string().max(MAX_TEXT_CHARS)).max(20).optional().describe('Maßnahmen aus score_differentiation_matrix')
          })
        )
        .max(8)
        .optional()
        .describe('Optional: Lerngruppen (keine einzelnen Lernenden), wie REST /assistant/material'),
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
    `Klassifiziert einen freien deutschen Szenariotext extrem schnell ohne LLM (Regeln + BM25/Trigram + optional lokales Model2Vec-Embedding) auf FMT-Filterskalen, Fach/Thema, passende Methoden und Binnendifferenzierungsmatrix-Merkmale. pflichtangaben nennt, was der Text offenlässt (fehlt) und was angenommen würde (angenommen), wie REST /classify. Guter erster Schritt, bevor du planst. Erfrage beim Nutzer: was pflichtangaben.fehlt nennt (${PFLICHT}). ${RUECKFRAGE}`,
    {
      text: z.string().max(MAX_TEXT_CHARS).describe('Freitext-Beschreibung der Unterrichtsidee inkl. Rahmen, Lernziel und Lerngruppenhinweisen')
    },
    async ({ text: roh }) => {
      // Same check as REST /classify.
      const text = roh.trim();
      if (!text) return errorResult('Bitte ein Feld "text" zur Klassifikation übergeben.');
      return textResult(klassifikationsAntwort(store, text));
    }
  );

  // 14. adapt_scenario (Standalone & FMT-integrated Zero-LLM differentiation + UDL + conflict resolution)
  server.tool(
    'adapt_scenario',
    'Eigenständiges Binnendifferenzierungs- & Anpassungs-Tool (vollständig unabhängig von build_scenario_plan nutzbar!): Nutze dieses Tool immer, wenn ein freies Unterrichtsszenario, eine einzelne FMT-Methode (`baustein`) oder ein FMT-Arrangement an konkrete Lernvoraussetzungen (z. B. DaZ, ADHS, LRS, Förderbedarf, geringes Vorwissen, schüchtern, Motorik, Leistungsstarke) angepasst werden soll. Liefert in <5 ms deterministisch: gemeinsame UDL-Basis, Zielkonflikte mit Auflösungsstrategien, teilgruppenspezifische Maßnahmen (-100..+100 %) mit Umsetzungsimpuls, methodentreuen Phasen-Kontext (`methodenKontext` inkl. Kernkomponente & Anpassungshinweis), passende/alternative FMT-Methoden, `teilgruppenMethoden` (parallele Methode für eine Teilgruppe, wo die geplante schlecht passt; die Regelgruppe mit id "regel" behält den Plan) und `zusatzphasen` (kurze Phasen für alle am Anfang oder Ende) wie Schritt 3 des Baukastens, sowie ein fertiges `llmBriefing`. Je Gruppe und Phase nennt `teilgruppenImpulse` die Antwort (`antwort`: passt, hilfe = die geplante Methode bleibt und die Gruppe bekommt eine Hilfe, oder tausch gegen eine gleichwertige Methode) mit `beleg` (Merkmal, Grundlage, Quelle), `hilfen` (je mit `abbau`, wann sie entfallen) und `alternativeMethoden` (nur beim Tausch). Steht `ohneMethode: true` (freier Text ohne geplante FMT-Methode), wurde keine Passung geprüft: `antwort: hilfe` nennt dann nur die Hilfen der Matrix für die Gruppe, keine Entscheidung über eine Methode. `teilgruppenHilfen`, `gesperrt` (Merkmale ohne Beleg, z. B. Lerntypen; kein Fehler) und `regelmeldungen` stehen immer auf oberster Ebene. Die Situation der Stunde (`anfrage` oder raum, ohneSchrift, termine … auf oberster Ebene) und `lehrende` prüfen, ob eine parallele Methode ihren Bedarf im selben Rahmen deckt; dieselbe Prüfung wie REST /adapt. Erfrage beim Nutzer: Teilgruppen mit Anzahl und Merkmalen (z. B. DaZ, liest noch nicht, kann sich nicht frei bewegen), Raum und Zahl der Lehrenden; beschreibe Gruppen, keine einzelnen Lernenden.',
    {
      scenarioText: z.string().max(MAX_TEXT_CHARS).optional().describe('Freitext-Beschreibung des vorhandenen Unterrichtsszenarios oder Entwurfs'),
      text: z.string().max(MAX_TEXT_CHARS).optional().describe('Gleichbedeutend mit scenarioText (wie REST /adapt)'),
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
      zeitMin: zahl('zeitMin').optional(),
      maxTechnik: code('maxTechnik').optional().describe('Höchster Technikbedarf: "t-keine" (nur analog), "t-projektion", "t-geteilt" (Geräte je Gruppe), "t-einzeln"'),
      ohneInternet: z.boolean().optional(),
      ohneKI: z.boolean().optional(),
      maxAufwand: z.enum(['sofort', 'kurz', 'mittel']).optional(),
      includeSystemMeasures: z
        .boolean()
        .optional()
        .default(false)
        .describe('Standard false (nur sofort umsetzbare Unterrichts- & Materialmaßnahmen)'),
      ebenen: ebenenSchema,
      lehrende: zahl('lehrende').optional().describe(bedeutung('lehrende') + '; mit zwei darf auch eine parallele Methode eine Lehrkraft binden'),
      // The request fields of the core (as match_scenario); lernort is the former name of raum.
      anfrage: z
        .object({ ...felderSchema(), ...lernortSchema() })
        .partial()
        .optional()
        .describe('Anfrage des Plans (Felder wie match_scenario, z. B. erkannteKriterien aus build_scenario_plan); eine parallele Methode muss ihren Bedarf im selben Rahmen decken'),
      // Situation of the whole class at the top level (raum, ohneSchrift, termine …); they win over `anfrage`.
      ...felderSchema([], ['raum', 'raumBietet', 'fachausstattungArt', 'ohneSchrift', 'termine', 'gruppe', 'maxVorbereitung']),
      ...lernortSchema()
    },
    async (args) => {
      // Same checks as REST /adapt.
      const anfrage = anpassungsAnfrage(args as Record<string, unknown>);
      const bad = anpassungLeerFehler(args as Record<string, unknown>) || situationFehler(store, anfrage) || bausteinFehler(store, args.baustein);
      if (bad) return errorResult(bad.fehler);
      try {
        const res = buildAdaptScenarioZeroLlm(store, {
          ...args,
          arrangement: args.arrangement as unknown as Arrangement | undefined,
          ebenen: args.ebenen as MeasureLevel[] | undefined,
          ...(anfrage ? { anfrage } : {})
        });
        return textResult(res);
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : 'Anpassung fehlgeschlagen.');
      }
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
            // Methods and helps counted apart (anzahl counts both), as in /api/v1/meta.
            methoden: store.bundle.bausteine.filter((b) => !istHilfe(b)).length,
            hilfen: store.bundle.bausteine.filter(istHilfe).length,
            bausteine: store.bundle.bausteine.map((b) => ({
              kennung: b.kennung,
              name: b.name,
              eintragsart: b.eintragsart || 'methode',
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
        // Composition rules R-00..R-12 (validate_arrangement) and the fit rules of data/regeln.json (match/plan; validate_arrangement with situation).
        text: JSON.stringify({ regeln: FMT_RULES, passungsregeln: store.bundle.regeln, leitplanken: FMT_GUARDRAILS }, null, 2)
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
    'Leitet einen KI-Agent an, ein Lehr-/Lernszenario deterministisch über FMT-Tools zu komponieren: erst die fehlenden Pflichtangaben erfragen, dann planen, Annahmen nennen, Teilgruppen und WLO-OER einbeziehen.',
    {
      szenario: z
        .string()
        .max(MAX_TEXT_CHARS)
        .describe(`Was der Nutzer vorhat, in seinen Worten: am besten ${PFLICHT}; wenn bekannt ${OPTIONAL}`)
    },
    async ({ szenario }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Plane ein Lehr-/Lernszenario für folgende Anfrage:\n\n"${szenario}"\n\n` +
              `Vorgehen (die Tools wählen die Methoden; du formulierst aus):\n` +
              `1. Rufe \`classify_scenario_text\` mit dem Text auf. Lies pflichtangaben.fehlt: fehlt etwas (${PFLICHT}), stelle eine kurze Frage nach genau diesen Angaben und warte die Antwort ab. Frag nach Optionalem (${OPTIONAL}) nur, wenn es der Nutzer andeutet; kein Formular.\n` +
              `2. Rufe \`build_scenario_plan\` mit dem Text und den Angaben als Feldern auf (z. B. bildungsstufe, zeitMin, gruppe, raum, zielart, Teilgruppen als gruppen mit Anzahl und Merkmalen). Nenne pflichtangaben.angenommen dem Nutzer als Annahmen (Feld, Wert, Grund) und gib regelmeldungen mit ihrer Grundlage weiter.\n` +
              `3. teilgruppenMethoden, zusatzphasen und begleitstrang sind Vorschläge: biete sie an, ändere den Ablauf nicht selbst. Für eine Teilgruppe hilft \`adapt_scenario\`.\n` +
              `4. Suche bei Bedarf mit \`search_wlo_oer\` freie Materialien (immer die exakte \`wwwurl\` übernehmen) und nutze \`elaborate_scenario\` bzw. \`generate_phase_material\` für Entwurf und Material.\n` +
              `5. Will der Nutzer eine Methode tauschen, hol Kandidaten über \`suggest_replacements\` mit der Situation; wähle nie selbst eine Methode.\n` +
              `6. Beachte zwingend die FMT-Leitplanken:\n` +
              FMT_GUARDRAILS.map((g, i) => `   ${i + 1}. ${g}`).join('\n')
          }
        }
      ]
    })
  );

  server.prompt(
    'audit_lesson_plan',
    'Prüft einen bestehenden Unterrichtsentwurf gegen die Kompositionsregeln (R-00 bis R-12) und die Passungsregeln und schlägt formal gültige Ersatzmethoden vor.',
    {
      entwurf: z.string().max(MAX_TEXT_CHARS).describe('Beschreibung oder JSON-LD eines Unterrichtsablaufs, mit Raum, Zeit, Gruppengröße und Teilgruppen, soweit bekannt')
    },
    async ({ entwurf }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Analysiere folgenden Unterrichtsentwurf mit den FMT-Tools:\n\n${entwurf}\n\n` +
              `1. Ordne die Phasen mit \`search_methods\` Methoden des Katalogs zu. Fehlen Raum, Zeit, Gruppengröße oder Bildungsstufe, stelle eine kurze Frage danach.\n` +
              `2. Liegt ein Arrangement vor, prüfe es mit \`validate_arrangement\` (Kompositionsregeln R-00 bis R-12); mit den Angaben der Stunde als \`situation\` nennt es auch die regelmeldungen der Passungsregeln für die Methoden genau dieses Ablaufs.\n` +
              `3. Die Passungsregeln (Bedarf im Raum, Schrift, Zeit, Lehrende, Teilgruppen; fmt://rules) prüft \`match_scenario\` bzw. \`build_scenario_plan\` mit den Angaben der Stunde: nenne ihre regelmeldungen und pflichtangaben.angenommen als Annahmen.\n` +
              `4. Ersatz nur über \`suggest_replacements\` mit der Situation (raum, ohneSchrift, termine …).\n` +
              `Weise bei jeder Meldung ihre Grundlage aus (formal, [E], [S], [A]) und mache klar, dass ein gültiges Arrangement kein Qualitätsurteil über die Durchführung ist. Beschreibe Gruppen, keine einzelnen Lernenden.`
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
              `1. Erfrage beim Nutzer, was noch fehlt: Teilgruppen mit Anzahl und Merkmalen (z. B. „5 DaZ“, „4 lesen noch nicht“, „2 können sich nicht frei bewegen“), den Raum und die Zahl der Lehrenden. Beschreibe Gruppen, keine einzelnen Lernenden; keine Namen, keine Diagnosen.\n` +
              `2. Rufe \`adapt_scenario\` mit \`scenarioText\` und \`lerngruppenText\` (oder \`gruppen\` mit \`ohneSchrift\`/\`ohneBewegung\`), dazu \`raum\`, \`lehrende\` und ggf. \`baustein\`, \`maxTechnik\`, \`ohneInternet\` auf. Falls du exakte Merkmals-IDs brauchst, rufe vorher \`list_differentiation_options\` auf.\n` +
              `3. Lies \`teilgruppenImpulse\` je Gruppe und Phase: \`antwort\` (passt, hilfe = die Methode bleibt und die Gruppe bekommt eine Hilfe, tausch = gleichwertige Methode) mit \`beleg\` (Merkmal, Grundlage, Quelle); jede Hilfe nennt unter \`abbau\`, wann sie entfällt. Steht \`ohneMethode: true\`, wurde keine Passung geprüft. \`teilgruppenMethoden\` und \`zusatzphasen\` sind Vorschläge, kein geänderter Plan.\n` +
              `4. Gib \`regelmeldungen\` mit ihrer Grundlage weiter. \`gesperrt\` nennt Merkmale ohne Beleg (z. B. Lerntypen); sie werden nicht ausgewertet, das ist kein Fehler.\n` +
              `5. Übernimm die zurückgegebene UDL-Basis, benenne Zielkonflikte offen mit ihrer Auflösungsstrategie und halte dich bei konkreten Methoden an \`methodenKontext.kernkomponente\`.\n` +
              `6. Trenne klar zwischen der heuristischen Binnendifferenzierungsmatrix (-100 bis +100 %) und empirischen FMT-Evidenzgraden (A–C).`
          }
        }
      ]
    })
  );

  return server;
}
