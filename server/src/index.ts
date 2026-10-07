import { createApp } from './app.ts';
import { openDb } from './db.ts';

const db = openDb(process.env.DATABASE_PATH ?? 'data/notemind.db');

if (process.env.NODE_ENV === 'production' && !process.env.TURNSTILE_SECRET_KEY) {
  console.warn('TURNSTILE_SECRET_KEY is not set: captcha is disabled');
}

const purgeSessions = () => db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
purgeSessions();
setInterval(purgeSessions, 24 * 60 * 60 * 1000).unref();

const port = Number(process.env.PORT ?? 3001);
createApp(db).listen(port, () => console.log(`API listening on :${port}`));
