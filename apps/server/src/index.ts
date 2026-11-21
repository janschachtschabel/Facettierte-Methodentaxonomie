import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..');

function loadLocalEnvFile() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  try {
    if (typeof process.loadEnvFile === 'function') {
      process.loadEnvFile(envPath);
    }
  } catch {
    // Ignore unreadable .env and fall back to process.env
  }
}

async function start() {
  loadLocalEnvFile();
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
