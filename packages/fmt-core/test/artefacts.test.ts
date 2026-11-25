import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Parser } from 'n3';
import Ajv2020 from 'ajv/dist/2020.js';
import jsonld from 'jsonld';
import { loadFmtData } from '../src/load-data.js';
import { VOCAB_PROPS } from '../scripts/build-artefacts.js';
import type { CatalogBundle } from '../src/types.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DATA_DIR = path.join(ROOT, 'data');
const DIST = path.join(ROOT, 'dist-data');

const read = (rel: string) => fs.readFileSync(path.join(DIST, rel), 'utf8');
const readJson = <T = unknown>(rel: string): T => JSON.parse(read(rel)) as T;

describe('FMT Generated Artefacts (SKOS, JSON-LD, JSON Schema, Bundle)', () => {
  const D = loadFmtData(DATA_DIR);
  const NS = D.NS;

  it('parses all SKOS vocabularies and ontology as valid Turtle with creator & CC-BY 4.0 license', () => {
    const vocabFiles = fs.readdirSync(path.join(DIST, 'vocabs')).map((f) => 'vocabs/' + f);
    expect(vocabFiles.length).toBe(D.schemes.length + 1); // 23 schemes + funktionskette.ttl
    expect(vocabFiles).toContain('vocabs/ansatz.ttl');

    const ttlFiles = [...vocabFiles, 'ontologie.ttl'];
    let concepts = 0;
    for (const f of ttlFiles) {
      const text = read(f);
      expect(text).toContain('Jan Schachtschabel');
      expect(text).toContain('https://creativecommons.org/licenses/by/4.0/');
      const quads = new Parser().parse(text);
      const subjects = new Set(
        quads
          .filter(
            (q) =>
              q.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' &&
              q.object.value === 'http://www.w3.org/2004/02/skos/core#Concept'
          )
          .map((q) => q.subject.value)
      );
      for (const s of subjects) {
        const has = (p: string) =>
          quads.some((q) => q.subject.value === s && q.predicate.value === 'http://www.w3.org/2004/02/skos/core#' + p);
        expect(has('prefLabel') && has('inScheme'), `${f}: ${s} lacks prefLabel or inScheme`).toBe(true);
      }
      concepts += subjects.size;
    }
    expect(concepts).toBeGreaterThan(160);
  });

  it('validates all exported JSON-LD blocks and examples against fmt.schema.json and rejects invalid inputs', () => {
    const ajv = new Ajv2020({ strict: false, validateFormats: false, allErrors: true });
    const validateSchema = ajv.compile(readJson<Record<string, unknown>>('fmt.schema.json'));
    const exported = fs
      .readdirSync(path.join(DIST, 'bausteine'))
      .filter((f) => f !== 'katalog.jsonld')
      .map((f) => 'bausteine/' + f)
      .concat(fs.readdirSync(path.join(DIST, 'beispiele')).map((f) => 'beispiele/' + f));

    for (const f of exported) {
      const ok = validateSchema(readJson(f));
      expect(ok, `${f}: ${JSON.stringify(validateSchema.errors)}`).toBe(true);
    }

    const sample = readJson<Record<string, unknown>>('bausteine/gruppenpuzzle.jsonld');
    expect(validateSchema({ ...sample, lernfunktion: ['tanzen'] })).toBe(false);
    expect(validateSchema({ ...sample, vorbedingungen: [] })).toBe(false);
    expect(sample.piktogramm).toBeUndefined();
    expect(sample.plot).toBeUndefined();
  });

  it('expands JSON-LD vocabulary values cleanly into the FMT SKOS namespace and emits RDF quads', async () => {
    const ctx = readJson<Record<string, unknown>>('context.jsonld');
    const documentLoader = async (url: string) => {
      if (url === NS + 'context.jsonld') return { contextUrl: null, documentUrl: url, document: ctx };
      throw new Error('Unexpected remote context ' + url);
    };
    const vocabProps = new Set(VOCAB_PROPS.map(([p]) => NS + 'ns#' + p));
    ['organisation', 'lernweg', 'inhalt', 'sozial', 'bewertung'].forEach((d) => vocabProps.add(NS + 'ns#steuerung_' + d));
    const badIris: string[] = [];

    const walk = (node: unknown) => {
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (!node || typeof node !== 'object') return;
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (vocabProps.has(k)) {
          (Array.isArray(v) ? v : [v]).forEach((x) => {
            const obj = x as { '@id'?: string };
            if (!obj['@id'] || !obj['@id'].startsWith(NS + 'vocab/')) badIris.push(`${k} -> ${JSON.stringify(x)}`);
          });
        }
        if (k === NS + 'ns#baustein') {
          (Array.isArray(v) ? v : [v]).forEach((x) => {
            const obj = x as { '@id'?: string };
            if (!obj['@id']?.startsWith(NS + 'baustein/')) badIris.push(`${k} -> ${obj['@id']}`);
          });
        }
        walk(v);
      }
    };

    const files = fs
      .readdirSync(path.join(DIST, 'bausteine'))
      .map((f) => 'bausteine/' + f)
      .concat(fs.readdirSync(path.join(DIST, 'beispiele')).map((f) => 'beispiele/' + f));

    let quads = 0;
    for (const f of files) {
      const doc = readJson<jsonld.JsonLdDocument>(f);
      walk(await jsonld.expand(doc, { documentLoader }));
      const rdf = (await jsonld.toRDF(doc, { documentLoader, format: 'application/n-quads' })) as unknown as string;
      quads += rdf.split('\n').filter(Boolean).length;
    }
    expect(badIris).toEqual([]);
    expect(quads).toBeGreaterThan(2000);
  });

  it('enforces OEH crosswalk, evidence discipline, mandatory sources, and deterministic bundle versionHash', () => {
    const bundle = readJson<CatalogBundle>('catalog.bundle.json');
    expect(bundle.creator).toBe('Jan Schachtschabel');
    expect(bundle.license).toBe('https://creativecommons.org/licenses/by/4.0/');
    expect(bundle.versionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(bundle.rules.length).toBe(13);
    expect(bundle.bausteine.length).toBe(D.bausteine.length);

    const hashPayload = JSON.stringify({
      version: bundle.version,
      schemes: bundle.schemes,
      facetten: bundle.facetten,
      ketten: bundle.ketten,
      bausteine: bundle.bausteine,
      beispiele: bundle.beispiele,
      oeh: bundle.oeh,
      faecher: bundle.faecher
    });
    const expectedHash = crypto.createHash('sha256').update(hashPayload).digest('hex');
    expect(bundle.versionHash).toBe(expectedHash);

    for (const b of bundle.bausteine) {
      expect(b.kurzbeschreibung.length, b.kennung).toBeGreaterThan(15);
      expect(b.quellen.length, b.kennung + ' needs sources').toBeGreaterThanOrEqual(1);
      expect(b.ansatz.length, b.kennung + ' needs ansatz').toBeGreaterThanOrEqual(1);
      for (const e of b.evidenz) {
        expect(e.geltung, b.kennung + ' needs geltung').toBeTruthy();
        if (e.grad === 'A') {
          expect(e.quelle.split(';').length, `${b.kennung}: grade A requires >= 2 syntheses`).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it('covers all database methods across all 12 didactic approaches, all 11 learning states, and free sources', () => {
    const bundle = readJson<CatalogBundle>('catalog.bundle.json');
    const sourceFiles = fs.readdirSync(path.join(ROOT, 'data', 'bausteine')).filter((f) => f.endsWith('.json'));
    expect(bundle.bausteine.length).toBe(sourceFiles.length);
    expect(bundle.bausteine.length).toBeGreaterThanOrEqual(100);

    const ids = new Set(bundle.bausteine.map((b) => b.kennung));
    expect(ids.size).toBe(sourceFiles.length);

    const kuratiert = bundle.bausteine.filter((b) => b.status === 'kuratiert');
    const entwurf = bundle.bausteine.filter((b) => b.status === 'entwurf');
    expect(kuratiert.length).toBeGreaterThanOrEqual(20);
    expect(kuratiert.length + entwurf.length).toBe(bundle.bausteine.length);

    // Every one of the 12 didactic approaches has >= 4 methods
    const ansatzScheme = bundle.schemes.find((s) => s.id === 'ansatz')!;
    for (const a of ansatzScheme.werte || []) {
      const count = bundle.bausteine.filter((b) => b.ansatz.includes(a.id)).length;
      expect(count, `ansatz ${a.id} has too few methods (${count})`).toBeGreaterThanOrEqual(4);
    }

    // Every one of the 11 learning states is produced by >= 2 methods
    const stateScheme = bundle.schemes.find((s) => s.id === 'lernzustand')!;
    for (const z of stateScheme.werte || []) {
      const producers = bundle.bausteine.filter((b) => (b.nachbedingung || []).includes(z.id)).length;
      expect(producers, `lernzustand ${z.id} produced by only ${producers} blocks`).toBeGreaterThanOrEqual(2);
    }

    // Every Wikipedia/OER source has a valid https URL
    for (const b of bundle.bausteine) {
      for (const q of b.quellen) {
        if (q.quelltyp === 'wikipedia' || q.quelltyp === 'oer') {
          expect(q.url, `${b.kennung}: ${q.titel} needs https URL`).toMatch(/^https:\/\//);
        }
      }
      // Every method without komposit has plot coordinates strictly inside [0..1] x [0..3]
      if (!b.komposit) {
        expect(b.plot, `${b.kennung} needs plot coordinates`).toBeDefined();
        expect(b.plot!.x, `${b.kennung} plot.x out of [0,1]`).toBeGreaterThanOrEqual(0);
        expect(b.plot!.x, `${b.kennung} plot.x out of [0,1]`).toBeLessThanOrEqual(1);
        expect(b.plot!.y, `${b.kennung} plot.y out of [0,3]`).toBeGreaterThanOrEqual(0);
        expect(b.plot!.y, `${b.kennung} plot.y out of [0,3]`).toBeLessThanOrEqual(3);
      }
    }
  });
});
