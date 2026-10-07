import express, { type ErrorRequestHandler } from 'express';
import { authRouter, loadUser } from './auth.ts';
import { documentsRouter } from './documents.ts';
import { studyRouter } from './study.ts';
import { createLlm, type Llm } from './ai/llm.ts';
import type { DB } from './db.ts';

/** `llm` is injectable so tests run against a fake model. */
export function createApp(db: DB, { rateLimits = true, llm = createLlm() as Llm } = {}) {
  const app = express();
  const study = studyRouter(db, llm, { rateLimits });
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY));

  app.use(express.json({ limit: '100kb' }));
  app.use(loadUser(db));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/auth', authRouter(db, { rateLimits }));
  // Zero-prompt: the summary starts as soon as a document's text is ready; other kinds wait for a request.
  app.use('/api/documents', documentsRouter(db, { onReady: (id) => study.generate(id, 'summary') }));
  app.use('/api', study.router);
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
