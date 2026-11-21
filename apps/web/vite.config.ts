import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
      '/mcp': 'http://localhost:8080',
      '/vocabs': 'http://localhost:8080',
      '/bausteine': 'http://localhost:8080',
      '/beispiele': 'http://localhost:8080',
      '/context.jsonld': 'http://localhost:8080',
      '/ontologie.ttl': 'http://localhost:8080',
      '/schema': 'http://localhost:8080'
    }
  },
  test: {
    environment: 'jsdom',
    globals: true
  }
});
