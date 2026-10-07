import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import type { DB } from './db.ts';
import { fail, requireAuth } from './auth.ts';
import { detectFormat, extractText, type Format } from './extract.ts';
import type { ErrorCode, User } from '../../shared/types.ts';
import type { DocumentStatus, DocumentSummary, Document, QuotaExceededError } from '../../shared/documents.ts';

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

// Daily uploads per plan (legacy PLANS); -1 = unlimited, unknown plans get the free quota.
const DAILY_UPLOADS: Record<string, number> = { free: 5, basic: 10, pro: 30, unlimited: -1 };

interface DocumentRow {
  id: number;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  status: DocumentStatus;
  error: ErrorCode | null;
  char_count: number;
  text?: string;
  created_at: string;
  updated_at: string;
}

const toSummary = (row: DocumentRow): DocumentSummary => ({
  id: row.id,
  fileName: row.file_name,
  mimeType: row.mime_type,
  sizeBytes: row.size_bytes,
  status: row.status,
  error: row.error,
  charCount: row.char_count,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const SUMMARY_COLUMNS = 'id, file_name, mime_type, size_bytes, status, error, char_count, created_at, updated_at';

// Control characters stripped; the name is display data only, never part of a path.
const cleanFileName = (name: string) => name.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 255) || 'document';

export const parseId = (raw: unknown) => (typeof raw === 'string' && /^[1-9]\d{0,15}$/.test(raw) ? Number(raw) : null);

// Files are held in memory only for extraction; nothing is written to disk.
// ponytail: up to 50MB per concurrent upload in RAM; switch to disk storage if memory gets tight
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0 },
  defParamCharset: 'utf8', // Vietnamese file names arrive as raw UTF-8
}).single('file');

const receiveFile: RequestHandler = (req, res, next) => {
  upload(req, res, (err) => {
    if (!(err instanceof multer.MulterError)) return next(err);
    if (err.code === 'LIMIT_FILE_SIZE') return fail(res, 413, 'file_too_large');
    fail(res, 400, 'invalid_input', ['file']);
  });
};

/** Daily quotas reset at UTC midnight (legacy behavior). */
export function nextUtcMidnight(): string {
  const resetAt = new Date();
  resetAt.setUTCHours(24, 0, 0, 0);
  return resetAt.toISOString();
}

/** onReady runs after a document's text is stored (status 'ready'), e.g. to start its summary. */
export function documentsRouter(db: DB, { onReady = (_id: number) => {} } = {}): Router {
  const router = Router();
  router.use(requireAuth);

  // Extraction runs in-process, so a restart orphans anything mid-flight.
  db.prepare("UPDATE documents SET status = 'failed', error = 'extraction_failed' WHERE status = 'processing'").run();

  const countToday = db.prepare(
    "SELECT COUNT(*) AS n FROM upload_events WHERE user_id = ? AND created_at >= datetime('now', 'start of day')");
  const logUpload = db.prepare('INSERT INTO upload_events (user_id) VALUES (?)');
  const insertDoc = db.prepare(
    `INSERT INTO documents (user_id, file_name, mime_type, size_bytes) VALUES (?, ?, ?, ?) RETURNING ${SUMMARY_COLUMNS}`);
  const finishDoc = db.prepare(
    "UPDATE documents SET status = ?, error = ?, text = ?, char_count = ?, updated_at = datetime('now') WHERE id = ?");

  function quotaExceeded(user: User): QuotaExceededError | null {
    const limit = DAILY_UPLOADS[user.plan] ?? DAILY_UPLOADS.free!;
    const { n } = countToday.get(user.id) as { n: number };
    if (limit === -1 || n < limit) return null;
    return { error: 'quota_exceeded', resetAt: nextUtcMidnight() };
  }

  // Checked before reading the body (cheap rejection) and again right before recording the upload,
  // in the same synchronous block as the insert, so concurrent uploads can't overshoot.
  const checkQuota: RequestHandler = (_req, res, next) => {
    const exceeded = quotaExceeded(res.locals.user!);
    if (exceeded) return void res.status(429).json(exceeded);
    next();
  };

  async function extractInto(id: number, format: Format, data: Buffer) {
    let text = '';
    let error: ErrorCode | null = null;
    try {
      text = await extractText(format, data);
      if (!text) error = 'no_text'; // e.g. a scanned PDF with no text layer
    } catch (err) {
      console.error(`Extraction failed for document ${id}:`, err);
      error = 'extraction_failed';
    }
    finishDoc.run(error ? 'failed' : 'ready', error, text, text.length, id);
    if (!error) onReady(id);
  }

  router.post('/', checkQuota, receiveFile, (req, res) => {
    const file = req.file;
    if (!file) return fail(res, 400, 'invalid_input', ['file']);
    const format = detectFormat(file.originalname, file.buffer);
    if (format === 'audio') return fail(res, 415, 'audio_unsupported');
    if (!format) return fail(res, 415, 'unsupported_file');

    const user = res.locals.user!;
    const exceeded = quotaExceeded(user);
    if (exceeded) return void res.status(429).json(exceeded);
    logUpload.run(user.id);
    const row = insertDoc.get(user.id, cleanFileName(file.originalname), format.mime, file.size) as unknown as DocumentRow;
    extractInto(row.id, format, file.buffer).catch((err) => console.error(err));
    res.status(202).json({ document: toSummary(row) });
  });

  router.get('/', (_req, res) => {
    const rows = db.prepare(`SELECT ${SUMMARY_COLUMNS} FROM documents WHERE user_id = ? ORDER BY created_at DESC, id DESC`)
      .all(res.locals.user!.id) as unknown as DocumentRow[];
    res.json({ documents: rows.map(toSummary) });
  });

  router.get('/:id', (req, res) => {
    const id = parseId(req.params.id);
    const row = id && (db.prepare('SELECT * FROM documents WHERE id = ? AND user_id = ?')
      .get(id, res.locals.user!.id) as DocumentRow | undefined);
    if (!row) return fail(res, 404, 'not_found');
    const document: Document = { ...toSummary(row), text: row.text ?? '' };
    res.json({ document });
  });

  router.delete('/:id', (req, res) => {
    const id = parseId(req.params.id);
    const { changes } = id ? db.prepare('DELETE FROM documents WHERE id = ? AND user_id = ?').run(id, res.locals.user!.id) : { changes: 0 };
    if (!changes) return fail(res, 404, 'not_found');
    res.status(204).end();
  });

  return router;
}
