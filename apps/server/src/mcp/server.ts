import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { FMT_GUARDRAILS, FMT_RULES, type Arrangement, type MatchRequest, type SearchCriteria } from '@fmt/core';
import type { CatalogStore } from '../catalog-store.js';

export function createFmtMcpServer(store: CatalogStore): McpServer {
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
    'Facettierte Suche über alle 100 FMT-Unterrichtsmethoden (Freitext, Synonyme, Phasennamen, 13 Facetten, didaktischer Ansatz, Zeit, Gruppengröße, Technik, Evidenzgrad).',
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
      const hits = store.search.suche(criteria as SearchCriteria);
      return textResult({
        gesamt: store.bundle.bausteine.length,
        anzahl: hits.length,
        angezeigt: Math.min(hits.length, limit),
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
    'Deterministische 5-Stufen-Zuordnung für eine Phase oder eine geprüfte modulare Unterrichtsreihe (ohne Halluzinationen, <1 ms).',
    {
      text: z.string().optional(),
      modus: z.enum(['phase', 'ablauf']).optional(),
      zieltyp: z.string().optional(),
      zielart: z.string().optional(),
      lernfunktion: z.union([z.string(), z.array(z.string())]).optional(),
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
        const res = store.matcher.zuordnen(args as MatchRequest);
        return textResult({ ...res, leitplanken: FMT_GUARDRAILS });
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
      const res = store.validator.validate(arrangement as unknown as Arrangement, store.exampleRegistry);
      return textResult({ ...res, leitplanken: FMT_GUARDRAILS });
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
    'Listet alle FMT-Vokabulare, Funktionsketten und Anfragefelder oder die erlaubten Codes eines einzelnen Schemas auf.',
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
        anfrageFelder: store.matcher.felder()
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
    'Leitet einen KI-Agent an, ein Lehr-/Lernszenario deterministisch über FMT-Tools zu komponieren, zu prüfen und unter den 4 FMT-Leitplanken auszugestalten.',
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
              `Vorgehen:\n` +
              `1. Nutze zuerst \`list_vocabularies\` bzw. \`match_scenario\`, um Kriterien in das FMT-Schema zu übersetzen und einen geprüften Ablauf oder passende Bausteine zu erhalten.\n` +
              `2. Rufe \`get_method\` für die gewählten Bausteine auf und prüfe bei Anpassungen immer mit \`validate_arrangement\`.\n` +
              `3. Beachte zwingend die vier FMT-Leitplanken:\n` +
              FMT_GUARDRAILS.map((g, i) => `   ${i + 1}. ${g}`).join('\n') +
              `\n4. Erfinde keine Methoden oder Wirksamkeitsbelege außerhalb des Katalogs und nenne bei Evidenz immer Grad, Quelle und Geltung.`
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
