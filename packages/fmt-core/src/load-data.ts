import fs from 'node:fs';
import path from 'node:path';
import type { Arrangement, Baustein, FacetMeta, FmtData, FmtMeta, Funktionskette, Scheme } from './types.js';

export function loadFmtData(dataDir: string): FmtData {
  const readJson = <T>(rel: string): T => JSON.parse(fs.readFileSync(path.join(dataDir, rel), 'utf8')) as T;
  const meta = readJson<FmtMeta>('meta.json');
  const vocab = readJson<{ schemes: Scheme[]; facetten: FacetMeta[] }>('vocab.json');
  const ketten = readJson<Funktionskette[]>('ketten.json');

  const bausteineDir = path.join(dataDir, 'bausteine');
  const bausteine = fs
    .readdirSync(bausteineDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(bausteineDir, f), 'utf8')) as Baustein);

  const beispieleDir = path.join(dataDir, 'beispiele');
  const beispiele = fs
    .readdirSync(beispieleDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(beispieleDir, f), 'utf8')) as Arrangement);

  return {
    VERSION: meta.version,
    NS: meta.NS,
    creator: meta.creator,
    license: meta.license,
    licenseName: meta.licenseName,
    repository: meta.repository,
    schemes: vocab.schemes,
    facetten: vocab.facetten,
    ketten,
    bausteine,
    beispiele
  };
}
