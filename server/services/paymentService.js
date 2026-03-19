import crypto from 'crypto';
import { SePayPgClient } from 'sepay-pg-node';
import db from './database.js';
import { setUserPlan } from './authService.js';
import { logger } from './logger.js';
import { createNotification, NOTIFICATION_TYPES, getNotificationTemplate } from './notificationService.js';
import './envLoader.js';

// ── SePay Configuration ──
const SEPAY_API_KEY = process.env.SEPAY_API_KEY || '';
const SEPAY_BANK_ACCOUNT = process.env.SEPAY_BANK_ACCOUNT || '';
const SEPAY_BANK_NAME = process.env.SEPAY_BANK_NAME || 'MB Bank';
const SEPAY_ACCOUNT_NAME = process.env.SEPAY_ACCOUNT_NAME || '';

// ── SePay Payment Gateway SDK ──
const SEPAY_MERCHANT_ID = process.env.SEPAY_MERCHANT_ID || '';
const SEPAY_SECRET_KEY = process.env.SEPAY_SECRET_KEY || '';
const SEPAY_PG_ENV = process.env.SEPAY_PG_ENV || 'production';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://notemind.tech';

let sepayClient = null;
if (SEPAY_MERCHANT_ID && SEPAY_SECRET_KEY) {
  sepayClient = new SePayPgClient({
    env: SEPAY_PG_ENV,
    merchant_id: SEPAY_MERCHANT_ID,
    secret_key: SEPAY_SECRET_KEY,
  });
  logger.info('[Payment] SePay PG client initialized');
} else {
  logger.warn('[Payment] SEPAY_MERCHANT_ID or SEPAY_SECRET_KEY not set — checkout disabled');
}

// Plan prices in VND
export const PLAN_PRICES = {
  basic: 2000,
  pro: 99000,
  unlimited: 199000,
};

// ── Database tables ──
db.exec(`
  CREATE TABLE IF NOT EXISTS payment_orders (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    plan TEXT NOT NULL,
    amount INTEGER NOT NULL,
    transfer_content TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    paid_at TEXT,
    expired_at TEXT,
    sepay_transaction_id TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS payment_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    order_id TEXT,
    plan TEXT NOT NULL,
    amount INTEGER NOT NULL,
    type TEXT DEFAULT 'upgrade',
    note TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (order_id) REFERENCES payment_orders(id)
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status);
  CREATE INDEX IF NOT EXISTS idx_payment_orders_transfer ON payment_orders(transfer_content);
  CREATE INDEX IF NOT EXISTS idx_payment_history_user ON payment_history(user_id);
`);

// ── Generate unique transfer content ──
// Format: NM<random8> — matches SePay content pattern
function generateTransferContent() {
  const random = crypto.randomInt(10000000, 99999999);
  return `NM${random}`;
}

// ── Create payment order ──
export function createPaymentOrder(userId, plan) {
  if (!PLAN_PRICES[plan]) {
    throw new Error(`Plan "${plan}" không hợp lệ hoặc miễn phí`);
  }

  // Cancel any existing pending orders for this user
  db.prepare(`
    UPDATE payment_orders SET status = 'cancelled' 
    WHERE user_id = ? AND status = 'pending'
  `).run(userId);

  const id = crypto.randomUUID();
  const amount = PLAN_PRICES[plan];
  const transferContent = generateTransferContent();
  // Order expires in 30 minutes
  const expiredAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO payment_orders (id, user_id, plan, amount, transfer_content, expired_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, userId, plan, amount, transferContent, expiredAt);

  return {
    id,
    plan,
    amount,
    transferContent,
    expiredAt,
    bankAccount: SEPAY_BANK_ACCOUNT,
    bankName: SEPAY_BANK_NAME,
    accountName: SEPAY_ACCOUNT_NAME,
    qrUrl: buildQrUrl(amount, transferContent),
  };
}

// ── Build SePay QR URL ──
function buildQrUrl(amount, content) {
  if (!SEPAY_BANK_ACCOUNT || !SEPAY_BANK_NAME) return null;
  return `https://qr.sepay.vn/img?bank=${encodeURIComponent(SEPAY_BANK_NAME)}&acc=${encodeURIComponent(SEPAY_BANK_ACCOUNT)}&template=compact&amount=${amount}&des=${encodeURIComponent(content)}`;
}

// ── Create checkout session (SePay PG SDK) ──
export function createCheckoutSession(userId, plan) {
  if (!sepayClient) {
    throw new Error('SePay Payment Gateway chưa được cấu hình');
  }
  if (!PLAN_PRICES[plan]) {
    throw new Error(`Plan "${plan}" không hợp lệ`);
  }

  // Cancel existing pending orders
  db.prepare(`UPDATE payment_orders SET status = 'cancelled' WHERE user_id = ? AND status = 'pending'`).run(userId);

  const id = crypto.randomUUID();
  const amount = PLAN_PRICES[plan];
  const transferContent = generateTransferContent();
  const expiredAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO payment_orders (id, user_id, plan, amount, transfer_content, expired_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, userId, plan, amount, transferContent, expiredAt);

  const planLabels = { basic: 'Basic', pro: 'Pro', unlimited: 'Unlimited' };
  const checkoutUrl = sepayClient.checkout.initCheckoutUrl();
  const formFields = sepayClient.checkout.initOneTimePaymentFields({
    payment_method: 'BANK_TRANSFER',
    order_invoice_number: id,
    order_amount: amount,
    currency: 'VND',
    order_description: `Nang cap NoteMind ${planLabels[plan]} - ${transferContent}`,
    success_url: `${FRONTEND_URL}/?payment_status=success&order_id=${id}`,
    error_url: `${FRONTEND_URL}/?payment_status=error&order_id=${id}`,
    cancel_url: `${FRONTEND_URL}/?payment_status=cancel&order_id=${id}`,
  });

  logger.info(`[Payment] Checkout session created: order=${id}, plan=${plan}, amount=${amount}`);

  return {
    orderId: id,
    checkoutUrl,
    formFields,
    amount,
    plan,
  };
}

// ── Get order by ID ──
export function getOrderById(orderId) {
  return db.prepare('SELECT * FROM payment_orders WHERE id = ?').get(orderId);
}

// ── Get order by transfer content ──
export function getOrderByTransferContent(content) {
  return db.prepare(`
    SELECT * FROM payment_orders 
    WHERE transfer_content = ? AND status = 'pending'
  `).get(content);
}

// ── Check order status ──
export async function checkOrderStatus(orderId, userId) {
  const order = db.prepare(`
    SELECT * FROM payment_orders WHERE id = ? AND user_id = ?
  `).get(orderId, userId);

  if (!order) return null;

  // Auto-expire if past deadline and still pending
  if (order.status === 'pending' && new Date(order.expired_at) < new Date()) {
    db.prepare(`UPDATE payment_orders SET status = 'expired' WHERE id = ?`).run(orderId);
    return { ...order, status: 'expired' };
  }

  // Fallback: if still pending, try to verify via SePay API
  if (order.status === 'pending' && sepayClient) {
    try {
      const apiOrder = await sepayClient.order.retrieve(orderId);
      const apiStatus = (apiOrder?.order_status || apiOrder?.data?.order_status || '').toUpperCase();
      logger.info(`[Payment] API fallback check: order=${orderId}, apiStatus=${apiStatus}`);
      if (apiStatus === 'CAPTURED' || apiStatus === 'COMPLETED' || apiStatus === 'PAID') {
        const transactionId = String(apiOrder?.transaction_id || apiOrder?.data?.transaction_id || apiOrder?.order_id || '');
        const result = confirmPaymentById(orderId, transactionId);
        if (result) {
          return { ...order, status: 'paid' };
        }
      }
    } catch (err) {
      logger.debug(`[Payment] API fallback check failed for ${orderId}: ${err.message}`);
    }
  }

  return order;
}

// ── Confirm payment (called by webhook) ──
export function confirmPayment(transferContent, transactionId) {
  const order = getOrderByTransferContent(transferContent);
  if (!order) {
    logger.warn(`[Payment] No pending order found for transfer: ${transferContent}`);
    return null;
  }

  // Check if expired
  if (new Date(order.expired_at) < new Date()) {
    db.prepare(`UPDATE payment_orders SET status = 'expired' WHERE id = ?`).run(order.id);
    logger.warn(`[Payment] Order ${order.id} expired`);
    return null;
  }

  // Mark as paid
  db.prepare(`
    UPDATE payment_orders SET status = 'paid', paid_at = datetime('now'), sepay_transaction_id = ?
    WHERE id = ?
  `).run(transactionId || null, order.id);

  // Set plan for 30 days
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  setUserPlan(order.user_id, order.plan, expiresAt);

  // Log payment history
  db.prepare(`
    INSERT INTO payment_history (user_id, order_id, plan, amount, type)
    VALUES (?, ?, ?, ?, 'upgrade')
  `).run(order.user_id, order.id, order.plan, order.amount);

  // Send notification
  try {
    const planLabels = { basic: 'Basic ⭐', pro: 'Pro 💎', unlimited: 'Unlimited 👑' };
    createNotification(
      order.user_id,
      NOTIFICATION_TYPES.PLAN_CHANGED,
      'Thanh toán thành công! 🎉',
      `Bạn đã nâng cấp lên gói ${planLabels[order.plan] || order.plan}. Cảm ơn bạn!`,
      { icon: 'upgrade', data: { plan: order.plan, expiresAt } }
    );
  } catch (e) {
    logger.warn('[Payment] Failed to create notification:', e.message);
  }

  logger.info(`[Payment] Order ${order.id} confirmed for user ${order.user_id} -> plan ${order.plan}`);
  return order;
}

// ── Verify SePay webhook via API key (legacy bank transfer flow) ──
export function verifySepayWebhook(authHeader) {
  if (!SEPAY_API_KEY) {
    logger.warn('[Payment] SEPAY_API_KEY not set, skipping webhook verification');
    return true;
  }
  if (!authHeader) return false;
  const token = authHeader
    .replace(/^(Apikey|Bearer)\s+/i, '')
    .trim();
  if (!token) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(SEPAY_API_KEY));
  } catch {
    return false;
  }
}

// ── Process SePay PG IPN ──
// Per SePay docs: IPN sends { notification_type, order: { order_status, order_invoice_number, ... }, transaction, ... }
// Just check notification_type + order_status, match DB, confirm payment. Return 200.
export function verifyAndProcessIPN(data) {
  const notificationType = data.notification_type || '';
  const order = data.order || {};
  const transaction = data.transaction || {};
  const orderId = order.order_invoice_number;

  if (!orderId) {
    return { success: false, reason: 'missing_order_invoice_number' };
  }

  const ipnStatus = (order.order_status || '').toUpperCase();
  const transactionId = String(transaction.id || order.order_id || '');

  logger.info(`[Payment] IPN: order=${orderId}, status=${ipnStatus}, type=${notificationType}`);

  // Only process paid notifications
  if (notificationType !== 'ORDER_PAID' && notificationType !== 'PAYMENT_SUCCESS') {
    logger.info(`[Payment] IPN ignored: notification_type=${notificationType}`);
    return { success: false, reason: 'not_payment_notification', type: notificationType };
  }

  if (ipnStatus !== 'CAPTURED' && ipnStatus !== 'COMPLETED' && ipnStatus !== 'PAID') {
    logger.info(`[Payment] IPN status not paid: ${ipnStatus}`);
    return { success: false, reason: 'not_paid', status: ipnStatus };
  }

  // Look up in our DB
  const dbOrder = db.prepare('SELECT * FROM payment_orders WHERE id = ?').get(orderId);
  if (!dbOrder) {
    logger.warn(`[Payment] IPN: no order found in DB for id: ${orderId}`);
    return { success: false, reason: 'no_matching_order' };
  }

  // Already paid — idempotent
  if (dbOrder.status === 'paid') {
    logger.info(`[Payment] IPN: order ${orderId} already paid, skipping`);
    return { success: true, orderId, plan: dbOrder.plan, already_paid: true };
  }

  // Verify amount (order_amount comes as "2000.00" string from SePay)
  const amount = Math.round(Number(order.order_amount) || 0);
  if (amount > 0 && amount < dbOrder.amount) {
    logger.warn(`[Payment] IPN amount mismatch: received ${amount}, expected ${dbOrder.amount}`);
    return { success: false, reason: 'amount_mismatch' };
  }

  const result = confirmPaymentById(orderId, transactionId);
  if (!result) {
    return { success: false, reason: 'confirmation_failed' };
  }

  return { success: true, orderId, plan: dbOrder.plan, userId: dbOrder.user_id };
}

// ── Confirm payment by order ID (for SePay PG IPN) ──
export function confirmPaymentById(orderId, transactionId) {
  const order = db.prepare(`
    SELECT * FROM payment_orders WHERE id = ? AND status = 'pending'
  `).get(orderId);

  if (!order) {
    logger.warn(`[Payment] No pending order found for id: ${orderId}`);
    return null;
  }

  if (new Date(order.expired_at) < new Date()) {
    db.prepare(`UPDATE payment_orders SET status = 'expired' WHERE id = ?`).run(order.id);
    logger.warn(`[Payment] Order ${order.id} expired`);
    return null;
  }

  db.prepare(`
    UPDATE payment_orders SET status = 'paid', paid_at = datetime('now'), sepay_transaction_id = ?
    WHERE id = ?
  `).run(transactionId || null, order.id);

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  setUserPlan(order.user_id, order.plan, expiresAt);

  db.prepare(`
    INSERT INTO payment_history (user_id, order_id, plan, amount, type)
    VALUES (?, ?, ?, ?, 'upgrade')
  `).run(order.user_id, order.id, order.plan, order.amount);

  try {
    const planLabels = { basic: 'Basic ⭐', pro: 'Pro 💎', unlimited: 'Unlimited 👑' };
    createNotification(
      order.user_id,
      NOTIFICATION_TYPES.PLAN_CHANGED,
      'Thanh toán thành công! 🎉',
      `Bạn đã nâng cấp lên gói ${planLabels[order.plan] || order.plan}. Cảm ơn bạn!`,
      { icon: 'upgrade', data: { plan: order.plan, expiresAt } }
    );
  } catch (e) {
    logger.warn('[Payment] Failed to create notification:', e.message);
  }

  logger.info(`[Payment] Order ${order.id} confirmed via IPN for user ${order.user_id} -> plan ${order.plan}`);
  return order;
}

// ── Process SePay PG IPN ── (delegates to verifyAndProcessIPN)
export function processSePayPgIPN(data) {
  return verifyAndProcessIPN(data);
}

// ── Process SePay webhook (legacy bank transfer flow) ──
export function processSepayWebhook(data) {
  const content = (data.content || '').trim().toUpperCase();
  const amount = Number(data.transferAmount) || 0;
  const transactionId = String(data.id || data.referenceCode || '');

  if (!content || amount <= 0) {
    logger.warn('[Payment] Invalid webhook data:', { content, amount });
    return { success: false, reason: 'invalid_data' };
  }

  const nmMatch = content.match(/NM\d{8}/);
  const matchedContent = nmMatch ? nmMatch[0] : content;

  const order = getOrderByTransferContent(matchedContent);
  if (!order) {
    logger.info(`[Payment] No matching order for content: "${matchedContent}" (full: "${content}")`);
    return { success: false, reason: 'no_matching_order' };
  }

  if (amount < order.amount) {
    logger.warn(`[Payment] Amount mismatch: received ${amount}, expected ${order.amount} for order ${order.id}`);
    return { success: false, reason: 'amount_mismatch' };
  }

  const result = confirmPayment(matchedContent, transactionId);
  if (!result) {
    return { success: false, reason: 'confirmation_failed' };
  }

  return { success: true, orderId: order.id, plan: order.plan, userId: order.user_id };
}

// ── Get user payment history ──
export function getUserPaymentHistory(userId) {
  return db.prepare(`
    SELECT ph.*, po.transfer_content, po.sepay_transaction_id
    FROM payment_history ph
    LEFT JOIN payment_orders po ON ph.order_id = po.id
    WHERE ph.user_id = ?
    ORDER BY ph.created_at DESC
    LIMIT 50
  `).all(userId);
}

// ── Admin: get all recent payments ──
export function getRecentPayments(limit = 50) {
  return db.prepare(`
    SELECT po.*, u.username, u.email
    FROM payment_orders po
    JOIN users u ON po.user_id = u.id
    ORDER BY po.created_at DESC
    LIMIT ?
  `).all(limit);
}

// ── Cleanup expired orders (called periodically) ──
export function cleanupExpiredOrders() {
  const result = db.prepare(`
    UPDATE payment_orders SET status = 'expired'
    WHERE status = 'pending' AND expired_at < datetime('now')
  `).run();
  if (result.changes > 0) {
    logger.info(`[Payment] Expired ${result.changes} pending orders`);
  }
}
