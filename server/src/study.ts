import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { transaction, type DB } from './db.ts';
import { fail, limiter, requireAuth } from './auth.ts';
import { nextUtcMidnight, parseId } from './documents.ts';
import { AiError, type AiErrorCode, type Llm } from './ai/llm.ts';
import type { GenerateOptions } from './ai/prompt.ts';
import { generateSummary } from './ai/summary.ts';
import { generateMindmap } from './ai/mindmap.ts';
import { generateFlashcards } from './ai/flashcards.ts';
import { generateQuiz } from './ai/quiz.ts';
import { chat } from './ai/chat.ts';
import { newCard, review } from './ai/srs.ts';
import type { ErrorCode } from '../../shared/types.ts';
import type { ChatMessage, FlashcardDeck, Quiz } from '../../shared/study.ts';
import type {
  ArtifactKind, ArtifactResponse, ArtifactState, ChatQuotaExceededError, DueCardsResponse, QuizAttempt, ReviewCard,
  StudyStatusResponse,
} from '../../shared/study-api.ts';

// Daily chat questions per plan (legacy PLANS.chatLimit); -1 = unlimited, unknown plans get the free quota.
const DAILY_CHATS: Record<string, number> = { free: 10, basic: 25, pro: 50, unlimited: -1 };

const KINDS: ArtifactKind[] = ['summary', 'mindmap', 'flashcards', 'quiz'];
const GENERATORS: Record<ArtifactKind, (llm: Llm, text: string, options: GenerateOptions) => Promise<unknown>> = {
  summary: generateSummary,
  mindmap: generateMindmap,
  flashcards: generateFlashcards,
  quiz: generateQuiz,
};

const AI_HTTP_STATUS: Record<AiErrorCode, number> = { ai_unavailable: 503, ai_bad_output: 502, document_too_long: 413 };

const DUE_PAGE = 100;

interface ArtifactRow {
  kind: ArtifactKind;
  status: 'generating' | 'ready' | 'failed';
  error: ErrorCode | null;
  payload: string | null;
  updated_at: string;
}

interface CardRow {
  id: number;
  document_id: number;
  question: string;
  answer: string;
  tag: string | null;
  ease: number;
  interval_days: number;
  reps: number;
  due_at: string;
}

interface AttemptRow {
  id: number;
  answers: string;
  score: number;
  total: number;
  created_at: string;
}

const toState = (row: ArtifactRow | undefined): ArtifactState =>
  row ? { status: row.status, error: row.error, updatedAt: row.updated_at } : { status: 'none', error: null, updatedAt: null };

const toCard = (row: CardRow): ReviewCard => ({
  id: row.id,
  documentId: row.document_id,
  question: row.question,
  answer: row.answer,
  ...(row.tag ? { tag: row.tag } : {}),
  ease: row.ease,
  intervalDays: row.interval_days,
  reps: row.reps,
  dueAt: row.due_at,
});

const toAttempt = (row: AttemptRow): QuizAttempt => ({
  id: row.id,
  answers: JSON.parse(row.answers),
  score: row.score,
  total: row.total,
  createdAt: row.created_at,
});

const isKind = (kind: unknown): kind is ArtifactKind => KINDS.includes(kind as ArtifactKind);

const reviewSchema = z.object({ grade: z.enum(['again', 'hard', 'good', 'easy']) });
const attemptSchema = z.object({ answers: z.array(z.int().min(0).max(3).nullable()).max(100) });
const chatSchema = z.object({ question: z.string().trim().min(1).max(2000) });

/**
 * Study API: AI artifacts per document, SRS review, quiz attempts and document chat.
 * `generate` is exposed so the documents router can start the summary when extraction finishes.
 */
export function studyRouter(db: DB, llm: Llm, { rateLimits = true } = {}) {
  // Generation runs in-process, so a restart orphans anything mid-flight (same as documents).
  db.prepare("UPDATE artifacts SET status = 'failed', error = 'ai_unavailable' WHERE status = 'generating'").run();

  // ponytail: in-memory registry of running generations, single process only. Move to a jobs table
  // with a lease if the API ever runs as more than one process.
  const running = new Map<string, { ac: AbortController; prev: ArtifactRow | undefined }>();

  const findDoc = db.prepare('SELECT id, status FROM documents WHERE id = ? AND user_id = ?');
  const getArtifact = db.prepare('SELECT * FROM artifacts WHERE document_id = ? AND kind = ?');
  const startArtifact = db.prepare(`
    INSERT INTO artifacts (document_id, kind, status) VALUES (?, ?, 'generating')
    ON CONFLICT (document_id, kind) DO UPDATE SET status = 'generating', error = NULL, updated_at = datetime('now')`);
  // A null payload keeps the stored one: failures and cancels never erase the last good version.
  const finishArtifact = db.prepare(`
    UPDATE artifacts SET status = ?, error = ?, payload = coalesce(?, payload), updated_at = datetime('now')
    WHERE document_id = ? AND kind = ?`);
  const insertCard = db.prepare(
    'INSERT INTO cards (document_id, question, answer, tag, ease, interval_days, reps, due_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const countDue = db.prepare('SELECT COUNT(*) AS n FROM cards WHERE document_id = ? AND due_at <= ?');

  function save(documentId: number, kind: ArtifactKind, payload: unknown) {
    transaction(db, () => {
      finishArtifact.run('ready', null, JSON.stringify(payload), documentId, kind);
      // A new deck or quiz replaces the old one: its SRS progress and attempts no longer apply.
      if (kind === 'flashcards') {
        db.prepare('DELETE FROM cards WHERE document_id = ?').run(documentId);
        const srs = newCard();
        for (const c of (payload as FlashcardDeck).cards) {
          insertCard.run(documentId, c.question, c.answer, c.tag ?? null, srs.ease, srs.intervalDays, srs.reps, srs.dueAt);
        }
      }
      if (kind === 'quiz') db.prepare('DELETE FROM quiz_attempts WHERE document_id = ?').run(documentId);
    });
  }

  /** Starts generating in the background; a no-op if this artifact is already running. */
  function generate(documentId: number, kind: ArtifactKind) {
    const key = `${documentId}:${kind}`;
    if (running.has(key)) return;
    const doc = db.prepare("SELECT text, file_name FROM documents WHERE id = ? AND status = 'ready'")
      .get(documentId) as { text: string; file_name: string } | undefined;
    if (!doc) return;

    const run = { ac: new AbortController(), prev: getArtifact.get(documentId, kind) as ArtifactRow | undefined };
    running.set(key, run);
    startArtifact.run(documentId, kind);

    // Every LLM call of the run carries its signal, so a cancel also stops the HTTP request (and its cost).
    const { signal } = run.ac;
    const scoped: Llm = {
      complete: (req) => llm.complete({ ...req, signal }),
      stream: (req) => llm.stream({ ...req, signal }),
    };
    GENERATORS[kind](scoped, doc.text, { title: doc.file_name })
      .then((payload) => {
        if (!signal.aborted) save(documentId, kind, payload);
      })
      .catch((err) => {
        if (signal.aborted) return; // cancelled: the cancel already restored the previous state
        if (!(err instanceof AiError)) console.error(`Generating ${kind} for document ${documentId} failed:`, err);
        finishArtifact.run('failed', err instanceof AiError ? err.code : 'ai_unavailable', null, documentId, kind);
      })
      .finally(() => {
        if (running.get(key) === run) running.delete(key);
      });
  }

  /** The caller's document, or null after a 404 (missing or not theirs) / 409 (not ready). */
  function ownedDoc(req: Request, res: Response, { ready = false } = {}) {
    const id = parseId(req.params.id);
    const doc = id ? (findDoc.get(id, res.locals.user!.id) as { id: number; status: string } | undefined) : undefined;
    if (!doc) return void fail(res, 404, 'not_found');
    if (ready && doc.status !== 'ready') return void fail(res, 409, 'document_not_ready');
    return doc;
  }

  const router = Router();
  router.use(['/documents', '/review', '/cards'], requireAuth);

  // ── Artifacts ──

  router.get('/documents/:id/study', (req, res) => {
    const doc = ownedDoc(req, res);
    if (!doc) return;
    const rows = db.prepare('SELECT kind, status, error, updated_at FROM artifacts WHERE document_id = ?')
      .all(doc.id) as unknown as ArtifactRow[];
    const artifacts = Object.fromEntries(KINDS.map((k) => [k, toState(rows.find((r) => r.kind === k))]));
    const { n } = countDue.get(doc.id, new Date().toISOString()) as { n: number };
    res.json({ artifacts, dueCount: n } as StudyStatusResponse);
  });

  router.get('/documents/:id/study/:kind', (req, res) => {
    const doc = ownedDoc(req, res);
    if (!doc) return;
    if (!isKind(req.params.kind)) return fail(res, 404, 'not_found');
    const row = getArtifact.get(doc.id, req.params.kind) as ArtifactRow | undefined;
    const body: ArtifactResponse = { ...toState(row), payload: row?.payload ? JSON.parse(row.payload) : null };
    res.json(body);
  });

  // Per user: regenerating is the one way to burn API budget without a quota.
  const generateLimit = limiter(rateLimits, { windowMs: 60 * 60 * 1000, limit: 30, keyGenerator: (_req, res) => String(res.locals.user!.id) });

  router.post('/documents/:id/study/:kind', generateLimit, (req, res) => {
    if (!isKind(req.params.kind)) return fail(res, 404, 'not_found');
    const doc = ownedDoc(req, res, { ready: true });
    if (!doc) return;
    generate(doc.id, req.params.kind);
    res.status(202).json(toState(getArtifact.get(doc.id, req.params.kind) as ArtifactRow | undefined));
  });

  router.delete('/documents/:id/study/:kind/run', (req, res) => {
    const doc = ownedDoc(req, res);
    if (!doc) return;
    const kind = req.params.kind;
    if (!isKind(kind)) return fail(res, 404, 'not_found');
    const key = `${doc.id}:${kind}`;
    const run = running.get(key);
    if (run) {
      run.ac.abort();
      running.delete(key);
      if (run.prev) finishArtifact.run(run.prev.status, run.prev.error, null, doc.id, kind);
      else db.prepare('DELETE FROM artifacts WHERE document_id = ? AND kind = ?').run(doc.id, kind);
    }
    res.json(toState(getArtifact.get(doc.id, kind) as ArtifactRow | undefined));
  });

  // ── SRS review ──

  router.get('/review/due', (req, res) => {
    const raw = req.query.documentId;
    const documentId = raw === undefined ? null : parseId(raw);
    if (raw !== undefined && !documentId) return fail(res, 400, 'invalid_input', ['documentId']);
    const where = `FROM cards c JOIN documents d ON d.id = c.document_id
      WHERE d.user_id = ? AND c.due_at <= ? AND (? IS NULL OR c.document_id = ?)`;
    const args = [res.locals.user!.id, new Date().toISOString(), documentId, documentId];
    const cards = db.prepare(`SELECT c.* ${where} ORDER BY c.due_at, c.id LIMIT ${DUE_PAGE}`).all(...args) as unknown as CardRow[];
    const { n } = db.prepare(`SELECT COUNT(*) AS n ${where}`).get(...args) as { n: number };
    res.json({ cards: cards.map(toCard), dueCount: n } satisfies DueCardsResponse);
  });

  router.post('/cards/:id/review', (req, res) => {
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'invalid_input', ['grade']);
    const id = parseId(req.params.id);
    const row = id && (db.prepare('SELECT c.* FROM cards c JOIN documents d ON d.id = c.document_id WHERE c.id = ? AND d.user_id = ?')
      .get(id, res.locals.user!.id) as CardRow | undefined);
    if (!row) return fail(res, 404, 'not_found');
    const next = review({ ease: row.ease, intervalDays: row.interval_days, reps: row.reps, dueAt: row.due_at }, parsed.data.grade);
    const updated = db.prepare('UPDATE cards SET ease = ?, interval_days = ?, reps = ?, due_at = ? WHERE id = ? RETURNING *')
      .get(next.ease, next.intervalDays, next.reps, next.dueAt, row.id) as unknown as CardRow;
    res.json({ card: toCard(updated) });
  });

  // ── Quiz attempts ──

  router.post('/documents/:id/quiz/attempts', (req, res) => {
    const doc = ownedDoc(req, res);
    if (!doc) return;
    const row = getArtifact.get(doc.id, 'quiz') as ArtifactRow | undefined;
    if (!row?.payload) return fail(res, 404, 'not_found');
    const { questions } = JSON.parse(row.payload) as Quiz;
    const parsed = attemptSchema.safeParse(req.body);
    if (!parsed.success || parsed.data.answers.length !== questions.length) return fail(res, 400, 'invalid_input', ['answers']);

    const { answers } = parsed.data;
    const score = questions.filter((q, i) => q.correctIndex === answers[i]).length;
    const attempt = db.prepare('INSERT INTO quiz_attempts (document_id, answers, score, total) VALUES (?, ?, ?, ?) RETURNING *')
      .get(doc.id, JSON.stringify(answers), score, questions.length) as unknown as AttemptRow;
    res.status(201).json({ attempt: toAttempt(attempt) });
  });

  router.get('/documents/:id/quiz/attempts', (req, res) => {
    const doc = ownedDoc(req, res);
    if (!doc) return;
    const rows = db.prepare('SELECT * FROM quiz_attempts WHERE document_id = ? ORDER BY id DESC LIMIT 20')
      .all(doc.id) as unknown as AttemptRow[];
    res.json({ attempts: rows.map(toAttempt) });
  });

  // ── Chat ──

  const countChatsToday = db.prepare(
    "SELECT COUNT(*) AS n FROM chat_events WHERE user_id = ? AND created_at >= datetime('now', 'start of day')");

  router.get('/documents/:id/chat', (req, res) => {
    const doc = ownedDoc(req, res);
    if (!doc) return;
    const messages = db.prepare('SELECT role, content FROM chat_messages WHERE document_id = ? ORDER BY id')
      .all(doc.id) as unknown as ChatMessage[];
    res.json({ messages });
  });

  router.post('/documents/:id/chat', async (req, res) => {
    const doc = ownedDoc(req, res, { ready: true });
    if (!doc) return;
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'invalid_input', ['question']);
    const { question } = parsed.data;

    // Check and record in one synchronous block so parallel questions can't overshoot the quota.
    const user = res.locals.user!;
    const limit = DAILY_CHATS[user.plan] ?? DAILY_CHATS.free!;
    if (limit !== -1 && (countChatsToday.get(user.id) as { n: number }).n >= limit) {
      return void res.status(429).json({ error: 'chat_quota_exceeded', resetAt: nextUtcMidnight() } satisfies ChatQuotaExceededError);
    }
    const event = db.prepare('INSERT INTO chat_events (user_id) VALUES (?) RETURNING id').get(user.id) as { id: number };

    const { text } = db.prepare('SELECT text FROM documents WHERE id = ?').get(doc.id) as { text: string };
    const history = db.prepare(`
      SELECT role, content FROM (SELECT id, role, content FROM chat_messages WHERE document_id = ? ORDER BY id DESC LIMIT 10)
      ORDER BY id`).all(doc.id) as unknown as ChatMessage[];

    const ac = new AbortController();
    res.on('close', () => ac.abort()); // the learner left: stop the LLM call (no-op once the answer is sent)
    let answer = '';
    try {
      const chunks = chat(llm, text, { question, history, signal: ac.signal })[Symbol.asyncIterator]();
      let next = await chunks.next(); // wait for the first chunk so early failures still get a JSON status
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' });
      for (; !next.done; next = await chunks.next()) {
        answer += next.value;
        res.write(next.value);
      }
    } catch (err) {
      if (ac.signal.aborted) return; // the learner left; the question still counts
      db.prepare('DELETE FROM chat_events WHERE id = ?').run(event.id); // our failure, not the learner's question
      if (res.headersSent) {
        console.error(`Chat on document ${doc.id} failed mid-answer:`, err);
        return void res.destroy(); // the client's reader throws instead of seeing a truncated answer as complete
      }
      if (err instanceof AiError) return fail(res, AI_HTTP_STATUS[err.code], err.code);
      throw err;
    }
    db.prepare("INSERT INTO chat_messages (document_id, role, content) VALUES (?, 'user', ?), (?, 'assistant', ?)")
      .run(doc.id, question, doc.id, answer);
    res.end();
  });

  return { router, generate };
}
