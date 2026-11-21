import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..');

async function start() {
  const config = loadConfig();
  const distDataDir = process.env.FMT_DATA_DIR || path.join(ROOT, 'dist-data');
  const webDistDir = process.env.FMT_WEB_DIR || path.join(ROOT, 'apps', 'web', 'dist');

  const app = await buildApp({
    distDataDir,
    webDistDir,
    config,
    logger: true
  });

  await app.listen({ port: config.port, host: config.host });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
