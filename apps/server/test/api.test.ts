import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadCatalogStore } from '../src/catalog-store.js';
import { resolveFachUri } from '../src/routes/oer.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIST_DATA = path.join(ROOT, 'dist-data');
const EXPECTED_METHOD_COUNT = fs.readdirSync(path.join(ROOT, 'data', 'bausteine')).filter((f) => f.endsWith('.json')).length;

describe('FMT Unified Server: REST API, Caching, Linked Data & Content Negotiation', () => {
  let app: FastifyInstance;
  let fakeWebDir: string;

  beforeAll(async () => {
    fakeWebDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fmt-web-test-'));
    fs.writeFileSync(path.join(fakeWebDir, 'index.html'), '<!doctype html><html><body>FMT_SPA_SHELL</body></html>', 'utf8');
    app = await buildApp({
      distDataDir: DIST_DATA,
      webDistDir: fakeWebDir,
      config: {
        port: 0,
        host: '127.0.0.1',
        corsOrigin: '*',
        llmBaseUrl: '',
        llmModel: '',
        llmApiKey: '',
        llmAllowByok: true,
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
    fs.rmSync(fakeWebDir, { recursive: true, force: true });
  });

  it('serves /healthz and /api/v1/meta with versionHash, dynamic block count, CC-BY 4.0 and LLM availability', async () => {
    const h = await app.inject({ method: 'GET', url: '/healthz' });
    expect(h.statusCode).toBe(200);
    expect(h.json()).toMatchObject({ status: 'ok' });

    const meta = await app.inject({ method: 'GET', url: '/api/v1/meta' });
    expect(meta.statusCode).toBe(200);
    const body = meta.json();
    expect(body.bausteine).toBe(EXPECTED_METHOD_COUNT);
    expect(body.creator).toBe('Jan Schachtschabel');
    expect(body.license).toBe('https://creativecommons.org/licenses/by/4.0/');
    expect(body.versionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(body.llmConfigured).toBe(false);
  });

  it('/meta nennt W-Felder, Aussagearten und Merkmale', async () => {
    const meta = (await app.inject({ method: 'GET', url: '/api/v1/meta' })).json();
    expect(meta.ebenen).toBeUndefined();
    expect(meta.wfelder).toHaveLength(9);
    expect(meta.arten.map((a: { id: string }) => a.id)).toEqual(['bauweise', 'beitrag', 'bedarf', 'eignung', 'einordnung']);
    expect(meta.merkmale.map((m: { feld: string }) => m.feld)).toContain('raumbedarf');
    expect(meta.raumtypen.map((r: { id: string }) => r.id)).toEqual(expect.arrayContaining(['klassenraum', 'draussen', 'fachraum']));
    expect(meta.zielarten).toHaveLength(9);
  });

  it('/methods filtert nach Raumbedarf, Schriftbedarf und ohneRaumbedarf', async () => {
    const get = async (q: string) => (await app.inject({ method: 'GET', url: '/api/v1/methods?' + q })).json();
    const alle = await get('');
    const mitRaum = await get('raumbedarf=bewegungsflaeche');
    expect(mitRaum.anzahl).toBeGreaterThan(0);
    expect(mitRaum.anzahl).toBeLessThan(alle.anzahl);
    expect(mitRaum.treffer.every((b: { raumbedarf?: string[] }) => (b.raumbedarf || []).includes('bewegungsflaeche'))).toBe(true);
    const ohne = await get('ohneRaumbedarf=bewegungsflaeche');
    expect(ohne.treffer.some((b: { raumbedarf?: string[] }) => (b.raumbedarf || []).includes('bewegungsflaeche'))).toBe(false);
    expect(ohne.anzahl + mitRaum.anzahl).toBe(alle.anzahl);
    // Data holds liest/schreibt; lesen/schreiben (the codes of ohneSchrift) are accepted as aliases.
    const schrift = await get('schriftbedarf=schreibt');
    expect(schrift.anzahl).toBeGreaterThan(0);
    expect(schrift.anzahl).toBeLessThan(alle.anzahl);
    expect(schrift.treffer.every((b: { schriftbedarf?: string[] }) => (b.schriftbedarf || []).includes('schreibt'))).toBe(true);
    const alias = await get('schriftbedarf=schreiben');
    expect(alias.anzahl).toBe(schrift.anzahl);
  });

  it('POST /match nimmt lernort weiter an', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/v1/match', payload: { text: 'Biologie Klasse 7 Pflanzen, 45 Minuten', lernort: 'draussen' } });
    expect(r.statusCode).toBe(200);
    expect(r.json().kriterien.raum).toBe('draussen');
  });

  it('supports ETag and 304 Not Modified on /api/v1/catalog', async () => {
    const r1 = await app.inject({ method: 'GET', url: '/api/v1/catalog' });
    expect(r1.statusCode).toBe(200);
    const etag = r1.headers.etag as string;
    expect(etag).toBeTruthy();
    expect(r1.json().bausteine.length).toBe(EXPECTED_METHOD_COUNT);

    const r2 = await app.inject({ method: 'GET', url: '/api/v1/catalog', headers: { 'if-none-match': etag } });
    expect(r2.statusCode).toBe(304);
    expect(r2.body).toBe('');
  });

  it('filters methods via /api/v1/methods, returns single method, and handles 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/methods?text=jigsaw' });
    expect(res.statusCode).toBe(200);
    const ids = res.json().treffer.map((b: { kennung: string }) => b.kennung);
    expect(ids).toContain('gruppenpuzzle');
    expect(ids).toContain('partnerpuzzle');

    const one = await app.inject({ method: 'GET', url: '/api/v1/methods/abrufquiz' });
    expect(one.statusCode).toBe(200);
    expect(one.json().kennung).toBe('abrufquiz');

    const miss = await app.inject({ method: 'GET', url: '/api/v1/methods/existiert-nicht' });
    expect(miss.statusCode).toBe(404);
  });

  it('matches scenarios, validates arrangements, and computes replacements via /api/v1/* and v0.7.0 aliases', async () => {
    const m1 = await app.inject({
      method: 'POST',
      url: '/api/v1/match',
      payload: { text: 'Einstieg in der Grundschule, 15 Minuten, 24 Kinder' }
    });
    expect(m1.statusCode).toBe(200);
    expect(m1.json().modus).toBe('phase');
    expect(m1.json().vorschlaege.length).toBeGreaterThan(0);

    const bad = await app.inject({ method: 'POST', url: '/api/v1/match', payload: { zieltyp: 'gibtsnicht' } });
    expect(bad.statusCode).toBe(400);

    const alias = await app.inject({ method: 'GET', url: '/zuordnung?lernfunktion=diagnose&zeitMin=5&gruppe=30' });
    expect(alias.statusCode).toBe(200);
    expect(alias.json().vorschlaege.some((x: { baustein: string }) => x.baustein === 'exit-ticket')).toBe(true);

    const felder = await app.inject({ method: 'GET', url: '/felder' });
    expect(felder.statusCode).toBe(200);
    expect(Array.isArray(felder.json())).toBe(true);

    const schema = await app.inject({ method: 'GET', url: '/schema' });
    expect(schema.statusCode).toBe(200);
    expect(schema.json().title).toBe('FMT-Anfrage');

    const dichte = (await app.inject({ method: 'GET', url: '/beispiele/dichte-reihe.jsonld' })).json();
    const val = await app.inject({ method: 'POST', url: '/api/v1/validate', payload: dichte });
    expect(val.statusCode).toBe(200);
    expect(val.json().gueltig).toBe(true);

    const malformedVal = await app.inject({
      method: 'POST',
      url: '/api/v1/validate',
      payload: { typ: 'Arrangement', name: 'Broken', reichweite: 'r3', ablauf: { typ: 'Sequenz', teile: 'not-array' } }
    });
    expect(malformedVal.statusCode).toBe(200);
    expect(malformedVal.json().gueltig).toBe(false);
    expect(malformedVal.json().meldungen.some((m: { regel: string }) => m.regel === 'R-00')).toBe(true);

    const rep = await app.inject({
      method: 'POST',
      url: '/api/v1/replacements',
      payload: { arrangement: dichte, pfad: '/ablauf/haupt/teile/1' }
    });
    expect(rep.statusCode).toBe(200);
    expect(rep.json().kandidaten.some((c: { baustein: string }) => c.baustein === 'vortrag-prompts')).toBe(true);

    // Parity check: /api/v1/match and /api/v1/plan on starter Doppelstunde + Grundschule 45 min
    const mMathe = await app.inject({
      method: 'POST',
      url: '/api/v1/match',
      payload: {
        text: 'Mathematik Bruchrechnen Doppelstunde Klasse 6, 90 Minuten, geringes Vorwissen',
        ansatz: ['instruktion', 'uebung'],
        gruppe: 26
      }
    });
    expect(mMathe.statusCode).toBe(200);
    const mj = mMathe.json();
    expect(mj.modus).toBe('ablauf');
    expect(mj.kette.id).toBe('prozedur');
    expect(mj.pruefung.gueltig).toBe(true);
    expect(mj.pruefung.dauerMin).toBeLessThanOrEqual(90);

    const pGs = await app.inject({
      method: 'POST',
      url: '/api/v1/plan',
      payload: {
        text: 'Grundschule Klasse 3 Sachunterricht Einzelstunde 45 Minuten Konzept Wasserkreislauf verstehen, geringes Vorwissen, ohne Internet',
        ansatz: ['kooperativ', 'spiel-simulation'],
        gruppe: 24,
        ohneInternet: true,
        includeWloOer: false
      }
    });
    expect(pGs.statusCode).toBe(200);
    const pg = pGs.json();
    expect(pg.pruefung.gueltig).toBe(true);
    expect(pg.pruefung.dauerMin).toBeLessThanOrEqual(45);
    expect(pg.maschinenlesbar['@type']).toBe('FmtScenarioPlan');
    expect(pg.maschinenlesbar.schemaVersion).toBe('1.4');
    expect(pg.maschinenlesbar.thematicRows.length).toBeGreaterThan(0);
    expect(Array.isArray(pg.udlBasis)).toBe(true);
    expect(Array.isArray(pg.konflikte)).toBe(true);

    // New differentiation metadata & standalone /api/v1/adapt endpoint
    const dMeta = await app.inject({ method: 'GET', url: '/api/v1/differentiation/meta' });
    expect(dMeta.statusCode).toBe(200);
    expect(dMeta.json().anzahlMassnahmen).toBe(172);

    const adaptRes = await app.inject({
      method: 'POST',
      url: '/api/v1/adapt',
      payload: {
        scenarioText: 'Mathematik Klasse 4 Bruchteile einführen mit Papierfalten, 45 Minuten, ohne Geräte, ohne Internet',
        lerngruppenText: '5 DaZ-Kinder, 2 Kinder mit ADHS und 4 sehr leistungsstarke Kinder',
        bildungsstufe: 'primar',
        zeitMin: 45
      }
    });
    expect(adaptRes.statusCode).toBe(200);
    const aj = adaptRes.json();
    expect(aj.udlBasis.length).toBeGreaterThan(0);
    expect(aj.konflikte.length).toBeGreaterThan(0);
    expect(aj.teilgruppen.length).toBe(3);
    expect(aj.phasenAnpassungen.length).toBe(3);
    expect(aj.verbindlicheUmsetzungsregeln.length).toBeGreaterThanOrEqual(4);
    expect(aj.udlBasis.every((u: { meta: { technik: string; ebene: string } }) => u.meta.technik === 'analog' && u.meta.ebene !== 'organisation-system')).toBe(true);
  });

  it('serves SKOS Turtle, JSON-LD, canonical w3id.org content negotiation and SPA fallback cleanly (Review Focus #4)', async () => {
    const ttl = await app.inject({ method: 'GET', url: '/vocabs/lernfunktion.ttl' });
    expect(ttl.statusCode).toBe(200);
    expect(ttl.headers['content-type']).toContain('text/turtle');
    expect(ttl.body).toContain('skos:ConceptScheme');

    const ctx = await app.inject({ method: 'GET', url: '/context.jsonld' });
    expect(ctx.statusCode).toBe(200);
    expect(ctx.headers['content-type']).toContain('application/ld+json');

    // Canonical w3id.org IRI /baustein/:kennung with JSON-LD Accept
    const ld = await app.inject({
      method: 'GET',
      url: '/baustein/gruppenpuzzle',
      headers: { accept: 'application/ld+json' }
    });
    expect(ld.statusCode).toBe(200);
    expect(ld.headers['content-type']).toContain('application/ld+json');
    expect(ld.json()['@id']).toBe('https://w3id.org/fmt/baustein/gruppenpuzzle');

    // Canonical w3id.org IRI /baustein/:kennung with HTML Accept redirects to SPA detail page
    const htmlRedirect = await app.inject({
      method: 'GET',
      url: '/baustein/gruppenpuzzle',
      headers: { accept: 'text/html,application/xhtml+xml' }
    });
    expect(htmlRedirect.statusCode).toBe(302);
    expect(htmlRedirect.headers.location).toBe('/methoden/gruppenpuzzle');

    // Canonical /vocab/:scheme/ with Turtle Accept
    const vTtl = await app.inject({
      method: 'GET',
      url: '/vocab/ansatz/',
      headers: { accept: 'text/turtle' }
    });
    expect(vTtl.statusCode).toBe(200);
    expect(vTtl.headers['content-type']).toContain('text/turtle');

    // SPA client-side route hard reload returns index.html
    const spa = await app.inject({
      method: 'GET',
      url: '/methoden/gruppenpuzzle',
      headers: { accept: 'text/html' }
    });
    expect(spa.statusCode).toBe(200);
    expect(spa.body).toContain('FMT_SPA_SHELL');
  });

  it('plan keeps a method named in the text, reports it as anchored and offers another variant', async () => {
    const payload = {
      text: 'Berufsschule Pflege: Kommunikation mit Angehörigen, Rollenspiel, 90 Minuten, 18 Auszubildende',
      includeWloOer: false
    };
    const res = await app.inject({ method: 'POST', url: '/api/v1/plan', payload });
    expect(res.statusCode).toBe(200);
    const plan = res.json();
    const ids = (p: { methodenDetails: Array<{ kennung: string }> }) => p.methodenDetails.map((m) => m.kennung);
    expect(ids(plan)).toContain('rollenspiel');
    expect(plan.verankert.map((v: { baustein: string }) => v.baustein)).toContain('rollenspiel');
    expect(Array.isArray(plan.nichtVerankert)).toBe(true);
    expect(Array.isArray(plan.annahmen)).toBe(true);

    const other = (await app.inject({ method: 'POST', url: '/api/v1/plan', payload: { ...payload, variante: 1 } })).json();
    expect(ids(other)).toContain('rollenspiel');
    expect(ids(other).join('>')).not.toBe(ids(plan).join('>'));
  });

  it('antwortet auf ungültige Planangaben mit 400 statt 500', async () => {
    const bad = await app.inject({ method: 'POST', url: '/api/v1/plan', payload: { text: 'Bruchrechnen 45 Minuten', maxTechnik: 'quatsch' } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().fehler).toContain('maxTechnik');
    const badTime = await app.inject({ method: 'POST', url: '/api/v1/plan', payload: { text: 'Bruchrechnen', zeitMin: -5 } });
    expect(badTime.statusCode).toBe(400);
    for (const payload of [
      { text: 'Bruchrechnen 45 Minuten', gruppen: 'abc' },
      { text: 'Bruchrechnen 45 Minuten', fach: 5 },
      { text: 'Bruchrechnen 45 Minuten', gruppen: [{ label: 'ohne id' }] }
    ]) {
      const r = await app.inject({ method: 'POST', url: '/api/v1/plan', payload });
      expect(r.statusCode).toBe(400);
      expect(typeof r.json().fehler).toBe('string');
    }
    const kompakt = await app.inject({ method: 'POST', url: '/api/v1/plan', payload: { text: 'Bruchrechnen Klasse 6, 45 Minuten', umfang: 'kompakt' } });
    expect(kompakt.statusCode).toBe(200);
    expect(kompakt.json().llmBriefing).toBeUndefined();
    expect(kompakt.json().thematischeTabelle.length).toBeGreaterThan(0);
  });

  it('nennt das erkannte Fach mit OEH-Kennung und nutzt es für den Fachbereich', async () => {
    const c = await app.inject({ method: 'POST', url: '/api/v1/classify', payload: { text: 'Türkisch Klasse 7, Wegbeschreibung, 45 Minuten' } });
    expect(c.json().fach).toMatchObject({ label: 'Türkisch', uri: 'http://w3id.org/openeduhub/vocabs/discipline/20008', fachbereich: 'sprachen' });
    expect(c.json().kriterien.fachbereich).toBe('sprachen');

    const p = await app.inject({ method: 'POST', url: '/api/v1/plan', payload: { text: 'Vorlesung Maschinenbau, Thermodynamik, 90 Minuten, 120 Studierende' } });
    expect(p.statusCode).toBe(200);
    expect(p.json().fachErkannt).toMatchObject({ quelle: 'hochschulfach', fachbereich: 'nawi-technik' });
    expect(p.json().fach).toBe('Maschinenbau/-wesen');
    expect(p.json().erkannteKriterien.fachbereich).toBe('nawi-technik');

    // A subject given as its own field is looked up the same way
    const f = await app.inject({ method: 'POST', url: '/api/v1/plan', payload: { text: 'Konditionierung, 90 Minuten, Kurs 11', fach: 'Psychologie' } });
    expect(f.json().erkannteKriterien.fachbereich).toBe('gesellschaft');
    expect(f.json().fachErkannt.uri).toBe('http://w3id.org/openeduhub/vocabs/discipline/510');

    // The stage read from the text decides whether a university subject in the field is recognised
    const u = await app.inject({ method: 'POST', url: '/api/v1/plan', payload: { text: 'Vorlesung Thermodynamik, 90 Minuten, 120 Studierende', fach: 'Maschinenbau' } });
    expect(u.json().fachErkannt).toMatchObject({ quelle: 'hochschulfach', fachbereich: 'nawi-technik' });
    expect(u.json().erkannteKriterien.fachbereich).toBe('nawi-technik');
    // An unknown subject field is not replaced by a subject guessed from the text
    const w = await app.inject({ method: 'POST', url: '/api/v1/plan', payload: { text: 'Die Wirtschaft der DDR, 45 Minuten, Klasse 10', fach: 'WAT' } });
    expect(w.json().fach).toBe('WAT');
    expect(w.json().fachErkannt).toBeNull();

    const none = await app.inject({ method: 'POST', url: '/api/v1/plan', payload: { text: 'Teamregeln vereinbaren, 45 Minuten' } });
    expect(none.json().fachErkannt).toBeNull();
  });

  it('löst Fachnamen für die WLO-Suche über das OEH-Vokabular auf', async () => {
    const store = await loadCatalogStore(DIST_DATA);
    const lookup = (name: string) => store.subjects.schulfachUri(name);
    expect(resolveFachUri('Italienisch', lookup)).toBe('http://w3id.org/openeduhub/vocabs/discipline/20004');
    expect(resolveFachUri('Erdkunde', lookup)).toBe('http://w3id.org/openeduhub/vocabs/discipline/220');
    expect(resolveFachUri('Ethik / Philosophie', lookup)).toBe('http://w3id.org/openeduhub/vocabs/discipline/160');
    expect(resolveFachUri('Nachhaltigkeit (BNE)', lookup)).toBe('http://w3id.org/openeduhub/vocabs/discipline/64018');
    // buildApp wires the vocabulary lookup as the default
    expect(resolveFachUri('Türkisch')).toBe('http://w3id.org/openeduhub/vocabs/discipline/20008');
    expect(resolveFachUri('Mathematik', null)).toBe('http://w3id.org/openeduhub/vocabs/discipline/380');
    expect(resolveFachUri('Türkisch', null)).toBeNull();
    expect(resolveFachUri('Quatschfach', lookup)).toBeNull();
  });
});
