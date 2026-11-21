#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadCatalogStore } from '../catalog-store.js';
import { createFmtMcpServer } from './server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');

async function main() {
  const distDataDir = process.env.FMT_DATA_DIR || path.join(ROOT, 'dist-data');
  const store = loadCatalogStore(distDataDir);
  const server = createFmtMcpServer(store);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
