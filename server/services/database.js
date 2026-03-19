import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'notemind.db');

// Ensure data directory exists
import fs from 'fs';
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    display_name TEXT,
    role TEXT DEFAULT 'user',
    plan TEXT DEFAULT 'free',
    plan_expires_at TEXT,
    last_ip TEXT,
    last_login_at TEXT,
    presence_status TEXT DEFAULT 'online',
    presence_visible INTEGER DEFAULT 1,
    show_plan_badge INTEGER DEFAULT 1,
    is_banned INTEGER DEFAULT 0,
    ban_reason TEXT,
    banned_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS upload_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    ip_address TEXT,
    uploaded_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS banned_ips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_address TEXT UNIQUE NOT NULL,
    reason TEXT,
    banned_by INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (banned_by) REFERENCES users(id)
  );
`);

// Registration rate limiting table
db.exec(`
  CREATE TABLE IF NOT EXISTS registration_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_address TEXT NOT NULL,
    user_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);
// ── Migrations: add columns if missing (for existing DBs) ──
const cols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
if (!cols.includes('role')) {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
}
if (!cols.includes('plan')) {
  db.exec("ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'free'");
}
if (!cols.includes('plan_expires_at')) {
  db.exec("ALTER TABLE users ADD COLUMN plan_expires_at TEXT");
}
if (!cols.includes('last_ip')) {
  db.exec("ALTER TABLE users ADD COLUMN last_ip TEXT");
}
if (!cols.includes('last_login_at')) {
  db.exec("ALTER TABLE users ADD COLUMN last_login_at TEXT");
}
if (!cols.includes('presence_status')) {
  db.exec("ALTER TABLE users ADD COLUMN presence_status TEXT DEFAULT 'online'");
}
if (!cols.includes('presence_visible')) {
  db.exec("ALTER TABLE users ADD COLUMN presence_visible INTEGER DEFAULT 1");
}
if (!cols.includes('show_plan_badge')) {
  db.exec("ALTER TABLE users ADD COLUMN show_plan_badge INTEGER DEFAULT 1");
}
if (!cols.includes('is_banned')) {
  db.exec("ALTER TABLE users ADD COLUMN is_banned INTEGER DEFAULT 0");
}
if (!cols.includes('ban_reason')) {
  db.exec("ALTER TABLE users ADD COLUMN ban_reason TEXT");
}
if (!cols.includes('banned_at')) {
  db.exec("ALTER TABLE users ADD COLUMN banned_at TEXT");
}

// Create banned_ips table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS banned_ips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_address TEXT UNIQUE NOT NULL,
    reason TEXT,
    banned_by INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (banned_by) REFERENCES users(id)
  );
`);

// ── Email verification & password reset migrations ──
if (!cols.includes('email_verified')) {
  db.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0");
  // Grandfather existing users as verified
  db.exec("UPDATE users SET email_verified = 1 WHERE id > 0");
}
if (!cols.includes('avatar_url')) {
  db.exec("ALTER TABLE users ADD COLUMN avatar_url TEXT");
}
if (!cols.includes('verification_token')) {
  db.exec("ALTER TABLE users ADD COLUMN verification_token TEXT");
}
if (!cols.includes('verification_token_expires')) {
  db.exec("ALTER TABLE users ADD COLUMN verification_token_expires TEXT");
}
if (!cols.includes('reset_token')) {
  db.exec("ALTER TABLE users ADD COLUMN reset_token TEXT");
}
if (!cols.includes('reset_token_expires')) {
  db.exec("ALTER TABLE users ADD COLUMN reset_token_expires TEXT");
}

// ── 2FA (TOTP) migrations ──
if (!cols.includes('totp_secret')) {
  db.exec("ALTER TABLE users ADD COLUMN totp_secret TEXT");
}
if (!cols.includes('totp_enabled')) {
  db.exec("ALTER TABLE users ADD COLUMN totp_enabled INTEGER DEFAULT 0");
}
if (!cols.includes('totp_recovery_codes')) {
  db.exec("ALTER TABLE users ADD COLUMN totp_recovery_codes TEXT");
}

// ── WebAuthn Passkeys ──
db.exec(`
  CREATE TABLE IF NOT EXISTS passkeys (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    public_key BLOB NOT NULL,
    counter INTEGER DEFAULT 0,
    transports TEXT,
    device_type TEXT,
    backed_up INTEGER DEFAULT 0,
    name TEXT DEFAULT 'Passkey',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS webauthn_challenges (
    user_id INTEGER NOT NULL,
    challenge TEXT NOT NULL,
    type TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, type)
  );
`);

// Add passkey_enabled column to users
if (!cols.includes('passkey_enabled')) {
  db.exec("ALTER TABLE users ADD COLUMN passkey_enabled INTEGER DEFAULT 0");
}

// ── Email Tracking ──
db.exec(`
  CREATE TABLE IF NOT EXISTS email_tracking (
    tracking_id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    type TEXT NOT NULL,
    recipient_name TEXT,
    sent_at TEXT DEFAULT (datetime('now')),
    opened_at TEXT,
    open_count INTEGER DEFAULT 0,
    user_agent TEXT,
    ip_address TEXT,
    last_opened_at TEXT
  );
`);

// Create index for faster queries
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_email_tracking_email ON email_tracking(email);
  CREATE INDEX IF NOT EXISTS idx_email_tracking_type ON email_tracking(type);
  CREATE INDEX IF NOT EXISTS idx_email_tracking_sent_at ON email_tracking(sent_at);
`);

export default db;
