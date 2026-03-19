import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import PDFDocument from 'pdfkit';
import fs from 'fs';

let createCanvas = null;
try {
  const canvasModule = await import('canvas');
  createCanvas = canvasModule.createCanvas;
} catch (e) {
  console.warn('[SyncExport] canvas module not available, mindmap image export disabled');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../data/notemind.db');
const EXPORTS_DIR = path.join(__dirname, '../exports');

// Ensure exports directory exists
if (!fs.existsSync(EXPORTS_DIR)) {
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
}

/**
 * Offline Sync Service - Queue changes for sync when online
 */

export function queueSyncAction(userId, entityType, entityId, action, data) {
  try {
    const db = new Database(DB_PATH);

    db.prepare(`
      INSERT INTO sync_queue (id, user_id, entity_type, entity_id, action, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), userId, entityType, entityId, action, JSON.stringify(data) || null);

    db.close();
    return { success: true };
  } catch (error) {
    console.error('[Offline Sync] Error queuing:', error.message);
    return { success: false };
  }
}

export function getPendingSyncActions(userId) {
  try {
    const db = new Database(DB_PATH);

    const pendingActions = db.prepare(`
      SELECT id, entity_type, entity_id, action, data, created_at
      FROM sync_queue
      WHERE user_id = ? AND synced_at IS NULL
      ORDER BY created_at ASC
      LIMIT 100
    `).all(userId);

    db.close();
    return pendingActions;
  } catch (error) {
    console.error('[Offline Sync] Error getting pending:', error.message);
    return [];
  }
}

export function markSynced(syncQueueId) {
  try {
    const db = new Database(DB_PATH);

    db.prepare(`
      UPDATE sync_queue SET synced_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(syncQueueId);

    db.close();
    return { success: true };
  } catch (error) {
    console.error('[Offline Sync] Error marking synced:', error.message);
    return { success: false };
  }
}

// Map frontend preference keys to actual DB column names
const PREFERENCE_KEY_MAP = {
  'notifications': 'notification_enabled',
  'notification_enabled': 'notification_enabled',
  'offlineSync': 'offline_sync_enabled',
  'offlineModeEnabled': 'offline_sync_enabled',
  'offline_sync_enabled': 'offline_sync_enabled',
  'autoSave': 'auto_save_enabled',
  'auto_save_enabled': 'auto_save_enabled',
  'theme': 'theme',
  'language': 'language',
  'spacedRepetition': 'spaced_repetition_enabled',
  'spaced_repetition_enabled': 'spaced_repetition_enabled',
  'dailyGoalCards': 'daily_goal_cards',
  'daily_goal_cards': 'daily_goal_cards',
  'emailUpdates': 'email_updates',
};

const VALID_PREFERENCE_COLUMNS = new Set(Object.values(PREFERENCE_KEY_MAP));

export function setUserPreference(userId, key, value) {
  try {
    const column = PREFERENCE_KEY_MAP[key];
    if (!column) {
      console.error(`[Preferences] Unknown preference key: "${key}"`);
      return { success: false, error: `Unknown preference key: ${key}` };
    }

    const db = new Database(DB_PATH);

    const exists = db.prepare(`
      SELECT id FROM user_preferences WHERE user_id = ?
    `).get(userId);

    if (exists) {
      db.prepare(`
        UPDATE user_preferences SET ${column} = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?
      `).run(value, userId);
    } else {
      db.prepare(`
        INSERT INTO user_preferences (id, user_id, ${column})
        VALUES (?, ?, ?)
      `).run(uuidv4(), userId, value);
    }

    db.close();
    return { success: true };
  } catch (error) {
    console.error('[Preferences] Error setting:', error.message);
    return { success: false };
  }
}

export function getUserPreferences(userId) {
  try {
    const db = new Database(DB_PATH);

    let prefs = db.prepare(`
      SELECT * FROM user_preferences WHERE user_id = ?
    `).get(userId);

    if (!prefs) {
      const prefId = uuidv4();
      db.prepare(`
        INSERT INTO user_preferences (id, user_id)
        VALUES (?, ?)
      `).run(prefId, userId);

      prefs = db.prepare(`
        SELECT * FROM user_preferences WHERE user_id = ?
      `).get(userId);
    }

    db.close();

    // Map DB column names to frontend-friendly keys
    if (prefs) {
      prefs.offlineModeEnabled = !!prefs.offline_sync_enabled;
      prefs.notifications = !!prefs.notification_enabled;
      prefs.emailUpdates = !!prefs.email_updates;
      prefs.autoSave = !!prefs.auto_save_enabled;
      prefs.spacedRepetition = !!prefs.spaced_repetition_enabled;
      prefs.dailyGoalCards = prefs.daily_goal_cards;
    }

    return prefs;
  } catch (error) {
    console.error('[Preferences] Error getting:', error.message);
    return null;
  }
}

/**
 * Export Service - Export mindmaps, flashcards, conversations
 */

export function exportFlashcardsAsCSV(documentId, userId) {
  try {
    const db = new Database(DB_PATH);

    const flashcards = db.prepare(`
      SELECT fc.id, fc.front, fc.back,
             fm.ease_factor, fm.interval, fm.repetitions, fm.next_review_date
      FROM flashcards fc
      LEFT JOIN flashcard_metrics fm ON fc.id = fm.flashcard_id AND fm.user_id = ?
      WHERE fc.document_id = ?
      ORDER BY fc.created_at ASC
    `).all(userId, documentId);

    db.close();

    // Create CSV
    let csv = 'Front,Back,EaseFactor,Interval,Repetitions,NextReview\n';
    for (const card of flashcards) {
      csv += `"${card.front.replace(/"/g, '""')}","${card.back.replace(/"/g, '""')}",${card.ease_factor},${card.interval},${card.repetitions},"${card.next_review_date || ''}"\n`;
    }

    const filename = `flashcards-${documentId}-${Date.now()}.csv`;
    const filepath = path.join(EXPORTS_DIR, filename);

    fs.writeFileSync(filepath, csv);

    return {
      success: true,
      filename,
      filepath
    };
  } catch (error) {
    console.error('[Export] Error exporting CSV:', error.message);
    return { success: false, error: error.message };
  }
}

export function exportConversationAsPDF(conversationId) {
  try {
    const db = new Database(DB_PATH);

    const conversation = db.prepare(`
      SELECT * FROM conversations WHERE id = ?
    `).get(conversationId);

    const messages = db.prepare(`
      SELECT role, message, created_at FROM conversation_messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC
    `).all(conversationId);

    db.close();

    // Create PDF
    const doc = new PDFDocument();
    const filename = `conversation-${conversationId}-${Date.now()}.pdf`;
    const filepath = path.join(EXPORTS_DIR, filename);
    const stream = fs.createWriteStream(filepath);

    doc.pipe(stream);

    doc.fontSize(20).text(conversation.title || 'Conversation', { align: 'center' });
    doc.fontSize(10).text(`Created: ${conversation.created_at}`, { align: 'center' });
    doc.moveDown();

    for (const msg of messages) {
      const isUser = msg.role === 'user';
      doc.fontSize(11).font(isUser ? 'Helvetica-Bold' : 'Helvetica');
      doc.text(`${isUser ? 'You' : 'Assistant'}: ${msg.message}`);
      doc.fontSize(9).fillColor('gray').text(msg.created_at);
      doc.fillColor('black');
      doc.moveDown(0.5);
    }

    doc.end();

    return new Promise((resolve) => {
      stream.on('finish', () => {
        resolve({
          success: true,
          filename,
          filepath
        });
      });
    });
  } catch (error) {
    console.error('[Export] Error exporting PDF:', error.message);
    return { success: false, error: error.message };
  }
}

export function exportMindmapAsImage(mindmapData, documentId) {
  try {
    if (!createCanvas) {
      return { success: false, error: 'canvas module not available' };
    }
    // Create canvas
    const width = 1200;
    const height = 800;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Draw background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Draw mindmap (simplified visualization)
    ctx.fillStyle = '#333333';
    ctx.font = '16px Arial';
    ctx.fillText('Mindmap Export', 50, 50);

    // Save as PNG
    const filename = `mindmap-${documentId}-${Date.now()}.png`;
    const filepath = path.join(EXPORTS_DIR, filename);
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(filepath, buffer);

    return {
      success: true,
      filename,
      filepath
    };
  } catch (error) {
    console.error('[Export] Error exporting image:', error.message);
    return { success: false, error: error.message };
  }
}


export default {
  // Offline Sync
  queueSyncAction,
  getPendingSyncActions,
  markSynced,
  setUserPreference,
  getUserPreferences,
  // Export
  exportFlashcardsAsCSV,
  exportConversationAsPDF,
  exportMindmapAsImage,
};

