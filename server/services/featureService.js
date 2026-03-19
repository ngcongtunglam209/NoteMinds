import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../data/notemind.db');

/**
 * Chat History Service - Save and retrieve conversations
 */

export function saveConversation(userId, documentId, messages = [], title = null) {
  try {
    const db = new Database(DB_PATH);
    const conversationId = uuidv4();

    const stmt = db.prepare(`
      INSERT INTO conversations (id, document_id, user_id, title, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    stmt.run(conversationId, documentId, userId, title || `Chat on ${new Date().toLocaleDateString()}`);

    // Save messages
    const msgStmt = db.prepare(`
      INSERT INTO conversation_messages (id, conversation_id, role, message, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    for (const msg of messages) {
      msgStmt.run(uuidv4(), conversationId, msg.role, msg.content);
    }

    db.close();
    return { conversationId, success: true };
  } catch (error) {
    console.error('[Chat History] Error saving conversation:', error.message);
    return { success: false, error: error.message };
  }
}

export function addMessageToConversation(conversationId, role, message) {
  try {
    const db = new Database(DB_PATH);

    db.prepare(`
      INSERT INTO conversation_messages (id, conversation_id, role, message)
      VALUES (?, ?, ?, ?)
    `).run(uuidv4(), conversationId, role, message);

    db.prepare(`
      UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(conversationId);

    db.close();
    return { success: true };
  } catch (error) {
    console.error('[Chat History] Error adding message:', error.message);
    return { success: false, error: error.message };
  }
}

export function getConversations(userId, documentId = null) {
  try {
    const db = new Database(DB_PATH);

    let query = `
      SELECT id, document_id, title, created_at, updated_at, is_archived
      FROM conversations
      WHERE user_id = ? AND is_archived = 0
    `;

    const params = [userId];

    if (documentId) {
      query += ' AND document_id = ?';
      params.push(documentId);
    }

    query += ' ORDER BY updated_at DESC LIMIT 50';

    const conversations = db.prepare(query).all(...params);
    db.close();

    return conversations;
  } catch (error) {
    console.error('[Chat History] Error getting conversations:', error.message);
    return [];
  }
}

export function getConversationMessages(conversationId) {
  try {
    const db = new Database(DB_PATH);

    const messages = db.prepare(`
      SELECT id, role, message, created_at
      FROM conversation_messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC
    `).all(conversationId);

    db.close();
    return messages;
  } catch (error) {
    console.error('[Chat History] Error getting messages:', error.message);
    return [];
  }
}

export function deleteConversation(conversationId) {
  try {
    const db = new Database(DB_PATH);

    db.prepare('DELETE FROM conversation_messages WHERE conversation_id = ?')
      .run(conversationId);
    
    db.prepare('DELETE FROM conversations WHERE id = ?')
      .run(conversationId);

    db.close();
    return { success: true };
  } catch (error) {
    console.error('[Chat History] Error deleting conversation:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Favorites Service
 */

export function addFavorite(userId, documentId) {
  try {
    const db = new Database(DB_PATH);

    db.prepare(`
      INSERT OR IGNORE INTO favorites (id, user_id, document_id)
      VALUES (?, ?, ?)
    `).run(uuidv4(), userId, documentId);

    db.close();
    return { success: true };
  } catch (error) {
    console.error('[Favorites] Error adding favorite:', error.message);
    return { success: false, error: error.message };
  }
}

export function removeFavorite(userId, documentId) {
  try {
    const db = new Database(DB_PATH);

    db.prepare(`
      DELETE FROM favorites WHERE user_id = ? AND document_id = ?
    `).run(userId, documentId);

    db.close();
    return { success: true };
  } catch (error) {
    console.error('[Favorites] Error removing favorite:', error.message);
    return { success: false, error: error.message };
  }
}

export function getFavorites(userId) {
  try {
    const db = new Database(DB_PATH);

    const favorites = db.prepare(`
      SELECT f.document_id, d.file_path, d.created_at as added_at,
             (SELECT COUNT(*) FROM documents WHERE id = f.document_id) as exists
      FROM favorites f
      LEFT JOIN documents d ON f.document_id = d.id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC
    `).all(userId);

    db.close();
    return favorites;
  } catch (error) {
    console.error('[Favorites] Error getting favorites:', error.message);
    return [];
  }
}

export function isFavorite(userId, documentId) {
  try {
    const db = new Database(DB_PATH);

    const result = db.prepare(`
      SELECT id FROM favorites 
      WHERE user_id = ? AND document_id = ?
      LIMIT 1
    `).get(userId, documentId);

    db.close();
    return !!result;
  } catch (error) {
    return false;
  }
}

/**
 * Tags Service
 */

export function createTag(userId, name, color = '#3b82f6') {
  try {
    const db = new Database(DB_PATH);
    const tagId = uuidv4();

    db.prepare(`
      INSERT INTO tags (id, user_id, name, color)
      VALUES (?, ?, ?, ?)
    `).run(tagId, userId, name, color);

    db.close();
    return { tagId, success: true };
  } catch (error) {
    console.error('[Tags] Error creating tag:', error.message);
    return { success: false, error: error.message };
  }
}

export function addTagToDocument(documentId, tagId) {
  try {
    const db = new Database(DB_PATH);

    db.prepare(`
      INSERT OR IGNORE INTO document_tags (id, document_id, tag_id)
      VALUES (?, ?, ?)
    `).run(uuidv4(), documentId, tagId);

    db.close();
    return { success: true };
  } catch (error) {
    console.error('[Tags] Error adding tag:', error.message);
    return { success: false, error: error.message };
  }
}

export function removeTagFromDocument(documentId, tagId) {
  try {
    const db = new Database(DB_PATH);

    db.prepare(`
      DELETE FROM document_tags WHERE document_id = ? AND tag_id = ?
    `).run(documentId, tagId);

    db.close();
    return { success: true };
  } catch (error) {
    console.error('[Tags] Error removing tag:', error.message);
    return { success: false, error: error.message };
  }
}

export function getDocumentTags(documentId) {
  try {
    const db = new Database(DB_PATH);

    const tags = db.prepare(`
      SELECT t.id, t.name, t.color
      FROM tags t
      JOIN document_tags dt ON t.id = dt.tag_id
      WHERE dt.document_id = ?
      ORDER BY t.name ASC
    `).all(documentId);

    db.close();
    return tags;
  } catch (error) {
    console.error('[Tags] Error getting tags:', error.message);
    return [];
  }
}

export function getUserTags(userId) {
  try {
    const db = new Database(DB_PATH);

    const tags = db.prepare(`
      SELECT id, name, color,
             (SELECT COUNT(*) FROM document_tags WHERE tag_id = tags.id) as count
      FROM tags
      WHERE user_id = ?
      ORDER BY name ASC
    `).all(userId);

    db.close();
    return tags;
  } catch (error) {
    console.error('[Tags] Error getting user tags:', error.message);
    return [];
  }
}

/**
 * Analytics Service
 */

export function logAnalytic(userId, action, documentId = null, metadata = {}) {
  try {
    const db = new Database(DB_PATH);

    db.prepare(`
      INSERT INTO analytics_logs (id, user_id, document_id, action, metadata)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), userId, documentId, action, JSON.stringify(metadata));

    db.close();
    return { success: true };
  } catch (error) {
    console.error('[Analytics] Error logging:', error.message);
    return { success: false };
  }
}

export function getUserAnalytics(userId, days = 7) {
  try {
    const db = new Database(DB_PATH);

    const analytics = db.prepare(`
      SELECT action, COUNT(*) as count, 
             AVG(CAST(json_extract(metadata, '$.duration') AS INTEGER)) as avg_duration
      FROM analytics_logs
      WHERE user_id = ? AND created_at >= datetime('now', '-' || ? || ' days')
      GROUP BY action
      ORDER BY count DESC
    `).all(userId, days);

    const documentStats = db.prepare(`
      SELECT document_id, COUNT(*) as interactions,
             MAX(created_at) as last_accessed
      FROM analytics_logs
      WHERE user_id = ? AND document_id IS NOT NULL 
        AND created_at >= datetime('now', '-' || ? || ' days')
      GROUP BY document_id
      ORDER BY interactions DESC
      LIMIT 10
    `).all(userId, days);

    db.close();

    return {
      actions: analytics,
      topDocuments: documentStats
    };
  } catch (error) {
    console.error('[Analytics] Error getting analytics:', error.message);
    return { actions: [], topDocuments: [] };
  }
}

export default {
  // Chat History
  saveConversation,
  addMessageToConversation,
  getConversations,
  getConversationMessages,
  deleteConversation,
  // Favorites
  addFavorite,
  removeFavorite,
  getFavorites,
  isFavorite,
  // Tags
  createTag,
  addTagToDocument,
  removeTagFromDocument,
  getDocumentTags,
  getUserTags,
  // Analytics
  logAnalytic,
  getUserAnalytics
};
