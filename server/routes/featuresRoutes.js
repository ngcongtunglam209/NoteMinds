import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { requireAuth, requireAdmin, optionalAuth } from '../services/authService.js';
import * as featureService from '../services/featureService.js';
import * as advancedFeatureService from '../services/advancedFeatureService.js';
import * as syncExportService from '../services/syncAndExportService.js';
import { logger, logAnalytic } from '../services/logger.js';
import { logActivity } from '../services/statsService.js';
import { buildSystemPrompt, normalizeLanguage } from '../services/promptBuilder.js';
import os from 'os';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../data/notemind.db');

const router = express.Router();

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// CONVERSATIONS (Chat History)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/conversations/:documentId', requireAuth, (req, res) => {
  try {
    const conversations = featureService.getConversations(req.user.id, req.params.documentId);
    logAnalytic(req.user.id, 'get_conversations', req.params.documentId);
    res.json({ conversations });
  } catch (error) {
    logger.error('Error getting conversations:', { error: error.message });
    res.status(500).json({ error: 'Failed to get conversations' });
  }
});

router.get('/conversations/:documentId/history', requireAuth, (req, res) => {
  try {
    const conversations = featureService.getConversations(req.user.id, req.params.documentId);

    const conversationsWithMessages = conversations.map(conv => ({
      ...conv,
      messageCount: featureService.getConversationMessages(conv.id).length
    }));

    logAnalytic(req.user.id, 'view_chat_history', req.params.documentId);
    res.json({ conversations: conversationsWithMessages });
  } catch (error) {
    logger.error('Error getting conversation history:', { error: error.message });
    res.status(500).json({ error: 'Failed to load chat history' });
  }
});

router.get('/conversation/:conversationId', requireAuth, (req, res) => {
  try {
    const messages = featureService.getConversationMessages(req.params.conversationId);
    res.json({ messages });
  } catch (error) {
    logger.error('Error getting conversation messages:', { error: error.message });
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

router.post('/conversation/save', requireAuth, (req, res) => {
  try {
    const { documentId, messages, title } = req.body;
    const result = featureService.saveConversation(req.user.id, documentId, messages, title);

    if (result.success) {
      logAnalytic(req.user.id, 'save_conversation', documentId, { messageCount: messages.length });
      res.json({ conversationId: result.conversationId });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    logger.error('Error saving conversation:', { error: error.message });
    res.status(500).json({ error: 'Failed to save conversation' });
  }
});

router.post('/conversation/:conversationId/message', requireAuth, (req, res) => {
  try {
    const { role, message } = req.body;
    const result = featureService.addMessageToConversation(req.params.conversationId, role, message);

    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    logger.error('Error adding message:', { error: error.message });
    res.status(500).json({ error: 'Failed to add message' });
  }
});

router.delete('/conversation/:conversationId', requireAuth, (req, res) => {
  try {
    const result = featureService.deleteConversation(req.params.conversationId);
    logAnalytic(req.user.id, 'delete_conversation');
    res.json(result);
  } catch (error) {
    logger.error('Error deleting conversation:', { error: error.message });
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// FAVORITES
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.post('/favorites/:documentId', requireAuth, (req, res) => {
  try {
    const result = featureService.addFavorite(req.user.id, req.params.documentId);
    logAnalytic(req.user.id, 'add_favorite', req.params.documentId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add favorite' });
  }
});

router.delete('/favorites/:documentId', requireAuth, (req, res) => {
  try {
    const result = featureService.removeFavorite(req.user.id, req.params.documentId);
    logAnalytic(req.user.id, 'remove_favorite', req.params.documentId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove favorite' });
  }
});

router.get('/favorites', requireAuth, (req, res) => {
  try {
    const favorites = featureService.getFavorites(req.user.id);
    logAnalytic(req.user.id, 'view_favorites');
    res.json({ favorites });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get favorites' });
  }
});

router.get('/favorites/:documentId/check', requireAuth, (req, res) => {
  try {
    const isFav = featureService.isFavorite(req.user.id, req.params.documentId);
    res.json({ isFavorite: isFav });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check favorite' });
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// TAGS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.post('/tags', requireAuth, (req, res) => {
  try {
    const { name, color } = req.body;
    const result = featureService.createTag(req.user.id, name, color);
    logAnalytic(req.user.id, 'create_tag', null, { tagName: name });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

router.post('/documents/:documentId/tags/:tagId', requireAuth, (req, res) => {
  try {
    const result = featureService.addTagToDocument(req.params.documentId, req.params.tagId);
    logAnalytic(req.user.id, 'add_tag', req.params.documentId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add tag' });
  }
});

router.delete('/documents/:documentId/tags/:tagId', requireAuth, (req, res) => {
  try {
    const result = featureService.removeTagFromDocument(req.params.documentId, req.params.tagId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove tag' });
  }
});

router.get('/documents/:documentId/tags', requireAuth, (req, res) => {
  try {
    const tags = featureService.getDocumentTags(req.params.documentId);
    res.json({ tags });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get tags' });
  }
});

router.get('/tags', requireAuth, (req, res) => {
  try {
    const tags = featureService.getUserTags(req.user.id);
    res.json({ tags });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get tags' });
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SEARCH
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/search', requireAuth, (req, res) => {
  try {
    const { q, limit = 20 } = req.query;
    const query = q || '';
    const results = advancedFeatureService.searchDocuments(req.user.id, query, parseInt(limit));
    const conversations = advancedFeatureService.searchConversations(req.user.id, query, parseInt(limit));

    logAnalytic(req.user.id, 'search', null, { query });
    res.json({ documents: results, conversations });
  } catch (error) {
    res.status(500).json({ error: 'Search failed' });
  }
});

router.post('/search/chat', requireAuth, async (req, res) => {
  try {
    const { query, language } = req.body;
    if (!query) return res.status(400).json({ error: 'Câu hỏi không được để trống' });

    // Step 1: Find top 3 relevant documents
    const results = advancedFeatureService.searchDocuments(req.user.id, query, 3);

    if (!results || results.length === 0) {
      return res.json({ reply: 'Xin lỗi, tôi không tìm thấy tài liệu nào liên quan đến câu hỏi của bạn trong thư viện.', sourceDocuments: [] });
    }

    // Step 2: Extract text from top 3 documents
    const { processDocument } = await import('../services/documentProcessor.js');
    const fs = await import('fs');
    let contextDocs = [];

    for (const doc of results) {
      if (doc.file_path && fs.existsSync(doc.file_path)) {
        try {
          const text = await processDocument(doc.file_path);
          // Limit to 3000 chars per doc to prevent token limit (Qwen context is large, but let's be safe)
          contextDocs.push(`--- ${path.basename(doc.file_path)} ---\n${text.substring(0, 3000)}`);
        } catch (e) {
          console.warn('Failed to extract text for search chat:', e.message);
        }
      }
    }

    if (contextDocs.length === 0) {
      return res.json({ reply: 'Các tài liệu liên quan hiện không thể trích xuất nội dung.', sourceDocuments: results });
    }

    // Step 3: Call Qwen
    const { callQwen } = await import('../services/qwenClient.js');
    const prefs = syncExportService.getUserPreferences(req.user.id) || {};
    const resolvedLanguage = normalizeLanguage(language || prefs.language, req.headers['accept-language']);
    const systemPrompt = buildSystemPrompt('searchChat', resolvedLanguage);
    const userMessage = resolvedLanguage === 'vi'
      ? `Tài liệu tham khảo:\n${contextDocs.join('\n\n')}\n\nCâu hỏi: ${query}`
      : `Reference documents:\n${contextDocs.join('\n\n')}\n\nQuestion: ${query}`;

    const reply = await callQwen(systemPrompt, userMessage, {
      userId: req.user.id,
      action: 'global_search_chat'
    });

    logAnalytic(req.user.id, 'global_search_chat', null, { query });

    res.json({ reply, sourceDocuments: results });
  } catch (error) {
    console.error('Search Chat Error:', error);
    res.status(500).json({ error: 'Failed to chat with documents' });
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ANALYTICS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/analytics', requireAuth, (req, res) => {
  try {
    const { days = 7 } = req.query;
    const analytics = featureService.getUserAnalytics(req.user.id, parseInt(days));
    res.json(analytics);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SHARING
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.post('/share/:documentId', requireAuth, (req, res) => {
  try {
    const { shareType = 'view', expiresIn } = req.body;
    const result = advancedFeatureService.createShareLink(
      req.params.documentId,
      req.user.id,
      shareType,
      expiresIn
    );

    if (result.success) {
      logAnalytic(req.user.id, 'create_share', req.params.documentId);
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create share link' });
  }
});

router.get('/shared/:shareToken', (req, res) => {
  try {
    const share = advancedFeatureService.validateShareToken(req.params.shareToken);
    if (share) {
      res.json({
        valid: true,
        documentId: share.document_id,
        shareType: share.share_type,
        documentName: share.original_name,
        status: share.status,
        textLength: share.text_length,
        expiresAt: share.expires_at
      });
    } else {
      res.status(403).json({ valid: false, error: 'Link chia sáº» khÃ´ng há»£p lá»‡ hoáº·c Ä‘Ã£ háº¿t háº¡n' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to validate share' });
  }
});

router.get('/shares', requireAuth, (req, res) => {
  try {
    const { documentId } = req.query;
    const shares = advancedFeatureService.getSharedDocuments(req.user.id, documentId || null);
    res.json({ shares });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get shares' });
  }
});

router.delete('/shares/:shareId', requireAuth, (req, res) => {
  try {
    const result = advancedFeatureService.deleteShareLink(req.params.shareId);
    logAnalytic(req.user.id, 'delete_share');
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete share' });
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SPACED REPETITION
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/flashcards/due', requireAuth, (req, res) => {
  try {
    const { documentId, limit = 20 } = req.query;
    const cards = advancedFeatureService.getDueFlashcards(
      req.user.id,
      documentId,
      parseInt(limit)
    );
    res.json({ dueCards: cards });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get due cards' });
  }
});

router.post('/flashcards/:flashcardId/review', requireAuth, (req, res) => {
  try {
    const { documentId, qualityGrade, timeMs } = req.body;
    const result = advancedFeatureService.updateFlashcardMetrics(
      req.user.id,
      documentId,
      req.params.flashcardId,
      qualityGrade,
      timeMs
    );

    if (result.success) {
      logAnalytic(req.user.id, 'flashcard_review', documentId, { quality: qualityGrade });
      logActivity(req.user.id, 'flashcards_reviewed');
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update flashcard' });
  }
});

router.get('/flashcards/stats', requireAuth, (req, res) => {
  try {
    const stats = advancedFeatureService.getFlashcardStats(req.user.id);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// EXPORT
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.post('/export/flashcards/:documentId', requireAuth, (req, res) => {
  try {
    const result = syncExportService.exportFlashcardsAsCSV(req.params.documentId, req.user.id);
    if (result.success) {
      logAnalytic(req.user.id, 'export_flashcards', req.params.documentId);
      res.json(result);
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: 'Export failed' });
  }
});

router.post('/export/conversation/:conversationId', requireAuth, (req, res) => {
  try {
    syncExportService.exportConversationAsPDF(req.params.conversationId).then(result => {
      if (result.success) {
        logAnalytic(req.user.id, 'export_conversation');
        res.json(result);
      } else {
        res.status(400).json({ error: result.error });
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Export failed' });
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// USER PREFERENCES
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/preferences', requireAuth, (req, res) => {
  try {
    const prefs = syncExportService.getUserPreferences(req.user.id);
    res.json(prefs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get preferences' });
  }
});

router.put('/preferences', requireAuth, (req, res) => {
  try {
    const { key, value } = req.body;
    const result = syncExportService.setUserPreference(req.user.id, key, value);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// OFFLINE SYNC
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/sync/pending', requireAuth, (req, res) => {
  try {
    const pending = syncExportService.getPendingSyncActions(req.user.id);
    res.json({ pending });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get pending actions' });
  }
});

router.post('/sync/action', requireAuth, (req, res) => {
  try {
    const { entityType, entityId, action, data } = req.body;
    const result = syncExportService.queueSyncAction(req.user.id, entityType, entityId, action, data);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to queue action' });
  }
});

router.post('/sync/mark/:syncId', requireAuth, (req, res) => {
  try {
    const result = syncExportService.markSynced(req.params.syncId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark synced' });
  }
});

// ════════════════════════════════════════════════════════════
// PERSONAL NOTES / ANNOTATIONS
// ════════════════════════════════════════════════════════════

router.get('/documents/:docId/notes', requireAuth, (req, res) => {
  try {
    const db = new Database(DB_PATH);
    const notes = db.prepare('SELECT * FROM document_notes WHERE document_id = ? AND user_id = ? ORDER BY created_at DESC').all(req.params.docId, req.user.id);
    db.close();
    res.json({ notes });
  } catch (error) { res.status(500).json({ error: 'Failed to get notes' }); }
});

router.post('/documents/:docId/notes', requireAuth, (req, res) => {
  try {
    const { content, color } = req.body;
    if (!content) return res.status(400).json({ error: 'Content is required' });
    const id = uuidv4();
    const db = new Database(DB_PATH);
    db.prepare('INSERT INTO document_notes (id, document_id, user_id, content, color) VALUES (?, ?, ?, ?, ?)').run(id, req.params.docId, req.user.id, content, color || '#fbbf24');
    const note = db.prepare('SELECT * FROM document_notes WHERE id = ?').get(id);
    db.close();
    res.json({ note });
  } catch (error) { res.status(500).json({ error: 'Failed to create note' }); }
});

router.put('/notes/:noteId', requireAuth, (req, res) => {
  try {
    const { content, color } = req.body;
    const db = new Database(DB_PATH);
    const existing = db.prepare('SELECT * FROM document_notes WHERE id = ? AND user_id = ?').get(req.params.noteId, req.user.id);
    if (!existing) { db.close(); return res.status(404).json({ error: 'Note not found' }); }
    db.prepare('UPDATE document_notes SET content = COALESCE(?, content), color = COALESCE(?, color), updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(content, color, req.params.noteId);
    const updated = db.prepare('SELECT * FROM document_notes WHERE id = ?').get(req.params.noteId);
    db.close();
    res.json({ note: updated });
  } catch (error) { res.status(500).json({ error: 'Failed to update note' }); }
});

router.delete('/notes/:noteId', requireAuth, (req, res) => {
  try {
    const db = new Database(DB_PATH);
    db.prepare('DELETE FROM document_notes WHERE id = ? AND user_id = ?').run(req.params.noteId, req.user.id);
    db.close();
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed to delete note' }); }
});

// ════════════════════════════════════════════════════════════
// COMMUNITY LIKES
// ════════════════════════════════════════════════════════════

router.post('/community/:docId/like', requireAuth, (req, res) => {
  try {
    const db = new Database(DB_PATH);
    try {
      db.prepare('INSERT INTO community_likes (document_id, user_id) VALUES (?, ?)').run(req.params.docId, req.user.id);
    } catch (e) { /* already liked — ignore unique constraint */ }
    const count = db.prepare('SELECT COUNT(*) as count FROM community_likes WHERE document_id = ?').get(req.params.docId);
    db.close();
    res.json({ liked: true, likeCount: count.count });
  } catch (error) { res.status(500).json({ error: 'Failed to like' }); }
});

router.delete('/community/:docId/like', requireAuth, (req, res) => {
  try {
    const db = new Database(DB_PATH);
    db.prepare('DELETE FROM community_likes WHERE document_id = ? AND user_id = ?').run(req.params.docId, req.user.id);
    const count = db.prepare('SELECT COUNT(*) as count FROM community_likes WHERE document_id = ?').get(req.params.docId);
    db.close();
    res.json({ liked: false, likeCount: count.count });
  } catch (error) { res.status(500).json({ error: 'Failed to unlike' }); }
});

router.get('/community/:docId/likes', (req, res) => {
  try {
    const db = new Database(DB_PATH);
    const count = db.prepare('SELECT COUNT(*) as count FROM community_likes WHERE document_id = ?').get(req.params.docId);
    let userLiked = false;
    // Check if user logged in has liked
    if (req.headers.authorization) {
      try {
        // Simple extraction — the actual auth check is in middleware
        const { optionalAuth } = require('../services/authService.js');
      } catch (e) { }
    }
    db.close();
    res.json({ likeCount: count.count });
  } catch (error) { res.status(500).json({ error: 'Failed' }); }
});

// ════════════════════════════════════════════════════════════
// COMMUNITY COMMENTS
// ════════════════════════════════════════════════════════════

router.get('/community/:docId/comments', (req, res) => {
  try {
    const db = new Database(DB_PATH);
    const comments = db.prepare(`
      SELECT c.*, u.display_name as author, u.username, u.avatar_url as author_avatar
      FROM community_comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.document_id = ?
      ORDER BY c.created_at DESC
      LIMIT 50
    `).all(req.params.docId);
    db.close();
    res.json({ comments });
  } catch (error) { res.status(500).json({ error: 'Failed to get comments' }); }
});

router.post('/community/:docId/comments', requireAuth, (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Nội dung không được để trống' });
    const id = uuidv4();
    const db = new Database(DB_PATH);
    db.prepare('INSERT INTO community_comments (id, document_id, user_id, content) VALUES (?, ?, ?, ?)').run(id, req.params.docId, req.user.id, content.trim());
    const comment = db.prepare(`
      SELECT c.*, u.display_name as author, u.username, u.avatar_url as author_avatar
      FROM community_comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?
    `).get(id);
    db.close();
    res.json({ comment });
  } catch (error) { res.status(500).json({ error: 'Failed to post comment' }); }
});

router.delete('/community/comments/:commentId', requireAuth, (req, res) => {
  try {
    const db = new Database(DB_PATH);
    // Allow author or admin to delete
    const comment = db.prepare('SELECT * FROM community_comments WHERE id = ?').get(req.params.commentId);
    if (!comment) { db.close(); return res.status(404).json({ error: 'Comment not found' }); }
    if (comment.user_id !== req.user.id && req.user.role !== 'admin') {
      db.close(); return res.status(403).json({ error: 'Not authorized' });
    }
    db.prepare('DELETE FROM community_comments WHERE id = ?').run(req.params.commentId);
    db.close();
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed to delete comment' }); }
});

// ════════════════════════════════════════════════════════════
// LEARNING GOALS + STREAKS
// ════════════════════════════════════════════════════════════

router.get('/goals', requireAuth, (req, res) => {
  try {
    const db = new Database(DB_PATH);
    let goals = db.prepare('SELECT * FROM user_goals WHERE user_id = ?').get(req.user.id);
    if (!goals) {
      db.prepare('INSERT INTO user_goals (user_id) VALUES (?)').run(req.user.id);
      goals = db.prepare('SELECT * FROM user_goals WHERE user_id = ?').get(req.user.id);
    }
    let streak = db.prepare('SELECT * FROM user_streaks WHERE user_id = ?').get(req.user.id);
    if (!streak) {
      db.prepare('INSERT INTO user_streaks (user_id) VALUES (?)').run(req.user.id);
      streak = db.prepare('SELECT * FROM user_streaks WHERE user_id = ?').get(req.user.id);
    }
    const today = new Date().toISOString().split('T')[0];
    let todayActivity = db.prepare('SELECT * FROM daily_activity WHERE user_id = ? AND activity_date = ?').get(req.user.id, today);
    if (!todayActivity) todayActivity = { flashcards_reviewed: 0, quizzes_completed: 0, documents_uploaded: 0, chat_messages: 0, study_minutes: 0 };
    db.close();
    res.json({ goals, streak, todayActivity });
  } catch (error) { res.status(500).json({ error: 'Failed to get goals' }); }
});

router.put('/goals', requireAuth, (req, res) => {
  try {
    const { daily_flashcards, daily_quizzes, daily_documents } = req.body;
    const db = new Database(DB_PATH);
    db.prepare(`INSERT INTO user_goals (user_id, daily_flashcards, daily_quizzes, daily_documents, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET daily_flashcards=excluded.daily_flashcards, daily_quizzes=excluded.daily_quizzes, daily_documents=excluded.daily_documents, updated_at=CURRENT_TIMESTAMP
    `).run(req.user.id, daily_flashcards || 20, daily_quizzes || 3, daily_documents || 2);
    const goals = db.prepare('SELECT * FROM user_goals WHERE user_id = ?').get(req.user.id);
    db.close();
    res.json({ goals });
  } catch (error) { res.status(500).json({ error: 'Failed to update goals' }); }
});

router.post('/activity/track', requireAuth, (req, res) => {
  try {
    const { type } = req.body; // 'flashcard' | 'quiz' | 'document' | 'chat' | 'study_minutes'
    const today = new Date().toISOString().split('T')[0];
    const db = new Database(DB_PATH);

    // Upsert daily activity
    db.prepare(`INSERT INTO daily_activity (user_id, activity_date) VALUES (?, ?)
      ON CONFLICT(user_id, activity_date) DO NOTHING`).run(req.user.id, today);

    const colMap = { flashcard: 'flashcards_reviewed', quiz: 'quizzes_completed', document: 'documents_uploaded', chat: 'chat_messages', study_minutes: 'study_minutes' };
    const col = colMap[type];
    if (col) {
      db.prepare(`UPDATE daily_activity SET ${col} = ${col} + 1 WHERE user_id = ? AND activity_date = ?`).run(req.user.id, today);
    }

    // Update streak
    let streak = db.prepare('SELECT * FROM user_streaks WHERE user_id = ?').get(req.user.id);
    if (!streak) {
      db.prepare('INSERT INTO user_streaks (user_id, current_streak, longest_streak, last_activity_date) VALUES (?, 1, 1, ?)').run(req.user.id, today);
    } else {
      const lastDate = streak.last_activity_date;
      if (lastDate !== today) {
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        let newStreak = lastDate === yesterday ? streak.current_streak + 1 : 1;
        const longest = Math.max(newStreak, streak.longest_streak);
        db.prepare('UPDATE user_streaks SET current_streak = ?, longest_streak = ?, last_activity_date = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(newStreak, longest, today, req.user.id);
      }
    }

    const activity = db.prepare('SELECT * FROM daily_activity WHERE user_id = ? AND activity_date = ?').get(req.user.id, today);
    const updatedStreak = db.prepare('SELECT * FROM user_streaks WHERE user_id = ?').get(req.user.id);
    db.close();
    res.json({ activity, streak: updatedStreak });
  } catch (error) { res.status(500).json({ error: 'Failed to track activity' }); }
});

router.get('/activity/history', requireAuth, (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const db = new Database(DB_PATH);
    const history = db.prepare(`SELECT * FROM daily_activity WHERE user_id = ? AND activity_date >= date('now', ?) ORDER BY activity_date DESC`).all(req.user.id, `-${days} days`);
    db.close();
    res.json({ history });
  } catch (error) { res.status(500).json({ error: 'Failed to get activity history' }); }
});

// ════════════════════════════════════════════════════════════
// LEADERBOARD
// ════════════════════════════════════════════════════════════

router.get('/leaderboard', (req, res) => {
  try {
    const period = req.query.period || 'all'; // 'week' | 'month' | 'all'
    const db = new Database(DB_PATH);

    let dateFilter = '';
    if (period === 'week') dateFilter = "AND da.activity_date >= date('now', '-7 days')";
    else if (period === 'month') dateFilter = "AND da.activity_date >= date('now', '-30 days')";

    const leaderboard = db.prepare(`
      SELECT u.id, u.display_name, u.username, u.avatar_url, u.plan,
        COALESCE(SUM(da.flashcards_reviewed), 0) as total_flashcards,
        COALESCE(SUM(da.quizzes_completed), 0) as total_quizzes,
        COALESCE(SUM(da.documents_uploaded), 0) as total_documents,
        COALESCE(SUM(da.flashcards_reviewed + da.quizzes_completed * 5 + da.documents_uploaded * 10 + da.chat_messages), 0) as total_score,
        COALESCE(s.current_streak, 0) as current_streak,
        COALESCE(s.longest_streak, 0) as longest_streak
      FROM users u
      LEFT JOIN daily_activity da ON u.id = da.user_id ${dateFilter}
      LEFT JOIN user_streaks s ON u.id = s.user_id
      WHERE u.is_banned = 0
      GROUP BY u.id
      HAVING total_score > 0
      ORDER BY total_score DESC
      LIMIT 50
    `).all();
    db.close();
    res.json({ leaderboard });
  } catch (error) { res.status(500).json({ error: 'Failed to get leaderboard' }); }
});

// ════════════════════════════════════════════════════════════
// ANNOUNCEMENTS
// ════════════════════════════════════════════════════════════

router.get('/announcements', optionalAuth, (req, res) => {
  try {
    const db = new Database(DB_PATH);
    const userPlan = req.user ? req.user.plan : null;
    const isLoggedIn = !!req.user;

    // Get all active, non-expired announcements
    const announcements = db.prepare(`
      SELECT a.*, u.display_name as author_name
      FROM announcements a
      JOIN users u ON a.created_by = u.id
      WHERE a.is_active = 1 AND (a.expires_at IS NULL OR a.expires_at > datetime('now'))
      ORDER BY a.priority DESC, a.created_at DESC
      LIMIT 20
    `).all();

    // Filter by target audience
    const filtered = announcements.filter(ann => {
      if (ann.target_audience === 'all') return true;
      if (ann.target_audience === 'registered') return isLoggedIn;
      // Specific plan targets: free, basic, pro, unlimited
      if (['free', 'basic', 'pro', 'unlimited'].includes(ann.target_audience)) {
        return isLoggedIn && userPlan === ann.target_audience;
      }
      return false;
    });

    db.close();
    res.json({ announcements: filtered });
  } catch (error) { res.status(500).json({ error: 'Failed to get announcements' }); }
});

// ==== SECURITY: URL validation helper ====
function isValidUrl(url) {
  if (!url) return true; // Optional field
  try {
    const parsed = new URL(url);
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

router.post('/announcements', requireAuth, requireAdmin, (req, res) => {
  try {
    const { title, content, type, expires_at, target_audience, dismissible, auto_dismiss_days, link_url, link_text, priority } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Title and content required' });
    if (title.length > 200) return res.status(400).json({ error: 'Title must be 200 characters or less' });
    if (content.length > 2000) return res.status(400).json({ error: 'Content must be 2000 characters or less' });
    if (link_url && !isValidUrl(link_url)) return res.status(400).json({ error: 'Invalid URL format' });
    const id = uuidv4();
    const db = new Database(DB_PATH);
    db.prepare(`
      INSERT INTO announcements 
      (id, title, content, type, created_by, expires_at, target_audience, dismissible, auto_dismiss_days, link_url, link_text, priority) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      title,
      content,
      type || 'info',
      req.user.id,
      expires_at || null,
      target_audience || 'registered',
      dismissible !== undefined ? dismissible : 1,
      auto_dismiss_days || null,
      link_url || null,
      link_text || null,
      priority || 0
    );
    // Audit log
    db.prepare('INSERT INTO admin_audit_logs (id, admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?)').run(uuidv4(), req.user.id, 'create_announcement', 'announcement', id, JSON.stringify({ title, target_audience }));
    const announcement = db.prepare('SELECT a.*, u.display_name as author_name FROM announcements a JOIN users u ON a.created_by = u.id WHERE a.id = ?').get(id);
    db.close();
    res.json({ announcement });
  } catch (error) { res.status(500).json({ error: 'Failed to create announcement' }); }
});

router.put('/announcements/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const { title, content, type, is_active, expires_at, target_audience, dismissible, auto_dismiss_days, link_url, link_text, priority } = req.body;
    if (title && title.length > 200) return res.status(400).json({ error: 'Title must be 200 characters or less' });
    if (content && content.length > 2000) return res.status(400).json({ error: 'Content must be 2000 characters or less' });
    if (link_url && !isValidUrl(link_url)) return res.status(400).json({ error: 'Invalid URL format' });
    const db = new Database(DB_PATH);
    db.prepare(`
      UPDATE announcements SET 
        title=COALESCE(?,title), 
        content=COALESCE(?,content), 
        type=COALESCE(?,type), 
        is_active=COALESCE(?,is_active), 
        expires_at=COALESCE(?,expires_at),
        target_audience=COALESCE(?,target_audience),
        dismissible=COALESCE(?,dismissible),
        auto_dismiss_days=COALESCE(?,auto_dismiss_days),
        link_url=COALESCE(?,link_url),
        link_text=COALESCE(?,link_text),
        priority=COALESCE(?,priority)
      WHERE id = ?
    `).run(title, content, type, is_active, expires_at, target_audience, dismissible, auto_dismiss_days, link_url, link_text, priority, req.params.id);
    db.prepare('INSERT INTO admin_audit_logs (id, admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?)').run(uuidv4(), req.user.id, 'update_announcement', 'announcement', req.params.id, JSON.stringify({ title }));
    const updated = db.prepare('SELECT a.*, u.display_name as author_name FROM announcements a JOIN users u ON a.created_by = u.id WHERE a.id = ?').get(req.params.id);
    db.close();
    res.json({ announcement: updated });
  } catch (error) { res.status(500).json({ error: 'Failed to update announcement' }); }
});

router.delete('/announcements/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const db = new Database(DB_PATH);
    db.prepare('INSERT INTO admin_audit_logs (id, admin_id, action, target_type, target_id) VALUES (?, ?, ?, ?, ?)').run(uuidv4(), req.user.id, 'delete_announcement', 'announcement', req.params.id);
    db.prepare('DELETE FROM announcements WHERE id = ?').run(req.params.id);
    db.close();
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed to delete announcement' }); }
});

router.post('/announcements/:id/read', requireAuth, (req, res) => {
  try {
    const db = new Database(DB_PATH);
    db.prepare('INSERT OR IGNORE INTO announcement_reads (user_id, announcement_id) VALUES (?, ?)').run(req.user.id, req.params.id);
    db.close();
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed' }); }
});

// ════════════════════════════════════════════════════════════
// ADMIN: STATS DASHBOARD
// ════════════════════════════════════════════════════════════

router.get('/admin/stats', requireAuth, requireAdmin, (req, res) => {
  try {
    const db = new Database(DB_PATH);
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const newUsersToday = db.prepare("SELECT COUNT(*) as count FROM users WHERE created_at >= date('now')").get().count;
    const newUsersWeek = db.prepare("SELECT COUNT(*) as count FROM users WHERE created_at >= date('now', '-7 days')").get().count;
    const totalDocuments = db.prepare('SELECT COUNT(*) as count FROM documents').get().count;
    const activeDocuments = db.prepare("SELECT COUNT(*) as count FROM documents WHERE status = 'ready'").get().count;
    const publicDocuments = db.prepare('SELECT COUNT(*) as count FROM documents WHERE is_public = 1').get().count;
    const totalUploadsToday = db.prepare("SELECT COUNT(*) as count FROM upload_logs WHERE uploaded_at >= date('now')").get().count;
    const totalComments = db.prepare('SELECT COUNT(*) as count FROM community_comments').get().count;
    const totalLikes = db.prepare('SELECT COUNT(*) as count FROM community_likes').get().count;

    // Plan distribution
    const planDist = db.prepare("SELECT plan, COUNT(*) as count FROM users GROUP BY plan").all();

    // User registration trend (last 30 days)
    const regTrend = db.prepare(`
      SELECT date(created_at) as date, COUNT(*) as count
      FROM users WHERE created_at >= date('now', '-30 days')
      GROUP BY date(created_at) ORDER BY date ASC
    `).all();

    // Top active users (last 7 days)
    const topUsers = db.prepare(`
      SELECT u.id, u.display_name, u.username, u.plan,
        COALESCE(SUM(da.flashcards_reviewed + da.quizzes_completed + da.documents_uploaded + da.chat_messages), 0) as activity_score
      FROM users u
      LEFT JOIN daily_activity da ON u.id = da.user_id AND da.activity_date >= date('now', '-7 days')
      GROUP BY u.id ORDER BY activity_score DESC LIMIT 10
    `).all();

    db.close();
    res.json({
      totalUsers, newUsersToday, newUsersWeek,
      totalDocuments, activeDocuments, publicDocuments,
      totalUploadsToday, totalComments, totalLikes,
      planDistribution: planDist, registrationTrend: regTrend, topUsers
    });
  } catch (error) { res.status(500).json({ error: 'Failed to get admin stats' }); }
});

// ════════════════════════════════════════════════════════════
// ADMIN: DOCUMENT MANAGEMENT
// ════════════════════════════════════════════════════════════

router.get('/admin/documents', requireAuth, requireAdmin, (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';
    const filter = req.query.filter || 'all'; // 'all' | 'public' | 'deleted'
    const offset = (page - 1) * limit;
    const db = new Database(DB_PATH);

    let where = '1=1';
    const params = [];
    if (search) { where += ' AND d.original_name LIKE ?'; params.push(`%${search}%`); }
    if (filter === 'public') { where += ' AND d.is_public = 1'; }
    if (filter === 'deleted') { where += ' AND d.deleted_at IS NOT NULL'; }

    const total = db.prepare(`SELECT COUNT(*) as count FROM documents d WHERE ${where}`).get(...params).count;
    const docs = db.prepare(`
      SELECT d.*, u.display_name as owner_name, u.username as owner_username,
        (SELECT COUNT(*) FROM community_likes WHERE document_id = d.id) as like_count,
        (SELECT COUNT(*) FROM community_comments WHERE document_id = d.id) as comment_count
      FROM documents d
      LEFT JOIN users u ON d.user_id = u.id
      WHERE ${where}
      ORDER BY d.created_at DESC LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
    db.close();
    res.json({ documents: docs, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) { res.status(500).json({ error: 'Failed to get documents' }); }
});

router.delete('/admin/documents/:docId', requireAuth, requireAdmin, (req, res) => {
  try {
    const db = new Database(DB_PATH);
    db.prepare('INSERT INTO admin_audit_logs (id, admin_id, action, target_type, target_id) VALUES (?, ?, ?, ?, ?)').run(uuidv4(), req.user.id, 'delete_document', 'document', req.params.docId);
    db.prepare("UPDATE documents SET deleted_at = CURRENT_TIMESTAMP, is_public = 0 WHERE id = ?").run(req.params.docId);
    db.close();
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed to delete document' }); }
});

router.put('/admin/documents/:docId/toggle-public', requireAuth, requireAdmin, (req, res) => {
  try {
    const db = new Database(DB_PATH);
    const doc = db.prepare('SELECT is_public FROM documents WHERE id = ?').get(req.params.docId);
    if (!doc) { db.close(); return res.status(404).json({ error: 'Not found' }); }
    const newPublic = doc.is_public ? 0 : 1;
    db.prepare('UPDATE documents SET is_public = ? WHERE id = ?').run(newPublic, req.params.docId);
    db.prepare('INSERT INTO admin_audit_logs (id, admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?)').run(uuidv4(), req.user.id, newPublic ? 'make_public' : 'make_private', 'document', req.params.docId, '{}');
    db.close();
    res.json({ success: true, is_public: !!newPublic });
  } catch (error) { res.status(500).json({ error: 'Failed' }); }
});

// ════════════════════════════════════════════════════════════
// ADMIN: AUDIT LOG
// ════════════════════════════════════════════════════════════

router.get('/admin/audit-logs', requireAuth, requireAdmin, (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const db = new Database(DB_PATH);
    const total = db.prepare('SELECT COUNT(*) as count FROM admin_audit_logs').get().count;
    const logs = db.prepare(`
      SELECT a.*, u.display_name as admin_name, u.username as admin_username
      FROM admin_audit_logs a
      JOIN users u ON a.admin_id = u.id
      ORDER BY a.created_at DESC LIMIT ? OFFSET ?
    `).all(limit, offset);
    db.close();
    res.json({ logs, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) { res.status(500).json({ error: 'Failed to get audit logs' }); }
});

// ════════════════════════════════════════════════════════════
// EXPORT: MARKDOWN / SUMMARY
// ════════════════════════════════════════════════════════════

router.get('/export/markdown/:docId', requireAuth, (req, res) => {
  try {
    const db = new Database(DB_PATH);
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.docId);
    if (!doc) { db.close(); return res.status(404).json({ error: 'Document not found' }); }

    // Gather all sessions
    const sessions = {};
    const rows = db.prepare('SELECT session_type, data FROM document_sessions WHERE document_id = ?').all(req.params.docId);
    for (const row of rows) {
      try { sessions[row.session_type] = JSON.parse(row.data); } catch (e) { }
    }

    // Build markdown
    let md = `# ${doc.original_name}\n\n`;
    md += `> Exported from NoteMinds on ${new Date().toLocaleDateString('vi-VN')}\n\n`;

    // Mindmap
    if (sessions.mindmap) {
      md += `## 🗺️ Sơ đồ tư duy\n\n`;
      if (sessions.mindmap.title) md += `**${sessions.mindmap.title}**\n\n`;
      // Recursively walk the hierarchical node tree
      const walkNodes = (nodes, depth = 0) => {
        if (!nodes) return;
        for (const n of nodes) {
          if (n.label) {
            const indent = '  '.repeat(depth);
            md += `${indent}- ${n.label}\n`;
          }
          if (n.children?.length) walkNodes(n.children, depth + 1);
        }
      };
      if (sessions.mindmap.nodes) {
        walkNodes(sessions.mindmap.nodes);
        md += '\n';
      }
    }

    // Flashcards
    if (sessions.flashcards?.data) {
      md += `## 📝 Flashcards (${sessions.flashcards.data.length} thẻ)\n\n`;
      sessions.flashcards.data.forEach((card, i) => {
        md += `### Thẻ ${i + 1}\n`;
        md += `**Q:** ${card.front}\n\n`;
        md += `**A:** ${card.back}\n\n---\n\n`;
      });
    }

    // Quiz
    if (sessions.quiz?.data) {
      md += `## 🧠 Quiz (${sessions.quiz.data.length} câu)\n\n`;
      sessions.quiz.data.forEach((q, i) => {
        md += `**${i + 1}. ${q.question}**\n`;
        if (q.options) q.options.forEach((o, j) => {
          const letter = String.fromCharCode(65 + j);
          md += `  ${letter}. ${o}${j === q.correctAnswer ? ' ✓' : ''}\n`;
        });
        if (q.explanation) md += `\n_Giải thích: ${q.explanation}_\n`;
        md += '\n';
      });
    }

    // Notes
    const notes = db.prepare('SELECT * FROM document_notes WHERE document_id = ? ORDER BY created_at').all(req.params.docId);
    if (notes.length > 0) {
      md += `## 📌 Ghi chú cá nhân\n\n`;
      notes.forEach(n => md += `- ${n.content}\n`);
      md += '\n';
    }

    db.close();
    res.json({ markdown: md, filename: `${doc.original_name}.md` });
  } catch (error) { res.status(500).json({ error: 'Export failed' }); }
});

// ════════════════════════════════════════════════════════════
// ADMIN: REAL-TIME DASHBOARD
// ════════════════════════════════════════════════════════════

const serverStartTime = Date.now();

router.get('/admin/realtime', requireAuth, requireAdmin, (req, res) => {
  try {
    const db = new Database(DB_PATH);
    const now = new Date();
    const oneHourAgo = new Date(now - 3600000).toISOString();
    const uploadsLastHour = db.prepare("SELECT COUNT(*) as count FROM upload_logs WHERE uploaded_at >= ?").get(oneHourAgo).count;
    const chatMsgsLastHour = db.prepare("SELECT COUNT(*) as count FROM daily_activity WHERE activity_date = date('now')").get().count;
    const aiCallsLastHour = db.prepare("SELECT COUNT(*) as count FROM ai_usage_logs WHERE created_at >= ?").get(oneHourAgo).count;
    const aiErrorsLastHour = db.prepare("SELECT COUNT(*) as count FROM ai_usage_logs WHERE created_at >= ? AND success = 0").get(oneHourAgo).count;
    const onlineRecent = db.prepare("SELECT COUNT(DISTINCT user_id) as count FROM daily_activity WHERE activity_date = date('now')").get().count;
    // Sparkline: last 12 hours activity
    const sparkline = [];
    for (let i = 11; i >= 0; i--) {
      const from = new Date(now - (i + 1) * 3600000).toISOString();
      const to = new Date(now - i * 3600000).toISOString();
      const c = db.prepare("SELECT COUNT(*) as count FROM ai_usage_logs WHERE created_at >= ? AND created_at < ?").get(from, to).count;
      sparkline.push(c);
    }
    db.close();
    res.json({
      uploadsLastHour, chatMsgsLastHour, aiCallsLastHour, aiErrorsLastHour,
      activeUsersToday: onlineRecent,
      sparkline,
      uptime: Date.now() - serverStartTime
    });
  } catch (error) { res.status(500).json({ error: 'Failed to get realtime stats' }); }
});

// ════════════════════════════════════════════════════════════
// ADMIN: BULK ACTIONS
// ════════════════════════════════════════════════════════════

router.post('/admin/bulk/users/plan', requireAuth, requireAdmin, (req, res) => {
  try {
    const { userIds, plan } = req.body;
    if (!userIds || !Array.isArray(userIds) || !plan) return res.status(400).json({ error: 'userIds and plan required' });
    const db = new Database(DB_PATH);
    const stmt = db.prepare('UPDATE users SET plan = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    const run = db.transaction((ids) => { for (const id of ids) stmt.run(plan, id); });
    run(userIds);
    db.prepare('INSERT INTO admin_audit_logs (id, admin_id, action, target_type, details) VALUES (?, ?, ?, ?, ?)').run(uuidv4(), req.user.id, 'bulk_set_plan', 'user', JSON.stringify({ userIds, plan }));
    db.close();
    res.json({ success: true, affected: userIds.length });
  } catch (error) { res.status(500).json({ error: 'Bulk plan update failed' }); }
});

router.post('/admin/bulk/users/ban', requireAuth, requireAdmin, (req, res) => {
  try {
    const { userIds, reason } = req.body;
    if (!userIds || !Array.isArray(userIds)) return res.status(400).json({ error: 'userIds required' });
    const db = new Database(DB_PATH);
    const stmt = db.prepare('UPDATE users SET is_banned = 1, ban_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    const run = db.transaction((ids) => { for (const id of ids) stmt.run(reason || 'Bulk ban', id); });
    run(userIds);
    db.prepare('INSERT INTO admin_audit_logs (id, admin_id, action, target_type, details) VALUES (?, ?, ?, ?, ?)').run(uuidv4(), req.user.id, 'bulk_ban', 'user', JSON.stringify({ userIds }));
    db.close();
    res.json({ success: true, affected: userIds.length });
  } catch (error) { res.status(500).json({ error: 'Bulk ban failed' }); }
});

router.post('/admin/bulk/docs/delete', requireAuth, requireAdmin, (req, res) => {
  try {
    const { docIds } = req.body;
    if (!docIds || !Array.isArray(docIds)) return res.status(400).json({ error: 'docIds required' });
    const db = new Database(DB_PATH);
    const stmt = db.prepare("UPDATE documents SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?");
    const run = db.transaction((ids) => { for (const id of ids) stmt.run(id); });
    run(docIds);
    db.prepare('INSERT INTO admin_audit_logs (id, admin_id, action, target_type, details) VALUES (?, ?, ?, ?, ?)').run(uuidv4(), req.user.id, 'bulk_delete_docs', 'document', JSON.stringify({ count: docIds.length }));
    db.close();
    res.json({ success: true, affected: docIds.length });
  } catch (error) { res.status(500).json({ error: 'Bulk delete failed' }); }
});

router.post('/admin/bulk/docs/toggle-public', requireAuth, requireAdmin, (req, res) => {
  try {
    const { docIds, is_public } = req.body;
    if (!docIds || !Array.isArray(docIds)) return res.status(400).json({ error: 'docIds required' });
    const db = new Database(DB_PATH);
    const stmt = db.prepare("UPDATE documents SET is_public = ? WHERE id = ?");
    const run = db.transaction((ids) => { for (const id of ids) stmt.run(is_public ? 1 : 0, id); });
    run(docIds);
    db.prepare('INSERT INTO admin_audit_logs (id, admin_id, action, target_type, details) VALUES (?, ?, ?, ?, ?)').run(uuidv4(), req.user.id, is_public ? 'bulk_make_public' : 'bulk_make_private', 'document', JSON.stringify({ count: docIds.length }));
    db.close();
    res.json({ success: true, affected: docIds.length });
  } catch (error) { res.status(500).json({ error: 'Bulk toggle failed' }); }
});

// ════════════════════════════════════════════════════════════
// ADMIN: USER DETAIL
// ════════════════════════════════════════════════════════════

router.get('/admin/users/:userId', requireAuth, requireAdmin, (req, res) => {
  try {
    const db = new Database(DB_PATH);
    const user = db.prepare('SELECT id, username, email, display_name, avatar_url, plan, plan_expires_at, role, is_banned, ban_reason, created_at, updated_at, email_verified FROM users WHERE id = ?').get(req.params.userId);
    if (!user) { db.close(); return res.status(404).json({ error: 'User not found' }); }
    const documents = db.prepare('SELECT id, original_name, status, is_public, created_at FROM documents WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(user.id);
    const recentActivity = db.prepare('SELECT * FROM daily_activity WHERE user_id = ? ORDER BY activity_date DESC LIMIT 30').all(user.id);
    const loginHistory = db.prepare('SELECT * FROM login_activity WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(user.id);
    const streak = db.prepare('SELECT * FROM user_streaks WHERE user_id = ?').get(user.id);
    const totalAiCalls = db.prepare('SELECT COUNT(*) as count, SUM(total_tokens) as tokens FROM ai_usage_logs WHERE user_id = ?').get(user.id);
    const totalDocs = documents.length;
    db.close();
    res.json({ user, documents, recentActivity, loginHistory, streak, aiUsage: totalAiCalls, totalDocs });
  } catch (error) { res.status(500).json({ error: 'Failed to get user details' }); }
});

// ════════════════════════════════════════════════════════════
// ADMIN: AI USAGE MONITORING
// ════════════════════════════════════════════════════════════

router.get('/admin/ai-usage', requireAuth, requireAdmin, (req, res) => {
  try {
    const db = new Database(DB_PATH);
    const days = parseInt(req.query.days) || 7;
    const totalCalls = db.prepare("SELECT COUNT(*) as count FROM ai_usage_logs WHERE created_at >= date('now', ?)").get(`-${days} days`).count;
    const totalTokens = db.prepare("SELECT COALESCE(SUM(total_tokens), 0) as total FROM ai_usage_logs WHERE created_at >= date('now', ?)").get(`-${days} days`).total;
    const avgLatency = db.prepare("SELECT COALESCE(AVG(latency_ms), 0) as avg FROM ai_usage_logs WHERE created_at >= date('now', ?) AND success = 1").get(`-${days} days`).avg;
    const errorRate = db.prepare("SELECT COUNT(*) as count FROM ai_usage_logs WHERE created_at >= date('now', ?) AND success = 0").get(`-${days} days`).count;
    const byAction = db.prepare("SELECT action, COUNT(*) as count, SUM(total_tokens) as tokens, AVG(latency_ms) as avg_latency FROM ai_usage_logs WHERE created_at >= date('now', ?) GROUP BY action ORDER BY count DESC").all(`-${days} days`);
    const daily = db.prepare("SELECT date(created_at) as date, COUNT(*) as calls, SUM(total_tokens) as tokens FROM ai_usage_logs WHERE created_at >= date('now', ?) GROUP BY date(created_at) ORDER BY date ASC").all(`-${days} days`);
    const topUsers = db.prepare(`
      SELECT u.id, u.display_name, u.username, COUNT(*) as calls, SUM(a.total_tokens) as tokens
      FROM ai_usage_logs a JOIN users u ON a.user_id = u.id
      WHERE a.created_at >= date('now', ?) GROUP BY u.id ORDER BY calls DESC LIMIT 10
    `).all(`-${days} days`);
    db.close();
    res.json({ totalCalls, totalTokens, avgLatency: Math.round(avgLatency), errorRate, byAction, daily, topUsers });
  } catch (error) { res.status(500).json({ error: 'Failed to get AI usage' }); }
});

// ════════════════════════════════════════════════════════════
// ADMIN: CONTENT MODERATION
// ════════════════════════════════════════════════════════════

router.get('/admin/reports', requireAuth, requireAdmin, (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;
    const db = new Database(DB_PATH);
    const total = db.prepare('SELECT COUNT(*) as count FROM content_reports WHERE status = ?').get(status).count;
    const reports = db.prepare(`
      SELECT r.*, u.display_name as reporter_name, u.username as reporter_username
      FROM content_reports r JOIN users u ON r.reporter_id = u.id
      WHERE r.status = ? ORDER BY r.created_at DESC LIMIT ? OFFSET ?
    `).all(status, limit, offset);
    db.close();
    res.json({ reports, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) { res.status(500).json({ error: 'Failed to get reports' }); }
});

router.post('/community/report', requireAuth, (req, res) => {
  try {
    const { targetType, targetId, reason, details } = req.body;
    if (!targetType || !targetId || !reason) return res.status(400).json({ error: 'Missing fields' });
    const id = uuidv4();
    const db = new Database(DB_PATH);
    db.prepare('INSERT INTO content_reports (id, reporter_id, target_type, target_id, reason, details) VALUES (?, ?, ?, ?, ?, ?)').run(id, req.user.id, targetType, targetId, reason, details || null);
    db.close();
    res.json({ success: true, reportId: id });
  } catch (error) { res.status(500).json({ error: 'Failed to submit report' }); }
});

router.put('/admin/reports/:reportId', requireAuth, requireAdmin, (req, res) => {
  try {
    const { status } = req.body; // 'approved' | 'rejected' | 'resolved'
    const db = new Database(DB_PATH);
    db.prepare('UPDATE content_reports SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, req.user.id, req.params.reportId);
    const report = db.prepare('SELECT * FROM content_reports WHERE id = ?').get(req.params.reportId);
    // If approved and target is comment, delete it
    if (status === 'approved' && report?.target_type === 'comment') {
      db.prepare('DELETE FROM community_comments WHERE id = ?').run(report.target_id);
    }
    if (status === 'approved' && report?.target_type === 'document') {
      db.prepare('UPDATE documents SET is_public = 0 WHERE id = ?').run(report.target_id);
    }
    db.prepare('INSERT INTO admin_audit_logs (id, admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?)').run(uuidv4(), req.user.id, `report_${status}`, 'report', req.params.reportId, JSON.stringify({ target: report?.target_type }));
    db.close();
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed to update report' }); }
});

// ════════════════════════════════════════════════════════════
// ADMIN: SYSTEM HEALTH
// ════════════════════════════════════════════════════════════

router.get('/admin/system-health', requireAuth, requireAdmin, (req, res) => {
  try {
    const uptime = process.uptime();
    const memUsage = process.memoryUsage();
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const loadAvg = os.loadavg();

    // DB file size
    let dbSize = 0;
    try { dbSize = fs.statSync(DB_PATH).size; } catch { }

    // Uploads folder size
    let uploadsSize = 0;
    const uploadsDir = path.join(__dirname, '../uploads');
    try {
      const files = fs.readdirSync(uploadsDir);
      for (const f of files) {
        try { uploadsSize += fs.statSync(path.join(uploadsDir, f)).size; } catch { }
      }
    } catch { }

    // Recent errors from ai_usage_logs
    const db = new Database(DB_PATH);
    const recentErrors = db.prepare("SELECT action, error_message, created_at FROM ai_usage_logs WHERE success = 0 ORDER BY created_at DESC LIMIT 10").all();
    const totalErrors24h = db.prepare("SELECT COUNT(*) as count FROM ai_usage_logs WHERE success = 0 AND created_at >= datetime('now', '-1 day')").get().count;
    const totalCalls24h = db.prepare("SELECT COUNT(*) as count FROM ai_usage_logs WHERE created_at >= datetime('now', '-1 day')").get().count;
    const avgResponseTime = db.prepare("SELECT COALESCE(AVG(latency_ms), 0) as avg FROM ai_usage_logs WHERE success = 1 AND created_at >= datetime('now', '-1 day')").get().avg;
    db.close();

    res.json({
      uptime,
      memory: {
        rss: memUsage.rss,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
      },
      system: {
        totalMem,
        freeMem,
        cpuCount: cpus.length,
        cpuModel: cpus[0]?.model || 'Unknown',
        loadAvg,
        platform: os.platform(),
        nodeVersion: process.version,
      },
      storage: { dbSize, uploadsSize },
      errors: { recentErrors, totalErrors24h, totalCalls24h, avgResponseTime: Math.round(avgResponseTime) },
    });
  } catch (error) { res.status(500).json({ error: 'Failed to get system health' }); }
});

// ════════════════════════════════════════════════════════════
// ADMIN: EMAIL BLAST
// ════════════════════════════════════════════════════════════

router.post('/admin/email-blast', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { subject, content, targetFilter } = req.body;
    if (!subject || !content) return res.status(400).json({ error: 'Subject and content required' });
    const id = uuidv4();
    const db = new Database(DB_PATH);

    let whereClause = "WHERE email IS NOT NULL AND email != ''";
    if (targetFilter === 'active') whereClause += " AND id IN (SELECT DISTINCT user_id FROM daily_activity WHERE activity_date >= date('now', '-7 days'))";
    else if (targetFilter === 'inactive') whereClause += " AND id NOT IN (SELECT DISTINCT user_id FROM daily_activity WHERE activity_date >= date('now', '-30 days'))";
    else if (targetFilter && targetFilter.startsWith('plan:')) {
      const plan = targetFilter.replace('plan:', '');
      whereClause += ` AND plan = ?`;
      var planParam = plan;
    }

    const recipients = planParam
      ? db.prepare(`SELECT id, email, username, display_name FROM users ${whereClause}`).all(planParam)
      : db.prepare(`SELECT id, email, username, display_name FROM users ${whereClause}`).all();

    db.prepare('INSERT INTO email_blasts (id, subject, content, target_filter, total_recipients, status, sent_by) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, subject, content, targetFilter || 'all', recipients.length, 'sending', req.user.id);
    db.prepare('INSERT INTO admin_audit_logs (id, admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?)').run(uuidv4(), req.user.id, 'send_email_blast', 'email_blast', id, JSON.stringify({ subject, recipients: recipients.length }));
    db.close();

    // Send asynchronously — don't block response
    res.json({ success: true, blastId: id, totalRecipients: recipients.length });

    // Background sending
    (async () => {
      let sent = 0, failed = 0;
      const { sendBlastEmail } = await import('../services/emailService.js');
      for (const r of recipients) {
        try {
          await sendBlastEmail(r.email, subject, content, r.display_name || r.username);
          sent++;
        } catch { failed++; }
      }
      try {
        const db2 = new Database(DB_PATH);
        db2.prepare('UPDATE email_blasts SET sent_count = ?, failed_count = ?, status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?').run(sent, failed, 'completed', id);
        db2.close();
      } catch { }
    })();
  } catch (error) { res.status(500).json({ error: 'Failed to send blast' }); }
});

router.get('/admin/email-blasts', requireAuth, requireAdmin, (req, res) => {
  try {
    const db = new Database(DB_PATH);
    const blasts = db.prepare(`
      SELECT e.*, u.display_name as sender_name, u.username as sender_username
      FROM email_blasts e JOIN users u ON e.sent_by = u.id
      ORDER BY e.created_at DESC LIMIT 20
    `).all();
    db.close();
    res.json({ blasts });
  } catch (error) { res.status(500).json({ error: 'Failed to get blasts' }); }
});

// ════════════════════════════════════════════════════════════
// ADMIN: FEATURE FLAGS
// ════════════════════════════════════════════════════════════

router.get('/admin/feature-flags', requireAuth, requireAdmin, (req, res) => {
  try {
    const db = new Database(DB_PATH);
    const flags = db.prepare('SELECT * FROM feature_flags ORDER BY name').all();
    db.close();
    res.json({ flags });
  } catch (error) { res.status(500).json({ error: 'Failed to get feature flags' }); }
});

router.post('/admin/feature-flags', requireAuth, requireAdmin, (req, res) => {
  try {
    const { name, description, enabled, plans } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const id = uuidv4();
    const db = new Database(DB_PATH);
    db.prepare('INSERT INTO feature_flags (id, name, description, enabled, plans, updated_by) VALUES (?, ?, ?, ?, ?, ?)').run(id, name, description || '', enabled !== undefined ? (enabled ? 1 : 0) : 1, JSON.stringify(plans || ['free', 'basic', 'pro', 'unlimited']), req.user.id);
    db.prepare('INSERT INTO admin_audit_logs (id, admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?)').run(uuidv4(), req.user.id, 'create_feature_flag', 'feature_flag', id, JSON.stringify({ name }));
    const flag = db.prepare('SELECT * FROM feature_flags WHERE id = ?').get(id);
    db.close();
    res.json({ flag });
  } catch (error) { res.status(500).json({ error: 'Failed to create flag' }); }
});

router.put('/admin/feature-flags/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const { name, description, enabled, plans } = req.body;
    const db = new Database(DB_PATH);
    db.prepare('UPDATE feature_flags SET name=COALESCE(?,name), description=COALESCE(?,description), enabled=COALESCE(?,enabled), plans=COALESCE(?,plans), updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(name, description, enabled !== undefined ? (enabled ? 1 : 0) : null, plans ? JSON.stringify(plans) : null, req.user.id, req.params.id);
    db.prepare('INSERT INTO admin_audit_logs (id, admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?)').run(uuidv4(), req.user.id, 'update_feature_flag', 'feature_flag', req.params.id, JSON.stringify({ name, enabled }));
    const flag = db.prepare('SELECT * FROM feature_flags WHERE id = ?').get(req.params.id);
    db.close();
    res.json({ flag });
  } catch (error) { res.status(500).json({ error: 'Failed to update flag' }); }
});

router.delete('/admin/feature-flags/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const db = new Database(DB_PATH);
    db.prepare('INSERT INTO admin_audit_logs (id, admin_id, action, target_type, target_id) VALUES (?, ?, ?, ?, ?)').run(uuidv4(), req.user.id, 'delete_feature_flag', 'feature_flag', req.params.id);
    db.prepare('DELETE FROM feature_flags WHERE id = ?').run(req.params.id);
    db.close();
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed to delete flag' }); }
});

// Public endpoint to check feature flags for current user
router.get('/feature-flags', (req, res) => {
  try {
    const db = new Database(DB_PATH);
    const flags = db.prepare('SELECT name, enabled, plans FROM feature_flags').all();
    db.close();
    const result = {};
    flags.forEach(f => { result[f.name] = { enabled: !!f.enabled, plans: JSON.parse(f.plans || '[]') }; });
    res.json(result);
  } catch (error) { res.json({}); }
});

// ════════════════════════════════════════════════════════════
// ADMIN: EXPORT DATA (CSV)
// ════════════════════════════════════════════════════════════

router.get('/admin/export/users', requireAuth, requireAdmin, (req, res) => {
  try {
    const db = new Database(DB_PATH);
    const users = db.prepare('SELECT id, username, email, display_name, plan, role, is_banned, created_at FROM users ORDER BY created_at DESC').all();
    db.close();
    let csv = 'ID,Username,Email,Display Name,Plan,Role,Banned,Created At\n';
    for (const u of users) {
      csv += `${u.id},"${u.username}","${u.email || ''}","${u.display_name || ''}",${u.plan},${u.role},${u.is_banned},${u.created_at}\n`;
    }
    db.prepare && 0; // no-op
    res.json({ csv, filename: `users_export_${new Date().toISOString().split('T')[0]}.csv`, count: users.length });
  } catch (error) { res.status(500).json({ error: 'Export failed' }); }
});

router.get('/admin/export/documents', requireAuth, requireAdmin, (req, res) => {
  try {
    const db = new Database(DB_PATH);
    const docs = db.prepare(`
      SELECT d.id, d.original_name, d.status, d.is_public, d.created_at, u.username as owner
      FROM documents d LEFT JOIN users u ON d.user_id = u.id
      WHERE d.deleted_at IS NULL ORDER BY d.created_at DESC
    `).all();
    db.close();
    let csv = 'ID,Title,Status,Public,Owner,Created At\n';
    for (const d of docs) {
      csv += `${d.id},"${(d.original_name || '').replace(/"/g, '""')}",${d.status},${d.is_public ? 'Yes' : 'No'},"${d.owner || ''}",${d.created_at}\n`;
    }
    res.json({ csv, filename: `documents_export_${new Date().toISOString().split('T')[0]}.csv`, count: docs.length });
  } catch (error) { res.status(500).json({ error: 'Export failed' }); }
});

router.get('/admin/export/activity', requireAuth, requireAdmin, (req, res) => {
  try {
    const db = new Database(DB_PATH);
    const activity = db.prepare(`
      SELECT da.*, u.username FROM daily_activity da
      JOIN users u ON da.user_id = u.id
      ORDER BY da.activity_date DESC LIMIT 5000
    `).all();
    db.close();
    let csv = 'Date,Username,Flashcards,Quizzes,Documents,Chat Messages,Study Minutes\n';
    for (const a of activity) {
      csv += `${a.activity_date},"${a.username}",${a.flashcards_reviewed},${a.quizzes_completed},${a.documents_uploaded},${a.chat_messages},${a.study_minutes}\n`;
    }
    res.json({ csv, filename: `activity_export_${new Date().toISOString().split('T')[0]}.csv`, count: activity.length });
  } catch (error) { res.status(500).json({ error: 'Export failed' }); }
});

// ════════════════════════════════════════════════════════════
// ADMIN: LOGIN ACTIVITY
// ════════════════════════════════════════════════════════════

router.get('/admin/login-activity', requireAuth, requireAdmin, (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 50;
    const offset = (page - 1) * limit;
    const db = new Database(DB_PATH);
    const total = db.prepare('SELECT COUNT(*) as count FROM login_activity').get().count;
    const logs = db.prepare(`
      SELECT la.*, u.display_name, u.username
      FROM login_activity la JOIN users u ON la.user_id = u.id
      ORDER BY la.created_at DESC LIMIT ? OFFSET ?
    `).all(limit, offset);
    // IP summary
    const ipSummary = db.prepare(`
      SELECT ip_address, COUNT(*) as count, COUNT(DISTINCT user_id) as unique_users,
        MAX(created_at) as last_seen
      FROM login_activity GROUP BY ip_address ORDER BY count DESC LIMIT 20
    `).all();
    db.close();
    res.json({ logs, total, page, totalPages: Math.ceil(total / limit), ipSummary });
  } catch (error) { res.status(500).json({ error: 'Failed to get login activity' }); }
});

// Track login (called from auth)
router.post('/track-login', requireAuth, (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || 'unknown';
    const userAgent = req.headers['user-agent'] || '';
    const db = new Database(DB_PATH);
    db.prepare('INSERT INTO login_activity (user_id, ip_address, user_agent, success) VALUES (?, ?, ?, 1)').run(req.user.id, ip, userAgent);
    db.close();
    res.json({ success: true });
  } catch { res.json({ success: false }); }
});

// ════════════════════════════════════════════════════════════
// ADMIN: MAINTENANCE MODE
// ════════════════════════════════════════════════════════════

router.get('/system/settings', (req, res) => {
  try {
    const db = new Database(DB_PATH);
    const rows = db.prepare('SELECT key, value FROM system_settings').all();
    db.close();
    const settings = {};
    rows.forEach(r => { try { settings[r.key] = JSON.parse(r.value); } catch { settings[r.key] = r.value; } });
    res.json(settings);
  } catch { res.json({}); }
});

router.put('/admin/system-settings', requireAuth, requireAdmin, (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'Key required' });
    const db = new Database(DB_PATH);
    db.prepare('INSERT INTO system_settings (key, value, updated_by) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP').run(key, JSON.stringify(value), req.user.id);
    db.prepare('INSERT INTO admin_audit_logs (id, admin_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?)').run(uuidv4(), req.user.id, 'update_system_setting', 'setting', key, JSON.stringify({ value }));
    db.close();
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: 'Failed to update setting' }); }
});


// ════════════════════════════════════════════════════════════
// LEARNING PATHS (AI RECOMMENDED)
// ════════════════════════════════════════════════════════════

router.post('/learning-paths', requireAuth, async (req, res) => {
  try {
    const { documentId, language } = req.body;
    if (!documentId) return res.status(400).json({ error: 'Document ID is required' });

    const db = new Database(DB_PATH);
    const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(documentId, req.user.id);
    if (!doc) {
      db.close();
      return res.status(404).json({ error: 'Document not found' });
    }

    // Get text to generate path. Since it might not be in the DB directly, extract from file
    let docText = '';
    if (doc.file_path && fs.existsSync(doc.file_path)) {
      const { processDocument } = await import('../services/documentProcessor.js');
      try {
        docText = await processDocument(doc.file_path);
      } catch (err) {
        console.warn('Could not extract text for learning path:', err.message);
      }
    }
    db.close();

    if (!docText) docText = doc.original_name || 'Tài liệu học tập';

    const { generateLearningPath } = await import('../services/learningPathGenerator.js');
    const prefs = syncExportService.getUserPreferences(req.user.id) || {};
    const resolvedLanguage = normalizeLanguage(language || prefs.language, req.headers['accept-language']);
    const pathData = await generateLearningPath(docText, doc.original_name, {
      userId: req.user.id,
      language: resolvedLanguage,
      acceptLanguage: req.headers['accept-language']
    });

    const pathId = uuidv4();
    const dbWrite = new Database(DB_PATH);

    dbWrite.prepare(`
      INSERT INTO learning_paths (id, user_id, name, description, document_ids, path_data, estimated_hours)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      pathId, req.user.id, pathData.name, pathData.description,
      JSON.stringify([documentId]), JSON.stringify(pathData.steps || []),
      pathData.estimated_hours || 1.0
    );

    const newPath = dbWrite.prepare('SELECT * FROM learning_paths WHERE id = ?').get(pathId);
    dbWrite.close();

    res.json({ learningPath: { ...newPath, steps: pathData.steps || [] } });
  } catch (error) {
    console.error('Generate path error:', error);
    res.status(500).json({ error: 'Failed to generate learning path' });
  }
});

router.get('/learning-paths', requireAuth, (req, res) => {
  try {
    const db = new Database(DB_PATH);
    const paths = db.prepare('SELECT * FROM learning_paths WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);

    // Parse steps
    paths.forEach(p => {
      try { p.steps = JSON.parse(p.path_data || '[]'); } catch { p.steps = []; }
      try { p.document_ids = JSON.parse(p.document_ids || '[]'); } catch { p.document_ids = []; }
      delete p.path_data; // Don't send double data
    });

    db.close();
    res.json({ learningPaths: paths });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get learning paths' });
  }
});

router.get('/learning-paths/:id', requireAuth, (req, res) => {
  try {
    const db = new Database(DB_PATH);
    const lp = db.prepare('SELECT * FROM learning_paths WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);

    if (!lp) {
      db.close();
      return res.status(404).json({ error: 'Learning path not found' });
    }

    try { lp.steps = JSON.parse(lp.path_data || '[]'); } catch { lp.steps = []; }
    try { lp.document_ids = JSON.parse(lp.document_ids || '[]'); } catch { lp.document_ids = []; }
    delete lp.path_data;

    // Get progress
    const progress = db.prepare('SELECT step_id, completed_at FROM learning_path_progress WHERE path_id = ?').all(lp.id);
    lp.progress = progress;

    db.close();
    res.json({ learningPath: lp });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get learning path' });
  }
});

router.put('/learning-paths/:id/progress', requireAuth, (req, res) => {
  try {
    const { stepId, completed } = req.body;
    if (!stepId) return res.status(400).json({ error: 'Step ID required' });

    const db = new Database(DB_PATH);

    // Check ownership
    const lp = db.prepare('SELECT id FROM learning_paths WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!lp) {
      db.close();
      return res.status(404).json({ error: 'Learning path not found' });
    }

    if (completed) {
      db.prepare(`
        INSERT INTO learning_path_progress (id, path_id, step_id, completed_at) 
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(path_id, step_id) DO UPDATE SET completed_at = CURRENT_TIMESTAMP
      `).run(uuidv4(), req.params.id, stepId);
    } else {
      db.prepare('DELETE FROM learning_path_progress WHERE path_id = ? AND step_id = ?').run(req.params.id, stepId);
    }

    // update lp updated_at
    db.prepare('UPDATE learning_paths SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);

    const progress = db.prepare('SELECT step_id, completed_at FROM learning_path_progress WHERE path_id = ?').all(lp.id);
    db.close();

    res.json({ success: true, progress });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

router.delete('/learning-paths/:id', requireAuth, (req, res) => {
  try {
    const db = new Database(DB_PATH);
    const lp = db.prepare('SELECT id FROM learning_paths WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);

    if (!lp) {
      db.close();
      return res.status(404).json({ error: 'Learning path not found' });
    }

    db.prepare('DELETE FROM learning_paths WHERE id = ?').run(req.params.id);
    db.close();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete learning path' });
  }
});

export default router;
