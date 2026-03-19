# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev              # Start both client (port 5173) and server (port 3001) concurrently
npm run dev:client       # Frontend only
npm run dev:server       # Backend only (watch mode)

# Production
npm run build            # Build frontend for production
npm run start            # Run backend in production mode
npm run install:all      # Install all workspace dependencies

# Docker
docker compose up        # Full stack with Nginx
bash deploy/deploy.sh <domain>  # Automated VPS deployment with Cloudflare certs
```

No test or lint commands are configured.

## Architecture

**NoteMinds** is a full-stack AI-powered study assistant — monorepo with `client/` (React SPA) and `server/` (Node.js + Express).

### Frontend (`client/src/`)

- **`App.jsx`** — 2700-line monolith: manages all view routing, global state (current document, user session, active feature tab). All major state lives here.
- **`api.js`** — Single API client module (1061 lines); all HTTP calls to the backend are here.
- **`LanguageContext.jsx` / `ThemeContext.jsx`** — Global providers for i18n (en/vi) and dark/light mode.
- **`components/`** — 30+ feature components. Most are large modal/view components (ChatView, FlashcardView, QuizView, MindmapView, SummaryView, Dashboard, AdminPanel, CommunityFeed, etc.).
- Dev server proxies `/api` → `http://localhost:3001`.

### Backend (`server/`)

- **`index.js`** — 2700-line Express entry point: all middleware, route definitions, and inline handlers. Some routes are inline, others delegated to `routes/`.
- **`routes/`** — Only a few route files (`featuresRoutes.js`, `notificationRoutes.js`, `statsRoutes.js`); most routing is in `index.js`.
- **`services/`** — All business logic. Key services:
  - `database.js` — SQLite schema initialization (WAL mode)
  - `enhancedDatabase.js` — Advanced query operations
  - `authService.js` — JWT, bcrypt, TOTP 2FA, WebAuthn, plan quotas
  - `documentProcessor.js` — Multi-format extraction (PDF, DOCX, PPTX, XLSX, images via OCR)
  - `chatService.js` + `qwenClient.js` + `promptBuilder.js` — AI chat with document context via Qwen (DashScope) API
  - `flashcardGenerator.js`, `quizGenerator.js`, `mindmapGenerator.js`, `summaryGenerator.js` — AI content generation
  - `srsService.js` — Spaced repetition system for flashcard review
  - `paymentService.js` — SePay (Vietnamese bank transfer) integration
  - `emailService.js` — Nodemailer SMTP delivery and tracking

### Data Flow for AI Features

1. User uploads document → `documentProcessor.js` extracts text
2. Text stored in SQLite alongside document metadata
3. Feature request (chat/flashcard/quiz/mindmap/summary) → route → `featureService.js` or `advancedFeatureService.js` → specific generator → `qwenClient.js` → Qwen API
4. `promptBuilder.js` constructs prompts; `promptGuard.js` filters injection attempts

### Database

SQLite (`better-sqlite3`) with WAL mode. Schema initialized in `services/database.js`. Query optimization via `services/databaseIndexes.js`. No ORM — raw SQL throughout.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, TailwindCSS, ReactFlow (mindmaps), Axios |
| Backend | Node.js (ES Modules), Express 4 |
| Database | SQLite (better-sqlite3, WAL mode) |
| AI | Qwen/DashScope API (OpenAI SDK-compatible fallback) |
| Auth | JWT + bcrypt, TOTP 2FA (otpauth), WebAuthn (@simplewebauthn) |
| File Processing | pdf-parse, mammoth, Tesseract.js (OCR), xlsx, node-pptx-parser |
| Payment | SePay (Vietnamese bank transfers) |
| Email | Nodemailer |
| Logging | Winston |
| Deployment | Docker + Docker Compose + Nginx + Cloudflare origin certs |

### Environment Configuration

Copy `.env.example` to `.env` in the root. Key variables:
- `DASHSCOPE_API_KEY` / `OPENAI_API_KEY` — AI provider
- `JWT_SECRET`, `REFRESH_TOKEN_SECRET` — Auth secrets
- `TURNSTILE_SECRET_KEY` — Cloudflare CAPTCHA
- `SMTP_*` — Email configuration
- `SEPAY_*` — Payment integration
- `PORT` (default 3001), `FRONTEND_URL`

### Internationalization

All user-facing strings are in `client/src/locales/en.json` and `vi.json`. Access via `useLanguage()` hook from `LanguageContext.jsx`.
