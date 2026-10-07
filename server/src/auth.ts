import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Router, type Request, type RequestHandler, type Response } from 'express';
import rateLimit, { type Options as RateLimitOptions } from 'express-rate-limit';
import { z } from 'zod';
import type { DB } from './db.ts';
import type { ApiError, ErrorCode, User } from '../../shared/types.ts';

declare global {
  namespace Express {
    interface Locals {
      user?: User;
    }
  }
}

// ── Passwords: scrypt from node:crypto, stored as scrypt$<salt>$<key> ──

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password.normalize('NFKC'), salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [, salt = '', key = ''] = stored.split('$');
  const expected = Buffer.from(key, 'base64');
  const actual = await scryptAsync(password.normalize('NFKC'), Buffer.from(salt, 'base64'), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Hashed once so a login for an unknown user costs the same as a wrong password.
const DUMMY_HASH = await hashPassword('timing-equalizer');

// ── Sessions: random token in an httpOnly cookie, sha256 of it in the DB ──

export const SESSION_COOKIE = 'nm_session';
const SESSION_DAYS = 30;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

function readCookie(req: Request, name: string): string | undefined {
  return req.headers.cookie?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1];
}

function startSession(db: DB, res: Response, userId: number) {
  const token = randomBytes(32).toString('base64url');
  db.prepare(`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime('now', '+${SESSION_DAYS} days'))`)
    .run(hashToken(token), userId);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax', // blocks cross-site POSTs from carrying the cookie (CSRF)
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

interface UserRow {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  role: User['role'];
  plan: string;
  plan_expires_at: string | null;
  email_verified: number;
  created_at: string;
}

const toUser = (row: UserRow): User => ({
  id: row.id,
  username: row.username,
  email: row.email,
  displayName: row.display_name,
  role: row.role,
  plan: row.plan,
  planExpiresAt: row.plan_expires_at,
  emailVerified: row.email_verified === 1,
  createdAt: row.created_at,
});

/** Resolves the session cookie to res.locals.user on every request. */
export function loadUser(db: DB): RequestHandler {
  const find = db.prepare(`
    SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND s.expires_at > datetime('now')`);
  return (req, res, next) => {
    const token = readCookie(req, SESSION_COOKIE);
    const row = token ? (find.get(hashToken(token)) as UserRow | undefined) : undefined;
    res.locals.user = row ? toUser(row) : undefined;
    next();
  };
}

export const requireAuth: RequestHandler = (_req, res, next) => {
  if (res.locals.user) return next();
  fail(res, 401, 'unauthorized');
};

export function fail(res: Response, status: number, error: ErrorCode, fields?: string[]) {
  const body: ApiError = fields ? { error, fields } : { error };
  res.status(status).json(body);
}

// ── Captcha: Cloudflare Turnstile, skipped when no secret is configured (dev/test) ──

async function verifyTurnstile(token: string | undefined, ip: string | undefined): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token ?? '', remoteip: ip ?? '' }),
    });
    return ((await r.json()) as { success?: boolean }).success === true;
  } catch {
    return false;
  }
}

// ── Routes ──

const registerSchema = z.object({
  username: z.string().regex(/^[a-zA-Z0-9_.-]{3,30}$/),
  email: z.email().max(254),
  password: z.string().min(8).max(128), // upper bound keeps scrypt cost bounded
  displayName: z.string().trim().min(1).max(50).optional(),
  turnstileToken: z.string().optional(),
});

const loginSchema = z.object({
  login: z.string().min(1).max(254),
  password: z.string().min(1).max(128),
  turnstileToken: z.string().optional(),
});

export function authRouter(db: DB, { rateLimits = true } = {}): Router {
  const router = Router();
  const limit = (opts: Partial<RateLimitOptions>): RequestHandler =>
    rateLimits
      ? rateLimit({ standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'rate_limited' }, ...opts })
      : (_req, _res, next) => next();

  const insertUser = db.prepare(
    'INSERT INTO users (username, email, password_hash, display_name) VALUES (?, ?, ?, ?) RETURNING *');
  const findByLogin = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?');

  router.post('/register', limit({ windowMs: 60 * 60 * 1000, limit: 5 }), async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'invalid_input', parsed.error.issues.map((i) => String(i.path[0])));
    const { username, email, password, displayName, turnstileToken } = parsed.data;
    if (!(await verifyTurnstile(turnstileToken, req.ip))) return fail(res, 403, 'captcha_failed');

    let row: UserRow;
    try {
      row = insertUser.get(username, email, await hashPassword(password), displayName ?? null) as unknown as UserRow;
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('UNIQUE') && message.includes('users.username')) return fail(res, 409, 'username_taken');
      if (message.includes('UNIQUE') && message.includes('users.email')) return fail(res, 409, 'email_taken');
      throw err;
    }
    startSession(db, res, row.id);
    res.status(201).json({ user: toUser(row) });
  });

  router.post('/login', limit({ windowMs: 15 * 60 * 1000, limit: 10 }), async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'invalid_input', parsed.error.issues.map((i) => String(i.path[0])));
    const { login, password, turnstileToken } = parsed.data;
    if (!(await verifyTurnstile(turnstileToken, req.ip))) return fail(res, 403, 'captcha_failed');

    const row = findByLogin.get(login, login) as UserRow | undefined;
    const ok = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
    if (!row || !ok) return fail(res, 401, 'invalid_credentials');

    startSession(db, res, row.id);
    res.json({ user: toUser(row) });
  });

  router.post('/logout', (req, res) => {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) db.prepare('DELETE FROM sessions WHERE id = ?').run(hashToken(token));
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.status(204).end();
  });

  router.get('/me', requireAuth, (_req, res) => {
    res.json({ user: res.locals.user });
  });

  return router;
}
