import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIST_DATA = path.join(ROOT, 'dist-data');

type Kernfeld = { id: string; inhalt: string };
const feld = (entwurf: { kernfelder: Kernfeld[] }, id: string) => entwurf.kernfelder.find((k) => k.id === id)!.inhalt;

describe('App-Nachzug N1: REST auf FMT-2.0-Stand', () => {
  let app: FastifyInstance;

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
        llmRateLimitPerMin: 100,
        llmTimeoutMs: 5000,
        llmCacheMax: 100,
        llmCacheTtlMs: 60000
      }
    });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  const catalog = async () => (await app.inject({ method: 'GET', url: '/api/v1/catalog' })).json() as { bausteine: Array<Record<string, unknown>> };

  describe('POST /api/v1/plan reicht alle Anfragefelder an den Kern', () => {
    it('komplexitaet, sprachniveau, lehrende, einheit, bewertet und zieltyp kommen an', async () => {
      const r = await app.inject({
        method: 'POST',
        url: '/api/v1/plan',
        payload: {
          text: 'Berufsschule, Elektroniker, Schaltung aufbauen und prüfen, 90 Minuten, 20 Lernende',
          bildungsstufe: 'berufsbildung',
          zieltyp: 'vollstaendige-handlung',
          komplexitaet: 'hoch',
          sprachniveau: 'b1',
          lehrende: 2,
          einheit: 'Lernfeld 3: Steuerungen analysieren',
          bewertet: true
        }
      });
      expect(r.statusCode).toBe(200);
      const j = r.json();
      expect(j.fehler).toBeUndefined();
      expect(j.erkannteKriterien).toMatchObject({ zieltyp: 'vollstaendige-handlung', komplexitaet: 'hoch', sprachniveau: 'b1', lehrende: 2, bewertet: true });
      expect(j.maschinenlesbar.arrangement.zieltyp).toBe('vollstaendige-handlung');
      expect(feld(j.entwurf, 'einordnung')).toContain('Lernfeld 3');
      expect(feld(j.entwurf, 'rahmendaten')).toContain('**Bewertung:** wird bewertet');
      expect(feld(j.entwurf, 'lernerfolg')).toContain('**Bewertung:**');
    });

    it('lernfunktion, liefert, raumzeit und vorhanden kommen an', async () => {
      const r = await app.inject({
        method: 'POST',
        url: '/api/v1/plan',
        payload: { text: 'Biologie Klasse 7 Fotosynthese, 45 Minuten', raumzeit: ['praesenz'], vorhanden: ['vorwissen-aktiviert'] }
      });
      expect(r.statusCode).toBe(200);
      expect(r.json().erkannteKriterien.raumzeit).toEqual(['praesenz']);
      expect(r.json().erkannteKriterien.vorhanden).toEqual(['vorwissen-aktiviert']);
    });

    it('gruppen[] nehmen ohneSchrift und ohneBewegung an wie /adapt', async () => {
      const ok = await app.inject({
        method: 'POST',
        url: '/api/v1/plan',
        payload: {
          text: 'Deutsch Klasse 2, Märchen, 45 Minuten',
          gruppen: [
            { id: 'regel', label: 'Regelgruppe' },
            { id: 'lese', label: 'Kann noch nicht lesen', ohneSchrift: ['lesen'] }
          ]
        }
      });
      expect(ok.statusCode).toBe(200);
      const bad = await app.inject({
        method: 'POST',
        url: '/api/v1/plan',
        payload: { text: 'Deutsch Klasse 2, Märchen, 45 Minuten', gruppen: [{ id: 'x', label: 'X', ohneSchrift: ['malen'] }] }
      });
      expect(bad.statusCode).toBe(400);
      expect(bad.json().fehler).toContain('ohneSchrift');
    });
  });

  describe('POST /api/v1/assistant/elaborate nimmt bewertet an', () => {
    it('der Entwurf nennt die Bewertung', async () => {
      const plan = (await app.inject({ method: 'POST', url: '/api/v1/plan', payload: { text: 'Mathematik Klasse 8 Prozentrechnung, 45 Minuten' } })).json();
      const r = await app.inject({
        method: 'POST',
        url: '/api/v1/assistant/elaborate',
        payload: { mode: 'briefing', arrangement: plan.maschinenlesbar.arrangement, thema: 'Prozentrechnung', bewertet: false }
      });
      expect(r.statusCode).toBe(200);
      expect(feld(r.json().entwurf, 'rahmendaten')).toContain('**Bewertung:** wird nicht bewertet');
      const bad = await app.inject({
        method: 'POST',
        url: '/api/v1/assistant/elaborate',
        payload: { mode: 'briefing', arrangement: plan.maschinenlesbar.arrangement, bewertet: 'ja' }
      });
      expect(bad.statusCode).toBe(400);
    });
  });

  describe('POST /api/v1/classify', () => {
    it('gibt pflichtangaben (fehlt, angenommen) aus dem Kern zurück', async () => {
      const r = await app.inject({ method: 'POST', url: '/api/v1/classify', payload: { text: 'Fotosynthese verstehen' } });
      expect(r.statusCode).toBe(200);
      const p = r.json().pflichtangaben;
      expect(Array.isArray(p.fehlt)).toBe(true);
      expect(p.fehlt).toEqual(expect.arrayContaining(['bildungsstufe', 'anzahl', 'raum', 'zeit']));
      expect(Array.isArray(p.angenommen)).toBe(true);
      const voll = await app.inject({ method: 'POST', url: '/api/v1/classify', payload: { text: 'Biologie Klasse 7 Fotosynthese, 45 Minuten, 24 Schüler, Klassenraum' } });
      expect(voll.json().pflichtangaben.fehlt).not.toContain('zeit');
      expect(voll.json().pflichtangaben.fehlt).not.toContain('bildungsstufe');
    });
  });

  describe('Alternativen für Teilgruppen (/differentiation/score)', () => {
    it('nur Methoden, Bedarf gedeckt, gleichwertig geprüft', async () => {
      const r = await app.inject({
        method: 'POST',
        url: '/api/v1/differentiation/score',
        payload: { personaId: 'languageAndCulture', baustein: 'lehrervortrag', ohneSchrift: ['lesen'] }
      });
      expect(r.statusCode).toBe(200);
      const j = r.json();
      const by = new Map((await catalog()).bausteine.map((b) => [b.kennung as string, b]));
      expect(j.alternativenPruefung.gleichwertigGeprueft).toBe(true);
      for (const a of j.alternativeMethoden) {
        expect(a.pruefung).toBe('gleichwertig geprüft');
        expect(by.get(a.kennung)!.eintragsart ?? 'methode').toBe('methode');
        expect((by.get(a.kennung)!.schriftbedarf as string[] | undefined) || []).not.toContain('liest');
      }
      // The old fields stay.
      for (const a of j.alternativeMethoden) expect(a).toEqual(expect.objectContaining({ kennung: expect.any(String), name: expect.any(String), grund: expect.any(String) }));
    });

    it('ohne geplante Methode keine Alternativen', async () => {
      const r = await app.inject({ method: 'POST', url: '/api/v1/differentiation/score', payload: { personaId: 'languageAndCulture' } });
      expect(r.json().alternativeMethoden).toEqual([]);
    });
  });

  describe('POST /api/v1/replacements mit Situation', () => {
    it('nimmt raum, ohneSchrift und termine an', async () => {
      const dichte = (await app.inject({ method: 'GET', url: '/api/v1/catalog' })).json().beispiele.find((a: { '@id'?: string }) => (a['@id'] || '').endsWith('dichte-reihe'));
      const ohne = (await app.inject({ method: 'POST', url: '/api/v1/replacements', payload: { arrangement: dichte, pfad: '/ablauf/haupt/teile/1' } })).json();
      const mit = await app.inject({
        method: 'POST',
        url: '/api/v1/replacements',
        payload: { arrangement: dichte, pfad: '/ablauf/haupt/teile/1', situation: { raum: 'klassenraum', ohneSchrift: ['lesen', 'schreiben'], termine: 1 } }
      });
      expect(mit.statusCode).toBe(200);
      const mj = mit.json();
      expect(mj.kandidaten.length).toBeGreaterThan(0);
      expect(mj.kandidaten.length).toBeLessThan(ohne.kandidaten.length);
      const by = new Map((await catalog()).bausteine.map((b) => [b.kennung as string, b]));
      for (const k of mj.kandidaten) expect((by.get(k.baustein)!.schriftbedarf as string[] | undefined) || []).toEqual([]);
      expect(mj.situation).toMatchObject({ raum: 'klassenraum', termine: 1 });
      const top = await app.inject({ method: 'POST', url: '/api/v1/replacements', payload: { arrangement: dichte, pfad: '/ablauf/haupt/teile/1', ohneSchrift: ['lesen', 'schreiben'] } });
      expect(top.json().kandidaten.length).toBeLessThan(ohne.kandidaten.length);
      const bad = await app.inject({ method: 'POST', url: '/api/v1/replacements', payload: { arrangement: dichte, pfad: '/ablauf/haupt/teile/1', ohneSchrift: ['malen'] } });
      expect(bad.statusCode).toBe(400);
    });
  });

  describe('POST /api/v1/assistant/translate', () => {
    it('der Prompt kennt zielart (neun Werte), begleitziel, raum, ohneSchrift, termine, nachweis, planungsprofil und vollstaendige-handlung', async () => {
      const r = await app.inject({ method: 'POST', url: '/api/v1/assistant/briefing', payload: { task: 'translate', payload: { text: 'Sport Klasse 5, Ausdauer' } } });
      expect(r.statusCode).toBe(200);
      // Only the instructions count, not the schema appended after them.
      const p: string = r.json().llmBriefing.systemPrompt.split('Schema:')[0];
      for (const w of ['"zielart"', '"handlung"', '"bewegung"', '"kondition"', '"urteilen"', '"gestalten"', '"begleitziel"', '"raum"', '"ohneSchrift"', '"termine"', '"nachweis"', '"planungsprofil"', 'vollstaendige-handlung']) {
        expect(p, w).toContain(w);
      }
      for (const w of ['Anforderung', 'Bedingungsraum', 'Lernort']) expect(p).not.toContain(w);
    });

    it('nimmt strukturierte Felder neben dem Text an; die Felder haben Vorrang', async () => {
      const r = await app.inject({
        method: 'POST',
        url: '/api/v1/assistant/translate',
        payload: { text: 'Klasse 7, Fotosynthese, 45 Minuten', bildungsstufe: 'sek2', raum: 'fachraum-nawi', zielart: 'konzepte' }
      });
      expect(r.statusCode).toBe(200);
      const j = r.json();
      expect(j.anfrage).toMatchObject({ bildungsstufe: 'sek2', raum: 'fachraum-nawi', zielart: 'konzepte' });
      expect(j.ergebnis.kriterien.bildungsstufe).toBe('sek2');
      const bad = await app.inject({ method: 'POST', url: '/api/v1/assistant/translate', payload: { text: 'Klasse 7', bildungsstufe: 'hogwarts' } });
      expect(bad.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/meta und /api/v1/methods', () => {
    it('/meta hat ketten mit schritten und wissensart, die Teilgruppen-Tabelle und getrennte Zahlen', async () => {
      const j = (await app.inject({ method: 'GET', url: '/api/v1/meta' })).json();
      const vh = j.ketten.find((k: { id: string }) => k.id === 'vollstaendige-handlung');
      expect(vh.schritte.length).toBeGreaterThan(3);
      expect(vh.schritte.some((s: { wissensart?: string[] }) => (s.wissensart || []).includes('psychomotorik'))).toBe(true);
      expect(Array.isArray(j.teilgruppen.merkmale)).toBe(true);
      expect(Array.isArray(j.teilgruppen.gesperrt)).toBe(true);
      expect(j.methoden + j.hilfen).toBe(j.bausteine);
      expect(j.methoden).toBeGreaterThan(0);
    });

    it('/methods: ohneSchrift-Alias, termine-Filter, gesamt getrennt', async () => {
      const alle = (await app.inject({ method: 'GET', url: '/api/v1/methods' })).json();
      expect(alle.gesamtMethoden + alle.gesamtHilfen).toBe(alle.gesamt);
      expect(alle.anzahlMethoden + alle.anzahlHilfen).toBe(alle.anzahl);
      const os = (await app.inject({ method: 'GET', url: '/api/v1/methods?ohneSchrift=lesen' })).json();
      expect(os.treffer.every((b: { schriftbedarf?: string[] }) => !(b.schriftbedarf || []).includes('liest'))).toBe(true);
      expect(os.anzahl).toBeLessThan(alle.anzahl);
      const t1 = (await app.inject({ method: 'GET', url: '/api/v1/methods?termine=1' })).json();
      expect(t1.treffer.every((b: { termineMin?: number }) => (b.termineMin ?? 1) <= 1)).toBe(true);
      expect(t1.anzahl).toBeLessThan(alle.anzahl);
    });
  });
});
