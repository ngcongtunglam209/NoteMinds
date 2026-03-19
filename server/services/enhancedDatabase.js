import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../data/notemind.db');

/**
 * Initialize enhanced database tables for all features
 * - Chat History
 * - Favorites/Bookmarks
 * - Document Tags
 * - Search Index
 * - Analytics
 * - Shared Documents
 * - Flashcard Metrics (Spaced Repetition)
 * - User Preferences
 */
export function initializeEnhancedTables() {
  try {
    const db = new Database(DB_PATH);

    console.log('[Database] Creating enhanced feature tables...');

    // ── Documents (must be created BEFORE tables that reference it) ──
    db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        user_id INTEGER,
        file_path TEXT,
        original_name TEXT,
        file_size INTEGER,
        status TEXT DEFAULT 'processing',
        text_length INTEGER DEFAULT 0,
        deleted_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      CREATE INDEX IF NOT EXISTS idx_documents_user_id 
      ON documents(user_id);

      CREATE INDEX IF NOT EXISTS idx_documents_created_at 
      ON documents(created_at DESC);
    `);
    console.log('  ✓ Documents table created');

    // Migration: add deleted_at column if missing
    const docCols = db.prepare('PRAGMA table_info(documents)').all().map(c => c.name);

    try {
      if (!docCols.includes('deleted_at')) {
        db.exec('ALTER TABLE documents ADD COLUMN deleted_at DATETIME');
        console.log('  ✓ Added deleted_at column to documents');
      }
    } catch (e) { console.error('Error adding deleted_at:', e); }

    try {
      if (!docCols.includes('folder_id')) {
        // Can't add REFERENCES if table folders doesn't exist yet, we'll just add the column
        db.exec('ALTER TABLE documents ADD COLUMN folder_id TEXT');
        console.log('  ✓ Added folder_id column to documents');
      }
    } catch (e) { console.error('Error adding folder_id:', e); }

    try {
      if (!docCols.includes('is_public')) {
        db.exec('ALTER TABLE documents ADD COLUMN is_public INTEGER DEFAULT 0');
        console.log('  ✓ Added is_public column to documents');
      }
    } catch (e) { console.error('Error adding is_public:', e); }

    // ── Folders (Workspaces) ─────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#3b82f6',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_folders_user 
      ON folders(user_id);
    `);
    console.log('  ✓ Folders table created');

    // ── Conversations (Chat History) ─────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        title TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_archived BOOLEAN DEFAULT 0,
        FOREIGN KEY(document_id) REFERENCES documents(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      CREATE INDEX IF NOT EXISTS idx_conversations_document_user 
      ON conversations(document_id, user_id);
      
      CREATE INDEX IF NOT EXISTS idx_conversations_user 
      ON conversations(user_id, updated_at DESC);
    `);
    console.log('  ✓ Conversations table created');

    // ── Conversation Messages (Chat History Detail) ──────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS conversation_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_conv_messages_conversation 
      ON conversation_messages(conversation_id, created_at);
    `);
    console.log('  ✓ Conversation messages table created');

    // ── Favorites (Bookmarks) ────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS favorites (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        document_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
        UNIQUE(user_id, document_id)
      );

      CREATE INDEX IF NOT EXISTS idx_favorites_user 
      ON favorites(user_id, created_at DESC);
    `);
    console.log('  ✓ Favorites table created');

    // ── Tags ─────────────────────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        color TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id),
        UNIQUE(user_id, name)
      );

      CREATE INDEX IF NOT EXISTS idx_tags_user 
      ON tags(user_id);
    `);
    console.log('  ✓ Tags table created');

    // ── Document Tags (Junction Table) ───────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS document_tags (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
        FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE,
        UNIQUE(document_id, tag_id)
      );

      CREATE INDEX IF NOT EXISTS idx_doc_tags_document 
      ON document_tags(document_id);
      
      CREATE INDEX IF NOT EXISTS idx_doc_tags_tag 
      ON document_tags(tag_id);
    `);
    console.log('  ✓ Document tags junction table created');

    // ── Search Index ─────────────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS search_index (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        content_type TEXT,
        searchable_text TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      CREATE INDEX IF NOT EXISTS idx_search_user 
      ON search_index(user_id);
      
      CREATE INDEX IF NOT EXISTS idx_search_type 
      ON search_index(content_type);
    `);
    console.log('  ✓ Search index table created');

    // ── Analytics Log ────────────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS analytics_logs (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        document_id TEXT,
        action TEXT NOT NULL,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_analytics_user_date 
      ON analytics_logs(user_id, created_at DESC);
      
      CREATE INDEX IF NOT EXISTS idx_analytics_action 
      ON analytics_logs(action);
    `);
    console.log('  ✓ Analytics logs table created');

    // ── Shared Documents ─────────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS shared_documents (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        owner_id INTEGER NOT NULL,
        share_token TEXT UNIQUE,
        share_type TEXT DEFAULT 'view',
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
        FOREIGN KEY(owner_id) REFERENCES users(id)
      );

      CREATE INDEX IF NOT EXISTS idx_shared_owner 
      ON shared_documents(owner_id);
      
      CREATE INDEX IF NOT EXISTS idx_shared_token 
      ON shared_documents(share_token);
    `);
    console.log('  ✓ Shared documents table created');

    // ── Shared Document Access Log ───────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS shared_access_logs (
        id TEXT PRIMARY KEY,
        shared_document_id TEXT NOT NULL,
        accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ip_address TEXT,
        user_agent TEXT,
        FOREIGN KEY(shared_document_id) REFERENCES shared_documents(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_access_logs_shared 
      ON shared_access_logs(shared_document_id);
    `);
    console.log('  ✓ Shared access logs table created');

    // ── Flashcard Metrics (Spaced Repetition) ────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS flashcard_metrics (
        id TEXT PRIMARY KEY,
        flashcard_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        document_id TEXT NOT NULL,
        ease_factor REAL DEFAULT 2.5,
        interval INTEGER DEFAULT 1,
        repetitions INTEGER DEFAULT 0,
        next_review_date DATETIME,
        last_review_date DATETIME,
        difficulty_level TEXT DEFAULT 'normal',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
        UNIQUE(flashcard_id, user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_flashcard_metrics_user 
      ON flashcard_metrics(user_id);
      
      CREATE INDEX IF NOT EXISTS idx_flashcard_metrics_next_review 
      ON flashcard_metrics(user_id, next_review_date);
      
      CREATE INDEX IF NOT EXISTS idx_flashcard_metrics_document 
      ON flashcard_metrics(document_id, next_review_date);
    `);
    console.log('  ✓ Flashcard metrics table created');

    // ── Flashcard Review History ─────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS flashcard_reviews (
        id TEXT PRIMARY KEY,
        flashcard_metric_id TEXT NOT NULL,
        quality_grade INTEGER,
        time_elapsed_ms INTEGER,
        reviewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(flashcard_metric_id) REFERENCES flashcard_metrics(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_reviews_metric 
      ON flashcard_reviews(flashcard_metric_id);
      
      CREATE INDEX IF NOT EXISTS idx_reviews_date 
      ON flashcard_reviews(reviewed_at DESC);
    `);
    console.log('  ✓ Flashcard reviews table created');

    // ── User Preferences ─────────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        id TEXT PRIMARY KEY,
        user_id INTEGER UNIQUE NOT NULL,
        offline_sync_enabled BOOLEAN DEFAULT 1,
        auto_save_enabled BOOLEAN DEFAULT 1,
        notification_enabled BOOLEAN DEFAULT 1,
        theme TEXT DEFAULT 'light',
        language TEXT DEFAULT 'en',
        spaced_repetition_enabled BOOLEAN DEFAULT 1,
        daily_goal_cards INTEGER DEFAULT 20,
        email_updates BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      CREATE INDEX IF NOT EXISTS idx_preferences_user 
      ON user_preferences(user_id);
    `);
    console.log('  ✓ User preferences table created');

    // Migration: add email_updates column if missing
    try {
      const prefCols = db.prepare('PRAGMA table_info(user_preferences)').all().map(c => c.name);
      if (!prefCols.includes('email_updates')) {
        db.exec('ALTER TABLE user_preferences ADD COLUMN email_updates BOOLEAN DEFAULT 0');
        console.log('  ✓ Added email_updates column to user_preferences');
      }
    } catch (e) {
      // column already exists
    }

    // ── Sync Queue (for offline sync) ────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        data TEXT,
        synced_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      CREATE INDEX IF NOT EXISTS idx_sync_queue_user_synced 
      ON sync_queue(user_id, synced_at);
    `);
    console.log('  ✓ Sync queue table created');

    // ── Learning Paths (AI Recommendations) ──────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS learning_paths (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        document_ids TEXT,
        path_data TEXT, -- JSON array of steps
        estimated_hours REAL,
        completed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      CREATE INDEX IF NOT EXISTS idx_learning_paths_user 
      ON learning_paths(user_id);
    `);
    console.log('  ✓ Learning paths table created');

    // Migration: add path_data column if missing
    try {
      const lpCols = db.prepare('PRAGMA table_info(learning_paths)').all().map(c => c.name);
      if (!lpCols.includes('path_data')) {
        db.exec('ALTER TABLE learning_paths ADD COLUMN path_data TEXT');
        console.log('  ✓ Added path_data column to learning_paths');
      }
    } catch (e) {
      // ignore
    }
    console.log('  ✓ Learning paths table created');

    // ── Learning Path Progress (per-step completion) ─────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS learning_path_progress (
        id TEXT PRIMARY KEY,
        path_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        document_id TEXT,
        completed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(path_id) REFERENCES learning_paths(id) ON DELETE CASCADE,
        UNIQUE(path_id, step_id)
      );

      CREATE INDEX IF NOT EXISTS idx_lp_progress_path
      ON learning_path_progress(path_id);
    `);
    console.log('  ✓ Learning path progress table created');

    // Migration for older schema where step_id didn't exist
    try {
      const lppCols = db.prepare('PRAGMA table_info(learning_path_progress)').all().map(c => c.name);
      if (!lppCols.includes('step_id')) {
        // Drop the old table and recreate since it's empty in most cases or we can just alter
        db.exec('DROP TABLE learning_path_progress');
        db.exec(`
          CREATE TABLE learning_path_progress (
            id TEXT PRIMARY KEY,
            path_id TEXT NOT NULL,
            step_id TEXT NOT NULL,
            document_id TEXT,
            completed_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(path_id) REFERENCES learning_paths(id) ON DELETE CASCADE,
            UNIQUE(path_id, step_id)
          );
          CREATE INDEX idx_lp_progress_path ON learning_path_progress(path_id);
        `);
        console.log('  ✓ Migrated learning_path_progress to include step_id');
      }
    } catch (e) {
      // ignore
    }
    console.log('  ✓ Learning path progress table created');

    // ── Document Sessions (persist mindmap/flashcard/chat data per doc) ──
    db.exec(`
      CREATE TABLE IF NOT EXISTS document_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id TEXT NOT NULL,
        session_type TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
        UNIQUE(document_id, session_type)
      );

      CREATE INDEX IF NOT EXISTS idx_doc_sessions_document 
      ON document_sessions(document_id);
    `);
    console.log('  ✓ Document sessions table created');

    // ── Quizzes ──────────────────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS quizzes (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_quizzes_document 
      ON quizzes(document_id);
    `);
    console.log('  ✓ Quizzes table created');

    // ── Quiz Attempts ────────────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_quiz_attempts (
        id TEXT PRIMARY KEY,
        quiz_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        document_id TEXT NOT NULL,
        score INTEGER NOT NULL,
        total_questions INTEGER NOT NULL,
        answers_data TEXT NOT NULL,
        completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_doc 
      ON user_quiz_attempts(user_id, document_id);
    `);
    console.log('  ✓ User quiz attempts table created');

    console.log('[Database] ✓ All enhanced tables initialized');

    // ═══════════════════════════════════════════════════
    // NEW FEATURE TABLES (v2)
    // ═══════════════════════════════════════════════════

    // ── Personal Notes / Annotations ────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS document_notes (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        color TEXT DEFAULT '#fbbf24',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_doc_notes_user_doc ON document_notes(user_id, document_id);
    `);
    console.log('  ✓ Document notes table created');

    // ── Community Likes ─────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS community_likes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id),
        UNIQUE(document_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_community_likes_doc ON community_likes(document_id);
      CREATE INDEX IF NOT EXISTS idx_community_likes_user ON community_likes(user_id);
    `);
    console.log('  ✓ Community likes table created');

    // ── Community Comments ──────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS community_comments (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_community_comments_doc ON community_comments(document_id);
    `);
    console.log('  ✓ Community comments table created');

    // ── Announcements (System-wide) ─────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS announcements (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        type TEXT DEFAULT 'info',
        is_active INTEGER DEFAULT 1,
        created_by INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        target_audience TEXT DEFAULT 'registered',
        dismissible INTEGER DEFAULT 1,
        auto_dismiss_days INTEGER,
        link_url TEXT,
        link_text TEXT,
        priority INTEGER DEFAULT 0,
        FOREIGN KEY(created_by) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_active, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_announcements_priority ON announcements(priority DESC, created_at DESC);
    `);

    // Add new columns if they don't exist (for existing databases)
    const columns = db.prepare("PRAGMA table_info(announcements)").all();
    const columnNames = columns.map(c => c.name);
    if (!columnNames.includes('target_audience')) {
      db.exec("ALTER TABLE announcements ADD COLUMN target_audience TEXT DEFAULT 'registered'");
    }
    if (!columnNames.includes('dismissible')) {
      db.exec("ALTER TABLE announcements ADD COLUMN dismissible INTEGER DEFAULT 1");
    }
    if (!columnNames.includes('auto_dismiss_days')) {
      db.exec("ALTER TABLE announcements ADD COLUMN auto_dismiss_days INTEGER");
    }
    if (!columnNames.includes('link_url')) {
      db.exec("ALTER TABLE announcements ADD COLUMN link_url TEXT");
    }
    if (!columnNames.includes('link_text')) {
      db.exec("ALTER TABLE announcements ADD COLUMN link_text TEXT");
    }
    if (!columnNames.includes('priority')) {
      db.exec("ALTER TABLE announcements ADD COLUMN priority INTEGER DEFAULT 0");
    }
    console.log('  ✓ Announcements table created');

    // ── Admin Audit Log ─────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id TEXT PRIMARY KEY,
        admin_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT,
        target_id TEXT,
        details TEXT,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(admin_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_audit_admin ON admin_audit_logs(admin_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_action ON admin_audit_logs(action, created_at DESC);
    `);
    console.log('  ✓ Admin audit logs table created');

    // ── User Learning Goals ─────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        daily_flashcards INTEGER DEFAULT 20,
        daily_quizzes INTEGER DEFAULT 3,
        daily_documents INTEGER DEFAULT 2,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );
    `);
    console.log('  ✓ User goals table created');

    // ── User Streaks ────────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_streaks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        current_streak INTEGER DEFAULT 0,
        longest_streak INTEGER DEFAULT 0,
        last_activity_date TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );
    `);
    console.log('  ✓ User streaks table created');

    // ── Daily Activity Log (for streak/goal tracking) ───
    db.exec(`
      CREATE TABLE IF NOT EXISTS daily_activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        activity_date TEXT NOT NULL,
        flashcards_reviewed INTEGER DEFAULT 0,
        quizzes_completed INTEGER DEFAULT 0,
        documents_uploaded INTEGER DEFAULT 0,
        chat_messages INTEGER DEFAULT 0,
        study_minutes INTEGER DEFAULT 0,
        FOREIGN KEY(user_id) REFERENCES users(id),
        UNIQUE(user_id, activity_date)
      );
      CREATE INDEX IF NOT EXISTS idx_daily_activity_user ON daily_activity(user_id, activity_date DESC);
    `);
    console.log('  ✓ Daily activity table created');

    // ── Announcement Read Tracking ──────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS announcement_reads (
        user_id INTEGER NOT NULL,
        announcement_id TEXT NOT NULL,
        read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(user_id, announcement_id),
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(announcement_id) REFERENCES announcements(id) ON DELETE CASCADE
      );
    `);
    console.log('  ✓ Announcement reads table created');

    // ── AI Usage Logs ───────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_usage_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT NOT NULL,
        model TEXT,
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        latency_ms INTEGER DEFAULT 0,
        success INTEGER DEFAULT 1,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage_logs(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ai_usage_action ON ai_usage_logs(action, created_at DESC);
    `);
    console.log('  ✓ AI usage logs table created');

    // ── Content Reports (Moderation) ────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS content_reports (
        id TEXT PRIMARY KEY,
        reporter_id INTEGER NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        details TEXT,
        status TEXT DEFAULT 'pending',
        reviewed_by INTEGER,
        reviewed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(reporter_id) REFERENCES users(id),
        FOREIGN KEY(reviewed_by) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_reports_status ON content_reports(status, created_at DESC);
    `);
    console.log('  ✓ Content reports table created');

    // ── Feature Flags ───────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS feature_flags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        enabled INTEGER DEFAULT 1,
        plans TEXT DEFAULT '["free","basic","pro","unlimited"]',
        updated_by INTEGER,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(updated_by) REFERENCES users(id)
      );
    `);
    console.log('  ✓ Feature flags table created');

    // ── System Settings (maintenance mode, etc.) ────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_by INTEGER,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('  ✓ System settings table created');

    // ── Login Activity ──────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS login_activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        country TEXT,
        city TEXT,
        success INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_login_activity_user ON login_activity(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_login_activity_ip ON login_activity(ip_address, created_at DESC);
    `);
    console.log('  ✓ Login activity table created');

    // ── Email Blast Log ─────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS email_blasts (
        id TEXT PRIMARY KEY,
        subject TEXT NOT NULL,
        content TEXT NOT NULL,
        target_filter TEXT DEFAULT 'all',
        total_recipients INTEGER DEFAULT 0,
        sent_count INTEGER DEFAULT 0,
        failed_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        sent_by INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        FOREIGN KEY(sent_by) REFERENCES users(id)
      );
    `);
    console.log('  ✓ Email blasts table created');

    console.log('[Database] ✓ All v3 admin feature tables initialized');
    db.close();
    return true;

  } catch (error) {
    console.error('[Database] Error creating enhanced tables:', error.message);
    return false;
  }
}

export default {
  initializeEnhancedTables
};
