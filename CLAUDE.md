# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install              # Installs all workspaces (client, server)
npm run dev              # API on :3001 (watch) + Vite on :5173 (proxies /api)
npm test                 # Server tests (node --test on src/**/*.test.ts)
npm run typecheck        # tsc --noEmit for server and client
npm run build            # Client production build -> client/dist
npm start                # API in production mode

# Deployment (VPS, behind Cloudflare)
cp .env.example .env     # Fill in secrets; compose reads this file
bash deploy/deploy.sh <domain>  # Needs certs/origin.pem + certs/origin-key.pem (Cloudflare origin cert)
```

## Architecture

**NoteMinds** is an AI study assistant (upload a document → summary, mindmap, flashcards, quiz, chat). TypeScript rewrite; npm workspaces:

- **`server/`** — Express 5 on Node 24, TypeScript run natively (type stripping, no build step; imports use `.ts` extensions, erasable syntax only). `src/index.ts` boots, `src/app.ts` wires routers.
  - `db.ts` — built-in `node:sqlite` (WAL). Numbered SQL files in `src/migrations/` applied in order, tracked by `PRAGMA user_version`. Raw SQL, no ORM.
  - `auth.ts` — session-cookie auth (random token, hashed in `sessions` table; scrypt passwords), Cloudflare Turnstile, rate limits.
  - `documents.ts` + `extract.ts` — upload (50MB, in memory), text extraction (PDF, DOCX, PPTX, XLSX, text, OCR via tesseract.js), daily quotas.
  - `ai/` — Qwen/DashScope client (`llm.ts`, the one seam tests fake), prompt building, generators, SM-2 scheduler (`srs.ts`).
  - Env: see `server/.env.example` (dev) / root `.env.example` (production).
- **`client/`** — Vite + React 19 + TypeScript SPA, React Router. All HTTP in `src/api.ts` (same-origin `/api`). i18n (vi/en) in `src/i18n.tsx` + `src/locales/*.json`; theme in `src/theme.tsx`.
- **`shared/`** — type-only `.ts` shared by both sides via relative `import type`.
- **`legacy/`** — the old JavaScript app, reference only. Never edit it.

### Deployment

`Dockerfile` has two targets: `server` (API, non-root, SQLite in volume `data`, tesseract language cache in volume `ocr-cache`) and `web` (Nginx with `client/dist` baked in). Nginx (`deploy/nginx.conf`) serves the SPA, proxies `/api` (unbuffered for `/api/documents/:id/chat`) and terminates TLS with the Cloudflare origin cert; the API runs with `TRUST_PROXY=1`.
