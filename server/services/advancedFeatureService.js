import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../data/notemind.db');

/**
 * Search Service - Full-text search across documents and conversations
 */

export function indexDocument(userId, documentId, contentType, searchableText) {
  try {
    const db = new Database(DB_PATH);

    const existingIndex = db.prepare(`
      SELECT id FROM search_index 
      WHERE document_id = ? AND content_type = ?
    `).get(documentId, contentType);

    if (existingIndex) {
      db.prepare(`
        UPDATE search_index 
        SET searchable_text = ?, updated_at = CURRENT_TIMESTAMP
        WHERE document_id = ? AND content_type = ?
      `).run(searchableText, documentId, contentType);
    } else {
      db.prepare(`
        INSERT INTO search_index (id, document_id, user_id, content_type, searchable_text)
        VALUES (?, ?, ?, ?, ?)
      `).run(uuidv4(), documentId, userId, contentType, searchableText);
    }

    db.close();
    return { success: true };
  } catch (error) {
    console.error('[Search] Error indexing:', error.message);
    return { success: false };
  }
}

export function searchDocuments(userId, query, limit = 20) {
  try {
    const db = new Database(DB_PATH);

    const searchTerm = `%${query}%`;

    const results = db.prepare(`
      SELECT DISTINCT
        si.document_id, si.content_type, si.created_at,
        d.file_path,
        (CASE WHEN si.searchable_text LIKE ? THEN 2 ELSE 1 END) as relevance
      FROM search_index si
      JOIN documents d ON si.document_id = d.id
      WHERE si.user_id = ? AND si.searchable_text LIKE ?
      ORDER BY relevance DESC, si.updated_at DESC
      LIMIT ?
    `).all(searchTerm, userId, searchTerm, limit);

    db.close();
    return results;
  } catch (error) {
    console.error('[Search] Error searching:', error.message);
    return [];
  }
}

export function searchConversations(userId, query, limit = 20) {
  try {
    const db = new Database(DB_PATH);

    const searchTerm = `%${query}%`;

    const results = db.prepare(`
      SELECT DISTINCT
        c.id as conversation_id,
        c.document_id,
        c.title,
        c.updated_at,
        COUNT(cm.id) as message_count
      FROM conversations c
      LEFT JOIN conversation_messages cm ON c.id = cm.conversation_id 
        AND cm.message LIKE ?
      WHERE c.user_id = ? AND (c.title LIKE ? OR cm.message LIKE ?)
      GROUP BY c.id
      ORDER BY c.updated_at DESC
      LIMIT ?
    `).all(searchTerm, userId, searchTerm, searchTerm, limit);

    db.close();
    return results;
  } catch (error) {
    console.error('[Search] Error searching conversations:', error.message);
    return [];
  }
}

/**
 * Share Service - Share documents with links and manage access
 */

export function createShareLink(documentId, ownerId, shareType = 'view', expiresInDays = null) {
  try {
    const db = new Database(DB_PATH);
    const shareToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString() : null;

    const result = db.prepare(`
      INSERT INTO shared_documents (id, document_id, owner_id, share_token, share_type, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), documentId, ownerId, shareToken, shareType, expiresAt);

    db.close();

    return {
      success: true,
      shareToken,
      shareUrl: `/share/${shareToken}`,
      expiresAt
    };
  } catch (error) {
    console.error('[Share] Error creating share link:', error.message);
    return { success: false, error: error.message };
  }
}

export function validateShareToken(shareToken) {
  try {
    const db = new Database(DB_PATH);

    const share = db.prepare(`
      SELECT sd.id, sd.document_id, sd.owner_id, sd.share_type, sd.expires_at,
             d.original_name, d.status, d.text_length
      FROM shared_documents sd
      LEFT JOIN documents d ON sd.document_id = d.id
      WHERE sd.share_token = ? 
        AND (sd.expires_at IS NULL OR sd.expires_at > datetime('now'))
    `).get(shareToken);

    if (share) {
      // Log access
      db.prepare(`
        INSERT INTO shared_access_logs (id, shared_document_id, accessed_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `).run(uuidv4(), share.id);
    }

    db.close();
    return share || null;
  } catch (error) {
    console.error('[Share] Error validating token:', error.message);
    return null;
  }
}

export function getSharedDocuments(ownerId, documentId = null) {
  try {
    const db = new Database(DB_PATH);

    let query = `
      SELECT sd.id, sd.document_id, sd.share_token, sd.share_type, 
             sd.expires_at, sd.created_at,
             COUNT(sal.id) as access_count,
             d.file_path, d.original_name
      FROM shared_documents sd
      LEFT JOIN shared_access_logs sal ON sd.id = sal.shared_document_id
      LEFT JOIN documents d ON sd.document_id = d.id
      WHERE sd.owner_id = ?
    `;
    const params = [ownerId];

    if (documentId) {
      query += ' AND sd.document_id = ?';
      params.push(documentId);
    }

    query += ' GROUP BY sd.id ORDER BY sd.created_at DESC';

    const shares = db.prepare(query).all(...params);

    db.close();
    return shares;
  } catch (error) {
    console.error('[Share] Error getting shared:', error.message);
    return [];
  }
}

export function deleteShareLink(shareId) {
  try {
    const db = new Database(DB_PATH);

    db.prepare('DELETE FROM shared_access_logs WHERE shared_document_id = ?')
      .run(shareId);
    
    db.prepare('DELETE FROM shared_documents WHERE id = ?')
      .run(shareId);

    db.close();
    return { success: true };
  } catch (error) {
    console.error('[Share] Error deleting share:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Spaced Repetition Service - SM-2 Algorithm Implementation
 */

export function updateFlashcardMetrics(userId, documentId, flashcardId, qualityGrade, timeMs) {
  try {
    const db = new Database(DB_PATH);

    let metrics = db.prepare(`
      SELECT * FROM flashcard_metrics
      WHERE flashcard_id = ? AND user_id = ?
    `).get(flashcardId, userId);

    if (!metrics) {
      // Create new metrics
      const metricsId = uuidv4();
      db.prepare(`
        INSERT INTO flashcard_metrics (id, flashcard_id, user_id, document_id)
        VALUES (?, ?, ?, ?)
      `).run(metricsId, flashcardId, userId, documentId);

      metrics = {
        id: metricsId,
        ease_factor: 2.5,
        interval: 1,
        repetitions: 0
      };
    }

    // SM-2 Algorithm
    let newEaseFactor = metrics.ease_factor + (0.1 - (5 - qualityGrade) * (0.08 + (5 - qualityGrade) * 0.02));
    newEaseFactor = Math.max(1.3, newEaseFactor);

    let newInterval, newRepetitions;

    if (qualityGrade < 3) {
      // Wrong answer - reset
      newInterval = 1;
      newRepetitions = 0;
    } else {
      newRepetitions = metrics.repetitions + 1;
      
      if (newRepetitions === 1) {
        newInterval = 1;
      } else if (newRepetitions === 2) {
        newInterval = 3;
      } else {
        newInterval = Math.round(metrics.interval * newEaseFactor);
      }
    }

    const nextReviewDate = new Date(Date.now() + newInterval * 24 * 60 * 60 * 1000).toISOString();

    db.prepare(`
      UPDATE flashcard_metrics
      SET ease_factor = ?,
          interval = ?,
          repetitions = ?,
          next_review_date = ?,
          last_review_date = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE flashcard_id = ? AND user_id = ?
    `).run(newEaseFactor, newInterval, newRepetitions, nextReviewDate, flashcardId, userId);

    // Log review
    db.prepare(`
      INSERT INTO flashcard_reviews (id, flashcard_metric_id, quality_grade, time_elapsed_ms, reviewed_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(uuidv4(), metrics.id, qualityGrade, timeMs);

    db.close();

    return {
      success: true,
      nextReviewDate,
      easeFactor: newEaseFactor,
      interval: newInterval,
      repetitions: newRepetitions
    };
  } catch (error) {
    console.error('[Spaced Repetition] Error updating metrics:', error.message);
    return { success: false, error: error.message };
  }
}

export function getDueFlashcards(userId, documentId = null, limit = 20) {
  try {
    const db = new Database(DB_PATH);

    let query = `
      SELECT fm.id, fm.flashcard_id, fm.document_id, fm.ease_factor,
             fm.interval, fm.repetitions, fm.next_review_date,
             COUNT(fr.id) as review_count
      FROM flashcard_metrics fm
      LEFT JOIN flashcard_reviews fr ON fm.id = fr.flashcard_metric_id
      WHERE fm.user_id = ? AND 
            (fm.next_review_date IS NULL OR fm.next_review_date <= datetime('now'))
    `;

    const params = [userId];

    if (documentId) {
      query += ' AND fm.document_id = ?';
      params.push(documentId);
    }

    query += ` 
      GROUP BY fm.id
      ORDER BY fm.next_review_date ASC
      LIMIT ?
    `;
    params.push(limit);

    const dueCards = db.prepare(query).all(...params);
    db.close();

    return dueCards;
  } catch (error) {
    console.error('[Spaced Repetition] Error getting due cards:', error.message);
    return [];
  }
}

export function getFlashcardStats(userId, documentId = null) {
  try {
    const db = new Database(DB_PATH);

    const dueSoon = db.prepare(`
      SELECT COUNT(*) as count
      FROM flashcard_metrics
      WHERE user_id = ? AND (next_review_date IS NULL OR next_review_date <= datetime('now', '+7 days'))
    `).get(userId).count;

    const totalCards = db.prepare(`
      SELECT COUNT(*) as count
      FROM flashcard_metrics
      WHERE user_id = ?
    `).get(userId).count;

    const avgEaseFactor = db.prepare(`
      SELECT AVG(ease_factor) as avg FROM flashcard_metrics WHERE user_id = ?
    `).get(userId).avg;

    const reviewStats = db.prepare(`
      SELECT 
        COUNT(*) as total_reviews,
        AVG(time_elapsed_ms) as avg_time_ms,
        AVG(quality_grade) as avg_quality
      FROM flashcard_reviews fr
      JOIN flashcard_metrics fm ON fr.flashcard_metric_id = fm.id
      WHERE fm.user_id = ? AND fr.reviewed_at >= datetime('now', '-30 days')
    `).get(userId);

    db.close();

    return {
      totalCards,
      dueCards: dueSoon,
      avgEaseFactor: avgEaseFactor || 2.5,
      recentReviews: {
        total: reviewStats.total_reviews || 0,
        avgTimeMs: reviewStats.avg_time_ms || 0,
        avgQuality: reviewStats.avg_quality || 0
      }
    };
  } catch (error) {
    console.error('[Spaced Repetition] Error getting stats:', error.message);
    return null;
  }
}

export default {
  // Search
  indexDocument,
  searchDocuments,
  searchConversations,
  // Share
  createShareLink,
  validateShareToken,
  getSharedDocuments,
  deleteShareLink,
  // Spaced Repetition
  updateFlashcardMetrics,
  getDueFlashcards,
  getFlashcardStats
};
