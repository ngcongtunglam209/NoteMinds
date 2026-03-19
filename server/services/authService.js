import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { TOTP, Secret } from 'otpauth';
import QRCode from 'qrcode';
import db from './database.js';
import './envLoader.js';

// ==== SECURITY: Enforce JWT_SECRET from environment ====
const JWT_SECRET = process.env.JWT_SECRET;

// Validation at startup
if (!JWT_SECRET) {
  console.error('❌ FATAL ERROR: JWT_SECRET environment variable is not set!');
  console.error('   This will cause authentication failures in production.');
  console.error('   Generate a secure key with:');
  console.error('   node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  console.error('   Then set: export JWT_SECRET=<generated-value>');
  process.exit(1);
}

if (JWT_SECRET.length < 32) {
  console.error('❌ ERROR: JWT_SECRET must be at least 32 characters long');
  console.error('   Current length: ' + JWT_SECRET.length);
  process.exit(1);
}

if (process.env.NODE_ENV !== 'development') {
  console.log('✅ JWT_SECRET loaded from environment (length: ' + JWT_SECRET.length + ')');
}

const JWT_EXPIRES_IN = '24h';

// ── Plan definitions ───────────────────────────────────

export const PLANS = {
  free: { label: 'Free', dailyUploads: 5, chatLimit: 10, badge: null, color: null },
  basic: { label: 'Basic', dailyUploads: 10, chatLimit: 25, badge: '⭐', color: '#fbbf24' },
  pro: { label: 'Pro', dailyUploads: 30, chatLimit: 50, badge: '💎', color: '#818cf8' },
  unlimited: { label: 'Unlimited', dailyUploads: -1, chatLimit: -1, badge: '👑', color: '#f43f5e' },
};

const GUEST_DAILY_LIMIT = 1;
const GUEST_CHAT_LIMIT = 5;

function normalizeDbDateTime(value) {
  if (!value || typeof value !== 'string') return value || null;
  if (value.includes('T') && value.endsWith('Z')) return value;
  const utcCandidate = value.includes(' ') ? value.replace(' ', 'T') + 'Z' : value;
  const parsed = new Date(utcCandidate);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString();
}

// ── User CRUD ──────────────────────────────────────────

function formatUser(user) {
  if (!user) return null;
  const plan = user.plan || 'free';
  const planInfo = PLANS[plan] || PLANS.free;
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.display_name,
    role: user.role || 'user',
    plan,
    planLabel: planInfo.label,
    planBadge: planInfo.badge,
    planColor: planInfo.color,
    planExpiresAt: user.plan_expires_at || null,
    lastIp: user.last_ip || null,
    lastLoginAt: normalizeDbDateTime(user.last_login_at),
    presenceStatus: user.presence_status || 'online',
    presenceVisible: user.presence_visible !== 0,
    showPlanBadge: user.show_plan_badge !== 0,
    isBanned: !!user.is_banned,
    banReason: user.ban_reason || null,
    bannedAt: user.banned_at || null,
    emailVerified: !!user.email_verified,
    totpEnabled: !!user.totp_enabled,
    passkeyEnabled: !!user.passkey_enabled,
    avatar_url: user.avatar_url || null,
    createdAt: normalizeDbDateTime(user.created_at),
  };
}

export function createUser(username, email, password, displayName) {
  const hash = bcrypt.hashSync(password, 10);
  const stmt = db.prepare(`
    INSERT INTO users (username, email, password, display_name, role, plan)
    VALUES (?, ?, ?, ?, 'user', 'free')
  `);
  try {
    const result = stmt.run(username.toLowerCase(), email.toLowerCase(), hash, displayName || username);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    return formatUser(user);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed: users.username')) {
      throw new Error('Tên đăng nhập đã tồn tại');
    }
    if (err.message.includes('UNIQUE constraint failed: users.email')) {
      throw new Error('Email đã được sử dụng');
    }
    throw err;
  }
}

// ── Registration rate limiting ─────────────────────────

export function getRegistrationCount(ip) {
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM registration_logs WHERE ip_address = ?
  `).get(ip);
  return row.count;
}

export function logRegistration(ip, userId) {
  db.prepare(`
    INSERT INTO registration_logs (ip_address, user_id) VALUES (?, ?)
  `).run(ip, userId);
}

export function authenticateUser(login, password, ip) {
  const user = db.prepare(`
    SELECT * FROM users WHERE username = ? OR email = ?
  `).get(login.toLowerCase(), login.toLowerCase());

  if (!user) {
    throw new Error('Tài khoản không tồn tại');
  }

  if (user.is_banned) {
    throw new Error('Tài khoản đã bị khóa: ' + (user.ban_reason || 'Vi phạm quy định'));
  }

  if (!bcrypt.compareSync(password, user.password)) {
    throw new Error('Mật khẩu không đúng');
  }

  // Update last login IP and time
  if (ip) {
    db.prepare(`
      UPDATE users SET last_ip = ?, last_login_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(ip, user.id);
  }

  // If 2FA is enabled (TOTP or passkey), return a special result indicating 2FA is required
  if (user.totp_enabled || user.passkey_enabled) {
    return { requires2FA: true, userId: user.id, username: user.username, totpEnabled: !!user.totp_enabled, passkeyEnabled: !!user.passkey_enabled };
  }

  return formatUser({ ...user, last_ip: ip || user.last_ip, last_login_at: new Date().toISOString() });
}

export function getUserById(id) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return formatUser(user);
}

// ── JWT ────────────────────────────────────────────────

export function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// ── Auth middleware ─────────────────────────────────────

export function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const decoded = verifyToken(token);
    if (decoded) {
      req.user = getUserById(decoded.id);
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Vui lòng đăng nhập' });
  }
  const token = authHeader.slice(7);
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Phiên đăng nhập hết hạn, vui lòng đăng nhập lại' });
  }
  req.user = getUserById(decoded.id);
  if (!req.user) {
    return res.status(401).json({ error: 'Tài khoản không tồn tại' });
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Chỉ admin mới có quyền thực hiện' });
  }
  next();
}

// ── Upload tracking ────────────────────────────────────

export function getUploadCount(userId, ip) {
  const today = new Date().toISOString().slice(0, 10);
  if (userId) {
    const row = db.prepare(`
      SELECT COUNT(*) as count FROM upload_logs
      WHERE user_id = ? AND uploaded_at >= datetime(?, 'start of day')
    `).get(userId, today);
    return row.count;
  } else {
    const row = db.prepare(`
      SELECT COUNT(*) as count FROM upload_logs
      WHERE user_id IS NULL AND ip_address = ? AND uploaded_at >= datetime(?, 'start of day')
    `).get(ip, today);
    return row.count;
  }
}

export function logUpload(userId, ip) {
  db.prepare(`
    INSERT INTO upload_logs (user_id, ip_address) VALUES (?, ?)
  `).run(userId || null, ip);
}

export function getUploadLimit(user) {
  if (!user) return GUEST_DAILY_LIMIT;
  const plan = user.plan || 'free';
  const planInfo = PLANS[plan] || PLANS.free;
  return planInfo.dailyUploads; // -1 means unlimited
}

export function getChatLimit(user) {
  if (!user) return GUEST_CHAT_LIMIT;
  const plan = user.plan || 'free';
  const planInfo = PLANS[plan] || PLANS.free;
  return planInfo.chatLimit; // -1 means unlimited
}

// ── Admin functions ────────────────────────────────────

export function getAllUsers() {
  const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
  return users.map(formatUser);
}

export function setUserPlan(userId, plan, expiresAt) {
  if (!PLANS[plan]) throw new Error(`Gói "${plan}" không hợp lệ`);
  db.prepare(`
    UPDATE users SET plan = ?, plan_expires_at = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(plan, expiresAt || null, userId);
  return getUserById(userId);
}

export function setUserRole(userId, role) {
  if (!['user', 'admin'].includes(role)) throw new Error('Role không hợp lệ');
  db.prepare(`
    UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?
  `).run(role, userId);
  return getUserById(userId);
}

export function banUser(userId, reason) {
  db.prepare(`
    UPDATE users SET is_banned = 1, ban_reason = ?, banned_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).run(reason || 'Vi phạm quy định', userId);
  return getUserById(userId);
}

export function unbanUser(userId) {
  db.prepare(`
    UPDATE users SET is_banned = 0, ban_reason = NULL, banned_at = NULL, updated_at = datetime('now')
    WHERE id = ?
  `).run(userId);
  return getUserById(userId);
}

export function banIp(ip, reason, adminId) {
  try {
    db.prepare(`
      INSERT INTO banned_ips (ip_address, reason, banned_by) VALUES (?, ?, ?)
    `).run(ip, reason || 'Vi phạm quy định', adminId);
  } catch (err) {
    if (err.message.includes('UNIQUE')) throw new Error('IP đã bị ban rồi');
    throw err;
  }
}

export function unbanIp(ip) {
  db.prepare('DELETE FROM banned_ips WHERE ip_address = ?').run(ip);
}

export function getBannedIps() {
  return db.prepare('SELECT * FROM banned_ips ORDER BY created_at DESC').all();
}

export function isIpBanned(ip) {
  const row = db.prepare('SELECT id FROM banned_ips WHERE ip_address = ?').get(ip);
  return !!row;
}

export function updateLastIp(userId, ip) {
  db.prepare(`
    UPDATE users
    SET last_ip = ?, last_login_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).run(ip, userId);
  return getUserById(userId);
}

export function updatePresenceStatus(userId, status) {
  const allowed = ['online', 'idle', 'dnd', 'invisible'];
  if (!allowed.includes(status)) {
    throw new Error('Trạng thái không hợp lệ');
  }
  const visible = status === 'invisible' ? 0 : 1;
  db.prepare(`
    UPDATE users
    SET presence_status = ?, presence_visible = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(status, visible, userId);
  return getUserById(userId);
}

export function updateUserProfile(userId, displayName, email, showPlanBadge) {
  if (email) {
    const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email.toLowerCase(), userId);
    if (existing) throw new Error('Email đã được sử dụng');
  }
  if (displayName) {
    db.prepare('UPDATE users SET display_name = ?, updated_at = datetime(\'now\') WHERE id = ?').run(displayName, userId);
  }
  if (email) {
    const currentUser = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);
    const emailChanged = currentUser && currentUser.email?.toLowerCase() !== email.toLowerCase();
    db.prepare('UPDATE users SET email = ?, updated_at = datetime(\'now\') WHERE id = ?').run(email.toLowerCase(), userId);
    if (emailChanged) {
      db.prepare('UPDATE users SET email_verified = 0, updated_at = datetime(\'now\') WHERE id = ?').run(userId);
    }
  }
  if (typeof showPlanBadge === 'boolean') {
    db.prepare('UPDATE users SET show_plan_badge = ?, updated_at = datetime(\'now\') WHERE id = ?').run(showPlanBadge ? 1 : 0, userId);
  }
  return getUserById(userId);
}

export function changePassword(userId, oldPassword, newPassword) {
  const user = db.prepare('SELECT password FROM users WHERE id = ?').get(userId);
  if (!user) throw new Error('Tài khoản không tồn tại');
  if (!bcrypt.compareSync(oldPassword, user.password)) {
    throw new Error('Mật khẩu cũ không đúng');
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password = ?, updated_at = datetime(\'now\') WHERE id = ?').run(hash, userId);
}

// ── Email verification ─────────────────────────────────

export function setVerificationToken(userId, token) {
  const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes
  db.prepare(`
    UPDATE users SET verification_token = ?, verification_token_expires = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(token, expires, userId);
}

export function verifyEmail(token) {
  const user = db.prepare('SELECT * FROM users WHERE verification_token = ?').get(token);
  if (!user) throw new Error('Token xác minh không hợp lệ');
  if (new Date(user.verification_token_expires) < new Date()) {
    throw new Error('Token xác minh đã hết hạn. Vui lòng yêu cầu gửi lại.');
  }
  db.prepare(`
    UPDATE users SET email_verified = 1, verification_token = NULL, verification_token_expires = NULL, updated_at = datetime('now')
    WHERE id = ?
  `).run(user.id);
  return formatUser({ ...user, email_verified: 1 });
}

export function getUserByEmail(email) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  return user; // raw user, not formatted
}

// ── Password reset ─────────────────────────────────────

export function setResetToken(userId, token) {
  const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes
  db.prepare(`
    UPDATE users SET reset_token = ?, reset_token_expires = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(token, expires, userId);
}

export function resetPasswordWithToken(token, newPassword) {
  const user = db.prepare('SELECT * FROM users WHERE reset_token = ?').get(token);
  if (!user) throw new Error('Token đặt lại mật khẩu không hợp lệ');
  if (new Date(user.reset_token_expires) < new Date()) {
    throw new Error('Token đã hết hạn. Vui lòng yêu cầu đặt lại mật khẩu mới.');
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare(`
    UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL, updated_at = datetime('now')
    WHERE id = ?
  `).run(hash, user.id);
  return formatUser({ ...user, reset_token: null });
}

// ── Seed default admin ─────────────────────────────────

export function ensureAdmin() {
  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin'").get();
  if (!admin) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT OR IGNORE INTO users (username, email, password, display_name, role, plan)
      VALUES ('admin', 'admin@notemind.local', ?, 'Admin', 'admin', 'unlimited')
    `).run(hash);
    console.log('🔑 Default admin created — username: admin / password: admin123');
  }
}

// ── 2FA (TOTP) ────────────────────────────────────────

const TOTP_ISSUER = 'NoteMinds';
const TEMP_TOKEN_EXPIRY = 5 * 60 * 1000; // 5 minutes

/**
 * Generate a short-lived temp token for 2FA verification step
 */
export function generate2FATempToken(userId) {
  return jwt.sign(
    { id: userId, purpose: '2fa' },
    JWT_SECRET,
    { expiresIn: '5m' }
  );
}

/**
 * Verify a 2FA temp token
 */
export function verify2FATempToken(tempToken) {
  try {
    const decoded = jwt.verify(tempToken, JWT_SECRET);
    if (decoded.purpose !== '2fa') return null;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Generate TOTP secret and QR code for setup
 */
export async function setupTotp(userId) {
  const user = db.prepare('SELECT username, email FROM users WHERE id = ?').get(userId);
  if (!user) throw new Error('Tài khoản không tồn tại');

  const secret = new Secret({ size: 20 });
  const totp = new TOTP({
    issuer: TOTP_ISSUER,
    label: user.email || user.username,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  });

  const otpauthUrl = totp.toString();
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

  // Store secret (not yet enabled)
  db.prepare(`
    UPDATE users SET totp_secret = ?, updated_at = datetime('now') WHERE id = ?
  `).run(secret.base32, userId);

  return {
    secret: secret.base32,
    qrCode: qrCodeDataUrl,
    otpauthUrl,
  };
}

/**
 * Verify TOTP token and enable 2FA
 */
export function enableTotp(userId, token) {
  const user = db.prepare('SELECT totp_secret, totp_enabled FROM users WHERE id = ?').get(userId);
  if (!user) throw new Error('Tài khoản không tồn tại');
  if (user.totp_enabled) throw new Error('2FA đã được bật rồi');
  if (!user.totp_secret) throw new Error('Vui lòng thiết lập 2FA trước');

  const totp = new TOTP({
    issuer: TOTP_ISSUER,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(user.totp_secret),
  });

  const delta = totp.validate({ token, window: 1 });
  if (delta === null) {
    throw new Error('Mã xác thực không đúng. Vui lòng thử lại.');
  }

  // Generate recovery codes
  const recoveryCodes = generateRecoveryCodes();
  const hashedCodes = recoveryCodes.map(code => bcrypt.hashSync(code, 8));

  db.prepare(`
    UPDATE users SET totp_enabled = 1, totp_recovery_codes = ?, updated_at = datetime('now') WHERE id = ?
  `).run(JSON.stringify(hashedCodes), userId);

  return { recoveryCodes };
}

/**
 * Verify TOTP token during login
 */
export function verifyTotpToken(userId, token) {
  const user = db.prepare('SELECT totp_secret, totp_enabled FROM users WHERE id = ?').get(userId);
  if (!user || !user.totp_enabled || !user.totp_secret) {
    throw new Error('2FA chưa được bật cho tài khoản này');
  }

  const totp = new TOTP({
    issuer: TOTP_ISSUER,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(user.totp_secret),
  });

  const delta = totp.validate({ token, window: 1 });
  if (delta === null) {
    throw new Error('Mã xác thực không đúng');
  }

  return getUserById(userId);
}

/**
 * Verify recovery code during login
 */
export function verifyRecoveryCode(userId, code) {
  const user = db.prepare('SELECT totp_recovery_codes, totp_enabled FROM users WHERE id = ?').get(userId);
  if (!user || !user.totp_enabled) {
    throw new Error('2FA chưa được bật cho tài khoản này');
  }

  const hashedCodes = JSON.parse(user.totp_recovery_codes || '[]');
  const normalizedCode = code.replace(/[\s-]/g, '').toLowerCase();

  let matchIndex = -1;
  for (let i = 0; i < hashedCodes.length; i++) {
    if (bcrypt.compareSync(normalizedCode, hashedCodes[i])) {
      matchIndex = i;
      break;
    }
  }

  if (matchIndex === -1) {
    throw new Error('Mã khôi phục không đúng');
  }

  // Remove used recovery code
  hashedCodes.splice(matchIndex, 1);
  db.prepare(`
    UPDATE users SET totp_recovery_codes = ?, updated_at = datetime('now') WHERE id = ?
  `).run(JSON.stringify(hashedCodes), userId);

  return getUserById(userId);
}

/**
 * Disable 2FA (requires password confirmation)
 */
export function disableTotp(userId, password) {
  const user = db.prepare('SELECT password, totp_enabled FROM users WHERE id = ?').get(userId);
  if (!user) throw new Error('Tài khoản không tồn tại');
  if (!user.totp_enabled) throw new Error('2FA chưa được bật');
  if (!bcrypt.compareSync(password, user.password)) {
    throw new Error('Mật khẩu không đúng');
  }

  db.prepare(`
    UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_recovery_codes = NULL, updated_at = datetime('now') WHERE id = ?
  `).run(userId);

  return getUserById(userId);
}

/**
 * Get 2FA status
 */
export function getTotpStatus(userId) {
  const user = db.prepare('SELECT totp_enabled, totp_recovery_codes FROM users WHERE id = ?').get(userId);
  if (!user) throw new Error('Tài khoản không tồn tại');
  const codes = JSON.parse(user.totp_recovery_codes || '[]');
  return {
    enabled: !!user.totp_enabled,
    recoveryCodesRemaining: codes.length,
  };
}

/**
 * Regenerate recovery codes (requires password confirmation)
 */
export function regenerateRecoveryCodes(userId, password) {
  const user = db.prepare('SELECT password, totp_enabled FROM users WHERE id = ?').get(userId);
  if (!user) throw new Error('Tài khoản không tồn tại');
  if (!user.totp_enabled) throw new Error('2FA chưa được bật');
  if (!bcrypt.compareSync(password, user.password)) {
    throw new Error('Mật khẩu không đúng');
  }

  const recoveryCodes = generateRecoveryCodes();
  const hashedCodes = recoveryCodes.map(code => bcrypt.hashSync(code, 8));

  db.prepare(`
    UPDATE users SET totp_recovery_codes = ?, updated_at = datetime('now') WHERE id = ?
  `).run(JSON.stringify(hashedCodes), userId);

  return { recoveryCodes };
}

/**
 * Generate 8 random recovery codes
 */
function generateRecoveryCodes() {
  const codes = [];
  for (let i = 0; i < 8; i++) {
    const code = crypto.randomBytes(4).toString('hex'); // 8-char hex code
    codes.push(code);
  }
  return codes;
}

export { GUEST_DAILY_LIMIT };
