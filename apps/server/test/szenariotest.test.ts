import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { buildApp } from '../src/app.js';
import { SZ, type Sz } from '../../../scripts/szenariotest/szenarien.mts';

/**
 * Scenario test of 2026-11-27 (docs/qualitaet/2026-11-27-szenariotest.md), server side: what only the server builds
 * (table, Zusatzphasen, Entwurf, groups, MCP parity). Scenario ids as in scripts/szenariotest/szenarien.mts and in
 * REIHE5 (packages/fmt-core/test/qualitaet/faelle-reihe5.ts). Requests as the runner sends them (/plan with umfang voll).
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIST_DATA = path.join(ROOT, 'dist-data');

type Plan = Record<string, any>;

describe('Szenariotest 2026-11-27 (Server)', () => {
  let app: FastifyInstance;
  let client: Client;
  const plaene = new Map<string, Plan>();

  beforeAll(async () => {
    app = await buildApp({
      distDataDir: DIST_DATA,
      config: {
        port: 0,
        host: '127.0.0.1',
        corsOrigin: '*',
        llmBaseUrl: '',
        llmModel: '',
        llmApiKey: '',
        llmAllowByok: false,
        llmRateLimitPerMin: 100000,
        llmTimeoutMs: 5000,
        llmCacheMax: 100,
        llmCacheTtlMs: 60000
      }
    });
    const baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
    client = new Client({ name: 'fmt-szenariotest', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', baseUrl)));
    for (const s of SZ) {
      const res = await post('/api/v1/plan', planAnfrage(s));
      plaene.set(s.id, { status: res.statusCode, ...res.json() });
    }
  });
  afterAll(async () => {
    await client.close();
    await app.close();
  });

  const post = (url: string, payload: unknown) => app.inject({ method: 'POST', url, payload: payload as Record<string, unknown> });
  const call = async (name: string, args: Record<string, unknown>) => {
    const res = await client.callTool({ name, arguments: args });
    const text = (res.content as Array<{ text: string }>)[0].text;
    return { isError: Boolean(res.isError), json: JSON.parse(text) as Plan };
  };
  const ohneZeit = (x: Plan) => JSON.parse(JSON.stringify(x, (k, v) => (k === 'dauerMs' ? undefined : v)));
  const planAnfrage = (s: Sz) => ({ ...s.p, umfang: 'voll' });
  const plan = (id: string) => plaene.get(id)!;
  const szenario = (id: string) => SZ.find((s) => s.id === id)!;
  const summe = (zeilen: Array<{ durationMin: number }>) => zeilen.reduce((a, r) => a + r.durationMin, 0);
  const wiederkehrZeilen = (p: Plan) => (p.thematischeTabelle as Array<Record<string, any>>).filter((r) => r.wiederkehr);
  const kernfeld = (p: Plan, id: string) => (p.entwurf.kernfelder as Array<{ id: string; inhalt: string }>).find((k) => k.id === id)!.inhalt;

  it('alle 56 Szenarien bekommen von /plan eine Antwort (Status 200)', () => {
    expect(SZ).toHaveLength(56);
    expect(SZ.filter((s) => plan(s.id).status !== 200).map((s) => s.id)).toEqual([]);
  });

  it('MCP build_scenario_plan antwortet in den Vergleichsfällen (mcp: true) wie REST /plan', async () => {
    const mcp = SZ.filter((s) => s.mcp);
    expect(mcp.length).toBeGreaterThan(0);
    for (const s of mcp) {
      const res = await call('build_scenario_plan', planAnfrage(s));
      expect(res.isError, s.id).toBe(false);
      const { status: _status, ...rest } = plan(s.id);
      expect(ohneZeit(res.json), s.id).toEqual(ohneZeit(rest));
    }
  });

  describe('Q1: Verlaufsplan ohne falsche Minuten, Prüfmeldungen in den Hinweisen', () => {
    it.each(['gs1-deutsch-anlaute-ohneschrift', 's1-mathe-pythagoras-gruppen', 's2-chemie-fakten-20'])(
      '%s: Summe der Tabelle = pruefung.dauerMin = Vorgabe; die Wiederkehr liegt in Folgestunden',
      (id) => {
        const p = plan(id);
        const vorgabe = { 'gs1-deutsch-anlaute-ohneschrift': 45, 's1-mathe-pythagoras-gruppen': 45, 's2-chemie-fakten-20': 20 }[id];
        expect(summe(p.thematischeTabelle)).toBe(p.pruefung.dauerMin);
        expect(p.pruefung.dauerMin).toBe(vorgabe);
        const w = wiederkehrZeilen(p);
        expect(w).toHaveLength(1);
        expect(w[0].phaseLabel).toMatch(/^Wiederkehr in Folgestunden \(3× à \d+ min\)$/);
        expect(w[0].durationMin).toBe(0);
        expect(w[0].dauerAusserhalbMin).toBe(p.pruefung.dauerAusserhalbMin);
        expect(w[0].key).toBe(`step-${p.thematischeTabelle.length - 1}`);
      }
    );

    it('über alle 56 Szenarien summiert keine Tabelle mehr als die Zeit der Stunde', () => {
      const zuViel = SZ.filter((s) => plan(s.id).thematischeTabelle)
        .map((s) => ({ id: s.id, summe: summe(plan(s.id).thematischeTabelle), zeit: plan(s.id).erkannteKriterien.zeitMin ?? plan(s.id).pruefung.dauerMin }))
        .filter((x) => x.summe > x.zeit);
      expect(zuViel).toEqual([]);
    });

    it('methodenDetails, maschinenlesbar.thematicRows, Entwurf und Umsetzungsregel zeigen dieselbe Wiederkehr', () => {
      const p = plan('gs1-deutsch-anlaute-ohneschrift');
      const [w] = wiederkehrZeilen(p);
      const i = p.thematischeTabelle.indexOf(w);
      expect(p.methodenDetails[i]).toMatchObject({ phase: w.phaseLabel, dauerMinGeplant: 0, dauerAusserhalbMin: w.dauerAusserhalbMin });
      expect(p.maschinenlesbar.thematicRows).toEqual(p.thematischeTabelle);
      expect(p.maschinenlesbar.schemaVersion).toBe('1.6');
      const verlauf = kernfeld(p, 'verlauf');
      expect(verlauf).toContain(`| in Folgestunden (${w.dauerAusserhalbMin} min) | ${w.phaseLabel} |`);
      expect(verlauf).not.toMatch(/\| Wiederkehr \(/);
      expect(kernfeld(p, 'lernerfolg')).toContain(`- **Wiederkehr in Folgestunden:** ${w.methodName} (3× à `);
      const regel = (p.verbindlicheUmsetzungsregeln as string[]).find((r) => r.startsWith('ZEITKONSISTENZ'))!;
      expect(regel).toContain(`Summe der ${p.planungsprofil.einheit} = ${p.pruefung.dauerMin} min`);
      expect(regel).toContain('„Wiederkehr in Folgestunden“');
      expect(p.llmBriefing.userPrompt).toContain(w.phaseLabel);
      expect(p.llmBriefing.userPrompt).not.toMatch(/Wiederkehr \(3×/);
    });

    it('MCP build_scenario_plan gibt dieselbe Tabelle wie REST /plan', async () => {
      for (const id of ['gs1-deutsch-anlaute-ohneschrift', 's1-mathe-pythagoras-gruppen']) {
        const res = await call('build_scenario_plan', planAnfrage(szenario(id)));
        expect(res.json.thematischeTabelle, id).toEqual(plan(id).thematischeTabelle);
        expect(res.json.hinweise, id).toEqual(plan(id).hinweise);
      }
    });

    it('240 Minuten mit Konsolidierung: die Wiederkehr liegt in der Zeit und zählt', async () => {
      const p = (await post('/api/v1/plan', { text: 'Fotosynthese', fach: 'Biologie', bildungsstufe: 'sek1', zeitMin: 240, gruppe: 24, raum: 'klassenraum', zielart: 'konzepte' })).json();
      const [w] = wiederkehrZeilen(p);
      expect(w.phaseLabel).toMatch(/^Wiederkehr \(3× à \d+ min\)$/);
      expect(w.durationMin).toBeGreaterThan(0);
      expect(w.dauerAusserhalbMin).toBeUndefined();
      expect(summe(p.thematischeTabelle)).toBe(p.pruefung.dauerMin);
    });

    it('hs-bwl-fallstudie-online: der erste Hinweis nennt den offenen Schritt und den Grund, auch in /match; kein Code im Text', async () => {
      const p = plan('hs-bwl-fallstudie-online');
      expect(p.pruefung.gueltig).toBe(false);
      expect(p.hinweise[0]).toMatch(/^Der Ablauf ist unvollständig\. Der Schritt „Lösungsversuche“ ist offen: .*höchstens 35 Personen/);
      expect(JSON.stringify(p)).not.toContain('loesungsversuche');
      expect(kernfeld(p, 'reflexion')).toContain(p.hinweise[0]);
      const { gruppen: _g, umfang: _u, ...matchAnfrage } = szenario('hs-bwl-fallstudie-online').p as Record<string, unknown>;
      const m = (await post('/api/v1/match', matchAnfrage)).json();
      expect(m.hinweise[0]).toBe(p.hinweise[0]);
    });

    it('hs-vorlesung-statistik-250: die Warnung zur langen passiven Phase steht in den Hinweisen mit der Phase', () => {
      expect(plan('hs-vorlesung-statistik-250').hinweise).toContainEqual(expect.stringMatching(/^Mehr als 20 Minuten am Stück im passiven Modus\. \(Prüfregel R-08, Phase „.+“: .+\)$/));
    });

    it('integrationskurs-a2-arzt: die Warnung zum Sprachniveau steht einmal in den Hinweisen', () => {
      expect(plan('integrationskurs-a2-arzt').hinweise.filter((h: string) => h.includes('das Sprachniveau ist aber niedrig'))).toHaveLength(1);
    });
  });

  // Server acceptance of the later tasks (plan docs/superpowers/plans/2026-11-27-szenariotest-befunde.md); each task
  // turns its entries into tests.
  it.todo('Q2: gs2-religion-samariter: fach Religion; bs-pflege-transfer: keine Gruppe motorik, keine Zusatzphase dafür');
  it.todo('Q2: gs4-englisch-wortschatz-10, s1-franz-vokabeln-10: pflichtangaben auch in der Einzelphase (REST und MCP)');
  it.todo('Q4: s1-ethik-luegen-diskussion, gs2-sport-werfen, hs-seminar-soziologie-12: zusatzphasen leer; gs4-mathe-teilgruppen behält sie');
  it.todo('Q5: gs4-mathe-teilgruppen, s1-mathe-pythagoras-gruppen: Förderbedarf Lernen bekommt hilfe oder tausch (adapt, REST = MCP)');
  it.todo('Q5: s1-deutsch-sachtext-gruppen: Lesegruppe bekommt in jeder Phase hilfe „kann nicht lesen“');
  it.todo('Q6: keine Zeile „Phase N“ über alle 56; Hauptziel kein Kettenname; Lesart in schritte[].ziel; /match = /plan im Modus');
});
