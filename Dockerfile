# Two runtime targets from one file:
#   server — Node 24 running the TypeScript API natively (no build step)
#   web    — Nginx serving client/dist and proxying /api to `server`

# ── Client build ──
FROM node:24-slim AS client-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci -w client --include-workspace-root=false
COPY shared/ shared/
COPY client/ client/
# Public, baked into the bundle at build time.
ARG VITE_TURNSTILE_SITE_KEY=
ENV VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY
RUN npm run build -w client

# ── API ──
FROM node:24-slim AS server
ENV NODE_ENV=production \
    PORT=3001 \
    DATABASE_PATH=/app/data/notemind.db
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci -w server --omit=dev --include-workspace-root=false && npm cache clean --force
COPY shared/ shared/
COPY server/src/ server/src/
# Volume mount points, owned by the runtime user so named volumes inherit it.
# /tmp/notemind-ocr is where extract.ts caches tesseract language data (join(tmpdir(), 'notemind-ocr')).
RUN mkdir -p /app/data /tmp/notemind-ocr && chown node:node /app/data /tmp/notemind-ocr
USER node
WORKDIR /app/server
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3001/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "src/index.ts"]

# ── Nginx with the built SPA ──
FROM nginx:alpine AS web
COPY --from=client-build /app/client/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
