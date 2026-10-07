# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Rewrite in progress (2026-10). Planned: React + Vite SPA with an Express API, both in TypeScript, SQLite. Chosen over Next.js because almost the whole app sits behind login and the backend runs long jobs (OCR, cron, uploads). Marketing pages (landing, pricing) may be split out as static pages for SEO; undecided. Deploy target stays Docker + Nginx on a VPS.

## Users

Four confirmed audiences, no single one ranked above the others yet:

- **Vietnamese university students** with lecture slides/PDFs, cramming for midterms and finals.
- **High-school students (THPT)** reviewing outlines and textbooks for graduation/university entrance exams.
- **Working adults self-studying** for certificates or professional material, with little time.
- **Teachers and tutors** turning their material into flashcards and quizzes to hand to students.

Common job: turn a pile of study material into something they can actually learn from and remember, fast.

## Product Purpose

NoteMinds turns study documents into structured, reviewable knowledge. A user uploads a lecture or document and gets a summary, mind map, flashcards, quiz and a chat grounded in that document, then keeps coming back to review it. Success is a learner who retains the material over time, not one who only generated content once.

## Positioning

Three things together, which neighbors only cover in part:

1. **One upload, the whole kit.** A single document yields summary, mind map, flashcards, quiz and document chat without the user writing prompts.
2. **Long-term retention.** Spaced repetition (SRS) review, streaks and progress stats keep the learner returning; generation is the start, not the end.
3. **Community sharing.** Public documents and flashcard decks, public profiles and a leaderboard let learners use each other's material.

## Operating Context

- Inputs: PDF, DOCX, PPTX, XLSX, TXT, MD, scanned images via OCR, and lecture audio (MP3/WAV). Current upload cap copy says up to 50MB.
- Typical session: upload → wait for processing → read summary/mind map → drill flashcards/quiz → ask the document follow-up questions → return later for SRS review.
- Supporting study tools in the current app: notes, Pomodoro timer, learning paths, history, offline document viewing (service worker).
- AI provider is Qwen (DashScope), with an OpenAI-compatible fallback.

## Capabilities and Constraints

- **Rewrite scope, wave 1 (core):** auth, document upload/processing, chat, summary, flashcards + SRS, quiz, mind map.
- **Wave 2 (later):** payments, admin, community feed, notifications, 2FA/passkeys, Pomodoro, learning paths, leaderboard.
- Plan quotas exist (daily uploads, daily chat messages) and gate usage per plan.
- Payment is Vietnamese bank transfer via SePay.
- **Undecided:** plan tiers and prices. The current app has Free / Basic 49.000₫ / Pro 99.000₫ / Unlimited 199.000₫ per month, but the user did not commit to keeping them.
- No production users or data yet; schema can change freely.

## Brand Commitments

- Name **NoteMinds**, domain **notemind.tech**. Keep both.
- **Bilingual, Vietnamese by default**; English is secondary. All UI strings go through the locale files.
- **Dark and light mode** both supported.
- Existing assets: `client/public/favicon.svg`, `client/public/og-image.png` / `og-image.svg`. Whether the current logo and look carry over is a redesign decision, not fixed here.

## Evidence on Hand

- Real feature set and copy in `client/src/locales/vi.json` and `en.json`.
- No testimonials, user counts, reviews, press or benchmark numbers exist. Do not fabricate any; marketing copy must not claim user numbers or accuracy figures.
- Current hero claims ("Bảo mật tối đa", "Kết quả tức thì", "100% tự động") are unverified marketing language, not evidence.

## Product Principles

1. **Learning over generating.** Every generated artifact should lead into review; a feature that only produces content and leaves the user there is incomplete.
2. **Zero-prompt by default.** The user brings a document, not a prompt. AI output appears without asking them to phrase anything.
3. **Serve four audiences with one flow.** The core path (upload → kit → review) must work for a 16-year-old, a university student, a working adult and a teacher without separate modes.
4. **Vietnamese first.** Copy, document understanding and payment are designed for Vietnam first; English must work but never leads.
5. **Shared material compounds.** Anything a learner makes should be shareable, so the community library grows with use.
