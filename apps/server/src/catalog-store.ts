import fs from 'node:fs';
import path from 'node:path';
import {
  createMatcher,
  createSearch,
  createValidator,
  type Arrangement,
  type Baustein,
  type CatalogBundle,
  type FmtData,
  type FmtMatcher,
  type FmtSearch,
  type FmtValidator
} from '@fmt/core';

export interface CatalogStore {
  bundle: CatalogBundle;
  bundleJson: string;
  etag: string;
  data: FmtData;
  validator: FmtValidator;
  search: FmtSearch;
  matcher: FmtMatcher;
  blocksById: Map<string, Baustein>;
  exampleRegistry: Map<string, Arrangement>;
  vocabsTtl: Map<string, string>;
  ontologieTtl: string;
  contextJsonld: string;
  fmtSchemaJson: string;
  anfrageSchemaJson: string;
  anfrageSchemaObj: Record<string, unknown>;
  katalogJsonld: string;
  bausteineJsonld: Map<string, string>;
  beispieleJsonld: Map<string, string>;
}

export function loadCatalogStore(distDataDir: string): CatalogStore {
  const read = (rel: string) => fs.readFileSync(path.join(distDataDir, rel), 'utf8');
  const bundleJson = read('catalog.bundle.json');
  const bundle = JSON.parse(bundleJson) as CatalogBundle;
  const etag = `"${bundle.versionHash}"`;

  const data: FmtData = {
    VERSION: bundle.version,
    NS: bundle.NS,
    creator: bundle.creator,
    license: bundle.license,
    licenseName: bundle.licenseName,
    repository: bundle.repository,
    schemes: bundle.schemes,
    facetten: bundle.facetten,
    ketten: bundle.ketten,
    bausteine: bundle.bausteine,
    beispiele: bundle.beispiele
  };

  const validator = createValidator(data);
  const search = createSearch(data, validator);
  const matcher = createMatcher(data, validator);
  const blocksById = new Map<string, Baustein>(bundle.bausteine.map((b) => [b.kennung, b]));
  const exampleRegistry = new Map<string, Arrangement>(
    bundle.beispiele.filter((a) => Boolean(a['@id'])).map((a) => [a['@id']!, a])
  );

  const vocabsTtl = new Map<string, string>();
  for (const f of fs.readdirSync(path.join(distDataDir, 'vocabs'))) {
    if (f.endsWith('.ttl')) vocabsTtl.set(f.slice(0, -4), read(path.join('vocabs', f)));
  }

  const bausteineJsonld = new Map<string, string>();
  for (const f of fs.readdirSync(path.join(distDataDir, 'bausteine'))) {
    if (f.endsWith('.jsonld') && f !== 'katalog.jsonld') {
      bausteineJsonld.set(f.slice(0, -7), read(path.join('bausteine', f)));
    }
  }

  const beispieleJsonld = new Map<string, string>();
  for (const f of fs.readdirSync(path.join(distDataDir, 'beispiele'))) {
    if (f.endsWith('.jsonld')) {
      beispieleJsonld.set(f.slice(0, -7), read(path.join('beispiele', f)));
    }
  }

  const anfrageSchemaJson = read('anfrage.schema.json');

  return {
    bundle,
    bundleJson,
    etag,
    data,
    validator,
    search,
    matcher,
    blocksById,
    exampleRegistry,
    vocabsTtl,
    ontologieTtl: read('ontologie.ttl'),
    contextJsonld: read('context.jsonld'),
    fmtSchemaJson: read('fmt.schema.json'),
    anfrageSchemaJson,
    anfrageSchemaObj: JSON.parse(anfrageSchemaJson) as Record<string, unknown>,
    katalogJsonld: read(path.join('bausteine', 'katalog.jsonld')),
    bausteineJsonld,
    beispieleJsonld
  };
}
