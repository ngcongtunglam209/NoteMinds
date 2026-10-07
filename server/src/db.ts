import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type DB = DatabaseSync;

const MIGRATIONS_DIR = join(import.meta.dirname, 'migrations');

export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

// Migrations are numbered SQL files (001_init.sql, 002_...). PRAGMA user_version
// holds the last applied number; each file runs once, inside a transaction.
function migrate(db: DB) {
  const { user_version: current } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    const version = Number.parseInt(file, 10);
    if (version <= current) continue;
    try {
      transaction(db, () => {
        db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
        db.exec(`PRAGMA user_version = ${version}`);
      });
    } catch (err) {
      throw new Error(`Migration ${file} failed`, { cause: err });
    }
  }
}

/** Runs fn in a transaction. fn must be synchronous: an await inside would let other writes in. */
export function transaction<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
