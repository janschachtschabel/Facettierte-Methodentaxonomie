# syntax=docker/dockerfile:1

FROM --platform=$BUILDPLATFORM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/fmt-core/package.json packages/fmt-core/tsconfig.json ./packages/fmt-core/
COPY apps/server/package.json apps/server/tsconfig.json ./apps/server/
COPY apps/web/package.json apps/web/tsconfig.json ./apps/web/

RUN npm ci

COPY data ./data
COPY packages/fmt-core ./packages/fmt-core
COPY apps/web ./apps/web
COPY apps/server ./apps/server

RUN npm run build
RUN npm prune --omit=dev && mkdir -p /app/models

FROM node:22-alpine AS runtime
LABEL org.opencontainers.image.source="https://github.com/janschachtschabel/Facettierte-Methodentaxonomie" \
      org.opencontainers.image.description="FMT Methodendatenbank – Web-App, REST API, Linked Data & MCP-Server (CC BY 4.0 / Apache-2.0)" \
      org.opencontainers.image.licenses="Apache-2.0"
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/fmt-core/package.json ./packages/fmt-core/
COPY --from=builder /app/packages/fmt-core/dist ./packages/fmt-core/dist
COPY --from=builder /app/apps/server/package.json ./apps/server/
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/web/dist ./apps/web/dist
COPY --from=builder /app/dist-data ./dist-data
COPY scripts/download-m2v.mjs ./scripts/download-m2v.mjs
COPY --from=builder --chown=node:node /app/models ./models

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "apps/server/dist/index.js"]
