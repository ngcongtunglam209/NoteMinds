import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { processDocument } from './services/documentProcessor.js';
import { generateMindmap } from './services/mindmapGenerator.js';
import { generateFlashcards } from './services/flashcardGenerator.js';
import { generateQuiz } from './services/quizGenerator.js';
import { generateSummary } from './services/summaryGenerator.js';
import { reviewFlashcard, getDueFlashcards } from './services/srsService.js';
import { chatWithDocument, chatWithMultipleDocuments } from './services/chatService.js';
import { callQwen } from './services/qwenClient.js';
import { getUserPreferences } from './services/syncAndExportService.js';
import { normalizeLanguage } from './services/promptBuilder.js';
import {
  createUser, authenticateUser, generateToken, getUserById,
  optionalAuth, requireAuth, requireAdmin, verifyToken,
  getUploadCount, logUpload, getUploadLimit, getChatLimit,
  getAllUsers, setUserPlan, setUserRole,
  updateUserProfile, changePassword, ensureAdmin,
  banUser, unbanUser, banIp, unbanIp, getBannedIps, isIpBanned, updateLastIp, updatePresenceStatus,
  setVerificationToken, verifyEmail, getUserByEmail, setResetToken, resetPasswordWithToken,
  getRegistrationCount, logRegistration,
  generate2FATempToken, verify2FATempToken,
  setupTotp, enableTotp, verifyTotpToken, verifyRecoveryCode,
  disableTotp, getTotpStatus, regenerateRecoveryCodes,
  GUEST_DAILY_LIMIT, PLANS,
} from './services/authService.js';
import {
  generatePasskeyRegistrationOptions, verifyPasskeyRegistration,
  generatePasskeyAuthenticationOptions, verifyPasskeyAuthentication,
  generateDiscoverableAuthOptions, verifyDiscoverableAuth,
  getPasskeyList, removePasskey, renamePasskey,
} from './services/passkeyService.js';

import { initializeIndexes, getDatabaseStats } from './services/databaseIndexes.js';
import { initializeEnhancedTables } from './services/enhancedDatabase.js';
import { initDocumentCleanup } from './services/documentCleanup.js';
import { logger, requestLoggerMiddleware } from './services/logger.js';
import featureRoutes from './routes/featuresRoutes.js';
import statsRoutes from './routes/statsRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import { logActivity } from './services/statsService.js';
import { validateShareToken } from './services/advancedFeatureService.js';
import { 
  sendVerificationEmail, sendPasswordResetEmail, generateVerificationToken, testEmailConnection,
  saveEmailTracking, trackEmailOpen, getEmailStats, getEmailStatsDateRange
} from './services/emailService.js';
import {
  initNotificationsTable, createNotification, createBulkNotifications,
  NOTIFICATION_TYPES, getNotificationTemplate,
  getAllNotifications, getNotificationStats, cleanupOldNotifications,
} from './services/notificationService.js';
import {
  createPaymentOrder, createCheckoutSession, checkOrderStatus, getUserPaymentHistory,
  getRecentPayments, processSepayWebhook, verifySepayWebhook,
  processSePayPgIPN,
  cleanupExpiredOrders, PLAN_PRICES,
} from './services/paymentService.js';
import './services/envLoader.js';
import Database from 'better-sqlite3';
import db from './services/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

function resolveRequestLanguage(req, userId = null) {
  let preferred = req?.body?.language;
  if (!preferred && userId) {
    try {
      preferred = getUserPreferences(userId)?.language;
    } catch {
      preferred = null;
    }
  }
  return normalizeLanguage(preferred, req?.headers?.['accept-language']);
}

// ── Cloudflare Turnstile ──
// ==== SECURITY: Enforce TURNSTILE_SECRET from environment ====
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET;

if (!TURNSTILE_SECRET && NODE_ENV === 'production') {
  console.error('❌ FATAL ERROR: TURNSTILE_SECRET environment variable is not set!');
  console.error('   Get it from Cloudflare dashboard https://dash.cloudflare.com/profile/api-tokens');
  process.exit(1);
}
async function verifyTurnstile(token, ip) {
  if (!TURNSTILE_SECRET || NODE_ENV === 'development') return true;
  if (!token) return false;
  try {
    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: TURNSTILE_SECRET, response: token, remoteip: ip }),
    });
    const data = await resp.json();
    return data.success === true;
  } catch {
    return true; // fail open if Turnstile service is down
  }
}

// Trust proxy (nginx) for correct client IP
app.set('trust proxy', 1);

// CORS Configuration
// ==== SECURITY: Use whitelist for all origins, not just development ====
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://notemind.tech',
  'https://www.notemind.tech',
];

const envAllowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const ALLOWED_ORIGINS = Array.from(new Set([
  ...DEFAULT_ALLOWED_ORIGINS,
  ...envAllowedOrigins,
  FRONTEND_URL,
].filter(Boolean)));

const allowedOriginsLower = ALLOWED_ORIGINS.map(o => o.toLowerCase());

if (NODE_ENV === 'production') {
  console.log('✅ CORS configured for origins:', ALLOWED_ORIGINS);
}

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    const originLower = origin.toLowerCase();
    if (allowedOriginsLower.includes(originLower)) {
      callback(null, true);
    } else {
      if (NODE_ENV === 'development') {
        console.warn(`[CORS] Blocked request from origin: ${origin}`);
      }
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  maxAge: 86400
};

// Middleware
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));

// ==== SECURITY: Security headers ====
app.use((req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Permissions policy
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  if (NODE_ENV === 'production') {
    // Enforce HTTPS in production
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
});

// Request logging middleware
app.use(requestLoggerMiddleware);

// Serve static frontend in production
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Ensure documents directory exists
const documentsDir = path.join(uploadsDir, 'documents');
if (!fs.existsSync(documentsDir)) {
  fs.mkdirSync(documentsDir, { recursive: true });
}

// Ensure avatars directory exists
const avatarsDir = path.join(uploadsDir, 'avatars');
if (!fs.existsSync(avatarsDir)) {
  fs.mkdirSync(avatarsDir, { recursive: true });
}

// Serve avatar files statically
app.use('/uploads/avatars', express.static(avatarsDir));

// Initialize cleanup cron job
initDocumentCleanup(documentsDir);

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, documentsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.txt', '.md', '.docx', '.doc', '.pptx', '.xlsx', '.csv', '.mp3', '.wav', '.m4a', '.ogg', '.webm', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}`));
    }
  }
});

// In-memory document store
const documents = new Map();

// ── SSE: live-update listeners per document ──
// Map<documentId, Set<Response>>
const docListeners = new Map();

function addDocListener(docId, res) {
  if (!docListeners.has(docId)) docListeners.set(docId, new Set());
  docListeners.get(docId).add(res);
}

function removeDocListener(docId, res) {
  const set = docListeners.get(docId);
  if (set) {
    set.delete(res);
    if (set.size === 0) docListeners.delete(docId);
  }
}

function broadcastDocEvent(docId, eventType, data) {
  const set = docListeners.get(docId);
  if (!set || set.size === 0) return;
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try { res.write(payload); } catch { /* client gone */ }
  }
}

// ── SSE: live notification listeners per user ──
// Map<userId, Set<Response>>
const notifListeners = new Map();

function addNotifListener(userId, res) {
  if (!notifListeners.has(userId)) notifListeners.set(userId, new Set());
  notifListeners.get(userId).add(res);
}

function removeNotifListener(userId, res) {
  const set = notifListeners.get(userId);
  if (set) {
    set.delete(res);
    if (set.size === 0) notifListeners.delete(userId);
  }
}

function broadcastNotifEvent(userId, eventType, data) {
  const set = notifListeners.get(userId);
  if (!set || set.size === 0) return;
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try { res.write(payload); } catch { /* client gone */ }
  }
}

// Database path for document persistence

function persistDocumentToDB(docId, userId, filePath, originalName, status, textLength = 0) {
  try {
    const existing = db.prepare('SELECT id FROM documents WHERE id = ?').get(docId);
    if (existing) {
      db.prepare(`
        UPDATE documents SET status = ?, text_length = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(status, textLength, docId);
    } else {
      db.prepare(`
        INSERT INTO documents (id, user_id, file_path, original_name, status, text_length)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(docId, userId || null, filePath, originalName, status, textLength);
    }
  } catch (err) {
    console.error('[DB] Error persisting document:', err.message);
  }
}

// Helper to extract real client IP (behind nginx proxy)
// trust proxy = 1, so req.ip is the address nginx saw, not a client-supplied header
function getClientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

// Ban check middleware
function checkBan(req, res, next) {
  const ip = getClientIp(req);
  if (isIpBanned(ip)) {
    return res.status(403).json({ error: 'IP của bạn đã bị chặn truy cập.' });
  }
  next();
}

// Apply ban check to all API routes
app.use('/api', checkBan);

// ── Maintenance mode middleware ──
app.use('/api', (req, res, next) => {
  // Always allow these paths through (req.path is relative to /api mount)
  const bypass = ['/system/settings', '/auth', '/login', '/register', '/me'];
  if (bypass.some(p => req.path.startsWith(p)) || req.path.includes('/admin') || req.path.includes('/track-login')) return next();

  try {
    const row = db.prepare("SELECT value FROM system_settings WHERE key = 'maintenance_mode'").get();
    if (row && JSON.parse(row.value)) {
      const decoded = verifyToken(req.headers.authorization?.split(' ')[1] || '');
      const user = decoded && getUserById(decoded.id);
      if (user?.role === 'admin') return next();
      return res.status(503).json({ error: 'maintenance', message: 'Hệ thống đang bảo trì. Vui lòng quay lại sau.' });
    }
  } catch { }
  next();
});

// ==== SECURITY: Rate limiting for authentication endpoints ====
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: 'Quá nhiều lần đăng nhập từ IP này, vui lòng thử lại sau 15 phút',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  // Note: Using default keyGenerator (handles IPv6 properly)
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 registration attempts per hour
  message: 'Quá nhiều lần đăng ký từ IP này, vui lòng thử lại sau 1 giờ',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

// 2FA codes are 6 digits: without a limit a valid tempToken allows brute force
const twoFactorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Quá nhiều lần thử, vui lòng thử lại sau 15 phút',
  standardHeaders: true,
  legacyHeaders: false,
});

const emailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Quá nhiều yêu cầu gửi email, vui lòng thử lại sau',
  standardHeaders: true,
  legacyHeaders: false,
});

// ============ AUTH ROUTES ============

app.post('/api/auth/register', registerLimiter, async (req, res) => {
  try {
    const { username, email, password, displayName, turnstileToken } = req.body;
    const ip = getClientIp(req);
    if (!await verifyTurnstile(turnstileToken, ip)) {
      return res.status(403).json({ error: 'Xác minh bảo mật thất bại. Vui lòng thử lại.' });
    }
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin' });
    }
    if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) {
      return res.status(400).json({ error: 'Tên đăng nhập phải có 3-30 ký tự (chữ, số, _ . -)' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 6 ký tự' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Email không hợp lệ' });
    }

    // IP-based registration limit (max 3)
    const regCount = getRegistrationCount(ip);
    if (regCount >= 3) {
      return res.status(429).json({ error: 'Địa chỉ IP của bạn đã đăng ký quá 3 tài khoản. Không thể đăng ký thêm.' });
    }

    const user = createUser(username, email, password, displayName);
    logRegistration(ip, user.id);
    const token = generateToken(user);

    // Send verification email
    try {
      const verifyToken = generateVerificationToken();
      setVerificationToken(user.id, verifyToken);
      const lang = resolveRequestLanguage(req, user.id);
      await sendVerificationEmail(email, verifyToken, username, lang, saveEmailTracking);
    } catch (emailErr) {
      console.error('[Register] Verification email failed:', emailErr.message);
      // Don't block registration if email fails
    }

    res.json({ user, token, message: 'Đăng ký thành công! Vui lòng kiểm tra email để xác minh tài khoản.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Email verification routes ──

app.post('/api/auth/verify-email', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token không hợp lệ' });
    const user = verifyEmail(token);
    
    // Create notification for successful email verification
    createNotification(user.id, 'email_verified',
      'Email Verified',
      'Your email has been successfully verified!',
      {
        icon: 'check',
        data: { email: user.email },
      }
    );
    broadcastNotifEvent(user.id, 'new_notification', { type: 'email_verified', title: 'Email Verified' });
    
    res.json({ user, message: 'Email đã được xác minh thành công!' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/resend-verification', emailLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Vui lòng nhập email' });
    const user = getUserByEmail(email);
    // Same answer whether or not the email exists (no account enumeration)
    if (!user || user.email_verified) return res.json({ message: 'Email xác minh đã được gửi lại!' });

    const verifyToken = generateVerificationToken();
    setVerificationToken(user.id, verifyToken);
    const lang = resolveRequestLanguage(req, user.id);
    await sendVerificationEmail(email, verifyToken, user.username, lang, saveEmailTracking);
    res.json({ message: 'Email xác minh đã được gửi lại!' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/forgot-password', emailLimiter, async (req, res) => {
  try {
    const { email, turnstileToken } = req.body;
    const ip = getClientIp(req);
    if (!await verifyTurnstile(turnstileToken, ip)) {
      return res.status(403).json({ error: 'Xác minh bảo mật thất bại. Vui lòng thử lại.' });
    }
    if (!email) return res.status(400).json({ error: 'Vui lòng nhập email' });
    const user = getUserByEmail(email);
    // Don't reveal if email exists or not for security
    if (!user) {
      return res.json({ message: 'Nếu email tồn tại, bạn sẽ nhận được link đặt lại mật khẩu.' });
    }

    const resetToken = generateVerificationToken();
    setResetToken(user.id, resetToken);
    
    // Create notification for password reset request
    createNotification(user.id, NOTIFICATION_TYPES.PASSWORD_RESET_REQUESTED,
      'Password Reset Request',
      'A password reset link has been sent to your email.',
      {
        icon: 'lock',
        data: { email: user.email },
      }
    );
    broadcastNotifEvent(user.id, 'new_notification', { type: 'password_reset_requested', title: 'Password Reset Request' });
    
    const lang = resolveRequestLanguage(req, user.id);
    await sendPasswordResetEmail(email, resetToken, user.username, lang, saveEmailTracking);
    res.json({ message: 'Nếu email tồn tại, bạn sẽ nhận được link đặt lại mật khẩu.' });
  } catch (err) {
    console.error('[ForgotPassword] Error:', err.message);
    res.json({ message: 'Nếu email tồn tại, bạn sẽ nhận được link đặt lại mật khẩu.' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Thông tin không hợp lệ' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
    }
    const user = resetPasswordWithToken(token, newPassword);
    
    // Create notification for successful password reset
    createNotification(user.id, 'password_reset_success',
      'Password Changed',
      'Your password has been successfully reset.',
      {
        icon: 'lock',
        data: { email: user.email },
      }
    );
    broadcastNotifEvent(user.id, 'new_notification', { type: 'password_reset_success', title: 'Password Changed' });
    
    res.json({ user, message: 'Mật khẩu đã được đặt lại thành công!' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { login, password, turnstileToken } = req.body;
    const ip = getClientIp(req);
    if (!await verifyTurnstile(turnstileToken, ip)) {
      return res.status(403).json({ error: 'Xác minh bảo mật thất bại. Vui lòng thử lại.' });
    }
    if (!login || !password) {
      return res.status(400).json({ error: 'Vui lòng nhập tên đăng nhập/email và mật khẩu' });
    }
    const result = authenticateUser(login, password, ip);

    // If 2FA is required, return a temp token instead of the real JWT
    if (result.requires2FA) {
      const tempToken = generate2FATempToken(result.userId);
      return res.json({
        requires2FA: true,
        tempToken,
        totpEnabled: result.totpEnabled,
        passkeyEnabled: result.passkeyEnabled,
      });
    }

    const token = generateToken(result);
    res.json({ user: result, token });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// ── 2FA Routes ──

app.post('/api/auth/2fa/verify', twoFactorLimiter, async (req, res) => {
  try {
    const { tempToken, totpCode } = req.body;
    if (!tempToken || !totpCode) {
      return res.status(400).json({ error: 'Vui lòng nhập mã xác thực' });
    }
    const decoded = verify2FATempToken(tempToken);
    if (!decoded) {
      return res.status(401).json({ error: 'Phiên xác thực đã hết hạn. Vui lòng đăng nhập lại.' });
    }
    const user = verifyTotpToken(decoded.id, totpCode);
    const token = generateToken(user);
    res.json({ user, token });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

app.post('/api/auth/2fa/recovery', twoFactorLimiter, async (req, res) => {
  try {
    const { tempToken, recoveryCode } = req.body;
    if (!tempToken || !recoveryCode) {
      return res.status(400).json({ error: 'Vui lòng nhập mã khôi phục' });
    }
    const decoded = verify2FATempToken(tempToken);
    if (!decoded) {
      return res.status(401).json({ error: 'Phiên xác thực đã hết hạn. Vui lòng đăng nhập lại.' });
    }
    const user = verifyRecoveryCode(decoded.id, recoveryCode);
    const token = generateToken(user);
    res.json({ user, token });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

app.post('/api/auth/2fa/setup', requireAuth, async (req, res) => {
  try {
    const result = await setupTotp(req.user.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/2fa/enable', requireAuth, (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Vui lòng nhập mã xác thực từ ứng dụng' });
    }
    const result = enableTotp(req.user.id, token);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/2fa/disable', requireAuth, (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Vui lòng nhập mật khẩu' });
    }
    const user = disableTotp(req.user.id, password);
    res.json({ user, message: '2FA đã được tắt thành công' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/auth/2fa/status', requireAuth, (req, res) => {
  try {
    const status = getTotpStatus(req.user.id);
    res.json(status);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/2fa/recovery-codes', requireAuth, (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Vui lòng nhập mật khẩu' });
    }
    const result = regenerateRecoveryCodes(req.user.id, password);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Passkey Routes ──

// Registration: generate options
app.post('/api/auth/passkey/register-options', requireAuth, async (req, res) => {
  try {
    const options = await generatePasskeyRegistrationOptions(req.user.id);
    res.json(options);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Registration: verify response
app.post('/api/auth/passkey/register-verify', requireAuth, async (req, res) => {
  try {
    const { response, name } = req.body;
    if (!response) return res.status(400).json({ error: 'Missing passkey response' });
    const result = await verifyPasskeyRegistration(req.user.id, response, name);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Discoverable passkey login (no username/password needed)
app.post('/api/auth/passkey/login-options', async (req, res) => {
  try {
    const options = await generateDiscoverableAuthOptions();
    res.json(options);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/passkey/login-verify', twoFactorLimiter, async (req, res) => {
  try {
    const { response } = req.body;
    if (!response) return res.status(400).json({ error: 'Missing passkey response' });
    const result = await verifyDiscoverableAuth(response);
    if (result.verified) {
      const user = getUserById(result.userId);
      if (!user) return res.status(401).json({ error: 'Tài khoản không tồn tại' });
      if (user.is_banned) return res.status(403).json({ error: 'Tài khoản đã bị khóa' });
      const token = generateToken(user);
      res.json({ user, token });
    } else {
      res.status(401).json({ error: 'Xác thực passkey thất bại' });
    }
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// Authentication during 2FA: generate options
app.post('/api/auth/passkey/auth-options', async (req, res) => {
  try {
    const { tempToken } = req.body;
    if (!tempToken) return res.status(400).json({ error: 'Missing temp token' });
    const decoded = verify2FATempToken(tempToken);
    if (!decoded) return res.status(401).json({ error: 'Phiên xác thực đã hết hạn.' });
    const options = await generatePasskeyAuthenticationOptions(decoded.id);
    res.json(options);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Authentication during 2FA: verify response
app.post('/api/auth/passkey/auth-verify', twoFactorLimiter, async (req, res) => {
  try {
    const { tempToken, response } = req.body;
    if (!tempToken || !response) return res.status(400).json({ error: 'Missing data' });
    const decoded = verify2FATempToken(tempToken);
    if (!decoded) return res.status(401).json({ error: 'Phiên xác thực đã hết hạn. Vui lòng đăng nhập lại.' });
    const result = await verifyPasskeyAuthentication(decoded.id, response);
    if (result.verified) {
      const user = getUserById(decoded.id);
      const token = generateToken(user);
      res.json({ user, token });
    } else {
      res.status(401).json({ error: 'Xác thực passkey thất bại' });
    }
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// Management: list passkeys
app.get('/api/auth/passkey/list', requireAuth, (req, res) => {
  try {
    const passkeys = getPasskeyList(req.user.id);
    res.json({ passkeys });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Management: remove passkey
app.delete('/api/auth/passkey/:id', requireAuth, (req, res) => {
  try {
    const result = removePasskey(req.user.id, req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Management: rename passkey
app.put('/api/auth/passkey/:id', requireAuth, (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Tên không được để trống' });
    const result = renamePasskey(req.user.id, req.params.id, name);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  // Update IP on each auth check
  const ip = getClientIp(req);
  const refreshedUser = updateLastIp(req.user.id, ip);
  res.json({ user: refreshedUser || req.user });
});

app.post('/api/auth/presence/heartbeat', requireAuth, (req, res) => {
  try {
    const ip = getClientIp(req);
    const refreshedUser = updateLastIp(req.user.id, ip);
    res.json({
      ok: true,
      seenAt: refreshedUser?.lastLoginAt || new Date().toISOString(),
    });
  } catch {
    res.status(500).json({ error: 'Không thể cập nhật trạng thái online' });
  }
});

app.put('/api/auth/presence/status', requireAuth, (req, res) => {
  try {
    const status = String(req.body?.status || '').toLowerCase();
    const updated = updatePresenceStatus(req.user.id, status);
    res.json({ user: updated });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Không thể cập nhật trạng thái' });
  }
});

// ============ USER PROFILE ============

app.put('/api/auth/profile', requireAuth, async (req, res) => {
  try {
    const { displayName, email, showPlanBadge } = req.body;
    const oldEmail = req.user.email?.toLowerCase();
    const updated = updateUserProfile(req.user.id, displayName, email, typeof showPlanBadge === 'boolean' ? showPlanBadge : undefined);

    // If email changed, send verification email to the new address
    if (email && email.toLowerCase() !== oldEmail) {
      try {
        const verifyToken = generateVerificationToken();
        setVerificationToken(req.user.id, verifyToken);
        const lang = resolveRequestLanguage(req, req.user.id);
        await sendVerificationEmail(email, verifyToken, updated.username || updated.displayName, lang, saveEmailTracking);
      } catch (emailErr) {
        console.error('[Profile] Verification email failed:', emailErr.message);
      }
    }

    res.json({ user: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Avatar upload
const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, avatarsDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${req.user.id}-${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Chỉ chấp nhận ảnh JPG, PNG hoặc WebP'));
  }
});

app.post('/api/users/profile/avatar', requireAuth, avatarUpload.single('avatar'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Không tìm thấy file ảnh' });

    // Remove old avatar file if exists
    if (req.user.avatar_url) {
      const oldRelativePath = req.user.avatar_url.replace(/^\//, '');
      const oldPath = path.join(__dirname, oldRelativePath);
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (e) { /* ignore */ }
      }
    }

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    db.prepare("UPDATE users SET avatar_url = ?, updated_at = datetime('now') WHERE id = ?").run(avatarUrl, req.user.id);
    const updated = getUserById(req.user.id);
    res.json({ user: updated });
  } catch (err) {
    logger.error('Avatar upload error:', { error: err.message });
    res.status(500).json({ error: 'Lỗi khi tải lên ảnh đại diện' });
  }
});

app.put('/api/auth/password', requireAuth, (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Vui lòng nhập đầy đủ mật khẩu cũ và mới' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
    }
    changePassword(req.user.id, oldPassword, newPassword);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============ ADMIN ROUTES ============

app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const users = getAllUsers();
  res.json({ users });
});

app.put('/api/admin/users/:userId/plan', requireAuth, requireAdmin, (req, res) => {
  try {
    const { plan, expiresAt } = req.body;
    const userId = Number(req.params.userId);
    const updated = setUserPlan(userId, plan, expiresAt);
    
    // Create notification for plan change
    const template = getNotificationTemplate(NOTIFICATION_TYPES.PLAN_CHANGED, plan);
    if (template) {
      createNotification(userId, NOTIFICATION_TYPES.PLAN_CHANGED, template.title, template.message, {
        icon: template.icon || 'upgrade',
        data: { plan, expiresAt },
      });
      broadcastNotifEvent(userId, 'new_notification', { type: 'plan_changed', title: template.title });
    }
    
    res.json({ user: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/admin/users/:userId/role', requireAuth, requireAdmin, (req, res) => {
  try {
    const { role } = req.body;
    const updated = setUserRole(Number(req.params.userId), role);
    res.json({ user: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/admin/plans', requireAuth, requireAdmin, (req, res) => {
  res.json({ plans: PLANS });
});

// Ban/unban user
app.put('/api/admin/users/:userId/ban', requireAuth, requireAdmin, (req, res) => {
  try {
    const { reason } = req.body;
    const userId = Number(req.params.userId);
    const updated = banUser(userId, reason);
    
    // Create notification for account ban
    createNotification(userId, NOTIFICATION_TYPES.ACCOUNT_BANNED, 
      'Account Suspended',
      `Your account has been suspended. Reason: ${reason || 'No reason provided'}`,
      {
        icon: 'alert',
        data: { reason },
      }
    );
    broadcastNotifEvent(userId, 'new_notification', { type: 'account_banned', title: 'Account Suspended' });
    
    res.json({ user: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/admin/users/:userId/unban', requireAuth, requireAdmin, (req, res) => {
  try {
    const updated = unbanUser(Number(req.params.userId));
    res.json({ user: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// IP ban management
app.get('/api/admin/banned-ips', requireAuth, requireAdmin, (req, res) => {
  const ips = getBannedIps();
  res.json({ ips });
});

app.post('/api/admin/ban-ip', requireAuth, requireAdmin, (req, res) => {
  try {
    const { ip, reason } = req.body;
    if (!ip) return res.status(400).json({ error: 'Vui lòng nhập IP' });
    // Prevent admin from banning their own IP
    const adminIp = getClientIp(req);
    if (ip === adminIp || ip === '::1' && adminIp === '::1') {
      return res.status(400).json({ error: 'Không thể chặn IP của chính bạn!' });
    }
    banIp(ip, reason, req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/admin/ban-ip/:ip', requireAuth, requireAdmin, (req, res) => {
  try {
    unbanIp(req.params.ip);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============ UPLOAD LIMIT (auth-aware) ============

function uploadRateLimitMiddleware(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const userId = req.user?.id || null;
  const limit = getUploadLimit(req.user);
  const used = getUploadCount(userId, ip);
  const remaining = Math.max(0, limit - used);

  if (remaining <= 0 && limit !== -1) {
    if (!req.user) {
      return res.status(429).json({
        error: 'Bạn đã dùng hết lượt upload miễn phí. Đăng ký tài khoản để có thêm lượt!',
        uploadLimitReached: true,
        requireAuth: true,
        remaining: 0,
      });
    }
    return res.status(429).json({
      error: `Đã dùng hết ${limit} lượt upload hôm nay. Nâng cấp gói để có thêm lượt!`,
      uploadLimitReached: true,
      remaining: 0,
    });
  }

  // Log the upload
  logUpload(userId, ip);
  next();
}

// ============ ROUTES ============

// ==== SECURITY: Upload requires authentication to prevent anonymous spam ====
app.post('/api/upload', requireAuth, uploadRateLimitMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Free/guest users cannot upload audio files
    const audioExts = ['.mp3', '.wav', '.m4a', '.ogg', '.webm'];
    const ext = path.extname(req.file.originalname).toLowerCase();
    const userPlan = req.user.plan || 'free';
    if (audioExts.includes(ext) && userPlan === 'free') {
      // Delete the uploaded file
      fs.unlink(req.file.path, () => { });
      return res.status(403).json({
        error: 'Gói Free không hỗ trợ file âm thanh. Nâng cấp gói để sử dụng tính năng này!',
        requireUpgrade: true,
      });
    }

    const docId = uuidv4();
    const filePath = req.file.path;
    // Multer encodes originalname as latin1; decode it back to UTF-8 for Vietnamese support
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

    res.json({
      docId,
      fileName: originalName,
      status: 'processing',
      message: 'File uploaded. Processing...'
    });

    // Persist to DB immediately (processing state)
    const userId = req.user.id;
    persistDocumentToDB(docId, userId, filePath, originalName, 'processing');

    // Process in background
    try {
      const extractedText = await processDocument(filePath);
      documents.set(docId, {
        id: docId,
        owner_id: userId,
        fileName: originalName,
        filePath,
        text: extractedText,
        status: 'ready',
        createdAt: new Date().toISOString()
      });
      persistDocumentToDB(docId, userId, filePath, originalName, 'ready', extractedText.length);
      logActivity(userId, 'documents_uploaded');
      console.log(`Document ${docId} processed successfully (${extractedText.length} chars)`);
    } catch (err) {
      documents.set(docId, {
        id: docId,
        fileName: originalName,
        filePath,
        text: '',
        status: 'error',
        error: err.message,
        createdAt: new Date().toISOString()
      });
      persistDocumentToDB(docId, userId, filePath, originalName, 'error', 0);
      console.error(`Document ${docId} processing failed:`, err.message);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ FOLDERS (WORKSPACES) ============

// Get all folders for user
app.get('/api/folders', requireAuth, (req, res) => {
  try {
    const folders = db.prepare('SELECT * FROM folders WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    res.json({ folders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create folder
app.post('/api/folders', requireAuth, (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Folder name is required' });
    const id = uuidv4();
    db.prepare('INSERT INTO folders (id, user_id, name, color) VALUES (?, ?, ?, ?)')
      .run(id, req.user.id, name, color || '#3b82f6');
    const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(id);
    res.json(folder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update folder
app.put('/api/folders/:id', requireAuth, (req, res) => {
  try {
    const { name, color } = req.body;
    // Check ownership
    const existing = db.prepare('SELECT * FROM folders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    db.prepare('UPDATE folders SET name = COALESCE(?, name), color = COALESCE(?, color), updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(name, color, req.params.id);
    const updated = db.prepare('SELECT * FROM folders WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete folder (cascade handled partially by foreign keys, but documents will just lose folder_id due to ON DELETE SET NULL)
app.delete('/api/folders/:id', requireAuth, (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM folders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    db.prepare('DELETE FROM folders WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Assign document to folder
app.put('/api/documents/:id/folder', requireAuth, (req, res) => {
  try {
    const { folder_id } = req.body; // Can be null to remove from folder

    // Check document ownership
    const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // If folder_id provided, check folder ownership
    if (folder_id) {
      const folder = db.prepare('SELECT * FROM folders WHERE id = ? AND user_id = ?').get(folder_id, req.user.id);
      if (!folder) {
        return res.status(404).json({ error: 'Folder not found' });
      }
    }

    db.prepare('UPDATE documents SET folder_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(folder_id || null, req.params.id);
    res.json({ success: true, folder_id: folder_id || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ DOCUMENTS ============

// Get document history (for logged-in users) — must be before :docId routes
app.get('/api/documents/history', optionalAuth, (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.json({ documents: [] });
    }
    const docs = db.prepare(`
      SELECT id, original_name, status, text_length, deleted_at, created_at, updated_at, folder_id
      FROM documents
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(userId);
    res.json({ documents: docs });
  } catch (error) {
    console.error('Error getting document history:', error.message);
    res.json({ documents: [] });
  }
});

// ==== SECURITY: Document access verification helper ====
function verifyDocumentAccess(docId, userId, userRole) {
  try {
    const doc = db.prepare('SELECT id, user_id FROM documents WHERE id = ?').get(docId);

    if (!doc) {
      return { allowed: false, status: 404, message: 'Document not found' };
    }

    // Admins can access all documents
    if (userRole === 'admin') {
      return { allowed: true };
    }

    // User must own the document
    if (doc.user_id !== userId) {
      return { allowed: false, status: 403, message: 'You do not have permission to access this document' };
    }

    return { allowed: true };
  } catch (err) {
    console.error('[Access] Error verifying document access:', err.message);
    return { allowed: false, status: 500, message: 'Internal server error' };
  }
}

function requireDocAccess(req, res, next) {
  const check = verifyDocumentAccess(req.params.docId, req.user.id, req.user.role);
  if (!check.allowed) return res.status(check.status).json({ error: check.message });
  next();
}

// Returns the in-memory doc, rebuilding it from the stored file if needed.
// Non-ready docs come back as { status } so callers can report "still processing".
async function loadDocument(docId) {
  const memDoc = documents.get(docId);
  if (memDoc) return memDoc;

  const row = db.prepare('SELECT id, user_id, file_path, original_name, status, deleted_at FROM documents WHERE id = ?').get(docId);
  if (!row || row.deleted_at || !row.file_path || !fs.existsSync(row.file_path)) return null;
  if (row.status !== 'ready') return { id: row.id, status: row.status };

  // ponytail: concurrent first requests may each re-extract; dedupe with a promise map if that shows up
  const text = await processDocument(row.file_path);
  const doc = {
    id: row.id,
    owner_id: row.user_id,
    fileName: row.original_name,
    filePath: row.file_path,
    text,
    status: 'ready',
    createdAt: new Date().toISOString(),
  };
  documents.set(row.id, doc);
  return doc;
}

// Get saved sessions for a document (history viewer)
app.get('/api/documents/:docId/sessions', requireAuth, requireDocAccess, (req, res) => {
  try {
    const docId = req.params.docId;

    const doc = db.prepare('SELECT id, user_id, original_name, status, text_length, deleted_at, created_at FROM documents WHERE id = ?').get(docId);

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const sessions = getAllDocumentSessions(docId);
    const isFileDeleted = !!doc.deleted_at || !documents.has(docId);

    res.json({
      document: {
        id: doc.id,
        originalName: doc.original_name,
        status: doc.status,
        textLength: doc.text_length,
        deletedAt: doc.deleted_at,
        createdAt: doc.created_at,
        isFileDeleted,
      },
      sessions,
    });
  } catch (error) {
    console.error('Error getting document sessions:', error.message);
    res.status(500).json({ error: 'Failed to load sessions' });
  }
});

// Check document status
app.get('/api/documents/:docId/status', (req, res) => {
  const doc = documents.get(req.params.docId);
  if (!doc) {
    return res.status(404).json({ error: 'Document not found' });
  }
  res.json({
    docId: doc.id,
    fileName: doc.fileName,
    status: doc.status,
    textLength: doc.text?.length || 0,
    error: doc.error
  });
});

// ==== SECURITY: Delete document requires authentication and ownership verification ====
app.delete('/api/documents/:docId', requireAuth, requireDocAccess, (req, res) => {
  try {
    const docId = req.params.docId;
    documents.delete(docId);
    // Soft delete; runDocumentCleanup purges the file
    db.prepare('UPDATE documents SET deleted_at = CURRENT_TIMESTAMP, is_public = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(docId);
    console.log(`[DELETE] Document ${docId} deleted by user ${req.user.id}`);
    res.json({ success: true, message: 'Document deleted successfully' });
  } catch (err) {
    console.error(`[DELETE] Error deleting document:`, err.message);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// ── Session persistence helpers ──
function saveDocumentSession(docId, sessionType, data) {
  try {
    db.prepare(`
      INSERT INTO document_sessions (document_id, session_type, data, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(document_id, session_type) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP
    `).run(docId, sessionType, JSON.stringify(data));
  } catch (err) {
    console.error(`[Session] Error saving ${sessionType} for ${docId}:`, err.message);
  }
}

function getDocumentSession(docId, sessionType) {
  try {
    const row = db.prepare('SELECT data FROM document_sessions WHERE document_id = ? AND session_type = ?').get(docId, sessionType);
    return row ? JSON.parse(row.data) : null;
  } catch (err) {
    console.error(`[Session] Error loading ${sessionType} for ${docId}:`, err.message);
    return null;
  }
}

function getAllDocumentSessions(docId) {
  try {
    const rows = db.prepare('SELECT session_type, data FROM document_sessions WHERE document_id = ?').all(docId);
    const sessions = {};
    for (const row of rows) {
      sessions[row.session_type] = JSON.parse(row.data);
    }
    return sessions;
  } catch (err) {
    console.error(`[Session] Error loading sessions for ${docId}:`, err.message);
    return {};
  }
}

// Download original document
app.get('/api/documents/:docId/download', requireAuth, requireDocAccess, async (req, res) => {
  try {
    const docId = req.params.docId;

    // First try to find it in memory to get originalName
    let originalName = 'document.txt';
    const memDoc = documents.get(docId);
    if (memDoc && memDoc.fileName) {
      originalName = memDoc.fileName;
    }

    // Always fetch from DB to get the true file path
    const dbDoc = db.prepare('SELECT file_path, original_name FROM documents WHERE id = ?').get(docId);

    if (!dbDoc || !dbDoc.file_path || !fs.existsSync(dbDoc.file_path)) {
      return res.status(404).json({ error: 'Tài liệu không còn tồn tại trên máy chủ' });
    }

    originalName = dbDoc.original_name || originalName;

    res.download(dbDoc.file_path, originalName, (err) => {
      if (err) {
        console.error(`[Download] Error downloading ${docId}:`, err.message);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Không thể tải xuống tệp' });
        }
      }
    });

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate mindmap
app.post('/api/documents/:docId/mindmap', requireAuth, requireDocAccess, async (req, res) => {
  try {
    const doc = await loadDocument(req.params.docId);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    if (doc.status !== 'ready') {
      return res.status(400).json({ error: 'Document is still processing' });
    }

    const language = resolveRequestLanguage(req, req.user?.id || null);
    const mindmap = await generateMindmap(doc.text, doc.fileName, {
      language,
      acceptLanguage: req.headers['accept-language'],
      userId: req.user?.id || null
    });
    saveDocumentSession(req.params.docId, 'mindmap', mindmap);
    broadcastDocEvent(req.params.docId, 'mindmap', mindmap);
    
    // Create notification for the document owner
    if (doc.owner_id) {
      const template = getNotificationTemplate(NOTIFICATION_TYPES.MINDMAP_READY, doc.fileName);
      if (template) {
        createNotification(doc.owner_id, NOTIFICATION_TYPES.MINDMAP_READY, template.title, template.message, {
          actionUrl: `/documents/${req.params.docId}`,
          icon: template.icon || 'mindmap',
          data: { docId: req.params.docId, fileName: doc.fileName },
        });
        broadcastNotifEvent(doc.owner_id, 'new_notification', { type: 'mindmap_ready', title: template.title });
      }
    }
    
    res.json(mindmap);
  } catch (error) {
    console.error('Mindmap generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate summary
app.post('/api/documents/:docId/summary', requireAuth, requireDocAccess, async (req, res) => {
  try {
    const doc = await loadDocument(req.params.docId);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    if (doc.status !== 'ready') {
      return res.status(400).json({ error: 'Document is still processing' });
    }

    const language = resolveRequestLanguage(req, req.user?.id || null);
    const summary = await generateSummary(doc.text, doc.fileName, {
      language,
      acceptLanguage: req.headers['accept-language'],
      userId: req.user?.id || null
    });
    saveDocumentSession(req.params.docId, 'summary', summary);
    broadcastDocEvent(req.params.docId, 'summary', summary);
    
    // Create notification for the document owner
    if (doc.owner_id) {
      const template = getNotificationTemplate(NOTIFICATION_TYPES.SUMMARY_READY, doc.fileName);
      if (template) {
        createNotification(doc.owner_id, NOTIFICATION_TYPES.SUMMARY_READY, template.title, template.message, {
          actionUrl: `/documents/${req.params.docId}`,
          icon: template.icon || 'summary',
          data: { docId: req.params.docId, fileName: doc.fileName },
        });
        broadcastNotifEvent(doc.owner_id, 'new_notification', { type: 'summary_ready', title: template.title });
      }
    }
    
    res.json({ summary });
  } catch (error) {
    console.error('Summary generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate flashcards
app.post('/api/documents/:docId/flashcards', requireAuth, requireDocAccess, async (req, res) => {
  try {
    const doc = await loadDocument(req.params.docId);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    if (doc.status !== 'ready') {
      return res.status(400).json({ error: 'Document is still processing' });
    }

    const language = resolveRequestLanguage(req, req.user?.id || null);
    const flashcards = await generateFlashcards(doc.text, doc.fileName, {
      language,
      acceptLanguage: req.headers['accept-language'],
      userId: req.user?.id || null
    });
    saveDocumentSession(req.params.docId, 'flashcards', flashcards);
    broadcastDocEvent(req.params.docId, 'flashcards', flashcards);
    
    // Create notification for the document owner
    if (doc.owner_id) {
      const template = getNotificationTemplate(NOTIFICATION_TYPES.FLASHCARDS_READY, doc.fileName);
      if (template) {
        createNotification(doc.owner_id, NOTIFICATION_TYPES.FLASHCARDS_READY, template.title, template.message, {
          actionUrl: `/documents/${req.params.docId}`,
          icon: template.icon || 'flashcard',
          data: { docId: req.params.docId, fileName: doc.fileName },
        });
        broadcastNotifEvent(doc.owner_id, 'new_notification', { type: 'flashcards_ready', title: template.title });
      }
    }
    
    res.json(flashcards);
  } catch (error) {
    console.error('Flashcard generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export flashcards as CSV
app.get('/api/documents/:docId/flashcards/export', requireAuth, requireDocAccess, async (req, res) => {
  try {

    // We get flashcards from the session storage
    const session = getDocumentSession(req.params.docId, 'flashcards');
    if (!session || !session.data) {
      return res.status(404).json({ error: 'No flashcards generated yet' });
    }

    const flashcards = session.data;

    // Convert to CSV string
    // Format: "Front","Back"
    let csv = '"Front","Back"\n';
    flashcards.forEach(card => {
      // Escape quotes by doubling them
      const front = card.front.replace(/"/g, '""');
      const back = card.back.replace(/"/g, '""');
      csv += `"${front}","${back}"\n`;
    });

    res.json({ csv });
  } catch (error) {
    console.error('Export flashcards error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get due flashcards for SRS
app.get('/api/documents/:docId/flashcards/due', requireAuth, requireDocAccess, (req, res) => {
  try {
    const dueCards = getDueFlashcards(req.user.id, req.params.docId);
    res.json({ dueCards });
  } catch (error) {
    console.error('Error fetching due flashcards:', error);
    res.status(500).json({ error: error.message });
  }
});

// Review a flashcard (SRS)
app.post('/api/documents/:docId/flashcards/:cardIdx/review', requireAuth, requireDocAccess, (req, res) => {
  try {
    const { difficulty, timeElapsedMs } = req.body;
    if (!['easy', 'good', 'hard', 'again'].includes(difficulty)) {
      return res.status(400).json({ error: 'Invalid difficulty level' });
    }

    // Usually flashcards are just stored as a JSON array in the session string.
    // We treat the cardIdx (index in the array) as the unique flashcardId for now, 
    // prefixed with docId to ensure global uniqueness in the metrics DB.
    const flashcardId = `${req.params.docId}-card-${req.params.cardIdx}`;

    const result = reviewFlashcard(req.user.id, req.params.docId, flashcardId, difficulty, timeElapsedMs);
    res.json(result);
  } catch (error) {
    console.error('Error reviewing flashcard:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate quiz
app.post('/api/documents/:docId/quiz', requireAuth, requireDocAccess, async (req, res) => {
  try {
    const doc = await loadDocument(req.params.docId);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    if (doc.status !== 'ready') {
      return res.status(400).json({ error: 'Document is still processing' });
    }

    const language = resolveRequestLanguage(req, req.user?.id || null);
    const quiz = await generateQuiz(doc.text, doc.fileName, {
      language,
      acceptLanguage: req.headers['accept-language'],
      userId: req.user?.id || null
    });
    saveDocumentSession(req.params.docId, 'quiz', quiz);
    broadcastDocEvent(req.params.docId, 'quiz', quiz);
    if (req.user && req.user.id) {
      logActivity(req.user.id, 'quizzes_completed');
    }
    
    // Create notification for the document owner
    const doc_data = doc;
    if (doc_data.owner_id) {
      const template = getNotificationTemplate(NOTIFICATION_TYPES.QUIZ_READY, doc_data.fileName);
      if (template) {
        createNotification(doc_data.owner_id, NOTIFICATION_TYPES.QUIZ_READY, template.title, template.message, {
          actionUrl: `/documents/${req.params.docId}`,
          icon: template.icon || 'quiz',
          data: { docId: req.params.docId, fileName: doc_data.fileName },
        });
        broadcastNotifEvent(doc_data.owner_id, 'new_notification', { type: 'quiz_ready', title: template.title });
      }
    }
    
    res.json(quiz);
  } catch (error) {
    console.error('Quiz generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Chat with document (plan-based message limit per document)
app.post('/api/documents/:docId/chat', requireAuth, requireDocAccess, async (req, res) => {
  try {
    const docId = req.params.docId;

    const doc = await loadDocument(docId);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    if (doc.status !== 'ready') {
      return res.status(400).json({ error: 'Document is still processing' });
    }

    const chatLimit = getChatLimit(req.user);

    // Initialise counter on first chat
    if (doc.chatCount === undefined) doc.chatCount = 0;

    if (chatLimit !== -1 && doc.chatCount >= chatLimit) {
      return res.status(429).json({
        error: `Đã đạt giới hạn ${chatLimit} tin nhắn cho tài liệu này. Nâng cấp gói để chat nhiều hơn!`,
        chatLimitReached: true,
        chatCount: doc.chatCount,
        chatLimit,
      });
    }

    const { message, history } = req.body;
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }
    if (message.length > 3000) {
      return res.status(400).json({ error: 'Message too long (max 3000 characters)' });
    }

    const language = resolveRequestLanguage(req, req.user.id);
    const reply = await chatWithDocument(doc.text, message, history || [], {
      language,
      acceptLanguage: req.headers['accept-language'],
      userId: req.user.id
    });
    doc.chatCount++;

    // Save chat session (last 50 messages)
    const chatHistory = [...(history || []), { role: 'user', content: message }, { role: 'assistant', content: reply }].slice(-50);
    saveDocumentSession(req.params.docId, 'chat', chatHistory);
    broadcastDocEvent(req.params.docId, 'chat', chatHistory);
    logActivity(req.user.id, 'chat_messages');

    res.json({ reply, chatCount: doc.chatCount, chatLimit });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==== SECURITY: Multi-document chat requires authentication ====
app.post('/api/chat/multi', requireAuth, async (req, res) => {
  try {
    const { docIds, message, history } = req.body;
    if (!docIds || !Array.isArray(docIds) || docIds.length === 0) {
      return res.status(400).json({ error: 'Array of docIds is required' });
    }
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }
    if (message.length > 3000) {
      return res.status(400).json({ error: 'Message too long (max 3000 characters)' });
    }

    // Verify all docs exist and are ready
    const docsToChat = [];
    if (docIds.length > 10) {
      return res.status(400).json({ error: 'Too many documents (max 10)' });
    }
    for (const id of docIds) {
      const access = verifyDocumentAccess(id, req.user.id, req.user.role);
      if (!access.allowed) {
        return res.status(access.status).json({ error: access.message });
      }
      const doc = await loadDocument(id);
      if (!doc) {
        return res.status(404).json({ error: `Document ${id} not found` });
      }
      if (doc.status !== 'ready') {
        return res.status(400).json({ error: `Document ${doc.fileName} is still processing` });
      }
      docsToChat.push(doc);
    }

    const language = resolveRequestLanguage(req, req.user.id);
    const reply = await chatWithMultipleDocuments(docsToChat, message, history || [], {
      language,
      acceptLanguage: req.headers['accept-language'],
      userId: req.user.id
    });

    // We don't save multi-chat history to a single document's session for now,
    // as it spans multiple documents. The client will hold the state.
    res.json({ reply });
  } catch (error) {
    console.error('Multi-chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Rate limit status
app.get('/api/rate-limit', optionalAuth, (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const userId = req.user?.id || null;
  const limit = getUploadLimit(req.user);
  const used = getUploadCount(userId, ip);
  const uploadsRemaining = limit === -1 ? 999 : Math.max(0, limit - used);
  const chatLimitVal = getChatLimit(req.user);

  res.json({
    uploadLimit: limit === -1 ? '∞' : limit,
    uploadsRemaining: limit === -1 ? 999 : uploadsRemaining,
    chatLimit: chatLimitVal === -1 ? '∞' : chatLimitVal,
    isGuest: !req.user,
    isUnlimited: limit === -1,
    plan: req.user?.plan || 'guest',
    planLabel: req.user?.planLabel || 'Guest',
  });
});

// Feature routes - all advanced features (chat history, favorites, tags, search, analytics, sharing, spaced repetition, exports, sync, preferences)
app.use('/api', featureRoutes);

// Notification routes
app.use('/api/notifications', notificationRoutes);

// SSE: notification stream for authenticated users (token via query param since EventSource can't set headers)
app.get('/api/notifications/stream', (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(401).json({ error: 'Token required' });
  
  const decoded = verifyToken(token);
  if (!decoded || getUserById(decoded.id)?.isBanned !== false) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  const userId = decoded.id;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`event: connected\ndata: ${JSON.stringify({ userId })}\n\n`);

  addNotifListener(userId, res);
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { /* gone */ }
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeNotifListener(userId, res);
  });
});

// Admin notification routes
app.get('/api/admin/notifications', requireAuth, requireAdmin, (req, res) => {
  try {
    const { limit = 50, offset = 0, userId, type, search } = req.query;
    const result = getAllNotifications({
      limit: Math.min(parseInt(limit) || 50, 200),
      offset: parseInt(offset) || 0,
      userId: userId ? parseInt(userId) : null,
      type: type || null,
      search: search || null,
    });
    res.json(result);
  } catch (error) {
    console.error('Admin get notifications error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

app.get('/api/admin/notifications/stats', requireAuth, requireAdmin, (req, res) => {
  try {
    const stats = getNotificationStats();
    res.json(stats);
  } catch (error) {
    console.error('Admin notification stats error:', error);
    res.status(500).json({ error: 'Failed to fetch notification stats' });
  }
});

app.post('/api/admin/notifications/send', requireAuth, requireAdmin, (req, res) => {
  try {
    const { userIds, title, message, type, icon, actionUrl } = req.body;
    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' });
    }

    const targetType = type || 'admin_message';
    const targetIcon = icon || 'admin';

    if (userIds && Array.isArray(userIds) && userIds.length > 0) {
      createBulkNotifications(userIds, targetType, title, message, {
        icon: targetIcon, actionUrl: actionUrl || null, data: { sentBy: req.user.username },
      });
      for (const uid of userIds) {
        broadcastNotifEvent(uid, 'new_notification', { type: targetType, title, message });
      }
      res.json({ success: true, sentTo: userIds.length });
    } else {
      // Send to all users
      const allUsers = db.prepare('SELECT id FROM users WHERE is_banned = 0').all();
      const allIds = allUsers.map(u => u.id);
      createBulkNotifications(allIds, targetType, title, message, {
        icon: targetIcon, actionUrl: actionUrl || null, data: { sentBy: req.user.username },
      });
      for (const uid of allIds) {
        broadcastNotifEvent(uid, 'new_notification', { type: targetType, title, message });
      }
      res.json({ success: true, sentTo: allIds.length });
    }
  } catch (error) {
    console.error('Admin send notification error:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

app.delete('/api/admin/notifications/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const stmt = db.prepare('DELETE FROM notifications WHERE id = ?');
    const result = stmt.run(id);
    res.json({ success: result.changes > 0 });
  } catch (error) {
    console.error('Admin delete notification error:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

app.post('/api/admin/notifications/cleanup', requireAuth, requireAdmin, (req, res) => {
  try {
    const { daysOld = 30 } = req.body;
    const count = cleanupOldNotifications(parseInt(daysOld) || 30);
    res.json({ success: true, deleted: count });
  } catch (error) {
    console.error('Admin cleanup notifications error:', error);
    res.status(500).json({ error: 'Failed to cleanup notifications' });
  }
});

// ============ EMAIL TRACKING ROUTES ============

// Email open tracking pixel (public, no auth required)
app.get('/api/email/track/:trackingId', (req, res) => {
  const { trackingId } = req.params;
  const userAgent = req.get('User-Agent');
  const ip = getClientIp(req);

  // Track the email open
  trackEmailOpen(trackingId, userAgent, ip);

  // Return 1x1 transparent GIF
  const pixel = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
  );

  res.set({
    'Content-Type': 'image/gif',
    'Content-Length': pixel.length,
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  });

  res.send(pixel);
});

// Get email tracking stats (admin only)
app.get('/api/email/stats', requireAuth, requireAdmin, (req, res) => {
  try {
    const stats = getEmailStats();
    if (!stats) {
      return res.status(500).json({ error: 'Failed to get email stats' });
    }
    res.json(stats);
  } catch (error) {
    console.error('Email stats error:', error);
    res.status(500).json({ error: 'Failed to get email stats' });
  }
});

// Get email tracking stats by date range (admin only)
app.get('/api/email/stats/range', requireAuth, requireAdmin, (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date required' });
    }

    const stats = getEmailStatsDateRange(startDate, endDate);
    if (!stats) {
      return res.status(500).json({ error: 'Failed to get email stats' });
    }
    res.json(stats);
  } catch (error) {
    console.error('Email stats range error:', error);
    res.status(500).json({ error: 'Failed to get email stats' });
  }
});

// Stats & Leaderboard routes
app.use('/api', statsRoutes);

// ── Share helper: validate token & ensure doc is in memory ──
async function resolveSharedDocument(shareToken) {
  const share = validateShareToken(shareToken);
  if (!share) return { error: 'Link chia sẻ không hợp lệ hoặc đã hết hạn', status: 403 };

  const docId = share.document_id;

  const doc = await loadDocument(docId);
  if (!doc || doc.status !== 'ready') {
    return { error: 'Tài liệu không còn tồn tại hoặc đã hết hạn', status: 404 };
  }
  return { share, doc };
}

// ── SSE endpoint: live updates for shared document viewers ──
app.get('/api/shared/:shareToken/events', async (req, res) => {
  try {
    const share = validateShareToken(req.params.shareToken);
    if (!share) {
      return res.status(403).json({ error: 'Link chia sẻ không hợp lệ hoặc đã hết hạn' });
    }

    const docId = share.document_id;

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // disable nginx buffering
    });

    // Send initial heartbeat
    res.write(`event: connected\ndata: {"documentId":"${docId}"}\n\n`);

    // Register listener
    addDocListener(docId, res);

    // Heartbeat every 30s to keep connection alive
    const heartbeat = setInterval(() => {
      try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
    }, 30000);

    // Cleanup on disconnect
    req.on('close', () => {
      clearInterval(heartbeat);
      removeDocListener(docId, res);
    });
  } catch (error) {
    console.error('[SSE] Error:', error.message);
    if (!res.headersSent) res.status(500).json({ error: 'SSE connection failed' });
  }
});

// Shared document content endpoint (public — token validated)
app.get('/api/shared/:shareToken/content', async (req, res) => {
  try {
    const result = await resolveSharedDocument(req.params.shareToken);
    if (result.error) return res.status(result.status).json({ error: result.error });

    const { share, doc } = result;

    // Load pre-existing session data (mindmap, flashcards, chat)
    const sessions = getAllDocumentSessions(share.document_id);

    res.json({
      documentId: doc.id,
      fileName: doc.fileName || share.original_name,
      text: doc.text,
      shareType: share.share_type,
      status: doc.status,
      sessions: {
        mindmap: sessions.mindmap || null,
        flashcards: sessions.flashcards || null,
        chat: sessions.chat || null,
      }
    });
  } catch (error) {
    console.error('[Share] Error getting content:', error.message);
    res.status(500).json({ error: 'Lỗi khi tải tài liệu chia sẻ' });
  }
});

// Shared document — generate mindmap (public — token validated, not for view-only)
app.post('/api/shared/:shareToken/mindmap', async (req, res) => {
  try {
    const result = await resolveSharedDocument(req.params.shareToken);
    if (result.error) return res.status(result.status).json({ error: result.error });
    if (result.share.share_type === 'view') {
      return res.status(403).json({ error: 'Quyền chỉ xem không cho phép tạo nội dung mới' });
    }

    const { share, doc } = result;
    const language = resolveRequestLanguage(req, null);
    const mindmap = await generateMindmap(doc.text, doc.fileName, {
      language,
      acceptLanguage: req.headers['accept-language']
    });
    saveDocumentSession(share.document_id, 'mindmap', mindmap);
    broadcastDocEvent(share.document_id, 'mindmap', mindmap);
    res.json(mindmap);
  } catch (error) {
    console.error('[Share] Mindmap generation error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Shared document — generate summary (public — token validated, not for view-only)
app.post('/api/shared/:shareToken/summary', async (req, res) => {
  try {
    const result = await resolveSharedDocument(req.params.shareToken);
    if (result.error) return res.status(result.status).json({ error: result.error });
    if (result.share.share_type === 'view') {
      return res.status(403).json({ error: 'Quyền chỉ xem không cho phép tạo nội dung mới' });
    }

    const { share, doc } = result;
    const language = resolveRequestLanguage(req, null);
    const summary = await generateSummary(doc.text, doc.fileName, {
      language,
      acceptLanguage: req.headers['accept-language']
    });
    saveDocumentSession(share.document_id, 'summary', summary);
    broadcastDocEvent(share.document_id, 'summary', summary);
    res.json({ summary });
  } catch (error) {
    console.error('[Share] Summary generation error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Shared document — generate flashcards (public — token validated, not for view-only)
app.post('/api/shared/:shareToken/flashcards', async (req, res) => {
  try {
    const result = await resolveSharedDocument(req.params.shareToken);
    if (result.error) return res.status(result.status).json({ error: result.error });
    if (result.share.share_type === 'view') {
      return res.status(403).json({ error: 'Quyền chỉ xem không cho phép tạo nội dung mới' });
    }

    const { share, doc } = result;
    const language = resolveRequestLanguage(req, null);
    const flashcards = await generateFlashcards(doc.text, doc.fileName, {
      language,
      acceptLanguage: req.headers['accept-language']
    });
    saveDocumentSession(share.document_id, 'flashcards', flashcards);
    broadcastDocEvent(share.document_id, 'flashcards', flashcards);
    res.json(flashcards);
  } catch (error) {
    console.error('[Share] Flashcard generation error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Shared document — chat (public — token validated, not for view-only)
app.post('/api/shared/:shareToken/chat', async (req, res) => {
  try {
    const result = await resolveSharedDocument(req.params.shareToken);
    if (result.error) return res.status(result.status).json({ error: result.error });
    if (result.share.share_type === 'view') {
      return res.status(403).json({ error: 'Quyền chỉ xem không cho phép chat' });
    }
    const { share, doc } = result;
    const { message, history } = req.body;
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }
    if (message.length > 3000) {
      return res.status(400).json({ error: 'Message too long (max 3000 characters)' });
    }

    // Initialise counter on first chat
    if (doc.chatCount === undefined) doc.chatCount = 0;

    // Shared documents: allow up to 20 messages
    const shareLimit = 20;
    if (doc.chatCount >= shareLimit) {
      return res.status(429).json({
        error: `Đã đạt giới hạn ${shareLimit} tin nhắn cho tài liệu chia sẻ.`,
        chatLimitReached: true,
        chatCount: doc.chatCount,
        chatLimit: shareLimit,
      });
    }

    const language = resolveRequestLanguage(req, null);
    const reply = await chatWithDocument(doc.text, message, history || [], {
      language,
      acceptLanguage: req.headers['accept-language']
    });
    doc.chatCount++;

    // Broadcast chat update to other viewers
    const shareChatHistory = [...(history || []), { role: 'user', content: message }, { role: 'assistant', content: reply }].slice(-50);
    saveDocumentSession(share.document_id, 'chat', shareChatHistory);
    broadcastDocEvent(share.document_id, 'chat', shareChatHistory);

    res.json({ reply, chatCount: doc.chatCount, chatLimit: shareLimit });
  } catch (error) {
    console.error('[Share] Chat error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============ COMMUNITY / PUBLIC HUB ============

// Public user profile
app.get('/api/users/profile/:username', async (req, res) => {
  try {
    const user = db.prepare(`
      SELECT id, username, display_name, avatar_url, plan, role, created_at, last_login_at, presence_status, presence_visible, show_plan_badge
      FROM users WHERE username = ? AND is_banned = 0
    `).get(req.params.username);

    if (!user) {
      return res.status(404).json({ error: 'Người dùng không tồn tại' });
    }

    // Public documents count
    const docStats = db.prepare(`
      SELECT COUNT(*) as public_docs FROM documents WHERE user_id = ? AND is_public = 1 AND status = 'ready'
    `).get(user.id);

    // Activity stats
    const activity = db.prepare(`
      SELECT
        COALESCE(SUM(documents_uploaded), 0) as total_documents,
        COALESCE(SUM(flashcards_reviewed), 0) as total_flashcards,
        COALESCE(SUM(quizzes_completed), 0) as total_quizzes,
        COALESCE(SUM(chat_messages), 0) as total_chats
      FROM daily_activity WHERE user_id = ?
    `).get(user.id);

    // Streak
    const streak = db.prepare('SELECT current_streak, longest_streak FROM user_streaks WHERE user_id = ?').get(user.id);

    // Recent public documents
    const recentDocs = db.prepare(`
      SELECT id, original_name as title, created_at
      FROM documents WHERE user_id = ? AND is_public = 1 AND status = 'ready'
      ORDER BY created_at DESC LIMIT 10
    `).all(user.id);


    const ONLINE_WINDOW_MS = 60 * 1000;
    const toUtcMs = (value) => {
      if (!value) return NaN;
      const normalized = value.includes('T')
        ? (value.endsWith('Z') ? value : `${value}Z`)
        : `${value.replace(' ', 'T')}Z`;
      return new Date(normalized).getTime();
    };
    const rawStatus = ['online', 'idle', 'dnd', 'invisible'].includes(user.presence_status)
      ? user.presence_status
      : 'online';
    const lastSeenMs = toUtcMs(user.last_login_at);
    const lastSeenAt = Number.isNaN(lastSeenMs) ? null : new Date(lastSeenMs).toISOString();
    const hasRecentHeartbeat = !!(lastSeenAt && (Date.now() - lastSeenMs) <= ONLINE_WINDOW_MS);
    let presenceStatus = 'offline';
    if (rawStatus !== 'invisible' && user.presence_visible !== 0 && hasRecentHeartbeat) {
      presenceStatus = rawStatus;
    }
    const isOnline = presenceStatus === 'online' || presenceStatus === 'idle' || presenceStatus === 'dnd';

    res.json({
      user: {
        username: user.username,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        plan: user.plan,
        showPlanBadge: user.show_plan_badge !== 0,
        role: user.role || 'user',
        isVerified: user.role === 'admin',
        joinedAt: user.created_at,
        lastSeenAt,
        isOnline,
        presenceStatus,
      },
      stats: {
        publicDocs: docStats.public_docs,
        totalDocuments: activity.total_documents,
        totalFlashcards: activity.total_flashcards,
        totalQuizzes: activity.total_quizzes,
        totalChats: activity.total_chats,
        currentStreak: streak?.current_streak || 0,
        longestStreak: streak?.longest_streak || 0,
      },
      recentDocs,
    });
  } catch (error) {
    console.error('[PublicProfile] Error:', error.message);
    res.status(500).json({ error: 'Lỗi khi tải thông tin người dùng' });
  }
});

app.get('/api/community/documents', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const offset = (page - 1) * limit;

    const query = `
      SELECT d.id, d.original_name as title, d.created_at, u.display_name as author, u.username as author_username, u.avatar_url as author_avatar
      FROM documents d
      JOIN users u ON d.user_id = u.id
      WHERE d.is_public = 1 AND d.status = 'ready' AND d.deleted_at IS NULL AND u.is_banned = 0
      ORDER BY d.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const publicDocs = db.prepare(query).all(limit, offset);

    res.json({ documents: publicDocs });
  } catch (error) {
    console.error('[Community] Error fetching public documents:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Fetch a single public document's content and sessions
app.get('/api/public/documents/:id/content', async (req, res) => {
  try {
    const docQuery = db.prepare('SELECT id, original_name, status FROM documents WHERE id = ? AND is_public = 1 AND deleted_at IS NULL').get(req.params.id);

    if (!docQuery) {
      return res.status(404).json({ error: 'Tài liệu không tồn tại hoặc không được chia sẻ công khai.' });
    }

    let docText = '';
    try {
      docText = (await loadDocument(docQuery.id))?.text || '';
    } catch (e) {
      console.error('Failed to process public document text:', e.message);
    }

    // Load pre-existing session data
    const sessions = getAllDocumentSessions(docQuery.id);

    res.json({
      documentId: docQuery.id,
      fileName: docQuery.original_name,
      text: docText,
      shareType: 'view', // Always read-only for public community docs
      status: docQuery.status,
      sessions: {
        mindmap: sessions.mindmap || null,
        flashcards: sessions.flashcards || null,
        chat: sessions.chat || null,
      }
    });
  } catch (error) {
    console.error('[Public] Error getting public content:', error.message);
    res.status(500).json({ error: 'Lỗi khi tải tài liệu công khai.' });
  }
});

app.put('/api/documents/:id/public', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_public } = req.body;

    const docInfo = db.prepare('SELECT user_id, original_name, deleted_at FROM documents WHERE id = ?').get(id);

    if (!docInfo || docInfo.deleted_at) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (docInfo.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    db.prepare('UPDATE documents SET is_public = ? WHERE id = ?').run(is_public ? 1 : 0, id);

    // Create notification when document is published
    if (is_public) {
      const template = getNotificationTemplate(NOTIFICATION_TYPES.DOCUMENT_PUBLISHED, docInfo.original_name);
      if (template) {
        createNotification(req.user.id, NOTIFICATION_TYPES.DOCUMENT_PUBLISHED, template.title, template.message, {
          actionUrl: `/documents/${id}`,
          icon: template.icon || 'globe',
          data: { docId: id, fileName: docInfo.original_name },
        });
        broadcastNotifEvent(req.user.id, 'new_notification', { type: 'document_published', title: template.title });
      }
    }

    res.json({ success: true, is_public: !!is_public });
  } catch (error) {
    console.error('Error updating document public status:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============ ANALYTICS ============

// Get user analytics and metrics
app.get('/api/analytics', requireAuth, (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days) || 7, 1), 365);

    // Total documents viewed / created
    const docs = db.prepare('SELECT COUNT(*) as count FROM documents WHERE user_id = ? AND status = ?').get(req.user.id, 'ready');

    // For interactions, we can use the activity_logs table if it exists, otherwise we'll estimate from chat history and flashcard reviews.
    // Let's create an aggregated view based on existing tables

    const chats = db.prepare("SELECT COUNT(*) as count FROM chat_history WHERE user_id = ? AND timestamp >= datetime('now', ?)").get(req.user.id, `-${days} days`);
    const flashcards = db.prepare("SELECT COUNT(*) as count FROM flashcard_reviews WHERE user_id = ? AND review_date >= datetime('now', ?)").get(req.user.id, `-${days} days`);

    // Top documents by chat interactions
    const topDocuments = db.prepare(`
      SELECT d.original_name as title, COUNT(c.id) as interactions
      FROM documents d
      LEFT JOIN chat_history c ON d.id = c.document_id
      WHERE d.user_id = ? AND c.timestamp >= datetime('now', ?)
      GROUP BY d.id
      ORDER BY interactions DESC
      LIMIT 5
    `).all(req.user.id, `-${days} days`);

    // Weekly activity (last 7 days by default)
    const weeklyActivity = db.prepare(`
      SELECT date(timestamp) as day, COUNT(*) as interactions
      FROM chat_history
      WHERE user_id = ? AND timestamp >= datetime('now', ?)
      GROUP BY date(timestamp)
      ORDER BY date(timestamp) ASC
    `).all(req.user.id, `-${days} days`);


    res.json({
      documentsViewed: docs.count || 0,
      chatInteractions: chats.count || 0,
      flashcardsReviewed: flashcards.count || 0,
      totalActions: (chats.count || 0) + (flashcards.count || 0),
      topDocuments: topDocuments || [],
      weeklyActivity: weeklyActivity || []
    });
  } catch (error) {
    console.error('[Analytics] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint (required by Docker)
app.get('/health', (req, res) => {
  const stats = getDatabaseStats();
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: stats || { users: 0, documents: 0, uploads: 0, totalSize: 0 }
  });
});

// Seed default admin account
ensureAdmin();

// Initialize notifications table
initNotificationsTable();

// Initialize enhanced feature tables (chat history, favorites, tags, etc.)
initializeEnhancedTables();

// Initialize database indexes for performance (after tables are created)
setTimeout(() => {
  initializeIndexes();
}, 100);

// ── Auto-cleanup: soft-delete documents older than 7 days, purge files for deleted docs ──
function runDocumentCleanup() {
  try {

    // 1. Soft-delete: mark documents older than 7 days that haven't been deleted yet
    const softDeleted = db.prepare(`
      UPDATE documents
      SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE deleted_at IS NULL
        AND created_at <= datetime('now', '-7 days')
    `).run();
    if (softDeleted.changes > 0) {
      logger.info(`[Cleanup] Soft-deleted ${softDeleted.changes} documents older than 7 days`);
    }

    // 2. Purge uploaded files for soft-deleted documents (file_path still set)
    const toClean = db.prepare(`
      SELECT id, file_path FROM documents
      WHERE deleted_at IS NOT NULL AND file_path IS NOT NULL
    `).all();

    for (const doc of toClean) {
      if (doc.file_path) {
        fs.unlink(doc.file_path, (err) => {
          if (err && err.code !== 'ENOENT') {
            console.error(`[Cleanup] Failed to delete file ${doc.file_path}:`, err.message);
          }
        });
      }
      // Clear file_path so we don't try again
      db.prepare('UPDATE documents SET file_path = NULL WHERE id = ?').run(doc.id);
    }
    if (toClean.length > 0) {
      logger.info(`[Cleanup] Purged files for ${toClean.length} deleted documents`);
    }

    // 3. Also evict from in-memory map if expired (7 days)
    for (const [docId, memDoc] of documents.entries()) {
      const age = Date.now() - new Date(memDoc.createdAt).getTime();
      if (age > 7 * 24 * 60 * 60 * 1000) {
        documents.delete(docId);
      }
    }

  } catch (err) {
    console.error('[Cleanup] Error:', err.message);
  }
}

// Run cleanup on startup then every 30 minutes
setTimeout(runDocumentCleanup, 5000);
setInterval(runDocumentCleanup, 30 * 60 * 1000);

// ── Payment: Cleanup expired orders every 5 minutes ──
setInterval(cleanupExpiredOrders, 5 * 60 * 1000);

// ── Payment Routes ──

// Create payment order
app.post('/api/payment/orders', requireAuth, (req, res) => {
  try {
    const { plan } = req.body;
    if (!plan || !PLAN_PRICES[plan]) {
      return res.status(400).json({ error: 'Gói không hợp lệ' });
    }
    const order = createPaymentOrder(req.user.id, plan);
    res.json({ order });
  } catch (error) {
    console.error('[Payment] Create order error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Create checkout session (SePay PG)
app.post('/api/payment/checkout', requireAuth, (req, res) => {
  try {
    const { plan } = req.body;
    if (!plan || !PLAN_PRICES[plan]) {
      return res.status(400).json({ error: 'Gói không hợp lệ' });
    }
    const session = createCheckoutSession(req.user.id, plan);
    res.json(session);
  } catch (error) {
    console.error('[Payment] Checkout error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Check order status (polling)
app.get('/api/payment/orders/:orderId', requireAuth, async (req, res) => {
  try {
    const order = await checkOrderStatus(req.params.orderId, req.user.id);
    if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
    res.json({ order });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user payment history
app.get('/api/payment/history', requireAuth, (req, res) => {
  try {
    const history = getUserPaymentHistory(req.user.id);
    res.json({ history });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get plan prices
app.get('/api/payment/prices', (req, res) => {
  res.json({ prices: PLAN_PRICES });
});

// SePay PG IPN (Instant Payment Notification) — hosted checkout flow
app.post('/api/payment/ipn/sepay', async (req, res) => {
  try {
    logger.info(`[Payment] IPN received from ${req.ip}, body: ${JSON.stringify(req.body).substring(0, 500)}`);

    const result = await processSePayPgIPN(req.body);
    logger.info('[Payment] IPN processed:', result);

    // SePay PG expects 200 OK
    res.json({ success: true });
  } catch (error) {
    console.error('[Payment] IPN error:', error.message);
    res.json({ success: false });
  }
});

// SePay webhook (legacy bank transfer flow)
app.post('/api/payment/webhook/sepay', (req, res) => {
  try {
    const authHeader = req.headers['authorization'] || '';
    logger.info(`[Payment] Webhook received from ${req.ip}, body keys: ${Object.keys(req.body || {}).join(',')}`);

    if (!verifySepayWebhook(authHeader)) {
      logger.warn('[Payment] Invalid webhook API key');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = processSepayWebhook(req.body);
    logger.info('[Payment] Webhook processed:', result);

    res.json({ success: true });
  } catch (error) {
    console.error('[Payment] Webhook error:', error.message);
    res.json({ success: false });
  }
});

// Admin: get recent payments
app.get('/api/admin/payments', requireAuth, requireAdmin, (req, res) => {
  try {
    const payments = getRecentPayments(Math.min(Number(req.query.limit) || 50, 500));
    res.json({ payments });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// SPA fallback — serve index.html for any non-API route (production)
if (fs.existsSync(publicDir)) {
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  logger.info(`🚀 NoteMinds server running on http://localhost:${PORT} [${NODE_ENV}]`);
  const stats = getDatabaseStats();
  if (stats) {
    logger.info(`Database stats: Users=${stats.users}, Documents=${stats.documents}, Uploads=${stats.uploads}`);
  }
});
