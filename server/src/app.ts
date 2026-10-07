import express, { type ErrorRequestHandler } from 'express';
import { authRouter, loadUser } from './auth.ts';
import type { DB } from './db.ts';

export function createApp(db: DB, { rateLimits = true } = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY));

  app.use(express.json({ limit: '100kb' }));
  app.use(loadUser(db));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/auth', authRouter(db, { rateLimits }));
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  // Express 5 forwards rejected async handlers here.
  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err?.type === 'entity.parse.failed') return void res.status(400).json({ error: 'invalid_input' });
    console.error(err);
    res.status(500).json({ error: 'internal' });
  };
  app.use(onError);

  return app;
}
