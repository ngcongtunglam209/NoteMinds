import db from './database.js';

/**
 * Initialize notifications table
 */
export function initNotificationsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT,
      data TEXT,
      is_read INTEGER DEFAULT 0,
      action_url TEXT,
      icon TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      read_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Create indexes for better query performance
  const indexes = db.prepare('PRAGMA index_list(notifications)').all();
  const indexNames = indexes.map(idx => idx.name);

  if (!indexNames.includes('idx_notifications_user_id')) {
    db.exec('CREATE INDEX idx_notifications_user_id ON notifications(user_id)');
  }
  if (!indexNames.includes('idx_notifications_user_read')) {
    db.exec('CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read)');
  }
  if (!indexNames.includes('idx_notifications_created')) {
    db.exec('CREATE INDEX idx_notifications_created ON notifications(created_at DESC)');
  }
}

/**
 * Create a notification for a user
 * @param {number} userId - User ID
 * @param {string} type - Notification type (e.g., 'document_generated', 'shared', 'admin')
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {object} options - Additional options
 * @returns {object} Created notification
 */
export function createNotification(userId, type, title, message, options = {}) {
  const {
    actionUrl = null,
    data = null,
    icon = null,
  } = options;

  const stmt = db.prepare(`
    INSERT INTO notifications (user_id, type, title, message, action_url, data, icon)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    userId,
    type,
    title,
    message,
    actionUrl,
    data ? JSON.stringify(data) : null,
    icon
  );

  return {
    id: result.lastInsertRowid,
    user_id: userId,
    type,
    title,
    message,
    data: data || null,
    is_read: 0,
    action_url: actionUrl,
    icon,
    created_at: new Date().toISOString(),
    read_at: null,
  };
}

/**
 * Create bulk notifications for multiple users
 * @param {number[]} userIds - Array of user IDs
 * @param {string} type - Notification type
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {object} options - Additional options
 */
export function createBulkNotifications(userIds, type, title, message, options = {}) {
  const {
    actionUrl = null,
    data = null,
    icon = null,
  } = options;

  const stmt = db.prepare(`
    INSERT INTO notifications (user_id, type, title, message, action_url, data, icon)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const dataJson = data ? JSON.stringify(data) : null;
  const insertMany = db.transaction((users) => {
    for (const userId of users) {
      stmt.run(userId, type, title, message, actionUrl, dataJson, icon);
    }
  });

  insertMany(userIds);
}

/**
 * Get user's notifications with pagination
 * @param {number} userId - User ID
 * @param {object} options - Options (limit, offset, unreadOnly)
 * @returns {object} Notifications and metadata
 */
export function getUserNotifications(userId, options = {}) {
  const {
    limit = 20,
    offset = 0,
    unreadOnly = false,
  } = options;

  let query = 'SELECT * FROM notifications WHERE user_id = ?';
  const params = [userId];

  if (unreadOnly) {
    query += ' AND is_read = 0';
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const notifications = db.prepare(query).all(...params);

  // Parse data JSON
  const parsed = notifications.map(n => ({
    ...n,
    data: n.data ? JSON.parse(n.data) : null,
  }));

  // Get total count
  let countQuery = 'SELECT COUNT(*) as count FROM notifications WHERE user_id = ?';
  const countParams = [userId];
  if (unreadOnly) {
    countQuery += ' AND is_read = 0';
  }

  const { count } = db.prepare(countQuery).get(...countParams);

  return {
    notifications: parsed,
    total: count,
    limit,
    offset,
    unreadOnly,
  };
}

/**
 * Mark notification as read
 * @param {number} notificationId - Notification ID
 * @param {number} userId - User ID (for verification)
 * @returns {boolean} Success
 */
export function markNotificationAsRead(notificationId, userId) {
  const stmt = db.prepare(`
    UPDATE notifications 
    SET is_read = 1, read_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `);

  const result = stmt.run(notificationId, userId);
  return result.changes > 0;
}

/**
 * Mark all notifications as read for a user
 * @param {number} userId - User ID
 * @returns {number} Number of notifications marked as read
 */
export function markAllNotificationsAsRead(userId) {
  const stmt = db.prepare(`
    UPDATE notifications 
    SET is_read = 1, read_at = datetime('now')
    WHERE user_id = ? AND is_read = 0
  `);

  const result = stmt.run(userId);
  return result.changes;
}

/**
 * Delete a notification
 * @param {number} notificationId - Notification ID
 * @param {number} userId - User ID (for verification)
 * @returns {boolean} Success
 */
export function deleteNotification(notificationId, userId) {
  const stmt = db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?');
  const result = stmt.run(notificationId, userId);
  return result.changes > 0;
}

/**
 * Delete all notifications for a user
 * @param {number} userId - User ID
 * @returns {number} Number of notifications deleted
 */
export function deleteAllNotifications(userId) {
  const stmt = db.prepare('DELETE FROM notifications WHERE user_id = ?');
  const result = stmt.run(userId);
  return result.changes;
}

/**
 * Get unread notification count for a user
 * @param {number} userId - User ID
 * @returns {number} Unread count
 */
export function getUnreadCount(userId) {
  const result = db.prepare(
    'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0'
  ).get(userId);
  return result.count;
}

/**
 * Get a single notification
 * @param {number} notificationId - Notification ID
 * @returns {object|null} Notification
 */
export function getNotification(notificationId) {
  const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(notificationId);
  if (!notification) return null;

  return {
    ...notification,
    data: notification.data ? JSON.parse(notification.data) : null,
  };
}

/**
 * Clean up old read notifications (older than 30 days)
 * @param {number} daysOld - Number of days to keep (default: 30)
 * @returns {number} Number of notifications deleted
 */
export function cleanupOldNotifications(daysOld = 30) {
  const stmt = db.prepare(`
    DELETE FROM notifications 
    WHERE is_read = 1 
    AND datetime(created_at) < datetime('now', '-' || ? || ' days')
  `);
  const result = stmt.run(daysOld);
  return result.changes;
}

/**
 * Admin: Get all notifications across all users with filtering
 */
export function getAllNotifications(options = {}) {
  const { limit = 50, offset = 0, userId = null, type = null, search = null } = options;

  let query = `
    SELECT n.*, u.username, u.email 
    FROM notifications n 
    LEFT JOIN users u ON n.user_id = u.id 
    WHERE 1=1
  `;
  const params = [];

  if (userId) {
    query += ' AND n.user_id = ?';
    params.push(userId);
  }
  if (type) {
    query += ' AND n.type = ?';
    params.push(type);
  }
  if (search) {
    query += ' AND (n.title LIKE ? OR n.message LIKE ? OR u.username LIKE ?)';
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  // Count
  const countQuery = query.replace(/SELECT n\.\*, u\.username, u\.email/, 'SELECT COUNT(*) as count');
  const { count } = db.prepare(countQuery).get(...params);

  query += ' ORDER BY n.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const notifications = db.prepare(query).all(...params);
  const parsed = notifications.map(n => ({
    ...n,
    data: n.data ? JSON.parse(n.data) : null,
  }));

  return { notifications: parsed, total: count, limit, offset };
}

/**
 * Admin: Get notification statistics
 */
export function getNotificationStats() {
  const total = db.prepare('SELECT COUNT(*) as count FROM notifications').get().count;
  const unread = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE is_read = 0').get().count;
  const today = db.prepare("SELECT COUNT(*) as count FROM notifications WHERE date(created_at) = date('now')").get().count;
  const thisWeek = db.prepare("SELECT COUNT(*) as count FROM notifications WHERE created_at >= datetime('now', '-7 days')").get().count;

  const byType = db.prepare(`
    SELECT type, COUNT(*) as count FROM notifications GROUP BY type ORDER BY count DESC
  `).all();

  const byDay = db.prepare(`
    SELECT date(created_at) as day, COUNT(*) as count 
    FROM notifications 
    WHERE created_at >= datetime('now', '-14 days')
    GROUP BY date(created_at) 
    ORDER BY day DESC
  `).all();

  const topUsers = db.prepare(`
    SELECT n.user_id, u.username, COUNT(*) as count 
    FROM notifications n 
    LEFT JOIN users u ON n.user_id = u.id 
    GROUP BY n.user_id 
    ORDER BY count DESC LIMIT 10
  `).all();

  return { total, unread, today, thisWeek, byType, byDay, topUsers };
}

/**
 * Notification types and templates
 */
export const NOTIFICATION_TYPES = {
  // Document events
  DOCUMENT_GENERATED: 'document_generated',
  MINDMAP_READY: 'mindmap_ready',
  FLASHCARDS_READY: 'flashcards_ready',
  QUIZ_READY: 'quiz_ready',
  SUMMARY_READY: 'summary_ready',
  DOCUMENT_PROCESSED: 'document_processed',

  // Sharing & collaboration
  DOCUMENT_SHARED: 'document_shared',
  DOCUMENT_PUBLISHED: 'document_published',
  SHARED_DOCUMENT_VIEWED: 'shared_document_viewed',

  // Profile & engagement
  PROFILE_VIEWED: 'profile_viewed',
  LEADERBOARD_ACHIEVEMENT: 'leaderboard_achievement',
  LEARNING_GOAL_ACHIEVED: 'learning_goal_achieved',
  STREAK_MILESTONE: 'streak_milestone',

  // Auth & security
  EMAIL_VERIFICATION_NEEDED: 'email_verification_needed',
  PASSWORD_RESET_REQUESTED: 'password_reset_requested',
  NEW_DEVICE_LOGIN: 'new_device_login',
  SECURITY_ALERT: 'security_alert',

  // Admin
  ADMIN_MESSAGE: 'admin_message',
  PLAN_CHANGED: 'plan_changed',
  PLAN_EXPIRING: 'plan_expiring',
  ACCOUNT_BANNED: 'account_banned',

  // Community
  COMMUNITY_ACTIVITY: 'community_activity',
};

/**
 * Notification message templates
 */
export const NOTIFICATION_TEMPLATES = {
  [NOTIFICATION_TYPES.MINDMAP_READY]: (docName) => ({
    title: 'Mindmap Generated',
    message: `Your mindmap for "${docName}" is ready!`,
    icon: 'mindmap',
  }),

  [NOTIFICATION_TYPES.FLASHCARDS_READY]: (docName) => ({
    title: 'Flashcards Generated',
    message: `${docName}'s flashcards are ready to study!`,
    icon: 'flashcard',
  }),

  [NOTIFICATION_TYPES.QUIZ_READY]: (docName) => ({
    title: 'Quiz Generated',
    message: `A new quiz for "${docName}" is ready!`,
    icon: 'quiz',
  }),

  [NOTIFICATION_TYPES.SUMMARY_READY]: (docName) => ({
    title: 'Summary Generated',
    message: `Your summary for "${docName}" is ready!`,
    icon: 'summary',
  }),

  [NOTIFICATION_TYPES.DOCUMENT_SHARED]: (userName, docName) => ({
    title: 'Document Shared',
    message: `${userName} shared "${docName}" with you!`,
    icon: 'share',
  }),

  [NOTIFICATION_TYPES.DOCUMENT_PUBLISHED]: (docName) => ({
    title: 'Document Published',
    message: `Your document "${docName}" is now public!`,
    icon: 'globe',
  }),

  [NOTIFICATION_TYPES.LEADERBOARD_ACHIEVEMENT]: (rank, category) => ({
    title: 'Leaderboard Achievement',
    message: `You ranked #${rank} in ${category}!`,
    icon: 'trophy',
  }),

  [NOTIFICATION_TYPES.STREAK_MILESTONE]: (days) => ({
    title: 'Streak Milestone',
    message: `Amazing! You have a ${days}-day streak!`,
    icon: 'flame',
  }),

  [NOTIFICATION_TYPES.NEW_DEVICE_LOGIN]: (device, location) => ({
    title: 'New Device Login',
    message: `New login from ${device} in ${location}. Approve if this was you.`,
    icon: 'lock',
  }),

  [NOTIFICATION_TYPES.PLAN_CHANGED]: (newPlan) => ({
    title: 'Plan Updated',
    message: `Your plan was upgraded to ${newPlan}!`,
    icon: 'upgrade',
  }),

  [NOTIFICATION_TYPES.PLAN_EXPIRING]: (planName, daysLeft) => ({
    title: 'Plan Expiring',
    message: `Your ${planName} plan expires in ${daysLeft} days.`,
    icon: 'alert',
  }),

  [NOTIFICATION_TYPES.ADMIN_MESSAGE]: (message) => ({
    title: 'Admin Message',
    message,
    icon: 'admin',
  }),
};

/**
 * Get template or use custom
 * @param {string} type - Notification type
 * @param  {...any} args - Template arguments
 * @returns {object} Title and message
 */
export function getNotificationTemplate(type, ...args) {
  const template = NOTIFICATION_TEMPLATES[type];
  if (template && typeof template === 'function') {
    return template(...args);
  }
  return null;
}
